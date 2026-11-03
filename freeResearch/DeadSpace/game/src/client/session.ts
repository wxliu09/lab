// 連線流程與全域 UI 狀態（Preact signals）
import { signal } from '@preact/signals'
import { PRACTICE_ROOM, type ChatLine, type ClientMsg, type Command, type EndResult, type HostMsg, type LobbyPlayerInfo, type LobbySettings, type PracticeRole, type StartInfo } from '../shared/protocol/messages'
import { PLAYER_COLORS, ROOM_ALPHABET, ROOM_CODE_LEN } from '../shared/constants'
import { LoopbackHub } from '../net/loopback'
import { BroadcastChannelTransport } from '../net/broadcast'
import { NetClient } from '../net/client'
import { HostRelay } from '../net/hostRelay'
import { TrysteroTransport, loadNetSettings } from '../net/trystero'
import { randomId, type Transport } from '../net/transport'
import { ClientWorld } from './world'
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
  for (const tap of chatTaps) tap(lines)
}
export const endResult = signal<EndResult | null>(null)
export const notice = signal('')
/** 最近一則主機 notice 的 key（畫面判斷用 key，不用翻譯後的字串：切換語言後仍認得出來）*/
export const noticeKey = signal('')
export const hostConflict = signal(false)
/** 每次快照後遞增，讓 HUD 重新讀取 world.me */
export const snapTick = signal(0)
export const connLost = signal(false)
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
  switch (m.t) {
    case 'welcome':
      mySlot.value = m.slot
      connLost.value = false
      if (screen.value === 'connecting') screen.value = 'lobby'
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
        send(practiceRole === 'random' ? { t: 'start' } : { t: 'start', role: practiceRole })
      }
      break
    case 'start': {
      const keep = isRestartOfSameGame(startInfo.value, m.info)
      world.reset()
      startInfo.value = m.info
      endResult.value = null
      if (!keep) chatLog.value = []
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
      break
    case 'chat':
      receiveChat(m.lines)
      break
    case 'end':
      endResult.value = m.result
      break
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
  client.onMsg(onHostMsg)
  client.onHostLost(() => {
    connLost.value = true
    if (!isHost.value) notice.value = t('net.hostLost')
  })
  const watchConflict = setInterval(() => {
    if (!net) clearInterval(watchConflict)
    else if (net.hostConflict && !hostConflict.value) hostConflict.value = true
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
export async function startPractice(profile: Profile, bots = 5, role: PracticeRole = 'random'): Promise<void> {
  saveProfile(profile)
  roomCode = PRACTICE_ROOM
  screen.value = 'connecting'
  notice.value = ''
  isHost.value = true
  // 還在建立中的加入／建房連線作廢
  joinSeq++
  practiceBots = Math.max(1, Math.min(11, bots))
  practiceRole = role
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
  // 逾時從按下加入就開始算（signaling 本身卡住也會逾時）
  let client: NetClient | null = null
  setTimeout(() => {
    if (seq !== joinSeq || screen.value !== 'connecting' || net !== client) return
    const msg = client?.hostPeer ? t('menu.joinTimeout', { s: JOIN_TIMEOUT_S }) : t('menu.noHost')
    joinSeq++
    leave(false)
    notice.value = msg
  }, JOIN_TIMEOUT_S * 1000)
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
  client = new NetClient(transport, { ...profile, token: sessionToken(roomCode) })
  attach(client)
}

/** 取消加入房間：關掉連線、回到主選單 */
export function cancelJoin(): void {
  joinSeq++
  leave()
}

export function leave(clear = true): void {
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
  if (clear) notice.value = ''
}

export function send(m: ClientMsg): void {
  net?.send(m)
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
  ;(window as unknown as Record<string, unknown>).__xcState = { world, screen, lobby, mySlot, chatLog, endResult, recvLog, receiveChat }
}
