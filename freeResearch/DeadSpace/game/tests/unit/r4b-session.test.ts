// 第 4 輪（多人公平）：寬限期間的斷線／重新連線公告不點名、大廳名單不洩漏連線狀態、超過寬限才回來的私訊說明
import { afterEach, describe, expect, it } from 'vitest'
import { Harness, type FakeClient } from './helpers/harness'
import { RECONNECT_GRACE_S } from '../../src/shared/constants'
import type { HostMsg } from '../../src/shared/protocol/messages'
import { hasString, lang, sysText } from '../../src/ui/i18n'
import '../../src/ui/strings/sim6'
import '../../src/ui/strings/sim7'

const SEC = 20
const lines = (c: FakeClient) => c.inbox.flatMap((m) => (m.t === 'chat' ? m.lines.map((l) => l.text) : []))
const lobbyMsgs = (c: FakeClient) => c.inbox.filter((m): m is Extract<HostMsg, { t: 'lobbyState' }> => m.t === 'lobbyState')

afterEach(() => {
  lang.value = 'zh'
})

describe('寬限期間的斷線公告不點名', () => {
  it('斷線、重新連線的公告都不帶名字（真名、顯示名字、通訊病毒換過的名字都沒有）', () => {
    const { h, cs } = Harness.started(4, 4242, { eventMult: 0, npcCrew: 0 })
    const g = h.server.game!
    const p = g.players[cs[1].slot]!
    // 模擬通訊病毒換過名字：公告裡也不能出現換過的名字
    p.data.shownBase = 'Zed'
    p.name = 'Dr. Zed'
    for (const c of cs) c.inbox.length = 0
    h.server.onLeave(cs[1].peer)
    h.ticks(2)
    for (const c of [cs[0], cs[2], cs[3]]) {
      expect(lines(c)).toContain(`@sys.droppedAnon|s=${RECONNECT_GRACE_S}`)
      expect(lines(c).some((x) => x.includes('name=') || x.includes('Zed') || x.includes(p.baseName))).toBe(false)
    }
    h.ticks(10 * SEC)
    const back = h.connect('p1')
    h.ticks(2)
    for (const c of [cs[0], cs[2], cs[3], back]) {
      expect(lines(c)).toContain('@sys.rejoinedAnon')
      expect(lines(c).some((x) => x.startsWith('@sys.rejoined') && x.includes('name='))).toBe(false)
    }
  })

  it('對局中斷線、重新連線都不廣播大廳名單（名單上有每個席位的連線狀態）；回來的人自己拿得到設定，連線狀態一律在線', () => {
    const { h, cs } = Harness.started(3, 4242, { eventMult: 0, npcCrew: 0 })
    for (const c of cs) c.inbox.length = 0
    h.server.onLeave(cs[1].peer)
    h.ticks(5 * SEC)
    expect(lobbyMsgs(cs[0]).length).toBe(0)
    expect(lobbyMsgs(cs[2]).length).toBe(0)
    const back = h.connect('p1')
    h.ticks(2)
    expect(lobbyMsgs(cs[0]).length).toBe(0)
    expect(lobbyMsgs(cs[2]).length).toBe(0)
    const mine = lobbyMsgs(back)
    expect(mine.length).toBe(1)
    expect(mine[0].players.every((x) => x.connected)).toBe(true)
    // 對局中就算主機端的狀態是離線，名單也回報在線
    h.server.onLeave(cs[2].peer)
    const st = h.server.lobbyState()
    if (st.t !== 'lobbyState') throw new Error()
    expect(st.players.every((x) => x.connected)).toBe(true)
  })

  it('大廳階段照舊：斷線會更新名單、顯示離線', () => {
    const h = new Harness()
    h.connect('host', true)
    const bob = h.connect('Bob')
    const amy = h.connect('Amy')
    h.ticks(1)
    amy.inbox.length = 0
    h.server.onLeave(bob.peer)
    h.ticks(1)
    const last = lobbyMsgs(amy).at(-1)!
    expect(last.players.find((x) => x.name === 'Bob')!.connected).toBe(false)
  })
})

describe('超過寬限才重新連上', () => {
  it('只私訊本人「已判定離開、現在是觀戰」；別人收不到，也不公告重新連線', () => {
    const { h, cs } = Harness.started(3, 4242, { eventMult: 0, npcCrew: 0 })
    const g = h.server.game!
    for (const p of g.allPlayers()) g.setRole(p, 'human')
    h.server.onLeave(cs[1].peer)
    h.ticks((RECONNECT_GRACE_S + 1) * SEC)
    expect(g.players[cs[1].slot]!.left).toBe(true)
    for (const c of cs) c.inbox.length = 0
    const back = h.connect('p1')
    h.ticks(2)
    expect(lines(back)).toContain(`@sys.leftYou|s=${RECONNECT_GRACE_S}`)
    for (const c of [cs[0], cs[2]]) {
      expect(lines(c).some((x) => x.startsWith('@sys.leftYou') || x.startsWith('@sys.rejoined'))).toBe(false)
    }
    // 同一個連線重送 hello 不再重複說明
    back.inbox.length = 0
    back.send({ t: 'hello', name: 'p1', color: 1, ver: 1, token: 'tokp1xxxxxx' })
    h.ticks(2)
    expect(lines(back).some((x) => x.startsWith('@sys.leftYou'))).toBe(false)
  })

  it('死亡即退出模式：說明不能觀戰', () => {
    const { h, cs } = Harness.started(3, 4242, { eventMult: 0, npcCrew: 0, bootOnDeath: true })
    const g = h.server.game!
    for (const p of g.allPlayers()) g.setRole(p, 'human')
    // 留一個異類活著：遺言時間（4 秒）過了才判定出局，那時對局不能已經結束
    g.setRole(g.players[cs[2].slot]!, 'xeno')
    h.server.onLeave(cs[1].peer)
    h.ticks((RECONNECT_GRACE_S + 6) * SEC)
    const back = h.connect('p1')
    h.ticks(2)
    expect(lines(back)).toContain(`@sys.leftYouBooted|s=${RECONNECT_GRACE_S}`)
  })

  it('字串兩種語言都有，參數照填', () => {
    for (const k of ['sys.droppedAnon', 'sys.rejoinedAnon', 'sys.leftYou', 'sys.leftYouBooted']) expect([k, hasString('zh', k), hasString('en', k)]).toEqual([k, true, true])
    expect(sysText('@sys.droppedAnon|s=90')).toBe('有一名玩家斷線了（90 秒內可以重新連線）')
    expect(sysText('@sys.leftYou|s=90')).toContain('90 秒')
    lang.value = 'en'
    expect(sysText('@sys.droppedAnon|s=90')).toBe('A player disconnected (they have 90 s to reconnect)')
    expect(sysText('@sys.rejoinedAnon')).toBe('The disconnected player reconnected')
  })
})
