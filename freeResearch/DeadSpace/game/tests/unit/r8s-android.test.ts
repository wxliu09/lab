// 第 8 輪 S8：仿生人 EP 依末日時間換算（shared/pacing.ts）
// 原作固定每秒 1.5、2000 EP ≈ 22 分，約是原作末日（55–70 分）的 35%；本作預設末日 30–40 分，換算成滿 2000 EP 約在中點的 40%，不低於 1.5
import { describe, expect, it } from 'vitest'
import { ANDROID_EP_BASE, ANDROID_UPGRADE_FRAC, androidEpPerSec } from '../../src/shared/pacing'
import { ANDROID_EP } from '../../src/shared/content/forms'
import { DEFAULT_SETTINGS } from '../../src/shared/protocol/messages'
import { PRACTICE_APOCALYPSE } from '../../src/sim/systems/events'
import { Harness } from './helpers/harness'

const minutesToUpgrade = (apo: [number, number]) => ANDROID_EP / androidEpPerSec(apo) / 60

describe('仿生人每秒 EP', () => {
  it('原作末日 55–70 分：照原作 1.5（約 22 分滿）', () => {
    expect(androidEpPerSec([55, 70])).toBe(ANDROID_EP_BASE)
    expect(minutesToUpgrade([55, 70])).toBeCloseTo(22.2, 1)
  })

  it('本作預設 30–40 分：約 2.38，約 14 分滿（中點 35 分的 40%）', () => {
    const r = androidEpPerSec(DEFAULT_SETTINGS.apocalypse)
    expect(r).toBeCloseTo(2.381, 2)
    expect(minutesToUpgrade(DEFAULT_SETTINGS.apocalypse) / 35).toBeCloseTo(ANDROID_UPGRADE_FRAC, 3)
    // 落在預期末日時刻的 35–40% 之間（原作是 35.5%）
    const frac = minutesToUpgrade(DEFAULT_SETTINGS.apocalypse) / 35
    expect(frac).toBeGreaterThanOrEqual(0.35)
    expect(frac).toBeLessThanOrEqual(0.4 + 1e-9)
  })

  it('練習局 20–25 分更快；再長的末日也不低於 1.5；壞掉的設定回到 1.5', () => {
    expect(androidEpPerSec([...PRACTICE_APOCALYPSE])).toBeGreaterThan(androidEpPerSec([30, 40]))
    expect(androidEpPerSec([120, 120])).toBe(ANDROID_EP_BASE)
    expect(androidEpPerSec(undefined)).toBe(ANDROID_EP_BASE)
    expect(androidEpPerSec([NaN, NaN] as unknown as [number, number])).toBe(ANDROID_EP_BASE)
    // 越早末日越快（單調）
    let prev = Infinity
    for (let m = 5; m <= 120; m += 5) {
      const r = androidEpPerSec([m, m])
      expect(r).toBeLessThanOrEqual(prev)
      expect(r).toBeGreaterThanOrEqual(ANDROID_EP_BASE)
      prev = r
    }
  })

  it('sim 照大廳設定給 EP，再乘 EP 倍率', () => {
    const a = Harness.started(7, 3, { apocalypse: [30, 40], epMult: 2 })
    const g = a.h.server.game!
    const and = g.allPlayers().find((p) => p.role === 'android')!
    const ep0 = and.ep
    a.h.ticks(20 * 10)
    expect(and.ep - ep0).toBeCloseTo(10 * 2 * androidEpPerSec([30, 40]), 0)
  })
})
