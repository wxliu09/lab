// 子物件（裝置、召喚物、蟲餌）的樣子跟著施放者「在別人眼中」的樣子：匿名就匿名，偽裝就呈現成偽裝對象的東西
import { describe, expect, it } from 'vitest'
import { Harness } from './helpers/harness'
import { anonChildProblems, checkMessages } from './helpers/leak'
import { giveItem, makeItem, morph } from '../../src/sim/systems/items'
import { entView } from '../../src/sim/systems/snapshot'
import { installXenoSystems } from '../../src/sim/scripts/xeno'
import { INSTANT_ITEMS } from '../../src/sim/systems/vendors'
import { spaceOf } from '../../src/sim/systems/space'
import { XAB } from '../../src/shared/content/forms/xeno'
import { unitDef } from '../../src/shared/content/registry'
import type { Ent } from '../../src/sim/ent'
import type { Game } from '../../src/sim/game'

function standAt(g: Game, u: Ent, zid: number, x: number, y: number): void {
  const z = g.world.zones[zid]
  const n = z.nav ? (z.nav.nearestOpen(x, y) ?? { x, y }) : { x, y }
  g.world.relocate(u, zid, n.x, n.y)
  u.order = null
  u.queue.length = 0
  u.path = null
}

function leaks(h: Harness): string[] {
  const g = h.server.game!
  const out: string[] = []
  for (const [peer, raws] of h.raw) {
    const slot = h.server.slotOfPeer(peer)
    if (slot !== null) out.push(...checkMessages(g, slot, raws))
    raws.length = 0
  }
  return out
}

/** 異形切到匿名形態，旁邊站一個人類觀察者 */
function anonXeno(seed = 21) {
  const { h, cs } = Harness.started(5, seed, { eventMult: 0 })
  const g = h.server.game!
  const x = g.allPlayers().find((p) => p.role === 'xeno' && !p.spawnOf)!
  g.handleCommand(x.slot, { k: 'cast', a: 'xeno.form' })
  h.ticks(20 * 6)
  const nu = g.mainOf(x)!
  expect(nu.anon).toBe(true)
  const obs = g.allPlayers().find((p) => p !== x && p.role === 'human')!
  g.world.relocate(g.mainOf(obs)!, nu.zone, nu.x + 1.5, nu.y)
  h.ticks(3)
  return { h, cs, g, x, nu, obs, oc: cs.find((c) => c.slot === obs.slot)! }
}

/** 化身者偽裝成 Bob（ps[1]），Carl（ps[2]）在旁邊看 */
function disguised() {
  const { h, cs } = Harness.started(3, 4242, { eventMult: 0 })
  const g = h.server.game!
  const ps = g.allPlayers()
  g.setRole(ps[0], 'xeno')
  g.setRole(ps[1], 'human')
  g.setRole(ps[2], 'human')
  installXenoSystems(g)
  const bob = g.mainOf(ps[1])!
  const x = g.mainOf(ps[0])!
  morph(g, x, 'xeno.mimic')
  x.anon = true
  standAt(g, x, bob.zone, bob.x + 1.5, bob.y)
  standAt(g, g.mainOf(ps[2])!, bob.zone, bob.x - 1.5, bob.y)
  x.mp = x.maxMp
  x.order = { k: 'cast', a: XAB.masks, e: bob.id }
  h.ticks(16)
  const fake = g.mainOf(ps[0])!
  expect((fake.data.fake as { owner: number }).owner).toBe(ps[1].slot)
  return { h, cs, g, ps, bob, fake }
}

function place(h: Harness, g: Game, u: Ent, item: string, defId: string): Ent {
  u.inv!.fill(null)
  u.cds.clear()
  const s = giveItem(g, u, makeItem(item))
  const before = new Set(g.world.ents.keys())
  g.handleCommand(u.owner, { k: 'use', s, x: u.x + 0.5, y: u.y + 1 })
  h.ticks(40)
  const dev = [...g.world.ents.values()].find((e) => !before.has(e.id) && e.def.id === defId)
  expect(dev).toBeTruthy()
  return dev!
}

const LOOK = ['d', 'o', 'n', 'c', 'cl', 'fl'] as const

describe('匿名形態的子物件', () => {
  it('匿名異形丟出的蟲餌也是匿名的：旁人看不到擁有者', () => {
    const { h, g, x, nu, oc } = anonXeno()
    nu.inv!.fill(null)
    const s = giveItem(g, nu, makeItem('wormBait'))
    h.ticks(1)
    leaks(h)
    h.leakWatch = true
    g.handleCommand(x.slot, { k: 'use', s, x: nu.x + 1, y: nu.y })
    h.ticks(20 * 2)
    const bait = [...g.world.ents.values()].find((e) => e.def.id === 'dev.wormBait')!
    expect(bait.anon).toBe(true)
    expect(oc.ents.has(bait.id)).toBe(true)
    expect(oc.ents.get(bait.id)?.o).toBe(-1)
    expect([...new Set(h.leakProblems)]).toEqual([])
  })

  it('oracle：匿名擁有者在這個形態下生出的子物件若顯示擁有者，就算洩漏；人形時放的不算', () => {
    const { g, x, nu, obs } = anonXeno()
    const V = obs
    // 這個形態下生出、卻沒有匿名的子物件 → 抓得到
    const leaky = g.world.spawn(unitDef('dev.wormBait'), nu.zone, nu.x + 1, nu.y, x.slot)
    expect(anonChildProblems(g, V, leaky, entView(g, V, leaky)).length).toBeGreaterThan(0)
    // 比匿名形態更早出現的（人形時放的）→ 不算
    leaky.bornAt = nu.bornAt - 1
    expect(anonChildProblems(g, V, leaky, entView(g, V, leaky))).toEqual([])
    // 正常匿名的子物件 → 不算
    const ok = g.world.spawn(unitDef('dev.wormBait'), nu.zone, nu.x + 1, nu.y, x.slot)
    ok.anon = true
    expect(anonChildProblems(g, V, ok, entView(g, V, ok))).toEqual([])
  })
})

describe('偽裝期間放下的裝置', () => {
  it('化身者偽裝成 Bob 時放的感應器，旁人看起來和 Bob 本人放的一模一樣', () => {
    const { h, g, ps, bob, fake } = disguised()
    h.ticks(2)
    leaks(h)
    h.leakWatch = true
    const real = place(h, g, bob, 'motionSensor', 'dev.motionSensor')
    const mask = place(h, g, fake, 'motionSensor', 'dev.motionSensor')
    const rv = entView(g, ps[2], real)
    const mv = entView(g, ps[2], mask)
    for (const k of LOOK) expect([k, mv[k]]).toEqual([k, rv[k]])
    expect(mv.o).toBe(ps[1].slot)
    // 真正的擁有者（化身者）與同陣營照樣知道是自己的
    expect(entView(g, ps[0], mask).o).toBe(ps[0].slot)
    expect([...new Set(h.leakProblems)]).toEqual([])
  })

  it('偽裝中搭的逃生艙，旁人看起來是 Bob 的艙（和 Bob 本人搭的一樣）', () => {
    const { h, g, ps, bob, fake } = disguised()
    const pods = (): Ent[] => [...spaceOf(g).pods.keys()].map((id) => g.world.get(id)!).filter(Boolean)
    expect(INSTANT_ITEMS.get('escapePass')!(g, bob, bob as never)).toBe(true)
    expect(INSTANT_ITEMS.get('escapePass')!(g, fake, fake as never)).toBe(true)
    h.ticks(20 * 5)
    const [a, b] = pods()
    expect(a && b).toBeTruthy()
    const va = entView(g, ps[2], a)
    const vb = entView(g, ps[2], b)
    for (const k of LOOK) expect([k, vb[k]]).toEqual([k, va[k]])
    expect(va.o).toBe(ps[1].slot)
  })

  it('卸下偽裝之後，之前放的裝置樣子不變（不會在卸裝那一刻跟著變，露出破綻）', () => {
    const { h, g, ps, fake } = disguised()
    const mask = place(h, g, fake, 'motionSensor', 'dev.motionSensor')
    const before = entView(g, ps[2], mask)
    fake.data.fake = undefined
    h.ticks(2)
    expect(entView(g, ps[2], mask).o).toBe(before.o)
    // 沒有偽裝的匿名形態放的裝置：照舊匿名
    const anonDev = place(h, g, fake, 'motionSensor', 'dev.motionSensor')
    expect(entView(g, ps[2], anonDev).o).toBe(-1)
  })
})
