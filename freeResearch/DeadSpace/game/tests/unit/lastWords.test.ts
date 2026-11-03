// 遺言：client 不再把死者的訊息改成死者頻道；遺言時間內活人聽得到，過了之後 server 自己轉到死者頻道
import { beforeAll, describe, expect, it } from 'vitest'
import { Harness, type FakeClient } from './helpers/harness'
import { damage } from '../../src/sim/systems/damage'
import { LAST_WORDS } from '../../src/sim/systems/chat'
import type { Game, GamePlayer } from '../../src/sim/game'

type ParseFn = (raw: string) => { ch: 'all' | 'team' | 'group' | 'dead'; text: string; to?: string } | null
let parseChatInput: ParseFn

beforeAll(async () => {
  // HUD 模組在載入時會掛鍵盤／指標事件：在 node 裡給個空的 window
  const w = globalThis as unknown as Record<string, unknown>
  w.window ??= globalThis
  w.addEventListener ??= () => {}
  w.removeEventListener ??= () => {}
  parseChatInput = (await import('../../src/ui/hud/Hud')).parseChatInput as ParseFn
})

function texts(c: FakeClient): string[] {
  return c.inbox.filter((m) => m.t === 'chat').flatMap((m) => (m as { lines: { ch: string; text: string }[] }).lines.map((l) => `${l.ch}:${l.text}`))
}

function setup() {
  const { h, cs } = Harness.started(3, 4242, { eventMult: 0 })
  const g = h.server.game!
  const ps = g.allPlayers()
  for (const p of ps) g.setRole(p, 'human')
  return { h, cs, g, ps }
}

function die(h: Harness, g: Game, p: GamePlayer): void {
  const u = g.mainOf(p)!
  u.inv?.fill(null)
  u.suit = null
  u.statsDirty = true
  h.ticks(2)
  damage(g, null, u, 1e6, { pure: true })
}

/** 照 HUD 的方式送出一行輸入 */
function type(c: FakeClient, raw: string): void {
  const m = parseChatInput(raw)
  if (m) c.send({ t: 'chat', ...m })
}

describe('遺言', () => {
  it('HUD 不再依死活改頻道：一般輸入一律送 all', () => {
    expect(parseChatInput('it was Bob')).toEqual({ ch: 'all', text: 'it was Bob' })
    expect(parseChatInput('[ team only')).toEqual({ ch: 'team', text: 'team only' })
    expect(parseChatInput('   ')).toBeNull()
  })

  it('死後遺言時間內從 HUD 說的話，活人收得到；過了遺言時間就只有死者收得到', () => {
    const { h, cs, g, ps } = setup()
    die(h, g, ps[1])
    h.ticks(10)
    expect(cs[1].me.alive).toBe(false)
    for (const c of cs) c.inbox.length = 0
    type(cs[1], 'it was Carl')
    h.ticks(2)
    expect(texts(cs[0])).toContain('all:it was Carl')
    // 遺言時間過後：server 轉到死者頻道
    h.ticks(Math.ceil(LAST_WORDS * 20))
    die(h, g, ps[2])
    h.ticks(Math.ceil((LAST_WORDS + 1) * 20))
    for (const c of cs) c.inbox.length = 0
    type(cs[1], 'ghost talk')
    h.ticks(2)
    expect(texts(cs[0]).some((t) => t.includes('ghost talk'))).toBe(false)
    expect(texts(cs[2])).toContain('dead:ghost talk')
  })

  it('私有狀態帶遺言倒數（給輸入框提示「活人還聽得到（剩 N 秒）」），時間到歸零', () => {
    const { h, cs, g, ps } = setup()
    expect(cs[1].me.lastWords).toBe(0)
    die(h, g, ps[1])
    h.ticks(2)
    expect(cs[1].me.lastWords).toBe(LAST_WORDS)
    h.ticks(Math.ceil(2 * 20))
    const mid = cs[1].me.lastWords as number
    expect(mid).toBeGreaterThan(0)
    expect(mid).toBeLessThan(LAST_WORDS)
    h.ticks(Math.ceil((LAST_WORDS - 1) * 20))
    expect(cs[1].me.lastWords).toBe(0)
    // 只給本人
    expect(cs[0].me.lastWords).toBe(0)
  })

  it('死者打的群組訊息改走死者頻道，不會被吞掉', () => {
    const { h, cs, g, ps } = setup()
    cs[1].send({ t: 'chat', ch: 'all', text: '-creategroup sec' })
    h.ticks(1)
    cs[1].send({ t: 'chat', ch: 'all', text: '-add sec ' + ps[0].baseName })
    h.ticks(1)
    die(h, g, ps[1])
    die(h, g, ps[2])
    h.ticks(Math.ceil((LAST_WORDS + 1) * 20))
    for (const c of cs) c.inbox.length = 0
    type(cs[1], ';sec from beyond')
    h.ticks(2)
    expect(texts(cs[0]).some((t) => t.includes('from beyond'))).toBe(false)
    expect(texts(cs[2])).toContain('dead:from beyond')
  })
})
