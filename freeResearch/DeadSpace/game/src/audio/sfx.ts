// 程序化音效（Web Audio 合成，無外部素材）：槍聲、爆炸、電弧、介面音；依與鏡頭的距離衰減與左右定位
import { signal } from '@preact/signals'

let ctx: AudioContext | null = null
let master: GainNode | null = null
let noiseBuf: AudioBuffer | null = null
const listener = { x: 0, y: 0 }

// ───────── 分軌與音量 ─────────

/** sfx = 世界音效、ui = 介面與通知、music = 背景音樂、ambient = 環境音 */
export type Bus = 'sfx' | 'ui' | 'music' | 'ambient'

export interface AudioPrefs {
  master: number
  sfx: number
  /** 介面／通知分軌（第 7 輪：原本由 sfx 推算，玩家無法單獨調）*/
  ui: number
  music: number
  ambient: number
  muted: boolean
  /** 單聲道（無障礙：單耳聽力、只戴一邊耳機）：不做左右定位，母線混成單聲道 */
  mono: boolean
}

const PREF_KEY = 'xc.audio'
const DEFAULT_PREFS: AudioPrefs = { master: 0.9, sfx: 0.9, ui: 0.9, music: 0.45, ambient: 0.6, muted: false, mono: false }

/**
 * 存檔內容 → 設定（壞值用預設）。舊存檔沒有 ui：沿用舊版由 sfx 推算的值（sfx × 0.9 + 0.1），
 * 升級後聽起來和以前一樣；沒有 mono 就是關。
 */
export function parsePrefs(raw: unknown): AudioPrefs {
  const v = (raw && typeof raw === 'object' ? raw : {}) as Partial<Record<keyof AudioPrefs, unknown>>
  const n = (x: unknown, d: number) => (typeof x === 'number' && x >= 0 && x <= 1 ? x : d)
  const sfx = n(v.sfx, DEFAULT_PREFS.sfx)
  return {
    master: n(v.master, DEFAULT_PREFS.master),
    sfx,
    ui: n(v.ui, typeof v.sfx === 'number' ? Math.min(1, sfx * 0.9 + 0.1) : DEFAULT_PREFS.ui),
    music: n(v.music, DEFAULT_PREFS.music),
    ambient: n(v.ambient, DEFAULT_PREFS.ambient),
    muted: v.muted === true,
    mono: v.mono === true,
  }
}

function loadPrefs(): AudioPrefs {
  try {
    const raw = localStorage.getItem(PREF_KEY)
    if (raw) return parsePrefs(JSON.parse(raw))
    // 舊版只有一個總音量
    const old = localStorage.getItem('xc.volume')
    if (old !== null && Number.isFinite(Number(old))) return { ...DEFAULT_PREFS, master: Math.max(0, Math.min(1, Number(old))) }
  } catch {
    /* ignore */
  }
  return { ...DEFAULT_PREFS }
}

export const audioPrefs = signal<AudioPrefs>(loadPrefs())
const buses: Partial<Record<Bus, GainNode>> = {}
/** 世界音效的入口：bus 壓縮器（大混戰時先在這裡壓，不讓母線壓縮器把音樂、環境音一起壓下去）→ 補償增益 → sfx 分軌 */
let sfxIn: AudioNode | null = null

function applyPrefs(): void {
  const p = audioPrefs.value
  const c = ctx
  if (!c || !master) return
  const t = c.currentTime
  master.gain.setTargetAtTime(p.muted ? 0 : p.master, t, 0.05)
  buses.sfx?.gain.setTargetAtTime(p.sfx, t, 0.05)
  buses.ui?.gain.setTargetAtTime(p.ui, t, 0.05)
  buses.music?.gain.setTargetAtTime(p.music, t, 0.05)
  buses.ambient?.gain.setTargetAtTime(p.ambient, t, 0.05)
  // 單聲道：母線強制 1 聲道（瀏覽器依 speakers 規則把左右混成一聲，之後再複製到兩邊）
  master.channelCount = p.mono ? 1 : 2
  master.channelCountMode = p.mono ? 'explicit' : 'max'
}

export function setAudioPref<K extends keyof AudioPrefs>(k: K, v: AudioPrefs[K]): void {
  audioPrefs.value = { ...audioPrefs.value, [k]: v }
  applyPrefs()
  try {
    localStorage.setItem(PREF_KEY, JSON.stringify(audioPrefs.value))
  } catch {
    /* ignore */
  }
}

/** 相容舊介面：總音量 */
export const volume = { get value() { return audioPrefs.value.master } }
export function setVolume(v: number): void {
  setAudioPref('master', v)
}

/**
 * 使用者已經跟頁面互動過（第一次 pointerdown／keydown）。在那之前不建立 AudioContext：瀏覽器的自動播放政策下，
 * 手勢前建立或 resume 都只會得到 suspended 的 context，而且每次都在 console 留一則警告（第 6 輪審查 B-P3：每次載入 4 則）。
 * 手勢前的音效本來就播不出來，直接略過；背景音樂、環境音由音訊導演每 0.5 秒重試，手勢後自然開始。
 */
let gestured = false

/**
 * 世界音效 bus 壓縮器：門檻 −18、3:1、軟膝 6 dB；起音 10 ms 讓單發槍聲的瞬態大致通過，連射與疊加才被壓。
 * post = 抵銷瀏覽器自動 makeup（+6.13 dB）再加回 1 dB（單發的瞬態也會被壓一點），單發開火聲維持在 −15±2（K 加權 100 ms 瞬時）
 */
export const SFX_COMP = { threshold: -18, knee: 6, ratio: 3, attack: 0.01, release: 0.2, post: Math.pow(10, (-6.13 + 1) / 20) }

/** 這個瀏覽器已經有過使用者手勢（重新整理後 userActivation 不會保留，所以通常是 false；測試環境沒有 navigator）*/
function hasActivation(): boolean {
  try {
    return typeof navigator !== 'undefined' && !!(navigator as Navigator & { userActivation?: { hasBeenActive: boolean } }).userActivation?.hasBeenActive
  } catch {
    return false
  }
}

function ac(): AudioContext | null {
  if (ctx) return ctx
  // 瀏覽器環境：手勢之前不建立（Vitest 等沒有 window 的環境照舊，測試直接用）
  if (typeof window !== 'undefined' && !gestured && !hasActivation()) return null
  try {
    ctx = new AudioContext()
    master = ctx.createGain()
    // 母線：壓縮 → 補償增益 → 限幅（整體更大聲但不爆音）
    const comp = ctx.createDynamicsCompressor()
    comp.threshold.value = -16
    comp.knee.value = 12
    comp.ratio.value = 3.5
    comp.attack.value = 0.005
    comp.release.value = 0.2
    const makeup = ctx.createGain()
    makeup.gain.value = 1.5
    const limit = ctx.createDynamicsCompressor()
    limit.threshold.value = -3
    limit.knee.value = 0
    limit.ratio.value = 20
    limit.attack.value = 0.002
    limit.release.value = 0.1
    master.connect(comp).connect(makeup).connect(limit).connect(ctx.destination)
    for (const b of ['sfx', 'ui', 'music', 'ambient'] as Bus[]) {
      const g = ctx.createGain()
      g.connect(master)
      buses[b] = g
    }
    // 世界音效的 bus 壓縮器（第 7 輪：每秒 20 發＋痛叫＋核爆時母線壓縮器壓到 7.6 dB，音樂、環境音跟著被抽掉約 8 dB）。
    // 瀏覽器的 DynamicsCompressor 會自動加 makeup（這組參數約 +6.1 dB，離線量測）：後面的增益把它抵銷，門檻以下維持原音量
    const sc = ctx.createDynamicsCompressor()
    sc.threshold.value = SFX_COMP.threshold
    sc.knee.value = SFX_COMP.knee
    sc.ratio.value = SFX_COMP.ratio
    sc.attack.value = SFX_COMP.attack
    sc.release.value = SFX_COMP.release
    const sg = ctx.createGain()
    sg.gain.value = SFX_COMP.post
    sc.connect(sg).connect(buses.sfx!)
    sfxIn = sc
    applyPrefs()
    if (__TEST_HOOKS__) {
      // 測試 build：量測實際輸出音量（e2e 驗證背景音樂有在發聲）
      analyser = ctx.createAnalyser()
      analyser.fftSize = 2048
      master.connect(analyser)
    }
    noiseBuf = ctx.createBuffer(1, ctx.sampleRate * 1.5, ctx.sampleRate)
    const d = noiseBuf.getChannelData(0)
    for (let i = 0; i < d.length; i++) d[i] = Math.random() * 2 - 1
  } catch {
    ctx = null
  }
  return ctx
}

let analyser: AnalyserNode | null = null

/** 測試用：目前輸出的 RMS 音量 */
export function debugLevel(): number {
  if (!analyser) return 0
  const buf = new Float32Array(analyser.fftSize)
  analyser.getFloatTimeDomainData(buf)
  let s = 0
  for (const v of buf) s += v * v
  return Math.sqrt(s / buf.length)
}

/** 測試用：目前輸出的峰值 */
export function debugPeak(): number {
  if (!analyser) return 0
  const buf = new Float32Array(analyser.fftSize)
  analyser.getFloatTimeDomainData(buf)
  let m = 0
  for (const v of buf) m = Math.max(m, Math.abs(v))
  return m
}

/** 其他音訊模組（背景音樂、環境音）共用同一個 AudioContext 與分軌 */
export function audioContext(): AudioContext | null {
  return ac()
}
export function busNode(b: Bus): GainNode | null {
  return ac() ? (buses[b] ?? null) : null
}
export function noiseBuffer(): AudioBuffer | null {
  return ac() ? noiseBuf : null
}
export function audioRunning(): boolean {
  return !!ctx && ctx.state === 'running'
}

/**
 * 使用者手勢時解鎖音訊：第一次手勢才建立 AudioContext（在手勢裡建立就是 running，不會有警告）；
 * 之後若被瀏覽器暫停（例如分頁切回來），下一次手勢再 resume。
 */
export function unlockAudio(e?: Event): void {
  // Esc 不算使用者手勢（瀏覽器不會因為它允許播放）：在它裡面建立 context 一樣會被擋、留下警告
  if (e instanceof KeyboardEvent && e.key === 'Escape') return
  gestured = true
  const c = ac()
  if (c && c.state === 'suspended') void c.resume()
}

if (typeof window !== 'undefined') {
  // capture：比頁面上其他處理先跑（第一下點擊本身的按鈕音效也聽得到）
  window.addEventListener('pointerdown', unlockAudio, { capture: true })
  window.addEventListener('keydown', unlockAudio, { capture: true })
}

export function setListener(x: number, y: number): void {
  listener.x = x
  listener.y = y
}

export function listenerPos(): { x: number; y: number } {
  return listener
}

/** 介面與通知類的音效：不做距離衰減、走 ui 分軌 */
const UI_SOUNDS = new Set(['ui', 'uiHover', 'uiOpen', 'uiClose', 'error', 'notify', 'announce', 'eventSting', 'apocSting', 'chat', 'chatTeam', 'chatDead', 'join', 'leaveLobby', 'readyUp', 'gameStart', 'victory', 'defeat', 'revealHuman', 'revealXeno', 'revealMutant', 'revealAndroid', 'ready', 'cmdMove', 'cmdAttack', 'death', 'hurt', 'hurtBig', 'pickup', 'drop', 'epTick', 'heartbeat', 'countdown', 'countdownLast', 'deny', 'aimEnter'])

/** 混音：回饋音相對於背景音樂要聽得清楚（依 e2e 實測的峰值調整，目標：提示音約 0.06–0.1、重大事件約 0.12–0.15）*/
const GAIN: Record<string, number> = {
  ui: 1.6, uiHover: 1.8, uiOpen: 1.8, uiClose: 1.8, cmdMove: 2.6, cmdAttack: 2.4,
  error: 3.2, notify: 3.2, announce: 3.4, chat: 2.6, chatTeam: 2.6, chatDead: 2.4,
  // 開局與身分揭露原本跟核爆一樣響（K 加權瞬時 −5～−6.5）：壓到約 −11
  eventSting: 4.6, apocSting: 1.9, gameStart: 0.75, countdown: 4.2, countdownLast: 4.2,
  victory: 4, defeat: 5, revealHuman: 4.4, revealXeno: 3.4, revealMutant: 3.2, revealAndroid: 5,
  join: 2.6, leaveLobby: 2.4, readyUp: 2.6, pickup: 3.6, drop: 2.6, ready: 4.2, epTick: 2.8,
  step: 1.8, stepSoft: 2, stepHeavy: 1.4, scuttle: 1.5, squish: 1.5, doorOpen: 1.7, doorClose: 1.7,
  // ── 開火聲正規化：K 加權 100 ms 瞬時響度集中在 −15±2（R5-art 量測：原本狙擊 −9、鏈鋸 −25、吐酸 −30）──
  heavy: 0.7, gatling: 2.2, plasma: 2.1, void: 2.2, zap: 1.8, laser: 1.3, flame: 2.5, saw: 3, spit: 2.6,
  force: 1.15, mag: 1.15, rocket: 2, thump: 1.15, sniper: 0.45, arc: 1.4, chrono: 1.2, fireball: 1.9,
  silk: 2.3, spine: 1.7, throw: 5.6, cryo: 1.35, sludge: 2.6, rumble: 0.8, pulseWave: 1.6,
  // 嘶聲（原本 −4.6～−9.6，全遊戲最刺耳）：降約 10 dB、加 7 kHz 低通後的混音增益
  steam: 2.2, freeze: 1.9, weld: 2,
  // 近戰攻擊原本比槍聲小很多
  claw: 3.4, bite: 3,
  // 第 7 輪：變身原本 −23.8（比開門小聲），提到約 −13
  morph: 2.8,
  // 受傷：加了 2–4 kHz 的撕裂層之後約 −15（目標 −16；筆電喇叭上 ≥ −18）
  hurt: 0.9,
  // 環境小事件（第 7 輪）：原本比底噪小 10–20 dB（無線電 −51、資料聲 −48、氣泡 −44、電容 −41），再加上距離衰減就聽不到了
  radioChatter: 5, dataChirp: 4, bubble: 2.5, capWhine: 3.2, pebbles: 3.2, conveyor: 3.2, teleChime: 2.5, electricBuzz: 2.5,
  furnaceFlare: 2.5, creak: 2, birdcall: 2, sonarPing: 1.6, metalStress: 1.6,
}

// ───────── 同時發聲數上限（第 7 輪）─────────
// 世界音效（sfx 分軌）同時最多 16 聲、同一種最多 4 聲；超過時比較「距離衰減後的音量」：
// 新的比現有最小聲的還小 2 dB 以上就不播，否則把最小聲的那個約 15 ms 內淡掉讓位（遠的、小聲的先讓）。
// 介面、音樂、環境音分軌不受限制。

export const VOICE_LIMIT = { total: 16, perName: 4 }

interface Voice {
  group: string
  vol: number
  end: number
  g: GainNode
}

const voices: Voice[] = []

/** 測試用：目前還在響的世界音效數 */
export function voiceCount(): number {
  const t = ctx?.currentTime ?? 0
  return voices.filter((v) => v.end > t).length
}

/** 同種類的上限以「名稱」計；帶參數的合成（命中、叫聲）以 key 的前兩段計（hit:bullet、bark:human）*/
function voiceGroup(key: string): string {
  const i = key.indexOf(':')
  if (i < 0) return key
  const j = key.indexOf(':', i + 1)
  return j < 0 ? key : key.slice(0, j)
}

function steal(v: Voice, now: number): void {
  try {
    v.g.gain.cancelScheduledValues(now)
    v.g.gain.setTargetAtTime(0, now, 0.005)
  } catch {
    /* ignore */
  }
  v.end = now
}

/**
 * 能不能再發一聲（必要時讓出最小聲的）；回傳 false = 這一聲不播。
 * 新的比現有最小聲的還小 2 dB 以上才丟掉新的；差不多大聲就讓最小聲（同樣大聲時是最舊）的那個讓位——新的聲音比較重要
 */
function admit(group: string, vol: number, now: number): boolean {
  for (let i = voices.length - 1; i >= 0; i--) if (voices[i].end <= now) voices.splice(i, 1)
  const quietest = (list: Voice[]) => list.reduce<Voice | null>((m, v) => (!m || v.vol < m.vol ? v : m), null)
  const make = (list: Voice[], cap: number): boolean => {
    if (list.length < cap) return true
    const q = quietest(list)!
    if (vol < q.vol * 0.8) return false
    steal(q, now)
    voices.splice(voices.indexOf(q), 1)
    return true
  }
  return make(voices.filter((v) => v.group === group), VOICE_LIMIT.perName) && make(voices, VOICE_LIMIT.total)
}

/** 正在合成的這一聲：各合成工具把自己的結束時間記進來（估計這一聲什麼時候結束）*/
let synthEnd = 0
/** 正在合成的這一聲的音高倍率與長度倍率（隨機變化；1 = 不變）*/
let pj = 1
let dj = 1

/** 自訂合成（combat.ts 的人聲）用：登記這一聲到什麼時候還有聲音 */
export function noteEnd(t: number): void {
  if (t > synthEnd) synthEnd = t
}

/** 這一聲距離衰減後的音量與左右定位；聽不到（< 0.01）回傳 null */
function place(x: number | undefined, y: number | undefined, gain: number): { vol: number; pan: number; att: number } | null {
  let vol = gain
  let pan = 0
  if (x !== undefined && y !== undefined) {
    const dx = x - listener.x
    const dy = y - listener.y
    const d = Math.hypot(dx, dy)
    vol *= Math.max(0, 1 - d / 32) ** 1.2
    pan = audioPrefs.value.mono ? 0 : Math.max(-1, Math.min(1, dx / 14))
  }
  return vol < 0.01 ? null : { vol, pan, att: vol / Math.max(1e-9, gain) }
}

/** 建立這一聲的輸出（增益 → 定位 → 分軌）；世界音效先過同時發聲數上限，回傳的 voice 由呼叫端補上結束時間 */
function out(group: string, x: number | undefined, y: number | undefined, gain: number, b: Bus): { g: GainNode; v: Voice | null; att: number } | null {
  const c = ac()
  const dest = b === 'sfx' ? sfxIn : buses[b]
  if (!c || !dest) return null
  const pl = place(x, y, gain)
  if (!pl) return null
  const now = c.currentTime
  if (b === 'sfx' && !admit(group, pl.vol, now)) return null
  const g = c.createGain()
  g.gain.value = pl.vol
  const p = c.createStereoPanner()
  p.pan.value = pl.pan
  g.connect(p).connect(dest)
  let v: Voice | null = null
  if (b === 'sfx') {
    v = { group, vol: pl.vol, end: now + 2, g }
    voices.push(v)
  }
  return { g, v, att: pl.att }
}

/** 跑一段合成：期間套用音高、長度倍率，記錄結束時間；回傳這一聲的結束時間 */
function runSynth(now: number, pitch: number, len: number, fn: () => void): number {
  synthEnd = now + 0.08
  pj = pitch
  dj = len
  try {
    fn()
  } finally {
    pj = 1
    dj = 1
  }
  return synthEnd
}

/** 有隨機變化的聲音，每次的長度（衰減時間）也差 ±10%：只變音高的話包絡幾乎一模一樣 */
const lenJitter = (on: boolean) => (on ? 0.9 + Math.random() * 0.2 : 1)

/** 隨機 ±db 分貝（線性倍率）*/
const dbJitter = (db: number) => (db > 0 ? Math.pow(10, ((Math.random() * 2 - 1) * db) / 20) : 1)

export function noise(dest: AudioNode, t0: number, len: number, f0: number, f1: number, q = 1, type: BiquadFilterType = 'bandpass', amp = 1): void {
  const dur = len * dj
  const c = ctx!
  const src = c.createBufferSource()
  src.buffer = noiseBuf
  const f = c.createBiquadFilter()
  f.type = type
  f.Q.value = q
  f.frequency.setValueAtTime(f0 * pj, t0)
  f.frequency.exponentialRampToValueAtTime(Math.max(20, f1 * pj), t0 + dur)
  const g = c.createGain()
  g.gain.setValueAtTime(amp, t0)
  g.gain.exponentialRampToValueAtTime(0.001, t0 + dur)
  src.connect(f).connect(g).connect(dest)
  src.start(t0, Math.random() * 0.5)
  src.stop(t0 + dur + 0.05)
  noteEnd(t0 + dur + 0.05)
}

/**
 * 機械瞬態（第 7 輪）：3–8 ms、4–8 kHz 的金屬撞針／槍機聲。原本武器、命中、介面的頻譜重心全擠在 1.2–1.9 kHz，
 * 4 kHz 以上只有 2–16%；加這一層讓開火聲在混戰裡有自己的位置。不走嘶聲（不是持續的高頻）。
 */
export function mech(dest: AudioNode, t0: number, amp = 0.5, f = 5600, dur = 0.006): void {
  noise(dest, t0, dur, f, f * 0.8, 1.6, 'bandpass', amp)
}

/**
 * 嘶聲（蒸汽、冷凍、焊接）：高通 → 固定約 7 kHz 低通（拿掉刺耳的極高頻）→ 短起音、指數淡出。
 * 原本這類音只用一個高通濾波器，能量全堆在 8 kHz 以上，是全遊戲最刺耳的聲音。
 */
export function hiss(dest: AudioNode, t0: number, len: number, hp0: number, hp1: number, amp: number, lp = 7000, att = 0.015): void {
  const dur = len * dj
  const c = ctx!
  const src = c.createBufferSource()
  src.buffer = noiseBuf
  const h = c.createBiquadFilter()
  h.type = 'highpass'
  h.Q.value = 0.6
  // 音高變化只動高通（低通上限固定，嘶聲不超過 7 kHz）
  h.frequency.setValueAtTime(hp0 * pj, t0)
  h.frequency.exponentialRampToValueAtTime(Math.max(20, hp1 * pj), t0 + dur)
  const l = c.createBiquadFilter()
  l.type = 'lowpass'
  l.Q.value = 0.5
  l.frequency.value = lp
  const g = c.createGain()
  g.gain.setValueAtTime(0.0001, t0)
  g.gain.exponentialRampToValueAtTime(amp, t0 + att)
  g.gain.exponentialRampToValueAtTime(0.0001, t0 + dur)
  src.connect(h).connect(l).connect(g).connect(dest)
  src.start(t0, Math.random() * 0.5)
  src.stop(t0 + dur + 0.05)
  noteEnd(t0 + dur + 0.05)
}

export function tone(dest: AudioNode, t0: number, len: number, f0: number, f1: number, type: OscillatorType = 'sine', amp = 0.5): void {
  const dur = len * dj
  const c = ctx!
  const o = c.createOscillator()
  o.type = type
  o.frequency.setValueAtTime(f0 * pj, t0)
  o.frequency.exponentialRampToValueAtTime(Math.max(20, f1 * pj), t0 + dur)
  const g = c.createGain()
  g.gain.setValueAtTime(0.0001, t0)
  g.gain.exponentialRampToValueAtTime(amp, t0 + 0.005)
  g.gain.exponentialRampToValueAtTime(0.0001, t0 + dur)
  o.connect(g).connect(dest)
  o.start(t0)
  o.stop(t0 + dur + 0.05)
  noteEnd(t0 + dur + 0.05)
}

/** 緩起音的持續音（充能、嗡鳴）*/
export function swell(dest: AudioNode, t0: number, len: number, f0: number, f1: number, type: OscillatorType = 'sine', amp = 0.3, att = 0.5): void {
  const dur = len * dj
  const c = ctx!
  const o = c.createOscillator()
  o.type = type
  o.frequency.setValueAtTime(f0 * pj, t0)
  o.frequency.exponentialRampToValueAtTime(Math.max(20, f1 * pj), t0 + dur)
  const g = c.createGain()
  g.gain.setValueAtTime(0.0001, t0)
  g.gain.exponentialRampToValueAtTime(amp, t0 + Math.max(0.01, dur * att))
  g.gain.exponentialRampToValueAtTime(0.0001, t0 + dur)
  o.connect(g).connect(dest)
  o.start(t0)
  o.stop(t0 + dur + 0.05)
  noteEnd(t0 + dur + 0.05)
}

/** FM 合成（金屬撞擊、鐘聲、電子音）*/
export function fm(dest: AudioNode, t0: number, len: number, carrier: number, ratio: number, index: number, amp = 0.3, type: OscillatorType = 'sine'): void {
  const dur = len * dj
  const c = ctx!
  const car = c.createOscillator()
  car.type = type
  const cf = carrier * pj
  car.frequency.setValueAtTime(cf, t0)
  const mod = c.createOscillator()
  mod.frequency.setValueAtTime(cf * ratio, t0)
  const mg = c.createGain()
  mg.gain.setValueAtTime(cf * index, t0)
  mg.gain.exponentialRampToValueAtTime(Math.max(1, cf * index * 0.05), t0 + dur)
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
  noteEnd(t0 + dur + 0.05)
}

/** 一串隨機短促的雜訊爆點（蓋革計數器、電弧劈啪、翻找）*/
export function ticks(dest: AudioNode, t0: number, dur: number, n: number, f: number, amp = 0.5, q = 4): void {
  for (let i = 0; i < n; i++) noise(dest, t0 + Math.random() * dur, 0.012 + Math.random() * 0.02, f * (0.7 + Math.random() * 0.6), f * 0.5, q, 'bandpass', amp * (0.5 + Math.random() * 0.5))
}

/** 低頻轟鳴（地震、核爆尾音）*/
export function rumble(dest: AudioNode, t0: number, dur: number, amp = 1, f = 180): void {
  noise(dest, t0, dur, f, 30, 0.7, 'lowpass', amp)
  tone(dest, t0, dur * 0.8, 48, 26, 'sine', amp * 0.6)
}

/** 濾波的鋸齒波（銅管般的鋪底、下墜音）：起音 att 秒，低通從 lp0 掃到 lp1 */
export function buzz(dest: AudioNode, t0: number, len: number, f0: number, f1: number, amp: number, lp0: number, lp1: number, att = 0.02, q = 1): void {
  const dur = len * dj
  const c = ctx!
  const o = c.createOscillator()
  o.type = 'sawtooth'
  o.frequency.setValueAtTime(f0 * pj, t0)
  o.frequency.exponentialRampToValueAtTime(Math.max(20, f1 * pj), t0 + dur)
  const f = c.createBiquadFilter()
  f.type = 'lowpass'
  f.Q.value = q
  f.frequency.setValueAtTime(lp0, t0)
  f.frequency.exponentialRampToValueAtTime(Math.max(40, lp1), t0 + dur)
  const g = c.createGain()
  g.gain.setValueAtTime(0.0001, t0)
  g.gain.exponentialRampToValueAtTime(amp, t0 + Math.max(0.003, att))
  g.gain.exponentialRampToValueAtTime(0.0001, t0 + dur)
  o.connect(f).connect(g).connect(dest)
  o.start(t0)
  o.stop(t0 + dur + 0.05)
  noteEnd(t0 + dur + 0.05)
}

/** 低吼：鋸齒波 → 方波振幅調變（喉音的粗糙感）→ 三個共振峰帶通 → 包絡 */
export function growl(dest: AudioNode, t0: number, len: number, f0: number, f1: number, amp: number, rough = 23): void {
  const dur = len * dj
  const c = ctx!
  const o = c.createOscillator()
  o.type = 'sawtooth'
  o.frequency.setValueAtTime(f0 * pj, t0)
  o.frequency.exponentialRampToValueAtTime(Math.max(20, f1 * pj), t0 + dur)
  const am = c.createGain()
  am.gain.value = 0.6
  const l = c.createOscillator()
  l.type = 'square'
  l.frequency.value = rough
  const lg = c.createGain()
  lg.gain.value = 0.4
  l.connect(lg).connect(am.gain)
  const env = c.createGain()
  env.gain.setValueAtTime(0.0001, t0)
  env.gain.exponentialRampToValueAtTime(amp, t0 + 0.06)
  env.gain.setValueAtTime(amp, t0 + dur * 0.4)
  env.gain.exponentialRampToValueAtTime(0.0001, t0 + dur)
  o.connect(am)
  for (const [f, k] of [[480, 1], [1150, 0.6], [2600, 0.25]] as const) {
    const bp = c.createBiquadFilter()
    bp.type = 'bandpass'
    bp.frequency.value = f * pj
    bp.Q.value = 5
    const fg = c.createGain()
    fg.gain.value = k
    am.connect(bp).connect(fg).connect(env)
  }
  env.connect(dest)
  o.start(t0)
  l.start(t0)
  o.stop(t0 + dur + 0.05)
  l.stop(t0 + dur + 0.05)
  noteEnd(t0 + dur + 0.05)
}

/** 介面、通知與回饋音（不做空間定位）。回傳 false 表示交給下面的通用音效表 */
function uiSound(name: string, d: AudioNode, now: number): boolean {
  switch (name) {
    case 'uiHover':
      // 介面音往 2.5–6 kHz 移（第 7 輪：武器、命中、介面、痛叫的頻譜重心全擠在 1.2–1.9 kHz）
      tone(d, now, 0.03, 3100, 2900, 'sine', 0.03)
      return true
    case 'uiOpen':
      tone(d, now, 0.14, 380, 920, 'triangle', 0.09)
      noise(d, now, 0.12, 2400, 5200, 1.2, 'bandpass', 0.08)
      return true
    case 'uiClose':
      tone(d, now, 0.12, 900, 360, 'triangle', 0.08)
      noise(d, now, 0.1, 4200, 1800, 1.2, 'bandpass', 0.06)
      return true
    case 'error':
      tone(d, now, 0.075, 185, 175, 'square', 0.09)
      tone(d, now + 0.095, 0.11, 150, 140, 'square', 0.09)
      // 蜂鳴器的粗糙泛音（1–3.5 kHz）：戰鬥中原本在 2–8 kHz 被蓋過
      buzz(d, now, 0.075, 370, 350, 0.035, 3500, 2400, 0.004, 0.7)
      buzz(d, now + 0.095, 0.11, 300, 280, 0.035, 3200, 2200, 0.004, 0.7)
      return true
    case 'notify':
      fm(d, now, 0.45, 1318.5, 2, 1.4, 0.1)
      fm(d, now + 0.085, 0.6, 1760, 2, 1.1, 0.07)
      // 高八度的泛音：混戰裡不被槍聲蓋掉
      tone(d, now, 0.3, 2637, 2637, 'sine', 0.025)
      tone(d, now + 0.085, 0.4, 3520, 3520, 'sine', 0.02)
      return true
    case 'announce':
      // 站內廣播的兩聲提示音（帶一點回音）
      for (const [i, f] of [[0, 659.3], [1, 987.8]] as const) {
        tone(d, now + i * 0.22, 0.5, f, f, 'sine', 0.1)
        tone(d, now + i * 0.22 + 0.13, 0.45, f, f, 'sine', 0.035)
      }
      return true
    case 'eventSting':
      swell(d, now, 2.2, 110, 104, 'sawtooth', 0.05, 0.35)
      swell(d, now, 2.2, 164.8, 156, 'sawtooth', 0.035, 0.35)
      for (const [i, f] of [[0, 880], [1, 659.3], [2, 523.3]] as const) fm(d, now + 0.25 + i * 0.28, 1.2, f, 3.01, 0.9, 0.06)
      return true
    case 'apocSting':
      swell(d, now, 3.4, 55, 52, 'sawtooth', 0.12, 0.25)
      swell(d, now, 3.4, 82.4, 78, 'sawtooth', 0.08, 0.25)
      swell(d, now + 0.4, 3, 116.5, 110, 'square', 0.03, 0.4)
      rumble(d, now, 3, 0.5)
      // 中高頻（第 7 輪）：原本 87% 能量在 60 Hz 以下，筆電喇叭上 −20.8。加一組銅管般的小三和弦齊奏（低通慢慢打開）＋金屬鐘響
      for (const [f, a] of [[220, 0.12], [261.6, 0.08], [329.6, 0.08], [440, 0.05]] as const) buzz(d, now + 0.05, 3, f, f * 0.97, a, 700, 2600, 0.5, 2)
      fm(d, now, 2.6, 440, 1.41, 3, 0.1)
      fm(d, now + 0.02, 2.2, 1318.5, 1.41, 1.6, 0.04)
      return true
    case 'chat':
      tone(d, now, 0.05, 1180, 1240, 'sine', 0.05)
      tone(d, now + 0.05, 0.06, 1480, 1500, 'sine', 0.04)
      return true
    case 'chatTeam':
      fm(d, now, 0.18, 740, 1.5, 2.5, 0.06)
      fm(d, now + 0.08, 0.22, 554, 1.5, 2.5, 0.05)
      return true
    case 'chatDead':
      tone(d, now, 0.25, 330, 300, 'sine', 0.05)
      tone(d, now + 0.02, 0.3, 333, 302, 'sine', 0.04)
      return true
    case 'join':
      tone(d, now, 0.12, 523.3, 523.3, 'triangle', 0.09)
      tone(d, now + 0.1, 0.18, 784, 784, 'triangle', 0.09)
      return true
    case 'leaveLobby':
      tone(d, now, 0.12, 784, 784, 'triangle', 0.08)
      tone(d, now + 0.1, 0.18, 523.3, 523.3, 'triangle', 0.08)
      return true
    case 'readyUp':
      tone(d, now, 0.07, 880, 880, 'square', 0.04)
      tone(d, now + 0.07, 0.12, 1318.5, 1318.5, 'square', 0.04)
      return true
    case 'countdown':
      // 倒數最後幾秒：每秒一聲短促的電子音（發射、自爆）
      tone(d, now, 0.07, 1000, 1000, 'square', 0.05)
      tone(d, now, 0.09, 500, 500, 'sine', 0.06)
      return true
    case 'countdownLast':
      // 最後一秒：高八度、拉長
      tone(d, now, 0.22, 2000, 2000, 'square', 0.04)
      tone(d, now, 0.25, 1000, 1000, 'sine', 0.07)
      return true
    case 'gameStart':
      noise(d, now, 1.2, 300, 4000, 0.8, 'bandpass', 0.25)
      swell(d, now, 1.6, 73.4, 146.8, 'sawtooth', 0.07, 0.8)
      tone(d, now + 1.2, 0.9, 98, 40, 'sine', 0.5)
      noise(d, now + 1.2, 0.8, 900, 80, 0.7, 'lowpass', 0.5)
      return true
    case 'victory':
      for (const [i, f] of [[0, 523.3], [1, 659.3], [2, 784], [3, 1046.5]] as const) fm(d, now + i * 0.16, 1.6, f, 2, 1.2, 0.08)
      swell(d, now + 0.5, 2.6, 261.6, 261.6, 'sawtooth', 0.04, 0.3)
      swell(d, now + 0.5, 2.6, 392, 392, 'sawtooth', 0.03, 0.3)
      return true
    case 'defeat':
      for (const [i, f] of [[0, 587.3], [1, 523.3], [2, 466.2], [3, 349.2]] as const) tone(d, now + i * 0.32, 1.1, f, f * 0.98, 'triangle', 0.08)
      swell(d, now + 0.3, 3, 87.3, 82, 'sawtooth', 0.06, 0.3)
      return true
    case 'revealHuman':
      for (const f of [293.7, 370, 440]) swell(d, now, 2, f, f, 'sawtooth', 0.04, 0.25)
      fm(d, now + 0.1, 1.4, 880, 2, 0.8, 0.05)
      return true
    case 'revealXeno':
      fm(d, now, 2.4, 220, 1.414, 6, 0.07)
      swell(d, now, 2.4, 110, 116.5, 'sawtooth', 0.05, 0.6)
      noise(d, now, 2, 500, 3500, 6, 'bandpass', 0.06)
      return true
    case 'revealMutant':
      swell(d, now, 2.2, 73.4, 65.4, 'sawtooth', 0.09, 0.3)
      swell(d, now, 2.2, 77.8, 69.3, 'sawtooth', 0.06, 0.3)
      noise(d, now, 1.6, 400, 120, 1.2, 'lowpass', 0.35)
      return true
    case 'revealAndroid':
      for (let i = 0; i < 6; i++) tone(d, now + i * 0.07, 0.06, [880, 1318.5, 1760, 1318.5, 2093, 2637][i], [880, 1318.5, 1760, 1318.5, 2093, 2637][i], 'square', 0.035)
      swell(d, now + 0.3, 1.6, 220, 220, 'triangle', 0.06, 0.2)
      return true
    case 'ready':
      fm(d, now, 0.5, 2093, 3.5, 0.6, 0.045)
      return true
    // 指令確認音（第 7 輪重做）：原本 −32／−29（比槍聲小 15–17 dB），能量在 1–3 kHz 的窄帶，混戰裡聽不到。
    // 兩層、40–60 ms，能量在 2.5–5 kHz；每次音高 ±5%（VARY）。移動 = 上行、清脆；攻擊 = 下行、粗糙，一聽就分得出來
    case 'cmdMove':
      tone(d, now, 0.045, 3000, 3500, 'triangle', 0.1)
      noise(d, now, 0.01, 4800, 4200, 2.5, 'bandpass', 0.45)
      return true
    case 'cmdAttack':
      tone(d, now, 0.055, 2600, 1750, 'square', 0.05)
      noise(d, now, 0.02, 3400, 2600, 1.6, 'bandpass', 0.5)
      return true
    case 'death':
      rumble(d, now, 1.6, 0.6)
      tone(d, now, 1.3, 196, 98, 'sawtooth', 0.08)
      // 中高頻（第 7 輪：原本 91% 能量在 60 Hz 以下，筆電喇叭上掉 10.8 dB）：倒地的撞擊、往下墜的共振音、更清楚的耳鳴
      noise(d, now, 0.4, 1800, 450, 1.1, 'bandpass', 0.5)
      buzz(d, now, 1.4, 392, 98, 0.09, 2400, 300, 0.01, 3)
      tone(d, now + 0.05, 2.2, 1568, 1550, 'sine', 0.07)
      tone(d, now + 0.05, 2, 3136, 3100, 'sine', 0.015)
      return true
    case 'hurt':
      tone(d, now, 0.16, 150, 60, 'sine', 0.26)
      noise(d, now, 0.08, 900, 200, 0.8, 'lowpass', 0.22)
      // 撕裂＋抽氣（第 7 輪）：原本 99% 能量在 60–250 Hz，戰鬥中每個頻帶都被蓋過，筆電喇叭上只剩 −29.6。
      // 2–4 kHz、約 0.12 秒：幾個不規則的撕裂爆點＋一口短促的氣音
      ticks(d, now, 0.06, 4, 3000, 0.9, 2.5)
      hiss(d, now + 0.01, 0.12, 2000, 2600, 0.8, 4200, 0.015)
      return true
    case 'hurtBig':
      tone(d, now, 0.28, 130, 45, 'sine', 0.45)
      noise(d, now, 0.18, 2600, 300, 0.7, 'bandpass', 0.35)
      ticks(d, now, 0.09, 6, 2800, 0.4, 2.5)
      hiss(d, now + 0.015, 0.18, 1800, 2400, 0.2, 4000, 0.02)
      return true
    case 'pickup':
      tone(d, now, 0.07, 660, 990, 'triangle', 0.07)
      tone(d, now + 0.06, 0.1, 990, 1320, 'triangle', 0.06)
      tone(d, now + 0.06, 0.1, 2640, 3960, 'sine', 0.02)
      return true
    case 'drop':
      // 丟棄：pickup 的反向下行音＋落地的輕悶響
      tone(d, now, 0.1, 620, 300, 'triangle', 0.06)
      tone(d, now + 0.08, 0.09, 150, 70, 'sine', 0.12)
      noise(d, now + 0.08, 0.07, 900, 250, 1, 'lowpass', 0.1)
      return true
    case 'epTick':
      tone(d, now, 0.14, 220, 330, 'sine', 0.045)
      tone(d, now + 0.03, 0.14, 224, 336, 'sine', 0.03)
      return true
  }
  return false
}

/** 新增的世界音效（門、腳步、環境小事件）；回傳 false 交給通用表 */
function worldSound(name: string, d: AudioNode, now: number): boolean {
  switch (name) {
    case 'doorOpen':
      noise(d, now, 0.32, 1800, 600, 1.4, 'bandpass', 0.22)
      tone(d, now, 0.3, 90, 140, 'sawtooth', 0.04)
      tone(d, now + 0.28, 0.06, 220, 160, 'square', 0.05)
      return true
    case 'doorClose':
      noise(d, now, 0.26, 700, 1600, 1.4, 'bandpass', 0.2)
      tone(d, now + 0.22, 0.12, 120, 60, 'sine', 0.22)
      noise(d, now + 0.22, 0.06, 1200, 300, 1, 'lowpass', 0.25)
      return true
    case 'step':
      noise(d, now, 0.05, 1400 + Math.random() * 500, 400, 1.6, 'bandpass', 0.11)
      tone(d, now, 0.04, 110 + Math.random() * 20, 70, 'sine', 0.06)
      // 鞋底摩擦（2–3 kHz，第 7 輪）：原本 77% 能量在 60–250 Hz，小喇叭上聽不到有人走近
      noise(d, now + 0.006, 0.035, 2500 + Math.random() * 500, 2000, 2, 'bandpass', 0.07)
      return true
    case 'stepHeavy':
      noise(d, now, 0.08, 700 + Math.random() * 200, 160, 1.2, 'lowpass', 0.2)
      tone(d, now, 0.07, 75, 40, 'sine', 0.14)
      noise(d, now + 0.01, 0.04, 3200, 2000, 3, 'bandpass', 0.05)
      noise(d, now + 0.006, 0.05, 2300 + Math.random() * 400, 1800, 2, 'bandpass', 0.07)
      return true
    case 'stepSoft':
      noise(d, now, 0.06, 900, 300, 0.8, 'lowpass', 0.08)
      return true
    case 'scuttle':
      ticks(d, now, 0.12, 4, 2600, 0.12, 5)
      return true
    case 'squish':
      noise(d, now, 0.1, 500, 200, 2, 'bandpass', 0.12)
      tone(d, now, 0.08, 160, 110, 'sine', 0.05)
      // 黏膩的「啪」（2–3 kHz）：異形、突變體走路在小喇叭上也聽得到
      noise(d, now + 0.01, 0.025, 2400 + Math.random() * 500, 1800, 2, 'bandpass', 0.05)
      return true
    case 'ventHiss':
      // 原本是 5 kHz 高通（頻譜重心 13 kHz）；改走嘶聲（7 kHz 上限、緩起音）
      hiss(d, now, 1.6, 2600, 2000, 0.06, 7000, 0.35)
      return true
    case 'creak':
      tone(d, now, 0.9, 72, 64, 'sawtooth', 0.025)
      tone(d, now + 0.1, 0.7, 108, 96, 'triangle', 0.02)
      return true
    case 'clankFar':
      fm(d, now, 0.9, 160 + Math.random() * 80, 2.73, 4, 0.05)
      return true
    case 'drip':
      tone(d, now, 0.08, 1700 + Math.random() * 600, 900, 'sine', 0.04)
      return true
    case 'electricBuzz':
      tone(d, now, 0.5, 120, 120, 'sawtooth', 0.02)
      ticks(d, now, 0.45, 6, 4200, 0.06)
      return true
    case 'windGust':
      noise(d, now, 3, 400, 900, 0.6, 'bandpass', 0.1)
      return true
    case 'birdcall':
      tone(d, now, 0.12, 2400, 3200, 'sine', 0.025)
      tone(d, now + 0.16, 0.1, 2600, 3500, 'sine', 0.02)
      return true
    case 'hullGroan':
      swell(d, now, 2.4, 46, 40, 'sawtooth', 0.04, 0.5)
      return true
    case 'radioChatter':
      // 遠處的無線電：開頭、結尾各一聲靜噪（squelch），中間是幾個像音節的窄帶雜訊
      noise(d, now, 0.03, 3200, 2600, 1.5, 'bandpass', 0.05)
      for (let i = 0; i < 5; i++) noise(d, now + 0.04 + i * 0.11, 0.08, 1500 + Math.random() * 900, 1300, 6, 'bandpass', 0.05)
      noise(d, now + 0.62, 0.04, 3000, 2400, 1.5, 'bandpass', 0.05)
      return true
    // ── 各站特色的環境小事件（ambient.ts 的 FLAVOR_EVENTS／MICRO）──
    case 'pebbles':
      // 低重力下滾落的碎石
      ticks(d, now, 0.7, 7, 1300, 0.07, 2)
      noise(d, now + 0.1, 0.5, 700, 200, 1, 'lowpass', 0.03)
      return true
    case 'quakeFar':
      // 遠處的地鳴（由地面傳來）
      noise(d, now, 1.6, 140, 40, 0.8, 'lowpass', 0.1)
      tone(d, now, 1.3, 36, 28, 'sine', 0.05)
      return true
    case 'dataChirp':
      for (let i = 0; i < 3; i++) tone(d, now + i * 0.07, 0.04, 2100 + Math.random() * 900, 2400, 'sine', 0.012)
      return true
    case 'sonarPing':
      tone(d, now, 0.7, 1400, 1380, 'sine', 0.02)
      tone(d, now + 0.38, 0.6, 1400, 1380, 'sine', 0.007)
      return true
    case 'capWhine':
      swell(d, now, 1.4, 260, 1100, 'sine', 0.012, 0.8)
      return true
    case 'furnaceFlare':
      noise(d, now, 1.3, 420, 140, 0.9, 'lowpass', 0.08)
      ticks(d, now + 0.2, 0.8, 5, 1800, 0.05, 2)
      return true
    case 'conveyor':
      for (let i = 0; i < 5; i++) fm(d, now + i * 0.3, 0.12, 140 + Math.random() * 20, 2.7, 3, 0.02)
      return true
    case 'teleChime':
      tone(d, now, 0.5, 880, 880, 'triangle', 0.015)
      tone(d, now + 0.18, 0.7, 659.3, 659.3, 'triangle', 0.015)
      return true
    case 'metalStress':
      swell(d, now, 2.2, 64, 52, 'sawtooth', 0.03, 0.6)
      tone(d, now + 0.4, 1.4, 210, 170, 'triangle', 0.012)
      return true
    case 'bubble': {
      // 培養槽的氣泡：上滑的短正弦
      const f = 320 + Math.random() * 380
      tone(d, now, 0.05 + Math.random() * 0.03, f, f * 1.9, 'sine', 0.03)
      return true
    }
  }
  return false
}

const last = new Map<string, number>()

// ───────── zone 閘門 ─────────
// 特效發生在別的 zone（例如在太空駕駛站點時，站內的槍戰）：定位音效不播，否則會用不相干的座標算距離，聽起來像在身邊。
let gateMuted = false

/** 設定閘門，回傳原本的值（呼叫端負責還原）*/
export function setSfxGate(muted: boolean): boolean {
  const prev = gateMuted
  gateMuted = muted
  return prev
}

export function sfxGate(): boolean {
  return gateMuted
}

/** 音效的基準增益（玩家回饋：原本 0.5 太小聲）*/
const SFX_BASE = 0.75

// ───────── 外掛音效表（戰鬥、叫聲等模組在載入時註冊，避免循環 import）─────────

type SoundFn = (d: AudioNode, now: number, arg?: number) => void
const EXTRA = new Map<string, SoundFn>()

/** 註冊具名的世界音效；gain 為混音增益（同 GAIN 表）。arg = 帶參數播放時的參數（例如 castCharge 的進度）*/
export function regSound(name: string, fn: SoundFn, gain = 1): void {
  EXTRA.set(name, fn)
  GAIN[name] = gain
}

// ───────── 側鏈壓低音樂 ─────────

/** gun = 附近開火、爆炸（k = 距離衰減 0–1）；hurt = 自己被打 */
export type DuckKind = 'gun' | 'hurt'
type DuckHook = (kind: DuckKind, k: number) => void
let duckHook: DuckHook | null = null

/** 背景音樂引擎建立時註冊（sfx 不 import music，避免循環）*/
export function setDuckHook(fn: DuckHook | null): void {
  duckHook = fn
}

/** 開火聲（第 7 輪：每發隨機 ±6% 音高、±1.5 dB；附近開火時壓低音樂）*/
const WEAPONS = ['pistol', 'rifle', 'heavy', 'sniper', 'gatling', 'plasma', 'void', 'zap', 'laser', 'flame', 'saw', 'spit', 'force', 'mag', 'rocket', 'thump', 'arc', 'chrono', 'fireball', 'silk', 'spine', 'throw', 'cryo', 'sludge', 'rumble', 'pulseWave', 'claw', 'bite', 'spore']
/** 每次播放的隨機變化 [音高 ±比例, 音量 ±dB]：同一把槍連開 20 發包絡相關 0.996、受傷聲 0.999，聽起來像同一個樣本在重複 */
const VARY: Record<string, [number, number]> = {}
for (const n of WEAPONS) VARY[n] = [0.06, 1.5]
// 機槍自己就有 ±7% 的音高變化（照它的做法，這裡只加音量變化）
VARY.gatling = [0, 1.5]
for (const n of ['splat', 'clang', 'glass', 'whiff', 'step', 'stepHeavy', 'stepSoft', 'scuttle', 'squish', 'hurt', 'hurtBig']) VARY[n] = [0.06, 1.5]
// 指令確認音：只變音高（±5%），音量一致
VARY.cmdMove = [0.05, 0]
VARY.cmdAttack = [0.05, 0]
const NO_VARY: [number, number] = [0, 0]
/** 帶參數的合成（命中、揮擊）也加變化 */
const SYNTH_VARY = /^(hit:|swing$)/

/** 機械瞬態 [音量, 中心頻率]：實彈武器是撞針／槍機，能量武器是放電的「啪」*/
const MECH: Record<string, [number, number]> = {
  pistol: [0.55, 5600], rifle: [0.6, 5200], heavy: [0.6, 4800], sniper: [0.7, 5000], gatling: [0.4, 5800], thump: [0.45, 4600], rocket: [0.4, 4400], spine: [0.35, 6200],
  plasma: [0.3, 6800], void: [0.3, 6400], laser: [0.3, 7200], arc: [0.25, 7000], pulseWave: [0.3, 6000], chrono: [0.25, 6600],
}

/** 實彈武器（加隨機的牆面回聲）*/
const SLAP = new Set(['pistol', 'rifle', 'heavy', 'sniper', 'thump'])

/** 會壓低音樂的聲音：開火、爆炸 */
const DUCK_ON = new Set([...WEAPONS, 'boom', 'bigBoom', 'nuke', 'slam', 'smash', 'impact'])

/** 節流（同名音效最短間隔，秒）：機槍 0.06；「不行」連按時不要變成噪音 */
const MIN_GAP: Record<string, number> = { gatling: 0.06, deny: 0.12, aimEnter: 0.08 }

/**
 * 直接播放一段自訂合成（帶參數的音效，例如每個角色音高不同的叫聲）。
 * 沿用節流（以 key 計）、距離衰減、分軌與同時發聲數上限。
 */
export function playSynth(key: string, x: number | undefined, y: number | undefined, gain: number, fn: SoundFn, minGap = 0.03, b: Bus = 'sfx'): boolean {
  if (gateMuted && x !== undefined) return false
  const c = ac()
  if (!c || c.state !== 'running') return false
  const now = c.currentTime
  if ((last.get(key) ?? -1) > now - minGap) return false
  const vary = SYNTH_VARY.test(key)
  const o = out(voiceGroup(key), x, y, SFX_BASE * gain * (vary ? dbJitter(1.5) : 1), b)
  if (!o) return false
  last.set(key, now)
  const end = runSynth(now, vary ? 1 + (Math.random() * 2 - 1) * 0.06 : 1, lenJitter(vary), () => fn(o.g, now))
  if (o.v) o.v.end = end
  return true
}

export function sfx(name: string, x?: number, y?: number, b?: Bus, gain = 1): void {
  play(name, x, y, b, gain)
}

/**
 * 施法充能（帶進度）：k = 詠唱進度 0–1，音高隨進度往上爬（5 秒的引導每 0.6 秒充一次，不會每下都一樣）。
 * sfx('castCharge') 等於 k = 0。
 */
export function castCharge(x: number, y: number, k: number): void {
  play('castCharge', x, y, undefined, 1, Math.max(0, Math.min(1, Number.isFinite(k) ? k : 0)))
}

function play(name: string, x: number | undefined, y: number | undefined, b: Bus | undefined, gain: number, arg?: number): boolean {
  const ui = UI_SOUNDS.has(name)
  if (gateMuted && !ui && x !== undefined) return false
  const c = ac()
  if (!c || c.state !== 'running') return false
  const now = c.currentTime
  // 同一音效節流，避免機槍一秒 20 發把耳朵打爆
  if ((last.get(name) ?? -1) > now - (MIN_GAP[name] ?? 0.03)) return false
  const [pv, dv] = VARY[name] ?? NO_VARY
  const k = SFX_BASE * (GAIN[name] ?? 1) * gain
  const bus: Bus = ui ? 'ui' : (b ?? 'sfx')
  const o = ui ? out(name, undefined, undefined, k * dbJitter(dv), 'ui') : out(name, x, y, k * dbJitter(dv), bus)
  // 遠到聽不見（或被同時發聲數上限擋下）的不記節流時間，免得擋掉緊接著的近處同名音效
  if (!o) return false
  last.set(name, now)
  const d = o.g
  const end = runSynth(now, pv > 0 ? 1 + (Math.random() * 2 - 1) * pv : 1, lenJitter(dv > 0), () => {
    const done = (ui && uiSound(name, d, now)) || (!ui && worldSound(name, d, now))
    if (!done) {
      const ex = EXTRA.get(name)
      if (ex) ex(d, now, arg)
      else generic(name, d, now)
    }
    const m = MECH[name]
    if (m) mech(d, now, m[0], m[1])
    // 實彈武器：一個時間、亮度、大小都隨機的牆面回聲，每一發的包絡都不一樣（只變音高的話包絡相關仍有 0.996）
    if (SLAP.has(name)) noise(d, now + 0.025 + Math.random() * 0.05, 0.09, 1600 + Math.random() * 900, 600, 1.2, 'bandpass', 0.1 + Math.random() * 0.15)
  })
  if (o.v) o.v.end = end
  if (duckHook) {
    if (bus === 'sfx' && DUCK_ON.has(name)) duckHook('gun', o.att)
    else if (name === 'hurt' || name === 'hurtBig') duckHook('hurt', 1)
  }
  return true
}

function generic(name: string, d: AudioNode, now: number): void {
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
    case 'gatling': {
      // 原本只有 0.05 秒的窄帶雜訊，太薄；加一層 60 ms 內就收掉的低頻 body（連射 10 發/秒也不會糊成噪音牆），
      // 每發音高微幅隨機，避免連射時聽起來像同一個樣本在重複
      const j = 0.93 + Math.random() * 0.14
      noise(d, now, 0.05, 3000 * j, 900, 1, 'bandpass', 0.6)
      noise(d, now, 0.055, 700 * j, 140, 0.8, 'lowpass', 0.45)
      tone(d, now, 0.05, 160 * j, 60, 'triangle', 0.28)
      break
    }
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
      // 冷凍槍：原本是 8 kHz 高通的純嘶聲（−10，刺耳）；改成有 7 kHz 上限的冷氣噴射＋一點冰晶與後座 body
      hiss(d, now, 0.3, 2600, 1600, 0.22)
      fm(d, now + 0.02, 0.18, 2900 + Math.random() * 500, 1.41, 0.8, 0.03)
      tone(d, now, 0.07, 190, 90, 'triangle', 0.12)
      break
    case 'flame':
      noise(d, now, 0.3, 900, 300, 0.4, 'lowpass', 0.6)
      break
    case 'saw':
      tone(d, now, 0.2, 520, 480, 'sawtooth', 0.12)
      noise(d, now, 0.2, 4000, 3000, 3, 'bandpass', 0.2)
      break
    case 'spit':
      // 吐酸：原本只有一個 Q=3 的窄帶（−30，幾乎聽不到）；加上黏稠的濕音與短促的噴出氣流
      noise(d, now, 0.15, 1200, 300, 3, 'bandpass', 0.5)
      noise(d, now, 0.09, 2600, 1200, 1.5, 'bandpass', 0.3)
      tone(d, now + 0.01, 0.08, 260, 120, 'sine', 0.18)
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
      // 按鈕：主體移到 2.4–2.9 kHz，加一個 5 kHz 的點擊；保留一點原本 1.2 kHz 的厚度
      tone(d, now, 0.04, 2400, 2900, 'sine', 0.12)
      noise(d, now, 0.006, 5200, 4600, 2, 'bandpass', 0.25)
      tone(d, now, 0.045, 1200, 1450, 'sine', 0.05)
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
      // 投擲的破風聲（命中由 hitSound／命中音負責，這裡略低於槍聲）
      noise(d, now, 0.22, 600, 2400, 2, 'bandpass', 0.35)
      noise(d, now, 0.18, 300, 900, 1.2, 'bandpass', 0.3)
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
      // 變身（第 7 輪：原本 −23.8，比開門還小聲；但「看到有人變身」是社交推理的關鍵時刻）：
      // 骨頭碎裂（2–5 kHz 的短促爆點）→ 肉體撕扯 → 約 1.2 秒的低吼尾音。只看到變身特效就播，不看身分
      swell(d, now, 0.7, 90, 260, 'sawtooth', 0.12, 0.4)
      noise(d, now, 0.6, 300, 900, 3, 'bandpass', 0.5)
      for (let i = 0; i < 7; i++) noise(d, now + 0.01 + Math.random() * 0.4, 0.01 + Math.random() * 0.012, 2200 + Math.random() * 2800, 1600, 3.5, 'bandpass', 0.7)
      noise(d, now + 0.15, 0.35, 1400, 500, 1.5, 'bandpass', 0.35)
      growl(d, now + 0.3, 1.2, 86, 58, 0.5)
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
      // 焊接：建籠時每 1.1 秒重複一次，原本 6 kHz 高通嘶聲（−9.6）聽久了刺耳；降約 10 dB、上限 6.5 kHz，
      // 劈啪聲移到 3 kHz 附近，保留電弧的 120 Hz 嗡聲
      hiss(d, now, 0.45, 3200, 2400, 0.09, 6500, 0.03)
      ticks(d, now, 0.45, 9, 3000, 0.12)
      tone(d, now, 0.45, 120, 120, 'square', 0.025)
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
      // 結凍：原本 9 kHz 高通嘶聲（−6.7）；改成 7 kHz 上限的冷氣＋冰晶碎響，降約 10 dB
      hiss(d, now, 0.6, 3000, 1800, 0.1, 7000, 0.02)
      for (let i = 0; i < 4; i++) fm(d, now + 0.1 + i * 0.07, 0.4, 2500 + i * 400, 1.41, 1, 0.03)
      tone(d, now, 0.3, 200, 80, 'triangle', 0.12)
      break
    case 'overheat':
      noise(d, now, 0.5, 400, 2200, 1, 'bandpass', 0.6)
      swell(d, now, 0.5, 200, 400, 'sawtooth', 0.08, 0.3)
      break
    case 'steam':
      // 蒸汽：原本 1.5 秒、5 kHz 高通（−4.6，全遊戲最響）；縮到 0.8 秒、7 kHz 上限、指數淡出，降約 11 dB
      hiss(d, now, 0.8, 2200, 1400, 0.1, 7000, 0.03)
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
      // 約 1 kHz 的「喀」泛音（第 7 輪：原本只有 70 Hz，筆電喇叭上掉 14.5 dB）
      noise(d, now, 0.06, 1050, 800, 2, 'bandpass', 1.3)
      noise(d, now, 0.08, 700, 260, 1, 'lowpass', 0.7)
      tone(d, now, 0.08, 140, 90, 'triangle', 0.45)
      noise(d, now + 0.16, 0.05, 950, 750, 2, 'bandpass', 0.9)
      noise(d, now + 0.16, 0.07, 650, 240, 1, 'lowpass', 0.5)
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

// ───────── 第 7 輪新增的具名音效（render／input 呼叫 sfx(name, x?, y?)）─────────

/**
 * 「不行」（本地回饋：冷卻中按技能、空格子、瞄準時點在空處、目標不合法）。和伺服器拒絕的 error（兩聲低沉方波）不同：
 * 一聲短促、往下彎的悶響＋ 2.6 kHz 的小點擊；節流 0.12 秒，連按也不會變成噪音（MIN_GAP）
 */
regSound(
  'deny',
  (d, now) => {
    tone(d, now, 0.07, 520, 360, 'triangle', 0.14)
    tone(d, now, 0.05, 1040, 720, 'sine', 0.04)
    noise(d, now, 0.012, 2600, 2200, 2, 'bandpass', 0.18)
  },
  2.4,
)

/** 進入瞄準模式：很輕的「喀」（保險打開）＋往上的小滑音 */
regSound(
  'aimEnter',
  (d, now) => {
    noise(d, now, 0.006, 5200, 4600, 2.5, 'bandpass', 0.25)
    tone(d, now + 0.004, 0.04, 2400, 3200, 'sine', 0.04)
    noise(d, now + 0.03, 0.005, 6200, 5600, 2.5, 'bandpass', 0.15)
  },
  2.8,
)

/** 詠唱／引導被打斷：往下掉的斷電聲＋幾下劈啪 */
regSound(
  'castBreak',
  (d, now) => {
    buzz(d, now, 0.45, 1100, 110, 0.12, 3200, 260, 0.005, 2)
    tone(d, now, 0.4, 660, 90, 'sine', 0.12)
    ticks(d, now + 0.05, 0.3, 6, 2600, 0.25, 3)
  },
  1.5,
)

/** 施法充能；arg = 詠唱進度 0–1（castCharge()），音高最多往上 9 個半音 */
regSound(
  'castCharge',
  (d, now, k = 0) => {
    const p = Math.pow(2, (Math.max(0, Math.min(1, k)) * 9) / 12)
    swell(d, now, 0.6, 300 * p, 900 * p, 'sine', 0.12, 0.7)
    swell(d, now, 0.6, 450 * p, 1350 * p, 'triangle', 0.05, 0.7)
    noise(d, now, 0.6, 2000 * p, Math.min(6500, 6000 * p), 3, 'bandpass', 0.08)
  },
  1.4,
)

/** 設定頁的試聽：音樂滑桿（走 music 分軌）——一個帶低通的小調和弦＋一聲鐘 */
regSound(
  'previewMusic',
  (d, now) => {
    for (const f of [146.8, 174.6, 220]) buzz(d, now, 1.6, f, f, 0.05, 900, 700, 0.25, 0.7)
    fm(d, now + 0.1, 1.4, 587.3, 3.5, 1.2, 0.05)
  },
  1,
)

/** 設定頁的試聽：環境音滑桿（走 ambient 分軌）——通風嗡鳴＋遠處的金屬聲 */
regSound(
  'previewAmbient',
  (d, now) => {
    tone(d, now, 1.4, 55, 55, 'sine', 0.12)
    hiss(d, now, 1.4, 1400, 1200, 0.05, 4000, 0.3)
    fm(d, now + 0.3, 0.9, 190, 2.73, 4, 0.08)
  },
  1,
)
