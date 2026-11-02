// 生成式背景音樂：依情境（mood）切換的層次化程序音樂，全部即時合成（沒有外部素材）。
// 層：和弦鋪底（pad）、低音持續音（drone）、琶音、鐘聲旋律、低音脈衝、大鼓、鈸、低鼓。
// 換 mood 時各層音量在幾秒內交叉淡入淡出；速度與調性在下一個小節起換。
import { audioContext, busNode, noiseBuffer } from './sfx'

export type Mood = 'off' | 'menu' | 'lobby' | 'explore' | 'tense' | 'combat' | 'alarm' | 'apocalypse' | 'dead'

type Layer = 'pad' | 'drone' | 'arp' | 'bell' | 'bass' | 'kick' | 'hat' | 'tom'
const LAYERS: Layer[] = ['pad', 'drone', 'arp', 'bell', 'bass', 'kick', 'hat', 'tom']

interface MoodSpec {
  bpm: number
  /** 主音（MIDI）*/
  key: number
  /** 和弦進行：每個和弦兩小節，數字是相對主音的半音 */
  prog: number[][]
  /** 旋律用的音階（相對主音）*/
  scale: number[]
  mix: Record<Layer, number>
  /** 鋪底的低通截止頻率 */
  cutoff: number
  /** 每個八分音符出現鐘聲的機率 */
  bellProb: number
  /** 琶音：每 n 個十六分音符一顆 */
  arpEvery: number
  /** 大鼓、鈸、低鼓的十六分音符節奏（16 格，1 = 打）*/
  kick: number[]
  hat: number[]
  tom: number[]
  bass: number[]
}

const MINOR = [0, 2, 3, 5, 7, 8, 10]
const PHRYGIAN = [0, 1, 3, 5, 7, 8, 10]
const z16 = () => new Array(16).fill(0)

const MOODS: Record<Exclude<Mood, 'off'>, MoodSpec> = {
  // 主選單：開闊、寧靜的太空
  menu: {
    bpm: 62,
    key: 50,
    prog: [[0, 3, 7, 10], [-4, 0, 3, 7], [3, 7, 10, 14], [-2, 2, 5, 9]],
    scale: MINOR,
    mix: { pad: 0.9, drone: 0.45, arp: 0, bell: 0.7, bass: 0, kick: 0, hat: 0, tom: 0 },
    cutoff: 1400,
    bellProb: 0.32,
    arpEvery: 4,
    kick: z16(),
    hat: z16(),
    tom: z16(),
    bass: z16(),
  },
  // 大廳：同一組和聲，多一層輕柔的琶音
  lobby: {
    bpm: 72,
    key: 50,
    prog: [[0, 3, 7, 10], [-4, 0, 3, 7], [3, 7, 10, 14], [-2, 2, 5, 9]],
    scale: MINOR,
    mix: { pad: 0.75, drone: 0.4, arp: 0.45, bell: 0.45, bass: 0, kick: 0, hat: 0.12, tom: 0 },
    cutoff: 1700,
    bellProb: 0.18,
    arpEvery: 2,
    kick: z16(),
    hat: [0, 0, 1, 0, 0, 0, 1, 0, 0, 0, 1, 0, 0, 0, 1, 1],
    tom: z16(),
    bass: z16(),
  },
  // 探索：低沉、帶弗里吉亞色彩的不安
  explore: {
    bpm: 68,
    key: 50,
    prog: [[0, 3, 7], [1, 5, 8], [0, 3, 7], [-2, 2, 5]],
    scale: PHRYGIAN,
    mix: { pad: 0.8, drone: 0.75, arp: 0.12, bell: 0.4, bass: 0, kick: 0, hat: 0, tom: 0 },
    cutoff: 850,
    bellProb: 0.1,
    arpEvery: 4,
    kick: z16(),
    hat: z16(),
    tom: z16(),
    bass: z16(),
  },
  // 緊張：附近有威脅
  tense: {
    bpm: 84,
    key: 50,
    prog: [[0, 3, 7], [1, 5, 8], [5, 8, 12], [1, 5, 8]],
    scale: PHRYGIAN,
    mix: { pad: 0.6, drone: 0.8, arp: 0.6, bell: 0.2, bass: 0.55, kick: 0, hat: 0.3, tom: 0.2 },
    cutoff: 1300,
    bellProb: 0.06,
    arpEvery: 1,
    kick: z16(),
    hat: [0, 0, 1, 0, 0, 0, 1, 0, 0, 0, 1, 0, 0, 0, 1, 0],
    tom: [0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 1, 0],
    bass: [1, 0, 0, 1, 0, 0, 1, 0, 1, 0, 0, 1, 0, 0, 1, 0],
  },
  // 戰鬥
  combat: {
    bpm: 112,
    key: 50,
    prog: [[0, 3, 7], [-4, 0, 3], [1, 5, 8], [-1, 2, 7]],
    scale: PHRYGIAN,
    mix: { pad: 0.45, drone: 0.6, arp: 0.55, bell: 0, bass: 0.9, kick: 0.85, hat: 0.55, tom: 0.45 },
    cutoff: 2000,
    bellProb: 0,
    arpEvery: 1,
    kick: [1, 0, 0, 0, 1, 0, 0, 1, 1, 0, 0, 0, 1, 0, 0, 0],
    hat: [0, 0, 1, 0, 1, 0, 1, 1, 0, 0, 1, 0, 1, 0, 1, 1],
    tom: [0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 1, 0, 1],
    bass: [1, 0, 1, 1, 0, 1, 1, 0, 1, 0, 1, 1, 0, 1, 1, 0],
  },
  // 站點警報（被攻擊、自毀倒數）
  alarm: {
    bpm: 96,
    key: 49,
    prog: [[0, 3, 7], [1, 4, 8], [0, 3, 7], [-1, 3, 6]],
    scale: PHRYGIAN,
    mix: { pad: 0.55, drone: 0.9, arp: 0.7, bell: 0, bass: 0.7, kick: 0.5, hat: 0.4, tom: 0.3 },
    cutoff: 1600,
    bellProb: 0,
    arpEvery: 2,
    kick: [1, 0, 0, 0, 0, 0, 0, 0, 1, 0, 0, 0, 0, 0, 0, 0],
    hat: [0, 0, 1, 0, 0, 0, 1, 0, 0, 0, 1, 0, 0, 0, 1, 0],
    tom: [0, 0, 0, 0, 0, 0, 1, 0, 0, 0, 0, 0, 0, 0, 1, 0],
    bass: [1, 0, 0, 0, 1, 0, 0, 0, 1, 0, 0, 0, 1, 0, 1, 0],
  },
  // 末日：沉重、宏大
  apocalypse: {
    bpm: 92,
    key: 49,
    prog: [[0, 3, 7, 10], [1, 5, 8], [-2, 2, 5], [0, 3, 7]],
    scale: PHRYGIAN,
    mix: { pad: 1, drone: 1, arp: 0.35, bell: 0.25, bass: 0.8, kick: 0.75, hat: 0.25, tom: 0.75 },
    cutoff: 2400,
    bellProb: 0.08,
    arpEvery: 2,
    kick: [1, 0, 0, 0, 0, 0, 0, 0, 1, 0, 1, 0, 0, 0, 0, 0],
    hat: [0, 0, 0, 0, 1, 0, 0, 0, 0, 0, 0, 0, 1, 0, 0, 0],
    tom: [0, 0, 0, 0, 0, 0, 1, 0, 0, 0, 0, 0, 0, 1, 1, 1],
    bass: [1, 0, 0, 0, 0, 0, 1, 0, 1, 0, 0, 0, 0, 0, 1, 0],
  },
  // 死亡觀戰：遙遠、被濾掉高頻
  dead: {
    bpm: 54,
    key: 50,
    prog: [[0, 3, 7], [-4, 0, 3], [-2, 2, 5], [0, 3, 7]],
    scale: MINOR,
    mix: { pad: 0.75, drone: 0.35, arp: 0, bell: 0.35, bass: 0, kick: 0, hat: 0, tom: 0 },
    cutoff: 520,
    bellProb: 0.14,
    arpEvery: 4,
    kick: z16(),
    hat: z16(),
    tom: z16(),
    bass: z16(),
  },
}

const hz = (midi: number) => 440 * Math.pow(2, (midi - 69) / 12)

interface Engine {
  c: AudioContext
  out: GainNode
  wet: GainNode
  layers: Record<Layer, GainNode>
  padFilter: BiquadFilterNode
  drone: { o: OscillatorNode[]; g: GainNode } | null
  timer: ReturnType<typeof setInterval> | null
  step: number
  nextAt: number
  spec: MoodSpec
  pending: MoodSpec | null
  chord: number
  arpI: number
}

let eng: Engine | null = null
let mood: Mood = 'off'

function impulse(c: AudioContext, sec: number): AudioBuffer {
  const len = Math.floor(c.sampleRate * sec)
  const b = c.createBuffer(2, len, c.sampleRate)
  for (let ch = 0; ch < 2; ch++) {
    const d = b.getChannelData(ch)
    for (let i = 0; i < len; i++) d[i] = (Math.random() * 2 - 1) * Math.pow(1 - i / len, 2.6)
  }
  return b
}

function build(): Engine | null {
  const c = audioContext()
  const bus = busNode('music')
  if (!c || !bus) return null
  const out = c.createGain()
  out.gain.value = 0
  out.connect(bus)
  // 空間感：卷積殘響＋一點延遲回音
  const rev = c.createConvolver()
  rev.buffer = impulse(c, 3.2)
  const wet = c.createGain()
  wet.gain.value = 0.55
  wet.connect(rev).connect(out)
  const delay = c.createDelay(1)
  delay.delayTime.value = 0.42
  const fb = c.createGain()
  fb.gain.value = 0.32
  delay.connect(fb).connect(delay)
  delay.connect(wet)
  const layers = {} as Record<Layer, GainNode>
  for (const l of LAYERS) {
    const g = c.createGain()
    g.gain.value = 0
    g.connect(out)
    layers[l] = g
  }
  // 鐘聲另外送進延遲
  layers.bell.connect(delay)
  layers.pad.connect(wet)
  const padFilter = c.createBiquadFilter()
  padFilter.type = 'lowpass'
  padFilter.frequency.value = 900
  padFilter.Q.value = 0.7
  padFilter.connect(layers.pad)
  // 截止頻率慢速起伏
  const lfo = c.createOscillator()
  lfo.frequency.value = 0.06
  const lg = c.createGain()
  lg.gain.value = 260
  lfo.connect(lg).connect(padFilter.frequency)
  lfo.start()
  return { c, out, wet, layers, padFilter, drone: null, timer: null, step: 0, nextAt: 0, spec: MOODS.menu, pending: null, chord: 0, arpI: 0 }
}

function applyMix(e: Engine, spec: MoodSpec, fade: number): void {
  const t = e.c.currentTime
  for (const l of LAYERS) e.layers[l].gain.setTargetAtTime(spec.mix[l] * LAYER_GAIN[l], t, fade / 3)
  e.padFilter.frequency.setTargetAtTime(spec.cutoff, t, fade / 3)
}

/** 各層的基準音量（混音平衡）*/
const LAYER_GAIN: Record<Layer, number> = { pad: 0.16, drone: 0.12, arp: 0.07, bell: 0.09, bass: 0.13, kick: 0.32, hat: 0.05, tom: 0.16 }

function setDrone(e: Engine, key: number): void {
  const c = e.c
  const t = c.currentTime
  if (e.drone) {
    const old = e.drone
    old.g.gain.setTargetAtTime(0, t, 1.2)
    setTimeout(() => old.o.forEach((o) => o.stop()), 5000)
  }
  const g = c.createGain()
  g.gain.value = 0
  g.gain.setTargetAtTime(1, t, 1.5)
  g.connect(e.layers.drone)
  const o = [key - 24, key - 12, key - 5].map((m, i) => {
    const osc = c.createOscillator()
    osc.type = i === 2 ? 'triangle' : 'sine'
    osc.frequency.value = hz(m) * (i === 1 ? 1.003 : 1)
    const og = c.createGain()
    og.gain.value = i === 2 ? 0.25 : i === 1 ? 0.6 : 1
    osc.connect(og).connect(g)
    osc.start()
    return osc
  })
  e.drone = { o, g }
}

// ───────── 每一格十六分音符 ─────────

function padChord(e: Engine, t: number, dur: number, chord: number[], key: number): void {
  const c = e.c
  for (const iv of chord) {
    for (const det of [-6, 6]) {
      const o = c.createOscillator()
      o.type = 'sawtooth'
      o.frequency.value = hz(key + iv)
      o.detune.value = det
      const g = c.createGain()
      g.gain.setValueAtTime(0.0001, t)
      g.gain.exponentialRampToValueAtTime(0.18, t + Math.min(1.8, dur * 0.3))
      g.gain.setValueAtTime(0.18, t + dur * 0.75)
      g.gain.exponentialRampToValueAtTime(0.0001, t + dur + 1.6)
      o.connect(g).connect(e.padFilter)
      o.start(t)
      o.stop(t + dur + 1.7)
    }
  }
}

function pluck(e: Engine, t: number, midi: number, pan: number, len: number): void {
  const c = e.c
  const o = c.createOscillator()
  o.type = 'triangle'
  o.frequency.value = hz(midi)
  const f = c.createBiquadFilter()
  f.type = 'lowpass'
  f.frequency.setValueAtTime(3200, t)
  f.frequency.exponentialRampToValueAtTime(500, t + len)
  const g = c.createGain()
  g.gain.setValueAtTime(0.0001, t)
  g.gain.exponentialRampToValueAtTime(0.6, t + 0.006)
  g.gain.exponentialRampToValueAtTime(0.0001, t + len)
  const p = c.createStereoPanner()
  p.pan.value = pan
  o.connect(f).connect(g).connect(p).connect(e.layers.arp)
  o.start(t)
  o.stop(t + len + 0.05)
}

function bell(e: Engine, t: number, midi: number): void {
  const c = e.c
  const f = hz(midi)
  const car = c.createOscillator()
  car.frequency.value = f
  const mod = c.createOscillator()
  mod.frequency.value = f * 3.5
  const mg = c.createGain()
  mg.gain.setValueAtTime(f * 1.6, t)
  mg.gain.exponentialRampToValueAtTime(f * 0.05, t + 2.5)
  mod.connect(mg).connect(car.frequency)
  const g = c.createGain()
  g.gain.setValueAtTime(0.0001, t)
  g.gain.exponentialRampToValueAtTime(0.5, t + 0.01)
  g.gain.exponentialRampToValueAtTime(0.0001, t + 3)
  const p = c.createStereoPanner()
  p.pan.value = Math.random() * 1.2 - 0.6
  car.connect(g).connect(p).connect(e.layers.bell)
  car.start(t)
  mod.start(t)
  car.stop(t + 3.1)
  mod.stop(t + 3.1)
}

function bassNote(e: Engine, t: number, midi: number, len: number): void {
  const c = e.c
  const o = c.createOscillator()
  o.type = 'sawtooth'
  o.frequency.value = hz(midi)
  const f = c.createBiquadFilter()
  f.type = 'lowpass'
  f.frequency.setValueAtTime(900, t)
  f.frequency.exponentialRampToValueAtTime(160, t + len)
  f.Q.value = 4
  const g = c.createGain()
  g.gain.setValueAtTime(0.0001, t)
  g.gain.exponentialRampToValueAtTime(0.8, t + 0.008)
  g.gain.exponentialRampToValueAtTime(0.0001, t + len)
  o.connect(f).connect(g).connect(e.layers.bass)
  o.start(t)
  o.stop(t + len + 0.05)
}

function kick(e: Engine, t: number): void {
  const c = e.c
  const o = c.createOscillator()
  o.frequency.setValueAtTime(130, t)
  o.frequency.exponentialRampToValueAtTime(42, t + 0.18)
  const g = c.createGain()
  g.gain.setValueAtTime(1, t)
  g.gain.exponentialRampToValueAtTime(0.0001, t + 0.32)
  o.connect(g).connect(e.layers.kick)
  o.start(t)
  o.stop(t + 0.35)
}

function hat(e: Engine, t: number, accent: boolean): void {
  const c = e.c
  const nb = noiseBuffer()
  if (!nb) return
  const s = c.createBufferSource()
  s.buffer = nb
  const f = c.createBiquadFilter()
  f.type = 'highpass'
  f.frequency.value = 7200
  const g = c.createGain()
  g.gain.setValueAtTime(accent ? 0.9 : 0.5, t)
  g.gain.exponentialRampToValueAtTime(0.0001, t + (accent ? 0.09 : 0.04))
  s.connect(f).connect(g).connect(e.layers.hat)
  s.start(t, Math.random())
  s.stop(t + 0.12)
}

function tom(e: Engine, t: number, high: boolean): void {
  const c = e.c
  const o = c.createOscillator()
  o.frequency.setValueAtTime(high ? 150 : 95, t)
  o.frequency.exponentialRampToValueAtTime(high ? 90 : 55, t + 0.35)
  const g = c.createGain()
  g.gain.setValueAtTime(0.9, t)
  g.gain.exponentialRampToValueAtTime(0.0001, t + 0.45)
  o.connect(g).connect(e.layers.tom)
  o.start(t)
  o.stop(t + 0.5)
}

function schedStep(e: Engine, t: number): void {
  const sp = e.spec
  const s16 = 60 / sp.bpm / 4
  // 有新的 mood 等著：在下一個小節開頭切過去（重設計數，讓和弦也從頭開始）
  if (e.pending && e.step % 16 === 0) e.step = 0
  const i = e.step % 16
  // 每兩小節換和弦；mood 的速度與調性在換和弦時才換
  if (e.step % 32 === 0) {
    if (e.pending) {
      const keyChanged = e.pending.key !== e.spec.key
      e.spec = e.pending
      e.pending = null
      e.chord = 0
      if (keyChanged || !e.drone) setDrone(e, e.spec.key)
    } else e.chord = (e.chord + 1) % e.spec.prog.length
    const ch = e.spec.prog[e.chord]
    padChord(e, t, (60 / e.spec.bpm) * 8, ch, e.spec.key)
  }
  const spec = e.spec
  const chord = spec.prog[e.chord]
  const key = spec.key
  if (spec.mix.arp > 0 && i % spec.arpEvery === 0) {
    const tones = [...chord, ...chord.map((x) => x + 12)]
    const up = Math.floor(e.arpI / tones.length) % 2 === 0
    const k = e.arpI % tones.length
    const iv = up ? tones[k] : tones[tones.length - 1 - k]
    e.arpI++
    pluck(e, t, key + 12 + iv, (k % 2 ? 0.35 : -0.35), Math.min(0.5, s16 * spec.arpEvery * 1.6))
  }
  if (spec.bellProb > 0 && i % 2 === 0 && Math.random() < spec.bellProb) {
    const deg = spec.scale[Math.floor(Math.random() * spec.scale.length)]
    // 傾向落在和弦音上
    const note = Math.random() < 0.6 ? chord[Math.floor(Math.random() * chord.length)] : deg
    bell(e, t, key + 24 + note)
  }
  if (spec.mix.bass > 0 && spec.bass[i]) bassNote(e, t, key - 12 + chord[0], s16 * 1.8)
  if (spec.mix.kick > 0 && spec.kick[i]) kick(e, t)
  if (spec.mix.hat > 0 && spec.hat[i]) hat(e, t, i % 4 === 2)
  if (spec.mix.tom > 0 && spec.tom[i]) tom(e, t, i % 2 === 1)
}

function tick(): void {
  const e = eng
  if (!e || e.c.state !== 'running') return
  // 背景分頁的計時器會被節流到 1 秒一次：排程視窗拉長，避免斷音
  const ahead = typeof document !== 'undefined' && document.hidden ? 1.6 : 0.25
  if (e.nextAt < e.c.currentTime) e.nextAt = e.c.currentTime + 0.05
  while (e.nextAt < e.c.currentTime + ahead) {
    schedStep(e, e.nextAt)
    e.nextAt += 60 / e.spec.bpm / 4
    e.step++
  }
}

/** 切換背景音樂情境（重複呼叫同一個 mood 沒有作用）*/
export function setMood(m: Mood): void {
  if (m === mood) return
  mood = m
  if (!eng) eng = build()
  const e = eng
  if (!e) return
  const t = e.c.currentTime
  if (m === 'off') {
    e.out.gain.setTargetAtTime(0, t, 0.8)
    return
  }
  const spec = MOODS[m]
  e.out.gain.setTargetAtTime(1, t, 1)
  // 戰鬥與警報要快一點進來
  const fade = m === 'combat' || m === 'alarm' ? 1.5 : 4
  applyMix(e, spec, fade)
  if (!e.timer) {
    e.spec = spec
    e.step = 0
    e.nextAt = 0
    setDrone(e, spec.key)
    e.timer = setInterval(tick, 50)
  } else e.pending = spec
}

export function currentMood(): Mood {
  return mood
}
