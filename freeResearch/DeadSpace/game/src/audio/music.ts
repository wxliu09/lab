// 生成式背景音樂：依情境（mood）切換的層次化程序音樂，全部即時合成（沒有外部素材）。
// 層：和弦鋪底（pad）、低音持續音（drone）與它的泛音層（hum）、琶音、鐘聲旋律、低音脈衝、大鼓、鈸、低鼓、高音頑固音型（osti）。
// 換 mood 時各層音量在幾秒內交叉淡入淡出；速度與調性在下一個小節起換。
// 第 7 輪：每個情境有 A／B 兩段（和弦進行、節奏、配器不同），每 8 小節一輪照 A A B B 輪替，換段前一小節有過門。
import { audioContext, busNode, noiseBuffer, setDuckHook, type DuckKind } from './sfx'

export type Mood = 'off' | 'menu' | 'lobby' | 'explore' | 'tense' | 'combat' | 'alarm' | 'apocalypse' | 'dead'

type Layer = 'pad' | 'drone' | 'hum' | 'arp' | 'bell' | 'bass' | 'kick' | 'hat' | 'tom' | 'osti'
const LAYERS: Layer[] = ['pad', 'drone', 'hum', 'arp', 'bell', 'bass', 'kick', 'hat', 'tom', 'osti']

/** B 段可以換掉的部分（沒寫的沿用 A 段）*/
type Section = Partial<Pick<MoodSpec, 'prog' | 'kick' | 'hat' | 'tom' | 'bass' | 'osti' | 'bellProb' | 'arpEvery' | 'cutoff'>> & { mix?: Partial<Record<Layer, number>> }

export interface MoodSpec {
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
  /** 高音頑固音型（十六分音符；數字 = 相對和弦根音的半音，null = 休止）。音域約 1–4 kHz，筆電喇叭上也聽得到節奏 */
  osti: (number | null)[]
  /** B 段（沒有 = 只有一段）*/
  b?: Section
}

const MINOR = [0, 2, 3, 5, 7, 8, 10]
const PHRYGIAN = [0, 1, 3, 5, 7, 8, 10]
const z16 = () => new Array(16).fill(0)
const n16 = (): (number | null)[] => new Array(16).fill(null)

const MOODS: Record<Exclude<Mood, 'off'>, MoodSpec> = {
  // 主選單：開闊、寧靜的太空
  menu: {
    bpm: 62,
    key: 50,
    prog: [[0, 3, 7, 10], [-4, 0, 3, 7], [3, 7, 10, 14], [-2, 2, 5, 9]],
    scale: MINOR,
    mix: { pad: 0.9, drone: 0.45, hum: 0.25, arp: 0, bell: 0.7, bass: 0, kick: 0, hat: 0, tom: 0, osti: 0 },
    cutoff: 1400,
    bellProb: 0.32,
    arpEvery: 4,
    kick: z16(),
    hat: z16(),
    tom: z16(),
    bass: z16(),
    osti: n16(),
  },
  // 大廳：同一組和聲，多一層輕柔的琶音
  lobby: {
    bpm: 72,
    key: 50,
    prog: [[0, 3, 7, 10], [-4, 0, 3, 7], [3, 7, 10, 14], [-2, 2, 5, 9]],
    scale: MINOR,
    mix: { pad: 0.75, drone: 0.4, hum: 0.25, arp: 0.45, bell: 0.45, bass: 0, kick: 0, hat: 0.12, tom: 0, osti: 0 },
    cutoff: 1700,
    bellProb: 0.18,
    arpEvery: 2,
    kick: z16(),
    hat: [0, 0, 1, 0, 0, 0, 1, 0, 0, 0, 1, 0, 0, 0, 1, 1],
    tom: z16(),
    bass: z16(),
    osti: n16(),
  },
  // 探索：低沉、帶弗里吉亞色彩的不安
  explore: {
    bpm: 68,
    key: 50,
    prog: [[0, 3, 7], [1, 5, 8], [0, 3, 7], [-2, 2, 5]],
    scale: PHRYGIAN,
    mix: { pad: 0.8, drone: 0.75, hum: 0.8, arp: 0.12, bell: 0.4, bass: 0, kick: 0, hat: 0, tom: 0, osti: 0 },
    // 第 7 輪：850 → 1400 Hz（筆電喇叭上整首探索音樂原本只剩 −40 LUFS）
    cutoff: 1400,
    bellProb: 0.1,
    arpEvery: 4,
    kick: z16(),
    hat: z16(),
    tom: z16(),
    bass: z16(),
    osti: n16(),
    // B 段：VI–v–♭II–iv，更暗；琶音變密、鐘聲多一點
    b: {
      prog: [[-4, 0, 3], [-5, -2, 2], [1, 5, 8], [-7, -4, 0]],
      arpEvery: 2,
      bellProb: 0.16,
      cutoff: 1250,
      mix: { arp: 0.3, bell: 0.5, hum: 0.95 },
    },
  },
  // 緊張：附近有威脅
  tense: {
    bpm: 84,
    key: 50,
    prog: [[0, 3, 7], [1, 5, 8], [5, 8, 12], [1, 5, 8]],
    scale: PHRYGIAN,
    mix: { pad: 0.6, drone: 0.8, hum: 0.8, arp: 0.6, bell: 0.2, bass: 0.55, kick: 0, hat: 0.3, tom: 0.2, osti: 0.3 },
    cutoff: 1300,
    bellProb: 0.06,
    arpEvery: 1,
    kick: z16(),
    hat: [0, 0, 1, 0, 0, 0, 1, 0, 0, 0, 1, 0, 0, 0, 1, 0],
    tom: [0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 1, 0],
    bass: [1, 0, 0, 1, 0, 0, 1, 0, 1, 0, 0, 1, 0, 0, 1, 0],
    // 像時鐘一樣的稀疏高音
    osti: [0, null, null, null, null, null, 1, null, 0, null, null, null, null, null, 1, null],
    b: {
      prog: [[0, 3, 7], [-2, 2, 5], [1, 5, 8], [-4, 0, 3]],
      osti: [0, null, null, 0, null, null, 1, null, 0, null, null, 0, null, null, 1, null],
      mix: { osti: 0.4, arp: 0.45 },
    },
  },
  // 戰鬥
  combat: {
    bpm: 112,
    key: 50,
    prog: [[0, 3, 7], [-4, 0, 3], [1, 5, 8], [-1, 2, 7]],
    scale: PHRYGIAN,
    mix: { pad: 0.45, drone: 0.6, hum: 0.5, arp: 0.55, bell: 0, bass: 0.9, kick: 0.85, hat: 0.55, tom: 0.45, osti: 0.75 },
    cutoff: 2000,
    bellProb: 0,
    arpEvery: 1,
    kick: [1, 0, 0, 0, 1, 0, 0, 1, 1, 0, 0, 0, 1, 0, 0, 0],
    hat: [0, 0, 1, 0, 1, 0, 1, 1, 0, 0, 1, 0, 1, 0, 1, 1],
    tom: [0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 1, 0, 1],
    bass: [1, 0, 1, 1, 0, 1, 1, 0, 1, 0, 1, 1, 0, 1, 1, 0],
    // 第 7 輪：1–4 kHz 的斷奏頑固音型（原本戰鬥配樂幾乎全在 250 Hz 以下，筆電喇叭上只剩 −37.6）
    osti: [0, null, 0, 0, 12, null, 0, 0, 1, null, 0, 0, 12, null, 7, 0],
    // B 段：i–♭II–i–♭VII，四拍大鼓、更密的頑固音型
    b: {
      prog: [[0, 3, 7], [1, 5, 8], [0, 3, 7], [-2, 2, 5]],
      kick: [1, 0, 0, 0, 1, 0, 0, 0, 1, 0, 0, 0, 1, 0, 1, 0],
      hat: [1, 0, 1, 0, 1, 0, 1, 1, 1, 0, 1, 0, 1, 0, 1, 1],
      bass: [1, 1, 0, 1, 1, 0, 1, 0, 1, 1, 0, 1, 1, 0, 1, 1],
      osti: [0, 0, 12, 0, 3, 0, 12, 0, 1, 1, 12, 1, 7, 0, 12, 0],
      mix: { arp: 0.35, osti: 0.85, tom: 0.55 },
    },
  },
  // 站點警報（被攻擊、自毀倒數）
  alarm: {
    bpm: 96,
    key: 49,
    prog: [[0, 3, 7], [1, 4, 8], [0, 3, 7], [-1, 3, 6]],
    scale: PHRYGIAN,
    mix: { pad: 0.55, drone: 0.9, hum: 0.8, arp: 0.7, bell: 0, bass: 0.7, kick: 0.5, hat: 0.4, tom: 0.3, osti: 0.45 },
    cutoff: 1600,
    bellProb: 0,
    arpEvery: 2,
    kick: [1, 0, 0, 0, 0, 0, 0, 0, 1, 0, 0, 0, 0, 0, 0, 0],
    hat: [0, 0, 1, 0, 0, 0, 1, 0, 0, 0, 1, 0, 0, 0, 1, 0],
    tom: [0, 0, 0, 0, 0, 0, 1, 0, 0, 0, 0, 0, 0, 0, 1, 0],
    bass: [1, 0, 0, 0, 1, 0, 0, 0, 1, 0, 0, 0, 1, 0, 1, 0],
    // 警報般一高一低
    osti: [0, null, null, null, 1, null, null, null, 0, null, null, null, 1, null, null, null],
    b: { osti: [0, null, 0, null, 1, null, 1, null, 0, null, 0, null, 1, null, 1, null], mix: { osti: 0.55 } },
  },
  // 末日：沉重、宏大
  apocalypse: {
    bpm: 92,
    key: 49,
    prog: [[0, 3, 7, 10], [1, 5, 8], [-2, 2, 5], [0, 3, 7]],
    scale: PHRYGIAN,
    mix: { pad: 1, drone: 1, hum: 0.9, arp: 0.35, bell: 0.25, bass: 0.8, kick: 0.75, hat: 0.25, tom: 0.75, osti: 0.35 },
    cutoff: 2400,
    bellProb: 0.08,
    arpEvery: 2,
    kick: [1, 0, 0, 0, 0, 0, 0, 0, 1, 0, 1, 0, 0, 0, 0, 0],
    hat: [0, 0, 0, 0, 1, 0, 0, 0, 0, 0, 0, 0, 1, 0, 0, 0],
    tom: [0, 0, 0, 0, 0, 0, 1, 0, 0, 0, 0, 0, 0, 1, 1, 1],
    bass: [1, 0, 0, 0, 0, 0, 1, 0, 1, 0, 0, 0, 0, 0, 1, 0],
    osti: [0, null, null, 0, null, null, 0, null, 12, null, null, 12, null, null, 7, null],
  },
  // 死亡觀戰：遙遠、被濾掉高頻
  dead: {
    bpm: 54,
    key: 50,
    prog: [[0, 3, 7], [-4, 0, 3], [-2, 2, 5], [0, 3, 7]],
    scale: MINOR,
    mix: { pad: 0.75, drone: 0.35, hum: 0.2, arp: 0, bell: 0.35, bass: 0, kick: 0, hat: 0, tom: 0, osti: 0 },
    cutoff: 520,
    bellProb: 0.14,
    arpEvery: 4,
    kick: z16(),
    hat: z16(),
    tom: z16(),
    bass: z16(),
    osti: n16(),
  },
}

const hz = (midi: number) => 440 * Math.pow(2, (midi - 69) / 12)

/** 測試用：某個情境的設定 */
export function moodSpec(m: Exclude<Mood, 'off'>): Readonly<MoodSpec> {
  return MOODS[m]
}

/** 測試用：所有層的名稱 */
export const MUSIC_LAYERS: readonly Layer[] = LAYERS

/**
 * 側鏈式壓低（第 7 輪）：原本戰鬥情境一進來就把整條音樂固定壓 4 dB，結果戰鬥配樂反而比探索小聲（−25.5 vs −22.1）。
 * 改成跟著「實際的槍聲、爆炸」走：附近每一發都把音樂往下壓（依距離衰減，最多 4 dB），停火 0.3 秒後 1.2 秒放回。
 * 自己被打：另一個節點再壓 6 dB、0.25 秒（受傷聲清楚，不跟槍聲的壓低疊在同一個參數上）。
 */
export const MUSIC_DUCK = { db: -4, attack: 0.04, hold: 0.3, release: 1.2, hurtDb: -6, hurtHold: 0.25, hurtRelease: 0.2 }

interface Engine {
  c: AudioContext
  out: GainNode
  /** 槍聲、爆炸的側鏈壓低（MUSIC_DUCK）*/
  duck: GainNode
  /** 自己被打時的短暫壓低 */
  hit: GainNode
  /** 目前側鏈壓低的深度（dB）與保持到什麼時候 */
  duckDb: number
  duckUntil: number
  wet: GainNode
  layers: Record<Layer, GainNode>
  padFilter: BiquadFilterNode
  drone: { o: OscillatorNode[]; g: GainNode[] } | null
  timer: ReturnType<typeof setInterval> | null
  step: number
  nextAt: number
  spec: MoodSpec
  /** 目前這一段實際用的設定（A 段 = spec，B 段 = spec 疊上 spec.b）*/
  cur: MoodSpec
  pending: MoodSpec | null
  chord: number
  arpI: number
  /** 這個情境開始後跑完幾輪和弦進行（決定 A／B 段）*/
  pass: number
  /** 這一小節是換段前的過門 */
  fill: boolean
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

/** 第 n 輪和弦進行是 A 段還是 B 段：A A B B 輪替（沒有 B 段的情境永遠是 A）*/
export function sectionOf(spec: { b?: unknown }, pass: number): 'A' | 'B' {
  return spec.b && pass % 4 >= 2 ? 'B' : 'A'
}

function sectionSpec(spec: MoodSpec, sec: 'A' | 'B'): MoodSpec {
  if (sec === 'A' || !spec.b) return spec
  const { mix, ...rest } = spec.b
  return { ...spec, ...rest, mix: { ...spec.mix, ...mix } }
}

function build(): Engine | null {
  const c = audioContext()
  const bus = busNode('music')
  if (!c || !bus) return null
  const out = c.createGain()
  out.gain.value = 0
  const duck = c.createGain()
  duck.gain.value = 1
  const hit = c.createGain()
  hit.gain.value = 1
  out.connect(duck).connect(hit).connect(bus)
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
  // 鐘聲、頑固音型另外送進延遲
  layers.bell.connect(delay)
  layers.osti.connect(delay)
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
  const e: Engine = { c, out, duck, hit, duckDb: 0, duckUntil: 0, wet, layers, padFilter, drone: null, timer: null, step: 0, nextAt: 0, spec: MOODS.menu, cur: MOODS.menu, pending: null, chord: 0, arpI: 0, pass: 0, fill: false }
  setDuckHook(onDuck)
  return e
}

/** 槍聲、爆炸、自己受傷 → 壓低音樂（sfx.ts 在播放時呼叫）*/
function onDuck(kind: DuckKind, k: number): void {
  const e = eng
  if (!e) return
  const t = e.c.currentTime
  if (kind === 'hurt') {
    const p = e.hit.gain
    p.cancelScheduledValues(t)
    p.setTargetAtTime(Math.pow(10, MUSIC_DUCK.hurtDb / 20), t, 0.01)
    p.setTargetAtTime(1, t + MUSIC_DUCK.hurtHold, MUSIC_DUCK.hurtRelease / 3)
    return
  }
  const db = MUSIC_DUCK.db * Math.max(0, Math.min(1, k))
  // 很遠的槍聲不壓
  if (db > -0.5) return
  const depth = t < e.duckUntil ? Math.min(e.duckDb, db) : db
  e.duckDb = depth
  e.duckUntil = t + MUSIC_DUCK.hold
  const p = e.duck.gain
  p.cancelScheduledValues(t)
  p.setTargetAtTime(Math.pow(10, depth / 20), t, MUSIC_DUCK.attack / 3)
  p.setTargetAtTime(1, e.duckUntil, MUSIC_DUCK.release / 3)
}

function applyMix(e: Engine, spec: MoodSpec, fade: number): void {
  const t = e.c.currentTime
  for (const l of LAYERS) e.layers[l].gain.setTargetAtTime(spec.mix[l] * LAYER_GAIN[l], t, fade / 3)
  e.padFilter.frequency.setTargetAtTime(spec.cutoff, t, fade / 3)
}

/** 各層的基準音量（混音平衡）*/
const LAYER_GAIN: Record<Layer, number> = { pad: 0.16, drone: 0.1, hum: 0.18, arp: 0.07, bell: 0.09, bass: 0.13, kick: 0.32, hat: 0.05, tom: 0.16, osti: 0.4 }

/** tanh 飽和曲線（WaveShaper）：k 越大越飽和；這裡用溫和的值，只是讓泛音層多一點顆粒感 */
let tanhCache: { k: number; curve: Float32Array<ArrayBuffer> } | null = null
function tanhCurve(k: number): Float32Array<ArrayBuffer> {
  if (tanhCache && tanhCache.k === k) return tanhCache.curve
  const n = 1024
  const curve = new Float32Array(new ArrayBuffer(n * 4))
  for (let i = 0; i < n; i++) {
    const x = (i / (n - 1)) * 2 - 1
    curve[i] = Math.tanh(k * x) / Math.tanh(k)
  }
  tanhCache = { k, curve }
  return curve
}

function setDrone(e: Engine, key: number): void {
  const c = e.c
  const t = c.currentTime
  if (e.drone) {
    const old = e.drone
    for (const g of old.g) g.gain.setTargetAtTime(0, t, 1.2)
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
  // 泛音層（第 7 輪）：drone 原本是 37／73／110 Hz 的正弦，筆電喇叭（約 200 Hz 以下出不來）上整條消失。
  // 高八度與五度的鋸齒波經過溫和的 tanh 飽和，再濾出約 180 Hz–1 kHz：小喇叭上聽得到低沉的「嗡」，
  // 耳機上仍是暗的（低通很低、慢慢呼吸），不會變亮。
  const hg = c.createGain()
  hg.gain.value = 0
  hg.gain.setTargetAtTime(1, t, 1.5)
  hg.connect(e.layers.hum)
  const drive = c.createGain()
  drive.gain.value = 0.55
  const sat = c.createWaveShaper()
  sat.curve = tanhCurve(2.2)
  sat.oversample = '2x'
  const hp = c.createBiquadFilter()
  hp.type = 'highpass'
  hp.frequency.value = 170
  hp.Q.value = 0.7
  const lp = c.createBiquadFilter()
  lp.type = 'lowpass'
  lp.frequency.value = 850
  lp.Q.value = 0.9
  const breath = c.createGain()
  breath.gain.value = 0.75
  drive.connect(sat).connect(hp).connect(lp).connect(breath).connect(hg)
  for (const [m, det, a] of [
    [key, -5, 0.6],
    [key, 6, 0.5],
    [key + 7, 3, 0.35],
  ] as const) {
    const osc = c.createOscillator()
    osc.type = 'sawtooth'
    osc.frequency.value = hz(m)
    osc.detune.value = det
    const og = c.createGain()
    og.gain.value = a
    osc.connect(og).connect(drive)
    osc.start()
    o.push(osc)
  }
  // 慢速的呼吸：低通與音量一起起伏（約 11 秒一輪）
  const l1 = c.createOscillator()
  l1.frequency.value = 0.09
  const l1g = c.createGain()
  l1g.gain.value = 300
  l1.connect(l1g).connect(lp.frequency)
  const l2g = c.createGain()
  l2g.gain.value = 0.25
  l1.connect(l2g).connect(breath.gain)
  l1.start()
  o.push(l1)
  e.drone = { o, g: [g, hg] }
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

/** 頑固音型的一個音：鋸齒波 → 帶通（約 2 倍基頻）→ 很短的包絡（斷奏）*/
function ostiNote(e: Engine, t: number, midi: number, accent: boolean, pan: number): void {
  const c = e.c
  const f0 = hz(midi)
  const o = c.createOscillator()
  o.type = 'sawtooth'
  o.frequency.value = f0
  const f = c.createBiquadFilter()
  f.type = 'bandpass'
  f.frequency.value = Math.min(4200, f0 * 2)
  f.Q.value = 1.1
  const len = accent ? 0.12 : 0.085
  const a = accent ? 1 : 0.6
  const g = c.createGain()
  g.gain.setValueAtTime(0.0001, t)
  g.gain.exponentialRampToValueAtTime(a, t + 0.003)
  g.gain.setValueAtTime(a, t + 0.018)
  g.gain.exponentialRampToValueAtTime(0.0001, t + len)
  const p = c.createStereoPanner()
  p.pan.value = pan
  o.connect(f).connect(g).connect(p).connect(e.layers.osti)
  o.start(t)
  o.stop(t + len + 0.03)
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

/** 換段的過門：一小節由暗到亮的雜訊上揚（送進鋪底層與殘響）*/
function riser(e: Engine, t: number, dur: number): void {
  const c = e.c
  const nb = noiseBuffer()
  if (!nb) return
  const s = c.createBufferSource()
  s.buffer = nb
  s.loop = true
  const f = c.createBiquadFilter()
  f.type = 'bandpass'
  f.Q.value = 1.4
  f.frequency.setValueAtTime(400, t)
  f.frequency.exponentialRampToValueAtTime(3200, t + dur)
  const g = c.createGain()
  g.gain.setValueAtTime(0.0001, t)
  g.gain.exponentialRampToValueAtTime(0.22, t + dur * 0.95)
  g.gain.exponentialRampToValueAtTime(0.0001, t + dur + 0.08)
  s.connect(f).connect(g).connect(e.layers.pad)
  s.start(t, Math.random())
  s.stop(t + dur + 0.1)
}

function schedStep(e: Engine, t: number): void {
  const s16 = 60 / e.spec.bpm / 4
  // 有新的 mood 等著：在下一個小節開頭切過去（重設計數，讓和弦也從頭開始）
  if (e.pending && e.step % 16 === 0) e.step = 0
  const i = e.step % 16
  // 每兩小節換和弦；mood 的速度與調性在換和弦時才換
  if (e.step % 32 === 0) {
    if (e.pending) {
      const keyChanged = e.pending.key !== e.spec.key
      e.spec = e.pending
      e.cur = e.spec
      e.pending = null
      e.chord = 0
      e.pass = 0
      if (keyChanged || !e.drone) setDrone(e, e.spec.key)
    } else {
      e.chord = (e.chord + 1) % e.cur.prog.length
      if (e.chord === 0) {
        // 跑完一輪和弦進行：照 A A B B 換段
        e.pass++
        const next = sectionSpec(e.spec, sectionOf(e.spec, e.pass))
        if (next !== e.cur) {
          e.cur = next
          applyMix(e, next, 3)
        }
      }
    }
    e.fill = false
    padChord(e, t, (60 / e.spec.bpm) * 8, e.cur.prog[e.chord], e.spec.key)
  }
  // 換段前的最後一小節：過門（有鼓的情境加一串低鼓，所有情境都有一個雜訊上揚）
  if (e.step % 32 === 16 && !e.pending && e.chord === e.cur.prog.length - 1 && sectionOf(e.spec, e.pass + 1) !== sectionOf(e.spec, e.pass)) {
    e.fill = true
    riser(e, t, s16 * 16)
  }
  const spec = e.cur
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
  const os = spec.osti[i]
  if (spec.mix.osti > 0 && os !== null && os !== undefined) ostiNote(e, t, key + 36 + chord[0] + os, i % 4 === 0, i % 2 ? 0.25 : -0.25)
  if (spec.mix.bass > 0 && spec.bass[i]) bassNote(e, t, key - 12 + chord[0], s16 * 1.8)
  if (spec.mix.kick > 0 && spec.kick[i]) kick(e, t)
  if (spec.mix.hat > 0 && spec.hat[i]) hat(e, t, i % 4 === 2)
  if (spec.mix.tom > 0 && (spec.tom[i] || (e.fill && i >= 12))) tom(e, t, i % 2 === 1)
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
  // 音樂引擎還沒建起來（使用者手勢之前沒有 AudioContext，sfx.ts）：同一個情境也要重試，手勢後音訊導演的下一次呼叫就會開始播
  if (m === mood && eng) return
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
    e.cur = spec
    e.step = 0
    e.nextAt = 0
    e.pass = 0
    setDrone(e, spec.key)
    e.timer = setInterval(tick, 50)
  } else e.pending = spec
}

export function currentMood(): Mood {
  return mood
}

/** 測試與量測：目前側鏈壓低節點的增益（沒建音樂引擎 = 1）*/
export function musicDuckLevel(): number {
  return eng?.duck.gain.value ?? 1
}
