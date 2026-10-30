// GIT 驗血（研究 02 §7）：抽三人份血 → 解析器 → 報告；依身分判定、仿生人鎖定錯誤、檢測儀被毀後聯絡不上
import { describe, expect, it } from 'vitest'
import { Harness } from './helpers/harness'
import { giveItem, makeItem } from '../../src/sim/systems/items'
import { SCRIPTS } from '../../src/sim/systems/effects'
import type { Ent } from '../../src/sim/ent'
import type { Game } from '../../src/sim/game'

function setup(n = 4) {
  const { h } = Harness.started(n, 31337)
  const g = h.server.game!
  const ps = g.allPlayers()
  for (const p of ps) g.setRole(p, 'human')
  return { h, g, ps }
}

const run = (g: Game, name: string, ctx: Record<string, unknown>) => SCRIPTS.get(name)!(g, ctx as never, {})

function draw(g: Game, u: Ent, t: Ent): void {
  const slot = u.inv!.findIndex((x) => x?.id === 'geneSampler')
  run(g, 'git.draw', { caster: u, target: t, x: t.x, y: t.y, zone: t.zone, itemSlot: slot })
}

/** 把解析器放在地上並購買報告 */
function report(g: Game, u: Ent): string {
  const it = u.inv!.find((x) => x?.id === 'gitResolver')!
  const vendor = { data: { sample: it.data } } as unknown as Ent
  const p = g.players[u.owner]!
  run(g, 'git.results', { caster: u, target: vendor, x: u.x, y: u.y, zone: u.zone })
  return p.gitReports[p.gitReports.length - 1].result
}

describe('GIT 驗血', () => {
  it('三人都是人類 → 乾淨；抽滿後轉成解析器；同一人不能抽兩次', () => {
    const { g, ps } = setup()
    const u = g.mainOf(ps[0])!
    giveItem(g, u, makeItem('geneSampler'))
    draw(g, u, g.mainOf(ps[1])!)
    draw(g, u, g.mainOf(ps[1])!)
    expect(u.inv!.some((x) => x?.id === 'geneSampler')).toBe(true)
    draw(g, u, g.mainOf(ps[2])!)
    draw(g, u, u)
    expect(u.inv!.some((x) => x?.id === 'geneSampler')).toBe(false)
    expect(u.inv!.some((x) => x?.id === 'gitResolver')).toBe(true)
    expect(report(g, u)).toBe('clean')
    expect(ps[0].gitReports[0].names).toEqual([ps[1].name, ps[2].name, ps[0].name])
  })

  it('依身分判定：人形的異形在樣本裡 → 感染；被寄生但還沒轉化的人類 → 乾淨', () => {
    const { g, ps } = setup()
    g.setRole(ps[2], 'xeno')
    const u = g.mainOf(ps[0])!
    giveItem(g, u, makeItem('geneSampler'))
    for (const p of [ps[1], ps[2], ps[3]]) draw(g, u, g.mainOf(p)!)
    expect(report(g, u)).toBe('infected')
  })

  it('仿生人讓結果變成錯誤，之後抽到感染者也不會變', () => {
    const { g, ps } = setup()
    g.setRole(ps[1], 'android')
    g.setRole(ps[2], 'mutant')
    const u = g.mainOf(ps[0])!
    giveItem(g, u, makeItem('geneSampler'))
    for (const p of [ps[1], ps[2], ps[3]]) draw(g, u, g.mainOf(p)!)
    expect(report(g, u)).toBe('error')
  })

  it('中央檢測儀被摧毀：全場廣播，之後的報告都聯絡不上', () => {
    const { g, ps } = setup()
    const u = g.mainOf(ps[0])!
    giveItem(g, u, makeItem('geneSampler'))
    for (const p of [ps[1], ps[2], ps[3]]) draw(g, u, g.mainOf(p)!)
    const nyx = g.world.zoneByKey('nyx')!
    const tester = g.world.inZone(nyx.id).find((e) => e.def.id === 'struct.git')!
    g.killEnt(tester, null, -1)
    expect(g.data.gitDead).toBe(true)
    expect(report(g, u)).toBe('offline')
  })

  it('報告只給購買者本人', () => {
    const { h, g, ps } = setup()
    const u = g.mainOf(ps[0])!
    giveItem(g, u, makeItem('geneSampler'))
    for (const p of [ps[1], ps[2], ps[3]]) draw(g, u, g.mainOf(p)!)
    for (const r of h.raw.values()) r.length = 0
    report(g, u)
    h.ticks(1)
    expect(ps[0].gitReports.length).toBe(1)
    for (const p of ps.slice(1)) expect(p.gitReports.length).toBe(0)
  })
})

describe('仿生人遙控器', () => {
  it('異形使用 → 仿生人變成異形 spawn；人類使用 → 改回；再用 → 停機／恢復；碼過期無效', () => {
    const { g, ps } = setup()
    g.setRole(ps[0], 'xeno')
    g.setRole(ps[1], 'android')
    const android = ps[1]
    android.data.remoteCode = 4321
    const remote = () => {
      const it = makeItem('overrideRemote')
      it.data = { slot: android.slot, code: 4321 }
      return it
    }
    const use = (p: typeof ps[0]) => {
      const u = g.mainOf(p)!
      giveItem(g, u, remote())
      const slot = u.inv!.findIndex((x) => x?.id === 'overrideRemote')
      run(g, 'android.remote', { caster: u, x: u.x, y: u.y, zone: u.zone, itemSlot: slot })
      u.inv![slot] = null
    }
    use(ps[0])
    expect(g.faction(android)).toBe('xeno')
    use(ps[2])
    expect(g.faction(android)).toBe('crew')
    use(ps[2])
    expect(android.data.androidOff).toBe(true)
    expect(g.mainOf(android)!.data.frozen).toBe(true)
    use(ps[3])
    expect(android.data.androidOff).toBe(false)
    android.data.remoteCode = 1111
    use(ps[0])
    expect(g.faction(android)).toBe('crew')
  })

  it('仿生人本人撿到自己的遙控器會掉到地上', () => {
    const { g, ps } = setup()
    g.setRole(ps[1], 'android')
    const u = g.mainOf(ps[1])!
    const it = makeItem('overrideRemote')
    it.data = { slot: ps[1].slot, code: 1 }
    giveItem(g, u, it)
    expect(u.inv!.some((x) => x?.id === 'overrideRemote')).toBe(false)
  })
})
