// 飛行物：sim 端追蹤命中；client 只收到一則 'proj' 特效自行動畫
import type { AbilityDef, Effect } from '../../shared/content/types'
import { TICK_DT } from '../../shared/constants'
import type { Ent } from '../ent'
import type { Game } from '../game'
import { runEffects } from './effects'

export interface Projectile {
  caster: Ent
  casterId: number
  zone: number
  x: number
  y: number
  tx: number
  ty: number
  target?: Ent
  speed: number
  fx: string
  onHit: readonly Effect[]
  pierce?: boolean
  range?: number
  traveled: number
  hit: Set<number>
  ability?: AbilityDef
}

export function spawnProjectile(
  g: Game,
  p: Omit<Projectile, 'traveled' | 'hit' | 'casterId'> & { traveled?: number },
): void {
  const pr: Projectile = { ...p, casterId: p.caster.id, traveled: 0, hit: new Set() }
  if (pr.pierce && pr.range) {
    // 穿透：沿方向飛到最大射程
    const d = Math.hypot(pr.tx - pr.x, pr.ty - pr.y) || 1
    pr.tx = pr.x + ((pr.tx - pr.x) / d) * pr.range
    pr.ty = pr.y + ((pr.ty - pr.y) / d) * pr.range
    pr.target = undefined
  }
  g.projectiles.push(pr)
  g.emitFx({ k: 'proj', z: pr.zone, x: pr.x, y: pr.y, x2: pr.tx, y2: pr.ty, e: pr.casterId, e2: pr.target?.id, v: pr.speed, s: pr.fx })
}

export function stepProjectiles(g: Game): void {
  const dt = TICK_DT
  const out: Projectile[] = []
  for (const pr of g.projectiles) {
    if (pr.target) {
      if (!pr.target.alive || pr.target.zone !== pr.zone) pr.target = undefined
      else {
        pr.tx = pr.target.x
        pr.ty = pr.target.y
      }
    }
    const dx = pr.tx - pr.x
    const dy = pr.ty - pr.y
    const d = Math.hypot(dx, dy)
    const step = pr.speed * dt
    const z = g.world.zones[pr.zone]
    if (pr.pierce) {
      const nx = pr.x + (dx / (d || 1)) * Math.min(step, d)
      const ny = pr.y + (dy / (d || 1)) * Math.min(step, d)
      for (const t of g.world.query(pr.zone, nx, ny, 0.6)) {
        if (t === pr.caster || !t.alive || pr.hit.has(t.id) || t.tags.has('noTarget') || t.tags.has('corpse')) continue
        pr.hit.add(t.id)
        runEffects(g, { caster: pr.caster, target: t, x: t.x, y: t.y, zone: pr.zone, ability: pr.ability }, pr.onHit)
      }
      pr.x = nx
      pr.y = ny
      if (d <= step || (z.nav && z.nav.blockedAt(nx, ny) && z.nav.opaque[z.nav.idx(nx, ny)])) continue
      out.push(pr)
      continue
    }
    if (d <= step + (pr.target?.radius ?? 0)) {
      runEffects(g, { caster: pr.caster, target: pr.target, x: pr.tx, y: pr.ty, zone: pr.zone, ability: pr.ability }, pr.onHit)
      continue
    }
    pr.x += (dx / d) * step
    pr.y += (dy / d) * step
    // 撞牆
    if (z.nav) {
      const i = z.nav.idx(pr.x, pr.y)
      if (i >= 0 && z.nav.opaque[i]) {
        runEffects(g, { caster: pr.caster, x: pr.x, y: pr.y, zone: pr.zone, ability: pr.ability }, pr.onHit.filter((e) => e.k !== 'damage' || !!e.aoe))
        continue
      }
    }
    out.push(pr)
  }
  g.projectiles = out
}
