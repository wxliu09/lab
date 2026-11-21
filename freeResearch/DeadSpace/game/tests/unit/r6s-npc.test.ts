// 第 6 輪（付費玩家第一晚審查 B P1）：NPC 船員被誤傷後追殺到死、自己的單位不還手
// - 船員、無人機的仇恨到期就放下攻擊命令（不再追殺）；擦到一下只記一小段時間，重傷記滿 30 秒
// - 被 NPC 打的玩家單位，閒置或原地（H）時自動還擊那個 NPC（只對 NPC）；還手不會延長仇恨
// - 輻射裝外洩這類持續傷害不算冒犯
// - 被船員打死時，死因私訊補一句「是你先傷到了船員」
import { describe, expect, it } from 'vitest'
import { Harness, type FakeClient } from './helpers/harness'
import { AGGRO_MAX, AGGRO_MIN, spawnCreature } from '../../src/sim/ai/creatures'
import { damage } from '../../src/sim/systems/damage'
import { isHostile } from '../../src/sim/systems/combat'
import { hasString } from '../../src/ui/i18n'
import '../../src/ui/strings/sim8'
import type { Ent } from '../../src/sim/ent'
import type { Game, GamePlayer } from '../../src/sim/game'

interface Spot {
  zone: number
  x: number
  y: number
}

function openSpot(g: Game, r = 4): Spot {
  for (const z of g.world.zones) {
    if (!z.nav || !z.layout || z.data.ship) continue
    const { w, h } = z.layout
    const avoid = [...z.layout.pads, ...z.layout.exits]
    for (let y = r + 1; y < h - r - 1; y++) {
      for (let x = r + 1; x < w - r - 1; x++) {
        let ok = !avoid.some((p) => Math.hypot(p.x - x, p.y - y) < r + 6)
        if (ok && g.world.query(z.id, x + 0.5, y + 0.5, r + 8).some((e) => !e.isMain)) ok = false
        for (let dy = -r; dy <= r && ok; dy++) {
          for (let dx = -r; dx <= r && ok; dx++) {
            const i = z.nav.idx(x + dx + 0.5, y + dy + 0.5)
            if (i < 0 || z.nav.blockedIdx(i) || z.nav.doorOf[i] >= 0) ok = false
          }
        }
        if (ok) return { zone: z.id, x: x + 0.5, y: y + 0.5 }
      }
    }
  }
  throw new Error('找不到空地')
}

const sec = (h: Harness, s: number) => h.ticks(Math.round(s * 20))

function place(g: Game, e: Ent, s: Spot, dx: number, dy: number): Ent {
  g.world.relocate(e, s.zone, s.x + dx, s.y + dy)
  e.order = null
  e.queue.length = 0
  e.path = null
  return e
}

function setup(seed = 777) {
  const { h, cs } = Harness.started(3, seed, { npcCrew: 0, eventMult: 0 })
  const g = h.server.game!
  const ps = g.allPlayers()
  for (const p of ps) g.setRole(p, 'human')
  const spot = openSpot(g)
  // 其他人放到別的站、凍結（不要被波及，也不要亂跑）
  const far = g.world.zones.find((z) => z.id !== spot.zone && z.layout && z.nav && z.station && !z.data.ship)!
  for (const p of ps.slice(1)) {
    const o = g.mainOf(p)!
    const at = far.layout!.spawns[0]
    place(g, o, { zone: far.id, x: at.x, y: at.y }, 0, 0)
    o.data.frozen = true
  }
  const u = place(g, g.mainOf(ps[0])!, spot, 0, 0)
  u.inv!.fill(null)
  const crew = spawnCreature(g, 'npc.crew', spot.zone, spot.x - 3, spot.y)!
  crew.data.crew = true
  crew.data.nextPatrol = 1e9
  crew.order = null
  return { h, cs, g, ps, u, crew, spot }
}

function chatOf(c: FakeClient): string[] {
  const out: string[] = []
  for (const m of c.inbox) if (m.t === 'chat') for (const l of m.lines) out.push(l.text)
  return out
}

const clientOf = (h: Harness, p: GamePlayer): FakeClient => [...h.clients.values()].find((c) => c.slot === p.slot)!

describe('NPC 船員的仇恨會過期', () => {
  it('擦到一下：船員開火、自己的單位（閒置的人員）自動還手；仇恨到期後雙方都停手，不會被追殺到死', () => {
    const { h, g, u, crew } = setup()
    damage(g, u, crew, 30)
    sec(h, 0.3)
    expect(crew.order?.k).toBe('attack')
    expect(crew.order?.e).toBe(u.id)
    const chp = crew.hp
    sec(h, 4)
    // 自己的單位閒置：自動還擊那名船員
    expect(crew.hp).toBeLessThan(chp)
    expect(u.order?.k).toBe('attack')
    expect(u.order?.e).toBe(crew.id)
    // 擦到一下（30／400）：記仇遠少於 30 秒；還手不延長
    sec(h, AGGRO_MIN + 6)
    expect(crew.order?.k).not.toBe('attack')
    expect(u.order?.k).not.toBe('attack')
    expect(isHostile(g, crew, u)).toBe(false)
    expect(isHostile(g, u, crew)).toBe(false)
    expect(u.alive).toBe(true)
    // 之後就相安無事
    const hp1 = u.hp
    sec(h, 10)
    expect(u.hp).toBeGreaterThanOrEqual(hp1)
  })

  it('重傷船員記滿 30 秒', () => {
    const { h, g, u, crew } = setup()
    // 不還手、不會死：只看船員記仇多久
    u.data.god = true
    u.data.frozen = true
    damage(g, u, crew, 220)
    sec(h, 0.3)
    expect(crew.order?.k).toBe('attack')
    sec(h, AGGRO_MAX - 5)
    expect(crew.alive && crew.order?.k).toBe('attack')
    sec(h, 8)
    expect(crew.order?.k).not.toBe('attack')
  })

  it('原地（H）時也會還擊打自己的 NPC，而且不移動', () => {
    const { h, g, ps, u, crew } = setup()
    g.handleCommand(ps[0].slot, { k: 'hold' })
    damage(g, u, crew, 30)
    const x0 = u.x
    const y0 = u.y
    const chp = crew.hp
    sec(h, 4)
    expect(crew.hp).toBeLessThan(chp)
    expect(Math.hypot(u.x - x0, u.y - y0)).toBeLessThan(0.05)
  })

  it('被敵對生物咬：閒置的人員（平常不自動索敵）也會還擊咬他的那一隻，不會去打旁邊別的', () => {
    const { h, g, u, crew, spot } = setup()
    g.world.remove(crew)
    expect(u.acquire).toBe(false)
    const a = spawnCreature(g, 'creature.skitter', spot.zone, u.x + 1.2, u.y)!
    const b = spawnCreature(g, 'creature.skitter', spot.zone, u.x - 2.5, u.y)!
    for (const m of [a, b]) {
      m.data.frozen = true
      m.maxHp = m.hp = 1e5
    }
    u.data.god = true
    damage(g, a, u, 20)
    sec(h, 2)
    expect(a.hp).toBeLessThan(1e5)
    expect(b.hp).toBe(1e5)
  })

  it('只對 NPC 自動還擊：被其他玩家打不會自動開火', () => {
    const { h, g, ps, u } = setup()
    const o = g.mainOf(ps[1])!
    o.data.frozen = false
    place(g, o, { zone: u.zone, x: u.x, y: u.y }, 2, 0)
    damage(g, o, u, 30)
    const hp = o.hp
    sec(h, 3)
    expect(o.hp).toBe(hp)
    expect(u.order?.k).not.toBe('attack')
  })

  it('輻射裝外洩這類持續傷害不算冒犯', () => {
    const { h, g, u, crew } = setup()
    for (let i = 0; i < 40; i++) damage(g, u, crew, 2.5 / 20, { kind: 'energy', dot: true, buff: 'bf.rad.sick' })
    sec(h, 0.5)
    expect(crew.order?.k).not.toBe('attack')
    expect(isHostile(g, crew, u)).toBe(false)
  })
})

describe('被船員打死的死因說明', () => {
  it('先傷到船員、被船員打死：死因後面補一句「是你先傷到了船員」（只給死者）', () => {
    const { h, g, ps, u, crew } = setup()
    for (const c of h.clients.values()) c.inbox.length = 0
    u.hp = 25
    damage(g, u, crew, 30)
    for (let i = 0; i < 20 * 20 && u.alive; i++) h.ticks(1)
    expect(u.alive).toBe(false)
    const mine = chatOf(clientOf(h, ps[0]))
    const cause = mine.findIndex((l) => l.startsWith('@death.cause.'))
    const note = mine.indexOf('@death.note.npc.crew')
    expect(cause).toBeGreaterThanOrEqual(0)
    expect(note).toBe(cause + 1)
    // 其他人收不到
    for (const p of ps.slice(1)) expect(chatOf(clientOf(h, p)).some((l) => l.startsWith('@death.note.'))).toBe(false)
  })

  it('字串兩種語言都有', () => {
    for (const k of ['death.note.npc.crew', 'death.note.npc.drone', 'death.note.npc.monster', 'death.note.npc.helped']) {
      expect([k, hasString('zh', k), hasString('en', k)]).toEqual([k, true, true])
    }
  })
})
