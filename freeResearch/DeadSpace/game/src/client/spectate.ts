// 觀戰（第 8 輪「第十場之後」）：sim 送來的觀戰看板（PrivateState.spec，只有死者與旁觀者收得到）的 client 端：
// - 清單：依活動分層排序（交戰中 → 剛有人死／有動靜 → 有人 → 無人），層內維持原本順序，清單不會每秒亂跳；
// - 下一個熱點（按鈕、按鍵 N）：依活動程度輪流跳站；
// - 自動跟隨戰鬥（viewPrefs.followMode = 'action'）：死亡時預設打開；這一站安靜了就換到別站正在打的地方，
//   沒有人的空站換到人多的站；站內沒有新戰鬥時鏡頭對準看板的交戰焦點或人群（gameScene 的戰鬥跟隨呼叫 actionTick）。
//   手動點清單選站＝釘住這一站（只在站內跟，不自動換站），按「下一個熱點」或重新打開跟隨才解除。
// - 亡者之眼（settings.ghostSight）：快照的 gf（真實陣營）→ 名牌顏色。
// 純邏輯函式不碰 session（單元測試直接呼叫）；用到 session 的只在函式裡面取用（有些單元測試的 session mock 不完整）。
import type { CEnt, ClientWorld } from './world'
import type { GhostKind, PrivateState, SnapEntity, SpecBoard } from '../shared/protocol/messages'
import { EntFlag } from '../shared/protocol/messages'
import { UNITS } from '../shared/content/registry'
import { followMode } from './viewPrefs'
import { sendCmd, world as sessionWorld } from './session'

/** 這麼多秒內有玩家參與的交戰：清單標「交戰中」 */
export const COMBAT_RECENT = 8
/** 這麼多秒內有人死：清單算「有動靜」 */
const DEATH_RECENT = 60
/** 自動換站後至少停這麼久（遊戲秒數）才會再換 */
export const SWITCH_DWELL = 8
/** 這一站最近一次交戰超過這麼久才算安靜、可以換走 */
const QUIET = 6
/** 別站的交戰要多新（秒）才值得自動跳過去 */
const HOT_FRESH = 4
/** 戰鬥跟隨的焦點這麼久（秒，畫面時間）沒有新事件：改用看板焦點或人群 */
export const ACTION_IDLE = 12

export interface BoardRow {
  id: number
  living: number
  /** 最近一次有玩家參與的交戰（遊戲秒數；-1 = 沒有）*/
  combat: number
  heat: number
  hx: number
  hy: number
  /** 這裡最近的死亡 */
  death?: { t: number; name: string; kind: string }
}

/** 看板 → zone id 對應的列（死亡掛到各自的地點上，只留最新一筆）*/
export function boardRows(b: SpecBoard | undefined): Map<number, BoardRow> {
  const out = new Map<number, BoardRow>()
  if (!b) return out
  for (const [id, living, combat, heat, hx, hy] of b.z) out.set(id, { id, living, combat, heat, hx, hy })
  for (const [z, t, name, kind] of b.d) {
    const r = out.get(z)
    if (r && (!r.death || r.death.t < t)) r.death = { t, name, kind }
  }
  return out
}

/** 交戰中（清單的紅色標記）*/
export function inCombat(r: BoardRow | undefined, now: number): boolean {
  return !!r && r.combat >= 0 && now - r.combat <= COMBAT_RECENT
}

/** 排序用的活動分層：3 交戰中、2 剛有人死或有動靜、1 有人、0 無人（層內維持原本順序，清單不亂跳）*/
export function activityTier(r: BoardRow | undefined, now: number): number {
  if (!r) return 0
  if (inCombat(r, now)) return 3
  if ((r.death && now - r.death.t <= DEATH_RECENT) || r.heat >= 3) return 2
  return r.living > 0 ? 1 : 0
}

/** 熱點的連續分數（下一個熱點、自動換站用）：交戰越新越熱越高，其次剛死人、人多；0 = 什麼都沒有 */
export function activityScore(r: BoardRow, now: number): number {
  let s = 0
  if (r.combat >= 0 && now - r.combat <= 30) s += 1000 - (now - r.combat) * 20 + r.heat * 4
  else s += r.heat * 4
  if (r.death && now - r.death.t <= DEATH_RECENT) s += 60 - (now - r.death.t)
  s += r.living * 10
  return s
}

/** 依活動分層排序（穩定：同一層照 order）；order = 原本的位置 */
export function sortByActivity<T>(items: T[], rowOf: (x: T) => BoardRow | undefined, now: number): T[] {
  return items
    .map((x, i) => ({ x, i, k: activityTier(rowOf(x), now) }))
    .sort((a, b) => b.k - a.k || a.i - b.i)
    .map((o) => o.x)
}

/** 下一個熱點：分數由高到低輪流（目前這站之後的下一個）；沒有任何動靜回傳 null */
export function nextHotZone(rows: Map<number, BoardRow>, cur: number | undefined, now: number): number | null {
  const list = [...rows.values()].filter((r) => activityScore(r, now) > 0).sort((a, b) => activityScore(b, now) - activityScore(a, now) || a.id - b.id)
  if (!list.length) return null
  const i = list.findIndex((r) => r.id === cur)
  if (i < 0) return list[0].id
  return list.length > 1 ? list[(i + 1) % list.length].id : null
}

/**
 * 自動換站的決定（純邏輯）：這一站還在打就不換；別站剛打起來就過去（挑最熱的）；
 * 這一站沒人也沒剛死人就換到人最多的站。回傳要換去的 zone，不換回傳 null
 */
export function autoZone(rows: Map<number, BoardRow>, cur: number | undefined, now: number): number | null {
  const here = cur === undefined ? undefined : rows.get(cur)
  if (here && here.combat >= 0 && now - here.combat <= QUIET) return null
  let best: BoardRow | null = null
  for (const r of rows.values()) {
    if (r.id === cur || r.combat < 0 || now - r.combat > HOT_FRESH) continue
    if (!best || r.heat > best.heat) best = r
  }
  if (best) return best.id
  if (here && (here.living > 0 || (here.death && now - here.death.t <= 15))) return null
  let crowd: BoardRow | null = null
  for (const r of rows.values()) if (r.id !== cur && r.living > 0 && (!crowd || r.living > crowd.living)) crowd = r
  return crowd ? crowd.id : null
}

/** 這位 client 正在觀戰（看得到全場的死者或旁觀者；出局、等記憶核心的仿生人不算）*/
export function spectatingMe(me: Partial<PrivateState>): boolean {
  return (me.alive === false || me.role === 'spectator') && !me.booted && !me.coreWait
}

// ───────── 自動跟隨戰鬥的狀態（每個分頁一份）─────────

const follow = { lastSwitch: -1e9, pinned: false, decideAt: 0 }

/** 開始觀戰（死亡、旁觀者開局）：預設打開自動跟隨戰鬥，馬上可以換站 */
export function onSpectateStart(): void {
  follow.pinned = false
  follow.lastSwitch = -1e9
  followMode.value = 'action'
}

/** 不再觀戰（復活、新的一局）：活人的鏡頭不能還在自動跟著戰鬥跑 */
export function onSpectateEnd(): void {
  follow.pinned = false
  if (followMode.peek() === 'action') followMode.value = 'off'
}

/** 手動在清單上選站：釘住這一站（站內照樣跟戰鬥，但不自動換站）*/
export function pinZone(): void {
  follow.pinned = true
}

/** 解除釘住（重新打開自動跟隨、按下一個熱點）*/
export function unpinZone(): void {
  follow.pinned = false
}

/** 測試用：目前是否釘住 */
export function zonePinned(): boolean {
  return follow.pinned
}

/** 下一個熱點（按鈕、按鍵）：跳到下一個有動靜的站並打開自動跟隨。不在觀戰中回傳 false（按鍵不處理）*/
export function nextHotspot(w: ClientWorld = sessionWorld): boolean {
  if (!spectatingMe(w.me)) return false
  follow.pinned = false
  followMode.value = 'action'
  const z = nextHotZone(boardRows(w.me.spec), w.me.specZone, w.serverTime)
  if (z !== null && z !== w.me.specZone) {
    sendCmd({ k: 'spec', s: z })
    follow.lastSwitch = w.serverTime
  }
  return true
}

/** 人群焦點的快取（每 1.5 秒重算；新位置離舊的 3 公尺以內就不動，鏡頭不抖）*/
const crowd = { zone: -1, at: -1e9, x: 0, y: 0, ok: false }

/** 這個 zone 裡人最多的地方（看得到的人員與玩家單位，死者看得到整個 zone）；沒有人回傳 null */
export function crowdSpot(ents: Iterable<CEnt>, zone: number): { x: number; y: number } | null {
  const pts: { x: number; y: number }[] = []
  for (const e of ents) {
    const s = e.s
    if (s.z !== zone || ((s.fl ?? 0) & EntFlag.Corpse) || (s.st ?? 0) === 4) continue
    const def = UNITS.get(s.d ?? '')
    if (def?.tags.includes('structure')) continue
    if ((s.o ?? -1) < 0 && !def?.tags.includes('personnel')) continue
    pts.push({ x: e.x, y: e.y })
  }
  if (!pts.length) return null
  let best = pts[0]
  let bestN = 0
  for (const p of pts) {
    let n = 0
    for (const q of pts) if ((p.x - q.x) ** 2 + (p.y - q.y) ** 2 <= 64) n++
    if (n > bestN) {
      bestN = n
      best = p
    }
  }
  let sx = 0
  let sy = 0
  let n = 0
  for (const q of pts) {
    if ((best.x - q.x) ** 2 + (best.y - q.y) ** 2 > 64) continue
    sx += q.x
    sy += q.y
    n++
  }
  return { x: sx / n, y: sy / n }
}

const pt = { x: 0, y: 0 }

/**
 * 戰鬥跟隨的每幀補充（render/gameScene.ts 的 action 跟隨呼叫；now = performance.now() 秒）：
 * 1. 觀戰中、沒有釘住站：每 0.5 秒看一次看板，需要時換站（autoZone；換站後至少停 SWITCH_DWELL 秒）；
 * 2. 回傳這一站沒有新戰鬥時鏡頭要對準的地方：看板的交戰焦點（剛打過），否則人群。沒有就 null
 */
export function actionTick(w: ClientWorld, zone: number, now: number): { x: number; y: number } | null {
  const me = w.me
  if (!spectatingMe(me)) return null
  const rows = boardRows(me.spec)
  const gt = w.serverTime
  if (!follow.pinned && now >= follow.decideAt && rows.size) {
    follow.decideAt = now + 0.5
    if (gt - follow.lastSwitch >= SWITCH_DWELL) {
      const z = autoZone(rows, me.specZone, gt)
      if (z !== null && z !== me.specZone) {
        sendCmd({ k: 'spec', s: z })
        follow.lastSwitch = gt
      }
    }
  }
  const r = rows.get(zone)
  if (r && r.combat >= 0 && gt - r.combat <= COMBAT_RECENT) {
    pt.x = r.hx
    pt.y = r.hy
    return pt
  }
  if (crowd.zone !== zone || now - crowd.at > 1.5) {
    const c = crowdSpot(w.ents.values(), zone)
    if (!c) crowd.ok = false
    else if (!crowd.ok || crowd.zone !== zone || (c.x - crowd.x) ** 2 + (c.y - crowd.y) ** 2 > 9) {
      crowd.x = c.x
      crowd.y = c.y
      crowd.ok = true
    }
    crowd.zone = zone
    crowd.at = now
  }
  if (!crowd.ok) return null
  pt.x = crowd.x
  pt.y = crowd.y
  return pt
}

// ───────── 亡者之眼：名牌顏色 ─────────

/** 真實陣營的名牌顏色（和結算畫面的身分色一致：人類青、仿生人琥珀、異形紫、變種人紅）*/
export const GHOST_COLORS: Record<GhostKind, string> = { h: '#9fe7ff', a: '#ffb000', x: '#b28cff', xs: '#b28cff', m: '#ff6b72', ms: '#ff6b72' }

/** 這個單位的亡者之眼名牌顏色（快照沒有 gf ＝ 不是亡者之眼的觀看者，回傳 null 照原本的玩家色）*/
export function ghostColor(s: Pick<SnapEntity, 'gf'>): string | null {
  return s.gf ? (GHOST_COLORS[s.gf] ?? null) : null
}
