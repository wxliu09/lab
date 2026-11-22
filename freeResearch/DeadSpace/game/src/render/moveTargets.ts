// 右鍵移動的目標修正（純函式，只看站體版面；input.ts 與小地圖共用，單元測試直接驗證）：
// - 右鍵控制台：走到「控制圈」裡真的站得到的位置（控制台本體是實心的，送中心點會被尋路改到最近的可走格，常常是控制台後面的牆邊）。
// - 剛交出控制台（B／停靠）還站在圈裡：先退出圈外解開交還鎖，再走回來（sim 要離開控制台範圍才會讓同一人重新駕駛）。
// - 小地圖右鍵：目標落在控制圈裡就推到圈外（小地圖上點不出「去駕駛」）；點到牆或實心設施改成同房間最近的可走格。
import { Cell, type ParsedLayout } from '../shared/layout'

export interface Pt {
  x: number
  y: number
}

/**
 * 控制圈半徑（公尺）：sim 的 systems/space.ts CONSOLE_R。sim 用 world.query(控制台中心, CONSOLE_R) 找駕駛，
 * query 會加上單位的身體半徑，所以實際判定是「中心距 ≤ CONSOLE_R + 身體半徑」。改 sim 的值時這裡要一起改
 * （tests/unit/moveTargets.test.ts 會用真的 sim 驗證站上去會不會開始駕駛）。
 */
export const CONSOLE_R = 1.0
/** 交還控制台的鎖：離控制台中心超過 CONSOLE_R + 身體半徑 + 這個餘裕才解開（space.ts consoleLock）*/
export const CONSOLE_LOCK_PAD = 0.3
/** sim 的移動指令離目標多近就算到（systems/movement.ts ARRIVE）*/
export const ARRIVE = 0.15
/** 人員的身體半徑（UnitDef 查不到時用）*/
export const DEFAULT_BODY_R = 0.4

/** 會讓人「站上去就駕駛」的控制台：站點主控台（console）與船艙控制台（shipConsole，sim 不生成實體，只記位置）*/
export const CONSOLE_KINDS: ReadonlySet<string> = new Set(['console', 'shipConsole'])

export interface ConsoleSpot extends Pt {
  col: number
  row: number
  kind: string
}

/** 版面上所有控制台（格中心＝sim 的控制圈中心：站點主控台實體生成在 POI 格中心；船艙控制台記的就是 POI 座標）*/
export function consoleSpots(l: ParsedLayout): ConsoleSpot[] {
  return l.pois.filter((p) => CONSOLE_KINDS.has(p.def.kind)).map((p) => ({ x: p.x, y: p.y, col: p.col, row: p.row, kind: p.def.kind }))
}

/** 擋路的格子（同 sim nav/grid.ts 的 solid：牆、太空、窗、貨箱、設施；門算可走）*/
function solidCell(l: ParsedLayout, col: number, row: number): boolean {
  if (col < 0 || row < 0 || col >= l.w || row >= l.h) return true
  const c = l.cells[row * l.w + col] as Cell
  return c === Cell.Wall || c === Cell.Void || c === Cell.Window || c === Cell.Crate || c === Cell.Fixture
}

/** 公尺座標 → 格 index（界外 -1）*/
function idxAt(l: ParsedLayout, x: number, y: number): number {
  const col = Math.floor(x)
  const row = l.h - 1 - Math.floor(y)
  if (col < 0 || row < 0 || col >= l.w || row >= l.h) return -1
  return row * l.w + col
}

/** 半徑 r 的身體放在 (x, y) 不會碰到擋路的格子（同 nav/grid.ts circleBlocked 的判斷）*/
export function circleClear(l: ParsedLayout, x: number, y: number, r: number): boolean {
  for (let cy = Math.floor(y - r); cy <= Math.floor(y + r); cy++) {
    for (let cx = Math.floor(x - r); cx <= Math.floor(x + r); cx++) {
      if (!solidCell(l, cx, l.h - 1 - cy)) continue
      const nx = Math.max(cx, Math.min(x, cx + 1))
      const ny = Math.max(cy, Math.min(y, cy + 1))
      if ((nx - x) ** 2 + (ny - y) ** 2 < r * r - 1e-6) return false
    }
  }
  return true
}

/**
 * 從 from 走得到的格子（4 方向漫延，門一律當作可走；client 不知道門禁與動態障礙，交給 sim 再判斷）。
 * from 落在擋路的格子上（貼著設施站）時從旁邊最近的可走格開始。
 */
export function reachFrom(l: ParsedLayout, from: Pt): Uint8Array {
  const seen = new Uint8Array(l.w * l.h)
  let start = idxAt(l, from.x, from.y)
  if (start < 0 || solidCell(l, start % l.w, Math.floor(start / l.w))) {
    start = -1
    let best = Infinity
    const c0 = Math.floor(from.x)
    const y0 = Math.floor(from.y)
    for (let dy = -1; dy <= 1; dy++)
      for (let dx = -1; dx <= 1; dx++) {
        const i = idxAt(l, c0 + dx + 0.5, y0 + dy + 0.5)
        if (i < 0 || solidCell(l, i % l.w, Math.floor(i / l.w))) continue
        const d = (c0 + dx + 0.5 - from.x) ** 2 + (y0 + dy + 0.5 - from.y) ** 2
        if (d < best) {
          best = d
          start = i
        }
      }
    if (start < 0) return seen
  }
  const stack = [start]
  seen[start] = 1
  while (stack.length) {
    const i = stack.pop()!
    const col = i % l.w
    const row = (i - col) / l.w
    for (const [dc, dr] of DIR4) {
      const c = col + dc
      const r = row + dr
      if (solidCell(l, c, r)) continue
      const j = r * l.w + c
      if (seen[j]) continue
      seen[j] = 1
      stack.push(j)
    }
  }
  return seen
}

const DIR4: [number, number][] = [
  [1, 0],
  [-1, 0],
  [0, 1],
  [0, -1],
]

/** 圓周上取樣的方向數 */
const DIRS = 24

/** 這一點站得下（身體不碰牆）而且走得到 */
function standable(l: ParsedLayout, p: Pt, r: number, reach: Uint8Array | null): boolean {
  if (!circleClear(l, p.x, p.y, r)) return false
  if (!reach) return true
  const i = idxAt(l, p.x, p.y)
  return i >= 0 && reach[i] === 1
}

/** 控制圈裡要站的距離：比觸發距離（CONSOLE_R + 身體半徑）少 0.25 m，扣掉 ARRIVE 的誤差還在圈內；又比控制台本體（半徑約 0.6 m）＋身體遠，不會被擠開 */
export function standDist(bodyR: number): number {
  return CONSOLE_R + bodyR - 0.25
}

/** 退到圈外解鎖的距離：超過解鎖距離（CONSOLE_R + 身體半徑 + CONSOLE_LOCK_PAD）再加 ARRIVE 與餘裕 */
export function outDist(bodyR: number): number {
  return CONSOLE_R + bodyR + CONSOLE_LOCK_PAD + ARRIVE + 0.25
}

export interface ConsoleApproach {
  /** 控制圈裡站得到、離自己最近的一點（走到這裡就會開始駕駛）*/
  stand: Pt
  /** 同一側圈外的一點（剛交出控制台時先退到這裡解鎖）；那一側退不出去時是 null */
  out: Pt | null
}

/**
 * 右鍵控制台要走去哪裡：控制圈裡站得下、走得到、離 from 最近的一點（不會繞到控制台後面的牆邊）。
 * reach = reachFrom(l, from)（省略就不檢查走不走得到）。圈裡完全站不下回傳 null（呼叫端退回走到中心）。
 */
export function consoleApproach(l: ParsedLayout, c: Pt, from: Pt, bodyR = DEFAULT_BODY_R, reach: Uint8Array | null = null): ConsoleApproach | null {
  const din = standDist(bodyR)
  const dout = outDist(bodyR)
  let best: ConsoleApproach | null = null
  let bestD = Infinity
  for (let k = 0; k < DIRS; k++) {
    const a = (k / DIRS) * Math.PI * 2
    const ux = Math.cos(a)
    const uy = Math.sin(a)
    const stand = { x: c.x + ux * din, y: c.y + uy * din }
    if (!standable(l, stand, bodyR, reach)) continue
    const o = { x: c.x + ux * dout, y: c.y + uy * dout }
    const out = standable(l, o, bodyR, reach) ? o : null
    // 同樣近時，優先選退得出去的那一側（剛交出控制台時才有路解鎖）
    const d = Math.hypot(stand.x - from.x, stand.y - from.y) + (out ? 0 : 0.6)
    if (d < bestD) {
      bestD = d
      best = { stand, out }
    }
  }
  return best
}

/** 點 p 落在哪個控制台的控制圈裡（身體半徑 bodyR 的人站在 p 會開始駕駛）；不在任何圈裡回傳 null */
export function consoleAt(spots: readonly ConsoleSpot[], p: Pt, bodyR = DEFAULT_BODY_R, pad = 0): ConsoleSpot | null {
  for (const s of spots) if (Math.hypot(p.x - s.x, p.y - s.y) <= CONSOLE_R + bodyR + pad) return s
  return null
}

/** 線段 a→b 離點 c 最近的距離 */
function segDist(a: Pt, b: Pt, c: Pt): number {
  const dx = b.x - a.x
  const dy = b.y - a.y
  const len2 = dx * dx + dy * dy
  const k = len2 > 1e-9 ? Math.max(0, Math.min(1, ((c.x - a.x) * dx + (c.y - a.y) * dy) / len2)) : 0
  return Math.hypot(a.x + dx * k - c.x, a.y + dy * k - c.y)
}

/**
 * 把 p 推出所有控制台的控制圈（小地圖右鍵：不要一點就走上控制台被切去駕駛）。
 * 方向偏向「房間內側」與「自己走過來的那一側」（from；再稍微參考點的那一側），只考慮站得下、走得到的點；
 * 直線走過去會擦過控制圈的方向扣分（路上踩進圈裡一樣會開始駕駛）。推到圈外 ARRIVE＋0.3 m。推不出去回傳 null。
 */
export function pushOutOfConsoles(l: ParsedLayout, p: Pt, spots: readonly ConsoleSpot[], bodyR = DEFAULT_BODY_R, reach: Uint8Array | null = null, from: Pt | null = null): Pt | null {
  const s = consoleAt(spots, p, bodyR, ARRIVE + 0.1)
  if (!s) return p
  const room = l.roomOf[s.row * l.w + s.col]
  const inner = room >= 0 ? l.rooms[room] : undefined
  const unit = (dx: number, dy: number): Pt => {
    const d = Math.hypot(dx, dy)
    return d > 1e-3 ? { x: dx / d, y: dy / d } : { x: 0, y: 0 }
  }
  const toIn = inner ? unit(inner.cx - s.x, inner.cy - s.y) : { x: 0, y: 0 }
  const toFrom = from ? unit(from.x - s.x, from.y - s.y) : { x: 0, y: 0 }
  const toP = unit(p.x - s.x, p.y - s.y)
  let pref = unit(toIn.x + toFrom.x + toP.x * 0.5, toIn.y + toFrom.y + toP.y * 0.5)
  if (!pref.x && !pref.y) pref = { x: 0, y: -1 }
  const trig = CONSOLE_R + bodyR + 0.05
  for (const extra of [0, 0.5, 1, 1.5]) {
    const d = CONSOLE_R + bodyR + ARRIVE + 0.3 + extra
    let best: Pt | null = null
    let bestScore = -Infinity
    for (let k = 0; k < DIRS; k++) {
      const a = (k / DIRS) * Math.PI * 2
      const q = { x: s.x + Math.cos(a) * d, y: s.y + Math.sin(a) * d }
      if (!standable(l, q, bodyR, reach)) continue
      // 推出這一台之後別又落進另一台的圈裡（船艙很小）
      if (consoleAt(spots, q, bodyR, ARRIVE + 0.1)) continue
      const clips = !!from && spots.some((c) => segDist(from, q, c) < trig)
      const score = Math.cos(a) * pref.x + Math.sin(a) * pref.y - (clips ? 2 : 0)
      if (score > bestScore) {
        bestScore = score
        best = q
      }
    }
    if (best) return best
  }
  return null
}

/**
 * 小地圖右鍵的目標：點到的格子站得下又走得到就照原點；否則改成同一個房間裡最近的可走格（點到牆上時，在附近 3 格內找任何房間或走廊）。
 * 都找不到（整個房間走不到、點在岩壁深處）回傳 null，呼叫端顯示「無法到達」。
 */
export function walkableTarget(l: ParsedLayout, p: Pt, _bodyR = DEFAULT_BODY_R, reach: Uint8Array | null = null): Pt | null {
  const x = Math.max(0.5, Math.min(l.w - 0.5, p.x))
  const y = Math.max(0.5, Math.min(l.h - 0.5, p.y))
  const i0 = idxAt(l, x, y)
  if (i0 < 0) return null
  const ok = (i: number) => !solidCell(l, i % l.w, Math.floor(i / l.w)) && (!reach || reach[i] === 1)
  // 點的地方本身可走：照原點（身體貼到牆，sim 會自己推開）
  if (ok(i0)) return { x, y }
  const room = l.roomOf[i0]
  const maxR = room >= 0 ? Math.max(l.w, l.h) : 3
  const col0 = i0 % l.w
  const row0 = Math.floor(i0 / l.w)
  // 一圈一圈往外找（切比雪夫距離），同一圈裡取歐氏距離最近的；圈數超過目前最佳距離就停
  let best: Pt | null = null
  let bestD = Infinity
  for (let r = 1; r <= maxR; r++) {
    if (r - 0.5 > Math.sqrt(bestD)) break
    for (let dr = -r; dr <= r; dr++) {
      for (let dc = -r; dc <= r; dc++) {
        if (Math.max(Math.abs(dc), Math.abs(dr)) !== r) continue
        const c = col0 + dc
        const rr = row0 + dr
        if (c < 0 || rr < 0 || c >= l.w || rr >= l.h) continue
        const i = rr * l.w + c
        if (!ok(i)) continue
        if (room >= 0 && l.roomOf[i] !== room) continue
        const cx = c + 0.5
        const cy = l.h - rr - 0.5
        const d = (cx - x) ** 2 + (cy - y) ** 2
        if (d < bestD) {
          bestD = d
          best = { x: cx, y: cy }
        }
      }
    }
  }
  return best
}

/**
 * 小地圖右鍵的完整修正：先換成走得到的點（walkableTarget），再推出控制圈（pushOutOfConsoles）。
 * from = 自己的位置（不在這個 zone 時傳 null，不檢查走不走得到）。回傳 null = 無法到達。
 */
export function minimapMoveTarget(l: ParsedLayout, p: Pt, from: Pt | null, bodyR = DEFAULT_BODY_R): Pt | null {
  const reach = from ? reachFrom(l, from) : null
  // 自己站的格子在漫延範圍外（例如卡在動態障礙旁）：不要因為這樣就說到不了
  const reachOk = reach && reach.some((v) => v === 1) ? reach : null
  const t = walkableTarget(l, p, bodyR, reachOk)
  if (!t) return null
  // 推不出圈外（理論上不會：控制台旁都留了走道）也不要走上控制台，當作到不了
  return pushOutOfConsoles(l, t, consoleSpots(l), bodyR, reachOk, from)
}

// ───── Shift 佇列的路徑點（overlay 畫成細虛線）─────

/** 一個排隊中的目標：地面一點（x／y）或一個實體（e，畫的時候查它目前的位置）；kind = 指令種類（決定顏色）*/
export interface Waypoint {
  x: number
  y: number
  e: number
  kind: 'move' | 'amove' | 'cast' | 'act'
}

/** 送出的指令（client 端只看得到這幾個欄位；同 shared/protocol Command）*/
interface CmdLike {
  k: string
  x?: number
  y?: number
  e?: number
  q?: boolean
}

/** 最多記幾個點（Shift 連點很多下時不要無限長）*/
const WP_MAX = 16
/** 走到離點這麼近（公尺）就當作到了；實體目標（跟隨、互動、攻擊）身體有半徑，放寬一點 */
const WP_ARRIVE = 0.7
const WP_ARRIVE_ENT = 1.4
/** 剛下令的這段時間（秒）單位可能還沒開始動：不因「站著不動」清掉 */
const WP_GRACE = 0.8
/** 低 fps 時單位一幀可能走過頭、跳過到點半徑：曾經走到這麼近（公尺）之後又遠離，也算到了 */
const WP_PASS = 1.6

/**
 * 自己下過的 Shift 佇列（第 7 輪審查：排了好幾個點看不出來排了什麼）：完全在 client 端推測，只看自己送出的指令與自己單位的位置，
 * 不加快照欄位。不按 Shift 的移動／攻擊移動／施法／互動會換掉整條佇列；停止、原地、離開控制台、換了操控對象就清空；
 * 走到第一個點就拿掉它；單位停下來（idle）一陣子就當作佇列做完或被打斷（sim 不回報佇列，寧可早點消失也不要畫錯）。
 */
export class WaypointQueue {
  /** 這條佇列屬於哪個單位（操控對象）*/
  unit = 0
  readonly pts: Waypoint[] = []
  /** 有沒有排過隊（只有一個點的一般移動不畫：點擊標記已經標了）*/
  queued = false
  /** 最後一次下令的時間（秒）*/
  private at = -1e9
  /** 第一個點與單位離它最近的距離（走過頭的判斷）*/
  private head: Waypoint | null = null
  private headMin = Infinity

  clear(): void {
    this.pts.length = 0
    this.queued = false
    this.head = null
  }

  /** 送出一個指令（unit = 目前操控的單位、now = 秒）*/
  onCmd(c: CmdLike, unit: number, now: number): void {
    if (unit !== this.unit) {
      this.unit = unit
      this.clear()
    }
    const k = c.k
    if (k === 'stop' || k === 'hold' || k === 'unpilot') return this.clear()
    let kind: Waypoint['kind']
    if (k === 'move') kind = 'move'
    else if (k === 'amove') kind = 'amove'
    else if (k === 'cast' || k === 'use') kind = 'cast'
    else if (k === 'attack' || k === 'follow' || k === 'interact' || k === 'pickup' || k === 'give') kind = k === 'attack' ? 'amove' : 'act'
    else return
    const hasPt = c.x !== undefined && c.y !== undefined
    // 對自己放、不用目標的施法（不帶點也不帶實體）不影響移動佇列
    if (!hasPt && !c.e) return
    const wp: Waypoint = { x: hasPt ? c.x! : 0, y: hasPt ? c.y! : 0, e: hasPt ? 0 : (c.e ?? 0), kind }
    this.at = now
    if (!c.q) {
      this.pts.length = 0
      this.queued = false
    } else this.queued = true
    if (this.pts.length >= WP_MAX) this.pts.shift()
    this.pts.push(wp)
  }

  /**
   * 每幀：x／y = 單位位置、idle = 單位沒在動（st = 0）、pos = 查實體目前位置（看不到回傳 null）。
   * 到點的拿掉；停下來超過寬限時間就清空。
   */
  update(unit: number, x: number, y: number, idle: boolean, now: number, pos: (e: number) => { x: number; y: number } | null): void {
    if (unit !== this.unit) {
      this.unit = unit
      this.clear()
      return
    }
    while (this.pts.length) {
      const p = this.pts[0]
      if (p !== this.head) {
        this.head = p
        this.headMin = Infinity
      }
      const q = p.e ? pos(p.e) : p
      // 實體目標看不到了：那一步做不了，拿掉
      if (!q) {
        this.pts.shift()
        continue
      }
      const d = Math.hypot(q.x - x, q.y - y)
      if (d <= (p.e ? WP_ARRIVE_ENT : WP_ARRIVE)) {
        this.pts.shift()
        continue
      }
      // 地面的點：走近過又遠離（一幀走過頭）也算到了；實體目標自己會動，不這樣判斷
      if (!p.e && this.headMin < WP_PASS && d > this.headMin + 0.25) {
        this.pts.shift()
        continue
      }
      this.headMin = Math.min(this.headMin, d)
      break
    }
    if (idle && now - this.at > WP_GRACE) this.clear()
    if (!this.pts.length) this.queued = false
  }

  /** 要不要畫（有排過隊、還有點）*/
  visible(): boolean {
    return this.queued && this.pts.length > 0
  }
}
