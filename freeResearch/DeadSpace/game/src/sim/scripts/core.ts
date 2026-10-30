// 核心腳本：普攻投射物命中等
import { regScript } from '../systems/effects'
import { damage } from '../systems/damage'
import type { DamageKind } from '../../shared/content/types'

regScript('_attackHit', (g, ctx, p) => {
  const dmg = Number(p.dmg) || 0
  const aoe = Number(p.aoe) || 0
  const kind = (p.kind as DamageKind) || 'normal'
  if (aoe > 0) {
    for (const o of g.world.query(ctx.zone, ctx.x, ctx.y, aoe)) {
      if (o === ctx.caster || !o.alive || o.tags.has('noTarget') || o.tags.has('corpse')) continue
      damage(g, ctx.caster, o, o === ctx.target ? dmg : dmg * 0.6, { kind })
    }
    g.emitFx({ k: 'boom', z: ctx.zone, x: ctx.x, y: ctx.y, v: aoe })
  } else if (ctx.target) damage(g, ctx.caster, ctx.target, dmg, { kind })
})
