// 第 9 輪 S（上架前總評）client 端觀戰：
// - P2-6：站內一直找不到任何看得到的人（看板寫有人，但他隱形、在救生艙裡）BLIND_S 秒就換站：先剛交戰的站、其次人最多的站；
//   釘住的站不換；畫面上正跟著戰鬥特效時不算「看不到人」；
// - P3：挑站時優先已經建好場景的站，還沒建好的站要停 SWITCH_DWELL_LOAD 秒才換；
// - P2-1：附身蛞蝓仔時暫停自動跟隨、改成跟著牠；空白鍵在別站時先換觀戰視角；牠換站時鏡頭跟過去。
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

/** 看板：1 豪勇號（1 人、看不到）、2 裁決者號（3 人、沒在打）、3 天守（1 人，30 秒前打過）、4 女帝號（2 人）*/
function board(now: number): SpecBoard {
  return {
    z: [
      [1, 1, -1, 0, 0, 0],
      [2, 3, -1, 0, 0, 0],
      [3, 1, now - 30, 4, 10, 10],
      [4, 2, -1, 0, 0, 0],
    ],
    d: [],
  }
}

const ent = (i: number, z: number, x: number, y: number, o = 1, d = 'personnel') =>
  world.ents.set(i, { s: { i, d, z, o }, samples: [], x, y, f: 0, firstSeen: 0, lastUpdate: 0 })

/** 畫面時鐘（performance.now 秒）：跨測試一路往前走（人群焦點的快取看畫面時間）*/
let clock = 0

beforeEach(() => {
  sent.length = 0
  world.ents.clear()
  world.serverTime = 1000
  world.me = { alive: false, role: 'human', specZone: 1, unit: 50, control: 0, spec: board(1000) }
  S.onSpectateStart()
  clock += 100
  S.actionTick(world, 1, clock)
  expect(sent).toEqual([])
})

/** 推進 sec 秒遊戲時間（每 0.5 秒呼叫一次 actionTick；畫面時間同步前進）*/
function run(zone: number, sec: number, opt: { ready?: (id: number) => boolean; busy?: boolean; spec?: SpecBoard } = {}) {
  const end = world.serverTime + sec
  while (world.serverTime < end - 1e-6) {
    world.serverTime += 0.5
    clock += 0.5
    world.me.spec = opt.spec ?? board(1000)
    S.actionTick(world, zone, clock, opt.ready, opt.busy)
  }
}

describe('P2-6：看不到人就換站', () => {
  it('看板有人但人群焦點一直是空的：BLIND_S 秒後換到剛交戰的站；不到時間不換', () => {
    run(1, S.BLIND_S - 1.5)
    expect(sent).toEqual([])
    run(1, 2.5)
    expect(sent).toEqual([{ k: 'spec', s: 3 }])
  })

  it('沒有剛交戰的站：換到人最多的站；剛因為看不到人離開的站不會因為人多又被選回來', () => {
    const b = board(1000)
    b.z[2] = [3, 1, -1, 0, 0, 0]
    run(1, S.BLIND_S + 1, { spec: b })
    expect(sent).toEqual([{ k: 'spec', s: 2 }])
    // 到了裁決者號也看不到人（例如都在救生艙裡）：下一個是人第二多的女帝號，不會回到剛離開的豪勇號
    world.me.specZone = 2
    for (let i = 0; i < 40 && sent.length < 2; i++) run(2, 0.5, { spec: b })
    expect(sent[1]).toEqual({ k: 'spec', s: 4 })
  })

  it('看得到人、正跟著戰鬥特效、釘住的站：都不換', () => {
    ent(1, 1, 5, 5)
    run(1, S.BLIND_S + 3)
    expect(sent).toEqual([])
    world.ents.clear()
    run(1, S.BLIND_S + 3, { busy: true })
    expect(sent).toEqual([])
    S.pinZone()
    run(1, S.BLIND_S + 3)
    expect(sent).toEqual([])
  })

  it('畫面上的站還不是觀戰視角的站（換站中、載入中）：不算看不到人', () => {
    run(4, S.BLIND_S + 3)
    expect(sent).toEqual([])
  })
})

describe('P3：優先已經建好場景的站', () => {
  it('autoZone：剛打起來的站有好幾個時挑建好的；人多的站建好的加倍計；沒給 ready 照舊', () => {
    const rows = S.boardRows({
      z: [
        [1, 0, -1, 0, 0, 0],
        [2, 2, 99, 12, 0, 0],
        [3, 2, 99, 4, 0, 0],
      ],
      d: [],
    })
    expect(S.autoZone(rows, 1, 100)).toBe(2)
    expect(S.autoZone(rows, 1, 100, (id) => id === 3)).toBe(3)
    const crowd = S.boardRows({
      z: [
        [1, 0, -1, 0, 0, 0],
        [2, 5, -1, 0, 0, 0],
        [3, 3, -1, 0, 0, 0],
      ],
      d: [],
    })
    expect(S.autoZone(crowd, 1, 100)).toBe(2)
    expect(S.autoZone(crowd, 1, 100, (id) => id === 3)).toBe(3)
    // 差太多還是去人多的（建好的 1 人 × 2 < 5 人）
    expect(S.autoZone(S.boardRows({ z: [[1, 0, -1, 0, 0, 0], [2, 5, -1, 0, 0, 0], [3, 1, -1, 0, 0, 0]], d: [] }), 1, 100, (id) => id === 3)).toBe(2)
  })

  it('要去的站還沒建好：上次換站後要停 SWITCH_DWELL_LOAD 秒才去；建好的站照舊 SWITCH_DWELL', () => {
    // 換一次站之後（豪勇號看不到人 → 剛交戰的天守），在天守也看不到人：量第二次換站要等多久
    const second = (ready: (id: number) => boolean) => {
      run(1, S.BLIND_S + 1, { ready })
      expect(sent).toEqual([{ k: 'spec', s: 3 }])
      world.me.specZone = 3
      const t0 = world.serverTime
      while (sent.length < 2 && world.serverTime - t0 < 60) run(3, 0.5, { ready })
      expect(sent[1]).toEqual({ k: 'spec', s: 2 })
      return world.serverTime - t0
    }
    const slow = second(() => false)
    expect(slow).toBeGreaterThanOrEqual(S.SWITCH_DWELL_LOAD - 1.5)
    sent.length = 0
    world.serverTime = 1000
    world.me.specZone = 1
    S.onSpectateStart()
    const fast = second(() => true)
    expect(fast).toBeLessThan(S.SWITCH_DWELL + 1.5)
    expect(slow - fast).toBeGreaterThan(4)
  })
})

describe('P2-1：附身蛞蝓仔', () => {
  it('possessedId：死者 control 換成別的單位才算；活人、旁觀者、出局的不算', () => {
    expect(S.possessedId({ alive: false, role: 'human', unit: 50, control: 77 })).toBe(77)
    expect(S.possessedId({ alive: false, role: 'human', unit: 50, control: 0 })).toBe(0)
    expect(S.possessedId({ alive: true, role: 'human', unit: 50, control: 77 })).toBe(0)
    expect(S.possessedId({ alive: false, role: 'spectator', unit: 50, control: 77 })).toBe(0)
    expect(S.possessedId({ alive: false, role: 'human', booted: true, unit: 50, control: 77 })).toBe(0)
  })

  it('附身：暫停自動跟隨（改成跟著自己、釘住站）；牠死了恢復自動跟隨戰鬥', () => {
    expect(followMode.value).toBe('action')
    S.onPossess(77)
    expect(followMode.value).toBe('self')
    expect(S.zonePinned()).toBe(true)
    run(1, S.BLIND_S + 3)
    expect(sent).toEqual([])
    S.onPossess(0)
    expect(followMode.value).toBe('action')
    expect(S.zonePinned()).toBe(false)
    // 使用者自己關掉跟隨的：牠死了也不強制打開
    S.onPossess(78)
    followMode.value = 'off'
    S.onPossess(0)
    expect(followMode.value).toBe('off')
  })

  it('空白鍵：蛞蝓仔在別站就先換觀戰視角（自動跟隨戰鬥改成跟著自己）；同一站、不是蛞蝓仔不處理', () => {
    world.me.control = 77
    ent(77, 3, 4, 4, 1, 'creature.slugling')
    expect(S.specGoTo(world.ents.get(77))).toBe(true)
    expect(sent).toEqual([{ k: 'spec', s: 3 }])
    expect(followMode.value).toBe('self')
    world.me.specZone = 3
    expect(S.specGoTo(world.ents.get(77))).toBe(false)
    ent(5, 1, 4, 4)
    expect(S.specGoTo(world.ents.get(5))).toBe(false)
    world.me = { alive: true, role: 'human', unit: 5, control: 5, specZone: 1 }
    expect(S.specGoTo(world.ents.get(5))).toBe(false)
    expect(sent.length).toBe(1)
  })

  it('跟著蛞蝓仔時牠換了站：觀戰視角跟過去（每秒最多一次）；沒在跟就不動', () => {
    world.me.control = 77
    ent(77, 2, 4, 4, 1, 'creature.slugling')
    followMode.value = 'self'
    S.possessFollowTick(world, 100)
    S.possessFollowTick(world, 100.5)
    expect(sent).toEqual([{ k: 'spec', s: 2 }])
    world.me.specZone = 2
    S.possessFollowTick(world, 102)
    expect(sent.length).toBe(1)
    world.ents.get(77)!.s.z = 4
    followMode.value = 'off'
    S.possessFollowTick(world, 104)
    expect(sent.length).toBe(1)
  })
})
