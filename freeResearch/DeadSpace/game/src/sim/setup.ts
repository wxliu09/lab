// 開局：建立啟用的站點 zone、太空實體、站內設施、玩家單位
import { ALL_STATIONS } from '../shared/content/stations/index'
import type { StationDef } from '../shared/content/stations/types'
import { UNITS, VENDORS, regUnits, unitDef } from '../shared/content/registry'
import type { UnitDef } from '../shared/content/types'
import type { PoiInstance } from '../shared/layout'
import { NEUTRAL, type Ent } from './ent'
import type { Game } from './game'
import { SPACE_ZONE, type Zone } from './world'
import { initVendor } from './systems/vendors'
import '../shared/content/index'

export function stationUnitId(st: StationDef): string {
  return 'station.' + st.id
}

/** 站點的太空實體 def（由 StationDef 產生）*/
export function ensureStationDef(st: StationDef): UnitDef {
  const id = stationUnitId(st)
  const have = UNITS.get(id)
  if (have) return have
  const def: UnitDef = {
    id,
    name: st.name,
    model: st.space.model,
    hp: st.space.hp,
    hpRegen: st.space.hpRegen,
    mp: 0,
    mpRegen: 0,
    speed: st.space.speed,
    radius: st.space.radius,
    sight: 30,
    attack: st.space.attack,
    abilities: st.space.abilities,
    tags: ['station', 'space', 'structure', 'mechanical'],
    layer: 'space',
  }
  regUnits([def])
  return def
}

export function vendorUnitId(ref: string): string {
  return 'vendor.' + ref
}

function ensureVendorDef(ref: string): UnitDef {
  const id = vendorUnitId(ref)
  const have = UNITS.get(id)
  if (have) return have
  const v = VENDORS.get(ref)
  const def: UnitDef = {
    id,
    name: v?.name ?? { zh: ref, en: ref },
    model: v?.model ?? 'vendor',
    hp: v?.hp ?? 1600,
    hpRegen: 0,
    mp: 0,
    mpRegen: 0,
    speed: 0,
    radius: 0.55,
    sight: 6,
    abilities: [],
    tags: v?.invuln ? ['structure', 'mechanical', 'vendor', 'invuln'] : ['structure', 'mechanical', 'vendor'],
  }
  regUnits([def])
  return def
}

export function chooseStations(g: Game): StationDef[] {
  const s = g.settings.stations
  const pool = ALL_STATIONS.filter((st) => st.enable !== 'event')
  if (s !== 'auto') return pool.filter((st) => st.enable === 'core' || s.includes(st.id))
  // 依人數啟用：核心站永遠在；人越多開越多額外站（GDD §6.2）
  const n = g.allPlayers().filter((p) => !p.spectator).length
  const extra = pool.filter((st) => st.enable === 'auto')
  const want = n >= 9 ? extra.length : n >= 6 ? Math.min(extra.length, 2) : n >= 4 ? Math.min(extra.length, 1) : 0
  const pick = g.world.rng.shuffle([...extra]).slice(0, want)
  return pool.filter((st) => st.enable === 'core' || pick.includes(st))
}

export function setupWorld(g: Game): void {
  const w = g.world
  for (const st of chooseStations(g)) {
    const z = w.addInterior(st.id, st)
    const def = ensureStationDef(st)
    const se = w.spawn(def, SPACE_ZONE, st.space.pos[0], st.space.pos[1], NEUTRAL)
    se.global = true
    se.data.interior = z.id
    se.data.station = st.id
    z.spaceEnt = se.id
    g.stations.push(st.id)
    for (const poi of z.layout!.pois) placePoi(g, z, poi)
  }
}

export type Marker = { x: number; y: number; ref?: string }

export function markersOf(z: Zone): Record<string, Marker[]> {
  return (z.data.markers ??= {}) as Record<string, Marker[]>
}

export function placePoi(g: Game, z: Zone, poi: PoiInstance): Ent | null {
  const w = g.world
  let def: UnitDef
  switch (poi.def.kind) {
    case 'console':
      def = unitDef('struct.console')
      break
    case 'powerConsole':
      def = unitDef('struct.power')
      break
    case 'git':
      def = unitDef('struct.git')
      break
    case 'regenerator':
      def = unitDef('struct.regen')
      break
    case 'rummageBox':
      def = unitDef('struct.rummage')
      break
    case 'vendor':
      def = ensureVendorDef(poi.def.ref ?? 'unknown')
      break
    case 'droneControl':
      def = unitDef('struct.droneControl')
      break
    case 'enhancer':
      def = unitDef('struct.enhancer')
      break
    default:
      // 純標記（出生點、生成點）：存在 zone.data
      ;(markersOf(z)[poi.def.kind] ??= []).push({ x: poi.x, y: poi.y, ref: poi.def.ref })
      return null
  }
  const e = w.spawn(def, z.id, poi.x, poi.y, NEUTRAL)
  e.facing = poi.facing
  e.data.poi = poi.def.kind
  if (poi.def.ref) e.data.ref = poi.def.ref
  if (poi.def.kind === 'vendor') e.data.vendor = poi.def.ref
  // GIT 檢測儀也販售基因檢測器（420 秒後上架）
  if (poi.def.kind === 'git') e.data.vendor = 'gitTester'
  if (e.data.vendor) initVendor(g, e)
  return e
}

/** 依職業與規則找出生點 */
export function spawnPoints(g: Game): { zone: number; x: number; y: number }[] {
  const pts: { zone: number; x: number; y: number }[] = []
  for (const z of g.world.zones) {
    if (!z.layout) continue
    for (const s of z.layout.spawns) pts.push({ zone: z.id, x: s.x, y: s.y })
  }
  return pts
}
