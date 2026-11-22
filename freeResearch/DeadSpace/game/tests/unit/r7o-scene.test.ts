// 第 7 輪（視聽與手感）GameScene：設施地面圈改成虛線＋刻度、腳下光圈依快照換形狀（玩家粗、高對比時敵對 NPC 虛線）、
// 換 zone 淡入、駕駛時自動跟隨／手動移動取消。不經算繪（同 lightPool.test.ts 的假 DOM）。
import { beforeAll, describe, expect, it, vi } from 'vitest'

type FakeCanvas = { width: number; height: number; _x?: unknown; getContext(): unknown }
beforeAll(() => {
  const ctx = (c: FakeCanvas) =>
    new Proxy({ canvas: c } as Record<string | symbol, unknown>, {
      get(t, k) {
        if (k in t) return t[k]
        if (k === 'createImageData' || k === 'getImageData') return (_a: number, _b: number, w = _a, h = _b) => ({ width: w, height: h, data: new Uint8ClampedArray(w * h * 4) })
        if (k === 'measureText') return () => ({ width: 10 })
        if (k === 'createLinearGradient' || k === 'createRadialGradient' || k === 'createPattern') return () => ({ addColorStop() {} })
        return typeof k === 'string' ? (t[k] ??= () => {}) : undefined
      },
      set(t, k, v) {
        t[k] = v
        return true
      },
    })
  const g = globalThis as Record<string, unknown>
  g.ImageData = class {
    data: Uint8ClampedArray
    constructor(
      public width: number,
      public height: number,
    ) {
      this.data = new Uint8ClampedArray(width * height * 4)
    }
  }
  g.document = {
    hidden: false,
    addEventListener() {},
    removeEventListener() {},
    createElement: () => {
      const c: FakeCanvas = { width: 0, height: 0, getContext: () => (c._x ??= ctx(c)) }
      return c
    },
  }
  g.window ??= g
  g.addEventListener ??= () => {}
  g.removeEventListener ??= () => {}
  g.innerWidth ??= 1280
  g.innerHeight ??= 760
  const store = new Map<string, string>([['xc.prebuild', '0'], ['xc.quality', 'low']])
  g.localStorage = { getItem: (k: string) => store.get(k) ?? null, setItem: (k: string, v: string) => store.set(k, v), removeItem: (k: string) => store.delete(k) }
})

async function load() {
  vi.resetModules()
  await import('../../src/shared/content/index')
  const THREE = await import('three')
  const gsm = await import('../../src/render/gameScene')
  const { world } = await import('../../src/client/session')
  const vp = await import('../../src/client/viewPrefs')
  const { EntFlag } = await import('../../src/shared/protocol/messages')
  return { THREE, gsm, world, vp, EntFlag }
}

type Priv = {
  ensureZone(id: number): number
  views: Map<number, { pois: Map<string, { children: { geometry?: unknown }[] }> }>
  styleUnits(zid: number): void
  updateFollow(): void
  switchZone(id: number): void
}

describe('dashRingGeo', () => {
  it('正面朝 +Z（同 RingGeometry，躺平後朝上）、法線 +Z、標成共用（釋放站點時不 dispose）', async () => {
    const { gsm } = await load()
    const g = gsm.dashRingGeo(0.5, 0.7, 10, 0.6, 3, 0.35)
    const p = g.getAttribute('position')
    // 10 段 × 3 格 × 2 三角形 + 4 個刻度 × 2 三角形
    expect(p.count).toBe((10 * 3 * 2 + 4 * 2) * 3)
    for (let i = 0; i < p.count; i += 3) {
      const ax = p.getX(i + 1) - p.getX(i)
      const ay = p.getY(i + 1) - p.getY(i)
      const bx = p.getX(i + 2) - p.getX(i)
      const by = p.getY(i + 2) - p.getY(i)
      expect(ax * by - ay * bx).toBeGreaterThan(0)
    }
    expect(g.getAttribute('normal').getZ(0)).toBe(1)
    expect(g.userData.shared).toBe(true)
  })
})

describe('GameScene', () => {
  it('站體裡的設施地面圈：建站時維持原樣（分段建＝同步建），第一次顯示（update）時全部換成虛線＋刻度', async () => {
    const { THREE, gsm } = await load()
    const { ClientWorld } = await import('../../src/client/world')
    const gs = new gsm.GameScene(new ClientWorld())
    gs.setZones([[1, 'nyx', 'nyx']])
    const p = gs as unknown as Priv
    const count = () => {
      let solid = 0
      let dashed = 0
      for (const root of p.views.get(1)!.pois.values())
        for (const o of root.children) {
          const g = o.geometry as InstanceType<typeof THREE.BufferGeometry> | undefined
          if (g instanceof THREE.RingGeometry && g.parameters.innerRadius === 0.95) solid++
          else if (g && g.userData.shared && !(g instanceof THREE.RingGeometry) && g.getAttribute('position')?.count === (16 * 2 * 2 + 4 * 2) * 3) dashed++
        }
      return { solid, dashed }
    }
    p.ensureZone(1)
    const built = count()
    expect(built.dashed).toBe(0)
    expect(built.solid).toBeGreaterThan(3)
    // 顯示的那一幀（GameScene.update；沒有自己的單位時看 zone 1）
    gs.update(1 / 60, 1)
    expect(gs.zone).toBe(1)
    expect(count()).toEqual({ solid: 0, dashed: built.solid })
    gs.dispose()
  }, 120000)

  it('腳下光圈：玩家粗圈；高對比時敵對 NPC 虛線、關掉高對比換回原本的環', async () => {
    const { THREE, gsm, vp, EntFlag } = await load()
    const { ClientWorld } = await import('../../src/client/world')
    const w = new ClientWorld()
    const gs = new gsm.GameScene(w)
    const base = new THREE.RingGeometry(0.48, 0.62, 36)
    const mk = (id: number, s: Record<string, unknown>) => {
      const ring = new THREE.Mesh(base)
      gs.units.views.set(id, { id, root: new THREE.Group(), ring } as never)
      w.ents.set(id, { s: { i: id, ...s }, samples: [], x: 0, y: 0, f: 0, firstSeen: 0, lastUpdate: 0 } as never)
      return ring
    }
    const player = mk(1, { o: 2, c: 2 })
    const hostile = mk(2, { o: -2, fl: EntFlag.Hostile })
    const neutral = mk(3, { o: -1 })
    const p = gs as unknown as Priv
    vp.hiContrast.value = false
    p.styleUnits(0)
    expect(player.geometry).not.toBe(base)
    expect(hostile.geometry).toBe(base)
    expect(neutral.geometry).toBe(base)
    const thick = player.geometry as InstanceType<typeof THREE.RingGeometry>
    expect(thick.parameters.outerRadius - thick.parameters.innerRadius).toBeGreaterThan(0.62 - 0.48)
    vp.hiContrast.value = true
    p.styleUnits(0)
    expect(hostile.geometry).not.toBe(base)
    expect(hostile.geometry.getAttribute('position').count).toBeGreaterThan(base.getAttribute('position').count)
    expect(neutral.geometry).toBe(base)
    vp.hiContrast.value = false
    p.styleUnits(0)
    expect(hostile.geometry).toBe(base)
    gs.dispose()
  })

  it('換 zone 淡入：剛切過去全黑，約 0.22 秒內淡掉；很慢的幀也至少要好幾幀；開局第一次不淡', async () => {
    const { gsm } = await load()
    const { ClientWorld } = await import('../../src/client/world')
    const gs = new gsm.GameScene(new ClientWorld())
    gs.setZones([
      [1, 'nyx', 'nyx'],
      [2, 'tenshu', 'tenshu'],
    ])
    const p = gs as unknown as Priv & { stepFade(dt: number): void }
    p.switchZone(1)
    expect(gs.fadeAlpha()).toBe(0)
    p.switchZone(2)
    expect(gs.fadeAlpha()).toBe(1)
    // 觸發的那一幀不推進（先畫一幀全黑）
    p.stepFade(1 / 60)
    expect(gs.fadeAlpha()).toBe(1)
    // 60 fps：約 0.22 秒淡完，中途在 0.05～0.6 之間
    let frames = 0
    let mid = -1
    while (gs.fadeAlpha() > 0 && frames < 100) {
      p.stepFade(1 / 60)
      frames++
      if (frames === 7) mid = gs.fadeAlpha()
    }
    expect(frames).toBeGreaterThanOrEqual(12)
    expect(frames).toBeLessThanOrEqual(15)
    expect(mid).toBeGreaterThan(0.05)
    expect(mid).toBeLessThan(0.6)
    // 很慢的幀（第一幀 0.5 秒）：不會一幀就淡完
    p.switchZone(1)
    p.stepFade(0.5)
    p.stepFade(0.5)
    expect(gs.fadeAlpha()).toBeGreaterThan(0.4)
    gs.dispose()
  }, 120000)

  it('開始駕駛且設定開著：自動跟隨自己的載具；離開駕駛時自動關；手動移動鏡頭關掉跟隨', async () => {
    const { gsm, world, vp } = await load()
    const gs = new gsm.GameScene(world)
    const p = gs as unknown as Priv
    vp.followMode.value = 'off'
    vp.followPilot.value = true
    world.me = { unit: 10, control: 10, alive: true }
    world.ents.set(10, { s: { i: 10, d: 'personnel', z: 1 }, samples: [], x: 5, y: 5, f: 0, firstSeen: 0, lastUpdate: 0 } as never)
    world.ents.set(20, { s: { i: 20, d: 'station.nyx', z: 0 }, samples: [], x: 12, y: -3, f: 0, firstSeen: 0, lastUpdate: 0 } as never)
    p.updateFollow()
    expect(vp.followMode.value).toBe('off')
    expect(gs.rts.follow).toBeNull()
    // 開始駕駛站點
    world.me.control = 20
    p.updateFollow()
    expect(vp.followMode.value).toBe('self')
    gs.zone = 0
    expect(gs.rts.follow?.()).toEqual({ x: 12, y: -3 })
    // 離開駕駛：自動開的跟隨關回去
    world.me.control = 10
    p.updateFollow()
    expect(vp.followMode.value).toBe('off')
    // 設定關掉時不自動跟隨
    vp.followPilot.value = false
    world.me.control = 20
    p.updateFollow()
    expect(vp.followMode.value).toBe('off')
    // 手動開的 self：方向鍵移動就關掉
    vp.followMode.value = 'self'
    p.updateFollow()
    gs.rts.key('ArrowUp', true)
    gs.rts.update(1 / 60, 1280, 720)
    gs.rts.key('ArrowUp', false)
    expect(vp.followMode.value).toBe('off')
    gs.dispose()
  })
})
