// 門禁紀錄與隱形單位：門禁只記時間與剪影（人形／著裝者／生物／機械），不記名字或陣營；
// 隱形中的單位照樣會讓門打開，但剪影記成「未識別」（剪影會說出看不見的是人、生物還是機械）
import { describe, expect, it } from 'vitest'
import { Harness } from './helpers/harness'
import { applyBuff, recomputeStats, removeBuff } from '../../src/sim/systems/buffs'
import { hasString } from '../../src/ui/i18n'
import '../../src/ui/strings/sim5'
import type { Ent } from '../../src/sim/ent'
import type { Game } from '../../src/sim/game'

function zone(g: Game, key: string) {
  return g.world.zones.find((z) => z.key === key)!
}

function stand(g: Game, u: Ent, zid: number, x: number, y: number): void {
  const z = g.world.zones[zid]
  const n = z.nav!.nearestOpen(x, y) ?? { x, y }
  g.world.relocate(u, zid, n.x, n.y)
  u.order = null
  u.queue.length = 0
  u.path = null
  u.acquire = false
}

/** 女帝號裡離所有玩家都遠、而且開著也沒人的一扇門 */
function quietDoor(g: Game, zid: number) {
  const z = g.world.zones[zid]
  const mains = g.allPlayers().map((p) => g.mainOf(p)!)
  return z.layout!.doors.find((d) => !z.doors[d.index].locked && mains.every((m) => Math.hypot(m.x - d.x, m.y - d.y) > 8) && g.world.query(zid, d.x, d.y, 3).length === 0)!
}

describe('門禁紀錄與隱形單位', () => {
  it('隱形的人走過門：門照樣打開，紀錄是「未識別」；現形後經過記回人形', () => {
    const { h, cs } = Harness.started(2, 909, { eventMult: 0 })
    const g = h.server.game!
    const ps = g.allPlayers()
    // 每個 tick 都立刻比對送出的訊息（測試裡會瞬移單位）
    h.leakWatch = true
    const z = zone(g, 'nyx')
    const sneak = g.mainOf(ps[1])!
    const watcher = g.mainOf(ps[0])!
    // 挑一扇沒人的門；「離開」= 回到兩人開局的位置
    const home = [sneak, watcher].map((u) => ({ zone: u.zone, x: u.x, y: u.y }))
    const away = () => {
      stand(g, sneak, home[0].zone, home[0].x, home[0].y)
      stand(g, watcher, home[1].zone, home[1].x, home[1].y)
    }
    stand(g, sneak, z.id, z.layout!.spawns[0].x, z.layout!.spawns[0].y)
    stand(g, watcher, z.id, z.layout!.spawns[0].x, z.layout!.spawns[0].y + 1)
    const d = quietDoor(g, z.id)
    away()
    h.ticks(4)
    const st = z.doors[d.index]
    expect(st.open).toBe(false)
    const before = st.log.length
    applyBuff(g, sneak, 'bf.mut.stealth', 30)
    recomputeStats(sneak)
    expect(sneak.stats.stealth).toBe(true)
    stand(g, sneak, z.id, d.x + 1.2, d.y)
    h.ticks(4)
    expect(st.open).toBe(true)
    expect(st.log.slice(before).map((l) => l.sil)).toEqual(['unknown'])
    // 站在門邊的人讀得到門禁紀錄：只有時間與「未識別」
    stand(g, watcher, z.id, d.x - 1.2, d.y)
    h.ticks(4)
    const dl = cs[0].me.doorLog as { door: number; log: { t: number; sil: string }[] } | null
    expect(dl?.door).toBe(d.index)
    expect(dl!.log[dl!.log.length - 1].sil).toBe('unknown')
    expect(JSON.stringify(dl)).not.toContain(ps[1].name)
    // 現形之後再經過一次（等門關上）
    away()
    h.ticks(6)
    expect(st.open).toBe(false)
    removeBuff(g, sneak, 'bf.mut.stealth')
    recomputeStats(sneak)
    stand(g, sneak, z.id, d.x + 1.2, d.y)
    h.ticks(4)
    expect(st.log[st.log.length - 1].sil).toBe('crew')
    expect(h.drainLeaks()).toEqual([])
  })

  it('「未識別」在兩種語言都有說明文字', () => {
    expect(hasString('zh', 'door.sil.unknown')).toBe(true)
    expect(hasString('en', 'door.sil.unknown')).toBe(true)
  })
})
