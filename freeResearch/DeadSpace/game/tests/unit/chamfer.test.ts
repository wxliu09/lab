// 牆的階梯斜切（render/chamfer.ts）：只改外觀、sim 格子不變。
// 舊版 45° 斜牆照舊（除了改成 2:1 斜線的）；2:1 階梯與牆外虛空的外輪廓也切；牆只會變小（不蓋到可以走的格子）、補牆只長進虛空。
import { describe, expect, it } from 'vitest'
import { Cell, parseLayout, type LayoutSpec, type ParsedLayout } from '../../src/shared/layout'
import { findChamfers, type Cut } from '../../src/render/chamfer'
import '../../src/shared/content/index'
import { STATION_BY_ID } from '../../src/shared/content/stations/index'

const at = (l: ParsedLayout) => (col: number, row: number): Cell => (col < 0 || row < 0 || col >= l.w || row >= l.h ? Cell.Void : (l.cells[row * l.w + col] as Cell))
const area = (p: [number, number][]) => Math.abs(p.reduce((s, a, i) => s + a[0] * p[(i + 1) % p.length][1] - p[(i + 1) % p.length][0] * a[1], 0)) / 2
const key = (p: [number, number][]) => p.map((q) => q.map((v) => Math.round(v * 1000) / 1000).join(',')).sort().join(' ')

/** 舊版的 45° 斜牆（findDiagonals）：牆格兩個相鄰側與夾角是地板、另兩側是牆或虛空，沿斜線至少還有一格同方向的 */
function oldDiagonals(l: ParsedLayout): Map<number, { ox: number; oy: number }> {
  const c = at(l)
  const solid = (x: Cell) => x === Cell.Wall || x === Cell.Void
  const open = (x: Cell) => x === Cell.Floor || x === Cell.Crate || x === Cell.Hazard || x === Cell.Fixture
  const corner = new Map<number, { ox: number; oy: number }>()
  for (let row = 0; row < l.h; row++)
    for (let col = 0; col < l.w; col++) {
      if (c(col, row) !== Cell.Wall) continue
      for (const ox of [-1, 1])
        for (const oy of [-1, 1]) {
          if (!open(c(col + ox, row)) || !open(c(col, row + oy)) || !open(c(col + ox, row + oy))) continue
          if (!solid(c(col - ox, row)) || !solid(c(col, row - oy))) continue
          corner.set(row * l.w + col, { ox, oy })
        }
    }
  const out = new Map<number, { ox: number; oy: number }>()
  for (const [i, d] of corner) {
    const col = i % l.w
    const row = (i - col) / l.w
    for (const [dc, dr] of [
      [-d.ox, d.oy],
      [d.ox, -d.oy],
    ]) {
      const j = corner.get((row + dr) * l.w + col + dc)
      if (col + dc >= 0 && col + dc < l.w && j && j.ox === d.ox && j.oy === d.oy) {
        out.set(i, d)
        break
      }
    }
  }
  return out
}

const slope = (c: Cut) => Math.abs(c.n[0]) / Math.max(1e-9, Math.abs(c.n[1]))

function spec(rows: string[]): LayoutSpec {
  return { rows, pois: {}, rooms: [] }
}

describe('牆的階梯斜切', () => {
  it('所有站：floor 只切牆格、void 只補虛空格；兩側多邊形拼回整格；舊版 45° 斜牆都還在（形狀相同，或接成 2:1 斜線）', () => {
    let n21 = 0
    let nVoid = 0
    for (const st of STATION_BY_ID.values()) {
      if (st.outdoor) continue
      const l = parseLayout(st.layout)
      const { cuts, noFace } = findChamfers(l, at(l))
      for (const [i, c] of cuts) {
        expect(l.cells[i], st.id).toBe(c.kind === 'floor' ? Cell.Wall : Cell.Void)
        expect(area(c.open) + area(c.solid)).toBeCloseTo(1, 6)
        expect(area(c.open)).toBeGreaterThan(0.1)
        // 整格都在這一格裡
        const col = i % l.w
        const y0 = l.h - 1 - (i - col) / l.w
        for (const [x, y] of [...c.open, ...c.solid]) {
          expect(x).toBeGreaterThanOrEqual(col - 1e-9)
          expect(x).toBeLessThanOrEqual(col + 1 + 1e-9)
          expect(y).toBeGreaterThanOrEqual(y0 - 1e-9)
          expect(y).toBeLessThanOrEqual(y0 + 1 + 1e-9)
        }
        if (c.kind === 'floor') {
          // 切開的那一側接著地板：鄰格是可以走的格子
          expect([Cell.Floor, Cell.Crate, Cell.Hazard, Cell.Fixture]).toContain(l.cells[c.nb])
          if (Math.abs(slope(c) - 1) > 0.01) n21++
        } else nVoid++
      }
      // noFace 只會關掉牆格的面
      for (const k of noFace) expect(l.cells[k >> 2], st.id).toBe(Cell.Wall)
      const old = oldDiagonals(l)
      for (const [i, d] of old) {
        const c = cuts.get(i)
        expect(c?.kind, `${st.id} ${i % l.w},${Math.floor(i / l.w)}`).toBe('floor')
        const col = i % l.w
        const row = (i - col) / l.w
        const yTop = l.h - row
        const xo = d.ox > 0 ? col + 1 : col
        const xc = d.ox > 0 ? col : col + 1
        const yo = d.oy < 0 ? yTop : yTop - 1
        const yc = d.oy < 0 ? yTop - 1 : yTop
        const tri = key([
          [xo, yo],
          [xo, yc],
          [xc, yo],
        ])
        if (key(c!.open) !== tri) expect(Math.abs(slope(c!) - 1), `${st.id} ${col},${row}`).toBeGreaterThan(0.4)
      }
    }
    // 未識別物體、黑鷗號都有新的斜切
    expect(n21).toBeGreaterThan(10)
    expect(nVoid).toBeGreaterThan(20)
  })

  it('未識別物體入口腔左下、裂隙右側切成 2:1；黑鷗號艦橋外側的外輪廓補成斜牆', () => {
    const uo = parseLayout(STATION_BY_ID.get('uo')!.layout)
    const { cuts } = findChamfers(uo, at(uo))
    const zone = (c0: number, c1: number, r0: number, r1: number, kind: 'floor' | 'void') =>
      [...cuts].filter(([i, c]) => c.kind === kind && i % uo.w >= c0 && i % uo.w <= c1 && Math.floor(i / uo.w) >= r0 && Math.floor(i / uo.w) <= r1).map(([, c]) => c)
    // 入口腔（rows 14–31、左半）左下
    const maw = zone(0, 8, 24, 31, 'floor')
    expect(maw.some((c) => Math.abs(slope(c) - 2) < 0.01 || Math.abs(slope(c) - 0.5) < 0.01)).toBe(true)
    // 裂隙（rows 0–13、cols 4–21）右側
    const rift = zone(12, 21, 0, 10, 'floor')
    expect(rift.length).toBeGreaterThan(3)
    expect(rift.some((c) => Math.abs(slope(c) - 1) > 0.01)).toBe(true)
    // 外輪廓
    expect(zone(0, uo.w, 0, uo.h, 'void').length).toBeGreaterThan(20)
    const pr = parseLayout(STATION_BY_ID.get('pirate')!.layout)
    const pc = findChamfers(pr, at(pr)).cuts
    // 艦橋（cols 34–47、rows 2–17）外側
    const bridge = [...pc].filter(([i, c]) => c.kind === 'void' && i % pr.w >= 40 && Math.floor(i / pr.w) <= 17)
    expect(bridge.length).toBeGreaterThan(3)
  })

  it('單獨的轉角、只有一階、門旁的轉角不切；兩邊搶同一格就不切', () => {
    // 單獨的轉角（房間的內凸角）
    const one = parseLayout(spec(['#######', '#.....#', '#.....#', '###...#', '###...#', '#######']))
    expect(findChamfers(one, at(one)).cuts.size).toBe(0)
    // 45° 連續兩階（下面接一段直牆）：兩格都切，接直牆的那一格只切到格角
    const two = parseLayout(spec(['##########', '#........#', '##.......#', '###......#', '###......#', '###......#', '##########']))
    const c2 = findChamfers(two, at(two))
    expect([...c2.cuts.keys()].sort((a, b) => a - b)).toEqual([2 * 10 + 1, 3 * 10 + 2])
    for (const c of c2.cuts.values()) expect(area(c.open)).toBeCloseTo(0.5, 6)
    // 2:1：一階兩格、連續兩階 → 四格都切，斜線沿 x 走兩格、沿 y 走一格
    const shallow = parseLayout(spec(['##########', '#........#', '###......#', '#####....#', '#####....#', '#####....#', '##########']))
    const cs = findChamfers(shallow, at(shallow))
    expect([...cs.cuts.keys()].sort((a, b) => a - b)).toEqual([2 * 10 + 1, 2 * 10 + 2, 3 * 10 + 3, 3 * 10 + 4])
    for (const c of cs.cuts.values()) expect(slope(c)).toBeCloseTo(0.5, 6)
    // 每一階的兩格：外側一格切掉 1/4、轉角格切掉 3/4
    expect(area(cs.cuts.get(2 * 10 + 1)!.open)).toBeCloseTo(0.25, 6)
    expect(area(cs.cuts.get(2 * 10 + 2)!.open)).toBeCloseTo(0.75, 6)
    // 被切的牆格不再畫朝地板的那一面（北面）
    expect(cs.noFace.has((2 * 10 + 1) * 4 + 0)).toBe(true)
    // 門旁：開口那一格是門 → 不切
    const door = parseLayout(spec(['#######', '#.....#', '##D...#', '###...#', '###...#', '#######']))
    expect([...findChamfers(door, at(door)).cuts.keys()].some((i) => i === 2 * 7 + 1)).toBe(false)
  })

  it('外輪廓：牆外虛空的 45° 階梯補成斜牆，鄰接的牆面不畫；站內不受影響', () => {
    const l = parseLayout(spec(['  ######', ' #######', '########', '#......#', '########']))
    const { cuts, noFace } = findChamfers(l, at(l))
    const v = [...cuts].filter(([, c]) => c.kind === 'void')
    expect(v.map(([i]) => i).sort((a, b) => a - b)).toEqual([1, 8])
    for (const [i, c] of v) {
      expect(l.cells[i]).toBe(Cell.Void)
      expect(area(c.open)).toBeCloseTo(0.5, 6)
    }
    // (2,0) 西面、(1,1) 北面被補上的牆蓋住
    expect(noFace.has((0 * 8 + 2) * 4 + 2)).toBe(true)
    expect(noFace.has((1 * 8 + 1) * 4 + 0)).toBe(true)
    expect([...cuts.values()].some((c) => c.kind === 'floor')).toBe(false)
  })
})
