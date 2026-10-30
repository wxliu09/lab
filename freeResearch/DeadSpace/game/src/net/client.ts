// NetClient：連到主機、送 Hello、收快照與事件。主機自己的 client 用 LocalTransport，其他人用 WebRTC／BroadcastChannel。
import { decode, encode } from '../shared/protocol/codec'
import type { ClientMsg, HostMsg } from '../shared/protocol/messages'
import { PROTOCOL_VERSION } from '../shared/constants'
import type { Transport } from './transport'

export interface ClientIdentity {
  name: string
  color: number
  token: string
}

export class NetClient {
  hostPeer: string | null = null
  /** 有第二個 peer 也宣稱自己是主機（可能是冒充）*/
  hostConflict = false
  rtt = 0
  private pingTimer: ReturnType<typeof setInterval>
  private handlers: ((m: HostMsg) => void)[] = []
  private lostHandlers: (() => void)[] = []
  welcomed = false

  constructor(
    readonly transport: Transport,
    private id: ClientIdentity,
  ) {
    transport.onMessage((from, data) => this.onData(from, data))
    transport.onPeerLeave((peer) => {
      if (peer === this.hostPeer) {
        this.hostPeer = null
        this.welcomed = false
        for (const h of this.lostHandlers) h()
      }
    })
    this.pingTimer = setInterval(() => {
      if (this.hostPeer) this.send({ t: 'ping', n: performance.now() })
    }, 2000)
  }

  onMsg(h: (m: HostMsg) => void): void {
    this.handlers.push(h)
  }
  onHostLost(h: () => void): void {
    this.lostHandlers.push(h)
  }

  private onData(from: string, data: Uint8Array): void {
    const m = decode(data) as HostMsg | undefined
    if (!m || typeof m !== 'object' || typeof (m as { t?: unknown }).t !== 'string') return
    if (m.t === 'host') {
      if (this.hostPeer && this.hostPeer !== from) {
        this.hostConflict = true
        return
      }
      if (!this.hostPeer) {
        this.hostPeer = from
        this.send({ t: 'hello', name: this.id.name, color: this.id.color, ver: PROTOCOL_VERSION, token: this.id.token })
      }
      return
    }
    // 只接受主機的訊息
    if (from !== this.hostPeer) return
    if (m.t === 'welcome') this.welcomed = true
    if (m.t === 'pong') this.rtt = performance.now() - m.n
    for (const h of this.handlers) h(m)
  }

  send(m: ClientMsg): void {
    if (!this.hostPeer) return
    this.transport.send(this.hostPeer, encode(m), m.t === 'cmd' ? 'reliable' : 'reliable')
  }

  close(): void {
    clearInterval(this.pingTimer)
    this.transport.close()
  }
}
