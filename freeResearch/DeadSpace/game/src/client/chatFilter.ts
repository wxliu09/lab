// 本機封鎖的聊天過濾：被封鎖的人說的話（公開、陣營、群組、死者頻道）不顯示在聊天紀錄與頭頂泡泡，也不播聊天音效。
// 系統訊息與私訊（ch 'sys'／'private'：主機給自己的提示）不受影響。
import type { ChatLine } from '../shared/protocol/messages'
import { isMuted } from './mute'

export function hiddenByMute(l: Pick<ChatLine, 'from' | 'ch'>): boolean {
  return l.ch !== 'sys' && l.ch !== 'private' && isMuted(l.from)
}

/**
 * 只該出現在頭頂泡泡、不進聊天紀錄的行：等核心復活的仿生人說的話（sim chat.ts coreChat）。
 * 照原作是記憶卡位置的浮動文字（JASS aAv 20649–20672），沒有名字；聊天紀錄裡會變成「???：…」反而像被消音的人。
 * 判斷：公開頻道、沒有名字、帶泡泡定位的實體 id（一般聊天不帶 e；遺言帶 e 但有名字）。
 */
export function bubbleOnly(l: Pick<ChatLine, 'from' | 'ch' | 'e'>): boolean {
  return l.ch === 'all' && l.from === '' && l.e !== undefined
}
