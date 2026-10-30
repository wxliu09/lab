// 站內道具與設施模型（程序化組裝，正面朝 local +Z）
import * as THREE from 'three'
import { Batcher, box, cyl, rbox, sphere, torus } from './batch'
import { Mat, withFog } from './materials'
import { decalTex, glyphTex, screenTex } from './tex'

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
  maintenanceB: '#b6ff6a',
}

/** 以朝向轉換 local 偏移 */
function at(cx: number, cz: number, rot: number, lx: number, lz: number): [number, number] {
  const c = Math.cos(rot)
  const s = Math.sin(rot)
  return [cx + lx * c + lz * s, cz - lx * s + lz * c]
}

// ───────── 房間道具（'x' 格）─────────

export function roomProp(b: Batcher, type: string, cx: number, cz: number, rot: number, seed: number, anim: Animated[], group: THREE.Group): void {
  const extra = EXTRA_PROPS[type]
  if (extra) {
    extra({ b, cx, cz, rot, seed, anim, group })
    return
  }
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
  if (MARKER_KINDS.has(kind) || /^specimen\d$/.test(kind)) return { root: new THREE.Group(), anim: [] }
  const extra = EXTRA_POIS[kind] ?? (kind === 'vendor' ? SPECIAL_VENDORS[ref ?? ''] : undefined)
  if (extra) return extra(ref, seed)
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

// ═════════════════════════════════════════════════════════════════
// 其餘地點的房間道具與設施（裁決者號、天守、七號廢站、豪勇號、火口號、活體庫號、擺渡號、
// 翠原星、餘燼衛星、未識別物體、海盜船）。美術聖經 §3.3、§6、§7。
// ═════════════════════════════════════════════════════════════════

interface PropCtx {
  b: Batcher
  cx: number
  cz: number
  /** 背對牆的朝向：local +Z 指向房間內、-Z 靠牆 */
  rot: number
  seed: number
  anim: Animated[]
  group: THREE.Group
}

const _m4 = new THREE.Matrix4()
const _q = new THREE.Quaternion()
const _e = new THREE.Euler(0, 0, 0, 'YXZ')
const _p = new THREE.Vector3()
const _s = new THREE.Vector3()

/** 以 local 偏移放一個零件（旋轉順序 YXZ：先轉向、再沿 local 軸傾斜）*/
function part(c: PropCtx, geo: THREE.BufferGeometry, mat: THREE.Material, lx: number, y: number, lz: number, ry = 0, rx = 0, rz = 0, sx = 1, sy = 1, sz = 1): void {
  const [x, z] = at(c.cx, c.cz, c.rot, lx, lz)
  _e.set(rx, c.rot + ry, rz, 'YXZ')
  _q.setFromEuler(_e)
  _m4.compose(_p.set(x, y, z), _q, _s.set(sx, sy, sz))
  c.b.addMatrix(geo, mat, _m4)
}

/** 動態零件：獨立 Mesh（要做動畫的才用）*/
function live(c: PropCtx, geo: THREE.BufferGeometry, mat: THREE.Material, lx: number, y: number, lz: number, ry = 0, rx = 0, rz = 0): THREE.Mesh {
  const m = new THREE.Mesh(geo, mat)
  const [x, z] = at(c.cx, c.cz, c.rot, lx, lz)
  m.position.set(x, y, z)
  m.rotation.order = 'YXZ'
  m.rotation.set(rx, c.rot + ry, rz)
  m.castShadow = true
  c.group.add(m)
  return m
}

/** 0..1 的穩定亂數（每個道具不同）*/
function rnd01(seed: number, k: number): number {
  const v = Math.sin(seed * 127.1 + k * 311.7) * 43758.5453
  return v - Math.floor(v)
}

// 共用脈動材質：同一個 anim 陣列（= 同一座站）只註冊一次更新
const pulseCache = new Map<string, THREE.MeshStandardMaterial>()
const pulseReg = new WeakMap<Animated[], Set<string>>()
function pulse(anim: Animated[], color: string, base = 2.2, amp = 1.2, speed = 2.4, phase = 0): THREE.MeshStandardMaterial {
  const key = `${color}:${base}:${amp}:${speed}:${phase}`
  let m = pulseCache.get(key)
  if (!m) {
    m = withFog(new THREE.MeshStandardMaterial({ color: '#000', emissive: color, emissiveIntensity: base, roughness: 0.4 }))
    pulseCache.set(key, m)
  }
  let reg = pulseReg.get(anim)
  if (!reg) pulseReg.set(anim, (reg = new Set()))
  if (!reg.has(key)) {
    reg.add(key)
    const mat = m
    anim.push({ obj: new THREE.Object3D(), update: (t) => (mat.emissiveIntensity = base + Math.sin(t * speed + phase) * amp) })
  }
  return m
}

/** 不規則岩塊（每個 seed 形狀不同，快取）*/
const rockGeoCache = new Map<string, THREE.BufferGeometry>()
function rockGeo(seed: number, r: number, detail = 1, flat = 0.7): THREE.BufferGeometry {
  const key = `${seed % 8}:${r}:${detail}:${flat}`
  let g = rockGeoCache.get(key)
  if (g) return g
  g = new THREE.IcosahedronGeometry(r, detail)
  const pos = g.attributes.position
  const v = new THREE.Vector3()
  for (let i = 0; i < pos.count; i++) {
    v.fromBufferAttribute(pos, i)
    const n = 0.78 + 0.32 * Math.abs(Math.sin(v.x * 4.1 + seed) * Math.cos(v.z * 3.3 - seed * 0.7) + 0.4 * Math.sin(v.y * 5.7 + seed * 1.3))
    v.multiplyScalar(n)
    v.y *= flat
    pos.setXYZ(i, v.x, v.y, v.z)
  }
  g.computeVertexNormals()
  g.userData.shared = true
  rockGeoCache.set(key, g)
  return g
}

/** 貼地的發光光暈（additive，不寫深度）*/
function glowDecal(group: THREE.Object3D, color: string, size: number, x: number, z: number, opacity = 0.35, y = 0.02): THREE.Mesh {
  const m = new THREE.Mesh(
    new THREE.PlaneGeometry(size, size),
    new THREE.MeshBasicMaterial({ map: decalTex('glow', color), transparent: true, opacity, depthWrite: false, blending: THREE.AdditiveBlending }),
  )
  m.rotation.x = -Math.PI / 2
  m.position.set(x, y, z)
  group.add(m)
  return m
}

const ALONG_X = Math.PI / 2 // rz：把 Y 軸的圓柱放倒成 local X 方向
const ALONG_Z = Math.PI / 2 // rx：放倒成 local Z 方向

type PropFn = (c: PropCtx) => void

const EXTRA_PROPS: Record<string, PropFn> = {
  // ───── 裁決者號 ─────
  radar(c) {
    // 雷達示波台：琥珀色圓形掃描幕
    const navy = Mat.metal('#26324a', 0.7)
    const dark = Mat.metal('#1a2232', 0.75)
    part(c, rbox(0.9, 0.9, 0.6, 0.05), navy, 0, 0.45, -0.12)
    part(c, rbox(0.92, 0.07, 0.56, 0.03), dark, 0, 0.93, -0.05, 0, 0.45)
    const scope = live(c, new THREE.CircleGeometry(0.22, 32), Mat.screen(screenTex('radar', '#ffb000', c.seed), 2.2), 0, 0.975, -0.02, 0, -Math.PI / 2 + 0.45)
    scope.castShadow = false
    c.anim.push({ obj: scope, update: (t) => (scope.rotation.z = t * 1.4 + c.seed) })
    part(c, torus(0.23, 0.02, 6, 28), Mat.metal('#8ea0bd', 0.6, false), 0, 0.975, -0.02, 0, -Math.PI / 2 + 0.45)
    for (let i = 0; i < 3; i++) part(c, cyl(0.03, 0.03, 0.04, 10), Mat.emissive(i === 1 ? '#4aa8ff' : '#ffb000', 2.4), -0.33 + i * 0.05, 0.96, 0.12, 0, 0.45)
    part(c, cyl(0.04, 0.04, 0.9, 8), dark, 0.38, 0.45, -0.38)
  },
  comms(c) {
    // 伺服器機櫃：藍琥珀 LED 列
    const body = Mat.metal('#1f2838', 0.7)
    const face = Mat.metal('#121824', 0.6, false)
    const h = 1.7 + rnd01(c.seed, 1) * 0.4
    part(c, rbox(0.86, h, 0.7, 0.04), body, 0, h / 2, -0.12)
    part(c, box(0.72, h - 0.2, 0.02), face, 0, h / 2, 0.235)
    const cols = ['#ffb000', '#4aa8ff', '#5cf2a5', '#ffb000']
    for (let i = 0; i < 8; i++) {
      const w = 0.2 + rnd01(c.seed, i + 3) * 0.4
      const col = cols[(i + c.seed) % 4]
      const m = i % 3 === 0 ? pulse(c.anim, col, 2.4, 1.6, 5 + (i % 4), i) : Mat.emissive(col, 2.2)
      part(c, box(w, 0.025, 0.02), m, -0.3 + w / 2, 0.25 + i * ((h - 0.45) / 8), 0.25)
    }
    part(c, box(0.9, 0.06, 0.3), Mat.metal('#3a4458', 0.6), 0, h + 0.03, -0.2)
    for (let i = 0; i < 3; i++) part(c, cyl(0.025, 0.025, 0.9, 6), Mat.rubber('#151820'), -0.2 + i * 0.12, h + 0.09, -0.2, 0, 0, ALONG_X)
  },
  foundry(c) {
    const dark = Mat.metal('#2c3038', 0.75)
    const shell = Mat.paint('#d6d4cc', 0.4)
    const amber = Mat.emissive('#ffb000', 2.6)
    if (c.seed % 2 === 0) {
      // 機械手臂：慢速巡迴
      part(c, cyl(0.34, 0.4, 0.28, 20), dark, 0, 0.14, 0)
      part(c, torus(0.36, 0.035, 6, 24), Mat.paint('#ffb000', 0.5), 0, 0.29, 0, 0, Math.PI / 2)
      const arm = new THREE.Group()
      const [ax, az] = at(c.cx, c.cz, c.rot, 0, 0)
      arm.position.set(ax, 0.3, az)
      const mk = (g: THREE.BufferGeometry, m: THREE.Material, x: number, y: number, z: number, rx = 0) => {
        const mesh = new THREE.Mesh(g, m)
        mesh.position.set(x, y, z)
        mesh.rotation.x = rx
        mesh.castShadow = true
        arm.add(mesh)
        return mesh
      }
      mk(cyl(0.16, 0.18, 0.3, 16), shell, 0, 0.15, 0)
      mk(rbox(0.16, 0.95, 0.16, 0.04), shell, 0, 0.7, 0.18, 0.4)
      mk(rbox(0.13, 0.7, 0.13, 0.04), dark, 0, 1.12, 0.62, -0.9)
      mk(box(0.22, 0.06, 0.12), dark, 0, 0.88, 0.95)
      mk(box(0.05, 0.05, 0.05), amber, 0, 1.2, 0.5)
      c.group.add(arm)
      c.anim.push({ obj: arm, update: (t) => (arm.rotation.y = c.rot + Math.sin(t * 0.5 + c.seed) * 1.1) })
    } else {
      // 仿生人外殼吊架
      part(c, box(0.06, 2.1, 0.06), dark, -0.42, 1.05, -0.3)
      part(c, box(0.06, 2.1, 0.06), dark, 0.42, 1.05, -0.3)
      part(c, box(0.92, 0.07, 0.08), dark, 0, 2.08, -0.3)
      for (const lx of [-0.2, 0.2]) {
        part(c, sphere(0.13, 14, 10), shell, lx, 1.72, -0.25, 0, 0, 0, 1, 1.15, 0.95)
        part(c, rbox(0.3, 0.42, 0.2, 0.08), shell, lx, 1.36, -0.25)
        part(c, box(0.16, 0.025, 0.02), amber, lx, 1.74, -0.13)
        part(c, cyl(0.012, 0.012, 0.25, 6), dark, lx, 1.95, -0.25)
      }
      part(c, rbox(0.8, 0.25, 0.45, 0.04), Mat.paint('#5a6470', 0.5), 0, 0.12, 0.05)
    }
  },
  cargo(c) {
    const paints = ['#6a5a3a', '#3e5a6a', '#7a3a2e', '#4a5a3a', '#5a5f68']
    const body = Mat.paint(paints[c.seed % paints.length], 0.6)
    const rib = Mat.metal('#2c3034', 0.6, false)
    part(c, box(0.98, 0.1, 0.98), Mat.paint('#6b5236', 0.8), 0, 0.05, 0)
    part(c, rbox(0.92, 0.86, 0.9, 0.03), body, 0, 0.53, 0, (c.seed % 3) * 0.04)
    for (const lx of [-0.3, -0.1, 0.1, 0.3]) part(c, box(0.04, 0.82, 0.93), rib, lx, 0.53, 0, (c.seed % 3) * 0.04)
    part(c, box(0.3, 0.14, 0.01), Mat.paint('#e4e2da', 0.5), 0.15, 0.7, 0.456)
    if (c.seed % 3 !== 1) part(c, rbox(0.6, 0.45, 0.6, 0.03), Mat.paint(paints[(c.seed + 2) % paints.length], 0.6), -0.05, 1.19, 0.02, 0.35)
  },
  // ───── 天守砲台 ─────
  cannon(c) {
    // 能量導管：直管＋脈動線圈＋接線盒
    const iron = Mat.metal('#5a524b', 0.75)
    const coil = pulse(c.anim, '#ff7a2a', 2.2, 1.6, 2.2, (c.seed % 3) * 0.9)
    part(c, cyl(0.15, 0.15, 2.35, 14), iron, 0, 1.17, -0.3)
    for (const y of [0.5, 0.95, 1.4]) part(c, torus(0.19, 0.04, 6, 20), coil, 0, y, -0.3, 0, Math.PI / 2)
    part(c, cyl(0.17, 0.17, 1.0, 14), iron, 0, 2.05, -0.36, 0, 0, ALONG_X)
    part(c, box(1.0, 0.03, 0.05), coil, 0, 2.05, -0.17)
    part(c, rbox(0.42, 0.5, 0.24, 0.04), Mat.metal('#24211f', 0.7), 0.3, 0.85, -0.22)
    part(c, box(0.1, 0.1, 0.02), Mat.emissive('#ffb000', 3), 0.3, 0.98, -0.095)
    part(c, box(0.62, 0.05, 0.5), Mat.metal('#2a2624', 0.7), 0, 0.025, -0.18)
    part(c, box(0.62, 0.012, 0.04), Mat.paint('#ffc23d', 0.6), 0, 0.055, 0.07)
  },
  reactor(c) {
    // 電容柱：鐵灰圓柱＋五圈脈動線圈＋籠架
    const iron = Mat.metal('#2a2624', 0.8)
    const coil = pulse(c.anim, '#ff7a2a', 2.4, 1.8, 3, c.seed * 0.7)
    part(c, cyl(0.44, 0.52, 0.25, 22), iron, 0, 0.12, 0)
    part(c, cyl(0.27, 0.27, 2.05, 18), Mat.metal('#4a4440', 0.7), 0, 1.25, 0)
    for (let i = 0; i < 5; i++) part(c, torus(0.31, 0.05, 6, 22), coil, 0, 0.55 + i * 0.33, 0, 0, Math.PI / 2)
    for (let i = 0; i < 4; i++) {
      const a = (i / 4) * Math.PI * 2 + Math.PI / 4
      part(c, box(0.05, 2.1, 0.05), iron, Math.cos(a) * 0.42, 1.2, Math.sin(a) * 0.42)
    }
    part(c, cyl(0.36, 0.3, 0.14, 22), iron, 0, 2.3, 0)
    part(c, sphere(0.1, 12, 8), coil, 0, 2.4, 0)
  },
  armory(c) {
    const panel = Mat.metal('#3a3f45', 0.7)
    const gun = Mat.metal('#1d2024', 0.6, false)
    part(c, rbox(0.95, 1.8, 0.1, 0.03), panel, 0, 0.95, -0.42)
    part(c, box(0.9, 0.06, 0.2), panel, 0, 0.35, -0.32)
    for (let i = 0; i < 3; i++) {
      const lx = -0.28 + i * 0.28
      part(c, box(0.07, 0.62, 0.14), gun, lx, 0.82, -0.3, 0, 0.06)
      part(c, cyl(0.02, 0.02, 0.45, 6), gun, lx, 1.35, -0.31, 0, 0.06)
      part(c, box(0.08, 0.2, 0.18), Mat.paint('#4a4038', 0.6), lx, 0.48, -0.29)
    }
    part(c, rbox(0.62, 0.3, 0.36, 0.03), Mat.paint('#4a5a3a', 0.6), 0, 0.15, 0.18)
    part(c, box(0.64, 0.05, 0.37), Mat.paint('#ffc23d', 0.6), 0, 0.22, 0.18)
    part(c, box(0.12, 0.05, 0.02), Mat.emissive('#ff3b3b', 3), 0, 1.8, -0.36)
  },
  // ───── 七號廢站 ─────
  derelict(c) {
    const rust = Mat.paint('#6e4a32', 0.85)
    const steel = Mat.metal('#4a3c32', 0.5)
    const conc = Mat.paint('#5a5048', 0.9)
    const k = c.seed % 4
    if (k === 0) {
      // 倒下的置物櫃
      part(c, rbox(1.7, 0.55, 0.5, 0.04), rust, 0, 0.28, 0, 0.3 + rnd01(c.seed, 1), 0, 0.08)
      part(c, box(0.02, 0.4, 0.4), steel, 0.5, 0.36, 0.26, 0.3 + rnd01(c.seed, 1))
    } else if (k === 1) {
      // 瓦礫堆
      for (let i = 0; i < 6; i++) {
        const sz = 0.18 + rnd01(c.seed, i) * 0.32
        part(c, rbox(sz, sz * 0.7, sz * 1.2, 0.03), i % 2 ? conc : rust, (rnd01(c.seed, i + 9) - 0.5) * 0.6, sz * 0.32 + (i > 3 ? 0.2 : 0), (rnd01(c.seed, i + 19) - 0.5) * 0.6, rnd01(c.seed, i + 4) * 3, rnd01(c.seed, i + 5), rnd01(c.seed, i + 6))
      }
      part(c, cyl(0.05, 0.05, 1.1, 8), steel, 0.1, 0.25, 0, 0.5, 0, 1.2)
    } else if (k === 2) {
      // 斷電的主控台＋漏電火花
      part(c, rbox(0.9, 0.85, 0.6, 0.05), Mat.metal('#3a332e', 0.6), 0, 0.42, -0.1, 0, 0, 0.12)
      part(c, box(0.8, 0.4, 0.02), Mat.metal('#0c0d0e', 0.3, false), 0, 0.8, 0.21, 0, -0.3, 0.12)
      for (let i = 0; i < 3; i++) part(c, cyl(0.015, 0.015, 0.8, 5), Mat.rubber('#111'), -0.2 + i * 0.15, 0.4, 0.3, 0, 0.6 + i * 0.3)
      const spark = live(c, sphere(0.05, 8, 6), Mat.emissive('#ffd27a', 6), -0.05, 0.12, 0.55)
      spark.castShadow = false
      c.anim.push({
        obj: spark,
        update: (t) => {
          const f = Math.sin(t * 23 + c.seed) * Math.sin(t * 7.3 + c.seed * 2)
          spark.visible = f > 0.55
          spark.scale.setScalar(0.6 + Math.random() * 0.8)
        },
      })
      glowDecal(c.group, '#ff9a3a', 0.9, ...at(c.cx, c.cz, c.rot, -0.05, 0.55), 0.18)
    } else {
      // 塌落的天花板＋垂下的電纜
      part(c, rbox(0.6, 0.5, 0.6, 0.03), rust, 0.15, 0.25, -0.1)
      part(c, rbox(1.1, 0.06, 0.9, 0.02), steel, -0.05, 0.38, 0.05, 0.2, 0.35, 0.1)
      for (let i = 0; i < 2; i++) part(c, cyl(0.02, 0.02, 1.6, 5), Mat.rubber('#16120f'), -0.3 + i * 0.4, 1.6, 0.25 - i * 0.2, 0, 0.15 - i * 0.3)
    }
  },
  // ───── 豪勇號 ─────
  engine(c) {
    const hull = Mat.metal('#3a3f45', 0.75)
    const glow = pulse(c.anim, '#ff5a3a', 2.4, 1.4, 1.8, c.seed)
    part(c, box(0.14, 0.45, 0.6), hull, -0.38, 0.22, 0)
    part(c, box(0.14, 0.45, 0.6), hull, 0.38, 0.22, 0)
    part(c, cyl(0.42, 0.42, 0.96, 22), Mat.metal('#4c535a', 0.7), 0, 0.68, 0, 0, 0, ALONG_X)
    for (const lx of [-0.48, 0.48]) part(c, torus(0.4, 0.05, 6, 24), glow, lx, 0.68, 0, Math.PI / 2, 0, 0)
    for (const lx of [-0.2, 0.2]) part(c, torus(0.43, 0.03, 6, 24), hull, lx, 0.68, 0, Math.PI / 2, 0, 0)
    part(c, cyl(0.06, 0.06, 1.3, 8), hull, -0.15, 1.15, -0.25, 0, 0.9)
    part(c, cyl(0.06, 0.06, 1.3, 8), hull, 0.15, 1.15, -0.25, 0, 0.9)
  },
  captain(c) {
    const wood = Mat.paint('#5a3e2e', 0.55)
    if (c.seed % 2) {
      part(c, rbox(1.0, 0.08, 0.6, 0.02), wood, 0, 0.76, 0)
      part(c, box(0.08, 0.72, 0.55), wood, -0.44, 0.36, 0)
      part(c, box(0.08, 0.72, 0.55), wood, 0.44, 0.36, 0)
      part(c, rbox(0.32, 0.22, 0.03, 0.01), Mat.metal('#1a1d20', 0.4, false), 0.2, 0.92, -0.15, 0, -0.2)
      const scr = live(c, new THREE.PlaneGeometry(0.28, 0.18), Mat.screen(screenTex('ui', '#ff5a4a', c.seed), 1.6), 0.2, 0.92, -0.13, 0, -0.2)
      scr.castShadow = false
      part(c, cyl(0.02, 0.05, 0.3, 8), Mat.metal('#b8a070', 0.4, false), -0.3, 0.95, -0.1)
      part(c, sphere(0.07, 10, 8), Mat.emissive('#ffd9a8', 2), -0.3, 1.12, -0.1)
    } else {
      part(c, rbox(0.95, 1.9, 0.35, 0.03), wood, 0, 0.95, -0.3)
      const bookCols = ['#7a2e2a', '#2e4a6a', '#3a5a3a', '#8a7a4a', '#4a3a5a']
      for (let sh = 0; sh < 4; sh++) {
        for (let i = 0; i < 6; i++) {
          const h = 0.2 + rnd01(c.seed, sh * 6 + i) * 0.12
          part(c, box(0.1, h, 0.22), Mat.paint(bookCols[(i + sh + c.seed) % 5], 0.6), -0.33 + i * 0.13, 0.25 + sh * 0.44 + h / 2, -0.2)
        }
      }
    }
  },
  dropbay(c) {
    // 空降艙：直立膠囊＋紅色警示環
    const shell = Mat.paint('#5d646b', 0.45)
    const red = pulse(c.anim, '#ff3b3b', 2, 1.6, 3.2, c.seed * 0.5)
    part(c, cyl(0.38, 0.38, 1.3, 20), shell, 0, 0.95, -0.05)
    part(c, sphere(0.38, 20, 10), shell, 0, 1.6, -0.05, 0, 0, 0, 1, 0.6, 1)
    part(c, cyl(0.42, 0.46, 0.3, 20), Mat.metal('#2a2e33', 0.7), 0, 0.15, -0.05)
    part(c, torus(0.39, 0.03, 6, 24), red, 0, 0.75, -0.05, 0, Math.PI / 2)
    part(c, rbox(0.34, 0.5, 0.06, 0.04), Mat.glass('#ff9a8a', 0.35), 0, 1.2, 0.32)
    part(c, box(0.9, 0.08, 0.12), Mat.metal('#2a2e33', 0.7), 0, 2.1, -0.3)
  },
  // ───── 火口號 ─────
  furnace(c) {
    // 坩堝爐：熔融金屬頂面閃爍、地面熱光
    const iron = Mat.metal('#2a2520', 0.8)
    const melt = pulse(c.anim, '#ff7a1a', 3, 1.2, 4.7, c.seed)
    part(c, cyl(0.46, 0.38, 0.95, 22, true), iron, 0, 0.48, 0)
    part(c, cyl(0.41, 0.41, 0.04, 22), melt, 0, 0.9, 0)
    part(c, torus(0.45, 0.07, 8, 26), Mat.metal('#5a4a3a', 0.6), 0, 0.95, 0, 0, Math.PI / 2)
    part(c, sphere(0.12, 10, 8), melt, 0.1, 0.93, -0.08, 0, 0, 0, 1.6, 0.35, 1.2)
    part(c, box(0.16, 0.08, 0.3), iron, 0, 0.9, 0.5)
    part(c, box(0.7, 0.06, 0.06), Mat.paint('#ffd23d', 0.5), 0, 0.3, 0.46)
    glowDecal(c.group, '#ff7a1a', 2.2, c.cx, c.cz, 0.28)
  },
  conveyor(c) {
    const frame = Mat.metal('#4a4538', 0.7)
    if (c.rot === 0) {
      // 輸送帶（房間中央的 x 列，沿 local X）：礦石在帶上移動
      part(c, box(1.0, 0.1, 0.72), frame, 0, 0.55, 0)
      part(c, box(1.0, 0.035, 0.6), Mat.rubber('#16171a'), 0, 0.62, 0)
      for (const lz of [-0.36, 0.36]) part(c, box(1.0, 0.14, 0.05), Mat.paint('#ffc23d', 0.5), 0, 0.66, lz)
      for (const lz of [-0.3, 0.3]) part(c, box(0.08, 0.5, 0.08), frame, 0, 0.25, lz)
      part(c, cyl(0.05, 0.05, 0.62, 8), Mat.metal('#8a8a80', 0.6, false), 0.45, 0.6, 0, 0, ALONG_Z)
      const ore = live(c, rockGeo(c.seed, 0.13, 0), Mat.rock('#6a5a48'), 0, 0.72, 0)
      const ph = rnd01(c.seed, 2)
      c.anim.push({ obj: ore, update: (t) => ((ore.position.x = c.cx + (((t * 0.35 + ph) % 1) - 0.5)), (ore.rotation.y = t * 0.3)) })
    } else {
      // 牆邊礦石箱
      part(c, rbox(0.9, 0.55, 0.7, 0.03), Mat.paint('#8c7a46', 0.6), 0, 0.28, -0.1)
      for (let i = 0; i < 4; i++) part(c, rockGeo(c.seed + i, 0.16, 0), Mat.rock('#5a4a3a'), -0.25 + i * 0.17, 0.6, -0.1 + (i % 2) * 0.1)
    }
  },
  airlock(c) {
    // 艙外裝備櫃：玻璃門後的頭盔
    const body = Mat.paint(c.seed % 2 ? '#c9a23a' : '#8a96a4', 0.5)
    part(c, rbox(0.8, 2.0, 0.55, 0.04), body, 0, 1.0, -0.18)
    part(c, rbox(0.62, 1.5, 0.04, 0.02), Mat.glass('#cfeaff', 0.25), 0, 1.15, 0.1)
    part(c, sphere(0.16, 14, 10), Mat.paint('#e8e6df', 0.35), 0, 1.6, -0.05)
    part(c, box(0.24, 0.08, 0.02), Mat.emissive('#ffc23d', 1.8), 0, 1.62, 0.1)
    part(c, rbox(0.36, 0.55, 0.22, 0.08), Mat.paint('#d0cec6', 0.5), 0, 1.15, -0.08)
    part(c, box(0.1, 0.05, 0.02), Mat.emissive(c.seed % 3 ? '#5cf2a5' : '#ff3b3b', 2.6), 0.3, 1.95, 0.1)
  },
  // ───── 活體庫號 ─────
  cell(c) {
    const k = c.seed % 3
    if (k === 0) {
      // 草料捆
      part(c, rbox(0.8, 0.45, 0.5, 0.08), Mat.fabric('#b8a050'), 0, 0.23, 0, rnd01(c.seed, 1))
      for (const lx of [-0.2, 0.2]) part(c, box(0.03, 0.46, 0.52), Mat.rubber('#4a3a2a'), lx, 0.23, 0, rnd01(c.seed, 1))
    } else if (k === 1) {
      // 飼料槽：綠色營養液
      part(c, rbox(0.9, 0.35, 0.45, 0.04), Mat.metal('#5a6a62', 0.6), 0, 0.18, -0.15)
      const liq = live(c, box(0.8, 0.02, 0.36), Mat.liquid('#5cf2a5'), 0, 0.33, -0.15)
      liq.castShadow = false
    } else {
      // 長苔的石塊
      part(c, rockGeo(c.seed, 0.42, 1, 0.65), Mat.rock('#4a5a4e'), 0, 0.2, 0, rnd01(c.seed, 3) * 3)
    }
    // 潮濕地面的反光水漬
    const wet = live(c, new THREE.CircleGeometry(0.55 + rnd01(c.seed, 5) * 0.3, 20), Mat.glass('#2a4a3a', 0.35), 0.2, 0.012, 0.3, 0, -Math.PI / 2)
    wet.castShadow = false
  },
  // ───── 擺渡號 ─────
  teleport(c) {
    // 導能柱：頂端藍色能量球
    const base = Mat.metal('#2a3444', 0.75)
    const glow = pulse(c.anim, '#6fb8ff', 2.6, 1.4, 2, c.seed * 0.8)
    part(c, cyl(0.3, 0.38, 0.2, 20), base, 0, 0.1, 0)
    part(c, cyl(0.1, 0.17, 1.8, 4), Mat.metal('#5a6a80', 0.7), 0, 1.1, 0, Math.PI / 4)
    part(c, box(0.03, 1.4, 0.03), glow, 0, 1.0, 0.13)
    part(c, sphere(0.13, 16, 12), glow, 0, 2.1, 0)
    part(c, torus(0.22, 0.02, 6, 24), Mat.emissive('#9fe7ff', 2), 0, 2.1, 0, 0, Math.PI / 2)
    glowDecal(c.group, '#6fb8ff', 1.6, c.cx, c.cz, 0.3)
  },
  lounge(c) {
    // 候車長椅
    const fab = Mat.fabric(c.seed % 3 ? '#2d5a8a' : '#3a6a9a')
    const metal = Mat.metal('#6a747e', 0.6, false)
    part(c, rbox(0.96, 0.1, 0.5, 0.04), fab, 0, 0.45, 0.02)
    part(c, rbox(0.96, 0.42, 0.08, 0.04), fab, 0, 0.72, -0.22, 0, -0.12)
    part(c, box(0.06, 0.42, 0.06), metal, -0.4, 0.21, 0)
    part(c, box(0.06, 0.42, 0.06), metal, 0.4, 0.21, 0)
    part(c, box(0.96, 0.04, 0.06), metal, 0, 0.38, -0.2)
  },
  // ───── 翠原星（室外）─────
  grass(c) {
    const k = c.seed % 5
    if (k <= 1) {
      // 半埋的巨石
      const r = 0.38 + rnd01(c.seed, 1) * 0.25
      part(c, rockGeo(c.seed, r, 1, 0.75), Mat.rock('#6e6674'), 0, r * 0.35, 0, rnd01(c.seed, 2) * 6)
      if (k === 1) part(c, rockGeo(c.seed + 3, r * 0.45, 0, 0.8), Mat.rock('#7c7486'), r * 0.9, r * 0.15, r * 0.4)
    } else if (k <= 3) {
      // 異星莖叢：發光莖尖
      const stem = Mat.organic('#3f6a4a', '#9fe7ff')
      const tipCol = k === 2 ? '#c9a0ff' : '#9fe7ff'
      const tip = pulse(c.anim, tipCol, 2.2, 0.8, 1.3, c.seed * 0.3)
      const n = 5 + (c.seed % 3)
      for (let i = 0; i < n; i++) {
        const a = (i / n) * Math.PI * 2 + rnd01(c.seed, i)
        const d = 0.08 + rnd01(c.seed, i + 7) * 0.25
        const h = 0.6 + rnd01(c.seed, i + 13) * 0.9
        const lean = (rnd01(c.seed, i + 21) - 0.5) * 0.5
        part(c, cyl(0.015, 0.045, h, 6), stem, Math.cos(a) * d, h / 2, Math.sin(a) * d, a, lean, lean * 0.6)
        part(c, sphere(0.05, 8, 6), tip, Math.cos(a) * d + Math.sin(lean * 0.6) * -h * 0.5, h * 0.98, Math.sin(a) * d + Math.sin(lean) * h * 0.5)
      }
    } else {
      // 扇葉灌木
      const leaf = Mat.organic('#4f7a5a', '#c9a0ff')
      for (let i = 0; i < 7; i++) {
        const a = (i / 7) * Math.PI * 2
        part(c, sphere(0.22, 10, 6), leaf, Math.cos(a) * 0.22, 0.28 + (i % 2) * 0.12, Math.sin(a) * 0.22, -a, 0.6, 0, 0.6, 0.25, 1.4)
      }
      part(c, sphere(0.16, 10, 8), leaf, 0, 0.35, 0)
    }
  },
  base(c) {
    const k = c.seed % 3
    if (k === 0) {
      // 紐澤西護欄（混凝土）
      const conc = Mat.paint('#8a8a86', 0.9)
      part(c, rbox(0.95, 0.2, 0.55, 0.03), conc, 0, 0.1, 0)
      part(c, rbox(0.95, 0.55, 0.26, 0.04), conc, 0, 0.47, 0)
      part(c, box(0.96, 0.08, 0.27), Mat.paint('#ffc23d', 0.6), 0, 0.62, 0)
    } else if (k === 1) {
      // 沙包
      const bag = Mat.fabric('#7a6a4a')
      for (let i = 0; i < 3; i++) part(c, rbox(0.42, 0.18, 0.3, 0.08), bag, -0.25 + i * 0.25, 0.09, 0, rnd01(c.seed, i) * 0.3)
      for (let i = 0; i < 2; i++) part(c, rbox(0.42, 0.18, 0.3, 0.08), bag, -0.12 + i * 0.25, 0.27, 0.02, rnd01(c.seed, i + 4) * 0.3)
    } else {
      // 燃料桶
      for (let i = 0; i < 3; i++) {
        const [lx, lz] = [[-0.22, -0.15], [0.22, -0.15], [0, 0.22]][i]
        part(c, cyl(0.2, 0.2, 0.72, 16), Mat.paint('#4a5a3a', 0.55), lx, 0.36, lz)
        part(c, torus(0.2, 0.015, 4, 16), Mat.paint('#ffc23d', 0.6), lx, 0.55, lz, 0, Math.PI / 2)
      }
    }
  },
  outpost(c) {
    // 市集攤位：帆布遮棚＋貨品
    const canvasCols = ['#a03a2e', '#2e6aa0', '#c9a23a', '#3a7a5a']
    const pole = Mat.metal('#6a6460', 0.6, false)
    part(c, rbox(0.95, 0.7, 0.6, 0.03), Mat.paint('#5a4a3a', 0.7), 0, 0.35, -0.15)
    for (const lx of [-0.45, 0.45]) part(c, cyl(0.025, 0.025, 1.9, 6), pole, lx, 0.95, 0.2)
    part(c, rbox(1.05, 0.04, 0.85, 0.02), Mat.fabric(canvasCols[c.seed % 4]), 0, 1.9, -0.05, 0, 0.18)
    for (let i = 0; i < 4; i++) part(c, rbox(0.18, 0.14, 0.16, 0.03), Mat.paint(canvasCols[(c.seed + i + 1) % 4], 0.5), -0.3 + i * 0.2, 0.77, -0.15)
  },
  // ───── 餘燼衛星（室外）─────
  rock(c) {
    // 低重力：岩塊上方漂浮的碎石
    const r = 0.36 + rnd01(c.seed, 1) * 0.22
    part(c, rockGeo(c.seed, r, 1, 0.7), Mat.rock('#4c4a49'), 0, r * 0.3, 0, rnd01(c.seed, 2) * 6)
    const n = 1 + (c.seed % 3)
    for (let i = 0; i < n; i++) {
      const peb = live(c, rockGeo(c.seed + i + 1, 0.08 + rnd01(c.seed, i + 3) * 0.08, 0), Mat.rock('#5c5a58'), (rnd01(c.seed, i + 5) - 0.5) * 0.9, 0.9 + i * 0.35, (rnd01(c.seed, i + 6) - 0.5) * 0.9)
      const y0 = peb.position.y
      const ph = rnd01(c.seed, i + 8) * 6
      c.anim.push({ obj: peb, update: (t) => ((peb.position.y = y0 + Math.sin(t * 0.6 + ph) * 0.15), (peb.rotation.x = t * 0.2 + ph), (peb.rotation.y = t * 0.13)) })
    }
  },
  crater(c) {
    // 重力坑的環形導光柱
    const col = c.seed % 2 ? '#8fd8ff' : '#b28cff'
    const glow = pulse(c.anim, col, 2.4, 1.2, 1.6, c.seed * 0.5)
    part(c, cyl(0.16, 0.24, 1.0, 12), Mat.metal('#3a3c42', 0.7), 0, 0.5, 0)
    part(c, torus(0.24, 0.04, 8, 24), glow, 0, 1.05, 0, 0, Math.PI / 2)
    part(c, sphere(0.08, 10, 8), glow, 0, 1.12, 0)
    glowDecal(c.group, col, 1.8, c.cx, c.cz, 0.3)
  },
  factory(c) {
    // 模組組裝台：旋轉的發光模組
    const metal = Mat.metal('#40434a', 0.7)
    part(c, rbox(0.95, 0.85, 0.65, 0.04), metal, 0, 0.42, -0.1)
    part(c, box(0.85, 0.04, 0.55), Mat.metal('#6a7078', 0.5, false), 0, 0.86, -0.1)
    const mod = live(c, rbox(0.22, 0.12, 0.3, 0.03), Mat.emissive('#7fd8ff', 2.4), 0, 1.0, -0.1)
    c.anim.push({ obj: mod, update: (t) => (mod.rotation.y = t * 0.8 + c.seed) })
    part(c, rbox(0.1, 0.6, 0.1, 0.03), Mat.paint('#ffb46b', 0.5), 0.35, 1.15, -0.3, 0, 0.5)
    part(c, box(0.04, 0.04, 0.2), Mat.emissive('#ffb46b', 2), 0.35, 1.38, -0.05)
  },
  // ───── 未識別物體 ─────
  alien(c) {
    const flesh = Mat.organic('#3a2a46', '#6dff9a', 0.6)
    const k = c.seed % 3
    if (k === 0) {
      // 有機柱：一節節收窄
      let y = 0
      for (let i = 0; i < 5; i++) {
        const r = 0.42 - i * 0.06
        part(c, sphere(r, 14, 10), flesh, Math.sin(i * 1.3 + c.seed) * 0.08, y + r * 0.7, Math.cos(i * 1.7 + c.seed) * 0.08, i, 0, 0, 1, 0.85, 1)
        y += r * 1.1
      }
    } else if (k === 1) {
      // 卵囊群：其一緩慢脈動
      for (let i = 0; i < 3; i++) {
        const a = (i / 3) * Math.PI * 2 + c.seed
        part(c, sphere(0.2, 14, 10), Mat.organic('#4a3a2a', '#9dff5c', 0.9), Math.cos(a) * 0.22, 0.25, Math.sin(a) * 0.22, 0, 0, 0, 1, 1.35, 1)
      }
      const egg = live(c, sphere(0.24, 16, 12), Mat.organic('#5a2a4a', '#6dff9a', 1.4), 0, 0.32, 0)
      c.anim.push({ obj: egg, update: (t) => egg.scale.set(1 + Math.sin(t * 1.7 + c.seed) * 0.06, 1.35 + Math.sin(t * 1.7 + c.seed) * 0.1, 1) })
    } else {
      // 地面根鬚＋發光小球
      for (let i = 0; i < 3; i++) part(c, torus(0.35 + i * 0.08, 0.05, 6, 16, Math.PI * 0.9), flesh, 0, 0.04, 0, i * 1.9 + c.seed, Math.PI / 2)
      for (let i = 0; i < 4; i++) part(c, sphere(0.05, 8, 6), pulse(c.anim, '#9dff5c', 2.4, 1.6, 1.1, i), (rnd01(c.seed, i) - 0.5) * 0.8, 0.06, (rnd01(c.seed, i + 4) - 0.5) * 0.8)
    }
    glowDecal(c.group, '#6dff9a', 1.4, c.cx, c.cz, 0.14)
  },
  code(c) {
    // 符文石碑
    part(c, rbox(0.62, 2.1, 0.26, 0.05), Mat.rock('#1e2422'), 0, 1.05, -0.2)
    const g = live(c, new THREE.PlaneGeometry(0.5, 1.6), Mat.screen(glyphTex('#9dff5c', c.seed), 1.8), 0, 1.15, -0.065)
    g.castShadow = false
    glowDecal(c.group, '#9dff5c', 1.4, ...at(c.cx, c.cz, c.rot, 0, 0.2), 0.2)
  },
  // ───── 海盜船 ─────
  brig(c) {
    const bar = Mat.metal('#4a3a34', 0.7, false)
    if (c.seed % 2) {
      for (let i = 0; i < 6; i++) part(c, cyl(0.025, 0.025, 2.1, 6), bar, -0.42 + i * 0.17, 1.05, -0.35)
      for (const y of [0.08, 1.2, 2.1]) part(c, box(0.98, 0.06, 0.06), bar, 0, y, -0.35)
    } else {
      part(c, rbox(0.85, 0.3, 1.0, 0.03), Mat.metal('#3a302c', 0.6), 0, 0.3, 0)
      part(c, rbox(0.75, 0.1, 0.9, 0.05), Mat.fabric('#5a4a3e'), 0, 0.5, 0)
      part(c, torus(0.08, 0.015, 4, 10), bar, 0.3, 0.5, -0.45)
      part(c, cyl(0.012, 0.012, 0.6, 4), bar, 0.3, 0.25, -0.45, 0, 0.4)
    }
  },
}

// ───────── 設施 POI ─────────

/** 純標記（出生點、生成點、巡邏點）：不畫模型 */
const MARKER_KINDS = new Set([
  'patrol',
  'captainSpawn',
  'engineerSpawn',
  'slugSpawn',
  'freakSpawn',
  'foxSpawn',
  'anomalySpawn',
  'elderSpawn',
  'entitySpawn',
  'pirateCaptain',
  'pirateSpawn',
  'sentrySpawn',
  'cannonBody',
])

type PoiFn = (ref: string | undefined, seed: number) => PoiModel

function poiKit() {
  const root = new THREE.Group()
  const anim: Animated[] = []
  const add = (g: THREE.BufferGeometry, m: THREE.Material, x: number, y: number, z: number, rx = 0, ry = 0, rz = 0, shadow = true) => {
    const mesh = new THREE.Mesh(g, m)
    mesh.position.set(x, y, z)
    mesh.rotation.set(rx, ry, rz)
    mesh.castShadow = shadow
    mesh.receiveShadow = true
    root.add(mesh)
    return mesh
  }
  const decal = (tex: THREE.Texture, size: number, y = 0.014, opacity = 1, additive = false, color = '#ffffff') => {
    const m = new THREE.Mesh(
      new THREE.PlaneGeometry(size, size),
      new THREE.MeshBasicMaterial({ map: tex, color, transparent: true, opacity, depthWrite: false, blending: additive ? THREE.AdditiveBlending : THREE.NormalBlending }),
    )
    m.rotation.x = -Math.PI / 2
    m.position.y = y
    root.add(m)
    return m
  }
  return { root, anim, add, decal }
}

/** 地板格標記（每格一塊，拼成 3×3 平台）*/
function floorTile(color: string, deco: 'frame' | 'hex' | 'hazard', pulseSpeed: number, bright = 0.2): PoiModel {
  const k = poiKit()
  k.add(box(0.98, 0.04, 0.98), Mat.metal('#23272d', 0.7), 0, 0.02, 0, 0, 0, 0, false)
  k.decal(decalTex(deco, color), 0.98, 0.045, 0.9, bright > 0.3)
  const glow = k.decal(decalTex('glow', color), 1.3, 0.05, 0.25, true)
  k.anim.push({ obj: glow, update: (t) => ((glow.material as THREE.MeshBasicMaterial).opacity = bright + 0.14 * Math.sin(t * pulseSpeed)) })
  return { root: k.root, anim: k.anim }
}

function deskConsole(color: string, seed: number, buttons: number): ReturnType<typeof poiKit> {
  const k = poiKit()
  const dark = Mat.metal('#2b3138', 0.75)
  k.add(rbox(1.4, 0.9, 0.7, 0.06), dark, 0, 0.45, -0.05)
  k.add(rbox(1.42, 0.08, 0.6, 0.03), Mat.metal('#4a535c', 0.6), 0, 0.95, 0.02, 0.4)
  const scr = new THREE.Mesh(new THREE.PlaneGeometry(1.1, 0.45), Mat.screen(screenTex('ui', color, seed), 1.8))
  scr.position.set(0, 1.35, -0.32)
  k.root.add(scr)
  k.add(rbox(1.2, 0.55, 0.06, 0.03), dark, 0, 1.35, -0.36)
  for (let i = 0; i < buttons; i++) k.add(cyl(0.045, 0.045, 0.04, 12), Mat.emissive(i % 3 === 2 ? '#ffc23d' : color, 2.6), -0.5 + (i * 1.0) / Math.max(1, buttons - 1), 1.0, 0.12, 0.4)
  k.anim.push({ obj: scr, update: (t) => ((scr.material as THREE.MeshStandardMaterial).emissiveIntensity = 1.7 + Math.sin(t * 7 + seed) * 0.1) })
  return k
}
/** 雙面版本的材質（碟形天線等薄殼；不改動快取中的共用材質）*/
const dsCache = new Map<THREE.Material, THREE.MeshStandardMaterial>()
function doubleSided(m: THREE.MeshStandardMaterial): THREE.MeshStandardMaterial {
  let d = dsCache.get(m)
  if (!d) {
    d = withFog(new THREE.MeshStandardMaterial({ map: m.map, roughnessMap: m.roughnessMap, normalMap: m.normalMap, roughness: m.roughness, metalness: m.metalness, side: THREE.DoubleSide }))
    dsCache.set(m, d)
  }
  return d
}

const EXTRA_POIS: Record<string, PoiFn> = {
  fabricator(_r, seed) {
    // 仿生人鑄造台：背柱＋兩支懸臂，琥珀掃描光在前方平台上下移動
    const k = poiKit()
    const dark = Mat.metal('#2a2e35', 0.75)
    const shell = Mat.paint('#d0d0c8', 0.4)
    const amber = Mat.emissive('#ffb000', 3)
    k.add(rbox(1.7, 0.25, 1.3, 0.05), dark, 0, 0.12, -0.1)
    k.add(rbox(1.3, 2.3, 0.45, 0.06), shell, 0, 1.15, -0.5)
    for (const x of [-0.5, 0.5]) k.add(box(0.06, 2.0, 0.02), amber, x, 1.15, -0.27)
    const arms = new THREE.Group()
    arms.position.set(0, 2.05, -0.4)
    k.root.add(arms)
    for (const x of [-0.45, 0.45]) {
      const a = new THREE.Mesh(rbox(0.16, 0.16, 1.6, 0.04), shell)
      a.position.set(x, 0, 0.8)
      const claw = new THREE.Mesh(rbox(0.12, 0.6, 0.12, 0.03), dark)
      claw.position.set(x, -0.35, 1.55)
      const tip = new THREE.Mesh(box(0.06, 0.06, 0.06), amber)
      tip.position.set(x, -0.68, 1.55)
      arms.add(a, claw, tip)
    }
    const scan = new THREE.Mesh(box(2.6, 0.03, 0.05), Mat.emissive('#ffb000', 4))
    scan.position.set(0, 1.0, 2.6)
    k.root.add(scan)
    k.anim.push({ obj: scan, update: (t) => ((scan.position.y = 0.2 + (Math.sin(t * 1.3 + seed) * 0.5 + 0.5) * 1.6), (arms.rotation.x = Math.sin(t * 0.7) * 0.08)) })
    const scr = new THREE.Mesh(new THREE.PlaneGeometry(0.8, 0.5), Mat.screen(screenTex('ui', '#ffb000', seed), 1.8))
    scr.position.set(0, 1.5, -0.27)
    k.root.add(scr)
    return { root: k.root, anim: k.anim, ring: '#ffb000' }
  },
  fabricatorPad: () => floorTile('#ffb000', 'frame', 2.2),
  cagePad: () => floorTile('#ffc23d', 'hazard', 1.6),
  teleportPad: () => floorTile('#6fb8ff', 'hex', 3.2, 0.45),
  moduleSocket(_r, seed) {
    // 模組安裝座：空插槽＋青色指示環
    const k = poiKit()
    const dark = Mat.metal('#2b3138', 0.75)
    const glow = Mat.emissive('#7fd8ff', 2.8)
    k.add(rbox(0.95, 0.2, 0.95, 0.05), dark, 0, 0.1, 0)
    k.add(rbox(0.55, 1.0, 0.55, 0.05), Mat.metal('#56606a', 0.65), 0, 0.7, 0)
    k.add(rbox(0.5, 0.18, 0.38, 0.03), Mat.metal('#101418', 0.5, false), 0, 1.22, 0.04, 0.3)
    k.add(box(0.34, 0.02, 0.24), glow, 0, 1.3, 0.06, 0.3)
    const ring = k.add(torus(0.36, 0.03, 6, 32), glow, 0, 1.0, 0, Math.PI / 2)
    for (let i = 0; i < 3; i++) k.add(cyl(0.035, 0.035, 0.9, 6), Mat.rubber('#14171a'), -0.25 + i * 0.25, 0.45, -0.38, 0.2)
    k.anim.push({ obj: ring, update: (t) => (ring.position.y = 0.7 + Math.sin(t * 1.6 + seed) * 0.3) })
    return { root: k.root, anim: k.anim, ring: '#7fd8ff' }
  },
  landingPortal(_r, seed) {
    // 降落傳送門：地面能量盤＋四柱紅燈＋淡淡光柱
    const k = poiKit()
    const dark = Mat.metal('#2a2e33', 0.75)
    k.add(torus(1.15, 0.14, 8, 40), dark, 0, 0.06, 0, Math.PI / 2)
    k.add(torus(0.98, 0.03, 6, 40), Mat.emissive('#ff5a4a', 3), 0, 0.12, 0, Math.PI / 2)
    const disc = k.decal(decalTex('ring', '#ffd0c8'), 2.0, 0.03, 0.8, true)
    const disc2 = k.decal(decalTex('hex', '#ff5a4a'), 1.9, 0.035, 0.55, true)
    for (let i = 0; i < 4; i++) {
      const a = (i / 4) * Math.PI * 2 + Math.PI / 4
      k.add(cyl(0.07, 0.1, 0.9, 8), dark, Math.cos(a) * 1.35, 0.45, Math.sin(a) * 1.35)
      k.add(sphere(0.07, 10, 8), Mat.emissive('#ff3b3b', 4), Math.cos(a) * 1.35, 0.95, Math.sin(a) * 1.35)
    }
    const beam = new THREE.Mesh(cyl(0.95, 1.0, 2.4, 32, true), new THREE.MeshBasicMaterial({ color: '#ff6a5a', transparent: true, opacity: 0.08, depthWrite: false, blending: THREE.AdditiveBlending, side: THREE.DoubleSide }))
    beam.position.y = 1.2
    k.root.add(beam)
    k.anim.push({ obj: disc, update: (t) => ((disc.rotation.z = t * 0.6), (disc2.rotation.z = -t * 0.3 + seed), ((beam.material as THREE.MeshBasicMaterial).opacity = 0.06 + Math.sin(t * 2) * 0.03)) })
    return { root: k.root, anim: k.anim, ring: '#ff5a4a' }
  },
  cellConsole(_r, seed) {
    const k = deskConsole('#5cf2a5', seed, 6)
    return { root: k.root, anim: k.anim, ring: '#5cf2a5' }
  },
  cageConsole(_r, seed) {
    const k = deskConsole('#ffc23d', seed, 4)
    const cage = new THREE.Mesh(new THREE.BoxGeometry(0.45, 0.45, 0.45, 3, 3, 3), new THREE.MeshBasicMaterial({ color: '#ffc23d', wireframe: true, transparent: true, opacity: 0.6 }))
    cage.position.set(0, 1.95, 0)
    k.root.add(cage)
    k.anim.push({ obj: cage, update: (t) => ((cage.rotation.y = t * 0.7), (cage.position.y = 1.95 + Math.sin(t * 1.3) * 0.05)) })
    return { root: k.root, anim: k.anim, ring: '#ffc23d' }
  },
  moduleFactory(_r, seed) {
    // 模組工廠控制台：大型組裝機＋旋轉的全像模組
    const k = poiKit()
    const metal = Mat.metal('#3a3e45', 0.75)
    k.add(rbox(1.8, 1.0, 1.1, 0.06), metal, 0, 0.5, -0.1)
    k.add(rbox(1.6, 0.08, 0.7, 0.03), Mat.metal('#5a626c', 0.6), 0, 1.05, 0.05, 0.3)
    k.add(rbox(0.3, 1.4, 0.3, 0.05), metal, -0.75, 1.7, -0.45)
    k.add(rbox(1.2, 0.18, 0.2, 0.04), Mat.paint('#ffb46b', 0.5), -0.25, 2.35, -0.45)
    k.add(rbox(0.12, 0.5, 0.12, 0.03), metal, 0.3, 2.05, -0.45)
    const holo = new THREE.Mesh(new THREE.OctahedronGeometry(0.32, 0), new THREE.MeshBasicMaterial({ color: '#7fd8ff', wireframe: true, transparent: true, opacity: 0.7 }))
    holo.position.set(0.3, 1.6, -0.1)
    k.root.add(holo)
    const scr = new THREE.Mesh(new THREE.PlaneGeometry(1.2, 0.4), Mat.screen(screenTex('ui', '#7fd8ff', seed), 1.8))
    scr.position.set(0, 1.08, 0.08)
    scr.rotation.x = -Math.PI / 2 + 0.3
    k.root.add(scr)
    k.anim.push({ obj: holo, update: (t) => ((holo.rotation.y = t * 0.9), (holo.rotation.x = t * 0.4)) })
    return { root: k.root, anim: k.anim, ring: '#7fd8ff' }
  },
  moduleOut() {
    // 模組輸出口：地面滑槽＋箭頭
    const k = poiKit()
    k.add(rbox(0.96, 0.05, 0.96, 0.02), Mat.metal('#2a2e33', 0.7), 0, 0.025, 0, 0, 0, 0, false)
    k.decal(decalTex('chevron', '#7fd8ff'), 0.9, 0.055, 0.85)
    k.add(box(0.06, 0.9, 0.06), Mat.paint('#ffc23d', 0.5), -0.45, 0.45, -0.45)
    k.add(box(0.06, 0.9, 0.06), Mat.paint('#ffc23d', 0.5), 0.45, 0.45, -0.45)
    k.add(box(0.96, 0.08, 0.08), Mat.emissive('#7fd8ff', 2.4), 0, 0.9, -0.45)
    return { root: k.root, anim: k.anim }
  },
  penguinStatue() {
    // 企鵝雕像（可破壞，掉企鵝玩偶）：石雕＋鍍金嘴
    const k = poiKit()
    const stone = Mat.rock('#8a8c90')
    const pale = Mat.rock('#b8bab8')
    const gold = Mat.metal('#c9a23a', 0.9, false)
    k.add(rbox(1.0, 0.5, 1.0, 0.05), Mat.rock('#5a5c62'), 0, 0.25, 0)
    k.add(rbox(0.5, 0.12, 0.02, 0.01), gold, 0, 0.3, 0.505)
    k.add(sphere(0.34, 20, 14), stone, 0, 1.0, 0, 0, 0, 0).scale.set(1, 1.45, 0.92)
    k.add(sphere(0.27, 18, 12), pale, 0, 0.95, 0.12).scale.set(0.95, 1.4, 0.75)
    k.add(sphere(0.21, 18, 12), stone, 0, 1.58, 0.02)
    k.add(cyl(0.0, 0.06, 0.2, 10), gold, 0, 1.56, 0.26, Math.PI / 2)
    for (const x of [-1, 1]) {
      k.add(sphere(0.14, 12, 8), stone, x * 0.33, 1.05, 0, 0, 0, x * 0.35).scale.set(0.35, 1.4, 0.8)
      k.add(rbox(0.12, 0.05, 0.18, 0.02), gold, x * 0.12, 0.53, 0.12)
      k.add(sphere(0.025, 8, 6), Mat.rock('#202224'), x * 0.08, 1.64, 0.18)
    }
    return { root: k.root, anim: k.anim }
  },
  codePanel(_r, seed) {
    const k = poiKit()
    k.add(rbox(1.0, 2.2, 0.3, 0.06), Mat.rock('#1e2422'), 0, 1.1, -0.2)
    const g = new THREE.Mesh(new THREE.PlaneGeometry(0.8, 1.7), Mat.screen(glyphTex('#9dff5c', seed + 11), 2.2))
    g.position.set(0, 1.2, -0.045)
    k.root.add(g)
    const glow = k.decal(decalTex('glow', '#9dff5c'), 2.4, 0.02, 0.3, true)
    k.anim.push({ obj: g, update: (t) => (((g.material as THREE.MeshStandardMaterial).emissiveIntensity = 1.8 + Math.sin(t * 2.3) * 0.6), ((glow.material as THREE.MeshBasicMaterial).opacity = 0.22 + Math.sin(t * 2.3) * 0.1)) })
    return { root: k.root, anim: k.anim, ring: '#9dff5c' }
  },
  landingSite() {
    // 豪勇號降落場：虛線大圓、四向箭頭、閃爍信標
    const k = poiKit()
    k.decal(decalTex('dash', '#ffc23d'), 11, 0.016, 0.7)
    k.decal(decalTex('ring', '#ffc23d'), 7, 0.017, 0.5)
    k.decal(decalTex('glow', '#1a1410'), 9, 0.015, 0.55)
    for (let i = 0; i < 4; i++) {
      const c = k.decal(decalTex('chevron', '#ffc23d'), 1.4, 0.018, 0.7)
      const a = (i / 4) * Math.PI * 2
      c.position.set(Math.cos(a) * 4.3, 0.018, Math.sin(a) * 4.3)
      c.rotation.z = -a + Math.PI
    }
    const lamps: THREE.Mesh[] = []
    for (let i = 0; i < 8; i++) {
      const a = (i / 8) * Math.PI * 2 + Math.PI / 8
      k.add(cyl(0.1, 0.12, 0.08, 10), Mat.metal('#2a2e33', 0.7), Math.cos(a) * 5.6, 0.04, Math.sin(a) * 5.6, 0, 0, 0, false)
      lamps.push(k.add(sphere(0.07, 10, 8), Mat.emissive('#ff3b3b', 4), Math.cos(a) * 5.6, 0.12, Math.sin(a) * 5.6, 0, 0, 0, false))
    }
    k.anim.push({ obj: k.root, update: (t) => lamps.forEach((l, i) => (l.visible = Math.sin(t * 3 - i * 0.785) > 0)) })
    return { root: k.root, anim: k.anim }
  },
  arcLeak(_r, seed) {
    // 七號廢站漏電點：斷裂導管＋亂跳的電弧與火花，地面藍白光暈蓋住旁邊的危險區
    const k = poiKit()
    const iron = Mat.metal('#4a3c32', 0.6)
    k.add(rbox(0.62, 1.0, 0.5, 0.04), Mat.paint('#6e4a32', 0.85), 0, 0.5, 0, 0, 0, 0.1)
    k.add(cyl(0.11, 0.11, 0.9, 10), iron, 0, 1.3, 0, 0.25, 0, 0.2)
    k.add(cyl(0.12, 0.12, 0.08, 10), Mat.metal('#1a1410', 0.5, false), 0.09, 1.75, 0.11, 0.25, 0, 0.2)
    const glow = k.decal(decalTex('glow', '#8fd0ff'), 4.2, 0.03, 0.4, true)
    const sparkMat = Mat.emissive('#dff4ff', 6)
    const sparks: THREE.Mesh[] = []
    for (let i = 0; i < 7; i++) sparks.push(k.add(sphere(0.035, 6, 4), sparkMat, 0, 0.3, 1, 0, 0, 0, false))
    const pts = new Float32Array(9 * 3)
    const geo = new THREE.BufferGeometry()
    geo.setAttribute('position', new THREE.BufferAttribute(pts, 3))
    const arc = new THREE.Line(geo, new THREE.LineBasicMaterial({ color: '#cfeaff', transparent: true, opacity: 0.9, blending: THREE.AdditiveBlending, depthWrite: false }))
    k.root.add(arc)
    let next = 0
    k.anim.push({
      obj: arc,
      update: (t) => {
        const burst = Math.sin(t * 5.3 + seed) * Math.sin(t * 1.7) > 0.2
        arc.visible = burst
        ;(glow.material as THREE.MeshBasicMaterial).opacity = burst ? 0.35 + Math.random() * 0.25 : 0.12
        if (t < next) return
        next = t + 0.05
        const a = Math.random() * Math.PI * 2
        const d = 0.8 + Math.random() * 1.2
        const [ex, ez] = [Math.cos(a) * d, Math.sin(a) * d]
        for (let i = 0; i < 9; i++) {
          const f = i / 8
          const j = i % 8 ? 1 : 0
          pts[i * 3] = 0.09 + (ex - 0.09) * f + j * (Math.random() - 0.5) * 0.3
          pts[i * 3 + 1] = 1.75 * (1 - f) * (1 - f * 0.3) + 0.03 + j * Math.random() * 0.15
          pts[i * 3 + 2] = 0.11 + (ez - 0.11) * f + j * (Math.random() - 0.5) * 0.3
        }
        geo.attributes.position.needsUpdate = true
        for (const sp of sparks) {
          sp.visible = burst && Math.random() < 0.6
          const b = Math.random() * Math.PI * 2
          const e = 0.4 + Math.random() * 1.6
          sp.position.set(Math.cos(b) * e, 0.05 + Math.random() * 0.6, Math.sin(b) * e)
        }
      },
    })
    return { root: k.root, anim: k.anim }
  },
  podLanding() {
    const k = poiKit()
    k.decal(decalTex('dash', '#ffb46b'), 2.6, 0.016, 0.45)
    return { root: k.root, anim: k.anim }
  },
  deadScientist(_r, seed) {
    // 殉職研究員：遺體由主程式生成，這裡只畫血跡與散落的紙
    const k = poiKit()
    const st = k.decal(decalTex('stain', '#4a0606'), 1.9, 0.013, 0.8)
    st.rotation.z = seed
    for (let i = 0; i < 3; i++) k.add(box(0.21, 0.005, 0.29), Mat.paint('#d8d4c8', 0.6), Math.cos(seed + i * 2.1) * 0.7, 0.016, Math.sin(seed + i * 2.1) * 0.6, 0, seed + i, 0, false)
    return { root: k.root, anim: k.anim }
  },
  cannonBreech(ref, seed) {
    // 天守主砲：砲尾在此格、砲管沿 local +Z 延伸 ref 公尺（版面上被 cannonBody 佔住的格）
    const k = poiKit()
    const L = Number(ref) || 30
    const iron = Mat.metal('#3e3a36', 0.8)
    const steel = Mat.metal('#6e6862', 0.75)
    const coil = Mat.emissive('#ff7a2a', 3)
    k.add(rbox(4.6, 2.3, 2.8, 0.12), iron, 0, 1.15, 0)
    for (const x of [-1.9, 1.9]) k.add(cyl(0.32, 0.32, 3.2, 16), steel, x, 1.0, 0.6, Math.PI / 2)
    for (const z of [-0.8, 0, 0.8]) k.add(torus(1.25, 0.07, 6, 32), coil, 0, 1.25, z)
    k.add(box(3.2, 0.06, 0.06), coil, 0, 2.31, -1.0)
    // 砲管：由粗到細
    const barrel = k.add(cyl(0.95, 1.15, L, 32), steel, 0, 1.25, 1.5 + L / 2, Math.PI / 2)
    barrel.castShadow = true
    const coilP: THREE.Mesh[] = []
    for (let z = 3; z < L - 1; z += 3) {
      const r = 1.15 - (z / L) * 0.2
      const isCoil = Math.round(z / 3) % 2 === 0
      const m = k.add(torus(r + 0.04, isCoil ? 0.06 : 0.09, 6, 32), isCoil ? coil : iron, 0, 1.25, 1.5 + z)
      if (isCoil) coilP.push(m)
    }
    k.add(box(0.14, 0.05, L - 1), coil, 0, 2.25, 1.5 + L / 2, 0.012)
    k.add(cyl(1.12, 1.12, 1.4, 32), iron, 0, 1.25, 1.5 + L - 0.7, Math.PI / 2)
    for (let i = 0; i < 6; i++) {
      const a = (i / 6) * Math.PI * 2
      k.add(box(0.12, 0.5, 0.9), Mat.metal('#141210', 0.6), Math.cos(a) * 1.1, 1.25 + Math.sin(a) * 1.1, 1.5 + L - 0.7, 0, 0, a)
    }
    for (let z = 4; z < L - 2; z += 7) k.add(box(2.7, 0.55, 0.6), iron, 0, 0.27, 1.5 + z)
    k.anim.push({ obj: k.root, update: (t) => coilP.forEach((m, i) => m.scale.setScalar(1 + Math.max(0, Math.sin(t * 2.4 - i * 0.7)) * 0.04)) })
    void seed
    return { root: k.root, anim: k.anim }
  },
}

/** 特殊外型的販賣機（雷達站、重力控制裝置、LQ 倉儲）*/
const SPECIAL_VENDORS: Record<string, PoiFn> = {
  radar(_r, seed) {
    // 雷達站：底座＋桅杆＋旋轉碟形天線＋琥珀信標；下方是購買終端
    const k = poiKit()
    const navy = Mat.metal('#26324a', 0.7)
    const pale = Mat.paint('#c8ccd4', 0.35)
    k.add(cyl(0.75, 0.85, 0.35, 28), navy, 0, 0.17, 0)
    k.add(cyl(0.12, 0.16, 2.0, 14), Mat.metal('#5a6578', 0.7), 0, 1.3, 0)
    const head = new THREE.Group()
    head.position.y = 2.6
    k.root.add(head)
    // 碟形：球冠凹面朝 +Z、仰角 0.5 rad；焦點上放饋源
    const dish = new THREE.Mesh(new THREE.SphereGeometry(0.85, 28, 10, 0, Math.PI * 2, 0, Math.PI * 0.32), doubleSided(pale))
    dish.rotation.x = -Math.PI / 2 - 0.5
    dish.position.z = 0.85
    dish.castShadow = true
    const feed = new THREE.Mesh(cyl(0.02, 0.02, 0.5, 6), Mat.metal('#8ea0bd', 0.6, false))
    feed.rotation.x = Math.PI / 2 - 0.5
    feed.position.set(0, -0.3, 0.3)
    const horn = new THREE.Mesh(sphere(0.06, 10, 8), Mat.emissive('#ffb000', 3))
    horn.position.set(0, -0.2, 0.47)
    head.add(dish, feed, horn)
    const beacon = k.add(sphere(0.08, 10, 8), Mat.emissive('#ffc23d', 4), 0, 2.95, 0)
    k.add(rbox(0.6, 1.1, 0.4, 0.04), navy, 0, 0.9, 0.75)
    const scr = new THREE.Mesh(new THREE.PlaneGeometry(0.46, 0.4), Mat.screen(screenTex('radar', '#ffc23d', seed), 2))
    scr.position.set(0, 1.15, 0.955)
    k.root.add(scr)
    const pulseRing = k.decal(decalTex('ring', '#ffc23d'), 3.2, 0.02, 0.35, true)
    // 地面雷達掃描扇形（與碟形天線同步旋轉）
    const sweep = k.decal(decalTex('sweep', '#ffb000'), 7.5, 0.025, 0.5, true)
    k.root.scale.setScalar(1.45)
    k.anim.push({
      obj: head,
      update: (t) => {
        head.rotation.y = t * 0.9
        sweep.rotation.z = t * 0.9 + Math.PI / 2
        beacon.visible = Math.sin(t * 4) > 0
        pulseRing.scale.setScalar(0.4 + ((t * 0.5) % 1) * 0.8)
        ;(pulseRing.material as THREE.MeshBasicMaterial).opacity = 0.4 * (1 - ((t * 0.5) % 1))
      },
    })
    return { root: k.root, anim: k.anim, ring: '#ffc23d' }
  },
  gravity(_r, seed) {
    // 重力控制裝置：中央柱＋三圈陀螺環，藍紫光
    const k = poiKit()
    const dark = Mat.metal('#2a2e38', 0.75)
    k.add(cyl(0.8, 0.95, 0.3, 28), dark, 0, 0.15, 0)
    k.add(cyl(0.2, 0.28, 1.6, 16), Mat.metal('#4a5260', 0.7), 0, 1.0, 0)
    const core = k.add(sphere(0.22, 18, 12), Mat.emissive('#b28cff', 3.5), 0, 1.9, 0)
    const rings: THREE.Mesh[] = []
    const cols = ['#8fd8ff', '#b28cff', '#8fd8ff']
    for (let i = 0; i < 3; i++) {
      const r = k.add(torus(0.55 + i * 0.22, 0.035, 8, 48), Mat.emissive(cols[i], 2.8), 0, 1.9, 0)
      rings.push(r)
    }
    k.add(rbox(0.5, 1.0, 0.35, 0.04), dark, 0, 0.8, 0.9)
    const scr = new THREE.Mesh(new THREE.PlaneGeometry(0.4, 0.35), Mat.screen(screenTex('ui', '#8fd8ff', seed), 2))
    scr.position.set(0, 1.0, 1.08)
    k.root.add(scr)
    k.anim.push({
      obj: k.root,
      update: (t) => {
        rings[0].rotation.set(t * 0.9, 0, 0)
        rings[1].rotation.set(0, t * 0.7, Math.PI / 3)
        rings[2].rotation.set(Math.PI / 2, t * 0.5, t * 0.3)
        core.scale.setScalar(1 + Math.sin(t * 3) * 0.08)
      },
    })
    return { root: k.root, anim: k.anim, ring: '#8fd8ff' }
  },
  lq(_r, seed) {
    // LQ 倉儲：厚重保險櫃＋霜化玻璃與狀態燈
    const k = poiKit()
    const body = Mat.metal('#5a6068', 0.7)
    k.add(rbox(1.2, 2.1, 0.85, 0.08), body, 0, 1.05, -0.05)
    k.add(rbox(0.9, 1.3, 0.04, 0.02), Mat.glass('#dfefff', 0.45), 0, 1.25, 0.39)
    for (let i = 0; i < 3; i++) k.add(rbox(0.22, 0.3, 0.2, 0.03), Mat.paint(['#7fd8ff', '#ffb46b', '#c0c8d0'][i], 0.4), -0.28 + i * 0.28, 0.9 + (i % 2) * 0.4, 0.2)
    k.add(cyl(0.12, 0.12, 0.06, 20), Mat.metal('#c0c8d0', 0.8, false), 0.45, 1.25, 0.42, Math.PI / 2)
    const lamp = k.add(box(0.5, 0.05, 0.02), Mat.emissive('#c0c8d0', 2.4), 0, 2.0, 0.39)
    k.anim.push({ obj: lamp, update: (t) => (lamp.visible = Math.sin(t * 1.5 + seed) > -0.6) })
    return { root: k.root, anim: k.anim, ring: '#c0c8d0' }
  },
}
