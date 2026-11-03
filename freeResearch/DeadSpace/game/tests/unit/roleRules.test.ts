// 身分數量規則：sim 開局實際分配出來的異類數量，一定是大廳預覽列出的其中一種組合
import { describe, expect, it, vi } from 'vitest'
import { Harness } from './helpers/harness'
import { roleOutcomes } from '../../src/shared/roleRules'
import { DEFAULT_SETTINGS } from '../../src/shared/protocol/messages'

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

/** Lobby.tsx 會連帶載入 client/session（載入時就碰 window），node 測試環境裡先給一個空的 window 再載入 */
async function lobbyModule() {
  vi.stubGlobal('window', globalThis)
  try {
    return await import('../../src/ui/screens/Lobby')
  } finally {
    vi.unstubAllGlobals()
  }
}

describe('大廳的最低人數提示', () => {
  it('伺服器開局只擋「沒有人」：1 人也開得了局（所以提示的門檻要從身分規則推算）', () => {
    const { h } = Harness.started(1, 4242, { eventMult: 0 })
    expect(h.server.game).toBeTruthy()
  })

  it('預設設定至少 2 人；1 人時唯一的參戰者就是異類、沒有人類', async () => {
    const { minCombatants } = await lobbyModule()
    expect(minCombatants(DEFAULT_SETTINGS)).toBe(2)
    for (const o of roleOutcomes(1, DEFAULT_SETTINGS)) expect(o.xeno + o.mutant + o.android).toBe(1)
  })

  it('門檻＝每種組合都至少留一名人類的最小人數（強制異類時跟著變多）', async () => {
    const { minCombatants } = await lobbyModule()
    const cases: [Partial<typeof DEFAULT_SETTINGS>, number][] = [
      [{}, 2],
      [{ aliens: 1, mutants: 1 }, 3],
      [{ androids: 1 }, 3],
      [{ aliens: 1, mutants: 1, androids: 1 }, 4],
      [{ aliens: 0, mutants: 0, androids: 0 }, 2],
    ]
    for (const [over, want] of cases) {
      const s = { ...DEFAULT_SETTINGS, ...over }
      const need = minCombatants(s)
      expect(need).toBe(want)
      const humans = (n: number) => roleOutcomes(n, s).map((o) => n - o.xeno - o.mutant - o.android)
      expect(Math.min(...humans(need))).toBeGreaterThanOrEqual(1)
      if (need > 2) expect(Math.min(...humans(need - 1))).toBe(0)
    }
  })
})
