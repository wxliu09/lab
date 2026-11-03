// Sim 的錯誤韌性：單一步驟丟出例外不能卡死整局，要計數；正常對局不應有任何被吞掉的例外
import { afterEach, describe, expect, it, vi } from 'vitest'
import { Harness } from './helpers/harness'
import { ClientWorld } from '../../src/client/world'
import { detectQuality } from '../../src/render/quality'

afterEach(() => {
  vi.restoreAllMocks()
})

describe('sim 錯誤韌性', () => {
  it('正常的 bots 對局沒有被吞掉的例外', () => {
    const { h } = Harness.started(1, 4242, { bots: 7 })
    h.ticks(20 * 30)
    const g = h.server.game!
    expect(g.stepErrors).toBe(0)
    expect(g.errStreak).toBe(0)
  })

  it('系統持續丟例外：整局照常推進、計數，停止後連續錯誤歸零', () => {
    vi.spyOn(console, 'error').mockImplementation(() => {})
    const { h, cs } = Harness.started(1, 77, { bots: 3 })
    h.allowStepErrors = true
    const g = h.server.game!
    let broken = true
    g.systems.push({
      name: 'boom',
      fn: () => {
        if (broken) throw new Error('boom')
      },
    })
    const t0 = g.world.tick
    const snaps0 = cs[0].snaps.length
    h.ticks(40)
    expect(g.world.tick - t0).toBe(40)
    expect(cs[0].snaps.length - snaps0).toBe(40)
    expect(g.stepErrors).toBeGreaterThanOrEqual(40)
    expect(g.errStreak).toBe(40)
    broken = false
    h.ticks(2)
    expect(g.errStreak).toBe(0)
  })

  it('核心步驟（移動、戰鬥…）內部的例外被攔下，不會從 server.tick 丟出去', () => {
    vi.spyOn(console, 'error').mockImplementation(() => {})
    const { h, cs } = Harness.started(1, 99, { bots: 5 })
    h.allowStepErrors = true
    const g = h.server.game!
    h.ticks(20)
    // 仿照 R4 的注入方式：讓所有用到 Math.hypot 的步驟丟例外 10 個 tick
    const orig = Math.hypot
    Math.hypot = () => {
      throw new Error('injected')
    }
    try {
      expect(() => h.ticks(10)).not.toThrow()
    } finally {
      Math.hypot = orig
    }
    expect(g.stepErrors).toBeGreaterThan(0)
    const snaps = cs[0].snaps.length
    const tick = g.world.tick
    h.ticks(20)
    expect(g.world.tick - tick).toBe(20)
    expect(cs[0].snaps.length - snaps).toBe(20)
    expect(g.errStreak).toBe(0)
  })
})

describe('client 端世界', () => {
  it('goneQueue 有上限、reset 時清空；記錄最近一次快照時間', () => {
    const w = new ClientWorld()
    const ids = Array.from({ length: 600 }, (_, i) => i + 1)
    w.apply({ tick: 1, time: 1, e: ids.map((i) => ({ i, x: 0, y: 0 })), g: [] } as never)
    expect(w.lastSnapAt).toBeGreaterThan(0)
    w.apply({ tick: 2, time: 1.05, e: [], g: ids } as never)
    expect(w.goneQueue.length).toBeLessThanOrEqual(256)
    expect(w.goneQueue[w.goneQueue.length - 1]).toBe(600)
    w.reset()
    expect(w.goneQueue.length).toBe(0)
    expect(w.lastSnapAt).toBe(0)
  })

  it('主機載入中偵測：超過門檻沒收到快照才算（還沒收到第一份時從開始等待算起）', () => {
    const w = new ClientWorld()
    expect(w.snapStale(1000, 0, 1500)).toBe(false)
    expect(w.snapStale(2000, 0, 1500)).toBe(true)
    w.lastSnapAt = 5000
    expect(w.snapStale(6400, 0, 1500)).toBe(false)
    expect(w.snapStale(6600, 0, 1500)).toBe(true)
  })
})

describe('預設畫質', () => {
  const gl = (name: string) =>
    ({
      RENDERER: 0x1f01,
      getExtension: () => ({ UNMASKED_RENDERER_WEBGL: 0x9246 }),
      getParameter: () => name,
    }) as unknown as WebGL2RenderingContext
  const fast = { hardwareConcurrency: 12, deviceMemory: 8 }
  it('內顯、行動 GPU、軟體算繪 → low', () => {
    for (const n of [
      'ANGLE (Intel, Intel(R) UHD Graphics 620 Direct3D11 vs_5_0 ps_5_0, D3D11)',
      'ANGLE (Intel, Intel(R) Iris(R) Xe Graphics Direct3D11 vs_5_0 ps_5_0, D3D11)',
      'ANGLE (AMD, AMD Radeon(TM) Graphics Direct3D11 vs_5_0 ps_5_0, D3D11)',
      'ANGLE (Google, Vulkan 1.3.0 (SwiftShader Device (Subzero) (0x0000C0DE)), SwiftShader driver)',
      'Mali-G78',
      'Adreno (TM) 650',
      'Apple GPU',
      'llvmpipe (LLVM 15.0.7, 256 bits)',
    ])
      expect(detectQuality(gl(n), fast), n).toBe('low')
  })
  it('獨顯與 Apple M 系列 → medium', () => {
    for (const n of [
      'ANGLE (NVIDIA, NVIDIA GeForce RTX 3060 Direct3D11 vs_5_0 ps_5_0, D3D11)',
      'ANGLE (AMD, AMD Radeon RX 6700 XT Direct3D11 vs_5_0 ps_5_0, D3D11)',
      'ANGLE (Intel, Intel(R) Arc(TM) A770 Graphics Direct3D11 vs_5_0 ps_5_0, D3D11)',
      'ANGLE (Apple, ANGLE Metal Renderer: Apple M2, Unspecified Version)',
    ])
      expect(detectQuality(gl(n), fast), n).toBe('medium')
  })
  it('核心數少或記憶體小 → low；沒有 WebGL 時只看 CPU／記憶體', () => {
    const nv = 'ANGLE (NVIDIA, NVIDIA GeForce RTX 3060 Direct3D11 vs_5_0 ps_5_0, D3D11)'
    expect(detectQuality(gl(nv), { hardwareConcurrency: 4, deviceMemory: 8 })).toBe('low')
    expect(detectQuality(gl(nv), { hardwareConcurrency: 16, deviceMemory: 4 })).toBe('low')
    expect(detectQuality(null, { hardwareConcurrency: 16 })).toBe('medium')
  })
})
