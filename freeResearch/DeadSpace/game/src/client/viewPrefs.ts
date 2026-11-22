// 畫面與鏡頭偏好（設定頁可調，存在 localStorage）：鏡頭震動、閃光與色差、駕駛時自動跟隨、高對比、FPS 上限；
// 另外兩個不存檔的執行期狀態：鏡頭跟隨模式、隱藏 HUD（截圖／實況用）
import { signal } from '@preact/signals'
import { reducedMotion } from './hitAlert'

function read(key: string): string | null {
  try {
    return localStorage.getItem(key)
  } catch {
    return null
  }
}

function write(key: string, v: string): void {
  try {
    localStorage.setItem(key, v)
  } catch {
    /* ignore */
  }
}

function bool(key: string, d: boolean): boolean {
  const v = read(key)
  return v === null ? d : v === '1'
}

/** FPS 上限可選值：0 = 不限制 */
export const FPS_CAPS = [0, 30, 60, 120] as const
export type FpsCap = (typeof FPS_CAPS)[number]

function cap(key: string): FpsCap {
  const v = Number(read(key))
  return (FPS_CAPS as readonly number[]).includes(v) ? (v as FpsCap) : 0
}

/** 鏡頭震動（爆炸、受擊、變身）*/
export const shakeOn = signal(bool('xc.shake', true))
/** 全螢幕閃光與色差（受擊暈影、爆炸白閃）*/
export const flashOn = signal(bool('xc.flash', true))
/** 駕駛站點時鏡頭自動跟著站點 */
export const followPilot = signal(bool('xc.followPilot', true))
/** 高對比：血條、敵我圈除了顏色之外再加形狀／紋路區分 */
export const hiContrast = signal(bool('xc.hiContrast', false))
/** FPS 上限 */
export const fpsCap = signal<FpsCap>(cap('xc.fpsCap'))

export function setShakeOn(on: boolean): void {
  shakeOn.value = on
  write('xc.shake', on ? '1' : '0')
}
export function setFlashOn(on: boolean): void {
  flashOn.value = on
  write('xc.flash', on ? '1' : '0')
}
export function setFollowPilot(on: boolean): void {
  followPilot.value = on
  write('xc.followPilot', on ? '1' : '0')
}
export function setHiContrast(on: boolean): void {
  hiContrast.value = on
  write('xc.hiContrast', on ? '1' : '0')
}
export function setFpsCap(v: FpsCap): void {
  fpsCap.value = v
  write('xc.fpsCap', String(v))
}

/**
 * FPS 上限的節拍器（engine.ts 每個 rAF 呼叫）：回傳 -1 = 這一幀跳過；否則回傳新的「上次畫的時間」。
 * frameIv = 螢幕的 rAF 間隔（ms，平滑過）。上限不低於螢幕更新率（60 Hz 螢幕上限 60／120）：每幀都畫，
 * 不然 60.06 Hz 的螢幕會每一兩秒被擋掉一幀。上限低於更新率：照固定格點走（上次畫的時間每次前進整數個間隔，
 * 不是直接記 now），144 Hz 螢幕上限 60 時平均仍是 60；容差 = 間隔的 10%（最多 2 ms），吸收 rAF 時間戳的抖動。
 * cap = 0：不限制（跟著 vsync），每幀都畫。
 */
export function fpsGate(now: number, lastDraw: number, cap: number, frameIv = 0): number {
  if (cap <= 0) return now
  const iv = 1000 / cap
  if (frameIv >= iv * 0.9) return now
  const el = now - lastDraw
  const tol = Math.min(2, iv * 0.1)
  if (el < iv - tol) return -1
  // 分頁在背景很久之後回來：不要追幀，從現在重新對齊
  if (el > iv * 4) return now
  return lastDraw + Math.max(1, Math.floor((el + tol) / iv)) * iv
}

/** 鏡頭震動的實際倍率：關掉、或作業系統要求減少動態時為 0 */
export function shakeScale(): number {
  return shakeOn.value && !reducedMotion() ? 1 : 0
}
/** 閃光／色差能不能播 */
export function flashAllowed(): boolean {
  return flashOn.value && !reducedMotion()
}

/**
 * 鏡頭跟隨模式（不存檔）：off = 自由鏡頭；self = 跟著自己的單位（駕駛時跟著站點）；
 * action = 觀戰用，自動跟著最近發生戰鬥的地方
 */
export type FollowMode = 'off' | 'self' | 'action'
export const followMode = signal<FollowMode>('off')

/** 隱藏 HUD（截圖／實況用，不存檔）*/
export const hudHidden = signal(false)
