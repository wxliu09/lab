// 生命再生器（女帝號醫療艙，原作 h010 ×2、A016 Life Regen Aura 6 hp/s）：被動光環，站在旁邊的單位每秒回復生命，不需要啟動。
// 每 0.5 秒刷新一次短效 buff（buff 系統的 regen 每秒回復），離開範圍 1 秒內就停；任何人都有效，不透露身分。
import type { Game } from '../game'
import type { Ent } from '../ent'
import { applyBuff } from './buffs'

/** 光環半徑（公尺，從再生器中心算，含對方的身體半徑）*/
export const REGEN_AURA_R = 4

export function installRegen(g: Game): void {
  let next = 0
  let units: Ent[] | null = null
  g.systems.push({
    name: 'regen',
    fn: (g) => {
      if (g.time < next) return
      next = g.time + 0.5
      units ??= [...g.world.ents.values()].filter((e) => e.def.id === 'struct.regen')
      for (const r of units) {
        if (!r.alive || r.removed || !g.world.zones[r.zone]?.alive) continue
        for (const u of g.world.query(r.zone, r.x, r.y, REGEN_AURA_R)) {
          if (u === r || !u.alive || u.tags.has('structure') || u.tags.has('corpse') || u.tags.has('noTarget')) continue
          applyBuff(g, u, 'bf.regenAura', 1)
        }
      }
    },
  })
}
