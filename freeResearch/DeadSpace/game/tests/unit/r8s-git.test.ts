// 第 8 輪 S8：抽血集合（對地面使用基因檢測器 → 全場活著的人收到「X 在某站・某房間抽血，60 秒內」＋地圖信號，60 秒冷卻）
// 與 GIT 錯誤報告照原作規則直說「樣本三人之中有一名仿生人」。驗血規則本身不變。
import { describe, expect, it } from 'vitest'
import { Harness, type FakeClient } from './helpers/harness'
import { checkMessages } from './helpers/leak'
import type { HostMsg } from '../../src/shared/protocol/messages'
import { giveItem, makeItem } from '../../src/sim/systems/items'
import { SCRIPTS } from '../../src/sim/systems/effects'
import { RALLY_CD, RALLY_WINDOW, type GitRally } from '../../src/sim/scripts/git'
import { SPACE_ZONE } from '../../src/sim/world'
import type { Ent } from '../../src/sim/ent'
import type { Game } from '../../src/sim/game'
import { RULE8_EN, RULE8_ZH } from '../../src/ui/strings/rule8'

function setup(n = 4) {
  const { h, cs } = Harness.started(n, 31337)
  const g = h.server.game!
  const ps = g.allPlayers()
  for (const p of ps) g.setRole(p, 'human')
  return { h, g, ps, cs }
}

function scan(h: Harness): string[] {
  const g = h.server.game!
  const out: string[] = []
  for (const [peer, raws] of h.raw) {
    const slot = h.server.slotOfPeer(peer)
    if (slot === null) continue
    out.push(...checkMessages(g, slot, raws))
    raws.length = 0
  }
  return out
}

/** 這個 client 從 from 之後收到的系統訊息 */
function lines(c: FakeClient, from = 0): string[] {
  const out: string[] = []
  for (const m of (c.inbox as HostMsg[]).slice(from)) if (m.t === 'chat') for (const l of m.lines) out.push(l.text)
  return out
}

function pings(c: FakeClient, from = 0): { s?: string; v?: number }[] {
  const out: { s?: string; v?: number }[] = []
  for (const m of (c.inbox as HostMsg[]).slice(from)) if (m.t === 'snap') for (const f of m.s.fx ?? []) if (f.k === 'ping') out.push(f)
  return out
}

const clientOf = (cs: FakeClient[], slot: number) => cs.find((c) => c.slot === slot)!
const samplerSlot = (u: Ent) => u.inv!.findIndex((x) => x?.id === 'geneSampler')
const isRally = (x: string) => x.startsWith('@rule8.git.rally|') || x.startsWith('@rule8.git.rallyHall|')

describe('抽血集合：對地面使用基因檢測器', () => {
  it('全場活著的人收到地點與 60 秒、地圖信號；死者收不到；不會開始抽血；60 秒冷卻；不洩漏', () => {
    const { h, g, ps, cs } = setup()
    const u = g.mainOf(ps[0])!
    giveItem(g, u, makeItem('geneSampler'))
    const s = samplerSlot(u)
    g.killEnt(g.mainOf(ps[3])!, null, -1)
    h.ticks(2)
    scan(h)
    const mark = cs.map((c) => c.inbox.length)
    g.handleCommand(ps[0].slot, { k: 'use', s, x: u.x + 1, y: u.y })
    h.ticks(2)
    for (const [i, c] of cs.entries()) {
      const got = lines(c, mark[i]).filter(isRally)
      const alive = g.players[c.slot]!.alive
      expect(got.length).toBe(alive ? 1 : 0)
      expect(pings(c, mark[i]).filter((f) => f.s === 'rally').length).toBe(alive ? 1 : 0)
      if (!alive) continue
      expect(got[0]).toContain(`|name=${ps[0].name}|`)
      expect(got[0]).toContain(`|s=${RALLY_WINDOW}`)
      expect(got[0]).toMatch(/\|sz=[^|]+\|se=/)
    }
    // 不是抽血：沒有施法命令、樣本是空的
    expect(u.order?.k).not.toBe('cast')
    expect((u.inv![s]!.data as { sample?: { keys?: string[] } } | undefined)?.sample?.keys?.length ?? 0).toBe(0)
    const rally = g.data.gitRally as GitRally
    expect(rally.slot).toBe(ps[0].slot)
    expect(rally.zone).toBe(u.zone)
    // 冷卻中：只私訊本人還要多久，別人不會再收到
    const mark2 = cs.map((c) => c.inbox.length)
    h.ticks(20 * 10)
    g.handleCommand(ps[0].slot, { k: 'use', s, x: u.x + 1, y: u.y })
    h.ticks(2)
    for (const [i, c] of cs.entries()) {
      expect(lines(c, mark2[i]).filter(isRally)).toEqual([])
      const cd = lines(c, mark2[i]).filter((x) => x.startsWith('@rule8.git.rallyCd|'))
      expect(cd.length).toBe(c.slot === ps[0].slot ? 1 : 0)
      if (cd.length) expect(cd[0]).toBe(`@rule8.git.rallyCd|s=${RALLY_CD - 10}`)
    }
    // 冷卻結束：可以再發
    h.ticks(20 * (RALLY_CD - 10))
    const mark3 = cs.map((c) => c.inbox.length)
    g.handleCommand(ps[0].slot, { k: 'use', s, x: u.x - 1, y: u.y })
    h.ticks(2)
    expect(lines(clientOf(cs, ps[1].slot), mark3[cs.indexOf(clientOf(cs, ps[1].slot))]).filter(isRally).length).toBe(1)
    expect(scan(h)).toEqual([])
  })

  it('透過網路送出的 use 指令（client 對地面點下去）一樣生效', () => {
    const { h, g, ps, cs } = setup(3)
    const host = cs.find((c) => c.slot === ps[0].slot)!
    const u = g.mainOf(ps[0])!
    giveItem(g, u, makeItem('geneSampler'))
    const mark = clientOf(cs, ps[1].slot).inbox.length
    host.send({ t: 'cmd', seq: 1, c: { k: 'use', s: samplerSlot(u), x: u.x + 2, y: u.y + 1 } })
    h.ticks(2)
    expect(lines(clientOf(cs, ps[1].slot), mark).filter(isRally).length).toBe(1)
  })

  it('對人使用照舊是抽血（3 秒施法），不會發出集合', () => {
    const { h, g, ps, cs } = setup(3)
    const u = g.mainOf(ps[0])!
    const t = g.mainOf(ps[1])!
    giveItem(g, u, makeItem('geneSampler'))
    g.world.relocate(t, u.zone, u.x + 0.8, u.y)
    t.order = null
    // 等視野更新（看得到對方才能對他用道具）
    h.ticks(2)
    const mark = cs.map((c) => c.inbox.length)
    g.handleCommand(ps[0].slot, { k: 'use', s: samplerSlot(u), e: t.id })
    h.ticks(2)
    expect(u.cast?.ability ?? (u.order?.k === 'cast' ? u.order.a : '')).toBe('ab.item.geneSampler')
    for (const [i, c] of cs.entries()) expect(lines(c, mark[i]).filter(isRally)).toEqual([])
  })

  it('名字用別人眼中的樣子：偽裝成別人時公告的是偽裝對象的名字', () => {
    const { h, g, ps, cs } = setup(3)
    const u = g.mainOf(ps[0])!
    giveItem(g, u, makeItem('geneSampler'))
    u.data.fake = { owner: ps[1].slot, name: ps[1].name, def: u.def.id }
    const c2 = clientOf(cs, ps[2].slot)
    const mark = c2.inbox.length
    g.handleCommand(ps[0].slot, { k: 'use', s: samplerSlot(u), x: u.x + 1, y: u.y })
    h.ticks(2)
    const got = lines(c2, mark).filter(isRally)
    expect(got.length).toBe(1)
    expect(got[0]).toContain(`|name=${ps[1].name}|`)
    expect(got[0]).not.toContain(`|name=${ps[0].name}|`)
  })

  it('在太空中不能發：只私訊本人', () => {
    const { h, g, ps, cs } = setup(3)
    const u = g.mainOf(ps[0])!
    giveItem(g, u, makeItem('geneSampler'))
    g.world.relocate(u, SPACE_ZONE, 20, 20)
    const mark = cs.map((c) => c.inbox.length)
    g.handleCommand(ps[0].slot, { k: 'use', s: samplerSlot(u), x: 21, y: 20 })
    h.ticks(2)
    for (const [i, c] of cs.entries()) {
      expect(lines(c, mark[i]).filter(isRally)).toEqual([])
      expect(lines(c, mark[i]).includes('@rule8.git.rallySpace')).toBe(c.slot === ps[0].slot)
    }
  })

  it('字串：中英都有，英文不用直撇號', () => {
    for (const k of Object.keys(RULE8_ZH)) expect([k, k in RULE8_EN]).toEqual([k, true])
    for (const v of Object.values(RULE8_EN)) expect(v).not.toContain("'")
    expect(RULE8_ZH['rule8.git.report.error']).toContain('樣本三人之中有一名仿生人')
  })
})

describe('GIT 錯誤報告照原作規則直說', () => {
  const run = (g: Game, name: string, ctx: Record<string, unknown>) => SCRIPTS.get(name)!(g, ctx as never, {})

  it('樣本裡有仿生人 → 報告是「樣本三人之中有一名仿生人」（rule8.git.report.error），紀錄照舊是 error', () => {
    const { h, g, ps, cs } = setup()
    g.setRole(ps[1], 'android')
    const u = g.mainOf(ps[0])!
    giveItem(g, u, makeItem('geneSampler'))
    for (const p of [ps[1], ps[2], ps[3]]) {
      const t = g.mainOf(p)!
      run(g, 'git.draw', { caster: u, target: t, x: t.x, y: t.y, zone: t.zone, itemSlot: samplerSlot(u) })
    }
    const it = u.inv!.find((x) => x?.id === 'gitResolver')!
    const mark = clientOf(cs, ps[0].slot).inbox.length
    run(g, 'git.results', { caster: u, target: { data: { sample: it.data } } as unknown as Ent, x: u.x, y: u.y, zone: u.zone })
    h.ticks(2)
    expect(ps[0].gitReports[ps[0].gitReports.length - 1].result).toBe('error')
    expect(lines(clientOf(cs, ps[0].slot), mark).some((x) => x.startsWith('@rule8.git.report.error|lz='))).toBe(true)
    // 報告只給購買者
    for (const c of cs) if (c.slot !== ps[0].slot) expect(lines(c).some((x) => x.startsWith('@rule8.git.report.error'))).toBe(false)
  })
})
