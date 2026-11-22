// 快捷鍵的顯示名稱（第 7 輪起來自按鍵設定 client/keymap.ts，依鍵盤配置顯示：AZERTY 的 KeyQ 顯示 A）：
// 指令卡技能格、背包格、基本指令（A／S／H／B），目標面板、情境提示、場景懸停說明共用。
// 獨立成小模組：WorldHover 不必為了一個函式載入 Guide（Guide 載入時會註冊對話框、讀寫 localStorage）。
// 在元件裡呼叫會訂閱 keymap 與 layoutMap 兩個 signal：改鍵、換鍵盤配置後鍵帽自動更新。
import type { PrivateState } from '../../shared/protocol/messages'
import { abilityDef } from '../../shared/content/registry'
import { ABILITY_ACTIONS, ITEM_ACTIONS, actionLabel, type ActionId } from '../../client/keymap'

/** 指令卡第 i 格（0 起算，同 input.ts useAbility）的快捷鍵；'' = 沒有快捷鍵（第 7 格以後、或玩家沒指定）*/
export function slotKey(i: number): string {
  const id = ABILITY_ACTIONS[i]
  return id ? actionLabel(id) : ''
}

/** 背包第 i 格（0 起算）的快捷鍵；'' = 沒有 */
export function itemKey(i: number): string {
  const id = ITEM_ACTIONS[i]
  return id ? actionLabel(id) : ''
}

/** 其他動作（attack、stop、hold、unpilot、evolve、chat、hideHud…）的快捷鍵；'' = 沒有 */
export function actionKey(id: ActionId): string {
  return actionLabel(id)
}

/** 技能的快捷鍵（指令卡順序，同 input.ts）；null = 沒有這個技能，'' = 有但沒有快捷鍵 */
export function abilityKey(me: Partial<PrivateState>, id: string): string | null {
  const list = (me.abilities ?? []).filter((a) => abilityDef(a.id)?.target !== 'passive')
  const i = list.findIndex((a) => a.id === id)
  if (i < 0) return null
  return slotKey(i)
}
