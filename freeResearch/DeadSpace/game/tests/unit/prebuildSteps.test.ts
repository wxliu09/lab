// 分段預建：buildStationSteps＋延後產生的程序化貼圖，結果要和一次同步建完完全相同（幾何、材質、貼圖像素）
import { createHash } from 'node:crypto'
import { beforeAll, describe, expect, it, vi } from 'vitest'

// Node 沒有 canvas：最小的假 2D context（putImageData 記下像素，其餘繪圖指令不做事）
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
    createElement: () => {
      const c: FakeCanvas = { width: 0, height: 0, getContext: () => (c._x ??= ctx(c)) }
      return c
    },
  }
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

async function fresh() {
  vi.resetModules()
  await import('../../src/shared/content/index')
  const { STATION_BY_ID } = await import('../../src/shared/content/stations/index')
  const { parseLayout } = await import('../../src/shared/layout')
  const sb = await import('../../src/render/stationBuilder')
  const tex = await import('../../src/render/tex')
  return { STATION_BY_ID, parseLayout, sb, tex }
}

describe('分段預建', () => {
  it('延後產生的貼圖：先拿到空的貼圖物件，分段做完後像素與同步產生的完全相同；讀 image 時沒做完會就地做完', async () => {
    const a = await fresh()
    const ref = a.tex.rockSet('#8a7a6a', 4, 'floor')
    const refH = [ref.map, ref.roughnessMap, ref.normalMap].map((t) => texHash(t as unknown as Tex))
    const refW = texHash(a.tex.wallSet('#7a8088', '#33ccff', 6).map as unknown as Tex)

    const b = await fresh()
    const set = b.tex.deferTextures(() => b.tex.rockSet('#8a7a6a', 4, 'floor'))
    expect(b.tex.pendingTextures()).toBe(1)
    let n = 0
    for (const _ of b.tex.textureSteps()) n++
    expect(n).toBeGreaterThan(50)
    expect(b.tex.pendingTextures()).toBe(0)
    expect([set.map, set.roughnessMap, set.normalMap].map((t) => texHash(t as unknown as Tex))).toEqual(refH)
    // 安全網：three 上傳時讀 texture.image → 同步做完
    const w = b.tex.deferTextures(() => b.tex.wallSet('#7a8088', '#33ccff', 6))
    expect(b.tex.pendingTextures()).toBe(1)
    expect(texHash(w.map as unknown as Tex)).toBe(refW)
    expect(b.tex.pendingTextures()).toBe(0)
  }, 120000)

  it('分段建站（每片幾 ms）＋延後的貼圖，結果和一次同步建完相同', async () => {
    const ids = ['portage', 'cinder']
    const a = await fresh()
    const ref = ids.map((id) => {
      const def = a.STATION_BY_ID.get(id)!
      return stationHash(a.sb.buildStation(def, a.parseLayout(def.layout)) as never)
    })
    const b = await fresh()
    const got = ids.map((id) => {
      const def = b.STATION_BY_ID.get(id)!
      const it = b.sb.buildStationSteps(def, b.parseLayout(def.layout))
      let steps = 0
      for (;;) {
        const r = b.tex.deferTextures(() => it.next())
        if (r.done) {
          expect(steps).toBeGreaterThan(50)
          for (const _ of b.tex.textureSteps()) steps++
          return stationHash(r.value as never)
        }
        steps++
      }
    })
    expect(got).toEqual(ref)
  }, 300000)
})
