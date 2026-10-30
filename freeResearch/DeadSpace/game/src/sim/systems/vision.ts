// 視野：每 tick 為每位玩家計算可見實體集合（architecture §4.4）。
// 規則：同 zone、在視野半徑內、LOS 不被牆／關閉的門擋住；太空層對所有人可見；
// 異類陣營（主腦＋spawn）共享視野，人類各自獨立；隱形單位只有擁有者與其陣營看得到。
import type { Game, GamePlayer } from '../game'
import type { Ent } from '../ent'
import { SPACE_ZONE } from '../world'

export interface VisionSource {
  zone: number
  x: number
  y: number
  r: number
}

export interface VisionResult {
  ents: Set<Ent>
  sources: VisionSource[]
  /** zone → 看得到的門 index */
  doors: Map<number, Set<number>>
  /** 旁觀：整個 zone 都看得到 */
  fullZones: Set<number>
}

/** 這位觀看者能不能知道某單位的真正擁有者 */
export function knowsOwner(g: Game, viewer: GamePlayer, e: Ent): boolean {
  if (!e.anon) return true
  if (e.owner < 0) return false
  if (e.owner === viewer.slot) return true
  if (viewer.flags.reveal) return true
  const owner = g.players[e.owner]
  if (!owner) return false
  const fo = g.faction(owner)
  return fo !== 'crew' && fo === g.faction(viewer) && viewer.alive
}

/** 兩位玩家是否共享視野（異類陣營彼此共享）*/
function sharesVision(g: Game, a: GamePlayer, b: GamePlayer): boolean {
  if (a.slot === b.slot) return true
  const fa = g.faction(a)
  return fa !== 'crew' && fa === g.faction(b)
}

function sourcesOf(g: Game, viewer: GamePlayer): VisionSource[] {
  const out: VisionSource[] = []
  const allies = g.allPlayers().filter((q) => q.alive && sharesVision(g, viewer, q))
  const allySlots = new Set(allies.map((q) => q.slot))
  for (const e of g.world.ents.values()) {
    if (!e.alive || e.owner < 0 || !allySlots.has(e.owner)) continue
    if (e.def.sight <= 0 || e.data.noVision) continue
    // 駕駛中的人看得到艙內（自己所在 zone）與載具周圍（太空）
    out.push({ zone: e.zone, x: e.x, y: e.y, r: e.stats.sight * (e.data.blindMult ?? 1) })
  }
  // 額外視野（Omniscience、雷達 ping 等）
  const extra = viewer.view.extraSources
  for (let i = extra.length - 1; i >= 0; i--) {
    if (extra[i].until < g.time) extra.splice(i, 1)
    else out.push(extra[i])
  }
  return out
}

const near: Ent[] = []

export function computeVision(g: Game): Map<number, VisionResult> {
  const w = g.world
  const res = new Map<number, VisionResult>()
  const spaceEnts = w.inZone(SPACE_ZONE)
  for (const p of g.allPlayers()) {
    const r: VisionResult = { ents: new Set(), sources: [], doors: new Map(), fullZones: new Set() }
    res.set(p.slot, r)
    // 太空層所有人可見（隱形船除外）
    for (const e of spaceEnts) if (!e.stats.stealth || canSeeStealth(g, p, e)) r.ents.add(e)
    // 死去的仿生人只能透過記憶核心觀看
    if (!p.alive && p.data.coreOnly && !p.stayDead) {
      const core = findCore(g, p)
      if (core) {
        r.sources = [{ zone: core.zone, x: core.x, y: core.y, r: 6.5 }]
        near.length = 0
        g.world.query(core.zone, core.x, core.y, 6.5, near)
        const z = g.world.zones[core.zone]
        for (const e of near) if (!z.nav || z.nav.los(core.x, core.y, e.x, e.y, true)) r.ents.add(e)
        r.ents.add(core)
      }
      p.view.visible = new Set([...r.ents].map((e) => e.id))
      continue
    }
    const spectating = !p.alive || p.spectator
    if (spectating || p.flags.wide) {
      const zones = new Set<number>()
      if (spectating) zones.add(p.specZone)
      if (p.flags.wide) {
        const cu = g.controlOf(p)
        if (cu) zones.add(cu.zone)
        if (spectating) zones.add(p.specZone)
      }
      for (const zid of zones) {
        r.fullZones.add(zid)
        for (const e of w.inZone(zid)) {
          if (e.stats.stealth && !canSeeStealth(g, p, e) && !p.flags.wide) continue
          r.ents.add(e)
        }
        const z = w.zones[zid]
        if (z) r.doors.set(zid, new Set(z.doors.map((d) => d.index)))
      }
      if (!p.alive || p.spectator) {
        p.view.visible = new Set([...r.ents].map((e) => e.id))
        continue
      }
    }
    r.sources = sourcesOf(g, p)
    for (const s of r.sources) {
      const z = w.zones[s.zone]
      if (!z) continue
      near.length = 0
      w.query(s.zone, s.x, s.y, s.r, near)
      for (const e of near) {
        if (r.ents.has(e) || !e.alive && !e.tags.has('corpse')) continue
        if (e.stats.stealth && !canSeeStealth(g, p, e)) continue
        if (z.nav && !z.nav.los(s.x, s.y, e.x, e.y, true)) {
          // 大型單位：邊緣看得到也算
          if (e.radius < 0.8 || !z.nav.los(s.x, s.y, e.x - Math.sign(e.x - s.x) * e.radius, e.y, true)) continue
        }
        r.ents.add(e)
      }
      if (z.layout && z.nav) {
        let ds = r.doors.get(s.zone)
        if (!ds) r.doors.set(s.zone, (ds = new Set()))
        for (const d of z.layout.doors) {
          if (ds.has(d.index)) continue
          if ((d.x - s.x) ** 2 + (d.y - s.y) ** 2 > s.r * s.r) continue
          if (z.nav.los(s.x, s.y, d.x, d.y, true)) ds.add(d.index)
        }
      }
    }
    // 自己的單位一定看得到
    for (const e of w.ents.values()) if (e.owner === p.slot && e.alive) r.ents.add(e)
    p.view.visible = new Set([...r.ents].map((e) => e.id))
  }
  return res
}

/** 記憶核心可能在地上，也可能在某人的背包裡 */
function findCore(g: Game, p: GamePlayer): Ent | undefined {
  const id = p.data.core as number | undefined
  const onGround = id ? g.world.get(id) : undefined
  if (onGround) return onGround
  for (const e of g.world.ents.values()) {
    if (e.inv?.some((it) => it?.id === 'memoryCore' && (it.data as { android?: number } | undefined)?.android === p.slot)) return e
  }
  return undefined
}

export function canSeeStealth(g: Game, viewer: GamePlayer, e: Ent): boolean {
  if (e.owner === viewer.slot) return true
  if (e.owner >= 0) {
    const o = g.players[e.owner]
    if (o) {
      const f = g.faction(o)
      if (f !== 'crew' && f === g.faction(viewer)) return true
    }
  }
  if (e.data.revealedUntil && e.data.revealedUntil > g.time) return true
  return false
}

/** 某個點對這位玩家是否可見（給特效過濾用）*/
export function pointVisible(g: Game, r: VisionResult, zone: number, x: number, y: number): boolean {
  if (zone === SPACE_ZONE || r.fullZones.has(zone)) return true
  const z = g.world.zones[zone]
  for (const s of r.sources) {
    if (s.zone !== zone) continue
    if ((s.x - x) ** 2 + (s.y - y) ** 2 > s.r * s.r) continue
    if (!z.nav || z.nav.los(s.x, s.y, x, y, true)) return true
  }
  return false
}
