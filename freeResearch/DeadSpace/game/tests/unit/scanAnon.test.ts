// 背包掃描器不能變成身分指紋：變身時背包整組帶進匿名形態，掃到匿名形態只回「無法辨識」；
// 偽裝成某人（或看起來就是某人的分身）時回報那個人本人的背包（和掃描本人一樣），不會露出偽裝者自己的背包
import { describe, expect, it } from 'vitest'
import { Harness, type FakeClient } from './helpers/harness'
import { decode } from '../../src/shared/protocol/codec'
import type { HostMsg } from '../../src/shared/protocol/messages'
import { giveItem, makeItem, morph } from '../../src/sim/systems/items'
import { installXenoSystems } from '../../src/sim/scripts/xeno'
import { SCRIPTS } from '../../src/sim/systems/effects'
import { XAB } from '../../src/shared/content/forms/xeno'
import { hasString } from '../../src/ui/i18n'
import type { Ent } from '../../src/sim/ent'
import type { Game } from '../../src/sim/game'

function standNear(g: Game, u: Ent, t: Ent, dx = 1.2): void {
  const z = g.world.zones[t.zone]
  const n = z.nav!.nearestOpen(t.x + dx, t.y) ?? { x: t.x + dx, y: t.y }
  g.world.relocate(u, t.zone, n.x, n.y)
  u.order = null
  u.queue.length = 0
  u.path = null
}

function scanLines(c: FakeClient): string[] {
  return c.inbox.flatMap((m) => (m.t === 'chat' ? m.lines.map((l) => l.text) : [])).filter((t) => t.startsWith('@item.scan'))
}

/** 掃描期間送給這個 peer 的所有訊息（解碼後的 JSON）：不能出現 ids 裡任何一件道具 */
function rawMentions(h: Harness, peer: string, ids: string[]): string[] {
  const all = (h.raw.get(peer) ?? []).map((r) => JSON.stringify(decode(r) as HostMsg))
  return ids.filter((id) => all.some((j) => j.includes(id)))
}

/** 透過真正的指令使用背包掃描器（走技能的目標篩選），回傳掃描者收到的結果 */
function scan(h: Harness, g: Game, c: FakeClient, scanner: Ent, t: Ent): string[] {
  scanner.inv!.fill(null)
  // 每次都是新的掃描器、冷卻歸零（同一個測試裡要連續掃好幾次）
  scanner.cds.clear()
  const s = giveItem(g, scanner, makeItem('invScanner'))
  t.order = { k: 'hold', x: t.x, y: t.y }
  standNear(g, scanner, t, 2)
  h.ticks(2)
  c.inbox.length = 0
  c.send({ t: 'cmd', seq: 1, c: { k: 'use', s, e: t.id } })
  h.ticks(20)
  return scanLines(c)
}

/** ps[0] 異形（背包裡有容易辨認的道具）、ps[1] Bob（人類）、ps[2] Carl（人類，拿掃描器）*/
function setup() {
  const { h, cs } = Harness.started(3, 4242, { eventMult: 0 })
  const g = h.server.game!
  const ps = g.allPlayers()
  g.setRole(ps[0], 'xeno')
  g.setRole(ps[1], 'human')
  g.setRole(ps[2], 'human')
  installXenoSystems(g)
  const x = g.mainOf(ps[0])!
  const bob = g.mainOf(ps[1])!
  const carl = g.mainOf(ps[2])!
  x.inv!.fill(null)
  giveItem(g, x, makeItem('stim'))
  giveItem(g, x, makeItem('frag'))
  bob.inv!.fill(null)
  giveItem(g, bob, makeItem('antibodyKit'))
  const cc = cs.find((c) => c.slot === ps[2].slot)!
  return { h, cs, g, ps, x, bob, carl, cc }
}

/** 異形變成匿名的變形者形態（背包整組帶著）*/
function goAnon(g: Game, x: Ent): void {
  morph(g, x, 'xeno.mimic')
  x.anon = true
}

const XENO_ITEMS = ['stim', 'frag']

describe('背包掃描器：匿名形態', () => {
  it('訊息 key 兩種語言都有', () => {
    expect(hasString('zh', 'item.scanUnknown')).toBe(true)
    expect(hasString('en', 'item.scanUnknown')).toBe(true)
  })

  it('人形時照實列出；變成匿名形態後只回「無法辨識」，不列出背包（掃描者收到的訊息裡沒有任何一件道具）', () => {
    const { h, g, ps, x, carl, cc } = setup()
    const human = scan(h, g, cc, carl, x)
    expect(human.length).toBe(1)
    expect(human[0]).toContain('@item.scanResult|')
    expect(human[0]).toContain('items=stim,frag')
    goAnon(g, x)
    h.raw.clear()
    const anon = scan(h, g, cc, carl, x)
    expect(anon.length).toBe(1)
    expect(anon[0].startsWith('@item.scanUnknown|')).toBe(true)
    for (const id of XENO_ITEMS) expect(anon[0]).not.toContain(id)
    expect(anon[0]).not.toContain(ps[0].name)
    expect(anon[0]).not.toContain('items=')
    // 掃描者這段時間收到的任何訊息（快照、特效、聊天）都沒有提到那幾件道具
    expect(rawMentions(h, cc.peer, XENO_ITEMS)).toEqual([])
  })

  it('認得出擁有者的人（除錯旗標「看穿匿名單位」）照實看到背包', () => {
    const { h, g, ps, x, carl, cc } = setup()
    goAnon(g, x)
    ps[2].flags.reveal = true
    const r = scan(h, g, cc, carl, x)
    expect(r[0]).toContain('items=stim,frag')
  })

  it('複製匿名目標的全像分身：結果和掃描本尊一樣（無法辨識）', () => {
    const { h, cs, g, ps, x, bob, carl, cc } = setup()
    goAnon(g, x)
    // Bob 對匿名的異形放全像分身
    bob.inv!.fill(null)
    const s = giveItem(g, bob, makeItem('holoProjector'))
    x.order = { k: 'hold', x: x.x, y: x.y }
    standNear(g, bob, x, 2)
    h.ticks(2)
    cs.find((c) => c.slot === ps[1].slot)!.send({ t: 'cmd', seq: 1, c: { k: 'use', s, e: x.id } })
    let holo: Ent | undefined
    for (let i = 0; i < 40 && !holo; i++) {
      h.ticks(1)
      holo = [...g.world.ents.values()].find((e) => e.alive && e.data.holo)
    }
    expect(holo).toBeTruthy()
    const real = scan(h, g, cc, carl, x)
    const copy = scan(h, g, cc, carl, holo!)
    expect(real[0].startsWith('@item.scanUnknown|')).toBe(true)
    expect(copy).toEqual(real)
  })
})

describe('背包掃描器：分身', () => {
  it('幻影裝的分身（看起來就是本人）：掃描結果和掃描本人一樣，不會因為「分身背包是空的」被看穿', () => {
    const { h, g, ps, bob, carl, cc } = setup()
    SCRIPTS.get('mirage.double')!(g, { caster: bob, zone: bob.zone, x: bob.x, y: bob.y } as never, { life: 30 })
    const double = [...g.world.ents.values()].find((e) => e.alive && e.illusion && e.owner === ps[1].slot)!
    expect(double).toBeTruthy()
    expect(double.inv).toBeNull()
    const real = scan(h, g, cc, carl, bob)
    const copy = scan(h, g, cc, carl, double)
    expect(real[0]).toContain('items=antibodyKit')
    expect(copy).toEqual(real)
  })
})

describe('背包掃描器：偽裝成別人', () => {
  it('化身成 Bob 的異形：回報 Bob 本人的背包，和掃描真 Bob 一模一樣；不會露出異形自己的背包', () => {
    const { h, g, ps, x, bob, carl, cc } = setup()
    goAnon(g, x)
    standNear(g, x, bob)
    x.mp = x.maxMp
    x.order = { k: 'cast', a: XAB.masks, e: bob.id }
    h.ticks(16)
    const fake = g.mainOf(ps[0])!
    expect((fake.data.fake as { owner: number }).owner).toBe(ps[1].slot)
    // 化身後背包還在（變身時整組帶著）
    expect(fake.inv!.filter(Boolean).map((i) => i!.id)).toEqual(XENO_ITEMS)
    const real = scan(h, g, cc, carl, bob)
    h.raw.clear()
    const disguised = scan(h, g, cc, carl, fake)
    expect(real.length).toBe(1)
    expect(real[0]).toContain('items=antibodyKit')
    expect(disguised).toEqual(real)
    for (const id of XENO_ITEMS) expect(disguised[0]).not.toContain(id)
    expect(rawMentions(h, cc.peer, XENO_ITEMS)).toEqual([])
  })
})
