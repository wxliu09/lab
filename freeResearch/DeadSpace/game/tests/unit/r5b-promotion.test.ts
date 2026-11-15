// 第 5 輪：政委晉升照原作 X8／V8（war3map.j 17641–17660）。
// - 只排除異形與變種人的主腦（V8：Rv==cv、Rv==Bv）；眷屬、仿生人照樣晉升；
// - 抽到就用掉（一進來就 xe[1]=true），條件不成立時 1 秒後再抽下一個事件
import { describe, expect, it } from 'vitest'
import { Harness } from './helpers/harness'
import { eventsOf, pickEvent } from '../../src/sim/systems/events'
import type { Game, GamePlayer } from '../../src/sim/game'

function setup(n = 4) {
  const { h, cs } = Harness.started(n, 2024, { eventMult: 0 })
  const g = h.server.game!
  const ps = g.allPlayers()
  for (const p of ps) {
    g.setRole(p, 'human')
    if (p.classId === 'commissar') p.classId = 'researcher'
  }
  return { h, g, cs, ps }
}

const promoted = (g: Game, p: GamePlayer) => !!p.data.promoted && !!g.mainOf(p)!.inv!.some((x) => x?.id === 'suit.operative')

/** 讓事件表只剩政委晉升可抽（其他一次性事件標成用過、新聞用完、門故障進行中）*/
function onlyPromotion(g: Game): void {
  const ev = eventsOf(g)
  for (const id of g.eventIds!()) if (id !== 'promotion') ev.used.add(id)
  ev.news.length = 0
  ev.doorsUntil = g.time + 1e6
}

describe('政委晉升（原作 X8／V8）', () => {
  it('政委是異形主腦或變種人主腦：不晉升，事件照樣用掉', () => {
    for (const role of ['xeno', 'mutant'] as const) {
      const { g, ps } = setup()
      ps[2].classId = 'commissar'
      g.setRole(ps[2], role)
      expect(g.triggerEvent!('promotion', true)).toBe(false)
      expect(promoted(g, ps[2])).toBe(false)
      expect(eventsOf(g).used.has('promotion')).toBe(true)
      // 用掉了：之後政委換成人類也不會再晉升
      g.setRole(ps[2], 'human')
      expect(g.triggerEvent!('promotion', true)).toBe(false)
      expect(promoted(g, ps[2])).toBe(false)
    }
  })

  it('政委是異形或變種人的眷屬、或是仿生人：照樣晉升（原作只排除兩位主腦）', () => {
    for (const make of ['xenoSpawn', 'mutantSpawn', 'android'] as const) {
      const { g, ps } = setup()
      ps[2].classId = 'commissar'
      if (make === 'android') g.setRole(ps[2], 'android')
      else ps[2].spawnOf = make === 'xenoSpawn' ? 'xeno' : 'mutant'
      expect(g.triggerEvent!('promotion', true), make).toBe(true)
      expect(promoted(g, ps[2]), make).toBe(true)
    }
  })

  it('政委已經死了：不晉升，事件用掉', () => {
    const { h, g, ps } = setup()
    ps[2].classId = 'commissar'
    g.killEnt(g.mainOf(ps[2])!, null, -1)
    h.ticks(2)
    expect(g.triggerEvent!('promotion', true)).toBe(false)
    expect(eventsOf(g).used.has('promotion')).toBe(true)
  })

  it('沒有政委也抽得到；抽到就用掉，1 秒後再抽下一個事件（不是照晉升的 180–900 秒）', () => {
    const { h, g } = setup()
    onlyPromotion(g)
    expect(pickEvent(g, false)).toBe('promotion')
    const ev = eventsOf(g)
    ev.next = g.time
    h.ticks(1)
    expect(ev.used.has('promotion')).toBe(true)
    expect(ev.next - g.time).toBeGreaterThan(0.5)
    expect(ev.next - g.time).toBeLessThanOrEqual(1)
    // 已經沒有可抽的事件：1 秒後抽不到，改成每 60 秒（÷ 事件頻率）再看一次
    expect(pickEvent(g, false)).toBeNull()
    h.ticks(21)
    expect(ev.next - g.time).toBeGreaterThan(30)
  })

  it('「有東西要來了」連發中抽到沒生效的晉升：這一發補回來、1 秒後再抽', () => {
    const { h, g } = setup()
    onlyPromotion(g)
    const ev = eventsOf(g)
    ev.chain = 2
    ev.chainNext = g.time
    h.ticks(1)
    expect(ev.used.has('promotion')).toBe(true)
    expect(ev.chain).toBe(2)
    expect(ev.chainNext - g.time).toBeLessThanOrEqual(1)
  })

  it('條件成立時照常晉升，下一個事件在 180–900 秒後（÷ 事件頻率）', () => {
    const { h, g, ps } = setup()
    ps[2].classId = 'commissar'
    onlyPromotion(g)
    g.settings.eventMult = 1
    const ev = eventsOf(g)
    ev.next = g.time
    h.ticks(1)
    expect(promoted(g, ps[2])).toBe(true)
    expect(ev.next - g.time).toBeGreaterThanOrEqual(179)
    expect(ev.next - g.time).toBeLessThanOrEqual(900)
  })
})
