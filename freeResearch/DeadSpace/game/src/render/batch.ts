// 靜態幾何合併：同材質的零件合成一個 Mesh，壓低 draw call
import * as THREE from 'three'
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js'
import { RoundedBoxGeometry } from 'three/examples/jsm/geometries/RoundedBoxGeometry.js'
import { runSteps, type Steps } from './steps'

/** 分段合併時一段的零件數 */
const MERGE_CHUNK = 192

export class Batcher {
  private parts = new Map<THREE.Material, THREE.BufferGeometry[]>()
  private m = new THREE.Matrix4()
  private q = new THREE.Quaternion()
  private e = new THREE.Euler()
  private s = new THREE.Vector3()
  private p = new THREE.Vector3()

  /** 以位置／旋轉（Y 軸）／縮放加入一個幾何（會複製）*/
  add(geo: THREE.BufferGeometry, mat: THREE.Material, x: number, y: number, z: number, rotY = 0, sx = 1, sy = 1, sz = 1, rotX = 0, rotZ = 0): void {
    const g = geo.index ? geo.toNonIndexed() : geo.clone()
    this.e.set(rotX, rotY, rotZ)
    this.q.setFromEuler(this.e)
    this.p.set(x, y, z)
    this.s.set(sx, sy, sz)
    this.m.compose(this.p, this.q, this.s)
    g.applyMatrix4(this.m)
    normalizeAttrs(g)
    let arr = this.parts.get(mat)
    if (!arr) this.parts.set(mat, (arr = []))
    arr.push(g)
  }

  addMatrix(geo: THREE.BufferGeometry, mat: THREE.Material, matrix: THREE.Matrix4): void {
    const g = geo.index ? geo.toNonIndexed() : geo.clone()
    g.applyMatrix4(matrix)
    normalizeAttrs(g)
    let arr = this.parts.get(mat)
    if (!arr) this.parts.set(mat, (arr = []))
    arr.push(g)
  }

  build(group: THREE.Object3D, opts: { cast?: boolean; receive?: boolean } = {}): THREE.Mesh[] {
    return runSteps(this.buildSteps(group, opts))
  }

  /**
   * 分段合併：零件多的材質先每 MERGE_CHUNK 個合成一段、每段之後 yield，最後再把各段接起來
   * （mergeGeometries 是依序串接，分段合併的結果和一次合併完全相同）。
   */
  *buildSteps(group: THREE.Object3D, opts: { cast?: boolean; receive?: boolean } = {}): Steps<THREE.Mesh[]> {
    const out: THREE.Mesh[] = []
    for (const [mat, geos] of this.parts) {
      let merged: THREE.BufferGeometry | null
      if (geos.length <= MERGE_CHUNK) merged = mergeGeometries(geos, false)
      else {
        const parts: THREE.BufferGeometry[] = []
        let ok = true
        for (let i = 0; i < geos.length && ok; i += MERGE_CHUNK) {
          const m = mergeGeometries(geos.slice(i, i + MERGE_CHUNK), false)
          if (m) parts.push(m)
          else ok = false
          yield
        }
        // 任何一段合併失敗（attribute 不一致）就和一次合併一樣整組放棄
        merged = ok ? mergeGeometries(parts, false) : null
        for (const g of parts) g.dispose()
      }
      yield
      if (!merged) continue
      merged.computeBoundingSphere()
      const mesh = new THREE.Mesh(merged, mat)
      mesh.castShadow = opts.cast ?? true
      mesh.receiveShadow = opts.receive ?? true
      mesh.matrixAutoUpdate = false
      mesh.updateMatrix()
      group.add(mesh)
      out.push(mesh)
      for (const g of geos) g.dispose()
    }
    this.parts.clear()
    return out
  }
}

/** 可以併進同層合併 mesh 的零件：一般 Mesh、單一材質、不是線框、沒有子物件、看得見、不在 skip 裡、沒標 userData.live */
function mergeable(o: THREE.Object3D, skip: ReadonlySet<THREE.Object3D>): o is THREE.Mesh {
  const m = o as THREE.Mesh
  if (!m.isMesh || (m as THREE.InstancedMesh).isInstancedMesh || (m as THREE.SkinnedMesh).isSkinnedMesh) return false
  if (o.children.length || !o.visible || skip.has(o) || o.userData.live) return false
  const mat = m.material
  if (!mat || Array.isArray(mat) || (mat as THREE.MeshBasicMaterial).wireframe) return false
  const g = m.geometry
  return !!g?.attributes.position && !Object.keys(g.morphAttributes).length
}

/**
 * 把 root 底下（每一層各自）不會動的葉子 Mesh 依材質＋陰影設定＋renderOrder 合併成一個（設施模型：一台販賣機十幾個零件 → 幾個）。
 * 零件的位置在 root（或所在那一層）的座標系裡烘焙進幾何，所以 root 整個藏起來、換掉、拾取（poiKey 在 root 上）都照舊。
 * 會被動畫改位置／旋轉／縮放／顯示的零件不能併：動畫的 obj 放進 skip（它的子物件仍可在它底下合併），
 * 動畫閉包另外改到的零件要標 userData.live（props.ts 的 keep()）。回傳被併掉、已經從場景圖拿掉的零件（測試用來確認沒有動畫零件被併掉）。
 */
export function mergeStatic(root: THREE.Object3D, skip: ReadonlySet<THREE.Object3D>): THREE.Mesh[] {
  const removed: THREE.Mesh[] = []
  const visit = (node: THREE.Object3D) => {
    const buckets = new Map<string, THREE.Mesh[]>()
    for (const c of node.children) {
      if (c.children.length) {
        visit(c)
        continue
      }
      if (!mergeable(c, skip)) continue
      const mat = c.material as THREE.Material
      const k = `${mat.uuid}|${c.castShadow ? 1 : 0}${c.receiveShadow ? 1 : 0}|${c.renderOrder}|${c.frustumCulled ? 1 : 0}`
      let arr = buckets.get(k)
      if (!arr) buckets.set(k, (arr = []))
      arr.push(c)
    }
    for (const list of buckets.values()) {
      if (list.length < 2) continue
      const b = new Batcher()
      const first = list[0]
      for (const m of list) {
        m.updateMatrix()
        b.addMatrix(m.geometry, m.material as THREE.Material, m.matrix)
      }
      const out = b.build(node, { cast: first.castShadow, receive: first.receiveShadow })
      for (const mesh of out) {
        mesh.renderOrder = first.renderOrder
        mesh.frustumCulled = first.frustumCulled
      }
      for (const m of list) {
        node.remove(m)
        removed.push(m)
      }
    }
  }
  visit(root)
  return removed
}

/**
 * 不會再動的整棵骨架（倒地的人形屍體）：root 底下 pick 選中的 Mesh（任意深度、單一材質、看得見）依材質＋陰影設定
 * 烘焙成 root 座標系裡的合併 mesh（一具屍體三十個零件 → 十幾個）。骨架節點與其他物件（槍口、手電筒掛點、之後掛上的附件）留著。
 * 回傳新建的 mesh：幾何是這裡新建的（userData.baked），移除時要 dispose。
 */
export function bakeTree(root: THREE.Object3D, pick: (m: THREE.Mesh) => boolean): THREE.Mesh[] {
  root.updateMatrixWorld(true)
  const inv = root.matrixWorld.clone().invert()
  const buckets = new Map<string, { b: Batcher; cast: boolean; receive: boolean; list: THREE.Mesh[] }>()
  const rel = new THREE.Matrix4()
  const shownUnder = (o: THREE.Object3D | null) => {
    for (; o && o !== root; o = o.parent) if (!o.visible) return false
    return true
  }
  root.traverse((o) => {
    const m = o as THREE.Mesh
    if (!m.isMesh || (m as THREE.InstancedMesh).isInstancedMesh || !pick(m) || !shownUnder(m)) return
    const mat = m.material
    if (!mat || Array.isArray(mat) || (mat as THREE.MeshBasicMaterial).wireframe || !m.geometry?.attributes.position) return
    const k = `${mat.uuid}|${m.castShadow ? 1 : 0}${m.receiveShadow ? 1 : 0}|${m.renderOrder}`
    let bk = buckets.get(k)
    if (!bk) buckets.set(k, (bk = { b: new Batcher(), cast: m.castShadow, receive: m.receiveShadow, list: [] }))
    bk.b.addMatrix(m.geometry, mat, rel.multiplyMatrices(inv, m.matrixWorld))
    bk.list.push(m)
  })
  const out: THREE.Mesh[] = []
  for (const bk of buckets.values()) {
    for (const mesh of bk.b.build(root, { cast: bk.cast, receive: bk.receive })) {
      mesh.renderOrder = bk.list[0].renderOrder
      mesh.geometry.userData.baked = true
      out.push(mesh)
    }
    for (const m of bk.list) m.removeFromParent()
  }
  return out
}

/** mergeGeometries 需要所有幾何有相同的 attribute 組：補上 uv 與 color */
function normalizeAttrs(g: THREE.BufferGeometry): void {
  const n = g.attributes.position.count
  if (!g.attributes.uv) g.setAttribute('uv', new THREE.Float32BufferAttribute(new Float32Array(n * 2), 2))
  if (!g.attributes.normal) g.computeVertexNormals()
  if (!g.attributes.color) {
    const c = new Float32Array(n * 3).fill(1)
    g.setAttribute('color', new THREE.Float32BufferAttribute(c, 3))
  }
  for (const k of Object.keys(g.attributes)) {
    if (k !== 'position' && k !== 'normal' && k !== 'uv' && k !== 'color') g.deleteAttribute(k)
  }
  g.morphAttributes = {}
}

// ───── 常用幾何（共用、不要 dispose）─────

const geoCache = new Map<string, THREE.BufferGeometry>()

export function rbox(w: number, h: number, d: number, r = 0.04, seg = 2): THREE.BufferGeometry {
  const k = `rb:${w}:${h}:${d}:${r}:${seg}`
  let g = geoCache.get(k)
  if (!g) {
    g = new RoundedBoxGeometry(w, h, d, seg, Math.min(r, w / 2 - 1e-3, h / 2 - 1e-3, d / 2 - 1e-3))
    // 盒子 UV 依尺寸縮放，避免貼圖拉伸
    const uv = g.attributes.uv
    const nrm = g.attributes.normal
    for (let i = 0; i < uv.count; i++) {
      const nx = Math.abs(nrm.getX(i))
      const ny = Math.abs(nrm.getY(i))
      const su = nx > 0.5 ? d : w
      const sv = ny > 0.5 ? d : h
      uv.setXY(i, uv.getX(i) * su * 0.5, uv.getY(i) * sv * 0.5)
    }
    geoCache.set(k, g)
  }
  return g
}

export function box(w: number, h: number, d: number): THREE.BufferGeometry {
  const k = `b:${w}:${h}:${d}`
  let g = geoCache.get(k)
  if (!g) {
    g = new THREE.BoxGeometry(w, h, d)
    const uv = g.attributes.uv
    const nrm = g.attributes.normal
    for (let i = 0; i < uv.count; i++) {
      const nx = Math.abs(nrm.getX(i))
      const ny = Math.abs(nrm.getY(i))
      uv.setXY(i, uv.getX(i) * (nx > 0.5 ? d : w) * 0.5, uv.getY(i) * (ny > 0.5 ? d : h) * 0.5)
    }
    geoCache.set(k, g)
  }
  return g
}

export function cyl(rt: number, rb: number, h: number, seg = 20, open = false): THREE.BufferGeometry {
  const k = `c:${rt}:${rb}:${h}:${seg}:${open}`
  let g = geoCache.get(k)
  if (!g) geoCache.set(k, (g = new THREE.CylinderGeometry(rt, rb, h, seg, 1, open)))
  return g
}

export function sphere(r: number, ws = 16, hs = 12): THREE.BufferGeometry {
  const k = `s:${r}:${ws}:${hs}`
  let g = geoCache.get(k)
  if (!g) geoCache.set(k, (g = new THREE.SphereGeometry(r, ws, hs)))
  return g
}

export function torus(r: number, t: number, rs = 8, ts = 32, arc = Math.PI * 2): THREE.BufferGeometry {
  const k = `t:${r}:${t}:${rs}:${ts}:${arc}`
  let g = geoCache.get(k)
  if (!g) geoCache.set(k, (g = new THREE.TorusGeometry(r, t, rs, ts, arc)))
  return g
}

export function plane(w: number, h: number): THREE.BufferGeometry {
  const k = `p:${w}:${h}`
  let g = geoCache.get(k)
  if (!g) geoCache.set(k, (g = new THREE.PlaneGeometry(w, h)))
  return g
}

export function capsule(r: number, len: number, cs = 6, rs = 12): THREE.BufferGeometry {
  const k = `cap:${r}:${len}:${cs}:${rs}`
  let g = geoCache.get(k)
  if (!g) geoCache.set(k, (g = new THREE.CapsuleGeometry(r, len, cs, rs)))
  return g
}
