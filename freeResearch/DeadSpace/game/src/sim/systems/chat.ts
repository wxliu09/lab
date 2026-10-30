// 聊天路由（研究 02 §10.3）：在 sim 內依存活狀態、所在 zone、頻道決定誰收得到
import type { ChatChannel, ChatLine } from '../../shared/protocol/messages'
import type { Game, GamePlayer } from '../game'

/** 死後 4 秒內的發言仍讓活人看到（遺言）*/
export const LAST_WORDS = 4

function deliver(g: Game, line: ChatLine, to: GamePlayer[]): void {
  for (const q of to) q.chatOut.push(line)
}

export function routeChat(g: Game, p: GamePlayer, ch: ChatChannel, text: string, _to?: string): void {
  const t = g.time
  const inLastWords = !p.alive && p.deadAt >= 0 && t - p.deadAt <= LAST_WORDS
  const speakingAlive = p.alive || inLastWords
  const everyone = g.allPlayers()
  const dead = everyone.filter((q) => !q.alive)
  const eavesdrop = everyone.filter((q) => q.flags.hear)
  const name = p.alive && p.mutedUntil > t ? '' : p.name
  const main = g.mainOf(p)
  if (!speakingAlive || ch === 'dead') {
    if (p.alive) return
    const line: ChatLine = { from: p.baseName, color: p.color, ch: 'dead', text, time: t }
    deliver(g, line, uniq([...dead, ...eavesdrop]))
    return
  }
  if (ch === 'team') {
    const f = g.faction(p)
    if (f === 'crew') {
      g.privateLine(p.slot, 'chat.noTeam')
      return
    }
    const mates = everyone.filter((q) => q.alive && g.faction(q) === f)
    const line: ChatLine = { from: p.name, color: p.color, ch: 'team', text, time: t }
    deliver(g, line, uniq([...mates, ...eavesdrop]))
    return
  }
  // 全體：活人＋死者；可設定只限同站
  let to = everyone
  if (g.settings.localChat && main) {
    to = everyone.filter((q) => !q.alive || g.mainOf(q)?.zone === main.zone || q.slot === p.slot)
    to = uniq([...to, ...eavesdrop])
  }
  const line: ChatLine = { from: name, color: name ? p.color : -1, ch: 'all', text, time: t, e: inLastWords || !main ? undefined : main.id }
  deliver(g, line, to)
}

function uniq(a: GamePlayer[]): GamePlayer[] {
  return [...new Set(a)]
}
