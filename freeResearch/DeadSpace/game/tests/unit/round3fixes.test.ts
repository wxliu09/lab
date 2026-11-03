// 第 3 輪：賽後聊天全員互通；開局等待中斷線不再等他、快照帶等待人數；AI 不把匿名樣本標記當嫌疑人
import { describe, expect, it } from 'vitest'
import { Harness } from './helpers/harness'
import { damage } from '../../src/sim/systems/damage'
import { LAST_WORDS } from '../../src/sim/systems/chat'

function lines(c: { inbox: any[] }): { ch: string; text: string }[] {
  return c.inbox.filter((m) => m.t === 'chat').flatMap((m) => m.lines)
}

describe('第 3 輪修正', () => {
  it('賽後：死者與出局者的發言所有人都收得到', () => {
    const { h, cs } = Harness.started(3, 11, { eventMult: 0, bootOnDeath: true })
    const g = h.server.game!
    const ps = g.allPlayers()
    damage(g, null, g.mainOf(ps[1])!, 1e7, { pure: true })
    h.ticks(Math.ceil((LAST_WORDS + 1) * 20))
    expect(ps[1].alive).toBe(false)
    g.ended = { winner: 'draw', duration: 0, timeline: [], players: [] } as never
    for (const c of cs) c.inbox.length = 0
    cs[1].send({ t: 'chat', ch: 'all', text: 'gg from the dead' })
    h.ticks(2)
    for (const c of cs) expect(lines(c).some((l) => l.text === 'gg from the dead' && l.ch === 'all')).toBe(true)
  })

  it('開局等待：快照帶等待人數；等待中斷線的人不再被等', () => {
    const h = new Harness(4242)
    h.server.waitClients = true
    const cs = [h.connect('host', true), h.connect('p1'), h.connect('p2')]
    cs[0].send({ t: 'settings', s: { npcCrew: 0, eventMult: 0 } as never })
    cs[0].send({ t: 'start' })
    h.ticks(2)
    const g = h.server.game!
    expect(cs[0].snaps.some((s) => (s.w as { ld?: number } | undefined)?.ld === 3)).toBe(true)
    cs[0].send({ t: 'loaded' })
    cs[1].send({ t: 'loaded' })
    h.ticks(5)
    expect(g.time).toBe(0)
    h.server.onLeave(cs[2].peer)
    h.ticks(10)
    expect(g.time).toBeGreaterThan(0.2)
    expect(cs[0].snaps.some((s) => (s.w as { ld?: number } | undefined)?.ld === 0)).toBe(true)
  })
})
