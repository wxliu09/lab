// 異形：原型體、三條 T2 分支、九種 T3、輔助單位、繭與卵（美術聖經 §9）。正面朝 local +Z，腳底在 y=0。
// spawn 型（def id 結尾 .spawn）共用同一個模型：縮小 0.85、發光偏暗（creatureKit.variant）。
import * as THREE from 'three'
import type { UnitDef } from '../../shared/content/types'
import type { SnapEntity } from '../../shared/protocol/messages'
import { capsule, cyl, torus } from '../batch'
import { regModel, type ModelView } from './index'
import {
  Life,
  Tentacle,
  XENO,
  animBiped,
  animQuad,
  animSpider,
  buildBiped,
  buildQuad,
  chitin,
  claws,
  dome,
  drop,
  ell,
  flesh,
  glow,
  grp,
  hornGeo,
  lathe,
  liveGlass,
  liveGlow,
  liveLiquid,
  lumpGeo,
  part,
  pustules,
  rng,
  smooth,
  sphereGeo,
  spike,
  spikeGeo,
  spiderLeg,
  stepOf,
  tone,
  topple,
  variant,
  vein,
  type SpiderLeg,
  type Variant,
} from './creatureKit'

// ───── 共用材質 ─────
const SKIN = () => flesh('#1c1030', XENO.main, 0.26, 0.6)
const SKIN2 = () => flesh('#2c1a4e', XENO.main, 0.3, 0.55)
const PLATE = () => chitin('#2b1a44', XENO.main, 0.4)
const BONE = () => smooth('#c9bde0', XENO.main, 0.5, 0.35)
const RED = () => chitin('#5e0f1c', XENO.main, 0.45, 0.5)
const REDSKIN = () => flesh('#240a12', XENO.main, 0.3, 0.55)

interface Base {
  v: Variant
  root: THREE.Group
  L: Life
}

function base(def: UnitDef | undefined, s: SnapEntity, stride = 6, atkRate = 1.1): Base {
  const v = variant(def, s)
  const root = new THREE.Group()
  return { v, root, L: new Life(v.ph, stride, atkRate) }
}

/** 套用 spawn 縮放與整體縮放，回傳 ModelView */
function view(b: Base, scale: number, height: number, update: (t: number, dt: number, speed: number, state: number) => void): ModelView {
  b.root.scale.setScalar(scale * b.v.scale)
  return {
    root: b.root,
    height: height * scale * b.v.scale,
    update(t, dt, speed, state) {
      b.L.step(t, dt, speed, state)
      update(t, dt, speed, state)
    },
  }
}

/** 發光材質的心跳脈動（死亡時熄滅）*/
function beat(m: THREE.MeshStandardMaterial, k: number, t: number, L: Life, f = 2.2, depth = 0.45): void {
  const h = Math.pow(0.5 + 0.5 * Math.sin(t * f + L.ph), 3)
  m.emissiveIntensity = k * (1 - depth + depth * 2 * h + L.atk * 0.5 + L.cast * 0.6) * (1 - L.dead * 0.85)
}

/** 異形頭：長顱、內彎下顎鉗、三對發光眼、後掠冠刺 */
function xenoHead(head: THREE.Object3D, skin: THREE.Material, plate: THREE.Material, bone: THREE.Material, gl: THREE.Material, k = 1): THREE.Group {
  ell(head, skin, 0, 0.02 * k, 0.1 * k, 0.15 * k, 0.13 * k, 0.3 * k)
  part(head, dome(1, 10, 4, Math.PI * 0.5), bone, 0, 0.06 * k, 0.04 * k, 0.12 * k, 0.1 * k, 0.3 * k, 0.1)
  for (let i = 0; i < 3; i++) spike(head, 0.045 * k, (0.36 - i * 0.07) * k, i === 0 ? bone : plate, 0, 0.12 * k, (-0.04 - i * 0.09) * k, -1.25 - i * 0.12, 0, 4)
  const jaw = grp(head, 0, -0.06 * k, 0.04 * k)
  ell(jaw, skin, 0, -0.03 * k, 0.13 * k, 0.11 * k, 0.05 * k, 0.24 * k)
  ell(jaw, gl, 0, 0.01 * k, 0.16 * k, 0.07 * k, 0.025 * k, 0.15 * k)
  for (const sd of [-1, 1]) {
    part(jaw, hornGeo(0.3 * k, 0.03 * k, 0.55), bone, sd * 0.09 * k, -0.02 * k, 0.24 * k, 1, 1, 1, Math.PI / 2, -sd * Math.PI / 2, 0)
    for (let i = 0; i < 3; i++) ell(head, gl, sd * (0.11 - i * 0.012) * k, (0.06 - i * 0.012) * k, (0.27 - i * 0.07) * k, 0.026 * k, 0.024 * k, 0.028 * k, 6, 4)
  }
  return jaw
}

/** 背上一排甲殼片＋棘刺 */
function dorsal(parent: THREE.Object3D, n: number, z0: number, z1: number, y0: number, y1: number, w: number, plate: THREE.Material, spikeH = 0.18, len = 0.17, h = 0.12, spikeM: THREE.Material = plate): void {
  for (let i = 0; i < n; i++) {
    const u = i / (n - 1)
    const s = 1 - Math.abs(u - 0.4) * 0.5
    const z = THREE.MathUtils.lerp(z0, z1, u)
    const y = THREE.MathUtils.lerp(y0, y1, u)
    part(parent, dome(1, 10, 4, Math.PI * 0.42), plate, 0, y, z, w * s, h * s, len, -0.2)
    if (spikeH > 0) spike(parent, 0.035 * s, spikeH * s, spikeM, 0, y + h * 0.6, z - len * 0.3, -1.05, 0, 4)
  }
}

// ═════════════ T1 原型體：精瘦四足掠食者 ═════════════

regModel('xeno.protoform', (def, s) => {
  const b = base(def, s, 6.5, 0.9)
  const skin = SKIN()
  const plate = PLATE()
  const bone = BONE()
  const gl = liveGlow(tone(XENO.acc, b.v), 2.4 * b.v.gk)
  const r = buildQuad(b.root, {
    skin,
    chest: [0.3, 0.31, 0.5],
    pelvis: [0.21, 0.21, 0.3],
    chestZ: 0.32,
    pelvisZ: -0.5,
    shH: 0.94,
    hipH: 0.86,
    legW: 0.3,
    fl: [0.5, 0.35, -0.14],
    rl: [0.5, -0.6, 0.42],
    legR: [0.095, 0.055],
    neckLen: 0.4,
    neckPitch: 0.55,
    tail: { len: 1.4, r0: 0.1, r1: 0.025, bones: 6, tub: 12, rad: 6, ridge: 0.1 },
  })
  const jaw = xenoHead(r.head, skin, plate, bone, gl, 1.2)
  dorsal(r.spine, 4, 0.7, -0.72, 1.2, 1.06, 0.27, plate, 0.2, 0.3, 0.12, bone)
  for (const sd of [-1, 1]) vein(r.chest, [[sd * 0.29, 0.05, 0.32], [sd * 0.31, -0.05, 0.02], [sd * 0.26, -0.12, -0.3]], 0.02, gl, 8)
  for (const l of r.legs) {
    ell(l.hip, plate, 0, -0.2, l.front ? -0.03 : 0.03, 0.105, 0.22, 0.11)
    spike(l.knee, 0.03, 0.18, bone, 0, 0, l.front ? -0.04 : 0.04, l.front ? -2.2 : 2.2, 0, 4)
    claws(l.foot, 2, 0.17, 0.025, bone, 0.7)
  }
  part(r.tail!.tip, hornGeo(0.32, 0.05, 0.7), gl, 0, 0, 0)
  return view(b, 1, 1.45, (t) => {
    const L = b.L
    animQuad(r, L, t, 0.5, 0.06, 0.35)
    jaw.rotation.x = Math.max(0, L.strike) * L.atk * 0.55 + Math.sin(t * 1.3 + L.ph) * 0.03
    beat(gl, 2.4 * b.v.gk, t, L)
  })
})

// ═════════════ T2 能量：熵光體（半透明發光、浮游觸手）═════════════

regModel('xeno.lumen', (def, s) => {
  const b = base(def, s, 4, 1.4)
  const hover = 1.3
  const fl = grp(b.root, 0, hover, 0)
  const bellG = grp(fl)
  const bell = liveLiquid(tone('#8a4cff', b.v), 0.48, 0.55 * b.v.gk)
  const core = liveGlow(tone(XENO.acc, b.v), 3 * b.v.gk)
  const rimG = liveGlow(tone('#b48cff', b.v), 2.2 * b.v.gk)
  const prof: [number, number][] = [
    [0.01, 0.66],
    [0.2, 0.64],
    [0.38, 0.56],
    [0.53, 0.42],
    [0.63, 0.24],
    [0.67, 0.06],
    [0.62, -0.04],
    [0.52, -0.02],
  ]
  part(bellG, lathe(prof, 20), bell, 0, 0, 0, 1, 1, 1.22)
  // 內臟：發光核心＋扭曲的神經團
  const coreM = ell(bellG, core, 0, 0.26, 0.05, 0.2, 0.18, 0.22)
  part(bellG, lumpGeo(0.3, 3, 0.25, 12, 8), SKIN2(), 0, 0.32, -0.08, 1, 0.7, 1.1)
  part(bellG, torus(0.62, 0.028, 6, 40), rimG, 0, 0.0, 0, 1, 1.22, 1, Math.PI / 2)
  // 前方的眼帶（指出面向）
  for (let i = 0; i < 5; i++) {
    const a = (i - 2) * 0.28
    ell(bellG, core, Math.sin(a) * 0.6, 0.22, Math.cos(a) * 0.7, 0.04, 0.04, 0.04, 8, 6)
  }
  // 頂上的觸鬚冠
  for (let i = 0; i < 3; i++) spike(bellG, 0.03, 0.3, rimG, (i - 1) * 0.12, 0.6, -0.1 - Math.abs(i - 1) * 0.05, -0.7, (1 - i) * 0.4)
  // 垂下的浮游觸手（粗紫、細青交錯）
  const tents: Tentacle[] = []
  const tm = SKIN2()
  const tg = liveLiquid(tone(XENO.acc, b.v), 0.7, 1.4 * b.v.gk)
  for (let i = 0; i < 7; i++) {
    const a = (i / 7) * Math.PI * 2 + 0.3
    const thick = i % 2 === 0
    const g = grp(bellG, Math.sin(a) * 0.42, 0.0, Math.cos(a) * 0.5, Math.PI - Math.cos(a) * 0.25, 0, Math.sin(a) * 0.25)
    const T = new Tentacle(g, { len: thick ? 1.15 : 1.25, r0: thick ? 0.07 : 0.04, r1: 0.012, bones: 6, ridge: thick ? 0.12 : 0 }, thick ? tm : tg)
    tents.push(T)
  }
  // 前方兩條長觸鬚（攻擊時前伸）
  const feel: Tentacle[] = []
  for (const sd of [-1, 1]) {
    const g = grp(bellG, sd * 0.2, 0.05, 0.62, Math.PI * 0.62, 0, sd * 0.2)
    feel.push(new Tentacle(g, { len: 1.0, r0: 0.04, r1: 0.01, bones: 6 }, tg))
  }
  // 環繞的光點
  const motes: THREE.Mesh[] = []
  for (let i = 0; i < 5; i++) motes.push(ell(fl, core, 0, 0, 0, 0.035, 0.035, 0.035, 6, 4))
  return view(b, 1, 2.05, (t) => {
    const L = b.L
    const w = t * 2.3 + L.ph
    const p = Math.sin(w)
    bellG.scale.set(1 - p * 0.05, 1 + p * 0.09, 1 - p * 0.05)
    fl.position.y = hover + Math.sin(w - 1.2) * 0.08
    fl.rotation.x = L.move * 0.28 + Math.max(0, L.strike) * L.atk * 0.25
    fl.position.z = Math.max(0, L.strike) * L.atk * 0.25
    tents.forEach((T, i) => T.bend(t, 0.16, 0.12, 2.3, i * 0.9 + L.ph, -L.move * 0.22 + p * 0.06, 0, 0.8))
    feel.forEach((T, i) => T.bend(t, 0.12, 0.1, 3, i * 2 + L.ph, -0.15 + Math.max(0, L.strike) * L.atk * 0.25 - L.cast * 0.1, 0))
    motes.forEach((m, i) => {
      const a = t * (0.8 + i * 0.13) + i * 1.3
      m.position.set(Math.cos(a) * (0.85 + i * 0.06), 0.3 + Math.sin(a * 1.7) * 0.3, Math.sin(a) * (0.85 + i * 0.06))
    })
    beat(core, 3 * b.v.gk, t, L, 2.3, 0.4)
    coreM.scale.setScalar(0.2 * (1 + L.atk * 0.25 * Math.max(0, L.strike)))
    rimG.emissiveIntensity = 2.2 * b.v.gk * (0.7 + 0.3 * p) * (1 - L.dead * 0.9)
    bell.opacity = 0.48 - L.dead * 0.2
    if (L.dead > 0) {
      drop(fl, L.dead, hover)
      for (const T of tents) T.bend(t, 0, 0, 0, 0, 0.35 * L.dead, 0.2)
    } else fl.scale.y = 1
  })
})

// ═════════════ T2 力量：蠻甲獸（厚甲、紅黑、衝撞姿態）═════════════

regModel('xeno.brute', (def, s) => {
  const b = base(def, s, 5, 0.9)
  const skin = REDSKIN()
  const armor = RED()
  const dark = chitin('#160a10', XENO.main, 0.5, 0.45)
  const bone = BONE()
  const gl = liveGlow(tone(XENO.acc, b.v), 2.2 * b.v.gk)
  const r = buildQuad(b.root, {
    skin,
    chest: [0.46, 0.42, 0.5],
    pelvis: [0.32, 0.3, 0.36],
    chestZ: 0.28,
    pelvisZ: -0.55,
    shH: 1.08,
    hipH: 0.82,
    legW: 0.4,
    fl: [0.55, 0.2, -0.28],
    rl: [0.42, -0.6, 0.38],
    legR: [0.15, 0.11],
    neckLen: 0.22,
    neckPitch: -0.15,
    tail: { len: 1.0, r0: 0.17, r1: 0.05, bones: 5, ridge: 0.14 },
    tailMat: armor,
  })
  // 背甲：大型拱殼＋層疊甲片＋棘刺
  part(r.chest, dome(1, 14, 6, Math.PI * 0.5), armor, 0, 0.05, -0.02, 0.55, 0.52, 0.6, -0.12)
  part(r.chest, dome(1, 12, 5, Math.PI * 0.42), dark, 0, 0.22, 0.25, 0.42, 0.32, 0.38, 0.35)
  part(r.pelvis, dome(1, 12, 5, Math.PI * 0.48), armor, 0, 0.04, 0, 0.38, 0.36, 0.42, -0.1)
  dorsal(r.spine, 3, 0.0, -0.75, 1.42, 1.08, 0.3, dark, 0)
  for (let i = 0; i < 5; i++) {
    const a = (i - 2) * 0.35
    spike(r.chest, 0.07, 0.36 - Math.abs(i - 2) * 0.05, bone, Math.sin(a) * 0.4, 0.42 - Math.abs(i - 2) * 0.05, 0.0 - Math.abs(i - 2) * 0.05, -0.55, -a * 0.9, 5)
  }
  // 撞角頭：寬平的額盾＋前伸彎角
  const h = r.head
  ell(h, skin, 0, -0.02, 0.12, 0.26, 0.2, 0.28)
  part(h, dome(1, 16, 6, Math.PI * 0.5), armor, 0, 0.02, 0.12, 0.34, 0.25, 0.36, 0.75)
  const jaw = grp(h, 0, -0.12, 0.1)
  ell(jaw, dark, 0, -0.03, 0.12, 0.2, 0.08, 0.2)
  ell(jaw, gl, 0, 0.02, 0.18, 0.12, 0.03, 0.1)
  for (const sd of [-1, 1]) {
    part(h, hornGeo(0.5, 0.07, 0.55, 8, 6), bone, sd * 0.2, 0.0, 0.3, 1, 1, 1, Math.PI / 2 - 0.1, Math.PI + sd * 0.25, 0)
    ell(h, gl, sd * 0.15, 0.06, 0.34, 0.035, 0.025, 0.03, 8, 6)
  }
  // 側腹發光縫
  for (const sd of [-1, 1]) {
    vein(r.chest, [[sd * 0.44, 0.0, 0.3], [sd * 0.47, -0.08, 0.0], [sd * 0.42, -0.14, -0.3]], 0.025, gl)
    vein(r.pelvis, [[sd * 0.3, 0.06, 0.2], [sd * 0.32, -0.02, -0.1]], 0.022, gl)
  }
  // 前臂重甲、指節爪
  for (const l of r.legs) {
    ell(l.hip, armor, 0, -0.22, 0.02, 0.19, 0.3, 0.18)
    if (l.front) ell(l.knee, armor, 0, -0.2, 0.05, 0.14, 0.24, 0.15)
    claws(l.foot, 2, 0.2, 0.04, bone, 0.6)
  }
  return view(b, 1, 1.55, (t) => {
    const L = b.L
    animQuad(r, L, t, 0.42, 0.11, 0.6)
    // 衝撞：低頭、肩甲前頂
    const st = Math.max(0, L.strike) * L.atk
    r.neck.rotation.x = 0.15 + st * 0.5 + L.move * 0.15
    jaw.rotation.x = st * 0.4
    r.spine.rotation.x += L.move * 0.06
    beat(gl, 2.2 * b.v.gk, t, L, 1.8)
  })
})

// ═════════════ T2 操控：牽絲者（細長優雅、漂浮骨片與光環）═════════════

/** 細長漂浮人形（牽絲者／時序者共用）*/
function wraith(parent: THREE.Object3D, skin: THREE.Material, bone: THREE.Material, gl: THREE.Material) {
  const pelvis = grp(parent, 0, 0.85, 0)
  ell(pelvis, skin, 0, 0, 0, 0.15, 0.12, 0.12)
  const torso = grp(pelvis, 0, 0.08, 0, -0.08)
  ell(torso, skin, 0, 0.32, 0, 0.17, 0.32, 0.13)
  ell(torso, skin, 0, 0.12, 0, 0.11, 0.16, 0.09)
  for (let i = 0; i < 4; i++) part(torso, torus(0.15 - i * 0.012, 0.014, 4, 14, Math.PI * 1.1), bone, 0, 0.2 + i * 0.08, 0.01, 1, 1, 0.95, Math.PI / 2, 0, -Math.PI * 0.05 + Math.PI)
  ell(torso, gl, 0, 0.36, 0.1, 0.045, 0.06, 0.03, 8, 6)
  const neck = grp(torso, 0, 0.62, 0.02, -0.12)
  ell(neck, skin, 0, 0.1, 0, 0.045, 0.14, 0.045)
  const head = grp(neck, 0, 0.24, 0.02, 0.15)
  ell(head, skin, 0, 0.05, 0, 0.1, 0.17, 0.12)
  part(head, dome(1, 12, 6, Math.PI * 0.5), bone, 0, 0.05, 0.05, 0.1, 0.17, 0.1, Math.PI / 2)
  part(head, capsule(0.012, 0.16, 2, 6), gl, 0, 0.06, 0.155)
  for (let i = 0; i < 3; i++) spike(head, 0.02, 0.22 - i * 0.04, bone, (i - 1) * 0.05, 0.18, -0.04, -0.6, (1 - i) * 0.35)
  const arms: { sh: THREE.Group; el: THREE.Group; hand: THREE.Group }[] = []
  for (const sd of [-1, 1]) {
    const sh = grp(torso, sd * 0.19, 0.56, 0, 0, 0, sd * 0.2)
    ell(sh, bone, 0, 0.02, 0, 0.06, 0.05, 0.07)
    ell(sh, skin, 0, -0.25, 0, 0.04, 0.27, 0.04)
    const el = grp(sh, 0, -0.5, 0, -0.9)
    ell(el, skin, 0, -0.27, 0, 0.032, 0.29, 0.032)
    const hand = grp(el, 0, -0.55, 0)
    for (let f = 0; f < 4; f++) {
      const a = (f - 1.5) * 0.25
      spike(hand, 0.012, 0.26, bone, Math.sin(a) * 0.03, 0, 0, Math.PI - 0.1, a)
    }
    arms.push({ sh, el, hand })
  }
  return { pelvis, torso, neck, head, arms }
}

regModel('xeno.puppeteer', (def, s) => {
  const b = base(def, s, 3, 0.8)
  const hover = 0.45
  const fl = grp(b.root, 0, hover, 0)
  const skin = flesh('#3a2468', XENO.main, 0.28, 0.6)
  const bone = BONE()
  const gl = liveGlow(tone('#a070ff', b.v), 2.6 * b.v.gk)
  const halo = liveGlow(tone('#9a5cff', b.v), 2.8 * b.v.gk)
  const w = wraith(fl, skin, bone, gl)
  // 頭後光環（雙環）
  const hg = grp(w.head, 0, 0.08, -0.2, -0.45)
  const h1 = part(hg, torus(0.34, 0.02, 6, 44), halo)
  const h2 = part(hg, torus(0.25, 0.01, 4, 36), halo, 0, 0, 0.02)
  for (let i = 0; i < 8; i++) {
    const a = (i / 8) * Math.PI * 2
    spike(h1, 0.016, 0.09, bone, Math.cos(a) * 0.34, Math.sin(a) * 0.34, 0, 0, a - Math.PI / 2, 4)
  }
  // 操偶絲：指尖垂下的發光細絲
  const strings: { m: THREE.Mesh; hand: THREE.Group; dx: number }[] = []
  const strM = glow(tone('#c8a8ff', b.v), 1.6 * b.v.gk)
  for (const a of w.arms) for (let f = 0; f < 3; f++) strings.push({ m: part(fl, cyl(0.005, 0.005, 1, 3), strM), hand: a.hand, dx: (f - 1) * 0.05 })
  const hp = new THREE.Vector3()
  // 下身：垂墜的長尾＋兩條飄帶
  const tails: Tentacle[] = []
  const tg = grp(w.pelvis, 0, -0.05, -0.02, Math.PI - 0.15)
  tails.push(new Tentacle(tg, { len: 1.0, r0: 0.13, r1: 0.015, bones: 6, ridge: 0.08 }, skin))
  for (const sd of [-1, 1]) {
    const g = grp(w.pelvis, sd * 0.1, -0.05, 0.03, Math.PI - 0.05, 0, sd * 0.3)
    tails.push(new Tentacle(g, { len: 0.8, r0: 0.04, r1: 0.008, bones: 5 }, gl))
  }
  // 漂浮骨片
  const shards: THREE.Mesh[] = []
  const rr = rng(7)
  for (let i = 0; i < 7; i++) shards.push(part(fl, spikeGeo(0.05, 0.28, 4), bone, 0, 0, 0, 0.8 + rr() * 0.6, 0.8 + rr() * 0.6, 0.8 + rr() * 0.6))
  return view(b, 1, 2.75, (t) => {
    const L = b.L
    fl.position.y = hover + Math.sin(t * 1.4 + L.ph) * 0.07
    fl.rotation.x = L.move * 0.22
    w.torso.rotation.x = -0.08 + Math.sin(t * 1.4 + L.ph) * 0.03
    const st = L.strike * L.atk
    w.arms.forEach((a, i) => {
      const sd = i === 0 ? -1 : 1
      const g = Math.sin(t * 2.2 + i * 1.7 + L.ph)
      a.sh.rotation.x = -0.75 + g * 0.12 - Math.max(0, st) * 0.6 - L.cast * 0.5 + L.move * 0.35
      a.sh.rotation.z = sd * (0.25 + g * 0.05 + L.cast * 0.3)
      a.el.rotation.x = -0.7 + g * 0.15 + Math.max(0, st) * 0.6
      a.hand.rotation.x = Math.sin(t * 3 + i) * 0.25
    })
    strings.forEach((st2, i) => {
      st2.hand.getWorldPosition(hp)
      fl.worldToLocal(hp)
      const len = Math.max(0.2, hp.y + hover - 0.15) * (0.75 + 0.1 * Math.sin(t * 2 + i))
      st2.m.position.set(hp.x + st2.dx, hp.y - 0.15 - len / 2, hp.z + 0.06)
      st2.m.scale.set(1, len, 1)
      st2.m.visible = L.dead < 0.5
    })
    hg.rotation.z = t * (0.3 + L.cast * 2)
    h2.rotation.z = -t * (0.8 + L.cast * 3)
    tails[0].bend(t, 0.18, 0.15, 1.6, L.ph, -0.25 - L.move * 0.35, 0)
    tails[1].bend(t, 0.2, 0.2, 2.1, L.ph + 1, -0.2 - L.move * 0.4, 0.15)
    tails[2].bend(t, 0.2, 0.2, 2.1, L.ph + 2, -0.2 - L.move * 0.4, -0.15)
    shards.forEach((m, i) => {
      const a = t * (0.5 + L.cast * 1.5) + (i / shards.length) * Math.PI * 2
      const rad = 0.78 + Math.max(0, st) * 0.35 + 0.06 * Math.sin(t * 1.3 + i)
      m.position.set(Math.cos(a) * rad, 1.0 + Math.sin(t * 1.1 + i * 1.9) * 0.35 + (i % 3) * 0.2, Math.sin(a) * rad)
      m.rotation.set(t * 0.7 + i, a, 0.8 + Math.sin(t + i) * 0.3)
    })
    beat(gl, 2.6 * b.v.gk, t, L)
    beat(halo, 2.8 * b.v.gk, t, L, 1.2, 0.25)
    if (L.dead > 0) {
      drop(fl, L.dead, hover)
      for (const m of shards) m.position.y *= 1 - L.dead * 0.9
    } else fl.scale.y = 1
  })
})

// ═════════════ T3 能量：爆燃者（背部熔爐）═════════════

regModel('xeno.pyreheart', (def, s) => {
  const b = base(def, s, 4.5, 0.9)
  const skin = flesh('#241232', '#ff8a3a', 0.3, 0.45)
  const plate = chitin('#2a1426', '#ff8a3a', 0.4)
  const bone = BONE()
  const fire = liveGlow(tone('#ff8a2a', b.v), 3.2 * b.v.gk)
  const hot = liveGlow(tone('#ffe0a0', b.v), 4 * b.v.gk)
  const cy = liveGlow(tone(XENO.acc, b.v), 2 * b.v.gk)
  const r = buildBiped(b.root, {
    skin,
    hipH: 0.95,
    torso: [0.42, 0.36, 0.36],
    pelvis: [0.3, 0.2, 0.24],
    hunch: 0.75,
    shoulderW: 0.46,
    arm: [0.6, 0.62],
    armR: [0.13, 0.1],
    thigh: [0.48, -0.55, 0.35],
    legR: [0.13, 0.09],
    legW: 0.22,
    headR: [0.2, 0.18, 0.22],
    neckLen: 0.12,
  })
  // 小頭低垂在前，嘴裡透出火光
  const h = r.head
  ell(h, skin, 0, 0.0, 0.12, 0.2, 0.15, 0.24)
  part(h, dome(1, 12, 5, Math.PI * 0.45), plate, 0, 0.04, 0.1, 0.2, 0.16, 0.24, 0.5)
  ell(h, fire, 0, -0.07, 0.24, 0.12, 0.03, 0.1)
  for (const sd of [-1, 1]) ell(h, hot, sd * 0.1, 0.03, 0.3, 0.03, 0.02, 0.02, 6, 4)
  // 背部熔爐：彎曲肋骨籠罩住白熱的爐心，兩根煙囪噴出火星
  const furnace = grp(r.torso, 0, 0.55, -0.22, -0.55)
  const coreM = ell(furnace, hot, 0, 0.18, 0, 0.26, 0.24, 0.26)
  ell(furnace, fire, 0, 0.12, 0, 0.36, 0.2, 0.36)
  part(furnace, dome(1, 16, 6, Math.PI * 0.5), plate, 0, -0.02, 0, 0.5, 0.18, 0.46)
  for (let i = 0; i < 7; i++) {
    const a = (i / 7) * Math.PI * 2
    part(furnace, hornGeo(0.62, 0.05, 0.75, 8, 5), bone, Math.cos(a) * 0.42, 0.02, Math.sin(a) * 0.4, 1, 1, 1, 0, -a + Math.PI / 2, 0)
  }
  const vents: THREE.Group[] = []
  for (const sd of [-1, 1]) {
    const vg = grp(furnace, sd * 0.24, 0.1, -0.26, -0.5, 0, sd * 0.25)
    part(vg, cyl(0.07, 0.1, 0.5, 10, true), plate, 0, 0.25, 0)
    part(vg, cyl(0.065, 0.065, 0.02, 10), fire, 0, 0.49, 0)
    vents.push(vg)
  }
  const embers: THREE.Mesh[] = []
  for (let i = 0; i < 8; i++) embers.push(ell(r.torso, i % 2 ? fire : hot, 0, 0, 0, 0.03, 0.03, 0.03, 6, 4))
  // 身上的熔岩裂紋（橘）與異形神經（青）
  for (const sd of [-1, 1]) {
    vein(r.torso, [[sd * 0.38, 0.5, 0.2], [sd * 0.42, 0.3, 0.1], [sd * 0.35, 0.1, 0.15]], 0.022, fire)
    vein(r.hips, [[sd * 0.26, 0.05, 0.12], [sd * 0.28, -0.05, -0.08]], 0.018, cy)
  }
  for (const a of r.arms) {
    ell(a.sh, plate, 0, -0.12, 0, 0.17, 0.22, 0.17)
    claws(a.hand, 3, 0.22, 0.04, bone, 0.9)
    ell(a.hand, skin, 0, 0, 0, 0.11, 0.08, 0.12)
  }
  for (const l of r.legs) claws(l.foot, 3, 0.16, 0.035, bone, 0.9)
  return view(b, 1.25, 2.35, (t, dt) => {
    const L = b.L
    animBiped(r, L, t, 0.5, 0.6)
    // 長臂接近地面（猩猩式）
    for (const a of r.arms) a.sh.rotation.x += 0.3 - L.move * 0.2
    const fl = 0.75 + 0.25 * Math.sin(t * 9 + Math.sin(t * 3.7) * 2)
    fire.emissiveIntensity = 3.2 * b.v.gk * fl * (1 + L.atk * 0.4 + L.cast * 0.6) * (1 - L.dead * 0.85)
    hot.emissiveIntensity = 4 * b.v.gk * (0.85 + 0.15 * fl) * (1 - L.dead * 0.9)
    coreM.scale.setScalar(0.26 * (1 + 0.06 * Math.sin(t * 5) + Math.max(0, L.strike) * L.atk * 0.25))
    embers.forEach((m, i) => {
      const u = (t * (0.6 + (i % 3) * 0.15) + i / embers.length) % 1
      const sd = i % 2 ? -1 : 1
      m.position.set(sd * (0.3 + Math.sin(i * 7.1 + t) * 0.05) * (1 + u), 0.95 + u * 1.1, -0.65 - u * 0.25)
      m.scale.setScalar(0.035 * (1 - u * 0.8) + 0.001)
      m.visible = L.dead < 0.5
    })
    beat(cy, 2 * b.v.gk, t, L)
    void dt
  })
})

// ═════════════ T3 能量：雷殛者（電弧尖刺）═════════════

const arcGeos: THREE.BufferGeometry[] = []
function arcGeo(i: number): THREE.BufferGeometry {
  if (!arcGeos[i]) {
    const r = rng(100 + i)
    const pts: THREE.Vector3[] = []
    for (let k = 0; k <= 7; k++) {
      const u = k / 7
      const j = k === 0 || k === 7 ? 0 : 0.12
      pts.push(new THREE.Vector3((r() - 0.5) * j, u, (r() - 0.5) * j))
    }
    arcGeos[i] = new THREE.TubeGeometry(new THREE.CatmullRomCurve3(pts, false, 'catmullrom', 0.1), 14, 0.012, 3, false)
  }
  return arcGeos[i]
}

regModel('xeno.arcflayer', (def, s) => {
  const b = base(def, s, 6, 1.1)
  const skin = flesh('#161238', '#5ad8ff', 0.24, 0.6)
  const plate = chitin('#20204a', '#5ad8ff', 0.5)
  const bone = BONE()
  const zap = liveGlow(tone('#bff6ff', b.v), 4 * b.v.gk)
  const cy = liveGlow(tone(XENO.acc, b.v), 2.6 * b.v.gk)
  const r = buildQuad(b.root, {
    skin,
    chest: [0.32, 0.3, 0.46],
    pelvis: [0.25, 0.24, 0.34],
    chestZ: 0.36,
    pelvisZ: -0.55,
    shH: 1.08,
    hipH: 0.98,
    legW: 0.28,
    fl: [0.56, 0.3, -0.12],
    rl: [0.56, -0.6, 0.4],
    legR: [0.085, 0.055],
    neckLen: 0.42,
    neckPitch: 0.45,
    tail: { len: 1.6, r0: 0.1, r1: 0.03, bones: 7, ridge: 0.15 },
  })
  const jaw = xenoHead(r.head, skin, plate, bone, cy, 1.05)
  for (const sd of [-1, 1]) part(r.head, hornGeo(0.42, 0.035, 0.4), plate, sd * 0.08, 0.1, 0.08, 1, 1, 1, -0.5, 0, sd * 0.5)
  // 兩排晶狀尖刺，尖端發光；尖端之間跳電弧
  const tips: THREE.Object3D[] = []
  const rows = 5
  for (const sd of [-1, 1]) {
    for (let i = 0; i < rows; i++) {
      const u = i / (rows - 1)
      const z = THREE.MathUtils.lerp(0.65, -0.75, u)
      const y = THREE.MathUtils.lerp(1.3, 1.15, u)
      const hgt = 0.55 + Math.sin(u * Math.PI) * 0.35
      const g = grp(r.spine, sd * 0.14, y, z, -0.35, 0, sd * 0.38)
      part(g, spikeGeo(0.06, hgt, 5), plate)
      part(g, spikeGeo(0.03, hgt * 0.4, 5), cy, 0, hgt * 0.62, 0)
      const tip = new THREE.Object3D()
      tip.position.y = hgt
      g.add(tip)
      tips.push(tip)
    }
  }
  for (const l of r.legs) {
    spike(l.hip, 0.04, 0.28, plate, 0, -0.05, l.front ? -0.06 : 0.06, l.front ? -2.4 : 2.4)
    claws(l.foot, 3, 0.18, 0.025, bone, 0.9)
  }
  part(r.tail!.tip, spikeGeo(0.05, 0.3, 5), zap, 0, 0, 0)
  // 電弧（預先做好的鋸齒管，隨機切換）
  const arcs: THREE.Mesh[] = []
  for (let i = 0; i < 6; i++) {
    const m = new THREE.Mesh(arcGeo(i % 4), zap)
    m.frustumCulled = false
    b.root.add(m)
    arcs.push(m)
  }
  const pa = new THREE.Vector3()
  const pb = new THREE.Vector3()
  const inv = new THREE.Matrix4()
  const up = new THREE.Vector3(0, 1, 0)
  let flick = 0
  return view(b, 1.28, 2.0, (t, dt) => {
    const L = b.L
    animQuad(r, L, t, 0.5, 0.06, 0.4)
    jaw.rotation.x = Math.max(0, L.strike) * L.atk * 0.55
    beat(cy, 2.6 * b.v.gk, t, L, 3.1, 0.35)
    flick -= dt
    if (flick <= 0) {
      flick = 0.05 + Math.random() * 0.08
      b.root.updateMatrixWorld(true)
      inv.copy(b.root.matrixWorld).invert()
      const n = arcs.length
      for (let i = 0; i < n; i++) {
        const m = arcs[i]
        const on = L.dead < 0.3 && Math.random() < 0.55 + L.atk * 0.4 + L.cast * 0.4
        m.visible = on
        if (!on) continue
        const a = Math.floor(Math.random() * tips.length)
        const row = Math.floor(a / rows)
        const idx = a % rows
        const bIdx = Math.random() < 0.55 && idx < rows - 1 ? a + 1 : (1 - row) * rows + idx
        tips[a].getWorldPosition(pa).applyMatrix4(inv)
        tips[bIdx].getWorldPosition(pb).applyMatrix4(inv)
        const d = pb.clone().sub(pa)
        const len = Math.max(0.05, d.length())
        m.geometry = arcGeo(Math.floor(Math.random() * 4))
        m.position.copy(pa)
        m.quaternion.setFromUnitVectors(up, d.normalize())
        m.scale.set(1, len, 1)
      }
    }
    zap.emissiveIntensity = 4 * b.v.gk * (0.7 + Math.random() * 0.6) * (1 - L.dead)
  })
})

// ═════════════ T3 能量：幻影者（殘影）═════════════

function phantasmBody(parent: THREE.Object3D, skin: THREE.Material, cloak: THREE.Material, blade: THREE.Material, gl: THREE.Material) {
  const g = grp(parent, 0, 0, 0)
  const torso = grp(g, 0, 1.0, 0, 0.2)
  ell(torso, skin, 0, 0.32, 0, 0.16, 0.36, 0.13)
  part(torso, dome(1, 12, 5, Math.PI * 0.5), cloak, 0, 0.52, -0.02, 0.42, 0.22, 0.3)
  const head = grp(torso, 0, 0.72, 0.1, -0.2)
  part(head, dome(1, 12, 6, Math.PI * 0.62), cloak, 0, 0, 0, 0.17, 0.28, 0.22, 0.45)
  ell(head, gl, 0, -0.05, 0.13, 0.07, 0.03, 0.04, 6, 4)
  // 破碎的長披風：從肩膀垂到地面附近，往外張開
  for (let i = 0; i < 10; i++) {
    const a = (i / 10) * Math.PI * 2
    const len = 1.1 + (i % 3) * 0.18
    part(torso, spikeGeo(0.17, len, 3), cloak, Math.sin(a) * 0.3, 0.5, Math.cos(a) * 0.22, 1, 1, 0.3, Math.PI + Math.cos(a) * 0.3, a, -Math.sin(a) * 0.3)
  }
  // 螳螂式鐮刃臂
  const arms: THREE.Group[] = []
  for (const sd of [-1, 1]) {
    const sh = grp(torso, sd * 0.3, 0.5, 0.05, -0.9, 0, sd * 0.45)
    ell(sh, skin, 0, -0.22, 0, 0.05, 0.25, 0.05)
    const el = grp(sh, 0, -0.45, 0, -1.9)
    part(el, hornGeo(1.0, 0.065, -0.45, 8, 4), blade, 0, 0, 0, 1, 1, 0.35)
    arms.push(sh)
  }
  return { g, torso, arms }
}

regModel('xeno.phantasm', (def, s) => {
  const b = base(def, s, 3, 1)
  const hover = 0.25
  const fl = grp(b.root, 0, hover, 0)
  const skin = flesh('#22163e', XENO.main, 0.25, 0.7)
  const cloak = flesh('#2a1650', '#b48cff', 0.35, 0.65)
  const blade = BONE()
  const gl = liveGlow(tone(XENO.acc, b.v), 3 * b.v.gk)
  const main = phantasmBody(fl, skin, cloak, blade, gl)
  // 殘影：同一副身體換成半透明紫青，落後並偏移
  const ghostM = [liveGlass('#8a5cff', 0.22), liveGlass(XENO.acc, 0.14)]
  ghostM.forEach((m, i) => {
    m.emissive.set(i ? XENO.acc : '#9a5cff')
    m.emissiveIntensity = 1.4 * b.v.gk
    m.blending = THREE.AdditiveBlending
  })
  const ghosts = ghostM.map((m) => phantasmBody(fl, m, m, m, m))
  return view(b, 1.25, 2.35, (t) => {
    const L = b.L
    const bob = Math.sin(t * 1.7 + L.ph) * 0.06
    fl.position.y = hover + bob
    const st = L.strike * L.atk
    const pose = (B: ReturnType<typeof phantasmBody>, lag: number) => {
      const tt = t - lag
      B.torso.rotation.x = 0.25 + L.move * 0.3 + Math.sin(tt * 1.7) * 0.04 + Math.max(0, st) * 0.3
      B.arms.forEach((a, i) => {
        a.rotation.x = -0.9 - Math.max(0, st) * 1.0 + Math.min(0, st) * -1.2 + Math.sin(tt * 2 + i) * 0.08
      })
    }
    pose(main, 0)
    ghosts.forEach((G, i) => {
      const k = i + 1
      pose(G, 0.15 * k)
      const drift = 0.5 + L.move * 0.5
      G.g.position.set((k === 1 ? 0.35 : -0.35) + Math.sin(t * 1.3 + k * 2.1) * 0.15, Math.sin(t * 2 + k) * 0.05, -drift * k + Math.cos(t * 1.1 + k) * 0.1)
      G.g.visible = L.dead < 0.2 && (Math.sin(t * 9 + k * 3) > -0.7 || L.move > 0.5)
    })
    ghostM.forEach((m, i) => (m.opacity = (i ? 0.2 : 0.3) * (0.75 + 0.25 * Math.sin(t * 5 + i))))
    beat(gl, 3 * b.v.gk, t, L, 2.5)
    if (L.dead > 0) drop(fl, L.dead, hover)
    else fl.scale.y = 1
  })
})

// ═════════════ T3 力量：石瞳蛇（長蛇身）═════════════

regModel('xeno.gorgon', (def, s) => {
  const b = base(def, s, 3, 0.9)
  const skin = REDSKIN()
  const armor = RED()
  const stone = chitin('#5c5262', XENO.main, 0.2, 0.4)
  const bone = BONE()
  const eye = liveGlow(tone('#d8ff6a', b.v), 3.4 * b.v.gk)
  const gl = liveGlow(tone(XENO.acc, b.v), 2.2 * b.v.gk)
  const body = grp(b.root)
  // 盤在地上的長蛇身（往後延伸）
  const coilBase = grp(body, 0, 0.3, 0.15, -Math.PI / 2)
  const coil = new Tentacle(coilBase, { len: 4.2, r0: 0.3, r1: 0.06, bones: 10, tub: 34, rad: 10, ridge: 0.05 }, skin)
  // 背上一列甲片（掛在骨頭上，跟著彎）
  coil.bones.forEach((bn, i) => {
    if (i === 0 || i > 8) return
    const k = 1 - i / 11
    part(bn, dome(1, 10, 4, Math.PI * 0.45), armor, 0, 0.0, 0.2 * k, 0.26 * k, 0.24 * k, 0.12 * k, -Math.PI / 2)
  })
  // 立起的上身
  const neckBase = grp(body, 0, 0.32, 0.25)
  const neck = new Tentacle(neckBase, { len: 1.6, r0: 0.28, r1: 0.16, bones: 6, tub: 16, rad: 10, ridge: 0.04 }, skin)
  neck.bones.forEach((bn, i) => {
    if (i < 1 || i > 4) return
    part(bn, dome(1, 10, 4, Math.PI * 0.45), armor, 0, 0, -0.17, 0.22, 0.2, 0.1, Math.PI / 2 + Math.PI)
  })
  const head = grp(neck.tip, 0, 0.08, 0.05, 0.9)
  ell(head, skin, 0, 0, 0.12, 0.2, 0.15, 0.3)
  part(head, dome(1, 14, 6, Math.PI * 0.45), armor, 0, 0.04, 0.08, 0.21, 0.13, 0.3)
  const jaw = grp(head, 0, -0.08, 0.05)
  ell(jaw, skin, 0, -0.03, 0.12, 0.15, 0.05, 0.24)
  for (const sd of [-1, 1]) spike(jaw, 0.025, 0.12, bone, sd * 0.08, 0.0, 0.3, -0.3)
  // 石化之眼：四顆
  for (const sd of [-1, 1]) for (let i = 0; i < 2; i++) ell(head, eye, sd * (0.11 - i * 0.03), 0.06 + i * 0.04, 0.3 - i * 0.07, 0.04, 0.03, 0.035, 8, 6)
  // 石質頸盾（扇形展開）＋蛇髮
  const hood = grp(neck.tip, 0, -0.15, -0.05, 0.2)
  for (let i = 0; i < 7; i++) {
    const a = (i - 3) * 0.33
    part(hood, dome(1, 8, 4, Math.PI * 0.5), stone, Math.sin(a) * 0.4, Math.cos(a) * 0.24, -0.05, 0.16, 0.42, 0.05, -0.2, 0, -a)
  }
  const locks: Tentacle[] = []
  for (let i = 0; i < 6; i++) {
    const a = (i / 6) * Math.PI * 2
    const g = grp(head, Math.cos(a) * 0.12, 0.08, -0.05 + Math.sin(a) * 0.06, -0.9 + Math.sin(a) * 0.3, 0, Math.cos(a) * 0.7)
    locks.push(new Tentacle(g, { len: 0.45, r0: 0.035, r1: 0.01, bones: 4, tub: 8, rad: 5 }, i % 2 ? gl : armor))
  }
  // 腹側發光鱗紋
  vein(neckBase, [[0, 0.1, 0.27], [0, 0.6, 0.24], [0, 1.1, 0.19]], 0.025, gl)
  return view(b, 1.2, 2.45, (t) => {
    const L = b.L
    const k = L.move
    const st = L.strike * L.atk
    for (let i = 1; i < coil.bones.length; i++) {
      const bn = coil.bones[i]
      bn.rotation.x = 0
      bn.rotation.z = Math.sin(t * (1 + k * 3) - i * 1.15 + L.ph) * (0.42 + k * 0.1) * (0.7 + (i / coil.bones.length) * 0.5)
    }
    neck.bend(t, 0.05, 0.08, 1.3, L.ph, 0.06 + k * 0.08 + Math.max(0, st) * 0.12 + Math.min(0, st) * 0.15, 0, 0.6)
    neckBase.rotation.x = 0.1 + Math.max(0, st) * 0.5 + k * 0.25
    head.rotation.x = 0.9 - Math.max(0, st) * 0.4 - k * 0.3
    jaw.rotation.x = Math.max(0, st) * 0.7
    hood.scale.setScalar(1 + L.cast * 0.3 + Math.max(0, st) * 0.15)
    locks.forEach((T, i) => T.bend(t, 0.3, 0.3, 2.5, i * 1.3, 0.2, 0))
    beat(eye, 3.4 * b.v.gk, t, L, 1.5, 0.3)
    beat(gl, 2.2 * b.v.gk, t, L)
    if (L.dead > 0) {
      neckBase.rotation.x = 0.1 + L.dead * 1.35
      body.position.y = -L.dead * 0.05
    } else body.position.y = 0
  })
})

// ═════════════ T3 力量：再生核（外露核心）═════════════

regModel('xeno.hydra', (def, s) => {
  const b = base(def, s, 5, 1)
  const skin = REDSKIN()
  const armor = RED()
  const bone = BONE()
  const core = liveGlow(tone('#6ff8ff', b.v), 3.6 * b.v.gk)
  const coreL = liveLiquid(tone('#9a5cff', b.v), 0.4, 1 * b.v.gk)
  const gl = liveGlow(tone(XENO.acc, b.v), 2 * b.v.gk)
  const body = grp(b.root)
  // 三足基座
  const base3 = grp(body, 0, 0.62, 0)
  ell(base3, skin, 0, 0, 0, 0.42, 0.26, 0.42)
  part(base3, dome(1, 16, 6, Math.PI * 0.5), armor, 0, -0.08, 0, 0.46, 0.2, 0.46, Math.PI)
  const legs: THREE.Group[] = []
  for (let i = 0; i < 3; i++) {
    const a = (i / 3) * Math.PI * 2 + Math.PI / 3
    const g = grp(base3, Math.sin(a) * 0.32, -0.05, Math.cos(a) * 0.32, 0, a, 0)
    const hip = grp(g, 0, 0, 0, 0.5)
    ell(hip, skin, 0, -0.18, 0, 0.12, 0.24, 0.12)
    const kn = grp(hip, 0, -0.36, 0, -0.75)
    ell(kn, armor, 0, -0.17, 0, 0.09, 0.21, 0.09)
    claws(grp(kn, 0, -0.36, 0, 0.25), 3, 0.16, 0.035, bone, 1)
    legs.push(hip)
  }
  // 肋骨籠裡外露的核心
  const cage = grp(body, 0, 1.12, -0.12)
  const coreM = ell(cage, core, 0, 0, 0, 0.3, 0.3, 0.3, 16, 12)
  const shell = ell(cage, coreL, 0, 0, 0, 0.42, 0.42, 0.42, 16, 12)
  for (let i = 0; i < 6; i++) {
    const a = (i / 6) * Math.PI * 2
    part(cage, hornGeo(0.75, 0.05, 0.7, 8, 5), bone, Math.sin(a) * 0.42, -0.45, Math.cos(a) * 0.42, 1, 1, 1, 0, a + Math.PI, 0)
  }
  // 三條蛇頸
  const necks: Tentacle[] = []
  const heads: THREE.Group[] = []
  for (let i = 0; i < 3; i++) {
    const a = (i - 1) * 1.05
    const g = grp(base3, Math.sin(a) * 0.34, 0.12, 0.2 + Math.cos(a) * 0.14, 0.7, a, 0)
    const N = new Tentacle(g, { len: 1.3, r0: 0.11, r1: 0.07, bones: 5, tub: 12, rad: 8, ridge: 0.1 }, skin)
    const h = grp(N.tip, 0, 0.05, 0, 0.9)
    ell(h, skin, 0, 0, 0.08, 0.1, 0.08, 0.16)
    part(h, dome(1, 10, 4, Math.PI * 0.45), armor, 0, 0.03, 0.05, 0.11, 0.08, 0.17)
    const jw = grp(h, 0, -0.05, 0.02)
    ell(jw, skin, 0, -0.02, 0.08, 0.08, 0.03, 0.13)
    for (const sd of [-1, 1]) ell(h, gl, sd * 0.06, 0.04, 0.17, 0.02, 0.02, 0.02, 6, 4)
    necks.push(N)
    heads.push(jw)
  }
  return view(b, 1.3, 2.0, (t) => {
    const L = b.L
    const k = L.move
    legs.forEach((h, i) => {
      const [sw, lift] = stepOf(L.walk, i / 3)
      h.rotation.x = 0.5 + sw * 0.35 * k
      h.rotation.z = lift * 0.3 * k
    })
    body.position.y = Math.abs(Math.sin(L.walk * 1.5)) * 0.05 * k
    const h = Math.pow(0.5 + 0.5 * Math.sin(t * 3 + L.ph), 4)
    coreM.scale.setScalar(0.3 * (1 + h * 0.15 + L.atk * 0.1))
    shell.scale.setScalar(0.42 * (1 + h * 0.06))
    cage.rotation.y = t * 0.3
    necks.forEach((N, i) => {
      const st = L.strike * L.atk * (i === 1 ? 1 : 0.6)
      N.bend(t, 0.18, 0.16, 1.8, i * 2.1 + L.ph, -0.08 - Math.max(0, st) * 0.2 + Math.min(0, st) * -0.3, 0, 0.6)
      heads[i].rotation.x = Math.max(0, st) * 0.7 + Math.sin(t * 2 + i) * 0.05
    })
    beat(core, 3.6 * b.v.gk, t, L, 3, 0.5)
    beat(gl, 2 * b.v.gk, t, L)
    if (L.dead > 0) {
      topple(body, L.dead, -1, 0.8)
      for (const N of necks) N.bend(t, 0, 0, 0, 0, 0.3 * L.dead, 0)
    } else body.rotation.z = 0
  })
})

/** 裸核：再生核死亡後脫出的核心，用細觸手快速爬行 */
regModel('xeno.hydraCore', (def, s) => {
  const b = base(def, s, 10, 1)
  const core = liveGlow(tone('#6ff8ff', b.v), 3.6 * b.v.gk)
  const memb = liveLiquid(tone('#9a5cff', b.v), 0.45, 1 * b.v.gk)
  const skin = REDSKIN()
  const body = grp(b.root, 0, 0.45, 0)
  const coreM = ell(body, core, 0, 0, 0, 0.2, 0.2, 0.2, 14, 10)
  ell(body, memb, 0, 0, 0, 0.3, 0.27, 0.3, 14, 10)
  part(body, lumpGeo(0.25, 5, 0.2, 12, 8), skin, 0, -0.12, 0, 1, 0.5, 1)
  const feet: Tentacle[] = []
  for (let i = 0; i < 6; i++) {
    const a = (i / 6) * Math.PI * 2
    const g = grp(body, Math.sin(a) * 0.18, -0.1, Math.cos(a) * 0.18, 0, a, 0)
    const g2 = grp(g, 0, 0, 0, Math.PI * 0.72)
    feet.push(new Tentacle(g2, { len: 0.62, r0: 0.045, r1: 0.01, bones: 4, tub: 8, rad: 5 }, skin))
  }
  return view(b, 1, 0.8, (t) => {
    const L = b.L
    body.position.y = 0.45 + Math.sin(L.walk * 2) * 0.03 * L.move + Math.sin(t * 3) * 0.015
    feet.forEach((T, i) => T.bend(t, 0.15 + L.move * 0.3, 0.1, 3 + L.move * 8, i * 1.05, -0.35, 0, 0.5))
    coreM.scale.setScalar(0.2 * (1 + 0.15 * Math.pow(0.5 + 0.5 * Math.sin(t * 4), 3)))
    beat(core, 3.6 * b.v.gk, t, L, 4, 0.5)
    if (L.dead > 0) drop(body, L.dead, 0.45)
  })
})

// ═════════════ T3 力量：織網者（多肢）═════════════

regModel('xeno.weaver', (def, s) => {
  const b = base(def, s, 7, 1)
  const skin = REDSKIN()
  const armor = RED()
  const dark = chitin('#14080e', XENO.main, 0.55, 0.45)
  const bone = BONE()
  const gl = liveGlow(tone(XENO.acc, b.v), 2.6 * b.v.gk)
  const silk = glow(tone('#d8f8ff', b.v), 1.3 * b.v.gk)
  const body = grp(b.root, 0, 0, 0)
  const cep = grp(body, 0, 0.85, 0.25)
  ell(cep, skin, 0, 0, 0, 0.36, 0.22, 0.42)
  part(cep, dome(1, 16, 6, Math.PI * 0.5), armor, 0, 0.02, 0, 0.38, 0.22, 0.44)
  // 頭：成排的眼＋鉗
  const head = grp(cep, 0, 0.05, 0.38)
  ell(head, dark, 0, 0, 0.05, 0.2, 0.14, 0.18)
  for (let i = 0; i < 4; i++) for (const sd of [-1, 1]) ell(head, gl, sd * (0.05 + i * 0.04), 0.07 + (i % 2) * 0.03, 0.18 - i * 0.025, 0.028, 0.028, 0.028, 6, 4)
  const fangs: THREE.Group[] = []
  for (const sd of [-1, 1]) {
    const f = grp(head, sd * 0.07, -0.08, 0.16)
    part(f, hornGeo(0.24, 0.035, -0.6, 6, 5), bone, 0, 0, 0, 1, 1, 1, Math.PI, 0, 0)
    fangs.push(f)
  }
  // 腹部：大囊，帶發光紋與吐絲器
  const abd = grp(body, 0, 1.05, -0.55, 0.35)
  ell(abd, skin, 0, 0, -0.25, 0.52, 0.45, 0.6)
  part(abd, dome(1, 16, 7, Math.PI * 0.55), armor, 0, 0.05, -0.25, 0.53, 0.44, 0.6, -0.15)
  for (let i = 0; i < 3; i++) part(abd, torus(0.3 - i * 0.07, 0.02, 4, 20, Math.PI * 1.2), gl, 0, 0.44 - i * 0.03, -0.25 + (i - 1) * 0.2, 1, 1, 1, Math.PI / 2, 0, Math.PI * -0.1)
  for (let i = 0; i < 3; i++) spike(abd, 0.04, 0.16, bone, (i - 1) * 0.08, -0.05, -0.82, -1.7)
  // 絲線（拖曳到地上）
  const threads: THREE.Mesh[] = []
  for (let i = 0; i < 3; i++) threads.push(part(body, cyl(0.006, 0.006, 1.25, 3), silk, (i - 1) * 0.12, 0.48, -1.72, 1, 1, 1, 0.67, 0, (i - 1) * 0.12))
  // 八條長腳＋兩條前肢刃
  const legs: SpiderLeg[] = []
  const yaws = [0.55, 0.15, -0.25, -0.65]
  for (const sd of [-1, 1]) {
    yaws.forEach((y, i) => {
      const yaw = sd > 0 ? -y : Math.PI + y
      const L = spiderLeg(cep, sd * 0.28, -0.02, 0.2 - i * 0.16, yaw, 0.85 - Math.abs(i - 1.5) * 0.08, 0.06, 0.85, 0.75 + (i === 0 || i === 3 ? 0.15 : 0), armor, bone)
      legs.push(L)
    })
  }
  const blades: THREE.Group[] = []
  for (const sd of [-1, 1]) {
    const g = grp(head, sd * 0.16, 0.02, 0.05, -0.5, sd * 0.4, 0)
    ell(g, armor, 0, 0, 0.2, 0.05, 0.05, 0.22)
    part(g, hornGeo(0.6, 0.04, -0.5, 6, 4), bone, 0, 0, 0.4, 1, 1, 0.5, Math.PI / 2 + 0.6, 0, 0)
    blades.push(g)
  }
  return view(b, 1.12, 2.0, (t) => {
    const L = b.L
    const k = L.move
    legs.forEach((l, i) => {
      const side = i < 4 ? 0 : 0.5
      const [sw, lift] = stepOf(L.walk, ((i % 4) * 0.5 + side) % 1)
      animSpider(l, sw, lift, k, 0.22)
    })
    const br = L.breathe(t, 1.2)
    cep.position.y = 0.85 + Math.sin(L.walk * 2) * 0.03 * k + (br - 0.5) * 0.02
    abd.rotation.x = 0.35 + Math.sin(t * 1.2 + L.ph) * 0.05 + k * 0.08
    abd.scale.setScalar(1 + br * 0.03)
    const st = L.strike * L.atk
    blades.forEach((g, i) => (g.rotation.x = -0.5 - Math.max(0, st) * (i ? 1 : 0.6) * 0.9 + Math.min(0, st) * -1.4 + Math.sin(t * 1.5 + i) * 0.05))
    fangs.forEach((f, i) => (f.rotation.y = (i ? -1 : 1) * (0.15 + Math.max(0, st) * 0.3 + Math.sin(t * 4) * 0.05)))
    threads.forEach((m, i) => (m.visible = L.dead < 0.5 && (k > 0.2 || i === 1)))
    beat(gl, 2.6 * b.v.gk, t, L)
    if (L.dead > 0) {
      for (const l of legs) l.femur.rotation.z = l.up + L.dead * 0.9
      cep.position.y = 0.85 - L.dead * 0.55
      abd.position.y = 1.05 - L.dead * 0.6
    } else abd.position.y = 1.05
  })
})

// ═════════════ T3 操控：虛空行者（空間扭曲光暈）═════════════

regModel('xeno.voidwalker', (def, s) => {
  const b = base(def, s, 3, 1)
  const hover = 0.55
  const fl = grp(b.root, 0, hover, 0)
  const skin = flesh('#0a0814', '#a070ff', 0.2, 0.9)
  const bone = smooth('#3a2e52', '#a070ff', 0.4, 0.6)
  const gl = liveGlow(tone('#b48cff', b.v), 3 * b.v.gk)
  const voidC = liveGlow(tone('#6a2cff', b.v), 2.4 * b.v.gk)
  const w = wraith(fl, skin, bone, gl)
  // 胸口的黑洞：黑球＋紫色吸積環
  const hole = grp(w.torso, 0, 0.36, 0.14)
  ell(hole, Mat0(), 0, 0, 0, 0.09, 0.09, 0.09, 12, 8)
  const disk = part(hole, torus(0.14, 0.018, 4, 28), voidC, 0, 0, 0, 1, 1, 1, 0.4, 0, 0)
  // 下身散成虛空尾跡
  const tail = new Tentacle(grp(w.pelvis, 0, -0.05, 0, Math.PI - 0.2), { len: 0.95, r0: 0.14, r1: 0.01, bones: 5, ridge: 0.1 }, skin)
  // 扭曲光暈：大泡泡＋兩道傾斜的透鏡環＋環繞的虛空球
  const bubble = liveGlass('#6a3cff', 0.1)
  bubble.emissive.set('#3a1a8a')
  bubble.emissiveIntensity = 0.5 * b.v.gk
  const bub = ell(fl, bubble, 0, 1.15, 0, 1.05, 1.15, 1.05, 24, 16)
  bub.castShadow = false
  const ringA = part(fl, torus(1.08, 0.022, 4, 64), voidC, 0, 1.15, 0, 1, 1, 1, Math.PI / 2 - 0.35)
  const ringB = part(fl, torus(0.95, 0.014, 4, 56), gl, 0, 1.15, 0, 1, 1, 1, Math.PI / 2 + 0.5, 0.6)
  ringA.castShadow = ringB.castShadow = false
  const orbs: THREE.Group[] = []
  for (let i = 0; i < 3; i++) {
    const o = grp(fl)
    ell(o, Mat0(), 0, 0, 0, 0.08, 0.08, 0.08, 10, 8)
    part(o, torus(0.11, 0.012, 4, 20), voidC, 0, 0, 0, 1, 1, 1, Math.PI / 2)
    orbs.push(o)
  }
  return view(b, 1.15, 2.6, (t) => {
    const L = b.L
    fl.position.y = hover + Math.sin(t * 1.2 + L.ph) * 0.08
    fl.rotation.x = L.move * 0.2
    const st = L.strike * L.atk
    w.arms.forEach((a, i) => {
      const sd = i ? 1 : -1
      a.sh.rotation.x = -0.35 - Math.max(0, st) * 1.1 - L.cast * 0.8 + Math.sin(t * 1.5 + i) * 0.08
      a.sh.rotation.z = sd * (0.35 + L.cast * 0.4)
      a.el.rotation.x = -0.4
    })
    tail.bend(t, 0.2, 0.2, 1.5, L.ph, -0.25 - L.move * 0.4, 0)
    disk.rotation.z = t * 3
    ringA.rotation.z = t * 0.6
    ringB.rotation.z = -t * 0.9
    const sc = 1 + 0.04 * Math.sin(t * 2.4) + L.cast * 0.12 + Math.max(0, st) * 0.08
    bub.scale.set(1.05 * sc, 1.15 * sc * (1 + 0.03 * Math.sin(t * 3.1)), 1.05 * sc)
    bubble.opacity = (0.1 + 0.04 * Math.sin(t * 1.7)) * (1 - L.dead)
    orbs.forEach((o, i) => {
      const a = t * 0.9 + (i / 3) * Math.PI * 2
      o.position.set(Math.cos(a) * 0.75, 1.1 + Math.sin(t * 1.4 + i * 2) * 0.35, Math.sin(a) * 0.75)
    })
    beat(gl, 3 * b.v.gk, t, L)
    beat(voidC, 2.4 * b.v.gk, t, L, 1.4, 0.3)
    ringA.visible = ringB.visible = bub.visible = L.dead < 0.6
    if (L.dead > 0) drop(fl, L.dead, hover)
    else fl.scale.y = 1
  })
})

/** 吸光的黑色（虛空）*/
function Mat0(): THREE.MeshStandardMaterial {
  return flesh('#020104', '#6a2cff', 0.15, 1.1)
}

// ═════════════ T3 操控：時序者（時鐘狀骨環）═════════════

regModel('xeno.chronarch', (def, s) => {
  const b = base(def, s, 3, 0.6)
  const hover = 0.5
  const fl = grp(b.root, 0, hover, 0)
  const skin = flesh('#30205a', XENO.main, 0.3, 0.6)
  const bone = BONE()
  const gl = liveGlow(tone(XENO.acc, b.v), 2.8 * b.v.gk)
  const vio = liveGlow(tone('#9a5cff', b.v), 2.4 * b.v.gk)
  const w = wraith(fl, skin, bone, gl)
  // 背後的大骨環＝鐘面：十二道骨齒、兩根指針
  const clock = grp(fl, 0, 1.55, -0.42, -0.5)
  part(clock, torus(0.95, 0.06, 6, 56), bone)
  part(clock, torus(0.8, 0.018, 4, 48), vio)
  for (let i = 0; i < 12; i++) {
    const a = (i / 12) * Math.PI * 2
    const big = i % 3 === 0
    spike(clock, big ? 0.05 : 0.03, big ? 0.32 : 0.18, bone, Math.cos(a) * 1.0, Math.sin(a) * 1.0, 0, 0, a - Math.PI / 2, 5)
    if (big) ell(clock, gl, Math.cos(a) * 0.8, Math.sin(a) * 0.8, 0.02, 0.04, 0.04, 0.04, 6, 4)
  }
  const hourH = grp(clock, 0, 0, 0.05)
  part(hourH, spikeGeo(0.05, 0.55, 4), bone, 0, 0, 0, 1, 1, 0.4)
  const minH = grp(clock, 0, 0, 0.08)
  part(minH, spikeGeo(0.035, 0.78, 4), vio, 0, 0, 0, 1, 1, 0.4)
  ell(clock, gl, 0, 0, 0.1, 0.07, 0.07, 0.04, 10, 8)
  // 腰間的小環與漂浮的刻度骨片
  const waist = grp(w.pelvis, 0, 0.1, 0)
  part(waist, torus(0.5, 0.02, 4, 40), vio, 0, 0, 0, 1, 1, 1, Math.PI / 2)
  for (let i = 0; i < 8; i++) {
    const a = (i / 8) * Math.PI * 2
    part(waist, spikeGeo(0.035, 0.14, 4), bone, Math.cos(a) * 0.5, 0, Math.sin(a) * 0.5, 1, 1, 1, Math.PI / 2, -a + Math.PI / 2, 0)
  }
  const robe = new Tentacle(grp(w.pelvis, 0, -0.05, 0, Math.PI - 0.1), { len: 0.95, r0: 0.17, r1: 0.04, bones: 5, ridge: 0.06 }, skin)
  // 時之砂：往上倒流的光點
  const sand: THREE.Mesh[] = []
  for (let i = 0; i < 8; i++) sand.push(ell(fl, i % 2 ? gl : vio, 0, 0, 0, 0.025, 0.025, 0.025, 6, 4))
  return view(b, 1.15, 2.65, (t) => {
    const L = b.L
    fl.position.y = hover + Math.sin(t * 1.1 + L.ph) * 0.06
    fl.rotation.x = L.move * 0.18
    const st = L.strike * L.atk
    const rate = 1 + L.cast * 6 - L.atk * 0.5
    minH.rotation.z = -t * 0.9 * rate
    hourH.rotation.z = -t * 0.075 * rate
    clock.rotation.z = Math.sin(t * 0.4) * 0.05
    waist.rotation.y = -t * 0.4 * rate
    w.arms.forEach((a, i) => {
      const sd = i ? 1 : -1
      a.sh.rotation.x = -0.6 - Math.max(0, st) * 0.9 - L.cast * 0.9 + Math.sin(t * 1.3 + i) * 0.06
      a.sh.rotation.z = sd * (0.3 + L.cast * 0.5)
      a.el.rotation.x = -0.5
    })
    robe.bend(t, 0.12, 0.12, 1.2, L.ph, -0.15 - L.move * 0.35, 0)
    sand.forEach((m, i) => {
      const u = (t * 0.25 + i / sand.length) % 1
      const a = i * 2.4 + u * 2
      m.position.set(Math.cos(a) * 0.65, 0.2 + u * 2.2, Math.sin(a) * 0.65 - 0.2)
    })
    beat(gl, 2.8 * b.v.gk, t, L, 1, 0.3)
    beat(vio, 2.4 * b.v.gk, t, L, 2, 0.3)
    if (L.dead > 0) {
      drop(fl, L.dead, hover)
      clock.rotation.x = -0.5 - L.dead * 1.0
    } else {
      fl.scale.y = 1
      clock.rotation.x = -0.5
    }
  })
})

// ═════════════ T3 操控：假面者（不定形）═════════════

regModel('xeno.mimic', (def, s) => {
  const b = base(def, s, 4, 1.2)
  const skin = flesh('#2a1446', XENO.main, 0.22, 0.6)
  const skin2 = flesh('#4a2470', '#33ffd1', 0.2, 0.5)
  const irid = liveLiquid(tone('#5ad8ff', b.v), 0.45, 0.7 * b.v.gk)
  const mask = smooth('#e8e0d8', XENO.main, 0.45, 0.25)
  const gl = liveGlow(tone(XENO.acc, b.v), 2.6 * b.v.gk)
  const body = grp(b.root)
  // 起伏的肉團
  const lumps: THREE.Mesh[] = []
  const lr = rng(31)
  for (let i = 0; i < 6; i++) {
    const a = (i / 6) * Math.PI * 2
    const rr = 0.3 + lr() * 0.2
    lumps.push(part(body, lumpGeo(1, i + 2, 0.22, 14, 10), i % 3 === 2 ? skin2 : skin, Math.sin(a) * 0.3, 0.3 + lr() * 0.3, Math.cos(a) * 0.3, rr, rr * 0.9, rr))
  }
  lumps.push(part(body, lumpGeo(1, 9, 0.2, 16, 12), skin, 0, 0.75, 0, 0.45, 0.55, 0.42))
  const sheen = part(body, lumpGeo(1, 4, 0.18, 12, 8), irid, -0.22, 0.6, 0.12, 0.3, 0.34, 0.28)
  // 半成形的人形：頭與一隻手臂從肉團裡伸出
  const half = grp(body, 0, 1.2, 0.1)
  ell(half, skin2, 0, 0.14, 0.04, 0.13, 0.15, 0.13)
  ell(half, skin, 0, -0.05, 0, 0.2, 0.14, 0.15)
  const arm = grp(half, 0.18, 0.0, 0.05, -0.5, 0, -0.5)
  ell(arm, skin2, 0, -0.22, 0, 0.05, 0.25, 0.05)
  const fore = grp(arm, 0, -0.45, 0, -0.6)
  ell(fore, skin2, 0, -0.2, 0, 0.04, 0.22, 0.04)
  for (let f = 0; f < 3; f++) spike(fore, 0.012, 0.14, skin, (f - 1) * 0.02, -0.42, 0, Math.PI, (f - 1) * 0.2)
  // 偽足
  const pods: Tentacle[] = []
  for (let i = 0; i < 5; i++) {
    const a = (i / 5) * Math.PI * 2 + 0.4
    pods.push(new Tentacle(grp(body, Math.sin(a) * 0.4, 0.25, Math.cos(a) * 0.4, Math.PI / 2 + 0.6, a, 0), { len: 0.6, r0: 0.09, r1: 0.02, bones: 4, tub: 8, rad: 6 }, skin))
  }
  // 漂浮的面具（假面之夜）
  const masks: THREE.Group[] = []
  for (let i = 0; i < 3; i++) {
    const g = grp(body)
    part(g, dome(1, 12, 6, Math.PI * 0.5), mask, 0, 0, 0, 0.13, 0.17, 0.07, Math.PI / 2)
    for (const sd of [-1, 1]) ell(g, gl, sd * 0.045, 0.03, 0.07, 0.022, 0.012, 0.01, 6, 4)
    ell(g, gl, 0, -0.07, 0.07, 0.03, 0.008, 0.01, 6, 4)
    masks.push(g)
  }
  pustules(body, 5, 13, (r) => {
    const a = r() * Math.PI * 2
    return [Math.sin(a) * 0.42, 0.45 + r() * 0.45, Math.cos(a) * 0.42, 0.06 + r() * 0.04]
  }, skin, gl, [0, 0.55, 0])
  return view(b, 1.25, 1.9, (t) => {
    const L = b.L
    lumps.forEach((m, i) => {
      const w = Math.sin(t * (1.6 + i * 0.23) + i * 1.7 + L.ph)
      m.position.y += (0.3 + (i === 6 ? 0.45 : (i % 3) * 0.12) + w * 0.06 - m.position.y) * 0.2
      m.rotation.y = t * 0.2 * (i % 2 ? 1 : -1)
      m.scale.y = m.scale.x * (0.9 + w * 0.12) * (1 - L.dead * 0.5)
    })
    sheen.rotation.y = -t * 0.3
    half.position.y = 1.2 + Math.sin(t * 0.9 + L.ph) * 0.08 - L.dead * 0.9
    half.rotation.z = Math.sin(t * 0.7) * 0.15
    const st = L.strike * L.atk
    arm.rotation.x = -0.5 - Math.max(0, st) * 1.4 + Math.min(0, st) * -1.0 + Math.sin(t * 1.3) * 0.15
    pods.forEach((T, i) => T.bend(t, 0.3, 0.25, 2 + L.move * 4, i * 1.2, -0.1, 0, 0.6))
    body.position.y = Math.abs(Math.sin(L.walk)) * 0.06 * L.move
    body.rotation.z = Math.sin(L.walk) * 0.06 * L.move
    masks.forEach((g, i) => {
      const a = t * 0.6 + (i / 3) * Math.PI * 2
      g.position.set(Math.cos(a) * 0.75, 1.0 + Math.sin(t * 1.3 + i) * 0.18, Math.sin(a) * 0.75)
      g.lookAt(b.root.localToWorld(new THREE.Vector3(Math.cos(a) * 3, 1.0, Math.sin(a) * 3)))
      g.visible = L.dead < 0.5
    })
    beat(gl, 2.6 * b.v.gk, t, L)
  })
})

// ═════════════ 輔助：時滯殭屍、遠古獸、熵渦、絲錨 ═════════════

regModel('xeno.timeZombie', (def, s) => {
  const b = base(def, s, 4.5, 0.8)
  const skin = flesh('#6c6478', XENO.main, 0.55, 0.45)
  const suit = smooth('#2e3846', '#9fe7ff', 0.75, 0.3)
  const crystal = liveLiquid(tone('#9a5cff', b.v), 0.65, 1.2 * b.v.gk)
  const gl = liveGlow(tone(XENO.acc, b.v), 2.4 * b.v.gk)
  const r = buildBiped(b.root, {
    skin: suit,
    limb: suit,
    hipH: 0.92,
    torso: [0.24, 0.27, 0.16],
    pelvis: [0.2, 0.12, 0.14],
    hunch: 0.35,
    shoulderW: 0.29,
    arm: [0.32, 0.3],
    armR: [0.07, 0.06],
    thigh: [0.44, -0.1, 0.12],
    legR: [0.085, 0.07],
    legW: 0.12,
    headR: [0.13, 0.15, 0.14],
    neckLen: 0.1,
  })
  ell(r.head, skin, 0, 0.05, 0.02, 0.13, 0.15, 0.14)
  for (const sd of [-1, 1]) ell(r.head, gl, sd * 0.045, 0.06, 0.12, 0.022, 0.016, 0.01, 6, 4)
  // 從身體刺出的紫色時晶
  const rr = rng(77)
  for (let i = 0; i < 7; i++) {
    const p = [r.torso, r.torso, r.torso, r.head, r.arms[0].sh, r.arms[1].el, r.hips][i]
    spike(p, 0.05 + rr() * 0.03, 0.22 + rr() * 0.2, crystal, (rr() - 0.5) * 0.3, 0.2 + rr() * 0.3, -0.05 - rr() * 0.12, -0.6 - rr() * 0.6, (rr() - 0.5) * 1.4, 5)
  }
  for (const a of r.arms) ell(a.hand, skin, 0, 0, 0, 0.055, 0.07, 0.05, 8, 6)
  let stutter = 0
  let held = 0
  return view(b, 1.12, 1.85, (t, dt) => {
    // 時滯：動作一頓一頓（偶爾凍結再跳格）
    stutter -= dt
    if (stutter <= 0) {
      stutter = 0.15 + Math.random() * 0.5
      held = Math.random() < 0.3 ? t : 0
    }
    const tt = held ? held : t
    animBiped(r, b.L, tt, 0.45, 0.25)
    r.arms.forEach((a) => (a.sh.rotation.x -= 0.9))
    r.neck.rotation.z = Math.sin(tt * 0.8) * 0.25
    crystal.emissiveIntensity = 1.2 * b.v.gk * (0.7 + 0.5 * Math.sin(t * 6)) * (1 - b.L.dead * 0.8)
    beat(gl, 2.4 * b.v.gk, t, b.L)
  })
})

regModel('xeno.eldritch', (def, s) => {
  const b = base(def, s, 5.5, 1)
  const skin = flesh('#2a2034', XENO.main, 0.4, 0.5)
  const hide = chitin('#3a3048', XENO.main, 0.25, 0.4)
  const bone = BONE()
  const gl = liveGlow(tone('#d8ff6a', b.v), 3 * b.v.gk)
  const r = buildQuad(b.root, {
    skin,
    chest: [0.42, 0.38, 0.45],
    pelvis: [0.3, 0.28, 0.32],
    chestZ: 0.25,
    pelvisZ: -0.45,
    shH: 0.95,
    hipH: 0.78,
    legW: 0.34,
    fl: [0.48, 0.25, -0.2],
    rl: [0.4, -0.55, 0.35],
    legR: [0.12, 0.085],
    neckLen: 0.2,
    neckPitch: 0.05,
  })
  // 中間第三對腳
  const mid = [-1, 1].map((sd) => {
    const g = grp(r.spine, sd * 0.36, 0.82, -0.12, 0.05, 0, sd * 0.5)
    ell(g, skin, 0, -0.22, 0, 0.09, 0.26, 0.09)
    const k = grp(g, 0, -0.45, 0, 0, 0, -sd * 0.6)
    ell(k, skin, 0, -0.2, 0, 0.07, 0.24, 0.07)
    return g
  })
  part(r.chest, dome(1, 14, 6, Math.PI * 0.5), hide, 0, 0.05, -0.05, 0.45, 0.4, 0.48)
  part(r.pelvis, dome(1, 14, 6, Math.PI * 0.5), hide, 0, 0.03, 0, 0.32, 0.3, 0.35)
  // 大頭：滿佈眼睛、下巴的觸鬚與獠牙
  const h = r.head
  ell(h, skin, 0, 0, 0.18, 0.32, 0.26, 0.3)
  const er = rng(5)
  for (let i = 0; i < 9; i++) {
    const a = (er() - 0.5) * 2.2
    const e = (er() - 0.3) * 0.9
    ell(h, gl, Math.sin(a) * 0.3, 0.05 + Math.sin(e) * 0.2, 0.18 + Math.cos(a) * 0.26, 0.035 + er() * 0.025, 0.035 + er() * 0.02, 0.03, 8, 6)
  }
  for (const sd of [-1, 1]) part(h, hornGeo(0.4, 0.05, 0.6, 6, 5), bone, sd * 0.18, -0.1, 0.35, 1, 1, 1, Math.PI / 2 + 0.4, Math.PI, 0)
  const beard: Tentacle[] = []
  for (let i = 0; i < 5; i++) beard.push(new Tentacle(grp(h, (i - 2) * 0.08, -0.2, 0.3, Math.PI - 0.3, 0, (i - 2) * 0.15), { len: 0.5, r0: 0.04, r1: 0.01, bones: 4, tub: 8, rad: 5 }, skin))
  for (const l of r.legs) claws(l.foot, 3, 0.15, 0.035, bone, 0.9)
  return view(b, 1.05, 1.6, (t) => {
    const L = b.L
    animQuad(r, L, t, 0.42, 0.07, 0.35)
    mid.forEach((g, i) => (g.rotation.x = 0.05 + Math.sin(L.walk + i * Math.PI + 1.5) * 0.4 * L.move))
    beard.forEach((T, i) => T.bend(t, 0.2, 0.15, 2.2, i, 0.1, 0))
    beat(gl, 3 * b.v.gk, t, L, 1.3, 0.35)
  })
})

regModel('xeno.entropyField', (_def, s) => {
  const root = new THREE.Group()
  const vio = liveGlow('#8a4cff', 2.6)
  const cy = liveGlow(XENO.acc, 2)
  const pool = liveLiquid('#1a0a3a', 0.85, 0.3)
  part(root, cyl(1.1, 1.2, 0.04, 40), pool, 0, 0.02, 0).castShadow = false
  const rings: THREE.Mesh[] = []
  for (let i = 0; i < 3; i++) {
    const m = part(root, torus(0.35 + i * 0.32, 0.025 - i * 0.004, 4, 48, Math.PI * 1.4), i === 1 ? cy : vio, 0, 0.06 + i * 0.03, 0, 1, 1, 1, -Math.PI / 2)
    m.castShadow = false
    rings.push(m)
  }
  part(root, sphereGeo(14, 8), flesh('#020104', '#7a3cff', 0.1, 1.2), 0, 0.03, 0, 0.28, 0.06, 0.28)
  const motes: THREE.Mesh[] = []
  for (let i = 0; i < 10; i++) motes.push(ell(root, i % 3 ? vio : cy, 0, 0, 0, 0.03, 0.03, 0.03, 6, 4))
  return {
    root,
    height: 0.6,
    update(t) {
      rings.forEach((m, i) => (m.rotation.z = t * (1.2 + i * 0.7) * (i % 2 ? -1 : 1)))
      motes.forEach((m, i) => {
        const u = (t * 0.45 + i / motes.length) % 1
        const a = i * 1.9 + u * 5
        const rad = 1.15 * (1 - u)
        m.position.set(Math.cos(a) * rad, 0.08 + Math.sin(u * Math.PI) * 0.3, Math.sin(a) * rad)
      })
      vio.emissiveIntensity = 2.6 * (0.8 + 0.2 * Math.sin(t * 4 + s.i))
    },
  }
})

regModel('xeno.webAnchor', (_def, s) => {
  const root = new THREE.Group()
  const resin = flesh('#3a2a50', XENO.main, 0.2, 0.5)
  const silk = glow('#d8f8ff', 1.2)
  const gl = liveGlow(XENO.acc, 2.4)
  part(root, lumpGeo(0.3, 3, 0.25, 12, 8), resin, 0, 0.15, 0, 1, 0.7, 1)
  for (let i = 0; i < 6; i++) {
    const a = (i / 6) * Math.PI * 2
    part(root, cyl(0.008, 0.008, 0.7, 3), silk, Math.cos(a) * 0.3, 0.12, Math.sin(a) * 0.3, 1, 1, 1, 0, -a, Math.PI / 2 - 0.15)
  }
  spike(root, 0.06, 0.55, resin, 0, 0.2, 0, 0, 0)
  const node = ell(root, gl, 0, 0.62, 0, 0.07, 0.07, 0.07, 10, 8)
  return {
    root,
    height: 0.8,
    update(t) {
      node.scale.setScalar(0.07 * (1 + 0.2 * Math.sin(t * 5 + s.i)))
    },
  }
})

// ═════════════ 繭：脈動的進化繭（明顯可見）═════════════

regModel('xeno.cocoon', (_def, s) => {
  const root = new THREE.Group()
  const ph = s.i * 0.7
  const shell = flesh('#2a1846', XENO.main, 0.22, 0.7)
  const strand = flesh('#4a3070', '#33ffd1', 0.2, 0.5)
  const core = liveGlow('#33ffd1', 3)
  const vio = liveGlow('#9a5cff', 2.4)
  const slime = liveLiquid('#3a1a70', 0.6, 0.25)
  const pulse = grp(root)
  // 內部的光與蜷縮的影子
  const inner = ell(pulse, core, 0, 1.15, 0, 0.5, 0.75, 0.5, 16, 12)
  ell(pulse, flesh('#0a0612', XENO.main, 0.4, 0.4), 0.05, 1.1, 0.0, 0.32, 0.5, 0.3)
  // 外殼：六片花瓣狀厚殼，縫隙透出內光
  const petals: THREE.Mesh[] = []
  for (let i = 0; i < 6; i++) {
    const a = (i / 6) * Math.PI * 2
    const prof: [number, number][] = [
      [0.02, 0.05],
      [0.42, 0.25],
      [0.66, 0.75],
      [0.68, 1.2],
      [0.58, 1.75],
      [0.35, 2.15],
      [0.02, 2.35],
    ]
    const p = part(pulse, lathePetal(prof), shell, 0, 0, 0, 1, 1, 1, 0, a, 0)
    petals.push(p)
  }
  // 纏繞的絲索
  for (let i = 0; i < 4; i++) part(pulse, torus(0.7 - Math.abs(i - 1.5) * 0.08, 0.035, 5, 30), strand, 0, 0.55 + i * 0.42, 0, 1, 1, 1, Math.PI / 2 + (i % 2 ? 0.25 : -0.2), 0, i * 0.4)
  // 縫隙發光脈絡
  for (let i = 0; i < 6; i++) {
    const a = (i / 6) * Math.PI * 2 + Math.PI / 6
    const x = Math.sin(a)
    const z = Math.cos(a)
    vein(pulse, [[x * 0.5, 0.3, z * 0.5], [x * 0.7, 0.9, z * 0.7], [x * 0.66, 1.5, z * 0.66], [x * 0.36, 2.1, z * 0.36]], 0.03, vio)
  }
  // 根與黏液池
  part(root, sphereGeo(20, 6), slime, 0, 0.0, 0, 1.0, 0.05, 1.0).castShadow = false
  for (let i = 0; i < 7; i++) {
    const a = (i / 7) * Math.PI * 2
    part(root, hornGeo(0.75, 0.07, 0.6, 6, 5), strand, Math.sin(a) * 0.5, 0.25, Math.cos(a) * 0.5, 1, 1, 1, 1.9, a, 0)
  }
  let deadAt = -1
  return {
    root,
    height: 2.45,
    update(t, _dt, _sp, state) {
      if (state === 4 && deadAt < 0) deadAt = t
      if (state !== 4) deadAt = -1
      const d = deadAt < 0 ? 0 : Math.min(1, (t - deadAt) / 0.9)
      // 心跳式雙重脈動
      const c = (t * 0.9 + ph) % 1
      const h = Math.exp(-Math.pow((c - 0.1) * 14, 2)) * (1 - d) + 0.6 * Math.exp(-Math.pow((c - 0.3) * 14, 2)) * (1 - d)
      pulse.scale.set((1 + h * 0.05) * (1 + d * 0.15), (1 + h * 0.03) * (1 - d * 0.6), (1 + h * 0.05) * (1 + d * 0.15))
      core.emissiveIntensity = (2 + h * 3) * (1 - d * 0.9)
      vio.emissiveIntensity = (1.6 + h * 2.4) * (1 - d * 0.9)
      inner.scale.set(0.5 + h * 0.06, 0.75 + h * 0.05, 0.5 + h * 0.06)
      petals.forEach((p, i) => (p.rotation.z = Math.sin(t * 1.3 + i) * 0.015))
    },
  }
})

/** 繭殼的一片花瓣：lathe 的 1/6 扇區，略縮窄留縫 */
function lathePetal(points: [number, number][]): THREE.BufferGeometry {
  const k = `petal:${JSON.stringify(points)}`
  let g = petalCache.get(k)
  if (!g) {
    g = new THREE.LatheGeometry(
      points.map(([x, y]) => new THREE.Vector2(x, y)),
      6,
      -Math.PI / 6 + 0.08,
      Math.PI / 3 - 0.16,
    )
    g.computeVertexNormals()
    petalCache.set(k, g)
  }
  return g
}
const petalCache = new Map<string, THREE.BufferGeometry>()

// ═════════════ 卵：脈動的濕潤卵 ═════════════

regModel('xeno.egg', (_def, s) => {
  const root = new THREE.Group()
  const ph = s.i * 1.3
  const leath = flesh('#4a2c70', XENO.acc, 0.16, 0.45)
  const memb = liveLiquid('#9a6cff', 0.5, 0.8)
  const core = liveGlow('#33ffd1', 2.6)
  const slime = liveLiquid('#4a2a80', 0.6, 0.35)
  const egg = grp(root)
  const prof: [number, number][] = [
    [0.02, 0.0],
    [0.2, 0.04],
    [0.3, 0.18],
    [0.32, 0.36],
    [0.27, 0.52],
    [0.17, 0.63],
    [0.08, 0.66],
  ]
  part(egg, lathe(prof, 18), leath)
  // 濕潤的外膜（半透明、略大一圈）
  part(egg, lathe(prof, 18), memb, 0, -0.01, 0, 1.06, 1.03, 1.06)
  // 頂部十字裂口：半透明膜下透出青光
  const glowIn = ell(egg, core, 0, 0.5, 0, 0.13, 0.1, 0.13, 10, 8)
  part(egg, dome(1, 14, 6, Math.PI * 0.5), memb, 0, 0.52, 0, 0.2, 0.15, 0.2)
  const lips: THREE.Mesh[] = []
  for (let i = 0; i < 4; i++) {
    const a = (i / 4) * Math.PI * 2 + Math.PI / 4
    lips.push(part(egg, dome(1, 8, 4, Math.PI * 0.5), leath, Math.sin(a) * 0.1, 0.6, Math.cos(a) * 0.1, 0.1, 0.05, 0.14, 0.5, a, 0))
  }
  for (let i = 0; i < 5; i++) {
    const a = (i / 5) * Math.PI * 2
    vein(egg, [[Math.sin(a) * 0.27, 0.1, Math.cos(a) * 0.27], [Math.sin(a + 0.2) * 0.335, 0.32, Math.cos(a + 0.2) * 0.335], [Math.sin(a + 0.1) * 0.21, 0.56, Math.cos(a + 0.1) * 0.21]], 0.02, core, 8)
  }
  part(root, sphereGeo(16, 6), slime, 0, 0, 0, 0.55, 0.04, 0.55).castShadow = false
  root.scale.setScalar(1.2)
  let deadAt = -1
  return {
    root,
    height: 0.9,
    update(t, _dt, _sp, state) {
      if (state === 4 && deadAt < 0) deadAt = t
      if (state !== 4) deadAt = -1
      const d = deadAt < 0 ? 0 : Math.min(1, (t - deadAt) / 0.6)
      const c = (t * 0.8 + ph) % 1
      const h = Math.exp(-Math.pow((c - 0.15) * 10, 2)) * (1 - d)
      egg.scale.set((1 + h * 0.06) * (1 + d * 0.3), (1 - h * 0.03) * (1 - d * 0.7), (1 + h * 0.06) * (1 + d * 0.3))
      core.emissiveIntensity = 1.6 + h * 2.6
      glowIn.scale.set(0.13 * (1 + h * 0.2), 0.1 * (1 + h * 0.2), 0.13 * (1 + h * 0.2))
      memb.opacity = 0.45 + h * 0.2
      lips.forEach((l, i) => (l.rotation.x = 0.5 + h * 0.25 + Math.sin(t * 2 + i) * 0.03))
    },
  }
})
