// 船艙艙門（第 6 輪審查 B-P2：停靠後玩家不知道怎麼下船，艙門沒有標示、沒有懸停說明）。
// 船艙版面的出入口（'E' 格）沒有實體，sim 在單位走到那一格時讓他下船（停靠中）或穿過登艦連結。
// client 看不到「這艘船停靠了沒」的欄位，改從自己的觀察推（CabinTracker）：怎麼進船艙的、自己駕駛的船還在不在太空層、
// 發射倒數數完了沒；都不知道時才看太空層（所有人都看得到，sim vision.ts）：同型船艙只有一艘、太空層沒有那型船＝停在站上。
// 只用自己本來就看得到的資料（自己所在的 zone、太空層的公開實體、自己的發射倒數），不多給任何資訊。
import { STATION_BY_ID } from '../shared/content/stations/index'

/** 船艙 zone 的站點 id 前綴（sim space.ts shipStationDef：'ship:<船型>'）*/
const CABIN = 'ship:'

/** 自己所在的船艙與艙門位置 */
export interface CabinHatch {
  zone: number
  x: number
  y: number
  /** true = 停在站上（走過去下船）、false = 在太空中、null = 不確定 */
  docked: boolean | null
}

/**
 * 船艙停靠了沒。station = 船艙 zone 的站點 id（'ship:kestrel'）；cabins = 本局所有 zone 的站點 id；
 * spaceDefs = 太空層看得到的實體外觀 id。不是船艙回傳 undefined。
 */
export function cabinDocked(station: string, cabins: Iterable<string>, spaceDefs: Iterable<string>): boolean | null | undefined {
  if (!station.startsWith(CABIN)) return undefined
  let same = 0
  for (const s of cabins) if (s === station) same++
  if (same !== 1) return null
  const want = 'ship.' + station.slice(CABIN.length)
  for (const d of spaceDefs) if (d === want) return false
  return true
}

/** client 端需要的最少介面（GameScene.zones、ClientWorld）*/
interface ZoneLike {
  id: number
  station: string
  layout: { exits: readonly { x: number; y: number }[] }
}
interface WorldLike {
  me: { unit?: number; control?: number; alive?: boolean; launchIn?: number }
  ents: ReadonlyMap<number, { s: { d?: string; z?: number; fl?: number } }>
}

/** 站點可不可以停靠（只能登艦的火口號、擺渡號不行）：從那裡進船艙＝穿過登艦連結，船在太空中 */
export type DockableOf = (station: string) => boolean

/**
 * 自己所在船艙的停靠狀態追蹤（每幀呼叫 update；只看自己的觀察，不多拿任何資訊）：
 * 1. 從可停靠的站走進船艙＝停著（只有停靠中的船能從站上登船）；從別的船艙、只能登艦的站進來＝登艦連結，船在太空中。
 * 2. 自己在這個船艙駕駛這艘船＝在太空中，記下它在太空層的實體；那個實體從太空層消失＝停靠了（或被擊毀）。
 * 3. 發射倒數（私有狀態 launchIn）數完＝發射了；發射後太空層新出現的同型船就是這艘。
 * 4. 都還不知道：用同型船艙只有一艘時的推斷（cabinDocked）。
 */
export class CabinTracker {
  private zone = -1
  private docked: boolean | null = null
  private shipEnt = 0
  private lastLaunch = 0
  /** 發射倒數中太空層已有的同型船（發射後多出來的那一艘就是自己的）*/
  private before: Set<number> | null = null
  private prevZone = -1

  update(world: WorldLike, zones: ReadonlyMap<number, ZoneLike>, dockable: DockableOf): CabinHatch | null {
    const me = world.me
    const u = world.ents.get(me.unit ?? 0)
    const uz = me.alive === false || !u ? -1 : (u.s.z ?? -1)
    const info = zones.get(uz)
    const cabin = !!info && info.station.startsWith(CABIN)
    if (uz !== this.zone) {
      this.zone = cabin ? uz : -1
      this.shipEnt = 0
      this.lastLaunch = 0
      this.before = null
      const prev = zones.get(this.prevZone)
      this.docked = !cabin || !prev ? null : prev.station.startsWith(CABIN) ? false : dockable(prev.station)
    }
    if (uz !== -1) this.prevZone = uz
    if (!cabin || !info) return null
    const type = 'ship.' + info.station.slice(CABIN.length)
    // 2. 駕駛中：控制的就是這艘船在太空層的實體
    const ctl = me.control && me.control !== me.unit ? world.ents.get(me.control) : undefined
    if (ctl && ctl.s.d === type && ctl.s.z === 0) {
      this.shipEnt = me.control!
      this.docked = false
    } else if (this.shipEnt && !world.ents.has(this.shipEnt)) {
      this.shipEnt = 0
      this.docked = true
    }
    // 3. 發射倒數
    const li = me.launchIn ?? 0
    if (li > 0) {
      if (!this.before) this.before = spaceIds(world, type)
    } else if (this.lastLaunch > 0) {
      if (this.lastLaunch <= 1.5) {
        this.docked = false
        for (const id of spaceIds(world, type)) if (!this.before?.has(id)) this.shipEnt = id
      }
      this.before = null
    }
    this.lastLaunch = li
    const ex = info.layout.exits[0]
    if (!ex) return null
    let docked = this.docked
    if (docked === null) {
      const spaceDefs: string[] = []
      for (const e of world.ents.values()) if (e.s.z === 0 && e.s.d) spaceDefs.push(e.s.d)
      docked =
        cabinDocked(
          info.station,
          [...zones.values()].map((z) => z.station),
          spaceDefs,
        ) ?? null
    }
    return { zone: info.id, x: ex.x, y: ex.y, docked }
  }
}

/** 太空層某一型船的實體 id */
function spaceIds(world: WorldLike, type: string): Set<number> {
  const out = new Set<number>()
  for (const [id, e] of world.ents) if (e.s.z === 0 && e.s.d === type) out.add(id)
  return out
}

const tracker = new CabinTracker()

/** 站點能不能停靠（StationDef.dockable，預設可以）*/
export function stationDockable(station: string): boolean {
  return STATION_BY_ID.get(station)?.dockable !== false
}

/**
 * 自己（主單位，沒在駕駛別的東西）站在船艙裡：回傳艙門的位置與停靠狀態；不在船艙、正在駕駛、死了回傳 null。
 * 每次呼叫都會更新追蹤（駕駛中也要呼叫，才記得住駕駛的是哪一艘）。
 */
export function cabinHatch(world: WorldLike, zones: ReadonlyMap<number, ZoneLike>, dockable: DockableOf = stationDockable): CabinHatch | null {
  const hc = tracker.update(world, zones, dockable)
  const me = world.me
  if (!hc || (me.control && me.control !== me.unit)) return null
  return hc
}
