// 死亡即退出：出局的死者看不到任何東西、不能用死者頻道（遺言時間除外）、也收不到死者頻道
import { describe, expect, it } from 'vitest'
import { Harness } from './helpers/harness'
import { damage } from '../../src/sim/systems/damage'
import { routeChat, LAST_WORDS } from '../../src/sim/systems/chat'
import { computeVision } from '../../src/sim/systems/vision'

function setup(boot: boolean) {
  const { h } = Harness.started(3, 4242, { eventMult: 0 })
  const g = h.server.game!
  const ps = g.allPlayers()
  for (const p of ps) g.setRole(p, 'human')
  g.settings.bootOnDeath = boot
  for (const p of ps.slice(1)) {
    const u = g.mainOf(p)!
    u.inv?.fill(null)
    u.suit = null
    u.statsDirty = true
  }
  h.ticks(2)
  return { h, g, ps }
}

describe('死亡即退出', () => {
  it('出局後看不到任何實體；一般觀戰模式則看得到', () => {
    for (const boot of [true, false]) {
      const { h, g, ps } = setup(boot)
      damage(g, null, g.mainOf(ps[1])!, 1e6, { pure: true })
      // 出局在遺言時間結束後生效
      h.ticks(Math.ceil((LAST_WORDS + 1) * 20))
      expect(ps[1].alive).toBe(false)
      const vis = computeVision(g).get(ps[1].slot)!
      if (boot) {
        expect(vis.ents.size).toBe(0)
        expect(ps[1].view.visible.size).toBe(0)
      } else expect(vis.ents.size).toBeGreaterThan(0)
    }
  })

  it('出局後只有遺言時間能說話；死者頻道不會送給出局的人', () => {
    const { h, g, ps } = setup(true)
    damage(g, null, g.mainOf(ps[1])!, 1e6, { pure: true })
    damage(g, null, g.mainOf(ps[2])!, 1e6, { pure: true })
    h.ticks(2)
    // 遺言時間內可以說（活人聽得到）
    ps[1].chatOut.length = 0
    ps[0].chatOut.length = 0
    routeChat(g, ps[1], 'all', 'last words')
    expect(ps[0].chatOut.some((l) => l.text === 'last words')).toBe(true)
    // 過了遺言時間：不能說，也收不到別的死者
    h.ticks(Math.ceil((LAST_WORDS + 1) * 20))
    ps[1].chatOut.length = 0
    ps[2].chatOut.length = 0
    routeChat(g, ps[1], 'dead', 'hello dead')
    expect(ps[2].chatOut.some((l) => l.text === 'hello dead')).toBe(false)
    expect(ps[1].chatOut.some((l) => l.text === '@chat.booted')).toBe(false)
    routeChat(g, ps[2], 'dead', 'from cara')
    expect(ps[1].chatOut.some((l) => l.text === 'from cara')).toBe(false)
  })
})

describe('死亡即退出：邊界情況', () => {
  const texts = (lines: { text: string }[]) => lines.map((l) => l.text)

  it('記憶核心還能復活的仿生人不算出局；放棄復活（-shutdown）才出局', () => {
    const { h, g, ps } = setup(true)
    g.setRole(ps[1], 'android')
    damage(g, null, g.mainOf(ps[1])!, 1e6, { pure: true })
    h.ticks(Math.ceil((LAST_WORDS + 1) * 20))
    expect(ps[1].data.coreOnly).toBe(true)
    expect(ps[1].data.booted).toBeFalsy()
    // 還在透過記憶核心看（不是出局的全黑畫面）
    expect(computeVision(g).get(ps[1].slot)!.ents.size).toBeGreaterThan(0)
    routeChat(g, ps[1], 'all', '-shutdown')
    expect(ps[1].data.booted).toBe(true)
    expect(computeVision(g).get(ps[1].slot)!.ents.size).toBe(0)
  })

  it('出局的人不能用 -slug 附身蛞蝓仔', () => {
    const { h, g, ps } = setup(true)
    damage(g, null, g.mainOf(ps[1])!, 1e6, { pure: true })
    h.ticks(Math.ceil((LAST_WORDS + 1) * 20))
    expect(ps[1].data.booted).toBe(true)
    expect([...g.world.ents.values()].some((e) => e.def.id === 'creature.slugling')).toBe(true)
    ps[1].chatOut.length = 0
    routeChat(g, ps[1], 'all', '-slug')
    expect(ps[1].data.slug).toBeUndefined()
    expect(ps[1].control).toBe(0)
    expect(g.possessSlug!(ps[1].slot)).toBe(false)
    // 對照：一般觀戰模式的死者可以
    const s2 = setup(false)
    damage(s2.g, null, s2.g.mainOf(s2.ps[1])!, 1e6, { pure: true })
    s2.h.ticks(Math.ceil((LAST_WORDS + 1) * 20))
    routeChat(s2.g, s2.ps[1], 'all', '-slug')
    expect(s2.ps[1].data.slug).toBeTruthy()
  })

  it('出局的人收不到全體與群組聊天，但系統公告照收', () => {
    const { h, g, ps } = setup(true)
    damage(g, null, g.mainOf(ps[1])!, 1e6, { pure: true })
    h.ticks(Math.ceil((LAST_WORDS + 1) * 20))
    expect(ps[1].data.booted).toBe(true)
    routeChat(g, ps[0], 'all', '-creategroup sec')
    routeChat(g, ps[0], 'all', '-add sec ' + ps[2].baseName)
    ps[1].chatOut.length = 0
    routeChat(g, ps[0], 'all', 'public talk')
    routeChat(g, ps[0], 'group', 'secret plan', 'sec')
    expect(texts(ps[1].chatOut)).not.toContain('public talk')
    expect(texts(ps[1].chatOut)).not.toContain('secret plan')
    expect(texts(ps[2].chatOut)).toContain('public talk')
    expect(texts(ps[2].chatOut)).toContain('secret plan')
    // 系統公告：走 sysLines（to: 'all'），不經過聊天路由，出局的人照樣收到
    const { h: h2, cs } = Harness.started(3, 4242, { eventMult: 0, bootOnDeath: true })
    const g2 = h2.server.game!
    const q = g2.allPlayers()
    for (const p of q) g2.setRole(p, 'human')
    const u = g2.mainOf(q[1])!
    u.inv?.fill(null)
    u.suit = null
    u.statsDirty = true
    h2.ticks(2)
    damage(g2, null, u, 1e6, { pure: true })
    h2.ticks(Math.ceil((LAST_WORDS + 1) * 20))
    expect(q[1].data.booted).toBe(true)
    cs[1].inbox.length = 0
    g2.systemAll('event.windfall')
    cs[0].send({ t: 'chat', ch: 'all', text: 'public talk' })
    h2.ticks(2)
    const got = cs[1].inbox.filter((m) => m.t === 'chat').flatMap((m) => texts((m as { lines: { text: string }[] }).lines))
    expect(got).toContain('@event.windfall')
    expect(got).not.toContain('public talk')
  })

  it('投票開啟「死亡即退出」時，投票前就死了的人一併出局；投票改回觀戰則解除', () => {
    const { h, cs } = Harness.started(4, 4242, { eventMult: 0 })
    const g = h.server.game!
    const ps = g.allPlayers()
    for (const p of ps) g.setRole(p, 'human')
    const u = g.mainOf(ps[3])!
    u.inv?.fill(null)
    u.suit = null
    u.statsDirty = true
    h.ticks(2)
    damage(g, null, u, 1e6, { pure: true })
    h.ticks(Math.ceil((LAST_WORDS + 1) * 20))
    expect(ps[3].data.booted).toBeFalsy()
    cs[0].send({ t: 'vote', v: 'deathStart' })
    h.ticks(1)
    for (const c of cs.slice(0, 3)) c.send({ t: 'vote', v: 'boot' })
    h.ticks(20 * 32)
    expect(g.settings.bootOnDeath).toBe(true)
    expect(ps[3].data.booted).toBe(true)
    expect(computeVision(g).get(ps[3].slot)!.ents.size).toBe(0)
  })

  it('大廳開了「死亡即退出」、投票改回觀戰：已出局的人恢復觀戰', () => {
    const { h, cs } = Harness.started(4, 4242, { eventMult: 0, bootOnDeath: true })
    const g = h.server.game!
    const ps = g.allPlayers()
    for (const p of ps) g.setRole(p, 'human')
    const u = g.mainOf(ps[3])!
    u.inv?.fill(null)
    u.suit = null
    u.statsDirty = true
    h.ticks(2)
    damage(g, null, u, 1e6, { pure: true })
    h.ticks(Math.ceil((LAST_WORDS + 1) * 20))
    expect(ps[3].data.booted).toBe(true)
    cs[0].send({ t: 'vote', v: 'deathStart' })
    h.ticks(1)
    for (const c of cs.slice(0, 3)) c.send({ t: 'vote', v: 'spectate' })
    h.ticks(20 * 32)
    expect(g.settings.bootOnDeath).toBe(false)
    expect(ps[3].data.booted).toBeFalsy()
    expect(computeVision(g).get(ps[3].slot)!.ents.size).toBeGreaterThan(0)
  })
})
