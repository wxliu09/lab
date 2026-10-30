// 仿生人遙控器（研究 02 §5.4）：碼過期 → 無反應；異類使用 → 把仿生人改寫成自己陣營的 spawn；
// 人類使用且仿生人已被改寫 → 改回人類；否則切換停機／恢復。仿生人本人撿到自己的遙控器會自動丟掉。
import { regScript } from '../systems/effects'
import { dropOnGround } from '../systems/items'
import { applyBuff, removeBuff } from '../systems/buffs'
import type { Ent, ItemInst } from '../ent'
import type { Game, GamePlayer } from '../game'

function faction(g: Game, p: GamePlayer): 'crew' | 'xeno' | 'mutant' {
  const f = g.faction(p)
  return f === 'xeno' || f === 'mutant' ? f : 'crew'
}

function setShutdown(g: Game, p: GamePlayer, on: boolean): void {
  const u = g.mainOf(p)
  p.data.androidOff = on
  if (!u) return
  if (on) {
    u.data.frozen = true
    applyBuff(g, u, 'bf.androidOff')
    u.order = null
    u.queue.length = 0
    u.cast = null
  } else {
    u.data.frozen = false
    removeBuff(g, u, 'bf.androidOff')
  }
  u.statsDirty = true
}

regScript('android.remote', (g, ctx) => {
  const u = ctx.caster
  const slot = ctx.itemSlot ?? -1
  const it = slot >= 0 ? u.inv?.[slot] : null
  const user = u.owner >= 0 ? g.players[u.owner] : undefined
  if (!it || it.id !== 'overrideRemote' || !user) return
  const d = (it.data ?? {}) as { slot?: number; code?: number }
  const p = d.slot !== undefined ? g.players[d.slot] : undefined
  if (!p || p.role !== 'android' || !p.alive) {
    g.privateLine(user.slot, 'android.remoteNone')
    return
  }
  if (d.code !== p.data.remoteCode) {
    g.privateLine(user.slot, 'android.remoteStale')
    return
  }
  const uf = faction(g, user)
  const name = p.name
  if (uf === 'mutant' && p.spawnOf !== 'mutant') {
    p.spawnOf = 'mutant'
    p.android = true
    for (const q of g.allPlayers()) if (faction(g, q) === 'mutant') g.privateLine(q.slot, 'android.remoteMutant', { name })
  } else if (uf === 'xeno' && p.spawnOf !== 'xeno') {
    p.spawnOf = 'xeno'
    p.android = true
    for (const q of g.allPlayers()) if (faction(g, q) === 'xeno') g.privateLine(q.slot, 'android.remoteXeno', { name })
  } else if (uf === 'crew' && p.spawnOf) {
    p.spawnOf = null
    p.android = false
    g.privateLine(user.slot, 'android.remoteRestored', { name })
    g.privateLine(p.slot, 'android.remoteRestoredSelf')
  } else {
    const off = !p.data.androidOff
    setShutdown(g, p, off)
    g.privateLine(user.slot, off ? 'android.remoteOff' : 'android.remoteOn', { name })
    g.privateLine(p.slot, off ? 'android.remoteOffSelf' : 'android.remoteOnSelf')
  }
  g.emitFx({ k: 'remote', z: u.zone, x: u.x, y: u.y, e: u.id }, [user.slot])
  g.checkVictory()
})

/** 仿生人本人撿到綁定自己的遙控器：自動丟掉 */
export function installRemote(g: Game): void {
  const prev = g.onItemGained
  g.onItemGained = (u: Ent, it: ItemInst) => {
    prev?.(u, it)
    if (it.id !== 'overrideRemote' || !u.isMain || u.owner < 0) return
    const d = it.data as { slot?: number } | undefined
    if (d?.slot !== u.owner || !u.inv) return
    const i = u.inv.indexOf(it)
    if (i < 0) return
    u.inv[i] = null
    u.statsDirty = true
    dropOnGround(g, u.zone, u.x, u.y, it)
    g.privateLine(u.owner, 'android.remoteSelf')
  }
}
