// 第 7 輪（視聽與手感）世界疊加層：區域物件不畫血條、血條的白色殘影、Shift 佇列的路徑點、單位邊光材質
import { describe, expect, it, vi } from 'vitest'
import '../../src/shared/content/index'

vi.mock('../../src/client/session', async () => {
  const { signal } = await import('@preact/signals')
  const { ClientWorld } = await import('../../src/client/world')
  return { world: new ClientWorld(), snapTick: signal(0), sendCmd: () => {}, cmdTaps: [], hostGone: signal(false) }
})

const { GHOST_HOLD, ghostStep, hpBarVisible } = await import('../../src/render/overlay')
const { WaypointQueue } = await import('../../src/render/moveTargets')
const { UNITS } = await import('../../src/shared/content/registry')
const { Mat, isSharedMaterial, unitRimMat, withFog } = await import('../../src/render/materials')
const THREE = await import('three')
const { CAM7_EN, CAM7_ZH } = await import('../../src/ui/strings/cam7')

describe('血條', () => {
  it('自己放的燃燒地板（區域物件）頭上不畫血條；自己的人、受傷的、選取的照畫', () => {
    const fire = UNITS.get('rig.fireField')
    expect(fire).toBeDefined()
    expect(hpBarVisible(1, 1, false, true, fire)).toBe(false)
    expect(hpBarVisible(1, 1, true, true, fire)).toBe(false)
    const crew = UNITS.get('personnel')
    expect(crew).toBeDefined()
    expect(hpBarVisible(100, 100, false, true, crew)).toBe(true)
    expect(hpBarVisible(50, 100, false, false, crew)).toBe(true)
    expect(hpBarVisible(100, 100, true, false, crew)).toBe(true)
    expect(hpBarVisible(100, 100, false, false, crew)).toBe(false)
  })

  it('殘影：掉血後停 0.4 秒，之後縮到目前血量；補血時直接跟上', () => {
    const s = { g: 1, k: 1, at: -1e9 }
    const dt = 1 / 60
    let t = 10
    expect(ghostStep(s, 1, t, dt)).toBe(1)
    // 挨了一下：1 → 0.6
    t += dt
    expect(ghostStep(s, 0.6, t, dt)).toBe(1)
    // 停留期間不動
    for (; t < 10 + GHOST_HOLD - 0.02; t += dt) expect(ghostStep(s, 0.6, t, dt)).toBe(1)
    // 停留結束後開始縮、單調遞減、最後到 0.6
    let prev = 1
    let done = -1
    for (let i = 0; i < 120; i++) {
      t += dt
      const g = ghostStep(s, 0.6, t, dt)
      expect(g).toBeLessThanOrEqual(prev)
      expect(g).toBeGreaterThanOrEqual(0.6)
      prev = g
      if (g === 0.6 && done < 0) done = i
    }
    expect(done).toBeGreaterThan(0)
    // 約 1 秒內縮完（不拖太久）
    expect(done * dt).toBeLessThan(1.2)
    // 補血：殘影直接跟上
    t += dt
    expect(ghostStep(s, 0.9, t, dt)).toBe(0.9)
  })

  it('殘影：連續挨打時停在第一下之前的血量，停手 0.4 秒後才縮', () => {
    const s = { g: 1, k: 1, at: -1e9 }
    const dt = 1 / 60
    let t = 0
    let k = 1
    for (let i = 0; i < 6; i++) {
      k -= 0.1
      t += 0.25
      expect(ghostStep(s, k, t, dt)).toBe(1)
    }
    t += GHOST_HOLD + 0.05
    expect(ghostStep(s, k, t, dt)).toBeLessThan(1)
  })
})

describe('Shift 佇列的路徑點（WaypointQueue）', () => {
  const pos = (e: number) => (e === 7 ? { x: 20, y: 20 } : null)

  it('一般移動不畫；Shift 排隊才畫，到點就拿掉', () => {
    const q = new WaypointQueue()
    q.onCmd({ k: 'move', x: 5, y: 0 }, 1, 0)
    expect(q.visible()).toBe(false)
    q.onCmd({ k: 'move', x: 5, y: 5, q: true }, 1, 0.1)
    q.onCmd({ k: 'amove', x: 0, y: 5, q: true }, 1, 0.2)
    expect(q.visible()).toBe(true)
    expect(q.pts.map((p) => p.kind)).toEqual(['move', 'move', 'amove'])
    q.update(1, 0, 0, false, 0.3, pos)
    expect(q.pts.length).toBe(3)
    q.update(1, 4.6, 0.1, false, 1, pos)
    expect(q.pts.length).toBe(2)
    q.update(1, 5, 5, false, 2, pos)
    q.update(1, 0.2, 5, false, 3, pos)
    expect(q.pts.length).toBe(0)
    expect(q.visible()).toBe(false)
  })

  it('低 fps 一幀走過頭（沒進到點半徑）：走近又遠離也算到', () => {
    const q = new WaypointQueue()
    q.onCmd({ k: 'move', x: 3, y: 0 }, 1, 0)
    q.onCmd({ k: 'move', x: 3, y: 3, q: true }, 1, 0)
    q.update(1, 0, 0, false, 0.1, pos)
    q.update(1, 1.9, 0, false, 0.5, pos)
    expect(q.pts.length).toBe(2)
    // 下一幀已經轉往第二個點：離第一個點 1.4 m（> 0.7），但比剛才遠
    q.update(1, 3.2, 1.4, false, 0.9, pos)
    expect(q.pts.length).toBe(1)
    expect(q.pts[0]).toMatchObject({ x: 3, y: 3 })
  })

  it('不按 Shift 的新指令換掉整條；停止、原地、換操控對象清空', () => {
    const q = new WaypointQueue()
    q.onCmd({ k: 'move', x: 5, y: 0 }, 1, 0)
    q.onCmd({ k: 'move', x: 9, y: 0, q: true }, 1, 0)
    q.onCmd({ k: 'move', x: 1, y: 1 }, 1, 0.5)
    expect(q.pts.length).toBe(1)
    expect(q.visible()).toBe(false)
    q.onCmd({ k: 'move', x: 2, y: 2, q: true }, 1, 0.6)
    expect(q.visible()).toBe(true)
    q.onCmd({ k: 'stop' }, 1, 0.7)
    expect(q.pts.length).toBe(0)
    q.onCmd({ k: 'move', x: 5, y: 0 }, 1, 1)
    q.onCmd({ k: 'move', x: 9, y: 0, q: true }, 1, 1)
    q.onCmd({ k: 'move', x: 3, y: 0, q: true }, 2, 1.1)
    expect(q.unit).toBe(2)
    expect(q.pts.length).toBe(1)
  })

  it('實體目標跟著實體；看不到了就拿掉；單位停下超過寬限就清空；對自己放的施法不影響', () => {
    const q = new WaypointQueue()
    q.onCmd({ k: 'move', x: 5, y: 0 }, 1, 0)
    q.onCmd({ k: 'follow', e: 7, q: true }, 1, 0)
    q.onCmd({ k: 'interact', e: 8, q: true }, 1, 0)
    q.onCmd({ k: 'cast', q: true }, 1, 0)
    expect(q.pts.map((p) => p.e)).toEqual([0, 7, 8])
    q.update(1, 5, 0, false, 0.2, pos)
    expect(q.pts.map((p) => p.e)).toEqual([7, 8])
    q.update(1, 19.5, 19.5, false, 0.4, pos)
    // 7 到了、8 看不到：都拿掉
    expect(q.pts.length).toBe(0)
    q.onCmd({ k: 'move', x: 5, y: 0 }, 1, 1)
    q.onCmd({ k: 'move', x: 9, y: 0, q: true }, 1, 1)
    q.update(1, 0, 0, true, 1.5, pos)
    expect(q.pts.length).toBe(2)
    q.update(1, 0, 0, true, 2, pos)
    expect(q.pts.length).toBe(0)
  })
})

describe('單位邊光（materials.ts unitRimMat）', () => {
  const fakeShader = () => ({
    uniforms: {} as Record<string, { value: unknown }>,
    vertexShader: '#include <common>\n#include <project_vertex>',
    fragmentShader: '#include <common>\n#include <emissivemap_fragment>\n#include <opaque_fragment>',
  })

  it('材質庫的共用材質換成邊光複本：共用 program（同一個 cache key）、uXcRim 不是 0、不會被釋放', () => {
    const m = Mat.emissive('#ff4a4a', 1.4)
    const v = unitRimMat(m)
    expect(v).not.toBe(m)
    expect(unitRimMat(m)).toBe(v)
    expect(unitRimMat(v)).toBe(v)
    expect(v.customProgramCacheKey()).toBe(m.customProgramCacheKey())
    expect(isSharedMaterial(v)).toBe(true)
    const a = fakeShader()
    m.onBeforeCompile(a as never, null as never)
    const b = fakeShader()
    v.onBeforeCompile(b as never, null as never)
    // shader 原始碼完全一樣（只差 uniform 的值）
    expect(b.fragmentShader).toBe(a.fragmentShader)
    expect(a.fragmentShader).toContain('uXcRim')
    expect((a.uniforms.uXcRim.value as InstanceType<typeof THREE.Color>).r).toBe(0)
    expect((b.uniforms.uXcRim.value as InstanceType<typeof THREE.Color>).r).toBeGreaterThan(0)
  })

  it('模型自己複製來做動畫的材質、MeshBasic（選取圈、光暈）原樣不動', () => {
    const live = withFog(Mat.emissive('#ffb000', 2.6).clone())
    expect(unitRimMat(live)).toBe(live)
    const basic = new THREE.MeshBasicMaterial()
    expect(unitRimMat(basic)).toBe(basic)
  })
})

describe('cam7 字串', () => {
  it('中英文 key 一致、英文沒有直的撇號', () => {
    expect(Object.keys(CAM7_EN).sort()).toEqual(Object.keys(CAM7_ZH).sort())
    for (const v of Object.values(CAM7_EN)) expect(v).not.toContain("'")
  })
})
