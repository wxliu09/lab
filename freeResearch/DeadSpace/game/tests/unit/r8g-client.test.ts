// 第 8 輪 G（觀戰）client 端：看板排序（分層、穩定）、下一個熱點、自動換站（停留、釘住）、人群焦點、亡者之眼名牌色、按鍵 N
import { beforeEach, describe, expect, it, vi } from 'vitest'
import type { Command, SpecBoard } from '../../src/shared/protocol/messages'

const sent = vi.hoisted(() => [] as Command[])
vi.mock('../../src/client/session', async () => {
  const { signal } = await import('@preact/signals')
  const { ClientWorld } = await import('../../src/client/world')
  return { world: new ClientWorld(), snapTick: signal(0), sendCmd: (c: Command) => void sent.push(c), cmdTaps: [], hostGone: signal(false) }
})

const S = await import('../../src/client/spectate')
const { world } = await import('../../src/client/session')
const { followMode } = await import('../../src/client/viewPrefs')
const K = await import('../../src/client/keymap')
const { hasString } = await import('../../src/ui/i18n')
await import('../../src/ui/strings/ghost8')

/** 看板：zone 0 太空、1 女帝號、2 裁決者號、3 船艇；now = 100 */
function board(): SpecBoard {
  return {
    z: [
      [0, 0, -1, 0, 0, 0],
      [1, 0, -1, 0, 0, 0],
      [2, 3, 97, 12, 20, 14],
      [3, 1, -1, 0, 0, 0],
    ],
    d: [
      [1, 70, '研究員 Bob', 'xeno'],
      [1, 20, '醫官 Amy', 'innocent'],
    ],
  }
}

beforeEach(() => {
  sent.length = 0
  world.me = { alive: false, role: 'human', specZone: 1, spec: board() }
  world.serverTime = 100
  world.ents.clear()
  followMode.value = 'off'
})

describe('看板排序', () => {
  it('boardRows：每個地點一列，死亡只掛最新一筆', () => {
    const r = S.boardRows(board())
    expect(r.size).toBe(4)
    expect(r.get(1)!.death).toEqual({ t: 70, name: '研究員 Bob', kind: 'xeno' })
    expect(r.get(2)!.death).toBeUndefined()
    expect(S.inCombat(r.get(2), 100)).toBe(true)
    expect(S.inCombat(r.get(2), 100 + S.COMBAT_RECENT + 1)).toBe(false)
  })

  it('分層：交戰中 → 剛有人死 → 有人 → 無人；同一層維持原本順序', () => {
    const r = S.boardRows(board())
    const ids = [0, 1, 2, 3]
    expect(S.sortByActivity(ids, (id) => r.get(id), 100)).toEqual([2, 1, 3, 0])
    // 死亡過了 60 秒、交戰過了：回到「有人／無人」，原本順序
    expect(S.sortByActivity(ids, (id) => r.get(id), 200)).toEqual([2, 3, 0, 1])
  })

  it('下一個熱點：依分數輪流，目前這站的下一個；沒有動靜回傳 null', () => {
    const r = S.boardRows(board())
    expect(S.nextHotZone(r, 0, 100)).toBe(2)
    expect(S.nextHotZone(r, 2, 100)).toBe(1)
    expect(S.nextHotZone(r, 1, 100)).toBe(3)
    expect(S.nextHotZone(r, 3, 100)).toBe(2)
    expect(S.nextHotZone(S.boardRows({ z: [[0, 0, -1, 0, 0, 0]], d: [] }), 0, 100)).toBeNull()
  })

  it('自動換站：這站在打不換；別站剛打起來就過去；空站換到人多的站', () => {
    const r = S.boardRows(board())
    expect(S.autoZone(r, 1, 100)).toBe(2)
    expect(S.autoZone(r, 2, 100)).toBeNull()
    // 交戰過了 5 秒以上（不算「剛打起來」）：空的太空換到人多的站
    expect(S.autoZone(r, 0, 110)).toBe(2)
    // 有人的站、沒有別處在打：留著
    expect(S.autoZone(r, 3, 110)).toBeNull()
  })
})

describe('下一個熱點、自動跟隨戰鬥', () => {
  it('nextHotspot：觀戰中送 spec、打開跟隨；活著時不處理', () => {
    // 目前在 1（女帝號）；熱點順序 2 → 1 → 3：下一個是 3
    expect(S.nextHotspot()).toBe(true)
    expect(sent).toEqual([{ k: 'spec', s: 3 }])
    expect(followMode.value).toBe('action')
    world.me = { alive: true, role: 'human' }
    sent.length = 0
    expect(S.nextHotspot()).toBe(false)
    expect(sent).toEqual([])
    // 出局、等記憶核心的仿生人也不行
    world.me = { alive: false, role: 'human', booted: true, spec: board() }
    expect(S.nextHotspot()).toBe(false)
    world.me = { alive: false, role: 'android', coreWait: true, spec: board() }
    expect(S.nextHotspot()).toBe(false)
  })

  it('開始觀戰打開跟隨並立刻找戰鬥；換站後至少停一段時間；手動選站＝釘住，不自動換', () => {
    S.onSpectateStart()
    expect(followMode.value).toBe('action')
    S.actionTick(world, 1, 1000)
    expect(sent).toEqual([{ k: 'spec', s: 2 }])
    // 停留時間內：別站再打起來也不換
    world.me.specZone = 2
    world.me.spec = { z: [[1, 2, 101, 9, 3, 3], [2, 3, 90, 0, 0, 0]], d: [] }
    world.serverTime = 102
    S.actionTick(world, 2, 1001)
    expect(sent.length).toBe(1)
    world.serverTime = 100 + S.SWITCH_DWELL + 1
    world.me.spec = { z: [[1, 2, world.serverTime - 1, 9, 3, 3], [2, 3, 90, 0, 0, 0]], d: [] }
    S.actionTick(world, 2, 1002)
    expect(sent).toEqual([
      { k: 'spec', s: 2 },
      { k: 'spec', s: 1 },
    ])
    // 釘住：不再自動換
    S.pinZone()
    world.me.specZone = 2
    world.serverTime += S.SWITCH_DWELL + 1
    world.me.spec = { z: [[1, 2, world.serverTime - 1, 9, 3, 3], [2, 3, 90, 0, 0, 0]], d: [] }
    S.actionTick(world, 2, 1003)
    expect(sent.length).toBe(2)
    expect(S.zonePinned()).toBe(true)
    S.unpinZone()
    S.actionTick(world, 2, 1004)
    expect(sent.length).toBe(3)
  })

  it('不再觀戰（復活、新的一局）：自動跟隨戰鬥關掉；自己開的「跟著自己」不動', () => {
    S.onSpectateStart()
    S.pinZone()
    S.onSpectateEnd()
    expect(followMode.value).toBe('off')
    expect(S.zonePinned()).toBe(false)
    followMode.value = 'self'
    S.onSpectateEnd()
    expect(followMode.value).toBe('self')
  })

  it('站內焦點：剛打過用看板的交戰焦點，否則對準人最多的地方', () => {
    S.pinZone()
    const p = S.actionTick(world, 2, 2000)
    expect(p).toEqual({ x: 20, y: 14 })
    const ent = (i: number, x: number, y: number, o: number) => world.ents.set(i, { s: { i, d: 'personnel', z: 3, o }, samples: [], x, y, f: 0, firstSeen: 0, lastUpdate: 0 })
    ent(1, 5, 5, 1)
    ent(2, 6, 5, 2)
    ent(3, 5, 7, 3)
    ent(4, 40, 40, 4)
    const c = S.actionTick(world, 3, 2001)!
    expect(c.x).toBeCloseTo(16 / 3)
    expect(c.y).toBeCloseTo(17 / 3)
    expect(S.crowdSpot(world.ents.values(), 9)).toBeNull()
  })
})

describe('亡者之眼名牌、按鍵', () => {
  it('ghostColor：有 gf 才上色（依陣營），沒有就照原本的玩家色', () => {
    expect(S.ghostColor({})).toBeNull()
    expect(S.ghostColor({ gf: 'x' })).toBe(S.GHOST_COLORS.x)
    expect(S.ghostColor({ gf: 'ms' })).toBe(S.GHOST_COLORS.m)
    expect(S.ghostColor({ gf: 'h' })).toBe('#9fe7ff')
  })

  it('下一個熱點預設 N，不和其他預設鍵重複，有中英文名稱與陣營標籤', () => {
    const km = K.defaultKeymap()
    expect(km.nextHotspot).toBe('KeyN')
    const codes = Object.values(km).filter(Boolean)
    expect(new Set(codes).size).toBe(codes.length)
    for (const k of ['feel7.kb.a.nextHotspot', 'ghost8.next', 'ghost8.gf.x', 'ghost8.gf.tag', 'ghost8.proph.seal', 'ghost8.end.seer']) {
      expect(hasString('zh', k) && hasString('en', k), k).toBe(true)
    }
  })
})
