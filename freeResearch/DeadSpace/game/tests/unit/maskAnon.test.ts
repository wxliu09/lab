// 複製匿名目標的外觀（時滯殘影）：殘影也必須是匿名的，不能把目標的真實擁有者、名字、顏色帶進別人的快照
import { describe, expect, it } from 'vitest'
import { Harness } from './helpers/harness'
import { XAB } from '../../src/shared/content/forms/xeno'
import { morph } from '../../src/sim/systems/items'
import { entView } from '../../src/sim/systems/snapshot'
import { installXenoSystems } from '../../src/sim/scripts/xeno'

describe('複製匿名目標', () => {
  it('時滯殘影和匿名目標一樣：無主、無名、無色', () => {
    const { h } = Harness.started(3, 777, { eventMult: 0 })
    const g = h.server.game!
    const ps = g.allPlayers()
    g.setRole(ps[0], 'xeno')
    g.setRole(ps[1], 'mutant')
    g.setRole(ps[2], 'human')
    installXenoSystems(g)
    const tgt = g.mainOf(ps[1])!
    // 目標處於匿名形態（例如沒在偽裝的變異形態）
    tgt.anon = true
    tgt.order = null
    const x = g.mainOf(ps[0])!
    morph(g, x, 'xeno.puppeteer')
    x.anon = true
    const z = g.world.zones[tgt.zone]
    const n = z.nav ? (z.nav.nearestOpen(tgt.x + 1.2, tgt.y) ?? { x: tgt.x + 1.2, y: tgt.y }) : { x: tgt.x + 1.2, y: tgt.y }
    g.world.relocate(x, tgt.zone, n.x, n.y)
    x.mp = x.maxMp
    x.order = { k: 'cast', a: XAB.flux, e: tgt.id }
    let echo
    for (let i = 0; i < 60 && !echo; i++) {
      h.ticks(1)
      echo = [...g.world.ents.values()].find((e) => e.illusion && e.master === x.id)
    }
    expect(echo).toBeTruthy()
    const seenTgt = entView(g, ps[2], tgt)
    const seenEcho = entView(g, ps[2], echo!)
    expect(seenTgt.o).toBe(-1)
    expect(seenEcho.o).toBe(seenTgt.o)
    expect(seenEcho.n).toBe('')
    expect(seenEcho.c).toBe(-1)
    expect(seenEcho.cl).toBe('')
  })
})
