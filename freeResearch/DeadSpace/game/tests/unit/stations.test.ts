// 站點版面：每座站都能解析、地板連通、出生點／停機坪數量正確、設施都在地板上且碰得到
import { describe, expect, it } from 'vitest'
import { ALL_STATIONS, STATION_BY_ID } from '../../src/shared/content/stations/index'
import { Cell, cellCenter, parseLayout, walkableCell, type ParsedLayout } from '../../src/shared/layout'
import { SHIP_BY_ID } from '../../src/shared/content/ships'
import { THEMES } from '../../src/render/themes'

/** [出生點, 停機坪] */
const COUNTS: Record<string, [number, number]> = {
  nyx: [14, 6],
  adjudicatrix: [3, 4],
  tenshu: [0, 3],
  hulk7: [0, 2],
  bravado: [4, 6],
  caldera: [0, 0],
  vivarium: [0, 6],
  portage: [0, 0],
  verdance: [1, 8],
  cinder: [0, 4],
  uo: [0, 2],
  pirate: [0, 4],
}

const layouts = new Map<string, ParsedLayout>(ALL_STATIONS.map((s) => [s.id, parseLayout(s.layout)]))

function pois(id: string, kind: string) {
  return layouts.get(id)!.pois.filter((p) => p.def.kind === kind)
}

function reachable(l: ParsedLayout): Set<number> {
  const start = l.cells.findIndex((_, i) => walkableCell(l, i % l.w, Math.floor(i / l.w)))
  const seen = new Set<number>([start])
  const stack = [start]
  while (stack.length) {
    const i = stack.pop()!
    const c = i % l.w
    const r = (i - c) / l.w
    for (const [dc, dr] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
      const nc = c + dc
      const nr = r + dr
      const ni = nr * l.w + nc
      if (!seen.has(ni) && walkableCell(l, nc, nr)) {
        seen.add(ni)
        stack.push(ni)
      }
    }
  }
  return seen
}

describe('站點清單', () => {
  it('女帝號第一個、id 不重複、全部 12 個地點', () => {
    expect(ALL_STATIONS[0].id).toBe('nyx')
    expect(new Set(ALL_STATIONS.map((s) => s.id)).size).toBe(ALL_STATIONS.length)
    expect(ALL_STATIONS.map((s) => s.id).sort()).toEqual(Object.keys(COUNTS).sort())
  })

  it('啟用方式：核心／自動／事件', () => {
    const en = (id: string) => STATION_BY_ID.get(id)!.enable
    for (const id of ['nyx', 'adjudicatrix', 'tenshu', 'hulk7', 'bravado', 'verdance', 'cinder']) expect(en(id)).toBe('core')
    for (const id of ['caldera', 'vivarium', 'portage']) expect(en(id)).toBe('auto')
    for (const id of ['uo', 'pirate']) expect(en(id)).toBe('event')
  })
})

describe.each(ALL_STATIONS.map((s) => [s.id, s] as const))('%s', (id, st) => {
  const l = layouts.get(id)!

  it('版面可解析、有主題', () => {
    expect(l.w).toBeGreaterThan(20)
    expect(l.h).toBeGreaterThan(20)
    expect(THEMES[st.theme]).toBeTruthy()
    expect(st.space.model).toBe('station.' + id)
  })

  it('所有可走格連通', () => {
    const seen = reachable(l)
    const lost: string[] = []
    for (let r = 0; r < l.h; r++) for (let c = 0; c < l.w; c++) if (walkableCell(l, c, r) && !seen.has(r * l.w + c)) lost.push(`${c},${r}`)
    expect(lost).toEqual([])
  })

  it('出生點與停機坪數量', () => {
    expect([l.spawns.length, l.pads.length]).toEqual(COUNTS[id])
    for (const d of st.docked ?? []) {
      expect(d.pad).toBeLessThan(l.pads.length)
      expect(SHIP_BY_ID.has(d.ship)).toBe(true)
    }
  })

  it('停機坪周圍 5×5 淨空', () => {
    for (const p of l.pads) {
      const col = Math.floor(p.x)
      const row = l.h - 1 - Math.floor(p.y)
      for (let dr = -2; dr <= 2; dr++) for (let dc = -2; dc <= 2; dc++) expect(walkableCell(l, col + dc, row + dr), `${id} pad ${col},${row}`).toBe(true)
    }
  })

  it('設施都在地板上：可走設施連通、佔格設施旁邊有可走格', () => {
    const seen = reachable(l)
    for (const p of l.pois) {
      const k = l.cells[p.row * l.w + p.col] as Cell
      if (p.def.solid === false) {
        expect(k, `${p.key}@${p.col},${p.row}`).toBe(Cell.Floor)
        expect(seen.has(p.row * l.w + p.col), `${p.key}@${p.col},${p.row} 不連通`).toBe(true)
      } else {
        expect(k).toBe(Cell.Fixture)
        if (p.def.kind === 'cannonBody' || p.def.kind === 'cannonBreech') continue
        const ok = [[1, 0], [-1, 0], [0, 1], [0, -1]].some(([dc, dr]) => seen.has((p.row + dr) * l.w + p.col + dc))
        expect(ok, `${p.key}(${p.def.kind})@${p.col},${p.row} 碰不到`).toBe(true)
      }
    }
  })

  it('每格地板都屬於某個房間，房間都有名字與燈色', () => {
    for (let i = 0; i < l.cells.length; i++) {
      const k = l.cells[i] as Cell
      if (k === Cell.Floor || k === Cell.Hazard || k === Cell.Crate || k === Cell.Fixture) expect(l.roomOf[i], `cell ${i % l.w},${Math.floor(i / l.w)}`).toBeGreaterThanOrEqual(0)
    }
    for (const r of l.rooms) {
      expect(r.cells).toBeGreaterThan(0)
      expect(r.spec.name.zh.length).toBeGreaterThan(0)
      expect(r.spec.light).toMatch(/^#[0-9a-fA-F]{6}$/)
    }
  })

  it('門寬 2–4、門設定落在門上、逃生艙落點存在', () => {
    for (const d of l.doors) expect(d.width).toBeGreaterThanOrEqual(2)
    for (const d of l.doors) expect(d.width).toBeLessThanOrEqual(4)
    for (const key of Object.keys(st.layout.doors ?? {})) {
      const [c, r] = key.split(',').map(Number)
      expect(l.cells[r * l.w + c], `${id} door ${key}`).toBe(Cell.Door)
    }
    if (st.podLanding) expect(l.pois.some((p) => p.key === st.podLanding)).toBe(true)
  })

  if (!['nyx', 'uo', 'pirate', 'verdance', 'cinder'].includes(id)) {
    it('NPC 巡邏點 3–6 個', () => {
      const n = pois(id, 'patrol').length
      expect(n).toBeGreaterThanOrEqual(3)
      expect(n).toBeLessThanOrEqual(6)
    })
  }
})

describe('各站特殊設施', () => {
  const spec = (id: string) => STATION_BY_ID.get(id)!
  const doorSpecs = (id: string) => layouts.get(id)!.doors.map((d) => d.spec)

  it('控制台綁定自己的站', () => {
    for (const id of ['nyx', 'adjudicatrix', 'tenshu', 'bravado', 'caldera', 'portage', 'pirate']) {
      const c = pois(id, 'console')
      expect(c.length, id).toBe(1)
      expect(c[0].def.ref).toBe(id)
      expect(spec(id).space.pilotable).toBe(true)
    }
    for (const id of ['hulk7', 'vivarium', 'verdance', 'cinder', 'uo']) expect(pois(id, 'console').length, id).toBe(0)
  })

  it('裁決者號：雷達、鑄造台與 3×3 平台、掃描增幅模組座', () => {
    expect(pois('adjudicatrix', 'vendor').map((p) => p.def.ref).sort()).toEqual(['escapePod', 'fusion', 'maintenance', 'medical', 'outpost', 'radar', 'suitA', 'suitD'])
    expect(pois('adjudicatrix', 'fabricator').length).toBe(1)
    const pad = pois('adjudicatrix', 'fabricatorPad')
    expect(pad.length).toBe(9)
    expect(new Set(pad.map((p) => p.col)).size).toBe(3)
    expect(pois('adjudicatrix', 'moduleSocket')[0].def.data?.module).toBe('modScanAmp')
  })

  it('天守砲台：反物質模組座、LQ 倉儲、主砲', () => {
    expect(pois('tenshu', 'moduleSocket')[0].def.data?.module).toBe('modAntimatter')
    expect(pois('tenshu', 'vendor').map((p) => p.def.ref).sort()).toEqual(['escapePod', 'fusion', 'lq', 'medical', 'outpost', 'suitB'])
    expect(pois('tenshu', 'cannonBreech').length).toBe(1)
    expect(spec('tenshu').space.abilities).toContain('st.cannon')
  })

  it('七號廢站：清潔工門、危險區、沒有販賣機', () => {
    expect(doorSpecs('hulk7').some((d) => d.clearance === 'janitor')).toBe(true)
    expect(layouts.get('hulk7')!.cells.some((c) => c === Cell.Hazard)).toBe(true)
    expect(pois('hulk7', 'vendor').length).toBe(0)
    expect(layouts.get('hulk7')!.rooms.every((r) => r.spec.type === 'derelict')).toBe(true)
  })

  it('豪勇號：四種防護服、兩台醫療、降落傳送門、艦長出生點、至少 4 扇保全門', () => {
    const refs = pois('bravado', 'vendor').map((p) => p.def.ref)
    for (const r of ['suitA', 'suitB', 'suitC', 'suitD', 'fusion', 'maintenance', 'outpost', 'escapePod']) expect(refs).toContain(r)
    expect(refs.filter((r) => r === 'medical').length).toBe(2)
    expect(pois('bravado', 'landingPortal').length).toBe(1)
    expect(pois('bravado', 'captainSpawn').length).toBe(1)
    expect(doorSpecs('bravado').filter((d) => d.security).length).toBeGreaterThanOrEqual(4)
    expect(spec('bravado').space.abilities).toEqual(expect.arrayContaining(['st.land', 'st.autopilot']))
  })

  it('火口號與擺渡號：不可停靠、有出口', () => {
    for (const id of ['caldera', 'portage']) {
      expect(spec(id).dockable).toBe(false)
      expect(layouts.get(id)!.exits.length).toBeGreaterThan(0)
    }
    expect(pois('caldera', 'moduleSocket')[0].def.data?.module).toBe('refinedOre,modNeurotoxin')
    expect(pois('caldera', 'engineerSpawn').length).toBe(1)
    const tp = pois('portage', 'teleportPad').length
    expect(tp).toBeGreaterThanOrEqual(6)
    expect(tp).toBeLessThanOrEqual(10)
  })

  it('活體庫號：6 間上鎖隔間，各有一個標本生成點', () => {
    const l = layouts.get('vivarium')!
    for (let n = 1; n <= 6; n++) {
      const room = l.rooms.find((r) => r.spec.id === `cell${n}`)!
      expect(room.spec.type).toBe('cell')
      const marks = pois('vivarium', `specimen${n}`)
      expect(marks.length).toBe(1)
      expect(l.roomOf[marks[0].row * l.w + marks[0].col]).toBe(room.index)
      // 隔間的門開局上鎖
      const doors = l.doors.filter((d) => d.cells.some(([c, r]) => [[1, 0], [-1, 0], [0, 1], [0, -1]].some(([dc, dr]) => l.roomOf[(r + dr) * l.w + c + dc] === room.index)))
      expect(doors.length).toBeGreaterThan(0)
      for (const d of doors) expect(d.spec.locked).toBe(true)
    }
    expect(pois('vivarium', 'cellConsole').length).toBe(1)
    expect(pois('vivarium', 'cageConsole').length).toBe(1)
    expect(pois('vivarium', 'cagePad').length).toBeGreaterThan(0)
  })

  it('翠原星與餘燼衛星：室外、公轉', () => {
    const v = spec('verdance')
    expect(v.outdoor).toBe(true)
    expect(v.weather).toBe('rain')
    expect(v.space.orbit).toEqual({ around: 'center', radius: 23, degPerSec: 0.25 })
    expect(spec('cinder').space.orbit).toEqual({ around: 'verdance', radius: 8, degPerSec: 1.5 })
    expect(pois('verdance', 'slugSpawn').length).toBeGreaterThanOrEqual(10)
    for (const k of ['freakSpawn', 'foxSpawn', 'anomalySpawn', 'elderSpawn', 'landingSite', 'landingPortal', 'penguinStatue']) expect(pois('verdance', k).length, k).toBe(1)
    expect(doorSpecs('verdance').some((d) => d.clearance === 'janitor')).toBe(true)
    expect(spec('verdance').docked).toEqual([{ ship: 'harrier', pad: 0 }])
    expect(pois('cinder', 'moduleFactory').length).toBe(1)
    expect(pois('cinder', 'moduleOut').length).toBeGreaterThan(0)
    expect(pois('cinder', 'vendor')[0].def.ref).toBe('gravity')
  })

  it('未識別物體與海盜船：事件標記', () => {
    expect(pois('uo', 'deadScientist').length).toBeGreaterThan(1)
    expect(pois('uo', 'entitySpawn').length).toBeGreaterThan(0)
    expect(pois('uo', 'codePanel').length).toBe(1)
    expect(layouts.get('uo')!.rooms.some((r) => r.spec.type === 'code')).toBe(true)
    expect(pois('pirate', 'pirateCaptain').length).toBe(1)
    expect(pois('pirate', 'pirateSpawn').length).toBe(3)
    expect(pois('pirate', 'sentrySpawn').length).toBe(3)
    expect(pois('pirate', 'rummageBox').length).toBe(2)
  })

  it('太空座標換算與研究 §1.1 一致', () => {
    const conv = (x: number, y: number) => [Math.round((x - 11472) / 10) / 10, Math.round((y + 11472) / 10) / 10]
    expect(spec('adjudicatrix').space.pos).toEqual(conv(14236.8, -8238))
    expect(spec('tenshu').space.pos).toEqual(conv(7809.9, -12085.6))
    expect(spec('bravado').space.pos).toEqual(conv(9336.7, -14374.2))
    expect(spec('hulk7').space.radius).toBe(1.0)
    // 格中心換算檢查（版面 y 向上）
    const l = layouts.get('adjudicatrix')!
    expect(cellCenter(l, 0, 0).y).toBe(l.h - 0.5)
  })
})
