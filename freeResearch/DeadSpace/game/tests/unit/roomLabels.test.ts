// 房名地貼的位置（stationBuilder labelSpot）：避開道具（'x' 格的雜物會超出格子）、設施、有單位站崗的標記（標本、海盜）、
// 停機坪，也不貼在南牆根（俯視鏡頭會被牆擋住）。第 3 輪美術審查：七號「廢棄宿舍」、活體庫「吼顎獸隔間」、黑鷗「船員艙」「機庫」。
import { describe, expect, it } from 'vitest'
import '../../src/shared/content/index'
import { STATION_BY_ID } from '../../src/shared/content/stations/index'
import { Cell, parseLayout, type ParsedLayout, type RoomInstance } from '../../src/shared/layout'
import { labelSpot } from '../../src/render/stationBuilder'

const UNIT_MARK = /Spawn$|^specimen\d$|^pirateCaptain$/

/** 地貼佔的 6×2 格（中心在格角：col-3..col+2、row-1..row）*/
function footprint(l: ParsedLayout, p: { x: number; y: number }): [number, number][] {
  const col = p.x
  const row = l.h - p.y
  const out: [number, number][] = []
  for (let dc = -3; dc <= 2; dc++) for (let dr = -1; dr <= 0; dr++) out.push([col + dc, row + dr])
  return out
}

function check(l: ParsedLayout, r: RoomInstance) {
  const p = labelSpot(l, r)
  const cells = footprint(l, p)
  const kind = (c: number, rw: number) => l.cells[rw * l.w + c] as Cell
  const blocked = cells.filter(([c, rw]) => kind(c, rw) === Cell.Crate || kind(c, rw) === Cell.Fixture || l.pois.some((q) => q.col === c && q.row === rw))
  const outside = cells.filter(([c, rw]) => l.roomOf[rw * l.w + c] !== r.index)
  // 地貼底邊那一列的正南方就是牆（會被牆擋住）
  const row = l.h - p.y
  const southWall = cells.filter(([c, rw]) => rw === row && (kind(c, row + 1) === Cell.Wall || kind(c, row + 1) === Cell.Void)).length
  // 離最近的「有單位站崗」標記多遠（格，切比雪夫距離）
  let unitGap = Infinity
  for (const q of l.pois) {
    if (!UNIT_MARK.test(q.def.kind)) continue
    for (const [c, rw] of cells) unitGap = Math.min(unitGap, Math.max(Math.abs(q.col - c), Math.abs(q.row - rw)))
  }
  // 停機坪：地貼有字的範圍（半寬 2.3、半高 0.7）到圓心的距離
  const padGap = Math.min(Infinity, ...l.pads.map((q) => Math.hypot(Math.max(0, Math.abs(q.x - p.x) - 2.3), Math.max(0, Math.abs(q.y - p.y) - 0.7))))
  return { p, blocked: blocked.length, outside: outside.length, southWall, unitGap, padGap }
}

function room(station: string, id: string) {
  const st = STATION_BY_ID.get(station)!
  const l = parseLayout(st.layout)
  const r = l.rooms.find((x) => x.spec.id === id)!
  return check(l, r)
}

describe('房名地貼避開道具', () => {
  it('第 3 輪點名的四間：不壓道具與設施、不貼南牆根、離站崗的單位兩格以上、不壓停機坪', () => {
    for (const [st, id] of [
      ['hulk7', 'quarters'],
      ['vivarium', 'cell1'],
      ['pirate', 'crew'],
      ['pirate', 'hangar'],
    ]) {
      const c = room(st, id)
      expect(c.outside, `${st}:${id}`).toBe(0)
      expect(c.blocked, `${st}:${id}`).toBe(0)
      expect(c.southWall, `${st}:${id}`).toBe(0)
      expect(c.unitGap, `${st}:${id}`).toBeGreaterThanOrEqual(2)
      expect(c.padGap, `${st}:${id}`).toBeGreaterThanOrEqual(2.6)
    }
  })

  it('黑鷗號機庫：放在四個停機坪中間（以前找不到空位，退回南牆根被牆擋住）', () => {
    const st = STATION_BY_ID.get('pirate')!
    const l = parseLayout(st.layout)
    const r = l.rooms.find((x) => x.spec.id === 'hangar')!
    const p = labelSpot(l, r)
    expect(Math.abs(p.x - r.cx)).toBeLessThan(1.5)
    expect(Math.abs(p.y - r.cy)).toBeLessThan(1.5)
  })

  it('所有站：地貼都在房間裡、幾乎都不壓道具與設施、不貼南牆根', () => {
    let rooms = 0
    const blocked: string[] = []
    const south: string[] = []
    for (const st of STATION_BY_ID.values()) {
      const l = parseLayout(st.layout)
      for (const r of l.rooms) {
        if (r.cells <= 30 || r.spec.type === 'corridor') continue
        rooms++
        const c = check(l, r)
        expect(c.outside, `${st.id}:${r.spec.id}`).toBe(0)
        if (c.blocked) blocked.push(`${st.id}:${r.spec.id}`)
        // 不規則的洞穴（未識別物體的裂隙）邊角可能有一兩欄貼牆：那是地貼左右兩端沒有字的地方
        if (c.southWall > 2) south.push(`${st.id}:${r.spec.id}`)
      }
    }
    expect(rooms).toBeGreaterThan(60)
    expect(blocked.length, blocked.join(',')).toBeLessThanOrEqual(2)
    expect(south, south.join(',')).toEqual([])
  })
})
