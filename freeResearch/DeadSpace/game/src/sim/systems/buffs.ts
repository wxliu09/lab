// Buff：套用、刷新、移除、屬性重算、DoT／HoT 與週期效果
import { TICK_DT } from '../../shared/constants'
import { BUFFS, abilityDef, itemDef } from '../../shared/content/registry'
import type { BuffDef } from '../../shared/content/types'
import { baseStats, type BuffInst, type Ent } from '../ent'
import type { Game } from '../game'
import { damage, heal } from './damage'
import { runEffects } from './effects'

export function hasBuff(u: Ent, id: string): boolean {
  return u.buffs.some((b) => b.id === id)
}

export function getBuff(u: Ent, id: string): BuffInst | undefined {
  return u.buffs.find((b) => b.id === id)
}

export function applyBuff(g: Game, u: Ent, id: string, dur?: number, src?: Ent | null, data?: Record<string, unknown>): BuffInst | null {
  const def = BUFFS.get(id)
  if (!def || !u.alive) return null
  if (def.infection && (u.stats.immuneInfection || u.tags.has('chassis'))) return null
  const d = dur ?? def.dur ?? 9999999
  const until = d >= 9999999 ? Infinity : g.time + d
  let b = u.buffs.find((x) => x.id === id)
  if (b) {
    b.until = Math.max(b.until, until)
    if (def.stacks && b.stacks < def.stacks) b.stacks++
    if (def.shield) b.shield = def.shield
    if (src) {
      b.src = src.id
      b.srcSlot = src.owner
    }
    if (data) b.data = { ...b.data, ...data }
  } else {
    b = {
      id,
      until,
      src: src?.id ?? 0,
      srcSlot: src?.owner ?? -1,
      stacks: 1,
      nextTick: g.time + (def.every ?? 1),
      shield: def.shield,
      data,
    }
    u.buffs.push(b)
  }
  u.statsDirty = true
  return b
}

export function removeBuff(g: Game, u: Ent, id: string, expired = false): void {
  const i = u.buffs.findIndex((b) => b.id === id)
  if (i < 0) return
  const b = u.buffs[i]
  u.buffs.splice(i, 1)
  u.statsDirty = true
  const def = BUFFS.get(id)
  if (expired && def?.onExpire) {
    const src = g.world.get(b.src) ?? u
    runEffects(g, { caster: src, target: u, x: u.x, y: u.y, zone: u.zone }, def.onExpire)
  }
}

export function removeBuffsWhere(g: Game, u: Ent, pred: (d: BuffDef, b: BuffInst) => boolean): void {
  for (const b of [...u.buffs]) {
    const d = BUFFS.get(b.id)
    if (d && pred(d, b)) removeBuff(g, u, b.id)
  }
}

/** 重新計算屬性：def 基礎值 ＋ buff ＋ 攜帶道具的被動 ＋ 被動技能 */
export function recomputeStats(u: Ent): void {
  const s = baseStats(u.def)
  let moveMult = 1
  let moveAdd = 0
  const apply = (d: BuffDef, stacks = 1) => {
    if (d.move !== undefined) moveMult *= Math.pow(d.move, stacks)
    if (d.moveAdd) moveAdd += d.moveAdd * stacks
    if (d.atkSpeed) s.atkSpeed *= Math.pow(d.atkSpeed, stacks)
    if (d.dmgMult) s.dmgMult *= Math.pow(d.dmgMult, stacks)
    if (d.dmgTaken !== undefined) s.dmgTaken *= Math.pow(d.dmgTaken, stacks)
    if (d.armor) s.armor += d.armor * stacks
    if (d.regen) s.regen += d.regen * stacks
    if (d.mpRegen) s.mpRegen += d.mpRegen * stacks
    if (d.sightMult) s.sight *= d.sightMult
    if (d.sightAdd) s.sight += d.sightAdd * stacks
    if (d.rangeAdd) s.range += d.rangeAdd * stacks
    if (d.evade) s.evade = 1 - (1 - s.evade) * (1 - d.evade)
    if (d.stun) s.stunned = true
    if (d.silence) s.silenced = true
    if (d.disarm) s.disarmed = true
    if (d.invuln) s.invuln = true
    if (d.stealth) s.stealth = true
    if (d.rooted) s.rooted = true
    if (d.immuneInfection) s.immuneInfection = true
  }
  for (const b of u.buffs) {
    const d = BUFFS.get(b.id)
    if (d) apply(d, b.stacks)
  }
  // 攜帶道具的被動
  if (u.inv) {
    for (const it of u.inv) {
      if (!it) continue
      const pid = itemDef(it.id)?.passive
      const d = pid ? BUFFS.get(pid) : undefined
      if (d) apply(d)
    }
  }
  // 被動技能
  for (const a of u.abilities) {
    const pb = abilityDef(a)?.passiveBuff
    const d = pb ? BUFFS.get(pb) : undefined
    if (d) apply(d)
  }
  if (u.data.passives) for (const pid of u.data.passives as string[]) {
    const d = BUFFS.get(pid)
    if (d) apply(d)
  }
  s.speed = Math.max(0, (s.speed + moveAdd) * moveMult)
  if (u.data.speedMult) s.speed *= u.data.speedMult as number
  if (u.data.god) s.invuln = true
  u.stats = s
  u.statsDirty = false
}

export function stepBuffs(g: Game): void {
  const t = g.time
  const dt = TICK_DT
  for (const u of g.world.ents.values()) {
    if (!u.alive) continue
    if (u.statsDirty) recomputeStats(u)
    // 回血／回能
    if (u.stats.regen && u.hp < u.maxHp && !u.data.noRegen) u.hp = Math.min(u.maxHp, u.hp + u.stats.regen * dt)
    if (u.maxMp > 0 && u.mp < u.maxMp) u.mp = Math.min(u.maxMp, u.mp + u.stats.mpRegen * dt)
    if (!u.buffs.length) continue
    for (const b of [...u.buffs]) {
      if (b.until <= t) {
        removeBuff(g, u, b.id, true)
        continue
      }
      const d = BUFFS.get(b.id)
      if (!d) continue
      const src = b.src ? (g.world.get(b.src) ?? null) : null
      if (d.dot) damage(g, src, u, d.dot * dt * b.stacks, { kind: d.dotKind ?? 'poison', dot: true, srcSlot: b.srcSlot, buff: b.id })
      if (!u.alive) break
      if (d.hot) heal(g, u, d.hot * dt * b.stacks)
      if (d.manaBurn) u.mp = Math.max(0, u.mp - d.manaBurn * dt)
      if (d.every && d.tickEffects && t >= b.nextTick) {
        b.nextTick = t + d.every
        runEffects(g, { caster: src ?? u, target: u, x: u.x, y: u.y, zone: u.zone, buff: b }, d.tickEffects)
      }
    }
  }
}
