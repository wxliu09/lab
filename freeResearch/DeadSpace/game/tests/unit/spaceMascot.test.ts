// 背景彩蛋的彈跳：永遠留在畫面內、碰到邊會反彈、速度不會越來越快或停下來
import { describe, expect, it } from 'vitest'
import { stepBounce, type Bounce } from '../../src/ui/SpaceMascot'

function rng(seed: number): () => number {
  let s = seed >>> 0
  return () => ((s = (s * 1664525 + 1013904223) >>> 0) / 2 ** 32)
}

describe('背景彩蛋彈跳', () => {
  it('跑 10 分鐘：都在畫面內、有反彈、速度穩定', () => {
    const r = rng(7)
    const w = 1280
    const h = 720
    const size = 128
    let s: Bounce = { x: 300, y: 200, vx: 80, vy: -55, rot: 0, spin: 15, squash: 0, axis: 'x' }
    let bounces = 0
    let minSp = Infinity
    let maxSp = 0
    for (let i = 0; i < 60 * 600; i++) {
      const prev = s
      s = stepBounce(s, 1 / 60, w, h, size, r)
      if (Math.sign(prev.vx) !== Math.sign(s.vx) || Math.sign(prev.vy) !== Math.sign(s.vy)) bounces++
      expect(s.x).toBeGreaterThanOrEqual(0)
      expect(s.y).toBeGreaterThanOrEqual(0)
      expect(s.x).toBeLessThanOrEqual(w - size)
      expect(s.y).toBeLessThanOrEqual(h - size * (305 / 300) + 1e-6)
      const sp = Math.hypot(s.vx, s.vy)
      if (i > 600) {
        minSp = Math.min(minSp, sp)
        maxSp = Math.max(maxSp, sp)
      }
    }
    expect(bounces).toBeGreaterThan(50)
    expect(minSp).toBeGreaterThan(50)
    expect(maxSp).toBeLessThan(160)
  })

  it('視窗比圖還小也不會出錯', () => {
    let s: Bounce = { x: 0, y: 0, vx: 90, vy: 30, rot: 0, spin: 0, squash: 0, axis: 'x' }
    for (let i = 0; i < 120; i++) s = stepBounce(s, 1 / 60, 60, 60, 128)
    expect(s.x).toBe(0)
    expect(s.y).toBe(0)
  })
})
