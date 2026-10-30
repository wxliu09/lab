// 站內道具與設施模型（程序化組裝，正面朝 local +Z）
import * as THREE from 'three'
import { Batcher, box, cyl, rbox, sphere, torus } from './batch'
import { Mat } from './materials'
import { decalTex, screenTex } from './tex'

/** sim 朝向（0 = +x，π/2 = +y）→ three 的 rotY（讓 local +Z 對準該方向）*/
export function facingToRotY(a: number): number {
  return Math.atan2(Math.cos(a), -Math.sin(a))
}

export interface Animated {
  obj: THREE.Object3D
  update(t: number, dt: number): void
}

const VENDOR_COLORS: Record<string, string> = {
  medical: '#5cf2a5',
  suitA: '#ff5a4a',
  suitB: '#4aa8ff',
  suitC: '#33ffd1',
  suitD: '#ffc23d',
  outpost: '#9fe7ff',
  maintenance: '#ffb46b',
  fusion: '#ff7a2a',
  teleportFactory: '#b28cff',
  escapePod: '#ff3b3b',
  radar: '#ffc23d',
  lq: '#c0c8d0',
  gravity: '#7fd8ff',
}

/** 以朝向轉換 local 偏移 */
function at(cx: number, cz: number, rot: number, lx: number, lz: number): [number, number] {
  const c = Math.cos(rot)
  const s = Math.sin(rot)
  return [cx + lx * c + lz * s, cz - lx * s + lz * c]
}

// ───────── 房間道具（'x' 格）─────────

export function roomProp(b: Batcher, type: string, cx: number, cz: number, rot: number, seed: number, anim: Animated[], group: THREE.Group): void {
  const dark = Mat.metal('#3a4048', 0.7)
  const mid = Mat.metal('#6a747e', 0.6)
  const light = Mat.paint('#c9d1d8', 0.45)
  const rubber = Mat.rubber()
  switch (type) {
    case 'quarters': {
      // 雙層床
      const fab = Mat.fabric(seed % 2 ? '#3d5a73' : '#5b4d6b')
      b.add(rbox(0.9, 0.1, 1.95, 0.03), mid, cx, 0.45, cz, rot)
      b.add(rbox(0.86, 0.14, 1.85, 0.06), fab, cx, 0.57, cz, rot)
      b.add(rbox(0.9, 0.1, 1.95, 0.03), mid, cx, 1.45, cz, rot)
      b.add(rbox(0.86, 0.14, 1.85, 0.06), fab, cx, 1.57, cz, rot)
      for (const [lx, lz] of [[-0.42, -0.92], [0.42, -0.92], [-0.42, 0.92], [0.42, 0.92]]) {
        const [px, pz] = at(cx, cz, rot, lx, lz)
        b.add(box(0.06, 1.8, 0.06), dark, px, 0.9, pz, rot)
      }
      const [px, pz] = at(cx, cz, rot, 0, -0.7)
      b.add(rbox(0.5, 0.1, 0.3, 0.04), Mat.fabric('#d8d8d0'), px, 0.68, pz, rot)
      break
    }
    case 'medbay': {
      // 病床＋監視器
      b.add(rbox(0.8, 0.12, 1.9, 0.04), light, cx, 0.7, cz, rot)
      b.add(rbox(0.76, 0.1, 1.8, 0.06), Mat.fabric('#e8eef0'), cx, 0.8, cz, rot)
      b.add(box(0.6, 0.6, 1.4), mid, cx, 0.35, cz, rot)
      const [mx, mz] = at(cx, cz, rot, 0.55, -0.8)
      b.add(cyl(0.025, 0.025, 1.6), dark, mx, 0.8, mz)
      b.add(rbox(0.36, 0.26, 0.05, 0.02), dark, mx, 1.55, mz, rot)
      const scr = new THREE.Mesh(new THREE.PlaneGeometry(0.3, 0.2), Mat.screen(screenTex('ui', '#5cf2a5', seed), 2))
      scr.position.set(mx, 1.55, mz)
      scr.rotation.y = rot
      scr.translateZ(0.03)
      group.add(scr)
      break
    }
    case 'lab': {
      // 培養槽：玻璃圓筒＋發光液體＋懸浮標本
      b.add(cyl(0.55, 0.62, 0.35, 24), dark, cx, 0.17, cz)
      b.add(cyl(0.55, 0.55, 0.25, 24), dark, cx, 2.1, cz)
      b.add(torus(0.52, 0.04, 6, 24), Mat.emissive('#33ffd1', 2.5), cx, 0.37, cz, 0, 1, 1, 1, Math.PI / 2)
      const liquid = new THREE.Mesh(cyl(0.47, 0.47, 1.6, 24), Mat.liquid(seed % 3 === 0 ? '#7a3cff' : '#33d1a0'))
      liquid.position.set(cx, 1.15, cz)
      group.add(liquid)
      const glass = new THREE.Mesh(cyl(0.5, 0.5, 1.7, 28, true), Mat.glass('#bfe8ff', 0.18))
      glass.position.set(cx, 1.15, cz)
      group.add(glass)
      const spec = new THREE.Mesh(new THREE.IcosahedronGeometry(0.22, 1), Mat.skin(seed % 2 ? '#5a3c6e' : '#6e5a3c'))
      spec.position.set(cx, 1.2, cz)
      group.add(spec)
      anim.push({ obj: spec, update: (t) => ((spec.position.y = 1.2 + Math.sin(t * 0.7 + seed) * 0.08), (spec.rotation.y = t * 0.2)) })
      break
    }
    case 'bridge': {
      // 操作席：斜面控制台＋螢幕
      b.add(rbox(1.0, 0.85, 0.7, 0.06), dark, cx, 0.42, cz, rot)
      b.add(rbox(1.0, 0.08, 0.55, 0.03), mid, cx, 0.92, cz, rot, 1, 1, 1, -0.35)
      const scr = new THREE.Mesh(new THREE.PlaneGeometry(0.85, 0.42), Mat.screen(screenTex(seed % 2 ? 'radar' : 'ui', '#7fd8ff', seed), 1.8))
      scr.position.set(cx, 0.97, cz)
      scr.rotation.set(-Math.PI / 2 + 0.35, 0, 0, 'YXZ')
      scr.rotation.y = rot
      group.add(scr)
      break
    }
    case 'commissary': {
      b.add(rbox(0.95, 1.0, 0.95, 0.05), Mat.paint('#2b3238', 0.4), cx, 0.5, cz, rot)
      b.add(box(0.98, 0.04, 0.98), Mat.emissive('#ffb46b', 1.2), cx, 1.0, cz, rot)
      break
    }
    case 'power': {
      // 發電機：圓柱線圈＋警示
      b.add(cyl(0.42, 0.46, 1.4, 20), dark, cx, 0.7, cz)
      for (let i = 0; i < 4; i++) b.add(torus(0.44, 0.035, 6, 20), mid, cx, 0.3 + i * 0.3, cz, 0, 1, 1, 1, Math.PI / 2)
      const core = new THREE.Mesh(cyl(0.12, 0.12, 0.2, 12), Mat.emissive('#ffb46b', 4))
      core.position.set(cx, 1.5, cz)
      group.add(core)
      anim.push({ obj: core, update: (t) => (core.scale.y = 1 + Math.sin(t * 6 + seed) * 0.2) })
      break
    }
    case 'hangar':
    case 'closet':
    case 'dronebay':
    case 'pods':
    case 'gitlab':
    default: {
      // 貨箱堆
      const crateMat = seed % 3 === 0 ? Mat.paint('#7a6a3a', 0.55) : seed % 3 === 1 ? Mat.paint('#3e5a4a', 0.55) : Mat.metal('#56606a')
      b.add(rbox(0.92, 0.8, 0.92, 0.05), crateMat, cx, 0.4, cz, rot + (seed % 5) * 0.08)
      b.add(box(0.94, 0.08, 0.2), dark, cx, 0.4, cz, rot)
      if (seed % 2 === 0) b.add(rbox(0.6, 0.5, 0.6, 0.04), Mat.paint('#8a7a4a', 0.55), cx + 0.05, 1.05, cz - 0.03, rot + 0.4)
      b.add(box(0.94, 0.02, 0.94), rubber, cx, 0.01, cz, rot)
      break
    }
  }
}

// ───────── 設施（POI）─────────

export interface PoiModel {
  root: THREE.Group
  anim: Animated[]
  /** 地面互動光圈顏色 */
  ring?: string
}

function screenMesh(w: number, h: number, kind: 'ui' | 'radar' | 'dna' | 'vendor' | 'warn', color: string, seed: number, intensity = 1.8): THREE.Mesh {
  return new THREE.Mesh(new THREE.PlaneGeometry(w, h), Mat.screen(screenTex(kind, color, seed), intensity))
}

export function poiModel(kind: string, ref: string | undefined, seed: number): PoiModel {
  const root = new THREE.Group()
  const anim: Animated[] = []
  const dark = Mat.metal('#2e343b', 0.75)
  const mid = Mat.metal('#67717b', 0.65)
  const shell = Mat.paint('#c4ccd3', 0.42)
  const add = (g: THREE.BufferGeometry, m: THREE.Material, x: number, y: number, z: number, rx = 0, ry = 0, rz = 0) => {
    const mesh = new THREE.Mesh(g, m)
    mesh.position.set(x, y, z)
    mesh.rotation.set(rx, ry, rz)
    mesh.castShadow = true
    mesh.receiveShadow = true
    root.add(mesh)
    return mesh
  }
  switch (kind) {
    case 'vendor': {
      const col = VENDOR_COLORS[ref ?? ''] ?? '#9fe7ff'
      add(rbox(0.95, 2.05, 0.75, 0.06), shell, 0, 1.025, 0)
      add(rbox(1.0, 0.12, 0.8, 0.04), dark, 0, 0.06, 0)
      add(rbox(1.0, 0.18, 0.8, 0.05), dark, 0, 2.05, 0)
      // 正面凹槽與彩色側條
      add(box(0.78, 1.3, 0.04), dark, 0, 1.25, 0.37)
      add(box(0.05, 1.9, 0.05), Mat.emissive(col, 2.4), -0.47, 1.05, 0.36)
      add(box(0.05, 1.9, 0.05), Mat.emissive(col, 2.4), 0.47, 1.05, 0.36)
      const scr = screenMesh(0.7, 0.55, 'vendor', col, seed)
      scr.position.set(0, 1.55, 0.395)
      root.add(scr)
      // 商品格（玻璃後面）
      for (let r = 0; r < 2; r++)
        for (let c = 0; c < 3; c++) add(rbox(0.18, 0.18, 0.12, 0.03), Mat.paint(col, 0.4), -0.22 + c * 0.22, 0.85 + r * 0.25, 0.3)
      const glass = new THREE.Mesh(new THREE.PlaneGeometry(0.72, 0.6), Mat.glass('#cfeaff', 0.16))
      glass.position.set(0, 0.97, 0.39)
      root.add(glass)
      add(box(0.5, 0.12, 0.08), dark, 0, 0.45, 0.38)
      anim.push({ obj: scr, update: (t) => ((scr.material as THREE.MeshStandardMaterial).emissiveIntensity = 1.7 + Math.sin(t * 9 + seed) * 0.08) })
      return { root, anim, ring: col }
    }
    case 'console': {
      // 駕駛控制台：環形工作站＋全像桌
      add(cyl(0.75, 0.9, 0.85, 28), dark, 0, 0.42, 0)
      add(cyl(0.8, 0.8, 0.06, 28), mid, 0, 0.86, 0)
      add(torus(0.78, 0.03, 6, 32), Mat.emissive('#7fd8ff', 3), 0, 0.9, 0, Math.PI / 2)
      const holo = new THREE.Mesh(new THREE.IcosahedronGeometry(0.35, 2), new THREE.MeshBasicMaterial({ color: '#7fd8ff', wireframe: true, transparent: true, opacity: 0.55 }))
      holo.position.y = 1.45
      root.add(holo)
      const disc = screenMesh(1.1, 1.1, 'radar', '#7fd8ff', seed, 1.3)
      disc.rotation.x = -Math.PI / 2
      disc.position.y = 0.9
      root.add(disc)
      anim.push({ obj: holo, update: (t) => ((holo.rotation.y = t * 0.6), (holo.rotation.x = Math.sin(t * 0.4) * 0.3)) })
      anim.push({ obj: disc, update: (t) => (disc.rotation.z = t * 0.25) })
      return { root, anim, ring: '#7fd8ff' }
    }
    case 'consoleBroken': {
      add(cyl(0.75, 0.9, 0.85, 28), Mat.metal('#2a2a2a', 0.5), 0, 0.42, 0)
      add(cyl(0.8, 0.8, 0.06, 28), Mat.metal('#3a3330', 0.5), 0, 0.86, 0, 0.1, 0, 0.08)
      return { root, anim }
    }
    case 'powerConsole': {
      add(rbox(1.4, 1.1, 0.8, 0.06), dark, 0, 0.55, 0)
      for (let i = 0; i < 4; i++) {
        const col = ['#9fe7ff', '#ffb46b', '#ffc23d', '#b28cff'][i]
        add(rbox(0.26, 0.08, 0.26, 0.03), Mat.emissive(col, 2.2), -0.48 + i * 0.32, 1.13, 0.1)
      }
      const scr = screenMesh(1.2, 0.5, 'ui', '#ffb46b', seed)
      scr.position.set(0, 0.75, 0.41)
      root.add(scr)
      add(cyl(0.05, 0.05, 1.2, 8), mid, -0.65, 1.6, -0.3)
      add(cyl(0.05, 0.05, 1.2, 8), mid, 0.65, 1.6, -0.3)
      return { root, anim, ring: '#ffb46b' }
    }
    case 'git': {
      // 基因完整性檢測儀：大型圓柱＋全像 DNA
      add(cyl(1.05, 1.2, 0.5, 32), dark, 0, 0.25, 0)
      add(cyl(0.8, 0.95, 1.4, 32), shell, 0, 1.2, 0)
      add(cyl(0.95, 0.8, 0.3, 32), dark, 0, 2.05, 0)
      add(torus(1.0, 0.05, 8, 40), Mat.emissive('#33ffd1', 3), 0, 0.52, 0, Math.PI / 2)
      add(torus(0.9, 0.04, 8, 40), Mat.emissive('#33ffd1', 2), 0, 2.22, 0, Math.PI / 2)
      for (let i = 0; i < 6; i++) {
        const a = (i / 6) * Math.PI * 2
        add(rbox(0.12, 1.3, 0.12, 0.04), mid, Math.cos(a) * 0.88, 1.2, Math.sin(a) * 0.88)
      }
      const dna = new THREE.Group()
      const dnaMat = new THREE.MeshBasicMaterial({ color: '#33ffd1', transparent: true, opacity: 0.85 })
      const rungMat = new THREE.MeshBasicMaterial({ color: '#9fe7ff', transparent: true, opacity: 0.4 })
      for (let i = 0; i < 18; i++) {
        const y = i * 0.07
        const a = i * 0.55
        const s1 = new THREE.Mesh(sphere(0.035, 8, 6), dnaMat)
        s1.position.set(Math.cos(a) * 0.22, y, Math.sin(a) * 0.22)
        const s2 = new THREE.Mesh(sphere(0.035, 8, 6), dnaMat)
        s2.position.set(-Math.cos(a) * 0.22, y, -Math.sin(a) * 0.22)
        const rung = new THREE.Mesh(box(0.44, 0.012, 0.012), rungMat)
        rung.position.set(0, y, 0)
        rung.rotation.y = -a
        dna.add(s1, s2, rung)
      }
      dna.position.y = 2.35
      root.add(dna)
      anim.push({ obj: dna, update: (t) => (dna.rotation.y = t * 0.8) })
      return { root, anim, ring: '#33ffd1' }
    }
    case 'regenerator': {
      add(cyl(0.45, 0.55, 0.3, 24), dark, 0, 0.15, 0)
      add(cyl(0.12, 0.12, 1.8, 12), mid, 0, 1.2, 0)
      const rings: THREE.Mesh[] = []
      for (let i = 0; i < 3; i++) rings.push(add(torus(0.35 - i * 0.05, 0.03, 6, 28), Mat.emissive('#5cf2a5', 3), 0, 0.7 + i * 0.5, 0, Math.PI / 2))
      anim.push({ obj: root, update: (t) => rings.forEach((r, i) => ((r.position.y = 0.6 + ((t * 0.4 + i / 3) % 1) * 1.6), r.scale.setScalar(1 - ((t * 0.4 + i / 3) % 1) * 0.3))) })
      return { root, anim, ring: '#5cf2a5' }
    }
    case 'rummageBox': {
      add(rbox(0.9, 0.7, 0.7, 0.05), Mat.paint('#5d6a3a', 0.6), 0, 0.35, 0)
      add(box(0.92, 0.06, 0.72), dark, 0, 0.71, 0)
      add(box(0.25, 0.1, 0.02), Mat.emissive('#ffc23d', 1.5), 0, 0.5, 0.36)
      return { root, anim }
    }
    case 'droneControl': {
      const ring = new THREE.Mesh(new THREE.RingGeometry(0.55, 0.75, 40), new THREE.MeshBasicMaterial({ map: decalTex('ring', '#ffc23d'), transparent: true, depthWrite: false }))
      ring.rotation.x = -Math.PI / 2
      ring.position.y = 0.02
      root.add(ring)
      anim.push({ obj: ring, update: (t) => (ring.rotation.z = t * 0.5) })
      return { root, anim }
    }
    case 'enhancer': {
      add(cyl(0.3, 0.4, 1.2, 16), shell, 0, 0.6, 0)
      add(sphere(0.18), Mat.emissive('#b28cff', 2.5), 0, 1.35, 0)
      return { root, anim, ring: '#b28cff' }
    }
    case 'pad': {
      const decal = new THREE.Mesh(new THREE.PlaneGeometry(5, 5), new THREE.MeshStandardMaterial({ map: decalTex('pad', '#ffc23d'), transparent: true, depthWrite: false, roughness: 0.8 }))
      decal.rotation.x = -Math.PI / 2
      decal.position.y = 0.015
      root.add(decal)
      for (let i = 0; i < 8; i++) {
        const a = (i / 8) * Math.PI * 2
        const l = add(sphere(0.06, 8, 6), Mat.emissive('#ffc23d', 3), Math.cos(a) * 2.6, 0.05, Math.sin(a) * 2.6)
        anim.push({ obj: l, update: (t) => l.scale.setScalar(0.6 + 0.4 * Math.max(0, Math.sin(t * 3 - i * 0.8))) })
      }
      return { root, anim }
    }
    default: {
      add(rbox(0.8, 1.2, 0.6, 0.05), shell, 0, 0.6, 0)
      return { root, anim }
    }
  }
}
