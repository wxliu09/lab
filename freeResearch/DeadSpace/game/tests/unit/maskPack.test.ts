// 化身的顯示用背包：化身當下記下被化身者當時的背包，之後只隨偽裝者自己收到／給出／用掉的道具增減；
// 背包掃描與「對方背包滿」的判斷都用這份，不再讀被化身者本人「現在」的背包（第 4 輪回歸審查的重現：先交東西再掃描、
// 給予時說滿掃描卻不滿、遠端看到被化身者的背包）；結束化身時清掉
import { describe, expect, it } from 'vitest'
import { Harness, type FakeClient } from './helpers/harness'
import { checkMessages } from './helpers/leak'
import { decode } from '../../src/shared/protocol/codec'
import type { HostMsg } from '../../src/shared/protocol/messages'
import { giveItem, makeItem, morph, shownPack } from '../../src/sim/systems/items'
import { installXenoSystems } from '../../src/sim/scripts/xeno'
import { XAB } from '../../src/shared/content/forms/xeno'
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

const lines = (c: FakeClient) => c.inbox.flatMap((m) => (m.t === 'chat' ? m.lines.map((l) => l.text) : []))
const ids = (u: Ent) => u.inv!.filter(Boolean).map((i) => i!.id)

/** 透過真正的指令使用背包掃描器，回傳掃描者收到的結果（掃描者原本的背包掃完放回去）*/
function scan(h: Harness, g: Game, c: FakeClient, scanner: Ent, t: Ent): string[] {
  const keep = scanner.inv!.map((x) => x)
  scanner.inv!.fill(null)
  scanner.cds.clear()
  const s = giveItem(g, scanner, makeItem('invScanner'))
  t.order = { k: 'hold', x: t.x, y: t.y }
  standNear(g, scanner, t, 2)
  h.ticks(2)
  c.inbox.length = 0
  c.send({ t: 'cmd', seq: 1, c: { k: 'use', s, e: t.id } })
  h.ticks(20)
  scanner.inv!.splice(0, 6, ...keep)
  return lines(c).filter((l) => l.startsWith('@item.scan'))
}

/** Carl 透過真正的給予指令把 slot 的道具交給 t；回傳 Carl 收到的給予相關訊息 */
function give(h: Harness, g: Game, c: FakeClient, carl: Ent, t: Ent, slot: number): string[] {
  standNear(g, carl, t, 1)
  h.ticks(3)
  c.inbox.length = 0
  c.send({ t: 'cmd', seq: 2, c: { k: 'give', e: t.id, s: slot } })
  h.ticks(30)
  return lines(c).filter((l) => l.startsWith('@item.give'))
}

/** 掃描結果裡的道具 id（item.scanResult 的 items 參數）*/
function scanItems(r: string[]): string[] {
  const m = r[0]?.match(/items=([^|]*)/)
  return m ? m[1].split(',').sort() : []
}

function leaks(h: Harness): string[] {
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

/** ps[0] 異形（背包有 stim、frag）、ps[1] Bob（antibodyKit）、ps[2] Carl（拿掃描器、交東西）*/
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
  carl.inv!.fill(null)
  const cc = cs.find((c) => c.slot === ps[2].slot)!
  return { h, cs, g, ps, x, bob, carl, cc }
}

/** 異形化身成 t（真正的技能流程）*/
function maskAs(h: Harness, g: Game, x: Ent, t: Ent): Ent {
  morph(g, x, 'xeno.mimic')
  x.anon = true
  standNear(g, x, t)
  x.mp = x.maxMp
  x.order = { k: 'cast', a: XAB.masks, e: t.id }
  h.ticks(16)
  const fake = g.mainOf(g.players[x.owner])!
  expect((fake.data.fake as { owner: number }).owner).toBe(t.owner)
  return fake
}

describe('化身的顯示用背包', () => {
  it('交給假 Bob 的東西會出現在掃描結果裡；真 Bob 的背包之後怎麼變都看不到（不能遠端看）', () => {
    const { h, g, x, bob, carl, cc } = setup()
    const fake = maskAs(h, g, x, bob)
    // 化身當下：和掃描真 Bob 一樣
    expect(scanItems(scan(h, g, cc, carl, fake))).toEqual(['antibodyKit'])
    // Carl 交 frag 給假 Bob：掃描假 Bob 看得到（偽裝者自己的 frag 不會多出來，只多交過去的那件）
    const s1 = giveItem(g, carl, makeItem('traumaKit'))
    expect(give(h, g, cc, carl, fake, s1)).toEqual([])
    expect(ids(fake)).toContain('traumaKit')
    expect(scanItems(scan(h, g, cc, carl, fake))).toEqual(['antibodyKit', 'traumaKit'])
    // 真 Bob 收到別的東西：掃描真 Bob 看得到，掃描假 Bob 看不到
    const s2 = giveItem(g, carl, makeItem('stim'))
    expect(give(h, g, cc, carl, bob, s2)).toEqual([])
    expect(scanItems(scan(h, g, cc, carl, bob))).toEqual(['antibodyKit', 'stim'])
    expect(scanItems(scan(h, g, cc, carl, fake))).toEqual(['antibodyKit', 'traumaKit'])
    // 偽裝者把收到的東西交出去：顯示用背包也少掉
    const ti = fake.inv!.findIndex((i) => i?.id === 'traumaKit')
    g.handleCommand(x.owner, { k: 'give', e: carl.id, s: ti })
    h.ticks(30)
    expect(ids(carl)).toContain('traumaKit')
    expect(scanItems(scan(h, g, cc, carl, fake))).toEqual(['antibodyKit'])
    // 偽裝者用掉自己的道具（顯示用背包裡沒有的）：顯示用背包不變；顯示用背包有的同種道具會被扣掉
    fake.inv![fake.inv!.findIndex((i) => i?.id === 'stim')] = null
    expect(shownPack(fake)).toEqual(['antibodyKit'])
    for (const r of h.raw.values()) r.length = 0
    h.ticks(2)
    expect(leaks(h)).toEqual([])
  })

  it('給予時「背包滿」照顯示用背包：偽裝者自己背包滿了也照收（寄放），顯示用背包滿了就說滿', () => {
    const { h, g, x, bob, carl, cc } = setup()
    // 偽裝者自己的背包化身前就塞滿了
    for (let i = 0; i < 6; i++) x.inv![i] = makeItem('stim')
    const fake = maskAs(h, g, x, bob)
    expect(shownPack(fake)).toEqual(['antibodyKit'])
    const s1 = giveItem(g, carl, makeItem('traumaKit'))
    expect(give(h, g, cc, carl, fake, s1)).toEqual([])
    expect(ids(carl)).not.toContain('traumaKit')
    expect(scanItems(scan(h, g, cc, carl, fake))).toEqual(['antibodyKit', 'traumaKit'])
    // 偽裝者空出一格：寄放的道具放回背包，顯示用背包不重複計算
    fake.inv![0] = null
    h.ticks(12)
    expect(ids(fake)).toContain('traumaKit')
    expect(scanItems(scan(h, g, cc, carl, fake))).toEqual(['antibodyKit', 'traumaKit'])

    // 另一局：Bob 化身當下背包是滿的，偽裝者自己的背包是空的 → 交東西過去說「滿了」，東西留在 Carl 身上
    const b = setup()
    for (let i = 0; i < 5; i++) giveItem(b.g, b.bob, makeItem('stim'))
    b.x.inv!.fill(null)
    const fake2 = maskAs(b.h, b.g, b.x, b.bob)
    const s2 = giveItem(b.g, b.carl, makeItem('traumaKit'))
    expect(give(b.h, b.g, b.cc, b.carl, fake2, s2)).toEqual(['@item.giveFull'])
    expect(ids(b.carl)).toContain('traumaKit')
    expect(ids(fake2)).toEqual([])
    expect(scanItems(scan(b.h, b.g, b.cc, b.carl, fake2)).length).toBe(6)
    // 和真 Bob 的反應一樣
    expect(give(b.h, b.g, b.cc, b.carl, b.bob, s2)).toEqual(['@item.giveFull'])
  })

  it('結束化身：清掉顯示用背包、寄放的道具放回背包；回到匿名形態，掃描回「無法辨識」', () => {
    const { h, g, ps, x, bob, carl, cc } = setup()
    for (let i = 0; i < 6; i++) x.inv![i] = makeItem('stim')
    const fake = maskAs(h, g, x, bob)
    const s1 = giveItem(g, carl, makeItem('traumaKit'))
    give(h, g, cc, carl, fake, s1)
    fake.order = { k: 'cast', a: XAB.unmask }
    h.ticks(4)
    const me = g.mainOf(ps[0])!
    expect(me.data.mask).toBeUndefined()
    expect(me.data.packView).toBeUndefined()
    expect(shownPack(me)).toBe(null)
    // 自己背包滿了：寄放的道具掉在腳邊（不會憑空消失）
    const ground = g.world.inZone(me.zone).filter((e) => (e.data.item as { id: string } | undefined)?.id === 'traumaKit')
    expect(ground.length + ids(me).filter((i) => i === 'traumaKit').length).toBe(1)
    expect(scan(h, g, cc, carl, me)[0]?.startsWith('@item.scanUnknown|')).toBe(true)
  })

  it('掃描期間送出的訊息不含偽裝者自己的道具，也不含被化身者化身後才拿到的道具', () => {
    const { h, g, x, bob, carl, cc } = setup()
    const fake = maskAs(h, g, x, bob)
    giveItem(g, bob, makeItem('mediSwarm'))
    h.raw.clear()
    const r = scan(h, g, cc, carl, fake)
    expect(scanItems(r)).toEqual(['antibodyKit'])
    const all = (h.raw.get(cc.peer) ?? []).map((m) => JSON.stringify(decode(m) as HostMsg))
    for (const id of ['stim', 'frag', 'mediSwarm']) expect(all.some((j) => j.includes(id))).toBe(false)
  })
})
