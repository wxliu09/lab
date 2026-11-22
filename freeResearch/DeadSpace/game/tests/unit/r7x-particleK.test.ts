// 第 7 輪：粒子發射倍率跟著 preset().particles（進階畫質的「粒子密度」覆寫也要生效）；四個預設維持原本的倍率
import { describe, expect, it } from 'vitest'
import { particleK } from '../../src/render/fx'
import { PRESETS } from '../../src/render/quality'

describe('particleK', () => {
  it('四個預設等於原本的 0.45／0.75／1／1.25', () => {
    expect(particleK(PRESETS.low.particles)).toBeCloseTo(0.45)
    expect(particleK(PRESETS.medium.particles)).toBeCloseTo(0.75)
    expect(particleK(PRESETS.high.particles)).toBeCloseTo(1)
    expect(particleK(PRESETS.ultra.particles)).toBeCloseTo(1.25)
  })
  it('預設之間線性內插、單調遞增', () => {
    expect(particleK(1000)).toBeCloseTo(0.6)
    expect(particleK(2250)).toBeCloseTo(0.875)
    expect(particleK(4500)).toBeCloseTo(1.125)
    let prev = 0
    for (let n = 50; n <= 12000; n += 50) {
      const k = particleK(n)
      expect(k).toBeGreaterThanOrEqual(prev)
      prev = k
    }
  })
  it('範圍外：低於 500 等比例往下（最少 0.1）、高於 6000 最多 1.5', () => {
    expect(particleK(250)).toBeCloseTo(0.225)
    expect(particleK(10)).toBe(0.1)
    expect(particleK(0)).toBe(0.1)
    expect(particleK(9000)).toBeCloseTo(1.5)
    expect(particleK(1e6)).toBe(1.5)
  })
})
