// 販賣機（研究 03 §5）：免費取用，靠庫存上限、補貨秒數、開局延遲控制；可被摧毀、電磁停機、變種人污染
import type { Command } from '../../shared/protocol/messages'
import { VENDORS, itemDef } from '../../shared/content/registry'
import type { Ent } from '../ent'
import type { Game, GamePlayer } from '../game'
import { EXTRA_COMMANDS, canSee } from './orders'
import { freeSlot, giveItem, hasItem, makeItem } from './items'

export interface StockState {
  item: string
  count: number
  max: number
  restock: number
  availAt: number
  nextAt: number
  /** 開局延遲過後是否已上架 */
  started: boolean
}

export const VENDOR_RANGE = 2.6

/** 立即生效的商品（雷達掃描、逃生艙、檢測報告…）：買到就使用 */
export const INSTANT_ITEMS = new Map<string, (g: Game, buyer: Ent, vendor: Ent) => boolean>()

export function initVendor(g: Game, e: Ent): void {
  const v = VENDORS.get(e.data.vendor as string)
  if (!v) return
  e.data.stock = v.stock.map<StockState>((s) => ({
    item: s.item,
    count: s.delay ? 0 : s.max,
    max: s.max,
    restock: s.restock,
    availAt: s.delay ?? 0,
    nextAt: s.delay ?? 0,
    started: !s.delay,
  }))
  updateVendorView(g, e)
}

export function updateVendorView(g: Game, e: Ent): void {
  const st = e.data.stock as StockState[] | undefined
  if (!st) return
  const t = g.time
  const parts: string[] = []
  for (const s of st) {
    const wait = s.count < s.max ? Math.max(0, Math.ceil((t < s.availAt ? s.availAt : s.nextAt) - t)) : 0
    parts.push(`${s.item}:${s.count}:${wait}`)
  }
  e.x2 = { s: parts.join('|'), off: (e.data.disabledUntil ?? 0) > t ? Math.ceil(e.data.disabledUntil - t) : 0, taint: !!e.data.tainted && false }
}

export function stepVendors(g: Game): void {
  if (g.world.tick % 10 !== 0) return
  const t = g.time
  for (const e of g.world.ents.values()) {
    const st = e.data.stock as StockState[] | undefined
    if (!st || !e.alive) continue
    for (const s of st) {
      if (t < s.availAt) continue
      if (!s.started) {
        // 開局延遲結束：一次上架到滿
        s.started = true
        s.count = s.max
        s.nextAt = t + s.restock
        continue
      }
      if (s.count >= s.max) {
        s.nextAt = t + s.restock
        continue
      }
      if (s.restock > 0 && t >= s.nextAt) {
        s.count++
        s.nextAt = t + s.restock
      }
    }
    updateVendorView(g, e)
  }
}

export function restockAll(g: Game, vendorRef?: string): number {
  let n = 0
  for (const e of g.world.ents.values()) {
    const st = e.data.stock as StockState[] | undefined
    if (!st || !e.alive || (vendorRef && e.data.vendor !== vendorRef)) continue
    for (const s of st) {
      s.count = s.max
      s.started = true
      s.availAt = Math.min(s.availAt, g.time)
    }
    updateVendorView(g, e)
    n++
  }
  return n
}

function buy(g: Game, p: GamePlayer, u: Ent, c: Command): void {
  if (c.e === undefined || !c.a || !canSee(g, p, c.e)) return
  const v = g.world.get(c.e)
  if (!v || !v.alive || v.zone !== u.zone) return
  const st = v.data.stock as StockState[] | undefined
  if (!st) return
  if ((u.x - v.x) ** 2 + (u.y - v.y) ** 2 > (VENDOR_RANGE + v.radius) ** 2) {
    g.privateLine(p.slot, 'vendor.tooFar')
    return
  }
  if ((v.data.disabledUntil ?? 0) > g.time) {
    g.privateLine(p.slot, 'vendor.offline')
    return
  }
  const s = st.find((x) => x.item === c.a)
  if (!s || s.count <= 0 || g.time < s.availAt) {
    g.privateLine(p.slot, 'vendor.soldOut')
    return
  }
  const d = itemDef(s.item)
  if (!d) return
  const instant = INSTANT_ITEMS.get(s.item)
  if (instant) {
    if (!instant(g, u, v)) return
  } else {
    if (!u.inv || freeSlot(u) < 0) {
      g.privateLine(p.slot, 'item.full')
      return
    }
    if (d.unique && hasItem(u, s.item)) {
      g.privateLine(p.slot, 'item.uniqueOnly')
      return
    }
    giveItem(g, u, makeItem(s.item))
  }
  s.count--
  if (s.count < s.max && s.nextAt < g.time) s.nextAt = g.time + s.restock
  g.onBuy?.(u, v, s.item)
  updateVendorView(g, v)
  g.emitFx({ k: 'vend', z: v.zone, x: v.x, y: v.y, e: v.id, s: s.item })
}

EXTRA_COMMANDS.set('buy', buy)
