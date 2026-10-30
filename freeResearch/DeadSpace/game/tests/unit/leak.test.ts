import { describe, expect, it } from 'vitest'
import { Harness } from './helpers/harness'
import { checkMessages } from './helpers/leak'
import { unitDef } from '../../src/shared/content/registry'

function scanAll(h: Harness): string[] {
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

describe('隱藏資訊洩漏', () => {
  it('一般開局：快照只含可見實體、沒有身分欄位', () => {
    const { h, cs } = Harness.started(8, 77)
    for (let t = 0; t < 200; t++) {
      if (t % 20 === 0) {
        for (const c of cs) {
          const u = c.ents.get(c.me.unit as number)
          if (u) c.send({ t: 'cmd', seq: t, c: { k: 'move', x: u.x! / 100 + (t % 40 ? 6 : -6), y: u.y! / 100 + 3 } })
        }
      }
      h.ticks(1)
      if (t % 10 === 0) expect(scanAll(h)).toEqual([])
    }
  })

  it('匿名單位不洩漏擁有者', () => {
    const { h, cs } = Harness.started(6, 5)
    const g = h.server.game!
    const xeno = g.allPlayers().find((p) => p.role === 'xeno')!
    const main = g.mainOf(xeno)!
    // 在所有人的主單位旁邊放一隻匿名單位
    for (const p of g.allPlayers()) {
      const m = g.mainOf(p)!
      const e = g.world.spawn(unitDef('personnel'), m.zone, m.x + 1, m.y, xeno.slot)
      e.anon = true
      e.name = main.name
      e.color = main.color
    }
    h.ticks(3)
    expect(scanAll(h)).toEqual([])
    for (const c of cs) {
      if (c.slot === xeno.slot) continue
      const anon = [...c.ents.values()].filter((e) => {
        const ent = g.world.ents.get(e.i)
        return ent?.anon
      })
      expect(anon.length).toBeGreaterThan(0)
      for (const a of anon) {
        expect(a.o).toBe(-1)
        expect(a.n).toBe('')
      }
    }
  })

  it('死者聊天不會送給活人', () => {
    const { h, cs } = Harness.started(4, 9)
    const g = h.server.game!
    const victim = g.players[cs[1].slot]
    g.kill(g.mainOf(victim)!, null)
    victim.alive = false
    victim.deadAt = g.time - 10
    cs[1].send({ t: 'chat', ch: 'all', text: '我是被誰殺的' })
    h.ticks(2)
    expect(scanAll(h)).toEqual([])
    const got = cs[2].inbox.filter((m) => m.t === 'chat').flatMap((m) => (m.t === 'chat' ? m.lines : []))
    expect(got.some((l) => l.text === '我是被誰殺的')).toBe(false)
  })
})

// ───────── 獨立審查發現的回歸測試 ─────────
import { decode } from '../../src/shared/protocol/codec'
import type { HostMsg } from '../../src/shared/protocol/messages'
import { Game } from '../../src/sim/game'
import { DEFAULT_SETTINGS } from '../../src/shared/protocol/messages'

function msgs(h: Harness, peer: string): HostMsg[] {
  return (h.raw.get(peer) ?? []).map((r) => decode(r) as HostMsg)
}

describe('審查回歸', () => {
  it('大廳不送出地圖種子；同一個地圖種子、不同身分種子 → 身分分配不同', () => {
    const h = new Harness(123)
    h.connect('host', true)
    h.connect('p1')
    h.ticks(2)
    const lobby = msgs(h, 'peer-p1').filter((m) => m.t === 'lobbyState')
    expect(lobby.length).toBeGreaterThan(0)
    for (const m of lobby) if (m.t === 'lobbyState') expect(m.settings.seed).toBe(0)
    const mk = (secret: number) =>
      new Game({
        seed: 999,
        secret,
        settings: { ...DEFAULT_SETTINGS, aliens: 1, mutants: 1, npcCrew: 0 },
        players: Array.from({ length: 8 }, (_, i) => ({ slot: i, name: 'P' + i, color: i, bot: false, connected: true, spectator: false })),
        send: () => {},
      })
    const sig = (g: Game) => g.allPlayers().map((p) => p.role + p.classId).join(',')
    const a = sig(mk(1))
    const differs = [2, 3, 4, 5, 6].some((s) => sig(mk(s)) !== a)
    expect(differs).toBe(true)
  })

  it('聊天：匿名形態或被消音時不附泡泡 id；看不到說話者的人也收不到', () => {
    const { h, cs } = Harness.started(4, 55)
    const g = h.server.game!
    const ps = g.allPlayers()
    const u = g.mainOf(ps[1])!
    // 其他人都放到遠處（看不到 ps[1]）
    for (const p of [ps[0], ps[2], ps[3]]) g.world.relocate(g.mainOf(p)!, u.zone, u.x + 40, u.y)
    h.ticks(2)
    for (const r of h.raw.values()) r.length = 0
    cs[1].send({ t: 'chat', ch: 'all', text: 'hi' })
    h.ticks(2)
    for (const peer of ['local', 'peer-p2', 'peer-p3']) {
      for (const m of msgs(h, peer)) if (m.t === 'chat') for (const l of m.lines) expect(l.e).toBeUndefined()
    }
    // 匿名：就算看得到也不附
    u.anon = true
    for (const p of [ps[0], ps[2]]) g.world.relocate(g.mainOf(p)!, u.zone, u.x + 1, u.y)
    h.ticks(2)
    for (const r of h.raw.values()) r.length = 0
    cs[1].send({ t: 'chat', ch: 'all', text: 'hi again' })
    h.ticks(2)
    for (const peer of ['local', 'peer-p2']) for (const m of msgs(h, peer)) if (m.t === 'chat') for (const l of m.lines) expect(l.e).toBeUndefined()
  })

  it('動作目標 tg 與特效的次要欄位：看不見的實體 id 不會送出', () => {
    const { h } = Harness.started(3, 66)
    const g = h.server.game!
    const ps = g.allPlayers()
    const a = g.mainOf(ps[0])!
    const b = g.mainOf(ps[1])!
    const c = g.mainOf(ps[2])!
    // b 在遠處攻擊 c，然後走到 a 身邊
    g.world.relocate(b, a.zone, a.x + 40, a.y)
    g.world.relocate(c, a.zone, a.x + 41, a.y)
    b.order = { k: 'attack', e: c.id }
    h.ticks(10)
    b.order = null
    g.world.relocate(b, a.zone, a.x + 1, a.y)
    for (const r of h.raw.values()) r.length = 0
    g.emitFx({ k: 'atk', z: a.zone, x: b.x, y: b.y, x2: c.x, y2: c.y, e: b.id, e2: c.id, s: 'rifle' })
    h.ticks(3)
    for (const m of msgs(h, 'local')) {
      if (m.t !== 'snap') continue
      for (const e of m.s.e) if (e.tg !== undefined && e.tg !== null) expect(e.tg).not.toBe(c.id)
      for (const f of m.s.fx ?? []) {
        expect(f.e2).not.toBe(c.id)
        if (f.x2 !== undefined) expect(Math.hypot(f.x2 - f.x, (f.y2 ?? f.y) - f.y)).toBeLessThanOrEqual(1.6)
      }
    }
  })

  it('偽裝與分身換新 id：舊 id 從快照消失', () => {
    const { h } = Harness.started(2, 88)
    const g = h.server.game!
    const ps = g.allPlayers()
    const u = g.mainOf(ps[1])!
    const old = u.id
    g.world.relocate(u, g.mainOf(ps[0])!.zone, g.mainOf(ps[0])!.x + 1, g.mainOf(ps[0])!.y)
    h.ticks(2)
    const nid = g.reassignId(u)
    expect(nid).not.toBe(old)
    expect(g.mainOf(ps[1])).toBe(u)
    expect(g.world.get(old)).toBeUndefined()
    for (const r of h.raw.values()) r.length = 0
    h.ticks(1)
    const snap = msgs(h, 'local').find((m) => m.t === 'snap')
    expect(snap && snap.t === 'snap' && snap.s.g.includes(old)).toBe(true)
    expect(snap && snap.t === 'snap' && snap.s.e.some((e) => e.i === nid)).toBe(true)
  })
})
