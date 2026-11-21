// 第 6 輪（多人再來一局的 e2e 抓到）：客人和主機的傳輸層單方面判定對方離開（分頁卡住幾秒、心跳逾時）之後要能自己恢復。
// - 客人這一端判定主機失聯、主機其實還綁著這位客人：客人照樣對原主機送 ping，收到 pong 就重新打招呼；
// - 主機這一端判定客人離開（server 放掉了座位綁定）、客人這一端沒察覺：主機重新看到客人時送 { t: 'host' }，客人收到就重新打招呼。
// 以前兩種情況客人都要等主機「剛好」送別的東西來才會恢復；大廳裡主機沒事不送東西，客人送的聊天、準備都被丟掉。
import { describe, expect, it } from 'vitest'
import { GameServer, LOCAL_PEER } from '../../src/sim/server'
import { LoopbackHub } from '../../src/net/loopback'
import { NetClient } from '../../src/net/client'
import { decode, encode } from '../../src/shared/protocol/codec'
import { PROTOCOL_VERSION } from '../../src/shared/constants'
import type { ClientMsg, HostMsg } from '../../src/shared/protocol/messages'

const settle = async (n = 12) => {
  for (let i = 0; i < n; i++) await new Promise((r) => setTimeout(r, 5))
}

async function seated() {
  const hub = new LoopbackHub()
  hub.latency = 1
  const hostT = hub.connect('host')
  const hostGot: ClientMsg[] = []
  const server = new GameServer('R6RNT', { send: (peer, data) => peer.startsWith('r:') && hostT.send(peer.slice(2), data) }, 5, 9)
  server.onJoin(LOCAL_PEER)
  hostT.onPeerJoin((id) => server.onJoin('r:' + id))
  hostT.onPeerLeave((id) => server.onLeave('r:' + id))
  hostT.onMessage((from, data) => {
    hostGot.push(decode(data) as ClientMsg)
    server.onMessage('r:' + from, data)
  })
  server.onMessage(LOCAL_PEER, encode({ t: 'hello', name: 'Host', color: 0, ver: PROTOCOL_VERSION, token: 'hosttoken01' }))
  const guestT = hub.connect('guest')
  const client = new NetClient(guestT, { name: 'Guest', color: 3, token: 'guesttoken01' })
  const got: HostMsg[] = []
  client.onMsg((m) => got.push(m))
  await settle()
  expect(client.seatedHost).toBe('host')
  // 把入座後待送的大廳名單先送掉：之後主機沒事就不會再送任何東西（大廳的常態）
  server.tick()
  await settle()
  const slot = server.slotOfPeer('r:guest')
  expect(slot).not.toBeNull()
  return { hub, hostT, server, guestT, client, got, hostGot, slot }
}

/** 客人在大廳說一句話，主機的 server 有沒有收到並廣播（大廳聊天走 broadcastLobby，發話者是大廳名字）*/
async function chatReaches(server: GameServer, client: NetClient, got: HostMsg[], text: string): Promise<boolean> {
  got.length = 0
  client.send({ t: 'chat', ch: 'all', text })
  server.tick()
  await settle()
  return got.some((m) => m.t === 'chat' && m.lines.some((l) => l.text === text && l.from === 'Guest'))
}

describe('單方面判定對方離開之後自己恢復', () => {
  it('客人判定主機失聯（主機其實還在、還綁著客人）：照樣對原主機送 ping，收到 pong 就重新打招呼，之後送的聊天照常送到', async () => {
    const { server, guestT, client, got } = await seated()
    guestT.leaveEv.emit('host')
    expect(client.hostPeer).toBeNull()
    // 失聯期間送的東西丟掉（照舊）
    expect(await chatReaches(server, client, got, '丟掉')).toBe(false)
    // 下一次 ping（每 2 秒）送給原主機 → pong → 重新打招呼 → welcome
    await new Promise((r) => setTimeout(r, 2300))
    await settle()
    expect(client.hostPeer).toBe('host')
    expect(got.some((m) => m.t === 'welcome')).toBe(true)
    expect(await chatReaches(server, client, got, '回來了')).toBe(true)
    client.close()
  }, 10000)

  it('主機判定客人離開（server 放掉了座位綁定）、客人沒察覺：主機重新看到客人時送 { t: "host" }，客人重新打招呼、回到原座位', async () => {
    const { hostT, server, client, got, slot } = await seated()
    hostT.leaveEv.emit('guest')
    expect(server.slotOfPeer('r:guest')).toBeNull()
    expect(client.hostPeer).toBe('host')
    // 主機的傳輸層又看到客人（BroadcastChannel 收到客人的心跳、WebRTC 重新連上）
    hostT.joinEv.emit('guest')
    await settle()
    expect(server.slotOfPeer('r:guest')).toBe(slot)
    expect(got.some((m) => m.t === 'welcome')).toBe(true)
    expect(await chatReaches(server, client, got, '還在')).toBe(true)
    expect(client.hostConflict).toBe(false)
    client.close()
  })

  it('沒有失聯時不多送：ping 只送給目前的主機；主機以外的 peer 自稱主機照樣算衝突（不重新打招呼）', async () => {
    const { hub, client, hostGot } = await seated()
    const evil = hub.connect('evil')
    const evilIn: ClientMsg[] = []
    evil.onMessage((from, data) => from === 'guest' && evilIn.push(decode(data) as ClientMsg))
    hostGot.length = 0
    evil.send('guest', encode({ t: 'host', ver: PROTOCOL_VERSION }))
    await new Promise((r) => setTimeout(r, 2300))
    await settle()
    expect(client.hostConflict).toBe(true)
    expect(client.hostPeer).toBe('host')
    expect(evilIn).toEqual([])
    expect(hostGot.filter((m) => m.t === 'hello')).toEqual([])
    expect(hostGot.some((m) => m.t === 'ping')).toBe(true)
    client.close()
  }, 10000)
})
