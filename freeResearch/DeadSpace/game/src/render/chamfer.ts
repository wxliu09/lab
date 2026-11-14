// 牆的階梯斜切（只改外觀，sim 的格子不變）：站內牆對地板的階梯、牆塊對外部虛空的外輪廓階梯，切成連續的斜牆。
// 每一階 = 一個凸出的轉角格加上沿兩條邊的「階面」：橫向 a 格、縱向 b 格，(a, b) ∈ {(1,1) 45°、(2,1)、(1,2) 2:1}；
// 刀線連接這一階兩端的內凹格角（V1 → V3），把凸出的那一塊（三角形 V1 V2 V3）換到另一側：
// - floor：牆格被切掉一角變成地板（牆只會變小，不會蓋到 sim 可以走的格子）；
// - void：牆外的虛空格補上一角牆（只長進虛空，站內不受影響）。
// 階梯的頭尾接著一段直牆（階面 ≥ 3 格）時，那一端只切到轉角格的格角（斜牆正好接上直牆）。
// 只切連續的階梯（相鄰至少還有一階同方向的），單獨的轉角、門框與窗旁不切；同一格被兩階搶到就都不切。純邏輯、不碰 three。
import { Cell, type ParsedLayout } from '../shared/layout'

/** sim 座標（x 向右、y 向上）的點 */
export type Pt = [number, number]

export type CutKind = 'floor' | 'void'

/** 一格裡的一刀 */
export interface Cut {
  kind: CutKind
  /** 刀線在這一格裡的兩端（sim 座標）*/
  p: Pt
  q: Pt
  /** 刀線指向 open 側的單位法線（sim 座標）*/
  n: Pt
  /** open 側（floor：變成地板；void：補上的牆）與 solid 側（floor：留下的牆；void：留下的虛空）的多邊形，逆時針（sim 座標）*/
  open: Pt[]
  solid: Pt[]
  /** floor：open 側鄰接的地板格 index（地板材質、補光的房間跟著它）；void：-1 */
  nb: number
}

export interface Chamfer {
  /** 格子 index → 這一格的一刀 */
  cuts: Map<number, Cut>
  /** 不畫的軸向牆面：格子 index × 4 + 邊（N/S/W/E）。被刀線取代、或被補上的牆蓋住的那一面 */
  noFace: Set<number>
}

/** 牆面的邊：北 row-1、南 row+1、西 col-1、東 col+1 */
export const SIDE_N = 0
export const SIDE_S = 1
export const SIDE_W = 2
export const SIDE_E = 3

/** 允許的階：(橫向格數, 縱向格數) */
const STEPS = new Set(['1,1', '2,1', '1,2'])

interface Step {
  kind: CutKind
  ox: number
  oy: number
  /** 轉角格 */
  c: number
  r: number
  /** 格線座標（x = col、z = row，z 向下）：V1 橫向階面的端點、V2 凸角、V3 縱向階面的端點 */
  v1: [number, number]
  v2: [number, number]
  v3: [number, number]
  cells: number[]
  /** V1／V3 是真的階梯內凹角（可以接下一階）；false = 那一端接的是直牆 */
  e1: boolean
  e3: boolean
  ok: boolean
}

const isOpenFloor = (c: Cell) => c === Cell.Floor || c === Cell.Crate || c === Cell.Hazard || c === Cell.Fixture

export function findChamfers(l: ParsedLayout, cellAt: (col: number, row: number) => Cell): Chamfer {
  const inb = (col: number, row: number) => col >= 0 && row >= 0 && col < l.w && row < l.h
  const steps: Step[] = []
  for (const kind of ['floor', 'void'] as const) {
    // floor：solid = 牆或虛空、open = 可以走的地板（門、窗都不算）、被切的格必須是牆
    // void：solid = 虛空、open = 牆、被補的格必須是版面內的虛空
    const solid = kind === 'floor' ? (c: Cell) => c === Cell.Wall || c === Cell.Void : (c: Cell) => c === Cell.Void
    const open = kind === 'floor' ? isOpenFloor : (c: Cell) => c === Cell.Wall
    const cuttable = kind === 'floor' ? (col: number, row: number) => cellAt(col, row) === Cell.Wall : (col: number, row: number) => inb(col, row) && cellAt(col, row) === Cell.Void
    /**
     * 階面長度：從轉角格往外第 k 格，solid 那一列（欄）一直是 solid、open 那一列（欄）走到變成 solid 為止（1、2）；
     * 3 = 接著一段直牆（至少 3 格），或 open 那一列碰到門、窗（只切到轉角格的格角，同舊版 45° 的規則）；solid 那一列斷掉 = 0（不是階梯）
     */
    const run = (at: (k: number) => [Cell, Cell]): number => {
      for (let k = 1; k <= 3; k++) {
        const [s, o] = at(k)
        if (!solid(s)) return 0
        if (solid(o)) return k
        if (!open(o)) return 3
      }
      return 3
    }
    for (let r = 0; r < l.h; r++) {
      for (let c = 0; c < l.w; c++) {
        if (!cuttable(c, r)) continue
        for (const ox of [-1, 1]) {
          for (const oy of [-1, 1]) {
            // 凸角：轉角格的橫向、縱向、斜向鄰格都是 open
            if (!open(cellAt(c + ox, r)) || !open(cellAt(c, r + oy)) || !open(cellAt(c + ox, r + oy))) continue
            const ra = run((k) => [cellAt(c - k * ox, r), cellAt(c - k * ox, r + oy)])
            const rb = run((k) => [cellAt(c, r - k * oy), cellAt(c + ox, r - k * oy)])
            // 接直牆的那一端只切到轉角格的格角
            const a = ra === 3 ? 1 : ra
            const b = rb === 3 ? 1 : rb
            if (!STEPS.has(`${a},${b}`)) continue
            const cells: number[] = []
            let ok = true
            for (let k = 0; k < a && ok; k++) {
              if (!cuttable(c - k * ox, r)) ok = false
              else cells.push(r * l.w + c - k * ox)
            }
            for (let k = 1; k < b && ok; k++) {
              if (!cuttable(c, r - k * oy)) ok = false
              else cells.push((r - k * oy) * l.w + c)
            }
            if (!ok) continue
            const xo = c + (ox > 0 ? 1 : 0)
            const zo = r + (oy > 0 ? 1 : 0)
            steps.push({ kind, ox, oy, c, r, v1: [xo - a * ox, zo], v2: [xo, zo], v3: [xo, zo - b * oy], cells, e1: ra !== 3, e3: rb !== 3, ok: true })
          }
        }
      }
    }
  }
  // 同一格被兩階搶到：都不切；只留連續的階梯（這一階的 V3 = 下一階的 V1、同種類同方向）。反覆做到穩定
  const key = (s: Step, v: [number, number]) => `${s.kind}|${s.ox}|${s.oy}|${v[0]},${v[1]}`
  for (let changed = true; changed; ) {
    changed = false
    const owner = new Map<number, Step[]>()
    for (const s of steps) {
      if (!s.ok) continue
      for (const i of s.cells) {
        let arr = owner.get(i)
        if (!arr) owner.set(i, (arr = []))
        arr.push(s)
      }
    }
    for (const arr of owner.values()) {
      if (arr.length < 2) continue
      for (const s of arr) {
        if (s.ok) changed = true
        s.ok = false
      }
    }
    const starts = new Set<string>()
    const ends = new Set<string>()
    for (const s of steps) {
      if (!s.ok) continue
      if (s.e1) starts.add(key(s, s.v1))
      if (s.e3) ends.add(key(s, s.v3))
    }
    for (const s of steps) {
      if (!s.ok || (s.e3 && starts.has(key(s, s.v3))) || (s.e1 && ends.has(key(s, s.v1)))) continue
      s.ok = false
      changed = true
    }
  }
  const cuts = new Map<number, Cut>()
  const noFace = new Set<number>()
  const sim = (x: number, z: number): Pt => [x, l.h - z]
  for (const s of steps) {
    if (!s.ok) continue
    // 刀線 V1→V3（格線座標）；f > 0 = open 側（V2 那一側）
    const [x1, z1] = s.v1
    const [x3, z3] = s.v3
    const dx = x3 - x1
    const dz = z3 - z1
    const sgn = Math.sign(dx * (s.v2[1] - z1) - dz * (s.v2[0] - x1))
    const f = (x: number, z: number) => sgn * (dx * (z - z1) - dz * (x - x1))
    // open 側的單位法線（sim 座標）：垂直刀線、指向 V2
    const [p1x, p1y] = sim(x1, z1)
    const [p3x, p3y] = sim(x3, z3)
    const len = Math.hypot(p3x - p1x, p3y - p1y)
    let n: Pt = [-(p3y - p1y) / len, (p3x - p1x) / len]
    const [v2x, v2y] = sim(s.v2[0], s.v2[1])
    if ((v2x - (p1x + p3x) / 2) * n[0] + (v2y - (p1y + p3y) / 2) * n[1] < 0) n = [-n[0], -n[1]]
    for (const i of s.cells) {
      const col = i % l.w
      const row = (i - col) / l.w
      const sq: [number, number][] = [
        [col, row],
        [col + 1, row],
        [col + 1, row + 1],
        [col, row + 1],
      ]
      const op = clip(sq, f)
      const so = clip(sq, (x, z) => -f(x, z))
      const on = op.filter(([x, z]) => Math.abs(f(x, z)) < 1e-9)
      if (on.length < 2 || op.length < 3 || so.length < 3) continue
      const onH = row === s.r
      const onV = col === s.c
      // 鄰接的地板：縱向階面上的格（含轉角格）取橫向鄰格、其餘取縱向鄰格
      const nb = s.kind === 'floor' ? (onV ? row * l.w + col + s.ox : (row + s.oy) * l.w + col) : -1
      cuts.set(i, {
        kind: s.kind,
        p: sim(on[0][0], on[0][1]),
        q: sim(on[on.length - 1][0], on[on.length - 1][1]),
        n,
        open: ccw(op.map(([x, z]) => sim(x, z))),
        solid: ccw(so.map(([x, z]) => sim(x, z))),
        nb,
      })
      // 被刀線取代的階面：floor = 被切的牆格自己朝地板的那一面；void = 鄰接的牆格朝向這一格的那一面（被補上的牆蓋住）
      const hSide = s.oy < 0 ? SIDE_N : SIDE_S
      const vSide = s.ox > 0 ? SIDE_E : SIDE_W
      if (s.kind === 'floor') {
        if (onH) noFace.add(i * 4 + hSide)
        if (onV) noFace.add(i * 4 + vSide)
      } else {
        if (onH) noFace.add(((row + s.oy) * l.w + col) * 4 + (hSide === SIDE_N ? SIDE_S : SIDE_N))
        if (onV) noFace.add((row * l.w + col + s.ox) * 4 + (vSide === SIDE_E ? SIDE_W : SIDE_E))
      }
    }
  }
  return { cuts, noFace }
}

/** 凸多邊形保留 f >= 0 的部分（Sutherland–Hodgman，單一平面）*/
function clip(poly: [number, number][], f: (x: number, z: number) => number): [number, number][] {
  const out: [number, number][] = []
  for (let i = 0; i < poly.length; i++) {
    const a = poly[i]
    const b = poly[(i + 1) % poly.length]
    const fa = f(a[0], a[1])
    const fb = f(b[0], b[1])
    if (fa >= 0) out.push(a)
    if ((fa > 0 && fb < 0) || (fa < 0 && fb > 0)) {
      const t = fa / (fa - fb)
      out.push([a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t])
    }
  }
  return out
}

/** 逆時針（y 向上）排列，法線朝上 */
export function ccw(t: Pt[]): Pt[] {
  let area = 0
  for (let i = 0; i < t.length; i++) {
    const a = t[i]
    const b = t[(i + 1) % t.length]
    area += a[0] * b[1] - b[0] * a[1]
  }
  return area >= 0 ? t : [...t].reverse()
}

/** 點（sim 座標）在這一刀的 open 側（含刀線上；補光烘焙用）*/
export function inOpen(cut: Cut, x: number, y: number): boolean {
  return (x - cut.p[0]) * cut.n[0] + (y - cut.p[1]) * cut.n[1] >= -1e-9
}
