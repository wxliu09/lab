// 生物與 NPC 的 AI（內容總表 §8、研究 03 §7、GDD §8）：
// 漫遊／受驚逃跑、敵對生物索敵與拴繩回巢、牢房拉回、綏靖機器人、防禦無人機、蛞蝓特工、NPC 船員、太空艦隊。
import { BUFFS, itemDef, unitDef, UNITS } from '../../shared/content/registry'
import { SHIP_BY_ID } from '../../shared/content/ships'
import { roomAt } from '../../shared/layout'
import { HOSTILE, NEUTRAL, dist, dist2, type Ent } from '../ent'
import type { Game } from '../game'
import { markersOf, type Marker } from '../setup'
import { SPACE_ZONE, type Zone } from '../world'
import { DAMAGE_HOOKS, DEATH_HOOKS, damage } from '../systems/damage'
import { issue } from '../systems/orders'
import { dropOnGround, giveItem, hasItem } from '../systems/items'
import { createShip, launchTo } from '../systems/space'

/** 由 AI 決定敵意、平時中立的類型 */
const HOSTILE_AI = new Set(['hostile', 'fox', 'turret', 'fleet', 'spaceHunter'])

interface CrewState {
  /** 船員記住的仇人：ent id → 到期時間 */
  aggro: Map<number, number>
  /** 已回報過的屍體 */
  reported: Set<number>
  /** 被玩家擊殺的蛞蝓仔／雪團獸數（第 15 次可能召來守衛）*/
  slugKills: number
  wardenDone: boolean
}

function stateOf(g: Game): CrewState {
  return (g.data.creatures ??= { aggro: new Map(), reported: new Set(), slugKills: 0, wardenDone: false }) as CrewState
}

/** 攜帶鎮定薰香等「降低仇恨」的被動或 buff */
export function isCalm(u: Ent): boolean {
  if (u.inv) {
    for (const it of u.inv) {
      const pid = it ? itemDef(it.id)?.passive : undefined
      const d = pid ? BUFFS.get(pid) : undefined
      if (d?.flags?.calming || d?.flags?.calm) return true
    }
  }
  return u.buffs.some((b) => {
    const f = BUFFS.get(b.id)?.flags
    return !!(f?.calming || f?.calm)
  })
}

/** 看起來像人類（船員會幫忙／不會主動開火）*/
function humanLooking(u: Ent): boolean {
  return u.tags.has('personnel') || u.tags.has('suit')
}

/** 玩家操控的怪物形態（船員一看到正在傷人就開火）*/
function monstrous(u: Ent): boolean {
  return u.owner >= 0 && !humanLooking(u) && !u.tags.has('structure') && !u.tags.has('ship') && !u.tags.has('station') && !u.tags.has('drone')
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
    case 'spaceHunter': {
      if (u.zone !== SPACE_ZONE || u.pilot) return
      if (u.order?.k === 'attack' || u.order?.k === 'amove') return
      // 往最近的站或船推進（沿路自動開火）
      let best: Ent | null = null
      for (const o of g.world.inZone(SPACE_ZONE)) {
        if (!o.alive || o === u || o.owner === HOSTILE || o.tags.has('noTarget')) continue
        if (!o.tags.has('station') && !o.tags.has('ship')) continue
        if (!best || dist2(u, o) < dist2(u, best)) best = o
      }
      if (best) issue(u, { k: 'amove', x: best.x, y: best.y })
      return
    }
    case 'turret':
      if (!u.order) u.order = { k: 'hold' }
      return
  }
}

function wander(g: Game, u: Ent, home: { x: number; y: number }, r: number, attackMove = false): void {
  const rng = g.world.rng
  const a = rng.range(0, Math.PI * 2)
  const d = rng.range(1, r)
  const p = openNear(g, u.zone, home.x + Math.cos(a) * d, home.y + Math.sin(a) * d)
  if (p) issue(u, { k: attackMove ? 'amove' : 'move', x: p.x, y: p.y })
}

function thinkCrew(g: Game, u: Ent): void {
  const st = stateOf(g)
  const t = g.time
  const rng = g.world.rng
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
        g.systemAll('npc.bodyFound', { st: z.station?.name.zh ?? '', room: r?.spec.name?.zh ?? '' })
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
  for (const [id, until] of st.aggro) if (until <= t || !g.world.get(id)) st.aggro.delete(id)
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
  if (!p || p.alive || p.data.slugUsed) return false
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

  // 自訂敵意：綏靖機器人（實驗室動力期間攻擊穿防護服的人）、蛞蝓特工、船員的仇人
  const prev = g.customHostile
  g.customHostile = (a, b) => {
    const ai = a.def.ai
    if (a.owner === NEUTRAL && ai) {
      if (ai === 'pacifier') return !!g.world.zones[a.zone].data.labPower && !!b.suit
      if (ai === 'operative') return hasItem(b, 'singularity')
      if (ai === 'crew' || ai === 'drone') {
        const until = stateOf(g).aggro.get(b.id)
        return until !== undefined && until > g.time
      }
      return false
    }
    // 被船員打的玩家單位可以自動還手（只限明確攻擊命令之外的反擊：不主動）
    return prev?.(a, b) ?? false
  }

  // 受傷：敵對生物記住打牠的人；船員對槍聲與怪物傷人的反應
  DAMAGE_HOOKS.push((g2, src, t, amount) => {
    if (g2 !== g || !src || amount <= 0) return
    if (t.owner === HOSTILE) t.data.aggro = src.id
    const st = stateOf(g)
    const z = g.world.zones[t.zone]
    if (!z?.nav) return
    let culprit: Ent | null = null
    if (t.def.ai === 'crew' && src.owner >= 0) culprit = src
    else if (monstrous(src) && (humanLooking(t) || t.def.ai === 'crew')) culprit = src
    else if (monstrous(t) && humanLooking(src) && src.owner >= 0) culprit = t
    else if (t.def.ai === 'drone' && src.owner >= 0) culprit = src
    if (!culprit) return
    for (const c of g.world.query(t.zone, t.x, t.y, 12)) {
      if (!c.alive || (c.def.ai !== 'crew' && c.def.ai !== 'drone') || c.owner !== NEUTRAL) continue
      if (c !== t && !z.nav.los(c.x, c.y, t.x, t.y, true)) continue
      st.aggro.set(culprit.id, g.time + 30)
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
