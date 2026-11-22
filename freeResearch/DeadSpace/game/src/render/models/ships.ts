// 太空層物件：船艇、救生艙、無人機、小行星、恆星、站點外觀（美術聖經 §10）
import * as THREE from 'three'
import { regModel, type ModelView } from './index'
import { Batcher, box, cyl, rbox, sphere, torus } from '../batch'
import { Mat } from '../materials'
import { buildStationHull, pebble, stationHullScale } from '../space/hulls'
import { makePlanet, makeSun, type PlanetLook } from '../space/sky'
import { STATION_BY_ID } from '../../shared/content/stations/index'

interface ShipLook {
  hull: string
  stripe: string
  engine: string
  len: number
  wid: number
  /** 尾焰位置（x, y）；不設 = 寬船兩具、窄船一具 */
  engines?: [number, number][]
  /** 尾焰大小倍率 */
  flame?: number
  build: (b: Batcher, hull: THREE.Material, dark: THREE.Material, stripe: THREE.Material) => void
}

const HALF_PI = Math.PI / 2
/** 沿 +z（船頭）的圓柱／圓錐：rt = 前端半徑 */
const fwdCyl = (b: Batcher, rt: number, rb: number, len: number, m: THREE.Material, x: number, y: number, z: number, seg = 12) => b.add(cyl(rt, rb, len, seg), m, x, y, z, 0, 1, 1, 1, HALF_PI)

/**
 * 船型（美術聖經 §10「細節化模型、導航閃燈、引擎尾焰」）：每種船一個辨識得出的剪影，
 * 俯視遠距離（太空層 30–60 px）也分得出：紅隼＝三角翼偵察艇、騾級＝拖著貨櫃的卡車、槍騎＝長矛機頭＋前掠翼、
 * 獵鷹＝寬機身＋兩具大引擎艙＋背部砲塔、綿羊號＝羊、救生艙＝球＋環、胡蜂＝分節蜂身＋兩對翅。
 * 船殼用帶面板線的金屬（Mat.hull），再加小零件（天線、散熱片、艙門、燈）。
 */
const LOOKS: Record<string, ShipLook> = {
  kestrel: {
    hull: '#c9d1d8',
    stripe: '#ff7a2a',
    engine: '#7fd8ff',
    len: 1.9,
    wid: 1.0,
    engines: [
      [-0.2, 0.3],
      [0.2, 0.3],
    ],
    build: (b, hull, dark, stripe) => {
      b.add(rbox(0.56, 0.36, 1.45, 0.12), hull, 0, 0.32, 0.02)
      fwdCyl(b, 0.04, 0.27, 0.5, hull, 0, 0.32, 0.98)
      // 三角翼（後掠）＋翼尖小垂尾
      for (const s of [-1, 1]) {
        b.add(rbox(0.85, 0.05, 0.62, 0.02), hull, s * 0.52, 0.26, -0.28, s * 0.42)
        b.add(box(0.04, 0.2, 0.28), dark, s * 0.9, 0.34, -0.52)
        b.add(box(0.5, 0.055, 0.08), stripe, s * 0.5, 0.29, -0.18, s * 0.42)
        // 進氣口
        b.add(rbox(0.12, 0.16, 0.36, 0.03), dark, s * 0.33, 0.3, 0.25)
      }
      b.add(rbox(0.05, 0.38, 0.42, 0.02), hull, 0, 0.6, -0.52)
      b.add(box(0.06, 0.08, 0.3), stripe, 0, 0.78, -0.55)
      b.add(rbox(0.34, 0.2, 0.48, 0.09), Mat.glass('#7fd8ff', 0.6), 0, 0.52, 0.42)
      b.add(box(0.58, 0.05, 0.22), stripe, 0, 0.51, 0.02)
      for (const s of [-1, 1]) fwdCyl(b, 0.13, 0.15, 0.42, dark, s * 0.2, 0.3, -0.78)
      // 天線
      b.add(cyl(0.01, 0.01, 0.3, 4), dark, 0.12, 0.62, 0.1)
    },
  },
  mule: {
    hull: '#c8bf9e',
    stripe: '#ffc23d',
    engine: '#ffb46b',
    len: 2.4,
    wid: 1.2,
    engines: [
      [-0.3, 0.45],
      [0.3, 0.45],
    ],
    flame: 1.3,
    build: (b, hull, dark, stripe) => {
      // 駕駛艙（車頭）＋警示條
      b.add(rbox(0.86, 0.62, 0.66, 0.1), hull, 0, 0.5, 0.82)
      b.add(rbox(0.66, 0.24, 0.12, 0.05), Mat.glass('#ffe0a8', 0.55), 0, 0.64, 1.13)
      b.add(box(0.88, 0.08, 0.08), stripe, 0, 0.3, 1.13)
      for (const s of [-1, 1]) b.add(box(0.05, 0.3, 0.5), stripe, s * 0.44, 0.5, 0.8)
      // 骨架＋四個貨櫃（顏色不同，像拖著貨櫃的卡車）
      b.add(box(0.26, 0.2, 1.7), dark, 0, 0.35, -0.2)
      const cont = ['#d8743a', '#3f8f88', '#b8a070', '#8a9aa6']
      for (let i = 0; i < 4; i++) {
        const sx = i % 2 ? 1 : -1
        const z = i < 2 ? 0.12 : -0.62
        b.add(rbox(0.5, 0.5, 0.68, 0.03), Mat.paint(cont[i], 0.6), sx * 0.31, 0.5, z)
        // 貨櫃的瓦楞
        for (let k = 0; k < 3; k++) b.add(box(0.52, 0.03, 0.03), dark, sx * 0.31, 0.62, z - 0.22 + k * 0.22)
      }
      // 後段引擎座＋兩具大噴口
      b.add(rbox(0.96, 0.44, 0.34, 0.06), hull, 0, 0.45, -1.1)
      for (const s of [-1, 1]) fwdCyl(b, 0.16, 0.2, 0.3, dark, s * 0.3, 0.45, -1.3)
      // 車頂天線、探照燈
      b.add(cyl(0.012, 0.012, 0.35, 4), dark, -0.3, 0.98, 0.75)
      b.add(box(0.14, 0.06, 0.06), stripe, 0.25, 0.83, 0.95)
    },
  },
  lancer: {
    hull: '#4a5462',
    stripe: '#ff3b3b',
    engine: '#ff7eb6',
    len: 2.4,
    wid: 1.3,
    engines: [[0, 0.3]],
    build: (b, hull, dark, stripe) => {
      b.add(rbox(0.42, 0.28, 1.8, 0.1), hull, 0, 0.3, -0.05)
      // 長矛機頭
      fwdCyl(b, 0.015, 0.14, 0.75, hull, 0, 0.3, 1.2)
      // 前掠翼＋翼尖雙管砲
      for (const s of [-1, 1]) {
        b.add(rbox(0.95, 0.05, 0.42, 0.02), hull, s * 0.55, 0.27, -0.15, -s * 0.38)
        b.add(box(0.6, 0.055, 0.07), stripe, s * 0.55, 0.3, -0.08, -s * 0.38)
        fwdCyl(b, 0.035, 0.035, 0.9, dark, s * 0.98, 0.27, 0.22, 8)
        b.add(rbox(0.12, 0.12, 0.3, 0.03), dark, s * 0.98, 0.27, -0.12)
        // 前翼（鴨翼）
        b.add(box(0.32, 0.04, 0.16), hull, s * 0.3, 0.3, 0.62, -s * 0.5)
        // 外傾雙垂尾
        b.add(box(0.04, 0.34, 0.32), hull, s * 0.18, 0.5, -0.75, 0, 1, 1, 1, 0, s * 0.35)
      }
      b.add(rbox(0.28, 0.17, 0.5, 0.08), Mat.glass('#ff7eb6', 0.55), 0, 0.45, 0.45)
      b.add(box(0.44, 0.04, 1.1), stripe, 0, 0.45, -0.25)
      fwdCyl(b, 0.14, 0.17, 0.35, dark, 0, 0.3, -1.05)
    },
  },
  harrier: {
    hull: '#7a838c',
    stripe: '#9fe7ff',
    engine: '#9fe7ff',
    len: 2.4,
    wid: 1.6,
    engines: [
      [-0.72, 0.35],
      [0.72, 0.35],
    ],
    flame: 1.4,
    build: (b, hull, dark, stripe) => {
      // 寬機身（楔形機頭）
      b.add(rbox(1.0, 0.45, 1.6, 0.12), hull, 0, 0.36, -0.05)
      b.add(rbox(0.7, 0.32, 0.6, 0.1), hull, 0, 0.32, 0.9)
      b.add(rbox(0.5, 0.16, 0.36, 0.07), Mat.glass('#9fe7ff', 0.55), 0, 0.5, 0.95)
      // 兩具大引擎艙（前端進氣環）
      for (const s of [-1, 1]) {
        fwdCyl(b, 0.24, 0.26, 1.5, hull, s * 0.72, 0.35, -0.25, 14)
        fwdCyl(b, 0.2, 0.2, 0.08, dark, s * 0.72, 0.35, 0.52, 14)
        b.add(box(0.3, 0.16, 0.5), hull, s * 0.5, 0.33, -0.2)
        b.add(box(0.05, 0.05, 1.2), stripe, s * 0.72, 0.61, -0.25)
        // 散熱片
        for (let k = 0; k < 3; k++) b.add(box(0.02, 0.12, 0.2), dark, s * (0.97 + 0.0), 0.35, -0.55 + k * 0.25)
      }
      // 背部雙管砲塔
      b.add(cyl(0.2, 0.24, 0.14, 14), dark, 0, 0.64, 0.05)
      b.add(rbox(0.26, 0.12, 0.3, 0.04), hull, 0, 0.74, 0.08)
      for (const s of [-1, 1]) fwdCyl(b, 0.03, 0.03, 0.62, dark, s * 0.06, 0.75, 0.5, 8)
      b.add(box(1.02, 0.05, 0.26), stripe, 0, 0.6, -0.55)
    },
  },
  woolly: {
    hull: '#f0ece0',
    stripe: '#ff7eb6',
    engine: '#ff7eb6',
    len: 1.9,
    wid: 1.2,
    engines: [[0, 0.45]],
    build: (b, hull, dark, stripe) => {
      // 羊毛：一圈圈蓬鬆的毛球
      const wool = Mat.cloth('#f4f0e4', '#ffd6e8')
      for (let i = 0; i < 14; i++) {
        const a = i * 2.4
        const r = 0.18 + (i % 3) * 0.12
        b.add(sphere(0.3 - (i % 3) * 0.04, 10, 8), wool, Math.cos(a) * r * 1.2, 0.48 + (i % 2) * 0.1, Math.sin(a) * r * 1.5 - 0.1)
      }
      // 羊頭、耳朵、眼睛
      const face = Mat.skin('#2a2a2a')
      b.add(sphere(0.24, 12, 10), face, 0, 0.55, 0.78, 0, 1, 0.9, 1.2)
      for (const s of [-1, 1]) {
        b.add(sphere(0.1, 8, 6), face, s * 0.25, 0.65, 0.7, s * 0.5, 1.4, 0.45, 0.7)
        b.add(sphere(0.035, 6, 4), stripe, s * 0.09, 0.62, 0.98)
      }
      // 四隻短腿＝姿態推進器
      for (const [x, z] of [
        [-0.3, 0.35],
        [0.3, 0.35],
        [-0.3, -0.45],
        [0.3, -0.45],
      ])
        b.add(cyl(0.07, 0.09, 0.3, 8), dark, x, 0.15, z)
      // 項圈
      b.add(box(0.5, 0.05, 0.05), stripe, 0, 0.6, 0.55)
      b.add(sphere(0.14, 8, 6), wool, 0, 0.62, -0.72)
      void hull
    },
  },
  pod: {
    hull: '#aeb4bb',
    stripe: '#ff3b3b',
    engine: '#ffb46b',
    len: 0.9,
    wid: 0.6,
    engines: [[0, 0.35]],
    flame: 0.8,
    build: (b, hull, dark, stripe) => {
      b.add(sphere(0.35, 16, 12), hull, 0, 0.35, 0)
      // 赤道環＋三片尾翼＋舷窗
      b.add(torus(0.36, 0.035, 6, 24), stripe, 0, 0.35, 0, 0, 1, 1, 1, HALF_PI)
      for (let k = 0; k < 3; k++) {
        const a = (k / 3) * Math.PI * 2
        b.add(box(0.03, 0.16, 0.22), dark, Math.cos(a) * 0.3, 0.35 + Math.sin(a) * 0.3, -0.25, 0, 1, 1, 1, 0, -a)
      }
      b.add(sphere(0.12, 10, 8), Mat.glass('#ffd9a0', 0.6), 0, 0.5, 0.25, 0, 1, 0.7, 0.6)
      fwdCyl(b, 0.16, 0.22, 0.22, dark, 0, 0.35, -0.38)
    },
  },
  wasp: {
    hull: '#2e3238',
    stripe: '#ffb000',
    engine: '#ff5a4a',
    len: 1.2,
    wid: 1.1,
    engines: [[0, 0.32]],
    flame: 0.8,
    build: (b, hull, dark, stripe) => {
      // 分節蜂身：頭（紅色感測眼）—胸—腹（黃黑環紋）
      b.add(sphere(0.12, 10, 8), hull, 0, 0.32, 0.45)
      b.add(sphere(0.05, 8, 6), Mat.emissive('#ff3b3b', 3), 0, 0.36, 0.55)
      b.add(sphere(0.15, 10, 8), hull, 0, 0.32, 0.22, 0, 1, 0.9, 1.1)
      b.add(sphere(0.17, 12, 8), hull, 0, 0.3, -0.18, 0, 0.9, 0.8, 1.8)
      for (let k = 0; k < 3; k++) b.add(cyl(0.155 - k * 0.025, 0.155 - k * 0.025, 0.05, 12), stripe, 0, 0.3, -0.05 - k * 0.15, 0, 1, 0.82, 1, HALF_PI)
      // 兩對翅（半透明薄片）
      const wing = Mat.glass('#c8d8e8', 0.35)
      for (const s of [-1, 1]) {
        b.add(rbox(0.6, 0.02, 0.2, 0.01), wing, s * 0.38, 0.4, 0.2, s * 0.35)
        b.add(rbox(0.45, 0.02, 0.16, 0.01), wing, s * 0.32, 0.38, 0.0, s * 0.6)
        // 腹側小砲
        fwdCyl(b, 0.02, 0.02, 0.3, dark, s * 0.1, 0.24, 0.42, 6)
      }
      void dark
    },
  },
}

function shipModel(id: string): ModelView {
  const L = LOOKS[id] ?? LOOKS.kestrel
  const root = new THREE.Group()
  const b = new Batcher()
  L.build(b, Mat.hull(L.hull, L.engine), Mat.metal('#2a3036', 0.7), Mat.emissive(L.stripe, 1.8))
  b.build(root)
  // 引擎尾焰
  const flames: THREE.Mesh[] = []
  const fk = L.flame ?? 1
  for (const [x, y] of L.engines ?? (L.wid > 1 ? [[-0.35, 0.3], [0.35, 0.3]] : [[0, 0.3]])) {
    const f = new THREE.Mesh(new THREE.ConeGeometry(0.12 * fk, 0.6 * fk, 10), new THREE.MeshBasicMaterial({ color: new THREE.Color(L.engine).multiplyScalar(4), transparent: true, opacity: 0.8, blending: THREE.AdditiveBlending, depthWrite: false }))
    f.rotation.x = -Math.PI / 2
    f.position.set(x, y, -L.len / 2 - 0.3 * fk)
    root.add(f)
    flames.push(f)
  }
  // 導航燈
  const nav: THREE.Mesh[] = []
  for (const [x, c] of [
    [-L.wid * 0.6, '#ff3b3b'],
    [L.wid * 0.6, '#5cf2a5'],
  ] as const) {
    const m = new THREE.Mesh(sphere(0.05, 6, 4), Mat.emissive(c, 5))
    m.position.set(x, 0.3, 0)
    root.add(m)
    nav.push(m)
  }
  return {
    root,
    height: 0.9,
    update(t, _dt, speed, state) {
      const k = Math.min(1, 0.4 + speed * 0.6)
      for (const f of flames) {
        f.scale.set(1, k * (0.85 + Math.random() * 0.3), 1)
        ;(f.material as THREE.MeshBasicMaterial).opacity = 0.5 + k * 0.4
      }
      nav.forEach((n, i) => (n.visible = Math.sin(t * 4 + i) > 0))
      root.position.y = Math.sin(t * 1.3) * 0.05
      if (state === 4) root.rotation.z += 0.05
    },
  }
}

for (const id of Object.keys(LOOKS)) regModel('ship.' + id, () => shipModel(id))

// ───────── 艦隊主力艦：譴責號／舊往號（巡洋艦）、九頭蛇號（主力艦）─────────
// 一般船艇長 1–2.5 m；艦隊的碰撞半徑 2–3，模型要撐到 5–8 m 長才「像一艘大船」：
// 層層的甲板、艦橋塔、舷窗燈列、成排的引擎噴口與可轉動的砲塔。
// 巡洋艦：楔形艦艏＋兩側艦舷＋艦橋塔，4 座砲塔；舊往號的識別色是琥珀、譴責號是紅。
// 九頭蛇號：三叉戟似的三根前伸艦艏（各頂一門主砲）＋寬大的翼段＋6 座砲塔＝九個「頭」。
// 靜態船殼依船型合併一次、所有實例共用幾何（不隨單位 dispose）。

/** 任意水平朝向（yaw）的前向圓柱：Euler 順序 YXZ，先把圓柱轉成朝 +z 再繞 y 轉 */
const aimM = new THREE.Matrix4()
const aimQ = new THREE.Quaternion()
const aimE = new THREE.Euler()
function aimCyl(b: Batcher, rt: number, rb: number, len: number, m: THREE.Material, x: number, y: number, z: number, yaw: number, seg = 12): void {
  aimQ.setFromEuler(aimE.set(HALF_PI, yaw, 0, 'YXZ'))
  aimM.compose(new THREE.Vector3(x, y, z), aimQ, new THREE.Vector3(1, 1, 1))
  b.addMatrix(cyl(rt, rb, len, seg), m, aimM)
}

interface FleetLook {
  hull: string
  engine: string
  /** 引擎噴口（x, y, z, 半徑）*/
  engines: [number, number, number, number][]
  /** 砲塔（x, y, z, 縮放）*/
  turrets: [number, number, number, number][]
  /** 前方主砲口（x, y, z, yaw）*/
  heads: [number, number, number, number][]
  height: number
  build: (b: Batcher, m: Record<'hull' | 'dark' | 'stripe' | 'win' | 'red', THREE.Material>) => void
}

const FLEET: Record<'cruiser' | 'capital', FleetLook> = {
  cruiser: {
    hull: '#7a848e',
    engine: '#9fe7ff',
    engines: [
      [-0.5, 0.5, -2.95, 0.26],
      [0, 0.5, -2.95, 0.26],
      [0.5, 0.5, -2.95, 0.26],
    ],
    turrets: [
      [0, 0.79, 1.45, 1],
      [0, 0.97, 0.35, 0.9],
      [-0.82, 0.6, 0.45, 0.7],
      [0.82, 0.6, 0.45, 0.7],
    ],
    heads: [],
    height: 1.9,
    build: (b, m) => {
      // 主船體、龍骨、四面錐的楔形艦艏
      b.add(rbox(1.3, 0.55, 3.8, 0.12), m.hull, 0, 0.5, 0)
      b.add(rbox(0.8, 0.3, 3.2, 0.08), m.dark, 0, 0.2, -0.1)
      b.add(rbox(1.0, 0.42, 1.0, 0.1), m.hull, 0, 0.58, 1.6)
      fwdCyl(b, 0.06, 0.66, 1.35, m.hull, 0, 0.5, 2.55, 4)
      b.add(box(0.55, 0.1, 0.03), m.win, 0, 0.34, 2.0)
      // 兩側艦舷：識別色條、外掛艙、舷窗燈列
      for (const sd of [-1, 1]) {
        b.add(rbox(0.42, 0.36, 2.6, 0.08), m.hull, sd * 0.82, 0.42, -0.3)
        b.add(box(0.04, 0.07, 2.3), m.stripe, sd * 1.04, 0.5, -0.3)
        for (let i = 0; i < 6; i++) b.add(box(0.07, 0.12, 0.2), m.dark, sd * 1.05, 0.33, -1.35 + i * 0.4)
        for (let i = 0; i < 9; i++) b.add(box(0.02, 0.035, 0.07), m.win, sd * 0.66, 0.67, -1.6 + i * 0.36)
        b.add(box(0.03, 0.05, 0.05), m.red, sd * 1.04, 0.62, 0.95)
        // 斜切的艦艏側板
        b.add(rbox(0.06, 0.34, 1.2, 0.02), m.dark, sd * 0.52, 0.48, 2.3, -sd * 0.42)
      }
      // 甲板層、艦橋塔、雷達桁、天線
      b.add(rbox(0.92, 0.22, 2.2, 0.06), m.hull, 0, 0.86, -0.4)
      b.add(rbox(0.62, 0.2, 1.3, 0.05), m.hull, 0, 1.05, -0.8)
      b.add(rbox(0.5, 0.42, 0.5, 0.06), m.hull, 0, 1.36, -1.05)
      b.add(box(0.46, 0.05, 0.02), m.win, 0, 1.45, -0.79)
      for (const sd of [-1, 1]) b.add(box(0.02, 0.05, 0.36), m.win, sd * 0.255, 1.45, -1.02)
      b.add(box(0.6, 0.03, 0.1), m.dark, 0, 1.62, -1.1)
      b.add(cyl(0.015, 0.015, 0.6, 4), m.dark, 0.12, 1.88, -1.12)
      b.add(cyl(0.012, 0.012, 0.42, 4), m.dark, -0.15, 1.78, -1.15)
      b.add(box(0.05, 0.05, 0.05), m.red, 0.12, 2.2, -1.12)
      for (let i = 0; i < 4; i++) b.add(box(0.74, 0.04, 0.07), m.dark, 0, 0.99, -0.95 - i * 0.14)
      b.add(box(0.95, 0.04, 0.05), m.stripe, 0, 0.97, 0.69)
      // 艦尾引擎座
      b.add(rbox(1.62, 0.74, 0.72, 0.1), m.hull, 0, 0.5, -2.2)
      b.add(box(1.64, 0.06, 0.1), m.stripe, 0, 0.86, -2.2)
      for (const x of [-0.5, 0, 0.5]) fwdCyl(b, 0.27, 0.32, 0.36, m.dark, x, 0.5, -2.72, 14)
    },
  },
  capital: {
    hull: '#58616c',
    engine: '#7fd8ff',
    engines: [
      [-0.9, 0.7, -4.0, 0.3],
      [-0.45, 0.7, -4.0, 0.32],
      [0, 0.7, -4.0, 0.36],
      [0.45, 0.7, -4.0, 0.32],
      [0.9, 0.7, -4.0, 0.3],
      [-1.85, 0.55, -2.05, 0.22],
      [1.85, 0.55, -2.05, 0.22],
    ],
    turrets: [
      [-0.95, 0.61, -0.25, 0.9],
      [0.95, 0.61, -0.25, 0.9],
      [-0.95, 0.61, -1.45, 0.9],
      [0.95, 0.61, -1.45, 0.9],
      [0, 1.4, 0.05, 1.1],
      [0, 0.98, 2.45, 1],
    ],
    heads: [
      [0, 0.72, 4.62, 0],
      [-1.28, 0.6, 3.6, -0.12],
      [1.28, 0.6, 3.6, 0.12],
    ],
    height: 2.5,
    build: (b, m) => {
      // 脊樑、寬大的翼段、翼尖垂直艦舷
      b.add(rbox(1.7, 0.8, 5.2, 0.15), m.hull, 0, 0.72, -0.6)
      b.add(rbox(3.6, 0.32, 2.6, 0.12), m.hull, 0, 0.45, -0.9)
      b.add(rbox(1.2, 0.3, 4.6, 0.08), m.dark, 0, 0.28, -0.4)
      for (const sd of [-1, 1]) {
        b.add(rbox(0.5, 0.62, 1.9, 0.1), m.hull, sd * 1.85, 0.55, -1.0)
        b.add(box(0.04, 0.08, 1.8), m.stripe, sd * 2.11, 0.62, -1.0)
        b.add(box(0.06, 0.06, 0.06), m.red, sd * 2.12, 0.9, -0.1)
        for (let i = 0; i < 5; i++) b.add(box(0.07, 0.14, 0.22), m.dark, sd * 2.12, 0.42, -1.75 + i * 0.38)
        for (let i = 0; i < 10; i++) b.add(box(0.02, 0.035, 0.07), m.win, sd * 0.86, 0.92, -2.6 + i * 0.4)
        // 翼段前緣的燈列
        for (let i = 0; i < 4; i++) b.add(box(0.12, 0.03, 0.03), m.win, sd * (0.95 + i * 0.22), 0.5, 0.41)
        // 側艦艏：略往外張，用橫樑接回主體
        b.add(rbox(0.5, 0.45, 2.0, 0.08), m.hull, sd * 1.15, 0.6, 2.1, sd * 0.12)
        b.add(box(0.05, 0.06, 1.7), m.stripe, sd * 1.4, 0.68, 2.1, sd * 0.12)
        b.add(rbox(0.36, 0.3, 0.5, 0.06), m.dark, sd * 1.27, 0.6, 3.15, sd * 0.12)
      }
      b.add(rbox(2.6, 0.3, 0.6, 0.08), m.hull, 0, 0.6, 1.2)
      // 中央艦艏（最長的那根）
      b.add(rbox(0.62, 0.52, 2.4, 0.1), m.hull, 0, 0.72, 2.9)
      b.add(box(0.05, 0.05, 2.0), m.stripe, 0, 0.99, 2.9)
      b.add(rbox(0.44, 0.36, 0.5, 0.06), m.dark, 0, 0.72, 4.15)
      // 上層建築：三層台階＋高聳的艦橋塔
      b.add(rbox(1.2, 0.3, 2.6, 0.08), m.hull, 0, 1.25, -1.0)
      b.add(rbox(0.8, 0.3, 1.4, 0.06), m.hull, 0, 1.52, -1.5)
      b.add(rbox(0.6, 0.62, 0.6, 0.08), m.hull, 0, 1.95, -1.85)
      b.add(box(0.56, 0.06, 0.02), m.win, 0, 2.08, -1.54)
      for (const sd of [-1, 1]) b.add(box(0.02, 0.06, 0.46), m.win, sd * 0.305, 2.08, -1.85)
      b.add(box(0.9, 0.04, 0.12), m.dark, 0, 2.3, -1.9)
      b.add(cyl(0.018, 0.018, 0.8, 4), m.dark, 0.18, 2.65, -1.95)
      b.add(box(0.06, 0.06, 0.06), m.red, 0.18, 3.06, -1.95)
      for (let i = 0; i < 5; i++) b.add(box(1.0, 0.04, 0.08), m.dark, 0, 1.42, -1.95 - i * 0.14 + 0.9)
      b.add(box(1.22, 0.05, 0.06), m.stripe, 0, 1.4, 0.31)
      // 艦尾引擎座
      b.add(rbox(2.5, 0.95, 0.95, 0.12), m.hull, 0, 0.7, -3.35)
      b.add(box(2.52, 0.07, 0.12), m.stripe, 0, 1.12, -3.35)
      for (const [x, y, z, r] of FLEET.capital.engines) fwdCyl(b, r, r * 1.2, 0.4, m.dark, x, y, z + 0.25, 14)
      // 三門主砲（九頭蛇的三顆大頭）
      for (const [x, y, z, yaw] of FLEET.capital.heads) {
        aimCyl(b, 0.13, 0.2, 0.7, m.dark, x - Math.sin(yaw) * 0.3, y, z - Math.cos(yaw) * 0.3, yaw, 12)
        aimCyl(b, 0.2, 0.2, 0.08, m.stripe, x - Math.sin(yaw) * 0.6, y, z - Math.cos(yaw) * 0.6, yaw, 12)
      }
    },
  },
}

/** 合併好的靜態船殼（每種船型＋識別色一份，實例共用幾何與材質）*/
const fleetTpl = new Map<string, THREE.Mesh[]>()
function fleetMeshes(key: string, build: (b: Batcher) => void): THREE.Mesh[] {
  let list = fleetTpl.get(key)
  if (!list) {
    const b = new Batcher()
    build(b)
    list = b.build(new THREE.Group())
    for (const m of list) m.geometry.userData.shared = true
    fleetTpl.set(key, list)
  }
  return list.map((m) => {
    const c = new THREE.Mesh(m.geometry, m.material)
    c.castShadow = true
    c.receiveShadow = true
    return c
  })
}

let flameCone: THREE.BufferGeometry | null = null

function fleetModel(kind: 'cruiser' | 'capital', stripeCol: string): ModelView {
  const L = FLEET[kind]
  const root = new THREE.Group()
  const ship = new THREE.Group()
  root.add(ship)
  const m = {
    hull: Mat.hull(L.hull, L.engine),
    dark: Mat.metal('#2a3036', 0.7),
    stripe: Mat.emissive(stripeCol, 1.8),
    win: Mat.emissive('#ffd2a0', 2.2),
    red: Mat.emissive('#ff3b3b', 3),
  }
  for (const o of fleetMeshes(`${kind}:${stripeCol}`, (b) => L.build(b, m))) ship.add(o)
  // 砲塔：底座＋砲罩＋雙管（共用一份幾何），各自轉動
  const turretTpl = fleetMeshes(`turret:${L.hull}`, (b) => {
    b.add(cyl(0.2, 0.24, 0.1, 14), m.dark, 0, 0.05, 0)
    b.add(rbox(0.34, 0.16, 0.38, 0.05), m.hull, 0, 0.17, -0.02)
    for (const sd of [-1, 1]) fwdCyl(b, 0.03, 0.036, 0.52, m.dark, sd * 0.07, 0.17, 0.4, 8)
  })
  const flashMat = new THREE.MeshBasicMaterial({ color: new THREE.Color('#ffe0b0').multiplyScalar(3), transparent: true, opacity: 0.9, blending: THREE.AdditiveBlending, depthWrite: false })
  const turrets: { g: THREE.Group; base: number; flash: THREE.Mesh }[] = []
  L.turrets.forEach(([x, y, z, k], i) => {
    const g = new THREE.Group()
    g.position.set(x, y, z)
    g.scale.setScalar(k)
    for (const o of turretTpl) g.add(new THREE.Mesh(o.geometry, o.material))
    const f = new THREE.Mesh(sphere(0.09, 8, 6), flashMat)
    f.position.set(0, 0.17, 0.7)
    f.visible = false
    g.add(f)
    ship.add(g)
    // 側舷砲塔平常朝外、艦艏的朝前
    turrets.push({ g, base: x === 0 ? 0 : Math.sign(x) * 0.9 + (i % 2 ? 0.1 : -0.1), flash: f })
  })
  const heads = L.heads.map(([x, y, z]) => {
    const f = new THREE.Mesh(sphere(0.16, 8, 6), flashMat)
    f.position.set(x, y, z + 0.1)
    f.visible = false
    ship.add(f)
    return f
  })
  // 引擎尾焰（每具噴口一支）
  flameCone ??= new THREE.ConeGeometry(1, 1, 12).rotateX(-HALF_PI).translate(0, 0, -0.5)
  // 外層：引擎色的長尾焰（不飽和成白色，看得出是藍色的噴流）；內層：短而亮的白芯
  const flames: THREE.Mesh[] = []
  const plume = new THREE.MeshBasicMaterial({ color: new THREE.Color(L.engine).multiplyScalar(1.5), transparent: true, opacity: 0.5, blending: THREE.AdditiveBlending, depthWrite: false })
  const core = new THREE.MeshBasicMaterial({ color: new THREE.Color('#e8f8ff').multiplyScalar(1.6), transparent: true, opacity: 0.7, blending: THREE.AdditiveBlending, depthWrite: false })
  for (const [x, y, z, r] of L.engines) {
    for (const [m, w, l] of [
      [plume, 0.9, 5],
      [core, 0.5, 2],
    ] as const) {
      const f = new THREE.Mesh(flameCone, m)
      f.position.set(x, y, z - 0.05)
      f.scale.set(r * w, r * w, r * l)
      f.userData.len = r * l
      ship.add(f)
      flames.push(f)
    }
  }
  // 導航燈（翼尖紅綠、艦尾白色頻閃）
  const nav: THREE.Mesh[] = []
  const wid = kind === 'capital' ? 2.15 : 1.08
  for (const [x, c] of [
    [-wid, '#ff3b3b'],
    [wid, '#5cf2a5'],
  ] as const) {
    const n = new THREE.Mesh(sphere(0.07, 6, 4), Mat.emissive(c, 5))
    n.position.set(x, 0.75, -0.6)
    ship.add(n)
    nav.push(n)
  }
  let deadAt = -1
  let shot = 0
  return {
    root,
    height: L.height,
    update(t, dt, speed, state) {
      const alive = state !== 4
      const k = Math.min(1, 0.35 + speed * 0.8)
      for (const f of flames) {
        f.visible = alive
        f.scale.z = (f.userData.len as number) * k * (0.88 + Math.random() * 0.24)
      }
      plume.opacity = 0.3 + k * 0.3
      nav.forEach((n, i) => (n.visible = alive && Math.sin(t * 3 + i * Math.PI) > 0.2))
      // 砲塔：平時慢慢掃視，交戰時輪流開火
      const fighting = state === 2
      shot += dt * (fighting ? (kind === 'capital' ? 10 : 4) : 0)
      const fire = Math.floor(shot) % Math.max(1, turrets.length + heads.length)
      turrets.forEach((tu, i) => {
        const sweep = Math.sin(t * 0.4 + i * 1.7) * (fighting ? 0.25 : 0.7)
        tu.g.rotation.y = tu.base * (fighting ? 0.3 : 1) + sweep
        tu.flash.visible = alive && fighting && fire === i && shot % 1 < 0.35
      })
      heads.forEach((h, i) => (h.visible = alive && fighting && fire === turrets.length + i && shot % 1 < 0.4))
      // 船身微微起伏；擊沉時橫滾、下沉
      if (!alive) {
        if (deadAt < 0) deadAt = t
        const d = Math.min(1, (t - deadAt) / 6)
        ship.rotation.z = d * 0.6
        ship.rotation.x = d * 0.15
        ship.position.y = -d * 0.8
      } else {
        deadAt = -1
        ship.rotation.set(Math.sin(t * 0.5) * 0.01, 0, Math.sin(t * 0.37) * 0.02)
        ship.position.y = Math.sin(t * 0.6) * 0.06
      }
    },
  }
}

regModel('fleet.cruiser', (_def, s) => fleetModel('cruiser', s.d === 'fleet.erstfall' ? '#ffb000' : '#ff3b3b'))
regModel('fleet.capital', () => fleetModel('capital', '#ff7a2a'))

/**
 * 小行星幾何：icosphere 以位置為函數做 fbm 起伏＋十來個隕石坑（碗狀凹陷＋隆起的坑緣），
 * 跨三角形共用位置的平滑法線、依坑底／坑緣與起伏算頂點色、依面法線選投影軸的方塊 UV（配岩石 PBR 貼圖）。
 * 4 種形狀快取共用（不隨單位 dispose）。
 */
const asteroidGeo = new Map<number, THREE.BufferGeometry>()
function asteroidGeometry(seed: number): THREE.BufferGeometry {
  const have = asteroidGeo.get(seed)
  if (have) return have
  const g = new THREE.IcosahedronGeometry(1, 3)
  const pos = g.attributes.position
  let st = seed * 2654435761 + 12345
  const rnd = () => {
    st = (Math.imul(st ^ (st >>> 15), 0x2c1b3c6d) + 0x6d2b79f5) | 0
    return ((st ^ (st >>> 14)) >>> 0) / 4294967296
  }
  const craters: { c: THREE.Vector3; r: number; d: number }[] = []
  for (let i = 0; i < 11; i++) {
    const c = new THREE.Vector3(rnd() * 2 - 1, rnd() * 2 - 1, rnd() * 2 - 1).normalize()
    // 前三個是大坑（遠距離也看得出來），其餘小坑
    craters.push({ c, r: i < 3 ? 0.42 + rnd() * 0.2 : 0.14 + rnd() * rnd() * 0.3, d: 0.7 + rnd() * 0.5 })
  }
  const ph = [rnd() * 9, rnd() * 9, rnd() * 9]
  const n3 = (x: number, y: number, z: number) =>
    Math.sin(x * 2.1 + ph[0]) * Math.cos(y * 1.7 + ph[1]) * Math.sin(z * 2.3 + ph[2]) * 0.6 +
    Math.sin(x * 4.7 + y * 3.1 + ph[1]) * Math.sin(z * 5.3 - x * 2.2 + ph[2]) * 0.25 +
    Math.sin(x * 11 + z * 9 + ph[0]) * Math.sin(y * 10 - z * 7) * 0.08
  const squash = new THREE.Vector3(1.2 + rnd() * 0.15, 0.78, 1 + (rnd() - 0.5) * 0.35)
  // 一側凸出的瘤，讓輪廓不對稱
  const lobe = new THREE.Vector3(rnd() * 2 - 1, (rnd() - 0.5) * 0.6, rnd() * 2 - 1).normalize()
  const v = new THREE.Vector3()
  const tone = new Float32Array(pos.count)
  for (let i = 0; i < pos.count; i++) {
    v.fromBufferAttribute(pos, i).normalize()
    // 低頻起伏放大一點，剪影才不會像顆馬鈴薯
    let d = n3(v.x, v.y, v.z) * 0.3 + Math.max(0, v.dot(lobe)) ** 2 * 0.22
    let t = 0.92 + n3(v.z * 1.3, v.x * 1.3, v.y * 1.3) * 0.12
    for (const k of craters) {
      const a = Math.acos(Math.max(-1, Math.min(1, v.dot(k.c)))) / k.r
      if (a > 1.5) continue
      // 碗狀凹陷＋坑緣：深度跟坑半徑成正比
      const bowl = a < 1 ? -(1 - a * a) * k.r * 0.32 * k.d : 0
      const rim = Math.exp(-((a - 1) ** 2) * 14) * k.r * 0.12
      d += bowl + rim
      t *= a < 0.95 ? 0.55 + a * 0.3 : 1 + rim * 2.6
    }
    tone[i] = t
    v.multiplyScalar(1 + d).multiply(squash)
    pos.setXYZ(i, v.x, v.y, v.z)
  }
  // 平滑法線：同位置頂點共用（icosphere 非索引）
  g.computeVertexNormals()
  const nrm = g.attributes.normal
  const acc = new Map<string, THREE.Vector3>()
  const keyOf = (i: number) => `${pos.getX(i).toFixed(4)},${pos.getY(i).toFixed(4)},${pos.getZ(i).toFixed(4)}`
  for (let i = 0; i < pos.count; i++) {
    const k = keyOf(i)
    const a = acc.get(k) ?? acc.set(k, new THREE.Vector3()).get(k)!
    a.x += nrm.getX(i)
    a.y += nrm.getY(i)
    a.z += nrm.getZ(i)
  }
  const uv = g.attributes.uv
  const col = new Float32Array(pos.count * 3)
  for (let i = 0; i < pos.count; i += 3) {
    // 方塊投影：依面法線的主軸選平面
    const fx = Math.abs(nrm.getX(i))
    const fy = Math.abs(nrm.getY(i))
    const fz = Math.abs(nrm.getZ(i))
    for (let j = i; j < i + 3; j++) {
      const x = pos.getX(j)
      const y = pos.getY(j)
      const z = pos.getZ(j)
      if (fy >= fx && fy >= fz) uv.setXY(j, x * 0.55, z * 0.55)
      else if (fx >= fz) uv.setXY(j, z * 0.55, y * 0.55)
      else uv.setXY(j, x * 0.55, y * 0.55)
      const t = tone[j]
      col[j * 3] = t * 1.03
      col[j * 3 + 1] = t
      col[j * 3 + 2] = t * 0.96
    }
  }
  for (let i = 0; i < pos.count; i++) {
    const a = acc.get(keyOf(i))!.clone().normalize()
    nrm.setXYZ(i, a.x, a.y, a.z)
  }
  g.setAttribute('color', new THREE.Float32BufferAttribute(col, 3))
  g.scale(0.9, 0.9, 0.9)
  g.computeBoundingSphere()
  g.userData.shared = true
  asteroidGeo.set(seed, g)
  return g
}

regModel('space.asteroid', (_d, s) => {
  const root = new THREE.Group()
  const rock = new THREE.Mesh(asteroidGeometry(s.i % 4), Mat.rock('#7a7068', 'cap', true))
  rock.castShadow = true
  rock.receiveShadow = true
  const spin = 0.6 + (s.i % 5) * 0.12
  rock.rotation.set(s.i * 1.3, s.i * 0.7, 0)
  root.add(rock)
  return { root, height: 1, update: (t) => ((rock.rotation.x = s.i * 1.3 + t * 0.2 * spin), (rock.rotation.y = s.i * 0.7 + t * 0.13 * spin)) }
})

regModel('space.sun', () => {
  const root = makeSun('#fff1d6', 2.4)
  return { root, height: 3, update: (t) => root.children[1]?.scale.setScalar(22 + Math.sin(t * 0.8) * 0.6) }
})

/**
 * 站點的碰撞半徑：client 端查不到站點 UnitDef（只在 sim worker 動態註冊），
 * 直接讀站點內容定義的 space.radius，模型大小才會跟碰撞圈、名牌位置一致
 */
function stationRadius(id: string, fallback: number | undefined): number {
  return STATION_BY_ID.get(id)?.space.radius ?? fallback ?? 3
}

for (const id of ['nyx', 'adjudicatrix', 'tenshu', 'hulk7', 'bravado', 'caldera', 'vivarium', 'portage', 'pirate']) {
  regModel('station.' + id, (def) => {
    const g = buildStationHull(id, stationHullScale(id, stationRadius(id, def?.radius)))
    // 站體緩慢自轉；船艦型（豪勇號、火口號、海盜船）船頭要對著航向，不自轉（模型內建輕微橫搖）
    const spin = (g.userData.spin as number | undefined) ?? 0.02
    const tick = g.userData.update as ((t: number) => void) | undefined
    return {
      root: g,
      height: (g.userData.height as number | undefined) ?? 3,
      update: (t, _dt, _s, state) => {
        tick?.(t)
        if (spin) g.rotation.y = t * spin
        if (state === 4) g.scale.multiplyScalar(0.995)
      },
    }
  })
}

// ───────── 天體與異物 ─────────

/** 恆星在 three 座標的位置（sim (6.5, -2.9) → three (x, h, -y)）*/
const SUN_POS = new THREE.Vector3(6.5, 0, 2.9)
/**
 * 日照方向的仰角（水平分量 1 對上 y 分量）：太空層的主光（gameScene 的平行光）從恆星上方往下打，站體都是頂光；
 * 行星的日照也抬高約 24° 跟它一致。全水平的話，行星在恆星南邊時斜俯視鏡頭幾乎只看得到夜面
 * （正南時可見盤面亮的部分從約 21% 提高到約 40%，晨昏線還是跟著公轉位置走）
 */
const SUN_LIFT = 0.45
const tmpV = new THREE.Vector3()

function planetModel(
  radius: number,
  base: string,
  atmo: string,
  look: PlanetLook,
  extra?: (g: THREE.Group) => (t: number) => void,
): ModelView {
  const p = makePlanet(radius, base, atmo, new THREE.Vector3(1, 0.3, 0), look)
  const root = new THREE.Group()
  root.add(p.mesh)
  const tick = extra?.(root)
  const mats = p.mesh.children.map((c) => (c as THREE.Mesh).material as THREE.ShaderMaterial)
  const dir = new THREE.Vector3()
  return {
    root,
    height: radius * 2,
    update: (t) => {
      p.update(t)
      tick?.(t)
      // 光照方向跟著恆星走（星體會公轉）
      root.getWorldPosition(tmpV)
      dir.subVectors(SUN_POS, tmpV).setY(0).normalize().setY(SUN_LIFT).normalize()
      for (const m of mats) m.uniforms.uSun?.value.copy(dir)
    },
  }
}

/** 行星類的外觀半徑：比碰撞半徑略大，遠景也看得出輪廓 */
const planetR = (id: string, def: { radius: number } | undefined, k: number) =>
  stationRadius(id, def?.radius) * k

/** 球面上的一點（lat/lon 弧度）→ 位置與朝外的姿態（局部 +y 朝外）*/
function onSphere(r: number, lat: number, lon: number): { p: THREE.Vector3; q: THREE.Quaternion } {
  const n = new THREE.Vector3(Math.cos(lat) * Math.sin(lon), Math.sin(lat), Math.cos(lat) * Math.cos(lon))
  return {
    p: n.clone().multiplyScalar(r),
    q: new THREE.Quaternion().setFromUnitVectors(new THREE.Vector3(0, 1, 0), n),
  }
}

const tmpM = new THREE.Matrix4()
const ONE = new THREE.Vector3(1, 1, 1)

/** 翠原星的三座軍事基地（lat、lon 弧度）：地表模型與夜面燈群共用 */
const VERDANCE_BASES = [
  [0.35, 0.4],
  [-0.25, 2.6],
  [0.15, 4.4],
] as const
/** 餘燼衛星的重力裝置高塔 */
const CINDER_TOWERS = [
  [0.6, 0.3],
  [-0.2, 2.4],
  [0.1, 4.3],
] as const

regModel('station.verdance', (def) => {
  const r = planetR('verdance', def, 1.12)
  // 夜面：淡紫的天光（美術聖經 §3.3）＋基地周圍的鈉燈光暈與聚落燈點
  const look: PlanetLook = {
    night: '#9aa0ff',
    nightK: 0.18,
    nightRim: 0.22,
    lights: '#ffb46b',
    dots: 1,
    hubs: VERDANCE_BASES.map(([lat, lon]) => onSphere(1, lat, lon).p),
  }
  return planetModel(r, '#4f7a58', '#b9a6ff', look, (g) => {
    // 地表的軍事基地：混凝土停機坪＋跑道燈＋塔台燈（貼在球體上，跟著自轉）
    const surf = (g.children[0] as THREE.Group).children[0] as THREE.Mesh
    const b = new Batcher()
    const pad = Mat.paint('#8a8c84', 0.7)
    const lamp = Mat.emissive('#ffc27a', 3)
    const beacon = Mat.emissive('#ff5a4a', 3)
    for (const [lat, lon] of VERDANCE_BASES) {
      const { p, q } = onSphere(r * 0.995, lat, lon)
      tmpM.compose(p, q, ONE)
      b.addMatrix(box(r * 0.22, 0.04, r * 0.14), pad, tmpM)
      for (let i = 0; i < 6; i++) {
        const o = onSphere(r * 1.0, lat + (i % 2 ? 1 : -1) * 0.045, lon - 0.07 + Math.floor(i / 2) * 0.07)
        tmpM.compose(o.p, o.q, ONE)
        b.addMatrix(box(0.07, 0.05, 0.07), lamp, tmpM)
      }
      const t = onSphere(r * 1.0, lat + 0.07, lon + 0.09)
      tmpM.compose(t.p, t.q, ONE)
      b.addMatrix(cyl(0.04, 0.06, 0.3, 6), pad, tmpM)
      const tt = onSphere(r * 1.0 + 0.16, lat + 0.07, lon + 0.09)
      tmpM.compose(tt.p, tt.q, ONE)
      b.addMatrix(sphere(0.06, 6, 4), beacon, tmpM)
    }
    b.build(surf, { cast: false, receive: false })
    // 兩顆軌道防衛衛星（太陽能板＋閃燈）
    const sats = new THREE.Group()
    const sb = new Batcher()
    const navs: THREE.Mesh[] = []
    for (const [a, inc] of [
      [0, 0.35],
      [Math.PI, -0.25],
    ]) {
      const x = Math.sin(a) * r * 1.45
      const z = Math.cos(a) * r * 1.45
      const y = Math.sin(inc) * r * 0.4
      sb.add(rbox(0.32, 0.22, 0.32, 0.05, 1), Mat.metal('#c4ccd3', 0.6), x, y, z)
      sb.add(box(1.1, 0.03, 0.26), Mat.metal('#1d2a4a', 0.9, false), x, y, z)
      const m = new THREE.Mesh(sphere(0.08, 8, 6), Mat.emissive('#ff3b3b', 6))
      m.position.set(x, y + 0.18, z)
      sats.add(m)
      navs.push(m)
    }
    sb.build(sats, { cast: false, receive: false })
    g.add(sats)
    return (t) => {
      sats.rotation.y = t * 0.05
      navs.forEach((n, i) => (n.visible = Math.sin(t * 3 + i * 2) > 0.3))
    }
  })
})

regModel('station.cinder', (def) => {
  const r = planetR('cinder', def, 1.2)
  // 無大氣的岩石衛星：沒有雲、改成月海＋撞擊坑；夜面由重力環的青光照著，高塔周圍一圈青色光暈
  const look: PlanetLook = {
    night: '#9cc8e0',
    nightK: 0.24,
    nightRim: 0,
    clouds: 0,
    rocky: true,
    lights: '#9fe7ff',
    dots: 0,
    hubs: CINDER_TOWERS.map(([lat, lon]) => onSphere(1, lat, lon).p),
  }
  return planetModel(r, '#58504a', '#2b2a33', look, (g) => {
    // 環形光：重力場的指示環
    const ring = new THREE.Mesh(new THREE.TorusGeometry(r * 1.45, 0.05, 8, 96), Mat.emissive('#9fe7ff', 2.2))
    ring.rotation.x = Math.PI / 2.3
    const ring2 = new THREE.Mesh(new THREE.TorusGeometry(r * 1.7, 0.025, 6, 96), Mat.emissive('#c9b6ff', 1.4))
    ring2.rotation.x = Math.PI / 2.1
    g.add(ring, ring2)
    // 重力裝置：地表三座發青光的塔（跟著星體自轉）
    const surf = (g.children[0] as THREE.Group).children[0] as THREE.Mesh
    const b = new Batcher()
    for (const [lat, lon] of CINDER_TOWERS) {
      const o = onSphere(r * 0.98, lat, lon)
      tmpM.compose(o.p, o.q, ONE)
      b.addMatrix(cyl(0.08, 0.18, 0.5, 8), Mat.metal('#3a3c42', 0.7), tmpM)
      const t = onSphere(r * 0.98 + 0.3, lat, lon)
      tmpM.compose(t.p, t.q, ONE)
      b.addMatrix(sphere(0.1, 8, 6), Mat.emissive('#9fe7ff', 4), tmpM)
    }
    b.build(surf, { cast: false, receive: false })
    // 低重力：漂浮在星體周圍的碎石帶
    const rocks = new THREE.Group()
    const rb = new Batcher()
    const rock = Mat.rock('#5a524c')
    let st = 9
    const rnd = () => ((st = (st * 16807) % 2147483647), st / 2147483647)
    for (let i = 0; i < 18; i++) {
      const a = (i / 18) * Math.PI * 2 + rnd() * 0.3
      const d = r * (1.25 + rnd() * 0.55)
      const s = 0.06 + rnd() * rnd() * 0.22
      rb.add(
        pebble(i % 4),
        rock,
        Math.sin(a) * d,
        (rnd() - 0.5) * r * 0.7,
        Math.cos(a) * d,
        rnd() * 3,
        s,
        s,
        s,
        rnd() * 3,
      )
    }
    rb.build(rocks, { cast: false, receive: false })
    g.add(rocks)
    return (t) => {
      ring.rotation.z = t * 0.15
      ring2.rotation.z = -t * 0.09
      rocks.rotation.y = t * 0.04
      rocks.position.y = Math.sin(t * 0.5) * 0.05
    }
  })
})

regModel('station.uo', (def) => {
  const r = planetR('uo', def, 1.35)
  const root = new THREE.Group()
  // 扭結的有機外殼＋內部發光：說不上是船還是生物
  const shell = new THREE.Mesh(
    new THREE.TorusKnotGeometry(r * 0.7, r * 0.22, 160, 16, 2, 3),
    Mat.organic('#3a2a4a', '#7dff9a'),
  )
  shell.castShadow = true
  const core = new THREE.Mesh(new THREE.IcosahedronGeometry(r * 0.35, 2), Mat.emissive('#7dff9a', 3))
  // 光暈：半透明紫色外膜（用快取的玻璃材質，不要改共用的 Mat.emissive 材質的透明度）
  const halo = new THREE.Mesh(new THREE.IcosahedronGeometry(r * 0.55, 1), Mat.glass('#b26bff', 0.3))
  root.add(shell, core, halo)
  return {
    root,
    height: r * 2,
    update: (t) => {
      shell.rotation.y = t * 0.12
      shell.rotation.x = Math.sin(t * 0.21) * 0.3
      const k = 1 + Math.sin(t * 2.3) * 0.08
      core.scale.setScalar(k)
      halo.scale.setScalar(1.1 + Math.sin(t * 1.1) * 0.12)
    },
  }
})
