// 第 7 輪（視聽與手感）鏡頭：預設距離拉近、平滑震動（跟著使用者設定）、跟隨與手動移動取消、觀戰的戰鬥跟隨、FPS 上限
import { afterEach, describe, expect, it, vi } from 'vitest'
import { ACTION_DWELL, ActionFollow, DEFAULT_ZOOM, RtsCamera, shakeNoise } from '../../src/render/camera'
import { fpsGate, setShakeOn, shakeOn } from '../../src/client/viewPrefs'

afterEach(() => {
  vi.restoreAllMocks()
  shakeOn.value = true
})

function cam(): RtsCamera {
  const c = new RtsCamera()
  c.setBounds(0, 0, 100, 100)
  c.jump(50, 50)
  return c
}

describe('預設距離', () => {
  it('站內預設距離比原本（0.5 → 37 m）近 20–25%', () => {
    const c = new RtsCamera()
    const old = c.minDist + (c.maxDist - c.minDist) * 0.5
    const k = c.distance() / old
    expect(DEFAULT_ZOOM).toBeLessThan(0.5)
    expect(k).toBeGreaterThan(0.75)
    expect(k).toBeLessThan(0.8)
  })
})

describe('鏡頭震動', () => {
  it('不用 Math.random；平滑（高取樣率下相鄰兩幀的差很小）、有界', () => {
    // three 建鏡頭時會用 Math.random 產生 uuid：建好之後才開始看
    const c = cam()
    const rnd = vi.spyOn(Math, 'random')
    const xs: number[] = []
    for (let i = 0; i < 400; i++) {
      c.shake = 1
      c.update(0.001, 1280, 720)
      xs.push(c.cam.position.x - 50)
    }
    expect(rnd).not.toHaveBeenCalled()
    const amp = Math.max(...xs.map(Math.abs))
    expect(amp).toBeGreaterThan(0.05)
    expect(amp).toBeLessThanOrEqual(0.3 + 1e-6)
    // 17.1 Hz 的正弦在 1 ms 內最多變 2π·17.1·0.001 ≈ 0.107 倍振幅
    for (let i = 1; i < xs.length; i++) expect(Math.abs(xs[i] - xs[i - 1])).toBeLessThan(0.3 * 0.12)
  })

  it('噪聲的主頻在 12–18 Hz：一秒內過零次數約 2×12～2×18', () => {
    let zc = 0
    let prev = shakeNoise(0, 0)
    for (let i = 1; i <= 4000; i++) {
      const v = shakeNoise(i / 4000, 0)
      if (Math.sign(v) !== Math.sign(prev)) zc++
      prev = v
    }
    expect(zc).toBeGreaterThanOrEqual(22)
    expect(zc).toBeLessThanOrEqual(38)
  })

  it('設定關掉震動：完全不晃', () => {
    setShakeOn(false)
    const c = cam()
    for (let i = 0; i < 30; i++) {
      c.shake = 1
      c.update(1 / 60, 1280, 720)
      expect(Math.abs(c.cam.position.x - 50)).toBeLessThan(1e-9)
    }
  })
})

describe('跟隨與手動移動', () => {
  it('跟隨中鎖在目標上；方向鍵移動＝手動，取消跟隨並通知', () => {
    const c = cam()
    const tgt = { x: 60, y: 40 }
    let cancelled = 0
    c.onManualPan = () => cancelled++
    c.follow = () => tgt
    c.update(1 / 60, 1280, 720)
    expect([c.tx, c.ty]).toEqual([60, 40])
    c.key('ArrowLeft', true)
    c.update(1 / 60, 1280, 720)
    expect(c.follow).toBeNull()
    expect(cancelled).toBe(1)
    expect(c.tx).toBeLessThan(60)
  })

  it('邊緣捲動、拖曳也算手動；縮放不算', () => {
    const c = cam()
    let cancelled = 0
    c.onManualPan = () => cancelled++
    c.follow = () => ({ x: 50, y: 50 })
    c.wheel(120)
    c.update(1 / 60, 1280, 720)
    expect(cancelled).toBe(0)
    c.mouseAt(2, 300, true)
    c.update(1 / 60, 1280, 720)
    expect(cancelled).toBe(1)
    c.mouseAt(-1, -1, false)
    c.follow = () => ({ x: 50, y: 50 })
    c.pan(30, 0, 720)
    expect(cancelled).toBe(2)
    expect(c.follow).toBeNull()
  })

  it('focus：移到跟隨目標本身（空白鍵）不取消，移到別處（點小地圖）取消', () => {
    const c = cam()
    let cancelled = 0
    c.onManualPan = () => cancelled++
    c.follow = () => ({ x: 70, y: 30 })
    c.focus(70.4, 30.2)
    expect(cancelled).toBe(0)
    expect(c.follow).not.toBeNull()
    c.focus(10, 90)
    expect(cancelled).toBe(1)
    expect(c.follow).toBeNull()
  })

  it('followEase > 0：平滑移過去，不瞬移', () => {
    const c = cam()
    c.follow = () => ({ x: 80, y: 50 })
    c.followEase = 2.2
    c.update(0.1, 1280, 720)
    expect(c.tx).toBeGreaterThan(50.5)
    expect(c.tx).toBeLessThan(60)
    for (let i = 0; i < 300; i++) c.update(1 / 60, 1280, 720)
    expect(c.tx).toBeCloseTo(80, 1)
  })
})

describe('觀戰的戰鬥跟隨（ActionFollow）', () => {
  it('第一個事件立刻跟；別處的新事件至少停 4 秒、而且這裡安靜了才換', () => {
    const a = new ActionFollow()
    expect(a.pick(1, 0)).toBeNull()
    a.note(1, 10, 10, 0)
    expect(a.pick(1, 0.1)).toMatchObject({ x: 10, y: 10 })
    // 1 秒後別處打起來：還在停留時間內，不換
    a.note(1, 40, 40, 1)
    expect(a.pick(1, 1.1)).toMatchObject({ x: 10, y: 10 })
    // 停留時間到了，原地已經安靜（最後一個事件在 0 秒）：換過去
    a.note(1, 41, 40, ACTION_DWELL - 0.5)
    expect(a.pick(1, ACTION_DWELL + 0.2)).toMatchObject({ x: 41, y: 40 })
  })

  it('同一場戰鬥的事件讓焦點跟著飄；還在打就不換（最多停約 9 秒）', () => {
    const a = new ActionFollow()
    a.note(1, 10, 10, 0)
    a.pick(1, 0)
    a.note(1, 50, 50, 0.5)
    let t = 0
    for (; t < 8; t += 0.5) {
      a.note(1, 12, 10, t)
      expect(a.pick(1, t)!.x).toBeLessThan(13)
      // 別處持續有新事件
      a.note(1, 50, 50 + t * 0.1, t)
    }
    expect(a.pick(1, 8)!.x).toBeGreaterThan(11)
    a.note(1, 12, 10, 9.4)
    a.note(1, 50, 52, 9.4)
    expect(a.pick(1, 9.5)).toMatchObject({ x: 50, y: 52 })
  })

  it('別的 zone 的事件不跟；畫面換到那個 zone 就跟那裡最新的', () => {
    const a = new ActionFollow()
    a.note(2, 5, 5, 0)
    expect(a.pick(1, 0.1)).toBeNull()
    expect(a.pick(2, 0.2)).toMatchObject({ x: 5, y: 5 })
  })
})

describe('FPS 上限（fpsGate）', () => {
  /** 用 hz 的 rAF（時間戳有 ±jitter ms 的抖動）跑 2 秒，回傳實際畫的幀率（同 engine.ts：rAF 間隔平滑後傳進去）*/
  function run(hz: number, cap: number, jitter = 0): number {
    let last = 0
    let drawn = 0
    let seed = 1
    let iv = 16.7
    let prev = 0
    const rnd = () => ((seed = (seed * 16807) % 2147483647) / 2147483647) * 2 - 1
    for (let i = 1; i <= hz * 2; i++) {
      const now = (i * 1000) / hz + rnd() * jitter
      if (prev > 0) iv += (now - prev - iv) * 0.1
      prev = now
      // 前 0.25 秒是平滑的暖身（engine 長時間跑，這段不計）
      const g = fpsGate(now, last, cap, iv)
      if (i <= hz / 4) {
        if (g >= 0) last = g
        continue
      }
      if (g < 0) continue
      last = g
      drawn++
    }
    return drawn / 1.75
  }

  it('0 = 不限制（跟著 vsync）', () => {
    expect(run(144, 0)).toBeCloseTo(144, 0)
    expect(run(60, 0)).toBeCloseTo(60, 0)
  })

  it('上限低於螢幕更新率：平均貼近上限', () => {
    expect(run(60, 30)).toBeCloseTo(30, 0)
    expect(Math.abs(run(144, 60) - 60)).toBeLessThanOrEqual(1)
    expect(Math.abs(run(144, 120) - 120)).toBeLessThanOrEqual(2)
    expect(Math.abs(run(240, 30) - 30)).toBeLessThanOrEqual(1)
  })

  it('上限不低於螢幕更新率：時間戳抖動、螢幕稍快（60.06 Hz）都不會掉幀', () => {
    expect(run(60, 60, 0.8)).toBeCloseTo(60, 0)
    expect(run(120, 120, 0.5)).toBeCloseTo(120, 0)
    expect(run(60.06, 60, 0.3)).toBeCloseTo(60.06, 0)
    expect(run(60, 120)).toBeCloseTo(60, 0)
  })
})
