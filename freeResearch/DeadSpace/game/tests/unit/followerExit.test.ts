// 跟著主人上船的召喚物，主人下船時也跟著下（不會被留在船艙、跟著船被載走）
import { describe, expect, it } from 'vitest'
import { Harness } from './helpers/harness'
import { spaceOf } from '../../src/sim/systems/space'
import { spawnMinion } from '../../src/sim/scripts/mutant'
import type { Game } from '../../src/sim/game'

function zone(g: Game, key: string) {
  return g.world.zones.find((z) => z.key === key)!
}

describe('召喚物跟著主人上下船', () => {
  it('主人走到艙門下船，跟隨的召喚物一起回到站內', () => {
    const { h, cs } = Harness.started(2, 12, { eventMult: 0 })
    const g = h.server.game!
    const p = g.players[cs[0].slot]
    const u = g.mainOf(p)!
    const nyx = zone(g, 'nyx')
    const inst = [...spaceOf(g).ships.values()].find((s) => s.def.id === 'mule' && s.docked?.zone === nyx.id)!
    const de = g.world.get(inst.dockedEnt)!
    g.world.relocate(u, nyx.id, de.x, de.y - de.radius - 1.2)
    g.setRole(p, 'mutant')
    const pet = spawnMinion(g, u, 'mut.spiderling', u.x + 1, u.y, 'guard')!
    pet.order = { k: 'follow', e: u.id, s: 1.5 }
    h.ticks(2)
    g.handleCommand(p.slot, { k: 'interact', e: de.id })
    for (let i = 0; i < 100 && u.zone !== inst.zone; i++) h.ticks(1)
    expect(u.zone).toBe(inst.zone)
    expect(pet.zone).toBe(inst.zone)
    const exit = g.world.zones[inst.zone].layout!.exits[0]
    g.handleCommand(p.slot, { k: 'move', x: exit.x, y: exit.y })
    for (let i = 0; i < 240 && u.zone !== nyx.id; i++) h.ticks(1)
    h.ticks(20)
    expect(u.zone).toBe(nyx.id)
    expect(pet.zone).toBe(nyx.id)
  })
})
