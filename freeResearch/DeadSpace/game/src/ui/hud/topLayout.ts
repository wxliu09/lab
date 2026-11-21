// 頂列（時間、穩定度、身分、EP、按鈕）與左上目標面板的版面協調（第 6 輪審查：小視窗或介面放大時「時間」被目標面板蓋住）。
// 頂列預設置中；左上有目標面板時，頂列的左緣至少要在面板右側（讓不出來就往右推），
// 還放不下就改精簡版（拿掉「時間」「星區穩定度」等文字標籤），精簡版也放不下（極窄視窗）才把目標面板整個移到頂列下方。
// 純函式 fitTopBar 讓單元測試直接驗證；Hud.tsx 的 TopBar 量版面、Guide.tsx 讀 guideBelow 決定目標面板的 top。
import { signal } from '@preact/signals'

/** 頂列與目標面板、視窗邊緣之間至少留的距離（CSS px，乘上介面縮放）*/
export const TOP_GAP = 8

export interface TopFitIn {
  /** 視窗寬（螢幕 px）*/
  vw: number
  /** 介面縮放（uiZoom）*/
  z: number
  /** 頂列目前量到的寬度（螢幕 px；目前是哪一版就是哪一版的寬度）*/
  barW: number
  /** 頂列目前是不是精簡版 */
  compact: boolean
  /** 完整版的寬度（螢幕 px）：目前是完整版時忽略（用 barW），精簡版時是估計值（精簡版寬度＋兩版的差距）*/
  fullW: number
  /** 目標面板的右緣（螢幕 px）；沒有目標面板（看筆記、還沒開局）時 null */
  guideRight: number | null
}

export interface TopFit {
  compact: boolean
  /** 目標面板要移到頂列下方（精簡版也放不下時）*/
  stack: boolean
  /** 頂列左緣（螢幕 px）*/
  left: number
}

/**
 * 頂列放哪裡、要不要精簡。模式要切換時回傳的 left 只是暫定（換版之後寬度會變，下一次量到再算一次）。
 * 判斷只看水平方向（目標面板的右緣），目標面板移到下方之後也照樣算，不會在兩種版面之間來回跳。
 */
export function fitTopBar(o: TopFitIn): TopFit {
  const m = TOP_GAP * o.z
  const lo = o.guideRight === null ? m : o.guideRight + m
  const room = o.vw - m - lo
  const fullW = o.compact ? o.fullW : o.barW
  // 從精簡版回到完整版要多留一點餘裕（完整版的寬度是估的），免得在臨界寬度來回切換
  const fits = (w: number, slack: number) => w + slack <= room
  const wantCompact = !fits(fullW, o.compact ? 4 * o.z : 0)
  const center = (o.vw - o.barW) / 2
  if (wantCompact !== o.compact) return { compact: wantCompact, stack: false, left: Math.max(lo, center) }
  if (fits(o.barW, 0))
    return { compact: o.compact, stack: false, left: Math.min(Math.max(center, lo), o.vw - m - o.barW) }
  // 精簡版也放不下：目標面板移到頂列下方，頂列置中（太窄就靠左）
  return { compact: o.compact, stack: o.guideRight !== null, left: Math.max(m, center) }
}

/** 目標面板要往下讓出的位置（CSS px，已除以縮放；null = 照常在左上角）：精簡版頂列也放不下時由 TopBar 設定 */
export const guideBelow = signal<number | null>(null)
