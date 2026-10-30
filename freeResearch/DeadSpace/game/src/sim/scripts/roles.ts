// 身分機制腳本：異形變身、下蛋；變種人吞食、啃食；感染統計
import { regScript } from '../systems/effects'
import { FORMS, unitDef } from '../../shared/content/registry'
import { replaceMain } from '../systems/roleSystem'
import { applyBuff } from '../systems/buffs'

/** 人形 → 異形形態（主腦匿名、spawn 不匿名）*/
regScript('xeno.toForm', (g, ctx) => {
  const u = ctx.caster
  const p = g.players[u.owner]
  if (!p || p.main !== u.id) return
  if (u.suit) {
    g.privateLine(p.slot, 'role.removeSuitFirst')
    return
  }
  if (!u.tags.has('personnel')) return
  const isMaster = p.role === 'xeno' && !p.spawnOf
  let def: string
  if (isMaster) def = FORMS.get(p.form || 'xeno.protoform')?.unit ?? 'xeno.protoform'
  else {
    const m = g.allPlayers().find((q) => q.role === 'xeno' && !q.spawnOf)
    def = FORMS.get(m?.form || 'xeno.protoform')?.spawnUnit ?? 'xeno.protoform.spawn'
  }
  try {
    unitDef(def)
  } catch {
    return
  }
  p.data.humanDef = u.def.id
  const nu = replaceMain(g, p, u, def, { anon: isMaster, keepHpPct: true })
  g.emitFx({ k: 'xenoShift', z: nu.zone, x: nu.x, y: nu.y, e: nu.id })
})

/** 異形形態 → 人形 */
regScript('xeno.toHuman', (g, ctx) => {
  const u = ctx.caster
  const p = g.players[u.owner]
  if (!p || p.main !== u.id) return
  const isMaster = p.role === 'xeno' && !p.spawnOf
  const nu = replaceMain(g, p, u, 'personnel', { anon: false, keepHpPct: true })
  nu.data.extraAbilities = [...((nu.data.extraAbilities as string[]) ?? []).filter((a) => a !== 'xeno.form' && a !== 'xeno.spawnForm'), isMaster ? 'xeno.form' : 'xeno.spawnForm']
  nu.abilities = [...nu.def.abilities, ...(nu.data.extraAbilities as string[])]
  nu.classId = p.classId
  g.emitFx({ k: 'xenoShift', z: nu.zone, x: nu.x, y: nu.y, e: nu.id })
})

/** 下蛋（最多 3 顆，屬於異形主腦、匿名）*/
regScript('xeno.egg', (g, ctx) => {
  const u = ctx.caster
  const p = g.players[u.owner]
  if (!p) return
  let n = 0
  for (const e of g.world.ents.values()) if (e.tags.has('egg') && e.owner === p.slot && e.alive) n++
  if (n >= 3) {
    g.privateLine(p.slot, 'role.eggMax')
    return
  }
  const z = g.world.zones[ctx.zone]
  const pt = z.nav?.nearestOpen(ctx.x, ctx.y) ?? { x: ctx.x, y: ctx.y }
  const egg = g.world.spawn(unitDef('xeno.eggUnit'), ctx.zone, pt.x, pt.y, p.slot)
  egg.anon = true
  egg.acquire = false
  g.emitFx({ k: 'egg', z: ctx.zone, x: pt.x, y: pt.y, e: egg.id })
})

/** 吞食生物 */
regScript('mut.devour', (g, ctx) => {
  const t = ctx.target
  const u = ctx.caster
  if (!t || !t.alive) return
  const ep = t.def.devourEp
  if (!ep) {
    if (u.owner >= 0) g.privateLine(u.owner, 'role.cantDevour')
    u.cds.delete('devour')
    return
  }
  t.data.noDrops = true
  t.data.converted = true
  g.killEnt(t, u)
  const m = g.allPlayers().find((q) => q.role === 'mutant' && !q.spawnOf)
  if (m) g.addEp(m.slot, ep)
  g.emitFx({ k: 'devour', z: ctx.zone, x: t.x, y: t.y, e: u.id })
})

/** 啃食附近屍體（仿生人除外）*/
regScript('mut.cannibalize', (g, ctx) => {
  const u = ctx.caster
  let n = 0
  for (const c of g.world.query(u.zone, u.x, u.y, 1.6)) {
    if (!c.tags.has('corpse') || c.data.android || !c.data.wasMain) continue
    g.world.remove(c)
    n++
  }
  const m = g.allPlayers().find((q) => q.role === 'mutant' && !q.spawnOf)
  if (n && m) g.addEp(m.slot, 140 * n)
  if (!n && u.owner >= 0) {
    g.privateLine(u.owner, 'role.noCorpse')
    u.cds.delete('devour')
  } else g.emitFx({ k: 'devour', z: u.zone, x: u.x, y: u.y, e: u.id })
  void applyBuff
})

/** 感染統計（結算用）*/
regScript('roles.infected', (g, ctx) => {
  const p = g.players[ctx.caster.owner]
  if (p && ctx.target?.isMain) p.stats.infections++
})
