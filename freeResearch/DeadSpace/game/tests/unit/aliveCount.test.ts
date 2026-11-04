// 頂列的存活人數：全場活著的參戰者／總數（不分身分，和 -names 一致，旁觀的主機不算）；中文介面不再出現「工蟲」
import { describe, expect, it } from 'vitest'
import { Harness } from './helpers/harness'
import { damage } from '../../src/sim/systems/damage'
import { GAME_ZH } from '../../src/ui/strings/game'
import { UNITS } from '../../src/shared/content/registry'

describe('存活人數', () => {
  it('有人死亡就減一；總數不變', () => {
    const { h } = Harness.started(4, 31, { eventMult: 0 })
    const g = h.server.game!
    expect(g.worldPublic().al).toEqual([4, 4])
    damage(g, null, g.mainOf(g.allPlayers()[2])!, 1e7, { pure: true })
    h.ticks(2)
    expect(g.worldPublic().al).toEqual([3, 4])
  })

  it('旁觀的主機不算參戰者', () => {
    const { h } = Harness.started(3, 32, { eventMult: 0, hostSpectate: true })
    const g = h.server.game!
    const al = g.worldPublic().al as [number, number]
    expect(al[1]).toBe(g.allPlayers().filter((p) => !p.spectator).length)
    expect(al[0]).toBeLessThanOrEqual(al[1])
  })
})

describe('用語：工蟲 → 眷屬', () => {
  it('中文字串與單位名稱沒有「工蟲」', () => {
    expect(GAME_ZH['death.mutantSpawn']).not.toContain('工蟲')
    expect(GAME_ZH['death.mutantSpawn']).toContain('眷屬')
    for (const v of Object.values(GAME_ZH)) expect(v).not.toContain('工蟲')
    for (const u of UNITS.values()) expect((u.name as { zh?: string } | undefined)?.zh ?? '').not.toContain('工蟲')
  })
})
