// 模擬實體：單位、建築、地上道具、屍體、太空站與船艦都是 Ent。
import type { Tag, UnitDef } from '../shared/content/types'
import type { Pt } from './nav/grid'

export const NEUTRAL = -1
/** 敵對生物（攻擊所有人）*/
export const HOSTILE = -2

export type OrderKind = 'move' | 'amove' | 'attack' | 'hold' | 'cast' | 'follow' | 'pickup' | 'interact' | 'give' | 'patrol'

export interface Order {
  k: OrderKind
  x?: number
  y?: number
  e?: number
  /** cast：技能 id；give/pickup：道具欄位 */
  a?: string
  s?: number
  /** 道具施放的來源格 */
  itemSlot?: number
}

export interface ItemInst {
  id: string
  charges: number
  /** 道具私有資料（GIT 樣本、遙控器碼…）*/
  data?: Record<string, unknown>
  /** 冷卻結束時間 */
  cdUntil: number
  uid: number
}

export interface BuffInst {
  id: string
  until: number
  /** 施放者 ent id 與槽位（感染判定用）*/
  src: number
  srcSlot: number
  stacks: number
  nextTick: number
  /** 剩餘吸收量 */
  shield?: number
  data?: Record<string, unknown>
}

export interface CastState {
  ability: string
  /** 開始時間 */
  start: number
  /** 施法完成時間 */
  end: number
  x: number
  y: number
  e: number
  itemSlot: number
  channeling: boolean
  nextTick: number
  /** 施法起點（移動即中斷用）*/
  ox: number
  oy: number
}

export interface Stats {
  speed: number
  sight: number
  range: number
  dmgMult: number
  atkSpeed: number
  armor: number
  regen: number
  mpRegen: number
  dmgTaken: number
  evade: number
  stunned: boolean
  silenced: boolean
  disarmed: boolean
  invuln: boolean
  stealth: boolean
  rooted: boolean
  immuneInfection: boolean
}

export interface Ent {
  id: number
  def: UnitDef
  tags: ReadonlySet<Tag>
  zone: number
  x: number
  y: number
  facing: number
  /** 外力速度（擊退、太空慣性）*/
  vx: number
  vy: number
  radius: number
  hp: number
  maxHp: number
  mp: number
  maxMp: number
  owner: number
  /** 快照中隱藏擁有者（異形形態、蛋、繭）*/
  anon: boolean
  /** 玩家主單位 */
  isMain: boolean
  name: string
  color: number
  classId: string
  alive: boolean
  removed: boolean
  bornAt: number
  order: Order | null
  queue: Order[]
  path: Pt[] | null
  pathIdx: number
  pathGoalX: number
  pathGoalY: number
  repathAt: number
  stuckT: number
  atkReady: number
  /** 攻擊前搖中：命中時間 */
  windupUntil: number
  windupTarget: number
  /** 動作狀態（給 render）：0 idle 1 move 2 attack 3 cast 4 dead 5 channel */
  anim: number
  animTarget: number
  cast: CastState | null
  cds: Map<string, number>
  autocast: Set<string>
  buffs: BuffInst[]
  inv: (ItemInst | null)[] | null
  /** 已穿上的防護服道具 */
  suit: ItemInst | null
  abilities: string[]
  stats: Stats
  statsDirty: boolean
  lifeEnd: number
  /** 召喚者 ent id */
  master: number
  /** 駕駛中的載具 ent id */
  piloting: number
  /** 載具目前的駕駛 ent id */
  pilot: number
  lastHitBy: number
  lastHitSlot: number
  lastHitTime: number
  lastDamageTime: number
  /** 種類專屬資料 */
  data: Record<string, any>
  /** 被幻象／分身旗標 */
  illusion: boolean
  /** 自動索敵 */
  acquire: boolean
  /** 公開可見（例如太空層物件對所有人可見）*/
  global: boolean
  /** 擋住別人的移動（建築）*/
  solidBody: boolean
  /** render 可見的額外資料（每 tick 比對差異）*/
  x2: Record<string, number | string | boolean> | null
}

export function baseStats(def: UnitDef): Stats {
  return {
    speed: def.speed,
    sight: def.sight,
    range: def.attack?.range ?? 0,
    dmgMult: 1,
    atkSpeed: 1,
    armor: def.armor ?? 0,
    regen: def.hpRegen,
    mpRegen: def.mpRegen,
    dmgTaken: 1,
    evade: 0,
    stunned: false,
    silenced: false,
    disarmed: false,
    invuln: def.tags.includes('invuln'),
    stealth: false,
    rooted: false,
    immuneInfection: false,
  }
}

export function makeEnt(id: number, def: UnitDef, zone: number, x: number, y: number, owner: number, now: number): Ent {
  const tags = new Set(def.tags)
  const invSize = def.inv ?? (tags.has('personnel') ? 6 : 0)
  return {
    id,
    def,
    tags,
    zone,
    x,
    y,
    facing: -Math.PI / 2,
    vx: 0,
    vy: 0,
    radius: def.radius,
    hp: def.hp,
    maxHp: def.hp,
    mp: def.mp,
    maxMp: def.mp,
    owner,
    anon: false,
    isMain: false,
    name: '',
    color: -1,
    classId: '',
    alive: true,
    removed: false,
    bornAt: now,
    order: null,
    queue: [],
    path: null,
    pathIdx: 0,
    pathGoalX: 0,
    pathGoalY: 0,
    repathAt: 0,
    stuckT: 0,
    atkReady: 0,
    windupUntil: 0,
    windupTarget: 0,
    anim: 0,
    animTarget: 0,
    cast: null,
    cds: new Map(),
    autocast: new Set(),
    buffs: [],
    inv: invSize > 0 ? new Array(invSize).fill(null) : null,
    suit: null,
    abilities: [...def.abilities],
    stats: baseStats(def),
    statsDirty: true,
    lifeEnd: def.life ? now + def.life : 0,
    master: 0,
    piloting: 0,
    pilot: 0,
    lastHitBy: 0,
    lastHitSlot: -1,
    lastHitTime: -1e9,
    lastDamageTime: -1e9,
    data: {},
    illusion: false,
    acquire: !tags.has('structure') && !tags.has('personnel'),
    global: false,
    solidBody: tags.has('structure'),
    x2: null,
  }
}

export function dist2(a: { x: number; y: number }, b: { x: number; y: number }): number {
  const dx = a.x - b.x
  const dy = a.y - b.y
  return dx * dx + dy * dy
}

export function dist(a: { x: number; y: number }, b: { x: number; y: number }): number {
  return Math.sqrt(dist2(a, b))
}
