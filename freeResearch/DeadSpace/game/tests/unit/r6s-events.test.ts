// 第 6 輪（付費玩家第一晚審查）sim 端的事件與訊息：
// - 通訊病毒：開局 10 分鐘內不會被隨機抽到；換名時私訊「別人眼中的你現在叫什麼、多久後恢復」，VIRUS_SWAP_S 秒後全部恢復並再私訊一次；
//   私訊不帶別人的名字（A P2）
// - 被抽血的人私訊「X 抽了你的血」，X 是他眼中抽血者的名字（通訊病毒期間就是換到的名字）；看不到抽血者就不說（A P3）
// - 結算時間軸的持續傷害寫出是哪一種（寄生、燃燒、輻射…）（A P3）
// - 門故障：剛公告過的 45 秒內，等門的私訊不再重複說一次（B P3）
import { describe, expect, it } from 'vitest'
import { Harness, type FakeClient } from './helpers/harness'
import { GameServer, LOCAL_PEER } from '../../src/sim/server'
import { encode } from '../../src/shared/protocol/codec'
import { PRACTICE_ROOM } from '../../src/shared/protocol/messages'
import { VIRUS_EARLIEST, VIRUS_SWAP_S, eventsOf, pickEvent } from '../../src/sim/systems/events'
import { giveItem, makeItem } from '../../src/sim/systems/items'
import { SCRIPTS } from '../../src/sim/systems/effects'
import { applyBuff } from '../../src/sim/systems/buffs'
import { damage } from '../../src/sim/systems/damage'
import type { Zone } from '../../src/sim/world'
import { fmtKey, shownBase, type Game, type GamePlayer } from '../../src/sim/game'
import { hasString } from '../../src/ui/i18n'
import '../../src/ui/strings/sim8'

const sec = (h: Harness, s: number) => h.ticks(Math.round(s * 20))

function chatOf(c: FakeClient): string[] {
  const out: string[] = []
  for (const m of c.inbox) if (m.t === 'chat') for (const l of m.lines) out.push(l.text)
  return out
}

function privOf(c: FakeClient): string[] {
  const out: string[] = []
  for (const m of c.inbox) if (m.t === 'chat') for (const l of m.lines) if (l.ch === 'private') out.push(l.text)
  return out
}

const clientOf = (h: Harness, p: GamePlayer): FakeClient => [...h.clients.values()].find((c) => c.slot === p.slot)!

describe('通訊病毒', () => {
  it('開局 10 分鐘內不會被隨機抽到（本作預設；強制觸發照舊）', () => {
    const s = new GameServer('TEST1', { send: () => {} }, 61, 61 ^ 0x5bd1e995)
    s.onJoin(LOCAL_PEER)
    s.onMessage(LOCAL_PEER, encode({ t: 'hello', name: 'host', color: 0, ver: 1, token: 'tokhostxxxxx' }))
    s.onMessage(LOCAL_PEER, encode({ t: 'settings', s: { bots: 4, npcCrew: 0 } }))
    s.onMessage(LOCAL_PEER, encode({ t: 'start' }))
    s.tick()
    const g = s.game!
    const draws = (at: number) => {
      g.world.time = at
      const seen = new Set<string>()
      for (let i = 0; i < 800; i++) {
        const id = pickEvent(g, false)
        if (id) seen.add(id)
      }
      return seen
    }
    expect(VIRUS_EARLIEST).toBe(600)
    expect(draws(180).has('virus')).toBe(false)
    expect(draws(VIRUS_EARLIEST - 1).has('virus')).toBe(false)
    expect(draws(VIRUS_EARLIEST + 1).has('virus')).toBe(true)
    // 只出原作事件：整局都不出（原作 1.8.2 的通訊病毒是死碼）
    const p = new GameServer(PRACTICE_ROOM, { send: () => {} }, 62, 62 ^ 0x5bd1e995)
    p.onJoin(LOCAL_PEER)
    p.onMessage(LOCAL_PEER, encode({ t: 'hello', name: 'host', color: 0, ver: 1, token: 'tokhostxxxxx' }))
    p.onMessage(LOCAL_PEER, encode({ t: 'settings', s: { bots: 4, npcCrew: 0, extraEvents: false } }))
    p.onMessage(LOCAL_PEER, encode({ t: 'start' }))
    p.tick()
    p.game!.world.time = 1500
    for (let i = 0; i < 400; i++) expect(pickEvent(p.game!, false)).not.toBe('virus')
  })

  it('換名時私訊自己的新名字與恢復時間；時間到全部恢復（名字、顏色），再私訊一次；私訊不帶別人的名字', () => {
    const { h } = Harness.started(5, 2077, { eventMult: 0 })
    const g: Game = h.server.game!
    const ps = g.allPlayers()
    const before = ps.map((p) => ({ name: p.name, color: p.color }))
    for (const c of h.clients.values()) c.inbox.length = 0
    g.triggerEvent!('virus', true)
    sec(h, 10.2)
    expect(ps.some((p) => shownBase(p) !== p.baseName)).toBe(true)
    for (const p of ps) {
      const mine = privOf(clientOf(h, p)).filter((l) => l.startsWith('@event.virus'))
      expect(mine).toEqual([fmtKey('event.virusYou', { name: p.name, s: VIRUS_SWAP_S })])
    }
    expect(chatOf(clientOf(h, ps[0]))).toContain(fmtKey('event.virusDone', { s: VIRUS_SWAP_S }))
    for (const c of h.clients.values()) c.inbox.length = 0
    sec(h, VIRUS_SWAP_S + 0.5)
    ps.forEach((p, i) => {
      expect(p.name).toBe(before[i].name)
      expect(p.color).toBe(before[i].color)
      expect(shownBase(p)).toBe(p.baseName)
      expect(g.mainOf(p)!.name).toBe(p.name)
    })
    for (const p of ps) {
      const priv = privOf(clientOf(h, p))
      expect(priv.filter((l) => l.startsWith('@event.virus'))).toEqual([fmtKey('event.virusRestored', { name: p.name })])
      // 私訊裡不會出現別人的名字
      for (const q of ps) if (q !== p) expect(priv.some((l) => l.includes(q.baseName))).toBe(false)
    }
    expect(chatOf(clientOf(h, ps[0]))).toContain('@event.virusEnd')
  })
})

describe('被抽血的通知', () => {
  function setup() {
    const { h } = Harness.started(3, 2090, { eventMult: 0, npcCrew: 0 })
    const g: Game = h.server.game!
    const ps = g.allPlayers()
    for (const p of ps) g.setRole(p, 'human')
    const u = g.mainOf(ps[0])!
    const t = g.mainOf(ps[1])!
    g.world.relocate(t, u.zone, u.x + 1, u.y)
    h.ticks(2)
    u.inv!.fill(null)
    giveItem(g, u, makeItem('geneSampler'))
    const draw = () => {
      const slot = u.inv!.findIndex((x) => x?.id === 'geneSampler')
      SCRIPTS.get('git.draw')!(g, { caster: u, target: t, x: t.x, y: t.y, zone: t.zone, itemSlot: slot } as never, {})
      h.ticks(1)
    }
    for (const c of h.clients.values()) c.inbox.length = 0
    return { h, g, ps, u, t, draw }
  }

  it('被抽血的人收到「X 抽了你的血」，X 是他看到的名字；抽血者自己、旁人收不到', () => {
    const { h, ps, draw } = setup()
    draw()
    expect(privOf(clientOf(h, ps[1]))).toContain(fmtKey('git.msg.drawnBy', { name: ps[0].name }))
    expect(privOf(clientOf(h, ps[0])).some((l) => l.startsWith('@git.msg.drawnBy'))).toBe(false)
    expect(privOf(clientOf(h, ps[2])).some((l) => l.startsWith('@git.msg.drawnBy'))).toBe(false)
  })

  it('通訊病毒期間：用換到的名字（不洩漏真名）', () => {
    const { h, g, ps, draw } = setup()
    g.triggerEvent!('virus', true)
    sec(h, 10.2)
    for (const c of h.clients.values()) c.inbox.length = 0
    draw()
    const line = privOf(clientOf(h, ps[1])).find((l) => l.startsWith('@git.msg.drawnBy'))!
    expect(line).toBe(fmtKey('git.msg.drawnBy', { name: ps[0].name }))
    if (shownBase(ps[0]) !== ps[0].baseName) expect(line).not.toContain(ps[0].baseName)
  })

  it('看不到抽血者（隱形）：不說', () => {
    const { h, g, ps, u, draw } = setup()
    applyBuff(g, u, 'bf.innateStealth', 30)
    u.statsDirty = true
    h.ticks(2)
    expect(ps[1].view.visible.has(u.id)).toBe(false)
    for (const c of h.clients.values()) c.inbox.length = 0
    draw()
    expect(privOf(clientOf(h, ps[1])).some((l) => l.startsWith('@git.msg.drawnBy'))).toBe(false)
  })
})

describe('結算時間軸：持續傷害寫出來源', () => {
  it('被無主的持續傷害（地表輻射）弄死：寫出是哪一種持續傷害', () => {
    const { h } = Harness.started(2, 2091, { eventMult: 0, npcCrew: 0 })
    const g: Game = h.server.game!
    const ps = g.allPlayers()
    for (const p of ps) g.setRole(p, 'human')
    const u = g.mainOf(ps[1])!
    u.hp = 5
    // 和 stations.ts 的地表輻射同一種呼叫
    damage(g, null, u, 50, { kind: 'energy', dot: true, buff: 'bf.planetRad' })
    h.ticks(2)
    expect(u.alive).toBe(false)
    const tl = g.timeline.map((x) => x.text)
    expect(tl).toContain(fmtKey('tl.cause.dotOf', { uz: '行星輻射', ue: 'Planetary Radiation' }))
  })

  it('下手的人查得到、但他的單位已經不在（例如變身換了 id）：寫出是誰造成的哪一種持續傷害', () => {
    const { h } = Harness.started(2, 2092, { eventMult: 0, npcCrew: 0 })
    const g: Game = h.server.game!
    const ps = g.allPlayers()
    for (const p of ps) g.setRole(p, 'human')
    const u = g.mainOf(ps[1])!
    u.hp = 5
    damage(g, null, u, 50, { kind: 'poison', dot: true, buff: 'bf.parasite', srcSlot: ps[0].slot })
    h.ticks(2)
    expect(u.alive).toBe(false)
    const tl = g.timeline.map((x) => x.text)
    expect(tl.some((x) => x.startsWith('@tl.cause.dotBy|') && x.includes('uz=寄生'))).toBe(true)
  })

  it('字串兩種語言都有', () => {
    for (const k of ['tl.cause.dotOf', 'tl.cause.dotBy', 'git.msg.drawnBy', 'event.virusRestored', 'event.virusEnd']) {
      expect([k, hasString('zh', k), hasString('en', k)]).toEqual([k, true, true])
    }
  })
})

/** 門兩側、沿通道方向 dist 公尺的可走點（兩點之間只隔這扇門）*/
function sides(z: Zone, di: number, dist: number): [{ x: number; y: number }, { x: number; y: number }] | null {
  const inst = z.layout!.doors[di]
  const nav = z.nav!
  const pt = (s: number) => (inst.horizontal ? { x: inst.x, y: inst.y + s * dist } : { x: inst.x + s * dist, y: inst.y })
  const a = pt(-1)
  const b = pt(1)
  if (nav.blockedAt(a.x, a.y) || nav.blockedAt(b.x, b.y)) return null
  if (!nav.walkable(a.x, a.y, b.x, b.y, 0.4)) return null
  return [a, b]
}

describe('門故障：等門的私訊', () => {
  it('剛公告過的 45 秒內，走過故障門不再私訊「在等門」；之後照舊', () => {
    const { h } = Harness.started(1, 4242, { eventMult: 0, npcCrew: 0, bots: 0 })
    const g: Game = h.server.game!
    const p = g.allPlayers()[0]
    const c = clientOf(h, p)
    const u = g.mainOf(p)!
    u.acquire = false
    const z = g.world.zones.find((q) => q.key === 'nyx')!
    const di = z.doors.findIndex((d) => !d.clearance && !d.security && !d.locked && !d.broken && sides(z, d.index, 2.5))
    const [a, b] = sides(z, di, 2.5)!
    g.triggerEvent!('doors', true)
    expect(eventsOf(g).doorsAt).toBeCloseTo(g.time, 3)
    const cross = () => {
      for (let k = 0; k < 6; k++) {
        g.world.relocate(u, z.id, k % 2 ? b.x : a.x, k % 2 ? b.y : a.y)
        u.order = null
        u.path = null
        g.handleCommand(p.slot, { k: 'move', x: k % 2 ? a.x : b.x, y: k % 2 ? a.y : b.y })
        sec(h, 4)
      }
    }
    for (const cl of h.clients.values()) cl.inbox.length = 0
    cross()
    expect(g.time - eventsOf(g).doorsAt).toBeLessThan(45)
    expect(privOf(c).filter((l) => l === '@move.doorWait')).toEqual([])
    sec(h, 45 - (g.time - eventsOf(g).doorsAt) + 1)
    for (const cl of h.clients.values()) cl.inbox.length = 0
    cross()
    expect(privOf(c).filter((l) => l === '@move.doorWait').length).toBeGreaterThanOrEqual(1)
  })
})
