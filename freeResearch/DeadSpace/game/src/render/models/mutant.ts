// 變種人：完美路線（光滑人形掠食者）、感染路線（膿包、孢子、寄生肉囊）、召喚物、進化肉團（美術聖經 §9）。
// 正面朝 local +Z、腳底在 y=0；spawn 型共用同一模型（creatureKit.variant）。
import * as THREE from 'three'
import type { UnitDef } from '../../shared/content/types'
import type { SnapEntity } from '../../shared/protocol/messages'
import { cyl, torus } from '../batch'
import { regModel, type ModelView } from './index'
import {
  Life,
  MUT,
  Tentacle,
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
  grp,
  hornGeo,
  liveGlow,
  liveLiquid,
  lumpGeo,
  part,
  pustules,
  rng,
  rockGeo,
  scaleBy,
  smooth,
  sphereGeo,
  spike,
  spikeGeo,
  spiderLeg,
  stepOf,
  tone,
  variant,
  vein,
  type BipedRig,
  type SpiderLeg,
  type Variant,
} from './creatureKit'

// ───── 共用材質 ─────
const MUSCLE = () => flesh('#6a161e', MUT.acc, 0.28, 0.45)
const SINEW = () => flesh('#3a0c12', MUT.main, 0.32, 0.5)
const PALE = () => flesh('#a8806e', MUT.main, 0.45, 0.35)
const BONE = () => smooth('#d8c8a8', MUT.acc, 0.5, 0.3)
const SHELL = () => chitin('#5a1a16', MUT.acc, 0.35, 0.45)
const ROT = () => flesh('#5a4a2a', MUT.acc, 0.35, 0.4)

interface Base {
  v: Variant
  root: THREE.Group
  L: Life
}

function base(def: UnitDef | undefined, s: SnapEntity, stride = 6, atkRate = 1.1): Base {
  const v = variant(def, s)
  return { v, root: new THREE.Group(), L: new Life(v.ph, stride, atkRate) }
}

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

/** 膿包與發光的心跳脈動 */
function beat(m: THREE.MeshStandardMaterial, k: number, t: number, L: Life, f = 2, depth = 0.45): void {
  const h = Math.pow(0.5 + 0.5 * Math.sin(t * f + L.ph), 3)
  m.emissiveIntensity = k * (1 - depth + depth * 2 * h + L.atk * 0.4 + L.cast * 0.5) * (1 - L.dead * 0.85)
}

/** 漂浮的孢子：回傳每幀更新函式 */
function spores(parent: THREE.Object3D, n: number, m: THREE.Material, r: number, h0: number, h1: number, size = 0.035): (t: number, alive: boolean) => void {
  const ms: THREE.Mesh[] = []
  for (let i = 0; i < n; i++) ms.push(ell(parent, m, 0, 0, 0, size, size, size, 6, 4))
  return (t, alive) => {
    ms.forEach((o, i) => {
      const u = (t * 0.22 + i / n) % 1
      const a = i * 2.39 + t * 0.3
      o.position.set(Math.cos(a) * r * (0.6 + u * 0.6), h0 + u * (h1 - h0), Math.sin(a) * r * (0.6 + u * 0.6))
      o.scale.setScalar(size * (1 - u * 0.6))
      o.visible = alive
    })
  }
}

/** 變種人頭：無眼長顱＋縱裂的嘴，裂口透出琥珀光 */
function maw(head: THREE.Object3D, skin: THREE.Material, bone: THREE.Material, gl: THREE.Material, k = 1): THREE.Group[] {
  ell(head, skin, 0, 0.06 * k, 0.02 * k, 0.13 * k, 0.17 * k, 0.16 * k)
  part(head, dome(1, 10, 4, Math.PI * 0.5), bone, 0, 0.08 * k, -0.01 * k, 0.12 * k, 0.15 * k, 0.15 * k, -0.3)
  const flaps: THREE.Group[] = []
  for (const sd of [-1, 1]) {
    const f = grp(head, sd * 0.04 * k, -0.02 * k, 0.1 * k, 0, 0, 0)
    ell(f, skin, sd * 0.04 * k, -0.04 * k, 0.04 * k, 0.06 * k, 0.11 * k, 0.07 * k)
    for (let i = 0; i < 3; i++) spike(f, 0.012 * k, 0.06 * k, bone, sd * -0.01 * k, (-0.0 - i * 0.05) * k, 0.1 * k, Math.PI / 2, -sd * 0.6, 4)
    flaps.push(f)
  }
  ell(head, gl, 0, -0.04 * k, 0.12 * k, 0.03 * k, 0.09 * k, 0.04 * k, 6, 4)
  return flaps
}

/** 嘴巴開合：兩片顎往外張 */
function openMaw(flaps: THREE.Group[], k: number): void {
  flaps.forEach((f, i) => (f.rotation.y = (i ? 1 : -1) * k * 0.6))
}

/** 雙足掛爪 */
function handClaws(r: BipedRig, n: number, len: number, rad: number, m: THREE.Material): void {
  for (const a of r.arms) claws(grp(a.hand, 0, 0, 0, -Math.PI / 2), n, len, rad, m, 0.9)
}

// ═════════════ 完美路線 ═════════════

regModel('mut.apex', (def, s) => {
  const b = base(def, s, 6.5, 1.2)
  const skin = MUSCLE()
  const sinew = SINEW()
  const bone = BONE()
  const gl = liveGlow(tone(MUT.acc, b.v), 2.4 * b.v.gk)
  const r = buildBiped(b.root, {
    skin,
    limb: skin,
    hipH: 1.02,
    torso: [0.26, 0.3, 0.18],
    pelvis: [0.19, 0.13, 0.15],
    hunch: 0.32,
    shoulderW: 0.31,
    arm: [0.42, 0.46],
    armR: [0.085, 0.065],
    thigh: [0.5, -0.38, 0.32],
    legR: [0.105, 0.07],
    legW: 0.14,
    headR: [0.14, 0.16, 0.17],
    neckLen: 0.14,
  })
  const flaps = maw(r.head, skin, bone, gl)
  // 骨質胸板、脊椎棘、腱線
  part(r.torso, dome(1, 10, 4, Math.PI * 0.45), bone, 0, 0.32, 0.12, 0.16, 0.24, 0.08, Math.PI / 2 - 0.15)
  for (let i = 0; i < 5; i++) spike(r.torso, 0.025, 0.12 - i * 0.012, bone, 0, 0.45 - i * 0.1, -0.16, -1.9, 0, 4)
  for (const sd of [-1, 1]) {
    vein(r.torso, [[sd * 0.2, 0.5, 0.1], [sd * 0.24, 0.3, 0.12], [sd * 0.16, 0.08, 0.13]], 0.02, gl, 8)
    ell(r.torso, sinew, sd * 0.16, 0.18, 0.05, 0.1, 0.16, 0.12)
  }
  // 背脊一道琥珀色的發光腱，遠看也認得出
  vein(r.torso, [[0, 0.62, -0.12], [0, 0.4, -0.19], [0, 0.12, -0.16]], 0.03, gl, 8)
  for (const a of r.arms) vein(a.sh, [[0.06, -0.05, 0.03], [0.07, -0.25, 0.04], [0.05, -0.42, 0.03]], 0.016, gl, 6)
  handClaws(r, 3, 0.38, 0.028, bone)
  for (const l of r.legs) claws(l.foot, 2, 0.14, 0.03, bone, 0.6)
  return view(b, 1.06, 2.3, (t) => {
    const L = b.L
    animBiped(r, L, t, 0.6, 0.55)
    openMaw(flaps, Math.max(0, L.strike) * L.atk + Math.sin(t * 1.2 + L.ph) * 0.05)
    beat(gl, 2.4 * b.v.gk, t, L)
  })
})

regModel('mut.blitz', (def, s) => {
  const b = base(def, s, 9, 1.8)
  const skin = flesh('#7a1a22', MUT.acc, 0.22, 0.5)
  const bone = BONE()
  const gl = liveGlow(tone(MUT.acc, b.v), 2.6 * b.v.gk)
  const r = buildBiped(b.root, {
    skin,
    hipH: 1.08,
    torso: [0.22, 0.28, 0.16],
    pelvis: [0.16, 0.12, 0.14],
    hunch: 0.75,
    shoulderW: 0.26,
    arm: [0.38, 0.36],
    armR: [0.07, 0.055],
    thigh: [0.56, -0.55, 0.45],
    legR: [0.1, 0.06],
    legW: 0.13,
    headR: [0.12, 0.13, 0.2],
    neckLen: 0.12,
  })
  // 流線頭：往後拉長的頭冠
  ell(r.head, skin, 0, 0.04, 0.06, 0.11, 0.11, 0.22)
  part(r.head, hornGeo(0.5, 0.05, -0.3, 6, 5), bone, 0, 0.06, -0.05, 1, 1, 1, -1.9, 0, 0)
  ell(r.head, gl, 0, -0.02, 0.24, 0.05, 0.02, 0.04, 6, 4)
  for (const sd of [-1, 1]) ell(r.head, gl, sd * 0.07, 0.05, 0.17, 0.025, 0.012, 0.03, 6, 4)
  // 前臂骨刃
  for (const a of r.arms) part(a.el, hornGeo(0.72, 0.045, -0.35, 6, 4), bone, 0, -0.1, 0.04, 1, 1, 0.45, Math.PI, 0, 0)
  // 背後拖曳的鰭鬚
  const fins: Tentacle[] = []
  for (const sd of [-1, 1]) fins.push(new Tentacle(grp(r.torso, sd * 0.1, 0.5, -0.12, -2.2, 0, sd * 0.3), { len: 0.8, r0: 0.04, r1: 0.008, bones: 5, tub: 10, rad: 5 }, skin))
  for (const l of r.legs) {
    claws(l.foot, 2, 0.16, 0.03, bone, 0.6)
    spike(l.knee, 0.025, 0.16, bone, 0, 0, 0.05, 0.9, 0, 4)
  }
  for (const sd of [-1, 1]) vein(r.torso, [[sd * 0.17, 0.5, 0.08], [sd * 0.21, 0.25, 0.1], [sd * 0.13, 0.05, 0.12]], 0.012, gl, 8)
  return view(b, 1, 2.1, (t) => {
    const L = b.L
    animBiped(r, L, t, 0.75, 0.2)
    // 奔跑時雙刃往後收
    for (const a of r.arms) a.sh.rotation.x += L.move * 0.7
    fins.forEach((T, i) => T.bend(t, 0.2, 0.2, 3 + L.move * 6, i * 2, 0.2 + L.move * 0.25, 0))
    beat(gl, 2.6 * b.v.gk, t, L, 3)
  })
})

regModel('mut.brawn', (def, s) => {
  const b = base(def, s, 4, 0.9)
  const skin = MUSCLE()
  const sinew = SINEW()
  const bone = BONE()
  const gl = liveGlow(tone(MUT.acc, b.v), 2.2 * b.v.gk)
  const r = buildBiped(b.root, {
    skin,
    hipH: 0.95,
    torso: [0.5, 0.42, 0.36],
    pelvis: [0.3, 0.2, 0.24],
    hunch: 0.55,
    shoulderW: 0.58,
    arm: [0.5, 0.62],
    armR: [0.16, 0.2],
    thigh: [0.45, -0.25, 0.2],
    legR: [0.17, 0.13],
    legW: 0.22,
    headR: [0.15, 0.14, 0.16],
    neckLen: 0.05,
  })
  // 小頭陷進肩膀
  ell(r.head, sinew, 0, 0.0, 0.08, 0.15, 0.13, 0.15)
  for (const sd of [-1, 1]) ell(r.head, gl, sd * 0.06, 0.03, 0.2, 0.02, 0.015, 0.01, 6, 4)
  ell(r.head, bone, 0, -0.07, 0.16, 0.1, 0.04, 0.06)
  for (const sd of [-1, 1]) part(r.head, hornGeo(0.28, 0.04, 0.5, 5, 4), bone, sd * 0.1, 0.08, 0.02, 1, 1, 1, -0.3, 0, sd * 0.9)
  // 肩背的骨刺叢、肌肉團塊
  for (const sd of [-1, 1]) {
    part(r.torso, lumpGeo(1, sd + 3, 0.18, 10, 7), skin, sd * 0.34, 0.68, -0.02, 0.3, 0.26, 0.28)
    for (let i = 0; i < 3; i++) spike(r.torso, 0.05, 0.3 - i * 0.06, bone, sd * (0.3 + i * 0.06), 0.85 - i * 0.04, -0.1 - i * 0.05, -0.5, -sd * (0.4 + i * 0.25), 5)
    vein(r.torso, [[sd * 0.4, 0.6, 0.2], [sd * 0.46, 0.35, 0.18], [sd * 0.3, 0.1, 0.25]], 0.022, gl, 8)
  }
  for (let i = 0; i < 4; i++) spike(r.torso, 0.05, 0.22, bone, 0, 0.75 - i * 0.15, -0.32 + i * 0.02, -1.6, 0, 5)
  // 巨大拳頭
  for (const a of r.arms) {
    part(a.hand, lumpGeo(1, 7, 0.15, 10, 7), skin, 0, -0.05, 0, 0.2, 0.22, 0.2)
    claws(grp(a.hand, 0, -0.1, 0.05, -Math.PI / 2), 3, 0.18, 0.04, bone, 1)
    ell(a.el, sinew, 0, -0.25, 0.04, 0.17, 0.26, 0.16)
  }
  for (const l of r.legs) ell(l.foot, sinew, 0, 0.02, 0.06, 0.13, 0.06, 0.18)
  return view(b, 1, 2.55, (t) => {
    const L = b.L
    animBiped(r, L, t, 0.45, 0.4)
    // 拳頭拖地的猩猩姿態；攻擊時雙拳砸地
    const st = L.strike * L.atk
    for (const a of r.arms) {
      a.sh.rotation.x += -0.2 - Math.max(0, st) * 0.6
      a.sh.rotation.z *= 1.8
    }
    r.arms[0].sh.rotation.x = r.arms[1].sh.rotation.x
    beat(gl, 2.2 * b.v.gk, t, L, 1.6)
  })
})

regModel('mut.lurker', (def, s) => {
  const b = base(def, s, 5, 0.37)
  const skin = flesh('#4a2a22', MUT.acc, 0.3, 0.4)
  const hide = chitin('#3a1a14', MUT.acc, 0.3, 0.4)
  const bone = BONE()
  const gl = liveGlow(tone('#ff5a3a', b.v), 2.8 * b.v.gk)
  const am = liveGlow(tone(MUT.acc, b.v), 2.2 * b.v.gk)
  const r = buildQuad(b.root, {
    skin,
    chest: [0.26, 0.22, 0.45],
    pelvis: [0.22, 0.2, 0.32],
    chestZ: 0.35,
    pelvisZ: -0.5,
    shH: 0.72,
    hipH: 0.7,
    legW: 0.36,
    fl: [0.42, 0.7, -0.5],
    rl: [0.42, -0.8, 0.6],
    legR: [0.075, 0.05],
    neckLen: 0.3,
    neckPitch: 0.1,
    tail: { len: 1.2, r0: 0.08, r1: 0.02, bones: 6, tub: 12, rad: 6 },
  })
  // 背上的脊骨長砲（往前伸出頭頂）
  const gun = grp(r.spine, 0, 1.0, -0.1, 0.05)
  part(gun, cyl(0.08, 0.11, 1.5, 10), bone, 0, 0, 0.35, 1, 1, 1, Math.PI / 2)
  for (let i = 0; i < 5; i++) part(gun, torus(0.11, 0.025, 5, 12), hide, 0, 0, -0.25 + i * 0.25, 1, 1, 1, 0)
  part(gun, cyl(0.06, 0.06, 0.03, 10), am, 0, 0, 1.1, 1, 1, 1, Math.PI / 2)
  for (const sd of [-1, 1]) part(gun, hornGeo(0.5, 0.04, 0.4, 6, 4), bone, sd * 0.1, -0.08, -0.2, 1, 1, 1, Math.PI / 2 + 0.3, 0, sd * 0.4)
  part(r.chest, dome(1, 12, 5, Math.PI * 0.5), hide, 0, 0.04, 0, 0.28, 0.24, 0.47)
  part(r.pelvis, dome(1, 12, 5, Math.PI * 0.5), hide, 0, 0.04, 0, 0.24, 0.22, 0.34)
  // 扁平的頭與一叢小眼
  const h = r.head
  ell(h, skin, 0, 0, 0.1, 0.17, 0.09, 0.24)
  const er = rng(9)
  for (let i = 0; i < 7; i++) ell(h, gl, (er() - 0.5) * 0.22, 0.06 + er() * 0.03, 0.12 + er() * 0.14, 0.022, 0.022, 0.022, 6, 4)
  for (const l of r.legs) claws(l.foot, 2, 0.13, 0.025, bone, 0.7)
  let recoil = 0
  return view(b, 1, 1.25, (t, dt) => {
    const L = b.L
    animQuad(r, L, t, 0.5, 0.03, 0.05)
    // 射擊：長砲後座
    if (L.atk > 0.5 && L.strike > 0.95) recoil = 1
    recoil = Math.max(0, recoil - dt * 3)
    gun.position.z = -0.1 - recoil * 0.25
    gun.rotation.x = 0.05 - recoil * 0.12
    am.emissiveIntensity = 2.2 * b.v.gk * (0.6 + recoil * 2 + L.atk * 0.5) * (1 - L.dead)
    beat(gl, 2.8 * b.v.gk, t, L, 1.2, 0.3)
  })
})

regModel('mut.carcinid', (def, s) => {
  const b = base(def, s, 5, 0.17)
  const shell = SHELL()
  const skin = MUSCLE()
  const bone = BONE()
  const spore = liveGlow(tone(MUT.acc, b.v), 2.6 * b.v.gk)
  const red = liveGlow(tone('#ff5a3a', b.v), 2.4 * b.v.gk)
  const body = grp(b.root, 0, 0.8, 0)
  // 寬甲殼
  ell(body, skin, 0, -0.05, 0, 0.85, 0.32, 0.65)
  part(body, dome(1, 18, 7, Math.PI * 0.5), shell, 0, 0.0, 0, 1.0, 0.45, 0.78)
  for (let i = 0; i < 4; i++) part(body, torus(0.9 - i * 0.18, 0.025, 4, 30, Math.PI), bone, 0, 0.06 + i * 0.1, -0.05, 1, 0.75 - i * 0.1, 1, Math.PI / 2 + 0.25, 0, 0)
  for (let i = 0; i < 6; i++) {
    const a = (i / 5 - 0.5) * 2.4
    spike(body, 0.05, 0.25, bone, Math.sin(a) * 0.95, 0.05, Math.cos(a) * 0.72, Math.cos(a) * 1.3, -Math.sin(a) * 1.3, 5)
  }
  // 背上的孢子臼砲
  const mortar = grp(body, 0, 0.38, -0.15, -0.35)
  part(mortar, cyl(0.16, 0.24, 0.5, 12, true), shell, 0, 0.2, 0)
  part(mortar, torus(0.16, 0.04, 6, 16), bone, 0, 0.45, 0, 1, 1, 1, Math.PI / 2)
  const sporeBall = ell(mortar, spore, 0, 0.35, 0, 0.12, 0.12, 0.12)
  pustules(body, 7, 21, (r) => {
    const a = (r() - 0.5) * 4
    return [Math.sin(a) * 0.65, 0.3 + r() * 0.1, Math.cos(a) * 0.5 - 0.1, 0.07 + r() * 0.04]
  }, skin, spore, [0, -0.2, 0])
  // 眼柄
  for (const sd of [-1, 1]) {
    const st = grp(body, sd * 0.18, 0.15, 0.7, -0.3, 0, sd * 0.2)
    part(st, cyl(0.025, 0.03, 0.3, 6), skin, 0, 0.15, 0)
    ell(st, red, 0, 0.32, 0, 0.05, 0.05, 0.05, 8, 6)
  }
  // 兩支大鉗
  const pincers: { arm: THREE.Group; claw: THREE.Group }[] = []
  for (const sd of [-1, 1]) {
    const arm = grp(body, sd * 0.6, -0.05, 0.5, 0.2, sd * 0.5, 0)
    ell(arm, shell, 0, 0, 0.3, 0.13, 0.13, 0.35)
    const fore = grp(arm, 0, 0, 0.62, 0, -sd * 0.9, 0)
    ell(fore, shell, 0, 0, 0.25, 0.2, 0.17, 0.32)
    part(fore, hornGeo(0.5, 0.09, -0.5, 6, 5), bone, sd * 0.05, 0.05, 0.4, 1, 1, 1, Math.PI / 2, 0, 0)
    const claw = grp(fore, -sd * 0.08, -0.04, 0.4)
    part(claw, hornGeo(0.4, 0.07, 0.6, 6, 5), bone, 0, 0, 0, 1, 1, 1, Math.PI / 2, 0, 0)
    pincers.push({ arm, claw })
  }
  // 六隻腳
  const legs: SpiderLeg[] = []
  for (const sd of [-1, 1]) {
    for (let i = 0; i < 3; i++) {
      const yaw = sd > 0 ? -(0.3 - i * 0.5) : Math.PI + (0.3 - i * 0.5)
      legs.push(spiderLeg(body, sd * 0.6, -0.15, 0.15 - i * 0.3, yaw, 0.6, 0.075, 0.6, 0.5, shell, bone))
    }
  }
  return view(b, 1, 1.6, (t) => {
    const L = b.L
    legs.forEach((l, i) => {
      const [sw, lift] = stepOf(L.walk * 2, (i % 3) / 3 + (i < 3 ? 0 : 0.5))
      animSpider(l, sw, lift, L.move, 0.2)
    })
    const br = L.breathe(t, 1)
    body.position.y = 0.8 + (br - 0.5) * 0.03
    const st = L.strike * L.atk
    mortar.rotation.x = -0.35 + Math.max(0, st) * 0.15
    sporeBall.position.y = 0.35 + Math.max(0, st) * 0.4
    sporeBall.visible = st < 0.9
    pincers.forEach((p, i) => {
      p.claw.rotation.y = (i ? -1 : 1) * (0.1 + 0.25 * (0.5 + 0.5 * Math.sin(t * 2 + i)))
      p.arm.rotation.x = 0.2 + L.cast * -0.5 + Math.sin(t * 0.8 + i) * 0.04
    })
    beat(spore, 2.6 * b.v.gk, t, L, 1.5)
    beat(red, 2.4 * b.v.gk, t, L, 0.7, 0.2)
    if (L.dead > 0) {
      for (const l of legs) l.femur.rotation.z = l.up + L.dead * 0.8
      body.position.y = 0.8 - L.dead * 0.5
      body.rotation.z = L.dead * 0.2
    }
  })
})

regModel('mut.colossus', (def, s) => {
  const b = base(def, s, 3.2, 0.8)
  const skin = MUSCLE()
  const pale = PALE()
  const sinew = SINEW()
  const bone = BONE()
  const rock = chitin('#4a4440', MUT.acc, 0.15, 0.3)
  const gl = liveGlow(tone(MUT.acc, b.v), 2.4 * b.v.gk)
  const red = liveGlow(tone('#ff4a2a', b.v), 2.2 * b.v.gk)
  const r = buildBiped(b.root, {
    skin,
    limb: sinew,
    hipH: 1.25,
    torso: [0.75, 0.62, 0.55],
    pelvis: [0.5, 0.3, 0.38],
    hunch: 0.45,
    shoulderW: 0.85,
    arm: [0.8, 0.85],
    armR: [0.28, 0.25],
    thigh: [0.62, -0.2, 0.15],
    legR: [0.27, 0.22],
    legW: 0.36,
    headR: [0.2, 0.2, 0.22],
    neckLen: 0.05,
  })
  // 融合的肉塊、嵌在身上的岩石與殘骸、裂縫透出的熔光
  const lr = rng(41)
  for (let i = 0; i < 9; i++) {
    const a = lr() * Math.PI * 2
    const y = 0.2 + lr() * 1.0
    const sz = 0.22 + lr() * 0.18
    part(r.torso, lumpGeo(1, i + 11, 0.22, 10, 7), i % 3 ? skin : pale, Math.sin(a) * 0.62, y, Math.cos(a) * 0.45, sz, sz * 0.9, sz)
  }
  for (let i = 0; i < 6; i++) {
    const a = lr() * Math.PI * 2
    part(r.torso, rockGeo(), rock, Math.sin(a) * 0.7, 0.4 + lr() * 0.8, Math.cos(a) * 0.5, 0.14 + lr() * 0.1, 0.12 + lr() * 0.08, 0.14 + lr() * 0.1, lr() * 3, lr() * 3, lr())
  }
  // 融合的臉（半埋的頭骨）
  for (let i = 0; i < 3; i++) {
    const g = grp(r.torso, (i - 1) * 0.4, 0.55 + (i % 2) * 0.3, 0.52 - Math.abs(i - 1) * 0.12)
    ell(g, pale, 0, 0, 0, 0.13, 0.15, 0.1)
    for (const sd of [-1, 1]) ell(g, red, sd * 0.045, 0.03, 0.08, 0.025, 0.02, 0.01, 6, 4)
    ell(g, sinew, 0, -0.07, 0.08, 0.05, 0.025, 0.02, 6, 4)
  }
  for (const sd of [-1, 1]) {
    vein(r.torso, [[sd * 0.5, 1.1, 0.35], [sd * 0.7, 0.75, 0.3], [sd * 0.5, 0.3, 0.4]], 0.035, gl, 8)
    for (let i = 0; i < 3; i++) spike(r.torso, 0.08, 0.5 - i * 0.1, bone, sd * (0.45 + i * 0.12), 1.15 - i * 0.05, -0.2 - i * 0.08, -0.6, -sd * (0.5 + i * 0.3), 5)
  }
  ell(r.head, sinew, 0, 0, 0.12, 0.2, 0.18, 0.2)
  for (const sd of [-1, 1]) ell(r.head, gl, sd * 0.08, 0.04, 0.28, 0.03, 0.02, 0.01, 6, 4)
  part(r.head, hornGeo(0.35, 0.05, 0.4, 5, 4), bone, 0, 0.1, 0.1, 1, 1, 1, -0.5, 0, 0)
  // 巨拳
  for (const a of r.arms) {
    part(a.hand, lumpGeo(1, 23, 0.2, 12, 8), skin, 0, -0.1, 0.05, 0.33, 0.33, 0.33)
    part(a.hand, rockGeo(), rock, 0.05, -0.2, 0.15, 0.18, 0.15, 0.18, 0.3, 0.5, 0)
    ell(a.sh, skin, 0, 0.05, 0, 0.36, 0.32, 0.36)
  }
  for (const l of r.legs) ell(l.foot, sinew, 0, 0.04, 0.1, 0.26, 0.1, 0.32)
  return view(b, 1.15, 3.7, (t) => {
    const L = b.L
    animBiped(r, L, t, 0.38, 0.35)
    const st = L.strike * L.atk
    for (const a of r.arms) {
      a.sh.rotation.x += -0.15 - Math.max(0, st) * 0.4
      a.sh.rotation.z *= 1.6
    }
    r.body.position.y += Math.abs(Math.sin(L.walk)) * 0.04 * L.move
    beat(gl, 2.4 * b.v.gk, t, L, 1.2)
    beat(red, 2.2 * b.v.gk, t, L, 0.9, 0.3)
  })
})

regModel('mut.taurus', (def, s) => {
  const b = base(def, s, 5, 1)
  const skin = flesh('#5a1a16', MUT.acc, 0.32, 0.45)
  const hide = flesh('#2a1410', MUT.main, 0.6, 0.35)
  const bone = BONE()
  const horn = smooth('#e8d8b8', MUT.acc, 0.35, 0.3)
  const gl = liveGlow(tone('#ff6a2a', b.v), 2.6 * b.v.gk)
  const am = liveGlow(tone(MUT.acc, b.v), 2 * b.v.gk)
  const r = buildBiped(b.root, {
    skin,
    limb: skin,
    hipH: 1.08,
    torso: [0.48, 0.44, 0.38],
    pelvis: [0.28, 0.2, 0.24],
    hunch: 0.6,
    shoulderW: 0.52,
    arm: [0.52, 0.52],
    armR: [0.16, 0.14],
    thigh: [0.5, -0.4, 0.35],
    legR: [0.15, 0.1],
    legW: 0.2,
    headR: [0.2, 0.22, 0.26],
    neckLen: 0.08,
  })
  // 肩背的鬃毛隆起
  part(r.torso, lumpGeo(1, 17, 0.25, 12, 8), hide, 0, 0.75, -0.12, 0.45, 0.32, 0.4)
  // 牛頭：長吻、寬額、兩支大彎角
  const h = r.head
  ell(h, skin, 0, 0.02, 0.12, 0.2, 0.2, 0.24)
  ell(h, hide, 0, -0.05, 0.3, 0.14, 0.12, 0.16)
  for (const sd of [-1, 1]) {
    ell(h, gl, sd * 0.11, 0.06, 0.28, 0.03, 0.02, 0.015, 6, 4)
    ell(h, bone, sd * 0.05, -0.08, 0.43, 0.025, 0.025, 0.02, 6, 4)
    const hg = grp(h, sd * 0.16, 0.12, 0.08, 0, 0, sd * -1.3)
    part(hg, hornGeo(0.85, 0.075, 0.55, 8, 6), horn, 0, 0, 0, 1, 1, 1, 0.3, 0, 0)
  }
  // 蹄：小腿末端改成圓柱蹄
  for (const l of r.legs) part(l.foot, cyl(0.1, 0.12, 0.12, 10), bone, 0, 0.06, 0.03)
  for (const a of r.arms) claws(grp(a.hand, 0, 0, 0, -Math.PI / 2), 3, 0.2, 0.035, bone, 0.9)
  for (const sd of [-1, 1]) vein(r.torso, [[sd * 0.38, 0.6, 0.22], [sd * 0.44, 0.35, 0.2], [sd * 0.3, 0.12, 0.28]], 0.022, am, 8)
  return view(b, 1, 2.6, (t) => {
    const L = b.L
    animBiped(r, L, t, 0.55, 0.45)
    // 衝鋒：低頭頂角
    const st = Math.max(0, L.strike) * L.atk
    r.neck.rotation.x = 0.2 + L.move * 0.35 + st * 0.6
    r.torso.rotation.x += st * 0.25
    beat(gl, 2.6 * b.v.gk, t, L, 1.4, 0.3)
    beat(am, 2 * b.v.gk, t, L, 1.8)
  })
})

// ═════════════ 感染路線 ═════════════

regModel('mut.sporemother', (def, s) => {
  const b = base(def, s, 5, 1)
  const skin = PALE()
  const rot = ROT()
  const bone = BONE()
  const pus = liveGlow(tone(MUT.acc, b.v), 2.6 * b.v.gk)
  const r = buildBiped(b.root, {
    skin,
    hipH: 0.92,
    torso: [0.3, 0.32, 0.24],
    pelvis: [0.2, 0.14, 0.16],
    hunch: 0.65,
    shoulderW: 0.3,
    arm: [0.4, 0.42],
    armR: [0.08, 0.065],
    thigh: [0.46, -0.3, 0.26],
    legR: [0.1, 0.075],
    legW: 0.14,
    headR: [0.14, 0.15, 0.16],
    neckLen: 0.1,
  })
  const flaps = maw(r.head, skin, bone, pus)
  // 背上的孢子囊團
  part(r.torso, lumpGeo(1, 5, 0.2, 12, 8), rot, 0, 0.6, -0.18, 0.36, 0.3, 0.3)
  pustules(r.torso, 9, 3, (rr) => {
    const a = (rr() - 0.5) * 2.6
    return [Math.sin(a) * 0.3, 0.45 + rr() * 0.42, -0.2 - Math.cos(a) * 0.22, 0.06 + rr() * 0.05]
  }, rot, pus, [0, 0.55, 0])
  for (let i = 0; i < 4; i++) {
    const g = grp(r.torso, (i - 1.5) * 0.12, 0.85, -0.25, -0.6 - Math.abs(i - 1.5) * 0.2, 0, (i - 1.5) * 0.35)
    part(g, cyl(0.02, 0.03, 0.3, 5), rot, 0, 0.15, 0)
    ell(g, pus, 0, 0.32, 0, 0.05, 0.06, 0.05, 8, 6)
  }
  handClaws(r, 3, 0.22, 0.02, bone)
  const sp = spores(b.root, 8, pus, 0.6, 1.0, 2.6)
  return view(b, 1, 2.2, (t) => {
    const L = b.L
    animBiped(r, L, t, 0.5, 0.4)
    openMaw(flaps, Math.max(0, L.strike) * L.atk)
    beat(pus, 2.6 * b.v.gk, t, L, 1.7, 0.5)
    sp(t, L.dead < 0.5)
  })
})

regModel('mut.drone', (def, s) => {
  const b = base(def, s, 4.5, 1)
  const skin = PALE()
  const suit = smooth('#4a5a5a', '#9fe7ff', 0.8, 0.25)
  const rot = ROT()
  const pus = liveGlow(tone(MUT.acc, b.v), 2.4 * b.v.gk)
  const r = buildBiped(b.root, {
    skin: suit,
    hipH: 0.92,
    torso: [0.24, 0.27, 0.16],
    pelvis: [0.19, 0.12, 0.14],
    hunch: 0.4,
    shoulderW: 0.28,
    arm: [0.32, 0.32],
    armR: [0.07, 0.06],
    thigh: [0.44, -0.08, 0.1],
    legR: [0.085, 0.07],
    legW: 0.12,
    headR: [0.13, 0.15, 0.14],
    neckLen: 0.1,
  })
  ell(r.head, skin, 0, 0.05, 0.02, 0.13, 0.15, 0.14)
  // 從頭殼與肩膀爆出的寄生肉囊
  part(r.head, lumpGeo(1, 8, 0.25, 10, 7), rot, 0.05, 0.13, -0.03, 0.13, 0.1, 0.12)
  pustules(r.head, 3, 4, (rr) => [(rr() - 0.5) * 0.15, 0.15 + rr() * 0.05, (rr() - 0.5) * 0.12, 0.035 + rr() * 0.02], rot, pus, [0, 0.05, 0])
  part(r.torso, lumpGeo(1, 9, 0.25, 10, 7), rot, 0.18, 0.5, -0.05, 0.14, 0.12, 0.13)
  pustules(r.torso, 4, 6, (rr) => [0.15 + rr() * 0.1, 0.4 + rr() * 0.2, -0.1 + rr() * 0.15, 0.04 + rr() * 0.02], rot, pus, [0, 0.4, 0])
  for (const sd of [-1, 1]) ell(r.head, pus, sd * 0.045, 0.06, 0.12, 0.022, 0.016, 0.01, 6, 4)
  for (const a of r.arms) ell(a.hand, skin, 0, 0, 0, 0.055, 0.07, 0.05, 8, 6)
  return view(b, 1.12, 1.85, (t) => {
    const L = b.L
    animBiped(r, L, t, 0.4, 0.2)
    // 蹣跚：雙手前伸、頭歪
    for (const a of r.arms) a.sh.rotation.x -= 0.8
    r.neck.rotation.z = 0.3 + Math.sin(t * 0.9 + L.ph) * 0.1
    r.torso.rotation.z = Math.sin(L.walk) * 0.08 * L.move
    beat(pus, 2.4 * b.v.gk, t, L, 1.5)
  })
})

regModel('mut.mimetic', (def, s) => {
  const b = base(def, s, 5.5, 1)
  const skin = flesh('#8a6a5a', MUT.main, 0.35, 0.4)
  const meat = MUSCLE()
  const mask = smooth('#e6d8c8', MUT.acc, 0.45, 0.2)
  const bone = BONE()
  const acid = liveGlow(tone('#c8f03a', b.v), 2.4 * b.v.gk)
  const acidL = liveLiquid(tone('#a8d82a', b.v), 0.55, 0.9 * b.v.gk)
  const r = buildBiped(b.root, {
    skin,
    hipH: 1.0,
    torso: [0.22, 0.3, 0.16],
    pelvis: [0.17, 0.12, 0.13],
    hunch: 0.2,
    shoulderW: 0.26,
    arm: [0.38, 0.4],
    armR: [0.065, 0.055],
    thigh: [0.5, -0.12, 0.12],
    legR: [0.09, 0.065],
    legW: 0.12,
    headR: [0.13, 0.15, 0.15],
    neckLen: 0.18,
  })
  // 人臉面具＋從臉後翻開的肉瓣（像花一樣綻開）
  const face = grp(r.head, 0, 0.05, 0.06)
  part(face, dome(1, 12, 6, Math.PI * 0.5), mask, 0, 0, 0.04, 0.12, 0.15, 0.08, Math.PI / 2)
  for (const sd of [-1, 1]) ell(face, acid, sd * 0.04, 0.03, 0.115, 0.015, 0.01, 0.01, 6, 4)
  const petals: THREE.Group[] = []
  for (let i = 0; i < 5; i++) {
    const a = (i / 5) * Math.PI * 2
    const g = grp(r.head, Math.cos(a) * 0.08, 0.06 + Math.sin(a) * 0.08, -0.02, 0, 0, a - Math.PI / 2)
    part(g, spikeGeo(0.08, 0.3, 4), meat, 0, 0, 0, 1, 1, 0.35, -0.6)
    petals.push(g)
  }
  // 喉部的酸液囊、手臂上的毒腺
  const throat = ell(r.torso, acidL, 0, 0.52, 0.12, 0.11, 0.12, 0.1)
  ell(r.torso, acid, 0, 0.52, 0.13, 0.06, 0.07, 0.06, 8, 6)
  for (const a of r.arms) pustules(a.sh, 3, 2, (rr) => [0.06, -0.1 - rr() * 0.25, (rr() - 0.5) * 0.06, 0.035], meat, acid, [0, -0.2, 0])
  handClaws(r, 3, 0.18, 0.018, bone)
  for (const sd of [-1, 1]) vein(r.torso, [[sd * 0.15, 0.5, 0.1], [sd * 0.19, 0.3, 0.1], [sd * 0.12, 0.08, 0.12]], 0.012, acid, 8)
  return view(b, 1, 2.25, (t) => {
    const L = b.L
    animBiped(r, L, t, 0.5, 0.35)
    const st = L.strike * L.atk
    // 吐酸：肉瓣張開、喉囊鼓起
    petals.forEach((g, i) => (g.children[0].rotation.x = -0.6 - Math.max(0, st) * 0.8 - L.cast * 0.6 + Math.sin(t * 2 + i) * 0.05))
    throat.scale.setScalar(0.11 * (1 + Math.max(0, -st) * 1.2 + 0.08 * Math.sin(t * 3)))
    r.neck.rotation.x = Math.min(0, st) * 0.5 + Math.max(0, st) * 0.3
    beat(acid, 2.4 * b.v.gk, t, L, 2.2)
  })
})

regModel('mut.spinner', (def, s) => {
  const b = base(def, s, 7, 2)
  const skin = MUSCLE()
  const pale = PALE()
  const shell = SHELL()
  const bone = BONE()
  const pus = liveGlow(tone(MUT.acc, b.v), 2.4 * b.v.gk)
  const body = grp(b.root)
  const cep = grp(body, 0, 0.75, 0.25)
  ell(cep, skin, 0, 0, 0, 0.3, 0.2, 0.34)
  part(cep, dome(1, 12, 5, Math.PI * 0.5), shell, 0, 0.03, 0, 0.32, 0.18, 0.36)
  // 從頭胸部長出的半個人形上身
  const up = grp(cep, 0, 0.12, 0.2, 0.25)
  ell(up, pale, 0, 0.25, 0, 0.17, 0.28, 0.13)
  const head = grp(up, 0, 0.6, 0.03)
  const flaps = maw(head, pale, bone, pus, 0.9)
  const arms: THREE.Group[] = []
  for (const sd of [-1, 1]) {
    const sh = grp(up, sd * 0.18, 0.45, 0, -0.5, 0, sd * 0.4)
    ell(sh, pale, 0, -0.18, 0, 0.05, 0.2, 0.05)
    const el = grp(sh, 0, -0.35, 0, -0.8)
    ell(el, pale, 0, -0.18, 0, 0.04, 0.2, 0.04)
    claws(grp(el, 0, -0.36, 0, -Math.PI / 2), 3, 0.18, 0.018, bone, 0.9)
    arms.push(sh)
  }
  // 卵囊腹部：膨大、半透明，裡面一顆顆小蛛卵
  const abd = grp(body, 0, 0.88, -0.4, 0.25)
  ell(abd, skin, 0, 0, -0.2, 0.46, 0.38, 0.5)
  const sac = liveLiquid(tone('#c85a2a', b.v), 0.35, 0.45 * b.v.gk)
  ell(abd, sac, 0, 0.05, -0.22, 0.5, 0.42, 0.54)
  for (let i = 0; i < 4; i++) {
    const a = (i / 4) * Math.PI * 2
    vein(abd, [[Math.sin(a) * 0.15, 0.4, -0.2 + Math.cos(a) * 0.15], [Math.sin(a) * 0.42, 0.18, -0.2 + Math.cos(a) * 0.45], [Math.sin(a) * 0.4, -0.2, -0.2 + Math.cos(a) * 0.42]], 0.018, pus, 8)
  }
  pustules(abd, 10, 7, (rr) => {
    const a = rr() * Math.PI * 2
    const e = rr() * 1.2
    return [Math.sin(a) * Math.cos(e) * 0.46, Math.sin(e) * 0.38, -0.2 + Math.cos(a) * Math.cos(e) * 0.5, 0.06 + rr() * 0.04]
  }, skin, pus, [0, 0, -0.2])
  for (let i = 0; i < 3; i++) spike(abd, 0.04, 0.14, bone, (i - 1) * 0.08, -0.05, -0.78, -1.7, 0, 4)
  const legs: SpiderLeg[] = []
  const yaws = [0.45, 0.0, -0.45]
  for (const sd of [-1, 1]) yaws.forEach((y, i) => legs.push(spiderLeg(cep, sd * 0.22, -0.02, 0.15 - i * 0.15, sd > 0 ? -y : Math.PI + y, 0.7, 0.06, 0.8, 0.6, skin, bone)))
  return view(b, 1, 2.0, (t) => {
    const L = b.L
    legs.forEach((l, i) => {
      const [sw, lift] = stepOf(L.walk, ((i % 3) / 3 + (i < 3 ? 0 : 0.5)) % 1)
      animSpider(l, sw, lift, L.move, 0.25)
    })
    const br = L.breathe(t, 1.3)
    cep.position.y = 0.75 + Math.sin(L.walk * 2) * 0.03 * L.move
    abd.scale.setScalar(1 + br * 0.04)
    abd.rotation.x = 0.25 + Math.sin(t * 1.1) * 0.04
    const st = L.strike * L.atk
    arms.forEach((a, i) => (a.rotation.x = -0.5 - Math.max(0, st) * (i ? 1.2 : 0.6) + Math.min(0, st) * -1.2 - L.cast * 0.8))
    up.rotation.x = 0.25 + Math.max(0, st) * 0.3
    openMaw(flaps, Math.max(0, st))
    beat(pus, 2.4 * b.v.gk, t, L, 1.8)
    if (L.dead > 0) {
      for (const l of legs) l.femur.rotation.z = l.up + L.dead * 0.9
      cep.position.y = 0.75 - L.dead * 0.45
      abd.position.y = 0.88 - L.dead * 0.5
      up.rotation.x = 0.25 + L.dead * 1.1
    }
  })
})

regModel('mut.plagueQueen', (def, s) => {
  const b = base(def, s, 3.5, 1)
  const skin = PALE()
  const meat = MUSCLE()
  const rot = ROT()
  const bone = BONE()
  const pus = liveGlow(tone(MUT.acc, b.v), 2.8 * b.v.gk)
  const green = liveGlow(tone('#b8e04a', b.v), 2.2 * b.v.gk)
  const body = grp(b.root)
  // 長裙般垂地的肉質觸鬚
  const skirt: Tentacle[] = []
  for (let i = 0; i < 9; i++) {
    const a = (i / 9) * Math.PI * 2
    const g = grp(body, Math.sin(a) * 0.22, 1.25, Math.cos(a) * 0.2, Math.PI - Math.cos(a) * 0.32, 0, Math.sin(a) * 0.32)
    skirt.push(new Tentacle(g, { len: 1.3, r0: 0.1, r1: 0.05, bones: 5, tub: 10, rad: 6, ridge: 0.08 }, i % 3 ? meat : rot))
  }
  const torso = grp(body, 0, 1.25, 0)
  ell(torso, meat, 0, 0.0, 0, 0.24, 0.16, 0.2)
  ell(torso, skin, 0, 0.4, 0, 0.2, 0.36, 0.15)
  part(torso, lumpGeo(1, 6, 0.22, 10, 7), rot, 0, 0.2, -0.15, 0.26, 0.24, 0.22)
  pustules(torso, 6, 11, (rr) => {
    const a = (rr() - 0.5) * 2.5
    return [Math.sin(a) * 0.25, 0.1 + rr() * 0.35, -0.12 - Math.cos(a) * 0.15, 0.05 + rr() * 0.03]
  }, rot, pus, [0, 0.2, 0])
  // 頭與孢子冠
  const head = grp(torso, 0, 0.82, 0.04)
  ell(head, skin, 0, 0.05, 0, 0.12, 0.16, 0.13)
  ell(head, green, 0, 0.02, 0.12, 0.06, 0.015, 0.01, 6, 4)
  const crown: THREE.Mesh[] = []
  for (let i = 0; i < 7; i++) {
    const a = (i / 7) * Math.PI * 2
    const g = grp(head, Math.sin(a) * 0.1, 0.15, Math.cos(a) * 0.08 - 0.02, Math.cos(a) * 0.35 - 0.2, 0, -Math.sin(a) * 0.35)
    part(g, cyl(0.015, 0.025, 0.42 + (i % 2) * 0.15, 5), bone, 0, 0.22, 0)
    crown.push(ell(g, i % 2 ? pus : green, 0, 0.47 + (i % 2) * 0.15, 0, 0.045, 0.06, 0.045, 8, 6))
  }
  // 細長的手與爪
  const arms: THREE.Group[] = []
  for (const sd of [-1, 1]) {
    const sh = grp(torso, sd * 0.22, 0.65, 0, -0.3, 0, sd * 0.35)
    ell(sh, meat, 0, 0.02, 0, 0.07, 0.06, 0.07)
    ell(sh, skin, 0, -0.25, 0, 0.045, 0.27, 0.045)
    const el = grp(sh, 0, -0.5, 0, -0.8)
    ell(el, skin, 0, -0.25, 0, 0.04, 0.27, 0.04)
    claws(grp(el, 0, -0.5, 0, -Math.PI / 2), 4, 0.24, 0.018, bone, 1)
    arms.push(sh)
  }
  const sp = spores(b.root, 10, pus, 0.9, 0.4, 3.2, 0.04)
  return view(b, 1, 3.1, (t) => {
    const L = b.L
    const k = L.move
    skirt.forEach((T, i) => T.bend(t, 0.12 + k * 0.1, 0.1, 1.5 + k * 3, i * 0.7 + L.ph, -k * 0.15, 0, 0.6))
    torso.position.y = 1.25 + Math.sin(t * 1.4 + L.ph) * 0.03 + Math.abs(Math.sin(L.walk)) * 0.04 * k
    torso.rotation.x = k * 0.12
    const st = L.strike * L.atk
    arms.forEach((a, i) => {
      a.rotation.x = -0.3 - Math.max(0, st) * (i ? 1.3 : 0.5) + Math.min(0, st) * -1.0 - L.cast * 1.2
      a.rotation.z = (i ? 1 : -1) * (0.35 + L.cast * 0.5)
    })
    crown.forEach((m, i) => scaleBy(m, 1 + 0.15 * Math.sin(t * 2 + i) + L.cast * 0.3))
    beat(pus, 2.8 * b.v.gk, t, L, 1.6)
    beat(green, 2.2 * b.v.gk, t, L, 2.4)
    sp(t, L.dead < 0.5)
    if (L.dead > 0) {
      torso.position.y = 1.25 - L.dead * 1.0
      torso.rotation.x = L.dead * 1.2
      for (const T of skirt) T.squash(1 - L.dead * 0.3)
    }
  })
})

regModel('mut.broodmother', (def, s) => {
  const b = base(def, s, 5, 0.9)
  const skin = PALE()
  const meat = MUSCLE()
  const rot = ROT()
  const bone = BONE()
  const pus = liveGlow(tone(MUT.acc, b.v), 2.6 * b.v.gk)
  const sacM = liveLiquid(tone('#d88a3a', b.v), 0.5, 0.55 * b.v.gk)
  const r = buildQuad(b.root, {
    skin,
    chest: [0.34, 0.28, 0.4],
    pelvis: [0.3, 0.26, 0.34],
    chestZ: 0.3,
    pelvisZ: -0.4,
    shH: 0.75,
    hipH: 0.7,
    legW: 0.36,
    fl: [0.4, 0.5, -0.3],
    rl: [0.4, -0.6, 0.45],
    legR: [0.09, 0.065],
    neckLen: 0.22,
    neckPitch: 0.35,
  })
  // 背上的帶原囊（半透明，裡面有東西在動）
  const sacs: THREE.Mesh[] = []
  const inner: THREE.Mesh[] = []
  const sr = rng(19)
  for (let i = 0; i < 5; i++) {
    const a = (i / 5) * Math.PI * 2
    const x = Math.sin(a) * 0.24
    const z = -0.05 + Math.cos(a) * 0.3
    const sz = 0.2 + sr() * 0.08
    part(r.spine, dome(1, 10, 4, Math.PI * 0.5), meat, x, 0.92, z, sz * 1.1, sz * 0.4, sz * 1.1)
    sacs.push(ell(r.spine, sacM, x, 0.98 + sz * 0.5, z, sz, sz * 1.1, sz))
    inner.push(ell(r.spine, pus, x, 0.98 + sz * 0.5, z, sz * 0.35, sz * 0.4, sz * 0.35, 8, 6))
  }
  part(r.spine, lumpGeo(1, 12, 0.2, 10, 7), rot, 0, 0.98, -0.05, 0.32, 0.18, 0.45)
  // 頭：下顎張開的口器＋小觸肢
  const flaps = maw(r.head, skin, bone, pus, 1.1)
  const palps: Tentacle[] = []
  for (const sd of [-1, 1]) palps.push(new Tentacle(grp(r.head, sd * 0.1, -0.08, 0.15, Math.PI / 2 + 0.6, 0, sd * 0.3), { len: 0.4, r0: 0.03, r1: 0.008, bones: 4, tub: 8, rad: 5 }, meat))
  for (const l of r.legs) claws(l.foot, 2, 0.13, 0.03, bone, 0.6)
  return view(b, 1.3, 1.75, (t) => {
    const L = b.L
    animQuad(r, L, t, 0.45, 0.05, 0.15)
    const st = L.strike * L.atk
    openMaw(flaps, Math.max(0, st) * 1.2)
    sacs.forEach((m, i) => {
      const h = 0.5 + 0.5 * Math.sin(t * 2.2 + i * 1.3)
      const sz = m.scale.x
      m.scale.y = sz * (1.05 + h * 0.12)
      inner[i].position.x = m.position.x + Math.sin(t * 3 + i * 2) * sz * 0.25
    })
    palps.forEach((T, i) => T.bend(t, 0.3, 0.3, 3, i * 2, 0, 0))
    beat(pus, 2.6 * b.v.gk, t, L, 2)
  })
})

/** 巢艦（地面）：生根的巢母；spawn（巢觸眷屬）是會走動的觸手團 */
regModel('mut.hiveground', (def, s) => {
  if (s.d === 'mut.hiveground.spawn') return hiveTendril(def, s)
  const b = base(def, s, 1, 0.8)
  const meat = MUSCLE()
  const skin = PALE()
  const rot = ROT()
  const sinew = SINEW()
  const bone = BONE()
  const pus = liveGlow(tone(MUT.acc, b.v), 2.6 * b.v.gk)
  const red = liveGlow(tone('#ff4a2a', b.v), 2.2 * b.v.gk)
  const body = grp(b.root)
  const mound = grp(body)
  part(mound, lumpGeo(1, 31, 0.15, 24, 16), meat, 0, 0.75, 0, 1.55, 1.2, 1.45)
  part(mound, lumpGeo(1, 32, 0.2, 18, 12), rot, 0.5, 1.35, -0.3, 0.8, 0.75, 0.75)
  part(mound, lumpGeo(1, 33, 0.2, 18, 12), skin, -0.55, 1.2, 0.2, 0.7, 0.6, 0.7)
  // 頂上的開口（呼吸的孔）與肋骨
  const orifices: THREE.Group[] = []
  for (let i = 0; i < 3; i++) {
    const a = (i / 3) * Math.PI * 2 + 0.5
    const g = grp(mound, Math.sin(a) * 0.5, 1.75 - i * 0.12, Math.cos(a) * 0.45, Math.cos(a) * 0.4, 0, -Math.sin(a) * 0.4)
    part(g, torus(0.2, 0.07, 6, 16), sinew, 0, 0, 0, 1, 1, 1, Math.PI / 2)
    ell(g, red, 0, -0.03, 0, 0.17, 0.05, 0.17, 10, 6)
    orifices.push(g)
  }
  for (let i = 0; i < 8; i++) {
    const a = (i / 8) * Math.PI * 2
    part(mound, hornGeo(1.3, 0.07, 0.8, 8, 5), bone, Math.sin(a) * 1.35, 0.15, Math.cos(a) * 1.25, 1, 1, 1, 0, a + Math.PI, 0)
  }
  pustules(mound, 14, 5, (rr) => {
    const a = rr() * Math.PI * 2
    const e = 0.2 + rr() * 0.9
    return [Math.sin(a) * Math.cos(e) * 1.5, 0.75 + Math.sin(e) * 1.1, Math.cos(a) * Math.cos(e) * 1.4, 0.1 + rr() * 0.08]
  }, rot, pus, [0, 0.6, 0])
  for (let i = 0; i < 5; i++) {
    const a = (i / 5) * Math.PI * 2 + 0.3
    vein(mound, [[Math.sin(a) * 0.5, 1.7, Math.cos(a) * 0.4], [Math.sin(a) * 1.25, 1.2, Math.cos(a) * 1.15], [Math.sin(a) * 1.55, 0.4, Math.cos(a) * 1.45]], 0.04, pus, 8)
  }
  // 在地上蔓延的根鬚、會甩動的攻擊觸手
  const roots: Tentacle[] = []
  for (let i = 0; i < 8; i++) {
    const a = (i / 8) * Math.PI * 2 + 0.2
    const g = grp(body, Math.sin(a) * 1.3, 0.12, Math.cos(a) * 1.2, 0, a, 0)
    const T = new Tentacle(grp(g, 0, 0, 0, Math.PI / 2 - 0.05), { len: 1.3, r0: 0.16, r1: 0.04, bones: 5, tub: 10, rad: 6, ridge: 0.12 }, i % 2 ? sinew : meat)
    T.mesh.scale.set(1, 1, 0.55)
    roots.push(T)
  }
  const lash: Tentacle[] = []
  for (let i = 0; i < 3; i++) {
    const a = (i - 1) * 0.9
    lash.push(new Tentacle(grp(body, Math.sin(a) * 1.0, 1.2, Math.cos(a) * 0.95, 0.5, a, 0), { len: 1.8, r0: 0.14, r1: 0.03, bones: 6, tub: 14, rad: 7, ridge: 0.1 }, meat))
  }
  const sp = spores(b.root, 10, pus, 1.4, 1.6, 3.6, 0.05)
  return view(b, 1, 2.6, (t) => {
    const L = b.L
    const c = (t * 0.55 + L.ph) % 1
    const h = Math.exp(-Math.pow((c - 0.15) * 9, 2)) + 0.5 * Math.exp(-Math.pow((c - 0.35) * 9, 2))
    mound.scale.set(1 + h * 0.035, 1 + h * 0.05, 1 + h * 0.035)
    orifices.forEach((g, i) => g.scale.set(1 + 0.25 * Math.sin(t * 1.5 + i * 2), 1, 1 + 0.25 * Math.sin(t * 1.5 + i * 2)))
    roots.forEach((T, i) => {
      for (let k2 = 1; k2 < T.bones.length; k2++) {
        T.bones[k2].rotation.x = 0
        T.bones[k2].rotation.z = Math.sin(t * 0.8 - k2 * 1.3 + i * 1.7) * 0.32 + (i % 2 ? 0.25 : -0.25)
      }
    })
    const st = L.strike * L.atk
    lash.forEach((T, i) => T.bend(t, 0.2, 0.2, 1.6 + L.atk * 3, i * 2, 0.15 - Math.max(0, st) * 0.35 + Math.min(0, st) * -0.3, 0, 0.6))
    beat(pus, 2.6 * b.v.gk, t, L, 1.1, 0.5)
    red.emissiveIntensity = 2.2 * b.v.gk * (0.6 + h) * (1 - L.dead * 0.8)
    sp(t, L.dead < 0.5)
    if (L.dead > 0) {
      mound.scale.y = 1 - L.dead * 0.45
      for (const T of lash) T.bend(t, 0, 0, 0, 0, 0.35 * L.dead, 0)
    }
  })
})

function hiveTendril(def: UnitDef | undefined, s: SnapEntity): ModelView {
  const b = base(def, s, 5, 0.67)
  const meat = MUSCLE()
  const rot = ROT()
  const pus = liveGlow(tone(MUT.acc, b.v), 2.2 * b.v.gk)
  const body = grp(b.root, 0, 0.55, 0)
  part(body, lumpGeo(1, 41, 0.2, 14, 10), meat, 0, 0, 0, 0.55, 0.45, 0.55)
  pustules(body, 6, 9, (rr) => {
    const a = rr() * Math.PI * 2
    return [Math.sin(a) * 0.45, 0.1 + rr() * 0.25, Math.cos(a) * 0.45, 0.06 + rr() * 0.03]
  }, rot, pus)
  const feet: Tentacle[] = []
  for (let i = 0; i < 6; i++) {
    const a = (i / 6) * Math.PI * 2
    feet.push(new Tentacle(grp(grp(body, Math.sin(a) * 0.35, -0.1, Math.cos(a) * 0.35, 0, a, 0), 0, 0, 0, Math.PI * 0.72), { len: 0.8, r0: 0.09, r1: 0.02, bones: 4, tub: 8, rad: 6 }, meat))
  }
  const whips: Tentacle[] = []
  for (let i = 0; i < 3; i++) {
    const a = (i / 3) * Math.PI * 2
    whips.push(new Tentacle(grp(body, Math.sin(a) * 0.2, 0.3, Math.cos(a) * 0.2, 0.25, a, 0), { len: 1.3, r0: 0.1, r1: 0.02, bones: 6, tub: 12, rad: 6, ridge: 0.1 }, meat))
  }
  return view(b, 1, 1.9, (t) => {
    const L = b.L
    feet.forEach((T, i) => T.bend(t, 0.2 + L.move * 0.3, 0.1, 2 + L.move * 6, i * 1.05, -0.3, 0, 0.5))
    const st = L.strike * L.atk
    whips.forEach((T, i) => T.bend(t, 0.25, 0.25, 1.8, i * 2.1, 0.1 - Math.max(0, st) * 0.3, 0, 0.7))
    body.position.y = 0.55 + Math.sin(t * 2) * 0.03 + Math.abs(Math.sin(L.walk)) * 0.05 * L.move
    beat(pus, 2.2 * b.v.gk, t, L)
    if (L.dead > 0) drop(body, L.dead, 0.55)
  })
}

regModel('mut.blightcrawler', (def, s) => {
  const b = base(def, s, 3.5, 0.67)
  const skin = flesh('#5a5a2a', MUT.acc, 0.2, 0.45)
  const meat = MUSCLE()
  const bone = BONE()
  const slime = liveLiquid(tone('#a8c83a', b.v), 0.42, 0.45 * b.v.gk)
  const pus = liveGlow(tone('#d8f04a', b.v), 2.4 * b.v.gk)
  const body = grp(b.root)
  // 分節的蛆身（從頭到尾逐節縮小）
  const segs: THREE.Group[] = []
  const n = 7
  for (let i = 0; i < n; i++) {
    const u = i / (n - 1)
    const r0 = 0.5 - u * 0.3 + Math.sin(u * Math.PI) * 0.12
    const g = grp(body, 0, r0 * 0.85, 0.85 - i * 0.42)
    ell(g, skin, 0, 0, 0, r0, r0 * 0.85, 0.3)
    ell(g, slime, 0, 0.02, 0, r0 * 1.06, r0 * 0.9, 0.32)
    if (i > 0 && i < n - 1) pustules(g, 2, i * 3, (rr) => [(rr() - 0.5) * r0, r0 * 0.75, (rr() - 0.5) * 0.2, 0.05 + rr() * 0.03], meat, pus)
    segs.push(g)
  }
  // 口器：一圈觸鬚與牙
  const mouth = grp(segs[0], 0, 0.05, 0.28)
  part(mouth, torus(0.22, 0.06, 6, 14), meat, 0, 0, 0)
  ell(mouth, pus, 0, 0, -0.02, 0.17, 0.17, 0.05, 10, 6)
  const tendr: Tentacle[] = []
  for (let i = 0; i < 6; i++) {
    const a = (i / 6) * Math.PI * 2
    tendr.push(new Tentacle(grp(mouth, Math.cos(a) * 0.22, Math.sin(a) * 0.22, 0.02, Math.PI / 2 - Math.sin(a) * 0.5, 0, Math.cos(a) * 0.5), { len: 0.4, r0: 0.035, r1: 0.008, bones: 4, tub: 8, rad: 5 }, meat))
    spike(mouth, 0.02, 0.1, bone, Math.cos(a) * 0.14, Math.sin(a) * 0.14, 0.03, Math.PI / 2, -a * 0.1, 4)
  }
  // 地上的黏液足跡
  const trail = part(body, sphereGeo(16, 5), slime, 0, 0.01, -0.6, 0.75, 0.025, 2.1)
  trail.castShadow = false
  return view(b, 1.1, 1.2, (t) => {
    const L = b.L
    const k = L.move
    // 蠕動：一節一節的波
    segs.forEach((g, i) => {
      const w = Math.sin(t * (1.6 + k * 4) - i * 0.9 + L.ph)
      g.scale.set(1 + w * 0.05, 1 + w * 0.07, 1 - w * 0.1)
      g.position.x = Math.sin(t * 0.9 - i * 0.6 + L.ph) * 0.06 * (i / n)
    })
    const st = L.strike * L.atk
    segs[0].rotation.x = -0.15 - Math.max(0, st) * 0.4 + Math.min(0, st) * -0.2
    tendr.forEach((T, i) => T.bend(t, 0.3, 0.3, 3, i, 0.1 + Math.max(0, st) * 0.3, 0))
    beat(pus, 2.4 * b.v.gk, t, L, 2)
    if (L.dead > 0) {
      segs.forEach((g, i) => g.scale.set(1 + L.dead * 0.15, 1 - L.dead * 0.45, 1 + L.dead * 0.05 * i))
      body.rotation.z = L.dead * 0.25
    }
  })
})

/** 進化中的肉團：明顯可見、不停蠕動與脈動 */
regModel('mut.mass', (def, s) => {
  const b = base(def, s, 2, 1)
  const meat = MUSCLE()
  const skin = PALE()
  const rot = ROT()
  const sinew = SINEW()
  const pus = liveGlow(MUT.acc, 2.6)
  const memb = liveLiquid('#e88a5a', 0.35, 0.5)
  const body = grp(b.root)
  const lumps: { m: THREE.Mesh; base: number; y: number; ph: number }[] = []
  const lr = rng(55)
  for (let i = 0; i < 9; i++) {
    const a = (i / 9) * Math.PI * 2
    const rr = i === 8 ? 0.7 : 0.32 + lr() * 0.2
    const y = i === 8 ? 0.65 : 0.3 + lr() * 0.35
    const rad = i === 8 ? 0 : 0.5
    const m = part(body, lumpGeo(1, 60 + i, 0.24, 14, 10), [meat, skin, rot, sinew][i % 4], Math.sin(a) * rad, y, Math.cos(a) * rad, rr, rr * 0.85, rr)
    lumps.push({ m, base: rr, y, ph: lr() * 6 })
  }
  const shell = part(body, lumpGeo(1, 70, 0.15, 16, 12), memb, 0, 0.6, 0, 0.95, 0.75, 0.95)
  shell.castShadow = false
  const pz = pustules(body, 10, 17, (rr) => {
    const a = rr() * Math.PI * 2
    const e = rr() * 1.1
    return [Math.sin(a) * Math.cos(e) * 0.78, 0.45 + Math.sin(e) * 0.6, Math.cos(a) * Math.cos(e) * 0.78, 0.07 + rr() * 0.05]
  }, rot, pus, [0, 0.45, 0])
  for (let i = 0; i < 6; i++) {
    const a = (i / 6) * Math.PI * 2
    vein(body, [[Math.sin(a) * 0.3, 1.2, Math.cos(a) * 0.3], [Math.sin(a + 0.3) * 0.8, 0.8, Math.cos(a + 0.3) * 0.8], [Math.sin(a + 0.5) * 0.8, 0.15, Math.cos(a + 0.5) * 0.8]], 0.03, pus, 8)
  }
  const pods: Tentacle[] = []
  for (let i = 0; i < 6; i++) {
    const a = (i / 6) * Math.PI * 2 + 0.3
    pods.push(new Tentacle(grp(grp(body, Math.sin(a) * 0.65, 0.2, Math.cos(a) * 0.65, 0, a, 0), 0, 0, 0, Math.PI / 2 - 0.2), { len: 0.8, r0: 0.1, r1: 0.02, bones: 4, tub: 8, rad: 6, ridge: 0.1 }, sinew))
  }
  return view(b, 1, 1.6, (t) => {
    const L = b.L
    const c = (t * 0.8 + L.ph) % 1
    const h = Math.exp(-Math.pow((c - 0.1) * 10, 2)) + 0.6 * Math.exp(-Math.pow((c - 0.28) * 10, 2))
    lumps.forEach((o, i) => {
      const w = Math.sin(t * (1.3 + i * 0.17) + o.ph)
      o.m.scale.set(o.base * (1 + w * 0.08 + h * 0.06), o.base * 0.85 * (1 - w * 0.08 + h * 0.06), o.base * (1 + w * 0.06 + h * 0.06))
      o.m.position.y = o.y + w * 0.05
      o.m.rotation.y = t * 0.15 * (i % 2 ? 1 : -1)
    })
    shell.scale.set(0.95 * (1 + h * 0.05), 0.75 * (1 + h * 0.07), 0.95 * (1 + h * 0.05))
    shell.rotation.y = t * 0.1
    pus.emissiveIntensity = 1.6 + h * 2.5
    memb.opacity = 0.3 + h * 0.15
    pz.forEach((m, i) => scaleBy(m, 1 + 0.2 * Math.sin(t * 3 + i)))
    pods.forEach((T, i) => T.bend(t, 0.2, 0.3, 1.5 + L.move * 3, i * 1.3, -0.05, 0, 0.6))
    body.rotation.y = Math.sin(t * 0.3) * 0.2 + L.walk * 0.05
    body.position.y = Math.abs(Math.sin(L.walk)) * 0.05 * L.move
  })
})

/** 先驅（巢艦的 spawn）：昆蟲翅膜的高瘦人形 */
regModel('mut.harbinger', (def, s) => {
  const b = base(def, s, 5, 0.33)
  const skin = flesh('#4a1a1a', MUT.acc, 0.3, 0.5)
  const shell = SHELL()
  const bone = BONE()
  const pus = liveGlow(tone(MUT.acc, b.v), 2.4 * b.v.gk)
  const wingM = liveLiquid(tone('#e8a85a', b.v), 0.35, 0.4 * b.v.gk)
  const r = buildBiped(b.root, {
    skin,
    limb: shell,
    hipH: 1.1,
    torso: [0.24, 0.32, 0.18],
    pelvis: [0.17, 0.13, 0.14],
    hunch: 0.25,
    shoulderW: 0.28,
    arm: [0.46, 0.5],
    armR: [0.07, 0.055],
    thigh: [0.52, -0.3, 0.3],
    legR: [0.09, 0.06],
    legW: 0.13,
    headR: [0.12, 0.15, 0.14],
    neckLen: 0.14,
  })
  ell(r.head, shell, 0, 0.05, 0.03, 0.12, 0.16, 0.15)
  for (const sd of [-1, 1]) {
    ell(r.head, pus, sd * 0.07, 0.07, 0.11, 0.045, 0.055, 0.04, 8, 6)
    part(r.head, hornGeo(0.3, 0.025, 0.5, 5, 4), bone, sd * 0.05, 0.18, 0, 1, 1, 1, -0.4, 0, sd * 0.3)
  }
  part(r.torso, dome(1, 10, 4, Math.PI * 0.5), shell, 0, 0.32, 0.1, 0.2, 0.3, 0.08, Math.PI / 2)
  // 四片翅膜
  const wings: THREE.Group[] = []
  for (const sd of [-1, 1]) {
    for (let i = 0; i < 2; i++) {
      const g = grp(r.torso, sd * 0.08, 0.5 - i * 0.18, -0.15, 0, 0, 0)
      part(g, sphereGeo(10, 6), wingM, sd * 0.55, 0.15 - i * 0.1, 0, 0.6 - i * 0.12, 0.2, 0.02, 0, 0, sd * (0.35 + i * 0.3))
      part(g, cyl(0.01, 0.01, 1.1 - i * 0.2, 4), bone, sd * 0.5, 0.15 - i * 0.1, 0, 1, 1, 1, 0, 0, sd * (Math.PI / 2 + 0.35 + i * 0.3))
      wings.push(g)
    }
  }
  for (const a of r.arms) claws(grp(a.hand, 0, 0, 0, -Math.PI / 2), 2, 0.35, 0.025, bone, 0.5)
  return view(b, 1, 2.35, (t) => {
    const L = b.L
    animBiped(r, L, t, 0.55, 0.4)
    const flap = Math.sin(t * (L.move > 0.5 ? 30 : 3)) * (L.move > 0.5 ? 0.35 : 0.08)
    wings.forEach((g, i) => (g.rotation.y = (i < 2 ? 1 : -1) * (0.35 + flap)))
    beat(pus, 2.4 * b.v.gk, t, L)
  })
})

// ═════════════ 召喚物 ═════════════

regModel('mut.fleshy', (def, s) => {
  const b = base(def, s, 12, 1)
  const meat = MUSCLE()
  const bone = BONE()
  const pus = liveGlow(tone(MUT.acc, b.v), 2 * b.v.gk)
  const body = grp(b.root, 0, 0.28, 0)
  part(body, lumpGeo(1, 81, 0.25, 12, 8), meat, 0, 0, 0, 0.3, 0.24, 0.34)
  const jaw = grp(body, 0, -0.02, 0.25)
  for (let i = 0; i < 6; i++) spike(jaw, 0.02, 0.08, bone, (i - 2.5) * 0.04, 0.03, 0, Math.PI / 2 - 0.3, 0, 4)
  ell(body, pus, 0, 0.0, 0.27, 0.08, 0.04, 0.03, 6, 4)
  const legs: THREE.Group[] = []
  for (let i = 0; i < 4; i++) {
    const sd = i % 2 ? 1 : -1
    const g = grp(body, sd * 0.2, -0.08, i < 2 ? 0.12 : -0.14, 0, 0, sd * 0.9)
    ell(g, meat, 0, -0.1, 0, 0.04, 0.12, 0.04, 6, 4)
    legs.push(g)
  }
  return view(b, 1, 0.55, (t) => {
    const L = b.L
    legs.forEach((g, i) => (g.rotation.x = Math.sin(L.walk + i * 1.6) * 0.6 * L.move))
    body.position.y = 0.28 + Math.abs(Math.sin(L.walk)) * 0.05 * L.move
    body.scale.set(1 + 0.05 * Math.sin(t * 5), 1 - 0.05 * Math.sin(t * 5), 1)
    jaw.rotation.x = Math.max(0, L.strike) * L.atk * 0.5
    if (L.dead > 0) drop(body, L.dead, 0.28)
  })
})

regModel('mut.spiderling', (def, s) => {
  const b = base(def, s, 12, 2)
  const skin = MUSCLE()
  const pale = PALE()
  const bone = BONE()
  const pus = liveGlow(tone(MUT.acc, b.v), 2.2 * b.v.gk)
  const body = grp(b.root)
  const cep = grp(body, 0, 0.32, 0.08)
  ell(cep, skin, 0, 0, 0, 0.13, 0.09, 0.15)
  ell(cep, pus, 0, 0.05, 0.12, 0.06, 0.02, 0.025, 6, 4)
  const abd = grp(body, 0, 0.38, -0.2)
  ell(abd, pale, 0, 0, 0, 0.18, 0.16, 0.21)
  ell(abd, pus, 0, 0.1, -0.02, 0.1, 0.08, 0.12, 8, 5)
  const legs: SpiderLeg[] = []
  const yaws = [0.55, 0.0, -0.55]
  for (const sd of [-1, 1]) yaws.forEach((y, i) => legs.push(spiderLeg(cep, sd * 0.08, 0, 0.05 - i * 0.06, sd > 0 ? -y : Math.PI + y, 0.32, 0.028, 0.9, 0.26, i === 1 ? bone : skin, undefined, 6, 4)))
  return view(b, 1, 0.65, (t) => {
    const L = b.L
    legs.forEach((l, i) => {
      const [sw, lift] = stepOf(L.walk, ((i % 3) / 3 + (i < 3 ? 0 : 0.5)) % 1)
      animSpider(l, sw, lift, L.move, 0.3)
    })
    abd.scale.setScalar(1 + 0.04 * Math.sin(t * 3 + L.ph))
    cep.rotation.x = -Math.max(0, L.strike) * L.atk * 0.3
    beat(pus, 2.2 * b.v.gk, t, L, 3)
    if (L.dead > 0) {
      for (const l of legs) l.femur.rotation.z = l.up + L.dead
      body.position.y = -L.dead * 0.2
    }
  })
})

regModel('mut.sporeling', (def, s) => {
  const b = base(def, s, 12, 1.25)
  const cap = ROT()
  const stem = PALE()
  const pus = liveGlow(tone(MUT.acc, b.v), 2.6 * b.v.gk)
  const body = grp(b.root, 0, 0.3, 0)
  part(body, lumpGeo(1, 91, 0.15, 12, 8), cap, 0, 0.05, 0, 0.26, 0.22, 0.26)
  pustules(body, 6, 41, (rr) => {
    const a = rr() * Math.PI * 2
    return [Math.sin(a) * 0.18, 0.15 + rr() * 0.1, Math.cos(a) * 0.18, 0.04 + rr() * 0.02]
  }, cap, pus, [0, 0, 0])
  const legs: THREE.Group[] = []
  for (let i = 0; i < 3; i++) {
    const a = (i / 3) * Math.PI * 2
    const g = grp(body, Math.sin(a) * 0.12, -0.12, Math.cos(a) * 0.12, Math.cos(a) * 0.4, 0, -Math.sin(a) * 0.4)
    ell(g, stem, 0, -0.08, 0, 0.04, 0.1, 0.04, 6, 4)
    legs.push(g)
  }
  const sp = spores(b.root, 4, pus, 0.25, 0.4, 1.0, 0.025)
  return view(b, 1, 0.6, (t) => {
    const L = b.L
    legs.forEach((g, i) => (g.rotation.x = Math.sin(L.walk + i * 2.1) * 0.5 * L.move))
    body.position.y = 0.3 + Math.abs(Math.sin(L.walk * 1.5)) * 0.06 * L.move + Math.sin(t * 4) * 0.01
    body.scale.setScalar(1 + 0.06 * Math.sin(t * 4 + L.ph) + Math.max(0, L.strike) * L.atk * 0.15)
    beat(pus, 2.6 * b.v.gk, t, L, 3)
    sp(t, L.dead < 0.5)
    if (L.dead > 0) drop(body, L.dead, 0.3)
  })
})

regModel('mut.worm', (def, s) => {
  const b = base(def, s, 6, 1)
  const skin = flesh('#a85a5a', MUT.acc, 0.22, 0.45)
  const bone = BONE()
  const body = grp(b.root, 0, 0.1, 0.3, -Math.PI / 2 - 0.05)
  const T = new Tentacle(body, { len: 0.9, r0: 0.1, r1: 0.04, bones: 5, tub: 10, rad: 6, ridge: 0.15 }, skin)
  // 頭在前（tentacle 的根部）；口器朝前
  const mouth = grp(b.root, 0, 0.12, 0.32)
  for (let i = 0; i < 5; i++) {
    const a = (i / 5) * Math.PI * 2
    spike(mouth, 0.015, 0.07, bone, Math.cos(a) * 0.06, Math.sin(a) * 0.06, 0, Math.PI / 2, 0, 4)
  }
  return view(b, 1, 0.35, (t) => {
    const L = b.L
    for (let i = 1; i < T.bones.length; i++) {
      T.bones[i].rotation.z = Math.sin(t * (3 + L.move * 6) - i * 1.2 + L.ph) * 0.35
      T.bones[i].rotation.x = Math.max(0, Math.sin(t * 4 - i)) * 0.15 * L.move
    }
    mouth.position.z = 0.32 + Math.max(0, L.strike) * L.atk * 0.15
    if (L.dead > 0) T.squash(1 - L.dead * 0.2)
  })
})

regModel('mut.swarm', (def, s) => {
  const b = base(def, s, 6, 2)
  const shell = SHELL()
  const pus = liveGlow(tone(MUT.acc, b.v), 2.4 * b.v.gk)
  const wing = liveLiquid(tone('#f0c060', b.v), 0.45, 1.2 * b.v.gk)
  const bugs: { g: THREE.Group; w: THREE.Mesh; ph: number; r: number; h: number }[] = []
  const rr = rng(s.i + 3)
  for (let i = 0; i < 7; i++) {
    const g = grp(b.root)
    ell(g, i % 2 ? shell : pus, 0, 0, 0, 0.06, 0.05, 0.11, 6, 4)
    const w = part(g, sphereGeo(6, 4), wing, 0, 0.04, 0.01, 0.17, 0.01, 0.045)
    bugs.push({ g, w, ph: rr() * 6, r: 0.25 + rr() * 0.3, h: 0.5 + rr() * 0.9 })
  }
  return view(b, 1, 1.5, (t) => {
    const L = b.L
    bugs.forEach((o, i) => {
      const a = t * (2 + (i % 3) * 0.6) * (i % 2 ? 1 : -1) + o.ph
      const tight = 1 - L.atk * 0.4
      o.g.position.set(Math.cos(a) * o.r * tight, o.h * (1 - L.dead) + Math.sin(t * 3 + i) * 0.1, Math.sin(a) * o.r * tight + L.move * 0.2 + Math.max(0, L.strike) * L.atk * 0.3)
      o.g.rotation.y = -a + (i % 2 ? Math.PI : 0)
      o.w.scale.x = 0.17 * (0.4 + 0.6 * Math.abs(Math.sin(t * 40 + i)))
    })
    beat(pus, 2.4 * b.v.gk, t, L, 4)
  })
})

regModel('mut.tentacle', (def, s) => {
  const b = base(def, s, 1, 1)
  const meat = MUSCLE()
  const pale = PALE()
  const sinew = SINEW()
  const pus = liveGlow(tone(MUT.acc, b.v), 2.2 * b.v.gk)
  // 從地板裂口竄出的巨大觸手
  part(b.root, lumpGeo(1, 99, 0.2, 14, 6), sinew, 0, 0.05, 0, 0.75, 0.15, 0.75)
  for (let i = 0; i < 6; i++) {
    const a = (i / 6) * Math.PI * 2
    part(b.root, rockGeo(), chitin('#3a424b', '#9fe7ff', 0.6, 0.2), Math.sin(a) * 0.7, 0.05, Math.cos(a) * 0.7, 0.15, 0.06, 0.12, 0.3, a, 0.2)
  }
  const T = new Tentacle(b.root, { len: 2.8, r0: 0.32, r1: 0.05, bones: 8, tub: 20, rad: 9, ridge: 0.06 }, meat)
  // 吸盤（掛在骨頭上，跟著彎）
  T.bones.forEach((bn, i) => {
    if (i < 1 || i > 6) return
    const k = 1 - i / 9
    part(bn, torus(0.07 * k, 0.02 * k, 4, 10), pale, 0, 0.0, 0.3 * k, 1, 1, 1, 0, 0, 0)
    ell(bn, pus, 0, 0.0, 0.3 * k, 0.04 * k, 0.04 * k, 0.02, 6, 4)
  })
  return view(b, 1, 2.8, (t) => {
    const L = b.L
    const st = L.strike * L.atk
    T.bend(t, 0.09, 0.12, 1.3 + L.atk * 2, L.ph, 0.02 + Math.max(0, st) * 0.2 + Math.min(0, st) * -0.12, 0, 0.6)
    beat(pus, 2.2 * b.v.gk, t, L)
    if (L.dead > 0) {
      T.bend(t, 0, 0, 0, 0, 0.3 * L.dead, 0)
      T.squash(1 - L.dead * 0.3)
    }
  })
})

regModel('mut.carrierSack', (def, s) => {
  const b = base(def, s, 2, 1)
  const hover = 1.4
  const fl = grp(b.root, 0, hover, 0)
  const skin = PALE()
  const meat = MUSCLE()
  const sacM = liveLiquid(tone('#e8a84a', b.v), 0.45, 0.6 * b.v.gk)
  const pus = liveGlow(tone(MUT.acc, b.v), 2.6 * b.v.gk)
  part(fl, dome(1, 14, 6, Math.PI * 0.5), skin, 0, -0.05, 0, 0.5, 0.25, 0.5, Math.PI)
  const sac = ell(fl, sacM, 0, 0.15, 0, 0.5, 0.55, 0.5, 14, 10)
  const core = ell(fl, pus, 0, 0.15, 0, 0.22, 0.25, 0.22)
  for (let i = 0; i < 4; i++) part(fl, torus(0.5 - Math.abs(i - 1.5) * 0.1, 0.02, 4, 20), meat, 0, -0.15 + i * 0.18, 0, 1, 1, 1, Math.PI / 2)
  const dang: Tentacle[] = []
  for (let i = 0; i < 6; i++) {
    const a = (i / 6) * Math.PI * 2
    dang.push(new Tentacle(grp(fl, Math.sin(a) * 0.3, -0.2, Math.cos(a) * 0.3, Math.PI), { len: 0.9 + (i % 2) * 0.3, r0: 0.04, r1: 0.008, bones: 5, tub: 10, rad: 5 }, meat))
  }
  return view(b, 1, 2.2, (t) => {
    const L = b.L
    fl.position.y = hover + Math.sin(t * 1.3 + L.ph) * 0.1
    const h = Math.pow(0.5 + 0.5 * Math.sin(t * 2 + L.ph), 2)
    sac.scale.set(0.5 * (1 + h * 0.06), 0.55 * (1 + h * 0.08), 0.5 * (1 + h * 0.06))
    core.position.x = Math.sin(t * 1.7) * 0.08
    dang.forEach((T, i) => T.bend(t, 0.2, 0.2, 1.6, i, -L.move * 0.3, 0))
    beat(pus, 2.6 * b.v.gk, t, L, 2)
    if (L.dead > 0) drop(fl, L.dead, hover)
  })
})

regModel('mut.vectorBug', (def, s) => {
  const b = base(def, s, 2, 1)
  const hover = 1.2
  const fl = grp(b.root, 0, hover, 0)
  const shell = flesh('#6a5a2a', MUT.acc, 0.3, 0.45)
  const pus = liveGlow(tone('#c8f03a', b.v), 2.4 * b.v.gk)
  const wing = liveLiquid('#e8e0b0', 0.35, 0.3)
  ell(fl, shell, 0, 0, 0, 0.08, 0.07, 0.2)
  ell(fl, shell, 0, 0.02, 0.18, 0.06, 0.06, 0.07, 8, 6)
  ell(fl, pus, 0, -0.01, -0.12, 0.05, 0.05, 0.1, 8, 6)
  for (const sd of [-1, 1]) ell(fl, pus, sd * 0.035, 0.04, 0.23, 0.02, 0.02, 0.02, 6, 4)
  const wings = [-1, 1].map((sd) => {
    const g = grp(fl, sd * 0.05, 0.06, 0.03)
    part(g, sphereGeo(8, 4), wing, sd * 0.2, 0, -0.05, 0.22, 0.01, 0.07)
    return g
  })
  return view(b, 1.4, 1.5, (t) => {
    const L = b.L
    fl.position.y = hover + Math.sin(t * 3 + L.ph) * 0.08
    fl.rotation.x = 0.2 * L.move
    wings.forEach((g, i) => (g.rotation.z = (i ? 1 : -1) * Math.sin(t * 45) * 0.7))
    beat(pus, 2.4 * b.v.gk, t, L, 5)
    if (L.dead > 0) drop(fl, L.dead, hover)
  })
})

/** 腐沼的黏液足跡（地上的區域物件）*/
regModel('mut.slime', (_def, s) => {
  const root = new THREE.Group()
  const slime = liveLiquid('#8ab82a', 0.55, 0.45)
  const pool = part(root, lumpGeo(1, s.i % 7, 0.25, 16, 6), slime, 0, 0.01, 0, 0.75, 0.025, 0.65)
  pool.castShadow = false
  const bubbles: THREE.Mesh[] = []
  const bm = liveLiquid('#c8f04a', 0.6, 0.8)
  for (let i = 0; i < 4; i++) bubbles.push(ell(root, bm, 0, 0, 0, 0.04, 0.04, 0.04, 6, 4))
  return {
    root,
    height: 0.2,
    update(t) {
      slime.emissiveIntensity = 0.35 + 0.15 * Math.sin(t * 2 + s.i)
      bubbles.forEach((m, i) => {
        const u = (t * 0.5 + i / 4) % 1
        m.position.set(Math.sin(i * 2.3) * 0.4, 0.02 + u * 0.03, Math.cos(i * 1.7) * 0.35)
        m.scale.setScalar(0.04 * Math.sin(u * Math.PI) + 0.001)
      })
      pool.rotation.y = t * 0.05
    },
  }
})


// ═════════════ 太空層：巢艦（活的有機太空站）與巢艦守衛 ═════════════

regModel('mut.hiveship', (def, s) => {
  const b = base(def, s, 1, 0.5)
  const meat = MUSCLE()
  const skin = PALE()
  const rot = ROT()
  const bone = BONE()
  const pus = liveGlow(tone(MUT.acc, b.v), 2.8 * b.v.gk)
  const red = liveGlow(tone('#ff4a2a', b.v), 2.4 * b.v.gk)
  const R = (def?.radius ?? 4) / 4
  const body = grp(b.root, 0, 0.6, 0)
  const core = grp(body)
  part(core, lumpGeo(1, 201, 0.16, 26, 18), meat, 0, 0, 0, 2.2, 1.3, 2.6)
  part(core, lumpGeo(1, 202, 0.2, 18, 12), rot, 0.9, 0.7, -0.8, 1.0, 0.7, 1.1)
  part(core, lumpGeo(1, 203, 0.2, 18, 12), skin, -1.0, 0.5, 0.6, 0.9, 0.6, 0.9)
  // 外圈骨肋（像太空站的環）
  const ring = grp(body)
  part(ring, torus(3.1, 0.12, 6, 48), bone, 0, 0, 0, 1, 1, 1.15, Math.PI / 2)
  for (let i = 0; i < 10; i++) {
    const a = (i / 10) * Math.PI * 2
    part(ring, hornGeo(2.0, 0.1, 0.9, 8, 5), bone, Math.sin(a) * 3.1, -0.1, Math.cos(a) * 3.55, 1, 1, 1, Math.PI / 2, a + Math.PI, 0)
  }
  // 孢子塔與發光開口
  for (let i = 0; i < 5; i++) {
    const a = (i / 5) * Math.PI * 2 + 0.3
    const g = grp(core, Math.sin(a) * 1.3, 0.9, Math.cos(a) * 1.5, Math.cos(a) * 0.4, 0, -Math.sin(a) * 0.4)
    part(g, cyl(0.18, 0.32, 1.0, 10, true), meat, 0, 0.5, 0)
    part(g, torus(0.2, 0.06, 6, 14), skin, 0, 1.0, 0, 1, 1, 1, Math.PI / 2)
    ell(g, pus, 0, 0.95, 0, 0.17, 0.08, 0.17, 10, 6)
  }
  pustules(core, 14, 207, (rr) => {
    const a = rr() * Math.PI * 2
    const e = rr() * 1.2 - 0.3
    return [Math.sin(a) * Math.cos(e) * 2.1, Math.sin(e) * 1.2, Math.cos(a) * Math.cos(e) * 2.5, 0.18 + rr() * 0.12]
  }, rot, red, [0, 0, 0])
  for (let i = 0; i < 6; i++) {
    const a = (i / 6) * Math.PI * 2
    vein(core, [[Math.sin(a) * 0.6, 1.25, Math.cos(a) * 0.7], [Math.sin(a + 0.4) * 1.9, 0.6, Math.cos(a + 0.4) * 2.2], [Math.sin(a + 0.6) * 2.1, -0.5, Math.cos(a + 0.6) * 2.4]], 0.07, pus, 10)
  }
  // 拖在後方的長觸手
  const tails: Tentacle[] = []
  for (let i = 0; i < 5; i++) {
    const a = (i - 2) * 0.45
    tails.push(new Tentacle(grp(core, Math.sin(a) * 1.2, -0.3, -2.2, -Math.PI / 2 - 0.1, a, 0), { len: 4.5, r0: 0.32, r1: 0.04, bones: 7, tub: 18, rad: 7, ridge: 0.08 }, i % 2 ? meat : rot))
  }
  return view(b, R, 3.2, (t) => {
    const L = b.L
    const c = (t * 0.35 + L.ph) % 1
    const h = Math.exp(-Math.pow((c - 0.15) * 9, 2)) + 0.5 * Math.exp(-Math.pow((c - 0.35) * 9, 2))
    core.scale.set(1 + h * 0.03, 1 + h * 0.05, 1 + h * 0.03)
    ring.rotation.y = t * 0.08
    body.position.y = 0.6 + Math.sin(t * 0.5) * 0.12
    body.rotation.z = Math.sin(t * 0.3) * 0.04
    tails.forEach((T, i) => T.bend(t, 0.08, 0.14, 0.8 + L.move * 1.5, i * 1.3, 0, 0, 0.5))
    pus.emissiveIntensity = 2.8 * b.v.gk * (0.6 + h * 0.8) * (1 - L.dead * 0.8)
    beat(red, 2.4 * b.v.gk, t, L, 0.9, 0.35)
    if (L.dead > 0) {
      core.scale.multiplyScalar(1 - L.dead * 0.25)
      body.rotation.z = L.dead * 0.6
    }
  })
})

regModel('mut.guardian', (def, s) => {
  const b = base(def, s, 2, 0.67)
  const meat = MUSCLE()
  const bone = BONE()
  const eye = liveGlow(tone('#ff5a2a', b.v), 3 * b.v.gk)
  const pus = liveGlow(tone(MUT.acc, b.v), 2.4 * b.v.gk)
  const fl = grp(b.root, 0, 0.6, 0)
  part(fl, lumpGeo(1, 301, 0.15, 16, 12), meat, 0, 0, 0, 0.6, 0.5, 0.7)
  for (let i = 0; i < 6; i++) {
    const a = (i / 6) * Math.PI * 2
    part(fl, hornGeo(0.8, 0.06, 0.7, 6, 4), bone, Math.sin(a) * 0.45, 0, Math.cos(a) * 0.5, 1, 1, 1, Math.PI / 2, a, 0)
  }
  const iris = ell(fl, eye, 0, 0.05, 0.6, 0.22, 0.22, 0.1, 12, 8)
  part(fl, torus(0.24, 0.05, 6, 18), bone, 0, 0.05, 0.58)
  pustules(fl, 6, 303, (rr) => {
    const a = rr() * Math.PI * 2
    return [Math.sin(a) * 0.55, (rr() - 0.5) * 0.6, Math.cos(a) * 0.4 - 0.2, 0.08]
  }, meat, pus)
  const tails: Tentacle[] = []
  for (let i = 0; i < 4; i++) {
    const a = (i / 4) * Math.PI * 2
    tails.push(new Tentacle(grp(fl, Math.sin(a) * 0.3, Math.cos(a) * 0.3, -0.55, -Math.PI / 2), { len: 1.4, r0: 0.08, r1: 0.015, bones: 5, tub: 10, rad: 6 }, meat))
  }
  return view(b, (def?.radius ?? 0.8) / 0.8, 1.4, (t) => {
    const L = b.L
    fl.position.y = 0.6 + Math.sin(t * 1.1 + L.ph) * 0.1
    tails.forEach((T, i) => T.bend(t, 0.2, 0.2, 1.8, i * 1.5, 0, 0))
    scaleBy(iris, 1 + 0.15 * Math.sin(t * 2) + L.atk * 0.2)
    beat(eye, 3 * b.v.gk, t, L, 1.4, 0.3)
    beat(pus, 2.4 * b.v.gk, t, L)
    if (L.dead > 0) drop(fl, L.dead, 0.6)
  })
})
