// 移動：尋路、路徑跟隨、碰撞、避讓、自動門
import { TICK_DT } from '../../shared/constants'
import type { DoorInstance } from '../../shared/layout'
import type { Game } from '../game'
import { dist2, type Ent } from '../ent'
import type { DoorPass } from '../nav/grid'
import { SPACE_HALF, SPACE_ZONE, type DoorState, type Zone } from '../world'
import { hasItem } from './items'

const REPATH = 0.6
const ARRIVE = 0.15

// ───────── 門控制器故障（events.ts 的 doors 事件）的開關週期 ─────────
// 原作（war3map.j 的 cJ：兩個計時器，0.25 秒後開門 Zj、1.75 秒後關門 xJ，之後各自每 2.25 秒一次）：
// 每 2.25 秒一個週期，開 1.5 秒、關 0.75 秒；關上的那一下夾到門縫裡的單位（xJ → eJ）。
// 事件本身在 events.ts；這裡放共用的時間表，移動系統用它決定「在門外等，還是現在衝過去」。

/** 週期（秒）*/
export const DOOR_CYCLE = 2.25
/** 週期內開門、猛關的時刻（秒）：[DOOR_OPEN_AT, DOOR_SHUT_AT) 開著，其餘關著 */
export const DOOR_OPEN_AT = 0.25
export const DOOR_SHUT_AT = 1.75
/** 門縫：單位中心離門板中線不到這麼遠（公尺；原作 55）就會被夾到 */
export const DOOR_GAP = 0.55

/** 某扇故障門此刻在週期中的位置（各扇門錯開，不會整站同時猛關）*/
export function doorCycle(t: number, index: number): number {
  return (((t + index * 0.37) % DOOR_CYCLE) + DOOR_CYCLE) % DOOR_CYCLE
}
export function cycleOpen(ph: number): boolean {
  return ph >= DOOR_OPEN_AT && ph < DOOR_SHUT_AT
}
/** 離下一次猛關還有幾秒 */
export function untilShut(ph: number): number {
  return ph < DOOR_SHUT_AT ? DOOR_SHUT_AT - ph : DOOR_CYCLE - ph + DOOR_SHUT_AT
}
/** 離下一次打開還有幾秒（開著 = 0）*/
export function untilOpen(ph: number): number {
  if (cycleOpen(ph)) return 0
  return ph < DOOR_OPEN_AT ? DOOR_OPEN_AT - ph : DOOR_CYCLE - ph + DOOR_OPEN_AT
}

/** 單位相對於門的位置：n = 沿通道方向（離門板中線的有號距離）、t = 沿門板方向（離門中心）*/
export function doorAxes(inst: DoorInstance, x: number, y: number): { n: number; t: number } {
  // horizontal = 門板沿 x（通道南北向）
  return inst.horizontal ? { n: y - inst.y, t: x - inst.x } : { n: x - inst.x, t: y - inst.y }
}

/** 單位中心在門縫裡（猛關時會被夾到）*/
export function inDoorGap(inst: DoorInstance, x: number, y: number, r: number): boolean {
  const a = doorAxes(inst, x, y)
  return Math.abs(a.n) < DOOR_GAP && Math.abs(a.t) < inst.width / 2 + r
}

/** 這個單位能不能通過某扇門（碰撞用：故障門關上的那 0.75 秒是實心的）*/
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

/**
 * 尋路用：正在週期開關的故障門當成走得過去（它每 2.25 秒會開 1.5 秒），單位走到門前再等開門的空檔（doorGate）；
 * 鎖住、需要權限而沒有卡的門照舊不通（真的走不到才回報找不到路）。
 */
export function pathPassFor(g: Game, u: Ent, z: Zone): DoorPass {
  const base = doorPassFor(g, u, z)
  return (d) => {
    const door = z.doors[d]
    if (door && door.cycling && !door.locked) return true
    return base(d)
  }
}

export function hasClearance(u: Ent, clearance: string): boolean {
  if (u.data.passLocked) return true
  const card = clearance === 'janitor' ? 'janitorCard' : clearance === 'captain' ? 'captainCard' : clearance
  // 化身中替人寄放的門禁卡也算帶著（hasItem 含 packView.extra）
  return hasItem(u, card)
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
      const pass = pathPassFor(g, u, z)
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
          // 無路可走：放棄命令。真人下的移動命令要告訴他（例如門控制器故障把門鎖住），不然看起來像點了沒反應；同一單位 4 秒內只說一次
          if (human && u.order?.k === 'move' && g.time >= ((u.data.noPathAt as number | undefined) ?? -1)) {
            u.data.noPathAt = g.time + 4
            g.privateLine(u.owner, 'move.noPath')
          }
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
      // 門控制器故障：路徑要穿過正在週期開關的門 → 在門縫外等開門的空檔，來得及才一口氣過去（真人、AI、NPC 共用；
      // 能直接穿過鎖住的門的單位不用等）
      if (u.path && !u.data.passLocked && doorsCycling(g)) {
        const hold = doorGate(g, u, z, goal)
        if (hold) {
          // 等門不算卡住（不重算路徑、不放棄命令）
          u.stuckT = 0
          if (human && g.controlOf(g.players[u.owner]!) === u && g.time >= ((u.data.doorWaitAt as number | undefined) ?? -1) && !doorsJustAnnounced(g)) {
            u.data.doorWaitAt = g.time + DOOR_WAIT_NOTICE
            g.privateLine(u.owner, 'move.doorWait')
          }
          if ((hold.x - u.x) ** 2 + (hold.y - u.y) ** 2 < 0.0025) {
            if (u.anim === 1) u.anim = 0
            continue
          }
          tx = hold.x
          ty = hold.y
        }
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

/** 「在門前等故障門」的私訊每位真人至少隔這麼久（秒）才再說一次 */
const DOOR_WAIT_NOTICE = 30
/** 沿路徑往前看多遠（公尺）找要穿過的故障門 */
const GATE_LOOK = 2.5

/**
 * 門控制器故障剛公告過（這麼多秒內）：等門的私訊先不說，免得和全場公告一前一後說同一件事（第 6 輪審查：長短兩則幾乎重複）
 */
const DOOR_WAIT_GRACE = 45

function doorsJustAnnounced(g: Game): boolean {
  const at = (g.data.events as { doorsAt?: number } | undefined)?.doorsAt
  return at !== undefined && g.time - at < DOOR_WAIT_GRACE
}

/** 門控制器故障進行中（events.ts 的 doorsUntil）：沒有故障時完全不做額外檢查 */
function doorsCycling(g: Game): boolean {
  return (((g.data.events as { doorsUntil?: number } | undefined)?.doorsUntil) ?? 0) > g.time
}

/**
 * 路徑在前方 GATE_LOOK 公尺內要穿過一扇正在週期開關的故障門：
 * 門開著、而且在下一次猛關之前走得出門縫 → 回傳 null（照路徑走）；否則回傳門縫外的等待點（門格外緣、自己這一側）。
 * 已經過了門板中線就往前衝（往前離開門縫一定比退回去近）。目的地本身就在門縫裡（玩家明確點在門口）時不攔。
 */
function doorGate(g: Game, u: Ent, z: Zone, goal: { x: number; y: number }): { x: number; y: number } | null {
  const nav = z.nav!
  const path = u.path!
  // 沿路徑（從自己的位置開始）每 0.25 公尺取樣，找第一扇故障門
  let di = -1
  let seg = u.pathIdx
  let ax = u.x
  let ay = u.y
  let walked = 0
  scan: for (; seg < path.length; seg++) {
    const bx = path[seg].x
    const by = path[seg].y
    const len = Math.hypot(bx - ax, by - ay)
    const steps = Math.max(1, Math.ceil(len / 0.25))
    for (let i = seg === u.pathIdx ? 0 : 1; i <= steps; i++) {
      const f = i / steps
      if (walked + len * f > GATE_LOOK) break scan
      const d = nav.doorOf[nav.idx(ax + (bx - ax) * f, ay + (by - ay) * f)] ?? -1
      if (d >= 0 && isCycling(z.doors[d])) {
        di = d
        break scan
      }
    }
    walked += len
    ax = bx
    ay = by
  }
  if (di < 0) return null
  const inst = z.layout!.doors[di]
  // 門的另一側：路徑上（從找到門的那一段起）第一個在門縫外的點；都在門縫裡就看目的地
  let far = 0
  for (let j = Math.min(seg, path.length - 1); j < path.length && !far; j++) {
    const n = doorAxes(inst, path[j].x, path[j].y).n
    if (Math.abs(n) >= DOOR_GAP) far = Math.sign(n)
  }
  if (!far) {
    const n = doorAxes(inst, goal.x, goal.y).n
    if (Math.abs(n) < DOOR_GAP) return null
    far = Math.sign(n)
  }
  const me = doorAxes(inst, u.x, u.y)
  // 已經在門板中線的另一側（或已經離開門縫）：往前走
  if (me.n * far >= 0) return null
  const t = g.time
  const ph = doorCycle(t, di)
  const v = Math.max(0.01, u.stats.speed)
  // 從現在的位置走出另一側門縫還要多遠（多留一點餘裕）
  const need = -me.n * far + DOOR_GAP + 0.15
  if (cycleOpen(ph) && z.doors[di].forced <= t) {
    // 提早兩個 tick 算：猛關判定在移動之前
    if (v * (untilShut(ph) - 2 * TICK_DT) >= need) return null
    // 慢到整段開門時間都走不出去：只能在剛打開時就衝（否則永遠過不去）
    const window = DOOR_SHUT_AT - DOOR_OPEN_AT
    if (v * (window - 2 * TICK_DT) < need && untilShut(ph) > window - 0.2) return null
  }
  // 門縫外的等待點：門格外緣再退一點（≥ DOOR_GAP），橫向對齊最近的一格門
  const back = 0.5 + u.radius + 0.08
  // 離門還遠：先照路徑走近（路徑本來就通到門口），走到等待點附近再停
  if (-me.n * far > back + 0.5) return null
  const half = Math.max(0, inst.width / 2 - 0.5)
  const lat = Math.max(-half, Math.min(half, me.t))
  const side = -far
  return inst.horizontal ? { x: inst.x + lat, y: inst.y + side * back } : { x: inst.x + side * back, y: inst.y + lat }
}

function isCycling(d: DoorState | undefined): boolean {
  return !!d && d.cycling && !d.locked && !d.broken
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
      // 門控制器故障中週期開關的門由 events.ts 控制（原作故障期間也關掉了門的進出感應）
      if (d.cycling) continue
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
            // 隱形中的單位照樣會讓門打開（物理上合理），但門禁只記「未識別」：剪影會說出看不見的是人、生物還是機械
            d.log.push({ t: Math.round(g.time), sil: doorSilhouette(g, u) })
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

/** 門禁紀錄記下的剪影：隱形中（沒被揭露）的單位記成「未識別」，其他照體型 */
export function doorSilhouette(g: Game, u: Ent): string {
  const hidden = u.stats.stealth && !((u.data.revealedUntil as number | undefined) && u.data.revealedUntil > g.time)
  return hidden ? 'unknown' : silhouette(u)
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
