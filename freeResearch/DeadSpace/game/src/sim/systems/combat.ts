// 自動攻擊：攻擊命令、攻擊移動、原地；敵對生物自動索敵。所有玩家彼此結盟（原作），玩家之間只能明確下令攻擊。
import type { AttackDef } from '../../shared/content/types'
import { BUFFS } from '../../shared/content/registry'
import { HOSTILE, dist2, type Ent } from '../ent'
import type { Game } from '../game'
import { SPACE_ZONE } from '../world'
import { damage } from './damage'
import { spawnProjectile } from './projectiles'
import { runEffects } from './effects'
import { turnToward } from './movement'

/** 會自動互相攻擊的關係：敵對生物 vs 其他所有單位 */
export function isHostile(g: Game, a: Ent, b: Ent): boolean {
  if (a === b || !b.alive) return false
  if (b.tags.has('noTarget') || b.tags.has('corpse') || b.tags.has('rubble')) return false
  const ah = a.owner === HOSTILE
  const bh = b.owner === HOSTILE
  if (ah && bh) return false
  if (ah || bh) {
    if (b.tags.has('structure') && !b.tags.has('device') && !b.tags.has('station')) return false
    return true
  }
  // 自訂敵意（綏靖機器人、海盜等由 AI 決定）
  return g.customHostile?.(a, b) ?? false
}

function canHit(a: AttackDef, t: Ent): boolean {
  if (a.only === 'structure') return t.tags.has('structure')
  if (a.only === 'space') return t.zone === SPACE_ZONE
  if (a.only === 'nonStructure') return !t.tags.has('structure')
  return true
}

function acquire(g: Game, u: Ent): Ent | null {
  const r = Math.max(u.stats.range + 1, Math.min(u.stats.sight, 12))
  let best: Ent | null = null
  let bestD = Infinity
  const z = g.world.zones[u.zone]
  for (const t of g.world.query(u.zone, u.x, u.y, r)) {
    if (!isHostile(g, u, t) || !canHit(u.def.attack!, t)) continue
    if (t.stats.stealth) continue
    const d = dist2(u, t)
    if (d >= bestD) continue
    if (z.nav && !z.nav.los(u.x, u.y, t.x, t.y, true)) continue
    bestD = d
    best = t
  }
  return best
}

export function inAttackRange(g: Game, u: Ent, t: Ent): boolean {
  const r = u.stats.range + u.radius + t.radius
  if (dist2(u, t) > r * r) return false
  const z = g.world.zones[u.zone]
  return !z.nav || z.nav.los(u.x, u.y, t.x, t.y, true)
}

export function fireAttack(g: Game, u: Ent, t: Ent): void {
  const a = u.def.attack!
  const dmg = g.world.rng.range(a.dmg[0], a.dmg[1])
  const kind = a.dmgKind ?? 'normal'
  for (const b of u.buffs) if (BUFFS.get(b.id)?.breakOnAttack) b.until = g.time
  const hit = (target: Ent | undefined, x: number, y: number) => {
    if (a.aoe) {
      for (const o of g.world.query(u.zone, x, y, a.aoe)) {
        if (o === u || !o.alive || o.tags.has('noTarget') || o.tags.has('corpse')) continue
        damage(g, u, o, o === target ? dmg : dmg * 0.6, { kind })
      }
    } else if (target) damage(g, u, target, dmg, { kind })
    if (a.onHit && target) runEffects(g, { caster: u, target, x, y, zone: u.zone }, a.onHit)
  }
  switch (a.kind) {
    case 'melee':
    case 'hitscan':
    case 'beam':
      g.emitFx({ k: 'atk', z: u.zone, x: u.x, y: u.y, x2: t.x, y2: t.y, e: u.id, e2: t.id, s: a.fx })
      hit(t, t.x, t.y)
      break
    case 'projectile':
    case 'artillery':
      spawnProjectile(g, {
        caster: u,
        zone: u.zone,
        x: u.x,
        y: u.y,
        tx: t.x,
        ty: t.y,
        target: a.kind === 'projectile' ? t : undefined,
        speed: a.projSpeed ?? 18,
        fx: a.fx,
        pierce: a.pierce,
        range: a.pierce ? u.stats.range + 1 : undefined,
        onHit: [{ k: 'script', fn: '_attackHit', p: { dmg, aoe: a.aoe ?? 0, kind } }, ...(a.onHit ?? [])],
      })
      break
  }
}

export function stepCombat(g: Game): void {
  const t = g.time
  for (const u of g.world.ents.values()) {
    if (!u.alive || !u.def.attack || u.stats.stunned || u.stats.disarmed || u.data.frozen || u.data.dash) continue
    if (u.cast) continue
    const o = u.order
    // 前搖結束 → 開火
    if (u.windupUntil > 0 && t >= u.windupUntil) {
      u.windupUntil = 0
      const tgt = g.world.get(u.windupTarget)
      if (tgt && tgt.alive && inAttackRange(g, u, tgt)) {
        fireAttack(g, u, tgt)
        u.atkReady = t + u.def.attack.cd / Math.max(0.1, u.stats.atkSpeed)
      }
      continue
    }
    if (u.windupUntil > t) continue
    let target: Ent | null = null
    if (o?.k === 'attack') {
      target = g.world.get(o.e!) ?? null
      if (!target || !target.alive || target.zone !== u.zone) {
        u.order = u.queue.shift() ?? null
        u.anim = 0
        continue
      }
    } else if (o?.k === 'amove' || o?.k === 'hold' || ((!o || o.k === 'patrol') && u.acquire)) {
      target = acquire(g, u)
      if (target && o?.k === 'hold' && !inAttackRange(g, u, target)) target = null
      if (target && o?.k !== 'hold') {
        // 暫時轉成攻擊（保留原命令於佇列）
        if (o) u.queue.unshift(o)
        u.order = { k: 'attack', e: target.id }
      }
    }
    if (!target) {
      if (u.anim === 2) u.anim = 0
      continue
    }
    if (!inAttackRange(g, u, target)) continue
    u.facing = turnToward(u.facing, Math.atan2(target.y - u.y, target.x - u.x), 0.8)
    u.path = null
    if (u.atkReady > t) {
      u.anim = 2
      continue
    }
    u.anim = 2
    u.animTarget = target.id
    const wu = u.def.attack.windup ?? (u.def.attack.cd < 0.4 ? 0 : 0.12)
    if (wu <= 0) {
      // 高射速武器：同一 tick 直接開火，冷卻從上一發起算（避免被 tick 量化拖慢）
      fireAttack(g, u, target)
      const cd = u.def.attack.cd / Math.max(0.1, u.stats.atkSpeed)
      u.atkReady = Math.max(u.atkReady + cd, t + cd - 0.05)
      continue
    }
    u.windupUntil = t + wu
    u.windupTarget = target.id
  }
}
