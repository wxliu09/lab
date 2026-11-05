// 燈光池（GameScene.updatePool）：鏡頭等速橫越整站時，總光量不要常常掉到靜止時的 60% 以下（R5 第 3 輪：15 m/s 約 28–39% 的幀）。
// 不經算繪，固定 dt 直接呼叫 updatePool（同 review R5 的 pool.mjs）。
import { beforeAll, describe, expect, it, vi } from 'vitest'

// Node 沒有 canvas／DOM：最小的假 2D context（同 prebuildSteps.test.ts）、假 document 與 localStorage
type FakeCanvas = { width: number; height: number; _img?: { data: Uint8ClampedArray }; _x?: unknown; getContext(): unknown }
beforeAll(() => {
  const ctx = (c: FakeCanvas) =>
    new Proxy({ canvas: c } as Record<string | symbol, unknown>, {
      get(t, k) {
        if (k in t) return t[k]
        if (k === 'createImageData') return (w: number, h: number) => ({ width: w, height: h, data: new Uint8ClampedArray(w * h * 4) })
        if (k === 'putImageData') return (img: { data: Uint8ClampedArray }) => (c._img = { data: new Uint8ClampedArray(img.data) })
        if (k === 'getImageData') return (_x: number, _y: number, w: number, h: number) => ({ width: w, height: h, data: c._img ? new Uint8ClampedArray(c._img.data) : new Uint8ClampedArray(w * h * 4) })
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
  // client 模組在 import 時會碰 window（測試掛勾、事件）：用 globalThis 充當
  g.window ??= g
  g.addEventListener ??= () => {}
  g.removeEventListener ??= () => {}
  g.innerWidth ??= 1280
  g.innerHeight ??= 760
  const store = new Map<string, string>([['xc.prebuild', '0'], ['xc.quality', 'low']])
  g.localStorage = { getItem: (k: string) => store.get(k) ?? null, setItem: (k: string, v: string) => store.set(k, v), removeItem: (k: string) => store.delete(k) }
})


type Pool = { l: { intensity: number; isSpotLight?: boolean; position: { x: number; z: number } } }[]
type RL = { x: number; z: number; intensity: number }
type View = { lights: RL[] }
type Priv = { ensureZone(id: number): number; views: Map<number, View>; pool: Pool; updatePool(v: unknown, dt: number, t: number): void; rts: { jump(x: number, y: number): void } }

/** 鏡頭停在 (x, y) 夠久之後燈光池的總光量（最近的幾盞，spot 全強度、點光 0.7）*/
function settled(p: Priv, view: View, x: number, y: number): number {
  const nSpot = p.pool.filter((s) => s.l.isSpotLight).length
  const sorted = [...view.lights].sort((a, b) => (a.x - x) ** 2 + (-a.z - y) ** 2 - ((b.x - x) ** 2 + (-b.z - y) ** 2))
  return sorted.slice(0, p.pool.length).reduce((a, rl, i) => a + rl.intensity * (i < nSpot ? 1 : 0.7), 0)
}

async function scene(station: string) {
  vi.resetModules()
  await import('../../src/shared/content/index')
  const { GameScene } = await import('../../src/render/gameScene')
  const { ClientWorld } = await import('../../src/client/world')
  const gs = new GameScene(new ClientWorld())
  gs.setZones([[1, station, station]])
  const p = gs as unknown as Priv
  p.ensureZone(1)
  return { gs, p, view: p.views.get(1)!, layout: gs.zones.get(1)!.layout }
}

/**
 * 等速橫越（speed m/s）：darkFrac = 總光量低於起點靜止基準 60% 的幀比例（R5 的量法；燈少的區段本來就比較暗，慢速也會算進去）、
 * lossFrac = 低於「停在同一點夠久時」60% 的幀比例（只算換燈造成的變暗）
 */
function sweep(p: Priv, view: View, layout: { w: number; h: number }, speed: number): { darkFrac: number; lossFrac: number; minFrac: number } {
  const dt = 1 / 30
  let t = 1000
  p.rts.jump(layout.w * 0.3, layout.h * 0.5)
  for (let i = 0; i < 90; i++) p.updatePool(view, dt, (t += dt))
  const tot = () => p.pool.reduce((a, s) => a + s.l.intensity, 0)
  const base = tot()
  const x0 = 3
  const x1 = layout.w - 3
  const n = Math.round((x1 - x0) / speed / dt)
  let dark = 0
  let loss = 0
  let min = Infinity
  for (let k = 0; k < n; k++) {
    const x = x0 + ((x1 - x0) * k) / n
    p.rts.jump(x, layout.h * 0.5)
    p.updatePool(view, dt, (t += dt))
    const v = tot()
    if (v < base * 0.6) dark++
    const ref = settled(p, view, x, layout.h * 0.5)
    if (v < ref * 0.6) loss++
    min = Math.min(min, v / ref)
  }
  return { darkFrac: +(dark / n).toFixed(3), lossFrac: +(loss / n).toFixed(3), minFrac: +min.toFixed(2) }
}

describe('燈光池', () => {
  for (const station of ['nyx', 'tenshu']) {
    it(`${station}：鏡頭快速移動時總光量少掉到 60% 以下`, async () => {
      const { gs, p, view, layout } = await scene(station)
      const r: Record<number, ReturnType<typeof sweep>> = {}
      for (const sp of [3, 6, 15]) r[sp] = sweep(p, view, layout, sp)
      console.log('pool', station, JSON.stringify(r))
      // 改善前（換燈先熄再搬、同時換好幾盞）：nyx 15 m/s darkFrac 0.39／lossFrac 0.36、tenshu 0.35／0.10
      expect(r[15].darkFrac).toBeLessThan(0.25)
      expect(r[15].lossFrac).toBeLessThan(0.15)
      expect(r[6].lossFrac).toBeLessThan(0.1)
      gs.dispose()
    }, 300000)
  }
})
