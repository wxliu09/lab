// 變種人形態／技能與仿生人機體的抽樣測試
import { describe, expect, it, vi } from 'vitest'
import { Harness } from './helpers/harness'
import { ABILITIES, BUFFS, FORMS, UNITS, unitDef } from '../../src/shared/content/registry'
import type { Game } from '../../src/sim/game'
import type { Ent } from '../../src/sim/ent'
import { issue } from '../../src/sim/systems/orders'
import { hasBuff } from '../../src/sim/systems/buffs'
import { damage } from '../../src/sim/systems/damage'
import { installMutantSystems } from '../../src/sim/scripts/mutant'
import type { StockState } from '../../src/sim/systems/vendors'

// ───────── 工具 ─────────

function setup(n = 3): { h: Harness; g: Game } {
  const { h } = Harness.started(n)
  const g = h.server.game!
  for (const p of g.allPlayers()) g.setRole(p, 'human')
  g.setRole(g.players[0], 'mutant')
  installMutantSystems(g)
  // 召喚物可能把人咬死：這裡不測勝負，別讓對局提早結束
  vi.spyOn(g, 'endGame').mockImplementation(() => {})
  // 全部人集合到 0 號的出生點附近，並清掉職業被動（回血會干擾數值檢查）
  const base = g.mainOf(g.players[0])!
  for (const p of g.allPlayers()) {
    const u = g.mainOf(p)!
    u.data.passives = []
    u.statsDirty = true
    if (p.slot !== 0) park(g, u, base)
  }
  return { h, g }
}

/** 把單位停到 base 附近一個不擋路的位置 */
function park(g: Game, u: Ent, base: Ent): void {
  const nav = g.world.zones[base.zone].nav!
  for (let r = 6; r < 20; r += 2) {
    for (let k = 0; k < 16; k++) {
      const a = (k / 16) * Math.PI * 2
      const p = nav.nearestOpen(base.x + Math.cos(a) * r, base.y + Math.sin(a) * r)
      if (p && Math.hypot(p.x - base.x, p.y - base.y) > 5) {
        g.world.relocate(u, base.zone, p.x, p.y)
        return
      }
    }
  }
}

/** 把玩家主單位換成指定形態（測試用的最小版本）*/
function become(g: Game, slot: number, defId: string): Ent {
  const p = g.players[slot]
  const old = g.mainOf(p)!
  const u = g.world.spawn(unitDef(defId), old.zone, old.x, old.y, slot)
  old.data.converted = true
  old.data.noDrops = true
  old.alive = false
  g.world.remove(old)
  u.isMain = true
  u.name = p.name
  p.main = u.id
  p.control = u.id
  return u
}

/** 找一條從 u 出發、長 d 公尺、半徑 0.6 走得通的直線，回傳終點 */
function clearPoint(g: Game, u: Ent, d: number): { x: number; y: number } {
  const nav = g.world.zones[u.zone].nav!
  for (let k = 0; k < 32; k++) {
    const a = (k / 32) * Math.PI * 2
    const x = u.x + Math.cos(a) * d
    const y = u.y + Math.sin(a) * d
    if (nav.walkable(u.x, u.y, x, y, 0.6) && nav.los(u.x, u.y, x, y)) return { x, y }
  }
  throw new Error('找不到開闊的直線')
}

function put(g: Game, e: Ent, p: { x: number; y: number }, zone = e.zone): void {
  g.world.relocate(e, zone, p.x, p.y)
  issue(e, null)
}

function crew(g: Game, slot: number): Ent {
  return g.mainOf(g.players[slot])!
}

const sec = (h: Harness, s: number) => h.ticks(Math.round(s * 20))

// ───────── 定義 ─────────

/** [hp, 回血, 平均攻擊, 攻擊 CD, 射程 m, 移速 m/s] — 研究 02 §4.3、§5.5 */
const TABLE: Record<string, [number, number, number, number, number, number]> = {
  'mut.apex': [900, 1, 37, 1, 1.4, 3.05],
  'mut.sporemother': [725, 1.5, 38, 1, 1.4, 3.05],
  'mut.sporemother.spawn': [650, 1, 32, 1, 1.4, 2.95],
  'mut.drone': [650, 1, 32, 1, 1.4, 2.95],
  'mut.blitz': [900, 1, 32, 1, 1.4, 3.2],
  'mut.brawn': [1800, 2, 100, 1, 1.4, 2.25],
  'mut.mimetic': [1000, 0.75, 32, 1, 5, 2.95],
  'mut.mimetic.spawn': [800, 0.75, 37, 1, 4, 2.8],
  'mut.spinner': [900, 0.75, 19, 0.5, 1.6, 3.2],
  'mut.spinner.spawn': [750, 0.75, 15, 0.5, 1.6, 3.2],
  'mut.lurker': [1250, 2, 124, 2.7, 24, 3.2],
  'mut.carcinid': [1400, 2.5, 150, 6, 9, 0.2],
  'mut.colossus': [6000, 0.75, 120, 1, 1.6, 2.05],
  'mut.taurus': [2400, 0.75, 85, 1, 1.6, 2.4],
  'mut.plagueQueen': [1600, 0.75, 48, 1, 1.4, 2.9],
  'mut.plagueQueen.spawn': [900, 0.75, 39, 1, 1.4, 2.8],
  'mut.broodmother': [1050, 0.75, 34, 1.1, 9, 2.9],
  'mut.broodmother.spawn': [850, 0.75, 26, 1.1, 9, 2.9],
  'mut.hiveship': [300000, 300, 9000, 3, 16, 0.6],
  'mut.hiveship.spawn': [1100, 1, 90, 3, 1.2, 2.65],
  'mut.hiveground': [16000, 4, 20, 0.5, 1.6, 0],
  'mut.hiveground.spawn': [2000, 0.75, 65, 1.5, 1.8, 2.5],
  'mut.blightcrawler': [1500, 0.75, 75, 1.5, 4.2, 3.1],
  'mut.blightcrawler.spawn': [950, 0.75, 55, 1.5, 4.2, 3.1],
  'android.bulwark': [2200, 0, 110, 3, 14, 2],
  'android.gale': [1100, 0.5, 28, 0.65, 1.2, 3.2],
  'android.pengu': [1200, 5, 5, 0.15, 19, 3.6],
}

describe('變種人與仿生人定義', () => {
  it('每個形態都有單位 def，數值照表', () => {
    const forms = [...FORMS.values()].filter((f) => f.faction === 'mutant' || f.faction === 'android')
    expect(forms.length).toBe(18)
    for (const f of forms) {
      for (const id of [f.unit, f.spawnUnit].filter((x): x is string => !!x)) {
        const d = UNITS.get(id)
        expect(d, id).toBeDefined()
        const row = TABLE[id]
        expect(row, id).toBeDefined()
        const [hp, regen, dmg, cd, range, speed] = row
        expect(d!.hp, id).toBe(hp)
        expect(d!.hpRegen, id).toBe(regen)
        expect((d!.attack!.dmg[0] + d!.attack!.dmg[1]) / 2, id).toBeCloseTo(dmg, 0)
        expect(d!.attack!.cd, id).toBe(cd)
        expect(d!.attack!.range, id).toBe(range)
        expect(d!.speed, id).toBe(speed)
        expect(d!.inv, id).toBe(6)
        expect(d!.sight, id).toBeGreaterThanOrEqual(14)
        if (f.faction === 'mutant') {
          expect(d!.tags, id).toContain('mechanical')
          expect(d!.tags, id).toContain('mutantForm')
          expect(d!.radius, id).toBeGreaterThanOrEqual(0.45)
          expect(d!.radius, id).toBeLessThanOrEqual(id === 'mut.hiveship' ? 5 : 1.2)
        } else {
          expect(d!.tags).toEqual(['mechanical', 'chassis', 'immuneToxin'])
          expect(d!.model).toBe(id)
        }
        // 所有技能都已註冊（主程式的 mut.* 機制技能若還沒寫好就略過）
        for (const a of d!.abilities) if (!a.startsWith('mut.')) expect(ABILITIES.has(a), `${id} → ${a}`).toBe(true)
      }
    }
    expect(UNITS.get('mut.carcinid')!.mp).toBe(400)
    expect(UNITS.get('mut.hiveship')!.layer).toBe('space')
    expect(UNITS.get('mut.hiveship')!.tags).toEqual(expect.arrayContaining(['space', 'station']))
  })

  it('主形態都有吞噬；完美路線 T1／T2 有啃食；感染類放在主動技能之後', () => {
    for (const f of FORMS.values()) {
      if (f.faction !== 'mutant' || f.id === 'mut.hiveship') continue
      const ab = UNITS.get(f.unit)!.abilities
      expect(ab, f.id).toContain('mut.devour')
      expect(ab.includes('mut.cannibalize'), f.id).toBe(f.branch === 'perfect' && f.tier <= 2)
      if (f.tier >= 2) expect(ab, f.id).toContain('ab.mut.roar')
    }
    expect(UNITS.get('mut.sporemother')!.abilities.at(-1)).toBe('mut.prion')
    expect(UNITS.get('mut.broodmother')!.abilities.at(-1)).toBe('mut.prion3')
    expect(UNITS.get('mut.carcinid')!.abilities.slice(-2)).toEqual(['ab.mut.crabosity', 'ab.mut.carapace'])
  })

  it('召喚物與 spawn 數值', () => {
    expect(UNITS.get('mut.spiderling')!.hp).toBe(300)
    expect(UNITS.get('mut.drone')!.speed).toBe(2.95)
    for (const id of ['mut.fleshy', 'mut.spiderling', 'mut.sporeling', 'mut.worm', 'mut.swarm', 'mut.tentacle', 'mut.carrierSack', 'mut.harbinger', 'mut.guardian', 'mut.vectorBug']) {
      const d = UNITS.get(id)
      expect(d, id).toBeDefined()
      expect(d!.tags, id).toContain('summon')
      expect(d!.inv ?? 0, id).toBe(0)
    }
    // 圖示都要是 UI 有的名稱
    const icons = new Set(
      'move stop hold attack heal bolt fire frost shield eye dna bomb grenade rocket saw plasma tentacle egg claw skull gear door card radar scan teleport clock mask web rock storm beam gun drone ship pod module hat plush pill syringe battery camera sensor key suit wrench cloak core star void infect roar evolve devour human speed'.split(' '),
    )
    for (const [id, a] of ABILITIES) if (id.startsWith('ab.mut.') || id.startsWith('ab.chassis.')) expect(icons.has(a.icon), id).toBe(true)
    for (const [id, b] of BUFFS) if (id.startsWith('bf.mut.') || id.startsWith('bf.chassis.')) expect(icons.has(b.icon), id).toBe(true)
    // 會洩漏「被變種人盯上」的 buff 不能公開
    for (const id of ['bf.mut.omniscience', 'bf.mut.carrier', 'bf.mut.vector', 'bf.mut.seizure']) expect(BUFFS.get(id)!.vis).toBe('casterFaction')
  })
})

// ───────── 技能 ─────────

describe('變種人技能', () => {
  it('腐泥噴吐：直線穿透傷害並黏滯', () => {
    const { h, g } = setup()
    const u = become(g, 0, 'mut.apex')
    const t = crew(g, 1)
    const p = clearPoint(g, u, 7)
    put(g, t, { x: u.x + (p.x - u.x) * 0.5, y: u.y + (p.y - u.y) * 0.5 })
    issue(u, { k: 'cast', a: 'ab.mut.sludge', x: p.x, y: p.y })
    sec(h, 0.7)
    expect(t.hp).toBeLessThan(t.maxHp - 40)
    expect(hasBuff(t, 'bf.mut.sludged')).toBe(true)
    expect(u.mp).toBeLessThan(95)
  })

  it('別眨眼：三秒極速；空間迸躍：閃到目標背後並造成 50 傷害', () => {
    const { h, g } = setup()
    const u = become(g, 0, 'mut.blitz')
    h.ticks(1)
    const base = u.stats.speed
    issue(u, { k: 'cast', a: 'ab.mut.dontBlink', x: u.x, y: u.y })
    h.ticks(2)
    expect(u.stats.speed).toBeGreaterThan(base * 1.5)
    sec(h, 3.2)
    expect(u.stats.speed).toBeCloseTo(base, 3)

    const t = crew(g, 1)
    put(g, t, clearPoint(g, u, 5))
    issue(u, { k: 'cast', a: 'ab.mut.spatialBurst', e: t.id })
    h.ticks(3)
    expect(Math.hypot(u.x - t.x, u.y - t.y)).toBeLessThan(2.2)
    expect(t.maxHp - t.hp).toBeCloseTo(50, 0)
  })

  it('粉碎：拆門', () => {
    const { h, g } = setup()
    const u = become(g, 0, 'mut.brawn')
    const z = g.world.zones[u.zone]
    const door = z.layout!.doors[0]
    const spot = z.nav!.nearestOpen(door.x + 1.2, door.y) ?? z.nav!.nearestOpen(door.x, door.y + 1.2)!
    put(g, u, spot)
    issue(u, { k: 'cast', a: 'ab.mut.smash', x: door.x, y: door.y })
    sec(h, 4)
    expect(z.doors[door.index].broken).toBe(true)
  })

  it('肉芽：召喚六隻、會自己去咬人', () => {
    const { h, g } = setup()
    const u = become(g, 0, 'mut.brawn')
    const t = crew(g, 1)
    put(g, t, clearPoint(g, u, 3))
    issue(u, { k: 'cast', a: 'ab.mut.fleshies', x: u.x, y: u.y })
    h.ticks(2)
    const fl = [...g.world.ents.values()].filter((e) => e.def.id === 'mut.fleshy')
    expect(fl.length).toBe(6)
    expect(fl.every((e) => e.owner === 0 && e.master === u.id)).toBe(true)
    sec(h, 4)
    expect(t.hp).toBeLessThan(t.maxHp)
    // 二十秒後腐爛
    sec(h, 18)
    expect([...g.world.ents.values()].some((e) => e.def.id === 'mut.fleshy')).toBe(false)
  })

  it('污染販賣機：抗體下架，之後非變種人陣營拿東西就感染', () => {
    const { h, g } = setup()
    const vendors = [...g.world.ents.values()].filter((e) => e.data.vendor && e.alive)
    const v = vendors.find((e) => e.data.vendor === 'medical') ?? vendors[0]
    expect(v).toBeDefined()
    const u = become(g, 0, 'mut.mimetic')
    const nav = g.world.zones[v!.zone].nav!
    put(g, u, nav.nearestOpen(v!.x, v!.y - 1.3)!, v!.zone)
    issue(u, { k: 'cast', a: 'ab.mut.taintVendor', e: v!.id })
    sec(h, 2)
    expect(v!.data.tainted).toBeDefined()
    for (const s of v!.data.stock as StockState[]) if (/antibod/i.test(s.item)) expect(s.max).toBe(0)
    const buyer = crew(g, 1)
    g.onBuy!(buyer, v!, 'traumaKit')
    expect(hasBuff(buyer, 'bf.prionStrong')).toBe(true)
    // 變種人自己拿東西不會感染
    g.onBuy!(u, v!, 'traumaKit')
    expect(hasBuff(u, 'bf.prionStrong')).toBe(false)
  })

  it('產蛛與回收：小蛛 300 HP；回收後補回牠剩下的生命', () => {
    const { h, g } = setup()
    const u = become(g, 0, 'mut.spinner')
    issue(u, { k: 'cast', a: 'ab.mut.spiderlings', x: u.x, y: u.y })
    h.ticks(2)
    const sp = [...g.world.ents.values()].find((e) => e.def.id === 'mut.spiderling')!
    expect(sp).toBeDefined()
    expect(sp.maxHp).toBe(300)
    damage(g, null, u, 500, { pure: true })
    const before = u.hp
    issue(u, { k: 'cast', a: 'ab.mut.reabsorb', e: sp.id })
    sec(h, 1)
    expect(sp.removed).toBe(true)
    expect(u.hp).toBeGreaterThan(before + 290)
  })

  it('潛獵：隱形、別人看不到；一般攻擊會現形，冷射不會', () => {
    const { h, g } = setup()
    const u = become(g, 0, 'mut.lurker')
    const t = crew(g, 1)
    put(g, t, clearPoint(g, u, 6))
    issue(u, { k: 'cast', a: 'ab.mut.stalk', x: u.x, y: u.y })
    h.ticks(3)
    expect(u.stats.stealth).toBe(true)
    expect(g.players[1].view.visible.has(u.id)).toBe(false)
    expect(u.stats.speed).toBeCloseTo(3.2 * 0.8, 2)
    issue(u, { k: 'cast', a: 'ab.mut.snipe', x: t.x, y: t.y })
    sec(h, 1)
    expect(t.hp).toBeLessThan(t.maxHp - 100)
    expect(u.stats.stealth).toBe(true)
    issue(u, { k: 'attack', e: t.id })
    sec(h, 1)
    expect(u.stats.stealth).toBe(false)
  })

  it('全知之眼：同陣營看得到目標', () => {
    const { h, g } = setup()
    const u = become(g, 0, 'mut.lurker')
    const t = crew(g, 1)
    put(g, t, clearPoint(g, u, 3))
    issue(u, { k: 'cast', a: 'ab.mut.omniscience', e: t.id })
    sec(h, 1)
    expect(hasBuff(t, 'bf.mut.omniscience')).toBe(true)
    put(g, t, g.world.zones[t.zone].nav!.nearestOpen(t.x + 0.5, t.y)!)
    sec(h, 0.6)
    expect(g.players[0].view.extraSources.some((s) => s.zone === t.zone && Math.hypot(s.x - t.x, s.y - t.y) < 0.5)).toBe(true)
  })

  it('甲蟹：移動指令改成燒能量瞬移；驚慌一次性', () => {
    const { h, g } = setup()
    const u = become(g, 0, 'mut.carcinid')
    expect(u.maxMp).toBe(400)
    const p = clearPoint(g, u, 8)
    h.ticks(2)
    g.handleCommand(0, { k: 'move', x: p.x, y: p.y })
    h.ticks(2)
    expect(Math.hypot(u.x - p.x, u.y - p.y)).toBeLessThan(1.2)
    expect(u.mp).toBeLessThan(400 - 30)
    // 驚慌：能量補滿、生命上限減半、攻擊 −33%
    issue(u, { k: 'cast', a: 'ab.mut.panic', x: u.x, y: u.y })
    h.ticks(2)
    expect(u.mp).toBeCloseTo(400, 0)
    expect(u.maxHp).toBe(700)
    expect(u.stats.dmgMult).toBeCloseTo(0.67, 2)
    expect(u.data['once:ab.mut.panic']).toBe(true)
  })

  it('甲蟹攻擊會吐出孢子', () => {
    const { h, g } = setup()
    const u = become(g, 0, 'mut.carcinid')
    const t = crew(g, 1)
    put(g, t, clearPoint(g, u, 5))
    issue(u, { k: 'attack', e: t.id })
    sec(h, 1.5)
    const sp = [...g.world.ents.values()].filter((e) => e.def.id === 'mut.sporeling')
    expect(sp.length).toBe(3)
    expect(sp.every((s) => s.tags.has('invuln'))).toBe(true)
  })

  it('落石封路：一圈 36 塊瓦礫；巨像踩碎腳下瓦礫', () => {
    const { h, g } = setup()
    const u = become(g, 0, 'mut.colossus')
    const spy = vi.spyOn(g, 'spawnRubble')
    const before = new Set([...g.world.ents.values()].filter((e) => e.tags.has('rubble')).map((e) => e.id))
    issue(u, { k: 'cast', a: 'ab.mut.rocksFall', x: u.x, y: u.y })
    h.ticks(2)
    expect(spy).toHaveBeenCalledTimes(36)
    const rubble = [...g.world.ents.values()].filter((e) => e.tags.has('rubble') && !before.has(e.id))
    expect(rubble.length).toBeGreaterThan(5)
    for (const r of rubble) expect(Math.abs(Math.hypot(r.x - u.x, r.y - u.y) - 5.12)).toBeLessThan(1.2)
    // 踩碎
    g.spawnRubble(u.zone, u.x + 1, u.y, 1, 0)
    const near = [...g.world.ents.values()].filter((e) => e.tags.has('rubble') && Math.hypot(e.x - u.x, e.y - u.y) < 2)
    sec(h, 0.5)
    expect(near.every((r) => !r.alive)).toBe(true)
  })

  it('蠻牛衝鋒：衝到目標點、撞傷並拖行沿途的人、撞開瓦礫', () => {
    const { h, g } = setup()
    const u = become(g, 0, 'mut.taurus')
    const p = clearPoint(g, u, 9)
    const t = crew(g, 1)
    const mid = { x: u.x + (p.x - u.x) * 0.45, y: u.y + (p.y - u.y) * 0.45 }
    put(g, t, mid)
    g.spawnRubble(u.zone, u.x + (p.x - u.x) * 0.75, u.y + (p.y - u.y) * 0.75, 1, 0)
    const rubble = [...g.world.ents.values()].filter((e) => e.tags.has('rubble'))
    const sx = u.x
    const sy = u.y
    issue(u, { k: 'cast', a: 'ab.mut.charge', x: p.x, y: p.y })
    sec(h, 1.5)
    expect(Math.hypot(u.x - sx, u.y - sy)).toBeGreaterThan(6)
    expect(t.maxHp - t.hp).toBeGreaterThan(60)
    expect(rubble.every((r) => !r.alive)).toBe(true)
  })

  it('滾雷：十五秒內換成震波', () => {
    const { h, g } = setup()
    const u = become(g, 0, 'mut.taurus')
    issue(u, { k: 'cast', a: 'ab.mut.rollingThunder', x: u.x, y: u.y })
    sec(h, 1.5)
    expect(u.abilities).toContain('ab.mut.shockwave')
    expect(u.abilities).not.toContain('ab.mut.rollingThunder')
    sec(h, 15)
    expect(u.abilities).toContain('ab.mut.rollingThunder')
  })

  it('全域感染：所有非變種人陣營主單位上強效朊毒', () => {
    const { h, g } = setup(4)
    const u = become(g, 0, 'mut.plagueQueen')
    // 1 號是異形本人也照樣感染（但不轉化）
    g.setRole(g.players[1], 'xeno')
    issue(u, { k: 'cast', a: 'ab.mut.totalInfection', x: u.x, y: u.y })
    h.ticks(2)
    for (const p of g.allPlayers()) {
      const m = g.mainOf(p)!
      expect(hasBuff(m, 'bf.prionStrong'), `slot ${p.slot}`).toBe(p.slot !== 0)
    }
    expect(g.players[0].stats.infections).toBe(3)
  })

  it('帶原者：目標本身不發病，靠近他的人感染繁巢株', () => {
    const { h, g } = setup()
    const u = become(g, 0, 'mut.broodmother')
    const a = crew(g, 1)
    const b = crew(g, 2)
    put(g, a, clearPoint(g, u, 4))
    issue(u, { k: 'cast', a: 'ab.mut.carrier', e: a.id })
    sec(h, 1)
    expect(hasBuff(a, 'bf.mut.carrier')).toBe(true)
    put(g, b, g.world.zones[a.zone].nav!.nearestOpen(a.x + 1, a.y)!)
    sec(h, 1)
    expect(hasBuff(b, 'bf.prionCarrier')).toBe(true)
    expect(hasBuff(a, 'bf.prionCarrier')).toBe(false)
    expect(hasBuff(u, 'bf.prionCarrier')).toBe(false)
  })

  it('病媒蟲：追上目標後反覆抽搐', () => {
    const { h, g } = setup()
    const u = become(g, 0, 'mut.plagueQueen')
    const t = crew(g, 1)
    put(g, t, clearPoint(g, u, 6))
    issue(u, { k: 'cast', a: 'ab.mut.vector', e: t.id })
    sec(h, 3)
    expect(hasBuff(t, 'bf.mut.vector')).toBe(true)
    expect([...g.world.ents.values()].some((e) => e.def.id === 'mut.vectorBug')).toBe(false)
    let stunned = 0
    for (let i = 0; i < 120; i++) {
      h.ticks(1)
      if (t.stats.stunned) stunned++
    }
    expect(stunned).toBeGreaterThan(0)
  })

  it('化蟲：十六條蟲、本體隱藏；六十秒後在活著的蟲身上重組', () => {
    const { h, g } = setup()
    const u = become(g, 0, 'mut.blightcrawler')
    issue(u, { k: 'cast', a: 'ab.mut.metamorphosis', x: u.x, y: u.y })
    h.ticks(2)
    const worms = [...g.world.ents.values()].filter((e) => e.def.id === 'mut.worm')
    expect(worms.length).toBe(16)
    expect(u.tags.has('noTarget')).toBe(true)
    expect(u.stats.invuln).toBe(true)
    expect(g.players[0].control).toBe(worms[0].id)
    // 打死一半
    for (const w of worms.slice(0, 8)) g.killEnt(w, null)
    sec(h, 61)
    expect(u.alive).toBe(true)
    expect(u.tags.has('noTarget')).toBe(false)
    expect(g.players[0].control).toBe(u.id)
    expect([...g.world.ents.values()].some((e) => e.def.id === 'mut.worm')).toBe(false)
    expect(u.hp / u.maxHp).toBeLessThan(0.6)
  })

  it('化蟲：蟲全滅本體就死', () => {
    const { h, g } = setup()
    const u = become(g, 0, 'mut.blightcrawler')
    issue(u, { k: 'cast', a: 'ab.mut.metamorphosis', x: u.x, y: u.y })
    h.ticks(2)
    for (const w of [...g.world.ents.values()].filter((e) => e.def.id === 'mut.worm')) g.killEnt(w, null)
    expect(u.alive).toBe(false)
  })

  it('腐沼：黏液足跡傷害踩到的人', () => {
    const { h, g } = setup()
    const u = become(g, 0, 'mut.blightcrawler')
    const p = clearPoint(g, u, 6)
    const t = crew(g, 1)
    issue(u, { k: 'move', x: p.x, y: p.y })
    sec(h, 2.5)
    const slimes = [...g.world.ents.values()].filter((e) => e.def.id === 'mut.slime')
    expect(slimes.length).toBeGreaterThan(2)
    put(g, t, { x: slimes[1].x, y: slimes[1].y })
    sec(h, 1.1)
    expect(t.hp).toBeLessThan(t.maxHp)
    expect(hasBuff(t, 'bf.mut.slimed')).toBe(true)
  })

  it('巢艦（地面）：EP 不足不能孕育；先驅同時只能一隻', () => {
    const { h, g } = setup()
    const u = become(g, 0, 'mut.hiveground')
    g.players[0].ep = 10
    issue(u, { k: 'cast', a: 'ab.mut.breedSwarm', x: u.x, y: u.y })
    h.ticks(2)
    expect([...g.world.ents.values()].some((e) => e.def.id === 'mut.swarm')).toBe(false)
    g.players[0].ep = 500
    issue(u, { k: 'cast', a: 'ab.mut.breedSwarm', x: u.x, y: u.y })
    issue(u, { k: 'cast', a: 'ab.mut.breedHarbinger', x: u.x, y: u.y }, true)
    sec(h, 0.5)
    expect([...g.world.ents.values()].filter((e) => e.def.id === 'mut.swarm').length).toBe(2)
    expect([...g.world.ents.values()].filter((e) => e.def.id === 'mut.harbinger').length).toBe(1)
    u.cds.clear()
    issue(u, { k: 'cast', a: 'ab.mut.breedHarbinger', x: u.x, y: u.y })
    sec(h, 0.5)
    expect([...g.world.ents.values()].filter((e) => e.def.id === 'mut.harbinger').length).toBe(1)
  })
})

describe('仿生人機體', () => {
  function chassisSetup(id: string) {
    const ctx = setup()
    ctx.g.setRole(ctx.g.players[0], 'android')
    return { ...ctx, u: become(ctx.g, 0, id) }
  }

  it('機體不會被感染', () => {
    const { g, u } = chassisSetup('android.bulwark')
    expect(u.tags.has('chassis')).toBe(true)
    g.script('mutant.totalInfection')!(g, { caster: crew(g, 1), x: 0, y: 0, zone: u.zone }, {})
    expect(hasBuff(u, 'bf.prionStrong')).toBe(false)
  })

  it('自動修復：靜止時每秒回 12，移動就中斷', () => {
    const { h, g, u } = chassisSetup('android.bulwark')
    damage(g, null, u, 1000, { pure: true })
    const hp0 = u.hp
    issue(u, { k: 'cast', a: 'ab.chassis.restore', x: u.x, y: u.y })
    sec(h, 5.2)
    // 每 0.5 秒 6 點（引擎的引導 tick 有浮點漂移，實測約 0.55 秒一次）
    expect(u.hp - hp0).toBeGreaterThanOrEqual(50)
    expect(u.hp - hp0).toBeLessThanOrEqual(66)
    const p = clearPoint(g, u, 4)
    g.handleCommand(0, { k: 'move', x: p.x, y: p.y })
    h.ticks(2)
    const hp1 = u.hp
    sec(h, 2)
    expect(u.hp).toBe(hp1)
  })

  it('稜鏡火箭：十五枚落在目標區域', () => {
    const { h, g, u } = chassisSetup('android.bulwark')
    const t = crew(g, 1)
    put(g, t, clearPoint(g, u, 8))
    const spy = vi.spyOn(g, 'emitFx')
    issue(u, { k: 'cast', a: 'ab.chassis.prismRockets', x: t.x, y: t.y })
    sec(h, 3)
    expect(spy.mock.calls.filter(([f]) => f.k === 'proj' && f.s === 'rocket' && f.e === u.id).length).toBeGreaterThanOrEqual(15)
    expect(t.hp).toBeLessThan(t.maxHp)
  })

  it('戰術核爆：延遲後大範圍爆炸，自己有防爆罩', () => {
    const { h, g, u } = chassisSetup('android.pengu')
    const t = crew(g, 1)
    put(g, t, g.world.zones[u.zone].nav!.nearestOpen(u.x + 2, u.y)!)
    issue(u, { k: 'cast', a: 'ab.chassis.nuke', x: u.x, y: u.y })
    sec(h, 2)
    expect(t.hp).toBe(t.maxHp)
    sec(h, 1.5)
    expect(t.alive).toBe(false)
    expect(u.alive).toBe(true)
    expect(u.hp).toBe(u.maxHp)
  })

  it('迴旋閃避：五秒高閃避；脈衝震波：擊飛並倒地', () => {
    const { h, g, u } = chassisSetup('android.gale')
    issue(u, { k: 'cast', a: 'ab.chassis.rotaryDodge', x: u.x, y: u.y })
    h.ticks(2)
    expect(u.stats.evade).toBeCloseTo(0.9, 5)
    sec(h, 5.2)
    expect(u.stats.evade).toBe(0)
    const t = crew(g, 1)
    const p = clearPoint(g, u, 8)
    put(g, t, { x: u.x + (p.x - u.x) * 0.4, y: u.y + (p.y - u.y) * 0.4 })
    const d0 = Math.hypot(t.x - u.x, t.y - u.y)
    issue(u, { k: 'cast', a: 'ab.chassis.pulseWave', x: p.x, y: p.y })
    sec(h, 0.5)
    expect(t.stats.stunned).toBe(true)
    expect(t.maxHp - t.hp).toBeGreaterThan(80)
    sec(h, 0.5)
    expect(Math.hypot(t.x - u.x, t.y - u.y)).toBeGreaterThan(d0 + 1)
  })
})
