// 第 5 輪：指令用名字找人（-add／-remove／-votekick／-liquidate）。
// 完全相符（正規化後）優先；只有片段相符而且多於一人時，私訊列出候選人、不執行；只比對別人眼中的顯示名字
import { afterEach, describe, expect, it } from 'vitest'
import { Harness, type FakeClient } from './helpers/harness'
import { lookupPlayer } from '../../src/sim/systems/chat'
import { lang, sysText } from '../../src/ui/i18n'
import '../../src/ui/strings/sim6'
import '../../src/ui/strings/sim7'
import type { GamePlayer } from '../../src/sim/game'

const SEC = 20
const lines = (c: FakeClient): string[] => c.inbox.flatMap((m) => (m.t === 'chat' ? m.lines.map((l) => l.text) : []))

afterEach(() => {
  lang.value = 'zh'
})

/** 4 人局，名字改成 Hana／hana2／Bob（host 留原名）；都是人類 */
function setup(n = 4) {
  const { h, cs } = Harness.started(n, 4242, { eventMult: 0, npcCrew: 0 })
  const g = h.server.game!
  const ps = g.allPlayers()
  for (const p of ps) g.setRole(p, 'human')
  const rename = (p: GamePlayer, nn: string) => {
    const cls = p.name.slice(0, p.name.length - p.baseName.length)
    p.baseName = nn
    p.name = cls + nn
    g.mainOf(p)!.name = p.name
  }
  rename(ps[1], 'Hana')
  rename(ps[2], 'hana2')
  if (ps[3]) rename(ps[3], 'Bob')
  h.ticks(2)
  return { h, cs, g, ps }
}

function say(h: Harness, c: FakeClient, text: string): string[] {
  c.inbox.length = 0
  c.send({ t: 'chat', ch: 'all', text } as never)
  h.ticks(1.6 * SEC)
  return lines(c)
}

describe('lookupPlayer：完全相符優先、片段相符多於一人不猜', () => {
  it('hana → Hana（完全相符，不管大小寫）；hana2 → hana2；han → 兩位候選人；顏色名照舊', () => {
    const { g, ps } = setup()
    expect(lookupPlayer(g, 'hana')).toEqual({ one: ps[1] })
    expect(lookupPlayer(g, 'HANA')).toEqual({ one: ps[1] })
    expect(lookupPlayer(g, 'hana2')).toEqual({ one: ps[2] })
    const many = lookupPlayer(g, 'han')
    expect(many && 'many' in many ? many.many.map((p) => p.slot).sort() : []).toEqual([ps[1].slot, ps[2].slot].sort())
    // 只有一位包含片段：直接找到
    expect(lookupPlayer(g, 'bo')).toEqual({ one: ps[3] })
    expect(lookupPlayer(g, 'nobody')).toBeNull()
    expect(lookupPlayer(g, '')).toBeNull()
    // 照畫面上的全名（中文職業前綴、en 顯示名字）也算完全相符
    expect(lookupPlayer(g, ps[1].name)).toEqual({ one: ps[1] })
    expect(lookupPlayer(g, '博士·Hana')).toEqual({ one: ps[1] })
  })

  it('只比對別人眼中的名字：通訊病毒換過名字後，用真名找不到人', () => {
    const { g, ps } = setup()
    // 模擬病毒：Hana 的顯示用本名換成 Zed（真名還是 Hana）
    const cls = ps[1].name.slice(0, ps[1].name.length - ps[1].baseName.length)
    ps[1].data.shownBase = 'Zed'
    ps[1].name = cls + 'Zed'
    expect(lookupPlayer(g, 'zed')).toEqual({ one: ps[1] })
    // 「hana」只剩 hana2 包含：真名 Hana 不參與比對
    expect(lookupPlayer(g, 'hana')).toEqual({ one: ps[2] })
  })
})

describe('指令遇到同時符合多人的名字：私訊候選人、不執行', () => {
  it('-add：hana 加到 Hana；han 不加任何人、只給下指令的人列出候選人', () => {
    const { h, cs, g, ps } = setup()
    say(h, cs[0], '-creategroup g1')
    for (const c of cs) c.inbox.length = 0
    say(h, cs[0], '-add g1 hana')
    expect(lines(cs[1]).some((x) => x.startsWith('@chat.addedToGroup'))).toBe(true)
    expect(lines(cs[2]).some((x) => x.startsWith('@chat.addedToGroup'))).toBe(false)
    for (const c of cs) c.inbox.length = 0
    const out = say(h, cs[0], '-add g1 han')
    const amb = out.find((x) => x.startsWith('@chat.ambiguous'))!
    expect(amb).toContain('q=han')
    expect(amb).toContain(ps[1].name)
    expect(amb).toContain(ps[2].name)
    expect(amb).not.toContain(ps[3].name)
    // 不執行：hana2 沒有被加進群組，也沒收到任何通知；其他人收不到候選名單
    expect(lines(cs[2]).some((x) => x.startsWith('@chat.addedToGroup'))).toBe(false)
    for (const c of cs.slice(1)) expect(lines(c).some((x) => x.startsWith('@chat.ambiguous'))).toBe(false)
    expect(out.some((x) => x.startsWith('@chat.groupList'))).toBe(false)
    // 完整名字：照常加入
    say(h, cs[0], '-add g1 hana2')
    const list = say(h, cs[0], '-list g1').find((x) => x.startsWith('@chat.groupMembers'))!
    expect(list).toContain(ps[2].name)
    void g
  })

  it('-remove 與 -votekick 一樣不猜', () => {
    const { h, cs, g, ps } = setup()
    say(h, cs[0], '-creategroup g1')
    say(h, cs[0], '-add g1 hana')
    say(h, cs[0], '-add g1 hana2')
    expect(say(h, cs[0], '-remove g1 han').some((x) => x.startsWith('@chat.ambiguous'))).toBe(true)
    const members = say(h, cs[0], '-list g1').find((x) => x.startsWith('@chat.groupMembers'))!
    expect(members).toContain(ps[1].name)
    expect(members).toContain(ps[2].name)
    // -votekick：兩位候選人都死了，片段相符也不投
    for (const p of [ps[1], ps[2]]) g.killEnt(g.mainOf(p)!, null, -1)
    h.ticks(2)
    const out = say(h, cs[3], '-votekick han')
    expect(out.some((x) => x.startsWith('@chat.ambiguous'))).toBe(true)
    expect(out.some((x) => x.startsWith('@vote.kickLeft'))).toBe(false)
    expect(ps[1].data.deadMuted || ps[2].data.deadMuted).toBeFalsy()
  })

  it('-liquidate：片段對到多人不清除；完整名字清除自己的眷屬', () => {
    const { h, cs, g, ps } = setup()
    g.setRole(ps[0], 'xeno')
    ps[1].spawnOf = 'xeno'
    ps[2].spawnOf = 'xeno'
    h.ticks(2)
    expect(say(h, cs[0], '-l han').some((x) => x.startsWith('@chat.ambiguous'))).toBe(true)
    expect(ps[1].alive && ps[2].alive).toBe(true)
    say(h, cs[0], '-l hana2')
    h.ticks(2)
    expect(ps[2].alive).toBe(false)
    expect(ps[1].alive).toBe(true)
  })

  it('候選名單兩種語言都有、依名字排序', () => {
    const { h, cs } = setup()
    say(h, cs[0], '-creategroup g1')
    const amb = say(h, cs[0], '-add g1 han').find((x) => x.startsWith('@chat.ambiguous'))!
    expect(sysText(amb)).toMatch(/^「han」符合不只一位玩家：.+、.+。/)
    lang.value = 'en'
    expect(sysText(amb)).toMatch(/^"han" matches more than one player: .+, .+\. Nothing was done/)
    const lz = amb.split('|lz=')[1].split('|')[0].split('、')
    expect([...lz].sort()).toEqual(lz)
  })
})
