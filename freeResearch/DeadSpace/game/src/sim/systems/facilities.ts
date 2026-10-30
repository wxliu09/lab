// 各站特殊設施（M7；研究 03 §1.2、§2.3、§3.2、§4.4、§4.5；研究 02 §5.3、§5.5）：
// 仿生人鑄造台、模組安裝座與模組效果、餘燼衛星模組工廠、活體庫號隔間門與籠子、女帝號動力分配台、
// 防禦無人機控制圈、裁決者號掃描增幅、未識別物體啟用碼、豪勇號降落傳送門、職業固定出生點、控制台電磁停機。
// 隱藏資訊：操作面板只放在本人的 PrivateState；全站廣播不提操作者；設施實體的 x2 只放公開狀態。
import { MODULE_BUILD, POWER_CD, POWER_MODES, type PowerMode } from '../../shared/content/facilities'
import { MODULE_TARGET } from '../../shared/content/items'
import { CLASSES, FORMS, itemDef, unitDef } from '../../shared/content/registry'
import { STATION_BY_ID } from '../../shared/content/stations/index'
import type { Command, FacilityView } from '../../shared/protocol/messages'
import { HOSTILE, NEUTRAL, dist, type Ent } from '../ent'
import type { Game, GamePlayer } from '../game'
import { markersOf, type Marker } from '../setup'
import { SPACE_ZONE, type Zone } from '../world'
import { spawnCreature } from '../ai/creatures'
import { applyBuff } from './buffs'
import { DEATH_HOOKS } from './damage'
import { regScript, type EffectCtx } from './effects'
import { uoCode } from './events'
import { dropOnGround, giveItem, makeItem } from './items'
import { EXTRA_COMMANDS, canSee, issue } from './orders'
import { setPilot, spaceOf } from './space'
import { sendTo, stationsOf, transportable, unitsOnPads } from './stations'

// ───────── 數值 ─────────

/** 操作設施的距離（同販賣機）*/
export const FAC_REACH = 2.6
/** 鑄造台重建仿生人：電梯特效 61×0.5 秒（研究 02 §5.3）*/
export const FAB_REBUILD = 30
/** 掃描增幅模組：每 45 秒全體 ping（研究 03 §3.2 ASAD）*/
export const SCAN_PERIOD = 45
/** 籠子：製籠 10 秒、容量 3（研究 03 §4.5）*/
export const CAGE_BUILD = 10
export const CAGE_CAP = 3
/** 精煉礦石：火口號能量 +150 */
export const ORE_MANA = 150
/** 走到符文面板多近會看到啟用碼 */
const CODE_R = 1.6
/** 無人機控制圈半徑 */
const DRONE_RING = 0.8

const MOD_STATION: Record<string, string> = {
  modScanAmp: 'adjudicatrix',
  modAntimatter: 'tenshu',
  modThruster: 'nyx',
  refinedOre: 'caldera',
  modNeurotoxin: 'caldera',
}

// ───────── 狀態 ─────────

interface PowerState {
  mode: PowerMode
  cds: Partial<Record<PowerMode, number>>
}

interface Prod {
  item: string
  until: number
  by: number
}

interface FacState {
  scanAt: number
  /** 正在重建的仿生人槽位 → 完成時間 */
  rebuilds: Map<number, number>
  droneCtl: number[]
  factories: number[]
}

function facOf(g: Game): FacState {
  return (g.data.fac ??= { scanAt: 0, rebuilds: new Map(), droneCtl: [], factories: [] }) as FacState
}

export function powerOf(g: Game): PowerState {
  return (g.data.power ??= { mode: 'normal', cds: {} }) as PowerState
}

const zoneByKey = (g: Game, key: string): Zone | undefined => g.world.zones.find((z) => z.key === key && z.alive)

/** 女帝號動力分配台目前的模式（女帝號被毀 → 一般）*/
export function powerMode(g: Game): PowerMode {
  return zoneByKey(g, 'nyx') ? powerOf(g).mode : 'normal'
}

function say(g: Game, u: Ent | undefined, key: string, args?: Record<string, string | number>): void {
  if (u && u.owner >= 0) g.privateLine(u.owner, key, args)
}

function offFor(g: Game, e: Ent): number {
  return Math.max(0, Math.ceil(((e.data.disabledUntil as number | undefined) ?? 0) - g.time))
}

/** 標記中心（多格踏板取平均）*/
function padCenter(ms: Marker[] | undefined): { x: number; y: number } | null {
  if (!ms?.length) return null
  let x = 0
  let y = 0
  for (const m of ms) {
    x += m.x
    y += m.y
  }
  return { x: x / ms.length, y: y / ms.length }
}

function onPads(e: Ent, ms: Marker[] | undefined): boolean {
  if (!ms) return false
  return ms.some((p) => Math.abs(p.x - e.x) <= 0.5 + e.radius * 0.5 && Math.abs(p.y - e.y) <= 0.5 + e.radius * 0.5)
}

/** 從使用中的格子拿走道具（模組、記憶核心的充能是 0，施法系統不會消耗）*/
function takeUsed(g: Game, ctx: EffectCtx, id: string): boolean {
  const u = ctx.caster
  const slot = ctx.itemSlot ?? -1
  const it = slot >= 0 ? u.inv?.[slot] : null
  if (!it || it.id !== id) return false
  u.inv![slot] = null
  u.statsDirty = true
  g.onItemLost?.(u, it)
  return true
}

// ───────── 動力分配台（研究 03 §4.4）─────────

export function setPowerMode(g: Game, mode: PowerMode): void {
  const ps = powerOf(g)
  ps.mode = mode
  const nyx = zoneByKey(g, 'nyx')
  if (nyx) {
    nyx.data.labPower = mode === 'lab'
    // 實驗室模式：45 秒後第一隻失敗實驗體（由生物 AI 的 stepLabPower 生成）
    if (mode === 'lab') nyx.data.labNext = g.time + 45
  }
}

function powerCmd(g: Game, p: GamePlayer, u: Ent, s: number | undefined): void {
  if (s === undefined || s < 0 || s >= POWER_MODES.length) return
  const mode = POWER_MODES[s]
  const ps = powerOf(g)
  if (ps.mode === mode) return
  const cd = Math.ceil((ps.cds[mode] ?? 0) - g.time)
  if (cd > 0) {
    g.privateLine(p.slot, 'fac.powerCd', { s: cd })
    return
  }
  setPowerMode(g, mode)
  if (POWER_CD[mode]) ps.cds[mode] = g.time + POWER_CD[mode]
  g.privateLine(p.slot, 'fac.powerSet.' + mode)
  g.emitFx({ k: 'powerMode', z: u.zone, x: u.x, y: u.y, s: mode })
}

function stepPower(g: Game): void {
  const mode = powerMode(g)
  if (mode !== powerOf(g).mode) setPowerMode(g, 'normal')
  if (mode === 'normal' || mode === 'lab') return
  if (mode === 'ambient') {
    for (const p of g.allPlayers()) {
      const m = g.mainOf(p)
      if (p.alive && m?.alive) applyBuff(g, m, 'bf.power.ambient', 1.5)
    }
    return
  }
  for (const e of g.world.inZone(SPACE_ZONE)) {
    if (!e.alive || e.owner === HOSTILE) continue
    if (mode === 'explorer' && e.def.id.startsWith('ship.') && e.def.id !== 'ship.pod' && e.def.id !== 'ship.wasp') applyBuff(g, e, 'bf.power.explorer', 1.5)
    if (mode === 'station' && e.tags.has('station')) applyBuff(g, e, 'bf.power.station', 1.5)
  }
}

// ───────── 防禦無人機控制圈（研究 03 §2.3）─────────

function pairDrones(g: Game): void {
  const fs = facOf(g)
  for (const z of g.world.zones) {
    if (!z.layout) continue
    const ctl = g.world.inZone(z.id).filter((e) => e.def.id === 'struct.droneControl')
    if (!ctl.length) continue
    const drones = g.world.inZone(z.id).filter((e) => e.def.id === 'npc.defenseDrone')
    ctl.sort((a, b) => a.x - b.x || a.y - b.y)
    for (const c of ctl) {
      let best: Ent | null = null
      for (const d of drones) if (!d.data.ctl && (!best || dist(c, d) < dist(c, best))) best = d
      if (best) {
        best.data.ctl = c.id
        c.data.drone = best.id
      }
      fs.droneCtl.push(c.id)
    }
  }
}

function releaseDrone(g: Game, c: Ent, d: Ent | undefined): void {
  const pid = c.data.pilot as number | undefined
  c.data.pilot = 0
  const pe = pid ? g.world.get(pid) : undefined
  if (pe) pe.piloting = 0
  if (d && d.alive) {
    const p = g.players[d.owner]
    if (p && p.control === d.id) p.control = p.main
    d.owner = NEUTRAL
    d.anon = false
    d.color = -1
    d.pilot = 0
    issue(d, null)
    if (p && p.alive) g.privateLine(p.slot, 'fac.droneUnlinked')
  } else if (pe) {
    const p = g.players[pe.owner]
    if (p && p.control !== p.main && !g.world.get(p.control)) p.control = p.main
  }
}

function stepDrones(g: Game): void {
  for (const cid of facOf(g).droneCtl) {
    const c = g.world.get(cid)
    if (!c) continue
    const d = g.world.get(c.data.drone as number)
    const pid = c.data.pilot as number | undefined
    if (pid) {
      const pe = g.world.get(pid)
      const p = pe ? g.players[pe.owner] : undefined
      const ok = !!pe && pe.alive && pe.zone === c.zone && dist(pe, c) <= DRONE_RING + 0.25 && !!p && p.main === pe.id && !!d && d.alive && d.owner === pe.owner && p.control === d.id
      if (!ok) releaseDrone(g, c, d)
      continue
    }
    if (!d || !d.alive || d.owner !== NEUTRAL) continue
    for (const u of g.world.query(c.zone, c.x, c.y, DRONE_RING)) {
      if (!u.alive || !u.isMain || u.owner < 0 || u.data.frozen || dist(u, c) > DRONE_RING) continue
      const p = g.players[u.owner]
      if (!p || p.main !== u.id || p.control !== u.id) continue
      d.owner = u.owner
      d.anon = u.anon
      d.color = u.anon ? -1 : u.color
      d.pilot = u.id
      u.piloting = d.id
      c.data.pilot = u.id
      p.control = d.id
      issue(d, null)
      issue(u, null)
      g.privateLine(p.slot, 'fac.droneLinked')
      break
    }
  }
}

// ───────── 仿生人鑄造台（研究 02 §5.3、§5.5）─────────

function stepFabricator(g: Game): void {
  for (const p of g.allPlayers()) {
    const m = g.mainOf(p)
    if (!m) continue
    const z = g.world.zones[m.zone]
    const pads = z?.alive ? markersOf(z).fabricatorPad : undefined
    // 所有主單位都算（不依身分），只有仿生人的進化選單會讀它
    m.data.atFabricator = !!pads && onPads(m, pads) && g.world.inZone(z.id).some((e) => e.def.id === 'fac.fabricator' && e.alive)
  }
}

function giveRemote(g: Game, to: Ent, p: GamePlayer): void {
  const code = g.world.rng.int(1000, 9999)
  p.data.remoteCode = code
  const it = makeItem('overrideRemote')
  it.data = { slot: p.slot, code }
  if (itemDef('overrideRemote')) giveItem(g, to, it)
}

regScript('android.memoryCore', (g, ctx) => {
  const u = ctx.caster
  const t = ctx.target
  const slot = ctx.itemSlot ?? -1
  const it = slot >= 0 ? u.inv?.[slot] : null
  if (!it || it.id !== 'memoryCore') return false
  const owner = (it.data as { android?: number } | undefined)?.android
  const p = owner !== undefined ? g.players[owner] : undefined
  if (!t || !t.alive) {
    say(g, u, 'fab.coreNoTarget')
    return true
  }
  if (!p || p.alive || p.stayDead || p.left) {
    say(g, u, 'fab.coreDormant')
    return true
  }
  const fs = facOf(g)
  if (t.def.id === 'fac.fabricator') {
    const z = g.world.zones[t.zone]
    if (!z.alive) return true
    if (offFor(g, t) > 0) {
      say(g, u, 'fac.offline')
      return true
    }
    if (fs.rebuilds.has(p.slot)) {
      say(g, u, 'fab.busy')
      return true
    }
    takeUsed(g, ctx, 'memoryCore')
    giveRemote(g, u, p)
    p.data.core = 0
    const pad = padCenter(markersOf(z).fabricatorPad) ?? { x: t.x, y: t.y - 1.5 }
    fs.rebuilds.set(p.slot, g.time + FAB_REBUILD)
    say(g, u, 'fab.rebuilding', { s: FAB_REBUILD })
    g.privateLine(p.slot, 'fab.youRebuild', { s: FAB_REBUILD })
    g.emitFx({ k: 'fabricate', z: z.id, x: t.x, y: t.y, x2: pad.x, y2: pad.y, e: t.id, v: FAB_REBUILD })
    g.after(FAB_REBUILD, () => {
      fs.rebuilds.delete(p.slot)
      if (p.alive || p.stayDead || p.left) return
      if (!z.alive || !t.alive) {
        // 鑄造台在建造途中被毀：核心掉回原地，還可以再找別的辦法
        if (z.alive) {
          const core = dropOnGround(g, z.id, t.x, t.y - 1, { ...it, data: { android: p.slot } })
          p.data.core = core.id
        }
        g.privateLine(p.slot, 'fab.failed')
        return
      }
      // 選過底盤（2000 EP 升級）就用上次的底盤，否則是一般人員外觀（研究 02 §5.3）
      const form = p.form ? FORMS.get(p.form) : undefined
      const nu = g.revivePlayer(p.slot, { zone: z.id, x: pad.x, y: pad.y }, form?.unit ?? 'personnel', 1)
      if (!nu) return
      p.data.coreOnly = false
      applyBuff(g, nu, 'bf.fabArrive', 6)
      g.emitFx({ k: 'fabricated', z: z.id, x: pad.x, y: pad.y, e: nu.id })
    })
    return true
  }
  if (t.def.id === 'npc.pacifier' && t.owner === NEUTRAL) {
    // 綏靖機器人：記憶核心直接接管它（研究 02 §5.3）
    takeUsed(g, ctx, 'memoryCore')
    giveRemote(g, u, p)
    p.data.core = 0
    const at = { zone: t.zone, x: t.x, y: t.y }
    const hpK = t.hp / t.maxHp
    const facing = t.facing
    g.world.remove(t)
    const nu = g.revivePlayer(p.slot, at, 'npc.pacifier', hpK)
    if (nu) {
      nu.facing = facing
      p.data.coreOnly = false
      applyBuff(g, nu, 'bf.booting', 4)
      g.emitFx({ k: 'fabricated', z: at.zone, x: at.x, y: at.y, e: nu.id })
    }
    say(g, u, 'fab.pacifierTaken')
    g.privateLine(p.slot, 'fab.youPacifier')
    return true
  }
  say(g, u, 'fab.coreNoTarget')
  return true
})

// ───────── 模組安裝（研究 03 §3.2）─────────

function socketIn(g: Game, z: Zone, item: string): Ent | undefined {
  return g.world.inZone(z.id).find((e) => e.def.id === 'fac.moduleSocket' && e.alive && String(e.data.poiData?.module ?? '').split(',').includes(item))
}

function markSocket(sock: Ent | undefined, item: string, destroyable: boolean): void {
  if (!sock) return
  sock.data.module = item
  sock.x2 = { mod: item }
  if (destroyable) {
    sock.data.god = false
    sock.statsDirty = true
  }
}

function installModule(g: Game, ctx: EffectCtx, item: string): boolean {
  const u = ctx.caster
  const t = ctx.target
  if (!t || !t.alive) return false
  if (item === 'modKestrel') {
    const inst = t.def.id === 'docked.kestrel' && t.data.ship ? spaceOf(g).ships.get(t.data.ship as string) : undefined
    if (!inst) {
      say(g, u, 'mod.needDockedKestrel')
      return true
    }
    if (inst.mk2) {
      say(g, u, 'mod.already')
      return true
    }
    inst.mk2 = true
    t.x2 = { ...(t.x2 ?? {}), mk2: 1 }
  } else {
    const stId = MOD_STATION[item]
    const z = g.world.zones[t.zone]
    const ok =
      !!stId &&
      z.alive &&
      z.station?.id === stId &&
      ((t.def.id === 'fac.moduleSocket' && String(t.data.poiData?.module ?? '').split(',').includes(item)) || t.data.poi === 'console' || (item === 'modScanAmp' && t.data.vendor === 'radar'))
    if (!ok) {
      say(g, u, 'mod.wrongTarget', { st: STATION_BY_ID.get(stId ?? '')?.name.zh ?? '' })
      return true
    }
    const se = g.world.get(z.spaceEnt)
    const addAbility = (id: string): boolean => {
      if (!se || !se.alive) return false
      if (se.abilities.includes(id) || se.data['once:' + id]) {
        say(g, u, 'mod.already')
        return false
      }
      se.abilities.push(id)
      return true
    }
    switch (item) {
      case 'modScanAmp': {
        const sock = socketIn(g, z, item)
        if (!sock) {
          say(g, u, 'mod.socketGone')
          return true
        }
        if (sock.data.module) {
          say(g, u, 'mod.already')
          return true
        }
        // 裝上後安裝座變成 600 HP 的掃描介面，打爆就停止（研究 03 §3.2）
        markSocket(sock, item, true)
        facOf(g).scanAt = g.time + SCAN_PERIOD
        break
      }
      case 'modAntimatter':
        if (!addAbility('st.antimatter')) return true
        markSocket(socketIn(g, z, item), item, false)
        break
      case 'modThruster':
        if (!addAbility('st.jump')) return true
        break
      case 'modNeurotoxin':
        if (!addAbility('st.neurotox')) return true
        markSocket(socketIn(g, z, item), item, false)
        break
      case 'refinedOre':
        if (!se || !se.alive) return true
        se.mp = Math.min(se.maxMp, se.mp + ORE_MANA)
        break
      default:
        return false
    }
  }
  takeUsed(g, ctx, item)
  g.emitFx({ k: 'moduleInstall', z: t.zone, x: t.x, y: t.y, e: t.id, s: item })
  say(g, u, 'mod.installed.' + item)
  return true
}

for (const [item, fn] of Object.entries(MODULE_TARGET)) regScript(fn, (g, ctx) => installModule(g, ctx, item))

/** 掃描增幅模組：每 45 秒對全體 ping 所有不在太空的玩家主單位與有人駕駛的船（研究 03 §3.2、§4.1）*/
function stepScanAmp(g: Game): void {
  const fs = facOf(g)
  if (!fs.scanAt || g.time < fs.scanAt) return
  const z = zoneByKey(g, 'adjudicatrix')
  const sock = z ? g.world.inZone(z.id).find((e) => e.def.id === 'fac.moduleSocket' && e.alive && e.data.module === 'modScanAmp') : undefined
  if (!sock) {
    fs.scanAt = 0
    return
  }
  fs.scanAt += SCAN_PERIOD
  const all = g.allPlayers().map((p) => p.slot)
  g.systemAll('fac.asadScan')
  for (const p of g.allPlayers()) {
    const m = g.mainOf(p)
    if (!p.alive || !m || !m.alive || m.zone === SPACE_ZONE || m.data.inPod) continue
    g.emitFx({ k: 'ping', z: m.zone, x: m.x, y: m.y, v: 7, s: 'asad' }, all)
  }
  for (const e of g.world.inZone(SPACE_ZONE)) if (e.alive && e.tags.has('ship') && e.pilot) g.emitFx({ k: 'ping', z: SPACE_ZONE, x: e.x, y: e.y, v: 7, s: 'asad' }, all)
}

// ───────── 餘燼衛星模組工廠（研究 03 §3.2）─────────

function factoryCmd(g: Game, p: GamePlayer, f: Ent, a: string): void {
  if (a === 'cancel') {
    if (f.data.prod) g.privateLine(p.slot, 'fac.factoryCancel')
    f.data.prod = null
    f.x2 = {}
    return
  }
  const t = MODULE_BUILD[a]
  if (!t) return
  const prev = f.data.prod as Prod | null | undefined
  // 同時只能生產一個：新單取代舊單（免費）
  f.data.prod = { item: a, until: g.time + t, by: p.slot } satisfies Prod
  f.x2 = { prod: a, left: t }
  g.privateLine(p.slot, prev ? 'fac.factoryReplaced' : 'fac.factoryStart', { item: a, s: t })
  g.emitFx({ k: 'factoryStart', z: f.zone, x: f.x, y: f.y, e: f.id, s: a })
}

function stepFactories(g: Game): void {
  for (const id of facOf(g).factories) {
    const f = g.world.get(id)
    const prod = f?.data.prod as Prod | null | undefined
    if (!f || !f.alive || !prod) continue
    // 電磁停機中：生產暫停
    if (offFor(g, f) > 0) prod.until += 1
    if (g.time < prod.until) {
      f.x2 = { prod: prod.item, left: Math.ceil(prod.until - g.time) }
      continue
    }
    const z = g.world.zones[f.zone]
    const out = padCenter(markersOf(z).moduleOut) ?? { x: f.x, y: f.y - 1.5 }
    dropOnGround(g, z.id, out.x, out.y, makeItem(prod.item))
    g.emitFx({ k: 'moduleDone', z: z.id, x: f.x, y: f.y, x2: out.x, y2: out.y, s: prod.item })
    g.privateLine(prod.by, 'fac.factoryDone', { item: prod.item })
    f.data.prod = null
    f.x2 = {}
  }
}

// ───────── 活體庫號：隔間門與籠子（研究 03 §4.5）─────────

interface CellInfo {
  rooms: number[]
  doors: number[][]
}

export function cellInfo(z: Zone): CellInfo {
  const have = z.data.cellInfo as CellInfo | undefined
  if (have) return have
  const l = z.layout!
  const rooms = l.rooms
    .filter((r) => /^cell\d$/.test(r.spec.id))
    .sort((a, b) => a.spec.id.localeCompare(b.spec.id))
    .map((r) => r.index)
  const doors = rooms.map((ri) =>
    l.doors
      .filter((d) =>
        d.cells.some(([c, r]) =>
          [
            [c + 1, r],
            [c - 1, r],
            [c, r + 1],
            [c, r - 1],
          ].some(([cc, rr]) => cc >= 0 && rr >= 0 && cc < l.w && rr < l.h && l.roomOf[rr * l.w + cc] === ri),
        ),
      )
      .map((d) => d.index),
  )
  const info = { rooms, doors }
  z.data.cellInfo = info
  return info
}

function openCells(z: Zone): number[] {
  return ((z.data.openCells as number[] | undefined) ??= [])
}

export function cellOpenStates(z: Zone): boolean[] {
  const open = openCells(z)
  return cellInfo(z).rooms.map((r) => open.includes(r))
}

/** 切換第 i 間（0 起算）隔間的門鎖；回傳切換後是否開著 */
export function toggleCell(g: Game, z: Zone, i: number): boolean | null {
  const info = cellInfo(z)
  const room = info.rooms[i]
  if (room === undefined) return null
  const open = openCells(z)
  const was = open.includes(room)
  for (const di of info.doors[i]) {
    const d = z.doors[di]
    if (!d) continue
    d.locked = was
    d.lockUntil = 0
    const inst = z.layout!.doors[di]
    g.emitFx({ k: was ? 'cellLock' : 'cellUnlock', z: z.id, x: inst.x, y: inst.y })
  }
  if (was) open.splice(open.indexOf(room), 1)
  else open.push(room)
  return !was
}

function isSpecimen(e: Ent): boolean {
  return e.alive && e.tags.has('creature') && e.owner < 0 && !e.tags.has('noTarget') && !e.tags.has('boss') && !e.tags.has('structure')
}

function cageCmd(g: Game, p: GamePlayer, con: Ent): void {
  const z = g.world.zones[con.zone]
  if (((z.data.cageUntil as number | undefined) ?? 0) > g.time) {
    g.privateLine(p.slot, 'fac.cageBusy')
    return
  }
  z.data.cageUntil = g.time + CAGE_BUILD
  z.data.cageBy = p.slot
  const c = padCenter(markersOf(z).cagePad) ?? { x: con.x, y: con.y - 2 }
  g.privateLine(p.slot, 'fac.cageBuilding', { s: CAGE_BUILD })
  g.emitFx({ k: 'cageBuild', z: z.id, x: c.x, y: c.y, v: CAGE_BUILD })
}

function finishCage(g: Game, z: Zone): void {
  const by = z.data.cageBy as number
  const mobs = unitsOnPads(g, z, 'cagePad', isSpecimen).slice(0, CAGE_CAP)
  if (!mobs.length) {
    g.privateLine(by, 'fac.cageEmpty')
    return
  }
  const c = padCenter(markersOf(z).cagePad)!
  const cage = g.world.spawn(unitDef('fac.cage'), z.id, c.x, c.y, NEUTRAL)
  cage.acquire = false
  cage.data.contents = mobs.map((m) => ({ def: m.def.id, hpK: m.hp / m.maxHp }))
  cage.x2 = { n: mobs.length }
  for (const m of mobs) g.world.remove(m)
  g.privateLine(by, 'fac.caged', { n: mobs.length })
  g.emitFx({ k: 'cageDone', z: z.id, x: c.x, y: c.y, e: cage.id })
}

function stepCages(g: Game): void {
  for (const z of g.world.zones) {
    const until = z.data.cageUntil as number | undefined
    if (!until || g.time < until || !z.alive) continue
    z.data.cageUntil = 0
    finishCage(g, z)
  }
}

// ───────── 未識別物體：啟用碼面板 ─────────

function stepCodePanels(g: Game): void {
  // 未識別物體是事件中途才出現的站：每次重新找面板（只看 uo 站）
  const panels: Ent[] = []
  for (const z of g.world.zones) if (z.alive && z.station?.id === 'uo') for (const e of g.world.inZone(z.id)) if (e.def.id === 'fac.codePanel') panels.push(e)
  for (const panel of panels) {
    for (const p of g.allPlayers()) {
      const m = g.mainOf(p)
      const near = !!m && m.alive && m.zone === panel.zone && dist(m, panel) <= CODE_R + panel.radius
      if (!near) {
        if (p.data.codeSeen === panel.id && (!m || m.zone !== panel.zone || dist(m, panel) > CODE_R + panel.radius + 1)) p.data.codeSeen = 0
        continue
      }
      if (p.data.codeSeen === panel.id) continue
      p.data.codeSeen = panel.id
      const code = uoCode(g)
      g.privateLine(p.slot, code ? 'fac.uoCode' : 'fac.uoCodeDark', code ? { code } : undefined)
    }
  }
}

// ───────── 豪勇號降落傳送門（研究 03 §2.3 A04O）─────────

function stepPortals(g: Game): void {
  const L = stationsOf(g).landed
  if (!L) return
  const a = g.world.inZone(L.bravadoZone).find((e) => e.def.id === 'fac.landingPortal')
  const b = g.world.inZone(L.verdanceZone).find((e) => e.def.id === 'fac.landingPortal')
  if (!a || !b) return
  for (const [from, to] of [
    [a, b],
    [b, a],
  ] as const) {
    const tz = g.world.zones[to.zone]
    if (!tz.alive || !tz.nav) continue
    let i = 0
    for (const u of g.world.query(from.zone, from.x, from.y, 0.8)) {
      if (!transportable(u) || u.data.portalLock === from.id || dist(u, from) > 0.8) continue
      g.emitFx({ k: 'portalHop', z: from.zone, x: u.x, y: u.y, e: u.id })
      sendTo(g, u, tz, { x: to.x, y: to.y - 1.6 }, i++)
      u.data.portalLock = to.id
      g.emitFx({ k: 'portalHop', z: tz.id, x: u.x, y: u.y, e: u.id })
    }
  }
  // 離開抵達的傳送門才能再用
  for (const p of [a, b]) {
    for (const u of g.world.query(p.zone, p.x, p.y, 3)) if (u.data.portalLock === p.id && dist(u, p) > 1.2) u.data.portalLock = 0
  }
}

// ───────── 控制台電磁停機（scripts/items 的 item.empBurst 委派）─────────

regScript('console.emp', (g, ctx) => {
  const c = ctx.target
  if (!c) return false
  // 站點主控台：駕駛者立刻失去控制（停機期間沒人能駕駛，見 space.ts）
  if (c.data.poi === 'console') {
    const v = g.world.get(g.world.zones[c.zone]?.spaceEnt ?? 0)
    if (v && spaceOf(g).pilots.has(v.id)) setPilot(g, v, null)
  }
  return true
})

// ───────── 職業固定出生點 ─────────

/** 艦長→豪勇號 captainSpawn、工程師→火口號 engineerSpawn、王牌→女帝號機庫（ClassDef.spawnAt）；該站沒啟用就回 null */
export function classSpawn(g: Game, classId: string): { zone: number; x: number; y: number } | null {
  const at = CLASSES.get(classId)?.spawnAt
  if (!at) return null
  const z = zoneByKey(g, at)
  if (z?.layout && z.nav) {
    const mk = markersOf(z)[classId + 'Spawn']?.[0] ?? z.layout.spawns[0]
    if (!mk) return null
    const n = z.nav.nearestOpen(mk.x, mk.y) ?? mk
    return { zone: z.id, x: n.x, y: n.y }
  }
  // 不是站名：女帝號裡的房間（王牌飛行員 → 機庫，離停機坪遠一點）
  const nyx = zoneByKey(g, 'nyx')
  const l = nyx?.layout
  const room = l?.rooms.find((r) => r.spec.id === at)
  if (!nyx || !l || !room || !nyx.nav) return null
  let best: { x: number; y: number } | null = null
  let bestD = Infinity
  for (let y = Math.floor(room.minY); y < room.maxY; y++) {
    for (let x = Math.floor(room.minX); x < room.maxX; x++) {
      const px = x + 0.5
      const py = y + 0.5
      const i = nyx.nav.idx(px, py)
      if (i < 0 || l.roomOf[i] !== room.index || nyx.nav.blockedIdx(i)) continue
      if (l.pads.some((p) => Math.hypot(p.x - px, p.y - py) < 4)) continue
      const d = Math.hypot(px - room.cx, py - room.cy)
      if (d < bestD) {
        bestD = d
        best = { x: px, y: py }
      }
    }
  }
  return best ? { zone: nyx.id, ...best } : null
}

// ───────── 操作面板（PrivateState.fac）與指令 ─────────

const PANEL_DEFS = new Set(['struct.power', 'fac.moduleFactory', 'fac.cellConsole', 'fac.cageConsole'])

function nearestPanel(g: Game, u: Ent): Ent | null {
  let best: Ent | null = null
  let bestD = Infinity
  for (const e of g.world.query(u.zone, u.x, u.y, FAC_REACH + 1.5)) {
    if (!e.alive || !PANEL_DEFS.has(e.def.id)) continue
    const d = dist(u, e)
    if (d > FAC_REACH + e.radius || d >= bestD) continue
    bestD = d
    best = e
  }
  return best
}

/** 站在設施旁時給本人的操作面板 */
export function facilityView(g: Game, p: GamePlayer): FacilityView | null {
  const u = g.mainOf(p)
  if (!p.alive || !u || !u.alive || p.control !== u.id || u.zone === SPACE_ZONE) return null
  const f = nearestPanel(g, u)
  if (!f) return null
  const z = g.world.zones[f.zone]
  const off = offFor(g, f)
  switch (f.def.id) {
    case 'struct.power': {
      const ps = powerOf(g)
      return { k: 'power', e: f.id, mode: POWER_MODES.indexOf(powerMode(g)), cd: POWER_MODES.map((m) => Math.max(0, Math.ceil((ps.cds[m] ?? 0) - g.time))), off }
    }
    case 'fac.moduleFactory': {
      const prod = f.data.prod as Prod | null | undefined
      return { k: 'factory', e: f.id, cur: prod?.item ?? '', left: prod ? Math.max(0, Math.ceil(prod.until - g.time)) : 0, off }
    }
    case 'fac.cellConsole':
      return { k: 'cells', e: f.id, open: cellOpenStates(z), off }
    case 'fac.cageConsole':
      return { k: 'cage', e: f.id, busy: Math.max(0, Math.ceil(((z.data.cageUntil as number | undefined) ?? 0) - g.time)), pad: unitsOnPads(g, z, 'cagePad', isSpecimen).length, off }
  }
  return null
}

function facilityCmd(g: Game, p: GamePlayer, u: Ent, c: Command): void {
  if (c.e === undefined || !c.a || !canSee(g, p, c.e)) return
  // 只能用本人的主單位操作（駕駛載具、操控無人機時不行）
  if (u.id !== p.main) return
  const f = g.world.get(c.e)
  if (!f || !f.alive || f.zone !== u.zone || !PANEL_DEFS.has(f.def.id)) return
  if (dist(u, f) > FAC_REACH + f.radius + 0.2) {
    g.privateLine(p.slot, 'fac.tooFar')
    return
  }
  if (offFor(g, f) > 0) {
    g.privateLine(p.slot, 'fac.offline')
    return
  }
  const z = g.world.zones[f.zone]
  switch (f.def.id) {
    case 'struct.power':
      if (c.a === 'power' && z.key === 'nyx') powerCmd(g, p, u, c.s)
      break
    case 'fac.moduleFactory':
      factoryCmd(g, p, f, c.a)
      break
    case 'fac.cellConsole': {
      if (c.a !== 'cell' || c.s === undefined) return
      const open = toggleCell(g, z, c.s)
      if (open !== null) g.privateLine(p.slot, open ? 'fac.cellOpened' : 'fac.cellClosed', { n: c.s + 1 })
      break
    }
    case 'fac.cageConsole':
      if (c.a === 'cage') cageCmd(g, p, f)
      break
  }
}

EXTRA_COMMANDS.set('facility', facilityCmd)

// ───────── 安裝 ─────────

const installed = new WeakSet<Game>()

export function installFacilities(g: Game): void {
  if (installed.has(g)) return
  installed.add(g)
  const fs = facOf(g)
  powerOf(g)
  pairDrones(g)
  for (const e of g.world.ents.values()) {
    if (e.def.id === 'fac.moduleFactory') fs.factories.push(e.id)
  }
  g.systems.push({
    name: 'facilities',
    fn: (gg) => {
      const tick = gg.world.tick
      if (tick % 2 === 0) {
        stepDrones(gg)
        stepPortals(gg)
      }
      if (tick % 5 === 0) {
        stepFabricator(gg)
        stepCages(gg)
      }
      if (tick % 10 === 0) stepCodePanels(gg)
      if (tick % 20 === 0) {
        stepPower(gg)
        stepFactories(gg)
      }
      stepScanAmp(gg)
    },
  })
  DEATH_HOOKS.push((g2, u) => {
    if (g2 !== g) return
    // 牢籠被打破：放出裡面的標本（站點毀滅中則一起陪葬）
    if (u.def.id === 'fac.cage') {
      const z = g.world.zones[u.zone]
      const list = (u.data.contents as { def: string; hpK: number }[] | undefined) ?? []
      u.data.contents = []
      if (z?.alive) {
        for (const c of list) {
          const s = spawnCreature(g, c.def, u.zone, u.x, u.y, 1)
          if (s) s.hp = Math.max(1, s.maxHp * c.hpK)
        }
        g.emitFx({ k: 'cageBreak', z: u.zone, x: u.x, y: u.y })
      }
    }
    // 操控中的無人機被擊毀：控制權回到本人
    if (u.def.id === 'npc.defenseDrone' && u.owner >= 0) {
      const p = g.players[u.owner]
      if (p && p.control === u.id) p.control = p.main
      const c = g.world.get(u.data.ctl as number)
      if (c) {
        const pe = g.world.get(c.data.pilot as number)
        if (pe) pe.piloting = 0
        c.data.pilot = 0
      }
    }
    // 動力分配台被毀（自訂）：女帝號切回一般模式並改用緊急照明
    if (u.def.id === 'struct.power') {
      const z = g.world.zones[u.zone]
      if (z?.key === 'nyx') {
        setPowerMode(g, 'normal')
        z.power = 'emergency'
      }
    }
  })
}
