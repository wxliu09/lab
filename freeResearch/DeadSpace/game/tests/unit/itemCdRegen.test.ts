// 道具冷卻要出現在背包的私有狀態（冷卻記在使用者的技能冷卻表，不在道具本身）；女帝號醫療艙的生命再生器是被動光環
import { describe, expect, it } from 'vitest'
import { Harness } from './helpers/harness'
import { ITEMS, abilityDef } from '../../src/shared/content/registry'
import { makeItem } from '../../src/sim/systems/items'
import { privateState } from '../../src/sim/systems/private'
import { REGEN_AURA_R } from '../../src/sim/systems/regen'
import { damage } from '../../src/sim/systems/damage'
import { entView } from '../../src/sim/systems/snapshot'
import { EntFlag } from '../../src/shared/protocol/messages'

describe('道具冷卻顯示', () => {
  it('用掉一個有冷卻的自身道具後，背包格帶出剩餘秒數並往下數', () => {
    const { h } = Harness.started(1, 3, { eventMult: 0, bots: 0 })
    const g = h.server.game!
    const p = g.allPlayers()[0]
    const u = g.mainOf(p)!
    const pick = [...ITEMS.values()].find((d) => {
      const ab = abilityDef(d.use ?? '')
      return ab && ab.cd >= 5 && ab.target === 'none' && !ab.cast && (d.charges ?? 0) !== 1
    })!
    expect(pick).toBeTruthy()
    u.inv!.fill(null)
    u.inv![0] = makeItem(pick.id)
    u.mp = u.maxMp
    u.statsDirty = true
    h.ticks(2)
    g.handleCommand(p.slot, { k: 'use', s: 0, x: u.x, y: u.y })
    h.ticks(4)
    const cd1 = privateState(g, p).inv[0]?.cd ?? 0
    expect(cd1).toBeGreaterThan(0)
    h.ticks(40)
    const cd2 = privateState(g, p).inv[0]?.cd ?? 0
    expect(cd2).toBeLessThan(cd1)
  })
})

describe('生命再生器', () => {
  it('站在旁邊會回血、走遠就停；是光環，不需要啟動', () => {
    const { h } = Harness.started(1, 3, { eventMult: 0, bots: 0 })
    const g = h.server.game!
    const p = g.allPlayers()[0]
    const u = g.mainOf(p)!
    const all = [...g.world.ents.values()].filter((e) => e.def.id === 'struct.regen')
    // 原作女帝號醫療艙有兩台
    expect(all.length).toBe(2)
    const regen = all[0]
    expect(regen).toBeTruthy()
    const z = g.world.zones[regen.zone]
    const near = z.nav!.nearestOpen(regen.x + 1.2, regen.y)!
    g.world.relocate(u, regen.zone, near.x, near.y)
    u.order = null
    u.hp = u.maxHp * 0.3
    const h0 = u.hp
    h.ticks(20 * 4)
    expect(u.buffs.some((b) => b.id === 'bf.regenAura')).toBe(true)
    // 4 秒約 +24（加上本身的自然回復）
    expect(u.hp - h0).toBeGreaterThan(20)
    // 光環約 2 m（原作 aare1 100）：隔兩三格就吃不到
    expect(REGEN_AURA_R).toBe(2)
    let mid = null
    for (let r = 3.2; r < 5 && !mid; r += 0.25) {
      const c = z.nav!.nearestOpen(regen.x + r, regen.y)
      if (c && all.every((q) => Math.hypot(c.x - q.x, c.y - q.y) > REGEN_AURA_R + u.radius + 0.3)) mid = c
    }
    expect(mid).toBeTruthy()
    g.world.relocate(u, regen.zone, mid!.x, mid!.y)
    h.ticks(20 * 2)
    expect(u.buffs.some((b) => b.id === 'bf.regenAura')).toBe(false)
    // 走遠（離兩台都遠）：buff 消失、不再額外回血
    let far = null
    for (let r = REGEN_AURA_R + 4; r < 30 && !far; r += 1) {
      const c = z.nav!.nearestOpen(regen.x + r, regen.y)
      if (c && all.every((q) => Math.hypot(c.x - q.x, c.y - q.y) > REGEN_AURA_R + 2)) far = c
    }
    g.world.relocate(u, regen.zone, far!.x, far!.y)
    h.ticks(20 * 2)
    expect(u.buffs.some((b) => b.id === 'bf.regenAura')).toBe(false)
  })

  it('不可選取、不可攻擊（原作 Aloc）：無敵、noTarget，打不壞', () => {
    const { h } = Harness.started(1, 3, { eventMult: 0, bots: 0 })
    const g = h.server.game!
    const p = g.allPlayers()[0]
    const regen = [...g.world.ents.values()].find((e) => e.def.id === 'struct.regen')!
    expect(regen.tags.has('noTarget')).toBe(true)
    expect(regen.tags.has('invuln')).toBe(true)
    const hp = regen.hp
    damage(g, g.mainOf(p)!, regen, 99999, { pure: true })
    h.ticks(2)
    expect(regen.alive).toBe(true)
    expect(regen.hp).toBe(hp)
    // 攻擊指令不會鎖定它
    g.handleCommand(p.slot, { k: 'attack', e: regen.id })
    h.ticks(2)
    expect(g.mainOf(p)!.order?.k === 'attack' && g.mainOf(p)!.order?.e === regen.id).toBe(false)
    expect((entView(g, p, regen).fl ?? 0) & EntFlag.Invuln).toBeTruthy()
  })
})
