// 跨局戰績（第 8 輪：朋友局的「扳回一城」）：每打完一局，把每個人的勝負記在這台電腦的 localStorage。
// - 記什麼：本季（從上次重設起）與今晚各陣營的勝場、局數、目前連勝／連敗、上一局誰贏。
// - 以玩家名字為準（正規化後比對）；AI 玩家、只主持不參戰的主機不記；練習局、主機中止的局不記。
// - 每一局只記一次（以這局的 gid 去重：重連重送結算、同一台電腦開兩個分頁都不會重記）。
// - 存檔有版本號與大小上限；讀到壞掉的資料就當作沒有，讀到比自己新的版本就不覆寫。
// 每台看到結算的電腦都會記（主機一定看得到每一局，所以主機的紀錄最完整）。
// 純函式（applyGame、parseSeason、standings…）不碰 DOM，單元測試直接用；watchSeasonStats 接上 session 的結算訊號。
import { signal } from '@preact/signals'
import { PRACTICE_ROOM, type EndResult, type StartInfo } from '../shared/protocol/messages'
import { currentRoom, endResult, lobby, startInfo } from './session'

export const SEASON_KEY = 'xc.season'
export const SEASON_VERSION = 1
/** 兩局相隔超過這麼久就算新的一晚（朋友局常打過午夜，不用日曆日期切）*/
export const NIGHT_GAP_MS = 6 * 3600 * 1000
/** 最多記幾個名字（超過就丟掉最久沒出現的）*/
export const MAX_TRACKED = 40
/** 去重用的局號最多留幾個 */
export const MAX_SEEN = 40
/** 存檔大小上限（字元數）：超過就再砍名單 */
export const MAX_BYTES = 32 * 1024
/** 名字最多留幾個字 */
export const NAME_MAX = 32
/** 連勝／連敗要連續幾場以上才顯示（第 9 輪：「1 連勝」「1 連敗」只是上一局的勝負，不算連）；存檔照常記 ±1 */
export const STREAK_SHOW_MIN = 2

/** 要顯示的連勝（正）／連敗（負）場數；不到 STREAK_SHOW_MIN 場回傳 0（不顯示）*/
export function shownStreak(n: number): number {
  return Math.abs(n) >= STREAK_SHOW_MIN ? n : 0
}

export type Faction = 'human' | 'xeno' | 'mutant' | 'android'
export const FACTIONS: readonly Faction[] = ['human', 'xeno', 'mutant', 'android']

export interface Tally {
  /** 局數 */
  g: number
  /** 勝場 */
  w: number
  /** 各陣營：[局數, 勝場] */
  by: Record<Faction, [number, number]>
}

export interface PlayerRec {
  /** 顯示用的名字（最後一次出現時的寫法）*/
  name: string
  /** 最後一次參戰的時間（ms）*/
  at: number
  season: Tally
  /** 今晚：id = 第幾晚，不是目前這一晚就當作 0 */
  night: Tally & { id: number }
  /** 目前連勝（正）／連敗（負）；平手歸零 */
  streak: number
}

export interface LastGame {
  at: number
  /** 本季第幾局 */
  n: number
  winner: Exclude<EndResult['winner'], 'aborted'>
  drawWhy?: EndResult['drawWhy']
  duration: number
  /** 這局的參戰者（含 AI，回顧時寫出誰贏；統計不算 AI）*/
  lineup: { name: string; role: Faction; spawn: boolean; won: boolean; bot: boolean }[]
}

export interface SeasonData {
  v: typeof SEASON_VERSION
  /** 本季開始（第一次記錄或上次重設）的時間 */
  since: number
  /** 本季局數 */
  games: number
  /** 第幾晚（從 1 起算；還沒有任何一局是 0）*/
  night: number
  /** 這一晚打了幾局 */
  nightGames: number
  /** 最後一局的時間 */
  lastAt: number
  /** 正規化的名字 → 紀錄 */
  players: Record<string, PlayerRec>
  /** 最近記過的局（去重）*/
  seen: string[]
  last: LastGame | null
}

// ───────── 名字 ─────────

/** 名字的正規化：NFKC（全形英數轉半形）、去頭尾空白、連續空白併成一個、截長。key 另外不分大小寫 */
export function normName(raw: string): { key: string; name: string } | null {
  if (typeof raw !== 'string') return null
  const name = raw
    .normalize('NFKC')
    // 控制字元、零寬字元、方向控制字元（看不見、卻會讓同一個名字對不上）
    // eslint-disable-next-line no-control-regex
    .replace(/[\u0000-\u001f\u007f\u200b-\u200f\u2028-\u202e\ufeff]/g, '')
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, NAME_MAX)
  if (!name) return null
  return { key: name.toLowerCase(), name }
}

// ───────── 建立、讀取 ─────────

const emptyBy = (): Record<Faction, [number, number]> => ({
  human: [0, 0],
  xeno: [0, 0],
  mutant: [0, 0],
  android: [0, 0],
})
const emptyTally = (): Tally => ({ g: 0, w: 0, by: emptyBy() })

export function emptySeason(now: number): SeasonData {
  return {
    v: SEASON_VERSION,
    since: now,
    games: 0,
    night: 0,
    nightGames: 0,
    lastAt: 0,
    players: {},
    seen: [],
    last: null,
  }
}

const isObj = (x: unknown): x is Record<string, unknown> => !!x && typeof x === 'object' && !Array.isArray(x)
/** 非負整數（壞資料一律當 0）*/
const nat = (x: unknown): number => (typeof x === 'number' && Number.isFinite(x) && x > 0 ? Math.floor(x) : 0)
const int = (x: unknown): number => (typeof x === 'number' && Number.isFinite(x) ? Math.trunc(x) : 0)
const isFaction = (x: unknown): x is Faction => typeof x === 'string' && (FACTIONS as readonly string[]).includes(x)

function parseTally(x: unknown): Tally {
  const t = emptyTally()
  if (!isObj(x)) return t
  t.g = nat(x.g)
  t.w = Math.min(nat(x.w), t.g)
  if (isObj(x.by))
    for (const f of FACTIONS) {
      const v = x.by[f]
      if (Array.isArray(v)) {
        const g = nat(v[0])
        t.by[f] = [g, Math.min(nat(v[1]), g)]
      }
    }
  return t
}

function parsePlayer(x: unknown): PlayerRec | null {
  if (!isObj(x)) return null
  const n = normName(typeof x.name === 'string' ? x.name : '')
  if (!n) return null
  const night = isObj(x.night) ? { ...parseTally(x.night), id: nat(x.night.id) } : { ...emptyTally(), id: 0 }
  return { name: n.name, at: nat(x.at), season: parseTally(x.season), night, streak: int(x.streak) }
}

function parseLast(x: unknown): LastGame | null {
  if (!isObj(x)) return null
  const winner = x.winner
  if (winner !== 'crew' && winner !== 'xeno' && winner !== 'mutant' && winner !== 'draw') return null
  const lineup: LastGame['lineup'] = []
  if (Array.isArray(x.lineup))
    for (const p of x.lineup.slice(0, 16)) {
      if (!isObj(p)) continue
      const n = normName(typeof p.name === 'string' ? p.name : '')
      if (!n || !isFaction(p.role)) continue
      lineup.push({
        name: n.name,
        role: p.role,
        spawn: p.spawn === true,
        won: p.won === true,
        bot: p.bot === true,
      })
    }
  const why = x.drawWhy === 'wipe' || x.drawWhy === 'doom' || x.drawWhy === 'other' ? x.drawWhy : undefined
  return {
    at: nat(x.at),
    n: nat(x.n),
    winner,
    ...(winner === 'draw' && why ? { drawWhy: why } : {}),
    duration: nat(x.duration),
    lineup,
  }
}

/**
 * 讀存檔：壞掉、不是物件、版本不對（舊版沒有可轉換的資料）都回傳空的一季；
 * 比自己新的版本另外由 storeWritable 擋住寫入（不覆寫新版的資料）
 */
export function parseSeason(raw: string | null, now: number): SeasonData {
  if (!raw) return emptySeason(now)
  let x: unknown
  try {
    x = JSON.parse(raw)
  } catch {
    return emptySeason(now)
  }
  if (!isObj(x) || x.v !== SEASON_VERSION) return emptySeason(now)
  const d = emptySeason(nat(x.since) || now)
  d.games = nat(x.games)
  d.night = nat(x.night)
  d.nightGames = nat(x.nightGames)
  d.lastAt = nat(x.lastAt)
  if (isObj(x.players))
    for (const v of Object.values(x.players)) {
      const p = parsePlayer(v)
      const n = p && normName(p.name)
      // key 一律由名字重算（手改過的存檔、舊的正規化規則都對得上）；同名只留第一個
      if (p && n && !d.players[n.key] && Object.keys(d.players).length < MAX_TRACKED * 2) d.players[n.key] = p
    }
  if (Array.isArray(x.seen)) d.seen = x.seen.filter((s): s is string => typeof s === 'string' && s.length <= 200).slice(-MAX_SEEN)
  d.last = parseLast(x.last)
  return prune(d)
}

/** 存檔裡的版本比這個版本新：不要覆寫（可能是新版的分頁寫的）*/
export function storeWritable(raw: string | null): boolean {
  if (!raw) return true
  try {
    const x: unknown = JSON.parse(raw)
    return !(isObj(x) && typeof x.v === 'number' && x.v > SEASON_VERSION)
  } catch {
    return true
  }
}

/** 名單太長、存檔太大：丟掉最久沒出現的人 */
export function prune(d: SeasonData, maxBytes = MAX_BYTES): SeasonData {
  let keys = Object.keys(d.players)
  if (keys.length > MAX_TRACKED) {
    keys.sort((a, b) => d.players[b].at - d.players[a].at)
    for (const k of keys.slice(MAX_TRACKED)) delete d.players[k]
  }
  d.seen = d.seen.slice(-MAX_SEEN)
  // 名字很長、局號很多時仍可能超過：一次砍掉四分之一，直到放得下
  while (JSON.stringify(d).length > maxBytes) {
    keys = Object.keys(d.players).sort((a, b) => d.players[b].at - d.players[a].at)
    if (keys.length <= 1 && d.seen.length === 0) break
    if (d.seen.length > 8) d.seen = d.seen.slice(-8)
    else if (keys.length > 1) for (const k of keys.slice(Math.max(1, Math.floor(keys.length * 0.75)))) delete d.players[k]
    else d.seen = []
  }
  return d
}

// ───────── 記一局 ─────────

/** 結算的身分 → 陣營（被轉化的人在結算裡已經是轉化者的陣營）*/
export function factionOf(role: string): Faction {
  return isFaction(role) ? role : 'human'
}

/** 這個陣營在這個結局算不算贏：人類獲勝時仿生人也贏（人類陣營）*/
export function wonWith(f: Faction, winner: EndResult['winner']): boolean {
  if (winner === 'crew') return f === 'human' || f === 'android'
  return winner === f
}

export interface GameInput {
  /** 去重用的局號（gameKey）*/
  key: string
  result: Pick<EndResult, 'winner' | 'drawWhy' | 'duration' | 'players'>
  /** AI 玩家的槽位 */
  bots: ReadonlySet<number>
  practice: boolean
  now: number
}

export type SkipReason = 'practice' | 'aborted' | 'dup' | 'empty'

/**
 * 把一局記進這一季（不改傳入的物件，回傳新的）。不記的情況：練習局、主機中止、記過了、沒有真人參戰。
 * 只算真人（AI、只主持不參戰的主機不算）；同一局裡正規化後同名的人只算第一個
 */
export function applyGame(prev: SeasonData, g: GameInput): { data: SeasonData; skipped?: SkipReason } {
  if (g.practice) return { data: prev, skipped: 'practice' }
  const winner = g.result.winner
  if (winner === 'aborted') return { data: prev, skipped: 'aborted' }
  if (prev.seen.includes(g.key)) return { data: prev, skipped: 'dup' }
  const d: SeasonData = structuredClone(prev)
  d.seen.push(g.key)
  const fighters = g.result.players.filter((p) => !p.spectator)
  const people = new Map<string, { name: string; f: Faction }>()
  const lineup: LastGame['lineup'] = []
  for (const p of fighters) {
    const n = normName(p.name)
    if (!n) continue
    const f = factionOf(p.role)
    const bot = g.bots.has(p.slot)
    lineup.push({ name: n.name, role: f, spawn: !!p.spawn, won: wonWith(f, winner), bot })
    if (!bot && !people.has(n.key)) people.set(n.key, { name: n.name, f })
  }
  if (!people.size) return { data: prune(d), skipped: 'empty' }
  // 新的一晚：第一局，或離上一局超過 NIGHT_GAP_MS
  if (!d.lastAt || g.now - d.lastAt > NIGHT_GAP_MS) {
    d.night += 1
    d.nightGames = 0
  }
  d.games += 1
  d.nightGames += 1
  d.lastAt = g.now
  for (const [key, { name, f }] of people) {
    const rec: PlayerRec = d.players[key] ?? {
      name,
      at: 0,
      season: emptyTally(),
      night: { ...emptyTally(), id: d.night },
      streak: 0,
    }
    rec.name = name
    rec.at = g.now
    if (rec.night.id !== d.night) rec.night = { ...emptyTally(), id: d.night }
    const won = wonWith(f, winner)
    for (const t of [rec.season, rec.night]) {
      t.g += 1
      t.by[f][0] += 1
      if (won) {
        t.w += 1
        t.by[f][1] += 1
      }
    }
    rec.streak = won ? Math.max(0, rec.streak) + 1 : winner === 'draw' ? 0 : Math.min(0, rec.streak) - 1
    d.players[key] = rec
  }
  d.last = {
    at: g.now,
    n: d.games,
    winner,
    ...(winner === 'draw' && g.result.drawWhy ? { drawWhy: g.result.drawWhy } : {}),
    duration: Math.max(0, Math.round(g.result.duration)),
    lineup: lineup.slice(0, 16),
  }
  return { data: prune(d) }
}

/**
 * 去重用的局號：有 gid（主機給每一局的隨機識別碼）就用它；舊版主機沒有 gid，改用種子＋時長＋結局＋名單
 */
export function gameKey(r: Pick<EndResult, 'winner' | 'duration' | 'players'>, info: Pick<StartInfo, 'gid' | 'seed'> | null | undefined): string {
  if (info && typeof info.gid === 'number') return 'g' + info.gid
  const names = r.players
    .map((p) => normName(p.name)?.key ?? '')
    .sort()
    .join(',')
  return ['s' + (info?.seed ?? 0), r.duration, r.winner, names].join('|').slice(0, 200)
}

// ───────── 顯示用 ─────────

/** 今晚的數字還算不算數（最後一局在 NIGHT_GAP_MS 以內）*/
export function nightActive(d: SeasonData, now: number): boolean {
  return d.lastAt > 0 && now - d.lastAt <= NIGHT_GAP_MS
}

export interface StandingRow {
  key: string
  name: string
  games: number
  wins: number
  by: Record<Faction, [number, number]>
  nightGames: number
  nightWins: number
  nightBy: Record<Faction, [number, number]>
  streak: number
  /** 名字在 present 名單裡（大廳裡的人）*/
  present: boolean
}

/**
 * 排行：present（大廳裡的人）在前，再依本季勝場、勝率、局數、名字排。
 * only = 只列這些名字（結算畫面只列這局的人）
 */
export function standings(d: SeasonData, now: number, opts: { present?: readonly string[]; only?: readonly string[] } = {}): StandingRow[] {
  const live = nightActive(d, now)
  const present = new Set((opts.present ?? []).map((n) => normName(n)?.key).filter((k): k is string => !!k))
  const only = opts.only ? new Set(opts.only.map((n) => normName(n)?.key).filter((k): k is string => !!k)) : null
  const rows: StandingRow[] = []
  for (const [key, p] of Object.entries(d.players)) {
    if (only && !only.has(key)) continue
    const tonight = live && p.night.id === d.night
    rows.push({
      key,
      name: p.name,
      games: p.season.g,
      wins: p.season.w,
      by: p.season.by,
      nightGames: tonight ? p.night.g : 0,
      nightWins: tonight ? p.night.w : 0,
      nightBy: tonight ? p.night.by : emptyBy(),
      streak: p.streak,
      present: present.has(key),
    })
  }
  const rate = (r: StandingRow) => (r.games ? r.wins / r.games : 0)
  return rows.sort((a, b) => Number(b.present) - Number(a.present) || b.wins - a.wins || rate(b) - rate(a) || b.games - a.games || a.name.localeCompare(b.name))
}

// ───────── 存取（localStorage）─────────

export interface StoreLike {
  getItem(k: string): string | null
  setItem(k: string, v: string): void
  removeItem(k: string): void
}

function defaultStore(): StoreLike | null {
  try {
    const s = (globalThis as { localStorage?: StoreLike }).localStorage
    return s && typeof s.getItem === 'function' ? s : null
  } catch {
    return null
  }
}

export function loadSeason(store: StoreLike | null = defaultStore(), now = Date.now()): SeasonData {
  if (!store) return emptySeason(now)
  try {
    return parseSeason(store.getItem(SEASON_KEY), now)
  } catch {
    return emptySeason(now)
  }
}

/** 寫回存檔；存檔是更新版本寫的、或寫不進去（私密模式、空間滿）回傳 false */
export function saveSeason(d: SeasonData, store: StoreLike | null = defaultStore()): boolean {
  if (!store) return false
  try {
    if (!storeWritable(store.getItem(SEASON_KEY))) return false
    store.setItem(SEASON_KEY, JSON.stringify(d))
    return true
  } catch {
    return false
  }
}

/** 目前這台電腦的戰績（大廳、結算畫面顯示用）*/
export const season = signal<SeasonData>(loadSeason())

/**
 * 記一局：每次都重讀存檔（同一台電腦的其他分頁可能剛記過），去重後寫回並更新 season。回傳有沒有記下來
 */
export function recordGame(g: GameInput, store: StoreLike | null = defaultStore()): boolean {
  const cur = loadSeason(store, g.now)
  const { data, skipped } = applyGame(cur, g)
  if (skipped === 'practice' || skipped === 'aborted') return false
  if (skipped === 'dup') {
    season.value = cur
    return false
  }
  saveSeason(data, store)
  season.value = data
  return !skipped
}

/** 重設戰績（大廳的「重設戰績」確認之後）：本季從現在重新開始 */
export function resetSeason(store: StoreLike | null = defaultStore(), now = Date.now()): void {
  const d = emptySeason(now)
  if (store)
    try {
      if (storeWritable(store.getItem(SEASON_KEY))) store.removeItem(SEASON_KEY)
    } catch {
      /* ignore */
    }
  season.value = d
}

/** 重新讀一次存檔（大廳打開時：其他分頁、上一次開遊戲記的）*/
export function refreshSeason(store: StoreLike | null = defaultStore()): void {
  season.value = loadSeason(store)
}

// ───────── 接上結算訊號 ─────────

let watching = false

/** 現在是不是練習局（練習房號）*/
export function inPracticeRoom(): boolean {
  try {
    return currentRoom() === PRACTICE_ROOM || lobby.peek()?.code === PRACTICE_ROOM
  } catch {
    return false
  }
}

/**
 * 現在畫面上的結算（session 的 endResult）有沒有記進這一季：結算畫面的精簡版只在記下了才顯示
 * （主機中止、練習局、沒有真人參戰的局不記，不能拿上一局的紀錄冒充）。沒有結算時回傳 null
 */
export function currentGameRecorded(d: SeasonData): boolean | null {
  try {
    const r = endResult.value
    if (!r) return null
    return d.seen.includes(gameKey(r, startInfo.peek())) && d.last !== null && d.lastAt > 0
  } catch {
    return null
  }
}

/** AI 玩家的槽位：開局資料的 bot 旗標；沒有開局資料（不太可能）時看大廳名單 */
function botSlots(): Set<number> {
  const info = startInfo.peek()
  const list = info?.players ?? lobby.peek()?.players ?? []
  return new Set(list.filter((p) => p.bot).map((p) => p.slot))
}

/** 收到結算（session 的 endResult）就記一局；只需要裝一次（SeasonStats.tsx 載入時呼叫）*/
export function watchSeasonStats(): void {
  if (watching) return
  watching = true
  try {
    endResult.subscribe((r) => {
      if (!r) return
      try {
        recordGame({
          key: gameKey(r, startInfo.peek()),
          result: r,
          bots: botSlots(),
          practice: inPracticeRoom(),
          now: Date.now(),
        })
      } catch {
        /* 戰績壞了不影響結算畫面 */
      }
    })
  } catch {
    watching = false
  }
}
