// 第 6 輪（付費玩家第一晚審查）：練習／補位 AI 讓玩家「死得不明不白」的修正
// - 誤傷不升級成互打：波及、持續傷害不還手；瞄準自己打了好幾下才還手（B P1）
// - 被 NPC（船員、無人機）打：躲開，不追著打（B P1）
// - 範圍武器：目標旁邊有人、NPC 時不開火（B P1）
// - 只憑兩份驗血名單的交集：只公開提醒、盯著，不開火；親眼看到他對人出手才指認（A P1）
// - 末日：撤到翠原星地表（救生艙）；地表上躲隕擊的紅色警戒圈（A P1）
import { describe, expect, it } from 'vitest'
import { Harness } from './helpers/harness'
import { GameServer, LOCAL_PEER } from '../../src/sim/server'
import { encode } from '../../src/shared/protocol/codec'
import { PRACTICE_ROOM } from '../../src/shared/protocol/messages'
import { installXenoSystems } from '../../src/sim/scripts/xeno'
import { spawnCreature } from '../../src/sim/ai/creatures'
import { damage } from '../../src/sim/systems/damage'
import { giveItem, makeItem, morph, wearSuit } from '../../src/sim/systems/items'
import { stationsOf, IMPACT_R } from '../../src/sim/systems/stations'
import { hasString } from '../../src/ui/i18n'
import '../../src/ui/strings/sim8'
import type { Ent } from '../../src/sim/ent'
import type { Game, GamePlayer } from '../../src/sim/game'

function run(h: Harness, n: number, each?: () => boolean | void): void {
  for (let i = 0; i < n; i++) {
    h.ticks(1)
    for (const r of h.raw.values()) r.length = 0
    for (const c of h.clients.values()) {
      c.snaps.length = 0
      if (c.peer !== LOCAL_PEER) c.inbox.length = 0
    }
    if (each?.()) return
  }
}

function place(g: Game, u: Ent, zone: number, x: number, y: number): void {
  const z = g.world.zones[zone]
  const n = z.nav!.nearestOpen(x, y) ?? { x, y }
  g.world.relocate(u, zone, n.x, n.y)
  u.order = null
  u.queue.length = 0
  u.path = null
}

function openSpot(g: Game, zone: number, r = 5): { x: number; y: number } {
  const z = g.world.zones[zone]
  const L = z.layout!
  for (let y = r + 1; y < L.h - r - 1; y++)
    for (let x = r + 1; x < L.w - r - 1; x++) {
      const cx = x + 0.5
      const cy = y + 0.5
      let ok = true
      for (let dy = -r; dy <= r && ok; dy++) for (let dx = -r; dx <= r && ok; dx++) if (z.nav!.blockedAt(cx + dx, cy + dy)) ok = false
      if (ok && g.world.query(zone, cx, cy, r + 6).some((e) => !e.isMain && e.def.ai)) ok = false
      if (ok) return { x: cx, y: cy }
    }
  throw new Error('找不到空地')
}

/** humans 位不動的真人＋bots 個 AI，全部是人類；AI 站在女帝號的一塊空地上，大家背包清空 */
function setup(bots: number, opts: { seed?: number; humans?: number; aiLevel?: 'easy' | 'normal' } = {}) {
  const { h } = Harness.started(opts.humans ?? 2, opts.seed ?? 4242, { bots, eventMult: 0, npcCrew: 0, aiLevel: opts.aiLevel ?? 'normal', stations: [] })
  const g = h.server.game!
  const ps = g.allPlayers()
  for (const p of ps) g.setRole(p, 'human')
  const z = g.world.zones.find((q) => q.key === 'nyx')!
  const spot = openSpot(g, z.id)
  const bs = ps.filter((p) => p.bot)
  const people = ps.filter((p) => !p.bot)
  bs.forEach((p, i) => {
    const u = g.mainOf(p)!
    place(g, u, z.id, spot.x + i * 2.5, spot.y)
    u.inv!.fill(null)
  })
  for (const p of people) {
    const m = g.mainOf(p)!
    m.inv!.fill(null)
    m.data.frozen = true
    place(g, m, z.id, spot.x - 4, spot.y + 4)
  }
  return { h, g, bs, people, zone: z.id, spot }
}

/** n 秒內 bot 的單位有沒有對 target 下過攻擊命令 */
function attacked(h: Harness, g: Game, bot: GamePlayer, target: Ent, s: number, each?: () => void): boolean {
  let hit = false
  run(h, s * 20, () => {
    each?.()
    const u = g.controlOf(bot)
    if (u?.order?.k === 'attack' && u.order.e === target.id) hit = true
  })
  return hit
}

describe('誤傷不升級成互打', () => {
  it('被另一個人類 AI 波及（他不是在打我）、被持續傷害打到：不還手', () => {
    const { h, g, bs } = setup(2)
    const a = g.mainOf(bs[0])!
    const b = g.mainOf(bs[1])!
    a.data.frozen = true
    let n = 0
    const hit = attacked(h, g, bs[1], a, 8, () => {
      if (n++ % 30 === 0) {
        damage(g, a, b, 25)
        damage(g, a, b, 3, { dot: true, buff: 'bf.rad.sick', kind: 'energy' })
      }
    })
    expect(hit).toBe(false)
  })

  it('瞄準我打了好幾下：還手', () => {
    const { h, g, bs } = setup(2)
    const a = g.mainOf(bs[0])!
    const b = g.mainOf(bs[1])!
    a.data.frozen = true
    a.order = { k: 'attack', e: b.id }
    let n = 0
    const hit = attacked(h, g, bs[1], a, 6, () => {
      if (n++ % 20 === 0) damage(g, a, b, 20)
    })
    expect(hit).toBe(true)
  })

  it('被 NPC 船員打：躲開，不追著打', () => {
    const { h, g, bs, zone } = setup(1)
    const b = g.mainOf(bs[0])!
    const crew = spawnCreature(g, 'npc.crew', zone, b.x + 3, b.y)!
    crew.data.crew = true
    crew.data.frozen = true
    crew.order = { k: 'attack', e: b.id }
    const d0 = Math.hypot(b.x - crew.x, b.y - crew.y)
    let n = 0
    let hunted = false
    run(h, 5 * 20, () => {
      if (n++ % 25 === 0) damage(g, crew, b, 15)
      const goal = (bs[0].data.brain as { goal?: { k: string; e?: number } }).goal
      if (goal?.k === 'hunt' && goal.e === crew.id) hunted = true
    })
    // （單位本身閒著時會自動還擊打它的 NPC，那是所有玩家單位共通的；AI 自己不會追上去打）
    expect(hunted).toBe(false)
    expect(Math.hypot(b.x - crew.x, b.y - crew.y)).toBeGreaterThan(d0 + 1)
  })

  it('範圍武器：目標旁邊有人就不開火，人走開才打', () => {
    const { h, g, bs, people, zone } = setup(1)
    let b = g.mainOf(bs[0])!
    giveItem(g, b, makeItem('suit.rocket'))
    expect(wearSuit(g, b, b.inv!.findIndex((x) => x?.id === 'suit.rocket'))).toBe(true)
    b = g.mainOf(bs[0])!
    b.data.god = true
    const mob = spawnCreature(g, 'creature.skitter', zone, b.x + 4.5, b.y)!
    mob.data.frozen = true
    const by = g.mainOf(people[0])!
    place(g, by, zone, mob.x, mob.y + 0.9)
    const hp0 = by.hp
    const m0 = mob.hp
    run(h, 6 * 20)
    expect(by.hp).toBe(hp0)
    expect(mob.hp).toBe(m0)
    place(g, by, zone, b.x - 6, b.y - 4)
    run(h, 6 * 20)
    expect(mob.hp).toBeLessThan(m0)
  })
})

describe('只憑交叉比對的嫌疑人：不開火', () => {
  it('兩份有感染名單的交集只剩一人：公開提醒、盯著，不開火；看到他對人出手才指認', () => {
    const { h, g, bs, people, zone } = setup(1, { humans: 3 })
    const bot = bs[0]
    const u = g.mainOf(bot)!
    const [A, B, C] = people
    const a = g.mainOf(A)!
    place(g, a, zone, u.x + 3, u.y)
    place(g, g.mainOf(B)!, zone, u.x + 3, u.y + 2.5)
    bot.gitReports.push({ time: 1, names: [bot.name, A.name, B.name], result: 'infected' })
    bot.gitReports.push({ time: 2, names: [bot.name, A.name, C.name], result: 'infected' })
    const host = h.clients.get(LOCAL_PEER)!
    host.inbox.length = 0
    const hp0 = a.hp
    const hit = attacked(h, g, bot, a, 10)
    const said: string[] = []
    for (const m of host.inbox) if (m.t === 'chat') for (const l of m.lines) if (l.from === bot.name) said.push(l.text.split('|')[0])
    expect(said).toContain('@play1.bot.suspect')
    expect(said).not.toContain('@play1.bot.accuse')
    expect(hit).toBe(false)
    expect(a.hp).toBe(hp0)
    // 親眼看到他攻擊一個人 = 硬證據
    const victim = g.mainOf(B)!
    const fired = attacked(h, g, bot, a, 4, () => {
      a.anim = 2
      a.animTarget = victim.id
    })
    expect(fired).toBe(true)
  })
})

describe('末日撤離', () => {
  it('末日開始：AI 走到救生艙裝置、搭救生艙撤到翠原星地表', () => {
    const { h, g, bs, zone } = setup(1)
    const u = g.mainOf(bs[0])!
    const dev = g.world.inZone(zone).find((e) => e.alive && e.data.vendor === 'escapePod')!
    expect(dev).toBeTruthy()
    // 離裝置有一段路：走過去、領到憑證後要原地站好（還在走的話準備會失敗）
    place(g, u, zone, dev.x, dev.y + 7)
    u.data.god = true
    g.startApocalypse!('fleet')
    const vz = g.world.zones.find((z) => z.key === 'verdance')!
    let at = -1
    let pod = false
    const t0 = g.time
    run(h, 150 * 20, () => {
      const m = g.mainOf(bs[0])!
      if (g.controlOf(bs[0])?.def.id === 'ship.pod') pod = true
      if (m.zone === vz.id && g.controlOf(bs[0]) === m) at = g.time
      return at >= 0
    })
    expect(at).toBeGreaterThan(0)
    // 第一次就搭上救生艙（沒有因為領完憑證還在走而準備失敗、改去開船）
    expect(pod).toBe(true)
    expect(at - t0).toBeLessThan(75)
  })

  it('翠原星地表：站在隕擊的紅色警戒圈裡就跑開', () => {
    const { h, g, bs } = setup(1)
    const vz = g.world.zones.find((z) => z.key === 'verdance')!
    const u = g.mainOf(bs[0])!
    const sp = openSpot(g, vz.id, 4)
    place(g, u, vz.id, sp.x, sp.y)
    g.startApocalypse!('orbit')
    const S = stationsOf(g)
    ;(S.warns ??= []).push({ zone: vz.id, x: u.x, y: u.y, at: g.time + 10 })
    const x0 = u.x
    const y0 = u.y
    run(h, 8 * 20)
    expect(Math.hypot(u.x - x0, u.y - y0)).toBeGreaterThan(IMPACT_R)
  })

  it('字串兩種語言都有', () => {
    for (const k of ['play1.bot.suspect', 'play1.bot.evac']) expect([k, hasString('zh', k), hasString('en', k)]).toEqual([k, true, true])
  })
})

describe('簡單練習局：新手的第一局要贏得了（第 6 輪追加）', () => {
  function practice(seed: number) {
    const s = new GameServer(PRACTICE_ROOM, { send: () => {} }, seed, seed ^ 0x5bd1e995)
    s.onJoin(LOCAL_PEER)
    s.onMessage(LOCAL_PEER, encode({ t: 'hello', name: 'Me', color: 0, ver: 1, token: 'tokMexxxxxxx' }))
    s.onMessage(LOCAL_PEER, encode({ t: 'settings', s: { bots: 2, aiLevel: 'easy', eventMult: 0, npcCrew: 0 } }))
    s.onMessage(LOCAL_PEER, encode({ t: 'start', role: 'human' }))
    const g = s.game!
    installXenoSystems(g)
    return { s, g }
  }

  it('人類方 AI 會主動打 AI 的怪物形態，真人（新手）的怪物形態照舊不主動打', () => {
    const { s, g } = practice(9101)
    expect(g.practice).toBe(true)
    const ps = g.allPlayers()
    for (const p of ps) g.setRole(p, 'human')
    const [crewBot, evilBot] = ps.filter((p) => p.bot)
    const human = ps.find((p) => !p.bot)!
    const z = g.world.zones.find((q) => q.key === 'nyx')!
    const spot = openSpot(g, z.id)
    const u = g.mainOf(crewBot)!
    place(g, u, z.id, spot.x, spot.y)
    const shoots = (owner: GamePlayer): boolean => {
      g.setRole(owner, 'xeno')
      const m = g.mainOf(owner)!
      morph(g, m, 'xeno.protoform')
      m.anon = true
      m.maxHp = m.hp = 1e6
      m.data.frozen = true
      place(g, u, z.id, spot.x, spot.y)
      place(g, m, z.id, u.x + 4, u.y)
      // 從閒著開始（閒晃的目標走完之前不會重新判斷）
      const br = crewBot.data.brain as { goal: unknown } | undefined
      if (br) br.goal = null
      let hit = false
      for (let i = 0; i < 20 * 8 && !hit; i++) {
        s.tick()
        if (u.order?.k === 'attack' && u.order.e === m.id) hit = true
      }
      g.world.relocate(m, z.id, 2, 2)
      m.data.frozen = true
      g.setRole(owner, 'human')
      return hit
    }
    expect(shoots(human)).toBe(false)
    expect(shoots(evilBot)).toBe(true)
  })
})
