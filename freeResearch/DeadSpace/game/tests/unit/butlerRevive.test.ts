// CEO 的管家：主人死亡就消失；主人活過來（仿生人重建、快速復活）補一隻；被轉化成眷屬的不補
import { describe, expect, it } from 'vitest'
import { Harness } from './helpers/harness'
import { damage } from '../../src/sim/systems/damage'

const butlersOf = (g: any, slot: number) => [...g.world.ents.values()].filter((b: any) => b.tags.has('butler') && b.data.butlerOf === slot)

describe('CEO 管家', () => {
  it('死亡時消失，復活後補生成', () => {
    const { h } = Harness.started(2, 21, { eventMult: 0, bots: 0 })
    const g = h.server.game!
    const p = g.allPlayers()[0]
    p.classId = 'ceo'
    p.data.butlerLost = true
    h.ticks(20)
    expect(butlersOf(g, p.slot).length).toBe(1)
    const u = g.mainOf(p)!
    const at = { zone: u.zone, x: u.x, y: u.y }
    damage(g, null, u, 1e7, { pure: true })
    h.ticks(20)
    expect(p.alive).toBe(false)
    expect(butlersOf(g, p.slot).length).toBe(0)
    g.revivePlayer(p.slot, at, 'personnel', 1)
    h.ticks(20)
    expect(p.alive).toBe(true)
    expect(butlersOf(g, p.slot).length).toBe(1)
    // 不會重複生成
    h.ticks(40)
    expect(butlersOf(g, p.slot).length).toBe(1)
  })

  it('被轉化成眷屬的 CEO 不補管家', () => {
    const { h } = Harness.started(2, 22, { eventMult: 0, bots: 0 })
    const g = h.server.game!
    const p = g.allPlayers()[0]
    p.classId = 'ceo'
    p.spawnOf = 'xeno'
    p.data.butlerLost = true
    h.ticks(30)
    expect(butlersOf(g, p.slot).length).toBe(0)
  })
})
