// 混音：音樂的側鏈壓低（第 7 輪：不再一進戰鬥就固定壓 4 dB，改成跟著附近的槍聲、爆炸；自己受傷另外壓 6 dB、0.25 秒；音效與環境音分軌不受影響）；各站特色環境層的加強
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
      detune: param(),
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
    createWaveShaper = () => node({ curve: null, oversample: 'none' })
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

describe('音樂的側鏈壓低', () => {
  it('進入戰鬥不再固定壓低；附近開火 → 依距離壓低（最多 4 dB）、停火後放回；自己受傷 → 另一個節點壓 6 dB、0.25 秒；其他分軌不動', async () => {
    // 音樂排程用 setInterval：假計時器不推進，只測增益的排程
    vi.useFakeTimers()
    const { Ctx, upstream } = fakeAudio()
    vi.stubGlobal('AudioContext', Ctx)
    vi.stubGlobal('localStorage', { getItem: () => null, setItem: () => {} })
    vi.resetModules()
    const sfx = await import('../../src/audio/sfx')
    const music = await import('../../src/audio/music')

    const bus = sfx.busNode('music') as unknown as FakeNode
    const others = (['sfx', 'ui', 'ambient'] as const).map((b) => sfx.busNode(b) as unknown as FakeNode)
    const before = others.map((b) => b.gain.calls.length)

    music.setMood('explore')
    // 音樂輸出 → 側鏈壓低 → 受傷壓低 → music 分軌（各只有一個上游）
    const ups = upstream(bus)
    expect(ups).toHaveLength(1)
    const hit = ups[0]
    expect(upstream(hit)).toHaveLength(1)
    const duck = upstream(hit)[0]
    expect(upstream(duck)).toHaveLength(1)
    expect(music.musicDuckLevel()).toBe(1)

    // 換到戰鬥：壓低節點完全沒被排程（第 6 輪以前這裡會固定壓 4 dB）
    music.setMood('combat')
    expect(duck.gain.calls).toHaveLength(0)
    expect(hit.gain.calls).toHaveLength(0)

    // 自己腳下開火：壓 4 dB（起音 40 ms），0.3 秒後 1.2 秒放回
    sfx.sfx('rifle', 0, 0)
    const [v, t0, k] = duck.gain.calls.at(-2)!
    expect(20 * Math.log10(v)).toBeCloseTo(music.MUSIC_DUCK.db, 3)
    expect(t0).toBe(5)
    expect(k * 3).toBeCloseTo(music.MUSIC_DUCK.attack, 6)
    const [v2, t2, k2] = duck.gain.calls.at(-1)!
    expect(v2).toBe(1)
    expect(t2).toBeCloseTo(5 + music.MUSIC_DUCK.hold, 6)
    expect(k2 * 3).toBeCloseTo(music.MUSIC_DUCK.release, 6)

    // 20 m 外的槍聲在壓低期間：不會把壓低變淺
    sfx.sfx('pistol', 20, 0)
    expect(20 * Math.log10(duck.gain.calls.at(-2)![0])).toBeCloseTo(-4, 3)

    // 介面音不會壓音樂
    const n = duck.gain.calls.length
    sfx.sfx('notify')
    expect(duck.gain.calls).toHaveLength(n)

    // 自己受傷：受傷壓低節點 −6 dB，0.25 秒後放回
    sfx.sfx('hurt')
    const [hv, ht] = hit.gain.calls.at(-2)!
    expect(20 * Math.log10(hv)).toBeCloseTo(-6, 3)
    expect(ht).toBe(5)
    expect(hit.gain.calls.at(-1)![0]).toBe(1)
    expect(hit.gain.calls.at(-1)![1]).toBeCloseTo(5.25, 6)

    // 音效、介面、環境音分軌的增益沒有因為換情境或壓低被動到
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
