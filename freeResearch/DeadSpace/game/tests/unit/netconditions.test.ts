// 網路條件（M11）：150 ms 延遲＋抖動＋5% 掉包（可靠有序通道的重傳延遲）下，遠端玩家仍能加入、開局、操作並與主機同步
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { GameServer, LOCAL_PEER } from '../../src/sim/server'
import { LoopbackHub } from '../../src/net/loopback'
import { NetClient } from '../../src/net/client'
import { decode, encode } from '../../src/shared/protocol/codec'
import type { ClientMsg, HostMsg } from '../../src/shared/protocol/messages'
import { ClientWorld } from '../../src/client/world'

describe('網路條件', () => {
  beforeEach(() => {
    vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout', 'setInterval', 'clearInterval', 'Date', 'performance'] })
  })
  afterEach(() => {
    vi.useRealTimers()
  })

  it('150 ms 延遲、5% 掉包：加入、開局、移動指令生效、client 位置跟上主機', async () => {
    const hub = new LoopbackHub()
    hub.latency = 150
    hub.jitter = 40
    hub.loss = 0.05
    hub.lossMode = 'retransmit'
    let r = 12345
    hub.rand = () => ((r = (r * 16807) % 2147483647) / 2147483647)
    const hostT = hub.connect('host')
    const hostInbox: HostMsg[] = []
    const server = new GameServer(
      'NETC1',
      {
        send: (peer, data) => {
          if (peer === LOCAL_PEER) hostInbox.push(decode(data) as HostMsg)
          else if (peer.startsWith('r:')) hostT.send(peer.slice(2), data)
        },
      },
      42,
      7,
    )
    hostT.onPeerJoin((id) => server.onJoin('r:' + id))
    hostT.onPeerLeave((id) => server.onLeave('r:' + id))
    hostT.onMessage((from, data) => server.onMessage('r:' + from, data))
    server.onJoin(LOCAL_PEER)
    const hostSend = (m: ClientMsg) => server.onMessage(LOCAL_PEER, encode(m))
    hostSend({ t: 'hello', name: 'Host', color: 0, ver: 1, token: 'hosttoken01' })

    const client = new NetClient(hub.connect('guest'), { name: 'Guest', color: 3, token: 'guesttoken01' })
    const world = new ClientWorld()
    let slot = -1
    let started = false
    client.onMsg((m) => {
      if (m.t === 'welcome') slot = m.slot
      if (m.t === 'start') started = true
      if (m.t === 'snap') world.apply(m.s)
    })
    const run = (ms: number) => {
      for (let t = 0; t < ms; t += 50) {
        vi.advanceTimersByTime(50)
        server.tick()
      }
    }
    // hello 的 token 要先用 crypto.subtle 計算（真的非同步），讓事件迴圈轉幾圈
    for (let i = 0; i < 60 && slot < 0; i++) {
      run(100)
      await new Promise((r) => setImmediate(r))
    }
    run(1000)
    expect(slot).toBeGreaterThanOrEqual(0)
    hostSend({ t: 'settings', s: { npcCrew: 0, eventMult: 0 } })
    hostSend({ t: 'start' })
    run(3000)
    expect(started).toBe(true)
    const g = server.game!
    const me = g.mainOf(g.players[slot]!)!
    expect(me).toBeTruthy()
    // 往旁邊走 3 公尺
    const z = g.world.zones[me.zone]
    const goal = z.nav!.nearestOpen(me.x + 3, me.y) ?? { x: me.x, y: me.y }
    const x0 = me.x
    client.send({ t: 'cmd', seq: 1, c: { k: 'move', x: goal.x, y: goal.y } })
    run(4000)
    expect(Math.hypot(me.x - goal.x, me.y - goal.y)).toBeLessThan(0.8)
    expect(Math.abs(me.x - x0) + Math.abs(me.y - goal.y)).toBeGreaterThan(0)
    // client 端看到的自己位置與主機一致（快照是差量，有序可靠通道不會漏）
    const ce = world.ents.get(me.id)
    expect(ce).toBeTruthy()
    // 最新一筆快照（插值位置每幀才更新）
    const cx = ce!.s.x! / 100
    const cy = ce!.s.y! / 100
    expect(Math.hypot(cx - me.x, cy - me.y)).toBeLessThan(0.3)
    // RTT 量得到，大約是 2 × 延遲
    expect(client.rtt).toBeGreaterThan(250)
    expect(client.rtt).toBeLessThan(900)
    client.close()
  })
})

describe('token 綁定主機', () => {
  it('同一個本機 token 對不同主機產生不同的 hello token（冒充者拿到的對真主機無效）', async () => {
    const { bindToken } = await import('../../src/net/client')
    const a = await bindToken('localtoken123', 'realhost')
    const b = await bindToken('localtoken123', 'impostor')
    expect(a).not.toBe(b)
    expect(a).toMatch(/^[0-9a-f]{40}$/)
    expect(await bindToken('localtoken123', 'realhost')).toBe(a)
  })
})
