// 練習局自己的規則：末日提前到 20–25 分、無人戰機與小行星的抽中權重減半；正式局（多人房、練習房裡有其他真人）完全不變
import { describe, expect, it } from 'vitest'
import { GameServer, LOCAL_PEER } from '../../src/sim/server'
import { encode } from '../../src/shared/protocol/codec'
import { DEFAULT_SETTINGS, PRACTICE_ROOM, type ClientMsg, type LobbySettings } from '../../src/shared/protocol/messages'
import { PRACTICE_APOCALYPSE, PRACTICE_EVENT_WEIGHT, eventWeight, eventsOf, pickEvent } from '../../src/sim/systems/events'
import type { Game } from '../../src/sim/game'

function join(s: GameServer, peer: string, name: string): (m: ClientMsg) => void {
  s.onJoin(peer)
  const send = (m: ClientMsg) => s.onMessage(peer, encode(m))
  send({ t: 'hello', name, color: s.players.filter(Boolean).length, ver: 1, token: 'tok' + name.padEnd(8, 'x') })
  return send
}

/** 開一局：code 房號、主機＋bots 個 AI（guests = 另外加入的真人數）、主機送出的額外設定 */
function start(code: string, seed: number, opts: { bots?: number; guests?: number; settings?: Partial<LobbySettings> } = {}): Game {
  const s = new GameServer(code, { send: () => {} }, seed, seed ^ 0x5bd1e995)
  const host = join(s, LOCAL_PEER, 'host')
  for (let i = 0; i < (opts.guests ?? 0); i++) join(s, 'peer-' + i, 'guest' + i)
  host({ t: 'settings', s: { bots: opts.bots ?? 3, npcCrew: 0, ...opts.settings } })
  host({ t: 'start' })
  s.tick()
  return s.game!
}

const apocMin = (g: Game) => eventsOf(g).apocAt / 60

describe('練習局：末日提前', () => {
  it('練習房、除了主機都是 AI：末日落在 20–25 分（多個種子）', () => {
    expect(PRACTICE_APOCALYPSE).toEqual([20, 25])
    const seen: number[] = []
    for (let seed = 1; seed <= 12; seed++) {
      const g = start(PRACTICE_ROOM, seed * 97)
      expect(g.practice).toBe(true)
      expect(g.settings.apocalypse).toEqual([20, 25])
      const m = apocMin(g)
      expect(m).toBeGreaterThanOrEqual(20)
      expect(m).toBeLessThanOrEqual(25)
      seen.push(m)
    }
    // 真的是一個範圍（不是固定值）
    expect(Math.max(...seen) - Math.min(...seen)).toBeGreaterThan(1)
  })

  it('正式局維持原本範圍：多人房間、練習房但有其他真人、主機只主持', () => {
    for (let seed = 1; seed <= 8; seed++) {
      for (const g of [start('TEST1', seed * 131), start(PRACTICE_ROOM, seed * 131, { guests: 1 }), start(PRACTICE_ROOM, seed * 131, { settings: { hostSpectate: true } })]) {
        expect(g.practice).toBe(false)
        expect(g.settings.apocalypse).toEqual(DEFAULT_SETTINGS.apocalypse)
        const m = apocMin(g)
        expect(m).toBeGreaterThanOrEqual(30)
        expect(m).toBeLessThanOrEqual(40)
      }
    }
  })

  it('主機明確改過末日時間：練習局照主機的設定', () => {
    for (let seed = 1; seed <= 4; seed++) {
      const a = start(PRACTICE_ROOM, seed * 53, { settings: { apocalypse: [30, 40] } })
      expect(a.practice).toBe(true)
      expect(apocMin(a)).toBeGreaterThanOrEqual(30)
      expect(apocMin(a)).toBeLessThanOrEqual(40)
      const b = start(PRACTICE_ROOM, seed * 53, { settings: { apocalypse: [8, 9] } })
      expect(apocMin(b)).toBeGreaterThanOrEqual(8)
      expect(apocMin(b)).toBeLessThanOrEqual(9)
    }
  })

  it('練習局的設定不會回寫大廳（大廳看到的還是主機的設定）', () => {
    const s = new GameServer(PRACTICE_ROOM, { send: () => {} }, 7, 7 ^ 0x5bd1e995)
    const host = join(s, LOCAL_PEER, 'host')
    host({ t: 'settings', s: { bots: 3, npcCrew: 0 } })
    host({ t: 'start' })
    s.tick()
    expect(s.game!.settings.apocalypse).toEqual([20, 25])
    expect(s.settings.apocalypse).toEqual(DEFAULT_SETTINGS.apocalypse)
  })
})

describe('練習局：致命事件權重減半', () => {
  it('權重表：無人戰機、小行星 0.5，其餘 1；正式局一律 1', () => {
    expect(PRACTICE_EVENT_WEIGHT).toEqual({ wasps: 0.5, asteroids: 0.5 })
    const p = start(PRACTICE_ROOM, 11, { settings: { eventMult: 0 } })
    const n = start('TEST1', 11, { settings: { eventMult: 0 } })
    for (const id of p.eventIds!()) {
      expect([id, eventWeight(p, id)]).toEqual([id, id === 'wasps' || id === 'asteroids' ? 0.5 : 1])
      expect([id, eventWeight(n, id)]).toEqual([id, 1])
    }
  })

  /** 用真正的抽法抽很多次（只抽不觸發），統計各事件的比例 */
  function tally(g: Game, n: number): Map<string, number> {
    const out = new Map<string, number>()
    for (let i = 0; i < n; i++) {
      const id = pickEvent(g, false)!
      out.set(id, (out.get(id) ?? 0) + 1)
    }
    return out
  }

  it('統計：練習局抽到無人戰機、小行星的機率約是一般事件的一半；正式局機會均等', () => {
    const N = 40000
    const p = tally(start(PRACTICE_ROOM, 23, { settings: { eventMult: 0 } }), N)
    const n = tally(start('TEST1', 23, { settings: { eventMult: 0 } }), N)
    const avgOthers = (m: Map<string, number>) => {
      const xs = [...m].filter(([id]) => id !== 'wasps' && id !== 'asteroids').map(([, c]) => c)
      return xs.reduce((a, b) => a + b, 0) / xs.length
    }
    for (const id of ['wasps', 'asteroids']) {
      const rp = (p.get(id) ?? 0) / avgOthers(p)
      const rn = (n.get(id) ?? 0) / avgOthers(n)
      expect([id, rp > 0.4 && rp < 0.6]).toEqual([id, true])
      expect([id, rn > 0.85 && rn < 1.15]).toEqual([id, true])
    }
  })
})
