// 第 4 輪（老手／多人公平視角，sim 端：原作忠實度與平衡）。每一項都回 war3map.j 或 objects.json 查證過：
// - 防護服擋不住寄生、朊毒（著裝人員 h00I 等沿用 hpea、不是 mechanical → organic；JASS 沒有排除 A070 的腳本）
// - 小行星：ve = rand(0,1)，縮放 50+200·ve %、生命 = 20000 的 ve×100%、碰撞範圍固定 90（= 0.9 m）（17866–17869、4833）
// - 變種人進化肉團屬於變種人本人：看得到名字、驗血是感染（rdv 19789）
// - 被遙控器改寫的仿生人：驗血感染（MZ／kZ）、不累積誤殺點數（Of）、算進異形每秒 EP（oEv）、死亡仍公告仿生人（Z6）
// - 大廳 extraEvents = false：不抽原作沒有的事件，+8000 credits 那一格照原作沒效果
// - 末日時間照大廳設定（原作 3300–4200 秒）
import { describe, expect, it } from 'vitest'
import { Harness, type FakeClient } from './helpers/harness'
import { UNITS, abilityDef } from '../../src/shared/content/registry'
import { passesFilter, runEffects, SCRIPTS } from '../../src/sim/systems/effects'
import { hasBuff } from '../../src/sim/systems/buffs'
import { damage } from '../../src/sim/systems/damage'
import { giveItem, makeItem, wearSuit } from '../../src/sim/systems/items'
import { EXTRA_EVENTS, ROCK_MAX_HP, ROCK_RADIUS, eventsOf, pickEvent } from '../../src/sim/systems/events'
import { SPACE_ZONE } from '../../src/sim/world'
import type { Ent } from '../../src/sim/ent'
import type { Game, GamePlayer } from '../../src/sim/game'

const SEC = 20

/** 開局（Harness.started 只回 h、cs；這裡順便帶出 game）*/
function start(n: number, seed: number, settings: Record<string, unknown> = {}) {
  const { h, cs } = Harness.started(n, seed, settings)
  return { h, cs, g: h.server.game! }
}
const run = (g: Game, name: string, ctx: Record<string, unknown>) => SCRIPTS.get(name)!(g, ctx as never, {})
const lines = (c: FakeClient) => c.inbox.flatMap((m) => (m.t === 'chat' ? m.lines.map((l) => l.text) : []))

/** 照技能本身的效果施放（目標篩選＋效果）*/
function cast(g: Game, abilityId: string, caster: Ent, target: Ent): boolean {
  const ab = abilityDef(abilityId)!
  if (!passesFilter(g, caster, target, ab.filter)) return false
  runEffects(g, { caster, target, x: target.x, y: target.y, zone: target.zone, ability: ab }, ab.effects)
  return true
}

function setRoles(g: Game, roles: ('human' | 'xeno' | 'mutant' | 'android')[]): GamePlayer[] {
  const ps = g.allPlayers()
  ps.forEach((p, i) => g.setRole(p, roles[i] ?? 'human'))
  return ps
}

function draw(g: Game, u: Ent, t: Ent): void {
  const slot = u.inv!.findIndex((x) => x?.id === 'geneSampler')
  run(g, 'git.draw', { caster: u, target: t, x: t.x, y: t.y, zone: t.zone, itemSlot: slot })
}

/** 用三份樣本買報告（同 git.test.ts）*/
function report(g: Game, u: Ent): string {
  const it = u.inv!.find((x) => x?.id === 'gitResolver')!
  const vendor = { data: { sample: it.data } } as unknown as Ent
  const p = g.players[u.owner]!
  run(g, 'git.results', { caster: u, target: vendor, x: u.x, y: u.y, zone: u.zone })
  return p.gitReports[p.gitReports.length - 1].result
}

/** 把仿生人遙控器交給 user 使用一次 */
function useRemote(g: Game, user: GamePlayer, android: GamePlayer): void {
  android.data.remoteCode ??= 4321
  const it = makeItem('overrideRemote')
  it.data = { slot: android.slot, code: android.data.remoteCode }
  const u = g.mainOf(user)!
  giveItem(g, u, it)
  const slot = u.inv!.findIndex((x) => x?.id === 'overrideRemote')
  run(g, 'android.remote', { caster: u, x: u.x, y: u.y, zone: u.zone, itemSlot: slot })
  u.inv![slot] = null
}

describe('防護服擋不住寄生與朊毒（原作著裝人員是 organic）', () => {
  it('18 套著裝單位都是 organic；異類形態、繭、肉團、仿生人底盤不是', () => {
    const suits = [...UNITS.values()].filter((d) => d.tags.includes('suit'))
    expect(suits.length).toBe(18)
    for (const d of suits) expect([d.id, d.tags.includes('organic')]).toEqual([d.id, true])
    const mech = [...UNITS.values()].filter((d) => d.tags.some((t) => t === 'xenoForm' || t === 'mutantForm' || t === 'chassis'))
    expect(mech.length).toBeGreaterThan(10)
    for (const d of mech) expect([d.id, d.tags.includes('organic')]).toEqual([d.id, false])
  })

  it('穿著防護服的人：寄生得上、死時變成異形眷屬；朊毒也一樣', () => {
    const { g } = start(4, 4101, { eventMult: 0 })
    const [x, a, b] = setRoles(g, ['xeno', 'human', 'human', 'human'])
    const xu = g.mainOf(x)!
    for (const [p, suit] of [
      [a, 'suit.tesla'],
      [b, 'suit.cryo'],
    ] as const) {
      const u = g.mainOf(p)!
      giveItem(g, u, makeItem(suit))
      expect(wearSuit(g, u, u.inv!.findIndex((i) => i?.id === suit))).toBe(true)
      expect(u.tags.has('suit')).toBe(true)
    }
    const au = g.mainOf(a)!
    expect(cast(g, 'xeno.parasite', xu, au)).toBe(true)
    expect(hasBuff(au, 'bf.parasite')).toBe(true)
    g.killEnt(au, null, -1)
    expect(a.alive).toBe(true)
    expect(a.spawnOf).toBe('xeno')
    // 朊毒：變種人的 T1 感染形態（mut.prion）也打得到著裝者
    const bu = g.mainOf(b)!
    expect(cast(g, 'mut.prion', xu, bu)).toBe(true)
    expect(hasBuff(bu, 'bf.prion')).toBe(true)
  })

  it('著裝前就被寄生：穿上防護服不會洗掉感染（原作 S001 原地變形）', () => {
    const { g } = start(3, 4102, { eventMult: 0 })
    const [x, a] = setRoles(g, ['xeno', 'human', 'human'])
    const au = g.mainOf(a)!
    expect(cast(g, 'xeno.parasite', g.mainOf(x)!, au)).toBe(true)
    giveItem(g, au, makeItem('suit.rocket'))
    expect(wearSuit(g, au, au.inv!.findIndex((i) => i?.id === 'suit.rocket'))).toBe(true)
    expect(hasBuff(au, 'bf.parasite')).toBe(true)
  })

  it('技能說明不再寫「沒穿防護服」', () => {
    for (const id of ['xeno.parasite', 'mut.prion', 'mut.prion2']) {
      const d = abilityDef(id)!.desc!
      expect(d.zh).not.toContain('沒穿防護服')
      expect(d.en.toLowerCase()).not.toContain('unsuited')
    }
  })
})

describe('小行星（原作 U8 17866–17869、Hh 4833）', () => {
  it('生命 = 20000 × ve（與外觀縮放 50+200·ve % 同一個 ve），碰撞半徑固定 0.9 m', () => {
    const { h, g } = start(3, 4201, { eventMult: 0 })
    expect(g.triggerEvent!('asteroids', true)).toBe(true)
    h.ticks(SEC * 30)
    const ev = eventsOf(g)
    expect(ev.waves.length).toBe(0)
    const rocks = ev.rocks.map((r) => g.world.get(r.id)!).filter(Boolean)
    expect(rocks.length).toBeGreaterThan(30)
    let big = 0
    for (const e of rocks) {
      const sc = Number(e.x2!.sc)
      expect(sc).toBeGreaterThanOrEqual(0.5)
      expect(sc).toBeLessThanOrEqual(2.5)
      if (sc > 1.5) big++
      expect(e.radius).toBe(ROCK_RADIUS)
      expect(e.maxHp).toBe(ROCK_MAX_HP)
      // x2.sc 四捨五入到 0.01 → ve 誤差 ±0.0025 → 生命誤差 ±50
      expect(Math.abs(e.hp - (ROCK_MAX_HP * (sc - 0.5)) / 2)).toBeLessThanOrEqual(51)
    }
    expect(big).toBeGreaterThan(0)
    // 平均生命約一半（舊版是 20000 × 縮放，平均 30000）
    const mean = rocks.reduce((s, e) => s + e.hp, 0) / rocks.length
    expect(mean).toBeGreaterThan(5000)
    expect(mean).toBeLessThan(15000)
  })

  it('撞站：傷害 = 小行星當前生命 × 4；大顆的碰撞範圍也只有 0.9 m', () => {
    const { h, g } = start(3, 4202, { eventMult: 0 })
    g.triggerEvent!('asteroids', true)
    h.ticks(SEC * 2)
    const ev = eventsOf(g)
    const nyx = g.world.get(g.world.zoneByKey('nyx')!.spaceEnt)!
    const r = g.world.get(ev.rocks[0].id)!
    // 只留這一顆在跑
    ev.rocks = [ev.rocks[0]]
    ev.waves = []
    r.x2 = { sc: 2.5 }
    r.hp = 3000
    // 外觀上已經碰到（舊版半徑 0.9×2.5），但離站的距離大於 0.9 m＋站半徑：不算撞到
    g.world.relocate(r, SPACE_ZONE, nyx.x, nyx.y - nyx.radius - 1.6)
    ev.rocks[0].vx = 0
    ev.rocks[0].vy = 0
    const hp0 = nyx.hp
    h.ticks(4)
    expect(nyx.hp).toBe(hp0)
    expect(g.world.get(r.id)).toBeDefined()
    // 碰到：扣 3000 × 4
    g.world.relocate(r, SPACE_ZONE, nyx.x, nyx.y - nyx.radius - ROCK_RADIUS + 0.05)
    h.ticks(1)
    // 同一 tick 站點有一點回血，容許些微誤差
    expect(Math.abs(hp0 - nyx.hp - Math.min(hp0, 12000))).toBeLessThan(50)
    expect(g.world.get(r.id)).toBeUndefined()
  })
})

describe('變種人進化肉團不匿名（原作 rdv 19789：h00T 屬於 cv）', () => {
  it('肉團帶著變種人的名字、顏色、職業；驗血測得出感染；快照沒有洩漏', () => {
    const { h, g, cs } = start(3, 4301, { eventMult: 0 })
    const [m, a] = setRoles(g, ['mutant', 'human', 'human'])
    m.ep = 5000
    const before = g.mainOf(m)!
    const opts = g.evolveOptions(m)
    expect(opts.length).toBeGreaterThan(0)
    g.handleCommand(m.slot, { k: 'evolve', a: opts[0] })
    const mass = g.mainOf(m)!
    expect(mass.id).not.toBe(before.id)
    expect(mass.def.id).toBe('mut.mass')
    expect(mass.anon).toBe(false)
    expect(mass.name).toBe(m.name)
    expect(mass.color).toBe(m.color)
    expect(mass.classId).toBe(m.classId)
    // 人類站到旁邊：快照看得到名字
    const au = g.mainOf(a)!
    const z = g.world.zones[mass.zone]
    const n = z.nav!.nearestOpen(mass.x + 1.5, mass.y) ?? { x: mass.x + 1.5, y: mass.y }
    g.world.relocate(au, mass.zone, n.x, n.y)
    au.order = null
    // 只比對從這裡開始送出的訊息（之前累積的訊息是瞬移前的狀態）
    for (const r of h.raw.values()) r.length = 0
    h.leakWatch = true
    h.ticks(SEC)
    expect(h.drainLeaks()).toEqual([])
    const ac = cs.find((c) => c.slot === a.slot)!
    expect(ac.ents.get(mass.id)?.n).toBe(m.name)
    // 驗血：感染
    au.inv!.fill(null)
    giveItem(g, au, makeItem('geneSampler'))
    draw(g, au, mass)
    draw(g, au, au)
    draw(g, au, g.mainOf(g.allPlayers()[2])!)
    expect(report(g, au)).toBe('infected')
  })
})

describe('被遙控器改寫成異類 spawn 的仿生人（原作 aWv 20788 設 lv／Lv）', () => {
  function setup(seed: number) {
    const { h, cs, g } = start(6, seed, { eventMult: 0 })
    const ps = setRoles(g, ['xeno', 'android', 'human', 'human', 'human', 'human'])
    return { h, cs, g, x: ps[0], an: ps[1], humans: ps.slice(2) }
  }

  it('驗血：感染（kZ 先於 JZ），不是錯誤；改回人類後又是錯誤', () => {
    const { g, x, an, humans } = setup(4401)
    useRemote(g, x, an)
    expect(g.faction(an)).toBe('xeno')
    const u = g.mainOf(humans[0])!
    giveItem(g, u, makeItem('geneSampler'))
    for (const t of [an, humans[1], humans[2]]) draw(g, u, g.mainOf(t)!)
    expect(report(g, u)).toBe('infected')
    // 人類用遙控器改回來：錯誤
    useRemote(g, humans[3], an)
    expect(g.faction(an)).toBe('crew')
    const v = g.mainOf(humans[1])!
    v.inv!.fill(null)
    giveItem(g, v, makeItem('geneSampler'))
    for (const t of [an, humans[0], humans[2]]) draw(g, v, g.mainOf(t)!)
    expect(report(g, v)).toBe('error')
  })

  it('誤殺懲罰：被改寫期間殺 3 名人類不會被強制停機；沒被改寫的仿生人會', () => {
    const killThree = (seed: number, convert: boolean) => {
      const { g, x, an, humans } = setup(seed)
      if (convert) useRemote(g, x, an)
      const au = g.mainOf(an)!
      au.data.god = false
      for (const p of humans.slice(0, 3)) {
        const v = g.mainOf(p)!
        for (let i = 0; i < 20 && v.alive; i++) damage(g, au, v, v.maxHp, { kind: 'normal', pure: true })
        expect(p.alive).toBe(false)
      }
      return an.alive
    }
    expect(killThree(4402, true)).toBe(true)
    expect(killThree(4402, false)).toBe(false)
  })

  it('異形每秒 EP 算進被改寫成異形 spawn 的仿生人（+0.28／秒）', () => {
    const { h, g, x, an } = setup(4403)
    const tickEp = () => {
      const e0 = x.ep
      h.ticks(SEC * 10)
      return x.ep - e0
    }
    expect(tickEp()).toBeCloseTo(4, 1)
    useRemote(g, x, an)
    expect(tickEp()).toBeCloseTo(6.8, 1)
  })

  it('死亡公告仍是「仿生人被摧毀」（原作 Z6 先判 W6），照樣掉記憶核心、不轉化', () => {
    const { h, cs, g, x, an } = setup(4404)
    useRemote(g, x, an)
    h.ticks(1)
    for (const c of cs) c.inbox.length = 0
    const au = g.mainOf(an)!
    au.data.god = false
    g.killEnt(au, null, -1)
    h.ticks(2)
    const got = lines(cs[2])
    expect(got.some((t) => t.startsWith('@death.android|name='))).toBe(true)
    expect(got.some((t) => t.startsWith('@death.xenoSpawn'))).toBe(false)
    expect(an.alive).toBe(false)
    expect(an.data.core).toBeDefined()
  })
})

describe('大廳 extraEvents：只出原作事件', () => {
  it('EXTRA_EVENTS 就是原作 oe[1..15] 以外的三個（死碼病毒、死碼蛞蝓、天守收容失效）', () => {
    const { g } = start(3, 4501, { eventMult: 0 })
    expect([...EXTRA_EVENTS].sort()).toEqual(['slugSwarm', 'tenshu', 'virus'])
    for (const id of EXTRA_EVENTS) expect(g.eventIds!()).toContain(id)
    // 其餘 15 個：原作 15 格（+8000 credits 是 windfall）
    expect(g.eventIds!().filter((id) => !EXTRA_EVENTS.has(id)).length).toBe(15)
  })

  it('關掉時抽不到額外事件；預設開著時抽得到', () => {
    const drawn = (extraEvents: boolean) => {
      const { g } = start(4, 4502, { eventMult: 0, extraEvents })
      expect(g.settings.extraEvents).toBe(extraEvents)
      const out = new Set<string>()
      for (let i = 0; i < 400; i++) {
        const id = pickEvent(g, false)
        if (id) out.add(id)
      }
      return out
    }
    const off = drawn(false)
    for (const id of EXTRA_EVENTS) expect(off.has(id)).toBe(false)
    expect(off.has('windfall')).toBe(true)
    const on = drawn(true)
    expect([...EXTRA_EVENTS].some((id) => on.has(id))).toBe(true)
  })

  it('關掉時 +8000 credits 那一格照原作：抽到算用掉，但沒有公告、販賣機不補貨', () => {
    const { h, cs, g } = start(3, 4503, { eventMult: 0, extraEvents: false })
    const vendor = [...g.world.ents.values()].find((e) => Array.isArray(e.data.stock) && (e.data.stock as unknown[]).length > 0)!
    const st = vendor.data.stock as { count: number; max: number }[]
    for (const s of st) s.count = 0
    for (const c of cs) c.inbox.length = 0
    expect(g.triggerEvent!('windfall', true)).toBe(true)
    expect(eventsOf(g).used.has('windfall')).toBe(true)
    expect(st.every((s) => s.count === 0)).toBe(true)
    h.ticks(1)
    expect(lines(cs[0]).some((t) => t.startsWith('@event.windfall'))).toBe(false)
  })

  it('預設（開著）：windfall 補滿販賣機並公告', () => {
    const { h, cs, g } = start(3, 4504, { eventMult: 0 })
    expect(g.settings.extraEvents).toBe(true)
    const vendor = [...g.world.ents.values()].find((e) => Array.isArray(e.data.stock) && (e.data.stock as unknown[]).length > 0)!
    const st = vendor.data.stock as { count: number; max: number }[]
    for (const s of st) s.count = 0
    for (const c of cs) c.inbox.length = 0
    expect(g.triggerEvent!('windfall', true)).toBe(true)
    expect(st.every((s) => s.count === s.max)).toBe(true)
    h.ticks(1)
    expect(lines(cs[0]).some((t) => t.startsWith('@event.windfall'))).toBe(true)
  })
})

describe('末日時間照大廳設定', () => {
  it('原作 55–70 分鐘 → 3300–4200 秒；預設 30–40 分鐘 → 1800–2400 秒', () => {
    for (let s = 0; s < 6; s++) {
      const a = start(1, 4600 + s, { eventMult: 0, apocalypse: [55, 70] }).g
      expect(a.settings.apocalypse).toEqual([55, 70])
      const at = eventsOf(a).apocAt
      expect(at).toBeGreaterThanOrEqual(3300)
      expect(at).toBeLessThanOrEqual(4200)
      const b = start(1, 4700 + s, { eventMult: 0 }).g
      expect(b.settings.apocalypse).toEqual([30, 40])
      expect(eventsOf(b).apocAt).toBeGreaterThanOrEqual(1800)
      expect(eventsOf(b).apocAt).toBeLessThanOrEqual(2400)
    }
  })
})

describe('死亡公告照原作點名（JASS Z6 17198–17229）', () => {
  it('每一種死亡都帶名字', async () => {
    const { GAME_ZH, GAME_EN } = await import('../../src/ui/strings/game')
    for (const k of ['death.mutant', 'death.xeno', 'death.xenoSpawn', 'death.mutantSpawn', 'death.android', 'death.innocent']) {
      expect(GAME_ZH[k]).toContain('{name}')
      expect(GAME_EN[k]).toContain('{name}')
    }
  })
})
