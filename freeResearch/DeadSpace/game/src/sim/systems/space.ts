// 太空層與跨層移動（研究 03 §1.3、§2）：控制台駕駛、探索艇登艇／發射／停靠／強行登艦、站點毀滅連帶全滅、逃生艙、
// 主控台被毀留下殘骸（站點介面裝置可修）、海盜船主控台（不可駕駛，打爆後自爆）
import { SHIPS, SHIP_BY_ID, type ShipDef } from '../../shared/content/ships'
import type { StationDef } from '../../shared/content/stations/types'
import type { Loc } from '../../shared/content/types'
import { unitDef } from '../../shared/content/registry'
import { locArgs } from '../../shared/sysArgs'
import { NEUTRAL, inheritLook, type Ent } from '../ent'
import { fmtKey, type Game, type GamePlayer } from '../game'
import { spawnConsole } from '../setup'
import { SPACE_ZONE, type Zone } from '../world'
import { DEATH_HOOKS, damage } from './damage'
import { regScript } from './effects'
import { applyBuff, removeBuff } from './buffs'
import { EXTRA_COMMANDS, issue } from './orders'
import { INSTANT_ITEMS } from './vendors'

/**
 * 強行登艦的一端（原作 A02J 的對象「探索船」）：船艇（ShipInst），或不能停靠、只能登艦的站（火口號、擺渡號）。
 * link 是另一端的 key；連結期間這一端的出入口（船艙的艙門、站的登艦氣閘）通往另一端。
 */
export interface BoardEnd {
  key: string
  zone: number
  link: string | null
  linkUntil: number
}

export interface ShipInst extends BoardEnd {
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
  /** 已裝紅隼升級模組（M7）*/
  mk2?: boolean
}

export interface SpaceState {
  ships: Map<string, ShipInst>
  /** zone id → 該站停機坪是否被佔用 */
  pads: Map<number, (string | null)[]>
  /** 駕駛：vehicle ent id → pilot ent id */
  pilots: Map<number, number>
  sunFactor: number
  pods: Map<number, { slot: number; target: number; hpK: number }>
  /** 只能登艦的站的登艦氣閘（key = 'st:' + 站 key）*/
  airlocks: Map<string, BoardEnd>
}

const CONSOLE_R = 1.0
const BOARD_CD = 8
const LAUNCH_S = 10
/** 對停泊的船下互動指令時，離船身多近就登船（movement.ts 的互動指令停在船身外 1.4 公尺）*/
const BOARD_REACH = 1.6

export function spaceOf(g: Game): SpaceState {
  return (g.data.space ??= { ships: new Map(), pads: new Map(), pilots: new Map(), sunFactor: 1, pods: new Map(), airlocks: new Map() }) as SpaceState
}

/** 救生艙不能指定的地點（原作排除七號廢站、海盜船、未識別物體；船艇另外排除）*/
const POD_EXCLUDE = new Set(['hulk7', 'pirate', 'uo'])

// ───────── 強行登艦的兩端 ─────────

/** 只能登艦的站：不能停靠、有出入口（船艙不算）*/
function boardableStation(z: Zone | undefined): z is Zone {
  return !!z && z.alive && !!z.station && z.station.dockable === false && !z.data.ship && !!z.layout?.exits.length
}

/** 太空中的實體 → 強行登艦的一端（船艇或只能登艦的站；其他回 undefined）*/
export function boardEndOf(g: Game, e: Ent | null | undefined): BoardEnd | undefined {
  if (!e) return undefined
  const sp = spaceOf(g)
  if (e.data.ship) return sp.ships.get(e.data.ship as string)
  const zid = e.data.interior as number | undefined
  const z = zid !== undefined ? g.world.zones[zid] : undefined
  if (!boardableStation(z)) return undefined
  const key = 'st:' + z.key
  let end = sp.airlocks.get(key)
  if (!end) sp.airlocks.set(key, (end = { key, zone: z.id, link: null, linkUntil: 0 }))
  return end
}

function endByKey(g: Game, key: string | null): BoardEnd | undefined {
  if (!key) return undefined
  const sp = spaceOf(g)
  return sp.ships.get(key) ?? sp.airlocks.get(key)
}

const isStationEnd = (end: BoardEnd): boolean => end.key.startsWith('st:')

/** 這一端在太空中的實體（船、站）*/
function endEnt(g: Game, end: BoardEnd): Ent | undefined {
  return g.world.get(g.world.zones[end.zone]?.spaceEnt ?? 0)
}

/** 斷開這一端的連結（對方若還連著這一端也一起斷），拿掉兩邊的登艦連結 buff */
function breakLink(g: Game, end: BoardEnd): void {
  const other = endByKey(g, end.link)
  end.link = null
  const ae = endEnt(g, end)
  if (ae) removeBuff(g, ae, 'bf.boarding')
  if (other && other.link === end.key) {
    other.link = null
    const be = endEnt(g, other)
    if (be) removeBuff(g, be, 'bf.boarding')
  }
}

/**
 * 從連結的另一端過來時出現的位置：出入口往裡面 1.6 公尺。
 * 船艙的艙門在左牆、站的登艦氣閘在右牆，取第一個走得到的方向。
 */
function airlockArrival(z: Zone): { x: number; y: number } {
  const l = z.layout!
  const ex = l.exits[0] ?? l.spawns[0] ?? { x: 3, y: 3 }
  const nav = z.nav!
  for (const [dx, dy] of [
    [1.6, 0],
    [-1.6, 0],
    [0, 1.6],
    [0, -1.6],
  ]) {
    if (!nav.blockedAt(ex.x + dx, ex.y + dy)) return { x: ex.x + dx, y: ex.y + dy }
  }
  return nav.nearestOpen(ex.x, ex.y) ?? ex
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
export function createShip(g: Game, def: ShipDef): ShipInst {
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
  if (inst.mk2) e.x2 = { mk2: 1 }
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

export function launchTo(g: Game, inst: ShipInst, x: number, y: number, hpK = 1): Ent {
  const e = g.world.spawn(unitDef('ship.' + inst.def.id), SPACE_ZONE, x, y, NEUTRAL)
  e.global = true
  if (inst.mk2) applyMk2(e)
  e.hp = e.maxHp * hpK
  e.data.ship = inst.key
  e.data.interior = inst.zone
  g.world.zones[inst.zone].spaceEnt = e.id
  inst.spaceEnt = e.id
  return e
}

/** 紅隼升級模組（研究 03 §3.2 RUM）：+30000 HP、技能升級、+0.3 移速、+400 傷害（buff）*/
export function applyMk2(e: Ent): void {
  e.maxHp += 30000
  e.data.hpAdd = 30000
  e.abilities = e.abilities.map((a) => (a === 'ship.payload' ? 'ship.payload2' : a === 'ship.overload' ? 'ship.overload2' : a))
  e.data.modPassives = ['bf.kestrelMk2']
  e.data.passives = ['bf.kestrelMk2']
  e.statsDirty = true
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

export function consolePos(g: Game, z: Zone): { x: number; y: number; ent?: Ent } | null {
  if (z.data.console) return z.data.console as { x: number; y: number }
  // 不可駕駛的站（海盜船：主控台屬於海盜，站上去也不會駕駛）
  if (!z.station || z.station.id.startsWith('ship:') || !z.station.space.pilotable) return null
  const c = [...g.world.inZone(z.id)].find((e) => e.data.poi === 'console')
  return c ? { x: c.x, y: c.y, ent: c } : null
}

/** 讓載具改由某人駕駛（null = 還給中立）*/
export function setPilot(g: Game, vehicle: Ent, pilot: Ent | null): void {
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
  // 換手（含交回控制台）時，上一位駕駛進行中的施法一併取消：否則交出去之後技能照樣放出來，算在下一位（或中立）頭上
  vehicle.cast = null
  vehicle.anim = 0
  // 自動索敵：有人駕駛的站點／船艇會自動攻擊射程內的敵對單位（無人戰機、小行星、海盜等 owner -2；
  // 和 WC3 玩家單位一樣）。isHostile 只把敵對單位當目標，不會自動打中立或其他玩家的站。交還時恢復原本的設定。
  if (vehicle.data.acquire0 === undefined) vehicle.data.acquire0 = vehicle.acquire
  if (!pilot) {
    vehicle.owner = NEUTRAL
    vehicle.anon = false
    vehicle.pilot = 0
    // 不要留著上一位駕駛的顏色（小地圖、頭像會以為他還在駕駛）
    vehicle.color = -1
    vehicle.acquire = !!vehicle.data.acquire0
    return
  }
  const p = g.players[pilot.owner]
  if (!p) return
  sp.pilots.set(vehicle.id, pilot.id)
  vehicle.acquire = true
  vehicle.owner = pilot.owner
  vehicle.anon = pilot.anon
  vehicle.pilot = pilot.id
  vehicle.color = pilot.anon ? -1 : pilot.color
  p.control = vehicle.id
  if (pilot.def.speed > 0) issue(pilot, null)
  // 王牌飛行員：駕駛的船／站攻速 +15%；重力學博士：船速 +15%（模組帶來的被動保留）
  vehicle.data.passives = [...((vehicle.data.modPassives as string[] | undefined) ?? []), ...(p.classId === 'ace' ? ['bf.acePilot'] : []), ...(p.phd === 'gravitics' ? ['bf.gravPilot'] : [])]
  vehicle.statsDirty = true
  g.privateLine(p.slot, 'space.accessGranted', locArgs(vehicle.def.name))
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
      // 從站內登上停泊的船：只有「目前的指令就是對這艘船互動」的單位會登船（右鍵點船＝走過去登船）；
      // 只是路過、走去旁邊的販賣機不會被吸進去。互動指令停在船身外約 1.4 公尺，所以觸發距離要涵蓋那裡。
      // 標本籠沒有指令（被推斥器推過來），維持「推到船邊就上船」（研究 03 §4.5）。
      if (inst.docked) {
        const de = w.get(inst.dockedEnt)
        if (de) {
          const boarders: Ent[] = []
          for (const u of w.query(de.zone, de.x, de.y, de.radius + BOARD_REACH)) {
            if (!canTravel(g, u) || (u.data.boardCd ?? 0) > t) continue
            const ordered = u.order?.k === 'interact' && u.order.e === de.id
            const pushedCage = u.owner < 0 && u.tags.has('cage') && Math.hypot(u.x - de.x, u.y - de.y) <= de.radius + 0.8 + u.radius
            if (ordered || pushedCage) boarders.push(u)
          }
          for (const u of boarders) {
            const followers = u.isMain ? followersOf(g, u) : []
            enterShip(g, u, inst)
            // 跟著主人的召喚物（變種人眷屬、異形幼體…）一起上船：它們沒辦法另外下指令
            for (const f of followers) {
              if (!canTravel(g, f) || (f.data.boardCd ?? 0) > t) continue
              const ord = f.order
              enterShip(g, f, inst)
              // enterShip 會清掉指令：恢復跟隨，下船時才認得出是誰的召喚物
              f.order = ord
            }
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
      if (inst.link && t > inst.linkUntil) {
        inst.link = null
        for (const p of g.allPlayers()) if (p.alive && g.mainOf(p)?.zone === z.id) g.privateLine(p.slot, 'space.linkEnd')
      }
    }
    // 只能登艦的站（火口號、擺渡號）：連結期間，站內的出入口（登艦氣閘）通往連結中的船艙
    for (const end of sp.airlocks.values()) {
      const z = w.zones[end.zone]
      if (!z?.alive || !z.layout) continue
      const exits = z.layout.exits
      const to = end.link && t <= end.linkUntil ? endByKey(g, end.link) : undefined
      if (to) {
        const movers = new Set<Ent>()
        for (const ex of exits) for (const u of w.query(z.id, ex.x, ex.y, 0.7)) movers.add(u)
        for (const u of movers) {
          // offPad === false：剛從連結過來、還沒離開出入口（避免來回彈）
          if (!canTravel(g, u) || (u.data.boardCd ?? 0) > t || u.data.offPad === false) continue
          crossLink(g, u, to)
        }
      }
      for (const u of w.inZone(z.id)) if (u.data.offPad === false && exits.every((ex) => Math.hypot(u.x - ex.x, u.y - ex.y) > 1.2)) u.data.offPad = true
      if (end.link && t > end.linkUntil) {
        end.link = null
        for (const p of g.allPlayers()) if (p.alive && g.mainOf(p)?.zone === z.id) g.privateLine(p.slot, 'space.linkEndAirlock')
      }
    }
  }
  // 控制台
  for (const z of w.zones) {
    if (!z.alive || !z.layout) continue
    const c = consolePos(g, z)
    if (!c) continue
    const vehicle = w.get(z.spaceEnt)
    const ship = z.data.ship ? sp.ships.get(z.data.ship as string) : undefined
    // 自動駕駛／unpilot 交出控制台的人要先離開控制台才能再接手。鎖記的是玩家 slot：
    // 變身（replaceMain）會換主單位 id，記 id 的話新的主單位會立刻被接回去
    let locked = z.data.consoleLock as number[] | undefined
    if (locked?.length) {
      locked = locked.filter((slot) => {
        const lp = g.players[slot]
        const u = lp ? g.mainOf(lp) : undefined
        // 和接手的判定（query 含身體半徑）用同一個標準再加一點餘裕：否則停在邊緣的人鎖一解開就被接回去
        return !!u && u.alive && u.zone === z.id && Math.hypot(u.x - c.x, u.y - c.y) <= CONSOLE_R + u.radius + 0.3
      })
      z.data.consoleLock = locked
    }
    let pilot: Ent | null = null
    for (const u of w.query(z.id, c.x, c.y, CONSOLE_R)) {
      if (!u.alive || !u.isMain || u.owner < 0) continue
      if (locked?.includes(u.owner)) continue
      pilot = u
      break
    }
    // 控制台被毀（損毀的控制台）、電磁停機中：沒人能駕駛，正在駕駛的人也會失去控制
    const dead = !!c.ent && (!c.ent.alive || (c.ent.data.disabledUntil ?? 0) > t || c.ent.def.id !== 'struct.console')
    if (dead) pilot = null
    if (ship?.docked) {
      // 停泊中：站上控制台開始發射倒數
      if (pilot && !ship.launching) {
        ship.launching = true
        ship.launchAt = t + LAUNCH_S
        for (const u of w.inZone(z.id)) if (u.owner >= 0 && u.isMain) g.privateLine(u.owner, 'space.launching', { s: LAUNCH_S })
        g.emitFx({ k: 'alarm', z: z.id, x: c.x, y: c.y, v: LAUNCH_S })
      }
      if (!pilot && ship.launching && t < ship.launchAt - 3) {
        ship.launching = false
        g.emitFx({ k: 'alarmEnd', z: z.id, x: c.x, y: c.y })
      }
      if (ship.launching && t >= ship.launchAt) undock(g, ship)
      continue
    }
    if (!vehicle || !vehicle.alive) continue
    const cur = sp.pilots.get(vehicle.id)
    const curEnt = cur ? w.get(cur) : undefined
    const stillThere = !dead && curEnt && curEnt.alive && curEnt.zone === z.id && Math.hypot(curEnt.x - c.x, curEnt.y - c.y) <= CONSOLE_R + curEnt.radius + 0.2 && curEnt.isMain
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
    // 乘客本體跟著艙走（看不見，但位置要一致：本人的鏡頭、距離判定都以它為準）
    const pp = g.players[pod.slot]
    const body = pp ? g.mainOf(pp) : undefined
    if (body && body.data.inPod === podId && (body.x !== e.x || body.y !== e.y)) w.relocate(body, SPACE_ZONE, e.x, e.y)
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
        damage(g, null, e, 750 * sp.sunFactor, { kind: 'fire', pure: true, env: 'sun' })
      }
    }
  }
}

function canTravel(g: Game, u: Ent): boolean {
  if (!u.alive || u.def.speed <= 0 || u.tags.has('structure') || u.tags.has('noTarget') || u.data.zoneObj) return false
  // 防禦無人機不能上船（研究 03 §2.3：不能開船或站）
  if (u.tags.has('drone')) return false
  if (u.tags.has('cocoon') || u.data.frozen) return false
  void g
  return u.owner >= 0 || u.tags.has('cage')
}

/** 正在跟隨這個主單位的自家召喚物（同一區、5 公尺內）*/
function followersOf(g: Game, leader: Ent): Ent[] {
  const out: Ent[] = []
  for (const e of g.world.query(leader.zone, leader.x, leader.y, 5)) {
    if (e === leader || e.isMain || !e.alive || e.owner !== leader.owner) continue
    if (e.order?.k === 'follow' && e.order.e === leader.id) out.push(e)
  }
  return out
}

function enterShip(g: Game, u: Ent, inst: ShipInst): void {
  const z = g.world.zones[inst.zone]
  const n = airlockArrival(z)
  g.world.relocate(u, inst.zone, n.x, n.y)
  u.data.boardCd = g.time + BOARD_CD
  u.data.offPad = false
  issue(u, null)
  g.emitFx({ k: 'board', z: inst.zone, x: n.x, y: n.y, e: u.id })
}

function exitShip(g: Game, u: Ent, inst: ShipInst): void {
  if (inst.docked) {
    const de = g.world.get(inst.dockedEnt)
    if (!de) return
    const sz = g.world.zones[de.zone]
    const n = sz.nav!.nearestOpen(de.x, de.y - de.radius - 0.9) ?? { x: de.x, y: de.y }
    travel(g, u, { zone: de.zone, x: n.x, y: n.y })
  } else if (inst.link) {
    const other = endByKey(g, inst.link)
    if (other) crossLink(g, u, other)
  }
}

/** 穿過登艦連結：到另一端（船艙或站的登艦氣閘）的出入口旁 */
function crossLink(g: Game, u: Ent, to: BoardEnd): void {
  const oz = g.world.zones[to.zone]
  if (!oz?.alive || !oz.layout || !oz.nav) return
  const n = airlockArrival(oz)
  travel(g, u, { zone: oz.id, x: n.x, y: n.y })
}

function travel(g: Game, u: Ent, to: { zone: number; x: number; y: number }): void {
  // 跟著主人上船的召喚物也跟著下船（否則留在船艙、被船一起載走）
  const followers = u.isMain ? followersOf(g, u) : []
  g.world.relocate(u, to.zone, to.x, to.y)
  u.data.boardCd = g.time + BOARD_CD
  u.data.offPad = false
  issue(u, null)
  const nav = g.world.zones[to.zone].nav
  for (const f of followers) {
    if (!canTravel(g, f)) continue
    const n = nav?.nearestOpen(to.x + g.world.rng.range(-0.8, 0.8), to.y + g.world.rng.range(-0.8, 0.8)) ?? to
    g.world.relocate(f, to.zone, n.x, n.y)
    f.data.boardCd = g.time + BOARD_CD
    f.data.offPad = false
  }
}

// ───────── 毀滅 ─────────

/**
 * 地點名稱（兩種語言）：同型的船（例如兩艘紅隼級探索艇）名稱一樣，重複的加上編號，
 * 規則同觀戰列（Game.zoneList 的順序，從 #1 起算）。地點清單開局就公開給所有人，編號不含隱藏資訊。
 */
export function zoneLabel(g: Game, z: Zone): Loc {
  const st = z.station
  if (!st) return { zh: z.key, en: z.key }
  const same = g.world.zones.filter((q) => q.station && q.station.name.zh === st.name.zh)
  if (same.length < 2) return st.name
  const k = same.indexOf(z) + 1
  return { zh: `${st.name.zh} #${k}`, en: `${st.name.en} #${k}` }
}

/** 站點或船艇被擊毀：內部所有單位必死、物品消失，之後 300 秒為致命區 */
export function destroyInterior(g: Game, zoneId: number, killer: Ent | null): void {
  const z = g.world.zones[zoneId]
  if (!z || !z.alive) return
  z.alive = false
  z.lethalUntil = g.time + 300
  const sp = spaceOf(g)
  const label = zoneLabel(g, z)
  g.systemAll('space.destroyed', locArgs(label))
  g.log(fmtKey('tl.destroyed', locArgs(label)))
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
    if (u.data.poi === 'console') consoleDestroyed(g, u)
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
        // 沒有擊殺者實體（恆星、小行星、來源已消失）：乘員是因為救生艙破裂、暴露在真空中而死
        if (!killer) m.data.deathCause = 'vacuum'
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

// ───────── 主控台被毀 ─────────

/** 原本的 POI 資料（站、ref、模組資料…）搬到新的實體上；暫存欄位、數值類不搬 */
const CONSOLE_DATA_SKIP = new Set(['passives', 'god', 'disabledUntil', 'noDrops'])

function copyConsoleData(from: Ent, to: Ent): void {
  for (const [k, v] of Object.entries(from.data)) if (!k.startsWith('_') && !CONSOLE_DATA_SKIP.has(k)) to.data[k] = v
}

/**
 * 主控台被打爆：
 * - 一般站：原地留下「損毀的控制台」（灰色、1 HP、無敵），站點介面裝置修好之前沒人能駕駛（研究 03 §1.3 第 6 點）；
 * - 海盜船主控台：不留殘骸，40 秒後自爆（研究 03 §6.2 事件 #4）。
 * 站點毀滅（destroyInterior）是直接移除，不會走到這裡。
 */
function consoleDestroyed(g: Game, u: Ent): void {
  const z = g.world.zones[u.zone]
  if (!z?.alive || !z.station) return
  if (u.def.id === 'struct.consolePirate') {
    pirateSelfDestruct(g, u)
    return
  }
  if (u.def.id !== 'struct.console') return
  const b = g.world.spawn(unitDef('struct.consoleBroken'), z.id, u.x, u.y, NEUTRAL)
  b.facing = u.facing
  copyConsoleData(u, b)
  // 正在駕駛的人立刻失去控制
  const v = g.world.get(z.spaceEnt)
  if (v && spaceOf(g).pilots.has(v.id)) setPilot(g, v, null)
}

/**
 * 海盜船主控台被毀 → 40 秒自爆倒數（倒數到了由事件系統的 pirateBoom 解體整艘船）。
 * events.ts 原本以 struct.console 判斷海盜船主控台；改成專用定義後由這裡觸發，兩邊都先檢查 pirateBoom，不會重複。
 */
function pirateSelfDestruct(g: Game, u: Ent): void {
  const ev = g.data.events as { pirateZone: number; pirateBoom: number } | undefined
  if (!ev || ev.pirateZone !== u.zone || ev.pirateBoom) return
  ev.pirateBoom = g.time + 40
  for (const q of g.world.inZone(u.zone)) if (q.isMain && q.owner >= 0) g.privateLine(q.owner, 'event.pirateSelfDestruct', { s: 40 })
  g.emitFx({ k: 'alarm', z: u.zone, x: u.x, y: u.y, v: 40 })
}

/** 站點介面裝置（scripts/items 的 item.interfaceKit 委派）：損毀的控制台換回這座站的正常主控台 */
regScript('console.rebuild', (g, ctx) => {
  const t = ctx.target
  const z = t ? g.world.zones[t.zone] : undefined
  if (!t || !z?.alive || t.def.id !== 'struct.consoleBroken') return false
  const c = spawnConsole(g, z, t.x, t.y, t.facing)
  copyConsoleData(t, c)
  g.world.remove(t)
  return true
})

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
    // 匿名就匿名；偽裝中搭的艙看起來是偽裝對象的艙（和真人搭的一樣）
    inheritLook(pod, u)
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
    if (ship.owner >= 0) g.privateLine(ship.owner, 'space.boardOnly', locArgs(zoneLabel(g, z)))
    return
  }
  const pad = freePad(g, zid)
  if (pad < 0) {
    if (ship.owner >= 0) g.privateLine(ship.owner, 'space.noPads')
    return
  }
  const hpK = ship.hp / ship.maxHp
  if (inst.link) breakLink(g, inst)
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
  // 兩端都可以是船艇或只能登艦的站（火口號、擺渡號；研究 03 §2.3 A02J）
  const ia = boardEndOf(g, a)
  const ib = boardEndOf(g, b)
  if (!ia || !ib || !b || ia === ib) return
  // 同一端只接一條連結：舊的先斷開
  if (ia.link) breakLink(g, ia)
  if (ib.link) breakLink(g, ib)
  ia.link = ib.key
  ib.link = ia.key
  ia.linkUntil = ib.linkUntil = g.time + 20
  // 連結只是把兩邊的出入口接通：告訴兩邊裡面的人怎麼過去（駕駛者還在太空畫面，要先離開控制台）
  for (const p of g.allPlayers()) {
    const u = g.mainOf(p)
    if (!p.alive || !u) continue
    const here = u.zone === ia.zone ? ia : u.zone === ib.zone ? ib : null
    if (!here) continue
    const there = here === ia ? ib : ia
    g.privateLine(p.slot, isStationEnd(here) ? 'space.linkedAirlock' : isStationEnd(there) ? 'space.linkedSt' : 'space.linked', { s: 20 })
  }
  applyBuff(g, a, 'bf.boarding', 20)
  applyBuff(g, b, 'bf.boarding', 20)
  g.emitFx({ k: 'boardLink', z: SPACE_ZONE, x: a.x, y: a.y, x2: b.x, y2: b.y })
})

regScript('space.unboard', (g, ctx) => {
  const ia = boardEndOf(g, ctx.caster)
  if (!ia?.link) return
  breakLink(g, ia)
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
    g.privateLine(slot, 'space.scanResult', { ...locArgs(zoneLabel(g, z)), n })
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
    if (e.owner >= 0) g.privateLine(e.owner, 'space.sweepAnnounce', locArgs(z.station?.name))
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
  if (z.data.ship || POD_EXCLUDE.has(z.station?.id ?? '')) return
  pod.target = z.id
})

/**
 * 太空中有人駕駛的探索船（船艇，以及火口號、擺渡號；原作 A071）：雷達站宙域掃描要一起標出來（研究 03 §4.1 Radar Sweep）。
 * 只看「有沒有人在駕駛」，不帶駕駛者身分。
 */
export function mannedCraft(g: Game): Ent[] {
  const out: Ent[] = []
  for (const vid of spaceOf(g).pilots.keys()) {
    const v = g.world.get(vid)
    if (v && v.alive && v.zone === SPACE_ZONE && boardEndOf(g, v)) out.push(v)
  }
  return out
}

export function pilotOf(g: Game, vehicle: Ent): GamePlayer | undefined {
  const pid = spaceOf(g).pilots.get(vehicle.id)
  const pe = pid ? g.world.get(pid) : undefined
  return pe ? g.players[pe.owner] : undefined
}

// ───────── 離開控制台 ─────────
// 駕駛時所有指令都送給載具，角色本身動不了；這個指令把操控權交回角色。
// 角色還站在控制台上，所以先鎖住（離開控制台範圍才解鎖），免得下一個 tick 又被接上。
EXTRA_COMMANDS.set('unpilot', (g, p, u) => {
  if (p.control === p.main) return
  const main = g.mainOf(p)
  if (!main) return
  const sp = spaceOf(g)
  if (sp.pilots.get(u.id) === main.id) {
    const z = g.world.zones.find((q) => q.alive && q.spaceEnt === u.id)
    if (z) z.data.consoleLock = [...((z.data.consoleLock as number[] | undefined) ?? []), p.slot]
    setPilot(g, u, null)
    p.control = p.main
    g.privateLine(p.slot, 'space.leftConsole')
    return
  }
  // 防禦無人機：交回控制權，控制圈會在下一個 tick 斷線；在角色離開控制圈前不會重新連線（鎖記在玩家身上，變身換 id 也不會解開）
  if (u.def.id === 'npc.defenseDrone' && u.pilot === main.id) {
    p.data.droneLock = true
    p.control = p.main
  }
})

/** 這個 zone（船艙）的船正在發射倒數：回傳剩餘秒數，沒有就 0（給私有狀態，讓船上的人看到倒數）*/
export function launchCountdown(g: Game, zoneId: number): number {
  const z = g.world.zones[zoneId]
  const ship = z?.data.ship ? spaceOf(g).ships.get(z.data.ship as string) : undefined
  if (!ship?.docked || !ship.launching) return 0
  return Math.max(0, Math.round((ship.launchAt - g.time) * 10) / 10)
}
