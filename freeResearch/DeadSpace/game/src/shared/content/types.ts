// 資料驅動內容的型別。所有遊戲內容（單位、技能、buff、道具、販賣機、站點、事件）都寫成這些型別的資料，
// 技能以「效果原語」組合（architecture §4.3），特殊技能才用 script。
// 距離一律公尺（原作 100 units = 1 m），時間秒，速度 m/s。

export interface Loc {
  zh: string
  en: string
}

export type Tag =
  | 'organic' // 可被寄生／朊毒感染的血肉人形（未著裝人員）
  | 'mechanical' // 非人形態（異形、變種、機體、裝置）
  | 'personnel' // 人類人員（含著裝）
  | 'suit' // 著裝單位
  | 'xenoForm'
  | 'mutantForm'
  | 'chassis' // 仿生人升級機體
  | 'structure' // 建築（販賣機、控制台、GIT…）
  | 'vendor'
  | 'console'
  | 'ship'
  | 'station'
  | 'space' // 只存在於太空層
  | 'creature'
  | 'summon'
  | 'egg'
  | 'cocoon'
  | 'device' // 玩家放置的裝置（哨戟、感應器、監視器）
  | 'drone'
  | 'npc'
  | 'invuln'
  | 'noTarget' // 不能被選為目標（特效、隱形危害）
  | 'pilotable'
  | 'immuneToxin'
  | 'illusion'
  | 'flying'
  | 'rubble'
  | 'corpse'
  | 'butler'
  | 'animal' // 可吞食的小動物
  | 'boss'
  | 'cage'
  | 'hazard'

export type DamageKind = 'normal' | 'fire' | 'cold' | 'energy' | 'poison' | 'blast' | 'chaos' | 'pierce'

export interface AttackDef {
  dmg: [number, number]
  cd: number
  range: number
  /** melee：近戰；hitscan：瞬間命中；projectile：飛行物；artillery：拋射落點 AoE */
  kind: 'melee' | 'hitscan' | 'projectile' | 'artillery' | 'beam'
  projSpeed?: number
  /** 特效 id（render 端對照）*/
  fx: string
  aoe?: number
  /** 穿透直線上所有目標 */
  pierce?: boolean
  dmgKind?: DamageKind
  onHit?: Effect[]
  /** 只能打建築／太空目標等限制 */
  only?: 'structure' | 'space' | 'nonStructure'
  /** 前搖秒數 */
  windup?: number
}

export interface UnitDef {
  id: string
  name: Loc
  /** render 模型 id */
  model: string
  scale?: number
  hp: number
  hpRegen: number
  mp: number
  mpRegen: number
  armor?: number
  speed: number
  radius: number
  sight: number
  attack?: AttackDef
  abilities: string[]
  tags: Tag[]
  /** 背包格數（預設：人員 6、其他 0）*/
  inv?: number
  /** 存在於哪一層 */
  layer?: 'interior' | 'space'
  /** 吞食可得 EP（變種人）*/
  devourEp?: number
  /** 死亡時的掉落（道具 id 與機率）*/
  drops?: { item: string; p: number }[]
  /** 敵對 AI 類型 */
  ai?: string
  /** 死亡後是否留下屍體 */
  corpse?: boolean
  /** 存活時間（召喚物）*/
  life?: number
  /** 被殺時 EP 獎勵說明以外的特殊旗標 */
  flags?: Record<string, number | string | boolean>
}

export type TargetKind = 'none' | 'unit' | 'point' | 'passive' | 'toggle' | 'unitOrPoint' | 'self'

export interface TargetFilter {
  self?: boolean
  /** 只能對 organic（未著裝人類形態）*/
  organic?: boolean
  /** 排除 organic */
  nonOrganic?: boolean
  structure?: boolean
  noStructure?: boolean
  corpse?: boolean
  rubble?: boolean
  door?: boolean
  /** 只能對玩家的主單位 */
  mainUnit?: boolean
  /** 只能對太空中的船艦 */
  ship?: boolean
  station?: boolean
  /** 只能對異類陣營以外 */
  notFaction?: 'xeno' | 'mutant'
  /** 只能對指定 tag */
  tag?: Tag
  /** 指定 unit def id 清單 */
  defs?: string[]
  /** 可對同陣營 */
  allies?: boolean
  /** 限定同一 zone 以外也可（無限射程）*/
  anyZone?: boolean
}

/** 效果原語 */
export type Effect =
  | { k: 'damage'; amount: number | [number, number]; to: EffectTarget; aoe?: number; falloff?: boolean; kind?: DamageKind; friendly?: boolean; noSelf?: boolean; vsStructure?: number }
  | { k: 'projectile'; speed: number; fx: string; to: 'target' | 'point'; onHit: Effect[]; count?: number; spread?: number; homing?: boolean; pierce?: boolean; range?: number }
  | { k: 'buff'; buff: string; dur?: number; to: EffectTarget; aoe?: number; filter?: TargetFilter; friendly?: boolean; noSelf?: boolean }
  | { k: 'cleanse'; to: EffectTarget; tags?: string[] }
  | { k: 'heal'; amount: number; to: EffectTarget; aoe?: number; pct?: boolean; friendly?: boolean }
  | { k: 'mana'; amount: number; to: EffectTarget; aoe?: number; pct?: boolean }
  | { k: 'summon'; unit: string; count: number; life?: number; at: 'self' | 'point' | 'target'; spread?: number; owner?: 'caster' | 'hostile' }
  | { k: 'dash'; speed: number; maxDist: number; to: 'point' | 'target'; onArrive?: Effect[]; hitAlong?: Effect[] }
  | { k: 'blink'; to: 'point' | 'target'; maxDist?: number; behind?: boolean }
  | { k: 'knockback'; dist: number; aoe: number; from: 'self' | 'point'; friendly?: boolean }
  | { k: 'pull'; dist: number; aoe: number; to: 'self' | 'point' }
  | { k: 'zoneObj'; obj: string; life: number; at: 'self' | 'point' | 'target' }
  | { k: 'delay'; t: number; then: Effect[]; at?: 'point' | 'self' | 'target' }
  | { k: 'fx'; fx: string; at: 'self' | 'point' | 'target' | 'line' }
  | { k: 'rubble'; count: number; radius: number; at: 'self' | 'point' }
  | { k: 'clearRubble'; radius: number; dmg: number; at: 'point' }
  | { k: 'reveal'; radius: number; dur: number; at: 'point' | 'self' | 'target' }
  | { k: 'script'; fn: string; p?: Record<string, number | string | boolean> }

export type EffectTarget = 'target' | 'self' | 'point'

export interface AbilityDef {
  id: string
  name: Loc
  desc: Loc
  icon: string
  /** 預設熱鍵 Q W E R D F（由 slot 順序決定時可省略）*/
  hotkey?: string
  target: TargetKind
  range?: number
  cd: number
  mana: number
  /** 施法時間（期間可被打斷）*/
  cast?: number
  /** 引導時間（期間每 channelTick 秒施放一次 tickEffects）*/
  channel?: number
  channelTick?: number
  tickEffects?: Effect[]
  /** AoE 預覽半徑（UI）*/
  aoe?: number
  filter?: TargetFilter
  /** 共享冷卻群組 */
  sharedCd?: string
  /** 可自動施放 */
  autocast?: boolean
  effects: Effect[]
  /** 被動技能附帶的 buff（永久）*/
  passiveBuff?: string
  /** 在太空中才可用 */
  spaceOnly?: boolean
  /** 不能在太空用 */
  noSpace?: boolean
  /** 施放時解除隱形 */
  breaksStealth?: boolean
  /** 一局一次 */
  once?: boolean
}

export interface BuffDef {
  id: string
  name: Loc
  icon: string
  /** 是否對其他玩家可見（感染類 buff 只給本人與施放者陣營）*/
  vis: 'all' | 'self' | 'casterFaction'
  /** 好的／壞的（UI 顏色）*/
  good: boolean
  dur?: number
  /** 移速倍率（0.8 = −20%）*/
  move?: number
  /** 固定移速加成 m/s */
  moveAdd?: number
  /** 攻速倍率（>1 = 更快）*/
  atkSpeed?: number
  dmgMult?: number
  dmgTaken?: number
  armor?: number
  regen?: number
  mpRegen?: number
  sightMult?: number
  sightAdd?: number
  rangeAdd?: number
  /** 每秒傷害 */
  dot?: number
  dotKind?: DamageKind
  /** 每秒治療 */
  hot?: number
  /** 每秒扣能量 */
  manaBurn?: number
  stun?: boolean
  silence?: boolean
  disarm?: boolean
  invuln?: boolean
  stealth?: boolean
  /** 吸收傷害量 */
  shield?: number
  rooted?: boolean
  /** 閃避機率 */
  evade?: number
  /** 感染標記 */
  infection?: 'parasite' | 'prion' | 'containedParasite' | 'containedPrion'
  /** 免疫感染 */
  immuneInfection?: boolean
  /** 週期效果 */
  every?: number
  tickEffects?: Effect[]
  onExpire?: Effect[]
  /** 可疊加層數 */
  stacks?: number
  /** 被移除條件 */
  breakOnDamage?: boolean
  breakOnAttack?: boolean
  /** 視覺特效 id */
  fx?: string
  /** 自訂旗標 */
  flags?: Record<string, number | string | boolean>
}

export interface ItemDef {
  id: string
  name: Loc
  desc: Loc
  icon: string
  /** 初始充能；0 = 不消耗（無限）*/
  charges: number
  /** 主動使用時施放的技能 */
  use?: string
  /** 攜帶時的被動 buff */
  passive?: string
  /** 防護服：穿上變成的單位 def */
  suit?: string
  /** 每人只能帶一個 */
  unique?: boolean
  /** 無法被複製（時序者回溯）*/
  noClone?: boolean
  /** 使用後充能歸零仍保留（例如偵測器）*/
  keepEmpty?: boolean
  /** 道具分類（UI 篩選、Codex）*/
  cat: 'medical' | 'combat' | 'utility' | 'suit' | 'key' | 'module' | 'quest' | 'fun' | 'detect'
  /** 地面模型 */
  model?: string
  /** 等級 8 物品（時序者回溯會移除）*/
  level?: number
}

export interface VendorStock {
  item: string
  /** 庫存上限 */
  max: number
  /** 補貨秒數（0 = 不補）*/
  restock: number
  /** 開局延遲上架秒數 */
  delay?: number
}

export interface VendorDef {
  id: string
  name: Loc
  model: string
  hp: number
  stock: VendorStock[]
  /** 需要站點電力模式（例：LQ 倉儲只在實驗室模式運作）*/
  needsPower?: string
  invuln?: boolean
}

export interface ClassDef {
  id: string
  name: Loc
  prefix: Loc
  cards: number
  items: string[]
  /** 職業技能 */
  abilities: string[]
  /** 永久被動 buff */
  passives: string[]
  /** 固定出生點（站 id）*/
  spawnAt?: string
  desc: Loc
  bios: { human: Loc; xeno: Loc; mutant: Loc; android: Loc }
}

/** 形態（異形／變種人／仿生人）*/
export interface FormDef {
  id: string
  faction: 'xeno' | 'mutant' | 'android'
  tier: number
  unit: string
  /** spawn 使用的單位 def */
  spawnUnit?: string
  /** 從哪個形態進化而來 */
  from?: string
  /** 進化門檻 EP */
  ep: number
  branch?: string
  desc: Loc
  /** 只在特定條件可選 */
  requires?: string
}

export interface StationSpace {
  hp: number
  hpRegen: number
  radius: number
  /** 太空座標（公尺，原點 = 太空層中心）*/
  pos: [number, number]
  speed: number
  attack?: AttackDef
  abilities: string[]
  /** 可駕駛 */
  pilotable: boolean
  model: string
  /** 公轉 */
  orbit?: { around: 'center' | string; radius: number; degPerSec: number }
}
