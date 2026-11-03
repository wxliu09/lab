// 介面文字（UI 審查第 1 輪）：結算時間軸走 i18n、英文用語統一、單複數、分隔符號、出局者的死亡訊息
import { afterEach, describe, expect, it } from 'vitest'
import { Harness } from './helpers/harness'
import { damage } from '../../src/sim/systems/damage'
import { LAST_WORDS } from '../../src/sim/systems/chat'
import { FORMS, UNITS } from '../../src/shared/content/registry'
import { hasString, lang, listJoin, stringKeys, sysText, t } from '../../src/ui/i18n'
import type { ChatLine, HostMsg } from '../../src/shared/protocol/messages'

afterEach(() => {
  lang.value = 'zh'
})

function setup(boot = false) {
  const { h, cs } = Harness.started(3, 4242, { eventMult: 0 })
  const g = h.server.game!
  const ps = g.allPlayers()
  for (const p of ps) g.setRole(p, 'human')
  g.settings.bootOnDeath = boot
  for (const p of ps.slice(1)) {
    const u = g.mainOf(p)!
    u.inv?.fill(null)
    u.suit = null
    u.statsDirty = true
  }
  h.ticks(2)
  return { h, g, ps, cs }
}

const chatTexts = (inbox: HostMsg[]): string[] => inbox.flatMap((m) => (m.t === 'chat' ? m.lines.map((l: ChatLine) => l.text) : []))

describe('結算時間軸', () => {
  it('sim 的時間軸只存 key＋參數，兩種語言都翻得出來，不含寫死的中文', () => {
    const { h, g, ps } = setup()
    damage(g, null, g.mainOf(ps[1])!, 1e6, { pure: true })
    h.ticks(4)
    const form = [...FORMS.values()].find((f) => f.faction === 'mutant')!
    // 進化的紀錄：形態名稱用 UNITS 的名稱（不是 form id）
    g.log('@tl.evolve|name=CEO Bob|unit=' + form.unit)
    g.endGame('crew')
    const tl = g.ended!.timeline
    expect(tl.length).toBeGreaterThanOrEqual(2)
    for (const e of tl) {
      expect(/[一-鿿]/.test(e.text)).toBe(false)
      const key = e.text.startsWith('@') ? e.text.slice(1).split('|')[0] : e.text
      expect([key, hasString('zh', key), hasString('en', key)]).toEqual([key, true, true])
    }
    expect(tl.some((e) => e.text.startsWith('@tl.death.crew|name='))).toBe(true)
    const evo = tl.find((e) => e.text.startsWith('@tl.evolve'))!.text
    const uz = UNITS.get(form.unit)!.name
    expect(sysText(evo)).toBe(`CEO Bob 進化為${uz.zh}`)
    lang.value = 'en'
    expect(sysText(evo)).toBe(`CEO Bob evolved into ${uz.en}`)
    expect(sysText(evo)).not.toContain(form.id)
  })
})

describe('出局者的死亡訊息', () => {
  it('死亡即退出時不會叫他留下來觀戰；一般模式照舊', () => {
    for (const boot of [true, false]) {
      const { h, g, ps, cs } = setup(boot)
      const c = cs.find((x) => x.slot === ps[1].slot)!
      c.inbox.length = 0
      damage(g, null, g.mainOf(ps[1])!, 1e6, { pure: true })
      h.ticks(Math.ceil((LAST_WORDS + 1) * 20))
      const texts = chatTexts(c.inbox)
      expect(texts).toContain(boot ? '@death.youBooted' : '@death.you')
      expect(texts).not.toContain(boot ? '@death.you' : '@death.youBooted')
    }
  })
})

describe('英文用語與格式', () => {
  it('英文介面統一用 Xeno（不混用 Alien）', () => {
    lang.value = 'en'
    // 「Alien Meadow」是翠原星的地名（異星草原），不是陣營名稱
    const bad = stringKeys('en').filter((k) => /\baliens?\b/i.test(t(k).replace(/Alien Meadow/g, '')))
    expect(bad).toEqual([])
    expect(t('role.xeno')).toBe('Xeno')
  })

  it('數量字串分單複數（英文）；中文不受影響', () => {
    lang.value = 'en'
    expect(t('lobby2.roles.count', { n: 1 })).toBe('1 combatant at start (incl. AI)')
    expect(t('lobby2.roles.count', { n: 3 })).toBe('3 combatants at start (incl. AI)')
    // sim 送來的參數是字串
    expect(sysText('@vote.kickLeft|n=1')).toBe('1 more vote needed')
    expect(sysText('@vote.kickLeft|n=2')).toBe('2 more votes needed')
    lang.value = 'zh'
    expect(t('lobby2.roles.count', { n: 1 })).toContain('1 名')
  })

  it('清單分隔符號走 i18n', () => {
    expect(listJoin(['甲', '乙'])).toBe('甲、乙')
    lang.value = 'en'
    expect(listJoin(['Ann', 'Bob'])).toBe('Ann, Bob')
    expect(t('sep.colon')).toBe(': ')
  })

  it('.one 單數字串都有對應的複數原字串', () => {
    const orphans = stringKeys('en').filter((k) => k.endsWith('.one') && !hasString('en', k.slice(0, -4)))
    expect(orphans).toEqual([])
  })
})
