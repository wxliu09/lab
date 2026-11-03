// 開局：建立啟用的站點 zone、太空實體、站內設施、玩家單位
import { ALL_STATIONS } from '../shared/content/stations/index'
import type { StationDef } from '../shared/content/stations/types'
import { UNITS, VENDORS, regUnits, unitDef } from '../shared/content/registry'
import type { UnitDef } from '../shared/content/types'
import { Cell, cellCenter, type PoiInstance } from '../shared/layout'
import { HOSTILE, NEUTRAL, type Ent } from './ent'
import type { Game } from './game'
import { SPACE_ZONE, type Zone } from './world'
import { initVendor } from './systems/vendors'
import { STATION_MANA } from '../shared/content/facilities'
import { CRATE_COUNT, CRATE_LOOT, CRATE_POI_DROP } from '../shared/content/items'
import '../shared/content/index'

export function stationUnitId(st: StationDef): string {
  return 'station.' + st.id
}

/** 站點的太空實體 def（由 StationDef 產生）*/
export function ensureStationDef(st: StationDef): UnitDef {
  const id = stationUnitId(st)
  const have = UNITS.get(id)
  if (have) return have
  const mana = STATION_MANA[st.id]
  const def: UnitDef = {
    id,
    name: st.name,
    model: st.space.model,
    hp: st.space.hp,
    hpRegen: st.space.hpRegen,
    mp: mana?.[1] ?? 0,
    mpRegen: mana?.[2] ?? 0,
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
  for (const st of chooseStations(g)) addStation(g, st)
}

/** 建立一個地點：內部 zone、太空實體、設施（開局或事件中途出現的站都走這裡）*/
export function addStation(g: Game, st: StationDef, pos?: [number, number], owner = NEUTRAL): Zone {
  const w = g.world
  const z = w.addInterior(st.id, st)
  const def = ensureStationDef(st)
  const [x, y] = pos ?? st.space.pos
  const se = w.spawn(def, SPACE_ZONE, x, y, owner)
  se.global = true
  se.data.interior = z.id
  se.data.station = st.id
  const mana = STATION_MANA[st.id]
  if (mana) se.mp = mana[0]
  z.spaceEnt = se.id
  g.stations.push(st.id)
  for (const poi of z.layout!.pois) placePoi(g, z, poi)
  placeCrates(g, z)
  return z
}

// ───────── 雜物箱（原作 war3map.doo 的 LTcr 共 99 個：各站三五個一堆擺在房間裡）─────────

/** 箱子離門、出生點、出入口多遠（格，切比雪夫距離）*/
const CRATE_DOOR_GAP = 2
const CRATE_SPAWN_GAP = 1
const CRATE_EXIT_GAP = 3
/** 箱子離 POI（設施、標記）多遠；佔地大的另外指定 */
const CRATE_POI_GAP = 2
const CRATE_POI_GAP_BY: Record<string, number> = {
  landingSite: 6,
  landingPortal: 3,
  podLanding: 3,
  cagePad: 3,
  fabricatorPad: 3,
}
/** 箱子離停機坪中心多遠（公尺）*/
const CRATE_PAD_GAP = 4.5
/** 箱子正前方（背對牆的那一側）至少留幾格空地：不把通道擠成一格寬 */
const CRATE_CLEAR = 3
/** 一堆的大小 */
const CRATE_PILE: [number, number] = [2, 4]
/** 兩堆箱子的起點至少隔幾格 */
const CRATE_PILE_GAP = 4
/** 依房間類型挑房間的權重：走道、機庫（停機坪）、標本隔間不放；倉庫類多放 */
const CRATE_ROOM_WEIGHT: Record<string, number> = {
  corridor: 0,
  hangar: 0,
  cell: 0,
  cargo: 3,
  closet: 2,
  armory: 2,
  engine: 2,
  dropbay: 2,
  reactor: 1.5,
  quarters: 1.5,
  bridge: 0.5,
  pods: 0.5,
}

const DIR4: [number, number][] = [
  [1, 0],
  [-1, 0],
  [0, 1],
  [0, -1],
]

/**
 * 開局（或事件站出現時）依 CRATE_COUNT 把雜物箱補到原作數量：版面上的 rummageBox 也算在內，其餘用 sim 的 rng
 * 一堆一堆放在房間地板的空格。箱子要靠著牆（或同一堆的箱子），正前方留空地；避開門口、POI、出生點、出入口、
 * 停機坪與走道；每放一個都確認不會把任何地板隔開。箱子佔用的導航格記在 data.navIdx（死亡時由 death 系統釋放）。
 * 回傳放了幾個。
 */
export function placeCrates(g: Game, z: Zone): number {
  const st = z.station
  const l = z.layout
  const nav = z.nav
  const want = st ? (CRATE_COUNT[st.id] ?? 0) : 0
  if (!st || !l || !nav || want <= 0) return 0
  const w = g.world
  const rng = w.rng
  let have = w.inZone(z.id).filter((e) => e.def.id === 'struct.rummage').length
  if (have >= want) return 0
  const W = l.w
  const H = l.h
  const open = (c: number, r: number): boolean =>
    c >= 0 && r >= 0 && c < W && r < H && !nav.solid[r * W + c] && !nav.dyn[r * W + c]
  // 禁區
  const banned = new Uint8Array(W * H)
  const ban = (c0: number, r0: number, gap: number): void => {
    for (let r = r0 - gap; r <= r0 + gap; r++)
      for (let c = c0 - gap; c <= c0 + gap; c++) if (c >= 0 && r >= 0 && c < W && r < H) banned[r * W + c] = 1
  }
  const banAt = (p: { x: number; y: number }, gap: number): void =>
    ban(Math.floor(p.x), H - 1 - Math.floor(p.y), gap)
  for (const d of l.doors) for (const [c, r] of d.cells) ban(c, r, CRATE_DOOR_GAP)
  for (const p of l.pois) ban(p.col, p.row, CRATE_POI_GAP_BY[p.def.kind] ?? CRATE_POI_GAP)
  for (const s of l.spawns) banAt(s, CRATE_SPAWN_GAP)
  for (const e of l.exits) banAt(e, CRATE_EXIT_GAP)
  const nearPad = (c: number, r: number): boolean =>
    l.pads.some((p) => Math.hypot(p.x - (c + 0.5), p.y - (H - r - 0.5)) < CRATE_PAD_GAP)
  // 候選格：一般地板（不含危險區）、在可放的房間裡、不在禁區
  const roomCand = new Map<number, number[]>()
  for (let r = 0; r < H; r++) {
    for (let c = 0; c < W; c++) {
      const i = r * W + c
      if (l.cells[i] !== Cell.Floor || banned[i] || !open(c, r) || nearPad(c, r)) continue
      const room = l.roomOf[i]
      if (room < 0 || (CRATE_ROOM_WEIGHT[l.rooms[room].spec.type] ?? 1) <= 0) continue
      const list = roomCand.get(room) ?? []
      list.push(i)
      roomCand.set(room, list)
    }
  }
  const isCand = new Uint8Array(W * H)
  for (const list of roomCand.values()) for (const i of list) isCand[i] = 1
  /** 靠著擋路的格子（牆、窗、貨箱、設施、別的箱子），而且背對它的那一側留得出 CRATE_CLEAR 格空地 */
  const fits = (i: number): boolean => {
    if (!isCand[i]) return false
    const c = i % W
    const r = (i - c) / W
    if (!open(c, r)) return false
    let backed = false
    for (const [dc, dr] of DIR4) {
      if (open(c - dc, r - dr)) continue
      backed = true
      for (let k = 1; k <= CRATE_CLEAR; k++) if (!open(c + dc * k, r + dr * k)) return false
    }
    return backed
  }
  /** 把 i 擋起來之後，它四周的地板彼此還走得到（= 整張圖的連通性不變）*/
  const keepsConnected = (i: number): boolean => {
    const c = i % W
    const r = (i - c) / W
    const nb = DIR4.map(([dc, dr]) => [c + dc, r + dr])
      .filter(([cc, rr]) => open(cc, rr))
      .map(([cc, rr]) => rr * W + cc)
    if (nb.length <= 1) return true
    nav.dyn[i]++
    const seen = new Uint8Array(W * H)
    const stack = [nb[0]]
    seen[nb[0]] = 1
    let left = nb.length - 1
    while (stack.length && left > 0) {
      const j = stack.pop()!
      const jc = j % W
      const jr = (j - jc) / W
      for (const [dc, dr] of DIR4) {
        const nc = jc + dc
        const nr = jr + dr
        if (!open(nc, nr)) continue
        const k = nr * W + nc
        if (seen[k]) continue
        seen[k] = 1
        if (nb.includes(k)) left--
        stack.push(k)
      }
    }
    nav.dyn[i]--
    return left === 0
  }
  const def = unitDef('struct.rummage')
  const loot = CRATE_LOOT[st.id]
  const put = (i: number): void => {
    const c = i % W
    const r = (i - c) / W
    const p = cellCenter(l, c, r)
    const e = w.spawn(def, z.id, p.x, p.y, NEUTRAL)
    e.facing = (rng.int(0, 3) * Math.PI) / 2 + rng.range(-0.2, 0.2)
    e.data.navIdx = i
    if (loot) e.data.loot = loot
    nav.dyn[i]++
    isCand[i] = 0
    have++
  }
  const anchorBan = new Uint8Array(W * H)
  let placed = 0
  // 先照房間權重挑房間、再挑靠牆的起點，從起點往旁邊長成一堆；房間挑不出起點就不再挑它。
  // 第一輪各堆之間保持距離，還不夠數量才放寬（第二輪不看堆距）
  for (const spaced of [true, false]) {
    const rooms = [...roomCand.keys()]
    while (have < want && rooms.length) {
      let sum = 0
      for (const ri of rooms) sum += CRATE_ROOM_WEIGHT[l.rooms[ri].spec.type] ?? 1
      let x = rng.next() * sum
      let k = 0
      for (; k < rooms.length - 1; k++) {
        x -= CRATE_ROOM_WEIGHT[l.rooms[rooms[k]].spec.type] ?? 1
        if (x < 0) break
      }
      const room = rooms[k]
      const anchors = roomCand.get(room)!.filter((i) => (!spaced || !anchorBan[i]) && fits(i))
      const anchor = anchors.length ? rng.pick(anchors) : -1
      if (anchor < 0 || !keepsConnected(anchor)) {
        if (anchor >= 0) isCand[anchor] = 0
        else rooms.splice(k, 1)
        continue
      }
      const pile = [anchor]
      put(anchor)
      placed++
      const size = Math.min(want - have + 1, rng.int(CRATE_PILE[0], CRATE_PILE[1]))
      while (pile.length < size && have < want) {
        const front: number[] = []
        for (const j of pile) {
          const jc = j % W
          const jr = (j - jc) / W
          for (const [dc, dr] of DIR4) {
            const n = (jr + dr) * W + (jc + dc)
            if (jc + dc >= 0 && jc + dc < W && jr + dr >= 0 && jr + dr < H && !front.includes(n) && fits(n))
              front.push(n)
          }
        }
        let next = -1
        while (front.length) {
          const n = front.splice(rng.int(0, front.length - 1), 1)[0]
          if (keepsConnected(n)) {
            next = n
            break
          }
        }
        if (next < 0) break
        pile.push(next)
        put(next)
        placed++
      }
      for (const j of pile) {
        const jc = j % W
        const jr = (j - jc) / W
        for (let r = jr - CRATE_PILE_GAP; r <= jr + CRATE_PILE_GAP; r++)
          for (let c = jc - CRATE_PILE_GAP; c <= jc + CRATE_PILE_GAP; c++)
            if (c >= 0 && r >= 0 && c < W && r < H) anchorBan[r * W + c] = 1
      }
    }
  }
  return placed
}

export type Marker = { x: number; y: number; ref?: string }

export function markersOf(z: Zone): Record<string, Marker[]> {
  return (z.data.markers ??= {}) as Record<string, Marker[]>
}

// ───────── 站點主控台（StationDef.console；研究 03 §1.2 各站控制台 HP 不同）─────────

/** 套用這座站主控台的數值：HP、每秒回復、無敵、屬敵方（開局生成與站點介面裝置重建共用）*/
export function applyConsoleSpec(z: Zone, e: Ent): void {
  const spec = z.station?.console
  if (!spec) return
  if (spec.hp) e.hp = e.maxHp = spec.hp
  // 每秒回復：def 的 hpRegen 是所有站共用的，個別站的回復掛在被動 buff（不進快照）
  if (spec.regen) e.data.passives = ['bf.consoleRepair']
  if (spec.invuln) e.data.god = true
  if (spec.hostile) e.owner = HOSTILE
  e.statsDirty = true
}

/** 在原地生成一座完好的主控台（站點介面裝置修好損毀的控制台時用）*/
export function spawnConsole(g: Game, z: Zone, x: number, y: number, facing: number): Ent {
  const e = g.world.spawn(unitDef(z.station?.console?.def ?? 'struct.console'), z.id, x, y, NEUTRAL)
  e.facing = facing
  applyConsoleSpec(z, e)
  return e
}

export function placePoi(g: Game, z: Zone, poi: PoiInstance): Ent | null {
  const w = g.world
  let def: UnitDef
  switch (poi.def.kind) {
    case 'console':
      // 各站的主控台定義與數值見 StationDef.console（consoleSpec）
      def = unitDef(z.station?.console?.def ?? 'struct.console')
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
    // ───── 各站特殊設施（M7；行為在 systems/facilities.ts）─────
    case 'fabricator':
      def = unitDef('fac.fabricator')
      break
    case 'moduleSocket':
      def = unitDef('fac.moduleSocket')
      break
    case 'moduleFactory':
      def = unitDef('fac.moduleFactory')
      break
    case 'cellConsole':
      def = unitDef('fac.cellConsole')
      break
    case 'cageConsole':
      def = unitDef('fac.cageConsole')
      break
    case 'codePanel':
      def = unitDef('fac.codePanel')
      break
    case 'penguinStatue':
      def = unitDef('fac.penguinStatue')
      break
    case 'landingSite':
      def = unitDef('fac.landingSite')
      break
    case 'landingPortal':
      def = unitDef('fac.landingPortal')
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
  if (poi.def.data) e.data.poiData = { ...poi.def.data }
  if (poi.def.kind === 'moduleSocket') e.data.god = true
  if (poi.def.kind === 'console') applyConsoleSpec(z, e)
  if (poi.def.kind === 'rummageBox') {
    // 版面上固定的雜物箱：海盜船貨艙的補給箱被毀必掉急救包（scripts/items 的死亡 hook）
    const drop = CRATE_POI_DROP[z.key]
    if (drop) e.data.dropItem = drop
    const loot = CRATE_LOOT[z.key]
    if (loot) e.data.loot = loot
  }
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
