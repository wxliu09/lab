// 操作偏好：邊緣捲動開關與速度（設定頁可調，存在 localStorage）
import { signal } from '@preact/signals'

function num(key: string, d: number, lo: number, hi: number): number {
  try {
    const v = Number(localStorage.getItem(key))
    if (localStorage.getItem(key) !== null && Number.isFinite(v) && v >= lo && v <= hi) return v
  } catch {
    /* ignore */
  }
  return d
}

export const edgeScrollOn = signal(num('xc.edgeScroll', 1, 0, 1) === 1)
export const edgeSpeed = signal(num('xc.edgeSpeed', 1, 0.4, 2.5))

export function setEdgeScroll(on: boolean): void {
  edgeScrollOn.value = on
  try {
    localStorage.setItem('xc.edgeScroll', on ? '1' : '0')
  } catch {
    /* ignore */
  }
}

export function setEdgeSpeed(v: number): void {
  edgeSpeed.value = Math.max(0.4, Math.min(2.5, v))
  try {
    localStorage.setItem('xc.edgeSpeed', String(edgeSpeed.value))
  } catch {
    /* ignore */
  }
}
