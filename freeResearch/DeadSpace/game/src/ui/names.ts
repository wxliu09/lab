// 實體外觀 id → 顯示名稱。販賣機與站點的 UnitDef 只在 sim 端動態註冊，client 要從原始定義查。
import type { Loc } from '../shared/content/types'
import { CLASSES, UNITS, VENDORS, itemDef } from '../shared/content/registry'
import { STATION_BY_ID } from '../shared/content/stations/index'
// 與 i18n.ts 互相 import：兩邊都只在函式呼叫時才用到對方，模組初始化不依賴彼此
import { hasString, lang, t } from './i18n'

// ───────── 名字依介面語言顯示 ─────────
// sim 把固定字樣直接寫進名字字串（改 sim 會影響同名判斷、-rename、通訊病毒等），client 顯示前依語言換掉：
// 職業前綴（classes.ts 的 prefix.en，例如「Dr. 」）、晉升頭銜「特務·」（events.ts）、管家後綴「 的管家」（roleSystem.ts）、
// 預設名字「船員 N」（server.ts；同名時 uniqueName 會在後面直接接數字，仍符合這個格式）。

/** sim 端的晉升頭銜 */
export const SIM_AGENT_TITLE = '特務·'
/** sim 端的管家後綴：「<主人本名> 的管家」 */
export const SIM_BUTLER_SUFFIX = ' 的管家'
const SIM_DEFAULT = /^船員 (\d+)$/
/** -names、陣營名單裡的死亡標記（sim 兩種語言各送一份清單）*/
const DEAD_MARKS = ['（死亡）', ' (dead)']

let prefixes: [string, string][] = []

/** [sim 寫進名字的前綴, i18n key]，長的先比對 */
function prefixTable(): [string, string][] {
  if (prefixes.length > 1) return prefixes
  const out: [string, string][] = [[SIM_AGENT_TITLE, 'name.prefix.agent']]
  for (const c of CLASSES.values()) if (c.prefix.en) out.push([c.prefix.en, 'name.prefix.' + c.id])
  out.sort((a, b) => b[0].length - a[0].length)
  prefixes = out
  return out
}

function baseName(s: string): string {
  const m = SIM_DEFAULT.exec(s)
  return m ? t('name.default', { n: m[1] }) : s
}

function convert(name: string): string {
  if (name.length > SIM_BUTLER_SUFFIX.length && name.endsWith(SIM_BUTLER_SUFFIX)) return t('name.butler', { name: convert(name.slice(0, -SIM_BUTLER_SUFFIX.length)) })
  for (const [raw, key] of prefixTable()) {
    if (name.length > raw.length && name.startsWith(raw) && hasString(lang.value, key)) return t(key) + baseName(name.slice(raw.length))
  }
  return baseName(name)
}

const nameCache = new Map<string, string>()
let cacheLang = ''

/**
 * sim 送來的名字 → 目前介面語言的寫法（職業前綴、晉升頭銜、管家後綴、預設名字）。
 * 只換固定字樣，玩家自己取的部分照原樣；場景名牌每幀都會呼叫，結果依語言快取。
 */
export function localizeName(name: string | undefined): string {
  if (!name) return ''
  const l = lang.value
  if (cacheLang !== l) {
    nameCache.clear()
    cacheLang = l
  }
  const hit = nameCache.get(name)
  if (hit !== undefined) return hit
  const out = convert(name)
  // 內容還沒註冊（職業表是空的）時不快取
  if (CLASSES.size > 0) {
    if (nameCache.size > 512) nameCache.clear()
    nameCache.set(name, out)
  }
  return out
}

/** 以 sep 串起來的名單（系統訊息的 {lz}／{le}）逐一換；保留死亡標記 */
export function localizeNameList(list: string, sep: string): string {
  return list
    .split(sep)
    .map((x) => {
      const d = DEAD_MARKS.find((m) => x.endsWith(m) && x.length > m.length)
      return d ? localizeName(x.slice(0, -d.length)) + d : localizeName(x)
    })
    .join(sep)
}

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
