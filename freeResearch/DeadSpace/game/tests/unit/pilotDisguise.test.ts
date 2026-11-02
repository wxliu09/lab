// 駕駛與偽裝：化身者駕駛站點／無人機時，載具外觀要和「被化身者在駕駛」一樣；交還中立後不留上一位駕駛的顏色
import { describe, expect, it } from 'vitest'
import { Harness } from './helpers/harness'
import { XAB } from '../../src/shared/content/forms/xeno'
import { morph } from '../../src/sim/systems/items'
import { entView } from '../../src/sim/systems/snapshot'
import { installXenoSystems } from '../../src/sim/scripts/xeno'
import type { Game } from '../../src/sim/game'
import type { Ent } from '../../src/sim/ent'

function nyx(g: Game) {
  return g.world.zones.find((z) => z.key === 'nyx')!
}

function sec(h: Harness, s: number) {
  h.ticks(Math.round(s * 20))
}

function standAt(g: Game, u: Ent, zid: number, x: number, y: number): void {
  const z = g.world.zones[zid]
  const n = z.nav ? (z.nav.nearestOpen(x, y) ?? { x, y }) : { x, y }
  g.world.relocate(u, zid, n.x, n.y)
  u.order = null
  u.queue.length = 0
  u.path = null
}

describe('駕駛與偽裝', () => {
  it('化身成某人的異形駕駛站點時，其他人看到的站點和那個人真的在駕駛時一樣', () => {
    const { h } = Harness.started(3, 4242, { eventMult: 0 })
    const g = h.server.game!
    const ps = g.allPlayers()
    g.setRole(ps[0], 'xeno')
    g.setRole(ps[1], 'human')
    g.setRole(ps[2], 'human')
    installXenoSystems(g)
    const z = nyx(g)
    const con = [...g.world.inZone(z.id)].find((e) => e.data.poi === 'console')!
    const st = g.world.get(z.spaceEnt)!
    // (1) 真人 ps[1] 駕駛
    const bob = g.mainOf(ps[1])!
    standAt(g, bob, z.id, con.x, con.y - 0.6)
    h.ticks(3)
    expect(ps[1].control).toBe(st.id)
    const real = entView(g, ps[2], st)
    standAt(g, bob, z.id, con.x, con.y - 6)
    h.ticks(3)
    expect(ps[1].control).toBe(bob.id)
    // (2) 異形化身成 ps[1] 後駕駛
    const x = g.mainOf(ps[0])!
    morph(g, x, 'xeno.mimic')
    x.anon = true
    standAt(g, x, bob.zone, bob.x + 1.5, bob.y)
    x.mp = x.maxMp
    x.order = { k: 'cast', a: XAB.masks, e: bob.id }
    sec(h, 0.8)
    expect((x.data.fake as { owner: number }).owner).toBe(ps[1].slot)
    // 其他人眼中是 bob
    expect(entView(g, ps[2], x).o).toBe(ps[1].slot)
    standAt(g, bob, z.id, con.x, con.y - 8)
    standAt(g, x, z.id, con.x, con.y - 0.6)
    h.ticks(3)
    expect(ps[0].control).toBe(st.id)
    const fake = entView(g, ps[2], st)
    // 與真人駕駛時一樣（顯示 bob），不會變成匿名
    expect(fake.o).toBe(real.o)
    expect(fake.c).toBe(real.c)
  })

  it('站點交還中立後不留上一位駕駛者的顏色', () => {
    const { h } = Harness.started(2, 4242, { eventMult: 0 })
    const g = h.server.game!
    const ps = g.allPlayers()
    for (const p of ps) g.setRole(p, 'human')
    const z = nyx(g)
    const con = [...g.world.inZone(z.id)].find((e) => e.data.poi === 'console')!
    const st = g.world.get(z.spaceEnt)!
    const u = g.mainOf(ps[1])!
    const c0 = entView(g, ps[0], st).c
    standAt(g, u, z.id, con.x, con.y - 0.6)
    h.ticks(3)
    g.handleCommand(ps[1].slot, { k: 'unpilot' })
    h.ticks(3)
    const v = entView(g, ps[0], st)
    expect(v.o).toBe(-1)
    expect(v.c).toBe(c0)
  })
})

describe('偽裝與防禦無人機', () => {
  it('化身者操控無人機時，無人機外觀和被化身者操控時一樣', () => {
    const { h } = Harness.started(3, 4242, { eventMult: 0 })
    const g = h.server.game!
    const ps = g.allPlayers()
    g.setRole(ps[0], 'xeno')
    g.setRole(ps[1], 'human')
    g.setRole(ps[2], 'human')
    installXenoSystems(g)
    const z = nyx(g)
    const ring = [...g.world.inZone(z.id)].find((e) => e.def.id === 'struct.droneControl')!
    const drone = g.world.get(ring.data.drone as number)!
    const bob = g.mainOf(ps[1])!
    standAt(g, bob, z.id, ring.x, ring.y)
    h.ticks(3)
    expect(ps[1].control).toBe(drone.id)
    const real = entView(g, ps[2], drone)
    standAt(g, bob, z.id, ring.x, ring.y - 6)
    h.ticks(3)
    const x = g.mainOf(ps[0])!
    morph(g, x, 'xeno.mimic')
    x.anon = true
    standAt(g, x, bob.zone, bob.x + 1.5, bob.y)
    x.mp = x.maxMp
    x.order = { k: 'cast', a: XAB.masks, e: bob.id }
    sec(h, 0.8)
    expect((x.data.fake as { owner: number }).owner).toBe(ps[1].slot)
    standAt(g, bob, z.id, ring.x, ring.y - 9)
    standAt(g, x, z.id, ring.x, ring.y)
    h.ticks(3)
    expect(ps[0].control).toBe(drone.id)
    const fake = entView(g, ps[2], drone)
    expect(fake.o).toBe(real.o)
  })
})
