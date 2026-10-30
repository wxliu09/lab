// 防護服技能腳本（內容定義在 src/shared/content/suits.ts）。
// 效果原語表達不了的部分：特斯拉蓄電放電、雷暴電擊、地面危害、汲取器、幻影分身與換位、暗物質相位、
// 輻射外洩、遙控雷、機槍架設、脈衝連射衰減、力場極性、磁力裝金屬塊與碎片、能量庫。
import type { Ent } from '../ent'
import type { Game } from '../game'
import { UNITS } from '../../shared/content/registry'
import { regScript, runEffects, type EffectCtx } from '../systems/effects'
import { DAMAGE_HOOKS, DEATH_HOOKS, damage, heal } from '../systems/damage'
import { applyBuff, getBuff, hasBuff, removeBuff } from '../systems/buffs'
import { removeSuit } from '../systems/items'
import { spawnProjectile } from '../systems/projectiles'
import { EXTRA_COMMANDS } from '../systems/orders'

type P = Record<string, number | string | boolean>

const num = (p: P, k: string, d = 0): number => (p[k] === undefined ? d : Number(p[k]))

// ───────── 共用小工具 ─────────

/** 可以被技能波及的單位（活著、可被選取、不是屍體／建築）*/
function hittable(t: Ent): boolean {
  return t.alive && !t.removed && !t.tags.has('noTarget') && !t.tags.has('corpse') && !t.tags.has('structure') && !t.tags.has('invuln')
}

function los(g: Game, zone: number, x0: number, y0: number, x1: number, y1: number): boolean {
  const nav = g.world.zones[zone]?.nav
  return !nav || nav.los(x0, y0, x1, y1, true)
}

/** 最近的可走點（落在牆裡的投射物、生成點）*/
function openPoint(g: Game, zone: number, x: number, y: number): { x: number; y: number } {
  const nav = g.world.zones[zone]?.nav
  return (nav && nav.nearestOpen(x, y)) || { x, y }
}

/** 由施放者生成一個附屬單位（召喚物、裝置、地面物件）*/
function spawnOwned(g: Game, caster: Ent, defId: string, x: number, y: number, life: number): Ent | null {
  const def = UNITS.get(defId)
  if (!def) return null
  const pt = openPoint(g, caster.zone, x, y)
  const e = g.world.spawn(def, caster.zone, pt.x, pt.y, caster.owner)
  e.master = caster.id
  e.anon = caster.anon
  e.facing = caster.facing
  if (life > 0) e.lifeEnd = g.time + life
  return e
}

/** 「同時只能有一個」：記在施放者身上，新的出現時舊的消失（安靜移除，不觸發爆炸等死亡效果）*/
function replaceOne(g: Game, caster: Ent, key: string, e: Ent | null): void {
  const old = g.world.get(caster.data[key] as number)
  if (old && old !== e) g.world.remove(old)
  caster.data[key] = e?.id ?? 0
}

/** 施放者身旁（面向的側邊）一點 */
function beside(u: Ent, d = 0.9): { x: number; y: number } {
  return { x: u.x + Math.cos(u.facing + Math.PI / 2) * d, y: u.y + Math.sin(u.facing + Math.PI / 2) * d }
}

/** 技能已扣能量與冷卻但無法生效：退還 */
function refund(g: Game, ctx: EffectCtx, why = 'target'): void {
  const ab = ctx.ability
  const u = ctx.caster
  if (ab) {
    u.mp = Math.min(u.maxMp, u.mp + ab.mana)
    u.cds.delete(ab.sharedCd ?? ab.id)
  }
  g.castFail(u, why)
}

/** 結束施放者目前的引導 */
function stopChannel(u: Ent): void {
  u.cast = null
  u.anim = 0
  if (u.order?.k === 'cast') u.order = u.queue.shift() ?? null
}

function zap(g: Game, from: Ent, to: Ent, look: string): void {
  g.emitFx({ k: 'atk', z: from.zone, x: from.x, y: from.y, x2: to.x, y2: to.y, e: from.id, e2: to.id, s: look })
}

// ───────── 每局的 suits 系統（輻射外洩、跨服裝殘留狀態清理）─────────

/** 只對特定著裝單位有意義的自身狀態；換掉／脫下那套服裝時移除 */
const SELF_STATE: Record<string, string> = {
  'bf.tesla.charged': 'suit.tesla',
  'bf.gatling.setup': 'suit.gatling',
  'bf.force.pull': 'suit.force',
}

const installed = new WeakSet<Game>()

/**
 * 引擎目前沒有「被動技能的週期效果」與「穿上防護服」的掛勾，所以第一次有人穿脫防護服、
 * 或場上第一次發生傷害、或任何防護服腳本執行時，把 suits 系統掛進這一局的 g.systems。
 */
export function ensureSuitSystem(g: Game): void {
  if (installed.has(g)) return
  installed.add(g)
  g.systems.push({ name: 'suits', fn: stepSuits })
}

function stepSuits(g: Game): void {
  const tick = g.world.tick
  if (tick % 10 !== 0) return
  const leak = tick % 20 === 0
  for (const u of g.world.ents.values()) {
    if (!u.alive) continue
    if (u.buffs.length) for (const id in SELF_STATE) if (u.def.id !== SELF_STATE[id] && hasBuff(u, id)) removeBuff(g, u, id)
    // 輻射外洩（被動）：每秒對周圍所有其他單位施加輻射灼傷
    if (leak && u.abilities.includes('ab.rad.leak')) hazardAround(g, u, u, 'bf.rad.sick', 5, 'suit.rad', false)
  }
}

/** 套用期間的 buff 到中心周圍的單位；spare：該 def 的單位免疫；self：連施放者一起 */
function hazardAround(g: Game, center: Ent, src: Ent, buff: string, r: number, spare: string, self: boolean): void {
  for (const t of g.world.query(center.zone, center.x, center.y, r)) {
    if (t === center || !hittable(t)) continue
    if (t === src && !self) continue
    if (spare && t.def.id === spare) continue
    if (!los(g, center.zone, center.x, center.y, t.x, t.y)) continue
    applyBuff(g, t, buff, undefined, src)
  }
}

// 穿上防護服只能透過 'use' 指令：包一層，穿脫後確保 suits 系統存在並清掉上一套的殘留狀態
const baseUse = EXTRA_COMMANDS.get('use')
if (baseUse) {
  EXTRA_COMMANDS.set('use', (g, p, u, c) => {
    const before = u.def.id
    baseUse(g, p, u, c)
    if (u.def.id !== before) suitChanged(g, u)
  })
}

function suitChanged(g: Game, u: Ent): void {
  ensureSuitSystem(g)
  for (const id in SELF_STATE) if (u.def.id !== SELF_STATE[id]) removeBuff(g, u, id)
}

regScript('suit.drop', (g, ctx) => {
  if (removeSuit(g, ctx.caster)) suitChanged(g, ctx.caster)
})

// ───────── 地面物件與危害 ─────────

/** 在目標點放地面物件；p.buff 掛在物件上（週期效果寫在 buff 的 tickEffects）*/
regScript('rig.field', (g, ctx, p) => {
  ensureSuitSystem(g)
  const o = spawnOwned(g, ctx.caster, String(p.obj), ctx.x, ctx.y, num(p, 'life', 10))
  if (!o) return
  o.data.zoneObj = true
  if (p.buff) applyBuff(g, o, String(p.buff), undefined, ctx.caster)
})

/** 地面危害的每次跳動：ctx.target 是地面物件（buff 的承載者）*/
regScript('rig.hazard', (g, ctx, p) => {
  const center = ctx.target ?? ctx.caster
  hazardAround(g, center, ctx.caster, String(p.buff), num(p, 'r', 1), String(p.spare ?? ''), !!p.self)
})

/** 推開（或拉近）單位：from 施放者；polarity=true 時依力場裝的極性決定方向 */
regScript('rig.shove', (_g, ctx, p) => {
  const t = ctx.target
  const u = ctx.caster
  if (!t || t === u || !t.alive || t.tags.has('structure') || t.def.speed <= 0) return
  const pull = p.pull === true || (p.polarity === true && hasBuff(u, 'bf.force.pull'))
  const dx = t.x - u.x
  const dy = t.y - u.y
  const d = Math.hypot(dx, dy) || 1
  const v = num(p, 'dist', 1.5) * 5 * (pull ? -1 : 1)
  t.vx += (dx / d) * v
  t.vy += (dy / d) * v
  t.data.vDecay = 5
})

// ───────── 特斯拉裝 ─────────

/** 普攻命中：若電容飽和，追加放電 */
regScript('tesla.discharge', (g, ctx, p) => {
  const u = ctx.caster
  const t = ctx.target
  if (!t || !t.alive || !hasBuff(u, 'bf.tesla.charged')) return
  removeBuff(g, u, 'bf.tesla.charged')
  damage(g, u, t, num(p, 'bonus', 200), { kind: 'energy', ability: 'ab.tesla.charge' })
  zap(g, u, t, 'lightning')
})

/** 雷暴每次跳動：電擊最近的單位（特斯拉裝絕緣；隱形單位不會被鎖定）*/
regScript('tesla.stormZap', (g, ctx, p) => {
  const storm = ctx.target
  if (!storm) return
  const r = num(p, 'r', 3.5)
  let best: Ent | null = null
  let bestD = Infinity
  for (const t of g.world.query(storm.zone, storm.x, storm.y, r)) {
    if (t === storm || !hittable(t) || t.def.id === 'suit.tesla' || t.stats.stealth) continue
    const d = (t.x - storm.x) ** 2 + (t.y - storm.y) ** 2
    if (d >= bestD || !los(g, storm.zone, storm.x, storm.y, t.x, t.y)) continue
    bestD = d
    best = t
  }
  if (!best) return
  damage(g, ctx.caster, best, num(p, 'dmg', 30), { kind: 'energy', ability: 'ab.tesla.storm' })
  zap(g, storm, best, 'lightning')
})

// ───────── 電漿裝 ─────────

/** 電漿彈對減速中的目標追加傷害 */
regScript('plasma.sear', (g, ctx, p) => {
  const t = ctx.target
  if (!t || !t.alive || t.def.speed <= 0) return
  if (t.stats.speed < t.def.speed * 0.99) damage(g, ctx.caster, t, num(p, 'bonus', 6), { kind: 'energy' })
})

regScript('plasma.drainer', (g, ctx, p) => {
  const u = ctx.caster
  const t = ctx.target
  if (!t) return
  const at = beside(u, 0.8)
  const dev = spawnOwned(g, u, 'rig.drainer', at.x, at.y, num(p, 'life', 30))
  if (!dev) return
  replaceOne(g, u, 'plasmaDrainer', dev)
  applyBuff(g, t, 'bf.plasma.drain', num(p, 'life', 30), u, { dev: dev.id })
  g.emitFx({ k: 'beam', z: u.zone, x: dev.x, y: dev.y, x2: t.x, y2: t.y, e: dev.id, e2: t.id, s: 'plasma' })
})

regScript('plasma.drainTick', (g, ctx, p) => {
  const t = ctx.target
  const b = ctx.buff
  if (!t || !b) return
  const dev = g.world.get(b.data?.dev as number)
  const r = num(p, 'r', 6)
  const ok = dev && dev.alive && dev.zone === t.zone && (dev.x - t.x) ** 2 + (dev.y - t.y) ** 2 <= (r + t.radius) ** 2 && los(g, t.zone, dev.x, dev.y, t.x, t.y)
  if (!ok) {
    removeBuff(g, t, 'bf.plasma.drain')
    if (dev) g.world.remove(dev)
    return
  }
  // 施放者已不在場時 buff 的 caster 會退回承載者本身：改算在汲取器頭上
  const src = ctx.caster === t ? dev : ctx.caster
  damage(g, src, t, num(p, 'dmg', 10), { kind: 'energy', dot: true, srcSlot: b.srcSlot, ability: 'ab.plasma.drain' })
  g.emitFx({ k: 'beam', z: t.zone, x: dev.x, y: dev.y, x2: t.x, y2: t.y, e: dev.id, e2: t.id, s: 'plasma' })
})

// ───────── 暗物質裝 ─────────

/** 相位漩渦：燒能量並造成等量傷害 */
regScript('void.burn', (g, ctx, p) => {
  const r = num(p, 'r', 2.5)
  const burn = num(p, 'burn', 50)
  for (const t of g.world.query(ctx.zone, ctx.x, ctx.y, r)) {
    if (t === ctx.caster || !hittable(t) || t.maxMp <= 0) continue
    const take = Math.min(burn, t.mp)
    if (take <= 0) continue
    t.mp -= take
    damage(g, ctx.caster, t, take, { kind: 'energy', ability: 'ab.void.vortex' })
  }
  g.emitFx({ k: 'voidBurst', z: ctx.zone, x: ctx.x, y: ctx.y, v: r })
})

const PHASE_MANA = 15
const PHASE_DUR = 1
DAMAGE_HOOKS.push((g, _src, t, amount, o) => {
  ensureSuitSystem(g)
  // 相位轉移（被動）：受到非持續傷害時自動相位化
  if (o.dot || amount <= 0 || !t.alive || !t.abilities.includes('ab.void.phase')) return
  if ((t.cds.get('ab.void.phase') ?? 0) > g.time || t.mp < PHASE_MANA) return
  t.mp -= PHASE_MANA
  t.cds.set('ab.void.phase', g.time + 8)
  applyBuff(g, t, 'bf.void.phase', PHASE_DUR, t)
  g.emitFx({ k: 'phaseShift', z: t.zone, x: t.x, y: t.y, e: t.id })
})

// ───────── 幻影裝 ─────────

regScript('mirage.double', (g, ctx, p) => {
  const u = ctx.caster
  const at = beside(u, 0.9)
  const d = spawnOwned(g, u, u.def.id, at.x, at.y, num(p, 'life', 30))
  if (!d) return
  replaceOne(g, u, 'mirageDouble', d)
  d.illusion = true
  d.name = u.name
  d.color = u.color
  d.classId = u.classId
  d.hp = Math.max(1, d.maxHp * (u.hp / u.maxHp))
  d.mp = u.mp
  // 外觀偽裝也一併複製（例如變形者的假身分）
  if (u.data.viewDef) d.data.viewDef = u.data.viewDef
  if (u.data.fake) d.data.fake = u.data.fake
  // 分身的子彈只是光影：換成傷害為 0 的普攻（id 不變，外觀與攻擊特效照舊）。
  // 不用 dmgMult 0：recomputeStats 會略過值為 0 的倍率。
  if (u.def.attack) d.def = { ...u.def, attack: { ...u.def.attack, dmg: [0, 0], onHit: undefined } }
  d.abilities = []
  d.inv = null
  d.acquire = true
  // 消失時不留屍體、不掉落任何東西
  d.data.noDrops = true
  d.data.converted = true
  d.data.illusionOf = u.id
  applyBuff(g, d, 'bf.mirage.illusion', undefined, u)
  d.order = { k: 'amove', x: ctx.x, y: ctx.y }
  g.emitFx({ k: 'mirage', z: u.zone, x: d.x, y: d.y, e: d.id })
})

regScript('mirage.swap', (g, ctx) => {
  const u = ctx.caster
  const d = g.world.get(u.data.mirageDouble as number)
  if (!d || !d.alive || d.zone !== u.zone) {
    refund(g, ctx)
    return
  }
  swapPlaces(g, u, d)
})

function swapPlaces(g: Game, a: Ent, b: Ent): void {
  const ax = a.x
  const ay = a.y
  const af = a.facing
  g.emitFx({ k: 'blink', z: a.zone, x: ax, y: ay, x2: b.x, y2: b.y, e: a.id })
  g.emitFx({ k: 'blink', z: b.zone, x: b.x, y: b.y, x2: ax, y2: ay, e: b.id })
  g.world.relocate(a, a.zone, b.x, b.y)
  g.world.relocate(b, b.zone, ax, ay)
  a.facing = b.facing
  b.facing = af
  a.order = null
}

// ───────── 輻射裝 ─────────

regScript('rad.overload', (g, ctx, p) => {
  const u = ctx.caster
  const x = u.x
  const y = u.y
  damage(g, u, u, num(p, 'self', 150), { kind: 'energy', pure: true, ability: 'ab.rad.overload' })
  runEffects(g, { ...ctx, x, y }, [{ k: 'script', fn: 'rig.field', p: { obj: 'rig.radZone', life: num(p, 'life', 60), buff: 'bf.rad.fallout' } }])
  g.emitFx({ k: 'radBurst', z: ctx.zone, x, y, v: 4 })
})

// ───────── 遙控雷（特務裝、機槍裝）─────────

function rdgList(g: Game, u: Ent): number[] {
  const list = ((u.data.rdgs as number[] | undefined) ?? []).filter((id) => g.world.get(id)?.alive)
  u.data.rdgs = list
  return list
}

regScript('rig.rdgToss', (g, ctx, p) => {
  const u = ctx.caster
  ensureSuitSystem(g)
  const pending = (u.data.rdgPending as number | undefined) ?? 0
  if (rdgList(g, u).length + pending >= num(p, 'max', 4)) {
    refund(g, ctx)
    return
  }
  u.data.rdgPending = pending + 1
  spawnProjectile(g, { caster: u, zone: u.zone, x: u.x, y: u.y, tx: ctx.x, ty: ctx.y, speed: 12, fx: 'grenade', onHit: [{ k: 'script', fn: 'rig.rdgLand' }], ability: ctx.ability })
})

regScript('rig.rdgLand', (g, ctx) => {
  const u = ctx.caster
  u.data.rdgPending = Math.max(0, ((u.data.rdgPending as number | undefined) ?? 1) - 1)
  const r = spawnOwned(g, u, 'rig.rdg', ctx.x, ctx.y, 0)
  if (!r) return
  r.data.ghost = true // 不擋路
  rdgList(g, u).push(r.id)
})

regScript('rig.rdgDetonate', (g, ctx) => {
  const u = ctx.caster
  const list = rdgList(g, u)
  u.data.rdgs = []
  for (const id of list) {
    const r = g.world.get(id)
    if (r && r.alive) g.killEnt(r, u)
  }
})

/** 遙控雷死亡（被引爆或被打壞）就爆炸：1.25 m 內 75、1.75 m 內 50，連投擲者也會受傷 */
function rdgBlast(g: Game, r: Ent): void {
  const src = g.world.get(r.master) ?? r
  runEffects(g, { caster: src, x: r.x, y: r.y, zone: r.zone }, [
    { k: 'damage', amount: 50, to: 'point', aoe: 1.75, kind: 'blast', noSelf: false },
    { k: 'damage', amount: 25, to: 'point', aoe: 1.25, kind: 'blast', noSelf: false },
  ])
  g.emitFx({ k: 'boom', z: r.zone, x: r.x, y: r.y, v: 1.75 })
}

// ───────── 機槍裝 ─────────

regScript('gatling.setup', (g, ctx) => {
  const u = ctx.caster
  ensureSuitSystem(g)
  applyBuff(g, u, 'bf.gatling.setup', undefined, u, { x: u.x, y: u.y, f: u.facing })
  g.emitFx({ k: 'braced', z: u.zone, x: u.x, y: u.y, e: u.id })
})

/** 架設檢查：離開原位或轉出射界就解除 */
regScript('gatling.check', (g, ctx, p) => {
  const u = ctx.target
  const b = ctx.buff
  if (!u || !b) return
  const d = b.data as { x: number; y: number; f: number } | undefined
  let df = d ? u.facing - d.f : 0
  while (df > Math.PI) df -= 2 * Math.PI
  while (df < -Math.PI) df += 2 * Math.PI
  const moved = d ? Math.hypot(u.x - d.x, u.y - d.y) : 0
  if (u.def.id !== 'suit.gatling' || !d || moved > num(p, 'move', 0.25) || Math.abs(df) > num(p, 'arc', 0.7)) removeBuff(g, u, 'bf.gatling.setup')
})

regScript('gatling.round', (g, ctx, p) => {
  const t = ctx.target
  if (t && t.alive && hasBuff(ctx.caster, 'bf.gatling.setup')) damage(g, ctx.caster, t, num(p, 'bonus', 3), { kind: 'energy', ability: 'ab.gatling.setup' })
})

// ───────── 力場裝 ─────────

regScript('force.polarity', (g, ctx) => {
  const u = ctx.caster
  ensureSuitSystem(g)
  if (hasBuff(u, 'bf.force.pull')) removeBuff(g, u, 'bf.force.pull')
  else applyBuff(g, u, 'bf.force.pull', undefined, u)
  g.emitFx({ k: 'polarity', z: u.zone, x: u.x, y: u.y, e: u.id })
})

// ───────── 磁力裝 ─────────

function metals(g: Game, u: Ent): Ent[] {
  const list = ((u.data.magMetal as number[] | undefined) ?? []).map((id) => g.world.get(id)).filter((e): e is Ent => !!e && e.alive)
  u.data.magMetal = list.map((e) => e.id)
  return list
}

regScript('mag.metal', (g, ctx, p) => {
  const u = ctx.caster
  const list = metals(g, u)
  while (list.length >= num(p, 'max', 3)) g.world.remove(list.shift()!)
  const m = spawnOwned(g, u, 'rig.metal', ctx.x, ctx.y, num(p, 'life', 120))
  if (!m) return
  list.push(m)
  u.data.magMetal = list.map((e) => e.id)
  g.emitFx({ k: 'summon', z: m.zone, x: m.x, y: m.y, e: m.id, s: m.def.id })
})

regScript('mag.thrust', (g, ctx, p) => {
  const u = ctx.caster
  const ang = Math.atan2(ctx.y - u.y, ctx.x - u.x)
  const pick = num(p, 'pick', 6)
  const dist = num(p, 'dist', 12)
  const speed = num(p, 'speed', 16)
  for (const m of metals(g, u)) {
    if (m.zone !== u.zone || (m.x - u.x) ** 2 + (m.y - u.y) ** 2 > pick * pick) continue
    m.data.dash = {
      tx: m.x + Math.cos(ang) * dist,
      ty: m.y + Math.sin(ang) * dist,
      speed,
      hitAlong: [{ k: 'script', fn: 'mag.metalHit', p: { dmg: num(p, 'dmg', 100) } }],
      hit: [u.id],
      until: g.time + dist / speed + 0.5,
    }
    g.emitFx({ k: 'dash', z: m.zone, x: m.x, y: m.y, x2: m.x + Math.cos(ang) * dist, y2: m.y + Math.sin(ang) * dist, e: m.id })
  }
})

/** 飛行中的金屬塊撞到單位（ctx.caster 是金屬塊）*/
regScript('mag.metalHit', (g, ctx, p) => {
  const m = ctx.caster
  const t = ctx.target
  if (!t || t.master === m.master || t.id === m.master) return
  const src = g.world.get(m.master) ?? m
  damage(g, src, t, num(p, 'dmg', 100), { kind: 'blast', ability: 'ab.mag.thrust' })
  runEffects(g, { caster: m, target: t, x: t.x, y: t.y, zone: t.zone }, [{ k: 'script', fn: 'rig.shove', p: { dist: 2 } }])
})

regScript('mag.detonate', (g, ctx, p) => {
  const u = ctx.caster
  const per = num(p, 'per', 30)
  for (const t of g.world.ents.values()) {
    if (!t.alive) continue
    const b = getBuff(t, 'bf.mag.sliv')
    if (!b || b.src !== u.id) continue
    const n = b.stacks
    removeBuff(g, t, 'bf.mag.sliv')
    damage(g, u, t, per * n, { kind: 'pierce', ability: 'ab.mag.detonate' })
    g.emitFx({ k: 'slivBurst', z: t.zone, x: t.x, y: t.y, e: t.id, v: n })
  }
})

// ───────── 脈衝裝 ─────────

/**
 * 脈衝雷射：剛開火時每發追加 bonus 傷害，連續射擊累積熱量（秒），熱量滿 heat 秒時追加歸零；
 * 停火後每秒散熱 cool。追加傷害每發消耗 cost 能量，沒能量就只剩基礎傷害。
 */
regScript('pulse.beam', (g, ctx, p) => {
  const u = ctx.caster
  const t = ctx.target
  if (!t || !t.alive) return
  const max = num(p, 'heat', 3)
  const now = g.time
  const gap = now - ((u.data.pulseLast as number | undefined) ?? -1e9)
  let heat = (u.data.pulseHeat as number | undefined) ?? 0
  heat = gap > 0.35 ? Math.max(0, heat - (gap - 0.35) * num(p, 'cool', 1.5)) : Math.min(max, heat + gap)
  u.data.pulseHeat = heat
  u.data.pulseLast = now
  const cost = num(p, 'cost', 0.2)
  const bonus = num(p, 'bonus', 2) * (1 - heat / max)
  if (bonus <= 0.01 || u.mp < cost) return
  u.mp -= cost
  damage(g, u, t, bonus, { kind: 'pierce' })
})

regScript('pulse.bank', (g, ctx, p) => {
  const u = ctx.caster
  const at = beside(u, 0.9)
  const bank = spawnOwned(g, u, 'rig.energyBank', at.x, at.y, num(p, 'life', 60))
  if (!bank) return
  bank.mp = 0
  replaceOne(g, u, 'pulseBank', bank)
  g.emitFx({ k: 'summon', z: bank.zone, x: bank.x, y: bank.y, e: bank.id, s: bank.def.id })
})

regScript('pulse.siphonTick', (g, ctx, p) => {
  const u = ctx.caster
  const t = ctx.target
  const r = num(p, 'r', 3.5) + u.radius + (t?.radius ?? 0)
  if (!t || !t.alive || t.zone !== u.zone || (t.x - u.x) ** 2 + (t.y - u.y) ** 2 > r * r) {
    stopChannel(u)
    return
  }
  const take = Math.min(num(p, 'rate', 12) * (ctx.ability?.channelTick ?? 0.25), t.mp, u.maxMp - u.mp)
  if (take > 0) {
    t.mp -= take
    u.mp += take
    g.emitFx({ k: 'beam', z: u.zone, x: t.x, y: t.y, x2: u.x, y2: u.y, e: t.id, e2: u.id, s: 'pulse' })
  }
  if (t.mp <= 0 || u.mp >= u.maxMp) stopChannel(u)
})

/** 能量庫被打爆：電磁脈衝 */
function bankEmp(g: Game, bank: Ent): void {
  const src = g.world.get(bank.master) ?? bank
  for (const t of g.world.query(bank.zone, bank.x, bank.y, 3)) {
    if (t === bank || !hittable(t)) continue
    if (t.maxMp > 0) t.mp = Math.max(0, t.mp - 60)
    applyBuff(g, t, 'bf.pulse.emp', undefined, src)
  }
  g.emitFx({ k: 'emp', z: bank.zone, x: bank.x, y: bank.y, v: 3 })
}

DEATH_HOOKS.push((g, u, killer) => {
  if (u.def.id === 'rig.rdg') rdgBlast(g, u)
  // 自然耗盡（壽命到期，killer 為 null）不會爆
  else if (u.def.id === 'rig.energyBank' && killer) bankEmp(g, u)
})

// ───────── 研究白袍 ─────────

regScript('labcoat.physics', (g, ctx, p) => {
  const u = ctx.caster
  const t = ctx.target
  if (!t || !t.alive || t.zone !== u.zone || t.def.speed <= 0) {
    refund(g, ctx)
    return
  }
  swapPlaces(g, u, t)
  applyBuff(g, t, 'bf.labcoat.stasis', num(p, 'dur', 3), u)
})

regScript('labcoat.biology', (g, ctx, p) => {
  const u = ctx.caster
  const at = beside(u, 1.1)
  const m = spawnOwned(g, u, 'rig.monstrosity', at.x, at.y, num(p, 'life', 120))
  if (!m) return
  m.acquire = true
  replaceOne(g, u, 'labMonster', m)
  g.emitFx({ k: 'summon', z: m.zone, x: m.x, y: m.y, e: m.id, s: m.def.id })
})

// ───────── 警衛裝 ─────────

regScript('guard.transfer', (g, ctx, p) => {
  const u = ctx.caster
  const t = ctx.target
  if (!t || !t.alive) return
  heal(g, t, num(p, 'heal', 150))
  u.hp = Math.max(1, u.hp - num(p, 'cost', 50))
  g.emitFx({ k: 'heal', z: t.zone, x: t.x, y: t.y, e: t.id })
  g.emitFx({ k: 'beam', z: u.zone, x: u.x, y: u.y, x2: t.x, y2: t.y, e: u.id, e2: t.id, s: 'heal' })
})

// ───────── 共用：焊槍、螢火蟲 ─────────

regScript('rig.weld', (g, ctx, p) => {
  const t = ctx.target
  // 異形／變種形態與生物雖然被歸為非人形，但不是焊得起來的東西
  if (!t || !t.alive || !t.tags.has('mechanical') || t.tags.has('xenoForm') || t.tags.has('mutantForm') || t.tags.has('creature')) {
    g.castFail(ctx.caster, 'target')
    return
  }
  heal(g, t, num(p, 'amount', 40))
  g.emitFx({ k: 'weld', z: t.zone, x: t.x, y: t.y, e: t.id })
})

regScript('rig.firefly', (g, ctx, p) => {
  const u = ctx.caster
  const f = spawnOwned(g, u, 'rig.firefly', u.x, u.y, num(p, 'life', 60))
  if (!f) return
  replaceOne(g, u, 'firefly', f)
  f.order = { k: 'move', x: ctx.x, y: ctx.y }
  g.emitFx({ k: 'summon', z: f.zone, x: f.x, y: f.y, e: f.id, s: f.def.id })
})
