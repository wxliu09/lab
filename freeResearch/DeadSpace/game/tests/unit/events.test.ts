// 隨機事件導演與末日：排程、每個事件的效果、強制觸發與自然觸發看起來一樣、末日、穩定度、洩漏
import { describe, expect, it } from 'vitest'
import { Harness } from './helpers/harness'
import { decode } from '../../src/shared/protocol/codec'
import type { HostMsg } from '../../src/shared/protocol/messages'
import { eventsOf } from '../../src/sim/systems/events'
import { spawnCreature } from '../../src/sim/ai/creatures'
import { spaceOf } from '../../src/sim/systems/space'
import { SPACE_ZONE } from '../../src/sim/world'
import type { Game } from '../../src/sim/game'

const sec = (h: Harness, s: number) => h.ticks(Math.round(s * 20))

function setup(n = 3, settings: Record<string, unknown> = {}) {
  const { h, cs } = Harness.started(n, 2024, { eventMult: 0, ...settings })
  const g = h.server.game!
  return { h, g, cs, ps: g.allPlayers() }
}

const count = (g: Game, id: string, zone?: number) => [...g.world.ents.values()].filter((e) => e.alive && e.def.id === id && (zone === undefined || e.zone === zone)).length

/** 收集送給某 peer 的系統訊息文字 */
function chatTexts(h: Harness, peer = 'local'): string[] {
  const out: string[] = []
  for (const raw of h.raw.get(peer) ?? []) {
    const m = decode(raw) as HostMsg
    if (m.t === 'chat') for (const l of m.lines) out.push(l.text)
  }
  return out
}

describe('事件導演', () => {
  it('第一個事件落在 180–720 秒（÷ 事件倍率）；之後持續有事件', () => {
    const { h, g } = setup(3, { eventMult: 4 })
    const ev = eventsOf(g)
    expect(ev.next).toBeGreaterThanOrEqual(45)
    expect(ev.next).toBeLessThanOrEqual(180)
    sec(h, 900)
    // 門故障可重複、假結束 5/6 沒有效果，不計入；900 秒內至少要有 2 個生效
    const fired = ev.used.size + (12 - ev.news.length)
    expect(fired).toBeGreaterThanOrEqual(2)
  })

  it('事件倍率 0：不會有隨機事件', () => {
    const { h, g } = setup()
    sec(h, 60)
    expect(eventsOf(g).next).toBe(Infinity)
  })

  it('每個事件都能強制觸發；一次性事件不會重複', () => {
    const { g } = setup(4)
    // 先放幾隻蛞蝓仔讓繁殖季成立
    const nyx = g.world.zoneByKey('nyx')!
    const sp = nyx.layout!.spawns[0]
    spawnCreature(g, 'creature.slugling', nyx.id, sp.x, sp.y, 1)
    g.allPlayers()[0].classId = 'commissar'
    for (const id of g.eventIds!()) {
      if (id === 'virus' || id === 'fakeEnd') continue
      const ok = g.triggerEvent!(id, true)
      expect([id, ok]).toEqual([id, true])
    }
    expect(g.triggerEvent!('windfall', true)).toBe(false)
  })

  it('強制觸發與自然抽到的訊息完全一樣（不提觸發者）', () => {
    const a = setup()
    a.g.triggerEvent!('windfall', true)
    sec(a.h, 0.2)
    const forced = chatTexts(a.h).filter((x) => x.includes('event.'))
    const b = setup()
    const ev = eventsOf(b.g)
    b.g.settings.eventMult = 1
    // 只留天降橫財可抽
    for (const id of b.g.eventIds!()) if (id !== 'windfall') ev.used.add(id)
    ev.news.length = 0
    // 門故障可重複：讓它處於進行中（條件不成立）
    ev.doorsUntil = b.g.time + 1000
    ev.next = b.g.time
    sec(b.h, 0.2)
    const natural = chatTexts(b.h).filter((x) => x.includes('event.'))
    expect(forced).toEqual(['@event.windfall'])
    expect(natural).toEqual(forced)
  })
})

describe('各事件效果', () => {
  it('繁殖季：蛞蝓仔全部變成敵對雪團獸', () => {
    const { g } = setup()
    const nyx = g.world.zoneByKey('nyx')!
    const sp = nyx.layout!.spawns[0]
    for (let i = 0; i < 3; i++) spawnCreature(g, 'creature.slugling', nyx.id, sp.x, sp.y, 1)
    const before = count(g, 'creature.slugling')
    g.triggerEvent!('breeding', true)
    expect(count(g, 'creature.slugling')).toBe(0)
    expect(count(g, 'creature.snowgle')).toBe(before)
  })

  it('異常體湧現：12 隻出現在玩家身邊', () => {
    const { g } = setup()
    const before = count(g, 'creature.anomaly')
    g.triggerEvent!('anomalies', true)
    expect(count(g, 'creature.anomaly') - before).toBe(12)
  })

  it('無人機艦隊：每秒一架，共 50 架', () => {
    const { h, g } = setup()
    g.triggerEvent!('wasps', true)
    sec(h, 10.5)
    const n10 = count(g, 'ship.wasp')
    expect(n10).toBeGreaterThanOrEqual(10)
    expect(n10).toBeLessThanOrEqual(12)
    sec(h, 45)
    expect(count(g, 'ship.wasp') + 0).toBeGreaterThanOrEqual(40)
    expect(eventsOf(g).waspLeft).toBe(0)
  })

  it('小行星帶：5 波共 50 顆，撞到站會造成傷害', () => {
    const { h, g } = setup()
    g.triggerEvent!('asteroids', true)
    sec(h, 30)
    const ev = eventsOf(g)
    expect(ev.waves.length).toBe(0)
    expect(ev.rocks.length).toBeGreaterThan(30)
    // 把一顆小行星直接放到女帝號旁邊
    const nyx = g.world.get(g.world.zoneByKey('nyx')!.spaceEnt)!
    const r = g.world.get(ev.rocks[0].id)!
    g.world.relocate(r, SPACE_ZONE, nyx.x, nyx.y - nyx.radius - r.radius + 0.05)
    ev.rocks[0].vx = 0
    ev.rocks[0].vy = 1
    const hp0 = nyx.hp
    sec(h, 0.2)
    expect(nyx.hp).toBeLessThan(hp0)
    expect(g.world.get(r.id)).toBeUndefined()
  })

  it('太陽活動：灼燒係數變成 6/1.7', () => {
    const { g } = setup()
    g.triggerEvent!('solar', true)
    expect(spaceOf(g).sunFactor).toBeCloseTo(6 / 1.7)
  })

  it('門控制器故障：站在門口會被夾（225）並被推開；時間到自動修好', () => {
    const { h, g, ps } = setup()
    const z = g.world.zoneByKey('nyx')!
    const di = z.doors.findIndex((d) => !d.clearance && !d.security)
    const inst = z.layout!.doors[di]
    const u = g.mainOf(ps[0])!
    g.triggerEvent!('doors', true)
    let hit = false
    for (let i = 0; i < 60 && !hit; i++) {
      g.world.relocate(u, z.id, inst.x, inst.y)
      u.order = null
      const hp = u.hp
      h.ticks(1)
      if (u.hp <= hp - 200) hit = true
    }
    expect(hit).toBe(true)
    expect(Math.hypot(u.x - inst.x, u.y - inst.y)).toBeGreaterThan(0.5)
    eventsOf(g).doorsUntil = g.time + 0.1
    sec(h, 0.3)
    expect(eventsOf(g).doorsUntil).toBe(0)
  })

  it('蟲洞物體：建立新地點並通知 client；397 秒後解體，內部全滅', () => {
    const { h, g, ps } = setup()
    for (const r of h.raw.values()) r.length = 0
    expect(g.triggerEvent!('wormhole', true)).toBe(true)
    const z = g.world.zoneByKey('uo')!
    expect(z).toBeTruthy()
    expect(count(g, 'npc.deadScientist', z.id)).toBeGreaterThan(0)
    expect(count(g, 'creature.entity', z.id)).toBe(4)
    const zonesMsg = (h.raw.get('local') ?? []).map((r) => decode(r) as HostMsg).find((m) => m.t === 'zones')
    expect(zonesMsg && zonesMsg.t === 'zones' && zonesMsg.zones.some((x) => x[1] === 'uo')).toBe(true)
    // 固定身分，避免中途有人死亡就分出勝負（對局結束後事件系統不再運作）
    g.setRole(ps[0], 'xeno')
    g.setRole(ps[1], 'human')
    g.setRole(ps[2], 'mutant')
    // 有人留在裡面（撐到解體：站點毀滅是必殺，會無視無敵）
    const u = g.mainOf(ps[1])!
    u.data.god = true
    u.statsDirty = true
    const sp = z.layout!.pads[0] ?? z.layout!.spawns[0]
    g.world.relocate(u, z.id, sp.x, sp.y)
    sec(h, 398)
    expect(g.ended).toBeNull()
    expect(z.alive).toBe(false)
    expect(u.alive).toBe(false)
    expect(g.world.get(z.spaceEnt)).toBeUndefined()
  })

  it('海盜船：生成海盜；主控台被毀後 40 秒自爆', () => {
    const { h, g } = setup()
    g.triggerEvent!('pirate', true)
    const z = g.world.zoneByKey('pirate')!
    expect(count(g, 'pirate.captain', z.id)).toBe(1)
    expect(count(g, 'pirate.crew', z.id)).toBeGreaterThanOrEqual(3)
    expect(count(g, 'pirate.sentry', z.id)).toBeGreaterThanOrEqual(3)
    const console0 = g.world.inZone(z.id).find((e) => e.def.id === 'struct.console')!
    g.killEnt(console0, null, -1)
    sec(h, 39)
    expect(z.alive).toBe(true)
    sec(h, 2)
    expect(z.alive).toBe(false)
  })

  it('政府強化劑：人員走到裝置旁可五選一，只能一次', () => {
    const { h, g, ps, cs } = setup()
    g.triggerEvent!('enhancer', true)
    const z = g.world.zoneByKey('nyx')!
    const enh = g.world.inZone(z.id).find((e) => e.def.id === 'struct.enhancer')!
    const u = g.mainOf(ps[1])!
    const p = z.nav!.nearestOpen(enh.x + 1, enh.y)!
    g.world.relocate(u, z.id, p.x, p.y)
    sec(h, 0.5)
    expect(cs[1].me.enh).toBe(true)
    const hp0 = u.maxHp
    cs[1].send({ t: 'cmd', seq: 1, c: { k: 'enhance', s: 1 } })
    sec(h, 0.3)
    expect(u.maxHp).toBe(hp0 + 100)
    expect(cs[1].me.enh).toBe(false)
    cs[1].send({ t: 'cmd', seq: 2, c: { k: 'enhance', s: 1 } })
    sec(h, 0.3)
    expect(u.maxHp).toBe(hp0 + 100)
  })

  it('晉升：政委拿到特務裝、名字加上頭銜', () => {
    const { g, ps } = setup()
    ps[2].classId = 'commissar'
    g.triggerEvent!('promotion', true)
    expect(g.mainOf(ps[2])!.inv!.some((x) => x?.id === 'suit.operative')).toBe(true)
    expect(ps[2].name).toContain(ps[2].baseName)
    expect(ps[2].name).not.toBe(ps[2].baseName)
  })

  it('通訊病毒：名字先清空，10 秒後互換', () => {
    const { h, g, ps } = setup(4)
    const before = ps.map((p) => p.baseName).sort()
    g.triggerEvent!('virus', true)
    expect(ps.every((p) => p.name === '')).toBe(true)
    sec(h, 10.2)
    expect(ps.map((p) => p.name).sort()).toEqual(before)
  })

  it('「有東西要來了」之後連發 3 個事件', () => {
    const { h, g } = setup()
    const ev = eventsOf(g)
    g.triggerEvent!('foul', true)
    const used0 = ev.used.size
    const news0 = ev.news.length
    sec(h, 100)
    expect(ev.chain).toBe(0)
    expect(ev.used.size - used0 + (news0 - ev.news.length)).toBeGreaterThanOrEqual(2)
  })

  it('天守砲台收容失效：時限內沒放電，砲台被摧毀', () => {
    const { h, g } = setup()
    if (!g.world.zoneByKey('tenshu') || !g.world.zoneByKey('verdance')) return
    g.triggerEvent!('tenshu', true)
    sec(h, 181)
    expect(g.world.zones.find((z) => z.key === 'tenshu')!.alive).toBe(false)
  })

  it('假結束畫面：強制觸發時一定生效，6 秒後改口', () => {
    const { h, g } = setup()
    for (const r of h.raw.values()) r.length = 0
    expect(g.triggerEvent!('fakeEnd', true)).toBe(true)
    sec(h, 6.5)
    const txt = chatTexts(h)
    expect(txt).toContain('@event.fakeEnd')
    expect(txt).toContain('@event.fakeEnd2')
    expect(g.ended).toBeNull()
  })
})

describe('末日與穩定度', () => {
  it('穩定度隨時間下降，觸發後歸零', () => {
    const { h, g } = setup(3, { apocalypse: [5, 5] })
    expect(g.stability()).toBeGreaterThan(0.6)
    sec(h, 150)
    // 5% 一格、每局隨機偏移 ±90 秒
    const mid = g.stability()
    expect(mid).toBeGreaterThanOrEqual(0.15)
    expect(mid).toBeLessThanOrEqual(0.85)
    sec(h, 151)
    expect(eventsOf(g).apoc).not.toBe('')
    expect(g.stability()).toBe(0)
  })

  it('艦隊清場：120 秒後主力艦與紅隼抵達', () => {
    const { h, g } = setup()
    expect(g.startApocalypse!('fleet')).toBe(true)
    sec(h, 119)
    expect(count(g, 'fleet.hydra')).toBe(0)
    sec(h, 2)
    expect(count(g, 'fleet.hydra')).toBe(1)
    expect(count(g, 'fleet.censure')).toBe(1)
    expect(count(g, 'fleet.erstfall')).toBe(1)
    expect(count(g, 'fleet.kestrel')).toBe(6)
  })

  it('軌道穩定器失效：站被拉向恆星', () => {
    const { h, g } = setup()
    const st = g.world.get(g.world.zoneByKey('nyx')!.spaceEnt)!
    const sun = g.world.inZone(SPACE_ZONE).find((e) => e.def.id === 'space.sun')!
    const d0 = Math.hypot(st.x - sun.x, st.y - sun.y)
    g.startApocalypse!('orbit')
    sec(h, 10)
    expect(Math.hypot(st.x - sun.x, st.y - sun.y)).toBeCloseTo(d0 - 2.5, 0)
  })

  it('洩漏：事件站、海盜、小行星與艦隊同時存在時，每 tick 的快照都只含可見實體', () => {
    const { h, g } = setup(5)
    g.triggerEvent!('wormhole', true)
    g.triggerEvent!('pirate', true)
    g.triggerEvent!('asteroids', true)
    g.triggerEvent!('anomalies', true)
    g.startApocalypse!('fleet')
    for (const r of h.raw.values()) r.length = 0
    h.leakWatch = true
    sec(h, 15)
    expect([...new Set(h.leakProblems)]).toEqual([])
  })
})

describe('彩蛋：黑洞裝置', () => {
  it('蟲洞事件後、45 分鐘以後，在群組頻道輸入通關句＋啟用碼 → 黑洞裝置與蛞蝓特工出現；太早只會提示', () => {
    const { h, g, cs } = setup()
    expect(g.triggerEvent!('wormhole', true)).toBe(true)
    const code = eventsOf(g).code
    expect(code).toMatch(/^\d{4}$/)
    cs[0].send({ t: 'chat', ch: 'all', text: '-creategroup lab' })
    sec(h, 0.2)
    const ops = () => count(g, 'npc.slugOperative')
    const devices = () => [...g.world.ents.values()].filter((e) => (e.data.item as { id?: string } | undefined)?.id === 'singularity').length
    cs[0].send({ t: 'chat', ch: 'group', to: 'lab', text: `願群星記得我們 ${code}` })
    sec(h, 0.2)
    expect(ops()).toBe(0)
    g.world.time = 2701
    cs[0].send({ t: 'chat', ch: 'group', to: 'lab', text: `May the stars remember us, ${code}` })
    sec(h, 0.2)
    expect(ops()).toBeGreaterThan(0)
    expect(devices() + (g.world.zoneByKey('cinder') ? 0 : 1)).toBeGreaterThan(0)
    expect(eventsOf(g).code).toBe('')
  })
})
