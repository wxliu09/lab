// buff 持續視覺（每幀依快照實體的 buff 清單與狀態旗標，在單位身上加效果）＋實體裝飾（小行星縮放與塵尾、蛛絲錨點連線）
// 手法：
// - 殼層（shell）：對單位的每個 mesh 加一個共用 geometry 的子 mesh，材質是 fresnel 邊光 shader（可跟著骨架與動畫走）
// - 材質替換：石化時整個單位換成石材，結束時換回來
// - 附件：護盾泡泡、時滯晶體、帽子、量眩星、地面標記…（掛在單位節點下，跟著位置／朝向）
// - 粒子：燃燒、滴落、電火花…（有發射頻率上限，走共用的粒子池）
// - 殘影：興奮劑移動時每 0.09 秒拍一張發光剪影（全域同時上限）
import * as THREE from 'three'
import type { GameScene } from './gameScene'
import type { CEnt } from '../client/world'
import type { UnitView } from './units'
import { BUFFS } from '../shared/content/registry'
import { EntFlag } from '../shared/protocol/messages'
import { GEO } from './fx'
import { fxTex } from './fx/tex'
import { bolt, ghost, shieldMat, W } from './fx/kit'
import { Mat } from './materials'
import { stoneMat } from './fx/mats'

// ───────── 殼層材質 ─────────

type ShellMode = 'rim' | 'shimmer' | 'ice' | 'phase' | 'gold' | 'electric'
const MODE: Record<ShellMode, number> = { rim: 0, shimmer: 1, ice: 2, phase: 3, gold: 4, electric: 5 }

const shellCache = new Map<string, THREE.MeshStandardMaterial>()

function shellMat(mode: ShellMode, color: string, k = 1, push = 0.012): THREE.MeshStandardMaterial {
  const key = `${mode}|${color}|${k}|${push}`
  let m = shellCache.get(key)
  if (m) return m
  const u = {
    uFxColor: { value: new THREE.Color(color) },
    uFxTime: { value: 0 },
    uFxMode: { value: MODE[mode] },
    uFxK: { value: k },
    uFxPush: { value: push },
  }
  m = new THREE.MeshStandardMaterial({ color: '#000000', roughness: 1, metalness: 0, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending })
  m.userData.keep = true
  m.userData.fxU = u
  m.onBeforeCompile = (sh) => {
    Object.assign(sh.uniforms, u)
    sh.vertexShader = sh.vertexShader
      .replace('#include <common>', '#include <common>\nuniform float uFxPush;\nvarying vec3 vFxW;')
      .replace('#include <begin_vertex>', '#include <begin_vertex>\ntransformed += normalize(objectNormal) * uFxPush;')
      .replace('#include <project_vertex>', '#include <project_vertex>\nvFxW = (modelMatrix * vec4(transformed, 1.0)).xyz;')
    sh.fragmentShader = sh.fragmentShader
      .replace('#include <common>', '#include <common>\nuniform vec3 uFxColor;\nuniform float uFxTime;\nuniform float uFxMode;\nuniform float uFxK;\nvarying vec3 vFxW;')
      .replace(
        '#include <dithering_fragment>',
        `#include <dithering_fragment>
        {
          vec3 fxN = normalize(normal);
          vec3 fxV = normalize(vViewPosition);
          float fres = pow(1.0 - abs(dot(fxN, fxV)), 2.0);
          float band = 0.5 + 0.5 * sin(vFxW.y * 18.0 - uFxTime * 5.0);
          float cell = fract(sin(dot(floor(vFxW * 24.0), vec3(12.9898, 78.233, 37.719))) * 43758.5453);
          float a;
          if (uFxMode < 0.5) a = fres * (0.75 + 0.25 * sin(uFxTime * 6.0));
          else if (uFxMode < 1.5) a = fres * (0.35 + 0.65 * band) + step(0.992, fract(cell + uFxTime * 0.35)) * 0.8;
          else if (uFxMode < 2.5) a = fres * 0.9 + 0.16 + step(0.94, cell) * 0.7;
          else if (uFxMode < 3.5) a = fres * (0.4 + 0.6 * (0.5 + 0.5 * sin(vFxW.y * 9.0 + uFxTime * 9.0))) + 0.05;
          else if (uFxMode < 4.5) a = 0.2 + fres * 0.85 + 0.15 * band;
          else {
            float fl = step(0.55, fract(sin(floor(uFxTime * 20.0) * 1.7 + cell * 9.0) * 43758.5453));
            a = fres * 0.55 + fl * step(0.86, cell) * 1.4;
          }
          gl_FragColor = vec4(uFxColor * a * uFxK * opacity, 1.0);
        }`,
      )
  }
  m.customProgramCacheKey = () => 'xcShell'
  shellCache.set(key, m)
  return m
}


// ───────── 帽子（共用 geometry）─────────

let hatGeo: { cone: THREE.BufferGeometry; brim: THREE.BufferGeometry; pom: THREE.BufferGeometry; tri: THREE.BufferGeometry; crown: THREE.BufferGeometry; bone: THREE.BufferGeometry; skull: THREE.BufferGeometry } | null = null

function hats(): NonNullable<typeof hatGeo> {
  if (hatGeo) return hatGeo
  // 節慶帽：微彎的錐體
  const cone = new THREE.ConeGeometry(0.15, 0.32, 18, 6, true)
  const p = cone.attributes.position
  for (let i = 0; i < p.count; i++) {
    const y = p.getY(i) + 0.16
    const bend = (y / 0.32) ** 2 * 0.09
    p.setZ(i, p.getZ(i) - bend)
    p.setY(i, y)
  }
  cone.computeVertexNormals()
  // 海盜三角帽：圓角三角形帽簷（擠出）
  const s = new THREE.Shape()
  const R = 0.25
  for (let i = 0; i < 3; i++) {
    const a = (i / 3) * Math.PI * 2 + Math.PI / 2
    const a2 = a + (Math.PI * 2) / 3
    const px = Math.cos(a) * R
    const py = Math.sin(a) * R
    if (i === 0) s.moveTo(px, py)
    const mx = Math.cos((a + a2) / 2) * R * 0.62
    const my = Math.sin((a + a2) / 2) * R * 0.62
    s.quadraticCurveTo(mx, my, Math.cos(a2) * R, Math.sin(a2) * R)
  }
  const tri = new THREE.ExtrudeGeometry(s, { depth: 0.03, bevelEnabled: true, bevelThickness: 0.012, bevelSize: 0.012, bevelSegments: 2, curveSegments: 10 })
  tri.rotateX(-Math.PI / 2)
  hatGeo = {
    cone,
    brim: new THREE.TorusGeometry(0.15, 0.035, 8, 22).rotateX(Math.PI / 2),
    pom: new THREE.SphereGeometry(0.045, 10, 8),
    tri,
    crown: new THREE.CylinderGeometry(0.11, 0.135, 0.12, 18),
    bone: new THREE.CapsuleGeometry(0.008, 0.07, 2, 6),
    skull: new THREE.SphereGeometry(0.024, 10, 8),
  }
  return hatGeo
}

function buildHat(kind: 'festive' | 'pirate'): THREE.Group {
  const g = hats()
  const root = new THREE.Group()
  const add = (geo: THREE.BufferGeometry, mat: THREE.Material, x = 0, y = 0, z = 0, rx = 0, rz = 0) => {
    const m = new THREE.Mesh(geo, mat)
    m.position.set(x, y, z)
    m.rotation.set(rx, 0, rz)
    m.castShadow = true
    m.userData.fx = true
    root.add(m)
    return m
  }
  if (kind === 'festive') {
    add(g.cone, Mat.cloth('#c8323c', '#ffd0a0'), 0, 0.02, 0)
    add(g.brim, Mat.fabric('#efe9e0'), 0, 0.03, 0)
    add(g.pom, Mat.fabric('#f4f0ea'), 0, 0.34, -0.09)
    const star = add(GEO.octa, Mat.emissive('#ffd27a', 2.2), 0.06, 0.16, 0.12)
    star.scale.setScalar(0.018)
  } else {
    add(g.crown, Mat.fabric('#16161a'), 0, 0.08, 0)
    const brim = add(g.tri, Mat.fabric('#1d1c20'), 0, 0.02, 0)
    brim.rotation.y = Math.PI
    const trim = add(GEO.torus, Mat.metal('#c8a050', 0.9, false), 0, 0.045, 0)
    trim.scale.set(0.13, 0.4, 0.13)
    add(g.skull, Mat.paint('#ece6d8', 0.6), 0, 0.1, 0.125)
    add(g.bone, Mat.paint('#ece6d8', 0.6), 0, 0.075, 0.13, 0, 0.9)
    add(g.bone, Mat.paint('#ece6d8', 0.6), 0, 0.075, 0.13, 0, -0.9)
  }
  root.traverse((o) => ((o as THREE.Mesh).raycast = () => {}))
  return root
}

// ───────── 狀態 ─────────

interface Ctx {
  gs: GameScene
  v: UnitView
  e: CEnt
  body: THREE.Object3D
  t: number
  dt: number
  x: number
  y: number
  h: number
  z: number
}

interface Att {
  update?(c: Ctx): void
  dispose(): void
}

interface EntState {
  body: THREE.Object3D | null
  atts: Map<string, Att>
}

let ghostsAlive = 0
const STATES = new WeakMap<GameScene, Map<number, EntState>>()

/** buff id 的視覺 key（同一個 fx 名稱但需要不同外觀的在這裡分流）*/
const OVERRIDE: Record<string, string> = {
  'bf.force.pull': 'forcePull',
  'bf.guard.absorbed': 'forceWard',
  'bf.criticalCare': 'lifeSupport',
  'bf.pyro.overheat': 'overheat',
  'bf.pyro.burn': 'burn',
  'bf.cloak.phase': 'stealth',
}

function keysOf(e: CEnt, out: Set<string>): void {
  out.clear()
  for (const id of e.s.b ?? []) {
    const k = OVERRIDE[id] ?? BUFFS.get(id)?.fx
    if (k) out.add(k)
  }
  const fl = e.s.fl ?? 0
  if (fl & EntFlag.Petrified) out.add('petrify')
  if (fl & EntFlag.Stealth && !out.has('void')) out.add('stealth')
  if (fl & EntFlag.Shielded && !out.has('shield') && !out.has('solace') && !out.has('stasis')) out.add('solace')
  if (fl & EntFlag.Stunned && !out.has('petrify') && !out.has('tripped') && !out.has('lifeSupport') && !out.has('stasis')) out.add('stun')
  if (out.has('petrify')) {
    // 石像不再顯示其他身上的效果
    for (const k of [...out]) if (k !== 'petrify' && !k.startsWith('hat')) out.delete(k)
  }
  if (out.has('stasis')) out.delete('flux')
}

// ───────── 共用附件 ─────────

function noRay(o: THREE.Object3D): THREE.Object3D {
  o.traverse((c) => {
    ;(c as THREE.Mesh).raycast = () => {}
    c.userData.fx = true
  })
  return o
}

/** 單位每個 mesh 掛一個殼層子 mesh */
function shell(body: THREE.Object3D, mat: THREE.MeshStandardMaterial): Att {
  const parts: THREE.Mesh[] = []
  body.traverse((o) => {
    const m = o as THREE.Mesh
    if (!m.isMesh || m.userData.fx || parts.length > 80) return
    const src = m.material as THREE.Material
    if (!src || src.blending === THREE.AdditiveBlending) return
    parts.push(m)
  })
  const shells: THREE.Mesh[] = []
  for (const m of parts) {
    let s: THREE.Mesh
    const sk = m as unknown as THREE.SkinnedMesh
    if (sk.isSkinnedMesh) {
      const ss = new THREE.SkinnedMesh(m.geometry, mat)
      ss.bind(sk.skeleton, sk.bindMatrix)
      ss.bindMode = sk.bindMode
      s = ss
    } else s = new THREE.Mesh(m.geometry, mat)
    s.userData.fx = true
    s.raycast = () => {}
    s.castShadow = false
    s.receiveShadow = false
    s.renderOrder = 5
    s.frustumCulled = false
    m.add(s)
    shells.push(s)
  }
  return {
    dispose() {
      for (const s of shells) s.removeFromParent()
    },
  }
}

function attach(c: Ctx, obj: THREE.Object3D, update?: (c: Ctx) => void): Att {
  noRay(obj)
  c.v.root.add(obj)
  return {
    update,
    dispose() {
      obj.removeFromParent()
      obj.traverse((o) => {
        const m = (o as THREE.Mesh).material as THREE.Material | undefined
        if (m && m.userData.own) m.dispose()
      })
    },
  }
}

function combine(...atts: Att[]): Att {
  return {
    update(c) {
      for (const a of atts) a.update?.(c)
    },
    dispose() {
      for (const a of atts) a.dispose()
    },
  }
}

/** 依頻率發粒子 */
function emitter(dt: number, fn: (c: Ctx) => void): Att {
  let acc = Math.random() * dt
  return {
    update(c) {
      acc += c.dt
      if (acc < dt) return
      acc = 0
      fn(c)
    },
    dispose() {},
  }
}

/** 自有材質（附件結束時 dispose）*/
function own<T extends THREE.Material>(m: T): T {
  m.userData.own = true
  return m
}

function basic(color: string, k: number, o: { opacity?: number; map?: THREE.Texture; add?: boolean; side?: THREE.Side } = {}): THREE.MeshBasicMaterial {
  return own(
    new THREE.MeshBasicMaterial({
      color: new THREE.Color(color).multiplyScalar(k),
      transparent: true,
      opacity: o.opacity ?? 1,
      depthWrite: false,
      map: o.map ?? null,
      side: o.side ?? THREE.FrontSide,
      blending: o.add === false ? THREE.NormalBlending : THREE.AdditiveBlending,
    }),
  )
}

/** 根節點的縮放（def.scale）— 附件要用本地座標，所以高度要除回去 */
function invScale(c: Ctx): number {
  return 1 / (c.v.root.scale.y || 1)
}

/** 泡泡護盾 */
function bubble(c: Ctx, color: string, k: number, hex: number, rep: [number, number] = [10, 6], tex: 'hex' | 'clock' | 'grid' = 'hex'): Att {
  const mat = own(shieldMat(color, k, hex, rep, tex))
  const m = new THREE.Mesh(GEO.sphere, mat)
  m.renderOrder = 6
  const s = invScale(c)
  const r = Math.max(0.65, c.h * 0.58) * s
  m.scale.setScalar(r)
  m.position.y = c.h * 0.46 * s
  let born = -1
  return attach(c, m, (cc) => {
    if (born < 0) born = cc.t
    const age = cc.t - born
    mat.uniforms.uTime.value = cc.t
    const pop = age < 0.18 ? 0.7 + (age / 0.18) * 0.3 : 1
    m.scale.setScalar(r * pop * (1 + Math.sin(cc.t * 3) * 0.015))
    mat.uniforms.uOpacity.value = Math.min(1, age / 0.15)
  })
}

/** 腳下的旋轉地面標記 */
function floorMark(c: Ctx, tex: 'clock' | 'arrows' | 'web' | 'ring' | 'trefoil' | 'swirl' | 'cross', color: string, r: number, k: number, spin: number, opacity = 0.7, pulse = 0): Att {
  const m = new THREE.Mesh(GEO.flat, basic(color, k, { map: fxTex(tex), opacity }))
  const s = invScale(c)
  m.scale.setScalar(r * s)
  m.position.y = 0.05 * s
  m.renderOrder = 4
  const mm = m.material as THREE.MeshBasicMaterial
  return attach(c, m, (cc) => {
    m.rotation.y += spin * cc.dt
    if (pulse) mm.opacity = opacity * (0.6 + 0.4 * Math.sin(cc.t * pulse * Math.PI * 2))
  })
}

/** 頭頂繞圈的星星／光點 */
function orbiters(c: Ctx, n: number, color: string, tex: 'star' | 'soft', size: number, radius: number, speed: number, hk = 1.05): Att {
  const g = new THREE.Group()
  const sp: THREE.Sprite[] = []
  for (let i = 0; i < n; i++) {
    const s = new THREE.Sprite(own(new THREE.SpriteMaterial({ map: fxTex(tex), color: new THREE.Color(color).multiplyScalar(2.4), transparent: true, depthWrite: false, blending: THREE.AdditiveBlending })))
    s.scale.setScalar(size)
    g.add(s)
    sp.push(s)
  }
  const s = invScale(c)
  return attach(c, g, (cc) => {
    sp.forEach((o, i) => {
      const a = cc.t * speed + (i / n) * Math.PI * 2
      o.position.set(Math.cos(a) * radius * s, (cc.h * hk + Math.sin(a * 2) * 0.05) * s, Math.sin(a) * radius * s)
      o.material.rotation = cc.t * 3
    })
  })
}

// ───────── 各 buff 的視覺 ─────────

type Factory = (c: Ctx) => Att

const drip = (color: string, color2: string, rate: number, hk: number) =>
  emitter(rate, (c) => c.gs.fx.emit(c.z, c.x + (Math.random() - 0.5) * 0.3, c.y + (Math.random() - 0.5) * 0.3, c.h * hk * (0.6 + Math.random() * 0.4), 1, { color, color2, speed: 0.1, life: 0.8, size: 0.09, up: -0.3, grav: 7, drag: 0.2 }))

const FACTORIES: Record<string, Factory> = {
  stim: (c) => {
    let last = 0
    return combine(
      emitter(0.03, (cc) => {
        if (cc.v.speed < 0.6) return
        cc.gs.fx.emit(cc.z, cc.x, cc.y, 0.15 + Math.random() * cc.h * 0.6, 1, { color: '#ffb46b', color2: '#ff3b3b', speed: 0.2, life: 0.35, size: 0.12, up: 0.1 })
      }),
      {
        update(cc) {
          if (cc.v.speed < 0.6 || cc.t - last < 0.09 || ghostsAlive >= 10) return
          last = cc.t
          ghostsAlive++
          ghost(cc.gs, cc.body, '#ff8a4a', 0.32, { opacity: 0.4, k: 1.4 })
          cc.gs.fx.after(0.32, () => ghostsAlive--)
        },
        dispose() {},
      },
      shell(c.body, shellMat('rim', '#ff7a3a', 0.6)),
    )
  },
  stealth: (c) =>
    combine(
      shell(c.body, shellMat('shimmer', '#bfefff', 1.3)),
      emitter(0.25, (cc) => cc.gs.fx.emit(cc.z, cc.x, cc.y, Math.random() * cc.h, 1, { color: '#d8f6ff', speed: 0.2, life: 0.4, size: 0.08, up: 0.4, area: 0.3 })),
    ),
  void: (c) =>
    combine(
      shell(c.body, shellMat('phase', '#9b5de5', 1.6)),
      emitter(0.05, (cc) => cc.gs.fx.emit(cc.z, cc.x, cc.y, Math.random() * cc.h, 1, { color: '#c9a8ff', color2: '#2a0a4a', speed: 0.5, life: 0.4, size: 0.12, up: 0.3, area: 0.4 })),
    ),
  shield: (c) => combine(bubble(c, '#ffc23d', 2.2, 1.1), shell(c.body, shellMat('rim', '#ffc23d', 0.7))),
  solace: (c) =>
    combine(
      bubble(c, '#ffe8b0', 1.6, 0.45, [6, 3]),
      emitter(0.12, (cc) => cc.gs.fx.emit(cc.z, cc.x, cc.y, 0.2, 1, { color: '#fff4d0', speed: 0.2, life: 1.2, size: 0.1, up: 1.4, area: 0.5 })),
    ),
  forceWard: (c) => bubble(c, '#e8f6ff', 2.2, 1.2, [12, 6]),
  forcePull: (c) => floorMark(c, 'arrows', '#e8f6ff', 0.9, 1.4, -1.6, 0.55),
  petrify: (c) => {
    // 整個單位換成石材
    const saved = new Map<THREE.Mesh, THREE.Material | THREE.Material[]>()
    c.body.traverse((o) => {
      const m = o as THREE.Mesh
      if (!m.isMesh || m.userData.fx) return
      const mat = m.material as THREE.Material
      if (!mat || mat.blending === THREE.AdditiveBlending) {
        if (mat) {
          saved.set(m, m.material)
          m.visible = false
        }
        return
      }
      saved.set(m, m.material)
      m.material = stoneMat()
    })
    c.gs.fx.decal(c.z, c.x, c.y, 1.6, 'crack', '#2a2824', 30, { opacity: 0.6 })
    return combine(
      {
        dispose() {
          for (const [m, mat] of saved) {
            if (m.material === stoneMat()) m.material = mat
            if ((mat as THREE.Material).blending === THREE.AdditiveBlending) m.visible = true
          }
        },
      },
      emitter(0.7, (cc) => cc.gs.fx.emit(cc.z, cc.x, cc.y, cc.h * Math.random(), 1, { color: '#8a867a', speed: 0.1, life: 1.4, size: 0.12, up: -0.2, grav: 2, layer: 'smoke', alpha: 0.5 })),
    )
  },
  cryo: (c) => {
    const g = new THREE.Group()
    const s = invScale(c)
    for (let i = 0; i < 6; i++) {
      const a = (i / 6) * Math.PI * 2 + Math.random() * 0.4
      const m = new THREE.Mesh(GEO.octa, basic('#bfefff', 1.4, { opacity: 0.75 }))
      const r = 0.25 + Math.random() * 0.12
      m.position.set(Math.cos(a) * r * s, 0.08 * s, Math.sin(a) * r * s)
      m.scale.set(0.05 * s, (0.12 + Math.random() * 0.12) * s, 0.05 * s)
      m.rotation.set((Math.random() - 0.5) * 0.8, a, (Math.random() - 0.5) * 0.8)
      g.add(m)
    }
    const frost = new THREE.Mesh(GEO.flat, basic('#ffffff', 0.7, { map: fxTex('frost'), opacity: 0.7 }))
    frost.scale.setScalar(0.75 * s)
    frost.position.y = 0.04 * s
    g.add(frost)
    return combine(
      shell(c.body, shellMat('ice', '#bfefff', 0.9)),
      attach(c, g),
      emitter(0.15, (cc) => cc.gs.fx.emit(cc.z, cc.x, cc.y, 0.3, 1, { color: '#e8f6ff', speed: 0.3, life: 1.2, size: 0.4, up: 0.1, area: 0.3, layer: 'smoke', alpha: 0.3 })),
    )
  },
  burn: (c) =>
    combine(
      shell(c.body, shellMat('rim', '#ff6a2a', 0.8)),
      emitter(0.03, (cc) => {
        cc.gs.fx.emit(cc.z, cc.x, cc.y, cc.h * (0.15 + Math.random() * 0.6), 2, { color: '#ffe0a0', color2: '#ff2a0a', speed: 0.3, life: 0.45, size: 0.3, grow: 1.4, up: 2.2, area: 0.22, drag: 1 })
      }),
      emitter(0.18, (cc) => cc.gs.fx.emit(cc.z, cc.x, cc.y, cc.h * 0.9, 1, { color: '#2a2420', speed: 0.2, life: 1.2, size: 0.4, up: 1.5, layer: 'smoke', alpha: 0.35 })),
    ),
  overheat: (c) =>
    combine(
      shell(c.body, shellMat('rim', '#ff4a1a', 1.6)),
      emitter(0.05, (cc) => cc.gs.fx.emit(cc.z, cc.x, cc.y, cc.h * (0.3 + Math.random() * 0.5), 1, { color: '#ffd080', color2: '#ff3b1a', speed: 0.6, life: 0.6, size: 0.1, up: 2, area: 0.25 })),
      emitter(0.2, (cc) => cc.gs.fx.emit(cc.z, cc.x, cc.y, cc.h * 0.8, 1, { color: '#cfc8c0', speed: 0.3, life: 0.8, size: 0.3, up: 1.4, layer: 'smoke', alpha: 0.18 })),
    ),
  acid: (c) =>
    combine(
      shell(c.body, shellMat('rim', '#b6ff3a', 0.6)),
      drip('#c8ff3a', '#4a6a10', 0.09, 0.8),
      emitter(0.3, (cc) => cc.gs.fx.emit(cc.z, cc.x, cc.y, cc.h * Math.random(), 1, { color: '#e8ff9a', speed: 0.1, life: 0.6, size: 0.12, up: 0.4, area: 0.2, layer: 'smoke', alpha: 0.25 })),
    ),
  neurotoxin: (c) =>
    combine(
      shell(c.body, shellMat('rim', '#7dff6a', 0.55)),
      drip('#9aff6a', '#1a5a1a', 0.07, 0.95),
      emitter(0.4, (cc) => cc.gs.fx.emit(cc.z, cc.x, cc.y, cc.h * 0.9, 1, { color: '#5aaa3a', speed: 0.2, life: 1, size: 0.12, up: 0.4, area: 0.15 })),
    ),
  sludge: (c) => {
    const pud = new THREE.Mesh(GEO.flat, basic('#3a4a14', 1, { map: fxTex('splat'), opacity: 0.85, add: false }))
    pud.scale.setScalar(0.55 * invScale(c))
    pud.position.y = 0.03 * invScale(c)
    return combine(shell(c.body, shellMat('rim', '#a8b040', 0.5)), drip('#8a9a3a', '#2a2a0a', 0.08, 0.7), attach(c, pud))
  },
  rad: (c) =>
    combine(
      shell(c.body, shellMat('rim', '#7dff6a', 0.9)),
      emitter(0.08, (cc) => cc.gs.fx.emit(cc.z, cc.x, cc.y, cc.h * Math.random(), 1, { color: '#b8ff9a', speed: 0.2, life: 0.9, size: 0.09, up: 0.9, area: 0.35 })),
    ),
  plasma: (c) =>
    combine(
      shell(c.body, shellMat('electric', '#7dff6a', 1)),
      emitter(0.07, (cc) => cc.gs.fx.emit(cc.z, cc.x, cc.y, cc.h * (0.3 + Math.random() * 0.5), 1, { color: '#c8ff9a', speed: 1, life: 0.35, size: 0.1, up: 0.5 })),
    ),
  emp: (c) =>
    combine(
      shell(c.body, shellMat('electric', '#7fd8ff', 1.4)),
      emitter(0.06, (cc) => cc.gs.fx.emit(cc.z, cc.x, cc.y, cc.h * Math.random(), 2, { color: '#ffffff', color2: '#7fd8ff', speed: 2.4, life: 0.18, size: 1, up: 0.4, layer: 'spark', area: 0.25 })),
    ),
  tesla: (c) =>
    combine(
      shell(c.body, shellMat('electric', '#7fd8ff', 1.2)),
      emitter(0.22, (cc) => {
        const a = Math.random() * Math.PI * 2
        const b = a + 1 + Math.random() * 2
        bolt(cc.gs, cc.z, W(cc.x + Math.cos(a) * 0.3, cc.y + Math.sin(a) * 0.3, cc.h * (0.2 + Math.random() * 0.6)), W(cc.x + Math.cos(b) * 0.3, cc.y + Math.sin(b) * 0.3, cc.h * (0.2 + Math.random() * 0.6)), '#9fd8ff', 0.012, 0.09, { branches: 0, jag: 1.6 })
      }),
    ),
  rage: (c) =>
    combine(
      shell(c.body, shellMat('electric', '#ff5a3a', 1.3)),
      emitter(0.06, (cc) => cc.gs.fx.emit(cc.z, cc.x, cc.y, cc.h * Math.random(), 1, { color: '#ffb46b', color2: '#c8323c', speed: 0.6, life: 0.6, size: 0.12, up: 1.2, area: 0.35 })),
      emitter(0.5, (cc) => {
        const a = Math.random() * Math.PI * 2
        bolt(cc.gs, cc.z, W(cc.x, cc.y, cc.h * 0.7), W(cc.x + Math.cos(a) * 0.7, cc.y + Math.sin(a) * 0.7, 0.05), '#ff6a4a', 0.015, 0.1, { branches: 0, jag: 1.4 })
      }),
    ),
  roar: (c) => combine(shell(c.body, shellMat('rim', '#ff3b2a', 1.1)), floorMark(c, 'ring', '#c8323c', 1.1, 1.6, 0, 0.6, 2.2)),
  entropy: (c) =>
    combine(
      shell(c.body, shellMat('rim', '#8a4cff', 0.7)),
      emitter(0.05, (cc) => cc.gs.fx.emit(cc.z, cc.x, cc.y, cc.h * Math.random(), 1, { color: '#b28cff', color2: '#33ffd1', speed: 0.4, life: 0.5, size: 0.1, up: 0.1, area: 0.5, ring: true, radial: -1, swirl: 4 })),
    ),
  flux: (c) =>
    combine(
      shell(c.body, shellMat('rim', '#7fd8ff', 0.6)),
      floorMark(c, 'clock', '#7fd8ff', 0.9, 1.4, -0.25, 0.6),
      emitter(0.2, (cc) => cc.gs.fx.emit(cc.z, cc.x, cc.y, cc.h * Math.random(), 1, { color: '#bfefff', speed: 0.05, life: 2, size: 0.1, up: 0.2, area: 0.4, drag: 0 })),
    ),
  stasis: (c) => {
    // 時滯護罩：琥珀色晶體把單位封在裡面
    const mat = own(shieldMat('#ffd27a', 1.8, 0.6, [4, 3], 'clock'))
    const m = new THREE.Mesh(GEO.octa, mat)
    const s = invScale(c)
    m.scale.set(Math.max(0.55, c.h * 0.42) * s, c.h * 0.75 * s, Math.max(0.55, c.h * 0.42) * s)
    m.position.y = c.h * 0.5 * s
    m.renderOrder = 6
    return combine(
      shell(c.body, shellMat('gold', '#ffd27a', 0.8)),
      attach(c, m, (cc) => {
        mat.uniforms.uTime.value = cc.t
        m.rotation.y = cc.t * 0.3
      }),
      floorMark(c, 'clock', '#ffd27a', 1.1, 1.6, 0.4, 0.7),
    )
  },
  web: (c) => {
    const g = new THREE.Group()
    const s = invScale(c)
    for (let i = 0; i < 4; i++) {
      const m = new THREE.Mesh(GEO.torus, basic('#eaf6ff', 1.2, { opacity: 0.8 }))
      m.position.y = (0.15 + i * 0.16) * s
      const r = (0.26 - i * 0.02) * s
      m.scale.set(r, 1.2 * s, r)
      m.rotation.set((Math.random() - 0.5) * 0.6, Math.random() * 3, (Math.random() - 0.5) * 0.6)
      g.add(m)
    }
    const decal = new THREE.Mesh(GEO.flat, basic('#eaf6ff', 0.8, { map: fxTex('web'), opacity: 0.6 }))
    decal.scale.setScalar(0.9 * s)
    decal.position.y = 0.04 * s
    g.add(decal)
    return combine(attach(c, g), shell(c.body, shellMat('rim', '#eaf6ff', 0.4)))
  },
  tripped: (c) => combine(orbiters(c, 3, '#ffe08a', 'star', 0.22, 0.28, 5), floorMark(c, 'web', '#eaf6ff', 0.6, 0.8, 0, 0.5)),
  stun: (c) => orbiters(c, 3, '#ffe08a', 'star', 0.2, 0.26, 5),
  lifeSupport: (c) => {
    const s = invScale(c)
    const cross = new THREE.Mesh(GEO.plane, basic('#5cf2a5', 2.4, { map: fxTex('cross'), side: THREE.DoubleSide }))
    cross.scale.setScalar(0.36 * s)
    cross.position.y = (c.h + 0.35) * s
    return combine(
      attach(c, cross, (cc) => {
        cross.rotation.y = cc.t * 2
        cross.position.y = (cc.h + 0.35 + Math.sin(cc.t * 3) * 0.05) * s
      }),
      floorMark(c, 'ring', '#5cf2a5', 0.9, 1.8, 0, 0.8, 1.2),
      shell(c.body, shellMat('gold', '#5cf2a5', 0.6)),
    )
  },
  mag: (c) => {
    const g = new THREE.Group()
    const shards: THREE.Mesh[] = []
    for (let i = 0; i < 4; i++) {
      const m = new THREE.Mesh(GEO.octa, Mat.metal('#9ab0b8', 0.9, false))
      m.scale.set(0.02, 0.06, 0.02)
      g.add(m)
      shards.push(m)
    }
    const s = invScale(c)
    return combine(
      attach(c, g, (cc) => {
        shards.forEach((m, i) => {
          const a = cc.t * 2.2 + (i / shards.length) * Math.PI * 2
          m.position.set(Math.cos(a) * 0.34 * s, (cc.h * 0.55 + Math.sin(a * 1.7) * 0.15) * s, Math.sin(a) * 0.34 * s)
          m.rotation.set(a, a * 1.3, 0)
        })
      }),
      emitter(0.3, (cc) => cc.gs.fx.emit(cc.z, cc.x, cc.y, cc.h * 0.55, 1, { color: '#33ffd1', speed: 0.6, life: 0.3, size: 0.08, up: 0.2 })),
    )
  },
  photon: (c) => {
    const s = invScale(c)
    const sp = new THREE.Sprite(own(new THREE.SpriteMaterial({ map: fxTex('star'), color: new THREE.Color('#fff8e0').multiplyScalar(2.4), transparent: true, depthWrite: false, blending: THREE.AdditiveBlending })))
    sp.position.y = c.h * 0.9 * s
    return combine(
      attach(c, sp, (cc) => {
        sp.scale.setScalar((0.6 + Math.random() * 0.25) * s)
        sp.material.rotation = cc.t
      }),
      shell(c.body, shellMat('rim', '#fff2c8', 0.5)),
    )
  },
  blackness: (c) => {
    const s = invScale(c)
    const sp = new THREE.Sprite(own(new THREE.SpriteMaterial({ map: fxTex('smoke'), color: '#050208', transparent: true, depthWrite: false, opacity: 0.9 })))
    sp.position.y = c.h * 0.9 * s
    return combine(
      attach(c, sp, (cc) => {
        sp.scale.setScalar((0.75 + Math.sin(cc.t * 3) * 0.08) * s)
        sp.material.rotation = cc.t * 0.6
      }),
      emitter(0.08, (cc) => cc.gs.fx.emit(cc.z, cc.x, cc.y, cc.h * 0.9, 1, { color: '#0a0410', speed: 0.3, life: 0.9, size: 0.35, up: 0.2, area: 0.15, layer: 'smoke', alpha: 0.7 })),
      emitter(0.3, (cc) => cc.gs.fx.emit(cc.z, cc.x, cc.y, cc.h * 0.9, 1, { color: '#7a3cff', speed: 0.3, life: 0.5, size: 0.1, up: 0.1, area: 0.2 })),
    )
  },
  rotary: (c) => {
    const s = invScale(c)
    const disc = new THREE.Mesh(GEO.flat, basic('#ffb000', 1.3, { map: fxTex('swirl'), opacity: 0.55, side: THREE.DoubleSide }))
    disc.scale.setScalar(Math.max(0.7, c.h * 0.5) * s)
    disc.position.y = c.h * 0.45 * s
    return combine(
      attach(c, disc, (cc) => (disc.rotation.y -= cc.dt * 22)),
      emitter(0.04, (cc) => {
        cc.gs.fx.emit(cc.z, cc.x, cc.y, 0.25, 1, { color: '#ffe0a0', color2: '#ff6a00', speed: 1.2, life: 0.2, size: 0.25, up: -1, area: 0.2 })
        cc.gs.fx.emit(cc.z, cc.x, cc.y, 0.05, 1, { color: '#8a8078', speed: 2, life: 0.7, size: 0.4, up: 0.1, area: 0.3, radial: 1, layer: 'smoke', alpha: 0.35 })
      }),
    )
  },
  gatling: (c) => {
    // 架設：前方射界扇形（跟著朝向轉）
    const s = invScale(c)
    const geo = new THREE.CircleGeometry(6.5, 24, -Math.PI / 2 - 0.7, 1.4).rotateX(-Math.PI / 2)
    const m = new THREE.Mesh(geo, basic('#ffc23d', 0.5, { map: fxTex('soft'), opacity: 0.18 }))
    m.scale.setScalar(s)
    m.position.y = 0.04 * s
    const edge = new THREE.Mesh(new THREE.RingGeometry(0.4, 0.5, 24, 1, -Math.PI / 2 - 0.7, 1.4).rotateX(-Math.PI / 2), basic('#ffc23d', 1.8, { opacity: 0.7 }))
    edge.scale.setScalar(s)
    edge.position.y = 0.05 * s
    const g = new THREE.Group()
    g.add(m, edge)
    const a = attach(c, g, (cc) => {
      ;(m.material as THREE.MeshBasicMaterial).opacity = 0.14 + 0.05 * Math.sin(cc.t * 4)
    })
    return {
      update: a.update,
      dispose() {
        a.dispose()
        geo.dispose()
        edge.geometry.dispose()
      },
    }
  },
  hatFestive: (c) => hat(c, 'festive'),
  hatPirate: (c) => hat(c, 'pirate'),
}

function hat(c: Ctx, kind: 'festive' | 'pirate'): Att {
  const h = buildHat(kind)
  if (c.v.rig) {
    h.position.y = 0.125
    c.v.rig.head.add(h)
  } else {
    h.position.y = c.h * invScale(c) - 0.02
    h.scale.setScalar(Math.max(1, c.h * invScale(c) / 1.8) * 1.2)
    c.body.add(h)
  }
  return {
    dispose() {
      h.removeFromParent()
    },
  }
}

// ───────── 實體裝飾：小行星、蛛絲連線 ─────────

interface Link {
  mesh: THREE.Group
  a: number
  b: number
}

const LINKS = new WeakMap<GameScene, Map<number, Link>>()
let rockDustT = 0

function decorate(gs: GameScene, dt: number, t: number): void {
  // 蛛絲錨點：x2.link → 兩錨點間的絲線（含一條略垂的副絲）
  let links = LINKS.get(gs)
  if (!links) LINKS.set(gs, (links = new Map()))
  const seen = new Set<number>()
  rockDustT -= dt
  const dust = rockDustT <= 0
  if (dust) rockDustT = 0.12
  for (const [id, v] of gs.units.views) {
    const e = gs.world.ents.get(id)
    if (!e) continue
    if (e.s.d === 'space.asteroid' && v.model) {
      const sc = Number(e.s.x2?.sc ?? 1) || 1
      v.model.root.scale.setScalar(sc)
      if (dust) {
        gs.fx.emit(gs.zone, e.x - Math.cos(e.f) * 0.6 * sc, e.y - Math.sin(e.f) * 0.6 * sc, 0.2, 1, { color: '#6a625a', speed: 0.15, life: 2.4, size: 0.9 * sc, up: 0, layer: 'smoke', alpha: 0.35, drag: 0.5 })
        if (Math.random() < 0.3) gs.fx.emit(gs.zone, e.x, e.y, 0.2, 1, { color: '#ffb46b', speed: 0.3, life: 0.8, size: 0.25, up: 0 })
      }
    }
    const link = e.s.x2?.link
    if (typeof link === 'number' && gs.units.views.has(link)) {
      seen.add(id)
      let L = links.get(id)
      if (!L || L.b !== link) {
        if (L) disposeLink(L)
        const g = new THREE.Group()
        const main = new THREE.Mesh(GEO.beam, new THREE.MeshBasicMaterial({ color: new THREE.Color('#eaf6ff').multiplyScalar(1.6), transparent: true, opacity: 0.85, depthWrite: false, blending: THREE.AdditiveBlending }))
        const sag = new THREE.Mesh(GEO.beam, new THREE.MeshBasicMaterial({ color: new THREE.Color('#c8e8ff').multiplyScalar(1.2), transparent: true, opacity: 0.5, depthWrite: false, blending: THREE.AdditiveBlending }))
        g.add(main, sag)
        noRay(g)
        gs.scene.add(g)
        L = { mesh: g, a: id, b: link }
        links.set(id, L)
      }
      const va = v.root.position
      const vb = gs.units.views.get(link)!.root.position
      const A = new THREE.Vector3(va.x, 0.62, va.z)
      const B = new THREE.Vector3(vb.x, 0.62, vb.z)
      const [main, sag] = L.mesh.children as THREE.Mesh[]
      main.position.copy(A)
      main.lookAt(B)
      const len = A.distanceTo(B)
      main.scale.set(0.01, 0.01, len)
      sag.position.copy(A).y -= 0.12
      sag.lookAt(B.x, B.y - 0.12, B.z)
      sag.scale.set(0.006, 0.006, len)
      ;(main.material as THREE.MeshBasicMaterial).opacity = 0.7 + 0.15 * Math.sin(t * 2 + id)
    }
  }
  for (const [id, L] of links) {
    if (!seen.has(id)) {
      disposeLink(L)
      links.delete(id)
    }
  }
}

function disposeLink(L: Link): void {
  L.mesh.removeFromParent()
  L.mesh.traverse((o) => ((o as THREE.Mesh).material as THREE.Material | undefined)?.dispose())
}

// ───────── 主迴圈 ─────────

const keys = new Set<string>()

/** 每幀呼叫一次（GameScene.update，units.sync 之後）*/
export function updateBuffFx(gs: GameScene, dt: number, t: number): void {
  let states = STATES.get(gs)
  if (!states) STATES.set(gs, (states = new Map()))
  for (const m of shellCache.values()) (m.userData.fxU as { uFxTime: { value: number } }).uFxTime.value = t
  const alive = new Set<number>()
  for (const [id, v] of gs.units.views) {
    const e = gs.world.ents.get(id)
    if (!e) continue
    const body = v.rig?.root ?? v.model?.root ?? null
    if (!body) continue
    keysOf(e, keys)
    let st = states.get(id)
    if (!st && !keys.size) continue
    if (!st) states.set(id, (st = { body, atts: new Map() }))
    alive.add(id)
    if (st.body !== body) {
      // 視圖重建了（換模型、換服裝）：舊附件跟著舊節點走，全部重來
      for (const a of st.atts.values()) a.dispose()
      st.atts.clear()
      st.body = body
    }
    const c: Ctx = { gs, v, e, body, t, dt, x: v.root.position.x, y: -v.root.position.z, h: v.height * (v.root.scale.y || 1), z: gs.zone }
    for (const [k, a] of st.atts) {
      if (!keys.has(k)) {
        a.dispose()
        st.atts.delete(k)
      }
    }
    for (const k of keys) {
      if (st.atts.has(k)) continue
      const f = FACTORIES[k]
      if (!f) continue
      try {
        st.atts.set(k, f(c))
      } catch (err) {
        if (__DEV__) console.error(err)
        st.atts.set(k, { dispose() {} })
      }
    }
    for (const a of st.atts.values()) a.update?.(c)
    if (!st.atts.size) states.delete(id)
  }
  for (const [id, st] of states) {
    if (alive.has(id)) continue
    for (const a of st.atts.values()) a.dispose()
    states.delete(id)
  }
  decorate(gs, dt, t)
}

/** 測試／截圖用：目前有哪些 buff 視覺 key 有實作 */
export const BUFF_VISUALS = Object.keys(FACTORIES)
