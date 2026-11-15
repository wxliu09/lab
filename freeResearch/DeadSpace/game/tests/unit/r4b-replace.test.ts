// 第 4 輪：開局早退補位（原作 j6 17042–17083）。離開的時刻以斷線當下計；寬限內回來不補；只私訊補位者
import { afterEach, describe, expect, it } from 'vitest'
import { Harness, type FakeClient } from './helpers/harness'
import { RECONNECT_GRACE_S } from '../../src/shared/constants'
import { REPLACE_WINDOW_S, replaceCandidates } from '../../src/sim/systems/replace'
import type { Game, GamePlayer, Role } from '../../src/sim/game'
import { hasString, lang, sysText } from '../../src/ui/i18n'
import '../../src/ui/strings/sim6'
import '../../src/ui/strings/sim7'

const SEC = 20
const lines = (c: FakeClient) => c.inbox.flatMap((m) => (m.t === 'chat' ? m.lines.map((l) => l.text) : []))
const sysLines = (c: FakeClient) => c.inbox.flatMap((m) => (m.t === 'chat' ? m.lines.filter((l) => l.ch === 'sys').map((l) => l.text) : []))

afterEach(() => {
  lang.value = 'zh'
})

/** n 名真人（可加 AI）；cs[1] 是指定身分的離開者，其他人都是人類 */
function setup(n: number, role: Role = 'xeno', settings: Record<string, unknown> = {}) {
  const { h, cs } = Harness.started(n, 4242, { eventMult: 0, npcCrew: 0, ...settings })
  const g = h.server.game!
  for (const p of g.allPlayers()) g.setRole(p, 'human')
  const leaver = g.players[cs[1].slot]!
  g.setRole(leaver, role)
  h.ticks(2)
  return { h, cs, g, leaver }
}

const masters = (g: Game, role: Role, except?: GamePlayer) => g.allPlayers().filter((p) => p !== except && p.role === role && !p.spawnOf)

describe('開局早退補位', () => {
  it('開局 20 秒斷線、寬限逾時：從人類抽一位補上異形；只有他收到私訊，別人只看到不點名的公告', () => {
    const { h, cs, g, leaver } = setup(5)
    leaver.ep = 123
    h.ticks(18 * SEC)
    expect(g.time).toBeLessThan(25)
    h.server.onLeave(cs[1].peer)
    h.ticks(30 * SEC)
    // 寬限期間還沒補
    expect(masters(g, 'xeno', leaver)).toEqual([])
    for (const c of cs) c.inbox.length = 0
    h.leakWatch = true
    h.ticks((RECONNECT_GRACE_S - 30 + 2) * SEC)
    expect(leaver.left).toBe(true)
    const news = masters(g, 'xeno')
    expect(news.length).toBe(1)
    const q = news[0]
    expect(q).not.toBe(leaver)
    expect(g.faction(leaver)).toBe('crew')
    expect(leaver.data.leftRole).toBe('xeno')
    // 補位者：拿到變身技能（修正原作缺陷）、接手 EP
    expect(g.mainOf(q)!.abilities).toContain('xeno.form')
    expect(q.ep).toBeGreaterThanOrEqual(123)
    expect(leaver.ep).toBe(0)
    const qc = cs.find((c) => c.slot === q.slot)!
    expect(lines(qc)).toContain('@replace.you.xeno')
    expect(qc.me.role).toBe('xeno')
    const others = cs.filter((c) => c !== qc && c !== cs[1])
    for (const c of others) {
      expect(lines(c)).toContain('@replace.xeno')
      expect(lines(c).some((x) => x.includes('replace.you'))).toBe(false)
      expect(c.me.role).toBe('human')
    }
    // 所有沒被抽中的人收到的系統公告完全相同（沒有任何一則只發給某些人）
    const ref = sysLines(others[0])
    for (const c of others) expect(sysLines(c)).toEqual(ref)
    // 公告順序：離開（點名）→ 異形死亡 → 有人接任
    const i = ref.findIndex((x) => x.startsWith('@sys.left|'))
    expect(ref.slice(i, i + 3)).toEqual([`@sys.left|name=${leaver.baseName}`, '@death.xeno', '@replace.xeno'])
    expect(h.drainLeaks()).toEqual([])
    // -status 跟著公告回到「還活著」；對局沒有因為原本的異形死了就結束
    h.leakWatch = false
    cs[2].inbox.length = 0
    cs[2].send({ t: 'chat', ch: 'all', text: '-status' })
    h.ticks(5 * SEC)
    expect(lines(cs[2])).toContain('@chat.status.bothAlive')
    expect(g.ended).toBeNull()
    // 結算：離開者顯示原本的身分；時間軸記下誰接任
    g.endGame('crew')
    expect(g.ended!.players.find((x) => x.slot === leaver.slot)!.role).toBe('xeno')
    expect(g.ended!.players.find((x) => x.slot === q.slot)!.role).toBe('xeno')
    expect(g.ended!.timeline.some((e) => e.text.startsWith('@tl.replace.xeno|name='))).toBe(true)
  })

  it('離開的時刻以斷線當下計：60 秒斷線、150 秒才判定離開，照樣補位（變種人）', () => {
    const { h, cs, g, leaver } = setup(4, 'mutant')
    h.ticks(58 * SEC)
    h.server.onLeave(cs[1].peer)
    h.ticks((RECONNECT_GRACE_S + 2) * SEC)
    expect(g.time).toBeGreaterThan(REPLACE_WINDOW_S + 50)
    const news = masters(g, 'mutant')
    expect(news.length).toBe(1)
    expect(news[0]).not.toBe(leaver)
    expect(g.mainOf(news[0])!.abilities).toContain('mut.devour')
    expect(lines(cs[0])).toContain('@replace.mutant')
  })

  it('仿生人也補位', () => {
    const { h, cs, g, leaver } = setup(4, 'android')
    // 留一個異類，讓對局不會因為沒有異類而結束
    g.setRole(g.players[cs[3].slot]!, 'xeno')
    h.server.onLeave(cs[1].peer)
    h.ticks((RECONNECT_GRACE_S + 2) * SEC)
    const news = g.allPlayers().filter((p) => p !== leaver && p.role === 'android')
    expect(news.length).toBe(1)
    expect(news[0].slot).not.toBe(cs[3].slot)
    expect(lines(cs[3])).toContain('@replace.android')
  })

  it('寬限內回來：不補位', () => {
    const { h, cs, g, leaver } = setup(4)
    h.ticks(3 * SEC)
    h.server.onLeave(cs[1].peer)
    h.ticks(25 * SEC)
    h.connect('p1')
    h.ticks((RECONNECT_GRACE_S + 30) * SEC)
    expect(leaver.left).toBe(false)
    expect(leaver.role).toBe('xeno')
    expect(masters(g, 'xeno')).toEqual([leaver])
    for (const c of cs) expect(lines(c).some((x) => x.startsWith('@replace.'))).toBe(false)
    // 回來之後（已經過了 90 秒）再斷線並逾時：這次離開的時刻在 90 秒之後，不補
    h.server.onLeave(h.clients.get('peer-p1')!.peer)
    h.ticks((RECONNECT_GRACE_S + 2) * SEC)
    expect(leaver.left).toBe(true)
    expect(masters(g, 'xeno', leaver)).toEqual([])
  })

  it('90 秒後才斷線：不補位（照常公告離開與死亡）', () => {
    const { h, cs, g, leaver } = setup(4)
    h.ticks((REPLACE_WINDOW_S + 1) * SEC)
    expect(g.time).toBeGreaterThan(REPLACE_WINDOW_S)
    h.server.onLeave(cs[1].peer)
    h.ticks((RECONNECT_GRACE_S + 2) * SEC)
    expect(leaver.left).toBe(true)
    expect(masters(g, 'xeno', leaver)).toEqual([])
    expect(lines(cs[0])).toContain('@death.xeno')
    for (const c of cs) expect(lines(c).some((x) => x.startsWith('@replace.'))).toBe(false)
  })

  it('寬限期間身體被打死：不補位（船員確實殺了異形）', () => {
    const { h, cs, g, leaver } = setup(4)
    // 留一個變種人：異形死了對局也不會結束（確定是「已經死了」才不補，不是因為對局結束）
    g.setRole(g.players[cs[3].slot]!, 'mutant')
    h.server.onLeave(cs[1].peer)
    h.ticks(10 * SEC)
    g.killEnt(g.mainOf(leaver)!, null, -1)
    expect(leaver.alive).toBe(false)
    h.ticks((RECONNECT_GRACE_S - 8) * SEC)
    expect(leaver.left).toBe(true)
    expect(g.ended).toBeNull()
    expect(masters(g, 'xeno', leaver)).toEqual([])
    for (const c of cs) expect(lines(c).some((x) => x.startsWith('@replace.'))).toBe(false)
  })

  it('候選人：活著、在線、人類方、不是仿生人；占玩家席位的 AI 也算；沒有人可補時公告不點名', () => {
    const { h, cs, g, leaver } = setup(4, 'xeno', { bots: 2 })
    const ps = g.allPlayers()
    const bots = ps.filter((p) => p.bot)
    expect(bots.length).toBe(2)
    const [dead, off, andr] = [g.players[cs[0].slot]!, g.players[cs[2].slot]!, g.players[cs[3].slot]!]
    g.killEnt(g.mainOf(dead)!, null, -1)
    expect(dead.alive).toBe(false)
    h.server.onLeave(cs[2].peer)
    g.setRole(andr, 'android')
    g.setRole(bots[1], 'mutant')
    h.ticks(2)
    const cands = replaceCandidates(g, leaver)
    expect(cands).toEqual([bots[0]])
    void off
    // 沒有候選人
    g.setRole(bots[0], 'mutant')
    for (const c of cs) c.inbox.length = 0
    h.server.onLeave(cs[1].peer)
    h.ticks((RECONNECT_GRACE_S + 2) * SEC)
    expect(lines(cs[3])).toContain('@replace.none.xeno')
    expect(masters(g, 'xeno', leaver)).toEqual([])
  })

  it('字串兩種語言都有（補位的 key 是依身分組出來的，i18n 完整性測試抓不到）', () => {
    const keys = ['xeno', 'mutant', 'android'].flatMap((r) => [`replace.${r}`, `replace.none.${r}`, `replace.you.${r}`, `tl.replace.${r}`])
    for (const k of keys) expect([k, hasString('zh', k), hasString('en', k)]).toEqual([k, true, true])
    expect(sysText('@replace.xeno')).not.toMatch(/\{/)
    lang.value = 'en'
    expect(sysText('@tl.replace.xeno|name=Dr. Bob')).toBe('Dr. Bob took over as the xeno (the original xeno left early)')
    expect(sysText('@replace.you.mutant')).not.toMatch(/[一-鿿]/)
  })
})
