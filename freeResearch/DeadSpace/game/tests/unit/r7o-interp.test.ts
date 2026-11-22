// 第 7 輪（視聽與手感）：靜止起步的插值頓挫（review-r7f harness/interp-sim.cjs 的離線重播）。
// 單位靜止 5 秒後以 3.19 m/s 起步，快照 20 Hz（靜止時不帶座標），每 1/60 秒看一次畫面上的位置：
// 修正前第一幀跳約 0.157 m，接著幾乎停住約 100 ms 才開始走；修正後要從原地等速走出去。
import { afterEach, describe, expect, it, vi } from 'vitest'
import { ClientWorld } from '../../src/client/world'
import type { Snapshot } from '../../src/shared/protocol/messages'

let now = 0

afterEach(() => vi.restoreAllMocks())

/** 重播：回傳起步附近每一幀的 [相對起步的秒數, x] */
function replay(opts: { start: number; speed: number; snapHz: number; lat: number; until: number }): { w: ClientWorld; out: [number, number][] } {
  vi.spyOn(performance, 'now').mockImplementation(() => now * 1000)
  now = 0
  const w = new ClientWorld()
  const snaps: { at: number; s: Snapshot }[] = []
  const dt = 1 / opts.snapHz
  for (let k = 0; k * dt <= opts.until + 0.5; k++) {
    const t = Math.round(k * dt * 1000) / 1000
    const moving = t >= opts.start
    const x = moving ? (t - (opts.start - dt)) * opts.speed : 0
    // 靜止時快照只帶第一次的座標（之後位置沒變就不帶）
    const e = k === 0 || moving ? [{ i: 1, x: Math.round(x * 100), y: 0 }] : []
    snaps.push({ at: t + opts.lat, s: { tick: k, time: t, e, g: [] } })
  }
  let si = 0
  const out: [number, number][] = []
  for (now = 0; now < opts.until; now += 1 / 60) {
    while (si < snaps.length && snaps[si].at <= now) w.apply(snaps[si++].s)
    w.interpolate()
    const c = w.ents.get(1)!
    if (now >= opts.start - 0.05 && now <= opts.start + 0.6) out.push([now - opts.start, c.x])
  }
  return { w, out }
}

describe('靜止起步的插值（world.ts）', () => {
  it('20 Hz 快照：起步沒有大跳、也沒有停頓，等速走出去', () => {
    const { out } = replay({ start: 5, speed: 3.19, snapHz: 20, lat: 0.002, until: 6.2 })
    const steps = out.slice(1).map(([, x], i) => x - out[i][1])
    const perFrame = 3.19 / 60
    // 最大的一步不超過等速一幀的 1.6 倍（修正前第一步約 0.157 m，是 3 倍）
    expect(Math.max(...steps)).toBeLessThan(perFrame * 1.6)
    // 開始動之後到觀察結束，每一幀都在前進（修正前起步後約 100 ms 每幀只動 0.5 mm）
    const first = steps.findIndex((d) => d > 1e-4)
    expect(first).toBeGreaterThanOrEqual(0)
    const moving = steps.slice(first + 1)
    expect(moving.length).toBeGreaterThan(20)
    for (const d of moving) expect(d).toBeGreaterThan(perFrame * 0.5)
  })

  it('10 Hz 快照（較慢的連線）也一樣平順', () => {
    const { out } = replay({ start: 5, speed: 3.19, snapHz: 10, lat: 0.03, until: 6.2 })
    const steps = out.slice(1).map(([, x], i) => x - out[i][1])
    const perFrame = 3.19 / 60
    expect(Math.max(...steps)).toBeLessThan(perFrame * 1.6)
    const first = steps.findIndex((d) => d > 1e-4)
    for (const d of steps.slice(first + 1)) expect(d).toBeGreaterThan(perFrame * 0.5)
  })

  it('一直在走的單位不插補樣本（每份快照一個樣本）；只停一份快照時補在那份快照的時間', () => {
    vi.spyOn(performance, 'now').mockImplementation(() => now * 1000)
    now = 0
    const w = new ClientWorld()
    for (let k = 0; k < 6; k++) w.apply({ tick: k, time: Math.round(k * 5) / 100, e: [{ i: 1, x: k * 16, y: 0 }], g: [] })
    expect(w.ents.get(1)!.samples.map((s) => s.t)).toEqual([0, 0.05, 0.1, 0.15, 0.2, 0.25])
    // 停一份（0.3 沒帶座標），0.35 又動了：0.3 補一個原地樣本
    w.apply({ tick: 6, time: 0.3, e: [], g: [] })
    w.apply({ tick: 7, time: 0.35, e: [{ i: 1, x: 96, y: 0 }], g: [] })
    const sm = w.ents.get(1)!.samples
    expect(sm.slice(-3).map((s) => [s.t, s.x])).toEqual([
      [0.25, 0.8],
      [0.3, 0.8],
      [0.35, 0.96],
    ])
  })

  it('換 zone、瞬移不補樣本（舊樣本整個清掉）', () => {
    vi.spyOn(performance, 'now').mockImplementation(() => now * 1000)
    now = 0
    const w = new ClientWorld()
    w.apply({ tick: 0, time: 0, e: [{ i: 1, x: 0, y: 0, z: 1 }], g: [] })
    w.apply({ tick: 1, time: 0.05, e: [], g: [] })
    w.apply({ tick: 2, time: 0.1, e: [{ i: 1, x: 2000, y: 0 }], g: [] })
    expect(w.ents.get(1)!.samples.map((s) => s.t)).toEqual([0.1])
    w.apply({ tick: 3, time: 0.15, e: [], g: [] })
    w.apply({ tick: 4, time: 0.2, e: [{ i: 1, x: 2010, z: 2 }], g: [] })
    expect(w.ents.get(1)!.samples.map((s) => s.t)).toEqual([0.2])
  })
})
