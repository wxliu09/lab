// 18 套防護服的外觀：共用裝甲基底＋各自獨特剪影（美術聖經 §8）
import * as THREE from 'three'
import { box, capsule, cyl, rbox, sphere, torus } from '../batch'
import { Mat } from '../materials'
import type { Rig } from './human'

interface SuitLook {
  plate: string
  glow: string
  helmet?: 'dome' | 'visor' | 'mask' | 'none'
  build: (r: Rig, glow: THREE.Material, plate: THREE.Material) => void
}

function m(g: THREE.BufferGeometry, mat: THREE.Material, x = 0, y = 0, z = 0): THREE.Mesh {
  const o = new THREE.Mesh(g, mat)
  o.position.set(x, y, z)
  o.castShadow = true
  return o
}

const dark = () => Mat.metal('#2a2f35', 0.75)

const LOOKS: Record<string, SuitLook> = {
  'suit.tesla': {
    plate: '#3a4a66',
    glow: '#7fd8ff',
    build: (r, glow) => {
      const coils = new THREE.Group()
      coils.position.set(0, 0.05, -0.32)
      for (let i = 0; i < 4; i++) coils.add(m(torus(0.11, 0.025, 6, 16), glow, 0, -0.15 + i * 0.1, 0))
      coils.add(m(cyl(0.03, 0.03, 0.5, 8), dark(), 0, 0, 0))
      coils.children.forEach((c, i) => i < 4 && (c.rotation.x = Math.PI / 2))
      r.torso.add(coils)
      const tip = m(sphere(0.06, 10, 8), glow, 0, 0.3, -0.32)
      r.torso.add(tip)
      r.extra.push((t) => {
        coils.rotation.y = t * 4
        tip.scale.setScalar(0.8 + Math.abs(Math.sin(t * 13)) * 0.5)
      })
    },
  },
  'suit.rocket': {
    plate: '#5a4a3a',
    glow: '#ff7a2a',
    build: (r, glow) => {
      const tube = m(cyl(0.09, 0.09, 0.7, 14), Mat.metal('#4a4a44', 0.6), 0, 0.1, 0)
      tube.rotation.x = Math.PI / 2 - 0.2
      const g = new THREE.Group()
      g.position.set(0.22, 0.28, -0.05)
      g.add(tube)
      g.add(m(torus(0.09, 0.02, 6, 14), glow, 0, 0.17, 0.33))
      r.torso.add(g)
    },
  },
  'suit.cryo': {
    plate: '#a9c9d9',
    glow: '#9fe7ff',
    build: (r, glow) => {
      for (const s of [-1, 1]) {
        r.torso.add(m(capsule(0.07, 0.3, 4, 10), Mat.metal('#d8e8f0', 0.5), s * 0.1, 0.02, -0.3))
        r.torso.add(m(torus(0.075, 0.015, 6, 12), glow, s * 0.1, 0.1, -0.3))
      }
      const nozzle = m(cyl(0.03, 0.05, 0.16, 10), glow, 0, -0.32, 0.12)
      nozzle.rotation.x = Math.PI / 2
      r.foreR.add(nozzle)
    },
  },
  'suit.plasma': {
    plate: '#2f4a3a',
    glow: '#5cf2a5',
    build: (r, glow) => {
      const can = m(cyl(0.08, 0.1, 0.32, 14), Mat.metal('#3a4a40', 0.6), 0, -0.24, 0.06)
      can.rotation.x = Math.PI / 2
      r.foreR.add(can)
      r.foreR.add(m(torus(0.07, 0.02, 6, 14), glow, 0, -0.24, 0.22))
      const core = m(sphere(0.07, 10, 8), glow, 0, 0.05, -0.3)
      r.torso.add(core)
      r.extra.push((t) => core.scale.setScalar(0.9 + Math.sin(t * 5) * 0.15))
    },
  },
  'suit.pyro': {
    plate: '#5a3a2a',
    glow: '#ff9a3a',
    build: (r, glow) => {
      for (const s of [-1, 1]) r.torso.add(m(capsule(0.08, 0.32, 4, 10), Mat.paint('#b8452a', 0.4), s * 0.11, 0.0, -0.32))
      const noz = m(cyl(0.025, 0.04, 0.3, 10), dark(), 0, -0.3, 0.1)
      noz.rotation.x = Math.PI / 2
      r.foreR.add(noz)
      const pilot = m(sphere(0.03, 8, 6), glow, 0, -0.3, 0.27)
      r.foreR.add(pilot)
      r.extra.push((t) => pilot.scale.setScalar(0.7 + Math.random() * 0.6 + Math.sin(t * 20) * 0.1))
    },
  },
  'suit.photon': {
    plate: '#d8c88a',
    glow: '#fff2a8',
    build: (r, glow) => {
      const mirror = Mat.metal('#f0f0e8', 1, false)
      r.torso.add(m(rbox(0.36, 0.3, 0.05, 0.02), mirror, 0, 0.06, 0.19))
      for (const s of [-1, 1]) r.torso.add(m(rbox(0.12, 0.2, 0.03, 0.01), mirror, s * 0.3, 0.2, 0.05))
      r.torso.add(m(sphere(0.05, 10, 8), glow, 0, 0.06, 0.22))
    },
  },
  'suit.service': {
    plate: '#c2a03a',
    glow: '#ffc23d',
    build: (r, glow) => {
      const arm = new THREE.Group()
      arm.position.set(0.3, 0.15, -0.15)
      arm.add(m(cyl(0.04, 0.04, 0.4, 8), dark(), 0.1, 0.05, 0.1))
      arm.children[0].rotation.z = -0.8
      const saw = m(cyl(0.12, 0.12, 0.02, 20), Mat.metal('#d0d0d0', 0.9, false), 0.28, 0.2, 0.22)
      saw.rotation.x = Math.PI / 2
      arm.add(saw)
      r.torso.add(arm)
      r.torso.add(m(box(0.3, 0.04, 0.02), glow, 0, -0.08, 0.19))
      r.extra.push((t) => (saw.rotation.y = t * 20))
    },
  },
  'suit.void': {
    plate: '#141218',
    glow: '#9b5de5',
    helmet: 'mask',
    build: (r, glow) => {
      for (let i = 0; i < 5; i++) {
        const mote = m(sphere(0.025, 6, 4), glow, 0, 0, 0)
        r.torso.add(mote)
        r.extra.push((t) => mote.position.set(Math.cos(t * 1.5 + i * 1.3) * 0.38, Math.sin(t * 2 + i) * 0.3, Math.sin(t * 1.5 + i * 1.3) * 0.38))
      }
    },
  },
  'suit.mirage': {
    plate: '#6a6f8a',
    glow: '#c9b6ff',
    build: (r, glow) => {
      r.torso.add(m(box(0.44, 0.02, 0.02), glow, 0, 0.0, 0.2))
      r.torso.add(m(box(0.44, 0.02, 0.02), glow, 0, -0.1, 0.2))
      r.extra.push((t) => (r.root.visible = Math.sin(t * 31) > -0.97))
    },
  },
  'suit.rad': {
    plate: '#4a4f48',
    glow: '#7dff6a',
    build: (r, glow) => {
      const lead = Mat.metal('#5a5d58', 0.4)
      r.torso.add(m(rbox(0.54, 0.46, 0.38, 0.05), lead, 0, 0.02, 0))
      const core = m(cyl(0.06, 0.06, 0.18, 10), glow, 0, 0.05, -0.33)
      r.torso.add(core)
      r.extra.push((t) => (core.scale.y = 0.85 + Math.sin(t * 7) * 0.15))
    },
  },
  'suit.operative': {
    plate: '#1c1f24',
    glow: '#ff3b3b',
    helmet: 'visor',
    build: (r, glow) => {
      r.torso.add(m(box(0.02, 0.4, 0.02), glow, 0.12, 0, 0.18))
      const rifle = m(rbox(0.06, 0.08, 0.6, 0.02), dark(), 0, -0.3, 0.2)
      r.foreR.add(rifle)
    },
  },
  'suit.labcoat': {
    plate: '#e8eef0',
    glow: '#33ffd1',
    helmet: 'none',
    build: (r, glow) => {
      r.torso.add(m(rbox(0.52, 0.5, 0.34, 0.1), Mat.cloth('#eef3f5', '#33ffd1'), 0, -0.3, 0))
      for (let i = 0; i < 3; i++) r.torso.add(m(cyl(0.02, 0.02, 0.09, 8), Mat.liquid(['#33ffd1', '#ff7eb6', '#ffc23d'][i]), -0.12 + i * 0.05, 0.08, 0.19))
      void glow
    },
  },
  'suit.guard': {
    plate: '#3a5a8a',
    glow: '#4aa8ff',
    build: (r, glow) => {
      const ring = m(torus(0.12, 0.025, 6, 20), glow, 0, -0.22, 0.12)
      r.foreL.add(ring)
      r.torso.add(m(rbox(0.36, 0.28, 0.06, 0.02), Mat.metal('#4a6a9a', 0.6), 0, 0.05, 0.19))
      r.extra.push((t) => (ring.rotation.z = t * 3))
    },
  },
  'suit.acid': {
    plate: '#3a4a2a',
    glow: '#b6ff3a',
    build: (r, glow) => {
      r.torso.add(m(capsule(0.1, 0.2, 4, 10), Mat.liquid('#9cff3a'), 0, 0.02, -0.33))
      r.torso.add(m(torus(0.1, 0.02, 6, 14), dark(), 0, 0.12, -0.33))
      const noz = m(cyl(0.025, 0.035, 0.35, 10), glow, 0, -0.3, 0.12)
      noz.rotation.x = Math.PI / 2
      r.foreR.add(noz)
    },
  },
  'suit.gatling': {
    plate: '#5a5248',
    glow: '#ffb46b',
    build: (r) => {
      const gun = new THREE.Group()
      gun.position.set(0, -0.28, 0.25)
      for (let i = 0; i < 6; i++) {
        const a = (i / 6) * Math.PI * 2
        const b = m(cyl(0.02, 0.02, 0.55, 6), Mat.metal('#3a3a3a', 0.9), Math.cos(a) * 0.05, Math.sin(a) * 0.05, 0)
        b.rotation.x = Math.PI / 2
        gun.add(b)
      }
      r.foreR.add(gun)
      r.torso.add(m(rbox(0.3, 0.3, 0.2, 0.04), Mat.metal('#4a4238', 0.6), 0, -0.05, -0.32))
      r.extra.push((t) => (gun.rotation.z = t * 18))
    },
  },
  'suit.force': {
    plate: '#c8d0e0',
    glow: '#9fe7ff',
    build: (r, glow) => {
      const halo = m(torus(0.42, 0.015, 6, 32), glow, 0, 0.1, 0)
      halo.rotation.x = Math.PI / 2
      r.torso.add(halo)
      r.extra.push((t) => {
        halo.rotation.z = t
        halo.position.y = 0.1 + Math.sin(t * 2) * 0.05
      })
    },
  },
  'suit.mag': {
    plate: '#2a4a5a',
    glow: '#33ffd1',
    build: (r, glow) => {
      for (const f of [r.foreL, r.foreR]) {
        for (let i = 0; i < 3; i++) {
          const c = m(torus(0.075, 0.015, 6, 14), glow, 0, -0.08 - i * 0.07, 0)
          c.rotation.x = Math.PI / 2
          f.add(c)
        }
      }
    },
  },
  'suit.pulse': {
    plate: '#3a2a4a',
    glow: '#ff7eb6',
    build: (r, glow) => {
      const core = m(sphere(0.09, 14, 10), glow, 0, 0.06, 0.19)
      r.torso.add(core)
      r.torso.add(m(torus(0.11, 0.02, 6, 18), dark(), 0, 0.06, 0.18))
      r.extra.push((t) => core.scale.setScalar(0.85 + Math.abs(Math.sin(t * 3)) * 0.3))
    },
  },
}

/** 套上防護服：裝甲板、頭盔、專屬配件 */
export function attachSuit(r: Rig, suitId: string, playerColor: string): void {
  const look = LOOKS[suitId]
  if (!look) return
  const plate = Mat.armor(look.plate, look.glow)
  const glow = Mat.emissive(look.glow, 2.4)
  // 胸甲、肩甲、護腿
  r.torso.add(m(rbox(0.52, 0.4, 0.36, 0.08), plate, 0, 0.06, 0))
  for (const [sh, s] of [
    [r.armL, -1],
    [r.armR, 1],
  ] as const) {
    const pad = m(rbox(0.22, 0.14, 0.24, 0.06), Mat.armor(playerColor, playerColor), s * 0.02, 0.06, 0)
    sh.add(pad)
  }
  for (const leg of [r.legL, r.legR]) leg.add(m(rbox(0.16, 0.24, 0.18, 0.05), plate, 0, -0.18, 0.02))
  for (const fo of [r.foreL, r.foreR]) fo.add(m(rbox(0.13, 0.18, 0.14, 0.04), plate, 0, -0.12, 0))
  r.torso.add(m(box(0.4, 0.02, 0.01), glow, 0, 0.18, 0.185))
  // 頭盔
  const h = look.helmet ?? 'dome'
  if (h !== 'none') {
    const helm = m(sphere(0.165, 18, 12), plate, 0, 0.03, 0)
    helm.scale.set(1, 0.95, 1.05)
    r.head.add(helm)
    if (h === 'mask') r.head.add(m(sphere(0.12, 12, 8), Mat.metal('#050508', 0.2), 0, 0, 0.07))
    else r.head.add(m(rbox(h === 'visor' ? 0.25 : 0.22, 0.07, 0.07, 0.03), glow, 0, 0.0, 0.135))
  }
  look.build(r, glow, plate)
}

export const SUIT_IDS = Object.keys(LOOKS)
