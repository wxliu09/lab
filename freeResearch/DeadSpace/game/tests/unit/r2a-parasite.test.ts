// 第 2 輪（人類玩家視角審查，sim 端）：被寄生時只給受害者本人一行說明（會怎樣、怎麼壓制），每次感染只說一次；
// 會不會轉化依受害者自己的身分（人類方才會變成異形的眷屬，仿生人、變種人不會）
import { describe, expect, it } from 'vitest'
import { Harness, type FakeClient } from './helpers/harness'
import { abilityDef } from '../../src/shared/content/registry'
import { runEffects, SCRIPTS } from '../../src/sim/systems/effects'
import { hasBuff } from '../../src/sim/systems/buffs'
import { lang, sysText } from '../../src/ui/i18n'
import '../../src/ui/strings/sim6'
import type { Ent } from '../../src/sim/ent'
import type { Game, GamePlayer } from '../../src/sim/game'

function chatOf(c: FakeClient): string[] {
  const out: string[] = []
  for (const m of c.inbox) if (m.t === 'chat') for (const l of m.lines) out.push(l.text)
  return out
}

const clientOf = (h: Harness, p: GamePlayer): FakeClient =>
  [...h.clients.values()].find((c) => c.slot === p.slot)!

/** 異形（p0）對 victim 施放寄生（照技能本身的效果：掛寄生 buff → 感染統計腳本）*/
function implant(g: Game, xeno: Ent, victim: Ent): void {
  const ab = abilityDef('xeno.parasite')!
  runEffects(
    g,
    { caster: xeno, target: victim, x: victim.x, y: victim.y, zone: victim.zone, ability: ab },
    ab.effects,
  )
}

function setup(seed: number) {
  const { h } = Harness.started(4, seed, { eventMult: 0 })
  const g = h.server.game!
  const ps = g.allPlayers()
  g.setRole(ps[0], 'xeno')
  for (const p of ps.slice(1)) g.setRole(p, 'human')
  for (const p of ps) g.mainOf(p)!.suit = null
  h.ticks(1)
  for (const c of h.clients.values()) c.inbox.length = 0
  const lines = (p: GamePlayer) => {
    const out = chatOf(clientOf(h, p)).filter((l) => l.startsWith('@infect.'))
    return out
  }
  const flush = () => {
    h.ticks(1)
    const all = new Map(ps.map((p) => [p.slot, lines(p)]))
    for (const c of h.clients.values()) c.inbox.length = 0
    return all
  }
  return { h, g, ps, flush }
}

describe('寄生的說明（只給受害者）', () => {
  it('人類被寄生：只有他收到 infect.parasite（會變成眷屬、用抗體包壓制）；刷新不重講', () => {
    const { g, ps, flush } = setup(91)
    const x = g.mainOf(ps[0])!
    const v = g.mainOf(ps[1])!
    implant(g, x, v)
    expect(hasBuff(v, 'bf.parasite')).toBe(true)
    const got = flush()
    expect(got.get(ps[1].slot)).toEqual(['@infect.parasite'])
    for (const p of [ps[0], ps[2], ps[3]]) expect(got.get(p.slot)).toEqual([])
    lang.value = 'zh'
    const zh = sysText('@infect.parasite')
    for (const w of ['寄生', '4.4', '眷屬', '抗體包', '醫療補給', '46 秒']) expect(zh).toContain(w)
    lang.value = 'en'
    const en = sysText('@infect.parasite')
    for (const w of ['parasite', '4.4', 'xeno spawn', 'Antibody Kit', 'Medical Supplies', '46 s'])
      expect(en).toContain(w)
    lang.value = 'zh'
    // 同一份寄生再被施放（刷新）：不再說
    implant(g, x, v)
    expect(flush().get(ps[1].slot)).toEqual([])
  })

  it('用抗體包壓制、免疫期過了之後再被寄生：是新的一次，再說一次', () => {
    const { h, g, ps, flush } = setup(92)
    const x = g.mainOf(ps[0])!
    const v = g.mainOf(ps[1])!
    implant(g, x, v)
    expect(flush().get(ps[1].slot)).toEqual(['@infect.parasite'])
    SCRIPTS.get('item.antibody')!(g, { caster: v, target: v, x: v.x, y: v.y, zone: v.zone } as never, {})
    expect(hasBuff(v, 'bf.parasite')).toBe(false)
    expect(hasBuff(v, 'bf.containedParasite')).toBe(true)
    // 屬性（免疫）在下一個 tick 重算
    flush()
    // 免疫期內：寄生不上、不說
    implant(g, x, v)
    expect(hasBuff(v, 'bf.parasite')).toBe(false)
    expect(flush().get(ps[1].slot)).toEqual([])
    h.ticks(20 * 47)
    for (const c of h.clients.values()) c.inbox.length = 0
    expect(hasBuff(v, 'bf.containedParasite')).toBe(false)
    implant(g, x, v)
    expect(hasBuff(v, 'bf.parasite')).toBe(true)
    expect(flush().get(ps[1].slot)).toEqual(['@infect.parasite'])
  })

  it('仿生人、變種人被寄生：說「不會變成眷屬」的版本（依本人身分，本人本來就知道）', () => {
    const { g, ps, flush } = setup(93)
    g.setRole(ps[2], 'android')
    g.setRole(ps[3], 'mutant')
    const x = g.mainOf(ps[0])!
    implant(g, x, g.mainOf(ps[2])!)
    implant(g, x, g.mainOf(ps[3])!)
    const got = flush()
    expect(got.get(ps[2].slot)).toEqual(['@infect.parasiteNoTurn'])
    expect(got.get(ps[3].slot)).toEqual(['@infect.parasiteNoTurn'])
    expect(got.get(ps[1].slot)).toEqual([])
  })

  it('不是玩家本人（分身、NPC）被寄生：沒有人收到說明', () => {
    const { g, ps, flush } = setup(94)
    const x = g.mainOf(ps[0])!
    const v = g.mainOf(ps[1])!
    // 玩家的非主單位（例如全像分身之類）
    const dup = g.world.spawn(v.def, v.zone, v.x + 1, v.y, ps[1].slot)
    implant(g, x, dup)
    const got = flush()
    for (const p of ps) expect(got.get(p.slot)).toEqual([])
  })
})
