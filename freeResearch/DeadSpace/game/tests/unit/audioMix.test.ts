// 混音：戰鬥時音樂壓低約 4 dB（音樂輸出與 music 分軌之間的增益節點，進入戰鬥 0.3 秒壓下、離開 1.5 秒放回；音效與環境音分軌不受影響）；各站特色環境層的加強
import { afterEach, describe, expect, it, vi } from 'vitest'

type Call = [number, number, number]
interface FakeNode {
  id: number
  out: FakeNode[]
  gain: { value: number; calls: Call[] }
}

/** 假 Web Audio：記錄每個節點的連線與 gain 參數的 setTargetAtTime */
function fakeAudio() {
  const nodes: FakeNode[] = []
  const param = () => {
    const p = {
      value: 1,
      calls: [] as Call[],
      setTargetAtTime: (v: number, t: number, k: number) => {
        p.calls.push([v, t, k])
      },
      setValueAtTime: () => {},
      linearRampToValueAtTime: () => {},
      exponentialRampToValueAtTime: () => {},
      cancelScheduledValues: () => {},
    }
    return p
  }
  const node = (extra: Record<string, unknown> = {}): FakeNode => {
    const o = {
      id: nodes.length + 1,
      out: [] as FakeNode[],
      gain: param(),
      frequency: param(),
      Q: param(),
      delayTime: param(),
      threshold: param(),
      knee: param(),
      ratio: param(),
      attack: param(),
      release: param(),
      connect(d: FakeNode) {
        o.out.push(d)
        return d
      },
      disconnect: () => {},
      start: () => {},
      stop: () => {},
      ...extra,
    }
    nodes.push(o)
    return o
  }
  class Ctx {
    state = 'running'
    currentTime = 5
    sampleRate = 8000
    destination = node()
    createGain = () => node()
    createDynamicsCompressor = () => node()
    createAnalyser = () => node({ fftSize: 0, getFloatTimeDomainData: () => {} })
    createBiquadFilter = () => node()
    createOscillator = () => node()
    createBufferSource = () => node()
    createConvolver = () => node({ buffer: null })
    createDelay = () => node()
    createStereoPanner = () => node({ pan: param() })
    createBuffer = (_c: number, len: number) => ({ getChannelData: () => new Float32Array(len) })
  }
  /** 直接連到 dst 的上游節點 */
  const upstream = (dst: FakeNode) => nodes.filter((x) => x.out.includes(dst))
  return { Ctx, upstream }
}

afterEach(() => {
  vi.useRealTimers()
  vi.unstubAllGlobals()
})

describe('戰鬥時音樂壓低', () => {
  it('combat → 壓低 4 dB（攻擊 0.3 s）、離開戰鬥 → 放回（釋放 1.5 s）；音效、介面、環境音分軌不動', async () => {
    // 音樂排程用 setInterval：假計時器不推進，只測增益的排程
    vi.useFakeTimers()
    const { Ctx, upstream } = fakeAudio()
    vi.stubGlobal('AudioContext', Ctx)
    vi.stubGlobal('localStorage', { getItem: () => null, setItem: () => {} })
    vi.resetModules()
    const sfx = await import('../../src/audio/sfx')
    const music = await import('../../src/audio/music')
    expect(music.duckGain('combat')).toBeCloseTo(Math.pow(10, -4 / 20), 6)
    expect(music.duckGain('explore')).toBe(1)
    expect(music.duckGain('alarm')).toBe(1)

    const bus = sfx.busNode('music') as unknown as FakeNode
    const others = (['sfx', 'ui', 'ambient'] as const).map((b) => sfx.busNode(b) as unknown as FakeNode)
    const before = others.map((b) => b.gain.calls.length)

    music.setMood('explore')
    // 音樂輸出 → 壓低節點 → music 分軌：分軌只有一個上游，就是壓低節點，它的上游是音樂輸出
    const ups = upstream(bus)
    expect(ups).toHaveLength(1)
    const duck = ups[0]
    expect(upstream(duck)).toHaveLength(1)
    expect(duck.gain.calls.at(-1)).toEqual([1, 5, 1.5 / 3])
    expect(music.musicDuckLevel()).toBe(1)

    music.setMood('combat')
    const [v, , k] = duck.gain.calls.at(-1)!
    expect(20 * Math.log10(v)).toBeCloseTo(-4, 3)
    expect(k * 3).toBeCloseTo(0.3, 6)

    // 同一個 mood 重複呼叫不會重排
    const n = duck.gain.calls.length
    music.setMood('combat')
    expect(duck.gain.calls.length).toBe(n)

    music.setMood('tense')
    expect(duck.gain.calls.at(-1)![0]).toBe(1)
    expect(duck.gain.calls.at(-1)![2] * 3).toBeCloseTo(1.5, 6)

    // 音效、介面、環境音分軌的增益沒有因為換情境被動到
    expect(others.map((b) => b.gain.calls.length)).toEqual(before)
  })
})

describe('各站特色環境層', () => {
  it('女帝、天守、豪勇、活體庫加 5 dB，擺渡（高音拍頻）加 4 dB；其他站不變', async () => {
    vi.resetModules()
    const { flavorBoost } = await import('../../src/audio/ambient')
    const db = (s: string) => 20 * Math.log10(flavorBoost(s))
    for (const s of ['nyx', 'tenshu', 'bravado', 'vivarium']) expect(db(s), s).toBeCloseTo(5, 3)
    expect(db('portage')).toBeCloseTo(4, 3)
    for (const s of ['adjudicatrix', 'caldera', 'hulk7', 'uo', 'pirate', 'cinder', '']) expect(flavorBoost(s), s).toBe(1)
  })
})
