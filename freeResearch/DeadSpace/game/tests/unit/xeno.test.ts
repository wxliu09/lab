// 異形形態與技能：def 數值抽查＋主要技能能施放並產生效果
import { describe, expect, it } from 'vitest'
import { Harness } from './helpers/harness'
import { ABILITIES, BUFFS, FORMS, UNITS, unitDef } from '../../src/shared/content/registry'
import { XAB, XBF, XUNIT } from '../../src/shared/content/forms/xeno'
import { giveItem, makeItem } from '../../src/sim/systems/items'
import { damage } from '../../src/sim/systems/damage'
import { applyBuff, hasBuff } from '../../src/sim/systems/buffs'
import { entView } from '../../src/sim/systems/snapshot'
import { installXenoSystems } from '../../src/sim/scripts/xeno'
import { NEUTRAL, type Ent } from '../../src/sim/ent'
import type { Game } from '../../src/sim/game'

const ICONS = new Set(
  'move stop hold attack heal bolt fire frost shield eye dna bomb grenade rocket saw plasma tentacle egg claw skull gear door card radar scan teleport clock mask web rock storm beam gun drone ship pod module hat plush pill syringe battery camera sensor key suit wrench cloak core star void infect roar evolve devour human speed'.split(' '),
)

const ROLE_ABS = ['xeno.parasite', 'xeno.egg', 'xeno.human', 'xeno.spawnHuman']

interface Spot {
  zone: number
  x: number
  y: number
}

/** 找一塊 9×9 公尺沒有牆、沒有門、遠離停機坪與出入口（不會被登艇系統帶走）的空地 */
function openSpot(g: Game, r = 4): Spot {
  for (const z of g.world.zones) {
    if (!z.nav || !z.layout || z.data.ship) continue
    const { w, h } = z.layout
    const avoid = [...z.layout.pads, ...z.layout.exits]
    for (let y = r + 1; y < h - r - 1; y++) {
      for (let x = r + 1; x < w - r - 1; x++) {
        let ok = !avoid.some((p) => Math.hypot(p.x - x, p.y - y) < r + 6)
        if (ok && g.world.query(z.id, x + 0.5, y + 0.5, r + 2).some((e) => !e.isMain)) ok = false
        for (let dy = -r; dy <= r && ok; dy++) {
          for (let dx = -r; dx <= r && ok; dx++) {
            const i = z.nav.idx(x + dx + 0.5, y + dy + 0.5)
            if (i < 0 || z.nav.blockedIdx(i) || z.nav.doorOf[i] >= 0) ok = false
          }
        }
        if (ok) return { zone: z.id, x: x + 0.5, y: y + 0.5 }
      }
    }
  }
  throw new Error('找不到空地')
}

function setup() {
  const { h } = Harness.started(3, 4242)
  const g = h.server.game!
  const ps = g.allPlayers()
  g.setRole(ps[0], 'xeno')
  g.setRole(ps[1], 'human')
  g.setRole(ps[2], 'human')
  const spot = openSpot(g)
  // 開局快照是在玩家被搬到空地之前送的：先清掉，之後逐 tick 比對
  for (const r of h.raw.values()) r.length = 0
  h.leakWatch = true
  // 玩家主單位先移到空地外圍，需要時再拉進來
  for (let i = 0; i < ps.length; i++) place(g, g.mainOf(ps[i])!, spot, -3.5 + i * 3.5, 3.8)
  installXenoSystems(g)
  return { h, g, ps, spot }
}

function place(g: Game, e: Ent, s: Spot, dx: number, dy: number): Ent {
  g.world.relocate(e, s.zone, s.x + dx, s.y + dy)
  return e
}

function put(g: Game, defId: string, s: Spot, dx: number, dy: number, owner = NEUTRAL): Ent {
  return g.world.spawn(unitDef(defId), s.zone, s.x + dx, s.y + dy, owner)
}

function cast(e: Ent, a: string, t?: Ent | { x: number; y: number }): void {
  if (!t) e.order = { k: 'cast', a, x: e.x, y: e.y }
  else if ('id' in t) e.order = { k: 'cast', a, e: t.id }
  else e.order = { k: 'cast', a, x: t.x, y: t.y }
}

const sec = (h: Harness, s: number) => h.ticks(Math.round(s * 20))

/** 掃描目前為止送給每個 peer 的訊息，回報隱藏資訊洩漏 */
function leaks(h: Harness): string[] {
  const out = [...h.drainLeaks()]
  h.leakProblems.length = 0
  return out
}

describe('異形形態 def', () => {
  // [HP, 回血, 攻擊, CD, 射程, 移速]（研究 02 §3.6）
  const MAIN: Record<string, [number, number, number, number, number, number]> = {
    'xeno.protoform': [650, 0.75, 45, 1.5, 4, 2.85],
    'xeno.lumen': [700, 0.5, 16, 0.5, 6, 2.85],
    'xeno.puppeteer': [700, 0.75, 44, 1.5, 6, 2.75],
    'xeno.brute': [875, 2, 49, 1.4, 1.4, 3.3],
    'xeno.pyreheart': [900, 0.75, 24, 0.75, 6.5, 2.75],
    'xeno.arcflayer': [1050, 0.75, 65, 1.5, 1.4, 2.8],
    'xeno.phantasm': [700, 0.75, 38, 1, 6.5, 2.75],
    'xeno.gorgon': [1700, 1, 42, 1, 1.4, 2.95],
    'xeno.hydra': [450, 16, 70, 1.25, 1.4, 2.65],
    'xeno.weaver': [1600, 0.5, 85, 1.5, 2.5, 2.65],
    'xeno.voidwalker': [850, 0.5, 65, 1.5, 6, 2.8],
    'xeno.chronarch': [850, 0.5, 69, 2, 6, 2.75],
    'xeno.mimic': [700, 0.75, 38, 1, 1.4, 2.85],
  }
  // [HP, 攻擊, 移速]
  const SPAWN: Record<string, [number, number, number]> = {
    'xeno.protoform.spawn': [600, 41, 2.85],
    'xeno.lumen.spawn': [650, 16, 2.85],
    'xeno.puppeteer.spawn': [650, 39, 2.75],
    'xeno.brute.spawn': [650, 32, 3.2],
    'xeno.pyreheart.spawn': [700, 19, 2.75],
    'xeno.arcflayer.spawn': [800, 64, 2.8],
    'xeno.phantasm.spawn': [625, 34, 2.75],
    'xeno.gorgon.spawn': [1300, 39, 2.95],
    'xeno.hydra.spawn': [350, 60, 2.3],
    'xeno.weaver.spawn': [1300, 85, 2.5],
    'xeno.voidwalker.spawn': [850, 56, 2.6],
    'xeno.chronarch.spawn': [750, 59, 2.6],
    'xeno.mimic.spawn': [600, 24, 2.85],
  }

  it('每個異形 FormDef 的 unit／spawnUnit 都存在且數值正確', () => {
    const forms = [...FORMS.values()].filter((f) => f.faction === 'xeno')
    expect(forms.length).toBe(13)
    for (const f of forms) {
      const u = UNITS.get(f.unit)!
      const s = UNITS.get(f.spawnUnit!)!
      expect(u, f.unit).toBeTruthy()
      expect(s, f.spawnUnit).toBeTruthy()
      const [hp, regen, dmg, cd, range, speed] = MAIN[f.unit]
      expect([u.hp, u.hpRegen, u.attack!.dmg[0], u.attack!.cd, u.attack!.range, u.speed]).toEqual([hp, regen, dmg, cd, range, speed])
      const [shp, sdmg, sspeed] = SPAWN[f.spawnUnit!]
      expect([s.hp, s.attack!.dmg[0], s.speed]).toEqual([shp, sdmg, sspeed])
      for (const d of [u, s]) {
        expect(d.tags).toEqual(['mechanical', 'xenoForm'])
        expect(d.model).toBe(u.model)
        expect([d.mp, d.mpRegen, d.inv, d.sight, d.corpse]).toEqual([100, 0.8, 6, 14, true])
        expect(d.radius).toBeGreaterThanOrEqual(0.45)
        expect(d.radius).toBeLessThanOrEqual(0.8)
        expect(d.abilities).toContain('xeno.parasite')
      }
      expect(u.model).toBe(f.unit)
      expect(u.abilities).toContain('xeno.human')
      expect(s.abilities).toContain('xeno.spawnHuman')
      expect(s.abilities).not.toContain('xeno.egg')
      expect(u.abilities.includes('xeno.egg')).toBe(f.tier <= 2)
      // 順序：主動 → 寄生 →（下蛋）→ 人形 → 被動
      for (const d of [u, s]) {
        const kinds = d.abilities.map((a) => (ROLE_ABS.includes(a) ? 1 : ABILITIES.get(a)?.target === 'passive' ? 2 : 0))
        expect([...kinds].sort(), d.id).toEqual(kinds)
      }
    }
    expect(UNITS.get(XUNIT.timeZombie)!.tags).toContain('xenoForm')
    expect([UNITS.get(XUNIT.eldritch)!.hp, UNITS.get(XUNIT.eldritch)!.attack!.dmg[0], UNITS.get(XUNIT.eldritch)!.speed]).toEqual([350, 25, 3.2])
  })

  it('引用的技能、buff 都有註冊，圖示都是 UI 有的', () => {
    for (const d of UNITS.values()) {
      if (!d.id.startsWith('xeno.')) continue
      for (const a of d.abilities) expect(ABILITIES.has(a), `${d.id} → ${a}`).toBe(true)
    }
    const mine = [...ABILITIES.values()].filter((a) => a.id.startsWith('ab.') && Object.values(XAB).includes(a.id as never))
    expect(mine.length).toBe(Object.values(XAB).length - 1)
    for (const a of [...mine, ABILITIES.get(XAB.unmask)!]) {
      expect(ICONS.has(a.icon), a.id).toBe(true)
      expect(a.desc.zh.length).toBeGreaterThan(5)
      expect(a.desc.en.length).toBeGreaterThan(5)
    }
    for (const id of Object.values(XBF)) {
      expect(BUFFS.has(id), id).toBe(true)
      expect(ICONS.has(BUFFS.get(id)!.icon), id).toBe(true)
    }
  })
})

describe('異形技能', () => {
  it('熵渦：抽能量、灼傷、減速；能量偏折以能量抵傷', () => {
    const { h, g, spot } = setup()
    const lumen = put(g, 'xeno.lumen', spot, -3, 0, g.allPlayers()[0].slot)
    const v = put(g, 'personnel', spot, 2, 0)
    cast(lumen, XAB.entropy, { x: v.x, y: v.y })
    sec(h, 2.2)
    expect(lumen.mp).toBeLessThan(20)
    sec(h, 3)
    expect(v.mp).toBeLessThan(85)
    expect(v.hp).toBeLessThan(400)
    expect(hasBuff(v, XBF.entropy)).toBe(true)
    // 能量偏折
    const l2 = put(g, 'xeno.lumen.spawn', spot, 3, -3)
    h.ticks(1)
    damage(g, null, l2, 100)
    expect(l2.hp).toBeCloseTo(650, 0)
    expect(l2.mp).toBeCloseTo(50, 0)
  })

  it('竊觸偷走目標隨機一格道具；神經毒涎減速、機體免疫', () => {
    const { h, g, ps, spot } = setup()
    const brute = put(g, 'xeno.brute', spot, 0, 0, ps[0].slot)
    const v = put(g, 'personnel', spot, 1.6, 0)
    for (let i = 0; i < 6; i++) giveItem(g, v, makeItem('testItem' + i, 1))
    cast(brute, XAB.tentacles, v)
    sec(h, 1)
    expect(brute.inv!.filter(Boolean).length).toBe(1)
    expect(v.inv!.filter(Boolean).length).toBe(5)
    // 普攻帶神經毒
    brute.order = { k: 'attack', e: v.id }
    sec(h, 1)
    expect(hasBuff(v, XBF.neurotoxin)).toBe(true)
    expect(v.stats.speed).toBeLessThan(unitDef('personnel').speed)
    const bot = put(g, 'personnel', spot, -2, 0)
    bot.tags = new Set([...bot.tags, 'chassis'])
    g.script('xeno.neurotoxin')!(g, { caster: brute, target: bot, x: bot.x, y: bot.y, zone: bot.zone }, {})
    expect(hasBuff(bot, XBF.neurotoxin)).toBe(false)
  })

  it('時滯牢籠：清 buff、減速、無敵，並產生偽裝成目標的殘影', () => {
    const { h, g, ps, spot } = setup()
    const pup = put(g, 'xeno.puppeteer', spot, 0, 0, ps[0].slot)
    const t = place(g, g.mainOf(ps[1])!, spot, 1.6, 0)
    applyBuff(g, t, XBF.blackness)
    cast(pup, XAB.flux, t)
    sec(h, 1.3)
    expect(hasBuff(t, XBF.blackness)).toBe(false)
    expect(hasBuff(t, XBF.fluxSlow)).toBe(true)
    expect(t.stats.invuln).toBe(true)
    const echo = [...g.world.ents.values()].find((e) => e.illusion && e.data.fake?.owner === ps[1].slot)
    expect(echo).toBeTruthy()
    expect(echo!.owner).toBe(ps[0].slot)
    expect(entView(g, ps[2], echo!).o).toBe(ps[1].slot)
    sec(h, 0.5)
    expect(leaks(h)).toEqual([])
  })

  it('噤聲：目標玩家 mutedUntil 延長 60 秒', () => {
    const { h, g, ps, spot } = setup()
    const pup = put(g, 'xeno.puppeteer', spot, -2, 0, ps[0].slot)
    const t = place(g, g.mainOf(ps[1])!, spot, 2, 0)
    cast(pup, XAB.mute, t)
    sec(h, 0.5)
    expect(ps[1].mutedUntil).toBeGreaterThan(g.time + 55)
  })

  it('遠爆種：3 秒後爆炸，不產生瓦礫；焰主免疫', () => {
    const { h, g, ps, spot } = setup()
    const pyre = put(g, 'xeno.pyreheart', spot, -4, -3, ps[0].slot)
    const v = put(g, 'personnel', spot, 3, 0)
    const ally = put(g, 'xeno.pyreheart.spawn', spot, 3.5, 0.6, ps[0].slot)
    const rubble = () => [...g.world.ents.values()].filter((e) => e.tags.has('rubble')).length
    const r0 = rubble()
    cast(pyre, XAB.explosion, { x: v.x, y: v.y })
    sec(h, 2)
    expect(v.alive).toBe(true)
    sec(h, 1.5)
    expect(v.alive).toBe(false)
    expect(ally.alive).toBe(true)
    expect(ally.hp).toBe(ally.maxHp)
    expect(rubble()).toBe(r0)
  })

  it('天殛只傷非異形陣營；磁暴封鎖鎖住全站門、雷殛者可穿越', () => {
    const { h, g, ps, spot } = setup()
    const arc = put(g, 'xeno.arcflayer', spot, -4, 0, ps[0].slot)
    const v = put(g, 'personnel', spot, 3, 0)
    const friend = put(g, 'personnel', spot, 3, 1, ps[0].slot)
    cast(arc, XAB.strike, { x: v.x, y: v.y })
    sec(h, 1.6)
    expect(v.alive).toBe(false)
    expect(friend.hp).toBe(friend.maxHp)
    arc.mp = 100
    cast(arc, XAB.disrupt)
    sec(h, 4.3)
    const z = g.world.zones[spot.zone]
    const doors = z.doors.filter((d) => !d.broken)
    expect(doors.length).toBeGreaterThan(0)
    for (const d of doors) expect(d.locked).toBe(true)
    expect(Math.max(...doors.map((d) => d.lockUntil))).toBeGreaterThan(g.time + 10)
    expect(arc.data.passLocked).toBe(true)
  })

  it('墨瞳讓視野大減；疊影產生分身（30% 傷害、受傷加倍）', () => {
    const { h, g, ps, spot } = setup()
    const ph = put(g, 'xeno.phantasm', spot, 0, 0, ps[0].slot)
    const v = put(g, 'personnel', spot, 2, 0)
    cast(ph, XAB.blackness, v)
    sec(h, 2.2)
    expect(v.stats.sight).toBeLessThan(2)
    cast(ph, XAB.manifold)
    sec(h, 0.3)
    const copies = [...g.world.ents.values()].filter((e) => e.illusion && e.def.id === 'xeno.phantasm')
    expect(copies.length).toBe(1)
    const c = copies[0]
    expect(c.stats.dmgMult).toBeCloseTo(0.3)
    const before = c.hp
    damage(g, null, c, 50)
    expect(before - c.hp).toBeCloseTo(100, 0)
    // spawn 版：3 個 20%
    const sp = put(g, 'xeno.phantasm.spawn', spot, -3, -3, ps[0].slot)
    cast(sp, XAB.manifoldSpawn)
    sec(h, 0.3)
    expect([...g.world.ents.values()].filter((e) => e.illusion && e.def.id === 'xeno.phantasm.spawn').length).toBe(3)
  })

  it('石瞳：石化（暫停、無敵）並呼叫 g.petrify；人類走近 1 公尺解除', () => {
    const { h, g, ps, spot } = setup()
    const calls: boolean[] = []
    const api = g.rolesApi!
    const orig = api.petrify
    api.petrify = (u, on) => {
      calls.push(on)
      orig(u, on)
    }
    const gorgon = put(g, 'xeno.gorgon', spot, -1.8, 0, ps[0].slot)
    const t = place(g, g.mainOf(ps[1])!, spot, 0, 0)
    cast(gorgon, XAB.petrify, t)
    sec(h, 3.3)
    expect(t.data.petrified).toBe(true)
    expect(t.stats.invuln).toBe(true)
    expect(calls).toEqual([true])
    damage(g, null, t, 500)
    expect(t.hp).toBe(t.maxHp)
    place(g, g.mainOf(ps[2])!, spot, 0, 1.2)
    sec(h, 0.3)
    expect(t.data.petrified).toBe(false)
    expect(hasBuff(t, XBF.petrified)).toBe(false)
    expect(calls).toEqual([true, false])
  })

  it('群蜂電命中多個目標；核心蛻生：致死變裸核，45 秒後長回', () => {
    const { h, g, ps, spot } = setup()
    const hydra = put(g, 'xeno.hydra', spot, -3, 0, ps[0].slot)
    const vs = [0, 1, 2, 3, 4].map((i) => put(g, 'personnel', spot, 1.5 + (i % 3) * 0.9, -1 + Math.floor(i / 3) * 1.2))
    cast(hydra, XAB.swarmbolt, vs[0])
    sec(h, 0.3)
    for (const v of vs) expect(v.hp).toBeLessThan(330)
    // 核心蛻生
    damage(g, null, hydra, 5000)
    expect(hydra.alive).toBe(true)
    expect(hydra.def.id).toBe(XUNIT.core)
    expect(hydra.hp).toBe(350)
    expect(hydra.abilities).not.toContain(XAB.swarmbolt)
    sec(h, 45.5)
    expect(hydra.def.id).toBe('xeno.hydra')
    expect(hydra.abilities).toContain(XAB.swarmbolt)
  })

  it('絆絲：兩個錨點拉線，人類跨過被絆倒；亂絲噴泉傷害並黏住', () => {
    const { h, g, ps, spot } = setup()
    const weaver = put(g, 'xeno.weaver', spot, -2, 0, ps[0].slot)
    cast(weaver, XAB.webwire, { x: weaver.x, y: weaver.y })
    sec(h, 1.1)
    place(g, weaver, spot, 2, 0)
    cast(weaver, XAB.webwire, { x: weaver.x, y: weaver.y })
    sec(h, 0.2)
    const anchors = [...g.world.ents.values()].filter((e) => e.def.id === XUNIT.webAnchor)
    expect(anchors.length).toBe(2)
    expect(anchors.some((a) => a.x2?.link)).toBe(true)
    const walker = put(g, 'personnel', spot, 0, 2)
    walker.order = { k: 'move', x: spot.x, y: spot.y - 2 }
    sec(h, 1.5)
    expect(walker.hp).toBeLessThan(400)
    expect(walker.data.webTripUntil).toBeGreaterThan(0)
    // 噴泉（縮小半徑讓每團都落在目標上）
    const v = put(g, 'personnel', spot, -3, -3)
    g.script('xeno.fountain')!(g, { caster: weaver, x: v.x, y: v.y, zone: v.zone }, { waves: 2, per: 1, r: 0.2, dmg: 75 })
    sec(h, 0.6)
    expect(v.hp).toBeLessThanOrEqual(326)
    expect(hasBuff(v, XBF.webbed)).toBe(true)
  })

  it('虛空放逐到太空、再落回站內；位相置換互換位置', () => {
    const { h, g, ps, spot } = setup()
    const vw = put(g, 'xeno.voidwalker', spot, -3, 0, ps[0].slot)
    const t = put(g, 'personnel', spot, 3, 0)
    const a = { x: vw.x, y: vw.y }
    const b = { x: t.x, y: t.y }
    cast(vw, XAB.swap, t)
    sec(h, 3.3)
    expect(Math.hypot(vw.x - b.x, vw.y - b.y)).toBeLessThan(0.6)
    expect(Math.hypot(t.x - a.x, t.y - a.y)).toBeLessThan(0.6)
    const hasStation = g.world.inZone(0).some((e) => e.tags.has('station') && e.alive)
    cast(vw, XAB.relocate)
    sec(h, 4.3)
    if (hasStation) {
      expect(vw.zone).toBe(0)
      vw.cds.clear()
      cast(vw, XAB.relocate)
      sec(h, 4.3)
      expect(vw.zone).not.toBe(0)
      expect(g.world.zones[vw.zone].kind).toBe('interior')
    } else expect(Math.hypot(vw.x - b.x, vw.y - b.y)).toBeGreaterThan(0.1)
  })

  it('逆時招魂：復活死者成為異形 spawn；沒有死者時召喚遠古獸', () => {
    const { h, g, ps, spot } = setup()
    const chrono = put(g, 'xeno.chronarch', spot, 0, 0, ps[0].slot)
    chrono.anon = true
    const victim = place(g, g.mainOf(ps[1])!, spot, 1.5, 0)
    g.killEnt(victim, null, -1)
    expect(ps[1].alive).toBe(false)
    cast(chrono, XAB.revive)
    sec(h, 4.3)
    expect(ps[1].alive).toBe(true)
    expect(ps[1].spawnOf).toBe('xeno')
    expect(g.mainOf(ps[1])!.tags.has('xenoForm')).toBe(true)
    expect([...g.world.ents.values()].some((e) => e.tags.has('corpse') && e.data.slot === ps[1].slot)).toBe(false)
    chrono.cds.clear()
    chrono.mp = 100
    cast(chrono, XAB.revive)
    sec(h, 4.3)
    const beast = [...g.world.ents.values()].find((e) => e.def.id === XUNIT.eldritch)
    expect(beast).toBeTruthy()
    expect(beast!.owner).toBe(ps[0].slot)
    expect(beast!.anon).toBe(true)
  })

  it('十秒迴圈：回到 10 秒前的位置、生命，並複製回已交出的道具', () => {
    const { h, g, ps, spot } = setup()
    const chrono = put(g, 'xeno.chronarch', spot, -2, 0, ps[0].slot)
    giveItem(g, chrono, makeItem('testRelic', 3))
    const a = { x: chrono.x, y: chrono.y }
    sec(h, 1)
    // 走遠、受傷、把道具交出去
    place(g, chrono, spot, 3, 2)
    chrono.hp = 300
    chrono.inv![0] = null
    sec(h, 8)
    cast(chrono, XAB.loop)
    sec(h, 0.2)
    expect(Math.hypot(chrono.x - a.x, chrono.y - a.y)).toBeLessThan(0.5)
    expect(chrono.hp).toBeGreaterThan(840)
    expect(chrono.mp).toBeLessThan(80)
    expect(chrono.inv!.some((it) => it?.id === 'testRelic' && it.charges === 3)).toBe(true)
  })

  it('千面：化身成目標（data.fake），卸面後恢復、生命比例取平均', () => {
    const { h, g, ps, spot } = setup()
    const mimic = put(g, 'xeno.mimic', spot, -2, 0, ps[0].slot)
    mimic.anon = true
    mimic.hp = mimic.maxHp / 2
    const t = place(g, g.mainOf(ps[1])!, spot, 2, 0)
    cast(mimic, XAB.masks, t)
    sec(h, 0.7)
    const fake = mimic.data.fake as { def: string; owner: number; name: string }
    expect(fake.owner).toBe(ps[1].slot)
    expect(fake.name).toBe(t.name)
    expect(mimic.def.id).toBe(t.def.id)
    expect(mimic.abilities).toContain(XAB.unmask)
    // 其他人眼中就是目標本人；同陣營（自己）看得到真相
    const seen = entView(g, ps[2], mimic)
    expect([seen.o, seen.n, seen.d, seen.mhp]).toEqual([ps[1].slot, t.name, t.def.id, Math.round(t.maxHp)])
    expect(entView(g, ps[0], mimic).o).toBe(ps[0].slot)
    sec(h, 0.5)
    expect(leaks(h)).toEqual([])
    cast(mimic, XAB.unmask)
    sec(h, 0.2)
    expect(mimic.def.id).toBe('xeno.mimic')
    expect(mimic.data.fake).toBeFalsy()
    expect(mimic.abilities).toContain(XAB.masks)
    expect(mimic.hp / mimic.maxHp).toBeCloseTo(0.75, 1)
  })
})

