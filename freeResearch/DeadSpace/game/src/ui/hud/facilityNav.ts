// 目標面板的「到某設施」步驟：點一下就讓自己的主單位走到本區最近的那一台（UI 審查第 2 輪）。
// 只用 client 本來就有的資料：站體版面（場景、小地圖畫的就是同一份）與自己主單位的位置；
// 不看視野外的實體（販賣機被打爆了也照樣走過去，到了自然看得到）。
// 這裡全是純函式（單元測試直接驗）；送指令的那一層在 Guide.tsx（和小地圖右鍵一樣用 sendCmd 的 move）。
import { parseLayout, walkableCell, type ParsedLayout, type PoiInstance } from '../../shared/layout'
import { STATION_BY_ID } from '../../shared/content/stations/index'
import { DEFAULT_BODY_R, consoleApproach, walkableTarget, type Pt } from '../../render/moveTargets'

/** 目標面板會叫玩家去的設施種類 */
export type NavKind = 'suit' | 'medical' | 'sampler' | 'console' | 'escapePod' | 'fabPad'

export const NAV_KINDS: readonly NavKind[] = ['suit', 'medical', 'sampler', 'console', 'escapePod', 'fabPad']

/** 版面上的這個 POI 算不算這種設施（分類同小地圖 minimapColors.ts 的 poiColor：醫療補給、防護服販賣機、GIT）*/
export function navMatches(kind: NavKind, p: PoiInstance): boolean {
  const k = p.def.kind
  const ref = p.def.ref ?? ''
  switch (kind) {
    case 'suit':
      return k === 'vendor' && ref.startsWith('suit')
    case 'medical':
      return k === 'vendor' && ref === 'medical'
    // 基因檢測器：醫療補給與 GIT 檢測儀都有（strings/guide.ts 的 guide.s.samplerGet）
    case 'sampler':
      return (k === 'vendor' && ref === 'medical') || k === 'git'
    // 站點主控台（船艙控制台不算：船艇沒有「站內監控掃描」，也不是事件對策要駕駛的站）
    case 'console':
      return k === 'console'
    case 'escapePod':
      return k === 'vendor' && ref === 'escapePod'
    // 仿生人升級：站上鑄造台旁的平台（sim 的 facilities.ts onPads）
    case 'fabPad':
      return k === 'fabricatorPad'
  }
}

/**
 * 目標面板的步驟 → 要去的設施。只列「叫玩家走到某台設施」的步驟；
 * 「基因檢測 {t} 後開放（醫療補給、GIT）」也算：先過去等，上架時就在旁邊。
 */
export const STEP_NAV: Readonly<Record<string, NavKind>> = {
  'guide.s.suitGet': 'suit',
  'guide.s.altGear': 'medical',
  'guide.s.samplerWait': 'sampler',
  'guide.s.samplerGet': 'sampler',
  'guide.s.altScan': 'console',
  'guide.s.bravadoPod': 'escapePod',
  'guide.s.androidReady': 'fabPad',
  'guide.s.infectParasiteGet': 'medical',
  'guide.s.infectPrionGet': 'medical',
  'guide.ev.drones': 'console',
  'guide.ev.tenshu': 'console',
  'guide.ev.doom': 'escapePod',
  'guide.ev.doom.orbit': 'escapePod',
  'guide.ev.doom.fleet': 'escapePod',
}

/** 只在某一站才指得到的步驟：天守收容失效要駕駛的是天守砲台的控制台，在別站點了會走去錯的控制台 */
const STEP_STATION: Readonly<Record<string, string>> = {
  'guide.ev.tenshu': 'tenshu',
}

/** 這個步驟在這一站能不能「點一下走過去」：回傳要去的設施種類（不能就是 null；還要再看本區有沒有那種設施）*/
export function navKindOf(stepKey: string, station: string | undefined): NavKind | null {
  const k = STEP_NAV[stepKey]
  if (!k) return null
  const only = STEP_STATION[stepKey]
  if (only && only !== station) return null
  return k
}

const layouts = new Map<string, ParsedLayout | null>()

/** 站點的版面（解析一次就快取）；船艙（ship:…）與不認得的 id 回傳 null（船艙裡沒有這些設施）*/
export function stationLayout(station: string | undefined): ParsedLayout | null {
  if (!station) return null
  let l = layouts.get(station)
  if (l === undefined) {
    const st = STATION_BY_ID.get(station)
    l = st ? parseLayout(st.layout) : null
    layouts.set(station, l)
  }
  return l
}

/** 版面上所有這種設施 */
export function navCandidates(l: ParsedLayout, kind: NavKind): PoiInstance[] {
  return l.pois.filter((p) => navMatches(kind, p))
}

const hasCache = new Map<string, boolean>()

/** 這一站有沒有這種設施（目標面板每個快照都會問：快取）*/
export function stationHas(station: string | undefined, kind: NavKind): boolean {
  if (!station) return false
  const key = station + '|' + kind
  let v = hasCache.get(key)
  if (v === undefined) {
    const l = stationLayout(station)
    v = !!l && navCandidates(l, kind).length > 0
    hasCache.set(key, v)
  }
  return v
}

/** 公尺座標 → 格 index（界外 -1）*/
function idxAt(l: ParsedLayout, x: number, y: number): number {
  const col = Math.floor(x)
  const row = l.h - 1 - Math.floor(y)
  if (col < 0 || row < 0 || col >= l.w || row >= l.h) return -1
  return row * l.w + col
}

function openIdx(l: ParsedLayout, i: number): boolean {
  return i >= 0 && walkableCell(l, i % l.w, Math.floor(i / l.w))
}

/**
 * 從 from 走到每一格的步數（4 方向漫延，門一律當作可走：client 不知道門禁，交給 sim 判斷；-1 = 走不到）。
 * from 落在擋路的格子上（貼著設施站）時從旁邊最近的可走格開始（同 moveTargets.ts 的 reachFrom）。
 */
export function pathSteps(l: ParsedLayout, from: Pt): Int32Array {
  const dist = new Int32Array(l.w * l.h).fill(-1)
  let start = idxAt(l, from.x, from.y)
  if (!openIdx(l, start)) {
    start = -1
    let best = Infinity
    const c0 = Math.floor(from.x)
    const y0 = Math.floor(from.y)
    for (let dy = -1; dy <= 1; dy++)
      for (let dx = -1; dx <= 1; dx++) {
        const i = idxAt(l, c0 + dx + 0.5, y0 + dy + 0.5)
        if (!openIdx(l, i)) continue
        const d = (c0 + dx + 0.5 - from.x) ** 2 + (y0 + dy + 0.5 - from.y) ** 2
        if (d < best) {
          best = d
          start = i
        }
      }
    if (start < 0) return dist
  }
  const queue = new Int32Array(l.w * l.h)
  let head = 0
  let tail = 0
  queue[tail++] = start
  dist[start] = 0
  while (head < tail) {
    const i = queue[head++]
    const col = i % l.w
    const row = (i - col) / l.w
    for (const [dc, dr] of DIR4) {
      const c = col + dc
      const r = row + dr
      if (c < 0 || r < 0 || c >= l.w || r >= l.h || !walkableCell(l, c, r)) continue
      const j = r * l.w + c
      if (dist[j] >= 0) continue
      dist[j] = dist[i] + 1
      queue[tail++] = j
    }
  }
  return dist
}

const DIR4: [number, number][] = [
  [1, 0],
  [-1, 0],
  [0, 1],
  [0, -1],
]

/**
 * 實心設施（販賣機、GIT）旁要站在離中心多近以內：sim 的購買距離是 VENDOR_RANGE 2.6 ＋販賣機半徑（vendors.ts），
 * 販賣機面板 2.9（VendorPanel.tsx）；留餘裕取 2.2。
 */
export const NAV_REACH = 2.2

/**
 * 要走到這台設施的哪一點（走不到、或最近的可走點已經離設施太遠＝隔著牆，回傳 null）：
 * - 控制台：控制圈裡站得到、離自己最近的一點（moveTargets.ts consoleApproach；走到就會開始駕駛，同場景右鍵控制台）
 * - 不佔格的（鑄造平台）：那一格的正中央
 * - 實心設施（販賣機、GIT）：它面向的那一格（parseLayout 自動朝向最近的開放地板），不行就同房間最近走得到的格
 */
export function approachPoint(l: ParsedLayout, p: PoiInstance, from: Pt, bodyR = DEFAULT_BODY_R, reach: Uint8Array | null = null): Pt | null {
  if (p.def.kind === 'console') return consoleApproach(l, p, from, bodyR, reach)?.stand ?? null
  const near = (t: Pt | null, r: number): Pt | null => (t && Math.hypot(t.x - p.x, t.y - p.y) <= r ? t : null)
  if (p.def.solid === false) return near(walkableTarget(l, p, bodyR, reach), 0.5)
  const f = Number.isFinite(p.facing) ? p.facing : 0
  const front = { x: p.x + Math.cos(f), y: p.y + Math.sin(f) }
  return near(walkableTarget(l, front, bodyR, reach), NAV_REACH) ?? near(walkableTarget(l, p, bodyR, reach), NAV_REACH)
}

export interface NavTarget extends Pt {
  /** 選中的那台設施 */
  poi: PoiInstance
  /** 走過去的步數（格；-1 = 自己的位置在漫延範圍外，改用直線距離挑）*/
  steps: number
}

/**
 * 本區最近（走路步數最少）的那一台這種設施，以及要走到的點。都走不到回傳 null（呼叫端顯示「無法到達」）。
 * from = 自己主單位的位置（同一個 zone）；bodyR = 身體半徑。
 */
export function navTarget(l: ParsedLayout, kind: NavKind, from: Pt, bodyR = DEFAULT_BODY_R): NavTarget | null {
  const dist = pathSteps(l, from)
  let any = false
  const reach = new Uint8Array(dist.length)
  for (let i = 0; i < dist.length; i++)
    if (dist[i] >= 0) {
      reach[i] = 1
      any = true
    }
  // 自己站的格子在漫延範圍外（例如卡在動態障礙旁）：不要因為這樣就說到不了，改用直線距離挑
  const r = any ? reach : null
  let best: NavTarget | null = null
  let bestScore = Infinity
  for (const p of navCandidates(l, kind)) {
    const t = approachPoint(l, p, from, bodyR, r)
    if (!t) continue
    const i = idxAt(l, t.x, t.y)
    const steps = r && i >= 0 ? dist[i] : -1
    if (r && steps < 0) continue
    // 步數一樣時用直線距離分先後（步數是格數，直線距離不會超過它）
    const straight = Math.hypot(t.x - from.x, t.y - from.y)
    const score = (steps >= 0 ? steps : straight) + straight * 1e-3
    if (score < bestScore) {
      bestScore = score
      best = { x: t.x, y: t.y, poi: p, steps }
    }
  }
  return best
}
