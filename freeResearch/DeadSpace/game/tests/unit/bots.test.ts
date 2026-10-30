// AI bots：基本循環（買裝、驗血、感染、進化）與 headless 整局（不崩潰、分出勝負或平手、抽樣洩漏比對）
import { describe, expect, it } from 'vitest'
import { Harness } from './helpers/harness'
import { checkMessages } from './helpers/leak'

function runMatch(seed: number, bots: number, maxMin: number, settings: Record<string, unknown> = {}) {
  const { h } = Harness.started(1, seed, { bots, eventMult: 2, apocalypse: [5, 6], npcCrew: 2, ...settings })
  const g = h.server.game!
  const problems: string[] = []
  const maxTicks = maxMin * 60 * 20
  let i = 0
  for (; i < maxTicks && !g.ended; i++) {
    h.ticks(1)
    // 每 200 tick 抽一次：只比對這一 tick 送出的訊息
    if (i % 200 === 0) {
      for (const [peer, raws] of h.raw) {
        const slot = h.server.slotOfPeer(peer)
        if (slot !== null) problems.push(...checkMessages(g, slot, raws.slice(-3)))
      }
    }
    for (const r of h.raw.values()) r.length = 0
  }
  return { h, g, problems, minutes: i / 20 / 60 }
}

describe('AI bots', () => {
  it('bots 會買防護服、驗血；異類會感染或累積 EP', () => {
    const { h } = Harness.started(1, 77, { bots: 7, eventMult: 0, apocalypse: [60, 60], npcCrew: 0 })
    const g = h.server.game!
    for (let i = 0; i < 9 * 60 * 20 && !g.ended; i++) {
      h.ticks(1)
      for (const r of h.raw.values()) r.length = 0
    }
    const bots = g.allPlayers().filter((p) => p.bot)
    const suited = bots.filter((p) => g.mainOf(p)?.suit || p.data.botSuitTried).length
    expect(suited).toBeGreaterThan(0)
    const tests = bots.reduce((n, p) => n + p.stats.tests, 0)
    const evil = bots.filter((p) => g.faction(p) !== 'crew')
    const evilProgress = evil.some((p) => p.ep > 0 || p.stats.infections > 0 || p.tier > 0) || g.allPlayers().some((p) => !!p.spawnOf)
    expect(tests + (evilProgress ? 1 : 0)).toBeGreaterThan(0)
  }, 120000)

  it('headless 整局（8 人）：不崩潰、在時限內分出勝負或平手、抽樣沒有洩漏', () => {
    const { g, problems, minutes } = runMatch(4242, 7, 20)
    expect(g.ended).not.toBeNull()
    expect(['crew', 'xeno', 'mutant', 'draw']).toContain(g.ended!.winner)
    expect(minutes).toBeLessThanOrEqual(20)
    expect([...new Set(problems)]).toEqual([])
  }, 300000)
})
