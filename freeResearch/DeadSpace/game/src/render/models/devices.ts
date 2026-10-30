// 裝置與區域物件模型（玩家放置的裝置、技能召喚的地面物件）：
// 監視器、動作感應器、哨戟、力場產生器、醫療再生器、熱融炸彈、實驗傳送裝置、GIT 解析器、奇點、蟲餌、
// 雷暴、電漿球、火海、污染區、酸池、毒雲、物質汲取器、遙控雷、螢火蟲偵察機、能量庫、金屬塊
// 每個都有材質層次（PBR 金屬／烤漆＋自發光燈條＋additive 光暈），範圍型物件畫出實際作用半徑
import * as THREE from 'three'
import { regModel, MODELS, type ModelView, type ModelBuilder } from './index'
import { box, cyl, rbox, sphere, torus } from '../batch'
import { Mat, withFog } from '../materials'
import { screenTex } from '../tex'
import { Fx, GEO } from '../fx'
import { fxTex } from '../fx/tex'
import { shieldMat } from '../fx/kit'
import { fleshMat } from '../fx/mats'
import { sfx } from '../../audio/sfx'

// ───────── 小工具 ─────────

const tmp = new THREE.Vector3()

function part(parent: THREE.Object3D, geo: THREE.BufferGeometry, mat: THREE.Material, x = 0, y = 0, z = 0, rx = 0, ry = 0, rz = 0): THREE.Mesh {
  const m = new THREE.Mesh(geo, mat)
  m.position.set(x, y, z)
  m.rotation.set(rx, ry, rz)
  m.castShadow = !(mat as THREE.MeshBasicMaterial).transparent
  m.receiveShadow = true
  parent.add(m)
  return m
}

/** 每個實例自己的自發光材質（可獨立閃爍）*/
function liveEmi(color: string, k = 2): THREE.MeshStandardMaterial {
  return withFog(new THREE.MeshStandardMaterial({ color: '#050505', emissive: color, emissiveIntensity: k, roughness: 0.35, metalness: 0.1 }))
}

/** additive 平面／形狀材質（每實例一份，方便調 opacity）*/
function glowMat(color: string, k = 2, map: THREE.Texture | null = fxTex('soft'), opacity = 1, side: THREE.Side = THREE.FrontSide): THREE.MeshBasicMaterial {
  return new THREE.MeshBasicMaterial({ color: new THREE.Color(color).multiplyScalar(k), map, transparent: true, opacity, depthWrite: false, blending: THREE.AdditiveBlending, side })
}

function flatDisc(parent: THREE.Object3D, r: number, mat: THREE.Material, y = 0.03): THREE.Mesh {
  const m = new THREE.Mesh(GEO.flat, mat)
  m.scale.setScalar(r)
  m.position.y = y
  m.renderOrder = 3
  m.castShadow = false
  m.raycast = () => {}
  parent.add(m)
  return m
}

function sprite(parent: THREE.Object3D, tex: 'soft' | 'star' | 'smoke', color: string, k: number, size: number, y: number, add = true, opacity = 1): THREE.Sprite {
  const s = new THREE.Sprite(new THREE.SpriteMaterial({ map: fxTex(tex), color: new THREE.Color(color).multiplyScalar(k), transparent: true, opacity, depthWrite: false, blending: add ? THREE.AdditiveBlending : THREE.NormalBlending }))
  s.scale.setScalar(size)
  s.position.y = y
  s.raycast = () => {}
  parent.add(s)
  return s
}

/** 模型根節點的世界座標 → sim 座標 */
function simPos(root: THREE.Object3D): { x: number; y: number } {
  root.getWorldPosition(tmp)
  return { x: tmp.x, y: -tmp.z }
}

function fx(): Fx | null {
  return Fx.active
}

/** 已有同名模型（其他人的檔案先登錄）就不覆蓋 */
function reg(id: string, b: ModelBuilder): void {
  if (!MODELS.has(id)) regModel(id, b)
}

const steel = () => Mat.metal('#5a626b', 0.75)
const dark = () => Mat.metal('#2b3138', 0.7)
const paintW = () => Mat.paint('#d8dde0', 0.45)
const rubber = () => Mat.rubber('#1d2024')

function tripod(root: THREE.Object3D, h: number, spread: number, mat: THREE.Material): void {
  for (let i = 0; i < 3; i++) {
    const a = (i / 3) * Math.PI * 2 + 0.5
    const leg = part(root, cyl(0.018, 0.022, h * 1.08, 6), mat, Math.cos(a) * spread * 0.5, h * 0.5, Math.sin(a) * spread * 0.5)
    leg.rotation.z = Math.cos(a) * 0.38
    leg.rotation.x = -Math.sin(a) * 0.38
    part(root, cyl(0.03, 0.035, 0.02, 8), rubber(), Math.cos(a) * spread, 0.01, Math.sin(a) * spread)
  }
}

// ───────── 監視器 ─────────

reg('camera', (_def, s) => {
  const root = new THREE.Group()
  tripod(root, 0.62, 0.3, steel())
  const head = new THREE.Group()
  head.position.y = 0.68
  root.add(head)
  part(head, cyl(0.05, 0.06, 0.06, 12), dark(), 0, -0.02, 0)
  const housing = part(head, rbox(0.14, 0.12, 0.26, 0.03), paintW(), 0, 0.07, 0.02)
  housing.castShadow = true
  part(head, rbox(0.16, 0.02, 0.3, 0.01), dark(), 0, 0.14, 0.03)
  part(head, cyl(0.045, 0.05, 0.05, 16), dark(), 0, 0.07, 0.17, Math.PI / 2)
  part(head, cyl(0.036, 0.036, 0.012, 16), Mat.glass('#1a2a3a', 0.85), 0, 0.07, 0.2, Math.PI / 2)
  part(head, torus(0.04, 0.006, 6, 18), Mat.emissive('#7fd8ff', 2.2), 0, 0.07, 0.196)
  const rec = liveEmi('#ff3b3b', 3)
  part(head, sphere(0.012, 8, 6), rec, 0.05, 0.12, 0.13)
  part(head, cyl(0.004, 0.004, 0.16, 4), dark(), -0.05, 0.22, -0.06)
  // 視野錐（淡）
  const coneGeo = new THREE.CircleGeometry(3.2, 18, Math.PI / 2 - 0.45, 0.9).rotateX(-Math.PI / 2)
  const cone = new THREE.Mesh(coneGeo, glowMat('#7fd8ff', 0.6, fxTex('soft'), 0.12))
  cone.position.y = 0.04
  cone.raycast = () => {}
  root.add(cone)
  return {
    root,
    height: 0.9,
    update(t) {
      const pan = Math.sin(t * 0.45 + s.i) * 0.6
      head.rotation.y = pan
      cone.rotation.y = pan
      rec.emissiveIntensity = Math.sin(t * 4) > 0 ? 3.5 : 0.3
    },
  }
})

// ───────── 動作感應器 ─────────

reg('motionSensor', (_def, s) => {
  const R = 3.25
  const root = new THREE.Group()
  part(root, cyl(0.16, 0.19, 0.06, 20), dark(), 0, 0.03, 0)
  part(root, cyl(0.15, 0.15, 0.02, 20), steel(), 0, 0.07, 0)
  const dome = part(root, sphere(0.1, 16, 10), Mat.glass('#ffd0a0', 0.4), 0, 0.08, 0)
  dome.scale.y = 0.5
  const eye = liveEmi('#ff7a2a', 2.5)
  part(root, sphere(0.045, 12, 8), eye, 0, 0.09, 0)
  part(root, torus(0.17, 0.008, 6, 28), Mat.emissive('#ff7a2a', 1.8), 0, 0.065, 0, Math.PI / 2)
  // 掃描扇面與範圍圈
  const wedgeGeo = new THREE.CircleGeometry(R, 20, 0, 0.7).rotateX(-Math.PI / 2)
  const wedge = new THREE.Mesh(wedgeGeo, glowMat('#ff7a2a', 0.8, fxTex('soft'), 0.18))
  wedge.position.y = 0.035
  wedge.raycast = () => {}
  root.add(wedge)
  const edge = flatDisc(root, R, glowMat('#ff7a2a', 1.2, fxTex('ring'), 0.3))
  const pulse = flatDisc(root, 0.3, glowMat('#ff7a2a', 1.6, fxTex('ring'), 0.6), 0.04)
  return {
    root,
    height: 0.25,
    update(t) {
      wedge.rotation.y = -t * 1.6
      const k = ((t * 0.5 + s.i * 0.13) % 1 + 1) % 1
      pulse.scale.setScalar(0.2 + k * R)
      ;(pulse.material as THREE.MeshBasicMaterial).opacity = 0.5 * (1 - k)
      ;(edge.material as THREE.MeshBasicMaterial).opacity = 0.22 + 0.08 * Math.sin(t * 2)
      eye.emissiveIntensity = 1.8 + Math.sin(t * 6) * 0.8
    },
  }
})

// ───────── 哨戟 ─────────

reg('sentry', (_def, s) => {
  const hostile = ((s.fl ?? 0) & 64) !== 0
  const root = new THREE.Group()
  // 三腳支架
  for (let i = 0; i < 3; i++) {
    const a = (i / 3) * Math.PI * 2 + Math.PI / 6
    const leg = part(root, rbox(0.06, 0.05, 0.5, 0.015), Mat.metal('#3a424b', 0.7), Math.cos(a) * 0.2, 0.16, Math.sin(a) * 0.2)
    leg.rotation.y = -a + Math.PI / 2
    leg.rotation.x = 0.55
    part(root, cyl(0.05, 0.06, 0.03, 8), rubber(), Math.cos(a) * 0.38, 0.015, Math.sin(a) * 0.38)
  }
  part(root, cyl(0.12, 0.15, 0.22, 14), dark(), 0, 0.38, 0)
  part(root, cyl(0.155, 0.155, 0.03, 14), Mat.paint('#ffc23d', 0.5), 0, 0.3, 0)
  const head = new THREE.Group()
  head.position.y = 0.6
  root.add(head)
  part(head, rbox(0.3, 0.18, 0.34, 0.04), Mat.metal('#4a535c', 0.7), 0, 0, -0.02)
  part(head, rbox(0.12, 0.14, 0.18, 0.02), Mat.paint('#3a3f2a', 0.6), -0.2, -0.01, -0.04)
  part(head, box(0.31, 0.03, 0.06), Mat.paint('#ffc23d', 0.5), 0, 0.07, 0.12)
  const eye = liveEmi(hostile ? '#ff3b3b' : '#ffb000', 3)
  part(head, rbox(0.12, 0.035, 0.02, 0.01), eye, 0, 0.05, 0.155)
  const barrels = new THREE.Group()
  barrels.position.set(0, -0.01, 0.15)
  head.add(barrels)
  for (let i = 0; i < 6; i++) {
    const a = (i / 6) * Math.PI * 2
    part(barrels, cyl(0.012, 0.012, 0.36, 6), Mat.metal('#2a2e33', 0.9, false), Math.cos(a) * 0.035, Math.sin(a) * 0.035, 0.18, Math.PI / 2)
  }
  part(barrels, cyl(0.05, 0.05, 0.04, 12), Mat.metal('#2a2e33', 0.9, false), 0, 0, 0.32, Math.PI / 2)
  part(barrels, cyl(0.055, 0.055, 0.05, 12), Mat.metal('#2a2e33', 0.9, false), 0, 0, 0.06, Math.PI / 2)
  const halo = flatDisc(root, 0.5, glowMat(hostile ? '#ff3b3b' : '#ffb000', 1.2, fxTex('ring'), 0.35))
  let spin = 0
  return {
    root,
    height: 1.1,
    update(t, dt, _sp, st) {
      const firing = st === 2
      spin += (firing ? 30 : 1) * dt
      barrels.rotation.z = spin
      head.rotation.y = firing ? 0 : Math.sin(t * 0.7 + s.i) * 0.5
      eye.emissiveIntensity = firing ? 4 : 2 + Math.sin(t * 3) * 0.6
      ;(halo.material as THREE.MeshBasicMaterial).opacity = 0.25 + 0.1 * Math.sin(t * 2)
    },
  }
})

// ───────── 力場產生器 ─────────

reg('forceBarrier', (_def, s) => {
  const R = 3.5
  const root = new THREE.Group()
  part(root, cyl(0.34, 0.4, 0.12, 6), dark(), 0, 0.06, 0)
  part(root, cyl(0.3, 0.3, 0.03, 6), Mat.paint('#9fe7ff', 0.4), 0, 0.135, 0)
  part(root, cyl(0.07, 0.1, 0.9, 10), steel(), 0, 0.6, 0)
  for (let i = 0; i < 3; i++) {
    const a = (i / 3) * Math.PI * 2
    const arm = part(root, rbox(0.05, 0.5, 0.05, 0.015), Mat.metal('#4a535c', 0.7), Math.cos(a) * 0.17, 0.62, Math.sin(a) * 0.17)
    arm.rotation.z = Math.cos(a) * 0.25
    arm.rotation.x = -Math.sin(a) * 0.25
    part(root, sphere(0.035, 8, 6), Mat.emissive('#bfefff', 3), Math.cos(a) * 0.24, 0.88, Math.sin(a) * 0.24)
  }
  const core = liveEmi('#bfefff', 3)
  part(root, sphere(0.09, 16, 12), core, 0, 1.1, 0)
  part(root, torus(0.13, 0.012, 6, 24), Mat.emissive('#7fd8ff', 2.4), 0, 1.1, 0, Math.PI / 2)
  const halo = sprite(root, 'soft', '#9fe7ff', 2, 0.9, 1.1)
  // 力場罩：fresnel＋六角網格
  const mat = shieldMat('#9fe7ff', 1.6, 0.9, [14, 6])
  mat.uniforms.uOpacity.value = 0.6
  const domeM = new THREE.Mesh(GEO.hemi, mat)
  domeM.scale.setScalar(R)
  domeM.raycast = () => {}
  domeM.renderOrder = 6
  root.add(domeM)
  const edge = flatDisc(root, R, glowMat('#9fe7ff', 1.6, fxTex('ring'), 0.6))
  return {
    root,
    height: 1.3,
    update(t) {
      mat.uniforms.uTime.value = t + s.i
      domeM.rotation.y = t * 0.05
      core.emissiveIntensity = 2.6 + Math.sin(t * 5) * 0.8
      halo.scale.setScalar(0.8 + Math.sin(t * 5) * 0.08)
      ;(edge.material as THREE.MeshBasicMaterial).opacity = 0.45 + 0.15 * Math.sin(t * 2.4)
    },
  }
})

// ───────── 醫療再生器 ─────────

reg('regenBeacon', (_def, s) => {
  const R = 4.5
  const root = new THREE.Group()
  part(root, rbox(0.44, 0.12, 0.44, 0.04), paintW(), 0, 0.06, 0)
  part(root, rbox(0.46, 0.025, 0.46, 0.01), Mat.emissive('#5cf2a5', 1.6), 0, 0.125, 0)
  part(root, cyl(0.05, 0.06, 0.8, 10), steel(), 0, 0.52, 0)
  part(root, cyl(0.14, 0.1, 0.1, 14), paintW(), 0, 0.96, 0)
  const lamp = liveEmi('#5cf2a5', 2.6)
  part(root, cyl(0.12, 0.12, 0.04, 14), lamp, 0, 1.03, 0)
  const cross = new THREE.Mesh(GEO.plane, glowMat('#5cf2a5', 2.6, fxTex('cross'), 0.95, THREE.DoubleSide))
  cross.scale.setScalar(0.34)
  cross.position.y = 1.32
  cross.raycast = () => {}
  root.add(cross)
  sprite(root, 'soft', '#5cf2a5', 1.6, 0.9, 1.3)
  const area = flatDisc(root, R, glowMat('#5cf2a5', 1, fxTex('ring'), 0.28))
  const pulse = flatDisc(root, 0.5, glowMat('#5cf2a5', 1.6, fxTex('ring'), 0.5), 0.04)
  let em = 0
  return {
    root,
    height: 1.4,
    update(t, dt) {
      cross.rotation.y = t * 1.4
      cross.position.y = 1.32 + Math.sin(t * 2) * 0.04
      const k = ((t + s.i * 0.3) % 1.5) / 1.5
      pulse.scale.setScalar(0.3 + k * R)
      ;(pulse.material as THREE.MeshBasicMaterial).opacity = 0.45 * (1 - k)
      ;(area.material as THREE.MeshBasicMaterial).opacity = 0.2 + 0.06 * Math.sin(t * 2)
      lamp.emissiveIntensity = 2.2 + Math.sin(t * 4) * 0.6
      em += dt
      if (em > 0.25) {
        em = 0
        const p = simPos(root)
        fx()?.emitHere(p.x, p.y, 0.3, 1, { color: '#b8ffd8', speed: 0.1, life: 1.4, size: 0.12, up: 1.2, area: R * 0.8 })
      }
    },
  }
})

// ───────── 熱融炸彈 ─────────

reg('fusionCharge', () => {
  const root = new THREE.Group()
  part(root, cyl(0.2, 0.22, 0.08, 18), dark(), 0, 0.04, 0)
  part(root, cyl(0.17, 0.17, 0.32, 18), Mat.metal('#3a3f45', 0.8), 0, 0.24, 0)
  // 黃黑警示環
  for (let i = 0; i < 8; i++) {
    const a = (i / 8) * Math.PI * 2
    part(root, box(0.07, 0.05, 0.02), Mat.paint(i % 2 ? '#1a1a1a' : '#ffc23d', 0.5), Math.cos(a) * 0.172, 0.14, Math.sin(a) * 0.172, 0, -a + Math.PI / 2)
  }
  const core = liveEmi('#ff7a2a', 1.5)
  part(root, cyl(0.12, 0.12, 0.2, 16, true), Mat.glass('#ffb46b', 0.35), 0, 0.33, 0)
  part(root, cyl(0.09, 0.09, 0.18, 12), core, 0, 0.33, 0)
  part(root, cyl(0.18, 0.18, 0.04, 18), Mat.metal('#2b3138', 0.8), 0, 0.44, 0)
  const led = liveEmi('#ff3b1a', 3)
  part(root, sphere(0.025, 8, 6), led, 0.08, 0.47, 0.05)
  part(root, rbox(0.1, 0.02, 0.06, 0.01), Mat.screen(screenTex('warn', '#ff3b1a', 3), 2), -0.04, 0.465, 0.04)
  const halo = sprite(root, 'soft', '#ff5a1a', 1.6, 0.9, 0.35)
  let t0 = -1
  return {
    root,
    height: 0.5,
    update(t) {
      if (t0 < 0) t0 = t
      const age = t - t0
      const k = Math.min(1, age / 3)
      const hz = 1.5 + k * k * 10
      const on = Math.sin(age * hz * Math.PI * 2) > 0
      led.emissiveIntensity = on ? 5 : 0.3
      core.emissiveIntensity = 1.4 + k * 5 + (on ? 0.6 : 0)
      halo.scale.setScalar(0.7 + k * 0.9 + (on ? 0.1 : 0))
      halo.material.opacity = 0.6 + k * 0.4
      root.position.x = k > 0.7 ? (Math.random() - 0.5) * 0.015 * k : 0
    },
  }
})

// ───────── 實驗傳送裝置 ─────────

reg('protoPortal', () => {
  const root = new THREE.Group()
  part(root, rbox(0.7, 0.12, 0.36, 0.04), dark(), 0, 0.06, 0)
  part(root, rbox(0.72, 0.02, 0.38, 0.01), Mat.emissive('#7fd8ff', 1.4), 0, 0.125, 0)
  const ring = new THREE.Group()
  ring.position.y = 0.72
  root.add(ring)
  part(ring, torus(0.5, 0.06, 10, 40), steel(), 0, 0, 0)
  part(ring, torus(0.44, 0.015, 6, 40), Mat.emissive('#9fe7ff', 2.6), 0, 0, 0.03)
  for (let i = 0; i < 6; i++) {
    const a = (i / 6) * Math.PI * 2
    part(ring, rbox(0.08, 0.12, 0.14, 0.02), Mat.metal('#4a535c', 0.7), Math.cos(a) * 0.52, Math.sin(a) * 0.52, 0, 0, 0, a)
  }
  const swirl = new THREE.Mesh(GEO.plane, glowMat('#9fe7ff', 1.8, fxTex('swirl'), 0.9, THREE.DoubleSide))
  swirl.scale.setScalar(0.9)
  swirl.raycast = () => {}
  ring.add(swirl)
  const swirl2 = new THREE.Mesh(GEO.plane, glowMat('#ffffff', 1.2, fxTex('swirl'), 0.6, THREE.DoubleSide))
  swirl2.scale.setScalar(0.6)
  swirl2.raycast = () => {}
  ring.add(swirl2)
  const halo = sprite(ring, 'soft', '#7fd8ff', 1.8, 1.4, 0)
  let t0 = -1
  return {
    root,
    height: 1.6,
    update(t) {
      if (t0 < 0) t0 = t
      const k = Math.min(1, (t - t0) / 3)
      swirl.rotation.z -= 0.04 + k * 0.25
      swirl2.rotation.z += 0.06 + k * 0.3
      swirl.scale.setScalar(0.5 + k * 0.45)
      halo.scale.setScalar(1 + k * 1.2 + Math.sin(t * 20) * 0.05 * k)
    },
  }
})

// ───────── GIT 解析器 ─────────

reg('gitResolver', (_def, s) => {
  const root = new THREE.Group()
  part(root, rbox(0.7, 0.9, 0.5, 0.05), paintW(), 0, 0.45, 0)
  part(root, rbox(0.72, 0.06, 0.52, 0.02), Mat.metal('#3a424b', 0.7), 0, 0.03, 0)
  part(root, rbox(0.5, 0.34, 0.03, 0.02), dark(), 0, 0.62, 0.25)
  part(root, box(0.44, 0.28, 0.01), Mat.screen(screenTex('dna', '#5cf2a5', s.i % 5), 1.8), 0, 0.62, 0.268)
  part(root, box(0.72, 0.03, 0.02), Mat.emissive('#33ffd1', 1.6), 0, 0.88, 0.25)
  // 試管架
  part(root, rbox(0.3, 0.05, 0.12, 0.01), dark(), 0.08, 0.93, -0.05)
  const tubes: THREE.Mesh[] = []
  for (let i = 0; i < 4; i++) {
    part(root, cyl(0.022, 0.022, 0.16, 8, true), Mat.glass('#e8fff0', 0.3), -0.02 + i * 0.065, 1.02, -0.05)
    tubes.push(part(root, cyl(0.017, 0.017, 0.08, 8), Mat.liquid(['#c8323c', '#5cf2a5', '#7a3cff', '#ffc23d'][i]), -0.02 + i * 0.065, 0.98, -0.05))
  }
  const st = liveEmi('#5cf2a5', 2.4)
  part(root, sphere(0.02, 8, 6), st, -0.28, 0.82, 0.255)
  return {
    root,
    height: 1.2,
    update(t) {
      st.emissiveIntensity = Math.sin(t * 3 + s.i) > 0.3 ? 3 : 0.4
      tubes.forEach((m, i) => (m.scale.y = 0.85 + 0.15 * Math.sin(t * 2 + i)))
    },
  }
})

// ───────── 奇點（黑洞）─────────

reg('singularity', () => {
  const R = 8
  const root = new THREE.Group()
  const h = 1.1
  const core = new THREE.Mesh(GEO.sphere, new THREE.MeshBasicMaterial({ color: '#000000' }))
  core.scale.setScalar(0.42)
  core.position.y = h
  root.add(core)
  const rim = sprite(root, 'soft', '#b28cff', 2.6, 1.6, h)
  const lens = new THREE.Mesh(GEO.torus, glowMat('#e8dcff', 2.2, null))
  lens.scale.set(0.5, 1.5, 0.5)
  lens.position.y = h
  root.add(lens)
  const disk = new THREE.Group()
  disk.position.y = h
  disk.rotation.x = 0.35
  root.add(disk)
  const d1 = new THREE.Mesh(GEO.flat, glowMat('#ff9a5a', 2, fxTex('swirl'), 0.95, THREE.DoubleSide))
  d1.scale.setScalar(1.5)
  const d2 = new THREE.Mesh(GEO.flat, glowMat('#9b5de5', 2, fxTex('swirl'), 0.8, THREE.DoubleSide))
  d2.scale.setScalar(2.3)
  d1.raycast = d2.raycast = lens.raycast = core.raycast = () => {}
  disk.add(d1, d2)
  // 地面：中心的暗斑＋8 m 引力範圍
  flatDisc(root, 2.2, new THREE.MeshBasicMaterial({ color: '#000000', map: fxTex('soft'), transparent: true, opacity: 0.85, depthWrite: false }))
  const edge = flatDisc(root, R, glowMat('#9b5de5', 1.4, fxTex('ring'), 0.4))
  const inner = flatDisc(root, R * 0.6, glowMat('#ff9a5a', 0.8, fxTex('swirl'), 0.25), 0.035)
  let em = 0
  let snd = 0
  return {
    root,
    height: 2.2,
    update(t, dt) {
      d1.rotation.y -= dt * 5
      d2.rotation.y -= dt * 2.6
      inner.rotation.y -= dt * 1.2
      lens.rotation.y = t * 0.5
      rim.scale.setScalar(1.5 + Math.sin(t * 7) * 0.08)
      ;(edge.material as THREE.MeshBasicMaterial).opacity = 0.3 + 0.12 * Math.sin(t * 3)
      em += dt
      snd -= dt
      if (em > 0.04) {
        em = 0
        const p = simPos(root)
        fx()?.emitHere(p.x, p.y, 0.4, 2, { color: '#d8c0ff', color2: '#ff9a5a', speed: 0.6, life: 1.1, size: 0.16, up: 0.25, area: R * 0.85, radial: -1, pull: 10, swirl: 5, drag: 0.1, hArea: 0.6 })
      }
      if (snd <= 0) {
        snd = 1.2
        const p = simPos(root)
        sfx('voidHum', p.x, p.y)
      }
    },
  }
})

// ───────── 蟲餌 ─────────

reg('wormBait', () => {
  const root = new THREE.Group()
  part(root, cyl(0.1, 0.12, 0.14, 12), Mat.metal('#4a535c', 0.6), 0, 0.07, 0)
  part(root, torus(0.105, 0.012, 6, 18), Mat.emissive('#ff7eb6', 1.6), 0, 0.12, 0, Math.PI / 2)
  const lump = part(root, sphere(0.1, 12, 10), fleshMat(), 0, 0.2, 0)
  lump.scale.set(1, 0.7, 0.9)
  const halo = sprite(root, 'soft', '#ff7eb6', 1.2, 0.7, 0.2)
  let em = 0
  return {
    root,
    height: 0.4,
    update(t, dt) {
      lump.scale.set(1 + Math.sin(t * 3) * 0.06, 0.7 + Math.sin(t * 3 + 1) * 0.05, 0.9)
      halo.material.opacity = 0.6 + 0.3 * Math.sin(t * 3)
      em += dt
      if (em > 0.2) {
        em = 0
        const p = simPos(root)
        fx()?.emitHere(p.x, p.y, 0.3, 1, { color: '#c86a8a', speed: 0.15, life: 2, size: 0.35, up: 0.6, layer: 'smoke', alpha: 0.25, area: 0.1 })
      }
    },
  }
})

// ───────── 雷暴 ─────────

function stormBolt(h: number, r: number): THREE.Group {
  const g = new THREE.Group()
  const pts: THREE.Vector3[] = []
  const a = Math.random() * Math.PI * 2
  const end = new THREE.Vector3(Math.cos(a) * r, 0.02, Math.sin(a) * r)
  const start = new THREE.Vector3((Math.random() - 0.5) * r * 0.6, h, (Math.random() - 0.5) * r * 0.6)
  for (let i = 0; i <= 8; i++) {
    const p = start.clone().lerp(end, i / 8)
    if (i > 0 && i < 8) p.add(new THREE.Vector3((Math.random() - 0.5) * 0.5, 0, (Math.random() - 0.5) * 0.5))
    pts.push(p)
  }
  const path = new THREE.CurvePath<THREE.Vector3>()
  for (let i = 1; i < pts.length; i++) path.add(new THREE.LineCurve3(pts[i - 1], pts[i]))
  g.add(new THREE.Mesh(new THREE.TubeGeometry(path, 16, 0.018, 4), glowMat('#e8f6ff', 5, null)))
  g.add(new THREE.Mesh(new THREE.TubeGeometry(path, 16, 0.07, 4), glowMat('#7fd8ff', 2, null, 0.35)))
  g.traverse((o) => ((o as THREE.Mesh).raycast = () => {}))
  g.visible = false
  return g
}

reg('teslaStorm', (def) => {
  const R = def?.radius ?? 3.5
  const root = new THREE.Group()
  const H = 2.7
  const clouds: THREE.Sprite[] = []
  for (let i = 0; i < 9; i++) {
    const a = (i / 9) * Math.PI * 2
    const r = i === 0 ? 0 : R * (0.3 + Math.random() * 0.4)
    const c = sprite(root, 'smoke', i % 3 ? '#2a3240' : '#3a4458', 1, R * (0.9 + Math.random() * 0.5), H + Math.random() * 0.4, false, 0.85)
    c.position.x = Math.cos(a) * r
    c.position.z = Math.sin(a) * r
    clouds.push(c)
  }
  const flashes: THREE.Sprite[] = []
  for (let i = 0; i < 3; i++) flashes.push(sprite(root, 'soft', '#9fd8ff', 2.2, R * 0.9, H - 0.1))
  const bolts = [stormBolt(H, R * 0.8), stormBolt(H, R * 0.6), stormBolt(H, R * 0.9)]
  for (const b of bolts) root.add(b)
  const edge = flatDisc(root, R, glowMat('#7fd8ff', 1.4, fxTex('ring'), 0.45))
  const floor = flatDisc(root, R, glowMat('#3a5a8a', 0.8, fxTex('soft'), 0.35), 0.025)
  let next = 0
  let showUntil = 0
  let cur = -1
  let em = 0
  return {
    root,
    height: 4.3,
    update(t, dt) {
      clouds.forEach((c, i) => {
        c.material.rotation = t * 0.08 * (i % 2 ? 1 : -1) + i
        c.position.y = H + Math.sin(t * 0.7 + i) * 0.06
      })
      if (t > next) {
        next = t + 0.25 + Math.random() * 0.6
        cur = Math.floor(Math.random() * bolts.length)
        showUntil = t + 0.08
        bolts.forEach((b, i) => {
          b.visible = i === cur
          if (i === cur) b.rotation.y = Math.random() * Math.PI * 2
        })
        const p = simPos(root)
        if (Math.random() < 0.5) sfx('crackle', p.x, p.y)
      }
      if (t > showUntil) for (const b of bolts) b.visible = false
      flashes.forEach((f, i) => {
        const on = t < showUntil && i === cur
        f.material.opacity = on ? 1 : 0.15 + 0.1 * Math.sin(t * 13 + i * 3)
        f.position.x = Math.cos(i * 2.1) * R * 0.4
        f.position.z = Math.sin(i * 2.1) * R * 0.4
      })
      ;(edge.material as THREE.MeshBasicMaterial).opacity = 0.35 + 0.15 * Math.sin(t * 5)
      ;(floor.material as THREE.MeshBasicMaterial).opacity = t < showUntil ? 0.7 : 0.3
      em += dt
      if (em > 0.05) {
        em = 0
        const p = simPos(root)
        fx()?.emitHere(p.x, p.y, H - 0.2, 1, { color: '#bfe8ff', speed: 1, life: 0.35, size: 1, up: -6, area: R * 0.8, layer: 'spark', drag: 0 })
      }
    },
  }
})

// ───────── 電漿球 ─────────

reg('plasmaBall', () => {
  const root = new THREE.Group()
  const H = 0.75
  const core = new THREE.Mesh(GEO.sphere, glowMat('#d8ffe8', 4, null))
  core.scale.setScalar(0.14)
  core.position.y = H
  root.add(core)
  const shellM = new THREE.Mesh(GEO.ico1, glowMat('#5cf2a5', 1.6, null, 0.45))
  shellM.scale.setScalar(0.26)
  shellM.position.y = H
  root.add(shellM)
  const halo = sprite(root, 'soft', '#5cf2a5', 2.4, 1.3, H)
  const star = sprite(root, 'star', '#a8ffd0', 1.8, 0.9, H)
  const glow = flatDisc(root, 1.5, glowMat('#5cf2a5', 1, fxTex('soft'), 0.5))
  core.raycast = shellM.raycast = () => {}
  let t0 = -1
  let em = 0
  return {
    root,
    height: 1,
    update(t, dt) {
      if (t0 < 0) t0 = t
      const k = Math.min(1, (t - t0) / 1.5)
      const j = 1 + Math.sin(t * (20 + k * 30)) * 0.08
      core.scale.setScalar((0.14 + k * 0.06) * j)
      shellM.scale.setScalar((0.26 + k * 0.12) * j)
      shellM.rotation.set(t * 3, t * 2.2, 0)
      halo.scale.setScalar(1.2 + k * 0.8)
      star.material.rotation = t * 2
      ;(glow.material as THREE.MeshBasicMaterial).opacity = 0.4 + k * 0.4
      em += dt
      if (em > 0.04) {
        em = 0
        const p = simPos(root)
        fx()?.emitHere(p.x, p.y, H, 1, { color: '#ffffff', color2: '#5cf2a5', speed: 2.4, life: 0.18, size: 1, up: 0, layer: 'spark' })
      }
    },
  }
})

// ───────── 火海 ─────────

reg('fireField', (def) => {
  const R = def?.radius ?? 2
  const root = new THREE.Group()
  flatDisc(root, R * 1.05, new THREE.MeshBasicMaterial({ color: '#ffffff', map: fxTex('scorch'), transparent: true, opacity: 0.9, depthWrite: false }), 0.02)
  const ember = flatDisc(root, R, glowMat('#ff5a1a', 1.6, fxTex('noise'), 0.8), 0.028)
  const glow = flatDisc(root, R * 1.15, glowMat('#ff8a2a', 1.2, fxTex('soft'), 0.55), 0.032)
  const heat = sprite(root, 'soft', '#ff8a2a', 1, R * 2.2, 0.6, true, 0.25)
  let em = 0
  let snd = 0
  return {
    root,
    height: 1,
    update(t, dt) {
      ;(ember.material as THREE.MeshBasicMaterial).opacity = 0.65 + 0.2 * Math.sin(t * 7) * Math.sin(t * 3.1)
      ember.rotation.y = t * 0.05
      ;(glow.material as THREE.MeshBasicMaterial).opacity = 0.45 + 0.1 * Math.sin(t * 9)
      heat.material.opacity = 0.2 + 0.06 * Math.sin(t * 5)
      em += dt
      snd -= dt
      if (em > 0.035) {
        em = 0
        const p = simPos(root)
        const f = fx()
        f?.emitHere(p.x, p.y, 0.1, 3, { color: '#ffe8a0', color2: '#ff2a0a', speed: 0.3, life: 0.7, size: 0.45, grow: 1.5, up: 2.6, area: R * 0.9, drag: 1.2 })
        if (Math.random() < 0.35) f?.emitHere(p.x, p.y, 0.6, 1, { color: '#2a2420', speed: 0.2, life: 1.6, size: 0.7, up: 1.2, area: R * 0.8, layer: 'smoke', alpha: 0.35 })
        if (Math.random() < 0.3) f?.emitHere(p.x, p.y, 0.2, 1, { color: '#ffffff', color2: '#ff8a2a', speed: 1, life: 0.6, size: 1, up: 3, area: R * 0.8, grav: 2, layer: 'spark' })
      }
      if (snd <= 0) {
        snd = 0.9
        const p = simPos(root)
        sfx('fireLoop', p.x, p.y)
      }
    },
  }
})

// ───────── 污染區 ─────────

reg('radZone', (def) => {
  const R = def?.radius ?? 4
  const root = new THREE.Group()
  const glow = flatDisc(root, R, glowMat('#5adf4a', 0.6, fxTex('soft'), 0.6), 0.025)
  const edge = flatDisc(root, R, glowMat('#7dff6a', 1.4, fxTex('ring'), 0.5), 0.03)
  const sym = flatDisc(root, R * 0.4, glowMat('#7dff6a', 1, fxTex('trefoil'), 0.35), 0.035)
  const noise = flatDisc(root, R * 0.95, glowMat('#3a8a2a', 0.8, fxTex('noise'), 0.35), 0.028)
  let em = 0
  let snd = 0
  return {
    root,
    height: 0.5,
    update(t, dt) {
      sym.rotation.y = t * 0.15
      noise.rotation.y = -t * 0.04
      ;(glow.material as THREE.MeshBasicMaterial).opacity = 0.5 + 0.12 * Math.sin(t * 1.7)
      ;(edge.material as THREE.MeshBasicMaterial).opacity = 0.4 + 0.15 * Math.sin(t * 3)
      em += dt
      snd -= dt
      if (em > 0.06) {
        em = 0
        const p = simPos(root)
        fx()?.emitHere(p.x, p.y, 0.1, 1, { color: '#c8ff9a', color2: '#2a8a1a', speed: 0.1, life: 2.2, size: 0.12, up: 1.2, area: R * 0.95, drag: 0.4 })
        if (Math.random() < 0.25) fx()?.emitHere(p.x, p.y, 0.2, 1, { color: '#5a7a3a', speed: 0.15, life: 3, size: 1.2, up: 0.05, area: R * 0.8, layer: 'smoke', alpha: 0.18 })
      }
      if (snd <= 0) {
        snd = 0.6 + Math.random() * 0.8
        const p = simPos(root)
        sfx('geigerTick', p.x, p.y)
      }
    },
  }
})

// ───────── 酸池 ─────────

reg('acidPool', (def) => {
  const R = def?.radius ?? 2.5
  const root = new THREE.Group()
  const liq = withFog(
    new THREE.MeshStandardMaterial({ color: '#7ab81a', emissive: '#5a9a10', emissiveIntensity: 0.9, roughness: 0.06, metalness: 0, transparent: true, opacity: 0.88, alphaMap: fxTex('splat'), depthWrite: false, normalMap: null }),
  )
  const pool = new THREE.Mesh(GEO.flat, liq)
  pool.scale.setScalar(R)
  pool.position.y = 0.03
  pool.receiveShadow = true
  pool.raycast = () => {}
  root.add(pool)
  const sheen = flatDisc(root, R * 0.9, glowMat('#c8ff3a', 0.7, fxTex('noise'), 0.4), 0.035)
  const rim = flatDisc(root, R * 1.08, glowMat('#b6ff3a', 0.9, fxTex('ring'), 0.35), 0.026)
  const bubbles: { m: THREE.Mesh; t0: number; life: number }[] = []
  const bMat = new THREE.MeshStandardMaterial({ color: '#c8ff5a', emissive: '#6aaa1a', emissiveIntensity: 1.2, roughness: 0.05, transparent: true, opacity: 0.8 })
  for (let i = 0; i < 8; i++) {
    const m = part(root, GEO.sphereLo, bMat, 0, 0.04, 0)
    m.castShadow = false
    m.scale.setScalar(0.001)
    bubbles.push({ m, t0: -10, life: 1 })
  }
  let em = 0
  return {
    root,
    height: 0.3,
    update(t, dt) {
      sheen.rotation.y = t * 0.1
      ;(sheen.material as THREE.MeshBasicMaterial).opacity = 0.3 + 0.1 * Math.sin(t * 2.3)
      ;(rim.material as THREE.MeshBasicMaterial).opacity = 0.3 + 0.08 * Math.sin(t * 3.1)
      for (const b of bubbles) {
        const k = (t - b.t0) / b.life
        if (k >= 1) {
          if (Math.random() < 0.04) {
            b.t0 = t
            b.life = 0.6 + Math.random() * 0.8
            const a = Math.random() * Math.PI * 2
            const r = Math.sqrt(Math.random()) * R * 0.75
            b.m.position.set(Math.cos(a) * r, 0.04, Math.sin(a) * r)
          } else b.m.scale.setScalar(0.001)
          continue
        }
        const s = 0.02 + k * 0.07
        b.m.scale.set(s, s * 0.8, s)
        if (k > 0.95) {
          const p = simPos(root)
          fx()?.emitHere(p.x + b.m.position.x, p.y - b.m.position.z, 0.08, 2, { color: '#d8ff7a', speed: 0.8, life: 0.3, size: 0.06, up: 1.5, grav: 6 })
        }
      }
      em += dt
      if (em > 0.15) {
        em = 0
        const p = simPos(root)
        fx()?.emitHere(p.x, p.y, 0.1, 1, { color: '#b8d890', speed: 0.1, life: 2, size: 0.5, up: 0.6, area: R * 0.8, layer: 'smoke', alpha: 0.2 })
      }
    },
  }
})

// ───────── 毒雲 ─────────

reg('cloud', (def) => {
  const R = def?.radius ?? 2.3
  const root = new THREE.Group()
  const puffs: { s: THREE.Sprite; a: number; r: number; h: number; sp: number }[] = []
  for (let i = 0; i < 12; i++) {
    const a = Math.random() * Math.PI * 2
    const r = Math.sqrt(Math.random()) * R * 0.7
    const h = 0.4 + Math.random() * 1.3
    const s = sprite(root, 'smoke', i % 3 ? '#8a9a78' : '#a8b090', 1, R * (0.9 + Math.random() * 0.6), h, false, 0.6)
    puffs.push({ s, a, r, h, sp: (Math.random() - 0.5) * 0.4 })
  }
  flatDisc(root, R * 1.1, new THREE.MeshBasicMaterial({ color: '#4a5a3a', map: fxTex('soft'), transparent: true, opacity: 0.45, depthWrite: false }), 0.02)
  return {
    root,
    height: 1.8,
    update(t) {
      for (const p of puffs) {
        const a = p.a + t * p.sp
        p.s.position.set(Math.cos(a) * p.r, p.h + Math.sin(t * 0.6 + p.a) * 0.1, Math.sin(a) * p.r)
        p.s.material.rotation = t * p.sp
      }
    },
  }
})

// ───────── 物質汲取器 ─────────

reg('drainer', (_def, s) => {
  const root = new THREE.Group()
  part(root, cyl(0.17, 0.2, 0.1, 14), dark(), 0, 0.05, 0)
  part(root, cyl(0.1, 0.1, 0.34, 14, true), Mat.glass('#c8ffd8', 0.3), 0, 0.28, 0)
  const plasma = liveEmi('#5cf2a5', 2.6)
  const inner = part(root, cyl(0.06, 0.06, 0.3, 10), plasma, 0, 0.28, 0)
  for (let i = 0; i < 3; i++) part(root, torus(0.115, 0.012, 6, 20), Mat.metal('#b87333', 0.9, false), 0, 0.16 + i * 0.12, 0, Math.PI / 2)
  part(root, cyl(0.13, 0.11, 0.08, 14), steel(), 0, 0.49, 0)
  part(root, cyl(0.025, 0.04, 0.1, 8), dark(), 0, 0.58, 0)
  const tip = liveEmi('#c8ff9a', 3)
  part(root, sphere(0.03, 8, 6), tip, 0, 0.63, 0)
  const halo = sprite(root, 'soft', '#5cf2a5', 1.8, 0.5, 0.62)
  return {
    root,
    height: 1,
    update(t) {
      plasma.emissiveIntensity = 2 + Math.sin(t * 6 + s.i) * 0.8
      inner.rotation.y = t * 3
      inner.scale.x = inner.scale.z = 0.8 + 0.2 * Math.sin(t * 9)
      tip.emissiveIntensity = 2.5 + Math.sin(t * 11) * 1
      halo.scale.setScalar(0.45 + Math.sin(t * 11) * 0.06)
    },
  }
})

// ───────── 遙控雷 ─────────

reg('rdg', (_def, s) => {
  const root = new THREE.Group()
  part(root, cyl(0.13, 0.15, 0.05, 16), Mat.metal('#3a3f2a', 0.6), 0, 0.025, 0)
  part(root, cyl(0.09, 0.1, 0.04, 16), dark(), 0, 0.07, 0)
  for (let i = 0; i < 4; i++) {
    const a = (i / 4) * Math.PI * 2 + Math.PI / 4
    part(root, box(0.05, 0.03, 0.06), steel(), Math.cos(a) * 0.14, 0.02, Math.sin(a) * 0.14, 0, -a)
  }
  part(root, cyl(0.004, 0.004, 0.12, 4), dark(), 0.05, 0.14, 0)
  const led = liveEmi('#ff3b1a', 3)
  part(root, sphere(0.018, 8, 6), led, 0, 0.095, 0)
  const halo = flatDisc(root, 0.35, glowMat('#ff3b1a', 1.4, fxTex('soft'), 0.5))
  return {
    root,
    height: 0.15,
    update(t) {
      const on = Math.sin(t * 5 + s.i) > 0.6
      led.emissiveIntensity = on ? 5 : 0.3
      ;(halo.material as THREE.MeshBasicMaterial).opacity = on ? 0.6 : 0.1
    },
  }
})

// ───────── 螢火蟲偵察機 ─────────

reg('firefly', (_def, s) => {
  const root = new THREE.Group()
  const drone = new THREE.Group()
  root.add(drone)
  part(drone, sphere(0.1, 14, 10), Mat.metal('#4a535c', 0.7), 0, 0, 0).scale.set(1, 0.6, 1.2)
  part(drone, rbox(0.12, 0.03, 0.12, 0.01), Mat.paint('#ffc23d', 0.5), 0, 0.05, 0)
  const lamp = liveEmi('#ffe8a0', 3.5)
  part(drone, sphere(0.04, 10, 8), lamp, 0, -0.05, 0.05)
  const rotors: THREE.Mesh[] = []
  for (let i = 0; i < 4; i++) {
    const a = (i / 4) * Math.PI * 2 + Math.PI / 4
    part(drone, box(0.16, 0.015, 0.025), dark(), Math.cos(a) * 0.1, 0.02, Math.sin(a) * 0.1, 0, -a)
    const r = new THREE.Mesh(GEO.flat, glowMat('#c8d0d8', 0.6, fxTex('swirl'), 0.5, THREE.DoubleSide))
    r.scale.setScalar(0.08)
    r.position.set(Math.cos(a) * 0.18, 0.035, Math.sin(a) * 0.18)
    r.raycast = () => {}
    drone.add(r)
    rotors.push(r)
  }
  const glow = sprite(drone, 'soft', '#ffe8a0', 2.2, 0.7, -0.05)
  const pool = flatDisc(root, 1.6, glowMat('#ffe8a0', 0.7, fxTex('soft'), 0.45))
  return {
    root,
    height: 1.8,
    update(t, dt) {
      const hover = 1.6 + Math.sin(t * 2 + s.i) * 0.08
      drone.position.y = hover
      drone.rotation.z = Math.sin(t * 1.3) * 0.08
      for (const r of rotors) r.rotation.y += dt * 40
      lamp.emissiveIntensity = 3 + Math.sin(t * 8) * 0.3
      glow.scale.setScalar(0.65 + Math.sin(t * 8) * 0.03)
      ;(pool.material as THREE.MeshBasicMaterial).opacity = 0.35 + 0.05 * Math.sin(t * 2)
    },
  }
})

// ───────── 能量庫 ─────────

reg('energyBank', (_def, s) => {
  const root = new THREE.Group()
  part(root, rbox(0.42, 0.14, 0.42, 0.04), dark(), 0, 0.07, 0)
  part(root, rbox(0.44, 0.02, 0.44, 0.01), Mat.emissive('#ff7eb6', 1.4), 0, 0.15, 0)
  for (let i = 0; i < 4; i++) {
    const a = (i / 4) * Math.PI * 2 + Math.PI / 4
    part(root, rbox(0.05, 0.8, 0.05, 0.015), steel(), Math.cos(a) * 0.15, 0.55, Math.sin(a) * 0.15)
  }
  part(root, cyl(0.12, 0.12, 0.74, 16, true), Mat.glass('#ffd0e8', 0.25), 0, 0.55, 0)
  const fillMat = liveEmi('#ff7eb6', 2.8)
  const fill = part(root, cyl(0.09, 0.09, 1, 14), fillMat, 0, 0.18, 0)
  part(root, rbox(0.4, 0.1, 0.4, 0.03), Mat.metal('#4a535c', 0.7), 0, 0.97, 0)
  const top = liveEmi('#ff7eb6', 2)
  part(root, cyl(0.08, 0.08, 0.03, 14), top, 0, 1.03, 0)
  const halo = sprite(root, 'soft', '#ff7eb6', 1.6, 0.8, 0.55)
  let shown = 0
  return {
    root,
    height: 1.1,
    update(t, dt) {
      const k = Math.max(0, Math.min(1, (s.mp ?? 0) / Math.max(1, s.mmp ?? 100)))
      shown += (k - shown) * Math.min(1, dt * 4)
      const h = Math.max(0.01, shown * 0.72)
      fill.scale.y = h
      fill.position.y = 0.19 + h / 2
      fillMat.emissiveIntensity = 1.6 + shown * 2 + Math.sin(t * 5) * 0.3
      top.emissiveIntensity = shown > 0.98 ? 3 + Math.sin(t * 8) : 1.2
      halo.material.opacity = 0.3 + shown * 0.6
    },
  }
})

// ───────── 金屬塊（磁力裝）─────────

reg('metal', (_def, s) => {
  const root = new THREE.Group()
  const rnd = (k: number) => {
    const x = Math.sin(s.i * 12.9898 + k * 78.233) * 43758.5453
    return x - Math.floor(x)
  }
  const lump = new THREE.Group()
  root.add(lump)
  const mats = [Mat.metal('#6a7078', 0.85, false), Mat.metal('#4a4f55', 0.8), Mat.metal('#8a7a60', 0.7, false)]
  for (let i = 0; i < 7; i++) {
    const m = part(lump, i % 2 ? rbox(0.3, 0.16, 0.22, 0.02) : GEO.dodeca, mats[i % 3], (rnd(i) - 0.5) * 0.5, 0.18 + rnd(i + 7) * 0.3, (rnd(i + 3) - 0.5) * 0.5, rnd(i + 1) * 3, rnd(i + 2) * 3, rnd(i + 4) * 3)
    if (i % 2 === 0) m.scale.setScalar(0.12 + rnd(i + 5) * 0.08)
  }
  const glow = liveEmi('#33ffd1', 1.4)
  for (let i = 0; i < 3; i++) part(lump, torus(0.3 - i * 0.04, 0.008, 4, 24), glow, 0, 0.3, 0, Math.PI / 2 + (rnd(i + 9) - 0.5) * 1.2, rnd(i + 11) * 3, 0)
  return {
    root,
    height: 0.6,
    update(t) {
      glow.emissiveIntensity = 1 + Math.sin(t * 3 + s.i) * 0.6
      lump.rotation.y = Math.sin(t * 0.5 + s.i) * 0.1
    },
  }
})

/** 裝置模型清單（截圖用）*/
export const DEVICE_MODELS = ['camera', 'motionSensor', 'sentry', 'forceBarrier', 'regenBeacon', 'fusionCharge', 'protoPortal', 'gitResolver', 'singularity', 'wormBait', 'teslaStorm', 'plasmaBall', 'fireField', 'radZone', 'acidPool', 'cloud', 'drainer', 'rdg', 'firefly', 'energyBank', 'metal']
export type { ModelView }
