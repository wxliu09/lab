// 練習 AI 換站：拿著檢測器、附近好一陣子沒有可以抽的人時，開停泊的船去別的站找人
// （走到船邊登船→站上控制台發射→駕駛前往目標站→停靠→下船）；只去能停靠的站，不會卡在太空或船艙
import { describe, expect, it } from 'vitest'
import { Harness } from './helpers/harness'
import { giveItem, makeItem } from '../../src/sim/systems/items'
import { consolePos, spaceOf } from '../../src/sim/systems/space'
import { damage } from '../../src/sim/systems/damage'
import { SPACE_ZONE } from '../../src/sim/world'
import type { Ent } from '../../src/sim/ent'
import type { Game, GamePlayer } from '../../src/sim/game'

/** 不保留訊息（長時間模擬時省記憶體）；each 回傳 true 就提早結束 */
function run(h: Harness, n: number, each?: () => boolean | void): void {
  for (let i = 0; i < n; i++) {
    h.ticks(1)
    for (const r of h.raw.values()) r.length = 0
    for (const c of h.clients.values()) {
      c.snaps.length = 0
      c.inbox.length = 0
    }
    if (each?.()) return
  }
}

function zone(g: Game, key: string) {
  return g.world.zones.find((z) => z.key === key)!
}

function place(g: Game, u: Ent, zid: number, x: number, y: number): void {
  const z = g.world.zones[zid]
  const n = z.nav!.nearestOpen(x, y) ?? { x, y }
  g.world.relocate(u, zid, n.x, n.y)
  u.order = null
  u.queue.length = 0
  u.path = null
}

interface TripView {
  from: number
  to: number
  ship: string
  stage: string
  flown?: boolean
}
const brain = (p: GamePlayer) =>
  p.data.brain as { trip: TripView | null; trips: number; tripAt: number; peopleAt: number; seen: Map<string, { zone: number; x: number; y: number; t: number }>; visited: Map<number, number> }

/**
 * 主機（不動）放在豪勇號、一個人類 AI 放在女帝號的停機坪附近，手上有檢測器：女帝號沒有別人可以抽。
 * 回傳 AI 與它換站的過程紀錄（每秒一筆：所在 zone）
 */
function setup(seed: number, stations: string[] = []) {
  // 預設只放核心站（這些情境是照 2 人局只有核心站時寫的；auto 規則照原作後 2 人局也有活體庫號、擺渡號，換站路線與時間都會變）
  const { h } = Harness.started(1, seed, { bots: 1, eventMult: 0, npcCrew: 0, stations })
  const g = h.server.game!
  const ps = g.allPlayers()
  for (const p of ps) g.setRole(p, 'human')
  const bot = ps.find((p) => p.bot)!
  const host = ps.find((p) => !p.bot)!
  const nyx = zone(g, 'nyx')
  const bravado = zone(g, 'bravado')
  const hm = g.mainOf(host)!
  place(g, hm, bravado.id, bravado.layout!.spawns[0].x, bravado.layout!.spawns[0].y)
  hm.data.frozen = true
  const u = g.mainOf(bot)!
  const inst = [...spaceOf(g).ships.values()].find((s) => s.docked?.zone === nyx.id)!
  const de = g.world.get(inst.dockedEnt)!
  place(g, u, nyx.id, de.x, de.y - de.radius - 3)
  u.inv!.fill(null)
  u.suit = null
  giveItem(g, u, makeItem('geneSampler'))
  return { h, g, bot, host, u, nyx, bravado }
}

describe('練習 AI 換站', () => {
  it('從女帝號開船到另一站、停靠、下船；船留在那個站，AI 不再駕駛', () => {
    const { h, g, bot, nyx } = setup(51)
    const u = () => g.mainOf(bot)!
    const stages = new Set<string>()
    let flew = false
    run(h, 20 * 60 * 5, () => {
      const t = brain(bot).trip
      if (t) stages.add(t.stage)
      if (g.controlOf(bot)?.zone === SPACE_ZONE) flew = true
      return brain(bot).trips > 0 && !g.world.zones[u().zone].data.ship
    })
    expect([...stages].sort()).toEqual(['cabin', 'fly', 'walk'])
    expect(flew).toBe(true)
    expect(brain(bot).trips).toBe(1)
    expect(brain(bot).trip).toBe(null)
    const z = g.world.zones[u().zone]
    expect(z.station && !z.data.ship).toBeTruthy()
    expect(z.id).not.toBe(nyx.id)
    expect(z.station!.dockable).not.toBe(false)
    expect(bot.control).toBe(bot.main)
    // 搭的船停在那個站，過一陣子也沒有被重新發射（停靠時鎖住控制台）
    const inst = [...spaceOf(g).ships.values()].find((s) => s.docked?.zone === z.id && !g.world.inZone(s.zone).some((e) => e.isMain))
    expect(inst).toBeTruthy()
    run(h, 20 * 20)
    expect(inst!.docked?.zone).toBe(z.id)
    expect(inst!.launching).toBe(false)
  }, 120000)

  it('目標用 AI 自己的線索：最後在豪勇號看到還沒抽過的人，就去豪勇號', () => {
    const { h, g, bot, host, bravado } = setup(52)
    // AI 先前在豪勇號看過主機（自己的視野記下的）
    brain(bot).seen.set(host.name, { zone: bravado.id, x: 10, y: 10, t: g.time })
    let to = -1
    run(h, 20 * 60 * 3, () => {
      const t = brain(bot).trip
      if (t && to < 0) to = t.to
      return to >= 0
    })
    expect(to).toBe(bravado.id)
  }, 120000)

  it('接近目標站先用船上的生命掃描：裡面沒人就改去別的站（最後到有人的豪勇號）', () => {
    const { h, g, bot, host, bravado } = setup(54)
    const adj = zone(g, 'adjudicatrix')
    // 線索指向審判官號（其實已經沒人了）
    for (const p of g.allPlayers()) if (p !== bot && g.mainOf(p)!.zone === adj.id) place(g, g.mainOf(p)!, bravado.id, bravado.layout!.spawns[1].x, bravado.layout!.spawns[1].y)
    brain(bot).seen.set(host.name, { zone: adj.id, x: 10, y: 10, t: g.time })
    // 翠原星剛找過（改目標時只剩豪勇號可選，結果固定）
    brain(bot).visited.set(zone(g, 'verdance').id, g.time)
    const tos: string[] = []
    run(h, 20 * 60 * 6, () => {
      const t = brain(bot).trip
      const k = t ? g.world.zones[t.to].key : ''
      if (k && tos[tos.length - 1] !== k) tos.push(k)
      return brain(bot).trips > 0 && !g.world.zones[g.mainOf(bot)!.zone].data.ship
    })
    expect(tos).toEqual(['adjudicatrix', 'bravado'])
    expect(g.world.zones[g.mainOf(bot)!.zone].key).toBe('bravado')
  }, 120000)

  it('只去能停靠的站：火口號、擺渡號（只能強行登艦）、七號廢站不會是目標', () => {
    const targets = new Set<string>()
    for (const seed of [61, 62, 63, 64, 65, 66]) {
      const { h, g, bot } = setup(seed, ['caldera', 'portage'])
      run(h, 20 * 60 * 3, () => {
        const t = brain(bot).trip
        if (t) targets.add(g.world.zones[t.to].key)
        return !!t
      })
    }
    expect(targets.size).toBeGreaterThan(0)
    for (const k of ['caldera', 'portage', 'hulk7']) expect(targets.has(k)).toBe(false)
  }, 120000)

  it('飛行中目標站被毀：改去最近還能停靠的站，不會漂在太空中', () => {
    const { h, g, bot, nyx } = setup(53)
    let destroyed = ''
    let docked = false
    run(h, 20 * 60 * 6, () => {
      const t = brain(bot).trip
      const v = g.controlOf(bot)
      if (t && t.stage === 'fly' && !destroyed && v && v.zone === SPACE_ZONE) {
        destroyed = g.world.zones[t.to].key
        g.destroyStation!(destroyed)
      }
      if (destroyed && brain(bot).trips > 0 && !g.world.zones[g.mainOf(bot)!.zone].data.ship) docked = true
      return docked
    })
    expect(destroyed).not.toBe('')
    expect(docked).toBe(true)
    const z = g.world.zones[g.mainOf(bot)!.zone]
    expect(z.key).not.toBe(destroyed)
    expect(z.id).not.toBe(nyx.id)
    expect(bot.control).toBe(bot.main)
  }, 120000)
})

/** 跑到 AI 換站進入某個狀態（each 回傳 true）為止；跑不到就失敗 */
function until(h: Harness, n: number, cond: () => boolean): void {
  let ok = false
  run(h, n, () => (ok = cond()))
  expect(ok).toBe(true)
}

describe('練習 AI 換站：防卡住（第 5 輪回歸審查）', () => {
  const tripShip = (g: Game, bot: GamePlayer) => spaceOf(g).ships.get(brain(bot).trip!.ship)!

  it('停泊中的船在發射倒數時有真人上船：AI 不發射（不把人載走），放棄換站、下船', () => {
    const { h, g, bot, host, nyx } = setup(51)
    until(h, 20 * 60 * 4, () => {
      const t = brain(bot).trip
      return !!t && t.stage === 'cabin' && tripShip(g, bot).launching
    })
    const inst = tripShip(g, bot)
    const cz = g.world.zones[inst.zone]
    const c = consolePos(g, cz)!
    // 真人走進船艙（站在控制台旁邊、不在控制台上）
    const hm = g.mainOf(host)!
    const n = cz.nav!.nearestOpen(c.x, c.y + 1.8)!
    g.world.relocate(hm, cz.id, n.x, n.y)
    let launched = false
    run(h, 20 * 25, () => {
      if (!inst.docked) launched = true
    })
    expect(launched).toBe(false)
    expect(inst.docked?.zone).toBe(nyx.id)
    expect(inst.launching).toBe(false)
    expect(brain(bot).trip).toBe(null)
    expect(brain(bot).trips).toBe(0)
    // AI 下船回到女帝號
    expect(g.mainOf(bot)!.zone).toBe(nyx.id)
  }, 120000)

  it('在船艙等發射時挨打：放棄換站', () => {
    const { h, g, bot } = setup(51)
    until(h, 20 * 60 * 4, () => brain(bot).trip?.stage === 'cabin')
    const u = g.mainOf(bot)!
    damage(g, null, u, 1, { pure: true })
    run(h, 20 * 2)
    expect(brain(bot).trip).toBe(null)
  }, 120000)

  it('太空中別人在開船：AI 不搶控制台、不一直站在控制台旁；停靠後就下船（算換站完成）', () => {
    const { h, g, bot, host, nyx } = setup(51)
    const hm = g.mainOf(host)!
    hm.data.frozen = false
    const inst = [...spaceOf(g).ships.values()].find((s) => s.docked?.zone === nyx.id)!
    const cz = g.world.zones[inst.zone]
    const c = consolePos(g, cz)!
    // 真人駕駛把船開出去（AI 還在女帝號、還沒開始換站）
    brain(bot).tripAt = 1e9
    g.world.relocate(hm, cz.id, c.x, c.y)
    hm.order = null
    run(h, 20 * 12)
    const v = g.controlOf(host)!
    expect(v.zone).toBe(SPACE_ZONE)
    // AI 在太空中的船艙裡、換站進行中（船艙階段，不是駕駛）
    const u = g.mainOf(bot)!
    const n = cz.nav!.nearestOpen(c.x, c.y + 1.8)!
    g.world.relocate(u, cz.id, n.x, n.y)
    u.order = null
    const target = g.world.zones.find((z) => z.alive && z.station && !z.data.ship && z.id !== nyx.id && z.station.dockable !== false && spaceOf(g).pads.get(z.id)?.some((x) => !x) && g.world.get(z.spaceEnt))!
    brain(bot).trip = { from: nyx.id, to: target.id, ship: inst.key, stage: 'cabin', at: g.time, start: g.time, side: 'crew', sx: 0, sy: 0, st: g.time } as never
    brain(bot).tripAt = 0
    let toConsole = false
    run(h, 20 * 20, () => {
      const o = g.mainOf(bot)!.order
      if (o?.k === 'move' && o.x === c.x && o.y === c.y) toConsole = true
    })
    // 修正前：一直往控制台走（站在旁邊等）
    expect(toConsole).toBe(false)
    expect(spaceOf(g).pilots.get(v.id)).toBe(hm.id)
    expect(brain(bot).trip?.flown).toBe(true)
    // 真人停靠到目標站：AI 下船、換站完成
    const te = g.world.get(target.spaceEnt)!
    g.world.relocate(v, SPACE_ZONE, te.x + te.radius + v.radius + 1, te.y)
    g.handleCommand(host.slot, { k: 'cast', a: 'ship.dock', e: te.id })
    until(h, 20 * 60, () => g.mainOf(bot)!.zone === target.id)
    expect(inst.docked?.zone).toBe(target.id)
    expect(brain(bot).trips).toBe(1)
    expect(brain(bot).trip).toBe(null)
  }, 120000)

  it('飛行中所有站都停不了：停下來等，等太久就放棄換站、交回控制台（不會一直開著船漂）', () => {
    const { h, g, bot } = setup(51)
    until(h, 20 * 120, () => brain(bot).trip?.stage === 'fly' && g.controlOf(bot)?.zone === SPACE_ZONE)
    // 所有停機坪都被占住
    for (const pads of spaceOf(g).pads.values()) pads.fill('blocked')
    const t0 = g.time
    until(h, 20 * 60, () => !brain(bot).trip)
    expect(g.time - t0).toBeGreaterThan(20)
    run(h, 20 * 3)
    expect(bot.control).toBe(bot.main)
    expect(g.controlOf(bot)!.zone).not.toBe(SPACE_ZONE)
  }, 120000)

  it('停靠一直失敗：同一站重試有上限，改去別的站（不回頭選失敗過的），改太多次就放棄', () => {
    const { h, g, bot } = setup(51)
    until(h, 20 * 120, () => brain(bot).trip?.stage === 'fly' && g.controlOf(bot)?.zone === SPACE_ZONE)
    // 停靠指令一下就被丟掉（模擬停靠一直失敗）
    const v = g.controlOf(bot)!
    v.abilities = v.abilities.filter((a) => a !== 'ship.dock')
    const tos: number[] = []
    const failed = new Set<number>()
    let revisit = false
    until(h, 20 * 120, () => {
      const t = brain(bot).trip as (TripView & { failed?: number[] }) | null
      if (!t) return true
      if (tos[tos.length - 1] !== t.to) {
        if (failed.has(t.to)) revisit = true
        tos.push(t.to)
      }
      for (const z of t.failed ?? []) failed.add(z)
      return false
    })
    expect(tos.length).toBeGreaterThan(1)
    expect(failed.size).toBeGreaterThan(1)
    expect(revisit).toBe(false)
    // 改目標有上限：一開始的目標＋最多 4 次（另外最多一次生命掃描改目標）
    expect(tos.length).toBeLessThanOrEqual(6)
    run(h, 20 * 3)
    expect(bot.control).toBe(bot.main)
  }, 120000)

  it('換站途中被轉化（變成異類的 spawn）：放棄換站，交回控制台', () => {
    const { h, g, bot } = setup(51)
    until(h, 20 * 120, () => brain(bot).trip?.stage === 'fly' && g.controlOf(bot)?.zone === SPACE_ZONE)
    g.convertToSpawn(bot.slot, 'xeno')
    run(h, 20 * 3)
    expect(brain(bot).trip).toBe(null)
    expect(bot.control).toBe(bot.main)
    // 之後也不會再接回控制台繼續飛
    run(h, 20 * 10)
    expect(bot.control).toBe(bot.main)
  }, 120000)
})
