// 練習 AI 的驗血：拿到檢測器就主動找看得到的人抽血（抽血不會被自己打斷）、報告後複驗縮小範圍、
// 指認條件（某份有感染名單扣掉自己與驗過乾淨的人只剩一人，或兩份有感染名單的交集只剩一人）、同一份結果只公布一次；
// 只看外觀（匿名形態不抽、偽裝成 Bob 的人就當成 Bob）
import { describe, expect, it } from 'vitest'
import { Harness } from './helpers/harness'
import { giveItem, makeItem, morph } from '../../src/sim/systems/items'
import { restockAll } from '../../src/sim/systems/vendors'
import { installXenoSystems } from '../../src/sim/scripts/xeno'
import { XAB } from '../../src/shared/content/forms/xeno'
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

/** 不動的真人（主機＋humans-1 位）＋一個人類 AI，全部是人類；AI 站在女帝號的一塊空地上 */
function setup(seed = 77, humans = 2) {
  const { h, cs } = Harness.started(humans, seed, { bots: 1, eventMult: 0, npcCrew: 0 })
  const g = h.server.game!
  const ps = g.allPlayers()
  for (const p of ps) g.setRole(p, 'human')
  const bot = ps.find((p) => p.bot)!
  const people = ps.filter((p) => !p.bot)
  const u = g.mainOf(bot)!
  const z = g.world.zones.find((q) => q.key === 'nyx')!
  // 找一塊四周 5 公尺看得到的空地
  const spot = openSpot(g, z.id)
  place(g, u, z.id, spot.x, spot.y)
  u.inv!.fill(null)
  for (const p of people) g.mainOf(p)!.inv!.fill(null)
  return { h, cs, g, ps, bot, people, u, zone: z.id, spot }
}

function openSpot(g: Game, zone: number): { x: number; y: number } {
  const z = g.world.zones[zone]
  const L = z.layout!
  for (let y = 6; y < L.h - 6; y++)
    for (let x = 6; x < L.w - 6; x++) {
      const cx = x + 0.5
      const cy = y + 0.5
      let ok = true
      for (let dy = -5; dy <= 5 && ok; dy++) for (let dx = -5; dx <= 5 && ok; dx++) if (z.nav!.blockedAt(cx + dx, cy + dy)) ok = false
      if (ok) return { x: cx, y: cy }
    }
  throw new Error('找不到空地')
}

function place(g: Game, u: Ent, zone: number, x: number, y: number): void {
  g.world.relocate(u, zone, x, y)
  u.order = null
  u.queue.length = 0
  u.path = null
}

const samplerOf = (u: Ent) => u.inv!.find((x) => x?.id === 'geneSampler' || x?.id === 'gitResolver')
const sampleNames = (u: Ent): string[] => ((samplerOf(u)?.data as { sample?: { names: string[] } } | undefined)?.sample?.names ?? []).slice()

/** AI 在全體頻道說的話（系統 key＋參數）*/
function botSays(h: Harness, g: Game, bot: GamePlayer, n: number, until?: (lines: string[]) => boolean): string[] {
  const out: string[] = []
  const host = h.clients.get('local')!
  for (let i = 0; i < n; i++) {
    h.ticks(1)
    for (const m of host.inbox) if (m.t === 'chat') for (const l of m.lines) if (l.from === bot.name && l.ch === 'all') out.push(l.text)
    host.inbox.length = 0
    for (const r of h.raw.values()) r.length = 0
    if (until?.(out)) break
  }
  void g
  return out
}

describe('練習 AI：主動抽血', () => {
  it('拿著檢測器：自己走過去抽看得到的人（10 公尺外也會去）、抽滿三份放解析器、領到報告並公布', () => {
    const { h, g, bot, people, u, zone, spot } = setup()
    place(g, g.mainOf(people[0])!, zone, spot.x + 4, spot.y)
    place(g, g.mainOf(people[1])!, zone, spot.x - 3, spot.y + 4)
    // 第二個人站遠一點：在視野裡、但超過舊的 10 公尺範圍
    const far = g.mainOf(people[1])!
    const zz = g.world.zones[zone]
    for (let d = 14; d >= 10.5; d -= 0.5) {
      const pt = zz.nav!.nearestOpen(spot.x + d, spot.y)
      if (pt && zz.nav!.los(spot.x, spot.y, pt.x, pt.y, true) && Math.hypot(pt.x - spot.x, pt.y - spot.y) > 10.2) {
        place(g, far, zone, pt.x, pt.y)
        break
      }
    }
    giveItem(g, u, makeItem('geneSampler'))
    let names: string[] = []
    run(h, 20 * 120, () => {
      if (samplerOf(u)?.id === 'geneSampler') names = sampleNames(u)
      return bot.gitReports.length > 0
    })
    expect(bot.gitReports.length).toBe(1)
    // 三份樣本：兩位真人＋自己（每個人只抽一次）
    expect(new Set(bot.gitReports[0].names)).toEqual(new Set([bot.name, ...people.map((p) => p.name)]))
    expect(bot.gitReports[0].result).toBe('clean')
    expect(names.length).toBeGreaterThanOrEqual(2)
  })

  it('抽血的 3 秒不會被自己的下一個指令打斷：每次施法都抽到一份', () => {
    const { h, g, bot, people, u, zone, spot } = setup(91)
    place(g, g.mainOf(people[0])!, zone, spot.x + 3, spot.y)
    place(g, g.mainOf(people[1])!, zone, spot.x - 3, spot.y)
    giveItem(g, u, makeItem('geneSampler'))
    let casts = 0
    let wasCasting = false
    run(h, 20 * 60, () => {
      const c = !!u.cast && u.cast.ability === 'ab.item.geneSampler'
      if (c && !wasCasting) casts++
      wasCasting = c
      return samplerOf(u)?.id === 'gitResolver' || g.world.inZone(zone).some((e) => e.data.vendor === 'gitResolver' && e.owner === bot.slot)
    })
    expect(bot.stats.tests).toBe(3)
    expect(casts).toBe(3)
  })

  it('只看外觀：匿名形態的異形不抽；化身成 Bob 的異形就當成 Bob 抽（樣本上記 Bob 的名字）', () => {
    const { h, g, people, u, zone, spot } = setup(4242, 3)
    installXenoSystems(g)
    const [hostP, bobP, xp] = people
    g.setRole(xp, 'xeno')
    const x = g.mainOf(xp)!
    morph(g, x, 'xeno.mimic')
    x.anon = true
    x.data.noRegen = true
    x.maxHp = x.hp = 1e6
    place(g, x, zone, spot.x + 3, spot.y)
    // 主機和 Bob 先藏到別處（看不到）
    const L = g.world.zones[zone].layout!
    const nav = g.world.zones[zone].nav!
    const away = nav.nearestOpen(spot.x > L.w / 2 ? 3 : L.w - 3, spot.y > L.h / 2 ? 3 : L.h - 3)!
    const bob = g.mainOf(bobP)!
    place(g, bob, zone, away.x, away.y)
    place(g, g.mainOf(hostP)!, zone, away.x, away.y)
    expect(nav.los(spot.x, spot.y, away.x, away.y, true) && Math.hypot(away.x - spot.x, away.y - spot.y) < 20).toBe(false)
    giveItem(g, u, makeItem('geneSampler'))
    const sampled = new Set<number>()
    run(h, 20 * 20, () => {
      if (u.cast?.ability === 'ab.item.geneSampler') sampled.add(u.cast.e)
    })
    // 匿名形態不是「看起來像一個人」：不會對它抽血，名單上也沒有它
    expect(sampled.has(x.id)).toBe(false)
    expect(sampleNames(u).some((n) => n === xp.name || n.startsWith('\u0001'))).toBe(false)
    // 異形化身成 Bob（Bob 本人還在遠處）
    place(g, x, bob.zone, bob.x + 1.2, bob.y)
    x.mp = x.maxMp
    x.order = { k: 'cast', a: XAB.masks, e: bob.id }
    h.ticks(16)
    expect((x.data.fake as { owner: number }).owner).toBe(bobP.slot)
    // 站到 AI 旁邊（AI 可能已經走開去找人了）
    const near = nav.nearestOpen(u.x + 2, u.y) ?? { x: u.x, y: u.y }
    place(g, x, u.zone, near.x, near.y)
    x.order = { k: 'hold', x: x.x, y: x.y }
    run(h, 20 * 30, () => sampleNames(u).includes(bobP.name))
    expect(sampleNames(u)).toContain(bobP.name)
    expect(sampleNames(u)).not.toContain(xp.name)
  })
})

describe('練習 AI：指認與複驗', () => {
  it('(a) 有感染名單扣掉自己與驗過乾淨的人只剩一人：公開指認', () => {
    const { h, g, bot, people } = setup()
    const [a, b] = people
    bot.gitReports.push({ time: 1, names: [b.name, '路人甲'], result: 'clean' })
    bot.gitReports.push({ time: 2, names: [bot.name, a.name, b.name], result: 'infected' })
    const said = botSays(h, g, bot, 60, (l) => l.length >= 3)
    expect(said.map((l) => l.split('|')[0])).toEqual(['@play1.bot.gitClean', '@play1.bot.gitInfected', '@play1.bot.accuse'])
    expect(said[2]).toBe('@play1.bot.accuse|name=' + a.name)
  })

  it('(b) 兩份有感染名單的交集只剩一人：公開指認；只有一份、還有兩個人可疑時不指認', () => {
    const { h, g, bot, people } = setup()
    const [a, b] = people
    bot.gitReports.push({ time: 1, names: [bot.name, a.name, b.name], result: 'infected' })
    const first = botSays(h, g, bot, 60)
    expect(first.map((l) => l.split('|')[0])).toEqual(['@play1.bot.gitInfected'])
    bot.gitReports.push({ time: 2, names: [a.name, '路人乙', '路人丙'], result: 'infected' })
    const second = botSays(h, g, bot, 60, (l) => l.length >= 2)
    expect(second.map((l) => l.split('|')[0])).toEqual(['@play1.bot.gitInfected', '@play1.bot.accuse'])
    expect(second[1]).toBe('@play1.bot.accuse|name=' + a.name)
  })

  it('不洗頻：同一份結果只公布一次；同一個人只指認一次', () => {
    const { h, g, bot, people } = setup()
    const [a] = people
    for (let i = 0; i < 3; i++) bot.gitReports.push({ time: i, names: [bot.name, a.name], result: 'infected' })
    // 名單順序不同也是同一份
    bot.gitReports.push({ time: 9, names: [a.name, bot.name], result: 'infected' })
    const said = botSays(h, g, bot, 20 * 10)
    expect(said.map((l) => l.split('|')[0])).toEqual(['@play1.bot.gitInfected', '@play1.bot.accuse'])
  })

  it('不洗頻：兩個 AI 驗出一模一樣的結果，全體頻道只出現一次（各自的推理照樣用這份結果）', () => {
    const { h, cs } = Harness.started(1, 77, { bots: 2, eventMult: 0, npcCrew: 0 })
    const g = h.server.game!
    const ps = g.allPlayers()
    for (const p of ps) g.setRole(p, 'human')
    const [b1, b2] = ps.filter((p) => p.bot)
    const host = ps.find((p) => !p.bot)!
    const names = [b1.name, b2.name, host.name]
    b1.gitReports.push({ time: 1, names: [...names], result: 'clean' })
    b2.gitReports.push({ time: 1, names: [names[2], names[0], names[1]], result: 'clean' })
    const lines: string[] = []
    for (let i = 0; i < 20 * 5; i++) {
      h.ticks(1)
      for (const m of cs[0].inbox) if (m.t === 'chat') for (const l of m.lines) if ((l.from === b1.name || l.from === b2.name) && l.ch === 'all') lines.push(l.text)
      cs[0].inbox.length = 0
    }
    expect(lines.filter((l) => l.startsWith('@play1.bot.gitClean')).length).toBe(1)
    for (const b of [b1, b2]) expect((b.data.brain as { cleared: Set<string> }).cleared.has(host.name)).toBe(true)
  })

  it('有感染但認不出是誰：再拿一支檢測器複驗，一份樣本只放一名嫌疑人', () => {
    const { h, g, bot, people, u, zone, spot } = setup(91)
    const [a, b] = people
    // 檢測器的販賣機已經上架（開局 7 分鐘後才有）
    restockAll(g)
    const vendor = [...g.world.inZone(zone)].find((e) => e.alive && (e.data.stock as { item: string }[] | undefined)?.some((s) => s.item === 'geneSampler'))!
    expect(vendor).toBeTruthy()
    bot.gitReports.push({ time: 1, names: [bot.name, a.name, b.name], result: 'infected' })
    let got = false
    run(h, 20 * 120, () => (got = samplerOf(u)?.id === 'geneSampler'))
    expect(got).toBe(true)
    // 兩名嫌疑人都站在旁邊：先抽一名嫌疑人，接著抽自己（不是嫌疑人），不會把兩名嫌疑人放進同一份樣本
    place(g, u, zone, spot.x, spot.y)
    place(g, g.mainOf(a)!, zone, spot.x + 2.5, spot.y)
    place(g, g.mainOf(b)!, zone, spot.x - 2.5, spot.y)
    let names: string[] = []
    run(h, 20 * 40, () => {
      names = sampleNames(u)
      return names.length >= 2
    })
    expect(names.length).toBe(2)
    expect(names.filter((n) => n === a.name || n === b.name).length).toBe(1)
    expect(names).toContain(bot.name)
  })
})
