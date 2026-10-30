import { describe, expect, it } from 'vitest'
import { Harness } from './helpers/harness'
import { checkMessages } from './helpers/leak'
import { spaceOf } from '../../src/sim/systems/space'
import { SPACE_ZONE } from '../../src/sim/world'
import type { Game } from '../../src/sim/game'

function scan(h: Harness): string[] {
  const g = h.server.game!
  const out: string[] = []
  for (const [peer, raws] of h.raw) {
    const slot = h.server.slotOfPeer(peer)
    if (slot === null) continue
    out.push(...checkMessages(g, slot, raws))
    raws.length = 0
  }
  return out
}

function nyx(g: Game) {
  return g.world.zones.find((z) => z.key === 'nyx')!
}

describe('太空層', () => {
  it('女帝號停機坪開局停著 4 艘紅隼與 2 艘騾級', () => {
    const { h } = Harness.started(3, 1)
    const g = h.server.game!
    const ships = [...spaceOf(g).ships.values()].filter((s) => s.docked?.zone === nyx(g).id)
    expect(ships.filter((s) => s.def.id === 'kestrel').length).toBe(4)
    expect(ships.filter((s) => s.def.id === 'mule').length).toBe(2)
  })

  it('走進停泊的船 → 站上控制台 10 秒發射 → 駕駛 → 停回女帝號', () => {
    const { h, cs } = Harness.started(3, 2)
    const g = h.server.game!
    const p = g.players[cs[0].slot]
    const u = g.mainOf(p)!
    const inst = [...spaceOf(g).ships.values()].find((s) => s.def.id === 'kestrel')!
    const de = g.world.get(inst.dockedEnt)!
    scan(h)
    g.world.relocate(u, de.zone, de.x, de.y - de.radius - 0.5)
    h.ticks(4)
    expect(u.zone).toBe(inst.zone)
    h.ticks(1)
    for (const r of h.raw.values()) r.length = 0
    h.ticks(1)
    expect(scan(h)).toEqual([])
    // 走到控制台
    const cz = g.world.zones[inst.zone]
    const c = cz.data.console as { x: number; y: number }
    g.world.relocate(u, inst.zone, c.x, c.y)
    for (let i = 0; i < 11; i++) {
      h.ticks(20)
      expect(scan(h)).toEqual([])
    }
    expect(inst.docked).toBe(null)
    const ship = g.world.get(inst.spaceEnt)!
    expect(ship.zone).toBe(SPACE_ZONE)
    h.ticks(4)
    expect(p.control).toBe(ship.id)
    expect(ship.owner).toBe(p.slot)
    // 下令移動
    const x0 = ship.x
    g.handleCommand(p.slot, { k: 'move', x: ship.x + 5, y: ship.y })
    h.ticks(40)
    expect(ship.x).toBeGreaterThan(x0 + 1)
    // 停回女帝號
    const st = g.world.get(nyx(g).spaceEnt)!
    g.world.relocate(ship, SPACE_ZONE, st.x + st.radius + 1, st.y)
    g.handleCommand(p.slot, { k: 'cast', a: 'ship.dock', e: st.id })
    h.ticks(10)
    expect(inst.docked?.zone).toBe(nyx(g).id)
    expect(p.control).toBe(p.main)
    for (const r of h.raw.values()) r.length = 0
    h.ticks(2)
    expect(scan(h)).toEqual([])
  })

  it('站點被摧毀：站內所有人死亡', () => {
    const { h } = Harness.started(4, 3)
    const g = h.server.game!
    h.ticks(20 * 11)
    const z = nyx(g)
    const inside = g.allPlayers().filter((p) => g.mainOf(p)?.zone === z.id)
    expect(inside.length).toBeGreaterThan(0)
    g.destroyStation!('nyx')
    h.ticks(20 * 6)
    for (const p of inside) expect(p.alive || !!p.spawnOf).toBe(false)
    expect(z.alive).toBe(false)
  })

  it('站點駕駛：站上主控台取得站體控制', () => {
    const { h, cs } = Harness.started(2, 4)
    const g = h.server.game!
    const p = g.players[cs[0].slot]
    const u = g.mainOf(p)!
    const con = [...g.world.inZone(nyx(g).id)].find((e) => e.data.poi === 'console')!
    g.world.relocate(u, con.zone, con.x, con.y - 0.6)
    h.ticks(3)
    expect(p.control).toBe(nyx(g).spaceEnt)
    g.world.relocate(u, con.zone, con.x, con.y - 4)
    h.ticks(3)
    expect(p.control).toBe(u.id)
  })
})
