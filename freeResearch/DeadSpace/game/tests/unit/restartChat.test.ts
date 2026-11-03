// 重連或主機短暫失聯：同一局、同一個 slot 收到重送的 start 時，client 保留聊天紀錄
import { beforeAll, describe, expect, it } from 'vitest'
import { Harness } from './helpers/harness'
import type { StartInfo } from '../../src/shared/protocol/messages'

let isRestartOfSameGame: (prev: StartInfo | null, next: StartInfo) => boolean

beforeAll(async () => {
  // session 模組在測試 build 會把狀態掛到 window 上：在 node 裡給個空的 window
  const w = globalThis as unknown as Record<string, unknown>
  w.window ??= globalThis
  isRestartOfSameGame = (await import('../../src/client/session')).isRestartOfSameGame
})

function starts(h: Harness, peer: string): StartInfo[] {
  return (h.clients.get(peer)?.inbox ?? []).filter((m) => m.t === 'start').map((m) => (m as { info: StartInfo }).info)
}

describe('重送 start 時保留聊天紀錄', () => {
  it('server：同一局重連收到的 start 帶同一個 gid；另一局的 gid 不同', () => {
    const { h, cs } = Harness.started(3, 4242, { eventMult: 0 })
    const first = starts(h, cs[1].peer)[0]
    expect(typeof first.gid).toBe('number')
    h.server.onLeave(cs[1].peer)
    h.ticks(20)
    const again = h.connect('p1')
    h.ticks(3)
    const re = starts(h, again.peer).at(-1)!
    expect(re.gid).toBe(first.gid)
    expect(re.slot).toBe(first.slot)
    expect(isRestartOfSameGame(first, re)).toBe(true)
    const other = Harness.started(3, 4242, { eventMult: 0 })
    const o = starts(other.h, other.cs[1].peer)[0]
    expect(o.gid).not.toBe(first.gid)
    expect(isRestartOfSameGame(first, o)).toBe(false)
  })

  it('client 判斷：只有同一局、同一個 slot 才保留；沒有前一局或舊主機沒帶 gid 就清空', () => {
    const base: StartInfo = { slot: 1, seed: 0, stations: [], zones: [], players: [], spectator: false, gid: 99 }
    expect(isRestartOfSameGame(base, { ...base })).toBe(true)
    expect(isRestartOfSameGame(null, base)).toBe(false)
    expect(isRestartOfSameGame(base, { ...base, gid: 100 })).toBe(false)
    expect(isRestartOfSameGame(base, { ...base, slot: 2 })).toBe(false)
    expect(isRestartOfSameGame({ ...base, gid: undefined }, { ...base, gid: undefined })).toBe(false)
  })
})
