// 太空層的站體外觀（程序化）：每座站依用途有一眼可辨的剪影（美術聖經 §3.3、§10）
// 靜態零件用 Batcher 合併（同材質一個 draw call），材質一律走 Mat.*（快取），會動的零件各自一個小群組。
// 座標：+y 朝上、+z 是船頭（會開動的船艦型站點朝 +z 前進）；設計尺寸下主體半徑 ≈ SPECS.size，
// 遊戲內依碰撞半徑換算縮放（stationHullScale）。
import * as THREE from 'three'
import { Batcher, box, cyl, rbox, sphere, torus } from '../batch'
import { Mat } from '../materials'
import { decalTex } from '../tex'

interface HullSpec {
  hull: string
  accent: string
  glow: string
  /** 設計座標下主體的半徑（細長的天線、砲管、碎片可以超出）*/
  size: number
  /** 自轉速度（rad/s）；船艦型（有船頭、會開動）為 0，改成輕微橫搖 */
  spin: number
}

const SPECS: Record<string, HullSpec> = {
  nyx: { hull: '#c4ccd3', accent: '#33ffd1', glow: '#7fd8ff', size: 4.0, spin: 0.02 },
  adjudicatrix: { hull: '#2b3a5a', accent: '#ffc23d', glow: '#ffc23d', size: 3.1, spin: 0.02 },
  tenshu: { hull: '#26282c', accent: '#ff7a2a', glow: '#ff9a4a', size: 3.0, spin: 0.02 },
  hulk7: { hull: '#5a4a3a', accent: '#8a5a3a', glow: '#ffb46b', size: 3.3, spin: 0.02 },
  bravado: { hull: '#4a5058', accent: '#ff3b3b', glow: '#ff5a4a', size: 4.4, spin: 0 },
  caldera: { hull: '#7a6a2a', accent: '#ffc23d', glow: '#ff9a3a', size: 3.4, spin: 0 },
  vivarium: { hull: '#3a5a4a', accent: '#5cf2a5', glow: '#5cf2a5', size: 4.2, spin: 0.02 },
  portage: { hull: '#5a6a7a', accent: '#4aa8ff', glow: '#4aa8ff', size: 3.5, spin: 0.02 },
  pirate: { hull: '#4a2c2a', accent: '#ff3b3b', glow: '#ff6a3a', size: 3.2, spin: 0 },
}

/**
 * 碰撞半徑 → 模型縮放：主體外觀略大於碰撞圈（×1.15＋0.35 m），
 * 太空鏡頭最遠 95 m 時最小的站（半徑 1）也有約 45 px 寬，剪影讀得出來。
 */
export function stationHullScale(id: string, radius: number): number {
  return (radius * 1.15 + 0.35) / (SPECS[id] ?? SPECS.nyx).size
}

// ───────── 組裝工具 ─────────

const E = new THREE.Euler()
const Q = new THREE.Quaternion()
const L = new THREE.Matrix4()
const M = new THREE.Matrix4()
const P = new THREE.Vector3()
const S = new THREE.Vector3()
const D = new THREE.Vector3()
const UP = new THREE.Vector3(0, 1, 0)
/** 目前的父座標（傾斜的傳送門、雷達碟等子結構用；預設單位矩陣）*/
const FRAME = new THREE.Matrix4()

/** 放一個零件：位置、旋轉（YXZ：先繞 x 俯仰、再繞 y 轉向）、縮放；套用 FRAME */
function put(
  b: Batcher,
  g: THREE.BufferGeometry,
  m: THREE.Material,
  x: number,
  y: number,
  z: number,
  rx = 0,
  ry = 0,
  rz = 0,
  sx = 1,
  sy = sx,
  sz = sx,
): void {
  E.set(rx, ry, rz, 'YXZ')
  Q.setFromEuler(E)
  L.compose(P.set(x, y, z), Q, S.set(sx, sy, sz))
  M.multiplyMatrices(FRAME, L)
  b.addMatrix(g, m, M)
}

/** 兩點之間的桿件（d = 粗細；round = 圓桿）*/
function strut(
  b: Batcher,
  m: THREE.Material,
  ax: number,
  ay: number,
  az: number,
  bx: number,
  by: number,
  bz: number,
  d: number,
  round = false,
): void {
  D.set(bx - ax, by - ay, bz - az)
  const len = D.length()
  Q.setFromUnitVectors(UP, D.normalize())
  L.compose(P.set((ax + bx) / 2, (ay + by) / 2, (az + bz) / 2), Q, S.set(d, len, d))
  M.multiplyMatrices(FRAME, L)
  b.addMatrix(round ? cyl(0.5, 0.5, 1, 8) : box(1, 1, 1), m, M)
}

/** 在 FRAME 設為 frame 的情況下執行 f（子結構的局部座標）*/
function framed(frame: THREE.Matrix4, f: () => void): void {
  const prev = FRAME.clone()
  FRAME.multiply(frame)
  f()
  FRAME.copy(prev)
}

/** 極座標（a = 從 +z 往 +x 量的角度）：配合 ry = a 時，零件的局部 +z 朝外 */
const px = (r: number, a: number) => r * Math.sin(a)
const pz = (r: number, a: number) => r * Math.cos(a)

const geoCache = new Map<string, THREE.BufferGeometry>()
function cached(k: string, f: () => THREE.BufferGeometry): THREE.BufferGeometry {
  let g = geoCache.get(k)
  if (!g) geoCache.set(k, (g = f()))
  return g
}

/** 上半球（底部開口）*/
const dome = (r: number, ws = 28, hs = 10) =>
  cached(`dome:${r}:${ws}:${hs}`, () => new THREE.SphereGeometry(r, ws, hs, 0, Math.PI * 2, 0, Math.PI / 2))

/** 朝 +y 的圓盤 */
const disc = (r: number, seg = 40) =>
  cached(`disc:${r}:${seg}`, () => new THREE.CircleGeometry(r, seg).rotateX(-Math.PI / 2))

/** 拋物面碟（開口朝上，碟心在原點）：inner = 內面（法線朝碟口），否則為背殼 */
const dish = (R: number, depth: number, inner: boolean) =>
  cached(`dish:${R}:${depth}:${inner}`, () => {
    const pts: THREE.Vector2[] = []
    for (let i = 0; i <= 10; i++) {
      const r = (R * i) / 10
      pts.push(new THREE.Vector2(Math.max(0.001, r), depth * (r / R) ** 2))
    }
    if (inner) pts.reverse()
    return new THREE.LatheGeometry(pts, 40)
  })

/** 平面輪廓（XZ 平面，[x, z]）往上擠出 h 的板塊，底面在 y = 0；uv 依世界尺寸縮放 */
function slab(
  key: string,
  pts: [number, number][],
  h: number,
  bevel = 0.08,
  uvs = 0.45,
): THREE.BufferGeometry {
  return cached(`slab:${key}`, () => {
    const sh = new THREE.Shape(pts.map(([x, z]) => new THREE.Vector2(x, z)))
    const g = new THREE.ExtrudeGeometry(sh, {
      depth: h,
      bevelEnabled: bevel > 0,
      bevelThickness: bevel,
      bevelSize: bevel,
      bevelSegments: 1,
      curveSegments: 4,
    })
    // shape (x, y) → 世界 (x, z)；擠出方向 → -y，再平移讓底面落在 y = 0
    g.rotateX(Math.PI / 2)
    g.translate(0, h, 0)
    const uv = g.attributes.uv
    for (let i = 0; i < uv.count; i++) uv.setXY(i, uv.getX(i) * uvs, uv.getY(i) * uvs)
    return g
  })
}

/** 碎石（低多邊形、依種子扭曲的二十面體，面法線 → 有稜角）；碎片帶、礦石、漂浮岩塊共用 */
export function pebble(seed: number): THREE.BufferGeometry {
  return cached(`pebble:${seed}`, () => {
    const g = new THREE.IcosahedronGeometry(1, 1)
    const pos = g.attributes.position
    const v = new THREE.Vector3()
    for (let i = 0; i < pos.count; i++) {
      v.fromBufferAttribute(pos, i)
      const n =
        Math.sin(v.x * 3.1 + seed * 1.7) * Math.cos(v.y * 2.7 - seed) * Math.sin(v.z * 3.7 + seed * 0.3)
      v.multiplyScalar(1 + n * 0.32).multiply(S.set(1.15, 0.8, 1))
      pos.setXYZ(i, v.x, v.y, v.z)
    }
    g.computeVertexNormals()
    return g
  })
}

function rng(seed: number): () => number {
  let s = seed >>> 0
  return () => {
    s = (s + 0x6d2b79f5) | 0
    let t = Math.imul(s ^ (s >>> 15), 1 | s)
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
}

const hash = (n: number) => {
  const s = Math.sin(n * 127.1 + 311.7) * 43758.5453
  return s - Math.floor(s)
}

type Blink = 'nav' | 'fast' | 'slow' | 'flicker' | 'spark'

interface Kit {
  sp: HullSpec
  b: Batcher
  body: THREE.Group
  hull: THREE.Material
  dark: THREE.Material
  glow: THREE.Material
  acc: THREE.Material
  /** 每幀動畫 */
  anims: ((t: number) => void)[]
  lights: { m: THREE.Mesh; mode: Blink; ph: number }[]
  /** 導航燈的設計尺寸（依縮放反推，讓實際大小約 0.12 m）*/
  ls: number
  subs: [Batcher, THREE.Group][]
  height: number
}

/** 會動的子結構：自己一個 Batcher，建構結束時一起合併 */
function sub(k: Kit, parent: THREE.Object3D = k.body): { g: THREE.Group; b: Batcher } {
  const g = new THREE.Group()
  parent.add(g)
  const b = new Batcher()
  k.subs.push([b, g])
  return { g, b }
}

function light(
  k: Kit,
  x: number,
  y: number,
  z: number,
  color: string,
  mode: Blink = 'nav',
  parent: THREE.Object3D = k.body,
  size = 1,
): void {
  const m = new THREE.Mesh(sphere(1, 8, 6), Mat.emissive(color, 6))
  m.scale.setScalar(k.ls * size)
  m.position.set(x, y, z).applyMatrix4(FRAME)
  parent.add(m)
  k.lights.push({ m, mode, ph: k.lights.length * 2.1 })
}

/** 噴口尾焰（半透明發光錐，朝 -z）：回傳群組，閃動由 anims 處理 */
/** 尾焰用的十字面片：水平一片＋直立一片（長軸 = z），從哪個角度看都是柔和的光暈、不會有錐體的硬邊 */
const hquad = () => cached('hquad', () => new THREE.PlaneGeometry(1, 1).rotateX(-Math.PI / 2))
const vquad = () => cached('vquad', () => new THREE.PlaneGeometry(1, 1).rotateY(Math.PI / 2))

/** 尾焰材質：放射漸層貼圖、加色、不寫深度、雙面；依顏色快取共用（標記 shared，釋放模型時不 dispose）*/
const plumeMats = new Map<string, THREE.MeshBasicMaterial>()
function plumeMat(color: string, k = 2): THREE.MeshBasicMaterial {
  const key = `${color}:${k}`
  let m = plumeMats.get(key)
  if (!m) {
    m = new THREE.MeshBasicMaterial({
      map: decalTex('glow', '#ffffff'),
      color: new THREE.Color(color).multiplyScalar(k),
      transparent: true,
      blending: THREE.AdditiveBlending,
      depthWrite: false,
      side: THREE.DoubleSide,
    })
    m.userData.shared = true
    plumeMats.set(key, m)
  }
  return m
}

/** 噴口尾焰（朝 -z）：[x, y, z, 噴口半徑, 長度]；外焰＋較短較亮的內焰，閃動由 anims 處理 */
function plumes(k: Kit, list: [number, number, number, number, number][], color: string): void {
  const p = sub(k)
  const outer = plumeMat(color, 2.2)
  const inner = plumeMat('#fff0d8', 1.6)
  // 群組原點放在噴口平面，縮放閃動時尾焰根部不會跟著移動
  const z0 = list.reduce((a, e) => a + e[2], 0) / list.length
  p.g.position.z = z0
  for (const [x, y, z, r, len] of list) {
    // 面片中心略在噴口後方：最亮的部分貼著噴口，往後漸淡（前半段藏在船身裡）
    const zc = z - z0 - len * 0.32
    put(p.b, hquad(), outer, x, y, zc, 0, 0, 0, r * 2.6, 1, len)
    put(p.b, vquad(), outer, x, y, zc, 0, 0, 0, 1, r * 2.6, len)
    put(p.b, hquad(), inner, x, y, z - z0 - len * 0.12, 0, 0, 0, r * 1.5, 1, len * 0.45)
    put(p.b, vquad(), inner, x, y, z - z0 - len * 0.12, 0, 0, 0, 1, r * 1.5, len * 0.45)
  }
  k.anims.push((t) => p.g.scale.set(1, 1, 0.85 + Math.sin(t * 23) * 0.06 + Math.sin(t * 37) * 0.05))
}

// ───────── 各站設計 ─────────

/** 女帝號（星區中樞）：大型居住環＋六輻條緩慢旋轉、頂部醫療十字、太陽能翼、對接臂；全站最大、窗燈最多 */
function nyx(k: Kit): void {
  const { b, hull, dark } = k
  const glow = Mat.emissive(k.sp.glow, 3.6)
  const teal = Mat.emissive(k.sp.accent, 3.2)
  const white = Mat.paint('#e3eaef', 0.35)
  const solar = Mat.metal('#1d2a4a', 0.9, false)
  // 中央艙
  put(b, cyl(1.2, 1.2, 3.2, 24), hull, 0, 0, 0)
  put(b, cyl(1.55, 1.2, 0.5, 24), dark, 0, 1.75, 0)
  put(b, cyl(1.2, 1.55, 0.5, 24), dark, 0, -1.75, 0)
  put(b, cyl(0.55, 0.16, 0.8, 16), dark, 0, -2.4, 0)
  put(b, cyl(0.05, 0.05, 1.1, 6), dark, 0, -3.3, 0)
  for (let i = 0; i < 24; i++) {
    const a = (i / 24) * Math.PI * 2
    for (const y of [0.75, 0.15, -0.6])
      put(b, box(0.2, 0.09, 0.04), glow, px(1.215, a), y, pz(1.215, a), 0, a)
  }
  // 頂部白色平台＋青綠醫療十字（俯視第一眼的識別標誌）
  put(b, cyl(1.5, 1.55, 0.16, 32), white, 0, 2.08, 0)
  put(b, box(1.9, 0.08, 0.52), teal, 0, 2.18, 0)
  put(b, box(0.52, 0.08, 1.9), teal, 0, 2.18, 0)
  put(b, torus(1.42, 0.035, 4, 48), teal, 0, 2.17, 0, Math.PI / 2)
  put(b, cyl(0.04, 0.06, 0.7, 6), dark, 1.05, 2.5, -1.05)
  // 居住環（含輻條與模組）以 0.06 rad/s 旋轉，產生重力
  const rotor = sub(k)
  const rb = rotor.b
  put(rb, torus(3.6, 0.42, 12, 72), hull, 0, 0, 0, Math.PI / 2)
  put(rb, torus(3.6, 0.07, 4, 96), glow, 0, 0.4, 0, Math.PI / 2)
  put(rb, torus(4.02, 0.06, 4, 96), glow, 0, 0, 0, Math.PI / 2)
  put(rb, torus(3.18, 0.05, 4, 96), teal, 0, 0, 0, Math.PI / 2)
  for (let i = 0; i < 12; i++) {
    const a = ((i + 0.5) / 12) * Math.PI * 2
    put(
      rb,
      rbox(1.0, 0.64, 0.95, 0.12, 1),
      i % 3 === 0 ? white : hull,
      px(3.6, a),
      0,
      pz(3.6, a),
      0,
      a + Math.PI / 2,
    )
    put(rb, box(0.62, 0.04, 0.18), glow, px(3.6, a), 0.33, pz(3.6, a), 0, a + Math.PI / 2)
  }
  for (let i = 0; i < 6; i++) {
    const a = (i / 6) * Math.PI * 2
    put(rb, box(0.24, 0.24, 2.1), dark, px(2.3, a), 0, pz(2.3, a), 0, a)
    put(rb, box(0.07, 0.05, 1.9), teal, px(2.3, a), 0.14, pz(2.3, a), 0, a)
  }
  k.anims.push((t) => (rotor.g.rotation.y = t * 0.06))
  // 太陽能翼（固定在中央艙下方，從環底下穿出）
  for (const s of [-1, 1]) {
    put(b, box(0.14, 0.14, 4.4), dark, 0, -1.3, s * 2.9)
    put(b, rbox(2.6, 0.05, 1.25, 0.02, 1), solar, 0, -1.3, s * 4.75)
    for (const x of [-0.65, 0, 0.65]) put(b, box(0.04, 0.07, 1.27), dark, x, -1.3, s * 4.75)
    put(b, box(2.66, 0.08, 0.06), dark, 0, -1.3, s * 5.4)
  }
  // 對接臂（環面上方）
  for (const s of [-1, 1]) {
    put(b, box(3.7, 0.42, 0.42), hull, s * 3.2, 1.25, 0)
    put(b, rbox(0.9, 0.9, 0.9, 0.12, 1), dark, s * 5.2, 1.25, 0)
    put(b, torus(0.3, 0.05, 6, 24), teal, s * 5.66, 1.25, 0, 0, Math.PI / 2)
    for (let i = 0; i < 4; i++) put(b, box(0.2, 0.05, 0.44), glow, s * (2.0 + i * 0.75), 1.47, 0)
  }
  light(k, 5.8, 1.25, 0, '#ff3b3b')
  light(k, -5.8, 1.25, 0, '#5cf2a5')
  light(k, 1.05, 2.9, -1.05, '#ffffff', 'slow')
  light(k, 0, -1.3, 5.45, '#ffffff', 'fast', k.body, 0.8)
  light(k, 0, -1.3, -5.45, '#ffffff', 'fast', k.body, 0.8)
  k.height = 2.9
}

/** 裁決者號（通訊感測）：大型拋物面雷達碟（緩慢方位掃描）、一側天線陣列、另一側雷達罩 */
function adjudicatrix(k: Kit): void {
  const { b, hull, dark, acc } = k
  const light2 = Mat.metal('#b7c2cc', 0.45)
  const radome = Mat.paint('#d6dce2', 0.4)
  const amberDim = Mat.emissive('#ffc23d', 1.8)
  // 八角甲板＋下方設備艙
  put(b, cyl(2.0, 2.3, 0.6, 8), hull, 0, 0, 0, 0, Math.PI / 8)
  put(b, cyl(1.3, 0.7, 1.1, 8), dark, 0, -0.85, 0, 0, Math.PI / 8)
  put(b, cyl(0.2, 0.04, 0.9, 6), dark, 0, -1.85, 0)
  put(b, torus(2.02, 0.04, 4, 8), acc, 0, 0.31, 0, Math.PI / 2, Math.PI / 8)
  for (let i = 0; i < 8; i++) {
    const a = (i / 8) * Math.PI * 2 + Math.PI / 4
    put(b, box(0.9, 0.08, 0.05), amberDim, px(2.03, a), -0.05, pz(2.03, a), -0.46, a)
  }
  // 甲板上的兩個小碟
  for (const a of [2.3, 4.0]) {
    framed(
      new THREE.Matrix4().compose(
        new THREE.Vector3(px(1.45, a), 0.35, pz(1.45, a)),
        new THREE.Quaternion().setFromEuler(new THREE.Euler(0.5, a, 0, 'YXZ')),
        new THREE.Vector3(1, 1, 1),
      ),
      () => {
        put(b, cyl(0.06, 0.1, 0.35, 8), dark, 0, 0.17, 0)
        put(b, dish(0.5, 0.16, true), light2, 0, 0.32, 0)
        put(b, dish(0.5, 0.16, false), hull, 0, 0.29, 0)
      },
    )
  }
  // 天線陣列（-x 側）：長橫梁＋高低交錯的八木天線桅杆
  put(b, box(3.4, 0.16, 0.16), dark, -3.6, 0.1, 0)
  put(b, box(2.6, 0.1, 0.1), dark, -4.0, 0.1, 0.55)
  put(b, box(2.6, 0.1, 0.1), dark, -4.0, 0.1, -0.55)
  for (let i = 0; i < 6; i++) {
    const x = -2.95 - i * 0.44
    const h = i % 2 ? 1.5 : 2.2
    for (const z of i % 2 ? [0.55, -0.55] : [0]) {
      put(b, cyl(0.035, 0.05, h, 6), dark, x, 0.1 + h / 2, z)
      for (const f of [0.55, 0.75, 0.95]) put(b, box(0.04, 0.04, 0.7 * (1.1 - f)), hull, x, 0.1 + h * f, z)
      put(b, sphere(0.07, 6, 4), acc, x, 0.12 + h, z)
    }
  }
  // 雷達罩（+x 側）
  put(b, box(1.8, 0.2, 0.2), dark, 2.9, 0.1, 0)
  put(b, cyl(0.22, 0.32, 0.8, 10), hull, 3.55, 0.4, 0)
  put(b, sphere(0.68, 22, 14), radome, 3.55, 1.18, 0)
  put(b, torus(0.67, 0.04, 4, 32), acc, 3.55, 1.04, 0, Math.PI / 2)
  // 大雷達碟（以 0.3 rad/s 方位掃描）
  const rad = sub(k)
  const r = rad.b
  put(r, cyl(0.5, 0.65, 0.45, 16), dark, 0, 0.52, 0)
  put(r, cyl(0.18, 0.24, 1.0, 10), hull, 0, 1.15, 0)
  for (const s of [-1, 1]) put(r, box(0.14, 0.7, 0.34), dark, s * 0.38, 1.6, 0)
  const tilt = 0.62
  framed(
    new THREE.Matrix4().compose(
      new THREE.Vector3(0, 1.75, 0),
      new THREE.Quaternion().setFromEuler(new THREE.Euler(tilt, 0, 0)),
      new THREE.Vector3(1, 1, 1),
    ),
    () => {
      const R = 2.4
      const d = 0.66
      const yOf = (rr: number) => d * (rr / R) ** 2
      put(r, dish(R, d, true), light2, 0, 0, 0)
      put(r, dish(R, d, false), hull, 0, -0.07, 0)
      put(r, torus(R, 0.08, 6, 64), dark, 0, d - 0.02, 0, Math.PI / 2)
      for (const rr of [0.95, 1.7]) put(r, torus(rr, 0.03, 4, 48), dark, 0, yOf(rr) + 0.015, 0, Math.PI / 2)
      for (let i = 0; i < 8; i++) {
        const a = (i / 8) * Math.PI * 2
        const pts = [0.45, 1.4, 2.35]
        for (let j = 0; j < 2; j++)
          strut(
            r,
            dark,
            px(pts[j], a),
            yOf(pts[j]) + 0.03,
            pz(pts[j], a),
            px(pts[j + 1], a),
            yOf(pts[j + 1]) + 0.03,
            pz(pts[j + 1], a),
            0.05,
          )
      }
      // 饋源三腳架＋琥珀色饋源
      for (let i = 0; i < 3; i++) {
        const a = (i / 3) * Math.PI * 2 + 0.5
        strut(r, dark, px(2.28, a), yOf(2.28), pz(2.28, a), 0, 1.55, 0, 0.06, true)
      }
      put(r, cyl(0.12, 0.24, 0.42, 12), dark, 0, 1.6, 0)
      put(r, sphere(0.13, 10, 8), acc, 0, 1.38, 0)
      light(k, 0, 1.9, 0, '#ffc23d', 'fast', rad.g, 1.3)
    },
  )
  k.anims.push((t) => (rad.g.rotation.y = t * 0.3))
  light(k, -5.35, 0.1, 0, '#ff3b3b')
  light(k, 4.28, 1.18, 0, '#5cf2a5')
  k.height = 3.2
}

/** 天守砲台（軍事砲台）：層層收窄的六角堡壘（橘色邊線）、六角稜堡＋副砲、一根很長的主砲管（能量脈衝沿管奔向砲口）*/
function tenshu(k: Kit): void {
  const { b, hull, dark } = k
  const orange = Mat.emissive('#ff7a2a', 3)
  const conduit = Mat.emissive('#ff7a2a', 1.7)
  const plate = Mat.metal('#4a4d55', 0.7)
  const H = Math.PI / 6
  // 層疊的六角堡（cyl 6 邊 + ry = π/6 → 平邊朝船頭；六角 torus 的頂點剛好對齊）
  put(b, cyl(3.0, 2.2, 0.6, 6), dark, 0, -1.0, 0, 0, H)
  put(b, cyl(2.6, 3.0, 0.7, 6), hull, 0, -0.35, 0, 0, H)
  const tiers: [number, number, number, THREE.Material][] = [
    [2.0, 2.4, 0.35, plate],
    [1.3, 1.7, 1.05, hull],
  ]
  for (const [rt, rbt, y, m] of tiers) put(b, cyl(rt, rbt, 0.7, 6), m, 0, y, 0, 0, H)
  // 屋簷（每層頂緣外伸的斜板）＋橘色邊線
  for (const [r, y] of [
    [2.6, 0.0],
    [2.0, 0.7],
    [1.3, 1.4],
  ]) {
    put(b, cyl(r + 0.12, r + 0.42, 0.12, 6), dark, 0, y + 0.02, 0, 0, H)
    put(b, torus(r + 0.42, 0.05, 4, 6), orange, 0, y - 0.04, 0, Math.PI / 2)
  }
  put(b, cyl(0.9, 1.3, 0.25, 6), dark, 0, 1.55, 0, 0, H)
  // 正面三層的能量導管（直條）
  for (const [r, y, h] of [
    [2.72, -0.35, 0.5],
    [2.12, 0.35, 0.5],
    [1.42, 1.05, 0.5],
  ]) {
    for (const a of [-Math.PI / 3, 0, Math.PI / 3])
      put(
        b,
        box(0.08, h, 0.05),
        conduit,
        px(r * Math.cos(H) + 0.03, a),
        y,
        pz(r * Math.cos(H) + 0.03, a),
        -0.46,
        a,
      )
  }
  // 堡身裝甲板：每一面兩片淺色板（打破純黑的大面），中間夾著導管
  for (const [r, y, w, off] of [
    [2.8, -0.35, 1.0, 0.68],
    [2.2, 0.35, 0.72, 0.5],
    [1.5, 1.05, 0.46, 0.34],
  ]) {
    for (let f = 0; f < 6; f++) {
      const a = (f / 6) * Math.PI * 2
      const ap = r * Math.cos(H) + 0.02
      for (const s of [-1, 1])
        put(b, box(w, 0.44, 0.05), plate, px(ap, a) + Math.cos(a) * s * off, y, pz(ap, a) - Math.sin(a) * s * off, -0.46, a)
    }
  }
  // 六角稜堡＋雙管副砲（朝外）
  for (let i = 0; i < 6; i++) {
    const a = H + (i / 6) * Math.PI * 2
    const x = px(3.0, a)
    const z = pz(3.0, a)
    put(b, cyl(0.42, 0.56, 0.95, 6), plate, x, -0.45, z, 0, H)
    put(b, torus(0.42, 0.035, 4, 6), orange, x, 0.03, z, Math.PI / 2)
    if (i === 0 || i === 5) continue // 正前方兩座讓出主砲射界
    put(b, rbox(0.5, 0.26, 0.55, 0.06, 1), dark, x, 0.16, z, 0, a)
    for (const s of [-0.1, 0.1])
      put(
        b,
        cyl(0.04, 0.04, 0.8, 6),
        dark,
        x + px(0.5, a) + Math.cos(a) * s,
        0.18,
        z + pz(0.5, a) - Math.sin(a) * s,
        Math.PI / 2,
        a,
      )
  }
  // 後方散熱鰭
  for (let i = 0; i < 5; i++) put(b, box(0.07, 0.6, 0.9), plate, -0.8 + i * 0.4, 0.15, -2.75)
  // 主砲塔＋長砲管（往 +z 伸出，砲口在 z = 7.4）
  put(b, rbox(1.4, 0.62, 1.8, 0.14, 1), dark, 0, 1.98, 0)
  put(b, rbox(0.86, 0.5, 0.45, 0.08, 1), plate, 0, 1.98, 1.05)
  put(b, cyl(0.2, 0.27, 6.2, 16), dark, 0, 1.98, 4.3, Math.PI / 2)
  for (const z of [1.65, 2.45, 3.25]) put(b, cyl(0.31, 0.31, 0.5, 16), plate, 0, 1.98, z, Math.PI / 2)
  put(b, rbox(0.62, 0.38, 0.75, 0.08, 1), plate, 0, 1.98, 7.3)
  put(b, cyl(0.13, 0.13, 0.04, 14), orange, 0, 1.98, 7.69, Math.PI / 2)
  for (const s of [-1, 1]) put(b, box(0.05, 0.05, 5.4), conduit, s * 0.235, 2.0, 4.6)
  put(b, box(1.0, 0.05, 0.08), orange, 0, 2.3, 0.6)
  // 砲塔頂的測距儀＋駐退筒
  put(b, rbox(0.5, 0.22, 0.4, 0.05, 1), plate, 0.35, 2.4, -0.4)
  for (const s of [-1, 1]) put(b, box(0.7, 0.05, 0.06), dark, 0.35, 2.52, -0.4 + s * 0.12)
  for (const s of [-1, 1]) put(b, cyl(0.07, 0.07, 1.2, 8), plate, s * 0.36, 1.82, 1.85, Math.PI / 2)
  // 能量脈衝：一圈亮環從砲尾奔向砲口
  const pulse = new THREE.Mesh(torus(0.32, 0.07, 6, 20), Mat.emissive('#ffb070', 5))
  pulse.position.set(0, 1.98, 1.6)
  k.body.add(pulse)
  k.anims.push((t) => {
    const f = (t * 0.7) % 1
    pulse.position.z = 1.6 + f * 5.6
    pulse.scale.setScalar(0.9 + f * 0.35)
    pulse.visible = f < 0.97
  })
  light(k, -3.3, 0.05, 0, '#ff3b3b')
  light(k, 3.3, 0.05, 0, '#5cf2a5')
  light(k, 0, 2.35, 7.3, '#ff7a2a', 'fast')
  k.height = 2.4
}

/** 七號廢站（廢棄殘骸）：整體傾斜、斷成兩截的環、斷輻條、缺板的太陽能翼、裂口餘火、漂浮碎片帶、壞掉的閃燈 */
function hulk7(k: Kit): void {
  const { b, hull: rust } = k
  const R = rng(7)
  k.body.rotation.set(0.3, 0, -0.2)
  const rust2 = Mat.metal('#6e4a30', 0.5)
  const scrape = Mat.metal('#9a7a58', 0.55)
  const fire = Mat.emissive('#ff8a3a', 3.2)
  const char = Mat.metal('#1c1816', 0.35)
  const ember = Mat.emissive('#ff6a2a', 2.4)
  const dim = Mat.emissive('#ffb46b', 1.5)
  const solar = Mat.metal('#1d2a4a', 0.9, false)
  // 中央艙：頂部撕裂、側面破口
  put(b, cyl(1.0, 1.0, 2.4, 16), rust, 0, 0, 0)
  put(b, cyl(1.3, 1.0, 0.45, 16), char, 0, -1.4, 0)
  put(b, cyl(0.92, 1.0, 0.25, 16), char, 0, 1.3, 0)
  for (let i = 0; i < 8; i++) {
    const a = i * 0.8 + R() * 0.4
    put(
      b,
      box(0.4, 0.35 + R() * 0.55, 0.06),
      R() > 0.5 ? rust2 : char,
      px(0.93, a),
      1.55,
      pz(0.93, a),
      0.25 + R() * 0.5,
      a,
      (R() - 0.5) * 0.6,
    )
  }
  put(b, box(0.5, 0.62, 0.08), ember, px(0.99, 1.2), 0.15, pz(0.99, 1.2), 0, 1.2)
  for (const [dx, dy, w, h] of [
    [0, 0.38, 0.75, 0.14],
    [0, -0.08, 0.7, 0.12],
    [-0.3, 0.15, 0.12, 0.55],
    [0.32, 0.15, 0.14, 0.6],
  ]) {
    const a = 1.2 + dx / 1.0
    put(b, box(w, h, 0.1), char, px(1.02, a), 0.15 + dy, pz(1.02, a), 0, a, (R() - 0.5) * 0.4)
  }
  for (let i = 0; i < 18; i++) {
    if (R() < 0.62) continue
    const a = (i / 18) * Math.PI * 2
    if (Math.abs(a - 1.2) < 0.5) continue
    put(b, box(0.2, 0.08, 0.04), dim, px(1.015, a), 0.6, pz(1.015, a), 0, a)
  }
  // 斷環：主弧涵蓋 a ∈ [-1.93, 1.97]（torus 的 u → a = π/2 - u + ry）
  const RR = 3.1
  put(b, torus(RR, 0.3, 10, 44, 3.9), rust, 0, 0, 0, Math.PI / 2, 0.4)
  for (const a of [1.97, -1.93]) {
    put(b, sphere(0.31, 8, 6), char, px(RR, a), 0, pz(RR, a), 0, a, 0, 1, 1, 0.55)
    for (let j = 0; j < 3; j++)
      put(
        b,
        box(0.08, 0.3, 0.5),
        rust2,
        px(RR, a) + (R() - 0.5) * 0.3,
        (R() - 0.5) * 0.3,
        pz(RR, a) + (R() - 0.5) * 0.3,
        R() * 2,
        R() * 3,
        R(),
      )
  }
  for (let i = 0; i < 12; i++) {
    const a = -1.75 + (i / 12) * 3.6
    const m = i % 4 === 1 ? scrape : i % 3 ? rust2 : char
    if (R() < 0.6) put(b, box(0.42, 0.2, 0.62), m, px(RR, a), 0.22, pz(RR, a), 0, a + Math.PI / 2, (R() - 0.5) * 0.3)
  }
  // 斷口還在燒：環的兩個斷端各一團餘火
  for (const a of [1.97, -1.93]) put(b, sphere(0.2, 8, 6), fire, px(RR - 0.05, a), 0.05, pz(RR - 0.05, a), 0, 0, 0, 1, 0.7, 1)
  // 輻條：完整、斷半截、只剩殘根、彎折
  put(b, box(0.2, 0.2, 2.1), rust, px(2.05, 0), 0, pz(2.05, 0), 0, 0)
  put(b, box(0.2, 0.2, 0.9), rust, px(1.45, -1.2), 0, pz(1.45, -1.2), 0, -1.2)
  put(b, box(0.26, 0.26, 0.12), char, px(1.92, -1.2), 0, pz(1.92, -1.2), 0.4, -1.2, 0.3)
  put(b, box(0.2, 0.2, 0.4), char, px(1.2, 3.1), 0, pz(1.2, 3.1), 0, 3.1)
  put(b, box(0.2, 0.2, 1.1), rust, px(1.55, 1.5), 0, pz(1.55, 1.5), 0, 1.5)
  strut(b, rust2, px(2.1, 1.5), 0, pz(2.1, 1.5), px(3.0, 1.62), -0.55, pz(3.0, 1.62), 0.18)
  // 太陽能翼：一側只剩一片歪斜的板＋空框，另一側斷成殘根掛著半片
  put(b, box(3.0, 0.12, 0.12), char, 2.4, -1.0, 0)
  put(b, rbox(1.5, 0.05, 1.2, 0.02, 1), solar, 4.4, -1.0, 0, 0.55, 0, 0.1)
  for (const z of [-0.6, 0.6]) put(b, box(1.0, 0.06, 0.06), char, 5.65, -1.0, z, 0, 0, 0.08)
  put(b, box(0.06, 0.06, 1.2), char, 6.12, -0.96, 0)
  put(b, box(1.4, 0.12, 0.12), char, -1.6, -1.0, 0)
  put(b, rbox(0.7, 0.05, 1.1, 0.02, 1), solar, -2.55, -1.35, 0.25, 0.2, 0.3, 1.0)
  // 漂浮碎片帶（多半在斷口附近）＋斷掉的一截環，緩慢漂移旋轉
  const deb = sub(k)
  put(
    deb.b,
    torus(RR, 0.3, 10, 12, 0.85),
    rust,
    px(0.5, 3.2),
    -0.45,
    pz(0.5, 3.2),
    Math.PI / 2 + 0.25,
    2.1,
    0.2,
  )
  for (let i = 0; i < 22; i++) {
    const a = i < 15 ? 2.0 + R() * 2.3 : R() * Math.PI * 2
    const r = 3.3 + R() * 2.0
    const x = px(r, a)
    const z = pz(r, a)
    const y = (R() - 0.5) * 2.2
    const kind = R()
    const m = [rust, rust2, char, solar][Math.floor(R() * 4)]
    if (kind < 0.35)
      put(deb.b, box(0.3 + R() * 0.6, 0.05, 0.2 + R() * 0.4), m, x, y, z, R() * 3, R() * 3, R() * 3)
    else if (kind < 0.6) put(deb.b, box(0.1, 0.1, 0.5 + R() * 0.9), m, x, y, z, R() * 3, R() * 3, R() * 3)
    else if (kind < 0.85)
      put(
        deb.b,
        rbox(0.3 + R() * 0.3, 0.2 + R() * 0.2, 0.3 + R() * 0.3, 0.04, 1),
        m,
        x,
        y,
        z,
        R() * 3,
        R() * 3,
        R() * 3,
      )
    else put(deb.b, pebble(i % 4), char, x, y, z, R() * 3, R() * 3, 0, 0.12 + R() * 0.15)
  }
  k.anims.push((t) => {
    deb.g.rotation.y = t * 0.035
    deb.g.position.y = Math.sin(t * 0.4) * 0.1
    k.body.rotation.x = 0.3 + Math.sin(t * 0.07) * 0.06
  })
  // 壞掉的燈：餘火閃爍、火花、不規則的紅色警示
  light(k, px(1.05, 1.2), 0.15, pz(1.05, 1.2), '#ff8a3a', 'flicker', k.body, 1.6)
  light(k, px(RR, 1.97), 0.25, pz(RR, 1.97), '#bfe6ff', 'spark', k.body, 1.2)
  light(k, px(RR, -1.93), -0.2, pz(RR, -1.93), '#bfe6ff', 'spark', k.body, 1)
  light(k, 0, 1.75, 0, '#ff3b3b', 'flicker')
  k.height = 2.2
}

/** 豪勇號（戰艦）：修長的楔形艦身、三座三聯裝主砲、艦橋塔、三具主引擎尾焰、紅色戰備燈 */
function bravado(k: Kit): void {
  const { b, hull, dark } = k
  const red = Mat.emissive('#ff3b3b', 2.6)
  const redDim = Mat.emissive('#ff4a3a', 1.6)
  const plate = Mat.metal('#5c636c', 0.7)
  const gun = Mat.metal('#7a828c', 0.65)
  const hw: [number, number][] = [
    [4.7, 0],
    [3.6, 0.55],
    [2.2, 1.05],
    [0.6, 1.3],
    [-1.6, 1.35],
    [-3.4, 1.2],
    [-4.2, 1.0],
  ]
  const outline = (k2: number, zk = 1): [number, number][] => [
    ...hw.map(([z, w]): [number, number] => [w * k2, z * zk]),
    ...[...hw].reverse().map(([z, w]): [number, number] => [-w * k2, z * zk]),
  ]
  put(b, slab('bravado.hull', outline(1), 0.75, 0.12), hull, 0, -0.45, 0)
  put(b, slab('bravado.keel', outline(0.62, 0.9), 0.4, 0.08), dark, 0, -0.85, 0)
  put(b, slab('bravado.deck', outline(0.7, 0.8), 0.3, 0.06), plate, 0, 0.42, -0.2)
  const halfW = (z: number) => {
    for (let i = 0; i < hw.length - 1; i++) {
      const [z0, w0] = hw[i]
      const [z1, w1] = hw[i + 1]
      if (z <= z0 && z >= z1) return w0 + ((w1 - w0) * (z - z0)) / (z1 - z0)
    }
    return 1
  }
  // 側舷紅色戰備燈＋裝甲帶
  for (const s of [-1, 1]) {
    for (let z = 2.4; z > -3.8; z -= 0.75)
      put(
        b,
        box(0.05, 0.08, 0.42),
        redDim,
        s * (halfW(z) + 0.13),
        0.0,
        z,
        0,
        s * Math.atan2(halfW(z + 0.4) - halfW(z - 0.4), 0.8),
      )
    put(b, box(0.1, 0.22, 3.6), dark, s * 1.42, -0.3, -1.2)
  }
  put(b, box(0.08, 0.03, 2.0), red, 0, 0.76, 2.7)
  // 艦橋塔
  put(b, rbox(1.45, 0.55, 2.2, 0.1, 1), hull, 0, 0.98, -1.1)
  put(b, rbox(1.0, 0.5, 1.3, 0.1, 1), plate, 0, 1.5, -1.3)
  put(b, rbox(1.6, 0.32, 0.72, 0.08, 1), hull, 0, 1.9, -1.0)
  put(b, box(1.4, 0.1, 0.04), red, 0, 1.93, -0.63)
  for (const s of [-1, 1]) put(b, box(0.04, 0.1, 0.5), red, s * 0.81, 1.93, -1.0)
  put(b, cyl(0.045, 0.065, 1.0, 6), dark, 0, 2.5, -1.25)
  put(b, box(0.9, 0.04, 0.05), dark, 0, 2.7, -1.25)
  put(b, box(0.55, 0.09, 0.14), plate, 0, 2.92, -1.25)
  put(b, rbox(0.65, 0.75, 0.9, 0.1, 1), dark, 0, 1.15, -2.45)
  // 三聯裝主砲：前兩座（後座墊高、越頂射擊）、後一座朝後
  const turret = (z: number, y: number, ry: number) => {
    put(b, cyl(0.42, 0.47, 0.22, 14), dark, 0, y - 0.18, z)
    put(b, rbox(0.75, 0.3, 0.88, 0.1, 1), gun, 0, y, z, 0, ry)
    put(b, box(0.5, 0.04, 0.3), dark, 0, y + 0.16, z - 0.15 * Math.cos(ry), 0, ry)
    for (const x of [-0.2, 0, 0.2]) {
      const lz = 1.05
      put(
        b,
        cyl(0.045, 0.055, 1.3, 8),
        dark,
        x * Math.cos(ry) + lz * Math.sin(ry),
        y + 0.02,
        z - x * Math.sin(ry) + lz * Math.cos(ry),
        Math.PI / 2,
        ry,
      )
    }
  }
  turret(2.45, 0.68, 0)
  turret(1.2, 0.98, 0)
  put(b, cyl(0.45, 0.5, 0.3, 14), dark, 0, 0.72, 1.2)
  turret(-3.15, 0.68, Math.PI)
  // 副砲（兩舷朝外）
  for (const s of [-1, 1]) {
    for (const z of [0.4, -0.7, -1.8]) {
      put(b, rbox(0.4, 0.22, 0.42, 0.05, 1), plate, s * 1.25, 0.42, z)
      for (const dz of [-0.07, 0.07])
        put(b, cyl(0.03, 0.03, 0.6, 6), dark, s * 1.6, 0.44, z + dz, Math.PI / 2, (s * Math.PI) / 2)
    }
  }
  // 主引擎
  for (const x of [-0.7, 0, 0.7]) {
    put(b, cyl(0.3, 0.38, 0.62, 16), dark, x, -0.08, -4.45, Math.PI / 2)
    put(b, cyl(0.3, 0.3, 0.04, 16), Mat.emissive('#ff6a3a', 4.5), x, -0.08, -4.77, Math.PI / 2)
  }
  plumes(
    k,
    [
      [-0.7, -0.08, -4.78, 0.26, 1.5],
      [0, -0.08, -4.78, 0.26, 1.7],
      [0.7, -0.08, -4.78, 0.26, 1.5],
    ],
    '#ff6a4a',
  )
  light(k, -1.5, 0.05, 0.6, '#ff3b3b')
  light(k, 1.5, 0.05, 0.6, '#5cf2a5')
  light(k, 0, 3.05, -1.25, '#ffffff', 'slow')
  light(k, 0, 0.35, 4.75, '#ff3b3b', 'fast', k.body, 0.8)
  k.height = 3.0
}

/** 火口號（採礦工程艦）：工業黃骨架、頂部敞口熔爐（橘紅熔湯）、兩支機械臂夾著礦石、礦石輸送帶、礦斗、散熱鰭 */
function caldera(k: Kit): void {
  const { b, hull, dark } = k
  const yellow = Mat.paint('#d9a520', 0.5)
  const black = Mat.paint('#1d1d1d', 0.6)
  const molten = Mat.emissive('#ff6a1a', 4)
  const furnace = Mat.emissive(k.sp.glow, 2.6)
  const rock = Mat.rock('#6a5c50')
  const ore = Mat.emissive('#ffa040', 3)
  const fin = Mat.metal('#3a3530', 0.6)
  const R = rng(5)
  // 骨架
  put(b, rbox(1.7, 0.9, 4.2, 0.15, 1), hull, 0, 0, -0.2)
  put(b, rbox(1.2, 0.5, 3.6, 0.1, 1), dark, 0, -0.6, -0.3)
  // 警示斜紋（黃黑相間）
  for (let i = 0; i < 7; i++) {
    put(b, box(0.24, 0.04, 0.3), i % 2 ? black : yellow, -0.72 + i * 0.24, 0.47, 1.65)
    put(b, box(0.24, 0.04, 0.22), i % 2 ? yellow : black, -0.72 + i * 0.24, 0.47, -2.05)
  }
  // 熔爐（頂部敞口，俯視是一圈亮橘）＋煙囪
  put(b, cyl(1.05, 1.22, 1.1, 24, true), dark, 0, 0.95, -0.7)
  put(b, torus(0.98, 0.13, 8, 36), hull, 0, 1.5, -0.7, Math.PI / 2)
  put(b, cyl(1.0, 1.0, 0.06, 28), molten, 0, 1.42, -0.7)
  put(b, cyl(1.18, 1.18, 0.06, 24), dark, 0, 0.42, -0.7)
  for (let i = 0; i < 10; i++) {
    const a = (i / 10) * Math.PI * 2
    put(b, box(0.12, 0.5, 0.05), furnace, px(1.15, a), 0.85, -0.7 + pz(1.15, a), -0.08, a)
  }
  for (let i = 0; i < 4; i++) {
    const a = (i / 4) * Math.PI * 2 + 0.4
    strut(b, yellow, px(1.1, a), 0.45, -0.7 + pz(1.1, a), px(1.32, a), 1.25, -0.7 + pz(1.32, a), 0.09)
  }
  put(b, cyl(0.22, 0.28, 1.4, 10), dark, 0.85, 1.25, -1.9)
  put(b, torus(0.22, 0.045, 6, 16), furnace, 0.85, 1.96, -1.9, Math.PI / 2)
  // 兩支機械臂：肩 → 肘 → 腕，爪子夾著一顆發光礦石
  put(b, pebble(3), rock, 0, 0.25, 4.15, 0.3, 0.7, 0, 0.62, 0.55, 0.6)
  for (let i = 0; i < 6; i++)
    put(
      b,
      box(0.12, 0.1, 0.1),
      ore,
      (R() - 0.5) * 0.8,
      0.25 + (R() - 0.5) * 0.5,
      4.15 + (R() - 0.5) * 0.7,
      R() * 3,
      R() * 3,
    )
  for (const s of [-1, 1]) {
    const sh = [s * 0.62, 0.35, 1.95] as const
    const el = [s * 1.3, 0.85, 2.95] as const
    const wr = [s * 0.8, 0.35, 3.75] as const
    put(b, sphere(0.22, 10, 8), dark, ...sh)
    strut(b, yellow, ...sh, ...el, 0.24)
    strut(b, dark, sh[0] + s * 0.12, sh[1] - 0.15, sh[2], el[0], el[1] - 0.15, el[2] - 0.15, 0.07, true)
    put(b, sphere(0.18, 10, 8), dark, ...el)
    strut(b, yellow, ...el, ...wr, 0.2)
    put(b, rbox(0.3, 0.3, 0.3, 0.05, 1), dark, ...wr)
    for (const [dy, dz] of [
      [0.2, 0.5],
      [-0.2, 0.5],
    ])
      strut(b, dark, wr[0], wr[1], wr[2], wr[0] - s * 0.35, wr[1] + dy, wr[2] + dz, 0.07)
  }
  for (const s of [-1, 1]) put(b, box(0.22, 0.12, 0.06), Mat.emissive('#fff4d6', 3), s * 0.6, 0.38, 1.93)
  // 輸送帶：左舷由前方礦斗斜向爬上熔爐口
  const a0 = new THREE.Vector3(-1.15, 0.35, 2.1)
  const a1 = new THREE.Vector3(-1.15, 1.35, -0.4)
  for (const dx of [-0.24, 0.24])
    strut(b, dark, a0.x + dx, a0.y + 0.08, a0.z, a1.x + dx, a1.y + 0.08, a1.z, 0.06)
  strut(b, black, a0.x, a0.y, a0.z, a1.x, a1.y, a1.z, 0.42)
  for (const f of [0.15, 0.5, 0.85]) {
    const p = a0.clone().lerp(a1, f)
    strut(b, yellow, p.x, p.y, p.z, -0.85, 0.3, p.z, 0.08)
  }
  put(b, cyl(0.55, 0.32, 0.5, 8), yellow, a0.x, a0.y + 0.15, a0.z + 0.2)
  put(b, rbox(0.55, 0.4, 0.55, 0.06, 1), dark, a1.x + 0.15, a1.y + 0.1, a1.z - 0.15)
  strut(b, dark, a1.x + 0.2, a1.y + 0.1, a1.z - 0.2, -0.55, 1.6, -0.55, 0.22)
  const belt = sub(k)
  const dir = a1.clone().sub(a0)
  const len = dir.length()
  dir.normalize()
  const n = 7
  const gap = len / n
  for (let i = 0; i < n; i++) {
    const p = a0.clone().addScaledVector(dir, gap * (i + 0.5))
    put(belt.b, pebble(i % 4), i % 3 ? rock : ore, p.x, p.y + 0.12, p.z, R() * 3, R() * 3, 0, 0.13, 0.1, 0.13)
  }
  k.anims.push((t) => belt.g.position.copy(dir).multiplyScalar(((t * 0.3) % gap) - gap * 0.5))
  // 右舷礦斗（裝滿礦石）
  for (const z of [0.95, 0.1, -0.75]) {
    put(b, rbox(0.72, 0.42, 0.72, 0.05, 1), dark, 1.12, 0.32, z)
    for (let i = 0; i < 4; i++)
      put(
        b,
        pebble(i),
        i === 0 ? ore : rock,
        1.12 + (R() - 0.5) * 0.4,
        0.55,
        z + (R() - 0.5) * 0.4,
        R() * 3,
        R() * 3,
        0,
        0.14,
      )
  }
  // 散熱鰭（後段兩側外伸，熱的地方發橘光）
  for (const s of [-1, 1]) {
    put(b, box(1.3, 0.05, 1.1), fin, s * 1.5, 0.15, -1.55, 0, 0, s * 0.12)
    for (const z of [-1.2, -1.55, -1.9])
      put(b, box(1.1, 0.06, 0.05), furnace, s * 1.5, 0.15 + 0.01, z, 0, 0, s * 0.12)
  }
  // 引擎
  for (const s of [-1, 1]) {
    put(b, rbox(0.5, 0.5, 0.5, 0.06, 1), dark, s * 0.5, 0, -2.45)
    put(b, box(0.36, 0.36, 0.04), furnace, s * 0.5, 0, -2.71)
  }
  plumes(
    k,
    [
      [-0.5, 0, -2.72, 0.2, 1.0],
      [0.5, 0, -2.72, 0.2, 1.0],
    ],
    '#ffa040',
  )
  light(k, -2.15, 0.25, -1.55, '#ff3b3b')
  light(k, 2.15, 0.25, -1.55, '#5cf2a5')
  light(k, 0.35, 0.58, 1.3, '#ffc23d', 'fast', k.body, 1.2)
  k.height = 2.0
}

/** 活體庫號（標本收容）：中央大玻璃溫室（植物＋發光地面）、五個衛星圓頂（溫室與發光收容泡交錯）、連接管、對接艙 */
function vivarium(k: Kit): void {
  const { b, hull, dark, acc } = k
  const glass = Mat.glass('#a8ffd8', 0.24)
  const floor = Mat.emissive('#3cc77f', 1.2)
  const plant = Mat.organic('#2f6a3a', '#5cf2a5', 0.6)
  const spec = Mat.organic('#3a2a4a', '#7dff9a', 0.8)
  const bubbleA = Mat.liquid('#5cf2a5')
  const bubbleB = Mat.liquid('#3ad6c0')
  const R = rng(11)
  const CR = 1.5
  // 中央平台＋大溫室
  put(b, cyl(CR + 0.25, CR + 0.4, 0.45, 36), hull, 0, -0.2, 0)
  put(b, cyl(1.2, 0.8, 0.7, 12), dark, 0, -0.75, 0)
  put(b, torus(CR + 0.3, 0.05, 3, 48), acc, 0, 0.03, 0, Math.PI / 2)
  put(b, cyl(CR - 0.05, CR - 0.05, 0.04, 36), floor, 0, 0.04, 0)
  put(b, dome(CR, 32, 12), glass, 0, 0.03, 0)
  put(b, torus(CR + 0.02, 0.08, 6, 48), hull, 0, 0.05, 0, Math.PI / 2)
  for (let i = 0; i < 6; i++)
    put(b, torus(CR + 0.01, 0.035, 3, 20, Math.PI), dark, 0, 0.03, 0, 0, (i / 6) * Math.PI)
  put(b, torus(1.05, 0.03, 4, 36), dark, 0, 0.03 + Math.sqrt((CR + 0.01) ** 2 - 1.05 ** 2), 0, Math.PI / 2)
  // 溫室內：中央巨型標本植物＋矮叢
  put(b, cyl(0.1, 0.2, 0.9, 8), plant, 0, 0.45, 0)
  put(b, sphere(0.48, 14, 10), plant, 0, 0.95, 0, 0, 0, 0, 1, 0.7, 1)
  for (let i = 0; i < 9; i++) {
    const a = (i / 9) * Math.PI * 2 + R()
    const r = 0.6 + R() * 0.55
    put(
      b,
      sphere(0.2 + R() * 0.12, 8, 6),
      i % 3 ? plant : spec,
      px(r, a),
      0.14,
      pz(r, a),
      0,
      0,
      0,
      1,
      0.75 + R() * 0.4,
      1,
    )
  }
  // 衛星圓頂（j = 3 的位置留給對接艙）；圓頂之間留空隙、以連接管相連
  const sizes = [0.92, 0.72, 0.86, 0, 0.8, 0.7]
  for (let j = 0; j < 6; j++) {
    const a = (j / 6) * Math.PI * 2
    const rd = sizes[j]
    if (!rd) continue
    const rr = CR + 0.95 + rd
    const x = px(rr, a)
    const z = pz(rr, a)
    put(b, cyl(rd + 0.12, rd + 0.2, 0.35, 28), hull, x, -0.18, z)
    put(b, torus(rd + 0.04, 0.06, 4, 28), hull, x, 0.02, z, Math.PI / 2)
    const t0 = CR + 0.3
    const t1 = rr - rd - 0.1
    put(
      b,
      cyl(0.17, 0.17, t1 - t0, 10),
      hull,
      px((t0 + t1) / 2, a),
      -0.05,
      pz((t0 + t1) / 2, a),
      Math.PI / 2,
      a,
    )
    for (const f of [0.5])
      put(b, torus(0.19, 0.03, 4, 12), acc, px(t0 + (t1 - t0) * f, a), -0.05, pz(t0 + (t1 - t0) * f, a), 0, a)
    if (j % 2 === 0) {
      // 玻璃溫室
      put(b, cyl(rd - 0.04, rd - 0.04, 0.04, 28), floor, x, 0.03, z)
      put(b, dome(rd, 24, 9), glass, x, 0.02, z)
      for (let i = 0; i < 4; i++)
        put(b, torus(rd + 0.01, 0.03, 3, 12, Math.PI), dark, x, 0.02, z, 0, (i / 4) * Math.PI)
      for (let i = 0; i < 4; i++)
        put(
          b,
          sphere(0.15 + R() * 0.1, 6, 5),
          plant,
          x + (R() - 0.5) * rd,
          0.1,
          z + (R() - 0.5) * rd,
          0,
          0,
          0,
          1,
          0.8,
          1,
        )
    } else {
      // 發光收容泡：半透明液體圓頂，裡面浮著一團標本的影子
      put(b, dome(rd * 0.96, 24, 9), j === 1 ? bubbleA : bubbleB, x, 0.02, z)
      put(b, sphere(rd * 0.42, 12, 10), spec, x, rd * 0.35, z, R(), R(), 0, 1, 0.8, 1.1)
      put(b, torus(rd * 0.6, 0.03, 4, 24), dark, x, rd * 0.75, z, Math.PI / 2)
    }
  }
  // 收容槽（圓頂之間的直立液槽）
  for (const a of [1.05, 3.15, 5.25]) {
    const x = px(2.35, a)
    const z = pz(2.35, a)
    put(b, cyl(0.18, 0.18, 0.75, 12), bubbleA, x, 0.3, z)
    put(b, cyl(0.22, 0.22, 0.1, 12), dark, x, 0.7, z)
    put(b, cyl(0.22, 0.24, 0.14, 12), dark, x, -0.1, z)
  }
  // 對接艙（-z）
  put(b, rbox(0.9, 0.55, 1.3, 0.12, 1), hull, 0, -0.05, -2.4)
  put(b, torus(0.28, 0.05, 6, 20), acc, 0, -0.05, -3.06)
  put(b, box(0.55, 0.05, 0.1), acc, 0, 0.24, -2.1)
  light(k, -0.55, 0.22, -2.95, '#ff3b3b')
  light(k, 0.55, 0.22, -2.95, '#5cf2a5')
  light(k, 0, 1.65, 0, '#e8fff4', 'slow')
  k.height = 1.7
}

/** 擺渡號（人員轉運）：傾斜的大傳送門（藍色光膜＋旋渦、光點繞行）、後方航廈（屋頂指標箭頭、兩舷停靠的接駁艇）*/
function portage(k: Kit): void {
  const { b, hull, dark, glow } = k
  const bright = Mat.emissive('#4aa8ff', 4)
  const sign = Mat.emissive('#e8f4ff', 2.2)
  const film = Mat.liquid('#4aa8ff')
  const white = Mat.paint('#d8dde2', 0.4)
  const cockpit = Mat.glass('#9fd8ff', 0.5)
  const tilt = 0.44
  const pivot = new THREE.Vector3(0, 0.55, 1.15)
  const G = new THREE.Matrix4().compose(
    pivot,
    new THREE.Quaternion().setFromEuler(new THREE.Euler(tilt, 0, 0)),
    new THREE.Vector3(1, 1, 1),
  )
  const GR = 2.4
  // 傳送門
  framed(G, () => {
    put(b, torus(GR, 0.3, 12, 64), hull, 0, 0, 0, Math.PI / 2)
    put(b, torus(GR - 0.32, 0.07, 6, 64), bright, 0, 0, 0, Math.PI / 2)
    for (let i = 0; i < 8; i++) {
      const a = (i / 8) * Math.PI * 2
      put(b, rbox(0.72, 0.8, 0.62, 0.1, 1), dark, px(GR, a), 0, pz(GR, a), 0, a)
      put(b, box(0.36, 0.34, 0.05), glow, px(GR - 0.33, a), 0, pz(GR - 0.33, a), 0, a)
      put(b, box(0.42, 0.04, 0.2), glow, px(GR + 0.05, a), 0.41, pz(GR + 0.05, a), 0, a)
    }
    put(b, disc(GR - 0.36, 48), film, 0, 0.01, 0)
    put(b, disc(GR - 0.36, 48), film, 0, -0.01, 0, Math.PI)
  })
  // 光膜上的旋渦（繞門的法線旋轉）
  const swirl = sub(k)
  swirl.g.position.copy(pivot)
  swirl.g.rotation.order = 'XYZ'
  swirl.g.rotation.x = tilt
  const sw = Mat.emissive('#bfe6ff', 2.6)
  for (let i = 0; i < 3; i++) {
    put(swirl.b, torus(1.35, 0.045, 4, 28, 2.1), sw, 0, 0.03, 0, Math.PI / 2, (i / 3) * Math.PI * 2)
    put(swirl.b, torus(0.75, 0.04, 4, 20, 1.9), sw, 0, 0.03, 0, Math.PI / 2, (i / 3) * Math.PI * 2 + 1.2)
  }
  k.anims.push((t) => (swirl.g.rotation.y = -t * 0.8))
  // 沿門框繞行的光點
  const runner = new THREE.Mesh(sphere(0.16, 10, 8), Mat.emissive('#dff2ff', 6))
  k.body.add(runner)
  const tmp = new THREE.Vector3()
  k.anims.push((t) => {
    const a = t * 1.6
    runner.position.copy(tmp.set(px(GR - 0.32, a), 0, pz(GR - 0.32, a)).applyMatrix4(G))
  })
  // 航廈：屋頂指標箭頭、窗帶、標誌燈板
  put(b, rbox(2.0, 0.8, 2.9, 0.25, 2), hull, 0, 0.1, -2.4)
  put(b, rbox(1.4, 0.5, 2.2, 0.15, 1), dark, 0, -0.45, -2.4)
  for (const z of [-1.55, -2.25])
    for (const s of [-1, 1]) put(b, box(0.85, 0.05, 0.17), bright, s * 0.29, 0.52, z, 0, s * (Math.PI / 4))
  put(b, box(1.2, 0.05, 0.36), sign, 0, 0.52, -3.25)
  for (const s of [-1, 1]) {
    put(b, box(0.04, 0.1, 2.3), glow, s * 1.01, 0.22, -2.4)
    put(b, box(0.04, 0.1, 2.3), glow, s * 1.01, -0.02, -2.4)
  }
  // 航廈與門的連接塔
  put(b, rbox(0.9, 0.55, 0.9, 0.1, 1), dark, 0, 0.35, -0.85)
  strut(b, hull, 0, 0.5, -0.9, 0, 1.45, -1.02, 0.45)
  // 兩舷停靠的接駁艇（白色艇身＋藍色條紋）
  for (const s of [-1, 1]) {
    for (const z of [-1.75, -3.05]) {
      put(b, cyl(0.12, 0.12, 0.3, 8), dark, s * 1.16, 0.1, z, 0, 0, Math.PI / 2)
      put(b, rbox(0.85, 0.32, 0.5, 0.14, 1), white, s * 1.72, 0.1, z)
      put(b, rbox(0.26, 0.18, 0.34, 0.08, 1), cockpit, s * 2.05, 0.2, z)
      put(b, box(0.6, 0.05, 0.52), glow, s * 1.7, 0.18, z)
    }
  }
  put(b, cyl(0.04, 0.06, 1.1, 6), dark, 0.55, 1.0, -3.4)
  const side = new THREE.Vector3(GR + 0.35, 0, 0).applyMatrix4(G)
  light(k, side.x, side.y, side.z, '#5cf2a5')
  light(k, -side.x, side.y, side.z, '#ff3b3b')
  light(k, 0.55, 1.6, -3.4, '#ffffff', 'slow')
  k.height = 2.5
}

/** 海盜船：不對稱的拼裝船——菱形撞角、左舷鋸齒刃翼、右舷重砲、背脊尖刺、紅色眼縫、一大一小的引擎 */
function pirate(k: Kit): void {
  const { b, hull } = k
  const black = Mat.metal('#151314', 0.6)
  const rust = Mat.metal('#5a2a1c', 0.5)
  const red = Mat.emissive('#ff2a2a', 3.2)
  const R = rng(13)
  // 撞角（4 邊錐 → 菱形斷面）
  put(b, cyl(0, 0.8, 3.0, 4), black, 0, 0.05, 1.9, Math.PI / 2, 0, 0, 1.3, 1, 0.6)
  put(b, rbox(1.6, 0.75, 2.2, 0.08, 1), hull, 0.05, 0.05, -0.3, 0, 0.06)
  put(b, rbox(1.1, 0.5, 1.4, 0.08, 1), black, -0.1, 0.55, -0.5, 0.05, -0.08)
  // 胡亂焊上的補丁板
  for (let i = 0; i < 9; i++)
    put(
      b,
      box(0.4 + R() * 0.6, 0.06, 0.3 + R() * 0.5),
      [hull, black, rust][i % 3],
      (R() - 0.5) * 1.5,
      0.42 + R() * 0.12,
      -1.2 + R() * 1.9,
      (R() - 0.5) * 0.4,
      R() * 3,
      (R() - 0.5) * 0.4,
    )
  // 紅色眼縫
  for (const s of [-1, 1]) put(b, box(0.42, 0.05, 0.06), red, s * 0.38, 0.28, 1.15, 0, s * 0.45, s * -0.25)
  put(b, box(0.06, 0.04, 1.6), red, 0.0, 0.82, -0.5)
  // 左舷鋸齒刃翼＋翼尖尖刺
  put(
    b,
    slab(
      'pirate.wing',
      [
        [-0.75, 0.9],
        [-1.6, 0.5],
        [-3.0, 1.35],
        [-2.4, 0.1],
        [-3.1, -0.6],
        [-2.0, -0.6],
        [-2.4, -1.7],
        [-1.25, -1.0],
        [-0.75, -1.3],
      ],
      0.12,
      0.04,
    ),
    black,
    0,
    -0.05,
    0,
    0,
    0,
    0.12,
  )
  put(b, box(1.8, 0.05, 0.08), red, -1.7, 0.02, 0.35, 0, -0.4, 0.12)
  const spike = (
    x: number,
    y: number,
    z: number,
    dx: number,
    dy: number,
    dz: number,
    len: number,
    r: number,
    m: THREE.Material = black,
  ) => {
    D.set(dx, dy, dz).normalize()
    Q.setFromUnitVectors(UP, D)
    L.compose(P.set(x + (D.x * len) / 2, y + (D.y * len) / 2, z + (D.z * len) / 2), Q, S.set(1, 1, 1))
    M.multiplyMatrices(FRAME, L)
    b.addMatrix(cyl(0, r, len, 5), m, M)
  }
  spike(-3.0, 0.05, 1.3, -0.3, 0, 1, 1.2, 0.14)
  spike(-3.1, 0.0, -0.6, -1, 0, 0.1, 0.9, 0.12)
  spike(-2.4, 0.0, -1.7, -0.3, 0, -1, 0.9, 0.12)
  // 撞角兩側的前刺、背脊尖刺（朝後斜）
  for (const s of [-1, 1]) spike(s * 0.55, 0.0, 1.5, s * 0.35, 0, 1, 1.5, 0.12)
  for (const [z, len] of [
    [0.6, 0.9],
    [-0.2, 1.3],
    [-1.0, 1.0],
  ])
    spike(0, 0.75, z, 0, 1, -0.7, len, 0.16, rust)
  spike(0.6, 0.4, -1.3, 0.6, 1, -0.6, 0.8, 0.12)
  // 右舷重砲莢艙＋紅色感測眼
  put(b, rbox(0.62, 0.52, 1.5, 0.08, 1), hull, 1.15, 0.05, 0.25, 0, -0.05)
  put(b, cyl(0.13, 0.17, 2.2, 12), black, 1.15, 0.1, 1.6, Math.PI / 2)
  put(b, cyl(0.2, 0.2, 0.3, 12), rust, 1.15, 0.1, 2.6, Math.PI / 2)
  put(b, cyl(0.1, 0.1, 0.04, 12), red, 1.15, 0.1, 2.76, Math.PI / 2)
  put(b, sphere(0.12, 10, 8), red, 0.95, 0.38, 0.95)
  put(b, box(0.08, 0.5, 0.7), black, 1.5, 0.35, -0.9, 0, 0, -0.3)
  // 一大一小的引擎
  put(b, cyl(0.32, 0.42, 0.6, 14), black, -0.45, 0.0, -1.65, Math.PI / 2)
  put(b, cyl(0.32, 0.32, 0.04, 14), Mat.emissive('#ff4a2a', 4.5), -0.45, 0.0, -1.96, Math.PI / 2)
  put(b, cyl(0.18, 0.24, 0.5, 12), rust, 0.6, 0.12, -1.55, Math.PI / 2)
  put(b, cyl(0.18, 0.18, 0.04, 12), Mat.emissive('#ff4a2a', 4.5), 0.6, 0.12, -1.81, Math.PI / 2)
  plumes(
    k,
    [
      [-0.45, 0, -1.97, 0.3, 1.3],
      [0.6, 0.12, -1.82, 0.17, 0.8],
    ],
    '#ff4a3a',
  )
  light(k, -3.05, 0.1, 0.85, '#ff3b3b', 'fast')
  light(k, 1.55, 0.2, 0.25, '#ff3b3b', 'fast')
  k.height = 1.8
}

const BUILDERS: Record<string, (k: Kit) => void> = {
  nyx,
  adjudicatrix,
  tenshu,
  hulk7,
  bravado,
  caldera,
  vivarium,
  portage,
  pirate,
}

/**
 * 站點外觀：依 id 組出各自的剪影。userData.update(t) 跑子結構動畫與閃燈；
 * userData.spin = 建議自轉速度（船艦型為 0，已內建輕微橫搖）；userData.height = 縮放後的頂高。
 */
export function buildStationHull(id: string, scale = 1): THREE.Group {
  const sp = SPECS[id] ?? SPECS.nyx
  const g = new THREE.Group()
  const body = new THREE.Group()
  g.add(body)
  const k: Kit = {
    sp,
    b: new Batcher(),
    body,
    hull: Mat.metal(sp.hull, 0.6),
    dark: Mat.metal('#2a3036', 0.7),
    glow: Mat.emissive(sp.glow, 3),
    acc: Mat.emissive(sp.accent, 2.5),
    anims: [],
    lights: [],
    ls: Math.min(0.3, Math.max(0.09, 0.12 / scale)),
    subs: [],
    height: 3,
  }
  FRAME.identity()
  ;(BUILDERS[id] ?? nyx)(k)
  k.b.build(body, { cast: true, receive: true })
  for (const [b, grp] of k.subs) b.build(grp, { cast: true, receive: true })
  const ship = sp.spin === 0
  g.userData.update = (t: number) => {
    for (const f of k.anims) f(t)
    for (const l of k.lights) {
      const v =
        l.mode === 'nav'
          ? Math.sin(t * 3 + l.ph) > 0.3
          : l.mode === 'fast'
            ? Math.sin(t * 7 + l.ph) > 0.2
            : l.mode === 'slow'
              ? Math.sin(t * 1.4 + l.ph) > 0.55
              : l.mode === 'flicker'
                ? hash(Math.floor(t * 13) + l.ph) > 0.35
                : hash(Math.floor(t * 19) + l.ph) > 0.86
      l.m.visible = v
    }
    if (ship) {
      body.rotation.z = Math.sin(t * 0.45) * 0.035
      body.position.y = Math.sin(t * 0.6) * 0.06
    }
  }
  g.userData.spin = sp.spin
  g.userData.height = k.height * scale
  g.scale.setScalar(scale)
  return g
}
