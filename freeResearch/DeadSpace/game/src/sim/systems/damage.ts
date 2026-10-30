// 傷害管線：無敵 → 閃避 → 護甲 → 受傷倍率 → 護盾吸收 → 扣血 → hooks → 死亡
import type { DamageKind } from '../../shared/content/types'
import { BUFFS } from '../../shared/content/registry'
import type { Ent } from '../ent'
import type { Game } from '../game'

export interface DmgOpts {
  kind?: DamageKind
  /** 持續傷害（不觸發閃避、不打斷施法）*/
  dot?: boolean
  /** 來源槽位（來源實體已消失時用）*/
  srcSlot?: number
  buff?: string
  /** 無視護甲 */
  pure?: boolean
  /** 站點毀滅等必殺：無視無敵 */
  lethal?: boolean
  /** 不觸發 EP／TK 等統計 */
  quiet?: boolean
  ability?: string
}

export type DamageHook = (g: Game, src: Ent | null, t: Ent, amount: number, o: DmgOpts) => void
export type DeathHook = (g: Game, u: Ent, killer: Ent | null, killerSlot: number) => void

export const DAMAGE_HOOKS: DamageHook[] = []
export const DEATH_HOOKS: DeathHook[] = []

/** WC3 護甲公式 */
export function armorFactor(armor: number): number {
  if (armor >= 0) return 1 - (0.06 * armor) / (1 + 0.06 * armor)
  return 2 - Math.pow(0.94, -armor)
}

export function damage(g: Game, src: Ent | null, t: Ent, amount: number, o: DmgOpts = {}): number {
  if (!t.alive || amount <= 0) return 0
  if (t.stats.invuln && !o.lethal) return 0
  if (t.tags.has('invuln') && !o.lethal) return 0
  if (!o.dot && t.stats.evade > 0 && g.world.rng.chance(t.stats.evade)) {
    g.emitFx({ k: 'miss', z: t.zone, x: t.x, y: t.y, e: t.id })
    return 0
  }
  let a = amount
  if (src && !o.dot) a *= src.stats.dmgMult
  if (!o.pure && !o.lethal) a *= armorFactor(t.stats.armor)
  a *= t.stats.dmgTaken
  if (o.kind === 'fire' && t.data.fireImmune) return 0
  if (o.kind === 'blast' && t.data.blastImmune) return 0
  // 護盾吸收
  if (!o.lethal) {
    for (const b of t.buffs) {
      if (!b.shield || b.shield <= 0) continue
      const take = Math.min(b.shield, a)
      b.shield -= take
      a -= take
      if (b.shield <= 0) b.until = g.time
      if (a <= 0) break
    }
  }
  if (a <= 0) return 0
  const before = t.hp
  t.hp -= a
  const applied = Math.min(before, a)
  const slot = src ? src.owner : (o.srcSlot ?? -1)
  if (src) t.lastHitBy = src.id
  if (slot !== undefined) t.lastHitSlot = slot
  t.lastHitTime = g.time
  t.lastDamageTime = g.time
  // 受傷打斷施法、解除會因受傷而失效的 buff
  if (!o.dot) {
    for (const b of [...t.buffs]) if (BUFFS.get(b.id)?.breakOnDamage) b.until = g.time
    if (t.cast && !t.cast.channeling && t.data.castBreakOnHit) t.cast = null
  }
  if (!o.quiet) for (const h of DAMAGE_HOOKS) h(g, src, t, applied, o)
  if (t.hp <= 0) {
    if (t.data.god && !o.lethal) {
      t.hp = 1
      return applied
    }
    g.killEnt(t, src, slot)
  }
  return applied
}

export function heal(g: Game, t: Ent, amount: number): number {
  if (!t.alive || amount <= 0 || t.data.noHeal) return 0
  const before = t.hp
  t.hp = Math.min(t.maxHp, t.hp + amount)
  void g
  return t.hp - before
}
