// 連線流程與全域 UI 狀態（Preact signals）
import { signal } from '@preact/signals'
import type { ChatLine, ClientMsg, Command, EndResult, HostMsg, LobbyPlayerInfo, LobbySettings, StartInfo } from '../shared/protocol/messages'
import { PLAYER_COLORS, ROOM_ALPHABET, ROOM_CODE_LEN } from '../shared/constants'
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

export const screen = signal<Screen>('menu')
export const lobby = signal<LobbyView | null>(null)
export const mySlot = signal(-1)
export const isHost = signal(false)
export const startInfo = signal<StartInfo | null>(null)
export const chatLog = signal<ChatLine[]>([])
export const endResult = signal<EndResult | null>(null)
export const notice = signal('')
export const hostConflict = signal(false)
/** 每次快照後遞增，讓 HUD 重新讀取 world.me */
export const snapTick = signal(0)
export const connLost = signal(false)

export const world = new ClientWorld()

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

function onHostMsg(m: HostMsg): void {
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
      break
    case 'start':
      world.reset()
      startInfo.value = m.info
      endResult.value = null
      chatLog.value = []
      screen.value = 'game'
      break
    case 'zones':
      if (startInfo.value) startInfo.value = { ...startInfo.value, zones: m.zones }
      break
    case 'snap':
      world.apply(m.s)
      snapTick.value++
      break
    case 'chat':
      world.addChat(m.lines)
      chatLog.value = [...chatLog.value, ...m.lines].slice(-200)
      break
    case 'end':
      endResult.value = m.result
      break
    case 'notice':
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
  roomCode = genRoomCode()
  screen.value = 'connecting'
  notice.value = ''
  isHost.value = true
  const transport = await makeTransport(roomCode)
  const seed = (crypto.getRandomValues(new Uint32Array(1))[0] & 0x7fffffff) || 1
  relay = new HostRelay(roomCode, transport, seed)
  const client = new NetClient(relay.local, { ...profile, token: sessionToken(roomCode) })
  attach(client)
  exposeTestHooks()
}

export async function joinRoom(code: string, profile: Profile): Promise<void> {
  saveProfile(profile)
  roomCode = code.trim().toUpperCase()
  screen.value = 'connecting'
  notice.value = ''
  isHost.value = false
  const transport = await makeTransport(roomCode)
  const client = new NetClient(transport, { ...profile, token: sessionToken(roomCode) })
  attach(client)
  setTimeout(() => {
    if (screen.value === 'connecting' && net === client && !client.hostPeer) notice.value = t('menu.noHost')
  }, 25000)
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
  if (clear) notice.value = ''
}

export function send(m: ClientMsg): void {
  net?.send(m)
}

export function sendCmd(c: Command): void {
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
  ;(window as unknown as Record<string, unknown>).__xcState = { world, screen, lobby, mySlot, chatLog, endResult }
}
