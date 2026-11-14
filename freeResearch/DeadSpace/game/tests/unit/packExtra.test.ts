// 化身中寄放的道具（packView.extra）與全像分身的背包掃描（第 5 輪回歸審查）：
// - 偽裝者自己的背包滿、顯示用背包沒滿時，別人交來的東西先寄放：「身上有沒有某道具」的判斷都要算進去（carriedItems），
//   否則交過去的記憶核心會被判定遺失、仿生人永遠不能復活
// - 寄放時只告訴偽裝者本人；主單位被替換（轉化、變身）時寄放的道具搬到新單位；站被毀時跟著消失
// - 掃描自己投影的全像分身：結果和掃描本尊一樣（不會讀到化身者真正的背包，匿名形態一樣回「無法辨識」）
import { describe, expect, it } from 'vitest'
import { Harness, type FakeClient } from './helpers/harness'
import { checkMessages } from './helpers/leak'
import { carriedItems, giveItem, hasItem, makeItem, morph, removeCarried, shownPack } from '../../src/sim/systems/items'
import { installXenoSystems } from '../../src/sim/scripts/xeno'
import { criticalRescue } from '../../src/sim/scripts/items'
import { replaceMain } from '../../src/sim/systems/roleSystem'
import { hasClearance } from '../../src/sim/systems/movement'
import { destroyInterior } from '../../src/sim/systems/space'
import { damage } from '../../src/sim/systems/damage'
import { LAST_WORDS, canStillRevive } from '../../src/sim/systems/chat'
import { XAB } from '../../src/shared/content/forms/xeno'
import type { Ent, ItemInst } from '../../src/sim/ent'
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
const extraOf = (u: Ent) => ((u.data.packView as { extra: ItemInst[] } | undefined)?.extra ?? []).map((i) => i.id)

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

/** ps[0] 異形（自己的背包塞滿 stim）、ps[1] Bob（空背包）、ps[2] Carl（交東西、拿掃描器）、ps[3] 仿生人（給核心測試用）*/
function setup(n = 3) {
  const { h, cs } = Harness.started(n, 4242, { eventMult: 0 })
  const g = h.server.game!
  const ps = g.allPlayers()
  g.setRole(ps[0], 'xeno')
  g.setRole(ps[1], 'human')
  g.setRole(ps[2], 'human')
  if (n > 3) g.setRole(ps[3], 'android')
  installXenoSystems(g)
  const x = g.mainOf(ps[0])!
  const bob = g.mainOf(ps[1])!
  const carl = g.mainOf(ps[2])!
  for (const p of ps) {
    const u = g.mainOf(p)!
    u.inv!.fill(null)
    u.suit = null
    u.statsDirty = true
  }
  const client = (i: number) => cs.find((c) => c.slot === ps[i].slot)!
  return { h, g, ps, x, bob, carl, client }
}

/** 異形化身成 t（真正的技能流程）；回傳化身後的主單位 */
function maskAs(h: Harness, g: Game, x: Ent, t: Ent): Ent {
  morph(g, x, 'xeno.mimic')
  x.anon = true
  standNear(g, x, t)
  x.mp = x.maxMp
  x.order = { k: 'cast', a: XAB.masks, e: t.id }
  h.ticks(16)
  const fake = g.mainOf(g.players[x.owner])!
  expect(fake.data.mask).toBeTruthy()
  return fake
}

/** Carl 透過真正的給予指令把 slot 的道具交給 t */
function give(h: Harness, c: FakeClient, g: Game, carl: Ent, t: Ent, slot: number): void {
  standNear(g, carl, t, 1)
  t.order = { k: 'hold', x: t.x, y: t.y }
  h.ticks(3)
  c.send({ t: 'cmd', seq: 2, c: { k: 'give', e: t.id, s: slot } })
  h.ticks(30)
}

/** 透過真正的指令用背包掃描器掃 t，回傳掃描者收到的結果 */
function scan(h: Harness, g: Game, c: FakeClient, scanner: Ent, t: Ent): string[] {
  scanner.inv!.fill(null)
  scanner.cds.clear()
  const s = giveItem(g, scanner, makeItem('invScanner'))
  t.order = { k: 'hold', x: t.x, y: t.y }
  standNear(g, scanner, t, 2)
  h.ticks(2)
  c.inbox.length = 0
  c.send({ t: 'cmd', seq: 3, c: { k: 'use', s, e: t.id } })
  h.ticks(20)
  return lines(c).filter((l) => l.startsWith('@item.scan'))
}

/** carl 對 t 用全像投影器（放進 carl 背包的空格），回傳 carl 的全像分身 */
function holoOf(h: Harness, g: Game, c: FakeClient, carl: Ent, t: Ent): Ent {
  const s = giveItem(g, carl, makeItem('holoProjector'))
  if (carl !== t) standNear(g, carl, t, 1.5)
  t.order = { k: 'hold', x: t.x, y: t.y }
  h.ticks(2)
  c.send({ t: 'cmd', seq: 1, c: { k: 'use', s, e: t.id } })
  h.ticks(30)
  const holo = [...g.world.ents.values()].find((e) => e.alive && e.data.holo && e.owner === carl.owner)
  expect(holo).toBeTruthy()
  return holo!
}

describe('化身中寄放的道具（packView.extra）', () => {
  it('carriedItems／hasItem 含寄放的道具；removeCarried 從背包或寄放處拿走', () => {
    const { g, x } = setup()
    const a = makeItem('stim')
    const b = makeItem('janitorCard')
    x.inv![0] = a
    x.data.packView = { base: [], had: [], extra: [b] }
    expect(carriedItems(x).map((i) => i.id)).toEqual(['stim', 'janitorCard'])
    expect(hasItem(x, 'janitorCard')).toBe(true)
    // 門禁卡寄放中也刷得過（真的帶著卡的人刷得過，偽裝者也要一樣）
    expect(hasClearance(x, 'janitor')).toBe(true)
    expect(removeCarried(x, b)).toBe(true)
    expect(hasItem(x, 'janitorCard')).toBe(false)
    expect(hasClearance(x, 'janitor')).toBe(false)
    expect(removeCarried(x, a)).toBe(true)
    expect(x.inv![0]).toBe(null)
    expect(removeCarried(x, a)).toBe(false)
    void g
  })

  it('記憶核心交給「自己背包滿」的假 Bob：寄放中不算遺失，仿生人還能復活；假 Bob 死掉時核心掉在地上', () => {
    const { h, g, ps, x, bob, carl, client } = setup(4)
    const au = g.mainOf(ps[3])!
    h.ticks(2)
    damage(g, null, au, 1e7, { pure: true })
    h.ticks(Math.ceil((LAST_WORDS + 1) * 20))
    expect(ps[3].data.coreOnly).toBe(true)
    const coreEnt = g.world.get(ps[3].data.core as number)!
    carl.inv![0] = coreEnt.data.item as ItemInst
    g.world.remove(coreEnt)
    h.ticks(5)
    expect(ps[3].data.coreOnly).toBe(true)
    for (let i = 0; i < 6; i++) x.inv![i] = makeItem('stim')
    const fake = maskAs(h, g, x, bob)
    give(h, client(2), g, carl, fake, 0)
    expect(extraOf(fake)).toContain('memoryCore')
    h.ticks(40)
    // 修正前：findCore 只找背包 → coreLost（不能再復活）
    expect(ps[3].data.coreOnly).toBe(true)
    expect(canStillRevive(ps[3])).toBe(true)
    // 仿生人的視野跟著帶核心的人（寄放中也一樣）
    const visible = ps[3].view.visible
    expect(visible.has(fake.id)).toBe(true)
    // 假 Bob 死掉：寄放的核心掉在地上（新的地面物件），仍然可以復活
    damage(g, null, fake, 1e7, { pure: true })
    h.ticks(10)
    expect(ps[3].data.coreOnly).toBe(true)
    const ground = [...g.world.ents.values()].filter((e) => e.alive && (e.data.item as ItemInst | undefined)?.id === 'memoryCore')
    expect(ground.length).toBe(1)
  })

  it('寄放時只有偽裝者本人收到提示（給的人、其他人沒有）；訊息不洩漏', () => {
    const { h, g, x, bob, carl, client } = setup()
    for (let i = 0; i < 6; i++) x.inv![i] = makeItem('stim')
    const fake = maskAs(h, g, x, bob)
    for (const c of [0, 1, 2]) client(c).inbox.length = 0
    h.raw.clear()
    const s = giveItem(g, carl, makeItem('traumaKit'))
    give(h, client(2), g, carl, fake, s)
    expect(extraOf(fake)).toEqual(['traumaKit'])
    const mine = lines(client(0)).filter((l) => l.startsWith('@item.heldForYou'))
    expect(mine.length).toBe(1)
    // 道具名稱兩種寫法都送
    expect(mine[0]).toContain('nz=急救包')
    expect(mine[0]).toContain('ne=Trauma Kit')
    for (const c of [1, 2]) expect(lines(client(c)).some((l) => l.startsWith('@item.heldForYou'))).toBe(false)
    expect(leaks(h)).toEqual([])
    // 背包沒滿（一般的給予）：不提示（空出兩格：一格給寄放的道具放回去）
    fake.inv![0] = null
    fake.inv![1] = null
    h.ticks(12)
    expect(extraOf(fake)).toEqual([])
    client(0).inbox.length = 0
    const s2 = giveItem(g, carl, makeItem('stim'))
    give(h, client(2), g, carl, fake, s2)
    expect(lines(client(0)).some((l) => l.startsWith('@item.heldForYou'))).toBe(false)
  })

  it('限帶一個的道具已經帶著（含寄放中的）：不再寄放第二個，照一般流程掉在腳邊', () => {
    const { h, g, x, bob, carl, client } = setup()
    for (let i = 0; i < 6; i++) x.inv![i] = makeItem('stim')
    x.inv![5] = makeItem('geneSampler')
    const fake = maskAs(h, g, x, bob)
    const s = giveItem(g, carl, makeItem('geneSampler'))
    give(h, client(2), g, carl, fake, s)
    expect(extraOf(fake)).toEqual([])
    expect(carriedItems(fake).filter((i) => i.id === 'geneSampler').length).toBe(1)
  })

  it('主單位被替換（轉化成 spawn、replaceMain 變身）：寄放的道具搬到新單位，放不下就掉在腳邊', () => {
    const count = (g: Game, id: string) => {
      let n = 0
      for (const e of g.world.ents.values()) {
        if ((e.data.item as ItemInst | undefined)?.id === id && e.alive) n++
        n += carriedItems(e).filter((i) => i.id === id).length
      }
      return n
    }
    {
      const { h, g, ps, x, bob, carl, client } = setup()
      for (let i = 0; i < 6; i++) x.inv![i] = makeItem('stim')
      const fake = maskAs(h, g, x, bob)
      give(h, client(2), g, carl, fake, giveItem(g, carl, makeItem('traumaKit')))
      expect(extraOf(fake)).toEqual(['traumaKit'])
      g.convertToSpawn(ps[0].slot, 'mutant')
      h.ticks(5)
      // 修正前：只搬 inv，寄放的道具跟著舊單位消失
      expect(count(g, 'traumaKit')).toBe(1)
    }
    {
      const { h, g, ps, x, bob, carl, client } = setup()
      for (let i = 0; i < 6; i++) x.inv![i] = makeItem('stim')
      const fake = maskAs(h, g, x, bob)
      give(h, client(2), g, carl, fake, giveItem(g, carl, makeItem('traumaKit')))
      const nu = replaceMain(g, ps[0], fake, 'xeno.mimic', { anon: true, keepHpPct: true })
      h.ticks(2)
      // 新單位背包也是滿的（6 件 stim）：寄放的道具掉在腳邊
      expect(count(g, 'traumaKit')).toBe(1)
      const ground = g.world.inZone(nu.zone).filter((e) => e.alive && (e.data.item as ItemInst | undefined)?.id === 'traumaKit')
      expect(ground.length).toBe(1)
      expect(Math.hypot(ground[0].x - nu.x, ground[0].y - nu.y)).toBeLessThan(2)
    }
  })

  it('攜帶道具的被動、重症維生系統：寄放中的也算帶著', () => {
    const { h, g, x, bob, carl, client } = setup()
    for (let i = 0; i < 6; i++) x.inv![i] = makeItem('stim')
    const fake = maskAs(h, g, x, bob)
    give(h, client(2), g, carl, fake, giveItem(g, carl, makeItem('criticalCare')))
    expect(extraOf(fake)).toEqual(['criticalCare'])
    fake.hp = 0
    expect(criticalRescue(g, fake)).toBe(true)
    expect(fake.hp).toBeGreaterThan(0)
  })

  it('站被毀：寄放的道具和背包一樣跟著消失（不會被當成還有人帶著）', () => {
    const { h, g, x, bob, carl, client } = setup()
    for (let i = 0; i < 6; i++) x.inv![i] = makeItem('stim')
    const fake = maskAs(h, g, x, bob)
    give(h, client(2), g, carl, fake, giveItem(g, carl, makeItem('traumaKit')))
    expect(extraOf(fake)).toEqual(['traumaKit'])
    destroyInterior(g, fake.zone, null)
    expect(extraOf(fake)).toEqual([])
    expect(carriedItems(fake)).toEqual([])
  })
})

describe('掃描自己的全像分身：和掃描本尊一致', () => {
  it('對假 Bob 投影：掃描分身看到的是顯示用背包（和掃描假 Bob 一樣），不是偽裝者真正的背包', () => {
    const { h, g, x, bob, carl, client } = setup()
    giveItem(g, x, makeItem('frag'))
    giveItem(g, x, makeItem('stim'))
    giveItem(g, bob, makeItem('antibodyKit'))
    const fake = maskAs(h, g, x, bob)
    expect(shownPack(fake)).toEqual(['antibodyKit'])
    const holo = holoOf(h, g, client(2), carl, fake)
    h.raw.clear()
    const r = scan(h, g, client(2), carl, holo)
    expect(r.length).toBe(1)
    // 修正前：分身歸 Carl → 照實回報複製來的真正背包（frag、stim）
    expect(r[0]).not.toMatch(/frag|stim/)
    expect(r[0]).toMatch(/items=antibodyKit\|/)
    expect(scan(h, g, client(2), carl, fake)[0]).toMatch(/items=antibodyKit\|/)
    expect(leaks(h)).toEqual([])
  })

  it('對匿名異形形態投影：掃描分身和掃描本尊一樣回「無法辨識」', () => {
    const { h, g, x, carl, client } = setup()
    giveItem(g, x, makeItem('frag'))
    morph(g, x, 'xeno.mimic')
    x.anon = true
    const holo = holoOf(h, g, client(2), carl, x)
    const r = scan(h, g, client(2), carl, holo)
    const r2 = scan(h, g, client(2), carl, x)
    expect(r.length).toBe(1)
    expect(r[0].startsWith('@item.scanUnknown|')).toBe(true)
    expect(r2[0].startsWith('@item.scanUnknown|')).toBe(true)
    expect(r[0]).not.toMatch(/frag/)
  })

  it('對一般人投影：掃描分身看到那個人的背包（和掃描本人一樣）；異形掃描自己的分身照實回報', () => {
    const { h, g, ps, x, bob, carl, client } = setup()
    giveItem(g, bob, makeItem('antibodyKit'))
    const holo = holoOf(h, g, client(2), carl, bob)
    expect(scan(h, g, client(2), carl, holo)[0]).toMatch(/items=antibodyKit\|/)
    expect(scan(h, g, client(2), carl, bob)[0]).toMatch(/items=antibodyKit\|/)
    // 異形（匿名形態，帶著 frag）對自己投影：自己掃描本尊、分身都照實回報；別人掃描都是無法辨識
    x.inv!.fill(null)
    giveItem(g, x, makeItem('frag'))
    morph(g, x, 'xeno.mimic')
    x.anon = true
    const xh = holoOf(h, g, client(0), x, x)
    expect(xh.inv!.some((i) => i?.id === 'frag')).toBe(true)
    expect(scan(h, g, client(0), x, xh)[0]).toMatch(/items=frag/)
    // 別人（Carl）掃描異形的分身：無法辨識（和掃描本尊一樣）
    expect(scan(h, g, client(2), carl, xh)[0].startsWith('@item.scanUnknown|')).toBe(true)
    void ps
  })
})
