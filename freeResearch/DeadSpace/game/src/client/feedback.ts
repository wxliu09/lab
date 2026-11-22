// 本機拒絕回饋：輸入層判定「現在不能做」時呼叫 deny()，播本機拒絕音，並寫入 lastDeny 讓 HUD 閃對應的技能格／背包格
import { signal } from '@preact/signals'
import { sfx } from '../audio/sfx'

export type DenyKind = 'cooldown' | 'noMana' | 'disabled' | 'empty' | 'noTarget' | 'invalidTarget' | 'other'

export interface DenyEvent {
  kind: DenyKind
  /** 被拒絕的技能 id（技能格閃剩餘秒數用）*/
  ability?: string
  /** 被拒絕的背包格（0 起算）*/
  inv?: number
  /** performance.now()，同一格連按也會重新觸發 */
  t: number
}

export const lastDeny = signal<DenyEvent | null>(null)

export function deny(e: Omit<DenyEvent, 't'>, sound = true): void {
  lastDeny.value = { ...e, t: typeof performance !== 'undefined' ? performance.now() : Date.now() }
  if (sound) sfx('deny')
}
