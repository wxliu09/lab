// 站上控制台後按 B（unpilot）再走開，一定離得開（交還鎖和接手用同一個距離標準）；AI 驗血報告只公布一次
import { describe, expect, it } from 'vitest'
import { Harness } from './helpers/harness'
import { makeItem } from '../../src/sim/systems/items'

describe('離開控制台', () => {
  for (const dir of [
    [1, 0],
    [0, -1],
    [-1, 0],
    [0.7, 0.7],
  ]) {
    it(`走到女帝號控制台正中央、按 B、往 (${dir}) 走開：不再駕駛`, () => {
      const { h, cs } = Harness.started(2, 3, { eventMult: 0, npcCrew: 0, bots: 0 })
      const g = h.server.game!
      const p = g.players[cs[0].slot]
      const u = g.mainOf(p)!
      const z = g.world.zones.find((q) => q.key === 'nyx')!
      const con = [...g.world.inZone(z.id)].find((e) => e.data.poi === 'console')!
      const st = g.world.get(z.spaceEnt)!
      const n = z.nav!.nearestOpen(con.x + 4, con.y)!
      g.world.relocate(u, z.id, n.x, n.y)
      h.ticks(2)
      g.handleCommand(p.slot, { k: 'move', x: con.x, y: con.y })
      for (let i = 0; i < 200 && p.control !== st.id; i++) h.ticks(1)
      expect(p.control).toBe(st.id)
      h.ticks(10)
      g.handleCommand(p.slot, { k: 'unpilot' })
      g.handleCommand(p.slot, { k: 'move', x: con.x + dir[0] * 6, y: con.y + dir[1] * 6 })
      h.ticks(60)
      expect(p.control).toBe(u.id)
      expect(Math.hypot(u.x - con.x, u.y - con.y)).toBeGreaterThan(2)
    })
  }
})

describe('AI 驗血公告', () => {
  it('同一份報告只公布一次（解析器補貨不會一直重買、重講）', () => {
    const { h, cs } = Harness.started(1, 77, { bots: 4, eventMult: 0, npcCrew: 0 })
    const g = h.server.game!
    const bot = g.allPlayers().find((q) => q.bot && g.faction(q) === 'crew' && q.role === 'human')!
    const others = g.allPlayers().filter((q) => q !== bot)
    const u = g.mainOf(bot)!
    const r = makeItem('gitResolver')
    r.data = {
      sample: {
        slots: [others[0].slot, others[1].slot, bot.slot],
        keys: ['p' + others[0].slot, 'p' + others[1].slot, 'p' + bot.slot],
        names: [others[0].name, others[1].name, bot.name],
        r: 2,
      },
    }
    u.inv![u.inv!.findIndex((x) => !x)] = r
    u.data.speedMult = 0.01
    u.statsDirty = true
    let said = 0
    for (let i = 0; i < 20 * 180; i++) {
      h.ticks(1)
      for (const m of cs[0].inbox) if (m.t === 'chat') for (const l of m.lines) if (l.from === bot.name && l.ch === 'all' && l.text.includes('gitInfected')) said++
      cs[0].inbox.length = 0
      for (const rr of h.raw.values()) rr.length = 0
      for (const c of h.clients.values()) c.snaps.length = 0
    }
    expect(bot.gitReports.length).toBeGreaterThanOrEqual(1)
    expect(said).toBe(1)
  })
})
