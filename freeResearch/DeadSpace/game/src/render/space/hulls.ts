// 太空層的站體與船艦外觀（程序化）：細節化外殼、導航閃燈、發光窗帶
import * as THREE from 'three'
import { Batcher, box, cyl, rbox, sphere, torus } from '../batch'
import { Mat } from '../materials'

interface HullSpec {
  hull: string
  accent: string
  glow: string
}

const SPECS: Record<string, HullSpec> = {
  nyx: { hull: '#c4ccd3', accent: '#33ffd1', glow: '#7fd8ff' },
  adjudicatrix: { hull: '#2b3a5a', accent: '#ffc23d', glow: '#ffc23d' },
  tenshu: { hull: '#26282c', accent: '#ff7a2a', glow: '#ff9a4a' },
  hulk7: { hull: '#5a4a3a', accent: '#8a5a3a', glow: '#ffb46b' },
  bravado: { hull: '#4a5058', accent: '#ff3b3b', glow: '#ff5a4a' },
  caldera: { hull: '#7a6a2a', accent: '#ffc23d', glow: '#ff9a3a' },
  vivarium: { hull: '#3a5a4a', accent: '#5cf2a5', glow: '#5cf2a5' },
  portage: { hull: '#5a6a7a', accent: '#4aa8ff', glow: '#4aa8ff' },
}

/** 站點外觀：中央艙＋環＋輻條＋太陽能板＋對接臂 */
export function buildStationHull(id: string, scale = 1): THREE.Group {
  const sp = SPECS[id] ?? SPECS.nyx
  const g = new THREE.Group()
  const b = new Batcher()
  const hull = Mat.metal(sp.hull, 0.6)
  const dark = Mat.metal('#2a3036', 0.7)
  const glow = Mat.emissive(sp.glow, 3)
  const acc = Mat.emissive(sp.accent, 2.5)
  b.add(cyl(1.2, 1.2, 3.2, 24), hull, 0, 0, 0)
  b.add(cyl(1.5, 1.2, 0.5, 24), dark, 0, 1.8, 0)
  b.add(cyl(1.2, 1.5, 0.5, 24), dark, 0, -1.8, 0)
  b.add(sphere(0.6, 16, 12), hull, 0, 2.3, 0)
  b.add(torus(3.6, 0.32, 10, 64), hull, 0, 0, 0, 0, 1, 1, 1, Math.PI / 2)
  b.add(torus(3.6, 0.05, 6, 64), glow, 0, 0.3, 0, 0, 1, 1, 1, Math.PI / 2)
  for (let i = 0; i < 4; i++) {
    const a = (i / 4) * Math.PI * 2
    b.add(box(2.4, 0.18, 0.18), dark, Math.cos(a) * 2.4, 0, Math.sin(a) * 2.4, -a)
  }
  // 窗帶
  for (let i = 0; i < 24; i++) {
    const a = (i / 24) * Math.PI * 2
    b.add(box(0.18, 0.08, 0.04), glow, Math.cos(a) * 1.22, 0.6, Math.sin(a) * 1.22, -a + Math.PI / 2)
    b.add(box(0.18, 0.08, 0.04), glow, Math.cos(a) * 1.22, -0.4, Math.sin(a) * 1.22, -a + Math.PI / 2)
  }
  // 太陽能板
  for (const s of [-1, 1]) {
    b.add(box(0.12, 0.12, 2.5), dark, s * 0.0, -1.1, s * 5.0)
    b.add(rbox(2.6, 0.04, 1.6, 0.02), Mat.metal('#1d2a4a', 0.9, false), 0, -1.1, s * 6.6)
    b.add(rbox(2.6, 0.04, 1.6, 0.02), Mat.metal('#1d2a4a', 0.9, false), 0, -1.1, s * 8.3)
  }
  // 對接臂
  b.add(box(0.5, 0.5, 2.2), hull, 4.6, 0, 0)
  b.add(rbox(0.9, 0.9, 0.9, 0.1), dark, 5.9, 0, 0)
  b.add(box(0.5, 0.5, 2.2), hull, -4.6, 0, 0)
  b.add(rbox(0.9, 0.9, 0.9, 0.1), dark, -5.9, 0, 0)
  b.build(g, { cast: true, receive: true })
  // 導航閃燈
  const blink = new THREE.Group()
  for (const [x, y, z, c] of [
    [6.4, 0, 0, '#ff3b3b'],
    [-6.4, 0, 0, '#5cf2a5'],
    [0, 2.9, 0, '#ffffff'],
  ] as const) {
    const m = new THREE.Mesh(sphere(0.12, 8, 6), Mat.emissive(c, 6))
    m.position.set(x, y, z)
    blink.add(m)
  }
  g.add(blink)
  const accRing = new THREE.Mesh(torus(1.55, 0.04, 6, 32), acc)
  accRing.rotation.x = Math.PI / 2
  accRing.position.y = 1.8
  g.add(accRing)
  g.userData.update = (t: number) => {
    blink.children.forEach((c, i) => (c.visible = Math.sin(t * 3 + i * 2) > 0.3))
  }
  g.scale.setScalar(scale)
  return g
}
