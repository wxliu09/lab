// 第 5 輪：大廳的一鍵設定（原作模式／本作預設）、調查筆記名字旁的職業與死亡標記、結算畫面「主機中止了這局」
import { readFileSync } from 'node:fs'
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
    screen: signal('game'),
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
vi.mock('../../src/client/input', async () => {
  const { signal } = await import('@preact/signals')
  return {
    typingInField: () => false,
    chatOpen: signal(false),
    evolveOpen: signal(false),
    menuOpen: signal(false),
    targetMode: signal(null),
    selected: signal(0),
    modalChecks: [],
    panelChecks: [],
    chatPassChecks: [],
    mutePassChecks: [],
    dialogOpen: () => false,
    localNotice: signal(null),
  }
})
// 結算畫面的模組會載入 3D 場景（旁觀列的站名）；這裡只測結算的文字規則
vi.mock('../../src/render/gameScene', () => ({ stationDefOf: () => undefined }))

await import('../../src/shared/content/index')
const L = await import('../../src/ui/screens/Lobby')
const N = await import('../../src/ui/hud/Investigation')
const P = await import('../../src/ui/hud/Panels')
const S = await import('../../src/client/session')
const { lang, t, hasString } = await import('../../src/ui/i18n')
const { DEFAULT_SETTINGS } = await import('../../src/shared/protocol/messages')
const { validateClientMsg } = await import('../../src/shared/protocol/validate')
const { CLASSES } = await import('../../src/shared/content/registry')
const { Harness } = await import('./helpers/harness')
const { EXTRA_EVENTS, eventsOf, originalEventsOnly } = await import('../../src/sim/systems/events')
const { shownBase } = await import('../../src/sim/game')
type ChatLine = import('../../src/shared/protocol/messages').ChatLine
type StartInfo = import('../../src/shared/protocol/messages').StartInfo
type LobbySettings = import('../../src/shared/protocol/messages').LobbySettings
type HostMsg = import('../../src/shared/protocol/messages').HostMsg

beforeEach(() => {
  lang.value = 'zh'
  calls.sent.length = 0
})

const sys = (text: string): ChatLine => ({ from: '', color: -1, ch: 'sys', text, time: 0 })

// ───────── 大廳：一鍵設定 ─────────

describe('大廳：原作模式／本作預設', () => {
  it('原作模式：末日 55–70 分（原作計時器 3300–4200 秒）、關掉原作沒有的事件、NPC 船員 0、站點自動', () => {
    expect(L.presetValues('classic')).toEqual({ apocalypse: [55, 70], extraEvents: false, npcCrew: 0, stations: 'auto' })
    expect(L.presetValues('classic').apocalypse).toEqual([3300 / 60, 4200 / 60])
    expect(L.presetValues('classic').apocalypse).toEqual([...L.APO_PRESETS.classic])
    expect([...L.PRESET_KEYS].sort()).toEqual(Object.keys(L.presetValues('classic')).sort())
  })

  it('原作沒有 NPC 船員：設計文件把 NPC 船員列為本作新增，原作研究的生物表也沒有', () => {
    const catalog = readFileSync('../docs/design/content-catalog.md', 'utf8')
    expect(catalog).toMatch(/NPC 船員（新增）.*本作新增/)
    const gdd = readFileSync('../docs/design/GDD.md', 'utf8')
    expect(gdd).toContain('**NPC 船員（改良）**')
    // 原作研究（世界與事件）的 NPC／生物表裡沒有巡邏船員
    const world = readFileSync('../docs/research/03-world-events.md', 'utf8')
    expect(world).not.toMatch(/NPC 船員|NPC crew/i)
  })

  it('本作預設：四項還原成 DEFAULT_SETTINGS；每次都給新的物件（不和設定表共用陣列）', () => {
    const m = L.presetValues('modern')
    expect(m).toEqual({ apocalypse: DEFAULT_SETTINGS.apocalypse, extraEvents: DEFAULT_SETTINGS.extraEvents, npcCrew: DEFAULT_SETTINGS.npcCrew, stations: DEFAULT_SETTINGS.stations })
    expect(m.apocalypse).not.toBe(DEFAULT_SETTINGS.apocalypse)
    m.apocalypse[0] = 99
    expect(L.presetValues('modern').apocalypse).toEqual(DEFAULT_SETTINGS.apocalypse)
    expect(L.presetValues('classic')).not.toBe(L.presetValues('classic'))
  })

  it('已選取：四項剛好等於某個模式才算；其他設定（AI、倍率…）不影響', () => {
    expect(L.modePresetOf(DEFAULT_SETTINGS)).toBe('modern')
    const classic: LobbySettings = { ...DEFAULT_SETTINGS, ...L.presetValues('classic'), bots: 5, epMult: 2, localChat: true }
    expect(L.modePresetOf(classic)).toBe('classic')
    // 任何一項不一樣就都不是
    expect(L.modePresetOf({ ...classic, apocalypse: [55, 69] })).toBeNull()
    expect(L.modePresetOf({ ...classic, extraEvents: true })).toBeNull()
    expect(L.modePresetOf({ ...classic, npcCrew: -1 })).toBeNull()
    expect(L.modePresetOf({ ...classic, npcCrew: 3 })).toBeNull()
    expect(L.modePresetOf({ ...classic, stations: ['nyx'] })).toBeNull()
    expect(L.modePresetOf({ ...DEFAULT_SETTINGS, apocalypse: [55, 70] })).toBeNull()
    expect(L.modePresetOf({ ...DEFAULT_SETTINGS, npcCrew: 0 })).toBeNull()
  })

  it('送出的設定訊息過得了主機的驗證（四項一起送，和其他設定同一種訊息）', () => {
    for (const k of L.MODE_KEYS) {
      const m = L.presetMsg(k)
      expect(m.t).toBe('settings')
      expect(validateClientMsg(m)).toEqual(m)
    }
  })

  it('真的主機：主機按原作模式→大廳設定變成原作模式；按本作預設→還原；客人送的被忽略', () => {
    const h = new Harness(77)
    const host = h.connect('host', true)
    const guest = h.connect('guest')
    h.ticks(1)
    const last = () => {
      const m = [...guest.inbox].reverse().find((x): x is Extract<HostMsg, { t: 'lobbyState' }> => x.t === 'lobbyState')
      return m!.settings
    }
    // 先改一些不相干的設定：一鍵設定不能動到它們
    host.send({ t: 'settings', s: { bots: 3, epMult: 2 } })
    host.send(L.presetMsg('classic'))
    h.ticks(1)
    expect(L.modePresetOf(last())).toBe('classic')
    expect(last()).toMatchObject({ apocalypse: [55, 70], extraEvents: false, npcCrew: 0, stations: 'auto', bots: 3, epMult: 2 })
    // 客人不能套用
    guest.send(L.presetMsg('modern'))
    h.ticks(1)
    expect(L.modePresetOf(last())).toBe('classic')
    host.send(L.presetMsg('modern'))
    h.ticks(1)
    expect(L.modePresetOf(last())).toBe('modern')
    expect(last()).toMatchObject({ apocalypse: DEFAULT_SETTINGS.apocalypse, extraEvents: true, npcCrew: -1, stations: 'auto', bots: 3, epMult: 2 })
  })

  it('真的 sim：原作模式開局→沒有 NPC 船員、只出原作有的事件、末日落在 55–70 分；本作預設的 3 人局有 NPC 船員', () => {
    const crew = (g: NonNullable<InstanceType<typeof Harness>['server']['game']>) => [...g.world.ents.values()].filter((e) => e.def.id === 'npc.crew').length
    const classic = Harness.started(3, 4242, { ...L.presetValues('classic'), eventMult: 0 }).h.server.game!
    expect(crew(classic)).toBe(0)
    expect(originalEventsOnly(classic)).toBe(true)
    expect(eventsOf(classic).apocAt).toBeGreaterThanOrEqual(3300)
    expect(eventsOf(classic).apocAt).toBeLessThanOrEqual(4200)
    expect(EXTRA_EVENTS.size).toBe(3)
    const modern = Harness.started(3, 4242, { ...L.presetValues('modern'), eventMult: 0 }).h.server.game!
    expect(crew(modern)).toBeGreaterThan(0)
    expect(originalEventsOnly(modern)).toBe(false)
    expect(eventsOf(modern).apocAt).toBeLessThanOrEqual(40 * 60)
  })

  it('說明列出各自會改的四項（值跟著設定表），其他設定不變（zh／en）', () => {
    const zh = L.presetTip('classic')
    for (const w of ['原作 55–70 分', '原作沒有的事件：關閉', 'NPC 船員：0（原作沒有 NPC 船員）', '站點：自動決定要開哪些站', '其他設定']) expect(zh).toContain(w)
    expect(zh.split('\n').filter((l) => l.startsWith('・'))).toHaveLength(L.PRESET_KEYS.length)
    expect(zh).not.toMatch(/\{\w+\}/)
    const zm = L.presetTip('modern')
    for (const w of ['快節奏 30–40 分', '原作沒有的事件：開啟', 'NPC 船員：自動（依人數）', '站點：自動決定要開哪些站']) expect(zm).toContain(w)
    lang.value = 'en'
    const en = L.presetTip('classic')
    for (const w of ['Classic 55–70 min', 'Extra events: Off', 'NPC crew: 0 (the original has no NPC crew)', 'Stations: Chosen automatically']) expect(en).toContain(w)
    expect(en.split('\n').filter((l) => l.startsWith('•'))).toHaveLength(L.PRESET_KEYS.length)
    expect(L.presetTip('modern')).toContain('Fast 30–40 min (default)')
    expect(t('ui5.lobby.preset.classic')).toBe('Classic mode')
    lang.value = 'zh'
    expect(t('ui5.lobby.preset.classic')).toBe('原作模式')
    expect(t('ui5.lobby.preset.modern')).toBe('本作預設')
  })
})

// ───────── 調查筆記：職業 ─────────

describe('調查筆記：名字旁的職業（只用看得到的人的公開職業）', () => {
  it('以顯示名字（頭銜＋本名）對上本名；看不到、匿名、沒有職業的實體都留空', () => {
    const seen = N.seenClasses([
      { n: 'Dr. Alice', cl: 'researcher' },
      { n: 'Medic Bob', cl: 'medic' },
      { n: '特務·Carol', cl: 'commissar' },
      // 異形形態、蛋、繭：快照不給名字也不給職業
      { n: '', cl: '' },
      // 載具之類：有名字沒有職業
      { n: 'Dr. Dave', cl: '' },
    ])
    expect(N.classFor('Alice', seen)).toEqual({ id: 'researcher', agent: false })
    expect(N.classFor('Bob', seen)).toEqual({ id: 'medic', agent: false })
    expect(N.classFor('Carol', seen)).toEqual({ id: 'commissar', agent: true })
    expect(N.classFor('Dave', seen)).toBeNull()
    expect(N.classFor('Eve', seen)).toBeNull()
    expect(N.classText(N.classFor('Alice', seen)!)).toBe('研究員')
    expect(N.classText(N.classFor('Carol', seen)!)).toBe('特務')
    lang.value = 'en'
    expect(N.classText(N.classFor('Bob', seen)!)).toBe('Medic')
    expect(N.classText(N.classFor('Carol', seen)!)).toBe('Agent')
  })

  it('不對沒有頭銜的本名（有人取名「Medic Bob」不會對到醫護兵 Bob）；同名兩種職業不猜', () => {
    const seen = N.seenClasses([{ n: 'Medic Bob', cl: 'medic' }])
    expect(N.classFor('Medic Bob', seen)).toBeNull()
    expect(N.titledNames('Bob')).not.toContain('Bob')
    expect(N.titledNames('Bob')).toHaveLength(CLASSES.size + 1)
    const clash = N.seenClasses([
      { n: 'Dr. Alice', cl: 'researcher' },
      { n: 'Dr. Alice', cl: 'medic' },
    ])
    expect(N.classFor('Alice', clash)).toBeNull()
  })

  it('真的 sim：看得到的人顯示他的職業；走出視野就留空；異形形態（匿名）也留空', () => {
    const { h, cs } = Harness.started(3, 31, { eventMult: 0 })
    const g = h.server.game!
    const viewer = cs[0]
    const info = viewer.inbox.find((m): m is { t: 'start'; info: StartInfo } => m.t === 'start')!.info
    const me = g.mainOf(g.players[viewer.slot]!)!
    const others = info.players.filter((p) => p.slot !== viewer.slot)
    // 把另外兩個人帶到觀看者身邊
    for (const p of others) {
      const u = g.mainOf(g.players[p.slot]!)!
      g.world.relocate(u, me.zone, me.x + 0.8, me.y)
    }
    h.ticks(3)
    for (const p of others) {
      const c = N.classFor(p.name, N.seenClasses(viewer.ents.values()))
      expect(c, p.name).toEqual({ id: g.players[p.slot]!.classId, agent: false })
    }
    // 第一個人走到看不到的地方：留空（不記憶）
    const far = others[0]
    const fu = g.mainOf(g.players[far.slot]!)!
    const other = g.world.zones.find((z) => z.id !== me.zone && z.layout)!
    g.world.relocate(fu, other.id, other.layout!.spawns[0].x, other.layout!.spawns[0].y)
    h.ticks(3)
    expect(N.classFor(far.name, N.seenClasses(viewer.ents.values()))).toBeNull()
    // 第二個人變成匿名（異形形態）：快照不給名字與職業，留空
    const anon = others[1]
    const au = g.mainOf(g.players[anon.slot]!)!
    au.anon = true
    h.ticks(3)
    expect(N.classFor(anon.name, N.seenClasses(viewer.ents.values()))).toBeNull()
  })

  it('真的 sim：通訊病毒換名後，一列本名顯示的是「現在叫這個名字的人」的頭銜，不用槽位把換過的名字對回真人', () => {
    const { h, cs } = Harness.started(4, 99, { eventMult: 0 })
    const g = h.server.game!
    const viewer = cs[0]
    const info = viewer.inbox.find((m): m is { t: 'start'; info: StartInfo } => m.t === 'start')!.info
    const me = g.mainOf(g.players[viewer.slot]!)!
    for (const p of g.allPlayers()) {
      if (p.slot === viewer.slot) continue
      g.world.relocate(g.mainOf(p)!, me.zone, me.x + 0.8, me.y)
    }
    expect(g.triggerEvent!('virus', true)).toBe(true)
    // 名字清空的 10 秒內：看得到人，但名字是空的，留空
    h.ticks(3)
    for (const p of info.players) if (p.slot !== viewer.slot) expect(N.classFor(p.name, N.seenClasses(viewer.ents.values()))).toBeNull()
    h.ticks(11 * 20)
    const seen = N.seenClasses(viewer.ents.values())
    // 這個種子確實有人換到了別人的本名
    expect(info.players.filter((p) => shownBase(g.players[p.slot]!) !== p.name).length).toBeGreaterThan(0)
    let checked = 0
    for (const p of info.players) {
      if (p.slot === viewer.slot) continue
      // 這個本名現在在誰身上（可能換給了觀看者自己），就顯示誰的職業：頭銜跟著人、本名換人
      const holder = g.allPlayers().find((q) => shownBase(q) === p.name)!
      expect(N.classFor(p.name, seen)?.id, p.name).toBe(holder.classId)
      checked++
    }
    expect(checked).toBe(3)
  })
})

// ───────── 調查筆記：死亡標記 ─────────

describe('調查筆記：已公告的死者', () => {
  it('只認系統頻道的死亡公告（六種）並取出點到的名字；私訊、沒有名字、玩家打的字都不算', () => {
    const kinds = ['mutant', 'xeno', 'android', 'xenoSpawn', 'mutantSpawn', 'innocent']
    const lines = kinds.map((k, i) => sys(`@death.${k}|name=Dr. P${i}`))
    expect(N.deathNamesIn(lines)).toEqual(kinds.map((_, i) => `Dr. P${i}`))
    expect(
      N.deathNamesIn([
        sys('@death.innocent'),
        { ...sys('@death.you'), ch: 'private' },
        { ...sys('@death.cause.named|name=Dr. X'), ch: 'private' },
        sys('@death.cause.named|name=Dr. Y'),
        { from: 'Dr. Z', color: 1, ch: 'all', text: '@death.xeno|name=Medic Bob', time: 0 },
        sys('@tl.death.xeno|name=Medic Bob'),
      ]),
    ).toEqual([])
  })

  it('依本名比對公告的顯示名字（任何頭銜都算，不含沒有頭銜的本名）', () => {
    const dead = new Set(['Medic Bob', '特務·Carol'])
    expect(N.announcedDead('Bob', dead)).toBe(true)
    expect(N.announcedDead('Carol', dead)).toBe(true)
    expect(N.announcedDead('Alice', dead)).toBe(false)
    // 有人取名「Medic Bob」：公告的是醫護兵 Bob，不是他
    expect(N.announcedDead('Medic Bob', dead)).toBe(false)
  })

  it('真的 sim：有人死了，全場公告點名；只有他被標成已死亡', () => {
    const { h, cs } = Harness.started(4, 5, { eventMult: 0 })
    const g = h.server.game!
    const viewer = cs[0]
    const info = viewer.inbox.find((m): m is { t: 'start'; info: StartInfo } => m.t === 'start')!.info
    const victim = info.players.find((p) => p.slot !== viewer.slot)!
    g.kill(g.mainOf(g.players[victim.slot]!)!, null)
    h.ticks(3)
    const lines = viewer.inbox.flatMap((m) => (m.t === 'chat' ? m.lines : []))
    const dead = new Set(N.deathNamesIn(lines))
    expect(dead.size).toBe(1)
    for (const p of info.players) if (p.slot !== viewer.slot) expect(N.announcedDead(p.name, dead), p.name).toBe(p.slot === victim.slot)
  })

  it('監看死亡公告：聊天紀錄只留 200 行也不會漏；換一局清空、上一局留下的訊息不算；同一局重連保留', () => {
    const push = (lines: ChatLine[]) => (S.chatLog.value = [...S.chatLog.value, ...lines].slice(-200))
    const start = (gid: number, seed = gid) => (S.startInfo.value = { slot: 0, seed, stations: [], zones: [], players: [], spectator: false, gid })
    start(1)
    S.chatLog.value = []
    N.watchDeaths()
    N.watchDeaths()
    push([sys('@death.xeno|name=Dr. Alice')])
    expect([...N.heardDead.value]).toEqual(['Dr. Alice'])
    // 之後聊了很多：公告早就被擠出 chatLog，標記還在
    for (let i = 0; i < 30; i++) push(Array.from({ length: 10 }, (_, j) => ({ from: 'Medic Bob', color: 1, ch: 'all' as const, text: `hi ${i}-${j}`, time: 0 })))
    expect(S.chatLog.value.some((l) => l.text.startsWith('@death.'))).toBe(false)
    expect(N.heardDead.value.has('Dr. Alice')).toBe(true)
    push([sys('@death.innocent|name=Medic Bob')])
    expect(N.heardDead.value).toEqual(new Set(['Dr. Alice', 'Medic Bob']))
    // 同一局重連（gid 相同、startInfo 換了新物件）：保留
    start(1)
    expect(N.heardDead.value.size).toBe(2)
    // 換一局：上一局的公告還在 chatLog 裡（session 隨後才清空），不算
    push([sys('@death.android|name=Ace Carol')])
    start(2)
    expect(N.heardDead.value.size).toBe(0)
    S.chatLog.value = []
    expect(N.heardDead.value.size).toBe(0)
    push([sys('@death.mutant|name=CEO Dave')])
    expect([...N.heardDead.value]).toEqual(['CEO Dave'])
  })

  it('文字（zh／en）', () => {
    expect(t('ui5.notes.dead')).toBe('† 已死亡')
    expect(t('ui5.notes.deadBody')).toContain('死亡公告')
    expect(t('ui5.notes.classBody')).toContain('看不到就留空')
    lang.value = 'en'
    expect(t('ui5.notes.dead')).toBe('† Dead')
    expect(t('ui5.notes.classBody')).toContain('in your view')
  })
})

// ───────── 結算：主機中止 ─────────

describe('結算畫面：主機中止了這局', () => {
  type End = import('../../src/shared/protocol/messages').EndResult
  const end = (x: Partial<End> & { winner: End['winner'] }): End => ({ players: [], timeline: [], duration: 0, ...x })

  it('主機中止（winner = aborted、abortWhy = host；沒帶原因的 aborted 也算）→ 標題下一行是「主機中止了這局」；平手照舊顯示原因', () => {
    expect(P.endNoteKey(end({ winner: 'aborted', abortWhy: 'host' }))).toBe('ui5.end.aborted')
    expect(P.endNoteKey(end({ winner: 'aborted' }))).toBe('ui5.end.aborted')
    expect(P.endNoteKey(end({ winner: 'draw', drawWhy: 'doom' }))).toBe('end.drawWhy.doom')
    expect(P.endNoteKey(end({ winner: 'draw', drawWhy: 'wipe' }))).toBe('end.drawWhy.wipe')
    expect(P.endNoteKey(end({ winner: 'draw', drawWhy: 'other' }))).toBeNull()
    expect(P.endNoteKey(end({ winner: 'crew', timeline: [{ t: 0, text: 'end.aborted' }] }))).toBeNull()
    // 標題本來就照勝方：中止是「本局中止」
    expect(t('end.aborted')).toBe('本局中止')
  })

  it('文字：「主機中止了這局：以下是所有人的身分」（zh／en 都有）', () => {
    expect(t('ui5.end.aborted')).toBe('主機中止了這局：以下是所有人的身分')
    for (const l of ['zh', 'en'] as const) {
      expect(hasString(l, 'ui5.end.aborted')).toBe(true)
      expect(hasString(l, 'end.aborted')).toBe(true)
    }
    lang.value = 'en'
    expect(t('ui5.end.aborted')).toContain('host aborted')
  })

  it('真的 sim：主機送 abort → 每個人收到的結算都顯示「主機中止了這局」，名單列出所有人的身分；除錯指令的平手不會', () => {
    const { h, cs } = Harness.started(3, 8, { eventMult: 0 })
    cs[0].send({ t: 'abort' })
    h.ticks(1)
    for (const c of cs) {
      const got = c.inbox.find((m): m is Extract<HostMsg, { t: 'end' }> => m.t === 'end')
      expect(got, c.peer).toBeTruthy()
      expect(P.endNoteKey(got!.result)).toBe('ui5.end.aborted')
      expect(got!.result.players).toHaveLength(3)
      for (const p of got!.result.players) expect(p.role).toBeTruthy()
    }
    const other = Harness.started(3, 9, { eventMult: 0 })
    other.h.server.game!.endGame('draw')
    other.h.ticks(1)
    const r = other.cs[1].inbox.find((m): m is Extract<HostMsg, { t: 'end' }> => m.t === 'end')!.result
    expect(P.endNoteKey(r)).toBeNull()
  })
})
