// 群組聊天「;群組 訊息」：HUD 把群組名稱放進 to；驗證器接受中文群組名，但擋控制字元與過長的名稱
import { beforeAll, describe, expect, it } from 'vitest'
import { Harness, type FakeClient } from './helpers/harness'
import { parseClientBytes } from '../../src/shared/protocol/validate'
import { encode } from '../../src/shared/protocol/codec'

type ParseFn = (raw: string) => { ch: 'all' | 'team' | 'group' | 'dead'; text: string; to?: string } | null
let parseChatInput: ParseFn

beforeAll(async () => {
  const w = globalThis as unknown as Record<string, unknown>
  w.window ??= globalThis
  w.addEventListener ??= () => {}
  w.removeEventListener ??= () => {}
  parseChatInput = (await import('../../src/ui/hud/Hud')).parseChatInput as ParseFn
})

function texts(c: FakeClient): string[] {
  return c.inbox.filter((m) => m.t === 'chat').flatMap((m) => (m as { lines: { ch: string; text: string; group?: string }[] }).lines.map((l) => `${l.ch}:${l.group ?? ''}:${l.text}`))
}

const valid = (to: unknown) => !!parseClientBytes(encode({ t: 'chat', ch: 'group', text: 'hi', to } as never))

describe('群組聊天', () => {
  it('HUD 解析：第一個詞是群組名稱（放進 to），其餘是訊息', () => {
    expect(parseChatInput(';sec hello there')).toEqual({ ch: 'group', text: 'hello there', to: 'sec' })
    expect(parseChatInput('; 保全組 集合')).toEqual({ ch: 'group', text: '集合', to: '保全組' })
    expect(parseChatInput(';sec')).toBeNull()
  })

  it('驗證器：中文群組名可以；控制字元、前後空白、空字串、超過 16 字不行', () => {
    expect(valid('sec')).toBe(true)
    expect(valid('保全組')).toBe(true)
    expect(valid('a'.repeat(16))).toBe(true)
    expect(valid('a'.repeat(17))).toBe(false)
    expect(valid('')).toBe(false)
    expect(valid(' sec')).toBe(false)
    expect(valid('se\u0000c')).toBe(false)
    expect(valid('se​c')).toBe(false)
    expect(valid(42)).toBe(false)
  })

  it('從 HUD 輸入「;保全組 訊息」：成員收到，非成員的活人收不到', () => {
    const { h, cs } = Harness.started(3, 4242, { eventMult: 0 })
    const g = h.server.game!
    const ps = g.allPlayers()
    for (const p of ps) g.setRole(p, 'human')
    cs[0].send({ t: 'chat', ch: 'all', text: '-creategroup 保全組' })
    h.ticks(1)
    cs[0].send({ t: 'chat', ch: 'all', text: '-add 保全組 ' + ps[1].baseName })
    h.ticks(2)
    for (const c of cs) c.inbox.length = 0
    const m = parseChatInput(';保全組 meet at the lab')!
    cs[0].send({ t: 'chat', ...m })
    h.ticks(2)
    expect(texts(cs[1])).toContain('group:保全組:meet at the lab')
    expect(texts(cs[0])).toContain('group:保全組:meet at the lab')
    expect(texts(cs[2]).some((t) => t.includes('meet at the lab'))).toBe(false)
  })

  it('-creategroup 只取第一個詞當名稱（和 -add、「;群組」的解析一致）', () => {
    const { h, cs } = Harness.started(3, 4242, { eventMult: 0 })
    cs[0].inbox.length = 0
    cs[0].send({ t: 'chat', ch: 'all', text: '-creategroup night shift' })
    h.ticks(2)
    expect(texts(cs[0])).toContain('private::@chat.groupCreated|group=night')
  })
})
