// 死亡：屍體、掉落物、玩家進入旁觀；身分相關的轉化與公告由 roles 系統的 hook 處理
import { unitDef } from '../../shared/content/registry'
import { NEUTRAL, type Ent } from '../ent'
import type { Game } from '../game'
import { DEATH_HOOKS } from './damage'
import { dropOnGround } from './items'

/** 屍體保留秒數（玩家屍體永久，供吞食／辨認）*/
const CREATURE_CORPSE_LIFE = 90

export function makeCorpse(g: Game, u: Ent): Ent | null {
  if (!u.def.corpse) return null
  const c = g.world.spawn(unitDef('corpse'), u.zone, u.x, u.y, NEUTRAL)
  c.facing = u.facing
  c.data.of = u.def.id
  c.data.viewDef = u.def.id
  c.classId = u.classId
  c.data.wasMain = u.isMain
  c.data.slot = u.isMain ? u.owner : -1
  c.data.android = !!u.data.android
  if (!u.isMain) c.lifeEnd = g.time + CREATURE_CORPSE_LIFE
  c.anim = 4
  c.x2 = { of: u.def.id, cl: u.classId }
  return c
}

DEATH_HOOKS.push((g, u, _killer) => {
  if (u.data.noDrops) return
  // 掉落背包與身上的防護服
  if (u.inv) {
    for (let i = 0; i < u.inv.length; i++) {
      const it = u.inv[i]
      if (it) dropOnGround(g, u.zone, u.x, u.y, it)
      u.inv[i] = null
    }
  }
  if (u.suit) {
    dropOnGround(g, u.zone, u.x, u.y, u.suit)
    u.suit = null
  }
  // 生物掉落表
  if (u.def.drops) {
    for (const d of u.def.drops) {
      if (g.world.rng.chance(d.p)) {
        dropOnGround(g, u.zone, u.x, u.y, { id: d.item, charges: 0, cdUntil: 0, uid: g.world.rng.id31() })
        break
      }
    }
  }
})

DEATH_HOOKS.push((g, u) => {
  if (!u.data.converted) makeCorpse(g, u)
  // 瓦礫釋放導航格
  if (u.data.navIdx !== undefined) {
    const nav = g.world.zones[u.zone].nav
    if (nav && nav.dyn[u.data.navIdx] > 0) nav.dyn[u.data.navIdx]--
  }
})

/** 玩家主單位死亡的基本處理（身分轉化與公告在 roles 系統）*/
DEATH_HOOKS.push((g, u, killer, killerSlot) => {
  if (!u.isMain || u.owner < 0) return
  const p = g.players[u.owner]
  if (!p || p.main !== u.id || u.data.converted) return
  g.onMainDeath(p, u, killer, killerSlot)
})

/** 召喚物到期、致命區 */
export function stepLife(g: Game): void {
  const t = g.time
  for (const u of g.world.ents.values()) {
    if (u.lifeEnd && t >= u.lifeEnd) {
      if (u.alive && !u.tags.has('corpse') && !u.data.zoneObj) g.killEnt(u, null, -1)
      else g.world.remove(u)
    }
  }
}
