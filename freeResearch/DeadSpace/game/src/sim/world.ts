// 世界：多個 zone（每座站的內部各一個，加上太空 zone 0）與所有實體。
import { parseLayout, type ParsedLayout } from '../shared/layout'
import type { StationDef } from '../shared/content/stations/types'
import type { UnitDef } from '../shared/content/types'
import { Rng, cryptoSeed, type RngSeed, type RngSource } from '../shared/rng'
import { NavGrid } from './nav/grid'
import { makeEnt, type Ent } from './ent'

export const SPACE_ZONE = 0
/** 太空層半邊長（公尺）*/
export const SPACE_HALF = 49

export interface DoorState {
  index: number
  open: boolean
  locked: boolean
  /** 上鎖到期（駭門 15 秒）；0 = 永久 */
  lockUntil: number
  broken: boolean
  hp: number
  /** 最近通過紀錄（剪影：def id）*/
  log: { t: number; sil: string }[]
  /** 強制關門（故障事件）：到這個時間之前門是關死的（碰撞擋住）*/
  forced: number
  /** 門控制器故障中、這扇門正在週期開關（events.ts 設定；移動系統把它當成「會週期打開」的門來尋路）*/
  cycling: boolean
  clearance?: string
  security?: boolean
}

export interface Zone {
  id: number
  key: string
  kind: 'space' | 'interior'
  station: StationDef | null
  layout: ParsedLayout | null
  nav: NavGrid | null
  doors: DoorState[]
  /** 這個內部對應的太空實體（站或船）*/
  spaceEnt: number
  alive: boolean
  /** 被摧毀後的致命區到期時間 */
  lethalUntil: number
  /** 空間雜湊：格大小 4 m */
  buckets: Map<number, Set<Ent>>
  /** 依房間的動力／照明狀態 */
  power: 'normal' | 'emergency' | 'off'
  /** 被攻擊警報到期 */
  alarmUntil: number
  /** 啟用碼等站內私有資料 */
  data: Record<string, unknown>
}

const BUCKET = 4

function bkey(x: number, y: number): number {
  return (Math.floor(x / BUCKET) + 512) * 4096 + (Math.floor(y / BUCKET) + 512)
}

export class World {
  time = 0
  tick = 0
  readonly zones: Zone[] = []
  readonly ents = new Map<number, Ent>()
  /**
   * 公開的版面亂數流：只由地圖種子決定（地圖種子可能公開：主機在大廳指定時 lobbyState 會廣播）。
   * 只能用在「開局後所有人本來就看得到」的版面：雜物箱的位置與朝向（setup.ts placeCrates）。
   * **不得**用在任何秘密（身分、事件、末日、啟用碼、AI 決策…）：那些走 rng 或 Game.secret
   */
  readonly mapRng: Rng
  /**
   * 秘密的遊戲亂數流（事件時間與抽選、末日時間與類型、通訊病毒洗牌、遙控器啟用碼、AI 決策、傷害、掉落…）：
   * 正式對局用 128 bit 密碼學種子，與地圖種子、身分亂數流、實體 id 流完全獨立。盤點表見 game.ts
   */
  readonly rng: Rng
  /**
   * 實體 id 用的獨立秘密亂數流：id 會送給每位 client，所以不能和任何其他流有關（推回來也得不到別的東西）；
   * 正式對局用 'crypto' 來源（每個 id 直接取密碼學亂數），連「預測下一個 id」都做不到
   */
  private readonly idRng: Rng

  /**
   * mapSeed = 公開的地圖種子；seeds 省略 = 兩條秘密流各自用密碼學亂數（測試由 Game 傳入明確種子，見 game.ts secretSeeds）。
   * world: 'map' 只給舊測試的數字種子用：遊戲流和版面流共用同一個 Rng（改版前的單一序列），正式對局不會這樣
   */
  constructor(mapSeed: number, seeds: { world: RngSeed | 'map'; ids: RngSource } = { world: cryptoSeed(), ids: 'crypto' }) {
    this.mapRng = new Rng(mapSeed)
    this.rng = seeds.world === 'map' ? this.mapRng : new Rng(seeds.world)
    this.idRng = new Rng(seeds.ids)
    this.zones.push(this.newZone('space', 'space', null))
  }

  private newZone(key: string, kind: 'space' | 'interior', station: StationDef | null): Zone {
    const layout = station ? parseLayout(station.layout) : null
    const z: Zone = {
      id: this.zones.length,
      key,
      kind,
      station,
      layout,
      nav: layout ? new NavGrid(layout) : null,
      doors: layout
        ? layout.doors.map((d) => ({
            index: d.index,
            open: false,
            locked: !!d.spec.locked,
            lockUntil: 0,
            broken: false,
            hp: 5000,
            log: [],
            forced: 0,
            cycling: false,
            clearance: d.spec.clearance,
            security: d.spec.security,
          }))
        : [],
      spaceEnt: 0,
      alive: true,
      lethalUntil: 0,
      buckets: new Map(),
      power: 'normal',
      alarmUntil: 0,
      data: {},
    }
    return z
  }

  addInterior(key: string, station: StationDef): Zone {
    const z = this.newZone(key, 'interior', station)
    this.zones.push(z)
    return z
  }

  zoneByKey(key: string): Zone | undefined {
    return this.zones.find((z) => z.key === key)
  }

  newId(): number {
    let id = this.idRng.id31()
    while (this.ents.has(id)) id = this.idRng.id31()
    return id
  }

  spawn(def: UnitDef, zone: number, x: number, y: number, owner: number): Ent {
    const e = makeEnt(this.newId(), def, zone, x, y, owner, this.time)
    this.ents.set(e.id, e)
    this.bucketAdd(e)
    return e
  }

  /** 換 id（呼叫端負責修正其他地方存的舊 id）*/
  rekey(e: Ent, nid: number): void {
    this.ents.delete(e.id)
    e.id = nid
    this.ents.set(nid, e)
  }

  remove(e: Ent): void {
    if (e.removed) return
    e.removed = true
    e.alive = false
    this.bucketDel(e)
    this.ents.delete(e.id)
  }

  get(id: number): Ent | undefined {
    if (!id) return undefined
    const e = this.ents.get(id)
    return e && !e.removed ? e : undefined
  }

  // ───────── 空間雜湊 ─────────

  private bucketAdd(e: Ent): void {
    const z = this.zones[e.zone]
    const k = bkey(e.x, e.y)
    e.data._bk = k
    e.data._bz = e.zone
    let s = z.buckets.get(k)
    if (!s) z.buckets.set(k, (s = new Set()))
    s.add(e)
  }

  private bucketDel(e: Ent): void {
    const z = this.zones[e.data._bz as number]
    z?.buckets.get(e.data._bk as number)?.delete(e)
  }

  /** 位置或 zone 改變後呼叫 */
  moved(e: Ent): void {
    if (e.removed) return
    const k = bkey(e.x, e.y)
    if (k === e.data._bk && e.zone === e.data._bz) return
    this.bucketDel(e)
    this.bucketAdd(e)
  }

  /** 把實體移到另一個 zone 的指定位置 */
  relocate(e: Ent, zone: number, x: number, y: number): void {
    this.bucketDel(e)
    e.zone = zone
    e.x = x
    e.y = y
    e.path = null
    e.vx = 0
    e.vy = 0
    this.bucketAdd(e)
  }

  /** 範圍查詢（同一 zone，圓形）*/
  query(zone: number, x: number, y: number, r: number, out: Ent[] = []): Ent[] {
    const z = this.zones[zone]
    if (!z) return out
    const x0 = Math.floor((x - r) / BUCKET)
    const x1 = Math.floor((x + r) / BUCKET)
    const y0 = Math.floor((y - r) / BUCKET)
    const y1 = Math.floor((y + r) / BUCKET)
    const r2 = r * r
    for (let bx = x0; bx <= x1; bx++) {
      for (let by = y0; by <= y1; by++) {
        const s = z.buckets.get((bx + 512) * 4096 + (by + 512))
        if (!s) continue
        for (const e of s) {
          if (e.removed) continue
          const dx = e.x - x
          const dy = e.y - y
          if (dx * dx + dy * dy <= r2 + e.radius * e.radius + 2 * r * e.radius) out.push(e)
        }
      }
    }
    return out
  }

  inZone(zone: number): Ent[] {
    const out: Ent[] = []
    const z = this.zones[zone]
    if (!z) return out
    for (const s of z.buckets.values()) for (const e of s) if (!e.removed) out.push(e)
    return out
  }
}
