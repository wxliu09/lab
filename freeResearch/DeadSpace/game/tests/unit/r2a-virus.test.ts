// 第 2 輪（人類玩家視角審查，sim 端）：通訊病毒
// - 練習「簡單」整局都不會隨機抽到（強制觸發照舊）
// - 換好名字後私訊每個人自己的新名字
// - 命名規則：頭銜（職業前綴、晉升頭銜）跟著人走，名字一律是「自己的頭銜＋顯示用本名」；
//   審查員看到同一份報告裡有「博士·BOT-B」和「BOT-B」，是因為換名時把前綴丟掉了
// - 換名後的晉升公告、管家名字、死因裡的擁有者、聊天指令找人，都用別人眼中的名字（真名不外洩）
import { describe, expect, it } from 'vitest'
import { Harness, type FakeClient } from './helpers/harness'
import { GameServer, LOCAL_PEER } from '../../src/sim/server'
import { encode } from '../../src/shared/protocol/codec'
import { PRACTICE_ROOM, type LobbySettings } from '../../src/shared/protocol/messages'
import { EASY_NEVER, VIRUS_EARLIEST, VIRUS_SWAP_S, pickEvent } from '../../src/sim/systems/events'
import { describeView } from '../../src/sim/systems/death'
import { giveItem, makeItem } from '../../src/sim/systems/items'
import { SCRIPTS } from '../../src/sim/systems/effects'
import { CLASSES } from '../../src/shared/content/registry'
import { fmtKey, shownBase, type Game, type GamePlayer } from '../../src/sim/game'
import { lang, sysText } from '../../src/ui/i18n'
import '../../src/ui/strings/sim6'

const sec = (h: Harness, s: number) => h.ticks(Math.round(s * 20))

function chatOf(c: FakeClient): string[] {
  const out: string[] = []
  for (const m of c.inbox) if (m.t === 'chat') for (const l of m.lines) out.push(l.text)
  return out
}

const clientOf = (h: Harness, p: GamePlayer): FakeClient =>
  [...h.clients.values()].find((c) => c.slot === p.slot)!

const prefixOf = (p: GamePlayer) => CLASSES.get(p.classId)?.prefix.en ?? ''

function join(s: GameServer, peer: string, name: string) {
  s.onJoin(peer)
  const send = (m: Parameters<typeof encode>[0]) => s.onMessage(peer, encode(m))
  send({ t: 'hello', name, color: 0, ver: 1, token: 'tok' + name.padEnd(8, 'x') })
  return send
}

function practice(seed: number, settings: Partial<LobbySettings>): Game {
  const s = new GameServer(PRACTICE_ROOM, { send: () => {} }, seed, seed ^ 0x5bd1e995)
  const host = join(s, LOCAL_PEER, 'host')
  host({ t: 'settings', s: { bots: 3, npcCrew: 0, ...settings } })
  host({ t: 'start' })
  s.tick()
  return s.game!
}

describe('通訊病毒：練習「簡單」不出', () => {
  it('簡單練習局整局抽不到；一般難度的練習局抽得到；強制觸發照舊', () => {
    expect([...EASY_NEVER]).toEqual(['virus'])
    const draws = (g: Game, at: number) => {
      g.world.time = at
      const seen = new Set<string>()
      for (let i = 0; i < 600; i++) {
        const id = pickEvent(g, false)
        if (id) seen.add(id)
      }
      return seen
    }
    const easy = practice(51, { aiLevel: 'easy' })
    expect(easy.practice).toBe(true)
    expect(draws(easy, 200).has('virus')).toBe(false)
    expect(draws(easy, 1500).has('virus')).toBe(false)
    const normal = practice(51, { aiLevel: 'normal' })
    // 第 6 輪：開局 10 分鐘（VIRUS_EARLIEST）之後才可能抽到
    expect(draws(normal, 200).has('virus')).toBe(false)
    expect(draws(normal, VIRUS_EARLIEST + 60).has('virus')).toBe(true)
    expect(easy.triggerEvent!('virus', true)).toBe(true)
  })
})

describe('通訊病毒：命名規則與私訊', () => {
  function setup(seed = 2077) {
    const { h } = Harness.started(5, seed, { eventMult: 0 })
    const g = h.server.game!
    const ps = g.allPlayers()
    for (const c of h.clients.values()) c.inbox.length = 0
    return { h, g, ps }
  }

  it('換名前後一律是「自己的職業前綴＋顯示用本名」；本名是原本名字的重新排列；主單位跟著換；每個人私下收到自己的新名字', () => {
    const { h, g, ps } = setup()
    const bases = ps.map((p) => p.baseName)
    // 開局：名字 = 職業前綴＋本名
    for (const p of ps) expect(p.name).toBe(prefixOf(p) + p.baseName)
    expect(ps.some((p) => prefixOf(p))).toBe(true)
    g.triggerEvent!('virus', true)
    expect(ps.every((p) => p.name === '' && g.mainOf(p)!.name === '')).toBe(true)
    sec(h, 10.2)
    expect(ps.map((p) => shownBase(p)).sort()).toEqual([...bases].sort())
    for (const p of ps) {
      // 頭銜不會掉：不會出現沒有前綴的「BOT-B」和有前綴的「博士·BOT-B」並存
      expect(p.name).toBe(prefixOf(p) + shownBase(p))
      expect(g.mainOf(p)!.name).toBe(p.name)
      // 真名沒變（結算時間軸用）
      expect(p.baseName).toBe(bases[ps.indexOf(p)])
    }
    for (const p of ps.filter((q) => !q.bot)) {
      const mine = chatOf(clientOf(h, p)).filter((l) => l.startsWith('@event.virusYou'))
      expect(mine).toEqual([fmtKey('event.virusYou', { name: p.name, s: VIRUS_SWAP_S })])
    }
    // client 依語言換掉前綴（name 參數由 sysText 在地化）
    const dr = ps.find((p) => prefixOf(p) === 'Dr. ')
    if (dr) {
      lang.value = 'zh'
      expect(sysText(fmtKey('event.virusYou', { name: dr.name }))).toContain('博士·' + shownBase(dr))
      lang.value = 'en'
      expect(sysText(fmtKey('event.virusYou', { name: dr.name }))).toContain('Dr. ' + shownBase(dr))
      lang.value = 'zh'
    }
  })

  it('換名前抽的樣本記的是當時的名字；換名後記新名字：兩份名字都帶各自的頭銜（不會一個有前綴、一個沒有）', () => {
    const { h, g, ps } = setup(2078)
    for (const p of ps) g.setRole(p, 'human')
    const u = g.mainOf(ps[0])!
    u.inv!.fill(null)
    giveItem(g, u, makeItem('geneSampler'))
    const draw = (t: GamePlayer) => {
      const slot = u.inv!.findIndex((x) => x?.id === 'geneSampler')
      const te = g.mainOf(t)!
      SCRIPTS.get('git.draw')!(
        g,
        { caster: u, target: te, x: te.x, y: te.y, zone: te.zone, itemSlot: slot } as never,
        {},
      )
    }
    draw(ps[1])
    g.triggerEvent!('virus', true)
    sec(h, 10.2)
    // 換名後拿到 ps[1] 原本本名的人（就是審查員看到的情況：同一個本名先後屬於兩個人）
    const heir = ps.find((p) => shownBase(p) === ps[1].baseName)!
    const second = heir !== ps[1] && heir !== ps[0] ? heir : ps[2]
    draw(second)
    const names = (u.inv!.find((x) => x?.id === 'geneSampler')?.data as { sample: { names: string[] } })
      .sample.names
    // 兩份名字都照同一個規則：各自的職業前綴＋當時的顯示用本名
    expect(names).toEqual([prefixOf(ps[1]) + ps[1].baseName, prefixOf(second) + shownBase(second)])
  })

  it('換名後晉升：公告與新名字用顯示用本名（「特務·」＋換到的名字），不會把真名說出來', () => {
    const { h, g, ps } = setup(2079)
    const c = ps[1]
    c.classId = 'commissar'
    g.setRole(c, 'human')
    g.triggerEvent!('virus', true)
    sec(h, 10.2)
    const shown = shownBase(c)
    for (const cl of h.clients.values()) cl.inbox.length = 0
    expect(g.triggerEvent!('promotion', true)).toBe(true)
    expect(c.name).toBe('特務·' + shown)
    expect(g.mainOf(c)!.name).toBe(c.name)
    h.ticks(1)
    const line = chatOf(clientOf(h, ps[0])).find((l) => l.startsWith('@event.promotion'))!
    expect(line).toBe(fmtKey('event.promotion', { name: shown }))
  })

  it('清空名字的 10 秒內晉升：頭銜先記下來，名字換好時套上「特務·」', () => {
    const { h, g, ps } = setup(2080)
    const c = ps[1]
    c.classId = 'commissar'
    g.setRole(c, 'human')
    g.triggerEvent!('virus', true)
    sec(h, 2)
    expect(g.triggerEvent!('promotion', true)).toBe(true)
    expect(c.name).toBe('')
    sec(h, 8.5)
    expect(c.name).toBe('特務·' + shownBase(c))
  })

  it('執行長的管家跟著主人換名字與顏色；死因裡「某人的裝置」用換到的名字', () => {
    const { h, g, ps } = setup(2081)
    const ceo = ps.find((p) => p.classId === 'ceo')
    if (ceo) {
      g.triggerEvent!('virus', true)
      sec(h, 10.2)
      const b = [...g.world.ents.values()].find((e) => e.tags.has('butler') && e.data.butlerOf === ceo.slot)
      if (b) {
        expect(b.name).toBe(shownBase(ceo) + ' 的管家')
        expect(b.color).toBe(ceo.color)
      }
    } else {
      g.triggerEvent!('virus', true)
      sec(h, 10.2)
    }
    const o = ps.find((p) => shownBase(p) !== p.baseName)!
    expect(o).toBeTruthy()
    expect(describeView(g, { i: 1, d: 'dev.regenBeacon', o: o.slot } as never)).toEqual({
      k: 'owned',
      n: shownBase(o),
      d: 'dev.regenBeacon',
    })
  })

  it('聊天指令用名字找人：比對別人眼中的名字（用真名找不到換了名字的人）', () => {
    const { h, g, ps } = setup(2082)
    g.triggerEvent!('virus', true)
    sec(h, 10.2)
    const o = ps.find((p) => shownBase(p) !== p.baseName && !p.bot && p.alive)
    const host = ps[0]
    // 主機建立群組，用某人的「真名」去加：只要那個真名現在不是任何人的顯示名字，就加不到他本人
    g.handleChat(host.slot, 'all', '-creategroup g1')
    const victim = ps.find((p) => p !== host && shownBase(p) !== p.baseName)!
    const holder = ps.find((p) => shownBase(p) === victim.baseName)!
    g.handleChat(host.slot, 'all', '-add g1 ' + victim.baseName)
    const gr = (g as unknown as { _groups: Map<string, { members: Set<number> }> })._groups.get('g1')!
    // 加到的是現在顯示這個名字的人，不是真名的主人
    if (holder !== host) expect(gr.members.has(holder.slot)).toBe(true)
    expect(gr.members.has(victim.slot)).toBe(false)
    void o
  })
})
