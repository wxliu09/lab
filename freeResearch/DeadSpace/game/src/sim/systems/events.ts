// 隨機事件導演與末日（GDD §7.8、研究 03 §6）。
// 修正原作讓事件鏈永久中斷的 bug（空事件、門故障、新聞用完）；加入原作沒接上的三個事件。
// 由測試或除錯觸發的事件（forced）走完全相同的路徑：系統訊息不提觸發者，看起來就像隨機抽到。
import { ALL_STATIONS } from '../../shared/content/stations/index'
import { unitDef } from '../../shared/content/registry'
import { HOSTILE, NEUTRAL, dist2, type Ent } from '../ent'
import type { Game, GamePlayer } from '../game'
import { addStation, markersOf } from '../setup'
import { SPACE_HALF, SPACE_ZONE, type Zone } from '../world'
import { populateZone, spawnCreature } from '../ai/creatures'
import { DEATH_HOOKS, damage } from './damage'
import { EXTRA_COMMANDS } from './orders'
import { giveItem, makeItem } from './items'
import { restockAll } from './vendors'
import { destroyInterior, spaceOf } from './space'
import { recomputeStats } from './buffs'

type Range = [number, number]

interface EventDef {
  id: string
  /** 一次性：生效後不再抽到 */
  once: boolean
  /** 下一個事件的延遲（秒）*/
  next: Range
  /** 前置條件（不成立就不會被抽到）*/
  ok?: (g: Game) => boolean
  /** 回傳 false = 這次沒有生效（假結束畫面 5/6 的情況）*/
  run: (g: Game, forced: boolean) => boolean
}

interface Asteroid {
  id: number
  vx: number
  vy: number
}

export interface EventState {
  next: number
  used: Set<string>
  /** 「有東西要來了」剩下的連發數 */
  chain: number
  chainNext: number
  news: number[]
  /** 末日 */
  apocAt: number
  apocWarned: boolean
  apoc: '' | 'fleet' | 'orbit'
  apocStart: number
  fleetAt: number
  fleetPos: { x: number; y: number }
  /** 無人機艦隊 */
  waspLeft: number
  waspNext: number
  /** 門故障到期 */
  doorsUntil: number
  doorPhase: Map<string, boolean>
  /** 小行星 */
  waves: number[]
  waveNext: number
  rocks: Asteroid[]
  /** 未識別物體 */
  uoZone: number
  uoUntil: number
  /** 海盜船 */
  pirateZone: number
  pirateBoom: number
  pirateWander: number
  /** 天守砲台收容失效 */
  tenshuUntil: number
  /** 強化劑 */
  enhancer: boolean
}

export function eventsOf(g: Game): EventState {
  return g.data.events as EventState
}

const R = (g: Game, r: Range) => g.world.rng.range(r[0], r[1])
const zoneByKey = (g: Game, key: string): Zone | undefined => g.world.zones.find((z) => z.key === key && z.alive)
const stationDef = (id: string) => ALL_STATIONS.find((s) => s.id === id)
const humans = (g: Game) => g.allPlayers().filter((p) => !p.spectator)

/** 原作 KIRZ95 新聞的位置：12 則原創頭條（只是氛圍）*/
const NEWS = 12
/** 強化劑五選一（研究 03 §6.2 #8）*/
export const ENHANCE = ['speed', 'hp', 'atk', 'mp', 'range'] as const

// ───────── 事件表 ─────────

const EVENTS: EventDef[] = [
  {
    id: 'promotion',
    once: true,
    next: [180, 900],
    ok: (g) => g.allPlayers().some((p) => p.classId === 'commissar' && p.alive && g.faction(p) === 'crew' && !!g.mainOf(p)),
    run: (g) => {
      const p = g.allPlayers().find((q) => q.classId === 'commissar' && q.alive && g.faction(q) === 'crew')
      const u = p ? g.mainOf(p) : undefined
      if (!p || !u) return false
      giveItem(g, u, makeItem('suit.operative'))
      g.systemAll('event.promotion', { name: p.baseName })
      p.name = '特務·' + p.baseName
      u.name = p.name
      g.log(`${p.baseName} 獲得晉升`)
      return true
    },
  },
  {
    id: 'wormhole',
    once: true,
    next: [90, 900],
    ok: (g) => !!stationDef('uo') && !zoneByKey(g, 'uo'),
    run: (g) => {
      const st = stationDef('uo')!
      const z = addEventStation(g, st.id, st.space.pos)
      const ev = eventsOf(g)
      ev.uoZone = z.id
      ev.uoUntil = g.time + 397
      z.data.code = String(g.world.rng.int(1000, 9999))
      const se = g.world.get(z.spaceEnt)
      if (se) g.emitFx({ k: 'ping', z: SPACE_ZONE, x: se.x, y: se.y, v: 15, s: 'event' })
      g.systemAll('event.wormhole', { m: 6, s: 37 })
      g.log('蟲洞物體出現')
      return true
    },
  },
  {
    id: 'windfall',
    once: true,
    next: [90, 1200],
    run: (g) => {
      restockAll(g)
      g.systemAll('event.windfall')
      return true
    },
  },
  {
    id: 'pirate',
    once: true,
    next: [90, 1200],
    ok: (g) => !!stationDef('pirate') && !zoneByKey(g, 'pirate'),
    run: (g) => {
      const rng = g.world.rng
      const at: [number, number] = [rng.range(-32, 32), rng.range(-32, 32)]
      const z = addEventStation(g, 'pirate', at, HOSTILE)
      const ev = eventsOf(g)
      ev.pirateZone = z.id
      ev.pirateWander = 0
      const se = g.world.get(z.spaceEnt)
      if (se) {
        se.acquire = true
        g.emitFx({ k: 'ping', z: SPACE_ZONE, x: se.x, y: se.y, v: 10, s: 'event' })
      }
      g.systemAll('event.pirate')
      g.log('海盜船出現')
      return true
    },
  },
  {
    id: 'breeding',
    once: true,
    next: [90, 1200],
    ok: (g) => [...g.world.ents.values()].some((e) => e.alive && e.def.id === 'creature.slugling' && e.owner === NEUTRAL),
    run: (g) => {
      for (const e of [...g.world.ents.values()]) {
        if (!e.alive || e.def.id !== 'creature.slugling' || e.owner !== NEUTRAL) continue
        const { zone, x, y } = e
        const cell = e.data.cell
        g.world.remove(e)
        const s = spawnCreature(g, 'creature.snowgle', zone, x, y)
        if (s && cell !== undefined) s.data.cell = cell
      }
      g.systemAll('event.breeding')
      return true
    },
  },
  {
    id: 'anomalies',
    once: true,
    next: [90, 1200],
    ok: (g) => anomalyHosts(g).length > 0,
    run: (g) => {
      const hosts = anomalyHosts(g)
      if (!hosts.length) return false
      for (let i = 0; i < 12; i++) {
        const u = g.world.rng.pick(hosts)
        spawnCreature(g, 'creature.anomaly', u.zone, u.x, u.y, 2.5)
      }
      g.systemAll('event.anomalies')
      return true
    },
  },
  {
    id: 'news',
    once: false,
    next: [10, 300],
    ok: (g) => eventsOf(g).news.length > 0,
    run: (g) => {
      const ev = eventsOf(g)
      const i = g.world.rng.int(0, ev.news.length - 1)
      const n = ev.news.splice(i, 1)[0]
      g.systemAll('news.' + n)
      return true
    },
  },
  {
    id: 'enhancer',
    once: true,
    next: [10, 1200],
    ok: (g) => !!enhancerEnt(g),
    run: (g) => {
      const e = enhancerEnt(g)
      if (!e) return false
      eventsOf(g).enhancer = true
      g.emitFx({ k: 'ping', z: e.zone, x: e.x, y: e.y, v: 12, s: 'event' })
      g.systemAll('event.enhancer')
      return true
    },
  },
  {
    id: 'wasps',
    once: true,
    next: [140, 1250],
    run: (g) => {
      const ev = eventsOf(g)
      ev.waspLeft = 50
      ev.waspNext = g.time
      g.systemAll('event.wasps')
      return true
    },
  },
  {
    id: 'solar',
    once: true,
    next: [90, 1200],
    run: (g) => {
      spaceOf(g).sunFactor = 6 / 1.7
      g.emitFx({ k: 'solar', z: SPACE_ZONE, x: 6.5, y: -2.9 })
      g.systemAll('event.solar')
      return true
    },
  },
  {
    id: 'doors',
    once: false,
    next: [400, 1400],
    ok: (g) => eventsOf(g).doorsUntil <= g.time,
    run: (g) => {
      eventsOf(g).doorsUntil = g.time + R(g, [300, 600])
      g.systemAll('event.doors')
      return true
    },
  },
  {
    id: 'asteroids',
    once: true,
    next: [90, 1200],
    run: (g) => {
      const ev = eventsOf(g)
      ev.waves = [8, 9, 10, 11, 12]
      ev.waveNext = g.time
      g.systemAll('event.asteroids')
      return true
    },
  },
  {
    id: 'ad',
    once: true,
    next: [10, 300],
    run: (g) => {
      g.systemAll('event.ad')
      return true
    },
  },
  {
    id: 'foul',
    once: true,
    next: [240, 600],
    run: (g) => {
      const ev = eventsOf(g)
      ev.chain = 3
      ev.chainNext = g.time + R(g, [15, 30])
      g.systemAll('event.foul')
      return true
    },
  },
  {
    id: 'fakeEnd',
    once: true,
    next: [10, 300],
    run: (g, forced) => {
      if (!forced && !g.world.rng.chance(1 / 6)) return false
      g.systemAll('event.fakeEnd')
      for (const p of g.allPlayers()) g.emitFx({ k: 'fakeEnd', z: -1, x: 0, y: 0, v: 6 }, [p.slot])
      g.after(6, () => g.systemAll('event.fakeEnd2'))
      return true
    },
  },
  {
    id: 'virus',
    once: true,
    next: [90, 1200],
    ok: (g) => humans(g).length >= 2,
    run: (g) => {
      const ps = humans(g)
      for (const p of ps) setShownName(g, p, '', p.color)
      g.systemAll('event.virus')
      g.after(10, () => {
        const names = g.world.rng.shuffle(ps.map((p) => p.baseName))
        const colors = g.world.rng.shuffle(ps.map((p) => p.color))
        ps.forEach((p, i) => setShownName(g, p, names[i], colors[i]))
        g.systemAll('event.virusDone')
      })
      return true
    },
  },
  {
    id: 'slugSwarm',
    once: true,
    next: [90, 1200],
    run: (g) => {
      const rng = g.world.rng
      for (const z of g.world.zones) {
        if (!z.alive || !z.layout || !z.station || z.station.outdoor || z.station.enable === 'event' || z.key.startsWith('ship:')) continue
        const rooms = z.layout.rooms.filter((r) => r.cells >= 20)
        if (!rooms.length) continue
        const n = z.key === 'nyx' ? 16 : 8
        for (let i = 0; i < n; i++) {
          const r = rng.pick(rooms)
          spawnCreature(g, 'creature.slugling', z.id, r.cx, r.cy, 2)
        }
      }
      g.systemAll('event.slugSwarm')
      return true
    },
  },
  {
    id: 'tenshu',
    once: true,
    next: [90, 1200],
    ok: (g) => !!zoneByKey(g, 'tenshu') && !!zoneByKey(g, 'verdance'),
    run: (g) => {
      eventsOf(g).tenshuUntil = g.time + 180
      g.systemAll('event.tenshu', { s: 180 })
      return true
    },
  },
]

const BY_ID = new Map(EVENTS.map((e) => [e.id, e]))

function anomalyHosts(g: Game): Ent[] {
  return g.allPlayers()
    .filter((p) => p.alive)
    .map((p) => g.mainOf(p))
    .filter((u): u is Ent => !!u && u.alive && u.zone !== SPACE_ZONE && !!g.world.zones[u.zone].nav)
}

function enhancerEnt(g: Game): Ent | undefined {
  const nyx = zoneByKey(g, 'nyx')
  if (!nyx) return undefined
  return g.world.inZone(nyx.id).find((e) => e.def.id === 'struct.enhancer' && e.alive)
}

/** 名字與顏色（通訊病毒）：玩家、主單位、聊天都跟著變 */
function setShownName(g: Game, p: GamePlayer, name: string, color: number): void {
  p.name = name
  p.color = color
  const u = g.mainOf(p)
  if (u) {
    u.name = name
    u.color = color
  }
}

/** 事件站：建立 zone、登錄停機坪、生成站內生物；告知所有 client 新的 zone */
function addEventStation(g: Game, id: string, pos: [number, number], owner = NEUTRAL): Zone {
  const st = stationDef(id)!
  const z = addStation(g, st, pos, owner)
  spaceOf(g).pads.set(z.id, z.layout!.pads.map(() => null))
  populateZone(g, z)
  g.zonesChanged?.()
  return z
}

// ───────── 觸發 ─────────

function fire(g: Game, id: string, forced: boolean): boolean {
  const ev = eventsOf(g)
  const def = BY_ID.get(id)
  if (!def || g.ended) return false
  if (def.once && ev.used.has(id)) return false
  if (def.ok && !def.ok(g)) return false
  let ran = false
  try {
    ran = def.run(g, forced)
  } catch (e) {
    if (__DEV__) console.error('[event]', id, e)
  }
  if (ran && def.once) ev.used.add(id)
  return ran
}

function candidates(g: Game, inChain: boolean): EventDef[] {
  const ev = eventsOf(g)
  return EVENTS.filter((d) => !(d.once && ev.used.has(d.id)) && !(inChain && d.id === 'foul') && (!d.ok || d.ok(g)))
}

function drawAndFire(g: Game, inChain: boolean): EventDef | null {
  const list = candidates(g, inChain)
  if (!list.length) return null
  const d = g.world.rng.pick(list)
  fire(g, d.id, false)
  return d
}

// ───────── 末日 ─────────

function startApocalypse(g: Game, kind: 'fleet' | 'orbit'): boolean {
  const ev = eventsOf(g)
  if (ev.apoc || g.ended) return false
  ev.apoc = kind
  ev.apocStart = g.time
  ev.apocWarned = true
  if (kind === 'fleet') {
    const rng = g.world.rng
    const edge = rng.int(0, 3)
    const s = SPACE_HALF - 4
    const t = rng.range(-s, s)
    ev.fleetPos = edge === 0 ? { x: -s, y: t } : edge === 1 ? { x: s, y: t } : edge === 2 ? { x: t, y: -s } : { x: t, y: s }
    ev.fleetAt = g.time + 120
    g.systemAll('apoc.fleet', { s: 120 })
    if (zoneByKey(g, 'adjudicatrix')) g.emitFx({ k: 'ping', z: SPACE_ZONE, x: ev.fleetPos.x, y: ev.fleetPos.y, v: 120, s: 'fleet' })
  } else {
    g.data.orbitsStopped = true
    g.systemAll('apoc.orbit')
    g.emitFx({ k: 'orbitFail', z: SPACE_ZONE, x: 6.5, y: -2.9 })
  }
  g.log(kind === 'fleet' ? '末日：艦隊清場' : '末日：軌道穩定器失效')
  return true
}

function stepApocalypse(g: Game, ev: EventState): void {
  const t = g.time
  if (!ev.apoc) {
    if (!ev.apocWarned && t >= ev.apocAt - 60) {
      ev.apocWarned = true
      g.systemAll('apoc.warn')
    }
    if (t >= ev.apocAt) startApocalypse(g, g.world.rng.chance(0.5) ? 'fleet' : 'orbit')
    return
  }
  if (ev.apoc === 'fleet' && ev.fleetAt > 0 && t >= ev.fleetAt) {
    ev.fleetAt = 0
    const { x, y } = ev.fleetPos
    const ids = ['fleet.hydra', 'fleet.censure', 'fleet.erstfall', ...Array(6).fill('fleet.kestrel')]
    ids.forEach((id, i) => {
      const a = (i / ids.length) * Math.PI * 2
      spawnCreature(g, id, SPACE_ZONE, x + Math.cos(a) * 3, y + Math.sin(a) * 3)
    })
    // 海盜船改為中立
    const pz = g.world.zones[ev.pirateZone]
    const ps = pz?.alive ? g.world.get(pz.spaceEnt) : undefined
    if (ps) {
      ps.owner = NEUTRAL
      ps.acquire = false
      ps.order = null
    }
    g.systemAll('apoc.fleetArrive')
  }
  if (ev.apoc === 'orbit') {
    // 所有太空物體被拉向恆星：船與太空形態以（自身移速＋0.15）m/s，其餘 0.25 m/s
    const sun = g.world.inZone(SPACE_ZONE).find((e) => e.def.id === 'space.sun')
    if (sun) {
      const dt = 1 / 20
      for (const e of g.world.inZone(SPACE_ZONE)) {
        if (e === sun || !e.alive || e.tags.has('noTarget')) continue
        const dx = sun.x - e.x
        const dy = sun.y - e.y
        const d = Math.hypot(dx, dy)
        if (d < 0.05) continue
        const v = e.tags.has('ship') || e.owner >= 0 ? e.stats.speed + 0.15 : 0.25
        const step = Math.min(d, v * dt)
        e.x += (dx / d) * step
        e.y += (dy / d) * step
        g.world.moved(e)
      }
    }
  }
  // 末日後 10 分鐘仍未分出勝負：平手收尾（原作兩位主腦都活著時永不結束）
  if (t >= ev.apocStart + 600 && !g.ended) g.endGame('draw')
}

// ───────── 持續中的事件 ─────────

function stepOngoing(g: Game, ev: EventState): void {
  const t = g.time
  const w = g.world
  const rng = w.rng
  // 胡蜂無人戰機：每秒一架
  if (ev.waspLeft > 0 && t >= ev.waspNext) {
    ev.waspLeft--
    ev.waspNext = t + 1
    const s = SPACE_HALF - 3
    spawnCreature(g, 'ship.wasp', SPACE_ZONE, rng.range(-s, s), rng.range(-s, s))
  }
  // 小行星帶
  if (ev.waves.length && t >= ev.waveNext) {
    const n = ev.waves.shift()!
    for (let i = 0; i < n; i++) spawnRock(g, ev)
    ev.waveNext = t + R(g, [0.1, 5])
  }
  if (ev.rocks.length) stepRocks(g, ev)
  // 門故障：沒有權限需求的門每 2.25 秒猛然關上一次，夾到 225 傷害並擊退
  if (ev.doorsUntil > 0) {
    if (t >= ev.doorsUntil) {
      ev.doorsUntil = 0
      ev.doorPhase.clear()
      g.systemAll('event.doorsFixed')
    } else stepDoorMalfunction(g, ev)
  }
  // 未識別物體：397 秒後解體，內部全滅
  if (ev.uoUntil > 0 && t >= ev.uoUntil) {
    ev.uoUntil = 0
    removeEventStation(g, ev.uoZone)
    g.systemAll('event.wormholeClosed')
  }
  // 海盜船：主控台被毀 → 40 秒自爆；平時在太空中緩慢遊蕩
  const pz = w.zones[ev.pirateZone]
  if (ev.pirateZone > 0 && pz?.alive) {
    if (ev.pirateBoom > 0 && t >= ev.pirateBoom) {
      ev.pirateBoom = 0
      removeEventStation(g, pz.id)
    } else {
      const ship = w.get(pz.spaceEnt)
      if (ship && ship.owner === HOSTILE && t >= ev.pirateWander && (!ship.order || ship.order.k !== 'attack')) {
        ev.pirateWander = t + R(g, [20, 40])
        const s = SPACE_HALF - 8
        ship.order = { k: 'amove', x: rng.range(-s, s), y: rng.range(-s, s) }
      }
    }
  }
  // 天守砲台收容失效
  if (ev.tenshuUntil > 0 && t >= ev.tenshuUntil) {
    ev.tenshuUntil = 0
    g.systemAll('event.tenshuFail')
    g.destroyStation?.('tenshu')
  }
  // 政府強化劑：人員形態走到裝置旁 → 私下提供五選一
  if (ev.enhancer && w.tick % 5 === 0) {
    const e = enhancerEnt(g)
    if (!e) ev.enhancer = false
    else {
      for (const p of g.allPlayers()) {
        const u = g.mainOf(p)
        const near = !!u && u.alive && u.zone === e.zone && dist2(u, e) < 2.2 * 2.2
        if (!near || p.data.enhDone) {
          p.data.enhOffer = false
          continue
        }
        if (u!.def.id !== 'personnel') {
          if (!p.data.enhRefused) g.privateLine(p.slot, 'event.enhNotYou')
          p.data.enhRefused = true
          continue
        }
        p.data.enhOffer = true
      }
    }
  }
}

function removeEventStation(g: Game, zoneId: number): void {
  const z = g.world.zones[zoneId]
  if (!z || !z.alive) return
  const se = g.world.get(z.spaceEnt)
  destroyInterior(g, z.id, null)
  if (se) g.world.remove(se)
  g.stations = g.stations.filter((s) => s !== z.key)
}

function spawnRock(g: Game, ev: EventState): void {
  const rng = g.world.rng
  const sc = rng.range(0.5, 2.5)
  const x = rng.range(-SPACE_HALF + 3, SPACE_HALF - 3)
  const y = -SPACE_HALF + 1.5
  const e = g.world.spawn(unitDef('space.asteroid'), SPACE_ZONE, x, y, HOSTILE)
  e.global = true
  e.acquire = false
  e.radius = 0.9 * sc
  e.maxHp = e.hp = Math.round(20000 * sc)
  e.x2 = { sc: Math.round(sc * 100) / 100 }
  const sp = rng.range(0.2, 0.9)
  let ang = Math.PI / 2 + rng.range(-0.35, 0.35)
  if (rng.chance(0.5)) {
    const targets = g.world.inZone(SPACE_ZONE).filter((o) => o.alive && (o.tags.has('station') || o.tags.has('ship')))
    if (targets.length) {
      const tg = rng.pick(targets)
      ang = Math.atan2(tg.y - y, tg.x - x)
    }
  }
  e.facing = ang
  ev.rocks.push({ id: e.id, vx: Math.cos(ang) * sp, vy: Math.sin(ang) * sp })
}

function stepRocks(g: Game, ev: EventState): void {
  const dt = 1 / 20
  const w = g.world
  ev.rocks = ev.rocks.filter((r) => {
    const e = w.get(r.id)
    if (!e || !e.alive) return false
    e.x += r.vx * dt
    e.y += r.vy * dt
    w.moved(e)
    if (Math.abs(e.x) > SPACE_HALF + 2 || Math.abs(e.y) > SPACE_HALF + 2) {
      w.remove(e)
      return false
    }
    for (const o of w.query(SPACE_ZONE, e.x, e.y, e.radius + 4)) {
      if (o === e || !o.alive || !(o.tags.has('station') || o.tags.has('ship'))) continue
      const rr = e.radius + o.radius
      if (dist2(e, o) > rr * rr) continue
      g.emitFx({ k: 'asteroidHit', z: SPACE_ZONE, x: e.x, y: e.y, v: e.radius })
      if (o.tags.has('station')) {
        damage(g, null, o, e.hp * 4, { kind: 'blast', pure: true })
        w.remove(e)
        return false
      }
      // 船：3000 傷害並被撞開
      damage(g, null, o, 3000, { kind: 'blast', pure: true })
      const d = Math.max(0.01, Math.sqrt(dist2(e, o)))
      o.vx += ((o.x - e.x) / d) * 5
      o.vy += ((o.y - e.y) / d) * 5
      w.remove(e)
      return false
    }
    return true
  })
}

const DOOR_PERIOD = 2.25

function stepDoorMalfunction(g: Game, ev: EventState): void {
  const t = g.time
  for (const z of g.world.zones) {
    if (!z.alive || !z.layout || !z.nav) continue
    for (const d of z.doors) {
      if (d.clearance || d.security || d.locked || d.broken) continue
      const key = z.id + ':' + d.index
      const phase = (t + d.index * 0.37) % DOOR_PERIOD
      const closing = phase >= 0.5
      if (closing) d.forced = t + 0.2
      const was = ev.doorPhase.get(key) ?? false
      ev.doorPhase.set(key, closing)
      if (!closing || was) continue
      // 剛猛然關上：夾到門縫裡的單位
      d.open = false
      z.nav.doorClosed[d.index] = 1
      const inst = z.layout.doors[d.index]
      g.emitFx({ k: 'doorSlam', z: z.id, x: inst.x, y: inst.y })
      for (const u of g.world.query(z.id, inst.x, inst.y, 0.9)) {
        if (!u.alive || u.def.speed <= 0 || u.tags.has('structure') || u.tags.has('noTarget')) continue
        damage(g, null, u, 225, { kind: 'normal', pure: true })
        const p = z.nav.nearestOpen(u.x + (u.x - inst.x) * 2 + 0.01, u.y + (u.y - inst.y) * 2 + 0.01, (i) => i !== d.index)
        if (p && u.alive) g.world.relocate(u, z.id, p.x, p.y)
      }
    }
  }
}

// ───────── 強化劑選擇 ─────────

function applyEnhance(g: Game, p: GamePlayer, u: Ent, i: number): void {
  const k = ENHANCE[i]
  p.data.enhDone = true
  p.data.enhOffer = false
  const passives = ((u.data.passives as string[] | undefined) ??= [])
  if (k === 'speed') passives.push('bf.enh.speed')
  if (k === 'atk') passives.push('bf.enh.atk')
  if (k === 'range') passives.push('bf.enh.range')
  if (k === 'hp') {
    u.data.hpAdd = ((u.data.hpAdd as number) ?? 0) + 100
    u.maxHp += 100
    u.hp += 100
  }
  if (k === 'mp') {
    u.data.mpAdd = ((u.data.mpAdd as number) ?? 0) + 50
    u.maxMp += 50
    u.mp += 50
  }
  u.statsDirty = true
  recomputeStats(u)
  g.privateLine(p.slot, 'event.enhDone.' + k)
  g.emitFx({ k: 'enhance', z: u.zone, x: u.x, y: u.y, e: u.id })
}

// ───────── 安裝 ─────────

const installed = new WeakSet<Game>()

export function installEvents(g: Game): void {
  if (installed.has(g)) return
  installed.add(g)
  const rng = g.world.rng
  const [a0, a1] = g.settings.apocalypse
  const ev: EventState = {
    next: g.settings.eventMult > 0 ? R(g, [180, 720]) / g.settings.eventMult : Infinity,
    used: new Set(),
    chain: 0,
    chainNext: 0,
    news: Array.from({ length: NEWS }, (_, i) => i + 1),
    apocAt: rng.range(Math.min(a0, a1), Math.max(a0, a1)) * 60,
    apocWarned: false,
    apoc: '',
    apocStart: 0,
    fleetAt: 0,
    fleetPos: { x: 0, y: 0 },
    waspLeft: 0,
    waspNext: 0,
    doorsUntil: 0,
    doorPhase: new Map(),
    waves: [],
    waveNext: 0,
    rocks: [],
    uoZone: 0,
    uoUntil: 0,
    pirateZone: 0,
    pirateBoom: 0,
    pirateWander: 0,
    tenshuUntil: 0,
    enhancer: false,
  }
  g.data.events = ev

  g.systems.push({
    name: 'events',
    fn: (gg) => {
      if (gg.ended) return
      const t = gg.time
      if (ev.chain > 0) {
        if (t >= ev.chainNext) {
          ev.chain--
          ev.chainNext = t + R(gg, [15, 30])
          drawAndFire(gg, true)
        }
      } else if (t >= ev.next) {
        const d = drawAndFire(gg, false)
        // 沒有可抽的事件時每 60 秒再看一次（例如新聞用完、條件都不成立）
        ev.next = t + (d ? R(gg, d.next) : 60) / Math.max(0.05, gg.settings.eventMult)
      }
      stepOngoing(gg, ev)
      stepApocalypse(gg, ev)
    },
  })

  g.triggerEvent = (id, forced) => fire(g, id, forced)
  g.eventIds = () => EVENTS.map((e) => e.id)
  g.startApocalypse = (kind) => startApocalypse(g, kind)

  // 海盜船主控台被毀 → 自爆倒數；船被直接打爆也一樣全滅（站點毀滅流程）
  DEATH_HOOKS.push((g2, u) => {
    if (g2 !== g) return
    if (ev.pirateZone > 0 && u.zone === ev.pirateZone && u.def.id === 'struct.console' && !ev.pirateBoom) {
      ev.pirateBoom = g.time + 40
      for (const q of g.world.inZone(u.zone)) if (q.isMain && q.owner >= 0) g.privateLine(q.owner, 'event.pirateSelfDestruct', { s: 40 })
      g.emitFx({ k: 'alarm', z: u.zone, x: u.x, y: u.y })
    }
  })

  EXTRA_COMMANDS.set('enhance', (g2, p, u, c) => {
    if (g2 !== g) return
    if (!p.data.enhOffer || p.data.enhDone || c.s === undefined) return
    const i = Math.floor(c.s)
    if (i < 0 || i >= ENHANCE.length || u.def.id !== 'personnel') return
    const e = enhancerEnt(g)
    if (!e || u.zone !== e.zone || dist2(u, e) > 2.6 * 2.6) return
    applyEnhance(g, p, u, i)
  })
}

/** 天守砲台對翠原星放電（M7 主砲腳本呼叫）：解除收容失效 */
export function tenshuDischarged(g: Game, target: Ent): boolean {
  const ev = eventsOf(g)
  if (!ev || ev.tenshuUntil <= 0) return false
  const vz = zoneByKey(g, 'verdance')
  if (!vz || target.id !== vz.spaceEnt) return false
  ev.tenshuUntil = 0
  g.systemAll('event.tenshuOk')
  return true
}

/** 未識別物體內的啟用碼（M7 codePanel 互動顯示）*/
export function uoCode(g: Game): string | null {
  const ev = eventsOf(g)
  const z = ev ? g.world.zones[ev.uoZone] : undefined
  return z?.alive ? ((z.data.code as string) ?? null) : null
}

void markersOf
