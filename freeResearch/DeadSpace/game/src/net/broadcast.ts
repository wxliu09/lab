// 同一瀏覽器多分頁的 transport（開發與 e2e 用，不需要外網）
import { Emitter, randomId, type PeerId, type Transport } from './transport'

interface Frame {
  k: 'hi' | 'ack' | 'beat' | 'bye' | 'data'
  from: PeerId
  to?: PeerId
  d?: Uint8Array
}

const BEAT_MS = 700
const TIMEOUT_MS = 3500

export class BroadcastChannelTransport implements Transport {
  readonly selfId: PeerId = randomId(12)
  private ch: BroadcastChannel
  private seen = new Map<PeerId, number>()
  private timer: ReturnType<typeof setInterval>
  private msgEv = new Emitter<[PeerId, Uint8Array]>()
  private joinEv = new Emitter<[PeerId]>()
  private leaveEv = new Emitter<[PeerId]>()
  private closed = false
  private onUnload = () => this.close()

  constructor(room: string) {
    this.ch = new BroadcastChannel('xenocyte-bc-' + room)
    this.ch.onmessage = (ev: MessageEvent<Frame>) => this.handle(ev.data)
    this.timer = setInterval(() => this.heartbeat(), BEAT_MS)
    if (typeof window !== 'undefined') window.addEventListener('pagehide', this.onUnload)
    // 讓呼叫端先註冊 callback 再宣告自己
    setTimeout(() => this.post({ k: 'hi', from: this.selfId }), 0)
  }

  private post(f: Frame): void {
    if (!this.closed) this.ch.postMessage(f)
  }

  private touch(id: PeerId): void {
    const isNew = !this.seen.has(id)
    this.seen.set(id, Date.now())
    if (isNew) this.joinEv.emit(id)
  }

  private handle(f: Frame): void {
    if (this.closed || !f || typeof f.from !== 'string' || f.from === this.selfId) return
    if (f.to && f.to !== this.selfId) return
    switch (f.k) {
      case 'hi':
        this.touch(f.from)
        this.post({ k: 'ack', from: this.selfId, to: f.from })
        break
      case 'ack':
      case 'beat':
        this.touch(f.from)
        break
      case 'bye':
        if (this.seen.delete(f.from)) this.leaveEv.emit(f.from)
        break
      case 'data':
        if (!this.seen.has(f.from)) this.touch(f.from)
        else this.seen.set(f.from, Date.now())
        if (f.d instanceof Uint8Array) this.msgEv.emit(f.from, f.d)
        break
    }
  }

  private heartbeat(): void {
    this.post({ k: 'beat', from: this.selfId })
    const now = Date.now()
    for (const [id, t] of this.seen) {
      if (now - t > TIMEOUT_MS) {
        this.seen.delete(id)
        this.leaveEv.emit(id)
      }
    }
  }

  send(to: PeerId, data: Uint8Array): void {
    this.post({ k: 'data', from: this.selfId, to, d: data })
  }
  broadcast(data: Uint8Array): void {
    this.post({ k: 'data', from: this.selfId, d: data })
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
    if (this.closed) return
    this.post({ k: 'bye', from: this.selfId })
    this.closed = true
    clearInterval(this.timer)
    if (typeof window !== 'undefined') window.removeEventListener('pagehide', this.onUnload)
    this.ch.close()
  }
}
