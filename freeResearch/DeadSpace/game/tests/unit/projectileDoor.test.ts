// 投射物會撞上關著的門（開著的門照常穿過），手榴彈之類的範圍傷害在門前爆開
import { describe, expect, it } from 'vitest'
import { Harness } from './helpers/harness'
import { spawnProjectile } from '../../src/sim/systems/projectiles'
import { spawnCreature } from '../../src/sim/ai/creatures'

function doorCrossing(nav: any): { d: number; a: { x: number; y: number }; b: { x: number; y: number } } | null {
  const open = (x: number, y: number) => {
    const i = nav.idx(x, y)
    return i >= 0 && !nav.opaque[i] && nav.doorOf[i] < 0 && !nav.blockedAt(x, y)
  }
  for (let i = 0; i < nav.doorOf.length; i++) {
    const d = nav.doorOf[i]
    if (d < 0) continue
    const x = (i % nav.w) + 0.5
    const y = nav.h - 1 - Math.floor(i / nav.w) + 0.5
    for (const [ox, oy] of [
      [3, 0],
      [0, 3],
    ]) {
      if (open(x - ox, y - oy) && open(x + ox, y + oy)) return { d, a: { x: x - ox, y: y - oy }, b: { x: x + ox, y: y + oy } }
    }
  }
  return null
}

describe('投射物與門', () => {
  for (const closed of [true, false]) {
    it(`門${closed ? '關著：射不過去' : '開著：照常命中'}`, () => {
      const { h } = Harness.started(1, 9, { eventMult: 0, bots: 0 })
      const g = h.server.game!
      const z = g.world.zones.find((q) => q.key === 'nyx')!
      const nav = z.nav!
      const c = doorCrossing(nav)!
      expect(c).toBeTruthy()
      const shooter = g.mainOf(g.allPlayers()[0])!
      g.world.relocate(shooter, z.id, c.a.x, c.a.y)
      const target = spawnCreature(g, 'creature.rabbit', z.id, c.b.x, c.b.y)!
      target.data.frozen = true
      const hp0 = target.hp
      nav.doorClosed[c.d] = closed ? 1 : 0
      // 門的自動開關不要干擾：每 tick 維持指定狀態
      spawnProjectile(g, { caster: shooter, zone: z.id, x: c.a.x, y: c.a.y, tx: c.b.x, ty: c.b.y, target, speed: 10, fx: 'bullet', onHit: [{ k: 'damage', amount: 50, to: 'target' }] as never })
      for (let i = 0; i < 40; i++) {
        nav.doorClosed[c.d] = closed ? 1 : 0
        h.ticks(1)
      }
      if (closed) expect(target.hp).toBe(hp0)
      else expect(target.hp).toBeLessThan(hp0)
    })
  }
})
