// 生物與 NPC 的 AI（內容總表 §8、研究 03 §7、GDD §8）：
// 漫遊／受驚逃跑、敵對生物索敵與拴繩回巢、牢房拉回、綏靖機器人、防禦無人機、蛞蝓特工、NPC 船員、太空艦隊。
import { BUFFS, itemDef, unitDef, UNITS } from '../../shared/content/registry'
import { SHIP_BY_ID } from '../../shared/content/ships'
import { roomAt } from '../../shared/layout'
import { locArgs } from '../../shared/sysArgs'
import { HOSTILE, NEUTRAL, dist, dist2, type Ent, type ItemInst } from '../ent'
import type { Game } from '../game'
import { markersOf, type Marker } from '../setup'
import { SPACE_ZONE, type Zone } from '../world'
import { DAMAGE_HOOKS, DEATH_HOOKS, damage } from '../systems/damage'
import { issue } from '../systems/orders'
import { isHostile } from '../systems/combat'
import { carries, dropOnGround, giveItem, hasItem } from '../systems/items'
import { createShip, launchTo } from '../systems/space'

/** 由 AI 決定敵意、平時中立的類型 */
const HOSTILE_AI = new Set(['hostile', 'fox', 'turret', 'fleet', 'spaceHunter'])

/**
 * 船員、無人機記仇的原因（死因私訊用）：crew = 他打到了船員、drone = 他打到了防禦無人機、
 * monster = 船員看到他以怪物形態傷人、helped = 船員看到有人在和他（怪物形態）交戰，出手幫忙
 */
export type NpcWhy = 'crew' | 'drone' | 'monster' | 'helped'

/** 船員、無人機記仇多久（秒）：依這個人累積打掉 NPC 的血決定，擦到一下只記 AGGRO_MIN 秒，打掉半條以上記滿 AGGRO_MAX 秒；看到怪物傷人一律 AGGRO_MAX */
export const AGGRO_MIN = 10
export const AGGRO_MAX = 30
/** 玩家單位被 NPC 打到後，這麼多秒內在閒置或原地（H）時會自動還擊那個 NPC（每挨一下重新計時）*/
export const RETALIATE_S = 6

interface CrewState {
  /** 船員記住的仇人：ent id → 到期時間 */
  aggro: Map<number, number>
  /** 仇人累積打掉 NPC 的血（相對於被打的 NPC 最大生命；仇恨到期就清掉）：決定記仇多久 */
  grudge: Map<number, number>
  /** 玩家單位被哪些 NPC 打過：玩家單位 id → NPC id → 到期時間（閒置或原地時自動還擊，只對 NPC）*/
  struck: Map<number, Map<number, number>>
  /** 已回報過的屍體 */
  reported: Set<number>
  /** 被玩家擊殺的蛞蝓仔／雪團獸數（第 15 次可能召來守衛）*/
  slugKills: number
  wardenDone: boolean
}

function stateOf(g: Game): CrewState {
  return (g.data.creatures ??= { aggro: new Map(), grudge: new Map(), struck: new Map(), reported: new Set(), slugKills: 0, wardenDone: false }) as CrewState
}

/** 這件道具的攜帶被動會降低仇恨（鎮定薰香等）*/
function calmItem(it: ItemInst): boolean {
  const pid = itemDef(it.id)?.passive
  const d = pid ? BUFFS.get(pid) : undefined
  return !!(d?.flags?.calming || d?.flags?.calm)
}

/** 攜帶鎮定薰香等「降低仇恨」的被動或 buff */
export function isCalm(u: Ent): boolean {
  // 化身中替人寄放的道具也算帶著（carries 含 packView.extra；敵意判定很常叫，不建立陣列）
  if (carries(u, calmItem)) return true
  return u.buffs.some((b) => {
    const f = BUFFS.get(b.id)?.flags
    return !!(f?.calming || f?.calm)
  })
}

/** 看起來像人類（船員會幫忙／不會主動開火）*/
function humanLooking(u: Ent): boolean {
  return u.tags.has('personnel') || u.tags.has('suit')
}

/**
 * 綏靖機器人在實驗室動力期間的目標（研究 03 §4.4 A06F：600 內穿著防護服或機械類的玩家單位）。
 * 一律照目標「看起來的樣子」判斷，偽裝才不會被它的反應揭穿：
 * - 防護服看 suit tag（化身成著裝人員的異形也有，和真的著裝人員一樣挨打）
 * - 機械類看 mechanical tag＋看起來的擁有者：偽裝成無主機械（綏靖機器人、防禦無人機）的單位不打，和真的無主機械一樣
 */
export function pacifierTarget(b: Ent): boolean {
  if (b.tags.has('invuln') || b.stats.invuln) return false
  if (b.tags.has('suit') || b.suit) return true
  const fake = b.data.fake as { owner: number } | undefined
  return b.tags.has('mechanical') && (fake ? fake.owner : b.owner) >= 0
}

/** 玩家操控的怪物形態（船員一看到正在傷人就開火）*/
function monstrous(u: Ent): boolean {
  return u.owner >= 0 && !humanLooking(u) && !u.tags.has('structure') && !u.tags.has('ship') && !u.tags.has('station') && !u.tags.has('drone')
}

/**
 * 一筆傷害讓船員、無人機記誰的仇（與原因）：打到船員、打到（沒人駕駛的）無人機的玩家單位；
 * 以怪物形態打人或打船員的；被看起來是人的玩家打的怪物形態（船員出手幫忙）。都不是就 null
 */
function culpritOf(src: Ent, t: Ent): [Ent, NpcWhy] | null {
  if (t.def.ai === 'crew' && src.owner >= 0) return [src, 'crew']
  if (monstrous(src) && (humanLooking(t) || t.def.ai === 'crew')) return [src, 'monster']
  if (monstrous(t) && humanLooking(src) && src.owner >= 0) return [t, 'helped']
  if (t.def.ai === 'drone' && src.owner >= 0 && !t.pilot) return [src, 'drone']
  return null
}

/** 玩家單位 a 最近被這個 NPC 或敵對生物（b）打過、還在還擊時限內 */
function struckBy(g: Game, a: Ent, b: Ent): boolean {
  if (b.owner >= 0) return false
  const until = stateOf(g).struck.get(a.id)?.get(b.id)
  return until !== undefined && until > g.time
}

function openNear(g: Game, zone: number, x: number, y: number): { x: number; y: number } | null {
  const z = g.world.zones[zone]
  if (!z?.nav) return { x, y }
  return z.nav.nearestOpen(x, y)
}

// ───────── 生成 ─────────

export function spawnCreature(g: Game, defId: string, zone: number, x: number, y: number, jitter = 0): Ent | null {
  const def = UNITS.get(defId)
  if (!def) return null
  const rng = g.world.rng
  const p = openNear(g, zone, x + (jitter ? rng.range(-jitter, jitter) : 0), y + (jitter ? rng.range(-jitter, jitter) : 0)) ?? { x, y }
  const owner = HOSTILE_AI.has(def.ai ?? '') ? HOSTILE : NEUTRAL
  const e = g.world.spawn(def, zone, p.x, p.y, owner)
  e.facing = rng.range(-Math.PI, Math.PI)
  e.data.home = { x: p.x, y: p.y }
  e.acquire = !!def.attack && def.ai !== 'pacifier' && def.ai !== 'operative'
  if (def.flags?.stealth || def.ai === 'entity') e.data.passives = ['bf.innateStealth']
  if (def.ai === 'turret' || def.speed <= 0) e.order = def.attack ? { k: 'hold' } : null
  if (def.ai === 'decor') e.acquire = false
  if (def.layer === 'space') e.global = true
  e.statsDirty = true
  return e
}

/** 依地點標記生成開局生物（研究 03 附錄 B 的數量）*/
function spawnFromMarkers(g: Game, z: Zone): void {
  const m = markersOf(z)
  const each = (kind: string, fn: (mk: Marker, i: number) => void) => (m[kind] ?? []).forEach(fn)
  const spread = (kind: string, defId: string, n: number, jitter = 1.5) => {
    const list = m[kind] ?? []
    if (!list.length) return
    for (let i = 0; i < n; i++) {
      const mk = list[i % list.length]
      spawnCreature(g, defId, z.id, mk.x, mk.y, list.length >= n ? 0 : jitter)
    }
  }
  // 單一參照標記（mob＋ref）
  each('mob', (mk) => mk.ref && spawnCreature(g, mk.ref, z.id, mk.x, mk.y))
  // 翠原星
  spread('slugSpawn', 'creature.slugling', 27, 2.5)
  each('elderSpawn', (mk) => spawnCreature(g, 'creature.elderSlug', z.id, mk.x, mk.y))
  each('freakSpawn', (mk) => spawnCreature(g, 'creature.freakman', z.id, mk.x, mk.y))
  each('foxSpawn', (mk) => spawnCreature(g, 'creature.greyFox', z.id, mk.x, mk.y))
  each('anomalySpawn', (mk) => spawnCreature(g, 'creature.anomalyRich', z.id, mk.x, mk.y))
  // 女帝號實驗室
  const exp = m.experimentSpawn ?? []
  if (exp.length) for (let i = 0; i < 4; i++) {
    const mk = exp[i % exp.length]
    spawnCreature(g, i === 0 ? 'creature.failedSheep' : 'creature.failed', z.id, mk.x, mk.y, 1.2)
  }
  each('pacifierSpawn', (mk) => {
    const e = spawnCreature(g, 'npc.pacifier', z.id, mk.x, mk.y)
    if (e) e.order = { k: 'hold' }
  })
  const drones = m.droneSpawn ?? []
  if (drones.length) for (let i = 0; i < 2; i++) spawnCreature(g, 'npc.defenseDrone', z.id, drones[i % drones.length].x + (i ? 1.4 : 0), drones[i % drones.length].y)
  // 活體庫號隔間
  const CELLS: Record<string, [string, number][]> = {
    specimen1: [['creature.murmaw', 1]],
    specimen2: [['creature.anomalyCaged', 5]],
    specimen3: [['creature.chicken', 2], ['creature.frog', 2], ['creature.rabbit', 2], ['creature.sheep', 1], ['creature.stag', 1]],
    specimen4: [['creature.slugling', 7]],
    specimen5: [['creature.skitter', 6], ['creature.skitterOverseer', 1]],
    specimen6: [['creature.failedHostile', 2], ['creature.failedBrute', 2], ['creature.failedSwift', 2]],
  }
  for (const [kind, mobs] of Object.entries(CELLS)) {
    const list = m[kind] ?? []
    if (!list.length) continue
    const room = z.layout ? roomAt(z.layout, list[0].x, list[0].y) : null
    let i = 0
    for (const [defId, n] of mobs) {
      for (let k = 0; k < n; k++) {
        const mk = list[i++ % list.length]
        const e = spawnCreature(g, defId, z.id, mk.x, mk.y, 1.5)
        if (e && room) e.data.cell = room.index
      }
    }
  }
  // 未識別物體
  each('deadScientist', (mk) => {
    const e = spawnCreature(g, 'npc.deadScientist', z.id, mk.x, mk.y)
    if (e) e.anim = 4
  })
  spread('entitySpawn', 'creature.entity', 4, 2)
  // 海盜船
  each('pirateCaptain', (mk) => spawnCreature(g, 'pirate.captain', z.id, mk.x, mk.y))
  each('pirateSpawn', (mk) => spawnCreature(g, 'pirate.crew', z.id, mk.x, mk.y))
  each('sentrySpawn', (mk) => spawnCreature(g, 'pirate.sentry', z.id, mk.x, mk.y))
}

/** 某個地點（含事件站）的生物生成；回傳生成數 */
export function populateZone(g: Game, z: Zone): number {
  const before = g.world.ents.size
  spawnFromMarkers(g, z)
  return g.world.ents.size - before
}

/** NPC 船員：人數少時在各站巡邏（大廳 npcCrew：-1 = 自動）*/
function spawnCrew(g: Game): void {
  const humans = g.allPlayers().filter((p) => !p.spectator).length
  const n = g.settings.npcCrew >= 0 ? Math.min(12, g.settings.npcCrew) : Math.max(0, Math.min(6, 9 - humans))
  if (n <= 0) return
  const zones = g.world.zones.filter((z) => z.alive && z.station && !z.station.outdoor && z.station.enable !== 'event' && !z.key.startsWith('ship:') && z.layout)
  if (!zones.length) return
  const rng = g.world.rng
  for (let i = 0; i < n; i++) {
    const z = zones[i % zones.length]
    const pts = patrolPoints(z)
    const at = rng.pick(pts)
    const e = spawnCreature(g, 'npc.crew', z.id, at.x, at.y, 1)
    if (!e) continue
    e.data.crew = true
    e.data.nextPatrol = g.time + rng.range(1, 6)
  }
}

function patrolPoints(z: Zone): { x: number; y: number }[] {
  const m = markersOf(z).patrol
  if (m?.length) return m
  const rooms = z.layout?.rooms ?? []
  const pts = rooms.map((r) => ({ x: r.cx, y: r.cy }))
  return pts.length ? pts : (z.layout?.spawns ?? [{ x: 3, y: 3 }])
}

// ───────── 每 tick ─────────

function think(g: Game, u: Ent): void {
  const ai = u.def.ai!
  const t = g.time
  const rng = g.world.rng
  const home = (u.data.home as { x: number; y: number }) ?? { x: u.x, y: u.y }
  // 牢房：離開隔間就被拉回（活體庫號）
  if (u.data.cell !== undefined) {
    const z = g.world.zones[u.zone]
    const r = z.layout ? roomAt(z.layout, u.x, u.y) : null
    if (!r || r.index !== u.data.cell) {
      // 隔間門被收容控制台打開（整站或單間）時不拉回
      if (!z.data.cellsOpen && !(z.data.openCells as number[] | undefined)?.includes(u.data.cell)) {
        g.world.relocate(u, u.zone, home.x, home.y)
        issue(u, null)
        return
      }
    }
  }
  switch (ai) {
    case 'critter':
    case 'elder':
    case 'skittish': {
      const hurt = t - u.lastDamageTime < 4 ? g.world.get(u.lastHitBy) : undefined
      let threat: Ent | undefined = hurt
      if (!threat && ai === 'skittish') {
        for (const o of g.world.query(u.zone, u.x, u.y, 3.5)) {
          if (o.owner >= 0 && o.alive && o.def.speed > 0) {
            threat = o
            break
          }
        }
      }
      if (threat) {
        const a = Math.atan2(u.y - threat.y, u.x - threat.x) + rng.range(-0.6, 0.6)
        const p = openNear(g, u.zone, u.x + Math.cos(a) * 5, u.y + Math.sin(a) * 5)
        if (p) issue(u, { k: 'move', x: p.x, y: p.y })
        return
      }
      if (!u.order && rng.chance(ai === 'elder' ? 0.12 : 0.25)) wander(g, u, home, ai === 'elder' ? 2.5 : 4.5)
      return
    }
    case 'hostile':
    case 'fox': {
      const leash = u.data.cell !== undefined ? 30 : 12
      if (u.data.returning) {
        if (dist(u, home) < 1.5 || !u.order) {
          u.data.returning = false
          u.acquire = true
        }
        return
      }
      if (dist(u, home) > leash) {
        u.data.returning = true
        u.acquire = false
        issue(u, { k: 'move', x: home.x, y: home.y })
        return
      }
      if (!u.order && rng.chance(0.12)) wander(g, u, home, 3, true)
      return
    }
    case 'entity': {
      // 隱形危害：每 2 秒對身旁的人造成 10 傷害
      if ((u.data.auraNext ?? 0) <= t) {
        u.data.auraNext = t + 2
        for (const o of g.world.query(u.zone, u.x, u.y, 1.4)) {
          if (o === u || !o.alive || o.tags.has('structure') || o.tags.has('noTarget') || o.tags.has('corpse') || o.def.ai === 'decor') continue
          damage(g, u, o, 10, { kind: 'chaos', pure: true })
        }
      }
      if (!u.order && rng.chance(0.2)) wander(g, u, home, 6)
      return
    }
    case 'pacifier': {
      const z = g.world.zones[u.zone]
      const on = !!z.data.labPower
      u.acquire = on
      if (!on && u.order?.k === 'attack') issue(u, { k: 'move', x: home.x, y: home.y })
      else if (on && !u.order && rng.chance(0.2)) issue(u, { k: 'amove', ...(openNear(g, u.zone, home.x + rng.range(-6, 6), home.y + rng.range(-6, 6)) ?? home) })
      return
    }
    case 'drone': {
      if (u.pilot) return
      if (dropStaleAttack(g, u)) return
      if (!u.order && rng.chance(0.15)) {
        const p = openNear(g, u.zone, home.x + rng.range(-5, 5), home.y + rng.range(-5, 5))
        if (p) issue(u, { k: 'amove', x: p.x, y: p.y })
      }
      return
    }
    case 'operative': {
      // 獵殺持有黑洞裝置的單位
      let best: Ent | null = null
      for (const o of g.world.inZone(u.zone)) if (o.alive && o !== u && hasItem(o, 'singularity') && (!best || dist2(u, o) < dist2(u, best))) best = o
      if (best) {
        if (u.order?.k !== 'attack' || u.order.e !== best.id) issue(u, { k: 'attack', e: best.id })
      } else if (!u.order && rng.chance(0.2)) wander(g, u, home, 6)
      return
    }
    case 'crew':
      thinkCrew(g, u)
      return
    case 'fleet':
      if (u.zone !== SPACE_ZONE || u.pilot) return
      thinkFleet(g, u)
      return
    case 'spaceHunter':
      // 胡蜂無人戰機（無人機艦隊事件）：原作生成後一樣跑 mG → LG（S8，war3map.j 17832），和末日子艦隊同一套選目標，
      // 翠原星不在候選內、只剩它時才打。舊版「往最近的站或船攻擊移動」會停在翠原星上空一直打（第 8 輪 S8 發現）
      if (u.zone !== SPACE_ZONE || u.pilot) return
      thinkFleet(g, u)
      return
    case 'turret':
      if (!u.order) u.order = { k: 'hold' }
      return
  }
}

// ───────── 末日子艦隊（原作 LG，war3map.j 4463–4484）─────────

/** 子艦隊每隔這麼多秒重選一次目標（原作 LG 的 eD(10.)）*/
export const FLEET_REPICK_S = 10

/** 翠原星（原作 Minertha，hc）：999999 生命、每秒回 9999，打不死 */
export function isPlanet(e: Ent): boolean {
  return e.def.id === 'station.verdance'
}

/** 子艦隊打得動的太空目標：站或船，活著、不是敵對方自己人、不是打不動的（無敵、降落中的豪勇號）*/
function fleetCandidate(u: Ent, o: Ent): boolean {
  if (!o.alive || o === u || o.owner === HOSTILE || o.tags.has('noTarget') || o.stats.invuln) return false
  return o.tags.has('station') || o.tags.has('ship')
}

/**
 * 子艦隊要往哪裡推進（還原原作 LG）：原作每 10 秒列出太空中所有不屬於 Player 12 的活單位，
 * 名單裡有翠原星（hc）就把它拿掉，只有它一個時才留下（並拿掉它的 SAPPER 分類讓它能被攻擊）。
 * 本作照樣排除翠原星、只剩它時才打它；原作取 FirstOfGroup（列舉順序），本作沿用原本的「最近的站或船」。
 * 舊版直接攻擊移動到最近的站或船，翠原星常常就是最近的那個，艦隊從此停在行星上空打一顆打不死的行星，
 * 隕石與殘留輻射一兩分鐘內就把撤到地表的人清光（第 8 輪審查 D）
 */
export function fleetGoal(g: Game, u: Ent): Ent | null {
  let best: Ent | null = null
  let planet: Ent | null = null
  for (const o of g.world.inZone(SPACE_ZONE)) {
    if (!fleetCandidate(u, o)) continue
    if (isPlanet(o)) {
      planet = o
      continue
    }
    if (!best || dist2(u, o) < dist2(u, best)) best = o
  }
  return best ?? planet
}

/**
 * 沿路開火：射程內最近的敵對單位（同 combat.ts 的自動索敵：敵意、隱形、索敵距離），但不含翠原星
 * （除非它就是艦隊的目標）。原作是攻擊移動，路上碰到的船、逃生艙、太空形態都會打；這裡用明確的攻擊命令做同一件事，
 * 才不會被戰鬥系統的自動索敵拉去打行星（攻擊行星的自動命令永遠不會結束：行星不會死）
 */
function fleetFireAt(g: Game, u: Ent, goal: Ent | null): Ent | null {
  const r = Math.max(u.stats.range + 1, Math.min(u.stats.sight, 12))
  let best: Ent | null = null
  let bestD = Infinity
  for (const o of g.world.query(SPACE_ZONE, u.x, u.y, r)) {
    if (o === goal) continue
    if (isPlanet(o) || o.stats.invuln || o.stats.stealth || !isHostile(g, u, o)) continue
    const d = dist2(u, o)
    if (d < bestD) {
      bestD = d
      best = o
    }
  }
  return best
}

function thinkFleet(g: Game, u: Ent): void {
  const t = g.time
  let goal = u.data.fleetGoal ? g.world.get(u.data.fleetGoal as number) : undefined
  if (!goal || !goal.alive || t >= ((u.data.fleetPickAt as number | undefined) ?? 0)) {
    goal = fleetGoal(g, u) ?? undefined
    u.data.fleetGoal = goal?.id ?? 0
    u.data.fleetPickAt = t + FLEET_REPICK_S
  }
  const want = fleetFireAt(g, u, goal ?? null) ?? goal
  if (!want) {
    if (u.order) issue(u, null)
    return
  }
  if (u.order?.k !== 'attack' || u.order.e !== want.id) issue(u, { k: 'attack', e: want.id })
}

function wander(g: Game, u: Ent, home: { x: number; y: number }, r: number, attackMove = false): void {
  const rng = g.world.rng
  const a = rng.range(0, Math.PI * 2)
  const d = rng.range(1, r)
  const p = openNear(g, u.zone, home.x + Math.cos(a) * d, home.y + Math.sin(a) * d)
  if (p) issue(u, { k: attackMove ? 'amove' : 'move', x: p.x, y: p.y })
}

/**
 * 船員、無人機的攻擊命令：仇恨到期（或仇人已經不在）就放下，不再追殺；回到巡邏。
 * 攻擊命令是受傷掛勾下的（只下一次），不會自己結束：沒有這一步，擦到一下就會被追到死（第 6 輪審查 B P1）。回傳 true = 剛放下
 */
function dropStaleAttack(g: Game, u: Ent): boolean {
  if (u.order?.k !== 'attack') return false
  const until = stateOf(g).aggro.get(u.order.e ?? 0)
  if (until !== undefined && until > g.time) return false
  issue(u, null)
  u.data.nextPatrol = g.time + g.world.rng.range(2, 5)
  return true
}

function thinkCrew(g: Game, u: Ent): void {
  const st = stateOf(g)
  const t = g.time
  const rng = g.world.rng
  if (dropStaleAttack(g, u)) return
  if (u.order?.k === 'attack') return
  // 受傷過重：逃回巡邏點
  if (u.hp < u.maxHp * 0.25 && t - u.lastDamageTime < 3) {
    const pts = patrolPoints(g.world.zones[u.zone])
    const far = pts.reduce((a, b) => (dist2(b, u) > dist2(a, u) ? b : a), pts[0])
    issue(u, { k: 'move', x: far.x, y: far.y })
    return
  }
  // 調查屍體
  const inv = u.data.investigate as { x: number; y: number; c: number; until: number } | undefined
  if (inv) {
    if (t > inv.until) u.data.investigate = undefined
    else if (Math.hypot(u.x - inv.x, u.y - inv.y) < 2.2) {
      u.data.investigate = undefined
      const c = g.world.get(inv.c)
      if (c && !st.reported.has(c.id) && c.tags.has('corpse')) {
        st.reported.add(c.id)
        const z = g.world.zones[u.zone]
        const r = z.layout ? roomAt(z.layout, c.x, c.y) : null
        g.systemAll('npc.bodyFound', { ...locArgs(z.station?.name, 'sz', 'se'), ...locArgs(r?.spec.name, 'rz', 're') })
      }
      u.data.nextPatrol = t + rng.range(4, 8)
    } else if (!u.order) issue(u, { k: 'move', x: inv.x, y: inv.y })
    return
  }
  if (!u.order && t >= (u.data.nextPatrol ?? 0)) {
    const pts = patrolPoints(g.world.zones[u.zone])
    const p = rng.pick(pts)
    const q = openNear(g, u.zone, p.x + rng.range(-1.5, 1.5), p.y + rng.range(-1.5, 1.5))
    if (q) issue(u, { k: 'amove', x: q.x, y: q.y })
    u.data.nextPatrol = t + rng.range(6, 16)
  }
  void st
}

function stepCreatures(g: Game): void {
  const t = g.time
  const st = stateOf(g)
  for (const [id, until] of st.aggro) {
    if (until > t && g.world.get(id)) continue
    st.aggro.delete(id)
    // 仇恨到期：累積的冒犯歸零，船員、無人機也不再算是「正在打他」（他的單位跟著停手）
    st.grudge.delete(id)
    st.struck.delete(id)
  }
  if (g.world.tick % 40 === 0) {
    for (const [id, m] of st.struck) {
      for (const [n, until] of m) if (until <= t || !g.world.get(n)?.alive) m.delete(n)
      if (!m.size || !g.world.get(id)?.alive) st.struck.delete(id)
    }
  }
  for (const u of g.world.ents.values()) {
    if (!u.alive || !u.def.ai || u.owner >= 0 || u.data.ai || u.data.frozen) continue
    if ((u.data.thinkAt ?? 0) > t) continue
    u.data.thinkAt = t + 0.4 + g.world.rng.range(0, 0.3)
    if (u.stats.stunned || u.data.dash) continue
    think(g, u)
  }
  stepLabPower(g)
}

/** 實驗室動力模式：每 45 秒多一隻失敗實驗體（上限 12）*/
function stepLabPower(g: Game): void {
  for (const z of g.world.zones) {
    if (!z.alive || !z.data.labPower) continue
    if ((z.data.labNext as number | undefined) === undefined) z.data.labNext = g.time + 45
    if (g.time < (z.data.labNext as number)) continue
    z.data.labNext = g.time + 45
    const exp = markersOf(z).experimentSpawn ?? []
    if (!exp.length) continue
    let n = 0
    for (const e of g.world.inZone(z.id)) if (e.alive && e.def.id === 'creature.failed') n++
    if (n >= 12) continue
    const mk = g.world.rng.pick(exp)
    spawnCreature(g, 'creature.failed', z.id, mk.x, mk.y, 1)
  }
}

// ───────── 事件掛勾 ─────────

/** 蛞蝓長老收禮（研究 03 §7）*/
function elderGift(g: Game, elder: Ent, giverId: number, slot: number): void {
  const it = elder.inv?.[slot]
  if (!it) return
  const giver = g.world.get(giverId)
  const to = giver?.owner ?? -1
  const giveBack = () => {
    elder.inv![slot] = null
    if (giver && giver.alive && giver.inv && giver.zone === elder.zone) giveItem(g, giver, it)
    else dropOnGround(g, elder.zone, elder.x, elder.y, it)
  }
  const say = (key: string) => to >= 0 && g.privateLine(to, key)
  const d = itemDef(it.id)
  if (it.id === 'penguinPlush') {
    elder.inv![slot] = null
    say('elder.penguin')
  } else if (it.id === 'wormBait') {
    giveBack()
    say('elder.wormFood')
  } else if (it.id === 'sheepPlush') {
    elder.inv![slot] = null
    say('elder.sheep')
    g.after(11, () => summonWoolly(g))
  } else if (d?.suit) {
    giveBack()
    say('elder.suit')
  } else {
    giveBack()
    say('elder.no')
  }
}

/** 綿羊號：出現在太空隨機點，艙內 12 隻羊 */
export function summonWoolly(g: Game): Ent | null {
  const def = SHIP_BY_ID.get('woolly')
  if (!def) return null
  const inst = createShip(g, def)
  const rng = g.world.rng
  const e = launchTo(g, inst, rng.range(-30, 30), rng.range(-30, 30))
  inst.mother = -1
  const z = g.world.zones[inst.zone]
  const c = z.layout?.rooms[0]
  for (let i = 0; i < 12; i++) spawnCreature(g, 'creature.sheep', z.id, c?.cx ?? 4, c?.cy ?? 3, 2)
  g.systemAll('event.woolly')
  return e
}

/** 死去的玩家附身一隻蛞蝓仔（每人一次）*/
export function possessSlugling(g: Game, slot: number): boolean {
  const p = g.players[slot]
  // 死亡即退出：出局的人不能再回到場上
  if (!p || p.alive || p.spectator || p.data.slugUsed || p.data.booted) return false
  const list = [...g.world.ents.values()].filter((e) => e.alive && e.def.id === 'creature.slugling' && e.owner === NEUTRAL && e.data.cell === undefined)
  if (!list.length) return false
  const s = g.world.rng.pick(list)
  p.data.slugUsed = true
  s.owner = slot
  s.data.home = undefined
  s.data.passives = ['bf.slugPossess']
  s.abilities = []
  s.statsDirty = true
  p.control = s.id
  p.data.slug = s.id
  issue(s, null)
  return true
}

const installed = new WeakSet<Game>()

export function installCreatureAi(g: Game): void {
  if (installed.has(g)) return
  installed.add(g)
  g.systems.push({ name: 'creatures', fn: stepCreatures })
  g.isCalm = isCalm
  g.possessSlug = (slot) => possessSlugling(g, slot)
  for (const z of g.world.zones) if (z.alive && z.layout && z.station?.enable !== 'event') populateZone(g, z)
  spawnCrew(g)

  // 自訂敵意：綏靖機器人（實驗室動力期間攻擊穿防護服的人與機械類的玩家單位）、蛞蝓特工、船員的仇人；
  // 反過來，被 NPC 打到的玩家單位對那個 NPC 有敵意（閒置、原地、攻擊移動時自動還擊）。只對 NPC：玩家之間永遠不會自動開火
  const prev = g.customHostile
  g.customHostile = (a, b) => {
    const ai = a.def.ai
    if (a.owner === NEUTRAL && ai) {
      if (ai === 'pacifier') return !!g.world.zones[a.zone].data.labPower && pacifierTarget(b)
      if (ai === 'operative') return hasItem(b, 'singularity')
      if (ai === 'crew' || ai === 'drone') {
        const until = stateOf(g).aggro.get(b.id)
        return until !== undefined && until > g.time
      }
      return false
    }
    if (a.owner >= 0 && struckBy(g, a, b)) return true
    return prev?.(a, b) ?? false
  }
  g.npcStruck = (u, by) => (by ? struckBy(g, u, by) : (stateOf(g).struck.get(u.id)?.size ?? 0) > 0)

  // 受傷：敵對生物記住打牠的人；船員對槍聲與怪物傷人的反應；玩家單位記住打他的 NPC（自動還擊用）
  DAMAGE_HOOKS.push((g2, src, t, amount, o) => {
    if (g2 !== g || !src || amount <= 0) return
    if (t.owner === HOSTILE) t.data.aggro = src.id
    const st = stateOf(g)
    // NPC（船員、無人機、綏靖機器人、蛞蝓特工…）或敵對生物打到玩家單位：記下來，這個單位閒置或原地時會自動還擊它
    //（平常不自動索敵的人員也一樣；只還擊打他的那一個）
    if (src.owner < 0 && src.def.ai && src.def.attack && !src.pilot && t.owner >= 0) {
      const m = st.struck.get(t.id) ?? st.struck.set(t.id, new Map()).get(t.id)!
      m.set(src.id, g.time + RETALIATE_S)
    }
    const z = g.world.zones[t.zone]
    if (!z?.nav) return
    const blame = culpritOf(src, t)
    if (!blame) return
    const [culprit, why] = blame
    // 打到船員、無人機的持續傷害（輻射裝外洩、燃燒、毒）不算冒犯：那是光環或先前那一下的餘波，記仇的是直接出手的那一下。
    // 怪物形態傷人照樣算（看得到的就是一隻怪物在傷人，例如寄生的持續傷害）
    if (o.dot && (why === 'crew' || why === 'drone')) return
    // 還手不算新的冒犯：被這個 NPC 打、自動還擊（combat 自動索敵的攻擊）打回去的，不延長仇恨（否則一還手就永遠打不完）
    if (culprit === src && src.data.autoAtk === t.id && struckBy(g, src, t)) return
    // 記仇多久：看到怪物傷人一律記滿；誤傷依累積打掉的血（擦到一下只記一小段）
    let dur = AGGRO_MAX
    if (why === 'crew' || why === 'drone') {
      const gr = (st.grudge.get(culprit.id) ?? 0) + amount / Math.max(1, t.maxHp)
      st.grudge.set(culprit.id, gr)
      dur = AGGRO_MIN + (AGGRO_MAX - AGGRO_MIN) * Math.min(1, gr / 0.5)
    }
    for (const c of g.world.query(t.zone, t.x, t.y, 12)) {
      if (!c.alive || (c.def.ai !== 'crew' && c.def.ai !== 'drone') || c.owner !== NEUTRAL || c.pilot) continue
      if (c !== t && !z.nav.los(c.x, c.y, t.x, t.y, true)) continue
      st.aggro.set(culprit.id, Math.max(st.aggro.get(culprit.id) ?? 0, g.time + dur))
      // 死因私訊用：為什麼 NPC 會對他開火
      culprit.data.npcWhy = { why, t: g.time }
      if (c.order?.k !== 'attack' && culprit.alive && !culprit.stats.stealth) issue(c, { k: 'attack', e: culprit.id })
    }
  })

  // 死亡：蛞蝓仔重生／守衛、船員調查屍體、被感染船員餵養異類
  DEATH_HOOKS.push((g2, u, killer, killerSlot) => {
    if (g2 !== g) return
    const st = stateOf(g)
    const id = u.def.id
    if (id === 'creature.slugling' || id === 'creature.snowgle') {
      if (killerSlot >= 0 && u.owner < 0) {
        st.slugKills++
        if (st.slugKills === 15 && !st.wardenDone) {
          st.wardenDone = true
          if (g.world.rng.chance(0.5)) {
            const w = spawnCreature(g, 'creature.snowgleWarden', u.zone, u.x, u.y, 2)
            if (w) g.emitFx({ k: 'skyDrop', z: u.zone, x: w.x, y: w.y, e: w.id })
          }
        }
      } else if (killer?.owner === HOSTILE && id === 'creature.slugling' && !u.data.converted) {
        const vz = g.world.zones.find((z) => z.alive && (markersOf(z).slugSpawn?.length ?? 0) > 0)
        if (vz) {
          const mk = g.world.rng.pick(markersOf(vz).slugSpawn!)
          g.after(5, () => spawnCreature(g, 'creature.slugling', vz.id, mk.x, mk.y, 2))
        }
      }
    }
    if (u.data.crew) {
      // 被感染的船員死去：寄生 → 異形主腦、朊毒 → 變種人主腦 得到養分
      for (const b of u.buffs) {
        const inf = BUFFS.get(b.id)?.infection
        if (!inf) continue
        const f = inf.includes('rion') ? 'mutant' : 'xeno'
        const m = g.allPlayers().find((q) => q.role === f && !q.spawnOf)
        if (m) g.addEp(m.slot, 50)
        break
      }
    }
    // 附身的蛞蝓仔死亡：控制權回到觀戰
    if (u.owner >= 0 && id === 'creature.slugling') {
      const p = g.players[u.owner]
      if (p && p.data.slug === u.id) {
        p.control = 0
        p.data.slug = 0
      }
    }
    // 附近的船員前去查看屍體
    if (u.def.corpse !== false && (u.isMain || u.data.crew) && u.zone !== SPACE_ZONE) {
      const z = g.world.zones[u.zone]
      for (const c of g.world.query(u.zone, u.x, u.y, 10)) {
        if (!c.alive || !c.data.crew || c.order?.k === 'attack') continue
        if (z.nav && !z.nav.los(c.x, c.y, u.x, u.y, true)) continue
        g.after(0.3, () => {
          const corpse = [...g.world.query(u.zone, u.x, u.y, 1.5)].find((e) => e.tags.has('corpse'))
          if (corpse && c.alive) c.data.investigate = { x: corpse.x, y: corpse.y, c: corpse.id, until: g.time + 25 }
        })
        break
      }
    }
  })

  // 收禮
  const prevGain = g.onItemGained
  g.onItemGained = (u, it) => {
    prevGain?.(u, it)
    if (u.def.ai === 'elder' && u.inv) {
      const slot = u.inv.indexOf(it)
      const giver = (u.data.lastGiver as number) ?? 0
      if (slot >= 0) elderGift(g, u, giver, slot)
    }
  }
  void unitDef
}
