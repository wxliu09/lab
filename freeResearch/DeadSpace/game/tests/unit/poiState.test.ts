// 站內固定設施的外觀狀態（建物盤點 A1 P1-2、P1-4）：被摧毀的設施在看得到那一格時才換成殘骸、視野外維持記憶；
// 損毀的控制台換成殘骸外觀、修好換回；無敵與不會被打爆的設施不追蹤；判定照 sim 的視野規則（半徑＋牆／門擋視線）
import { describe, expect, it } from 'vitest'
import { parseLayout, type LayoutSpec } from '../../src/shared/layout'
import { GONE_AFTER, PoiTracker, TRACKED_POI, lookOfDef, type PoiSeen } from '../../src/render/poiState'
import { STATION_BY_ID } from '../../src/shared/content/stations/index'
import '../../src/shared/content/index'
import { NavGrid } from '../../src/sim/nav/grid'
import { Cell, cellAt } from '../../src/shared/layout'
import { Harness } from './helpers/harness'
import { addStation } from '../../src/sim/setup'
import { isStructureId } from '../../src/client/interactKind'

// 左房：販賣機 V（第 1 列第 2 欄）、控制台 C；右房：GIT G；中間一道門；動力分配台 W 不追蹤
const SPEC: LayoutSpec = {
  rows: [
    '###########',
    '#.V..#..G.#',
    '#....D....#',
    '#.C..#..W.#',
    '###########',
  ],
  pois: {
    V: { kind: 'vendor', ref: 'medical' },
    C: { kind: 'console' },
    G: { kind: 'git' },
    W: { kind: 'powerConsole' },
  },
  rooms: [
    { id: 'a', name: { zh: 'A', en: 'A' }, type: 'lab', seed: [1, 1] },
    { id: 'b', name: { zh: 'B', en: 'B' }, type: 'lab', seed: [7, 1] },
  ],
}
const L = parseLayout(SPEC)
const keyOf = (ch: string) => {
  const p = L.pois.find((q) => q.key === ch)!
  return { key: `${p.col},${p.row}`, x: p.x, y: p.y }
}
const V = keyOf('V')
const C = keyOf('C')
const G = keyOf('G')
const W = keyOf('W')
/** 站在左房靠門的位置、視野 8 m（避開剛好擦過牆角的視線：sim 的 los 在格角一律先走 y，會被擋）*/
const LEFT = [{ x: 4.2, y: 2.5, r: 8 }]
const closed = () => true
const open = () => false

function seen(list: [string, PoiSeen][]): Map<string, PoiSeen> {
  return new Map(list)
}

describe('固定設施的外觀狀態', () => {
  it('只追蹤會被打爆／換掉的種類（販賣機、控制台、GIT、雜物箱、雕像、模組工廠、安裝座）', () => {
    const tr = new PoiTracker(L)
    expect(tr.tracked().map((c) => c.key).sort()).toEqual([V.key, C.key, G.key].sort())
    for (const k of ['vendor', 'console', 'git', 'rummageBox', 'penguinStatue', 'moduleFactory', 'moduleSocket']) expect(TRACKED_POI.has(k)).toBe(true)
    for (const k of ['powerConsole', 'fabricator', 'cellConsole', 'cageConsole', 'regenerator', 'landingPortal']) expect(TRACKED_POI.has(k)).toBe(false)
    void W
  })

  it('看得到那一格、實體不在超過一小段時間才判定被摧毀；短暫缺席（快照抖動）不算', () => {
    const tr = new PoiTracker(L)
    const all = seen([
      [V.key, { def: 'vendor.medical', invuln: false }],
      [C.key, { def: 'struct.console', invuln: false }],
    ])
    expect(tr.update(0, all, LEFT, closed)).toEqual([])
    // 販賣機不見了：先不判定
    const noV = seen([[C.key, { def: 'struct.console', invuln: false }]])
    expect(tr.update(0.1, noV, LEFT, closed)).toEqual([])
    expect(tr.update(0.1 + GONE_AFTER * 0.5, noV, LEFT, closed)).toEqual([])
    // 又出現（只是一份快照沒帶到）：重新計時
    tr.update(0.1 + GONE_AFTER * 0.6, all, LEFT, closed)
    expect(tr.update(0.1 + GONE_AFTER * 1.2, noV, LEFT, closed)).toEqual([])
    // 持續看得到卻不在：被摧毀
    expect(tr.update(0.1 + GONE_AFTER * 2.4, noV, LEFT, closed)).toEqual([[V.key, 'gone']])
    expect(tr.look(V.key)).toBe('gone')
    expect(tr.look(C.key)).toBe('ok')
  })

  it('視野外（隔著關著的門、超出半徑）不判定：維持記憶中的樣子，門打開看到了才換', () => {
    const tr = new PoiTracker(L)
    // 右房的 GIT 從沒看過、也看不到（門關著）：一直完好
    for (let t = 0; t < 5; t += 0.5) expect(tr.update(t, new Map(), LEFT, closed).some(([k]) => k === G.key)).toBe(false)
    expect(tr.look(G.key)).toBe('ok')
    // 門開了：看得到那一格、GIT 不在 → 被摧毀（第一次看到就已經被打爆的設施也要換掉）
    tr.update(5, new Map(), LEFT, open)
    expect(tr.update(5 + GONE_AFTER + 0.01, new Map(), LEFT, open)).toContainEqual([G.key, 'gone'])
    // 太遠：半徑外不判定
    const tr2 = new PoiTracker(L)
    const far = [{ x: 1.5, y: 2.5, r: 3 }]
    tr2.update(0, new Map(), far, open)
    tr2.update(GONE_AFTER * 2, new Map(), far, open)
    expect(tr2.look(G.key)).toBe('ok')
  })

  it('損毀的控制台換成殘骸外觀，修好換回；被毀的設施再看到實體（重建）就換回完好', () => {
    const tr = new PoiTracker(L)
    expect(tr.update(0, seen([[C.key, { def: 'struct.console', invuln: false }]]), LEFT, closed)).toEqual([])
    expect(tr.update(0.1, seen([[C.key, { def: 'struct.consoleBroken', invuln: true }]]), LEFT, closed)).toEqual([[C.key, 'broken']])
    expect(tr.update(0.2, seen([[C.key, { def: 'struct.console', invuln: false }]]), LEFT, closed)).toEqual([[C.key, 'ok']])
    expect(lookOfDef('console', 'struct.consoleBroken')).toBe('broken')
    expect(lookOfDef('vendor', 'struct.consoleBroken')).toBe('ok')
  })

  it('最後看到時是無敵的設施（擺渡號控制台、空的安裝座）不會被判定成被毀', () => {
    const tr = new PoiTracker(L)
    tr.update(0, seen([[C.key, { def: 'struct.console', invuln: true }]]), LEFT, closed)
    tr.update(1, new Map(), LEFT, closed)
    tr.update(1 + GONE_AFTER * 2, new Map(), LEFT, closed)
    expect(tr.look(C.key)).toBe('ok')
  })

  it('整個 zone 都看得到（死者、旁觀者）時不需要視野來源', () => {
    const tr = new PoiTracker(L)
    tr.update(0, new Map(), [], closed, true)
    tr.update(GONE_AFTER + 0.01, new Map(), [], closed, true)
    expect(tr.look(G.key)).toBe('gone')
    expect(tr.look(V.key)).toBe('gone')
  })

  it('真實站點：每座站的版面都能建追蹤器，販賣機與控制台都在追蹤清單裡', () => {
    for (const st of STATION_BY_ID.values()) {
      const l = parseLayout(st.layout)
      const tr = new PoiTracker(l)
      const kinds = new Set(tr.tracked().map((c) => c.kind))
      if (l.pois.some((p) => p.def.kind === 'console')) expect(kinds.has('console'), st.id).toBe(true)
      for (const c of tr.tracked()) expect(TRACKED_POI.has(c.kind)).toBe(true)
    }
  })

  it('看不看得到和 sim 的 nav.los 一致（女帝號：隨機視點 × 每個設施，門全關／全開）', () => {
    const l = parseLayout(STATION_BY_ID.get('nyx')!.layout)
    const tr = new PoiTracker(l)
    const nav = new NavGrid(l)
    let a = 12345
    const rnd = () => ((a = (a * 16807) % 2147483647), a / 2147483647)
    const floors: number[] = []
    for (let i = 0; i < l.w * l.h; i++) if (l.cells[i] === Cell.Floor) floors.push(i)
    let seenTrue = 0
    for (const doorsOpen of [false, true]) {
      nav.doorClosed.fill(doorsOpen ? 0 : 1)
      for (let n = 0; n < 300; n++) {
        const i = floors[Math.floor(rnd() * floors.length)]
        const col = i % l.w
        const row = (i - col) / l.w
        const src = { x: col + 0.1 + rnd() * 0.8, y: l.h - 1 - row + 0.1 + rnd() * 0.8, r: 13 }
        for (const c of tr.tracked()) {
          const want = Math.hypot(src.x - c.x, src.y - c.y) <= src.r * 0.92 && nav.los(src.x, src.y, c.x, c.y, true)
          const got = tr.visibleAt(c.x, c.y, [src], () => !doorsOpen)
          expect(got, `${c.kind} @${c.key} from ${src.x.toFixed(2)},${src.y.toFixed(2)}`).toBe(want)
          if (got) seenTrue++
        }
      }
    }
    expect(seenTrue).toBeGreaterThan(20)
  })

  it('開局後每個追蹤中的 POI 格上都有 client 認得的結構實體（否則看得到那一格時會被誤判成被毀）', () => {
    const { h } = Harness.started(2, 77, { stations: ['caldera', 'portage', 'vivarium'] })
    const g = h.server.game!
    let n = 0
    // 事件站也一起檢查
    for (const id of ['pirate', 'uo']) {
      const st = STATION_BY_ID.get(id)
      if (st && !g.world.zones.some((z) => z.station?.id === id)) addStation(g, st, [30 + n * 8, 30])
      n++
    }
    n = 0
    for (const z of g.world.zones) {
      if (!z.alive || !z.layout || !z.station) continue
      const tr = new PoiTracker(z.layout)
      const cells = new Set<string>()
      for (const e of g.world.inZone(z.id)) {
        const d = (e.data.viewDef as string | undefined) ?? e.def.id
        if (!isStructureId(d)) continue
        const { col, row } = cellAt(z.layout, e.x, e.y)
        cells.add(`${col},${row}`)
      }
      for (const c of tr.tracked()) {
        expect(cells.has(c.key), `${z.station.id} ${c.kind} @${c.key}`).toBe(true)
        n++
      }
    }
    expect(n).toBeGreaterThan(40)
  })
})
