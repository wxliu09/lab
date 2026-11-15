// 技能快捷鍵（指令卡順序，同 input.ts 的 HOTKEYS）：目標面板、情境提示、場景懸停說明共用。
// 獨立成小模組：WorldHover 不必為了一個函式載入 Guide（Guide 載入時會註冊對話框、讀寫 localStorage）。
import type { PrivateState } from '../../shared/protocol/messages'
import { abilityDef } from '../../shared/content/registry'

const HOTKEYS = ['Q', 'W', 'E', 'R', 'D', 'F']

/** 技能的快捷鍵（指令卡順序，同 input.ts）；null = 沒有這個技能，'' = 有但沒有快捷鍵 */
export function abilityKey(me: Partial<PrivateState>, id: string): string | null {
  const list = (me.abilities ?? []).filter((a) => abilityDef(a.id)?.target !== 'passive')
  const i = list.findIndex((a) => a.id === id)
  if (i < 0) return null
  return HOTKEYS[i] ?? ''
}
