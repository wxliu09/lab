// 第 4 輪（老手／多人公平視角）的介面修正：大廳的末日節奏與「原作沒有的事件」、調查筆記的本機封鎖、
// 說明面板的操作表（小地圖信號、-list 群組）、防護服擋不住寄生與朊毒的說法、en 的 anomaly 只留給生物。
import { beforeEach, describe, expect, it, vi } from 'vitest'

vi.mock('../../src/client/session', async () => {
  const { signal } = await import('@preact/signals')
  const { ClientWorld } = await import('../../src/client/world')
  return {
    world: new ClientWorld(),
    snapTick: signal(0),
    startInfo: signal(null),
    lobby: signal(null),
    chatLog: signal([]),
    hostConflict: signal(false),
    isHost: signal(true),
    mySlot: signal(0),
    send: () => {},
    sendCmd: () => {},
    leave: () => {},
    currentRoom: () => 'ABCDE',
    loadProfile: () => ({ name: 'Alice', color: 3 }),
    startPractice: () => {},
  }
})
vi.mock('../../src/client/input', async () => {
  const { signal } = await import('@preact/signals')
  return { typingInField: () => false, chatOpen: signal(false), evolveOpen: signal(false), menuOpen: signal(false), targetMode: signal(null), selected: signal(0), modalChecks: [], panelChecks: [], dialogOpen: () => false, localNotice: signal(null) }
})

await import('../../src/shared/content/index')
const L = await import('../../src/ui/screens/Lobby')
const N = await import('../../src/ui/hud/Investigation')
const { clearMuted, isMuted, mutedNames } = await import('../../src/client/mute')
const { hasString, lang, t } = await import('../../src/ui/i18n')
const { DEFAULT_SETTINGS } = await import('../../src/shared/protocol/messages')
const { validateClientMsg } = await import('../../src/shared/protocol/validate')
const { GUIDE_EN, GUIDE_ZH, HELP_CONTROLS } = await import('../../src/ui/strings/guide')
const { CODEX_EN, CODEX_ZH } = await import('../../src/ui/strings/codex')
const { UI4_EN, UI4_ZH } = await import('../../src/ui/strings/ui4')
const { UI5_EN, UI5_ZH } = await import('../../src/ui/strings/ui5')
const { BIOS, OBJECTIVES } = await import('../../src/ui/strings/bios')
const { CLASSES } = await import('../../src/shared/content/registry')
const { Harness } = await import('./helpers/harness')
const { EXTRA_EVENTS, eventsOf } = await import('../../src/sim/systems/events')
const { shownBase } = await import('../../src/sim/game')
type ChatLine = import('../../src/shared/protocol/messages').ChatLine
type StartInfo = import('../../src/shared/protocol/messages').StartInfo

beforeEach(() => {
  lang.value = 'zh'
  clearMuted()
})

describe('大廳：末日時間二選一', () => {
  it('快節奏＝本作預設、原作＝55–70 分（原作計時器 3300–4200 秒）；兩種都過得了主機的設定驗證', () => {
    expect(L.APO_PRESETS.fast).toEqual(DEFAULT_SETTINGS.apocalypse)
    expect(L.APO_PRESETS.classic).toEqual([3300 / 60, 4200 / 60])
    for (const k of ['fast', 'classic'] as const) {
      const a = [...L.APO_PRESETS[k]]
      expect(validateClientMsg({ t: 'settings', s: { apocalypse: a } })).toEqual({ t: 'settings', s: { apocalypse: a } })
      expect(L.apoPresetOf(L.APO_PRESETS[k])).toBe(k)
    }
    // 兩種都不是（舊版主機留下的數字）：選單另外照實顯示
    expect(L.apoPresetOf([20, 25])).toBeNull()
    expect(t('ui5.lobby.apo.custom', { a: 20, b: 25 })).toBe('20–25 分')
  })

  it('選項文字與說明：數字跟著設定表；說明寫出原作節奏比較有機會進化到 T3（zh／en）', () => {
    expect(t('ui5.lobby.apo.fast', { a: 30, b: 40 })).toBe('快節奏 30–40 分（預設）')
    expect(t('ui5.lobby.apo.classic', { a: 55, b: 70 })).toBe('原作 55–70 分')
    const zh = L.apoTip()
    for (const w of ['30–40', '55–70', 'T3', '異形', '變種人', '60 秒']) expect(zh).toContain(w)
    expect(zh).not.toMatch(/\{\w+\}/)
    lang.value = 'en'
    const en = L.apoTip()
    for (const w of ['30–40', '55–70', 'T3', 'xenos', 'mutants']) expect(en).toContain(w)
    expect(en).not.toMatch(/\{\w+\}/)
    expect(t('ui5.lobby.apo.classic', { a: 55, b: 70 })).toBe('Classic 55–70 min')
  })

  it('真的 sim：選原作節奏，末日落在 55–70 分；預設落在 30–40 分', () => {
    const classic = Harness.started(3, 4242, { apocalypse: [55, 70], eventMult: 0 }).h.server.game!
    expect(eventsOf(classic).apocAt).toBeGreaterThanOrEqual(3300)
    expect(eventsOf(classic).apocAt).toBeLessThanOrEqual(4200)
    const fast = Harness.started(3, 4242, { eventMult: 0 }).h.server.game!
    expect(eventsOf(fast).apocAt).toBeGreaterThanOrEqual(1800)
    expect(eventsOf(fast).apocAt).toBeLessThanOrEqual(2400)
  })
})

describe('大廳：原作沒有的事件', () => {
  it('預設開；開關過得了主機的設定驗證', () => {
    expect(DEFAULT_SETTINGS.extraEvents).toBe(true)
    expect(validateClientMsg({ t: 'settings', s: { extraEvents: false } })).toEqual({ t: 'settings', s: { extraEvents: false } })
    expect(validateClientMsg({ t: 'settings', s: { extraEvents: 'no' } })).toBeNull()
  })

  it('說明列出會被關掉的三個事件（通訊病毒、蛞蝓仔大量出現、天守收容失效），每個都是 sim 真的有的事件', () => {
    for (const l of ['zh', 'en'] as const) {
      lang.value = l
      const s = t('ui5.lobby.tip.extra')
      const names = l === 'zh' ? ['通訊病毒', '蛞蝓仔大量出現', '天守收容失效'] : ['Comm virus', 'Slugling swarm', 'Tenshu containment failure']
      for (const w of names) expect(s, l).toContain(w)
      expect(s.split('\n').filter((x) => x.startsWith('・') || x.startsWith('•'))).toHaveLength(3)
    }
    // 和 sim 的名單一致：大廳關掉時 sim 不抽的就是這三個（被抽到時各有全場公告）
    expect([...EXTRA_EVENTS].sort()).toEqual(['slugSwarm', 'tenshu', 'virus'])
    for (const id of EXTRA_EVENTS) {
      expect(hasString('zh', 'event.' + id)).toBe(true)
      expect(hasString('en', 'event.' + id)).toBe(true)
    }
  })

  it('說明也交代「補給船提早抵達」關閉時照原作沒有效果', () => {
    expect(t('ui5.lobby.tip.extra')).toContain('補給船提早抵達')
    lang.value = 'en'
    expect(t('ui5.lobby.tip.extra')).toContain('supply run')
  })
})

describe('調查筆記：本機封鎖', () => {
  it('封鎖本名時連同職業前綴、晉升頭銜的寫法一起封；解除也一起解', () => {
    const names = N.muteNames('Alice')
    expect(names).toContain('Alice')
    expect(names).toContain('特務·Alice')
    for (const c of CLASSES.values()) expect(names).toContain(c.prefix.en + 'Alice')
    expect(N.muteNames('')).toEqual([])
    N.setNameMuted('Alice', true)
    expect(N.isNameMuted('Alice')).toBe(true)
    expect(isMuted('Dr. Alice')).toBe(true)
    expect(isMuted('Alice2')).toBe(false)
    expect(N.isNameMuted('Bob')).toBe(false)
    N.setNameMuted('Alice', false)
    expect(N.isNameMuted('Alice')).toBe(false)
    expect(mutedNames.value.size).toBe(0)
    // 別的地方只封了某一種寫法，筆記這一列也看得出已封鎖
    mutedNames.value = new Set(['Medic Bob'])
    expect(N.isNameMuted('Bob')).toBe(true)
  })

  it('不能封鎖自己：這個本名的任何寫法是自己現在的名字（含通訊病毒換到的）', () => {
    expect(N.isOwnName('Bob', ['Dr. Bob', 'Alice'])).toBe(true)
    expect(N.isOwnName('Bob', ['', 'Bob'])).toBe(true)
    expect(N.isOwnName('Bob', ['Dr. Bobby', ''])).toBe(false)
    expect(N.isOwnName('Bob', ['', ''])).toBe(false)
  })

  it('說明文字（zh／en）', () => {
    expect(t('ui5.notes.muteBody')).toBe('只在你這邊隱藏他的聊天與小地圖信號；通訊病毒換名後，封鎖會跟著名字走。')
    expect(t('ui5.notes.mute')).toBe('封鎖此人')
    lang.value = 'en'
    expect(t('ui5.notes.muteBody')).toContain('follows the name')
  })

  it('真的 sim：筆記列的名字（開局名單）封得住他的聊天；通訊病毒換名後，封鎖跟著名字走、不跟著人', () => {
    const { h, cs } = Harness.started(3, 99, { eventMult: 0 })
    const g = h.server.game!
    const watcher = cs[0]
    const info = watcher.inbox.find((m): m is { t: 'start'; info: StartInfo } => m.t === 'start')!.info
    const target = info.players.find((p) => p.slot === cs[1].slot)!
    // 開局名單上是本名；聊天帶的是職業前綴＋本名
    expect(target.name).toBe('p1')
    N.setNameMuted(target.name, true)
    const linesFrom = (sender: (typeof cs)[number], text: string): ChatLine[] => {
      watcher.inbox.length = 0
      sender.send({ t: 'chat', ch: 'all', text })
      h.ticks(2)
      return watcher.inbox.flatMap((m) => (m.t === 'chat' ? m.lines : [])).filter((l) => l.text === text)
    }
    const before = linesFrom(cs[1], 'hello-1')
    expect(before).toHaveLength(1)
    expect(before[0].from).not.toBe('p1')
    expect(isMuted(before[0].from)).toBe(true)
    expect(isMuted(linesFrom(cs[2], 'hello-2')[0].from)).toBe(false)
    // 通訊病毒：名字清空 10 秒後本名與顏色互換（頭銜跟著人）
    expect(g.triggerEvent!('virus', true)).toBe(true)
    h.ticks(11 * 20)
    let checked = 0
    for (const [i, c] of cs.entries()) {
      if (c === watcher) continue
      const p = g.players[c.slot]!
      const got = linesFrom(c, 'after-' + i)
      expect(got).toHaveLength(1)
      // 誰現在用「p1」這個本名，誰就被封；原本的 p1 換了名字就不再被封
      expect(isMuted(got[0].from), `${got[0].from}`).toBe(shownBase(p) === 'p1')
      checked++
      h.ticks(40)
    }
    expect(checked).toBe(2)
  })
})

describe('說明面板：操作表', () => {
  it('小地圖信號（Alt＋左鍵）接在小地圖之後、-list 群組接在聊天之後；兩種語言都有', () => {
    expect(HELP_CONTROLS.indexOf('ping')).toBe(HELP_CONTROLS.indexOf('minimap') + 1)
    expect(HELP_CONTROLS.indexOf('group')).toBe(HELP_CONTROLS.indexOf('chat') + 1)
    for (const k of ['ping', 'group']) {
      for (const d of [GUIDE_ZH, GUIDE_EN]) {
        expect(d['guide.ctl.' + k]).toBeTruthy()
        expect(d['guide.ctl.' + k + '.k']).toBeTruthy()
      }
    }
    expect(GUIDE_ZH['guide.ctl.ping.k']).toContain('Alt')
    expect(GUIDE_ZH['guide.ctl.ping']).toContain('活人只給活人、死者只給死者')
    expect(GUIDE_EN['guide.ctl.ping.k']).toContain('Alt')
    expect(GUIDE_ZH['guide.ctl.group.k']).toBe('-list 群組')
    expect(GUIDE_ZH['guide.ctl.group']).toContain('只有成員能查')
    expect(GUIDE_EN['guide.ctl.group.k']).toBe('-list group')
    expect(GUIDE_EN['guide.ctl.group']).toContain('members only')
  })
})

/** 範圍內的字串（說明、圖鑑、介面第四／五批、背景故事與身分目標）*/
function scoped(l: 'zh' | 'en'): string[] {
  const dicts = l === 'zh' ? [GUIDE_ZH, CODEX_ZH, UI4_ZH, UI5_ZH] : [GUIDE_EN, CODEX_EN, UI4_EN, UI5_EN]
  return [...dicts.flatMap((d) => Object.values(d)), ...Object.values(BIOS).map((b) => b[l]), ...Object.values(OBJECTIVES).flatMap((o) => o[l])]
}

describe('防護服擋不住寄生與朊毒（照原作：著裝人員一樣是 organic）', () => {
  it('不再說「只有沒穿防護服的人會被寄生」「防護服能防寄生」', () => {
    const zh = scoped('zh').join('\n')
    for (const w of ['沒穿防護服的人', '未著裝', '無法寄生', '不能寄生']) expect(zh).not.toContain(w)
    const en = scoped('en').join('\n')
    for (const w of ['unsuited', 'cannot implant']) expect(en.toLowerCase()).not.toContain(w)
  })

  it('防護服與感染規則的說明寫出防護服擋不住', () => {
    expect(GUIDE_ZH['guide.th.suit']).toContain('擋不住寄生和朊毒')
    expect(GUIDE_ZH['guide.h.suit']).toContain('擋不住寄生和朊毒')
    expect(CODEX_ZH['codex.rule.infect.body']).toContain('防護服擋不住')
    expect(GUIDE_EN['guide.th.suit']).toContain('does not stop implants or prions')
    expect(CODEX_EN['codex.rule.infect.body']).toContain('Suits do not stop')
  })
})

describe('en：anomaly 只指生物 Anomaly', () => {
  it('範圍內的 en 字串不再用小寫的 anomaly 指隱藏陣營；提到生物時寫成大寫的名字', () => {
    const bad = scoped('en').filter((s) => /\banomal(y|ies)\b/.test(s))
    expect(bad).toEqual([])
    expect(GUIDE_EN['guide.goal.human']).toBe('Wipe out every xeno and mutant, and survive')
    expect(GUIDE_EN['guide.r.mutant.3']).toContain('125 for an Anomaly')
  })
})
