// 連線流程與全域 UI 狀態（Preact signals）
import { signal } from '@preact/signals'
import { PRACTICE_ROOM, type AiLevel, type ChatLine, type ClientMsg, type Command, type EndResult, type HostMsg, type LobbyPlayerInfo, type LobbySettings, type PracticeRole, type StartInfo } from '../shared/protocol/messages'
import { PLAYER_COLORS, ROOM_ALPHABET, ROOM_CODE_LEN } from '../shared/constants'
import { LoopbackHub } from '../net/loopback'
import { BroadcastChannelTransport } from '../net/broadcast'
import { NetClient } from '../net/client'
import { HostRelay } from '../net/hostRelay'
import { TrysteroTransport, loadNetSettings } from '../net/trystero'
import { randomId, type Transport } from '../net/transport'
import { ClientWorld } from './world'
import { deathLines, noteDeath } from './deathNote'
import { clearMuted } from './mute'
import { hiddenByMute } from './chatFilter'
import { hostGoneNow } from './hostGone'
import { beatLease, clearActive, joinWaited, leaveRoom, markActive, markDone, pickToken, rejoinTarget, releaseLease, type KV } from './rejoin'
import { ABORT_MSG, HOST_ABORT_MAX_MS, HOST_ABORT_WAIT_MS, isHostAbort, shouldAbortOnLeave } from './hostAbort'
import { t } from '../ui/i18n'

export type Screen = 'menu' | 'connecting' | 'lobby' | 'game'

export interface LobbyView {
  players: LobbyPlayerInfo[]
  settings: LobbySettings
  code: string
}

/** 最近一次收到的監視器回放（只有自己的）*/
export const replay = signal<Extract<HostMsg, { t: 'replay' }> | null>(null)
export const screen = signal<Screen>('menu')
export const lobby = signal<LobbyView | null>(null)
export const mySlot = signal(-1)
export const isHost = signal(false)
export const startInfo = signal<StartInfo | null>(null)
export const chatLog = signal<ChatLine[]>([])
/** 每收到一批聊天／系統訊息就呼叫（公告、音效用；不要用 chatLog 的長度判斷新訊息，它到 200 行就不再變長）*/
export const chatTaps: ((lines: ChatLine[]) => void)[] = []

function receiveChat(lines: ChatLine[]): void {
  world.addChat(lines)
  chatLog.value = [...chatLog.value, ...lines].slice(-200)
  // 死因收給死亡橫幅（只在那裡顯示，見 deathNote.ts）
  noteDeath(lines)
  // 被本機封鎖的人說的話：照樣收進 chatLog（解除封鎖後看得到），但不交給公告與音效（聊天紀錄、頭頂泡泡在顯示時略過）
  const heard = lines.filter((l) => !hiddenByMute(l))
  if (heard.length) for (const tap of chatTaps) tap(heard)
}
export const endResult = signal<EndResult | null>(null)
export const notice = signal('')
/** 最近一則主機 notice 的 key（畫面判斷用 key，不用翻譯後的字串：切換語言後仍認得出來）*/
export const noticeKey = signal('')
/** 收到 start 之後還沒回報 loaded */
let loadPending = false
/** 回報 loaded 的本地時間（performance.now，ms；0 = 這局還沒回報）*/
let loadSentAt = 0

/**
 * 主機的「還在等幾個人載入」（world.w.ld）裡面算不算自己：還沒回報 loaded、或剛回報、主機那邊可能還沒收到（rtt 內）時算。
 * 練習局只有自己一個真人時，等的就是自己，不能寫成「等待其他玩家」。
 */
export function selfInLoadWait(now = performance.now(), rttMs = rtt()): boolean {
  if (loadPending || !loadSentAt) return true
  return now - loadSentAt < Math.max(400, rttMs * 1.5 + 150)
}
/** 這次連線有別的 peer 自稱主機（大廳的提示用；整次連線都留著）*/
export const hostConflict = signal(false)
/** 最近 HOST_CONFLICT_SHOW_MS 內又有冒充者送訊息：對局中的 HUD 橫幅「有其他連線自稱主機，已忽略」據此顯示 */
export const hostConflictLive = signal(false)
export const HOST_CONFLICT_SHOW_MS = 10000
/** 自動重新連線中的房號（重新整理後，主選單顯示「正在重新連回房間 XXXXX…」，可以取消；'' = 不是自動重連）*/
export const rejoining = signal('')
/** 主機正在中止這局（送出中止、等結算送出去；GameMenu 的離開按鈕暫時停用）*/
export const hostLeaving = signal(false)
/** 客人：這局是主機中止的（收過「主機中止」的結算；關掉結算畫面後 HUD 照樣說明、不跳「主機已離開」對話框蓋住結算）*/
export const hostAbortEnd = signal(false)
/** 每次快照後遞增，讓 HUD 重新讀取 world.me */
export const snapTick = signal(0)
export const connLost = signal(false)
/**
 * 客人端：主機確定離開了（失聯後過了寬限時間仍沒有重新連上，hostGone.ts）。Banner 改顯示「主機已離開」對話框；
 * 寬限內維持「與主機的連線中斷」橫幅與自動重連，重連成功（welcome）就清掉。
 */
export const hostGone = signal(false)
/** 最後一次收到主機任何訊息的本地時間（performance.now，ms；0 = 還沒收過）*/
let lastHostMsgAt = 0
/** 傳輸層回報主機失聯的時間、與當時最後一次收到主機訊息的時間（0 = 沒有失聯）*/
let lostAt = 0
let lostMsgAt = 0
let goneTimer: ReturnType<typeof setInterval> | null = null
function watchGone(on: boolean): void {
  if (goneTimer) clearInterval(goneTimer)
  goneTimer = null
  hostGone.value = false
  lostAt = 0
  if (!on) return
  lostAt = performance.now()
  lostMsgAt = lastHostMsgAt
  let last = lostAt
  goneTimer = setInterval(() => {
    const now = performance.now()
    // 自己的主執行緒剛卡過（計時器遲到）：佇列裡可能還有主機的訊息沒處理，這一輪不判斷
    const late = now - last > 1500
    last = now
    if (late) return
    if (!connLost.value || isHost.value) return watchGone(false)
    if (hostGoneNow(now, lostAt, lostMsgAt, lastHostMsgAt)) {
      hostGone.value = true
      if (goneTimer) clearInterval(goneTimer)
      goneTimer = null
    }
  }, 500)
}
/**
 * 主機超過 1.5 秒沒送快照（多半是主機在建站體、編譯 shader）：客人顯示「主機載入中…」輕提示，恢復後自動消失。
 * 跟傳輸層的 10 秒失聯偵測無關。
 */
export const hostStall = signal(false)

export const world = new ClientWorld()

const STALL_MS = 1500
let stallTimer: ReturnType<typeof setInterval> | null = null
function watchStall(on: boolean): void {
  if (stallTimer) clearInterval(stallTimer)
  stallTimer = null
  hostStall.value = false
  if (!on) return
  const since = performance.now()
  let last = since
  stallTimer = setInterval(() => {
    const now = performance.now()
    // 自己的主執行緒剛卡過（計時器遲到）：佇列裡的快照還沒處理，這一輪不判斷
    const late = now - last > 1000
    last = now
    if (late) return
    const v = screen.value === 'game' && world.snapStale(now, since, STALL_MS)
    if (v !== hostStall.value) hostStall.value = v
  }, 250)
}

let net: NetClient | null = null
let relay: HostRelay | null = null
let cmdSeq = 1
let roomCode = ''

export interface Profile {
  name: string
  color: number
}

export function loadProfile(): Profile {
  try {
    const raw = localStorage.getItem('xc.profile')
    if (raw) {
      const p = JSON.parse(raw) as Profile
      if (typeof p.name === 'string' && typeof p.color === 'number') return p
    }
  } catch {
    /* ignore */
  }
  return { name: '', color: Math.floor(Math.random() * PLAYER_COLORS.length) }
}

export function saveProfile(p: Profile): void {
  try {
    localStorage.setItem('xc.profile', JSON.stringify(p))
  } catch {
    /* ignore */
  }
}

/** 主機（建房、練習）用的 token：只在這個分頁（主機一重新整理房間就沒了，用不到跨分頁）*/
function sessionToken(code: string): string {
  const key = 'xc.tok.' + code
  try {
    const have = sessionStorage.getItem(key)
    if (have) return have
    const tok = randomId(24)
    sessionStorage.setItem(key, tok)
    return tok
  } catch {
    return randomId(24)
  }
}

/** 這次載入頁面的識別碼（重連 token 的租約用，見 rejoin.ts）*/
const PAGE_INST = randomId(10)
/** 這個分頁拿著租約的房號（客人；'' = 沒有）*/
let leaseRoom = ''

function stores(): { ls: KV; tab: KV } | null {
  try {
    return { ls: localStorage, tab: sessionStorage }
  } catch {
    return null
  }
}

/** 分頁之間共用 token：正式連線才共用；同一瀏覽器多分頁的開發／e2e 模式（?net=bc）每個分頁是不同的玩家 */
function shareTabs(): boolean {
  return netMode() !== 'bc'
}

/** 客人加入房間用的 token：依房號存在 localStorage（重新整理、開新分頁都能回到原席位；rejoin.ts）*/
function guestToken(code: string): string {
  leaseRoom = ''
  const st = stores()
  if (!st) return randomId(24)
  const r = pickToken(st.ls, st.tab, code, { now: Date.now(), inst: PAGE_INST, share: shareTabs(), gen: () => randomId(24) })
  if (r.shared) leaseRoom = code
  return r.tok
}

/**
 * 客人在房間裡時每秒一次：租約心跳（被別的分頁接手就中斷連線）、記下「目前在這個房間」（入座後、結算前）。
 * 重新整理後 rejoin.ts 的 rejoinTarget 據此自動連回去。
 */
function roomTick(): void {
  if (isHost.value || !roomCode || roomCode === PRACTICE_ROOM) return
  const st = stores()
  if (!st) return
  const now = Date.now()
  if (leaseRoom === roomCode && beatLease(st.ls, roomCode, PAGE_INST, now) === 'lost') return seatTaken()
  if (mySlot.value >= 0 && (screen.value === 'lobby' || screen.value === 'game') && !endResult.value) markActive(st.ls, st.tab, roomCode, now, shareTabs() && leaseRoom === roomCode)
}

/** 同一個 token 被另一個分頁接手了（伺服器已經把席位交給它）：這個分頁中斷連線並說明，不再動共用的記錄 */
function seatTaken(): void {
  const st = stores()
  if (st) clearActive(st.ls, st.tab, roomCode, false)
  leaseRoom = ''
  joinSeq++
  leave(false)
  notice.value = t('r5c.seatTaken')
}

/** 離開房間（按了離開、被拒絕、逾時、取消…）：放掉租約、之後不再自動連回這個房間（rejoin.ts leaveRoom）*/
function forgetRoom(): void {
  const st = stores()
  const holder = leaseRoom !== '' && leaseRoom === roomCode
  leaseRoom = ''
  if (!st || isHost.value || !roomCode || roomCode === PRACTICE_ROOM) return
  leaveRoom(st.ls, st.tab, roomCode, PAGE_INST, Date.now(), { holder, share: shareTabs() })
}

let autoTried = false
/**
 * 主選單第一次出現時呼叫一次：網址 hash 有房號、或 2 分鐘內還在某個房間裡（重新整理、關掉重開），
 * 而且這個瀏覽器有那個房間的 token，就自動連回原席位（rejoin.ts rejoinTarget）。回傳房號（'' = 沒有自動連線）。
 */
export function autoRejoinOnce(hash = typeof location !== 'undefined' ? location.hash : ''): string {
  if (autoTried) return ''
  autoTried = true
  if (screen.value !== 'menu') return ''
  const st = stores()
  if (!st) return ''
  const code = rejoinTarget(st.ls, st.tab, hash, Date.now(), { share: shareTabs() })
  if (!code) return ''
  rejoining.value = code
  void joinRoom(code, loadProfile())
  return code
}

export function genRoomCode(): string {
  const buf = new Uint8Array(ROOM_CODE_LEN)
  crypto.getRandomValues(buf)
  let s = ''
  for (const b of buf) s += ROOM_ALPHABET[b % ROOM_ALPHABET.length]
  return s
}

/** 'bc' = 同一瀏覽器多分頁（開發／e2e），否則 Trystero */
export function netMode(): 'bc' | 'trystero' {
  const q = new URLSearchParams(location.search).get('net')
  if (q === 'bc') return 'bc'
  if (q === 'p2p') return 'trystero'
  return loadNetSettings().strategy === ('local' as never) ? 'bc' : 'trystero'
}

async function makeTransport(code: string): Promise<Transport> {
  if (netMode() === 'bc') return new BroadcastChannelTransport(code)
  return TrysteroTransport.create(code, loadNetSettings(), (err) => {
    notice.value = err
  })
}

/** 測試 build：記錄收到的訊息型別（e2e 檢查其他分頁沒有多收任何東西）*/
const recvLog: string[] = []

/**
 * 收到 start 時要不要保留聊天紀錄：重連或主機短暫失聯後，主機會對同一局（gid 相同）、同一個 slot 重送 start，
 * 這時保留；新的一局（或換了 slot、舊主機沒有 gid）才清空。
 */
export function isRestartOfSameGame(prev: StartInfo | null, next: StartInfo): boolean {
  return !!prev && prev.gid !== undefined && prev.gid === next.gid && prev.slot === next.slot
}

function onHostMsg(m: HostMsg): void {
  if (__TEST_HOOKS__) {
    recvLog.push(m.t)
    if (recvLog.length > 5000) recvLog.splice(0, 1000)
  }
  lastHostMsgAt = performance.now()
  switch (m.t) {
    case 'welcome':
      mySlot.value = m.slot
      connLost.value = false
      rejoining.value = ''
      watchGone(false)
      if (screen.value === 'connecting') screen.value = 'lobby'
      roomTick()
      break
    case 'reject':
      notice.value = t('reject.' + m.reason)
      leave(false)
      break
    case 'lobbyState':
      lobby.value = { players: m.players, settings: m.settings, code: m.code }
      if (practiceBots && isHost.value) {
        const n = practiceBots
        practiceBots = 0
        send({ t: 'settings', s: { bots: n } })
        // AI 難度分開送：主機的驗證遇到不認得的欄位會整則丟掉（例如舊版主機），不要連累 AI 數量
        send({ t: 'settings', s: { aiLevel: practiceAi } })
        send(practiceRole === 'random' ? { t: 'start' } : { t: 'start', role: practiceRole })
      }
      break
    case 'start': {
      const keep = isRestartOfSameGame(startInfo.value, m.info)
      world.reset()
      startInfo.value = m.info
      loadPending = true
      loadSentAt = 0
      endResult.value = null
      hostAbortEnd.value = false
      if (!keep) {
        chatLog.value = []
        deathLines.value = []
        // 本機封鎖只管這一局（換局清空；同一局重連照樣保留）
        clearMuted()
      }
      screen.value = 'game'
      watchStall(true)
      break
    }
    case 'replay':
      replay.value = m
      break
    case 'zones':
      if (startInfo.value) startInfo.value = { ...startInfo.value, zones: m.zones }
      break
    case 'snap':
      world.apply(m.s)
      snapTick.value++
      if (loadPending) {
        // 開局後第一份快照：等場景建好、畫出畫面（主執行緒忙完、兩個 rAF 之後）再告訴主機可以開始
        loadPending = false
        requestAnimationFrame(() =>
          requestAnimationFrame(() => {
            loadSentAt = performance.now()
            send({ t: 'loaded' })
          }),
        )
      }
      break
    case 'chat':
      receiveChat(m.lines)
      break
    case 'end': {
      endResult.value = m.result
      if (!isHost.value && isHostAbort(m.result)) hostAbortEnd.value = true
      // 這局結束了：之後重新整理不再自動連回這個房間（還連著，照常看結算、賽後聊天）
      const st = stores()
      if (st && !isHost.value && roomCode && roomCode !== PRACTICE_ROOM) {
        if (leaseRoom === roomCode) markDone(st.ls, roomCode, Date.now())
        clearActive(st.ls, st.tab, roomCode, leaseRoom === roomCode)
      }
      break
    }
    case 'notice':
      noticeKey.value = m.key
      notice.value = t(m.key, m.args)
      break
    default:
      for (const h of extraHandlers) h(m)
  }
}

const extraHandlers: ((m: HostMsg) => void)[] = []
/** 其他模組（除錯工具等）訂閱主機訊息 */
export function onHost(h: (m: HostMsg) => void): void {
  extraHandlers.push(h)
}

function attach(client: NetClient): void {
  net = client
  hostConflict.value = false
  hostConflictLive.value = false
  client.onMsg(onHostMsg)
  client.onHostLost(() => {
    if (net !== client) return
    connLost.value = true
    if (!isHost.value) {
      notice.value = t('net.hostLost')
      watchGone(true)
    }
  })
  // 每秒：冒充主機的警告（入座後別的 peer 自稱主機，net/client.ts 已經忽略它）、客人的房間記錄（rejoin.ts）
  const watchConflict = setInterval(() => {
    if (net !== client) return clearInterval(watchConflict)
    if (client.hostConflict && !hostConflict.value) hostConflict.value = true
    const live = client.hostConflictAt > 0 && performance.now() - client.hostConflictAt < HOST_CONFLICT_SHOW_MS
    if (live !== hostConflictLive.value) hostConflictLive.value = live
    roomTick()
  }, 1000)
}

export async function createRoom(profile: Profile): Promise<void> {
  saveProfile(profile)
  const seq = ++joinSeq
  roomCode = genRoomCode()
  screen.value = 'connecting'
  notice.value = ''
  isHost.value = true
  let transport: Awaited<ReturnType<typeof makeTransport>>
  try {
    transport = await makeTransport(roomCode)
  } catch {
    if (seq === joinSeq) {
      leave(false)
      notice.value = t('menu.noHost')
    }
    return
  }
  if (seq !== joinSeq || screen.value !== 'connecting') {
    // 等 signaling 的期間按了取消（或改去加入別的房間）：不要在背景建起看不見的房間
    transport.close()
    return
  }
  const seed = (crypto.getRandomValues(new Uint32Array(1))[0] & 0x7fffffff) || 1
  relay = new HostRelay(roomCode, transport, seed)
  const client = new NetClient(relay.local, { ...profile, token: sessionToken(roomCode) })
  attach(client)
  exposeTestHooks()
}

/** 單機練習：不連網，主機分頁自己跑模擬，其餘座位由 AI 填滿；role = 指定自己的身分（random = 照一般規則抽）*/
let practiceBots = 0
let practiceRole: PracticeRole = 'random'
/** AI 難度（LobbySettings.aiLevel）：easy = AI 船員驗血較慢、不公開指認、不主動開火 */
let practiceAi: AiLevel = 'normal'
export async function startPractice(profile: Profile, bots = 5, role: PracticeRole = 'random', ai: AiLevel = 'normal'): Promise<void> {
  saveProfile(profile)
  roomCode = PRACTICE_ROOM
  screen.value = 'connecting'
  notice.value = ''
  isHost.value = true
  // 還在建立中的加入／建房連線作廢
  joinSeq++
  practiceBots = Math.max(1, Math.min(11, bots))
  practiceRole = role
  practiceAi = ai
  const transport = new LoopbackHub().connect('host')
  const seed = (crypto.getRandomValues(new Uint32Array(1))[0] & 0x7fffffff) || 1
  relay = new HostRelay(roomCode, transport, seed)
  const client = new NetClient(relay.local, { ...profile, token: sessionToken(roomCode) })
  attach(client)
  exposeTestHooks()
}

/** 加入房間的等待上限：超過就放棄、回到主選單（按鈕恢復可用），並說明原因 */
export const JOIN_TIMEOUT_S = 25
/** 每次加入／取消都遞增：取消後，還在建立中的連線不會再接上來 */
let joinSeq = 0

export async function joinRoom(code: string, profile: Profile): Promise<void> {
  saveProfile(profile)
  const seq = ++joinSeq
  roomCode = code.trim().toUpperCase()
  screen.value = 'connecting'
  notice.value = ''
  isHost.value = false
  // 逾時從按下加入就開始算（signaling 本身卡住也會逾時）。主執行緒卡住的時間不算（rejoin.ts joinWaited）：
  // 重新整理後的自動重連是在頁面最忙（載入、編譯 shader）的時候開始的，主機的回應可能還排在佇列裡
  let client: NetClient | null = null
  let waited = 0
  let last = performance.now()
  const timer = setInterval(() => {
    if (seq !== joinSeq || screen.value !== 'connecting' || net !== client) return clearInterval(timer)
    const now = performance.now()
    waited = joinWaited(waited, now - last)
    last = now
    if (waited < JOIN_TIMEOUT_S * 1000) return
    clearInterval(timer)
    const msg = client?.hostPeer ? t('menu.joinTimeout', { s: JOIN_TIMEOUT_S }) : t('menu.noHost')
    joinSeq++
    leave(false)
    notice.value = msg
  }, 500)
  let transport: Awaited<ReturnType<typeof makeTransport>>
  try {
    transport = await makeTransport(roomCode)
  } catch {
    if (seq === joinSeq) {
      joinSeq++
      leave(false)
      notice.value = t('menu.noHost')
    }
    return
  }
  if (seq !== joinSeq || screen.value !== 'connecting') {
    // 等 signaling 的期間按了取消（或改去建立房間）
    transport.close()
    return
  }
  client = new NetClient(transport, { ...profile, token: guestToken(roomCode) })
  attach(client)
}

/** 取消加入房間：關掉連線、回到主選單 */
export function cancelJoin(): void {
  joinSeq++
  leave()
}

export function leave(clear = true): void {
  forgetRoom()
  rejoining.value = ''
  hostLeaving.value = false
  hostAbortEnd.value = false
  hostConflict.value = false
  hostConflictLive.value = false
  net?.close()
  relay?.close()
  net = null
  relay = null
  screen.value = 'menu'
  lobby.value = null
  startInfo.value = null
  mySlot.value = -1
  isHost.value = false
  world.reset()
  watchStall(false)
  connLost.value = false
  watchGone(false)
  lastHostMsgAt = 0
  clearMuted()
  if (clear) notice.value = ''
}

export function send(m: ClientMsg): void {
  net?.send(m)
}

/** 現在離開的話要不要先中止這局（主機、多人局、對局中、還沒結算；hostAbort.ts）*/
function abortNeeded(): boolean {
  return shouldAbortOnLeave({ isHost: isHost.value, practice: roomCode === PRACTICE_ROOM, inGame: screen.value === 'game' && !!relay, ended: !!endResult.value, simFailed: !!relay?.failed })
}

/**
 * 離開對局（GameMenu 的離開確認）：主機在多人對局中離開時，先叫 worker 中止這局（所有人的身分揭曉、結算送給每位客人），
 * 等 worker 回報處理完（結算已交給傳輸層）、而且至少 HOST_ABORT_WAIT_MS 讓訊息真的送出去，再終止 worker、回主選單。
 * 其他情況（客人、練習局、已經結算）直接離開。
 */
export async function leaveGame(): Promise<void> {
  const r = relay
  if (!abortNeeded() || !r) return leave()
  if (hostLeaving.value) return
  hostLeaving.value = true
  const t0 = performance.now()
  const acked = r.waitAborted(HOST_ABORT_MAX_MS)
  send(ABORT_MSG)
  await acked
  const rest = HOST_ABORT_WAIT_MS - (performance.now() - t0)
  if (rest > 0) await new Promise((res) => setTimeout(res, rest))
  // 等的期間已經離開（例如模擬錯誤橫幅的「回主選單」）就不用再關一次
  if (relay === r) leave()
  hostLeaving.value = false
}

// 主機關分頁、重新整理：盡量也送出中止（pagehide 時主執行緒馬上就要停了，worker 的結算不一定來得及轉送出去；
// 對局中關分頁本來就會先跳 App.tsx 的確認，所以不在 beforeunload 送——按「留下」的話這局就白白結束了）。
// 客人：放掉 token 的租約（不標記離開：重新整理後要自動連回去）
if (typeof window !== 'undefined' && typeof window.addEventListener === 'function') {
  window.addEventListener('pagehide', () => {
    if (abortNeeded()) send(ABORT_MSG)
    const st = stores()
    if (st && leaseRoom) releaseLease(st.ls, leaseRoom, PAGE_INST, Date.now())
  })
}

/** 送出指令時的旁聽（音訊回饋）*/
export const cmdTaps: ((c: Command) => void)[] = []

export function sendCmd(c: Command): void {
  for (const tap of cmdTaps) tap(c)
  net?.send({ t: 'cmd', seq: cmdSeq++, c })
}

export function rtt(): number {
  return net?.rtt ?? 0
}

export function hostTickMs(): number {
  return relay?.tickMs ?? 0
}

export function currentRoom(): string {
  return roomCode
}

function exposeTestHooks(): void {
  if (!__TEST_HOOKS__) return
  ;(window as unknown as Record<string, unknown>).__xcTest = {
    hook: (op: string, args: unknown[] = []) => relay?.hook(op, args),
    world,
    send,
    sendCmd,
  }
}

if (__TEST_HOOKS__) {
  ;(window as unknown as Record<string, unknown>).__xcState = { world, screen, lobby, mySlot, chatLog, endResult, recvLog, receiveChat, connLost, hostGone, hostConflictLive, rejoining }
}
