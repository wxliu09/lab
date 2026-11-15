// 第 3 輪人類玩家視角審查（目標面板）：仿生人的「先做：」與誤傷規則、範圍傷害武器、變種人吞噬可點、
// 異形變身要躲起來、滑鼠停著時「先做：」不輪播、晉升後的職業名。說法都用真的 sim／內容表對照。
import { describe, expect, it, vi } from 'vitest'
import type { PrivateState } from '../../src/shared/protocol/messages'

// node 沒有 localStorage：Guide 模組載入時會讀寫
vi.hoisted(() => {
  const m = new Map<string, string>()
  ;(globalThis as unknown as { localStorage: Storage }).localStorage = {
    getItem: (k: string) => (m.has(k) ? m.get(k)! : null),
    setItem: (k: string, v: string) => void m.set(k, String(v)),
    removeItem: (k: string) => void m.delete(k),
    clear: () => m.clear(),
    key: (i: number) => [...m.keys()][i] ?? null,
    get length() {
      return m.size
    },
  } as Storage
})

vi.mock('../../src/client/session', async () => {
  const { signal } = await import('@preact/signals')
  const { ClientWorld } = await import('../../src/client/world')
  return { world: new ClientWorld(), snapTick: signal(0), startInfo: signal(null), lobby: signal(null), send: () => {}, sendCmd: () => {} }
})
vi.mock('../../src/client/input', async () => {
  const { signal } = await import('@preact/signals')
  return { typingInField: () => false, chatOpen: signal(false), evolveOpen: signal(false), targetMode: signal(null), selected: signal(0), modalChecks: [], panelChecks: [], dialogOpen: () => false, localNotice: signal(null) }
})

const G = await import('../../src/ui/hud/Guide')
const N = await import('../../src/ui/hud/facilityNav')
const { GUIDE_EN, GUIDE_ZH } = await import('../../src/ui/strings/guide')
const { hasString, lang, t } = await import('../../src/ui/i18n')
const { parseLayout } = await import('../../src/shared/layout')
const { STATION_BY_ID } = await import('../../src/shared/content/stations/index')
const { UNITS, abilityDef } = await import('../../src/shared/content/registry')
const { EntFlag } = await import('../../src/shared/protocol/messages')
const { SIM_AGENT_TITLE } = await import('../../src/ui/names')
const { Harness } = await import('./helpers/harness')
const { damage } = await import('../../src/sim/systems/damage')
const { entView } = await import('../../src/sim/systems/snapshot')
const { giveItem, makeItem } = await import('../../src/sim/systems/items')
const { SCRIPTS } = await import('../../src/sim/systems/effects')

type View = Parameters<typeof G.objectiveFor>[0]

function inv(...items: (string | null)[]): PrivateState['inv'] {
  return items.map((i) => (i ? { item: i, charges: 0, cd: 0 } : null))
}
function ab(...ids: string[]): PrivateState['abilities'] {
  return ids.map((id) => ({ id, cd: 0, maxCd: 0, mana: 0 }))
}
function view(me: Partial<PrivateState>, extra: Partial<View> = {}): View {
  return { me: { alive: true, zone: 1, abilities: [], inv: [], ...me }, w: { t: 100, stab: 1 }, near: [], self: { d: 'personnel', hp: 400, mhp: 400 }, ...extra }
}
const keysOf = (v: View) => G.objectiveFor(v)!.steps.map((s) => s.key)
const android = (extra: Partial<View> = {}, me: Partial<PrivateState> = {}) => view({ role: 'android', classId: 'janitor', ep: 100, epNext: 2000, ...me }, extra)

describe('仿生人：前期的「先做：」', () => {
  it('人形時有一條「先做：」混進船員（每 20 秒換一條）；換了機體就不再叫他裝船員', () => {
    const at = (t: number, me: Partial<PrivateState> = {}) => keysOf({ ...android({}, me), w: { t, stab: 1 } })
    expect(at(0)).toEqual(['guide.s.androidEp', 'guide.s.ff', 'guide.s.androidGroup', 'guide.s.core'])
    // 基因檢測開放前：等開放；開放後：去領檢測器（可點，走到醫療補給或 GIT）；背包有檢測器：按幾號抽血
    expect(at(20)).toContain('guide.s.androidSampleWait')
    expect(at(500)).toContain('guide.s.androidSampleGet')
    expect(N.navKindOf('guide.s.androidSampleGet', 'nyx')).toBe('sampler')
    const withSampler = G.objectiveFor({ ...android({}, { inv: inv('traumaKit', 'geneSampler') }), w: { t: 540, stab: 1 } })!.steps
    expect(withSampler.find((s) => s.key === 'guide.s.androidSample')?.args).toEqual({ k: 2 })
    // 「先做：」都是可以馬上做的事，文字以「先做：」開頭
    for (const k of ['guide.s.androidGroup', 'guide.s.androidSample', 'guide.s.androidSampleGet', 'guide.s.androidSampleWait']) {
      expect(GUIDE_ZH[k], k).toMatch(/^先做：/)
      expect(GUIDE_EN[k], k).toMatch(/^Meanwhile: /)
    }
    // 換了機體（chassis）：一眼看得出是機器人
    const bulwark = keysOf({ ...android({ self: { d: 'android.bulwark', hp: 2200, mhp: 2200 } }), w: { t: 0, stab: 1 } })
    expect(bulwark.some((k) => k.startsWith('guide.s.androidGroup') || k.startsWith('guide.s.androidSample'))).toBe(false)
  })

  it('抽血別抽自己：sim 裡仿生人自己抽的樣本含自己的血，報告就是「錯誤」', () => {
    expect(GUIDE_ZH['guide.s.androidSample']).toContain('錯誤')
    expect(GUIDE_EN['guide.s.androidSample']).toContain('ERROR')
    const result = (self: boolean) => {
      const { h } = Harness.started(4, 4040, { eventMult: 0 })
      const g = h.server.game!
      const ps = g.allPlayers()
      for (const p of ps) g.setRole(p, 'human')
      g.setRole(ps[0], 'android')
      const u = g.mainOf(ps[0])!
      giveItem(g, u, makeItem('geneSampler'))
      for (const p of self ? [ps[0], ps[1], ps[2]] : [ps[1], ps[2], ps[3]]) {
        const tu = g.mainOf(p)!
        SCRIPTS.get('git.draw')!(g, { caster: u, target: tu, x: tu.x, y: tu.y, zone: tu.zone, itemSlot: u.inv!.findIndex((x) => x?.id === 'geneSampler') } as never, {})
      }
      const it = u.inv!.find((x) => x?.id === 'gitResolver')!
      SCRIPTS.get('git.results')!(g, { caster: u, target: { data: { sample: it.data } }, x: u.x, y: u.y, zone: u.zone } as never, {})
      return ps[0].gitReports.at(-1)!.result
    }
    expect(result(true)).toBe('error')
    expect(result(false)).toBe('clean')
  })

  it('誤傷規則照 sim（roleSystem.ts）：打過的人類 5 分鐘內死掉才記點，累計超過 2.7 份滿血就強制關機', () => {
    lang.value = 'zh'
    expect(t('guide.s.ff')).toMatch(/5 分鐘/)
    expect(t('guide.s.ff')).toContain('2.7')
    expect(GUIDE_EN['guide.s.ff']).toMatch(/5 min/)
    expect(GUIDE_EN['guide.s.ff']).toContain('2.7')
    for (const k of ['guide.h.androidFf', 'guide.r.android.2']) {
      expect(GUIDE_ZH[k], k).toContain('2.7')
      expect(GUIDE_EN[k], k).toContain('2.7')
    }
    const run = (victims: number, frac: number) => {
      const { h } = Harness.started(6, 4141, { eventMult: 0 })
      const g = h.server.game!
      const ps = g.allPlayers()
      g.setRole(ps[1], 'android')
      for (const p of ps) if (p !== ps[1]) g.setRole(p, 'human')
      const am = g.mainOf(ps[1])!
      for (const p of ps.filter((q) => q !== ps[1]).slice(0, victims)) {
        const u = g.mainOf(p)!
        damage(g, am, u, u.maxHp * frac)
        // 由別人（環境）補刀：不論誰下的手都算
        g.killEnt(u, null, -1)
      }
      return ps[1].alive
    }
    // 3 × 0.8 = 2.4：還在；4 × 0.8 = 3.2：超過 2.7，強制關機
    expect(run(3, 0.8)).toBe(true)
    expect(run(4, 0.8)).toBe(false)
  })

  it('手上是範圍傷害武器（只看自己的裝備）：火箭裝的普攻、或技能列裡的範圍傷害技能', () => {
    const rocket = UNITS.get('suit.rocket')!
    const sp = G.splashGear(android({ self: { d: 'suit.rocket', hp: 600, mhp: 600 } }))
    expect(sp).toEqual({ key: 'guide.s.androidSplash', name: '火箭裝', r: rocket.attack!.aoe })
    const steps = G.objectiveFor(android({ self: { d: 'suit.rocket', hp: 600, mhp: 600 } }))!.steps
    expect(steps.map((s) => s.key).slice(0, 3)).toEqual(['guide.s.androidEp', 'guide.s.ff', 'guide.s.androidSplash'])
    lang.value = 'zh'
    const s = steps.find((x) => x.key === 'guide.s.androidSplash')!
    expect(t(s.key, s.args)).toContain('火箭裝')
    expect(t(s.key, s.args)).toContain('1.25 公尺')
    // 機體的稜鏡火箭（腳本參數帶 aoe 與 dmg）
    const prism = G.splashGear(android({ self: { d: 'android.bulwark', hp: 2200, mhp: 2200 } }, { abilities: ab('ab.chassis.prismRockets') }))
    expect(prism).toEqual({ key: 'guide.s.androidSplashAb', name: '稜鏡火箭' })
    // 一般人形、沒有範圍技能：不提醒
    expect(G.splashGear(android())).toBe(null)
    expect(G.splashGear(android({}, { abilities: ab('cls.rummage') }))).toBe(null)
    // 只是加血、上 buff 的範圍技能不算傷害
    expect(abilityDef('ab.chassis.restore')).toBeTruthy()
    expect(G.splashGear(android({ self: { d: 'android.bulwark', hp: 1, mhp: 1 } }, { abilities: ab('ab.chassis.restore') }))).toBe(null)
  })
})

describe('「先做：」滑鼠停在面板上時不輪播', () => {
  it('altT 凍結時，不論 w.t 走到哪都是同一條；沒有 altT 照 w.t 輪播', () => {
    const human = (t: number, altT?: number) => G.objectiveFor({ ...view({ role: 'human', classId: 'janitor' }), w: { t, stab: 1 }, ...(altT !== undefined ? { altT } : {}) })!.steps[2].key
    const free = [100, 120, 140, 160].map((t) => human(t))
    expect(new Set(free).size).toBeGreaterThan(1)
    expect([100, 120, 140, 160].map((t) => human(t, 100))).toEqual([free[0], free[0], free[0], free[0]])
    // 倒數照真實時間走（只凍結輪播）
    const wait = G.objectiveFor({ ...view({ role: 'human', classId: 'janitor' }), w: { t: 160, stab: 1 }, altT: 100 })!.steps[1]
    expect(wait).toEqual({ key: 'guide.s.samplerWait', args: { t: '4:20' } })
    expect(G.rotate(['a', 'b', 'c'], 0)).toBe('a')
    expect(G.rotate(['a', 'b', 'c'], G.ALT_PERIOD * 4)).toBe('b')
  })
})

describe('異形：褪去／披回人皮的那一行要說去沒人看到的地方', () => {
  it('說出要原地 5 秒（和技能的施法時間一致），建議關上門、沒人的房間', () => {
    for (const a of ['xeno.form', 'xeno.human']) expect(abilityDef(a)?.cast, a).toBe(5)
    expect(GUIDE_ZH['guide.s.shed']).toContain('5 秒')
    expect(GUIDE_ZH['guide.s.shed']).toMatch(/關上門/)
    expect(GUIDE_ZH['guide.s.wear']).toContain('5 秒')
    expect(GUIDE_EN['guide.s.shed']).toContain('5 s')
    expect(GUIDE_EN['guide.s.shed']).toMatch(/closed door/)
    expect(GUIDE_EN['guide.s.wear']).toContain('5 s')
    const o = G.objectiveFor(view({ role: 'xeno', tier: 1, abilities: ab('cls.mend', 'xeno.form') }))!
    expect(o.steps[0]).toEqual({ key: 'guide.s.shed', args: { k: 'W' } })
  })
})

describe('變種人：「吞噬」那一行可以點（走向看得到的最近一隻；沒有就去生物的出生點）', () => {
  const nyx = parseLayout(STATION_BY_ID.get('nyx')!.layout)
  const lab = N.navCandidates(nyx, 'prey')
  const spot = lab[0]

  it('對到 prey；有生物出生點的站才算本區有（女帝號實驗室、翠原星、活體庫號），其他站要看得到生物才行', () => {
    expect(N.navKindOf('guide.s.devour', 'nyx')).toBe('prey')
    expect(N.stationHas('nyx', 'prey')).toBe(true)
    expect(N.stationHas('verdance', 'prey')).toBe(true)
    expect(N.stationHas('vivarium', 'prey')).toBe(true)
    expect(N.stationHas('bravado', 'prey')).toBe(false)
    expect(lab.every((p) => p.def.kind === 'experimentSpawn')).toBe(true)
    expect(hasString('zh', 'guide.nav.preyBody') && hasString('en', 'guide.nav.preyBody')).toBe(true)
  })

  it('isPrey：只認可吞噬、不會主動攻擊、不是 NPC、沒有玩家操控的活生物', () => {
    expect(N.isPrey({ d: 'creature.slugling', hp: 60 })).toBe(true)
    expect(N.isPrey({ d: 'creature.failed', hp: 200 })).toBe(true)
    expect(N.isPrey({ d: 'creature.anomaly', hp: 5 })).toBe(true)
    // 暴走實驗體可吞但會咬人；NPC 船員吞得下但等於當眾自曝
    expect(N.isPrey({ d: 'creature.failedHostile', hp: 200 })).toBe(false)
    expect(N.isPrey({ d: 'npc.crew', hp: 400 })).toBe(false)
    // 沒有吞噬 EP 的生物、屍體、敵對旗標、死者附身的蛞蝓仔
    expect(N.isPrey({ d: 'creature.snowgle', hp: 900 })).toBe(false)
    expect(N.isPrey({ d: 'creature.slugling', hp: 60, fl: EntFlag.Corpse })).toBe(false)
    expect(N.isPrey({ d: 'creature.slugling', hp: 60, fl: EntFlag.Hostile })).toBe(false)
    expect(N.isPrey({ d: 'creature.slugling', hp: 60, o: 3 })).toBe(false)
    expect(N.isPrey({ d: 'creature.slugling', hp: 0 })).toBe(false)
    expect(N.isPrey({ d: 'personnel', hp: 400 })).toBe(false)
  })

  it('看得到生物：走到最近一隻旁邊（步數最少），不是牆後那隻；看不到就去實驗室的出生點', () => {
    const from = { x: spot.x + 6, y: spot.y }
    // 實驗室裡、走得到的一隻（就在出生點旁）
    const near = { id: 1, d: 'creature.failed', hp: 200, x: spot.x, y: spot.y }
    const t1 = N.preyTarget(nyx, from, [near])!
    expect(t1.prey).toBe(1)
    expect(Math.hypot(t1.x - near.x, t1.y - near.y)).toBeLessThanOrEqual(N.PREY_REACH)
    // 不是獵物的生物不算：改去出生點
    const t2 = N.preyTarget(nyx, from, [{ ...near, d: 'creature.failedHostile' }])!
    expect(t2.prey).toBe(null)
    expect(t2.poi?.def.kind).toBe('experimentSpawn')
    // 都沒有：出生點
    const t3 = N.preyTarget(nyx, from, [])!
    expect(t3.prey).toBe(null)
    expect(lab).toContain(t3.poi)
    // 兩隻：挑步數少的
    const far = { id: 2, d: 'creature.failed', hp: 200, x: nyx.spawns[0].x, y: nyx.spawns[0].y }
    const t4 = N.preyTarget(nyx, from, [far, near])!
    expect(t4.prey).toBe(1)
  })

  it('真的 sim：女帝號實驗室的出生點上長的都是可吞噬、不會攻擊人的生物；快照送來的 d 判得出來', () => {
    const { h } = Harness.started(3, 4242, { eventMult: 0 })
    const g = h.server.game!
    const z = g.world.zones.find((zz) => zz.station?.id === 'nyx')!
    const viewer = g.allPlayers()[0]
    const around = [...g.world.inZone(z.id)].filter((e) => e.alive && lab.some((p) => Math.hypot(e.x - p.x, e.y - p.y) < 3) && e.tags.has('creature'))
    expect(around.length).toBeGreaterThan(0)
    for (const e of around) expect(N.isPrey(entView(g, viewer, e)), e.def.id).toBe(true)
  })
})

describe('晉升後的職業名', () => {
  it('名字帶晉升頭銜就顯示「特務」，其餘照職業', () => {
    lang.value = 'zh'
    expect(G.isPromoted(SIM_AGENT_TITLE + 'Bob')).toBe(true)
    expect(G.isPromoted('政委·Bob')).toBe(false)
    expect(G.isPromoted(SIM_AGENT_TITLE)).toBe(false)
    expect(G.isPromoted(undefined)).toBe(false)
    expect(G.classLabel('commissar')).toBe('政委')
    expect(G.classLabel('commissar', true)).toBe('特務')
    lang.value = 'en'
    expect(G.classLabel('commissar', true)).toBe('Agent')
    expect(G.classLabel('commissar')).toBe('Commissar')
    lang.value = 'zh'
    // 目標面板的標題（自己主單位快照裡的名字）
    const o = G.objectiveFor(view({ role: 'human', classId: 'commissar' }, { self: { d: 'personnel', hp: 400, mhp: 400, n: SIM_AGENT_TITLE + 'Bob' } }))!
    expect(o.sub).toBe('特務')
    expect(G.objectiveFor(view({ role: 'human', classId: 'commissar' }))!.sub).toBe('政委')
  })

  it('真的 sim：晉升後 classId 仍是 commissar，但自己主單位快照的名字帶頭銜', () => {
    const { h } = Harness.started(3, 2024, { eventMult: 0 })
    const g = h.server.game!
    const p = g.allPlayers()[1]
    p.classId = 'commissar'
    g.setRole(p, 'human')
    expect(g.triggerEvent!('promotion', true)).toBe(true)
    const snap = entView(g, p, g.mainOf(p)!)
    expect(p.classId).toBe('commissar')
    expect(G.isPromoted(snap.n)).toBe(true)
    expect(G.objectiveFor(view({ role: 'human', classId: p.classId }, { self: { d: snap.d, hp: 1, mhp: 1, n: snap.n } }))!.sub).toBe('特務')
  })
})

describe('第 3 輪的指引文字', () => {
  it('新的 key 兩種語言都有、佔位符一致', () => {
    const ph = (s: string) => [...s.matchAll(/\{(\w+)\}/g)].map((m) => m[1]).sort()
    const keys = ['guide.s.androidSplash', 'guide.s.androidSplashAb', 'guide.s.androidGroup', 'guide.s.androidSample', 'guide.s.androidSampleGet', 'guide.s.androidSampleWait', 'guide.nav.prey', 'guide.nav.preyBody']
    for (const k of keys) {
      expect(GUIDE_ZH[k], k).toBeTruthy()
      expect(ph(GUIDE_EN[k]), k).toEqual(ph(GUIDE_ZH[k]))
    }
    for (const l of ['zh', 'en'] as const) expect(hasString(l, 'ui5.class.agent'), l).toBe(true)
  })
})
