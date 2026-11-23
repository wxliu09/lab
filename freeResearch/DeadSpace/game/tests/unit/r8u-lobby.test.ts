// 第 8 輪 U8：大廳的一鍵設定（小隊地圖、老手節奏）、客人的唯讀標示摘要、「死者看見真實身分」、ui8 字串
import { beforeEach, describe, expect, it, vi } from 'vitest'

const calls = vi.hoisted(() => ({ sent: [] as unknown[] }))

vi.mock('../../src/client/session', async () => {
  const { signal } = await import('@preact/signals')
  const { ClientWorld } = await import('../../src/client/world')
  return {
    world: new ClientWorld(),
    snapTick: signal(0),
    startInfo: signal(null),
    lobby: signal(null),
    chatLog: signal([]),
    chatTaps: [],
    cmdTaps: [],
    screen: signal('lobby'),
    endResult: signal(null),
    hostConflict: signal(false),
    isHost: signal(true),
    mySlot: signal(0),
    send: (m: unknown) => calls.sent.push(m),
    sendCmd: () => {},
    leave: () => {},
    currentRoom: () => 'ABCDE',
    loadProfile: () => ({ name: 'Alice', color: 3 }),
    startPractice: () => {},
  }
})

await import('../../src/shared/content/index')
const L = await import('../../src/ui/screens/Lobby')
const { lang, t } = await import('../../src/ui/i18n')
const { UI8_ZH, UI8_EN } = await import('../../src/ui/strings/ui8')
const { DEFAULT_SETTINGS } = await import('../../src/shared/protocol/messages')
const { validateClientMsg } = await import('../../src/shared/protocol/validate')
const { Harness } = await import('./helpers/harness')
type LobbySettings = import('../../src/shared/protocol/messages').LobbySettings
type HostMsg = import('../../src/shared/protocol/messages').HostMsg

beforeEach(() => {
  lang.value = 'zh'
  calls.sent.length = 0
})

const apply = (s: LobbySettings, m: { s: Partial<LobbySettings> }): LobbySettings => ({ ...s, ...m.s })

describe('老手節奏 40–50 分', () => {
  it('末日時間多一種節奏（短到長排列）；過得了主機的驗證；原作模式不變', () => {
    expect(L.APO_PRESETS.veteran).toEqual([40, 50])
    expect(Object.keys(L.APO_PRESETS)).toEqual(['fast', 'veteran', 'classic'])
    expect(L.apoPresetOf([40, 50])).toBe('veteran')
    const m = { t: 'settings', s: { apocalypse: [40, 50] } }
    expect(validateClientMsg(m)).toEqual(m)
    expect(L.presetValues('classic')).toEqual({
      apocalypse: [55, 70],
      extraEvents: false,
      npcCrew: 0,
      stations: 'auto',
    })
    expect(L.apoLabel('veteran')).toBe('老手節奏 40–50 分')
    expect(L.apoLabel('fast')).toBe('快節奏 30–40 分（預設）')
    expect(L.apoTip()).toContain('老手節奏 40–50 分')
    lang.value = 'en'
    expect(L.apoLabel('veteran')).toBe('Veteran 40–50 min')
    expect(L.apoTip()).not.toMatch(/\{\w+\}/)
  })

  it('開關：按一次變 40–50，再按一次回到快節奏；只改末日時間', () => {
    const on = apply(DEFAULT_SETTINGS, L.extraMsg('veteran', DEFAULT_SETTINGS))
    expect(on.apocalypse).toEqual([40, 50])
    expect(L.extraOn('veteran', on)).toBe(true)
    expect(L.extraMsg('veteran', on).s).toEqual({ apocalypse: [30, 40] })
    expect(L.extraOn('veteran', DEFAULT_SETTINGS)).toBe(false)
    // 從原作模式按：也是變成 40–50（關掉時回到快節奏）
    const classic = { ...DEFAULT_SETTINGS, ...L.presetValues('classic') }
    expect(L.extraMsg('veteran', classic).s).toEqual({ apocalypse: [40, 50] })
    expect(L.extraLabel('veteran')).toBe('老手節奏 40–50 分')
    const tip = L.extraTip('veteran')
    for (const w of ['40–50', '30–40', '55–70', 'T3', '再按一次']) expect(tip).toContain(w)
  })

  it('真的 sim：老手節奏開局，末日落在 40–50 分', async () => {
    const { eventsOf } = await import('../../src/sim/systems/events')
    for (const seed of [1, 2, 3]) {
      const g = Harness.started(3, seed, { apocalypse: [40, 50], eventMult: 0 }).h.server.game!
      expect(eventsOf(g).apocAt).toBeGreaterThanOrEqual(40 * 60)
      expect(eventsOf(g).apocAt).toBeLessThanOrEqual(50 * 60)
    }
  })
})

describe('小隊地圖（6 人以下）', () => {
  it('用站點指定：送 [\'-hulk7\']（只開核心站、再關七號廢站）；按第二次回到自動；過得了主機的驗證', () => {
    const msg = L.extraMsg('small', DEFAULT_SETTINGS)
    expect(msg).toEqual({ t: 'settings', s: { stations: ['-hulk7'] } })
    expect(validateClientMsg(msg)).toEqual(msg)
    const on = apply(DEFAULT_SETTINGS, msg)
    expect(L.extraOn('small', on)).toBe(true)
    expect(L.extraMsg('small', on).s).toEqual({ stations: 'auto' })
    // 其他指定清單不算小隊地圖
    expect(L.extraOn('small', { ...DEFAULT_SETTINGS, stations: ['vivarium'] })).toBe(false)
    expect(L.smallMapStations()).not.toBe(L.smallMapStations())
    expect(L.SMALL_MAP_OFF).toEqual(['vivarium', 'portage', 'hulk7'])
  })

  it('說明寫出關掉的站名（跟著站點資料）、人太多時提醒；en 也有', () => {
    const tip = L.extraTip('small', 4)
    for (const w of ['活體庫號', '擺渡號', '七號廢站', '6 人以下', '自動']) expect(tip).toContain(w)
    expect(tip).not.toContain('建議關掉小隊地圖')
    expect(L.extraTip('small', 9)).toContain('9 名參戰者')
    expect(L.extraLabel('small')).toBe('小隊地圖（6 人以下）')
    lang.value = 'en'
    const en = L.extraTip('small', 9)
    for (const w of ['Vivarium', 'Portage', '9 players']) expect(en).toContain(w)
    expect(en).not.toMatch(/\{\w+\}/)
  })

  it('真的 sim：小隊地圖開局沒有活體庫號、擺渡號、七號廢站；自動選站時三站都在', () => {
    const small = Harness.started(5, 11, { stations: L.smallMapStations(), eventMult: 0 }).h.server.game!
    expect(small.stations).not.toContain('vivarium')
    expect(small.stations).not.toContain('portage')
    expect(small.stations).not.toContain('hulk7')
    for (const id of ['nyx', 'adjudicatrix', 'bravado', 'tenshu', 'verdance']) expect(small.stations).toContain(id)
    const auto = Harness.started(5, 11, { eventMult: 0 }).h.server.game!
    expect(auto.stations).toContain('vivarium')
    expect(auto.stations).toContain('portage')
    expect(auto.stations).toContain('hulk7')
    // 「-站名」只關核心站；其他指定照舊：列出的自動站打開、沒列的核心站照開
    const pick = Harness.started(5, 11, { stations: ['vivarium'], eventMult: 0 }).h.server.game!
    expect(pick.stations).toContain('vivarium')
    expect(pick.stations).toContain('hulk7')
    expect(pick.stations).not.toContain('portage')
  })

  it('真的主機：主機按小隊地圖→大廳設定變成只開核心站；客人送的被忽略；再按一次回到自動', () => {
    const h = new Harness(5)
    const host = h.connect('host', true)
    const guest = h.connect('guest')
    h.ticks(1)
    const last = () => [...guest.inbox].reverse().find((x): x is Extract<HostMsg, { t: 'lobbyState' }> => x.t === 'lobbyState')!.settings
    guest.send(L.extraMsg('small', last()))
    h.ticks(1)
    expect(last().stations).toBe('auto')
    host.send(L.extraMsg('small', last()))
    h.ticks(1)
    expect(last().stations).toEqual(['-hulk7'])
    expect(L.extraOn('small', last())).toBe(true)
    host.send(L.extraMsg('small', last()))
    h.ticks(1)
    expect(last().stations).toBe('auto')
  })
})

describe('標題列的摘要（客人的唯讀標示）', () => {
  it('符合的模式＋開著的加選；都沒有是「自訂」；AI、倍率之類不影響', () => {
    expect(L.presetSummary(DEFAULT_SETTINGS)).toBe('本作預設')
    expect(L.presetSummary({ ...DEFAULT_SETTINGS, bots: 3, epMult: 2 })).toBe('本作預設')
    expect(L.presetSummary({ ...DEFAULT_SETTINGS, ...L.presetValues('classic') })).toBe('原作模式')
    expect(L.presetSummary({ ...DEFAULT_SETTINGS, stations: ['-hulk7'] })).toBe('小隊地圖（6 人以下）')
    expect(L.presetSummary({ ...DEFAULT_SETTINGS, stations: ['-hulk7'], apocalypse: [40, 50] })).toBe('小隊地圖（6 人以下）・老手節奏 40–50 分')
    // 舊版的空清單（只開核心站）不算小隊地圖
    expect(L.presetSummary({ ...DEFAULT_SETTINGS, stations: [] })).toBe('自訂')
    expect(L.presetSummary({ ...DEFAULT_SETTINGS, npcCrew: 3 })).toBe('自訂')
    expect(t('ui8.lobby.hostSets', { list: '本作預設' })).toBe('主機設定：本作預設')
    lang.value = 'en'
    expect(L.presetSummary({ ...DEFAULT_SETTINGS, npcCrew: 3 })).toBe('Custom')
    expect(t('ui8.lobby.hostSets', { list: 'Default mode' })).toBe('Host’s settings: Default mode')
  })
})

describe('死者看見真實身分', () => {
  it('預設關；開關過得了主機的驗證；說明講清楚只影響死者與旁觀者、語音的默契、不能附身蛞蝓仔', () => {
    expect(DEFAULT_SETTINGS.ghostSight).toBe(false)
    expect(validateClientMsg({ t: 'settings', s: { ghostSight: true } })).toEqual({
      t: 'settings',
      s: { ghostSight: true },
    })
    const zh = t('ui8.lobby.tip.ghostSight')
    for (const w of ['死者', '旁觀者', '活著的人', '語音', '蛞蝓仔']) expect(zh).toContain(w)
    // 死者組實際做出的規則：約 46 秒後才看得見（只主持的旁觀者開局就看得見）、看過就救不回來、亡靈預言只能押勝方
    for (const w of ['46 秒', '急救', '開局就看得見', '時滯喚回', '記憶核心', '亡靈預言', '勝方']) expect(zh).toContain(w)
    lang.value = 'en'
    const en = t('ui8.lobby.tip.ghostSight')
    for (const w of ['dead', 'spectators', 'living', 'voice chat', 'sluglings', '46 s', 'first aid', 'from the start', 'temporal recall', 'memory core', 'prophecy', 'winning side'])
      expect(en).toContain(w)
  })
})

describe('ui8 字串', () => {
  const ph = (s: string) => [...s.matchAll(/\{(\w+)\}/g)].map((m) => m[1]).sort()

  it('zh 與 en 的 key、佔位符一致；英文用 ’ 不用直撇號', () => {
    expect(Object.keys(UI8_EN).sort()).toEqual(Object.keys(UI8_ZH).sort())
    for (const k of Object.keys(UI8_ZH)) expect([k, ph(UI8_EN[k])]).toEqual([k, ph(UI8_ZH[k])])
    for (const [k, v] of Object.entries(UI8_EN)) expect([k, v.includes("'")]).toEqual([k, false])
    for (const [k, v] of Object.entries(UI8_ZH)) expect([k, v.trim().length > 0]).toEqual([k, true])
  })
})
