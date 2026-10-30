// 道具與職業技能的腳本（效果原語表達不了的部分）。資料在 src/shared/content/items.ts、classAbilities.ts。
//
// 需要每 tick 處理的裝置（哨戟、感應器、力場、再生器、實驗電容、帽子）由 itemRuntime(g) 第一次被呼叫時
// 註冊到 g.systems；所有道具 script、立即生效商品、傷害 hook 與道具相關指令都會先呼叫它，
// 所以不需要 setup 額外接線（setup 若想提早啟用，可以在開局直接呼叫 itemRuntime(g)）。
import { regScript, runEffects, SCRIPTS, type EffectCtx, type ScriptFn } from '../systems/effects'
import { damage, heal, DAMAGE_HOOKS } from '../systems/damage'
import { applyBuff, hasBuff, removeBuff, removeBuffsWhere } from '../systems/buffs'
import { dropOnGround, giveItem, makeItem } from '../systems/items'
import { INSTANT_ITEMS, initVendor, updateVendorView, type StockState } from '../systems/vendors'
import { EXTRA_COMMANDS, issue } from '../systems/orders'
import { inAttackRange, isHostile } from '../systems/combat'
import { canSeeStealth } from '../systems/vision'
import { BUFFS, ITEMS, UNITS, itemDef, unitDef } from '../../shared/content/registry'
import { FRAG_BLAST, GRENADE_FUSE, MODULE_TARGET, RUMMAGE_TABLE } from '../../shared/content/items'
import { DOOR_HACK_SECONDS, DOOR_REACH } from '../../shared/content/classAbilities'
import { NEUTRAL, type Ent } from '../ent'
import type { Game } from '../game'
import { SPACE_ZONE } from '../world'

// ───────── 數值（公尺／秒；原作 world units ÷ 100）─────────

export const FUSION_DELAY = 3
export const FUSION_INNER = 2.5
export const FUSION_OUTER = 5.5
export const FUSION_CORE = 5000
export const FUSION_EDGE = 200
/** 炸毀可破壞物（瓦礫、門）的半徑 */
export const FUSION_DESTRUCT = 4
export const EMP_VENDOR_OFF = 120
export const SENTRY_DEPLOY = 5
export const SENSOR_R = 3.25
export const SENSOR_COOLDOWN = 4
export const BARRIER_R = 3.5
export const BARRIER_LIFE = 60
export const BEACON_R = 4.5
export const BEACON_LIFE = 90
export const BEACON_PCT = 0.02
export const TRACKER_R = 80
export const TRACKER_PING = 8
export const TRACKER_REVEAL_R = 6
export const TRACKER_REVEAL = 10
export const CAPACITOR_BONUS = 150
export const REVIVE_WINDOW = 45
export const PORTAL_DELAY = 3
export const PORTAL_R = 4
export const POD_PREP = 4
export const POD_COOLDOWN = 100
export const RESOLVER_BOOT = 10
const SING_LIFE = 8
const SING_R = 8
const SING_CORE = 1.5
const SING_DPS = 150
const SING_TICK = 0.1
const BURST_COUNT = 6
const BURST_R = 3
/** 重力推拉：質量 100 時初速 2.5 m/s，約位移 1 m（研究 03 §4.8）*/
const GRAV_BASE = 2.5
const GRAV_DECAY = 2.4

/** 攜帶時同步到 u.buffs 的道具 buff（讓別人看得到帽子、讓 AI 讀得到薰香）*/
const CARRY_BUFFS: [string, string][] = [
  ['pirateHat', 'bf.pirateHat'],
  ['festiveHat', 'bf.festiveHat'],
  ['calmingIncense', 'bf.calming'],
]

// ───────── 每局 runtime ─────────

interface ItemRuntime {
  sentries: Set<number>
  sensors: Set<number>
  barriers: Set<number>
  beacons: Set<number>
  hostileFn: ((a: Ent, b: Ent) => boolean) | null
  /** 救生艙每位玩家的冷卻到期 */
  podCd: Map<number, number>
}

const RUNTIME = new WeakMap<Game, ItemRuntime>()

/** 取得（必要時建立並註冊）這一局的道具 runtime */
export function itemRuntime(g: Game): ItemRuntime {
  const have = RUNTIME.get(g)
  if (have) return have
  const created: ItemRuntime = {
    sentries: new Set(),
    sensors: new Set(),
    barriers: new Set(),
    beacons: new Set(),
    hostileFn: null,
    podCd: new Map(),
  }
  RUNTIME.set(g, created)
  g.systems.push({ name: 'items', fn: (gg) => stepItemRuntime(gg, created) })
  // 保險：還沒初始化庫存的販賣機（setup 沒呼叫 initVendor 時）在這裡補上
  for (const e of g.world.ents.values()) if (e.data.vendor && !e.data.stock) initVendor(g, e)
  return created
}

function stepItemRuntime(g: Game, rt: ItemRuntime): void {
  const t = g.time
  const tick = g.world.tick
  // 哨戟：部署完成、放掉打不到的目標（靜止砲塔不會追，否則會卡在舊目標上）
  for (const id of rt.sentries) {
    const s = g.world.get(id)
    if (!s || !s.alive) {
      rt.sentries.delete(id)
      continue
    }
    if (s.data.armAt && t >= s.data.armAt) {
      s.data.armAt = 0
      s.data.frozen = false
      say(g, s, 'item.sentryOnline')
    }
    const o = s.order
    if (o && o.k === 'attack') {
      const tg = o.e ? g.world.get(o.e) : undefined
      if (!tg || !tg.alive || tg.zone !== s.zone || tg.stats.stealth || !isHostile(g, s, tg) || !inAttackRange(g, s, tg)) {
        s.order = null
        s.queue.length = 0
        s.anim = 0
      }
    }
  }
  // 動作感應器
  if (tick % 5 === 0) {
    for (const id of rt.sensors) {
      const s = g.world.get(id)
      if (!s || !s.alive) {
        rt.sensors.delete(id)
        continue
      }
      if (s.owner < 0 || t < ((s.data.alertReady as number | undefined) ?? 0)) continue
      for (const u of g.world.query(s.zone, s.x, s.y, SENSOR_R)) {
        if (u === s || !u.alive || u.owner === s.owner || u.def.speed <= 0) continue
        if (u.tags.has('noTarget') || u.tags.has('corpse') || u.tags.has('structure')) continue
        if (Math.hypot(u.x - s.x, u.y - s.y) > SENSOR_R) continue
        s.data.alertReady = t + SENSOR_COOLDOWN
        g.privateLine(s.owner, 'item.sensorAlert')
        g.emitFx({ k: 'ping', z: s.zone, x: s.x, y: s.y, v: SENSOR_COOLDOWN, s: 'sensor' }, [s.owner])
        break
      }
    }
  }
  if (tick % 10 === 0) {
    // 力場：範圍內所有玩家單位受到的傷害減半（不分身分）
    for (const id of rt.barriers) {
      const b = g.world.get(id)
      if (!b || !b.alive) {
        rt.barriers.delete(id)
        continue
      }
      for (const u of g.world.query(b.zone, b.x, b.y, BARRIER_R)) {
        if (!u.alive || u.owner < 0 || u.tags.has('structure') || u.tags.has('noTarget') || u.tags.has('corpse')) continue
        applyBuff(g, u, 'bf.forceWard', 0.75, b)
      }
    }
    syncCarried(g)
  }
  // 醫療再生器：每秒回復 2% 最大生命
  if (tick % 20 === 0) {
    for (const id of rt.beacons) {
      const b = g.world.get(id)
      if (!b || !b.alive) {
        rt.beacons.delete(id)
        continue
      }
      let any = false
      for (const u of g.world.query(b.zone, b.x, b.y, BEACON_R)) {
        if (!u.alive || u.owner < 0 || u.tags.has('structure') || u.tags.has('noTarget') || u.tags.has('corpse')) continue
        if (heal(g, u, u.maxHp * BEACON_PCT) > 0) any = true
      }
      if (any) g.emitFx({ k: 'heal', z: b.zone, x: b.x, y: b.y, e: b.id, v: BEACON_R })
    }
  }
}

/** 實驗電容（最大能量）與攜帶型 buff 的同步 */
function syncCarried(g: Game): void {
  for (const u of g.world.ents.values()) {
    if (!u.alive) continue
    const had = (u.data.capBonus as number | undefined) ?? 0
    if (!u.inv && !had) continue
    const want = u.inv?.some((it) => it?.id === 'protoCapacitor') ? CAPACITOR_BONUS : 0
    // morph（換裝、變形）會把 maxMp 重設成 def.mp
    const reset = had > 0 && u.maxMp === u.def.mp
    if (want !== had || (reset && want > 0)) {
      const base = reset ? u.def.mp : u.maxMp - had
      u.maxMp = Math.max(0, base + want)
      u.mp = Math.min(u.mp, u.maxMp)
      u.data.capBonus = want || undefined
    }
    if (!u.inv) continue
    for (const [item, buff] of CARRY_BUFFS) {
      const has = u.inv.some((it) => it?.id === item)
      const on = hasBuff(u, buff)
      if (has && !on) applyBuff(g, u, buff, undefined, u)
      else if (!has && on) removeBuff(g, u, buff)
    }
  }
}

/** 哨戟的敵意：不辨身分，除了放置者以外的玩家單位都打（含其他人的裝置）*/
function sentryWants(a: Ent, b: Ent): boolean {
  const owner = a.data.sentryOwner as number | undefined
  if (owner === undefined || b.owner < 0 || b.owner === owner) return false
  if (b.tags.has('noTarget') || b.tags.has('corpse') || b.tags.has('invuln') || b.stats.invuln) return false
  if (b.tags.has('structure') && !b.tags.has('device')) return false
  if (b.data.item) return false
  return true
}

/** 把哨戟的敵意串接到 g.customHostile（保留其他系統原本的判定）*/
function chainHostile(g: Game, rt: ItemRuntime): void {
  if (rt.hostileFn && g.customHostile === rt.hostileFn) return
  const prev = g.customHostile
  const fn = (a: Ent, b: Ent): boolean => sentryWants(a, b) || (prev ? prev(a, b) : false)
  rt.hostileFn = fn
  g.customHostile = fn
}

// ───────── 共用工具 ─────────

function say(g: Game, u: Ent, key: string, args?: Record<string, string | number>): void {
  if (u.owner >= 0 && g.players[u.owner]) g.privateLine(u.owner, key, args)
}

let abilityToItem: Map<string, string> | null = null
function itemUsing(abilityId: string): string | undefined {
  if (!abilityToItem) {
    abilityToItem = new Map()
    for (const d of ITEMS.values()) if (d.use && !abilityToItem.has(d.use)) abilityToItem.set(d.use, d.id)
  }
  return abilityToItem.get(abilityId)
}

/** 施放失敗：退還冷卻、能量與被扣掉的道具充能（原作「找不到目標則返還次數」）*/
function refund(g: Game, ctx: EffectCtx): void {
  const u = ctx.caster
  const ab = ctx.ability
  if (!ab) return
  u.cds.delete(ab.sharedCd ?? ab.id)
  u.mp = Math.min(u.maxMp, u.mp + ab.mana)
  const slot = ctx.itemSlot ?? -1
  if (slot < 0 || !u.inv || slot >= u.inv.length) return
  const it = u.inv[slot]
  if (it) {
    const d = itemDef(it.id)
    if (d && d.use === ab.id && d.charges > 0) it.charges++
    return
  }
  const id = itemUsing(ab.id)
  const d = id ? itemDef(id) : undefined
  if (id && d && d.charges > 0) {
    u.inv[slot] = makeItem(id, 1)
    u.statsDirty = true
  }
}

/** 在目標點附近找空地放一個屬於施放者的裝置 */
function placeDevice(g: Game, ctx: EffectCtx, defId: string): Ent | null {
  const u = ctx.caster
  const z = g.world.zones[ctx.zone]
  if (!z) return null
  let px = ctx.x
  let py = ctx.y
  if (z.nav) {
    const n = z.nav.nearestOpen(px, py, undefined, 2)
    if (!n) return null
    px = n.x
    py = n.y
  }
  const e = g.world.spawn(unitDef(defId), ctx.zone, px, py, u.owner)
  e.master = u.id
  e.anon = u.anon
  e.facing = u.facing
  g.emitFx({ k: 'deploy', z: ctx.zone, x: px, y: py, e: e.id, s: defId })
  return e
}

/** 電子學博士：自建裝置 +50 HP */
function deviceHpBonus(g: Game, u: Ent, e: Ent): void {
  const p = u.owner >= 0 ? g.players[u.owner] : undefined
  if (p?.phd !== 'electronics') return
  const bonus = Number(BUFFS.get('cls.phd.electronics')?.flags?.deviceHp ?? 50)
  e.maxHp += bonus
  e.hp += bonus
}

function doorsNear(g: Game, zone: number, x: number, y: number, r: number): number[] {
  const z = g.world.zones[zone]
  if (!z?.layout) return []
  const out: number[] = []
  for (const d of z.layout.doors) {
    const st = z.doors[d.index]
    if (!st || st.broken) continue
    if ((d.x - x) ** 2 + (d.y - y) ** 2 > (r + d.width / 2) ** 2) continue
    out.push(d.index)
  }
  return out
}

function doorFx(g: Game, zone: number, index: number, locked: boolean): void {
  const d = g.world.zones[zone]?.layout?.doors[index]
  if (d) g.emitFx({ k: 'doorLock', z: zone, x: d.x, y: d.y, v: locked ? 1 : 0 })
}

/** 別人眼中這個單位叫什麼（匿名、偽裝都要遮）*/
function shownName(t: Ent): { name: string; def: string } {
  const fake = t.data.fake as { def?: string; name?: string } | undefined
  if (fake) return { name: fake.name ?? '', def: fake.def ?? t.def.id }
  return { name: t.anon ? '' : t.name, def: (t.data.viewDef as string | undefined) ?? t.def.id }
}

/** 這一區內、距離 r 以內有在操控單位的玩家槽位 */
function slotsNear(g: Game, zone: number, x: number, y: number, r: number): number[] {
  const out: number[] = []
  for (const p of g.allPlayers()) {
    const c = g.controlOf(p)
    if (c && c.zone === zone && Math.hypot(c.x - x, c.y - y) <= r) out.push(p.slot)
  }
  return out
}

function openNear(g: Game, zone: number, x: number, y: number, spread: number): { x: number; y: number } {
  const z = g.world.zones[zone]
  const a = g.world.rng.range(0, Math.PI * 2)
  const r = spread > 0 ? g.world.rng.range(0, spread) : 0
  let px = x + Math.cos(a) * r
  let py = y + Math.sin(a) * r
  if (z?.nav) {
    const n = z.nav.nearestOpen(px, py, undefined, 4) ?? z.nav.nearestOpen(x, y, undefined, 6)
    if (n) {
      px = n.x
      py = n.y
    }
  }
  return { x: px, y: py }
}

/** 委派給其他系統註冊的 script；回傳是否有人處理 */
function delegate(g: Game, name: string, ctx: EffectCtx, p: Record<string, number | string | boolean> = {}): boolean {
  const fn = SCRIPTS.get(name) as ((...a: Parameters<ScriptFn>) => unknown) | undefined
  if (!fn) return false
  return fn(g, ctx, p) !== false
}

/** 從使用中的格子拿走道具（充能 0 的道具不會被施法系統消耗，需要自己移除）*/
function takeUsedItem(g: Game, ctx: EffectCtx, id: string) {
  const u = ctx.caster
  const slot = ctx.itemSlot ?? -1
  const it = slot >= 0 ? u.inv?.[slot] : null
  if (!it || it.id !== id) return null
  u.inv![slot] = null
  u.statsDirty = true
  g.onItemLost?.(u, it)
  return it
}

// ───────── 傷害 hook：重症維生系統、救生艙準備 ─────────

/** 致命傷時由重症維生系統搶救；回傳是否救回 */
export function criticalRescue(g: Game, u: Ent): boolean {
  if (!u.inv) return false
  let slot = u.inv.findIndex((it) => it?.id === 'criticalCare')
  let hp = 150
  if (slot < 0) {
    slot = u.inv.findIndex((it) => it?.id === 'criticalCareDamaged')
    hp = 1
  }
  if (slot < 0) return false
  const it = u.inv[slot]!
  it.charges--
  if (it.charges <= 0) {
    u.inv[slot] = null
    u.statsDirty = true
    g.onItemLost?.(u, it)
  }
  u.hp = Math.min(u.maxHp, hp)
  applyBuff(g, u, 'bf.criticalCare', undefined, u)
  g.emitFx({ k: 'revive', z: u.zone, x: u.x, y: u.y, e: u.id })
  say(g, u, 'item.criticalCare')
  return true
}

// damage() 先跑 hooks 才判定死亡，所以在這裡把血量拉回來就不會死
DAMAGE_HOOKS.push((g, _src, t, amount, o) => {
  itemRuntime(g)
  if (t.data.podPrepUntil && t.data.podPrepUntil > g.time) t.data.podDmg = ((t.data.podDmg as number | undefined) ?? 0) + amount
  if (t.hp > 0 || o.lethal || !t.inv || !t.alive) return
  criticalRescue(g, t)
})

// 道具相關指令先確保 runtime 存在（撿到實驗電容、買東西時）
for (const k of ['use', 'buy', 'pickup', 'give']) {
  const orig = EXTRA_COMMANDS.get(k)
  if (!orig) continue
  EXTRA_COMMANDS.set(k, (g, p, u, c) => {
    itemRuntime(g)
    orig(g, p, u, c)
  })
}

// ───────── 醫療 ─────────

regScript('item.antibody', (g, ctx) => {
  itemRuntime(g)
  const u = ctx.caster
  // 帶原觸發器（研究 02 §8：抗體包會移除）
  removeBuffsWhere(g, u, (d) => !!d.flags?.carrier)
  // 寄生／朊毒 → 受控（保留原本的施放者，讓感染方仍看得到）。另一位同事的 buff 不存在時就跳過。
  for (const b of [...u.buffs]) {
    const inf = BUFFS.get(b.id)?.infection
    if (inf !== 'parasite' && inf !== 'prion') continue
    const contained = inf === 'parasite' ? 'bf.containedParasite' : 'bf.containedPrion'
    const { src, srcSlot } = b
    removeBuff(g, u, b.id)
    // 先套受控、再套免疫（免疫會擋下所有感染類 buff）
    const nb = applyBuff(g, u, contained, undefined, null)
    if (nb) {
      nb.src = src
      nb.srcSlot = srcSlot
    }
  }
  applyBuff(g, u, 'bf.antibody', undefined, u)
  say(g, u, 'item.antibody')
})

regScript('item.regenBeacon', (g, ctx) => {
  const rt = itemRuntime(g)
  const e = placeDevice(g, ctx, 'dev.regenBeacon')
  if (!e) {
    refund(g, ctx)
    say(g, ctx.caster, 'item.deployFail')
    return
  }
  e.lifeEnd = g.time + BEACON_LIFE
  e.solidBody = false
  rt.beacons.add(e.id)
})

regScript('item.rapidRevive', (g, ctx) => {
  itemRuntime(g)
  const u = ctx.caster
  let best: Ent | null = null
  let bestD = Infinity
  for (const c of g.world.query(ctx.zone, ctx.x, ctx.y, 1.8)) {
    if (!c.tags.has('corpse') || !c.data.wasMain || c.removed) continue
    const p = g.players[c.data.slot as number]
    if (!p || p.alive || p.stayDead) continue
    if (g.time - c.bornAt > REVIVE_WINDOW) continue
    // 只救人形遺體（著裝或未著裝的人員）
    if (!UNITS.get(c.data.of as string)?.tags.includes('personnel')) continue
    const d = Math.hypot(c.x - ctx.x, c.y - ctx.y)
    if (d < bestD) {
      bestD = d
      best = c
    }
  }
  if (!best) {
    refund(g, ctx)
    say(g, u, 'item.reviveFail')
    return
  }
  const slot = best.data.slot as number
  const at = { zone: best.zone, x: best.x, y: best.y }
  // 復活由身分系統實作（g.revivePlayer → rolesApi）；舊介面 g.revive 也接受
  const gx = g as Game & { revive?: (slot: number) => Ent | null | undefined }
  const nu: Ent | null | undefined = g.revivePlayer(slot, at, 'personnel', 0.5) ?? gx.revive?.(slot)
  if (!nu) {
    refund(g, ctx)
    say(g, u, 'item.reviveUnavailable')
    return
  }
  if (!best.removed) g.world.remove(best)
  const p = g.players[slot]
  g.emitFx({ k: 'revive', z: at.zone, x: at.x, y: at.y, e: nu.id })
  say(g, u, 'item.reviveOk', { name: p?.name ?? '' })
  if (p) g.privateLine(p.slot, 'item.revived')
})

regScript('item.tetracyne', (g, ctx) => {
  const u = ctx.caster
  if (!u.tags.has('personnel')) {
    say(g, u, 'item.tetraNothing')
    return
  }
  const doses = ((u.data.tetraDoses as number | undefined) ?? 0) + 1
  u.data.tetraDoses = doses
  if (doses <= 5) {
    const add = u.def.hp * 0.08
    u.data.hpMult = ((u.data.hpMult as number | undefined) ?? 1) + 0.08
    u.maxHp += add
    u.hp += add
    say(g, u, 'item.tetraDose', { n: doses })
  } else say(g, u, 'item.tetraMaxed')
  const risk = Math.min(0.9, 0.12 * (doses - 1))
  if (doses < 2 || !g.world.rng.chance(risk)) return
  switch (g.world.rng.int(1, 4)) {
    case 1:
      applyBuff(g, u, 'bf.tetraDizzy', undefined, null)
      say(g, u, 'item.tetraDizzy')
      break
    case 2:
      u.data.blindMult = ((u.data.blindMult as number | undefined) ?? 1) * 0.85
      say(g, u, 'item.tetraBlind')
      break
    case 3:
      applyBuff(g, u, 'bf.itemStun', 6, null)
      say(g, u, 'item.tetraComa')
      break
    default:
      say(g, u, 'item.tetraHeart')
      damage(g, null, u, u.maxHp * 0.6, { pure: true, srcSlot: u.owner, quiet: false })
  }
})

regScript('item.hormone', (g, ctx) => {
  const u = ctx.caster
  const add = u.def.hp * 0.25
  u.data.hpMult = ((u.data.hpMult as number | undefined) ?? 1) + 0.25
  u.maxHp += add
  u.hp += add
  // 不要直接 push：data.passives 可能引用職業表的陣列
  u.data.passives = [...((u.data.passives as string[] | undefined) ?? []), 'bf.hormoneSide']
  u.statsDirty = true
  say(g, u, 'item.hormone')
})

// ───────── 機動、隱匿 ─────────

regScript('item.phaseCloak', (g, ctx) => {
  const u = ctx.caster
  applyBuff(g, u, 'bf.cloak.phase', undefined, u)
  u.statsDirty = true
  g.emitFx({ k: 'cloak', z: u.zone, x: u.x, y: u.y, e: u.id })
  // 看不見隱形的人失去目標
  for (const e of g.world.ents.values()) {
    if (e.order?.k !== 'attack' || e.order.e !== u.id) continue
    const p = e.owner >= 0 ? g.players[e.owner] : undefined
    if (p && canSeeStealth(g, p, u)) continue
    e.order = null
    e.queue.length = 0
  }
})

regScript('item.wrench', (g, ctx) => {
  const u = ctx.caster
  const t = ctx.target
  if (!t) return
  const it = takeUsedItem(g, ctx, 'wrench')
  const zone = u.zone
  const speed = 14
  const flight = Math.hypot(t.x - u.x, t.y - u.y) / speed
  g.emitFx({ k: 'proj', z: zone, x: u.x, y: u.y, x2: t.x, y2: t.y, e: u.id, e2: t.id, v: speed, s: 'wrench' })
  g.after(flight, () => {
    const hit = t.alive && !t.removed && t.zone === zone
    const src = u.removed ? null : u
    if (hit) {
      damage(g, src, t, g.world.rng.range(15, 25), { srcSlot: u.owner, ability: 'ab.item.wrench' })
      applyBuff(g, t, 'bf.itemStun', 0.5, src)
    }
    if (it) {
      dropOnGround(g, zone, hit ? t.x : ctx.x, hit ? t.y : ctx.y, it)
      say(g, u, 'item.wrenchLost')
    }
  })
})

// ───────── 門 ─────────

regScript('item.keycard', (g, ctx, p) => {
  const u = ctx.caster
  const z = g.world.zones[u.zone]
  const captain = p.card === 'captain'
  if (captain && z.key !== 'bravado') {
    say(g, u, 'item.captainOnly')
    return
  }
  let idx = doorsNear(g, u.zone, u.x, u.y, DOOR_REACH)
  // 艦長卡只管保全門（站上沒有標記保全門時視為全部都是）
  if (captain && z.doors.some((d) => d.security)) idx = idx.filter((i) => z.doors[i].security)
  if (!idx.length) {
    say(g, u, 'item.noDoor')
    return
  }
  let locked = 0
  let unlocked = 0
  for (const i of idx) {
    const d = z.doors[i]
    if (d.locked) {
      d.locked = false
      unlocked++
    } else {
      d.locked = true
      locked++
    }
    d.lockUntil = 0
    doorFx(g, u.zone, i, d.locked)
  }
  if (locked) say(g, u, 'item.doorLocked', { n: locked })
  if (unlocked) say(g, u, 'item.doorUnlocked', { n: unlocked })
})

regScript('cls.doorHack', (g, ctx) => {
  const u = ctx.caster
  const z = g.world.zones[u.zone]
  const idx = doorsNear(g, u.zone, u.x, u.y, DOOR_REACH).filter((i) => !z.doors[i].locked)
  if (!idx.length) {
    refund(g, ctx)
    say(g, u, 'item.noDoor')
    return
  }
  for (const i of idx) {
    z.doors[i].locked = true
    z.doors[i].lockUntil = g.time + DOOR_HACK_SECONDS
    doorFx(g, u.zone, i, true)
  }
  say(g, u, 'item.doorHacked', { n: idx.length })
})

regScript('cls.rummage', (g, ctx) => {
  const u = ctx.caster
  const t = ctx.target
  if (!t || !t.alive || t.def.id !== 'struct.rummage') return
  g.emitFx({ k: 'rummage', z: t.zone, x: t.x, y: t.y, e: t.id })
  g.killEnt(t, null, -1)
  const id = RUMMAGE_TABLE[g.world.rng.int(1, 28)]
  if (id && itemDef(id)) {
    giveItem(g, u, makeItem(id))
    say(g, u, 'item.rummageFound', { item: id })
  } else say(g, u, 'item.rummageEmpty')
})

// ───────── 爆裂物 ─────────

regScript('item.fusionPlant', (g, ctx) => {
  itemRuntime(g)
  const u = ctx.caster
  const bomb = placeDevice(g, ctx, 'dev.fusionCharge')
  if (!bomb) {
    refund(g, ctx)
    say(g, u, 'item.deployFail')
    return
  }
  bomb.data.blowAt = g.time + FUSION_DELAY
  g.emitFx({ k: 'fusionArm', z: bomb.zone, x: bomb.x, y: bomb.y, e: bomb.id, v: FUSION_DELAY })
  say(g, u, 'item.fusionArmed')
  g.after(FUSION_DELAY, () => {
    // 炸彈在倒數中被打壞就不會爆
    if (bomb.alive && !bomb.removed) fusionBlast(g, bomb)
  })
})

/** 熱融炸彈爆炸（研究 02 §9.2）：2.5 m 內 5200、5.5 m 內 200；4 m 內瓦礫與門全毀；噴出 28 塊瓦礫 */
export function fusionBlast(g: Game, bomb: Ent): void {
  const { zone, x, y } = bomb
  const src = g.world.get(bomb.master) ?? null
  const srcSlot = bomb.owner
  g.world.remove(bomb)
  g.emitFx({ k: 'fusion', z: zone, x, y, v: FUSION_OUTER })
  const near = slotsNear(g, zone, x, y, 18)
  if (near.length) g.emitFx({ k: 'shake', z: zone, x, y, v: 1 }, near)
  for (const t of g.world.query(zone, x, y, FUSION_OUTER)) {
    if (!t.alive || t.removed || t.tags.has('noTarget') || t.tags.has('corpse')) continue
    const d = Math.hypot(t.x - x, t.y - y)
    if (t.tags.has('rubble')) {
      if (d <= FUSION_DESTRUCT) damage(g, src, t, 1e6, { pure: true, srcSlot, quiet: true })
      continue
    }
    if (d > FUSION_OUTER + t.radius) continue
    const amount = FUSION_EDGE + (d <= FUSION_INNER + t.radius ? FUSION_CORE : 0)
    damage(g, src, t, amount, { kind: 'fire', srcSlot, ability: 'ab.item.fusion' })
  }
  g.damageDoorsNear(zone, x, y, FUSION_DESTRUCT, 5000)
  g.spawnRubble(zone, x, y, 6, FUSION_INNER)
  g.spawnRubble(zone, x, y, 8, FUSION_DESTRUCT)
  g.spawnRubble(zone, x, y, 14, 8)
}

regScript('item.burstSplit', (g, ctx) => {
  const z = g.world.zones[ctx.zone]
  g.emitFx({ k: 'boom', z: ctx.zone, x: ctx.x, y: ctx.y, v: 0.6 })
  for (let i = 0; i < BURST_COUNT; i++) {
    const a = g.world.rng.range(0, Math.PI * 2)
    const r = g.world.rng.range(1, BURST_R)
    let tx = ctx.x + Math.cos(a) * r
    let ty = ctx.y + Math.sin(a) * r
    if (z?.nav) {
      const n = z.nav.nearestOpen(tx, ty, undefined, 3)
      if (n) {
        tx = n.x
        ty = n.y
      }
    }
    const speed = 6
    const d = Math.hypot(tx - ctx.x, ty - ctx.y)
    g.emitFx({ k: 'proj', z: ctx.zone, x: ctx.x, y: ctx.y, x2: tx, y2: ty, v: speed, s: 'grenade' })
    const snap: EffectCtx = { caster: ctx.caster, x: tx, y: ty, zone: ctx.zone, ability: ctx.ability }
    g.after(d / speed + GRENADE_FUSE, () => runEffects(g, snap, FRAG_BLAST))
  }
})

/** 電磁脈衝（研究 03 §4.8）：能量減 (r−d)×62.5、短暫沉默、販賣機與控制台停機 120 秒 */
regScript('item.empBurst', (g, ctx, p) => {
  const r = Number(p.r) || 2.5
  for (const t of g.world.query(ctx.zone, ctx.x, ctx.y, r)) {
    if (!t.alive || t.removed || t.tags.has('noTarget') || t.tags.has('corpse')) continue
    const d = Math.max(0, Math.hypot(t.x - ctx.x, t.y - ctx.y) - t.radius)
    if (d > r) continue
    if (t.maxMp > 0) t.mp = Math.max(0, t.mp - (r - d) * 62.5)
    if (!t.tags.has('structure')) applyBuff(g, t, 'bf.empSilence', undefined, ctx.caster.removed ? null : ctx.caster)
    if (t.data.vendor || t.tags.has('vendor') || t.tags.has('console')) {
      t.data.disabledUntil = Math.max((t.data.disabledUntil as number | undefined) ?? 0, g.time + EMP_VENDOR_OFF)
      if (t.data.stock) updateVendorView(g, t)
      if (t.tags.has('console')) delegate(g, 'console.emp', { caster: ctx.caster, target: t, x: t.x, y: t.y, zone: t.zone }, { dur: EMP_VENDOR_OFF })
    }
  }
})

regScript('item.debris', (g, ctx) => {
  const u = ctx.caster
  const zone = ctx.zone
  const { x, y } = ctx
  const speed = 7
  const delay = (Math.hypot(x - u.x, y - u.y) / speed) * g.world.rng.range(0.8, 1.2)
  g.emitFx({ k: 'proj', z: zone, x: u.x, y: u.y, x2: x, y2: y, e: u.id, v: speed, s: 'debris' })
  g.after(delay, () => {
    const src = u.removed ? null : u
    for (const t of g.world.query(zone, x, y, 1)) {
      if (t.alive && !t.removed && t.tags.has('rubble')) damage(g, src, t, 750, { pure: true, srcSlot: u.owner, quiet: true })
    }
    g.damageDoorsNear(zone, x, y, 1, 750)
    g.emitFx({ k: 'boom', z: zone, x, y, v: 1 })
  })
})

regScript('item.singularity', (g, ctx) => {
  const u = ctx.caster
  const { zone, x, y } = ctx
  const obj = g.world.spawn(unitDef('dev.singularity'), zone, x, y, u.owner)
  obj.data.zoneObj = true
  obj.lifeEnd = g.time + SING_LIFE
  obj.anon = u.anon
  g.emitFx({ k: 'void', z: zone, x, y, v: SING_LIFE })
  const srcSlot = u.owner
  let n = 0
  const pulse = () => {
    n++
    const src = u.removed ? null : u
    for (const t of g.world.query(zone, x, y, SING_R)) {
      if (!t.alive || t.removed || t.tags.has('noTarget') || t.tags.has('corpse') || t.tags.has('structure') || t.def.speed <= 0) continue
      const dx = x - t.x
      const dy = y - t.y
      const d = Math.hypot(dx, dy) || 0.001
      if (d > SING_R) continue
      const v = 1 + 3 * (1 - d / SING_R)
      t.vx = (dx / d) * v
      t.vy = (dy / d) * v
      t.data.vDecay = 6
      if (d <= SING_CORE) damage(g, src, t, SING_DPS * SING_TICK, { pure: true, dot: true, kind: 'chaos', srcSlot })
    }
    if (n * SING_TICK < SING_LIFE) g.after(SING_TICK, pulse)
  }
  g.after(SING_TICK, pulse)
})

// ───────── 裝置 ─────────

regScript('item.camera', (g, ctx) => {
  itemRuntime(g)
  const e = placeDevice(g, ctx, 'dev.camera')
  if (!e) {
    refund(g, ctx)
    say(g, ctx.caster, 'item.deployFail')
    return
  }
  e.solidBody = false
})

regScript('item.motionSensor', (g, ctx) => {
  const rt = itemRuntime(g)
  const e = placeDevice(g, ctx, 'dev.motionSensor')
  if (!e) {
    refund(g, ctx)
    say(g, ctx.caster, 'item.deployFail')
    return
  }
  e.solidBody = false
  rt.sensors.add(e.id)
})

regScript('item.sentry', (g, ctx) => {
  const rt = itemRuntime(g)
  const u = ctx.caster
  const e = placeDevice(g, ctx, 'dev.sentry')
  if (!e) {
    refund(g, ctx)
    say(g, u, 'item.deployFail')
    return
  }
  e.data.sentryOwner = u.owner
  e.data.frozen = true
  e.data.armAt = g.time + SENTRY_DEPLOY
  e.acquire = true
  deviceHpBonus(g, u, e)
  rt.sentries.add(e.id)
  chainHostile(g, rt)
  say(g, u, 'item.sentryDeploying')
})

regScript('item.forceBarrier', (g, ctx) => {
  const rt = itemRuntime(g)
  const u = ctx.caster
  const e = placeDevice(g, ctx, 'dev.forceBarrier')
  if (!e) {
    refund(g, ctx)
    say(g, u, 'item.deployFail')
    return
  }
  e.lifeEnd = g.time + BARRIER_LIFE
  deviceHpBonus(g, u, e)
  rt.barriers.add(e.id)
})

regScript('item.portalPlant', (g, ctx) => {
  itemRuntime(g)
  const u = ctx.caster
  const dev = placeDevice(g, ctx, 'dev.protoPortal')
  if (!dev) {
    refund(g, ctx)
    say(g, u, 'item.deployFail')
    return
  }
  say(g, u, 'item.portalArmed')
  g.emitFx({ k: 'portalCharge', z: dev.zone, x: dev.x, y: dev.y, e: dev.id, v: PORTAL_DELAY })
  g.after(PORTAL_DELAY, () => {
    if (!dev.alive || dev.removed) return
    const { zone, x, y } = dev
    g.world.remove(dev)
    const dest = portalDestination(g)
    if (!dest) {
      say(g, u, 'item.portalFail')
      g.emitFx({ k: 'boom', z: zone, x, y, v: 0.5 })
      return
    }
    for (const t of g.world.query(zone, x, y, PORTAL_R)) {
      if (!t.alive || t.removed || t.owner === NEUTRAL || t.def.speed <= 0) continue
      if (t.tags.has('structure') || t.tags.has('noTarget') || t.tags.has('corpse')) continue
      if (Math.hypot(t.x - x, t.y - y) > PORTAL_R + t.radius) continue
      const p = openNear(g, dest.zone, dest.x, dest.y, 1.5)
      g.emitFx({ k: 'blink', z: t.zone, x: t.x, y: t.y, x2: p.x, y2: p.y, e: t.id })
      g.world.relocate(t, dest.zone, p.x, p.y)
      t.order = null
      t.queue.length = 0
      t.cast = null
    }
  })
})

/** 實驗傳送裝置的落點：女帝號的傳送工廠旁（站被毀就沒有）*/
function portalDestination(g: Game): { zone: number; x: number; y: number } | null {
  const z = g.world.zoneByKey('nyx')
  if (!z || !z.alive) return null
  for (const e of g.world.inZone(z.id)) if (e.data.vendor === 'teleportFactory' && e.alive) return { zone: z.id, x: e.x, y: e.y }
  const s = z.layout?.spawns[0]
  return s ? { zone: z.id, x: s.x, y: s.y } : null
}

// ───────── 偵查 ─────────

regScript('item.tracker', (g, ctx) => {
  const u = ctx.caster
  const slot = u.owner
  if (slot < 0) return
  let n = 0
  for (const e of g.world.inZone(ctx.zone)) {
    if (e === u || !e.alive || e.owner === slot || e.def.speed <= 0) continue
    if (e.tags.has('noTarget') || e.tags.has('corpse') || e.tags.has('structure')) continue
    const d = Math.hypot(e.x - u.x, e.y - u.y)
    if (d > TRACKER_R) continue
    // 只送位置，不帶實體 id（避免 client 對照出匿名單位）
    g.emitFx({ k: 'ping', z: e.zone, x: e.x, y: e.y, v: TRACKER_PING, s: 'tracker' }, [slot])
    n++
    if (e.stats.stealth && d <= TRACKER_REVEAL_R) e.data.revealedUntil = Math.max((e.data.revealedUntil as number | undefined) ?? 0, g.time + TRACKER_REVEAL)
  }
  g.privateLine(slot, 'item.trackerPing', { n })
})

regScript('item.invScan', (g, ctx) => {
  const u = ctx.caster
  const t = ctx.target
  if (!t || u.owner < 0) return
  const items = (t.inv ?? []).filter((it) => !!it).map((it) => it!.id)
  const who = shownName(t)
  if (items.length) g.privateLine(u.owner, 'item.scanResult', { name: who.name, def: who.def, items: items.join(','), n: items.length })
  else g.privateLine(u.owner, 'item.scanEmpty', { name: who.name, def: who.def })
  g.emitFx({ k: 'scan', z: t.zone, x: t.x, y: t.y }, [u.owner])
  if (t.isMain && t.owner >= 0 && t.owner !== u.owner) g.privateLine(t.owner, 'item.scanned')
})

regScript('item.holo', (g, ctx) => {
  const u = ctx.caster
  const t = ctx.target ?? u
  if (t.tags.has('structure') || !t.alive) {
    refund(g, ctx)
    say(g, u, 'item.holoFail')
    return
  }
  const side = t.facing + Math.PI / 2
  const p = openNear(g, t.zone, t.x + Math.cos(side) * 1.2, t.y + Math.sin(side) * 1.2, 0)
  const h = g.world.spawn(t.def, t.zone, p.x, p.y, u.owner)
  // 別人看到的外觀：照目標「在別人眼中」的樣子（匿名就匿名、偽裝就複製偽裝）
  const fake = (t.data.fake as { def: string; owner: number; name: string; color: number; cls: string } | undefined) ?? {
    def: (t.data.viewDef as string | undefined) ?? t.def.id,
    owner: t.anon ? -1 : t.owner,
    name: t.anon ? '' : t.name,
    color: t.anon ? -1 : t.color,
    cls: t.anon ? '' : t.classId,
  }
  h.illusion = true
  h.anon = true
  h.data.fake = { ...fake }
  h.data.viewDef = fake.def
  h.name = fake.name
  h.color = fake.color
  h.classId = fake.cls
  h.facing = t.facing
  h.maxHp = t.maxHp
  h.hp = t.hp
  h.acquire = false
  h.data.noDrops = true
  // 不留屍體（死亡 hook 以 converted 判斷）
  h.data.converted = true
  h.data.holo = true
  if (t.inv && h.inv) for (let i = 0; i < h.inv.length; i++) h.inv[i] = t.inv[i] ? makeItem(t.inv[i]!.id, t.inv[i]!.charges) : null
  applyBuff(g, h, 'bf.holo', undefined, u)
  g.emitFx({ k: 'holo', z: h.zone, x: h.x, y: h.y, e: h.id })
})

regScript('item.geneSampler', (g, ctx) => {
  // GIT 流程（研究 02 §7）由驗血系統以 regScript('git.draw') 實作
  if (!delegate(g, 'git.draw', ctx)) say(g, ctx.caster, 'item.notYet')
})

regScript('item.gitResolver', (g, ctx) => {
  if (delegate(g, 'git.deploy', ctx)) return
  // 預設實作：在地上放一台屬於使用者的解析器（販賣機），開機 10 秒後開始提供檢測報告
  const it = ctx.itemSlot !== undefined && ctx.itemSlot >= 0 ? ctx.caster.inv?.[ctx.itemSlot] : null
  if (!it || it.id !== 'gitResolver') return
  const e = placeDevice(g, ctx, 'dev.gitResolver')
  if (!e) {
    say(g, ctx.caster, 'item.deployFail')
    return
  }
  takeUsedItem(g, ctx, 'gitResolver')
  e.data.vendor = 'gitResolver'
  e.data.sample = it.data ?? {}
  e.data.sampleUid = it.uid
  initVendor(g, e)
  for (const s of (e.data.stock as StockState[] | undefined) ?? []) {
    s.count = 0
    s.started = false
    s.availAt = g.time + RESOLVER_BOOT
    s.nextAt = s.availAt
  }
  updateVendorView(g, e)
})

// ───────── 工具 ─────────

function massOf(t: Ent): number {
  if (typeof t.data.mass === 'number') return t.data.mass
  if (t.tags.has('cage')) return 25
  if (t.tags.has('cocoon')) return 2000
  if (t.tags.has('boss')) return 1000
  if (t.tags.has('egg')) return 400
  if (t.tags.has('chassis')) return 330
  if (t.tags.has('drone')) return 130
  return 100
}

regScript('item.grav', (g, ctx, p) => {
  const u = ctx.caster
  const t = ctx.target
  if (!t || t === u) {
    refund(g, ctx)
    return
  }
  const fixed = t.tags.has('console') || t.tags.has('station') || t.tags.has('ship') || (t.tags.has('structure') && !t.tags.has('cage')) || !!t.data.item
  if (fixed) {
    say(g, u, 'item.gravNoEffect')
    return
  }
  const v = (GRAV_BASE * 100) / massOf(t)
  const dx = t.x - u.x
  const dy = t.y - u.y
  const d = Math.hypot(dx, dy) || 1
  const sgn = Number(p.dir) >= 0 ? 1 : -1
  t.vx += (dx / d) * v * sgn
  t.vy += (dy / d) * v * sgn
  t.data.vDecay = GRAV_DECAY
  g.emitFx({ k: 'grav', z: u.zone, x: u.x, y: u.y, x2: t.x, y2: t.y, e: u.id, e2: t.id, v: sgn })
})

regScript('item.interfaceKit', (g, ctx) => {
  const u = ctx.caster
  const t = ctx.target
  if (!t || t.def.id !== 'struct.consoleBroken') {
    refund(g, ctx)
    say(g, u, 'item.interfaceKitFail')
    return
  }
  if (!delegate(g, 'console.rebuild', ctx)) {
    // 預設實作：原地換回完好的控制台（保留 POI 資料）
    const c = g.world.spawn(unitDef('struct.console'), t.zone, t.x, t.y, NEUTRAL)
    c.facing = t.facing
    for (const [k, v] of Object.entries(t.data)) if (!k.startsWith('_')) c.data[k] = v
    g.world.remove(t)
  }
  g.emitFx({ k: 'deploy', z: t.zone, x: t.x, y: t.y, s: 'struct.console' })
  say(g, u, 'item.interfaceKitDone')
})

regScript('item.module', (g, ctx) => {
  const u = ctx.caster
  const it = ctx.itemSlot !== undefined && ctx.itemSlot >= 0 ? u.inv?.[ctx.itemSlot] : null
  const fn = it ? MODULE_TARGET[it.id] : undefined
  if (!fn || !delegate(g, fn, ctx, { item: it!.id })) say(g, u, 'item.notYet')
})

regScript('item.memoryCore', (g, ctx) => {
  if (!delegate(g, 'android.memoryCore', ctx)) say(g, ctx.caster, 'item.notYet')
})

regScript('item.remote', (g, ctx) => {
  if (!delegate(g, 'android.remote', ctx)) say(g, ctx.caster, 'item.notYet')
})

regScript('item.wormBait', (g, ctx) => {
  const u = ctx.caster
  const bait = g.world.spawn(unitDef('dev.wormBait'), ctx.zone, ctx.x, ctx.y, u.owner)
  bait.data.zoneObj = true
  bait.lifeEnd = g.time + 20
  for (const t of g.world.query(ctx.zone, ctx.x, ctx.y, 12)) {
    if (!t.alive || !t.tags.has('animal')) continue
    // AI 系統可讀 data.bait 決定要不要繼續湊過去
    t.data.bait = { x: ctx.x, y: ctx.y, until: g.time + 20 }
    issue(t, { k: 'move', x: ctx.x, y: ctx.y })
  }
  say(g, u, 'item.wormBait')
})

// ───────── 立即生效的商品 ─────────

INSTANT_ITEMS.set('radarPing', (g, buyer, vendor) => {
  itemRuntime(g)
  const slot = buyer.owner
  if (slot < 0) return false
  let n = 0
  const z = g.world.zones[vendor.zone]
  if (z?.key === 'minertha') {
    // 地表掃描：該區所有非中立、非敵對的單位
    for (const e of g.world.inZone(vendor.zone)) {
      if (e === buyer || !e.alive || e.owner < 0 || e.tags.has('structure') || e.tags.has('noTarget') || e.def.speed <= 0) continue
      g.emitFx({ k: 'ping', z: e.zone, x: e.x, y: e.y, v: 7, s: 'radar' }, [slot])
      n++
    }
    g.privateLine(slot, 'item.radarPlanet', { n })
    return true
  }
  // 宙域掃描：所有不在太空中的玩家主單位
  for (const p of g.allPlayers()) {
    if (!p.alive || p.slot === slot) continue
    const m = g.mainOf(p)
    if (!m || !m.alive || m.zone === SPACE_ZONE) continue
    g.emitFx({ k: 'ping', z: m.zone, x: m.x, y: m.y, v: 7, s: 'radar' }, [slot])
    n++
  }
  g.privateLine(slot, 'item.radarSector', { n })
  return true
})

INSTANT_ITEMS.set('escapePass', (g, buyer) => {
  const rt = itemRuntime(g)
  const slot = buyer.owner
  const p = slot >= 0 ? g.players[slot] : undefined
  if (!p || !buyer.isMain) return false
  if (!SCRIPTS.has('pod.launch')) {
    g.privateLine(slot, 'item.podUnavailable')
    return false
  }
  const left = (rt.podCd.get(slot) ?? 0) - g.time
  if (left > 0) {
    g.privateLine(slot, 'item.podCooldown', { s: Math.ceil(left) })
    return false
  }
  if (hasBuff(buyer, 'bf.evolving') || buyer.tags.has('cocoon')) return false
  rt.podCd.set(slot, g.time + POD_COOLDOWN)
  const ox = buyer.x
  const oy = buyer.y
  buyer.data.podPrepUntil = g.time + POD_PREP + 0.5
  buyer.data.podDmg = 0
  g.privateLine(slot, 'item.podPrep')
  g.emitFx({ k: 'castStart', z: buyer.zone, x: buyer.x, y: buyer.y, e: buyer.id, s: 'escapePass', v: POD_PREP }, [slot])
  let n = 0
  const check = () => {
    if (!buyer.alive || buyer.removed) return
    const moved = Math.hypot(buyer.x - ox, buyer.y - oy) >= 0.9
    if (moved || ((buyer.data.podDmg as number | undefined) ?? 0) >= 35) {
      buyer.data.podPrepUntil = 0
      g.privateLine(slot, 'item.podFail')
      return
    }
    if (++n < POD_PREP * 10) {
      g.after(0.1, check)
      return
    }
    buyer.data.podPrepUntil = 0
    delegate(g, 'pod.launch', { caster: buyer, x: buyer.x, y: buyer.y, zone: buyer.zone }, { hpPct: buyer.hp / buyer.maxHp })
  }
  g.after(0.1, check)
  return true
})

INSTANT_ITEMS.set('testResults', (g, buyer, vendor) => {
  if (delegate(g, 'git.results', { caster: buyer, target: vendor, x: vendor.x, y: vendor.y, zone: vendor.zone })) return true
  say(g, buyer, 'item.notYet')
  return false
})

INSTANT_ITEMS.set('gravField', (g, buyer, vendor) => {
  if (delegate(g, 'grav.correction', { caster: buyer, target: vendor, x: vendor.x, y: vendor.y, zone: vendor.zone })) return true
  say(g, buyer, 'item.notYet')
  return false
})
