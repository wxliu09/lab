// 第 8 輪 S8：末日與災害的深度與平衡
// - 子艦隊選目標還原原作 LG（每 10 秒重選、翠原星不在候選內，除非只剩它）
// - 恆星灼燒還原原作 fG 的距離曲線 po × (850 − 距離)
// - worldPublic 的 rad／fleetPlanet／burnIn／siege 只在條件成立時有值，各觀看者一致、不洩漏
// - 中段張力下限（本作新增）只在 extraEvents 開著時啟用
import { describe, expect, it } from 'vitest'
import { Harness, type FakeClient } from './helpers/harness'
import type { HostMsg } from '../../src/shared/protocol/messages'
import { eventsOf, TENSION_AFTER, TENSION_QUIET, BURN_WARN_S } from '../../src/sim/systems/events'
import { FLEET_REPICK_S, fleetGoal, isPlanet, spawnCreature } from '../../src/sim/ai/creatures'
import { SUN_ENTER, SUN_LEAVE, sunBurnDps } from '../../src/sim/systems/space'
import { BOMBARD_EVERY, stationsOf } from '../../src/sim/systems/stations'
import { DAMAGE_HOOKS } from '../../src/sim/systems/damage'
import { unitDef } from '../../src/shared/content/registry'
import { NEUTRAL, type Ent } from '../../src/sim/ent'
import { SPACE_ZONE } from '../../src/sim/world'
import type { Game } from '../../src/sim/game'

const sec = (h: Harness, s: number) => h.ticks(Math.round(s * 20))

function setup(n = 4, settings: Record<string, unknown> = {}) {
  const { h, cs } = Harness.started(n, 8808, { eventMult: 0, ...settings })
  const g = h.server.game!
  return { h, g, cs, ps: g.allPlayers() }
}

const planetOf = (g: Game): Ent => g.world.get(g.world.zoneByKey('verdance')!.spaceEnt)!
const sunOf = (g: Game): Ent => g.world.inZone(SPACE_ZONE).find((e) => e.def.id === 'space.sun')!
const fleet = (g: Game): Ent[] => g.world.inZone(SPACE_ZONE).filter((e) => e.alive && e.def.ai === 'fleet')

/** 這個 client 收到的系統訊息（@key|…）*/
function lines(h: Harness, c: FakeClient): string[] {
  const out: string[] = []
  for (const m of c.inbox as HostMsg[]) if (m.t === 'chat') for (const l of m.lines) out.push(l.text)
  void h
  return out
}

/** 這個 client 依快照差量累積出來的 worldPublic */
function wOf(c: FakeClient): Record<string, unknown> {
  const w: Record<string, unknown> = {}
  for (const s of c.snaps) if (s.w) Object.assign(w, s.w)
  return w
}

/** 這個 client 收到的快照差量裡出現過哪些 w 欄位 */
function wKeysSeen(c: FakeClient): Set<string> {
  const out = new Set<string>()
  for (const s of c.snaps) if (s.w) for (const k of Object.keys(s.w)) out.add(k)
  return out
}

/** 把所有人移到翠原星地表（撤離到行星上），免得摧毀太空站時一起死 */
function evacuate(g: Game): void {
  const vz = g.world.zoneByKey('verdance')!
  g.allPlayers().forEach((p, i) => {
    const u = g.mainOf(p)
    const at = vz.nav!.nearestOpen(20 + (i % 4) * 3, 20 + Math.floor(i / 4) * 3)!
    if (u) {
      g.world.relocate(u, vz.id, at.x, at.y)
      u.order = null
    }
  })
}

/** 艦隊馬上在翠原星旁邊抵達（翠原星是最近的東西、也在射程內）*/
function fleetNextToPlanet(h: Harness, g: Game): void {
  expect(g.startApocalypse!('fleet')).toBe(true)
  const ev = eventsOf(g)
  const v = planetOf(g)
  ev.fleetPos = { x: v.x + v.radius + 4, y: v.y }
  ev.fleetAt = g.time + 0.05
  sec(h, 0.5)
  expect(fleet(g).length).toBe(9)
}

describe('子艦隊選目標（還原原作 LG：翠原星不在候選內，除非只剩它）', () => {
  it('有別的站或船時，艦隊不會以翠原星為目標、也不會停下來打它；每 10 秒重選一次', () => {
    const { h, g } = setup()
    const v = planetOf(g)
    let onPlanet = 0
    const hook = (g2: Game, src: Ent | null, t: Ent, amount: number) => {
      if (g2 === g && t === v && src?.def.ai === 'fleet') onPlanet += amount
    }
    DAMAGE_HOOKS.push(hook)
    try {
      fleetNextToPlanet(h, g)
      const picks = new Map<number, number>()
      for (let i = 0; i < 30; i++) {
        sec(h, 1)
        for (const f of fleet(g)) {
          expect(f.data.fleetGoal).not.toBe(v.id)
          expect(f.order?.k === 'attack' && f.order.e === v.id && !f.data.autoAtk).toBe(false)
          if (!picks.has(f.id)) picks.set(f.id, f.data.fleetPickAt as number)
        }
      }
      // 翠原星就在旁邊（射程內、比任何站都近），舊版會從此停在這裡打它（每 4–5 秒一次隕擊）。
      // 現在最多只有抵達那一刻、打向別的目標被行星擋下的零星流彈（原作是攻擊移動，路過照樣會打到），連一次隕擊（30000）都湊不到
      expect(onPlanet).toBeLessThan(BOMBARD_EVERY)
      expect(stationsOf(g).rad).toBe(0)
      // 重選間隔照原作 10 秒
      for (const f of fleet(g)) expect((f.data.fleetPickAt as number) - (picks.get(f.id) ?? 0)).toBeGreaterThanOrEqual(FLEET_REPICK_S * 2 - 0.1)
    } finally {
      DAMAGE_HOOKS.splice(DAMAGE_HOOKS.indexOf(hook), 1)
    }
  }, 60000)

  it('fleetGoal：只剩翠原星時才選它；降落中（無敵）的豪勇號不算', () => {
    const { h, g } = setup()
    fleetNextToPlanet(h, g)
    const f = fleet(g)[0]
    const goal = fleetGoal(g, f)!
    expect(goal).toBeTruthy()
    expect(isPlanet(goal)).toBe(false)
    // 其他站、船全部不能當目標（無敵）→ 只剩翠原星
    for (const e of g.world.inZone(SPACE_ZONE)) if (!isPlanet(e) && (e.tags.has('station') || e.tags.has('ship')) && e.def.ai !== 'fleet') e.stats.invuln = true
    expect(isPlanet(fleetGoal(g, f)!)).toBe(true)
  })

  it('太空中只剩翠原星：艦隊轉向砲擊它，fleetPlanet 公開、全場公告一次；洩漏檢查', () => {
    const { h, g, cs } = setup()
    evacuate(g)
    fleetNextToPlanet(h, g)
    expect(g.worldPublic().fleetPlanet).toBeUndefined()
    // 太空中其他的站與船全部摧毀（大家都在地表上）
    for (const z of [...g.world.zones]) if (z.alive && z.station && z.key !== 'verdance') g.destroyStation!(z.key)
    for (const r of h.raw.values()) r.length = 0
    h.leakWatch = true
    sec(h, FLEET_REPICK_S + 8)
    expect(fleet(g).every((f) => f.data.fleetGoal === planetOf(g).id)).toBe(true)
    expect(g.worldPublic().fleetPlanet).toBe(true)
    sec(h, 10)
    for (const c of cs) {
      expect(lines(h, c).filter((x) => x === '@rule8.fleet.planet').length).toBe(1)
      expect(wOf(c).fleetPlanet).toBe(true)
    }
    expect([...new Set(h.leakProblems)]).toEqual([])
  }, 60000)
})

describe('恆星灼燒（還原原作 fG：po × (850 − 距離)，進入 600、超過 850 才停）', () => {
  it('曲線：邊緣 425、中心 1445、8.5 公尺外 0；太陽活動增強乘 6 / 1.7', () => {
    expect(sunBurnDps(SUN_ENTER)).toBeCloseTo(425)
    expect(sunBurnDps(0)).toBeCloseTo(1445)
    expect(sunBurnDps(3)).toBeCloseTo(1.7 * 550)
    expect(sunBurnDps(SUN_LEAVE)).toBe(0)
    expect(sunBurnDps(10)).toBe(0)
    expect(sunBurnDps(0, 6 / 1.7)).toBeCloseTo(5100)
  })

  it('實際灼燒：越近越痛；退到 6–8.5 公尺之間照燒，離開 8.5 公尺後要重新進入 6 公尺才會再燒', () => {
    const { h, g } = setup()
    const sun = sunOf(g)
    const e = g.world.spawn(unitDef('space.asteroid'), SPACE_ZONE, sun.x + 5, sun.y, NEUTRAL)
    e.maxHp = e.hp = 1e7
    e.radius = 0.5
    e.data.frozen = true
    const at = (d: number) => {
      e.x = sun.x + d
      e.y = sun.y
      g.world.moved(e)
    }
    const lost = (s: number) => {
      const hp0 = e.hp
      sec(h, s)
      return hp0 - e.hp
    }
    at(5)
    lost(0.5)
    expect(lost(2)).toBeCloseTo(2 * sunBurnDps(5), -1)
    at(2)
    lost(0.5)
    expect(lost(2)).toBeCloseTo(2 * sunBurnDps(2), -1)
    // 退到 7.5 公尺：已經在燒，照燒（原作直到距離 > 850 才停）
    at(7.5)
    expect(lost(2)).toBeCloseTo(2 * sunBurnDps(7.5), -1)
    // 離開 8.5 公尺：停
    at(9)
    lost(0.5)
    expect(lost(2)).toBe(0)
    // 再回到 7.5 公尺：還沒進入 6 公尺（含半徑），不燒
    at(7.5)
    expect(lost(2)).toBe(0)
  })
})

describe('worldPublic 的末日欄位：只在條件成立時有值', () => {
  it('平時四個欄位都沒有，快照差量也從來沒送過', () => {
    const { h, g, cs } = setup()
    sec(h, 5)
    const w = g.worldPublic()
    for (const k of ['rad', 'fleetPlanet', 'burnIn', 'siege']) {
      expect(w[k]).toBeUndefined()
      for (const c of cs) expect(wKeysSeen(c).has(k)).toBe(false)
    }
  })

  it('rad：地表有殘留輻射時才有（取整數），衰減到 0.5 以下就清掉；各觀看者一致、不洩漏', () => {
    const { h, g, cs } = setup()
    for (const r of h.raw.values()) r.length = 0
    h.leakWatch = true
    stationsOf(g).rad = 6
    sec(h, 1.05)
    expect(g.worldPublic().rad).toBe(6)
    for (const c of cs) expect(wOf(c).rad).toBe(6)
    // 每秒 ×0.99：0.51 → 3 秒後 0.495
    stationsOf(g).rad = 0.51
    sec(h, 3.05)
    expect(g.worldPublic().rad).toBeUndefined()
    for (const c of cs) {
      expect(wKeysSeen(c).has('rad')).toBe(true)
      expect(wOf(c).rad).toBeUndefined()
    }
    expect([...new Set(h.leakProblems)]).toEqual([])
  })

  it('burnIn：軌道失效時才有，隨行星被拉近遞減；快進入時公告一次，進入後清掉並公告', () => {
    const { h, g, cs } = setup()
    expect(g.worldPublic().burnIn).toBeUndefined()
    const v = planetOf(g)
    const sun = sunOf(g)
    // 把行星放在恆星外 20 公尺（中心距離），軌道失效後以 0.25 m/s 被拉近
    v.x = sun.x + 20
    v.y = sun.y
    g.world.moved(v)
    for (const r of h.raw.values()) r.length = 0
    h.leakWatch = true
    g.startApocalypse!('orbit')
    sec(h, 1.05)
    const b0 = g.worldPublic().burnIn as number
    expect(b0).toBeGreaterThan(BURN_WARN_S)
    expect(b0).toBeLessThanOrEqual(Math.ceil((20 - v.radius - SUN_ENTER) / 0.25))
    sec(h, 10)
    expect(g.worldPublic().burnIn as number).toBeCloseTo(b0 - 10, -1)
    sec(h, b0 - 10 - BURN_WARN_S + 2)
    for (const c of cs) expect(lines(h, c).filter((x) => x.startsWith('@rule8.orbit.burnSoon|s=')).length).toBe(1)
    sec(h, BURN_WARN_S + 2)
    expect(g.worldPublic().burnIn).toBeUndefined()
    for (const c of cs) {
      expect(lines(h, c).filter((x) => x === '@rule8.orbit.burnNow').length).toBe(1)
      expect(wOf(c).burnIn).toBeUndefined()
    }
    expect([...new Set(h.leakProblems)]).toEqual([])
  }, 60000)

  it('siege：無人機群打到的站才列出（生命比例 0.05 一格）；低於一半全場公告先撤離（每站一次）；不洩漏', () => {
    const { h, g, cs } = setup()
    const nyx = g.world.zoneByKey('nyx')!
    const st = g.world.get(nyx.spaceEnt)!
    for (const r of h.raw.values()) r.length = 0
    h.leakWatch = true
    g.triggerEvent!('wasps', true)
    eventsOf(g).waspLeft = 0
    st.hp = Math.round(st.maxHp * 0.5) + 300
    for (let i = 0; i < 3; i++) spawnCreature(g, 'ship.wasp', SPACE_ZONE, st.x + st.radius + 2, st.y + i - 1)
    sec(h, 8)
    const siege = g.worldPublic().siege as [string, number][]
    expect(siege.map((s) => s[0])).toContain('nyx')
    const frac = siege.find((s) => s[0] === 'nyx')![1]
    expect(frac * 20).toBeCloseTo(Math.round(frac * 20), 6)
    expect(st.hp / st.maxHp).toBeLessThan(0.5)
    for (const c of cs) {
      expect(lines(h, c).filter((x) => x.startsWith('@rule8.siege.evac|')).length).toBe(1)
      expect((wOf(c).siege as [string, number][]).map((s) => s[0])).toContain('nyx')
    }
    // 胡蜂全部清掉：5 秒後不再列出
    for (const e of g.world.inZone(SPACE_ZONE)) if (e.def.id === 'ship.wasp') g.world.remove(e)
    sec(h, 6)
    expect(g.worldPublic().siege).toBeUndefined()
    for (const c of cs) expect(wOf(c).siege).toBeUndefined()
    expect([...new Set(h.leakProblems)]).toEqual([])
  }, 60000)
})

describe('中段張力下限（本作新增，只在 extraEvents 開著時）', () => {
  function quiet(settings: Record<string, unknown>) {
    const { h, g } = setup(4, { eventMult: 1, ...settings })
    const ev = eventsOf(g)
    g.world.time = TENSION_AFTER + 60
    ev.lastStir = g.time - TENSION_QUIET - 1
    ev.next = g.time + 1000
    return { h, g, ev }
  }

  it('開局 12 分鐘以後 6 分鐘沒人死、沒事件：下一個事件提前到 90 秒內', () => {
    const { h, g, ev } = quiet({})
    sec(h, 0.1)
    expect(ev.pulls).toBe(1)
    expect(ev.next).toBeLessThanOrEqual(g.time + 90)
    expect(ev.next).toBeGreaterThanOrEqual(g.time + 25)
  })

  it('原作模式（extraEvents = false）不啟用', () => {
    const { h, g, ev } = quiet({ extraEvents: false })
    const next = ev.next
    sec(h, 0.1)
    expect(ev.pulls).toBe(0)
    expect(ev.next).toBe(next)
    void g
  })

  it('事件被關掉（事件倍率 0）、還不到 12 分鐘、剛有人死：都不提前', () => {
    const a = setup(4, { eventMult: 0 })
    a.g.world.time = TENSION_AFTER + 60
    eventsOf(a.g).lastStir = 0
    sec(a.h, 0.1)
    expect(eventsOf(a.g).pulls).toBe(0)
    expect(eventsOf(a.g).next).toBe(Infinity)

    const b = setup(4, { eventMult: 1 })
    const evb = eventsOf(b.g)
    b.g.world.time = TENSION_AFTER - 30
    evb.lastStir = 0
    evb.next = b.g.time + 1000
    sec(b.h, 0.1)
    expect(evb.pulls).toBe(0)

    const c = quiet({})
    const victim = c.g.mainOf(c.g.allPlayers()[3])!
    c.g.killEnt(victim, null, -1)
    expect(c.ev.lastStir).toBe(c.g.time)
    sec(c.h, 0.1)
    expect(c.ev.pulls).toBe(0)
  })
})
