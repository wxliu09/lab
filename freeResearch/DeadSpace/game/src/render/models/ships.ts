// 太空層物件：船艇、救生艙、無人機、小行星、恆星、站點外觀（美術聖經 §10）
import * as THREE from 'three'
import { regModel, type ModelView } from './index'
import { Batcher, box, cyl, rbox, sphere } from '../batch'
import { Mat } from '../materials'
import { buildStationHull } from '../space/hulls'
import { makePlanet, makeSun } from '../space/sky'

interface ShipLook {
  hull: string
  stripe: string
  engine: string
  len: number
  wid: number
  build: (b: Batcher, hull: THREE.Material, dark: THREE.Material, stripe: THREE.Material) => void
}

const LOOKS: Record<string, ShipLook> = {
  kestrel: {
    hull: '#c9d1d8',
    stripe: '#ff7a2a',
    engine: '#7fd8ff',
    len: 1.8,
    wid: 0.9,
    build: (b, hull, dark, stripe) => {
      b.add(rbox(0.7, 0.4, 1.8, 0.12), hull, 0, 0.3, 0)
      b.add(rbox(1.8, 0.08, 0.6, 0.03), hull, 0, 0.25, -0.3)
      b.add(rbox(0.4, 0.22, 0.5, 0.1), Mat.glass('#7fd8ff', 0.6), 0, 0.5, 0.55)
      b.add(box(0.72, 0.06, 0.3), stripe, 0, 0.36, 0.1)
      for (const s of [-1, 1]) b.add(cyl(0.12, 0.14, 0.5, 10), dark, s * 0.75, 0.25, -0.45, 0, 1, 1, 1, Math.PI / 2)
    },
  },
  mule: {
    hull: '#a6a08a',
    stripe: '#ffc23d',
    engine: '#ffb46b',
    len: 2.2,
    wid: 1.1,
    build: (b, hull, dark, stripe) => {
      b.add(rbox(1.1, 0.7, 2.2, 0.1), hull, 0, 0.45, 0)
      b.add(rbox(0.6, 0.3, 0.6, 0.08), Mat.glass('#ffe0a8', 0.5), 0, 0.75, 0.8)
      b.add(box(1.12, 0.1, 0.2), stripe, 0, 0.55, -0.4)
      b.add(box(1.12, 0.1, 0.2), stripe, 0, 0.55, 0.2)
      for (const s of [-1, 1]) b.add(rbox(0.25, 0.25, 0.7, 0.05), dark, s * 0.65, 0.3, -0.8)
    },
  },
  lancer: {
    hull: '#3a4452',
    stripe: '#ff3b3b',
    engine: '#ff7eb6',
    len: 2.0,
    wid: 1.2,
    build: (b, hull, dark, stripe) => {
      b.add(rbox(0.5, 0.3, 2.0, 0.1), hull, 0, 0.3, 0)
      for (const s of [-1, 1]) {
        b.add(rbox(1.0, 0.06, 0.8, 0.02), hull, s * 0.6, 0.25, -0.4, s * 0.2)
        b.add(cyl(0.05, 0.05, 0.9, 8), dark, s * 1.0, 0.25, 0.0, 0, 1, 1, 1, Math.PI / 2)
      }
      b.add(rbox(0.3, 0.18, 0.5, 0.08), Mat.glass('#ff7eb6', 0.55), 0, 0.45, 0.5)
      b.add(box(0.52, 0.04, 1.2), stripe, 0, 0.46, -0.1)
    },
  },
  harrier: {
    hull: '#59626b',
    stripe: '#9fe7ff',
    engine: '#9fe7ff',
    len: 2.4,
    wid: 1.3,
    build: (b, hull, dark, stripe) => {
      b.add(rbox(0.9, 0.45, 2.4, 0.12), hull, 0, 0.35, 0)
      b.add(cyl(0.18, 0.22, 1.2, 12), dark, 0, 0.45, 1.1, 0, 1, 1, 1, Math.PI / 2)
      for (const s of [-1, 1]) b.add(rbox(0.5, 0.2, 1.4, 0.06), hull, s * 0.75, 0.28, -0.3)
      b.add(box(0.92, 0.05, 0.3), stripe, 0, 0.58, 0.3)
    },
  },
  woolly: {
    hull: '#f0ece0',
    stripe: '#ff7eb6',
    engine: '#ff7eb6',
    len: 1.8,
    wid: 1.2,
    build: (b, hull, dark, stripe) => {
      for (let i = 0; i < 9; i++) b.add(sphere(0.35, 10, 8), Mat.cloth('#f4f0e4', '#ffd6e8'), Math.cos(i) * 0.4, 0.45 + (i % 3) * 0.08, Math.sin(i * 1.7) * 0.6)
      b.add(sphere(0.25, 12, 10), Mat.skin('#2a2a2a'), 0, 0.5, 0.85)
      b.add(box(0.5, 0.05, 0.05), stripe, 0, 0.72, 0.6)
      void dark
      void hull
    },
  },
  pod: {
    hull: '#e8e8e8',
    stripe: '#ff3b3b',
    engine: '#ffb46b',
    len: 0.8,
    wid: 0.5,
    build: (b, hull, dark, stripe) => {
      b.add(sphere(0.35, 14, 10), hull, 0, 0.35, 0)
      b.add(cyl(0.2, 0.28, 0.25, 12), dark, 0, 0.35, -0.35, 0, 1, 1, 1, Math.PI / 2)
      b.add(box(0.72, 0.05, 0.05), stripe, 0, 0.35, 0)
    },
  },
  wasp: {
    hull: '#2a2e33',
    stripe: '#ff3b3b',
    engine: '#ff5a4a',
    len: 1.0,
    wid: 0.9,
    build: (b, hull, dark, stripe) => {
      b.add(rbox(0.3, 0.2, 1.0, 0.06), hull, 0, 0.3, 0)
      for (const s of [-1, 1]) b.add(rbox(0.6, 0.04, 0.4, 0.02), dark, s * 0.4, 0.3, -0.1, s * 0.3)
      b.add(sphere(0.08, 8, 6), stripe, 0, 0.36, 0.45)
    },
  },
}

function shipModel(id: string): ModelView {
  const L = LOOKS[id] ?? LOOKS.kestrel
  const root = new THREE.Group()
  const b = new Batcher()
  L.build(b, Mat.armor(L.hull, L.engine), Mat.metal('#2a3036', 0.7), Mat.emissive(L.stripe, 1.8))
  b.build(root)
  // 引擎尾焰
  const flames: THREE.Mesh[] = []
  for (const s of L.wid > 1 ? [-0.35, 0.35] : [0]) {
    const f = new THREE.Mesh(new THREE.ConeGeometry(0.12, 0.6, 10), new THREE.MeshBasicMaterial({ color: new THREE.Color(L.engine).multiplyScalar(4), transparent: true, opacity: 0.8, blending: THREE.AdditiveBlending, depthWrite: false }))
    f.rotation.x = -Math.PI / 2
    f.position.set(s, 0.3, -L.len / 2 - 0.3)
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

regModel('space.asteroid', (_d, s) => {
  const root = new THREE.Group()
  const geo = new THREE.IcosahedronGeometry(0.9, 2)
  const pos = geo.attributes.position
  for (let i = 0; i < pos.count; i++) {
    const v = new THREE.Vector3().fromBufferAttribute(pos, i)
    const n = 0.75 + 0.35 * Math.abs(Math.sin(v.x * 3.1 + s.i) * Math.cos(v.y * 2.7) + Math.sin(v.z * 4.3))
    v.multiplyScalar(n)
    pos.setXYZ(i, v.x, v.y, v.z)
  }
  geo.computeVertexNormals()
  const rock = new THREE.Mesh(geo, Mat.metal('#4a4642', 0.2, false))
  rock.castShadow = true
  root.add(rock)
  return { root, height: 1, update: (t) => ((rock.rotation.x = t * 0.2), (rock.rotation.y = t * 0.13)) }
})

regModel('space.sun', () => {
  const root = makeSun('#fff1d6', 2.4)
  return { root, height: 3, update: (t) => root.children[1]?.scale.setScalar(22 + Math.sin(t * 0.8) * 0.6) }
})

for (const id of ['nyx', 'adjudicatrix', 'tenshu', 'hulk7', 'bravado', 'caldera', 'vivarium', 'portage', 'pirate']) {
  regModel('station.' + id, (def) => {
    const g = buildStationHull(id, (def?.radius ?? 3) / 4)
    return {
      root: g,
      height: 3,
      update: (t, _dt, _s, state) => {
        ;(g.userData.update as ((t: number) => void) | undefined)?.(t)
        g.rotation.y = t * 0.02
        if (state === 4) g.scale.multiplyScalar(0.995)
      },
    }
  })
}

// ───────── 天體與異物 ─────────

/** 恆星在 three 座標的位置（sim (6.5, -2.9) → three (x, h, -y)）*/
const SUN_POS = new THREE.Vector3(6.5, 0, 2.9)
const tmpV = new THREE.Vector3()

function planetModel(radius: number, base: string, atmo: string, extra?: (g: THREE.Group) => (t: number) => void): ModelView {
  const p = makePlanet(radius, base, atmo, new THREE.Vector3(1, 0.3, 0))
  const root = new THREE.Group()
  root.add(p.mesh)
  const tick = extra?.(root)
  const mats = p.mesh.children.map((c) => (c as THREE.Mesh).material as THREE.ShaderMaterial)
  return {
    root,
    height: radius * 2,
    update: (t) => {
      p.update(t)
      tick?.(t)
      // 光照方向跟著恆星走（星體會公轉）
      root.getWorldPosition(tmpV)
      const dir = SUN_POS.clone().sub(tmpV).normalize()
      for (const m of mats) m.uniforms.uSun?.value.copy(dir)
    },
  }
}

regModel('station.verdance', (def) => planetModel(def?.radius ?? 4, '#4f7a58', '#b9a6ff'))

regModel('station.cinder', (def) =>
  planetModel(def?.radius ?? 2, '#58504a', '#2b2a33', (g) => {
    // 環形光：重力場的指示環
    const r = def?.radius ?? 2
    const ring = new THREE.Mesh(new THREE.TorusGeometry(r * 1.45, 0.05, 8, 96), Mat.emissive('#9fe7ff', 2.2))
    ring.rotation.x = Math.PI / 2.3
    const ring2 = new THREE.Mesh(new THREE.TorusGeometry(r * 1.7, 0.025, 6, 96), Mat.emissive('#c9b6ff', 1.4))
    ring2.rotation.x = Math.PI / 2.1
    g.add(ring, ring2)
    return (t) => {
      ring.rotation.z = t * 0.15
      ring2.rotation.z = -t * 0.09
    }
  }),
)

regModel('station.uo', (def) => {
  const r = def?.radius ?? 2
  const root = new THREE.Group()
  // 扭結的有機外殼＋內部發光：說不上是船還是生物
  const shell = new THREE.Mesh(new THREE.TorusKnotGeometry(r * 0.7, r * 0.22, 160, 16, 2, 3), Mat.organic('#3a2a4a', '#7dff9a'))
  shell.castShadow = true
  const core = new THREE.Mesh(new THREE.IcosahedronGeometry(r * 0.35, 2), Mat.emissive('#7dff9a', 3))
  const halo = new THREE.Mesh(new THREE.IcosahedronGeometry(r * 0.55, 1), Mat.emissive('#b26bff', 0.9))
  ;(halo.material as THREE.Material).transparent = true
  ;(halo.material as THREE.Material).opacity = 0.35
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
