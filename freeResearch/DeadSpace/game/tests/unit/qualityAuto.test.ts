// 畫質相關的裝置判斷：預建門檻（canPrebuild）與 fps 持續過低時自動降畫質（autoDropStep）
import { describe, expect, it } from 'vitest'
import { canPrebuild, detectQuality } from '../../src/render/quality'
import { AUTO_DROP, autoDropState, autoDropStep, type AutoDropInput } from '../../src/render/autoDrop'

const gl = (name: string) =>
  ({
    RENDERER: 0x1f01,
    getExtension: () => ({ UNMASKED_RENDERER_WEBGL: 0x9246 }),
    getParameter: () => name,
  }) as unknown as WebGL2RenderingContext

const NV = 'ANGLE (NVIDIA, NVIDIA GeForce RTX 3060 Direct3D11 vs_5_0 ps_5_0, D3D11)'
const UHD = 'ANGLE (Intel, Intel(R) UHD Graphics 620 Direct3D11 vs_5_0 ps_5_0, D3D11)'
const XE = 'ANGLE (Intel, Intel(R) Iris(R) Xe Graphics Direct3D11 vs_5_0 ps_5_0, D3D11)'
const APU = 'ANGLE (AMD, AMD Radeon(TM) Graphics Direct3D11 vs_5_0 ps_5_0, D3D11)'
const SWS = 'ANGLE (Google, Vulkan 1.3.0 (SwiftShader Device (Subzero) (0x0000C0DE)), SwiftShader driver)'
const DESKTOP_UA = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0.0.0 Safari/537.36'

describe('預建門檻：只有 ≤ 4 核、deviceMemory ≤ 4、行動裝置、軟體算繪不預建', () => {
  // 第 3 輪 R4 偽裝的 8 種裝置（GPU 名稱、核心數、deviceMemory、maxTouchPoints）；內顯筆電改為預建
  const cases: [string, string, number, number | undefined, number, boolean][] = [
    ['nvidia-8c-8g', NV, 8, 8, 0, true],
    ['intel-uhd-8c-8g', UHD, 8, 8, 0, true],
    ['intel-iris-xe-12c-16g', XE, 12, 8, 0, true],
    ['nvidia-8c-4g', NV, 8, 4, 0, false],
    ['nvidia-4c-8g', NV, 4, 8, 0, false],
    ['safari-mac-applegpu', 'Apple GPU', 8, undefined, 0, true],
    ['safari-ipad-applegpu', 'Apple GPU', 8, undefined, 5, false],
    ['swiftshader', SWS, 8, 8, 0, false],
  ]
  for (const [name, gpu, cores, mem, touch, want] of cases)
    it(name, () => expect(canPrebuild(gl(gpu), { hardwareConcurrency: cores, deviceMemory: mem, maxTouchPoints: touch, userAgent: DESKTOP_UA })).toBe(want))

  it('AMD APU 筆電（> 4 核、> 4 GB）預建；預設畫質照舊是 low（兩者分開判斷）', () => {
    const nav = { hardwareConcurrency: 8, deviceMemory: 16, maxTouchPoints: 0, userAgent: DESKTOP_UA }
    expect(canPrebuild(gl(APU), nav)).toBe(true)
    expect(detectQuality(gl(APU), nav)).toBe('low')
    expect(detectQuality(gl(XE), nav)).toBe('low')
  })

  it('行動裝置：行動 GPU、UA、UA Client Hints、不知道觸控點的 Apple GPU 都不預建', () => {
    const fast = { hardwareConcurrency: 8, deviceMemory: 8, maxTouchPoints: 5, userAgent: DESKTOP_UA }
    expect(canPrebuild(gl('Mali-G78'), fast)).toBe(false)
    expect(canPrebuild(gl('Adreno (TM) 740'), fast)).toBe(false)
    expect(canPrebuild(gl(NV), { ...fast, userAgent: 'Mozilla/5.0 (Linux; Android 14; Pixel 8) Mobile Safari/537.36' })).toBe(false)
    expect(canPrebuild(gl(NV), { ...fast, userAgentData: { mobile: true } })).toBe(false)
    expect(canPrebuild(gl('Apple GPU'), { hardwareConcurrency: 8 })).toBe(false)
    expect(canPrebuild(gl('llvmpipe (LLVM 15.0.7, 256 bits)'), fast)).toBe(false)
  })
})

describe('fps 持續過低時自動降畫質', () => {
  /** 以固定 fps 跑 sec 秒；回傳第一次要降畫質的時間（沒有 = -1）*/
  function run(s: ReturnType<typeof autoDropState>, t0: number, sec: number, fps: number, over: Partial<AutoDropInput> = {}): { t: number; drop: number } {
    let drop = -1
    let t = t0
    const dt = 1 / fps
    while (t < t0 + sec) {
      t += dt
      if (autoDropStep(s, { now: t, quality: 'medium', chosen: false, paused: false, ...over }) && drop < 0) drop = t
    }
    return { t, drop }
  }

  it('medium、15 fps：等 grace 之後連續 10 秒才降，而且只降一次', () => {
    const s = autoDropState()
    const a = run(s, 100, 14, 15)
    expect(a.drop).toBe(-1)
    const b = run(s, a.t, 3, 15)
    expect(b.drop).toBeGreaterThan(100 + AUTO_DROP.grace + AUTO_DROP.hold - 0.1)
    expect(b.drop).toBeLessThan(100 + AUTO_DROP.grace + AUTO_DROP.hold + 1.2)
    // 之後就算 high 又很慢也不再降（每局一次）
    expect(run(s, b.t, 30, 10, { quality: 'high' }).drop).toBe(-1)
  })

  it('fps 夠（25）、已經是 low、使用者選過畫質：都不降', () => {
    expect(run(autoDropState(), 0, 60, 25).drop).toBe(-1)
    expect(run(autoDropState(), 0, 60, 10, { quality: 'low' }).drop).toBe(-1)
    expect(run(autoDropState(), 0, 60, 10, { chosen: true }).drop).toBe(-1)
  })

  it('high 也會降', () => {
    expect(run(autoDropState(), 0, 20, 12, { quality: 'high' }).drop).toBeGreaterThan(0)
  })

  it('中間恢復到 30 fps 就重新計', () => {
    const s = autoDropState()
    let r = run(s, 0, 12, 15)
    r = run(s, r.t, 3, 30)
    r = run(s, r.t, 8, 15)
    expect(r.drop).toBe(-1)
    expect(run(s, r.t, 4, 15).drop).toBeGreaterThan(0)
  })

  it('載入／預建期間（paused）不計；結束後還要先等 grace 再連續 10 秒', () => {
    const s = autoDropState()
    let r = run(s, 0, 40, 8, { paused: true })
    expect(r.drop).toBe(-1)
    r = run(s, r.t, AUTO_DROP.grace + AUTO_DROP.hold - 1, 8)
    expect(r.drop).toBe(-1)
    expect(run(s, r.t, 3, 8).drop).toBeGreaterThan(0)
  })

  it('極慢的機器（不到 1 fps，每幀隔 1.25 秒）也會降', () => {
    expect(run(autoDropState(), 0, 25, 0.8).drop).toBeGreaterThan(0)
  })

  it('分頁在背景（呼叫端告知 paused）、或兩幀之間隔了很久（除錯器、休眠）：重新開始計', () => {
    const s = autoDropState()
    let r = run(s, 0, 14, 15)
    // 背景：回來的第一幀 paused（GameScene 記下 visibilitychange），之後要重新等 grace＋10 秒
    autoDropStep(s, { now: r.t + 8, quality: 'medium', chosen: false, paused: true })
    r = run(s, r.t + 8, AUTO_DROP.grace + AUTO_DROP.hold - 1, 15)
    expect(r.drop).toBe(-1)
    expect(run(s, r.t, 3, 15).drop).toBeGreaterThan(0)
    // 沒有 paused、但 30 秒沒有任何幀：也不能把這段算進去
    const s2 = autoDropState()
    r = run(s2, 0, 14, 15)
    r = run(s2, r.t + 30, 4, 15)
    expect(r.drop).toBe(-1)
    r = run(s2, r.t, AUTO_DROP.grace + AUTO_DROP.hold - 5, 15)
    expect(r.drop).toBe(-1)
    expect(run(s2, r.t, 3, 15).drop).toBeGreaterThan(0)
  })
})
