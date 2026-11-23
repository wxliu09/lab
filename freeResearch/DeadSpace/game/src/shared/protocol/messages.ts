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
  /**
   * 練習 AI 的難度：'normal' = 原本的行為；'easy' = AI 船員驗血較慢（抽血之間停比較久、只抽身邊的人、不複驗）、
   * 不公開指認、看到可疑的玩家形態不主動開火（被打才還手）；AI 異類偽裝更久才動手、出手比較保守（讓練習當異形不會太難）
   */
  aiLevel: AiLevel
  /**
   * 原作沒有的額外事件（天守收容失效、通訊病毒、蛞蝓大量出現等本作新增或把原作死碼做成的事件）。
   * false = 只出原作有的事件（給想玩原汁原味的老玩家）
   */
  extraEvents: boolean
  /**
   * 死者看見真實身分（第 8 輪，本作選項，預設關）：死者與旁觀者的名牌依真實陣營上色、匿名形態標出主人。
   * 只影響已經出局的人；活人的快照不變（洩漏測試把關）
   */
  ghostSight: boolean
}

export type AiLevel = 'easy' | 'normal'
export const AI_LEVELS: readonly AiLevel[] = ['easy', 'normal']

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
  aiLevel: 'normal',
  extraEvents: true,
  ghostSight: false,
}

/** 單機練習的房號（正式房號字母表沒有 O 和 0，不會撞號）*/
export const PRACTICE_ROOM = 'SOLO0'

/** 單機練習可指定的身分；只在練習房生效，多人房間一律忽略 */
export type PracticeRole = 'random' | 'human' | 'xeno' | 'mutant' | 'android'
export const PRACTICE_ROLES: readonly PracticeRole[] = ['random', 'human', 'xeno', 'mutant', 'android']

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
  | 'spec'
  | 'enhance'
  | 'feedReplay'
  /** 站內設施操作（動力分配台、模組工廠、隔間門、籠子）：e = 設施實體、a = 動作、s = 選項 */
  | 'facility'
  /** 離開控制台：交還站點／船艇／防禦無人機的駕駛權，回到操控自己的角色 */
  | 'unpilot'

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
  /** role：單機練習指定自己的身分（server 只在練習房接受）*/
  | { t: 'start'; role?: PracticeRole }
  | { t: 'kick'; slot: Slot }
  | { t: 'cmd'; seq: number; c: Command }
  | { t: 'chat'; ch: ChatChannel; text: string; to?: string }
  | { t: 'ping'; n: number }
  /** 開局後 client 建好場景、畫出第一個畫面：主機等所有人載入完（或逾時）才開始推進模擬 */
  | { t: 'loaded' }
  | { t: 'vote'; v: string; arg?: number }
  | { t: 'note'; target: Slot; mark: NoteMark; text?: string }
  | { t: 'shareNotes'; to: Slot }
  | { t: 'Tune'; id: number; op: string; args: unknown[] }
  /**
   * 單機練習暫停：client 打開遊戲選單（Esc）、說明（G）、圖鑑（F1）時送 on: true，全部關掉送 on: false。
   * 主機只在練習局（Game.practice）、而且連線中的真人只有 1 名時接受；暫停中 sim 不前進（快照照送，world.pz = true），
   * 真人離線或暫停滿 10 分鐘自動繼續。多人局一律忽略
   */
  | { t: 'pause'; on: boolean }
  /** 小地圖信號（原作全員結盟，Alt＋點小地圖大家都看得到）：z 是 zone id，x／y 是該 zone 的座標 */
  | { t: 'mapPing'; z: number; x: number; y: number }
  /**
   * 主機中止對局（主機在對局中離開房間、關閉分頁）：主機的本機 client 在終止 worker 之前送出。
   * server 只接受本機 peer（LOCAL_PEER）送的，其他 peer 一律忽略；對局中收到就立刻結算（EndResult.winner = 'aborted'、
   * abortWhy = 'host'），公開所有身分、送給所有在線的人。大廳、已結算時忽略。
   * 處理完 worker 會再回一則 { t: 'aborted' } 給主執行緒（在結算訊息的 out 批次之後），client 收到再關連線
   */
  | { t: 'abort' }
  /**
   * 結算後回到大廳（第 6 輪：多人「再來一局」）：主機在結算畫面按「回到大廳」時由主機的本機 client 送出。
   * server 只接受本機 peer（LOCAL_PEER）送的，而且只在多人房（不是練習房）、對局已經正常結算（不是主機中止 winner = 'aborted'）時接受，
   * 其他情況一律忽略。處理見 server.ts returnToLobby：同一房號、保留大廳設定與座位，丟掉上一局的模擬，
   * 再送 HostMsg backToLobby ＋ lobbyState 給每位在線的人
   */
  | { t: 'backToLobby' }

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
  /** 監視器回放（只給擁有者）：每格 [顯示 def, x×10, y×10, 顏色, 名字, 動作] */
  | { t: 'replay'; cam: number; zone: number; x: number; y: number; r: number; frames: { t: number; u: [string, number, number, number, string, number][] }[] }
  /** 對局中出現新的地點（事件站）*/
  | { t: 'zones'; zones: [number, string, string][] }
  /** 小地圖信號：活人的只給活人、死者的只給死者；name／color 是發送者目前的顯示名字與顏色 */
  | { t: 'mapPing'; z: number; x: number; y: number; name: string; color: number }
  /**
   * 主機帶大家回到大廳（ClientMsg backToLobby，server.ts returnToLobby）：上一局的模擬已經丟掉，這則之後不會再有上一局的任何訊息
   * （快照、聊天、結算…）。client 清掉對局狀態（世界、開局資料、結算、聊天）回到大廳畫面；緊接著會收到 lobbyState。
   * 回到大廳之後才重新連上的人也會在 welcome 之後收到一次（他可能還停在上一局的畫面）；client 已經在大廳就不做事。
   * 不帶任何欄位：大廳名單只在 lobbyState 裡，這則本身不含任何對局資訊
   */
  | { t: 'backToLobby' }

export interface StartInfo {
  slot: Slot
  seed: number
  /** 啟用的站點 id */
  stations: string[]
  /** zone 列表：[zone id, key, 站點 id] */
  zones: [number, string, string][]
  players: { slot: Slot; name: string; color: number; bot: boolean }[]
  spectator: boolean
  /** 這一局的識別碼（隨機、與任何秘密無關）：重連時收到同一局的 start 就保留聊天紀錄 */
  gid?: number
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
  /** 基因檢測器／GIT 解析器：已抽血的人（抽血者當時看到的名字，只給持有者）*/
  samples?: string[]
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
  /** 政委晉升成特務（events.ts promotion；classId 仍是 commissar）：顯示自己的職業時寫「特務」。晉升是全場公告過的事 */
  promoted?: boolean
  /** 研究員的博士專長 id（content/classes.ts PHDS；只給本人，其他職業沒有這個欄位）*/
  phd?: string
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
  /** 死亡即退出模式下已出局（不能觀戰、不能用死者頻道）*/
  booted?: boolean
  /** 仿生人機體損毀、等記憶核心復活：只能透過核心觀看，聽不到死者頻道 */
  coreWait?: boolean
  /** 剛死、還在遺言時間內：活人還聽得到的剩餘秒數（無條件進位；0 = 不在遺言時間）*/
  lastWords?: number
  /** 所在的船正在發射倒數（剩餘秒數；0 = 沒有）*/
  launchIn?: number
  muted: boolean
  groups: string[]
  /** 可以互動的設施提示 */
  hint: string
  /** 旁觀模式：可看的 zone */
  specZone: number
  /** 自己的監視器：[實體 id, zone, x×10, y×10] */
  feeds: [number, number, number, number][]
  /** 身旁那扇門的門禁紀錄（最近 5 次通過的剪影）*/
  doorLog: { door: number; zone: number; log: { t: number; sil: string }[] } | null
  /** 站在政府強化劑旁、可以五選一 */
  enh: boolean
  /** 站在可操作的設施旁：操作面板（M7）*/
  fac: FacilityView | null
}

/** 設施操作面板（只給站在旁邊的本人）*/
export type FacilityView =
  /** 女帝號動力分配台：mode = content/facilities.ts POWER_MODES 的索引；cd = 各模式剩餘冷卻秒數；off = 停機秒數 */
  | { k: 'power'; e: number; mode: number; cd: number[]; off: number }
  /** 餘燼衛星模組工廠：cur = 生產中的模組（'' = 閒置）、left = 剩餘秒數 */
  | { k: 'factory'; e: number; cur: string; left: number; off: number }
  /** 活體庫號隔間門：open[i] = 第 i+1 間隔間的門是否開著 */
  | { k: 'cells'; e: number; open: boolean[]; off: number }
  /**
   * 活體庫號籠子：busy = 製籠剩餘秒數、pad = 平台上的標本數；
   * cells = 隔間數（「從第 N 間取標本」按鈕：指令 { k: 'facility', e, a: 'cageCell', s: N-1 }）、
   * cage = 平台上還裝得下的籠子已裝幾隻（-1 = 沒有，要先製籠）、cap = 一個籠子的容量
   */
  | { k: 'cage'; e: number; busy: number; off: number; cells: number; cage: number; cap: number }

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
  /** 存活人數／參戰總數（不分身分）*/
  al: [number, number]
  /** 存活的站點 id */
  st: string[]
  /** 供電不正常（緊急照明）的地點 zone key：現場資訊，只送給人在那一站的人（死者、旁觀者看全場），client 據此切換紅色緊急照明 */
  pw: string[]
  /** 開局等玩家載入：還在等幾個人（0 = 不在等）*/
  ld: number
  /** 主機分頁在背景 */
  bg: boolean
  /** 暫停中 */
  pz: boolean
  /** 末日類型（觸發後才公開）*/
  apo: string
  /** 進行中的投票 */
  vote: { kind: 'death'; until: number; boot: number; spec: number } | null
  /** 死亡模式 */
  boot: boolean
  /**
   * 局中改變的天氣：zone key → 天氣（目前只有餘燼衛星大氣護盾失效後的 'blizzard'）。
   * 開局天氣在 StationDef.weather；這裡只放之後的變化。公開現象（全星區都收到公告），不分觀看者
   */
  wx: Record<string, string>
  /**
   * 基因檢測器開放（醫療補給、GIT 檢測儀第一次上架）的開局秒數：原作 420；練習簡單難度 240。
   * 是這一局的固定設定（依難度），補給事件提早補貨不會改變這個值
   */
  gitAt: number
  /**
   * 進行中的重大事件（目標面板顯示對策用）。只放已經全場公告、所有人都知道的事件：
   * 'drones' 無人機群、'asteroids' 小行星雨、'tenshu' 天守反物質收容失效倒數、'pirate' 敵對海盜船、'doom' 末日。
   * 順序固定如上（client 自己排顯示優先順序）
   */
  ev: string[]
  /**
   * 翠原星地表目前的殘留輻射（每秒傷害，取地表最高值；0 或沒有 = 沒有）。公開現象：地表的人、全星區都看得到警報
   */
  rad?: number
  /** 艦隊正在砲擊翠原星（艦隊末日；全場公告過的事）*/
  fleetPlanet?: boolean
  /** 軌道失效末日：翠原星還要幾秒進入恆星灼燒範圍（沒有就不送）*/
  burnIn?: number
  /** 正被無人機群圍攻的站：[站 id, 剩餘生命比例 0..1]（全場公告過的事件）*/
  siege?: [string, number][]
}

export interface EndResult {
  winner: 'crew' | 'xeno' | 'mutant' | 'draw' | 'aborted'
  /** 平手的原因（只有 winner = 'draw' 時才有）：wipe = 各方同歸於盡（沒有人活著）、doom = 末日倒數結束仍未分勝負、other = 其他（除錯指令等）*/
  drawWhy?: 'wipe' | 'doom' | 'other'
  /** 中止的原因（只有 winner = 'aborted' 時才有）：host = 主機在對局中離開或關閉分頁（ClientMsg abort）*/
  abortWhy?: 'host'
  players: {
    slot: Slot
    name: string
    color: number
    role: string
    classId: string
    /** 政委晉升成特務（職業 classId 不變、頭銜改成特務）：顯示職業時要寫「特務」*/
    promoted?: boolean
    spawn: boolean
    alive: boolean
    /** 只主持不參戰的主機（大廳設定 hostSpectate）：不是參戰者，結算畫面不列成玩家卡（role 仍是預設的 human、alive = false）*/
    spectator?: boolean
    kills: number
    infections: number
    tests: number
  }[]
  timeline: { t: number; text: string }[]
  duration: number
}
