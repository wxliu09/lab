// 18 套防護服：穿脫、限制與各套主要技能的抽樣測試
import { describe, expect, it } from 'vitest'
import { Harness } from './helpers/harness'
import { SUIT_IDS } from '../../src/shared/content/suits'
import { ITEMS, UNITS, abilityDef, buffDef, regUnits, unitDef } from '../../src/shared/content/registry'
import type { UnitDef } from '../../src/shared/content/types'
import { giveItem, hasItem, makeItem, morph, removeSuit } from '../../src/sim/systems/items'
import { applyBuff, getBuff, hasBuff } from '../../src/sim/systems/buffs'
import { damage } from '../../src/sim/systems/damage'
import { NEUTRAL, type Ent, type Order } from '../../src/sim/ent'
import type { Game, GamePlayer } from '../../src/sim/game'

interface Ctx {
  h: Harness
  g: Game
  p: GamePlayer
  u: Ent
}

/** 開一局、清空主單位身上的東西，並把它移到一塊開闊地（r 公尺內沒有牆）*/
function setup(r = 4): Ctx {
  const { h } = Harness.started(2)
  const g = h.server.game!
  const p = g.players[0]
  const u = g.mainOf(p)!
  if (u.suit) removeSuit(g, u)
  u.inv!.fill(null)
  u.statsDirty = true
  arena(g, u, r)
  return { h, g, p, u }
}

function arena(g: Game, u: Ent, r: number): void {
  for (const z of g.world.zones) {
    if (!z.nav || !z.layout) continue
    for (let y = r + 1; y < z.layout.h - r - 1; y++) {
      for (let x = r + 1; x < z.layout.w - r - 1; x++) {
        let ok = true
        for (let dy = -r; dy <= r && ok; dy++) for (let dx = -r; dx <= r && ok; dx++) if (z.nav.blockedAt(x + 0.5 + dx, y + 0.5 + dy)) ok = false
        if (!ok) continue
        // 附近不能有其他單位（建築、另一位玩家）干擾
        if (g.world.query(z.id, x + 0.5, y + 0.5, r + 2).some((e) => e !== u && !e.tags.has('noTarget'))) continue
        g.world.relocate(u, z.id, x + 0.5, y + 0.5)
        u.facing = 0
        return
      }
    }
  }
  throw new Error('找不到開闊地')
}

function wear(c: Ctx, id: string): void {
  const s = giveItem(c.g, c.u, makeItem(id))
  expect(s).toBeGreaterThanOrEqual(0)
  c.g.handleCommand(c.p.slot, { k: 'use', s })
  expect(c.u.def.id).toBe(id)
}

/** 在主單位旁邊（x 軸方向）放一個中立假人；hp 可調高避免被打死 */
function dummy(c: Ctx, dx: number, dy = 0, hp = 2000, defId = 'personnel'): Ent {
  const e = c.g.world.spawn(unitDef(defId), c.u.zone, c.u.x + dx, c.u.y + dy, NEUTRAL)
  e.maxHp = e.hp = hp
  e.data.noRegen = true
  return e
}

function order(u: Ent, o: Order): void {
  u.order = o
  u.queue.length = 0
}

function cast(c: Ctx, a: string, t?: Ent | { x: number; y: number }): void {
  expect(c.u.abilities).toContain(a)
  if (t && 'id' in t) order(c.u, { k: 'cast', a, e: t.id })
  else order(c.u, { k: 'cast', a, x: t?.x ?? c.u.x, y: t?.y ?? c.u.y })
}

/** 取一個異形／變種形態的單位 def（內容裡已有就用現成的，沒有就登錄測試用的）*/
function formDef(tag: 'xenoForm' | 'mutantForm'): string {
  const have = [...UNITS.values()].find((d) => d.tags.includes(tag))
  if (have) return have.id
  const id = 'test.suit.' + tag
  const d: UnitDef = { id, name: { zh: id, en: id }, model: 'xeno', hp: 800, hpRegen: 1, mp: 100, mpRegen: 0.5, speed: 3, radius: 0.5, sight: 12, abilities: [], tags: [tag, 'mechanical'], inv: 6 }
  if (!UNITS.has(id)) regUnits([d])
  return id
}

const sec = (c: Ctx, s: number) => c.h.ticks(Math.round(s * 20))
const lost = (e: Ent) => e.maxHp - e.hp
const ents = (g: Game, def: string) => [...g.world.ents.values()].filter((e) => e.def.id === def && e.alive)

describe('防護服資料', () => {
  it('18 套著裝單位、道具與技能都有登錄且符合規格', () => {
    expect(SUIT_IDS.length).toBe(18)
    expect(new Set(SUIT_IDS).size).toBe(18)
    for (const id of SUIT_IDS) {
      const d = unitDef(id)
      expect(d.tags).toEqual(['personnel', 'suit'])
      expect(d.model).toBe('human')
      expect(d.inv).toBe(6)
      expect(d.abilities.at(-1)).toBe('suit.drop')
      const actives = d.abilities.filter((a) => abilityDef(a)?.target !== 'passive' && a !== 'suit.drop')
      expect(actives.length).toBeLessThanOrEqual(5)
      for (const a of d.abilities) {
        const ab = abilityDef(a)
        expect(ab, a).toBeTruthy()
        expect(ab!.name.zh && ab!.name.en && ab!.desc.zh && ab!.desc.en).toBeTruthy()
        for (const ef of ab!.effects) if (ef.k === 'buff') expect(buffDef(ef.buff), ef.buff).toBeTruthy()
      }
      const it = ITEMS.get(id)!
      expect(it).toBeTruthy()
      expect(it.suit).toBe(id)
      expect(it.cat).toBe('suit')
      expect(it.charges).toBe(0)
      expect(it.icon).toBe('suit')
    }
    // 內容總表抽查（射程、移速 ÷100）
    expect(unitDef('suit.operative').hp).toBe(650)
    expect(unitDef('suit.operative').attack!.range).toBe(14)
    expect(unitDef('suit.force').attack!.range).toBe(18)
    expect(unitDef('suit.pyro').attack!.cd).toBe(0.24)
    expect(unitDef('suit.tesla').speed).toBe(2.8)
    expect(unitDef('suit.labcoat').speed).toBe(2.95)
  })
})

describe('穿脫防護服', () => {
  it('每一套都能穿上（HP% 保留）並脫回船員、道具回到背包', () => {
    const c = setup()
    const { g, p, u, h } = c
    for (const id of SUIT_IDS) {
      u.hp = u.maxHp * 0.5
      wear(c, id)
      expect(u.maxHp).toBe(unitDef(id).hp)
      expect(u.hp / u.maxHp).toBeCloseTo(0.5, 3)
      expect(u.suit?.id).toBe(id)
      expect(hasItem(u, id)).toBe(false)
      expect(u.abilities).toContain('suit.drop')
      g.handleCommand(p.slot, { k: 'cast', a: 'suit.drop' })
      h.ticks(2)
      expect(u.def.id).toBe('personnel')
      expect(u.suit).toBeNull()
      expect(hasItem(u, id)).toBe(true)
      expect(u.hp / u.maxHp).toBeCloseTo(0.5, 2)
      u.inv![u.inv!.findIndex((it) => it?.id === id)] = null
      // 脫衣技能冷卻 1 秒
      h.ticks(21)
    }
  })

  it('已穿著時換穿另一套：舊的回到背包', () => {
    const c = setup()
    wear(c, 'suit.tesla')
    wear(c, 'suit.cryo')
    expect(hasItem(c.u, 'suit.tesla')).toBe(true)
    expect(c.u.suit?.id).toBe('suit.cryo')
  })

  it('異形／變種形態不能穿防護服', () => {
    const c = setup()
    const { g, p, u } = c
    for (const form of [formDef('xenoForm'), formDef('mutantForm')]) {
      morph(g, u, form)
      const s = giveItem(g, u, makeItem('suit.rocket'))
      g.handleCommand(p.slot, { k: 'use', s })
      expect(u.def.id).toBe(form)
      expect(u.suit).toBeNull()
      expect(u.inv![s]?.id).toBe('suit.rocket')
      u.inv![s] = null
    }
  })
})

describe('防護服技能', () => {
  it('特斯拉裝：蓄電 5 秒後電弧傷害身旁並強化下一擊；雷暴電擊最近單位但不電特斯拉裝', () => {
    const c = setup()
    wear(c, 'suit.tesla')
    const d = dummy(c, 1.5)
    cast(c, 'ab.tesla.charge')
    sec(c, 4.5)
    expect(lost(d)).toBe(0)
    sec(c, 0.8)
    expect(lost(d)).toBe(150)
    expect(hasBuff(c.u, 'bf.tesla.charged')).toBe(true)
    order(c.u, { k: 'attack', e: d.id })
    sec(c, 1.5)
    expect(hasBuff(c.u, 'bf.tesla.charged')).toBe(false)
    expect(lost(d)).toBeGreaterThanOrEqual(150 + 200 + 40)
    // 雷暴
    c.u.order = null
    const far = dummy(c, 3.5, 0)
    const hp0 = lost(far)
    const selfHp = c.u.hp
    cast(c, 'ab.tesla.storm', { x: far.x - 0.5, y: far.y })
    sec(c, 4)
    expect(ents(c.g, 'rig.teslaStorm').length).toBe(1)
    expect(lost(far)).toBeGreaterThan(hp0 + 60)
    expect(c.u.hp).toBeGreaterThanOrEqual(selfHp)
    sec(c, 6)
    expect(ents(c.g, 'rig.teslaStorm').length).toBe(0)
  })

  it('火箭裝：手持飛彈在落點爆炸；普攻有範圍傷害', () => {
    const c = setup()
    wear(c, 'suit.rocket')
    const d = dummy(c, 4)
    const d2 = dummy(c, 4, 0.8)
    cast(c, 'ab.rocket.missile', { x: d.x, y: d.y })
    sec(c, 1)
    expect(lost(d)).toBe(90)
    expect(lost(d2)).toBe(90)
    const before = lost(d2)
    order(c.u, { k: 'attack', e: d.id })
    sec(c, 1.5)
    expect(lost(d2)).toBeGreaterThan(before)
  })

  it('冷凍裝：普攻減速、急凍衝擊讓周圍無法攻擊', () => {
    const c = setup()
    wear(c, 'suit.cryo')
    const d = dummy(c, 3)
    order(c.u, { k: 'attack', e: d.id })
    sec(c, 1)
    expect(hasBuff(d, 'bf.cryo.chill')).toBe(true)
    expect(d.stats.speed).toBeCloseTo(unitDef('personnel').speed * 0.8, 3)
    c.u.order = null
    const near = dummy(c, 0, 2)
    cast(c, 'ab.cryo.shock')
    sec(c, 0.2)
    expect(hasBuff(near, 'bf.cryo.shock')).toBe(true)
    expect(near.stats.disarmed).toBe(true)
    expect(hasBuff(c.u, 'bf.cryo.shock')).toBe(false)
  })

  it('電漿裝：電漿球 1.5 秒後在腳邊爆炸，施放者不受傷', () => {
    const c = setup()
    wear(c, 'suit.plasma')
    const d = dummy(c, 0.6)
    const hp = c.u.hp
    cast(c, 'ab.plasma.ball')
    sec(c, 1.2)
    expect(lost(d)).toBe(0)
    expect(ents(c.g, 'rig.plasmaBall').length).toBe(1)
    sec(c, 0.6)
    expect(lost(d)).toBe(100)
    expect(c.u.hp).toBeGreaterThanOrEqual(hp)
  })

  it('電漿裝：物質汲取器持續抽血，離太遠就斷線', () => {
    const c = setup(5)
    wear(c, 'suit.plasma')
    const d = dummy(c, 3)
    cast(c, 'ab.plasma.drain', d)
    sec(c, 2.1)
    expect(ents(c.g, 'rig.drainer').length).toBe(1)
    expect(lost(d)).toBeGreaterThanOrEqual(30)
    c.g.world.relocate(d, d.zone, c.u.x + 0.5, c.u.y + 4.5 + 6)
    sec(c, 1)
    expect(hasBuff(d, 'bf.plasma.drain')).toBe(false)
    expect(ents(c.g, 'rig.drainer').length).toBe(0)
  })

  it('火焰裝：過熱提高攻速，結束後排汽變慢；熾焰投射留下火海', () => {
    const c = setup()
    wear(c, 'suit.pyro')
    cast(c, 'ab.pyro.overheat')
    sec(c, 0.2)
    expect(c.u.stats.atkSpeed).toBeCloseTo(3.5, 3)
    sec(c, 6)
    expect(hasBuff(c.u, 'bf.pyro.overheat')).toBe(false)
    expect(hasBuff(c.u, 'bf.pyro.vent')).toBe(true)
    expect(c.u.stats.atkSpeed).toBeCloseTo(0.35, 3)
    sec(c, 4.2)
    const d = dummy(c, 4)
    c.u.mp = 100
    cast(c, 'ab.pyro.kidot', { x: d.x, y: d.y })
    sec(c, 4)
    expect(ents(c.g, 'rig.fireField').length).toBe(1)
    expect(lost(d)).toBeGreaterThan(80 + 20)
  })

  it('光子裝：致盲讓目標傷害減半；螢火蟲飛往目標點', () => {
    const c = setup()
    wear(c, 'suit.photon')
    const d = dummy(c, 3)
    cast(c, 'ab.photon.blind', d)
    sec(c, 0.2)
    expect(d.stats.dmgMult).toBeCloseTo(0.5, 5)
    cast(c, 'ab.rig.firefly', { x: c.u.x + 3, y: c.u.y + 3 })
    sec(c, 2)
    const f = ents(c.g, 'rig.firefly')
    expect(f.length).toBe(1)
    expect(Math.hypot(f[0].x - (c.u.x + 3), f[0].y - (c.u.y + 3))).toBeLessThan(0.6)
  })

  it('服務裝：焊槍修理機械，對異形無效', () => {
    const c = setup()
    wear(c, 'suit.service')
    const con = c.g.world.spawn(unitDef('struct.console'), c.u.zone, c.u.x + 1.4, c.u.y, NEUTRAL)
    con.hp = con.maxHp - 500
    cast(c, 'ab.rig.weld', con)
    sec(c, 0.3)
    expect(con.maxHp - con.hp).toBe(460)
    const xeno = dummy(c, 0, 1.2, 800, formDef('xenoForm'))
    xeno.hp = 300
    cast(c, 'ab.rig.weld', xeno)
    sec(c, 0.6)
    expect(xeno.hp).toBe(300)
  })

  it('暗物質裝：普攻削能量；受擊時自動相位化 1 秒', () => {
    const c = setup()
    wear(c, 'suit.void')
    const d = dummy(c, 3)
    order(c.u, { k: 'attack', e: d.id })
    sec(c, 1.4)
    expect(d.mp).toBeLessThan(d.maxMp)
    c.u.order = null
    const mp = c.u.mp
    damage(c.g, d, c.u, 30)
    expect(hasBuff(c.u, 'bf.void.phase')).toBe(true)
    expect(c.u.mp).toBeCloseTo(mp - 15, 3)
    sec(c, 0.1)
    const hp = c.u.hp
    damage(c.g, d, c.u, 100)
    expect(c.u.hp).toBe(hp)
    sec(c, 1.2)
    damage(c.g, d, c.u, 100)
    expect(c.u.hp).toBeLessThan(hp)
    expect(hasBuff(c.u, 'bf.void.phase')).toBe(false)
  })

  it('幻影裝：分身外觀相同但打不出傷害；換位交換位置', () => {
    const c = setup(5)
    wear(c, 'suit.mirage')
    const d = dummy(c, 4)
    cast(c, 'ab.mirage.double', { x: c.u.x, y: c.u.y - 3 })
    sec(c, 0.2)
    const dbl = ents(c.g, 'suit.mirage').find((e) => e !== c.u)!
    expect(dbl).toBeTruthy()
    expect(dbl.illusion).toBe(true)
    expect(dbl.name).toBe(c.u.name)
    expect(dbl.inv).toBeNull()
    expect(dbl.abilities).toEqual([])
    order(dbl, { k: 'attack', e: d.id })
    sec(c, 3)
    expect(lost(d)).toBe(0)
    dbl.order = null
    const a = { x: c.u.x, y: c.u.y }
    const b = { x: dbl.x, y: dbl.y }
    c.u.mp = 100
    cast(c, 'ab.mirage.swap')
    sec(c, 4.2)
    expect(c.u.x).toBeCloseTo(b.x, 3)
    expect(c.u.y).toBeCloseTo(b.y, 3)
    expect(dbl.x).toBeCloseTo(a.x, 3)
    // 分身消失不留屍體
    c.g.killEnt(dbl, null)
    expect(ents(c.g, 'corpse').filter((e) => e.data.of === 'suit.mirage').length).toBe(0)
  })

  it('輻射裝：持續傷害周遭單位（含友軍）；核心過載自傷並留下污染區', () => {
    const c = setup()
    wear(c, 'suit.rad')
    const ally = dummy(c, 2)
    ally.owner = c.g.players[1].slot
    sec(c, 3.1)
    expect(lost(ally)).toBeGreaterThanOrEqual(5)
    const other = dummy(c, 0, 2.5)
    morph(c.g, other, 'suit.rad')
    other.maxHp = other.hp = 2000
    sec(c, 2)
    expect(lost(other)).toBe(0)
    const hp = c.u.hp
    cast(c, 'ab.rad.overload')
    sec(c, 4.2)
    expect(c.u.hp).toBeLessThanOrEqual(hp - 140)
    expect(ents(c.g, 'rig.radZone').length).toBe(1)
    const before = lost(ally)
    sec(c, 1)
    expect(lost(ally) - before).toBeGreaterThan(15)
  })

  it('特務裝：遙控雷最多 4 枚，引爆時傷害範圍內單位', () => {
    const c = setup()
    wear(c, 'suit.operative')
    const d = dummy(c, 3)
    for (let i = 0; i < 5; i++) {
      c.u.mp = 100
      cast(c, 'ab.rig.rdgToss', { x: d.x, y: d.y })
      sec(c, 0.5)
    }
    sec(c, 1)
    expect(ents(c.g, 'rig.rdg').length).toBe(4)
    cast(c, 'ab.rig.rdgDetonate')
    sec(c, 0.7)
    expect(ents(c.g, 'rig.rdg').length).toBe(0)
    expect(lost(d)).toBe(4 * 75)
  })

  it('特務裝／力場裝：動能衝刺衝到目標點並撞開路上的人', () => {
    const c = setup(5)
    wear(c, 'suit.operative')
    const d = dummy(c, 2)
    const x0 = c.u.x
    cast(c, 'ab.rig.rush', { x: c.u.x + 4.5, y: c.u.y })
    sec(c, 1)
    expect(c.u.x - x0).toBeGreaterThan(4)
    expect(lost(d)).toBe(30)
  })

  it('研究白袍：物理學互換位置並讓目標無敵；化學增傷', () => {
    const c = setup()
    wear(c, 'suit.labcoat')
    const d = dummy(c, 3)
    const a = { x: c.u.x, y: c.u.y }
    const b = { x: d.x, y: d.y }
    cast(c, 'ab.labcoat.physics', d)
    sec(c, 0.2)
    expect(c.u.x).toBeCloseTo(b.x, 3)
    expect(d.x).toBeCloseTo(a.x, 3)
    expect(d.stats.invuln).toBe(true)
    sec(c, 3.2)
    expect(d.stats.invuln).toBe(false)
    cast(c, 'ab.labcoat.chemistry', d)
    sec(c, 1)
    expect(d.stats.dmgTaken).toBeCloseTo(1.17, 5)
  })

  it('警衛裝：能量輸送以自身 50 HP 換目標 150 HP；吸收力場讓身邊的人無敵', () => {
    const c = setup()
    wear(c, 'suit.guard')
    const d = dummy(c, 2, 0, 400)
    d.hp = 100
    const hp = c.u.hp
    cast(c, 'ab.guard.transfer', d)
    sec(c, 0.2)
    expect(d.hp).toBe(250)
    expect(c.u.hp).toBeCloseTo(hp - 50, 0)
    const near = dummy(c, 0.9)
    c.u.mp = 100
    cast(c, 'ab.guard.absorb')
    sec(c, 0.5)
    expect(near.stats.invuln).toBe(true)
    expect(c.u.stats.invuln).toBe(false)
    const nhp = near.hp
    damage(c.g, null, near, 200)
    expect(near.hp).toBe(nhp)
    c.u.order = { k: 'move', x: c.u.x - 3, y: c.u.y }
    sec(c, 1)
    expect(near.stats.invuln).toBe(false)
  })

  it('酸蝕裝：酸液持續傷害；毒雲讓雲裡的人無法攻擊與施法', () => {
    const c = setup()
    wear(c, 'suit.acid')
    const d = dummy(c, 4)
    order(c.u, { k: 'attack', e: d.id })
    sec(c, 1)
    expect(hasBuff(d, 'bf.acid.corrode')).toBe(true)
    c.u.order = null
    cast(c, 'ab.acid.cloud', { x: d.x, y: d.y })
    sec(c, 0.5)
    expect(d.stats.disarmed).toBe(true)
    expect(d.stats.silenced).toBe(true)
    expect(c.u.stats.silenced).toBe(false)
  })

  it('機槍裝：架設後子彈追加傷害，移動就解除', () => {
    const c = setup()
    wear(c, 'suit.gatling')
    const d = dummy(c, 3)
    cast(c, 'ab.gatling.setup')
    sec(c, 1.2)
    expect(hasBuff(c.u, 'bf.gatling.setup')).toBe(true)
    const base = lost(d)
    order(c.u, { k: 'attack', e: d.id })
    sec(c, 1)
    const braced = lost(d) - base
    expect(hasBuff(c.u, 'bf.gatling.setup')).toBe(true)
    c.u.order = { k: 'move', x: c.u.x, y: c.u.y + 2 }
    sec(c, 0.6)
    expect(hasBuff(c.u, 'bf.gatling.setup')).toBe(false)
    c.u.order = null
    sec(c, 0.5)
    const b2 = lost(d)
    order(c.u, { k: 'attack', e: d.id })
    sec(c, 1)
    expect(lost(d) - b2).toBeLessThan(braced)
  })

  it('力場裝：衝擊波推開目標，反轉極性後改成拉近', () => {
    const c = setup(6)
    wear(c, 'suit.force')
    const d = dummy(c, 3)
    order(c.u, { k: 'attack', e: d.id })
    sec(c, 0.8)
    c.u.order = null
    sec(c, 0.5)
    const pushed = d.x - c.u.x
    expect(pushed).toBeGreaterThan(3.8)
    cast(c, 'ab.force.polarity')
    sec(c, 1.2)
    expect(hasBuff(c.u, 'bf.force.pull')).toBe(true)
    order(c.u, { k: 'attack', e: d.id })
    sec(c, 0.8)
    c.u.order = null
    sec(c, 0.5)
    expect(d.x - c.u.x).toBeLessThan(pushed - 0.8)
  })

  it('磁力裝：普攻留下碎片，引爆依層數造成傷害；金屬塊可以被甩出去撞人', () => {
    const c = setup(6)
    wear(c, 'suit.mag')
    const d = dummy(c, 3)
    order(c.u, { k: 'attack', e: d.id })
    sec(c, 3.3)
    c.u.order = null
    const b = getBuff(d, 'bf.mag.sliv')!
    expect(b.stacks).toBeGreaterThanOrEqual(2)
    const n = b.stacks
    const before = lost(d)
    cast(c, 'ab.mag.detonate')
    sec(c, 0.2)
    expect(hasBuff(d, 'bf.mag.sliv')).toBe(false)
    expect(lost(d) - before).toBe(30 * n)
    // 金屬塊
    const t = dummy(c, 0, -4)
    c.u.mp = 100
    cast(c, 'ab.mag.metal', { x: c.u.x, y: c.u.y - 1.5 })
    sec(c, 0.3)
    expect(ents(c.g, 'rig.metal').length).toBe(1)
    const tb = lost(t)
    cast(c, 'ab.mag.thrust', { x: c.u.x, y: c.u.y - 6 })
    sec(c, 1.2)
    expect(lost(t) - tb).toBe(100)
  })

  it('脈衝裝：連續射擊後傷害下降；能量庫產生能量並可被汲取', () => {
    const c = setup()
    wear(c, 'suit.pulse')
    const d = dummy(c, 2, 0, 100000)
    sec(c, 0.5)
    order(c.u, { k: 'attack', e: d.id })
    sec(c, 0.5)
    const early = lost(d)
    sec(c, 3)
    const mid = lost(d)
    sec(c, 0.5)
    const late = lost(d) - mid
    expect(late).toBeLessThan(early * 0.7)
    c.u.order = null
    cast(c, 'ab.pulse.bank')
    sec(c, 1.8)
    const bank = ents(c.g, 'rig.energyBank')[0]
    expect(bank).toBeTruthy()
    sec(c, 4)
    expect(bank.mp).toBeGreaterThan(10)
    c.u.mp = 10
    const bm = bank.mp
    cast(c, 'ab.pulse.siphon', bank)
    sec(c, 1.5)
    expect(c.u.mp).toBeGreaterThan(15)
    expect(bank.mp).toBeLessThan(bm)
    // 打爆能量庫 → 電磁脈衝沉默附近的人
    c.u.order = null
    sec(c, 0.1)
    damage(c.g, d, bank, 500)
    expect(bank.alive).toBe(false)
    expect(hasBuff(c.u, 'bf.pulse.emp')).toBe(true)
  })

  it('脫下特定服裝時清掉只屬於那套的自身狀態', () => {
    const c = setup()
    wear(c, 'suit.force')
    applyBuff(c.g, c.u, 'bf.force.pull', undefined, c.u)
    c.g.handleCommand(c.p.slot, { k: 'cast', a: 'suit.drop' })
    c.h.ticks(2)
    expect(c.u.def.id).toBe('personnel')
    expect(hasBuff(c.u, 'bf.force.pull')).toBe(false)
  })
})
