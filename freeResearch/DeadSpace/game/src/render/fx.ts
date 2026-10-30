// 特效引擎（美術聖經 §11、§14）：
// - 三層粒子：additive 光點、半透明煙霧、火花線段；各自單一 draw call、上限依畫質預設
// - 物件池：共用 geometry（不 dispose）、材質池（同參數重複使用，不重編譯 shader）、固定數量的點光源池（不增減場景燈數）、
//   地面貼花環形緩衝、碎片 InstancedMesh
// - 曳光、閃光、衝擊環、光暈 sprite、地面環、排程
import * as THREE from 'three'
import { preset, quality } from './quality'
import { W } from './stationBuilder'
import { fxTex, type FxTexName } from './fx/tex'

// ───────── 共用 geometry（userData.shared：transient 結束時不 dispose）─────────

function shared<T extends THREE.BufferGeometry>(g: T): T {
  g.userData.shared = true
  return g
}

const cylUnit = new THREE.CylinderGeometry(1, 1, 1, 12, 1, true)
cylUnit.translate(0, 0.5, 0)
const coneUnit = new THREE.ConeGeometry(1, 1, 14, 1, true)
coneUnit.translate(0, 0.5, 0)
const beamUnit = new THREE.CylinderGeometry(1, 1, 1, 8, 1, true)
beamUnit.rotateX(Math.PI / 2)
beamUnit.translate(0, 0, 0.5)
const planeFlat = new THREE.PlaneGeometry(2, 2)
planeFlat.rotateX(-Math.PI / 2)

export const GEO = {
  sphere: shared(new THREE.SphereGeometry(1, 16, 12)),
  sphereLo: shared(new THREE.SphereGeometry(1, 10, 7)),
  hemi: shared(new THREE.SphereGeometry(1, 24, 12, 0, Math.PI * 2, 0, Math.PI / 2)),
  ring: shared(new THREE.RingGeometry(0.85, 1, 48).rotateX(-Math.PI / 2)),
  ringThin: shared(new THREE.RingGeometry(0.95, 1, 64).rotateX(-Math.PI / 2)),
  /** 地面平面（2×2，中心在原點，貼地）*/
  flat: shared(planeFlat),
  /** 直立平面（1×1）*/
  plane: shared(new THREE.PlaneGeometry(1, 1)),
  box: shared(new THREE.BoxGeometry(1, 1, 1)),
  /** 底部在原點、高 1 的開口圓柱（光柱、龍捲）*/
  cyl: shared(cylUnit),
  cone: shared(coneUnit),
  /** 沿 +Z、長 1 的細圓柱（光束）*/
  beam: shared(beamUnit),
  torus: shared(new THREE.TorusGeometry(1, 0.06, 6, 48).rotateX(Math.PI / 2)),
  ico: shared(new THREE.IcosahedronGeometry(1, 0)),
  ico1: shared(new THREE.IcosahedronGeometry(1, 1)),
  octa: shared(new THREE.OctahedronGeometry(1, 0)),
  tetra: shared(new THREE.TetrahedronGeometry(1, 0)),
  dodeca: shared(new THREE.DodecahedronGeometry(1, 0)),
}

/** 畫質 → 粒子數量倍率 */
export function qk(): number {
  return quality.value === 'low' ? 0.45 : quality.value === 'medium' ? 0.75 : quality.value === 'ultra' ? 1.25 : 1
}

// ───────── 粒子 ─────────

export interface EmitOpts {
  color: string
  /** 生命末端的顏色（色彩隨時間變化：白熱 → 橘 → 暗紅）*/
  color2?: string
  speed: number
  life: number
  size: number
  up?: number
  drag?: number
  grav?: number
  spread?: number
  dir?: [number, number]
  /** 3D 方向（three 座標；與 speed 相乘），會加 jit 抖動 */
  v3?: [number, number, number]
  jit?: number
  layer?: 'glow' | 'smoke' | 'spark'
  /** 在半徑 area 的圓盤內生成 */
  area?: number
  /** 只在圓周上生成 */
  ring?: boolean
  /** 垂直方向生成範圍 */
  hArea?: number
  /** 生命末端的大小倍率 */
  grow?: number
  alpha?: number
  /** 速度方向：+1 從中心向外、-1 向中心（配合 area/ring）*/
  radial?: number
  /** 被生成點吸引（>0）的加速度 */
  pull?: number
  /** 繞生成點的切向速度 */
  swirl?: number
}

interface P {
  x: number
  y: number
  z: number
  vx: number
  vy: number
  vz: number
  life: number
  max: number
  size: number
  grow: number
  r: number
  g: number
  b: number
  r2: number
  g2: number
  b2: number
  a: number
  drag: number
  grav: number
  zone: number
  cx: number
  cz: number
  pull: number
  swirl: number
  seed: number
}

const GLOW_VERT = `
attribute float aSize;
attribute vec4 aColor;
varying vec4 vColor;
void main() {
  vColor = aColor;
  vec4 mv = modelViewMatrix * vec4(position, 1.0);
  gl_PointSize = aSize * (300.0 / -mv.z);
  gl_Position = projectionMatrix * mv;
}`
const GLOW_FRAG = `
varying vec4 vColor;
void main() {
  vec2 d = gl_PointCoord - 0.5;
  float r = dot(d, d) * 4.0;
  if (r > 1.0) discard;
  float a = (1.0 - r);
  a *= a;
  gl_FragColor = vec4(vColor.rgb * a * vColor.a, a * vColor.a);
}`
const SMOKE_VERT = `
attribute float aSize;
attribute vec4 aColor;
attribute float aSeed;
varying vec4 vColor;
varying float vSeed;
void main() {
  vColor = aColor;
  vSeed = aSeed;
  vec4 mv = modelViewMatrix * vec4(position, 1.0);
  gl_PointSize = aSize * (300.0 / -mv.z);
  gl_Position = projectionMatrix * mv;
}`
const SMOKE_FRAG = `
varying vec4 vColor;
varying float vSeed;
void main() {
  vec2 d = gl_PointCoord - 0.5;
  float r = length(d) * 2.0;
  float an = atan(d.y, d.x);
  float edge = 0.78 + 0.1 * sin(an * 3.0 + vSeed * 6.283) + 0.07 * sin(an * 7.0 - vSeed * 17.0);
  float m = smoothstep(edge, edge * 0.3, r);
  if (m < 0.004) discard;
  float lit = 0.82 + 0.3 * (d.x * -0.6 + d.y * 0.8) * (1.0 - r);
  gl_FragColor = vec4(vColor.rgb * lit, m * vColor.a);
}`

class Layer {
  ps: P[] = []
  readonly obj: THREE.Points | THREE.LineSegments
  private geo = new THREE.BufferGeometry()
  private pos: Float32Array
  private col: Float32Array
  private siz: Float32Array | null = null
  private seed: Float32Array | null = null

  constructor(
    readonly kind: 'glow' | 'smoke' | 'spark',
    readonly cap: number,
    scene: THREE.Scene,
  ) {
    const vpp = kind === 'spark' ? 2 : 1
    this.pos = new Float32Array(cap * 3 * vpp)
    this.col = new Float32Array(cap * 4 * vpp)
    this.geo.setAttribute('position', new THREE.BufferAttribute(this.pos, 3).setUsage(THREE.DynamicDrawUsage))
    if (kind === 'spark') {
      this.geo.setAttribute('color', new THREE.BufferAttribute(this.col, 4).setUsage(THREE.DynamicDrawUsage))
      this.obj = new THREE.LineSegments(this.geo, new THREE.LineBasicMaterial({ vertexColors: true, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending }))
    } else {
      this.siz = new Float32Array(cap)
      this.geo.setAttribute('aColor', new THREE.BufferAttribute(this.col, 4).setUsage(THREE.DynamicDrawUsage))
      this.geo.setAttribute('aSize', new THREE.BufferAttribute(this.siz, 1).setUsage(THREE.DynamicDrawUsage))
      if (kind === 'smoke') {
        this.seed = new Float32Array(cap)
        this.geo.setAttribute('aSeed', new THREE.BufferAttribute(this.seed, 1).setUsage(THREE.DynamicDrawUsage))
      }
      this.obj = new THREE.Points(
        this.geo,
        new THREE.ShaderMaterial({
          vertexShader: kind === 'smoke' ? SMOKE_VERT : GLOW_VERT,
          fragmentShader: kind === 'smoke' ? SMOKE_FRAG : GLOW_FRAG,
          transparent: true,
          depthWrite: false,
          blending: kind === 'smoke' ? THREE.NormalBlending : THREE.AdditiveBlending,
        }),
      )
    }
    this.obj.frustumCulled = false
    // 煙在光點之前畫（光點疊在煙上面才會亮）
    this.obj.renderOrder = kind === 'smoke' ? 2 : 3
    scene.add(this.obj)
  }

  update(dt: number, zone: number): void {
    const ps = this.ps
    let n = 0
    const spark = this.kind === 'spark'
    const smoke = this.kind === 'smoke'
    const gain = this.kind === 'glow' ? 3 : 1
    for (let i = ps.length - 1; i >= 0; i--) {
      const p = ps[i]
      p.life -= dt
      if (p.life <= 0 || p.zone !== zone) {
        ps[i] = ps[ps.length - 1]
        ps.pop()
        continue
      }
      const d = Math.exp(-p.drag * dt)
      if (p.pull !== 0 || p.swirl !== 0) {
        const dx = p.cx - p.x
        const dz = p.cz - p.z
        const l = Math.hypot(dx, dz) || 1
        p.vx += (dx / l) * p.pull * dt + (-dz / l) * p.swirl * dt
        p.vz += (dz / l) * p.pull * dt + (dx / l) * p.swirl * dt
      }
      p.vx *= d
      p.vy = p.vy * d - p.grav * dt
      p.vz *= d
      p.x += p.vx * dt
      p.y += p.vy * dt
      p.z += p.vz * dt
      if (p.y < 0.02 && zone !== 0) {
        p.y = 0.02
        p.vy = -p.vy * 0.3
        p.vx *= 0.7
        p.vz *= 0.7
      }
      const k = p.life / p.max
      const u = 1 - k
      const r = (p.r + (p.r2 - p.r) * u) * gain
      const g = (p.g + (p.g2 - p.g) * u) * gain
      const b = (p.b + (p.b2 - p.b) * u) * gain
      const a = p.a * (smoke ? Math.min(1, u * 6) * k ** 0.8 : Math.min(1, k * 1.5))
      if (spark) {
        const o = n * 6
        const tail = 0.045
        this.pos[o] = p.x
        this.pos[o + 1] = p.y
        this.pos[o + 2] = p.z
        this.pos[o + 3] = p.x - p.vx * tail
        this.pos[o + 4] = p.y - p.vy * tail
        this.pos[o + 5] = p.z - p.vz * tail
        const c = n * 8
        this.col[c] = r * 4
        this.col[c + 1] = g * 4
        this.col[c + 2] = b * 4
        this.col[c + 3] = a
        this.col[c + 4] = r
        this.col[c + 5] = g
        this.col[c + 6] = b
        this.col[c + 7] = 0
      } else {
        this.pos[n * 3] = p.x
        this.pos[n * 3 + 1] = p.y
        this.pos[n * 3 + 2] = p.z
        this.col[n * 4] = r
        this.col[n * 4 + 1] = g
        this.col[n * 4 + 2] = b
        this.col[n * 4 + 3] = a
        this.siz![n] = p.size * (smoke ? 1 + (p.grow - 1) * Math.sqrt(u) : (0.5 + k * 0.5) * (1 + (p.grow - 1) * u))
        if (this.seed) this.seed[n] = p.seed
      }
      n++
    }
    this.geo.setDrawRange(0, spark ? n * 2 : n)
    for (const k of Object.keys(this.geo.attributes)) (this.geo.attributes[k] as THREE.BufferAttribute).needsUpdate = true
  }
}

// ───────── 碎片（InstancedMesh：石塊、金屬片、冰晶、玻璃、肉塊、骨刺）─────────

export type DebrisKind = 'rock' | 'metal' | 'ice' | 'glass' | 'flesh' | 'bone'

interface D {
  x: number
  y: number
  z: number
  vx: number
  vy: number
  vz: number
  ax: THREE.Vector3
  ang: number
  spin: number
  s: number
  sx: number
  sy: number
  life: number
  max: number
  zone: number
}

class DebrisPool {
  readonly mesh: THREE.InstancedMesh
  ds: D[] = []
  private m = new THREE.Matrix4()
  private q = new THREE.Quaternion()
  private v = new THREE.Vector3()
  private sc = new THREE.Vector3()
  private c = new THREE.Color()

  constructor(
    readonly kind: DebrisKind,
    readonly cap: number,
    scene: THREE.Scene,
  ) {
    const noise = fxTex('noise', true)
    const geo =
      kind === 'rock' ? GEO.dodeca : kind === 'metal' ? GEO.box : kind === 'flesh' ? GEO.ico : kind === 'bone' ? GEO.cone : GEO.octa
    const mat =
      kind === 'ice'
        ? new THREE.MeshStandardMaterial({ color: '#d6f2ff', emissive: '#5ab8e8', emissiveIntensity: 0.7, roughness: 0.08, metalness: 0, transparent: true, opacity: 0.82, flatShading: true })
        : kind === 'glass'
          ? new THREE.MeshStandardMaterial({ color: '#f4eaff', emissive: '#b89cff', emissiveIntensity: 0.9, roughness: 0.05, metalness: 0.1, transparent: true, opacity: 0.7, flatShading: true })
          : kind === 'metal'
            ? new THREE.MeshStandardMaterial({ color: '#ffffff', map: noise, roughness: 0.35, metalness: 0.85, flatShading: true })
            : kind === 'flesh'
              ? new THREE.MeshStandardMaterial({ color: '#ffffff', map: noise, roughness: 0.3, metalness: 0, emissive: '#3a0508', emissiveIntensity: 0.6, flatShading: true })
              : kind === 'bone'
                ? new THREE.MeshStandardMaterial({ color: '#e8dcc0', map: noise, roughness: 0.55, metalness: 0, flatShading: true })
                : new THREE.MeshStandardMaterial({ color: '#ffffff', map: noise, roughness: 0.95, metalness: 0, flatShading: true })
    this.mesh = new THREE.InstancedMesh(geo, mat, cap)
    this.mesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage)
    this.mesh.setColorAt(0, new THREE.Color('#ffffff'))
    this.mesh.count = 0
    this.mesh.frustumCulled = false
    this.mesh.castShadow = false
    this.mesh.raycast = () => {}
    scene.add(this.mesh)
  }

  add(d: D, color: THREE.Color): void {
    if (this.ds.length >= this.cap) this.ds.shift()
    this.ds.push(d)
    ;(d as D & { col: THREE.Color }).col = color
  }

  update(dt: number, zone: number): void {
    const ds = this.ds
    let n = 0
    for (let i = ds.length - 1; i >= 0; i--) {
      const d = ds[i]
      d.life -= dt
      if (d.life <= 0 || d.zone !== zone) {
        ds.splice(i, 1)
        continue
      }
    }
    for (const d of ds) {
      const grounded = zone !== 0 && d.y <= d.s * 0.5 + 0.01
      d.vy -= (zone === 0 ? 0 : 14) * dt
      const drag = Math.exp(-(grounded ? 6 : zone === 0 ? 0.6 : 0.4) * dt)
      d.vx *= drag
      d.vz *= drag
      d.x += d.vx * dt
      d.y += d.vy * dt
      d.z += d.vz * dt
      if (zone !== 0 && d.y < d.s * 0.5) {
        d.y = d.s * 0.5
        d.vy = Math.abs(d.vy) > 1 ? -d.vy * 0.32 : 0
        d.spin *= 0.6
      }
      d.ang += d.spin * dt
      const k = d.life / d.max
      const s = d.s * Math.min(1, k * 3.5)
      this.q.setFromAxisAngle(d.ax, d.ang)
      this.v.set(d.x, d.y, d.z)
      this.sc.set(s * d.sx, s * d.sy, s)
      this.m.compose(this.v, this.q, this.sc)
      this.mesh.setMatrixAt(n, this.m)
      this.mesh.setColorAt(n, (d as D & { col: THREE.Color }).col ?? this.c.set('#ffffff'))
      n++
    }
    this.mesh.count = n
    this.mesh.instanceMatrix.needsUpdate = true
    if (this.mesh.instanceColor) this.mesh.instanceColor.needsUpdate = true
  }
}

// ───────── 暫存物件、光源池、貼花 ─────────

interface Transient {
  obj: THREE.Object3D
  until: number
  born: number
  zone: number
  tick?: (k: number, t: number) => void
}

interface LSlot {
  l: THREE.PointLight
  born: number
  until: number
  peak: number
  zone: number
  attack: number
  flicker: number
  track?: () => THREE.Vector3 | null
}

interface Decal {
  mesh: THREE.Mesh
  born: number
  until: number
  zone: number
  opacity: number
  fadeIn: number
  grow: number
  size: number
}

export interface MatOpts {
  /** 預設 additive */
  add?: boolean
  side?: THREE.Side
  map?: THREE.Texture | null
  opacity?: number
  depthTest?: boolean
}

export interface GlowOpts {
  tex?: FxTexName
  /** 亮度倍率（>1 觸發 bloom）*/
  k?: number
  /** 結束時的大小倍率 */
  grow?: number
  /** 淡入所佔比例 */
  fadeIn?: number
  spin?: number
  opacity?: number
  /** 跟隨（回傳 three 座標）*/
  follow?: () => THREE.Vector3 | null
  add?: boolean
}

export interface RingOpts {
  tex?: FxTexName
  k?: number
  /** 淡入比例；預設線性淡出 */
  fadeIn?: number
  spin?: number
  opacity?: number
  h?: number
  /** 透明度包絡：fade（淡出）、hold（維持到最後 25% 才淡出）、pulse（呼吸）*/
  env?: 'fade' | 'hold' | 'pulse'
  pulseHz?: number
  follow?: () => THREE.Vector3 | null
  add?: boolean
  ease?: 'out' | 'in' | 'linear'
}

export class Fx {
  /** 目前作用中的特效引擎（給模型 update 等沒有 GameScene 的地方發粒子）*/
  static active: Fx | null = null
  private glowL: Layer
  private smokeL: Layer
  private sparkL: Layer
  private trans: Transient[] = []
  private now = 0
  /** 目前顯示的 zone */
  zone = -1
  private matPool = new Map<string, THREE.Material[]>()
  private lights: LSlot[] = []
  private decals: Decal[] = []
  private decalI = 0
  private debrisPools = new Map<DebrisKind, DebrisPool>()
  private timers: { at: number; fn: () => void }[] = []

  constructor(private scene: THREE.Scene) {
    const P = preset().particles
    this.glowL = new Layer('glow', Math.max(600, P), scene)
    this.smokeL = new Layer('smoke', Math.max(240, Math.round(P * 0.35)), scene)
    this.sparkL = new Layer('spark', Math.max(300, Math.round(P * 0.45)), scene)
    // 固定數量的特效光源：一開始就在場景裡（intensity 0），避免增減燈數造成全場 shader 重編
    const nl = preset().maxLights >= 8 ? 6 : preset().maxLights >= 6 ? 4 : 2
    for (let i = 0; i < nl; i++) {
      const l = new THREE.PointLight('#ffffff', 0, 6, 2)
      l.castShadow = false
      scene.add(l)
      this.lights.push({ l, born: 0, until: 0, peak: 0, zone: -1, attack: 0, flicker: 0 })
    }
    Fx.active = this
  }

  get time(): number {
    return this.now
  }

  // ───── 粒子 ─────

  emit(zone: number, x: number, y: number, h: number, n: number, o: EmitOpts): void {
    const layer = o.layer === 'smoke' ? this.smokeL : o.layer === 'spark' ? this.sparkL : this.glowL
    const cap = layer === this.glowL ? Math.min(layer.cap, preset().particles) : layer.cap
    const cnt = n <= 2 ? n : Math.max(1, Math.round(n * qk()))
    const c = new THREE.Color(o.color)
    const c2 = o.color2 ? new THREE.Color(o.color2) : c
    const ps = layer.ps
    for (let i = 0; i < cnt && ps.length < cap; i++) {
      let px = x
      let pz = -y
      let py = h + (o.hArea ? (Math.random() - 0.5) * o.hArea : 0)
      let ox = 0
      let oz = 0
      if (o.area) {
        const a = Math.random() * Math.PI * 2
        const r = o.ring ? o.area : Math.sqrt(Math.random()) * o.area
        ox = Math.cos(a) * r
        oz = Math.sin(a) * r
        px += ox
        pz += oz
      }
      const sp = o.speed * (0.4 + Math.random() * 0.8)
      let vx: number
      let vy: number
      let vz: number
      if (o.v3) {
        const j = o.jit ?? 0.25
        vx = (o.v3[0] + (Math.random() - 0.5) * j * 2) * sp
        vy = (o.v3[1] + (Math.random() - 0.5) * j * 2) * sp
        vz = (o.v3[2] + (Math.random() - 0.5) * j * 2) * sp
      } else {
        let ax: number
        let az: number
        if (o.radial && (ox || oz)) {
          const l = Math.hypot(ox, oz) || 1
          ax = (ox / l) * o.radial
          az = (oz / l) * o.radial
        } else if (o.dir) {
          const s = o.spread ?? 0.4
          const ang = Math.atan2(-o.dir[1], o.dir[0]) + (Math.random() - 0.5) * s * 2
          ax = Math.cos(ang)
          az = Math.sin(ang)
        } else {
          const a = Math.random() * Math.PI * 2
          ax = Math.cos(a)
          az = Math.sin(a)
        }
        vx = ax * sp
        vz = az * sp
        vy = (o.up ?? 0.5) * sp * (0.5 + Math.random())
      }
      if (py < 0.02 && zone !== 0) py = 0.02
      const life = o.life * (0.6 + Math.random() * 0.6)
      ps.push({
        x: px,
        y: py,
        z: pz,
        vx,
        vy,
        vz,
        life,
        max: life,
        size: o.size * (0.6 + Math.random() * 0.8),
        grow: o.grow ?? (o.layer === 'smoke' ? 2.2 : 1),
        r: c.r,
        g: c.g,
        b: c.b,
        r2: c2.r,
        g2: c2.g,
        b2: c2.b,
        a: o.alpha ?? 1,
        drag: o.drag ?? 2,
        grav: o.grav ?? 0,
        zone,
        cx: x,
        cz: -y,
        pull: o.pull ?? 0,
        swirl: o.swirl ?? 0,
        seed: Math.random(),
      })
    }
  }

  /** 在目前顯示中的 zone 發粒子（模型 update 用）*/
  emitHere(x: number, y: number, h: number, n: number, o: EmitOpts): void {
    if (this.zone >= 0) this.emit(this.zone, x, y, h, n, o)
  }

  // ───── 材質池 ─────

  mat(color: THREE.ColorRepresentation, k = 1, o: MatOpts = {}): THREE.MeshBasicMaterial {
    const add = o.add ?? true
    const side = o.side ?? THREE.FrontSide
    const key = `b|${add ? 1 : 0}|${side}|${o.map?.uuid ?? ''}|${o.depthTest === false ? 0 : 1}`
    const list = this.matPool.get(key)
    let m = list?.pop() as THREE.MeshBasicMaterial | undefined
    if (!m) {
      m = new THREE.MeshBasicMaterial({ transparent: true, depthWrite: false, blending: add ? THREE.AdditiveBlending : THREE.NormalBlending, side, map: o.map ?? null, depthTest: o.depthTest ?? true })
      m.userData.pool = key
    }
    m.color.set(color).multiplyScalar(k)
    m.opacity = o.opacity ?? 1
    return m
  }

  spriteMat(tex: FxTexName, color: THREE.ColorRepresentation, k = 1, add = true): THREE.SpriteMaterial {
    const map = fxTex(tex)
    const key = `s|${add ? 1 : 0}|${map.uuid}`
    const list = this.matPool.get(key)
    let m = list?.pop() as THREE.SpriteMaterial | undefined
    if (!m) {
      m = new THREE.SpriteMaterial({ map, transparent: true, depthWrite: false, blending: add ? THREE.AdditiveBlending : THREE.NormalBlending })
      m.userData.pool = key
    }
    m.color.set(color).multiplyScalar(k)
    m.opacity = 1
    m.rotation = 0
    return m
  }

  releaseMat(mat: THREE.Material): void {
    const key = mat.userData.pool as string | undefined
    if (key) {
      let list = this.matPool.get(key)
      if (!list) this.matPool.set(key, (list = []))
      if (list.length < 64) list.push(mat)
      else mat.dispose()
    } else if (!mat.userData.keep) mat.dispose()
  }

  /** 用共用 geometry＋池化材質建立 mesh（不接受 raycast）*/
  mesh(geo: THREE.BufferGeometry, color: THREE.ColorRepresentation, k = 1, o: MatOpts = {}): THREE.Mesh {
    const m = new THREE.Mesh(geo, this.mat(color, k, o))
    m.raycast = () => {}
    m.frustumCulled = false
    return m
  }

  sprite(tex: FxTexName, color: THREE.ColorRepresentation, k = 1, add = true): THREE.Sprite {
    const s = new THREE.Sprite(this.spriteMat(tex, color, k, add))
    s.raycast = () => {}
    return s
  }

  // ───── 暫存物件 ─────

  addTransient(obj: THREE.Object3D, dur: number, zone: number, tick?: (k: number, t: number) => void): void {
    this.scene.add(obj)
    obj.visible = zone === this.zone || this.zone < 0
    this.trans.push({ obj, until: this.now + dur, born: this.now, zone, tick })
  }

  private free(obj: THREE.Object3D): void {
    this.scene.remove(obj)
    obj.traverse((o) => {
      const m = o as THREE.Mesh
      if (m.geometry && !m.geometry.userData.shared && !o.userData.keepGeo && !(o instanceof THREE.Sprite)) m.geometry.dispose()
      const mat = m.material as THREE.Material | THREE.Material[] | undefined
      if (Array.isArray(mat)) mat.forEach((x) => this.releaseMat(x))
      else if (mat) this.releaseMat(mat)
    })
  }

  /** delay 秒後執行（特效時鐘）*/
  after(delay: number, fn: () => void): void {
    this.timers.push({ at: this.now + delay, fn })
  }

  // ───── 光源池 ─────

  /** 借一盞點光（固定池；滿了就搶最暗的那盞）*/
  light(zone: number, x: number, y: number, h: number, color: THREE.ColorRepresentation, intensity: number, distance: number, dur: number, o: { attack?: number; flicker?: number; track?: () => THREE.Vector3 | null } = {}): void {
    if (!this.lights.length) return
    let best = this.lights[0]
    let bestV = Infinity
    for (const s of this.lights) {
      const left = this.now >= s.until ? 0 : s.peak * (1 - (this.now - s.born) / Math.max(0.001, s.until - s.born))
      if (left < bestV) {
        bestV = left
        best = s
      }
    }
    if (bestV > intensity) return
    best.l.color.set(color)
    best.l.distance = distance
    best.l.position.set(x, h, -y)
    best.born = this.now
    best.until = this.now + dur
    best.peak = intensity
    best.zone = zone
    best.attack = o.attack ?? 0
    best.flicker = o.flicker ?? 0
    best.track = o.track
  }

  // ───── 地面貼花（環形緩衝）─────

  decal(zone: number, x: number, y: number, size: number, tex: FxTexName, color: THREE.ColorRepresentation, life: number, o: { add?: boolean; rot?: number; opacity?: number; fadeIn?: number; grow?: number; k?: number } = {}): void {
    if (zone === 0) return
    const cap = quality.value === 'low' ? 16 : quality.value === 'medium' ? 28 : 40
    let d: Decal
    if (this.decals.length < cap) {
      const mesh = new THREE.Mesh(GEO.flat, new THREE.MeshBasicMaterial({ transparent: true, depthWrite: false }))
      mesh.raycast = () => {}
      mesh.renderOrder = 1
      this.scene.add(mesh)
      d = { mesh, born: 0, until: 0, zone, opacity: 1, fadeIn: 0, grow: 1, size }
      this.decals.push(d)
    } else d = this.decals[this.decalI % this.decals.length]
    this.decalI++
    const m = d.mesh.material as THREE.MeshBasicMaterial
    m.map = fxTex(tex)
    m.blending = o.add ? THREE.AdditiveBlending : THREE.NormalBlending
    m.color.set(color).multiplyScalar(o.k ?? 1)
    m.needsUpdate = true
    d.mesh.position.set(x, 0.012 + (this.decalI % 14) * 0.0016, -y)
    d.mesh.rotation.y = o.rot ?? Math.random() * Math.PI * 2
    d.mesh.scale.setScalar(size * 0.5)
    d.born = this.now
    d.until = this.now + life
    d.zone = zone
    d.opacity = o.opacity ?? 1
    d.fadeIn = o.fadeIn ?? 0.04
    d.grow = o.grow ?? 1
    d.size = size
    d.mesh.visible = zone === this.zone
  }

  // ───── 碎片 ─────

  debris(zone: number, x: number, y: number, h: number, n: number, kind: DebrisKind, o: { speed: number; up?: number; size: number; life?: number; colors?: string[]; dir?: [number, number]; spread?: number; area?: number }): void {
    let pool = this.debrisPools.get(kind)
    if (!pool) this.debrisPools.set(kind, (pool = new DebrisPool(kind, quality.value === 'low' ? 48 : 120, this.scene)))
    const cnt = Math.max(1, Math.round(n * qk()))
    const cols = (o.colors ?? (kind === 'rock' ? ['#5c5650', '#4a4642', '#6e665c'] : kind === 'metal' ? ['#8a9096', '#5a6068', '#b0a48a'] : kind === 'flesh' ? ['#7a1e28', '#5a2a4a', '#c8323c'] : ['#ffffff'])).map((c) => new THREE.Color(c))
    for (let i = 0; i < cnt; i++) {
      let a = Math.random() * Math.PI * 2
      if (o.dir) a = Math.atan2(-o.dir[1], o.dir[0]) + (Math.random() - 0.5) * (o.spread ?? 0.6) * 2
      const sp = o.speed * (0.35 + Math.random() * 0.9)
      const life = (o.life ?? 2.2) * (0.7 + Math.random() * 0.6)
      const ar = o.area ? Math.sqrt(Math.random()) * o.area : 0
      const aa = Math.random() * Math.PI * 2
      pool.add(
        {
          x: x + Math.cos(aa) * ar,
          y: h,
          z: -y - Math.sin(aa) * ar,
          vx: Math.cos(a) * sp,
          vy: (o.up ?? 0.8) * o.speed * (0.4 + Math.random()),
          vz: Math.sin(a) * sp,
          ax: new THREE.Vector3(Math.random() - 0.5, Math.random() - 0.5, Math.random() - 0.5).normalize(),
          ang: Math.random() * 6,
          spin: (Math.random() - 0.5) * 18,
          s: o.size * (0.5 + Math.random() * 0.9),
          sx: kind === 'metal' ? 1.6 : kind === 'ice' || kind === 'glass' ? 0.45 : kind === 'bone' ? 0.35 : 1,
          sy: kind === 'metal' ? 0.25 : kind === 'ice' || kind === 'glass' ? 1.6 : kind === 'bone' ? 2.4 : 0.8 + Math.random() * 0.4,
          life,
          max: life,
          zone,
        },
        cols[Math.floor(Math.random() * cols.length)],
      )
    }
  }

  // ───── 常用形狀 ─────

  /** 右鍵點擊標記 */
  clickMarker(zone: number, x: number, y: number, color = '#5cf2a5'): void {
    const ring = this.mesh(GEO.ring, color, 1.2)
    ring.position.copy(W(x, y, 0.05))
    ring.scale.setScalar(0.3)
    this.addTransient(ring, 0.5, zone, (k) => {
      ring.scale.setScalar(0.3 * (1 + k * 1.5))
      ;(ring.material as THREE.MeshBasicMaterial).opacity = 1 - k
    })
  }

  /** 曳光彈：一段白熱彈頭從槍口飛向目標（有色外暈），身後留下一條很淡、很快消失的軌跡 */
  tracer(zone: number, x0: number, y0: number, h0: number, x1: number, y1: number, h1: number, color: string, width = 0.05, dur = 0.08): void {
    const a = W(x0, y0, h0)
    const b = W(x1, y1, h1)
    const len = a.distanceTo(b)
    if (len < 0.01) return
    const g = new THREE.Group()
    const streak = Math.min(len, Math.max(0.5, len * 0.35))
    const core = this.mesh(GEO.beam, new THREE.Color(color).lerp(new THREE.Color('#ffffff'), 0.55), 5)
    const glow = this.mesh(GEO.beam, color, 2.2, { opacity: 0.4 })
    const trail = this.mesh(GEO.beam, color, 1.6, { opacity: 0.16 })
    trail.scale.set(width * 0.6, width * 0.6, len)
    g.add(trail, core, glow)
    g.position.copy(a)
    g.lookAt(b)
    const cm = core.material as THREE.MeshBasicMaterial
    const gm = glow.material as THREE.MeshBasicMaterial
    const tm = trail.material as THREE.MeshBasicMaterial
    const place = (k: number) => {
      const head = Math.min(len, len * k * 1.5 + streak * 0.3)
      const s = Math.max(0.01, Math.min(streak, head))
      core.position.z = head - s
      core.scale.set(width * 0.45, width * 0.45, s)
      glow.position.z = head - s
      glow.scale.set(width * 1.7, width * 1.7, s)
    }
    place(0)
    this.addTransient(g, dur, zone, (k) => {
      place(k)
      const f = k < 0.66 ? 1 : 1 - (k - 0.66) / 0.34
      cm.opacity = f
      gm.opacity = 0.4 * f
      tm.opacity = 0.16 * (1 - k)
    })
  }

  /** 光爆（爆炸、槍口）：核心球＋光暈 sprite＋借用點光 */
  flash(zone: number, x: number, y: number, h: number, color: string, size: number, dur = 0.12): void {
    const m = this.mesh(GEO.sphere, new THREE.Color(color).lerp(new THREE.Color('#ffffff'), 0.35), 5)
    m.position.copy(W(x, y, h))
    m.scale.setScalar(size * 0.6)
    const mm = m.material as THREE.MeshBasicMaterial
    this.addTransient(m, dur, zone, (k) => {
      m.scale.setScalar(size * 0.6 * (1 + k))
      mm.opacity = (1 - k) ** 1.5
    })
    this.glow(zone, x, y, h, color, size * 2.4, dur * 1.6, { k: 1.8, grow: 1.3 })
    this.light(zone, x, y, h + 0.3, color, size * 60, Math.max(3, size * 10), dur * 1.6)
  }

  /** 地面衝擊環（柔邊）*/
  shock(zone: number, x: number, y: number, radius: number, color: string, dur = 0.5): void {
    this.ring(zone, x, y, radius * 0.1, radius, color, dur, { tex: 'ring', k: 2.4 })
  }

  /** 光暈 sprite（面向鏡頭）*/
  glow(zone: number, x: number, y: number, h: number, color: THREE.ColorRepresentation, size: number, dur: number, o: GlowOpts = {}): THREE.Sprite {
    const s = this.sprite(o.tex ?? 'soft', color, o.k ?? 1.5, o.add ?? true)
    s.position.copy(W(x, y, h))
    s.scale.setScalar(size)
    const sm = s.material
    const op = o.opacity ?? 1
    const fi = o.fadeIn ?? 0
    const grow = o.grow ?? 1
    this.addTransient(s, dur, zone, (k) => {
      if (o.follow) {
        const p = o.follow()
        if (p) s.position.copy(p)
      }
      s.scale.setScalar(size * (1 + (grow - 1) * k))
      sm.opacity = op * (fi > 0 && k < fi ? k / fi : (1 - (k - fi) / (1 - fi)) ** 1.2)
      if (o.spin) sm.rotation += o.spin * 0.016
    })
    return s
  }

  /** 貼地的環或圓盤（可擴張、收縮、旋轉、呼吸），回傳 mesh 方便呼叫端再加工 */
  ring(zone: number, x: number, y: number, r0: number, r1: number, color: THREE.ColorRepresentation, dur: number, o: RingOpts = {}): THREE.Mesh {
    const m = this.mesh(GEO.flat, color, o.k ?? 1.6, { map: fxTex(o.tex ?? 'ring'), add: o.add ?? true })
    const h = o.h ?? 0.06
    m.position.copy(W(x, y, h))
    m.scale.setScalar(Math.max(0.001, r0))
    m.renderOrder = 4
    const mm = m.material as THREE.MeshBasicMaterial
    const op = o.opacity ?? 1
    const fi = o.fadeIn ?? 0
    const env = o.env ?? 'fade'
    const ease = o.ease ?? 'out'
    this.addTransient(m, dur, zone, (k, t) => {
      if (o.follow) {
        const p = o.follow()
        if (p) m.position.set(p.x, h, p.z)
      }
      const e = ease === 'out' ? 1 - (1 - k) ** 2.2 : ease === 'in' ? k * k : k
      m.scale.setScalar(Math.max(0.001, r0 + (r1 - r0) * e))
      let a: number
      if (fi > 0 && k < fi) a = k / fi
      else if (env === 'hold') a = k < 0.75 ? 1 : 1 - (k - 0.75) / 0.25
      else if (env === 'pulse') a = (0.55 + 0.45 * Math.sin(t * (o.pulseHz ?? 4) * Math.PI * 2)) * (k < 0.85 ? 1 : 1 - (k - 0.85) / 0.15)
      else a = 1 - (k - fi) / (1 - fi)
      mm.opacity = op * Math.max(0, a)
      if (o.spin) m.rotation.y += o.spin * 0.016
    })
    return m
  }

  update(dt: number, t: number, zone: number): void {
    this.now = t
    this.zone = zone
    // 排程
    if (this.timers.length) {
      const due = this.timers.filter((x) => x.at <= t)
      if (due.length) {
        this.timers = this.timers.filter((x) => x.at > t)
        for (const x of due) {
          try {
            x.fn()
          } catch (e) {
            if (__DEV__) console.error(e)
          }
        }
      }
    }
    this.glowL.update(dt, zone)
    this.smokeL.update(dt, zone)
    this.sparkL.update(dt, zone)
    for (const p of this.debrisPools.values()) p.update(dt, zone)
    // 光源池
    for (const s of this.lights) {
      if (t >= s.until || s.zone !== zone) {
        s.l.intensity = 0
        continue
      }
      const k = (t - s.born) / Math.max(0.001, s.until - s.born)
      let e = s.attack > 0 && k < s.attack ? k / s.attack : (1 - (k - s.attack) / (1 - s.attack)) ** 1.6
      if (s.flicker) e *= 1 - s.flicker * Math.random()
      if (s.track) {
        const p = s.track()
        if (p) s.l.position.copy(p)
      }
      s.l.intensity = s.peak * e
    }
    // 貼花
    for (const d of this.decals) {
      const m = d.mesh.material as THREE.MeshBasicMaterial
      if (t >= d.until || d.zone !== zone) {
        d.mesh.visible = false
        continue
      }
      d.mesh.visible = true
      const k = (t - d.born) / Math.max(0.001, d.until - d.born)
      m.opacity = d.opacity * (k < d.fadeIn ? k / d.fadeIn : k > 0.7 ? 1 - (k - 0.7) / 0.3 : 1)
      if (d.grow !== 1) d.mesh.scale.setScalar(d.size * 0.5 * (1 + (d.grow - 1) * Math.min(1, k * 4)))
    }
    for (let i = this.trans.length - 1; i >= 0; i--) {
      const tr = this.trans[i]
      tr.obj.visible = tr.zone === zone
      const k = Math.min(1, (t - tr.born) / Math.max(0.001, tr.until - tr.born))
      try {
        tr.tick?.(k, t)
      } catch (e) {
        if (__DEV__) console.error(e)
        tr.until = t
      }
      if (t >= tr.until) {
        this.free(tr.obj)
        this.trans.splice(i, 1)
      }
    }
  }

  /** 清掉所有進行中的特效（換場、截圖工具用）*/
  clear(): void {
    for (const tr of this.trans) this.free(tr.obj)
    this.trans = []
    this.timers = []
    this.glowL.ps.length = 0
    this.smokeL.ps.length = 0
    this.sparkL.ps.length = 0
    for (const p of this.debrisPools.values()) p.ds.length = 0
    for (const d of this.decals) d.until = 0
    for (const s of this.lights) s.until = 0
  }

  /** 統計（效能檢查用）*/
  stats(): { glow: number; smoke: number; spark: number; transients: number; decals: number; debris: number } {
    let debris = 0
    for (const p of this.debrisPools.values()) debris += p.ds.length
    return { glow: this.glowL.ps.length, smoke: this.smokeL.ps.length, spark: this.sparkL.ps.length, transients: this.trans.length, decals: this.decals.filter((d) => d.until > this.now).length, debris }
  }
}
