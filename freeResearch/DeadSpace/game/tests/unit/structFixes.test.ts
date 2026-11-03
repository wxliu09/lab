// 建物盤點（A1）的設施／道具／事件修正：著裝人員領強化劑、雜物箱照原作數量與掉落、籠子控制台從隔間取標本、
// 綏靖機器人也打機械類、黑洞裝置摧毀重力控制裝置、設施 HP 與無敵照原作、鑄造台自動重建、模組安裝座的無敵旗標、洩漏
import { describe, expect, it } from 'vitest'
import { Harness, type FakeClient } from './helpers/harness'
import { decode } from '../../src/shared/protocol/codec'
import { EntFlag, type HostMsg } from '../../src/shared/protocol/messages'
import { CRATE_COUNT, RUMMAGE_LOOT, RUMMAGE_TABLE } from '../../src/shared/content/items'
import { unitDef } from '../../src/shared/content/registry'
import { Cell, roomAt } from '../../src/shared/layout'
import { cellInfo, facilityView, setPowerMode } from '../../src/sim/systems/facilities'
import { giveItem, makeItem, morph } from '../../src/sim/systems/items'
import { damage } from '../../src/sim/systems/damage'
import { isHostile } from '../../src/sim/systems/combat'
import { entView } from '../../src/sim/systems/snapshot'
import { SCRIPTS } from '../../src/sim/systems/effects'
import { eventsOf } from '../../src/sim/systems/events'
import { pacifierTarget } from '../../src/sim/ai/creatures'
import { markersOf } from '../../src/sim/setup'
import type { NavGrid } from '../../src/sim/nav/grid'
import type { Zone } from '../../src/sim/world'
import type { Ent } from '../../src/sim/ent'
import type { Game, GamePlayer } from '../../src/sim/game'

const sec = (h: Harness, s: number) => h.ticks(Math.round(s * 20))

function setup(n = 3, settings: Record<string, unknown> = {}, seed = 4242) {
  const { h, cs } = Harness.started(n, seed, { eventMult: 0, ...settings })
  const g = h.server.game!
  const ps = g.allPlayers()
  for (const p of ps) g.setRole(p, 'human')
  return { h, g, cs, ps }
}

const zone = (g: Game, key: string): Zone => g.world.zoneByKey(key)!
const findIn = (g: Game, zid: number, pred: (e: Ent) => boolean): Ent => g.world.inZone(zid).find(pred)!
const byDef = (g: Game, zid: number, def: string): Ent => findIn(g, zid, (e) => e.def.id === def)
const main = (g: Game, p: GamePlayer): Ent => g.mainOf(p)!
const cl = (cs: FakeClient[], p: GamePlayer): FakeClient => cs.find((c) => c.slot === p.slot)!
const crates = (g: Game, zid: number): Ent[] => g.world.inZone(zid).filter((e) => e.alive && e.def.id === 'struct.rummage')
const groundItems = (g: Game, zid: number, id: string): Ent[] => g.world.inZone(zid).filter((e) => (e.data.item as { id?: string } | undefined)?.id === id)

function standAt(g: Game, u: Ent, zid: number, x: number, y: number): void {
  const z = g.world.zones[zid]
  const n = z.nav ? (z.nav.nearestOpen(x, y) ?? { x, y }) : { x, y }
  g.world.relocate(u, zid, n.x, n.y)
  u.order = null
  u.queue.length = 0
  u.path = null
}

function near(g: Game, p: GamePlayer, e: Ent, d = 1.4): void {
  standAt(g, main(g, p), e.zone, e.x, e.y - d)
}

function chatOf(h: Harness, c: FakeClient): string[] {
  const out: string[] = []
  for (const raw of h.raw.get(c.peer) ?? []) {
    const m = decode(raw) as HostMsg
    if (m.t === 'chat') for (const l of m.lines) out.push(l.text)
  }
  return out
}

function clearRaw(h: Harness): void {
  for (const r of h.raw.values()) r.length = 0
}

/** 讓某人用背包裡的道具對目標施放（道具放進第一個空格）*/
function useOn(h: Harness, g: Game, p: GamePlayer, itemId: string, target: Ent): void {
  const u = main(g, p)
  if (!u.inv!.includes(null)) u.inv![u.inv!.length - 1] = null
  const slot = giveItem(g, u, makeItem(itemId))
  sec(h, 1.1)
  g.handleCommand(p.slot, { k: 'use', s: slot, e: target.id })
  h.ticks(8)
}

/** 可走格（4 連通）的區塊數；withDyn = false 時把雜物箱佔的格子當成空地 */
function components(nav: NavGrid, crateIdx: Set<number>, withDyn: boolean): number {
  const n = nav.w * nav.h
  const open = (i: number) => !nav.solid[i] && (withDyn ? !nav.dyn[i] : nav.dyn[i] === 0 || crateIdx.has(i))
  const seen = new Uint8Array(n)
  let comps = 0
  for (let s = 0; s < n; s++) {
    if (seen[s] || !open(s)) continue
    comps++
    const stack = [s]
    seen[s] = 1
    while (stack.length) {
      const i = stack.pop()!
      const c = i % nav.w
      for (const j of [c > 0 ? i - 1 : -1, c < nav.w - 1 ? i + 1 : -1, i - nav.w, i + nav.w]) {
        if (j < 0 || j >= n || seen[j] || !open(j)) continue
        seen[j] = 1
        stack.push(j)
      }
    }
  }
  return comps
}

describe('政府強化劑', () => {
  it('穿著防護服的人員也能領（限人員本人＝人員形態，含著裝）；異形形態仍被拒', () => {
    const { h, g, ps, cs } = setup()
    expect(g.triggerEvent!('enhancer', true)).toBe(true)
    const z = zone(g, 'nyx')
    const enh = byDef(g, z.id, 'struct.enhancer')
    const p = ps[1]
    let u = main(g, p)
    if (!u.inv!.includes(null)) u.inv![u.inv!.length - 1] = null
    const s = giveItem(g, u, makeItem('suit.guard'))
    g.handleCommand(p.slot, { k: 'use', s })
    h.ticks(3)
    u = main(g, p)
    expect(u.def.id).toBe('suit.guard')
    expect(u.tags.has('personnel')).toBe(true)
    clearRaw(h)
    standAt(g, u, z.id, enh.x + 1, enh.y)
    sec(h, 0.6)
    expect(cl(cs, p).me.enh).toBe(true)
    expect(chatOf(h, cl(cs, p)).some((l) => l.includes('event.enhNotYou'))).toBe(false)
    const hp0 = u.maxHp
    g.handleCommand(p.slot, { k: 'enhance', s: 1 })
    h.ticks(2)
    expect(p.data.enhDone).toBe(true)
    expect(u.maxHp).toBe(hp0 + 100)
    // 異形形態：無法辨識
    const q = ps[2]
    const qu = main(g, q)
    morph(g, qu, 'xeno.protoform')
    expect(qu.tags.has('personnel')).toBe(false)
    clearRaw(h)
    standAt(g, qu, z.id, enh.x - 1, enh.y)
    sec(h, 0.6)
    expect(cl(cs, q).me.enh).toBeFalsy()
    expect(chatOf(h, cl(cs, q)).some((l) => l.includes('event.enhNotYou'))).toBe(true)
    g.handleCommand(q.slot, { k: 'enhance', s: 1 })
    h.ticks(2)
    expect(q.data.enhDone).toBeFalsy()
  })
})

describe('雜物箱', () => {
  for (const seed of [4242, 7, 99]) {
    it(`各站照原作數量（seed ${seed}）：靠牆成堆、避開門口與 POI、不放走廊與機庫、不把地板隔開`, () => {
      const { h, g } = setup(3, { stations: ['caldera', 'portage', 'vivarium'] }, seed)
      expect(g.triggerEvent!('pirate', true)).toBe(true)
      h.ticks(2)
      for (const [key, n] of Object.entries(CRATE_COUNT)) {
        const z = zone(g, key)
        expect(z, key).toBeTruthy()
        const list = crates(g, z.id)
        expect(list.length, key).toBe(n)
        const l = z.layout!
        const nav = z.nav!
        const idx = new Set<number>()
        for (const c of list) {
          if (c.data.poi) continue
          const col = Math.floor(c.x)
          const row = l.h - 1 - Math.floor(c.y)
          const i = row * l.w + col
          idx.add(i)
          expect(c.data.navIdx).toBe(i)
          expect(nav.dyn[i]).toBeGreaterThan(0)
          expect(l.cells[i]).toBe(Cell.Floor)
          const room = l.rooms[l.roomOf[i]]
          expect(['corridor', 'hangar', 'cell']).not.toContain(room.spec.type)
          for (const d of l.doors) for (const [dc, dr] of d.cells) expect(Math.max(Math.abs(dc - col), Math.abs(dr - row)), key).toBeGreaterThan(2)
          for (const p of l.pois) expect(Math.max(Math.abs(p.col - col), Math.abs(p.row - row)), key + ' ' + p.def.kind).toBeGreaterThan(2)
          for (const p of l.pads) expect(Math.hypot(p.x - c.x, p.y - c.y)).toBeGreaterThan(4)
          for (const s of l.spawns) expect(Math.hypot(s.x - c.x, s.y - c.y)).toBeGreaterThan(1)
        }
        expect(components(nav, idx, true), key).toBe(components(nav, idx, false))
      }
      // 原作沒有箱子的站
      for (const key of ['adjudicatrix', 'cinder', 'portage']) expect(crates(g, zone(g, key).id).length, key).toBe(0)
      // 七號廢站的箱子用「搬空」的翻找表
      expect(crates(g, zone(g, 'hulk7').id).every((c) => c.data.loot === 'scrap')).toBe(true)
      expect(crates(g, zone(g, 'nyx').id).every((c) => !c.data.loot)).toBe(true)
    })
  }

  it('打爆放置的箱子會釋放導航格；翻找真的箱子拿得到東西', () => {
    const { h, g, ps } = setup()
    const nz = zone(g, 'nyx')
    const placed = crates(g, nz.id).filter((c) => !c.data.poi)
    const a = placed[0]
    const i = a.data.navIdx as number
    expect(nz.nav!.dyn[i]).toBe(1)
    damage(g, main(g, ps[0]), a, 9999, { pure: true })
    h.ticks(1)
    expect(a.alive).toBe(false)
    expect(nz.nav!.dyn[i]).toBe(0)
    // 翻找（擲到 2 = 背包掃描器）
    const u = main(g, ps[0])
    u.inv!.fill(null)
    const b = placed[1]
    const rng = g.world.rng
    const orig = rng.int.bind(rng)
    try {
      rng.int = (lo: number, hi: number) => (lo === 1 && hi === 28 ? 2 : orig(lo, hi))
      SCRIPTS.get('cls.rummage')!(g, { caster: u, target: b, x: b.x, y: b.y, zone: b.zone }, {})
    } finally {
      rng.int = orig
    }
    expect(b.alive).toBe(false)
    expect(u.inv!.some((it) => it?.id === RUMMAGE_TABLE[2])).toBe(true)
  })

  it('翻找表：一般站照原作（四項各 1/28）；七號廢站的箱子幾乎都是空的', () => {
    const { g, ps } = setup()
    const u = main(g, ps[0])
    const fn = SCRIPTS.get('cls.rummage')!
    const roll = (loot: string | undefined) => {
      const count = new Map<string, number>()
      for (let i = 0; i < 560; i++) {
        u.inv!.fill(null)
        const c = g.world.spawn(unitDef('struct.rummage'), u.zone, u.x + 1, u.y, -1)
        if (loot) c.data.loot = loot
        fn(g, { caster: u, target: c, x: c.x, y: c.y, zone: u.zone }, {})
        const it = u.inv!.find(Boolean)
        count.set(it ? it.id : 'none', (count.get(it ? it.id : 'none') ?? 0) + 1)
      }
      return count
    }
    const normal = roll(undefined)
    for (const id of Object.values(RUMMAGE_TABLE)) expect(normal.get(id) ?? 0, id).toBeGreaterThan(5)
    const scrap = roll('scrap')
    const allowed = new Set(Object.values(RUMMAGE_LOOT.scrap.items))
    for (const k of scrap.keys()) if (k !== 'none') expect(allowed.has(k), k).toBe(true)
    expect(scrap.get('none')!).toBeGreaterThan(normal.get('none')!)
    expect(560 - scrap.get('none')!).toBeGreaterThan(0)
  })

  it('海盜船：29 個箱子，貨艙的兩個補給箱被毀（打爆或翻找）必掉急救包，其他箱子不掉', () => {
    const { h, g, ps } = setup()
    expect(g.triggerEvent!('pirate', true)).toBe(true)
    const pz = g.world.zones[eventsOf(g).pirateZone]
    const list = crates(g, pz.id)
    expect(list.length).toBe(29)
    const special = list.filter((c) => c.data.dropItem === 'traumaKit')
    expect(special.length).toBe(2)
    expect(special.every((c) => c.data.poi === 'rummageBox')).toBe(true)
    // 一般箱子打爆不掉
    for (const c of list.filter((x) => !x.data.dropItem).slice(0, 5)) g.killEnt(c, null, -1)
    h.ticks(1)
    expect(groundItems(g, pz.id, 'traumaKit').length).toBe(0)
    // 打爆一個
    damage(g, main(g, ps[0]), special[0], 9999, { pure: true })
    h.ticks(1)
    expect(groundItems(g, pz.id, 'traumaKit').length).toBe(1)
    // 翻找另一個也一樣掉
    const u = main(g, ps[0])
    u.inv!.fill(null)
    SCRIPTS.get('cls.rummage')!(g, { caster: u, target: special[1], x: special[1].x, y: special[1].y, zone: pz.id }, {})
    h.ticks(1)
    expect(groundItems(g, pz.id, 'traumaKit').length).toBe(2)
  })
})

describe('籠子控制台：從第 N 間取標本', () => {
  it('沒有籠子先提示；平台空著製籠 → 空籠子；從隔間直接取標本放進籠子（只取無主標本），滿了要再製籠；打破籠子全放出來', () => {
    const { h, g, ps, cs } = setup(3, { stations: ['vivarium'] })
    const vz = zone(g, 'vivarium')
    const l = vz.layout!
    const con = byDef(g, vz.id, 'fac.cageConsole')
    const info = cellInfo(vz)
    const specimens = (i: number) =>
      g.world.inZone(vz.id).filter((e) => e.alive && e.tags.has('creature') && e.owner < 0 && !e.tags.has('noTarget') && roomAt(l, e.x, e.y)?.index === info.rooms[i])
    const r = ps[1]
    const c = cl(cs, r)
    near(g, r, con, 1.6)
    h.ticks(2)
    const view = () => {
      const v = facilityView(g, r)
      expect(v?.k).toBe('cage')
      return v as Extract<NonNullable<typeof v>, { k: 'cage' }>
    }
    expect(view().cells).toBe(6)
    expect(view().cage).toBe(-1)
    expect(view().cap).toBe(3)
    // 選一間標本最多的隔間；另找一間清空
    const counts = info.rooms.map((_, i) => specimens(i).length)
    const full = counts.indexOf(Math.max(...counts))
    expect(counts[full]).toBeGreaterThanOrEqual(4)
    const empty = (full + 1) % 6
    for (const m of specimens(empty)) g.world.remove(m)
    // 玩家站在隔間裡：不會被當成標本
    const bystander = main(g, ps[2])
    standAt(g, bystander, vz.id, l.rooms[info.rooms[full]].cx, l.rooms[info.rooms[full]].cy)
    bystander.data.frozen = true
    clearRaw(h)
    g.handleCommand(r.slot, { k: 'facility', e: con.id, a: 'cageCell', s: full })
    h.ticks(2)
    expect(chatOf(h, c)).toContain('@fac.cageNoCage')
    // 製籠（平台空著）
    g.handleCommand(r.slot, { k: 'facility', e: con.id, a: 'cage' })
    h.ticks(2)
    clearRaw(h)
    g.handleCommand(r.slot, { k: 'facility', e: con.id, a: 'cageCell', s: full })
    h.ticks(2)
    expect(chatOf(h, c)).toContain('@fac.cageBusy')
    sec(h, 10.5)
    expect(chatOf(h, c).some((x) => x.startsWith('@fac.cageMadeEmpty'))).toBe(true)
    const cage = byDef(g, vz.id, 'fac.cage')
    expect((cage.data.contents as unknown[]).length).toBe(0)
    expect(view().cage).toBe(0)
    // 空的隔間
    clearRaw(h)
    g.handleCommand(r.slot, { k: 'facility', e: con.id, a: 'cageCell', s: empty })
    h.ticks(2)
    expect(chatOf(h, c).some((x) => x.startsWith('@fac.cageNoSubject'))).toBe(true)
    // 連取三隻：籠子滿了
    const took: string[] = []
    for (let k = 0; k < 3; k++) {
      const before = specimens(full)
      clearRaw(h)
      g.handleCommand(r.slot, { k: 'facility', e: con.id, a: 'cageCell', s: full })
      h.ticks(2)
      const after = specimens(full)
      expect(after.length).toBe(before.length - 1)
      took.push(before.find((m) => !after.includes(m))!.def.id)
      expect(chatOf(h, c).some((x) => x.startsWith('@fac.cageTransferred'))).toBe(true)
      expect((cage.data.contents as unknown[]).length).toBe(k + 1)
      expect(cage.x2?.n).toBe(k + 1)
    }
    expect(bystander.alive && !bystander.removed).toBe(true)
    expect(view().cage).toBe(-1)
    clearRaw(h)
    g.handleCommand(r.slot, { k: 'facility', e: con.id, a: 'cageCell', s: full })
    h.ticks(2)
    expect(chatOf(h, c)).toContain('@fac.cageNoCage')
    // 再製籠：舊籠子被推下平台，新籠子在平台上
    g.handleCommand(r.slot, { k: 'facility', e: con.id, a: 'cage' })
    sec(h, 10.5)
    const pads = markersOf(vz).cagePad!
    const onPad = (e: Ent) => pads.some((p) => Math.abs(p.x - e.x) <= 0.8 && Math.abs(p.y - e.y) <= 0.8)
    const cages = g.world.inZone(vz.id).filter((e) => e.alive && e.def.id === 'fac.cage')
    expect(cages.length).toBe(2)
    expect(onPad(cage)).toBe(false)
    expect(view().cage).toBe(0)
    // 打破滿的籠子：三隻都放出來
    const near3 = () => g.world.inZone(vz.id).filter((e) => e.alive && e.tags.has('creature') && Math.hypot(e.x - cage.x, e.y - cage.y) < 2.5).map((e) => e.def.id)
    const before = near3().length
    damage(g, null, cage, 1000, { pure: true })
    expect(cage.alive).toBe(false)
    expect(near3().length).toBe(before + 3)
    expect(near3().filter((d) => took.includes(d)).length).toBeGreaterThanOrEqual(3)
  })
})

describe('綏靖機器人', () => {
  it('實驗室模式時打穿防護服或機械類的玩家單位；無主機械、偽裝成無主機械、一般人員不打；沒開實驗室模式誰都不打', () => {
    const { h, g, ps } = setup()
    const nz = zone(g, 'nyx')
    const bot = byDef(g, nz.id, 'npc.pacifier')
    const u = main(g, ps[1])
    morph(g, u, 'android.bulwark')
    h.ticks(1)
    expect(u.tags.has('mechanical')).toBe(true)
    expect(isHostile(g, bot, u)).toBe(false)
    setPowerMode(g, 'lab')
    expect(isHostile(g, bot, u)).toBe(true)
    // 一般人員不打；著裝人員照打
    const q = main(g, ps[2])
    expect(isHostile(g, bot, q)).toBe(false)
    morph(g, q, 'suit.guard')
    expect(isHostile(g, bot, q)).toBe(true)
    // 無主的防禦無人機不打；玩家放的哨戟（機械類）照打
    const drone = byDef(g, nz.id, 'npc.defenseDrone')
    expect(isHostile(g, bot, drone)).toBe(false)
    const sentry = g.world.spawn(unitDef('dev.sentry'), nz.id, bot.x + 2, bot.y, ps[0].slot)
    expect(isHostile(g, bot, sentry)).toBe(true)
    // 偽裝成無主機械：照看起來的樣子，不打（不會被它的反應揭穿）
    const fake = g.world.spawn(unitDef('npc.defenseDrone'), nz.id, bot.x + 2, bot.y + 1, ps[0].slot)
    fake.anon = true
    fake.data.fake = { def: 'npc.defenseDrone', owner: -1, name: '', color: -1, cls: '' }
    expect(pacifierTarget(fake)).toBe(false)
    expect(isHostile(g, bot, fake)).toBe(false)
    g.world.remove(sentry)
    g.world.remove(fake)
    // 實際行為：附近的機械類玩家單位會被攻擊
    standAt(g, u, nz.id, bot.x + 2.5, bot.y)
    standAt(g, q, nz.id, bot.x - 30, bot.y)
    bot.order = null
    const hp0 = u.hp
    sec(h, 4)
    expect(u.hp).toBeLessThan(hp0)
  })
})

describe('黑洞裝置', () => {
  it('放置黑洞裝置會直接摧毀餘燼衛星的重力控制裝置', () => {
    const { h, g, ps } = setup()
    const cz = zone(g, 'cinder')
    const grav = findIn(g, cz.id, (e) => e.data.vendor === 'gravity')
    expect(grav.alive).toBe(true)
    const u = main(g, ps[0])
    SCRIPTS.get('item.singularity')!(g, { caster: u, x: u.x, y: u.y + 1, zone: u.zone }, {})
    h.ticks(2)
    expect(grav.alive).toBe(false)
  })
})

describe('設施 HP 與無敵', () => {
  it('動力分配台、鑄造台、隔間門／籠子控制台無敵（快照帶 Invuln）；販賣機與模組工廠 HP 照原作', () => {
    const { h, g, ps } = setup(3, { stations: ['vivarium'] })
    h.ticks(1)
    for (const [key, def] of [
      ['nyx', 'struct.power'],
      ['adjudicatrix', 'fac.fabricator'],
      ['vivarium', 'fac.cellConsole'],
      ['vivarium', 'fac.cageConsole'],
    ]) {
      const e = byDef(g, zone(g, key).id, def)
      expect(e.stats.invuln, def).toBe(true)
      damage(g, null, e, 1e6, { pure: true })
      expect(e.alive, def).toBe(true)
      expect((entView(g, ps[0], e).fl ?? 0) & EntFlag.Invuln, def).toBeTruthy()
    }
    const vendorHp = (ref: string) => [...g.world.ents.values()].find((e) => e.data.vendor === ref)!.maxHp
    expect(vendorHp('escapePod')).toBe(8000)
    expect(vendorHp('radar')).toBe(8000)
    expect(vendorHp('lq')).toBe(6000)
    for (const s of ['suitA', 'suitB', 'suitC', 'suitD']) expect(vendorHp(s), s).toBe(800)
    expect(byDef(g, zone(g, 'cinder').id, 'fac.moduleFactory').maxHp).toBe(3000)
  })

  it('模組安裝座空著時無敵、快照帶 Invuln 旗標；裝上掃描增幅模組後旗標拿掉', () => {
    const { h, g, ps } = setup(3)
    h.ticks(1)
    const az = zone(g, 'adjudicatrix')
    const sock = byDef(g, az.id, 'fac.moduleSocket')
    for (const s of [...g.world.ents.values()].filter((e) => e.def.id === 'fac.moduleSocket')) expect((entView(g, ps[0], s).fl ?? 0) & EntFlag.Invuln).toBeTruthy()
    near(g, ps[1], sock)
    useOn(h, g, ps[1], 'modScanAmp', sock)
    expect(sock.data.module).toBe('modScanAmp')
    h.ticks(2)
    expect((entView(g, ps[0], sock).fl ?? 0) & EntFlag.Invuln).toBeFalsy()
  })
})

describe('鑄造台自動重建', () => {
  it('帶著記憶核心走進鑄造平台就自動開始重建；平台外不會；30 秒後在平台重生', () => {
    const { h, g, ps, cs } = setup(3)
    const az = zone(g, 'adjudicatrix')
    const pads = markersOf(az).fabricatorPad!
    const a = ps[1]
    g.setRole(a, 'android')
    g.killEnt(main(g, a), null)
    h.ticks(2)
    expect(a.alive).toBe(false)
    const coreEnt = g.world.get(a.data.core as number)!
    const core = coreEnt.data.item
    g.world.remove(coreEnt)
    const r = main(g, ps[2])
    r.inv!.fill(null)
    standAt(g, r, az.id, pads[4].x, pads[4].y - 6)
    giveItem(g, r, core)
    h.ticks(10)
    expect(r.inv!.some((i) => i?.id === 'memoryCore')).toBe(true)
    clearRaw(h)
    standAt(g, r, az.id, pads[4].x, pads[4].y)
    h.ticks(10)
    expect(r.inv!.some((i) => i?.id === 'memoryCore')).toBe(false)
    expect(r.inv!.some((i) => i?.id === 'overrideRemote')).toBe(true)
    expect(chatOf(h, cl(cs, ps[2])).some((x) => x.startsWith('@fab.autoRebuild'))).toBe(true)
    expect(chatOf(h, cl(cs, a)).some((x) => x.startsWith('@fab.youRebuild'))).toBe(true)
    sec(h, 31)
    expect(a.alive).toBe(true)
    const nu = main(g, a)
    expect(nu.zone).toBe(az.id)
    expect(pads.some((p) => Math.hypot(p.x - nu.x, p.y - nu.y) < 1.5)).toBe(true)
  })
})

describe('洩漏', () => {
  it('雜物箱、籠子控制台取標本、綏靖機器人、強化劑：快照與訊息不洩漏', () => {
    const { h, g, ps } = setup(4, { stations: ['vivarium'] })
    g.setRole(ps[2], 'xeno')
    h.leakWatch = true
    h.ticks(2)
    g.triggerEvent!('enhancer', true)
    g.triggerEvent!('pirate', true)
    const vz = zone(g, 'vivarium')
    const con = byDef(g, vz.id, 'fac.cageConsole')
    near(g, ps[1], con, 1.6)
    h.ticks(2)
    g.handleCommand(ps[1].slot, { k: 'facility', e: con.id, a: 'cage' })
    sec(h, 10.5)
    for (let i = 0; i < 6; i++) {
      g.handleCommand(ps[1].slot, { k: 'facility', e: con.id, a: 'cageCell', s: i })
      h.ticks(2)
    }
    setPowerMode(g, 'lab')
    const nz = zone(g, 'nyx')
    standAt(g, main(g, ps[3]), nz.id, byDef(g, nz.id, 'npc.pacifier').x + 3, byDef(g, nz.id, 'npc.pacifier').y)
    standAt(g, main(g, ps[2]), nz.id, byDef(g, nz.id, 'struct.enhancer').x + 1, byDef(g, nz.id, 'struct.enhancer').y)
    sec(h, 3)
    const box = crates(g, nz.id)[0]
    damage(g, main(g, ps[0]), box, 9999, { pure: true })
    sec(h, 1)
    expect([...new Set(h.drainLeaks())]).toEqual([])
  })
})
