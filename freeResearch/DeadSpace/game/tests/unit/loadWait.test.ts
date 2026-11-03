// 開局等玩家載入：所有連線中的真人回報 loaded 前模擬不推進（照常送快照）；有人一直沒回報，逾時後照常開始
import { describe, expect, it } from 'vitest'
import { Harness } from './helpers/harness'
import { LOAD_WAIT_S } from '../../src/sim/server'

function startWaiting(n: number) {
  const h = new Harness(4242)
  h.server.waitClients = true
  const cs = [h.connect('host', true)]
  for (let i = 1; i < n; i++) cs.push(h.connect('p' + i))
  cs[0].send({ t: 'settings', s: { npcCrew: 0, eventMult: 0 } as never })
  cs[0].send({ t: 'start' })
  h.ticks(2)
  return { h, cs }
}

describe('開局等玩家載入', () => {
  it('全員回報 loaded 才開始推進，等待期間照常收到快照', () => {
    const { h, cs } = startWaiting(3)
    const g = h.server.game!
    const snaps0 = cs[1].snaps.length
    h.ticks(40)
    expect(g.time).toBe(0)
    expect(cs[1].snaps.length).toBeGreaterThan(snaps0)
    cs[0].send({ t: 'loaded' })
    cs[1].send({ t: 'loaded' })
    h.ticks(20)
    expect(g.time).toBe(0)
    cs[2].send({ t: 'loaded' })
    h.ticks(20)
    expect(g.time).toBeGreaterThan(0.5)
  })

  it('有人一直沒回報：逾時後照常開始', () => {
    const { h, cs } = startWaiting(2)
    const g = h.server.game!
    cs[0].send({ t: 'loaded' })
    h.ticks(20 * (LOAD_WAIT_S - 1))
    expect(g.time).toBe(0)
    h.ticks(20 * 2)
    expect(g.time).toBeGreaterThan(0.5)
  })

  it('格式錯誤或重複的 loaded 不影響', () => {
    const { h, cs } = startWaiting(2)
    const g = h.server.game!
    cs[1].send({ t: 'loaded', junk: 1 } as never)
    cs[1].send({ t: 'loaded' })
    cs[0].send({ t: 'loaded' })
    cs[0].send({ t: 'loaded' })
    h.ticks(20)
    expect(g.time).toBeGreaterThan(0.5)
  })
})
