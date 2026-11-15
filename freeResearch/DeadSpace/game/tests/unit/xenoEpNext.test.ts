// 異形的「下一階需要的 EP」（目標面板 EP 條、進化選單用）：tier 0／1 → T2、tier 2 → T3、tier 3 → 0（最終形態）
import { describe, expect, it } from 'vitest'
import { Harness } from './helpers/harness'
import { XENO_T2_EP, XENO_T3_EP } from '../../src/shared/content/forms'

describe('異形下一階 EP 門檻', () => {
  it('進化到 T2 之後仍顯示 T3 的門檻，T3 才是最終形態', () => {
    const { h } = Harness.started(2, 5150, { eventMult: 0, npcCrew: 0, bots: 0 })
    const g = h.server.game!
    const p = g.allPlayers()[0]
    p.role = 'xeno'
    p.spawnOf = undefined as never
    const at = (tier: number) => {
      p.tier = tier
      return g.epNext(p)
    }
    expect(at(0)).toBe(XENO_T2_EP)
    expect(at(1)).toBe(XENO_T2_EP)
    expect(at(2)).toBe(XENO_T3_EP)
    expect(at(3)).toBe(0)
  })
})
