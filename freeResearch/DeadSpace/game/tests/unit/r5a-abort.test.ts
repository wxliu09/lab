// 第 5 輪審查 P2-6：主機在對局中離開（或關分頁）時 worker 會被直接終止，客人收不到身分揭曉。
// 主機的本機 client 先送 { t: 'abort' }：server 只接受本機 peer，對局中立刻結算（winner = 'aborted'、abortWhy = 'host'），
// 結算與系統訊息當下就送出（不等下一個 tick），公開所有身分給所有在線的人。
import { describe, expect, it } from 'vitest'
import { Harness, type FakeClient } from './helpers/harness'
import { validateClientMsg } from '../../src/shared/protocol/validate'
import type { EndResult } from '../../src/shared/protocol/messages'
import { hasString } from '../../src/ui/i18n'
import '../../src/ui/strings/sim6'

const endOf = (c: FakeClient): EndResult[] => c.inbox.flatMap((m) => (m.t === 'end' ? [m.result] : []))
const chatOf = (c: FakeClient): string[] => c.inbox.flatMap((m) => (m.t === 'chat' ? m.lines.map((l) => l.text) : []))

describe('主機中止對局', () => {
  it('validate：{ t: "abort" } 合法（多餘的欄位丟掉）', () => {
    expect(validateClientMsg({ t: 'abort' })).toEqual({ t: 'abort' })
    expect(validateClientMsg({ t: 'abort', why: 'x' })).toEqual({ t: 'abort' })
  })

  it('主機送 abort：當下就結算（不等 tick），每位在線的客人都收到公開所有身分的結算與原因', () => {
    const { h, cs } = Harness.started(5, 5151)
    const g = h.server.game!
    h.ticks(40)
    for (const c of cs) c.inbox.length = 0
    const acks: boolean[] = []
    h.server.onAbort = (ended) => acks.push(ended)
    cs[0].send({ t: 'abort' })
    expect(acks).toEqual([true])
    expect(g.ended?.winner).toBe('aborted')
    const truth = g.allPlayers().map((p) => [p.slot, p.role, p.classId])
    for (const c of cs) {
      const ends = endOf(c)
      expect(ends).toHaveLength(1)
      expect(ends[0].winner).toBe('aborted')
      expect(ends[0].abortWhy).toBe('host')
      expect(ends[0].drawWhy).toBeUndefined()
      expect(ends[0].players.map((p) => [p.slot, p.role, p.classId])).toEqual(truth)
      expect(ends[0].timeline.some((l) => l.text === 'end.abortWhy.host')).toBe(true)
      // 系統訊息也是當下送出（worker 接著就會被終止，等不到下一個 tick）
      expect(chatOf(c)).toContain('@end.abortWhy.host')
    }
    // 結算之後模擬不再推進
    const t = g.time
    h.ticks(20)
    expect(g.time).toBe(t)
    for (const l of ['zh', 'en'] as const) for (const k of ['end.abortWhy.host', 'end.aborted']) expect(hasString(l, k), `${l} ${k}`).toBe(true)
  })

  it('客人送 abort：忽略（只有本機 peer 能中止），對局照常進行', () => {
    const { h, cs } = Harness.started(3, 5252)
    const g = h.server.game!
    const acks: boolean[] = []
    h.server.onAbort = (ended) => acks.push(ended)
    cs[1].send({ t: 'abort' })
    cs[2].send({ t: 'abort' })
    h.ticks(20)
    expect(acks).toEqual([])
    expect(g.ended).toBeNull()
    for (const c of cs) expect(endOf(c)).toEqual([])
    expect(g.time).toBeGreaterThan(0.9)
  })

  it('大廳裡、或已經結算過：不做事（onAbort 回報 false），不會送出第二份結算', () => {
    const h = new Harness(5353)
    const host = h.connect('host', true)
    h.connect('p1')
    h.ticks(2)
    const acks: boolean[] = []
    h.server.onAbort = (ended) => acks.push(ended)
    host.send({ t: 'abort' })
    expect(acks).toEqual([false])
    expect(h.server.phase).toBe('lobby')

    const { h: h2, cs } = Harness.started(3, 5454)
    const g = h2.server.game!
    g.endGame('crew')
    for (const c of cs) c.inbox.length = 0
    const acks2: boolean[] = []
    h2.server.onAbort = (ended) => acks2.push(ended)
    cs[0].send({ t: 'abort' })
    expect(acks2).toEqual([false])
    expect(g.ended?.winner).toBe('crew')
    for (const c of cs) expect(endOf(c)).toEqual([])
  })

  it('中止時斷線中的客人不送；之後在寬限內重連，照樣補送同一份結算', () => {
    const { h, cs } = Harness.started(3, 5555)
    const g = h.server.game!
    h.server.onLeave(cs[2].peer)
    h.ticks(2)
    cs[2].inbox.length = 0
    cs[0].send({ t: 'abort' })
    expect(endOf(cs[2])).toEqual([])
    expect(endOf(cs[1])).toHaveLength(1)
    h.server.onJoin(cs[2].peer)
    cs[2].send({ t: 'hello', name: 'p2', color: 2, ver: 1, token: 'tok' + 'p2'.padEnd(8, 'x') })
    expect(endOf(cs[2])).toEqual([g.ended])
  })
})
