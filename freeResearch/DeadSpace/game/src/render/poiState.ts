// 站內固定設施（烘焙進站體的 POI 模型）的外觀狀態：完好／損毀的控制台／已被摧毀。
// 固定設施的模型是站體的一部分，對應的實體被移除（販賣機打爆、雜物箱翻找、雕像打碎…）時模型不會自己消失；
// 也不能一看到實體不在快照裡就藏起來：設施離開視野時一樣會從快照消失。所以只在「那一格明明看得到，實體卻不在」
// 持續一小段時間後才判定被摧毀；看不到的時候維持記憶中的樣子（戰爭迷霧裡的地形記憶，不洩漏視野外發生的事）。
// 看得到與否照 sim 的視野規則重算一次（vision.ts：來源半徑內、nav.los 不被牆與關著的門擋住），不用迷霧貼圖的取樣，
// 避免兩邊的射線誤差讓完好的設施閃一下不見。純邏輯、不碰 three，單元測試直接驗。
import { Cell, type ParsedLayout } from '../shared/layout'

export type PoiLook = 'ok' | 'broken' | 'gone'

/**
 * 會被摧毀或換掉的 POI 種類。其餘固定設施（動力分配台、鑄造台、隔間門／籠子控制台、生命再生器…）原作就無敵，
 * 不追蹤，免得視野邊緣的誤差把它們藏起來。
 */
export const TRACKED_POI = new Set(['vendor', 'console', 'git', 'rummageBox', 'penguinStatue', 'moduleFactory', 'moduleSocket'])

/** 格子明明看得到、實體卻不在多久才算被摧毀（秒）：快照 20 Hz，留幾份快照的餘裕 */
export const GONE_AFTER = 0.6

/** 視野來源只算半徑的這個比例以內（sim 以實體中心距離判定，留一點邊緣誤差）*/
const RANGE_K = 0.92

/** 這一幀在某個 POI 格上看到的結構實體 */
export interface PoiSeen {
  def: string
  invuln: boolean
}

interface State {
  look: PoiLook
  /** 開始「看得到卻不在」的時間（-1 = 沒有）*/
  missSince: number
  /** 最後一次看到時是否無敵（無敵的設施不會被摧毀：不判定成被毀）*/
  invuln: boolean
}

export interface PoiCellInfo {
  key: string
  kind: string
  x: number
  y: number
}

/** 依實體定義決定外觀：損毀的控制台換成殘骸外觀，其餘完好 */
export function lookOfDef(kind: string, def: string): PoiLook {
  return kind === 'console' && def === 'struct.consoleBroken' ? 'broken' : 'ok'
}

export class PoiTracker {
  private st = new Map<string, State>()
  private readonly cells: PoiCellInfo[]
  private readonly opaque: Uint8Array

  constructor(readonly layout: ParsedLayout) {
    this.cells = layout.pois.filter((p) => TRACKED_POI.has(p.def.kind)).map((p) => ({ key: `${p.col},${p.row}`, kind: p.def.kind, x: p.x, y: p.y }))
    this.opaque = new Uint8Array(layout.w * layout.h)
    for (let i = 0; i < layout.w * layout.h; i++) {
      const c = layout.cells[i] as Cell
      this.opaque[i] = c === Cell.Wall || c === Cell.Void ? 1 : 0
    }
  }

  look(key: string): PoiLook {
    return this.st.get(key)?.look ?? 'ok'
  }

  /** 追蹤中的格子（測試與除錯用）*/
  tracked(): readonly PoiCellInfo[] {
    return this.cells
  }

  /**
   * 每次迷霧更新時呼叫（約 10 Hz）。seen = 這一幀快照裡站在 POI 格上的結構實體；sources = 自己這邊的視野來源；
   * doorClosed(門 index) = 這扇門目前擋不擋視線；full = 整個 zone 都看得到（死者、旁觀者）。回傳外觀有變的格。
   */
  update(now: number, seen: ReadonlyMap<string, PoiSeen>, sources: readonly { x: number; y: number; r: number }[], doorClosed: (idx: number) => boolean, full = false): [string, PoiLook][] {
    const changed: [string, PoiLook][] = []
    for (const c of this.cells) {
      let s = this.st.get(c.key)
      const prev = s?.look ?? 'ok'
      const hit = seen.get(c.key)
      let look = prev
      if (hit) {
        if (!s) this.st.set(c.key, (s = { look: 'ok', missSince: -1, invuln: hit.invuln }))
        s.invuln = hit.invuln
        s.missSince = -1
        look = lookOfDef(c.kind, hit.def)
      } else if (!s?.invuln && (full || this.visibleAt(c.x, c.y, sources, doorClosed))) {
        if (!s) this.st.set(c.key, (s = { look: prev, missSince: -1, invuln: false }))
        if (s.missSince < 0) s.missSince = now
        if (now - s.missSince >= GONE_AFTER) look = 'gone'
      } else if (s) s.missSince = -1
      if (s && look !== prev) {
        s.look = look
        changed.push([c.key, look])
      }
    }
    return changed
  }

  /** sim 的視野規則：某個來源在半徑內、而且 nav.los（忽略終點格）不被牆或關著的門擋住 */
  visibleAt(x: number, y: number, sources: readonly { x: number; y: number; r: number }[], doorClosed: (idx: number) => boolean): boolean {
    for (const s of sources) {
      const r = s.r * RANGE_K
      if ((s.x - x) ** 2 + (s.y - y) ** 2 > r * r) continue
      if (this.los(s.x, s.y, x, y, doorClosed)) return true
    }
    return false
  }

  /** 與 sim/nav 的 los(x0, y0, x1, y1, ignoreEnd = true) 相同的格子走訪（起點格與終點格不算）*/
  private los(x0: number, y0: number, x1: number, y1: number, doorClosed: (idx: number) => boolean): boolean {
    const l = this.layout
    const w = l.w
    let col = Math.floor(x0)
    let rowY = Math.floor(y0)
    const c0 = col
    const r0 = rowY
    const endCol = Math.floor(x1)
    const endRowY = Math.floor(y1)
    const dx = x1 - x0
    const dy = y1 - y0
    const stepX = dx > 0 ? 1 : -1
    const stepY = dy > 0 ? 1 : -1
    const tDeltaX = dx !== 0 ? Math.abs(1 / dx) : Infinity
    const tDeltaY = dy !== 0 ? Math.abs(1 / dy) : Infinity
    let tMaxX = dx !== 0 ? (dx > 0 ? col + 1 - x0 : x0 - col) * tDeltaX : Infinity
    let tMaxY = dy !== 0 ? (dy > 0 ? rowY + 1 - y0 : y0 - rowY) * tDeltaY : Infinity
    let n = Math.abs(endCol - col) + Math.abs(endRowY - rowY) + 1
    while (n-- > 0) {
      const row = l.h - 1 - rowY
      if (col < 0 || row < 0 || col >= w || row >= l.h) return false
      const i = row * w + col
      const isEnd = col === endCol && rowY === endRowY
      if (!(col === c0 && rowY === r0) && !isEnd) {
        if (this.opaque[i]) return false
        const d = l.doorOf[i]
        if (d >= 0 && doorClosed(d)) return false
      }
      if (tMaxX < tMaxY) {
        tMaxX += tDeltaX
        col += stepX
      } else {
        tMaxY += tDeltaY
        rowY += stepY
      }
    }
    return true
  }
}
