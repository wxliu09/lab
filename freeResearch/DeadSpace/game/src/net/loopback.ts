// 記憶體內的 transport：單元測試與 Node 裡的 headless 對局用
import { Emitter, type PeerId, type Transport } from './transport'

export class LoopbackHub {
  readonly peers = new Map<PeerId, LoopbackTransport>()
  /** 可注入延遲（ms）與掉包率，網路模擬測試用 */
  latency = 0
  jitter = 0
  loss = 0
  rand: () => number = Math.random

  connect(id: PeerId): LoopbackTransport {
    const t = new LoopbackTransport(this, id)
    for (const other of this.peers.values()) {
      other.joinEv.emit(id)
      t.joinEv.emit(other.selfId)
    }
    this.peers.set(id, t)
    return t
  }

  deliver(from: PeerId, to: PeerId, data: Uint8Array): void {
    const target = this.peers.get(to)
    if (!target) return
    if (this.loss > 0 && this.rand() < this.loss) return
    const copy = data.slice()
    if (this.latency === 0 && this.jitter === 0) target.msgEv.emit(from, copy)
    else setTimeout(() => target.msgEv.emit(from, copy), this.latency + this.rand() * this.jitter)
  }

  remove(id: PeerId): void {
    if (!this.peers.delete(id)) return
    for (const other of this.peers.values()) other.leaveEv.emit(id)
  }
}

export class LoopbackTransport implements Transport {
  readonly msgEv = new Emitter<[PeerId, Uint8Array]>()
  readonly joinEv = new Emitter<[PeerId]>()
  readonly leaveEv = new Emitter<[PeerId]>()
  constructor(
    private hub: LoopbackHub,
    readonly selfId: PeerId,
  ) {}
  send(to: PeerId, data: Uint8Array): void {
    this.hub.deliver(this.selfId, to, data)
  }
  broadcast(data: Uint8Array): void {
    for (const id of this.hub.peers.keys()) if (id !== this.selfId) this.hub.deliver(this.selfId, id, data)
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
    this.hub.remove(this.selfId)
  }
}
