// 真人的移動命令找不到路（例如門控制器故障把門鎖住）：放棄命令，並私訊本人「找不到路」，4 秒內不重複
import { describe, expect, it } from 'vitest'
import { Harness, type FakeClient } from './helpers/harness'
import { doorPassFor } from '../../src/sim/systems/movement'
import { hasString } from '../../src/ui/i18n'
import '../../src/ui/strings/sim6'

const lines = (c: FakeClient) => c.inbox.flatMap((m) => (m.t === 'chat' ? m.lines.map((l) => l.text) : []))
const noPath = (c: FakeClient) => lines(c).filter((t) => t.includes('move.noPath')).length
const SEC = 20

describe('移動命令找不到路', () => {
  it('所有門都鎖住時往別的房間走：放棄命令、只有本人收到提示，4 秒內不重複', () => {
    const { h, cs } = Harness.started(2, 4242, { eventMult: 0, npcCrew: 0, bots: 0 })
    const g = h.server.game!
    const [p, q] = g.allPlayers()
    const u = g.mainOf(p)!
    const z = g.world.zones[u.zone]
    for (const d of z.doors) d.locked = true
    h.ticks(SEC)
    // 門兩側各取一點：鎖門後至少有一側和自己不連通
    const pass = doorPassFor(g, u, z)
    const pts = z.layout!.doors.flatMap((d) => [
      [d.x + 2, d.y],
      [d.x - 2, d.y],
      [d.x, d.y + 2],
      [d.x, d.y - 2],
    ])
    const goal = pts
      .map(([x, y]) => z.nav!.nearestOpen(x, y, pass))
      .find((n) => n && !z.nav!.findPath(u.x, u.y, n.x, n.y, u.radius, pass))!
    expect(goal).toBeTruthy()
    const counts = () => [noPath(cs[0]), noPath(cs[1])]
    const pc = cs.findIndex((c) => c.slot === p.slot)
    const qc = cs.findIndex((c) => c.slot === q.slot)
    for (const c of cs) c.inbox.length = 0
    g.handleCommand(p.slot, { k: 'move', x: goal.x, y: goal.y })
    h.ticks(SEC)
    expect(u.order?.k).not.toBe('move')
    expect(noPath(cs[pc])).toBe(1)
    expect(noPath(cs[qc])).toBe(0)
    // 4 秒內再點一次：照樣放棄，但不再提示
    g.handleCommand(p.slot, { k: 'move', x: goal.x, y: goal.y })
    h.ticks(SEC)
    expect(noPath(cs[pc])).toBe(1)
    h.ticks(4 * SEC)
    g.handleCommand(p.slot, { k: 'move', x: goal.x, y: goal.y })
    h.ticks(SEC)
    expect(noPath(cs[pc])).toBe(2)
    expect(counts()[qc]).toBe(0)
  })

  it('門沒鎖時照常走過去，不提示', () => {
    const { h, cs } = Harness.started(2, 4242, { eventMult: 0, npcCrew: 0, bots: 0 })
    const g = h.server.game!
    const p = g.allPlayers()[0]
    const u = g.mainOf(p)!
    const z = g.world.zones[u.zone]
    const d = z.layout!.doors[0]
    for (const c of cs) c.inbox.length = 0
    g.handleCommand(p.slot, { k: 'move', x: d.x + 2, y: d.y })
    h.ticks(SEC)
    expect(cs.reduce((n, c) => n + noPath(c), 0)).toBe(0)
  })

  it('字串 zh／en 都有', () => {
    expect(hasString('zh', 'move.noPath')).toBe(true)
    expect(hasString('en', 'move.noPath')).toBe(true)
  })
})
