// 戰鬥音效：命中音（武器類型 × 目標材質）、受傷／死亡叫聲、怪物待機叫聲、近戰揮擊、施法充能。
// 全部用 Web Audio 即時合成，不使用外部素材。
//
// 資訊隔離：材質與叫聲種類只看快照裡「看起來的外觀」（d、fl），音色只由外觀與顯示顏色（c）決定，
// 不用實體 id——偽裝會換 id，若音色跟著 id 走，偽裝者一開口就會露餡。
import { EntFlag } from '../shared/protocol/messages'
import '../shared/content/index'
import { UNITS, isZoneObject } from '../shared/content/registry'
import { audioContext, fm, noise, noiseBuffer, playSynth, regSound, swell, ticks, tone } from './sfx'

// ───────── 分類 ─────────

export type Family = 'human' | 'xeno' | 'mutant' | 'bug' | 'goo' | 'critter' | 'beast' | 'machine'
export type Mat = 'flesh' | 'carapace' | 'goo' | 'metal' | 'shield' | 'stone'
/** 武器的打擊類型 */
export type Hit = 'bullet' | 'energy' | 'slash' | 'blunt' | 'fire'

const BUGS = /carcinid|spinner|blightcrawler|weaver|parasite|arcflayer/
const GOO = /slime|prion|egg|cocoon|sludge/
const SMALL = /slugling|chicken|frog|rabbit|anomaly/
const MACHINE = /^(android\.|drone\.|rig\.|fleet\.|ship|item:)|sentry|pacifier|defenseDrone|turret/

/** 依外觀 def 判斷叫聲種類；null = 不會叫（物品、建築、無形體、區域物件）*/
export function familyOf(d: string | undefined): Family | null {
  if (!d || d.startsWith('item:') || d === 'creature.entity') return null
  // 酸池、火海、雷暴、輻射區、電漿球、毒雲這類區域物件的 id 也是 rig.*，不能當成機械播待機嗶聲
  if (isZoneObject(UNITS.get(d))) return null
  if (MACHINE.test(d)) return 'machine'
  if (d.startsWith('xeno.')) return d === 'xeno.human' ? 'human' : GOO.test(d) ? 'goo' : BUGS.test(d) ? 'bug' : 'xeno'
  if (d.startsWith('mut.')) return GOO.test(d) ? 'goo' : BUGS.test(d) ? 'bug' : 'mutant'
  if (d.startsWith('creature.')) return SMALL.test(d) ? 'critter' : 'beast'
  if (d.startsWith('npc.slug')) return 'critter'
  if (d.startsWith('npc.') || d.startsWith('pirate.') || d.startsWith('suit.') || d === 'personnel') return 'human'
  return null
}

/** 被打中時的材質 */
export function materialOf(s: { d?: string; fl?: number } | undefined): Mat {
  if (!s) return 'flesh'
  const fl = s.fl ?? 0
  if (fl & EntFlag.Petrified) return 'stone'
  if (fl & (EntFlag.Shielded | EntFlag.Invuln)) return 'shield'
  const d = s.d ?? ''
  if (fl & EntFlag.Interactable && !d.startsWith('creature.')) return 'metal'
  if (d.startsWith('suit.')) return 'metal'
  const fam = familyOf(d)
  if (fam === 'machine') return 'metal'
  if (fam === 'xeno' || fam === 'bug') return 'carapace'
  if (fam === 'goo') return 'goo'
  return 'flesh'
}

/** 攻擊特效樣式 → 打擊類型 */
export function hitKind(style: string | undefined, shape?: string): Hit {
  switch (style) {
    case 'claw':
      return 'slash'
    case 'lob':
      return shape === 'flask' ? 'energy' : 'blunt'
    case 'flame':
    case 'fireball':
      return 'fire'
    case 'orb':
    case 'bolt':
    case 'beam':
    case 'arc':
    case 'chrono':
    case 'wave':
    case 'spore':
      return 'energy'
    default:
      return 'bullet'
  }
}

// ───────── 合成工具 ─────────

/** 由外觀與顏色得到穩定的音高倍率（同一個人每次叫起來都一樣）*/
export function voicePitch(d: string | undefined, color: number | undefined): number {
  const key = `${d ?? ''}#${color ?? -1}`
  let h = 2166136261
  for (let i = 0; i < key.length; i++) h = Math.imul(h ^ key.charCodeAt(i), 16777619)
  return 0.84 + ((h >>> 0) % 1000) / 1000 * 0.36
}

interface VoxOpt {
  type?: OscillatorType
  /** 粗糙度：振幅調變頻率（Hz）與深度 */
  rough?: number
  roughDepth?: number
  /** 氣音比例 */
  breath?: number
  q?: number
  /** 起音時間 */
  att?: number
  /** 抖音 Hz */
  vib?: number
  vibDepth?: number
  /** 音高包絡的峰值位置（0–1）*/
  peakAt?: number
}

/**
 * 共振峰人聲：鋸齒波聲源 → 數個帶通（母音的 F1/F2/F3）→ 包絡。
 * f0 → f0*1.12（peakAt）→ f1 的音高走向，聽起來像「呃！」「啊——」。
 */
function vox(d: AudioNode, t0: number, dur: number, f0: number, f1: number, formants: [number, number][], amp: number, o: VoxOpt = {}): void {
  const c = audioContext()
  if (!c) return
  const src = c.createOscillator()
  src.type = o.type ?? 'sawtooth'
  const pk = o.peakAt ?? 0.2
  src.frequency.setValueAtTime(f0, t0)
  src.frequency.exponentialRampToValueAtTime(f0 * 1.12, t0 + dur * pk + 0.005)
  src.frequency.exponentialRampToValueAtTime(Math.max(20, f1), t0 + dur)
  const stop = t0 + dur + 0.05
  if (o.vib) {
    const lfo = c.createOscillator()
    lfo.frequency.value = o.vib
    const lg = c.createGain()
    lg.gain.value = f0 * (o.vibDepth ?? 0.03)
    lfo.connect(lg).connect(src.frequency)
    lfo.start(t0)
    lfo.stop(stop)
  }
  const env = c.createGain()
  env.gain.setValueAtTime(0.0001, t0)
  env.gain.exponentialRampToValueAtTime(amp, t0 + (o.att ?? 0.02))
  env.gain.setValueAtTime(amp, t0 + dur * 0.55)
  env.gain.exponentialRampToValueAtTime(0.0001, t0 + dur)
  let tail: AudioNode = env
  if (o.rough) {
    const am = c.createGain()
    am.gain.value = 1 - (o.roughDepth ?? 0.5) / 2
    const lfo = c.createOscillator()
    lfo.type = 'square'
    lfo.frequency.value = o.rough
    const lg = c.createGain()
    lg.gain.value = (o.roughDepth ?? 0.5) / 2
    lfo.connect(lg).connect(am.gain)
    lfo.start(t0)
    lfo.stop(stop)
    env.connect(am)
    tail = am
  }
  tail.connect(d)
  const q = o.q ?? 8
  // 氣音：同一組共振峰濾過的雜訊，讓聲音不那麼像電子合成
  const nb = noiseBuffer()
  let br: AudioBufferSourceNode | null = null
  let brGain: GainNode | null = null
  if (o.breath && nb) {
    br = c.createBufferSource()
    br.buffer = nb
    brGain = c.createGain()
    brGain.gain.value = o.breath * 4
    br.connect(brGain)
  }
  for (const [f, g] of formants) {
    const bp = c.createBiquadFilter()
    bp.type = 'bandpass'
    bp.frequency.value = f
    bp.Q.value = q
    const fg = c.createGain()
    fg.gain.value = g
    src.connect(bp).connect(fg).connect(env)
    brGain?.connect(bp)
  }
  src.start(t0)
  src.stop(stop)
  if (br) {
    br.start(t0, Math.random() * 0.5)
    br.stop(stop)
  }
}

// 母音共振峰（男聲基準，音高倍率同時微調共振峰，避免每個人都一樣）
const V_UH: [number, number][] = [
  [640, 1],
  [1190, 0.55],
  [2390, 0.2],
]
const V_AH: [number, number][] = [
  [760, 1],
  [1250, 0.6],
  [2600, 0.22],
]
const V_OH: [number, number][] = [
  [520, 1],
  [900, 0.5],
  [2400, 0.15],
]
const shift = (v: [number, number][], k: number) => v.map(([f, g]) => [f * (0.9 + (k - 0.84) * 0.5), g] as [number, number])
const rnd = (a: number, b: number) => a + Math.random() * (b - a)

/** 播放次數（e2e 驗證真的有接上）*/
export const combatStats = { hits: 0, barks: 0 }

// ───────── 命中音 ─────────

function hitFlesh(d: AudioNode, now: number, k = 1): void {
  noise(d, now, 0.09, 1100 * k, 220, 1.2, 'lowpass', 0.75)
  tone(d, now, 0.07, 150 * k, 70, 'sine', 0.35)
  noise(d, now + 0.015, 0.06, 2600, 900, 3, 'bandpass', 0.18)
}
function hitMetal(d: AudioNode, now: number): void {
  fm(d, now, 0.18, rnd(900, 1500), 1.41, 2.4, 0.24)
  noise(d, now, 0.04, 5200, 2600, 2, 'bandpass', 0.5)
  if (Math.random() < 0.3) tone(d, now + 0.01, 0.16, rnd(2600, 3400), rnd(1500, 1900), 'sine', 0.05)
}
function hitCarapace(d: AudioNode, now: number): void {
  ticks(d, now, 0.05, 4, 2200, 0.7, 2)
  noise(d, now, 0.12, 900, 260, 2.5, 'bandpass', 0.7)
  tone(d, now, 0.06, 220, 120, 'triangle', 0.2)
}
function hitGoo(d: AudioNode, now: number): void {
  noise(d, now, 0.16, 700, 180, 3, 'bandpass', 0.6)
  tone(d, now, 0.12, 240, 90, 'sine', 0.25)
}
function hitShield(d: AudioNode, now: number): void {
  fm(d, now, 0.28, rnd(700, 900), 2.01, 1.6, 0.22)
  noise(d, now, 0.12, 6000, 3000, 1.5, 'bandpass', 0.22)
}
function hitStone(d: AudioNode, now: number): void {
  ticks(d, now, 0.08, 6, 1800, 0.75, 1.5)
  noise(d, now, 0.12, 900, 200, 1, 'lowpass', 0.7)
}

const MAT_FN: Record<Mat, (d: AudioNode, now: number) => void> = {
  flesh: hitFlesh,
  carapace: hitCarapace,
  goo: hitGoo,
  metal: hitMetal,
  shield: hitShield,
  stone: hitStone,
}

/** 命中：先放打擊類型的「質感層」，再疊目標材質 */
export function playHit(kind: Hit, mat: Mat, x: number, y: number): void {
  const played = playSynth(`hit:${kind}:${mat}`, x, y, 1.3, (d, now) => {
    switch (kind) {
      case 'slash':
        // 撕裂：短促高頻的劃開聲＋濕潤的肉聲
        noise(d, now, 0.07, 2600, 5200, 2.5, 'bandpass', 0.45)
        if (mat === 'flesh' || mat === 'goo') noise(d, now + 0.03, 0.14, 1400, 400, 2.2, 'bandpass', 0.4)
        break
      case 'energy':
        noise(d, now, 0.14, 7000, 2500, 0.8, 'highpass', 0.14)
        tone(d, now, 0.12, rnd(700, 900), 180, 'sine', 0.1)
        break
      case 'fire':
        noise(d, now, 0.22, 1400, 400, 0.6, 'bandpass', 0.25)
        break
      case 'blunt':
        tone(d, now, 0.1, 120, 50, 'sine', 0.3)
        noise(d, now, 0.08, 800, 150, 1, 'lowpass', 0.3)
        break
      case 'bullet':
        break
    }
    MAT_FN[mat](d, now + (kind === 'slash' ? 0.025 : 0))
  }, 0.035)
  if (played) combatStats.hits++
}

/** 近戰揮擊（命中前的破風聲）*/
export function playSwing(x: number, y: number, big = false): void {
  playSynth('swing', x, y, 1.6, (d, now) => {
    noise(d, now, big ? 0.22 : 0.14, big ? 300 : 500, big ? 1400 : 2400, 1.8, 'bandpass', big ? 0.5 : 0.4)
  }, 0.05)
}

// ───────── 叫聲 ─────────

export type BarkKind = 'pain' | 'death' | 'idle'

/** 受傷／死亡／待機叫聲。pitch 由 voicePitch() 取得；big = 重傷 */
/** 各族群叫聲的混音增益 [痛叫, 死亡, 待機]（依實測峰值調整：痛叫約 0.08–0.11、死亡約 0.12–0.17、待機約 0.03–0.04）*/
const BARK_GAIN: Record<Family, [number, number, number]> = {
  human: [3.6, 2.1, 1.5],
  xeno: [2.1, 3.6, 3.0],
  mutant: [2.8, 1.95, 1.5],
  bug: [3.2, 4.7, 2.7],
  goo: [2.1, 3.1, 2.0],
  critter: [2.1, 2.6, 2.3],
  beast: [2.7, 2.6, 3.4],
  machine: [3.4, 2.6, 4.0],
}

export function playBark(fam: Family, kind: BarkKind, x: number, y: number, pitch = 1, big = false): boolean {
  const gain = BARK_GAIN[fam][kind === 'pain' ? 0 : kind === 'death' ? 1 : 2]
  const played = playSynth(`bark:${fam}:${kind}:${Math.round(pitch * 20)}`, x, y, gain, (d, now) => BARK[fam](d, now, kind, pitch, big), kind === 'pain' ? 0.18 : 0.08)
  if (played) combatStats.barks++
  return played
}

type BarkFn = (d: AudioNode, now: number, kind: BarkKind, k: number, big: boolean) => void

const BARK: Record<Family, BarkFn> = {
  human(d, now, kind, k, big) {
    const f0 = 118 * k
    if (kind === 'pain') {
      const dur = big ? rnd(0.3, 0.38) : rnd(0.16, 0.22)
      vox(d, now, dur, f0 * rnd(1.05, 1.2), f0 * 0.82, shift(Math.random() < 0.5 ? V_UH : V_AH, k), big ? 0.5 : 0.38, { att: 0.012, peakAt: 0.15, breath: 0.2 })
      noise(d, now, dur * 0.6, 1500, 700, 1.5, 'bandpass', 0.06)
    } else if (kind === 'death') {
      vox(d, now, 0.75, f0 * 1.25, f0 * 0.6, shift(V_AH, k), 0.5, { att: 0.03, peakAt: 0.12, vib: 7, vibDepth: 0.04 })
      noise(d, now + 0.5, 0.5, 900, 300, 1, 'bandpass', 0.06)
      // 倒地
      tone(d, now + 0.62, 0.14, 95, 45, 'sine', 0.35)
      noise(d, now + 0.62, 0.16, 600, 120, 1, 'lowpass', 0.35)
    } else {
      vox(d, now, 0.25, f0, f0 * 0.95, shift(V_OH, k), 0.18)
    }
  },
  xeno(d, now, kind, k, big) {
    const f0 = 620 * k
    if (kind === 'pain') {
      const dur = big ? 0.42 : 0.26
      fm(d, now, dur, f0 * rnd(1.1, 1.4), 1.41, big ? 4 : 3, 0.16, 'sawtooth')
      noise(d, now, dur, 3200, 1800, 3, 'bandpass', 0.35)
      ticks(d, now, dur * 0.6, 4, 2400, 0.25, 3)
    } else if (kind === 'death') {
      vox(d, now, 1.1, f0 * 1.6, f0 * 0.35, [
        [1400 * k, 1],
        [2700 * k, 0.6],
        [4200, 0.3],
      ], 0.3, { att: 0.02, peakAt: 0.1, rough: 31, roughDepth: 0.6, vib: 11, vibDepth: 0.06, q: 5 })
      noise(d, now, 1.1, 4200, 1200, 2, 'bandpass', 0.25)
      noise(d, now + 0.7, 0.4, 600, 150, 2, 'bandpass', 0.45)
    } else {
      // 低沉的嘶聲＋喀喀聲
      noise(d, now, 0.9, 2600 * k, 3800, 4, 'bandpass', 0.18)
      ticks(d, now + 0.2, 0.5, 6, 1800 * k, 0.2, 4)
      swell(d, now, 0.8, 140 * k, 110 * k, 'sawtooth', 0.04, 0.4)
    }
  },
  mutant(d, now, kind, k, big) {
    const f0 = 72 * k
    if (kind === 'pain') {
      const dur = big ? 0.5 : 0.32
      vox(d, now, dur, f0 * 1.3, f0 * 0.9, shift(V_OH, k * 0.8), big ? 0.55 : 0.42, { rough: 23, roughDepth: 0.7, q: 5, att: 0.02 })
      noise(d, now, dur, 600, 250, 1.5, 'bandpass', 0.18)
    } else if (kind === 'death') {
      vox(d, now, 1.3, f0 * 1.5, f0 * 0.55, shift(V_AH, k * 0.75), 0.55, { rough: 19, roughDepth: 0.75, q: 4, att: 0.04, peakAt: 0.15 })
      noise(d, now + 0.9, 0.5, 500, 120, 1.5, 'bandpass', 0.4)
      tone(d, now + 1.0, 0.25, 70, 32, 'sine', 0.45)
    } else {
      vox(d, now, 1.0, f0, f0 * 0.85, shift(V_OH, k * 0.7), 0.3, { rough: 17, roughDepth: 0.8, q: 4, att: 0.25, peakAt: 0.4 })
    }
  },
  bug(d, now, kind, k, big) {
    if (kind === 'pain') {
      ticks(d, now, big ? 0.22 : 0.14, big ? 10 : 6, 3400 * k, 0.45, 5)
      tone(d, now, 0.1, 2600 * k, 1800 * k, 'square', 0.04)
    } else if (kind === 'death') {
      ticks(d, now, 0.5, 18, 3000 * k, 0.45, 4)
      tone(d, now, 0.5, 2400 * k, 500, 'square', 0.05)
      noise(d, now + 0.35, 0.2, 900, 300, 2.5, 'bandpass', 0.45)
    } else {
      for (let i = 0; i < 3; i++) ticks(d, now + i * 0.13, 0.08, 5, 3800 * k, 0.22, 6)
    }
  },
  goo(d, now, kind, k, big) {
    if (kind === 'pain') {
      noise(d, now, big ? 0.3 : 0.2, 500 * k, 180, 4, 'bandpass', 0.5)
      tone(d, now, 0.18, 200 * k, 110, 'sine', 0.2)
    } else if (kind === 'death') {
      for (let i = 0; i < 4; i++) {
        noise(d, now + i * 0.09, 0.14, rnd(400, 900), 150, 4, 'bandpass', 0.45)
        tone(d, now + i * 0.09, 0.1, rnd(180, 320), 90, 'sine', 0.15)
      }
    } else {
      // 咕嚕咕嚕的氣泡
      for (let i = 0; i < 3; i++) tone(d, now + i * rnd(0.12, 0.2), 0.07, rnd(260, 420) * k, rnd(500, 700), 'sine', 0.08)
    }
  },
  critter(d, now, kind, k) {
    const f = 1500 * k
    if (kind === 'death') {
      tone(d, now, 0.35, f * 1.3, f * 0.5, 'triangle', 0.18)
      noise(d, now + 0.25, 0.1, 700, 200, 2, 'bandpass', 0.3)
    } else {
      tone(d, now, kind === 'idle' ? 0.08 : 0.12, f, f * 1.35, 'triangle', kind === 'idle' ? 0.06 : 0.16)
      if (kind === 'idle') tone(d, now + 0.12, 0.07, f * 1.1, f * 1.4, 'triangle', 0.05)
    }
  },
  beast(d, now, kind, k, big) {
    const f0 = 190 * k
    if (kind === 'pain') vox(d, now, big ? 0.45 : 0.3, f0 * 1.2, f0 * 0.9, shift(V_AH, k), 0.35, { vib: 9, vibDepth: 0.05, q: 6 })
    else if (kind === 'death') {
      vox(d, now, 0.9, f0 * 1.3, f0 * 0.6, shift(V_AH, k), 0.4, { vib: 8, vibDepth: 0.06, q: 6 })
      tone(d, now + 0.75, 0.16, 90, 40, 'sine', 0.35)
    } else vox(d, now, 0.6, f0, f0 * 0.92, shift(V_OH, k), 0.16, { vib: 7, vibDepth: 0.07, att: 0.08 })
  },
  machine(d, now, kind, k, big) {
    if (kind === 'pain') {
      ticks(d, now, big ? 0.25 : 0.14, big ? 9 : 5, 5200, 0.35, 3)
      tone(d, now, 0.1, 480 * k, 220 * k, 'square', 0.05)
    } else if (kind === 'death') {
      // 斷電：音高下墜＋劈啪＋小爆
      swell(d, now, 0.9, 700 * k, 40, 'sawtooth', 0.12, 0.05)
      ticks(d, now, 0.6, 14, 4600, 0.4, 3)
      noise(d, now + 0.15, 0.5, 900, 80, 0.7, 'lowpass', 0.6)
    } else {
      tone(d, now, 0.12, 880 * k, 880 * k, 'square', 0.025)
      tone(d, now + 0.16, 0.1, 660 * k, 660 * k, 'square', 0.02)
      noise(d, now, 0.3, 3000, 4000, 3, 'bandpass', 0.04)
    }
  },
}

// ───────── 具名音效（fx 直接呼叫 sfx(name)）─────────

regSound('whiff', (d, now) => {
  noise(d, now, 0.16, 600, 2800, 2, 'bandpass', 0.6)
}, 2.4)
regSound('dash', (d, now) => {
  noise(d, now, 0.3, 400, 2600, 1.5, 'bandpass', 0.5)
  noise(d, now + 0.05, 0.25, 900, 200, 1, 'lowpass', 0.3)
}, 2.7)
regSound('suitOff', (d, now) => {
  noise(d, now, 0.5, 5000, 1500, 1, 'highpass', 0.25)
  fm(d, now + 0.1, 0.25, 260, 2.73, 3, 0.12)
  fm(d, now + 0.3, 0.2, 210, 2.73, 3, 0.1)
}, 1.1)
regSound('castCharge', (d, now) => {
  swell(d, now, 0.6, 300, 900, 'sine', 0.12, 0.7)
  swell(d, now, 0.6, 450, 1350, 'triangle', 0.05, 0.7)
  noise(d, now, 0.6, 2000, 6000, 3, 'bandpass', 0.08)
}, 1.4)
regSound('cast', (d, now) => {
  noise(d, now, 0.18, 900, 4200, 2, 'bandpass', 0.22)
  tone(d, now, 0.16, 520, 1040, 'sine', 0.12)
  tone(d, now + 0.05, 0.14, 780, 1560, 'sine', 0.06)
}, 2.1)
regSound('infect', (d, now) => {
  noise(d, now, 0.4, 500, 160, 3, 'bandpass', 0.5)
  swell(d, now, 0.6, 180, 90, 'sawtooth', 0.05, 0.3)
  for (let i = 0; i < 3; i++) tone(d, now + 0.1 + i * 0.1, 0.07, rnd(280, 420), 600, 'sine', 0.08)
}, 4.1)
regSound('dock', (d, now) => {
  fm(d, now, 0.3, 180, 2.73, 4, 0.18)
  noise(d, now, 0.4, 3000, 800, 1, 'bandpass', 0.2)
  tone(d, now + 0.25, 0.12, 120, 60, 'sine', 0.3)
}, 1.6)
regSound('gas', (d, now) => {
  noise(d, now, 0.9, 3800, 2600, 0.8, 'highpass', 0.12)
}, 1.2)

/** 測試與混音用：列出可播的叫聲種類 */
export const FAMILIES: Family[] = ['human', 'xeno', 'mutant', 'bug', 'goo', 'critter', 'beast', 'machine']
