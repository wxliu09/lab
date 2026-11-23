// 第 9 輪 S（上架前總評 P2-1）：-slug 附身蛞蝓仔成功後
// - 私訊本人附身在哪個站、哪個房間；觀戰視角換到蛞蝓仔所在的站；
// - 本人的快照一定有這隻蛞蝓仔（觀戰視角切到別站也一樣：頭像、空白鍵跟到牠身上）；
// - 隱藏資訊：每 tick 比對所有人的訊息（洩漏 oracle），活人收不到多的東西；亡者之眼開著時照舊停用。
import { describe, expect, it } from 'vitest'
import { Harness, type FakeClient } from './helpers/harness'
import { spawnCreature } from '../../src/sim/ai/creatures'
import { zoneLabel } from '../../src/sim/systems/space'
import { roomAt } from '../../src/shared/layout'
import { EntFlag } from '../../src/shared/protocol/messages'
import { HOSTILE } from '../../src/sim/ent'
import type { Game, GamePlayer } from '../../src/sim/game'

function setup(settings: Record<string, unknown> = {}) {
  const { h, cs } = Harness.started(4, 4242, { eventMult: 0, ...settings })
  const g = h.server.game!
  const ps = g.allPlayers().filter((p) => !p.spectator)
  for (const p of ps) g.setRole(p, 'human')
  h.ticks(2)
  return { h, cs, g, ps }
}

const clientOf = (cs: FakeClient[], p: GamePlayer) => cs.find((c) => c.slot === p.slot)!
const lines = (c: FakeClient) => c.inbox.flatMap((m) => (m.t === 'chat' ? m.lines.map((l) => l.text) : []))

/** 場上只留一隻可以附身的蛞蝓仔：放在死者所在以外的另一個站（房間裡）*/
function lonelySlug(g: Game, notZone: number) {
  for (const e of g.world.ents.values()) if (e.def.id === 'creature.slugling' && e.data.cell === undefined) e.owner = HOSTILE
  const z = g.world.zones.find((q) => q.alive && q.layout && q.nav && !q.data.ship && q.id !== notZone && q.layout.rooms.length > 2)!
  const room = z.layout!.rooms.find((r) => r.spec.name && z.nav!.nearestOpen(r.cx, r.cy))!
  const at = z.nav!.nearestOpen(room.cx, room.cy)!
  const s = spawnCreature(g, 'creature.slugling', z.id, at.x, at.y, 0)!
  return { s, z }
}

describe('-slug 附身成功', () => {
  it('私訊附身的站與房間、觀戰視角換過去、快照一直有自己的蛞蝓仔；每 tick 不洩漏', () => {
    const { h, cs, g, ps } = setup()
    const dead = ps[1]
    const deathZone = g.mainOf(dead)!.zone
    g.killEnt(g.mainOf(dead)!, null, -1)
    h.ticks(10)
    expect(dead.alive).toBe(false)
    expect(dead.specZone).toBe(deathZone)
    const { s, z } = lonelySlug(g, deathZone)
    h.ticks(2)
    h.leakWatch = true
    h.drainLeaks()
    const dc = clientOf(cs, dead)
    dc.send({ t: 'chat', ch: 'all', text: '-slug' })
    h.ticks(3)
    expect(dead.control).toBe(s.id)
    expect(s.owner).toBe(dead.slot)
    // 觀戰視角換到蛞蝓仔所在的站（sim 與 client 的私有狀態）
    expect(dead.specZone).toBe(z.id)
    expect(dc.me.specZone).toBe(z.id)
    expect(dc.me.control).toBe(s.id)
    // 私訊：站名（重複的船名會加編號，用 zoneLabel）與房間（中英各一份）
    const loc = zoneLabel(g, z)
    const room = roomAt(z.layout!, s.x, s.y)!.spec.name
    const ok = lines(dc).find((l) => l.startsWith('@fix9s.slug.ok'))
    expect(ok).toBe(`@fix9s.slug.ok|sz=${loc.zh}|se=${loc.en}|rz=的${room.zh}|re=, ${room.en}`)
    // 別人收不到這則私訊
    for (const c of cs) if (c !== dc) expect(lines(c).some((l) => l.includes('fix9s.slug'))).toBe(false)
    // 快照裡有自己的蛞蝓仔（標成自己的）
    expect(dc.ents.get(s.id)?.d).toBe('creature.slugling')
    expect((dc.ents.get(s.id)?.fl ?? 0) & EntFlag.Mine).toBeTruthy()
    // 觀戰視角切到別站：蛞蝓仔照樣在快照裡（位置跟著更新）
    dc.send({ t: 'cmd', seq: 1, c: { k: 'spec', s: deathZone } })
    h.ticks(2)
    expect(dead.specZone).toBe(deathZone)
    expect(dc.ents.has(s.id)).toBe(true)
    const x0 = s.x
    dc.send({ t: 'cmd', seq: 2, c: { k: 'move', x: s.x + 2, y: s.y } })
    h.ticks(30)
    expect(Math.abs(s.x - x0)).toBeGreaterThan(0.5)
    expect(Math.abs((dc.ents.get(s.id)!.x ?? 0) / 100 - s.x)).toBeLessThan(0.2)
    // 蛞蝓仔死了：控制權回到觀戰，快照不再有牠（屍體留在原站，觀戰視角不在那裡）
    g.killEnt(s, null, -1)
    h.ticks(3)
    expect(dead.control).toBe(0)
    expect(dc.me.control).toBe(0)
    expect(h.drainLeaks()).toEqual([])
  })

  it('亡者之眼開著：照舊停用，觀戰視角不動', () => {
    const { h, cs, g, ps } = setup({ ghostSight: true })
    const dead = ps[2]
    const deathZone = g.mainOf(dead)!.zone
    g.killEnt(g.mainOf(dead)!, null, -1)
    h.ticks(10)
    const { s } = lonelySlug(g, deathZone)
    const dc = clientOf(cs, dead)
    dc.send({ t: 'chat', ch: 'all', text: '-slug' })
    h.ticks(3)
    expect(dead.control).toBe(0)
    expect(s.owner).not.toBe(dead.slot)
    expect(dead.specZone).toBe(deathZone)
    expect(lines(dc)).toContain('@ghost8.slugOff')
    expect(lines(dc).some((l) => l.startsWith('@fix9s.slug.ok'))).toBe(false)
  })
})
