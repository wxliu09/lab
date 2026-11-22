// 骨架合併工具：一個模型的所有剛性零件依「材質槽」合併成幾個 SkinnedMesh（每個零件整塊綁在一根骨頭上，權重 1）。
// 動畫照樣轉骨頭（跟 Group 一樣用 rotation／position／scale），但一隻生物只要 3–5 個 draw call，
// 不是一個零件一個（活體庫號 6 間隔間＋翠原星的動物群，數量一多 draw call 會爆）。
// 合併後的幾何依模型 key 快取、所有實例共用（不 dispose，跟 batch.ts 的共用幾何一樣）；每個實例只有自己的骨頭與 Skeleton。
import * as THREE from 'three'
import type { UnitDef } from '../../shared/content/types'
import type { SnapEntity } from '../../shared/protocol/messages'
import type { ModelView } from './registry'
import { Life, sphereGeo, variant, type Variant } from './creatureKit'

const CACHE = new Map<string, Map<string, THREE.BufferGeometry>>()
const ID = new THREE.Matrix4()

/** 測試用：某個 key 是否已經建過共用幾何 */
export function boneKitCached(key: string): boolean {
  return CACHE.has(key)
}

export class BoneKit {
  readonly bones: THREE.Bone[] = []
  private readonly rest: THREE.Matrix4[] = []
  private readonly acc: Map<string, THREE.BufferGeometry[]> | null
  private readonly m = new THREE.Matrix4()
  private readonly q = new THREE.Quaternion()
  private readonly e = new THREE.Euler()
  private readonly p = new THREE.Vector3()
  private readonly s = new THREE.Vector3()

  /** key：模型種類（含所有會改變幾何的選項）；root：骨頭與 mesh 掛在這裡（骨頭的靜止姿勢以 root 為座標系）*/
  constructor(
    readonly key: string,
    readonly root: THREE.Object3D,
  ) {
    this.acc = CACHE.has(key) ? null : new Map()
  }

  /** 新骨頭（parent = null 掛在 root 下）。靜止姿勢記在 userData，動畫用 pose()／shift() 以它為基準 */
  bone(parent: THREE.Bone | null, x = 0, y = 0, z = 0, rx = 0, ry = 0, rz = 0): THREE.Bone {
    const b = new THREE.Bone()
    b.position.set(x, y, z)
    b.rotation.set(rx, ry, rz)
    b.userData.p0 = b.position.clone()
    b.userData.r0 = b.rotation.clone()
    b.updateMatrix()
    const pi = parent ? (parent.userData.bi as number) : -1
    this.rest.push(pi >= 0 ? this.rest[pi].clone().multiply(b.matrix) : b.matrix.clone())
    b.userData.bi = this.bones.length
    this.bones.push(b)
    ;(parent ?? this.root).add(b)
    return b
  }

  /** 剛性零件：geo 以 (x,y,z)、縮放、旋轉放在骨頭 b 的座標系裡，合併進 slot 那一組（共用幾何已經建過時什麼都不做）*/
  part(b: THREE.Bone, slot: string, geo: THREE.BufferGeometry, x = 0, y = 0, z = 0, sx = 1, sy = sx, sz = sx, rx = 0, ry = 0, rz = 0): void {
    if (!this.acc) return
    const g = geo.index ? geo.toNonIndexed() : geo.clone()
    this.e.set(rx, ry, rz)
    this.q.setFromEuler(this.e)
    this.m.compose(this.p.set(x, y, z), this.q, this.s.set(sx, sy, sz))
    const bi = b.userData.bi as number
    g.applyMatrix4(this.rest[bi].clone().multiply(this.m))
    for (const k of Object.keys(g.attributes)) if (k !== 'position' && k !== 'normal' && k !== 'uv') g.deleteAttribute(k)
    const n = g.attributes.position.count
    if (!g.attributes.uv) g.setAttribute('uv', new THREE.Float32BufferAttribute(new Float32Array(n * 2), 2))
    else {
      // 大零件的貼圖重複幾次：程序化貼圖（細胞紋、毛料）是給 ~0.3 m 的面設計的，一整團 0.5 m 的身體只鋪一次會變成大塊「龜殼」
      if (!geo.boundingSphere) geo.computeBoundingSphere()
      const size = geo.boundingSphere!.radius * Math.max(Math.abs(sx), Math.abs(sy), Math.abs(sz))
      const mu = Math.max(1, Math.min(4, Math.round(size / 0.15)))
      if (mu > 1) {
        const mv = Math.max(1, Math.ceil(mu / 2))
        const uv = g.attributes.uv
        for (let i = 0; i < uv.count; i++) uv.setXY(i, uv.getX(i) * mu, uv.getY(i) * mv)
      }
    }
    if (!g.attributes.normal) g.computeVertexNormals()
    const si = new Uint16Array(n * 4)
    const sw = new Float32Array(n * 4)
    for (let i = 0; i < n; i++) {
      si[i * 4] = bi
      sw[i * 4] = 1
    }
    g.setAttribute('skinIndex', new THREE.Uint16BufferAttribute(si, 4))
    g.setAttribute('skinWeight', new THREE.Float32BufferAttribute(sw, 4))
    g.morphAttributes = {}
    g.clearGroups()
    let arr = this.acc.get(slot)
    if (!arr) this.acc.set(slot, (arr = []))
    arr.push(g)
  }

  /** 橢球零件（共用的單位球）*/
  ell(b: THREE.Bone, slot: string, x: number, y: number, z: number, rx: number, ry: number, rz: number, ws = 10, hs = 7, ax = 0, ay = 0, az = 0): void {
    this.part(b, slot, sphereGeo(ws, hs), x, y, z, rx, ry, rz, ax, ay, az)
  }

  /**
   * 收尾：建（或取用快取的）合併幾何，每個槽一個 SkinnedMesh，共用一副 Skeleton。
   * mats 要涵蓋所有用到的槽；回傳 槽 → mesh（要單獨顯示／隱藏的零件放自己的槽）。
   */
  finish(mats: Record<string, THREE.Material>, shadow = true): Record<string, THREE.SkinnedMesh> {
    let geos = CACHE.get(this.key)
    if (!geos) {
      geos = new Map()
      for (const [slot, list] of this.acc!) {
        const g = mergeAll(list)
        g.computeBoundingSphere()
        g.userData.shared = true
        geos.set(slot, g)
        for (const x of list) x.dispose()
      }
      CACHE.set(this.key, geos)
    }
    const sk = new THREE.Skeleton(
      this.bones,
      this.rest.map((m) => m.clone().invert()),
    )
    const out: Record<string, THREE.SkinnedMesh> = {}
    for (const [slot, g] of geos) {
      const mat = mats[slot]
      if (!mat) throw new Error(`[boneKit] ${this.key} 缺材質槽 ${slot}`)
      const mesh = new THREE.SkinnedMesh(g, mat)
      mesh.bind(sk, ID)
      mesh.castShadow = shadow && !slot.startsWith('glow')
      mesh.receiveShadow = true
      // 動畫幅度不大：用靜止姿勢的包圍球放大一點，免得每個實例第一次被視錐檢查時在 CPU 上逐頂點蒙皮
      mesh.boundingSphere = g.boundingSphere!.clone()
      mesh.boundingSphere.radius *= 1.35
      this.root.add(mesh)
      out[slot] = mesh
    }
    return out
  }
}

/** 把多個幾何依序接成一個（attribute 都是 position／normal／uv／skinIndex／skinWeight，非索引）*/
function mergeAll(list: THREE.BufferGeometry[]): THREE.BufferGeometry {
  const names = ['position', 'normal', 'uv', 'skinIndex', 'skinWeight'] as const
  let n = 0
  for (const g of list) n += g.attributes.position.count
  const out = new THREE.BufferGeometry()
  for (const name of names) {
    const a0 = list[0].attributes[name] as THREE.BufferAttribute
    const size = a0.itemSize
    const arr = name === 'skinIndex' ? new Uint16Array(n * size) : new Float32Array(n * size)
    let o = 0
    for (const g of list) {
      const a = g.attributes[name] as THREE.BufferAttribute
      arr.set(a.array as ArrayLike<number>, o)
      o += a.count * size
    }
    out.setAttribute(name, name === 'skinIndex' ? new THREE.Uint16BufferAttribute(arr, size) : new THREE.Float32BufferAttribute(arr, size))
  }
  return out
}

// ───── 姿勢：以靜止姿勢為基準加上增量 ─────

export function pose(b: THREE.Object3D, rx = 0, ry = 0, rz = 0): void {
  const r = b.userData.r0 as THREE.Euler
  b.rotation.set(r.x + rx, r.y + ry, r.z + rz)
}

export function shift(b: THREE.Object3D, dx = 0, dy = 0, dz = 0): void {
  const p = b.userData.p0 as THREE.Vector3
  b.position.set(p.x + dx, p.y + dy, p.z + dz)
}

// ───── 模型外殼：Life（步態、攻擊、死亡）＋縮放 ─────

export interface Base {
  v: Variant
  root: THREE.Group
  L: Life
}

export function base(def: UnitDef | undefined, s: SnapEntity, stride = 6, atkRate = 1.1): Base {
  const v = variant(def, s)
  return { v, root: new THREE.Group(), L: new Life(v.ph, stride, atkRate) }
}

export function view(b: Base, scale: number, height: number, update: (t: number, dt: number, speed: number, state: number) => void): ModelView {
  b.root.scale.setScalar(scale)
  return {
    root: b.root,
    height: height * scale,
    update(t, dt, speed, state) {
      b.L.step(t, dt, speed, state)
      update(t, dt, speed, state)
    },
  }
}

/** 發光的心跳脈動（攻擊、施法時更亮，死亡後熄掉）*/
export function pulse(m: THREE.MeshStandardMaterial, k: number, t: number, L: Life, f = 2, depth = 0.4): void {
  const h = Math.pow(0.5 + 0.5 * Math.sin(t * f + L.ph), 3)
  m.emissiveIntensity = k * (1 - depth + depth * 2 * h + L.atk * 0.5 + L.cast * 0.5) * (1 - L.dead * 0.9)
}
