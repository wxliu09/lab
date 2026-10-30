// 仿生人機體技能腳本（內容在 src/shared/content/forms/android.ts）
import type { Effect } from '../../shared/content/types'
import { regScript, runEffects } from '../systems/effects'
import { damage } from '../systems/damage'

/** 稜鏡火箭：每隔 interval 秒朝目標點附近隨機落點發射一枚 */
regScript('chassis.prismRockets', (g, ctx, p) => {
  const c = ctx.caster
  const n = Number(p.n) || 15
  const spread = Number(p.spread) || 3
  const aoe = Number(p.aoe) || 1.4
  const dmgAmt = Number(p.dmg) || 60
  const step = Number(p.interval) || 0.08
  const onHit: Effect[] = [
    { k: 'damage', amount: [dmgAmt * 0.85, dmgAmt * 1.15], to: 'point', aoe, kind: 'blast', falloff: true },
    { k: 'script', fn: 'chassis.boom', p: { r: aoe } },
  ]
  const fire = () => {
    if (!c.alive || c.zone !== ctx.zone) return
    const a = g.world.rng.range(0, Math.PI * 2)
    const r = Math.sqrt(g.world.rng.next()) * spread
    runEffects(g, { caster: c, x: ctx.x + Math.cos(a) * r, y: ctx.y + Math.sin(a) * r, zone: ctx.zone, ability: ctx.ability }, [
      { k: 'projectile', speed: 20, fx: 'rocket', to: 'point', onHit },
    ])
  }
  fire()
  for (let i = 1; i < n; i++) g.after(i * step, fire)
})

regScript('chassis.boom', (g, ctx, p) => {
  g.emitFx({ k: 'boom', z: ctx.zone, x: ctx.x, y: ctx.y, v: Number(p.r) || 1 })
})

/** 戰術核爆：以機體當下位置為中心，距離衰減；門也會被炸壞 */
regScript('chassis.nukeBlast', (g, ctx, p) => {
  const c = ctx.caster
  const x = c.alive && c.zone === ctx.zone ? c.x : ctx.x
  const y = c.alive && c.zone === ctx.zone ? c.y : ctx.y
  const r = Number(p.r) || 7
  const dmgAmt = Number(p.dmg) || 1200
  for (const t of g.world.query(ctx.zone, x, y, r)) {
    if (t === c || !t.alive || t.tags.has('noTarget') || t.tags.has('corpse')) continue
    let a = dmgAmt * Math.max(0.25, 1 - Math.hypot(t.x - x, t.y - y) / r)
    if (t.tags.has('structure')) a *= 0.5
    damage(g, c, t, a, { kind: 'blast', ability: 'ab.chassis.nuke' })
  }
  g.damageDoorsNear(ctx.zone, x, y, r * 0.6, Number(p.door) || 2500)
  g.emitFx({ k: 'fusion', z: ctx.zone, x, y, v: r })
})

/** 迴旋閃避落地：震傷落點周圍 */
regScript('chassis.rotaryLand', (g, ctx, p) => {
  const c = ctx.caster
  if (!c.alive) return
  const r = Number(p.r) || 2.5
  for (const t of g.world.query(c.zone, c.x, c.y, r)) {
    if (t === c || !t.alive || t.tags.has('noTarget') || t.tags.has('corpse') || t.tags.has('structure')) continue
    damage(g, c, t, Number(p.dmg) || 60, { ability: 'ab.chassis.rotaryDodge' })
  }
  g.emitFx({ k: 'boom', z: c.zone, x: c.x, y: c.y, v: r * 0.6 })
})

/** 把命中的單位往遠離施放者的方向擊飛 */
regScript('chassis.knockAway', (_g, ctx, p) => {
  const c = ctx.caster
  const t = ctx.target
  if (!t || !t.alive || t.def.speed <= 0 || t.tags.has('structure')) return
  const dx = t.x - c.x
  const dy = t.y - c.y
  const d = Math.hypot(dx, dy) || 1
  const v = (Number(p.dist) || 3) * 5
  t.vx += (dx / d) * v
  t.vy += (dy / d) * v
  t.data.vDecay = 5
})
