// AI bots（M9）：填人數、練習模式、headless 對局測試。
// 只透過 handleCommand 下指令（和真人走同一條驗證路徑），只用自己的視野（p.view.visible）挑目標。
// 人類：買防護服（各有各的習慣：有人一直穿、有人在宿舍休息時脫下、有人拖到後期才穿）、驗血並在全體頻道公布結果
// （拿到檢測器就主動找人抽血；有感染但認不出是誰就再驗一次縮小範圍；只剩一個可疑的人就公開指認）、
// 遇到怪物開火、受傷逃跑；異類：落單時感染、湊夠 EP 就躲起來進化、變身後獵殺。
// 換站：人類方 AI 拿著檢測器、附近好一陣子沒有可以抽的人時，會開停泊的船去別的站找人（走到船邊登船→站上控制台發射→
// 駕駛前往目標站→停靠→下船）；目標只用 AI 自己看過的（最後看到某人的地方）或公開的資訊（地圖上的出生點多寡）。
// 除此之外 AI 不會主動登船或駕駛；誤上船、誤站上控制台時會自己離開。豪勇號飛行甲板上的最後一艘停泊船不開走（真人常出生在那裡）。
// 簡單練習局：拿著檢測器的真人走近時，看起來是人的 AI 會原地停一下讓他抽血（easyPause）。
// 第 6 輪（付費玩家第一晚審查）：
// - 誤傷不升級成互打：波及（範圍武器、穿透彈）、持續傷害（輻射裝外洩、燃燒）不還手，看起來是人的要瞄準自己打了好幾下才還手（realAttacker）；
//   被 NPC 船員、無人機打就躲開，不追著打（npcAttacker）；範圍、穿透武器的目標旁邊有人、NPC 或中立生物時不開火（splashRisk）；
//   AI 異類不在 NPC 船員、無人機看得到的地方吞食船員、主動出手（npcWitness）
// - 只憑兩份驗血名單的交集（間接推論）只公開提醒、盯著（watch），不開火；某份報告扣掉自己與驗過乾淨的人只剩他（硬證據）、
//   或親眼看到他對人出手，才指認、開火
// - 末日將至（「星區穩定度即將歸零」公告後）撤到翠原星地表：救生艙優先，沒有就開船（evacStep）；地表上躲隕擊的紅色警戒圈與輻射區
// - AI 異類好一陣子沒出手就跟蹤落單的船員（stalk），練習局不會整場沒事；末日開始後全力出手，一局要分出勝負
import type { Command } from '../../shared/protocol/messages'
import { FORMS, abilityDef, itemDef } from '../../shared/content/registry'
import { roomAt } from '../../shared/layout'
import { sampleListArgs } from '../../shared/sysArgs'
import { HOSTILE, NEUTRAL, dist2, type Ent } from '../ent'
import { fmtKey, type Faction, type Game, type GamePlayer } from '../game'
import { handleCommand } from '../systems/orders'
import { cdReady } from '../systems/abilities'
import { VENDOR_RANGE, type StockState } from '../systems/vendors'
import { consolePos, spaceOf, type ShipInst } from '../systems/space'
import { IMPACT_R, meteorWarnings, stationsOf } from '../systems/stations'
import { RAD_FIELD_R } from '../../shared/content/ships'
import type { EventState } from '../systems/events'
import { doorAxes, inDoorGap } from '../systems/movement'
import { SPACE_ZONE, type Zone } from '../world'
import { isEasy } from './level'
import { DAMAGE_HOOKS } from '../systems/damage'

interface Brain {
  next: number
  goal: Goal | null
  /** 不能再試的目標（指令失敗）*/
  skip: Map<number, number>
  evolveAt: number
  /** 驗血「有感染」名單上的人（抽血時看到的名字）→ 出現在幾份有感染的報告裡 */
  suspects: Map<string, number>
  /** 出現在乾淨報告裡的名字 */
  cleared: Set<string>
  /** 每份有感染報告的名單（扣掉自己與匿名形態標記）：指認用 */
  infected: string[][]
  /** 出現在自己任何一份報告裡的名字（沒有嫌疑人時，下一支檢測器先抽還沒驗過的人）*/
  tested: Set<string>
  /** 自己用過的名字（晉升會改名；樣本上記的是抽血當時的名字）*/
  selfNames: Set<string>
  /** 看到過的人（抽血時會看到的名字）最後出現的位置：拿著檢測器時去那裡找人 */
  seen: Map<string, { zone: number; x: number; y: number; t: number }>
  /** 拿到過幾支檢測器（開局帶著的也算）*/
  samplers: number
  /** 上一輪手上有沒有檢測器（用來數「拿到」幾支）*/
  hadSampler: boolean
  /** 樣本上次有進展（拿到檢測器、多抽到一份）的時間與份數：找不到理想的人太久就放寬 */
  drawAt: number
  drawCount: number
  /** 下次可以去買檢測器的時間（買不到就晚點再試）；有感染報告後的複驗也從這裡排 */
  buyAt: number
  /** 已經處理過幾份自己的驗血報告 */
  reported: number
  /** 已經取過報告的解析器（每台只取一次：庫存補到 3 份、每 30 秒補貨，一直取會一直公告同一份結果）*/
  boughtFrom: Set<number>
  /** 已經公布過的「結果＋名單」：同一份結果不再公告、也不再重複累加嫌疑 */
  seenReports: Set<string>
  /** 已經公開指認的對象（名字）*/
  accused: string
  /** 公開指認過的所有名字（同一個人只指認一次）*/
  accusedAll: Set<string>
  /** 最近一次察覺威脅（看到玩家的怪物形態、被攻擊）的時間 */
  alarmAt: number
  /** 上次穿脫防護服的時間（避免來回切換）*/
  suitAt: number
  /** 卡住偵測：有移動命令時最後一次有前進的位置與時間 */
  px: number
  py: number
  pt: number
  /** 換站中（開船去別的站找人）*/
  trip: Trip | null
  /** 上次看到可以抽血的別人（18 公尺內、還沒抽過）的時間：太久沒看到就換站 */
  peopleAt: number
  /** 換過幾次站、下次可以再考慮換站的時間 */
  trips: number
  tripAt: number
  /** 最近找過人的站（zone id → 離開的時間）：剛找過沒人的站先不回去 */
  visited: Map<number, number>
  /** 簡單難度：下一次可以抽血的時間（抽血之間停比較久）；異類下一次可以出手的時間 */
  drawNext: number
  strikeAt: number
  /** 簡單練習局：為了讓拿著檢測器的真人抽血而原地停下（停到什麼時候、下一次最早什麼時候可以再停）*/
  pauseUntil: number
  pauseNext: number
  /**
   * 最近打到自己的單位（ent id → 最後一次的時間、瞄準自己打的傷害與次數、波及／持續傷害）：
   * 分辨「真的在打我」和誤傷（範圍武器的波及、輻射裝的外洩、燃燒），誤傷不還手（第 6 輪審查 B P1：誤傷升級成互打）
   */
  hits: Map<number, HitRec>
  /** 只憑交叉比對（間接推論）認出的嫌疑人：公開提醒、盯著他，不開火；親眼看到他傷人才改成指認 */
  watch: string
  watchUntil: number
  /** 公開提醒過的嫌疑人（同一個人只說一次）*/
  watchedAll: Set<string>
  /** 末日撤離到翠原星地表的進度 */
  evac: Evac | null
  /** 異類：上一次出手（感染、攻擊）的時間；下一次可以去跟蹤落單者的時間 */
  struckAt: number
  stalkAt: number
  /** 異類：下一次可以因為「看到落單的船員」打斷閒晃的時間；主動出手過幾次 */
  loneNext: number
  strikes: number
}

interface HitRec {
  t: number
  /** 瞄準自己（攻擊命令、施法、前搖的目標是自己）的直接傷害與次數 */
  aimed: number
  n: number
  /** 波及（範圍傷害、穿透彈）、持續傷害 */
  stray: number
}

/**
 * 末日撤離：pod = 去救生艙裝置領憑證、原地等 4 秒準備（at = 領到的時間）；ship = 交給換站流程（trip.evac）開船過去。
 * 到了翠原星地表就結束，之後只躲隕擊的紅色警戒圈與輻射區
 */
interface Evac {
  stage: 'pod' | 'ship'
  at: number
  /** 這個站已經試過、失敗的方式（救生艙準備被打斷、沒船…）*/
  podTries: number
}

/**
 * 換站的進度：walk = 在原本的站走到停泊的船邊登船；cabin = 在船艙裡（停泊中就走到控制台等發射、到站了就下船）；
 * fly = 駕駛中（前往目標站、停靠）。at = 這個階段開始的時間（逾時用）。
 */
interface Trip {
  from: number
  to: number
  ship: string
  stage: 'walk' | 'cabin' | 'fly'
  at: number
  start: number
  /** 出發時的陣營：途中被轉化（變成異類的 spawn）就放棄換站 */
  side: Faction
  /** 已經發射、駕駛過了，或在太空中搭別人開的船（之後停在哪裡都要下船）*/
  flown?: boolean
  /** 末日撤離到翠原星（不因路上遇到人、挨打、船上有真人而放棄；不做生命掃描）*/
  evac?: boolean
  /** 在太空中的船艙裡、自己不是駕駛（控制台沒人）開始等的時間：等太久（控制台壞了…）就放棄 */
  idleAt?: number
  /** 對目前的目標站下過幾次停靠指令；停靠失敗過（或飛太久到不了）的站；改過幾次目標；找不到可停靠的站開始等的時間 */
  tries?: number
  failed?: number[]
  retargets?: number
  noDock?: number
  /** 接近目標站時的生命掃描（船上的技能）：at = 結果出來的時間；改過幾次目標 */
  scan?: { at: number; done?: boolean }
  rescans?: number
  /** 太空中繞過障礙（恆星、其他站）的中繼點 */
  via?: { x: number; y: number }
  /** 太空中卡住偵測 */
  sx: number
  sy: number
  st: number
}

/**
 * 防護服習慣：always = 一拿到就穿、永不脫；casual = 平常穿著，在宿舍、販賣區等休息處且沒有威脅時脫下；
 * late = 拖到中後期（或察覺威脅）才穿。讓練習模式裡也有脆弱、好下手的未著裝人員（防護服擋不住寄生與朊毒，但著裝者血厚、打得還手）。
 */
type SuitPlan = 'always' | 'casual' | 'late'

// sent = 這個目標的移動命令已經下過（之前留下來的舊移動命令不算：要改走向這個目標）
type Goal =
  | { k: 'buy'; vendor: number; item: string; until: number; sent?: boolean }
  | { k: 'goto'; x: number; y: number; until: number; sent?: boolean }
  | { k: 'hunt'; e: number; until: number }
  | { k: 'flee'; x: number; y: number; until: number; sent?: boolean }
  | { k: 'cast'; a: string; e: number; until: number; slot?: number }
  | { k: 'results'; vendor: number; until: number; sent?: boolean }

const SUIT_VENDORS = new Set(['suitA', 'suitB', 'suitC', 'suitD'])

// ───────── 練習難度（g.settings.aiLevel）─────────
// easy：讓練習當異形不會太難。AI 船員驗血較慢（開局晚一點才去買檢測器、抽血之間停比較久、只抽身邊的人、不複驗）、
// 不公開指認、看到玩家的怪物形態不主動開火（被打才還手，其他時候躲開）；AI 異類偽裝更久才動手、出手之間隔比較久、怪物形態比較保守。
// normal：原本的行為，只是 AI 異類開局有一小段寬限期（NORMAL_EVIL_START），新手不會一開局就被打死。
// 第 6 輪追加（新手的第一局要贏得了）：easy 的 AI 異類末日期間不全力出手、不主動找人（allOut 只在 normal）、主動跟蹤只到第一次出手、
// 只進化到第一階、眷屬不再去感染別人；單機練習（g.practice，只有一位真人）的 easy 人類方 AI 會主動打 AI 的怪物形態、
// 有硬證據時指認 AI 異類、最多複驗一次（真人新手照舊不會被 AI 指認、追打）。多人房的 easy 照舊（分真人、AI 會讓人看出誰是真人）

const easy = isEasy
/** 簡單難度：開局多久之後才去買第一支檢測器（秒）；一局最多拿幾支（第二支只用來複驗）*/
const EASY_FIRST_SAMPLER = 180
const EASY_MAX_SAMPLERS = 2
/** 簡單難度：AI 異類最多進化到第幾階 */
const EASY_MAX_TIER = 1
/** 簡單難度：兩次抽血之間至少隔多久（秒）、只抽多近的人（公尺；一般 18）*/
const EASY_DRAW_GAP = 12
const EASY_DRAW_R = 10
/** 簡單難度：AI 異類開局多久之後才會感染、攻擊（秒），兩次出手之間隔多久 */
const EASY_EVIL_START = 420
const EASY_STRIKE_GAP = 90
/** 一般難度：AI 異類（異形、變種人）開局多久之後才會感染、主動變身攻擊、主動攻擊玩家（秒）；被打照樣還手 */
export const NORMAL_EVIL_START = 120
/** 簡單難度：換站前要找不到人多久（秒；一般 LONELY_S）*/
const EASY_LONELY_S = 150
/**
 * 簡單練習局：手上有基因檢測器（還沒抽滿）的真人走到這麼近（公尺）時，看起來是人的 AI 原地停下這麼久（秒）讓他抽血；
 * 同一個 AI 兩次停下之間至少隔這麼久（秒）。已經被這支檢測器抽過的 AI 不停（停了也沒用）。一般難度、多人房不停。
 */
export const EASY_PAUSE_R = 3
export const EASY_PAUSE_S = 3
export const EASY_PAUSE_GAP = 20

function brainOf(g: Game, p: GamePlayer): Brain {
  return (p.data.brain ??= {
    next: g.time + g.world.rng.range(1, 3),
    goal: null,
    skip: new Map(),
    evolveAt: 0,
    suspects: new Map(),
    cleared: new Set(),
    infected: [],
    tested: new Set(),
    selfNames: new Set(),
    seen: new Map(),
    samplers: 0,
    hadSampler: false,
    drawAt: 0,
    drawCount: 0,
    buyAt: 0,
    reported: 0,
    boughtFrom: new Set(),
    seenReports: new Set(),
    accused: '',
    accusedAll: new Set(),
    alarmAt: -1e9,
    suitAt: -1e9,
    px: 0,
    py: 0,
    pt: 0,
    trip: null,
    peopleAt: g.time,
    trips: 0,
    tripAt: 0,
    visited: new Map(),
    drawNext: 0,
    strikeAt: 0,
    pauseUntil: 0,
    pauseNext: 0,
    hits: new Map(),
    watch: '',
    watchUntil: 0,
    watchedAll: new Set(),
    evac: null,
    struckAt: -1e9,
    stalkAt: 0,
    loneNext: 0,
    strikes: 0,
  }) as Brain
}

/**
 * 每位人類 AI 的防護服習慣：第一次需要時一次分配給當下所有人類方 AI（用 sim 的 rng，可重現）。
 * 洗牌後依序給 late、casual、always，其餘隨機——只要有人類 AI，就至少有一個晚穿的。
 */
function suitPlanOf(g: Game, p: GamePlayer): SuitPlan {
  const plans = (g.data.botSuitPlans ??= assignSuitPlans(g)) as Map<number, SuitPlan>
  return plans.get(p.slot) ?? 'always'
}

function assignSuitPlans(g: Game): Map<number, SuitPlan> {
  const rng = g.world.rng
  const crew = g.allPlayers().filter((q) => q.bot && !q.spectator && g.faction(q) === 'crew')
  for (let i = crew.length - 1; i > 0; i--) {
    const j = rng.int(0, i)
    ;[crew[i], crew[j]] = [crew[j], crew[i]]
  }
  const out = new Map<number, SuitPlan>()
  const base: SuitPlan[] = ['late', 'casual', 'always']
  crew.forEach((q, i) => {
    const plan = i < base.length ? base[i] : rng.pick(base)
    out.set(q.slot, plan)
    // 晚穿的人在 9–15 分鐘之間才去穿
    if (plan === 'late') q.data.botSuitLateAt = rng.range(540, 900)
  })
  return out
}

/** 休息處：宿舍、販賣區、交誼廳、醫療室 */
const REST_ROOMS = new Set(['quarters', 'commissary', 'lounge', 'medbay'])

function resting(g: Game, u: Ent): boolean {
  const l = g.world.zones[u.zone]?.layout
  const r = l ? roomAt(l, u.x, u.y) : null
  return !!r && REST_ROOMS.has(r.spec.type)
}

function cmd(g: Game, p: GamePlayer, c: Command): void {
  handleCommand(g, p, c)
}

function visibleEnts(g: Game, p: GamePlayer, u: Ent, r: number): Ent[] {
  const out: Ent[] = []
  for (const e of g.world.query(u.zone, u.x, u.y, r)) if (e !== u && e.alive && p.view.visible.has(e.id)) out.push(e)
  return out
}

function nearest(u: Ent, list: Ent[]): Ent | null {
  let best: Ent | null = null
  for (const e of list) if (!best || dist2(u, e) < dist2(u, best)) best = e
  return best
}

const looksHuman = (e: Ent) => e.tags.has('personnel') || e.tags.has('suit')

/** 這個單位對 bot 而言是「敵人」嗎（只看得到外觀：人類 bot 不知道誰是異類）*/
function isFoe(g: Game, p: GamePlayer, e: Ent): boolean {
  if (e.owner === HOSTILE) return !e.tags.has('noTarget')
  if (e.owner < 0 || e.owner === p.slot) return false
  const f = g.faction(p)
  // 打不死的東西（執行長的機器管家等）不算威脅
  if (e.tags.has('invuln') || e.tags.has('butler')) return false
  if (f === 'crew') return !looksHuman(e) && !e.tags.has('structure') && !e.tags.has('ship') && !e.tags.has('station') && !e.tags.has('drone') && !e.tags.has('corpse')
  // 異類：同陣營不打
  const o = g.players[e.owner]
  return !!o && g.faction(o) !== f && !e.tags.has('structure') && !e.tags.has('corpse')
}

// ───────── 誤傷判斷（第 6 輪審查 B P1）─────────

/** 打到自己的紀錄多久沒有新的一下就忘掉（秒）*/
const HIT_MEMORY = 8
/** 「真的在打我」：瞄準自己打了這麼多下，或瞄準自己打掉這個比例的生命 */
const DELIBERATE_HITS = 2
const DELIBERATE_HP = 0.12

/** a 現在是不是對著 me 出手（攻擊命令、施法、前搖、攻擊動作的目標）：不是的話，打到 me 就是波及 */
function aimedAt(a: Ent, me: Ent): boolean {
  const o = a.order
  if (o && (o.k === 'attack' || o.k === 'cast') && o.e === me.id) return true
  return a.cast?.e === me.id || a.windupTarget === me.id || (a.anim === 2 && a.animTarget === me.id)
}

/** 記下打到 bot 單位的每一下（DAMAGE_HOOKS，installBots 掛上）*/
function noteHit(g: Game, src: Ent | null, t: Ent, amount: number, dot: boolean): void {
  if (!src || amount <= 0 || t.owner < 0 || src === t) return
  const p = g.players[t.owner]
  if (!p?.bot || (t.id !== p.main && t.id !== p.control)) return
  const b = brainOf(g, p)
  let r = b.hits.get(src.id)
  if (!r || g.time - r.t > HIT_MEMORY) r = { t: g.time, aimed: 0, n: 0, stray: 0 }
  r.t = g.time
  if (!dot && aimedAt(src, t)) {
    r.aimed += amount
    r.n++
  } else r.stray += amount
  b.hits.set(src.id, r)
  if (b.hits.size > 12) for (const [id, x] of b.hits) if (g.time - x.t > HIT_MEMORY) b.hits.delete(id)
}

/** 無主的 NPC（船員、防禦無人機、綏靖機器人、蛞蝓特工…，不含敵對生物）：牠們的仇恨會過期，被打就躲開，不追著打（追著打只會一直續仇）*/
function isNpc(e: Ent): boolean {
  return e.owner === NEUTRAL && !!e.def.ai && !!e.def.attack && !e.pilot
}

/** 最近 recent 秒內瞄準自己出手的 NPC（看得到的）*/
function npcAttacker(g: Game, p: GamePlayer, u: Ent, b: Brain, recent = 3): Ent | null {
  for (const [id, r] of b.hits) {
    if (g.time - r.t > recent || r.n === 0) continue
    const a = g.world.get(id)
    if (a && a.alive && a.zone === u.zone && isNpc(a) && p.view.visible.has(a.id)) return a
  }
  return null
}

/**
 * 最近 recent 秒內「真的在打我」的單位：看起來是敵人（怪物形態、敵對生物）的只要打到就算；
 * 看起來是人的，要瞄準自己打了好幾下（或打掉一大截血）才算——範圍武器的波及、輻射裝外洩、燃燒這類誤傷都不還手。NPC 不算（見 npcAttacker）
 */
function realAttacker(g: Game, p: GamePlayer, u: Ent, b: Brain, recent = 3, seen = true): Ent | null {
  let best: Ent | null = null
  let bt = -1
  for (const [id, r] of b.hits) {
    if (g.time - r.t > recent || r.t <= bt) continue
    const a = g.world.get(id)
    if (!a || !a.alive || a.owner === p.slot || isNpc(a)) continue
    // 要追著打回去就得看得到他、在同一站；只是要不要變身自保（異類），看不到也算
    if (seen && (a.zone !== u.zone || !p.view.visible.has(a.id))) continue
    // 敵對生物：打到就算；怪物形態（看起來就不是人）：瞄準我打到就算；看起來是人的：要「刻意」才算
    const ok = a.owner === HOSTILE ? r.n > 0 || r.stray > 0 : !looksHuman(a) && isFoe(g, p, a) ? r.n > 0 : r.n >= DELIBERATE_HITS || r.aimed >= u.maxHp * DELIBERATE_HP
    if (!ok) continue
    best = a
    bt = r.t
  }
  return best
}

/** 從 from 那裡往反方向躲開幾公尺（走得到的點）*/
function awayFrom(g: Game, u: Ent, from: { x: number; y: number }, d = 6): { x: number; y: number } | null {
  const a = Math.atan2(u.y - from.y, u.x - from.x) + g.world.rng.range(-0.5, 0.5)
  return g.world.zones[u.zone].nav?.nearestOpen(u.x + Math.cos(a) * d, u.y + Math.sin(a) * d) ?? null
}

/**
 * 打下去會不會波及到不該打的：自己是範圍或穿透武器，而且目標附近（或彈道上）有不是敵人的玩家單位、
 * NPC（船員、無人機、綏靖機器人…）或中立生物
 */
function splashRisk(g: Game, p: GamePlayer, u: Ent, t: Ent): boolean {
  const a = u.def.attack
  if (!a || (!a.aoe && !a.pierce)) return false
  const bystander = (e: Ent) =>
    e !== u &&
    e !== t &&
    e.alive &&
    !e.tags.has('corpse') &&
    !e.tags.has('noTarget') &&
    !e.tags.has('structure') &&
    !isFoe(g, p, e) &&
    (e.owner >= 0 || isNpc(e) || (e.owner === NEUTRAL && e.tags.has('creature') && e.def.ai !== 'decor'))
  if (a.aoe) {
    const r = a.aoe + 0.6
    for (const e of g.world.query(t.zone, t.x, t.y, r + 0.6)) if (bystander(e) && Math.hypot(e.x - t.x, e.y - t.y) < r + e.radius) return true
  }
  if (a.pierce) {
    const dx = t.x - u.x
    const dy = t.y - u.y
    const len = Math.hypot(dx, dy) || 1
    for (const e of g.world.query(u.zone, (u.x + t.x) / 2, (u.y + t.y) / 2, len / 2 + 2)) {
      if (!bystander(e)) continue
      const k = Math.max(0, Math.min(1 + 1.5 / len, ((e.x - u.x) * dx + (e.y - u.y) * dy) / (len * len)))
      if (Math.hypot(u.x + dx * k - e.x, u.y + dy * k - e.y) < e.radius + 0.5) return true
    }
  }
  return false
}

/** 這個東西被打會不會招來 NPC 船員、防禦無人機（12 公尺內有看得到它的）：AI 異類吞食、攻擊前先看看 */
function npcWitness(g: Game, t: Ent): boolean {
  const z = g.world.zones[t.zone]
  for (const c of g.world.query(t.zone, t.x, t.y, 12)) {
    if (c === t || !c.alive || c.owner !== NEUTRAL || c.pilot || (c.def.ai !== 'crew' && c.def.ai !== 'drone')) continue
    if (!z.nav || z.nav.los(c.x, c.y, t.x, t.y, true)) return true
  }
  return false
}

function itemSlot(u: Ent, id: string): number {
  return u.inv ? u.inv.findIndex((x) => x?.id === id) : -1
}

function vendorWith(g: Game, p: GamePlayer, u: Ent, pred: (ref: string, s: StockState) => boolean): { v: Ent; item: string } | null {
  let best: { v: Ent; item: string } | null = null
  let bd = Infinity
  for (const v of g.world.inZone(u.zone)) {
    if (!v.alive || !v.data.vendor || !v.data.stock) continue
    for (const s of v.data.stock as StockState[]) {
      if (s.count <= 0 || g.time < s.availAt || !pred(v.data.vendor as string, s)) continue
      const d = dist2(u, v)
      if (d < bd) {
        bd = d
        best = { v, item: s.item }
      }
    }
  }
  void p
  return best
}

function randomRoomPoint(g: Game, u: Ent, types?: Set<string>): { x: number; y: number } | null {
  const z = g.world.zones[u.zone]
  const all = z.layout?.rooms ?? []
  const pref = types ? all.filter((r) => types.has(r.spec.type)) : all
  const rooms = pref.length ? pref : all
  if (!rooms.length || !z.nav) return null
  const r = g.world.rng.pick(rooms)
  return z.nav.nearestOpen(r.cx + g.world.rng.range(-1.5, 1.5), r.cy + g.world.rng.range(-1.5, 1.5))
}

// ───────── 目標執行 ─────────

function pursue(g: Game, p: GamePlayer, u: Ent, b: Brain): boolean {
  const goal = b.goal
  if (!goal) return false
  if (g.time > goal.until) {
    b.goal = null
    return false
  }
  switch (goal.k) {
    case 'buy':
    case 'results': {
      const v = g.world.get(goal.vendor)
      if (!v || !v.alive || v.zone !== u.zone) return (b.goal = null), false
      const r = VENDOR_RANGE + v.radius - 0.3
      if (dist2(u, v) > r * r) {
        if (!goal.sent || u.order?.k !== 'move') {
          cmd(g, p, { k: 'move', x: v.x, y: v.y })
          goal.sent = true
        }
        return true
      }
      cmd(g, p, { k: 'buy', e: v.id, a: goal.k === 'buy' ? goal.item : 'testResults' })
      // 救生艙憑證：領到就要原地站好 4 秒（還在走向裝置的移動命令會讓準備失敗）
      if (goal.k === 'buy' && goal.item === 'escapePass') cmd(g, p, { k: 'hold' })
      if (goal.k === 'results') b.boughtFrom.add(v.id)
      b.goal = null
      return true
    }
    case 'goto':
    case 'flee': {
      if (Math.hypot(u.x - goal.x, u.y - goal.y) < 1.2) return (b.goal = null), false
      if (!goal.sent || !u.order || u.order.k !== 'move') {
        cmd(g, p, { k: 'move', x: goal.x, y: goal.y })
        goal.sent = true
      }
      return true
    }
    case 'hunt': {
      const t = g.world.get(goal.e)
      if (!t || !t.alive || t.zone !== u.zone || !p.view.visible.has(t.id)) return (b.goal = null), false
      // 範圍、穿透武器：目標旁邊（彈道上）有人、NPC 船員或無人機時先不開火（不誤傷、不招來無人機），等目標走開
      if (splashRisk(g, p, u, t)) {
        u.data.holdFire = g.time + 1
        if (u.order?.k === 'attack') cmd(g, p, { k: 'stop' })
        return true
      }
      if (u.order?.k !== 'attack' || u.order.e !== t.id) cmd(g, p, { k: 'attack', e: t.id })
      return true
    }
    case 'cast': {
      const t = g.world.get(goal.e)
      if (!t || !t.alive || t.zone !== u.zone || !p.view.visible.has(t.id)) return (b.goal = null), false
      if (u.cast) return true
      const ab = abilityDef(goal.slot !== undefined ? (itemDef(u.inv?.[goal.slot]?.id ?? '')?.use ?? '') : goal.a)
      const range = (ab?.range ?? 1.4) + u.radius + t.radius - 0.2
      if (dist2(u, t) > range * range) {
        if (u.order?.k !== 'follow' || u.order.e !== t.id) cmd(g, p, { k: 'follow', e: t.id })
        return true
      }
      if (goal.slot !== undefined) cmd(g, p, { k: 'use', s: goal.slot, e: t.id })
      else cmd(g, p, { k: 'cast', a: goal.a, e: t.id })
      b.skip.set(t.id, g.time + 20)
      b.goal = null
      return true
    }
  }
}

// ───────── 決策 ─────────

function thinkCrew(g: Game, p: GamePlayer, u: Ent, b: Brain): void {
  const near = visibleEnts(g, p, u, 10)
  // 記下看到的人在哪裡（自己的視野）：拿著檢測器時去找
  for (const e of visibleEnts(g, p, u, 18)) {
    if (!looksPerson(e)) continue
    const n = seenName(g, e)
    if (n) b.seen.set(n, { zone: e.zone, x: e.x, y: e.y, t: g.time })
  }
  // 察覺威脅：看到玩家的怪物形態，或剛被攻擊
  if (near.some((e) => e.owner >= 0 && (isFoe(g, p, e) || e.tags.has('mutantForm'))) || g.time - u.lastDamageTime < 3) b.alarmAt = g.time
  // 受傷過重：逃
  if (u.hp < u.maxHp * 0.3 && g.time - u.lastDamageTime < 4) {
    const kit = ['traumaKit', 'mediSwarm'].map((id) => itemSlot(u, id)).find((s) => s >= 0)
    if (kit !== undefined && kit >= 0) cmd(g, p, { k: 'use', s: kit })
    const pt = randomRoomPoint(g, u)
    if (pt) b.goal = { k: 'flee', ...pt, until: g.time + 8 }
    return
  }
  // 被 NPC（船員、無人機…）打：躲開，不追著打（NPC 的仇恨會過期；追著打只會一直續仇，最後被打死）
  const npc = npcAttacker(g, p, u, b)
  if (npc) {
    const pt = awayFrom(g, u, npc, 7)
    if (pt) b.goal = { k: 'flee', ...pt, until: g.time + 5 }
    return
  }
  // 反擊：只打「真的在打我」的（怪物形態、敵對生物，或看起來是人卻瞄準我打了好幾下的）；誤傷不還手
  const attacker = realAttacker(g, p, u, b)
  if (attacker) {
    b.goal = { k: 'hunt', e: attacker.id, until: g.time + 10 }
    return
  }
  // 簡單難度：玩家的怪物形態不主動開火（被打才還手，上面處理），太近就躲開；無主的怪物照打
  const foes = near.filter((e) => isFoe(g, p, e) && !spared(g, e))
  if (easy(g) && !foes.length) {
    const scary = nearest(u, near.filter((e) => spared(g, e) && isFoe(g, p, e) && dist2(u, e) < 6 * 6))
    if (scary) {
      const pt = randomRoomPoint(g, u)
      if (pt) b.goal = { k: 'flee', ...pt, until: g.time + 8 }
      return
    }
  }
  const foe = nearest(u, foes)
  if (foe && u.def.attack) {
    b.goal = { k: 'hunt', e: foe.id, until: g.time + 10 }
    return
  }
  // 驗血指認出來的人：看到就開火（簡單難度不指認，b.accused 一直是空的）
  if (b.accused && u.def.attack) {
    // 只看外觀（全像分身看起來就是本人；用 isMain 會讓 AI 不打分身，等於幫大家分辨真假）
    const t = near.find((e) => looksPerson(e) && e.owner >= 0 && e.owner !== p.slot && seenName(g, e) === b.accused)
    if (t) {
      b.goal = { k: 'hunt', e: t.id, until: g.time + 10 }
      return
    }
  }
  const watched = watchedNear(g, p, u, b)
  // 驗血
  const sampling = gitStep(g, p, u, b)
  if (sampling === true) return
  // 沒事做的時候遠遠跟著嫌疑人（9–11 公尺：看得到他，又不會變成他身邊落單、最好下手的那一個）：他一變身或對人出手就看得到
  if (watched && !sampling) {
    if (dist2(u, watched) <= WATCH_FAR * WATCH_FAR) return
    const d = Math.sqrt(dist2(u, watched))
    const k = (d - WATCH_NEAR) / d
    const pt = g.world.zones[u.zone].nav?.nearestOpen(u.x + (watched.x - u.x) * k, u.y + (watched.y - u.y) * k)
    if (pt) {
      b.goal = { k: 'goto', ...pt, until: g.time + 5 }
      return
    }
  }
  // 防護服（依各自的習慣）
  const plan = suitPlanOf(g, p)
  const calm = g.time - b.alarmAt > 60 && u.hp >= u.maxHp * 0.6
  if (u.suit) {
    // 平常穿著的人：在休息處、沒有威脅時脫下來喘口氣
    if (plan === 'casual' && calm && resting(g, u) && g.time - b.suitAt > 20 && u.abilities.includes('suit.drop')) {
      b.suitAt = g.time
      cmd(g, p, { k: 'cast', a: 'suit.drop' })
      return
    }
  } else if (u.tags.has('personnel')) {
    const wantSuit =
      plan === 'always' ||
      (plan === 'casual' && (!calm || !resting(g, u))) ||
      (plan === 'late' && (g.time >= ((p.data.botSuitLateAt as number | undefined) ?? 0) || g.time - b.alarmAt < 30))
    if (wantSuit) {
      const have = u.inv?.findIndex((x) => !!x && !!itemDef(x.id)?.suit) ?? -1
      if (have >= 0 && (g.time - b.suitAt > 8 || !calm)) {
        b.suitAt = g.time
        cmd(g, p, { k: 'use', s: have })
        return
      }
      if (have < 0 && !p.data.botSuitTried) {
        const v = vendorWith(g, p, u, (ref) => SUIT_VENDORS.has(ref))
        if (v) {
          p.data.botSuitTried = true
          b.goal = { k: 'buy', vendor: v.v.id, item: v.item, until: g.time + 40 }
          return
        }
      }
    }
  }
  // 末日期間在翠原星地表：往其他人身邊靠（落單最容易被異類下手）
  if (doomNow(g) && regroup(g, p, u, b)) return
  // 拿著檢測器還差人：這個站好一陣子都找不到人就開船換站；否則去找人（最後看到某人的地方，或一間一間房間找），不是隨便晃
  if (sampling && wantTrip(g, p, u, b) && startTrip(g, p, u, b, sampling)) return
  if (sampling && seekPeople(g, u, b, sampling)) return
  wander(g, p, u, b, plan === 'casual' ? REST_ROOMS : undefined)
}

/**
 * 末日期間：身邊 6 公尺內沒有別人，就往看得到（或最後看到）的人靠過去（不分是誰：人類 AI 不知道誰是異類，只是不落單）。
 * 回傳 true = 這一輪在靠過去
 */
function regroup(g: Game, p: GamePlayer, u: Ent, b: Brain): boolean {
  if (u.id !== p.main) return false
  const people = visibleEnts(g, p, u, 14).filter((e) => looksPerson(e) && e.owner !== p.slot)
  if (people.some((e) => dist2(e, u) < 6 * 6)) return false
  let at: { x: number; y: number } | null = nearest(u, people)
  if (!at) {
    let t = -1
    for (const s of b.seen.values()) {
      if (s.zone !== u.zone || g.time - s.t >= 60 || s.t <= t) continue
      at = s
      t = s.t
    }
  }
  if (!at || Math.hypot(at.x - u.x, at.y - u.y) < 3) return false
  const pt = g.world.zones[u.zone].nav?.nearestOpen(at.x + g.world.rng.range(-2, 2), at.y + g.world.rng.range(-2, 2))
  if (!pt) return false
  b.goal = { k: 'goto', ...pt, until: g.time + 8 }
  return true
}

/** 看得到的、正在盯著的嫌疑人（間接推論出來的；名字和抽血時看到的一樣）*/
function watchedNear(g: Game, p: GamePlayer, u: Ent, b: Brain): Ent | undefined {
  if (!b.watch || g.time >= b.watchUntil || b.accused) return undefined
  return visibleEnts(g, p, u, 12).find((e) => looksPerson(e) && e.owner >= 0 && e.owner !== p.slot && seenName(g, e) === b.watch)
}

/** 盯著的嫌疑人當面對人出手 = 硬證據：改成指認、開火。回傳 true = 這一輪已經下了目標 */
function watchCaught(g: Game, p: GamePlayer, u: Ent, b: Brain): boolean {
  if (!u.def.attack) return false
  const w = watchedNear(g, p, u, b)
  if (!w || !attacksPerson(g, w)) return false
  b.accused = b.watch
  b.accusedAll.add(b.watch)
  b.watch = ''
  say(g, p, 'play1.bot.accuse', { name: b.accused })
  b.goal = { k: 'hunt', e: w.id, until: g.time + 10 }
  return true
}

/**
 * 看得到 e 正在攻擊一個看起來是人的玩家：只看動作與目標（快照裡本來就有的 st／tg）。
 * 只算攻擊動作，不算施法（抽血、治療也是對著人施法）
 */
function attacksPerson(g: Game, e: Ent): boolean {
  if (e.anim !== 2) return false
  const t = g.world.get(e.animTarget)
  return !!t && t !== e && t.alive && t.owner >= 0 && t.owner !== e.owner && looksPerson(t)
}

/**
 * 簡單練習局：真人玩家（新手）的怪物形態不主動開火（被打才還手，見上面的反擊）；AI 異類照打，簡單局的人類方才贏得了。
 * 簡單難度只在單機練習（只有一位真人）出現，打不打 AI 的怪物不會透露任何真人不知道的事
 */
function spared(g: Game, e: Ent): boolean {
  // 多人房的簡單難度：所有玩家都一樣（分真人、AI 會讓人看出哪隻怪物是真人）
  return easy(g) && e.owner >= 0 && (!g.practice || !g.players[e.owner]?.bot)
}

/** 檢測器樣本上已經記下的名字（抽血者看到的樣子，和介面上顯示的一樣）*/
function sampleNames(u: Ent, slot: number): string[] {
  const d = u.inv?.[slot]?.data as { sample?: { names?: string[] } } | undefined
  return d?.sample?.names ?? []
}

/** 看起來是一名玩家本人（主單位，或看起來就是主單位的分身）：只看外觀，不用 isMain／真正的擁有者這類隱藏資訊 */
function looksPerson(e: Ent): boolean {
  if (!(e.isMain || !!e.data.looksMain) || !looksHuman(e)) return false
  const fake = e.data.fake as { owner: number } | undefined
  return (fake ? fake.owner : e.anon ? -1 : e.owner) >= 0
}

/** 每多抽一份樣本最多等多久（秒）：找不到理想的人（複驗時要的嫌疑人／非嫌疑人）就放寬，誰都抽 */
const DRAW_PATIENCE = 90
/** 一局最多拿幾支檢測器（開局帶的也算）*/
const MAX_SAMPLERS = 3
/** 看到某人之後多久內還會去那裡找他（秒）*/
const SEEN_TTL = 120

/** 抽血要不要這個人：2 = 優先、1 = 可以、0 = 不要（已抽過，或複驗時會讓樣本裡不只一名嫌疑人）*/
type Want = (name: string) => 0 | 1 | 2

function sampleWant(g: Game, b: Brain, drawn: string[]): Want {
  const relaxed = g.time - b.drawAt > DRAW_PATIENCE
  const sus = (n: string) => (b.suspects.get(n) ?? 0) > 0 && !b.cleared.has(n)
  const anySus = [...b.suspects.keys()].some(sus)
  if (!anySus) return (n) => (drawn.includes(n) ? 0 : b.tested.has(n) && !relaxed ? 1 : 2)
  // 複驗縮小範圍：一份樣本只放一名嫌疑人，其餘是自己、驗過乾淨的人或其他人
  const susDrawn = drawn.filter(sus).length
  const otherDrawn = drawn.length - susDrawn
  return (n) => {
    if (drawn.includes(n)) return 0
    if (relaxed) return 1
    if (sus(n)) return susDrawn ? 0 : 2
    if (susDrawn) return 2
    return otherDrawn < 2 ? 1 : 0
  }
}

/**
 * 驗血流程：放解析器 → 領報告 → 拿著檢測器就抽看得到的人（沒有就抽自己）→ 需要時去買檢測器。
 * 回傳 true = 這一輪已經下了指令；Want = 手上的檢測器還差人（交給 seekPeople 去找）；false = 沒事
 */
function gitStep(g: Game, p: GamePlayer, u: Ent, b: Brain): boolean | Want {
  const res = itemSlot(u, 'gitResolver')
  if (res >= 0) {
    cmd(g, p, { k: 'use', s: res, x: u.x + 0.8, y: u.y })
    return true
  }
  // 自己放的解析器一定看得到（自己的東西）；開機好了就去領報告
  const mine = g.world
    .inZone(u.zone)
    .find((e) => e.alive && e.data.vendor === 'gitResolver' && e.owner === p.slot && !b.boughtFrom.has(e.id) && p.view.visible.has(e.id))
  if (mine && ((mine.data.stock as StockState[] | undefined)?.some((s) => s.count > 0 && g.time >= s.availAt) ?? false)) {
    b.goal = { k: 'results', vendor: mine.id, until: g.time + 30 }
    return true
  }
  const sampler = itemSlot(u, 'geneSampler')
  if (sampler < 0) {
    b.hadSampler = false
    // 解析器還在開機：等報告，不急著買下一支
    if (mine) return false
    if (!wantSampler(g, b)) return false
    const v = vendorWith(g, p, u, (_ref, s) => s.item === 'geneSampler')
    if (!v) return false
    // 沒買到（走不到、被搶光）就晚點再試
    b.buyAt = g.time + 45
    b.goal = { k: 'buy', vendor: v.v.id, item: v.item, until: g.time + 60 }
    return true
  }
  // 抽血的冷卻（3 秒）還沒好：等一下，現在下指令會被直接丟掉
  const ab = abilityDef('ab.item.geneSampler')
  if ((ab && !cdReady(g, u, ab)) || (u.inv![sampler]!.cdUntil ?? 0) > g.time) return true
  const drawn = sampleNames(u, sampler)
  if (!b.hadSampler) {
    b.hadSampler = true
    b.samplers++
    b.drawAt = g.time
    b.drawCount = drawn.length
    // 換站的計時從拿到檢測器開始算
    b.peopleAt = Math.max(b.peopleAt, g.time)
  }
  if (drawn.length !== b.drawCount) {
    b.drawCount = drawn.length
    b.drawAt = g.time
  }
  const want = sampleWant(g, b, drawn)
  // 簡單難度：抽完一份要停一陣子才抽下一份
  if (g.time < b.drawNext) return want
  // 看得到、還沒抽過的人（同名的人只抽一次）：先抽優先的，再抽可以的；都沒有就抽自己
  let best: Ent | null = null
  let bestW = 0
  let bestD = Infinity
  for (const e of visibleEnts(g, p, u, easy(g) ? EASY_DRAW_R : 18)) {
    if (!looksPerson(e) || (b.skip.get(e.id) ?? 0) >= g.time) continue
    const n = seenName(g, e)
    const w = n ? want(n) : 0
    const d = dist2(u, e)
    if (w > bestW || (w === bestW && w > 0 && d < bestD)) {
      best = e
      bestW = w
      bestD = d
    }
  }
  // 附近還有可以抽的別人：不用換站
  if (best && bestW > 0) b.peopleAt = g.time
  const selfW = want(seenName(g, u) || p.name)
  const t = bestW === 2 || (best && bestW >= selfW) ? best : selfW > 0 ? u : null
  if (t) {
    b.goal = { k: 'cast', a: 'ab.item.geneSampler', e: t.id, slot: sampler, until: g.time + 15 }
    if (easy(g)) b.drawNext = g.time + EASY_DRAW_GAP
    return true
  }
  return want
}

/**
 * 要不要（再）拿一支檢測器：第一支一定要；有感染報告但還認不出是誰就複驗縮小範圍；
 * 沒有嫌疑人時，最近看到還沒驗過的人才再驗（同一批人重驗不會有新消息）；指認了就不用再驗
 */
function wantSampler(g: Game, b: Brain): boolean {
  if (g.time < b.buyAt) return false
  // 簡單難度：開局晚一點才去買第一支；有感染報告但還認不出是誰時最多再複驗一次（只會指認 AI，見 readReports）
  if (easy(g)) {
    if (g.time < EASY_FIRST_SAMPLER) return false
    if (b.samplers === 0) return true
    return g.practice && b.samplers < EASY_MAX_SAMPLERS && !b.accused && b.reported > 0 && [...b.suspects.keys()].some((n) => !b.cleared.has(n))
  }
  if (b.samplers === 0) return true
  if (b.accused || b.samplers >= MAX_SAMPLERS || !b.reported) return false
  if ([...b.suspects.keys()].some((n) => !b.cleared.has(n))) return true
  for (const [n, s] of b.seen) if (g.time - s.t <= SEEN_TTL && !b.tested.has(n) && !b.selfNames.has(n)) return true
  return false
}

/** 拿著檢測器、附近沒有要抽的人：去最後看到要抽的人的地方；沒有線索就換一間房間找 */
function seekPeople(g: Game, u: Ent, b: Brain, want: Want): boolean {
  if (u.order) return true
  let best: { name: string; x: number; y: number; t: number; w: number } | null = null
  for (const [name, s] of b.seen) {
    if (s.zone !== u.zone || g.time - s.t > SEEN_TTL) {
      if (g.time - s.t > SEEN_TTL) b.seen.delete(name)
      continue
    }
    const w = want(name)
    if (w && (!best || w > best.w || (w === best.w && s.t > best.t))) best = { name, ...s, w }
  }
  if (best) {
    // 去過就從記憶裡拿掉（人還在的話，到了會再看到）
    b.seen.delete(best.name)
    b.goal = { k: 'goto', x: best.x, y: best.y, until: g.time + 20 }
    return true
  }
  const pt = randomRoomPoint(g, u)
  if (!pt) return false
  b.goal = { k: 'goto', ...pt, until: g.time + 25 }
  return true
}

/** 抽血時看到的名字（git.ts 的 shownName 同一套規則：偽裝就是偽裝對象，匿名形態沒有名字）*/
function seenName(g: Game, e: Ent): string {
  const fake = e.data.fake as { owner: number; name: string } | undefined
  if (fake) return fake.owner >= 0 ? (g.players[fake.owner]?.name ?? fake.name) : ''
  if (e.anon) return ''
  return g.players[e.owner]?.name || e.name
}

/**
 * 讀自己新拿到的驗血報告：在全體頻道公布結果（系統 key＋參數，client 依語言顯示），
 * 有感染時把名單上的其他人記為嫌疑；只剩一個最可疑的人就公開指認、看到就開火。
 */
function readReports(g: Game, p: GamePlayer, b: Brain): void {
  const reports = p.gitReports
  while (b.reported < reports.length) {
    const r = reports[b.reported++]
    const names = r.names.filter((n) => !!n)
    if (!names.length) continue
    const key = r.result + ':' + [...names].sort().join('|')
    if (b.seenReports.has(key)) continue
    b.seenReports.add(key)
    // 「\u0001形態 id」是匿名形態的樣本標記（不是人名）：AI 指認不了、也追打不了，不列入嫌疑
    const people = names.filter((n) => !n.startsWith('\u0001') && !b.selfNames.has(n))
    for (const n of people) b.tested.add(n)
    // 名單兩種語言都送（匿名形態依語言換成形態名）
    const list = sampleListArgs(names)
    if (r.result === 'clean') {
      for (const n of names) {
        b.cleared.add(n)
        b.suspects.delete(n)
      }
      announceResult(g, p, 'play1.bot.gitClean', list, key)
      // 乾淨：過一陣子再驗別人
      b.buyAt = Math.max(b.buyAt, g.time + 90)
    } else if (r.result === 'infected') {
      b.infected.push(people)
      for (const n of people) if (!b.cleared.has(n)) b.suspects.set(n, (b.suspects.get(n) ?? 0) + 1)
      announceResult(g, p, 'play1.bot.gitInfected', list, key)
      // 還認不出是誰：馬上再驗一次縮小範圍
      b.buyAt = g.time + 20
    } else {
      // 錯誤、離線也照樣說出來：只有部分結果會公布的話，「沒說話」本身就是線索
      announceResult(g, p, r.result === 'error' ? 'play1.bot.gitError' : 'play1.bot.gitOffline', list, key)
      b.buyAt = Math.max(b.buyAt, g.time + 90)
      continue
    }
    // 簡單難度：不公開指認（也就不會追著指認的人開火）。
    // 硬證據（某份有感染的報告扣掉自己與驗過乾淨的人只剩他）才指認、看到就開火；只靠兩份名單取交集的間接推論，
    // 只公開提醒、盯著他，不開火（第 6 輪審查 A P1：AI 補位只憑交集就處決了剛抽到異形、什麼都還沒做的真人）
    // 簡單練習局：只指認硬證據指向的 AI 異類（真人新手不會被 AI 指認、追打；AI 異類照樣抓得到，人類方才贏得了）
    const found = accuseTarget(b)
    const top = easy(g) ? (g.practice && found?.hard && isBotName(g, found.name) ? found : null) : found
    if (top?.hard && !b.accusedAll.has(top.name)) {
      b.accused = top.name
      b.accusedAll.add(top.name)
      if (b.watch === top.name) b.watch = ''
      say(g, p, 'play1.bot.accuse', { name: top.name })
    } else if (top && !top.hard && !b.accused && !b.watchedAll.has(top.name)) {
      b.watch = top.name
      b.watchUntil = g.time + WATCH_S
      b.watchedAll.add(top.name)
      say(g, p, 'play1.bot.suspect', { name: top.name })
    }
  }
}

/** 這個名字（別人眼中此刻的顯示名字）是 AI 玩家：簡單練習局只指認 AI（只有一位真人，不會透露任何他不知道的事）*/
function isBotName(g: Game, name: string): boolean {
  const q = g.allPlayers().find((x) => x.name === name)
  return !!q && q.bot
}

/** 盯著間接推論出來的嫌疑人多久（秒）；跟著他時保持的距離（公尺）*/
const WATCH_S = 300
const WATCH_NEAR = 9
const WATCH_FAR = 11

/**
 * 指認對象（只用自己的報告）：
 * (a) 某份有感染名單扣掉自己與驗過乾淨的人，只剩一人——硬證據（hard）：這份報告只可能是他；或
 * (b) 兩份有感染名單的交集扣掉驗過乾淨的人，只剩一人——間接推論：兩份名單裡可能各有一個不同的異類（異形和變種人、異類和他的眷屬），
 *     交集上的人不一定有問題，只公開提醒、盯著，不開火。
 * 好幾個人各自成立（例如異形和變種人都被驗到）時，硬證據優先；再來先挑出現在最多份有感染報告裡的人，並列就挑最新那份報告推出來的。
 */
function accuseTarget(b: Brain): { name: string; hard: boolean } | null {
  const live = (l: string[]) => l.filter((n) => !b.cleared.has(n) && !b.selfNames.has(n))
  const hits: { name: string; hard: boolean }[] = []
  const lists = b.infected.map(live)
  for (let i = 0; i < lists.length; i++) {
    if (lists[i].length === 1) hits.push({ name: lists[i][0], hard: true })
    for (let j = 0; j < i; j++) {
      const both = lists[i].filter((n) => lists[j].includes(n))
      if (both.length === 1) hits.push({ name: both[0], hard: false })
    }
  }
  let best: { name: string; hard: boolean } | null = null
  let bestN = 0
  for (const h of hits) {
    const c = lists.filter((l) => l.includes(h.name)).length
    if (!best || (h.hard && !best.hard) || (h.hard === best.hard && c >= bestN)) {
      best = h
      bestN = c
    }
  }
  return best
}

/**
 * 公布驗血結果。同一份結果（同樣的結果、同樣的名單）只公布一次：自己的由 seenReports 擋掉；
 * 別的 AI 已經在聽得到的地方公布過一模一樣的結果也不再重複（全體頻道的公開內容，不是隱藏資訊；只限同站聊天時看同一站）。
 */
function announceResult(g: Game, p: GamePlayer, key: string, args: Record<string, string>, result: string): void {
  const said = (g.data.botResultsSaid ??= new Map<string, Set<number>>()) as Map<string, Set<number>>
  const zone = g.mainOf(p)?.zone ?? -1
  let zones = said.get(result)
  if (zones && (!g.settings.localChat || zones.has(zone))) return
  if (!zones) said.set(result, (zones = new Set()))
  zones.add(zone)
  say(g, p, key, args)
}

/** AI 在全體頻道說話：走一般的聊天路由（名字、偽裝、只限同站等規則照舊），內容是 i18n 的系統 key */
function say(g: Game, p: GamePlayer, key: string, args: Record<string, string | number>): void {
  g.handleChat(p.slot, 'all', fmtKey(key, args))
}

function thinkEvil(g: Game, p: GamePlayer, u: Ent, b: Brain): void {
  const near = visibleEnts(g, p, u, 12)
  const crew = near.filter((e) => e.isMain && e.owner >= 0 && g.faction(g.players[e.owner]!) === 'crew' && looksHuman(e))
  const close = crew.filter((e) => dist2(e, u) < 8 * 8)
  const humanForm = looksHuman(u)
  const ready = (a: string) => {
    const ab = abilityDef(a)
    return !!ab && u.abilities.includes(a) && cdReady(g, u, ab) && (ab.mana ?? 0) <= u.mp
  }
  // 進化：EP 夠、附近沒有人類。簡單難度只進化到第一階（之後的形態太強，新手的人類方打不贏）
  const opts = g.evolveOptions(p).filter((o) => !easy(g) || (FORMS.get(o)?.tier ?? 0) <= EASY_MAX_TIER)
  if (opts.length && !crew.some((e) => dist2(e, u) < 12 * 12) && g.time >= b.evolveAt && u.zone !== 0) {
    b.evolveAt = g.time + 30
    cmd(g, p, { k: 'evolve', a: g.world.rng.pick(opts) })
    return
  }
  // 變種人：吞小動物累積 EP（人形與怪物形態都可以）。NPC 船員旁邊有其他船員、無人機看著就不吞（會被圍攻到死）
  if (ready('mut.devour')) {
    const food = nearest(u, near.filter((e) => !!e.def.devourEp && e.owner < 0 && e.alive && !e.isMain && !(e.def.ai === 'crew' && npcWitness(g, e))))
    if (food && !close.length) {
      b.goal = { k: 'cast', a: 'mut.devour', e: food.id, until: g.time + 10 }
      return
    }
  }
  // 開局寬限期（一般 120 秒、簡單 420 秒）內不感染、不主動變身攻擊、不主動攻擊；簡單難度兩次出手之間也一樣。被打照樣還手。
  // 一般難度末日開始後不再等：一局要分出勝負（大家都撤到翠原星地表上了）；簡單難度照舊（新手的第一局要贏得了）
  const doom = allOut(g)
  const holdOff = evilHoldOff(g, b)
  const strike = () => {
    b.struckAt = g.time
    b.strikes++
    if (easy(g)) b.strikeAt = g.time + EASY_STRIKE_GAP
  }
  // 記下看到的船員在哪裡（跟蹤落單者用）
  for (const e of crew) {
    const n = seenName(g, e)
    if (n) b.seen.set(n, { zone: e.zone, x: e.x, y: e.y, t: g.time })
  }
  // 簡單難度：只有主腦會去感染別人；眷屬不感染（不然寄生一個、多一個會寄生的，滾雪球把新手的人類方吃掉）
  const infect = holdOff || (easy(g) && p.spawnOf) ? undefined : ['xeno.parasite', 'mut.prion3', 'mut.prion2', 'mut.prion'].find((a) => ready(a))
  if (humanForm) {
    // 落單的人類就在眼前：異形先變身再寄生；變種人人形沒有感染技能，只能先進化。
    // 人形直接感染看起來就是一個人，不會招來 NPC；要變身的話，NPC 船員、無人機看著就先不變（會被圍攻）
    if (!holdOff && close.length === 1 && crew.length === 1 && (b.skip.get(close[0].id) ?? 0) < g.time) {
      if (infect) {
        b.goal = { k: 'cast', a: infect, e: close[0].id, until: g.time + 12 }
        strike()
        return
      }
      const form = ['xeno.form', 'xeno.spawnForm'].find((a) => ready(a))
      if (form && (doom || !npcWitness(g, close[0]))) {
        cmd(g, p, { k: 'cast', a: form })
        p.data.botShiftAt = g.time
        return
      }
    }
    // 被打就變身反擊（真的在打他才算；輻射裝外洩、範圍波及不算，免得在一群人面前自己現形）；末日期間直接變身開打
    if (realAttacker(g, p, u, b, 2, false) || (doom && crew.length)) {
      const form = ['xeno.form', 'xeno.spawnForm'].find((a) => ready(a))
      if (form) {
        cmd(g, p, { k: 'cast', a: form })
        p.data.botShiftAt = g.time
        return
      }
    }
    // 好一陣子沒出手：跟著一個船員（保持距離），等他落單（練習局不會整場沒事）
    if (!holdOff && stalk(g, p, u, b, crew)) return
    wander(g, p, u, b)
    return
  }
  // 怪物形態
  if (infect && close.length) {
    const t = nearest(u, close.filter((e) => (b.skip.get(e.id) ?? 0) < g.time && (doom || !npcWitness(g, e))))
    if (t) {
      b.goal = { k: 'cast', a: infect, e: t.id, until: g.time + 8 }
      strike()
      return
    }
  }
  // 太多人看到、或寄生完一陣子：變回人形
  const back = ['xeno.human', 'xeno.spawnHuman'].find((a) => ready(a))
  if (back && !doom && (crew.length >= 3 || (!crew.length && g.time - ((p.data.botShiftAt as number) ?? 0) > 25))) {
    cmd(g, p, { k: 'cast', a: back })
    return
  }
  // 沒人時下蛋
  if (!crew.length && ready('xeno.egg') && g.world.rng.chance(0.3)) {
    cmd(g, p, { k: 'cast', a: 'xeno.egg', x: u.x + 0.8, y: u.y })
    return
  }
  const foe = nearest(u, near.filter((e) => isFoe(g, p, e)))
  // 寬限期內（以及簡單難度在等下一次出手時）只有被打才還手；簡單難度平常也只在對方落單時主動攻擊
  const hit = !!realAttacker(g, p, u, b, 3, false)
  const bold = doom || (holdOff ? hit : easy(g) ? crew.length <= 1 || hit : crew.length <= 2 || p.tier >= 2)
  // NPC 船員、無人機看著的時候不主動開打（會被圍攻），被打才還手；末日期間不管
  if (foe && bold && (hit || doom || !npcWitness(g, foe))) {
    for (const a of u.abilities) {
      const ab = abilityDef(a)
      if (!ab || ab.target !== 'unit' || !ready(a) || ab.passiveBuff || a.startsWith('xeno.') || a.startsWith('mut.')) continue
      if (g.world.rng.chance(0.3)) {
        b.goal = { k: 'cast', a, e: foe.id, until: g.time + 6 }
        return
      }
    }
    b.goal = { k: 'hunt', e: foe.id, until: g.time + 12 }
    if (!hit) strike()
    return
  }
  // 一般難度末日期間怪物形態也去找人（平常以怪物形態跟著人只會被打）；簡單難度的第一次出手也會（一局不會整場沒事）
  if ((doom || (easy(g) && !holdOff)) && stalk(g, p, u, b, crew)) return
  wander(g, p, u, b)
}

/** 異類 AI 現在還不主動出手（開局寬限期、簡單難度兩次出手之間）；一般難度末日開始後不再等 */
function evilHoldOff(g: Game, b: Brain): boolean {
  return !allOut(g) && (g.time < (easy(g) ? EASY_EVIL_START : NORMAL_EVIL_START) || (easy(g) && g.time < b.strikeAt))
}

/**
 * 末日期間異類 AI 全力出手（不等寬限期、主動找人、看到人就變身開打）：只在一般難度。
 * 簡單難度末日期間照平常的節奏（出手之間照樣要隔 EASY_STRIKE_GAP），不會在末日突然大量感染
 */
function allOut(g: Game): boolean {
  return doomNow(g) && !easy(g)
}

/** 異類 AI 閒晃途中看到落單的船員（8 公尺內只有他、12 公尺內沒有別人）：放下閒晃，馬上考慮出手 */
function loneCrewNear(g: Game, p: GamePlayer, u: Ent): boolean {
  let close = 0
  let seen = 0
  for (const e of visibleEnts(g, p, u, 12)) {
    if (!e.isMain || e.owner < 0 || !looksHuman(e) || g.faction(g.players[e.owner]!) !== 'crew') continue
    seen++
    if (dist2(e, u) < 8 * 8) close++
  }
  return close === 1 && seen === 1
}

/** 異類多久沒出手就開始跟蹤落單者（秒；從上一次出手起算，開局寬限期過後才會）*/
const STALK_AFTER = 150
const EASY_STALK_AFTER = 300
/**
 * 主動跟蹤只用來保證中盤有一兩次看得見的行動（第 6 輪審查 A：練習局 31 分鐘沒有交鋒）：主腦出手滿這麼多次就不再主動跟蹤，
 * 眷屬不跟蹤（不然寄生一個、多一個會跟蹤的，滾雪球把整局吃掉）。末日期間不限
 */
const STALK_STRIKES = 2
/** 簡單難度：主腦只主動跟蹤到第一次出手（中盤有一次看得見的行動就好）*/
const EASY_STALK_STRIKES = 1

/** 這個異類 AI 現在會不會主動去找落單的船員（簡單難度的末日期間不找人：只在有人落單在身邊時出手，出手之間照樣隔 EASY_STRIKE_GAP）*/
function mayStalk(g: Game, p: GamePlayer, b: Brain): boolean {
  if (allOut(g)) return true
  if (p.spawnOf || (easy(g) && doomNow(g))) return false
  return b.strikes < (easy(g) ? EASY_STALK_STRIKES : STALK_STRIKES)
}

/**
 * 跟蹤：好一陣子沒出手的異類 AI 跟著一個船員走（隔幾公尺，挑身邊人最少的那個；看不到就去最後看到船員的地方），
 * 等他落單時由上面的「落單的人類就在眼前」出手。回傳 true = 這一輪在跟蹤
 */
function stalk(g: Game, p: GamePlayer, u: Ent, b: Brain, crew: Ent[]): boolean {
  // 一般難度末日開始後不等：大家都撤到翠原星地表，要去找人
  const doom = allOut(g)
  const quiet = easy(g) ? EASY_STALK_AFTER : STALK_AFTER
  if (!mayStalk(g, p, b) || (!doom && g.time - Math.max(b.struckAt, 0) < quiet) || g.time < b.stalkAt || u.id !== p.main) return false
  if (crew.length) {
    let best: Ent | null = null
    let bn = Infinity
    for (const e of crew) {
      const n = crew.filter((o) => o !== e && dist2(o, e) < 8 * 8).length
      if (n < bn || (n === bn && best && dist2(u, e) < dist2(u, best))) {
        best = e
        bn = n
      }
    }
    if (!best) return false
    const d = Math.sqrt(dist2(u, best))
    if (d < 4) return u.order ? false : true
    const k = (d - 3) / d
    const pt = g.world.zones[u.zone].nav?.nearestOpen(u.x + (best.x - u.x) * k, u.y + (best.y - u.y) * k)
    if (pt) b.goal = { k: 'goto', ...pt, until: g.time + 4 }
    return !!pt
  }
  // 看不到人：去最後看到船員的地方（末日期間沒有線索就隨便挑一間房間找）
  let at: { x: number; y: number; t: number } | null = null
  for (const s of b.seen.values()) if (s.zone === u.zone && g.time - s.t < SEEN_TTL && (!at || s.t > at.t)) at = s
  if (!at || Math.hypot(at.x - u.x, at.y - u.y) < 2) {
    const pt = doom ? randomRoomPoint(g, u) : null
    if (pt) {
      b.goal = { k: 'goto', ...pt, until: g.time + 20 }
      b.stalkAt = g.time + 6
      return true
    }
    b.stalkAt = g.time + 10
    return false
  }
  b.goal = { k: 'goto', x: at.x, y: at.y, until: g.time + 15 }
  b.stalkAt = g.time + 8
  return true
}

function wander(g: Game, p: GamePlayer, u: Ent, b: Brain, prefer?: Set<string>): void {
  if (u.order) return
  if (!g.world.rng.chance(0.4)) return
  const pt = randomRoomPoint(g, u, prefer && g.world.rng.chance(0.5) ? prefer : undefined)
  if (pt) b.goal = { k: 'goto', ...pt, until: g.time + 25 }
  void p
}

function stepBots(g: Game): void {
  if (g.ended) return
  const t = g.time
  for (const p of g.allPlayers()) {
    if (!p.bot || p.spectator) continue
    const b = brainOf(g, p)
    if (t < b.next) continue
    b.next = t + 0.5 + g.world.rng.range(0, 0.3)
    // 死亡模式投票：bots 一律選觀戰
    if (p.alive && g.votes.death && !g.votes.death.ballots.has(p.slot)) g.handleVote(p.slot, 'spectate')
    if (!p.alive) continue
    // 新的驗血報告：馬上公布（不等手上的目標做完）
    if (g.faction(p) === 'crew') {
      b.selfNames.add(p.name)
      readReports(g, p, b)
    }
    // 換站途中陣營變了（被轉化成異類的 spawn）：放棄換站（駕駛中的話下面會交回控制台）
    if (b.trip && g.faction(p) !== b.trip.side) abortTrip(g, b)
    const u = g.controlOf(p)
    if (!u || !u.alive || u.data.frozen || p.evolvingUntil > t || u.tags.has('cocoon')) continue
    // 人類方正在施法（抽血 3 秒）：別用新的指令打斷自己，除非正在挨打
    if (u.cast && !u.cast.channeling && g.faction(p) === 'crew' && t - u.lastDamageTime > 2) continue
    // 末日將至、正在換站（開船找人）：目標改成翠原星（撤離）
    if (b.trip && !b.trip.evac && doomNear(g)) evacRetarget(g, b)
    // 換站途中駕駛的船：開往目標站
    if (b.trip && u.id !== p.main && flyTrip(g, p, u, b)) continue
    // 誤站上控制台、接手了站點或船艇：交回控制（AI 只會在換站時駕駛自己搭的船），之後照常走開
    if (u.id !== p.main && spaceOf(g).pilots.get(u.id) === p.main) {
      cmd(g, p, { k: 'unpilot' })
      b.goal = null
      // 交還後先走離控制台幾公尺，免得閒晃的目標點又落在控制台旁、被接回去
      const body = g.world.get(p.main)
      const c = body ? consolePos(g, g.world.zones[body.zone]) : null
      if (body && c) {
        const a = Math.atan2(body.y - c.y, body.x - c.x) + g.world.rng.range(-0.6, 0.6)
        const nav = g.world.zones[body.zone].nav
        const pt = nav?.nearestOpen(c.x + Math.cos(a) * 3, c.y + Math.sin(a) * 3)
        if (pt) b.goal = { k: 'goto', ...pt, until: t + 8 }
      }
      continue
    }
    // 搭著救生艙（末日撤離）：設定航線飛往翠原星
    if (steerPod(g, p, u)) continue
    if (u.zone === 0) continue
    // 卡住了（有移動命令卻好幾秒沒前進，例如目的地被人或東西擋住）：放棄這個命令、重新決定，不會一直站在原地
    if (u.order?.k === 'move' && !u.cast) {
      if (Math.hypot(u.x - b.px, u.y - b.py) > 0.3) {
        b.px = u.x
        b.py = u.y
        b.pt = t
      } else if (t - b.pt > STUCK_S) {
        cmd(g, p, { k: 'stop' })
        b.goal = null
        b.pt = t
      }
    } else {
      b.px = u.x
      b.py = u.y
      b.pt = t
    }
    // 門控制器故障：停在故障門的門縫裡（被推擠、停下來讓人抽血、追擊時站定…）就先走出門縫，不在門縫裡逗留
    if (leaveDoorGap(g, p, u)) continue
    // 簡單練習局：拿著檢測器的真人走近，原地停一下讓他抽血
    if (easyPause(g, p, u, b)) continue
    // 末日將至：撤到翠原星地表（救生艙或開船）；已經在地表就躲隕擊的紅色警戒圈與輻射區
    if (evacStep(g, p, u, b)) continue
    // 換站途中（走去登船、在船艙裡等發射、到站下船）
    if (b.trip && stepTrip(g, p, u, b)) continue
    // 在停泊的船艙裡（不是換站）：走回艙門下船
    if (leaveCabin(g, p, u, b)) continue
    // 被打（真的在打他，不是波及；或被 NPC 打）：放下閒晃的目標，馬上決定要不要還手、躲開、變身
    //（異類開局寬限期內唯一會出手的情況；不然要等閒晃走完才反應）
    if (b.goal?.k === 'goto' && (realAttacker(g, p, u, b, 2, g.faction(p) === 'crew') || npcAttacker(g, p, u, b, 2))) b.goal = null
    // 異類閒晃途中遇到落單的船員：放下閒晃，馬上考慮出手（不然要等閒晃走完、人早就走遠了）
    if (g.faction(p) !== 'crew' && b.goal?.k === 'goto' && t >= b.loneNext && mayStalk(g, p, b) && !evilHoldOff(g, b) && loneCrewNear(g, p, u)) {
      b.goal = null
      // 沒出得了手（技能冷卻、有 NPC 看著…）也不要每一輪都打斷自己
      b.loneNext = t + 6
    }
    // 盯著的嫌疑人當面對人出手：馬上指認、開火（不等手上的目標做完）
    if (g.faction(p) === 'crew' && watchCaught(g, p, u, b)) continue
    if (pursue(g, p, u, b)) {
      // 追擊中仍會優先處理逃跑
      if (b.goal?.k !== 'flee' && u.hp < u.maxHp * 0.25 && g.faction(p) === 'crew') b.goal = null
      continue
    }
    if (g.faction(p) === 'crew') thinkCrew(g, p, u, b)
    else thinkEvil(g, p, u, b)
  }
}

// ───────── 末日撤離（第 6 輪審查 A P1：AI 不撤離，全員隨站點爆炸、平手）─────────

/** 末日將至：全場公告過「星區穩定度即將歸零」（末日前 60 秒），或末日已經開始（公開資訊）*/
export function doomNear(g: Game): boolean {
  const ev = g.data.events as EventState | undefined
  return !!ev && (!!ev.apoc || ev.apocWarned)
}

/** 末日已經開始（全場公告過）*/
function doomNow(g: Game): boolean {
  return !!(g.data.events as EventState | undefined)?.apoc
}

const verdanceZone = (g: Game): Zone | undefined => g.world.zones.find((z) => z.key === 'verdance' && z.alive)

/** 救生艙憑證領到後要原地準備幾秒（space.ts startPod：4 秒；多等一點點）與冷卻（100 秒）*/
const POD_PREP_S = 4.6
const POD_CD_S = 100
/** 每座站最多試幾次救生艙（被打斷、被搶光…），之後改搭船 */
const POD_TRIES = 3

/**
 * 末日撤離：救生艙優先（走到救生艙裝置領憑證、原地等 4 秒），沒有裝置或一直失敗就開停泊的船過去（換站流程，trip.evac）；
 * 已經在換站途中就把目標改成翠原星。在翠原星地表上就躲隕擊與輻射區（dodgeSurface）。回傳 true = 這一輪只做這件事
 */
function evacStep(g: Game, p: GamePlayer, u: Ent, b: Brain): boolean {
  if (!doomNear(g)) return false
  const vz = verdanceZone(g)
  if (!vz) return false
  if (u.zone === vz.id) {
    b.evac = null
    return dodgeSurface(g, p, u, b)
  }
  if (u.id !== p.main || u.zone === SPACE_ZONE) return false
  const z = g.world.zones[u.zone]
  // 船艙裡、換站途中：交給換站流程（駕駛、下船；目標已經由 evacRetarget 改成翠原星）
  if (!z?.alive || !z.station || z.data.ship || b.trip) return false
  if (!b.evac) {
    b.evac = { stage: 'pod', at: g.time, podTries: 0 }
    // 第一個開始撤離的人類方 AI 說一聲（提醒真人：要撤了）
    if (g.faction(p) === 'crew' && !g.data.botEvacSaid) {
      g.data.botEvacSaid = true
      say(g, p, 'play1.bot.evac', {})
    }
  }
  const cd = (p.data.podCd as number | undefined) ?? 0
  // 救生艙準備中：原地不動（移動或挨重擊就失敗）
  if (cd > g.time && g.time < cd - POD_CD_S + POD_PREP_S) {
    b.goal = null
    if (u.order?.k !== 'hold') cmd(g, p, { k: 'hold' })
    return true
  }
  if (cd <= g.time && b.evac.podTries < POD_TRIES) {
    if (b.goal?.k === 'buy' && b.goal.item === 'escapePass') return pursue(g, p, u, b)
    const v = vendorWith(g, p, u, (ref, st) => ref === 'escapePod' && st.item === 'escapePass')
    if (v) {
      b.evac.podTries++
      b.goal = { k: 'buy', vendor: v.v.id, item: 'escapePass', until: g.time + 40 }
      return pursue(g, p, u, b)
    }
  }
  // 沒有救生艙裝置（或一直失敗）：開停泊的船過去
  const inst = dockableZone(g, vz) ? freeShipAt(g, p, u, true) : null
  if (inst) {
    b.evac.stage = 'ship'
    b.trip = { from: u.zone, to: vz.id, ship: inst.key, stage: 'walk', at: g.time, start: g.time, side: g.faction(p), sx: 0, sy: 0, st: g.time, evac: true }
    b.goal = null
    return stepTrip(g, p, u, b)
  }
  return false
}

/** 換站途中遇上末日：目標改成翠原星（停靠失敗的紀錄、改目標的次數重新算）*/
function evacRetarget(g: Game, b: Brain): void {
  const vz = verdanceZone(g)
  const trip = b.trip
  if (!vz || !trip) return
  trip.evac = true
  if (trip.to !== vz.id) {
    trip.to = vz.id
    trip.at = g.time
    trip.tries = 0
    trip.retargets = 0
    trip.failed = undefined
    trip.via = undefined
    trip.scan = undefined
  }
}

/** 搭著救生艙：還沒設定航線（或不是翠原星）就設成翠原星。回傳 true = 控制的是救生艙（這一輪不做別的）*/
function steerPod(g: Game, p: GamePlayer, u: Ent): boolean {
  const pod = spaceOf(g).pods.get(u.id)
  if (!pod) return false
  const vz = verdanceZone(g)
  const se = vz ? g.world.get(vz.spaceEnt) : undefined
  const ab = abilityDef('pod.trajectory')
  if (vz && se && pod.target !== vz.id && (!ab || cdReady(g, u, ab))) cmd(g, p, { k: 'cast', a: 'pod.trajectory', e: se.id })
  return true
}

/**
 * 翠原星地表：站在（或正要走進）隕擊的紅色警戒圈、輻射區裡就往最近的安全點跑。落點是全場公開的預警（stations.ts meteorWarnings），
 * 輻射區是地上看得到的東西。回傳 true = 這一輪在躲
 */
function dodgeSurface(g: Game, p: GamePlayer, u: Ent, b: Brain): boolean {
  const z = g.world.zones[u.zone]
  if (!z.nav) return false
  const warns = meteorWarnings(g).filter((w) => w.zone === u.zone)
  const fields = g.world.inZone(u.zone).filter((e) => e.alive && e.def.id === 'hz.radField')
  if (!warns.length && !fields.length) return false
  const bad = (x: number, y: number) =>
    warns.some((w) => Math.hypot(x - w.x, y - w.y) < IMPACT_R + 1.5) || fields.some((f) => Math.hypot(x - f.x, y - f.y) < RAD_FIELD_R + 1)
  const goal = b.goal && 'x' in b.goal ? b.goal : null
  const goalBad = !!goal && bad(goal.x, goal.y)
  if (!bad(u.x, u.y) && !goalBad) return false
  if (goal?.k === 'flee' && !goalBad) return pursue(g, p, u, b)
  let best: { x: number; y: number } | null = null
  let bd = Infinity
  for (const r of [4, 8, 12, 17, 23]) {
    for (let i = 0; i < 16; i++) {
      const a = (i / 16) * Math.PI * 2
      const q = z.nav.nearestOpen(u.x + Math.cos(a) * r, u.y + Math.sin(a) * r)
      if (!q || bad(q.x, q.y)) continue
      const d = Math.hypot(q.x - u.x, q.y - u.y)
      if (d < bd) {
        bd = d
        best = q
      }
    }
    if (best) break
  }
  if (!best) return false
  b.goal = { k: 'flee', ...best, until: g.time + 10 }
  return pursue(g, p, u, b)
}

/**
 * 簡單練習局：看得到的真人（主單位）走到 EASY_PAUSE_R 公尺內、手上有還沒抽滿的基因檢測器、樣本裡還沒有這個 AI，
 * 看起來是人的 AI 就原地停下 EASY_PAUSE_S 秒，讓新手抽得到血（每個 AI 至少隔 EASY_PAUSE_GAP 秒才會再停）。
 * 停下期間挨打就不等了。只用來配合練習，不分陣營（異類 AI 也一樣停），所以停不停不透露任何身分。回傳 true = 這一輪停著
 */
function easyPause(g: Game, p: GamePlayer, u: Ent, b: Brain): boolean {
  const t = g.time
  if (b.pauseUntil > t) {
    if (t - u.lastDamageTime < 2 || u.id !== p.main) {
      b.pauseUntil = 0
      return false
    }
    if (u.order) cmd(g, p, { k: 'stop' })
    return true
  }
  if (!g.practice || !easy(g) || t < b.pauseNext || b.trip || u.id !== p.main || u.cast || !looksHuman(u) || t - u.lastDamageTime < 3) return false
  for (const e of visibleEnts(g, p, u, EASY_PAUSE_R)) {
    if (!e.isMain || e.owner < 0 || e.owner === p.slot) continue
    const q = g.players[e.owner]
    if (!q || q.bot || q.spectator || !q.alive || q.main !== e.id) continue
    const it = e.inv?.find((x) => x?.id === 'geneSampler')
    if (!it) continue
    // 樣本裡已經有這個 AI（抽血者眼中的身分 key，git.ts 的 identityKey）：不用停
    const sm = (it.data as { sample?: { slots?: number[]; keys?: string[] } } | undefined)?.sample
    const keys = sm?.keys ?? (sm?.slots ?? []).map((x) => 'p' + x)
    if (keys.includes('p' + p.slot)) continue
    b.pauseUntil = t + EASY_PAUSE_S
    b.pauseNext = t + EASY_PAUSE_GAP
    b.goal = null
    cmd(g, p, { k: 'stop' })
    return true
  }
  return false
}

/**
 * 門控制器故障期間，沒在走動的 AI 單位站在週期開關的門縫裡：往自己比較靠近的那一側走出門縫（門格外緣再退一點）。
 * 正在走路的單位交給移動系統的等門邏輯（movement.ts doorGate）。回傳 true = 這一輪只做這件事
 */
function leaveDoorGap(g: Game, p: GamePlayer, u: Ent): boolean {
  if (u.anim === 1) return false
  const z = g.world.zones[u.zone]
  const L = z.layout
  if (!L || !z.nav) return false
  for (const inst of L.doors) {
    const d = z.doors[inst.index]
    if (!d?.cycling || d.locked || d.broken) continue
    if (Math.abs(inst.x - u.x) > inst.width / 2 + 1.5 || Math.abs(inst.y - u.y) > inst.width / 2 + 1.5) continue
    if (!inDoorGap(inst, u.x, u.y, u.radius)) continue
    const a = doorAxes(inst, u.x, u.y)
    const side = a.n >= 0 ? 1 : -1
    const back = 0.5 + u.radius + 0.15
    const half = Math.max(0, inst.width / 2 - 0.5)
    const lat = Math.max(-half, Math.min(half, a.t))
    const x = inst.horizontal ? inst.x + lat : inst.x + side * back
    const y = inst.horizontal ? inst.y + side * back : inst.y + lat
    cmd(g, p, { k: 'move', x, y })
    return true
  }
  return false
}

/** 主單位在停泊中的船艙裡：設定走向艙門的目標（exitShip 在艙門上觸發）。回傳 true = 這一輪只做這件事 */
function leaveCabin(g: Game, p: GamePlayer, u: Ent, b: Brain): boolean {
  if (u.id !== p.main) return false
  const z = g.world.zones[u.zone]
  const key = z.data.ship as string | undefined
  const inst = key ? spaceOf(g).ships.get(key) : undefined
  const exit = z.layout?.exits[0]
  if (!inst?.docked || !exit) return false
  if (Math.hypot(u.x - exit.x, u.y - exit.y) > 0.3 && (u.order?.k !== 'move' || u.order.x !== exit.x || u.order.y !== exit.y)) cmd(g, p, { k: 'move', x: exit.x, y: exit.y })
  b.goal = null
  return true
}

/** 移動命令幾秒沒前進就算卡住 */
const STUCK_S = 4

/** 船艙裡有沒有真人玩家（不是 AI）：有的話 AI 不站在控制台上發射，免得把人載走 */
function humanAboard(g: Game, p: GamePlayer, inst: ShipInst): boolean {
  return g.world.inZone(inst.zone).some((e) => e.alive && e.isMain && e.owner >= 0 && e.owner !== p.slot && !g.players[e.owner]?.bot)
}

// ───────── 換站（開船去別的站找人）─────────

/** 拿著檢測器、附近多久沒看到可以抽的別人就換站（秒）*/
const LONELY_S = 75
/** 一局最多換幾次站、兩次之間至少隔多久（秒）*/
const MAX_TRIPS = 3
const TRIP_GAP = 150
/** 剛找過、沒找到人的站多久內不回去（秒）*/
const VISIT_TTL = 300
/** 換站時「最後看到某人的地方」可以多舊（秒）*/
const SEEN_TRIP_TTL = 300
/** 各階段逾時（秒）：走到船邊、在船艙等發射（太空中沒人駕駛時等著接手也算）、太空中飛多久就改去最近的站 */
const WALK_MAX = 45
const CABIN_MAX = 30
const FLY_MAX = 150
/** 對同一站下幾次停靠指令還沒停進去就換一站；最多換幾次目標；完全找不到可以停靠的站時等多久（秒）就放棄換站 */
const DOCK_TRIES = 8
const MAX_RETARGETS = 4
const NO_DOCK_WAIT = 30
/** 豪勇號（zone key）：AI 不開走它的最後一艘停泊船 */
const BRAVADO = 'bravado'
/** 不去的站：七號廢站（廢棄、有危險）、事件站（海盜船、未識別物體）*/
const TRIP_EXCLUDE = new Set(['hulk7', 'pirate', 'uo'])

/** 可以停靠、還有空停機坪的站（火口號、擺渡號只能強行登艦，不去；船艙不算）*/
function dockableZone(g: Game, z: Zone | undefined): z is Zone {
  if (!z || !z.alive || !z.station || z.station.dockable === false || z.data.ship || !z.layout) return false
  const se = g.world.get(z.spaceEnt)
  if (!se || !se.alive || se.zone !== SPACE_ZONE || se.data.landed) return false
  return !!spaceOf(g).pads.get(z.id)?.some((x) => !x)
}

/** 停在這個站、現在可以搭的船：沒在發射、沒有別人在艙裡、沒有別的 AI 要搭、不是停在降落中的豪勇號上、不是豪勇號上最後一艘 */
function freeShipAt(g: Game, p: GamePlayer, u: Ent, evac = false): ShipInst | null {
  const sp = spaceOf(g)
  const landed = stationsOf(g).landed
  const taken = new Set<string>()
  for (const q of g.allPlayers()) {
    const tb = q.bot && q !== p ? (q.data.brain as Brain | undefined) : undefined
    if (tb?.trip) taken.add(tb.trip.ship)
  }
  // 豪勇號飛行甲板上的最後一艘船不開走：真人常出生在豪勇號，船被 AI 開光就只剩救生艙能離開
  //（別的 AI 已經說好要搭的、正在發射的不算「還在」）
  if (!evac && g.world.zones[u.zone]?.key === BRAVADO) {
    let left = 0
    for (const inst of sp.ships.values()) if (inst.docked?.zone === u.zone && !inst.hidden && !inst.launching && !taken.has(inst.key)) left++
    if (left <= 1) return null
  }
  let best: ShipInst | null = null
  let bd = Infinity
  for (const inst of sp.ships.values()) {
    if (!inst.docked || inst.docked.zone !== u.zone || inst.launching || inst.hidden || taken.has(inst.key)) continue
    if (landed && inst.docked.zone === landed.bravadoZone) continue
    const cz = g.world.zones[inst.zone]
    if (!cz?.alive || !consolePos(g, cz)) continue
    if (g.world.inZone(inst.zone).some((e) => e.alive && e.isMain && e.owner >= 0)) continue
    const de = g.world.get(inst.dockedEnt)
    if (!de) continue
    const d = dist2(u, de)
    if (d < bd) {
      bd = d
      best = inst
    }
  }
  return best
}

/**
 * 換站的目標：先去最近看到還沒抽過的人的站（自己的視野記下的）；沒有線索就照地圖上的出生點多寡（公開資訊）隨機挑一個，
 * 剛找過的站不去。只挑可以停靠、還有空停機坪的站。
 */
function tripTarget(g: Game, b: Brain, from: number, want: Want): number {
  let best = -1
  let bt = -Infinity
  for (const [name, s] of b.seen) {
    if (s.zone === from || g.time - s.t > SEEN_TRIP_TTL || !want(name) || s.t <= bt) continue
    // 剛找過（或掃描過沒人）的站：線索已經過時
    if (g.time - (b.visited.get(s.zone) ?? -1e9) < VISIT_TTL && (b.visited.get(s.zone) ?? 0) > s.t) continue
    if (!dockableZone(g, g.world.zones[s.zone]) || TRIP_EXCLUDE.has(g.world.zones[s.zone].key)) continue
    best = s.zone
    bt = s.t
  }
  if (best >= 0) return best
  const opts: { z: number; w: number }[] = []
  for (const z of g.world.zones) {
    if (z.id === from || TRIP_EXCLUDE.has(z.key) || !dockableZone(g, z)) continue
    if (g.time - (b.visited.get(z.id) ?? -1e9) < VISIT_TTL) continue
    const w = z.layout!.spawns.length
    if (w > 0) opts.push({ z: z.id, w })
  }
  let sum = 0
  for (const o of opts) sum += o.w
  if (!sum) return -1
  let r = g.world.rng.range(0, sum)
  for (const o of opts) {
    r -= o.w
    if (r <= 0) return o.z
  }
  return opts[opts.length - 1].z
}

/** 要不要換站：人類方本人在站裡、拿著還沒抽滿的檢測器、附近好一陣子沒有可以抽的別人、沒有威脅 */
function wantTrip(g: Game, p: GamePlayer, u: Ent, b: Brain): boolean {
  if (b.trip || u.id !== p.main || b.trips >= MAX_TRIPS || g.time < b.tripAt || doomNear(g)) return false
  if (g.time - b.peopleAt < (easy(g) ? EASY_LONELY_S : LONELY_S) || g.time - b.alarmAt < 30 || u.hp < u.maxHp * 0.5) return false
  const z = g.world.zones[u.zone]
  return !!z?.alive && !!z.station && !z.data.ship
}

function startTrip(g: Game, p: GamePlayer, u: Ent, b: Brain, want: Want): boolean {
  const inst = freeShipAt(g, p, u)
  const to = inst ? tripTarget(g, b, u.zone, want) : -1
  if (!inst || to < 0) {
    // 沒船可搭、沒有可去的站：晚點再看
    b.tripAt = g.time + 60
    return false
  }
  b.trip = { from: u.zone, to, ship: inst.key, stage: 'walk', at: g.time, start: g.time, side: g.faction(p), sx: 0, sy: 0, st: g.time }
  b.goal = null
  b.visited.set(u.zone, g.time)
  return stepTrip(g, p, u, b)
}

/** 放棄換站（還在原本的站或停泊的船艙裡）：晚點再考慮；在船艙裡的由 leaveCabin 走回艙門 */
function abortTrip(g: Game, b: Brain): void {
  b.trip = null
  b.tripAt = g.time + 60
}

/** 到站下船：換站結束 */
function endTrip(g: Game, b: Brain): void {
  b.trip = null
  b.trips++
  b.tripAt = g.time + TRIP_GAP
  // 到了新的站：重新計算多久沒看到人
  b.peopleAt = g.time
}

/** 換站途中、主單位自己在行動（還在原本的站、在船艙裡）。回傳 true = 這一輪只做這件事 */
function stepTrip(g: Game, p: GamePlayer, u: Ent, b: Brain): boolean {
  const trip = b.trip!
  const inst = spaceOf(g).ships.get(trip.ship)
  if (u.id !== p.main || !inst) return abortTrip(g, b), false
  const z = g.world.zones[u.zone]
  if (trip.stage === 'walk') {
    // 還在原本的站：走到船邊、對船互動（stepSpace 會讓有互動指令的人登船）
    if (u.zone === inst.zone) {
      trip.stage = 'cabin'
      trip.at = g.time
    } else {
      const de = inst.docked?.zone === u.zone ? g.world.get(inst.dockedEnt) : undefined
      // 船被開走了、挨打了、看到怪物、走太久、路上遇到可以抽的人（或檢測器沒了）：放棄（照常反擊、逃跑、抽血）
      const threat = g.time - u.lastDamageTime < 3 || visibleEnts(g, p, u, 10).some((e) => isFoe(g, p, e))
      const sl = itemSlot(u, 'geneSampler')
      const want = sl >= 0 ? sampleWant(g, b, sampleNames(u, sl)) : null
      const met = !want || visibleEnts(g, p, u, 18).some((e) => looksPerson(e) && want(seenName(g, e)) > 0)
      if (!de || inst.launching || g.time - trip.at > WALK_MAX || (!trip.evac && (threat || met))) return abortTrip(g, b), false
      if (p.view.visible.has(de.id)) {
        if (u.order?.k !== 'interact' || u.order.e !== de.id) cmd(g, p, { k: 'interact', e: de.id })
      } else if (u.order?.k !== 'move') {
        // 還看不到船（停機坪在別的房間）：先走到船邊（艙門那一側，和下船的位置一樣）
        const n = z.nav?.nearestOpen(de.x, de.y - de.radius - 0.9) ?? { x: de.x, y: de.y }
        cmd(g, p, { k: 'move', x: n.x, y: n.y })
      }
      return true
    }
  }
  if (trip.stage === 'fly') {
    // 停靠後操控權交回主單位（space.dock）：船艙裡繼續處理
    trip.stage = 'cabin'
    trip.at = g.time
  }
  if (u.zone !== inst.zone) {
    // 已經下船（不在船艙了）：到了別的站就算換站完成，否則（例如被弄下船）放棄
    if (z?.station && !z.data.ship && u.zone !== trip.from) endTrip(g, b)
    else abortTrip(g, b)
    return false
  }
  if (inst.docked && (trip.flown || inst.docked.zone !== trip.from)) {
    // 到站了：走回艙門下船（leaveCabin）；繞了一圈又停回原本的站就算沒換成
    if (inst.docked.zone !== trip.from) endTrip(g, b)
    else abortTrip(g, b)
    return leaveCabin(g, p, u, b)
  }
  // 挨打、看到怪物：放棄換站，照常反擊、逃跑（停泊中的由 leaveCabin 走回艙門下船）。末日撤離不放棄
  if (!trip.evac && (g.time - u.lastDamageTime < 3 || visibleEnts(g, p, u, 10).some((e) => isFoe(g, p, e)))) return abortTrip(g, b), false
  if (inst.docked) {
    // 停泊在原本的站：走到控制台、站著等發射倒數；等太久（控制台壞了、豪勇號降落中…）就放棄、下船。
    // 有真人上了船：不發射（免得把人載走），放棄換站、離開控制台下船（倒數剩不到 3 秒時照樣會發射，和真人駕駛走開一樣）；
    // 末日撤離時照樣出發（載著他一起撤到翠原星）
    if (g.time - trip.at > CABIN_MAX || (!trip.evac && humanAboard(g, p, inst))) return abortTrip(g, b), false
  } else {
    // 太空中、在船艙裡（不是駕駛）：之後停在哪裡都要下船（上面的到站處理）
    trip.flown = true
    const pid = spaceOf(g).pilots.get(inst.spaceEnt)
    // 別人在開船，或船上有真人（他離開控制台可能只是暫時的）：不去搶控制台，照常行動
    //（可以抽身邊的人、遇到怪物照常反應），停靠後就下船
    if ((pid && pid !== p.main) || (!trip.evac && humanAboard(g, p, inst))) {
      trip.idleAt = undefined
      return false
    }
    // 沒人駕駛：走去控制台接手、繼續開往目標站；控制台一直接不上（壞了、電磁停機）就放棄，照常行動
    trip.idleAt ??= g.time
    if (g.time - trip.idleAt > CABIN_MAX) return abortTrip(g, b), false
  }
  const c = consolePos(g, g.world.zones[inst.zone])
  if (!c) {
    if (inst.docked) abortTrip(g, b)
    return false
  }
  if (Math.hypot(u.x - c.x, u.y - c.y) > 0.4) {
    if (u.order?.k !== 'move' || u.order.x !== c.x || u.order.y !== c.y) cmd(g, p, { k: 'move', x: c.x, y: c.y })
  } else if (u.order) cmd(g, p, { k: 'stop' })
  b.goal = null
  return true
}

/** 太空中擋路的東西：恆星（離遠一點，會灼燒）與目標以外的站 */
function spaceObstacles(g: Game, target: Ent, ship: Ent): { x: number; y: number; r: number }[] {
  const out: { x: number; y: number; r: number }[] = []
  for (const e of g.world.inZone(SPACE_ZONE)) {
    if (e === target || e === ship || !e.alive) continue
    if (e.def.id === 'space.sun') out.push({ x: e.x, y: e.y, r: 6 + ship.radius + 2.5 })
    else if (e.tags.has('station') && !e.data.ship && !e.data.landed) out.push({ x: e.x, y: e.y, r: e.radius + ship.radius + 1.5 })
  }
  return out
}

/** 從 (ax, ay) 直線到 (bx, by) 會撞到的第一個障礙：回傳繞過它的中繼點，沒有就 null */
function detour(obs: { x: number; y: number; r: number }[], ax: number, ay: number, bx: number, by: number): { x: number; y: number } | null {
  const dx = bx - ax
  const dy = by - ay
  const len2 = dx * dx + dy * dy || 1
  let hit: { o: { x: number; y: number; r: number }; t: number; cx: number; cy: number } | null = null
  for (const o of obs) {
    const t = Math.max(0, Math.min(1, ((o.x - ax) * dx + (o.y - ay) * dy) / len2))
    const cx = ax + dx * t
    const cy = ay + dy * t
    if (Math.hypot(cx - o.x, cy - o.y) >= o.r || (hit && t >= hit.t)) continue
    // 起點已經在障礙範圍裡（例如剛從站旁發射）：不算擋路
    if (Math.hypot(ax - o.x, ay - o.y) < o.r) continue
    hit = { o, t, cx, cy }
  }
  if (!hit) return null
  let nx = hit.cx - hit.o.x
  let ny = hit.cy - hit.o.y
  let n = Math.hypot(nx, ny)
  if (n < 1e-3) {
    nx = -dy
    ny = dx
    n = Math.hypot(nx, ny) || 1
  }
  const k = (hit.o.r + 1.5) / n
  return { x: hit.o.x + nx * k, y: hit.o.y + ny * k }
}

/** 生命掃描最多改幾次目標（之後停在哪就是哪）*/
const MAX_RESCANS = 1

/**
 * 接近目標站時先用船上的生命掃描看看裡面有沒有人（和真人駕駛一樣：掃描結果只有人數）；沒人就改去別的站。
 * 回傳 true = 正在掃描、等結果，或剛改了目標（這一輪不下停靠指令）
 */
function scanTarget(g: Game, p: GamePlayer, v: Ent, b: Brain, tz: Zone, te: Ent): boolean {
  const trip = b.trip!
  const ab = abilityDef('ship.scan')
  if (!ab || trip.evac || !v.abilities.includes(ab.id) || (trip.rescans ?? 0) >= MAX_RESCANS || trip.scan?.done) return false
  if (!trip.scan) {
    const r = (ab.range ?? 15) + te.radius + v.radius - 0.5
    if (Math.hypot(te.x - v.x, te.y - v.y) > r || !cdReady(g, v, ab)) return false
    cmd(g, p, { k: 'cast', a: ab.id, e: te.id })
    // 施法時間＋站的掃描時間之後才有結果
    trip.scan = { at: g.time + (ab.cast ?? 0) + (tz.station?.scanTime ?? 1) + 0.6 }
    return true
  }
  if (g.time < trip.scan.at) return true
  trip.scan.done = true
  // 結果和 space.scan 告訴駕駛的一樣：站裡有幾個人
  let n = 0
  for (const e of g.world.inZone(tz.id)) if (e.alive && e.isMain) n++
  if (n > 0) return false
  b.visited.set(tz.id, g.time)
  const alt = tripTarget(g, b, trip.from, () => 1)
  // 停靠失敗過的站不回頭
  if (alt < 0 || alt === tz.id || trip.failed?.includes(alt)) return false
  trip.to = alt
  trip.at = g.time
  trip.tries = 0
  trip.via = undefined
  trip.scan = undefined
  trip.rescans = (trip.rescans ?? 0) + 1
  return true
}

/** 換站途中、駕駛自己搭的船：繞過恆星與其他站、飛到目標站旁停靠。回傳 true = 這一輪只做這件事 */
function flyTrip(g: Game, p: GamePlayer, v: Ent, b: Brain): boolean {
  const trip = b.trip!
  const inst = spaceOf(g).ships.get(trip.ship)
  if (!inst || inst.spaceEnt !== v.id || spaceOf(g).pilots.get(v.id) !== p.main) return false
  if (trip.stage !== 'fly') {
    trip.stage = 'fly'
    trip.flown = true
    trip.at = g.time
    trip.st = g.time
    trip.sx = v.x
    trip.sy = v.y
  }
  // 目標站沒了、停機坪滿了、飛太久、停靠一直沒成功：改去最近還能停靠的站（不會一直漂在太空中）
  let tz = g.world.zones[trip.to]
  let te = dockableZone(g, tz) ? g.world.get(tz.spaceEnt) : undefined
  const slow = g.time - trip.at > FLY_MAX || (trip.tries ?? 0) > DOCK_TRIES
  if (!te || slow) {
    // 飛太久到不了、停靠一直失敗的站：之後不再選它
    if (slow && !trip.failed?.includes(trip.to)) (trip.failed ??= []).push(trip.to)
    const best = (trip.retargets ?? 0) < MAX_RETARGETS ? nearestDock(g, v, trip) : null
    if (!best) {
      // 沒有站可以停（或改了太多次目標）：停下來等一下（停機坪可能會空出來）；等太久就放棄換站
      //（交回控制台、留在船艙裡；別人可以接手開船）
      trip.noDock ??= g.time
      if ((trip.retargets ?? 0) >= MAX_RETARGETS || g.time - trip.noDock > NO_DOCK_WAIT) return abortTrip(g, b), false
      if (v.order) cmd(g, p, { k: 'stop' })
      return true
    }
    trip.noDock = undefined
    trip.retargets = (trip.retargets ?? 0) + 1
    trip.to = best.id
    tz = best
    te = g.world.get(best.spaceEnt)!
    trip.at = g.time
    trip.tries = 0
    trip.via = undefined
  }
  // 卡住偵測（被站推著、撞在一起）：幾秒沒前進就隨機往旁邊繞
  if (Math.hypot(v.x - trip.sx, v.y - trip.sy) > 0.5) {
    trip.sx = v.x
    trip.sy = v.y
    trip.st = g.time
  } else if (g.time - trip.st > 6) {
    const a = g.world.rng.range(0, Math.PI * 2)
    trip.via = { x: v.x + Math.cos(a) * 6, y: v.y + Math.sin(a) * 6 }
    trip.st = g.time
  }
  if (trip.via && Math.hypot(v.x - trip.via.x, v.y - trip.via.y) < 1.5) trip.via = undefined
  if (!trip.via) {
    const via = detour(spaceObstacles(g, te, v), v.x, v.y, te.x, te.y)
    if (via) trip.via = via
  }
  if (trip.via) {
    if (v.order?.k !== 'move' || v.order.x !== trip.via.x || v.order.y !== trip.via.y) cmd(g, p, { k: 'move', x: trip.via.x, y: trip.via.y })
    return true
  }
  if (scanTarget(g, p, v, b, tz, te)) return true
  // 直線過得去：下停靠指令（移動系統會飛到射程內再停靠）。重下的次數記下來，一直停不進去就換站（上面）；
  // 冷卻中下了也會被丟掉，不算一次
  const dockAb = abilityDef('ship.dock')
  if (v.order?.k !== 'cast' || v.order.a !== 'ship.dock' || v.order.e !== te.id) {
    if (dockAb && !cdReady(g, v, dockAb)) return true
    trip.tries = (trip.tries ?? 0) + 1
    cmd(g, p, { k: 'cast', a: 'ship.dock', e: te.id })
  }
  return true
}

/** 太空中改去的站：最近、還能停靠、沒有停靠失敗過的站；原本的站排在最後（別的站都停不了才回去）。沒有 = null */
function nearestDock(g: Game, v: Ent, trip: Trip): Zone | null {
  let best: Zone | null = null
  let bd = Infinity
  for (const z of g.world.zones) {
    if (!dockableZone(g, z) || trip.failed?.includes(z.id)) continue
    const se = g.world.get(z.spaceEnt)!
    const d = Math.hypot(se.x - v.x, se.y - v.y) + (z.id === trip.from ? 1e4 : 0)
    if (d < bd) {
      bd = d
      best = z
    }
  }
  return best
}

const installed = new WeakSet<Game>()

export function installBots(g: Game): void {
  if (installed.has(g)) return
  installed.add(g)
  if (!g.allPlayers().some((p) => p.bot)) return
  g.systems.push({ name: 'bots', fn: stepBots })
  // 打到 bot 的每一下：分辨真的在打我還是誤傷（瞄準自己的直接傷害 vs. 波及、持續傷害）
  DAMAGE_HOOKS.push((g2, src, t, amount, o) => {
    if (g2 === g) noteHit(g, src, t, amount, !!o.dot)
  })
}
