// 遊戲畫面的游標（第 7 輪：原本一律是系統箭頭）：一般、攻擊（紅色準星）、瞄準（紫色準星）、互動（黃色＋齒輪）、
// 友方／跟隨（綠色＋人形）、無效目標（灰色＋斜線）。32 px 的 SVG data URL，深色外框＋亮色填色，深淺地板上都看得清楚；
// 支援 image-set 的瀏覽器另給 2x（64 px）版本，高 DPI 螢幕不糊。
// 狀態只看游標下的東西與目前的模式（玩家自己看得到的資訊），由 input.ts 在懸停改變時呼叫；只有狀態變了才寫 style。
import type { SnapEntity } from '../shared/protocol/messages'
import { type MeCtx, rightClickAction, structKind } from './interactKind'

export type CursorState = 'normal' | 'attack' | 'aim' | 'interact' | 'ally' | 'invalid'

export const CURSOR_STATES: readonly CursorState[] = ['normal', 'attack', 'aim', 'interact', 'ally', 'invalid']

// ───────── 狀態判定（純函式，單元測試直接驗證）─────────

/** 右鍵「走過去」但其實沒有「使用」可言的建物：游標不顯示互動 */
const NO_USE = new Set(['breakable', 'device', 'bomb', 'passive', 'scenery', 'broken'])

/**
 * 沒在瞄準時，游標停在這個實體上的樣子（和右鍵會做的事一致，interactKind.rightClickAction）：
 * 會攻擊 → attack；跟隨 → ally；撿起、駕駛、使用、翻找 → interact；其他（屍體、地貼、只能打破的瓦礫）→ normal。
 * self = 這是自己操控的單位（右鍵自己＝點地面）。
 */
export function hoverCursor(s: SnapEntity | undefined, me: MeCtx | undefined, self = false): CursorState {
  if (!s || self) return 'normal'
  switch (rightClickAction(s, me)) {
    case 'attack':
      return 'attack'
    case 'follow':
      return 'ally'
    case 'pickup':
    case 'center':
    case 'rummage':
      return 'interact'
    case 'interact': {
      const sk = structKind(s)
      if (sk && (NO_USE.has(sk) || sk === 'crate')) return 'normal'
      return 'interact'
    }
    default:
      return 'normal'
  }
}

/** 游標狀態的輸入：目前的模式與游標下的東西 */
export interface CursorCtx {
  /** none = 沒在瞄準；attack = A 攻擊；aim = 技能／道具瞄準 */
  mode: 'none' | 'attack' | 'aim'
  /** 游標下的實體（瞄準「點一個單位」時是吸附後會選到的那個）*/
  hover?: SnapEntity
  /** hover 是自己操控的單位 */
  self?: boolean
  /** 游標下有沒有實體的可用物（船艙控制台、艙門）*/
  spot?: boolean
  /** 瞄準中：hover 符合技能的目標篩選（client/targetSnap.ts targetOk）；undefined = 這個技能不看單位（點地面）*/
  aimOk?: boolean
  me?: MeCtx
}

/** 依模式與懸停決定游標（瞄準中：對著不符合篩選的對象＝無效；沒有對象＝瞄準準星）*/
export function cursorState(c: CursorCtx): CursorState {
  if (c.mode === 'attack') return 'attack'
  if (c.mode === 'aim') return c.hover && c.aimOk === false ? 'invalid' : 'aim'
  if (c.hover) return hoverCursor(c.hover, c.me, c.self)
  return c.spot ? 'interact' : 'normal'
}

// ───────── 圖形 ─────────

/** 深色外框（深淺地板上都看得到）*/
const INK = '#061018'

/** 箭頭（尖端在 (2, 2)）：fill = 填色 */
function arrow(fill: string, hi: string): string {
  const d = 'M2.6 2.2 L2.6 23.4 L8.1 18.3 L12.1 26.9 L16.3 25.0 L12.4 16.6 L19.9 16.6 Z'
  return (
    `<path d="${d}" transform="translate(1.1 1.3)" fill="${INK}" opacity="0.45"/>` +
    `<path d="${d}" fill="${fill}" stroke="${INK}" stroke-width="1.7" stroke-linejoin="round"/>` +
    // 左緣的亮邊（金屬感，和 HUD 的青色描邊同一個語彙）
    `<path d="M4.3 6.2 L4.3 19.2" stroke="${hi}" stroke-width="1.1" stroke-linecap="round" opacity="0.9"/>`
  )
}

/** 線條：先畫深色粗底、再畫彩色細線 */
function stroked(shape: string, color: string, w = 2): string {
  return shape.replace('/>', ` fill="none" stroke="${INK}" stroke-width="${w + 2.4}" stroke-linecap="round" stroke-linejoin="round"/>`) + shape.replace('/>', ` fill="none" stroke="${color}" stroke-width="${w}" stroke-linecap="round" stroke-linejoin="round"/>`)
}

function reticle(color: string): string {
  return (
    stroked('<circle cx="16" cy="16" r="8.5"/>', color) +
    stroked('<path d="M16 2.5 V8.6 M16 23.4 V29.5 M2.5 16 H8.6 M23.4 16 H29.5"/>', color) +
    `<circle cx="16" cy="16" r="2.1" fill="${color}" stroke="${INK}" stroke-width="1.2"/>`
  )
}

function brackets(color: string): string {
  return (
    stroked('<path d="M5 11 V5 H11 M21 5 H27 V11 M27 21 V27 H21 M11 27 H5 V21"/>', color, 2.2) +
    stroked('<circle cx="16" cy="16" r="5.6"/>', color, 1.2) +
    `<path d="M16 13.2 L18.8 16 L16 18.8 L13.2 16 Z" fill="${color}" stroke="${INK}" stroke-width="1.1" stroke-linejoin="round"/>`
  )
}

/** 齒輪徽章（中心 cx, cy）*/
function gear(cx: number, cy: number, color: string): string {
  return (
    `<circle cx="${cx}" cy="${cy}" r="7.4" fill="${INK}"/>` +
    `<circle cx="${cx}" cy="${cy}" r="5.1" fill="none" stroke="${color}" stroke-width="3" stroke-dasharray="2.1 1.9"/>` +
    `<circle cx="${cx}" cy="${cy}" r="3.9" fill="${color}"/>` +
    `<circle cx="${cx}" cy="${cy}" r="1.5" fill="${INK}"/>`
  )
}

/** 人形徽章（友方）*/
function person(cx: number, cy: number, color: string): string {
  return (
    `<circle cx="${cx}" cy="${cy}" r="7.4" fill="${INK}"/>` +
    `<circle cx="${cx}" cy="${cy - 2.3}" r="2.5" fill="${color}"/>` +
    `<path d="M${cx - 4.4} ${cy + 4.6} Q${cx - 4.2} ${cy + 0.6} ${cx} ${cy + 0.6} Q${cx + 4.2} ${cy + 0.6} ${cx + 4.4} ${cy + 4.6} Z" fill="${color}"/>`
  )
}

function invalid(): string {
  const c = '#c3ccd5'
  return stroked('<circle cx="16" cy="16" r="9"/>', c, 2.4) + stroked('<path d="M9.7 22.3 L22.3 9.7"/>', c, 2.4)
}

interface CursorArt {
  body: string
  /** 熱點（32 px 座標）*/
  hx: number
  hy: number
  /** 不支援自訂游標時的系統游標 */
  fallback: string
}

const ART: Record<CursorState, CursorArt> = {
  normal: { body: arrow('#e9f7ff', '#9fe7ff'), hx: 3, hy: 2, fallback: 'default' },
  attack: { body: reticle('#ff4f42'), hx: 16, hy: 16, fallback: 'crosshair' },
  aim: { body: brackets('#c6a2ff'), hx: 16, hy: 16, fallback: 'crosshair' },
  interact: { body: arrow('#ffd24a', '#fff3c4') + gear(23, 23, '#ffd24a'), hx: 3, hy: 2, fallback: 'pointer' },
  ally: { body: arrow('#6ff5b0', '#d6ffe9') + person(23, 23, '#6ff5b0'), hx: 3, hy: 2, fallback: 'pointer' },
  invalid: { body: invalid(), hx: 16, hy: 16, fallback: 'not-allowed' },
}

/** 游標的 SVG 原始碼（size = 實際像素：32 = 1x、64 = 2x）*/
export function cursorSvg(state: CursorState, size = 32): string {
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${size}" height="${size}" viewBox="0 0 32 32">${ART[state].body}</svg>`
}

export function cursorHotspot(state: CursorState): [number, number] {
  return [ART[state].hx, ART[state].hy]
}

function dataUrl(svg: string): string {
  return `url("data:image/svg+xml,${encodeURIComponent(svg)}")`
}

/** 1x 的 CSS cursor 值（所有瀏覽器）*/
export function cursorCss(state: CursorState): string {
  const a = ART[state]
  return `${dataUrl(cursorSvg(state, 32))} ${a.hx} ${a.hy}, ${a.fallback}`
}

/** 含 2x 的 CSS cursor 值（image-set；熱點以 1x 的 CSS px 計）*/
export function cursorCssHiDpi(state: CursorState, fn = 'image-set'): string {
  const a = ART[state]
  return `${fn}(${dataUrl(cursorSvg(state, 32))} 1x, ${dataUrl(cursorSvg(state, 64))} 2x) ${a.hx} ${a.hy}, ${a.fallback}`
}

let cssCache: Record<CursorState, string> | null = null

/** 每種狀態實際要寫進 style 的值：瀏覽器支援 image-set 就用 2x 版本，否則 1x */
export function cursorValues(): Record<CursorState, string> {
  if (cssCache) return cssCache
  const supports = (v: string) => {
    try {
      return typeof CSS !== 'undefined' && typeof CSS.supports === 'function' && CSS.supports('cursor', v)
    } catch {
      return false
    }
  }
  const fn = supports(cursorCssHiDpi('normal')) ? 'image-set' : supports(cursorCssHiDpi('normal', '-webkit-image-set')) ? '-webkit-image-set' : ''
  const out = {} as Record<CursorState, string>
  for (const s of CURSOR_STATES) out[s] = fn ? cursorCssHiDpi(s, fn) : cursorCss(s)
  cssCache = out
  return out
}

/** 把游標套在元素上：只有狀態變了才寫 style（mousemove 每次都會呼叫）*/
export class CursorSetter {
  state: CursorState | null = null

  apply(el: HTMLElement, s: CursorState): void {
    if (s === this.state) return
    this.state = s
    el.style.cursor = cursorValues()[s]
    el.dataset.cursor = s
  }

  clear(el: HTMLElement): void {
    this.state = null
    el.style.cursor = ''
    delete el.dataset.cursor
  }
}
