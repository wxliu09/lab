// 地上道具的模型：依外型分類（itemShape.ts）有 10 種外型，分類色當強調色（發光條、螢幕、藥液、十字旁的邊線）。
// 成本：每個道具 2 個 draw call（本體＋發光；再加 units.ts 的選取圈，地上道具不再疊腳下光暈），以前是本體＋色帶＋光圈＋選取圈＋腳下光暈 5 個：
// - 本體：一種外型一份合併好的幾何（零件用頂點色上色，底部壓暗當假 AO），所有道具共用同一個 PBR 材質（金屬貼圖的粗糙度／髒污變化）；
// - 發光：一種外型一份合併好的幾何（發光零件＋地上的光圈，頂點色控制亮度），每種分類色一個 additive 材質（脈動一起算）。
// 幾何與材質全部共用（userData.shared／keep），移除道具時不釋放。
import * as THREE from 'three'
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js'
import { box, cyl, rbox, sphere } from '../batch'
import { withFog } from '../materials'
import { metalSet } from '../tex'
import { ITEM_SHAPES, type ItemShape } from './itemShape'

/** 分類色（地上道具的強調色）*/
export const ITEM_CAT_COLOR: Record<string, string> = {
  medical: '#5cf2a5',
  combat: '#ff7a2a',
  utility: '#9fe7ff',
  suit: '#ffc23d',
  key: '#ffe08a',
  module: '#b28cff',
  quest: '#ff7eb6',
  fun: '#ff7eb6',
  detect: '#33ffd1',
}

/** 一個零件：幾何、顏色（本體 = 頂點色；發光 = 亮度倍率）、位置、旋轉、縮放 */
interface Part {
  g: THREE.BufferGeometry
  /** 本體：sRGB 色；發光：亮度（0..1，乘在分類色上）*/
  c: string | number
  p?: [number, number, number]
  r?: [number, number, number]
  s?: [number, number, number]
  /** UV 倍率（盒子的 UV 已經是公尺 × 0.5；圓柱、球是 0..1）*/
  uv?: number
}

const tmpM = new THREE.Matrix4()
const tmpQ = new THREE.Quaternion()
const tmpE = new THREE.Euler()
const tmpS = new THREE.Vector3()
const tmpP = new THREE.Vector3()
const tmpC = new THREE.Color()

/** 零件合成一個幾何：每個零件自己的頂點色（本體加上由下往上的明暗：底部壓暗當假 AO）*/
function merge(parts: Part[], glow: boolean): THREE.BufferGeometry {
  const list: THREE.BufferGeometry[] = []
  for (const pt of parts) {
    const g = pt.g.index ? pt.g.toNonIndexed() : pt.g.clone()
    for (const k of Object.keys(g.attributes)) if (k !== 'position' && k !== 'normal' && k !== 'uv') g.deleteAttribute(k)
    if (!g.attributes.normal) g.computeVertexNormals()
    const n = g.attributes.position.count
    if (!g.attributes.uv) g.setAttribute('uv', new THREE.Float32BufferAttribute(new Float32Array(n * 2), 2))
    const uv = g.attributes.uv
    const k = pt.uv ?? 3
    for (let i = 0; i < uv.count; i++) uv.setXY(i, uv.getX(i) * k, uv.getY(i) * k)
    // 頂點色：本體 = 零件色 × 高度明暗（零件自己的範圍內，底 0.72 → 頂 1.0）；發光 = 亮度
    g.computeBoundingBox()
    const bb = g.boundingBox!
    const h = Math.max(1e-4, bb.max.y - bb.min.y)
    const col = new Float32Array(n * 3)
    if (typeof pt.c === 'number') col.fill(pt.c)
    else {
      tmpC.set(pt.c)
      const pos = g.attributes.position
      for (let i = 0; i < n; i++) {
        const sh = glow ? 1 : 0.72 + 0.28 * ((pos.getY(i) - bb.min.y) / h)
        col[i * 3] = tmpC.r * sh
        col[i * 3 + 1] = tmpC.g * sh
        col[i * 3 + 2] = tmpC.b * sh
      }
    }
    g.setAttribute('color', new THREE.Float32BufferAttribute(col, 3))
    const [x, y, z] = pt.p ?? [0, 0, 0]
    const [rx, ry, rz] = pt.r ?? [0, 0, 0]
    const [sx, sy, sz] = pt.s ?? [1, 1, 1]
    tmpE.set(rx, ry, rz)
    tmpQ.setFromEuler(tmpE)
    tmpP.set(x, y, z)
    tmpS.set(sx, sy, sz)
    tmpM.compose(tmpP, tmpQ, tmpS)
    g.applyMatrix4(tmpM)
    list.push(g)
  }
  const out = mergeGeometries(list, false)!
  for (const g of list) g.dispose()
  out.computeBoundingSphere()
  out.userData.shared = true
  return out
}

// ───── 色票（美術聖經 §3.1：帶藍的冷灰鋼、警示黃、工業色）─────
const STEEL_D = '#30363d'
const STEEL = '#3d454e'
const STEEL_L = '#5b6570'
const BRIGHT = '#9aa4ad'
const RUBBER = '#1c1f23'
const OLIVE = '#4b5433'
const OLIVE_D = '#383f26'
const MED_GREEN = '#2f7a58'
const WHITE = '#e4e8e6'
const TOOL_BLUE = '#4a5d70'
const BAG = '#4c524e'
const GOLD = '#b89443'

/** 頭盔面罩：+z 方向的一塊球面（phi 0.15π..0.85π、theta 0.32π..0.6π）*/
const visor = new THREE.SphereGeometry(0.109, 12, 5, Math.PI * 0.15, Math.PI * 0.7, Math.PI * 0.32, Math.PI * 0.28)
/** 地上光圈（所有外型共用；發光幾何的一部分，跟著道具上下浮動）*/
const ring = new THREE.RingGeometry(0.3, 0.38, 28).rotateX(-Math.PI / 2)
/** 光圈在道具本體座標裡的高度（道具浮在 FLOAT_Y 上下 BOB）*/
const FLOAT_Y = 0.13
const BOB = 0.025
const RING_Y = 0.03 - FLOAT_Y

/** height = 名牌高度；scale = 整個外型放大（小東西放大到預設鏡頭距離也看得出外型）*/
const SHAPES: Record<ItemShape, { body: () => Part[]; glow: () => Part[]; height: number; scale?: number }> = {
  // 長槍盒：扁長的深色硬殼，蓋子接縫一圈發光、兩個扣環、側面提把
  weapon: {
    height: 0.4,
    body: () => [
      { g: rbox(0.66, 0.1, 0.26, 0.03), c: STEEL_D, p: [0, 0.05, 0] },
      { g: rbox(0.64, 0.06, 0.245, 0.025), c: STEEL, p: [0, 0.13, 0] },
      // 蓋子上的壓紋（兩條長肋）
      { g: box(0.5, 0.012, 0.03), c: STEEL_L, p: [0, 0.166, -0.06] },
      { g: box(0.5, 0.012, 0.03), c: STEEL_L, p: [0, 0.166, 0.06] },
      // 扣環
      { g: box(0.045, 0.06, 0.02), c: BRIGHT, p: [-0.22, 0.1, 0.135] },
      { g: box(0.045, 0.06, 0.02), c: BRIGHT, p: [0.22, 0.1, 0.135] },
      // 提把
      { g: rbox(0.16, 0.03, 0.035, 0.012), c: RUBBER, p: [0, 0.08, 0.165] },
      { g: box(0.02, 0.03, 0.04), c: STEEL_D, p: [-0.07, 0.08, 0.145] },
      { g: box(0.02, 0.03, 0.04), c: STEEL_D, p: [0.07, 0.08, 0.145] },
    ],
    glow: () => [
      { g: box(0.668, 0.012, 0.27), c: 1, p: [0, 0.1, 0] },
      { g: box(0.05, 0.004, 0.022), c: 1, p: [0.26, 0.162, 0] },
    ],
  },
  // 開口彈藥箱：橄欖綠木箱，裡面三顆手榴彈露出圓頂；正面一條警示發光條
  ordnance: {
    height: 0.36,
    body: () => [
      { g: box(0.4, 0.03, 0.3), c: OLIVE_D, p: [0, 0.015, 0] },
      { g: box(0.4, 0.17, 0.03), c: OLIVE, p: [0, 0.1, 0.135] },
      { g: box(0.4, 0.17, 0.03), c: OLIVE, p: [0, 0.1, -0.135] },
      { g: box(0.03, 0.17, 0.24), c: OLIVE, p: [0.185, 0.1, 0] },
      { g: box(0.03, 0.17, 0.24), c: OLIVE, p: [-0.185, 0.1, 0] },
      // 角鐵
      { g: box(0.035, 0.18, 0.035), c: STEEL, p: [0.19, 0.1, 0.14] },
      { g: box(0.035, 0.18, 0.035), c: STEEL, p: [-0.19, 0.1, 0.14] },
      { g: box(0.035, 0.18, 0.035), c: STEEL, p: [0.19, 0.1, -0.14] },
      { g: box(0.035, 0.18, 0.035), c: STEEL, p: [-0.19, 0.1, -0.14] },
      // 側面繩把
      { g: box(0.02, 0.025, 0.11), c: RUBBER, p: [0.21, 0.13, 0] },
      { g: box(0.02, 0.025, 0.11), c: RUBBER, p: [-0.21, 0.13, 0] },
      // 手榴彈：彈體＋引信頭
      { g: sphere(0.068, 12, 8), c: OLIVE_D, p: [-0.1, 0.15, -0.02], s: [1, 1.15, 1], uv: 0.6 },
      { g: sphere(0.068, 12, 8), c: '#55603a', p: [0.0, 0.155, 0.04], s: [1, 1.15, 1], uv: 0.6 },
      { g: sphere(0.068, 12, 8), c: OLIVE_D, p: [0.1, 0.15, -0.03], s: [1, 1.15, 1], uv: 0.6 },
      { g: cyl(0.022, 0.026, 0.045, 8), c: BRIGHT, p: [-0.1, 0.235, -0.02], uv: 0.6 },
      { g: cyl(0.022, 0.026, 0.045, 8), c: BRIGHT, p: [0.0, 0.24, 0.04], uv: 0.6 },
      { g: cyl(0.022, 0.026, 0.045, 8), c: BRIGHT, p: [0.1, 0.235, -0.03], uv: 0.6 },
    ],
    glow: () => [
      { g: box(0.3, 0.026, 0.006), c: 1, p: [0, 0.13, 0.152] },
      { g: sphere(0.014, 6, 4), c: 1, p: [0.0, 0.268, 0.04] },
    ],
  },
  // 醫療包：綠底白十字（ISO 急救標誌的配色），蓋子接縫發光，正面提把
  medkit: {
    height: 0.36,
    body: () => [
      { g: rbox(0.36, 0.15, 0.28, 0.035), c: MED_GREEN, p: [0, 0.075, 0] },
      { g: box(0.17, 0.014, 0.055), c: WHITE, p: [0, 0.155, 0] },
      { g: box(0.055, 0.014, 0.17), c: WHITE, p: [0, 0.155, 0] },
      { g: rbox(0.13, 0.03, 0.03, 0.012), c: RUBBER, p: [0, 0.09, 0.158] },
      { g: box(0.018, 0.03, 0.03), c: '#1e4c38', p: [-0.06, 0.09, 0.145] },
      { g: box(0.018, 0.03, 0.03), c: '#1e4c38', p: [0.06, 0.09, 0.145] },
      { g: box(0.03, 0.04, 0.02), c: BRIGHT, p: [-0.13, 0.11, 0.142] },
      { g: box(0.03, 0.04, 0.02), c: BRIGHT, p: [0.13, 0.11, 0.142] },
    ],
    glow: () => [{ g: box(0.366, 0.01, 0.286), c: 1, p: [0, 0.11, 0] }],
  },
  // 藥罐：一高一矮的白色罐子，深色蓋，中間一圈透出分類色的藥液
  pharma: {
    height: 0.4,
    body: () => [
      { g: cyl(0.072, 0.075, 0.26, 14), c: WHITE, p: [-0.05, 0.13, -0.02], uv: 0.6 },
      { g: cyl(0.078, 0.078, 0.05, 14), c: STEEL, p: [-0.05, 0.285, -0.02], uv: 0.6 },
      { g: cyl(0.03, 0.03, 0.02, 8), c: BRIGHT, p: [-0.05, 0.318, -0.02], uv: 0.6 },
      { g: cyl(0.05, 0.052, 0.16, 12), c: '#c9d0d4', p: [0.085, 0.08, 0.05], uv: 0.6 },
      { g: cyl(0.055, 0.055, 0.04, 12), c: '#6a3a3a', p: [0.085, 0.18, 0.05], uv: 0.6 },
      // 倒在旁邊的針劑
      { g: cyl(0.018, 0.018, 0.16, 8), c: '#d8dde0', p: [0.06, 0.02, -0.09], r: [0, 0.5, Math.PI / 2], uv: 0.6 },
      { g: cyl(0.004, 0.004, 0.05, 4), c: BRIGHT, p: [0.13, 0.02, -0.13], r: [0, 0.5, Math.PI / 2], uv: 0.6 },
    ],
    glow: () => [
      { g: cyl(0.076, 0.079, 0.11, 14, true), c: 1, p: [-0.05, 0.13, -0.02] },
      { g: cyl(0.054, 0.056, 0.06, 12, true), c: 1, p: [0.085, 0.08, 0.05] },
      { g: cyl(0.02, 0.02, 0.06, 8, true), c: 1, p: [0.05, 0.02, -0.084], r: [0, 0.5, Math.PI / 2] },
    ],
  },
  // 工具箱：鋼藍色箱體＋淺一階的蓋子、拱形提把、扣環，正面一塊發光標籤
  toolbox: {
    height: 0.4,
    body: () => [
      { g: rbox(0.38, 0.14, 0.2, 0.02), c: TOOL_BLUE, p: [0, 0.07, 0] },
      { g: rbox(0.39, 0.045, 0.21, 0.015), c: '#5a6f83', p: [0, 0.16, 0] },
      { g: box(0.022, 0.075, 0.03), c: STEEL_D, p: [-0.1, 0.215, 0] },
      { g: box(0.022, 0.075, 0.03), c: STEEL_D, p: [0.1, 0.215, 0] },
      { g: cyl(0.017, 0.017, 0.22, 8), c: RUBBER, p: [0, 0.255, 0], r: [0, 0, Math.PI / 2], uv: 0.6 },
      { g: box(0.035, 0.045, 0.016), c: BRIGHT, p: [-0.14, 0.135, 0.105] },
      { g: box(0.035, 0.045, 0.016), c: BRIGHT, p: [0.14, 0.135, 0.105] },
      // 側面露出一截扳手
      { g: box(0.16, 0.02, 0.03), c: BRIGHT, p: [0.22, 0.05, -0.04], r: [0, 0.35, 0] },
      { g: rbox(0.05, 0.022, 0.05, 0.008), c: BRIGHT, p: [0.29, 0.05, -0.07], r: [0, 0.35, 0] },
    ],
    glow: () => [
      { g: box(0.15, 0.035, 0.005), c: 1, p: [0, 0.07, 0.102] },
      { g: box(0.395, 0.006, 0.215), c: 0.55, p: [0, 0.139, 0] },
    ],
  },
  // 手持掃描器：深色機身、橡膠握把、一根天線，上面一大片發光螢幕（俯視也讀得出是「裝置」）
  scanner: {
    scale: 1.3,
    height: 0.36,
    body: () => [
      { g: rbox(0.26, 0.05, 0.17, 0.02), c: STEEL_D, p: [0.03, 0.025, 0] },
      { g: rbox(0.1, 0.045, 0.075, 0.018), c: RUBBER, p: [-0.15, 0.024, 0] },
      { g: box(0.2, 0.006, 0.13), c: '#14181c', p: [0.04, 0.052, 0] },
      { g: cyl(0.008, 0.008, 0.16, 6), c: BRIGHT, p: [0.13, 0.13, -0.06], uv: 0.6 },
      { g: box(0.03, 0.02, 0.03), c: STEEL, p: [0.13, 0.055, -0.06] },
      { g: box(0.02, 0.012, 0.02), c: BRIGHT, p: [-0.07, 0.052, 0.06] },
      { g: box(0.02, 0.012, 0.02), c: BRIGHT, p: [-0.07, 0.052, -0.06] },
    ],
    glow: () => [
      { g: box(0.17, 0.004, 0.11), c: 0.85, p: [0.045, 0.057, 0] },
      { g: sphere(0.016, 6, 4), c: 1, p: [0.13, 0.215, -0.06] },
    ],
  },
  // 摺疊衣袋：兩條束帶綁住的衣物袋，上面放著頭盔（發光的面罩）
  suit: {
    height: 0.4,
    body: () => [
      { g: rbox(0.52, 0.1, 0.38, 0.045), c: BAG, p: [0, 0.05, 0] },
      { g: rbox(0.46, 0.045, 0.32, 0.02), c: '#646a64', p: [-0.01, 0.115, 0.005] },
      { g: box(0.045, 0.112, 0.39), c: RUBBER, p: [-0.17, 0.056, 0] },
      { g: box(0.045, 0.112, 0.39), c: RUBBER, p: [0.04, 0.056, 0] },
      { g: box(0.05, 0.03, 0.04), c: BRIGHT, p: [-0.17, 0.115, 0.17] },
      { g: box(0.05, 0.03, 0.04), c: BRIGHT, p: [0.04, 0.115, 0.17] },
      // 頭盔
      { g: sphere(0.105, 14, 10), c: '#c3c9cd', p: [0.15, 0.2, -0.02], s: [1, 0.85, 1], uv: 0.6 },
      { g: cyl(0.085, 0.095, 0.035, 14), c: STEEL, p: [0.15, 0.14, -0.02], uv: 0.6 },
    ],
    glow: () => [
      // 面罩：頭盔正面的一片（球面的一塊，略大於頭盔）
      { g: visor, c: 0.9, p: [0.15, 0.2, -0.02], s: [1, 0.85, 1] },
      { g: box(0.525, 0.01, 0.385), c: 0.6, p: [0, 0.075, 0] },
    ],
  },
  // 卡片：兩張疊在一起（放大到俯視看得見），上面那張有晶片與發光色條
  card: {
    scale: 1.15,
    height: 0.3,
    body: () => [
      { g: rbox(0.25, 0.014, 0.16, 0.006), c: '#5a6470', p: [0.03, 0.007, 0.02], r: [0, 0.45, 0] },
      { g: rbox(0.25, 0.014, 0.16, 0.006), c: '#dfe4e8', p: [0, 0.022, 0], r: [0, -0.15, 0] },
      { g: box(0.045, 0.004, 0.035), c: GOLD, p: [-0.06, 0.031, 0.025], r: [0, -0.15, 0] },
      { g: box(0.1, 0.003, 0.012), c: '#7a8590', p: [0.04, 0.031, 0.035], r: [0, -0.15, 0] },
      { g: box(0.07, 0.003, 0.012), c: '#7a8590', p: [0.03, 0.031, 0.06], r: [0, -0.15, 0] },
    ],
    glow: () => [{ g: box(0.25, 0.004, 0.038), c: 1, p: [0.005, 0.031, -0.05], r: [0, -0.15, 0] }],
  },
  // 能量芯：上下金屬端蓋、三根支柱，中間一截發光的核心
  core: {
    scale: 1.15,
    height: 0.42,
    body: () => [
      { g: cyl(0.1, 0.105, 0.05, 14), c: STEEL, p: [0, 0.025, 0], uv: 0.6 },
      { g: cyl(0.1, 0.1, 0.05, 14), c: STEEL, p: [0, 0.275, 0], uv: 0.6 },
      { g: cyl(0.045, 0.06, 0.03, 10), c: BRIGHT, p: [0, 0.315, 0], uv: 0.6 },
      { g: box(0.022, 0.22, 0.022), c: STEEL_L, p: [0.085, 0.15, 0] },
      { g: box(0.022, 0.22, 0.022), c: STEEL_L, p: [-0.0425, 0.15, 0.0736] },
      { g: box(0.022, 0.22, 0.022), c: STEEL_L, p: [-0.0425, 0.15, -0.0736] },
      { g: cyl(0.05, 0.05, 0.2, 10), c: '#20262c', p: [0, 0.15, 0], uv: 0.6 },
    ],
    glow: () => [{ g: cyl(0.068, 0.068, 0.19, 14, true), c: 1, p: [0, 0.15, 0] }],
  },
  // 補給箱（其他）：方形金屬箱，中間一圈發光色帶、四角包邊
  crate: {
    height: 0.4,
    body: () => [
      { g: rbox(0.28, 0.24, 0.28, 0.04), c: '#7a838c', p: [0, 0.12, 0] },
      { g: box(0.296, 0.03, 0.04), c: STEEL_D, p: [0, 0.225, 0] },
      { g: box(0.04, 0.03, 0.296), c: STEEL_D, p: [0, 0.225, 0] },
      { g: box(0.296, 0.05, 0.296), c: STEEL, p: [0, 0.025, 0] },
    ],
    glow: () => [{ g: box(0.29, 0.035, 0.29), c: 1, p: [0, 0.13, 0] }],
  },
}

interface ShapeGeo {
  body: THREE.BufferGeometry
  glow: THREE.BufferGeometry
  height: number
}

const geoCache = new Map<ItemShape, ShapeGeo>()

function shapeGeo(k: ItemShape): ShapeGeo {
  let g = geoCache.get(k)
  if (!g) {
    const s = SHAPES[k]
    const sc = s.scale ?? 1
    const body = merge(s.body(), false)
    const glow = merge(s.glow(), true)
    if (sc !== 1) {
      body.scale(sc, sc, sc)
      glow.scale(sc, sc, sc)
    }
    // 光圈：地上（不跟著外型放大），亮度壓低（以前是 0.3±0.15 的不透明度）
    const halo = merge([{ g: ring, c: 0.22, p: [0, RING_Y, 0] }], true)
    const glowAll = mergeGeometries([glow, halo], false)!
    glow.dispose()
    halo.dispose()
    glowAll.computeBoundingSphere()
    glowAll.userData.shared = true
    body.computeBoundingSphere()
    g = { body, glow: glowAll, height: s.height * sc }
    geoCache.set(k, g)
  }
  return g
}

let bodyMat: THREE.MeshStandardMaterial | null = null

/** 所有道具共用的本體材質：淺色金屬貼圖（粗糙度、髒污、細紋）× 頂點色 */
function itemBodyMat(): THREE.MeshStandardMaterial {
  if (!bodyMat) {
    const set = metalSet('#c9cdd1', 33, false)
    bodyMat = withFog(new THREE.MeshStandardMaterial({ map: set.map, roughnessMap: set.roughnessMap, normalMap: set.normalMap, roughness: 1, metalness: 0.3, vertexColors: true }))
    bodyMat.userData.keep = true
  }
  return bodyMat
}

const glowMats = new Map<string, THREE.MeshBasicMaterial>()

/** 發光材質：每種分類色一個（additive；頂點色控制各零件的亮度；不透明度由 pulseItemGlow 每幀脈動）*/
function itemGlowMat(col: string): THREE.MeshBasicMaterial {
  let m = glowMats.get(col)
  if (!m) {
    m = new THREE.MeshBasicMaterial({ color: new THREE.Color(col).multiplyScalar(2.4), vertexColors: true, transparent: true, opacity: 0.85, depthWrite: false, blending: THREE.AdditiveBlending })
    m.userData.keep = true
    glowMats.set(col, m)
  }
  return m
}

let pulsedAt = -1

/** 發光的脈動（同色的道具共用材質：一幀只算一次）*/
function pulseItemGlow(t: number): void {
  if (t === pulsedAt) return
  pulsedAt = t
  const k = 0.78 + Math.sin(t * 3) * 0.17
  for (const m of glowMats.values()) m.opacity = k
}

export interface GroundItemView {
  root: THREE.Group
  height: number
  update(t: number): void
}

/** 建一個地上道具：shape = 外型、col = 分類色、seed = 浮動相位 */
export function buildGroundItem(shape: ItemShape, col: string, seed: number): GroundItemView {
  const sg = shapeGeo(shape)
  const root = new THREE.Group()
  const g = new THREE.Group()
  root.add(g)
  const body = new THREE.Mesh(sg.body, itemBodyMat())
  body.castShadow = true
  const glow = new THREE.Mesh(sg.glow, itemGlowMat(col))
  glow.castShadow = false
  glow.renderOrder = 2
  g.add(body, glow)
  g.position.y = FLOAT_Y
  return {
    root,
    height: sg.height,
    update(t) {
      g.position.y = FLOAT_Y + Math.sin(t * 2.2 + seed) * BOB
      g.rotation.y = t * 0.6 + seed
      pulseItemGlow(t)
    },
  }
}

/** 預編譯用：本體與發光各一個（所有外型、所有分類色共用這兩支 shader）*/
export function groundItemWarmMeshes(): THREE.Object3D[] {
  const sg = shapeGeo('crate')
  return [new THREE.Mesh(sg.body, itemBodyMat()), new THREE.Mesh(sg.glow, itemGlowMat(ITEM_CAT_COLOR.utility))]
}

/** 測試用：每種外型的三角形數（本體、發光）*/
export function groundItemStats(): Record<ItemShape, [number, number]> {
  const out = {} as Record<ItemShape, [number, number]>
  for (const k of ITEM_SHAPES) {
    const sg = shapeGeo(k)
    out[k] = [sg.body.attributes.position.count / 3, sg.glow.attributes.position.count / 3]
  }
  return out
}
