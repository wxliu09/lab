// 道具：6 格背包、撿起／丟下／給予／交換、使用、充能、防護服換裝
import type { Command } from '../../shared/protocol/messages'
import { abilityDef, itemDef, unitDef, UNITS } from '../../shared/content/registry'
import { NEUTRAL, type Ent, type ItemInst } from '../ent'
import type { Game, GamePlayer } from '../game'
import { EXTRA_COMMANDS, canSee, issue } from './orders'
import { recomputeStats } from './buffs'

let uidSeq = 1

export function makeItem(id: string, charges?: number): ItemInst {
  const d = itemDef(id)
  return { id, charges: charges ?? d?.charges ?? 0, cdUntil: 0, uid: uidSeq++ }
}

export function hasItem(u: Ent, id: string): boolean {
  return !!u.inv?.some((it) => it?.id === id)
}

export function freeSlot(u: Ent): number {
  return u.inv ? u.inv.findIndex((x) => x === null) : -1
}

/** 放進背包；滿了掉在腳邊。回傳格號（-1 = 掉地上）*/
export function giveItem(g: Game, u: Ent, it: ItemInst): number {
  const def = itemDef(it.id)
  if (def?.unique && hasItem(u, it.id)) {
    dropOnGround(g, u.zone, u.x, u.y, it)
    if (u.owner >= 0) g.privateLine(u.owner, 'item.uniqueOnly')
    return -1
  }
  const s = freeSlot(u)
  if (s < 0 || !u.inv) {
    dropOnGround(g, u.zone, u.x, u.y, it)
    return -1
  }
  u.inv[s] = it
  u.statsDirty = true
  g.onItemGained?.(u, it)
  return s
}

export function dropOnGround(g: Game, zone: number, x: number, y: number, it: ItemInst): Ent {
  const z = g.world.zones[zone]
  let px = x + g.world.rng.range(-0.5, 0.5)
  let py = y + g.world.rng.range(-0.5, 0.5)
  if (z.nav) {
    const n = z.nav.nearestOpen(px, py)
    if (n) {
      px = n.x
      py = n.y
    }
  }
  const e = g.world.spawn(unitDef('groundItem'), zone, px, py, NEUTRAL)
  e.data.item = it
  e.data.viewDef = 'item:' + it.id
  e.x2 = { item: it.id }
  return e
}

export function consumeCharge(g: Game, u: Ent, slot: number): void {
  const it = u.inv?.[slot]
  if (!it) return
  const d = itemDef(it.id)
  if (!d || d.charges === 0) return
  it.charges--
  if (it.charges <= 0 && !d.keepEmpty) {
    u.inv![slot] = null
    u.statsDirty = true
  }
  void g
}

// ───────── 防護服 ─────────

export function canWearSuit(u: Ent): boolean {
  return u.tags.has('personnel') && !u.data.noSuit
}

/** 穿上防護服＝把人員單位變成著裝單位（HP% 保留）*/
export function wearSuit(g: Game, u: Ent, slot: number): boolean {
  const it = u.inv?.[slot]
  const d = it ? itemDef(it.id) : undefined
  if (!it || !d?.suit || !canWearSuit(u)) return false
  const suitDef = UNITS.get(d.suit)
  if (!suitDef) return false
  u.inv![slot] = null
  if (u.suit) {
    const old = u.suit
    u.suit = null
    giveItem(g, u, old)
  }
  u.suit = it
  morph(g, u, d.suit)
  g.emitFx({ k: 'suitOn', z: u.zone, x: u.x, y: u.y, e: u.id, s: d.suit })
  return true
}

export function removeSuit(g: Game, u: Ent): boolean {
  if (!u.suit) return false
  const it = u.suit
  u.suit = null
  morph(g, u, u.data.baseDef ?? 'personnel')
  giveItem(g, u, it)
  g.emitFx({ k: 'suitOff', z: u.zone, x: u.x, y: u.y, e: u.id })
  return true
}

/** 原地變形：換 def、保留 HP% 與 MP%，重建技能清單 */
export function morph(g: Game, u: Ent, defId: string): void {
  const def = unitDef(defId)
  const hpK = u.hp / u.maxHp
  const mpK = u.maxMp > 0 ? u.mp / u.maxMp : 1
  u.def = def
  u.tags = new Set(def.tags)
  u.maxHp = def.hp * (u.data.hpMult ?? 1)
  u.hp = Math.max(1, u.maxHp * hpK)
  u.maxMp = def.mp
  u.mp = def.mp * mpK
  u.radius = def.radius
  u.abilities = [...def.abilities, ...((u.data.extraAbilities as string[]) ?? [])]
  if (u.suit) u.abilities.push('suit.drop')
  u.autocast = new Set([...u.autocast].filter((a) => u.abilities.includes(a)))
  u.atkReady = g.time + 0.3
  u.statsDirty = true
  recomputeStats(u)
  g.onMorph?.(u)
}

// ───────── 指令 ─────────

function useItem(g: Game, p: GamePlayer, u: Ent, c: Command): void {
  if (c.s === undefined || !u.inv) return
  const it = u.inv[c.s]
  if (!it) return
  const d = itemDef(it.id)
  if (!d) return
  if (it.cdUntil > g.time) return
  if (d.suit) {
    if (!wearSuit(g, u, c.s)) g.privateLine(p.slot, 'item.cantSuit')
    return
  }
  if (!d.use) return
  const ab = abilityDef(d.use)
  if (!ab) return
  const order = { k: 'cast' as const, a: ab.id, itemSlot: c.s, e: undefined as number | undefined, x: undefined as number | undefined, y: undefined as number | undefined }
  if (ab.target === 'unit' || ab.target === 'unitOrPoint') {
    if (c.e !== undefined) {
      if (c.e !== u.id && !canSee(g, p, c.e)) return
      order.e = c.e
    } else if (ab.target === 'unit') return
  }
  if (order.e === undefined && (ab.target === 'point' || ab.target === 'unitOrPoint')) {
    if (c.x === undefined || c.y === undefined) return
    order.x = c.x
    order.y = c.y
  }
  if (ab.target === 'none' || ab.target === 'self') {
    order.x = u.x
    order.y = u.y
  }
  issue(u, order, c.q)
}

function dropCmd(g: Game, _p: GamePlayer, u: Ent, c: Command): void {
  if (c.s === undefined || !u.inv?.[c.s]) return
  const it = u.inv[c.s]!
  if (itemDef(it.id)?.cat === 'key' && it.data?.bound) return
  u.inv[c.s] = null
  u.statsDirty = true
  dropOnGround(g, u.zone, u.x, u.y, it)
  g.onItemLost?.(u, it)
}

function swapCmd(_g: Game, _p: GamePlayer, u: Ent, c: Command): void {
  if (c.s === undefined || c.x === undefined || !u.inv) return
  const a = c.s
  const b = Math.floor(c.x)
  if (b < 0 || b >= u.inv.length || a >= u.inv.length) return
  const tmp = u.inv[a]
  u.inv[a] = u.inv[b]
  u.inv[b] = tmp
}

function pickupCmd(g: Game, p: GamePlayer, u: Ent, c: Command): void {
  if (c.e === undefined || !canSee(g, p, c.e)) return
  const t = g.world.get(c.e)
  if (!t || !t.data.item || t.zone !== u.zone) return
  issue(u, { k: 'pickup', e: t.id }, c.q)
}

function giveCmd(g: Game, p: GamePlayer, u: Ent, c: Command): void {
  if (c.e === undefined || c.s === undefined || !canSee(g, p, c.e)) return
  const t = g.world.get(c.e)
  if (!t || !t.inv || t.zone !== u.zone || !u.inv?.[c.s]) return
  issue(u, { k: 'give', e: t.id, s: c.s }, c.q)
}

EXTRA_COMMANDS.set('use', useItem)
EXTRA_COMMANDS.set('drop', dropCmd)
EXTRA_COMMANDS.set('swapItem', swapCmd)
EXTRA_COMMANDS.set('pickup', pickupCmd)
EXTRA_COMMANDS.set('give', giveCmd)

/** 撿起與給予在抵達後完成 */
export function stepItemOrders(g: Game): void {
  for (const u of g.world.ents.values()) {
    const o = u.order
    if (!u.alive || !o || (o.k !== 'pickup' && o.k !== 'give')) continue
    const t = g.world.get(o.e!)
    if (!t || t.zone !== u.zone) {
      u.order = null
      continue
    }
    const r = 1.4 + t.radius
    if ((t.x - u.x) ** 2 + (t.y - u.y) ** 2 > r * r) continue
    if (o.k === 'pickup') {
      const it = t.data.item as ItemInst | undefined
      if (it && u.inv) {
        if (freeSlot(u) < 0) {
          if (u.owner >= 0) g.privateLine(u.owner, 'item.full')
        } else {
          g.world.remove(t)
          giveItem(g, u, it)
        }
      }
    } else if (o.s !== undefined && u.inv?.[o.s] && t.inv) {
      const it = u.inv[o.s]!
      if (freeSlot(t) >= 0) {
        u.inv[o.s] = null
        u.statsDirty = true
        giveItem(g, t, it)
        g.onItemLost?.(u, it)
      }
    }
    u.order = u.queue.shift() ?? null
  }
}
