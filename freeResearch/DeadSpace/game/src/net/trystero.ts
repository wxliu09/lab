// 正式連線：Trystero 透過公共 relay 交換 signaling，遊戲資料走 WebRTC DataChannel
import { APP_ID } from '../shared/constants'
import { Emitter, type PeerId, type Transport } from './transport'

export type SignalStrategy = 'nostr' | 'mqtt' | 'torrent'

export const DEFAULT_ICE: RTCIceServer[] = [
  { urls: ['stun:stun.l.google.com:19302', 'stun:stun1.l.google.com:19302'] },
  { urls: 'stun:stun.cloudflare.com:3478' },
]

export interface NetSettings {
  strategy: SignalStrategy
  /** 使用者貼上的 TURN 設定（JSON 陣列，RTCIceServer 格式）*/
  turn: RTCIceServer[]
}

const LS_KEY = 'xc.net'

export function loadNetSettings(): NetSettings {
  try {
    const raw = localStorage.getItem(LS_KEY)
    if (raw) {
      const v = JSON.parse(raw) as Partial<NetSettings>
      return {
        strategy: v.strategy === 'mqtt' || v.strategy === 'torrent' ? v.strategy : 'nostr',
        turn: Array.isArray(v.turn) ? v.turn.filter((s) => s && (typeof s.urls === 'string' || Array.isArray(s.urls))) : [],
      }
    }
  } catch {
    /* localStorage 不可用 */
  }
  return { strategy: 'nostr', turn: [] }
}

export function saveNetSettings(s: NetSettings): void {
  try {
    localStorage.setItem(LS_KEY, JSON.stringify(s))
  } catch {
    /* ignore */
  }
}

type JoinRoomFn = (cfg: Record<string, unknown>, roomId: string, cb?: Record<string, unknown>) => TrysteroRoom
interface TrysteroRoom {
  makeAction: (ns: string) => {
    send: (data: Uint8Array, opts?: { target?: string | string[] | null }) => Promise<void>
    onMessage: ((data: unknown, ctx: { peerId: string }) => void) | null
  }
  leave: () => Promise<void>
  onPeerJoin: ((id: string) => void) | null
  onPeerLeave: ((id: string) => void) | null
  getPeers: () => Record<string, RTCPeerConnection>
}

async function loadStrategy(s: SignalStrategy): Promise<{ joinRoom: JoinRoomFn; selfId: string }> {
  if (s === 'mqtt') return (await import('@trystero-p2p/mqtt')) as unknown as { joinRoom: JoinRoomFn; selfId: string }
  if (s === 'torrent') return (await import('@trystero-p2p/torrent')) as unknown as { joinRoom: JoinRoomFn; selfId: string }
  return (await import('trystero')) as unknown as { joinRoom: JoinRoomFn; selfId: string }
}

export class TrysteroTransport implements Transport {
  private msgEv = new Emitter<[PeerId, Uint8Array]>()
  private joinEv = new Emitter<[PeerId]>()
  private leaveEv = new Emitter<[PeerId]>()
  private sendFn: ((data: Uint8Array, opts?: { target?: string | string[] | null }) => Promise<void>) | null = null
  private constructor(
    readonly selfId: string,
    private room: TrysteroRoom,
  ) {
    const act = room.makeAction('d')
    this.sendFn = act.send
    act.onMessage = (data, ctx) => {
      const bytes =
        data instanceof Uint8Array
          ? data
          : data instanceof ArrayBuffer
            ? new Uint8Array(data)
            : ArrayBuffer.isView(data)
              ? new Uint8Array(data.buffer, data.byteOffset, data.byteLength)
              : null
      if (bytes) this.msgEv.emit(ctx.peerId, bytes)
    }
    room.onPeerJoin = (id) => this.joinEv.emit(id)
    room.onPeerLeave = (id) => this.leaveEv.emit(id)
  }

  static async create(code: string, settings: NetSettings, onError?: (msg: string) => void): Promise<TrysteroTransport> {
    const mod = await loadStrategy(settings.strategy)
    const room = mod.joinRoom(
      {
        appId: APP_ID,
        password: code,
        rtcConfig: { iceServers: [...DEFAULT_ICE, ...settings.turn] },
      },
      code,
      { onJoinError: (d: { error: string }) => onError?.(d.error) },
    )
    return new TrysteroTransport(mod.selfId, room)
  }

  send(to: PeerId, data: Uint8Array): void {
    void this.sendFn?.(data, { target: to }).catch(() => {})
  }
  broadcast(data: Uint8Array): void {
    void this.sendFn?.(data).catch(() => {})
  }
  onMessage(cb: (from: PeerId, data: Uint8Array) => void): void {
    this.msgEv.on(cb)
  }
  onPeerJoin(cb: (id: PeerId) => void): void {
    this.joinEv.on(cb)
  }
  onPeerLeave(cb: (id: PeerId) => void): void {
    this.leaveEv.on(cb)
  }
  close(): void {
    void this.room.leave().catch(() => {})
  }
}
