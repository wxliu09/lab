// 逃生艙：乘客本體藏在艙內（太空層上只看得到艙，本人除外）；艙內、駕駛中都不能開始進化
import { describe, expect, it } from 'vitest'
import { Harness } from './helpers/harness'
import { checkMessages } from './helpers/leak'
import { INSTANT_ITEMS } from '../../src/sim/systems/vendors'
import { spaceOf } from '../../src/sim/systems/space'
import { computeVision } from '../../src/sim/systems/vision'
import { SPACE_ZONE } from '../../src/sim/world'
import type { Ent } from '../../src/sim/ent'
import type { Game, GamePlayer } from '../../src/sim/game'

function launch(h: Harness, g: Game, p: GamePlayer): Ent {
  const u = g.mainOf(p)!
  expect(INSTANT_ITEMS.get('escapePass')!(g, u, u as never)).toBe(true)
  h.ticks(20 * 5)
  expect(u.zone).toBe(SPACE_ZONE)
  const podId = [...spaceOf(g).pods.entries()].find(([, v]) => v.slot === p.slot)![0]
  return g.world.get(podId)!
}

function leaks(h: Harness): string[] {
  const g = h.server.game!
  const out: string[] = []
  for (const [peer, raws] of h.raw) {
    const slot = h.server.slotOfPeer(peer)
    if (slot !== null) out.push(...checkMessages(g, slot, raws))
    raws.length = 0
  }
  return out
}

describe('逃生艙', () => {
  it('別人在太空層只看得到艙，看不到艙裡的人；本人看得到自己', () => {
    const { h, cs } = Harness.started(5, 31, { eventMult: 0 })
    const g = h.server.game!
    const ps = g.allPlayers()
    const p = ps[1]
    const u = g.mainOf(p)!
    const pod = launch(h, g, p)
    const vis = computeVision(g)
    for (const q of ps) {
      if (q === p) continue
      expect(vis.get(q.slot)!.ents.has(u)).toBe(false)
      expect(vis.get(q.slot)!.ents.has(pod)).toBe(true)
      expect(cs.find((c) => c.slot === q.slot)!.ents.has(u.id)).toBe(false)
    }
    expect(vis.get(p.slot)!.ents.has(u)).toBe(true)
    // 艙飛走時本體跟著艙（同步在太空系統裡做，最多落後一個 tick 的位移）
    const start = { x: pod.x, y: pod.y }
    const target = g.world.zones.find((z) => z.alive && z.station && !z.data.ship && z.station.id !== 'hulk7' && z.key !== 'nyx')!
    spaceOf(g).pods.get(pod.id)!.target = target.id
    h.ticks(20 * 3)
    expect(Math.hypot(pod.x - start.x, pod.y - start.y)).toBeGreaterThan(1)
    expect(Math.hypot(u.x - pod.x, u.y - pod.y)).toBeLessThan(0.5)
    for (const q of ps) if (q !== p) expect(cs.find((c) => c.slot === q.slot)!.ents.has(u.id)).toBe(false)
    expect(leaks(h)).toEqual([])
  })

  it('死去的旁觀者看太空層也看不到艙裡的人（只看得到艙）', () => {
    const { h } = Harness.started(5, 31, { eventMult: 0 })
    const g = h.server.game!
    const ps = g.allPlayers()
    const u = g.mainOf(ps[1])!
    launch(h, g, ps[1])
    ps[3].alive = false
    ps[3].specZone = SPACE_ZONE
    expect(computeVision(g).get(ps[3].slot)!.ents.has(u)).toBe(false)
  })

  it('變種人在逃生艙裡不能進化（選項為空、指令無效）；落地後恢復', () => {
    const { h, cs } = Harness.started(5, 31, { eventMult: 0 })
    const g = h.server.game!
    const m = g.allPlayers().find((q) => q.role === 'mutant')!
    m.ep = 5000
    const before = g.evolveOptions(m)
    expect(before.length).toBeGreaterThan(0)
    const u = g.mainOf(m)!
    const pod = launch(h, g, m)
    expect(g.evolveOptions(m)).toEqual([])
    const c = cs.find((x) => x.slot === m.slot)!
    c.send({ t: 'cmd', seq: 9, c: { k: 'evolve', a: before[0] } })
    h.ticks(5)
    expect(g.mainOf(m)).toBe(u)
    expect(m.evolvingUntil).toBe(0)
    // 落地
    const target = g.world.zones.find((z) => z.alive && z.station && !z.data.ship && z.key === 'nyx')!
    spaceOf(g).pods.get(pod.id)!.target = target.id
    for (let i = 0; i < 20 * 120 && u.data.inPod; i++) h.ticks(1)
    expect(u.data.inPod).toBeUndefined()
    expect(g.evolveOptions(m)).toEqual(before)
  })

  it('駕駛中（操控的不是主單位）不能開始進化', () => {
    const { h, cs } = Harness.started(5, 31, { eventMult: 0 })
    const g = h.server.game!
    const m = g.allPlayers().find((q) => q.role === 'mutant')!
    m.ep = 5000
    const u = g.mainOf(m)!
    const nz = g.world.zones.find((z) => z.key === 'nyx')!
    const con = [...g.world.inZone(nz.id)].find((e) => e.data.poi === 'console')!
    g.world.relocate(u, con.zone, con.x, con.y - 0.6)
    h.ticks(3)
    expect(m.control).toBe(nz.spaceEnt)
    expect(g.evolveOptions(m)).toEqual([])
    cs.find((x) => x.slot === m.slot)!.send({ t: 'cmd', seq: 3, c: { k: 'evolve', a: 'mut.apex' } })
    h.ticks(3)
    expect(g.mainOf(m)).toBe(u)
    expect(m.evolvingUntil).toBe(0)
  })
})
