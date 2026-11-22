// 場景物件的互動分類：懸停說明（WorldHover）、右鍵行為（input.ts）、身旁的互動提示（overlay.ts）共用同一套規則。
// 快照把所有建物都標成 Interactable，但「右鍵：走過去使用」並不是每種都對：瓦礫與雕像要攻擊、降落場只是場景、
// 玩家放的裝置沒有「使用」、敵方建物右鍵應該攻擊、控制台與傳送門要走到正中央。只看快照裡看得到的欄位（外觀、旗標、x2）。
// 雜物箱要看自己有沒有翻找技能（MeCtx：只用本人的私有狀態與自己單位的能量，不涉及別人的資訊）。
import { UNITS } from '../shared/content/registry'
import { EntFlag, type AbilityState, type Command, type PrivateState, type SnapEntity } from '../shared/protocol/messages'

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
  /** 雜物箱：有翻找技能＝右鍵走過去翻找；沒有的人只能打破（按 A）*/
  | 'crate'
  /** 其他設施：右鍵走過去使用 */
  | 'interact'

/**
 * 實體外觀 id 是不是站內建物。販賣機的 UnitDef（vendor.<id>）只在 sim worker 依販賣機表動態註冊，client 查不到，
 * 用 id 前綴認。
 */
export function isStructureId(d: string): boolean {
  return d.startsWith('vendor.') || !!UNITS.get(d)?.tags.includes('structure')
}

/** 雜物箱：版面上固定的 rummageBox 與 sim 開局補放的箱子都是這個定義（外觀 model 'crate'／站體 POI）*/
export const CRATE_DEF = 'struct.rummage'
/** 翻找雜物箱的職業技能（清潔工）*/
export const RUMMAGE = 'cls.rummage'

/** 自己這邊的狀態（判斷對雜物箱能做什麼）：本人的技能表（含冷卻）與自己目前操控單位的能量 */
export interface MeCtx {
  abilities?: readonly AbilityState[]
  /** 快照只對本人（與知情盟友）送 mp；不知道時不檢查能量，交給 sim 判斷 */
  mp?: number
}

/** 從 client 世界取出 MeCtx */
export function meCtx(w: { me: Partial<PrivateState>; ents: ReadonlyMap<number, { s: SnapEntity }> }): MeCtx {
  const id = w.me.control || w.me.unit
  return { abilities: w.me.abilities, mp: id ? w.ents.get(id)?.s.mp : undefined }
}

/** 翻找現在能不能放：cast = 可以；wait = 有技能但還不行（key／args = 說明為什麼的字串）*/
export type RummageCheck = { k: 'cast' } | { k: 'wait'; key: string; args?: Record<string, string | number> }

/** 冷卻秒數的顯示（同 ui/hud/CdFace 的 fmtSecs：10 秒以上取整數，以下留一位小數）*/
function secs(s: number): string {
  return s >= 10 ? String(Math.ceil(s)) : s.toFixed(1)
}

/** 自己對這個雜物箱的翻找狀態；不是雜物箱、或自己沒有翻找技能回傳 null */
export function rummageCheck(s: SnapEntity, me: MeCtx | undefined): RummageCheck | null {
  if (s.d !== CRATE_DEF) return null
  const st = me?.abilities?.find((a) => a.id === RUMMAGE)
  if (!st) return null
  if (st.disabled) return { k: 'wait', key: 'cast.silenced' }
  // 冷卻中：沿用指令卡的冷卻提示
  if (st.cd > 0) return { k: 'wait', key: 'tip.ability.cooling', args: { s: secs(st.cd) } }
  if (me?.mp !== undefined && me.mp < st.mana) return { k: 'wait', key: 'cast.mana' }
  return { k: 'cast' }
}

/**
 * 快照的冷卻秒數是送出那一刻的值（四捨五入到 0.1 秒），按鍵送到主機還要一點時間：剩這麼多以內照樣送出，
 * 交給 sim 判斷（「不要在本機擋掉 sim 會接受的指令」）
 */
export const CD_SLACK = 0.25
/** 能量（快照四捨五入成整數，加上送達前的回復量）：差超過這麼多才算一定不夠 */
export const MANA_SLACK = 1

/**
 * 本機能量檢查的開關：sim 對某個單位不檢查能量時（client 的快照看不到這個狀態）要關掉，
 * 否則能量不夠的技能會被本機擋下
 */
export const castGateOpts = { mana: true }

/** 本機拒絕的原因：kind 給 feedback.deny（HUD 閃格子）、key／args = 顯示的說明 */
export interface Gate {
  kind: 'cooldown' | 'noMana' | 'disabled'
  key: string
  args?: Record<string, string | number>
}

/**
 * 按下技能鍵（或點指令卡）時能不能放：冷卻中、能量一定不夠、被沉默（sim abilities.ts canCast 的 cooldown／mana／silenced）
 * 回傳原因，本機擋下並播拒絕音；拿不準（冷卻快好了、能量差一點、不知道能量）回傳 null，照樣送出。
 * fromItem = 道具的使用技能（道具不受沉默影響，冷卻看背包格的 cd）。
 */
export function castGate(st: { cd: number; mana: number; disabled?: boolean }, mp: number | undefined, fromItem = false): Gate | null {
  if (st.cd > CD_SLACK) return { kind: 'cooldown', key: 'tip.ability.cooling', args: { s: secs(st.cd) } }
  if (st.disabled && !fromItem) return { kind: 'disabled', key: 'cast.silenced' }
  if (castGateOpts.mana && mp !== undefined && st.mana > 0 && mp + MANA_SLACK < st.mana) return { kind: 'noMana', key: 'tip.ability.noMana', args: { need: st.mana, have: Math.floor(mp) } }
  return null
}

/**
 * 右鍵雜物箱（rightClickAction 回傳 'rummage' 時）要送的指令：可以翻找就對它施放翻找（sim 會先走到射程內）；
 * 冷卻中／能量不足／被沉默時照樣走過去，並附上本機提示說明為什麼還不能翻。
 */
export function rummageClick(id: number, s: SnapEntity, me: MeCtx, q = false): { cmd: Command; notice?: { key: string; args?: Record<string, string | number> } } {
  const r = rummageCheck(s, me)
  if (r?.k === 'cast') return { cmd: { k: 'cast', a: RUMMAGE, e: id, q } }
  return { cmd: { k: 'interact', e: id, q }, notice: r ? { key: r.key, args: r.args } : undefined }
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
  if (d === CRATE_DEF) return 'crate'
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
  /** 雜物箱、自己有翻找技能：走過去翻找（rummageClick）*/
  | 'rummage'
  /** 當作點地面：走到點的位置（只是場景的大型地貼）*/
  | 'ground'
  | 'attack'
  /** 走到屍體旁 */
  | 'corpse'
  | 'follow'

/**
 * 外觀一看就是異形／變種人的單位（第 6 輪審查：游標停在進化成掠食者的變種人身上，右鍵卻是「跟隨」）：
 * 異形形態、進化後的變種人形態、繭、卵、肉團，以及牠們放出來的眷屬與產物（xeno.*／mut.* 的召喚物）。
 * 只看快照裡的外觀 id（UnitDef 的標籤）——偽裝成人的變種人、還沒變身的異形外觀就是人，看不出來，也不會被當成怪物。
 */
export function looksMonstrous(s: SnapEntity): boolean {
  const d = s.d ?? ''
  const tags = UNITS.get(d)?.tags ?? []
  if (tags.includes('noTarget') || tags.includes('structure')) return false
  if (tags.includes('xenoForm') || tags.includes('mutantForm') || tags.includes('egg')) return true
  return (d.startsWith('xeno.') || d.startsWith('mut.')) && tags.includes('summon')
}

/**
 * 右鍵要不要直接攻擊這個已現形的怪物：外觀是怪物（looksMonstrous），而且不是自己的單位、不是已知的隊友（快照的 Mine／Ally 旗標，
 * sim 只對知情的同陣營送 Ally）。一般人形仍是跟隨。
 */
export function monsterFoe(s: SnapEntity): boolean {
  const fl = s.fl ?? 0
  if (fl & (EntFlag.Mine | EntFlag.Ally | EntFlag.Corpse)) return false
  return looksMonstrous(s)
}

/**
 * A 攻擊點到這個實體要不要當成「攻擊它」：屍體（sim 的 attack 遇到死掉的目標直接丟掉）、
 * noTarget 的外觀（生命再生器、降落墊、恆星、特效…；sim 也直接丟掉）改成對那一點攻擊移動，不要送出會被默默丟掉的指令。
 * 偽裝與幻象只會換成人、生物的外觀，不會變成 noTarget 的外觀，所以這裡看外觀 id 是確定的。
 */
export function attackable(s: SnapEntity): boolean {
  if ((s.fl ?? 0) & EntFlag.Corpse) return false
  return !UNITS.get(s.d ?? '')?.tags.includes('noTarget')
}

/** 右鍵點到某個實體時要做什麼（me = 自己的技能與能量，只有雜物箱要看；點到自己由呼叫端處理）*/
export function rightClickAction(s: SnapEntity, me?: MeCtx): ClickAction {
  const d = s.d ?? ''
  const fl = s.fl ?? 0
  if (d.startsWith('item:') || d === 'groundItem') return 'pickup'
  const sk = structKind(s)
  if (sk === 'console' || sk === 'portal') return 'center'
  if (sk === 'scenery') return 'ground'
  // 雜物箱：有翻找技能就翻（冷卻中也算，rummageClick 會改成走過去並說明）；沒有的人右鍵只是走過去，不會打破它
  if (sk === 'crate' && me?.abilities?.some((a) => a.id === RUMMAGE)) return 'rummage'
  // 敵方建物（快照一樣標成可互動）：攻擊；太空中的海盜船是站點實體，client 查不到定義，看旗標
  if (sk === 'hostile' || (d.startsWith('station.') && fl & EntFlag.Hostile && !(fl & EntFlag.Invuln))) return 'attack'
  if (sk || fl & EntFlag.Interactable || typeof s.x2?.s === 'string') return 'interact'
  if (fl & EntFlag.Corpse) return 'corpse'
  if (fl & EntFlag.Hostile) return 'attack'
  // 已現形的異形／變種人（不是自己已知的隊友）：右鍵攻擊，不必先按 A
  if (monsterFoe(s)) return 'attack'
  return 'follow'
}

/**
 * 身旁互動提示（overlay）要顯示的操作字串 key；null = 不顯示（沒有「使用」可言的東西不標，免得提示一直跳）。
 * near = 已經近到會打開右側面板的距離；me = 自己的技能（雜物箱：有翻找技能才標「右鍵 翻找」）。
 */
export function promptKey(s: SnapEntity, near: boolean, me?: MeCtx): string | null {
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
    case 'crate':
      return rummageCheck(s, me) ? 'ui4.prompt.rummage' : null
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
