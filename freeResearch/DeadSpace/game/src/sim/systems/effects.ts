// 效果原語執行器：所有技能、道具、buff 的效果都由這些原語組合（architecture §4.3）
import type { AbilityDef, Effect, TargetFilter } from '../../shared/content/types'
import { UNITS, unitDef } from '../../shared/content/registry'
import type { BuffInst, Ent } from '../ent'
import { HOSTILE } from '../ent'
import type { Game } from '../game'
import { damage, heal } from './damage'
import { applyBuff, removeBuffsWhere } from './buffs'
import { spawnProjectile } from './projectiles'
import { moveBy } from './movement'
import { SPACE_ZONE } from '../world'

export interface EffectCtx {
  caster: Ent
  target?: Ent
  x: number
  y: number
  zone: number
  ability?: AbilityDef
  buff?: BuffInst
  itemSlot?: number
  /** 投射物命中點等額外資料 */
  extra?: Record<string, unknown>
}

export type ScriptFn = (g: Game, ctx: EffectCtx, p: Record<string, number | string | boolean>) => void
export const SCRIPTS = new Map<string, ScriptFn>()
export function regScript(name: string, fn: ScriptFn): void {
  if (SCRIPTS.has(name)) throw new Error('重複的 script ' + name)
  SCRIPTS.set(name, fn)
}

function rollAmount(g: Game, a: number | [number, number]): number {
  return typeof a === 'number' ? a : g.world.rng.range(a[0], a[1])
}

/** 目標篩選（技能目標、AoE 範圍內的單位）*/
export function passesFilter(g: Game, caster: Ent, t: Ent, f?: TargetFilter): boolean {
  if (!t.alive && !(f?.corpse && t.tags.has('corpse'))) return false
  if (t.tags.has('noTarget')) return false
  if (!f) return !t.tags.has('corpse')
  if (t === caster && !f.self) return false
  if (f.organic && !t.tags.has('organic')) return false
  if (f.nonOrganic && t.tags.has('organic')) return false
  if (f.structure && !t.tags.has('structure')) return false
  if (f.noStructure && t.tags.has('structure')) return false
  if (f.corpse && !t.tags.has('corpse')) return false
  if (!f.corpse && t.tags.has('corpse')) return false
  if (f.rubble && !t.tags.has('rubble')) return false
  if (f.mainUnit && !t.isMain) return false
  if (f.ship && !t.tags.has('ship')) return false
  if (f.station && !t.tags.has('station')) return false
  if (f.tag && !t.tags.has(f.tag)) return false
  if (f.defs && !f.defs.includes(t.def.id)) return false
  if (f.notFaction && t.owner >= 0) {
    const o = g.players[t.owner]
    if (o && g.faction(o) === f.notFaction) return false
  }
  return true
}

function aoeTargets(g: Game, ctx: EffectCtx, x: number, y: number, r: number, opts: { friendly?: boolean; noSelf?: boolean; filter?: TargetFilter; structures?: boolean }): Ent[] {
  const out: Ent[] = []
  for (const e of g.world.query(ctx.zone, x, y, r)) {
    if (!e.alive || e.tags.has('noTarget') || e.tags.has('corpse')) continue
    if (opts.noSelf && e === ctx.caster) continue
    if (opts.filter && !passesFilter(g, ctx.caster, e, opts.filter)) continue
    if (e.zone === SPACE_ZONE && !e.tags.has('space')) continue
    out.push(e)
  }
  return out
}

function pointOf(ctx: EffectCtx, to: 'target' | 'self' | 'point'): { x: number; y: number } {
  if (to === 'self') return { x: ctx.caster.x, y: ctx.caster.y }
  if (to === 'target' && ctx.target) return { x: ctx.target.x, y: ctx.target.y }
  return { x: ctx.x, y: ctx.y }
}

export function runEffects(g: Game, ctx: EffectCtx, effects: readonly Effect[]): void {
  for (const ef of effects) {
    try {
      runEffect(g, ctx, ef)
    } catch (e) {
      if (__DEV__) console.error('[effect]', ef.k, e)
    }
  }
}

function runEffect(g: Game, ctx: EffectCtx, ef: Effect): void {
  const { caster } = ctx
  switch (ef.k) {
    case 'damage': {
      const amt = rollAmount(g, ef.amount)
      if (ef.aoe) {
        const p = pointOf(ctx, ef.to)
        for (const t of aoeTargets(g, ctx, p.x, p.y, ef.aoe, { noSelf: ef.noSelf ?? true })) {
          let a = amt
          if (ef.falloff) a *= Math.max(0.25, 1 - Math.hypot(t.x - p.x, t.y - p.y) / ef.aoe)
          if (t.tags.has('structure') && ef.vsStructure !== undefined) a *= ef.vsStructure
          damage(g, caster, t, a, { kind: ef.kind, ability: ctx.ability?.id })
        }
      } else {
        const t = ef.to === 'self' ? caster : ctx.target
        if (t) damage(g, caster, t, amt, { kind: ef.kind, ability: ctx.ability?.id })
      }
      break
    }
    case 'projectile': {
      const n = ef.count ?? 1
      for (let i = 0; i < n; i++) {
        let tx = ctx.x
        let ty = ctx.y
        if (ef.to === 'target' && ctx.target) {
          tx = ctx.target.x
          ty = ctx.target.y
        }
        if (ef.spread && n > 1) {
          const base = Math.atan2(ty - caster.y, tx - caster.x)
          const a = base + (i / (n - 1) - 0.5) * ef.spread
          const d = Math.hypot(tx - caster.x, ty - caster.y)
          tx = caster.x + Math.cos(a) * d
          ty = caster.y + Math.sin(a) * d
        }
        spawnProjectile(g, {
          caster,
          zone: ctx.zone,
          x: caster.x,
          y: caster.y,
          tx,
          ty,
          target: ef.to === 'target' && ef.homing !== false ? ctx.target : undefined,
          speed: ef.speed,
          fx: ef.fx,
          onHit: ef.onHit,
          pierce: ef.pierce,
          range: ef.range,
          ability: ctx.ability,
        })
      }
      break
    }
    case 'buff': {
      if (ef.aoe) {
        const p = pointOf(ctx, ef.to)
        for (const t of aoeTargets(g, ctx, p.x, p.y, ef.aoe, { noSelf: ef.noSelf, filter: ef.filter })) applyBuff(g, t, ef.buff, ef.dur, caster)
      } else {
        const t = ef.to === 'self' ? caster : ctx.target
        if (t && (!ef.filter || passesFilter(g, caster, t, ef.filter))) applyBuff(g, t, ef.buff, ef.dur, caster)
      }
      break
    }
    case 'cleanse': {
      const t = ef.to === 'self' ? caster : ctx.target
      if (t) removeBuffsWhere(g, t, (d) => (ef.tags ? ef.tags.some((tag) => d.flags?.[tag] || d.infection === tag) : !d.good))
      break
    }
    case 'heal': {
      const doHeal = (t: Ent) => heal(g, t, ef.pct ? t.maxHp * ef.amount : ef.amount)
      if (ef.aoe) {
        const p = pointOf(ctx, ef.to)
        for (const t of aoeTargets(g, ctx, p.x, p.y, ef.aoe, { noSelf: false })) if (!t.tags.has('structure')) doHeal(t)
      } else {
        const t = ef.to === 'self' ? caster : ctx.target
        if (t) doHeal(t)
      }
      g.emitFx({ k: 'heal', z: ctx.zone, x: (ef.to === 'self' ? caster : ctx.target ?? caster).x, y: (ef.to === 'self' ? caster : ctx.target ?? caster).y, e: (ef.to === 'self' ? caster : ctx.target)?.id })
      break
    }
    case 'mana': {
      const doMana = (t: Ent) => {
        const v = ef.pct ? t.maxMp * ef.amount : ef.amount
        t.mp = Math.max(0, Math.min(t.maxMp, t.mp + v))
      }
      if (ef.aoe) {
        const p = pointOf(ctx, ef.to)
        for (const t of aoeTargets(g, ctx, p.x, p.y, ef.aoe, { noSelf: false })) doMana(t)
      } else {
        const t = ef.to === 'self' ? caster : ctx.target
        if (t) doMana(t)
      }
      break
    }
    case 'summon': {
      const def = UNITS.get(ef.unit)
      if (!def) break
      const at = ef.at === 'self' ? { x: caster.x, y: caster.y } : ef.at === 'target' && ctx.target ? { x: ctx.target.x, y: ctx.target.y } : { x: ctx.x, y: ctx.y }
      for (let i = 0; i < ef.count; i++) {
        const a = g.world.rng.range(0, Math.PI * 2)
        const r = ef.spread ?? (ef.count > 1 ? 1 : 0)
        let px = at.x + Math.cos(a) * r
        let py = at.y + Math.sin(a) * r
        const z = g.world.zones[ctx.zone]
        if (z.nav) {
          const n = z.nav.nearestOpen(px, py)
          if (n) {
            px = n.x
            py = n.y
          }
        }
        const s = g.world.spawn(def, ctx.zone, px, py, ef.owner === 'hostile' ? HOSTILE : caster.owner)
        s.master = caster.id
        s.anon = caster.anon
        s.acquire = true
        if (ef.life) s.lifeEnd = g.time + ef.life
        s.facing = caster.facing
        g.emitFx({ k: 'summon', z: ctx.zone, x: px, y: py, e: s.id, s: def.id })
      }
      break
    }
    case 'dash': {
      const p = ef.to === 'target' && ctx.target ? { x: ctx.target.x, y: ctx.target.y } : { x: ctx.x, y: ctx.y }
      const d = Math.hypot(p.x - caster.x, p.y - caster.y)
      const k = d > ef.maxDist ? ef.maxDist / d : 1
      caster.data.dash = {
        tx: caster.x + (p.x - caster.x) * k,
        ty: caster.y + (p.y - caster.y) * k,
        speed: ef.speed,
        onArrive: ef.onArrive,
        hitAlong: ef.hitAlong,
        hit: [] as number[],
        target: ctx.target?.id,
        until: g.time + (d * k) / ef.speed + 0.5,
      }
      caster.order = null
      caster.path = null
      g.emitFx({ k: 'dash', z: ctx.zone, x: caster.x, y: caster.y, x2: p.x, y2: p.y, e: caster.id })
      break
    }
    case 'blink': {
      let p = ef.to === 'target' && ctx.target ? { x: ctx.target.x, y: ctx.target.y } : { x: ctx.x, y: ctx.y }
      if (ef.behind && ctx.target) p = { x: ctx.target.x - Math.cos(ctx.target.facing) * 1.2, y: ctx.target.y - Math.sin(ctx.target.facing) * 1.2 }
      if (ef.maxDist) {
        const d = Math.hypot(p.x - caster.x, p.y - caster.y)
        if (d > ef.maxDist) p = { x: caster.x + ((p.x - caster.x) * ef.maxDist) / d, y: caster.y + ((p.y - caster.y) * ef.maxDist) / d }
      }
      const z = g.world.zones[ctx.zone]
      const n = z.nav ? z.nav.nearestOpen(p.x, p.y) : p
      if (!n) break
      g.emitFx({ k: 'blink', z: ctx.zone, x: caster.x, y: caster.y, x2: n.x, y2: n.y, e: caster.id })
      g.world.relocate(caster, ctx.zone, n.x, n.y)
      caster.order = null
      break
    }
    case 'knockback':
    case 'pull': {
      const o = ef.k === 'knockback' ? (ef.from === 'self' ? { x: caster.x, y: caster.y } : { x: ctx.x, y: ctx.y }) : ef.to === 'self' ? { x: caster.x, y: caster.y } : { x: ctx.x, y: ctx.y }
      for (const t of aoeTargets(g, ctx, o.x, o.y, ef.aoe, { noSelf: true })) {
        if (t.tags.has('structure') || t.def.speed <= 0) continue
        const dx = t.x - o.x
        const dy = t.y - o.y
        const d = Math.hypot(dx, dy) || 1
        const sgn = ef.k === 'knockback' ? 1 : -1
        const v = ef.dist * 5
        t.vx += (dx / d) * v * sgn
        t.vy += (dy / d) * v * sgn
        t.data.vDecay = 5
      }
      break
    }
    case 'zoneObj': {
      const def = UNITS.get(ef.obj)
      if (!def) break
      const p = ef.at === 'self' ? { x: caster.x, y: caster.y } : ef.at === 'target' && ctx.target ? { x: ctx.target.x, y: ctx.target.y } : { x: ctx.x, y: ctx.y }
      const o = g.world.spawn(def, ctx.zone, p.x, p.y, caster.owner)
      o.master = caster.id
      o.anon = caster.anon
      o.lifeEnd = g.time + ef.life
      o.data.zoneObj = true
      break
    }
    case 'delay': {
      const snap: EffectCtx = { ...ctx }
      if (ef.at === 'self') {
        snap.x = caster.x
        snap.y = caster.y
      }
      g.after(ef.t, () => {
        if (!snap.caster.removed || ef.then.some((e) => e.k === 'damage' || e.k === 'fx' || e.k === 'rubble')) runEffects(g, snap, ef.then)
      })
      break
    }
    case 'fx': {
      const t = ef.at === 'target' ? ctx.target : ef.at === 'self' ? caster : undefined
      g.emitFx({ k: ef.fx, z: ctx.zone, x: t?.x ?? ctx.x, y: t?.y ?? ctx.y, x2: ef.at === 'line' ? ctx.x : undefined, y2: ef.at === 'line' ? ctx.y : undefined, e: t?.id ?? (ef.at === 'line' ? caster.id : undefined) })
      break
    }
    case 'rubble': {
      const p = ef.at === 'self' ? { x: caster.x, y: caster.y } : { x: ctx.x, y: ctx.y }
      g.spawnRubble(ctx.zone, p.x, p.y, ef.count, ef.radius)
      break
    }
    case 'clearRubble': {
      for (const t of g.world.query(ctx.zone, ctx.x, ctx.y, ef.radius)) {
        if (t.tags.has('rubble') || (ef.dmg >= 700 && t.data.door)) damage(g, caster, t, ef.dmg, { pure: true })
      }
      g.damageDoorsNear(ctx.zone, ctx.x, ctx.y, ef.radius, ef.dmg)
      break
    }
    case 'reveal': {
      const p = pointOf(ctx, ef.at === 'point' ? 'point' : ef.at)
      const owner = g.players[caster.owner]
      if (owner) owner.view.extraSources.push({ zone: ctx.zone, x: p.x, y: p.y, r: ef.radius, until: g.time + ef.dur })
      break
    }
    case 'script': {
      const fn = SCRIPTS.get(ef.fn)
      if (fn) fn(g, ctx, ef.p ?? {})
      else if (__DEV__) console.warn('未實作的 script', ef.fn)
      break
    }
  }
}

/** 衝刺：每 tick 推進，沿途命中與抵達效果 */
export function stepDashes(g: Game, dt: number): void {
  for (const u of g.world.ents.values()) {
    const d = u.data.dash as
      | { tx: number; ty: number; speed: number; onArrive?: Effect[]; hitAlong?: Effect[]; hit: number[]; target?: number; until: number }
      | undefined
    if (!d || !u.alive) continue
    const dx = d.tx - u.x
    const dy = d.ty - u.y
    const len = Math.hypot(dx, dy)
    const step = d.speed * dt
    if (len <= step || g.time > d.until) {
      moveBy(g, u, dx, dy)
      u.data.dash = undefined
      if (d.onArrive) runEffects(g, { caster: u, target: d.target ? g.world.get(d.target) : undefined, x: u.x, y: u.y, zone: u.zone }, d.onArrive)
      continue
    }
    const bx = u.x
    const by = u.y
    moveBy(g, u, (dx / len) * step, (dy / len) * step)
    u.facing = Math.atan2(dy, dx)
    if (Math.hypot(u.x - bx, u.y - by) < step * 0.2) {
      // 撞牆停下
      u.data.dash = undefined
      if (d.onArrive) runEffects(g, { caster: u, x: u.x, y: u.y, zone: u.zone }, d.onArrive)
      continue
    }
    if (d.hitAlong) {
      for (const t of g.world.query(u.zone, u.x, u.y, u.radius + 0.6)) {
        if (t === u || !t.alive || t.tags.has('noTarget') || t.tags.has('structure') || d.hit.includes(t.id)) continue
        d.hit.push(t.id)
        runEffects(g, { caster: u, target: t, x: t.x, y: t.y, zone: u.zone }, d.hitAlong)
      }
    }
  }
}

export function unitDefOr(id: string) {
  return UNITS.get(id) ?? unitDef('personnel')
}
