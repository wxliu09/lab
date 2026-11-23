// 第 3 輪（sim／shared／net）：單機練習暫停、斷線與重新連線的公告、結算時間軸的死因、晉升的職業顯示、仿生人誤傷說明
import { describe, expect, it } from 'vitest'
import { Harness, type FakeClient } from './helpers/harness'
import { GameServer, LOCAL_PEER, PRACTICE_PAUSE_MAX_S } from '../../src/sim/server'
import { decode, encode } from '../../src/shared/protocol/codec'
import { PRACTICE_ROOM, type ClientMsg, type HostMsg, type Snapshot } from '../../src/shared/protocol/messages'
import { parseClientBytes, validateClientMsg } from '../../src/shared/protocol/validate'
import { RECONNECT_GRACE_S, TICK_DT } from '../../src/shared/constants'
import { damage } from '../../src/sim/systems/damage'
import { CLASSES, UNITS, unitDef } from '../../src/shared/content/registry'
import { HOSTILE } from '../../src/sim/ent'
import { hasString, lang, sysText, t } from '../../src/ui/i18n'
import '../../src/ui/strings/sim6'
import type { Game, GamePlayer } from '../../src/sim/game'

const SEC = 20

/** 單機練習局（練習房、主機＋AI）；回傳送給主機的所有訊息 */
function practice(seed = 6100, humans = 1) {
  const inbox: HostMsg[] = []
  const srv = new GameServer(PRACTICE_ROOM, { send: (peer, d) => peer === LOCAL_PEER && inbox.push(decode(d) as HostMsg) }, seed, seed ^ 0x5bd1e995)
  const join = (peer: string, name: string) => {
    srv.onJoin(peer)
    const send = (m: ClientMsg) => srv.onMessage(peer, encode(m))
    send({ t: 'hello', name, color: srv.players.filter(Boolean).length, ver: 1, token: 'tok' + name.padEnd(8, 'x') })
    return send
  }
  const host = join(LOCAL_PEER, 'Me')
  const others = Array.from({ length: humans - 1 }, (_, i) => join('peer-' + i, 'P' + i))
  host({ t: 'settings', s: { bots: 3, npcCrew: 0, eventMult: 0 } })
  host({ t: 'start' })
  srv.tick()
  return { srv, g: srv.game!, host, others, inbox }
}

const lastW = (inbox: HostMsg[], k: string): unknown => {
  let v: unknown
  for (const m of inbox) {
    const w = m.t === 'snap' ? ((m.s as Snapshot).w as Record<string, unknown> | undefined) : undefined
    if (w && k in w) v = w[k]
  }
  return v
}
const chat = (inbox: HostMsg[]) => inbox.flatMap((m) => (m.t === 'chat' ? m.lines.map((l) => l.text) : []))
const lines = (c: FakeClient) => chat(c.inbox)

describe('單機練習暫停（client → host 的 pause 訊息）', () => {
  it('協定驗證：{ t: "pause", on: boolean }，其他形狀丟棄', () => {
    expect(validateClientMsg({ t: 'pause', on: true })).toEqual({ t: 'pause', on: true })
    expect(validateClientMsg({ t: 'pause', on: false, extra: 1 })).toEqual({ t: 'pause', on: false })
    expect(validateClientMsg({ t: 'pause' })).toBeNull()
    expect(validateClientMsg({ t: 'pause', on: 1 })).toBeNull()
    expect(validateClientMsg({ t: 'pause', on: 'true' })).toBeNull()
    expect(parseClientBytes(encode({ t: 'pause', on: true }))).toEqual({ t: 'pause', on: true })
  })

  it('練習局、只有 1 名真人：暫停時 sim 不前進（快照照送、w.pz = true），繼續時不追趕暫停期間的時間', () => {
    const { srv, g, host, inbox } = practice()
    for (let i = 0; i < 2 * SEC; i++) srv.tick()
    expect(g.practice).toBe(true)
    host({ t: 'pause', on: true })
    const t0 = g.time
    const tick0 = g.tick
    inbox.length = 0
    for (let i = 0; i < 30 * SEC; i++) srv.tick()
    expect(g.time).toBe(t0)
    expect(g.tick).toBe(tick0)
    expect(inbox.filter((m) => m.t === 'snap').length).toBe(30 * SEC)
    expect(lastW(inbox, 'pz')).toBe(true)
    // 暫停中下的指令照收，只是不會動
    host({ t: 'pause', on: false })
    srv.tick()
    // 只前進一個 tick：沒有補跑暫停的 30 秒
    expect(g.tick).toBe(tick0 + 1)
    expect(g.time).toBeCloseTo(t0 + TICK_DT, 6)
    for (let i = 0; i < SEC; i++) srv.tick()
    expect(g.tick).toBe(tick0 + 1 + SEC)
    expect(lastW(inbox, 'pz')).toBe(false)
  })

  it('多人局不接受：一般房間、或練習房裡有 2 名真人', () => {
    const { h, cs } = Harness.started(2, 4242, { eventMult: 0, npcCrew: 0, bots: 1 })
    const g = h.server.game!
    const t0 = g.time
    cs[0].send({ t: 'pause', on: true } as ClientMsg)
    cs[1].send({ t: 'pause', on: true } as ClientMsg)
    h.ticks(SEC)
    expect(g.menuPause).toBe(false)
    expect(g.time).toBeGreaterThan(t0 + 0.9)
    const two = practice(6200, 2)
    expect(two.g.practice).toBe(false)
    two.host({ t: 'pause', on: true })
    two.others[0]({ t: 'pause', on: true })
    const t1 = two.g.time
    for (let i = 0; i < SEC; i++) two.srv.tick()
    expect(two.g.menuPause).toBe(false)
    expect(two.g.time).toBeGreaterThan(t1 + 0.9)
  })

  it('真人離線自動繼續；暫停滿 10 分鐘自動繼續並私訊說明', () => {
    const a = practice(6300)
    a.host({ t: 'pause', on: true })
    a.srv.tick()
    expect(a.g.menuPause).toBe(true)
    a.srv.onLeave(LOCAL_PEER)
    expect(a.g.menuPause).toBe(false)
    const t0 = a.g.time
    a.srv.tick()
    expect(a.g.time).toBeGreaterThan(t0)

    const b = practice(6400)
    b.host({ t: 'pause', on: true })
    const t1 = b.g.time
    for (let i = 0; i < (PRACTICE_PAUSE_MAX_S - 1) * SEC; i++) b.srv.tick()
    expect(b.g.menuPause).toBe(true)
    expect(b.g.time).toBe(t1)
    for (let i = 0; i < 2 * SEC; i++) b.srv.tick()
    expect(b.g.menuPause).toBe(false)
    expect(b.g.time).toBeGreaterThan(t1)
    expect(chat(b.inbox)).toContain('@pause.timeout|m=10')
    // 之後重新要求暫停：照樣接受
    b.host({ t: 'pause', on: true })
    expect(b.g.menuPause).toBe(true)
  })
})

describe('多人局：斷線與重新連線的公告', () => {
  // 第 4 輪起寬限期間的公告不點名（匿名形態斷線時身體停在原地，點名就能對回真人）；詳細測試見 r4b-session.test.ts
  it('客人斷線：所有人收到「有一名玩家斷線了」（不點名）；寬限內重新連上：「斷線的玩家重新連上了」', () => {
    const { h, cs } = Harness.started(3, 4242, { eventMult: 0, npcCrew: 0 })
    const g = h.server.game!
    const p = g.players[cs[1].slot]!
    for (const c of cs) c.inbox.length = 0
    h.server.onLeave(cs[1].peer)
    h.ticks(2)
    const want = `@sys.droppedAnon|s=${RECONNECT_GRACE_S}`
    expect(lines(cs[0])).toContain(want)
    expect(lines(cs[2])).toContain(want)
    for (const c of [cs[0], cs[2]]) expect(lines(c).some((x) => x.includes(p.baseName))).toBe(false)
    h.ticks(5 * SEC)
    const again = h.connect('p1')
    h.ticks(2)
    expect(lines(cs[0])).toContain('@sys.rejoinedAnon')
    expect(lines(again)).toContain('@sys.rejoinedAnon')
    // 同一個 hello 重送（還連著）不算重新連線
    for (const c of cs) c.inbox.length = 0
    again.send({ t: 'hello', name: 'p1', color: 1, ver: 1, token: 'tokp1xxxxxx' })
    h.ticks(2)
    expect(lines(cs[0]).some((x) => x.startsWith('@sys.rejoined'))).toBe(false)
  })

  it('寬限過了才回來（已經算離開）不再公告重新連線；結算後斷線不公告', () => {
    const { h, cs } = Harness.started(3, 4242, { eventMult: 0, npcCrew: 0 })
    h.server.onLeave(cs[1].peer)
    h.ticks((RECONNECT_GRACE_S + 1) * SEC)
    for (const c of cs) c.inbox.length = 0
    h.connect('p1')
    h.ticks(2)
    expect(lines(cs[0]).some((x) => x.startsWith('@sys.rejoined'))).toBe(false)
    h.server.game!.endGame('draw')
    h.ticks(1)
    for (const c of cs) c.inbox.length = 0
    h.server.onLeave(cs[2].peer)
    h.ticks(2)
    expect(lines(cs[0]).some((x) => x.startsWith('@sys.dropped'))).toBe(false)
  })

  it('字串 zh／en 都有，參數照填', () => {
    for (const k of ['sys.dropped', 'sys.rejoined', 'pause.timeout']) {
      expect(hasString('zh', k)).toBe(true)
      expect(hasString('en', k)).toBe(true)
    }
    expect(sysText('@sys.dropped|name=Dr. Bob|s=90')).toBe('博士·Bob 斷線了（90 秒內可以重新連線）')
    lang.value = 'en'
    expect(sysText('@sys.rejoined|name=Dr. Bob')).toBe('Dr. Bob reconnected')
    lang.value = 'zh'
  })
})

/** 時間軸裡某人死亡那一筆的下一筆 */
function causeAfterDeath(g: Game, p: GamePlayer): string {
  const tl = g.ended!.timeline
  const i = tl.findIndex((e) => e.text.startsWith('@tl.death.') && e.text.includes('name=') && e.text.endsWith(p.baseName))
  expect(i).toBeGreaterThanOrEqual(0)
  return tl[i + 1]?.text ?? ''
}

describe('結算時間軸的死因', () => {
  it('被門夾死、被某人擊殺、被生物殺死都記在死亡那一筆的下一筆；AI 也有；對局中不會送出', () => {
    const { h, cs, g } = (() => {
      const r = Harness.started(3, 4242, { eventMult: 0, npcCrew: 0, bots: 2 })
      return { ...r, g: r.h.server.game! }
    })()
    const ps = g.allPlayers()
    for (const p of ps) g.setRole(p, 'human')
    const [killer, v1, v2, v3] = [ps[0], ps[1], ps[3], ps[4]]
    expect([v2, v3].every((p) => p.bot)).toBe(true)
    // 門
    const u1 = g.mainOf(v1)!
    u1.hp = 200
    damage(g, null, u1, 225, { kind: 'normal', pure: true, env: 'door' })
    // 被玩家擊殺
    damage(g, g.mainOf(killer)!, g.mainOf(v2)!, 1e6, { pure: true })
    // 被生物殺死
    const bug = g.world.spawn(unitDef('creature.slugling'), g.mainOf(v3)!.zone, g.mainOf(v3)!.x + 1, g.mainOf(v3)!.y, HOSTILE)
    damage(g, bug, g.mainOf(v3)!, 1e6, { pure: true })
    h.ticks(SEC)
    // 對局中：沒有任何一則送出的訊息帶時間軸的死因
    for (const raws of h.raw.values()) for (const r of raws) expect(JSON.stringify(decode(r))).not.toContain('tl.cause')
    g.endGame('crew')
    h.ticks(1)
    const tlName = (p: GamePlayer) => (CLASSES.get(p.classId)?.prefix.en ?? '') + p.baseName
    expect(causeAfterDeath(g, v1)).toBe('@tl.cause.door')
    expect(causeAfterDeath(g, v2)).toBe(`@tl.cause.player|name=${tlName(killer)}`)
    expect(causeAfterDeath(g, v3)).toBe('@tl.cause.unit|unit=creature.slugling')
    // 結算訊息裡有
    const end = cs[0].inbox.find((m) => m.t === 'end')
    expect(end && JSON.stringify(end)).toContain('tl.cause.door')
    // 兩種語言都翻得出來，不含寫死的中文
    for (const e of g.ended!.timeline) {
      if (!e.text.startsWith('@tl.cause.')) continue
      expect(/[一-鿿]/.test(e.text)).toBe(false)
      const key = e.text.slice(1).split('|')[0]
      expect([key, hasString('zh', key), hasString('en', key)]).toEqual([key, true, true])
    }
    expect(sysText('@tl.cause.door')).toBe('└ 死因：被故障的門夾死')
    expect(sysText('@tl.cause.unit|unit=creature.slugling')).toBe(`└ 死因：被${UNITS.get('creature.slugling')!.name.zh}擊殺`)
  })

  it('離開遊戲（斷線超過寬限）記成「離開了遊戲」', () => {
    const { h, cs } = Harness.started(3, 4242, { eventMult: 0, npcCrew: 0 })
    const g = h.server.game!
    const p = g.players[cs[1].slot]!
    h.server.onLeave(cs[1].peer)
    h.ticks((RECONNECT_GRACE_S + 1) * SEC)
    g.endGame('draw')
    expect(causeAfterDeath(g, p)).toBe('@tl.cause.left')
  })
})

describe('晉升：職業欄位', () => {
  it('政委晉升成特務：本人的私有狀態與結算名單帶 promoted（classId 仍是 commissar）；別人沒有', () => {
    const { h, cs } = Harness.started(3, 4242, { eventMult: 0, npcCrew: 0 })
    const g = h.server.game!
    const ps = g.allPlayers()
    for (const p of ps) g.setRole(p, 'human')
    const p = ps[1]
    p.classId = 'commissar'
    for (const q of ps) if (q !== p && q.classId === 'commissar') q.classId = 'researcher'
    h.ticks(2)
    expect(g.triggerEvent!('promotion', true)).toBe(true)
    h.ticks(2)
    const c = cs.find((x) => x.slot === p.slot)!
    expect(c.me.promoted).toBe(true)
    expect(c.me.classId).toBe('commissar')
    for (const o of cs) if (o !== c) expect(o.me.promoted).toBeUndefined()
    g.endGame('crew')
    const r = g.ended!.players
    expect(r.find((x) => x.slot === p.slot)!.promoted).toBe(true)
    expect(r.filter((x) => x.promoted).length).toBe(1)
  })
})

describe('文字：保全的頭銜、仿生人的誤傷', () => {
  it('保全的職業名交代名牌上的頭銜；仿生人關機的私訊說明誤傷怎麼算', () => {
    expect(t('class.security')).toContain('列兵')
    expect(CLASSES.get('security')!.desc.zh).toContain('列兵')
    const zh = t('role.androidShutdown')
    // 第 9 輪：門檻（sim 的 2.7 份）對玩家寫成「將近 3 名船員」，不再寫小數
    expect(zh).toContain('將近 3 名船員')
    expect(zh).not.toContain('2.7')
    expect(zh).toContain('5 分鐘')
    expect(zh).toContain('一整條血')
    lang.value = 'en'
    expect(t('class.security')).toContain('Private')
    expect(t('role.androidShutdown')).toContain('full health bar')
    lang.value = 'zh'
  })
})
