// -status 只依已公告的死亡回答：本局不存在、或還沒公告死亡的異類一律當作還活著（3–4 人局不能藉此問出是哪一種）
import { describe, expect, it } from 'vitest'
import { Harness, type FakeClient } from './helpers/harness'
import { damage } from '../../src/sim/systems/damage'
import type { Game, GamePlayer } from '../../src/sim/game'

function status(h: Harness, c: FakeClient): string | undefined {
  c.inbox.length = 0
  c.send({ t: 'chat', ch: 'all', text: '-status' })
  h.ticks(2)
  return c.inbox
    .filter((m) => m.t === 'chat')
    .flatMap((m) => (m as { lines: { text: string }[] }).lines.map((l) => l.text))
    .find((t) => t.startsWith('@chat.status'))
}

function killMain(h: Harness, g: Game, p: GamePlayer): void {
  const u = g.mainOf(p)!
  u.inv?.fill(null)
  u.suit = null
  u.data.god = false
  u.statsDirty = true
  h.ticks(1)
  damage(g, null, u, 1e7, { pure: true })
  h.ticks(2)
}

describe('-status', () => {
  it('3 人局：不論本局是異形還是變種人，開局時都回答「都還活著」', () => {
    const kinds = new Set<string>()
    for (const seed of [1, 2, 3, 4, 5, 6, 7, 8]) {
      const { h, cs } = Harness.started(3, seed, { eventMult: 0 })
      const g = h.server.game!
      const evil = g.allPlayers().find((p) => p.role === 'xeno' || p.role === 'mutant')!
      kinds.add(evil.role)
      const crew = g.allPlayers().find((p) => p !== evil)!
      expect(status(h, cs.find((c) => c.slot === crew.slot)!)).toBe('@chat.status.bothAlive')
    }
    // 這組種子同時涵蓋兩種異類，上面的斷言才有意義
    expect(kinds).toEqual(new Set(['xeno', 'mutant']))
  })

  it('公告過異形死亡才說異形死了；不存在的變種人仍當作活著', () => {
    const { h, cs } = Harness.started(3, 4242, { eventMult: 0 })
    const g = h.server.game!
    const ps = g.allPlayers()
    for (const p of ps) g.setRole(p, 'human')
    g.setRole(ps[2], 'xeno')
    expect(status(h, cs[0])).toBe('@chat.status.bothAlive')
    killMain(h, g, ps[2])
    expect(ps[2].alive).toBe(false)
    expect(status(h, cs[0])).toBe('@chat.status.xenoDead')
  })

  it('公告過變種人死亡 → 只說變種人死了', () => {
    const { h, cs } = Harness.started(3, 4242, { eventMult: 0 })
    const g = h.server.game!
    const ps = g.allPlayers()
    for (const p of ps) g.setRole(p, 'human')
    g.setRole(ps[1], 'mutant')
    killMain(h, g, ps[1])
    expect(status(h, cs[0])).toBe('@chat.status.mutantDead')
  })

  it('主腦沒有公開死亡（被轉化成另一方的 spawn）→ 仍回答都還活著', () => {
    const { h, cs } = Harness.started(5, 4242, { eventMult: 0 })
    const g = h.server.game!
    const x = g.allPlayers().find((p) => p.role === 'xeno' && !p.spawnOf)!
    const u = g.mainOf(x)!
    g.convertToSpawn(x.slot, 'mutant', { zone: u.zone, x: u.x, y: u.y }, 0.5)
    h.ticks(2)
    expect(x.spawnOf).toBe('mutant')
    const crew = g.allPlayers().find((p) => g.faction(p) === 'crew')!
    expect(status(h, cs.find((c) => c.slot === crew.slot)!)).toBe('@chat.status.bothAlive')
  })
})
