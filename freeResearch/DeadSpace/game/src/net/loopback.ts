// 記憶體內的 transport：單元測試與 Node 裡的 headless 對局用
import { Emitter, type PeerId, type Transport } from './transport'

export class LoopbackHub {
  readonly peers = new Map<PeerId, LoopbackTransport>()
  /** 可注入延遲（ms）與掉包率，網路模擬測試用 */
  latency = 0
  jitter = 0
  loss = 0
  /** 'drop' = 掉了就沒了（不可靠通道）；'retransmit' = 模擬 WebRTC 可靠有序通道：掉包的那則晚一個來回才到，後面的排隊等它 */
  lossMode: 'drop' | 'retransmit' = 'drop'
  rand: () => number = Math.random
  private lastAt = new Map<string, number>()

  connect(id: PeerId): LoopbackTransport {
    const t = new LoopbackTransport(this, id)
    const others = [...this.peers.values()]
    // 先登錄再通知：對方在 join 事件裡立刻送的訊息才收得到
    this.peers.set(id, t)
    for (const other of others) {
      other.joinEv.emit(id)
      t.joinEv.emit(other.selfId)
    }
    return t
  }

  deliver(from: PeerId, to: PeerId, data: Uint8Array): void {
    const target = this.peers.get(to)
    if (!target) return
    const lost = this.loss > 0 && this.rand() < this.loss
    if (lost && this.lossMode === 'drop') return
    const copy = data.slice()
    if (this.latency === 0 && this.jitter === 0 && !lost) {
      target.msgEv.emit(from, copy)
      return
    }
    let delay = this.latency + this.rand() * this.jitter + (lost ? 2 * this.latency + 40 : 0)
    if (this.lossMode === 'retransmit') {
      // 有序：不能比同一對 peer 的前一則更早到
      const key = from + '>' + to
      const now = Date.now()
      const at = Math.max(now + delay, this.lastAt.get(key) ?? 0)
      this.lastAt.set(key, at)
      delay = at - now
    }
    setTimeout(() => target.msgEv.emit(from, copy), delay)
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
