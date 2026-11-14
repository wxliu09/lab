// 練習 AI 換站：拿著檢測器、附近好一陣子沒有可以抽的人時，開停泊的船去別的站找人
// （走到船邊登船→站上控制台發射→駕駛前往目標站→停靠→下船）；只去能停靠的站，不會卡在太空或船艙
import { describe, expect, it } from 'vitest'
import { Harness } from './helpers/harness'
import { giveItem, makeItem } from '../../src/sim/systems/items'
import { spaceOf } from '../../src/sim/systems/space'
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
}
const brain = (p: GamePlayer) =>
  p.data.brain as { trip: TripView | null; trips: number; peopleAt: number; seen: Map<string, { zone: number; x: number; y: number; t: number }>; visited: Map<number, number> }

/**
 * 主機（不動）放在豪勇號、一個人類 AI 放在女帝號的停機坪附近，手上有檢測器：女帝號沒有別人可以抽。
 * 回傳 AI 與它換站的過程紀錄（每秒一筆：所在 zone）
 */
function setup(seed: number, stations?: string[]) {
  const { h } = Harness.started(1, seed, { bots: 1, eventMult: 0, npcCrew: 0, ...(stations ? { stations } : {}) })
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
