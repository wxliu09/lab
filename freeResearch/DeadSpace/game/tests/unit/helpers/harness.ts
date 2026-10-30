// 測試工具：在 Node 裡跑 GameServer，模擬多個 client
import { GameServer, LOCAL_PEER } from '../../../src/sim/server'
import { decode, encode } from '../../../src/shared/protocol/codec'
import type { ClientMsg, HostMsg, SnapEntity, Snapshot } from '../../../src/shared/protocol/messages'

export interface FakeClient {
  peer: string
  inbox: HostMsg[]
  snaps: Snapshot[]
  slot: number
  /** 依快照累積的實體表（模擬 client 端）*/
  ents: Map<number, SnapEntity>
  me: Record<string, unknown>
  send(m: ClientMsg): void
}

export class Harness {
  server: GameServer
  clients = new Map<string, FakeClient>()
  /** 所有送給每個 peer 的原始位元組（洩漏測試掃描用）*/
  raw = new Map<string, Uint8Array[]>()

  constructor(seed = 1234) {
    this.server = new GameServer('TEST1', { send: (peer, data) => this.deliver(peer, data) }, seed)
  }

  private deliver(peer: string, data: Uint8Array): void {
    ;(this.raw.get(peer) ?? this.raw.set(peer, []).get(peer)!).push(data)
    const c = this.clients.get(peer)
    if (!c) return
    const m = decode(data) as HostMsg
    c.inbox.push(m)
    if (m.t === 'welcome') c.slot = m.slot
    if (m.t === 'start') {
      c.ents.clear()
      c.me = {}
    }
    if (m.t === 'snap') {
      c.snaps.push(m.s)
      for (const id of m.s.g) c.ents.delete(id)
      for (const e of m.s.e) c.ents.set(e.i, { ...(c.ents.get(e.i) ?? {}), ...e })
      if (m.s.me) Object.assign(c.me, m.s.me)
    }
  }

  connect(name: string, host = false, token?: string): FakeClient {
    const peer = host ? LOCAL_PEER : 'peer-' + name
    const c: FakeClient = {
      peer,
      inbox: [],
      snaps: [],
      slot: -1,
      ents: new Map(),
      me: {},
      send: (m) => this.server.onMessage(peer, encode(m)),
    }
    this.clients.set(peer, c)
    this.server.onJoin(peer)
    c.send({ t: 'hello', name, color: this.clients.size - 1, ver: 1, token: token ?? 'tok' + name.padEnd(8, 'x') })
    return c
  }

  ticks(n: number): void {
    for (let i = 0; i < n; i++) this.server.tick()
  }

  /** 建房＋n 人加入＋開局 */
  static started(n: number, seed = 1234, settings: Record<string, unknown> = {}): { h: Harness; cs: FakeClient[] } {
    const h = new Harness(seed)
    const cs = [h.connect('host', true)]
    for (let i = 1; i < n; i++) cs.push(h.connect('p' + i))
    if (Object.keys(settings).length) cs[0].send({ t: 'settings', s: settings as never })
    cs[0].send({ t: 'start' })
    h.ticks(2)
    return { h, cs }
  }
}
