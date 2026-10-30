import { describe, expect, it } from 'vitest'
import { Harness } from './helpers/harness'
import { checkMessages } from './helpers/leak'
import { roleCounts } from '../../src/sim/systems/roles'
import { applyBuff } from '../../src/sim/systems/buffs'
import { UNITS } from '../../src/shared/content/registry'
import type { Game } from '../../src/sim/game'

function scanAll(h: Harness): string[] {
  const g = h.server.game!
  const out: string[] = []
  for (const [peer, raws] of h.raw) {
    const slot = h.server.slotOfPeer(peer)
    if (slot === null) continue
    out.push(...checkMessages(g, slot, raws))
    raws.length = 0
  }
  return out
}

function byRole(g: Game, r: string) {
  return g.allPlayers().filter((p) => p.role === r)
}

describe('身分分配', () => {
  it('人數門檻符合原作程式（≤4 一個異類、5–6 兩個、7+ 加仿生人）', () => {
    const { h } = Harness.started(3, 1)
    const g = h.server.game!
    for (let n = 1; n <= 12; n++) {
      const c = roleCounts(g, n)
      if (n <= 4) expect(c.xeno + c.mutant).toBe(1)
      else expect(c.xeno + c.mutant).toBe(2)
      expect(c.android).toBe(n >= 7 ? 1 : 0)
    }
  })

  it('12 人：每種職業不超過卡數，研究員／保全最多 2 人', () => {
    const { h } = Harness.started(12, 99)
    const g = h.server.game!
    const counts = new Map<string, number>()
    for (const p of g.allPlayers()) counts.set(p.classId, (counts.get(p.classId) ?? 0) + 1)
    for (const [cls, n] of counts) expect(n).toBeLessThanOrEqual(cls === 'researcher' || cls === 'security' ? 2 : 1)
    expect(byRole(g, 'android').length).toBe(1)
  })

  it('職業名稱前綴與開局物品', () => {
    const { h } = Harness.started(8, 7)
    const g = h.server.game!
    for (const p of g.allPlayers()) {
      expect(p.name.endsWith(p.baseName)).toBe(true)
      const u = g.mainOf(p)!
      if (p.classId === 'ceo') expect([...g.world.ents.values()].some((e) => e.tags.has('butler') && e.data.butlerOf === p.slot)).toBe(true)
      if (p.role === 'xeno') expect(u.abilities).toContain('xeno.form')
      if (p.role === 'mutant') expect(u.abilities).toContain('mut.devour')
    }
  })
})

describe('EP', () => {
  it('異形每秒 0.4＋每顆蛋 0.12', () => {
    const { h } = Harness.started(5, 3)
    const g = h.server.game!
    const x = byRole(g, 'xeno')[0]
    h.ticks(20 * 100)
    expect(x.ep).toBeGreaterThan(38)
    expect(x.ep).toBeLessThan(42)
  })
  it('仿生人每秒 1.5', () => {
    const { h } = Harness.started(7, 3)
    const g = h.server.game!
    const a = byRole(g, 'android')[0]
    h.ticks(20 * 10)
    expect(a.ep).toBeGreaterThan(14)
    expect(a.ep).toBeLessThan(16)
  })
})

describe('感染與 spawn', () => {
  it('帶著寄生死亡的人類變成異形 spawn（33% HP），不公告無辜者死亡', () => {
    const { h, cs } = Harness.started(5, 11)
    const g = h.server.game!
    const x = byRole(g, 'xeno')[0]
    const victim = g.allPlayers().find((p) => p.role === 'human')!
    const vu = g.mainOf(victim)!
    applyBuff(g, vu, 'bf.parasite', undefined, g.mainOf(x)!)
    g.killEnt(vu, null, -1)
    h.ticks(3)
    expect(victim.alive).toBe(true)
    expect(victim.spawnOf).toBe('xeno')
    const nu = g.mainOf(victim)!
    expect(nu.id).not.toBe(vu.id)
    expect(nu.hp / nu.maxHp).toBeCloseTo(0.33, 1)
    const allChat = cs.flatMap((c) => c.inbox.filter((m) => m.t === 'chat').flatMap((m) => (m.t === 'chat' ? m.lines : [])))
    expect(allChat.some((l) => l.text.includes('death.innocent'))).toBe(false)
    expect(scanAll(h)).toEqual([])
  })

  it('朊毒優先於寄生', () => {
    const { h } = Harness.started(5, 12)
    const g = h.server.game!
    const victim = g.allPlayers().find((p) => p.role === 'human')!
    const vu = g.mainOf(victim)!
    applyBuff(g, vu, 'bf.parasite')
    applyBuff(g, vu, 'bf.prion')
    g.killEnt(vu, null, -1)
    expect(victim.spawnOf).toBe('mutant')
  })

  it('仿生人永遠不會被轉化', () => {
    const { h } = Harness.started(7, 13)
    const g = h.server.game!
    const a = byRole(g, 'android')[0]
    const au = g.mainOf(a)!
    applyBuff(g, au, 'bf.parasite')
    g.killEnt(au, null, -1)
    expect(a.alive).toBe(false)
    expect(a.spawnOf).toBe(null)
  })

  it('spawn 預設不能攻擊主腦', () => {
    const { h } = Harness.started(5, 14)
    const g = h.server.game!
    const x = byRole(g, 'xeno')[0]
    const victim = g.allPlayers().find((p) => p.role === 'human')!
    applyBuff(g, g.mainOf(victim)!, 'bf.parasite')
    g.killEnt(g.mainOf(victim)!, null, -1)
    const su = g.mainOf(victim)!
    const xm = g.mainOf(x)!
    g.world.relocate(su, xm.zone, xm.x + 1, xm.y)
    h.ticks(2)
    g.handleCommand(victim.slot, { k: 'attack', e: xm.id })
    expect(su.order?.k).not.toBe('attack')
  })
})

describe('異形變身（匿名）', () => {
  it('變身後其他人看不出擁有者', () => {
    if (!UNITS.has('xeno.protoform')) return
    const { h } = Harness.started(5, 21)
    const g = h.server.game!
    const x = byRole(g, 'xeno')[0]
    const u = g.mainOf(x)!
    g.handleCommand(x.slot, { k: 'cast', a: 'xeno.form' })
    h.ticks(20 * 6)
    const nu = g.mainOf(x)!
    expect(nu.id).not.toBe(u.id)
    expect(nu.anon).toBe(true)
    // 把所有人移到旁邊，確保看得到
    for (const p of g.allPlayers()) {
      const m = g.mainOf(p)!
      if (p !== x) g.world.relocate(m, nu.zone, nu.x + 1.5, nu.y)
    }
    // 只比對搬動之後送出的快照（之前的快照對應的是搬動前的位置）
    for (const r of h.raw.values()) r.length = 0
    h.ticks(3)
    expect(scanAll(h)).toEqual([])
  })
})

describe('勝負', () => {
  it('異形與變種人都死、沒有 spawn → 人類勝', () => {
    const { h } = Harness.started(5, 31)
    const g = h.server.game!
    h.ticks(20 * 11)
    for (const p of [...byRole(g, 'xeno'), ...byRole(g, 'mutant')]) g.killEnt(g.mainOf(p)!, null, -1)
    h.ticks(20 * 5)
    expect(g.ended?.winner).toBe('crew')
  })

  it('人類全滅、異形活著、變種人已死 → 異形勝', () => {
    const { h } = Harness.started(5, 32)
    const g = h.server.game!
    h.ticks(20 * 11)
    for (const p of g.allPlayers()) if (p.role !== 'xeno') g.killEnt(g.mainOf(p)!, null, -1)
    h.ticks(20 * 5)
    expect(g.ended?.winner).toBe('xeno')
  })

  it('全員同歸於盡 → 平手（本作修正）', () => {
    const { h } = Harness.started(4, 33)
    const g = h.server.game!
    h.ticks(20 * 11)
    for (const p of g.allPlayers()) g.killEnt(g.mainOf(p)!, null, -1)
    h.ticks(20 * 5)
    expect(g.ended?.winner).toBe('draw')
  })
})

describe('仿生人誤殺懲罰', () => {
  it('誤殺分數超過 2.7 就強制關機', () => {
    const { h } = Harness.started(8, 41)
    const g = h.server.game!
    const a = byRole(g, 'android')[0]
    const au = g.mainOf(a)!
    const victims = g.allPlayers().filter((p) => p.role === 'human').slice(0, 3)
    for (const v of victims) {
      const vu = g.mainOf(v)!
      g.damage(au, vu, vu.maxHp + 10)
    }
    expect(a.alive).toBe(false)
  })
})
