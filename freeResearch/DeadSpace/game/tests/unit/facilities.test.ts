// 各站特殊設施與站點技能（M7）：天守主砲／反物質、豪勇號降落與自動駕駛、擺渡號傳送台、火口號維修／封鎖／毒素、
// 公轉、鑄造台、模組安裝座與模組、模組工廠、活體庫號隔間與籠子、動力分配台與 LQ 倉儲、防禦無人機、
// 重力校正、啟用碼面板、企鵝雕像、職業固定出生點、控制台電磁停機、洩漏
import { describe, expect, it } from 'vitest'
import { Harness, type FakeClient } from './helpers/harness'
import { decode } from '../../src/shared/protocol/codec'
import type { HostMsg } from '../../src/shared/protocol/messages'
import { SHIP_BY_ID } from '../../src/shared/content/ships'
import { createShip, launchTo, spaceOf } from '../../src/sim/systems/space'
import { stationsOf } from '../../src/sim/systems/stations'
import { cellInfo, classSpawn, facilityView, powerOf, setPowerMode } from '../../src/sim/systems/facilities'
import { eventsOf, uoCode } from '../../src/sim/systems/events'
import { giveItem, makeItem } from '../../src/sim/systems/items'
import { damage } from '../../src/sim/systems/damage'
import { spawnCreature } from '../../src/sim/ai/creatures'
import { markersOf } from '../../src/sim/setup'
import { roomAt } from '../../src/shared/layout'
import { SPACE_ZONE, type Zone } from '../../src/sim/world'
import type { Ent } from '../../src/sim/ent'
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
const sEnt = (g: Game, key: string): Ent => g.world.get(zone(g, key).spaceEnt)!
const findIn = (g: Game, zid: number, pred: (e: Ent) => boolean): Ent => g.world.inZone(zid).find(pred)!
const byDef = (g: Game, zid: number, def: string): Ent => findIn(g, zid, (e) => e.def.id === def)
const count = (g: Game, def: string, zid?: number) => [...g.world.ents.values()].filter((e) => e.alive && e.def.id === def && (zid === undefined || e.zone === zid)).length
const main = (g: Game, p: GamePlayer): Ent => g.mainOf(p)!

/** 把單位放到某點附近最近的空地 */
function standAt(g: Game, u: Ent, zid: number, x: number, y: number): void {
  const z = g.world.zones[zid]
  const n = z.nav ? (z.nav.nearestOpen(x, y) ?? { x, y }) : { x, y }
  g.world.relocate(u, zid, n.x, n.y)
  u.order = null
  u.queue.length = 0
  u.path = null
}

/** 站上某站的主控台並取得駕駛 */
function pilot(h: Harness, g: Game, p: GamePlayer, key: string): Ent {
  const z = zone(g, key)
  const con = findIn(g, z.id, (e) => e.data.poi === 'console')
  standAt(g, main(g, p), z.id, con.x, con.y)
  h.ticks(3)
  expect(p.control).toBe(z.spaceEnt)
  return g.world.get(z.spaceEnt)!
}

function chatOf(h: Harness, c: FakeClient): string[] {
  const out: string[] = []
  for (const raw of h.raw.get(c.peer) ?? []) {
    const m = decode(raw) as HostMsg
    if (m.t === 'chat') for (const l of m.lines) out.push(l.text)
  }
  return out
}

function clearRaw(h: Harness): void {
  for (const r of h.raw.values()) r.length = 0
}

/** 讓某人用背包裡的道具對目標施放（道具放進第一個空格）*/
function useOn(h: Harness, g: Game, p: GamePlayer, itemId: string, target: Ent): number {
  const u = main(g, p)
  // 職業起始道具可能塞滿背包：騰出最後一格；等道具技能冷卻（模組 1 秒）
  if (!u.inv!.includes(null)) u.inv![u.inv!.length - 1] = null
  const slot = giveItem(g, u, makeItem(itemId))
  expect(slot).toBeGreaterThanOrEqual(0)
  sec(h, 1.1)
  g.handleCommand(p.slot, { k: 'use', s: slot, e: target.id })
  h.ticks(8)
  return slot
}

/** 某位玩家的 client */
const cl = (cs: FakeClient[], p: GamePlayer): FakeClient => cs.find((c) => c.slot === p.slot)!

function near(g: Game, p: GamePlayer, e: Ent, d = 1.4): void {
  standAt(g, main(g, p), e.zone, e.x, e.y - d)
}

describe('天守主砲', () => {
  it('能量球追蹤目標站、碰到後 5 秒內共 200000 傷害；全星區廣播不提開砲者', () => {
    const { h, g, cs, ps } = setup()
    const tenshu = pilot(h, g, ps[0], 'tenshu')
    const adj = sEnt(g, 'adjudicatrix')
    g.world.relocate(adj, SPACE_ZONE, tenshu.x, tenshu.y + 9)
    h.ticks(2)
    clearRaw(h)
    g.handleCommand(ps[0].slot, { k: 'cast', a: 'st.cannon', e: adj.id })
    h.ticks(2)
    expect(count(g, 'space.cannonOrb')).toBe(1)
    const txt = chatOf(h, cl(cs, ps[1])).filter((x) => x.startsWith('@st.cannonFired'))
    expect(txt.length).toBe(1)
    expect(txt[0]).not.toContain(ps[0].name)
    expect(tenshu.cds.get('st.cannon')! - g.time).toBeGreaterThan(215)
    const hp0 = adj.hp
    sec(h, 12)
    expect(count(g, 'space.cannonOrb')).toBe(0)
    expect(hp0 - adj.hp).toBeGreaterThan(190000)
    expect(hp0 - adj.hp).toBeLessThan(201000)
  })

  it('小船不能當目標；站體供能時冷卻 160 秒；目標消失改追翠原星', () => {
    const { h, g, ps } = setup()
    const tenshu = pilot(h, g, ps[0], 'tenshu')
    const inst = createShip(g, SHIP_BY_ID.get('kestrel')!)
    const ship = launchTo(g, inst, tenshu.x + 6, tenshu.y)
    h.ticks(2)
    g.handleCommand(ps[0].slot, { k: 'cast', a: 'st.cannon', e: ship.id })
    h.ticks(3)
    expect(count(g, 'space.cannonOrb')).toBe(0)
    setPowerMode(g, 'station')
    const hulk = sEnt(g, 'hulk7')
    g.handleCommand(ps[0].slot, { k: 'cast', a: 'st.cannon', e: hulk.id })
    h.ticks(3)
    expect(count(g, 'space.cannonOrb')).toBe(1)
    expect(tenshu.cds.get('st.cannon')! - g.time).toBeLessThan(161)
    // 目標被移除：能量球改追翠原星
    const orb = [...g.world.ents.values()].find((e) => e.def.id === 'space.cannonOrb')!
    g.destroyStation!('hulk7')
    h.ticks(2)
    expect([...stationsOf(g).orbs.values()][0].target).toBe(zone(g, 'verdance').spaceEnt)
    void orb
  })

  it('收容失效事件：主砲擊中翠原星就解除', () => {
    const { h, g, ps } = setup()
    expect(g.triggerEvent!('tenshu', true)).toBe(true)
    expect(eventsOf(g).tenshuUntil).toBeGreaterThan(0)
    const tenshu = pilot(h, g, ps[0], 'tenshu')
    const v = sEnt(g, 'verdance')
    g.world.relocate(tenshu, SPACE_ZONE, v.x + v.radius + tenshu.radius + 3, v.y)
    h.ticks(2)
    g.handleCommand(ps[0].slot, { k: 'cast', a: 'st.cannon', e: v.id })
    sec(h, 6)
    expect(eventsOf(g).tenshuUntil).toBe(0)
  })
})

describe('公轉', () => {
  it('翠原星繞中心 0.25°/s、餘燼衛星繞翠原星 1.5°/s；末日軌道失效時停止', () => {
    const { h, g } = setup()
    const v = sEnt(g, 'verdance')
    const c = sEnt(g, 'cinder')
    expect(Math.hypot(v.x, v.y)).toBeCloseTo(23, 1)
    expect(Math.hypot(c.x - v.x, c.y - v.y)).toBeCloseTo(8, 1)
    const a0 = Math.atan2(v.y, v.x)
    const b0 = Math.atan2(c.y - v.y, c.x - v.x)
    sec(h, 20)
    const a1 = Math.atan2(v.y, v.x)
    const b1 = Math.atan2(c.y - v.y, c.x - v.x)
    expect(((a1 - a0) * 180) / Math.PI).toBeCloseTo(5, 0)
    expect(((((b1 - b0) * 180) / Math.PI + 360) % 360)).toBeCloseTo(30, 0)
    g.data.orbitsStopped = true
    const x = v.x
    const y = v.y
    sec(h, 5)
    expect(v.x).toBe(x)
    expect(v.y).toBe(y)
  })
})

describe('豪勇號', () => {
  it('降落翠原星 → 降落傳送門雙向互通 → 45 秒升空', () => {
    const { h, g, ps } = setup()
    const b = pilot(h, g, ps[0], 'bravado')
    const v = sEnt(g, 'verdance')
    g.world.relocate(b, SPACE_ZONE, v.x + v.radius + b.radius + 1, v.y)
    h.ticks(2)
    g.handleCommand(ps[0].slot, { k: 'cast', a: 'st.land', e: v.id })
    sec(h, 10.5)
    expect(b.data.landed).toBe(true)
    expect(b.abilities).toContain('st.launch')
    expect(b.abilities).not.toContain('st.land')
    sec(h, 3)
    expect(b.x).toBeCloseTo(v.x, 3)
    // 傳送門：豪勇號 → 翠原星 → 豪勇號
    const bz = zone(g, 'bravado')
    const vz = zone(g, 'verdance')
    const pb = byDef(g, bz.id, 'fac.landingPortal')
    const pv = byDef(g, vz.id, 'fac.landingPortal')
    expect(pb.x2?.on).toBe(1)
    const q = main(g, ps[1])
    g.world.relocate(q, bz.id, pb.x, pb.y)
    h.ticks(4)
    expect(q.zone).toBe(vz.id)
    h.ticks(4)
    expect(q.zone).toBe(vz.id)
    g.world.relocate(q, vz.id, pv.x, pv.y)
    h.ticks(4)
    expect(q.zone).toBe(bz.id)
    // 升空
    g.handleCommand(ps[0].slot, { k: 'cast', a: 'st.launch' })
    sec(h, 46)
    expect(stationsOf(g).landed).toBe(null)
    expect(b.data.landed).toBe(false)
    expect(b.abilities).toContain('st.land')
    expect(Math.hypot(b.x - v.x, b.y - v.y)).toBeGreaterThan(v.radius)
    expect(pb.x2?.on).toBe(0)
    g.world.relocate(q, bz.id, pb.x, pb.y)
    h.ticks(4)
    expect(q.zone).toBe(bz.id)
  })

  it('自動駕駛：交出控制台、沿航向前進；站在控制台上不會立刻搶回', () => {
    const { h, g, ps } = setup()
    const b = pilot(h, g, ps[0], 'bravado')
    g.world.relocate(b, SPACE_ZONE, 0, -20)
    b.facing = 0
    const x0 = b.x
    g.handleCommand(ps[0].slot, { k: 'cast', a: 'st.autopilot' })
    h.ticks(3)
    expect(ps[0].control).toBe(ps[0].main)
    expect(b.owner).toBe(-1)
    sec(h, 5)
    expect(b.x).toBeGreaterThan(x0 + 1.5)
    expect(ps[0].control).toBe(ps[0].main)
    // 離開控制台再回來就能接手
    const u = main(g, ps[0])
    const cx = u.x
    const cy = u.y
    standAt(g, u, u.zone, cx, cy - 4)
    h.ticks(3)
    standAt(g, u, u.zone, cx, cy)
    h.ticks(3)
    expect(ps[0].control).toBe(b.id)
  })
})

describe('擺渡號傳送台', () => {
  it('選目標站 → 啟動 19.5 秒 → 站在傳送台上的人被送到目標站（抵達無敵）', () => {
    const { h, g, ps } = setup(3, { stations: ['portage'] })
    const port = pilot(h, g, ps[0], 'portage')
    const adj = sEnt(g, 'adjudicatrix')
    g.handleCommand(ps[0].slot, { k: 'cast', a: 'st.portTarget', e: adj.id })
    h.ticks(3)
    const pz = zone(g, 'portage')
    expect(pz.data.portTarget).toBe(zone(g, 'adjudicatrix').id)
    const pads = markersOf(pz).teleportPad!
    expect(pads.length).toBe(9)
    const q = main(g, ps[1])
    g.world.relocate(q, pz.id, pads[4].x, pads[4].y)
    g.handleCommand(ps[0].slot, { k: 'cast', a: 'st.portActivate' })
    h.ticks(3)
    expect(port.buffs.some((b) => b.id === 'bf.portCharge')).toBe(true)
    sec(h, 18)
    expect(q.zone).toBe(pz.id)
    sec(h, 2)
    expect(q.zone).toBe(zone(g, 'adjudicatrix').id)
    expect(q.buffs.some((b) => b.id === 'bf.portArrive')).toBe(true)
    expect(main(g, ps[0]).zone).toBe(pz.id)
  })
})

describe('火口號', () => {
  function caldera() {
    const s = setup(4, { stations: ['caldera'] })
    const cal = pilot(s.h, s.g, s.ps[0], 'caldera')
    const nyx = sEnt(s.g, 'nyx')
    s.g.world.relocate(cal, SPACE_ZONE, nyx.x + nyx.radius + cal.radius + 2, nyx.y)
    s.h.ticks(2)
    return { ...s, cal, nyx }
  }

  it('能量 250/1000；外部維修 1200（耗 1）、可自動施放', () => {
    const { h, g, ps, cal, nyx } = caldera()
    expect(cal.maxMp).toBe(1000)
    expect(cal.mp).toBeCloseTo(250, 0)
    damage(g, null, nyx, 5000, { pure: true })
    const hp = nyx.hp
    g.handleCommand(ps[0].slot, { k: 'cast', a: 'st.repair', e: nyx.id })
    h.ticks(3)
    expect(nyx.hp - hp).toBeGreaterThanOrEqual(1200)
    expect(cal.mp).toBeCloseTo(249, 0)
    g.handleCommand(ps[0].slot, { k: 'autocast', a: 'st.repair' })
    expect(cal.autocast.has('st.repair')).toBe(true)
    damage(g, null, nyx, 6000, { pure: true })
    sec(h, 6)
    expect(nyx.hp).toBeGreaterThanOrEqual(nyx.maxHp - 1)
  })

  it('封鎖信標：目標站所有門鎖死 20 秒後恢復', () => {
    const { h, g, ps, cal, nyx } = caldera()
    const nz = zone(g, 'nyx')
    const mp0 = cal.mp
    g.handleCommand(ps[0].slot, { k: 'cast', a: 'st.cordon', e: nyx.id })
    h.ticks(3)
    expect(nz.doors.every((d) => d.locked || d.broken)).toBe(true)
    expect(mp0 - cal.mp).toBeCloseTo(40, 0)
    sec(h, 21)
    expect(nz.doors.some((d) => d.locked)).toBe(false)
  })

  it('精煉礦石 +150 能量；神經毒素模組 → 對目標站內每人持續毒傷（仿生人免疫）', () => {
    const { h, g, ps, cal, nyx } = caldera()
    const cz = zone(g, 'caldera')
    const sock = byDef(g, cz.id, 'fac.moduleSocket')
    near(g, ps[1], sock)
    const mp0 = cal.mp
    useOn(h, g, ps[1], 'refinedOre', sock)
    expect(cal.mp - mp0).toBeCloseTo(150, 0)
    expect(main(g, ps[1]).inv!.some((i) => i?.id === 'refinedOre')).toBe(false)
    useOn(h, g, ps[1], 'modNeurotoxin', sock)
    expect(cal.abilities).toContain('st.neurotox')
    // 兩個人在女帝號：一個人類、一個仿生人
    const nz = zone(g, 'nyx')
    const sp = nz.layout!.spawns[0]
    const hum = main(g, ps[2])
    const andr = main(g, ps[3])
    g.setRole(ps[3], 'android')
    standAt(g, hum, nz.id, sp.x, sp.y)
    standAt(g, andr, nz.id, sp.x + 2, sp.y)
    hum.hp = hum.maxHp
    andr.hp = andr.maxHp
    g.handleCommand(ps[0].slot, { k: 'cast', a: 'st.neurotox', e: nyx.id })
    sec(h, 4)
    expect(hum.hp).toBeLessThan(hum.maxHp - 8)
    expect(andr.hp).toBe(andr.maxHp)
  })
})

describe('仿生人鑄造台', () => {
  it('仿生人站上鑄造平台才出現換機體選項；記憶核心插進鑄造台 30 秒後在平台重生並拿到遙控器', () => {
    const { h, g, ps } = setup(3)
    const az = zone(g, 'adjudicatrix')
    const pads = markersOf(az).fabricatorPad!
    const a = ps[1]
    g.setRole(a, 'android')
    a.ep = 2000
    const am = main(g, a)
    standAt(g, am, az.id, pads[4].x, pads[4].y)
    h.ticks(6)
    expect(g.evolveOptions(a).length).toBeGreaterThan(0)
    standAt(g, am, az.id, pads[4].x, pads[4].y - 6)
    h.ticks(6)
    expect(g.evolveOptions(a)).toEqual([])
    // 死亡 → 記憶核心 → 交給別人插進鑄造台
    g.killEnt(am, null)
    h.ticks(2)
    expect(a.alive).toBe(false)
    const coreEnt = g.world.get(a.data.core as number)!
    const fab = byDef(g, az.id, 'fac.fabricator')
    const r = main(g, ps[2])
    near(g, ps[2], fab, 2)
    const core = coreEnt.data.item
    g.world.remove(coreEnt)
    const slot = giveItem(g, r, core)
    h.ticks(2)
    g.handleCommand(ps[2].slot, { k: 'use', s: slot, e: fab.id })
    h.ticks(6)
    expect(r.inv!.some((i) => i?.id === 'memoryCore')).toBe(false)
    expect(r.inv!.some((i) => i?.id === 'overrideRemote')).toBe(true)
    sec(h, 29)
    expect(a.alive).toBe(false)
    sec(h, 2)
    expect(a.alive).toBe(true)
    const nu = main(g, a)
    expect(nu.zone).toBe(az.id)
    expect(pads.some((p) => Math.hypot(p.x - nu.x, p.y - nu.y) < 1.5)).toBe(true)
    expect(a.data.coreOnly).toBe(false)
  })

  it('記憶核心也可以接管閒置的綏靖機器人', () => {
    const { h, g, ps } = setup(3)
    const a = ps[1]
    g.setRole(a, 'android')
    g.killEnt(main(g, a), null)
    h.ticks(2)
    const coreEnt = g.world.get(a.data.core as number)!
    const nz = zone(g, 'nyx')
    const bot = byDef(g, nz.id, 'npc.pacifier')
    near(g, ps[2], bot, 2)
    const core = coreEnt.data.item
    g.world.remove(coreEnt)
    const slot = giveItem(g, main(g, ps[2]), core)
    h.ticks(2)
    g.handleCommand(ps[2].slot, { k: 'use', s: slot, e: bot.id })
    h.ticks(6)
    expect(a.alive).toBe(true)
    expect(main(g, a).def.id).toBe('npc.pacifier')
    expect(bot.removed).toBe(true)
  })
})

describe('模組安裝', () => {
  it('掃描增幅模組：裝在裁決者號 → 每 45 秒向全體 ping；打爆介面就停止；裝錯地方會提示', () => {
    const { h, g, cs, ps } = setup(3)
    const az = zone(g, 'adjudicatrix')
    const sock = byDef(g, az.id, 'fac.moduleSocket')
    expect(sock.stats.invuln).toBe(true)
    // 裝錯：拿到天守砲台的控制台
    const tz = zone(g, 'tenshu')
    const tcon = findIn(g, tz.id, (e) => e.data.poi === 'console')
    // 站遠一點：踩上控制台就會變成駕駛站體
    near(g, ps[1], tcon, 2.2)
    clearRaw(h)
    useOn(h, g, ps[1], 'modScanAmp', tcon)
    expect(chatOf(h, cl(cs, ps[1])).some((x) => x.startsWith('@mod.wrongTarget'))).toBe(true)
    expect(main(g, ps[1]).inv!.some((i) => i?.id === 'modScanAmp')).toBe(true)
    main(g, ps[1]).inv!.fill(null)
    near(g, ps[1], sock)
    useOn(h, g, ps[1], 'modScanAmp', sock)
    expect(sock.data.module).toBe('modScanAmp')
    expect(sock.x2?.mod).toBe('modScanAmp')
    h.ticks(2)
    expect(sock.stats.invuln).toBe(false)
    clearRaw(h)
    sec(h, 46)
    for (const c of cs) {
      expect(chatOf(h, c)).toContain('@fac.asadScan')
      const pings = h.clients.get(c.peer)!.snaps.flatMap((s) => s.fx ?? []).filter((f) => f.k === 'ping' && f.s === 'asad')
      expect(pings.length).toBeGreaterThanOrEqual(3)
    }
    damage(g, null, sock, 1000, { pure: true })
    expect(sock.alive).toBe(false)
    clearRaw(h)
    sec(h, 46)
    expect(chatOf(h, cs[0])).not.toContain('@fac.asadScan')
  })

  it('反物質傳送模組：天守砲台多一發一次性技能，鎖定 60 秒後 900000 傷害', () => {
    const { h, g, cs, ps } = setup(3)
    const tz = zone(g, 'tenshu')
    const sock = byDef(g, tz.id, 'fac.moduleSocket')
    near(g, ps[1], sock)
    useOn(h, g, ps[1], 'modAntimatter', sock)
    const tenshu = sEnt(g, 'tenshu')
    expect(tenshu.abilities).toContain('st.antimatter')
    pilot(h, g, ps[0], 'tenshu')
    const v = sEnt(g, 'verdance')
    clearRaw(h)
    g.handleCommand(ps[0].slot, { k: 'cast', a: 'st.antimatter', e: v.id })
    h.ticks(3)
    expect(chatOf(h, cl(cs, ps[2])).some((x) => x.startsWith('@st.atmLock'))).toBe(true)
    expect(tenshu.abilities).not.toContain('st.antimatter')
    sec(h, 59)
    const hp = v.hp
    sec(h, 1.5)
    expect(hp - v.hp).toBeGreaterThan(800000)
  })

  it('輔助推進模組：女帝號充能 20 秒後跳到目標點', () => {
    const { h, g, ps } = setup(3)
    const nz = zone(g, 'nyx')
    const con = findIn(g, nz.id, (e) => e.data.poi === 'console')
    near(g, ps[1], con, 2.2)
    useOn(h, g, ps[1], 'modThruster', con)
    const nyx = sEnt(g, 'nyx')
    expect(nyx.abilities).toContain('st.jump')
    pilot(h, g, ps[1], 'nyx')
    const tx = nyx.x + 20
    const ty = nyx.y - 10
    g.handleCommand(ps[1].slot, { k: 'cast', a: 'st.jump', x: tx, y: ty })
    h.ticks(3)
    expect(nyx.buffs.some((b) => b.id === 'bf.jumpCharge')).toBe(true)
    sec(h, 20)
    expect(nyx.x).toBeCloseTo(tx, 1)
    expect(nyx.y).toBeCloseTo(ty, 1)
  })

  it('紅隼升級模組：裝在停泊的紅隼上，升空後 +30000 HP、技能升級', () => {
    const { h, g, ps } = setup(3)
    const inst = [...spaceOf(g).ships.values()].find((s) => s.def.id === 'kestrel' && s.docked)!
    const de = g.world.get(inst.dockedEnt)!
    // 站遠一點：靠太近會直接登艇
    near(g, ps[1], de, de.radius + 1.7)
    useOn(h, g, ps[1], 'modKestrel', de)
    expect(inst.mk2).toBe(true)
    const e = launchTo(g, inst, 0, 0)
    expect(e.maxHp).toBe(90000)
    expect(e.abilities).toContain('ship.payload2')
    expect(e.abilities).toContain('ship.overload2')
  })
})

describe('模組工廠', () => {
  it('免費生產、同時只能一張單（新單取代舊單）、成品從輸送帶出口出來', () => {
    const { h, g, ps } = setup(3)
    const cz = zone(g, 'cinder')
    const f = byDef(g, cz.id, 'fac.moduleFactory')
    near(g, ps[1], f, 1.6)
    h.ticks(2)
    expect(facilityView(g, ps[1])?.k).toBe('factory')
    g.handleCommand(ps[1].slot, { k: 'facility', e: f.id, a: 'modScanAmp' })
    h.ticks(2)
    expect((f.data.prod as { item: string }).item).toBe('modScanAmp')
    g.handleCommand(ps[1].slot, { k: 'facility', e: f.id, a: 'refinedOre' })
    h.ticks(2)
    expect((f.data.prod as { item: string }).item).toBe('refinedOre')
    expect(f.x2?.prod).toBe('refinedOre')
    sec(h, 119)
    expect(count(g, 'groundItem', cz.id)).toBe(0)
    sec(h, 2)
    const out = markersOf(cz).moduleOut!
    const items = g.world.inZone(cz.id).filter((e) => e.data.item)
    expect(items.map((e) => (e.data.item as { id: string }).id)).toEqual(['refinedOre'])
    expect(out.some((o) => Math.hypot(o.x - items[0].x, o.y - items[0].y) < 2)).toBe(true)
    expect(f.data.prod).toBe(null)
  })
})

describe('活體庫號', () => {
  it('隔間門控制台：開關隔間門；開著的隔間不拉回標本，關著的會拉回', () => {
    const { h, g, ps } = setup(3, { stations: ['vivarium'] })
    const vz = zone(g, 'vivarium')
    const con = byDef(g, vz.id, 'fac.cellConsole')
    near(g, ps[1], con, 1.6)
    h.ticks(2)
    const view = facilityView(g, ps[1])
    expect(view?.k).toBe('cells')
    expect(view && view.k === 'cells' ? view.open : []).toEqual([false, false, false, false, false, false])
    const info = cellInfo(vz)
    expect(info.rooms.length).toBe(6)
    expect(info.doors.every((d) => d.length >= 1)).toBe(true)
    // 開隔間 4（蛞蝓仔）
    g.handleCommand(ps[1].slot, { k: 'facility', e: con.id, a: 'cell', s: 3 })
    h.ticks(2)
    expect(info.doors[3].every((d) => !vz.doors[d].locked)).toBe(true)
    const slug = g.world.inZone(vz.id).find((e) => e.def.id === 'creature.slugling' && e.data.cell === info.rooms[3])!
    standAt(g, slug, vz.id, con.x, con.y - 1.4)
    slug.data.frozen = true
    sec(h, 2)
    expect(roomAt(vz.layout!, slug.x, slug.y)?.index).not.toBe(info.rooms[3])
    // 關回去：被拉回隔間
    slug.data.frozen = false
    g.handleCommand(ps[1].slot, { k: 'facility', e: con.id, a: 'cell', s: 3 })
    sec(h, 2)
    expect(info.doors[3].every((d) => vz.doors[d].locked)).toBe(true)
    expect(roomAt(vz.layout!, slug.x, slug.y)?.index).toBe(info.rooms[3])
  })

  it('籠子：平台上的標本 10 秒後被關進籠子；籠子推得動、打破會放出來', () => {
    const { h, g, ps } = setup(3, { stations: ['vivarium'] })
    const vz = zone(g, 'vivarium')
    const con = byDef(g, vz.id, 'fac.cageConsole')
    const pads = markersOf(vz).cagePad!
    const rab = spawnCreature(g, 'creature.rabbit', vz.id, pads[4].x, pads[4].y)!
    rab.data.frozen = true
    near(g, ps[1], con, 1.6)
    h.ticks(2)
    const view = facilityView(g, ps[1])
    expect(view && view.k === 'cage' ? view.pad : -1).toBe(1)
    g.handleCommand(ps[1].slot, { k: 'facility', e: con.id, a: 'cage' })
    sec(h, 10.5)
    expect(rab.removed).toBe(true)
    const cage = byDef(g, vz.id, 'fac.cage')
    expect((cage.data.contents as unknown[]).length).toBe(1)
    expect(cage.x2?.n).toBe(1)
    // 推斥器
    near(g, ps[2], cage, 2)
    const x0 = cage.x
    const y0 = cage.y
    useOn(h, g, ps[2], 'gravPusher', cage)
    sec(h, 2)
    expect(Math.hypot(cage.x - x0, cage.y - y0)).toBeGreaterThan(1)
    const before = count(g, 'creature.rabbit', vz.id)
    damage(g, null, cage, 1000, { pure: true })
    expect(count(g, 'creature.rabbit', vz.id)).toBe(before + 1)
  })
})

describe('女帝號動力分配台', () => {
  it('切換模式：探索艇／站體加成、冷卻；實驗室模式才讓 LQ 倉儲運作；台子被毀回到一般', () => {
    const { h, g, cs, ps } = setup(3)
    const nz = zone(g, 'nyx')
    const con = byDef(g, nz.id, 'struct.power')
    const r = ps[1]
    near(g, r, con, 1.6)
    h.ticks(2)
    const v0 = facilityView(g, r)
    expect(v0?.k).toBe('power')
    expect(v0 && v0.k === 'power' ? v0.mode : -1).toBe(0)
    const inst = createShip(g, SHIP_BY_ID.get('kestrel')!)
    const ship = launchTo(g, inst, 0, 10)
    g.handleCommand(r.slot, { k: 'facility', e: con.id, a: 'power', s: 2 })
    sec(h, 1.2)
    expect(powerOf(g).mode).toBe('explorer')
    expect(ship.buffs.some((b) => b.id === 'bf.power.explorer')).toBe(true)
    g.handleCommand(r.slot, { k: 'facility', e: con.id, a: 'power', s: 3 })
    sec(h, 1.2)
    expect(sEnt(g, 'adjudicatrix').buffs.some((b) => b.id === 'bf.power.station')).toBe(true)
    const v1 = facilityView(g, r)
    expect(v1 && v1.k === 'power' ? v1.cd[2] : 0).toBeGreaterThan(30)
    // 冷卻中不能切回
    g.handleCommand(r.slot, { k: 'facility', e: con.id, a: 'power', s: 2 })
    h.ticks(2)
    expect(powerOf(g).mode).toBe('station')
    // LQ 倉儲：沒電不能拿
    const tz = zone(g, 'tenshu')
    const lq = findIn(g, tz.id, (e) => e.data.vendor === 'lq')
    const q = ps[2]
    near(g, q, lq, 1.6)
    h.ticks(2)
    clearRaw(h)
    g.handleCommand(q.slot, { k: 'buy', e: lq.id, a: 'burstGrenade' })
    h.ticks(2)
    expect(chatOf(h, cl(cs, q))).toContain('@vendor.noPower')
    expect(main(g, q).inv!.some((i) => i?.id === 'burstGrenade')).toBe(false)
    g.handleCommand(r.slot, { k: 'facility', e: con.id, a: 'power', s: 4 })
    h.ticks(2)
    expect(nz.data.labPower).toBe(true)
    g.handleCommand(q.slot, { k: 'buy', e: lq.id, a: 'burstGrenade' })
    h.ticks(2)
    expect(main(g, q).inv!.some((i) => i?.id === 'burstGrenade')).toBe(true)
    // 動力台被毀：回到一般、女帝號緊急照明（自訂）
    damage(g, null, con, 99999, { pure: true })
    h.ticks(2)
    expect(powerOf(g).mode).toBe('normal')
    expect(nz.data.labPower).toBe(false)
    expect(nz.power).toBe('emergency')
  })
})

describe('防禦無人機控制圈', () => {
  it('站上控制圈就操控一架無人機；不能上船、不能駕駛站；離開就斷線', () => {
    const { h, g, ps } = setup(3)
    const nz = zone(g, 'nyx')
    const ring = byDef(g, nz.id, 'struct.droneControl')
    const drone = g.world.get(ring.data.drone as number)!
    expect(drone.def.id).toBe('npc.defenseDrone')
    const r = ps[1]
    const u = main(g, r)
    g.world.relocate(u, nz.id, ring.x, ring.y)
    h.ticks(3)
    expect(r.control).toBe(drone.id)
    expect(drone.owner).toBe(r.slot)
    expect(drone.pilot).toBe(u.id)
    // 指令送到無人機
    const tx = drone.x + 3
    g.handleCommand(r.slot, { k: 'move', x: tx, y: drone.y })
    sec(h, 2)
    expect(drone.x).toBeGreaterThan(tx - 1.5)
    expect(Math.hypot(u.x - ring.x, u.y - ring.y)).toBeLessThan(0.8)
    // 不能上船
    const inst = [...spaceOf(g).ships.values()].find((s) => s.docked?.zone === nz.id)!
    const de = g.world.get(inst.dockedEnt)!
    g.world.relocate(drone, nz.id, de.x, de.y - de.radius - 0.4)
    h.ticks(4)
    expect(drone.zone).toBe(nz.id)
    // 不能駕駛站
    const con = findIn(g, nz.id, (e) => e.data.poi === 'console')
    standAt(g, drone, nz.id, con.x, con.y)
    h.ticks(3)
    expect(spaceOf(g).pilots.get(nz.spaceEnt)).toBeUndefined()
    // 離開控制圈
    standAt(g, u, nz.id, ring.x, ring.y - 3)
    h.ticks(3)
    expect(r.control).toBe(u.id)
    expect(drone.owner).toBe(-1)
  })
})

describe('重力校正', () => {
  it('領取重力校正場 → 只有自己看得到的指揮點 → 鎖定目標與方向 → 目標被一路推走；行星推不動', () => {
    const { h, g, cs, ps } = setup(3)
    const cz = zone(g, 'cinder')
    const vend = findIn(g, cz.id, (e) => e.data.vendor === 'gravity')
    const r = ps[1]
    near(g, r, vend, 1.6)
    h.ticks(2)
    g.handleCommand(r.slot, { k: 'buy', e: vend.id, a: 'gravField' })
    h.ticks(2)
    const d = g.world.get(r.control)!
    expect(d.def.id).toBe('space.gravTargeter')
    h.ticks(2)
    expect(cl(cs, r).ents.has(d.id)).toBe(true)
    for (const q of ps) if (q !== r) expect(cl(cs, q).ents.has(d.id)).toBe(false)
    // 行星推不動
    const v = sEnt(g, 'verdance')
    g.handleCommand(r.slot, { k: 'cast', a: 'grav.target', e: v.id })
    h.ticks(3)
    expect(d.data.gravTarget).toBeUndefined()
    const hulk = sEnt(g, 'hulk7')
    sec(h, 0.6)
    g.handleCommand(r.slot, { k: 'cast', a: 'grav.target', e: hulk.id })
    h.ticks(3)
    expect(d.data.gravTarget).toBe(hulk.id)
    const x0 = hulk.x
    clearRaw(h)
    g.handleCommand(r.slot, { k: 'cast', a: 'grav.angle', x: hulk.x - 10, y: hulk.y })
    h.ticks(3)
    expect(r.control).toBe(r.main)
    expect(d.removed).toBe(true)
    const msg = chatOf(h, cl(cs, ps[0])).find((x) => x.startsWith('@fac.gravActivated'))
    expect(msg).toBeDefined()
    expect(msg).not.toContain(r.name)
    sec(h, 6)
    // 4 × 110 / 100 = 4.4 秒；0.78 × 4.4² ≈ 15 m
    expect(x0 - hulk.x).toBeGreaterThan(12)
    expect(x0 - hulk.x).toBeLessThan(18)
  })
})

describe('其他設施', () => {
  it('未識別物體的符文面板：走近才私下看到啟用碼', () => {
    const { h, g, cs, ps } = setup(3)
    expect(g.triggerEvent!('wormhole', true)).toBe(true)
    const uz = zone(g, 'uo')
    const panel = byDef(g, uz.id, 'fac.codePanel')
    clearRaw(h)
    near(g, ps[1], panel, 1.2)
    h.ticks(12)
    const code = uoCode(g)!
    expect(chatOf(h, cl(cs, ps[1]))).toContain(`@fac.uoCode|code=${code}`)
    for (const q of [ps[0], ps[2]]) expect(chatOf(h, cl(cs, q)).some((x) => x.includes(code))).toBe(false)
  })

  it('企鵝雕像被打破會掉企鵝玩偶', () => {
    const { g } = setup(3)
    const vz = zone(g, 'verdance')
    const st = byDef(g, vz.id, 'fac.penguinStatue')
    damage(g, null, st, 99999, { pure: true })
    expect(st.alive).toBe(false)
    const drops = g.world.inZone(vz.id).filter((e) => (e.data.item as { id?: string } | undefined)?.id === 'penguinPlush')
    expect(drops.length).toBe(1)
  })

  it('控制台被電磁脈衝打到：駕駛者立刻失去控制，停機期間沒人能駕駛', () => {
    const { h, g, ps } = setup(3)
    pilot(h, g, ps[0], 'tenshu')
    const tz = zone(g, 'tenshu')
    const con = findIn(g, tz.id, (e) => e.data.poi === 'console')
    g.script('item.empBurst')!(g, { caster: main(g, ps[1]), x: con.x, y: con.y, zone: tz.id }, { r: 2.5 })
    h.ticks(2)
    expect(ps[0].control).toBe(ps[0].main)
    sec(h, 3)
    expect(spaceOf(g).pilots.get(tz.spaceEnt)).toBeUndefined()
  })

  it('職業固定出生點：艦長在豪勇號、工程師在火口號、王牌在女帝號機庫', () => {
    const { g, ps } = setup(12, { stations: ['caldera'] })
    const byClass = (c: string) => ps.find((p) => p.classId === c)!
    const cap = main(g, byClass('captain'))
    const eng = main(g, byClass('engineer'))
    const ace = main(g, byClass('ace'))
    const bz = zone(g, 'bravado')
    const cz = zone(g, 'caldera')
    const nz = zone(g, 'nyx')
    expect(cap.zone).toBe(bz.id)
    const ck = markersOf(bz).captainSpawn![0]
    expect(Math.hypot(cap.x - ck.x, cap.y - ck.y)).toBeLessThan(2)
    expect(eng.zone).toBe(cz.id)
    const ek = markersOf(cz).engineerSpawn![0]
    expect(Math.hypot(eng.x - ek.x, eng.y - ek.y)).toBeLessThan(2)
    expect(ace.zone).toBe(nz.id)
    expect(roomAt(nz.layout!, ace.x, ace.y)?.spec.id).toBe('hangar')
    // 火口號沒啟用：工程師照一般規則
    const s2 = setup(3)
    expect(classSpawn(s2.g, 'engineer')).toBe(null)
  })
})

describe('洩漏', () => {
  it('操作設施、駕駛無人機、重力校正、開砲：快照與訊息不洩漏', () => {
    const { h, g, ps } = setup(4, { stations: ['vivarium'] })
    g.setRole(ps[2], 'xeno')
    h.leakWatch = true
    h.ticks(2)
    const nz = zone(g, 'nyx')
    // 動力分配台
    const pc = byDef(g, nz.id, 'struct.power')
    near(g, ps[1], pc, 1.6)
    h.ticks(2)
    g.handleCommand(ps[1].slot, { k: 'facility', e: pc.id, a: 'power', s: 4 })
    h.ticks(4)
    // 無人機
    const ring = byDef(g, nz.id, 'struct.droneControl')
    g.world.relocate(main(g, ps[2]), nz.id, ring.x, ring.y)
    h.ticks(6)
    // 重力校正
    const cz = zone(g, 'cinder')
    const vend = findIn(g, cz.id, (e) => e.data.vendor === 'gravity')
    near(g, ps[3], vend, 1.6)
    h.ticks(2)
    g.handleCommand(ps[3].slot, { k: 'buy', e: vend.id, a: 'gravField' })
    h.ticks(4)
    g.handleCommand(ps[3].slot, { k: 'cast', a: 'grav.target', e: sEnt(g, 'hulk7').id })
    sec(h, 0.6)
    g.handleCommand(ps[3].slot, { k: 'cast', a: 'grav.angle', x: 0, y: 0 })
    h.ticks(4)
    // 開砲
    pilot(h, g, ps[0], 'tenshu')
    g.handleCommand(ps[0].slot, { k: 'cast', a: 'st.cannon', e: sEnt(g, 'hulk7').id })
    sec(h, 3)
    expect([...new Set(h.leakProblems)]).toEqual([])
  })
})
