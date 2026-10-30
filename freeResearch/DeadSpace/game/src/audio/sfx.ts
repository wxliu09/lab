// 程序化音效（Web Audio 合成，無外部素材）：槍聲、爆炸、電弧、介面音；依與鏡頭的距離衰減與左右定位
import { signal } from '@preact/signals'

let ctx: AudioContext | null = null
let master: GainNode | null = null
let noiseBuf: AudioBuffer | null = null
let ambient: { stop: () => void } | null = null
const listener = { x: 0, y: 0 }

function initialVolume(): number {
  try {
    const v = Number(localStorage.getItem('xc.volume'))
    if (Number.isFinite(v) && v >= 0 && v <= 1 && localStorage.getItem('xc.volume') !== null) return v
  } catch {
    /* ignore */
  }
  return 0.6
}

export const volume = signal(initialVolume())

export function setVolume(v: number): void {
  volume.value = v
  if (master) master.gain.value = v
  try {
    localStorage.setItem('xc.volume', String(v))
  } catch {
    /* ignore */
  }
}

function ac(): AudioContext | null {
  if (ctx) return ctx
  try {
    ctx = new AudioContext()
    master = ctx.createGain()
    master.gain.value = volume.value
    const comp = ctx.createDynamicsCompressor()
    comp.threshold.value = -14
    comp.ratio.value = 4
    master.connect(comp).connect(ctx.destination)
    noiseBuf = ctx.createBuffer(1, ctx.sampleRate * 1.5, ctx.sampleRate)
    const d = noiseBuf.getChannelData(0)
    for (let i = 0; i < d.length; i++) d[i] = Math.random() * 2 - 1
  } catch {
    ctx = null
  }
  return ctx
}

/** 第一次使用者互動時解鎖音訊 */
export function unlockAudio(): void {
  const c = ac()
  if (c && c.state === 'suspended') void c.resume()
}

if (typeof window !== 'undefined') {
  window.addEventListener('pointerdown', unlockAudio, { once: true })
  window.addEventListener('keydown', unlockAudio, { once: true })
}

export function setListener(x: number, y: number): void {
  listener.x = x
  listener.y = y
}

function out(x?: number, y?: number, gain = 1): AudioNode | null {
  const c = ac()
  if (!c || !master) return null
  const g = c.createGain()
  let vol = gain
  let pan = 0
  if (x !== undefined && y !== undefined) {
    const dx = x - listener.x
    const dy = y - listener.y
    const d = Math.hypot(dx, dy)
    vol *= Math.max(0, 1 - d / 30) ** 1.5
    pan = Math.max(-1, Math.min(1, dx / 14))
  }
  if (vol < 0.01) return null
  g.gain.value = vol
  const p = c.createStereoPanner()
  p.pan.value = pan
  g.connect(p).connect(master)
  return g
}

function noise(dest: AudioNode, t0: number, dur: number, f0: number, f1: number, q = 1, type: BiquadFilterType = 'bandpass', amp = 1): void {
  const c = ctx!
  const src = c.createBufferSource()
  src.buffer = noiseBuf
  const f = c.createBiquadFilter()
  f.type = type
  f.Q.value = q
  f.frequency.setValueAtTime(f0, t0)
  f.frequency.exponentialRampToValueAtTime(Math.max(20, f1), t0 + dur)
  const g = c.createGain()
  g.gain.setValueAtTime(amp, t0)
  g.gain.exponentialRampToValueAtTime(0.001, t0 + dur)
  src.connect(f).connect(g).connect(dest)
  src.start(t0, Math.random() * 0.5)
  src.stop(t0 + dur + 0.05)
}

function tone(dest: AudioNode, t0: number, dur: number, f0: number, f1: number, type: OscillatorType = 'sine', amp = 0.5): void {
  const c = ctx!
  const o = c.createOscillator()
  o.type = type
  o.frequency.setValueAtTime(f0, t0)
  o.frequency.exponentialRampToValueAtTime(Math.max(20, f1), t0 + dur)
  const g = c.createGain()
  g.gain.setValueAtTime(0.0001, t0)
  g.gain.exponentialRampToValueAtTime(amp, t0 + 0.005)
  g.gain.exponentialRampToValueAtTime(0.0001, t0 + dur)
  o.connect(g).connect(dest)
  o.start(t0)
  o.stop(t0 + dur + 0.05)
}

/** 緩起音的持續音（充能、嗡鳴）*/
function swell(dest: AudioNode, t0: number, dur: number, f0: number, f1: number, type: OscillatorType = 'sine', amp = 0.3, att = 0.5): void {
  const c = ctx!
  const o = c.createOscillator()
  o.type = type
  o.frequency.setValueAtTime(f0, t0)
  o.frequency.exponentialRampToValueAtTime(Math.max(20, f1), t0 + dur)
  const g = c.createGain()
  g.gain.setValueAtTime(0.0001, t0)
  g.gain.exponentialRampToValueAtTime(amp, t0 + Math.max(0.01, dur * att))
  g.gain.exponentialRampToValueAtTime(0.0001, t0 + dur)
  o.connect(g).connect(dest)
  o.start(t0)
  o.stop(t0 + dur + 0.05)
}

/** FM 合成（金屬撞擊、鐘聲、電子音）*/
function fm(dest: AudioNode, t0: number, dur: number, carrier: number, ratio: number, index: number, amp = 0.3, type: OscillatorType = 'sine'): void {
  const c = ctx!
  const car = c.createOscillator()
  car.type = type
  car.frequency.setValueAtTime(carrier, t0)
  const mod = c.createOscillator()
  mod.frequency.setValueAtTime(carrier * ratio, t0)
  const mg = c.createGain()
  mg.gain.setValueAtTime(carrier * index, t0)
  mg.gain.exponentialRampToValueAtTime(Math.max(1, carrier * index * 0.05), t0 + dur)
  mod.connect(mg).connect(car.frequency)
  const g = c.createGain()
  g.gain.setValueAtTime(0.0001, t0)
  g.gain.exponentialRampToValueAtTime(amp, t0 + 0.004)
  g.gain.exponentialRampToValueAtTime(0.0001, t0 + dur)
  car.connect(g).connect(dest)
  car.start(t0)
  mod.start(t0)
  car.stop(t0 + dur + 0.05)
  mod.stop(t0 + dur + 0.05)
}

/** 一串隨機短促的雜訊爆點（蓋革計數器、電弧劈啪、翻找）*/
function ticks(dest: AudioNode, t0: number, dur: number, n: number, f: number, amp = 0.5, q = 4): void {
  for (let i = 0; i < n; i++) noise(dest, t0 + Math.random() * dur, 0.012 + Math.random() * 0.02, f * (0.7 + Math.random() * 0.6), f * 0.5, q, 'bandpass', amp * (0.5 + Math.random() * 0.5))
}

/** 低頻轟鳴（地震、核爆尾音）*/
function rumble(dest: AudioNode, t0: number, dur: number, amp = 1, f = 180): void {
  noise(dest, t0, dur, f, 30, 0.7, 'lowpass', amp)
  tone(dest, t0, dur * 0.8, 48, 26, 'sine', amp * 0.6)
}

const last = new Map<string, number>()

export function sfx(name: string, x?: number, y?: number): void {
  const c = ac()
  if (!c || c.state !== 'running') return
  const now = c.currentTime
  // 同一音效節流，避免機槍一秒 20 發把耳朵打爆
  const minGap = name === 'gatling' ? 0.06 : 0.03
  if ((last.get(name) ?? 0) > now - minGap) return
  last.set(name, now)
  const d = out(x, y, 0.5)
  if (!d) return
  switch (name) {
    case 'pistol':
      noise(d, now, 0.12, 3200, 600, 0.8, 'bandpass', 0.9)
      tone(d, now, 0.06, 220, 80, 'square', 0.15)
      break
    case 'rifle':
    case 'heavy':
      noise(d, now, name === 'heavy' ? 0.25 : 0.16, 2400, 300, 0.7, 'bandpass', 1)
      tone(d, now, 0.1, 140, 50, 'triangle', 0.35)
      break
    case 'gatling':
      noise(d, now, 0.05, 3000, 900, 1, 'bandpass', 0.6)
      break
    case 'plasma':
    case 'void':
      tone(d, now, 0.25, name === 'void' ? 300 : 900, name === 'void' ? 60 : 180, 'sawtooth', 0.18)
      noise(d, now, 0.18, 1600, 400, 2, 'bandpass', 0.3)
      break
    case 'laser':
      tone(d, now, 0.18, 1800, 600, 'sine', 0.25)
      break
    case 'zap':
      for (let i = 0; i < 4; i++) noise(d, now + i * 0.03, 0.05, 6000, 2000, 6, 'bandpass', 0.6)
      tone(d, now, 0.15, 120, 120, 'square', 0.08)
      break
    case 'cryo':
      noise(d, now, 0.35, 8000, 3000, 0.5, 'highpass', 0.4)
      break
    case 'flame':
      noise(d, now, 0.3, 900, 300, 0.4, 'lowpass', 0.6)
      break
    case 'saw':
      tone(d, now, 0.2, 520, 480, 'sawtooth', 0.12)
      noise(d, now, 0.2, 4000, 3000, 3, 'bandpass', 0.2)
      break
    case 'spit':
      noise(d, now, 0.15, 1200, 300, 3, 'bandpass', 0.5)
      break
    case 'rocket':
      noise(d, now, 0.5, 600, 2000, 1, 'bandpass', 0.6)
      break
    case 'thump':
      tone(d, now, 0.12, 180, 60, 'sine', 0.5)
      break
    case 'boom':
      noise(d, now, 0.7, 800, 60, 0.6, 'lowpass', 1.2)
      tone(d, now, 0.5, 90, 30, 'sine', 0.8)
      break
    case 'bigBoom':
      noise(d, now, 1.8, 500, 30, 0.5, 'lowpass', 1.5)
      tone(d, now, 1.2, 60, 20, 'sine', 1)
      break
    case 'claw':
      noise(d, now, 0.1, 2000, 500, 2, 'bandpass', 0.6)
      break
    case 'force':
    case 'mag':
      tone(d, now, 0.3, 200, 600, 'sine', 0.3)
      break
    case 'blink':
      tone(d, now, 0.3, 300, 1500, 'sine', 0.25)
      noise(d, now, 0.25, 3000, 8000, 2, 'bandpass', 0.2)
      break
    case 'vend':
      tone(d, now, 0.06, 880, 880, 'square', 0.12)
      tone(d, now + 0.07, 0.08, 1320, 1320, 'square', 0.12)
      break
    case 'suit':
      noise(d, now, 0.4, 400, 2000, 2, 'bandpass', 0.4)
      tone(d, now + 0.3, 0.1, 660, 990, 'sine', 0.2)
      break
    case 'ping':
      tone(d, now, 0.5, 1400, 1300, 'sine', 0.3)
      break
    case 'ui':
      tone(d, now, 0.05, 1200, 1500, 'sine', 0.15)
      break
    case 'alarm':
      tone(d, now, 0.6, 700, 500, 'sawtooth', 0.25)
      break
    // ───── 新增：技能、事件、裝置 ─────
    case 'splat':
      noise(d, now, 0.18, 900, 200, 2.5, 'bandpass', 0.7)
      tone(d, now, 0.08, 160, 60, 'sine', 0.3)
      break
    case 'bite':
      noise(d, now, 0.08, 2400, 800, 3, 'bandpass', 0.7)
      noise(d, now + 0.05, 0.15, 700, 200, 2, 'bandpass', 0.5)
      break
    case 'arc':
      noise(d, now, 0.18, 5000, 1500, 1.5, 'bandpass', 0.5)
      tone(d, now, 0.2, 900, 300, 'sawtooth', 0.12)
      break
    case 'chrono':
      fm(d, now, 0.35, 660, 1.5, 2, 0.2)
      tone(d, now + 0.04, 0.3, 1320, 990, 'sine', 0.12)
      break
    case 'fireball':
      noise(d, now, 0.4, 500, 1500, 0.8, 'bandpass', 0.6)
      tone(d, now, 0.25, 200, 90, 'sawtooth', 0.12)
      break
    case 'silk':
      noise(d, now, 0.25, 6000, 9000, 4, 'bandpass', 0.3)
      tone(d, now, 0.2, 1800, 2600, 'sine', 0.05)
      break
    case 'spine':
      noise(d, now, 0.12, 4000, 1200, 2, 'bandpass', 0.6)
      tone(d, now, 0.1, 400, 120, 'triangle', 0.2)
      break
    case 'spore':
      noise(d, now, 0.35, 400, 120, 1.5, 'lowpass', 0.8)
      tone(d, now, 0.3, 140, 60, 'sine', 0.4)
      break
    case 'throw':
      noise(d, now, 0.22, 600, 2400, 2, 'bandpass', 0.35)
      break
    case 'sludge':
      noise(d, now, 0.5, 300, 120, 3, 'bandpass', 0.7)
      for (let i = 0; i < 4; i++) tone(d, now + i * 0.09, 0.07, 220 + Math.random() * 120, 90, 'sine', 0.15)
      break
    case 'rumble':
      rumble(d, now, 0.9, 0.8)
      break
    case 'pulseWave':
      tone(d, now, 0.5, 120, 520, 'sawtooth', 0.18)
      noise(d, now, 0.4, 800, 3000, 1, 'bandpass', 0.4)
      break
    case 'glass':
      for (let i = 0; i < 5; i++) fm(d, now + i * 0.02, 0.25, 2200 + Math.random() * 1800, 1.41, 1.5, 0.08)
      noise(d, now, 0.12, 7000, 4000, 2, 'highpass', 0.4)
      break
    case 'clang':
      fm(d, now, 0.6, 340, 2.76, 3, 0.35)
      noise(d, now, 0.06, 3000, 1500, 2, 'bandpass', 0.5)
      break
    case 'clank':
      fm(d, now, 0.25, 180, 3.1, 4, 0.35)
      noise(d, now, 0.08, 1500, 400, 2, 'bandpass', 0.6)
      fm(d, now + 0.12, 0.2, 240, 3.1, 3, 0.2)
      break
    case 'heal':
      tone(d, now, 0.4, 660, 990, 'sine', 0.15)
      tone(d, now + 0.08, 0.4, 990, 1320, 'sine', 0.1)
      break
    case 'healBeam':
      swell(d, now, 0.6, 520, 780, 'sine', 0.12, 0.3)
      break
    case 'drain':
      swell(d, now, 0.45, 300, 180, 'sawtooth', 0.06, 0.3)
      noise(d, now, 0.4, 2000, 900, 6, 'bandpass', 0.15)
      break
    case 'hop':
      noise(d, now, 0.2, 400, 1500, 1.5, 'bandpass', 0.4)
      tone(d, now, 0.12, 150, 80, 'sine', 0.3)
      break
    case 'deploy':
      for (let i = 0; i < 3; i++) tone(d, now + i * 0.07, 0.06, 900 + i * 300, 900 + i * 300, 'square', 0.07)
      noise(d, now, 0.3, 1000, 3000, 2, 'bandpass', 0.3)
      fm(d, now + 0.22, 0.2, 260, 3, 2, 0.15)
      break
    case 'summon':
      swell(d, now, 0.5, 200, 600, 'sine', 0.2, 0.4)
      noise(d, now, 0.4, 600, 2400, 2, 'bandpass', 0.25)
      break
    case 'beep':
      tone(d, now, 0.07, 1760, 1760, 'square', 0.1)
      break
    case 'arm':
      tone(d, now, 0.1, 880, 880, 'square', 0.12)
      tone(d, now + 0.12, 0.18, 1320, 1320, 'square', 0.12)
      break
    case 'lock':
      fm(d, now, 0.18, 220, 2, 3, 0.3)
      tone(d, now + 0.06, 0.15, 440, 330, 'square', 0.1)
      break
    case 'unlock':
      tone(d, now, 0.1, 660, 660, 'sine', 0.15)
      tone(d, now + 0.1, 0.15, 990, 990, 'sine', 0.15)
      break
    case 'slam':
      noise(d, now, 0.5, 600, 60, 0.8, 'lowpass', 1.3)
      fm(d, now, 0.7, 110, 2.7, 4, 0.5)
      break
    case 'nuke':
      noise(d, now, 3, 600, 25, 0.5, 'lowpass', 1.8)
      tone(d, now, 2.4, 55, 18, 'sine', 1.1)
      rumble(d, now + 0.4, 2.6, 0.9)
      break
    case 'emp':
      swell(d, now, 0.6, 1200, 60, 'sawtooth', 0.2, 0.05)
      ticks(d, now, 0.4, 12, 5000, 0.4)
      break
    case 'morph':
      swell(d, now, 0.7, 90, 260, 'sawtooth', 0.12, 0.4)
      noise(d, now, 0.6, 300, 900, 3, 'bandpass', 0.5)
      break
    case 'squelch':
      noise(d, now, 0.3, 700, 150, 4, 'bandpass', 0.8)
      tone(d, now, 0.2, 180, 70, 'sine', 0.35)
      break
    case 'evolve':
      swell(d, now, 1.2, 110, 440, 'sawtooth', 0.15, 0.6)
      swell(d, now, 1.2, 165, 660, 'sine', 0.12, 0.6)
      noise(d, now + 0.9, 0.6, 800, 120, 0.8, 'lowpass', 0.9)
      break
    case 'deflect':
      fm(d, now, 0.25, 880, 1.5, 2, 0.15)
      noise(d, now, 0.1, 5000, 2000, 2, 'bandpass', 0.3)
      break
    case 'shatter':
      for (let i = 0; i < 7; i++) fm(d, now + Math.random() * 0.08, 0.3, 1800 + Math.random() * 2600, 1.37, 1.2, 0.06)
      noise(d, now, 0.2, 8000, 5000, 1, 'highpass', 0.4)
      break
    case 'shatterMetal':
      for (let i = 0; i < 5; i++) fm(d, now + Math.random() * 0.05, 0.25, 1200 + Math.random() * 1500, 2.76, 2, 0.08)
      noise(d, now, 0.1, 5000, 2000, 2, 'bandpass', 0.4)
      break
    case 'implode':
      swell(d, now, 0.7, 600, 40, 'sine', 0.4, 0.7)
      noise(d, now, 0.7, 3000, 200, 1, 'bandpass', 0.4)
      break
    case 'steal':
      noise(d, now, 0.18, 1200, 4000, 2, 'bandpass', 0.35)
      tone(d, now + 0.15, 0.2, 1400, 2100, 'sine', 0.12)
      break
    case 'rewind':
      swell(d, now, 0.6, 1800, 300, 'sawtooth', 0.08, 0.8)
      swell(d, now, 0.6, 900, 150, 'sine', 0.15, 0.8)
      ticks(d, now, 0.5, 6, 3000, 0.25)
      break
    case 'mute':
      tone(d, now, 0.4, 700, 120, 'sine', 0.2)
      noise(d, now, 0.3, 3000, 300, 2, 'bandpass', 0.2)
      break
    case 'mirror':
      fm(d, now, 0.6, 520, 1.5, 1.5, 0.12)
      fm(d, now + 0.05, 0.6, 780, 1.5, 1.5, 0.1)
      noise(d, now, 0.5, 4000, 8000, 3, 'bandpass', 0.15)
      break
    case 'stone':
      noise(d, now, 0.6, 1200, 200, 1, 'bandpass', 0.7)
      ticks(d, now, 0.5, 14, 1500, 0.5, 2)
      tone(d, now, 0.5, 90, 60, 'triangle', 0.3)
      break
    case 'crumble':
      ticks(d, now, 0.4, 20, 1200, 0.7, 1.5)
      noise(d, now, 0.5, 600, 100, 1, 'lowpass', 0.8)
      break
    case 'crunch':
      ticks(d, now, 0.18, 10, 1500, 0.8, 1.5)
      noise(d, now, 0.2, 500, 100, 1, 'lowpass', 0.6)
      break
    case 'snap':
      noise(d, now, 0.05, 6000, 3000, 2, 'bandpass', 0.7)
      tone(d, now, 0.08, 900, 300, 'triangle', 0.15)
      break
    case 'warp':
      swell(d, now, 0.6, 80, 900, 'sawtooth', 0.12, 0.5)
      swell(d, now + 0.3, 0.5, 900, 60, 'sine', 0.25, 0.1)
      noise(d, now, 0.6, 400, 3000, 2, 'bandpass', 0.3)
      break
    case 'smash':
      noise(d, now, 0.6, 700, 50, 0.7, 'lowpass', 1.4)
      tone(d, now, 0.4, 80, 30, 'sine', 0.9)
      ticks(d, now + 0.05, 0.4, 12, 1200, 0.5, 1.5)
      break
    case 'phase':
      swell(d, now, 0.35, 400, 1600, 'sine', 0.12, 0.2)
      noise(d, now, 0.3, 2000, 6000, 4, 'bandpass', 0.2)
      break
    case 'geiger':
      ticks(d, now, 1, 34, 3500, 0.5, 3)
      break
    case 'geigerTick':
      ticks(d, now, 0.3, 3, 3500, 0.25, 3)
      break
    case 'polarity':
      swell(d, now, 0.4, 300, 150, 'sine', 0.25, 0.2)
      swell(d, now + 0.15, 0.35, 150, 450, 'sine', 0.2, 0.3)
      break
    case 'weld':
      noise(d, now, 0.5, 6000, 4000, 1.2, 'highpass', 0.35)
      ticks(d, now, 0.5, 16, 4000, 0.3)
      tone(d, now, 0.5, 120, 120, 'square', 0.04)
      break
    case 'cloak':
      swell(d, now, 0.5, 1600, 200, 'sine', 0.15, 0.1)
      noise(d, now, 0.4, 7000, 2000, 3, 'bandpass', 0.2)
      break
    case 'enhance':
      for (let i = 0; i < 4; i++) fm(d, now + i * 0.1, 0.5, 523 * [1, 1.25, 1.5, 2][i], 2, 0.8, 0.1)
      break
    case 'grav':
      swell(d, now, 0.5, 70, 140, 'sine', 0.4, 0.3)
      noise(d, now, 0.45, 200, 600, 3, 'bandpass', 0.3)
      break
    case 'holo':
      for (let i = 0; i < 5; i++) tone(d, now + i * 0.05, 0.05, 1200 + i * 180, 1200 + i * 180, 'triangle', 0.06)
      noise(d, now, 0.35, 5000, 9000, 4, 'bandpass', 0.12)
      break
    case 'charge':
      swell(d, now, 1.4, 180, 1400, 'sawtooth', 0.08, 0.9)
      swell(d, now, 1.4, 90, 700, 'sine', 0.15, 0.9)
      break
    case 'revive':
      noise(d, now, 0.12, 4000, 1500, 1.5, 'bandpass', 0.7)
      tone(d, now, 0.12, 120, 80, 'square', 0.2)
      tone(d, now + 0.35, 0.1, 1046, 1046, 'sine', 0.15)
      tone(d, now + 0.6, 0.1, 1046, 1046, 'sine', 0.15)
      break
    case 'rummage':
      ticks(d, now, 0.45, 14, 2200, 0.5, 1.2)
      noise(d, now, 0.4, 1500, 800, 1.5, 'bandpass', 0.3)
      break
    case 'scan':
      swell(d, now, 0.5, 900, 1800, 'sine', 0.1, 0.2)
      tone(d, now + 0.5, 0.06, 1800, 1800, 'square', 0.06)
      break
    case 'whoosh':
      noise(d, now, 0.4, 300, 3000, 1.5, 'bandpass', 0.5)
      break
    case 'thud':
      tone(d, now, 0.35, 90, 35, 'sine', 0.9)
      noise(d, now, 0.35, 500, 60, 0.7, 'lowpass', 1)
      break
    case 'thunder':
      noise(d, now, 0.12, 6000, 2000, 1, 'bandpass', 1.1)
      noise(d, now + 0.03, 1.6, 900, 40, 0.6, 'lowpass', 1.4)
      tone(d, now, 1.2, 60, 25, 'sine', 0.7)
      break
    case 'crackle':
      ticks(d, now, 0.25, 8, 6000, 0.4)
      break
    case 'ink':
      noise(d, now, 0.4, 400, 150, 4, 'bandpass', 0.6)
      tone(d, now, 0.3, 120, 60, 'sine', 0.25)
      break
    case 'freeze':
      noise(d, now, 0.7, 9000, 3000, 0.7, 'highpass', 0.5)
      for (let i = 0; i < 4; i++) fm(d, now + 0.1 + i * 0.07, 0.4, 2500 + i * 400, 1.41, 1, 0.05)
      tone(d, now, 0.3, 200, 80, 'triangle', 0.2)
      break
    case 'overheat':
      noise(d, now, 0.5, 400, 2200, 1, 'bandpass', 0.6)
      swell(d, now, 0.5, 200, 400, 'sawtooth', 0.08, 0.3)
      break
    case 'steam':
      noise(d, now, 1.5, 5000, 3500, 0.6, 'highpass', 0.5)
      break
    case 'flash':
      tone(d, now, 0.3, 2400, 3200, 'sine', 0.12)
      noise(d, now, 0.2, 8000, 6000, 2, 'bandpass', 0.2)
      break
    case 'sniper':
      noise(d, now, 0.5, 2000, 200, 0.6, 'bandpass', 1.3)
      tone(d, now, 0.2, 160, 40, 'triangle', 0.6)
      noise(d, now + 0.08, 0.8, 600, 80, 0.5, 'lowpass', 0.5)
      break
    case 'repair':
      for (let i = 0; i < 6; i++) fm(d, now + i * 0.11, 0.06, 900, 2.5, 2, 0.12)
      break
    case 'rotary':
      swell(d, now, 0.8, 120, 900, 'sawtooth', 0.1, 0.6)
      noise(d, now, 0.8, 500, 2500, 1.5, 'bandpass', 0.35)
      break
    case 'roar': {
      // 低吼：鋸齒波經過兩個共振峰
      const c2 = ctx!
      const o = c2.createOscillator()
      o.type = 'sawtooth'
      o.frequency.setValueAtTime(110, now)
      o.frequency.linearRampToValueAtTime(85, now + 0.9)
      const f1 = c2.createBiquadFilter()
      f1.type = 'bandpass'
      f1.frequency.value = 600
      f1.Q.value = 4
      const g = c2.createGain()
      g.gain.setValueAtTime(0.0001, now)
      g.gain.exponentialRampToValueAtTime(0.7, now + 0.08)
      g.gain.exponentialRampToValueAtTime(0.0001, now + 1)
      o.connect(f1).connect(g).connect(d)
      o.start(now)
      o.stop(now + 1.05)
      noise(d, now, 0.9, 900, 300, 2, 'bandpass', 0.5)
      break
    }
    case 'quake':
      rumble(d, now, 1.6, 1.3)
      ticks(d, now + 0.2, 1, 20, 900, 0.5, 1.5)
      break
    case 'heartbeat':
      tone(d, now, 0.12, 70, 45, 'sine', 0.7)
      tone(d, now + 0.16, 0.1, 65, 42, 'sine', 0.5)
      break
    case 'phasePulse':
      swell(d, now, 0.3, 1600, 200, 'sawtooth', 0.15, 0.05)
      noise(d, now, 0.5, 700, 80, 0.7, 'lowpass', 0.9)
      break
    case 'solar':
      swell(d, now, 3.2, 40, 90, 'sawtooth', 0.15, 0.3)
      noise(d, now, 3.2, 300, 1200, 0.5, 'bandpass', 0.6)
      rumble(d, now, 3, 0.9)
      break
    case 'orbitFail':
      swell(d, now, 3.5, 220, 40, 'sawtooth', 0.15, 0.2)
      swell(d, now, 3.5, 330, 55, 'sine', 0.15, 0.2)
      rumble(d, now + 0.3, 3, 0.9)
      break
    case 'impact':
      noise(d, now, 1.2, 700, 40, 0.6, 'lowpass', 1.5)
      tone(d, now, 0.8, 70, 25, 'sine', 1)
      ticks(d, now + 0.05, 0.6, 14, 1500, 0.5, 1.5)
      break
    case 'voidHum':
      swell(d, now, 1.2, 46, 40, 'sine', 0.25, 0.5)
      noise(d, now, 1.2, 160, 100, 2, 'bandpass', 0.15)
      break
    case 'fireLoop':
      noise(d, now, 1, 700, 500, 0.5, 'lowpass', 0.35)
      ticks(d, now, 0.9, 5, 3000, 0.25)
      break
    default:
      tone(d, now, 0.08, 600, 400, 'sine', 0.1)
  }
}

/** 站體低頻嗡鳴與通風 */
export function startAmbient(kind: 'station' | 'space' = 'station'): void {
  const c = ac()
  if (!c || !master || ambient) return
  const g = c.createGain()
  g.gain.value = 0.06
  g.connect(master)
  const o1 = c.createOscillator()
  o1.type = 'sine'
  o1.frequency.value = kind === 'space' ? 38 : 55
  const o2 = c.createOscillator()
  o2.type = 'sine'
  o2.frequency.value = kind === 'space' ? 57.3 : 82.5
  const src = c.createBufferSource()
  src.buffer = noiseBuf
  src.loop = true
  const f = c.createBiquadFilter()
  f.type = 'lowpass'
  f.frequency.value = 380
  const ng = c.createGain()
  ng.gain.value = 0.35
  o1.connect(g)
  o2.connect(g)
  src.connect(f).connect(ng).connect(g)
  o1.start()
  o2.start()
  src.start()
  ambient = {
    stop: () => {
      o1.stop()
      o2.stop()
      src.stop()
      g.disconnect()
    },
  }
}

export function stopAmbient(): void {
  ambient?.stop()
  ambient = null
}
