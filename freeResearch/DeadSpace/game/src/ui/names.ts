// 實體外觀 id → 顯示名稱。販賣機與站點的 UnitDef 只在 sim 端動態註冊，client 要從原始定義查。
import type { Loc } from '../shared/content/types'
import { UNITS, VENDORS, itemDef } from '../shared/content/registry'
import { STATION_BY_ID } from '../shared/content/stations/index'

export function entDefName(d: string | undefined): Loc | undefined {
  if (!d) return undefined
  if (d.startsWith('item:')) return itemDef(d.slice(5))?.name
  const u = UNITS.get(d)
  if (u) return u.name
  if (d.startsWith('vendor.')) return VENDORS.get(d.slice(7))?.name
  if (d.startsWith('station.')) return STATION_BY_ID.get(d.slice(8))?.name
  return undefined
}

import { SUIT_IDS } from '../shared/content/suits'

/** 每套防護服一個色調（18 套原本共用同一個圖示，背包裡分不出來）*/
export function suitColor(id: string): string {
  const i = SUIT_IDS.indexOf(id)
  if (i < 0) return '#ffc23d'
  return `hsl(${Math.round((i * 47) % 360)} 85% 66%)`
}

// 文字底色的保守估計：聊天紀錄是半透明黑底疊在場景上，取比面板（#0a0e12）亮一點的 #1a2028
const TEXT_BG: [number, number, number] = [0x1a, 0x20, 0x28]

function lin(c: number): number {
  const v = c / 255
  return v <= 0.04045 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4
}

function luminance([r, g, b]: number[]): number {
  return 0.2126 * lin(r) + 0.7152 * lin(g) + 0.0722 * lin(b)
}

/** WCAG 對比度 */
export function contrastRatio(a: number[], b: number[]): number {
  const la = luminance(a)
  const lb = luminance(b)
  return (Math.max(la, lb) + 0.05) / (Math.min(la, lb) + 0.05)
}

const mixWhite = (c: number[], k: number): number[] => c.map((v) => Math.round(v + (255 - v) * k))
const textColors = new Map<string, string>()

/**
 * 玩家色當文字色用：只有對比不到 4.5:1 的深色（紅、紫、洋紅…）混白提亮到剛好過門檻，
 * 其他顏色維持原色（一律混白會讓各色看起來更接近，降低辨識度）。光圈、色條等非文字的地方照舊用原色。
 */
export function textColorOf(hex: string | undefined): string {
  if (!hex) return '#cfd8df'
  const hit = textColors.get(hex)
  if (hit) return hit
  const m = /^#([0-9a-f]{6})$/i.exec(hex)
  if (!m) return hex
  const rgb = [0, 2, 4].map((i) => parseInt(m[1].slice(i, i + 2), 16))
  let out = hex
  if (contrastRatio(rgb, TEXT_BG) < 4.5) {
    // 二分搜尋剛好過 4.5:1 的最小混白比例
    let lo = 0
    let hi = 1
    for (let i = 0; i < 16; i++) {
      const k = (lo + hi) / 2
      if (contrastRatio(mixWhite(rgb, k), TEXT_BG) >= 4.5) hi = k
      else lo = k
    }
    out = '#' + mixWhite(rgb, hi).map((v) => v.toString(16).padStart(2, '0')).join('')
  }
  textColors.set(hex, out)
  return out
}
