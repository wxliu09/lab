// fps 持續過低時自動降畫質：對局中畫質是 medium 以上、使用者沒在設定裡選過畫質（xc.quality 沒有值），
// 而且 fps 連續約 10 秒低於 20，就降到 low（每局最多一次）。開局載入、換站建站、預建期間、分頁在背景時不計。
// 判斷寫成純函式（autoDropStep），GameScene 每幀呼叫；這個檔案不碰 DOM 與 three.js（單元測試直接用）。
import type { Quality } from './quality'

export const AUTO_DROP = {
  /** 低於這個 fps 才算慢 */
  fps: 20,
  /** 連續慢這麼久（秒）就降 */
  hold: 10,
  /** 暫停（載入、建站、預建、背景）結束後先等這麼久（秒）才開始計：載入與建站的長幀不算 */
  grace: 5,
  /** 量 fps 的視窗（秒）*/
  window: 1,
  /**
   * 兩幀間隔超過這麼久（秒）視為中斷（除錯器暫停、電腦休眠），重新開始計。分頁在背景由呼叫端用 paused 告知
   * （GameScene 記下 visibilitychange）；1 fps 以下的慢機器每一幀都隔一秒以上，不能拿間隔判斷背景，否則永遠不會降。
   */
  gap: 20,
}

export interface AutoDropState {
  /** 這一局已經降過 */
  done: boolean
  /** 已經連續慢了多久（秒）*/
  slow: number
  /** 這個時間之前不計（暫停結束後的緩衝）*/
  readyAt: number
  /** 目前 fps 視窗的開始時間（< 0 = 還沒開始）與幀數 */
  winAt: number
  frames: number
  /** 上一幀的時間（< 0 = 第一幀）*/
  lastAt: number
}

export interface AutoDropInput {
  /** 現在（秒，單調遞增；performance.now() / 1000）*/
  now: number
  quality: Quality
  /** 使用者自己選過畫質 */
  chosen: boolean
  /** 暫停計算：開局載入、等其他人載入、換站建站、預建中、分頁在背景 */
  paused: boolean
}

export function autoDropState(): AutoDropState {
  return { done: false, slow: 0, readyAt: 0, winAt: -1, frames: 0, lastAt: -1 }
}

/** 從頭開始計（暫停、中斷之後）*/
function restart(s: AutoDropState, now: number): void {
  s.slow = 0
  s.winAt = -1
  s.frames = 0
  s.readyAt = now + AUTO_DROP.grace
}

/** 每幀呼叫一次；回傳 true = 現在該降到 low（之後這一局不會再回傳 true）*/
export function autoDropStep(s: AutoDropState, i: AutoDropInput): boolean {
  if (s.done) return false
  // 第一幀（剛開局）與兩幀間隔太久（除錯器、休眠）都從頭計
  const gapped = s.lastAt < 0 || i.now - s.lastAt > AUTO_DROP.gap
  s.lastAt = i.now
  // 已經是 low、或使用者自己選過畫質：不降（選過就會寫進設定，不會再變回「沒選過」）
  if (i.quality === 'low' || i.chosen || i.paused || gapped) {
    restart(s, i.now)
    return false
  }
  if (i.now < s.readyAt) return false
  if (s.winAt < 0) {
    s.winAt = i.now
    s.frames = 0
    return false
  }
  s.frames++
  const el = i.now - s.winAt
  if (el < AUTO_DROP.window) return false
  const fps = s.frames / el
  s.slow = fps < AUTO_DROP.fps ? s.slow + el : 0
  s.winAt = i.now
  s.frames = 0
  if (s.slow < AUTO_DROP.hold) return false
  s.done = true
  return true
}
