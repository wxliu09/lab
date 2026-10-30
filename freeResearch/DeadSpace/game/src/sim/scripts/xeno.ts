// 異形形態技能腳本（研究 02 §3.6「重要能力腳本細節」）。
// 每局第一次用到（施放、受傷、死亡）時掛上 'xeno.forms' 系統，負責：
// def 旗標同步（焰主、雷殛者穿鎖門）、十秒迴圈取樣、裸核復原、石化解除、熵渦、絆絲、幻象跟隨、千面時限。
// 主程式也可以在開局直接呼叫 installXenoSystems(g)（建議：確保十秒迴圈從一開始就有取樣）。
import { passesFilter, regScript } from '../systems/effects'
import { DAMAGE_HOOKS, DEATH_HOOKS, damage } from '../systems/damage'
import { applyBuff, hasBuff, removeBuff, removeBuffsWhere } from '../systems/buffs'
import { dropOnGround, giveItem, makeItem, morph } from '../systems/items'
import { UNITS, itemDef, unitDef } from '../../shared/content/registry'
import type { AbilityDef, UnitDef } from '../../shared/content/types'
import { XAB, XBF, XUNIT } from '../../shared/content/forms/xeno'
import { dist, type Ent, type ItemInst } from '../ent'
import type { Game } from '../game'
import { SPACE_HALF, SPACE_ZONE } from '../world'

// ───────── 每局狀態與系統 ─────────

interface Wire {
  a: number
  b: number
}

interface XState {
  wires: Wire[]
}

const STATE = new WeakMap<Game, XState>()

function st(g: Game): XState {
  let s = STATE.get(g)
  if (!s) {
    s = { wires: [] }
    STATE.set(g, s)
    g.systems.push({ name: 'xeno.forms', fn: stepXeno })
  }
  return s
}

/** 主動掛上異形系統（正常流程會在第一次施放／受傷／死亡時自動掛上）*/
export function installXenoSystems(g: Game): void {
  st(g)
}

/** 千面期間保存的原形 */
interface MaskState {
  def: string
  hpPct: number
  abilities: string[]
  anon: boolean
  noSuit: unknown
  until: number
}

/** 裸核期間保存的原形 */
interface CoreState {
  def: string
  abilities: string[]
  until: number
}

/** 熵渦區域資料 */
interface FieldState {
  r: number
  next: number
  master: number
  pull: Record<number, number>
}

/** 幻象／召喚物跟隨 */
interface MinionState {
  master: number
  /** 是施放者自己的分身（會跟著走）；false＝別人的殘影（原地待命）*/
  self: boolean
}

/** 十秒迴圈取樣 */
interface LoopRec {
  t: number
  zone: number
  x: number
  y: number
  hp: number
  mp: number
  inv: ({ id: string; charges: number; uid: number; data?: Record<string, unknown> } | null)[]
}

const LOOP_SAMPLE_TICKS = 5 // 0.25 秒
const LOOP_KEEP = 41 // 10 秒＋1 筆
const SYNC_FLAGS = ['fireImmune', 'blastImmune', 'passLocked'] as const

function stepXeno(g: Game): void {
  const tick = g.world.tick
  const t = g.time
  for (const u of g.world.ents.values()) {
    if (!u.alive || u.removed) continue
    if (u.tags.has('xenoForm') || u.data._xflags) syncFlags(u)
    if (tick % LOOP_SAMPLE_TICKS === 0 && u.abilities.includes(XAB.loop)) recordLoop(u, t)
    const core = u.data.coreForm as CoreState | undefined
    if (core && t >= core.until) leaveCore(g, u)
    if (u.data.xPetrify && tick % 2 === 0) stepPetrified(g, u)
    if (u.data.xField) stepField(g, u, t)
    if (u.data.xMinion && tick % 10 === 0) stepMinion(g, u)
    const mask = u.data.mask as MaskState | undefined
    if (mask && t >= mask.until) endMask(g, u)
  }
  stepWires(g)
}

/** UnitDef.flags → Ent.data（焰主免疫、雷殛者穿越鎖門）；變形後自動清掉 */
function syncFlags(u: Ent): void {
  const f = u.def.flags
  const had = u.data._xflags as string[] | undefined
  const now: string[] = []
  if (f) {
    for (const k of SYNC_FLAGS) {
      if (!f[k]) continue
      u.data[k] = true
      now.push(k)
    }
  }
  if (had) for (const k of had) if (!now.includes(k)) delete u.data[k]
  u.data._xflags = now.length ? now : undefined
}

// ───────── 共用工具 ─────────

function openNear(g: Game, zone: number, x: number, y: number): { x: number; y: number } {
  const z = g.world.zones[zone]
  if (z?.nav) return z.nav.nearestOpen(x, y) ?? { x, y }
  if (zone === SPACE_ZONE) return { x: Math.max(-SPACE_HALF, Math.min(SPACE_HALF, x)), y: Math.max(-SPACE_HALF, Math.min(SPACE_HALF, y)) }
  return { x, y }
}

/** 腳本判定目標無效：退回能量與冷卻 */
function refund(g: Game, u: Ent, ab?: AbilityDef): void {
  if (!ab) return
  u.mp = Math.min(u.maxMp, u.mp + ab.mana)
  u.cds.delete(ab.sharedCd ?? ab.id)
  g.castFail(u, 'target')
}

function stopActions(u: Ent): void {
  u.order = null
  u.queue.length = 0
  u.path = null
  u.windupUntil = 0
  u.data.dash = undefined
}

/** 一般可被技能波及的單位（不含特效物件、屍體、建築）*/
function isUnit(o: Ent): boolean {
  return o.alive && !o.tags.has('noTarget') && !o.tags.has('corpse') && !o.tags.has('structure')
}

/** 別人眼中「這個單位看起來是誰」（被化身者若本身也在偽裝，沿用他的偽裝）*/
function fakeOf(t: Ent): { def: string; owner: number; name: string; color: number; cls: string } {
  const f = t.data.fake as { def: string; owner: number; name: string; color: number; cls: string } | undefined
  if (f) return { ...f }
  return { def: (t.data.viewDef as string) ?? t.def.id, owner: t.owner, name: t.data.muteName ? '' : t.name, color: t.color, cls: t.classId }
}

/** 產生幻象：外觀與 of 相同、屬於 master 的擁有者；沒有背包、不能施法、不留屍體 */
function spawnMirror(g: Game, master: Ent, of: Ent, pt: { x: number; y: number }, passive: string, life: number, disguise: boolean): Ent {
  const e = g.world.spawn(of.def, master.zone, pt.x, pt.y, master.owner)
  e.illusion = true
  e.anon = disguise ? true : master.anon
  e.name = of.name
  e.color = of.color
  e.classId = of.classId
  e.maxHp = of.maxHp
  e.hp = Math.max(1, of.hp)
  e.maxMp = of.maxMp
  e.mp = of.mp
  e.facing = of.facing
  e.inv = null
  e.abilities = []
  e.acquire = false
  e.master = master.id
  e.lifeEnd = g.time + life
  e.data.passives = [passive]
  e.data.noDrops = true
  // 不留屍體（死亡系統以 converted 判斷）
  e.data.converted = true
  e.data.xMinion = { master: master.id, self: !disguise } satisfies MinionState
  if (disguise) e.data.fake = fakeOf(of)
  else if (of.data.fake) e.data.fake = { ...(of.data.fake as object) }
  e.statsDirty = true
  return e
}

// ───────── 傷害與死亡掛勾 ─────────

const DEFLECT_RATIO = 2 // 每點能量抵銷的傷害

DAMAGE_HOOKS.push((g, _src, t, amount, o) => {
  st(g)
  if (!t.alive || amount <= 0) return
  // 實際扣掉的生命（含溢出）
  const dealt = t.hp > 0 ? amount : amount - t.hp
  // 焰主：第一擊時旗標尚未同步，補回生命
  if ((o.kind === 'fire' && t.def.flags?.fireImmune && !t.data.fireImmune) || (o.kind === 'blast' && t.def.flags?.blastImmune && !t.data.blastImmune)) {
    t.hp += dealt
    syncFlags(t)
    return
  }
  // 能量偏折：以能量吸收傷害
  if (!o.lethal && t.mp > 0 && t.abilities.includes(XAB.deflect)) {
    const absorb = Math.min(dealt, t.mp * DEFLECT_RATIO)
    if (absorb > 0) {
      t.mp -= absorb / DEFLECT_RATIO
      t.hp += absorb
      if (!o.dot && (t.data._deflectFx ?? 0) <= g.time) {
        t.data._deflectFx = g.time + 0.3
        g.emitFx({ k: 'deflect', z: t.zone, x: t.x, y: t.y, e: t.id })
      }
    }
  }
  // 核心蛻生：致命傷 → 裸核
  if (t.hp <= 0 && !o.lethal && !t.data.coreForm) {
    const core = t.abilities.includes(XAB.coreForm) ? XUNIT.core : t.abilities.includes(XAB.coreFormSpawn) ? XUNIT.spawnCore : null
    if (core && UNITS.has(core)) enterCore(g, t, core)
  }
})

DEATH_HOOKS.push((g, u) => {
  st(g)
  if (u.illusion && u.data.xMinion) g.emitFx({ k: 'mirageBreak', z: u.zone, x: u.x, y: u.y })
})

// ───────── 熵光體 ─────────

regScript('xeno.entropy', (g, ctx, p) => {
  st(g)
  const c = ctx.caster
  const r = Number(p.r) || 3
  const f = g.world.spawn(unitDef(XUNIT.entropyField), ctx.zone, ctx.x, ctx.y, c.owner)
  f.anon = c.anon
  f.master = c.id
  f.lifeEnd = g.time + (Number(p.life) || 30)
  f.data.zoneObj = true
  f.data.xField = { r, next: g.time + 0.25, master: c.id, pull: {} } satisfies FieldState
  f.x2 = { r }
  g.emitFx({ k: 'entropy', z: ctx.zone, x: ctx.x, y: ctx.y, e: f.id, v: r })
})

function stepField(g: Game, f: Ent, t: number): void {
  const d = f.data.xField as FieldState
  if (t < d.next) return
  d.next = t + 0.5
  const master = g.world.get(d.master)
  for (const o of g.world.query(f.zone, f.x, f.y, d.r)) {
    if (o === f || o === master || !isUnit(o) || o.tags.has('xenoForm')) continue
    // 灼傷：每秒 20（持續傷害，不觸發閃避、不打斷施法）
    damage(g, master ?? null, o, 10, { kind: 'energy', dot: true, srcSlot: f.owner, ability: XAB.entropy })
    if (!o.alive) continue
    // 抽能量：每秒 10，一半回流給施放者
    if (o.maxMp > 0 && o.mp > 0) {
      const take = Math.min(o.mp, 5)
      o.mp -= take
      if (master?.alive && master.maxMp > 0) master.mp = Math.min(master.maxMp, master.mp + take * 0.5)
    }
    applyBuff(g, o, XBF.entropy, 0.8, master ?? f)
    // 吸入：同一單位被吸得越久越弱
    if (o.def.speed > 0) {
      const n = (d.pull[o.id] = (d.pull[o.id] ?? 0) + 1)
      const dx = f.x - o.x
      const dy = f.y - o.y
      const len = Math.hypot(dx, dy)
      if (len > 0.4) {
        const v = 3 * Math.pow(0.8, n - 1)
        o.vx += (dx / len) * v
        o.vy += (dy / len) * v
        o.data.vDecay = 6
      }
    }
  }
}

// ───────── 蠻甲獸 ─────────

regScript('xeno.steal', (g, ctx) => {
  st(g)
  const u = ctx.caster
  const t = ctx.target
  if (!t || !t.inv || !t.inv.length) return
  const i = g.world.rng.int(0, t.inv.length - 1)
  const it = t.inv[i]
  if (!it || (itemDef(it.id)?.cat === 'key' && it.data?.bound)) {
    g.emitFx({ k: 'miss', z: t.zone, x: t.x, y: t.y, e: t.id })
    return
  }
  t.inv[i] = null
  t.statsDirty = true
  g.onItemLost?.(t, it)
  if (u.inv) giveItem(g, u, it)
  else dropOnGround(g, u.zone, u.x, u.y, it)
  // 偷到什麼只有雙方知道；旁人只看到一道光
  const both = [u.owner, t.owner].filter((s) => s >= 0)
  g.emitFx({ k: 'steal', z: t.zone, x: t.x, y: t.y, x2: u.x, y2: u.y, e: u.id, e2: t.id, s: it.id }, both)
  g.emitFx({ k: 'steal', z: t.zone, x: t.x, y: t.y, x2: u.x, y2: u.y, e: u.id, e2: t.id }, g.allPlayers().map((q) => q.slot).filter((s) => !both.includes(s) && g.players[s]!.view.visible.has(u.id)))
})

/** 神經毒涎（普攻 onHit）：機體底盤與抗毒者免疫 */
regScript('xeno.neurotoxin', (g, ctx) => {
  const t = ctx.target
  if (!t || !t.alive || t.tags.has('chassis') || t.tags.has('immuneToxin') || t.tags.has('structure')) return
  applyBuff(g, t, XBF.neurotoxin, undefined, ctx.caster)
})

// ───────── 牽絲者 ─────────

regScript('xeno.flux', (g, ctx) => {
  st(g)
  const t = ctx.target
  if (!t || !t.alive) return
  // 沖掉所有狀態（感染與石化除外，否則會變成解藥）
  removeBuffsWhere(g, t, (d) => !d.infection && d.id !== XBF.petrified)
  applyBuff(g, t, XBF.fluxSlow, 30, ctx.caster)
  applyBuff(g, t, XBF.fluxStasis, 35, ctx.caster)
  // 吐出目標過去的殘影，聽施放者使喚
  const a = g.world.rng.range(0, Math.PI * 2)
  const pt = openNear(g, t.zone, t.x + Math.cos(a) * 1.2, t.y + Math.sin(a) * 1.2)
  const echo = spawnMirror(g, ctx.caster, t, pt, XBF.echo, 900, true)
  // 目標也換新 id：殘影與本人同時以新單位出現
  g.reassignId(t)
  g.emitFx({ k: 'flux', z: t.zone, x: t.x, y: t.y, e: t.id })
  g.emitFx({ k: 'summon', z: t.zone, x: pt.x, y: pt.y, e: echo.id, s: echo.def.id })
})

regScript('xeno.mute', (g, ctx, p) => {
  st(g)
  const t = ctx.target
  if (!t || t.owner < 0) return
  const q = g.players[t.owner]
  if (!q || q.main !== t.id) return
  const dur = Number(p.dur) || 60
  q.mutedUntil = Math.max(q.mutedUntil, g.time + dur)
  applyBuff(g, t, XBF.muted, dur, ctx.caster)
  g.emitFx({ k: 'mute', z: t.zone, x: t.x, y: t.y, e: t.id })
})

// ───────── 雷殛者 ─────────

regScript('xeno.lightning', (g, ctx, p) => {
  st(g)
  const c = ctx.caster
  const r = Number(p.r) || 3
  const dmg = Number(p.dmg) || 500
  const src = c.removed ? null : c
  for (const o of g.world.query(ctx.zone, ctx.x, ctx.y, r)) {
    if (o === c || !isUnit(o)) continue
    if (!passesFilter(g, c, o, { notFaction: 'xeno', noStructure: true })) continue
    damage(g, src, o, dmg, { kind: 'energy', srcSlot: c.owner, ability: XAB.strike })
  }
})

regScript('xeno.lockdown', (g, ctx, p) => {
  st(g)
  const u = ctx.caster
  const z = g.world.zones[u.zone]
  if (!z?.layout) return
  const until = g.time + g.world.rng.range(Number(p.min) || 15, Number(p.max) || 30)
  for (const d of z.doors) {
    if (d.broken) continue
    // 原本就永久上鎖的門不動（否則到期會被解鎖）
    if (d.locked && !d.lockUntil) continue
    d.locked = true
    d.lockUntil = Math.max(d.lockUntil, until)
  }
  syncFlags(u)
})

// ───────── 幻影者 ─────────

regScript('xeno.manifold', (g, ctx, p) => {
  st(g)
  const u = ctx.caster
  const n = Math.max(1, Number(p.n) || 1)
  const passive = Number(p.pct) === 20 ? XBF.mirage20 : XBF.mirage30
  const life = Number(p.life) || 600
  // 本尊也換新 id：分身與本尊同時以新單位出現
  g.reassignId(u)
  const copies: Ent[] = []
  for (let i = 0; i < n; i++) {
    const a = (i / n) * Math.PI * 2 + g.world.rng.range(0, 1)
    const pt = openNear(g, u.zone, u.x + Math.cos(a) * 1.2, u.y + Math.sin(a) * 1.2)
    copies.push(spawnMirror(g, u, u, pt, passive, life, false))
  }
  // 本尊隨機佔用其中一個位置，讓人分不出真假
  const k = g.world.rng.int(0, n)
  if (k > 0) {
    const c = copies[k - 1]
    const ux = u.x
    const uy = u.y
    g.world.relocate(u, u.zone, c.x, c.y)
    g.world.relocate(c, c.zone, ux, uy)
  }
  g.emitFx({ k: 'manifold', z: u.zone, x: u.x, y: u.y, e: u.id, v: n })
})

/** 分身與召喚物：主人在異形形態時跟著主人、協助攻擊；主人變回人形就原地待命（避免暴露身分）*/
function stepMinion(g: Game, e: Ent): void {
  const m = e.data.xMinion as MinionState
  let leader = g.world.get(m.master)
  if (!leader || !leader.alive) {
    const owner = e.owner >= 0 ? g.players[e.owner] : undefined
    const mm = owner ? g.mainOf(owner) : undefined
    leader = mm?.alive && mm.tags.has('xenoForm') ? mm : undefined
    if (leader) m.master = leader.id
  }
  if (!leader || leader.zone !== e.zone || !leader.tags.has('xenoForm') || leader.data.fake) {
    if (e.order?.k === 'follow') e.order = null
    return
  }
  const lo = leader.order
  if (lo?.k === 'attack' && lo.e && lo.e !== e.id) {
    const tg = g.world.get(lo.e)
    if (tg && tg.alive && tg.zone === e.zone && (e.order?.k !== 'attack' || e.order.e !== tg.id)) {
      e.order = { k: 'attack', e: tg.id }
      e.queue.length = 0
    }
    return
  }
  if (e.order?.k === 'attack') return
  if (m.self && dist(e, leader) > 3 && e.order?.k !== 'follow') e.order = { k: 'follow', e: leader.id, s: 2 }
}

// ───────── 石瞳蛇 ─────────

function canPetrify(t: Ent): boolean {
  if (!isUnit(t) || t.data.petrified) return false
  for (const tag of ['xenoForm', 'chassis', 'boss', 'station', 'ship', 'space', 'invuln', 'egg', 'cocoon'] as const) if (t.tags.has(tag)) return false
  return true
}

regScript('xeno.petrify', (g, ctx) => {
  st(g)
  const u = ctx.caster
  const t = ctx.target
  if (!t || !t.alive) return
  if (!canPetrify(t)) {
    refund(g, u, ctx.ability)
    return
  }
  applyBuff(g, t, XBF.petrified, undefined, u)
  t.data.xPetrify = true
  t.data.petrified = true
  t.data.frozen = true
  t.cast = null
  stopActions(t)
  if (t.isMain) g.petrify(t, true)
  g.emitFx({ k: 'petrify', z: t.zone, x: t.x, y: t.y, e: t.id })
})

/** 石像：任何清醒的人類主單位走到 1 公尺內就解除 */
function stepPetrified(g: Game, u: Ent): void {
  if (!hasBuff(u, XBF.petrified)) applyBuff(g, u, XBF.petrified)
  for (const o of g.world.query(u.zone, u.x, u.y, 1 + u.radius + 0.5)) {
    if (o === u || !o.alive || !o.isMain || !o.tags.has('personnel') || o.data.petrified) continue
    if (dist(o, u) > 1 + u.radius + o.radius) continue
    unpetrify(g, u)
    return
  }
}

function unpetrify(g: Game, u: Ent): void {
  delete u.data.xPetrify
  removeBuff(g, u, XBF.petrified)
  u.data.petrified = false
  u.data.frozen = false
  if (u.isMain) g.petrify(u, false)
  g.emitFx({ k: 'unpetrify', z: u.zone, x: u.x, y: u.y, e: u.id })
}

// ───────── 再生核 ─────────

regScript('xeno.swarmbolt', (g, ctx, p) => {
  st(g)
  const c = ctx.caster
  const t = ctx.target
  if (!t || !t.alive) return
  const dmg = Number(p.dmg) || 80
  const n = Number(p.n) || 16
  const r = Number(p.r) || 3.5
  const others = g.world
    .query(t.zone, t.x, t.y, r)
    .filter((o) => o !== t && o !== c && isUnit(o))
    .sort((a, b) => dist(a, t) - dist(b, t))
    .slice(0, n - 1)
  g.emitFx({ k: 'swarmbolt', z: t.zone, x: c.x, y: c.y, x2: t.x, y2: t.y, e: c.id, e2: t.id })
  damage(g, c, t, dmg, { kind: 'energy', ability: XAB.swarmbolt })
  for (const o of others) {
    g.emitFx({ k: 'swarmbolt', z: t.zone, x: t.x, y: t.y, x2: o.x, y2: o.y, e2: o.id })
    damage(g, c, o, dmg, { kind: 'energy', ability: XAB.swarmbolt })
  }
})

function enterCore(g: Game, u: Ent, coreDef: string): void {
  const back: CoreState = { def: u.def.id, abilities: [...u.abilities], until: g.time + 45 }
  u.hp = 1
  morph(g, u, coreDef)
  u.hp = u.maxHp
  u.abilities = [...u.def.abilities]
  u.data.coreForm = back
  u.cast = null
  stopActions(u)
  g.emitFx({ k: 'coreForm', z: u.zone, x: u.x, y: u.y, e: u.id })
}

function leaveCore(g: Game, u: Ent): void {
  const b = u.data.coreForm as CoreState
  u.data.coreForm = undefined
  if (!UNITS.has(b.def)) return
  morph(g, u, b.def)
  u.abilities = [...b.abilities]
  g.emitFx({ k: 'coreReform', z: u.zone, x: u.x, y: u.y, e: u.id })
}

// ───────── 織網者 ─────────

regScript('xeno.webwire', (g, ctx, p) => {
  const s = st(g)
  const u = ctx.caster
  const max = Number(p.max) || 9
  const pt = openNear(g, ctx.zone, ctx.x, ctx.y)
  const a = g.world.spawn(unitDef(XUNIT.webAnchor), ctx.zone, pt.x, pt.y, u.owner)
  a.anon = u.anon
  a.master = u.id
  a.acquire = false
  a.lifeEnd = g.time + (Number(p.life) || 180)
  a.data.noDrops = true
  g.emitFx({ k: 'web', z: ctx.zone, x: pt.x, y: pt.y, e: a.id })
  const prev = g.world.get((u.data.webPending as number) ?? 0)
  if (prev && prev.alive && prev.zone === a.zone && dist(prev, a) <= max && dist(prev, a) > 0.5) {
    s.wires.push({ a: prev.id, b: a.id })
    // render 依 x2.link 在兩錨點之間畫線
    prev.x2 = { ...(prev.x2 ?? {}), link: a.id }
    u.data.webPending = 0
    g.emitFx({ k: 'webwire', z: a.zone, x: prev.x, y: prev.y, x2: a.x, y2: a.y, e: prev.id, e2: a.id })
  } else u.data.webPending = a.id
})

function segDist(px: number, py: number, ax: number, ay: number, bx: number, by: number): number {
  const vx = bx - ax
  const vy = by - ay
  const l2 = vx * vx + vy * vy || 1
  const k = Math.max(0, Math.min(1, ((px - ax) * vx + (py - ay) * vy) / l2))
  return Math.hypot(px - (ax + vx * k), py - (ay + vy * k))
}

function stepWires(g: Game): void {
  const s = STATE.get(g)
  if (!s || !s.wires.length) return
  for (let i = s.wires.length - 1; i >= 0; i--) {
    const w = s.wires[i]
    const a = g.world.get(w.a)
    const b = g.world.get(w.b)
    if (!a?.alive || !b?.alive || a.zone !== b.zone) {
      s.wires.splice(i, 1)
      if (a?.x2) {
        const { link: _l, ...rest } = a.x2
        a.x2 = Object.keys(rest).length ? rest : null
      }
      continue
    }
    const mx = (a.x + b.x) / 2
    const my = (a.y + b.y) / 2
    const half = Math.hypot(b.x - a.x, b.y - a.y) / 2
    for (const o of g.world.query(a.zone, mx, my, half + 1)) {
      if (o === a || o === b || !isUnit(o) || o.tags.has('xenoForm') || o.tags.has('flying') || o.def.speed <= 0) continue
      if ((o.data.webTripUntil ?? 0) > g.time) continue
      if (segDist(o.x, o.y, a.x, a.y, b.x, b.y) > o.radius + 0.15) continue
      o.data.webTripUntil = g.time + 3
      applyBuff(g, o, XBF.tripped, 1.5, a)
      damage(g, a, o, 40, { kind: 'normal', ability: XAB.webwire })
      g.emitFx({ k: 'tripped', z: o.zone, x: o.x, y: o.y, e: o.id })
    }
  }
}

regScript('xeno.fountain', (g, ctx, p) => {
  st(g)
  const c = ctx.caster
  const waves = Number(p.waves) || 4
  const per = Number(p.per) || 2
  const r = Number(p.r) || 3
  const dmg = Number(p.dmg) || 75
  const { zone, x: cx, y: cy } = ctx
  g.emitFx({ k: 'fountain', z: zone, x: cx, y: cy, v: r })
  for (let w = 0; w < waves; w++) {
    g.after(0.5 + w * 0.5, () => {
      for (let i = 0; i < per; i++) {
        const a = g.world.rng.range(0, Math.PI * 2)
        const rr = Math.sqrt(g.world.rng.next()) * r
        const x = cx + Math.cos(a) * rr
        const y = cy + Math.sin(a) * rr
        g.emitFx({ k: 'webGlob', z: zone, x, y, v: 1.2 })
        for (const o of g.world.query(zone, x, y, 1.2)) {
          if (o === c || !isUnit(o)) continue
          const src = c.removed ? null : c
          damage(g, src, o, dmg, { kind: 'normal', srcSlot: c.owner, ability: XAB.fountain })
          if (o.alive) applyBuff(g, o, XBF.webbed, 2.5, src)
        }
      }
    })
  }
})

// ───────── 虛空行者 ─────────

/** 某座站內的隨機落點（優先房間內）*/
function randomInterior(g: Game, zid: number): { zone: number; x: number; y: number } | null {
  const z = g.world.zones[zid]
  if (!z?.nav || !z.layout) return null
  const rng = g.world.rng
  for (let i = 0; i < 60; i++) {
    const x = rng.range(1, z.layout.w - 1)
    const y = rng.range(1, z.layout.h - 1)
    const idx = z.nav.idx(x, y)
    if (idx < 0 || z.nav.blockedIdx(idx) || z.nav.doorOf[idx] >= 0) continue
    if (i < 40 && z.layout.roomOf[idx] < 0) continue
    return { zone: zid, x: Math.floor(x) + 0.5, y: Math.floor(y) + 0.5 }
  }
  return null
}

regScript('xeno.relocate', (g, ctx) => {
  st(g)
  const u = ctx.caster
  const rng = g.world.rng
  let dest: { zone: number; x: number; y: number } | null = null
  if (u.zone !== SPACE_ZONE) {
    const inSpace = g.world.inZone(SPACE_ZONE)
    const stations = inSpace.filter((e) => e.alive && e.tags.has('station'))
    // 避開恆星灼燒範圍
    const suns = inSpace.filter((e) => e.def.id === 'space.sun')
    for (let i = 0; i < 12 && stations.length && !dest; i++) {
      const s = rng.pick(stations)
      const a = rng.range(0, Math.PI * 2)
      const d = s.radius + rng.range(2, 6)
      const p = openNear(g, SPACE_ZONE, s.x + Math.cos(a) * d, s.y + Math.sin(a) * d)
      if (suns.some((sun) => Math.hypot(sun.x - p.x, sun.y - p.y) < 9)) continue
      dest = { zone: SPACE_ZONE, x: p.x, y: p.y }
    }
    if (!dest) dest = randomInterior(g, u.zone)
  } else {
    // 優先落進太空站（飛船內艙只在沒有站時才考慮）
    const all = g.world.zones.filter((z) => z.kind === 'interior' && z.alive && z.nav)
    const zs = all.some((z) => !z.data.ship) ? all.filter((z) => !z.data.ship) : all
    if (zs.length) dest = randomInterior(g, rng.pick(zs).id)
  }
  if (!dest) {
    g.castFail(u, 'space')
    return
  }
  g.emitFx({ k: 'relocate', z: u.zone, x: u.x, y: u.y, e: u.id })
  g.world.relocate(u, dest.zone, dest.x, dest.y)
  stopActions(u)
  g.emitFx({ k: 'relocate', z: dest.zone, x: dest.x, y: dest.y, e: u.id })
})

regScript('xeno.swap', (g, ctx) => {
  st(g)
  const u = ctx.caster
  const t = ctx.target
  if (!t || !t.alive || t === u) return
  if (!isUnit(t) || t.tags.has('station') || t.tags.has('ship') || t.tags.has('space')) {
    refund(g, u, ctx.ability)
    return
  }
  const a = { zone: u.zone, x: u.x, y: u.y }
  const b = { zone: t.zone, x: t.x, y: t.y }
  g.emitFx({ k: 'swap', z: a.zone, x: a.x, y: a.y, e: u.id })
  g.emitFx({ k: 'swap', z: b.zone, x: b.x, y: b.y, e: t.id })
  if (a.zone === SPACE_ZONE || b.zone === SPACE_ZONE) {
    // 太空與站內之間只做單向跳躍，免得把人類丟進太空
    const p = openNear(g, b.zone, b.x + 0.8, b.y)
    g.world.relocate(u, b.zone, p.x, p.y)
  } else {
    const pa = openNear(g, a.zone, a.x, a.y)
    const pb = openNear(g, b.zone, b.x, b.y)
    g.world.relocate(u, b.zone, pb.x, pb.y)
    g.world.relocate(t, a.zone, pa.x, pa.y)
    t.cast = null
    stopActions(t)
  }
  stopActions(u)
})

// ───────── 時序者 ─────────

regScript('xeno.backFromHell', (g, ctx) => {
  st(g)
  const u = ctx.caster
  const front = openNear(g, u.zone, u.x + Math.cos(u.facing) * 1.2, u.y + Math.sin(u.facing) * 1.2)
  const at = { zone: u.zone, x: front.x, y: front.y }
  // 可喚回：死亡、仍在遊戲中、不是變種人方或仿生人、不是異形主腦
  const cands = g
    .allPlayers()
    .filter((q) => !q.alive && !q.spectator && !q.left && !q.stayDead && q.role !== 'mutant' && q.role !== 'android' && q.spawnOf !== 'mutant' && !(q.role === 'xeno' && !q.spawnOf))
  let pick = null as (typeof cands)[number] | null
  let best = Infinity
  for (const c of g.world.query(u.zone, u.x, u.y, 3.5)) {
    if (!c.tags.has('corpse') || !c.data.wasMain) continue
    const q = cands.find((x) => x.slot === c.data.slot)
    const d = dist(c, u)
    if (q && d < best) {
      best = d
      pick = q
    }
  }
  if (!pick) pick = [...cands].sort((a, b) => b.deadAt - a.deadAt)[0] ?? null
  if (pick) {
    // 時滯殭屍以 1 HP 從死前一刻被拉回，成為異形 spawn（本體保持殭屍型態）
    const z = g.convertToSpawn(pick.slot, 'xeno', at, 1 / unitDef(XUNIT.timeZombie).hp, XUNIT.timeZombie)
    if (z) {
      // 屍體被「用掉」了
      for (const c of g.world.ents.values()) if (c.tags.has('corpse') && c.data.wasMain && c.data.slot === pick.slot) g.world.remove(c)
      g.emitFx({ k: 'rewind', z: at.zone, x: at.x, y: at.y })
      return
    }
  }
  const b = g.world.spawn(unitDef(XUNIT.eldritch), at.zone, at.x, at.y, u.owner)
  b.anon = u.anon
  b.master = u.id
  b.acquire = true
  b.facing = u.facing
  b.data.xMinion = { master: u.id, self: true } satisfies MinionState
  g.emitFx({ k: 'summon', z: at.zone, x: at.x, y: at.y, e: b.id, s: b.def.id })
})

function recordLoop(u: Ent, t: number): void {
  let hist = u.data.ctl as LoopRec[] | undefined
  if (!hist) u.data.ctl = hist = []
  hist.push({
    t,
    zone: u.zone,
    x: u.x,
    y: u.y,
    hp: u.hp,
    mp: u.mp,
    inv: (u.inv ?? []).map((it) => (it ? { id: it.id, charges: it.charges, uid: it.uid, data: it.data ? { ...it.data } : undefined } : null)),
  })
  if (hist.length > LOOP_KEEP) hist.splice(0, hist.length - LOOP_KEEP)
}

/** 背包回到取樣時：仍在身上的沿用、不在的複製回來（noClone 例外）、等級 8 物品被時間洪流抹去 */
function restoreInv(g: Game, u: Ent, rec: LoopRec['inv']): void {
  if (!u.inv) return
  const lvl8 = (id: string) => itemDef(id)?.level === 8
  const byUid = new Map<number, ItemInst>()
  for (const it of u.inv) if (it) byUid.set(it.uid, it)
  const next: (ItemInst | null)[] = new Array(u.inv.length).fill(null)
  for (let i = 0; i < rec.length && i < next.length; i++) {
    const r = rec[i]
    if (!r || lvl8(r.id)) continue
    const have = byUid.get(r.uid)
    if (have) {
      byUid.delete(r.uid)
      if (!itemDef(have.id)?.noClone) have.charges = r.charges
      next[i] = have
      continue
    }
    if (itemDef(r.id)?.noClone) continue
    const clone = makeItem(r.id, r.charges)
    if (r.data) clone.data = { ...r.data }
    next[i] = clone
    g.onItemGained?.(u, clone)
  }
  // 現在才有的道具：放回空格，放不下掉在腳邊
  for (const it of byUid.values()) {
    if (lvl8(it.id)) {
      g.onItemLost?.(u, it)
      continue
    }
    const s = next.indexOf(null)
    if (s >= 0) next[s] = it
    else dropOnGround(g, u.zone, u.x, u.y, it)
  }
  for (let i = 0; i < u.inv.length; i++) u.inv[i] = next[i]
  u.statsDirty = true
}

regScript('xeno.loop', (g, ctx, p) => {
  st(g)
  const u = ctx.caster
  const hist = (u.data.ctl as LoopRec[] | undefined) ?? []
  const back = Number(p.back) || 10
  const rec = hist.find((r) => r.t >= g.time - back - 0.01) ?? hist[0]
  if (!rec) return
  const z = g.world.zones[rec.zone]
  g.emitFx({ k: 'rewind', z: u.zone, x: u.x, y: u.y, e: u.id })
  if (z && z.alive) {
    const pt = openNear(g, rec.zone, rec.x, rec.y)
    g.world.relocate(u, rec.zone, pt.x, pt.y)
  }
  u.hp = Math.max(1, Math.min(u.maxHp, rec.hp))
  u.mp = Math.max(0, Math.min(u.maxMp, rec.mp - (Number(p.cost) || 0)))
  restoreInv(g, u, rec.inv)
  u.cast = null
  stopActions(u)
  u.data.ctl = []
  g.emitFx({ k: 'rewind', z: u.zone, x: u.x, y: u.y, e: u.id })
})

// ───────── 假面者 ─────────

/** 化身後保留的技能：目標單位的內容技能（身分機制技能不給）＋卸面 */
function maskAbilities(def: UnitDef): string[] {
  return [...def.abilities.filter((a) => !a.startsWith('xeno.') && !a.startsWith('mut.')), XAB.unmask]
}

regScript('xeno.masks', (g, ctx, p) => {
  st(g)
  const u = ctx.caster
  const t = ctx.target
  if (!t || !t.alive || t === u) return
  if (u.data.mask || t.anon || t.tags.has('structure') || t.tags.has('egg') || t.tags.has('cocoon') || t.data.petrified) {
    refund(g, u, ctx.ability)
    return
  }
  const defId = UNITS.has(t.def.id) ? t.def.id : 'personnel'
  const limit = Number(p.limit) || 30
  const mask: MaskState = {
    def: u.def.id,
    hpPct: u.hp / u.maxHp,
    abilities: [...u.abilities],
    anon: u.anon,
    noSuit: u.data.noSuit,
    // 化身成人類可無限維持；其他樣子（變種人、仿生人機體）30 秒
    until: t.tags.has('personnel') ? Infinity : g.time + limit,
  }
  const look = fakeOf(t)
  morph(g, u, defId)
  u.hp = Math.max(1, u.maxHp * (t.hp / t.maxHp))
  u.abilities = maskAbilities(u.def)
  u.data.mask = mask
  // 偽裝成人類時也不能穿防護服（否則 morph 會蓋掉卸面）
  u.data.noSuit = true
  // spawn 的異形形態不匿名：化身期間改成匿名，快照才會改用 data.fake
  u.anon = true
  u.data.fake = look
  u.cast = null
  stopActions(u)
  g.emitFx({ k: 'masks', z: u.zone, x: u.x, y: u.y, e: u.id })
  g.reassignId(u)
})

function endMask(g: Game, u: Ent): void {
  const m = u.data.mask as MaskState | undefined
  if (!m) return
  const pct = (m.hpPct + u.hp / u.maxHp) / 2
  u.data.mask = undefined
  u.data.fake = undefined
  if (UNITS.has(m.def)) morph(g, u, m.def)
  u.hp = Math.max(1, u.maxHp * pct)
  u.abilities = [...m.abilities]
  u.autocast = new Set([...u.autocast].filter((a) => u.abilities.includes(a)))
  u.anon = m.anon
  if (m.noSuit === undefined) delete u.data.noSuit
  else u.data.noSuit = m.noSuit
  g.emitFx({ k: 'masks', z: u.zone, x: u.x, y: u.y, e: u.id, s: 'end' })
  g.reassignId(u)
}

regScript('xeno.unmask', (g, ctx) => {
  st(g)
  endMask(g, ctx.caster)
})
