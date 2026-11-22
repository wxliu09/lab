// 第 7 輪音訊：設定（介面分軌、單聲道、舊存檔升級）、同時發聲數上限、新的具名音效（deny／aimEnter／castBreak／castCharge(k)）、
// 每次播放的隨機變化、嘶聲的 7 kHz 上限、背景音樂的 A／B 段與頑固音型
import { afterEach, describe, expect, it, vi } from 'vitest'

type Call = [number, number, number]
interface FakeParam {
  value: number
  calls: Call[]
  sets: [number, number][]
}
interface FakeNode {
  kind: string
  out: FakeNode[]
  gain: FakeParam
  frequency: FakeParam
  pan: FakeParam
  type?: string
  channelCount?: number
  channelCountMode?: string
}

/** 假 Web Audio：記錄節點種類、連線、參數的 setValueAtTime／setTargetAtTime；currentTime 可以手動往前推 */
function fakeAudio() {
  const nodes: FakeNode[] = []
  const param = (): FakeParam => {
    const p = {
      value: 1,
      calls: [] as Call[],
      sets: [] as [number, number][],
      setTargetAtTime: (v: number, t: number, k: number) => {
        p.calls.push([v, t, k])
      },
      setValueAtTime: (v: number, t: number) => {
        p.sets.push([v, t])
      },
      linearRampToValueAtTime: () => {},
      exponentialRampToValueAtTime: () => {},
      cancelScheduledValues: () => {},
    }
    return p
  }
  const node = (kind: string, extra: Record<string, unknown> = {}): FakeNode => {
    const o = {
      kind,
      out: [] as FakeNode[],
      gain: param(),
      frequency: param(),
      detune: param(),
      Q: param(),
      pan: param(),
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
    destination = node('dest')
    createGain = () => node('gain')
    createDynamicsCompressor = () => node('comp')
    createAnalyser = () => node('analyser', { fftSize: 0, getFloatTimeDomainData: () => {} })
    createBiquadFilter = () => node('biquad')
    createOscillator = () => node('osc')
    createBufferSource = () => node('buffer')
    createConvolver = () => node('conv', { buffer: null })
    createDelay = () => node('delay')
    createStereoPanner = () => node('pan')
    createWaveShaper = () => node('shaper', { curve: null, oversample: 'none' })
    createBuffer = (_c: number, len: number) => ({ getChannelData: () => new Float32Array(len) })
  }
  return { Ctx, nodes }
}

async function load(store: Record<string, string> = {}) {
  vi.useFakeTimers()
  const fa = fakeAudio()
  vi.stubGlobal('AudioContext', fa.Ctx)
  vi.stubGlobal('localStorage', { getItem: (k: string) => store[k] ?? null, setItem: (k: string, v: string) => (store[k] = v) })
  vi.resetModules()
  const sfx = await import('../../src/audio/sfx')
  await import('../../src/audio/combat')
  const ctx = sfx.audioContext() as unknown as { currentTime: number }
  const advance = (dt: number) => (ctx.currentTime += dt)
  return { sfx, ...fa, ctx, advance, store }
}

afterEach(() => {
  vi.useRealTimers()
  vi.unstubAllGlobals()
})

describe('音量設定（第 7 輪）', () => {
  it('舊存檔沒有 ui：沿用舊版由 sfx 推算的值；沒有 mono 就是關；壞值用預設', async () => {
    const { sfx } = await load()
    const old = sfx.parsePrefs({ master: 0.5, sfx: 0.4, music: 0.3, ambient: 0.2, muted: true })
    expect(old.ui).toBeCloseTo(0.4 * 0.9 + 0.1, 6)
    expect(old.mono).toBe(false)
    expect(old.muted).toBe(true)
    expect(sfx.parsePrefs({ sfx: 0.4, ui: 0.25, mono: true })).toMatchObject({ ui: 0.25, mono: true, sfx: 0.4 })
    const bad = sfx.parsePrefs({ master: 7, ui: -1, sfx: 'x', mono: 'yes' })
    expect(bad.master).toBe(0.9)
    expect(bad.ui).toBe(0.9)
    expect(bad.mono).toBe(false)
    expect(sfx.parsePrefs(null).ui).toBe(0.9)
  })

  it('載入舊存檔 → 介面分軌的音量就是舊版的推算值；改了之後存回去', async () => {
    const { sfx, store } = await load({ 'xc.audio': JSON.stringify({ master: 0.8, sfx: 0.5, music: 0.4, ambient: 0.6, muted: false }) })
    expect(sfx.audioPrefs.value.ui).toBeCloseTo(0.55, 6)
    const ui = sfx.busNode('ui') as unknown as FakeNode
    const sb = sfx.busNode('sfx') as unknown as FakeNode
    expect(ui.gain.calls.at(-1)![0]).toBeCloseTo(0.55, 6)
    const nSfx = sb.gain.calls.length
    sfx.setAudioPref('ui', 0.2)
    expect(ui.gain.calls.at(-1)![0]).toBe(0.2)
    // 介面分軌獨立：sfx 分軌拿到的還是原本的值
    expect(sb.gain.calls.length).toBe(nSfx + 1)
    expect(sb.gain.calls.at(-1)![0]).toBe(0.5)
    expect(JSON.parse(store['xc.audio'])).toMatchObject({ ui: 0.2, sfx: 0.5, mono: false })
  })

  it('單聲道：世界音效不做左右定位，母線混成 1 聲道；關掉後恢復', async () => {
    const { sfx, nodes } = await load()
    const master = nodes.find((n) => n.kind === 'gain' && n.out.some((o) => o.kind === 'comp'))!
    sfx.sfx('clang', 10, 0)
    const panOf = () => nodes.filter((n) => n.kind === 'pan').at(-1)!.pan.value
    expect(panOf()).toBeGreaterThan(0.5)
    sfx.setAudioPref('mono', true)
    expect(master.channelCount).toBe(1)
    expect(master.channelCountMode).toBe('explicit')
    sfx.sfx('clank', 10, 0)
    expect(panOf()).toBe(0)
    sfx.setAudioPref('mono', false)
    expect(master.channelCount).toBe(2)
    expect(master.channelCountMode).toBe('max')
  })
})

describe('分軌與 bus 壓縮器', () => {
  it('世界音效先過 sfx bus 壓縮器（−18、3:1）再進 sfx 分軌；介面音直接進 ui 分軌', async () => {
    const { sfx, nodes } = await load()
    const sb = sfx.busNode('sfx') as unknown as FakeNode
    const comp = nodes.find((n) => n.kind === 'comp' && n.out.some((g) => g.out.includes(sb)))!
    expect(comp).toBeTruthy()
    expect((comp as unknown as { threshold: FakeParam }).threshold.value).toBe(sfx.SFX_COMP.threshold)
    expect((comp as unknown as { ratio: FakeParam }).ratio.value).toBe(3)
    sfx.sfx('rifle', 0, 0)
    const pan = nodes.filter((n) => n.kind === 'pan').at(-1)!
    expect(pan.out).toEqual([comp])
    sfx.sfx('cmdMove')
    const pan2 = nodes.filter((n) => n.kind === 'pan').at(-1)!
    expect(pan2.out).toEqual([sfx.busNode('ui')])
  })
})

describe('同時發聲數上限', () => {
  it('同一種最多 4 聲：更遠、更小聲的新聲音不播；更近的會讓最小聲的那個淡掉', async () => {
    const { sfx, nodes, advance } = await load()
    const pans = () => nodes.filter((n) => n.kind === 'pan').length
    for (let i = 0; i < 4; i++) {
      sfx.sfx('rifle', 4 + i * 2, 0)
      advance(0.035)
    }
    expect(sfx.voiceCount()).toBe(4)
    // 明顯更遠（小 2 dB 以上）：不播
    const n = pans()
    sfx.sfx('rifle', 20, 0)
    expect(pans()).toBe(n)
    expect(sfx.voiceCount()).toBe(4)
    advance(0.035)
    // 更近：播，最遠的那聲（x = 10）被淡掉
    const outs = nodes.filter((n) => n.kind === 'gain' && n.out.length === 1 && n.out[0].kind === 'pan')
    const farthest = outs.reduce((m, g) => (g.gain.value < m.gain.value ? g : m))
    sfx.sfx('rifle', 0, 0)
    expect(pans()).toBe(n + 1)
    expect(sfx.voiceCount()).toBe(4)
    expect(farthest.gain.calls.at(-1)![0]).toBe(0)
  })

  it('世界音效總共最多 16 聲；介面音不算', async () => {
    const { sfx, advance } = await load()
    const names = ['rifle', 'pistol', 'heavy', 'sniper', 'plasma', 'void', 'zap', 'laser', 'flame', 'saw', 'spit', 'force', 'mag', 'rocket', 'thump', 'arc', 'chrono', 'fireball', 'silk', 'spine', 'cryo', 'sludge']
    for (const [i, n] of names.entries()) sfx.sfx(n, (i % 5) - 2, 1)
    expect(sfx.voiceCount()).toBe(sfx.VOICE_LIMIT.total)
    sfx.sfx('notify')
    sfx.sfx('cmdAttack')
    expect(sfx.voiceCount()).toBe(sfx.VOICE_LIMIT.total)
    // 聲音結束之後名額就空出來
    advance(5)
    expect(sfx.voiceCount()).toBe(0)
  })

  it('命中、叫聲（playSynth）也算進上限，以 key 的前兩段分種類', async () => {
    const { sfx } = await load()
    const combat = await import('../../src/audio/combat')
    // 同一瞬間 6 種材質的子彈命中：同屬 hit:bullet，最多 4 聲
    for (const m of ['flesh', 'carapace', 'goo', 'metal', 'shield', 'stone'] as const) combat.playHit('bullet', m, 1, 1)
    expect(sfx.voiceCount()).toBe(4)
    // 不同打擊類型是另一種
    combat.playHit('slash', 'flesh', 1, 1)
    expect(sfx.voiceCount()).toBe(5)
  })
})

describe('第 7 輪新增的具名音效', () => {
  it('deny、aimEnter、castBreak、castCharge 都有註冊（會建立節點，不是預設的嗶聲）', async () => {
    const { sfx, nodes, advance } = await load()
    for (const n of ['deny', 'aimEnter', 'castBreak', 'castCharge', 'previewMusic', 'previewAmbient']) {
      const before = nodes.length
      sfx.sfx(n, 0, 0)
      // 預設音效（未知名稱）只有 1 個振盪器＋增益＋定位＝ 4 個節點
      expect(nodes.length - before, n).toBeGreaterThan(5)
      advance(0.2)
    }
    expect(sfx.castCharge.length).toBe(3)
  })

  it('castCharge(x, y, k)：音高隨詠唱進度往上爬；sfx("castCharge") 等於 k = 0', async () => {
    const { sfx, nodes, advance } = await load()
    const firstOsc = (f: () => void) => {
      const before = nodes.length
      f()
      return nodes.slice(before).find((n) => n.kind === 'osc')!.frequency.sets[0][0]
    }
    // 5 秒的引導每 0.6 秒充一次能
    const f0 = firstOsc(() => sfx.castCharge(0, 0, 0))
    advance(0.6)
    const fHalf = firstOsc(() => sfx.castCharge(0, 0, 0.5))
    advance(0.6)
    const f1 = firstOsc(() => sfx.castCharge(0, 0, 1))
    advance(0.6)
    const fPlain = firstOsc(() => sfx.sfx('castCharge', 0, 0))
    expect(f0).toBeCloseTo(300, 3)
    expect(fPlain).toBeCloseTo(f0, 6)
    expect(fHalf).toBeGreaterThan(f0)
    expect(f1).toBeGreaterThan(fHalf)
    expect(f1 / f0).toBeCloseTo(Math.pow(2, 9 / 12), 3)
    // 超出範圍夾在 0–1
    advance(0.6)
    expect(firstOsc(() => sfx.castCharge(0, 0, 5))).toBeCloseTo(f1, 6)
  })

  it('deny 連按：0.12 秒內只響一次', async () => {
    const { sfx, nodes, advance } = await load()
    const count = () => nodes.filter((n) => n.kind === 'pan').length
    sfx.sfx('deny')
    advance(0.05)
    sfx.sfx('deny')
    expect(count()).toBe(1)
    advance(0.1)
    sfx.sfx('deny')
    expect(count()).toBe(2)
  })
})

describe('每次播放的隨機變化', () => {
  it('開火聲音高每發不同（±6% 內）；指令確認音 ±5%；介面按鈕音一致', async () => {
    const { sfx, nodes, advance } = await load()
    const freqs = (name: string, n: number) => {
      const out: number[] = []
      for (let i = 0; i < n; i++) {
        const before = nodes.length
        sfx.sfx(name, 0, 0)
        out.push(nodes.slice(before).find((x) => x.kind === 'osc')!.frequency.sets[0][0])
        advance(1)
      }
      return out
    }
    const rifle = freqs('rifle', 30)
    expect(new Set(rifle.map((f) => f.toFixed(2))).size).toBeGreaterThan(20)
    for (const f of rifle) expect(Math.abs(f / 140 - 1)).toBeLessThanOrEqual(0.06 + 1e-9)
    const move = freqs('cmdMove', 20)
    for (const f of move) expect(Math.abs(f / 3000 - 1)).toBeLessThanOrEqual(0.05 + 1e-9)
    expect(new Set(move.map((f) => f.toFixed(2))).size).toBeGreaterThan(10)
    const ui = freqs('ui', 5)
    expect(new Set(ui).size).toBe(1)
  })

  it('嘶聲類（含有音高變化的冷凍槍）低通上限不超過 7 kHz', async () => {
    const { sfx, nodes, advance } = await load()
    await import('../../src/audio/combat')
    for (const n of ['cryo', 'steam', 'freeze', 'weld', 'ventHiss', 'gas', 'suitOff']) {
      for (let i = 0; i < 5; i++) {
        const before = nodes.length
        sfx.sfx(n, 0, 0)
        const lows = nodes.slice(before).filter((x) => x.kind === 'biquad' && x.type === 'lowpass')
        expect(lows.length, n).toBeGreaterThan(0)
        for (const l of lows) expect(l.frequency.value, n).toBeLessThanOrEqual(7000)
        advance(2)
      }
    }
  })
})

describe('背景音樂（第 7 輪）', () => {
  it('8 個情境都在；每個情境的配器涵蓋所有層；頑固音型 16 格', async () => {
    vi.resetModules()
    const m = await import('../../src/audio/music')
    for (const id of ['menu', 'lobby', 'explore', 'tense', 'combat', 'alarm', 'apocalypse', 'dead'] as const) {
      const s = m.moodSpec(id)
      for (const l of m.MUSIC_LAYERS) expect(typeof s.mix[l], `${id}.${l}`).toBe('number')
      expect(s.osti, id).toHaveLength(16)
    }
    expect(m.moodSpec('explore').cutoff).toBeGreaterThanOrEqual(1400)
  })

  it('探索與戰鬥有 B 段（不同的和弦進行），照 A A B B 輪替；沒有 B 段的情境一直是 A', async () => {
    vi.resetModules()
    const m = await import('../../src/audio/music')
    for (const id of ['explore', 'combat'] as const) {
      const s = m.moodSpec(id)
      expect(s.b?.prog, id).toBeTruthy()
      expect(JSON.stringify(s.b!.prog)).not.toBe(JSON.stringify(s.prog))
      expect([0, 1, 2, 3, 4, 5, 6, 7].map((p) => m.sectionOf(s, p)).join('')).toBe('AABBAABB')
    }
    expect([0, 1, 2, 3].map((p) => m.sectionOf(m.moodSpec('menu'), p)).join('')).toBe('AAAA')
  })

  it('戰鬥的頑固音型落在 1–4 kHz', async () => {
    vi.resetModules()
    const m = await import('../../src/audio/music')
    const s = m.moodSpec('combat')
    expect(s.mix.osti).toBeGreaterThan(0)
    const hz = (midi: number) => 440 * Math.pow(2, (midi - 69) / 12)
    for (const prog of [s.prog, s.b!.prog!])
      for (const ch of prog)
        for (const o of [...s.osti, ...(s.b!.osti ?? [])]) {
          if (o === null) continue
          const f = hz(s.key + 36 + ch[0] + o)
          expect(f).toBeGreaterThan(900)
          expect(f).toBeLessThan(4200)
        }
  })
})
