// 道具：6 格背包、撿起／丟下／給予／交換、使用、充能、防護服換裝
import type { Command } from '../../shared/protocol/messages'
import { abilityDef, itemDef, unitDef, UNITS } from '../../shared/content/registry'
import { NEUTRAL, type Ent, type ItemInst } from '../ent'
import type { Game, GamePlayer } from '../game'
import { EXTRA_COMMANDS, canSee, issue } from './orders'
import { recomputeStats } from './buffs'
import { locArgs } from '../../shared/sysArgs'

let uidSeq = 1

export function makeItem(id: string, charges?: number): ItemInst {
  const d = itemDef(id)
  return { id, charges: charges ?? d?.charges ?? 0, cdUntil: 0, uid: uidSeq++ }
}

/**
 * 這個單位實際帶著的道具：背包＋化身中寄放的道具（packView.extra：顯示用背包收下、自己背包滿了先替他收著的）。
 * 「身上有沒有某道具」的判斷（記憶核心在誰身上、門禁卡、每人限帶一個、攜帶道具的被動…）都用這個（或不建立陣列的 carries／hasItem），
 * 否則寄放中的道具會被當成不存在（例如記憶核心被判定遺失）
 */
export function carriedItems(u: Ent): ItemInst[] {
  const out: ItemInst[] = []
  for (const it of u.inv ?? []) if (it) out.push(it)
  const v = u.data.packView as PackView | undefined
  if (v?.extra.length) out.push(...v.extra)
  return out
}

/** 身上（背包或寄放處，同 carriedItems）有沒有符合條件的道具；常在每 tick、逐一單位的迴圈裡叫，不建立陣列 */
export function carries(u: Ent, pred: (it: ItemInst) => boolean): boolean {
  if (u.inv) for (const it of u.inv) if (it && pred(it)) return true
  const v = u.data.packView as PackView | undefined
  return !!v?.extra.some(pred)
}

export function hasItem(u: Ent, id: string): boolean {
  return carries(u, (it) => it.id === id)
}

/** 從單位身上拿走這件道具（背包或寄放處）；回傳是否找到 */
export function removeCarried(u: Ent, it: ItemInst): boolean {
  const i = u.inv ? u.inv.indexOf(it) : -1
  if (i >= 0) {
    u.inv![i] = null
    u.statsDirty = true
    return true
  }
  const v = u.data.packView as PackView | undefined
  const j = v ? v.extra.indexOf(it) : -1
  if (j < 0) return false
  v!.extra.splice(j, 1)
  u.statsDirty = true
  return true
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

// ───────── 化身的顯示用背包 ─────────

/**
 * 化身（假面者的 xeno.masks）期間別人看到的背包：背包掃描器的結果、交東西給他時「背包滿了沒」都用這份，
 * 不再讀被化身者本人「現在」的背包（否則先交東西給他再掃描、或給予時說滿掃描卻不滿，就能識破；也能遠端看到本人的背包）。
 * - base：化身當下被化身者的背包（道具 id）
 * - had：偽裝者化身當下自己身上道具的 [uid, id]
 * - extra：別人交過來、但偽裝者自己的背包已經滿了的道具（顯示用背包還有空位就照收，先寄放在這裡，有空位時放回背包）
 * 之後偽裝者實際收到、給出、用掉的道具照樣增減這份：比對 uid，多出來的加上去，少掉的從 base 拿掉同種的一件（base 裡沒有就不動）。
 */
interface PackView {
  base: string[]
  had: [number, string][]
  extra: ItemInst[]
}

/** 化身開始：記下顯示用背包（base = 被化身者當時的背包）*/
export function startPackView(u: Ent, base: string[]): void {
  const v: PackView = { base: base.slice(0, packSize(u)), had: [], extra: [] }
  for (const it of u.inv ?? []) if (it) v.had.push([it.uid, it.id])
  u.data.packView = v
}

/** 化身結束：寄放的道具放回背包（滿了掉在腳邊），清掉顯示用背包 */
export function endPackView(g: Game, u: Ent): void {
  const v = u.data.packView as PackView | undefined
  if (!v) return
  u.data.packView = undefined
  for (const it of v.extra) giveItem(g, u, it)
}

/** 化身期間：偽裝者的背包有空位了，就把寄放的道具放回去（之後當成化身後收到的道具，顯示用背包不重複計算）*/
export function flushPackView(g: Game, u: Ent): void {
  const v = u.data.packView as PackView | undefined
  while (v?.extra.length && freeSlot(u) >= 0) giveItem(g, u, v.extra.shift()!)
}

/** 取出寄放的道具（死亡時一起掉落、主單位被替換時搬到新單位、站被毀時跟著消失）*/
export function takePackExtra(u: Ent): ItemInst[] {
  const v = u.data.packView as PackView | undefined
  if (!v?.extra.length) return []
  const out = v.extra
  v.extra = []
  u.statsDirty = true
  return out
}

const packSize = (u: Ent): number => u.inv?.length ?? 6

/** 顯示用背包現在的內容（道具 id）；沒在化身 = null */
export function shownPack(u: Ent): string[] | null {
  const v = u.data.packView as PackView | undefined
  if (!v) return null
  const out = [...v.base]
  const now = (u.inv ?? []).filter((it): it is ItemInst => !!it)
  const nowUids = new Set(now.map((it) => it.uid))
  const hadUids = new Set(v.had.map(([uid]) => uid))
  for (const [uid, id] of v.had) {
    if (nowUids.has(uid)) continue
    const i = out.indexOf(id)
    if (i >= 0) out.splice(i, 1)
  }
  for (const it of now) if (!hadUids.has(it.uid)) out.push(it.id)
  for (const it of v.extra) out.push(it.id)
  const n = packSize(u)
  return out.length > n ? out.slice(out.length - n) : out
}

const packIds = (inv: Ent['inv']): string[] => (inv ?? []).filter((it): it is ItemInst => !!it).map((it) => it.id)

/**
 * 一般人（不是本人、不是同陣營、沒有看穿旗標）掃描 t 看到的背包：
 * - 匿名的樣子（沒在偽裝的匿名形態、繭、蛋、匿名分身，或複製匿名目標的偽裝）：null = 無法辨識
 * - 化身中的偽裝者（或複製他的分身）：顯示用背包
 * - 其他偽裝成某位玩家的樣子（全像分身、殘影），或看起來就是某人本人的分身：那個人本人現在的背包，
 *   和掃描本人得到的一樣（分身照實回報空的會被看穿）；那個人已經不在場上 = 空的
 * - 偽裝成其他無主的東西（生物等）：生物不帶東西，回報空的
 */
export function lookPack(g: Game, t: Ent): string[] | null {
  const fake = t.data.fake as { owner: number; anon?: boolean } | undefined
  if (fake ? fake.anon : t.anon) return null
  const shown = shownPack(t)
  if (shown) return shown
  if (!fake && !(t.illusion && t.data.looksMain)) return packIds(t.inv)
  const looks = fake ? fake.owner : t.owner
  const q = looks >= 0 ? g.players[looks] : undefined
  const m = q ? g.mainOf(q) : undefined
  return m && m.alive ? packIds(m.inv) : []
}

/** 別人交東西給 t 時，t 的背包算不算滿：化身中看顯示用背包，否則看真正的背包 */
export function packFullFor(t: Ent): boolean {
  const shown = shownPack(t)
  return shown ? shown.length >= packSize(t) : freeSlot(t) < 0
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

/** 異類人形時的變身／吞食技能：固定放第一格（Q），和異形、變種人各形態的第一格一致（content/forms），穿脫防護服、職業技能都不會讓它移位 */
const ROLE_FIRST: ReadonlySet<string> = new Set(['xeno.form', 'xeno.spawnForm', 'mut.devour'])

/** 技能清單的快捷鍵順序：異類的變身／吞食技能排到最前面，其餘照原本的順序 */
export function slotOrder(list: string[]): string[] {
  return [...list.filter((a) => ROLE_FIRST.has(a)), ...list.filter((a) => !ROLE_FIRST.has(a))]
}

/** 原地變形：換 def、保留 HP% 與 MP%，重建技能清單 */
export function morph(g: Game, u: Ent, defId: string): void {
  const def = unitDef(defId)
  const hpK = u.hp / u.maxHp
  const mpK = u.maxMp > 0 ? u.mp / u.maxMp : 1
  u.def = def
  u.tags = new Set(def.tags)
  u.maxHp = def.hp * (u.data.hpMult ?? 1) + (u.data.hpAdd ?? 0)
  u.hp = Math.max(1, u.maxHp * hpK)
  u.maxMp = def.mp + (u.data.mpAdd ?? 0)
  u.mp = def.mp * mpK
  u.radius = def.radius
  u.abilities = slotOrder([...def.abilities, ...((u.data.extraAbilities as string[]) ?? [])])
  if (u.suit && !u.abilities.includes('suit.drop')) u.abilities.push('suit.drop')
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
    const z = g.world.zones[u.zone]
    const lim = z.layout ? Math.max(z.layout.w, z.layout.h) + 2 : 60
    order.x = Math.max(-lim, Math.min(lim, c.x))
    order.y = Math.max(-lim, Math.min(lim, c.y))
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
      // 化身中的對象：「背包滿了沒」看顯示用背包（給的人看到的和掃描結果一致）
      if (!packFullFor(t)) {
        u.inv[o.s] = null
        u.statsDirty = true
        t.data.lastGiver = u.id
        const view = t.data.packView as PackView | undefined
        // 顯示用背包還有空位、偽裝者自己的背包卻滿了：照收，先寄放（有空位時放回背包）。
        // 已經帶著一個的限帶道具照一般流程（掉在腳邊並提示），和真正的背包一樣
        if (view && freeSlot(t) < 0 && !(itemDef(it.id)?.unique && hasItem(t, it.id))) {
          view.extra.push(it)
          t.statsDirty = true
          // 只告訴偽裝者本人（全像分身等不是玩家本人的單位不說：分身的擁有者會因此知道複製的是偽裝者）
          if (t.isMain && t.owner >= 0) g.privateLine(t.owner, 'item.heldForYou', locArgs(itemDef(it.id)?.name, 'nz', 'ne', it.id))
        } else giveItem(g, t, it)
        g.onItemLost?.(u, it)
      } else if (u.owner >= 0) {
        // 對方背包滿了：告訴給的人為什麼沒給出去（只有給的人收到，不透露其他資訊）
        g.privateLine(u.owner, 'item.giveFull')
      }
    }
    u.order = u.queue.shift() ?? null
  }
}
