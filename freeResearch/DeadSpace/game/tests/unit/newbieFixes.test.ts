// 新手試玩回饋（修正輪 A，sim 端）：簡單練習局延後毀站事件、基因檢測提早開放（w.gitAt）、抽血不因目標走開而中斷（回歸）、
// 平手原因（drawWhy）、監控掃描的文字結果、王牌飛行員的戰機位置、公開的進行中事件（w.ev）
import { describe, expect, it } from 'vitest'
import { Harness, type FakeClient } from './helpers/harness'
import { GameServer, LOCAL_PEER } from '../../src/sim/server'
import { encode } from '../../src/shared/protocol/codec'
import { PRACTICE_ROOM, type ClientMsg, type LobbySettings } from '../../src/shared/protocol/messages'
import { EASY_SAFE_UNTIL, STATION_KILLERS, eventsOf, pickEvent, publicEvents } from '../../src/sim/systems/events'
import { EASY_SAMPLER_DELAY, samplerOpenAt, type StockState } from '../../src/sim/systems/vendors'
import { giveItem, makeItem } from '../../src/sim/systems/items'
import { SCRIPTS } from '../../src/sim/systems/effects'
import { spaceOf, sweepLines } from '../../src/sim/systems/space'
import { checkVictoryNow } from '../../src/sim/systems/roleSystem'
import { SPACE_ZONE } from '../../src/sim/world'
import { roomAt } from '../../src/shared/layout'
import { STATION_BY_ID } from '../../src/shared/content/stations/index'
import { lang, sysText } from '../../src/ui/i18n'
import '../../src/ui/strings/sim6'
import type { Game, GamePlayer } from '../../src/sim/game'
import type { Ent } from '../../src/sim/ent'

function join(s: GameServer, peer: string, name: string): (m: ClientMsg) => void {
  s.onJoin(peer)
  const send = (m: ClientMsg) => s.onMessage(peer, encode(m))
  send({ t: 'hello', name, color: s.players.filter(Boolean).length, ver: 1, token: 'tok' + name.padEnd(8, 'x') })
  return send
}

/** 單機練習局（練習房、主機＋AI）或多人房 */
function start(code: string, seed: number, settings: Partial<LobbySettings> = {}): Game {
  const s = new GameServer(code, { send: () => {} }, seed, seed ^ 0x5bd1e995)
  const host = join(s, LOCAL_PEER, 'host')
  host({ t: 'settings', s: { bots: 3, npcCrew: 0, ...settings } })
  host({ t: 'start' })
  s.tick()
  return s.game!
}

function chatOf(c: FakeClient): string[] {
  const out: string[] = []
  for (const m of c.inbox) if (m.t === 'chat') for (const l of m.lines) out.push(l.text)
  return out
}

function clientOf(h: Harness, p: GamePlayer): FakeClient {
  return [...h.clients.values()].find((c) => c.slot === p.slot)!
}

function place(g: Game, u: Ent, zone: number, x: number, y: number): void {
  const z = g.world.zones[zone]
  const n = z.nav!.nearestOpen(x, y) ?? { x, y }
  g.world.relocate(u, zone, n.x, n.y)
  u.order = null
  u.queue.length = 0
  u.path = null
  u.acquire = false
}

describe('簡單練習局：會毀站的大型事件延後到開局 900 秒之後', () => {
  it('900 秒前抽不到無人機群、小行星、天守、海盜；之後照常；一般難度與正式局不受影響', () => {
    expect(EASY_SAFE_UNTIL).toBe(900)
    expect([...STATION_KILLERS].sort()).toEqual(['asteroids', 'pirate', 'tenshu', 'wasps'])
    const draws = (g: Game, at: number, n = 400): Set<string> => {
      g.world.time = at
      const seen = new Set<string>()
      for (let i = 0; i < n; i++) {
        const id = pickEvent(g, false)
        if (id) seen.add(id)
      }
      return seen
    }
    const easy = start(PRACTICE_ROOM, 41, { aiLevel: 'easy' })
    expect(easy.practice).toBe(true)
    const early = draws(easy, 899)
    for (const id of STATION_KILLERS) expect(early.has(id)).toBe(false)
    expect(early.size).toBeGreaterThan(3)
    const late = draws(easy, 901)
    expect(late.has('wasps')).toBe(true)
    expect(late.has('asteroids')).toBe(true)
    // 一般難度的練習局、正式局（就算設定被改成 easy）：開局就抽得到
    for (const g of [start(PRACTICE_ROOM, 41, { aiLevel: 'normal' }), start('TEST1', 41, { aiLevel: 'easy' })]) {
      const s = draws(g, 200)
      expect(s.has('wasps')).toBe(true)
      expect(s.has('asteroids')).toBe(true)
    }
  })

  it('除錯／測試強制觸發不受限制', () => {
    const g = start(PRACTICE_ROOM, 43, { aiLevel: 'easy' })
    expect(g.time).toBeLessThan(EASY_SAFE_UNTIL)
    expect(g.triggerEvent!('wasps', true)).toBe(true)
    expect(eventsOf(g).waspLeft).toBe(50)
  })
})

describe('基因檢測器的開放時間（簡單 240 秒、一般 420 秒）與 w.gitAt', () => {
  it('醫療補給與 GIT 檢測儀的檢測器上架時間跟著難度；w.gitAt 與實際上架一致', () => {
    for (const lv of ['easy', 'normal'] as const) {
      const g = start(PRACTICE_ROOM, 47, { aiLevel: lv })
      const want = lv === 'easy' ? EASY_SAMPLER_DELAY : 420
      expect(samplerOpenAt(g)).toBe(want)
      expect(g.worldPublic().gitAt).toBe(want)
      const stocks: StockState[] = []
      for (const e of g.world.ents.values()) {
        if (e.data.vendor !== 'medical' && e.data.vendor !== 'gitTester') continue
        const s = (e.data.stock as StockState[]).find((x) => x.item === 'geneSampler')!
        stocks.push(s)
      }
      expect(stocks.length).toBeGreaterThanOrEqual(2)
      for (const s of stocks) {
        expect(s.availAt).toBe(want)
        expect(s.count).toBe(0)
      }
      // 其他有開局延遲的商品不受影響（例如 GIT 以外的東西照原本）
      expect(EASY_SAMPLER_DELAY).toBe(240)
    }
  })

  it('快照帶 w.gitAt（每個人都一樣、是公開設定）', () => {
    const { h, cs } = Harness.started(3, 5150, { eventMult: 0 })
    h.ticks(2)
    for (const c of cs) {
      const w = c.snaps.find((s) => s.w?.gitAt !== undefined)?.w
      expect(w?.gitAt).toBe(420)
    }
  })
})

describe('抽血（回歸）', () => {
  it('開始施法後目標走開，抽血照樣完成（原作 A018：施法 3 秒，沒有中斷規則）', () => {
    const { h, cs } = Harness.started(3, 31337, { eventMult: 0 })
    const g = h.server.game!
    const ps = g.allPlayers()
    for (const p of ps) g.setRole(p, 'human')
    const u = g.mainOf(ps[0])!
    const t = g.mainOf(ps[1])!
    const z = g.world.zones.find((q) => q.key === 'nyx')!
    const spot = z.layout!.rooms.find((r) => r.cells >= 60)!
    place(g, u, z.id, spot.cx, spot.cy)
    place(g, t, z.id, u.x + 1.2, u.y)
    u.inv!.fill(null)
    giveItem(g, u, makeItem('geneSampler'))
    h.ticks(2)
    for (const c of cs) c.inbox.length = 0
    const c0 = clientOf(h, ps[0])
    const c1 = clientOf(h, ps[1])
    c0.send({ t: 'cmd', seq: 1, c: { k: 'use', s: u.inv!.findIndex((x) => x?.id === 'geneSampler'), e: t.id } })
    h.ticks(3)
    expect(u.cast?.ability).toBe('ab.item.geneSampler')
    // 施法開始後對方走遠
    const far = z.nav!.nearestOpen(t.x + 9, t.y)!
    c1.send({ t: 'cmd', seq: 2, c: { k: 'move', x: far.x, y: far.y } })
    h.ticks(20 * 4)
    expect(Math.hypot(t.x - u.x, t.y - u.y)).toBeGreaterThan(4)
    const names = (u.inv!.find((x) => x?.id === 'geneSampler')?.data as { sample?: { names: string[] } } | undefined)?.sample?.names ?? []
    expect(names).toEqual([ps[1].name])
    expect(chatOf(c0)).toContain('@git.msg.extracted|n=1|max=3')
  })
})

describe('平手的原因（EndResult.drawWhy）', () => {
  it('同歸於盡 = wipe；末日倒數結束 = doom；其他（除錯指令）= other；分出勝負時沒有 drawWhy', () => {
    const a = Harness.started(3, 777, { eventMult: 0 }).h.server.game!
    a.world.time = 30
    for (const p of a.allPlayers()) a.kill(a.mainOf(p)!, null)
    checkVictoryNow(a)
    expect(a.ended?.winner).toBe('draw')
    expect(a.ended?.drawWhy).toBe('wipe')

    const { h: hb } = Harness.started(3, 778, { eventMult: 0 })
    const b = hb.server.game!
    // 末日開始 600 秒後還沒分出勝負（大家都還活著）：平手
    const ev = eventsOf(b)
    ev.apoc = 'fleet'
    ev.fleetAt = 0
    ev.apocStart = b.time - 600
    b.stepOnce()
    expect(b.allPlayers().every((p) => p.alive)).toBe(true)
    expect(b.ended?.winner).toBe('draw')
    expect(b.ended?.drawWhy).toBe('doom')

    const c = Harness.started(3, 779, { eventMult: 0 }).h.server.game!
    c.endGame('draw')
    expect(c.ended?.drawWhy).toBe('other')
    const d = Harness.started(3, 780, { eventMult: 0 }).h.server.game!
    d.endGame('crew')
    expect(d.ended && 'drawWhy' in d.ended).toBe(false)
  })
})

describe('監控掃描的文字結果', () => {
  it('施放者私下收到「房間 n 人」，總數和小地圖上的掃描標記一樣多；被掃到的人照舊只收到廣播', () => {
    const { h, cs } = Harness.started(4, 9090, { eventMult: 0 })
    const g = h.server.game!
    const ps = g.allPlayers()
    const nyx = g.world.zones.find((z) => z.key === 'nyx')!
    const rooms = nyx.layout!.rooms.filter((r) => r.cells >= 40)
    place(g, g.mainOf(ps[1])!, nyx.id, rooms[0].cx, rooms[0].cy)
    place(g, g.mainOf(ps[2])!, nyx.id, rooms[0].cx + 1, rooms[0].cy)
    place(g, g.mainOf(ps[3])!, nyx.id, rooms[1].cx, rooms[1].cy)
    // ps[0] 在別的站駕駛女帝號（只看得到太空畫面）
    const other = g.world.zones.find((q) => q.alive && q.station && q.id !== nyx.id && !q.data.ship && q.layout?.spawns.length)!
    place(g, g.mainOf(ps[0])!, other.id, other.layout!.spawns[0].x, other.layout!.spawns[0].y)
    h.ticks(2)
    for (const c of cs) c.inbox.length = 0
    const st = g.world.get(nyx.spaceEnt)!
    st.owner = ps[0].slot
    SCRIPTS.get('space.sweep')!(g, { caster: st, x: st.x, y: st.y, zone: SPACE_ZONE } as never, {})
    const pings = g.fx.filter((f) => f.k === 'ping' && f.z === nyx.id && f.vis?.includes(ps[0].slot))
    h.ticks(1)
    const mine = chatOf(clientOf(h, ps[0])).filter((l) => l.startsWith('@space.sweep'))
    expect(mine.length).toBe(1)
    const line = mine[0]
    expect(line.startsWith('@space.sweepResult|')).toBe(true)
    const args = Object.fromEntries(line.split('|').slice(1).map((kv) => kv.split('=')))
    const nm = STATION_BY_ID.get('nyx')!.name
    expect(args.sz).toBe(nm.zh)
    expect(args.se).toBe(nm.en)
    // 總人數 = 標記數；房間名稱 = 標記所在的房間
    const total = (args.rz as string).split('、').reduce((n, part) => n + Number(/ (\d+) 人$/.exec(part)![1]), 0)
    expect(total).toBe(pings.length)
    const want = sweepLines(nyx, pings.map((p) => ({ x: p.x, y: p.y })))
    expect(args.rz).toBe(want.zh.join('、'))
    expect(args.re).toBe(want.en.join(', '))
    const r0 = roomAt(nyx.layout!, rooms[0].cx, rooms[0].cy)!.spec.name
    expect(args.rz).toContain(`${r0.zh} 2 人`)
    // 被掃到的人：只有原本的廣播，沒有結果
    for (const p of ps.slice(1)) {
      const got = chatOf(clientOf(h, p))
      expect(got.some((l) => l.startsWith('@space.sweepAnnounce'))).toBe(true)
      expect(got.some((l) => l.startsWith('@space.sweepResult'))).toBe(false)
    }
    lang.value = 'zh'
    expect(sysText(line)).toContain('監控掃描')
  })

  it('站裡沒有人：說沒有偵測到任何人', () => {
    const { h } = Harness.started(2, 9191, { eventMult: 0 })
    const g = h.server.game!
    const ps = g.allPlayers()
    const z = g.world.zones.find((q) => q.alive && q.station && q.key !== 'nyx' && q.spaceEnt && !q.data.ship && !g.world.inZone(q.id).some((e) => e.isMain))!
    for (const c of h.clients.values()) c.inbox.length = 0
    const st = g.world.get(z.spaceEnt)!
    st.owner = ps[0].slot
    SCRIPTS.get('space.sweep')!(g, { caster: st, x: st.x, y: st.y, zone: SPACE_ZONE } as never, {})
    h.ticks(1)
    expect(chatOf(clientOf(h, ps[0])).filter((l) => l.startsWith('@space.sweep'))).toEqual([expect.stringMatching(/^@space\.sweepNone\|sz=/)])
  })
})

describe('王牌飛行員的戰機位置', () => {
  it('開局幾秒後私下告訴王牌飛行員戰機停在哪一站外面；其他人收不到', () => {
    let found = false
    for (let seed = 1; seed <= 40 && !found; seed++) {
      const { h } = Harness.started(8, seed * 31, { eventMult: 0 })
      const g = h.server.game!
      const ace = g.allPlayers().find((p) => p.classId === 'ace')
      if (!ace) continue
      found = true
      // 王牌的戰機在太空中（不在機庫）
      const lancer = [...spaceOf(g).ships.values()].find((s) => s.def.id === 'lancer')!
      expect(lancer.docked).toBe(null)
      expect(chatOf(clientOf(h, ace)).some((l) => l.startsWith('@space.aceFighter'))).toBe(false)
      h.ticks(20 * 4)
      const nm = STATION_BY_ID.get('nyx')!.name
      expect(chatOf(clientOf(h, ace)).filter((l) => l.startsWith('@space.aceFighter'))).toEqual([`@space.aceFighter|nz=${nm.zh}|ne=${nm.en}`])
      for (const p of g.allPlayers()) if (p !== ace) expect(chatOf(clientOf(h, p)).some((l) => l.includes('aceFighter'))).toBe(false)
    }
    expect(found).toBe(true)
  })
})

describe('公開的進行中事件（w.ev）', () => {
  it('公告後才出現、結束後消失；每位觀看者（人類、異類、死者）收到的都一樣', () => {
    const { h, cs } = Harness.started(4, 2468, { eventMult: 0 })
    const g = h.server.game!
    h.leakWatch = true
    const evOf = (c: FakeClient) => {
      let v: string[] | undefined
      for (const s of c.snaps) if (s.w?.ev) v = s.w.ev
      return v
    }
    h.ticks(2)
    for (const c of cs) expect(evOf(c)).toEqual([])
    expect(publicEvents(g)).toEqual([])
    // 無人機群：公告後就算還沒飛進來也列出
    g.triggerEvent!('wasps', true)
    h.ticks(1)
    for (const c of cs) expect(evOf(c)).toEqual(['drones'])
    // 小行星、天守、末日
    g.triggerEvent!('asteroids', true)
    h.ticks(3)
    expect(publicEvents(g)).toEqual(['drones', 'asteroids'])
    // 有人死了（死者也收到一樣的內容）
    g.kill(g.mainOf(g.allPlayers()[3])!, null)
    g.startApocalypse!('orbit')
    h.ticks(2)
    const views = cs.map(evOf)
    for (const v of views) expect(v).toEqual(['drones', 'asteroids', 'doom'])
    // 無人機全部打掉、沒有下一架 → drones 消失
    eventsOf(g).waspLeft = 0
    for (const e of g.world.inZone(SPACE_ZONE)) if (e.def.id === 'ship.wasp') g.kill(e, null)
    h.ticks(2)
    expect(publicEvents(g)).not.toContain('drones')
    expect(h.drainLeaks()).toEqual([])
  })

  it('天守收容失效倒數與敵對的海盜船', () => {
    const { h } = Harness.started(9, 1357, { eventMult: 0, stations: ['nyx', 'tenshu', 'verdance'] as never })
    const g = h.server.game!
    expect(g.triggerEvent!('tenshu', true)).toBe(true)
    expect(publicEvents(g)).toContain('tenshu')
    eventsOf(g).tenshuUntil = 0
    expect(publicEvents(g)).not.toContain('tenshu')
    expect(g.triggerEvent!('pirate', true)).toBe(true)
    expect(publicEvents(g)).toContain('pirate')
    // 末日艦隊抵達後海盜改為中立：不再列為威脅
    const pz = g.world.zones[eventsOf(g).pirateZone]
    g.world.get(pz.spaceEnt)!.owner = -1
    expect(publicEvents(g)).not.toContain('pirate')
  })
})
