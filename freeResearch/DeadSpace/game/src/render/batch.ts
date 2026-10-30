// 靜態幾何合併：同材質的零件合成一個 Mesh，壓低 draw call
import * as THREE from 'three'
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js'
import { RoundedBoxGeometry } from 'three/examples/jsm/geometries/RoundedBoxGeometry.js'

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
    const out: THREE.Mesh[] = []
    for (const [mat, geos] of this.parts) {
      const merged = mergeGeometries(geos, false)
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
