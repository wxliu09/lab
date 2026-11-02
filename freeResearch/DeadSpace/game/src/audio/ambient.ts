// 環境音：依所在地點切換的底噪（站內通風嗡鳴、船艙引擎、行星風雨、太空深沉低鳴、廢站電流、有機腔體），
// 加上隨機的小事件（遠處金屬聲、排氣、管線吱嘎、無線電雜訊、鳥鳴、滴水）。
import { audioContext, busNode, listenerPos, noiseBuffer, sfx } from './sfx'

export type AmbientKind = 'station' | 'ship' | 'outdoor' | 'space' | 'derelict' | 'organic'

interface Bed {
  kind: AmbientKind
  g: GainNode
  stop: () => void
}

let bed: Bed | null = null
let eventTimer: ReturnType<typeof setTimeout> | null = null

function osc(c: AudioContext, dest: AudioNode, type: OscillatorType, f: number, amp: number): OscillatorNode {
  const o = c.createOscillator()
  o.type = type
  o.frequency.value = f
  const g = c.createGain()
  g.gain.value = amp
  o.connect(g).connect(dest)
  o.start()
  return o
}

function noiseLayer(c: AudioContext, dest: AudioNode, type: BiquadFilterType, f: number, q: number, amp: number, lfoHz = 0, lfoDepth = 0): AudioScheduledSourceNode[] {
  const nb = noiseBuffer()
  if (!nb) return []
  const src = c.createBufferSource()
  src.buffer = nb
  src.loop = true
  const fl = c.createBiquadFilter()
  fl.type = type
  fl.frequency.value = f
  fl.Q.value = q
  const g = c.createGain()
  g.gain.value = amp
  src.connect(fl).connect(g).connect(dest)
  src.start(0, Math.random())
  const out: AudioScheduledSourceNode[] = [src]
  if (lfoHz > 0) {
    // 慢速起伏：風、通風、呼吸
    const l = c.createOscillator()
    l.frequency.value = lfoHz
    const lg = c.createGain()
    lg.gain.value = lfoDepth
    l.connect(lg).connect(g.gain)
    l.start()
    out.push(l)
  }
  return out
}

function build(kind: AmbientKind): Bed | null {
  const c = audioContext()
  const bus = busNode('ambient')
  if (!c || !bus) return null
  const g = c.createGain()
  g.gain.value = 0
  g.connect(bus)
  const nodes: AudioScheduledSourceNode[] = []
  switch (kind) {
    case 'station':
      nodes.push(osc(c, g, 'sine', 55, 0.05), osc(c, g, 'sine', 82.5, 0.025), osc(c, g, 'sine', 110.4, 0.008))
      nodes.push(...noiseLayer(c, g, 'lowpass', 380, 0.7, 0.05, 0.07, 0.015))
      break
    case 'ship':
      nodes.push(osc(c, g, 'sawtooth', 36, 0.018), osc(c, g, 'sine', 72, 0.04), osc(c, g, 'sine', 108.3, 0.012))
      nodes.push(...noiseLayer(c, g, 'lowpass', 220, 1.2, 0.07, 0.4, 0.02))
      break
    case 'outdoor':
      // 風＋雨（翠原星下雨、餘燼衛星只有風）
      nodes.push(...noiseLayer(c, g, 'bandpass', 520, 0.5, 0.06, 0.05, 0.04))
      nodes.push(...noiseLayer(c, g, 'highpass', 3600, 0.4, 0.025, 0.11, 0.01))
      break
    case 'space':
      nodes.push(osc(c, g, 'sine', 38, 0.05), osc(c, g, 'sine', 57.3, 0.02), osc(c, g, 'sine', 880, 0.0025))
      nodes.push(...noiseLayer(c, g, 'lowpass', 160, 0.7, 0.03, 0.03, 0.012))
      break
    case 'derelict':
      nodes.push(osc(c, g, 'sine', 49, 0.04), osc(c, g, 'sine', 51.3, 0.03), osc(c, g, 'sawtooth', 60, 0.006))
      nodes.push(...noiseLayer(c, g, 'lowpass', 300, 0.8, 0.04, 0.05, 0.02))
      break
    case 'organic':
      nodes.push(osc(c, g, 'sine', 41, 0.05), osc(c, g, 'triangle', 466, 0.004))
      nodes.push(...noiseLayer(c, g, 'lowpass', 260, 1.5, 0.05, 0.5, 0.04))
      break
  }
  return {
    kind,
    g,
    stop: () => {
      const t = c.currentTime
      g.gain.setTargetAtTime(0, t, 0.6)
      setTimeout(() => {
        for (const n of nodes) {
          try {
            n.stop()
          } catch {
            /* ignore */
          }
        }
        g.disconnect()
      }, 3000)
    },
  }
}

const EVENTS: Record<AmbientKind, string[]> = {
  station: ['ventHiss', 'clankFar', 'creak', 'radioChatter', 'ventHiss', 'clankFar'],
  ship: ['creak', 'hullGroan', 'clankFar'],
  outdoor: ['windGust', 'birdcall', 'windGust', 'drip'],
  space: ['hullGroan'],
  derelict: ['creak', 'electricBuzz', 'drip', 'hullGroan', 'clankFar', 'electricBuzz'],
  organic: ['squish', 'drip', 'squish', 'creak'],
}

function scheduleEvent(): void {
  if (eventTimer) clearTimeout(eventTimer)
  eventTimer = setTimeout(
    () => {
      if (bed) {
        const list = EVENTS[bed.kind]
        const name = list[Math.floor(Math.random() * list.length)]
        const l = listenerPos()
        const a = Math.random() * Math.PI * 2
        const r = 6 + Math.random() * 12
        sfx(name, l.x + Math.cos(a) * r, l.y + Math.sin(a) * r, 'ambient')
      }
      scheduleEvent()
    },
    5000 + Math.random() * 9000,
  )
}

/** 切換環境音（交叉淡入）；null = 關掉 */
export function setAmbient(kind: AmbientKind | null): void {
  if ((bed?.kind ?? null) === kind) return
  bed?.stop()
  bed = null
  if (!kind) {
    if (eventTimer) clearTimeout(eventTimer)
    eventTimer = null
    return
  }
  bed = build(kind)
  if (bed) {
    const c = bed.g.context
    bed.g.gain.setTargetAtTime(1, c.currentTime, 1.2)
  }
  if (!eventTimer) scheduleEvent()
}
