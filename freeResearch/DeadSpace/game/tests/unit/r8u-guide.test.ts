// 第 8 輪 U8：目標面板的末日與圍攻現況（rad／fleetPlanet／burnIn／siege）、仿生人的提示與 EP 速度（隨末日時間）、
// 練習一般難度的「別落單」、召集驗血、「死者看見真實身分」；戰績的顯示文字；抽血集合的小地圖信號
import { describe, expect, it, vi } from 'vitest'
import type { PrivateState } from '../../src/shared/protocol/messages'

vi.hoisted(() => {
  const m = new Map<string, string>()
  ;(globalThis as unknown as { localStorage: unknown }).localStorage = {
    getItem: (k: string) => (m.has(k) ? m.get(k)! : null),
    setItem: (k: string, v: string) => void m.set(k, String(v)),
    removeItem: (k: string) => void m.delete(k),
  }
})

vi.mock('../../src/client/session', async () => {
  const { signal } = await import('@preact/signals')
  const { ClientWorld } = await import('../../src/client/world')
  return {
    world: new ClientWorld(),
    snapTick: signal(0),
    startInfo: signal(null),
    lobby: signal(null),
    endResult: signal(null),
    chatLog: signal([]),
    mySlot: signal(0),
    send: () => {},
    sendCmd: () => {},
    onHost: () => {},
    currentRoom: () => 'ABCDE',
  }
})
vi.mock('../../src/client/input', async () => {
  const { signal } = await import('@preact/signals')
  return {
    typingInField: () => false,
    chatOpen: signal(false),
    evolveOpen: signal(false),
    targetMode: signal(null),
    selected: signal(0),
    modalChecks: [],
    panelChecks: [],
    dialogOpen: () => false,
    localNotice: signal(null),
    altClick: {},
  }
})
vi.mock('../../src/audio/sfx', () => ({ fm: () => {}, playSynth: () => {}, tone: () => {} }))

const G = await import('../../src/ui/hud/Guide')
const SS = await import('../../src/ui/hud/SeasonStats')
const MP = await import('../../src/client/mapPing')
const { androidEpPerSec } = await import('../../src/shared/pacing')
const { hasString, lang, t } = await import('../../src/ui/i18n')
type View = Parameters<typeof G.objectiveFor>[0]
type LastGame = import('../../src/client/seasonStats').LastGame

function inv(...items: (string | null)[]): PrivateState['inv'] {
  return items.map((i) => (i ? { item: i, charges: 0, cd: 0 } : null))
}
function view(me: Partial<PrivateState>, extra: Partial<View> = {}): View {
  return {
    me: { alive: true, zone: 1, abilities: [], inv: [], ...me },
    w: { t: 100, stab: 1 },
    near: [],
    self: { d: 'personnel', hp: 400, mhp: 400 },
    ...extra,
  }
}
const withW = (v: View, w: Record<string, unknown>): View => ({ ...v, w: { ...v.w, ...w } as View['w'] })
const keysOf = (v: View) => G.objectiveFor(v)!.steps.map((s) => s.key)
const hintIds = (v: View) => G.detectHints(v).map((h) => h.id)
const step = (v: View, key: string) => G.objectiveFor(v)!.steps.find((s) => s.key === key)

describe('目標面板：末日與圍攻的現況', () => {
  it('地表輻射：有輻射就列出每秒多少（人在地表時說怎麼辦）；很低的殘值不列', () => {
    const away = withW(view({ role: 'human' }), { rad: 3.04 })
    expect(step(away, 'ui8.guide.rad')).toMatchObject({ args: { n: '3' }, warn: true })
    expect(t('ui8.guide.rad', { n: '3' })).toContain('翠原星地表輻射 3／秒')
    const here = { ...withW(view({ role: 'human' }), { rad: 12.6 }), zoneStation: 'verdance' }
    expect(step(here, 'ui8.guide.radHere')).toMatchObject({ args: { n: '13' } })
    expect(t('ui8.guide.radHere', { n: 13 })).toContain('你在地表')
    expect(keysOf(withW(view({ role: 'human' }), { rad: 0.3 }))).not.toContain('ui8.guide.rad')
    expect(keysOf(withW(view({ role: 'human' }), { rad: 0 }))).not.toContain('ui8.guide.rad')
    expect(G.radText(2.46)).toBe('2.5')
  })

  it('艦隊砲擊翠原星、灼燒倒數（秒數超過 100 寫分秒）、已在灼燒範圍內', () => {
    expect(keysOf(withW(view({ role: 'human' }), { fleetPlanet: true }))).toContain('ui8.guide.fleetPlanet')
    expect(keysOf({ ...withW(view({ role: 'human' }), { fleetPlanet: true }), zoneStation: 'verdance' })).toContain('ui8.guide.fleetPlanetHere')
    expect(step(withW(view({ role: 'human' }), { burnIn: 42.2 }), 'ui8.guide.burnIn')?.args).toEqual({
      t: '43 秒',
    })
    expect(t('ui8.guide.burnIn', { t: '43 秒' })).toContain('翠原星 43 秒後進入恆星灼燒範圍')
    expect(G.secText(135)).toBe('2 分 15 秒')
    expect(keysOf(withW(view({ role: 'human' }), { burnIn: 0 }))).toContain('ui8.guide.burnNow')
    lang.value = 'en'
    expect(G.secText(42)).toBe('42 s')
    lang.value = 'zh'
  })

  it('無人機群圍攻：自己這站寫「先撤離」排最前面，別站寫「先別過去」；列出圍攻時不再列一般的無人機對策', () => {
    const w = {
      ev: ['drones'],
      siege: [
        ['nyx', 0.42],
        ['bravado', 0.8],
      ],
    }
    const here = { ...withW(view({ role: 'human' }), w), zoneStation: 'bravado' }
    const o = G.objectiveFor(here)!
    expect(o.steps[0]).toMatchObject({
      key: 'ui8.guide.siegeHere',
      args: { st: '豪勇號', n: 80 },
      warn: true,
    })
    expect(o.steps.map((s) => s.key)).not.toContain('guide.ev.drones')
    expect(t('ui8.guide.siegeHere', { st: '豪勇號', n: 80 })).toBe('豪勇號遭無人機群圍攻，剩 80%：先撤離')
    // 不在被圍攻的站：列剩最少的那一站
    const away = G.objectiveFor({ ...withW(view({ role: 'human' }), w), zoneStation: 'tenshu' })!
    expect(away.steps.find((s) => s.key === 'ui8.guide.siege')?.args).toEqual({ st: '女帝號', n: 42 })
    // 壞資料忽略
    expect(keysOf(withW(view({ role: 'human' }), { siege: [['nyx', 'x'], 3] }))).not.toContain('ui8.guide.siege')
  })

  it('最多 3 條事件行：自己有關的在前、事件對策在中間、別處的在後；死者不列', () => {
    const v = {
      ...withW(view({ role: 'human' }), {
        ev: ['doom'],
        apo: 'orbit',
        burnIn: 30,
        rad: 5,
        fleetPlanet: false,
        siege: [['nyx', 0.3]],
      }),
      zoneStation: 'verdance',
    }
    const warn = G.objectiveFor(v)!
      .steps.filter((s) => s.warn)
      .map((s) => s.key)
    expect(warn).toEqual(['ui8.guide.burnIn', 'ui8.guide.radHere', 'guide.ev.doom.orbit'])
    expect(G.eventLines(v)).toHaveLength(G.MAX_EVENT_STEPS)
    const dead = G.objectiveFor({ ...v, me: { ...v.me, alive: false } })!
    expect(dead.steps.some((s) => s.warn)).toBe(false)
    // 沒有新欄位（舊版主機）：和以前一樣
    expect(G.eventLines(withW(view({ role: 'human' }), { ev: ['drones'] })).map((s) => s.key)).toEqual(['guide.ev.drones'])
  })
})

describe('仿生人', () => {
  it('EP 速度和 sim 同一個公式（隨末日時間）：預設 30–40 分比原作快、原作 55–70 分是 1.5；再乘 EP 倍率', () => {
    expect(G.androidEpRate(0, 2000).r).toBe('1.5')
    const fast = G.androidEpRate(0, 2000, 1, [30, 40])
    expect(Number(fast.r)).toBeCloseTo(androidEpPerSec([30, 40]), 2)
    expect(Number(fast.r)).toBeGreaterThan(1.5)
    expect(G.androidEpRate(0, 2000, 1, [55, 70]).r).toBe('1.5')
    expect(Number(G.androidEpRate(0, 2000, 2, [30, 40]).r)).toBeCloseTo(androidEpPerSec([30, 40]) * 2, 2)
    const o = G.objectiveFor({ ...view({ role: 'android', ep: 0, epNext: 2000 }), apocalypse: [30, 40] })!
    expect(o.steps.find((s) => s.key === 'guide.s.androidEp')!.args).toEqual(G.androidEpRate(0, 2000, 1, [30, 40]))
  })

  it('提示：開局一陣子後「不會被寄生轉化、最適合當抽血者或護衛」；驗血開放、拿到檢測器或看到錯誤報告時說明「錯誤」', () => {
    const at = (time: number, me: Partial<PrivateState> = {}) => hintIds(withW(view({ role: 'android', ...me }), { t: time }))
    expect(at(10)).not.toContain('androidRole')
    expect(at(60)).toContain('androidRole')
    expect(at(60)).not.toContain('androidError')
    expect(at(60, { inv: inv('geneSampler') })).toContain('androidError')
    expect(at(60, { gitReports: [{ time: 50, names: ['a', 'b', 'c'], result: 'error' }] })).toContain('androidError')
    expect(at(G.GIT_AT_DEFAULT)).toContain('androidError')
    expect(t('guide.h.androidRole')).toContain('你不會被寄生轉化，最適合當抽血者或護衛')
    expect(t('guide.h.androidError')).toContain('「錯誤」＝那三人裡有你')
    expect(t('guide.h.androidError')).toContain('私下告訴信任的人')
    // 人類看不到
    expect(hintIds(withW(view({ role: 'human', inv: inv('geneSampler') }), { t: 999 }))).not.toContain('androidError')
    // 說明面板的要點
    expect(G.ROLE_TIPS.android).toEqual(expect.arrayContaining(['android.guard', 'android.error']))
  })
})

describe('練習一般難度：別落單', () => {
  it('只有練習一般難度的人類／仿生人，開局前 5 分鐘', () => {
    const v = (practice: View['practice'], time: number, role: PrivateState['role'] = 'human') => hintIds({ ...withW(view({ role }), { t: time }), ...(practice ? { practice } : {}) })
    expect(v('normal', 10)).toContain('practiceAlone')
    expect(v('normal', 10, 'android')).toContain('practiceAlone')
    expect(v('normal', 10, 'xeno')).not.toContain('practiceAlone')
    expect(v('easy', 10)).not.toContain('practiceAlone')
    expect(v(undefined, 10)).not.toContain('practiceAlone')
    expect(v('normal', 400)).not.toContain('practiceAlone')
    expect(t('guide.h.practiceAlone.t')).toBe('別落單')
  })
})

describe('召集驗血', () => {
  it('拿到基因檢測器時多一則提示；說明面板的驗血流程補上對地面使用', () => {
    expect(hintIds(view({ role: 'human', inv: inv('geneSampler') }))).toEqual(expect.arrayContaining(['sampler', 'rally']))
    expect(hintIds(view({ role: 'human' }))).not.toContain('rally')
    expect(G.TRANSIENT_HINTS.has('rally')).toBe(true)
    expect(t('guide.h.rally')).toContain('60 秒')
    expect(t('ui8.guide.th.rally')).toContain('點空地')
  })

  it('抽血集合的特效（s = rally）把集合點加進小地圖信號；其他特效不管', () => {
    const before = MP.pingBoard.active(1000).length
    expect(MP.onRallyFx({ k: 'ping', z: 3, x: 10, y: 12, v: 60, s: 'event' }, 1000)).toBe(false)
    expect(MP.pingBoard.active(1000)).toHaveLength(before)
    expect(MP.onRallyFx({ k: 'ping', z: 3, x: 10, y: 12, v: 60, s: 'rally' }, 1000)).toBe(true)
    const p = MP.pingBoard.active(1000).at(-1)!
    expect(p).toMatchObject({ z: 3, x: 10, y: 12, self: false })
  })
})

describe('死者看見真實身分', () => {
  it('開著時死者的待辦不寫附身蛞蝓仔，改提醒語音的默契；關著照舊', () => {
    expect(keysOf(view({ role: 'human', alive: false }))).toContain('guide.s.slug')
    const k = keysOf({ ...view({ role: 'human', alive: false }), ghostSight: true })
    expect(k).toContain('ui8.guide.s.ghostSight')
    expect(k).not.toContain('guide.s.slug')
    expect(t('ui8.guide.s.ghostSight')).toContain('46 秒')
    for (const w of ['46 秒', '救回', '蛞蝓仔', '勝方']) expect(t('ui8.guide.r.dead.ghost')).toContain(w)
  })

  it('說明面板的「操作」頁：觀戰的「下一個熱點」，按鍵跟著按鍵設定（預設 N）', () => {
    const row = G.HELP_EXTRA_KEYS.find((x) => x.id === 'nextHotspot')!
    expect(row.after).toBe('space')
    expect(row.key()).toBe('N')
    expect(row.text()).toBe('觀戰：跳到下一個熱點')
  })
})

describe('新的 key 都有翻譯', () => {
  it('目標面板、提示、說明用到的 key（zh／en）', () => {
    const need = new Set<string>()
    const states: View[] = [
      {
        ...withW(view({ role: 'human', inv: inv('geneSampler') }), {
          rad: 4,
          fleetPlanet: true,
          burnIn: 20,
          siege: [['nyx', 0.4]],
        }),
        zoneStation: 'verdance',
        practice: 'normal',
      },
      {
        ...withW(view({ role: 'human' }), { rad: 4, fleetPlanet: true, burnIn: 0, siege: [['nyx', 0.4]] }),
        zoneStation: 'nyx',
      },
      withW(view({ role: 'android', inv: inv('geneSampler') }), { t: 999 }),
      { ...view({ role: 'human', alive: false }), ghostSight: true },
    ]
    for (const v of states) {
      for (const s of G.objectiveFor(v)!.steps) need.add(s.key)
      for (const h of G.detectHints(v)) need.add('guide.h.' + h.id).add('guide.h.' + h.id + '.t')
    }
    for (const k of G.ROLE_TIPS.android) need.add('guide.r.' + k)
    need.add('ui8.guide.r.dead.ghost').add('ui8.guide.th.rally')
    expect([...need].filter((k) => !hasString('zh', k) || !hasString('en', k))).toEqual([])
    expect(need.size).toBeGreaterThan(15)
  })
})

describe('戰績的顯示文字', () => {
  const last = (x: Partial<LastGame>): LastGame => ({
    at: 0,
    n: 3,
    winner: 'xeno',
    duration: 1700,
    lineup: [],
    ...x,
  })
  it('上一局：勝方、贏家名單（眷屬、AI 標出來；太多人寫「等 N 人」）、平手的原因', () => {
    const l = last({
      lineup: [
        { name: 'Alice', role: 'xeno', spawn: false, won: true, bot: false },
        { name: 'Bob', role: 'xeno', spawn: true, won: true, bot: false },
        { name: 'Dr. Bot', role: 'xeno', spawn: true, won: true, bot: true },
        { name: 'Cara', role: 'human', spawn: false, won: false, bot: false },
      ],
    })
    expect(SS.lastResultText(l)).toBe('異形勝')
    expect(SS.lastWinnersText(l)).toMatch(/^Alice、Bob（眷屬）、.+（眷屬）（AI）$/)
    const crew = last({
      winner: 'crew',
      lineup: Array.from({ length: 7 }, (_, i) => ({
        name: 'P' + i,
        role: 'human' as const,
        spawn: false,
        won: true,
        bot: false,
      })),
    })
    expect(SS.lastResultText(crew)).toBe('人類陣營勝')
    expect(SS.lastWinnersText(crew)).toBe('P0、P1、P2、P3 等 3 人')
    expect(SS.lastResultText(last({ winner: 'draw', drawWhy: 'doom' }))).toBe('平手（末日倒數結束）')
    expect(SS.lastWinnersText(last({ winner: 'draw' }))).toBe('')
    expect(SS.streakText(3)).toBe('3 連勝')
    expect(SS.streakText(-2)).toBe('2 連敗')
    expect(SS.streakText(0)).toBe('')
    lang.value = 'en'
    expect(SS.lastResultText(l)).toBe('Xeno won')
    expect(SS.streakText(3)).toBe('W3')
    expect(SS.lastWinnersText(crew)).toBe('P0, P1, P2, P3 +3 more')
    lang.value = 'zh'
  })
})
