// 只給本人的私有狀態（身分、EP、背包、技能冷卻、驗血報告…）
import type { AbilityState, InvSlot, PrivateState } from '../../shared/protocol/messages'
import { abilityDef } from '../../shared/content/registry'
import type { Game, GamePlayer } from '../game'
import type { Ent } from '../ent'

export function privateState(g: Game, p: GamePlayer): PrivateState {
  const main = g.mainOf(p)
  const ctl = g.controlOf(p)
  const t = g.time
  const inv: (InvSlot | null)[] = (main?.inv ?? []).map((it) =>
    it ? { item: it.id, charges: it.charges, cd: Math.max(0, Math.round((it.cdUntil - t) * 10) / 10) } : null,
  )
  const abilities: AbilityState[] = []
  if (ctl) {
    for (const id of ctl.abilities) {
      const ab = abilityDef(id)
      if (!ab) continue
      const key = ab.sharedCd ?? id
      const ready = ctl.cds.get(key) ?? 0
      abilities.push({
        id,
        cd: Math.max(0, Math.round((ready - t) * 10) / 10),
        maxCd: ab.cd,
        mana: ab.mana,
        auto: ctl.autocast.has(id) || undefined,
        disabled: (ctl.stats.silenced && ab.target !== 'passive') || undefined,
      })
    }
  }
  const f = g.faction(p)
  const mates =
    f === 'crew' || !p.alive
      ? []
      : g.allPlayers().filter((q) => q.slot !== p.slot && g.faction(q) === f).map((q) => q.slot)
  const cast = ctl?.cast
  return {
    slot: p.slot,
    alive: p.alive,
    dead: !p.alive && !p.spectator,
    role: p.spectator ? 'spectator' : p.role,
    faction: p.spectator ? 'none' : f,
    spawn: !!p.spawnOf,
    classId: p.classId,
    ep: Math.floor(p.ep),
    epNext: g.epNext(p),
    tier: p.tier,
    canEvolve: g.evolveOptions(p),
    evolving: p.evolvingUntil > t ? Math.ceil(p.evolvingUntil - t) : 0,
    unit: p.main,
    control: ctl?.id ?? 0,
    zone: ctl?.zone ?? p.specZone,
    inv,
    abilities,
    mates,
    master: -1,
    notes: [...p.notes.values()],
    bio: p.bio,
    gitReports: p.gitReports,
    cast: cast ? [cast.ability, Math.min(1, (t - cast.start) / Math.max(0.01, cast.end - cast.start))] : null,
    muted: p.mutedUntil > t,
    groups: [],
    hint: p.hint,
    specZone: p.specZone,
    feeds: feedsOf(g, p),
    doorLog: doorLogOf(g, ctl),
    enh: !!p.data.enhOffer,
  }
}

function feedsOf(g: Game, p: GamePlayer): [number, number, number, number][] {
  const out: [number, number, number, number][] = []
  if (!p.alive) return out
  for (const e of g.world.ents.values()) {
    if (e.owner !== p.slot || !e.alive || !e.tags.has('device')) continue
    if (!e.def.id.includes('camera')) continue
    out.push([e.id, e.zone, Math.round(e.x * 10), Math.round(e.y * 10)])
  }
  return out
}

/** 門禁紀錄（GDD §9 新增）：站在門邊就看得到最近 5 次通過的剪影，不含名字 */
function doorLogOf(g: Game, u: Ent | undefined): PrivateState['doorLog'] {
  if (!u) return null
  const z = g.world.zones[u.zone]
  if (!z.layout) return null
  let best = -1
  let bestD = 2.6 * 2.6
  for (const d of z.layout.doors) {
    const dd = (d.x - u.x) ** 2 + (d.y - u.y) ** 2
    if (dd < bestD) {
      bestD = dd
      best = d.index
    }
  }
  if (best < 0) return null
  return { door: best, zone: z.id, log: z.doors[best].log.slice() }
}
