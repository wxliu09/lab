// 調查筆記與死者：死者／旁觀者看得到全場，筆記只能分享給其他死者；自己的筆記照樣可以編輯
import { describe, expect, it } from 'vitest'
import { Harness } from './helpers/harness'
import { damage } from '../../src/sim/systems/damage'
import { LAST_WORDS } from '../../src/sim/systems/chat'
import type { Game, GamePlayer } from '../../src/sim/game'

function kill(h: Harness, g: Game, p: GamePlayer): void {
  const u = g.mainOf(p)!
  u.inv?.fill(null)
  u.suit = null
  u.statsDirty = true
  h.ticks(2)
  damage(g, null, u, 1e6, { pure: true })
  h.ticks(Math.ceil((LAST_WORDS + 1) * 20))
  expect(p.alive).toBe(false)
}

function setup(n = 4) {
  const { h, cs } = Harness.started(n, 4242, { eventMult: 0 })
  const g = h.server.game!
  const ps = g.allPlayers()
  for (const p of ps) g.setRole(p, 'human')
  return { h, cs, g, ps }
}

const shared = (p: GamePlayer, from: number) => [...p.notes.values()].filter((n) => n.from === from)

describe('死者的調查筆記', () => {
  it('死者不能把筆記分享給活人（server 擋下，活人什麼都沒收到）', () => {
    const { h, cs, g, ps } = setup()
    kill(h, g, ps[1])
    cs[1].send({ t: 'note', target: ps[2].slot, mark: 'confirmedEvil', text: 'saw him transform' })
    h.ticks(1)
    for (const r of h.raw.values()) r.length = 0
    cs[1].send({ t: 'shareNotes', to: ps[0].slot })
    h.ticks(2)
    expect(shared(ps[0], ps[1].slot)).toEqual([])
    const lines = cs[0].inbox.filter((m) => m.t === 'chat').flatMap((m) => (m as { lines: { text: string }[] }).lines.map((l) => l.text))
    expect(lines.some((t) => t.startsWith('@sys.notesShared'))).toBe(false)
  })

  it('死者之間可以分享；死者仍然可以編輯自己的筆記', () => {
    const { h, cs, g, ps } = setup()
    kill(h, g, ps[1])
    kill(h, g, ps[3])
    cs[1].send({ t: 'note', target: ps[2].slot, mark: 'suspect', text: 'first' })
    h.ticks(1)
    cs[1].send({ t: 'note', target: ps[2].slot, mark: 'confirmedEvil', text: 'edited after death' })
    h.ticks(1)
    expect(ps[1].notes.get(ps[2].slot)).toMatchObject({ mark: 'confirmedEvil', text: 'edited after death' })
    cs[1].send({ t: 'shareNotes', to: ps[3].slot })
    h.ticks(2)
    expect(shared(ps[3], ps[1].slot)).toEqual([expect.objectContaining({ slot: ps[2].slot, mark: 'confirmedEvil', text: 'edited after death' })])
  })

  it('活人分享給死者照常可以；旁觀的主機不能分享給活人', () => {
    const { h, cs } = Harness.started(4, 4242, { eventMult: 0, hostSpectate: true })
    const g = h.server.game!
    const ps = g.allPlayers()
    const host = ps.find((p) => p.spectator)!
    const living = ps.filter((p) => !p.spectator)
    expect(host).toBeTruthy()
    for (const p of living) g.setRole(p, 'human')
    // 旁觀者 → 活人：擋下
    const hc = cs.find((c) => c.slot === host.slot)!
    hc.send({ t: 'note', target: living[0].slot, mark: 'trust', text: 'spectator intel' })
    h.ticks(1)
    hc.send({ t: 'shareNotes', to: living[1].slot })
    h.ticks(1)
    expect(shared(living[1], host.slot)).toEqual([])
    // 活人 → 死者：照常
    kill(h, g, living[2])
    const lc = cs.find((c) => c.slot === living[0].slot)!
    lc.send({ t: 'note', target: living[1].slot, mark: 'suspect', text: 'shifty' })
    h.ticks(1)
    lc.send({ t: 'shareNotes', to: living[2].slot })
    h.ticks(1)
    expect(shared(living[2], living[0].slot).length).toBe(1)
  })
})
