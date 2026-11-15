// 本機封鎖（只在自己這端生效）：被封鎖的人說的話不顯示在聊天紀錄與頭頂泡泡。
// 以「顯示名字」為準，不用玩家槽位：聊天封包本來就只帶顯示名字，用槽位會讓通訊病毒換名後對得回原本的人。
// 換名之後封鎖跟著名字走（那個名字現在是誰說的就封誰），這是刻意的取捨。
import { signal } from '@preact/signals'

export const mutedNames = signal<ReadonlySet<string>>(new Set())

export function isMuted(name: string): boolean {
  return name !== '' && mutedNames.value.has(name)
}

export function setMuted(name: string, on: boolean): void {
  if (!name) return
  const next = new Set(mutedNames.value)
  if (on) next.add(name)
  else next.delete(name)
  mutedNames.value = next
}

/** 換局時清空 */
export function clearMuted(): void {
  if (mutedNames.value.size) mutedNames.value = new Set()
}
