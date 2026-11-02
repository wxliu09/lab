// 單機練習指定身分：只在練習房、只有主機一位真人時生效；多人房間送同樣的訊息也會被忽略
import { describe, expect, it } from 'vitest'
import { GameServer, LOCAL_PEER } from '../../src/sim/server'
import { encode } from '../../src/shared/protocol/codec'
import { PRACTICE_ROOM, type ClientMsg, type PracticeRole } from '../../src/shared/protocol/messages'
import { validateClientMsg } from '../../src/shared/protocol/validate'
import { roleCounts } from '../../src/sim/systems/roles'
import type { Game } from '../../src/sim/game'

function server(code: string, seed: number): GameServer {
  return new GameServer(code, { send: () => {} }, seed, seed ^ 0x5bd1e995)
}

function join(s: GameServer, peer: string, name: string): (m: ClientMsg) => void {
  s.onJoin(peer)
  const send = (m: ClientMsg) => s.onMessage(peer, encode(m))
  send({ t: 'hello', name, color: s.players.filter(Boolean).length, ver: 1, token: 'tok' + name.padEnd(8, 'x') })
  return send
}

/** 練習房：主機＋bots 個 AI，開局時指定身分 */
function practice(role: PracticeRole | undefined, bots: number, seed: number, code = PRACTICE_ROOM): Game {
  const s = server(code, seed)
  const host = join(s, LOCAL_PEER, 'host')
  host({ t: 'settings', s: { bots, npcCrew: 0, eventMult: 0 } })
  host(role ? { t: 'start', role } : { t: 'start' })
  s.tick()
  return s.game!
}

function hostOf(g: Game) {
  return g.allPlayers().find((p) => !p.bot)!
}

function tally(g: Game) {
  const ps = g.allPlayers()
  return { xeno: ps.filter((p) => p.role === 'xeno').length, mutant: ps.filter((p) => p.role === 'mutant').length, android: ps.filter((p) => p.role === 'android').length }
}

describe('單機練習指定身分', () => {
  it('選定的身分在開局分配時生效（各種 AI 數量、多個種子）', () => {
    for (const role of ['human', 'xeno', 'mutant', 'android'] as const) {
      for (const bots of [1, 2, 3, 5, 8, 11]) {
        for (const seed of [1, 2, 3]) {
          const g = practice(role, bots, seed * 101 + bots)
          const me = hostOf(g)
          expect(me.role).toBe(role)
          expect(g.mainOf(me)).toBeTruthy()
          // 身分專屬能力也跟著配好
          if (role === 'xeno') expect(g.mainOf(me)!.abilities).toContain('xeno.form')
          if (role === 'mutant') expect(g.mainOf(me)!.abilities).toContain('mut.devour')
          // 每種異類最多一位、總數不超過人數
          const c = tally(g)
          expect(c.xeno).toBeLessThanOrEqual(1)
          expect(c.mutant).toBeLessThanOrEqual(1)
          expect(c.android).toBeLessThanOrEqual(1)
          expect(g.allPlayers().length).toBe(bots + 1)
        }
      }
    }
  })

  it('其他人的身分仍照人數規則：5 人以上異形＋變種人都在；3–4 人只有一名異類', () => {
    for (const seed of [11, 12, 13, 14]) {
      const big = practice('android', 5, seed)
      expect(tally(big)).toEqual({ xeno: 1, mutant: 1, android: 1 })
      const human = practice('human', 5, seed)
      expect(hostOf(human).role).toBe('human')
      expect(tally(human)).toEqual({ xeno: 1, mutant: 1, android: 0 })
      const small = practice('xeno', 2, seed)
      expect(tally(small)).toEqual({ xeno: 1, mutant: 0, android: 0 })
      const smallM = practice('mutant', 3, seed)
      expect(tally(smallM)).toEqual({ xeno: 0, mutant: 1, android: 0 })
    }
  })

  it('隨機（或不指定）＝和原本完全一樣的抽法', () => {
    for (const seed of [21, 22, 23]) {
      const a = practice('random', 5, seed)
      const b = practice(undefined, 5, seed)
      expect(a.allPlayers().map((p) => p.role)).toEqual(b.allPlayers().map((p) => p.role))
      expect(tally(a)).toEqual(roleCounts(a, 6))
    }
  })

  it('多人房間送出指定身分會被忽略（與不指定的結果相同）', () => {
    for (const seed of [31, 32, 33, 34, 35]) {
      const normal = practice(undefined, 5, seed, 'TEST1')
      for (const role of ['xeno', 'mutant', 'android', 'human'] as const) {
        const tried = practice(role, 5, seed, 'TEST1')
        expect(tried.allPlayers().map((p) => p.role)).toEqual(normal.allPlayers().map((p) => p.role))
        expect(tried.forceRole).toBeUndefined()
      }
    }
  })

  it('練習房裡只要有第二位真人加入，也一律忽略', () => {
    const s = server(PRACTICE_ROOM, 77)
    const host = join(s, LOCAL_PEER, 'host')
    join(s, 'peer-guest', 'guest')
    host({ t: 'settings', s: { bots: 4, npcCrew: 0, eventMult: 0 } })
    host({ t: 'start', role: 'xeno' })
    s.tick()
    expect(s.game).toBeTruthy()
    expect(s.game!.forceRole).toBeUndefined()
  })

  it('非主機不能開局，也就不能指定身分', () => {
    const s = server(PRACTICE_ROOM, 78)
    join(s, LOCAL_PEER, 'host')
    const guest = join(s, 'peer-guest', 'guest')
    guest({ t: 'start', role: 'xeno' })
    s.tick()
    expect(s.game).toBeNull()
  })

  it('主機只主持不參戰時不指定（主機根本不分配身分）', () => {
    const s = server(PRACTICE_ROOM, 79)
    const host = join(s, LOCAL_PEER, 'host')
    host({ t: 'settings', s: { bots: 5, hostSpectate: true, npcCrew: 0, eventMult: 0 } })
    host({ t: 'start', role: 'mutant' })
    s.tick()
    expect(s.game!.forceRole).toBeUndefined()
    expect(s.game!.allPlayers().find((p) => !p.bot)!.spectator).toBe(true)
  })

  it('validate：只接受白名單內的身分', () => {
    expect(validateClientMsg({ t: 'start' })).toEqual({ t: 'start' })
    expect(validateClientMsg({ t: 'start', role: 'xeno' })).toEqual({ t: 'start', role: 'xeno' })
    expect(validateClientMsg({ t: 'start', role: 'random' })).toEqual({ t: 'start', role: 'random' })
    expect(validateClientMsg({ t: 'start', role: 'god' })).toBeNull()
    expect(validateClientMsg({ t: 'start', role: 1 })).toBeNull()
    expect(validateClientMsg({ t: 'start', role: { k: 'xeno' } })).toBeNull()
  })
})
