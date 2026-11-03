// 場景物件的互動分類：懸停說明（WorldHover）、右鍵行為（input.ts）、身旁的互動提示（overlay.ts）共用同一套規則。
// 快照把所有建物都標成 Interactable，但「右鍵：走過去使用」並不是每種都對：瓦礫與雕像要攻擊、降落場只是場景、
// 玩家放的裝置沒有「使用」、敵方建物右鍵應該攻擊、控制台與傳送門要走到正中央。只看快照裡看得到的欄位（外觀、旗標、x2）。
import { UNITS } from '../shared/content/registry'
import { EntFlag, type SnapEntity } from '../shared/protocol/messages'

export type StructKind =
  /** 駕駛控制台、無人機控制圈：走到正中央才會開始駕駛 */
  | 'console'
  /** 降落傳送門：走到正中央（sim 觸發範圍 0.8 m），豪勇號降落時才會傳送 */
  | 'portal'
  /** 豪勇號降落場：只是場景，沒有「使用」 */
  | 'scenery'
  /** 瓦礫、企鵝雕像：要攻擊（按 A） */
  | 'breakable'
  /** 玩家放置的裝置（dev.*）：沒有「使用」 */
  | 'device'
  /** 熱融炸彈：放下就在倒數 */
  | 'bomb'
  /** 損毀的控制台：用站點介面裝置修 */
  | 'broken'
  /** 靠近就打開操作面板（動力分配台、模組工廠、隔間門／籠子控制台）*/
  | 'panel'
  /** 被動效果（生命再生器）*/
  | 'passive'
  /** 敵方建物（海盜船、海盜船主控台）：右鍵攻擊 */
  | 'hostile'
  /** 其他設施：右鍵走過去使用 */
  | 'interact'

/**
 * 實體外觀 id 是不是站內建物。販賣機的 UnitDef（vendor.<id>）只在 sim worker 依販賣機表動態註冊，client 查不到，
 * 用 id 前綴認。
 */
export function isStructureId(d: string): boolean {
  return d.startsWith('vendor.') || !!UNITS.get(d)?.tags.includes('structure')
}

/** 靠近就打開右側操作面板的設施 */
export const PANEL_FAC = new Set(['struct.power', 'fac.moduleFactory', 'fac.cellConsole', 'fac.cageConsole'])

/** 站內建物（含站內的停泊船以外的設施、裝置、瓦礫）的分類；不是建物回傳 null */
export function structKind(s: SnapEntity): StructKind | null {
  const d = s.d ?? ''
  const def = UNITS.get(d)
  const tags = def?.tags ?? []
  const fl = s.fl ?? 0
  if (!isStructureId(d)) return null
  if (fl & EntFlag.Hostile) return fl & EntFlag.Invuln ? 'interact' : 'hostile'
  if (d === 'dev.fusionCharge') return 'bomb'
  if (tags.includes('device')) return 'device'
  if (d === 'struct.console' || d === 'struct.droneControl') return 'console'
  if (d === 'fac.landingPortal') return 'portal'
  if (d === 'fac.landingSite') return 'scenery'
  if (d === 'struct.consoleBroken') return 'broken'
  if (tags.includes('rubble') || d === 'fac.penguinStatue') return 'breakable'
  if (PANEL_FAC.has(d)) return 'panel'
  if (d === 'struct.regen') return 'passive'
  return 'interact'
}

export type ClickAction =
  /** 撿起地上的物品 */
  | 'pickup'
  /** 走到它的正中央（控制台、傳送門）*/
  | 'center'
  /** 互動（走過去；販賣機、設施、登艇）*/
  | 'interact'
  /** 當作點地面：走到點的位置（只是場景的大型地貼）*/
  | 'ground'
  | 'attack'
  /** 走到屍體旁 */
  | 'corpse'
  | 'follow'

/** 右鍵點到某個實體時要做什麼（me = 自己目前操控的單位 id；點到自己由呼叫端處理）*/
export function rightClickAction(s: SnapEntity): ClickAction {
  const d = s.d ?? ''
  const fl = s.fl ?? 0
  if (d.startsWith('item:') || d === 'groundItem') return 'pickup'
  const sk = structKind(s)
  if (sk === 'console' || sk === 'portal') return 'center'
  if (sk === 'scenery') return 'ground'
  // 敵方建物（快照一樣標成可互動）：攻擊；太空中的海盜船是站點實體，client 查不到定義，看旗標
  if (sk === 'hostile' || (d.startsWith('station.') && fl & EntFlag.Hostile && !(fl & EntFlag.Invuln))) return 'attack'
  if (sk || fl & EntFlag.Interactable || typeof s.x2?.s === 'string') return 'interact'
  if (fl & EntFlag.Corpse) return 'corpse'
  if (fl & EntFlag.Hostile) return 'attack'
  return 'follow'
}

/**
 * 身旁互動提示（overlay）要顯示的操作字串 key；null = 不顯示（沒有「使用」可言的東西不標，免得提示一直跳）。
 * near = 已經近到會打開右側面板的距離。
 */
export function promptKey(s: SnapEntity, near: boolean): string | null {
  const d = s.d ?? ''
  if (d.startsWith('item:')) return 'prompt.pickup'
  if (typeof s.x2?.s === 'string') return near ? 'prompt.panelOpen' : 'prompt.use'
  const sk = structKind(s)
  switch (sk) {
    case 'console':
      return 'prompt.pilot'
    case 'portal':
      // 豪勇號沒降落時傳送門沒作用：提示改成說明
      return s.x2?.on ? 'prompt.portal' : 'prompt.portalOff'
    case 'panel':
      return near ? 'prompt.panelOpen' : 'prompt.use'
    case 'interact':
      return 'prompt.use'
    case null:
      return (s.fl ?? 0) & EntFlag.Interactable ? 'prompt.use' : null
    default:
      return null
  }
}

/** 懸停時要不要顯示血量：無敵的建物、站點、停泊船（安裝座、擺渡號控制台、生命再生器…）不顯示 */
export function showHp(s: SnapEntity): boolean {
  const fl = s.fl ?? 0
  if (!s.mhp || fl & EntFlag.Corpse) return false
  if (!(fl & EntFlag.Invuln)) return true
  const d = s.d ?? ''
  const tags = UNITS.get(d)?.tags ?? []
  return !(d.startsWith('station.') || isStructureId(d) || tags.includes('ship') || tags.includes('cage'))
}
