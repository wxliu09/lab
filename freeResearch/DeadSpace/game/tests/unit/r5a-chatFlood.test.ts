// 第 5 輪審查：洗版與限流提示
// - P2-7：分享調查筆記只受一般限流，每次分享都私訊對方，10 秒能洗 400 則、把對方的聊天紀錄（含驗血結果）洗掉。
//   現在同一對玩家 15 秒最多通知一次（視窗內的新內容照樣更新筆記，通知延到視窗結束補一則）；內容沒變就不再通知。
// - P3-4：聊天超過限流被默默丟掉。現在私訊發送者「訊息送太快了，有些沒送出」，5 秒最多提示一次。
import { describe, expect, it } from 'vitest'
import { Harness, type FakeClient } from './helpers/harness'
import { SHARE_NOTIFY_S, type GamePlayer } from '../../src/sim/game'
import { CHAT_BURST, CHAT_FAST_HINT_S } from '../../src/sim/server'
import { hasString } from '../../src/ui/i18n'
import '../../src/ui/strings/sim6'

const lines = (c: FakeClient) => c.inbox.flatMap((m) => (m.t === 'chat' ? m.lines : []))
const count = (c: FakeClient, key: string) => lines(c).filter((l) => l.text.split('|')[0] === '@' + key).length
const sharedFrom = (q: GamePlayer, from: number) => [...q.notes.values()].filter((n) => n.from === from)

function setup(n = 3) {
  const { h, cs } = Harness.started(n, 6161, { eventMult: 0 })
  const g = h.server.game!
  const ps = g.allPlayers()
  for (const p of ps) g.setRole(p, 'human')
  return { h, cs, g, ps }
}

describe('分享調查筆記：不能拿來洗版', () => {
  it('同樣的內容連續分享 200 次：對方只收到 1 則通知；之後再分享也不再通知', () => {
    const { h, cs, ps } = setup()
    cs[1].send({ t: 'note', target: ps[2].slot, mark: 'suspect', text: 'shifty' })
    h.ticks(1)
    for (let k = 0; k < 4; k++) {
      for (let i = 0; i < 50; i++) cs[1].send({ t: 'shareNotes', to: ps[0].slot })
      h.ticks(20)
    }
    expect(count(cs[0], 'sys.notesShared')).toBe(1)
    expect(sharedFrom(ps[0], ps[1].slot)).toEqual([expect.objectContaining({ slot: ps[2].slot, mark: 'suspect', text: 'shifty' })])
    // 過了很久，內容一樣：還是不通知
    h.ticks(20 * (SHARE_NOTIFY_S + 5))
    cs[1].send({ t: 'shareNotes', to: ps[0].slot })
    h.ticks(2)
    expect(count(cs[0], 'sys.notesShared')).toBe(1)
  })

  it('視窗內內容改了：筆記立刻更新、不另外通知；視窗結束時補一則通知（一個視窗只補一次）；之後改內容就立刻通知', () => {
    const { h, cs, g, ps } = setup()
    const note = (text: string) => cs[1].send({ t: 'note', target: ps[2].slot, mark: 'suspect', text })
    note('v1')
    h.ticks(1)
    const t0 = g.time
    cs[1].send({ t: 'shareNotes', to: ps[0].slot })
    h.ticks(1)
    expect(count(cs[0], 'sys.notesShared')).toBe(1)
    // 視窗內改了好幾次、每次都分享
    for (const v of ['v2', 'v3', 'v4']) {
      h.ticks(20)
      note(v)
      h.ticks(1)
      cs[1].send({ t: 'shareNotes', to: ps[0].slot })
      h.ticks(1)
      expect(sharedFrom(ps[0], ps[1].slot)[0].text).toBe(v)
    }
    expect(count(cs[0], 'sys.notesShared')).toBe(1)
    // 視窗結束：補一則
    while (g.time < t0 + SHARE_NOTIFY_S + 0.5) h.ticks(1)
    expect(count(cs[0], 'sys.notesShared')).toBe(2)
    h.ticks(20 * 20)
    expect(count(cs[0], 'sys.notesShared')).toBe(2)
    // 視窗外改內容：立刻通知
    note('v5')
    h.ticks(1)
    cs[1].send({ t: 'shareNotes', to: ps[0].slot })
    h.ticks(1)
    expect(count(cs[0], 'sys.notesShared')).toBe(3)
    expect(sharedFrom(ps[0], ps[1].slot)[0].text).toBe('v5')
  })

  it('限制是每一對玩家：同一個人分享給兩個人，兩個人各收到一則', () => {
    const { h, cs, ps } = setup()
    cs[1].send({ t: 'note', target: ps[2].slot, mark: 'trust', text: 'ok' })
    h.ticks(1)
    for (let i = 0; i < 20; i++) {
      cs[1].send({ t: 'shareNotes', to: ps[0].slot })
      cs[1].send({ t: 'shareNotes', to: ps[2].slot })
    }
    h.ticks(2)
    expect(count(cs[0], 'sys.notesShared')).toBe(1)
    expect(count(cs[2], 'sys.notesShared')).toBe(1)
  })
})

describe('聊天限流：被丟掉時提示發送者', () => {
  it('對局中連發：超過限流的那幾則沒送出，發送者收到 1 則私訊提示；5 秒內再超量不重複提示，之後才再提示', () => {
    const { h, cs } = setup()
    const flood = (tag: string) => {
      for (let i = 0; i < CHAT_BURST + 6; i++) cs[1].send({ t: 'chat', ch: 'all', text: `${tag} ${i}` })
    }
    flood('a')
    h.ticks(1)
    expect(count(cs[1], 'chat.tooFast')).toBe(1)
    const tip = lines(cs[1]).find((l) => l.text === '@chat.tooFast')!
    expect(tip.ch).toBe('private')
    // 只給發送者
    expect(count(cs[0], 'chat.tooFast')).toBe(0)
    expect(count(cs[2], 'chat.tooFast')).toBe(0)
    // 送出去的只有限流放行的那幾則
    const got = lines(cs[0]).filter((l) => l.ch === 'all' && l.text.startsWith('a '))
    expect(got.length).toBe(CHAT_BURST)
    h.ticks(20 * 2)
    flood('b')
    h.ticks(1)
    expect(count(cs[1], 'chat.tooFast')).toBe(1)
    h.ticks(20 * CHAT_FAST_HINT_S)
    flood('c')
    h.ticks(1)
    expect(count(cs[1], 'chat.tooFast')).toBe(2)
  })

  it('大廳裡連發也提示（直接私訊，不經過對局）', () => {
    const h = new Harness(6262)
    h.connect('host', true)
    const p1 = h.connect('p1')
    h.ticks(2)
    for (let i = 0; i < CHAT_BURST + 3; i++) p1.send({ t: 'chat', ch: 'all', text: 'hi ' + i })
    expect(count(p1, 'chat.tooFast')).toBe(1)
    expect(count(h.clients.get('local')!, 'chat.tooFast')).toBe(0)
  })

  it('提示字串 zh、en 都有', () => {
    for (const l of ['zh', 'en'] as const) expect(hasString(l, 'chat.tooFast')).toBe(true)
  })
})
