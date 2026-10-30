// 特效：粒子（單一 Points 物件、additive）、曳光、閃光、衝擊環、點擊標記
import * as THREE from 'three'
import { preset } from './quality'
import { W } from './stationBuilder'

const VERT = `
attribute float aSize;
attribute vec4 aColor;
varying vec4 vColor;
void main() {
  vColor = aColor;
  vec4 mv = modelViewMatrix * vec4(position, 1.0);
  gl_PointSize = aSize * (300.0 / -mv.z);
  gl_Position = projectionMatrix * mv;
}`
const FRAG = `
varying vec4 vColor;
void main() {
  vec2 d = gl_PointCoord - 0.5;
  float r = dot(d, d) * 4.0;
  if (r > 1.0) discard;
  float a = (1.0 - r);
  gl_FragColor = vec4(vColor.rgb * a * vColor.a, a * vColor.a);
}`

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
  r: number
  g: number
  b: number
  drag: number
  grav: number
  zone: number
}

interface Transient {
  obj: THREE.Object3D
  until: number
  born: number
  zone: number
  tick?: (k: number) => void
}

export class Fx {
  private ps: P[] = []
  private geo = new THREE.BufferGeometry()
  private points: THREE.Points
  private pos: Float32Array
  private col: Float32Array
  private siz: Float32Array
  private cap: number
  private trans: Transient[] = []
  private now = 0
  private zone = -1

  constructor(private scene: THREE.Scene) {
    this.cap = 6000
    this.pos = new Float32Array(this.cap * 3)
    this.col = new Float32Array(this.cap * 4)
    this.siz = new Float32Array(this.cap)
    this.geo.setAttribute('position', new THREE.BufferAttribute(this.pos, 3).setUsage(THREE.DynamicDrawUsage))
    this.geo.setAttribute('aColor', new THREE.BufferAttribute(this.col, 4).setUsage(THREE.DynamicDrawUsage))
    this.geo.setAttribute('aSize', new THREE.BufferAttribute(this.siz, 1).setUsage(THREE.DynamicDrawUsage))
    this.points = new THREE.Points(
      this.geo,
      new THREE.ShaderMaterial({ vertexShader: VERT, fragmentShader: FRAG, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending }),
    )
    this.points.frustumCulled = false
    scene.add(this.points)
  }

  emit(zone: number, x: number, y: number, h: number, n: number, o: { color: string; speed: number; life: number; size: number; up?: number; drag?: number; grav?: number; spread?: number; dir?: [number, number] }): void {
    const max = preset().particles
    const c = new THREE.Color(o.color)
    for (let i = 0; i < n && this.ps.length < Math.min(this.cap, max); i++) {
      const a = Math.random() * Math.PI * 2
      let vx = Math.cos(a)
      let vz = Math.sin(a)
      if (o.dir) {
        const s = o.spread ?? 0.4
        const ang = Math.atan2(-o.dir[1], o.dir[0]) + (Math.random() - 0.5) * s * 2
        vx = Math.cos(ang)
        vz = Math.sin(ang)
      }
      const sp = o.speed * (0.4 + Math.random() * 0.8)
      this.ps.push({
        x,
        y: h,
        z: -y,
        vx: vx * sp,
        vy: (o.up ?? 0.5) * sp * (0.5 + Math.random()),
        vz: vz * sp,
        life: o.life * (0.6 + Math.random() * 0.6),
        max: o.life,
        size: o.size * (0.6 + Math.random() * 0.8),
        r: c.r,
        g: c.g,
        b: c.b,
        drag: o.drag ?? 2,
        grav: o.grav ?? 0,
        zone,
      })
    }
  }

  private transient(obj: THREE.Object3D, dur: number, zone: number, tick?: (k: number) => void): void {
    this.scene.add(obj)
    this.trans.push({ obj, until: this.now + dur, born: this.now, zone, tick })
  }

  /** 右鍵點擊標記 */
  clickMarker(zone: number, x: number, y: number, color = '#5cf2a5'): void {
    const ring = new THREE.Mesh(new THREE.RingGeometry(0.25, 0.34, 32), new THREE.MeshBasicMaterial({ color, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending }))
    ring.rotation.x = -Math.PI / 2
    ring.position.copy(W(x, y, 0.05))
    this.transient(ring, 0.5, zone, (k) => {
      ring.scale.setScalar(1 + k * 1.5)
      ;(ring.material as THREE.MeshBasicMaterial).opacity = 1 - k
    })
  }

  /** 曳光彈 */
  tracer(zone: number, x0: number, y0: number, h0: number, x1: number, y1: number, h1: number, color: string, width = 0.05, dur = 0.08): void {
    const a = W(x0, y0, h0)
    const b = W(x1, y1, h1)
    const len = a.distanceTo(b)
    const m = new THREE.Mesh(
      new THREE.BoxGeometry(width, width, len),
      new THREE.MeshBasicMaterial({ color: new THREE.Color(color).multiplyScalar(4), transparent: true, depthWrite: false, blending: THREE.AdditiveBlending }),
    )
    m.position.copy(a).lerp(b, 0.5)
    m.lookAt(b)
    this.transient(m, dur, zone, (k) => ((m.material as THREE.MeshBasicMaterial).opacity = 1 - k))
  }

  /** 光爆（爆炸、槍口）*/
  flash(zone: number, x: number, y: number, h: number, color: string, size: number, dur = 0.12): void {
    const m = new THREE.Mesh(
      new THREE.SphereGeometry(size, 12, 8),
      new THREE.MeshBasicMaterial({ color: new THREE.Color(color).multiplyScalar(5), transparent: true, depthWrite: false, blending: THREE.AdditiveBlending }),
    )
    m.position.copy(W(x, y, h))
    this.transient(m, dur, zone, (k) => {
      m.scale.setScalar(1 + k)
      ;(m.material as THREE.MeshBasicMaterial).opacity = 1 - k
    })
    const light = new THREE.PointLight(color, size * 60, size * 10, 2)
    light.position.copy(W(x, y, h + 0.3))
    this.transient(light, dur * 1.5, zone, (k) => (light.intensity = size * 60 * (1 - k)))
  }

  /** 地面衝擊環 */
  shock(zone: number, x: number, y: number, radius: number, color: string, dur = 0.5): void {
    const ring = new THREE.Mesh(new THREE.RingGeometry(0.85, 1, 48), new THREE.MeshBasicMaterial({ color: new THREE.Color(color).multiplyScalar(2), transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, side: THREE.DoubleSide }))
    ring.rotation.x = -Math.PI / 2
    ring.position.copy(W(x, y, 0.08))
    this.transient(ring, dur, zone, (k) => {
      ring.scale.setScalar(0.2 + k * radius)
      ;(ring.material as THREE.MeshBasicMaterial).opacity = 1 - k
    })
  }

  addTransient(obj: THREE.Object3D, dur: number, zone: number, tick?: (k: number) => void): void {
    this.transient(obj, dur, zone, tick)
  }

  update(dt: number, t: number, zone: number): void {
    this.now = t
    if (zone !== this.zone) {
      this.zone = zone
      this.ps = this.ps.filter((p) => p.zone === zone)
    }
    let n = 0
    const out: P[] = []
    for (const p of this.ps) {
      p.life -= dt
      if (p.life <= 0) continue
      const d = Math.exp(-p.drag * dt)
      p.vx *= d
      p.vy = p.vy * d - p.grav * dt
      p.vz *= d
      p.x += p.vx * dt
      p.y += p.vy * dt
      p.z += p.vz * dt
      if (p.y < 0.02) {
        p.y = 0.02
        p.vy = -p.vy * 0.3
      }
      out.push(p)
      if (p.zone !== zone) continue
      const k = p.life / p.max
      this.pos[n * 3] = p.x
      this.pos[n * 3 + 1] = p.y
      this.pos[n * 3 + 2] = p.z
      this.col[n * 4] = p.r * 3
      this.col[n * 4 + 1] = p.g * 3
      this.col[n * 4 + 2] = p.b * 3
      this.col[n * 4 + 3] = Math.min(1, k * 1.5)
      this.siz[n] = p.size * (0.5 + k * 0.5)
      n++
    }
    this.ps = out
    this.geo.setDrawRange(0, n)
    ;(this.geo.attributes.position as THREE.BufferAttribute).needsUpdate = true
    ;(this.geo.attributes.aColor as THREE.BufferAttribute).needsUpdate = true
    ;(this.geo.attributes.aSize as THREE.BufferAttribute).needsUpdate = true
    for (let i = this.trans.length - 1; i >= 0; i--) {
      const tr = this.trans[i]
      tr.obj.visible = tr.zone === zone
      const k = Math.min(1, (t - tr.born) / Math.max(0.001, tr.until - tr.born))
      tr.tick?.(k)
      if (t >= tr.until) {
        this.scene.remove(tr.obj)
        tr.obj.traverse((o) => {
          const m = o as THREE.Mesh
          m.geometry?.dispose()
          const mat = m.material as THREE.Material | undefined
          mat?.dispose()
        })
        this.trans.splice(i, 1)
      }
    }
  }
}
