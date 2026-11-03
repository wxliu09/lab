// 引擎循環音：離開對局（stopEngine）時直接停掉節點，不留到下一局
import { describe, expect, it, vi } from 'vitest'

/** 最小的假 Web Audio：只記錄節點的建立、start／stop 與連線 */
function fakeAudio() {
  const stops: (number | undefined)[] = []
  const param = () => ({ value: 0, setTargetAtTime: vi.fn(), cancelScheduledValues: vi.fn() })
  const node = (extra: Record<string, unknown> = {}) => {
    const n: Record<string, unknown> = {
      connect: (d: unknown) => d,
      disconnect: vi.fn(),
      gain: param(),
      frequency: param(),
      Q: param(),
      threshold: param(),
      knee: param(),
      ratio: param(),
      attack: param(),
      release: param(),
      ...extra,
    }
    return n
  }
  const src = () =>
    node({
      start: vi.fn(),
      stop: vi.fn((t?: number) => stops.push(t)),
      onended: null,
    })
  class Ctx {
    state = 'running'
    currentTime = 10
    sampleRate = 8000
    destination = node()
    createGain = () => node()
    createDynamicsCompressor = () => node()
    createAnalyser = () => node({ fftSize: 0, getFloatTimeDomainData: () => {} })
    createBiquadFilter = () => node()
    createOscillator = () => src()
    createBufferSource = () => src()
    createBuffer = (_c: number, n: number) => ({ getChannelData: () => new Float32Array(n) })
  }
  return { Ctx, stops }
}

describe('引擎聲', () => {
  it('駕駛中離開對局：stopEngine 立刻淡出並排定停止，節點不再存在', async () => {
    const { Ctx, stops } = fakeAudio()
    vi.stubGlobal('AudioContext', Ctx)
    vi.stubGlobal('localStorage', { getItem: () => null, setItem: () => {} })
    vi.resetModules()
    const eng = await import('../../src/audio/engine')
    eng.setEngine(0.8)
    expect(eng.engineState()).toEqual({ k: 0.8, live: true })
    eng.stopEngine()
    expect(eng.engineState()).toEqual({ k: 0, live: false })
    // 兩個音源（鋸齒波、雜訊）都排在 0.25 秒內停止
    expect(stops).toHaveLength(2)
    for (const t of stops) expect(t).toBeLessThanOrEqual(10.3)
    // 之後再開始駕駛會重建一組新的節點
    eng.setEngine(0.5)
    expect(eng.engineState().live).toBe(true)
    vi.unstubAllGlobals()
  })
})
