import { describe, expect, it } from 'vitest'
import { Harness } from './helpers/harness'
import { checkMessages } from './helpers/leak'
import { unitDef } from '../../src/shared/content/registry'

function scanAll(h: Harness): string[] {
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

describe('隱藏資訊洩漏', () => {
  it('一般開局：快照只含可見實體、沒有身分欄位', () => {
    const { h, cs } = Harness.started(8, 77)
    for (let t = 0; t < 200; t++) {
      if (t % 20 === 0) {
        for (const c of cs) {
          const u = c.ents.get(c.me.unit as number)
          if (u) c.send({ t: 'cmd', seq: t, c: { k: 'move', x: u.x! / 100 + (t % 40 ? 6 : -6), y: u.y! / 100 + 3 } })
        }
      }
      h.ticks(1)
      if (t % 10 === 0) expect(scanAll(h)).toEqual([])
    }
  })

  it('匿名單位不洩漏擁有者', () => {
    const { h, cs } = Harness.started(6, 5)
    const g = h.server.game!
    const xeno = g.allPlayers().find((p) => p.role === 'xeno')!
    const main = g.mainOf(xeno)!
    // 在所有人的主單位旁邊放一隻匿名單位
    for (const p of g.allPlayers()) {
      const m = g.mainOf(p)!
      const e = g.world.spawn(unitDef('personnel'), m.zone, m.x + 1, m.y, xeno.slot)
      e.anon = true
      e.name = main.name
      e.color = main.color
    }
    h.ticks(3)
    expect(scanAll(h)).toEqual([])
    for (const c of cs) {
      if (c.slot === xeno.slot) continue
      const anon = [...c.ents.values()].filter((e) => {
        const ent = g.world.ents.get(e.i)
        return ent?.anon
      })
      expect(anon.length).toBeGreaterThan(0)
      for (const a of anon) {
        expect(a.o).toBe(-1)
        expect(a.n).toBe('')
      }
    }
  })

  it('死者聊天不會送給活人', () => {
    const { h, cs } = Harness.started(4, 9)
    const g = h.server.game!
    const victim = g.players[cs[1].slot]
    g.kill(g.mainOf(victim)!, null)
    victim.alive = false
    victim.deadAt = g.time - 10
    cs[1].send({ t: 'chat', ch: 'all', text: '我是被誰殺的' })
    h.ticks(2)
    expect(scanAll(h)).toEqual([])
    const got = cs[2].inbox.filter((m) => m.t === 'chat').flatMap((m) => (m.t === 'chat' ? m.lines : []))
    expect(got.some((l) => l.text === '我是被誰殺的')).toBe(false)
  })
})
