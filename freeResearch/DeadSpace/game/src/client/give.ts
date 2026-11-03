// 背包格拖到場景上的單位＝給予（sim 的 give：走到對方身邊再交出去）。
// 先在 client 擋掉明顯不行的對象，給玩家現有的錯誤訊息，免得指令送出去後 sim 默默丟掉、玩家以為壞了。
// 只用快照裡看得到的外觀資訊判斷；拿不準的（例如外觀沒有背包、但其實是玩家本人）照樣送，交給 sim 決定。
import { signal } from '@preact/signals'
import { UNITS } from '../shared/content/registry'
import { EntFlag, type SnapEntity } from '../shared/protocol/messages'

/** 背包格拖曳中：來源格、游標（螢幕座標）、游標下的目標格（-1 = 不在格子上）；null = 沒在拖 */
export const invDrag = signal<{ slot: number; x: number; y: number; over: number } | null>(null)

/** 判斷要用的「我」：主單位、操控中的單位、所在 zone */
export interface GiveSelf {
  unit?: number
  control?: number
  zone?: number
}

/**
 * 放開時游標下的實體能不能收下道具。
 * 回傳 null = 可以送 give；'' = 不算對象（空地、自己），安靜取消；其他 = 要顯示的錯誤訊息 key。
 */
export function giveRefusal(s: SnapEntity | undefined, me: GiveSelf): string | null {
  if (!s) return ''
  if (s.i === me.unit || s.i === me.control) return ''
  const d = s.d ?? ''
  const fl = s.fl ?? 0
  if (me.zone !== undefined && s.z !== undefined && s.z !== me.zone) return 'cast.zone'
  // 地上的物品、屍體、販賣機與站點（UnitDef 只在 sim 端）、設施
  if (d.startsWith('item:') || d === 'groundItem' || d.startsWith('vendor.') || d.startsWith('station.')) return 'cast.target'
  if (fl & EntFlag.Corpse || s.st === 4) return 'cast.target'
  const def = UNITS.get(d)
  const tags = def?.tags ?? []
  if (tags.includes('structure') || tags.includes('noTarget')) return 'cast.target'
  // 有背包的外觀（人員、防護服、NPC 船員、管家、蛞蝓長老…），或公開屬於某位玩家的單位（變形後背包仍保留；召喚物沒有背包）
  const inv = def?.inv ?? (tags.includes('personnel') ? 6 : 0)
  if (inv > 0 || ((s.o ?? -1) >= 0 && !tags.includes('summon'))) return null
  return 'cast.target'
}
