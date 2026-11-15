// 第 4 輪：聊天與社交指令（-list <群組>、被消音的群組訊息、-names 附大廳原名、-rename 擋同形異字、洗版限制）
import { afterEach, describe, expect, it } from 'vitest'
import { Harness, type FakeClient } from './helpers/harness'
import { CHAT_BURST, CHAT_DUPE_S } from '../../src/sim/server'
import { knownDead, mixedScript, nameSkeleton } from '../../src/sim/systems/chat'
import type { ChatLine } from '../../src/shared/protocol/messages'
import { hasString, lang, sysText } from '../../src/ui/i18n'
import '../../src/ui/strings/sim6'
import '../../src/ui/strings/sim7'

const SEC = 20
const chatLines = (c: FakeClient): ChatLine[] => c.inbox.flatMap((m) => (m.t === 'chat' ? m.lines : []))
const lines = (c: FakeClient) => chatLines(c).map((l) => l.text)
const CJK = /[㐀-鿿]/

afterEach(() => {
  lang.value = 'zh'
})

function setup(n = 3, settings: Record<string, unknown> = {}) {
  const { h, cs } = Harness.started(n, 4242, { eventMult: 0, npcCrew: 0, ...settings })
  const g = h.server.game!
  const ps = g.allPlayers()
  for (const p of ps) if (!p.spectator) g.setRole(p, 'human')
  h.ticks(2)
  return { h, cs, g, ps }
}

/** 送一行聊天並推進 1.6 秒（聊天限流約 1 行／1.5 秒），回傳這個人新收到的文字 */
function say(h: Harness, c: FakeClient, text: string, extra: Record<string, unknown> = {}): string[] {
  c.inbox.length = 0
  c.send({ t: 'chat', ch: 'all', text, ...extra } as never)
  h.ticks(1.6 * SEC)
  return lines(c)
}

describe('-list <群組>（原作 18314–18333）', () => {
  it('成員本人查得到「群組 X 的成員：…」；不是成員、群組不存在回同一句；人類也能用', () => {
    const { h, cs, g, ps } = setup(3)
    say(h, cs[0], '-creategroup sec')
    say(h, cs[0], '-add sec ' + ps[1].baseName)
    const out = say(h, cs[1], '-list sec')
    const row = out.find((x) => x.startsWith('@chat.groupMembers'))!
    expect(row).toContain('group=sec')
    expect(row).toContain(ps[0].name)
    expect(row).toContain(ps[1].name)
    expect(row).not.toContain(ps[2].name)
    expect(say(h, cs[2], '-list sec')).toContain('@chat.noGroup|group=sec')
    expect(say(h, cs[2], '-list nope')).toContain('@chat.noGroup|group=nope')
    // 沒給群組：人類提示用法；異類照舊列出陣營
    expect(say(h, cs[2], '-list')).toContain('@chat.listUsage')
    g.setRole(ps[2], 'xeno')
    expect(say(h, cs[2], '-list').some((x) => x.startsWith('@chat.factionList'))).toBe(true)
    expect(say(h, cs[2], '-listaliens').some((x) => x.startsWith('@chat.factionList'))).toBe(true)
    // -listaliens／-listmutants 只給異類
    expect(say(h, cs[1], '-listaliens').some((x) => x.startsWith('@chat.factionList'))).toBe(false)
    expect(say(h, cs[1], '-listmutants').some((x) => x.startsWith('@chat.factionList'))).toBe(false)
    // 死了就查不到（原作要求不在死者名單裡）
    g.killEnt(g.mainOf(ps[1])!, null, -1)
    h.ticks(2)
    expect(say(h, cs[1], '-list sec')).toContain('@chat.noGroup|group=sec')
  })

  it('-help 寫了 -list 群組，異類限定的是 -listaliens／-listmutants', () => {
    expect(sysText('@chat.help')).toContain('-list 群組')
    expect(sysText('@chat.help')).toContain('-listaliens')
    lang.value = 'en'
    expect(sysText('@chat.help')).toContain('-list group')
    expect(sysText('@chat.groupMembers|group=sec|lz=甲|le=Dr. Bob')).toBe('Members of group sec: Dr. Bob')
  })
})

describe('被消音時的群組訊息', () => {
  it('Mute-ilate 期間沒有名字、也不帶顏色（color = -1）；通訊病毒清空名字時一樣', () => {
    const { h, cs, g, ps } = setup(3)
    say(h, cs[0], '-creategroup sec')
    say(h, cs[0], '-add sec ' + ps[1].baseName)
    ps[0].mutedUntil = g.time + 30
    cs[1].inbox.length = 0
    cs[0].send({ t: 'chat', ch: 'group', text: 'meet at lab', to: 'sec' })
    h.ticks(1.6 * SEC)
    const l = chatLines(cs[1]).find((x) => x.text === 'meet at lab')!
    expect(l.from).toBe('')
    expect(l.color).toBe(-1)
    // 消音結束：名字和顏色都回來
    ps[0].mutedUntil = 0
    cs[1].inbox.length = 0
    cs[0].send({ t: 'chat', ch: 'group', text: 'ok now', to: 'sec' })
    h.ticks(1.6 * SEC)
    const l2 = chatLines(cs[1]).find((x) => x.text === 'ok now')!
    expect(l2.from).toBe(ps[0].name)
    expect(l2.color).toBe(ps[0].color)
    // 通訊病毒清空名字的 10 秒
    const name = ps[0].name
    ps[0].name = ''
    cs[1].inbox.length = 0
    cs[0].send({ t: 'chat', ch: 'group', text: 'who am i', to: 'sec' })
    h.ticks(1.6 * SEC)
    expect(chatLines(cs[1]).find((x) => x.text === 'who am i')!.color).toBe(-1)
    ps[0].name = name
  })
})

describe('-names：附大廳原名、只標已公告的死亡', () => {
  it('-rename 之後附上大廳原名；依名字排序；死亡標記只看已公告的死亡；旁觀的主機標成旁觀', () => {
    const { h, cs, g, ps } = setup(4, { hostSpectate: true })
    const host = ps.find((p) => p.spectator)!
    expect(knownDead(host)).toBe(false)
    const a = g.players[cs[1].slot]!
    const b = g.players[cs[2].slot]!
    say(h, cs[1], '-rename Zed')
    expect(a.baseName).toBe('Zed')
    g.killEnt(g.mainOf(b)!, null, -1)
    h.ticks(2)
    expect(knownDead(b)).toBe(true)
    const out = say(h, cs[3], '-names').find((x) => x.startsWith('@chat.names'))!
    const lz = out.split('|lz=')[1].split('|')[0].split('、')
    expect(lz).toContain(`${a.name}（大廳名：p1）`)
    expect(lz).toContain(`${b.name}（死亡）`)
    expect(lz).toContain(`${host.name}（旁觀）`)
    expect(lz.some((x) => x.startsWith(host.name) && x.includes('死亡'))).toBe(false)
    // 沒改過名的人不附
    const c3 = g.players[cs[3].slot]!
    expect(lz).toContain(c3.name)
    expect([...lz].sort()).toEqual(lz)
    const le = out.split('|le=')[1].split('|')[0]
    expect(le).toContain(`${a.name} (lobby: p1)`)
    expect(le).toContain(' (spectating)')
  })

  it('通訊病毒換過名字：大廳原名跟著名字走，不會把換過名字的人對回真名', () => {
    const { h, cs, g } = setup(3)
    const [x, y] = [g.players[cs[1].slot]!, g.players[cs[2].slot]!]
    // x 先改名 Zed（大廳名 p1）
    say(h, cs[1], '-rename Zed')
    const tx = x.name.slice(0, x.name.length - 'Zed'.length)
    const ty = y.name.slice(0, y.name.length - y.baseName.length)
    // 模擬病毒把 x、y 的顯示用本名互換（events.ts virus）
    x.data.shownBase = 'p2'
    x.name = tx + 'p2'
    y.data.shownBase = 'Zed'
    y.name = ty + 'Zed'
    const out = say(h, cs[0], '-names').find((s) => s.startsWith('@chat.names'))!
    const lz = out.split('|lz=')[1].split('|')[0].split('、')
    // 換到「Zed」的 y 附上 Zed 的大廳名 p1（病毒的效果）；x 現在叫 p2、沒有附任何東西（不會露出「x 的大廳名是 p1」）
    expect(lz).toContain(`${ty}Zed（大廳名：p1）`)
    expect(lz).toContain(`${tx}p2`)
    // 病毒之後 x 再改名：附的是改名前別人眼中的大廳名 p2，不是真名 p1
    say(h, cs[1], '-rename Kay')
    const out2 = say(h, cs[0], '-names').find((s) => s.startsWith('@chat.names'))!
    expect(out2).toContain(`${tx}Kay（大廳名：p2）`)
    expect(out2).not.toContain(`${tx}Kay（大廳名：p1）`)
  })

  it('英文名單不夾中文：預設名字「船員 N」附了大廳原名也照樣換成 Crew N', () => {
    const h = new Harness(4242)
    const host = h.connect('host', true)
    const anon = h.connect('')
    host.send({ t: 'settings', s: { npcCrew: 0, eventMult: 0 } as never })
    host.send({ t: 'start' })
    h.ticks(2)
    const g = h.server.game!
    const p = g.players[anon.slot]!
    expect(p.baseName).toMatch(/^船員 \d+$/)
    say(h, anon, '-rename Zed')
    const out = say(h, host, '-names').find((s) => s.startsWith('@chat.names'))!
    lang.value = 'en'
    const en = sysText(out)
    expect(CJK.test(en)).toBe(false)
    expect(en).toMatch(/Zed \(lobby: Crew \d+\)/)
  })
})

describe('-rename 擋同形異字', () => {
  it('混用拉丁＋西里爾／希臘拒絕；中文、日文、韓文混拉丁字母可以', () => {
    expect(mixedScript('Аlice')).toBe(true)
    expect(mixedScript('Bοb')).toBe(true)
    expect(mixedScript('Ψbob')).toBe(true)
    expect(mixedScript('Alice')).toBe(false)
    expect(mixedScript('Алиса')).toBe(false)
    expect(mixedScript('小明Bob')).toBe(false)
    expect(mixedScript('ゆきNeko')).toBe(false)
    expect(mixedScript('コーヒー')).toBe(false)
    expect(mixedScript('김Kim')).toBe(false)
    expect(mixedScript('R2-D2')).toBe(false)
    const { h, cs, g } = setup(3)
    const p = g.players[cs[1].slot]!
    const before = p.baseName
    expect(say(h, cs[1], '-rename Dr Аlice')).toContain('@chat.nameMixed')
    expect(p.baseName).toBe(before)
    say(h, cs[1], '-rename 小明Bob')
    expect(p.baseName).toBe('小明Bob')
  })

  it('和別人目前的顯示名字正規化後相同就拒絕（大小寫、全形、西里爾同形、1／l／I、Crew N）；只是包含別人名字的一段可以', () => {
    expect(nameSkeleton('Alice')).toBe(nameSkeleton('ALICE'))
    expect(nameSkeleton('Alice')).toBe(nameSkeleton('Ａｌｉｃｅ'))
    expect(nameSkeleton('Alice')).toBe(nameSkeleton('АLICЕ'))
    expect(nameSkeleton('Alice')).toBe(nameSkeleton('A1ice'))
    expect(nameSkeleton('Alice')).toBe(nameSkeleton('AIice'))
    expect(nameSkeleton('Crew 3')).toBe(nameSkeleton('船員 3'))
    expect(nameSkeleton('Dr. Bob')).toBe(nameSkeleton('Dr Bob'))
    expect(nameSkeleton('Alice')).not.toBe(nameSkeleton('Alicia'))
    const { h, cs, g } = setup(3)
    const [a, b] = [g.players[cs[1].slot]!, g.players[cs[2].slot]!]
    say(h, cs[2], '-rename Alice')
    expect(b.baseName).toBe('Alice')
    // АІІСЕ 全是西里爾字母（不算混用），靠正規化擋下
    for (const nn of ['ALICE', 'Ａｌｉｃｅ', 'A1ice', 'АІІСЕ']) {
      expect([nn, say(h, cs[1], '-rename ' + nn).includes('@chat.nameTaken')]).toEqual([nn, true])
      expect(a.baseName).toBe('p1')
    }
    // 拉丁夾西里爾：混用文字系統就先擋下
    expect(say(h, cs[1], '-rename АLICЕ')).toContain('@chat.nameMixed')
    // 把別人的整個顯示名字（含頭銜）當成新名字也不行
    const full = b.name.replace(/[^\p{L}\p{N} _-]/gu, '')
    expect(say(h, cs[1], '-rename ' + full)).toContain('@chat.nameTaken')
    // 只是別人名字的一段：可以（以前會被誤擋）
    say(h, cs[1], '-rename ice')
    expect(a.baseName).toBe('ice')
  })

  it('通訊病毒之後只比對別人眼中的名字：改成某人的真名不會被擋（擋了就等於說出那個真名還在誰身上）', () => {
    const { h, cs, g } = setup(3)
    const [a, b] = [g.players[cs[1].slot]!, g.players[cs[2].slot]!]
    // b 的顯示用本名換成 Zed（真名 p2 已經沒有人顯示）
    b.data.shownBase = 'Zed'
    b.name = b.name.slice(0, b.name.length - b.baseName.length) + 'Zed'
    say(h, cs[1], '-rename p2')
    expect(a.baseName).toBe('p2')
    expect(say(h, cs[0], '-rename zed')).toContain('@chat.nameTaken')
  })

  it('大廳名字也比對正規化後的寫法：同形異字的名字自動加上編號', () => {
    const h = new Harness()
    h.connect('Alice', true)
    const evil = h.connect('Аlice', false, 'tokevil0001')
    h.ticks(1)
    const names = h.server.players.filter(Boolean).map((p) => p!.name)
    expect(names[0]).toBe('Alice')
    expect(names[1]).not.toBe('Аlice')
    expect(nameSkeleton(names[1])).not.toBe(nameSkeleton('Alice'))
    void evil
  })

  it('字串兩種語言都有', () => {
    for (const k of ['chat.nameMixed', 'chat.listUsage', 'chat.groupMembers', 'chat.dupe']) expect([k, hasString('zh', k), hasString('en', k)]).toEqual([k, true, true])
  })
})

describe('聊天洗版', () => {
  it(`持續約 1 行／1.5 秒、短暫連發最多 ${CHAT_BURST} 行`, () => {
    const { h, cs } = setup(3)
    cs[1].inbox.length = 0
    for (let i = 0; i < 10; i++) cs[0].send({ t: 'chat', ch: 'all', text: 'line ' + i })
    h.ticks(1)
    expect(lines(cs[1]).filter((x) => x.startsWith('line ')).length).toBe(CHAT_BURST)
    // 1.5 秒後再多一行
    cs[1].inbox.length = 0
    h.ticks(1.5 * SEC + 1)
    cs[0].send({ t: 'chat', ch: 'all', text: 'next a' })
    cs[0].send({ t: 'chat', ch: 'all', text: 'next b' })
    h.ticks(1)
    expect(lines(cs[1]).filter((x) => x.startsWith('next ')).length).toBe(1)
    // 持續送：15 秒內大約 10 行
    cs[1].inbox.length = 0
    let n = 0
    for (let t = 0; t < 15 * SEC; t++) {
      cs[0].send({ t: 'chat', ch: 'all', text: 'spam ' + n++ })
      h.ticks(1)
    }
    const got = lines(cs[1]).filter((x) => x.startsWith('spam ')).length
    expect(got).toBeGreaterThanOrEqual(9)
    expect(got).toBeLessThanOrEqual(11)
  })

  it(`同一個人 ${CHAT_DUPE_S} 秒內重複相同內容就壓掉，只私訊提示一次；過了 ${CHAT_DUPE_S} 秒、換頻道、指令都不算`, () => {
    const { h, cs } = setup(3)
    const hear = () => lines(cs[1]).filter((x) => x === 'hello all').length
    cs[1].inbox.length = 0
    say(h, cs[0], 'hello all')
    expect(hear()).toBe(1)
    h.ticks(2 * SEC)
    cs[1].inbox.length = 0
    const mine = say(h, cs[0], 'Hello   ALL')
    expect(hear()).toBe(0)
    expect(mine).toContain(`@chat.dupe|s=${CHAT_DUPE_S}`)
    h.ticks(2 * SEC)
    const again = say(h, cs[0], 'hello all')
    expect(again.some((x) => x.startsWith('@chat.dupe'))).toBe(false)
    // 過了 10 秒（從第一次送出算）：照常送出
    h.ticks(CHAT_DUPE_S * SEC)
    cs[1].inbox.length = 0
    say(h, cs[0], 'hello all')
    expect(hear()).toBe(1)
    // 指令不算重複
    h.ticks(2 * SEC)
    expect(say(h, cs[0], '-status').some((x) => x.startsWith('@chat.status'))).toBe(true)
    h.ticks(2 * SEC)
    expect(say(h, cs[0], '-status').some((x) => x.startsWith('@chat.status'))).toBe(true)
  })

  it('大廳也壓掉重複', () => {
    const h = new Harness()
    const a = h.connect('host', true)
    const b = h.connect('Bob')
    h.ticks(1)
    b.inbox.length = 0
    a.send({ t: 'chat', ch: 'all', text: 'ready?' })
    h.ticks(SEC)
    a.send({ t: 'chat', ch: 'all', text: 'ready?' })
    h.ticks(1)
    expect(lines(b).filter((x) => x === 'ready?').length).toBe(1)
    expect(lines(a)).toContain(`@chat.dupe|s=${CHAT_DUPE_S}`)
  })
})
