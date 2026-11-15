// 右側互動面板（販賣機、站內設施）要顯示哪一台：範圍內可能同時有好幾台（GIT 檢測儀旁邊放了 GIT 解析器、販賣機挨在一起、
// 動力分配台旁邊有販賣機）。以前只顯示最近的那台，旁邊那台的面板永遠打不開。
// 現在：右鍵點哪台就優先顯示哪台（input.ts 記在 lastInteract）；範圍內 2 台以上時面板上方有小分頁可以切換（點分頁也記在 lastInteract）。
// VendorPanel 與 FacilityPanel 各自渲染，用同一份清單決定這一刻輪到誰。
import type { FacilityView, SnapEntity } from '../shared/protocol/messages'

/** 販賣機面板的距離（公尺；sim 的購買距離是 2.6＋販賣機半徑，留一點餘裕，面板上的按鈕按下去不會回「太遠」）*/
export const VENDOR_PANEL_RANGE = 2.9

export interface PanelEntry {
  /** vendor = 販賣機（快照 x2.s 是庫存）；fac = sim 送來的設施面板（PrivateState.fac）*/
  kind: 'vendor' | 'fac'
  /** 實體 id（設施面板＝fac.e）*/
  id: number
  /** 外觀 id（販賣機名稱用；設施面板不用）*/
  d: string
  /** 離自己的距離（公尺；設施面板的實體不在快照裡時當作 0）*/
  dist: number
}

interface EntLike {
  s: SnapEntity
  x: number
  y: number
}

/** 範圍內的所有面板，由近到遠；fac = sim 判定自己站在旁邊的設施面板（一次只會有一個）*/
export function panelEntries(me: EntLike | undefined, ents: ReadonlyMap<number, EntLike>, fac: FacilityView | null | undefined, range = VENDOR_PANEL_RANGE): PanelEntry[] {
  if (!me) return []
  const out: PanelEntry[] = []
  for (const e of ents.values()) {
    if (e.s.z !== me.s.z || typeof e.s.x2?.s !== 'string') continue
    const d = Math.hypot(e.x - me.x, e.y - me.y)
    if (d < range) out.push({ kind: 'vendor', id: e.s.i, d: e.s.d ?? '', dist: d })
  }
  if (fac) {
    const e = ents.get(fac.e)
    out.push({ kind: 'fac', id: fac.e, d: e?.s.d ?? '', dist: e ? Math.hypot(e.x - me.x, e.y - me.y) : 0 })
  }
  out.sort((a, b) => a.dist - b.dist || a.id - b.id)
  return out
}

/** 這一刻要顯示哪一個：玩家最後右鍵（或點分頁）的那台還在範圍內就是它，否則最近的那台 */
export function pickPanel(list: readonly PanelEntry[], picked: number): PanelEntry | null {
  if (!list.length) return null
  return list.find((p) => p.id === picked) ?? list[0]
}
