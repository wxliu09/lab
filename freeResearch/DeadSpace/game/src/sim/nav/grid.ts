// 導航格（1 m）：A*（8 方向、不切角）＋ string pulling；碰撞與 LOS 共用同一份格子。
import { Cell, type ParsedLayout } from '../../shared/layout'

export type DoorPass = (doorIndex: number) => boolean

export interface Pt {
  x: number
  y: number
}

const SQRT2 = Math.SQRT2

export class NavGrid {
  readonly w: number
  readonly h: number
  /** 靜態阻擋（牆、窗、貨箱、設施、太空）*/
  readonly solid: Uint8Array
  /** 擋視線（牆、太空）*/
  readonly opaque: Uint8Array
  /** 動態阻擋計數（瓦礫、建築物）*/
  readonly dyn: Uint16Array
  readonly doorOf: Int16Array
  /** 門目前是否擋視線（關閉時）*/
  doorClosed: Uint8Array
  /** 危險區 */
  readonly hazard: Uint8Array

  constructor(readonly layout: ParsedLayout) {
    const { w, h, cells } = layout
    this.w = w
    this.h = h
    this.solid = new Uint8Array(w * h)
    this.opaque = new Uint8Array(w * h)
    this.hazard = new Uint8Array(w * h)
    this.dyn = new Uint16Array(w * h)
    this.doorOf = layout.doorOf
    this.doorClosed = new Uint8Array(layout.doors.length).fill(1)
    for (let i = 0; i < w * h; i++) {
      const c = cells[i] as Cell
      this.solid[i] = c === Cell.Wall || c === Cell.Void || c === Cell.Window || c === Cell.Crate || c === Cell.Fixture ? 1 : 0
      this.opaque[i] = c === Cell.Wall || c === Cell.Void ? 1 : 0
      this.hazard[i] = c === Cell.Hazard ? 1 : 0
    }
  }

  /** 公尺 → 格 index；界外回傳 -1 */
  idx(x: number, y: number): number {
    const col = Math.floor(x)
    const row = this.h - 1 - Math.floor(y)
    if (col < 0 || row < 0 || col >= this.w || row >= this.h) return -1
    return row * this.w + col
  }

  blockedIdx(i: number, pass?: DoorPass): boolean {
    if (i < 0) return true
    if (this.solid[i] || this.dyn[i]) return true
    const d = this.doorOf[i]
    if (d >= 0 && pass && !pass(d)) return true
    return false
  }

  blockedAt(x: number, y: number, pass?: DoorPass): boolean {
    return this.blockedIdx(this.idx(x, y), pass)
  }

  /** 視線：DDA 走格，牆／太空／關閉的門擋住 */
  los(x0: number, y0: number, x1: number, y1: number, ignoreEnd = false): boolean {
    const w = this.w
    let col = Math.floor(x0)
    let rowY = Math.floor(y0)
    const endCol = Math.floor(x1)
    const endRowY = Math.floor(y1)
    const dx = x1 - x0
    const dy = y1 - y0
    const stepX = dx > 0 ? 1 : -1
    const stepY = dy > 0 ? 1 : -1
    const tDeltaX = dx !== 0 ? Math.abs(1 / dx) : Infinity
    const tDeltaY = dy !== 0 ? Math.abs(1 / dy) : Infinity
    let tMaxX = dx !== 0 ? (dx > 0 ? col + 1 - x0 : x0 - col) * tDeltaX : Infinity
    let tMaxY = dy !== 0 ? (dy > 0 ? rowY + 1 - y0 : y0 - rowY) * tDeltaY : Infinity
    let n = Math.abs(endCol - col) + Math.abs(endRowY - rowY) + 1
    while (n-- > 0) {
      const row = this.h - 1 - rowY
      if (col < 0 || row < 0 || col >= w || row >= this.h) return false
      const i = row * w + col
      const isEnd = col === endCol && rowY === endRowY
      if (!(col === Math.floor(x0) && rowY === Math.floor(y0)) && !(ignoreEnd && isEnd)) {
        if (this.opaque[i]) return false
        const d = this.doorOf[i]
        if (d >= 0 && this.doorClosed[d]) return false
      }
      if (tMaxX < tMaxY) {
        tMaxX += tDeltaX
        col += stepX
      } else {
        tMaxY += tDeltaY
        rowY += stepY
      }
    }
    return true
  }

  /** 半徑 r 的圓沿直線走得過去嗎（取樣檢查）*/
  walkable(x0: number, y0: number, x1: number, y1: number, r: number, pass?: DoorPass): boolean {
    const dx = x1 - x0
    const dy = y1 - y0
    const len = Math.hypot(dx, dy)
    const steps = Math.max(1, Math.ceil(len / 0.25))
    for (let s = 0; s <= steps; s++) {
      const t = s / steps
      if (this.circleBlocked(x0 + dx * t, y0 + dy * t, r, pass)) return false
    }
    return true
  }

  circleBlocked(x: number, y: number, r: number, pass?: DoorPass): boolean {
    const c0 = Math.floor(x - r)
    const c1 = Math.floor(x + r)
    const y0 = Math.floor(y - r)
    const y1 = Math.floor(y + r)
    for (let cy = y0; cy <= y1; cy++) {
      for (let cx = c0; cx <= c1; cx++) {
        const i = this.idx(cx + 0.5, cy + 0.5)
        if (!this.blockedIdx(i, pass)) continue
        // 圓與格子 AABB 相交？
        const nx = Math.max(cx, Math.min(x, cx + 1))
        const ny = Math.max(cy, Math.min(y, cy + 1))
        if ((nx - x) ** 2 + (ny - y) ** 2 < r * r - 1e-6) return true
      }
    }
    return false
  }

  /** 把圓推出阻擋格（碰撞解算）*/
  resolve(p: Pt, r: number, pass?: DoorPass): void {
    for (let iter = 0; iter < 3; iter++) {
      let moved = false
      const c0 = Math.floor(p.x - r)
      const c1 = Math.floor(p.x + r)
      const y0 = Math.floor(p.y - r)
      const y1 = Math.floor(p.y + r)
      for (let cy = y0; cy <= y1; cy++) {
        for (let cx = c0; cx <= c1; cx++) {
          const i = this.idx(cx + 0.5, cy + 0.5)
          if (!this.blockedIdx(i, pass)) continue
          const nx = Math.max(cx, Math.min(p.x, cx + 1))
          const ny = Math.max(cy, Math.min(p.y, cy + 1))
          const dx = p.x - nx
          const dy = p.y - ny
          const d2 = dx * dx + dy * dy
          if (d2 >= r * r) continue
          if (d2 > 1e-9) {
            const d = Math.sqrt(d2)
            const push = r - d
            p.x += (dx / d) * push
            p.y += (dy / d) * push
          } else {
            // 圓心在格內：推向最近的邊
            const left = p.x - cx
            const right = cx + 1 - p.x
            const down = p.y - cy
            const up = cy + 1 - p.y
            const m = Math.min(left, right, down, up)
            if (m === left) p.x = cx - r
            else if (m === right) p.x = cx + 1 + r
            else if (m === down) p.y = cy - r
            else p.y = cy + 1 + r
          }
          moved = true
        }
      }
      if (!moved) break
    }
  }

  /** 找最近的可走格中心（BFS，最多 radius 格）*/
  nearestOpen(x: number, y: number, pass?: DoorPass, maxR = 12): Pt | null {
    const start = this.idx(x, y)
    if (start >= 0 && !this.blockedIdx(start, pass)) return { x, y }
    const col0 = Math.floor(x)
    const rowY0 = Math.floor(y)
    for (let r = 1; r <= maxR; r++) {
      let best: Pt | null = null
      let bestD = Infinity
      for (let dy = -r; dy <= r; dy++) {
        for (let dx = -r; dx <= r; dx++) {
          if (Math.max(Math.abs(dx), Math.abs(dy)) !== r) continue
          const cx = col0 + dx + 0.5
          const cy = rowY0 + dy + 0.5
          const i = this.idx(cx, cy)
          if (i < 0 || this.blockedIdx(i, pass)) continue
          const d = (cx - x) ** 2 + (cy - y) ** 2
          if (d < bestD) {
            bestD = d
            best = { x: cx, y: cy }
          }
        }
      }
      if (best) return best
    }
    return null
  }

  /** A* → 平滑後的路徑點（不含起點）；找不到回傳 null */
  findPath(sx: number, sy: number, tx: number, ty: number, r: number, pass?: DoorPass, maxNodes = 12000): Pt[] | null {
    const w = this.w
    let start = this.idx(sx, sy)
    let goalPt: Pt = { x: tx, y: ty }
    let goal = this.idx(tx, ty)
    if (goal < 0 || this.blockedIdx(goal, pass)) {
      const n = this.nearestOpen(tx, ty, pass)
      if (!n) return null
      goalPt = n
      goal = this.idx(n.x, n.y)
    }
    if (start < 0 || this.blockedIdx(start, pass)) {
      const n = this.nearestOpen(sx, sy, pass, 3)
      if (!n) return null
      start = this.idx(n.x, n.y)
    }
    if (start === goal || this.walkable(sx, sy, goalPt.x, goalPt.y, r, pass)) return [goalPt]
    const g = new Float32Array(w * this.h).fill(Infinity)
    const came = new Int32Array(w * this.h).fill(-1)
    const closed = new Uint8Array(w * this.h)
    const heap = new MinHeap()
    const gc = goal % w
    const gr = (goal - gc) / w
    const hfn = (i: number) => {
      const c = i % w
      const rr = (i - c) / w
      const dx = Math.abs(c - gc)
      const dy = Math.abs(rr - gr)
      return dx + dy + (SQRT2 - 2) * Math.min(dx, dy)
    }
    g[start] = 0
    heap.push(start, hfn(start))
    let expanded = 0
    let found = false
    while (heap.size) {
      const cur = heap.pop()
      if (closed[cur]) continue
      if (cur === goal) {
        found = true
        break
      }
      closed[cur] = 1
      if (++expanded > maxNodes) break
      const cc = cur % w
      const cr = (cur - cc) / w
      for (let dr = -1; dr <= 1; dr++) {
        for (let dc = -1; dc <= 1; dc++) {
          if (!dr && !dc) continue
          const nc = cc + dc
          const nr = cr + dr
          if (nc < 0 || nr < 0 || nc >= w || nr >= this.h) continue
          const ni = nr * w + nc
          if (closed[ni] || this.blockedIdx(ni, pass)) continue
          if (dc && dr) {
            // 不切角
            if (this.blockedIdx(cr * w + nc, pass) || this.blockedIdx(nr * w + cc, pass)) continue
          }
          const cost = g[cur] + (dc && dr ? SQRT2 : 1) + (this.hazard[ni] ? 4 : 0)
          if (cost < g[ni]) {
            g[ni] = cost
            came[ni] = cur
            heap.push(ni, cost + hfn(ni))
          }
        }
      }
    }
    if (!found) return null
    const cellsPath: Pt[] = []
    for (let i = goal; i !== -1 && i !== start; i = came[i]) {
      const c = i % w
      const rr = (i - c) / w
      cellsPath.push({ x: c + 0.5, y: this.h - rr - 0.5 })
    }
    cellsPath.reverse()
    if (cellsPath.length) cellsPath[cellsPath.length - 1] = goalPt
    // string pulling
    const out: Pt[] = []
    let ax = sx
    let ay = sy
    let i = 0
    while (i < cellsPath.length) {
      let j = cellsPath.length - 1
      while (j > i && !this.walkable(ax, ay, cellsPath[j].x, cellsPath[j].y, r * 0.9, pass)) j--
      out.push(cellsPath[j])
      ax = cellsPath[j].x
      ay = cellsPath[j].y
      i = j + 1
    }
    return out
  }
}

class MinHeap {
  private ids: number[] = []
  private keys: number[] = []
  get size(): number {
    return this.ids.length
  }
  push(id: number, key: number): void {
    const ids = this.ids
    const keys = this.keys
    let i = ids.length
    ids.push(id)
    keys.push(key)
    while (i > 0) {
      const p = (i - 1) >> 1
      if (keys[p] <= key) break
      ids[i] = ids[p]
      keys[i] = keys[p]
      i = p
    }
    ids[i] = id
    keys[i] = key
  }
  pop(): number {
    const ids = this.ids
    const keys = this.keys
    const top = ids[0]
    const lastId = ids.pop()!
    const lastKey = keys.pop()!
    const n = ids.length
    if (n > 0) {
      let i = 0
      while (true) {
        const l = 2 * i + 1
        if (l >= n) break
        const r = l + 1
        const c = r < n && keys[r] < keys[l] ? r : l
        if (keys[c] >= lastKey) break
        ids[i] = ids[c]
        keys[i] = keys[c]
        i = c
      }
      ids[i] = lastId
      keys[i] = lastKey
    }
    return top
  }
}
