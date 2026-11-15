// 第 3 輪（sim）：門控制器故障期間的移動。
// - 故障門當成「會週期打開」的門來尋路：單位走到門縫外等開門的空檔，時間夠才一口氣過去（真人、AI 共用），不再整個作廢命令
// - 真的走不到（門被鎖上）照舊回 move.noPath；等門時給真人的說明 move.doorWait 不洗版
// - 時間表與夾傷照原作（war3map.j cJ／Zj／xJ／eJ）：每 2.25 秒開 1.5 秒、關 0.75 秒；門縫 ±0.55 m；生命 ≤ 175 只剩 1 點
// - 練習局 AI：故障期間不再大量被門夾死
import { describe, expect, it } from 'vitest'
import { Harness, type FakeClient } from './helpers/harness'
import { GameServer, LOCAL_PEER } from '../../src/sim/server'
import { encode } from '../../src/shared/protocol/codec'
import { PRACTICE_ROOM } from '../../src/shared/protocol/messages'
import { DAMAGE_HOOKS } from '../../src/sim/systems/damage'
import { DOOR_DMG, DOOR_SPARE_HP, eventsOf } from '../../src/sim/systems/events'
import { DOOR_CYCLE, DOOR_OPEN_AT, DOOR_SHUT_AT, cycleOpen, doorAxes, doorCycle } from '../../src/sim/systems/movement'
import { hasString } from '../../src/ui/i18n'
import '../../src/ui/strings/sim6'
import type { Ent } from '../../src/sim/ent'
import type { Game } from '../../src/sim/game'
import type { Zone } from '../../src/sim/world'

const SEC = 20
const lines = (c: FakeClient) => c.inbox.flatMap((m) => (m.t === 'chat' ? m.lines.map((l) => l.text) : []))
const count = (c: FakeClient, key: string) => lines(c).filter((t) => t === '@' + key || t.startsWith('@' + key + '|')).length

/** 每個單位被故障門夾到的次數 */
const doorHits = new Map<number, number>()
DAMAGE_HOOKS.push((_g, _src, t, _amt, o) => {
  if (o.env === 'door') doorHits.set(t.id, (doorHits.get(t.id) ?? 0) + 1)
})

function place(g: Game, u: Ent, zone: number, x: number, y: number): void {
  g.world.relocate(u, zone, x, y)
  u.order = null
  u.queue.length = 0
  u.path = null
  u.acquire = false
}

/** 門兩側、沿通道方向 dist 公尺的可走點（兩點之間只隔這扇門）*/
function sides(z: Zone, di: number, dist: number): [{ x: number; y: number }, { x: number; y: number }] | null {
  const inst = z.layout!.doors[di]
  const nav = z.nav!
  const pt = (s: number) => (inst.horizontal ? { x: inst.x, y: inst.y + s * dist } : { x: inst.x + s * dist, y: inst.y })
  const a = pt(-1)
  const b = pt(1)
  if (nav.blockedAt(a.x, a.y) || nav.blockedAt(b.x, b.y)) return null
  // 兩點連線只經過這扇門
  if (!nav.walkable(a.x, a.y, b.x, b.y, 0.4)) return null
  return [a, b]
}

function crossable(g: Game, z: Zone): number[] {
  return z.doors.filter((d) => !d.clearance && !d.security && !d.locked && !d.broken && sides(z, d.index, 2.5)).map((d) => d.index)
}

describe('門控制器故障期間的移動', () => {
  it('時間表照原作：每 2.25 秒開 1.5 秒、關 0.75 秒；故障中的門不管旁邊有沒有人都照週期開關', () => {
    expect(DOOR_CYCLE).toBe(2.25)
    expect(DOOR_SHUT_AT - DOOR_OPEN_AT).toBe(1.5)
    expect(DOOR_DMG).toBe(225)
    expect(DOOR_SPARE_HP).toBe(175)
    const { h } = Harness.started(1, 4242, { eventMult: 0, npcCrew: 0, bots: 0 })
    const g = h.server.game!
    g.triggerEvent!('doors', true)
    const z = g.world.zoneByKey('nyx')!
    const di = crossable(g, z)[0]
    const d = z.doors[di]
    let open = 0
    let shut = 0
    for (let i = 0; i < 9 * SEC; i++) {
      h.ticks(1)
      expect(d.cycling).toBe(true)
      expect(d.open).toBe(cycleOpen(doorCycle(g.time, di)))
      if (d.open) open++
      else shut++
      // 關著的時候擋住碰撞，開著的時候不擋
      expect(d.forced > g.time).toBe(!d.open)
    }
    expect(open / (open + shut)).toBeCloseTo(1.5 / 2.25, 1)
    // 修好：交回一般的自動門
    eventsOf(g).doorsUntil = g.time + 0.05
    h.ticks(3)
    expect(d.cycling).toBe(false)
    expect(d.forced).toBe(0)
  })

  it('夾到門縫裡：225 傷害並被彈開；生命 ≤ 175 時只剩 1 點，不會被門夾死；站在門格外緣不會被夾', () => {
    const { h, g } = (() => {
      const r = Harness.started(2, 4242, { eventMult: 0, npcCrew: 0, bots: 0 })
      return { h: r.h, g: r.h.server.game! }
    })()
    const z = g.world.zoneByKey('nyx')!
    const di = crossable(g, z)[0]
    const inst = z.layout!.doors[di]
    const [a] = sides(z, di, 0.5 + 0.4 + 0.02)!
    const [p0, p1] = g.allPlayers()
    const inGap = g.mainOf(p0)!
    const atFace = g.mainOf(p1)!
    g.triggerEvent!('doors', true)
    // 等到門快要猛關的時候把兩個人放好
    while (!(cycleOpen(doorCycle(g.time, di)) && doorCycle(g.time, di) > DOOR_SHUT_AT - 0.2)) h.ticks(1)
    place(g, inGap, z.id, inst.x, inst.y)
    place(g, atFace, z.id, a.x, a.y)
    const hp0 = inGap.hp
    const face0 = atFace.hp
    h.ticks(SEC / 2)
    expect(inGap.hp).toBeLessThanOrEqual(hp0 - 200)
    expect(Math.abs(doorAxes(inst, inGap.x, inGap.y).n)).toBeGreaterThan(0.55)
    expect(atFace.hp).toBeGreaterThanOrEqual(face0)
    // 低血量：只剩 1 點
    inGap.hp = 150
    while (!(cycleOpen(doorCycle(g.time, di)) && doorCycle(g.time, di) > DOOR_SHUT_AT - 0.2)) h.ticks(1)
    place(g, inGap, z.id, inst.x, inst.y)
    h.ticks(SEC / 2)
    expect(inGap.alive).toBe(true)
    expect(inGap.hp).toBeLessThan(2.5)
  })

  it('隔一道故障門下移動命令：走到門前等開門的空檔再過，每次都到得了，幾乎不會被夾；不提示「找不到路」', () => {
    const { h, cs } = Harness.started(2, 4242, { eventMult: 0, npcCrew: 0, bots: 0 })
    const g = h.server.game!
    const p = g.allPlayers()[0]
    const c = cs.find((x) => x.slot === p.slot)!
    const u = g.mainOf(p)!
    g.triggerEvent!('doors', true)
    let runs = 0
    let hits = 0
    let late = 0
    for (const z of g.world.zones.filter((q) => q.alive && q.layout && q.station && !q.key.startsWith('ship:')).slice(0, 4)) {
      for (const di of crossable(g, z).slice(0, 3)) {
        const [a, b] = sides(z, di, 2.5)!
        // 每扇門從週期中不同的時刻出發
        for (let k = 0; k < 4; k++) {
          place(g, u, z.id, a.x, a.y)
          u.hp = u.maxHp
          h.ticks(5 + k * 9)
          doorHits.delete(u.id)
          g.handleCommand(p.slot, { k: 'move', x: b.x, y: b.y })
          let t = 0
          while (t < 8 * SEC && Math.hypot(u.x - b.x, u.y - b.y) > 0.3) {
            h.ticks(1)
            t++
          }
          runs++
          hits += doorHits.get(u.id) ?? 0
          if (Math.hypot(u.x - b.x, u.y - b.y) > 0.3) late++
          // 最久等一個週期再加上走路的時間
          expect(t).toBeLessThan(5 * SEC)
        }
      }
    }
    expect(runs).toBeGreaterThanOrEqual(12)
    expect(late).toBe(0)
    expect(hits).toBe(0)
    expect(count(c, 'move.noPath')).toBe(0)
    // 等門的說明：有，但不洗版（每 30 秒最多一次）
    const waits = count(c, 'move.doorWait')
    expect(waits).toBeGreaterThanOrEqual(1)
    expect(waits).toBeLessThanOrEqual(Math.ceil(g.time / 30) + 1)
  })

  it('故障期間門被鎖上（走不到）：照舊放棄命令、回 move.noPath', () => {
    const { h, cs } = Harness.started(2, 4242, { eventMult: 0, npcCrew: 0, bots: 0 })
    const g = h.server.game!
    const p = g.allPlayers()[0]
    const c = cs.find((x) => x.slot === p.slot)!
    const u = g.mainOf(p)!
    const z = g.world.zoneByKey('nyx')!
    const di = crossable(g, z)[0]
    const [a] = sides(z, di, 2.5)!
    place(g, u, z.id, a.x, a.y)
    g.triggerEvent!('doors', true)
    h.ticks(SEC)
    for (const d of z.doors) d.locked = true
    h.ticks(2)
    expect(z.doors.every((d) => !d.cycling)).toBe(true)
    // 隔著鎖住的門、走不到的點
    const pts = z.layout!.doors.flatMap((d) => [
      [d.x + 2, d.y],
      [d.x - 2, d.y],
      [d.x, d.y + 2],
      [d.x, d.y - 2],
    ])
    const goal = pts.map(([x, y]) => z.nav!.nearestOpen(x, y)).find((n) => n && !z.nav!.findPath(u.x, u.y, n.x, n.y, u.radius, (i) => !z.doors[i]?.locked))!
    expect(goal).toBeTruthy()
    c.inbox.length = 0
    g.handleCommand(p.slot, { k: 'move', x: goal.x, y: goal.y })
    h.ticks(SEC)
    expect(u.order?.k).not.toBe('move')
    expect(count(c, 'move.noPath')).toBe(1)
    expect(count(c, 'move.doorWait')).toBe(0)
  })

  it('練習局（簡單、7 個 AI）：門故障 300 秒內 AI 不會被門夾死', () => {
    const srv = new GameServer(PRACTICE_ROOM, { send: () => {} }, 5100, 5100 ^ 0x5bd1e995)
    srv.onJoin(LOCAL_PEER)
    srv.onMessage(LOCAL_PEER, encode({ t: 'hello', name: 'Me', color: 0, ver: 1, token: 'tokMexxxxxxx' }))
    srv.onMessage(LOCAL_PEER, encode({ t: 'settings', s: { bots: 7, aiLevel: 'easy', eventMult: 0 } }))
    srv.onMessage(LOCAL_PEER, encode({ t: 'start', role: 'human' }))
    const g = srv.game!
    for (let i = 0; i < 60 * SEC; i++) srv.tick()
    const bots = g.allPlayers().filter((q) => q.bot)
    const alive0 = bots.filter((q) => q.alive).length
    doorHits.clear()
    g.triggerEvent!('doors', true)
    for (let i = 0; i < 300 * SEC && !g.ended; i++) srv.tick()
    const botHits = bots.reduce((n, q) => n + (doorHits.get(q.main) ?? 0), 0)
    expect(bots.filter((q) => q.alive).length).toBe(alive0)
    expect(botHits).toBeLessThanOrEqual(3)
  })

  it('洩漏檢查：故障期間門照週期開關（視線跟著變），快照仍只含看得到的東西', () => {
    const { h, cs } = Harness.started(6, 77, { npcCrew: 2, bots: 2 })
    const g = h.server.game!
    h.leakWatch = true
    g.triggerEvent!('doors', true)
    for (let t = 0; t < 30 * SEC; t++) {
      if (t % SEC === 0) {
        for (const c of cs) {
          const u = c.ents.get(c.me.unit as number)
          if (u) c.send({ t: 'cmd', seq: t, c: { k: 'move', x: u.x! / 100 + (t % (2 * SEC) ? 7 : -7), y: u.y! / 100 + 3 } })
        }
      }
      h.ticks(1)
    }
    expect(h.drainLeaks()).toEqual([])
  })

  it('字串 zh／en 都有', () => {
    for (const k of ['move.doorWait', 'move.noPath', 'event.doors']) {
      expect(hasString('zh', k)).toBe(true)
      expect(hasString('en', k)).toBe(true)
    }
  })
})
