// 網路訊息型別。C = client（含主機自己的本機 client），H = 主機的 Sim Worker。
// 所有 C→H 訊息都必須通過 validate.ts 的白名單檢查才會進入模擬。

export type Slot = number

// ───────── 大廳 ─────────

export interface LobbySettings {
  /** 'auto' = 依人數（GDD §4.1）；數字 = 強制數量 */
  aliens: 'auto' | 0 | 1
  mutants: 'auto' | 0 | 1
  androids: 'auto' | 0 | 1
  /** NPC 船員數量；-1 = 依人數自動 */
  npcCrew: number
  /** 填補的 AI bots 數量 */
  bots: number
  /** 'auto' = 依人數啟用地點；否則列出要啟用的站 id */
  stations: 'auto' | string[]
  /** 末日時間（分鐘）[min, max] */
  apocalypse: [number, number]
  /** 全體聊天只限同站 */
  localChat: boolean
  /** 死亡即退出 */
  bootOnDeath: boolean
  epMult: number
  eventMult: number
  /** 主機只主持不參戰 */
  hostSpectate: boolean
  seed: number
}

export const DEFAULT_SETTINGS: LobbySettings = {
  aliens: 'auto',
  mutants: 'auto',
  androids: 'auto',
  npcCrew: -1,
  bots: 0,
  stations: 'auto',
  apocalypse: [30, 40],
  localChat: false,
  bootOnDeath: false,
  epMult: 1,
  eventMult: 1,
  hostSpectate: false,
  seed: 0,
}

export interface LobbyPlayerInfo {
  slot: Slot
  name: string
  color: number
  ready: boolean
  connected: boolean
  host: boolean
  bot: boolean
}

// ───────── 指令（RTS 命令式）─────────

export type CommandKind =
  | 'move'
  | 'amove'
  | 'attack'
  | 'stop'
  | 'hold'
  | 'cast'
  | 'use'
  | 'drop'
  | 'pickup'
  | 'swapItem'
  | 'give'
  | 'interact'
  | 'buy'
  | 'evolve'
  | 'autocast'
  | 'follow'

export interface Command {
  k: CommandKind
  /** 目標點（公尺）*/
  x?: number
  y?: number
  /** 目標實體 id */
  e?: number
  /** 技能 id / 道具欄位 / 形態 id / 商品 id */
  a?: string
  s?: number
  /** shift 佇列 */
  q?: boolean
}

// ───────── C → H ─────────

export type ClientMsg =
  | { t: 'hello'; name: string; color: number; ver: number; token: string }
  | { t: 'lobby'; name?: string; color?: number; ready?: boolean }
  | { t: 'settings'; s: Partial<LobbySettings> }
  | { t: 'start' }
  | { t: 'kick'; slot: Slot }
  | { t: 'cmd'; seq: number; c: Command }
  | { t: 'chat'; ch: ChatChannel; text: string; to?: string }
  | { t: 'ping'; n: number }
  | { t: 'vote'; v: string; arg?: number }
  | { t: 'note'; target: Slot; mark: NoteMark; text?: string }
  | { t: 'shareNotes'; to: Slot }
  | { t: 'Tune'; id: number; op: string; args: unknown[] }

export type ChatChannel = 'all' | 'team' | 'group' | 'dead'
export type NoteMark = 'none' | 'trust' | 'suspect' | 'confirmedEvil' | 'confirmedClean'

// ───────── H → C ─────────

export interface ChatLine {
  /** 發言者顯示名（已依身分處理，例如死者或被 Mute-ilate 者）*/
  from: string
  color: number
  ch: ChatChannel | 'sys' | 'private'
  text: string
  /** 只給 bubble 定位用的實體 id（遺言、記憶核心浮字）*/
  e?: number
  time: number
  group?: string
}

export type HostMsg =
  | { t: 'host'; ver: number }
  | { t: 'welcome'; slot: Slot; token: string }
  | { t: 'reject'; reason: 'version' | 'full' | 'started' | 'kicked' | 'invalid' }
  | { t: 'lobbyState'; players: LobbyPlayerInfo[]; settings: LobbySettings; code: string }
  | { t: 'start'; info: StartInfo }
  | { t: 'snap'; s: Snapshot }
  | { t: 'chat'; lines: ChatLine[] }
  | { t: 'pong'; n: number; tick: number }
  | { t: 'end'; result: EndResult }
  | { t: 'notice'; key: string; args?: Record<string, string | number> }
  | { t: 'TuneResult'; id: number; ok: boolean; msg: string; data?: unknown }

export interface StartInfo {
  slot: Slot
  seed: number
  /** 啟用的站點 id */
  stations: string[]
  /** zone 列表：[zone id, key, 站點 id] */
  zones: [number, string, string][]
  players: { slot: Slot; name: string; color: number; bot: boolean }[]
  spectator: boolean
}

// ───────── 快照 ─────────

/** 一個可見實體（第一次出現時帶完整欄位，之後只帶有變動的欄位）*/
export interface SnapEntity {
  i: number
  /** 單位定義 id */
  d?: string
  z?: number
  x?: number
  y?: number
  /** 朝向（弧度 ×100 取整）*/
  f?: number
  hp?: number
  mhp?: number
  mp?: number
  mmp?: number
  /** 可公開的擁有者槽位（-1 = 未知或中立）*/
  o?: number
  /** 顯示名稱 */
  n?: string
  /** 玩家色（-1 = 無）*/
  c?: number
  /** 職業 id（未著裝人員外觀用）*/
  cl?: string
  /** 動作狀態：0 idle 1 move 2 attack 3 cast 4 dead 5 channel */
  st?: number
  /** 可見的 buff id */
  b?: string[]
  /** 額外狀態旗標（bitmask，見 EntFlag）*/
  fl?: number
  /** 實體種類專屬資料（門的開關、販賣機庫存、繭倒數…）*/
  x2?: Record<string, number | string | boolean>
  /** 動作目標點或目標實體（攻擊動畫、施法方向）*/
  tg?: number
}

export const EntFlag = {
  Invuln: 1,
  Stealth: 2,
  Stunned: 4,
  Selectable: 8,
  Mine: 16,
  Ally: 32,
  Hostile: 64,
  Corpse: 128,
  Hover: 256,
  Interactable: 512,
  Hallucination: 1024,
  Shielded: 2048,
  Petrified: 4096,
} as const

export interface Snapshot {
  tick: number
  time: number
  /** 新增或變動的實體 */
  e: SnapEntity[]
  /** 離開視野或消失的實體 id */
  g: number[]
  /** 一次性特效／音效（只含看得到的）*/
  fx?: FxEvent[]
  /** 本機玩家的私有狀態（只有變動的欄位）*/
  me?: Partial<PrivateState>
  /** 視野來源（client 依此算迷霧）*/
  vs?: [number, number, number, number][]
  /** 門狀態（可見的門：id → 0 關 1 開 2 鎖）*/
  doors?: Record<number, number>
  /** 全域狀態（時間、穩定度、站點存活）*/
  w?: Partial<WorldPublic>
}

export interface FxEvent {
  k: string
  z: number
  x: number
  y: number
  x2?: number
  y2?: number
  e?: number
  e2?: number
  v?: number
  s?: string
}

export interface InvSlot {
  item: string
  charges: number
  cd: number
}

export interface AbilityState {
  id: string
  cd: number
  maxCd: number
  mana: number
  auto?: boolean
  disabled?: boolean
  charges?: number
}

export interface PrivateState {
  slot: Slot
  alive: boolean
  dead: boolean
  /** 自己的真實身分（只給本人）*/
  role: 'human' | 'xeno' | 'mutant' | 'android' | 'spectator'
  faction: 'crew' | 'xeno' | 'mutant' | 'none'
  spawn: boolean
  classId: string
  ep: number
  epNext: number
  tier: number
  canEvolve: string[]
  evolving: number
  /** 主單位 id */
  unit: number
  /** 目前操控的單位（主單位或駕駛中的載具）*/
  control: number
  zone: number
  inv: (InvSlot | null)[]
  abilities: AbilityState[]
  /** 同陣營（異類）成員槽位 */
  mates: Slot[]
  master: Slot
  /** GIT 等私有紀錄 */
  notes: NoteEntry[]
  /** 角色揭露用的背景故事 key */
  bio: string
  gitReports: GitReport[]
  /** 進行中的施法進度 [abilityId, 0..1] */
  cast: [string, number] | null
  muted: boolean
  groups: string[]
  /** 可以互動的設施提示 */
  hint: string
  /** 旁觀模式：可看的 zone */
  specZone: number
  /** 監視器畫面等額外視角 */
  feeds: number[]
}

export interface NoteEntry {
  slot: Slot
  mark: NoteMark
  text: string
  from?: Slot
}

export interface GitReport {
  time: number
  names: string[]
  result: 'clean' | 'infected' | 'error' | 'offline'
}

export interface WorldPublic {
  /** 遊戲經過秒數 */
  t: number
  /** 星區穩定度 0..1 */
  stab: number
  /** 存活的站點 id */
  st: string[]
  /** 主機分頁在背景 */
  bg: boolean
  /** 暫停中 */
  pz: boolean
  /** 末日類型（觸發後才公開）*/
  apo: string
}

export interface EndResult {
  winner: 'crew' | 'xeno' | 'mutant' | 'draw' | 'aborted'
  players: {
    slot: Slot
    name: string
    color: number
    role: string
    classId: string
    spawn: boolean
    alive: boolean
    kills: number
    infections: number
    tests: number
  }[]
  timeline: { t: number; text: string }[]
  duration: number
}
