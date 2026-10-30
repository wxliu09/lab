// 監視器回放（GDD §9）：只給擁有者、每格只含鏡頭看得到的單位、匿名與偽裝照樣遮蔽
import { describe, expect, it } from 'vitest'
import { Harness } from './helpers/harness'
import { decode } from '../../src/shared/protocol/codec'
import type { HostMsg } from '../../src/shared/protocol/messages'
import { unitDef } from '../../src/shared/content/registry'

describe('監視器回放', () => {
  it('擁有者拿得到 15 秒內的畫面；別人拿不到；看不到的單位不在裡面；匿名單位沒有名字', () => {
    const { h, cs } = Harness.started(3, 404)
    const g = h.server.game!
    const ps = g.allPlayers()
    const owner = g.mainOf(ps[1])!
    const cam = g.world.spawn(unitDef('dev.camera'), owner.zone, owner.x, owner.y, ps[1].slot)
    const z = g.world.zones[owner.zone]
    // 鏡頭旁邊放一個匿名單位、很遠的地方放一個人
    const near = g.mainOf(ps[2])!
    const np = z.nav!.nearestOpen(cam.x + 1.5, cam.y) ?? { x: cam.x, y: cam.y }
    g.world.relocate(near, cam.zone, np.x, np.y)
    near.anon = true
    const far = g.mainOf(ps[0])!
    g.world.relocate(far, cam.zone, cam.x + 40, cam.y + 40)
    g.world.relocate(owner, cam.zone, cam.x + 30, cam.y)
    h.ticks(20 * 20)
    for (const r of h.raw.values()) r.length = 0
    // 別人要不到
    cs[2].send({ t: 'cmd', seq: 1, c: { k: 'feedReplay', e: cam.id } })
    cs[1].send({ t: 'cmd', seq: 1, c: { k: 'feedReplay', e: cam.id } })
    h.ticks(2)
    const got = (peer: string) => (h.raw.get(peer) ?? []).map((r) => decode(r) as HostMsg).filter((m) => m.t === 'replay')
    expect(got('peer-p2')).toEqual([])
    expect(got('local')).toEqual([])
    const mine = got('peer-p1')
    expect(mine.length).toBe(1)
    const rp = mine[0] as Extract<HostMsg, { t: 'replay' }>
    expect(rp.frames.length).toBe(30)
    for (const f of rp.frames) {
      for (const u of f.u) {
        const d = Math.hypot(u[1] / 10 - cam.x, u[2] / 10 - cam.y)
        expect(d).toBeLessThanOrEqual(cam.def.sight + 1)
      }
    }
    const last = rp.frames[rp.frames.length - 1]
    const anonEntry = last.u.find((u) => Math.abs(u[1] / 10 - near.x) < 0.2 && Math.abs(u[2] / 10 - near.y) < 0.2)
    expect(anonEntry).toBeTruthy()
    expect(anonEntry![4]).toBe('')
    expect(anonEntry![3]).toBe(-1)
    // 冷卻：馬上再要一次不會給
    for (const r of h.raw.values()) r.length = 0
    cs[1].send({ t: 'cmd', seq: 2, c: { k: 'feedReplay', e: cam.id } })
    h.ticks(2)
    expect(got('peer-p1')).toEqual([])
  })
})
