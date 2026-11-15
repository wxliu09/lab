// 第 3 輪審查（HUD）：上方公告與右側提示同一則內容去重；變種人懸停生物時說明可以／不能吞噬
import { afterEach, describe, expect, it, vi } from 'vitest'
import '../../src/shared/content/index'
import type { PrivateState } from '../../src/shared/protocol/messages'

vi.mock('../../src/client/session', async () => {
  const { signal } = await import('@preact/signals')
  const { ClientWorld } = await import('../../src/client/world')
  return { world: new ClientWorld(), snapTick: signal(0), screen: signal('game'), chatTaps: [], cmdTaps: [], sendCmd: () => {} }
})
vi.mock('../../src/client/input', async () => {
  const { signal } = await import('@preact/signals')
  return { localNotice: signal(null), cursorScreen: { x: 0, y: 0, overView: false }, giveRefusalHere: () => null, modalOpen: () => false, targetMode: signal(null) }
})

const { world } = await import('../../src/client/session')
const { addItems } = await import('../../src/ui/hud/Announce')
const { hoverTip } = await import('../../src/ui/hud/WorldHover')
const { EntFlag } = await import('../../src/shared/protocol/messages')
const { lang } = await import('../../src/ui/i18n')
type SnapEntity = import('../../src/shared/protocol/messages').SnapEntity

afterEach(() => {
  lang.value = 'zh'
  world.ents.clear()
  world.me = {}
})

describe('公告與提示去重', () => {
  type It = { id: number; text: string; kind: 'event' | 'apoc' | 'sys' | 'ok' | 'err'; until: number; life: number; count?: number }
  const it_ = (id: number, text: string, kind: It['kind'] = 'err', until = 5000): It => ({ id, text, kind, until, life: 4000 })

  it('同一區裡內容相同、還在顯示的：拿掉舊的、新的接在最後並記下次數', () => {
    let xs: It[] = [it_(1, '無法到達'), it_(2, '別的提示')]
    xs = addItems(xs, [it_(3, '無法到達')], 1000)
    expect(xs.map((x) => x.id)).toEqual([2, 3])
    expect(xs[1].count).toBe(2)
    xs = addItems(xs, [it_(4, '無法到達')], 1000)
    expect(xs.map((x) => x.id)).toEqual([2, 4])
    expect(xs[1].count).toBe(3)
  })

  it('上方大公告與右側小提示分開比；已經過期的不算重複', () => {
    let xs: It[] = [it_(1, '補給船提早抵達', 'event')]
    xs = addItems(xs, [it_(2, '補給船提早抵達', 'ok')], 1000)
    expect(xs.map((x) => x.id)).toEqual([1, 2])
    xs = addItems(xs, [it_(3, '補給船提早抵達', 'sys')], 1000)
    expect(xs.map((x) => x.id)).toEqual([2, 3])
    const old: It[] = [it_(1, 'x', 'err', 500)]
    expect(addItems(old, [it_(2, 'x')], 1000).map((x) => x.count ?? 1)).toEqual([1, 1])
  })

  it('同一批裡重複的也合併', () => {
    const xs = addItems([] as It[], [it_(1, 'a', 'sys'), it_(2, 'a', 'sys')], 0)
    expect(xs.length).toBe(1)
    expect(xs[0].count).toBe(2)
  })
})

describe('變種人懸停生物：可以／不能吞噬', () => {
  let nextId = 900
  function put(d: string, extra: Partial<SnapEntity> = {}): number {
    const i = nextId++
    const s: SnapEntity = { i, d, z: 1, x: 500, y: 500, hp: 100, mhp: 100, o: -1, fl: 0, ...extra }
    world.ents.set(i, { s, samples: [], x: 5, y: 5, f: 0, firstSeen: 0, lastUpdate: 0 })
    return i
  }
  const mut = (cd = 0): Partial<PrivateState> => ({ role: 'mutant', alive: true, unit: 1, control: 1, abilities: [{ id: 'mut.devour', cd, maxCd: 12, mana: 0 }] })

  it('吞得下：寫出 EP 與按鍵；冷卻中寫出還要幾秒', () => {
    world.me = mut()
    expect(hoverTip(put('creature.chicken'))!.hint).toContain('可以吞噬（+25 EP）：按 Q')
    world.me = mut(7.5)
    expect(hoverTip(put('creature.anomaly'))!.hint).toContain('可以吞噬（+125 EP），吞噬冷卻中：還要 7.5 秒')
  })

  it('吞不下：玩家寫「吞不了玩家」，其他生物說明能吞哪些', () => {
    world.me = mut()
    expect(hoverTip(put('personnel', { o: 3, n: 'Bob', c: 2 }))!.hint).toContain('不能吞噬：吞不了玩家')
    expect(hoverTip(put('creature.snowgle', { fl: EntFlag.Hostile, o: -2 }))!.hint).toContain('不能吞噬：只吞得下')
    lang.value = 'en'
    expect(hoverTip(put('personnel', { o: 3, n: 'Bob', c: 2 }))!.hint).toContain("Cannot devour: players can’t be devoured")
  })

  it('不是變種人主腦（沒有吞噬技能）不提吞噬', () => {
    world.me = { role: 'xeno', alive: true, unit: 1, control: 1, abilities: [] }
    expect(hoverTip(put('creature.chicken'))!.hint ?? '').not.toContain('吞噬')
    expect(hoverTip(put('personnel', { o: 3 }))!.hint ?? '').not.toContain('吞噬')
  })
})
