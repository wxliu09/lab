// 監視器回放（GDD §9 改良）：每台監視器每 0.5 秒記一格畫面，保留 15 秒；擁有者可以要求回放。
// 每格只記當時鏡頭看得到的單位，而且用擁有者的視角遮蔽（匿名、偽裝照樣生效），不會比即時畫面多任何資訊。
import type { Game } from '../game'
import type { Ent } from '../ent'
import { EXTRA_COMMANDS } from './orders'
import { entView } from './snapshot'

/** 一格：[時間×10, 單位…]；單位 = [顯示 def, x×10, y×10, 顏色, 名字, 動作] */
export type ReplayUnit = [string, number, number, number, string, number]
export interface ReplayFrame {
  t: number
  u: ReplayUnit[]
}

const EVERY_TICKS = 10
const KEEP = 30
const REQUEST_CD = 2

function isCamera(e: Ent): boolean {
  return e.alive && e.tags.has('device') && e.def.id.includes('camera') && e.owner >= 0
}

function record(g: Game, cam: Ent, buf: ReplayFrame[]): void {
  const owner = g.players[cam.owner]
  if (!owner) return
  const z = g.world.zones[cam.zone]
  const r = cam.def.sight
  const units: ReplayUnit[] = []
  for (const e of g.world.query(cam.zone, cam.x, cam.y, r)) {
    if (e === cam || e.removed) continue
    if (!e.alive && !e.tags.has('corpse')) continue
    if (e.tags.has('structure') || e.tags.has('noTarget') || e.data.item) continue
    if (e.stats.stealth && e.owner !== owner.slot) continue
    if (z.nav && !z.nav.los(cam.x, cam.y, e.x, e.y, true)) continue
    const v = entView(g, owner, e)
    units.push([v.d ?? e.def.id, Math.round(e.x * 10), Math.round(e.y * 10), v.c ?? -1, v.n ?? '', v.st ?? 0])
  }
  buf.push({ t: Math.round(g.time * 10), u: units })
  if (buf.length > KEEP) buf.shift()
}

export function installFeeds(g: Game): void {
  const bufs = new Map<number, ReplayFrame[]>()
  g.data.feedBufs = bufs
  g.systems.push({
    name: 'feeds',
    fn: (gg) => {
      if (gg.world.tick % EVERY_TICKS !== 0) return
      for (const id of bufs.keys()) if (!gg.world.get(id)) bufs.delete(id)
      for (const e of gg.world.ents.values()) {
        if (!isCamera(e)) continue
        let b = bufs.get(e.id)
        if (!b) bufs.set(e.id, (b = []))
        record(gg, e, b)
      }
    },
  })
  EXTRA_COMMANDS.set('feedReplay', (g2, p, _u, c) => {
    if (g2 !== g || c.e === undefined) return
    const cam = g.world.get(c.e)
    if (!cam || !isCamera(cam) || cam.owner !== p.slot) return
    if ((p.data.replayCd ?? 0) > g.time) return
    p.data.replayCd = g.time + REQUEST_CD
    const frames = bufs.get(cam.id) ?? []
    g.send(p.slot, { t: 'replay', cam: cam.id, zone: cam.zone, x: Math.round(cam.x * 10), y: Math.round(cam.y * 10), r: cam.def.sight, frames: frames.map((f) => ({ t: f.t, u: f.u.map((u) => [...u] as ReplayUnit) })) })
  })
}
