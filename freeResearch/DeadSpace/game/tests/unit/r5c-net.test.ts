// 第 5 輪審查（client）P1-1：主機短暫失聯時不能被冒充。入座（收過 welcome）之後只認原主機的 peer id，
// 其他 peer 自稱主機一律算衝突、忽略它的所有訊息；真主機回來就照常恢復。
import { describe, expect, it } from 'vitest'
import { GameServer, LOCAL_PEER } from '../../src/sim/server'
import { LoopbackHub } from '../../src/net/loopback'
import { NetClient } from '../../src/net/client'
import { decode, encode } from '../../src/shared/protocol/codec'
import { PROTOCOL_VERSION } from '../../src/shared/constants'
import type { ClientMsg, HostMsg } from '../../src/shared/protocol/messages'

/** 等非同步的東西跑完（hello 的 token 用 crypto.subtle 算、loopback 有 1 ms 延遲）*/
const settle = async (n = 12) => {
  for (let i = 0; i < n; i++) await new Promise((r) => setTimeout(r, 5))
}

/** 真主機（GameServer）＋一位客人，客人已經入座 */
async function seated() {
  const hub = new LoopbackHub()
  hub.latency = 1
  const hostT = hub.connect('host')
  const server = new GameServer('R5CNT', { send: (peer, data) => peer.startsWith('r:') && hostT.send(peer.slice(2), data) }, 5, 9)
  hostT.onPeerJoin((id) => server.onJoin('r:' + id))
  hostT.onPeerLeave((id) => server.onLeave('r:' + id))
  hostT.onMessage((from, data) => server.onMessage('r:' + from, data))
  server.onJoin(LOCAL_PEER)
  server.onMessage(LOCAL_PEER, encode({ t: 'hello', name: 'Host', color: 0, ver: PROTOCOL_VERSION, token: 'hosttoken01' }))
  const guestT = hub.connect('guest')
  const client = new NetClient(guestT, { name: 'Guest', color: 3, token: 'guesttoken01' })
  const got: HostMsg[] = []
  client.onMsg((m) => got.push(m))
  await settle()
  expect(got.some((m) => m.t === 'welcome')).toBe(true)
  expect(client.seatedHost).toBe('host')
  return { hub, hostT, server, guestT, client, got }
}

/** 冒充者：連進同一個房間，記下收到的訊息（看客人有沒有對它打招呼）*/
function impostor(hub: LoopbackHub, id = 'evil') {
  const t = hub.connect(id)
  const inbox: ClientMsg[] = []
  // 只記客人送來的（真主機也會對新連進來的 peer 送 { t: 'host' }）
  t.onMessage((from, data) => from === 'guest' && inbox.push(decode(data) as ClientMsg))
  const say = (m: HostMsg) => t.send('guest', encode(m))
  return { t, inbox, say }
}

describe('入座之後只認原主機', () => {
  it('主機失聯期間有別的 peer 送 { t: "host" }：不當成主機、不打招呼、記成衝突；它之後送的訊息一律不交給上層', async () => {
    const { hub, guestT, client, got } = await seated()
    // 模擬主機分頁卡住、心跳逾時
    guestT.leaveEv.emit('host')
    expect(client.hostPeer).toBeNull()
    const evil = impostor(hub)
    got.length = 0
    evil.say({ t: 'host', ver: PROTOCOL_VERSION })
    await settle()
    expect(client.hostPeer).toBeNull()
    expect(client.hostConflict).toBe(true)
    expect(client.hostConflictAt).toBeGreaterThan(0)
    // 沒有對冒充者送 hello（token 也就不會落到它手上）
    expect(evil.inbox.some((m) => m.t === 'hello')).toBe(false)
    // 冒充者接著送假的 welcome、結算、聊天：都不會交給上層
    evil.say({ t: 'welcome', slot: 0, token: 'x' })
    evil.say({ t: 'end', result: { winner: 'aborted', players: [], timeline: [], duration: 1 } })
    evil.say({ t: 'chat', lines: [{ from: 'Host', color: 0, ch: 'sys', text: 'fake', time: 0 }] })
    await settle()
    expect(got).toEqual([])
    expect(client.seatedHost).toBe('host')
    // 客人送的東西也不會跑到冒充者那裡
    client.send({ t: 'chat', ch: 'all', text: 'hi' })
    await settle()
    expect(evil.inbox.length).toBe(0)
    client.close()
  })

  it('真主機回來就照常恢復（重新打招呼、收到 welcome 與開局資料）；冒充者之後再送什麼都沒用', async () => {
    const { hub, guestT, server, client, got } = await seated()
    server.onMessage(LOCAL_PEER, encode({ t: 'settings', s: { npcCrew: 0, eventMult: 0 } }))
    server.onMessage(LOCAL_PEER, encode({ t: 'start' }))
    server.tick()
    await settle()
    expect(got.some((m) => m.t === 'start')).toBe(true)
    guestT.leaveEv.emit('host')
    const evil = impostor(hub)
    evil.say({ t: 'host', ver: PROTOCOL_VERSION })
    await settle()
    expect(client.hostPeer).toBeNull()
    got.length = 0
    // 真主機的快照又來了
    server.tick()
    await settle()
    server.tick()
    await settle()
    expect(client.hostPeer).toBe('host')
    expect(got.map((m) => m.t)).toContain('welcome')
    expect(got.map((m) => m.t)).toContain('start')
    expect(got.map((m) => m.t)).toContain('snap')
    // 恢復之後冒充者再自稱主機、送快照：照樣忽略，主機不變
    got.length = 0
    const before = client.hostConflictAt
    await new Promise((r) => setTimeout(r, 3))
    evil.say({ t: 'host', ver: PROTOCOL_VERSION })
    evil.say({ t: 'notice', key: 'net.simError' })
    await settle()
    expect(client.hostPeer).toBe('host')
    expect(got.some((m) => m.t === 'notice')).toBe(false)
    expect(client.hostConflictAt).toBeGreaterThan(before)
    client.close()
  })

  it('主機沒失聯時別人自稱主機：照舊記成衝突、忽略', async () => {
    const { hub, client, got } = await seated()
    const evil = impostor(hub)
    got.length = 0
    evil.say({ t: 'host', ver: PROTOCOL_VERSION })
    evil.say({ t: 'reject', reason: 'kicked' })
    await settle()
    expect(client.hostPeer).toBe('host')
    expect(client.hostConflict).toBe(true)
    expect(got.some((m) => m.t === 'reject')).toBe(false)
    client.close()
  })
})

describe('入座之前（照舊）', () => {
  it('先回應的當主機、第二個自稱主機的記成衝突；還沒入座就失聯的主機回來照樣重新打招呼', async () => {
    const hub = new LoopbackHub()
    hub.latency = 1
    const a = hub.connect('a')
    const aIn: ClientMsg[] = []
    a.onMessage((_f, d) => aIn.push(decode(d) as ClientMsg))
    const guestT = hub.connect('guest')
    const client = new NetClient(guestT, { name: 'G', color: 1, token: 'guesttoken02' })
    a.send('guest', encode({ t: 'host', ver: PROTOCOL_VERSION }))
    await settle()
    expect(client.hostPeer).toBe('a')
    expect(aIn.some((m) => m.t === 'hello')).toBe(true)
    const b = hub.connect('b')
    b.send('guest', encode({ t: 'host', ver: PROTOCOL_VERSION }))
    await settle()
    expect(client.hostPeer).toBe('a')
    expect(client.hostConflict).toBe(true)
    // a 還沒給 welcome 就失聯：a 再送任何訊息就重新打招呼
    guestT.leaveEv.emit('a')
    expect(client.hostPeer).toBeNull()
    aIn.length = 0
    a.send('guest', encode({ t: 'pong', n: 0, tick: 1 }))
    await settle()
    expect(client.hostPeer).toBe('a')
    expect(aIn.some((m) => m.t === 'hello')).toBe(true)
    client.close()
  })
})
