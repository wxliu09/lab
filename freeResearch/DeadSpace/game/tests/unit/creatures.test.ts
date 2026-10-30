// 生物與 NPC：開局生成、敵對生物索敵與鎮定薰香、受驚逃跑、綏靖機器人、NPC 船員、蛞蝓長老、死者附身
import { describe, expect, it } from 'vitest'
import { Harness } from './helpers/harness'
import { checkMessages } from './helpers/leak'
import { spawnCreature } from '../../src/sim/ai/creatures'
import { giveItem, makeItem, wearSuit } from '../../src/sim/systems/items'
import { unitDef } from '../../src/shared/content/registry'
import { damage } from '../../src/sim/systems/damage'
import { isHostile } from '../../src/sim/systems/combat'
import { HOSTILE, NEUTRAL, type Ent } from '../../src/sim/ent'
import type { Game } from '../../src/sim/game'
import { SPACE_ZONE } from '../../src/sim/world'

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
        if (ok && g.world.query(z.id, x + 0.5, y + 0.5, r + 6).some((e) => !e.isMain)) ok = false
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
  issue0(e)
  return e
}

function issue0(e: Ent): void {
  e.order = null
  e.queue.length = 0
  e.path = null
}

function setup(n = 3, settings: Record<string, unknown> = {}) {
  const { h, cs } = Harness.started(n, 777, settings)
  const g = h.server.game!
  const ps = g.allPlayers()
  for (const p of ps) g.setRole(p, 'human')
  const spot = openSpot(g)
  // 玩家先站遠一點
  for (let i = 0; i < ps.length; i++) place(g, g.mainOf(ps[i])!, spot, -3.5 + i * 2, 3.8)
  return { h, g, ps, spot, cs }
}

describe('開局生成', () => {
  it('女帝號實驗室：4 隻失敗實驗體（其中一隻帶綿羊玩偶）、綏靖機器人、2 架防禦無人機', () => {
    const { g } = setup()
    const nyx = g.world.zoneByKey('nyx')!
    const ids = g.world.inZone(nyx.id).map((e) => e.def.id)
    const count = (id: string) => ids.filter((x) => x === id).length
    expect(count('creature.failed') + count('creature.failedSheep')).toBe(4)
    expect(count('creature.failedSheep')).toBe(1)
    expect(count('npc.pacifier')).toBe(1)
    expect(count('npc.defenseDrone')).toBe(2)
  })

  it('NPC 船員：大廳指定數量；自動模式依人數', () => {
    const a = setup(3, { npcCrew: 4 })
    expect([...a.g.world.ents.values()].filter((e) => e.def.id === 'npc.crew').length).toBe(4)
    const b = setup(3, { npcCrew: -1 })
    expect([...b.g.world.ents.values()].filter((e) => e.def.id === 'npc.crew').length).toBe(6)
  })
})

describe('生物 AI', () => {
  it('敵對生物會攻擊附近的玩家；帶鎮定薰香的人不會被主動挑上，打牠之後才會', () => {
    const { h, g, ps, spot } = setup()
    const u = place(g, g.mainOf(ps[0])!, spot, 1.5, 0)
    const sk = spawnCreature(g, 'creature.skitter', spot.zone, spot.x - 1.5, spot.y)!
    expect(sk.owner).toBe(HOSTILE)
    const hp0 = u.hp
    sec(h, 3)
    expect(u.hp).toBeLessThan(hp0)

    // 換一個帶薰香的人
    const v = place(g, g.mainOf(ps[1])!, spot, 1.5, -1)
    // 其他人都移開
    for (const p of [ps[0], ps[2]]) g.world.relocate(g.mainOf(p)!, spot.zone, spot.x + 30, spot.y + 30)
    u.hp = u.maxHp
    giveItem(g, v, makeItem('calmingIncense'))
    g.world.relocate(sk, spot.zone, spot.x - 1.5, spot.y - 1)
    issue0(sk)
    sk.data.aggro = undefined
    sk.data.returning = false
    sk.data.home = { x: sk.x, y: sk.y }
    // 薰香：不會被主動挑選
    expect(isHostile(g, sk, v)).toBe(false)
    const hv = v.hp
    sec(h, 3)
    expect(v.hp).toBe(hv)
    // 被打之後記仇
    damage(g, v, sk, 5)
    expect(sk.data.aggro).toBe(v.id)
    expect(isHostile(g, sk, v)).toBe(true)
  })

  it('小動物受傷會逃離攻擊者', () => {
    const { h, g, ps, spot } = setup()
    const u = place(g, g.mainOf(ps[0])!, spot, 0, 0)
    const c = spawnCreature(g, 'creature.chicken', spot.zone, spot.x + 1, spot.y)!
    const d0 = Math.hypot(c.x - u.x, c.y - u.y)
    damage(g, u, c, 1)
    sec(h, 2)
    expect(Math.hypot(c.x - u.x, c.y - u.y)).toBeGreaterThan(d0 + 1)
  })

  it('綏靖機器人：只在實驗室動力期間攻擊穿著防護服的人', () => {
    const { h, g, ps, spot } = setup()
    const bot = spawnCreature(g, 'npc.pacifier', spot.zone, spot.x - 2, spot.y)!
    const u = place(g, g.mainOf(ps[0])!, spot, 2, 0)
    giveItem(g, u, makeItem('suit.cryo'))
    expect(wearSuit(g, g.mainOf(ps[0])!, u.inv!.findIndex((x) => x?.id === 'suit.cryo'))).toBe(true)
    const w = g.mainOf(ps[0])!
    const hp0 = w.hp
    sec(h, 3)
    expect(u.hp).toBe(hp0)
    g.world.zones[spot.zone].data.labPower = true
    sec(h, 4)
    expect(w.hp).toBeLessThan(hp0)
    void bot
  })

  it('NPC 船員：看到怪物形態傷人就開火；發現屍體會廣播', () => {
    const { h, g, ps, spot } = setup(3, { npcCrew: 0 })
    const crew = spawnCreature(g, 'npc.crew', spot.zone, spot.x - 2.5, spot.y)!
    crew.data.crew = true
    crew.data.nextPatrol = 1e9
    const victim = place(g, g.mainOf(ps[1])!, spot, 0, 0)
    const monster = g.world.spawn(unitDef('xeno.timeZombie'), spot.zone, spot.x + 1.5, spot.y, ps[0].slot)
    monster.acquire = false
    damage(g, monster, victim, 20)
    sec(h, 0.2)
    expect(crew.order?.k).toBe('attack')
    expect(crew.order?.e).toBe(monster.id)
    const mhp = monster.hp
    sec(h, 3)
    expect(monster.hp).toBeLessThan(mhp)
    // 屍體
    g.world.remove(monster)
    issue0(crew)
    g.killEnt(victim, null, -1)
    sec(h, 12)
    expect((g.data.creatures as { reported: Set<number> }).reported.size).toBe(1)
  })

  it('蛞蝓長老：給綿羊玩偶 → 11 秒後綿羊號出現在太空，艙內 12 隻羊；給其他東西會退回', () => {
    const { h, g, ps, spot } = setup()
    const u = place(g, g.mainOf(ps[0])!, spot, 0, 0)
    const elder = spawnCreature(g, 'creature.elderSlug', spot.zone, spot.x + 1, spot.y)!
    elder.data.thinkAt = 1e9
    giveItem(g, u, makeItem('stim'))
    const s0 = u.inv!.findIndex((x) => x?.id === 'stim')
    void elder.data
    u.order = { k: 'give', e: elder.id, s: s0 }
    sec(h, 0.5)
    expect(u.inv!.some((x) => x?.id === 'stim')).toBe(true)
    giveItem(g, u, makeItem('sheepPlush'))
    const s1 = u.inv!.findIndex((x) => x?.id === 'sheepPlush')
    u.order = { k: 'give', e: elder.id, s: s1 }
    sec(h, 0.5)
    expect(u.inv!.some((x) => x?.id === 'sheepPlush')).toBe(false)
    const ships = () => g.world.inZone(SPACE_ZONE).filter((e) => e.def.id === 'ship.woolly')
    expect(ships().length).toBe(0)
    sec(h, 11.5)
    expect(ships().length).toBe(1)
    const inside = g.world.inZone(ships()[0].data.interior as number).filter((e) => e.def.id === 'creature.sheep')
    expect(inside.length).toBe(12)
  })

  it('死者輸入 -slug 附身一隻蛞蝓仔並能操控；每人一次', () => {
    const { h, g, ps, spot, cs } = setup()
    spawnCreature(g, 'creature.slugling', spot.zone, spot.x + 2, spot.y + 2)
    const p = ps[1]
    g.killEnt(g.mainOf(p)!, null, -1)
    sec(h, 0.5)
    cs[1].send({ t: 'chat', ch: 'all', text: '-slug' })
    sec(h, 0.2)
    const s = g.world.get(p.control)!
    expect(s.def.id).toBe('creature.slugling')
    expect(s.owner).toBe(p.slot)
    const x0 = s.x
    cs[1].send({ t: 'cmd', seq: 1, c: { k: 'move', x: s.x + 3, y: s.y } })
    sec(h, 2)
    expect(s.x).toBeGreaterThan(x0 + 1)
    // 第二次無效
    g.killEnt(s, null, -1)
    spawnCreature(g, 'creature.slugling', spot.zone, spot.x + 2, spot.y + 2)
    cs[1].send({ t: 'chat', ch: 'all', text: '-slug' })
    sec(h, 0.2)
    expect(p.control).toBe(0)
  })

  it('洩漏：船員巡邏、生物漫遊時，每 tick 的快照都只含可見實體', () => {
    const { h } = Harness.started(6, 99, { npcCrew: 5 })
    const g0 = h.server.game!
    const problems: string[] = []
    for (let i = 0; i < 300; i++) {
      h.ticks(1)
      for (const [peer, raws] of h.raw) {
        const slot = h.server.slotOfPeer(peer)
        if (slot === null) continue
        problems.push(...checkMessages(g0, slot, raws))
        raws.length = 0
      }
    }
    expect([...new Set(problems)]).toEqual([])
  })
})

void NEUTRAL
