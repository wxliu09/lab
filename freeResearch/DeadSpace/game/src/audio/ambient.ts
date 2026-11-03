// 環境音：依所在地點切換的底噪（站內通風嗡鳴、船艙引擎、行星風雨、無大氣衛星的地鳴、太空深沉低鳴、廢站電流、有機腔體），
// 加上各站 1～2 個有特色的層（熔爐低吼、培養槽氣泡、電容嗡鳴…），以及隨機的小事件（遠處金屬聲、排氣、管線吱嘎、無線電雜訊、鳥鳴、滴水）。
// 成本：全部共用 sfx 的 noise buffer；每站最多 2 條額外的 node 鏈，切換地點時才重建，快照不會碰到這裡。
import { audioContext, busNode, listenerPos, noiseBuffer, sfx } from './sfx'

/** outdoor = 有大氣的地表（翠原星：風＋雨）；moon = 無大氣的岩石衛星（餘燼衛星：地鳴，沒有風雨鳥）*/
export type AmbientKind = 'station' | 'ship' | 'outdoor' | 'moon' | 'space' | 'derelict' | 'organic'

interface Bed {
  key: string
  kind: AmbientKind
  flavor: string
  g: GainNode
  stop: () => void
}

let bed: Bed | null = null
let eventTimer: ReturnType<typeof setTimeout> | null = null
let microTimer: ReturnType<typeof setTimeout> | null = null

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

/** 低頻調變：把一個慢速 LFO 接到某個參數上（濾波器頻率、音量）*/
function lfo(c: AudioContext, param: AudioParam, hz: number, depth: number, type: OscillatorType = 'sine'): OscillatorNode {
  const l = c.createOscillator()
  l.type = type
  l.frequency.value = hz
  const lg = c.createGain()
  lg.gain.value = depth
  l.connect(lg).connect(param)
  l.start()
  return l
}

/** 濾波雜訊層；回傳要停止的來源節點與濾波器（給呼叫端再掛調變）*/
function noiseLayer(c: AudioContext, dest: AudioNode, type: BiquadFilterType, f: number, q: number, amp: number, lfoHz = 0, lfoDepth = 0): { nodes: AudioScheduledSourceNode[]; filter: BiquadFilterNode | null } {
  const nb = noiseBuffer()
  if (!nb) return { nodes: [], filter: null }
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
  const nodes: AudioScheduledSourceNode[] = [src]
  // 慢速起伏：風、通風、呼吸
  if (lfoHz > 0) nodes.push(lfo(c, g.gain, lfoHz, lfoDepth))
  return { nodes, filter: fl }
}

/** 振幅脈動的音：osc → 增益（被 LFO 調變）。用在熔爐、電容、引擎的「一下一下」*/
function pulsed(c: AudioContext, dest: AudioNode, type: OscillatorType, f: number, amp: number, hz: number, depth: number, lp = 0): AudioScheduledSourceNode[] {
  const o = c.createOscillator()
  o.type = type
  o.frequency.value = f
  const g = c.createGain()
  g.gain.value = amp
  if (lp > 0) {
    const fl = c.createBiquadFilter()
    fl.type = 'lowpass'
    fl.frequency.value = lp
    fl.Q.value = 0.7
    o.connect(fl).connect(g).connect(dest)
  } else o.connect(g).connect(dest)
  o.start()
  return [o, lfo(c, g.gain, hz, depth)]
}

/** 底噪本體（依地點種類）*/
function baseLayers(c: AudioContext, g: GainNode, kind: AmbientKind): AudioScheduledSourceNode[] {
  const nodes: AudioScheduledSourceNode[] = []
  switch (kind) {
    case 'station':
      nodes.push(osc(c, g, 'sine', 55, 0.05), osc(c, g, 'sine', 82.5, 0.025), osc(c, g, 'sine', 110.4, 0.008))
      nodes.push(...noiseLayer(c, g, 'lowpass', 380, 0.7, 0.05, 0.07, 0.015).nodes)
      break
    case 'ship':
      nodes.push(osc(c, g, 'sawtooth', 36, 0.018), osc(c, g, 'sine', 72, 0.04), osc(c, g, 'sine', 108.3, 0.012))
      nodes.push(...noiseLayer(c, g, 'lowpass', 220, 1.2, 0.07, 0.4, 0.02).nodes)
      break
    case 'outdoor':
      // 有大氣的地表：風＋雨（翠原星）
      nodes.push(...noiseLayer(c, g, 'bandpass', 520, 0.5, 0.06, 0.05, 0.04).nodes)
      nodes.push(...noiseLayer(c, g, 'highpass', 3600, 0.4, 0.025, 0.11, 0.01).nodes)
      break
    case 'moon':
      // 無大氣的岩石衛星（餘燼衛星）：聽不到風，只有經由地面傳上來的低頻地鳴，起伏很慢
      nodes.push(osc(c, g, 'sine', 31, 0.05), osc(c, g, 'sine', 46.5, 0.014))
      nodes.push(...noiseLayer(c, g, 'lowpass', 110, 0.9, 0.07, 0.035, 0.035).nodes)
      break
    case 'space':
      nodes.push(osc(c, g, 'sine', 38, 0.05), osc(c, g, 'sine', 57.3, 0.02), osc(c, g, 'sine', 880, 0.0025))
      nodes.push(...noiseLayer(c, g, 'lowpass', 160, 0.7, 0.03, 0.03, 0.012).nodes)
      break
    case 'derelict':
      nodes.push(osc(c, g, 'sine', 49, 0.04), osc(c, g, 'sine', 51.3, 0.03), osc(c, g, 'sawtooth', 60, 0.006))
      nodes.push(...noiseLayer(c, g, 'lowpass', 300, 0.8, 0.04, 0.05, 0.02).nodes)
      break
    case 'organic':
      nodes.push(osc(c, g, 'sine', 41, 0.05), osc(c, g, 'triangle', 466, 0.004))
      nodes.push(...noiseLayer(c, g, 'lowpass', 260, 1.5, 0.05, 0.5, 0.04).nodes)
      break
  }
  return nodes
}

/** 各站的特色層（每站最多 2 條 node 鏈）；flavor = 站點 id */
function flavorLayers(c: AudioContext, g: GainNode, flavor: string): AudioScheduledSourceNode[] {
  const nodes: AudioScheduledSourceNode[] = []
  switch (flavor) {
    case 'nyx': {
      // 女帝號（主研究站）：維生系統的柔和雙音拍頻，一呼一吸
      nodes.push(...pulsed(c, g, 'triangle', 196, 0.006, 0.22, 0.004))
      nodes.push(osc(c, g, 'sine', 197.6, 0.004))
      break
    }
    case 'adjudicatrix': {
      // 裁決者號（通訊感測站）：雷達穹頂週期性掃過的窄帶氣流聲
      const n = noiseLayer(c, g, 'bandpass', 1100, 7, 0.08)
      nodes.push(...n.nodes)
      if (n.filter) nodes.push(lfo(c, n.filter.frequency, 0.11, 650))
      break
    }
    case 'tenshu':
      // 天守砲台：主砲電容組的嗡鳴（100 Hz 電源嗡聲，緩慢充放）
      nodes.push(...pulsed(c, g, 'sawtooth', 100, 0.012, 0.07, 0.008, 420))
      nodes.push(osc(c, g, 'sine', 200, 0.006))
      break
    case 'bravado':
      // 豪勇號（戰艦）：主引擎的低沉脈動，像心跳一樣一下一下
      nodes.push(...pulsed(c, g, 'sawtooth', 33, 0.03, 1.4, 0.022, 140))
      break
    case 'caldera': {
      // 火口號（採礦工程艦）：精煉爐的低吼，火焰起伏
      const n = noiseLayer(c, g, 'bandpass', 170, 1.2, 0.26, 0.27, 0.12)
      nodes.push(...n.nodes)
      if (n.filter) nodes.push(lfo(c, n.filter.frequency, 0.13, 50))
      break
    }
    case 'vivarium':
      // 活體庫號（標本收容站）：培養槽的過濾泵嗡聲（氣泡由 micro 事件負責）
      nodes.push(...noiseLayer(c, g, 'bandpass', 620, 3, 0.035, 0.6, 0.015).nodes)
      break
    case 'portage':
      // 擺渡號（人員轉運站）：傳送台待機的微光共鳴（兩個略為走音的高音互相拍頻）
      nodes.push(osc(c, g, 'sine', 440, 0.0035), osc(c, g, 'sine', 443.2, 0.0035))
      break
    case 'hulk7': {
      // 七號廢站：沒人維護的結構在應力下低聲呻吟
      const n = noiseLayer(c, g, 'bandpass', 85, 9, 0.5, 0.045, 0.4)
      nodes.push(...n.nodes)
      if (n.filter) nodes.push(lfo(c, n.filter.frequency, 0.031, 22))
      break
    }
    case 'uo':
      // 未識別物體：有機腔壁的脈動（約每秒一下，像巨大生物的心跳）
      nodes.push(...pulsed(c, g, 'sine', 52, 0.03, 0.85, 0.026))
      break
    case 'pirate':
      // 黑鷗號（拼裝海盜船）：鬆脫鋼板跟著引擎喀啦振動
      nodes.push(...noiseLayer(c, g, 'bandpass', 320, 2.5, 0.07, 8.5, 0.055).nodes)
      break
    case 'cinder':
      // 餘燼衛星：遠處模組工廠的機械運轉聲
      nodes.push(...pulsed(c, g, 'sawtooth', 50, 0.01, 0.5, 0.006, 160))
      break
  }
  return nodes
}

function build(kind: AmbientKind, flavor: string): Bed | null {
  const c = audioContext()
  const bus = busNode('ambient')
  if (!c || !bus) return null
  const g = c.createGain()
  g.gain.value = 0
  g.connect(bus)
  const nodes = [...baseLayers(c, g, kind), ...flavorLayers(c, g, flavor)]
  return {
    key: kind + '|' + flavor,
    kind,
    flavor,
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
  moon: ['pebbles', 'quakeFar', 'pebbles', 'clankFar'],
  space: ['hullGroan'],
  derelict: ['creak', 'electricBuzz', 'drip', 'hullGroan', 'clankFar', 'electricBuzz'],
  organic: ['squish', 'drip', 'squish', 'creak'],
}

/** 各站額外的隨機事件（加進底噪種類的清單裡抽）*/
const FLAVOR_EVENTS: Record<string, string[]> = {
  nyx: ['dataChirp', 'dataChirp'],
  adjudicatrix: ['sonarPing', 'radioChatter', 'sonarPing'],
  tenshu: ['capWhine', 'capWhine'],
  bravado: ['radioChatter', 'clankFar'],
  caldera: ['furnaceFlare', 'conveyor', 'conveyor'],
  vivarium: ['drip', 'squish'],
  portage: ['teleChime', 'teleChime'],
  hulk7: ['metalStress', 'metalStress'],
  uo: ['squish'],
  pirate: ['radioChatter', 'clankFar', 'creak'],
  cinder: ['conveyor'],
}

/** 密集的小事件（培養槽氣泡）：[音效, 最短間隔 ms, 最長間隔 ms] */
const MICRO: Record<string, [string, number, number]> = {
  vivarium: ['bubble', 350, 1800],
}

function scheduleEvent(): void {
  if (eventTimer) clearTimeout(eventTimer)
  eventTimer = setTimeout(
    () => {
      if (bed) {
        const list = [...EVENTS[bed.kind], ...(FLAVOR_EVENTS[bed.flavor] ?? [])]
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

function scheduleMicro(): void {
  if (microTimer) clearTimeout(microTimer)
  microTimer = null
  const m = bed ? MICRO[bed.flavor] : undefined
  if (!m) return
  microTimer = setTimeout(
    () => {
      if (bed && MICRO[bed.flavor]) {
        const l = listenerPos()
        const a = Math.random() * Math.PI * 2
        const r = 4 + Math.random() * 10
        sfx(m[0], l.x + Math.cos(a) * r, l.y + Math.sin(a) * r, 'ambient')
      }
      scheduleMicro()
    },
    m[1] + Math.random() * (m[2] - m[1]),
  )
}

/** 目前的底噪（測試用）*/
export function currentAmbient(): string | null {
  return bed?.key ?? null
}

/** 切換環境音（交叉淡入）；null = 關掉。flavor = 站點 id（各站特色層）*/
export function setAmbient(kind: AmbientKind | null, flavor = ''): void {
  const key = kind ? kind + '|' + flavor : null
  if ((bed?.key ?? null) === key) return
  bed?.stop()
  bed = null
  if (!kind) {
    if (eventTimer) clearTimeout(eventTimer)
    if (microTimer) clearTimeout(microTimer)
    eventTimer = null
    microTimer = null
    return
  }
  bed = build(kind, flavor)
  if (bed) {
    const c = bed.g.context
    bed.g.gain.setTargetAtTime(1, c.currentTime, 1.2)
  }
  if (!eventTimer) scheduleEvent()
  scheduleMicro()
}
