// 第 8 輪 G（死者與旁觀者）：觀戰看板只給死者／旁觀者、亡靈預言、亡者之眼（ghostSight）。
// 重點是隱藏資訊：活人永遠收不到看板、預言、真實陣營；開著 ghostSight 時活人的每一則訊息都和關閉時逐位元組相同。
import { describe, expect, it, vi } from 'vitest'
import { Harness, type FakeClient } from './helpers/harness'
import { damage } from '../../src/sim/systems/damage'
import { applyBuff } from '../../src/sim/systems/buffs'
import { LAST_WORDS } from '../../src/sim/systems/chat'
import { REVIVE_WINDOW } from '../../src/sim/scripts/items'
import { GHOST_DELAY, deathKind } from '../../src/sim/systems/spectate'
import { parseClientBytes } from '../../src/shared/protocol/validate'
import { encode } from '../../src/shared/protocol/codec'
import type { Game, GamePlayer } from '../../src/sim/game'
import type { EndResult, HostMsg, SpecBoard } from '../../src/shared/protocol/messages'

const TPS = 20

/** 固定身分：全部人類，slot 1 是異形主腦（測試可重現）*/
function setup(n: number, settings: Record<string, unknown> = {}, seed = 8181) {
  const { h, cs } = Harness.started(n, seed, { eventMult: 0, ...settings })
  const g = h.server.game!
  const ps = g.allPlayers().filter((p) => !p.spectator)
  for (const p of ps) g.setRole(p, 'human')
  g.setRole(ps[1], 'xeno')
  for (const p of ps) {
    const u = g.mainOf(p)!
    u.inv?.fill(null)
    u.suit = null
    u.statsDirty = true
  }
  h.ticks(2)
  return { h, cs, g, ps }
}

function kill(g: Game, p: GamePlayer): void {
  damage(g, null, g.mainOf(p)!, 1e7, { pure: true })
}

const clientOf = (cs: FakeClient[], p: GamePlayer) => cs.find((c) => c.slot === p.slot)!
const lines = (c: FakeClient) => c.inbox.flatMap((m) => (m.t === 'chat' ? m.lines.map((l) => l.text) : []))
const board = (c: FakeClient) => c.me.spec as SpecBoard | undefined

describe('觀戰看板：只給死者與旁觀者', () => {
  it('死者（過了遺言時間）收到看板：每個存活地點的活人數、死亡紀錄；活人一個欄位都收不到', () => {
    const { h, cs, g, ps } = setup(6)
    h.leakWatch = true
    const victim = ps[2]
    const zoneAtDeath = g.mainOf(victim)!.zone
    kill(g, victim)
    h.ticks(TPS)
    // 遺言時間內（活人還聽得到他說話）：還沒有看板
    expect(victim.alive).toBe(false)
    expect(board(clientOf(cs, victim))).toBeUndefined()
    h.ticks(Math.ceil((LAST_WORDS + 1) * TPS))
    const b = board(clientOf(cs, victim))!
    expect(b).toBeDefined()
    // 太空在最前面，之後是每個存活的地點
    expect(b.z[0][0]).toBe(0)
    const alive = g.world.zones.filter((z) => z.alive && z.station).map((z) => z.id)
    expect(b.z.map((r) => r[0]).slice(1)).toEqual(alive)
    // 活人數＝每個 zone 裡活著的玩家主單位
    const want = new Map<number, number>()
    for (const p of ps) if (p.alive) want.set(g.mainOf(p)!.zone, (want.get(g.mainOf(p)!.zone) ?? 0) + 1)
    for (const [id, n] of b.z) expect(n).toBe(want.get(id) ?? 0)
    // 死亡：地點、名字、公告過的身分
    expect(b.d[0][0]).toBe(zoneAtDeath)
    expect(b.d[0][2]).toBe(victim.name)
    expect(b.d[0][3]).toBe('innocent')
    // 活人：沒有看板、沒有預言、沒有亡者之眼
    for (const p of ps) {
      if (!p.alive) continue
      const c = clientOf(cs, p)
      expect(c.me.spec).toBeUndefined()
      expect('proph' in c.me).toBe(false)
      expect('ghost' in c.me).toBe(false)
    }
    expect(h.drainLeaks()).toEqual([])
  })

  it('看板的死者身分和全場公告的完全一樣（不會比公告多說什麼）', () => {
    const { h, cs, g, ps } = setup(6)
    kill(g, ps[1])
    kill(g, ps[3])
    h.ticks(Math.ceil((LAST_WORDS + 2) * TPS))
    const b = board(clientOf(cs, ps[3]))!
    const said = lines(cs[0]).filter((t) => t.startsWith('@death.'))
    for (const p of [ps[1], ps[3]]) {
      const row = b.d.find((d) => d[2] === p.name)!
      expect(row).toBeDefined()
      expect(said.some((t) => t.startsWith(`@death.${row[3]}|`) && t.includes(p.name))).toBe(true)
      expect(row[3]).toBe(deathKind(p))
    }
    expect(b.d.find((d) => d[2] === ps[1].name)![3]).toBe('xeno')
  })

  it('交戰：有玩家參與的攻擊標成交戰、記下焦點；隱形攻擊者的攻擊死者看不到，也不算', () => {
    const { h, cs, g, ps } = setup(6)
    kill(g, ps[5])
    h.ticks(Math.ceil((LAST_WORDS + 1) * TPS))
    const a = g.mainOf(ps[2])!
    const b = g.mainOf(ps[3])!
    g.world.relocate(b, a.zone, a.x + 1.5, a.y)
    applyBuff(g, a, 'bf.innateStealth')
    a.statsDirty = true
    h.ticks(2)
    expect(a.stats.stealth).toBe(true)
    g.emitFx({ k: 'atk', z: a.zone, x: a.x, y: a.y, x2: b.x, y2: b.y, e: a.id, e2: b.id })
    h.ticks(TPS + 1)
    const row0 = board(clientOf(cs, ps[5]))!.z.find((r) => r[0] === a.zone)!
    expect(row0[2]).toBe(-1)
    expect(row0[3]).toBe(0)
    // 隱形中的人也不算進活人數（死者在 zone 裡也看不到他）
    const visibleHere = ps.filter((p) => p.alive && g.mainOf(p)!.zone === a.zone && !g.mainOf(p)!.stats.stealth).length
    expect(row0[1]).toBe(visibleHere)
    // 看得到的攻擊
    g.emitFx({ k: 'atk', z: b.zone, x: b.x, y: b.y, x2: a.x, y2: a.y, e: b.id, e2: a.id })
    h.ticks(TPS + 1)
    const row = board(clientOf(cs, ps[5]))!.z.find((r) => r[0] === a.zone)!
    expect(row[2]).toBeGreaterThanOrEqual(Math.floor(g.time) - 2)
    expect(row[3]).toBeGreaterThan(0)
    expect(Math.abs(row[4] - (a.x + b.x) / 2)).toBeLessThanOrEqual(1)
    expect(Math.abs(row[5] - (a.y + b.y) / 2)).toBeLessThanOrEqual(1)
  })

  it('出局的人（死亡即退出）、旁觀者：前者沒有看板，後者開局就有', () => {
    const { h, cs, g, ps } = setup(5, { hostSpectate: true })
    h.leakWatch = true
    const host = g.players[0]
    expect(host.spectator).toBe(true)
    expect(board(cs[0])).toBeDefined()
    g.settings.bootOnDeath = true
    kill(g, ps[2])
    h.ticks(Math.ceil((LAST_WORDS + 2) * TPS))
    expect(ps[2].data.booted).toBe(true)
    expect(board(clientOf(cs, ps[2]))).toBeUndefined()
    expect(h.drainLeaks()).toEqual([])
  })
})

describe('亡靈預言', () => {
  it('驗證器：勝方三選一、主腦是合法槽位', () => {
    const ok = (m: Record<string, unknown>) => parseClientBytes(encode({ t: 'prophecy', ...m } as never))
    expect(ok({ win: 'xeno' })).toEqual({ t: 'prophecy', win: 'xeno' })
    expect(ok({ win: 'crew', mind: 3 })).toEqual({ t: 'prophecy', win: 'crew', mind: 3 })
    expect(ok({ win: 'draw' })).toBeNull()
    expect(ok({ win: 'xeno', mind: 99 })).toBeNull()
    expect(ok({ win: 'xeno', mind: '2' })).toBeNull()
    expect(ok({})).toBeNull()
  })

  it('只有死者能預言、只回給本人；最多改一次；結算時公開，猜中的是預言家', () => {
    const { h, cs, g, ps } = setup(6)
    h.leakWatch = true
    const seer = ps[2]
    const sc = clientOf(cs, seer)
    // 活人送預言：忽略
    clientOf(cs, ps[3]).send({ t: 'prophecy', win: 'crew' })
    h.ticks(2)
    expect(ps[3].data.proph).toBeUndefined()
    kill(g, seer)
    // 遺言時間內也不行
    sc.send({ t: 'prophecy', win: 'crew' })
    h.ticks(2)
    expect(seer.data.proph).toBeUndefined()
    h.ticks(Math.ceil((LAST_WORDS + 1) * TPS))
    expect(sc.me.proph).toBeNull()
    sc.send({ t: 'prophecy', win: 'crew', mind: ps[4].slot })
    h.ticks(2)
    expect(sc.me.proph).toMatchObject({ win: 'crew', mind: ps[4].slot, left: 1 })
    // 自己不能當主腦
    sc.send({ t: 'prophecy', win: 'xeno', mind: seer.slot })
    h.ticks(2)
    expect(sc.me.proph).toMatchObject({ win: 'crew', left: 1 })
    sc.send({ t: 'prophecy', win: 'xeno', mind: ps[1].slot })
    h.ticks(2)
    expect(sc.me.proph).toMatchObject({ win: 'xeno', mind: ps[1].slot, left: 0 })
    sc.send({ t: 'prophecy', win: 'mutant' })
    h.ticks(2)
    expect(sc.me.proph).toMatchObject({ win: 'xeno', left: 0 })
    expect(lines(sc)).toContain('@ghost8.proph.locked')
    // 活人什麼都沒收到（看板、預言、私訊）
    expect(h.drainLeaks()).toEqual([])
    for (const p of ps) if (p.alive) expect(lines(clientOf(cs, p)).some((t) => t.includes('ghost8'))).toBe(false)
    // 另一位死者猜錯
    const wrong = ps[3]
    kill(g, wrong)
    h.ticks(Math.ceil((LAST_WORDS + 1) * TPS))
    clientOf(cs, wrong).send({ t: 'prophecy', win: 'crew', mind: ps[4].slot })
    h.ticks(2)
    g.endGame('xeno')
    h.ticks(1)
    const end = cs[0].inbox.find((m): m is Extract<HostMsg, { t: 'end' }> => m.t === 'end')!.result as EndResult
    const a = end.prophecies!.find((x) => x.slot === seer.slot)!
    expect(a).toMatchObject({ win: 'xeno', mind: ps[1].slot, ok: true, mindOk: true, changed: true })
    const b = end.prophecies!.find((x) => x.slot === wrong.slot)!
    expect(b).toMatchObject({ win: 'crew', ok: false, mindOk: false, changed: false })
  })

  it('復活的人預言作廢（預言屬於亡者）', () => {
    const { h, cs, g, ps } = setup(5)
    const p = ps[2]
    kill(g, p)
    h.ticks(Math.ceil((LAST_WORDS + 1) * TPS))
    clientOf(cs, p).send({ t: 'prophecy', win: 'mutant' })
    h.ticks(2)
    expect(p.data.proph).toBeDefined()
    const at = g.mainOf(ps[3])!
    expect(g.revivePlayer(p.slot, { zone: at.zone, x: at.x + 1, y: at.y })).not.toBeNull()
    h.ticks(2)
    expect(p.data.proph).toBeUndefined()
  })
})

describe('亡者之眼（ghostSight）', () => {
  it('開眼時間晚於急救窗口與遺言', () => {
    expect(GHOST_DELAY).toBeGreaterThan(REVIVE_WINDOW)
    expect(GHOST_DELAY).toBeGreaterThan(LAST_WORDS)
  })

  /** 同一局（同種子、同動作）跑到死者開眼之後（全程 leakWatch）；before = 死後 30 秒（還沒開眼）死者看到的樣子 */
  function run(ghostSight: boolean) {
    const { h, cs, g, ps } = setup(6, { ghostSight })
    // 異形主腦換成匿名形態：活人、還沒開眼的死者都只看得到匿名單位
    const xm = g.mainOf(ps[1])!
    xm.anon = true
    const dead = ps[2]
    // 讓匿名異形和死者在同一個地點（死者觀戰時看得到）
    g.world.relocate(xm, g.mainOf(dead)!.zone, g.mainOf(dead)!.x + 2, g.mainOf(dead)!.y)
    h.ticks(2)
    for (const r of h.raw.values()) r.length = 0
    h.leakWatch = true
    kill(g, dead)
    const dc = clientOf(cs, dead)
    const before: { ghost?: number; o?: number; n?: string; gf?: string } = {}
    for (let i = 0; i < Math.ceil((GHOST_DELAY + 1.5) * TPS); i++) {
      h.ticks(1)
      if (i === Math.ceil(30 * TPS)) {
        const e = dc.ents.get(xm.id)
        Object.assign(before, { ghost: dc.me.ghost as number | undefined, o: e?.o, n: e?.n, gf: e?.gf })
      }
    }
    return { h, cs, g, ps, xm, dead, dc, before }
  }

  it('死者過了復活窗口才看見匿名形態的主人與真實陣營，同時永久不能再被喚回；關著時一切照舊', () => {
    const off = run(false)
    const on = run(true)
    // 兩局都沒有洩漏
    expect(off.h.leakProblems).toEqual([])
    expect(on.h.leakProblems).toEqual([])
    // 開眼前（死後 30 秒）：和一般死者一樣看不到匿名形態的主人
    expect(on.before.ghost).toBeGreaterThan(0)
    expect(on.before.o).toBe(-1)
    expect(on.before.n).toBe('')
    expect(on.before.gf).toBeUndefined()
    // 開眼後：看得見主人與真實陣營；永久不能再被喚回
    const e = on.dc.ents.get(on.xm.id)!
    expect(on.dc.me.ghost).toBe(0)
    expect(e.o).toBe(on.ps[1].slot)
    expect(e.n).toBe(on.xm.name)
    expect(e.gf).toBe('x')
    expect(on.dc.ents.get(on.g.mainOf(on.ps[3])!.id)?.gf).toBe('h')
    expect(on.dead.stayDead).toBe(true)
    expect(lines(on.dc)).toContain('@ghost8.eye.open')
    const at = on.g.mainOf(on.ps[3])!
    expect(on.g.revivePlayer(on.dead.slot, { zone: at.zone, x: at.x + 1, y: at.y })).toBeNull()
    // 睜眼之後主腦一看就知道：預言只收勝方，猜主腦被忽略
    on.dc.send({ t: 'prophecy', win: 'crew', mind: on.ps[1].slot })
    on.h.ticks(2)
    expect(on.dc.me.proph).toMatchObject({ win: 'crew', mind: -1, left: 1 })
    expect(on.h.drainLeaks()).toEqual([])
    // 關著時：死者照舊看不到主人，也照舊救得回來
    const e0 = off.dc.ents.get(off.xm.id)!
    expect(e0.o).toBe(-1)
    expect(e0.gf).toBeUndefined()
    expect('ghost' in off.dc.me).toBe(false)
    expect(off.dead.stayDead).toBe(false)
  })

  it('活人的快照逐位元組相同（不開 leakWatch，比對開局之後的每一則訊息，含第一份完整快照）', async () => {
    // 每一局都在全新的模組裡跑：有些模組層級的計數器（例如船艇 zone 的 key 編號）會跨局累加，同一個行程裡的兩局本來就不會逐位元組相同
    const go = async (ghostSight: boolean) => {
      vi.resetModules()
      const H = (await import('./helpers/harness')).Harness
      const dmg = (await import('../../src/sim/systems/damage')).damage
      const dec = (await import('../../src/shared/protocol/codec')).decode
      const { h, cs } = H.started(6, 8181, { eventMult: 0, ghostSight })
      const g = h.server.game!
      const ps = g.allPlayers()
      for (const p of ps) g.setRole(p, 'human')
      g.setRole(ps[1], 'xeno')
      for (const p of ps) {
        const u = g.mainOf(p)!
        u.inv?.fill(null)
        u.suit = null
        u.statsDirty = true
      }
      h.ticks(2)
      // 異形主腦換成匿名形態、走到死者旁邊
      const xm = g.mainOf(ps[1])!
      xm.anon = true
      const dead = ps[2]
      g.world.relocate(xm, g.mainOf(dead)!.zone, g.mainOf(dead)!.x + 2, g.mainOf(dead)!.y)
      h.ticks(2)
      dmg(g, null, g.mainOf(dead)!, 1e7, { pure: true })
      h.ticks(Math.ceil((GHOST_DELAY + 2) * TPS))
      // 死者在開眼後送 -slug：開著時被擋下（只私訊他本人），活人那邊什麼都不變
      cs.find((c) => c.slot === dead.slot)!.send({ t: 'chat', ch: 'all', text: '-slug' })
      h.ticks(Math.ceil(3 * TPS))
      // lobbyState 帶著大廳設定本身（ghostSight 是大家在大廳就看得到的公開設定，開局時還會再廣播一次名單），
      // start 帶這一局的隨機識別碼：這兩種之外，開局之後的每一則都要相同
      const out = new Map<number, Uint8Array[]>()
      for (const [peer, raws] of h.raw) {
        const slot = h.server.slotOfPeer(peer)
        if (slot === null || !g.players[slot].alive) continue
        const i = raws.findIndex((r) => (dec(r) as HostMsg).t === 'start')
        expect(i).toBeGreaterThanOrEqual(0)
        out.set(
          slot,
          raws.slice(i + 1).filter((r) => (dec(r) as HostMsg).t !== 'lobbyState'),
        )
      }
      const dc = cs.find((c) => c.slot === dead.slot)!
      return { out, g, dead, dc, xm }
    }
    const off = await go(false)
    const on = await go(true)
    expect([...on.out.keys()]).toEqual([...off.out.keys()])
    expect(on.out.size).toBe(5)
    for (const [slot, a] of off.out) {
      const b = on.out.get(slot)!
      // 每位活人約 50 秒 × 20 份快照，外加聊天、pong…
      expect(a.length).toBeGreaterThan(900)
      expect(b.length).toBe(a.length)
      for (let i = 0; i < a.length; i++) {
        if (Buffer.compare(Buffer.from(a[i]), Buffer.from(b[i])) !== 0) throw new Error(`slot${slot} 第 ${i} 則訊息不同`)
      }
    }
    // 對照：死者那邊確實不一樣（開著時看得見匿名異形的主人）
    expect(on.dc.ents.get(on.xm.id)?.gf).toBe('x')
    expect(off.dc.ents.get(off.xm.id)?.gf).toBeUndefined()
    // 開著時附身蛞蝓仔被擋下
    expect(lines(on.dc)).toContain('@ghost8.slugOff')
    expect(on.dead.control).toBe(0)
    expect(on.dead.data.slugUsed).toBeUndefined()
  }, 60000)

  it('只主持的旁觀者：開局就看得見真實陣營；活人看不到', () => {
    const { h, cs, g, ps } = setup(5, { hostSpectate: true, ghostSight: true })
    h.leakWatch = true
    h.ticks(4)
    expect(cs[0].me.ghost).toBe(0)
    const xm = g.mainOf(ps[1])!
    // 旁觀者看的 zone 換到異形那裡
    cs[0].send({ t: 'cmd', seq: 1, c: { k: 'spec', s: xm.zone } })
    h.ticks(3)
    expect(cs[0].ents.get(xm.id)?.gf).toBe('x')
    for (const p of ps) for (const e of clientOf(cs, p).ents.values()) expect(e.gf).toBeUndefined()
    expect(h.drainLeaks()).toEqual([])
  })
})
