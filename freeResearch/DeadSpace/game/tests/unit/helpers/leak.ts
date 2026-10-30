// 隱藏資訊洩漏檢查器：獨立於 vision.ts 重新判定「應該看得到什麼」，比對每一則送出的訊息。
import { decode } from '../../../src/shared/protocol/codec'
import type { HostMsg } from '../../../src/shared/protocol/messages'
import type { Game } from '../../../src/sim/game'
import type { Ent } from '../../../src/sim/ent'
import { SPACE_ZONE } from '../../../src/sim/world'

const FORBIDDEN_KEYS = new Set(['role', 'faction', 'spawnOf', 'android', 'isSpawn', 'trueOwner', 'phd'])

function walk(v: unknown, path: string, out: string[]): void {
  if (Array.isArray(v)) v.forEach((x, i) => walk(x, `${path}[${i}]`, out))
  else if (v && typeof v === 'object') {
    for (const [k, x] of Object.entries(v)) {
      if (FORBIDDEN_KEYS.has(k)) out.push(`${path}.${k}`)
      walk(x, `${path}.${k}`, out)
    }
  }
}

/** 一位觀看者在模擬當下「合理可見」的實體（寬鬆版：視野半徑＋LOS，不考慮隱形）*/
export function oracleVisible(g: Game, slot: number): Set<number> {
  const p = g.players[slot]
  const out = new Set<number>()
  const w = g.world
  for (const e of w.ents.values()) if (e.zone === SPACE_ZONE) out.add(e.id)
  if (!p.alive || p.spectator || p.flags.mapHack) {
    for (const e of w.ents.values()) out.add(e.id)
    return out
  }
  const f = g.faction(p)
  const mine: Ent[] = []
  for (const e of w.ents.values()) {
    if (e.owner < 0 || !e.alive) continue
    const o = g.players[e.owner]
    if (!o) continue
    if (e.owner === slot || (f !== 'crew' && g.faction(o) === f && o.alive)) mine.push(e)
  }
  for (const e of mine) out.add(e.id)
  for (const t of w.ents.values()) {
    for (const s of mine) {
      if (s.zone !== t.zone) continue
      const r = s.stats.sight
      if ((s.x - t.x) ** 2 + (s.y - t.y) ** 2 > (r + t.radius + 0.5) ** 2) continue
      const z = w.zones[s.zone]
      if (z.nav && !z.nav.los(s.x, s.y, t.x, t.y, true) && t.radius < 0.8) continue
      out.add(t.id)
      break
    }
  }
  for (const v of p.view.extraSources) {
    for (const t of w.ents.values()) if (t.zone === v.zone && (t.x - v.x) ** 2 + (t.y - v.y) ** 2 <= v.r * v.r) out.add(t.id)
  }
  return out
}

export interface LeakReport {
  problems: string[]
}

/** 檢查送給某 peer 的一批原始訊息 */
export function checkMessages(g: Game, slot: number, raws: Uint8Array[]): string[] {
  const problems: string[] = []
  const vis = oracleVisible(g, slot)
  const viewer = g.players[slot]
  const fv = g.faction(viewer)
  for (const raw of raws) {
    const m = decode(raw) as HostMsg
    if (!m || typeof m !== 'object') continue
    if (m.t === 'snap') {
      const s = m.s
      const keyProblems: string[] = []
      walk({ e: s.e, fx: s.fx, w: s.w, doors: s.doors }, 'snap', keyProblems)
      problems.push(...keyProblems)
      for (const e of s.e) {
        const ent = g.world.ents.get(e.i)
        if (ent && !vis.has(e.i)) problems.push(`slot${slot} 看到不可見實體 ${ent.def.id}`)
        if (ent && ent.anon) {
          const o = ent.owner >= 0 ? g.players[ent.owner] : null
          const allowed = ent.owner === slot || viewer.flags.xray || (o && fv !== 'crew' && g.faction(o) === fv && viewer.alive)
          if (!allowed) {
            if (e.o !== undefined && e.o >= 0 && !ent.data.fake) problems.push(`匿名單位 ${ent.def.id} 洩漏擁有者給 slot${slot}`)
            if (e.n && !ent.data.fake) problems.push(`匿名單位名稱洩漏給 slot${slot}`)
            if (e.c !== undefined && e.c >= 0 && !ent.data.fake) problems.push(`匿名單位顏色洩漏給 slot${slot}`)
          }
        }
      }
      if (s.me && s.me.slot !== undefined && s.me.slot !== slot) problems.push(`slot${slot} 收到別人的私有狀態`)
      if (s.me?.mates?.length && fv === 'crew') problems.push(`人類 slot${slot} 收到同陣營名單`)
    }
    if (m.t === 'chat') {
      for (const l of m.lines) {
        if (l.ch === 'dead' && viewer.alive && !viewer.flags.hear) problems.push(`活人 slot${slot} 收到死者聊天`)
        if (l.ch === 'team' && fv === 'crew' && !viewer.flags.hear) problems.push(`人類 slot${slot} 收到陣營私頻`)
        if (l.ch === 'group' && !viewer.flags.hear && viewer.alive && !l.group) problems.push(`slot${slot} 收到不明群組訊息`)
      }
    }
    if (m.t === 'TuneResult' || m.t === 'lobbyState' || m.t === 'start') {
      const keyProblems: string[] = []
      walk(m, m.t, keyProblems)
      problems.push(...keyProblems)
    }
  }
  return problems
}
