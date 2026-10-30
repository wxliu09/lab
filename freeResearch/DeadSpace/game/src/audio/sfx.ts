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
