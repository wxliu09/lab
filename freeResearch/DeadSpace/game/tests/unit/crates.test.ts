// 雜物箱（回歸審查 R6）：
// 1. 右鍵：自己有翻找技能＝走過去翻找（client 送出對箱子的翻找施放，sim 走到射程內才翻）；冷卻中照樣走過去並說明；
//    沒有技能的人右鍵只會走過去，不會誤觸發翻找或攻擊。
// 2. 戰爭迷霧記憶：程式放置的箱子是一般實體，離開視野就從快照消失；render 端（crateMemory.ts）記住最後看到的箱子，
//    離開視野後畫成記憶模型，只有那一格看得到而實體不在才忘掉；死者／旁觀者整區看得到。不改 sim 的可見性。
import { describe, expect, it } from 'vitest'
import { Harness, type FakeClient } from './helpers/harness'
import '../../src/shared/content/index'
import { CRATE_DEF, RUMMAGE, meCtx, rightClickAction, rummageClick, type MeCtx } from '../../src/client/interactKind'
import { CrateMemory, type CrateSeen } from '../../src/render/crateMemory'
import { GONE_AFTER, PoiTracker, sightOf } from '../../src/render/poiState'
import { cellAt, parseLayout, type LayoutSpec, type ParsedLayout } from '../../src/shared/layout'
import type { PrivateState, SnapEntity } from '../../src/shared/protocol/messages'
import type { Game, GamePlayer } from '../../src/sim/game'
import type { Ent } from '../../src/sim/ent'

const sec = (h: Harness, s: number) => h.ticks(Math.round(s * 20))

function setup(seed = 4242) {
  const { h, cs } = Harness.started(3, seed, { eventMult: 0 })
  const g = h.server.game!
  const ps = g.allPlayers()
  for (const p of ps) g.setRole(p, 'human')
  return { h, g, cs, ps }
}

const clientOf = (cs: FakeClient[], p: GamePlayer): FakeClient => cs.find((c) => c.slot === p.slot)!

/** 模擬 client：用快照累積的實體與私有狀態算 MeCtx（和 input.ts／WorldHover 同一個函式）*/
function meOf(c: FakeClient): MeCtx {
  const ents = new Map<number, { s: SnapEntity }>()
  for (const [id, s] of c.ents) ents.set(id, { s })
  return meCtx({ me: c.me as Partial<PrivateState>, ents })
}

/** 版面上固定的雜物箱（rummageBox POI）由站體畫、由 poiState 追蹤；這裡只看 sim 開局補放的箱子 */
function onPoiCell(l: ParsedLayout, x: number, y: number): boolean {
  const { col, row } = cellAt(l, x, y)
  return l.pois.some((p) => p.col === col && p.row === row)
}

/** 站到離箱子約 d 公尺、看得到它的空地上 */
function standNear(g: Game, u: Ent, crate: Ent, d: number): void {
  const z = g.world.zones[crate.zone]
  for (let k = 0; k < 16; k++) {
    const a = (k / 16) * Math.PI * 2
    const n = z.nav!.nearestOpen(crate.x + Math.cos(a) * d, crate.y + Math.sin(a) * d)
    if (!n || Math.hypot(n.x - crate.x, n.y - crate.y) < d * 0.7 || !z.nav!.los(n.x, n.y, crate.x, crate.y, true)) continue
    g.world.relocate(u, crate.zone, n.x, n.y)
    u.order = null
    u.queue.length = 0
    u.path = null
    return
  }
  throw new Error('找不到箱子旁的空地')
}

/** 某站離玩家最近的、sim 開局補放的雜物箱 */
function crateIn(g: Game, zid: number): Ent {
  const z = g.world.zones[zid]
  const list = g.world.inZone(zid).filter((e) => e.alive && e.def.id === CRATE_DEF && !onPoiCell(z.layout!, e.x, e.y))
  expect(list.length).toBeGreaterThan(0)
  return list[0]
}

describe('雜物箱的右鍵', () => {
  it('有翻找技能：右鍵＝走過去翻找，箱子被翻開、花掉能量', () => {
    const { h, g, cs, ps } = setup()
    const p = ps[1]
    const u = g.mainOf(p)!
    if (!u.abilities.includes(RUMMAGE)) u.abilities.push(RUMMAGE)
    u.mp = u.maxMp
    const crate = crateIn(g, u.zone)
    standNear(g, u, crate, 3)
    sec(h, 0.3)
    const c = clientOf(cs, p)
    const s = c.ents.get(crate.id)!
    expect(s, '站在旁邊看得到箱子').toBeTruthy()
    const me = meOf(c)
    expect(rightClickAction(s, me)).toBe('rummage')
    const r = rummageClick(crate.id, s, me)
    expect(r.cmd).toEqual({ k: 'cast', a: RUMMAGE, e: crate.id, q: false })
    expect(r.notice).toBeUndefined()
    const mp0 = u.mp
    g.handleCommand(p.slot, r.cmd)
    sec(h, 4)
    expect(crate.alive).toBe(false)
    expect(u.mp).toBeLessThan(mp0 - 40)
    // 箱子從快照消失
    expect(c.ents.has(crate.id)).toBe(false)
  })

  it('冷卻中：右鍵照樣走過去，但不翻；附上冷卻提示', () => {
    const { h, g, cs, ps } = setup()
    const p = ps[1]
    const u = g.mainOf(p)!
    if (!u.abilities.includes(RUMMAGE)) u.abilities.push(RUMMAGE)
    u.mp = u.maxMp
    u.cds.set(RUMMAGE, g.time + 8)
    const crate = crateIn(g, u.zone)
    standNear(g, u, crate, 3)
    sec(h, 0.3)
    const c = clientOf(cs, p)
    const s = c.ents.get(crate.id)!
    const r = rummageClick(crate.id, s, meOf(c))
    expect(r.cmd).toEqual({ k: 'interact', e: crate.id, q: false })
    expect(r.notice?.key).toBe('tip.ability.cooling')
    const d0 = Math.hypot(u.x - crate.x, u.y - crate.y)
    g.handleCommand(p.slot, r.cmd)
    sec(h, 3)
    expect(crate.alive).toBe(true)
    expect(Math.hypot(u.x - crate.x, u.y - crate.y)).toBeLessThan(d0)
  })

  it('沒有翻找技能：右鍵只會走過去，不會誤觸發翻找或攻擊', () => {
    const { h, g, cs, ps } = setup()
    const p = ps[1]
    const u = g.mainOf(p)!
    u.abilities = u.abilities.filter((a) => a !== RUMMAGE)
    const crate = crateIn(g, u.zone)
    standNear(g, u, crate, 3)
    sec(h, 0.3)
    const c = clientOf(cs, p)
    const s = c.ents.get(crate.id)!
    const me = meOf(c)
    expect(rightClickAction(s, me)).toBe('interact')
    const hp0 = crate.hp
    g.handleCommand(p.slot, { k: 'interact', e: crate.id })
    sec(h, 4)
    expect(crate.alive).toBe(true)
    expect(crate.hp).toBe(hp0)
    expect(u.cast).toBeNull()
    expect(Math.hypot(u.x - crate.x, u.y - crate.y)).toBeLessThan(2)
  })
})

// 左房 a、右房 b，中間一道門；右房兩個箱子的位置（不用 POI，模擬 sim 補放的實體）
const SPEC: LayoutSpec = {
  rows: [
    '###########',
    '#....#....#',
    '#....D....#',
    '#....#....#',
    '###########',
  ],
  pois: {},
  rooms: [
    { id: 'a', name: { zh: 'A', en: 'A' }, type: 'lab', seed: [1, 1] },
    { id: 'b', name: { zh: 'B', en: 'B' }, type: 'lab', seed: [7, 1] },
  ],
}
const L = parseLayout(SPEC)
const TR = new PoiTracker(L)
const C1: CrateSeen = { x: 8.5, y: 2.5, f: 0 }
const C2: CrateSeen = { x: 7.5, y: 1.5, f: 1.2 }
/** 右房裡（看得到兩個箱子）／左房（門關著就看不到右房）*/
const RIGHT = [{ x: 7.2, y: 2.5, r: 8 }]
const LEFT = [{ x: 2.5, y: 2.5, r: 8 }]
const closed = () => true
const vis = (src: { x: number; y: number; r: number }[]) => (x: number, y: number) => TR.visibleAt(x, y, src, closed)
const present = (list: [number, CrateSeen][]) => new Map(list)

describe('雜物箱的迷霧記憶', () => {
  it('看過的箱子離開視野後仍在記憶裡（畫成記憶模型），多久都一樣', () => {
    const m = new CrateMemory()
    m.update(0, present([[1, C1], [2, C2]]), vis(RIGHT))
    expect([...m.ghosts()]).toEqual([])
    expect(m.known().sort()).toEqual([1, 2])
    // 走到左房、門關上：兩個箱子都不在快照裡，那兩格也看不到 → 記憶模型
    m.update(1, new Map(), vis(LEFT))
    expect(m.isGhost(1) && m.isGhost(2)).toBe(true)
    m.update(120, new Map(), vis(LEFT))
    expect([...m.ghosts()].map(([id, c]) => [id, c.x, c.y, c.f])).toEqual([
      [1, C1.x, C1.y, C1.f],
      [2, C2.x, C2.y, C2.f],
    ])
  })

  it('回到視野看到箱子還在：交還單位層畫（不畫記憶模型），記憶留著', () => {
    const m = new CrateMemory()
    m.update(0, present([[1, C1]]), vis(RIGHT))
    m.update(1, new Map(), vis(LEFT))
    expect(m.isGhost(1)).toBe(true)
    m.update(2, present([[1, C1]]), vis(RIGHT))
    expect(m.isGhost(1)).toBe(false)
    expect(m.known()).toEqual([1])
  })

  it('回到視野看到箱子被打破了才拿掉：看得到那一格就不畫，持續一小段時間才忘掉；短暫一瞥不算', () => {
    const m = new CrateMemory()
    m.update(0, present([[1, C1], [2, C2]]), vis(RIGHT))
    m.update(1, new Map(), vis(LEFT))
    // 視野外被打破（快照什麼都不會說）：記憶照舊
    m.update(5, new Map(), vis(LEFT))
    expect(m.isGhost(1)).toBe(true)
    // 回到右房：箱子 2 還在、箱子 1 不見了 → 箱子 1 馬上不畫
    m.update(6, present([[2, C2]]), vis(RIGHT))
    expect(m.isGhost(1)).toBe(false)
    // 只看了一下就離開：還沒確定被毀，離開視野又畫回來
    m.update(6 + GONE_AFTER * 0.5, present([[2, C2]]), vis(RIGHT))
    m.update(6 + GONE_AFTER * 0.6, new Map(), vis(LEFT))
    expect(m.isGhost(1)).toBe(true)
    // 再回來持續看著：忘掉，之後離開視野也不會再出現
    m.update(10, present([[2, C2]]), vis(RIGHT))
    m.update(10 + GONE_AFTER + 0.01, present([[2, C2]]), vis(RIGHT))
    expect(m.known()).toEqual([2])
    m.update(20, new Map(), vis(LEFT))
    expect([...m.ghosts()].map(([id]) => id)).toEqual([2])
  })

  it('在眼前被翻開或打破：實體一離開快照就不畫（不多留一下）', () => {
    const m = new CrateMemory()
    m.update(0, present([[1, C1]]), vis(RIGHT))
    m.update(0.05, new Map(), vis(RIGHT))
    expect(m.isGhost(1)).toBe(false)
    m.update(0.05 + GONE_AFTER, new Map(), vis(RIGHT))
    expect(m.known()).toEqual([])
  })

  it('門打開就看得到右房：照 sim 的視野規則（半徑＋牆／門擋視線）', () => {
    const m = new CrateMemory()
    m.update(0, present([[1, C1]]), vis(RIGHT))
    // 左房、門開著、半徑夠：看得到那一格，實體不在 → 不畫、之後忘掉
    const openVis = (x: number, y: number) => TR.visibleAt(x, y, LEFT, () => false)
    m.update(1, new Map(), openVis)
    expect(m.isGhost(1)).toBe(false)
    m.update(1 + GONE_AFTER, new Map(), openVis)
    expect(m.known()).toEqual([])
    // 半徑不夠：看不到，維持記憶
    const m2 = new CrateMemory()
    m2.update(0, present([[1, C1]]), vis(RIGHT))
    const short = (x: number, y: number) => TR.visibleAt(x, y, [{ x: 2.5, y: 2.5, r: 3 }], () => false)
    m2.update(1, new Map(), short)
    m2.update(5, new Map(), short)
    expect(m2.isGhost(1)).toBe(true)
  })

  it('死者／旁觀者整區都看得到：不在快照裡的箱子就是不在了', () => {
    const m = new CrateMemory()
    m.update(0, present([[1, C1], [2, C2]]), vis(RIGHT))
    m.update(1, present([[2, C2]]), () => false, true)
    expect(m.isGhost(1)).toBe(false)
    m.update(1 + GONE_AFTER, present([[2, C2]]), () => false, true)
    expect(m.known()).toEqual([2])
    expect([...m.ghosts()]).toEqual([])
  })

  it('sightOf：死者／旁觀者（沒有視野來源）整區看得到；出局的死者、靠記憶核心觀看的仿生人不算', () => {
    const doors = new Map<number, number>([[10001, 1]])
    expect(sightOf({ vs: [], doors, me: { alive: false } }, 1).full).toBe(true)
    expect(sightOf({ vs: [], doors, me: { alive: true, role: 'spectator' } }, 1).full).toBe(true)
    expect(sightOf({ vs: [], doors, me: { alive: false, booted: true } }, 1).full).toBe(false)
    const core = sightOf({ vs: [[1, 25, 25, 65]], doors, me: { alive: false } }, 1)
    expect(core.full).toBe(false)
    expect(core.sources).toEqual([{ x: 2.5, y: 2.5, r: 6.5 }])
    expect(core.doorClosed(1)).toBe(false)
    expect(core.doorClosed(0)).toBe(true)
    expect(sightOf({ vs: [[2, 25, 25, 65]], doors, me: { alive: true } }, 1).sources).toEqual([])
  })

  it('實際對局：走過每個房間，看過的箱子都留在記憶裡；視野外被打破的箱子要走回去看到才消失；記憶只有快照送過的箱子', () => {
    const { h, g, cs, ps } = setup()
    const p = ps[1]
    const u = g.mainOf(p)!
    const c = clientOf(cs, p)
    const z = g.world.zones[u.zone]
    const l = z.layout!
    const tr = new PoiTracker(l)
    const m = new CrateMemory()
    // 模擬 client：快照累積的視野來源與門
    const cw = { vs: [] as [number, number, number, number][], doors: new Map<number, number>(), me: c.me as { alive?: boolean } }
    let read = 0
    const everSent = new Set<number>()
    let now = 0
    const step = (n = 4) => {
      for (let i = 0; i < n; i++) {
        h.ticks(1)
        for (; read < c.snaps.length; read++) {
          const s = c.snaps[read]
          if (s.vs) cw.vs = s.vs
          if (s.doors) for (const [k, v] of Object.entries(s.doors)) cw.doors.set(Number(k), v)
        }
        now += 0.05
        const pres = new Map<number, CrateSeen>()
        for (const e of c.ents.values()) {
          if (e.d !== CRATE_DEF || e.z !== z.id) continue
          const x = (e.x ?? 0) / 100
          const y = (e.y ?? 0) / 100
          if (onPoiCell(l, x, y)) continue
          pres.set(e.i, { x, y, f: (e.f ?? 0) / 100 })
          everSent.add(e.i)
        }
        const v = sightOf(cw, z.id)
        m.update(now, pres, (x, y) => tr.visibleAt(x, y, v.sources, v.doorClosed), v.full)
      }
    }
    const total = g.world.inZone(z.id).filter((e) => e.def.id === CRATE_DEF && !onPoiCell(l, e.x, e.y)).length
    expect(total).toBeGreaterThan(3)
    step()
    for (const r of l.rooms) {
      const n = z.nav!.nearestOpen(r.cx, r.cy) ?? { x: r.cx, y: r.cy }
      g.world.relocate(u, z.id, n.x, n.y)
      u.order = null
      step(10)
    }
    const known = m.known()
    // 記憶只有快照送過的箱子（不洩漏）
    for (const id of known) expect(everSent.has(id)).toBe(true)
    // 送過的都還記得（走遍全站，沒有因為離開視野就忘掉）
    expect(known.length).toBe(everSent.size)
    expect(known.length).toBeGreaterThan(total * 0.6)
    const ghosts = [...m.ghosts()].map(([id]) => id)
    const visibleNow = [...c.ents.values()].filter((e) => e.d === CRATE_DEF && e.z === z.id).length
    expect(ghosts.length).toBeGreaterThan(0)
    expect(ghosts.length + visibleNow).toBeGreaterThanOrEqual(known.length)
    // 視野外的一個記憶中的箱子被打破：記憶照舊（看不到就不知道）
    const gone = g.world.get(ghosts[0])!
    g.killEnt(gone, null, -1)
    step(10)
    expect(m.isGhost(gone.id)).toBe(true)
    // 走回去看到那一格：拿掉
    standNear(g, u, gone, 2.5)
    step(Math.ceil((GONE_AFTER + 0.3) / 0.05))
    expect(m.known()).not.toContain(gone.id)
    expect(m.isGhost(gone.id)).toBe(false)
  })
})
