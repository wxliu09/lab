// 主機主執行緒的轉送層：遠端 peer ⇄ Sim Worker ⇄ 本機 client。只做事件驅動的轉送，不碰遊戲邏輯。
import { Emitter, type PeerId, type Transport } from './transport'

export const LOCAL = 'local'
export const HOST_PEER = 'host'

/** 本機 client 用的 transport（postMessage 到 worker）*/
export class LocalTransport implements Transport {
  readonly selfId = LOCAL
  readonly msgEv = new Emitter<[PeerId, Uint8Array]>()
  private joinEv = new Emitter<[PeerId]>()
  constructor(private relay: HostRelay) {
    setTimeout(() => this.joinEv.emit(HOST_PEER), 0)
  }
  send(_to: PeerId, data: Uint8Array): void {
    this.relay.fromLocal(data)
  }
  broadcast(data: Uint8Array): void {
    this.relay.fromLocal(data)
  }
  onMessage(cb: (from: PeerId, data: Uint8Array) => void): void {
    this.msgEv.on(cb)
  }
  onPeerJoin(cb: (id: PeerId) => void): void {
    this.joinEv.on(cb)
  }
  onPeerLeave(_cb: (id: PeerId) => void): void {}
  close(): void {
    this.relay.close()
  }
}

type WorkerOut =
  | { t: 'out'; batch: [string, Uint8Array][] }
  | { t: 'hookResult'; id: number; result: unknown }
  | { t: 'stat'; tickMs: number }

export class HostRelay {
  readonly worker: Worker
  readonly local: LocalTransport
  tickMs = 0
  private hookWaiters = new Map<number, (r: unknown) => void>()
  private hookSeq = 1
  private closed = false
  private visHandler = () => this.worker.postMessage({ t: 'bg', hidden: document.visibilityState === 'hidden' })

  constructor(
    readonly code: string,
    readonly net: Transport | null,
    seed: number,
  ) {
    this.worker = new Worker(new URL('../sim/worker.ts', import.meta.url), { type: 'module', name: 'sim' })
    this.worker.onmessage = (ev: MessageEvent<WorkerOut>) => this.fromWorker(ev.data)
    this.worker.postMessage({ t: 'init', code, seed })
    this.local = new LocalTransport(this)
    this.worker.postMessage({ t: 'join', peer: LOCAL })
    if (net) {
      net.onPeerJoin((id) => this.worker.postMessage({ t: 'join', peer: 'r:' + id }))
      net.onPeerLeave((id) => this.worker.postMessage({ t: 'leave', peer: 'r:' + id }))
      net.onMessage((from, data) => {
        // 複製到獨立的 buffer 再轉移所有權
        const copy = data.slice()
        this.worker.postMessage({ t: 'msg', peer: 'r:' + from, data: copy }, [copy.buffer])
      })
    }
    document.addEventListener('visibilitychange', this.visHandler)
  }

  fromLocal(data: Uint8Array): void {
    if (this.closed) return
    const copy = data.slice()
    this.worker.postMessage({ t: 'msg', peer: LOCAL, data: copy }, [copy.buffer])
  }

  private fromWorker(m: WorkerOut): void {
    if (m.t === 'out') {
      for (const [peer, data] of m.batch) {
        if (peer === LOCAL) this.local.msgEv.emit(HOST_PEER, data)
        else if (peer.startsWith('r:')) this.net?.send(peer.slice(2), data)
      }
    } else if (m.t === 'hookResult') {
      this.hookWaiters.get(m.id)?.(m.result)
      this.hookWaiters.delete(m.id)
    } else if (m.t === 'stat') this.tickMs = m.tickMs
  }

  /** 測試掛勾（Playwright 用；正式 build 不會呼叫）*/
  hook(op: string, args: unknown[]): Promise<unknown> {
    const id = this.hookSeq++
    return new Promise((res) => {
      this.hookWaiters.set(id, res)
      this.worker.postMessage({ t: 'hook', id, op, args })
    })
  }

  close(): void {
    if (this.closed) return
    this.closed = true
    document.removeEventListener('visibilitychange', this.visHandler)
    this.worker.terminate()
    this.net?.close()
  }
}
