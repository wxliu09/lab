import { describe, expect, it } from 'vitest'
import { Harness, type FakeClient } from './helpers/harness'
import { eventsOf, publicEvents } from '../../src/sim/systems/events'
import { GUIDE_EN, GUIDE_ZH } from '../../src/ui/strings/guide'

describe('門控制器故障列入公開事件', () => {
  it('故障期間每個人的 w.ev 都有 doors，修好就消失；目標面板的對策行在 guide.test.ts 依 WORLD_EVENTS 逐一檢查', () => {
    const { h, cs } = Harness.started(4, 1357, { eventMult: 0 })
    const g = h.server.game!
    h.leakWatch = true
    const evOf = (c: FakeClient) => {
      let v: string[] | undefined
      for (const s of c.snaps) if (s.w?.ev) v = s.w.ev
      return v
    }
    h.ticks(2)
    expect(publicEvents(g)).not.toContain('doors')
    g.triggerEvent!('doors', true)
    h.ticks(2)
    for (const c of cs) expect(evOf(c)).toContain('doors')
    // 強制修好
    eventsOf(g).doorsUntil = g.time + 0.05
    h.ticks(3)
    expect(publicEvents(g)).not.toContain('doors')
    for (const c of cs) expect(evOf(c) ?? []).not.toContain('doors')
  })
  it('對策行兩種語言都有', () => {
    expect(GUIDE_ZH['guide.ev.doors']).toBeTruthy()
    expect(GUIDE_EN['guide.ev.doors']).toBeTruthy()
  })
})
