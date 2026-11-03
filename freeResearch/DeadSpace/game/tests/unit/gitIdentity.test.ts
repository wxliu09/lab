// GIT 驗血不能拿來探測身分：「已抽過」只依抽血者看到的樣子判定；分身看起來和真人一樣（成功、名字照記），只是沒有血
import { describe, expect, it } from 'vitest'
import { Harness, type FakeClient } from './helpers/harness'
import { giveItem, makeItem, morph } from '../../src/sim/systems/items'
import { SCRIPTS } from '../../src/sim/systems/effects'
import { replaceMain } from '../../src/sim/systems/roleSystem'
import { installXenoSystems } from '../../src/sim/scripts/xeno'
import { XAB } from '../../src/shared/content/forms/xeno'
import { UNITS } from '../../src/shared/content/registry'
import { sampleName } from '../../src/shared/sysArgs'
import type { Ent } from '../../src/sim/ent'
import type { Game, GamePlayer } from '../../src/sim/game'

const run = (g: Game, name: string, ctx: Record<string, unknown>) => SCRIPTS.get(name)!(g, ctx as never, {})

function standNear(g: Game, u: Ent, t: Ent): void {
  const z = g.world.zones[t.zone]
  const n = z.nav!.nearestOpen(t.x + 1, t.y) ?? { x: t.x + 1, y: t.y }
  g.world.relocate(u, t.zone, n.x, n.y)
  u.order = null
  u.queue.length = 0
  u.path = null
}

function gitLines(c: FakeClient): string[] {
  return c.inbox.filter((m) => m.t === 'chat').flatMap((m) => (m as { lines: { text: string }[] }).lines.map((l) => l.text)).filter((t) => t.includes('git.'))
}

/** 透過真正的指令抽血（會走技能的目標篩選與 3 秒施法）*/
function drawCmd(h: Harness, g: Game, c: FakeClient, sampler: Ent, t: Ent): string[] {
  const s = sampler.inv!.findIndex((x) => x?.id === 'geneSampler')
  t.order = { k: 'hold', x: t.x, y: t.y }
  standNear(g, sampler, t)
  h.ticks(2)
  c.inbox.length = 0
  c.send({ t: 'cmd', seq: 1, c: { k: 'use', s, e: t.id } })
  // 施法 3 秒＋冷卻 3 秒
  h.ticks(20 * 7)
  return gitLines(c)
}

/** 直接呼叫抽血腳本（不受距離影響）*/
function drawDirect(g: Game, u: Ent, t: Ent): void {
  const slot = u.inv!.findIndex((x) => x?.id === 'geneSampler')
  run(g, 'git.draw', { caster: u, target: t, x: t.x, y: t.y, zone: t.zone, itemSlot: slot })
}

function sampleOf(u: Ent): { names: string[]; r: number } | undefined {
  const it = u.inv!.find((x) => x?.id === 'geneSampler' || x?.id === 'gitResolver')
  return (it?.data as { sample?: { names: string[]; r: number } } | undefined)?.sample
}

function setup(n = 5, seed = 21) {
  const { h, cs } = Harness.started(n, seed, { eventMult: 0 })
  const g = h.server.game!
  const ps = g.allPlayers()
  return { h, cs, g, ps }
}

function holoOf(h: Harness, g: Game, c: FakeClient, user: GamePlayer, t: Ent): Ent {
  const u = g.mainOf(user)!
  u.inv!.fill(null)
  const hs = giveItem(g, u, makeItem('holoProjector'))
  standNear(g, u, t)
  h.ticks(2)
  const before = new Set(g.world.ents.keys())
  c.send({ t: 'cmd', seq: 1, c: { k: 'use', s: hs, e: t.id } })
  h.ticks(20 * 3)
  const holo = [...g.world.ents.values()].find((e) => !before.has(e.id) && e.illusion)
  expect(holo).toBeTruthy()
  holo!.order = { k: 'hold', x: holo!.x, y: holo!.y }
  return holo!
}

describe('GIT 驗血：「已抽過」不洩漏身分', () => {
  it('抽過某人的人形之後，他的匿名異形形態照樣抽得到（不會說「已抽過」）', () => {
    const { h, cs, g, ps } = setup()
    const x = ps.find((p) => p.role === 'xeno' && !p.spawnOf)!
    const a = ps.find((p) => p.role === 'human')!
    const ac = cs.find((c) => c.slot === a.slot)!
    const au = g.mainOf(a)!
    au.inv!.fill(null)
    giveItem(g, au, makeItem('geneSampler'))
    expect(drawCmd(h, g, ac, au, g.mainOf(x)!)).toEqual(['@git.msg.extracted|n=1|max=3'])
    g.handleCommand(x.slot, { k: 'cast', a: 'xeno.form' })
    h.ticks(20 * 6)
    const form = g.mainOf(x)!
    expect(form.anon).toBe(true)
    expect(drawCmd(h, g, ac, au, form)).toEqual(['@git.msg.extracted|n=2|max=3'])
    // 同一個匿名單位抽第二次才是「已抽過」（和抽同一個真人兩次一樣）
    expect(drawCmd(h, g, ac, au, form)).toEqual(['@git.msg.already'])
    // 匿名形態存成標記，顯示時依語言換成形態名（中文和原本一樣）
    expect(sampleOf(au)!.names.map((n) => sampleName(n, 'zh'))).toEqual([x.name, UNITS.get(form.data.viewDef ?? form.def.id)!.name.zh])
    expect(sampleName(sampleOf(au)!.names[1], 'en')).toBe(UNITS.get(form.data.viewDef ?? form.def.id)!.name.en)
  })

  it('繭和人形分開計算：抽過繭，之後抽他的人形不會說「已抽過」', () => {
    const { g, ps } = setup()
    const x = ps.find((p) => p.role === 'xeno' && !p.spawnOf)!
    const a = ps.find((p) => p.role === 'human')!
    const au = g.mainOf(a)!
    au.inv!.fill(null)
    giveItem(g, au, makeItem('geneSampler'))
    x.ep = 5000
    g.handleCommand(x.slot, { k: 'evolve', a: g.evolveOptions(x)[0] })
    const cocoon = g.mainOf(x)!
    expect(cocoon.def.id).toBe('xeno.cocoon')
    drawDirect(g, au, cocoon)
    expect(sampleOf(au)!.names.length).toBe(1)
    // 模擬繭期結束後變回人形（新的主單位）
    x.evolvingUntil = 0
    const human = replaceMain(g, x, cocoon, 'personnel', { anon: false })
    drawDirect(g, au, human)
    expect(sampleOf(au)!.names.map((n) => sampleName(n, 'zh'))).toEqual([UNITS.get('xeno.cocoon')!.name.zh, x.name])
  })
})

describe('GIT 驗血：偽裝', () => {
  function disguised() {
    const { h, cs, g, ps } = setup(3, 4242)
    g.setRole(ps[0], 'xeno')
    g.setRole(ps[1], 'human')
    g.setRole(ps[2], 'human')
    installXenoSystems(g)
    const bob = g.mainOf(ps[1])!
    const x = g.mainOf(ps[0])!
    morph(g, x, 'xeno.mimic')
    x.anon = true
    standNear(g, x, bob)
    x.mp = x.maxMp
    x.order = { k: 'cast', a: XAB.masks, e: bob.id }
    h.ticks(16)
    const fake = g.mainOf(ps[0])!
    expect((fake.data.fake as { owner: number }).owner).toBe(ps[1].slot)
    const carl = g.mainOf(ps[2])!
    carl.inv!.fill(null)
    giveItem(g, carl, makeItem('geneSampler'))
    return { h, cs, g, ps, bob, fake, carl, cc: cs.find((c) => c.slot === ps[2].slot)! }
  }

  it('抽過真的 Bob，再抽偽裝成 Bob 的化身者 →「已抽過」，名單上不會出現兩個 Bob', () => {
    const { h, g, ps, bob, fake, carl, cc } = disguised()
    expect(drawCmd(h, g, cc, carl, bob)).toEqual(['@git.msg.extracted|n=1|max=3'])
    expect(drawCmd(h, g, cc, carl, fake)).toEqual(['@git.msg.already'])
    expect(sampleOf(carl)!.names).toEqual([ps[1].name])
  })

  it('反過來（先抽假 Bob 再抽真 Bob）也一樣是「已抽過」', () => {
    const { h, g, ps, bob, fake, carl, cc } = disguised()
    expect(drawCmd(h, g, cc, carl, fake)).toEqual(['@git.msg.extracted|n=1|max=3'])
    expect(drawCmd(h, g, cc, carl, bob)).toEqual(['@git.msg.already'])
    expect(sampleOf(carl)!.names).toEqual([ps[1].name])
  })
})

describe('GIT 驗血：全像分身', () => {
  it('對分身抽血和對真人一樣顯示成功、名字照記；但分身沒有血，不影響結果', () => {
    const { h, cs, g, ps } = setup(5, 4242)
    for (const p of ps) g.setRole(p, 'human')
    g.setRole(ps[1], 'xeno')
    const xu = g.mainOf(ps[1])!
    // ps[0] 對異形（人形）投影一個分身
    const holo = holoOf(h, g, cs[0], ps[0], xu)
    expect(holo.isMain).toBe(false)
    const carl = g.mainOf(ps[2])!
    carl.inv!.fill(null)
    giveItem(g, carl, makeItem('geneSampler'))
    // 走真正的指令：技能篩選不能把分身擋掉（擋掉＝「無效的目標」，一看就知道是假的）
    expect(drawCmd(h, g, cs[2], carl, holo)).toEqual(['@git.msg.extracted|n=1|max=3'])
    // 再抽真的那個人：和抽同一個真人兩次一樣是「已抽過」
    expect(drawCmd(h, g, cs[2], carl, xu)).toEqual(['@git.msg.already'])
    drawDirect(g, carl, g.mainOf(ps[3])!)
    drawDirect(g, carl, g.mainOf(ps[4])!)
    const s = sampleOf(carl)!
    expect(s.names).toEqual([ps[1].name, ps[3].name, ps[4].name])
    // 名單上有異形的名字，但抽到的只是分身：結果乾淨
    expect(s.r).toBe(1)
  })

  it('對照：真的抽到異形（人形）→ 感染', () => {
    const { g, ps } = setup(5, 4242)
    for (const p of ps) g.setRole(p, 'human')
    g.setRole(ps[1], 'xeno')
    const carl = g.mainOf(ps[2])!
    carl.inv!.fill(null)
    giveItem(g, carl, makeItem('geneSampler'))
    for (const p of [ps[1], ps[3], ps[4]]) drawDirect(g, carl, g.mainOf(p)!)
    expect(sampleOf(carl)!.r).toBe(2)
  })

  it('匿名形態的分身：名單上寫的形態名和真的匿名形態一樣', () => {
    const { h, cs, g, ps } = setup()
    const x = ps.find((p) => p.role === 'xeno' && !p.spawnOf)!
    g.handleCommand(x.slot, { k: 'cast', a: 'xeno.form' })
    h.ticks(20 * 6)
    const form = g.mainOf(x)!
    form.order = { k: 'hold', x: form.x, y: form.y }
    const a = ps.find((p) => p.role === 'human')!
    const b = ps.find((p) => p.role === 'human' && p !== a)!
    const holo = holoOf(h, g, cs.find((c) => c.slot === a.slot)!, a, form)
    const bu = g.mainOf(b)!
    bu.inv!.fill(null)
    giveItem(g, bu, makeItem('geneSampler'))
    drawDirect(g, bu, holo)
    drawDirect(g, bu, form)
    const names = sampleOf(bu)!.names
    expect(names.length).toBe(2)
    expect(names[0]).toBe(names[1])
    expect(names[0]).not.toBe('')
  })

  it('不是玩家的單位（生物、防禦無人機）仍是「已抽過」，不算樣本', () => {
    const { g, ps } = setup()
    const a = g.mainOf(ps[0])!
    a.inv!.fill(null)
    giveItem(g, a, makeItem('geneSampler'))
    const critter = [...g.world.ents.values()].find((e) => e.alive && !e.isMain && e.owner < 0 && e.def.speed > 0 && !e.tags.has('structure'))!
    expect(critter).toBeTruthy()
    drawDirect(g, a, critter)
    expect(sampleOf(a)?.names ?? []).toEqual([])
  })
})
