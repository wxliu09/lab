// 第 6 輪（付費玩家第一晚）多人：結算後「回到大廳（同一房號）」再來一局（server.ts returnToLobby）。
// 座位（順序、顏色、名字）、大廳設定與 AI 數量保留；AI 玩家、已經離開的人拿掉；斷線寬限中的人保留到寬限結束；
// 上一局的訊息不會在回到大廳之後出現；第二局照常開局、結算，身分不受上一局影響、不洩漏。
import { describe, expect, it } from 'vitest'
import { Harness, type FakeClient } from './helpers/harness'
import { GameServer, LOCAL_PEER } from '../../src/sim/server'
import { decode, encode } from '../../src/shared/protocol/codec'
import { PRACTICE_ROOM, type ClientMsg, type HostMsg, type LobbyPlayerInfo, type LobbySettings, type StartInfo } from '../../src/shared/protocol/messages'
import { parseClientBytes, validateClientMsg } from '../../src/shared/protocol/validate'
import { RECONNECT_GRACE_S } from '../../src/shared/constants'

const SEC = 20
type LobbyMsg = Extract<HostMsg, { t: 'lobbyState' }>
const lastLobby = (c: FakeClient): LobbyMsg => [...c.inbox].reverse().find((m): m is LobbyMsg => m.t === 'lobbyState')!
const starts = (c: FakeClient): StartInfo[] => c.inbox.flatMap((m) => (m.t === 'start' ? [m.info] : []))
const types = (c: FakeClient): string[] => c.inbox.map((m) => m.t)
const seat = (p: LobbyPlayerInfo) => ({ slot: p.slot, name: p.name, color: p.color, host: p.host, bot: p.bot })

/** 斷線超過寬限（直接撥 server 時鐘，免得跑 90 秒的對局）*/
function expireGrace(h: Harness): void {
  h.server.now += RECONNECT_GRACE_S + 1
  h.ticks(1)
}

/** 主機＋3 位客人、2 個 AI，改過一堆設定；Bob 改名、選色、準備 */
function room(seed = 6601) {
  const h = new Harness(seed)
  const host = h.connect('Alice', true)
  const bob = h.connect('Bob')
  const cara = h.connect('Cara')
  const dan = h.connect('Dan')
  const settings: Partial<LobbySettings> = { bots: 2, npcCrew: 0, aiLevel: 'easy', epMult: 1.5, localChat: true, eventMult: 0, apocalypse: [55, 70] }
  host.send({ t: 'settings', s: settings })
  bob.send({ t: 'lobby', name: 'Bobby', color: 7, ready: true })
  h.ticks(1)
  return { h, host, bob, cara, dan, settings }
}

describe('回到大廳：協定', () => {
  it('validate：{ t: "backToLobby" } 合法（多餘的欄位丟掉）', () => {
    expect(validateClientMsg({ t: 'backToLobby' })).toEqual({ t: 'backToLobby' })
    expect(validateClientMsg({ t: 'backToLobby', code: 'X', slot: 3 })).toEqual({ t: 'backToLobby' })
    expect(parseClientBytes(encode({ t: 'backToLobby' }))).toEqual({ t: 'backToLobby' })
  })
})

describe('回到大廳：什麼時候不行', () => {
  it('客人送的、還沒結算、主機中止的、練習房：一律忽略，對局照舊', () => {
    const { h, host, bob } = room(6602)
    host.send({ t: 'start' })
    h.ticks(2)
    const g = h.server.game!
    // 還沒結算
    host.send({ t: 'backToLobby' })
    expect(h.server.phase).toBe('game')
    expect(h.server.canReturnToLobby()).toBe(false)
    g.endGame('crew')
    // 客人送的
    bob.send({ t: 'backToLobby' })
    h.ticks(1)
    expect(h.server.phase).toBe('game')
    expect(h.server.game).toBe(g)
    expect(types(bob)).not.toContain('backToLobby')

    // 主機中止的：主機接著就會關掉房間，不給回大廳
    const r2 = room(6603)
    r2.host.send({ t: 'start' })
    r2.h.ticks(2)
    r2.host.send({ t: 'abort' })
    expect(r2.h.server.game?.ended?.winner).toBe('aborted')
    r2.host.send({ t: 'backToLobby' })
    expect(r2.h.server.phase).toBe('game')

    // 練習房：練習的「再來一局」是重開一間練習房（practiceRun.ts），不走這條
    const inbox: HostMsg[] = []
    const srv = new GameServer(PRACTICE_ROOM, { send: (peer, d) => peer === LOCAL_PEER && inbox.push(decode(d) as HostMsg) }, 9, 9 ^ 0x5bd1e995)
    const send = (m: ClientMsg) => srv.onMessage(LOCAL_PEER, encode(m))
    srv.onJoin(LOCAL_PEER)
    send({ t: 'hello', name: 'Me', color: 0, ver: 1, token: 'tokMexxxxxxx' })
    send({ t: 'settings', s: { bots: 3, npcCrew: 0 } })
    send({ t: 'start' })
    srv.tick()
    srv.game!.endGame('crew')
    send({ t: 'backToLobby' })
    expect(srv.phase).toBe('game')
    expect(inbox.some((m) => m.t === 'backToLobby')).toBe(false)
  })
})

describe('回到大廳：座位、設定、AI、離開的人', () => {
  it('還連著的真人保留座位（順序、顏色、名字），準備清掉；AI、已離開的人、還在斷線寬限內的人都拿掉；設定原封不動', () => {
    const { h, host, bob, cara, dan, settings } = room()
    const before = lastLobby(host).players.map(seat)
    const settingsBefore = structuredClone(h.server.settings)
    expect(settingsBefore).toMatchObject(settings)
    host.send({ t: 'start' })
    h.ticks(2)
    const g = h.server.game!
    expect(h.server.players.filter((p) => p?.bot)).toHaveLength(2)
    // Cara 對局中斷線、超過寬限 → 判定離開；Dan 在結算畫面按了「回到主選單」（server 看來是斷線，還在寬限內）
    h.server.onLeave(cara.peer)
    expireGrace(h)
    expect(g.players[cara.slot]!.left).toBe(true)
    g.endGame('crew')
    h.ticks(1)
    h.server.onLeave(dan.peer)
    for (const c of [host, bob, cara, dan]) c.inbox.length = 0

    host.send({ t: 'backToLobby' })
    expect(h.server.phase).toBe('lobby')
    expect(h.server.game).toBeNull()
    // 在線的人：先 backToLobby、緊接著大廳名單，沒有別的
    for (const c of [host, bob]) expect(types(c)).toEqual(['backToLobby', 'lobbyState'])
    // 不在線的人收不到任何東西
    expect(cara.inbox).toEqual([])
    expect(dan.inbox).toEqual([])
    const L = lastLobby(bob)
    expect(L.code).toBe('TEST1')
    expect(L.settings).toEqual(settingsBefore)
    expect(L.settings.bots).toBe(2)
    expect(L.settings.aiLevel).toBe('easy')
    // 座位：Alice、Bobby 原位；Cara、Dan 讓出座位（Dan 不會被排進下一局、拿到身分）；AI 不在名單上（開局時才補位）
    const keep = before.filter((p) => p.slot !== cara.slot && p.slot !== dan.slot)
    expect(keep.map((p) => p.name)).toEqual(['Alice', 'Bobby'])
    expect(L.players.map(seat)).toEqual(keep)
    expect(L.players.find((p) => p.slot === bob.slot)).toMatchObject({ name: 'Bobby', color: 7 })
    expect(L.players.every((p) => !p.ready && p.connected && !p.bot)).toBe(true)
    // 下一局只有在線的人＋AI
    host.send({ t: 'start' })
    h.ticks(2)
    const g2 = h.server.game!
    expect(g2.allPlayers().filter((p) => !p.bot).map((p) => p.baseName)).toEqual(['Alice', 'Bobby'])
    expect(g2.allPlayers().filter((p) => p.bot)).toHaveLength(2)
  })

  it('斷線的人在回到大廳之後才連上：照常加入大廳（同一個 token），並且收到 backToLobby（他還停在上一局的畫面）', () => {
    const { h, host, dan } = room(6604)
    host.send({ t: 'start' })
    h.ticks(2)
    const danSlot = dan.slot
    h.server.onLeave(dan.peer)
    h.server.game!.endGame('crew')
    h.ticks(1)
    host.send({ t: 'backToLobby' })
    h.ticks(10 * SEC)
    expect(lastLobby(host).players.some((p) => p.slot === danSlot)).toBe(false)
    // 回來（同一個 token）：最前面的空位就是原本的座位（AI 也拿掉了）
    const back = h.connect('Dan')
    expect(back.slot).toBe(danSlot)
    const t = types(back)
    expect(t.indexOf('welcome')).toBeGreaterThanOrEqual(0)
    expect(t.indexOf('backToLobby')).toBeGreaterThan(t.indexOf('welcome'))
    expect(t).not.toContain('start')
    expect(t).not.toContain('end')
    h.ticks(1)
    expect(lastLobby(host).players.find((p) => p.slot === danSlot)).toMatchObject({ name: 'Dan', connected: true })
    // 在大廳裡又短暫失聯、用同一個 token 回來：回到原座位，backToLobby 照送（client 已經在大廳就不做事）
    h.server.onLeave(back.peer)
    h.ticks(SEC)
    const again = h.connect('Dan')
    expect(again.slot).toBe(danSlot)
    expect(types(again)).toContain('backToLobby')

    // 一局都還沒開過的房間：加入、重連都不送 backToLobby
    const fresh = new Harness(6605)
    fresh.connect('Alice', true)
    const p1 = fresh.connect('P1')
    fresh.server.onLeave(p1.peer)
    const p1b = fresh.connect('P1')
    expect([...types(p1), ...types(p1b)]).not.toContain('backToLobby')
  })

  it('回到大廳之後：新的人可以加入（拿最前面的空位），主機可以踢人、改設定；聊天走大廳（不是上一局的頻道）', () => {
    const { h, host, bob, cara } = room(6606)
    host.send({ t: 'start' })
    h.ticks(2)
    // 對局中不能加入
    const late = h.connect('Late')
    expect(late.inbox.some((m) => m.t === 'reject' && m.reason === 'started')).toBe(true)
    h.server.onLeave(cara.peer)
    expireGrace(h)
    h.server.game!.endGame('xeno')
    h.ticks(1)
    host.send({ t: 'backToLobby' })
    const eve = h.connect('Eve')
    expect(eve.slot).toBe(cara.slot)
    host.send({ t: 'settings', s: { bots: 1, aiLevel: 'normal' } })
    h.ticks(1)
    expect(lastLobby(eve).settings).toMatchObject({ bots: 1, aiLevel: 'normal', epMult: 1.5 })
    for (const c of [host, bob, eve]) c.inbox.length = 0
    bob.send({ t: 'chat', ch: 'all', text: 'gg 再一局' })
    h.ticks(1)
    for (const c of [host, eve]) {
      const lines = c.inbox.flatMap((m) => (m.t === 'chat' ? m.lines : []))
      expect(lines).toEqual([{ from: 'Bobby', color: 7, ch: 'all', text: 'gg 再一局', time: expect.any(Number) }])
    }
    host.send({ t: 'kick', slot: eve.slot })
    h.ticks(1)
    expect(eve.inbox.some((m) => m.t === 'reject' && m.reason === 'kicked')).toBe(true)
    expect(lastLobby(host).players.some((p) => p.slot === eve.slot)).toBe(false)
  })
})

describe('回到大廳：上一局的訊息不會漏進來、第二局正常開始並結算', () => {
  it('回到大廳後不再收到上一局的快照／聊天／結算；第二局是新的一局（新 gid、AI 重新補位、身分不洩漏），結算後可以再回大廳', () => {
    const { h, host, bob, cara, dan } = room(6607)
    host.send({ t: 'start' })
    h.ticks(3 * SEC)
    const g1 = h.server.game!
    const first = starts(bob).at(-1)!
    g1.endGame('mutant')
    h.ticks(1)
    host.send({ t: 'backToLobby' })
    for (const c of [host, bob, cara, dan]) c.inbox.length = 0
    h.ticks(5 * SEC)
    // 大廳裡只剩大廳的東西（名單有變動才會送）：沒有快照、聊天、結算、地點、回放
    for (const c of [host, bob, cara, dan]) for (const m of c.inbox) expect(['lobbyState', 'pong']).toContain(m.t)
    expect(g1.time).toBeLessThan(3.2)

    // 第二局
    bob.send({ t: 'lobby', ready: true })
    h.leakWatch = true
    host.send({ t: 'start' })
    h.ticks(2)
    const g2 = h.server.game!
    expect(h.server.phase).toBe('game')
    expect(g2).not.toBe(g1)
    expect(g2.gid).not.toBe(g1.gid)
    expect(g2.ended).toBeNull()
    // AI 依設定重新補位（2 個）；真人座位不變
    expect(h.server.players.filter((p) => p?.bot)).toHaveLength(2)
    expect(g2.allPlayers().filter((p) => p.bot)).toHaveLength(2)
    expect(g2.allPlayers().filter((p) => !p.bot).map((p) => [p.slot, p.baseName])).toEqual([
      [host.slot, 'Alice'],
      [bob.slot, 'Bobby'],
      [cara.slot, 'Cara'],
      [dan.slot, 'Dan'],
    ])
    // 每位在線的人都收到新的一局（client 不會當成同一局重連而保留聊天）
    for (const c of [host, bob, cara, dan]) {
      const s = starts(c)
      expect(s).toHaveLength(1)
      expect(s[0].gid).toBe(g2.gid)
      expect(s[0].gid).not.toBe(first.gid)
    }
    // 全新的一局：沒有沿用上一局的任何玩家狀態
    for (const p of g2.allPlayers()) {
      expect(p.alive).toBe(true)
      expect(p.left).toBe(false)
      expect(p.stats).toEqual({ kills: 0, infections: 0, tests: 0 })
      expect(p.notes.size).toBe(0)
      expect(p.gitReports).toEqual([])
    }
    expect(g2.settings).toMatchObject({ bots: 2, aiLevel: 'easy', epMult: 1.5, localChat: true })
    h.ticks(6 * SEC)
    expect(h.drainLeaks()).toEqual([])
    expect(g2.time).toBeGreaterThan(5)

    // 第二局結算 → 照樣可以回大廳
    g2.endGame('crew')
    h.ticks(1)
    for (const c of [host, bob, cara, dan]) expect(c.inbox.filter((m) => m.t === 'end').at(-1)).toMatchObject({ result: { winner: 'crew' } })
    host.send({ t: 'backToLobby' })
    expect(h.server.phase).toBe('lobby')
    expect(lastLobby(bob).players.map((p) => p.slot)).toEqual([host.slot, bob.slot, cara.slot, dan.slot])
  })

  it('backToLobby 與回到大廳的名單不帶任何身分欄位；第二局的身分只由這一局的秘密亂數決定（上一局怎麼玩都一樣）', () => {
    const FORBIDDEN = ['role', 'faction', 'spawnOf', 'android', 'isSpawn', 'trueOwner', 'phd', 'classId']
    const keysOf = (v: unknown, out: string[] = []): string[] => {
      if (Array.isArray(v)) for (const x of v) keysOf(x, out)
      else if (v && typeof v === 'object')
        for (const [k, x] of Object.entries(v)) {
          out.push(k)
          keysOf(x, out)
        }
      return out
    }
    const rolesOfSecondGame = (playFirst: number) => {
      const { h, host, bob } = room(6608)
      host.send({ t: 'start' })
      h.ticks(Math.max(2, playFirst * SEC))
      h.server.game!.endGame('crew')
      h.ticks(1)
      bob.inbox.length = 0
      host.send({ t: 'backToLobby' })
      for (const m of bob.inbox) for (const k of keysOf(m)) expect(FORBIDDEN).not.toContain(k)
      host.send({ t: 'start' })
      h.ticks(2)
      return h.server.game!.allPlayers().map((p) => [p.slot, p.role, p.classId, p.spawnOf])
    }
    // 第一局只開 0.1 秒、或玩了 20 秒：第二局的身分、職業完全一樣（不受上一局的狀態影響）
    expect(rolesOfSecondGame(0)).toEqual(rolesOfSecondGame(20))
  })
})
