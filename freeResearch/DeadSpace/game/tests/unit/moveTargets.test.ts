// 右鍵移動的目標修正（render/moveTargets.ts）：用真的 sim 驗證
// - 右鍵控制台走到控制圈裡站得到的點，一定會開始駕駛（不會繞到控制台後面的牆邊）；船艙控制台一樣（停泊中＝開始發射倒數）
// - 剛按 B 交出控制台、還站在圈裡：只走到圈裡的點不會重新駕駛（sim 的交還鎖），先退出圈外再走回來就會
// - 小地圖右鍵點在控制台上：推到圈外，不會被切去駕駛；點到牆、實心設施改成同房間最近的可走格；整個走不到回傳 null
import { describe, expect, it } from 'vitest'
import { Harness } from './helpers/harness'
import { consolePos, spaceOf } from '../../src/sim/systems/space'
import { parseLayout } from '../../src/shared/layout'
import { MINIMAP, poiColor, poiShape } from '../../src/ui/minimapColors'
import { ARRIVE, CONSOLE_R, circleClear, consoleAt, consoleApproach, consoleSpots, minimapMoveTarget, reachFrom, walkableTarget } from '../../src/render/moveTargets'

function nyxGame(seed = 3) {
  const { h, cs } = Harness.started(2, seed, { eventMult: 0, npcCrew: 0, bots: 0 })
  const g = h.server.game!
  const p = g.players[cs[0].slot]
  const u = g.mainOf(p)!
  const z = g.world.zones.find((q) => q.key === 'nyx')!
  const con = [...g.world.inZone(z.id)].find((e) => e.data.poi === 'console')!
  const st = g.world.get(z.spaceEnt)!
  // 另一位玩家放遠一點、凍住（不要剛好站上控制台）
  const other = g.mainOf(g.players[cs[1].slot])!
  other.data.frozen = true
  return { h, g, p, u, z, con, st }
}

describe('右鍵控制台：走進控制圈', () => {
  it('版面上的控制台位置就是 sim 的控制圈中心（站點主控台、船艙控制台）', () => {
    const { g, z, con } = nyxGame()
    const spots = consoleSpots(z.layout!)
    expect(spots.some((s) => s.kind === 'console' && s.x === con.x && s.y === con.y)).toBe(true)
    const inst = [...spaceOf(g).ships.values()].find((s) => s.docked?.zone === z.id && s.def.id === 'mule')!
    const cz = g.world.zones[inst.zone]
    const c = consolePos(g, cz)!
    expect(consoleSpots(cz.layout!).map((s) => [s.kind, s.x, s.y])).toEqual([['shipConsole', c.x, c.y]])
  })

  for (const [name, dx, dy] of [
    ['南邊', 0, -5],
    ['東邊', 5, 0],
    ['西邊', -5, 0],
    ['東北角（控制台和北牆之間那一排）', 3, 1],
    ['西北角', -3, 1],
  ] as const) {
    it(`女帝號：從${name}右鍵控制台，走到的點站得下、在圈裡，而且會開始駕駛`, () => {
      const { h, g, p, u, z, con, st } = nyxGame()
      const l = z.layout!
      const start = z.nav!.nearestOpen(con.x + dx, con.y + dy)!
      g.world.relocate(u, z.id, start.x, start.y)
      u.order = null
      h.ticks(2)
      expect(p.control).toBe(u.id)
      const ap = consoleApproach(l, con, start, u.radius, reachFrom(l, start))!
      expect(ap).not.toBeNull()
      const d = Math.hypot(ap.stand.x - con.x, ap.stand.y - con.y)
      expect(d).toBeLessThanOrEqual(CONSOLE_R + u.radius - ARRIVE - 0.05)
      expect(circleClear(l, ap.stand.x, ap.stand.y, u.radius)).toBe(true)
      // 女帝號的控制台緊貼北牆前一排：不選控制台正後方（身體會卡到牆）
      expect(Math.abs(ap.stand.x - con.x) < 0.4 && ap.stand.y > con.y).toBe(false)
      g.handleCommand(p.slot, { k: 'move', x: ap.stand.x, y: ap.stand.y })
      for (let i = 0; i < 300 && p.control !== st.id; i++) h.ticks(1)
      expect(p.control).toBe(st.id)
    })
  }

  it('從南邊來：站在控制台南側（靠自己這一側，不繞到後面）', () => {
    const { z, con, u } = nyxGame()
    const l = z.layout!
    const start = z.nav!.nearestOpen(con.x, con.y - 6)!
    const ap = consoleApproach(l, con, start, u.radius, reachFrom(l, start))!
    expect(ap.stand.y).toBeLessThan(con.y - 0.8)
    expect(Math.abs(ap.stand.x - con.x)).toBeLessThan(0.5)
    expect(ap.out).not.toBeNull()
  })

  it('剛按 B 交出控制台：只走到圈裡的點不會重新駕駛；先退出圈外再走回來就會', () => {
    const { h, g, p, u, z, con, st } = nyxGame()
    const l = z.layout!
    const start = z.nav!.nearestOpen(con.x, con.y - 5)!
    g.world.relocate(u, z.id, start.x, start.y)
    h.ticks(2)
    let ap = consoleApproach(l, con, start, u.radius, reachFrom(l, start))!
    g.handleCommand(p.slot, { k: 'move', x: ap.stand.x, y: ap.stand.y })
    for (let i = 0; i < 300 && p.control !== st.id; i++) h.ticks(1)
    expect(p.control).toBe(st.id)
    h.ticks(10)
    g.handleCommand(p.slot, { k: 'unpilot' })
    h.ticks(2)
    expect(p.control).toBe(u.id)
    // 站在圈裡再右鍵一次（以前的作法：走到圈裡）：交還鎖還在，不會駕駛
    const here = { x: u.x, y: u.y }
    ap = consoleApproach(l, con, here, u.radius, reachFrom(l, here))!
    g.handleCommand(p.slot, { k: 'move', x: ap.stand.x, y: ap.stand.y })
    h.ticks(60)
    expect(p.control).toBe(u.id)
    // input.ts goPilot：先退到圈外（解鎖），再排隊走回圈裡
    expect(ap.out).not.toBeNull()
    g.handleCommand(p.slot, { k: 'move', x: ap.out!.x, y: ap.out!.y })
    g.handleCommand(p.slot, { k: 'move', x: ap.stand.x, y: ap.stand.y, q: true })
    for (let i = 0; i < 300 && p.control !== st.id; i++) h.ticks(1)
    expect(p.control).toBe(st.id)
  })

  it('騾級貨艙（停泊中）：右鍵船艙控制台走到的點會開始發射倒數', () => {
    const { h, g, p, u, z } = nyxGame()
    const inst = [...spaceOf(g).ships.values()].find((s) => s.docked?.zone === z.id && s.def.id === 'mule')!
    const cz = g.world.zones[inst.zone]
    const c = consolePos(g, cz)!
    const start = cz.nav!.nearestOpen(c.x - 6, c.y + 1)!
    g.world.relocate(u, cz.id, start.x, start.y)
    u.order = null
    h.ticks(2)
    expect(inst.launching).toBe(false)
    const ap = consoleApproach(cz.layout!, c, start, u.radius, reachFrom(cz.layout!, start))!
    expect(ap).not.toBeNull()
    g.handleCommand(p.slot, { k: 'move', x: ap.stand.x, y: ap.stand.y })
    for (let i = 0; i < 300 && !inst.launching; i++) h.ticks(1)
    expect(inst.launching).toBe(true)
  })
})

describe('小地圖右鍵', () => {
  it('點在控制台上：推到控制圈外（朝房間內側），走過去不會被切去駕駛', () => {
    const { h, g, p, u, z, con } = nyxGame()
    const l = z.layout!
    const start = z.nav!.nearestOpen(con.x + 2, con.y - 7)!
    g.world.relocate(u, z.id, start.x, start.y)
    h.ticks(2)
    for (const click of [
      { x: con.x, y: con.y },
      { x: con.x + 0.6, y: con.y - 0.7 },
      { x: con.x - 0.3, y: con.y + 0.9 },
    ]) {
      const to = minimapMoveTarget(l, click, { x: u.x, y: u.y }, u.radius)!
      expect(to).not.toBeNull()
      expect(Math.hypot(to.x - con.x, to.y - con.y)).toBeGreaterThan(CONSOLE_R + u.radius + ARRIVE)
      expect(consoleAt(consoleSpots(l), to, u.radius, ARRIVE)).toBeNull()
      // 控制台在北牆前：房間內側是南邊
      expect(to.y).toBeLessThan(con.y + 0.5)
      g.handleCommand(p.slot, { k: 'move', x: to.x, y: to.y })
      h.ticks(140)
      expect(p.control).toBe(u.id)
      expect(Math.hypot(u.x - to.x, u.y - to.y)).toBeLessThan(0.5)
    }
  })

  it('船艙裡點在控制台上也推出圈外', () => {
    const { g, z } = nyxGame()
    const inst = [...spaceOf(g).ships.values()].find((s) => s.docked?.zone === z.id && s.def.id === 'kestrel')!
    const cz = g.world.zones[inst.zone]
    const c = consolePos(g, cz)!
    const from = cz.nav!.nearestOpen(c.x - 6, c.y)!
    const to = minimapMoveTarget(cz.layout!, c, from, 0.4)!
    expect(to).not.toBeNull()
    expect(Math.hypot(to.x - c.x, to.y - c.y)).toBeGreaterThan(CONSOLE_R + 0.4 + ARRIVE)
  })

  it('點到牆或實心設施：改成同房間最近的可走格；點在空地照原點', () => {
    const l = parseLayout({
      rows: [
        '##########',
        '#....#...#',
        '#..v.#...#',
        '#....D...#',
        '##########',
      ],
      pois: { v: { kind: 'vendor', ref: 'medical' } },
      rooms: [
        { id: 'a', name: { zh: 'A', en: 'A' }, type: 'x', seed: [1, 1] },
        { id: 'b', name: { zh: 'B', en: 'B' }, type: 'x', seed: [7, 1] },
      ],
    })
    // 販賣機那一格（col 3, row 2 → x 3.5, y 2.5）
    const v = walkableTarget(l, { x: 3.5, y: 2.5 })!
    expect(Math.hypot(v.x - 3.5, v.y - 2.5)).toBeCloseTo(1, 5)
    expect(l.roomOf[(l.h - 1 - Math.floor(v.y)) * l.w + Math.floor(v.x)]).toBe(0)
    // 房間 A 和 B 之間的牆（col 5, row 1）：附近 3 格內任一房間的可走格
    const w = walkableTarget(l, { x: 5.5, y: 3.5 })!
    expect([4.5, 6.5]).toContain(w.x)
    // 空地照原點
    expect(walkableTarget(l, { x: 1.3, y: 1.7 })).toEqual({ x: 1.3, y: 1.7 })
  })

  it('整個走不到（被牆圍住的空地、岩壁深處）：回傳 null（顯示「無法到達」）', () => {
    const l = parseLayout({
      rows: [
        '############',
        '#....#######',
        '#....##..###',
        '#....##..###',
        '############',
        '############',
        '############',
        '############',
        '############',
      ],
      pois: {},
      rooms: [
        { id: 'a', name: { zh: 'A', en: 'A' }, type: 'x', seed: [1, 1] },
        { id: 'pocket', name: { zh: 'P', en: 'P' }, type: 'x', seed: [7, 2] },
      ],
    })
    const from = { x: 2.5, y: 7.5 }
    // 被圍住的房間：走不到
    expect(minimapMoveTarget(l, { x: 7.5, y: 6.5 }, from)).toBeNull()
    // 岩壁深處（附近 3 格內沒有走得到的地方）
    expect(minimapMoveTarget(l, { x: 6.5, y: 1.5 }, from)).toBeNull()
    // 不知道自己在哪（不在這個 zone）時不檢查走不走得到
    expect(minimapMoveTarget(l, { x: 7.5, y: 6.5 }, null)).toEqual({ x: 7.5, y: 6.5 })
    // 走得到的房間照常
    expect(minimapMoveTarget(l, { x: 3.5, y: 6.5 }, from)).toEqual({ x: 3.5, y: 6.5 })
  })
})

describe('小地圖上的控制台', () => {
  it('站點主控台與船艙控制台都畫成控制台色的空心方框（和玩家的實心圓點分開）；其他設施維持實心方塊', () => {
    for (const k of ['console', 'shipConsole']) {
      expect(poiShape(k), k).toBe('hollowSquare')
      expect(poiColor(k), k).toBe(MINIMAP.console)
    }
    for (const k of ['vendor', 'git', 'powerConsole', 'regenerator']) expect(poiShape(k), k).toBe('square')
  })
})
