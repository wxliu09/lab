// 第 5 輪：等記憶核心復活的仿生人說話（原作 aAv 20649–20672）。
// 說的話不進死者頻道，而是記憶核心位置的浮動文字：只有此刻看得到核心（或帶著它的單位）的人收得到，活人、死者都一樣；
// 看不到的人什麼都收不到（洩漏比對：逐一檢查每個人收到的訊息）
import { describe, expect, it } from 'vitest'
import { Harness, type FakeClient } from './helpers/harness'
import { damage } from '../../src/sim/systems/damage'
import { LAST_WORDS, coreHolder } from '../../src/sim/systems/chat'
import type { ChatLine } from '../../src/shared/protocol/messages'
import type { Game, GamePlayer } from '../../src/sim/game'

const SEC = 20
const chatLines = (c: FakeClient): ChatLine[] => c.inbox.flatMap((m) => (m.t === 'chat' ? m.lines : []))

function clientOf(h: Harness, p: GamePlayer): FakeClient {
  return [...h.clients.values()].find((c) => c.slot === p.slot)!
}

function strip(g: Game, p: GamePlayer): void {
  const u = g.mainOf(p)!
  u.inv?.fill(null)
  u.suit = null
  u.statsDirty = true
}

/** 6 人局：ps[1] 仿生人；ps[2] 站在仿生人旁邊（看得到核心）、ps[3] 在別的站；ps[4] 死者觀戰核心所在的站、ps[5] 死者觀戰別的站 */
function setup() {
  const { h, cs } = Harness.started(6, 4242, { eventMult: 0 })
  const g = h.server.game!
  const ps = g.allPlayers()
  for (const p of ps) g.setRole(p, 'human')
  g.setRole(ps[1], 'android')
  for (const p of ps) strip(g, p)
  const au = g.mainOf(ps[1])!
  const home = g.world.zones.find((z) => z.alive && z.layout && z.station && !z.data.ship && z.key === 'nyx')!
  const other = g.world.zones.find((z) => z.alive && z.layout && z.station && !z.data.ship && z.id !== home.id && z.key !== 'hulk7')!
  const spot = home.nav!.nearestOpen(home.layout!.spawns[0].x, home.layout!.spawns[0].y)!
  g.world.relocate(au, home.id, spot.x, spot.y)
  const near = home.nav!.nearestOpen(spot.x + 0.8, spot.y)!
  g.world.relocate(g.mainOf(ps[2])!, home.id, near.x, near.y)
  const far = other.nav!.nearestOpen(other.layout!.spawns[0].x, other.layout!.spawns[0].y)!
  g.world.relocate(g.mainOf(ps[3])!, other.id, far.x, far.y)
  h.ticks(2)
  // 兩名死者：一個觀戰核心所在的站、一個觀戰別的站
  for (const p of [ps[4], ps[5]]) damage(g, null, g.mainOf(p)!, 1e7, { pure: true })
  damage(g, null, au, 1e7, { pure: true })
  h.ticks(Math.ceil((LAST_WORDS + 1) * SEC))
  ps[4].specZone = home.id
  ps[5].specZone = other.id
  h.ticks(2)
  return { h, cs, g, ps, home, other }
}

function say(h: Harness, c: FakeClient, text: string, ch = 'all'): void {
  for (const x of h.clients.values()) x.inbox.length = 0
  c.send({ t: 'chat', ch, text } as never)
  h.ticks(1.6 * SEC)
}

describe('等記憶核心復活的仿生人說話＝核心位置的浮動文字', () => {
  it('只有看得到核心的人收到（活人與死者都算），泡泡掛在核心上、不帶名字與顏色；看不到的人什麼都收不到', () => {
    const { h, g, ps } = setup()
    const a = ps[1]
    expect(a.data.coreOnly).toBe(true)
    const core = coreHolder(g, a)!
    expect(core).toBeTruthy()
    // 開局到這裡累積的訊息不比對（那時的狀態已經過去了），從現在起每個 tick 比對
    for (const r of h.raw.values()) r.length = 0
    h.leakWatch = true
    for (const ch of ['all', 'dead', 'team', 'group']) {
      say(h, clientOf(h, a), `core talk ${ch}`, ch)
      for (const q of ps) {
        const got = chatLines(clientOf(h, q)).filter((l) => l.text === `core talk ${ch}`)
        const sees = q.view.visible.has(core.id)
        // 洩漏比對：看不到核心 ⇔ 一則都沒收到
        expect(got.length, `slot${q.slot} sees=${sees} ch=${ch}`).toBe(sees || q === a ? 1 : 0)
        for (const l of got) {
          expect(l.ch).toBe('all')
          expect(l.from).toBe('')
          expect(l.color).toBe(-1)
          expect(l.e).toBe(core.id)
        }
      }
      // 預期的接收者：仿生人自己、旁邊的活人、觀戰核心所在站的死者；別站的活人與死者收不到
      expect(chatLines(clientOf(h, ps[2])).some((l) => l.text === `core talk ${ch}`)).toBe(true)
      expect(chatLines(clientOf(h, ps[4])).some((l) => l.text === `core talk ${ch}`)).toBe(true)
      expect(chatLines(clientOf(h, ps[3])).some((l) => l.text === `core talk ${ch}`)).toBe(false)
      expect(chatLines(clientOf(h, ps[5])).some((l) => l.text === `core talk ${ch}`)).toBe(false)
    }
    // 沒有任何一則訊息帶仿生人的名字（說話者身分不會從聊天紀錄露出來）
    for (const q of ps) expect(chatLines(clientOf(h, q)).some((l) => l.from === a.baseName || l.from === a.name)).toBe(false)
    expect(h.drainLeaks()).toEqual([])
  })

  it('核心被撿走：浮動文字跟著帶著的人；只有看得到他的人收到', () => {
    const { h, g, ps, other } = setup()
    const a = ps[1]
    const coreEnt = coreHolder(g, a)!
    const carrier = g.mainOf(ps[2])!
    const slot = carrier.inv!.findIndex((x) => !x)
    carrier.inv![slot] = coreEnt.data.item as never
    g.world.remove(coreEnt)
    h.ticks(3)
    expect(coreHolder(g, a)).toBe(carrier)
    say(h, clientOf(h, a), 'carried talk')
    const line = chatLines(clientOf(h, ps[2])).find((l) => l.text === 'carried talk')!
    expect(line.e).toBe(carrier.id)
    expect(chatLines(clientOf(h, ps[3])).some((l) => l.text === 'carried talk')).toBe(false)
    // 帶著核心走到別的站：原本那站觀戰的死者收不到，別站觀戰的死者收得到
    const n = other.nav!.nearestOpen(other.layout!.spawns[0].x + 1, other.layout!.spawns[0].y)!
    g.world.relocate(carrier, other.id, n.x, n.y)
    h.ticks(3)
    say(h, clientOf(h, a), 'moved talk')
    expect(chatLines(clientOf(h, ps[4])).some((l) => l.text === 'moved talk')).toBe(false)
    expect(chatLines(clientOf(h, ps[5])).some((l) => l.text === 'moved talk')).toBe(true)
    for (const q of ps) {
      const got = chatLines(clientOf(h, q)).some((l) => l.text === 'moved talk')
      expect(got, `slot${q.slot}`).toBe(q === a || q.view.visible.has(carrier.id))
    }
  })

  it('死者頻道仍然聽不到等待復活的仿生人；-shutdown 之後回到一般死者頻道', () => {
    const { h, ps } = setup()
    const a = ps[1]
    say(h, clientOf(h, a), 'before shutdown', 'dead')
    expect(chatLines(clientOf(h, ps[5])).some((l) => l.text === 'before shutdown')).toBe(false)
    say(h, clientOf(h, a), '-shutdown')
    say(h, clientOf(h, a), 'after shutdown', 'dead')
    const l = chatLines(clientOf(h, ps[5])).find((x) => x.text === 'after shutdown')!
    expect(l.ch).toBe('dead')
    // 活人照樣聽不到死者
    expect(chatLines(clientOf(h, ps[2])).some((x) => x.text === 'after shutdown')).toBe(false)
  })

  it('核心正在鑄造台重建（找不到核心）：只回給說話者自己，誰都收不到', () => {
    const { h, g, ps } = setup()
    const a = ps[1]
    const coreEnt = coreHolder(g, a)!
    g.world.remove(coreEnt)
    a.data.core = 0
    h.ticks(2)
    say(h, clientOf(h, a), 'nobody hears')
    for (const q of ps) expect(chatLines(clientOf(h, q)).some((l) => l.text === 'nobody hears'), `slot${q.slot}`).toBe(q === a)
    expect(chatLines(clientOf(h, a)).find((l) => l.text === 'nobody hears')!.e).toBeUndefined()
  })
})
