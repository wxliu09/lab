// 一般道具、販賣機、職業技能：抽樣測試
import { describe, expect, it } from 'vitest'
import { Harness, type FakeClient } from './helpers/harness'
import { ITEMS, VENDORS, abilityDef, buffDef, unitDef } from '../../src/shared/content/registry'
import { CLASS_LIST } from '../../src/shared/content/classes'
import { RUMMAGE_TABLE } from '../../src/shared/content/items'
import { DOOR_REACH } from '../../src/shared/content/classAbilities'
import { giveItem, hasItem, makeItem, removeSuit } from '../../src/sim/systems/items'
import { initVendor, type StockState } from '../../src/sim/systems/vendors'
import { applyBuff, getBuff, hasBuff } from '../../src/sim/systems/buffs'
import { damage } from '../../src/sim/systems/damage'
import { SCRIPTS } from '../../src/sim/systems/effects'
import { itemRuntime } from '../../src/sim/scripts/items'
import { NEUTRAL, type Ent } from '../../src/sim/ent'
import type { Game, GamePlayer } from '../../src/sim/game'
import { EntFlag, type FxEvent } from '../../src/shared/protocol/messages'
import type { Effect } from '../../src/shared/content/types'

interface Ctx {
  h: Harness
  cs: FakeClient[]
  g: Game
  p: GamePlayer
  u: Ent
}

function setup(): Ctx {
  const { h, cs } = Harness.started(2)
  const g = h.server.game!
  itemRuntime(g)
  const p = g.players[0]
  const u = g.mainOf(p)!
  if (u.suit) removeSuit(g, u)
  u.inv!.fill(null)
  u.data.noRegen = true
  u.statsDirty = true
  return { h, cs, g, p, u }
}

const sec = (c: Ctx, s: number) => c.h.ticks(Math.round(s * 20))
const ents = (g: Game, def: string) => [...g.world.ents.values()].filter((e) => e.def.id === def && e.alive)
const chatOf = (c: FakeClient) => c.inbox.flatMap((m) => (m.t === 'chat' ? m.lines.map((l) => l.text) : []))
const fxOf = (c: FakeClient): FxEvent[] => c.snaps.flatMap((s) => s.fx ?? [])

function doorDist(g: Game, zone: number, x: number, y: number): number {
  let best = Infinity
  for (const d of g.world.zones[zone].layout?.doors ?? []) best = Math.min(best, Math.hypot(d.x - x, d.y - y) - d.width / 2)
  return best
}

/** 找一塊 r 公尺內沒有牆、沒有其他單位、附近沒有門的空地，把 u 移過去 */
function arena(c: Ctx, r = 5): void {
  const { g, u } = c
  for (const z of g.world.zones) {
    if (!z.nav || !z.layout) continue
    for (let y = r + 1; y < z.layout.h - r - 1; y++) {
      for (let x = r + 1; x < z.layout.w - r - 1; x++) {
        const cx = x + 0.5
        const cy = y + 0.5
        let ok = true
        for (let dy = -r; dy <= r && ok; dy++) for (let dx = -r; dx <= r && ok; dx++) if (z.nav.blockedAt(cx + dx, cy + dy)) ok = false
        if (!ok || doorDist(g, z.id, cx, cy) < r + 3) continue
        if (g.world.query(z.id, cx, cy, r + 2).some((e) => e !== u && !e.tags.has('noTarget'))) continue
        g.world.relocate(u, z.id, cx, cy)
        u.facing = 0
        return
      }
    }
  }
  throw new Error('找不到空地')
}

function dummy(c: Ctx, dx: number, dy = 0, hp = 2000): Ent {
  const e = c.g.world.spawn(unitDef('personnel'), c.u.zone, c.u.x + dx, c.u.y + dy, NEUTRAL)
  e.maxHp = e.hp = hp
  e.data.noRegen = true
  return e
}

/** 把背包第一格換成指定道具並使用 */
function useItem(c: Ctx, id: string, target?: { x: number; y: number } | Ent): number {
  const s = giveItem(c.g, c.u, makeItem(id))
  expect(s).toBeGreaterThanOrEqual(0)
  if (target && 'id' in target) c.g.handleCommand(c.p.slot, { k: 'use', s, e: target.id })
  else c.g.handleCommand(c.p.slot, { k: 'use', s, x: target?.x, y: target?.y })
  return s
}

function vendorOf(g: Game, ref: string): Ent {
  const v = [...g.world.ents.values()].find((e) => e.data.vendor === ref)
  if (!v) throw new Error('找不到販賣機 ' + ref)
  if (!v.data.stock) initVendor(g, v)
  return v
}

const stockOf = (v: Ent, item: string) => (v.data.stock as StockState[]).find((s) => s.item === item)!

/** 把 u 放到離 (x, y) 約 dist 公尺、看得到該點的空地 */
function standNear(c: Ctx, x: number, y: number, dist: number): void {
  const z = c.g.world.zones[c.u.zone]
  for (const d of [dist, dist - 0.4, dist + 0.4, dist - 0.8]) {
    for (let i = 0; i < 16; i++) {
      const a = (i / 16) * Math.PI * 2
      const px = x + Math.cos(a) * d
      const py = y + Math.sin(a) * d
      if (z.nav!.circleBlocked(px, py, 0.45) || !z.nav!.los(px, py, x, y, true)) continue
      c.g.world.relocate(c.u, c.u.zone, px, py)
      return
    }
  }
  throw new Error('找不到站位')
}

/** 找一扇沒上鎖的門與門邊的站位 */
function nearDoor(c: Ctx): { index: number; x: number; y: number } {
  const z = c.g.world.zones[c.u.zone]
  for (const d of z.layout!.doors) {
    const st = z.doors[d.index]
    if (st.locked || st.broken || st.clearance) continue
    const off = d.horizontal ? [[0, 1.6], [0, -1.6]] : [[1.6, 0], [-1.6, 0]]
    for (const [dx, dy] of off) {
      const x = d.x + dx
      const y = d.y + dy
      if (z.nav!.circleBlocked(x, y, 0.45) || z.nav!.doorOf[z.nav!.idx(x, y)] >= 0) continue
      c.g.world.relocate(c.u, z.id, x, y)
      return { index: d.index, x, y }
    }
  }
  throw new Error('找不到門')
}

describe('內容資料', () => {
  it('職業表引用的道具、技能、被動都存在，所有道具技能與販賣機商品都有定義', () => {
    for (const cl of CLASS_LIST) {
      for (const it of cl.items) if (!it.startsWith('suit.')) expect(ITEMS.has(it), it).toBe(true)
      for (const a of cl.abilities) expect(abilityDef(a), a).toBeTruthy()
      for (const b of cl.passives) expect(buffDef(b), b).toBeTruthy()
    }
    for (const d of ITEMS.values()) {
      if (d.passive) expect(buffDef(d.passive), d.passive).toBeTruthy()
      if (d.use) expect(abilityDef(d.use), d.use).toBeTruthy()
    }
    // 道具與職業技能引用的 script（含巢狀的 projectile／delay）都已註冊
    const walk = (efs: readonly Effect[]): void => {
      for (const ef of efs) {
        if (ef.k === 'script') expect(SCRIPTS.has(ef.fn), ef.fn).toBe(true)
        if (ef.k === 'projectile') walk(ef.onHit)
        if (ef.k === 'delay') walk(ef.then)
      }
    }
    for (const d of ITEMS.values()) walk((d.use ? abilityDef(d.use)?.effects : undefined) ?? [])
    for (const cl of CLASS_LIST) for (const a of cl.abilities) walk(abilityDef(a)?.effects ?? [])
    for (const v of VENDORS.values()) for (const s of v.stock) if (!s.item.startsWith('suit.')) expect(ITEMS.has(s.item), `${v.id}:${s.item}`).toBe(true)
    // 感染類 buff 不得公開
    for (const id of ['bf.antibody', 'bf.containedParasite', 'bf.containedPrion']) expect(buffDef(id)!.vis).not.toBe('all')
    // 原作 1.8.2 拿不到、本作放進販賣機的三樣
    expect(VENDORS.get('outpost')!.stock.map((s) => s.item)).toEqual(expect.arrayContaining(['sentryTurret', 'forceBarrier']))
    expect(VENDORS.get('medical')!.stock.map((s) => s.item)).toContain('rapidRevive')
  })
})

describe('醫療與充能', () => {
  it('急救包回復 200 並消耗充能，兩次用完就消失', () => {
    const c = setup()
    const { g, u } = c
    u.hp = 100
    const s = useItem(c, 'traumaKit')
    sec(c, 0.2)
    expect(u.hp).toBeCloseTo(300, 0)
    expect(u.inv![s]!.charges).toBe(1)
    // 冷卻中再按不會生效
    u.hp = 100
    g.handleCommand(c.p.slot, { k: 'use', s })
    sec(c, 0.2)
    expect(u.hp).toBe(100)
    sec(c, 20)
    g.handleCommand(c.p.slot, { k: 'use', s })
    sec(c, 0.2)
    expect(u.hp).toBeCloseTo(300, 0)
    expect(u.inv![s]).toBeNull()
  })

  it('基因檢測器每人只能帶一個', () => {
    const c = setup()
    giveItem(c.g, c.u, makeItem('geneSampler'))
    expect(giveItem(c.g, c.u, makeItem('geneSampler'))).toBe(-1)
    expect(c.u.inv!.filter((it) => it?.id === 'geneSampler').length).toBe(1)
    sec(c, 0.1)
    expect(chatOf(c.cs[0])).toContain('@item.uniqueOnly')
  })

  it('抗體包把寄生轉成受控（保留感染來源）並給 46 秒免疫', () => {
    const c = setup()
    const { g, u } = c
    if (!buffDef('bf.parasite')) return
    const q = g.mainOf(g.players[1])!
    applyBuff(g, u, 'bf.parasite', undefined, q)
    useItem(c, 'antibodyKit')
    sec(c, 0.2)
    expect(hasBuff(u, 'bf.parasite')).toBe(false)
    expect(getBuff(u, 'bf.containedParasite')?.srcSlot).toBe(q.owner)
    expect(hasBuff(u, 'bf.antibody')).toBe(true)
    expect(applyBuff(g, u, 'bf.parasite', undefined, q)).toBeNull()
    sec(c, 47)
    expect(hasBuff(u, 'bf.containedParasite')).toBe(false)
    expect(hasBuff(u, 'bf.antibody')).toBe(false)
  })

  it('急速治療器：45 秒內死亡的人可以救回，超過就救不回來（退還道具）', () => {
    const { h, cs } = Harness.started(4)
    const g = h.server.game!
    itemRuntime(g)
    // 被害者挑人類船員，避免死亡觸發勝負判定
    const victim = g.allPlayers().find((q) => g.faction(q) === 'crew' && q.role === 'human')!
    const medic = g.allPlayers().find((q) => q !== victim)!
    const m = g.mainOf(medic)!
    const c: Ctx = { h, cs, g, p: medic, u: m }
    if (m.suit) removeSuit(g, m)
    m.inv!.fill(null)
    arena(c, 5)
    const kill = () => {
      const v = g.mainOf(victim)!
      if (v.suit) removeSuit(g, v)
      v.inv!.fill(null)
      g.world.relocate(v, m.zone, m.x + 1.5, m.y)
      damage(g, null, v, 99999, { pure: true, lethal: true })
      expect(victim.alive).toBe(false)
      return ents(g, 'corpse').find((e) => e.data.slot === victim.slot)!
    }
    const corpse = kill()
    sec(c, 0.1)
    useItem(c, 'rapidRevive', { x: corpse.x, y: corpse.y })
    sec(c, 2.5)
    expect(victim.alive).toBe(true)
    expect(g.mainOf(victim)!.alive).toBe(true)
    expect(corpse.removed).toBe(true)
    expect(hasItem(m, 'rapidRevive')).toBe(false)
    // 超過 45 秒
    const old = kill()
    sec(c, 46)
    m.cds.clear()
    useItem(c, 'rapidRevive', { x: old.x, y: old.y })
    sec(c, 2.5)
    expect(victim.alive).toBe(false)
    expect(hasItem(m, 'rapidRevive')).toBe(true)
    expect(chatOf(cs[medic.slot])).toContain('@item.reviveFail')
  })

  it('醫療再生器每秒回復 2% 生命；力場讓範圍內玩家單位受到的傷害減半', () => {
    const c = setup()
    const { g, u } = c
    arena(c, 6)
    u.hp = 100
    useItem(c, 'regenBeacon', { x: u.x + 1, y: u.y })
    sec(c, 2.1)
    expect(u.hp).toBeGreaterThanOrEqual(116 - 0.01)
    expect(u.hp).toBeLessThan(130)
    const npc = dummy(c, -1, 0, 2000)
    useItem(c, 'forceBarrier', { x: u.x, y: u.y + 1 })
    sec(c, 0.6)
    expect(hasBuff(u, 'bf.forceWard')).toBe(true)
    expect(hasBuff(npc, 'bf.forceWard')).toBe(false)
    const hp = u.hp
    damage(g, null, u, 100, { pure: true })
    expect(hp - u.hp).toBeCloseTo(50, 5)
  })

  it('重症維生系統擋下致命傷一次', () => {
    const c = setup()
    const { g, u } = c
    giveItem(g, u, makeItem('criticalCare'))
    damage(g, null, u, 99999, { pure: true })
    expect(u.alive).toBe(true)
    expect(u.hp).toBe(150)
    expect(hasItem(u, 'criticalCare')).toBe(false)
    sec(c, 2)
    damage(g, null, u, 99999, { pure: true })
    expect(u.alive).toBe(false)
  })
})

describe('販賣機', () => {
  it('庫存、補貨、開局延遲（基因檢測器 420 秒才上架）', () => {
    const c = setup()
    const { g, u } = c
    const v = vendorOf(g, 'medical')
    expect(stockOf(v, 'traumaKit').count).toBe(3)
    expect(stockOf(v, 'geneSampler').count).toBe(0)
    standNear(c, v.x, v.y, 1.6)
    sec(c, 0.1)
    g.handleCommand(c.p.slot, { k: 'buy', e: v.id, a: 'traumaKit' })
    expect(hasItem(u, 'traumaKit')).toBe(true)
    expect(stockOf(v, 'traumaKit').count).toBe(2)
    g.handleCommand(c.p.slot, { k: 'buy', e: v.id, a: 'geneSampler' })
    expect(hasItem(u, 'geneSampler')).toBe(false)
    sec(c, 0.1)
    expect(chatOf(c.cs[0])).toContain('@vendor.soldOut')
    // 急救包 40 秒補一個
    sec(c, 39)
    expect(stockOf(v, 'traumaKit').count).toBe(2)
    sec(c, 1.5)
    expect(stockOf(v, 'traumaKit').count).toBe(3)
    // 420 秒後一次上架到滿
    g.world.time = 420.2
    sec(c, 0.6)
    expect(stockOf(v, 'geneSampler').count).toBe(3)
    expect(String(v.x2?.s)).toContain('geneSampler:3')
    g.handleCommand(c.p.slot, { k: 'buy', e: v.id, a: 'geneSampler' })
    expect(hasItem(u, 'geneSampler')).toBe(true)
  })

  it('電磁手榴彈讓販賣機停機 120 秒，並吸走附近的能量', () => {
    const c = setup()
    const { g, u } = c
    const v = vendorOf(g, 'outpost')
    const z = g.world.zones[v.zone]
    g.world.relocate(u, v.zone, v.x, v.y)
    standNear(c, v.x, v.y, 3.2)
    const spot = z.nav!.nearestOpen(v.x, v.y)!
    const near = g.world.spawn(unitDef('personnel'), v.zone, spot.x, spot.y, NEUTRAL)
    near.mp = 100
    useItem(c, 'empGrenade', { x: v.x, y: v.y })
    sec(c, 1.5)
    expect(v.data.disabledUntil).toBeGreaterThan(g.time + 100)
    expect(near.mp).toBeLessThan(100)
    expect(hasBuff(near, 'bf.empSilence')).toBe(true)
    // 停機中不能取用
    standNear(c, v.x, v.y, 1.6)
    sec(c, 0.1)
    const before = stockOf(v, 'tracker').count
    g.handleCommand(c.p.slot, { k: 'buy', e: v.id, a: 'tracker' })
    expect(stockOf(v, 'tracker').count).toBe(before)
    sec(c, 0.1)
    expect(chatOf(c.cs[0])).toContain('@vendor.offline')
    g.world.time += 121
    sec(c, 0.1)
    g.handleCommand(c.p.slot, { k: 'buy', e: v.id, a: 'tracker' })
    expect(hasItem(u, 'tracker')).toBe(true)
  })
})

describe('爆裂物', () => {
  it('熱融炸彈 3 秒後：爆心 5200、外圈 200，並產生瓦礫', () => {
    const c = setup()
    const { g, u } = c
    arena(c, 6)
    const bx = u.x + 1
    const by = u.y
    const a = dummy(c, 1.5, 0, 400)
    const b = dummy(c, 5, 0, 2000)
    const rubble0 = ents(g, 'rubble').length
    useItem(c, 'fusionCharge', { x: bx, y: by })
    sec(c, 0.2)
    expect(ents(g, 'dev.fusionCharge').length).toBe(1)
    g.world.relocate(u, 0, 0, 0)
    sec(c, 2)
    expect(a.alive).toBe(true)
    sec(c, 1.2)
    expect(a.alive).toBe(false)
    expect(b.hp).toBeCloseTo(1800, 0)
    expect(ents(g, 'dev.fusionCharge').length).toBe(0)
    expect(ents(g, 'rubble').length).toBeGreaterThan(rubble0)
  })

  it('熱融炸彈在倒數中被打壞就不會爆', () => {
    const c = setup()
    const { g, u } = c
    arena(c, 6)
    const a = dummy(c, 2, 0, 400)
    useItem(c, 'fusionCharge', { x: u.x + 1, y: u.y })
    sec(c, 0.2)
    const bomb = ents(g, 'dev.fusionCharge')[0]
    damage(g, null, bomb, 1000, { pure: true })
    sec(c, 4)
    expect(a.alive).toBe(true)
    expect(a.hp).toBe(400)
  })

  it('手榴彈落地後延遲爆炸，越靠近爆心傷害越高', () => {
    const c = setup()
    const { g, u } = c
    arena(c, 6)
    const center = dummy(c, 4, 0)
    // 範圍判定包含單位半徑：1.5 m 在內圈 0.8 m(+0.4) 之外、外圈 1.5 m(+0.4) 之內
    const edge = dummy(c, 4, 1.5)
    useItem(c, 'fragGrenade', { x: u.x + 4, y: u.y })
    sec(c, 0.4)
    expect(center.hp).toBe(2000)
    sec(c, 1.5)
    expect(2000 - center.hp).toBeCloseTo(150, 0)
    expect(2000 - edge.hp).toBeCloseTo(75, 0)
    expect(g.world.get(u.id)).toBeTruthy()
  })
})

describe('門', () => {
  it('清潔工 ID 卡切換附近門鎖；艦長卡在豪勇號以外無效', () => {
    const c = setup()
    const { g } = c
    const d = nearDoor(c)
    const st = g.world.zones[c.u.zone].doors[d.index]
    const s = useItem(c, 'janitorCard')
    sec(c, 1.2)
    expect(st.locked).toBe(true)
    expect(st.lockUntil).toBe(0)
    sec(c, 2)
    g.handleCommand(c.p.slot, { k: 'use', s })
    sec(c, 1.2)
    expect(st.locked).toBe(false)
    useItem(c, 'captainCard')
    sec(c, 1.2)
    expect(st.locked).toBe(false)
    expect(chatOf(c.cs[0])).toContain('@item.captainOnly')
  })

  it('工程師駭門：附近沒鎖的門鎖 15 秒後自動解鎖；附近沒門則退還能量', () => {
    const c = setup()
    const { g, u } = c
    u.abilities.push('cls.doorHack')
    u.mp = 100
    const d = nearDoor(c)
    const st = g.world.zones[u.zone].doors[d.index]
    g.handleCommand(c.p.slot, { k: 'cast', a: 'cls.doorHack' })
    sec(c, 1.5)
    expect(st.locked).toBe(true)
    expect(st.lockUntil).toBeGreaterThan(g.time + 13)
    expect(u.mp).toBeLessThan(60)
    sec(c, 13)
    expect(st.locked).toBe(true)
    sec(c, 2)
    expect(st.locked).toBe(false)
    // 沒有門：退還
    arena(c, 3)
    expect(doorDist(g, u.zone, u.x, u.y)).toBeGreaterThan(DOOR_REACH)
    u.mp = 100
    u.cds.clear()
    g.handleCommand(c.p.slot, { k: 'cast', a: 'cls.doorHack' })
    sec(c, 1.5)
    expect(u.mp).toBeGreaterThanOrEqual(99)
    expect(u.cds.get('cls.doorHack') ?? 0).toBeLessThanOrEqual(g.time)
  })
})

describe('翻找', () => {
  it('擲出 1–4 對應四聯藥／背包掃描器／全像投影器／節慶帽，其他什麼都沒有', () => {
    const c = setup()
    const { g, u } = c
    arena(c, 4)
    const rng = g.world.rng
    const orig = rng.int.bind(rng)
    const fn = SCRIPTS.get('cls.rummage')!
    try {
      for (const roll of [1, 2, 3, 4, 5, 28]) {
        u.inv!.fill(null)
        rng.int = (a: number, b: number) => (a === 1 && b === 28 ? roll : orig(a, b))
        const crate = g.world.spawn(unitDef('struct.rummage'), u.zone, u.x + 1, u.y, NEUTRAL)
        fn(g, { caster: u, target: crate, x: crate.x, y: crate.y, zone: u.zone }, {})
        expect(crate.alive).toBe(false)
        const got = u.inv!.filter(Boolean).map((it) => it!.id)
        expect(got).toEqual(RUMMAGE_TABLE[roll] ? [RUMMAGE_TABLE[roll]] : [])
      }
    } finally {
      rng.int = orig
    }
  })

  it('固定 seed 下 280 次翻找，每種獎品約 1/28', () => {
    const c = setup()
    const { g, u } = c
    arena(c, 4)
    const fn = SCRIPTS.get('cls.rummage')!
    const count = new Map<string, number>()
    for (let i = 0; i < 280; i++) {
      u.inv!.fill(null)
      const crate = g.world.spawn(unitDef('struct.rummage'), u.zone, u.x + 1, u.y, NEUTRAL)
      fn(g, { caster: u, target: crate, x: crate.x, y: crate.y, zone: u.zone }, {})
      const it = u.inv!.find(Boolean)
      const k = it ? it.id : 'none'
      count.set(k, (count.get(k) ?? 0) + 1)
    }
    for (const id of Object.values(RUMMAGE_TABLE)) {
      expect(count.get(id) ?? 0, id).toBeGreaterThanOrEqual(2)
      expect(count.get(id) ?? 0, id).toBeLessThanOrEqual(25)
    }
    expect(count.get('none')).toBeGreaterThan(220)
  })

  it('清潔工對雜物箱施放翻找：花 50 能量、箱子報銷', () => {
    const c = setup()
    const { g, u } = c
    arena(c, 4)
    u.abilities.push('cls.rummage')
    u.mp = 100
    const crate = g.world.spawn(unitDef('struct.rummage'), u.zone, u.x + 1.2, u.y, NEUTRAL)
    sec(c, 0.1)
    g.handleCommand(c.p.slot, { k: 'cast', a: 'cls.rummage', e: crate.id })
    sec(c, 0.5)
    expect(crate.alive).toBe(false)
    expect(u.mp).toBeLessThan(55)
  })
})

describe('裝置與偵查', () => {
  it('哨戟 5 秒後上線，只打放置者以外的玩家單位', () => {
    const c = setup()
    const { g, u } = c
    arena(c, 6)
    const q = g.mainOf(g.players[1])!
    if (q.suit) removeSuit(g, q)
    g.world.relocate(q, u.zone, u.x + 4, u.y)
    q.order = null
    q.hp = q.maxHp
    q.data.noRegen = true
    useItem(c, 'sentryTurret', { x: u.x + 1, y: u.y })
    sec(c, 0.2)
    const s = ents(g, 'dev.sentry')[0]
    expect(s.owner).toBe(c.p.slot)
    sec(c, 4)
    expect(q.hp).toBe(q.maxHp)
    sec(c, 3)
    expect(q.hp).toBeLessThan(q.maxHp - 10)
    expect(u.hp).toBe(u.maxHp)
  })

  it('追蹤器的位置標記只有使用者看得到', () => {
    const c = setup()
    const { g, u } = c
    arena(c, 6)
    const q = g.mainOf(g.players[1])!
    g.world.relocate(q, u.zone, u.x + 3, u.y)
    useItem(c, 'tracker')
    sec(c, 0.3)
    expect(fxOf(c.cs[0]).some((f) => f.k === 'ping' && f.s === 'tracker')).toBe(true)
    expect(fxOf(c.cs[1]).some((f) => f.k === 'ping' && f.s === 'tracker')).toBe(false)
    expect(fxOf(c.cs[0]).filter((f) => f.s === 'tracker').every((f) => f.e === undefined)).toBe(true)
  })

  it('動作感應器在別人靠近時只通知擁有者', () => {
    const c = setup()
    const { g, u } = c
    arena(c, 6)
    const q = g.mainOf(g.players[1])!
    g.world.relocate(q, 0, 0, 0)
    useItem(c, 'motionSensor', { x: u.x + 1, y: u.y })
    sec(c, 1)
    expect(ents(g, 'dev.motionSensor').length).toBe(1)
    expect(chatOf(c.cs[0])).not.toContain('@item.sensorAlert')
    g.world.relocate(q, u.zone, u.x + 3, u.y)
    sec(c, 0.5)
    expect(chatOf(c.cs[0])).toContain('@item.sensorAlert')
    expect(chatOf(c.cs[1])).not.toContain('@item.sensorAlert')
  })

  it('全像分身：第三者看到的是本尊的外觀，看不到分身 buff 與真正擁有者', () => {
    const { h, cs } = Harness.started(3)
    const g = h.server.game!
    itemRuntime(g)
    const p = g.players[0]
    const u = g.mainOf(p)!
    if (u.suit) removeSuit(g, u)
    u.inv!.fill(null)
    const c: Ctx = { h, cs, g, p, u }
    arena(c, 6)
    const q = g.mainOf(g.players[1])!
    const w = g.mainOf(g.players[2])!
    if (q.suit) removeSuit(g, q)
    g.world.relocate(q, u.zone, u.x + 3, u.y)
    g.world.relocate(w, u.zone, u.x - 3, u.y)
    q.inv!.fill(null)
    giveItem(g, q, makeItem('pirateHat'))
    sec(c, 0.6)
    expect(hasBuff(q, 'bf.pirateHat')).toBe(true)
    useItem(c, 'holoProjector', q)
    sec(c, 0.5)
    const holo = [...g.world.ents.values()].find((e) => e.illusion && e.alive)!
    expect(holo).toBeTruthy()
    expect(holo.owner).toBe(p.slot)
    sec(c, 0.6)
    const seen = cs[2].ents.get(holo.id)!
    expect(seen).toBeTruthy()
    expect(seen.o).toBe(q.owner)
    expect(seen.n).toBe(q.name)
    expect(seen.b).toContain('bf.pirateHat')
    expect(seen.b).not.toContain('bf.holo')
    expect((seen.fl ?? 0) & EntFlag.Hallucination).toBe(0)
    const mine = cs[0].ents.get(holo.id)!
    expect((mine.fl ?? 0) & EntFlag.Hallucination).toBe(EntFlag.Hallucination)
    // 一碰就碎
    damage(g, null, holo, 5, { pure: true })
    expect(holo.alive).toBe(false)
    expect(ents(g, 'corpse').some((e) => e.x === holo.x && e.y === holo.y)).toBe(false)
  })

  it('相位斗篷：4 秒內別人的快照裡看不到自己', () => {
    const c = setup()
    const { g, u } = c
    arena(c, 6)
    const q = g.mainOf(g.players[1])!
    g.world.relocate(q, u.zone, u.x + 3, u.y)
    sec(c, 0.2)
    expect(c.cs[1].ents.has(u.id)).toBe(true)
    useItem(c, 'phaseCloak')
    sec(c, 0.3)
    expect(u.stats.stealth).toBe(true)
    expect(c.cs[1].ents.has(u.id)).toBe(false)
    expect(c.cs[0].ents.has(u.id)).toBe(true)
    sec(c, 4)
    expect(c.cs[1].ents.has(u.id)).toBe(true)
  })

  it('背包掃描器的結果只私訊給使用者', () => {
    const c = setup()
    const { g, u } = c
    arena(c, 6)
    const q = g.mainOf(g.players[1])!
    g.world.relocate(q, u.zone, u.x + 3, u.y)
    q.inv!.fill(null)
    giveItem(g, q, makeItem('stim'))
    sec(c, 0.1)
    useItem(c, 'invScanner', q)
    sec(c, 0.3)
    const mine = chatOf(c.cs[0]).find((l) => l.startsWith('@item.scanResult'))
    expect(mine).toContain('items=stim')
    expect(chatOf(c.cs[1]).some((l) => l.startsWith('@item.scanResult'))).toBe(false)
    expect(chatOf(c.cs[1])).toContain('@item.scanned')
  })
})
