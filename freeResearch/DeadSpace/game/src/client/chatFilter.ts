// 本機封鎖的聊天過濾：被封鎖的人說的話（公開、陣營、群組、死者頻道）不顯示在聊天紀錄與頭頂泡泡，也不播聊天音效。
// 系統訊息與私訊（ch 'sys'／'private'：主機給自己的提示）不受影響。
import type { ChatLine } from '../shared/protocol/messages'
import { isMuted } from './mute'

export function hiddenByMute(l: Pick<ChatLine, 'from' | 'ch'>): boolean {
  return l.ch !== 'sys' && l.ch !== 'private' && isMuted(l.from)
}
