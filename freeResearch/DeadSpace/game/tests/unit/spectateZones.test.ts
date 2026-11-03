// 旁觀切換：zone id 可以超過 16（船艙、事件站）；驗證器依指令種類放寬 s 的範圍
import { describe, expect, it } from 'vitest'
import { Harness } from './helpers/harness'
import { damage } from '../../src/sim/systems/damage'
import { LAST_WORDS } from '../../src/sim/systems/chat'
import { parseClientBytes } from '../../src/shared/protocol/validate'
import { encode } from '../../src/shared/protocol/codec'

const ok = (c: Record<string, unknown>) => !!parseClientBytes(encode({ t: 'cmd', seq: 1, c } as never))

describe('旁觀切換的 zone id', () => {
  it('驗證器：spec 接受 0..63；其他指令的 s（背包格）仍限 0..16', () => {
    expect(ok({ k: 'spec', s: 0 })).toBe(true)
    expect(ok({ k: 'spec', s: 22 })).toBe(true)
    expect(ok({ k: 'spec', s: 63 })).toBe(true)
    expect(ok({ k: 'spec', s: 64 })).toBe(false)
    expect(ok({ k: 'spec', s: -1 })).toBe(false)
    expect(ok({ k: 'use', s: 16 })).toBe(true)
    expect(ok({ k: 'use', s: 17 })).toBe(false)
  })

  it('12 人局：死者可以切到列表裡每一個 zone（包含 id 大於 16 的船艙）', () => {
    const { h, cs } = Harness.started(12, 77, { eventMult: 0 })
    const g = h.server.game!
    const ids = g.zoneList().map((z) => z[0])
    expect(Math.max(...ids)).toBeGreaterThan(16)
    // 仿生人死後只能透過記憶核心看，挑一般人類
    const p = g.allPlayers().find((q) => q.role === 'human' && q.slot !== 0)!
    const u = g.mainOf(p)!
    u.inv?.fill(null)
    u.suit = null
    u.statsDirty = true
    h.ticks(2)
    damage(g, null, u, 1e6, { pure: true })
    h.ticks(Math.ceil((LAST_WORDS + 1) * 20))
    const c = cs.find((x) => x.slot === p.slot)!
    let seq = 10
    for (const id of ids) {
      c.send({ t: 'cmd', seq: seq++, c: { k: 'spec', s: id } })
      h.ticks(1)
      expect(p.specZone).toBe(id)
    }
  })
})
