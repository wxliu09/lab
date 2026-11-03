// 交還控制台（unpilot）：清掉載具進行中的施法；鎖記玩家 slot，變身換了主單位 id 也不會立刻被接回去
import { describe, expect, it } from 'vitest'
import { Harness } from './helpers/harness'
import { replaceMain } from '../../src/sim/systems/roleSystem'
import type { Ent } from '../../src/sim/ent'
import type { Game } from '../../src/sim/game'

function nyx(g: Game) {
  return g.world.zones.find((z) => z.key === 'nyx')!
}

function standAt(g: Game, u: Ent, zid: number, x: number, y: number): void {
  const z = g.world.zones[zid]
  const n = z.nav ? (z.nav.nearestOpen(x, y) ?? { x, y }) : { x, y }
  g.world.relocate(u, zid, n.x, n.y)
  u.order = null
  u.queue.length = 0
  u.path = null
}

function onConsole() {
  const { h, cs } = Harness.started(2, 4)
  const g = h.server.game!
  const p = g.players[cs[0].slot]
  const u = g.mainOf(p)!
  const con = [...g.world.inZone(nyx(g).id)].find((e) => e.data.poi === 'console')!
  g.world.relocate(u, con.zone, con.x, con.y - 0.6)
  h.ticks(3)
  const st = g.world.get(nyx(g).spaceEnt)!
  expect(p.control).toBe(st.id)
  return { h, g, p, u, con, st }
}

/** 讓載具開始一個 1 秒的施法（站內監控掃描）*/
function startCast(g: Game, st: Ent): void {
  st.cast = { ability: 'st.sweep', start: g.time, end: g.time + 1, x: st.x, y: st.y, e: 0, itemSlot: -1, channeling: false, nextTick: 0, ox: st.x, oy: st.y } as never
  st.anim = 3
}

describe('交還控制台', () => {
  it('unpilot 時載具進行中的施法一併取消（不會在交出去之後才放出來）', () => {
    const { h, g, p, st } = onConsole()
    startCast(g, st)
    g.handleCommand(p.slot, { k: 'unpilot' })
    h.ticks(1)
    expect(st.cast).toBeNull()
    h.ticks(20 * 2)
    expect(st.cds.get('st.sweep')).toBeUndefined()
  })

  it('對照：沒有交還時施法照常完成', () => {
    const { h, g, st } = onConsole()
    startCast(g, st)
    h.ticks(20 * 2)
    expect(st.cds.get('st.sweep')).toBeGreaterThan(0)
  })

  it('unpilot 後在控制台上變身（主單位換 id）：不會立刻被接回；走開再回來才會', () => {
    const { h, g, p, u, con, st } = onConsole()
    g.handleCommand(p.slot, { k: 'unpilot' })
    h.ticks(2)
    expect(p.control).toBe(u.id)
    const nu = replaceMain(g, p, u, 'personnel', { anon: false })
    expect(nu.id).not.toBe(u.id)
    h.ticks(10)
    expect(p.control).toBe(nu.id)
    expect(st.owner).toBe(-1)
    standAt(g, nu, con.zone, con.x, con.y - 4)
    h.ticks(3)
    g.world.relocate(nu, con.zone, con.x, con.y - 0.6)
    h.ticks(3)
    expect(p.control).toBe(st.id)
  })

  it('防禦無人機控制圈：unpilot 後變身也不會立刻重新連線', () => {
    const { h, cs } = Harness.started(3, 4242, { eventMult: 0 })
    const g = h.server.game!
    const nz = nyx(g)
    const ring = [...g.world.inZone(nz.id)].find((e) => e.def.id === 'struct.droneControl')!
    const drone = g.world.get(ring.data.drone as number)!
    const r = g.players[cs[1].slot]
    const u = g.mainOf(r)!
    g.world.relocate(u, nz.id, ring.x, ring.y)
    h.ticks(3)
    expect(r.control).toBe(drone.id)
    g.handleCommand(r.slot, { k: 'unpilot' })
    h.ticks(3)
    expect(r.control).toBe(u.id)
    const nu = replaceMain(g, r, u, 'personnel', { anon: false })
    h.ticks(10)
    expect(r.control).toBe(nu.id)
    expect(drone.owner).toBe(-1)
    standAt(g, nu, nz.id, ring.x, ring.y - 3)
    h.ticks(3)
    standAt(g, nu, nz.id, ring.x, ring.y)
    h.ticks(3)
    expect(r.control).toBe(drone.id)
  })
})
