// 變種人吞噬（mut.devour）的懸停回饋：滑鼠停在生物上時說明「可以吞噬（+N EP）」或「不能吞噬：原因」。
// 規則照 sim：技能篩選 noStructure（建物不行）、屍體不行、對象的單位定義要有 devourEp（content/creatures.ts：小型生物、
// 失敗／暴走實驗體、NPC 船員 25，異常體 125）。EP 會乘大廳的 EP 倍率，這裡顯示內容表的基本值。
// 只看快照裡的外觀 id 與旗標：偽裝成 NPC 船員的人，外觀與 sim 判定用的定義都是 NPC 船員，結果一致，不會多洩漏什麼。
import { UNITS } from '../shared/content/registry'
import { EntFlag, type PrivateState, type SnapEntity } from '../shared/protocol/messages'

export const DEVOUR = 'mut.devour'

/** 懸停說明要不要提吞噬：只對「生物」（單位，不含建物、裝置、物品、站點、屍體、自己這邊的單位）*/
function isCreatureLike(s: SnapEntity): boolean {
  const d = s.d ?? ''
  if (!d || d.startsWith('item:') || d.startsWith('vendor.') || d.startsWith('station.') || d === 'groundItem') return false
  const fl = s.fl ?? 0
  if (fl & (EntFlag.Corpse | EntFlag.Mine)) return false
  const tags = UNITS.get(d)?.tags ?? []
  return !tags.some((t) => t === 'structure' || t === 'device' || t === 'hazard' || t === 'noTarget' || t === 'egg' || t === 'cocoon')
}

export type DevourCheck =
  /** 可以吞：n = 內容表的 EP、cd = 剩餘冷卻秒數（0 = 現在就能吞）、blocked = 技能暫時被封鎖（沉默）*/
  | { ok: true; n: number; cd: number; blocked: boolean }
  /** 不能吞：why = 原因的字串 key */
  | { ok: false; why: string }

/**
 * 自己（有吞噬技能、還活著）看著這個單位時的吞噬判定；不提吞噬（沒有技能、對象不是生物、看的是自己）回傳 null。
 * selfIds = 自己的主單位與操控中的單位。
 */
export function devourCheck(me: Partial<PrivateState>, s: SnapEntity, selfIds: ReadonlySet<number>): DevourCheck | null {
  if (me.alive === false) return null
  const st = me.abilities?.find((a) => a.id === DEVOUR)
  if (!st || selfIds.has(s.i) || !isCreatureLike(s)) return null
  const def = UNITS.get(s.d ?? '')
  const n = def?.devourEp ?? 0
  if (n > 0) return { ok: true, n, cd: st.cd > 0 ? st.cd : 0, blocked: !!st.disabled }
  return { ok: false, why: devourRefusal(s) }
}

/**
 * 吞不下的原因（字串 key）。第 6 輪審查：綏靖機器人（npc.pacifier）帶著仿生人機體同一個 chassis 標籤，
 * 以前被說成「吞不了玩家」——它不是玩家。玩家看得到的人形（有擁有者、人員、異形／變種人形態、玩家的仿生人機體）才說「玩家」；
 * NPC 的機器、無人機、砲塔、裝置說「機械吞不下」；其他說明吞得下哪些。
 */
export function devourRefusal(s: SnapEntity): string {
  const tags = UNITS.get(s.d ?? '')?.tags ?? []
  const npc = tags.includes('npc')
  const playerBody = tags.some((t) => t === 'personnel' || t === 'xenoForm' || t === 'mutantForm') || (tags.includes('chassis') && !npc)
  if (((s.o ?? -1) >= 0 && !npc) || (playerBody && !npc)) return 'r3b.devour.no.person'
  if (tags.some((t) => t === 'chassis' || t === 'drone' || t === 'device') || (npc && tags.includes('mechanical'))) return 'ux6.devour.no.machine'
  return 'r3b.devour.no.kind'
}

/** 吞得下（技能篩選＋對象的內容表有 devourEp）：吞噬瞄準時高亮、吸附只看這些（不看自己的冷卻與技能有沒有）*/
export function devourable(s: SnapEntity): boolean {
  return isCreatureLike(s) && (UNITS.get(s.d ?? '')?.devourEp ?? 0) > 0
}
