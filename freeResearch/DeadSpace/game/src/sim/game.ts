// 一局遊戲：玩家、世界、系統排程、快照與聊天。由 GameServer 建立，跑在 Sim Worker。
import type {
  ChatChannel,
  ChatLine,
  Command,
  EndResult,
  FxEvent,
  GitReport,
  HostMsg,
  LobbySettings,
  NoteEntry,
  NoteMark,
  ProphecyWin,
  StartInfo,
} from '../shared/protocol/messages'
import { RECONNECT_GRACE_S, TICK_DT } from '../shared/constants'
import { World } from './world'
import { Rng, cryptoId31, cryptoSeed, type RngSeed, type RngSource } from '../shared/rng'
import type { Ent } from './ent'
import { setupWorld } from './setup'
import { assignRoles } from './systems/roles'
import { handleCommand } from './systems/orders'
import { stepMovement, stepDoors } from './systems/movement'
import { computeVision } from './systems/vision'
import { buildSnapshot, type ViewState, newViewState } from './systems/snapshot'
import { prophecyResults, prophesy, specSnap, stepSpectate } from './systems/spectate'
import { bootIfOut, hearsDead, inLastWords, routeChat, routeMapPing } from './systems/chat'
import { clearDeparture, earlySeat, noteDeparture, replaceSeat } from './systems/replace'
import { Tuning } from './systems/tuning'
import { stepCombat } from './systems/combat'
import { stepBuffs } from './systems/buffs'
import { stepCasting, stepAutocast } from './systems/abilities'
import { stepProjectiles, type Projectile } from './systems/projectiles'
import { stepDashes, SCRIPTS } from './systems/effects'
import { stepItemOrders } from './systems/items'
import { stepVendors } from './systems/vendors'
import { DEATH_HOOKS, damage } from './systems/damage'
import { stepLife } from './systems/death'
import type { AbilityDef } from '../shared/content/types'
import type { ItemInst } from './ent'
import { NEUTRAL } from './ent'
import { unitDef } from '../shared/content/registry'
import './scripts/index'
import { installRoles } from './systems/roleSystem'
import { installSpace, setupShips } from './systems/space'
import { placePoi } from './setup'
import { installCreatureAi } from './ai/creatures'
import { installXenoSystems } from './scripts/xeno'
import { itemRuntime } from './scripts/items'
import { installEvents, publicDoom, publicEvents, type EventState } from './systems/events'
import { installStations } from './systems/stations'
import { installFacilities } from './systems/facilities'
import { installRegen } from './systems/regen'
import { samplerOpenAt } from './systems/vendors'
import { installBots } from './ai/bots'
import { installRemote } from './scripts/remote'
import { installFeeds } from './systems/feeds'
import { installMutantSystems } from './scripts/mutant'
import type { Zone } from './world'
import type { PoiInstance } from '../shared/layout'

export type Role = 'human' | 'xeno' | 'mutant' | 'android'

/** 分享調查筆記的通知：同一對玩家（分享者 → 收件者）這麼多秒（遊戲時間）內最多私訊一次 */
export const SHARE_NOTIFY_S = 15
export type Faction = 'crew' | 'xeno' | 'mutant'

export interface GameInit {
  /** 公開的地圖種子：只驅動版面亂數流 World.mapRng（雜物箱位置與朝向），推不出任何秘密 */
  seed: number
  /**
   * 秘密亂數流的明確種子：只給單元測試、除錯重現用（GameServer 建構時給了 secret 才會帶）。
   * 省略 = 正式對局（worker 一律省略）：三條秘密流各自用密碼學亂數（身分流、遊戲流 128 bit 種子，id 流直接取密碼學亂數），
   * 與 seed、彼此都無關。見 secretSeeds()
   */
  secret?: number | SecretSeeds
  settings: LobbySettings
  players: { slot: number; name: string; color: number; bot: boolean; connected: boolean; spectator: boolean }[]
  send: (slot: number, msg: HostMsg) => void
  /** 單機練習：指定某位玩家的身分（server 只在練習房、只有主機一位真人時才會給）*/
  forceRole?: { slot: number; role: Role }
  /** 單機練習局（練習房、除了主機都是 AI）：練習專屬規則用（事件權重等）；正式局一律 false */
  practice?: boolean
}

/** 每位玩家各自的資訊放寬旗標（除錯工具用；只影響本人的快照與聊天）*/
export interface ViewFlags {
  /** 看得到整個所在 zone */
  wide: boolean
  /** 收得到所有頻道 */
  listen: boolean
  /** 看得穿匿名單位的擁有者 */
  reveal: boolean
}

export interface GamePlayer {
  slot: number
  name: string
  baseName: string
  color: number
  bot: boolean
  connected: boolean
  left: boolean
  spectator: boolean
  role: Role
  /** 被轉化成 spawn：跟隨的陣營 */
  spawnOf: 'xeno' | 'mutant' | null
  /** 仿生人被遙控器轉陣營 */
  android: boolean
  classId: string
  phd: string
  main: number
  control: number
  alive: boolean
  deadAt: number
  /** 永久死亡（不可再被復活）*/
  stayDead: boolean
  ep: number
  tier: number
  form: string
  evolvingUntil: number
  mutedUntil: number
  muteName: boolean
  notes: Map<number, NoteEntry>
  gitReports: GitReport[]
  view: ViewState
  flags: ViewFlags
  stats: { kills: number; infections: number; tests: number }
  chatOut: ChatLine[]
  fxOut: FxEvent[]
  bio: string
  hint: string
  specZone: number
  feeds: [number, number, number, number][]
  /** 本局身分揭露是否已送出 */
  started: boolean
  /** 各系統的私有資料 */
  data: Record<string, any>
}

/**
 * 三條秘密亂數流的種子（測試可以整組指定，例如只固定身分流、讓 id 流用密碼學亂數）。
 *
 * ───── sim 亂數流盤點（第 5 輪審查 P0）─────
 * 規則：秘密流（任何玩家不該預知的東西）的種子一律是 128 bit 密碼學亂數，而且每條流的種子各自獨立抽，
 * 不由地圖種子、也不由彼此推出；公開流只能用在本來就公開的東西。
 *
 * | 亂數流                    | 公開／秘密 | 正式對局的種子                                   | 用途 |
 * |---------------------------|-----------|--------------------------------------------------|------|
 * | GameServer.rng（server.ts）| 公開      | worker init 的 seed（主機分頁 crypto 31 bit）     | 只用來產生每局的地圖種子（大廳 settings.seed 為 0 時）|
 * | World.mapRng（world.ts）   | 公開      | 地圖種子 GameInit.seed（可能公開：主機在大廳指定時 lobbyState 會廣播）| setup.ts placeCrates：雜物箱位置與朝向（開局與事件站出現時；進視野就看得到，翻出什麼由 World.rng 擲）。只放「本來就公開」的版面 |
 * | Game.secret（本檔）        | 秘密      | cryptoSeed() 128 bit                              | roles.ts：身分（含 ≤4 人時異形／變種人二選一）、職業牌、研究員博士專長、出生點；replace.ts：開局補位人選；events.ts：UO（未知星體）站的啟用碼；本檔 stability()：星區穩定度的隨機偏移 |
 * | World.rng（world.ts）      | 秘密      | cryptoSeed() 128 bit                              | 其餘所有遊戲亂數：setup.ts 開局的 qr（火口號是否出現：放公開流的話「qr==1 卻沒有火口號」會洩漏沒有工程師）；events.ts 事件間隔與抽選、末日時間 apocAt 與類型、通訊病毒換名換色洗牌、寄生宿主、新聞、事件站與小行星位置；facilities.ts 遙控器（overrideRemote）啟用碼；ai/bots.ts、ai/creatures.ts 的 AI 決策；combat／damage 傷害與閃避；death.ts 掉落；scripts/* 翻箱、技能散佈；space.ts 停機坪與起飛方向；roleSystem.ts 職業配備；tuning.ts（除錯）|
 * | World.idRng（world.ts）    | 秘密（輸出公開）| 'crypto' 來源：每個 id 直接取 crypto.getRandomValues（沒有種子、沒有可回推的狀態）| 實體 id（每位 client 的快照都帶，含 reassignId 換 id）：輸出全公開，所以和其他流完全無關；不用 sfc32 是因為 id 幾乎把整個輸出公開，sfc32 的狀態理論上回推得出來、預測得到下一個 id |
 * | Game.gid（本檔）           | 公開      | cryptoId31() 單獨抽一次（不是亂數流）              | 這一局的識別碼：client 重連時判斷是不是同一局 |
 *
 * sim 裡沒有其他亂數來源（不用 Math.random；GameServer 預設的 worker seed 只影響地圖種子）。
 * 測試（GameServer／Game 帶 secret）：秘密流由 secret 決定、可重現（見 secretSeeds）；正式路徑（worker）不帶 secret。
 * 單機練習在正式環境走同一條 worker 路徑，也是密碼學亂數：遊戲沒有重播功能，練習局不需要可重現（測試另外用固定 secret）。
 */
export interface SecretSeeds {
  /** Game.secret：身分、職業、出生點、補位、UO 啟用碼、穩定度偏移 */
  roles: RngSeed
  /**
   * World.rng：事件、末日、病毒洗牌、遙控器啟用碼、AI 決策、傷害…其他所有遊戲亂數。
   * 'map' = 不另開一條流，和公開的版面流共用同一個 Rng（= 改版前的單一序列）：只有舊測試的數字 secret 會這樣，
   * 正式對局（secret 省略）不可能走到
   */
  world: RngSeed | 'map'
  /** World.idRng：實體 id（正式對局 = 'crypto'：每個 id 直接取密碼學亂數）*/
  ids: RngSource
}

/**
 * 秘密流的種子。
 * - 省略 = 正式對局（worker 一律省略）：身分流、遊戲流各自用 cryptoSeed()（128 bit），id 流用 'crypto' 來源；
 *   彼此、和地圖種子都無關。
 * - SecretSeeds 物件 = 測試整組指定（結構和正式對局相同；例如只固定身分流，id 流給 cryptoSeed() 或 'crypto'）。
 * - 數字 = 舊測試的明確種子（Harness 等）：身分流、id 流沿用改版前的推法，遊戲流和版面流共用（world: 'map'），
 *   既有測試調好的亂數序列（AI 行為、事件、落點）一個都不變。這只是測試相容，不是正式路徑的行為
 */
export function secretSeeds(secret?: number | SecretSeeds): SecretSeeds {
  if (secret === undefined) return { roles: cryptoSeed(), world: cryptoSeed(), ids: 'crypto' }
  if (typeof secret !== 'number') return secret
  return { roles: secret, world: 'map', ids: (secret * 2654435761) >>> 1 || 7 }
}

export class Game {
  readonly world: World
  /** 身分、職業、出生點等隱藏資訊專用的秘密亂數流（種子見 secretSeeds；盤點表在 SecretSeeds 上方）*/
  readonly secret: Rng
  /** 這一局的識別碼（獨立的密碼學亂數，不是亂數流，推不出任何秘密）：client 重連時用來判斷是不是同一局 */
  readonly gid = cryptoId31()
  readonly players: GamePlayer[] = []
  readonly settings: LobbySettings
  readonly send: GameInit['send']
  readonly forceRole: GameInit['forceRole']
  /** 單機練習局：練習專屬規則（末日提前由 server 開局時寫進 settings；致命事件權重減半見 events.ts）*/
  readonly practice: boolean
  tick = 0
  hostHidden = false
  /** 除錯工具的暫停 */
  paused = false
  /** 單機練習暫停（server.ts 依 client 的 pause 訊息設定；只在練習局、只有 1 名真人時）*/
  menuPause = false
  /** 開局時等玩家載入完：還在等幾個人（> 0 時模擬不推進、照常送快照；由 server 設定）*/
  hold = 0
  timeScale = 1
  private acc = 0
  ended: EndResult | null = null
  readonly timeline: { t: number; text: string }[] = []
  readonly tuning: Tuning
  /** 啟用的站 id */
  stations: string[] = []
  /** 這一 tick 要廣播的特效（依可見性過濾後送出）*/
  fx: (FxEvent & { vis?: number[] })[] = []
  /** 系統訊息佇列 */
  sysLines: { line: ChatLine; to: number[] | 'all' }[] = []
  projectiles: Projectile[] = []
  /** 各系統的共享狀態 */
  readonly data: Record<string, any> = {}
  private timers: { at: number; fn: () => void }[] = []
  /** 其他系統掛上的事件 */
  onCast?: (u: Ent, ab: AbilityDef, target?: Ent) => void
  onItemGained?: (u: Ent, it: ItemInst) => void
  onItemLost?: (u: Ent, it: ItemInst) => void
  onBuy?: (u: Ent, vendor: Ent, item: string) => void
  onMorph?: (u: Ent) => void
  customHostile?: (a: Ent, b: Ent) => boolean
  /**
   * 這個玩家單位最近被 NPC（船員、無人機…）或敵對生物打過、還在還擊時限內（ai/creatures.ts；給了 by 就只問是不是被 by 打過）：
   * 閒置時連平常不自動索敵的人員也會還手
   */
  npcStruck?: (u: Ent, by?: Ent) => boolean
  /** 鎮定（降低敵對生物仇恨）*/
  isCalm?: (u: Ent) => boolean
  /** 對局中新增了 zone（事件站）：通知所有 client */
  zonesChanged?: () => void = () => {
    const zones = this.zoneList()
    for (const p of this.allPlayers()) this.send(p.slot, { t: 'zones', zones })
  }
  /** 群組頻道發言（黑洞裝置彩蛋）*/
  onGroupChat?: (p: GamePlayer, text: string) => void
  /** 死者附身蛞蝓仔 */
  possessSlug?: (slot: number) => boolean
  /** 每 tick 額外執行的系統（AI、事件、太空…）*/
  readonly systems: { name: string; fn: (g: Game) => void }[] = []
  /** 核心步驟、系統、排程、死亡掛勾丟出的例外：累計次數，與連續出錯的 tick 數（worker 據此判斷是否不可恢復）*/
  stepErrors = 0
  errStreak = 0
  private tickErr = false

  /** 單一步驟的例外不能卡死整局（DEV 印出來）*/
  private guard(name: string, fn: (g: Game) => void): void {
    try {
      fn(this)
    } catch (e) {
      this.stepErrors++
      this.tickErr = true
      if (__DEV__) console.error('[step]', name, e)
      else if (!this.warnedSteps.has(name)) {
        // 正式版每種步驟只記一次，不洗版
        this.warnedSteps.add(name)
        console.warn('[step]', name, e)
      }
    }
  }
  private readonly warnedSteps = new Set<string>()

  constructor(init: GameInit) {
    this.settings = init.settings
    this.send = init.send
    this.forceRole = init.forceRole
    this.practice = !!init.practice
    // 地圖種子只進公開的版面流；三條秘密流的種子各自獨立（正式對局是密碼學亂數）
    const seeds = secretSeeds(init.secret)
    this.secret = new Rng(seeds.roles)
    this.world = new World(init.seed, { world: seeds.world, ids: seeds.ids })
    for (const p of init.players) {
      this.players[p.slot] = {
        slot: p.slot,
        name: p.name,
        baseName: p.name,
        color: p.color,
        bot: p.bot,
        connected: p.connected,
        left: false,
        spectator: p.spectator,
        role: 'human',
        spawnOf: null,
        android: false,
        classId: '',
        phd: '',
        main: 0,
        control: 0,
        alive: !p.spectator,
        deadAt: -1,
        stayDead: false,
        ep: 0,
        tier: 0,
        form: '',
        evolvingUntil: 0,
        mutedUntil: 0,
        muteName: false,
        notes: new Map(),
        gitReports: [],
        view: newViewState(),
        flags: { wide: false, listen: false, reveal: false },
        stats: { kills: 0, infections: 0, tests: 0 },
        chatOut: [],
        fxOut: [],
        bio: '',
        hint: '',
        specZone: 1,
        feeds: [],
        started: false,
        data: {},
      }
    }
    this.tuning = new Tuning(this)
    setupWorld(this)
    installRoles(this)
    installSpace(this)
    assignRoles(this)
    setupShips(this)
    itemRuntime(this)
    installCreatureAi(this)
    installXenoSystems(this)
    installMutantSystems(this)
    installEvents(this)
    installStations(this)
    installFacilities(this)
    installRegen(this)
    installBots(this)
    installRemote(this)
    installFeeds(this)
    for (const p of this.allPlayers()) this.resendStart(p.slot)
  }

  allPlayers(): GamePlayer[] {
    return this.players.filter((p): p is GamePlayer => !!p)
  }

  player(slot: number): GamePlayer | undefined {
    return this.players[slot]
  }

  faction(p: GamePlayer): Faction {
    if (p.spawnOf) return p.spawnOf
    if (p.role === 'xeno') return 'xeno'
    if (p.role === 'mutant') return 'mutant'
    return 'crew'
  }

  factionOfSlot(slot: number): Faction | null {
    const p = this.players[slot]
    return p ? this.faction(p) : null
  }

  mainOf(p: GamePlayer): Ent | undefined {
    return this.world.get(p.main)
  }

  controlOf(p: GamePlayer): Ent | undefined {
    return this.world.get(p.control) ?? this.world.get(p.main)
  }

  get time(): number {
    return this.world.time
  }

  // ───────── 連線 ─────────

  setConnected(slot: number, c: boolean): void {
    const p = this.players[slot]
    if (!p) return
    p.connected = c
    if (c) p.view = newViewState()
  }

  zoneList(): [number, string, string][] {
    return this.world.zones.filter((z) => z.station).map((z) => [z.id, z.key, z.station!.id] as [number, string, string])
  }

  resendStart(slot: number): void {
    const p = this.players[slot]
    if (!p) return
    const info: StartInfo = {
      slot,
      seed: 0,
      stations: this.stations,
      zones: this.zoneList(),
      // 名字用別人眼中的本名：通訊病毒之後重新連線時，名單不能把真名和換過的顏色對起來
      players: this.allPlayers().map((q) => ({ slot: q.slot, name: shownBase(q), color: q.color, bot: q.bot })),
      spectator: p.spectator,
      gid: this.gid,
    }
    p.view = newViewState()
    this.send(slot, { t: 'start', info })
    if (this.ended) this.send(slot, { t: 'end', result: this.ended })
  }

  /**
   * 正式判定離開（斷線超過寬限，或主動離開）：照原作點名公告（j6 17046「… has left the game!」），殺死主單位並不得復活；
   * 開局 90 秒內離開的異類／仿生人由人類補位（systems/replace.ts；離開的時刻以斷線當下計）
   */
  playerLeft(slot: number): void {
    const p = this.players[slot]
    if (!p || p.left) return
    // 補不補位要在殺死主單位之前判斷（死了就不再是「活著的主腦」）
    const seat = earlySeat(this, p)
    p.left = true
    p.connected = false
    this.systemAll('sys.left', { name: shownBase(p) })
    const u = this.mainOf(p)
    if (u && u.alive) {
      p.stayDead = true
      // 結算時間軸的死因：離開遊戲
      u.data.deathCause = 'left'
      this.kill(u, null)
    }
    if (seat && !this.ended) replaceSeat(this, p, seat)
    clearDeparture(p)
  }

  /**
   * 真人斷線（還在重連寬限內）：公開說一聲，但不點名。
   * 匿名形態（異形形態、繭、肉團）或化身成別人時斷線，身體會停在原地；公告點名的話，「誰斷線」配上「哪個身體不動了」
   * 就能把匿名形態對回真人。寬限結束才照原作點名「X 離開了遊戲」（playerLeft）。
   * 斷線的當下記下遊戲時間：開局補位以這個時刻判斷（systems/replace.ts）
   */
  playerDropped(slot: number): void {
    const p = this.players[slot]
    if (!p || p.bot || p.left || p.spectator) return
    noteDeparture(this, p)
    this.systemAll('sys.droppedAnon', { s: RECONNECT_GRACE_S })
  }

  /** 斷線的真人在寬限內重新連上：一樣不點名；這次斷線不算離開（不補位）*/
  playerRejoined(slot: number): void {
    const p = this.players[slot]
    if (!p || p.bot || p.left || p.spectator) return
    clearDeparture(p)
    this.systemAll('sys.rejoinedAnon')
  }

  /** 超過寬限才重新連上（已經判定離開）：只私訊本人說明，現在是什麼狀態 */
  playerReturnedAfterLeave(slot: number): void {
    const p = this.players[slot]
    if (!p || !p.left || p.bot || this.ended) return
    this.privateLine(slot, p.data.booted ? 'sys.leftYouBooted' : 'sys.leftYou', { s: RECONNECT_GRACE_S })
  }

  /** 小地圖信號（server 已限流；驗證與轉送見 systems/chat.ts routeMapPing）*/
  handleMapPing(slot: number, z: number, x: number, y: number): void {
    const p = this.players[slot]
    if (!p || this.ended) return
    routeMapPing(this, p, z, x, y)
  }

  // ───────── 輸入 ─────────

  handleCommand(slot: number, c: Command): void {
    const p = this.players[slot]
    if (!p || this.ended) return
    if (c.k === 'spec') {
      // 旁觀者切換觀看的 zone
      if ((!p.alive || p.spectator) && c.s !== undefined && this.world.zones[c.s]?.alive && !p.data.coreOnly) p.specZone = c.s
      return
    }
    handleCommand(this, p, c)
  }

  handleChat(slot: number, ch: ChatChannel, text: string, to?: string): void {
    const p = this.players[slot]
    if (!p) return
    routeChat(this, p, ch, text, to)
  }

  /** 亡靈預言（第 8 輪；規則見 systems/spectate.ts prophesy）*/
  handleProphecy(slot: number, win: ProphecyWin, mind?: number): void {
    const p = this.players[slot]
    if (!p || this.ended) return
    prophesy(this, p, win, mind)
  }

  /** 死亡模式投票（開局 180 秒內一次；本作修正原作只算單方票數的 bug）與禁言投票 */
  handleVote(slot: number, v: string, arg?: number): void {
    const p = this.players[slot]
    if (!p) return
    const vs = this.votes
    if (v === 'deathStart') {
      if (this.time > 180 || vs.deathDone || vs.death) return
      vs.death = { until: this.time + 30, ballots: new Map() }
      this.systemAll('vote.deathStarted')
      return
    }
    if ((v === 'boot' || v === 'spectate') && vs.death && p.alive) {
      vs.death.ballots.set(slot, v)
      return
    }
    if (v === 'kick' && arg !== undefined && p.alive) {
      const t = this.players[arg]
      if (!t || t.alive) return
      const set = vs.kick.get(arg) ?? new Set<number>()
      set.add(slot)
      vs.kick.set(arg, set)
      const alive = this.allPlayers().filter((q) => q.alive && q.connected).length
      if (set.size >= alive / 2) {
        t.data.deadMuted = true
        this.systemAll('vote.kicked', { name: shownBase(t) })
      } else this.privateLine(slot, 'vote.kickLeft', { n: Math.ceil(alive / 2 - set.size) })
    }
  }

  votes: {
    death: { until: number; ballots: Map<number, string> } | null
    deathDone: boolean
    kick: Map<number, Set<number>>
  } = { death: null, deathDone: false, kick: new Map() }

  private stepVotes(): void {
    const d = this.votes.death
    if (!d || this.time < d.until) return
    let boot = 0
    let spec = 0
    for (const b of d.ballots.values()) {
      if (b === 'boot') boot++
      else spec++
    }
    this.votes.death = null
    this.votes.deathDone = true
    this.settings.bootOnDeath = boot > spec
    // 投票前就已經死了的人也照新規則：開啟→一併出局（遺言時間內的人等遺言結束再判定）；關閉→回到觀戰
    for (const p of this.allPlayers()) {
      if (p.alive) continue
      if (!this.settings.bootOnDeath) delete p.data.booted
      else if (!inLastWords(this, p)) bootIfOut(this, p)
    }
    this.systemAll(boot > spec ? 'vote.bootOn' : 'vote.spectateOn', { boot, spec })
  }

  handleNote(slot: number, target: number, mark: NoteMark, text: string): void {
    const p = this.players[slot]
    if (!p || !this.players[target]) return
    p.notes.set(target, { slot: target, mark, text })
  }

  /**
   * 分享調查筆記。每次分享都會私訊對方「X 分享了調查筆記給你」，只受一般限流的話 10 秒能洗 400 則、
   * 把對方的聊天紀錄（含驗血結果）洗掉（第 5 輪審查 P2-7），所以：
   * - 內容和上次分享給同一個人的完全一樣：什麼都不做（不更新、不通知）；
   * - 同一對（分享者 → 收件者）SHARE_NOTIFY_S 秒內最多通知一次：視窗內有新內容就照樣更新對方的筆記，
   *   通知延到視窗結束時補一則（一個視窗只排一次），對方不會漏掉更新
   */
  shareNotes(slot: number, to: number): void {
    const p = this.players[slot]
    const q = this.players[to]
    if (!p || !q || slot === to) return
    // 死者與旁觀者看得到全場：只能分享給其他死者，不能把看到的東西傳給活人（出局的人兩邊都不行）；
    // 等記憶核心復活的仿生人之後會回到活人那邊，也不能收
    if (!p.alive && (p.data.booted || !hearsDead(q))) return
    const list = [...p.notes.values()].filter((n) => n.mark !== 'none' || n.text)
    const sig = JSON.stringify(list.map((n) => [n.slot, n.mark, n.text]))
    const key = slot * 100 + to
    const last = this.shares.get(key)
    if (last && last.sig === sig) return
    for (const n of list) q.notes.set(n.slot + 100 * (slot + 1), { ...n, from: slot })
    if (!last || this.time - last.at >= SHARE_NOTIFY_S) {
      this.shares.set(key, { sig, at: this.time, pending: false, name: p.name })
      this.privateLine(q.slot, 'sys.notesShared', { name: p.name })
      return
    }
    last.sig = sig
    last.name = p.name
    if (last.pending) return
    last.pending = true
    this.after(last.at + SHARE_NOTIFY_S - this.time, () => {
      last.pending = false
      last.at = this.time
      if (this.players[to]) this.privateLine(to, 'sys.notesShared', { name: last.name })
    })
  }
  /** 筆記分享的通知紀錄：key = 分享者 slot × 100 + 收件者 slot；sig = 上次分享的內容、at = 上次通知的時刻 */
  private readonly shares = new Map<number, { sig: string; at: number; pending: boolean; name: string }>()

  handleTune(slot: number, id: number, op: string, args: unknown[]): void {
    const r = this.tuning.run(slot, op, args)
    this.send(slot, { t: 'TuneResult', id, ok: r.ok, msg: r.msg, data: r.data })
  }

  // ───────── 訊息 ─────────

  systemAll(key: string, args?: Record<string, string | number>): void {
    this.sysLines.push({ line: { from: '', color: -1, ch: 'sys', text: fmtKey(key, args), time: this.time }, to: 'all' })
  }

  privateLine(slot: number, key: string, args?: Record<string, string | number>): void {
    this.sysLines.push({ line: { from: '', color: -1, ch: 'private', text: fmtKey(key, args), time: this.time }, to: [slot] })
  }

  log(text: string): void {
    this.timeline.push({ t: Math.round(this.time), text })
  }

  emitFx(fx: FxEvent, vis?: number[]): void {
    this.fx.push(vis ? { ...fx, vis } : fx)
  }

  /** 改變玩家身分（測試掛勾、補位）*/
  setRole(p: GamePlayer, role: Role): void {
    p.role = role
    p.spawnOf = null
    p.bio = `bio.${p.classId}.${role}`
  }

  /** 每位觀看者的公開世界狀態（快照差量）*/
  worldPublic(viewer?: GamePlayer): Record<string, unknown> {
    // 站點供電狀態（緊急照明）是現場資訊：只有人在那一站的人看得到（死者、旁觀者看全場）；
    // 否則遠處的人從快照就能知道「此刻有人在破壞女帝號的動力台」
    const here = viewer && viewer.alive && !viewer.spectator ? this.mainOf(viewer)?.zone : undefined
    const seesAll = !viewer || !viewer.alive || viewer.spectator
    return {
      t: Math.floor(this.time),
      st: this.world.zones.filter((z) => z.alive && z.station).map((z) => z.key),
      pw: this.world.zones.filter((z) => z.alive && z.power !== 'normal' && (seesAll || z.id === here)).map((z) => z.key),
      ld: this.hold,
      stab: this.stability(),
      // 存活人數／參戰總數（不分身分；和 -names 的死亡標記一致，旁觀的主機不算）：每次死亡本來就全場公告，不多洩漏資訊
      al: [this.allPlayers().filter((p) => !p.spectator && p.alive).length, this.allPlayers().filter((p) => !p.spectator).length],
      apo: (this.data.events as EventState | undefined)?.apoc ?? '',
      bg: this.hostHidden,
      pz: this.paused || this.menuPause,
      vote: this.votes.death
        ? { kind: 'death', until: Math.ceil(this.votes.death.until - this.time), boot: [...this.votes.death.ballots.values()].filter((b) => b === 'boot').length, spec: [...this.votes.death.ballots.values()].filter((b) => b === 'spectate').length }
        : null,
      boot: this.settings.bootOnDeath,
      // 局中改變的天氣（systems/stations.ts：餘燼衛星護盾失效 → 暴風雪）
      wx: Object.fromEntries(this.world.zones.filter((z) => z.alive && typeof z.data.weather === 'string').map((z) => [z.key, z.data.weather as string])),
      // 基因檢測器開放（醫療補給、GIT 檢測儀上架）的秒數：依難度決定的固定設定，不含任何隱藏資訊
      gitAt: samplerOpenAt(this),
      // 進行中的重大事件（events.ts publicEvents：都是全場公告過、所有人本來就看得到的事）
      ev: this.publicEventsNow(),
      // 末日與災害的公開狀態（events.ts publicDoom：rad／fleetPlanet／burnIn／siege，只在條件成立時有值）
      ...publicDoom(this),
    }
  }

  private evCache: { tick: number; list: string[] } = { tick: -1, list: [] }

  /** 每位觀看者每個 tick 都會要 worldPublic：進行中事件同一個 tick 只算一次（要掃太空層的單位）*/
  private publicEventsNow(): string[] {
    if (this.evCache.tick !== this.world.tick) this.evCache = { tick: this.world.tick, list: publicEvents(this) }
    return this.evCache.list
  }

  /** 星區穩定度 0..1：末日的軟計時（GDD §7.8），觸發時歸零 */
  stability(): number {
    const ev = this.data.events as EventState | undefined
    if (!ev) return 1
    if (ev.apoc) return 0
    // 軟計時：5% 一格、每局隨機偏移 ±90 秒，看得出大概但推不出精確時刻
    const jitter = ((this.data.stabJitter as number | undefined) ??= this.secret.range(-90, 90))
    const k = 1 - (this.time + jitter) / ev.apocAt
    return Math.max(0.05, Math.min(1, Math.ceil(k * 20) / 20))
  }

  epNext(p: GamePlayer): number {
    void p
    return 0
  }

  evolveOptions(p: GamePlayer): string[] {
    void p
    return []
  }

  // ───────── 生命週期 ─────────

  kill(u: Ent, killer: Ent | null): void {
    this.killEnt(u, killer, killer?.owner ?? -1)
  }

  /** 單位死亡：hooks（掉落、屍體、身分轉化、公告、勝負）→ 移除 */
  killEnt(u: Ent, killer: Ent | null, killerSlot = killer?.owner ?? -1): void {
    if (!u.alive) return
    u.alive = false
    u.hp = 0
    u.anim = 4
    u.order = null
    u.queue.length = 0
    u.path = null
    u.cast = null
    u.data.dash = undefined
    // 死亡特效（音效用）：不留屍體的單位（機械、分身、被吞食的）在快照裡只是「消失」，和走出視野分不出來。
    // 只帶 id、不帶外觀：snapshot.ts 只送給上一份快照就看得到這個單位、也看得到死亡地點的人，
    // client 用自己最後看到的樣子決定叫聲（偽裝就是偽裝對象的聲音），不會比快照多透露任何東西
    this.emitFx({ k: 'die', z: u.zone, x: u.x, y: u.y, e: u.id })
    for (const h of DEATH_HOOKS) {
      try {
        h(this, u, killer, killerSlot)
      } catch (e) {
        this.stepErrors++
        if (__DEV__) console.error('[death hook]', e)
      }
    }
    if (u.data.keepOnDeath) return
    this.world.remove(u)
  }

  // ───── 身分機制 API（systems/roles*.ts 實作；內容腳本可以呼叫）─────

  /** 增減某位玩家的 EP（依大廳 EP 倍率）*/
  addEp(slot: number, amount: number): void {
    const p = this.players[slot]
    if (!p) return
    p.ep = Math.max(0, p.ep + (amount > 0 ? amount * this.settings.epMult : amount))
  }

  /** 延遲 0.25 秒做勝負判定（原作事件驅動）*/
  checkVictory(): void {
    this.victoryPending = true
  }
  victoryPending = false

  /** 讓死去的玩家在指定位置復活（回傳新的主單位）*/
  revivePlayer(slot: number, at: { zone: number; x: number; y: number }, defId = 'personnel', hpPct = 1): Ent | null {
    return this.rolesApi?.revive(slot, at, defId, hpPct) ?? null
  }

  /** 把玩家轉成某陣營的 spawn（主單位換成該陣營目前的 spawn 型）*/
  convertToSpawn(slot: number, faction: 'xeno' | 'mutant', at?: { zone: number; x: number; y: number }, hpPct = 0.33, defId?: string): Ent | null {
    return this.rolesApi?.convert(slot, faction, at, hpPct, defId) ?? null
  }

  /** 石化主單位（勝負判定視為死亡）；解除時呼叫 unpetrify */
  petrify(u: Ent, on: boolean): void {
    this.rolesApi?.petrify(u, on)
  }

  rolesApi: {
    revive(slot: number, at: { zone: number; x: number; y: number }, defId: string, hpPct: number): Ent | null
    convert(slot: number, faction: 'xeno' | 'mutant', at: { zone: number; x: number; y: number } | undefined, hpPct: number, defId?: string): Ent | null
    petrify(u: Ent, on: boolean): void
  } | null = null

  onHiveship?: (p: GamePlayer, u: Ent) => void
  placePoi?: (z: Zone, poi: PoiInstance) => Ent | null = (z, poi) => placePoi(this, z, poi)
  /** 事件導演（M8）：forced = 由測試或除錯觸發，但對玩家呈現與隨機抽到相同 */
  triggerEvent?: (id: string, forced: boolean) => boolean
  eventIds?: () => string[]
  startApocalypse?: (kind: 'fleet' | 'orbit') => boolean
  /** 摧毀站點（M6）*/
  destroyStation?: (key: string) => boolean

  /** 換一個新的實體 id（偽裝、分身時用）：client 端看起來就是舊單位離開視野、新單位出現，
   * 改過的 client 也無法用 id 的連續性分辨真假。修正所有存舊 id 的地方。*/
  reassignId(e: Ent): number {
    const old = e.id
    const nid = this.world.newId()
    this.world.rekey(e, nid)
    const fix = (v: number) => (v === old ? nid : v)
    for (const p of this.allPlayers()) {
      p.main = fix(p.main)
      p.control = fix(p.control)
      if (p.data.slug === old) p.data.slug = nid
    }
    for (const o of this.world.ents.values()) {
      o.master = fix(o.master)
      o.piloting = fix(o.piloting)
      o.pilot = fix(o.pilot)
      o.lastHitBy = fix(o.lastHitBy)
      o.windupTarget = fix(o.windupTarget)
      o.animTarget = fix(o.animTarget)
      if (o.order?.e === old) o.order.e = nid
      for (const q of o.queue) if (q.e === old) q.e = nid
      for (const b of o.buffs) b.src = fix(b.src)
      if (o.data.aggro === old) o.data.aggro = nid
    }
    for (const z of this.world.zones) z.spaceEnt = fix(z.spaceEnt)
    const sp = this.data.space as { pilots?: Map<number, number> } | undefined
    if (sp?.pilots) {
      for (const [k, v] of [...sp.pilots]) {
        if (k === old) sp.pilots.delete(k)
        sp.pilots.set(fix(k), fix(v))
      }
    }
    this.onReassign?.(old, nid)
    return nid
  }
  onReassign?: (oldId: number, newId: number) => void

  /**
   * 結束本局：送出結算。平手時 why = 平手的原因（同歸於盡、末日倒數結束；沒給就是其他原因）；
   * 中止時 abortWhy = 中止的原因（目前只有主機中止，見 abort()）
   */
  endGame(winner: EndResult['winner'], why?: EndResult['drawWhy'], abortWhy?: EndResult['abortWhy']): void {
    if (this.ended) return
    const key = winner === 'crew' ? 'end.crew' : winner === 'xeno' ? 'end.xeno' : winner === 'mutant' ? 'end.mutant' : winner === 'draw' ? 'end.draw' : 'end.aborted'
    // 中止的聊天與時間軸寫出原因（end.abortWhy.host：主機離開了）
    const line = winner === 'aborted' && abortWhy ? 'end.abortWhy.' + abortWhy : key
    this.systemAll(line)
    this.log(line)
    this.ended = {
      winner,
      duration: Math.round(this.time),
      timeline: this.timeline.slice(-200),
      ...(winner === 'draw' ? { drawWhy: why ?? 'other' } : {}),
      ...(winner === 'aborted' && abortWhy ? { abortWhy } : {}),
      players: this.allPlayers().map((p) => ({
        slot: p.slot,
        name: p.baseName,
        color: p.color,
        // 被轉化的人顯示成轉化者的陣營（「異形 spawn」），不是原本的「人類」；
        // 開局早退、被別人補位的人顯示離開前的身分（systems/replace.ts 把他改成人類，免得和補位者搶主腦）
        role: (p.data.leftRole as Role | undefined) ?? p.spawnOf ?? p.role,
        classId: p.classId,
        // 政委晉升成特務（events.ts promotion；職業 classId 仍是 commissar，頭銜改成特務）
        ...(p.data.promoted ? { promoted: true } : {}),
        spawn: !!p.spawnOf,
        alive: p.alive,
        // 只主持不參戰的主機：結算畫面另外列成「觀戰」，不顯示成「人類 死亡」
        ...(p.spectator ? { spectator: true } : {}),
        kills: p.stats.kills,
        infections: p.stats.infections,
        tests: p.stats.tests,
      })),
    }
    // 亡靈預言：結算時才公開（之前只有預言者本人知道自己押了什麼）
    const proph = prophecyResults(this, winner)
    if (proph.length) this.ended.prophecies = proph
    for (const p of this.allPlayers()) if (p.connected && !p.bot) this.send(p.slot, { t: 'end', result: this.ended })
  }

  /**
   * 主機中止（ClientMsg abort，server 只接受本機 peer）：主機在對局中離開房間或關閉分頁，worker 接著就會被終止。
   * 立刻結算（winner = 'aborted'、abortWhy = 'host'），公開所有身分給所有在線的人；結算的系統訊息也當下送出、
   * 不等下一個 tick。已經結算過就不做事（回傳 false）
   */
  abort(): boolean {
    if (this.ended) return false
    this.endGame('aborted', undefined, 'host')
    this.flushChat()
    return true
  }

  /** 主單位死亡（roles 系統會覆寫以處理 spawn 轉化與公告）*/
  onMainDeath(p: GamePlayer, u: Ent, _killer: Ent | null, _killerSlot: number): void {
    p.alive = false
    p.deadAt = this.time
    p.specZone = u.zone
    p.control = 0
    this.systemAll('death.innocent')
  }

  /** 排程：t 秒後執行 */
  after(t: number, fn: () => void): void {
    this.timers.push({ at: this.time + t, fn })
  }

  castFail(u: Ent, why: string): void {
    if (u.owner >= 0 && u.isMain) this.privateLine(u.owner, 'cast.' + why)
  }

  spawnRubble(zone: number, x: number, y: number, count: number, radius: number): void {
    const z = this.world.zones[zone]
    if (!z.nav) return
    const def = unitDef('rubble')
    for (let i = 0; i < count; i++) {
      const a = this.world.rng.range(0, Math.PI * 2)
      const r = Math.sqrt(this.world.rng.next()) * radius
      const px = x + Math.cos(a) * r
      const py = y + Math.sin(a) * r
      const idx = z.nav.idx(px, py)
      if (idx < 0 || z.nav.solid[idx] || z.nav.dyn[idx] || z.nav.doorOf[idx] >= 0) continue
      const e = this.world.spawn(def, zone, Math.floor(px) + 0.5, Math.floor(py) + 0.5, NEUTRAL)
      e.facing = a
      e.data.navIdx = idx
      z.nav.dyn[idx]++
    }
  }

  damageDoorsNear(zone: number, x: number, y: number, r: number, dmg: number): void {
    const z = this.world.zones[zone]
    if (!z.layout) return
    for (const d of z.layout.doors) {
      if ((d.x - x) ** 2 + (d.y - y) ** 2 > (r + d.width / 2) ** 2) continue
      const st = z.doors[d.index]
      if (st.broken) continue
      st.hp -= dmg
      if (st.hp <= 0) {
        st.broken = true
        st.open = true
        z.nav!.doorClosed[d.index] = 0
        this.emitFx({ k: 'doorBreak', z: zone, x: d.x, y: d.y })
      }
    }
  }

  damage(src: Ent | null, t: Ent, amount: number): number {
    return damage(this, src, t, amount)
  }

  script(name: string) {
    return SCRIPTS.get(name)
  }

  /** 由 server 以 20 Hz 呼叫；依 timeScale 推進模擬 */
  step(): void {
    // 暫停中不累積時間（acc 不變）：繼續時從暫停的那一刻接著跑，不會補跑暫停期間的 tick
    if (this.paused || this.menuPause || this.ended || this.hold > 0) {
      this.flush()
      return
    }
    this.acc += this.timeScale
    while (this.acc >= 1) {
      this.acc -= 1
      this.simTick()
    }
    this.flush()
  }

  /** 不送快照地推進一個模擬 tick（跳過時間用）*/
  stepOnce(): void {
    if (!this.ended) this.simTick()
  }

  private simTick(): void {
    const w = this.world
    w.tick++
    w.time += TICK_DT
    this.tick = w.tick
    this.tickErr = false
    // 排程
    if (this.timers.length) {
      const due = this.timers.filter((x) => x.at <= w.time)
      if (due.length) {
        this.timers = this.timers.filter((x) => x.at > w.time)
        for (const d of due) {
          try {
            d.fn()
          } catch (e) {
            this.stepErrors++
            this.tickErr = true
            if (__DEV__) console.error('[timer]', e)
          }
        }
      }
    }
    this.guard('votes', (g) => g.stepVotes())
    this.guard('doors', stepDoors)
    this.guard('autocast', stepAutocast)
    this.guard('casting', stepCasting)
    this.guard('itemOrders', stepItemOrders)
    for (const s of this.systems) this.guard(s.name, s.fn)
    this.guard('movement', stepMovement)
    this.guard('dashes', (g) => stepDashes(g, TICK_DT))
    this.guard('buffs', stepBuffs)
    this.guard('combat', stepCombat)
    this.guard('projectiles', stepProjectiles)
    this.guard('vendors', stepVendors)
    this.guard('life', stepLife)
    this.errStreak = this.tickErr ? this.errStreak + 1 : 0
  }

  /** 每次 server tick 都送快照（暫停時也送，讓畫面維持）*/
  private flush(): void {
    // 觀戰看板、亡者之眼（systems/spectate.ts）：要在清掉這次的特效之前記下交戰
    stepSpectate(this)
    const vis = computeVision(this)
    for (const p of this.allPlayers()) {
      if (p.bot || !p.connected) {
        p.chatOut.length = 0
        p.fxOut.length = 0
        continue
      }
      const snap = buildSnapshot(this, p, vis.get(p.slot)!)
      // 死者／旁觀者專屬的欄位（觀戰看板、自己的預言、亡者之眼）；活人什麼都不加
      specSnap(this, p, snap)
      this.send(p.slot, { t: 'snap', s: snap })
    }
    this.flushChat()
    this.fx.length = 0
  }

  /** 送出累積的聊天與系統訊息（每個 tick 的 flush；主機中止時當下送出）*/
  private flushChat(): void {
    for (const { line, to } of this.sysLines) {
      const targets = to === 'all' ? this.allPlayers() : to.map((s) => this.players[s]).filter(Boolean)
      for (const p of targets) p.chatOut.push(line)
    }
    this.sysLines.length = 0
    for (const p of this.allPlayers()) {
      if (p.chatOut.length && p.connected && !p.bot) this.send(p.slot, { t: 'chat', lines: p.chatOut.splice(0) })
      else p.chatOut.length = 0
    }
  }
}

/**
 * 別人眼中這位玩家的「本名」部分：通訊病毒換過名字就是換到的名字（data.shownBase），否則就是 baseName。
 * 顯示名字一律是「頭銜（職業前綴或晉升頭銜）＋這個名字」；baseName 是真正的本名（結算時間軸等用）。
 */
export function shownBase(p: GamePlayer): string {
  return (p.data.shownBase as string | undefined) ?? p.baseName
}

/**
 * 別人眼中這位玩家此刻的顯示名字（頭銜＋shownBase）；通訊病毒清空名字的那 10 秒內 p.name 是空的，用記下的頭銜補上。
 * 不會是真名（除非還沒被病毒換過）
 */
export function shownName(p: GamePlayer): string {
  return p.name || ((p.data.virusTitle as string | undefined) ?? '') + shownBase(p)
}

/** 系統訊息以 key＋參數傳給 client 翻譯：`@key|k=v|k=v` */
export function fmtKey(key: string, args?: Record<string, string | number>): string {
  if (!args) return '@' + key
  return '@' + key + Object.entries(args).map(([k, v]) => `|${k}=${String(v).replace(/[|=]/g, '')}`).join('')
}
