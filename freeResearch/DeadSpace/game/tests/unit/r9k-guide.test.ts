// 第 9 輪 K（上架前總評）：改鍵後，說明「操作」頁、目標面板、情境提示、tooltip 的按鍵跟著按鍵設定；按鍵設定的動作名稱不帶鍵名；
// 目標面板過時的行（做過監控掃描、船艙裡還沒駕駛、死後附身蛞蝓仔）。
// 休閒玩家審查：所在站點耐久警告（點一下走到救生艙）、練習局的仿生人 EP 速度、依身分的提示、仿生人升級的交通、誤傷的說法
import { afterEach, describe, expect, it, vi } from 'vitest'
import type { PrivateState, WorldPublic } from '../../src/shared/protocol/messages'

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
    chatTaps: [],
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
const N = await import('../../src/ui/hud/facilityNav')
const K = await import('../../src/client/keymap')
const { HELP_CONTROLS } = await import('../../src/ui/strings/guide')
const { FIX9K_EN, FIX9K_ZH } = await import('../../src/ui/strings/fix9k')
// App.tsx 載入時註冊的字串（這裡會掃全部字串，確認沒有寫死可以改的鍵）
for (const m of ['sim3', 'sim5', 'sim6', 'sim7', 'sim8', 'ux6', 'ui6', 'room6', 'snd7', 'vis7', 'feel7', 'set7', 'fx7', 'cam7', 'ai8', 'rule8', 'ghost8', 'ui8', 'fix9s', 'fix9t'])
  await import(`../../src/ui/strings/${m}.ts`)
const { lang, stringKeys, sysText, t } = await import('../../src/ui/i18n')
const { actionName } = await import('../../src/ui/screens/KeybindPanel')
const { Harness } = await import('./helpers/harness')
const { PRACTICE_APOCALYPSE } = await import('../../src/sim/systems/events')
const { DEFAULT_SETTINGS } = await import('../../src/shared/protocol/messages')
const { UNITS } = await import('../../src/shared/content/registry')

type View = Parameters<typeof G.objectiveFor>[0]

function inv(...items: (string | null)[]): PrivateState['inv'] {
  return items.map((i) => (i ? { item: i, charges: 0, cd: 0 } : null))
}
function view(me: Partial<PrivateState>, extra: Partial<View> = {}): View {
  return { me: { alive: true, zone: 1, abilities: [], inv: [], ...me }, w: { t: 100, stab: 1 }, near: [], self: { d: 'personnel', hp: 400, mhp: 400 }, ...extra }
}
const keysOf = (v: View) => G.objectiveFor(v)!.steps.map((s) => s.key)
const hintIds = (v: View) => G.detectHints(v).map((h) => h.id)
const ctlKey = (k: string) => t('guide.ctl.' + k + '.k')
const privLines = (c: { inbox: unknown[] }) =>
  (c.inbox as { t: string; lines?: { ch: string; text: string }[] }[]).filter((m) => m.t === 'chat').flatMap((m) => (m.lines ?? []).filter((l) => l.ch === 'private'))

afterEach(() => {
  K.resetKeymap()
  lang.value = 'zh'
})

describe('改鍵後的說明文字（第 9 輪審查 P1）', () => {
  it('說明「操作」頁：預設鍵照舊；改了攻擊、技能 1、背包、鏡頭、進化之後，按鍵欄跟著變（固定鍵不變）', () => {
    const def = { a: 'A', sh: 'S／H', skills: 'Q W E R D F', items: '1–6', camera: '方向鍵', space: 'Space', chat: 'Enter', v: 'V', m: 'M', tab: 'Tab', esc: 'Esc', f1: 'F1', g: 'G' }
    for (const [k, v] of Object.entries(def)) expect(ctlKey(k), k).toBe(v)
    // 審查員的操作：攻擊改成 S（原本的停止換成 A）、技能 1 改成 T
    expect(K.bindKey('attack', 'KeyS')).toMatchObject({ ok: true, swapped: 'stop' })
    expect(K.bindKey('ability1', 'KeyT').ok).toBe(true)
    expect(ctlKey('a')).toBe('S')
    expect(ctlKey('sh')).toBe('A／H')
    expect(ctlKey('skills')).toBe('T W E R D F')
    K.bindKey('item1', 'KeyZ')
    K.bindKey('camLeft', 'KeyJ')
    K.bindKey('evolve', 'KeyX')
    K.bindKey('chat', 'KeyY')
    K.bindKey('mute', 'KeyO')
    K.bindKey('camSelf', 'KeyC')
    expect(ctlKey('items')).toBe('Z 2 3 4 5 6')
    expect(ctlKey('camera')).toBe('J → ↑ ↓')
    expect([ctlKey('v'), ctlKey('chat'), ctlKey('m'), ctlKey('space')]).toEqual(['X', 'Y', 'O', 'C'])
    for (const k of ['tab', 'esc', 'f1', 'g']) expect(ctlKey(k), k).toBe(def[k as keyof typeof def])
    // 每一列都換掉了佔位符
    for (const k of HELP_CONTROLS) expect(ctlKey(k) + t('guide.ctl.' + k), k).not.toMatch(/\{/)
    lang.value = 'en'
    expect(ctlKey('sh')).toBe('A / H')
    K.resetKeymap()
    expect(ctlKey('camera')).toBe('Arrow keys')
    expect(ctlKey('skills')).toBe('Q W E R D F')
  })

  it('目標面板、情境提示、說明要點、tooltip、sim 私訊：帶出目前的鍵', () => {
    K.bindKey('attack', 'KeyS')
    K.bindKey('evolve', 'KeyX')
    K.bindKey('unpilot', 'KeyU')
    K.bindKey('chat', 'KeyY')
    K.bindKey('item2', 'KeyK')
    expect(t('guide.s.attack')).toBe('右鍵別人只會跟隨；要開火按 S 再點他')
    expect(t('guide.h.ally')).toContain('按 S 再點他')
    expect(t('guide.r.human.2')).toContain('按 S 再點他')
    expect(t('guide.s.evolveXeno')).toContain('按 X 進化')
    expect(t('guide.s.evolvePath')).toContain('按 X 選擇')
    expect(t('guide.h.console')).toContain('按 U（或指令卡上方的按鈕）離開控制台')
    expect(t('guide.th.console')).toContain('按 U 離開控制台')
    expect(t('guide.h.keys')).toMatch(/^Y 聊天 · Tab 調查筆記 · F1 圖鑑 · G 遊戲說明/)
    expect(t('guide.s.deadChat')).toBe('Y 發言只有死者看得到')
    expect(t('ui6.guide.s.pilotStation')).toContain('U 離開控制台')
    expect(t('cmd.attack.desc')).toMatch(/^按 S 再點敵人攻擊/)
    expect(t('hover.hint.follow')).toContain('按 S 再點')
    expect(t('gmenu.evolve')).toBe('進化（X）')
    expect(t('role.canEvolve')).toContain('按 X 開啟進化選單')
    // sim 送來的私訊（@key|k=v）也照按鍵設定
    expect(sysText('@space.linked|s=20')).toContain('駕駛者先按 U 離開控制台')
    // 背包格：目標面板寫的是那一格目前的鍵（以前寫格子編號）
    const o = G.objectiveFor(view({ role: 'human', classId: 'ceo', inv: inv(null, 'suit.cryo') }))!
    expect(o.steps[0]).toEqual({ key: 'guide.s.suitWear', args: { k: 'K' } })
    expect(t(o.steps[0].key, o.steps[0].args)).toBe('按 K 穿上背包裡的防護服')
    expect(G.detectHints(view({ role: 'human', inv: inv(null, 'suit.cryo') })).find((h) => h.id === 'suit')?.args).toEqual({ k: 'K' })
    lang.value = 'en'
    expect(t('guide.s.attack')).toBe('To shoot someone: press S, then click them')
    expect(t('guide.s.evolveMutant')).toBe('Enough EP: press X to evolve')
    expect(t('hover.hint.console')).toBe('Right-click: step onto the console to pilot (U to leave)')
  })

  it('動作沒有按鍵（交換掉了）：寫「未設定按鍵」；背包格沒有鍵就寫第幾格', () => {
    // 「選取自己」預設沒有鍵：把它指定成 A，攻擊就換成沒有鍵
    expect(K.bindKey('selectSelf', 'KeyA')).toMatchObject({ ok: true, swapped: 'attack', swappedTo: '' })
    expect(t('guide.s.attack')).toBe('右鍵別人只會跟隨；要開火按 未設定按鍵 再點他')
    expect(ctlKey('a')).toBe('未設定按鍵')
    K.resetKeymap()
    K.bindKey('selectSelf', 'Digit1')
    expect(G.slotText(0)).toBe('背包第 1 格')
    expect(ctlKey('items')).toBe('2 3 4 5 6')
    lang.value = 'en'
    expect(G.slotText(0)).toBe('inventory slot 1')
    K.resetKeymap()
    expect(K.bindKey('selectSelf', 'KeyA').ok).toBe(true)
    expect(ctlKey('a')).toBe('unbound')
  })

  it('按鍵設定的動作名稱只描述動作，不帶預設鍵（改鍵後不會變成「攻擊（A 攻擊移動）改成 S」）', () => {
    for (const l of ['zh', 'en'] as const) {
      lang.value = l
      for (const a of K.ACTIONS) {
        const name = actionName(a.id)
        const label = K.keyLabel(a.def)
        // 技能、背包格的名稱是「技能 1」「使用背包第 1 格」：那是格子的編號，不是鍵名
        if (a.fixed || a.group === 'ability' || a.group === 'item' || !/^[A-Z0-9]$/.test(label)) continue
        expect(name, `${l} ${a.id}`).not.toMatch(new RegExp(`(^|[^A-Za-z0-9])${label}([^A-Za-z0-9]|$)`))
      }
    }
    lang.value = 'zh'
    expect(actionName('attack')).toBe('攻擊／攻擊移動')
  })

  it('所有字串：可以改的鍵都寫成佔位符（「按 A」「press V」這類寫死的預設鍵不再出現；固定鍵 G 照舊）', () => {
    // 先把每個可以改的動作都改成不是單一字母、數字的鍵（Num1、F2、Ins…）：佔位符換出來的字不會被當成寫死的鍵
    const spare = ['Numpad0', 'Numpad1', 'Numpad2', 'Numpad3', 'Numpad4', 'Numpad5', 'Numpad6', 'Numpad7', 'Numpad8', 'Numpad9', 'NumpadAdd', 'NumpadSubtract', 'NumpadMultiply', 'NumpadDivide', 'NumpadDecimal', 'F2', 'F3', 'F4', 'F6', 'F7', 'F8', 'F10', 'Insert', 'Home', 'End', 'PageUp', 'PageDown', 'Delete']
    const free = K.ACTIONS.filter((a) => !a.fixed)
    expect(spare.length).toBeGreaterThanOrEqual(free.length)
    free.forEach((a, i) => expect(K.bindKey(a.id, spare[i]), a.id).toMatchObject({ ok: true }))
    expect(free.every((a) => !/^[A-Z0-9]$/.test(K.actionLabel(a.id)))).toBe(true)
    // 掃描本身有效：佔位符確實換成了新鍵、寫死的鍵會被抓到
    expect(t('guide.s.attack')).not.toMatch(/按 [A-Z] /)
    expect(/按 ?([A-Z0-9])(?![A-Za-z0-9])/.exec('要開火按 A 再點他')?.[1]).toBe('A')
    expect(stringKeys('zh').length).toBeGreaterThan(1000)
    const bad: string[] = []
    for (const l of ['zh', 'en'] as const) {
      lang.value = l
      for (const k of stringKeys(l)) {
        const s = t(k)
        const m = l === 'zh' ? /按 ?([A-Z0-9])(?![A-Za-z0-9])/.exec(s) : /\b[Pp]ress ([A-Z0-9])\b|· ([A-Z]) to\b|\(([A-Z])\)$/.exec(s)
        const key = m?.[1] ?? m?.[2] ?? m?.[3]
        if (key && key !== 'G') bad.push(`${l}:${k}: ${s}`)
      }
    }
    expect(bad).toEqual([])
  })

  it('新字串兩種語言都有、佔位符一致', () => {
    const ph = (s: string) => [...s.matchAll(/\{(\w+)\}/g)].map((m) => m[1]).sort()
    expect(Object.keys(FIX9K_EN).sort()).toEqual(Object.keys(FIX9K_ZH).sort())
    for (const k of Object.keys(FIX9K_ZH)) expect([k, ph(FIX9K_EN[k])]).toEqual([k, ph(FIX9K_ZH[k])])
    for (const k of Object.keys(FIX9K_EN)) expect(FIX9K_EN[k], k).not.toMatch(/[一-鿿]/)
  })
})

describe('目標面板過時的行', () => {
  const nyxHuman = (altT: number, extra: Partial<View> = {}) => keysOf(view({ role: 'human', classId: 'ceo' }, { self: { d: 'suit.plasma', hp: 600, mhp: 600 }, zoneStation: 'nyx', altT, ...extra }))

  it('做過站內監控掃描：「先做：站上控制台用監控掃描」不再出現，其他空窗任務照常輪播', () => {
    const seen = (extra: Partial<View>) => new Set([0, 20, 40, 60, 80, 100, 120].flatMap((a) => nyxHuman(a, extra)))
    expect(seen({}).has('guide.s.altScan')).toBe(true)
    const done = seen({ swept: true })
    expect(done.has('guide.s.altScan')).toBe(false)
    expect(done.has('guide.s.altGear')).toBe(true)
    expect(done.has('guide.s.altGroup')).toBe(true)
  })

  it('掃描做過沒有：只看 sim 私訊給施放者的掃描結果', () => {
    expect(G.isSweepReport({ ch: 'private', text: '@space.sweepResult|sz=女帝號|se=Empress Nyx|rz=控制室 1 人|re=1 in Control' })).toBe(true)
    expect(G.isSweepReport({ ch: 'private', text: '@space.sweepNone|sz=女帝號|se=Empress Nyx' })).toBe(true)
    // 全站收到的掃描廣播不算（那是別人掃的）
    expect(G.isSweepReport({ ch: 'private', text: '@space.sweepAnnounce|zh=女帝號|en=Empress Nyx' })).toBe(false)
    expect(G.isSweepReport({ ch: 'all', text: '@space.sweepResult' })).toBe(false)
  })

  it('真的 sim：駕駛女帝號放監控掃描 → 施放者收到掃描結果的私訊，站裡的其他人只收到廣播', () => {
    const { h, cs } = Harness.started(3, 4, { eventMult: 0 })
    const g = h.server.game!
    const p = g.players[cs[0].slot]
    const u = g.mainOf(p)!
    const nz = g.world.zones.find((z) => z.key === 'nyx')!
    const con = [...g.world.inZone(nz.id)].find((e) => e.data.poi === 'console')!
    const other = g.mainOf(g.players[cs[1].slot])!
    g.world.relocate(other, nz.id, con.x + 4, con.y + 4)
    g.world.relocate(u, con.zone, con.x, con.y - 0.6)
    h.ticks(3)
    const st = g.world.get(nz.spaceEnt)!
    expect(p.control).toBe(st.id)
    g.handleCommand(p.slot, { k: 'cast', a: 'st.sweep' })
    h.ticks(20 * 3)
    expect(privLines(cs[0]).some(G.isSweepReport)).toBe(true)
    expect(privLines(cs[1]).some((l) => l.text.startsWith('@space.sweepAnnounce'))).toBe(true)
    expect(privLines(cs[1]).some(G.isSweepReport)).toBe(false)
  })

  it('站在船艙裡還沒駕駛：停泊中說「站上控制台，10 秒後發射」，倒數中說幾秒，太空中說怎麼開；開始駕駛後換成駕駛說明', () => {
    const cabin = (c: NonNullable<View['cabin']>, extra: Partial<View> = {}) => G.objectiveFor(view({ role: 'human' }, { zoneStation: 'ship:kestrel', cabin: c, ...extra }))!.steps[0]
    expect(cabin({ docked: true, launchIn: 0 })).toEqual({ key: 'fix9k.guide.s.cabinLaunch' })
    expect(t('fix9k.guide.s.cabinLaunch')).toContain('站上船艙的控制台，10 秒後發射')
    expect(cabin({ docked: true, launchIn: 6.2 })).toEqual({ key: 'fix9k.guide.s.cabinLaunching', args: { s: 7 } })
    expect(cabin({ docked: false, launchIn: 0 }).key).toBe('fix9k.guide.s.cabinFlying')
    expect(cabin({ docked: null, launchIn: 0 }).key).toBe('fix9k.guide.s.cabinUnknown')
    // 異類也可能搭船
    expect(G.objectiveFor(view({ role: 'xeno', abilities: [] }, { cabin: { docked: true, launchIn: 0 } }))!.steps[0].key).toBe('fix9k.guide.s.cabinLaunch')
    // 開始駕駛（ctrl）：只剩駕駛說明，不再列船艙那一條
    const flying = G.objectiveFor(view({ role: 'human' }, { ctrl: 'ship.kestrel', cabin: { docked: false, launchIn: 0 } }))!
    expect(flying.steps[0].key.startsWith('ui6.guide.s.pilotShip')).toBe(true)
    expect(flying.steps.map((s) => s.key).some((k) => k.startsWith('fix9k.guide.s.cabin'))).toBe(false)
    // 不在船艙（沒有 cabin）就沒有
    expect(keysOf(view({ role: 'human' })).some((k) => k.startsWith('fix9k.guide.s.cabin'))).toBe(false)
  })

  it('死後附身蛞蝓仔：目標面板換成蛞蝓仔的操作，不再叫他輸入 -slug；牠死了就說機會用掉了', () => {
    const dead = (slug?: View['slug']) => keysOf(view({ role: 'human', alive: false }, slug ? { slug } : {}))
    expect(dead()).toEqual(['guide.s.specPick', 'guide.s.deadChat', 'guide.s.slug', 'guide.s.endReveal'])
    expect(dead('on')).toEqual(['fix9k.guide.s.slugMove', 'fix9k.guide.s.slugLife', 'guide.s.deadChat', 'guide.s.endReveal'])
    expect(dead('used')).toEqual(['guide.s.specPick', 'guide.s.deadChat', 'fix9k.guide.s.slugUsed', 'guide.s.endReveal'])
    K.bindKey('stop', 'KeyP')
    expect(t('fix9k.guide.s.slugMove')).toContain('P 停下')
    // 判斷：死了、控制的不是自己的主單位；快照裡看得到時再看外觀
    const me = { alive: false, role: 'human' as const, unit: 5, control: 9 }
    expect(G.possessingSlug(me, { s: { d: 'creature.slugling' } })).toBe(true)
    expect(G.possessingSlug(me, undefined)).toBe(true)
    expect(G.possessingSlug(me, { s: { d: 'personnel' } })).toBe(false)
    expect(G.possessingSlug({ ...me, control: 5 }, undefined)).toBe(false)
    expect(G.possessingSlug({ ...me, control: 0 }, undefined)).toBe(false)
    expect(G.possessingSlug({ ...me, alive: true }, { s: { d: 'creature.slugling' } })).toBe(false)
    expect(G.possessingSlug({ ...me, role: 'spectator' }, { s: { d: 'creature.slugling' } })).toBe(false)
  })

  it('真的 sim：死後附身蛞蝓仔 → client 的 world.me 看得出在操控蛞蝓仔；牠死了控制權回到觀戰', () => {
    const { h, cs } = Harness.started(4, 99, { eventMult: 0 })
    const g = h.server.game!
    const p = g.players[cs[1].slot]
    const c = cs[1]
    g.setRole(p, 'human')
    g.killEnt(g.mainOf(p)!, null, -1)
    h.ticks(3)
    const meOf = () => c.me as Partial<PrivateState>
    const ctlOf = () => {
      const s = c.ents.get(meOf().control ?? 0)
      return s ? { s } : undefined
    }
    expect(meOf().alive).toBe(false)
    expect(G.possessingSlug(meOf(), ctlOf())).toBe(false)
    expect(g.possessSlug!(p.slot)).toBe(true)
    h.ticks(3)
    expect(G.possessingSlug(meOf(), ctlOf())).toBe(true)
    const slug = g.world.get(p.control)!
    expect(slug.def.id).toBe('creature.slugling')
    g.killEnt(slug, null, -1)
    h.ticks(3)
    expect(G.possessingSlug(meOf(), ctlOf())).toBe(false)
  })
})

describe('休閒玩家審查：站點耐久', () => {
  const ent = (d: string, hp: number, mhp = 1000, z = 0) => ({ s: { d, z, hp, mhp } })

  it('所在站點耐久低於 50%：目標面板最上面紅色警告（點一下走到救生艙裝置）；正在快速掉也警告；翠原星、船艙不算', () => {
    const w = new G.HullWatch()
    expect(w.update('nyx', [ent('station.nyx', 900)], 10)).toEqual({ st: '女帝號', n: 90, falling: false })
    expect(G.hullStep({ st: '女帝號', n: 90, falling: false })).toBeNull()
    // 10 秒內掉了 15%：快速受損
    const fall = w.update('nyx', [ent('station.nyx', 750)], 14)!
    expect(fall).toEqual({ st: '女帝號', n: 75, falling: true })
    expect(G.hullStep(fall)).toEqual({ key: 'fix9k.guide.s.hullFall', args: { st: '女帝號', n: 75 }, danger: true })
    // 之後穩住超過 10 秒：不再算快速受損
    expect(w.update('nyx', [ent('station.nyx', 750)], 30)!.falling).toBe(false)
    const low = w.update('nyx', [ent('station.vivarium', 100), ent('station.nyx', 420)], 31)!
    expect(low).toMatchObject({ n: 42 })
    const s = G.hullStep(low)!
    expect(s).toEqual({ key: 'fix9k.guide.s.hull', args: { st: '女帝號', n: 42 }, danger: true })
    expect(t(s.key, s.args)).toBe('女帝號耐久 42%：快到救生艙或停機坪離開')
    // 站內的實體（z ≠ 0）不是站點本體；翠原星是行星；船艙不是站點
    expect(new G.HullWatch().update('nyx', [ent('station.nyx', 100, 1000, 3)], 1)).toBeUndefined()
    expect(new G.HullWatch().update('verdance', [ent('station.verdance', 100)], 1)).toBeUndefined()
    expect(new G.HullWatch().update('ship:kestrel', [ent('station.nyx', 100)], 1)).toBeUndefined()
    // 目標面板：排最前面；同一站的圍攻現況不重複列；點一下走到救生艙裝置
    const o = G.objectiveFor({ ...view({ role: 'human' }, { zoneStation: 'nyx', hull: low }), w: { t: 100, siege: [['nyx', 0.42]] } as Partial<WorldPublic> })!
    expect(o.steps[0].key).toBe('fix9k.guide.s.hull')
    expect(o.steps.map((x) => x.key)).not.toContain('ui8.guide.siegeHere')
    for (const k of ['fix9k.guide.s.hull', 'fix9k.guide.s.hullFall', 'ui8.guide.siegeHere']) expect(N.navKindOf(k, 'nyx'), k).toBe('escapePod')
    expect(N.stationHas('nyx', 'escapePod')).toBe(true)
    // 死者、觀戰不列
    expect(keysOf(view({ role: 'human', alive: false }, { hull: low }))).not.toContain('fix9k.guide.s.hull')
  })

  it('真的 sim：站內的人從快照的太空層站點實體讀得到耐久', () => {
    const { h, cs } = Harness.started(2, 5, { eventMult: 0 })
    const g = h.server.game!
    const p = g.players[cs[0].slot]
    const u = g.mainOf(p)!
    const nz = g.world.zones.find((z) => z.key === 'nyx')!
    const spot = nz.layout!.spawns[0]
    g.world.relocate(u, nz.id, spot.x, spot.y)
    const st = g.world.get(nz.spaceEnt)!
    st.hp = st.maxHp * 0.3
    h.ticks(3)
    const ents = [...cs[0].ents.values()].map((s) => ({ s }))
    const hull = new G.HullWatch().update('nyx', ents, g.time)!
    expect(hull.n).toBeGreaterThanOrEqual(29)
    expect(hull.n).toBeLessThanOrEqual(31)
    expect(G.hullStep(hull)?.key).toBe('fix9k.guide.s.hull')
  })
})

describe('休閒玩家審查：仿生人與依身分的提示', () => {
  it('練習局：仿生人 EP 速度用練習局真正的末日時間（sim 的 PRACTICE_APOCALYPSE）', () => {
    expect([...G.PRACTICE_APOCALYPSE_UI]).toEqual([...PRACTICE_APOCALYPSE])
    const def = DEFAULT_SETTINGS.apocalypse
    expect(G.effectiveApocalypse(def, true)).toEqual(PRACTICE_APOCALYPSE)
    expect(G.effectiveApocalypse(def, false)).toEqual(def)
    // 練習局主機改過末日時間：照主機的
    expect(G.effectiveApocalypse([45, 55], true)).toEqual([45, 55])
    expect(G.androidEpRate(0, 2000, 1, G.effectiveApocalypse(def, true))).toEqual({ r: '3.7', m: 9 })
    expect(G.androidEpRate(0, 2000, 1, def).r).toBe('2.38')
    const step = G.objectiveFor(view({ role: 'android', ep: 0, epNext: 2000 }, { apocalypse: G.effectiveApocalypse(def, true) }))!.steps[0]
    expect(step).toEqual({ key: 'guide.s.androidEp', args: { r: '3.7', m: 9 } })
  })

  it('仿生人 EP 滿了但不在裁決者號：說怎麼過去（救生艙或開船），點一下走到救生艙裝置', () => {
    const full = (zoneStation: string) => keysOf(view({ role: 'android', ep: 2000, epNext: 2000 }, { zoneStation }))
    expect(full('nyx')[0]).toBe('fix9k.guide.s.androidGo')
    expect(full('adjudicatrix')[0]).toBe('guide.s.androidReady')
    expect(N.navKindOf('fix9k.guide.s.androidGo', 'nyx')).toBe('escapePod')
    expect(t('fix9k.guide.s.androidGo')).toBe('EP 滿了：到救生艙裝置搭救生艙（或開船）去裁決者號，站上鑄造台旁的平台按 V')
    expect(t('guide.h.androidFull')).toContain('搭救生艙或開船到裁決者號')
  })

  it('提示依身分：只有人類被叫「可以抽自己」；醫護兵治不了的樣子不提醫護兵；穿不上防護服就不提示穿', () => {
    const smp = inv('geneSampler')
    expect(hintIds(view({ role: 'human', inv: smp }))).toContain('sampler')
    expect(t('guide.h.sampler', { k: '1' })).toContain('可以抽自己')
    const android = hintIds(view({ role: 'android', inv: smp }))
    expect(android).toContain('samplerAndroid')
    expect(android).not.toContain('sampler')
    expect(t('guide.h.samplerAndroid', { k: '1' })).toContain('別抽自己')
    expect(hintIds(view({ role: 'mutant', inv: smp }))).toContain('samplerHidden')
    expect(hintIds(view({ role: 'xeno', inv: smp, abilities: [] }))).toContain('samplerHidden')
    // 低血量：人員（含穿著防護服）照舊提醫護兵；進化後的變種人、仿生人機體不提
    const hurt = (d: string, role: PrivateState['role'], items: PrivateState['inv'] = []) => hintIds(view({ role, inv: items }, { self: { d, hp: 10, mhp: 1000 } }))
    expect(UNITS.get('mut.lurker')!.tags).not.toContain('personnel')
    expect(hurt('personnel', 'human')).toContain('lowHpNoKit')
    expect(hurt('suit.plasma', 'human')).toContain('lowHpNoKit')
    expect(hurt('mut.lurker', 'mutant')).toContain('lowHpSoloNoKit')
    expect(hurt('mut.lurker', 'mutant')).not.toContain('lowHpNoKit')
    expect(hurt('android.gale', 'android', inv('traumaKit'))).toContain('lowHpSolo')
    expect(t('guide.h.lowHpSoloNoKit')).not.toContain('請醫護兵')
    expect(t('guide.h.lowHpNoKit')).toContain('醫護兵')
    // 防護服：進化後的形態穿不上
    expect(hintIds(view({ role: 'mutant', inv: inv('suit.cryo') }, { self: { d: 'mut.lurker', hp: 900, mhp: 1000 } }))).not.toContain('suit')
    expect(hintIds(view({ role: 'human', inv: inv('suit.cryo') }))).toContain('suit')
  })

  it('誤傷說法直白（不寫「2.7 份」）；第 8 輪的末日說明寫救生艙（全遊戲同一個叫法）', () => {
    for (const k of ['guide.s.ff', 'guide.h.androidFf', 'guide.r.android.2']) {
      for (const l of ['zh', 'en'] as const) {
        lang.value = l
        expect(t(k), `${l} ${k}`).not.toMatch(/2\.7|份/)
      }
    }
    lang.value = 'zh'
    expect(t('ui8.guide.fleetPlanet')).toContain('救生艙')
    expect(t('ui8.guide.fleetPlanet')).not.toContain('逃生艙')
  })
})

describe('對局結束後的目標面板（S 交接）', () => {
  // 子艦隊末日中、背包有防護服：結算前會列「子艦隊來襲…」「按 1 穿上防護服」
  const live = (extra: Partial<View> = {}) => ({ ...view({ role: 'human', classId: 'ceo', inv: inv('suit.cryo') }, extra), w: { t: 900, ev: ['doom'], apo: 'fleet' } as Partial<WorldPublic> })

  it('結算過了：只剩「這局已結束」一條，指向上方小列的「查看結算」；練習局提「再來一局」、多人局提「回到大廳」', () => {
    const before = keysOf(live())
    expect(before).toContain('guide.ev.doom.fleet')
    expect(before).toContain('guide.s.suitWear')
    const end = (a: View['ended']) => G.objectiveFor(live({ ended: a }))!
    const practice = end({ again: true, lobby: false, guestHint: false })
    expect(practice.goal).toBe('room6.after.title')
    expect(t(practice.goal)).toBe('這局已結束')
    expect(practice.steps).toHaveLength(1)
    expect(practice.ep).toBeUndefined()
    const line = (o: ReturnType<typeof end>) => t(o.steps[0].key, o.steps[0].args)
    expect(line(practice)).toBe('按上方小列的「查看結算」看所有人的身分；「再來一局」用同樣的設定馬上重開')
    expect(line(end({ again: false, lobby: true, guestHint: false }))).toContain('「回到大廳（同一房號）」帶大家回到大廳')
    expect(line(end({ again: false, lobby: false, guestHint: true }))).toContain('主機回到大廳時你會一起回去')
    expect(line(end({ again: false, lobby: false, guestHint: false }))).toBe('按上方小列的「查看結算」看所有人的身分與時間軸')
    // 死者、觀戰、異類都一樣
    for (const me of [{ role: 'human' as const, alive: false }, { role: 'spectator' as const, alive: false }, { role: 'xeno' as const }]) {
      expect(keysOf(view(me, { ended: { again: true, lobby: false, guestHint: false } })), me.role).toEqual(['fix9k.guide.s.endPractice'])
    }
    // 按鈕名稱跟著目前的語言（目標面板每次重畫都重算）
    lang.value = 'en'
    expect(line(end({ again: true, lobby: false, guestHint: false }))).toBe('Use “View results” in the bar at the top to see everyone’s role; “Play again” restarts with the same setup')
  })

  it('小列按鈕的規則：練習局、多人主機、多人客人、主機中止', () => {
    const r = (winner: string, extra: Record<string, unknown> = {}) => ({ winner, duration: 60, players: [], timeline: [], ...extra }) as never
    expect(G.endActionsOf(null, true, true)).toBeNull()
    expect(G.endActionsOf(r('crew'), true, true)).toEqual({ again: true, lobby: false, guestHint: false })
    expect(G.endActionsOf(r('crew'), false, true)).toEqual({ again: false, lobby: true, guestHint: false })
    expect(G.endActionsOf(r('draw'), false, false)).toEqual({ again: false, lobby: false, guestHint: true })
    expect(G.endActionsOf(r('aborted', { abortWhy: 'host' }), false, false)).toEqual({ again: false, lobby: false, guestHint: false })
  })
})
