// 第 7 輪場景佈置（dressing.ts、outdoor.ts、主砲模型、地板編號）：
// - 可走的地面上只有貼地的東西（≤ 0.15 m）；高的東西貼牆（離牆面 ≤ 0.37 m）或在頭頂（≥ 2.0 m）；
// - 同樣的輸入產生同樣的佈置（分段建站與同步建站一致）、不同站的同類房間長得不一樣；
// - low 只多幾個材質（draw call）、high 比 low 多；
// - 主砲砲管的 UV 以公尺計（不沿長度拉伸），整座主砲在版面佔住的格子裡；
// - 地板貼圖不再每 2 m 印一次「31」；草叢避開門與設施。
// 整站 draw call 預算檢查較慢，預設略過：R7D_FULL=1 npx vitest run tests/unit/r7d-dressing.test.ts
import { beforeAll, describe, expect, it } from 'vitest'
import * as THREE from 'three'

type FakeCanvas = { width: number; height: number; _img?: { data: Uint8ClampedArray }; _x?: unknown; _text?: string[]; getContext(): unknown }
const canvases: FakeCanvas[] = []
beforeAll(() => {
  const ctx = (c: FakeCanvas) =>
    new Proxy({ canvas: c } as Record<string | symbol, unknown>, {
      get(t, k) {
        if (k in t) return t[k]
        if (k === 'createImageData') return (w: number, h: number) => ({ width: w, height: h, data: new Uint8ClampedArray(w * h * 4) })
        if (k === 'putImageData') return (img: { data: Uint8ClampedArray }) => (c._img = { data: new Uint8ClampedArray(img.data) })
        if (k === 'getImageData') return (_x: number, _y: number, w: number, h: number) => ({ width: w, height: h, data: new Uint8ClampedArray(w * h * 4) })
        if (k === 'measureText') return () => ({ width: 10 })
        if (k === 'fillText') return (s: string) => (c._text ??= []).push(String(s))
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
      canvases.push(c)
      return c
    },
  }
})

async function mods() {
  await import('../../src/shared/content/index')
  const { STATION_BY_ID } = await import('../../src/shared/content/stations/index')
  const layout = await import('../../src/shared/layout')
  const dressing = await import('../../src/render/dressing')
  const batch = await import('../../src/render/batch')
  const themes = await import('../../src/render/themes')
  const chamfer = await import('../../src/render/chamfer')
  const sb = await import('../../src/render/stationBuilder')
  const quality = await import('../../src/render/quality')
  const props = await import('../../src/render/props')
  const tex = await import('../../src/render/tex')
  const steps = await import('../../src/render/steps')
  return { STATION_BY_ID, layout, dressing, batch, themes, chamfer, sb, quality, props, tex, steps }
}

type M = Awaited<ReturnType<typeof mods>>

/** 只跑佈置：回傳加進 group 的 mesh（牆邊雜物從獨立的 Batcher 合併出來）*/
function dress(m: M, id: string, tier: 0 | 1 | 2 | 3) {
  const def = m.STATION_BY_ID.get(id)!
  const l = m.layout.parseLayout(def.layout)
  const th = m.themes.theme(def.theme)
  const cellAt = (c: number, r: number) => (c < 0 || r < 0 || c >= l.w || r >= l.h ? 0 : l.cells[r * l.w + c])
  const ch = def.outdoor ? { cuts: new Map() } : m.chamfer.findChamfers(l, cellAt as never)
  const labels = new Map<number, { x: number; y: number }>()
  for (const r of l.rooms) if (r.cells > 30 && r.spec.type !== 'corridor') labels.set(r.index, m.sb.labelSpot(l, r))
  const group = new THREE.Group()
  const props = new m.batch.Batcher()
  let seed = 7
  for (let i = 0; i < id.length; i++) seed = (Math.imul(seed, 31) + id.charCodeAt(i)) | 0
  m.steps.runSteps(m.dressing.dressStationSteps({ seed: seed & 0xffff, l, th, group, props, anim: [], cellAt: cellAt as never, cut: (i: number) => ch.cuts.has(i), labels, outdoor: !!def.outdoor, tier }))
  props.build(group)
  return { l, group }
}

function verts(group: THREE.Object3D): THREE.Vector3[] {
  const out: THREE.Vector3[] = []
  group.updateMatrixWorld(true)
  group.traverse((o) => {
    const mesh = o as THREE.Mesh
    if (!mesh.isMesh) return
    const p = mesh.geometry.attributes.position
    for (let i = 0; i < p.count; i++) out.push(new THREE.Vector3().fromBufferAttribute(p, i).applyMatrix4(mesh.matrixWorld))
  })
  return out
}

const hash = (vs: THREE.Vector3[]) => {
  let h = 0
  for (const v of vs) h = (Math.imul(h, 31) + Math.round(v.x * 1000) * 7 + Math.round(v.y * 1000) * 13 + Math.round(v.z * 1000)) | 0
  return h
}

describe('r7 場景佈置', () => {
  it('可走的地面上只有貼地的東西；高的東西都貼著牆或在頭頂；不壓到門', async () => {
    const m = await mods()
    for (const id of ['nyx', 'tenshu', 'cinder', 'vivarium']) {
      const { l, group } = dress(m, id, 3)
      const vs = verts(group)
      expect(vs.length, id).toBeGreaterThan(1000)
      const solid = (c: number, r: number) => {
        if (c < 0 || r < 0 || c >= l.w || r >= l.h) return true
        const k = l.cells[r * l.w + c]
        // 牆、虛空、窗、道具格、設施格：sim 都擋移動
        return k === 0 || k === 2 || k === 3 || k === 4 || k === 7
      }
      let bad = 0
      const ex: string[] = []
      for (const v of vs) {
        if (v.y <= 0.15 || v.y >= 2.0) continue
        const x = v.x
        const y = -v.z
        const c = Math.floor(x)
        const r = l.h - 1 - Math.floor(y)
        if (solid(c, r)) continue
        // 這一格裡、離最近的擋移動格的距離
        let d = 9
        for (let dr = -1; dr <= 1; dr++)
          for (let dc = -1; dc <= 1; dc++) {
            if (!solid(c + dc, r + dr)) continue
            const nx = Math.max(c + dc, Math.min(x, c + dc + 1))
            const ny = Math.max(l.h - 1 - (r + dr), Math.min(y, l.h - (r + dr)))
            d = Math.min(d, Math.hypot(x - nx, y - ny))
          }
        if (d > 0.37) {
          bad++
          if (ex.length < 5) ex.push(`${x.toFixed(2)},${y.toFixed(2)} h=${v.y.toFixed(2)} d=${d.toFixed(2)}`)
        }
        // 門口格（門板、門框）上不放高的東西
        if (l.cells[r * l.w + c] === 5) bad++
      }
      expect(bad, `${id}: ${ex.join(' | ')}`).toBe(0)
    }
  }, 300000)

  it('同樣的輸入同樣的結果；不同站的同類房間不一樣', async () => {
    const m = await mods()
    const a = hash(verts(dress(m, 'nyx', 2).group))
    const b = hash(verts(dress(m, 'nyx', 2).group))
    expect(a).toBe(b)
    // 宿舍：女帝號與豪勇號都有，佈置要不同（種子含站點與房間）
    expect(hash(verts(dress(m, 'bravado', 2).group))).not.toBe(a)
  }, 300000)

  it('low 只多幾個材質；high 比 low 多細節；high 才有光柱', async () => {
    const m = await mods()
    const mats = (g: THREE.Object3D) => {
      const s = new Set<string>()
      g.traverse((o) => {
        const mm = (o as THREE.Mesh).material as THREE.Material | undefined
        if (mm) s.add(mm.uuid)
      })
      return s
    }
    const low = dress(m, 'nyx', 0)
    const high = dress(m, 'nyx', 2)
    // 新材質（不和站內道具共用的）：low 收斂成少數幾種
    expect(mats(low.group).size).toBeLessThanOrEqual(12)
    expect(verts(high.group).length).toBeGreaterThan(verts(low.group).length * 1.4)
    const spots = [{ x: 5, z: -5, color: new THREE.Color('#fff'), r: 2 }]
    const g1 = new THREE.Group()
    m.dressing.dressLights(g1, spots, 1, 1, 1500)
    const g2 = new THREE.Group()
    m.dressing.dressLights(g2, spots, 2, 1, 3000)
    const g0 = new THREE.Group()
    m.dressing.dressLights(g0, spots, 0, 1, 500)
    expect(g0.children.length).toBe(0)
    expect(g1.children.some((o) => (o as THREE.Mesh).isMesh)).toBe(false)
    expect(g2.children.some((o) => (o as THREE.Mesh).isMesh)).toBe(true)
  }, 300000)

  // 整站建四座 × 兩種畫質很慢（假 canvas 也要算程序化貼圖）：預設不跑，R7D_FULL=1 才跑
  it.skipIf(!process.env.R7D_FULL)('整站建得起來（各畫質）；mesh 數不超過美術聖經的 draw call 預算', async () => {
    const m = await mods()
    for (const q of ['low', 'high'] as const) {
      m.quality.quality.value = q
      for (const id of ['nyx', 'tenshu', 'verdance', 'cinder']) {
        const def = m.STATION_BY_ID.get(id)!
        const v = m.sb.buildStation(def, m.layout.parseLayout(def.layout))
        let n = 0
        v.group.traverse((o) => void (((o as THREE.Mesh).isMesh || (o as THREE.Points).isPoints) && n++))
        expect(n, `${id} ${q}`).toBeLessThan(300)
        v.dispose()
      }
    }
    m.quality.quality.value = 'medium'
  }, 300000)

  it('主砲：砲管 UV 以公尺計（不拉伸）、零件都在 cannonBody 佔住的格子裡', async () => {
    const m = await mods()
    const L = 32.6
    const model = m.props.poiModel('cannonBreech', String(L), 1)
    let maxV = 0
    let heat = 0
    model.root.updateMatrixWorld(true)
    model.root.traverse((o) => {
      const mesh = o as THREE.Mesh
      if (!mesh.isMesh) return
      const mat = mesh.material as THREE.MeshStandardMaterial
      if (mat.vertexColors && mesh.geometry.attributes.color) {
        heat++
        const uv = mesh.geometry.attributes.uv
        for (let i = 0; i < uv.count; i++) maxV = Math.max(maxV, uv.getY(i))
      }
    })
    expect(heat).toBeGreaterThanOrEqual(4)
    // 每節 6–10 m：v 以公尺 × 0.5 計，至少 3（以前整根 0..1）
    expect(maxV).toBeGreaterThan(3)
    let out = 0
    for (const v of verts(model.root)) {
      // 砲尾格（z −1.5..1.5）兩側 2.5 m；砲管兩側 1.5 m；最長到砲口
      const lim = v.z < 1.55 ? 2.5 : 1.5
      if (Math.abs(v.x) > lim + 0.02 || v.z < -1.75 || v.z > 1.5 + L + 0.05) out++
    }
    expect(out).toBe(0)
  })

  it('地板貼圖不再印固定的油漆編號（改成稀疏的貼花）', async () => {
    const m = await mods()
    const before = canvases.length
    m.tex.floorSet('plate', '#4a535c', 3)
    m.tex.floorSet('tile', '#8494a0', 3)
    const texts = canvases.slice(before).flatMap((c) => c._text ?? [])
    expect(texts).toEqual([])
  })

  it('翠原星的草：草叢避開門與設施；low 比 high 稀疏', async () => {
    const m = await mods()
    const outdoor = await import('../../src/render/outdoor')
    const def = m.STATION_BY_ID.get('verdance')!
    const l = m.layout.parseLayout(def.layout)
    const th = m.themes.theme(def.theme)
    const roomType = (c: number, r: number) => {
      const ri = l.roomOf[r * l.w + c]
      return ri >= 0 ? l.rooms[ri].spec.type : 'corridor'
    }
    const variantAt = (c: number, r: number) => (th.floor[roomType(c, r)] ?? th.defaultFloor).variant
    const avoid = outdoor.grassAvoidMask(l, [])
    const count = (tier: 0 | 2) => {
      const g = new THREE.Group()
      outdoor.buildGrass(g, l, th, variantAt, (c, r) => avoid[r * l.w + c] === 1, tier, 99)
      let n = 0
      const bad: string[] = []
      const mat = new THREE.Matrix4()
      const p = new THREE.Vector3()
      for (const o of g.children) {
        const im = o as THREE.InstancedMesh
        n += im.count
        for (let i = 0; i < im.count; i++) {
          im.getMatrixAt(i, mat)
          p.setFromMatrixPosition(mat)
          const c = Math.floor(p.x)
          const r = l.h - 1 - Math.floor(-p.z)
          for (const d of l.doors) for (const [dc, dr] of d.cells) if (Math.abs(dc - c) <= 1 && Math.abs(dr - r) <= 1) bad.push(`door ${c},${r}`)
          for (const poi of l.pois) if (poi.def.solid !== false && Math.abs(poi.col - c) <= 1 && Math.abs(poi.row - r) <= 1) bad.push(`poi ${c},${r}`)
          if (l.cells[r * l.w + c] !== 1) bad.push(`cell ${c},${r}`)
        }
      }
      return { n, bad }
    }
    const lo = count(0)
    const hi = count(2)
    expect(lo.bad).toEqual([])
    expect(hi.bad).toEqual([])
    expect(lo.n).toBeGreaterThan(300)
    expect(hi.n).toBeGreaterThan(lo.n * 3)
  })
})
