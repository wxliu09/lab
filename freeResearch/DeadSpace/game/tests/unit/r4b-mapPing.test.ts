// 第 4 輪：小地圖信號（mapPing）。活人給活人、死者／旁觀者給死者／旁觀者；限流；座標驗證；名字顏色用別人眼中的樣子
import { describe, expect, it } from 'vitest'
import { Harness, type FakeClient } from './helpers/harness'
import { PING_BURST } from '../../src/sim/server'
import type { HostMsg } from '../../src/shared/protocol/messages'
import { SPACE_HALF, SPACE_ZONE } from '../../src/sim/world'
import type { Game, GamePlayer } from '../../src/sim/game'

const SEC = 20
type Ping = Extract<HostMsg, { t: 'mapPing' }>
const pings = (c: FakeClient): Ping[] => c.inbox.filter((m): m is Ping => m.t === 'mapPing')

function setup(n = 4, settings: Record<string, unknown> = {}) {
  const { h, cs } = Harness.started(n, 4242, { eventMult: 0, npcCrew: 0, ...settings })
  const g = h.server.game!
  for (const p of g.allPlayers()) if (!p.spectator) g.setRole(p, 'human')
  // 留一個異類，免得有人死了對局就結束
  g.setRole(g.players[cs[n - 1].slot]!, 'xeno')
  h.ticks(2)
  return { h, cs, g }
}

/** 某人所在 zone 的中央 */
function here(g: Game, p: GamePlayer): { z: number; x: number; y: number } {
  const u = g.mainOf(p)!
  const l = g.world.zones[u.zone].layout!
  return { z: u.zone, x: l.w / 2, y: l.h / 2 }
}

function ping(h: Harness, c: FakeClient, at: { z: number; x: number; y: number }): void {
  for (const x of h.clients.values()) x.inbox.length = 0
  c.send({ t: 'mapPing', ...at })
  h.ticks(1)
}

describe('小地圖信號', () => {
  it('活人發的只給活人（不回送給自己）；名字與顏色是目前的顯示名字與顏色', () => {
    const { h, cs, g } = setup(4)
    const [a, b, dead] = [g.players[cs[0].slot]!, g.players[cs[1].slot]!, g.players[cs[2].slot]!]
    g.killEnt(g.mainOf(dead)!, null, -1)
    h.ticks(2)
    const at = here(g, a)
    ping(h, cs[0], at)
    expect(pings(cs[0])).toEqual([])
    const got = pings(cs[1])
    expect(got.length).toBe(1)
    expect(got[0]).toMatchObject({ z: at.z, name: a.name, color: a.color })
    expect(Math.abs(got[0].x - at.x)).toBeLessThan(0.01)
    expect(pings(cs[3]).length).toBe(1)
    expect(pings(cs[2])).toEqual([])
    void b
  })

  it('死者發的只給死者與旁觀者；活人收不到', () => {
    const { h, cs, g } = setup(5, { hostSpectate: true })
    const host = g.players[cs[0].slot]!
    expect(host.spectator).toBe(true)
    const [d1, d2] = [g.players[cs[1].slot]!, g.players[cs[2].slot]!]
    g.killEnt(g.mainOf(d1)!, null, -1)
    g.killEnt(g.mainOf(d2)!, null, -1)
    h.ticks(2)
    const at = here(g, g.players[cs[3].slot]!)
    ping(h, cs[1], at)
    expect(pings(cs[2]).length).toBe(1)
    expect(pings(cs[0]).length).toBe(1)
    expect(pings(cs[3])).toEqual([])
    expect(pings(cs[4])).toEqual([])
    // 旁觀的主機發的：同樣只給死者
    h.ticks(3 * SEC)
    ping(h, cs[0], at)
    expect(pings(cs[1]).length).toBe(1)
    expect(pings(cs[3])).toEqual([])
    // 活人發的：死者、旁觀者都收不到
    h.ticks(3 * SEC)
    ping(h, cs[3], at)
    expect(pings(cs[4]).length).toBe(1)
    expect(pings(cs[0])).toEqual([])
    expect(pings(cs[1])).toEqual([])
  })

  it('等記憶核心復活的仿生人、死亡即退出出局的人：不能發、也收不到死者的信號', () => {
    const { h, cs, g } = setup(5)
    const andr = g.players[cs[1].slot]!
    g.setRole(andr, 'android')
    g.killEnt(g.mainOf(andr)!, null, -1)
    const dead = g.players[cs[2].slot]!
    g.killEnt(g.mainOf(dead)!, null, -1)
    h.ticks(2)
    expect(andr.data.coreOnly).toBe(true)
    const at = here(g, g.players[cs[3].slot]!)
    ping(h, cs[2], at)
    expect(pings(cs[1])).toEqual([])
    h.ticks(3 * SEC)
    ping(h, cs[1], at)
    for (const c of cs) expect(pings(c)).toEqual([])
    dead.data.booted = true
    h.ticks(3 * SEC)
    ping(h, cs[2], at)
    for (const c of cs) expect(pings(c)).toEqual([])
  })

  it('被消音、通訊病毒清空名字：沒有名字也沒有顏色；千面化身：用偽裝對象的名字與顏色；病毒換過名字：用換過的名字', () => {
    const { h, cs, g } = setup(3)
    const a = g.players[cs[0].slot]!
    const at = here(g, a)
    a.mutedUntil = g.time + 30
    ping(h, cs[0], at)
    expect(pings(cs[1])[0]).toMatchObject({ name: '', color: -1 })
    a.mutedUntil = 0
    h.ticks(3 * SEC)
    const real = a.name
    a.name = ''
    ping(h, cs[0], at)
    expect(pings(cs[1])[0]).toMatchObject({ name: '', color: -1 })
    a.name = real
    h.ticks(3 * SEC)
    g.mainOf(a)!.data.fake = { name: 'Medic Bob', color: 7, def: 'personnel', owner: 1, cls: 'medic' }
    ping(h, cs[0], at)
    expect(pings(cs[1])[0]).toMatchObject({ name: 'Medic Bob', color: 7 })
    g.mainOf(a)!.data.fake = undefined
    h.ticks(3 * SEC)
    a.data.shownBase = 'Zed'
    a.name = 'Dr. Zed'
    a.color = 9
    ping(h, cs[0], at)
    expect(pings(cs[1])[0]).toMatchObject({ name: 'Dr. Zed', color: 9 })
    expect(JSON.stringify(pings(cs[1]))).not.toContain(a.baseName)
  })

  it(`限流：每人連發最多 ${PING_BURST} 次，之後約 2 秒 1 次`, () => {
    const { h, cs, g } = setup(3)
    const at = here(g, g.players[cs[0].slot]!)
    for (const x of cs) x.inbox.length = 0
    for (let i = 0; i < 6; i++) cs[0].send({ t: 'mapPing', ...at })
    h.ticks(1)
    expect(pings(cs[1]).length).toBe(PING_BURST)
    cs[1].inbox.length = 0
    h.ticks(1 * SEC)
    cs[0].send({ t: 'mapPing', ...at })
    h.ticks(1)
    expect(pings(cs[1]).length).toBe(0)
    h.ticks(1.1 * SEC)
    cs[0].send({ t: 'mapPing', ...at })
    cs[0].send({ t: 'mapPing', ...at })
    h.ticks(1)
    expect(pings(cs[1]).length).toBe(1)
    // 別人的額度是分開的
    cs[0].inbox.length = 0
    cs[1].send({ t: 'mapPing', ...at })
    h.ticks(1)
    expect(pings(cs[0]).length).toBe(1)
  })

  it('無效的 zone 或座標：不轉送', () => {
    const { h, cs, g } = setup(3)
    const at = here(g, g.players[cs[0].slot]!)
    const l = g.world.zones[at.z].layout!
    const bad = [
      { z: 4000, x: 1, y: 1 },
      { z: at.z, x: -1, y: 1 },
      { z: at.z, x: l.w + 1, y: 1 },
      { z: at.z, x: 1, y: l.h + 0.5 },
      { z: SPACE_ZONE, x: SPACE_HALF + 1, y: 0 },
      { z: at.z, x: Number.NaN, y: 1 },
    ]
    for (const b of bad) {
      h.ticks(3 * SEC)
      ping(h, cs[0], b)
      expect([b, pings(cs[1]).length]).toEqual([b, 0])
    }
    // 太空 zone 的有效座標
    h.ticks(3 * SEC)
    ping(h, cs[0], { z: SPACE_ZONE, x: -10, y: 20 })
    expect(pings(cs[1]).length).toBe(1)
    // 被摧毀的站
    const other = g.world.zones.find((z) => z.alive && z.layout && z.id !== at.z)!
    other.alive = false
    h.ticks(3 * SEC)
    ping(h, cs[0], { z: other.id, x: 1, y: 1 })
    expect(pings(cs[1]).length).toBe(0)
    other.alive = true
  })

  it('大廳階段不處理；全體聊天只限同站時，活人的信號只給同站的人', () => {
    const h = new Harness()
    const a = h.connect('host', true)
    const b = h.connect('Bob')
    a.send({ t: 'mapPing', z: 1, x: 1, y: 1 })
    h.ticks(1)
    expect(pings(b)).toEqual([])
    const { h: h2, cs, g } = setup(3, { localChat: true })
    const [p0, p1] = [g.players[cs[0].slot]!, g.players[cs[1].slot]!]
    const away = g.world.zones.find((z) => z.alive && z.layout && z.id !== g.mainOf(p0)!.zone)!
    g.world.relocate(g.mainOf(p1)!, away.id, away.layout!.w / 2, away.layout!.h / 2)
    h2.ticks(2)
    ping(h2, cs[0], here(g, p0))
    expect(pings(cs[1])).toEqual([])
  })
})
