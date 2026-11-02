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
