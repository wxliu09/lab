// 站點技能與太空層天體運動（M7；研究 03 §1.1、§2.3、§3.2、§4.2、§4.3、§4.7）：
// 天守主砲與反物質傳送、豪勇號降落翠原星與自動駕駛、擺渡號傳送台、火口號維修／封鎖／神經毒素、
// 女帝號輔助推進跳躍、餘燼衛星重力校正、翠原星與餘燼衛星公轉。
// 全站廣播一律不提是誰操作的；給操作者的回饋走 privateLine。
import { GRAV_ACCEL, GRAV_PV } from '../../shared/content/facilities'
import { abilityDef, unitDef } from '../../shared/content/registry'
import { NEUTRAL, dist, type Ent } from '../ent'
import type { Game } from '../game'
import { markersOf } from '../setup'
import { SPACE_HALF, SPACE_ZONE, type Zone } from '../world'
import { applyBuff, hasBuff, removeBuff } from './buffs'
import { DEATH_HOOKS, damage } from './damage'
import { regScript } from './effects'
import { tenshuDischarged } from './events'
import { moveBy } from './movement'
import { issue } from './orders'
import { setPilot, spaceOf } from './space'

// ───────── 數值（公尺／秒；原作 world units ÷ 100）─────────

/** 天守主砲能量球：120 u/s、碰撞 100 u（研究 03 §4.2）*/
export const ORB_SPEED = 1.2
export const ORB_HIT = 1.0
/** 能量球最長存活（自訂：防止永遠追不到）*/
const ORB_LIFE = 240
/** 站體供能時主砲冷卻（研究 03 §4.4）*/
export const CANNON_CD_POWERED = 160
/** 反物質傳送：鎖定 60 秒後 900000（研究 03 §3.2 ATM）*/
export const ATM_DELAY = 60
export const ATM_DMG = 900000
/** 豪勇號升空倒數（研究 03 §2.3 A04Q）*/
export const LAUNCH_DELAY = 45
/** 自動駕駛前進距離（研究 03 §2.3：5000 u）*/
export const AUTOPILOT_DIST = 50
/** 擺渡號：充能 19.5 秒、抵達 5 秒無敵（研究 03 §2.3）*/
export const PORT_CHARGE = 19.5
/** 封鎖信標：門鎖死秒數（自訂；本作把原作的信標光束改成封鎖目標站的門）*/
export const CORDON_LOCK = 20
/** 神經毒素：起始 5、每秒 +0.03（研究 03 §3.2）*/
export const NEURO_BASE = 5
export const NEURO_RAMP = 0.03
/** 女帝號輔助推進：充能 20 秒（研究 03 §2.3 ARD）*/
export const JUMP_CHARGE = 20
/** 重力校正：指揮點存活秒數（自訂）*/
export const GRAV_UPLINK_LIFE = 30
/** 火口號自動維修的檢查間隔 */
const REPAIR_SCAN = 0.1

// ───────── 狀態 ─────────

interface OrbitInst {
  ent: number
  around: string
  r: number
  /** 角速度（rad/s）*/
  w: number
  ang: number
}

interface Orb {
  target: number
  caster: number
  until: number
}

export interface Landed {
  bravado: number
  verdance: number
  bravadoZone: number
  verdanceZone: number
  launchAt: number
  abilities: string[]
}

interface GravPush {
  id: number
  dx: number
  dy: number
  t0: number
  dur: number
}

export interface StationsState {
  orbits: OrbitInst[]
  orbs: Map<number, Orb>
  landed: Landed | null
  pushes: GravPush[]
  nextRepair: number
}

export function stationsOf(g: Game): StationsState {
  return (g.data.stations ??= { orbits: [], orbs: new Map(), landed: null, pushes: [], nextRepair: 0 }) as StationsState
}

const zoneByKey = (g: Game, key: string): Zone | undefined => g.world.zones.find((z) => z.key === key && z.alive)

function spaceEntOf(g: Game, key: string): Ent | undefined {
  const z = zoneByKey(g, key)
  return z ? g.world.get(z.spaceEnt) : undefined
}

function stName(g: Game, e: Ent): string {
  const zid = e.data.interior as number | undefined
  const z = zid !== undefined ? g.world.zones[zid] : undefined
  return z?.station?.name.zh ?? e.def.name.zh
}

function clampSpace(v: number, margin = 1): number {
  return Math.max(-SPACE_HALF + margin, Math.min(SPACE_HALF - margin, v))
}

/** 駕駛這個載具的主單位 */
function pilotEnt(g: Game, vehicle: Ent): Ent | undefined {
  const id = spaceOf(g).pilots.get(vehicle.id)
  return id ? g.world.get(id) : undefined
}

function sayPilot(g: Game, vehicle: Ent, key: string, args?: Record<string, string | number>): void {
  if (vehicle.owner >= 0) g.privateLine(vehicle.owner, key, args)
}

/** 某個 zone 內的主單位擁有者（給站內廣播；不分身分）*/
function mainsIn(g: Game, zid: number): number[] {
  const out = new Set<number>()
  for (const e of g.world.inZone(zid)) if (e.alive && e.isMain && e.owner >= 0) out.add(e.owner)
  return [...out]
}

/** 目標站裡，以及停在裡面的船艙（遞迴）*/
export function zonesInside(g: Game, zid: number, out: number[] = []): number[] {
  if (out.includes(zid)) return out
  out.push(zid)
  for (const inst of spaceOf(g).ships.values()) if (inst.docked?.zone === zid) zonesInside(g, inst.zone, out)
  return out
}

// ───────── 天守主砲 ─────────

function fireOrb(g: Game, st: Ent, t: Ent): Ent {
  const w = g.world
  const a = Math.atan2(t.y - st.y, t.x - st.x)
  const orb = w.spawn(unitDef('space.cannonOrb'), SPACE_ZONE, st.x + Math.cos(a) * (st.radius + 0.6), st.y + Math.sin(a) * (st.radius + 0.6), NEUTRAL)
  orb.global = true
  orb.data.ghost = true
  orb.facing = a
  stationsOf(g).orbs.set(orb.id, { target: t.id, caster: st.id, until: g.time + ORB_LIFE })
  g.emitFx({ k: 'cannonFire', z: SPACE_ZONE, x: st.x, y: st.y, x2: t.x, y2: t.y, e: orb.id })
  // 站內：砲尾開火（render 用）
  const zid = st.data.interior as number | undefined
  const breech = zid !== undefined ? markersOf(g.world.zones[zid]).cannonBreech?.[0] : undefined
  if (zid !== undefined && breech) g.emitFx({ k: 'cannonFire', z: zid, x: breech.x, y: breech.y })
  return orb
}

regScript('st.cannon', (g, ctx) => {
  const st = ctx.caster
  const t = ctx.target
  if (!t) return
  // 站體供能：主砲冷卻 220 → 160
  if ((g.data.power as { mode?: string } | undefined)?.mode === 'station') st.cds.set('st.cannon', g.time + CANNON_CD_POWERED)
  fireOrb(g, st, t)
  g.systemAll('st.cannonFired', { name: stName(g, t) })
  g.log(`天守主砲向 ${stName(g, t)} 開火`)
})

function stepOrbs(g: Game, dt: number): void {
  const S = stationsOf(g)
  if (!S.orbs.size) return
  const w = g.world
  for (const [id, o] of S.orbs) {
    const e = w.get(id)
    if (!e) {
      S.orbs.delete(id)
      continue
    }
    let t = w.get(o.target)
    if (!t || !t.alive || t.zone !== SPACE_ZONE || t.data.landed) {
      // 目標消失：改追翠原星
      const v = spaceEntOf(g, 'verdance')
      if (v && v.id !== o.target && v.alive) {
        o.target = v.id
        t = v
      } else t = undefined
    }
    if (!t || g.time > o.until) {
      g.emitFx({ k: 'cannonFizzle', z: SPACE_ZONE, x: e.x, y: e.y })
      w.remove(e)
      S.orbs.delete(id)
      continue
    }
    const dx = t.x - e.x
    const dy = t.y - e.y
    const d = Math.hypot(dx, dy) || 1
    const step = Math.min(d, ORB_SPEED * dt)
    e.x += (dx / d) * step
    e.y += (dy / d) * step
    e.facing = Math.atan2(dy, dx)
    w.moved(e)
    // 碰到的第一座站（不含施放者、無敵者）
    let hit: Ent | null = null
    for (const s of w.query(SPACE_ZONE, e.x, e.y, ORB_HIT + 4)) {
      if (s === e || !s.alive || s.id === o.caster || !s.tags.has('station') || s.stats.invuln) continue
      if (dist(e, s) > ORB_HIT + s.radius) continue
      hit = s
      break
    }
    if (!hit) continue
    const caster = w.get(o.caster) ?? null
    applyBuff(g, hit, 'bf.cannonBurn', 5, caster)
    g.emitFx({ k: 'cannonHit', z: SPACE_ZONE, x: e.x, y: e.y, e: hit.id, v: hit.radius })
    tenshuDischarged(g, hit)
    w.remove(e)
    S.orbs.delete(id)
  }
}

// ───────── 反物質傳送（天守砲台＋模組）─────────

regScript('st.antimatter', (g, ctx) => {
  const st = ctx.caster
  const t = ctx.target
  if (!t) return
  st.abilities = st.abilities.filter((a) => a !== 'st.antimatter')
  const name = stName(g, t)
  g.systemAll('st.atmLock', { name, s: ATM_DELAY })
  g.emitFx({ k: 'atmLock', z: SPACE_ZONE, x: t.x, y: t.y, e: t.id, v: ATM_DELAY })
  g.after(ATM_DELAY, () => {
    if (!t.alive || t.zone !== SPACE_ZONE) return
    g.emitFx({ k: 'atmStrike', z: SPACE_ZONE, x: t.x, y: t.y, e: t.id, v: t.radius })
    damage(g, st.alive ? st : null, t, ATM_DMG, { kind: 'chaos', pure: true })
  })
})

// ───────── 豪勇號降落翠原星 ─────────

function landingPortals(g: Game, zid: number): Ent[] {
  return g.world.inZone(zid).filter((e) => e.def.id === 'fac.landingPortal')
}

function setPortals(g: Game, L: Landed, on: boolean): void {
  for (const zid of [L.bravadoZone, L.verdanceZone]) {
    for (const p of landingPortals(g, zid)) p.x2 = { on: on ? 1 : 0 }
    for (const s of g.world.inZone(zid)) if (s.def.id === 'fac.landingSite') s.x2 = { landed: on ? 1 : 0 }
  }
}

regScript('st.land', (g, ctx) => {
  const b = ctx.caster
  const v = ctx.target
  const S = stationsOf(g)
  if (!v || S.landed || b.data.landed) return
  const bz = b.data.interior as number
  const vz = v.data.interior as number
  if (bz === undefined || vz === undefined) return
  const L: Landed = { bravado: b.id, verdance: v.id, bravadoZone: bz, verdanceZone: vz, launchAt: 0, abilities: b.abilities }
  S.landed = L
  b.data.landed = true
  b.data.ghost = true
  b.abilities = [...b.abilities.filter((a) => a !== 'st.land' && a !== 'st.autopilot'), 'st.launch']
  b.order = null
  b.queue.length = 0
  applyBuff(g, b, 'bf.landed')
  b.x = v.x
  b.y = v.y
  g.world.moved(b)
  setPortals(g, L, true)
  g.emitFx({ k: 'bravadoLand', z: SPACE_ZONE, x: v.x, y: v.y, e: b.id })
  for (const s of [...mainsIn(g, bz), ...mainsIn(g, vz)]) g.privateLine(s, 'st.bravadoLanded')
  g.log('豪勇號降落在翠原星')
})

regScript('st.launch', (g, ctx) => {
  const L = stationsOf(g).landed
  if (!L || L.bravado !== ctx.caster.id || L.launchAt) return
  L.launchAt = g.time + LAUNCH_DELAY
  g.systemAll('st.bravadoLaunching', { s: LAUNCH_DELAY })
})

/** 豪勇號升空：出現在翠原星旁邊，恢復技能，傳送門關閉 */
function liftOff(g: Game, L: Landed): void {
  const S = stationsOf(g)
  S.landed = null
  const b = g.world.get(L.bravado)
  setPortals(g, L, false)
  if (!b || !b.alive) return
  const v = g.world.get(L.verdance)
  removeBuff(g, b, 'bf.landed')
  b.data.landed = false
  b.data.ghost = false
  b.abilities = L.abilities.filter((a) => a !== 'st.launch')
  for (const a of ['st.land', 'st.autopilot']) if (abilityDef(a) && !b.abilities.includes(a) && L.abilities.includes(a)) b.abilities.push(a)
  if (v) {
    const a = b.facing
    const r = v.radius + b.radius + 0.6
    b.x = clampSpace(v.x + Math.cos(a) * r)
    b.y = clampSpace(v.y + Math.sin(a) * r)
    g.world.moved(b)
  }
  g.emitFx({ k: 'bravadoLaunch', z: SPACE_ZONE, x: b.x, y: b.y, e: b.id })
  g.log('豪勇號從翠原星升空')
}

function stepLanded(g: Game): void {
  const L = stationsOf(g).landed
  if (!L) return
  const b = g.world.get(L.bravado)
  const v = g.world.get(L.verdance)
  if (!b || !b.alive) {
    liftOff(g, L)
    return
  }
  if (v) {
    b.x = v.x
    b.y = v.y
    g.world.moved(b)
  }
  if (L.launchAt && g.time >= L.launchAt) liftOff(g, L)
}

// ───────── 豪勇號自動駕駛 ─────────

regScript('st.autopilot', (g, ctx) => {
  const b = ctx.caster
  if (b.data.landed) return
  const zid = b.data.interior as number | undefined
  const pe = pilotEnt(g, b)
  if (pe && zid !== undefined) {
    const z = g.world.zones[zid]
    z.data.consoleLock = [...((z.data.consoleLock as number[] | undefined) ?? []), pe.id]
    if (pe.owner >= 0) g.privateLine(pe.owner, 'st.autopilotOn', { d: AUTOPILOT_DIST })
  }
  setPilot(g, b, null)
  const tx = clampSpace(b.x + Math.cos(b.facing) * AUTOPILOT_DIST)
  const ty = clampSpace(b.y + Math.sin(b.facing) * AUTOPILOT_DIST)
  issue(b, { k: 'move', x: tx, y: ty })
})

// ───────── 擺渡號傳送台 ─────────

/** 傳送／降落目的地：逃生艙落點 → 出生點 → 出入口 → 第一個房間 */
export function arrivalPoint(z: Zone): { x: number; y: number } {
  const l = z.layout!
  const key = z.station?.podLanding
  const poi = key ? l.pois.find((q) => q.key === key) : undefined
  if (poi) return { x: poi.x, y: poi.y - 1.2 }
  const at = l.spawns[0] ?? l.exits[0] ?? (l.rooms[0] ? { x: l.rooms[0].cx, y: l.rooms[0].cy } : { x: l.w / 2, y: l.h / 2 })
  return { x: at.x, y: at.y }
}

function portTargetOk(g: Game, zid: number | undefined): Zone | null {
  if (zid === undefined) return null
  const z = g.world.zones[zid]
  if (!z || !z.alive || !z.layout || !z.nav) return null
  const se = g.world.get(z.spaceEnt)
  if (se) return se.alive && se.zone === SPACE_ZONE && !se.data.landed ? z : null
  // 停泊中的船也可以（研究 03 §2.3）
  const inst = z.data.ship ? spaceOf(g).ships.get(z.data.ship as string) : undefined
  return inst?.docked ? z : null
}

regScript('st.portTarget', (g, ctx) => {
  const st = ctx.caster
  const t = ctx.target
  const own = st.data.interior as number | undefined
  if (own === undefined) return
  const tz = t?.data.interior !== undefined ? portTargetOk(g, t.data.interior as number) : null
  if (!t || !tz || tz.id === own) {
    sayPilot(g, st, 'st.portBadTarget')
    return
  }
  g.world.zones[own].data.portTarget = tz.id
  sayPilot(g, st, 'st.portTargetSet', { name: tz.station?.name.zh ?? '' })
})

/** 站在傳送台（9 格）上的單位 */
export function unitsOnPads(g: Game, z: Zone, kind: string, filter: (e: Ent) => boolean): Ent[] {
  const pads = markersOf(z)[kind] ?? []
  const out: Ent[] = []
  if (!pads.length) return out
  for (const e of g.world.inZone(z.id)) {
    if (!filter(e)) continue
    if (pads.some((p) => Math.abs(p.x - e.x) <= 0.5 + e.radius * 0.5 && Math.abs(p.y - e.y) <= 0.5 + e.radius * 0.5)) out.push(e)
  }
  return out
}

/** 會被傳送的東西：活著、會動的單位（含牢籠），不含建築與特效 */
export function transportable(e: Ent): boolean {
  if (!e.alive || e.tags.has('structure') || e.tags.has('noTarget') || e.data.zoneObj || e.data.item) return false
  if (e.tags.has('cocoon') || e.data.frozen) return false
  return e.def.speed > 0 || e.tags.has('cage')
}

/** 把單位送到另一個 zone 的某點附近（散開、找空地）*/
export function sendTo(g: Game, e: Ent, z: Zone, at: { x: number; y: number }, i: number): void {
  const a = i * 2.39996
  const r = i ? 0.8 + Math.sqrt(i) * 0.6 : 0
  const n = z.nav!.nearestOpen(at.x + Math.cos(a) * r, at.y + Math.sin(a) * r) ?? z.nav!.nearestOpen(at.x, at.y) ?? at
  g.world.relocate(e, z.id, n.x, n.y)
  issue(e, null)
  e.cast = null
}

regScript('st.portActivate', (g, ctx) => {
  const st = ctx.caster
  const own = st.data.interior as number | undefined
  if (own === undefined) return
  const pz = g.world.zones[own]
  const tz = portTargetOk(g, pz.data.portTarget as number | undefined)
  if (!tz) {
    sayPilot(g, st, 'st.portNoTarget')
    return
  }
  if (((pz.data.portUntil as number | undefined) ?? 0) > g.time) return
  pz.data.portUntil = g.time + PORT_CHARGE
  applyBuff(g, st, 'bf.portCharge', PORT_CHARGE)
  for (const p of markersOf(pz).teleportPad ?? []) g.emitFx({ k: 'portCharge', z: pz.id, x: p.x, y: p.y, v: PORT_CHARGE })
  for (const s of mainsIn(g, pz.id)) g.privateLine(s, 'st.portCharging', { s: PORT_CHARGE })
  g.after(PORT_CHARGE, () => {
    pz.data.portUntil = 0
    if (!pz.alive || !st.alive) return
    const dest = portTargetOk(g, pz.data.portTarget as number | undefined)
    if (!dest) {
      for (const s of mainsIn(g, pz.id)) g.privateLine(s, 'st.portLost')
      return
    }
    const at = arrivalPoint(dest)
    const movers = unitsOnPads(g, pz, 'teleportPad', transportable)
    movers.forEach((e, i) => {
      g.emitFx({ k: 'portDepart', z: pz.id, x: e.x, y: e.y, e: e.id })
      sendTo(g, e, dest, at, i)
      applyBuff(g, e, 'bf.portArrive', 5)
      g.emitFx({ k: 'portArrive', z: dest.id, x: e.x, y: e.y, e: e.id })
      if (e.isMain && e.owner >= 0) g.privateLine(e.owner, 'st.portArrived', { name: dest.station?.name.zh ?? '' })
    })
  })
})

// ───────── 火口號：維修、封鎖信標、神經毒素 ─────────

/** 自動維修：可自動施放的「外部維修光束」對射程內受損最重的站施放（建築不在通用自動施放的範圍內）*/
function stepRepairAutocast(g: Game): void {
  const S = stationsOf(g)
  if (g.time < S.nextRepair) return
  S.nextRepair = g.time + REPAIR_SCAN
  const ab = abilityDef('st.repair')
  if (!ab) return
  for (const u of g.world.inZone(SPACE_ZONE)) {
    if (!u.alive || !u.autocast.has('st.repair') || u.cast) continue
    if (u.order && u.order.k !== 'hold') continue
    if ((u.cds.get('st.repair') ?? 0) > g.time || u.mp < ab.mana) continue
    let best: Ent | null = null
    let bestK = 1
    for (const t of g.world.query(SPACE_ZONE, u.x, u.y, (ab.range ?? 9) + 6)) {
      if (t === u || !t.alive || !t.tags.has('station') || t.stats.invuln || t.hp >= t.maxHp - 1) continue
      if (dist(u, t) > (ab.range ?? 9) + u.radius + t.radius) continue
      const k = t.hp / t.maxHp
      if (k < bestK) {
        bestK = k
        best = t
      }
    }
    if (best) u.order = { k: 'cast', a: 'st.repair', e: best.id }
  }
}

regScript('st.cordon', (g, ctx) => {
  const c = ctx.caster
  const t = ctx.target
  const zid = t?.data.interior as number | undefined
  const z = zid !== undefined ? g.world.zones[zid] : undefined
  if (!t || !z || !z.alive || zid === c.data.interior) {
    c.mp = Math.min(c.maxMp, c.mp + (abilityDef('st.cordon')?.mana ?? 0))
    sayPilot(g, c, 'st.cordonBad')
    return
  }
  let n = 0
  const until = g.time + CORDON_LOCK
  for (const d of z.doors) {
    if (d.broken) continue
    // 原本就永久上鎖的門（活體庫號隔間）維持原狀
    if (d.locked && !d.lockUntil) continue
    d.locked = true
    d.lockUntil = Math.max(d.lockUntil, until)
    n++
  }
  g.emitFx({ k: 'cordonBeam', z: SPACE_ZONE, x: c.x, y: c.y, x2: t.x, y2: t.y, e: c.id, e2: t.id })
  for (const s of mainsIn(g, z.id)) g.privateLine(s, 'st.cordoned', { s: CORDON_LOCK })
  sayPilot(g, c, 'st.cordonOk', { name: z.station?.name.zh ?? '', n })
})

regScript('st.neurotoxStart', (g, ctx) => {
  const c = ctx.caster
  const zid = ctx.target?.data.interior as number | undefined
  if (zid === undefined) {
    c.cast = null
    sayPilot(g, c, 'st.neurotoxBad')
    return
  }
  c.data.neuroStart = g.time
  c.data.neuroZone = zid
  sayPilot(g, c, 'st.neurotoxOn', { name: g.world.zones[zid].station?.name.zh ?? '' })
})

regScript('st.neurotoxTick', (g, ctx) => {
  const c = ctx.caster
  const zid = c.data.neuroZone as number | undefined
  const z = zid !== undefined ? g.world.zones[zid] : undefined
  if (!z || !z.alive) {
    c.cast = null
    return
  }
  const amount = NEURO_BASE + NEURO_RAMP * Math.max(0, g.time - ((c.data.neuroStart as number) ?? g.time))
  for (const id of zonesInside(g, z.id)) {
    for (const e of g.world.inZone(id)) {
      if (!e.alive || e.owner < 0 || e.tags.has('structure') || e.tags.has('noTarget') || e.tags.has('immuneToxin') || e.tags.has('corpse')) continue
      // 仿生人免疫（內容總表模組表；原作排除 android 玩家）
      if (g.players[e.owner]?.role === 'android') continue
      damage(g, c, e, amount, { kind: 'poison', pure: true, dot: true, ability: 'st.neurotox' })
      if (e.isMain) g.emitFx({ k: 'neurotoxin', z: e.zone, x: e.x, y: e.y, e: e.id }, [e.owner])
    }
  }
})

// ───────── 女帝號輔助推進跳躍（模組）─────────

regScript('st.jump', (g, ctx) => {
  const n = ctx.caster
  const x = clampSpace(ctx.x, n.radius)
  const y = clampSpace(ctx.y, n.radius)
  applyBuff(g, n, 'bf.jumpCharge', JUMP_CHARGE)
  n.order = null
  g.emitFx({ k: 'jumpCharge', z: SPACE_ZONE, x: n.x, y: n.y, x2: x, y2: y, e: n.id, v: JUMP_CHARGE })
  g.after(JUMP_CHARGE, () => {
    if (!n.alive || n.zone !== SPACE_ZONE) return
    const ox = n.x
    const oy = n.y
    g.world.relocate(n, SPACE_ZONE, x, y)
    n.order = null
    g.emitFx({ k: 'jumpArrive', z: SPACE_ZONE, x, y, x2: ox, y2: oy, e: n.id })
  })
})

// ───────── 重力校正（餘燼衛星重力控制裝置）─────────

/** 不能被推的天體：行星、衛星、恆星、降落中的豪勇號 */
function gravFixed(e: Ent): boolean {
  return e.def.id === 'station.verdance' || e.def.id === 'station.cinder' || e.def.id === 'space.sun' || !!e.data.landed || e.tags.has('noTarget')
}

export function gravPv(e: Ent): number {
  return GRAV_PV[e.def.id] ?? (e.tags.has('station') ? 110 : e.tags.has('ship') ? 200 : 110)
}

/** 立即生效商品 gravField（systems/vendors 的 INSTANT_ITEMS 由 scripts/items 委派）：操控一個只有自己看得到的指揮點 */
regScript('grav.correction', (g, ctx) => {
  const buyer = ctx.caster
  const vendor = ctx.target
  const p = g.players[buyer.owner]
  if (!p || p.main !== buyer.id || !vendor) return false
  const z = g.world.zones[vendor.zone]
  const se = z ? g.world.get(z.spaceEnt) : undefined
  if (!se || !se.alive) return false
  const d = g.world.spawn(unitDef('space.gravTargeter'), SPACE_ZONE, se.x, se.y, p.slot)
  d.global = true
  d.anon = true
  d.name = ''
  d.color = -1
  d.data.passives = ['bf.innateStealth']
  d.data.gravOf = buyer.id
  d.data.ghost = true
  d.statsDirty = true
  d.lifeEnd = g.time + GRAV_UPLINK_LIFE
  p.control = d.id
  g.privateLine(p.slot, 'fac.gravSelect', { s: GRAV_UPLINK_LIFE })
  return true
})

regScript('grav.pickTarget', (g, ctx) => {
  const d = ctx.caster
  const t = ctx.target
  if (!t || t === d || t.zone !== SPACE_ZONE || gravFixed(t) || !(t.tags.has('station') || t.tags.has('ship') || t.tags.has('space'))) {
    if (d.owner >= 0) g.privateLine(d.owner, 'fac.gravBadTarget')
    return
  }
  d.data.gravTarget = t.id
  if (d.owner >= 0) g.privateLine(d.owner, 'fac.gravTargetOk', { name: stName(g, t) })
})

function endUplink(g: Game, d: Ent): void {
  const p = g.players[d.owner]
  if (p && p.control === d.id) p.control = p.main
  g.world.remove(d)
}

regScript('grav.push', (g, ctx) => {
  const d = ctx.caster
  const t = g.world.get(d.data.gravTarget as number)
  if (!t || !t.alive || t.zone !== SPACE_ZONE || gravFixed(t)) {
    if (d.owner >= 0) g.privateLine(d.owner, 'fac.gravNoTarget')
    return
  }
  let dx = ctx.x - t.x
  let dy = ctx.y - t.y
  const len = Math.hypot(dx, dy)
  if (len < 0.01) {
    dx = Math.cos(t.facing)
    dy = Math.sin(t.facing)
  } else {
    dx /= len
    dy /= len
  }
  const dur = (4 * gravPv(t)) / 100
  stationsOf(g).pushes.push({ id: t.id, dx, dy, t0: g.time, dur })
  g.systemAll('fac.gravActivated', { name: stName(g, t) })
  g.emitFx({ k: 'gravCorrection', z: SPACE_ZONE, x: t.x, y: t.y, x2: t.x + dx * 4, y2: t.y + dy * 4, e: t.id, v: dur })
  endUplink(g, d)
})

function stepPushes(g: Game, dt: number): void {
  const S = stationsOf(g)
  if (!S.pushes.length) return
  S.pushes = S.pushes.filter((p) => {
    const e = g.world.get(p.id)
    const el = g.time - p.t0
    if (!e || !e.alive || e.zone !== SPACE_ZONE || el > p.dur || gravFixed(e)) return false
    const v = GRAV_ACCEL * el
    moveBy(g, e, p.dx * v * dt, p.dy * v * dt)
    return true
  })
}

// ───────── 公轉（研究 03 §1.1：翠原星繞中心 0.25°/s、餘燼衛星繞翠原星 1.5°/s）─────────

function orbitCenter(g: Game, around: string): { x: number; y: number } | null {
  if (around === 'center') return { x: 0, y: 0 }
  const e = spaceEntOf(g, around)
  return e && e.alive ? { x: e.x, y: e.y } : null
}

function setupOrbits(g: Game): void {
  const S = stationsOf(g)
  const list = g.world.zones.filter((z) => z.alive && z.station?.space.orbit && g.world.get(z.spaceEnt))
  // 先放繞中心的，再放繞別人的（餘燼衛星要用翠原星的新位置）
  list.sort((a, b) => (a.station!.space.orbit!.around === 'center' ? 0 : 1) - (b.station!.space.orbit!.around === 'center' ? 0 : 1))
  for (const z of list) {
    const o = z.station!.space.orbit!
    const e = g.world.get(z.spaceEnt)!
    const [px, py] = z.station!.space.pos
    // 起始角度沿用站點表的位置（相對於原始中心），半徑照公轉設定
    let ox = 0
    let oy = 0
    if (o.around !== 'center') {
      const pst = g.world.zones.find((q) => q.key === o.around)?.station
      if (pst) [ox, oy] = pst.space.pos
    }
    const ang = Math.atan2(py - oy, px - ox)
    S.orbits.push({ ent: e.id, around: o.around, r: o.radius, w: (o.degPerSec * Math.PI) / 180, ang })
    const c = orbitCenter(g, o.around)
    if (c) {
      e.x = c.x + Math.cos(ang) * o.radius
      e.y = c.y + Math.sin(ang) * o.radius
      g.world.moved(e)
    }
  }
}

function stepOrbits(g: Game, dt: number): void {
  if (g.data.orbitsStopped) return
  for (const o of stationsOf(g).orbits) {
    const e = g.world.get(o.ent)
    if (!e || !e.alive || e.zone !== SPACE_ZONE) continue
    // 獵鷹級的重力光束會讓公轉暫停（研究 03 §1.1 B000）
    if (hasBuff(e, 'bf.tractor')) continue
    const c = orbitCenter(g, o.around)
    if (!c) continue
    o.ang += o.w * dt
    e.x = c.x + Math.cos(o.ang) * o.r
    e.y = c.y + Math.sin(o.ang) * o.r
    g.world.moved(e)
  }
}

// ───────── 安裝 ─────────

const installed = new WeakSet<Game>()

export function installStations(g: Game): void {
  if (installed.has(g)) return
  installed.add(g)
  setupOrbits(g)
  const dt = 1 / 20
  g.systems.push({
    name: 'stations',
    fn: (gg) => {
      stepOrbits(gg, dt)
      stepLanded(gg)
      stepOrbs(gg, dt)
      stepPushes(gg, dt)
      stepRepairAutocast(gg)
    },
  })
  DEATH_HOOKS.push((g2, u, killer) => {
    if (g2 !== g) return
    // 翠原星被毀時豪勇號正降落在上面：一起毀滅（研究 03 §1.3）
    const L = stationsOf(g).landed
    if (L && u.id === L.verdance) {
      const b = g.world.get(L.bravado)
      stationsOf(g).landed = null
      setPortals(g, L, false)
      if (b && b.alive) {
        b.data.god = false
        g.killEnt(b, killer)
      }
    }
    // 重力校正指揮點到期：控制權還給本人
    if (u.def.id === 'space.gravTargeter') {
      const p = g.players[u.owner]
      if (p && p.control === u.id) p.control = p.main
    }
  })
}

