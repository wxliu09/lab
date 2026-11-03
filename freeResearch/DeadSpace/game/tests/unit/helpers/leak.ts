// 隱藏資訊洩漏檢查器：獨立於 vision.ts 重新判定「應該看得到什麼」，比對每一則送出的訊息。
import { decode } from '../../../src/shared/protocol/codec'
import type { HostMsg, SnapEntity } from '../../../src/shared/protocol/messages'
import type { Game, GamePlayer } from '../../../src/sim/game'
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
  if (!p.alive || p.spectator || p.flags.wide) {
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

/**
 * 較強的 oracle：擁有者目前以匿名形態出現（沒有偽裝）時，他在這個形態下生出來的非主單位子物件（召喚物、裝置、
 * 地面物件、蟲餌…）也必須匿名；否則子物件會把匿名單位和玩家連起來。
 * 「這個形態下生出來」以 bornAt 判斷：匿名形態都是新生成的主單位（replaceMain），比它早出現的子物件是人形時放的，
 * 顯示擁有者不算洩漏（反而在變身時改成匿名才會露餡）。
 */
export function anonChildProblems(g: Game, viewer: GamePlayer, ent: Ent, sv: SnapEntity): string[] {
  if (ent.isMain || ent.owner < 0 || ent.owner === viewer.slot || viewer.flags.reveal) return []
  const O = g.players[ent.owner]
  if (!O) return []
  const fo = g.faction(O)
  if (fo !== 'crew' && fo === g.faction(viewer) && viewer.alive) return []
  const main = g.mainOf(O)
  if (!main || main === ent || !main.anon || main.data.fake || ent.bornAt < main.bornAt) return []
  const out: string[] = []
  if (sv.o !== undefined && sv.o === O.slot) out.push(`匿名擁有者的子物件 ${ent.def.id} 洩漏擁有者給 slot${viewer.slot}`)
  if (sv.c !== undefined && sv.c >= 0 && sv.c === O.color) out.push(`匿名擁有者的子物件 ${ent.def.id} 洩漏顏色給 slot${viewer.slot}`)
  if (sv.n && sv.n === O.name) out.push(`匿名擁有者的子物件 ${ent.def.id} 洩漏名字給 slot${viewer.slot}`)
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
          const allowed = ent.owner === slot || viewer.flags.reveal || (o && fv !== 'crew' && g.faction(o) === fv && viewer.alive)
          if (!allowed) {
            // 偽裝（data.fake）或偽裝期間放下的子物件（data.maskOf）會顯示偽裝對象：只要不是真正的擁有者就行
            const masked = !!ent.data.fake || typeof ent.data.maskOf === 'number'
            if (masked) {
              if (e.o !== undefined && e.o >= 0 && e.o === ent.owner) problems.push(`偽裝單位 ${ent.def.id} 洩漏真正的擁有者給 slot${slot}`)
            } else {
              if (e.o !== undefined && e.o >= 0) problems.push(`匿名單位 ${ent.def.id} 洩漏擁有者給 slot${slot}`)
              if (e.n) problems.push(`匿名單位名稱洩漏給 slot${slot}`)
              if (e.c !== undefined && e.c >= 0) problems.push(`匿名單位顏色洩漏給 slot${slot}`)
            }
          }
        }
        if (ent) problems.push(...anonChildProblems(g, viewer, ent, e))
      }
      if (s.me && s.me.slot !== undefined && s.me.slot !== slot) problems.push(`slot${slot} 收到別人的私有狀態`)
      if (s.me?.mates?.length && fv === 'crew') problems.push(`人類 slot${slot} 收到同陣營名單`)
    }
    if (m.t === 'chat') {
      for (const l of m.lines) {
        if (l.ch === 'dead' && viewer.alive && !viewer.flags.listen) problems.push(`活人 slot${slot} 收到死者聊天`)
        if (l.ch === 'team' && fv === 'crew' && !viewer.flags.listen) problems.push(`人類 slot${slot} 收到陣營私頻`)
        if (l.ch === 'group' && !viewer.flags.listen && viewer.alive && !l.group) problems.push(`slot${slot} 收到不明群組訊息`)
      }
    }
    if (m.t === 'lobbyState' || m.t === 'start') {
      const keyProblems: string[] = []
      walk(m, m.t, keyProblems)
      problems.push(...keyProblems)
    }
  }
  return problems
}
