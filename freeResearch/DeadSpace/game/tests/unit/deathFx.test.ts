// 死亡特效（k: 'die'）：sim 在單位死亡時送出，音效據此播死亡叫聲（取代「低血量的機械在近處消失＝死了」的推斷）。
// 洩漏面：只送給上一份快照就看得到這個單位、也看得到死亡地點的人；只帶位置與 id，不帶外觀。
import { describe, expect, it } from 'vitest'
import { Harness, type FakeClient } from './helpers/harness'
import { unitDef } from '../../src/shared/content/registry'
import { NEUTRAL, type Ent } from '../../src/sim/ent'
import type { Game } from '../../src/sim/game'
import type { FxEvent, SnapEntity } from '../../src/shared/protocol/messages'
import { BarkTracker, type BarkCall, type BarkEnt } from '../../src/audio/barks'

/** 開局並打開逐 tick 的洩漏比對（測試裡會把單位搬來搬去，累積多 tick 再比對會誤報）*/
function start(n: number, seed: number): { h: Harness; cs: FakeClient[] } {
  const r = Harness.started(n, seed)
  r.h.drainLeaks()
  r.h.leakProblems.length = 0
  r.h.leakWatch = true
  return r
}

/** 放一座不會主動攻擊的機械（海盜哨戟：不留屍體）*/
function machine(g: Game, at: Ent, dx: number, hpK = 1): Ent {
  const e = g.world.spawn(unitDef('pirate.sentry'), at.zone, at.x + dx, at.y, NEUTRAL)
  e.acquire = false
  e.hp = e.maxHp * hpK
  return e
}

const dies = (c: FakeClient, from = 0): FxEvent[] => c.snaps.slice(from).flatMap((s) => s.fx ?? []).filter((f) => f.k === 'die')

/**
 * 模擬 client：照 ClientWorld.apply 的順序套用快照（g → e → 特效），特效交給 BarkTracker.die，
 * 套用完再呼叫 BarkTracker.snap（director.ts 在 snapTick 的 effect 裡做的事）
 */
class Listener {
  ents = new Map<number, SnapEntity>()
  barks = new BarkTracker()
  calls: BarkCall[] = []
  next = 0
  constructor(
    private c: FakeClient,
    private g: Game,
  ) {}
  pump(): void {
    const me = this.g.mainOf(this.g.players[this.c.slot])!
    const l = { x: me.x, y: me.y }
    for (; this.next < this.c.snaps.length; this.next++) {
      const s = this.c.snaps[this.next]
      for (const id of s.g) this.ents.delete(id)
      for (const e of s.e) this.ents.set(e.i, { ...(this.ents.get(e.i) ?? {}), ...e })
      for (const f of s.fx ?? []) {
        const b = this.barks.die(f, me.zone, l)
        if (b) this.calls.push(b)
      }
      const list: BarkEnt[] = [...this.ents.values()].map((e) => ({ s: e, x: (e.x ?? 0) / 100, y: (e.y ?? 0) / 100 }))
      this.calls.push(...this.barks.snap(list, me.zone, l))
    }
  }
  deaths(): BarkCall[] {
    return this.calls.filter((c) => c.kind === 'death')
  }
}

describe('死亡特效與死亡叫聲', () => {
  it('低血量的機械走出視野不播死亡聲；真正被摧毀才播（看不到的人什麼都沒收到）', () => {
    const { h, cs } = start(2, 31)
    const g = h.server.game!
    const [pa, pb] = g.allPlayers()
    const a = g.mainOf(pa)!
    const b = g.mainOf(pb)!
    g.world.relocate(b, a.zone, a.x + 40, a.y)
    const la = new Listener(cs[0], g)
    const lb = new Listener(cs[1], g)
    const m = machine(g, a, 2, 0.1)
    h.ticks(3)
    la.pump()
    lb.pump()
    expect(cs[0].ents.has(m.id)).toBe(true)
    // 走出視野（快照只說「消失」）：不是死亡
    g.world.relocate(m, a.zone, a.x + 60, a.y)
    h.ticks(3)
    la.pump()
    expect(cs[0].ents.has(m.id)).toBe(false)
    expect(la.deaths()).toEqual([])
    expect(dies(cs[0])).toEqual([])
    // 真正被摧毀
    const m2 = machine(g, a, 2, 0.1)
    h.ticks(3)
    la.pump()
    const from = cs[0].snaps.length
    g.killEnt(m2, null)
    h.ticks(1)
    la.pump()
    lb.pump()
    const fx = dies(cs[0], from)
    expect(fx.length).toBe(1)
    expect(fx[0].e).toBe(m2.id)
    expect(la.deaths().length).toBe(1)
    expect(la.deaths()[0].fam).toBe('machine')
    // 在遠處、看不到的人：沒有特效、沒有叫聲
    expect(dies(cs[1])).toEqual([])
    expect(lb.deaths()).toEqual([])
    expect(h.drainLeaks()).toEqual([])
  })

  it('有屍體的死亡也走同一個特效（叫一次，不重複）', () => {
    const { h, cs } = start(2, 32)
    const g = h.server.game!
    const [pa, pb] = g.allPlayers()
    const a = g.mainOf(pa)!
    const b = g.mainOf(pb)!
    g.world.relocate(b, a.zone, a.x + 1.5, a.y)
    const la = new Listener(cs[0], g)
    h.ticks(3)
    la.pump()
    g.killEnt(b, null)
    h.ticks(2)
    la.pump()
    expect(la.deaths().length).toBe(1)
    expect(la.deaths()[0].fam).toBe('human')
    expect(h.drainLeaks()).toEqual([])
  })

  it('不比快照多透露：沒看過的單位、死在看不到的地方、偽裝的外觀都不會從特效流出', () => {
    const { h, cs } = start(2, 33)
    const g = h.server.game!
    const [pa, pb] = g.allPlayers()
    const a = g.mainOf(pa)!
    g.world.relocate(g.mainOf(pb)!, a.zone, a.x + 40, a.y)
    h.ticks(2)
    // 同一個 tick 生成又死掉（觀看者從沒在快照裡看過它）：不送
    let from = cs[0].snaps.length
    const flash = machine(g, a, 2)
    g.killEnt(flash, null)
    h.ticks(1)
    expect(dies(cs[0], from)).toEqual([])
    // 看得到的單位走到視野外、同一個 tick 死在那裡：快照只說消失，特效也不送
    const runner = machine(g, a, 2)
    h.ticks(2)
    expect(cs[0].ents.has(runner.id)).toBe(true)
    from = cs[0].snaps.length
    g.world.relocate(runner, a.zone, a.x + 60, a.y)
    g.killEnt(runner, null)
    h.ticks(1)
    expect(dies(cs[0], from)).toEqual([])
    // 偽裝成人的機械：特效只有位置與 id（觀看者本來就認得的 id），沒有外觀欄位；叫聲用快照裡的偽裝外觀
    const la = new Listener(cs[0], g)
    la.pump()
    const fake = machine(g, a, 2)
    fake.anon = true
    fake.data.fake = { def: 'personnel', owner: -1, name: '', color: -1, cls: '' }
    h.ticks(2)
    la.pump()
    expect(cs[0].ents.get(fake.id)?.d).toBe('personnel')
    from = cs[0].snaps.length
    g.killEnt(fake, null)
    h.ticks(1)
    la.pump()
    const fx = dies(cs[0], from)
    expect(fx.length).toBe(1)
    expect(Object.keys(fx[0]).sort()).toEqual(['e', 'k', 'x', 'y', 'z'])
    expect(la.deaths().map((d) => d.fam)).toEqual(['human'])
    expect(h.drainLeaks()).toEqual([])
  })
})

describe('BarkTracker（純邏輯）', () => {
  const at = (i: number, d: string, x: number, hp = 100, z = 1): BarkEnt => ({ s: { i, z, d, hp, mhp: 100 }, x, y: 0 })
  const die = (e: number, x = 0, z = 1): FxEvent => ({ k: 'die', z, x, y: 0, e })
  const l = { x: 0, y: 0 }

  it('只為上一份快照看過的單位叫；別的 zone、太遠、沒看過的都不叫', () => {
    const t = new BarkTracker()
    t.snap([at(1, 'npc.pacifier', 1), at(2, 'personnel', 30)], 1, l)
    expect(t.die(die(9), 1, l)).toBeNull()
    expect(t.die(die(2, 30), 1, l)).toBeNull()
    expect(t.die(die(1, 1, 2), 1, l)).toBeNull()
    const b = t.die(die(1, 1), 1, l)
    expect(b?.kind).toBe('death')
    expect(b?.fam).toBe('machine')
    // 同一個 id 不會叫兩次
    expect(t.die(die(1, 1), 1, l)).toBeNull()
  })

  it('單位只是從快照消失（走出視野）不會叫；痛叫照舊', () => {
    const t = new BarkTracker()
    t.snap([at(1, 'npc.pacifier', 1, 20)], 1, l)
    expect(t.snap([], 1, l)).toEqual([])
    expect(t.die(die(1), 1, l)).toBeNull()
    t.snap([at(2, 'personnel', 1, 100)], 1, l)
    const pain = t.snap([at(2, 'personnel', 1, 60)], 1, l)
    expect(pain.map((p) => [p.kind, p.fam, p.big])).toEqual([['pain', 'human', true]])
  })

  it('每份快照最多兩聲死亡叫聲；下一份快照重新計算', () => {
    const t = new BarkTracker()
    t.snap([1, 2, 3, 4].map((i) => at(i, 'xeno.brute', 1)), 1, l)
    const got = [1, 2, 3].map((i) => t.die(die(i, 1), 1, l))
    expect(got.filter(Boolean).length).toBe(2)
    t.snap([at(4, 'xeno.brute', 1)], 1, l)
    expect(t.die(die(4, 1), 1, l)?.fam).toBe('xeno')
  })
})
