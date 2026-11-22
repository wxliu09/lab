// 站體合併 draw call（batch.ts mergeStatic、stationBuilder 的門與貼地零件）：
// 設施模型合併後外形不變、動畫會動到的零件沒有被併掉；門板／燈改成 InstancedMesh 後位置與燈色照舊。
import { beforeAll, describe, expect, it } from 'vitest'
import * as THREE from 'three'

// Node 沒有 canvas：最小的假 2D context（同 prebuildSteps.test.ts）
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

async function mods() {
  await import('../../src/shared/content/index')
  const { STATION_BY_ID } = await import('../../src/shared/content/stations/index')
  const { parseLayout } = await import('../../src/shared/layout')
  const props = await import('../../src/render/props')
  const batch = await import('../../src/render/batch')
  const sb = await import('../../src/render/stationBuilder')
  return { STATION_BY_ID, parseLayout, props, batch, sb }
}

/** 物件的 local 狀態（位置、旋轉、縮放、顯示） */
const pose = (o: THREE.Object3D) => [...o.position.toArray(), ...o.quaternion.toArray(), ...o.scale.toArray(), o.visible ? 1 : 0].map((x) => x.toFixed(5)).join(',')

/** root 底下所有畫得出來的三角形數（世界座標的包圍盒順便算） */
function shape(root: THREE.Object3D): { tris: number; box: number[] } {
  root.updateMatrixWorld(true)
  let tris = 0
  const bb = new THREE.Box3()
  root.traverse((o) => {
    const m = o as THREE.Mesh
    if (!m.isMesh || !m.visible) return
    const g = m.geometry
    tris += (g.index ? g.index.count : g.attributes.position.count) / 3
    bb.union(new THREE.Box3().setFromObject(m, true))
  })
  return { tris, box: [...bb.min.toArray(), ...bb.max.toArray()] }
}

describe('站體合併', () => {
  it('設施模型：同材質的靜態零件合併後外形與三角形數不變；動畫跑 400 個時間點，被併掉的零件都沒被動到', async () => {
    const { STATION_BY_ID, parseLayout, props, batch } = await mods()
    const kinds = new Map<string, [string, string | undefined]>()
    for (const st of STATION_BY_ID.values()) for (const p of parseLayout(st.layout).pois) kinds.set(`${p.def.kind}:${p.def.ref ?? ''}`, [p.def.kind, p.def.ref])
    for (const ref of ['radar', 'gravity', 'lq', 'medical', 'suitA', 'fusion']) kinds.set(`vendor:${ref}`, ['vendor', ref])
    kinds.set('pad:', ['pad', undefined])
    kinds.set('consoleBroken:', ['consoleBroken', undefined])
    expect(kinds.size).toBeGreaterThan(30)
    let before = 0
    let after = 0
    for (const [key, [kind, ref]] of kinds) {
      const ref0 = props.poiModel(kind, ref, 7)
      const m = props.poiModel(kind, ref, 7)
      const n0 = (() => {
        let n = 0
        m.root.traverse((o) => void ((o as THREE.Mesh).isMesh && n++))
        return n
      })()
      const removed = batch.mergeStatic(m.root, new Set(m.anim.map((a) => a.obj)))
      let n1 = 0
      m.root.traverse((o) => void ((o as THREE.Mesh).isMesh && n1++))
      before += n0
      after += n1
      const [a, b] = [shape(m.root), shape(ref0.root)]
      expect(a.tris, key).toBe(b.tris)
      // 合併後的幾何是 Float32（原本的包圍盒以 float64 算），差在 1 mm 以內
      if (b.tris) expect(Math.max(...a.box.map((x, i) => Math.abs(x - b.box[i]))), key).toBeLessThan(1e-3)
      const was = removed.map(pose)
      for (let i = 0; i < 400; i++) for (const a of m.anim) a.update(i * 0.137 + 0.01, 0.016)
      expect(removed.map(pose), `${key}：動畫改到了被併掉的零件（動畫閉包用到的零件要用 keep() 標記）`).toEqual(was)
      for (const r of removed) expect(r.parent).toBeNull()
    }
    // 合併有效：整體零件數少四成以上
    expect(after).toBeLessThan(before * 0.6)
  }, 120000)

  it('門：門框與斜紋併進站體，門板、黃色條、門頂燈是 InstancedMesh；開關門時位置、燈色和以前每扇門一組 Mesh 時相同', async () => {
    const { STATION_BY_ID, parseLayout, sb } = await mods()
    const def = STATION_BY_ID.get('nyx')!
    const l = parseLayout(def.layout)
    const v = sb.buildStation(def, l)
    expect(v.doors.length).toBe(l.doors.length)
    const ims: THREE.InstancedMesh[] = []
    v.group.traverse((o) => void ((o as THREE.InstancedMesh).isInstancedMesh && ims.push(o as THREE.InstancedMesh)))
    // 門板依寬度各一個＋黃色條＋燈（停機坪的燈另計，每座停機坪一個）
    const widths = new Set(l.doors.map((d) => d.width))
    expect(ims.length).toBe(widths.size + 2 + l.pads.length)
    const d = v.doors[0]
    const half = d.width / 2
    const at = (im: THREE.InstancedMesh, i: number) => {
      const m = new THREE.Matrix4()
      im.getMatrixAt(i, m)
      return new THREE.Vector3().setFromMatrixPosition(m)
    }
    // 以前：門 group（位置＋朝向）底下左門板在 x = -half/2 - off、右門板 half/2 + off、燈在門頂
    const expectAt = (lx: number, ly: number) => new THREE.Vector3(lx, ly, 0).applyMatrix4(d.m)
    const panels = d.parts.panels.get(half)!
    const lampColor = () => {
      const c = new THREE.Color()
      d.parts.lamps.getColorAt(d.i, c)
      return c.getHexString()
    }
    expect(at(panels, d.pi).distanceTo(expectAt(-half / 2, 2.15 / 2))).toBeLessThan(1e-4)
    expect(at(d.parts.lamps, d.i).distanceTo(expectAt(0, 2.2))).toBeLessThan(1e-4)
    expect(lampColor()).toBe(new THREE.Color('#ffb46b').getHexString())
    d.state = 1
    for (let i = 0; i < 30; i++) sb.updateDoors(v, 0.05)
    expect(d.open).toBe(1)
    const off = half * 0.92
    expect(at(panels, d.pi).distanceTo(expectAt(-half / 2 - off, 2.15 / 2))).toBeLessThan(1e-4)
    expect(at(panels, d.pi + 1).distanceTo(expectAt(half / 2 + off, 2.15 / 2))).toBeLessThan(1e-4)
    expect(at(d.parts.stripes, d.i).distanceTo(expectAt(-off - 0.02, 2.15 / 2))).toBeLessThan(1e-4)
    expect(lampColor()).toBe(new THREE.Color('#5cf2a5').getHexString())
    d.state = 2
    for (let i = 0; i < 30; i++) sb.updateDoors(v, 0.05)
    expect(d.open).toBe(0)
    expect(lampColor()).toBe(new THREE.Color('#ff3b3b').getHexString())
    // 其他門沒被動到
    const e = v.doors[1]
    expect(e.open).toBe(0)
    v.dispose()
  }, 120000)

  it('人形屍體倒地之後烘焙成靜態 mesh（每幀最多兩具）；復活時重建；移除時釋放烘焙的幾何', async () => {
    await import('../../src/shared/content/index')
    const { UnitLayer } = await import('../../src/render/units')
    const layer = new UnitLayer()
    const ents = [1, 2, 3].map((i) => ({ s: { i, d: 'npc.deadScientist', z: 1, x: i * 300, y: 100, st: 4, cl: 'researcher' }, x: i * 3, y: 1, f: 0 }))
    const meshes = (id: number) => {
      let n = 0
      layer.views.get(id)!.root.traverse((o) => void ((o as THREE.Mesh).isMesh && n++))
      return n
    }
    const skip = () => false
    layer.sync(ents as never, 1, skip, 0.016, 10)
    const n0 = meshes(1)
    // 前提：是完整的人形骨架。第 7 輪人形重做後，骨架本身已經依「骨頭 × 材質」合併（約 15 個 mesh＋選取圈／光暈，舊版約 30 個），
    // 所以門檻從 20 降到 12；真正要守的是下面「烘焙後少於 70%」與烘焙 mesh 帶實體 id、復活重建、釋放幾何
    expect(n0).toBeGreaterThan(12)
    // 倒地動畫期間不烘焙
    layer.sync(ents as never, 1, skip, 0.016, 10.3)
    expect(layer.views.get(1)!.baked).toBe(false)
    // 0.6 秒後：這一幀兩具、下一幀第三具
    layer.sync(ents as never, 1, skip, 0.016, 10.7)
    expect([1, 2, 3].map((i) => layer.views.get(i)!.baked)).toEqual([true, true, false])
    layer.sync(ents as never, 1, skip, 0.016, 10.72)
    expect(layer.views.get(3)!.baked).toBe(true)
    expect(meshes(1)).toBeLessThan(n0 * 0.7)
    // 拾取：烘焙出來的 mesh 也帶實體 id
    layer.views.get(1)!.root.traverse((o) => {
      if ((o as THREE.Mesh).isMesh) expect(o.userData.entId).toBe(1)
    })
    // 復活：整個重建（骨架照常動畫）
    const baked: THREE.BufferGeometry[] = []
    layer.views.get(2)!.root.traverse((o) => {
      const g = (o as THREE.Mesh).geometry
      if (g?.userData.baked) baked.push(g)
    })
    let disposed = 0
    for (const g of baked) g.addEventListener('dispose', () => disposed++)
    ents[1].s.st = 0
    layer.sync(ents as never, 1, skip, 0.016, 11)
    expect(layer.views.get(2)!.baked).toBe(false)
    expect(meshes(2)).toBe(n0)
    expect(disposed).toBe(baked.length)
    layer.clear()
  })

  it('主要站點的站體 mesh 數（≈ draw call）比合併前少一半以上', async () => {
    const { STATION_BY_ID, parseLayout, sb } = await mods()
    // 合併前（每扇門九個、每片窗玻璃與水漬各一個、設施逐零件）的數字
    const before: Record<string, number> = { nyx: 683, adjudicatrix: 521, bravado: 472, vivarium: 555, tenshu: 328 }
    for (const [id, n0] of Object.entries(before)) {
      const def = STATION_BY_ID.get(id)!
      const v = sb.buildStation(def, parseLayout(def.layout))
      let n = 0
      v.group.traverse((o) => void (((o as THREE.Mesh).isMesh || (o as THREE.Points).isPoints) && n++))
      expect(n, id).toBeLessThan(n0 * 0.6)
      v.dispose()
    }
  }, 120000)
})
