// 第 8 輪 AI（審查 B 的 724 局 headless 統計、審查 D）：異類偽裝（販賣機、防護服、驗血、說話、謊報、只在沒人看到時變回人形、
// 被打時和人類方一樣還手）、仿生人不抽自己與 2000 EP 升級、人類方收到寄生私訊就打抗體包、「錯誤」報告交叉消去出仿生人、
// 解析器不放在別人腳邊、結伴、簡單難度的調整、AI 閒話字串；最後用一小批 headless 對局量審查 B 的身分破綻指標
import { describe, expect, it } from 'vitest'
import { Harness } from './helpers/harness'
import { giveItem, makeItem, morph } from '../../src/sim/systems/items'
import { applyBuff, getBuff } from '../../src/sim/systems/buffs'
import { damage } from '../../src/sim/systems/damage'
import { restockAll } from '../../src/sim/systems/vendors'
import { installXenoSystems } from '../../src/sim/scripts/xeno'
import { markersOf } from '../../src/sim/setup'
import { IMPACT_R, stationsOf } from '../../src/sim/systems/stations'
import { GameServer, LOCAL_PEER } from '../../src/sim/server'
import { encode } from '../../src/shared/protocol/codec'
import { PRACTICE_ROOM } from '../../src/shared/protocol/messages'
import { FORMS } from '../../src/shared/content/registry'
import { XENO_T2_EP } from '../../src/shared/content/forms'
import { hasString } from '../../src/ui/i18n'
import '../../src/ui/strings/ai8'
import { ALIBI_N, EASY_DOOM_ALLOUT, EASY_SPARE_UNTIL, HIT_N, HI_N, MONSTER_N, NORMAL_EVIL_START, STALK_AFTER, evilAllOut } from '../../src/sim/ai/bots'
import type { Ent } from '../../src/sim/ent'
import type { Game, GamePlayer } from '../../src/sim/game'

/** 不保留訊息（長時間模擬時省記憶體）；each 回傳 true 就提早結束 */
function run(h: Harness, n: number, each?: () => boolean | void): void {
  for (let i = 0; i < n; i++) {
    h.ticks(1)
    for (const r of h.raw.values()) r.length = 0
    for (const c of h.clients.values()) {
      c.snaps.length = 0
      c.inbox.length = 0
    }
    if (each?.()) return
  }
}

/** 四周 r 公尺都走得到的空地（找不到就縮小範圍）*/
function openSpot(g: Game, zone: number, r = 5): { x: number; y: number } {
  const z = g.world.zones[zone]
  const L = z.layout!
  for (let y = r + 1; y < L.h - r - 1; y++)
    for (let x = r + 1; x < L.w - r - 1; x++) {
      const cx = x + 0.5
      const cy = y + 0.5
      let ok = true
      for (let dy = -r; dy <= r && ok; dy++) for (let dx = -r; dx <= r && ok; dx++) if (z.nav!.blockedAt(cx + dx, cy + dy)) ok = false
      if (ok) return { x: cx, y: cy }
    }
  if (r > 1) return openSpot(g, zone, r - 1)
  throw new Error('找不到空地')
}

function place(g: Game, u: Ent, zone: number, x: number, y: number): void {
  const n = g.world.zones[zone].nav?.nearestOpen(x, y) ?? { x, y }
  g.world.relocate(u, zone, n.x, n.y)
  u.order = null
  u.queue.length = 0
  u.path = null
}

/** 別的站（真人移過去：AI 眼前沒有人）*/
function elsewhere(g: Game, zone: number): { zone: number; x: number; y: number } {
  const z = g.world.zones.find((q) => q.alive && q.station && q.id !== zone && !q.data.ship && q.layout?.spawns.length)!
  return { zone: z.id, x: z.layout!.spawns[0].x, y: z.layout!.spawns[0].y }
}

/** 不動的真人 humans 位＋一個 AI（身分 role），AI 站在女帝號的一塊空地上，大家背包清空、真人凍住 */
function setup(role: 'human' | 'android' | 'xeno' | 'mutant', o: { seed?: number; humans?: number; aiLevel?: string; stations?: string[]; zoneKey?: string } = {}) {
  const { h, cs } = Harness.started(o.humans ?? 2, o.seed ?? 77, { bots: 1, eventMult: 0, npcCrew: 0, ...(o.aiLevel ? { aiLevel: o.aiLevel } : {}), ...(o.stations ? { stations: o.stations } : {}) })
  const g = h.server.game!
  installXenoSystems(g)
  const ps = g.allPlayers()
  for (const p of ps) g.setRole(p, 'human')
  const bot = ps.find((p) => p.bot)!
  const people = ps.filter((p) => !p.bot)
  g.setRole(bot, role)
  const u = g.mainOf(bot)!
  if (role === 'xeno') {
    u.data.extraAbilities = [...((u.data.extraAbilities as string[]) ?? []), 'xeno.form']
    morph(g, u, u.def.id)
  }
  const z = g.world.zones.find((q) => q.key === (o.zoneKey ?? 'nyx'))!
  const spot = openSpot(g, z.id)
  place(g, u, z.id, spot.x, spot.y)
  u.inv!.fill(null)
  for (const p of people) {
    const m = g.mainOf(p)!
    m.inv!.fill(null)
    m.data.frozen = true
  }
  // 防護服習慣固定成「很晚才穿」、也不去販賣機（測試不被買防護服打斷）
  g.data.botSuitPlans = new Map([[bot.slot, 'late']])
  bot.data.botSuitLateAt = 1e9
  bot.data.botSuitTried = true
  return { h, cs, g, bot, people, u, zone: z.id, spot }
}

type BrainView = {
  goal: { k: string; item?: string; e?: number } | null
  android: string
  sawAtk: Set<number>
  cleared: Set<string>
}
const brain = (p: GamePlayer) => p.data.brain as BrainView

const samplerOf = (u: Ent) => u.inv!.find((x) => x?.id === 'geneSampler' || x?.id === 'gitResolver')
const sampleNames = (u: Ent): string[] => ((samplerOf(u)?.data as { sample?: { names: string[] } } | undefined)?.sample?.names ?? []).slice()

/** AI 在全體頻道說的話（系統 key＋參數）*/
function botSays(h: Harness, bot: GamePlayer, n: number): string[] {
  const out: string[] = []
  const host = h.clients.get('local')!
  for (let i = 0; i < n; i++) {
    h.ticks(1)
    for (const m of host.inbox) if (m.t === 'chat') for (const l of m.lines) if (l.from === bot.name && l.ch === 'all') out.push(l.text)
    host.inbox.length = 0
    for (const r of h.raw.values()) r.length = 0
  }
  return out
}

describe('第 8 輪：仿生人 AI', () => {
  it('身邊沒人時：人類 AI 拿自己湊數，仿生人 AI 不抽自己（報告才不會永遠是「錯誤」）', () => {
    for (const role of ['human', 'android'] as const) {
      const { h, g, bot, people, u, zone } = setup(role)
      for (const p of people) {
        const at = elsewhere(g, zone)
        place(g, g.mainOf(p)!, at.zone, at.x, at.y)
      }
      giveItem(g, u, makeItem('geneSampler'))
      run(h, 20 * 100)
      expect([role, sampleNames(u).includes(bot.name)]).toEqual([role, role === 'human'])
    }
  })

  it('2000 EP：走到鑄造平台上升級機體', () => {
    const { h, g, bot, u } = setup('android', { stations: ['adjudicatrix'], zoneKey: 'adjudicatrix' })
    const z = g.world.zones[u.zone]
    expect(markersOf(z).fabricatorPad?.length ?? 0).toBeGreaterThan(0)
    bot.ep = 2000
    let started = false
    run(h, 20 * 90, () => (started = bot.evolvingUntil > 0 || !!bot.form))
    expect(started).toBe(true)
  })
})

describe('第 8 輪：抗體包', () => {
  it('收到寄生的私訊：手上有抗體包就打；朊毒（沒有私訊）不反應', () => {
    const { h, g, bot, u } = setup('human')
    // 反應快的那三成（一般難度三成的人馬上處理、其餘慢 20–60 秒）
    ;(bot.data.brain as { abDelay: number }).abDelay = 0
    giveItem(g, u, makeItem('antibodyKit'))
    applyBuff(g, u, 'bf.prion', undefined, null)
    run(h, 20 * 8)
    expect(getBuff(u, 'bf.prion')).toBeTruthy()
    applyBuff(g, u, 'bf.parasite', undefined, null)
    getBuff(u, 'bf.parasite')!.data = { told: true }
    let cured = false
    run(h, 20 * 8, () => (cured = !getBuff(u, 'bf.parasite')))
    expect(cured).toBe(true)
    expect(getBuff(u, 'bf.containedParasite')).toBeTruthy()
  })

  it('沒有抗體包：去醫療補給拿', () => {
    const { h, g, bot, u } = setup('human', { seed: 91 })
    ;(bot.data.brain as { abDelay: number }).abDelay = 0
    restockAll(g)
    applyBuff(g, u, 'bf.parasite', undefined, null)
    getBuff(u, 'bf.parasite')!.data = { told: true }
    let going = false
    run(h, 20 * 5, () => (going = brain(bot).goal?.k === 'buy' && brain(bot).goal?.item === 'antibodyKit'))
    expect(going).toBe(true)
  })
})

describe('第 8 輪：「錯誤」報告交叉消去', () => {
  it('錯誤名單扣掉驗過乾淨的人只剩一人 = 仿生人：不抽他、不指認他、不公開說', () => {
    const { h, bot, people } = setup('human')
    const [a, b] = people
    bot.gitReports.push({ time: 1, names: [bot.name, a.name, b.name], result: 'error' })
    bot.gitReports.push({ time: 2, names: [a.name, '路人甲'], result: 'clean' })
    // 交叉消去不會讓「有感染」的硬證據改指向他
    bot.gitReports.push({ time: 3, names: [bot.name, b.name], result: 'infected' })
    const said = botSays(h, bot, 20 * 5).map((l) => l.split('|')[0])
    expect(brain(bot).android).toBe(b.name)
    expect(said).not.toContain('@play1.bot.accuse')
    expect(said).toEqual(['@play1.bot.gitError', '@play1.bot.gitClean', '@play1.bot.gitInfected'])
  })
})

describe('第 8 輪：通訊病毒換名期間不指認', () => {
  it('名字正被換掉時：只公布結果、不指認；恢復後的新報告才照常指認', () => {
    const { h, bot, people } = setup('human')
    const [a, b] = people
    // 換名中（events.ts 的通訊病毒：shownBase 有值）
    b.data.shownBase = 'Someone'
    bot.gitReports.push({ time: 1, names: [bot.name, a.name], result: 'infected' })
    const during = botSays(h, bot, 20 * 3).map((l) => l.split('|')[0])
    expect(during).toEqual(['@play1.bot.gitInfected'])
    b.data.shownBase = undefined
    bot.gitReports.push({ time: 2, names: [b.name, '路人甲'], result: 'clean' })
    const after = botSays(h, bot, 20 * 3).map((l) => l.split('|')[0])
    expect(after).toEqual(['@play1.bot.gitClean', '@play1.bot.accuse'])
  })
})

describe('第 8 輪：異類偽裝', () => {
  it('驗血報告：名單裡沒有自己人就照實說；有自己人時不會說「有感染」（謊報乾淨或不吭聲）', () => {
    for (let seed = 1; seed <= 4; seed++) {
      const { h, bot, people } = setup('xeno', { seed })
      const [a, b] = people
      bot.gitReports.push({ time: 1, names: [a.name, b.name], result: 'clean' })
      bot.gitReports.push({ time: 2, names: [bot.name, a.name, b.name], result: 'infected' })
      const said = botSays(h, bot, 20 * 5).map((l) => l.split('|')[0])
      expect(said[0]).toBe('@play1.bot.gitClean')
      expect(said).not.toContain('@play1.bot.gitInfected')
      expect(said.length).toBeLessThanOrEqual(2)
      // 另一方的異類造成的感染（名單裡沒有自己人）：照實說
      bot.gitReports.push({ time: 3, names: [a.name, '路人乙'], result: 'infected' })
      expect(botSays(h, bot, 20 * 3).map((l) => l.split('|')[0])).toContain('@play1.bot.gitInfected')
    }
  })

  it('怪物形態：有人看著就不變回人形（先躲開），沒人看到才變回人形', () => {
    const { h, g, bot, people, u, zone } = setup('xeno', { humans: 3 })
    // 變成異形形態
    u.order = { k: 'cast', a: 'xeno.form' }
    let m: Ent | undefined
    run(h, 20 * 8, () => !(m = g.mainOf(bot))!.tags.has('personnel'))
    m = g.mainOf(bot)!
    expect(m.tags.has('personnel')).toBe(false)
    m.maxHp = m.hp = 1e6
    bot.data.botShiftAt = -100
    // 開始變回人形的那一刻，12 公尺內看得到的人數（應該一直是 0：有人看著就先躲開，躲到沒人看得到才變回人形）
    const seenAtRevert: number[] = []
    let casting = false
    const watch = () => {
      const me = g.mainOf(bot)!
      const c = (me.cast?.ability ?? '') === 'xeno.human'
      if (c && !casting) seenAtRevert.push(people.filter((p) => bot.view.visible.has(p.main) && Math.hypot(g.mainOf(p)!.x - me.x, g.mainOf(p)!.y - me.y) < 12).length)
      casting = c
      return me.tags.has('personnel')
    }
    // 一群人一直跟在旁邊（每 5 秒把人移到牠身邊）：不變回人形
    for (let k = 0; k < 6; k++) {
      const me = g.mainOf(bot)!
      for (const [i, p] of people.entries()) place(g, g.mainOf(p)!, zone, me.x + 4 + i, me.y + (i - 1) * 2)
      run(h, 20 * 5, watch)
    }
    expect(seenAtRevert.every((n) => n === 0)).toBe(true)
    // 大家都走了：沒人看到就變回人形
    for (const p of people) {
      const at = elsewhere(g, zone)
      place(g, g.mainOf(p)!, at.zone, at.x, at.y)
    }
    let reverted = false
    run(h, 20 * 40, () => (reverted = watch()))
    expect(reverted).toBe(true)
    expect(seenAtRevert.every((n) => n === 0)).toBe(true)
  })

  it('跟蹤時保持 6–8 公尺（以前貼在 3 公尺）', () => {
    const { h, g, bot, people, u, zone, spot } = setup('xeno', { humans: 3 })
    const [a, b, c] = people.map((p) => g.mainOf(p)!)
    place(g, a, zone, spot.x + 3, spot.y)
    place(g, b, zone, spot.x + 3, spot.y + 2.5)
    // 第三個人移到別的站（不然 AI 會去找落單的他下手）
    const other = elsewhere(g, zone)
    place(g, c, other.zone, other.x, other.y)
    // 寬限期、跟蹤的等待時間都過了；這兩個人先不下手（brain.skip），只看跟蹤的距離
    run(h, 20 * 2)
    const skip = (bot.data.brain as { skip: Map<number, number> }).skip
    skip.set(a.id, 1e9)
    skip.set(b.id, 1e9)
    run(h, 20 * Math.max(NORMAL_EVIL_START, STALK_AFTER) + 20 * 5)
    const ds: number[] = []
    run(h, 20 * 40, () => {
      const me = g.mainOf(bot)!
      if (g.world.tick % 10 === 0) ds.push(Math.min(Math.hypot(me.x - a.x, me.y - a.y), Math.hypot(me.x - b.x, me.y - b.y)))
    })
    expect(g.mainOf(bot)!.tags.has('personnel')).toBe(true)
    // 走到 9 公尺內之後：不再貼近到 4 公尺內，大部分時間離最近的人 5–9 公尺
    const from = ds.findIndex((d) => d <= 9)
    expect(from).toBeGreaterThanOrEqual(0)
    const after = ds.slice(from)
    expect(Math.min(...after)).toBeGreaterThanOrEqual(4)
    expect(after.filter((d) => d >= 5 && d <= 9).length / after.length).toBeGreaterThan(0.8)
    void u
  })

  it('人形被打、旁邊還有別人看著：不當眾變身，和人類方一樣用人形還手', () => {
    const { h, g, bot, people, u, zone, spot } = setup('xeno', { seed: 3131, humans: 3 })
    const [m, w] = people.map((p) => g.mainOf(p)!)
    place(g, m, zone, spot.x + 3, spot.y)
    place(g, w, zone, spot.x - 3, spot.y + 1)
    run(h, 20 * 2)
    m.order = { k: 'attack', e: u.id }
    damage(g, m, u, 60)
    let shifted = false
    let fired = false
    run(h, 20 * 4, () => {
      const me = g.mainOf(bot)!
      shifted ||= !me.tags.has('personnel') || (me.cast?.ability ?? '').startsWith('xeno.form')
      fired ||= me.order?.k === 'attack' && me.order.e === m.id
      return shifted
    })
    expect(shifted).toBe(false)
    expect(fired).toBe(true)
  })
})

describe('第 8 輪：解析器、結伴', () => {
  it('解析器放在離別人 2 公尺以外（放在真人腳邊會讓他的販賣介面自己打開）', () => {
    const { h, g, bot, people, u, zone } = setup('human')
    const m = g.mainOf(people[0])!
    place(g, m, zone, u.x + 1, u.y)
    const r = makeItem('gitResolver')
    r.data = { sample: { slots: [], keys: ['p9'], names: ['路人甲'], r: 1 } }
    giveItem(g, u, r)
    let dev: Ent | undefined
    run(h, 20 * 15, () => !!(dev = g.world.inZone(zone).find((e) => e.alive && e.data.vendor === 'gitResolver' && e.owner === bot.slot)))
    expect(dev).toBeTruthy()
    expect(Math.hypot(dev!.x - m.x, dev!.y - m.y) - m.radius).toBeGreaterThanOrEqual(2)
  })

  it('沒事做：跟著一個沒有嫌疑的人，保持 4–6 公尺', () => {
    const { h, g, bot, people, u, zone } = setup('human')
    // 喜歡結伴的個性（六成的 AI）
    bot.data.botSocial = true
    const m = g.mainOf(people[0])!
    place(g, m, zone, u.x + 10, u.y)
    const other = elsewhere(g, zone)
    place(g, g.mainOf(people[1])!, other.zone, other.x, other.y)
    let near = 0
    run(h, 20 * 90, () => {
      const d = Math.hypot(g.mainOf(bot)!.x - m.x, g.mainOf(bot)!.y - m.y)
      if (d >= 3 && d <= 7) near++
      return near > 20 * 10
    })
    expect(near).toBeGreaterThan(20 * 10)
  })
})

describe('第 8 輪：末日以外的危險', () => {
  it('翠原星地表：不是末日也躲隕擊的紅色警戒圈', () => {
    const { h, g, u } = setup('human')
    const vz = g.world.zones.find((z) => z.key === 'verdance')!
    const sp = openSpot(g, vz.id, 4)
    place(g, u, vz.id, sp.x, sp.y)
    const S = stationsOf(g)
    ;(S.warns ??= []).push({ zone: vz.id, x: u.x, y: u.y, at: g.time + 10 })
    const x0 = u.x
    const y0 = u.y
    run(h, 8 * 20)
    expect(Math.hypot(u.x - x0, u.y - y0)).toBeGreaterThan(IMPACT_R)
  })

  it('被無人機群圍攻、生命不到 30% 的站：撤到翠原星（救生艙）', () => {
    const { h, g, bot, u, zone } = setup('human', { stations: [] })
    const z = g.world.zones[zone]
    const se = g.world.get(z.spaceEnt)!
    const dev = g.world.inZone(zone).find((e) => e.alive && e.data.vendor === 'escapePod')
    expect(dev).toBeTruthy()
    place(g, u, zone, dev!.x, dev!.y + 5)
    u.data.god = true
    se.hp = se.maxHp * 0.2
    const ev = g.data.events as { siege: Map<number, number> }
    let started = false
    run(h, 20 * 30, () => {
      // 胡蜂一直在打（規則那邊的圍攻狀態：被打到後 5 秒內算圍攻中）
      ev.siege.set(zone, g.time)
      return (started = !!(bot.data.brain as { evac: { siege?: boolean } | null }).evac?.siege)
    })
    expect(started).toBe(true)
    // 生命還多的站：不撤
    const b2 = setup('human', { stations: [], seed: 78 })
    const z2 = b2.g.world.zones[b2.zone]
    const ev2 = b2.g.data.events as { siege: Map<number, number> }
    let started2 = false
    run(b2.h, 20 * 10, () => {
      ev2.siege.set(z2.id, b2.g.time)
      return (started2 = !!(b2.bot.data.brain as { evac: unknown }).evac)
    })
    expect(started2).toBe(false)
  })
})

describe('第 8 輪：簡單難度', () => {
  it('異形可以進化到第二階（以前上限 1 等於永遠不進化）', () => {
    const { h, g, bot, people, zone } = setup('xeno', { aiLevel: 'easy' })
    for (const p of people) {
      const at = elsewhere(g, zone)
      place(g, g.mainOf(p)!, at.zone, at.x, at.y)
    }
    bot.ep = XENO_T2_EP + 10
    let to = ''
    run(h, 20 * 40, () => !!(to = (bot.data.evolveTo as string | undefined) ?? ''))
    expect(FORMS.get(to)?.tier).toBe(2)
  })

  it('末日開始 3 分鐘後，簡單難度的異類 AI 也全力出手', () => {
    const { g } = setup('xeno', { aiLevel: 'easy' })
    expect(evilAllOut(g)).toBe(false)
    const ev = g.data.events as { apoc: string; apocStart: number; apocWarned: boolean }
    ev.apoc = 'fleet'
    ev.apocWarned = true
    ev.apocStart = g.time
    expect(evilAllOut(g)).toBe(false)
    ev.apocStart = g.time - EASY_DOOM_ALLOUT - 1
    expect(evilAllOut(g)).toBe(true)
  })

  it('單機練習：親眼看到真人的怪物形態傷人後，人類方 AI 也會主動打他', () => {
    const s = new GameServer(PRACTICE_ROOM, { send: () => {} }, 9101, 9101 ^ 0x5bd1e995)
    s.onJoin(LOCAL_PEER)
    s.onMessage(LOCAL_PEER, encode({ t: 'hello', name: 'Me', color: 0, ver: 1, token: 'tokMexxxxxxx' }))
    s.onMessage(LOCAL_PEER, encode({ t: 'settings', s: { bots: 2, aiLevel: 'easy', eventMult: 0, npcCrew: 0 } }))
    s.onMessage(LOCAL_PEER, encode({ t: 'start', role: 'human' }))
    const g = s.game!
    installXenoSystems(g)
    const ps = g.allPlayers()
    for (const p of ps) g.setRole(p, 'human')
    const crewBot = ps.find((p) => p.bot)!
    const human = ps.find((p) => !p.bot)!
    const z = g.world.zones.find((q) => q.key === 'nyx')!
    const spot = openSpot(g, z.id)
    const u = g.mainOf(crewBot)!
    g.setRole(human, 'xeno')
    const m = g.mainOf(human)!
    morph(g, m, 'xeno.protoform')
    m.anon = true
    m.maxHp = m.hp = 1e6
    m.data.frozen = true
    const shoots = (): boolean => {
      place(g, u, z.id, spot.x, spot.y)
      place(g, m, z.id, u.x + 4, u.y)
      const br = crewBot.data.brain as { goal: unknown } | undefined
      if (br) br.goal = null
      let hit = false
      for (let i = 0; i < 20 * 8 && !hit; i++) {
        s.tick()
        if (u.order?.k === 'attack' && u.order.e === m.id) hit = true
      }
      return hit
    }
    expect(g.time).toBeLessThan(EASY_SPARE_UNTIL)
    expect(shoots()).toBe(false)
    brain(crewBot).sawAtk.add(human.slot)
    expect(shoots()).toBe(true)
  })
})

describe('第 8 輪：AI 閒話字串', () => {
  it('每一句都有中英文', () => {
    const keys = [
      ...Array.from({ length: HI_N }, (_, i) => 'ai8.bot.hi.' + (i + 1)),
      ...Array.from({ length: HIT_N }, (_, i) => 'ai8.bot.hit.' + (i + 1)),
      ...Array.from({ length: ALIBI_N }, (_, i) => 'ai8.bot.alibi.' + (i + 1)),
      ...Array.from({ length: MONSTER_N }, (_, i) => 'ai8.bot.monster.' + (i + 1)),
      'ai8.bot.siege',
      'ai8.bot.parasite',
    ]
    for (const k of keys) expect([k, hasString('zh', k), hasString('en', k)]).toEqual([k, true, true])
  })
})

// ───────── 審查 B 的身分破綻指標（小樣本）─────────

interface Tell {
  role: string
  vendor: boolean
  suit: boolean
  spoke: boolean
}

/** 全 AI 的多人局（主機也交給 AI），跑 minutes 分鐘：每位 AI 開局 10 分鐘內有沒有去過販賣機、15 分鐘內有沒有穿過防護服、有沒有在全體頻道說過話 */
function tells(seed: number, n: number, minutes: number): Tell[] {
  const { h } = Harness.started(1, seed, { bots: n - 1, npcCrew: 0 })
  const g = h.server.game!
  g.players[0].bot = true
  const ps = g.allPlayers().filter((p) => !p.spectator)
  const role0 = new Map(ps.map((p) => [p.slot, p.role === 'xeno' || p.role === 'mutant' ? p.role : 'crew']))
  const spoke = new Set<number>()
  const orig = g.handleChat.bind(g)
  g.handleChat = (slot: number, ch: string, text: string) => {
    if (ch === 'all') spoke.add(slot)
    return orig(slot, ch as never, text)
  }
  const vendor = new Set<number>()
  const suit = new Set<number>()
  for (let i = 0; i < minutes * 60 * 20 && !g.ended; i++) {
    h.ticks(1)
    for (const r of h.raw.values()) r.length = 0
    for (const c of h.clients.values()) {
      c.snaps.length = 0
      c.inbox.length = 0
    }
    if (i % 20) continue
    for (const p of ps) {
      const u = g.mainOf(p)
      if (!u || !p.alive || p.spawnOf) continue
      const br = p.data.brain as { samplers: number } | undefined
      // 去過販賣機：拿過檢測器、去拿過防護服（botSuitTried）、身上有販賣機的東西
      if (g.time < 600 && ((br?.samplers ?? 0) > 0 || p.data.botSuitTried || u.inv?.some((x) => x?.id === 'geneSampler' || x?.id === 'gitResolver' || x?.id === 'antibodyKit'))) vendor.add(p.slot)
      if (g.time < 900 && u.suit) suit.add(p.slot)
    }
  }
  return ps.filter((p) => p.alive || g.time >= 600).map((p) => ({ role: role0.get(p.slot)!, vendor: vendor.has(p.slot), suit: suit.has(p.slot), spoke: spoke.has(p.slot) }))
}

describe('第 8 輪：身分破綻（審查 B 的觀察者規則，小樣本）', () => {
  it('異類 AI 和人類方 AI 一樣去販賣機、穿防護服、說話（以前異類 0%：「10 分鐘內沒去過販賣機」抓異類的準確率 87%）', () => {
    const all: Tell[] = []
    for (const seed of [5000, 12919, 20838]) all.push(...tells(seed, 8, 15))
    const evil = all.filter((t) => t.role !== 'crew')
    const crew = all.filter((t) => t.role === 'crew')
    expect(evil.length).toBeGreaterThan(0)
    const rate = (l: Tell[], k: keyof Omit<Tell, 'role'>) => l.filter((t) => t[k]).length / Math.max(1, l.length)
    // 每一項異類的比例不能和人類方差太多（以前是 0% 對 72–99%）
    expect(rate(evil, 'vendor')).toBeGreaterThanOrEqual(rate(crew, 'vendor') - 0.35)
    expect(rate(evil, 'suit')).toBeGreaterThanOrEqual(rate(crew, 'suit') - 0.4)
    expect(rate(evil, 'spoke')).toBeGreaterThan(0)
    // 觀察者規則「10 分鐘內沒去過販賣機」：抓到的人裡異類的比例不再壓倒性
    const caught = all.filter((t) => !t.vendor)
    if (caught.length >= 3) expect(caught.filter((t) => t.role !== 'crew').length / caught.length).toBeLessThan(0.75)
  }, 300000)
})
