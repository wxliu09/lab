// 死因只在一處顯示：死亡橫幅（Hud.tsx 的 Banner）。sim 用私人訊息送死因（death.cause.*）、先前受傷（death.hit.*）
// 與「你死了…」說明（death.you*）；以前同時出現在上方大公告、右側提示與聊天紀錄，審查員看到同一件事三次。
// 現在：公告與提示不顯示這幾種訊息（Announce.tsx），聊天紀錄也不列（Hud.tsx 的 Chat），死因收進這裡，由死亡橫幅顯示。
import { signal } from '@preact/signals'
import type { ChatLine } from '../shared/protocol/messages'

/** 死因與先前受傷的原始訊息（`@key|參數`，顯示時依目前語言翻譯）；新的一次死亡會整批換掉 */
export const deathLines = signal<string[]>([])

const CAUSE = /^@death\.(cause|hit)\./
const YOU = /^@death\.you(Android|Booted)?(\||$)/

/** 這行是死因或先前受傷（只給本人的私人訊息）*/
export function isDeathCause(l: ChatLine): boolean {
  return l.ch === 'private' && CAUSE.test(l.text ?? '')
}

/** 這行是「你死了…」的說明（死亡橫幅、出局對話框、情境提示已經說了同一件事）*/
export function isDeathYou(l: ChatLine): boolean {
  return l.ch === 'private' && YOU.test(l.text ?? '')
}

/** 只該出現在死亡畫面的訊息（公告、提示、聊天紀錄都不顯示）*/
export function deathScreenOnly(l: ChatLine): boolean {
  return isDeathCause(l) || isDeathYou(l)
}

/** 收到一批聊天：有死因就記下來（死因與先前受傷是同一批送來的）*/
export function noteDeath(lines: readonly ChatLine[]): void {
  const d = lines.filter(isDeathCause).map((l) => l.text)
  if (d.length) deathLines.value = d
}
