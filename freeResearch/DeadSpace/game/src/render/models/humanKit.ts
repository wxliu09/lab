// 人形零件工具：程序化幾何（lathe 圓潤肢段、斜角方塊、靴子、手套）、共用材質（貼圖集＋頂點色）、依骨架節點合併。
// 一個人形的零件先登記在 Kit 裡，最後每個骨架節點 × 材質槽合成一個 Mesh（約 15 個 draw call；舊版約 30）。
// 合併後的幾何依「外觀 key」快取共用：同職業、同防護服、同 seed、同 LOD 的人形用同一份幾何（不會每建一次就多一份 GPU buffer）。
// 外觀只取決於快照看得到的欄位（職業 cl、玩家色 c、id 推出的 seed、防護服 d）——偽裝的異形走同一條路，不會洩漏身分。
import * as THREE from 'three'
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js'
import { withFog, withRim } from '../materials'
import { humanAtlas, tileRect, type Tile } from './humanTex'

export type V3 = readonly [number, number, number]

/** 材質槽：body = 貼圖集＋頂點色（布、甲、橡膠、皮膚、頭髮都在這）；glow = 自發光（頂點色＝亮度）；pc = 玩家色肩甲 */
export type Slot = 'body' | 'glow' | 'pc'

export interface PartOpts {
  tile?: Tile
  /** sRGB 色碼（body：底色；glow：發光色）*/
  color?: string
  slot?: Slot
  at?: V3
  rot?: V3
  scale?: number | V3
  /** 先套這個矩陣再套 at／rot／scale（例：槍的握持座標系）*/
  frame?: THREE.Matrix4
  /** 標籤：防護服可以整組拿掉（hair、hat、pack、gun、coat、prop…）*/
  tag?: string
  /** 小細節：低畫質不建 */
  small?: boolean
  /** 邊緣磨損（斜角面變亮）0..1 */
  wear?: number
  /** 依零件本地座標調整明暗（鞋底變暗、條紋…）；回傳倍率 */
  shade?: (x: number, y: number, z: number) => number
  /** glow：亮度倍率 */
  glow?: number
}

interface Part {
  node: THREE.Object3D
  geo: THREE.BufferGeometry
  o: PartOpts
}

// ───── 幾何（共用快取，不要 dispose）─────

const geos = new Map<string, THREE.BufferGeometry>()

function cached(key: string, f: () => THREE.BufferGeometry): THREE.BufferGeometry {
  let g = geos.get(key)
  if (!g) {
    g = f()
    g.userData.shared = true
    geos.set(key, g)
  }
  return g
}

/** 只留 position／normal／uv，補上 index（合併時全部一致）*/
function tidy(g: THREE.BufferGeometry): THREE.BufferGeometry {
  for (const k of Object.keys(g.attributes))
    if (k !== 'position' && k !== 'normal' && k !== 'uv') g.deleteAttribute(k)
  if (!g.attributes.normal) g.computeVertexNormals()
  if (!g.attributes.uv)
    g.setAttribute(
      'uv',
      new THREE.Float32BufferAttribute(new Float32Array(g.attributes.position.count * 2), 2),
    )
  if (!g.index) g.setIndex(Array.from({ length: g.attributes.position.count }, (_, i) => i))
  g.clearGroups()
  return g
}

/**
 * 旋轉體（肢段、軀幹、頭、頭盔、肩甲）：profile 是 [半徑, 高度]，由下往上排；phi 0 = 正面（+Z）。
 * sx／sz 把圓形截面壓成橢圓（軀幹前後較薄）。
 */
export function lathe(
  profile: readonly (readonly [number, number])[],
  seg: number,
  sx = 1,
  sz = 1,
  phiStart = 0,
  phiLen = Math.PI * 2,
): THREE.BufferGeometry {
  // 整圈的接縫放在背後（phi = π），正面不會有 UV 接縫
  if (phiStart === 0 && phiLen >= Math.PI * 2 - 1e-6) phiStart = Math.PI
  const key = `la:${profile.map((p) => p.join(',')).join(';')}:${seg}:${sx}:${sz}:${phiStart}:${phiLen}`
  return cached(key, () => {
    const g = new THREE.LatheGeometry(
      profile.map(([r, y]) => new THREE.Vector2(r, y)),
      seg,
      phiStart,
      phiLen,
    )
    // applyMatrix4 用 normal matrix 轉法線：橢圓截面的法線仍然正確、接縫不會出現摺痕
    if (sx !== 1 || sz !== 1) g.scale(sx, 1, sz)
    return tidy(g)
  })
}

/**
 * 斜角方塊（44 個三角形；RoundedBox 2 段要 300）：每個面、邊、角各自平面法線，硬表面的倒角在俯視距離下會吃到邊光。
 * UV 依面的主軸投影、每個面 0..1（貼圖集的掉漆剛好落在面的邊上）。
 */
export function cbox(w: number, h: number, d: number, c = 0.015): THREE.BufferGeometry {
  return cached(`cb:${w}:${h}:${d}:${c}`, () => {
    const a = w / 2
    const b = h / 2
    const e = d / 2
    const r = Math.min(c, a * 0.45, b * 0.45, e * 0.45)
    const PX = (sx: number, sy: number, sz: number): V3 => [sx * a, sy * (b - r), sz * (e - r)]
    const PY = (sx: number, sy: number, sz: number): V3 => [sx * (a - r), sy * b, sz * (e - r)]
    const PZ = (sx: number, sy: number, sz: number): V3 => [sx * (a - r), sy * (b - r), sz * e]
    const polys: V3[][] = []
    for (const s of [-1, 1]) {
      polys.push([PX(s, -1, -1), PX(s, 1, -1), PX(s, 1, 1), PX(s, -1, 1)])
      polys.push([PY(-1, s, -1), PY(1, s, -1), PY(1, s, 1), PY(-1, s, 1)])
      polys.push([PZ(-1, -1, s), PZ(1, -1, s), PZ(1, 1, s), PZ(-1, 1, s)])
    }
    for (const s of [-1, 1]) {
      for (const t of [-1, 1]) {
        polys.push([PX(s, t, -1), PX(s, t, 1), PY(s, t, 1), PY(s, t, -1)])
        polys.push([PX(s, -1, t), PX(s, 1, t), PZ(s, 1, t), PZ(s, -1, t)])
        polys.push([PY(-1, s, t), PY(1, s, t), PZ(1, s, t), PZ(-1, s, t)])
        for (const u of [-1, 1]) polys.push([PX(s, t, u), PY(s, t, u), PZ(s, t, u)])
      }
    }
    const pos: number[] = []
    const nrm: number[] = []
    const uv: number[] = []
    const va = new THREE.Vector3()
    const vb = new THREE.Vector3()
    const vc = new THREE.Vector3()
    const n = new THREE.Vector3()
    const cen = new THREE.Vector3()
    for (let poly of polys) {
      va.set(...poly[0])
      vb.set(...poly[1])
      vc.set(...poly[2])
      n.subVectors(vb, va).cross(vc.sub(va)).normalize()
      cen.set(0, 0, 0)
      for (const p of poly) cen.add(vb.set(...p))
      if (n.dot(cen) < 0) {
        poly = [...poly].reverse()
        n.negate()
      }
      const ax = Math.abs(n.x)
      const ay = Math.abs(n.y)
      const az = Math.abs(n.z)
      const uvOf = (p: V3): [number, number] =>
        ax >= ay && ax >= az
          ? [(p[2] + e) / (2 * e), (p[1] + b) / (2 * b)]
          : ay >= az
            ? [(p[0] + a) / (2 * a), (p[2] + e) / (2 * e)]
            : [(p[0] + a) / (2 * a), (p[1] + b) / (2 * b)]
      for (let i = 1; i + 1 < poly.length; i++) {
        for (const p of [poly[0], poly[i], poly[i + 1]]) {
          pos.push(...p)
          nrm.push(n.x, n.y, n.z)
          uv.push(...uvOf(p))
        }
      }
    }
    const g = new THREE.BufferGeometry()
    g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3))
    g.setAttribute('normal', new THREE.Float32BufferAttribute(nrm, 3))
    g.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2))
    return tidy(g)
  })
}

export function ball(r: number, ws = 10, hs = 7): THREE.BufferGeometry {
  return cached(`sp:${r}:${ws}:${hs}`, () => tidy(new THREE.SphereGeometry(r, ws, hs)))
}

export function tube(rt: number, rb: number, h: number, seg = 10, open = false): THREE.BufferGeometry {
  return cached(`cy:${rt}:${rb}:${h}:${seg}:${open}`, () =>
    tidy(new THREE.CylinderGeometry(rt, rb, h, seg, 1, open)),
  )
}

export function ring(r: number, t: number, rs = 5, ts = 14, arc = Math.PI * 2): THREE.BufferGeometry {
  return cached(`to:${r}:${t}:${rs}:${ts}:${arc}`, () => tidy(new THREE.TorusGeometry(r, t, rs, ts, arc)))
}

/** 軟管：CatmullRom 曲線上的管子（燃料管、液氮管）*/
export function hose(pts: readonly V3[], r: number, seg = 10, rs = 5): THREE.BufferGeometry {
  return cached(`ho:${pts.map((p) => p.join(',')).join(';')}:${r}:${seg}:${rs}`, () =>
    tidy(
      new THREE.TubeGeometry(
        new THREE.CatmullRomCurve3(pts.map((p) => new THREE.Vector3(...p))),
        seg,
        r,
        rs,
        false,
      ),
    ),
  )
}

/** 擠出（側面輪廓 → 沿 X 擠出、中心在 x = 0）：靴子、鞋底、槍身 */
export function extrudeX(
  key: string,
  shape: () => THREE.Shape,
  width: number,
  bevel: number,
  curve = 4,
): THREE.BufferGeometry {
  return cached(`ex:${key}:${width}:${bevel}:${curve}`, () => {
    const g = new THREE.ExtrudeGeometry(shape(), {
      depth: Math.max(0.001, width - bevel * 2),
      bevelEnabled: bevel > 0,
      bevelSize: bevel,
      bevelThickness: bevel,
      bevelSegments: 1,
      curveSegments: curve,
    })
    // 形狀的 X → 世界 +Z（前）、擠出方向 Z → 世界 X
    g.rotateY(-Math.PI / 2)
    g.computeBoundingBox()
    const bb = g.boundingBox!
    g.translate(-(bb.min.x + bb.max.x) / 2, 0, 0)
    return tidy(g)
  })
}

/** 靴子：鞋跟在 z ≈ -0.07、鞋尖 z ≈ 0.16、鞋底 y = 0、靴筒頂 y = 0.17 */
export function bootGeo(heavy = false): THREE.BufferGeometry {
  const k = heavy ? 1.12 : 1
  return extrudeX(
    `boot${heavy ? 'H' : ''}`,
    () => {
      const s = new THREE.Shape()
      s.moveTo(-0.075 * k, 0)
      s.lineTo(0.13 * k, 0)
      s.quadraticCurveTo(0.17 * k, 0.0, 0.168 * k, 0.04)
      s.quadraticCurveTo(0.16 * k, 0.078, 0.09 * k, 0.085)
      s.lineTo(0.05, 0.17 * k)
      s.lineTo(-0.065 * k, 0.175 * k)
      s.quadraticCurveTo(-0.082 * k, 0.09, -0.075 * k, 0)
      return s
    },
    0.126 * k,
    0.018,
    3,
  )
}

/** 手套（手心朝身體內側、拇指在前）；side = 手臂在哪一側（-1 / 1）*/
export function handGeo(side: number): THREE.BufferGeometry {
  return cached(`hand:${side}`, () => {
    const parts: THREE.BufferGeometry[] = []
    const put = (g: THREE.BufferGeometry, at: V3, rot: V3) => {
      const c = g.clone()
      c.applyMatrix4(
        new THREE.Matrix4().compose(
          new THREE.Vector3(...at),
          new THREE.Quaternion().setFromEuler(new THREE.Euler(...rot)),
          new THREE.Vector3(1, 1, 1),
        ),
      )
      parts.push(c)
    }
    // 手掌＋四指一塊（微彎向手心）、拇指在前
    put(cbox(0.04, 0.12, 0.078, 0.014), [-side * 0.004, -0.018, 0.002], [0, 0, side * 0.16])
    put(blk(0.024, 0.05, 0.022), [-side * 0.016, -0.012, 0.046], [-0.35, 0, side * 0.2])
    return tidy(mergeGeometries(parts, false)!)
  })
}

// ───── 材質（所有人形共用）─────

const mats = new Map<string, THREE.Material>()

function shared<T extends THREE.Material>(key: string, f: () => T): T {
  let m = mats.get(key) as T | undefined
  if (!m) {
    m = f()
    m.userData.shared = true
    mats.set(key, m)
  }
  return m
}

/** 身體：貼圖集（明暗／粗糙度／金屬度／法線）× 頂點色 */
export function bodyMat(): THREE.MeshStandardMaterial {
  return shared('body', () => {
    const a = humanAtlas()
    const m = new THREE.MeshStandardMaterial({
      map: a.map,
      roughnessMap: a.orm,
      metalnessMap: a.orm,
      normalMap: a.normal,
      roughness: 1,
      metalness: 1,
      vertexColors: true,
    })
    m.normalScale.set(0.7, 0.7)
    return withFog(m)
  })
}

/** 自發光：頂點色就是發光色（可以 > 1，給 bloom 吃）；不受光 */
export function glowMat(): THREE.MeshBasicMaterial {
  return shared('glow', () => withFog(new THREE.MeshBasicMaterial({ vertexColors: true })))
}

/** 玩家色肩甲：烤漆格＋玩家色底色、淡淡自發光與同色邊光（預設距離下人只有約 50 px，肩甲要在暗處也認得出顏色）*/
export function pcMat(color: string): THREE.MeshStandardMaterial {
  return shared(`pc:${color}`, () => {
    const a = humanAtlas()
    const m = new THREE.MeshStandardMaterial({
      color,
      map: a.map,
      roughnessMap: a.orm,
      metalnessMap: a.orm,
      normalMap: a.normal,
      roughness: 0.9,
      metalness: 0.6,
      vertexColors: true,
      emissive: color,
      emissiveIntensity: 0.22,
    })
    m.normalScale.set(0.6, 0.6)
    return withFog(withRim(m, color, 0.55))
  })
}

function slotMat(slot: Slot, pc: string): THREE.Material {
  return slot === 'body' ? bodyMat() : slot === 'glow' ? glowMat() : pcMat(pc)
}

// ───── 零件登記＋合併 ─────

const merged = new Map<string, THREE.BufferGeometry>()
const col = new THREE.Color()
const mtx = new THREE.Matrix4()
const tq = new THREE.Quaternion()
const te = new THREE.Euler()
const tv = new THREE.Vector3()
const ts = new THREE.Vector3()

function partMatrix(o: PartOpts, out: THREE.Matrix4): THREE.Matrix4 {
  const s = o.scale ?? 1
  te.set(...(o.rot ?? [0, 0, 0]))
  tq.setFromEuler(te)
  tv.set(...(o.at ?? [0, 0, 0]))
  if (typeof s === 'number') ts.set(s, s, s)
  else ts.set(...s)
  out.compose(tv, tq, ts)
  if (o.frame) out.premultiply(o.frame)
  return out
}

/** 一個零件 → 已經在節點座標系、帶 uv（貼圖集）與頂點色的幾何 */
function bake(p: Part): THREE.BufferGeometry {
  const o = p.o
  const slot = o.slot ?? 'body'
  const g = p.geo.clone()
  const pos = g.attributes.position
  const nrm = g.attributes.normal
  const uv = g.attributes.uv
  const n = pos.count
  const c = new Float32Array(n * 3)
  col.set(o.color ?? '#ffffff')
  if (slot === 'glow') {
    const k = o.glow ?? 1.6
    for (let i = 0; i < n; i++) {
      c[i * 3] = col.r * k
      c[i * 3 + 1] = col.g * k
      c[i * 3 + 2] = col.b * k
    }
  } else {
    // UV 正規化到這一格（零件自己的 UV 範圍 → 格子內）
    let u0 = Infinity
    let u1 = -Infinity
    let v0 = Infinity
    let v1 = -Infinity
    for (let i = 0; i < n; i++) {
      const u = uv.getX(i)
      const v = uv.getY(i)
      if (u < u0) u0 = u
      if (u > u1) u1 = u
      if (v < v0) v0 = v
      if (v > v1) v1 = v
    }
    const [a0, b0, a1, b1] = tileRect(o.tile ?? 'fabric')
    const du = u1 - u0 > 1e-6 ? u1 - u0 : 1
    const dv = v1 - v0 > 1e-6 ? v1 - v0 : 1
    for (let i = 0; i < n; i++)
      uv.setXY(i, a0 + ((uv.getX(i) - u0) / du) * (a1 - a0), b0 + ((uv.getY(i) - v0) / dv) * (b1 - b0))
    const wear = o.wear ?? 0
    for (let i = 0; i < n; i++) {
      const k = o.shade ? o.shade(pos.getX(i), pos.getY(i), pos.getZ(i)) : 1
      // 邊緣磨損：斜角面（法線不在主軸上）變亮、偏灰（肩甲：玩家色變亮）
      const e =
        wear > 0 ? 1 - Math.max(Math.abs(nrm.getX(i)), Math.abs(nrm.getY(i)), Math.abs(nrm.getZ(i))) : 0
      const w = Math.min(1, e * wear * 2.4)
      if (slot === 'pc') {
        c[i * 3] = c[i * 3 + 1] = c[i * 3 + 2] = k * (1 + w * 0.9)
        continue
      }
      // 相對提亮（暗色烤漆的倒角不會變成一圈白線）
      const lift = 1 + w * 0.75
      c[i * 3] = col.r * k * lift + w * 0.035
      c[i * 3 + 1] = col.g * k * lift + w * 0.034
      c[i * 3 + 2] = col.b * k * lift + w * 0.032
    }
  }
  g.applyMatrix4(partMatrix(o, mtx))
  if (slot !== 'glow') {
    // 烘焙的方向遮蔽：朝下的面暗一點（俯視時輪廓、層次更清楚）
    const nn = g.attributes.normal
    for (let i = 0; i < n; i++) {
      const ao = 0.74 + 0.26 * (nn.getY(i) * 0.5 + 0.5)
      c[i * 3] *= ao
      c[i * 3 + 1] *= ao
      c[i * 3 + 2] *= ao
    }
  }
  g.setAttribute('color', new THREE.Float32BufferAttribute(c, 3))
  return g
}

/** 每個人形一份：登記零件 → finalize 依節點 × 材質槽合併（快取）→ 掛到骨架上 */
export class Kit {
  parts: Part[] = []
  /** finalize 建立、掛在骨架上的 mesh（重建時先拿掉）*/
  meshes: THREE.Mesh[] = []

  constructor(
    /** 0 = 低畫質（少段數、不建小細節）*/
    readonly lod: 0 | 1,
  ) {}

  /** 段數：低畫質約 2/3 */
  seg(n: number): number {
    return this.lod ? n : Math.max(6, Math.round(n * 0.66))
  }

  add(node: THREE.Object3D, geo: THREE.BufferGeometry, o: PartOpts = {}): void {
    if (o.small && !this.lod) return
    this.parts.push({ node, geo, o })
  }

  /** 左右對稱的一對：side 帶入 f，回傳這一側的 at／rot 等 */
  pair(
    node: (side: number) => THREE.Object3D,
    geo: (side: number) => THREE.BufferGeometry,
    o: (side: number) => PartOpts,
  ): void {
    for (const s of [-1, 1]) this.add(node(s), geo(s), o(s))
  }

  drop(...tags: string[]): void {
    this.parts = this.parts.filter((p) => !p.o.tag || !tags.includes(p.o.tag))
  }

  has(tag: string): boolean {
    return this.parts.some((p) => p.o.tag === tag)
  }

  /** 合併並掛上；key 唯一決定零件內容（外觀 key：職業｜防護服｜seed｜LOD），同 key 的人形共用幾何 */
  finalize(key: string, pc: string): void {
    for (const m of this.meshes) m.removeFromParent()
    this.meshes = []
    const nodes: THREE.Object3D[] = []
    const byNode = new Map<THREE.Object3D, Map<Slot, Part[]>>()
    for (const p of this.parts) {
      let m = byNode.get(p.node)
      if (!m) {
        byNode.set(p.node, (m = new Map()))
        nodes.push(p.node)
      }
      const s = p.o.slot ?? 'body'
      let arr = m.get(s)
      if (!arr) m.set(s, (arr = []))
      arr.push(p)
    }
    nodes.forEach((node, i) => {
      for (const [slot, list] of byNode.get(node)!) {
        const ck = `${key}|${i}|${slot}`
        let g = merged.get(ck)
        if (!g) {
          const baked = list.map(bake)
          g = mergeGeometries(baked, false)!
          for (const b of baked) b.dispose()
          g.computeBoundingSphere()
          g.userData.shared = true
          merged.set(ck, g)
        }
        const mesh = new THREE.Mesh(g, slotMat(slot, pc))
        mesh.castShadow = slot !== 'glow'
        mesh.receiveShadow = slot !== 'glow'
        node.add(mesh)
        this.meshes.push(mesh)
      }
    })
  }
}

/** 測試用：目前快取的合併幾何數 */
export function mergedCount(): number {
  return merged.size
}

/** 一般方塊（12 個三角形）：眼睛、眉毛、徽章這類很小、看不到倒角的零件 */
export function blk(w: number, h: number, d: number): THREE.BufferGeometry {
  return cached(`bx:${w}:${h}:${d}`, () => tidy(new THREE.BoxGeometry(w, h, d)))
}
