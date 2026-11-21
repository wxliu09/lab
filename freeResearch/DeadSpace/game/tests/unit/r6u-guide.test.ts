// 第 6 輪（付費玩家第一晚審查）介面：駕船指引、EP 已達標的寫法、被寄生的說明不重複
import { describe, expect, it, vi } from 'vitest'
import type { PrivateState } from '../../src/shared/protocol/messages'

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
    startInfo: signal(null),
    lobby: signal(null),
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

const G = await import('../../src/ui/hud/Guide')
const { hasString, lang, t } = await import('../../src/ui/i18n')
type View = Parameters<typeof G.objectiveFor>[0]

function ab(...ids: string[]): PrivateState['abilities'] {
  return ids.map((id) => ({ id, cd: 0, maxCd: 0, mana: 0 }))
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
const stepsOf = (v: View) => G.objectiveFor(v)!.steps

describe('駕駛中的指引（目標面板）', () => {
  // 紅隼級的技能列：酬載、超載、掃描、強行登艦、停靠 → 停靠在第 5 格（D）
  const kestrel = ab('ship.payload', 'ship.overload', 'ship.scan', 'ship.board', 'ship.dock')

  it('駕船：第一條是右鍵移動、停靠（快捷鍵照指令卡）、B 離開控制台', () => {
    const s = stepsOf(view({ role: 'human', abilities: kestrel }, { ctrl: 'ship.kestrel' }))
    expect(s[0]).toMatchObject({ key: 'ui6.guide.s.pilotShip', args: { k: 'D' } })
    lang.value = 'zh'
    const zh = t(s[0].key, s[0].args)
    expect(zh).toContain('右鍵移動')
    expect(zh).toContain('D')
    expect(zh).toContain('停靠')
    expect(zh).toContain('B 離開控制台')
    expect(zh).toContain('小地圖')
    // 技能名稱在組步驟時就依目前語言取（目標面板每個快照重組）
    lang.value = 'en'
    const se = stepsOf(view({ role: 'human', abilities: kestrel }, { ctrl: 'ship.kestrel' }))
    const en = t(se[0].key, se[0].args)
    expect(en).toContain('right-click')
    expect(en).toContain('Dock')
    expect(en).toContain('B to leave')
    lang.value = 'zh'
  })

  it('只有 3 個技能的船：停靠的快捷鍵跟著變（E）；任何身分都有；救生艙不重複（有自己的說明）', () => {
    const small = ab('ship.scan', 'ship.board', 'ship.dock')
    expect(stepsOf(view({ role: 'xeno', abilities: small }, { ctrl: 'ship.fighter' }))[0].args?.k).toBe('E')
    expect(stepsOf(view({ role: 'mutant', abilities: small }, { ctrl: 'ship.fighter' }))[0].key).toBe(
      'ui6.guide.s.pilotShip',
    )
    expect(G.pilotStep({}, 'ship.pod')).toBe(null)
    expect(G.pilotStep({}, undefined)).toBe(null)
    // 沒有停靠技能（例如資料缺漏）：不寫停靠
    expect(G.pilotStep({ abilities: ab('ship.scan') }, 'ship.kestrel')).toEqual({
      key: 'ui6.guide.s.pilotShipNoDock',
    })
    // 死者不顯示
    expect(
      stepsOf(view({ role: 'human', alive: false, abilities: kestrel }, { ctrl: 'ship.kestrel' })).map(
        (x) => x.key,
      ),
    ).not.toContain('ui6.guide.s.pilotShip')
  })

  it('駕駛站點：會動的站寫右鍵移動；防禦無人機另有說明', () => {
    expect(G.pilotStep({}, 'station.bravado')).toEqual({ key: 'ui6.guide.s.pilotStation' })
    expect(G.pilotStep({}, 'station.hulk7')).toEqual({ key: 'ui6.guide.s.pilotFixed' })
    expect(G.pilotStep({}, 'npc.defenseDrone')).toEqual({ key: 'ui6.guide.s.pilotDrone' })
    for (const k of [
      'ui6.guide.s.pilotShip',
      'ui6.guide.s.pilotShipNoDock',
      'ui6.guide.s.pilotStation',
      'ui6.guide.s.pilotFixed',
      'ui6.guide.s.pilotDrone',
    ])
      for (const l of ['zh', 'en'] as const) expect([l, k, hasString(l, k)]).toEqual([l, k, true])
  })

  it('沒在駕駛時不出現', () => {
    expect(stepsOf(view({ role: 'human' })).map((x) => x.key)).not.toContain('ui6.guide.s.pilotShip')
  })
})

describe('EP 條的小字', () => {
  it('達標但還不能選：寫「進化中」或「EP 已足夠」，不寫「還差 0」', () => {
    lang.value = 'zh'
    expect(G.epLeftText({ ep: 512, next: 300, ready: false }, true)).toBe('進化中')
    expect(G.epLeftText({ ep: 512, next: 300, ready: false }, false)).toBe('EP 已足夠')
    expect(G.epLeftText({ ep: 512, next: 300, ready: true }, false)).toBe(t('guide.epReady'))
    expect(G.epLeftText({ ep: 94, next: 300, ready: false }, false)).toBe('還差 206')
    lang.value = 'en'
    expect(G.epLeftText({ ep: 512, next: 300, ready: false }, false)).not.toMatch(/\b0 to go/)
    expect(G.epLeftText({ ep: 300, next: 300, ready: false }, true)).toBe('Evolving')
    lang.value = 'zh'
  })
})

describe('被寄生的說明只出現在一個主要位置', () => {
  it('不另外跳情境提示；目標面板的紅色待辦還在；朊毒照舊提示', () => {
    const v = view({ role: 'human' }, { self: { d: 'personnel', hp: 400, mhp: 400, b: ['bf.parasite'] } })
    expect(G.detectHints(v).map((h) => h.id)).not.toContain('parasited')
    expect(stepsOf(v)[0]).toMatchObject({ danger: true })
    expect(
      G.detectHints(
        view({ role: 'human' }, { self: { d: 'personnel', hp: 400, mhp: 400, b: ['bf.prionStrong'] } }),
      ).map((h) => h.id),
    ).toContain('prioned')
  })
})
