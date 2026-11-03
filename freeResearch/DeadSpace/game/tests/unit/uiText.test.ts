// 介面文字（UI 審查第 1 輪）：結算時間軸走 i18n、英文用語統一、單複數、分隔符號、出局者的死亡訊息
import { afterEach, describe, expect, it } from 'vitest'
import { Harness } from './helpers/harness'
import { damage } from '../../src/sim/systems/damage'
import { LAST_WORDS } from '../../src/sim/systems/chat'
import { FORMS, UNITS } from '../../src/shared/content/registry'
import { hasString, lang, listJoin, stringKeys, sysText, t } from '../../src/ui/i18n'
import type { ChatLine, HostMsg } from '../../src/shared/protocol/messages'
import { fmtKey } from '../../src/sim/game'
import { destroyInterior, setPilot } from '../../src/sim/systems/space'
import { giveItem, makeItem } from '../../src/sim/systems/items'
import { spawnCreature } from '../../src/sim/ai/creatures'
import { NEUTRAL, type Ent } from '../../src/sim/ent'
import { itemDef } from '../../src/shared/content/registry'
import { sampleUnitToken } from '../../src/shared/sysArgs'

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

describe('英文介面的系統訊息不夾中文地名／房名／形態名（UI 審查第 2 輪）', () => {
  const CJK = /[\u3000-\u30ff\u3400-\u9fff\uff00-\uffef]/

  it('站點、船艇、房間、驗血名單、清單：兩種語言都送，en 的 sysText 不含 CJK，zh 照舊是中文', () => {
    const { h, g, ps } = setup()
    const texts: string[] = []
    // 攔下 sim 送出的每一則系統訊息、私人訊息、時間軸與 AI 發言（已是 `@key|k=v` 格式）
    const sa = g.systemAll.bind(g)
    g.systemAll = (k, a) => (texts.push(fmtKey(k, a)), sa(k, a))
    const pl = g.privateLine.bind(g)
    g.privateLine = (s, k, a) => (texts.push(fmtKey(k, a)), pl(s, k, a))
    const lg = g.log.bind(g)
    g.log = (t) => (texts.push(t), lg(t))
    const hc = g.handleChat.bind(g)
    g.handleChat = (s, ch, t, to) => (texts.push(t), hc(s, ch, t, to))
    const run = (name: string, caster: Ent, target?: Ent, x = 0, y = 0) => g.script(name)!(g, { caster, target, x, y, zone: caster.zone }, {})
    const slot = ps[0].slot
    const me = g.mainOf(ps[0])!
    // 太空中的站點（人數少時不是每一站都在）：腳本不檢查施放者是哪一站，挑現有的站就好
    const st = g.world.zones.filter((z) => z.station && !z.data.ship && g.world.get(z.spaceEnt)).map((z) => g.world.get(z.spaceEnt)!)
    expect(st.length).toBeGreaterThan(3)
    // 同型船（兩艘以上同名）：時間軸與公告要加 #編號
    const dupe = g.world.zones.filter((z) => z.station && g.world.zones.filter((q) => q.station?.name.zh === z.station!.name.zh).length > 1)
    expect(dupe.length).toBeGreaterThan(1)
    const [a, b, c, d] = st
    a.owner = slot
    setPilot(g, a, me)
    run('st.cannon', a, b)
    run('st.antimatter', a, c)
    run('st.portTarget', a, d)
    run('st.cordon', a, b)
    run('st.neurotoxStart', a, c)
    run('grav.pickTarget', a, d)
    run('space.sweep', a)
    run('space.scan', a, b)
    // 驗血報告：玩家名稱＋匿名形態（存成標記，依語言換成形態名）
    const form = UNITS.get('xeno.cocoon')!
    const resolver = g.world.spawn(UNITS.get('npc.pacifier')!, me.zone, me.x, me.y, NEUTRAL)
    resolver.data.sample = { slots: [ps[1].slot], names: [ps[1].name, sampleUnitToken(form.id)], r: 1 }
    run('git.results', me, resolver)
    g.world.remove(resolver)
    // 聊天指令的名單
    g.handleChat(slot, 'all', '-names')
    // 背包掃描器：道具名稱依語言
    const q = g.mainOf(ps[1])!
    q.inv!.fill(null)
    giveItem(g, q, makeItem('stim'))
    run('item.invScan', me, q)
    // NPC 船員發現屍體：站名＋房名
    const victim = g.mainOf(ps[2])!
    const crew = spawnCreature(g, 'npc.crew', victim.zone, victim.x - 1.5, victim.y)!
    crew.data.crew = true
    crew.data.nextPatrol = 1e9
    g.killEnt(victim, null, -1)
    h.ticks(12 * 20)
    // 擊毀一艘同型船（全場公告＋時間軸）
    destroyInterior(g, dupe[1].id, null)
    h.ticks(2)
    const keys = new Set(texts.map((s) => s.slice(1).split('|')[0]))
    for (const k of ['space.accessGranted', 'st.cannonFired', 'tl.cannon', 'st.atmLock', 'st.portTargetSet', 'st.cordonOk', 'st.neurotoxOn', 'fac.gravTargetOk', 'space.sweepAnnounce', 'git.report.clean', 'chat.names', 'item.scanResult', 'npc.bodyFound', 'space.destroyed', 'tl.destroyed']) expect([k, keys.has(k)]).toEqual([k, true])
    const sys = texts.filter((s) => s.startsWith('@'))
    lang.value = 'en'
    const bad = sys.map((s) => [s, sysText(s)]).filter(([, s]) => CJK.test(s) || /\{\w+\}/.test(s))
    expect(bad).toEqual([])
    const en = (k: string) => sysText(sys.find((s) => s.startsWith('@' + k + '|'))!)
    expect(en('git.report.clean')).toContain(`${ps[1].name}, ${form.name.en}`)
    expect(en('item.scanResult')).toContain(itemDef('stim')!.name.en)
    expect(en('tl.destroyed')).toMatch(/ #2 was destroyed$/)
    lang.value = 'zh'
    const zh = (k: string) => sysText(sys.find((s) => s.startsWith('@' + k + '|'))!)
    expect(zh('git.report.clean')).toContain(`${ps[1].name}、${form.name.zh}`)
    expect(zh('space.destroyed')).toBe(`${dupe[1].station!.name.zh} #2 被摧毀了！`)
    expect(CJK.test(zh('npc.bodyFound'))).toBe(true)
  })
})
