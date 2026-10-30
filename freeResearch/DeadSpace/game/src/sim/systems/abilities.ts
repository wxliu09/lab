// 施法流程：驗證 → 接近到射程 → 施法時間 → 付出能量與冷卻 → 執行效果 → 引導
import type { AbilityDef } from '../../shared/content/types'
import { abilityDef, itemDef } from '../../shared/content/registry'
import type { Ent } from '../ent'
import { dist } from '../ent'
import type { Game } from '../game'
import { SPACE_ZONE } from '../world'
import { passesFilter, runEffects } from './effects'
import { turnToward } from './movement'
import { consumeCharge } from './items'

export function cdReady(g: Game, u: Ent, ab: AbilityDef): boolean {
  if (u.data.noCd) return true
  return (u.cds.get(ab.sharedCd ?? ab.id) ?? 0) <= g.time
}

export function setCd(g: Game, u: Ent, ab: AbilityDef, cd = ab.cd): void {
  if (u.data.noCd) return
  u.cds.set(ab.sharedCd ?? ab.id, g.time + cd)
}

/** 技能是否可以由這個單位對這個目標施放（不含射程）*/
export function canCast(g: Game, u: Ent, ab: AbilityDef, target: Ent | undefined, fromItem: boolean): string | null {
  if (!u.alive) return 'dead'
  if (u.stats.stunned) return 'stunned'
  if (u.stats.silenced && !fromItem) return 'silenced'
  if (!cdReady(g, u, ab)) return 'cooldown'
  if (u.mp < ab.mana && !u.data.noCd) return 'mana'
  if (ab.spaceOnly && u.zone !== SPACE_ZONE) return 'space'
  if (ab.noSpace && u.zone === SPACE_ZONE) return 'space'
  if (ab.once && u.data['once:' + ab.id]) return 'once'
  if (target) {
    if (target.zone !== u.zone && !ab.filter?.anyZone) return 'zone'
    if (!passesFilter(g, u, target, ab.filter ?? (target === u ? { self: true } : undefined))) return 'target'
  }
  return null
}

function inRange(g: Game, u: Ent, ab: AbilityDef, tx: number, ty: number, t?: Ent): boolean {
  if (ab.target === 'none' || ab.target === 'self' || ab.target === 'toggle') return true
  if (ab.filter?.anyZone) return true
  const r = (ab.range ?? 1) + (t?.radius ?? 0) + u.radius
  if (Math.hypot(tx - u.x, ty - u.y) > r) return false
  const z = g.world.zones[u.zone]
  if (z.nav && !z.nav.los(u.x, u.y, tx, ty, true)) return false
  return true
}

export function stepCasting(g: Game): void {
  const t = g.time
  for (const u of g.world.ents.values()) {
    if (!u.alive) continue
    // 進行中的施法
    if (u.cast) {
      const c = u.cast
      const ab = abilityDef(c.ability)
      if (!ab || u.stats.stunned || (c.channeling && (!u.order || u.order.k !== 'cast'))) {
        u.cast = null
        u.anim = 0
        continue
      }
      const target = c.e ? g.world.get(c.e) : undefined
      if (!c.channeling) {
        if (t < c.end) {
          if (target) u.facing = turnToward(u.facing, Math.atan2(target.y - u.y, target.x - u.x), 0.6)
          continue
        }
        // 施法完成：再驗證一次（目標可能已死、能量被吸）
        const fromItem = c.itemSlot >= 0
        if (canCast(g, u, ab, target, fromItem) && !(ab.filter?.corpse && target?.tags.has('corpse'))) {
          u.cast = null
          u.order = u.queue.shift() ?? null
          u.anim = 0
          continue
        }
        u.mp -= u.data.noCd ? 0 : ab.mana
        setCd(g, u, ab)
        if (ab.once) u.data['once:' + ab.id] = true
        if (fromItem) consumeCharge(g, u, c.itemSlot)
        if (ab.breaksStealth) for (const b of u.buffs) if (b.id.endsWith('stealth') || b.id.includes('cloak')) b.until = t
        runEffects(g, { caster: u, target, x: c.x, y: c.y, zone: u.zone, ability: ab, itemSlot: c.itemSlot }, ab.effects)
        g.onCast?.(u, ab, target)
        if (ab.channel) {
          c.channeling = true
          c.end = t + ab.channel
          c.nextTick = t + (ab.channelTick ?? 1)
          u.anim = 5
          continue
        }
        u.cast = null
        u.anim = 0
        if (u.order?.k === 'cast') u.order = u.queue.shift() ?? null
        continue
      }
      // 引導中
      if (ab.tickEffects && t >= c.nextTick) {
        c.nextTick = t + (ab.channelTick ?? 1)
        runEffects(g, { caster: u, target, x: c.x, y: c.y, zone: u.zone, ability: ab }, ab.tickEffects)
      }
      if (t >= c.end) {
        u.cast = null
        u.anim = 0
        if (u.order?.k === 'cast') u.order = u.queue.shift() ?? null
      }
      continue
    }
    const o = u.order
    if (!o || o.k !== 'cast' || !o.a) continue
    const ab = abilityDef(o.a)
    if (!ab) {
      u.order = null
      continue
    }
    const fromItem = o.itemSlot !== undefined && o.itemSlot >= 0
    if (fromItem) {
      const it = u.inv?.[o.itemSlot!]
      if (!it || itemDef(it.id)?.use !== ab.id || it.cdUntil > t) {
        u.order = null
        continue
      }
    } else if (!u.abilities.includes(ab.id)) {
      u.order = null
      continue
    }
    const target = o.e ? g.world.get(o.e) : undefined
    if (o.e && (!target || (!target.alive && !ab.filter?.corpse))) {
      u.order = null
      continue
    }
    const why = canCast(g, u, ab, target, fromItem)
    if (why) {
      u.order = u.queue.shift() ?? null
      if (why !== 'cooldown') g.castFail(u, why)
      continue
    }
    const tx = target ? target.x : (o.x ?? u.x)
    const ty = target ? target.y : (o.y ?? u.y)
    if (!inRange(g, u, ab, tx, ty, target)) {
      // 交給移動系統靠近
      u.data.castRange = Math.max(0.5, (ab.range ?? 1) * 0.92)
      continue
    }
    u.path = null
    u.facing = Math.atan2(ty - u.y, tx - u.x) || u.facing
    u.cast = {
      ability: ab.id,
      start: t,
      end: t + (ab.cast ?? 0),
      x: tx,
      y: ty,
      e: target?.id ?? 0,
      itemSlot: fromItem ? o.itemSlot! : -1,
      channeling: false,
      nextTick: 0,
      ox: u.x,
      oy: u.y,
    }
    u.anim = 3
    u.animTarget = target?.id ?? 0
    if (ab.cast) g.emitFx({ k: 'castStart', z: u.zone, x: u.x, y: u.y, e: u.id, s: ab.id, v: ab.cast })
  }
}

/** 自動施放（治療術等）：閒置時找最近的受傷單位 */
export function stepAutocast(g: Game): void {
  if (g.world.tick % 5 !== 0) return
  for (const u of g.world.ents.values()) {
    if (!u.alive || !u.autocast.size || u.cast) continue
    if (u.order && u.order.k !== 'hold') continue
    for (const id of u.autocast) {
      const ab = abilityDef(id)
      if (!ab || canCast(g, u, ab, undefined, false)) continue
      const range = ab.range ?? 5
      let best: Ent | null = null
      let bestHp = 1
      for (const t of g.world.query(u.zone, u.x, u.y, range + 1)) {
        if (!t.alive || t.tags.has('structure') || t.tags.has('noTarget') || t.hp >= t.maxHp) continue
        if (canCast(g, u, ab, t, false)) continue
        const k = t.hp / t.maxHp
        if (k < bestHp && dist(u, t) <= range + t.radius + u.radius) {
          bestHp = k
          best = t
        }
      }
      if (best) {
        u.order = { k: 'cast', a: id, e: best.id }
        break
      }
    }
  }
}
