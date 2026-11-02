// 介面大小：依視窗大小自動縮放，再乘上玩家設定的倍率。
// 透過 CSS zoom 套在 HUD／選單等介面元素上（不套 3D 畫面與名稱疊加層）。
// 需要把滑鼠座標換成介面座標時，除以 uiZoom.value。
import { computed, effect, signal } from '@preact/signals'

const KEY = 'xc.uiScale'

function load(): number {
  try {
    const v = Number(localStorage.getItem(KEY))
    if (Number.isFinite(v) && v >= 0.7 && v <= 1.6) return v
  } catch {
    /* ignore */
  }
  return 1
}

/** 玩家設定的倍率（設定頁「介面大小」）*/
export const uiScalePref = signal(load())

const viewport = signal({ w: typeof window === 'undefined' ? 1600 : window.innerWidth, h: typeof window === 'undefined' ? 900 : window.innerHeight })

/**
 * 自動倍率：以 1280×760 為 1.0，依較小的一邊放大；下限 0.85（小視窗才放得下）、上限 1.7（4K）。
 * 1600×900 約 1.18、1920×1080 約 1.42。
 */
export function autoZoom(w: number, h: number): number {
  return Math.max(0.85, Math.min(1.7, Math.min(w / 1280, h / 760)))
}

/** 實際套用的縮放倍率 */
export const uiZoom = computed(() => {
  const v = viewport.value
  // 小視窗時，不讓玩家倍率把底部 HUD 撐出畫面（底部 HUD 在 zoom 1 時約需 1120px 寬）
  const fit = v.w / 1120
  return Math.max(0.7, Math.min(autoZoom(v.w, v.h) * uiScalePref.value, Math.max(fit, 0.85)))
})

export function setUiScale(v: number): void {
  uiScalePref.value = Math.max(0.7, Math.min(1.6, v))
  try {
    localStorage.setItem(KEY, String(uiScalePref.value))
  } catch {
    /* ignore */
  }
}

let installed = false

/** main.tsx 呼叫一次：把倍率寫進 CSS 變數 --ui-zoom */
export function installUiScale(): void {
  if (installed || typeof window === 'undefined') return
  installed = true
  window.addEventListener('resize', () => (viewport.value = { w: window.innerWidth, h: window.innerHeight }))
  effect(() => {
    document.documentElement.style.setProperty('--ui-zoom', uiZoom.value.toFixed(3))
  })
}
