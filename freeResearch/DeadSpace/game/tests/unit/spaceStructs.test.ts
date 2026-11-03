// 太空、站點、控制台（A1 建物盤點的修正）：火口號／擺渡號強行登艦、站點技能、主控台 HP 與損毀／重建、
// 海盜船主控台、停泊船 HP、翠原星轟炸與輻射、餘燼衛星大氣護盾、救生艙目的地、有人駕駛的船
import { describe, expect, it } from 'vitest'
import { Harness, type FakeClient } from './helpers/harness'
import { SHIP_BY_ID } from '../../src/shared/content/ships'
import { STATION_BY_ID } from '../../src/shared/content/stations/index'
import { UNITS, unitDef } from '../../src/shared/content/registry'
import type { FxEvent } from '../../src/shared/protocol/messages'
import { EntFlag } from '../../src/shared/protocol/messages'
import { createShip, launchTo, mannedCraft, spaceOf } from '../../src/sim/systems/space'
import { stationsOf, IMPACT_DMG, IMPACT_DMG_BRAVADO, IMPACT_R, IMPACT_WARN, BOMBARD_EVERY } from '../../src/sim/systems/stations'
import { eventsOf } from '../../src/sim/systems/events'
import { damage } from '../../src/sim/systems/damage'
import { hasBuff } from '../../src/sim/systems/buffs'
import { giveItem, makeItem } from '../../src/sim/systems/items'
import { entView } from '../../src/sim/systems/snapshot'
import { spawnCreature } from '../../src/sim/ai/creatures'
import { HOSTILE, type Ent } from '../../src/sim/ent'
import { SPACE_ZONE, type Zone } from '../../src/sim/world'
import type { Game, GamePlayer } from '../../src/sim/game'

const sec = (h: Harness, s: number) => h.ticks(Math.round(s * 20))

function setup(n = 3, settings: Record<string, unknown> = {}, seed = 4242) {
  const { h, cs } = Harness.started(n, seed, { eventMult: 0, ...settings })
  const g = h.server.game!
  const ps = g.allPlayers()
  for (const p of ps) g.setRole(p, 'human')
  return { h, g, cs, ps }
}

const zone = (g: Game, key: string): Zone => g.world.zoneByKey(key)!
const main = (g: Game, p: GamePlayer): Ent => g.mainOf(p)!
const consoleOf = (g: Game, z: Zone): Ent => g.world.inZone(z.id).find((e) => e.data.poi === 'console' && e.alive)!

function standAt(g: Game, u: Ent, zid: number, x: number, y: number): void {
  const z = g.world.zones[zid]
  const n = z.nav ? (z.nav.nearestOpen(x, y) ?? { x, y }) : { x, y }
  g.world.relocate(u, zid, n.x, n.y)
  u.order = null
  u.queue.length = 0
  u.path = null
}

function lines(c: FakeClient, ch: 'private' | 'sys'): string[] {
  return c.inbox.filter((m) => m.t === 'chat').flatMap((m: any) => m.lines.filter((l: any) => l.ch === ch).map((l: any) => l.text))
}
const clientOf = (cs: FakeClient[], p: GamePlayer) => cs.find((c) => c.slot === p.slot)!

/**
 * 逐 tick 洩漏比對的問題（helpers/leak.ts）。站內固定設施（struct.*／vendor.*）的「看到不可見實體」
 * 在沒有任何太空、站點操作的開局場景也會出現（和這裡測的功能無關，另外回報），先濾掉，其餘照樣要是空的。
 */
const leaksOf = (h: Harness): string[] => h.drainLeaks().filter((l) => !/看到不可見實體 (struct|vendor)\./.test(l))

/** 讓某人在船艙控制台上駕駛一艘剛放到太空的船 */
function pilotNewShip(h: Harness, g: Game, p: GamePlayer, x: number, y: number, ship = 'kestrel') {
  const inst = createShip(g, SHIP_BY_ID.get(ship)!)
  const e = launchTo(g, inst, x, y)
  const c = g.world.zones[inst.zone].data.console as { x: number; y: number }
  standAt(g, main(g, p), inst.zone, c.x, c.y)
  h.ticks(4)
  expect(p.control).toBe(e.id)
  return { inst, e }
}

/** 走到某個點，最多等 s 秒，直到 done() 成立 */
function walkUntil(h: Harness, g: Game, p: GamePlayer, x: number, y: number, done: () => boolean, s = 10): void {
  g.handleCommand(p.slot, { k: 'move', x, y })
  for (let i = 0; i < s * 20 && !done(); i++) h.ticks(1)
}

describe('火口號、擺渡號：強行登艦', () => {
  for (const key of ['caldera', 'portage']) {
    it(`${key}：停靠被拒（提示改用強行登艦）→ 強行登艦連結 → 走艙門進站 → 從站的登艦氣閘回船`, () => {
      const { h, g, ps, cs } = setup(3, { stations: ['caldera', 'portage'] })
      h.leakWatch = true
      const z = zone(g, key)
      const st = g.world.get(z.spaceEnt)!
      const { inst, e: ship } = pilotNewShip(h, g, ps[0], st.x + st.radius + 1.5, st.y)
      // 站裡的人：收到「走到登艦氣閘的出入口」提示
      const inside = main(g, ps[1])
      standAt(g, inside, z.id, z.layout!.w / 2, z.layout!.h / 2)
      for (const c of cs) c.inbox.length = 0
      g.handleCommand(ps[0].slot, { k: 'cast', a: 'ship.dock', e: st.id })
      sec(h, 1)
      expect(lines(clientOf(cs, ps[0]), 'private').some((l) => l.startsWith('@space.boardOnly|'))).toBe(true)
      g.handleCommand(ps[0].slot, { k: 'cast', a: 'ship.board', e: st.id })
      for (let i = 0; i < 20 * 6 && !inst.link; i++) h.ticks(1)
      expect(inst.link).toBe('st:' + key)
      h.ticks(2)
      expect(lines(clientOf(cs, ps[0]), 'private').some((l) => l.startsWith('@space.linkedSt'))).toBe(true)
      expect(lines(clientOf(cs, ps[1]), 'private').some((l) => l.startsWith('@space.linkedAirlock'))).toBe(true)
      expect(hasBuff(st, 'bf.boarding')).toBe(true)
      // 駕駛者離開控制台、走到船艙的艙門 → 進入站的登艦氣閘
      g.handleCommand(ps[0].slot, { k: 'unpilot' })
      h.ticks(2)
      const body = main(g, ps[0])
      const cabinExit = g.world.zones[inst.zone].layout!.exits[0]
      walkUntil(h, g, ps[0], cabinExit.x, cabinExit.y, () => body.zone === z.id)
      expect(body.zone).toBe(z.id)
      const exits = z.layout!.exits
      const near = Math.min(...exits.map((ex) => Math.hypot(body.x - ex.x, body.y - ex.y)))
      expect(near).toBeLessThan(2.5)
      // 登船冷卻過後，從站的出入口回到船艙
      sec(h, 8.2)
      expect(body.zone).toBe(z.id)
      walkUntil(h, g, ps[0], exits[0].x, exits[0].y, () => body.zone === inst.zone, 6)
      expect(body.zone).toBe(inst.zone)
      // 連結到期：站裡的人收到通知，出入口不再通往船艙
      for (const c of cs) c.inbox.length = 0
      sec(h, 12)
      expect(inst.link).toBeNull()
      expect(lines(clientOf(cs, ps[1]), 'private').some((l) => l.startsWith('@space.linkEndAirlock'))).toBe(true)
      standAt(g, inside, z.id, exits[0].x, exits[0].y)
      sec(h, 1)
      expect(inside.zone).toBe(z.id)
      expect(leaksOf(h)).toEqual([])
      void ship
    })
  }

  it('火口號駕駛者也能對船強行登艦：站裡的人走登艦氣閘進船艙', () => {
    const { h, g, ps } = setup(3, { stations: ['caldera'] })
    const z = zone(g, 'caldera')
    const st = g.world.get(z.spaceEnt)!
    expect(st.abilities).toContain('ship.board')
    const c = consoleOf(g, z)
    standAt(g, main(g, ps[0]), z.id, c.x, c.y)
    h.ticks(4)
    expect(ps[0].control).toBe(st.id)
    const inst = createShip(g, SHIP_BY_ID.get('mule')!)
    const ship = launchTo(g, inst, st.x + st.radius + 1.6, st.y)
    // 等視野更新（看得到才能指定目標）
    h.ticks(2)
    g.handleCommand(ps[0].slot, { k: 'cast', a: 'ship.board', e: ship.id })
    for (let i = 0; i < 20 * 6 && !inst.link; i++) h.ticks(1)
    expect(inst.link).toBe('st:caldera')
    const u = main(g, ps[1])
    const ex = z.layout!.exits[0]
    standAt(g, u, z.id, ex.x - 3, ex.y)
    h.ticks(2)
    walkUntil(h, g, ps[1], ex.x, ex.y, () => u.zone === inst.zone)
    expect(u.zone).toBe(inst.zone)
  })

  it('強行登艦不能對一般站或停泊的船施放', () => {
    const { h, g, ps } = setup(3, { stations: ['caldera'] })
    const nyx = g.world.get(zone(g, 'nyx').spaceEnt)!
    const { inst } = pilotNewShip(h, g, ps[0], nyx.x + nyx.radius + 1.5, nyx.y)
    g.handleCommand(ps[0].slot, { k: 'cast', a: 'ship.board', e: nyx.id })
    sec(h, 5)
    expect(inst.link).toBeNull()
  })
})

describe('站點技能照原作', () => {
  it('火口號、擺渡號、海盜船沒有站內監控掃描；火口號、擺渡號有強行登艦；擺渡號沒有強制停靠', () => {
    const ab = (id: string) => STATION_BY_ID.get(id)!.space.abilities
    for (const id of ['caldera', 'portage', 'pirate']) expect(ab(id), id).not.toContain('st.sweep')
    for (const id of ['caldera', 'portage']) expect(ab(id), id).toContain('ship.board')
    expect(ab('portage')).not.toContain('st.forceDock')
    expect(ab('caldera')).toEqual(expect.arrayContaining(['st.repair', 'st.cordon']))
    expect(ab('portage')).toEqual(expect.arrayContaining(['st.portTarget', 'st.portActivate']))
  })
})

describe('主控台 HP 照原作', () => {
  it('女帝／豪勇／火口 11000、裁決者 6000＋每秒回 100、天守 3000、擺渡號無敵', () => {
    const { h, g, ps } = setup(3, { stations: ['caldera', 'portage'] })
    const hp = (key: string) => consoleOf(g, zone(g, key)).maxHp
    expect(hp('nyx')).toBe(11000)
    expect(hp('bravado')).toBe(11000)
    expect(hp('caldera')).toBe(11000)
    expect(hp('adjudicatrix')).toBe(6000)
    expect(hp('tenshu')).toBe(3000)
    const adj = consoleOf(g, zone(g, 'adjudicatrix'))
    damage(g, null, adj, 1000, { pure: true })
    expect(adj.hp).toBe(5000)
    sec(h, 2)
    expect(adj.hp).toBeGreaterThan(5190)
    expect(adj.hp).toBeLessThan(5210)
    const port = consoleOf(g, zone(g, 'portage'))
    h.ticks(1)
    damage(g, null, port, 5000, { pure: true })
    expect(port.hp).toBe(port.maxHp)
    expect((entView(g, ps[0], port).fl ?? 0) & EntFlag.Invuln).toBeTruthy()
  })
})

describe('控制台被毀 → 損毀的控制台 → 站點介面裝置修好', () => {
  it('打爆→駕駛者失去控制、不能再駕駛（快照是 struct.consoleBroken）→ 用站點介面裝置修好 → 可以駕駛', () => {
    const { h, g, ps, cs } = setup()
    const z = zone(g, 'adjudicatrix')
    const st = g.world.get(z.spaceEnt)!
    const con = consoleOf(g, z)
    const { x: cx, y: cy } = con
    const ref = con.data.ref
    const u = main(g, ps[0])
    standAt(g, u, z.id, cx, cy)
    h.ticks(4)
    expect(ps[0].control).toBe(st.id)
    g.killEnt(con, null, -1)
    h.ticks(3)
    // 駕駛者立刻失去控制，站還給中立
    expect(ps[0].control).toBe(u.id)
    expect(st.owner).toBeLessThan(0)
    const broken = g.world.inZone(z.id).filter((e) => e.def.id === 'struct.consoleBroken')
    expect(broken.length).toBe(1)
    const b = broken[0]
    expect([b.x, b.y]).toEqual([cx, cy])
    expect(b.data.poi).toBe('console')
    expect(b.data.ref).toBe(ref)
    expect(b.maxHp).toBe(1)
    damage(g, null, b, 1e6)
    expect(b.alive).toBe(true)
    // 快照：站裡的人看到的是損毀的控制台
    h.ticks(2)
    const c0 = clientOf(cs, ps[0])
    expect([...c0.ents.values()].some((e) => e.i === b.id && e.d === 'struct.consoleBroken')).toBe(true)
    // 站在上面也不能駕駛
    standAt(g, u, z.id, cx + 3, cy)
    h.ticks(2)
    standAt(g, u, z.id, cx, cy)
    sec(h, 1)
    expect(ps[0].control).toBe(u.id)
    // 站點介面裝置修好
    standAt(g, u, z.id, cx, cy - 1.2)
    h.ticks(2)
    const slot = giveItem(g, u, makeItem('interfaceKit'))
    sec(h, 1.1)
    g.handleCommand(ps[0].slot, { k: 'use', s: slot, e: b.id })
    sec(h, 4)
    expect(lines(c0, 'private').some((l) => l.includes('item.interfaceKitDone'))).toBe(true)
    expect(g.world.get(b.id)).toBeUndefined()
    const fixed = consoleOf(g, z)
    expect(fixed.def.id).toBe('struct.console')
    expect([fixed.x, fixed.y]).toEqual([cx, cy])
    expect(fixed.data.ref).toBe(ref)
    // 這座站自己的數值（裁決者號 6000、每秒回 100）
    expect(fixed.maxHp).toBe(6000)
    expect(fixed.data.passives).toEqual(['bf.consoleRepair'])
    standAt(g, u, z.id, cx + 3, cy)
    h.ticks(2)
    standAt(g, u, z.id, cx, cy)
    h.ticks(4)
    expect(ps[0].control).toBe(st.id)
  })
})

describe('海盜船主控台', () => {
  it('屬敵方、2000 HP、站上去不會駕駛；打爆後不留殘骸、40 秒自爆', () => {
    const { h, g, ps, cs } = setup()
    expect(g.triggerEvent!('pirate', true)).toBe(true)
    const ev = eventsOf(g)
    const pz = g.world.zones[ev.pirateZone]
    const ship = g.world.get(pz.spaceEnt)!
    const con = consoleOf(g, pz)
    expect(con.def.id).toBe('struct.consolePirate')
    expect(con.owner).toBe(HOSTILE)
    expect(con.maxHp).toBe(2000)
    expect(ship.abilities).not.toContain('st.sweep')
    for (const e of g.world.inZone(pz.id)) if (e.def.id.startsWith('pirate.')) g.world.remove(e)
    const u = main(g, ps[0])
    u.data.god = true
    u.statsDirty = true
    standAt(g, u, pz.id, con.x, con.y)
    sec(h, 1)
    expect(ps[0].control).toBe(u.id)
    expect(ship.owner).toBe(HOSTILE)
    // 快照：敵方建物
    expect((entView(g, ps[0], con).fl ?? 0) & EntFlag.Hostile).toBeTruthy()
    for (const c of cs) c.inbox.length = 0
    g.killEnt(con, null, -1)
    h.ticks(2)
    expect(g.world.inZone(pz.id).some((e) => e.def.id === 'struct.consoleBroken')).toBe(false)
    expect(ev.pirateBoom).toBeGreaterThan(g.time + 39)
    expect(lines(clientOf(cs, ps[0]), 'private').some((l) => l.startsWith('@event.pirateSelfDestruct'))).toBe(true)
    sec(h, 38)
    expect(pz.alive).toBe(true)
    sec(h, 3)
    expect(pz.alive).toBe(false)
  })
})

describe('停泊中的船 HP 照原作', () => {
  it('紅隼／騾／綿羊 15000、獵鷹 20000、槍騎 25000；發射後以 HP 百分比換成太空中的船', () => {
    expect(unitDef('docked.kestrel').hp).toBe(15000)
    expect(unitDef('docked.mule').hp).toBe(15000)
    expect(unitDef('docked.woolly').hp).toBe(15000)
    expect(unitDef('docked.harrier').hp).toBe(20000)
    expect(unitDef('docked.lancer').hp).toBe(25000)
    const { h, g, ps } = setup()
    const inst = [...spaceOf(g).ships.values()].find((s) => s.def.id === 'kestrel' && s.docked)!
    const de = g.world.get(inst.dockedEnt)!
    expect(de.maxHp).toBe(15000)
    de.hp = 7500
    const c = g.world.zones[inst.zone].data.console as { x: number; y: number }
    standAt(g, main(g, ps[0]), inst.zone, c.x, c.y)
    sec(h, 11)
    const se = g.world.get(inst.spaceEnt)!
    expect(se.zone).toBe(SPACE_ZONE)
    // 停泊模型每秒回 5：發射倒數 10 秒內回了一點
    expect(se.hp / se.maxHp).toBeGreaterThan(0.5)
    expect(se.hp / se.maxHp).toBeLessThan(0.51)
  })

  it('沒用到的停機坪定義已移除', () => {
    expect(UNITS.has('struct.pad')).toBe(false)
  })
})

describe('翠原星轟炸與輻射', () => {
  function recordFx(g: Game): FxEvent[] {
    const out: FxEvent[] = []
    const orig = g.emitFx.bind(g)
    g.emitFx = (f, vis) => {
      out.push(f)
      orig(f, vis)
    }
    return out
  }

  it('每累積 30000 傷害：預警 10 秒 → 6 m 內 4900（停泊船 10000）→ 留下輻射區；地表殘留輻射逐秒衰減；蛞蝓仔免疫', () => {
    const { h, g, ps, cs } = setup()
    const vz = zone(g, 'verdance')
    const v = g.world.get(vz.spaceEnt)!
    const fx = recordFx(g)
    damage(g, null, v, BOMBARD_EVERY - 1)
    h.ticks(1)
    expect(fx.some((f) => f.k === 'meteorWarn')).toBe(false)
    for (const c of cs) c.inbox.length = 0
    // 地表上有人：收到撞擊預警
    const far = main(g, ps[2])
    standAt(g, far, vz.id, 2, 2)
    damage(g, null, v, 2)
    h.ticks(1)
    const warn = fx.find((f) => f.k === 'meteorWarn' && f.z === vz.id)!
    expect(warn).toBeTruthy()
    expect(warn.v).toBe(IMPACT_WARN)
    expect(fx.some((f) => f.k === 'ping' && f.z === vz.id)).toBe(true)
    expect(lines(clientOf(cs, ps[2]), 'private').some((l) => l.startsWith('@st.impactWarn'))).toBe(true)
    expect(stationsOf(g).rad).toBe(3)
    // 落點放一個人（加厚血量）、一艘停泊模型、一隻蛞蝓仔；遠處的人只吃殘留輻射
    const u = main(g, ps[1])
    u.maxHp = u.hp = 20000
    standAt(g, u, vz.id, warn.x, warn.y)
    u.data.noRegen = true
    const dock = g.world.spawn(unitDef('docked.kestrel'), vz.id, warn.x + 1, warn.y, -1)
    dock.data.noRegen = true
    const slug = spawnCreature(g, 'creature.slugling', vz.id, warn.x, warn.y + 1)!
    slug.maxHp = slug.hp = 20000
    slug.data.noRegen = true
    // 撞擊前一刻
    sec(h, IMPACT_WARN - 0.3)
    const before = u.hp
    expect(dock.hp).toBe(dock.maxHp)
    sec(h, 0.5)
    expect(fx.some((f) => f.k === 'meteorImpact' && f.z === vz.id && f.v === IMPACT_R)).toBe(true)
    expect(before - u.hp).toBeGreaterThan(IMPACT_DMG - 10)
    expect(before - u.hp).toBeLessThan(IMPACT_DMG + 30)
    expect(dock.maxHp - dock.hp).toBe(10000)
    // 輻射區：落點，7 m 內每秒 20；蛞蝓仔不受影響
    const field = g.world.inZone(vz.id).find((e) => e.def.id === 'hz.radField')!
    expect(field).toBeTruthy()
    expect(Math.hypot(field.x - warn.x, field.y - warn.y)).toBeLessThan(0.01)
    sec(h, 1.2)
    expect(hasBuff(u, 'bf.planetRad')).toBe(true)
    const slugHp = slug.hp
    const hp1 = u.hp
    sec(h, 3)
    // 輻射區 20／秒＋殘留輻射約 3／秒
    expect(hp1 - u.hp).toBeGreaterThan(60)
    expect(hp1 - u.hp).toBeLessThan(75)
    expect(hasBuff(slug, 'bf.planetRad')).toBe(false)
    expect(slug.hp).toBe(slugHp)
    // 遠處的人：只吃殘留輻射（每秒約 3，逐秒 ×0.99）
    far.maxHp = far.hp = 5000
    far.data.noRegen = true
    const farHp = far.hp
    sec(h, 4)
    expect(farHp - far.hp).toBeGreaterThan(8)
    expect(farHp - far.hp).toBeLessThan(13)
    expect(stationsOf(g).rad).toBeLessThan(3)
  })

  it('豪勇號降落在翠原星上：每次撞擊 20000，全體收到船體剩幾次的警告', () => {
    const { h, g, ps, cs } = setup()
    const bz = zone(g, 'bravado')
    const con = consoleOf(g, bz)
    standAt(g, main(g, ps[0]), bz.id, con.x, con.y)
    h.ticks(3)
    const b = g.world.get(bz.spaceEnt)!
    expect(ps[0].control).toBe(b.id)
    const vz = zone(g, 'verdance')
    const v = g.world.get(vz.spaceEnt)!
    g.world.relocate(b, SPACE_ZONE, v.x + v.radius + b.radius + 1, v.y)
    h.ticks(2)
    g.handleCommand(ps[0].slot, { k: 'cast', a: 'st.land', e: v.id })
    sec(h, 11)
    expect(b.data.landed).toBe(true)
    b.data.noRegen = true
    const hp0 = b.hp
    for (const c of cs) c.inbox.length = 0
    damage(g, null, v, BOMBARD_EVERY)
    sec(h, IMPACT_WARN + 0.5)
    expect(hp0 - b.hp).toBe(IMPACT_DMG_BRAVADO)
    const n = Math.ceil(b.hp / IMPACT_DMG_BRAVADO)
    expect(lines(clientOf(cs, ps[1]), 'sys')).toContain(`@st.bravadoImpact|n=${n}`)
  })
})

describe('餘燼衛星大氣護盾', () => {
  it('300000 護盾先吸收傷害；破了之後全星區公告、天氣變暴風雪（公開狀態 wx）、地表每秒 10（建築不受影響）', () => {
    const { h, g, ps, cs } = setup()
    h.leakWatch = true
    const cz = zone(g, 'cinder')
    const c = g.world.get(cz.spaceEnt)!
    expect(hasBuff(c, 'bf.cinderShield')).toBe(true)
    // 地表上的人：護盾還在時不受影響
    const u = main(g, ps[1])
    standAt(g, u, cz.id, cz.layout!.w / 2, cz.layout!.h / 2)
    u.data.noRegen = true
    const other = main(g, ps[2])
    other.data.noRegen = true
    const factory = g.world.inZone(cz.id).find((e) => e.def.id === 'fac.moduleFactory')!
    damage(g, null, c, 100000)
    expect(c.hp).toBe(c.maxHp)
    const hp0 = u.hp
    sec(h, 2)
    expect(u.hp).toBe(hp0)
    expect(stationsOf(g).storm).toBe(false)
    for (const cl of cs) cl.inbox.length = 0
    // 再打 250000：護盾剩的 200000 吸收，50000 打在衛星上
    damage(g, null, c, 250000)
    expect(c.hp).toBe(c.maxHp - 50000)
    sec(h, 1)
    expect(stationsOf(g).storm).toBe(true)
    expect(hasBuff(c, 'bf.cinderShield')).toBe(false)
    for (const cl of cs) expect(lines(cl, 'sys')).toContain('@st.cinderShieldDown')
    // 公開的天氣狀態：每個人都收到（不分在哪）
    for (const cl of cs) expect(cl.snaps.some((s) => (s.w as any)?.wx?.cinder === 'blizzard')).toBe(true)
    const hp1 = u.hp
    const otherHp = other.hp
    const facHp = factory.hp
    sec(h, 3)
    expect(hasBuff(u, 'bf.blizzard')).toBe(true)
    expect(hp1 - u.hp).toBeGreaterThan(28)
    expect(hp1 - u.hp).toBeLessThan(32)
    expect(other.hp).toBe(otherHp)
    expect(factory.hp).toBe(facHp)
    expect(leaksOf(h)).toEqual([])
  })
})

describe('救生艙目的地', () => {
  it('不能飛往海盜船、未識別物體、七號廢站與船艇；一般站可以', () => {
    const { g, ps } = setup()
    g.triggerEvent!('pirate', true)
    g.triggerEvent!('wormhole', true)
    const sp = spaceOf(g)
    const pod = g.world.spawn(unitDef('ship.pod'), SPACE_ZONE, 0, 0, ps[0].slot)
    sp.pods.set(pod.id, { slot: ps[0].slot, target: -1, hpK: 1 })
    const fn = g.script('space.podTarget')!
    const aim = (key: string) => {
      const z = g.world.zones.find((q) => q.key === key && q.alive)
      expect(z, key).toBeTruthy()
      const t = g.world.get(z!.spaceEnt)!
      sp.pods.get(pod.id)!.target = -1
      fn(g, { caster: pod, target: t, x: t.x, y: t.y, zone: SPACE_ZONE }, {})
      return sp.pods.get(pod.id)!.target
    }
    for (const key of ['pirate', 'uo', 'hulk7']) expect(aim(key), key).toBe(-1)
    expect(aim('nyx')).toBe(zone(g, 'nyx').id)
    expect(aim('verdance')).toBe(zone(g, 'verdance').id)
  })
})

describe('有人駕駛的船（雷達宙域掃描用）', () => {
  it('mannedCraft 只列出太空中有人駕駛的船艇與只能登艦的站', () => {
    const { h, g, ps } = setup(3, { stations: ['caldera'] })
    expect(mannedCraft(g)).toEqual([])
    const { e } = pilotNewShip(h, g, ps[0], 10, 10)
    // 站點（女帝號）有人駕駛不算船
    const nz = zone(g, 'nyx')
    const nc = consoleOf(g, nz)
    standAt(g, main(g, ps[1]), nz.id, nc.x, nc.y)
    h.ticks(4)
    expect(ps[1].control).toBe(nz.spaceEnt)
    expect(mannedCraft(g).map((x) => x.id)).toEqual([e.id])
  })
})
