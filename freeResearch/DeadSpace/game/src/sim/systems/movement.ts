// 移動：尋路、路徑跟隨、碰撞、避讓、自動門
import { TICK_DT } from '../../shared/constants'
import type { Game } from '../game'
import { dist2, type Ent } from '../ent'
import type { DoorPass } from '../nav/grid'
import { SPACE_HALF, SPACE_ZONE, type Zone } from '../world'

const REPATH = 0.6
const ARRIVE = 0.15

/** 這個單位能不能通過某扇門 */
export function doorPassFor(g: Game, u: Ent, z: Zone): DoorPass {
  return (d) => {
    const door = z.doors[d]
    if (!door) return true
    if (door.broken) return true
    if (door.locked || door.forced > g.time) {
      // 雷殛者可直接穿越鎖住的門
      return !!u.data.passLocked
    }
    if (door.clearance) return hasClearance(u, door.clearance)
    return true
  }
}

export function hasClearance(u: Ent, clearance: string): boolean {
  if (u.data.passLocked) return true
  const card = clearance === 'janitor' ? 'janitorCard' : clearance === 'captain' ? 'captainCard' : clearance
  return !!u.inv?.some((it) => it?.id === card)
}

/** 單位目前的移動目標點（依命令）*/
function goalOf(g: Game, u: Ent): { x: number; y: number; stopAt: number } | null {
  const o = u.order
  if (!o) return null
  switch (o.k) {
    case 'move':
    case 'amove':
    case 'patrol':
      return { x: o.x!, y: o.y!, stopAt: ARRIVE }
    case 'follow': {
      const t = g.world.get(o.e!)
      if (!t || !t.alive || t.zone !== u.zone) {
        u.order = null
        return null
      }
      return { x: t.x, y: t.y, stopAt: (o.s ?? 1.6) + t.radius }
    }
    case 'attack': {
      const t = g.world.get(o.e!)
      if (!t || !t.alive || t.zone !== u.zone) return null
      return { x: t.x, y: t.y, stopAt: u.stats.range + t.radius + u.radius - 0.05 }
    }
    case 'cast':
    case 'interact':
    case 'pickup':
    case 'give': {
      if (o.e) {
        const t = g.world.get(o.e)
        if (!t || t.zone !== u.zone) return null
        const r = o.k === 'cast' ? (u.data.castRange ?? 1) : 1.4
        return { x: t.x, y: t.y, stopAt: r + t.radius }
      }
      if (o.x !== undefined) return { x: o.x, y: o.y!, stopAt: o.k === 'cast' ? (u.data.castRange ?? 1) : 0.5 }
      return null
    }
    default:
      return null
  }
}

/** AI／NPC 每 tick 最多重算幾次路徑（真人玩家的單位不受限）：避免大家同時出發時卡一下 */
const PATH_BUDGET = 6

export function stepMovement(g: Game): void {
  const w = g.world
  const dt = TICK_DT
  let budget = PATH_BUDGET
  for (const u of w.ents.values()) {
    if (!u.alive || u.removed) continue
    // 外力（擊退、推擠）
    if (u.vx || u.vy) {
      moveBy(g, u, u.vx * dt, u.vy * dt)
      const decay = Math.max(0, 1 - (u.data.vDecay ?? 6) * dt)
      u.vx *= decay
      u.vy *= decay
      if (Math.abs(u.vx) < 0.05 && Math.abs(u.vy) < 0.05) u.vx = u.vy = 0
    }
    if (u.def.speed <= 0) continue
    if (u.stats.stunned || u.stats.rooted || u.data.frozen) {
      if (u.anim === 1) u.anim = 0
      continue
    }
    if (u.cast && !u.data.castWhileMoving) {
      continue
    }
    if (u.windupUntil > g.time) continue
    const goal = goalOf(g, u)
    if (!goal) {
      if (u.anim === 1) u.anim = 0
      if (!u.order && u.queue.length) u.order = u.queue.shift()!
      continue
    }
    const d2 = dist2(u, goal)
    if (d2 <= goal.stopAt * goal.stopAt) {
      u.path = null
      if (u.order && (u.order.k === 'move' || u.order.k === 'patrol')) {
        u.order = u.queue.shift() ?? null
      }
      if (u.anim === 1) u.anim = 0
      continue
    }
    const speed = u.stats.speed * dt
    const z = w.zones[u.zone]
    let tx = goal.x
    let ty = goal.y
    if (z.nav) {
      const pass = doorPassFor(g, u, z)
      const goalMoved = (u.pathGoalX - goal.x) ** 2 + (u.pathGoalY - goal.y) ** 2 > 0.5
      const wantPath = !u.path || (g.time >= u.repathAt && goalMoved) || (u.stuckT > 0.6 && g.time >= u.repathAt)
      const human = u.owner >= 0 && !!g.players[u.owner] && !g.players[u.owner]!.bot
      if (wantPath && !human && budget <= 0) {
        // 預算用完：還沒有路徑的等下一 tick，有舊路徑的先沿用
        if (!u.path) continue
        u.repathAt = g.time + 0.1
      } else if (wantPath) {
        if (!human) budget--
        u.path = z.nav.findPath(u.x, u.y, goal.x, goal.y, u.radius, pass)
        u.pathIdx = 0
        u.pathGoalX = goal.x
        u.pathGoalY = goal.y
        u.repathAt = g.time + REPATH
        u.stuckT = 0
        if (!u.path) {
          // 無路可走：放棄命令
          if (u.order && u.order.k !== 'attack') u.order = u.queue.shift() ?? null
          u.anim = 0
          continue
        }
      }
      // 路徑點
      while (u.path && u.pathIdx < u.path.length) {
        const wp = u.path[u.pathIdx]
        if ((wp.x - u.x) ** 2 + (wp.y - u.y) ** 2 < 0.04) u.pathIdx++
        else break
      }
      if (u.path && u.pathIdx < u.path.length) {
        tx = u.path[u.pathIdx].x
        ty = u.path[u.pathIdx].y
      }
    }
    const dx = tx - u.x
    const dy = ty - u.y
    const len = Math.hypot(dx, dy)
    if (len < 1e-6) continue
    const step = Math.min(speed, len)
    const bx = u.x
    const by = u.y
    moveBy(g, u, (dx / len) * step, (dy / len) * step)
    const moved = Math.hypot(u.x - bx, u.y - by)
    u.stuckT = moved < step * 0.3 ? u.stuckT + dt : 0
    u.facing = turnToward(u.facing, Math.atan2(dy, dx), dt * 12)
    u.anim = 1
  }
  separate(g)
}

export function turnToward(cur: number, target: number, maxStep: number): number {
  let d = target - cur
  while (d > Math.PI) d -= 2 * Math.PI
  while (d < -Math.PI) d += 2 * Math.PI
  if (Math.abs(d) <= maxStep) return target
  return cur + Math.sign(d) * maxStep
}

/** 位移並解算牆面碰撞 */
export function moveBy(g: Game, u: Ent, dx: number, dy: number): void {
  const w = g.world
  const z = w.zones[u.zone]
  u.x += dx
  u.y += dy
  if (z.nav) {
    z.nav.resolve(u, u.radius, doorPassFor(g, u, z))
  } else if (u.zone === SPACE_ZONE) {
    u.x = Math.max(-SPACE_HALF, Math.min(SPACE_HALF, u.x))
    u.y = Math.max(-SPACE_HALF, Math.min(SPACE_HALF, u.y))
  }
  w.moved(u)
}

const tmp: Ent[] = []
/** 單位之間的軟碰撞（建築把人推開）*/
function separate(g: Game): void {
  const w = g.world
  for (const u of w.ents.values()) {
    if (!u.alive || u.def.speed <= 0 || u.tags.has('flying') || u.data.ghost) continue
    tmp.length = 0
    w.query(u.zone, u.x, u.y, u.radius + 1, tmp)
    for (const o of tmp) {
      if (o === u || !o.alive || o.tags.has('noTarget') || o.tags.has('corpse') || o.data.ghost) continue
      if (u.zone === SPACE_ZONE && !o.tags.has('station')) continue
      const minD = u.radius + o.radius
      const dx = u.x - o.x
      const dy = u.y - o.y
      const d2 = dx * dx + dy * dy
      if (d2 >= minD * minD || d2 < 1e-8) continue
      const d = Math.sqrt(d2)
      const overlap = minD - d
      const push = o.def.speed <= 0 || o.solidBody ? overlap : overlap * 0.5
      moveBy(g, u, (dx / d) * push * 0.6, (dy / d) * push * 0.6)
    }
  }
}

/** 自動門：附近有單位就開，沒人就關；鎖住的門不開 */
export function stepDoors(g: Game): void {
  const w = g.world
  if (w.tick % 2 !== 0) return
  for (const z of w.zones) {
    if (!z.layout || !z.nav) continue
    for (const d of z.doors) {
      if (d.lockUntil && g.time >= d.lockUntil) {
        d.locked = false
        d.lockUntil = 0
      }
      const inst = z.layout.doors[d.index]
      let want = false
      if (d.broken) want = true
      else if (!d.locked && d.forced <= g.time) {
        tmp.length = 0
        w.query(z.id, inst.x, inst.y, 2.2, tmp)
        for (const u of tmp) {
          if (!u.alive || u.def.speed <= 0 || u.tags.has('noTarget')) continue
          if (d.clearance && !hasClearance(u, d.clearance)) continue
          want = true
          if (!d.open) {
            d.log.push({ t: Math.round(g.time), sil: silhouette(u) })
            if (d.log.length > 5) d.log.shift()
          }
          break
        }
      }
      if (want !== d.open) {
        d.open = want
        z.nav.doorClosed[d.index] = want ? 0 : 1
      }
    }
  }
}

/** 門禁紀錄的剪影：只記大致體型，不含身分（GDD §9）*/
export function silhouette(u: Ent): string {
  if (u.tags.has('personnel')) return u.tags.has('suit') ? 'rig' : 'crew'
  if (u.tags.has('xenoForm')) return 'creature'
  if (u.tags.has('mutantForm')) return 'creature'
  if (u.tags.has('chassis')) return 'machine'
  if (u.tags.has('drone') || u.tags.has('mechanical')) return 'machine'
  return 'creature'
}
