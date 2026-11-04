// 豪勇號降落在翠原星時，停在它上面的船不能發射（倒數中降落也取消）；升空後照常發射
import { describe, expect, it } from 'vitest'
import { Harness } from './helpers/harness'
import { spaceOf } from '../../src/sim/systems/space'
import { stationsOf } from '../../src/sim/systems/stations'

function priv(c: { inbox: any[] }): string[] {
  return c.inbox.filter((m) => m.t === 'chat').flatMap((m) => m.lines.filter((l: any) => l.ch === 'private').map((l: any) => l.text))
}

describe('豪勇號降落時的停泊船', () => {
  it('降落中不能發射、只提示一次；升空後照常發射', () => {
    const { h, cs } = Harness.started(1, 5, { eventMult: 0, bots: 0 })
    const g = h.server.game!
    const p = g.allPlayers()[0]
    const inst = [...spaceOf(g).ships.values()].find((s) => s.docked)!
    // 把這艘船停泊的站當成「降落中的豪勇號」（用真的豪勇號與翠原星實體，stepLanded 才不會當成已升空）
    const S = stationsOf(g)
    const bz = g.world.zones.find((q) => q.key === 'bravado')!
    const vz = g.world.zones.find((q) => q.key === 'verdance')!
    S.landed = { bravado: bz.spaceEnt, verdance: vz.spaceEnt, bravadoZone: inst.docked!.zone, verdanceZone: vz.id, launchAt: 0, abilities: [] } as never
    const c = g.world.zones[inst.zone].data.console as { x: number; y: number }
    g.world.relocate(g.mainOf(p)!, inst.zone, c.x, c.y)
    for (const x of cs) x.inbox.length = 0
    h.ticks(20 * 12)
    expect(inst.docked).not.toBe(null)
    expect(inst.launching).toBe(false)
    expect(priv(cs[0]).filter((t) => t.startsWith('@space.launchGrounded')).length).toBe(1)
    // 升空：照常倒數發射
    S.landed = null
    h.ticks(20 * 12)
    expect(inst.docked).toBe(null)
  })
})
