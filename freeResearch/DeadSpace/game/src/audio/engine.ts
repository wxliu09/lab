// 引擎循環音：自己駕駛的船艇或站點在太空層移動時，依速度播一個很低調的引擎聲。
// 一組常駐節點（低頻鋸齒波＋帶通雜訊），每個快照只調音量與音高（setTargetAtTime），不重建 node；
// 停下來或離開駕駛就淡出，靜止一段時間後才把節點停掉釋放。
import { audioContext, busNode, noiseBuffer } from './sfx'

interface Engine {
  g: GainNode
  o: OscillatorNode
  lp: BiquadFilterNode
  n: AudioBufferSourceNode
  bp: BiquadFilterNode
  /** 上次有聲音的時間（AudioContext 時間）*/
  liveAt: number
}

let eng: Engine | null = null
/** 目前設定的速度比例（測試用）*/
let level = 0

/** 全速時的音量：很低調（K 加權約 −27，比腳步聲還小）*/
const MAX_GAIN = 0.06
/** 靜止多久之後把節點停掉（秒）*/
const RELEASE_AFTER = 4

function build(c: AudioContext, dest: AudioNode): Engine | null {
  const nb = noiseBuffer()
  if (!nb) return null
  const g = c.createGain()
  g.gain.value = 0
  g.connect(dest)
  // 主體：低頻鋸齒波經過低通（速度越快，音高與亮度越高）
  const o = c.createOscillator()
  o.type = 'sawtooth'
  o.frequency.value = 38
  const lp = c.createBiquadFilter()
  lp.type = 'lowpass'
  lp.frequency.value = 160
  lp.Q.value = 0.8
  const og = c.createGain()
  og.gain.value = 0.5
  o.connect(lp).connect(og).connect(g)
  // 推進器的氣流聲：帶通雜訊
  const n = c.createBufferSource()
  n.buffer = nb
  n.loop = true
  const bp = c.createBiquadFilter()
  bp.type = 'bandpass'
  bp.frequency.value = 260
  bp.Q.value = 1.2
  const ng = c.createGain()
  ng.gain.value = 0.6
  n.connect(bp).connect(ng).connect(g)
  o.start()
  n.start(0, Math.random())
  return { g, o, lp, n, bp, liveAt: c.currentTime }
}

/** 停掉並放掉節點；at = 停止時間（AudioContext 時間，預設立刻）*/
function release(at?: number): void {
  if (!eng) return
  const e = eng
  eng = null
  try {
    e.o.stop(at)
    e.n.stop(at)
  } catch {
    /* ignore */
  }
  if (at === undefined) e.g.disconnect()
  else e.o.onended = () => e.g.disconnect()
}

/**
 * 離開對局：引擎聲直接淡出並停掉節點（不等 RELEASE_AFTER——那要靠之後還有 setEngine 呼叫才會檢查，
 * 離開對局後就不會再有，節點會一直留到下一局）。
 */
export function stopEngine(): void {
  level = 0
  if (!eng) return
  const c = audioContext()
  // 沒在播（暫停中、已關閉）：沒有爆音的問題，直接停
  if (!c || c.state !== 'running') {
    release()
    return
  }
  const t = c.currentTime
  eng.g.gain.cancelScheduledValues(t)
  eng.g.gain.setTargetAtTime(0, t, 0.04)
  release(t + 0.25)
}

/**
 * 設定引擎聲：k = 速度比例（0 = 停下或沒在駕駛，1 = 全速）。
 * 每個快照呼叫一次即可；k 為 0 時只淡出，靜止超過 RELEASE_AFTER 秒才停掉節點。
 */
export function setEngine(k: number): void {
  k = Math.max(0, Math.min(1, Number.isFinite(k) ? k : 0))
  level = k
  const c = audioContext()
  if (!c || c.state !== 'running') return
  const t = c.currentTime
  if (k < 0.02) {
    if (!eng) return
    eng.g.gain.setTargetAtTime(0, t, 0.35)
    if (t - eng.liveAt > RELEASE_AFTER) release()
    return
  }
  if (!eng) {
    const bus = busNode('sfx')
    if (!bus) return
    eng = build(c, bus)
    if (!eng) return
  }
  eng.liveAt = t
  eng.g.gain.setTargetAtTime(MAX_GAIN * (0.35 + 0.65 * k), t, 0.4)
  eng.o.frequency.setTargetAtTime(34 + 22 * k, t, 0.5)
  eng.lp.frequency.setTargetAtTime(140 + 260 * k, t, 0.5)
  eng.bp.frequency.setTargetAtTime(220 + 380 * k, t, 0.5)
}

/** 測試用：目前的速度比例與節點是否存在 */
export function engineState(): { k: number; live: boolean } {
  return { k: level, live: !!eng }
}
