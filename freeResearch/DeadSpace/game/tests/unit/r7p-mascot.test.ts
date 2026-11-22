// 第 7 輪：大廳裡的背景彩蛋只在大廳面板左右的空白邊上下漂（不會從半透明的面板後面透出來）；空白邊太窄就不出現
import { describe, expect, it } from 'vitest'
import { ASPECT, LANE_MAX, LANE_MIN, driftX, lobbyLane, stepDrift, type Drift } from '../../src/ui/SpaceMascot'

function rng(seed: number): () => number {
  let s = seed >>> 0
  return () => ((s = (s * 1664525 + 1013904223) >>> 0) / 2 ** 32)
}

describe('大廳彩蛋的走道', () => {
  it('1280×720（大廳 inset 4vw ≈ 51 px）：小貓，在左右較寬的那一側', () => {
    const lane = lobbyLane({ left: 51, right: 1229 }, 1280, 720)!
    expect(lane).not.toBeNull()
    expect(lane.size).toBeGreaterThanOrEqual(LANE_MIN)
    expect(lane.size).toBeLessThan(51)
    expect(lane.x).toBe(0)
    expect(lane.w).toBe(51)
    // 右邊比較寬就走右邊
    const r = lobbyLane({ left: 40, right: 1180 }, 1280, 720)!
    expect(r.x).toBe(1180)
    expect(r.w).toBe(100)
  })

  it('寬螢幕：貓的大小有上限；空白邊太窄就不出現', () => {
    expect(lobbyLane({ left: 400, right: 2160 }, 2560, 1440)!.size).toBe(LANE_MAX)
    expect(lobbyLane({ left: 20, right: 1260 }, 1280, 720)).toBeNull()
    expect(lobbyLane({ left: 0, right: 1280 }, 1280, 720)).toBeNull()
  })

  it('漂 10 分鐘：貓（含翻滾的外接圓）一直在走道裡，不碰到面板', () => {
    const r = rng(11)
    for (const [left, right, w, h] of [
      [51, 1229, 1280, 720],
      [77, 1843, 1920, 1080],
      [300, 1620, 1920, 1080],
    ]) {
      const lane = lobbyLane({ left, right }, w, h)!
      let d: Drift = { y: 100, vy: 30, rot: 0, spin: 12, squash: 0, t: 0 }
      let flips = 0
      for (let i = 0; i < 60 * 600; i++) {
        const prev = d
        d = stepDrift(d, 1 / 60, lane.h, lane.size, r)
        if (Math.sign(prev.vy) !== Math.sign(d.vy)) flips++
        const x = driftX(lane, d.t)
        // 圖片中心到最遠角落（翻滾）的距離
        const cx = x + lane.size / 2
        const cy = d.y + (lane.size * ASPECT) / 2
        const rad = Math.hypot(lane.size, lane.size * ASPECT) / 2
        // 圖片本身（不含透明角落）不會出走道；翻滾的外接圓最多超出一點點（圖的四角是透明的）
        expect(x).toBeGreaterThanOrEqual(lane.x - 1e-6)
        expect(x + lane.size).toBeLessThanOrEqual(lane.x + lane.w + 1e-6)
        expect(cx - rad).toBeGreaterThan(lane.x - lane.size * 0.12)
        expect(cx + rad).toBeLessThan(lane.x + lane.w + lane.size * 0.12)
        expect(cy - rad).toBeGreaterThan(-lane.size * 0.12)
        expect(cy + rad).toBeLessThan(lane.h + lane.size * 0.12)
      }
      expect(flips).toBeGreaterThan(4)
    }
  })
})
