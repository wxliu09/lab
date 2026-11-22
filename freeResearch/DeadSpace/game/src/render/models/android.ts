// 仿生人機體與機器管家：工業機殼（琥珀＋白）、面板線、掃描光條（美術聖經 §3.2）。正面朝 local +Z、腳底在 y=0。
import * as THREE from 'three'
import type { UnitDef } from '../../shared/content/types'
import type { SnapEntity } from '../../shared/protocol/messages'
import { box as plainBox, capsule, cyl, rbox, torus } from '../batch'
import { Mat } from '../materials'
import { regModel, type ModelView } from './index'
import { DROID, Life, dome, ell, grp, lathe, liveGlow, metalPart, part, rubberPart, shellPaint, sphereGeo, spikeGeo, stepOf, variant, type Variant } from './creatureKit'

const AMBER = () => shellPaint('#e8a010', '#ffd27a', 0.4, 0.3)
const WHITE = () => shellPaint('#d8dadc', DROID.main, 0.35, 0.28)
const DARK = () => metalPart('#2a2f35', 0.75, DROID.main, 0.18)
const JOINT = () => rubberPart('#1d2024', DROID.main)
const CHROME = () => metalPart('#c8ccd0', 0.95, '#ffffff', 0.2)

interface Base {
  v: Variant
  root: THREE.Group
  L: Life
}

function base(def: UnitDef | undefined, s: SnapEntity, stride = 6, atkRate = 1): Base {
  const v = variant(def, s)
  return { v, root: new THREE.Group(), L: new Life(v.ph, stride, atkRate) }
}

function view(b: Base, scale: number, height: number, update: (t: number, dt: number, speed: number, state: number) => void): ModelView {
  b.root.scale.setScalar(scale * b.v.scale)
  return {
    root: b.root,
    height: height * scale,
    update(t, dt, speed, state) {
      b.L.step(t, dt, speed, state)
      update(t, dt, speed, state)
    },
  }
}

const box = (p: THREE.Object3D, m: THREE.Material, x: number, y: number, z: number, w: number, h: number, d: number, r = 0.04, rx = 0, ry = 0, rz = 0) =>
  part(p, rbox(w, h, d, r, 1), m, x, y, z, 1, 1, 1, rx, ry, rz)

/** 掃描光條：沿 x 來回掃的亮點＋底條 */
function scanBar(parent: THREE.Object3D, w: number, x: number, y: number, z: number, color: string): (t: number, k: number) => void {
  part(parent, rbox(w, 0.035, 0.02, 0.01, 1), Mat.emissive(color, 0.6), x, y, z)
  const dot = part(parent, rbox(w * 0.22, 0.045, 0.025, 0.01, 1), liveGlow(color, 4), x, y, z + 0.005)
  return (t, k) => {
    dot.position.x = x + Math.sin(t * 2.4) * w * 0.38
    dot.visible = k > 0.05
    ;(dot.material as THREE.MeshStandardMaterial).emissiveIntensity = 4 * k
  }
}

/** 機械腿：大腿→膝→小腿（反關節）→腳板 */
function mechLeg(parent: THREE.Object3D, x: number, y: number, l1: number, l2: number, w: number, shell: THREE.Material, joint: THREE.Material, foot: THREE.Material) {
  const hip = grp(parent, x, y, 0)
  part(hip, cyl(w * 0.55, w * 0.55, w * 1.1, 12), joint, 0, 0, 0, 1, 1, 1, 0, 0, Math.PI / 2)
  box(hip, shell, 0, -l1 / 2, 0.02, w, l1, w * 1.1, 0.05)
  const knee = grp(hip, 0, -l1, 0)
  part(knee, cyl(w * 0.45, w * 0.45, w * 0.9, 10), joint, 0, 0, 0, 1, 1, 1, 0, 0, Math.PI / 2)
  box(knee, shell, 0, -l2 / 2, -0.02, w * 0.85, l2, w * 0.95, 0.05)
  const ankle = grp(knee, 0, -l2, 0)
  box(ankle, foot, 0, -0.05, 0.06, w * 1.2, 0.1, w * 2, 0.04)
  return { hip, knee, ankle }
}

// ═════════════ 壁壘型：重裝砲台機體 ═════════════

regModel('android.bulwark', (def, s) => {
  const b = base(def, s, 4.2, 0.33)
  const amber = AMBER()
  const white = WHITE()
  const dark = DARK()
  const joint = JOINT()
  const glowA = liveGlow('#ffb000', 2.6)
  const body = grp(b.root)
  const hips = grp(body, 0, 1.05, 0)
  box(hips, dark, 0, 0, 0, 0.7, 0.22, 0.45, 0.06)
  const legs = [-1, 1].map((sd) => mechLeg(hips, sd * 0.42, -0.02, 0.5, 0.55, 0.22, white, joint, dark))
  // 寬厚的軀幹
  const torso = grp(hips, 0, 0.15, 0)
  box(torso, amber, 0, 0.42, 0, 1.0, 0.68, 0.72, 0.08)
  box(torso, white, 0, 0.46, 0.33, 0.7, 0.44, 0.1, 0.04)
  box(torso, dark, 0, 0.12, 0, 0.8, 0.14, 0.62, 0.04)
  for (const sd of [-1, 1]) box(torso, dark, sd * 0.38, 0.65, 0.37, 0.12, 0.08, 0.03, 0.01)
  // 胸口反應爐
  const core = part(torso, cyl(0.1, 0.1, 0.05, 16), glowA, 0, 0.42, 0.39, 1, 1, 1, Math.PI / 2)
  part(torso, torus(0.12, 0.022, 6, 18), dark, 0, 0.42, 0.39)
  // 感測頭
  const head = grp(torso, 0, 0.82, 0.12)
  box(head, white, 0, 0.1, 0, 0.36, 0.2, 0.3, 0.06)
  box(head, dark, 0, 0.1, 0.13, 0.3, 0.09, 0.06, 0.03)
  const scan = scanBar(head, 0.26, 0, 0.1, 0.165, '#ffd27a')
  part(head, cyl(0.008, 0.008, 0.3, 4), dark, 0.12, 0.33, -0.05)
  // 雙肩稜鏡火箭莢艙（4×2 發射孔）
  const pods: THREE.Group[] = []
  for (const sd of [-1, 1]) {
    const p = grp(torso, sd * 0.68, 0.78, -0.02, -0.15)
    box(p, amber, 0, 0, 0, 0.38, 0.32, 0.6, 0.05)
    box(p, dark, 0, 0, 0.3, 0.32, 0.26, 0.04, 0.02)
    for (let i = 0; i < 4; i++) for (let j = 0; j < 2; j++) part(p, cyl(0.035, 0.035, 0.05, 8), glowA, (i - 1.5) * 0.075, (j - 0.5) * 0.11, 0.32, 1, 1, 1, Math.PI / 2)
    box(p, white, 0, 0.17, 0, 0.3, 0.04, 0.5, 0.02)
    pods.push(p)
  }
  // 手臂：右臂主砲、左臂盾
  const arms: THREE.Group[] = []
  const fores: THREE.Group[] = []
  for (const sd of [-1, 1]) {
    const sh = grp(torso, sd * 0.6, 0.42, 0.05)
    part(sh, sphereGeo(10, 8), joint, 0, 0, 0, 0.15, 0.15, 0.15)
    box(sh, white, sd * 0.04, -0.22, 0, 0.2, 0.42, 0.24, 0.05)
    const fore = grp(sh, sd * 0.04, -0.45, 0, -0.9)
    if (sd > 0) {
      box(fore, dark, 0, -0.2, 0, 0.22, 0.46, 0.24, 0.05)
      part(fore, cyl(0.07, 0.08, 0.6, 12), dark, 0, -0.55, 0)
      part(fore, torus(0.08, 0.02, 6, 14), amber, 0, -0.8, 0, 1, 1, 1, Math.PI / 2)
    } else {
      box(fore, amber, -0.03, -0.25, 0.05, 0.08, 0.6, 0.45, 0.04)
      box(fore, white, -0.08, -0.25, 0.05, 0.02, 0.5, 0.35, 0.01)
    }
    arms.push(sh)
    fores.push(fore)
  }
  const flash = part(fores[1], cyl(0.12, 0.0, 0.35, 8), liveGlow('#ffe0a0', 5), 0, -1.0, 0)
  let fire = 0
  return view(b, 1, 2.45, (t, dt) => {
    const L = b.L
    const k = L.move
    legs.forEach((l, i) => {
      const [sw, lift] = stepOf(L.walk, i * 0.5)
      l.hip.rotation.x = -sw * 0.35 * k - 0.15
      l.knee.rotation.x = 0.3 + lift * 0.5 * k
      l.ankle.rotation.x = -l.hip.rotation.x - l.knee.rotation.x
    })
    hips.position.y = 1.05 - 0.06 + Math.abs(Math.cos(L.walk)) * 0.04 * k
    torso.rotation.y = Math.sin(L.walk) * 0.06 * k
    // 射擊：火箭莢艙後座、砲口閃光
    if (L.atk > 0.5 && L.strike > 0.9 && fire <= 0) fire = 1
    fire = Math.max(0, fire - dt * 4)
    pods.forEach((p) => (p.position.z = -0.02 - fire * 0.08))
    arms[1].rotation.x = -1.35 * L.atk + Math.sin(t * 0.8) * 0.03
    arms[0].rotation.x = -0.5 * L.atk
    flash.visible = fire > 0.6
    const live = 1 - L.dead
    glowA.emissiveIntensity = (2.2 + 0.4 * Math.sin(t * 3) + fire * 2) * live
    core.scale.setScalar(1 + 0.05 * Math.sin(t * 6))
    head.rotation.y = Math.sin(t * 0.6 + L.ph) * 0.4 * (1 - L.atk) * (1 - k)
    scan(t, live)
    if (L.dead > 0) {
      // 膝蓋一軟、往前跪倒
      for (const l of legs) {
        l.hip.rotation.x = -L.dead * 1.2
        l.knee.rotation.x = L.dead * 1.9
      }
      hips.position.y = 1.0 - L.dead * 0.6
      torso.rotation.x = L.dead * 0.45
    } else torso.rotation.x = 0
  })
})

// ═════════════ 疾風型：輕量高速機體 ═════════════

regModel('android.gale', (def, s) => {
  const b = base(def, s, 9, 1.55)
  const white = WHITE()
  const amber = AMBER()
  const dark = DARK()
  const joint = JOINT()
  const glowA = liveGlow('#ffb000', 3)
  const glowW = liveGlow('#ffe8c0', 2.5)
  const body = grp(b.root)
  const hips = grp(body, 0, 1.0, 0)
  box(hips, dark, 0, 0, 0, 0.32, 0.14, 0.2, 0.05)
  const legs = [-1, 1].map((sd) => {
    const l = mechLeg(hips, sd * 0.14, -0.02, 0.48, 0.5, 0.12, white, joint, dark)
    box(l.knee, amber, 0, -0.18, 0.07, 0.08, 0.2, 0.03, 0.01)
    return l
  })
  const torso = grp(hips, 0, 0.1, 0)
  // 倒三角的流線軀幹
  part(torso, lathe([[0.01, 0], [0.16, 0.04], [0.22, 0.3], [0.27, 0.52], [0.18, 0.62], [0.01, 0.64]], 8), white, 0, 0, 0, 1, 1, 0.7)
  box(torso, amber, 0, 0.42, 0.16, 0.16, 0.18, 0.04, 0.02)
  const core = part(torso, cyl(0.05, 0.05, 0.03, 12), glowA, 0, 0.42, 0.19, 1, 1, 1, Math.PI / 2)
  // 頭：窄長、整條護目鏡
  const head = grp(torso, 0, 0.68, 0.02)
  part(head, capsule(0.1, 0.12, 4, 10), white, 0, 0.1, 0, 1, 1, 1.1)
  box(head, dark, 0, 0.12, 0.08, 0.17, 0.06, 0.06, 0.02)
  const scan = scanBar(head, 0.15, 0, 0.12, 0.112, '#ffd27a')
  part(head, spikeGeo(0.03, 0.22, 4), amber, 0, 0.22, -0.06, 1, 1, 1, -1.9)
  // 背後推進鰭
  const fins: THREE.Group[] = []
  for (const sd of [-1, 1]) {
    const f = grp(torso, sd * 0.12, 0.5, -0.14, -0.35, 0, sd * 0.45)
    box(f, amber, 0, 0.25, -0.02, 0.06, 0.55, 0.16, 0.02)
    box(f, glowW, 0, 0.25, -0.11, 0.02, 0.5, 0.02, 0.005)
    part(f, cyl(0.05, 0.035, 0.12, 8), dark, 0, -0.04, 0)
    fins.push(f)
  }
  const jets = [-1, 1].map((sd) => part(torso, spikeGeo(0.045, 0.35, 8), liveGlow('#ffcf6a', 3), sd * 0.12, 0.44, -0.2, 1, 1, 1, Math.PI + 0.35))
  // 手臂：前臂鋸片
  const arms: { sh: THREE.Group; el: THREE.Group; saw: THREE.Mesh }[] = []
  for (const sd of [-1, 1]) {
    const sh = grp(torso, sd * 0.29, 0.52, 0)
    part(sh, sphereGeo(8, 6), joint, 0, 0, 0, 0.075, 0.075, 0.075)
    box(sh, white, 0, -0.16, 0, 0.09, 0.3, 0.1, 0.03)
    const el = grp(sh, 0, -0.32, 0, -0.4)
    box(el, dark, 0, -0.15, 0, 0.08, 0.3, 0.09, 0.03)
    box(el, amber, sd * 0.05, -0.15, 0, 0.02, 0.24, 0.1, 0.01)
    const saw = part(el, cyl(0.13, 0.13, 0.015, 18), CHROME(), sd * 0.07, -0.26, 0.04, 1, 1, 1, 0, 0, Math.PI / 2)
    arms.push({ sh, el, saw })
  }
  let spin = 0
  return view(b, 1, 2.05, (t, dt) => {
    const L = b.L
    const k = L.move
    legs.forEach((l, i) => {
      const [sw, lift] = stepOf(L.walk, i * 0.5)
      l.hip.rotation.x = -sw * 0.7 * k - 0.1
      l.knee.rotation.x = 0.2 + lift * 1.1 * k
      l.ankle.rotation.x = -l.hip.rotation.x - l.knee.rotation.x
    })
    hips.position.y = 0.98 + Math.abs(Math.cos(L.walk)) * 0.06 * k
    torso.rotation.x = 0.3 * k
    torso.rotation.y = Math.sin(L.walk) * 0.12 * k
    const st = L.strike * L.atk
    arms.forEach((a, i) => {
      const hit = i ? st : -st
      a.sh.rotation.x = Math.sin(L.walk + i * Math.PI) * 0.6 * k - Math.abs(hit) * 1.2 - L.atk * 0.5
      a.el.rotation.x = -0.4 - k * 0.6 - L.atk * 0.6
      a.saw.rotation.y += dt * (4 + L.atk * 30)
    })
    // 迴旋閃避（施法）：整台機體自轉
    spin = L.cast > 0.5 ? spin + dt * 14 : spin * (1 - Math.min(1, dt * 6))
    body.rotation.y = spin
    fins.forEach((f, i) => (f.rotation.x = -0.35 - k * 0.35 + Math.sin(t * 3 + i) * 0.03))
    jets.forEach((j) => {
      j.scale.y = 0.4 + k * 1.2 + Math.random() * 0.2
      j.visible = L.dead < 0.3
    })
    glowA.emissiveIntensity = (2.4 + 0.6 * Math.sin(t * 5)) * (1 - L.dead)
    glowW.emissiveIntensity = (1.5 + k * 2) * (1 - L.dead)
    core.scale.setScalar(1 + 0.1 * Math.sin(t * 8))
    scan(t, 1 - L.dead)
    if (L.dead > 0) {
      body.rotation.x = -L.dead * Math.PI * 0.47
      body.position.y = L.dead * 0.12
    } else {
      body.rotation.x = 0
      body.position.y = 0
    }
  })
})

// ═════════════ 企鵝型：可愛但有質感的企鵝機體 ═════════════

regModel('android.pengu', (def, s) => {
  const b = base(def, s, 10, 2)
  const back = shellPaint('#30363e', '#ffd27a', 0.32, 0.16)
  const belly = WHITE()
  const amber = AMBER()
  const dark = DARK()
  const eyeM = liveGlow('#9fe7ff', 2.6)
  const muzzle = liveGlow('#ffe0a0', 5)
  const body = grp(b.root)
  const torso = grp(body, 0, 0.16, 0)
  // 蛋形機身：深色背殼＋白色腹板
  const prof: [number, number][] = [
    [0.01, 0],
    [0.3, 0.04],
    [0.42, 0.25],
    [0.44, 0.5],
    [0.38, 0.78],
    [0.28, 0.96],
    [0.12, 1.06],
    [0.01, 1.08],
  ]
  part(torso, lathe(prof, 18), back)
  part(torso, dome(1, 14, 7, Math.PI * 0.5), belly, 0, 0.45, 0.12, 0.36, 0.52, 0.34, Math.PI / 2)
  // 腹部的面板線、警示標籤、序號燈
  box(torso, amber, 0, 0.2, 0.43, 0.22, 0.04, 0.02, 0.01)
  for (let i = 0; i < 3; i++) part(torso, cyl(0.018, 0.018, 0.02, 8), liveGlow(i === 0 ? '#ffb000' : '#5cf2a5', 2), -0.06 + i * 0.06, 0.6, 0.455, 1, 1, 1, Math.PI / 2)
  // 頭部：兩顆大鏡頭眼、琥珀色嘴喙感測器
  const head = grp(torso, 0, 0.82, 0.05)
  const eyes: THREE.Mesh[] = []
  for (const sd of [-1, 1]) {
    part(head, cyl(0.085, 0.085, 0.06, 18), dark, sd * 0.13, 0.04, 0.27, 1, 1, 1, Math.PI / 2 - 0.15)
    eyes.push(part(head, cyl(0.06, 0.06, 0.02, 18), eyeM, sd * 0.13, 0.045, 0.305, 1, 1, 1, Math.PI / 2 - 0.15))
    part(head, torus(0.085, 0.012, 6, 18), amber, sd * 0.13, 0.04, 0.3, 1, 1, 1, -0.15)
  }
  const beak = grp(head, 0, -0.06, 0.3)
  part(beak, spikeGeo(0.07, 0.2, 8), amber, 0, 0, 0, 1.2, 1, 0.8, Math.PI / 2)
  part(beak, cyl(0.02, 0.02, 0.02, 8), liveGlow('#ff4a3a', 3), 0, 0.03, 0.12, 1, 1, 1, Math.PI / 2)
  part(head, cyl(0.008, 0.008, 0.22, 4), dark, 0.08, 0.3, -0.05, 1, 1, 1, 0, 0, -0.2)
  ell(head, liveGlow('#ffb000', 3), 0.1, 0.42, -0.05, 0.025, 0.025, 0.025, 6, 4)
  // 鰭狀手臂＋小型多管機槍
  const fl: { g: THREE.Group; barrel: THREE.Group; flash: THREE.Mesh }[] = []
  for (const sd of [-1, 1]) {
    const g = grp(torso, sd * 0.42, 0.62, 0, 0, 0, sd * 0.25)
    part(g, capsule(0.07, 0.4, 4, 10), back, 0, -0.22, 0, 1, 1, 0.45)
    box(g, amber, 0, -0.22, 0.035, 0.08, 0.3, 0.01, 0.005)
    const barrel = grp(g, 0, -0.42, 0.04, Math.PI / 2)
    for (let i = 0; i < 4; i++) {
      const a = (i / 4) * Math.PI * 2
      part(barrel, cyl(0.012, 0.012, 0.24, 6), dark, Math.cos(a) * 0.025, 0.1, Math.sin(a) * 0.025)
    }
    part(barrel, cyl(0.04, 0.04, 0.06, 10), amber, 0, -0.02, 0)
    const flash = part(barrel, spikeGeo(0.05, 0.16, 6), muzzle, 0, 0.22, 0)
    fl.push({ g, barrel, flash })
  }
  // 腳掌
  const feet = [-1, 1].map((sd) => {
    const f = grp(body, sd * 0.17, 0.08, 0.05)
    part(f, rbox(0.18, 0.08, 0.3, 0.03, 2), amber, 0, -0.03, 0.06)
    for (let i = 0; i < 3; i++) part(f, rbox(0.05, 0.05, 0.08, 0.02, 1), amber, (i - 1) * 0.06, -0.04, 0.22)
    part(f, cyl(0.05, 0.05, 0.12, 8), dark, 0, 0.04, 0)
    return f
  })
  // 背上的小噴射背包
  box(torso, dark, 0, 0.55, -0.42, 0.3, 0.32, 0.1, 0.04)
  const jet = part(torso, spikeGeo(0.06, 0.2, 8), liveGlow('#ffcf6a', 3), 0, 0.36, -0.44, 1, 1, 1, Math.PI)
  return view(b, 1.15, 1.3, (t, dt) => {
    const L = b.L
    const k = L.move
    // 搖搖擺擺的企鵝步
    const w = Math.sin(L.walk)
    torso.rotation.z = w * 0.18 * k + Math.sin(t * 1.2 + L.ph) * 0.02 * (1 - k)
    torso.position.y = 0.16 + Math.abs(w) * 0.04 * k
    feet.forEach((f, i) => {
      const [sw, lift] = stepOf(L.walk, i * 0.5)
      f.position.z = 0.05 + sw * 0.12 * k
      f.position.y = 0.08 + lift * 0.06 * k
    })
    head.rotation.y = Math.sin(t * 0.7 + L.ph) * 0.3 * (1 - L.atk)
    head.rotation.z = Math.sin(t * 1.9) * 0.05
    // 射擊：雙鰭前舉、槍管旋轉、閃光
    fl.forEach((f, i) => {
      const sd = i ? 1 : -1
      f.g.rotation.x = -1.5 * L.atk + Math.sin(L.walk + i * Math.PI) * 0.3 * k
      f.g.rotation.z = sd * (0.25 + (1 - L.atk) * 0.1 + Math.sin(t * 2 + i) * 0.04)
      f.barrel.rotation.y += dt * L.atk * 40
      f.flash.visible = L.atk > 0.6 && L.dead === 0 && Math.random() < 0.6
    })
    const blink = Math.sin(t * 0.9 + L.ph) > 0.985 ? 0.1 : 1
    eyes.forEach((e) => (e.scale.y = blink))
    eyeM.emissiveIntensity = 2.6 * (1 - L.dead * 0.9)
    jet.visible = k > 0.5
    jet.scale.y = 0.6 + Math.random() * 0.4
    if (L.dead > 0) {
      body.rotation.x = -L.dead * 1.45
      body.position.y = L.dead * 0.3
      body.position.z = -L.dead * 0.25
    } else {
      body.rotation.x = 0
      body.position.y = 0
      body.position.z = 0
    }
  })
})

// ═════════════ 機器管家：漂浮的小型管家 ═════════════

regModel('butler', (_def, s) => {
  const root = new THREE.Group()
  const ph = (s.i * 1.618) % 6.28
  const white = WHITE()
  const amber = AMBER()
  const dark = DARK()
  const eyeM = liveGlow('#9fe7ff', 2.4)
  const ring = liveGlow('#ffb000', 2.6)
  const hover = 0.45
  const fl = grp(root, 0, hover, 0)
  // 蛋形機身＋燕尾式背板
  part(fl, lathe([[0.01, 0], [0.2, 0.05], [0.27, 0.22], [0.26, 0.42], [0.18, 0.56], [0.01, 0.6]], 16), white)
  box(fl, dark, 0, 0.25, -0.22, 0.28, 0.3, 0.06, 0.03)
  for (const sd of [-1, 1]) part(fl, spikeGeo(0.06, 0.25, 4), dark, sd * 0.08, 0.12, -0.24, 1, 1, 0.3, Math.PI, 0, sd * 0.2)
  // 領結
  for (const sd of [-1, 1]) part(fl, spikeGeo(0.05, 0.08, 4), dark, sd * 0.045, 0.44, 0.22, 1, 1, 0.6, 0, 0, sd * Math.PI / 2)
  ell(fl, amber, 0, 0.44, 0.225, 0.022, 0.022, 0.02, 6, 4)
  // 頭：圓頂＋單眼
  const head = grp(fl, 0, 0.6, 0)
  part(head, dome(1, 14, 6, Math.PI * 0.5), white, 0, -0.02, 0, 0.19, 0.17, 0.19)
  part(head, torus(0.19, 0.015, 6, 20), amber, 0, -0.02, 0, 1, 1, 1, Math.PI / 2)
  part(head, cyl(0.06, 0.06, 0.03, 14), dark, 0, 0.06, 0.16, 1, 1, 1, Math.PI / 2 - 0.3)
  const eye = part(head, cyl(0.04, 0.04, 0.02, 14), eyeM, 0, 0.065, 0.175, 1, 1, 1, Math.PI / 2 - 0.3)
  part(head, cyl(0.006, 0.006, 0.14, 4), dark, 0, 0.2, -0.03)
  ell(head, ring, 0, 0.28, -0.03, 0.02, 0.02, 0.02, 6, 4)
  // 托盤手臂（端著一杯飲料）
  const arm = grp(fl, 0.25, 0.32, 0.05)
  part(arm, sphereGeo(8, 6), dark, 0, 0, 0, 0.045, 0.045, 0.045)
  part(arm, cyl(0.02, 0.02, 0.22, 6), dark, 0, 0, 0.1, 1, 1, 1, Math.PI / 2)
  const tray = grp(arm, 0, 0.02, 0.22)
  part(tray, cyl(0.12, 0.12, 0.015, 18), CHROME())
  part(tray, cyl(0.03, 0.025, 0.09, 10), Mat.glass('#cfefff', 0.35), 0.03, 0.05, 0)
  part(tray, cyl(0.026, 0.022, 0.06, 10), Mat.liquid('#ffb46b'), 0.03, 0.04, 0)
  const armL = grp(fl, -0.25, 0.32, 0.05, 0.3)
  part(armL, cyl(0.018, 0.018, 0.2, 6), dark, 0, -0.1, 0)
  // 懸浮環與推進光
  const hr = part(fl, torus(0.2, 0.025, 6, 24), ring, 0, -0.03, 0, 1, 1, 1, Math.PI / 2)
  const thrust = part(fl, spikeGeo(0.14, 0.3, 12), Mat.liquid('#ffcf6a'), 0, -0.04, 0, 1, 1, 1, Math.PI)
  thrust.castShadow = false
  const L = new Life(ph, 3, 1)
  return {
    root,
    height: 1.25,
    update(t, dt, speed, state) {
      L.step(t, dt, speed, state)
      fl.position.y = hover + Math.sin(t * 2.2 + ph) * 0.05
      fl.rotation.x = L.move * 0.15
      fl.rotation.z = Math.sin(t * 1.3 + ph) * 0.04
      head.rotation.y = Math.sin(t * 0.8 + ph) * 0.5
      tray.rotation.x = -fl.rotation.x
      ring.emissiveIntensity = 2 + 0.6 * Math.sin(t * 6)
      hr.rotation.z = t * 2
      thrust.scale.set(1, 0.7 + 0.3 * Math.sin(t * 20) + L.move * 0.4, 1)
      eye.scale.y = Math.sin(t * 0.7 + ph) > 0.98 ? 0.1 : 1
    },
  }
})

// ═════════════ 綏靖機器人：站方的重裝保全機 ═════════════
// 跟仿生人同一套機殼語言（圓角面板、橡膠關節、掃描光條），但換成公司保全的塗裝：白殼、槍鐵灰、
// 冰藍色的掃描面罩、頭頂紅藍交替的警示燈（開火時閃得更快）；左臂防暴盾（黃黑警示斜紋）、右臂重型步槍、背上電池組。

/** 平板零件（直角方塊，12 個三角形）：細條、警示斜紋、面板這些小東西不需要圓角 */
const flat = (p: THREE.Object3D, m: THREE.Material, x: number, y: number, z: number, w: number, h: number, d: number, rx = 0, ry = 0, rz = 0) =>
  part(p, plainBox(w, h, d), m, x, y, z, 1, 1, 1, rx, ry, rz)

regModel('pacifier', (def, s) => {
  const b = base(def, s, 4, 0.66)
  const shell = shellPaint('#dfe3e6', '#9fe7ff', 0.38, 0.28)
  const navy = shellPaint('#2b394c', '#9fe7ff', 0.42, 0.25)
  const dark = metalPart('#262b31', 0.75, '#9fe7ff', 0.15)
  const joint = rubberPart('#1d2024', '#9fe7ff')
  const hazard = Mat.paint('#ffc23d', 0.5)
  const cyan = liveGlow('#9fe7ff', 2.4)
  const red = liveGlow('#ff3b3b', 3)
  const blue = liveGlow('#3b7bff', 3)
  const body = grp(b.root)
  const hips = grp(body, 0, 1.1, 0)
  box(hips, dark, 0, 0, 0, 0.62, 0.22, 0.42, 0.06)
  flat(hips, navy, 0, -0.02, 0.2, 0.4, 0.14, 0.06)
  const legs = [-1, 1].map((sd) => {
    const l = mechLeg(hips, sd * 0.36, -0.04, 0.52, 0.56, 0.2, shell, joint, dark)
    flat(l.knee, navy, 0, -0.2, 0.11, 0.16, 0.24, 0.04)
    flat(l.ankle, dark, 0, -0.04, -0.12, 0.26, 0.08, 0.16)
    return l
  })
  // 軀幹：寬胸甲＋胸前的警示斜紋＋序號燈
  const torso = grp(hips, 0, 0.14, 0)
  box(torso, shell, 0, 0.42, 0, 0.94, 0.66, 0.62, 0.1)
  flat(torso, navy, 0, 0.42, 0.3, 0.7, 0.46, 0.06)
  for (let i = 0; i < 5; i++) flat(torso, i % 2 ? dark : hazard, -0.24 + i * 0.12, 0.22, 0.335, 0.1, 0.06, 0.02, 0, 0, 0.5)
  flat(torso, dark, 0, 0.12, 0, 0.78, 0.14, 0.56)
  for (let i = 0; i < 3; i++) part(torso, cyl(0.022, 0.022, 0.02, 8), i === 1 ? cyan : Mat.emissive('#5cf2a5', 1.6), 0.2 + i * 0.05, 0.55, 0.34, 1, 1, 1, Math.PI / 2)
  // 背上的電池組＋發光環
  box(torso, dark, 0, 0.48, -0.4, 0.5, 0.48, 0.2, 0.05)
  part(torso, torus(0.12, 0.025, 6, 18), cyan, 0, 0.5, -0.51)
  // 頭：低矮的感測頭盔、冰藍面罩、頭頂警示燈條
  const head = grp(torso, 0, 0.8, 0.08)
  box(head, shell, 0, 0.1, 0, 0.4, 0.2, 0.36, 0.08)
  flat(head, dark, 0, 0.09, 0.16, 0.34, 0.09, 0.06)
  const scan = scanBar(head, 0.3, 0, 0.09, 0.195, '#9fe7ff')
  flat(head, dark, 0, 0.23, -0.02, 0.3, 0.05, 0.12)
  const lr = flat(head, red, -0.08, 0.27, -0.02, 0.12, 0.06, 0.1)
  const lb = flat(head, blue, 0.08, 0.27, -0.02, 0.12, 0.06, 0.1)
  part(head, cyl(0.008, 0.008, 0.28, 4), dark, -0.16, 0.3, -0.12)
  // 手臂：左臂防暴盾、右臂重型步槍
  const arms: THREE.Group[] = []
  const fores: THREE.Group[] = []
  for (const sd of [-1, 1]) {
    const sh = grp(torso, sd * 0.56, 0.6, 0.02)
    part(sh, sphereGeo(10, 8), joint, 0, 0, 0, 0.14, 0.14, 0.14)
    box(sh, shell, sd * 0.06, 0.06, 0, 0.26, 0.16, 0.3, 0.06)
    box(sh, navy, sd * 0.03, -0.22, 0, 0.18, 0.38, 0.2, 0.04)
    const fore = grp(sh, sd * 0.03, -0.42, 0, -0.5)
    box(fore, shell, 0, -0.2, 0, 0.2, 0.42, 0.22, 0.05)
    if (sd < 0) {
      const shield = grp(fore, -0.12, -0.25, 0.12, 0, 0.25, 0)
      box(shield, navy, 0, 0, 0, 0.06, 0.9, 0.56, 0.05)
      flat(shield, shell, -0.035, 0, 0, 0.02, 0.8, 0.48)
      for (let i = 0; i < 4; i++) flat(shield, i % 2 ? dark : hazard, -0.05, -0.32, -0.18 + i * 0.12, 0.02, 0.1, 0.11, 0.6, 0, 0)
      flat(shield, Mat.glass('#9fe7ff', 0.45), -0.05, 0.22, 0, 0.02, 0.12, 0.3)
    } else {
      // 步槍：機匣、彈匣、長槍管、槍口
      box(fore, dark, 0, -0.45, 0.06, 0.16, 0.2, 0.5, 0.03)
      flat(fore, hazard, 0, -0.56, -0.02, 0.1, 0.14, 0.1)
      part(fore, cyl(0.04, 0.045, 0.62, 10), dark, 0, -0.45, 0.6, 1, 1, 1, Math.PI / 2)
      part(fore, torus(0.05, 0.015, 6, 12), shell, 0, -0.45, 0.88)
    }
    arms.push(sh)
    fores.push(fore)
  }
  const flash = part(fores[1], spikeGeo(0.09, 0.34, 8), liveGlow('#cfe8ff', 5), 0, -0.45, 0.92, 1, 1, 1, Math.PI / 2)
  let fire = 0
  return view(b, 1, 2.3, (t, dt) => {
    const L = b.L
    const k = L.move
    legs.forEach((l, i) => {
      const [sw, lift] = stepOf(L.walk, i * 0.5)
      l.hip.rotation.x = -sw * 0.4 * k - 0.12
      l.knee.rotation.x = 0.25 + lift * 0.55 * k
      l.ankle.rotation.x = -l.hip.rotation.x - l.knee.rotation.x
    })
    hips.position.y = 1.1 - 0.05 + Math.abs(Math.cos(L.walk)) * 0.04 * k
    torso.rotation.y = Math.sin(L.walk) * 0.05 * k
    torso.rotation.x = L.atk * 0.08
    // 開火：舉槍瞄準、盾牌擋在前面、槍口閃光＋後座
    if (L.atk > 0.5 && L.strike > 0.9 && fire <= 0) fire = 1
    fire = Math.max(0, fire - dt * 5)
    arms[1].rotation.x = -1.1 * L.atk + Math.sin(L.walk + Math.PI) * 0.2 * k - fire * 0.08
    fores[1].rotation.x = -0.5 + L.atk * 0.5
    arms[0].rotation.x = -0.6 * L.atk + Math.sin(L.walk) * 0.15 * k
    arms[0].rotation.y = L.atk * 0.35
    flash.visible = fire > 0.55
    head.rotation.y = Math.sin(t * 0.5 + L.ph) * 0.5 * (1 - L.atk) * (1 - k)
    // 警示燈：平時慢慢交替，戰鬥中快閃
    const live = 1 - L.dead
    const f = L.atk > 0.3 || L.cast > 0.3 ? 9 : 2.2
    const ph = Math.sin(t * f) > 0
    red.emissiveIntensity = (ph ? 4 : 0.4) * live
    blue.emissiveIntensity = (ph ? 0.4 : 4) * live
    lr.scale.y = ph ? 1.15 : 1
    lb.scale.y = ph ? 1 : 1.15
    cyan.emissiveIntensity = (2 + 0.4 * Math.sin(t * 3)) * live
    scan(t, live)
    if (L.dead > 0) {
      for (const l of legs) {
        l.hip.rotation.x = -L.dead * 1.1
        l.knee.rotation.x = L.dead * 1.8
      }
      hips.position.y = 1.05 - L.dead * 0.58
      torso.rotation.x = L.dead * 0.5
      arms[1].rotation.x = L.dead * 0.3
    }
  })
})

// ═════════════ 防禦無人機：四旋翼巡邏機 ═════════════
// 白殼機身、四支機臂末端的導管風扇（槳葉會轉）、前方冰藍色感測眼、腹下雙管機槍、兩側 2×2 火箭莢艙。
// 懸停時上下浮動、往移動方向前傾；開火時機槍後座＋閃光；施放火箭時莢艙發亮；被擊落時掉到地上、槳葉停轉。

regModel('defenseDrone', (def, s) => {
  const b = base(def, s, 3, 0.83)
  const shell = shellPaint('#dfe3e6', '#9fe7ff', 0.38, 0.28)
  const navy = shellPaint('#2b394c', '#9fe7ff', 0.42, 0.25)
  const dark = metalPart('#262b31', 0.75, '#9fe7ff', 0.15)
  const eyeM = liveGlow('#9fe7ff', 3)
  const pod = liveGlow('#ffb000', 1.2)
  const HOV = 1.25
  const fl = grp(b.root, 0, HOV, 0)
  // 機身
  box(fl, shell, 0, 0, 0, 0.46, 0.18, 0.6, 0.07)
  flat(fl, navy, 0, 0.1, -0.04, 0.32, 0.06, 0.4)
  flat(fl, dark, 0, -0.1, 0, 0.36, 0.06, 0.48)
  for (let i = 0; i < 3; i++) flat(fl, i % 2 ? dark : Mat.paint('#ffc23d', 0.5), -0.08 + i * 0.08, 0.135, 0.18, 0.07, 0.01, 0.05)
  // 感測眼
  part(fl, cyl(0.075, 0.075, 0.05, 16), dark, 0, 0.0, 0.31, 1, 1, 1, Math.PI / 2)
  const eye = part(fl, cyl(0.05, 0.05, 0.02, 16), eyeM, 0, 0.0, 0.34, 1, 1, 1, Math.PI / 2)
  part(fl, torus(0.075, 0.012, 6, 16), shell, 0, 0, 0.335)
  // 四支機臂＋導管風扇
  const rotors: THREE.Group[] = []
  const navs: THREE.MeshStandardMaterial[] = []
  for (let i = 0; i < 4; i++) {
    const sx = i % 2 ? 1 : -1
    const sz = i < 2 ? 1 : -1
    const x = sx * 0.46
    const z = sz * 0.38
    flat(fl, dark, sx * 0.25, 0.02, sz * 0.2, 0.36, 0.05, 0.06, 0, -sx * sz * 0.68, 0)
    part(fl, torus(0.17, 0.028, 5, 16), shell, x, 0.04, z, 1, 1, 1, Math.PI / 2)
    part(fl, cyl(0.03, 0.03, 0.08, 8), dark, x, 0.02, z)
    const rot = grp(fl, x, 0.05, z)
    for (const a of [0, Math.PI / 2]) flat(rot, Mat.metal('#9aa2aa', 0.6, false), 0, 0, 0, 0.3, 0.008, 0.04, 0, a, 0.1)
    rotors.push(rot)
    const nm = liveGlow(sz > 0 ? '#5cf2a5' : '#ff3b3b', 3)
    part(fl, sphereGeo(6, 4), nm, x + sx * 0.18, 0.04, z, 0.022, 0.022, 0.022)
    navs.push(nm)
  }
  // 腹下雙管機槍
  const gun = grp(fl, 0, -0.16, 0.12)
  flat(gun, dark, 0, 0, 0, 0.12, 0.08, 0.16)
  for (const sd of [-1, 1]) part(gun, cyl(0.016, 0.016, 0.3, 6), dark, sd * 0.03, 0, 0.2, 1, 1, 1, Math.PI / 2)
  const flash = part(gun, spikeGeo(0.06, 0.2, 6), liveGlow('#cfe8ff', 5), 0, 0, 0.42, 1, 1, 1, Math.PI / 2)
  // 兩側火箭莢艙
  for (const sd of [-1, 1]) {
    const p = grp(fl, sd * 0.28, -0.06, 0.0)
    box(p, navy, 0, 0, 0, 0.12, 0.12, 0.3, 0.03)
    for (let i = 0; i < 4; i++) part(p, cyl(0.022, 0.022, 0.02, 8), pod, ((i % 2) - 0.5) * 0.055, (Math.floor(i / 2) - 0.5) * 0.055, 0.155, 1, 1, 1, Math.PI / 2)
  }
  let fire = 0
  let spin = 0
  return view(b, 1, 1.6, (t, dt) => {
    const L = b.L
    const k = L.move
    const live = 1 - L.dead
    spin += dt * (30 + k * 12) * live
    rotors.forEach((r, i) => (r.rotation.y = spin * (i % 2 ? 1 : -1)))
    fl.position.y = HOV + Math.sin(t * 2.1 + L.ph) * 0.07 * live - L.dead * (HOV - 0.18)
    fl.rotation.x = k * 0.22 * live + L.dead * 0.35
    fl.rotation.z = Math.sin(t * 1.4 + L.ph) * 0.05 * live + L.dead * 0.25
    if (L.atk > 0.5 && L.strike > 0.9 && fire <= 0) fire = 1
    fire = Math.max(0, fire - dt * 6)
    gun.position.z = 0.12 - fire * 0.04
    gun.rotation.x = -L.atk * 0.15
    flash.visible = fire > 0.5 && live > 0.5
    eyeM.emissiveIntensity = (L.atk > 0.3 ? 4.5 : 3) * live * (Math.sin(t * 0.7 + L.ph) > 0.98 ? 0.2 : 1)
    eye.scale.setScalar(1 + L.atk * 0.15)
    pod.emissiveIntensity = (1 + L.cast * 4 + Math.max(0, Math.sin(t * 3)) * 0.4) * live
    navs.forEach((n, i) => (n.emissiveIntensity = (Math.sin(t * 4 + i * 1.6) > 0.2 ? 3.5 : 0.3) * live))
  })
})
