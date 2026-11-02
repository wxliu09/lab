// 全域 tooltip：任何介面元素都用 tipProps() 掛上；場景物件的懸停說明用 showCursorTip()。
// 只有一個 TooltipLayer（App 最外層），用 position: fixed 依錨點元素定位、夾在視窗內。
// 介面套了 CSS zoom，所以螢幕座標要除以 uiZoom 才是 tooltip 自己的座標。
import { signal } from '@preact/signals'
import { useLayoutEffect, useRef, useState } from 'preact/hooks'
import type { JSX } from 'preact'
import { uiZoom } from './uiScale'

export interface TipData {
  title: string
  /** 標題右側的小字（快捷鍵、分類）*/
  tag?: string
  /** 標題下方的副標（類別）*/
  sub?: string
  body?: string
  /** 數值列：[名稱, 值] */
  rows?: [string, string][]
  /** 操作提示（最底下，強調色）*/
  hint?: string
  color?: string
}

interface TipState {
  d: TipData
  /** 錨點（螢幕座標）；沒有就跟著游標 */
  rect?: { left: number; top: number; right: number; bottom: number }
  x: number
  y: number
}

export const tipState = signal<TipState | null>(null)
const ELEMENT = {}
const CURSOR = {}
let owner: unknown = null

export function hideTip(who?: unknown): void {
  if (who !== undefined && who !== owner) return
  owner = null
  tipState.value = null
}

/** 掛在介面元素上：滑鼠移入時顯示，移出或按下時隱藏 */
export function tipProps(get: () => TipData | null | undefined): {
  onMouseEnter: (e: MouseEvent) => void
  onMouseLeave: () => void
  onMouseDown: () => void
} {
  // 注意：HUD 每個快照都會重新渲染、重新產生這組 handler，所以不能用「是哪一次產生的」來判斷擁有者；
  // 同一時間只會懸停在一個元素上，離開時收起所有元素型的 tooltip 即可（游標型的不動）。
  return {
    onMouseEnter: (e: MouseEvent) => {
      const d = get()
      if (!d) return
      const r = (e.currentTarget as HTMLElement).getBoundingClientRect()
      owner = ELEMENT
      tipState.value = { d, rect: { left: r.left, top: r.top, right: r.right, bottom: r.bottom }, x: e.clientX, y: e.clientY }
    },
    onMouseLeave: () => hideTip(ELEMENT),
    onMouseDown: () => hideTip(ELEMENT),
  }
}


/** 跟著游標的 tooltip（場景物件懸停）；d = null 收起 */
export function showCursorTip(d: TipData | null, x: number, y: number): void {
  if (!d) return hideTip(CURSOR)
  if (owner !== null && owner !== CURSOR) return
  owner = CURSOR
  tipState.value = { d, x, y }
}

export function TooltipLayer(): JSX.Element | null {
  const s = tipState.value
  const ref = useRef<HTMLDivElement>(null)
  const [pos, setPos] = useState<{ left: number; top: number } | null>(null)
  useLayoutEffect(() => {
    const el = ref.current
    if (!s || !el) return setPos(null)
    const z = uiZoom.value
    const vw = window.innerWidth / z
    const vh = window.innerHeight / z
    const w = el.offsetWidth
    const h = el.offsetHeight
    const m = 8
    let left: number
    let top: number
    if (s.rect) {
      const r = { left: s.rect.left / z, top: s.rect.top / z, right: s.rect.right / z, bottom: s.rect.bottom / z }
      left = (r.left + r.right) / 2 - w / 2
      top = r.top - h - 10
      // 上方放不下 → 放下方；下方也放不下 → 放旁邊
      if (top < m) top = r.bottom + 10
      if (top + h > vh - m) {
        top = Math.max(m, Math.min(vh - h - m, (r.top + r.bottom) / 2 - h / 2))
        left = r.left - w - 12 >= m ? r.left - w - 12 : r.right + 12
      }
    } else {
      left = s.x / z + 18
      top = s.y / z + 22
      if (left + w > vw - m) left = s.x / z - w - 14
      if (top + h > vh - m) top = s.y / z - h - 14
    }
    setPos({ left: Math.max(m, Math.min(vw - w - m, left)), top: Math.max(m, Math.min(vh - h - m, top)) })
  }, [s, uiZoom.value])
  if (!s) return null
  const d = s.d
  return (
    <div
      ref={ref}
      class="panel tooltip"
      data-testid="tooltip"
      style={{ left: `${pos?.left ?? -9999}px`, top: `${pos?.top ?? -9999}px`, borderColor: d.color ? d.color + '88' : undefined }}
    >
      <div class="tip-head">
        <b style={{ color: d.color }}>{d.title}</b>
        {d.tag && <span class="tip-tag">{d.tag}</span>}
      </div>
      {d.sub && <div class="tip-sub">{d.sub}</div>}
      {d.body && <div class="tip-body">{d.body}</div>}
      {d.rows && d.rows.length > 0 && (
        <div class="tip-rows">
          {d.rows.map(([k, v]) => (
            <div key={k}>
              <span class="dim">{k}</span>
              <b>{v}</b>
            </div>
          ))}
        </div>
      )}
      {d.hint && <div class="tip-hint">{d.hint}</div>}
    </div>
  )
}
