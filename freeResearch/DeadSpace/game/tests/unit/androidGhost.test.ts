// 等待記憶核心復活的仿生人：聽不到死者頻道、收不到死者分享的筆記（否則復活後把死者的全知情報帶回活人方）；
// 核心被毀後改走一般死亡流程（可觀戰；死亡即退出模式下出局）
import { describe, expect, it } from 'vitest'
import { Harness } from './helpers/harness'
import { damage } from '../../src/sim/systems/damage'
import { LAST_WORDS, canStillRevive } from '../../src/sim/systems/chat'
import { destroyInterior } from '../../src/sim/systems/space'

function texts(c: { inbox: any[] }): string[] {
  return c.inbox.filter((m) => m.t === 'chat').flatMap((m) => m.lines.map((l: any) => `${l.ch}:${l.from}:${l.text}`))
}

describe('等待復活的仿生人與死者情報', () => {
  it('死者頻道與死者分享的筆記不會送到等待復活的仿生人', () => {
    const { h, cs } = Harness.started(4, 4242, { eventMult: 0 })
    const g = h.server.game!
    const ps = g.allPlayers()
    for (const p of ps) g.setRole(p, 'human')
    g.setRole(ps[1], 'android')
    g.setRole(ps[3], 'xeno')
    for (const p of [ps[1], ps[2]]) {
      const u = g.mainOf(p)!
      u.inv?.fill(null)
      u.suit = null
      u.statsDirty = true
    }
    h.ticks(2)
    damage(g, null, g.mainOf(ps[1])!, 1e7, { pure: true })
    damage(g, null, g.mainOf(ps[2])!, 1e7, { pure: true })
    h.ticks(Math.ceil((LAST_WORDS + 1) * 20))
    expect(ps[1].data.coreOnly).toBe(true)
    for (const c of cs) c.inbox.length = 0
    cs[2].send({ t: 'chat', ch: 'dead', text: 'ps3 is the xeno' })
    cs[2].send({ t: 'note', target: ps[3].slot, mark: 'confirmedEvil', text: 'ghost saw transform' })
    cs[2].send({ t: 'shareNotes', to: ps[1].slot })
    h.ticks(3)
    expect(texts(cs[1]).some((t) => t.includes('ps3 is the xeno'))).toBe(false)
    expect(((cs[1].me.notes as any[]) ?? []).some((n) => n.from === ps[2].slot)).toBe(false)
    // 其他死者照樣聽得到（對照組）：讓 ps[0] 也死，再說一次
    damage(g, null, g.mainOf(ps[0])!, 1e7, { pure: true })
    h.ticks(Math.ceil((LAST_WORDS + 1) * 20))
    for (const c of cs) c.inbox.length = 0
    cs[2].send({ t: 'chat', ch: 'dead', text: 'second line' })
    h.ticks(3)
    expect(texts(cs[0]).some((t) => t.includes('second line'))).toBe(true)
    expect(texts(cs[1]).some((t) => t.includes('second line'))).toBe(false)
  })
})

describe('記憶核心被毀', () => {
  for (const boot of [true, false]) {
    it(`核心跟著站一起被毀後改走一般死亡流程（死亡即退出=${boot}）`, () => {
      const { h, cs } = Harness.started(4, 4242, { eventMult: 0 })
      const g = h.server.game!
      const ps = g.allPlayers()
      for (const p of ps) g.setRole(p, 'human')
      g.setRole(ps[1], 'android')
      g.settings.bootOnDeath = boot
      const a = ps[1]
      const au = g.mainOf(a)!
      au.inv?.fill(null)
      au.suit = null
      au.statsDirty = true
      h.ticks(2)
      const z = g.world.zones.find((q) => q.alive && q.layout && q.station && !q.data.ship && q.key !== 'nyx')!
      const n = z.nav!.nearestOpen(z.layout!.spawns[0].x, z.layout!.spawns[0].y)!
      g.world.relocate(au, z.id, n.x, n.y)
      h.ticks(2)
      damage(g, null, au, 1e6, { pure: true })
      h.ticks(Math.ceil((LAST_WORDS + 1) * 20))
      expect(a.data.coreOnly).toBe(true)
      destroyInterior(g, z.id, null)
      h.ticks(40)
      expect(canStillRevive(a)).toBe(false)
      const ac = cs.find((c) => c.slot === a.slot)!
      expect(texts(ac).length + ac.inbox.length).toBeGreaterThan(0)
      const other = g.world.zones.find((q) => q.alive && q.layout && q.id !== z.id)!
      ac.send({ t: 'cmd', seq: 9, c: { k: 'spec', s: other.id } as never })
      h.ticks(5)
      if (boot) expect(!!a.data.booted).toBe(true)
      else {
        expect(a.specZone).toBe(other.id)
        expect([...a.view.visible].filter((id) => (g.world.get(id)?.zone ?? 0) !== 0).length).toBeGreaterThan(0)
      }
    })
  }

  it('核心被撿走、帶著的人死掉後掉出來：仍然找得到，不算被毀', () => {
    const { h } = Harness.started(4, 4242, { eventMult: 0 })
    const g = h.server.game!
    const ps = g.allPlayers()
    for (const p of ps) g.setRole(p, 'human')
    g.setRole(ps[1], 'android')
    const au = g.mainOf(ps[1])!
    au.inv?.fill(null)
    au.suit = null
    au.statsDirty = true
    h.ticks(2)
    damage(g, null, au, 1e7, { pure: true })
    h.ticks(Math.ceil((LAST_WORDS + 1) * 20))
    const coreEnt = g.world.get(ps[1].data.core as number)!
    const item = coreEnt.data.item
    // ps[0] 撿起核心
    const carrier = g.mainOf(ps[0])!
    const slot = carrier.inv!.findIndex((x) => !x)
    carrier.inv![slot] = item as never
    g.world.remove(coreEnt)
    h.ticks(5)
    expect(ps[1].data.coreOnly).toBe(true)
    // 帶著的人死掉：核心掉在地上，是新的地面物件
    damage(g, null, carrier, 1e7, { pure: true })
    h.ticks(10)
    expect(ps[1].data.coreOnly).toBe(true)
    expect(canStillRevive(ps[1])).toBe(true)
  })
})
