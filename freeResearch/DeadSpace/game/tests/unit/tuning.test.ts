import { describe, expect, it } from 'vitest'
import { Harness, type FakeClient } from './helpers/harness'
import { checkMessages } from './helpers/leak'
import { decodeMeta, makeTool, sha256hex, H } from '../../src/client/devtoolsCore'
import { unitDef } from '../../src/shared/content/registry'
import type { HostMsg } from '../../src/shared/protocol/messages'

function code(name: string): string {
  return decodeMeta().cmds.find((c) => c[0] === name)![1]
}

function tune(c: FakeClient, name: string, args: unknown[] = [], id = 1): void {
  c.send({ t: 'Tune', id, op: code(name), args })
}

function results(c: FakeClient): Extract<HostMsg, { t: 'TuneResult' }>[] {
  return c.inbox.filter((m): m is Extract<HostMsg, { t: 'TuneResult' }> => m.t === 'TuneResult')
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

describe('除錯指令執行層', () => {
  it('結果只回給發送者，其他人收不到任何東西', () => {
    const { h, cs } = Harness.started(4, 5)
    h.ticks(2)
    const before = cs.map((c) => c.inbox.length)
    tune(cs[2], 'players')
    tune(cs[2], 'status', [], 2)
    h.ticks(1)
    expect(results(cs[2]).length).toBe(2)
    expect(results(cs[2])[0].ok).toBe(true)
    for (const [i, c] of cs.entries()) if (i !== 2) expect(results(c).length).toBe(0)
    // 其他人只收到正常快照
    for (const [i, c] of cs.entries()) if (i !== 2) expect(c.inbox.slice(before[i]).every((m) => m.t === 'snap' || m.t === 'chat')).toBe(true)
  })

  it('主機與一般玩家都能用；格式錯誤不會讓 server 崩潰', () => {
    const { h, cs } = Harness.started(3, 6)
    tune(cs[0], 'ep', [100, 'me'])
    tune(cs[1], 'ep', [50, 'me'], 2)
    cs[1].send({ t: 'Tune', id: 3, op: 'zz', args: [] })
    cs[1].send({ t: 'Tune', id: 4, op: code('give'), args: [123, 'x', 'y'] })
    cs[1].send({ t: 'Tune', id: 5, op: code('tp'), args: [null, null] })
    h.ticks(1)
    const g = h.server.game!
    expect(g.players[cs[0].slot].ep).toBeGreaterThanOrEqual(100)
    expect(g.players[cs[1].slot].ep).toBeGreaterThanOrEqual(50)
    expect(results(cs[1]).filter((r) => !r.ok).length).toBe(3)
  })

  it('每位 peer 每秒最多 10 次', () => {
    const { h, cs } = Harness.started(2, 7)
    for (let i = 0; i < 30; i++) tune(cs[1], 'status', [], 100 + i)
    h.ticks(1)
    expect(results(cs[1]).length).toBeLessThanOrEqual(11)
  })

  it('who 比對到多人時列出候選並中止', () => {
    const h = new Harness(8)
    const host = h.connect('Alex', true)
    h.connect('Alexa')
    h.connect('Bob')
    host.send({ t: 'start' })
    h.ticks(2)
    tune(host, 'heal', ['ale'])
    h.ticks(1)
    const r = results(host)[0]
    expect(r.ok).toBe(false)
    expect(r.msg).toContain('many')
  })

  it('全域效果：暫停／時間倍率看起來與正常一樣（沒有歸屬）', () => {
    const { h, cs } = Harness.started(3, 9)
    tune(cs[1], 'pause')
    h.ticks(2)
    const g = h.server.game!
    expect(g.paused).toBe(true)
    const chats = cs[0].inbox.filter((m) => m.t === 'chat')
    expect(chats.length).toBe(0)
    tune(cs[1], 'resume', [], 2)
    tune(cs[1], 'timeScale', [2], 3)
    h.ticks(2)
    expect(g.paused).toBe(false)
    expect(g.timeScale).toBe(2)
  })
})

describe('資訊放寬只影響使用者本人', () => {
  it('沒用的人拿不到額外資訊；用了的人額外資訊只在自己身上', () => {
    const { h, cs } = Harness.started(6, 21)
    const g = h.server.game!
    const x = g.allPlayers().find((p) => p.role === 'xeno')!
    const user = cs.find((c) => c.slot !== x.slot)!
    tune(user, 'mapHack', [true])
    tune(user, 'hear', [true], 2)
    tune(user, 'xray', [true], 3)
    // 在使用者旁邊放一個匿名單位
    const um = g.mainOf(g.players[user.slot])!
    const e = g.world.spawn(unitDef('personnel'), um.zone, um.x + 1, um.y, x.slot)
    e.anon = true
    h.ticks(3)
    // 死者聊天
    const dead = g.allPlayers().find((p) => p.slot !== user.slot && p.slot !== x.slot)!
    g.killEnt(g.mainOf(dead)!, null, -1)
    h.ticks(20 * 5)
    const dc = cs.find((c) => c.slot === dead.slot)!
    dc.send({ t: 'chat', ch: 'dead', text: 'boo' })
    h.ticks(2)
    expect(scan(h)).toEqual([])
    // 使用者看得到匿名單位擁有者、收到死者聊天
    const seen = user.ents.get(e.id)
    expect(seen?.o).toBe(x.slot)
    const got = user.inbox.filter((m) => m.t === 'chat').flatMap((m) => (m.t === 'chat' ? m.lines : []))
    expect(got.some((l) => l.text === 'boo')).toBe(true)
    // 其他活人看不到
    for (const c of cs) {
      if (c === user || c.slot === x.slot || c.slot === dead.slot) continue
      const s = c.ents.get(e.id)
      if (s) expect(s.o).toBe(-1)
      const lines = c.inbox.filter((m) => m.t === 'chat').flatMap((m) => (m.t === 'chat' ? m.lines : []))
      expect(lines.some((l) => l.text === 'boo')).toBe(false)
      expect(results(c).length).toBe(0)
    }
  })
})

describe('主控台核心', () => {
  function fakeConsole() {
    const lines: string[] = []
    return {
      lines,
      c: {
        log: (...a: unknown[]) => void lines.push(a.map(String).join(' ')),
        table: (d: unknown) => void lines.push('table:' + JSON.stringify(d)),
        group: (...a: unknown[]) => void lines.push('group:' + a.map(String).join(' ')),
        groupEnd: () => void lines.push('end'),
      } as unknown as Console,
    }
  }

  it('暗號只以雜湊存放', async () => {
    expect(H).toMatch(/^[0-9a-f]{64}$/)
    const phrase = Buffer.from('d3hsaXUwOQ==', 'base64').toString()
    expect(await sha256hex(phrase)).toBe(H)
  })

  it('help() 與 --help 都會印出說明，help 寫不回去', () => {
    const { lines, c } = fakeConsole()
    const tool = makeTool({ remote: async () => ({ ok: true, msg: 'ok' }), isHost: () => true, local: () => null, onLock: () => {}, console: c })
    const target: Record<string, unknown> = {}
    expect(target.help).toBeUndefined()
    tool.define(target)
    ;(target.help as () => void)()
    expect(lines.some((l) => l.startsWith('group:'))).toBe(true)
    lines.length = 0
    // --help：觸發 toPrimitive，再寫回（setter 忽略）
    const obj = target as { help: unknown }
    let h2: unknown = obj.help
    h2 = (h2 as number) - 1
    obj.help = h2
    expect(lines.some((l) => l.startsWith('group:'))).toBe(true)
    expect(typeof obj.help).toBe('function')
    lines.length = 0
    ;(target.help as (n: string) => void)('give')
    expect(lines.some((l) => l.includes('xc.give('))).toBe(true)
    tool.remove(target)
    expect(target.help).toBeUndefined()
    expect(target.xc).toBeUndefined()
  })

  it('非主機的指令先顯示傳送中', async () => {
    const { lines, c } = fakeConsole()
    const tool = makeTool({ remote: async () => ({ ok: false, msg: 'bad' }), isHost: () => false, local: () => null, onLock: () => {}, console: c })
    const target: Record<string, unknown> = {}
    tool.define(target)
    await (target.xc as Record<string, (...a: unknown[]) => Promise<unknown>>).heal('me')
    expect(lines[0]).toContain(decodeMeta().sending)
    expect(lines.some((l) => l.includes('heal: bad'))).toBe(true)
  })
})
