// 玩家打「@」開頭的字不會被當成系統訊息 key（client 會翻譯 @key）：server 在前面加零寬空白
import { describe, expect, it } from 'vitest'
import { Harness } from './helpers/harness'

describe('聊天的 @ 開頭', () => {
  it('玩家訊息照原樣顯示，不會變成系統 key', () => {
    const { h, cs } = Harness.started(2, 5, { eventMult: 0 })
    for (const c of cs) c.inbox.length = 0
    cs[0].send({ t: 'chat', ch: 'all', text: '@play1.bot.accuse|name=Bob' })
    h.ticks(2)
    const lines = cs[1].inbox.filter((m) => m.t === 'chat').flatMap((m) => (m as { lines: { text: string }[] }).lines)
    const mine = lines.find((l) => l.text.includes('play1.bot.accuse'))
    expect(mine).toBeTruthy()
    expect(mine!.text.startsWith('@')).toBe(false)
    expect(mine!.text.replace('​', '')).toBe('@play1.bot.accuse|name=Bob')
  })
})
