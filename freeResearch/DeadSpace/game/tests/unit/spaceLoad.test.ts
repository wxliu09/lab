// 第一次進太空層的分段載入（GameScene loader，zone 0）：不預建的裝置第一次進太空時，星空、各船殼的代表模型、延後的貼圖、
// 上傳、預編譯逐片做完才切過去（期間 loading = true、不畫 3D）；做過一次之後再進太空立刻切；出現新的站要重新預熱一次。
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
  const store = new Map<string, string>([['xc.prebuild', '0']])
  g.localStorage = { getItem: (k: string) => store.get(k) ?? null, setItem: (k: string, v: string) => store.set(k, v), removeItem: (k: string) => store.delete(k) }
})


/** 假的引擎：記下上傳的貼圖與預編譯的次數；programs 空（不用等連結）*/
function fakeHost() {
  const uploaded: unknown[] = []
  let compiles = 0
  const host = {
    renderer: {
      getContext: () => ({ isContextLost: () => false }),
      domElement: { addEventListener() {}, removeEventListener() {} },
      initTexture: (t: unknown) => uploaded.push(t),
      info: { programs: [] as unknown[] },
    },
    compile: () => void compiles++,
  }
  return { host, uploaded, compiles: () => compiles }
}

type Priv = {
  ensureZone(id: number): number
  loader: { id: number; bg: boolean } | null
  wantZone: number
  spaceWarm: boolean
  space: { group: { visible: boolean } } | null
}

describe('第一次進太空層的分段載入', () => {
  it('第一次進太空：分段做完才切過去；之後立刻切；局中出現新的站要再預熱一次', async () => {
    vi.resetModules()
    await import('../../src/shared/content/index')
    const { GameScene } = await import('../../src/render/gameScene')
    const { ClientWorld } = await import('../../src/client/world')
    const gs = new GameScene(new ClientWorld())
    const p = gs as unknown as Priv
    const fh = fakeHost()
    gs.setZones([
      [1, 'cinder', 'cinder'],
      [2, 'hulk7', 'hulk7'],
    ])
    gs.startPrebuild(fh.host as never)
    expect(p.ensureZone(1)).toBe(1)
    // 太空裡的單位（各站船殼、船艦）：分段載入時一個一片先建好
    const w = gs.world
    const put = (i: number, d: string, x: number, y: number) => w.ents.set(i, { s: { i, d, z: 0, x: x * 100, y: y * 100 }, x, y, f: 0 } as never)
    put(201, 'station.hulk7', 5, 1)
    put(202, 'station.cinder', -8, 3)
    put(203, 'ship.kestrel', 0, 0)
    // 走向太空：這一幀還顯示原本的站、loading = true
    p.wantZone = 0
    expect(p.ensureZone(0)).toBe(1)
    expect(gs.loading.value).toBe(true)
    expect(p.loader).toMatchObject({ id: 0, bg: false })
    // 中途回頭（例如監視器畫面關掉）：分段載入停掉、不切換
    expect(p.ensureZone(1)).toBe(1)
    expect(gs.loading.value).toBe(false)
    expect(p.loader).toBeNull()
    // 再去：從頭分段做完才切
    let n = 1
    for (; n < 5000 && p.ensureZone(0) !== 0; n++);
    expect(gs.zone).toBe(0)
    // 確實分成好幾片（星空、每個單位一片、貼圖、上傳…）
    expect(n).toBeGreaterThan(2)
    expect(gs.loading.value).toBe(false)
    expect(p.loader).toBeNull()
    expect(p.spaceWarm).toBe(true)
    expect(p.space?.group.visible).toBe(true)
    expect(fh.compiles()).toBeGreaterThan(0)
    // 切過去那一幀：單位層直接拿預先建好的視圖
    const pending = (gs.units as unknown as { pending: Map<number, { v: { root: unknown } }> }).pending
    expect([...pending.keys()].sort()).toEqual([201, 202, 203])
    const roots = [201, 202, 203].map((i) => pending.get(i)!.v.root)
    gs.units.sync(w.ents.values(), 0, () => false, 0.016, 1)
    expect([201, 202, 203].map((i) => gs.units.views.get(i)?.root)).toEqual(roots)
    expect(pending.size).toBe(0)
    // 回站裡再出來：已經預熱過，立刻切
    expect(p.ensureZone(1)).toBe(1)
    expect(p.ensureZone(0)).toBe(0)
    // 局中出現新的站：下一次進太空再預熱一次（東西都準備過了，很快做完）才切
    expect(p.ensureZone(1)).toBe(1)
    gs.setZones([[3, 'portage', 'portage']])
    expect(p.spaceWarm).toBe(false)
    for (n = 1; n < 5000 && p.ensureZone(0) !== 0; n++);
    expect(gs.zone).toBe(0)
    expect(p.spaceWarm).toBe(true)
    gs.dispose()
  }, 300000)
})
