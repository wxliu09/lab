// 黑鷗海盜（船長、船員）：沿用人類骨架與動畫（human.ts 的 buildHuman／animateRig），外面套上海盜的行頭。
//  船長：黑色長皮大衣（政委版型，收掉大盤帽）＋深紅背心與腰帶、金肩飾、金邊三角帽＋骷髏徽＋紅羽毛、眼罩、腰間彎刀、背上白色海鷗徽。
//  船員：皮飛行夾克（收掉頭盔與傘包）＋交叉子彈帶、紅腰帶、手斧、黑色三角帽（紅帽圈、帽前一隻小海鷗）。
// 收掉職業帽子／背包用的是 suits.ts 同一套（rigBuild → kit.drop → finalize），不改 human.ts。
import * as THREE from 'three'
import { box, cyl, rbox, sphere, torus } from '../batch'
import { Mat } from '../materials'
import { regModel } from './registry'
import { animateRig, buildHuman, rigBuild } from './human'

/** 三角帽的帽簷（圓角三角形擠出）：跟 buffFx 的海盜帽同一個造型，共用一份 */
let triGeo: THREE.BufferGeometry | null = null
function tricornBrim(): THREE.BufferGeometry {
  if (triGeo) return triGeo
  const s = new THREE.Shape()
  const R = 0.25
  for (let i = 0; i < 3; i++) {
    const a = (i / 3) * Math.PI * 2 + Math.PI / 2
    const a2 = a + (Math.PI * 2) / 3
    if (i === 0) s.moveTo(Math.cos(a) * R, Math.sin(a) * R)
    s.quadraticCurveTo(Math.cos((a + a2) / 2) * R * 0.62, Math.sin((a + a2) / 2) * R * 0.62, Math.cos(a2) * R, Math.sin(a2) * R)
  }
  triGeo = new THREE.ExtrudeGeometry(s, { depth: 0.03, bevelEnabled: true, bevelThickness: 0.012, bevelSize: 0.012, bevelSegments: 2, curveSegments: 10 })
  triGeo.rotateX(-Math.PI / 2)
  // 帽簷一角朝前（擠出的形狀尖角在 +y → 轉完是 -z）
  triGeo.rotateY(Math.PI)
  triGeo.userData.shared = true
  return triGeo
}

function add(parent: THREE.Object3D, g: THREE.BufferGeometry, m: THREE.Material, x: number, y: number, z: number, rx = 0, ry = 0, rz = 0, sx = 1, sy = 1, sz = 1): THREE.Mesh {
  const o = new THREE.Mesh(g, m)
  o.position.set(x, y, z)
  o.rotation.set(rx, ry, rz)
  o.scale.set(sx, sy, sz)
  o.castShadow = true
  o.receiveShadow = true
  parent.add(o)
  return o
}

/** 白色的海鷗剪影（兩片往上折的翅膀）：黑鷗海盜的徽記 */
function gull(parent: THREE.Object3D, m: THREE.Material, x: number, y: number, z: number, k: number, ry = 0): void {
  const g = new THREE.Group()
  g.position.set(x, y, z)
  g.rotation.y = ry
  g.scale.setScalar(k)
  for (const sd of [-1, 1]) add(g, box(0.1, 0.018, 0.01), m, sd * 0.045, 0.012, 0, 0, 0, sd * 0.38)
  parent.add(g)
}

/**
 * 人形軀幹的尺寸（human.ts 的胸腔 lathe：半寬約 0.215、深度係數 0.68、y 從 -0.27 到 0.29；頭頂約 0.16）。
 * human.ts 改成依骨頭合併幾何之後，量不到「胸口那一塊」的包圍盒，改用這組常數。
 */
const CW = 0.44
const CD = 0.3
const WAIST = -0.25
/** 腰圍（胸腔 lathe 在腰部的半徑約 0.15，深度係數 0.68）：腰帶貼著腰，不要浮成一圈呼拉圈 */
const WAIST_R = 0.168
const HEAD_TOP = 0.16

regModel('pirate', (_def, s) => {
  const captain = s.d === 'pirate.captain'
  // 底子：船長用長皮大衣（政委的版型）、船員用皮飛行夾克（王牌的版型）；收掉原本的帽子、頭盔、背包、手提道具（換成海盜的行頭）
  const r = buildHuman(captain ? 'commissar' : 'ace', captain ? '#7a1a20' : '#4a3426', s.i % 5)
  const rb = rigBuild(r)
  if (rb) {
    rb.kit.drop('hat', 'helmet', 'pack', 'prop')
    rb.key = `${rb.key}|pirate`
    rb.kit.finalize(rb.key, rb.pc)
  }
  r.root.scale.setScalar(1.18)
  const leather = Mat.cloth('#3a2618', '#ffb46b')
  const brass = Mat.metal('#c8a050', 0.9, false)
  const gullMat = Mat.emissive('#e8f4ff', 1.4)
  const hatMat = Mat.fabric('#16161a')
  const crimson = Mat.cloth('#9a1e24', '#ffc23d')
  const fz = CD / 2
  if (captain) {
    // 深紅背心（大衣前襟敞開處）＋金扣、紅腰帶（垂一截在側邊）、金肩飾、腰間彎刀、背上的白色海鷗
    add(r.torso, rbox(CW * 0.42, 0.42, 0.04, 0.02, 1), crimson, 0, 0.02, fz - 0.005, -0.08)
    for (let i = 0; i < 3; i++) add(r.torso, sphere(0.014, 6, 4), brass, 0, 0.15 - i * 0.09, fz + 0.02 - i * 0.004)
    add(r.torso, torus(WAIST_R, 0.03, 4, 20), crimson, 0, WAIST, 0, Math.PI / 2, 0, 0, 1, 0.78, 1)
    add(r.torso, box(0.07, 0.24, 0.02), crimson, WAIST_R * 0.7, WAIST - 0.13, 0.11, 0, 0, 0.18)
    for (const sd of [-1, 1]) {
      const arm = sd < 0 ? r.armL : r.armR
      add(arm, torus(0.06, 0.012, 4, 12), brass, sd * 0.02, 0.06, 0, 0, 0, sd * 0.3, 1.2, 1, 1.3)
      for (let i = 0; i < 4; i++) add(arm, cyl(0.006, 0.006, 0.07, 4), brass, sd * (0.05 + i * 0.006), 0.0, -0.045 + i * 0.03, 0, 0, sd * 0.2)
    }
    const sword = new THREE.Group()
    sword.position.set(-WAIST_R - 0.03, WAIST - 0.03, 0.04)
    sword.rotation.set(0.5, 0, 0.12)
    add(sword, box(0.02, 0.6, 0.05), Mat.metal('#c8ccd0', 0.95, false), 0, -0.3, 0)
    add(sword, torus(0.05, 0.012, 4, 10, Math.PI), brass, 0, 0.0, 0.0, 0, Math.PI / 2, 0)
    add(sword, cyl(0.016, 0.016, 0.12, 6), leather, 0, 0.07, 0)
    r.torso.add(sword)
    gull(r.torso, gullMat, 0, 0.08, -fz - 0.03, 1.3, Math.PI)
    // 眼罩
    add(r.head, cyl(0.035, 0.035, 0.012, 10), Mat.rubber('#0c0c0e'), -0.045, 0.015, 0.125, Math.PI / 2)
    add(r.head, torus(0.135, 0.008, 3, 20), Mat.rubber('#0c0c0e'), 0, 0.03, 0, Math.PI / 2 - 0.35, 0, 0, 0.9, 1, 1.02)
  } else {
    // 交叉的子彈帶（前後）、紅腰帶、腰間的手斧
    const belt = Mat.rubber('#1c1410')
    for (const sd of [-1, 1]) {
      add(r.torso, box(0.06, 0.62, 0.025), belt, 0, 0.02, fz + 0.03, 0, 0, sd * 0.55)
      add(r.torso, box(0.06, 0.62, 0.025), belt, 0, 0.02, -fz - 0.03, 0, 0, sd * 0.55)
      // 子彈：沿著帶子排、橫躺在帶子上
      for (let i = 0; i < 4; i++) {
        const u = (i - 1.5) * 0.065
        add(r.torso, cyl(0.012, 0.012, 0.05, 6), brass, -Math.sin(sd * 0.55) * u, 0.02 + Math.cos(sd * 0.55) * u, fz + 0.05, 0, 0, sd * 0.55 + Math.PI / 2)
      }
    }
    add(r.torso, rbox(0.07, 0.07, 0.02, 0.01, 1), brass, 0, 0.02, fz + 0.05)
    add(r.torso, torus(WAIST_R, 0.034, 4, 20), crimson, 0, WAIST, 0, Math.PI / 2, 0, 0, 1, 0.78, 1)
    add(r.torso, box(0.06, 0.2, 0.02), crimson, WAIST_R * 0.7, WAIST - 0.12, 0.11, 0, 0, 0.2)
    const axe = new THREE.Group()
    axe.position.set(-WAIST_R - 0.02, WAIST - 0.02, 0.0)
    axe.rotation.set(0.2, 0, 0.15)
    add(axe, cyl(0.014, 0.014, 0.36, 5), leather, 0, -0.12, 0)
    add(axe, box(0.015, 0.09, 0.11), Mat.metal('#a8aeb4', 0.9, false), 0, -0.29, 0.04)
    r.torso.add(axe)
    gull(r.torso, gullMat, 0, 0.1, -fz - 0.06, 1.1, Math.PI)
  }
  // 三角帽：船長大一號、金邊＋骷髏＋紅羽毛；船員黑帽＋帽前一隻小海鷗
  const hat = new THREE.Group()
  hat.position.set(0, HEAD_TOP - 0.05, -0.005)
  hat.rotation.x = -0.08
  hat.scale.setScalar(captain ? 1.12 : 0.98)
  add(hat, cyl(0.11, 0.135, 0.12, 18), hatMat, 0, 0.08, 0)
  add(hat, tricornBrim(), hatMat, 0, 0.02, 0)
  if (captain) {
    add(hat, torus(0.135, 0.012, 4, 22), brass, 0, 0.035, 0, Math.PI / 2)
    const bone = Mat.paint('#ece6d8', 0.6)
    add(hat, sphere(0.026, 10, 8), bone, 0, 0.1, 0.13)
    for (const sd of [-1, 1]) add(hat, box(0.012, 0.075, 0.012), bone, 0, 0.075, 0.135, 0, 0, sd * 0.9)
    add(hat, sphere(1, 8, 5), Mat.cloth('#d83a2a', '#ffc23d'), 0.09, 0.15, -0.06, -0.6, 0, -0.4, 0.025, 0.14, 0.035)
  } else {
    add(hat, torus(0.135, 0.016, 4, 22), crimson, 0, 0.045, 0, Math.PI / 2)
    gull(hat, gullMat, 0, 0.09, 0.13, 0.7)
  }
  r.head.add(hat)
  let deadAt = -1
  return {
    root: r.root,
    height: r.height * 1.18,
    update(t, dt, speed, state) {
      if (state === 4 && deadAt < 0) deadAt = t
      if (state !== 4) deadAt = -1
      animateRig(r, dt, t, speed, state, deadAt >= 0 ? t - deadAt : 0)
    },
  }
})
