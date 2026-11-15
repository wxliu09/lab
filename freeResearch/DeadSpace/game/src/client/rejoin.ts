// 重新整理後回到原席位：依房號把重連用的 token 存在 localStorage（同一個瀏覽器的分頁共用，重新整理、開新分頁都拿得到），
// 記下最後使用的時間，超過 2 小時丟掉。客人在房間裡時另外記「目前在哪個房間」（分頁自己的 sessionStorage 與共用的
// localStorage 各一份），定時更新時間。重新整理後網址 hash 有房號（邀請連結）、或 2 分鐘內還在某個房間裡，
// 就自動用原 token 連回去（伺服器認 token 給回原席位）。
//
// 同一個 token 同時只讓一個分頁用：共用記錄裡有「租約」（哪個頁面、最後心跳時間）。
// - 重新整理：舊頁面在 pagehide 放掉租約（沒放掉也沒關係：sessionStorage 記得這個分頁用的是這個 token），新頁面直接接手。
// - 開新分頁、舊分頁還開著：正式連線（P2P）手動加入時照樣用同一個 token（一個人不能占兩個席位），伺服器把席位交給新分頁，
//   舊分頁下一次心跳發現租約被拿走，就中斷連線並說明。新分頁不會「自動」接手還有心跳的租約（免得一開分頁就把正在玩的分頁踢掉）。
// - 同一瀏覽器多分頁的開發／e2e 模式（?net=bc）每個分頁本來就是不同的玩家：新分頁不拿別的分頁的 token，只有重新整理會自動連回。
// 這裡只放純邏輯（儲存區由呼叫端傳入），session.ts 負責接上 localStorage／sessionStorage 與連線流程。
import { ROOM_ALPHABET, ROOM_CODE_LEN } from '../shared/constants'
import { PRACTICE_ROOM } from '../shared/protocol/messages'

/** token 記錄的保存期限（ms）：最後一次使用後 2 小時 */
export const TOKEN_TTL_MS = 2 * 60 * 60 * 1000
/** 沒有邀請連結時，自動連回「最近所在的房間」的時限（ms）：2 分鐘內還在房間裡的才算 */
export const REJOIN_WINDOW_MS = 2 * 60 * 1000
/** 租約失效時間（ms）：超過這麼久沒心跳（session.ts 每秒一次），就當那個分頁已經關了 */
export const LEASE_STALE_MS = 6000

const TOK_PREFIX = 'xc.rt.'
const LAST_KEY = 'xc.lastRoom'
/** 分頁自己的 token（sessionStorage；舊版就是存在這裡）*/
const TAB_PREFIX = 'xc.tok.'
/** 分頁自己目前所在的房間（sessionStorage）*/
const TAB_ROOM = 'xc.tabRoom'

/** 只用到 Web Storage 的這幾個方法（測試用 Map 假造）*/
export interface KV {
  getItem(k: string): string | null
  setItem(k: string, v: string): void
  removeItem(k: string): void
  readonly length: number
  key(i: number): string | null
}

export interface RoomToken {
  tok: string
  /** 最後使用的時間（Date.now，ms）*/
  at: number
  /** 目前持有租約的頁面（每次載入頁面都不同）；沒有 = 沒人用 */
  inst?: string
  /** 租約最後心跳時間（Date.now，ms）*/
  beat?: number
  /** 已經離開這個房間（按了離開、被拒絕、對局結束…）：不再自動連回去（token 留著，手動加入照樣回原席位）*/
  done?: boolean
}

export interface RoomMark {
  code: string
  at: number
}

function safe<T>(f: () => T, fallback: T): T {
  try {
    return f()
  } catch {
    return fallback
  }
}

/** 正式房號（5 碼、房號字母表）；練習房不算 */
export function validRoom(code: string | null | undefined): code is string {
  if (!code || code.length !== ROOM_CODE_LEN || code === PRACTICE_ROOM) return false
  return [...code].every((ch) => ROOM_ALPHABET.includes(ch))
}

/** 網址 hash 裡的房號（#room=XXXXX），沒有或格式不對回傳 '' */
export function hashRoom(hash: string): string {
  const code = (new URLSearchParams(hash.replace(/^#/, '')).get('room') ?? '').trim().toUpperCase()
  return validRoom(code) ? code : ''
}

export function readToken(ls: KV, code: string, now: number): RoomToken | null {
  const raw = safe(() => ls.getItem(TOK_PREFIX + code), null)
  if (!raw) return null
  const r = safe(() => JSON.parse(raw) as RoomToken | null, null)
  if (!r || typeof r.tok !== 'string' || !r.tok || typeof r.at !== 'number' || now - r.at > TOKEN_TTL_MS) {
    safe(() => ls.removeItem(TOK_PREFIX + code), undefined)
    return null
  }
  return r
}

function writeToken(ls: KV, code: string, r: RoomToken): void {
  safe(() => ls.setItem(TOK_PREFIX + code, JSON.stringify(r)), undefined)
}

function readMark(kv: KV, key: string): RoomMark | null {
  const raw = safe(() => kv.getItem(key), null)
  if (!raw) return null
  const r = safe(() => JSON.parse(raw) as RoomMark | null, null)
  return r && typeof r.code === 'string' && typeof r.at === 'number' ? r : null
}

/** 共用的「最近所在的房間」*/
export function readLast(ls: KV): RoomMark | null {
  return readMark(ls, LAST_KEY)
}
/** 這個分頁的「目前所在的房間」*/
export function readTabRoom(tab: KV): RoomMark | null {
  return readMark(tab, TAB_ROOM)
}
/** 這個分頁之前在這個房間用的 token */
export function tabToken(tab: KV, code: string): string | null {
  return safe(() => tab.getItem(TAB_PREFIX + code), null)
}

/** 丟掉所有過期的 token 記錄（以及格式壞掉的）*/
export function purgeTokens(ls: KV, now: number): void {
  const keys = safe(() => {
    const out: string[] = []
    for (let i = 0; i < ls.length; i++) {
      const k = ls.key(i)
      if (k?.startsWith(TOK_PREFIX)) out.push(k)
    }
    return out
  }, [])
  for (const k of keys) readToken(ls, k.slice(TOK_PREFIX.length), now)
  const last = readLast(ls)
  if (last && now - last.at > TOKEN_TTL_MS) safe(() => ls.removeItem(LAST_KEY), undefined)
}

/** 租約還有頁面在用（有心跳、而且沒過期）*/
export function leaseLive(r: RoomToken, now: number): boolean {
  return !!r.inst && typeof r.beat === 'number' && now - r.beat < LEASE_STALE_MS
}

export interface PickOpts {
  now: number
  /** 這次載入頁面的識別碼 */
  inst: string
  /** 分頁之間共用 token（正式連線 true；同一瀏覽器多分頁的開發模式 false：新分頁不拿別的分頁的 token）*/
  share: boolean
  gen: () => string
}

/**
 * 加入房間時選 token。回傳 shared = 這個分頁拿著共用記錄的租約（要定時心跳、離開時放掉）。
 * 順序：這個分頁之前用過的（sessionStorage，重新整理的情況）→ 共用記錄（分頁之間共用時；別的分頁還開著就接手）→ 新的。
 */
export function pickToken(ls: KV, tab: KV, code: string, o: PickOpts): { tok: string; shared: boolean } {
  const rec = readToken(ls, code, o.now)
  const mine = tabToken(tab, code)
  const claim = (tok: string) => {
    writeToken(ls, code, { tok, at: o.now, inst: o.inst, beat: o.now })
    safe(() => tab.setItem(TAB_PREFIX + code, tok), undefined)
    return { tok, shared: true }
  }
  if (mine) {
    // 重新整理（或複製分頁）：用這個分頁原本的 token；共用記錄就是它（或沒有記錄）時順便拿租約。
    // 共用記錄是別的身分（開發模式下同一瀏覽器的另一位玩家）：不動它
    return !rec || rec.tok === mine ? claim(mine) : { tok: mine, shared: false }
  }
  if (rec && o.share) return claim(rec.tok)
  if (rec) {
    // 開發模式：共用記錄是別的分頁（另一位玩家）的，這個分頁用自己的 token
    const tok = o.gen()
    safe(() => tab.setItem(TAB_PREFIX + code, tok), undefined)
    return { tok, shared: false }
  }
  return claim(o.gen())
}

/** 租約心跳：'lost' = 別的頁面接手了這個 token（這個分頁應該中斷連線）*/
export function beatLease(ls: KV, code: string, inst: string, now: number): 'ok' | 'lost' {
  const rec = readToken(ls, code, now)
  if (!rec) return 'ok'
  if (rec.inst && rec.inst !== inst) return 'lost'
  writeToken(ls, code, { ...rec, at: now, inst, beat: now })
  return 'ok'
}

/** 放掉租約（關分頁、重新整理、離開房間）；done = 之後不再自動連回這個房間。租約已經是別的頁面的就不動 */
export function releaseLease(ls: KV, code: string, inst: string, now: number, done = false): void {
  const rec = readToken(ls, code, now)
  if (!rec || (rec.inst && rec.inst !== inst)) return
  const next: RoomToken = { tok: rec.tok, at: now }
  if (done || rec.done) next.done = true
  writeToken(ls, code, next)
}

/** 記下「目前在這個房間裡」（客人入座後定時更新）：分頁自己一份、共用一份（share = false 時只記分頁自己的）*/
export function markActive(ls: KV, tab: KV, code: string, now: number, share: boolean): void {
  const v = JSON.stringify({ code, at: now } satisfies RoomMark)
  safe(() => tab.setItem(TAB_ROOM, v), undefined)
  if (share) safe(() => ls.setItem(LAST_KEY, v), undefined)
}

/**
 * 離開房間：不再自動連回去。shared = 也清共用的那份（只在是同一個房間時才清；
 * 席位被別的分頁接手時不要清，那份已經是新分頁在更新的）
 */
export function clearActive(ls: KV, tab: KV, code: string, shared = true): void {
  if (readTabRoom(tab)?.code === code) safe(() => tab.removeItem(TAB_ROOM), undefined)
  if (shared && readLast(ls)?.code === code) safe(() => ls.removeItem(LAST_KEY), undefined)
}

/**
 * 離開房間（按了離開、被拒絕、逾時、取消自動重連…）：之後不再自動連回去。holder = 這個分頁拿著租約。
 * 還沒拿到租約就離開（例如自動重連還在等 signaling 就按了取消）：分頁之間共用、而且共用記錄沒有別的分頁在用時，也標記離開；
 * 別的分頁正在用的不動（那是正在玩的另一個分頁）。
 */
export function leaveRoom(ls: KV, tab: KV, code: string, inst: string, now: number, o: { holder: boolean; share: boolean }): void {
  if (o.holder) {
    releaseLease(ls, code, inst, now, true)
    clearActive(ls, tab, code)
    return
  }
  clearActive(ls, tab, code, false)
  if (!o.share) return
  const rec = readToken(ls, code, now)
  if (rec && !leaseLive(rec, now)) {
    writeToken(ls, code, { tok: rec.tok, at: now, done: true })
    clearActive(ls, tab, code)
  }
}

/** 這個房間的對局結束了：之後不再自動連回去（租約照舊，還在看結算、賽後聊天）*/
export function markDone(ls: KV, code: string, now: number): void {
  const rec = readToken(ls, code, now)
  if (rec && !rec.done) writeToken(ls, code, { ...rec, done: true })
}

/** 加入房間的逾時計時：計時器間隔超過這麼久（ms）就當作主執行緒剛卡過，那一段不算進等待時間 */
export const JOIN_STALL_MS = 1500

/**
 * 加入房間已經等了多久（ms）：每次計時器觸發時加上這次的間隔 gap；間隔太長（主執行緒卡住，例如重新整理後
 * 頁面還在載入、編譯 shader）的那一段不算——佇列裡可能還有主機的訊息沒處理，不能因此判定找不到主機。
 * 重新整理後的自動重連就是在頁面最忙的時候開始的。
 */
export function joinWaited(waited: number, gap: number): number {
  return gap > 0 && gap < JOIN_STALL_MS ? waited + gap : waited
}

export interface RejoinOpts {
  /** 同 PickOpts.share：開發模式只認這個分頁自己的記錄 */
  share: boolean
}

/**
 * 載入頁面時要不要自動連回某個房間，回傳房號（'' = 不要）。條件（都要有還沒過期、沒標記離開的 token）：
 * - 網址 hash 有房號（邀請連結）：這個分頁之前就在這個房間（重新整理），或分頁之間共用時這個瀏覽器有它的 token。
 *   第一次點邀請連結的人沒有 token，照舊停在主選單填名字。
 * - 這個分頁 2 分鐘內還在某個房間裡（重新整理）。
 * - 分頁之間共用時：2 分鐘內這個瀏覽器還有分頁在某個房間裡（關掉後重開）。
 * 別的分頁正在用那個 token（租約有心跳）、而且不是這個分頁自己之前用的，就不自動接手（要接手可以自己按加入）。
 */
export function rejoinTarget(ls: KV, tab: KV, hash: string, now: number, o: RejoinOpts): string {
  purgeTokens(ls, now)
  const tabRoom = readTabRoom(tab)
  /** 這個分頁自己在這個房間的記錄（重新整理前的同一個分頁）*/
  const ownTab = (code: string, within: number) => {
    const tok = tabToken(tab, code)
    if (!tok || tabRoom?.code !== code || now - tabRoom.at > within) return false
    const rec = readToken(ls, code, now)
    // 共用記錄就是這個 token 而且標了離開：不連（別的分頁按了離開也算）
    return !(rec && rec.tok === tok && rec.done)
  }
  /** 這個瀏覽器的共用記錄 */
  const shared = (code: string) => {
    if (!o.share) return false
    const rec = readToken(ls, code, now)
    if (!rec || rec.done) return false
    return !leaseLive(rec, now) || tabToken(tab, code) === rec.tok
  }
  const h = hashRoom(hash)
  if (h && (ownTab(h, TOKEN_TTL_MS) || shared(h))) return h
  if (tabRoom && validRoom(tabRoom.code) && ownTab(tabRoom.code, REJOIN_WINDOW_MS)) return tabRoom.code
  const last = readLast(ls)
  if (last && validRoom(last.code) && now - last.at <= REJOIN_WINDOW_MS && shared(last.code)) return last.code
  return ''
}
