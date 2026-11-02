// 身分數量規則：sim 開局實際分配出來的異類數量，一定是大廳預覽列出的其中一種組合
import { describe, expect, it } from 'vitest'
import { Harness } from './helpers/harness'
import { roleOutcomes } from '../../src/shared/roleRules'

describe('身分數量規則（sim 與大廳預覽共用）', () => {
  for (const n of [3, 4, 5, 7, 9]) {
    it(`${n} 人`, () => {
      for (const seed of [1, 2, 3, 4]) {
        const { h } = Harness.started(n, seed * 97 + n, { eventMult: 0 })
        const g = h.server.game!
        const ps = g.allPlayers().filter((p) => !p.spectator)
        const got = {
          xeno: ps.filter((p) => p.role === 'xeno').length,
          mutant: ps.filter((p) => p.role === 'mutant').length,
          android: ps.filter((p) => p.role === 'android').length,
        }
        expect(roleOutcomes(ps.length, g.settings)).toContainEqual(got)
      }
    })
  }
})
