// 第 6 輪審查（付費玩家第一晚）client 端：點選目標以游標下的單位優先（含自己、站在設施上點自己）、抽自己的捷徑、
// 右鍵已現形的怪物＝攻擊、NPC 船員的懸停分類、吞噬的原因與吸附對象、船艙艙門的停靠判斷、監控掃描的站內畫面、
// 泡泡夾在畫面內、單機練習在背景／載入中自動暫停
import { afterEach, describe, expect, it, vi } from 'vitest'
import '../../src/shared/content/index'

vi.mock('../../src/client/session', async () => {
  const { signal } = await import('@preact/signals')
  const { ClientWorld } = await import('../../src/client/world')
  const { PRACTICE_ROOM } = await import('../../src/shared/protocol/messages')
  const sent: unknown[] = []
  return {
    world: new ClientWorld(),
    snapTick: signal(0),
    sendCmd: () => {},
    cmdTaps: [],
    hostGone: signal(false),
    // 單機練習（練習房、自己是主機、只有一名真人）：自動暫停的整合測試用
    currentRoom: () => PRACTICE_ROOM,
    isHost: signal(true),
    screen: signal('game'),
    send: (m: unknown) => sent.push(m),
    sent,
    startInfo: signal({ gid: 1, players: [{ bot: false }, { bot: true }] }),
  }
})

const { world } = await import('../../src/client/session')
const { aimSelfKey } = await import('../../src/client/input')
const { hoverTip } = await import('../../src/ui/hud/WorldHover')
const { chooseUnitTarget } = await import('../../src/client/targetSnap')
const { devourCheck, devourRefusal, devourable } = await import('../../src/client/devourInfo')
const { looksMonstrous, monsterFoe, rightClickAction } = await import('../../src/client/interactKind')
const { CabinTracker, cabinDocked, cabinHatch, stationDockable } = await import('../../src/client/hatch')
const { SweepPeek, PEEK_S, ARM_S, fitDistance } = await import('../../src/client/sweepPeek')
const { pageHidden, sceneBusy, wantPause, watchPracticePause } = await import('../../src/client/practicePause')
const { signal } = await import('@preact/signals')
const sent = (await import('../../src/client/session')) as unknown as { sent: { t: string; on: boolean }[] }
const { clampRect } = await import('../../src/render/overlay')
const { EntFlag } = await import('../../src/shared/protocol/messages')
const { lang, t } = await import('../../src/ui/i18n')
type SnapEntity = import('../../src/shared/protocol/messages').SnapEntity
type SnapCand = import('../../src/client/targetSnap').SnapCand

const C = (id: number, dist: number, extra: Partial<SnapCand> = {}): SnapCand => ({ id, dist, tol: 40, ok: true, low: false, ...extra })
const S = (d: string, extra: Partial<SnapEntity> = {}): SnapEntity => ({ i: 7, d, fl: 0, o: -1, ...extra })

let nextId = 100
function put(d: string, extra: Partial<SnapEntity> = {}): number {
  const i = nextId++
  const s: SnapEntity = { i, d, z: 1, x: 500, y: 500, hp: 100, mhp: 100, o: -1, fl: 0, ...extra }
  world.ents.set(i, { s, samples: [], x: (s.x ?? 0) / 100, y: (s.y ?? 0) / 100, f: 0, firstSeen: 0, lastUpdate: 0 })
  return i
}

afterEach(() => {
  world.ents.clear()
  world.me = {}
  lang.value = 'zh'
})

describe('點選目標：游標下的單位優先（和懸停一致）', () => {
  it('直接點中自己、技能可以對自己放：就是自己，不會換成旁邊的人（審查：懸停顯示自己，點下去卻抽到旁邊的人）', () => {
    expect(chooseUnitTarget(1, [C(1, 0, { low: true, self: true }), C(6, 12)], false)).toBe(1)
  })

  it('站在設施上點自己（射線先打到 GIT 檢測儀）：玩家單位優先於設施，選自己', () => {
    expect(chooseUnitTarget(9, [C(9, 0, { low: true }), C(1, 8, { low: true, self: true })], false)).toBe(1)
    // 附近有別人時仍是別人優先（建物讓位給附近的人，照舊）
    expect(chooseUnitTarget(9, [C(9, 0, { low: true }), C(1, 8, { low: true, self: true }), C(6, 20)], false)).toBe(6)
    // 技能本來就要點建物：照舊是那個建物
    expect(chooseUnitTarget(9, [C(9, 0, { low: true }), C(1, 8, { low: true, self: true })], true)).toBe(9)
  })

  it('點空在自己和別人中間：別人優先（照舊）；直接點中不符合篩選的自己：附近有符合的就換（照舊）', () => {
    expect(chooseUnitTarget(0, [C(1, 5, { low: true, self: true }), C(6, 25)], false)).toBe(6)
    expect(chooseUnitTarget(1, [C(1, 0, { ok: false, low: true, self: true }), C(6, 25)], false)).toBe(6)
  })
})

describe('抽自己的捷徑：瞄準中再按一次同一個鍵', () => {
  it('能對自己放的道具（基因檢測器抽血）：鍵是背包格號；技能是指令卡快捷鍵', () => {
    expect(aimSelfKey({ kind: 'item', slot: 2, ability: 'ab.item.geneSampler', target: 'unit' })).toBe('3')
    world.me = { abilities: [{ id: 'ab.item.solace', cd: 0, maxCd: 20, mana: 0 }] }
    expect(aimSelfKey({ kind: 'ability', id: 'ab.item.solace', target: 'unit' })).toBe('Q')
  })

  it('不能對自己放的（寄生、吞噬、停靠）、A 攻擊、沒在瞄準：沒有捷徑', () => {
    expect(aimSelfKey({ kind: 'ability', id: 'xeno.parasite', target: 'unit' })).toBeNull()
    expect(aimSelfKey({ kind: 'ability', id: 'mut.devour', target: 'unit' })).toBeNull()
    expect(aimSelfKey({ kind: 'ability', id: 'ship.dock', target: 'unit' })).toBeNull()
    expect(aimSelfKey({ kind: 'attack' })).toBeNull()
    expect(aimSelfKey(null)).toBeNull()
  })

  it('提示字串中英文都有', () => {
    expect(t('ux6.aim.self', { k: '3' })).toBe('再按 3：對自己')
    lang.value = 'en'
    expect(t('ux6.aim.self', { k: '3' })).not.toMatch(/[一-鿿]/)
  })
})

describe('右鍵已現形的怪物＝攻擊（只看外觀與隊友旗標）', () => {
  it('異形形態、進化後的變種人、繭、卵、牠們的眷屬：攻擊', () => {
    for (const d of ['xeno.brute', 'xeno.protoform.spawn', 'mut.apex', 'mut.colossus', 'xeno.cocoon', 'xeno.eggUnit', 'mut.mass', 'mut.spiderling', 'mut.tentacle', 'xeno.eldritch'])
      expect(rightClickAction(S(d)), d).toBe('attack')
  })

  it('一般人形（包括偽裝中的人、仿生人機體）、NPC 船員、小動物：照舊跟隨', () => {
    for (const d of ['personnel', 'suit.cryo', 'android.gale', 'npc.crew', 'creature.rabbit', 'rig.monstrosity']) expect(rightClickAction(S(d, { o: 2 })), d).toBe('follow')
    expect(looksMonstrous(S('personnel'))).toBe(false)
  })

  it('自己的單位、已知的隊友（Ally）不攻擊；屍體照舊', () => {
    expect(monsterFoe(S('xeno.brute', { fl: EntFlag.Ally }))).toBe(false)
    expect(rightClickAction(S('xeno.brute', { fl: EntFlag.Ally }))).toBe('follow')
    expect(rightClickAction(S('mut.fleshy', { fl: EntFlag.Mine }))).toBe('follow')
    expect(rightClickAction(S('mut.apex', { fl: EntFlag.Corpse }))).toBe('corpse')
  })

  it('懸停提示跟著改：敵對 · 已現形的怪物、右鍵攻擊；隊友仍是跟隨', () => {
    const tip = hoverTip(put('mut.apex', { o: 3, c: 3 }))!
    expect(tip.sub).toBe(t('ux6.hover.cat.monster'))
    expect(tip.hint).toContain(t('hover.hint.attack'))
    expect(tip.hint).not.toContain(t('hover.hint.follow'))
    const mate = hoverTip(put('xeno.brute', { o: 3, c: 3, fl: EntFlag.Ally }))!
    expect(mate.hint).toBe(t('hover.hint.follow'))
    expect(hoverTip(put('personnel', { o: 3, c: 3 }))!.hint).toBe(t('hover.hint.follow'))
  })
})

describe('懸停分類：NPC 船員', () => {
  it('NPC 船員寫「NPC 船員」（以前是「生物」）；其他 NPC 寫 NPC；小動物仍是生物', () => {
    expect(hoverTip(put('npc.crew'))!.sub).toBe('NPC 船員')
    expect(hoverTip(put('npc.pacifier'))!.sub).toBe(t('hover.cat.npc'))
    expect(hoverTip(put('creature.rabbit'))!.sub).toBe(t('hover.cat.creature'))
    lang.value = 'en'
    expect(hoverTip(put('npc.crew'))!.sub).toBe('NPC crew')
  })
})

describe('吞噬：原因與吸附對象', () => {
  const me = { alive: true, abilities: [{ id: 'mut.devour', cd: 0, maxCd: 12, mana: 0 }] }
  it('綏靖機器人不是玩家：原因是「機械吞不下」；無人機、砲塔也一樣', () => {
    for (const d of ['npc.pacifier', 'npc.defenseDrone', 'pirate.sentry']) expect(devourRefusal(S(d)), d).toBe('ux6.devour.no.machine')
    expect(devourCheck(me, S('npc.pacifier'), new Set([1]))).toEqual({ ok: false, why: 'ux6.devour.no.machine' })
  })

  it('玩家（人形、異形／變種人形態、仿生人機體）仍是「吞不了玩家」；其他生物說明吞得下哪些', () => {
    for (const d of ['personnel', 'xeno.brute', 'mut.apex', 'android.gale']) expect(devourRefusal(S(d)), d).toBe('r3b.devour.no.person')
    expect(devourRefusal(S('creature.murmaw'))).toBe('r3b.devour.no.kind')
  })

  it('吸附與高亮只看吞得下的：小動物、失敗實驗體、異常體、NPC 船員；建物、屍體、玩家不行', () => {
    for (const d of ['creature.slugling', 'creature.failed', 'creature.anomaly', 'npc.crew']) expect(devourable(S(d)), d).toBe(true)
    for (const d of ['personnel', 'npc.pacifier', 'struct.git', 'creature.murmaw']) expect(devourable(S(d)), d).toBe(false)
    expect(devourable(S('creature.slugling', { fl: EntFlag.Corpse }))).toBe(false)
  })
})

describe('船艙艙門：停靠了沒（從太空層推）', () => {
  it('同型船艙只有一艘：太空層沒有那艘船＝停在站上；有＝在太空中', () => {
    expect(cabinDocked('ship:kestrel', ['nyx', 'ship:kestrel', 'ship:mule'], ['station.nyx'])).toBe(true)
    expect(cabinDocked('ship:kestrel', ['nyx', 'ship:kestrel'], ['station.nyx', 'ship.kestrel'])).toBe(false)
    // 同型的不只一艘：分不出來
    expect(cabinDocked('ship:kestrel', ['ship:kestrel', 'ship:kestrel'], [])).toBeNull()
    // 不是船艙
    expect(cabinDocked('nyx', ['nyx'], [])).toBeUndefined()
  })

  it('自己站在船艙裡（沒在駕駛）才有艙門；駕駛中、在站裡沒有', () => {
    const zones = new Map([
      [5, { id: 5, station: 'ship:kestrel', layout: { exits: [{ x: 3.5, y: 3.5 }] } }],
      [1, { id: 1, station: 'nyx', layout: { exits: [] } }],
    ])
    const u = put('personnel', { z: 5, fl: EntFlag.Mine })
    world.me = { unit: u, control: u, alive: true }
    expect(cabinHatch(world, zones)).toEqual({ zone: 5, x: 3.5, y: 3.5, docked: true })
    const ship = put('ship.kestrel', { z: 0 })
    expect(cabinHatch(world, zones)?.docked).toBe(false)
    world.me = { unit: u, control: ship, alive: true }
    expect(cabinHatch(world, zones)).toBeNull()
    const v = put('personnel', { z: 1, fl: EntFlag.Mine })
    world.me = { unit: v, control: v, alive: true }
    expect(cabinHatch(world, zones)).toBeNull()
  })
})

describe('船艙艙門：從自己的觀察追蹤停靠狀態（同型船不只一艘也分得出來）', () => {
  const zones = new Map([
    [1, { id: 1, station: 'nyx', layout: { exits: [] } }],
    [7, { id: 7, station: 'portage', layout: { exits: [] } }],
    [5, { id: 5, station: 'ship:kestrel', layout: { exits: [{ x: 3.5, y: 3.5 }] } }],
    [6, { id: 6, station: 'ship:kestrel', layout: { exits: [{ x: 3.5, y: 3.5 }] } }],
  ])
  const step = (tr: InstanceType<typeof CabinTracker>) => tr.update(world, zones, stationDockable)?.docked

  it('只能登艦的擺渡號不能停靠；女帝號可以', () => {
    expect(stationDockable('portage')).toBe(false)
    expect(stationDockable('nyx')).toBe(true)
  })

  it('從站上登船＝停著；駕駛起飛＝在太空中；駕駛的船從太空層消失（停靠）＝停著', () => {
    const tr = new CabinTracker()
    const u = put('personnel', { z: 1 })
    world.me = { unit: u, control: u, alive: true }
    expect(step(tr)).toBeUndefined()
    world.ents.get(u)!.s.z = 5
    expect(step(tr)).toBe(true)
    // 太空層有另一艘同型船（別人的）：不影響
    put('ship.kestrel', { z: 0 })
    expect(step(tr)).toBe(true)
    // 自己駕駛這艘船飛出去
    const mine = put('ship.kestrel', { z: 0 })
    world.me = { unit: u, control: mine, alive: true }
    step(tr)
    world.me = { unit: u, control: u, alive: true }
    expect(step(tr)).toBe(false)
    // 停靠：那個實體從太空層拿掉
    world.ents.delete(mine)
    expect(step(tr)).toBe(true)
  })

  it('發射倒數數完＝在太空中（別人駕駛、自己是乘客）；倒數中途取消＝仍停著', () => {
    const tr = new CabinTracker()
    const u = put('personnel', { z: 1 })
    world.me = { unit: u, control: u, alive: true }
    step(tr)
    world.ents.get(u)!.s.z = 6
    expect(step(tr)).toBe(true)
    world.me = { unit: u, control: u, alive: true, launchIn: 5 }
    step(tr)
    world.me = { unit: u, control: u, alive: true, launchIn: 0 }
    expect(step(tr)).toBe(true)
    world.me = { unit: u, control: u, alive: true, launchIn: 2 }
    step(tr)
    world.me = { unit: u, control: u, alive: true, launchIn: 1 }
    step(tr)
    const ship = put('ship.kestrel', { z: 0 })
    world.me = { unit: u, control: u, alive: true, launchIn: 0 }
    expect(step(tr)).toBe(false)
    // 發射後新出現的那艘就是這艘：它從太空層消失＝停靠
    world.ents.delete(ship)
    expect(step(tr)).toBe(true)
  })

  it('從只能登艦的站或別的船艙穿過登艦連結進來＝船在太空中', () => {
    const tr = new CabinTracker()
    const u = put('personnel', { z: 7 })
    world.me = { unit: u, control: u, alive: true }
    step(tr)
    world.ents.get(u)!.s.z = 5
    expect(step(tr)).toBe(false)
    world.ents.get(u)!.s.z = 6
    expect(step(tr)).toBe(false)
  })
})

describe('監控掃描的站內畫面：鏡頭拉遠到看得到所有標記', () => {
  it('包圍盒越大拉越遠；寬的畫面橫向比較省', () => {
    const tanV = Math.tan((34 * Math.PI) / 360)
    const small = fitDistance(0, 0, tanV, 16 / 9)
    const big = fitDistance(60, 40, tanV, 16 / 9)
    expect(big).toBeGreaterThan(small)
    expect(fitDistance(60, 0, tanV, 16 / 9)).toBeLessThan(fitDistance(60, 0, tanV, 4 / 3))
  })
})

describe('監控掃描的站內畫面（駕駛中）', () => {
  it('送出掃描後收到站內的標記：切到那一站 PEEK_S 秒，對準所有標記的中心；時間到結束', () => {
    const p = new SweepPeek()
    p.arm(100)
    expect(p.onPing(3, 10, 10, 0, 100.2)).toBe('start')
    expect(p.onPing(3, 20, 30, 0, 100.2)).toBe('more')
    const v = p.current(100.3)!
    expect(v).toMatchObject({ zone: 3, x: 15, y: 20 })
    expect(v.until).toBeCloseTo(100.2 + PEEK_S)
    // 同一個物件（鏡頭只跳一次）
    expect(p.current(101)).toBe(v)
    expect(p.current(100.2 + PEEK_S + 0.01)).toBeNull()
  })

  it('沒有先送出掃描、過了 ARM_S、太空層的 ping：不切；結束後不再接', () => {
    const p = new SweepPeek()
    expect(p.onPing(3, 1, 1, 0, 5)).toBeNull()
    p.arm(10)
    expect(p.onPing(0, 1, 1, 0, 10.1)).toBeNull()
    expect(p.onPing(3, 1, 1, 0, 10 + ARM_S + 0.1)).toBeNull()
    p.arm(20)
    expect(p.onPing(3, 1, 1, 0, 20.1)).toBe('start')
    p.end()
    expect(p.active).toBe(false)
    expect(p.onPing(3, 1, 1, 0, 20.2)).toBeNull()
  })
})

describe('聊天泡泡夾在畫面內', () => {
  it('超出左緣、右緣、頂端：平移回畫面內，大小不變', () => {
    expect(clampRect({ l: -40, r: 60, t: 100, b: 124 }, 800, 600)).toEqual({ l: 4, r: 104, t: 100, b: 124 })
    expect(clampRect({ l: 760, r: 860, t: 100, b: 124 }, 800, 600)).toEqual({ l: 696, r: 796, t: 100, b: 124 })
    expect(clampRect({ l: 100, r: 200, t: -10, b: 14 }, 800, 600)).toEqual({ l: 100, r: 200, t: 4, b: 28 })
    // 在畫面內：不動
    expect(clampRect({ l: 100, r: 200, t: 100, b: 124 }, 800, 600)).toEqual({ l: 100, r: 200, t: 100, b: 124 })
  })
})

describe('單機練習自動暫停', () => {
  it('打開的介面、分頁在背景、場景載入中：任一個就暫停；多人局一律不暫停', () => {
    expect(wantPause(true, false, false, false)).toBe(false)
    expect(wantPause(true, false, true, false)).toBe(true)
    expect(wantPause(true, false, false, true)).toBe(true)
    // 玩家自己開著選單、切回前景：仍然暫停（不會被自動恢復蓋掉）
    expect(wantPause(true, true, false, false)).toBe(true)
    expect(wantPause(false, true, true, true)).toBe(false)
  })
})

describe('單機練習自動暫停：切到背景、載入場景', () => {
  it('分頁切到背景立刻送出暫停（不等去抖）、回來就繼續；玩家自己開著選單時回來仍維持暫停', async () => {
    const listeners: (() => void)[] = []
    const doc = { hidden: false, addEventListener: (_: string, f: () => void) => listeners.push(f), removeEventListener: () => {} }
    vi.stubGlobal('document', doc)
    const menu = signal(false)
    sent.sent.length = 0
    const stop = watchPracticePause(() => menu.value)
    try {
      doc.hidden = true
      for (const f of listeners) f()
      expect(pageHidden.value).toBe(true)
      expect(sent.sent).toEqual([{ t: 'pause', on: true }])
      doc.hidden = false
      for (const f of listeners) f()
      expect(sent.sent).toEqual([
        { t: 'pause', on: true },
        { t: 'pause', on: false },
      ])
      // 玩家按 Esc 打開選單（暫停）→ 切走 → 回來：選單還開著，不送繼續
      menu.value = true
      await new Promise((r) => setTimeout(r, 0))
      expect(sent.sent.at(-1)).toEqual({ t: 'pause', on: true })
      doc.hidden = true
      for (const f of listeners) f()
      doc.hidden = false
      for (const f of listeners) f()
      expect(sent.sent.at(-1)).toEqual({ t: 'pause', on: true })
      menu.value = false
      await new Promise((r) => setTimeout(r, 0))
      expect(sent.sent.at(-1)).toEqual({ t: 'pause', on: false })
      // 局中載入場景：暫停，載入完繼續
      sceneBusy.value = true
      await new Promise((r) => setTimeout(r, 0))
      expect(sent.sent.at(-1)).toEqual({ t: 'pause', on: true })
      sceneBusy.value = false
      await new Promise((r) => setTimeout(r, 0))
      expect(sent.sent.at(-1)).toEqual({ t: 'pause', on: false })
    } finally {
      stop()
      sceneBusy.value = false
      pageHidden.value = false
      vi.unstubAllGlobals()
    }
  })
})
