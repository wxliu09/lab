// 開局：建立啟用的站點 zone、太空實體、站內設施、玩家單位
import { ALL_STATIONS } from '../shared/content/stations/index'
import type { StationDef } from '../shared/content/stations/types'
import { UNITS, VENDORS, regUnits, unitDef } from '../shared/content/registry'
import type { UnitDef } from '../shared/content/types'
import type { PoiInstance } from '../shared/layout'
import { NEUTRAL, type Ent } from './ent'
import type { Game } from './game'
import { SPACE_ZONE, type Zone } from './world'
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
  if (s !== 'auto') return ALL_STATIONS.filter((st) => st.enable === 'core' || s.includes(st.id))
  // M7 起依人數啟用；目前全部啟用已實作的站
  return ALL_STATIONS
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

function placePoi(g: Game, z: Zone, poi: PoiInstance): Ent | null {
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
      ;((z.data.markers ??= {}) as Record<string, { x: number; y: number }[]>)[poi.def.kind] ??= []
      ;(z.data.markers as Record<string, { x: number; y: number }[]>)[poi.def.kind].push({ x: poi.x, y: poi.y })
      return null
  }
  const e = w.spawn(def, z.id, poi.x, poi.y, NEUTRAL)
  e.facing = poi.facing
  e.data.poi = poi.def.kind
  if (poi.def.ref) e.data.ref = poi.def.ref
  if (poi.def.kind === 'vendor') e.data.vendor = poi.def.ref
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
