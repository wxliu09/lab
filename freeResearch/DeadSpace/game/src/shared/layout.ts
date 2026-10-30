// ASCII 站體版面解析器：同一份資料產生導航格、碰撞牆、LOS 遮擋（sim）與 3D 場景（render）。
// 1 字元 = 1 m。座標：x 向右、y 向「上」（第 0 列在最上方 = y 最大）。
//
// legend（固定）：
//   #  牆            .  地板            (空白) 太空／外部（不可走）
//   =  窗（擋移動、不擋視線）            x  貨箱等矮障礙（擋移動、不擋視線）
//   D  門（自動開關）  S  出生點          P  停機坪（停泊艇落點）
//   ~  危險區（地板，持續傷害依站設定）  E  出入口拱門（對接船艦進出）
//   其他字母／數字：站定義裡的 pois 表（販賣機、控制台、GIT…），也算地板上的設施

export type CellKind = 'void' | 'floor' | 'wall' | 'window' | 'crate' | 'door' | 'hazard'

export const enum Cell {
  Void = 0,
  Floor = 1,
  Wall = 2,
  Window = 3,
  Crate = 4,
  Door = 5,
  Hazard = 6,
  /** 設施佔據的格子：擋移動、不擋視線 */
  Fixture = 7,
}

export interface PoiDef {
  kind: string
  /** 對應內容 id（販賣機 id、控制台綁定的站…）*/
  ref?: string
  /** 設施是否佔格（擋移動）；預設 true */
  solid?: boolean
  /** 面向（弧度）；預設自動朝向最近的開放地板 */
  facing?: number
  /** 自訂資料 */
  data?: Record<string, string | number | boolean>
}

export interface DoorSpec {
  /** 只對持有此 ID 卡者開啟 */
  clearance?: string
  /** 開局鎖住 */
  locked?: boolean
  /** 可被艦長卡鎖／開 */
  security?: boolean
}

export interface RoomSpec {
  id: string
  name: { zh: string; en: string }
  /** 房間類型：決定道具、燈光、地板材質 */
  type: string
  /** flood-fill 種子（字元座標 col,row）*/
  seed: [number, number]
  /** 主光色 */
  light?: string
  /** 第二光色 */
  accent?: string
}

export interface LayoutSpec {
  rows: string[]
  pois: Record<string, PoiDef>
  rooms: RoomSpec[]
  /** 門的特殊設定：key = `${col},${row}`（門的任一格）*/
  doors?: Record<string, DoorSpec>
}

export interface PoiInstance {
  key: string
  def: PoiDef
  /** 公尺座標（格中心）*/
  x: number
  y: number
  col: number
  row: number
  facing: number
}

export interface DoorInstance {
  index: number
  /** 門佔據的格（1–3 格寬的門會合併成一扇）*/
  cells: [number, number][]
  x: number
  y: number
  /** true = 門板沿 x 方向（通道為南北向）*/
  horizontal: boolean
  width: number
  spec: DoorSpec
}

export interface RoomInstance {
  spec: RoomSpec
  index: number
  cells: number
  minX: number
  minY: number
  maxX: number
  maxY: number
  cx: number
  cy: number
}

export interface ParsedLayout {
  w: number
  h: number
  /** cells[row * w + col]，row 0 = 最上方 */
  cells: Uint8Array
  /** 每格所屬房間 index（-1 = 走廊／無）*/
  roomOf: Int16Array
  pois: PoiInstance[]
  doors: DoorInstance[]
  /** 每格所屬門 index（-1 = 非門）*/
  doorOf: Int16Array
  rooms: RoomInstance[]
  spawns: { x: number; y: number }[]
  pads: { x: number; y: number }[]
  exits: { x: number; y: number }[]
}

const FIXED: Record<string, Cell> = {
  '#': Cell.Wall,
  '.': Cell.Floor,
  ' ': Cell.Void,
  '=': Cell.Window,
  x: Cell.Crate,
  D: Cell.Door,
  S: Cell.Floor,
  P: Cell.Floor,
  E: Cell.Floor,
  '~': Cell.Hazard,
}

/** 字元座標 → 公尺座標（格中心）*/
export function cellCenter(l: { h: number }, col: number, row: number): { x: number; y: number } {
  return { x: col + 0.5, y: l.h - row - 0.5 }
}

/** 公尺座標 → 字元座標 */
export function cellAt(l: { h: number }, x: number, y: number): { col: number; row: number } {
  return { col: Math.floor(x), row: l.h - 1 - Math.floor(y) }
}

export function parseLayout(spec: LayoutSpec): ParsedLayout {
  const h = spec.rows.length
  const w = Math.max(...spec.rows.map((r) => r.length))
  const cells = new Uint8Array(w * h)
  const pois: PoiInstance[] = []
  const spawns: { x: number; y: number }[] = []
  const pads: { x: number; y: number }[] = []
  const exits: { x: number; y: number }[] = []
  for (let row = 0; row < h; row++) {
    const line = spec.rows[row]
    for (let col = 0; col < w; col++) {
      const ch = line[col] ?? ' '
      const idx = row * w + col
      const fixed = FIXED[ch]
      const c = cellCenter({ h }, col, row)
      if (fixed !== undefined) {
        cells[idx] = fixed
        if (ch === 'S') spawns.push(c)
        else if (ch === 'P') pads.push(c)
        else if (ch === 'E') exits.push(c)
      } else {
        const def = spec.pois[ch]
        if (!def) throw new Error(`layout: 未定義的字元 '${ch}' @${col},${row}`)
        cells[idx] = def.solid === false ? Cell.Floor : Cell.Fixture
        pois.push({ key: ch, def, x: c.x, y: c.y, col, row, facing: def.facing ?? NaN })
      }
    }
  }
  const layout: ParsedLayout = {
    w,
    h,
    cells,
    roomOf: new Int16Array(w * h).fill(-1),
    pois,
    doors: [],
    doorOf: new Int16Array(w * h).fill(-1),
    rooms: [],
    spawns,
    pads,
    exits,
  }
  // 設施自動朝向最近的開放地板
  for (const p of pois) {
    if (!Number.isNaN(p.facing)) continue
    const dirs: [number, number, number][] = [
      [0, -1, Math.PI / 2],
      [0, 1, -Math.PI / 2],
      [1, 0, 0],
      [-1, 0, Math.PI],
    ]
    p.facing = 0
    for (const [dc, dr, ang] of dirs) {
      if (walkableCell(layout, p.col + dc, p.row + dr)) {
        p.facing = ang
        break
      }
    }
  }
  mergeDoors(layout, spec)
  floodRooms(layout, spec)
  return layout
}

function mergeDoors(l: ParsedLayout, spec: LayoutSpec): void {
  const { w, h, cells } = l
  const seen = new Uint8Array(w * h)
  for (let row = 0; row < h; row++) {
    for (let col = 0; col < w; col++) {
      const i = row * w + col
      if (cells[i] !== Cell.Door || seen[i]) continue
      // 判斷方向：左右是牆 → 門板沿 x（horizontal = 門的寬度方向是 x）
      const run: [number, number][] = []
      const horiz = col + 1 < w && cells[i + 1] === Cell.Door ? true : !(row + 1 < h && cells[i + w] === Cell.Door)
      let c = col
      let r = row
      while (c < w && r < h && cells[r * w + c] === Cell.Door && !seen[r * w + c]) {
        seen[r * w + c] = 1
        run.push([c, r])
        if (horiz) c++
        else r++
      }
      const first = cellCenter(l, run[0][0], run[0][1])
      const last = cellCenter(l, run[run.length - 1][0], run[run.length - 1][1])
      let ds: DoorSpec = {}
      for (const [cc, rr] of run) {
        const s = spec.doors?.[`${cc},${rr}`]
        if (s) ds = s
      }
      const index = l.doors.length
      for (const [cc, rr] of run) l.doorOf[rr * w + cc] = index
      l.doors.push({
        index,
        cells: run,
        x: (first.x + last.x) / 2,
        y: (first.y + last.y) / 2,
        horizontal: horiz,
        width: run.length,
        spec: ds,
      })
    }
  }
}

function floodRooms(l: ParsedLayout, spec: LayoutSpec): void {
  const { w, h, cells, roomOf } = l
  spec.rooms.forEach((rs, index) => {
    const [sc, sr] = rs.seed
    const start = sr * w + sc
    if (cells[start] === Cell.Wall || cells[start] === Cell.Void || cells[start] === Cell.Door)
      throw new Error(`layout: 房間 ${rs.id} 的種子不在地板上`)
    const stack = [start]
    const inst: RoomInstance = { spec: rs, index, cells: 0, minX: 1e9, minY: 1e9, maxX: -1e9, maxY: -1e9, cx: 0, cy: 0 }
    let sx = 0
    let sy = 0
    while (stack.length) {
      const i = stack.pop()!
      if (roomOf[i] !== -1) continue
      const k = cells[i]
      if (k === Cell.Wall || k === Cell.Void || k === Cell.Door || k === Cell.Window) continue
      roomOf[i] = index
      const col = i % w
      const row = (i - col) / w
      const c = cellCenter(l, col, row)
      inst.cells++
      sx += c.x
      sy += c.y
      inst.minX = Math.min(inst.minX, c.x - 0.5)
      inst.maxX = Math.max(inst.maxX, c.x + 0.5)
      inst.minY = Math.min(inst.minY, c.y - 0.5)
      inst.maxY = Math.max(inst.maxY, c.y + 0.5)
      if (col > 0) stack.push(i - 1)
      if (col < w - 1) stack.push(i + 1)
      if (row > 0) stack.push(i - w)
      if (row < h - 1) stack.push(i + w)
    }
    inst.cx = sx / Math.max(1, inst.cells)
    inst.cy = sy / Math.max(1, inst.cells)
    l.rooms.push(inst)
  })
}

export function cellKind(l: ParsedLayout, col: number, row: number): Cell {
  if (col < 0 || row < 0 || col >= l.w || row >= l.h) return Cell.Void
  return l.cells[row * l.w + col] as Cell
}

/** 不考慮門狀態的可走判斷（門視為可走）*/
export function walkableCell(l: ParsedLayout, col: number, row: number): boolean {
  const k = cellKind(l, col, row)
  return k === Cell.Floor || k === Cell.Door || k === Cell.Hazard
}

/** 擋視線的格子（門另外依開關判斷）*/
export function opaqueCell(k: Cell): boolean {
  return k === Cell.Wall || k === Cell.Void
}

export function roomAt(l: ParsedLayout, x: number, y: number): RoomInstance | null {
  const { col, row } = cellAt(l, x, y)
  if (col < 0 || row < 0 || col >= l.w || row >= l.h) return null
  const r = l.roomOf[row * l.w + col]
  return r >= 0 ? l.rooms[r] : null
}
