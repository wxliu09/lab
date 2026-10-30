// 模型展示頁（只給 dev server 與 tests/visual/models.mjs 截圖用，不在正式 build 入口）
// 用法：/models.html?ids=xeno.*,human&dist=30&pitch=56&state=0&speed=0&cols=6&sp=4.5&yaw=25&q=low
import * as THREE from 'three'
import '../shared/content'
import '../render/units'
import { MODELS, buildModel, type ModelView } from '../render/models/index'
import { animateRig, buildHuman, type Rig } from '../render/models/human'
import { UNITS } from '../shared/content/registry'
import { getEngine, type SceneLike } from '../render/engine'
import { Mat } from '../render/materials'
import { setQuality, type Quality } from '../render/quality'
import type { SnapEntity } from '../shared/protocol/messages'

const q = new URLSearchParams(location.search)
const num = (k: string, d: number) => (q.has(k) ? Number(q.get(k)) : d)
setQuality((q.get('q') as Quality | null) ?? 'low')

interface Slot {
  id: string
  root: THREE.Group
  view: ModelView | null
  rig: Rig | null
  label: HTMLDivElement
  height: number
}

function expand(list: string[]): string[] {
  const out: string[] = []
  for (const s of list) {
    if (s.endsWith('*')) {
      const p = s.slice(0, -1)
      out.push(...[...MODELS.keys()].filter((k) => k.startsWith(p)).sort())
    } else if (s) out.push(s)
  }
  return out
}

function tris(o: THREE.Object3D): [number, number] {
  let t = 0
  let m = 0
  o.traverse((c) => {
    const mesh = c as THREE.Mesh
    if (!mesh.isMesh || !c.visible) return
    const g = mesh.geometry
    t += (g.index ? g.index.count : g.attributes.position.count) / 3
    m++
  })
  return [Math.round(t), m]
}

const ids = expand((q.get('ids') ?? 'xeno.*').split(','))
const cols = num('cols', 6)
const sp = num('sp', 4.5)
const yaw = (num('yaw', 25) * Math.PI) / 180
let state = num('state', 0)
let speed = num('speed', 0)

const scene = new THREE.Scene()
scene.background = new THREE.Color('#030507')
scene.add(new THREE.HemisphereLight('#1b2633', '#0b0d10', 0.9))
const rows = Math.ceil(ids.length / cols)
const W = cols * sp
const H = rows * sp
// 頂燈：模仿站內房間燈（y 4.2、spot、decay 1.4）
for (let i = 0; i < Math.max(2, Math.ceil(ids.length / 4)); i++) {
  const l = new THREE.SpotLight(i % 3 === 2 ? '#ffd2a0' : '#e8f4ff', 26, 16, Math.PI * 0.42, 0.65, 1.4)
  const c = (i % Math.ceil(cols / 2)) * 2 - cols / 2 + 1
  const r = Math.floor(i / Math.ceil(cols / 2))
  l.position.set(c * sp, 4.2, (r * 2 - rows / 2 + 1) * sp)
  l.target.position.set(l.position.x, 0, l.position.z)
  scene.add(l, l.target)
}
const accent = new THREE.PointLight('#7fd8ff', 8, 12, 1.6)
accent.position.set(-W / 2, 1.2, H / 2)
scene.add(accent)

// 地板（站內防滑金屬板）
const fg = new THREE.PlaneGeometry(W + 30, H + 30)
fg.rotateX(-Math.PI / 2)
const uv = fg.attributes.uv
for (let i = 0; i < uv.count; i++) uv.setXY(i, (uv.getX(i) * (W + 30)) / 2, (uv.getY(i) * (H + 30)) / 2)
fg.setAttribute('color', new THREE.Float32BufferAttribute(new Float32Array(fg.attributes.position.count * 3).fill(1), 3))
const floor = new THREE.Mesh(fg, Mat.floor('plate', '#3a424b'))
floor.receiveShadow = true
scene.add(floor)

const ringGeo = new THREE.RingGeometry(0.48, 0.62, 36)
const labels = document.getElementById('labels')!
const slots: Slot[] = []
const summary: string[] = []
ids.forEach((id, i) => {
  const root = new THREE.Group()
  const c = i % cols
  const r = Math.floor(i / cols)
  root.position.set((c - (cols - 1) / 2) * sp, 0, (r - (rows - 1) / 2) * sp)
  root.rotation.y = yaw
  scene.add(root)
  let view: ModelView | null = null
  let rig: Rig | null = null
  let height: number
  let radius = 0.4
  if (id === 'human') {
    rig = buildHuman('security', '#ff4a4a', 1)
    rig.root.scale.setScalar(1.18)
    root.add(rig.root)
    height = rig.height * 1.18
  } else {
    const def = UNITS.get(id)
    const modelId = def?.model ?? id.replace(/\.spawn$/, '')
    const s: SnapEntity = { i: i + 1, d: id, st: state }
    view = buildModel(modelId, def, s)
    root.add(view.root)
    height = view.height
    if (def?.scale) root.scale.setScalar(def.scale)
    radius = def?.radius ?? 0.4
    if (!MODELS.has(modelId)) console.warn('[gallery] 沒有登錄的模型', modelId)
  }
  const ring = new THREE.Mesh(ringGeo, new THREE.MeshBasicMaterial({ color: '#ff3b3b', transparent: true, opacity: 0.55, depthWrite: false, blending: THREE.AdditiveBlending }))
  ring.rotation.x = -Math.PI / 2
  ring.position.y = 0.03
  ring.scale.setScalar(radius * 1.6)
  root.add(ring)
  const [t, m] = tris(view?.root ?? rig!.root)
  const label = document.createElement('div')
  label.className = 'lb'
  label.innerHTML = `<b>${id}</b><br><i>${t} tris · ${m} mesh · h ${height.toFixed(2)}</i>`
  labels.appendChild(label)
  slots.push({ id, root, view, rig, label, height })
  summary.push(`${id}\t${t}\t${m}\t${height.toFixed(2)}`)
})
console.log('[gallery]\n' + summary.join('\n'))

const dist = num('dist', 30)
const pitch = (num('pitch', 56) * Math.PI) / 180
const cam = new THREE.PerspectiveCamera(34, innerWidth / innerHeight, 0.5, 400)
const cz = num('cz', 0)
cam.position.set(0, Math.sin(pitch) * dist, cz + Math.cos(pitch) * dist)
cam.lookAt(0, 0.6, cz)

const v = new THREE.Vector3()
let deadAt = -1
const sl: SceneLike = {
  scene,
  camera: cam,
  update(dt, t) {
    if (state === 4 && deadAt < 0) deadAt = t
    if (state !== 4) deadAt = -1
    for (const s of slots) {
      if (s.view) s.view.update(t, dt, speed, state)
      if (s.rig) animateRig(s.rig, dt, t, speed, state, deadAt >= 0 ? t - deadAt : 0)
      v.set(0, -0.15, 0).applyMatrix4(s.root.matrixWorld)
      v.project(cam)
      s.label.style.left = `${(v.x * 0.5 + 0.5) * innerWidth}px`
      s.label.style.top = `${(-v.y * 0.5 + 0.5) * innerHeight + 6}px`
    }
    frames++
  },
}
let frames = 0
const engine = getEngine(document.getElementById('c') as HTMLCanvasElement)
engine.setScene(sl)
engine.start()

;(window as unknown as Record<string, unknown>).__gallery = {
  get frames() {
    return frames
  },
  summary,
  set(st: number, sp2: number) {
    state = st
    speed = sp2
  },
  labels(on: boolean) {
    labels.style.display = on ? '' : 'none'
  },
}
