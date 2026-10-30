// AI bots（M9）：填人數、練習模式、headless 對局測試。
// 只透過 handleCommand 下指令（和真人走同一條驗證路徑），只用自己的視野（p.view.visible）挑目標。
// 人類：買防護服、驗血、遇到怪物開火、受傷逃跑；異類：落單時感染、湊夠 EP 就躲起來進化、變身後獵殺。
import type { Command } from '../../shared/protocol/messages'
import { abilityDef, itemDef } from '../../shared/content/registry'
import { HOSTILE, dist2, type Ent } from '../ent'
import type { Game, GamePlayer } from '../game'
import { handleCommand } from '../systems/orders'
import { cdReady } from '../systems/abilities'
import { VENDOR_RANGE, type StockState } from '../systems/vendors'

interface Brain {
  next: number
  goal: Goal | null
  /** 這台檢測器已抽過的目標 */
  drawn: Set<number>
  /** 不能再試的目標（指令失敗）*/
  skip: Map<number, number>
  evolveAt: number
}

type Goal =
  | { k: 'buy'; vendor: number; item: string; until: number }
  | { k: 'goto'; x: number; y: number; until: number }
  | { k: 'hunt'; e: number; until: number }
  | { k: 'flee'; x: number; y: number; until: number }
  | { k: 'cast'; a: string; e: number; until: number; slot?: number }
  | { k: 'results'; vendor: number; until: number }

const SUIT_VENDORS = new Set(['suitA', 'suitB', 'suitC', 'suitD'])

function brainOf(g: Game, p: GamePlayer): Brain {
  return (p.data.brain ??= { next: g.time + g.world.rng.range(1, 3), goal: null, drawn: new Set(), skip: new Map(), evolveAt: 0 }) as Brain
}

function cmd(g: Game, p: GamePlayer, c: Command): void {
  handleCommand(g, p, c)
}

function visibleEnts(g: Game, p: GamePlayer, u: Ent, r: number): Ent[] {
  const out: Ent[] = []
  for (const e of g.world.query(u.zone, u.x, u.y, r)) if (e !== u && e.alive && p.view.visible.has(e.id)) out.push(e)
  return out
}

function nearest(u: Ent, list: Ent[]): Ent | null {
  let best: Ent | null = null
  for (const e of list) if (!best || dist2(u, e) < dist2(u, best)) best = e
  return best
}

const looksHuman = (e: Ent) => e.tags.has('personnel') || e.tags.has('suit')

/** 這個單位對 bot 而言是「敵人」嗎（只看得到外觀：人類 bot 不知道誰是異類）*/
function isFoe(g: Game, p: GamePlayer, e: Ent): boolean {
  if (e.owner === HOSTILE) return !e.tags.has('noTarget')
  if (e.owner < 0 || e.owner === p.slot) return false
  const f = g.faction(p)
  if (f === 'crew') return !looksHuman(e) && !e.tags.has('structure') && !e.tags.has('ship') && !e.tags.has('station') && !e.tags.has('drone') && !e.tags.has('corpse')
  // 異類：同陣營不打
  const o = g.players[e.owner]
  return !!o && g.faction(o) !== f && !e.tags.has('structure') && !e.tags.has('corpse')
}

function itemSlot(u: Ent, id: string): number {
  return u.inv ? u.inv.findIndex((x) => x?.id === id) : -1
}

function vendorWith(g: Game, p: GamePlayer, u: Ent, pred: (ref: string, s: StockState) => boolean): { v: Ent; item: string } | null {
  let best: { v: Ent; item: string } | null = null
  let bd = Infinity
  for (const v of g.world.inZone(u.zone)) {
    if (!v.alive || !v.data.vendor || !v.data.stock) continue
    for (const s of v.data.stock as StockState[]) {
      if (s.count <= 0 || g.time < s.availAt || !pred(v.data.vendor as string, s)) continue
      const d = dist2(u, v)
      if (d < bd) {
        bd = d
        best = { v, item: s.item }
      }
    }
  }
  void p
  return best
}

function randomRoomPoint(g: Game, u: Ent): { x: number; y: number } | null {
  const z = g.world.zones[u.zone]
  const rooms = z.layout?.rooms ?? []
  if (!rooms.length || !z.nav) return null
  const r = g.world.rng.pick(rooms)
  return z.nav.nearestOpen(r.cx + g.world.rng.range(-1.5, 1.5), r.cy + g.world.rng.range(-1.5, 1.5))
}

// ───────── 目標執行 ─────────

function pursue(g: Game, p: GamePlayer, u: Ent, b: Brain): boolean {
  const goal = b.goal
  if (!goal) return false
  if (g.time > goal.until) {
    b.goal = null
    return false
  }
  switch (goal.k) {
    case 'buy':
    case 'results': {
      const v = g.world.get(goal.vendor)
      if (!v || !v.alive || v.zone !== u.zone) return (b.goal = null), false
      const r = VENDOR_RANGE + v.radius - 0.3
      if (dist2(u, v) > r * r) {
        if (u.order?.k !== 'move') cmd(g, p, { k: 'move', x: v.x, y: v.y })
        return true
      }
      cmd(g, p, { k: 'buy', e: v.id, a: goal.k === 'buy' ? goal.item : 'testResults' })
      b.goal = null
      return true
    }
    case 'goto':
    case 'flee': {
      if (Math.hypot(u.x - goal.x, u.y - goal.y) < 1.2) return (b.goal = null), false
      if (!u.order || u.order.k !== 'move') cmd(g, p, { k: 'move', x: goal.x, y: goal.y })
      return true
    }
    case 'hunt': {
      const t = g.world.get(goal.e)
      if (!t || !t.alive || t.zone !== u.zone || !p.view.visible.has(t.id)) return (b.goal = null), false
      if (u.order?.k !== 'attack' || u.order.e !== t.id) cmd(g, p, { k: 'attack', e: t.id })
      return true
    }
    case 'cast': {
      const t = g.world.get(goal.e)
      if (!t || !t.alive || t.zone !== u.zone || !p.view.visible.has(t.id)) return (b.goal = null), false
      if (u.cast) return true
      const ab = abilityDef(goal.slot !== undefined ? (itemDef(u.inv?.[goal.slot]?.id ?? '')?.use ?? '') : goal.a)
      const range = (ab?.range ?? 1.4) + u.radius + t.radius - 0.2
      if (dist2(u, t) > range * range) {
        if (u.order?.k !== 'follow' || u.order.e !== t.id) cmd(g, p, { k: 'follow', e: t.id })
        return true
      }
      if (goal.slot !== undefined) cmd(g, p, { k: 'use', s: goal.slot, e: t.id })
      else cmd(g, p, { k: 'cast', a: goal.a, e: t.id })
      b.skip.set(t.id, g.time + 20)
      b.goal = null
      return true
    }
  }
}

// ───────── 決策 ─────────

function thinkCrew(g: Game, p: GamePlayer, u: Ent, b: Brain): void {
  const near = visibleEnts(g, p, u, 10)
  // 受傷過重：逃
  if (u.hp < u.maxHp * 0.3 && g.time - u.lastDamageTime < 4) {
    const kit = ['traumaKit', 'mediSwarm'].map((id) => itemSlot(u, id)).find((s) => s >= 0)
    if (kit !== undefined && kit >= 0) cmd(g, p, { k: 'use', s: kit })
    const pt = randomRoomPoint(g, u)
    if (pt) b.goal = { k: 'flee', ...pt, until: g.time + 8 }
    return
  }
  // 反擊／看到怪物
  const attacker = g.world.get(u.lastHitBy)
  if (attacker && attacker.alive && g.time - u.lastDamageTime < 3 && p.view.visible.has(attacker.id) && attacker.zone === u.zone && attacker.owner !== p.slot) {
    b.goal = { k: 'hunt', e: attacker.id, until: g.time + 10 }
    return
  }
  const foe = nearest(u, near.filter((e) => isFoe(g, p, e)))
  if (foe && u.def.attack) {
    b.goal = { k: 'hunt', e: foe.id, until: g.time + 10 }
    return
  }
  // 驗血
  const res = itemSlot(u, 'gitResolver')
  if (res >= 0) {
    cmd(g, p, { k: 'use', s: res, x: u.x + 0.8, y: u.y })
    return
  }
  const mine = g.world.inZone(u.zone).find((e) => e.alive && e.data.vendor === 'gitResolver' && e.owner === p.slot && p.view.visible.has(e.id))
  if (mine && ((mine.data.stock as StockState[] | undefined)?.some((s) => s.count > 0 && g.time >= s.availAt) ?? false)) {
    b.goal = { k: 'results', vendor: mine.id, until: g.time + 20 }
    return
  }
  const sampler = itemSlot(u, 'geneSampler')
  if (sampler >= 0) {
    const who = nearest(
      u,
      near.filter((e) => e.isMain && e.owner >= 0 && looksHuman(e) && !b.drawn.has(e.owner) && (b.skip.get(e.id) ?? 0) < g.time),
    )
    const self = !b.drawn.has(p.slot) ? u : null
    const t = who ?? self
    if (t) {
      b.drawn.add(t.owner)
      b.goal = { k: 'cast', a: 'ab.item.geneSampler', e: t.id, slot: sampler, until: g.time + 15 }
      return
    }
  } else if (g.time > 420 && !p.data.botTested) {
    const v = vendorWith(g, p, u, (_ref, s) => s.item === 'geneSampler')
    if (v) {
      b.drawn.clear()
      p.data.botTested = true
      b.goal = { k: 'buy', vendor: v.v.id, item: v.item, until: g.time + 30 }
      return
    }
  }
  // 防護服
  if (!u.suit && u.tags.has('personnel')) {
    const have = u.inv?.findIndex((x) => !!x && !!itemDef(x.id)?.suit) ?? -1
    if (have >= 0) {
      cmd(g, p, { k: 'use', s: have })
      return
    }
    if (!p.data.botSuitTried) {
      const v = vendorWith(g, p, u, (ref) => SUIT_VENDORS.has(ref))
      if (v) {
        p.data.botSuitTried = true
        b.goal = { k: 'buy', vendor: v.v.id, item: v.item, until: g.time + 40 }
        return
      }
    }
  }
  wander(g, p, u, b)
}

function thinkEvil(g: Game, p: GamePlayer, u: Ent, b: Brain): void {
  const near = visibleEnts(g, p, u, 12)
  const crew = near.filter((e) => e.isMain && e.owner >= 0 && g.faction(g.players[e.owner]!) === 'crew' && looksHuman(e))
  const close = crew.filter((e) => dist2(e, u) < 8 * 8)
  const humanForm = looksHuman(u)
  const ready = (a: string) => {
    const ab = abilityDef(a)
    return !!ab && u.abilities.includes(a) && cdReady(g, u, ab) && (ab.mana ?? 0) <= u.mp
  }
  // 進化：EP 夠、附近沒有人類
  const opts = g.evolveOptions(p)
  if (opts.length && !crew.some((e) => dist2(e, u) < 12 * 12) && g.time >= b.evolveAt && u.zone !== 0) {
    b.evolveAt = g.time + 30
    cmd(g, p, { k: 'evolve', a: g.world.rng.pick(opts) })
    return
  }
  // 變種人：吞小動物累積 EP（人形與怪物形態都可以）
  if (ready('mut.devour')) {
    const food = nearest(u, near.filter((e) => !!e.def.devourEp && e.owner < 0 && e.alive && !e.isMain))
    if (food && !close.length) {
      b.goal = { k: 'cast', a: 'mut.devour', e: food.id, until: g.time + 10 }
      return
    }
  }
  const infect = ['xeno.parasite', 'mut.prion3', 'mut.prion2', 'mut.prion'].find((a) => ready(a))
  if (humanForm) {
    // 落單的人類就在眼前：異形先變身再寄生；變種人人形沒有感染技能，只能先進化
    if (close.length === 1 && crew.length === 1 && (b.skip.get(close[0].id) ?? 0) < g.time) {
      if (infect) {
        b.goal = { k: 'cast', a: infect, e: close[0].id, until: g.time + 12 }
        return
      }
      const form = ['xeno.form', 'xeno.spawnForm'].find((a) => ready(a))
      if (form) {
        cmd(g, p, { k: 'cast', a: form })
        p.data.botShiftAt = g.time
        return
      }
    }
    // 被打就變身反擊
    if (g.time - u.lastDamageTime < 2) {
      const form = ['xeno.form', 'xeno.spawnForm'].find((a) => ready(a))
      if (form) {
        cmd(g, p, { k: 'cast', a: form })
        p.data.botShiftAt = g.time
        return
      }
    }
    wander(g, p, u, b)
    return
  }
  // 怪物形態
  if (infect && close.length) {
    const t = nearest(u, close.filter((e) => (b.skip.get(e.id) ?? 0) < g.time))
    if (t) {
      b.goal = { k: 'cast', a: infect, e: t.id, until: g.time + 8 }
      return
    }
  }
  // 太多人看到、或寄生完一陣子：變回人形
  const back = ['xeno.human', 'xeno.spawnHuman'].find((a) => ready(a))
  if (back && (crew.length >= 3 || (!crew.length && g.time - ((p.data.botShiftAt as number) ?? 0) > 25))) {
    cmd(g, p, { k: 'cast', a: back })
    return
  }
  // 沒人時下蛋
  if (!crew.length && ready('xeno.egg') && g.world.rng.chance(0.3)) {
    cmd(g, p, { k: 'cast', a: 'xeno.egg', x: u.x + 0.8, y: u.y })
    return
  }
  const foe = nearest(u, near.filter((e) => isFoe(g, p, e)))
  if (foe && (crew.length <= 2 || p.tier >= 2)) {
    for (const a of u.abilities) {
      const ab = abilityDef(a)
      if (!ab || ab.target !== 'unit' || !ready(a) || ab.passiveBuff || a.startsWith('xeno.') || a.startsWith('mut.')) continue
      if (g.world.rng.chance(0.3)) {
        b.goal = { k: 'cast', a, e: foe.id, until: g.time + 6 }
        return
      }
    }
    b.goal = { k: 'hunt', e: foe.id, until: g.time + 12 }
    return
  }
  wander(g, p, u, b)
}

function wander(g: Game, p: GamePlayer, u: Ent, b: Brain): void {
  if (u.order) return
  if (!g.world.rng.chance(0.4)) return
  const pt = randomRoomPoint(g, u)
  if (pt) b.goal = { k: 'goto', ...pt, until: g.time + 25 }
  void p
}

function stepBots(g: Game): void {
  if (g.ended) return
  const t = g.time
  for (const p of g.allPlayers()) {
    if (!p.bot || p.spectator) continue
    const b = brainOf(g, p)
    if (t < b.next) continue
    b.next = t + 0.5 + g.world.rng.range(0, 0.3)
    // 死亡模式投票：bots 一律選觀戰
    if (p.alive && g.votes.death && !g.votes.death.ballots.has(p.slot)) g.handleVote(p.slot, 'spectate')
    if (!p.alive) continue
    const u = g.controlOf(p)
    if (!u || !u.alive || u.data.frozen || p.evolvingUntil > t || u.tags.has('cocoon')) continue
    if (u.zone === 0) continue
    if (pursue(g, p, u, b)) {
      // 追擊中仍會優先處理逃跑
      if (b.goal?.k !== 'flee' && u.hp < u.maxHp * 0.25 && g.faction(p) === 'crew') b.goal = null
      continue
    }
    if (g.faction(p) === 'crew') thinkCrew(g, p, u, b)
    else thinkEvil(g, p, u, b)
  }
}

const installed = new WeakSet<Game>()

export function installBots(g: Game): void {
  if (installed.has(g)) return
  installed.add(g)
  if (!g.allPlayers().some((p) => p.bot)) return
  g.systems.push({ name: 'bots', fn: stepBots })
}
