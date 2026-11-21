// 第 6 輪（付費玩家第一晚審查）介面：文字錯誤與矛盾、範圍傷害的說明、訊息路由（中央與聊天紀錄不重複）、設定即時存檔、按鈕不留焦點
import { afterEach, describe, expect, it, vi } from 'vitest'
import type { ChatLine } from '../../src/shared/protocol/messages'

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
  return {
    world: new ClientWorld(),
    snapTick: signal(0),
    screen: signal('game'),
    startInfo: signal(null),
    lobby: signal(null),
    chatTaps: [],
    send: () => {},
    sendCmd: () => {},
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
  }
})

const A = await import('../../src/ui/hud/Announce')
const C = await import('../../src/ui/hud/Codex')
const { hasString, lang, sysText, t } = await import('../../src/ui/i18n')
const { UI6_EN, UI6_ZH } = await import('../../src/ui/strings/ui6')
const { hitsBystanders } = await import('../../src/ui/aoe')
const { itemTip } = await import('../../src/ui/itemTip')
const { splitKeyHint } = await import('../../src/ui/hud/Investigation')
const { parseTurn } = await import('../../src/ui/screens/Settings')
const { shouldBlurAfterClick } = await import('../../src/ui/hud/clickBlur')
await import('../../src/ui/strings/sim6')
const { ALL_STATIONS } = await import('../../src/shared/content/stations/index')

afterEach(() => {
  lang.value = 'zh'
})

describe('ui6 字串', () => {
  it('兩種語言的 key 一樣、都不是空字串', () => {
    expect(Object.keys(UI6_EN).sort()).toEqual(Object.keys(UI6_ZH).sort())
    for (const [k, v] of Object.entries({ ...UI6_ZH, ...UI6_EN }))
      expect([k, v.trim().length > 0]).toEqual([k, true])
  })
})

describe('主選單與設定不像開發工具', () => {
  it('頁尾寫玩家看得懂的說法，不提 nostr／signaling', () => {
    for (const l of ['zh', 'en'] as const) {
      lang.value = l
      expect(t('menu.netHint')).not.toMatch(/nostr|mqtt|torrent|signal|\{strategy\}/i)
    }
    lang.value = 'zh'
    expect(t('menu.netHint')).toContain('點對點')
    lang.value = 'en'
    expect(t('menu.netHint')).toMatch(/peer-to-peer/i)
  })

  it('TURN 輸入：空白 = 不用、陣列才存、格式不對回傳 null（不存、保留上一次的）', () => {
    expect(parseTurn('')).toEqual([])
    expect(parseTurn('  ')).toEqual([])
    expect(parseTurn('[{"urls":"turn:x"}]')).toEqual([{ urls: 'turn:x' }])
    expect(parseTurn('{"urls":"turn:x"}')).toBe(null)
    expect(parseTurn('[{"urls":')).toBe(null)
  })
})

describe('文字錯誤與矛盾', () => {
  it('存活人數的說明和死亡公告一致：公告會點名', () => {
    lang.value = 'zh'
    expect(t('r3b.alive.body')).not.toContain('不說是誰')
    expect(t('r3b.alive.body')).toContain('名字')
    expect(sysText('@death.innocent|name=Bob')).toContain('Bob')
    lang.value = 'en'
    expect(t('r3b.alive.body')).not.toMatch(/not who/)
  })

  it('圖鑑地點：活體庫號、擺渡號每局都在；火口號寫實際條件（7 人以上、要有工程師）', () => {
    const sub = (id: string) => t(C.placeWhenKey(id, ALL_STATIONS.find((s) => s.id === id)!.enable))
    expect(sub('vivarium')).toBe(t('codex.enable.core'))
    expect(sub('portage')).toBe(t('codex.enable.core'))
    expect(sub('nyx')).toBe(t('codex.enable.core'))
    expect(sub('caldera')).toContain('7')
    expect(sub('pirate')).toBe(t('codex.enable.event'))
    for (const s of ALL_STATIONS)
      expect([s.id, t(C.placeWhenKey(s.id, s.enable))]).not.toEqual([s.id, t('codex.enable.auto')])
    expect(t('ui6.codex.place.calderaWhen')).toContain('工程師')
  })

  it('調查筆記標題：按鍵部分另外包起來，不被全大寫樣式變成 TAB', () => {
    lang.value = 'zh'
    expect(splitKeyHint(t('notes.title'))).toEqual(['調查筆記', '（Tab）'])
    lang.value = 'en'
    expect(splitKeyHint(t('notes.title'))).toEqual(['Investigation notes', ' (Tab)'])
    expect(splitKeyHint('Notes')).toEqual(['Notes', ''])
  })

  it('圖鑑的 NPC 船員：寫出被打傷會反擊', () => {
    expect(t('codex.ai.crew.body')).toContain('反擊')
    lang.value = 'en'
    expect(t('codex.ai.crew.body')).toMatch(/fights back/)
  })
})

describe('範圍傷害會波及 NPC 船員', () => {
  it('範圍傷害的技能與道具：tooltip 補一句；單體技能、太空技能不補', () => {
    for (const id of [
      'ab.tesla.charge',
      'ab.rocket.halberd',
      'ab.rocket.missile',
      'ab.plasma.ball',
      'ab.pyro.kidot',
      'ab.item.frag',
      'ab.item.phaseCannon',
      'ab.item.fusion',
      'ab.chassis.prismRockets',
      'ab.rig.rdgDetonate',
    ])
      expect([id, hitsBystanders(id)]).toEqual([id, true])
    for (const id of [
      'ship.payload',
      'ship.barrage',
      'drone.rockets',
      'xeno.parasite',
      'ab.item.antibody',
      'nope',
    ])
      expect([id, hitsBystanders(id)]).toEqual([id, false])
    lang.value = 'zh'
    expect(itemTip('fragGrenade')?.hint).toContain('NPC 船員')
    expect(itemTip('phaseCannon', { hint: '左鍵使用' })?.hint).toBe('左鍵使用\n' + t('ui6.tip.aoeCrew'))
    // 普攻會爆炸的火箭裝
    expect(itemTip('suit.rocket')?.hint ?? '').toContain('NPC 船員')
    expect(itemTip('suit.service')?.hint ?? '').not.toContain('NPC 船員')
    expect(itemTip('traumaKit')?.hint ?? '').not.toContain('NPC 船員')
  })
})

describe('訊息路由：每則訊息只在一個主要位置完整出現', () => {
  const line = (text: string, ch: ChatLine['ch'] = 'private'): ChatLine =>
    ({ ch, text, from: '', color: -1 }) as ChatLine

  it('私人訊息：短的小提示顯示全文；太長（被寄生的完整說明）只顯示第一句、標「詳見聊天」', () => {
    lang.value = 'zh'
    const [short, m1] = A.toastText('@git.msg.notPerson')
    expect([short, m1]).toEqual([sysText('@git.msg.notPerson'), false])
    const [head, m2] = A.toastText('@infect.parasite')
    expect(m2).toBe(true)
    expect(head).toBe('你被異形寄生了')
    lang.value = 'en'
    const [enHead, m3] = A.toastText('@infect.parasite')
    expect(m3).toBe(true)
    expect(enHead.length).toBeLessThan(sysText('@infect.parasite').length / 2)
  })

  it('中央完整顯示過的訊息：聊天紀錄平常不重複列出；只顯示標題、第一句的照常列全文；新聞、玩家聊天不上中央', () => {
    lang.value = 'zh'
    const a = line('@git.msg.notPerson')
    const b = line('@infect.parasite')
    const c = line('@death.innocent|name=Bob', 'sys')
    const d = line('@event.tenshu|s=180', 'sys')
    const e = line('@news.1', 'sys')
    const f = { ...line('hello', 'all'), from: 'Ann', color: 1 } as ChatLine
    const items = A.routeLines([a, b, c, d, e, f], 0)
    expect(items.map((x) => [x.kind, !!x.more])).toEqual([
      ['ok', false],
      ['ok', true],
      ['sys', false],
      ['event', true],
    ])
    expect([a, b, c, d, e, f].map((l) => A.shownCentrally(l))).toEqual([
      true,
      false,
      true,
      false,
      false,
      false,
    ])
    // 私人訊息的小提示至少 4.2 秒，長一點的依字數給到讀得完
    expect(items[0].life).toBeGreaterThan(4200)
    expect(items[1].life).toBeGreaterThanOrEqual(4200)
  })
})

describe('按鈕用滑鼠點完不留焦點（鍵盤觸發的保留）', () => {
  /** 假元素：closest 依選擇器回傳自己或 null */
  const el = (inScope: boolean, clickable = true) => {
    const self: Record<string, unknown> = { blur: () => {} }
    self.closest = (sel: string) => (sel.includes('button') ? (clickable ? self : null) : inScope ? {} : null)
    return self as unknown as Element
  }
  it('對局畫面裡的按鈕：滑鼠點（detail ≥ 1）放掉焦點，鍵盤（detail 0）保留；畫面外、非按鈕不管', () => {
    expect(shouldBlurAfterClick(1, el(true))).toBe(true)
    expect(shouldBlurAfterClick(2, el(true))).toBe(true)
    expect(shouldBlurAfterClick(0, el(true))).toBe(false)
    expect(shouldBlurAfterClick(1, el(false))).toBe(false)
    expect(shouldBlurAfterClick(1, el(true, false))).toBe(false)
    expect(shouldBlurAfterClick(1, null)).toBe(false)
  })
})

describe('所有 ui6 用到的 key 都註冊了', () => {
  it('兩種語言都有', () => {
    for (const k of Object.keys(UI6_ZH))
      for (const l of ['zh', 'en'] as const) expect([l, k, hasString(l, k)]).toEqual([l, k, true])
  })
})
