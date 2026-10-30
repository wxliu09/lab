// 指令 → 單位命令。所有目標實體都必須是發令者「目前看得到」的，避免 peer 用記住的 id 探測隱藏單位。
import type { Command } from '../../shared/protocol/messages'
import type { Game, GamePlayer } from '../game'
import type { Ent, Order } from '../ent'
import { SPACE_HALF } from '../world'
import { abilityDef } from '../../shared/content/registry'

export type CommandHandler = (g: Game, p: GamePlayer, u: Ent, c: Command) => void

/** 其他系統（道具、技能、互動、進化）在載入時註冊自己的指令處理 */
export const EXTRA_COMMANDS = new Map<string, CommandHandler>()

export function canSee(g: Game, p: GamePlayer, id: number): boolean {
  return p.view.visible.has(id)
}

function clampPoint(g: Game, u: Ent, c: Command): { x: number; y: number } | null {
  if (c.x === undefined || c.y === undefined) return null
  const z = g.world.zones[u.zone]
  if (z.kind === 'space') {
    return { x: Math.max(-SPACE_HALF, Math.min(SPACE_HALF, c.x)), y: Math.max(-SPACE_HALF, Math.min(SPACE_HALF, c.y)) }
  }
  const l = z.layout!
  return { x: Math.max(0.5, Math.min(l.w - 0.5, c.x)), y: Math.max(0.5, Math.min(l.h - 0.5, c.y)) }
}

export function issue(u: Ent, o: Order | null, queue = false): void {
  if (queue && u.order) {
    if (u.queue.length < 16 && o) u.queue.push(o)
    return
  }
  u.order = o
  u.queue.length = 0
  u.path = null
  u.repathAt = 0
  u.stuckT = 0
  // 移動等命令會中斷施法（引導中除外由技能系統判斷）
  if (u.cast && !u.cast.channeling && o && o.k !== 'cast') u.cast = null
}

/** 異類陣營預設不能攻擊自己人（主腦打 -allow 解除）*/
export function mayAttack(g: Game, p: GamePlayer, t: Ent): boolean {
  if (t.owner < 0 || t.owner === p.slot) return true
  const f = g.faction(p)
  if (f === 'crew') return true
  const o = g.players[t.owner]
  if (!o || g.faction(o) !== f) return true
  const m = g.allPlayers().find((q) => q.role === f && !q.spawnOf)
  return !!m?.data.allowSpawnAttack
}

export function handleCommand(g: Game, p: GamePlayer, c: Command): void {
  if (!p.alive && !(p.data.slug && p.control === p.data.slug)) return
  const u = g.controlOf(p)
  if (!u || !u.alive || u.owner !== p.slot) return
  if (u.data.frozen) return
  const extra = EXTRA_COMMANDS.get(c.k)
  if (extra) {
    extra(g, p, u, c)
    return
  }
  switch (c.k) {
    case 'move': {
      const pt = clampPoint(g, u, c)
      if (!pt) return
      issue(u, { k: 'move', x: pt.x, y: pt.y }, c.q)
      break
    }
    case 'amove': {
      const pt = clampPoint(g, u, c)
      if (!pt) return
      issue(u, { k: 'amove', x: pt.x, y: pt.y }, c.q)
      break
    }
    case 'attack': {
      if (c.e === undefined || !canSee(g, p, c.e)) return
      const t = g.world.get(c.e)
      if (!t || !t.alive || t.zone !== u.zone || t === u || t.tags.has('noTarget')) return
      if (!mayAttack(g, p, t)) {
        g.privateLine(p.slot, 'role.cantAttackMate')
        return
      }
      if (!u.def.attack) {
        issue(u, { k: 'follow', e: t.id }, c.q)
        return
      }
      issue(u, { k: 'attack', e: t.id }, c.q)
      break
    }
    case 'follow': {
      if (c.e === undefined || !canSee(g, p, c.e)) return
      const t = g.world.get(c.e)
      if (!t || !t.alive || t.zone !== u.zone || t === u) return
      issue(u, { k: 'follow', e: t.id }, c.q)
      break
    }
    case 'stop':
      issue(u, null)
      u.cast = null
      break
    case 'hold':
      issue(u, { k: 'hold', x: u.x, y: u.y })
      break
    case 'cast': {
      if (!c.a || !u.abilities.includes(c.a)) return
      const ab = abilityDef(c.a)
      if (!ab) return
      if (ab.target === 'unit' || ab.target === 'unitOrPoint') {
        if (c.e !== undefined) {
          if (!canSee(g, p, c.e) && c.e !== u.id) return
          issue(u, { k: 'cast', a: c.a, e: c.e }, c.q)
          return
        }
        if (ab.target === 'unit') return
      }
      if (ab.target === 'point' || ab.target === 'unitOrPoint') {
        const pt = clampPoint(g, u, c)
        if (!pt) return
        issue(u, { k: 'cast', a: c.a, x: pt.x, y: pt.y }, c.q)
        return
      }
      issue(u, { k: 'cast', a: c.a, x: u.x, y: u.y }, c.q)
      break
    }
    case 'interact': {
      if (c.e === undefined || !canSee(g, p, c.e)) return
      const t = g.world.get(c.e)
      if (!t || t.zone !== u.zone) return
      issue(u, { k: 'interact', e: t.id }, c.q)
      break
    }
    case 'autocast': {
      if (!c.a || !u.abilities.includes(c.a)) return
      if (u.autocast.has(c.a)) u.autocast.delete(c.a)
      else if (abilityDef(c.a)?.autocast) u.autocast.add(c.a)
      break
    }
  }
}
