// 太空層與跨層移動（研究 03 §1.3、§2）：控制台駕駛、探索艇登艇／發射／停靠／強行登艦、站點毀滅連帶全滅、逃生艙
import { SHIPS, SHIP_BY_ID, type ShipDef } from '../../shared/content/ships'
import type { StationDef } from '../../shared/content/stations/types'
import { unitDef } from '../../shared/content/registry'
import { NEUTRAL, type Ent } from '../ent'
import type { Game, GamePlayer } from '../game'
import { SPACE_ZONE, type Zone } from '../world'
import { DEATH_HOOKS, damage } from './damage'
import { regScript } from './effects'
import { applyBuff, removeBuff } from './buffs'
import { issue } from './orders'
import { INSTANT_ITEMS } from './vendors'

export interface ShipInst {
  key: string
  def: ShipDef
  zone: number
  /** 停在哪個站的哪個停機坪 */
  docked: { zone: number; pad: number } | null
  dockedEnt: number
  spaceEnt: number
  mother: number
  launchAt: number
  launching: boolean
  link: string | null
  linkUntil: number
  /** 開局隱藏（王牌飛行員沒人抽到時）*/
  hidden: boolean
}

export interface SpaceState {
  ships: Map<string, ShipInst>
  /** zone id → 該站停機坪是否被佔用 */
  pads: Map<number, (string | null)[]>
  /** 駕駛：vehicle ent id → pilot ent id */
  pilots: Map<number, number>
  sunFactor: number
  pods: Map<number, { slot: number; target: number; hpK: number }>
}

const CONSOLE_R = 1.0
const BOARD_CD = 8
const LAUNCH_S = 10

export function spaceOf(g: Game): SpaceState {
  return (g.data.space ??= { ships: new Map(), pads: new Map(), pilots: new Map(), sunFactor: 1, pods: new Map() }) as SpaceState
}

function shipStationDef(def: ShipDef): StationDef {
  return {
    id: 'ship:' + def.id,
    name: def.name,
    theme: 'ship',
    layout: def.layout,
    space: { hp: def.space.hp, hpRegen: 0, radius: def.space.radius, pos: [0, 0], speed: def.space.speed, abilities: def.space.abilities, pilotable: true, model: 'ship.' + def.id },
    enable: 'core',
    scanTime: 0.2,
    dockable: false,
  }
}

/** 開局：建立停在各站的船、王牌的戰機 */
export function setupShips(g: Game): void {
  const sp = spaceOf(g)
  const w = g.world
  for (const z of [...w.zones]) {
    if (!z.station || z.station.id.startsWith('ship:')) continue
    sp.pads.set(z.id, z.layout!.pads.map(() => null))
    for (const d of z.station.docked ?? []) {
      const def = SHIP_BY_ID.get(d.ship)
      if (!def) continue
      const inst = createShip(g, def)
      dock(g, inst, z.id, d.pad)
    }
  }
  // 王牌飛行員的槍騎級戰機：停在女帝號停機坪旁的太空中（沒人抽到 Ace 時隱藏）
  const ace = g.allPlayers().some((p) => p.classId === 'ace')
  const lancer = SHIP_BY_ID.get('lancer')
  const nyx = w.zones.find((z) => z.key === 'nyx')
  if (lancer && nyx && ace) {
    const inst = createShip(g, lancer)
    const st = w.get(nyx.spaceEnt)
    if (st) launchTo(g, inst, st.x + st.radius + 2.5, st.y - 1.5)
    inst.mother = nyx.id
  }
  void SHIPS
  // 恆星
  const sun = w.spawn(unitDef('space.sun'), SPACE_ZONE, 6.5, -2.9, NEUTRAL)
  sun.global = true
}

let shipSeq = 0
function createShip(g: Game, def: ShipDef): ShipInst {
  const key = `ship:${def.id}:${++shipSeq}`
  const z = g.world.addInterior(key, shipStationDef(def))
  z.data.ship = key
  const inst: ShipInst = { key, def, zone: z.id, docked: null, dockedEnt: 0, spaceEnt: 0, mother: 1, launchAt: 0, launching: false, link: null, linkUntil: 0, hidden: false }
  spaceOf(g).ships.set(key, inst)
  for (const poi of z.layout!.pois) {
    if (poi.def.kind === 'vendor') g.placePoi?.(z, poi)
    if (poi.def.kind === 'shipConsole') z.data.console = { x: poi.x, y: poi.y }
  }
  return inst
}

function dock(g: Game, inst: ShipInst, zoneId: number, pad: number, hpK = 1): boolean {
  const sp = spaceOf(g)
  const z = g.world.zones[zoneId]
  const pads = sp.pads.get(zoneId)
  if (!z?.layout || !pads || pad < 0 || pad >= pads.length || pads[pad]) return false
  const at = z.layout.pads[pad]
  const e = g.world.spawn(unitDef('docked.' + inst.def.id), zoneId, at.x, at.y, NEUTRAL)
  e.hp = e.maxHp * hpK
  e.data.ship = inst.key
  e.facing = -Math.PI / 2
  pads[pad] = inst.key
  inst.docked = { zone: zoneId, pad }
  inst.dockedEnt = e.id
  inst.mother = zoneId
  inst.launching = false
  return true
}

function freePad(g: Game, zoneId: number): number {
  const pads = spaceOf(g).pads.get(zoneId)
  if (!pads) return -1
  const free = pads.map((p, i) => (p ? -1 : i)).filter((i) => i >= 0)
  return free.length ? g.world.rng.pick(free) : -1
}

function launchTo(g: Game, inst: ShipInst, x: number, y: number, hpK = 1): Ent {
  const e = g.world.spawn(unitDef('ship.' + inst.def.id), SPACE_ZONE, x, y, NEUTRAL)
  e.global = true
  e.hp = e.maxHp * hpK
  e.data.ship = inst.key
  e.data.interior = inst.zone
  g.world.zones[inst.zone].spaceEnt = e.id
  inst.spaceEnt = e.id
  return e
}

function undock(g: Game, inst: ShipInst): void {
  if (!inst.docked) return
  const pads = spaceOf(g).pads.get(inst.docked.zone)
  if (pads) pads[inst.docked.pad] = null
  const de = g.world.get(inst.dockedEnt)
  const hpK = de ? de.hp / de.maxHp : 1
  if (de) g.world.remove(de)
  const motherEnt = g.world.get(g.world.zones[inst.docked.zone].spaceEnt)
  inst.docked = null
  inst.dockedEnt = 0
  const mx = motherEnt?.x ?? 0
  const my = motherEnt?.y ?? 0
  const r = (motherEnt?.radius ?? 2) + 1.5
  const a = g.world.rng.range(0, Math.PI * 2)
  launchTo(g, inst, mx + Math.cos(a) * r, my + Math.sin(a) * r, hpK)
  g.emitFx({ k: 'launch', z: SPACE_ZONE, x: mx + Math.cos(a) * r, y: my + Math.sin(a) * r, e: inst.spaceEnt })
}

// ───────── 駕駛 ─────────

function consolePos(g: Game, z: Zone): { x: number; y: number; ent?: Ent } | null {
  if (z.data.console) return z.data.console as { x: number; y: number }
  if (!z.station || z.station.id.startsWith('ship:')) return null
  const c = [...g.world.inZone(z.id)].find((e) => e.data.poi === 'console')
  return c ? { x: c.x, y: c.y, ent: c } : null
}

function setPilot(g: Game, vehicle: Ent, pilot: Ent | null): void {
  const sp = spaceOf(g)
  const prev = sp.pilots.get(vehicle.id)
  if (prev === (pilot?.id ?? undefined)) return
  if (prev) {
    const pe = g.world.get(prev)
    const pp = pe ? g.players[pe.owner] : undefined
    if (pp && pp.control === vehicle.id) pp.control = pp.main
    sp.pilots.delete(vehicle.id)
  }
  vehicle.order = null
  vehicle.queue.length = 0
  if (!pilot) {
    vehicle.owner = NEUTRAL
    vehicle.anon = false
    vehicle.pilot = 0
    return
  }
  const p = g.players[pilot.owner]
  if (!p) return
  sp.pilots.set(vehicle.id, pilot.id)
  vehicle.owner = pilot.owner
  vehicle.anon = pilot.anon
  vehicle.pilot = pilot.id
  vehicle.color = pilot.anon ? -1 : pilot.color
  p.control = vehicle.id
  if (pilot.def.speed > 0) issue(pilot, null)
  // 王牌飛行員：駕駛的船／站攻速 +15%；重力學博士：船速 +15%
  vehicle.data.passives = [...(p.classId === 'ace' ? ['bf.acePilot'] : []), ...(p.phd === 'gravitics' ? ['bf.gravPilot'] : [])]
  vehicle.statsDirty = true
  g.privateLine(p.slot, 'space.accessGranted', { name: vehicle.def.name.zh })
}

export function stepSpace(g: Game): void {
  const sp = spaceOf(g)
  const t = g.time
  const w = g.world
  // 登艇 / 下艇
  if (w.tick % 2 === 0) {
    for (const inst of sp.ships.values()) {
      const z = w.zones[inst.zone]
      if (!z.alive) continue
      // 從站內走進停泊的船
      if (inst.docked) {
        const de = w.get(inst.dockedEnt)
        if (de) {
          for (const u of w.query(de.zone, de.x, de.y, de.radius + 0.8)) {
            if (!canTravel(g, u) || (u.data.boardCd ?? 0) > t) continue
            enterShip(g, u, inst)
          }
        }
      }
      // 從出入口離開
      const exit = z.layout!.exits[0]
      if (exit) {
        for (const u of w.query(z.id, exit.x, exit.y, 0.7)) {
          if (!canTravel(g, u) || (u.data.boardCd ?? 0) > t) continue
          if (!u.data.offPad) continue
          exitShip(g, u, inst)
        }
        for (const u of w.inZone(z.id)) if (Math.hypot(u.x - exit.x, u.y - exit.y) > 1.2) u.data.offPad = true
      }
      if (inst.link && t > inst.linkUntil) inst.link = null
    }
  }
  // 控制台
  for (const z of w.zones) {
    if (!z.alive || !z.layout) continue
    const c = consolePos(g, z)
    if (!c) continue
    const vehicle = w.get(z.spaceEnt)
    const ship = z.data.ship ? sp.ships.get(z.data.ship as string) : undefined
    let pilot: Ent | null = null
    for (const u of w.query(z.id, c.x, c.y, CONSOLE_R)) {
      if (!u.alive || !u.isMain || u.owner < 0) continue
      pilot = u
      break
    }
    if (c.ent && (!c.ent.alive || (c.ent.data.disabledUntil ?? 0) > t || c.ent.def.id === 'struct.consoleBroken')) pilot = null
    if (ship?.docked) {
      // 停泊中：站上控制台開始發射倒數
      if (pilot && !ship.launching) {
        ship.launching = true
        ship.launchAt = t + LAUNCH_S
        for (const u of w.inZone(z.id)) if (u.owner >= 0 && u.isMain) g.privateLine(u.owner, 'space.launching', { s: LAUNCH_S })
        g.emitFx({ k: 'alarm', z: z.id, x: c.x, y: c.y })
      }
      if (!pilot && ship.launching && t < ship.launchAt - 3) ship.launching = false
      if (ship.launching && t >= ship.launchAt) undock(g, ship)
      continue
    }
    if (!vehicle || !vehicle.alive) continue
    const cur = sp.pilots.get(vehicle.id)
    const curEnt = cur ? w.get(cur) : undefined
    const stillThere = curEnt && curEnt.alive && curEnt.zone === z.id && Math.hypot(curEnt.x - c.x, curEnt.y - c.y) <= CONSOLE_R + 0.2 && curEnt.isMain
    if (stillThere) continue
    setPilot(g, vehicle, pilot)
  }
  // 逃生艙航行
  for (const [podId, pod] of sp.pods) {
    const e = w.get(podId)
    if (!e) {
      sp.pods.delete(podId)
      continue
    }
    if (pod.target < 0) continue
    const tz = w.zones[pod.target]
    const te = tz?.alive ? w.get(tz.spaceEnt) : undefined
    if (!te) {
      pod.target = -1
      continue
    }
    const d = Math.hypot(te.x - e.x, te.y - e.y)
    if (d <= te.radius * 1.2 + 0.5) {
      landPod(g, e, pod, tz)
      continue
    }
    e.order = { k: 'move', x: te.x, y: te.y }
  }
  // 恆星灼燒
  if (w.tick % 10 === 0) {
    for (const sun of w.inZone(SPACE_ZONE)) {
      if (sun.def.id !== 'space.sun') continue
      for (const e of w.query(SPACE_ZONE, sun.x, sun.y, 6)) {
        if (e === sun || !e.alive) continue
        damage(g, null, e, 750 * sp.sunFactor, { kind: 'fire', pure: true })
      }
    }
  }
}

function canTravel(g: Game, u: Ent): boolean {
  if (!u.alive || u.def.speed <= 0 || u.tags.has('structure') || u.tags.has('noTarget') || u.data.zoneObj) return false
  if (u.tags.has('cocoon') || u.data.frozen) return false
  void g
  return u.owner >= 0 || u.tags.has('cage')
}

function enterShip(g: Game, u: Ent, inst: ShipInst): void {
  const z = g.world.zones[inst.zone]
  const exit = z.layout!.exits[0] ?? z.layout!.spawns[0] ?? { x: 3, y: 3 }
  const n = z.nav!.nearestOpen(exit.x + 1.6, exit.y) ?? exit
  g.world.relocate(u, inst.zone, n.x, n.y)
  u.data.boardCd = g.time + BOARD_CD
  u.data.offPad = false
  issue(u, null)
  g.emitFx({ k: 'board', z: inst.zone, x: n.x, y: n.y, e: u.id })
}

function exitShip(g: Game, u: Ent, inst: ShipInst): void {
  const sp = spaceOf(g)
  if (inst.docked) {
    const de = g.world.get(inst.dockedEnt)
    if (!de) return
    const sz = g.world.zones[de.zone]
    const n = sz.nav!.nearestOpen(de.x, de.y - de.radius - 0.9) ?? { x: de.x, y: de.y }
    g.world.relocate(u, de.zone, n.x, n.y)
  } else if (inst.link) {
    const other = sp.ships.get(inst.link)
    if (!other) return
    const oz = g.world.zones[other.zone]
    const ex = oz.layout!.exits[0]
    const n = oz.nav!.nearestOpen(ex.x + 1.6, ex.y) ?? ex
    g.world.relocate(u, other.zone, n.x, n.y)
  } else return
  u.data.boardCd = g.time + BOARD_CD
  u.data.offPad = false
  issue(u, null)
}

// ───────── 毀滅 ─────────

/** 站點或船艇被擊毀：內部所有單位必死、物品消失，之後 300 秒為致命區 */
export function destroyInterior(g: Game, zoneId: number, killer: Ent | null): void {
  const z = g.world.zones[zoneId]
  if (!z || !z.alive) return
  z.alive = false
  z.lethalUntil = g.time + 300
  const sp = spaceOf(g)
  const name = z.station?.name.zh ?? z.key
  g.systemAll('space.destroyed', { name })
  g.log(`${name} 被摧毀`)
  for (const e of g.world.inZone(zoneId)) {
    e.data.noDrops = true
    if (e.inv) e.inv.fill(null)
    e.suit = null
    if (!e.alive) continue
    if (e.tags.has('structure') || e.data.item) {
      g.world.remove(e)
      continue
    }
    e.data.god = false
    e.buffs = e.buffs.filter((b) => !b.id.startsWith('bf.core'))
    e.statsDirty = true
    damage(g, killer, e, 421337, { lethal: true, pure: true })
    if (e.alive) g.killEnt(e, killer)
  }
  for (const e of g.world.inZone(zoneId)) if (e.data.item || e.tags.has('corpse')) g.world.remove(e)
  // 停在這裡的船一起毀
  for (const inst of sp.ships.values()) {
    if (inst.docked?.zone === zoneId) {
      inst.docked = null
      destroyInterior(g, inst.zone, killer)
    }
  }
  sp.pads.set(zoneId, [])
}

export function installSpace(g: Game): void {
  DEATH_HOOKS.push((g2, u, killer) => {
    if (g2 !== g) return
    if (u.zone === SPACE_ZONE && u.data.interior) {
      g.emitFx({ k: 'stationBoom', z: SPACE_ZONE, x: u.x, y: u.y, v: u.radius })
      const sp = spaceOf(g)
      sp.pilots.delete(u.id)
      destroyInterior(g, u.data.interior as number, killer)
    }
    // 停泊模型被打爆 → 船毀
    if (u.data.ship && u.zone !== SPACE_ZONE) {
      const inst = spaceOf(g).ships.get(u.data.ship as string)
      if (inst?.docked) {
        const pads = spaceOf(g).pads.get(inst.docked.zone)
        if (pads) pads[inst.docked.pad] = null
        inst.docked = null
        destroyInterior(g, inst.zone, killer)
      }
    }
    // 逃生艙被擊毀 → 乘員死亡
    const pod = spaceOf(g).pods.get(u.id)
    if (pod) {
      spaceOf(g).pods.delete(u.id)
      const p = g.players[pod.slot]
      const m = p ? g.mainOf(p) : undefined
      if (m) {
        m.data.god = false
        g.killEnt(m, killer)
      }
    }
  })
  g.systems.push({ name: 'space', fn: stepSpace })
  // 致命區
  g.systems.push({
    name: 'lethal',
    fn: () => {
      if (g.world.tick % 20 !== 0) return
      for (const z of g.world.zones) {
        if (z.alive || z.lethalUntil < g.time) continue
        for (const e of g.world.inZone(z.id)) if (e.alive && !e.tags.has('structure')) damage(g, null, e, 421337, { lethal: true, pure: true })
      }
    },
  })
  g.destroyStation = (key) => {
    const z = g.world.zones.find((q) => q.key === key && q.alive)
    if (!z) return false
    const se = g.world.get(z.spaceEnt)
    if (se) {
      se.data.god = false
      g.killEnt(se, null, -1)
    } else destroyInterior(g, z.id, null)
    return true
  }
  INSTANT_ITEMS.set('escapePass', (g2, buyer) => startPod(g2, buyer))
}

// ───────── 逃生艙 ─────────

function startPod(g: Game, u: Ent): boolean {
  const p = g.players[u.owner]
  if (!p || p.main !== u.id) return false
  const z = g.world.zones[u.zone]
  const st = g.world.get(z.spaceEnt)
  if (!st || u.tags.has('cocoon') || p.evolvingUntil) return false
  if ((p.data.podCd ?? 0) > g.time) {
    g.privateLine(p.slot, 'space.podCooldown', { s: Math.ceil(p.data.podCd - g.time) })
    return false
  }
  p.data.podCd = g.time + 100
  const ox = u.x
  const oy = u.y
  const hp0 = u.hp
  g.privateLine(p.slot, 'space.podPreparing')
  g.after(4, () => {
    if (!u.alive || u.zone !== z.id || Math.hypot(u.x - ox, u.y - oy) > 0.9 || hp0 - u.hp >= 35 || !z.alive) {
      g.privateLine(p.slot, 'space.podFailed')
      return
    }
    const pod = g.world.spawn(unitDef('ship.pod'), SPACE_ZONE, st.x + st.radius + 1, st.y, p.slot)
    pod.global = true
    pod.name = ''
    pod.anon = u.anon
    const hpK = u.hp / u.maxHp
    spaceOf(g).pods.set(pod.id, { slot: p.slot, target: -1, hpK })
    // 乘員藏起來（暫時移出世界的可見範圍）
    u.data.frozen = true
    u.data.god = true
    u.statsDirty = true
    u.data.inPod = pod.id
    g.world.relocate(u, SPACE_ZONE, pod.x, pod.y)
    u.data.ghost = true
    u.data.noVision = true
    p.control = pod.id
  })
  return true
}

function landPod(g: Game, pod: Ent, info: { slot: number; hpK: number }, z: Zone): void {
  const p = g.players[info.slot]
  const u = p ? g.mainOf(p) : undefined
  spaceOf(g).pods.delete(pod.id)
  g.world.remove(pod)
  if (!p || !u || !z.layout) return
  const land = z.layout.pois.find((q) => q.key === (z.station?.podLanding ?? 'y')) ?? null
  const at = land ? { x: land.x, y: land.y } : (z.layout.spawns[0] ?? { x: z.layout.w / 2, y: z.layout.h / 2 })
  const n = z.nav!.nearestOpen(at.x, at.y - 1.2) ?? at
  g.world.relocate(u, z.id, n.x, n.y)
  u.data.frozen = false
  u.data.god = false
  u.data.ghost = false
  u.data.noVision = false
  u.data.inPod = undefined
  u.statsDirty = true
  applyBuff(g, u, 'bf.podArrive', 4)
  p.control = u.id
}

// ───────── 技能腳本 ─────────

regScript('space.dock', (g, ctx) => {
  const ship = ctx.caster
  const t = ctx.target
  const inst = ship.data.ship ? spaceOf(g).ships.get(ship.data.ship as string) : undefined
  if (!inst || !t?.data.interior) return
  const zid = t.data.interior as number
  const z = g.world.zones[zid]
  if (!z.station || z.station.dockable === false) {
    if (ship.owner >= 0) g.privateLine(ship.owner, 'space.useBoarding')
    return
  }
  const pad = freePad(g, zid)
  if (pad < 0) {
    if (ship.owner >= 0) g.privateLine(ship.owner, 'space.noPads')
    return
  }
  const hpK = ship.hp / ship.maxHp
  setPilot(g, ship, null)
  inst.spaceEnt = 0
  g.world.zones[inst.zone].spaceEnt = 0
  g.world.remove(ship)
  dock(g, inst, zid, pad, hpK)
  g.emitFx({ k: 'dock', z: SPACE_ZONE, x: t.x, y: t.y })
})

regScript('space.board', (g, ctx) => {
  const a = ctx.caster
  const b = ctx.target
  const sp = spaceOf(g)
  const ia = a.data.ship ? sp.ships.get(a.data.ship as string) : undefined
  const ib = b?.data.ship ? sp.ships.get(b.data.ship as string) : undefined
  if (!ia || !ib || !b || ia === ib) return
  ia.link = ib.key
  ib.link = ia.key
  ia.linkUntil = ib.linkUntil = g.time + 20
  applyBuff(g, a, 'bf.boarding', 20)
  applyBuff(g, b, 'bf.boarding', 20)
  g.emitFx({ k: 'boardLink', z: SPACE_ZONE, x: a.x, y: a.y, x2: b.x, y2: b.y })
})

regScript('space.unboard', (g, ctx) => {
  const sp = spaceOf(g)
  const ia = ctx.caster.data.ship ? sp.ships.get(ctx.caster.data.ship as string) : undefined
  if (!ia?.link) return
  const ib = sp.ships.get(ia.link)
  ia.link = null
  if (ib) {
    ib.link = null
    const be = g.world.get(ib.spaceEnt)
    if (be) removeBuff(g, be, 'bf.boarding')
  }
  removeBuff(g, ctx.caster, 'bf.boarding')
})

regScript('space.scan', (g, ctx) => {
  const t = ctx.target
  const slot = ctx.caster.owner
  if (!t?.data.interior || slot < 0) return
  const z = g.world.zones[t.data.interior as number]
  const delay = z.station?.scanTime ?? 1
  g.after(delay, () => {
    let n = 0
    for (const e of g.world.inZone(z.id)) if (e.alive && e.isMain) n++
    g.privateLine(slot, 'space.scanResult', { name: z.station?.name.zh ?? z.key, n })
  })
})

regScript('space.sweep', (g, ctx) => {
  const st = ctx.caster
  const zid = st.data.interior as number | undefined
  if (zid === undefined || st.owner < 0) return
  const z = g.world.zones[zid]
  for (const e of g.world.inZone(zid)) {
    if (!e.alive || !e.isMain) continue
    g.emitFx({ k: 'ping', z: zid, x: e.x, y: e.y }, [st.owner])
    if (e.owner >= 0) g.privateLine(e.owner, 'space.sweepAnnounce', { name: z.station?.name.zh ?? '' })
  }
  const p = g.players[st.owner]
  if (p) p.view.extraSources.push({ zone: zid, x: z.layout!.w / 2, y: z.layout!.h / 2, r: Math.max(z.layout!.w, z.layout!.h), until: g.time + 7 })
})

regScript('space.forceDock', (g, ctx) => {
  const t = ctx.target
  if (!t?.data.ship) return
  const nyx = g.world.zones.find((z) => z.key === 'nyx' && z.alive)
  const ne = nyx ? g.world.get(nyx.spaceEnt) : undefined
  if (!ne) return
  g.after(0.1, () => g.script('space.dock')?.(g, { caster: t, target: ne, x: ne.x, y: ne.y, zone: SPACE_ZONE }, {}))
})

regScript('space.podTarget', (g, ctx) => {
  const pod = spaceOf(g).pods.get(ctx.caster.id)
  const t = ctx.target
  if (!pod || !t?.data.interior) return
  const z = g.world.zones[t.data.interior as number]
  if (z.data.ship || z.station?.id === 'hulk7') return
  pod.target = z.id
})

export function pilotOf(g: Game, vehicle: Ent): GamePlayer | undefined {
  const pid = spaceOf(g).pilots.get(vehicle.id)
  const pe = pid ? g.world.get(pid) : undefined
  return pe ? g.players[pe.owner] : undefined
}
