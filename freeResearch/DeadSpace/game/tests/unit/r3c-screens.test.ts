// 第 3 輪人類玩家視角審查（各畫面、圖鑑）：練習「再來一局」、晉升後的結算職業、介面大小的數字、
// 練習「簡單」難度的說明和 AI 實際行為一致、圖鑑的同名生物、大廳唯讀設定與主選單語言切換的文字。
import { beforeEach, describe, expect, it, vi } from 'vitest'

const mem = vi.hoisted(() => {
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
  return m
})

// 練習的「再來一局」只碰 session 的這幾個入口：記下呼叫順序與參數
const calls = vi.hoisted(() => ({ log: [] as unknown[][], room: 'SOLO0', host: true }))
vi.mock('../../src/client/session', async () => {
  const { signal } = await import('@preact/signals')
  const { ClientWorld } = await import('../../src/client/world')
  const isHost = signal(true)
  return {
    world: new ClientWorld(),
    snapTick: signal(0),
    startInfo: signal(null),
    lobby: signal(null),
    send: () => {},
    sendCmd: () => {},
    isHost: {
      get value() {
        return calls.host
      },
      peek: () => isHost.peek(),
    },
    currentRoom: () => calls.room,
    leave: () => void calls.log.push(['leave']),
    loadProfile: () => ({ name: 'Alice', color: 3 }),
    startPractice: (...a: unknown[]) => void calls.log.push(['startPractice', ...a]),
  }
})
vi.mock('../../src/client/input', async () => {
  const { signal } = await import('@preact/signals')
  return { typingInField: () => false, chatOpen: signal(false), evolveOpen: signal(false), targetMode: signal(null), selected: signal(0), modalChecks: [], panelChecks: [], dialogOpen: () => false, localNotice: signal(null) }
})

const P = await import('../../src/ui/screens/practiceRun')
const { uiScaleTexts } = await import('../../src/ui/screens/uiScaleText')
const { autoZoom } = await import('../../src/ui/uiScale')
const G = await import('../../src/ui/hud/Guide')
const C = await import('../../src/ui/hud/Codex')
const { hasString, lang, t } = await import('../../src/ui/i18n')
const { UNITS } = await import('../../src/shared/content/registry')
const { UI4_EN, UI4_ZH } = await import('../../src/ui/strings/ui4')
const { UI5_EN, UI5_ZH } = await import('../../src/ui/strings/ui5')
const { Harness } = await import('./helpers/harness')
const { PLAY1_ZH } = await import('../../src/ui/strings/play1')
type UnitDef = import('../../src/shared/content/types').UnitDef

beforeEach(() => {
  calls.log.length = 0
  calls.room = 'SOLO0'
  calls.host = true
  lang.value = 'zh'
})

describe('練習：再來一局', () => {
  it('用上一場的設定（身分、AI 數量、難度）走同一條 startPractice：先結束這一局再開', () => {
    P.runPractice({ name: 'Alice', color: 3 }, { role: 'xeno', bots: 7, ai: 'normal' })
    expect(calls.log).toEqual([['startPractice', { name: 'Alice', color: 3 }, 7, 'xeno', 'normal']])
    calls.log.length = 0
    expect(P.replayPractice()).toBe(true)
    expect(calls.log).toEqual([['leave'], ['startPractice', { name: 'Alice', color: 3 }, 7, 'xeno', 'normal']])
    expect(P.lastPracticeRun()).toEqual({ role: 'xeno', bots: 7, ai: 'normal' })
    // 說明寫出用的是哪一組設定
    expect(P.againTip()).toContain('異形')
    expect(P.againTip()).toContain('7 個 AI')
    expect(P.againTip()).toContain('一般')
  })

  it('多人局（不是練習房、或只是客人）不顯示也不做事', () => {
    calls.room = 'ABCDE'
    expect(P.inPractice()).toBe(false)
    expect(P.replayPractice()).toBe(false)
    calls.room = 'SOLO0'
    calls.host = false
    expect(P.inPractice()).toBe(false)
    expect(P.replayPractice()).toBe(false)
    expect(calls.log).toEqual([])
    calls.host = true
    expect(P.inPractice()).toBe(true)
  })

  it('練習對話框存下來的偏好：讀不到、壞掉的值退回預設（隨機、5 個 AI、簡單）', () => {
    mem.clear()
    expect(P.loadPracticePrefs()).toEqual({ role: 'random', bots: 5 })
    expect(P.loadAiLevel()).toBe('easy')
    P.savePracticePrefs({ role: 'android', bots: 3 })
    P.saveAiLevel('normal')
    expect(P.loadPracticePrefs()).toEqual({ role: 'android', bots: 3 })
    expect(P.loadAiLevel()).toBe('normal')
    mem.set('xc.practice', '{"role":"boss","bots":99}')
    expect(P.loadPracticePrefs()).toEqual({ role: 'random', bots: 5 })
  })
})

describe('結算：晉升過的政委顯示「特務」', () => {
  it('真的 sim：晉升記在時間軸（tl.promotion），結算名單的 classId 仍是 commissar', () => {
    const { h } = Harness.started(3, 2024, { eventMult: 0 })
    const g = h.server.game!
    const ps = g.allPlayers()
    ps[1].classId = 'commissar'
    g.setRole(ps[1], 'human')
    g.setRole(ps[2], 'xeno')
    expect(g.triggerEvent!('promotion', true)).toBe(true)
    g.endGame('draw')
    const r = g.ended!
    expect(r.players.find((p) => p.slot === ps[1].slot)?.classId).toBe('commissar')
    const promoted = G.promotedSlots(r)
    expect([...promoted]).toEqual([ps[1].slot])
    expect(G.classLabel('commissar', promoted.has(ps[1].slot))).toBe('特務')
  })

  it('沒有晉升、名字裡有 | = 的情況', () => {
    const players = [
      { slot: 0, name: 'A|b', color: 0, role: 'human', classId: 'commissar', spawn: false, alive: true, kills: 0, infections: 0, tests: 0 },
      { slot: 1, name: 'Bob', color: 1, role: 'human', classId: 'commissar', spawn: false, alive: true, kills: 0, infections: 0, tests: 0 },
    ]
    expect(G.promotedSlots({ players, timeline: [] }).size).toBe(0)
    expect([...G.promotedSlots({ players, timeline: [{ t: 1, text: '@tl.promotion|name=Ab' }] })]).toEqual([0])
    expect([...G.promotedSlots({ players, timeline: [{ t: 1, text: '@tl.other|name=Bob' }] })]).toEqual([])
  })
})

describe('設定：介面大小的兩個數字', () => {
  it('滑桿是倍率（×），說明列是實際大小（%）：不會再出現兩個意思不同的百分比', () => {
    expect(uiScaleTexts(1, 0.95)).toEqual({ mult: '×1.00', actual: 95 })
    expect(uiScaleTexts(1.25, 1.4)).toEqual({ mult: '×1.25', actual: 140 })
    expect(uiScaleTexts(0.7, autoZoom(1280, 760) * 0.7).actual).toBe(70)
    for (const [l, d] of [
      ['zh', UI5_ZH],
      ['en', UI5_EN],
    ] as const) {
      expect(d['ui5.settings.uiScaleNote'], l).toContain('{pct}%')
      expect(hasString(l, 'ui5.settings.uiScaleNote')).toBe(true)
    }
    expect(t('ui5.settings.uiScaleNote', { pct: 95 })).toContain('實際大小 95%')
  })
})

describe('練習「簡單」難度的說明和 AI 實際行為一致', () => {
  it('會在全體頻道公布驗血結果，但不點名指認、不主動開火', () => {
    const zh = UI4_ZH['ui4.practice.ai.easy.d']
    const en = UI4_EN['ui4.practice.ai.easy.d']
    expect(zh).not.toContain('不公開指認')
    expect(zh).toContain('公布')
    expect(zh).toContain('不會點名')
    expect(en).not.toMatch(/never accuse publicly/)
    expect(en).toMatch(/post the result in all chat/)
    expect(en).toMatch(/never name a suspect/)
    // AI 公布的那句話（bots.ts readReports → play1.bot.gitInfected）；簡單難度只公布、不說 play1.bot.accuse 的行為
    // 由 aiLevel.test.ts 用真的 sim 驗過
    expect(PLAY1_ZH['play1.bot.gitInfected']).toContain('藏著異類')
  })
})

describe('圖鑑：同名的生物合併成一項', () => {
  const list = () => C.creatureGroups([...UNITS.values()].filter((u) => u.tags.includes('creature') && !u.tags.includes('summon') && u.ai))

  it('清單裡不再有同名重複；失敗實驗體 2 種、異常體 3 種合併成一項', () => {
    const groups = list()
    const names = groups.map((g) => g[0].name.zh)
    expect(new Set(names).size).toBe(names.length)
    const by = (zh: string) => groups.find((g) => g[0].name.zh === zh)!.map((u) => u.id)
    expect(by('失敗實驗體')).toEqual(['creature.failed', 'creature.failedSheep'])
    expect(by('異常體')).toEqual(['creature.anomaly', 'creature.anomalyCaged', 'creature.anomalyRich'])
  })

  it('每種個體各寫出在哪裡出現、吞噬 EP（照內容表）、掉落物', () => {
    const ids = ['creature.failed', 'creature.failedSheep', 'creature.anomaly', 'creature.anomalyCaged', 'creature.anomalyRich']
    for (const id of ids) for (const l of ['zh', 'en'] as const) expect(hasString(l, 'ui5.codex.where.' + id), `${l} ${id}`).toBe(true)
    const line = (id: string) => C.variantLine(UNITS.get(id)!)
    expect(line('creature.anomaly')).toContain('+125 EP')
    expect(line('creature.anomalyCaged')).toContain('+25 EP')
    expect(line('creature.anomalyCaged')).toContain('活體庫號')
    expect(line('creature.anomalyCaged')).toMatch(/16 種道具/)
    expect(line('creature.anomalyRich')).toContain('翠原星')
    expect(line('creature.anomalyRich')).toContain('必定掉落')
    expect(line('creature.failedSheep')).toContain('羊')
    expect(line('creature.failedSheep')).toContain('女帝號')
    lang.value = 'en'
    expect(line('creature.anomaly')).toContain('+125 EP')
    expect(line('creature.failed')).toMatch(/every 45 s/)
  })

  it('數值不同的同名單位不合併', () => {
    const a = UNITS.get('creature.failed')!
    const b: UnitDef = { ...a, id: 'x.test', hp: a.hp + 1 }
    expect(C.creatureGroups([a, b]).length).toBe(2)
    expect(C.creatureGroups([a, { ...a, id: 'x.same' }]).length).toBe(1)
  })
})

describe('其他畫面的文字', () => {
  it('大廳唯讀提示、主選單語言切換、再來一局都有兩種語言', () => {
    for (const k of ['ui5.lobby.readonly', 'ui5.menu.lang', 'ui5.practice.again', 'ui5.practice.againTip', 'ui5.practice.againDead', 'ui5.class.agent', 'ui5.codex.variants', 'ui5.codex.var.line', 'ui5.codex.var.dropAlways', 'ui5.codex.var.dropMaybe'])
      for (const l of ['zh', 'en'] as const) expect(hasString(l, k), `${l} ${k}`).toBe(true)
    // zh 與 en 的佔位符一致
    const ph = (s: string) => [...s.matchAll(/\{(\w+)\}/g)].map((m) => m[1]).sort()
    expect(Object.keys(UI5_EN).sort()).toEqual(Object.keys(UI5_ZH).sort())
    for (const k of Object.keys(UI5_ZH)) expect([k, ph(UI5_EN[k])]).toEqual([k, ph(UI5_ZH[k])])
  })
})
