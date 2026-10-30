// 變種人技能腳本（內容在 src/shared/content/forms/mutant.ts）。
// 另外包含每局一次安裝的系統：腐沼黏液足跡、血肉巨像踩碎瓦礫、甲蟹移動改瞬移。
// 系統在第一次有人下移動指令、第一次有傷害／死亡或第一次施放變種人技能時自動裝上；
// 主程式也可以在開局直接呼叫 installMutantSystems(g)。
import { UNITS } from '../../shared/content/registry'
import type { Effect } from '../../shared/content/types'
import { HOSTILE, dist, type Ent } from '../ent'
import type { Game, GamePlayer } from '../game'
import { SPACE_ZONE } from '../world'
import { regScript, runEffects, type ScriptFn } from '../systems/effects'
import { DAMAGE_HOOKS, DEATH_HOOKS, damage, heal } from '../systems/damage'
import { applyBuff, hasBuff, removeBuff } from '../systems/buffs'
import { EXTRA_COMMANDS, handleCommand, issue, type CommandHandler } from '../systems/orders'
import { updateVendorView, type StockState } from '../systems/vendors'

// ───────── 陣營工具 ─────────

type Side = 'crew' | 'xeno' | 'mutant' | 'hostile' | 'neutral'

function sideOf(g: Game, e: Ent): Side {
  if (e.owner === HOSTILE) return 'hostile'
  if (e.owner < 0) return 'neutral'
  const p = g.players[e.owner]
  return p ? g.faction(p) : 'neutral'
}

export function isMutantSide(g: Game, e: Ent): boolean {
  return sideOf(g, e) === 'mutant'
}

function mutantPlayers(g: Game): GamePlayer[] {
  return g.allPlayers().filter((p) => g.faction(p) === 'mutant')
}

/** 感染來源：優先用施放者本人；他已經換了單位（進化）就用同一位玩家現在的主單位，再不然找任何一位變種人陣營的主單位 */
function infectSource(g: Game, srcId: number, srcSlot: number): Ent | null {
  const e = g.world.get(srcId)
  if (e && e.alive) return e
  const p = srcSlot >= 0 ? g.players[srcSlot] : undefined
  const m = p ? g.mainOf(p) : undefined
  if (m && m.alive) return m
  for (const q of mutantPlayers(g)) {
    const u = g.mainOf(q)
    if (u && u.alive) return u
  }
  return null
}

/** 召喚物會主動攻擊的對象：敵對生物與非變種人陣營的玩家單位（不含中立小動物、建築）*/
function isFoe(g: Game, u: Ent, t: Ent): boolean {
  if (t === u || !t.alive || t.zone !== u.zone) return false
  if (t.tags.has('noTarget') || t.tags.has('corpse') || t.tags.has('structure') || t.tags.has('invuln') || t.tags.has('rubble')) return false
  if (t.stats.stealth || t.stats.invuln) return false
  if (u.zone === SPACE_ZONE && !t.tags.has('space')) return false
  const s = sideOf(g, t)
  return s === 'crew' || s === 'xeno' || s === 'hostile'
}

function nearestFoe(g: Game, u: Ent, r: number): Ent | null {
  const z = g.world.zones[u.zone]
  let best: Ent | null = null
  let bestD = Infinity
  for (const t of g.world.query(u.zone, u.x, u.y, r)) {
    if (!isFoe(g, u, t)) continue
    const d = (t.x - u.x) ** 2 + (t.y - u.y) ** 2
    if (d >= bestD) continue
    if (z.nav && !z.nav.los(u.x, u.y, t.x, t.y, true)) continue
    best = t
    bestD = d
  }
  return best
}

function openNear(g: Game, zone: number, x: number, y: number): { x: number; y: number } | null {
  const z = g.world.zones[zone]
  if (!z) return null
  if (!z.nav) return { x, y }
  return z.nav.nearestOpen(x, y)
}

/** 感染到玩家主單位時記入結算統計 */
function countInfection(g: Game, src: Ent | null, t: Ent): void {
  const p = src && src.owner >= 0 ? g.players[src.owner] : undefined
  if (p && t.isMain) p.stats.infections++
}

function refundCd(u: Ent, ab?: { id: string; sharedCd?: string }): void {
  if (ab) u.cds.delete(ab.sharedCd ?? ab.id)
}

/** 私訊施放者（技能失敗原因、結果回報）*/
function tell(g: Game, u: Ent, key: string, args?: Record<string, string | number>): void {
  if (u.owner >= 0) g.privateLine(u.owner, key, args)
}

// ───────── 召喚物 ─────────

export function spawnMinion(g: Game, master: Ent, defId: string, x: number, y: number, ai: string, life?: number): Ent | null {
  const def = UNITS.get(defId)
  if (!def) return null
  const p = openNear(g, master.zone, x, y)
  if (!p) return null
  const s = g.world.spawn(def, master.zone, p.x, p.y, master.owner)
  s.master = master.id
  s.anon = master.anon
  s.acquire = true
  s.facing = master.facing
  if (life) s.lifeEnd = g.time + life
  s.data.ai = ai
  if (ai === 'static') s.solidBody = true
  if (ai !== 'bug') applyBuff(g, s, 'bf.mut.minion', undefined, master)
  g.emitFx({ k: 'summon', z: master.zone, x: p.x, y: p.y, e: s.id, s: def.id })
  return s
}

function ringSpawn(g: Game, master: Ent, defId: string, n: number, r: number, ai: string, life?: number): Ent[] {
  const out: Ent[] = []
  for (let i = 0; i < n; i++) {
    const a = (i / n) * Math.PI * 2 + g.world.rng.range(-0.2, 0.2)
    const rr = n > 1 ? r * g.world.rng.range(0.6, 1) : 0
    const s = spawnMinion(g, master, defId, master.x + Math.cos(a) * rr, master.y + Math.sin(a) * rr, ai, life)
    if (s) out.push(s)
  }
  return out
}

/** 化蟲時的蟲群首領＝玩家正在操控的那條蟲 */
function packLeader(g: Game, u: Ent): Ent | undefined {
  const p = u.owner >= 0 ? g.players[u.owner] : undefined
  const c = p ? g.world.get(p.control) : undefined
  return c && c.alive ? c : undefined
}

function minionThink(g: Game, u: Ent): void {
  if (!u.alive || u.stats.stunned || u.data.dash) return
  const ai = (u.data.ai as string) ?? 'guard'
  const o = u.order
  if (o?.k === 'attack') {
    const t = g.world.get(o.e!)
    if (t && t.alive && t.zone === u.zone && !t.stats.stealth) return
    u.order = null
  }
  const leader = ai === 'pack' ? packLeader(g, u) : g.world.get(u.master)
  // 跟著主人打同一個目標
  if (leader && leader !== u && leader.alive && leader.order?.k === 'attack') {
    const t = g.world.get(leader.order.e!)
    if (t && t.alive && t.zone === u.zone && t !== u && u.def.attack) {
      issue(u, { k: 'attack', e: t.id })
      return
    }
  }
  const r = ai === 'wander' ? 9 : ai === 'sack' ? 9 : ai === 'pack' ? 5 : ai === 'static' ? (u.def.attack?.range ?? 2) + 1 : 7
  const foe = nearestFoe(g, u, r)
  if (foe) {
    if (ai === 'sack') {
      if (!u.data.launched) {
        u.data.launched = true
        runEffects(g, { caster: u, target: foe, x: foe.x, y: foe.y, zone: u.zone }, SACK_LAUNCH)
      }
      return
    }
    if (u.def.attack) {
      issue(u, { k: 'attack', e: foe.id })
      return
    }
  }
  if (ai === 'static') return
  if ((ai === 'guard' || ai === 'pack' || ai === 'sack') && leader && leader !== u && leader.alive) {
    if (leader.zone !== u.zone) return
    const d = dist(u, leader)
    if (d > 3 && (u.order?.k !== 'follow' || u.order.e !== leader.id)) issue(u, { k: 'follow', e: leader.id, s: 1.5 })
    return
  }
  // 遊蕩
  if (!u.order && g.world.rng.chance(0.35)) {
    const a = g.world.rng.range(0, Math.PI * 2)
    const d = g.world.rng.range(1.5, 4)
    const p = openNear(g, u.zone, u.x + Math.cos(a) * d, u.y + Math.sin(a) * d)
    if (p) issue(u, { k: 'move', x: p.x, y: p.y })
  }
}

const SACK_LAUNCH: Effect[] = [
  {
    k: 'dash',
    speed: 9,
    maxDist: 12,
    to: 'target',
    onArrive: [{ k: 'damage', amount: 90, to: 'self', aoe: 2 }, { k: 'script', fn: 'mutant.sackBurst', p: { n: 3 } }],
  },
]

// ───────── 系統（每局一次）─────────

const installed = new WeakSet<Game>()

export function installMutantSystems(g: Game): void {
  if (installed.has(g)) return
  installed.add(g)
  g.systems.push({ name: 'mutant', fn: stepMutant })
}

const SLIME_LIFE = 10
const SLIME_DMG = 10 // 每 0.5 秒

function stepMutant(g: Game): void {
  const tick = g.world.tick
  const slimeTick = tick % 10 === 0
  const slowTick = tick % 5 === 0
  const hit = slimeTick ? new Set<number>() : null
  for (const u of g.world.ents.values()) {
    if (!u.alive) continue
    const f = u.def.flags
    if (!f) continue
    if (f.crabosity) crabStep(g, u)
    if (slowTick && f.slimeTrail && !u.data.metamorph) dropSlime(g, u)
    if (slowTick && f.crushRubble) crushRubble(g, u)
    if (hit && f.slime) slimeHurt(g, u, hit)
  }
}

function dropSlime(g: Game, u: Ent): void {
  if (u.zone === SPACE_ZONE) return
  const last = u.data.slimeAt as { x: number; y: number; z: number } | undefined
  if (last && last.z === u.zone && (last.x - u.x) ** 2 + (last.y - u.y) ** 2 < 0.8) return
  const def = UNITS.get('mut.slime')
  if (!def) return
  const s = g.world.spawn(def, u.zone, u.x, u.y, u.owner)
  s.master = u.id
  s.anon = u.anon
  s.lifeEnd = g.time + SLIME_LIFE
  s.data.zoneObj = true
  s.facing = g.world.rng.range(0, Math.PI * 2)
  u.data.slimeAt = { x: u.x, y: u.y, z: u.zone }
}

function slimeHurt(g: Game, s: Ent, hit: Set<number>): void {
  const src = g.world.get(s.master) ?? null
  for (const t of g.world.query(s.zone, s.x, s.y, 0.7)) {
    if (hit.has(t.id) || !t.alive || t.tags.has('noTarget') || t.tags.has('corpse') || t.tags.has('structure') || t.tags.has('flying')) continue
    if (isMutantSide(g, t)) continue
    hit.add(t.id)
    damage(g, src, t, SLIME_DMG, { kind: 'poison', dot: true, srcSlot: s.owner })
    if (t.alive) applyBuff(g, t, 'bf.mut.slimed', 1, src)
  }
}

function crushRubble(g: Game, u: Ent): void {
  for (const t of g.world.query(u.zone, u.x, u.y, u.radius + 0.7)) {
    if (!t.alive || !t.tags.has('rubble')) continue
    damage(g, u, t, t.hp + 1, { pure: true, quiet: true })
    g.emitFx({ k: 'crush', z: t.zone, x: t.x, y: t.y })
  }
}

/** 甲蟹：每個新的移動命令都先嘗試燒能量直接跳過去 */
const CRAB_HOP = 16
function crabCost(d: number): number {
  return Math.ceil(10 + 3 * d)
}

function crabStep(g: Game, u: Ent): void {
  const o = u.order
  if (!o || o.k !== 'move' || o.x === undefined || o.y === undefined) return
  if (u.data.crabOrder === o || (u.data.crabNext ?? 0) > g.time) return
  if (crabJump(g, u, o.x, o.y)) {
    const d = Math.hypot(o.x - u.x, o.y - u.y)
    if (d < 1.2) u.order = u.queue.shift() ?? null
    else u.data.crabNext = g.time + 0.4
    return
  }
  u.data.crabOrder = o
}

export function crabJump(g: Game, u: Ent, x: number, y: number): boolean {
  if (u.zone === SPACE_ZONE || u.stats.stunned || u.stats.rooted || u.data.frozen || u.cast) return false
  const d = Math.hypot(x - u.x, y - u.y)
  if (d < 1.2) return false
  const hop = Math.min(d, CRAB_HOP)
  const cost = crabCost(hop)
  if (u.mp < cost) return false
  const p = openNear(g, u.zone, u.x + ((x - u.x) / d) * hop, u.y + ((y - u.y) / d) * hop)
  if (!p) return false
  u.mp -= cost
  g.emitFx({ k: 'blink', z: u.zone, x: u.x, y: u.y, x2: p.x, y2: p.y, e: u.id, s: 'crab' })
  g.world.relocate(u, u.zone, p.x, p.y)
  u.facing = Math.atan2(y - u.y, x - u.x) || u.facing
  u.path = null
  return true
}

// 傷害／死亡發生時順便裝上系統（保底）
DAMAGE_HOOKS.push((g) => installMutantSystems(g))

// 移動指令：裝上系統後交回原本的處理（不改變一般單位的行為）
const prevMove = EXTRA_COMMANDS.get('move')
const moveHandler: CommandHandler = (g, p, u, c) => {
  installMutantSystems(g)
  if (prevMove) {
    prevMove(g, p, u, c)
    return
  }
  EXTRA_COMMANDS.delete('move')
  try {
    handleCommand(g, p, c)
  } finally {
    EXTRA_COMMANDS.set('move', moveHandler)
  }
}
EXTRA_COMMANDS.set('move', moveHandler)

// ───────── 腳本 ─────────

/** 註冊並在第一次施放時順便裝上系統 */
function reg(name: string, fn: ScriptFn): void {
  regScript(name, (g, ctx, p) => {
    installMutantSystems(g)
    fn(g, ctx, p)
  })
}

reg('mutant.summon', (g, ctx, p) => {
  const n = Number(p.count) || 1
  const life = Number(p.life) || undefined
  ringSpawn(g, ctx.caster, String(p.unit), n, Number(p.spread) || 1, String(p.ai ?? 'guard'), life)
})

reg('mutant.minionAi', (g, ctx) => {
  if (ctx.target) minionThink(g, ctx.target)
})

reg('mutant.boom', (g, ctx, p) => {
  g.emitFx({ k: 'boom', z: ctx.zone, x: ctx.x, y: ctx.y, v: Number(p.r) || 1 })
})

/** 粉碎：砸向「開始施法時瞄準的位置」——目標跑掉就落空 */
reg('mutant.smash', (g, ctx, p) => {
  const c = ctx.caster
  const r = Number(p.r) || 1.2
  const dmgAmt = Number(p.dmg) || 2500
  g.damageDoorsNear(ctx.zone, ctx.x, ctx.y, r, Number(p.door) || 6000)
  for (const t of g.world.query(ctx.zone, ctx.x, ctx.y, r)) {
    if (t === c || !t.alive || t.tags.has('noTarget') || t.tags.has('corpse')) continue
    damage(g, c, t, dmgAmt, { ability: ctx.ability?.id })
  }
  g.emitFx({ k: 'smash', z: ctx.zone, x: ctx.x, y: ctx.y, e: c.id, v: r })
})

// ── 污染販賣機 ──

const taintHooked = new WeakSet<Game>()

function hookTaintedBuy(g: Game): void {
  if (taintHooked.has(g)) return
  taintHooked.add(g)
  const prev = g.onBuy
  g.onBuy = (u, v, item) => {
    prev?.(u, v, item)
    onTaintedBuy(g, u, v, item)
  }
}

function onTaintedBuy(g: Game, u: Ent, v: Ent, item: string): void {
  const t = v.data.tainted as { slot: number; src: number } | undefined
  if (!t || !u.alive || isMutantSide(g, u)) return
  // 抗體被換成毒藥：拿到的抗體直接沒收
  if (/antibod/i.test(item) && u.inv) {
    for (let i = u.inv.length - 1; i >= 0; i--) {
      if (u.inv[i]?.id === item) {
        u.inv[i] = null
        u.statsDirty = true
        break
      }
    }
  }
  const src = infectSource(g, t.src, t.slot)
  if (applyBuff(g, u, 'bf.prionStrong', undefined, src)) countInfection(g, src, u)
}

reg('mutant.taintVendor', (g, ctx) => {
  const c = ctx.caster
  const v = ctx.target
  const st = v?.data.stock as StockState[] | undefined
  if (!v || !st) {
    refundCd(c, ctx.ability)
    c.mp = Math.min(c.maxMp, c.mp + (ctx.ability?.mana ?? 0))
    tell(g, c, 'cast.target')
    return
  }
  v.data.tainted = { slot: c.owner, src: c.id, at: g.time }
  for (const s of st) {
    if (/antibod/i.test(s.item)) {
      s.count = 0
      s.max = 0
    }
  }
  updateVendorView(g, v)
  hookTaintedBuy(g)
  tell(g, c, 'mut.vendorTainted')
  g.emitFx(
    { k: 'taint', z: v.zone, x: v.x, y: v.y, e: v.id },
    mutantPlayers(g).map((q) => q.slot),
  )
})

// ── 蛛母 ──

reg('mutant.reabsorb', (g, ctx) => {
  const c = ctx.caster
  const t = ctx.target
  if (!t || !t.alive || t.owner !== c.owner || !t.tags.has('summon') || t === c) {
    refundCd(c, ctx.ability)
    tell(g, c, 'cast.target')
    return
  }
  heal(g, c, t.hp)
  g.emitFx({ k: 'heal', z: c.zone, x: c.x, y: c.y, e: c.id })
  g.emitFx({ k: 'devour', z: t.zone, x: t.x, y: t.y, e: c.id })
  t.alive = false
  g.world.remove(t)
})

// ── 潛伏者 ──

reg('mutant.omniTick', (g, ctx, p) => {
  const t = ctx.target
  if (!t || !t.alive) return
  const r = Number(p.r) || 2.5
  for (const q of mutantPlayers(g)) {
    if (!q.alive) continue
    q.view.extraSources.push({ zone: t.zone, x: t.x, y: t.y, r, until: g.time + 0.6 })
  }
})

// ── 甲蟹 ──

reg('mutant.crabSpores', (g, ctx) => {
  const c = ctx.caster
  const t = ctx.target
  if (!c.alive) return
  const n = c.data.crabPanicked ? 2 : 3
  for (let i = 0; i < n; i++) {
    const a = g.world.rng.range(0, Math.PI * 2)
    const s = spawnMinion(g, c, 'mut.sporeling', ctx.x + Math.cos(a) * 0.8, ctx.y + Math.sin(a) * 0.8, 'guard', 12)
    if (s && t && t.alive && t.zone === s.zone) issue(s, { k: 'attack', e: t.id })
  }
})

reg('mutant.panic', (g, ctx) => {
  const u = ctx.caster
  u.mp = u.maxMp
  if (u.data.crabPanicked) return
  u.data.crabPanicked = true
  const k = u.hp / u.maxHp
  u.data.hpMult = 0.5
  u.maxHp = u.maxHp * 0.5
  u.hp = Math.max(1, u.maxHp * k)
  applyBuff(g, u, 'bf.mut.panicked', undefined, u)
})

// ── 血肉巨像 ──

reg('mutant.rocksFall', (g, ctx, p) => {
  const c = ctx.caster
  const n = Number(p.count) || 36
  const r = Number(p.r) || 5.12
  for (let i = 0; i < n; i++) {
    const a = (i / n) * Math.PI * 2
    g.spawnRubble(ctx.zone, c.x + Math.cos(a) * r, c.y + Math.sin(a) * r, 1, 0)
  }
  g.emitFx({ k: 'boom', z: ctx.zone, x: c.x, y: c.y, v: 1.5 })
})

// ── 牛頭蠻 ──

/** 衝鋒前先把路線上的瓦礫撞開 */
reg('mutant.chargePrep', (g, ctx, p) => {
  const c = ctx.caster
  const max = Number(p.max) || 20
  const dx = ctx.x - c.x
  const dy = ctx.y - c.y
  const d = Math.hypot(dx, dy)
  if (d < 0.1) return
  const len = Math.min(d, max)
  const ux = dx / d
  const uy = dy / d
  const mx = c.x + ux * len * 0.5
  const my = c.y + uy * len * 0.5
  const w = c.radius + 0.8
  for (const t of g.world.query(ctx.zone, mx, my, len * 0.5 + w)) {
    if (!t.alive || !t.tags.has('rubble')) continue
    const along = (t.x - c.x) * ux + (t.y - c.y) * uy
    if (along < -0.5 || along > len + 0.5) continue
    const perp = Math.abs((t.x - c.x) * uy - (t.y - c.y) * ux)
    if (perp > w) continue
    damage(g, c, t, t.hp + 1, { pure: true, quiet: true })
  }
})

reg('mutant.chargeHit', (g, ctx) => {
  const c = ctx.caster
  const t = ctx.target
  if (!t || !t.alive || t.def.speed <= 0) return
  applyBuff(g, t, 'bf.mut.dragged', undefined, c)
  t.vx += Math.cos(c.facing) * 12
  t.vy += Math.sin(c.facing) * 12
  t.data.vDecay = 4
})

reg('mutant.rollingThunder', (g, ctx, p) => {
  const u = ctx.caster
  const dur = Number(p.dur) || 15
  const i = u.abilities.indexOf('ab.mut.rollingThunder')
  if (i < 0) return
  u.abilities[i] = 'ab.mut.shockwave'
  g.after(dur, () => {
    if (u.removed) return
    const j = u.abilities.indexOf('ab.mut.shockwave')
    if (j >= 0) u.abilities[j] = 'ab.mut.rollingThunder'
  })
})

reg('mutant.knockAway', (_g, ctx, p) => {
  const c = ctx.caster
  const t = ctx.target
  if (!t || !t.alive || t.def.speed <= 0 || t.tags.has('structure')) return
  const dx = t.x - c.x
  const dy = t.y - c.y
  const d = Math.hypot(dx, dy) || 1
  const v = (Number(p.dist) || 3) * 5
  t.vx += (dx / d) * v
  t.vy += (dy / d) * v
  t.data.vDecay = 5
})

// ── 瘟后 ──

reg('mutant.totalInfection', (g, ctx) => {
  const c = ctx.caster
  let n = 0
  for (const q of g.allPlayers()) {
    if (!q.alive || g.faction(q) === 'mutant') continue
    const m = g.mainOf(q)
    if (!m || !m.alive) continue
    if (!applyBuff(g, m, 'bf.prionStrong', undefined, c)) continue
    countInfection(g, c, m)
    n++
  }
  tell(g, c, 'mut.totalInfection', { n })
})

reg('mutant.vector', (g, ctx, p) => {
  const c = ctx.caster
  const t = ctx.target
  if (!t) return
  const bug = spawnMinion(g, c, 'mut.vectorBug', c.x + Math.cos(c.facing) * 0.6, c.y + Math.sin(c.facing) * 0.6, 'bug', Number(p.life) || 25)
  if (!bug) return
  bug.acquire = false
  bug.data.bugTarget = t.id
  applyBuff(g, bug, 'bf.mut.bug', undefined, c)
  issue(bug, { k: 'follow', e: t.id, s: 0.05 })
})

reg('mutant.bugAi', (g, ctx) => {
  const bug = ctx.target
  if (!bug || !bug.alive) return
  const t = g.world.get(bug.data.bugTarget as number)
  if (!t || !t.alive || t.zone !== bug.zone) {
    bug.alive = false
    g.world.remove(bug)
    return
  }
  if (dist(bug, t) <= t.radius + bug.radius + 0.35) {
    vectorBite(g, bug, t)
    bug.alive = false
    g.world.remove(bug)
    return
  }
  if (bug.order?.k !== 'follow' || bug.order.e !== t.id) issue(bug, { k: 'follow', e: t.id, s: 0.05 })
})

function vectorBite(g: Game, bug: Ent, t: Ent): void {
  g.emitFx({ k: 'bite', z: t.zone, x: t.x, y: t.y, e: t.id })
  if (isMutantSide(g, t)) return
  const src = infectSource(g, bug.master, bug.owner)
  if (!applyBuff(g, t, 'bf.mut.vector', undefined, src)) return
  // 16 次發作，間隔 1.5、2、2.5…秒越拉越長
  let at = 0
  for (let i = 1; i <= 16; i++) {
    at += 1 + i / 2
    g.after(at, () => {
      if (!t.alive || t.removed || !hasBuff(t, 'bf.mut.vector')) return
      applyBuff(g, t, 'bf.mut.seizure', undefined, infectSource(g, bug.master, bug.owner))
      t.cast = null
    })
  }
}

// ── 繁巢 ──

reg('mutant.carrierTick', (g, ctx, p) => {
  const holder = ctx.target
  const b = ctx.buff
  if (!holder || !holder.alive || !b) return
  const r = Number(p.r) || 3.5
  let src: Ent | null | undefined
  for (const t of g.world.query(holder.zone, holder.x, holder.y, r)) {
    if (t === holder || !t.alive || t.tags.has('mechanical') || t.tags.has('structure') || t.tags.has('noTarget') || t.tags.has('corpse')) continue
    if (!t.tags.has('personnel') && !t.tags.has('organic')) continue
    if (isMutantSide(g, t) || hasBuff(t, 'bf.prionCarrier')) continue
    if (src === undefined) src = infectSource(g, b.src, b.srcSlot)
    if (applyBuff(g, t, 'bf.prionCarrier', undefined, src)) countInfection(g, src, t)
  }
})

// ── 腐沼：化蟲 ──

interface MetaState {
  worms: number[]
  hp0: number
  until: number
}

reg('mutant.metamorphosis', (g, ctx, p) => {
  const u = ctx.caster
  if (u.data.metamorph) return
  const n = Number(p.count) || 16
  const dur = Number(p.dur) || 60
  const worms = ringSpawn(g, u, 'mut.worm', n, Number(p.r) || 1.25, 'pack')
  if (!worms.length) return
  for (const w of worms) w.data.metaOf = u.id
  const st: MetaState = { worms: worms.map((w) => w.id), hp0: worms.reduce((a, w) => a + w.maxHp, 0), until: g.time + dur }
  u.data.metamorph = st
  // 本體藏起來：無敵、隱形、不能被選、不擋路
  applyBuff(g, u, 'bf.mut.metamorph', dur + 5, u)
  const tags = new Set(u.tags)
  tags.add('noTarget')
  u.tags = tags
  u.data.ghost = true
  issue(u, null)
  u.cast = null
  const pl = u.owner >= 0 ? g.players[u.owner] : undefined
  if (pl && pl.main === u.id) pl.control = worms[0].id
  g.emitFx({ k: 'burst', z: u.zone, x: u.x, y: u.y, e: u.id, s: 'worms' })
  g.after(dur, () => endMetamorph(g, u, null))
})

export function endMetamorph(g: Game, u: Ent, killer: Ent | null): void {
  const st = u.data.metamorph as MetaState | undefined
  if (!st) return
  u.data.metamorph = undefined
  const worms = st.worms.map((id) => g.world.get(id)).filter((w): w is Ent => !!w && w.alive)
  const pl = u.owner >= 0 ? g.players[u.owner] : undefined
  const ctrl = pl ? g.world.get(pl.control) : undefined
  const lead = worms.find((w) => w === ctrl) ?? worms[0]
  if (u.removed || !u.alive) {
    for (const w of worms) g.world.remove(w)
    return
  }
  const tags = new Set(u.tags)
  tags.delete('noTarget')
  u.tags = tags
  u.data.ghost = false
  removeBuff(g, u, 'bf.mut.metamorph')
  if (pl && pl.main === u.id) pl.control = u.id
  if (!lead) {
    g.killEnt(u, killer, killer?.owner ?? -1)
    return
  }
  const frac = worms.reduce((a, w) => a + w.hp, 0) / Math.max(1, st.hp0)
  g.world.relocate(u, lead.zone, lead.x, lead.y)
  u.facing = lead.facing
  u.hp = Math.max(1, u.hp * Math.min(1, frac))
  for (const w of worms) {
    w.alive = false
    g.world.remove(w)
  }
  g.emitFx({ k: 'summon', z: u.zone, x: u.x, y: u.y, e: u.id, s: u.def.id })
}

// 蟲死了：全滅＝本體死亡；被操控的那條死了就換一條
DEATH_HOOKS.push((g, u, killer) => {
  installMutantSystems(g)
  const of = u.data.metaOf as number | undefined
  if (!of) return
  const main = g.world.get(of)
  const st = main?.data.metamorph as MetaState | undefined
  if (!main || !st) return
  const alive = st.worms.map((id) => g.world.get(id)).filter((w): w is Ent => !!w && w.alive && w !== u)
  if (!alive.length) {
    endMetamorph(g, main, killer)
    return
  }
  const pl = main.owner >= 0 ? g.players[main.owner] : undefined
  if (pl && pl.control === u.id) pl.control = alive[0].id
})

// ── 巢艦 ──

reg('mutant.viewIntestines', (g, ctx, p) => {
  const c = ctx.caster
  const pl = c.owner >= 0 ? g.players[c.owner] : undefined
  if (!pl) return
  let n = 0
  let hp = 0
  const dur = Number(p.dur) || 5
  for (const e of g.world.ents.values()) {
    if (!e.alive || e.owner !== c.owner || e === c) continue
    if (!e.data.hive && !e.def.flags?.hive) continue
    n++
    hp += e.hp
    pl.view.extraSources.push({ zone: e.zone, x: e.x, y: e.y, r: 8, until: g.time + dur })
  }
  g.privateLine(pl.slot, 'mut.intestines', { n, hp: Math.round(hp) })
})

reg('mutant.factionBuff', (g, ctx, p) => {
  const c = ctx.caster
  const r = Number(p.r) || 8
  for (const t of g.world.query(c.zone, c.x, c.y, r)) {
    if (!t.alive || t.tags.has('structure') || t.tags.has('noTarget')) continue
    if (t !== c && !isMutantSide(g, t)) continue
    applyBuff(g, t, String(p.buff), undefined, c)
  }
})

reg('mutant.breed', (g, ctx, p) => {
  const c = ctx.caster
  const pl = c.owner >= 0 ? g.players[c.owner] : undefined
  const need = Number(p.need) || 0
  const unit = String(p.unit)
  if (pl && pl.ep < need) {
    refundCd(c, ctx.ability)
    tell(g, c, 'mut.needEp', { n: need })
    return
  }
  const cap = Number(p.cap) || 0
  if (cap) {
    let have = 0
    for (const e of g.world.ents.values()) if (e.alive && e.owner === c.owner && e.def.id === unit) have++
    if (have >= cap) {
      refundCd(c, ctx.ability)
      tell(g, c, 'mut.capReached', { n: cap })
      return
    }
  }
  ringSpawn(g, c, unit, Number(p.count) || 1, c.radius + 1, String(p.ai ?? 'guard'))
})

reg('mutant.sackBurst', (g, ctx, p) => {
  const sack = ctx.caster
  if (!sack.alive) return
  const leader = g.world.get(sack.master) ?? sack
  const n = Number(p.n) || 3
  for (let i = 0; i < n; i++) {
    const a = (i / n) * Math.PI * 2
    const s = spawnMinion(g, leader, 'mut.swarm', sack.x + Math.cos(a) * 0.8, sack.y + Math.sin(a) * 0.8, 'wander')
    if (s && leader === sack) s.master = 0
  }
  g.emitFx({ k: 'boom', z: sack.zone, x: sack.x, y: sack.y, v: 2 })
  g.killEnt(sack, null, -1)
})

