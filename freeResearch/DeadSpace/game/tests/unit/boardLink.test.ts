// 強行登艦：連結建立時兩艘船艙裡的人都收到「怎麼過去」的提示；駕駛者按 B 離開控制台、走到艙門就進入對方船艙；連結到期也會通知
import { describe, expect, it } from 'vitest'
import { Harness } from './helpers/harness'
import { spaceOf } from '../../src/sim/systems/space'
import { SPACE_ZONE } from '../../src/sim/world'

function privLines(c: { inbox: any[] }): string[] {
  return c.inbox.filter((m) => m.t === 'chat').flatMap((m) => m.lines.filter((l: any) => l.ch === 'private').map((l: any) => l.text))
}

describe('強行登艦', () => {
  it('連結 → 提示 → 離開控制台走到艙門 → 進入對方船艙；到期通知', () => {
    const { h, cs } = Harness.started(2, 7, { eventMult: 0 })
    const g = h.server.game!
    const [pa, pb] = [g.players[cs[0].slot]!, g.players[cs[1].slot]!]
    const kestrels = [...spaceOf(g).ships.values()].filter((s) => s.def.id === 'kestrel' && s.docked)
    const [ia, ib] = kestrels
    // 兩人各自站上一艘紅隼的控制台發射
    for (const [p, inst] of [
      [pa, ia],
      [pb, ib],
    ] as const) {
      const c = g.world.zones[inst.zone].data.console as { x: number; y: number }
      g.world.relocate(g.mainOf(p)!, inst.zone, c.x, c.y)
    }
    h.ticks(20 * 12)
    const sa = g.world.get(ia.spaceEnt)!
    const sb = g.world.get(ib.spaceEnt)!
    expect(sa.zone).toBe(SPACE_ZONE)
    expect(pa.control).toBe(sa.id)
    // 兩艘船靠近，A 對 B 施放強行登艦
    g.world.relocate(sb, SPACE_ZONE, sa.x + 1.5, sa.y)
    h.ticks(2)
    for (const c of cs) c.inbox.length = 0
    g.handleCommand(pa.slot, { k: 'cast', a: 'ship.board', e: sb.id })
    for (let i = 0; i < 20 * 6 && !ia.link; i++) h.ticks(1)
    expect(ia.link).toBe(ib.key)
    h.ticks(2)
    expect(privLines(cs[0]).some((t) => t.startsWith('@space.linked'))).toBe(true)
    expect(privLines(cs[1]).some((t) => t.startsWith('@space.linked'))).toBe(true)
    // A 按 B 離開控制台，走到艙門
    g.handleCommand(pa.slot, { k: 'unpilot' })
    h.ticks(2)
    const body = g.mainOf(pa)!
    expect(pa.control).toBe(body.id)
    const exit = g.world.zones[ia.zone].layout!.exits[0]
    g.handleCommand(pa.slot, { k: 'move', x: exit.x, y: exit.y })
    for (let i = 0; i < 20 * 10 && body.zone !== ib.zone; i++) h.ticks(1)
    expect(body.zone).toBe(ib.zone)
    // 到期：留在原本船艙的 B（駕駛中，主單位在自己的船艙）收到中斷通知
    for (const c of cs) c.inbox.length = 0
    h.ticks(20 * 22)
    expect(ib.link).toBe(null)
    expect(privLines(cs[1]).some((t) => t.startsWith('@space.linkEnd'))).toBe(true)
  })
})
