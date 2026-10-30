// 特效積木：給 fx handler 與 buff 視覺共用的高階組合（位置查詢、閃電、光束、護盾、殘影、警示圈、鏡頭震動、白屏）
import * as THREE from 'three'
import type { GameScene } from '../gameScene'
import type { ClientWorld } from '../../client/world'
import type { FxEvent } from '../../shared/protocol/messages'
import { W } from '../stationBuilder'
import { GEO } from '../fx'
import { fxTex } from './tex'

export { W }

const WHITE = new THREE.Color('#ffffff')

/** 顏色往白色靠（白熱核心）*/
export function hot(color: THREE.ColorRepresentation, k = 0.5): THREE.Color {
  return new THREE.Color(color).lerp(WHITE, k)
}

/** 實體目前的位置（優先用 render 插值後的視圖位置）與模型高度 */
export function entPos(gs: GameScene, id?: number): { x: number; y: number; h: number } | null {
  if (!id) return null
  const v = gs.units.views.get(id)
  if (v) return { x: v.root.position.x, y: -v.root.position.z, h: v.height * (v.root.scale.y || 1) }
  const e = gs.world.ents.get(id)
  if (e) return { x: e.x, y: e.y, h: 1.4 }
  return null
}

/** 事件的發生點：附著實體優先，否則事件座標 */
export function at(gs: GameScene, f: FxEvent, id = f.e): { x: number; y: number; h: number } {
  return entPos(gs, id) ?? { x: f.x, y: f.y, h: 1.4 }
}

/** 跟著實體走的 three 座標（h 為相對高度比例：0 腳下、1 頭頂）*/
export function follow3(gs: GameScene, id: number | undefined, hk = 0.5, fallback?: { x: number; y: number }): () => THREE.Vector3 | null {
  const v = new THREE.Vector3()
  let last: { x: number; y: number; h: number } | null = fallback ? { ...fallback, h: 1.4 } : null
  return () => {
    const p = entPos(gs, id) ?? last
    if (!p) return null
    last = p
    return v.set(p.x, p.h * hk, -p.y)
  }
}

/** 單位的槍口位置 */
export function muzzleOf(gs: GameScene, id?: number): { x: number; y: number; h: number } | null {
  if (!id) return null
  const v = gs.units.views.get(id)
  const e = gs.world.ents.get(id)
  if (!v || !e) return null
  if (v.rig) {
    const p = new THREE.Vector3()
    v.rig.muzzle.getWorldPosition(p)
    return { x: p.x, y: -p.z, h: p.y }
  }
  return { x: v.root.position.x, y: -v.root.position.z, h: v.height * 0.6 }
}

export function posOf(w: ClientWorld, id: number | undefined, fx: number, fy: number): { x: number; y: number } {
  const e = id ? w.ents.get(id) : undefined
  return e ? { x: e.x, y: e.y } : { x: fx, y: fy }
}

/** 鏡頭震動（依與鏡頭注視點的距離衰減）*/
export function shake(gs: GameScene, amt: number, x?: number, y?: number): void {
  let k = 1
  if (x !== undefined && y !== undefined) {
    const d = Math.hypot(x - gs.rts.tx, y - gs.rts.ty)
    k = Math.max(0, 1 - d / (gs.zone === 0 ? 70 : 24))
  }
  gs.rts.shake = Math.max(gs.rts.shake, Math.min(1, amt * k))
}

/** 全螢幕閃光（核爆、雷擊、日焰）*/
export function screenFlash(gs: GameScene, color: THREE.ColorRepresentation, k: number, dur: number, x?: number, y?: number): void {
  let a = 1
  if (x !== undefined && y !== undefined) {
    const d = Math.hypot(x - gs.rts.tx, y - gs.rts.ty)
    a = Math.max(0, 1 - d / (gs.zone === 0 ? 90 : 26))
  }
  if (a <= 0.02) return
  const m = gs.fx.mesh(GEO.plane, color, k, { depthTest: false, opacity: a })
  m.renderOrder = 999
  const mm = m.material as THREE.MeshBasicMaterial
  const fwd = new THREE.Vector3()
  const place = () => {
    const cam = gs.camera
    cam.getWorldDirection(fwd)
    m.position.copy(cam.position).addScaledVector(fwd, 1)
    m.quaternion.copy(cam.quaternion)
    m.scale.set(4, 4, 1)
  }
  place()
  gs.fx.addTransient(m, dur, gs.zone, (kk) => {
    place()
    mm.opacity = a * (1 - kk) ** 2
  })
}

// ───────── 閃電 ─────────

function boltPath(a: THREE.Vector3, b: THREE.Vector3, segs: number, jag: number): THREE.Vector3[] {
  const pts: THREE.Vector3[] = []
  const dir = b.clone().sub(a)
  const len = dir.length()
  const side = new THREE.Vector3(-dir.z, 0, dir.x).normalize()
  if (side.lengthSq() < 0.01) side.set(1, 0, 0)
  const up = new THREE.Vector3().crossVectors(dir, side).normalize()
  for (let i = 0; i <= segs; i++) {
    const t = i / segs
    const p = a.clone().lerp(b, t)
    if (i > 0 && i < segs) {
      const amp = jag * len * 0.12 * Math.sin(t * Math.PI) ** 0.6
      p.addScaledVector(side, (Math.random() - 0.5) * 2 * amp)
      p.addScaledVector(up, (Math.random() - 0.5) * 2 * amp * 0.7)
    }
    pts.push(p)
  }
  return pts
}

function tubeOf(pts: THREE.Vector3[], width: number): THREE.TubeGeometry {
  const path = new THREE.CurvePath<THREE.Vector3>()
  for (let i = 1; i < pts.length; i++) path.add(new THREE.LineCurve3(pts[i - 1], pts[i]))
  return new THREE.TubeGeometry(path, Math.max(2, (pts.length - 1) * 2), width, 4, false)
}

export interface BoltOpts {
  segs?: number
  jag?: number
  branches?: number
  /** 閃爍（重新生成路徑）間隔秒；0 不閃 */
  flicker?: number
  /** 外暈寬度倍率 */
  halo?: number
  k?: number
}

/** 分岔閃電：白熱細核心＋有色外暈，可閃爍重生路徑 */
export function bolt(gs: GameScene, z: number, a: THREE.Vector3, b: THREE.Vector3, color: THREE.ColorRepresentation, width: number, dur: number, o: BoltOpts = {}): void {
  const len = a.distanceTo(b)
  const segs = o.segs ?? Math.max(4, Math.min(16, Math.round(len * 2.2)))
  const jag = o.jag ?? 1
  const nb = o.branches ?? (len > 2 ? 2 : 0)
  const make = () => {
    const g = new THREE.Group()
    const main = boltPath(a, b, segs, jag)
    const core = new THREE.Mesh(tubeOf(main, width * 0.4), gs.fx.mat(hot(color, 0.7), o.k ?? 6))
    const halo = new THREE.Mesh(tubeOf(main, width * (o.halo ?? 2.6)), gs.fx.mat(color, 2.2, { opacity: 0.35 }))
    g.add(core, halo)
    for (let i = 0; i < nb; i++) {
      const s = main[1 + Math.floor(Math.random() * (main.length - 2))]
      const dir = b.clone().sub(a).normalize()
      const end = s.clone().addScaledVector(dir, len * (0.15 + Math.random() * 0.2)).add(new THREE.Vector3((Math.random() - 0.5) * len * 0.3, (Math.random() - 0.6) * len * 0.15, (Math.random() - 0.5) * len * 0.3))
      const bp = boltPath(s, end, 4, 1.4)
      g.add(new THREE.Mesh(tubeOf(bp, width * 0.25), gs.fx.mat(hot(color, 0.5), 4, { opacity: 0.8 })))
    }
    g.traverse((m) => ((m as THREE.Mesh).raycast = () => {}))
    return g
  }
  const variants = o.flicker && dur > o.flicker * 1.5 ? [make(), make()] : [make()]
  const root = new THREE.Group()
  for (const v of variants) root.add(v)
  const mats: [THREE.MeshBasicMaterial, number][] = []
  root.traverse((m) => {
    const mat = (m as THREE.Mesh).material as THREE.MeshBasicMaterial | undefined
    if (mat) mats.push([mat, mat.opacity])
  })
  let last = 0
  let cur = 0
  gs.fx.addTransient(root, dur, z, (k, t) => {
    if (variants.length > 1 && t - last > o.flicker!) {
      last = t
      cur = (cur + 1) % variants.length
      variants.forEach((v, i) => (v.visible = i === cur))
    }
    const op = k < 0.15 ? 1 : (1 - (k - 0.15) / 0.85) ** 1.4
    for (const [m, b] of mats) m.opacity = b * op
  })
}

// ───────── 光束 ─────────

export interface BeamOpts {
  k?: number
  /** 沿光束流動的粒子顏色 */
  flow?: string
  /** 流動方向：1 = a→b，-1 = b→a */
  flowDir?: number
  /** 每秒重新取兩端點（跟著單位走）*/
  track?: () => [THREE.Vector3, THREE.Vector3] | null
  /** 起訖點光暈大小 */
  ends?: number
  wobble?: number
}

/** 能量光束：細亮核心＋寬外暈＋兩端光點＋流動粒子 */
export function beam(gs: GameScene, z: number, a: THREE.Vector3, b: THREE.Vector3, color: THREE.ColorRepresentation, width: number, dur: number, o: BeamOpts = {}): void {
  const g = new THREE.Group()
  const core = gs.fx.mesh(GEO.beam, hot(color, 0.6), o.k ?? 5)
  const glow = gs.fx.mesh(GEO.beam, color, 2, { opacity: 0.3 })
  g.add(core, glow)
  const endA = gs.fx.sprite('soft', color, 2.5)
  const endB = gs.fx.sprite('star', color, 2.5)
  const es = o.ends ?? width * 9
  endA.scale.setScalar(es)
  endB.scale.setScalar(es * 1.3)
  const root = new THREE.Group()
  root.add(g, endA, endB)
  const A = a.clone()
  const B = b.clone()
  const cm = core.material as THREE.MeshBasicMaterial
  const gm = glow.material as THREE.MeshBasicMaterial
  let lastFlow = 0
  const place = () => {
    g.position.copy(A)
    g.lookAt(B)
    const len = A.distanceTo(B)
    core.scale.set(width * 0.35, width * 0.35, len)
    glow.scale.set(width * 1.6, width * 1.6, len)
    endA.position.copy(A)
    endB.position.copy(B)
  }
  place()
  gs.fx.addTransient(root, dur, z, (k, t) => {
    const tr = o.track?.()
    if (tr) {
      A.copy(tr[0])
      B.copy(tr[1])
    }
    place()
    const wob = o.wobble ? 1 + Math.sin(t * 40) * o.wobble : 1
    const op = (k < 0.1 ? k / 0.1 : 1 - Math.max(0, k - 0.6) / 0.4) * wob
    cm.opacity = op
    gm.opacity = 0.3 * op
    endA.material.opacity = op
    endB.material.opacity = op
    if (o.flow && t - lastFlow > 0.03) {
      lastFlow = t
      const from = (o.flowDir ?? 1) > 0 ? A : B
      const to = (o.flowDir ?? 1) > 0 ? B : A
      const d = to.clone().sub(from)
      const len = d.length()
      d.normalize()
      const s = Math.random() * 0.3
      const p = from.clone().addScaledVector(d, len * s)
      gs.fx.emit(z, p.x, -p.z, p.y, 2, { color: o.flow, speed: len * 1.6, life: 0.45, size: width * 5, v3: [d.x, d.y, d.z], jit: 0.08, drag: 0 })
    }
  })
}

// ───────── 護盾 ─────────

const SHIELD_VERT = `
varying vec3 vN;
varying vec3 vV;
varying vec2 vUv;
varying vec3 vP;
void main() {
  vUv = uv;
  vec4 wp = modelMatrix * vec4(position, 1.0);
  vP = wp.xyz;
  vN = normalize(mat3(modelMatrix) * normal);
  vV = normalize(cameraPosition - wp.xyz);
  gl_Position = projectionMatrix * viewMatrix * wp;
}`
const SHIELD_FRAG = `
uniform vec3 uColor;
uniform float uTime;
uniform float uOpacity;
uniform float uHex;
uniform vec2 uRep;
uniform sampler2D uMap;
varying vec3 vN;
varying vec3 vV;
varying vec2 vUv;
varying vec3 vP;
void main() {
  float f = pow(1.0 - abs(dot(normalize(vN), normalize(vV))), 2.4);
  float hex = texture2D(uMap, vUv * uRep + vec2(uTime * 0.02, 0.0)).r;
  float band = 0.5 + 0.5 * sin(vP.y * 7.0 - uTime * 3.0 + vP.x * 2.0);
  float a = (f * 0.95 + hex * uHex * (0.25 + 0.75 * f) * (0.55 + 0.45 * band) + 0.035) * uOpacity;
  gl_FragColor = vec4(uColor * a, a);
}`

/** fresnel＋六角網格的護盾材質（每次呼叫新的 ShaderMaterial；同一份 shader program 會被快取）*/
export function shieldMat(color: THREE.ColorRepresentation, k = 2, hex = 1, rep: [number, number] = [8, 4], tex: 'hex' | 'clock' | 'grid' | 'web' = 'hex'): THREE.ShaderMaterial {
  const m = new THREE.ShaderMaterial({
    vertexShader: SHIELD_VERT,
    fragmentShader: SHIELD_FRAG,
    uniforms: {
      uColor: { value: new THREE.Color(color).multiplyScalar(k) },
      uTime: { value: 0 },
      uOpacity: { value: 1 },
      uHex: { value: hex },
      uRep: { value: new THREE.Vector2(rep[0], rep[1]) },
      uMap: { value: fxTex(tex, true) },
    },
    transparent: true,
    depthWrite: false,
    blending: THREE.AdditiveBlending,
  })
  return m
}

/** 一次性的護盾泡泡（偏折、力場庇護）*/
export function dome(gs: GameScene, z: number, x: number, y: number, r: number, color: THREE.ColorRepresentation, dur: number, o: { follow?: () => THREE.Vector3 | null; sphere?: boolean; k?: number; pop?: boolean } = {}): void {
  const mat = shieldMat(color, o.k ?? 2)
  const m = new THREE.Mesh(o.sphere ? GEO.sphere : GEO.hemi, mat)
  m.raycast = () => {}
  m.position.copy(W(x, y, o.sphere ? r * 0.9 : 0))
  m.scale.setScalar(r)
  gs.fx.addTransient(m, dur, z, (k, t) => {
    const p = o.follow?.()
    if (p) m.position.set(p.x, o.sphere ? r * 0.9 : 0, p.z)
    mat.uniforms.uTime.value = t
    const pop = o.pop ? 1 + 0.15 * Math.sin(Math.min(1, k * 3) * Math.PI) : 1
    m.scale.setScalar(r * pop * (k < 0.12 ? 0.6 + (k / 0.12) * 0.4 : 1))
    mat.uniforms.uOpacity.value = k < 0.12 ? k / 0.12 : (1 - (k - 0.12) / 0.88) ** 1.3
  })
}

// ───────── 殘影 ─────────

/** 把單位目前的姿勢拍成一個發光殘影（共用 geometry，只換材質）*/
export function ghost(gs: GameScene, root: THREE.Object3D, color: THREE.ColorRepresentation, dur: number, o: { opacity?: number; drift?: THREE.Vector3; k?: number; grow?: number } = {}): void {
  root.updateMatrixWorld(true)
  const g = new THREE.Group()
  const mat = gs.fx.mat(color, o.k ?? 1.2, { opacity: o.opacity ?? 0.5 })
  let n = 0
  const visibleChain = (obj: THREE.Object3D): boolean => {
    for (let p: THREE.Object3D | null = obj; p && p !== root.parent; p = p.parent) if (!p.visible) return false
    return true
  }
  root.traverse((obj) => {
    const m = obj as THREE.Mesh
    if (!m.isMesh || n > 48 || m.userData.fx || (m as unknown as THREE.SkinnedMesh).isSkinnedMesh || !visibleChain(m)) return
    const src = m.material as THREE.Material
    if (!src || src.blending === THREE.AdditiveBlending || src.transparent) return
    const c = new THREE.Mesh(m.geometry, mat)
    c.userData.keepGeo = true
    c.matrixAutoUpdate = false
    c.matrix.copy(m.matrixWorld)
    c.raycast = () => {}
    g.add(c)
    n++
  })
  if (!n) {
    gs.fx.releaseMat(mat)
    return
  }
  const base = o.opacity ?? 0.5
  const grow = o.grow ?? 1
  const center = new THREE.Vector3()
  root.getWorldPosition(center)
  gs.fx.addTransient(g, dur, gs.zone, (k) => {
    mat.opacity = base * (1 - k) ** 1.5
    if (o.drift) g.position.copy(o.drift).multiplyScalar(k)
    if (grow !== 1) {
      const s = 1 + (grow - 1) * k
      g.scale.setScalar(s)
      g.position.x += center.x * (1 - s)
      g.position.z += center.z * (1 - s)
      g.position.y += center.y * (1 - s)
    }
  })
}

// ───────── 警示圈 ─────────

/** 範圍技能的地面預警：外框呼吸、內圈由中心長到滿（倒數進度）*/
export function telegraph(gs: GameScene, z: number, x: number, y: number, r: number, color: THREE.ColorRepresentation, dur: number, o: { tex?: 'trefoil' | 'clock' | 'crack' | 'arrows'; hz?: number; follow?: () => THREE.Vector3 | null } = {}): void {
  const outer = gs.fx.ring(z, x, y, r, r, color, dur, { tex: 'ring', k: 2.6, env: 'hold', follow: o.follow })
  void outer
  const edge = gs.fx.mesh(GEO.ringThin, color, 3)
  edge.position.copy(W(x, y, 0.07))
  edge.scale.setScalar(r)
  const fill = gs.fx.mesh(GEO.flat, color, 0.9, { map: fxTex('soft'), opacity: 0.35 })
  fill.position.copy(W(x, y, 0.05))
  const g = new THREE.Group()
  g.add(edge, fill)
  let icon: THREE.Mesh | null = null
  if (o.tex) {
    icon = gs.fx.mesh(GEO.flat, color, 1.6, { map: fxTex(o.tex), opacity: 0.5 })
    icon.position.copy(W(x, y, 0.065))
    icon.scale.setScalar(r * 0.55)
    g.add(icon)
  }
  const em = edge.material as THREE.MeshBasicMaterial
  const fm = fill.material as THREE.MeshBasicMaterial
  gs.fx.addTransient(g, dur, z, (k, t) => {
    const p = o.follow?.()
    if (p) {
      for (const c of g.children) c.position.set(p.x, c.position.y, p.z)
    }
    const hz = (o.hz ?? 2) * (1 + k * 2.5)
    const beat = 0.5 + 0.5 * Math.sin(t * hz * Math.PI * 2)
    em.opacity = 0.55 + 0.45 * beat
    fill.scale.setScalar(Math.max(0.01, r * k))
    fm.opacity = 0.25 + 0.25 * beat
    if (icon) {
      icon.rotation.y += 0.01
      ;(icon.material as THREE.MeshBasicMaterial).opacity = 0.3 + 0.4 * beat
    }
  })
}

// ───────── 光柱 ─────────

/** 垂直光柱（傳送、治療、天降）*/
export function pillar(gs: GameScene, z: number, x: number, y: number, r: number, height: number, color: THREE.ColorRepresentation, dur: number, o: { k?: number; shrink?: boolean; follow?: () => THREE.Vector3 | null; spin?: number } = {}): void {
  const m = gs.fx.mesh(GEO.cyl, color, o.k ?? 2.2, { map: fxTex('grad'), side: THREE.DoubleSide })
  m.position.copy(W(x, y, 0))
  m.scale.set(r, height, r)
  const mm = m.material as THREE.MeshBasicMaterial
  gs.fx.addTransient(m, dur, z, (k) => {
    const p = o.follow?.()
    if (p) m.position.set(p.x, 0, p.z)
    const s = o.shrink ? 1 - k * 0.85 : 1 + k * 0.2
    m.scale.set(r * s, height * (k < 0.15 ? k / 0.15 : 1), r * s)
    mm.opacity = k < 0.15 ? 1 : (1 - (k - 0.15) / 0.85) ** 1.2
    m.rotation.y += o.spin ?? 0.02
  })
}

// ───────── 常用爆裂 ─────────

/** 能量爆裂：光爆＋外暈＋衝擊環＋光點＋火花 */
export function burst(gs: GameScene, z: number, x: number, y: number, h: number, color: string, r: number, o: { sparks?: number; smoke?: string; dur?: number; ring?: boolean; color2?: string } = {}): void {
  const dur = o.dur ?? 0.35
  gs.fx.flash(z, x, y, h, color, Math.max(0.15, r * 0.45), dur * 0.6)
  if (o.ring !== false) gs.fx.ring(z, x, y, r * 0.15, r, color, dur * 1.3, { tex: 'ring', k: 2.4 })
  gs.fx.emit(z, x, y, h, Math.round(10 + r * 10), { color, color2: o.color2, speed: r * 3, life: dur * 1.6, size: 0.22 + r * 0.06, up: 0.6, drag: 3 })
  gs.fx.emit(z, x, y, h, o.sparks ?? Math.round(8 + r * 6), { color: '#ffffff', color2: color, speed: 3 + r * 2.5, life: 0.45, size: 1, up: 0.7, grav: 7, drag: 1.2, layer: 'spark' })
  if (o.smoke) gs.fx.emit(z, x, y, h * 0.6, Math.round(4 + r * 4), { color: o.smoke, speed: r * 0.9, life: 1.4, size: 0.6 + r * 0.25, up: 0.5, drag: 1.5, layer: 'smoke', alpha: 0.55 })
}

/** 人形單位根節點（殘影、殼層用）*/
export function viewRoot(gs: GameScene, id?: number): THREE.Object3D | null {
  if (!id) return null
  const v = gs.units.views.get(id)
  return v ? (v.rig?.root ?? v.model?.root ?? null) : null
}
