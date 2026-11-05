// 第一次進站的分段建站（GameScene loader）：不預建的裝置走進還沒建好的站時，逐片建完才切過去；
// 結果要和同步建完全相同、中途換目標不出錯、dispose 後不留工作。
import { createHash } from 'node:crypto'
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

type Tex = { image: FakeCanvas & { data?: Uint8ClampedArray } }
const texHash = (t: Tex | null | undefined): string => {
  if (!t) return '-'
  const d = t.image?._img?.data ?? t.image?.data
  return d ? createHash('sha1').update(d).digest('hex').slice(0, 12) : 'empty'
}

/** 整座站的雜湊：場景圖、幾何 attribute、材質參數與貼圖像素 */
function stationHash(v: { group: { traverse(cb: (o: never) => void): void; updateMatrixWorld(f: boolean): void }; fill: unknown }): string {
  const hs = createHash('sha1')
  v.group.updateMatrixWorld(true)
  v.group.traverse((o: Record<string, never>) => {
    const ob = o as unknown as { type: string; matrixWorld: { elements: number[] }; geometry?: { attributes: Record<string, { array: Float32Array }> }; material?: unknown }
    hs.update(ob.type + ob.matrixWorld.elements.map((x) => x.toFixed(4)).join(','))
    if (ob.geometry) for (const [k, a] of Object.entries(ob.geometry.attributes)) hs.update(k + createHash('sha1').update(new Uint8Array(a.array.buffer, a.array.byteOffset, a.array.byteLength)).digest('hex'))
    const ms = (ob.material ? (Array.isArray(ob.material) ? ob.material : [ob.material]) : []) as Record<string, unknown>[]
    for (const m of ms) {
      hs.update(String(m.type) + String(m.roughness) + String(m.metalness) + String(m.opacity))
      for (const k of ['map', 'roughnessMap', 'normalMap', 'emissiveMap']) hs.update(k + texHash(m[k] as Tex))
    }
  })
  hs.update('fill' + texHash(v.fill as Tex))
  return hs.digest('hex')
}

/** 假的引擎：記下上傳的貼圖與預編譯的次數；programs 空（不用等連結）*/
function fakeHost() {
  const uploaded: unknown[] = []
  let compiles = 0
  const listeners = new Map<string, unknown>()
  const host = {
    renderer: {
      getContext: () => ({ isContextLost: () => false }),
      domElement: { addEventListener: (k: string, f: unknown) => listeners.set(k, f), removeEventListener: (k: string) => listeners.delete(k) },
      initTexture: (t: unknown) => uploaded.push(t),
      info: { programs: [] as unknown[] },
    },
    compile: () => void compiles++,
  }
  return { host, uploaded, listeners, compiles: () => compiles }
}

async function fresh() {
  vi.resetModules()
  await import('../../src/shared/content/index')
  const { STATION_BY_ID } = await import('../../src/shared/content/stations/index')
  const { parseLayout } = await import('../../src/shared/layout')
  const sb = await import('../../src/render/stationBuilder')
  const { GameScene } = await import('../../src/render/gameScene')
  const { ClientWorld } = await import('../../src/client/world')
  return { STATION_BY_ID, parseLayout, sb, GameScene, ClientWorld }
}

type Priv = {
  ensureZone(id: number): number
  views: Map<number, { group: unknown; fill: unknown }>
  loader: unknown
  building: unknown
  pumpCh: unknown
  wantZone: number
}

/** 一直推進 ensureZone(id)（每次呼叫 = 一幀）直到切過去；回傳用了幾幀 */
function framesUntil(p: Priv, id: number, max = 5000): number {
  for (let n = 1; n <= max; n++) if (p.ensureZone(id) === id) return n
  throw new Error('loader 沒有做完')
}

describe('第一次進站的分段建站', () => {
  it('開局第一站同步建；之後第一次進站分段建完才切過去，外觀與同步建完全相同；中途換目標不出錯', async () => {
    const ids = ['cinder', 'hulk7']
    const a = await fresh()
    const ref = ids.map((id) => {
      const def = a.STATION_BY_ID.get(id)!
      return stationHash(a.sb.buildStation(def, a.parseLayout(def.layout)) as never)
    })

    const b = await fresh()
    const gs = new b.GameScene(new b.ClientWorld())
    const p = gs as unknown as Priv
    const fh = fakeHost()
    gs.setZones([
      [1, 'portage', 'portage'],
      [2, 'cinder', 'cinder'],
      [3, 'hulk7', 'hulk7'],
    ])
    gs.startPrebuild(fh.host as never)
    // 強制不預建：只記下引擎，不排預建
    expect(gs.prebuildDone).toBe(false)
    expect((gs as unknown as { prebuildHost: unknown }).prebuildHost).toBeNull()
    // 開局第一站：同步建（zone 還是 -1）
    expect(p.ensureZone(1)).toBe(1)
    expect(gs.loading.value).toBe(false)

    // 走向 cinder：第一幀還顯示原本的站、loading = true；推進幾片後換目標去 hulk7（cinder 做到一半）
    p.wantZone = 2
    expect(p.ensureZone(2)).toBe(1)
    expect(gs.loading.value).toBe(true)
    for (let i = 0; i < 3; i++) expect(p.ensureZone(2)).toBe(1)
    expect(p.views.has(2)).toBe(false)
    p.wantZone = 3
    const n3 = framesUntil(p, 3)
    expect(gs.zone).toBe(3)
    expect(gs.loading.value).toBe(false)
    expect(p.loader).toBeNull()
    // 預編譯與貼圖上傳也在分段裡做完（第一次畫這一站時不用再同步做）
    expect(fh.compiles()).toBeGreaterThan(0)
    expect(fh.uploaded.length).toBeGreaterThan(0)

    // 回 cinder：從頭（或接著做到一半的）分段建完
    p.wantZone = 2
    const n2 = framesUntil(p, 2)
    expect(gs.zone).toBe(2)
    // 確實分成很多片（一片最多 LOAD_SLICE_MS），不是一次做完
    expect(n2 + n3).toBeGreaterThan(2)

    // 已經建好的站：立刻切換
    expect(p.ensureZone(3)).toBe(3)
    expect(p.ensureZone(1)).toBe(1)

    expect([stationHash(p.views.get(2) as never), stationHash(p.views.get(3) as never)]).toEqual(ref)
    gs.dispose()
  }, 300000)

  it('換回原本的站就暫停；片與片之間不等下一幀也會接著做；駕駛中靠近某站先預建；dispose 後清乾淨', async () => {
    const b = await fresh()
    const gs = new b.GameScene(new b.ClientWorld())
    const p = gs as unknown as Priv
    const fh = fakeHost()
    gs.setZones([
      [1, 'portage', 'portage'],
      [2, 'cinder', 'cinder'],
    ])
    gs.startPrebuild(fh.host as never)
    p.ensureZone(1)
    p.wantZone = 2
    expect(p.ensureZone(2)).toBe(1)
    expect(gs.loading.value).toBe(true)
    // 監視器畫面關掉之類：目標換回顯示中的站
    p.wantZone = 1
    expect(p.ensureZone(1)).toBe(1)
    expect(gs.loading.value).toBe(false)
    expect(p.loader).toBeNull()
    // 再去 cinder：只推一幀，其餘由 MessageChannel 在幀與幀之間接著做
    p.wantZone = 2
    expect(p.ensureZone(2)).toBe(1)
    for (let i = 0; i < 2000 && gs.loading.value; i++) await new Promise((r) => setTimeout(r, 5))
    expect(gs.loading.value).toBe(false)
    expect(p.views.has(2)).toBe(true)
    expect(p.ensureZone(2)).toBe(2)

    // 預測下一站：駕駛中的船在太空中靠近 hulk7 → 用空閒時間先建（不顯示載入中）；真的要去時轉成前景接著做
    gs.setZones([[3, 'hulk7', 'hulk7'], [4, 'tenshu', 'tenshu']])
    const w = gs.world
    const put = (i: number, d: string, x: number, y: number) => w.ents.set(i, { s: { i, d, z: 0, x: x * 100, y: y * 100 }, x, y } as never)
    put(100, 'ship.kestrel', 0, 0)
    put(101, 'station.hulk7', 5, 1)
    put(102, 'station.tenshu', 30, 0)
    w.me.control = 100
    const look = gs as unknown as { lookahead(z: number): void; loader: { id: number; bg: boolean } | null }
    look.lookahead(2)
    expect(look.loader).toBeNull()
    look.lookahead(0)
    expect(look.loader).toMatchObject({ id: 3, bg: true })
    expect(gs.loading.value).toBe(false)
    for (let i = 0; i < 4000 && look.loader; i++) await new Promise((r) => setTimeout(r, 5))
    expect(look.loader).toBeNull()
    expect(p.views.has(3)).toBe(true)
    expect(p.views.has(4)).toBe(false)
    // 已經建好：立刻切過去，不再預測同一站
    expect(p.ensureZone(3)).toBe(3)
    look.lookahead(0)
    expect(look.loader).toBeNull()
    // 預先建到一半就真的要去：轉成前景（載入中），做完才切
    put(102, 'station.tenshu', 3, 0)
    look.lookahead(0)
    expect(look.loader).toMatchObject({ id: 4, bg: true })
    p.wantZone = 4
    expect(p.ensureZone(4)).toBe(3)
    expect(look.loader).toMatchObject({ id: 4, bg: false })
    expect(gs.loading.value).toBe(true)
    framesUntil(p, 4)
    expect(gs.loading.value).toBe(false)

    // 做到一半的時候 dispose：loader、building、MessageChannel、context 恢復的 listener 都清掉
    gs.setZones([[5, 'adjudicatrix', 'adjudicatrix']])
    p.wantZone = 5
    p.ensureZone(5)
    expect(gs.loading.value).toBe(true)
    expect(p.building).not.toBeNull()
    gs.dispose()
    expect(gs.loading.value).toBe(false)
    expect(p.loader).toBeNull()
    expect(p.building).toBeNull()
    expect(p.pumpCh).toBeNull()
    expect(p.views.size).toBe(0)
    expect(fh.listeners.size).toBe(0)
    // dispose 之後再推進也不會動
    expect(() => p.ensureZone(5)).not.toThrow()
    expect(p.views.size).toBe(0)
  }, 300000)
})
