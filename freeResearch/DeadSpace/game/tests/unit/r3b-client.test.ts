// 第 3 輪審查（client 輸入／HUD）：單機練習暫停、被攻擊警示、變身曝光警告、相鄰設施的面板分頁、吞噬說明、
// 死因只在死亡畫面顯示、開局等待載入不把自己算成「其他玩家」、聊天泡泡避開標籤
import { beforeAll, describe, expect, it } from 'vitest'
import '../../src/shared/content/index'
import { EntFlag, PRACTICE_ROOM, type ChatLine, type PrivateState, type SnapEntity } from '../../src/shared/protocol/messages'
import { HIT_FLASH_MS, HIT_NOTICE_MS, HitWatch } from '../../src/client/hitAlert'
import { EXPOSING_ABILITIES, isWatcher, looksNamed, watcherCount } from '../../src/client/exposure'
import { panelEntries, pickPanel } from '../../src/client/interactPanels'
import { devourCheck } from '../../src/client/devourInfo'
import { deathLines, deathScreenOnly, noteDeath } from '../../src/client/deathNote'
import { ABILITIES } from '../../src/shared/content/registry'
import { UX_EN, UX_ZH } from '../../src/ui/strings/ux'

type Session = typeof import('../../src/client/session')
type Pause = typeof import('../../src/client/practicePause')
type HudMod = typeof import('../../src/ui/hud/Hud')
let session: Session
let pause: Pause
let hud: HudMod
let placeBubble: typeof import('../../src/render/overlay').placeBubble

beforeAll(async () => {
  // session、HUD 模組在測試 build 會碰 window：在 node 裡給個空的 window
  const w = globalThis as unknown as Record<string, unknown>
  w.window ??= globalThis
  w.addEventListener ??= () => {}
  w.removeEventListener ??= () => {}
  session = await import('../../src/client/session')
  pause = await import('../../src/client/practicePause')
  hud = await import('../../src/ui/hud/Hud')
  placeBubble = (await import('../../src/render/overlay')).placeBubble
})

const ent = (s: Partial<SnapEntity> & { i: number }, x = 0, y = 0) => ({ s: { z: 1, ...s } as SnapEntity, x, y })

describe('單機練習暫停', () => {
  it('只有練習房、自己是主機、名單上只有 1 名真人才算單機練習', () => {
    const solo = [{ bot: false }, { bot: true }, { bot: true }]
    expect(pause.isSoloPractice(PRACTICE_ROOM, true, solo)).toBe(true)
    expect(pause.isSoloPractice('ABCDE', true, solo)).toBe(false)
    expect(pause.isSoloPractice(PRACTICE_ROOM, false, solo)).toBe(false)
    expect(pause.isSoloPractice(PRACTICE_ROOM, true, [{ bot: false }, { bot: false }])).toBe(false)
    expect(pause.isSoloPractice(PRACTICE_ROOM, true, undefined)).toBe(false)
  })

  it('同一輪裡關一個開一個（選單 → 說明）只送最後的狀態；狀態沒變不重送；結束時還在暫停就送繼續', () => {
    const out: boolean[] = []
    const q: (() => void)[] = []
    const r = new pause.PauseRequester(
      (on) => out.push(on),
      (f) => {
        q.push(f)
        return 0 as unknown as ReturnType<typeof setTimeout>
      },
    )
    const run = () => q.splice(0).forEach((f) => f())
    r.set(true)
    run()
    expect(out).toEqual([true])
    // 選單關掉、說明打開（同一個同步流程）
    r.set(false)
    r.set(true)
    run()
    expect(out).toEqual([true])
    r.set(false)
    run()
    expect(out).toEqual([true, false])
    r.set(false)
    run()
    expect(out).toEqual([true, false])
    r.set(true)
    run()
    r.dispose()
    expect(out).toEqual([true, false, true, false])
    expect(r.pausedSent).toBe(false)
  })

  it('送出的訊息形狀是 { t: pause, on }', () => {
    const m: import('../../src/client/practicePause').PauseMsg = { t: 'pause', on: true }
    expect(m).toEqual({ t: 'pause', on: true })
  })
})

describe('開局等待載入：不把自己算成其他玩家', () => {
  it('單機練習（只有 1 名真人）永遠不顯示「等待其他玩家」', () => {
    expect(hud.othersLoading(1, 1, true)).toBe(0)
    expect(hud.othersLoading(1, 1, false)).toBe(0)
  })
  it('多人：主機的人數裡還算著自己時要扣掉；自己已經載入完就照實顯示', () => {
    expect(hud.othersLoading(1, 3, true)).toBe(0)
    expect(hud.othersLoading(2, 3, true)).toBe(1)
    expect(hud.othersLoading(2, 3, false)).toBe(2)
    expect(hud.othersLoading(0, 3, false)).toBe(0)
  })
  it('還沒回報 loaded 時一定算著自己', () => {
    expect(session.selfInLoadWait(1e9, 0)).toBe(true)
  })
})

describe('被攻擊警示', () => {
  const at = (unit: number, hp: number, mhp = 600, alive = true) => ({ unit, hp, mhp, alive })

  it('一份快照掉一大截才算被打；持續傷害（每份 1～2 點）不算', () => {
    const w = new HitWatch()
    expect(w.update(at(5, 600), 0)).toBeNull()
    expect(w.update(at(5, 598.8), 50)).toBeNull()
    expect(w.update(at(5, 597.6), 100)).toBeNull()
    const r = w.update(at(5, 577), 150)!
    expect(r.dmg).toBeCloseTo(20.6, 1)
    expect(r.flash).toBe(true)
    expect(r.notice).toBe(true)
  })

  it('暈影與文字提示各自節流', () => {
    const w = new HitWatch()
    w.update(at(5, 600), 0)
    expect(w.update(at(5, 570), 1000)).toMatchObject({ flash: true, notice: true })
    expect(w.update(at(5, 540), 1000 + HIT_FLASH_MS - 1)).toMatchObject({ flash: false, notice: false })
    expect(w.update(at(5, 510), 1000 + HIT_FLASH_MS)).toMatchObject({ flash: true, notice: false })
    expect(w.update(at(5, 480), 1000 + HIT_NOTICE_MS)).toMatchObject({ flash: true, notice: true })
  })

  it('換了主單位、生命上限改變（穿脫防護服、變形）、死了、自己技能的代價都不算', () => {
    const w = new HitWatch()
    w.update(at(5, 600), 0)
    expect(w.update(at(6, 300, 900), 10)).toBeNull()
    expect(w.update(at(6, 200, 700), 20)).toBeNull()
    expect(w.update(at(6, 0, 700, false), 30)).toBeNull()
    const v = new HitWatch()
    v.update(at(5, 600), 0)
    v.command({ k: 'cast', a: 'ab.guard.transfer', e: 9 }, 100)
    expect(v.update(at(5, 550), 200)).toBeNull()
    expect(v.update(at(5, 500), 2000)).not.toBeNull()
  })
})

describe('變身被看到就曝光', () => {
  it('會曝光的技能都在內容表裡（id 沒打錯）', () => {
    for (const id of EXPOSING_ABILITIES) expect(ABILITIES.has(id), id).toBe(true)
  })

  it('視野裡同一個 zone 的人形單位（玩家、NPC 船員、異形／變種人形態、仿生人機體）才算看得到你', () => {
    const me = new Set([1])
    expect(isWatcher({ i: 2, z: 1, d: 'personnel', o: 3 }, me, 1)).toBe(true)
    expect(isWatcher({ i: 3, z: 1, d: 'npc.crew', o: -1 }, me, 1)).toBe(true)
    // 另一個 zone、自己、知道是同一邊的盟友、自己的單位、屍體、小動物、建物都不算
    expect(isWatcher({ i: 2, z: 2, d: 'personnel', o: 3 }, me, 1)).toBe(false)
    expect(isWatcher({ i: 1, z: 1, d: 'personnel', o: 3 }, me, 1)).toBe(false)
    expect(isWatcher({ i: 4, z: 1, d: 'personnel', o: 3, fl: EntFlag.Ally }, me, 1)).toBe(false)
    expect(isWatcher({ i: 4, z: 1, d: 'personnel', o: 3, fl: EntFlag.Mine }, me, 1)).toBe(false)
    expect(isWatcher({ i: 5, z: 1, d: 'personnel', o: 3, fl: EntFlag.Corpse }, me, 1)).toBe(false)
    expect(isWatcher({ i: 6, z: 1, d: 'creature.chicken', o: -1 }, me, 1)).toBe(false)
    expect(isWatcher({ i: 7, z: 1, d: 'struct.console', o: -1 }, me, 1)).toBe(false)
  })

  it('watcherCount／looksNamed 只看自己的快照', () => {
    const ents = new Map([
      [1, ent({ i: 1, d: 'personnel', n: 'Alice', c: 2 })],
      [2, ent({ i: 2, d: 'personnel', n: 'Bob', c: 3, o: 3 })],
      [3, ent({ i: 3, d: 'creature.frog' })],
    ])
    const w = { me: { unit: 1, control: 1 } as Partial<PrivateState>, ents }
    expect(watcherCount(w)).toBe(1)
    expect(looksNamed(w)).toBe(true)
    ents.set(1, ent({ i: 1, d: 'xeno.protoform', n: '', c: -1 }))
    expect(looksNamed(w)).toBe(false)
  })
})

describe('相鄰設施：右鍵點哪台就開哪台，範圍內 2 台以上有分頁', () => {
  const me = ent({ i: 1, d: 'personnel' }, 10, 10)
  const ents = new Map([
    [1, me],
    [10, ent({ i: 10, d: 'vendor.gitTester', x2: { s: 'geneSampler:3:0' } }, 11.8, 10)],
    [11, ent({ i: 11, d: 'dev.gitResolver', x2: { s: 'testResults:1:0' } }, 10.9, 10)],
    [12, ent({ i: 12, d: 'vendor.medical', x2: { s: 'traumaKit:2:0' } }, 20, 10)],
    [13, ent({ i: 13, d: 'vendor.medical', x2: { s: 'traumaKit:2:0' }, z: 2 }, 10, 10)],
  ])
  it('清單只收範圍內、同一個 zone 的，由近到遠；預設最近的', () => {
    const list = panelEntries(me, ents, null)
    expect(list.map((p) => p.id)).toEqual([11, 10])
    expect(pickPanel(list, 0)?.id).toBe(11)
  })
  it('右鍵（或點分頁）的那台在範圍內就是它；走遠了改回最近的', () => {
    const list = panelEntries(me, ents, null)
    expect(pickPanel(list, 10)?.id).toBe(10)
    expect(pickPanel(list, 12)?.id).toBe(11)
  })
  it('sim 送來的設施面板也在清單裡（和販賣機一起切換）', () => {
    const list = panelEntries(me, ents, { k: 'power', e: 99, mode: 0, cd: [], off: 0 })
    expect(list.map((p) => p.kind)).toEqual(['fac', 'vendor', 'vendor'])
    expect(pickPanel(list, 10)?.id).toBe(10)
    expect(pickPanel(list, 99)?.kind).toBe('fac')
  })
})

describe('吞噬說明', () => {
  const mut = (cd = 0, disabled = false): Partial<PrivateState> => ({ role: 'mutant', alive: true, abilities: [{ id: 'mut.devour', cd, maxCd: 12, mana: 0, disabled }] })
  const self = new Set([1])
  it('吞得下的：照內容表的 EP；冷卻中、被沉默另外標', () => {
    expect(devourCheck(mut(), { i: 5, d: 'creature.slugling' }, self)).toEqual({ ok: true, n: 25, cd: 0, blocked: false })
    expect(devourCheck(mut(), { i: 5, d: 'creature.anomaly' }, self)).toMatchObject({ ok: true, n: 125 })
    expect(devourCheck(mut(), { i: 5, d: 'npc.crew' }, self)).toMatchObject({ ok: true, n: 25 })
    expect(devourCheck(mut(4), { i: 5, d: 'creature.frog' }, self)).toMatchObject({ ok: true, cd: 4 })
    expect(devourCheck(mut(0, true), { i: 5, d: 'creature.frog' }, self)).toMatchObject({ ok: true, blocked: true })
  })
  it('吞不下的：玩家（任何形態）與其他生物各有原因', () => {
    expect(devourCheck(mut(), { i: 5, d: 'personnel', o: 2 }, self)).toEqual({ ok: false, why: 'r3b.devour.no.person' })
    expect(devourCheck(mut(), { i: 5, d: 'xeno.protoform', o: -1 }, self)).toEqual({ ok: false, why: 'r3b.devour.no.person' })
    expect(devourCheck(mut(), { i: 5, d: 'creature.snowgle', o: -2 }, self)).toEqual({ ok: false, why: 'r3b.devour.no.kind' })
  })
  it('不提的：沒有吞噬技能、死了、自己、自己的單位、屍體、建物、物品', () => {
    expect(devourCheck({ role: 'human', alive: true, abilities: [] }, { i: 5, d: 'creature.frog' }, self)).toBeNull()
    expect(devourCheck({ ...mut(), alive: false }, { i: 5, d: 'creature.frog' }, self)).toBeNull()
    expect(devourCheck(mut(), { i: 1, d: 'creature.frog' }, self)).toBeNull()
    expect(devourCheck(mut(), { i: 5, d: 'creature.frog', fl: EntFlag.Mine }, self)).toBeNull()
    expect(devourCheck(mut(), { i: 5, d: 'creature.frog', fl: EntFlag.Corpse }, self)).toBeNull()
    expect(devourCheck(mut(), { i: 5, d: 'struct.console' }, self)).toBeNull()
    expect(devourCheck(mut(), { i: 5, d: 'item:traumaKit' }, self)).toBeNull()
  })
})

describe('死因只在死亡畫面顯示', () => {
  const line = (text: string, ch: ChatLine['ch'] = 'private'): ChatLine => ({ from: '', color: -1, ch, text, time: 0 })
  it('死因、先前受傷、「你死了…」只給死亡畫面；其他私人訊息、全場公告照常', () => {
    expect(deathScreenOnly(line('@death.cause.killed|name=Bob'))).toBe(true)
    expect(deathScreenOnly(line('@death.hit.player|name=Bob|dmg=84'))).toBe(true)
    expect(deathScreenOnly(line('@death.you'))).toBe(true)
    expect(deathScreenOnly(line('@death.youAndroid'))).toBe(true)
    expect(deathScreenOnly(line('@death.youBooted'))).toBe(true)
    expect(deathScreenOnly(line('@death.innocent', 'sys'))).toBe(false)
    expect(deathScreenOnly(line('@death.xeno', 'sys'))).toBe(false)
    expect(deathScreenOnly(line('@vendor.soldOut'))).toBe(false)
  })
  it('收到死因時記下這一批（新的一次死亡整批換掉）', () => {
    noteDeath([line('@death.cause.killed|name=Bob'), line('@death.hit.player|name=Cy|dmg=84'), line('@vendor.soldOut')])
    expect(deathLines.value).toEqual(['@death.cause.killed|name=Bob', '@death.hit.player|name=Cy|dmg=84'])
    noteDeath([line('@chat.names|lz=x')])
    expect(deathLines.value.length).toBe(2)
    noteDeath([line('@death.cause.vacuum')])
    expect(deathLines.value).toEqual(['@death.cause.vacuum'])
  })
})

describe('聊天泡泡避開名字與設施標籤', () => {
  it('跟已放好的標籤重疊就往上錯開；沒重疊就留在原位', () => {
    const free = placeBubble(100, 200, 80, 24, [])
    expect(free).toEqual({ l: 60, r: 140, t: 176, b: 200 })
    const label = { l: 70, r: 130, t: 185, b: 205 }
    const up = placeBubble(100, 200, 80, 24, [label])
    expect(up.b).toBeLessThanOrEqual(label.t)
    expect(up.b).toBe(200 - 27)
    // 往上好幾格都被佔：用最高的那格（聊天不能不見）
    const stack = [0, 1, 2, 3, 4].map((k) => ({ l: 0, r: 300, t: 176 - k * 27, b: 200 - k * 27 }))
    expect(placeBubble(100, 200, 80, 24, stack).b).toBe(200 - 4 * 27)
  })
})

describe('新字串中英都有', () => {
  it('r3b.* 每個 key 兩種語言都有', () => {
    const zh = Object.keys(UX_ZH).filter((k) => k.startsWith('r3b.'))
    const en = Object.keys(UX_EN).filter((k) => k.startsWith('r3b.') && !k.endsWith('.one'))
    expect(zh.length).toBeGreaterThan(10)
    expect(en.sort()).toEqual(zh.sort())
  })
})
