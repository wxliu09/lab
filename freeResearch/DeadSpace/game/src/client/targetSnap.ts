// 單位目標瞄準的吸附（純函式，input.ts 的場景左鍵與小地圖左鍵共用，單元測試直接驗證）：
// 進入「點一個單位」的瞄準模式（基因檢測器抽血、寄生、停靠、設定航線…）後左鍵沒有正好點在模型上時，
// 附近約 1 格內有符合技能目標篩選的單位，就自動選最近的那一個（移動中的 AI 很難一次點中）。
// 篩選只看快照裡看得到的欄位（外觀 id、旗標、擁有者），是 sim passesFilter（systems/effects.ts）的保守近似：
// client 不知道的條件（陣營、是不是主單位）一律放行，真正的判斷仍交給 sim。
import type { TargetFilter } from '../shared/content/types'
import { UNITS } from '../shared/content/registry'
import { EntFlag, type SnapEntity } from '../shared/protocol/messages'

/** 吸附範圍：目標身體外緣再往外約 1 格（公尺）*/
export const SNAP_M = 1
/** 吸附範圍的螢幕下限（px）：鏡頭拉很遠時 1 格只剩幾個像素，至少給這麼多 */
export const SNAP_MIN_PX = 14

/** 外觀 id 的標籤（站點、販賣機的 UnitDef 只在 sim 端註冊，client 用 id 前綴補上）*/
function tagsOf(d: string): Set<string> {
  const tags = new Set<string>(UNITS.get(d)?.tags ?? [])
  if (d.startsWith('station.')) tags.add('station')
  if (d.startsWith('vendor.')) {
    tags.add('structure')
    tags.add('vendor')
  }
  return tags
}

/**
 * 這個實體是站內的建物（設施、販賣機；吸附時排在人和生物後面）。太空中的站點不算：
 * 太空技能（掃描、重力光束、封鎖信標…）本來就是對站點或船放的，站點和船一樣優先。
 */
export function isStructureLike(s: SnapEntity): boolean {
  return tagsOf(s.d ?? '').has('structure')
}

/** 技能的篩選本來就是要點建物（停靠、設定航線、修控制台、翻找雜物箱…）：吸附時不把建物往後排 */
export function wantsStructure(f: TargetFilter | undefined): boolean {
  if (!f) return false
  if (f.structure || f.station || f.ship || f.rubble || f.door) return true
  if (f.tag === 'vendor' || f.tag === 'console' || f.tag === 'station' || f.tag === 'ship') return true
  return !!f.defs?.length && f.defs.every((d) => isStructureLike({ i: 0, d }) || d.startsWith('ship.') || d.startsWith('station.'))
}

/**
 * 從快照看得到的資訊判斷 s 能不能當這個技能的目標（sim passesFilter 的近似）。
 * selfId = 自己目前操控的單位（sim 的 caster）。地上的物品、noTarget 的東西（特效、恆星、生命再生器）一律不行。
 */
export function targetOk(s: SnapEntity, f: TargetFilter | undefined, selfId: number): boolean {
  const d = s.d ?? ''
  if (d.startsWith('item:') || d === 'groundItem') return false
  const tags = tagsOf(d)
  const fl = s.fl ?? 0
  const corpse = (fl & EntFlag.Corpse) !== 0 || tags.has('corpse')
  if (tags.has('noTarget')) return false
  if (corpse !== !!f?.corpse) return false
  if (!f) return true
  if (s.i === selfId && !f.self) return false
  if (f.organic && !tags.has('organic')) return false
  if (f.nonOrganic && tags.has('organic')) return false
  const structure = tags.has('structure')
  if (f.structure && !structure) return false
  if (f.noStructure && structure) return false
  if (f.rubble && !tags.has('rubble')) return false
  // 主單位：client 分不出來，至少排除建物、召喚物、裝置、卵與繭
  if (f.mainUnit && (structure || tags.has('summon') || tags.has('device') || tags.has('egg') || tags.has('cocoon'))) return false
  if (f.ship && !tags.has('ship')) return false
  if (f.station && !tags.has('station')) return false
  if (f.tag && !tags.has(f.tag)) return false
  if (f.defs && !f.defs.includes(d)) return false
  return true
}

/** 吸附候選：dist = 點擊位置到目標身體中軸的螢幕距離（px）；tol = 這個目標的吸附範圍（px）*/
export interface SnapCand {
  id: number
  dist: number
  tol: number
  /** 符合技能的目標篩選（targetOk）*/
  ok: boolean
  /** 建物、或自己：只有附近沒有別的候選時才選 */
  low: boolean
}

/**
 * 選出左鍵要施放的目標（0 = 沒有可選的，呼叫端保持瞄準並提示）。
 * direct = 射線直接點中的實體（0 = 沒點中）；wantStruct = 技能本來就是要點建物（wantsStructure）。
 * 1. 直接點中、符合篩選：就是它（建物要讓位給附近符合篩選的人；技能要點建物時不讓）。
 * 2. 附近符合篩選的人／生物，選最近的；再來才是直接點中的建物、附近的建物或自己。
 * 3. 直接點中但不符合篩選（例如對自己放只能對別人的技能）：照樣送出，讓 sim 說明為什麼不行。
 */
export function chooseUnitTarget(direct: number, cands: readonly SnapCand[], wantStruct: boolean): number {
  const dc = direct ? cands.find((c) => c.id === direct) : undefined
  const directOk = !!dc?.ok
  if (directOk && (!dc.low || wantStruct)) return direct
  const near = cands.filter((c) => c.ok && c.dist <= c.tol)
  const nearest = (xs: SnapCand[]) => xs.reduce((a, b) => (b.dist < a.dist || (b.dist === a.dist && b.id < a.id) ? b : a)).id
  const high = near.filter((c) => !c.low || wantStruct)
  if (high.length) return nearest(high)
  if (directOk) return direct
  if (near.length) return nearest(near)
  return direct
}

/** 點到線段（a→b）的距離 */
export function segDist(px: number, py: number, ax: number, ay: number, bx: number, by: number): number {
  const vx = bx - ax
  const vy = by - ay
  const l2 = vx * vx + vy * vy
  const k = l2 > 0 ? Math.max(0, Math.min(1, ((px - ax) * vx + (py - ay) * vy) / l2)) : 0
  return Math.hypot(px - (ax + vx * k), py - (ay + vy * k))
}

/**
 * 小地圖左鍵（瞄準中）：在小地圖上點的位置附近找符合篩選的目標。座標都是世界公尺；
 * tolM = 小地圖上的點擊容差換算成公尺（加上目標本身的半徑）。回傳 0 = 那裡沒有可選的。
 */
export function mapPickTarget(p: { x: number; y: number }, cands: readonly { id: number; x: number; y: number; r: number; ok: boolean; low: boolean }[], tolM: number, wantStruct: boolean): number {
  return chooseUnitTarget(
    0,
    cands.map((c) => ({ id: c.id, dist: Math.hypot(c.x - p.x, c.y - p.y), tol: c.r + tolM, ok: c.ok, low: c.low })),
    wantStruct,
  )
}
