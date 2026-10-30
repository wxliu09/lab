import { describe, expect, it } from 'vitest'
import { Harness } from './helpers/harness'
import { encode } from '../../src/shared/protocol/codec'

describe('GameServer 大廳', () => {
  it('建房、加入、改名、選色、準備', () => {
    const h = new Harness()
    const host = h.connect('Alice', true)
    const bob = h.connect('Bob')
    expect(host.slot).toBe(0)
    expect(bob.slot).toBe(1)
    bob.send({ t: 'lobby', name: 'Bobby', color: 5, ready: true })
    h.ticks(1)
    const st = bob.inbox.filter((m) => m.t === 'lobbyState').at(-1)!
    if (st.t !== 'lobbyState') throw new Error()
    const b = st.players.find((p) => p.slot === 1)!
    expect(b.name).toBe('Bobby')
    expect(b.color).toBe(5)
    expect(b.ready).toBe(true)
    expect(st.players.find((p) => p.slot === 0)!.host).toBe(true)
  })

  it('非主機不能開局或改設定', () => {
    const h = new Harness()
    h.connect('Alice', true)
    const bob = h.connect('Bob')
    bob.send({ t: 'settings', s: { bots: 3 } })
    bob.send({ t: 'start' })
    h.ticks(1)
    expect(h.server.phase).toBe('lobby')
    expect(h.server.settings.bots).toBe(0)
  })

  it('遠端 peer 拿主機 token 也不能取得主機席位', () => {
    const h = new Harness()
    h.connect('Alice', true, 'hosttoken1')
    const evil = h.connect('Eve', false, 'hosttoken1')
    expect(evil.inbox.some((m) => m.t === 'reject')).toBe(true)
  })

  it('斷線 90 秒內重連回原席位', () => {
    const { h, cs } = Harness.started(3)
    const bob = cs[1]
    h.server.onLeave(bob.peer)
    h.ticks(20 * 60)
    const again = h.connect('p1')
    expect(again.slot).toBe(bob.slot)
    expect(again.inbox.some((m) => m.t === 'start')).toBe(true)
    h.ticks(2)
    expect(again.ents.size).toBeGreaterThan(0)
  })

  it('格式錯誤的訊息不會讓 server 崩潰', () => {
    const h = new Harness()
    h.connect('Alice', true)
    const garbage = [
      new Uint8Array([0xff, 0x00, 0x13]),
      new Uint8Array(10000),
      encode({ t: 'cmd', seq: 1, c: { k: 'move', x: 1e30 } } as never),
      encode({ t: 'chat', ch: 'all', text: 12 } as never),
      encode({ t: 'settings', s: { __proto__: 1, bots: -5 } } as never),
      encode({ t: 'Tune', id: 1, op: 'x', args: [{ a: 1 }] } as never),
    ]
    h.server.onJoin('peer-x')
    for (const g of garbage) h.server.onMessage('peer-x', g)
    h.ticks(1)
    expect(h.server.phase).toBe('lobby')
  })
})

describe('開局', () => {
  it('每人拿到自己的主單位與私有身分', () => {
    const { h, cs } = Harness.started(5)
    h.ticks(3)
    for (const c of cs) {
      expect(c.me.slot).toBe(c.slot)
      expect(['human', 'xeno', 'mutant', 'android']).toContain(c.me.role)
      const mine = [...c.ents.values()].find((e) => e.i === c.me.unit)
      expect(mine).toBeTruthy()
    }
    const roles = cs.map((c) => c.me.role)
    expect(roles.filter((r) => r === 'xeno').length).toBe(1)
    expect(roles.filter((r) => r === 'mutant').length).toBe(1)
    expect(roles.filter((r) => r === 'android').length).toBe(0)
  })

  it('移動指令會讓單位移動', () => {
    const { h, cs } = Harness.started(2)
    h.ticks(2)
    const c = cs[0]
    const u = [...c.ents.values()].find((e) => e.i === c.me.unit)!
    const x0 = u.x! / 100
    const y0 = u.y! / 100
    c.send({ t: 'cmd', seq: 1, c: { k: 'move', x: x0 + 2, y: y0 } })
    h.ticks(40)
    const u2 = c.ents.get(u.i)!
    expect(Math.hypot(u2.x! / 100 - x0, u2.y! / 100 - y0)).toBeGreaterThan(1)
  })
})
