// peer 訊息白名單：型別、長度、數值範圍都要合法，否則整則丟棄。
// 這裡是不信任邊界：任何 peer 都可能送出任意位元組。
import type { ChatChannel, ClientMsg, Command, CommandKind, LobbySettings, NoteMark } from './messages'
import { MAX_CLIENT_MSG_BYTES, decode } from './codec'
import { MAX_PLAYERS, PLAYER_COLORS } from '../constants'

const COMMANDS: ReadonlySet<CommandKind> = new Set<CommandKind>([
  'move', 'amove', 'attack', 'stop', 'hold', 'cast', 'use', 'drop', 'pickup', 'swapItem', 'give',
  'interact', 'buy', 'evolve', 'autocast',
])
const CHANNELS: ReadonlySet<ChatChannel> = new Set<ChatChannel>(['all', 'team', 'group', 'dead'])
const MARKS: ReadonlySet<NoteMark> = new Set<NoteMark>(['none', 'trust', 'suspect', 'confirmedEvil', 'confirmedClean'])
const ID_RE = /^[a-zA-Z0-9_.:-]{1,48}$/

type Obj = Record<string, unknown>
const isObj = (v: unknown): v is Obj => typeof v === 'object' && v !== null && !Array.isArray(v)
const isNum = (v: unknown, min = -1e7, max = 1e7): v is number =>
  typeof v === 'number' && Number.isFinite(v) && v >= min && v <= max
const isInt = (v: unknown, min: number, max: number): v is number => isNum(v, min, max) && Number.isInteger(v)
const isStr = (v: unknown, maxLen: number): v is string => typeof v === 'string' && v.length <= maxLen
const isBool = (v: unknown): v is boolean => typeof v === 'boolean'

/** 名稱：去掉控制字元與前後空白，限 16 字 */
export function sanitizeName(s: string): string {
  // eslint-disable-next-line no-control-regex
  return s.replace(/[\u0000-\u001f\u007f-\u009f\u200b-\u200f\u2028-\u202e\u2060-\u206f\ufeff]/g, '').trim().slice(0, 16)
}

export function sanitizeText(s: string, max = 200): string {
  // eslint-disable-next-line no-control-regex
  return s.replace(/[\u0000-\u0008\u000b-\u001f\u007f-\u009f\u202a-\u202e\u2066-\u2069]/g, '').slice(0, max)
}

function validCommand(c: unknown): Command | null {
  if (!isObj(c)) return null
  if (!COMMANDS.has(c.k as CommandKind)) return null
  const out: Command = { k: c.k as CommandKind }
  if (c.x !== undefined) {
    if (!isNum(c.x, -10000, 10000)) return null
    out.x = c.x
  }
  if (c.y !== undefined) {
    if (!isNum(c.y, -10000, 10000)) return null
    out.y = c.y
  }
  if (c.e !== undefined) {
    if (!isInt(c.e, 0, 0x7fffffff)) return null
    out.e = c.e
  }
  if (c.a !== undefined) {
    if (!isStr(c.a, 48) || !ID_RE.test(c.a)) return null
    out.a = c.a
  }
  if (c.s !== undefined) {
    if (!isInt(c.s, 0, 16)) return null
    out.s = c.s
  }
  if (c.q !== undefined) {
    if (!isBool(c.q)) return null
    out.q = c.q
  }
  return out
}

function validSettings(s: unknown): Partial<LobbySettings> | null {
  if (!isObj(s)) return null
  const out: Partial<LobbySettings> = {}
  const tri = (v: unknown) => v === 'auto' || v === 0 || v === 1
  for (const [k, v] of Object.entries(s)) {
    switch (k) {
      case 'aliens':
      case 'mutants':
      case 'androids':
        if (!tri(v)) return null
        out[k] = v as 'auto' | 0 | 1
        break
      case 'npcCrew':
        if (!isInt(v, -1, 8)) return null
        out.npcCrew = v
        break
      case 'bots':
        if (!isInt(v, 0, MAX_PLAYERS - 1)) return null
        out.bots = v
        break
      case 'stations':
        if (v === 'auto') out.stations = 'auto'
        else if (Array.isArray(v) && v.length <= 16 && v.every((x) => isStr(x, 24) && ID_RE.test(x)))
          out.stations = v as string[]
        else return null
        break
      case 'apocalypse':
        if (!Array.isArray(v) || v.length !== 2 || !isNum(v[0], 5, 120) || !isNum(v[1], 5, 120) || v[0] > v[1])
          return null
        out.apocalypse = [v[0], v[1]]
        break
      case 'localChat':
      case 'bootOnDeath':
      case 'hostSpectate':
        if (!isBool(v)) return null
        out[k] = v
        break
      case 'epMult':
      case 'eventMult':
        if (!isNum(v, 0.25, 4)) return null
        out[k] = v
        break
      case 'seed':
        if (!isInt(v, 0, 0x7fffffff)) return null
        out.seed = v
        break
      default:
        return null
    }
  }
  return out
}

/** 驗證一則 client 訊息；不合法回傳 null */
export function validateClientMsg(raw: unknown): ClientMsg | null {
  if (!isObj(raw) || typeof raw.t !== 'string') return null
  switch (raw.t) {
    case 'hello':
      if (!isStr(raw.name, 64) || !isInt(raw.color, 0, PLAYER_COLORS.length - 1)) return null
      if (!isInt(raw.ver, 0, 1e6) || !isStr(raw.token, 64) || !/^[a-zA-Z0-9]{8,64}$/.test(raw.token)) return null
      return { t: 'hello', name: raw.name, color: raw.color, ver: raw.ver, token: raw.token }
    case 'lobby': {
      const out: ClientMsg = { t: 'lobby' }
      if (raw.name !== undefined) {
        if (!isStr(raw.name, 64)) return null
        out.name = raw.name
      }
      if (raw.color !== undefined) {
        if (!isInt(raw.color, 0, PLAYER_COLORS.length - 1)) return null
        out.color = raw.color
      }
      if (raw.ready !== undefined) {
        if (!isBool(raw.ready)) return null
        out.ready = raw.ready
      }
      return out
    }
    case 'settings': {
      const s = validSettings(raw.s)
      return s ? { t: 'settings', s } : null
    }
    case 'start':
      return { t: 'start' }
    case 'kick':
      return isInt(raw.slot, 0, MAX_PLAYERS - 1) ? { t: 'kick', slot: raw.slot } : null
    case 'cmd': {
      if (!isInt(raw.seq, 0, 0x7fffffff)) return null
      const c = validCommand(raw.c)
      return c ? { t: 'cmd', seq: raw.seq, c } : null
    }
    case 'chat':
      if (!CHANNELS.has(raw.ch as ChatChannel) || !isStr(raw.text, 400)) return null
      if (raw.to !== undefined && !(isStr(raw.to, 24) && ID_RE.test(raw.to))) return null
      return { t: 'chat', ch: raw.ch as ChatChannel, text: raw.text, ...(raw.to !== undefined ? { to: raw.to as string } : {}) }
    case 'ping':
      return isNum(raw.n, 0, 1e15) ? { t: 'ping', n: raw.n } : null
    case 'vote':
      if (!isStr(raw.v, 24) || !ID_RE.test(raw.v)) return null
      if (raw.arg !== undefined && !isInt(raw.arg, 0, 64)) return null
      return { t: 'vote', v: raw.v, ...(raw.arg !== undefined ? { arg: raw.arg as number } : {}) }
    case 'note':
      if (!isInt(raw.target, 0, MAX_PLAYERS - 1) || !MARKS.has(raw.mark as NoteMark)) return null
      if (raw.text !== undefined && !isStr(raw.text, 200)) return null
      return { t: 'note', target: raw.target, mark: raw.mark as NoteMark, ...(raw.text !== undefined ? { text: raw.text as string } : {}) }
    case 'shareNotes':
      return isInt(raw.to, 0, MAX_PLAYERS - 1) ? { t: 'shareNotes', to: raw.to } : null
    case 'Tune':
      if (!isInt(raw.id, 0, 0x7fffffff) || !isStr(raw.op, 24) || !/^[a-zA-Z]{1,24}$/.test(raw.op)) return null
      if (!Array.isArray(raw.args) || raw.args.length > 4) return null
      for (const a of raw.args) {
        if (!(a === null || isBool(a) || isNum(a) || isStr(a, 48))) return null
      }
      return { t: 'Tune', id: raw.id, op: raw.op, args: raw.args }
    default:
      return null
  }
}

/** 位元組 → 驗證過的訊息 */
export function parseClientBytes(data: unknown): ClientMsg | null {
  if (!(data instanceof Uint8Array) || data.byteLength === 0 || data.byteLength > MAX_CLIENT_MSG_BYTES) return null
  return validateClientMsg(decode(data))
}
