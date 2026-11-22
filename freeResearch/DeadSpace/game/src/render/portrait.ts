// 介面用 3D 小圖：用遊戲內的同一套模型，離屏算成頭像／圖鑑縮圖（快取的 data URL），或在元素裡掛一個慢慢轉的即時預覽
// （頭像、圖鑑、身分揭露、結算畫面共用）。
//
// 設計：
// - 全頁只有一個離屏 WebGLRenderer（第一次真的要畫時才建立；建不起來就一直回 null，介面顯示原本的線條圖示）。
//   不和主畫面共用 renderer：主畫面的 renderer 隨場景換掉、後處理有自己的 render target，離屏一個小 context 比較單純。
// - 靜態小圖：portraitUrl 第一次被問到時排進佇列、回 null；之後每個 rAF 畫一張，畫好存成 data URL（LRU 快取），
//   通知 onPortraitReady 的訂閱者重繪。同一個外觀（PortraitSpec 正規化後的 key）只畫一次。
// - 即時預覽：mountSpin 在元素裡放一個 2D canvas，共用的 renderer 每幀畫好再 drawImage 過去（不會每個預覽各開一個 WebGL context）。
// - 外觀只來自快照欄位（portraitSpecOf 照 units.ts 的同一套規則）：偽裝中的異形看起來就是它偽裝的人類，不讀身分資料。
// - 燈光（美術聖經 §3、§4）：暖白主光（#fff1d6）＋冷青邊光（#8fd8ff）＋鈉燈暖色側逆光（#ffb46b）＋極低的半球環境光，
//   AgX tone mapping、sRGB 輸出、透明背景；所有模型同一套光，頭像之間看起來一致。
import * as THREE from 'three'
import { signal } from '@preact/signals'
import { UNITS } from '../shared/content/registry'
import type { UnitDef } from '../shared/content/types'
import { PLAYER_COLORS } from '../shared/constants'
import { EntFlag, type SnapEntity } from '../shared/protocol/messages'
import { animateRig, buildHuman, type Rig } from './models/human'
import { buildModel, type ModelView } from './models/index'
import { attachSuit } from './models/suits'
import { fogUniforms } from './materials'
import './models/misc'
import './models/xeno'
import './models/mutant'
import './models/android'
import './models/ships'
import './models/devices'

/** 要畫哪個模型：人類用職業 id（model = 'human'、cls = 職業），其他用 UnitDef.model */
export interface PortraitSpec {
  model: string
  /** 人類職業（model === 'human' 時）*/
  cls?: string
  /** 玩家色（人類衣服、外框）*/
  color?: string
  /** 半身（頭像）或全身（圖鑑、揭露）*/
  framing?: 'bust' | 'full'
  /** 單位定義 id（快照的 s.d）：防護服（'suit.*'）、spawn 變體、地上道具（'item:*'）要靠它；沒給時用 model 找第一個同模型的定義 */
  def?: string
  /** 外觀種子（快照的 s.i）：人類取 % 5 決定膚色，其他模型決定變化與姿勢相位 */
  seed?: number
  /** 敵對旗標（快照 fl 的 Hostile；哨戒砲之類依此換色）*/
  hostile?: boolean
  /** 寬／高比；預設半身 0.75、全身 1 */
  aspect?: number
}

/** units.ts 的 colorOf：沒有玩家色時是白色 */
function colorOf(c: number | undefined): string {
  return c !== undefined && c >= 0 ? (PLAYER_COLORS[c]?.hex ?? '#ffffff') : '#ffffff'
}

/**
 * 從快照實體算出外觀（和 units.ts 建 3D 單位用同一組欄位、同一套規則）。
 * 只看 s.d／s.cl／s.c／s.i／s.fl：偽裝中的異形在快照裡就是人員外觀，這裡也只會畫出人類。
 */
export function portraitSpecOf(s: SnapEntity, framing: 'bust' | 'full' = 'bust'): PortraitSpec {
  const d = s.d ?? ''
  const isItem = d.startsWith('item:')
  const def = isItem ? UNITS.get('groundItem') : UNITS.get(d)
  const station = !def && d.startsWith('station.')
  const model = def?.model ?? (station ? d : 'unknown')
  if (model === 'human')
    return {
      model,
      cls: s.cl || 'researcher',
      color: colorOf(s.c),
      def: d || undefined,
      seed: s.i % 5,
      framing,
    }
  return {
    model,
    color: colorOf(s.c),
    def: d || undefined,
    seed: s.i,
    hostile: ((s.fl ?? 0) & EntFlag.Hostile) !== 0,
    framing,
  }
}

/** 正規化：補預設值、拿掉不影響外觀的欄位（非人類模型不看玩家色；人類的種子只取 % 5）*/
export function normSpec(
  spec: PortraitSpec,
): Required<Omit<PortraitSpec, 'cls' | 'def'>> & { cls: string; def: string } {
  const framing = spec.framing === 'full' ? 'full' : 'bust'
  const aspect =
    spec.aspect && spec.aspect > 0 ? Math.round(spec.aspect * 1000) / 1000 : framing === 'bust' ? 0.75 : 1
  const human = spec.model === 'human'
  const seed = Math.max(0, Math.floor(spec.seed ?? 0))
  return {
    model: spec.model,
    cls: human ? spec.cls || 'researcher' : '',
    color: human ? (spec.color ?? '#ffffff').toLowerCase() : '',
    framing,
    def: spec.def ?? '',
    seed: human ? seed % 5 : seed,
    hostile: human ? false : !!spec.hostile,
    aspect,
  }
}

/** 快取 key：同一個外觀、同一個尺寸就是同一張圖 */
export function portraitKey(spec: PortraitSpec, size = 128): string {
  const n = normSpec(spec)
  return [
    n.model,
    n.cls,
    n.color,
    n.def,
    n.seed,
    n.hostile ? 1 : 0,
    n.framing,
    n.aspect,
    Math.round(size),
  ].join('|')
}

/** 輸出尺寸（px）：size 是高度，寬度依 aspect */
export function portraitDims(spec: PortraitSpec, size = 128): { w: number; h: number } {
  const n = normSpec(spec)
  const h = Math.max(16, Math.min(1024, Math.round(size)))
  return { w: Math.max(16, Math.round(h * n.aspect)), h }
}

// ───── 快取與佇列（不碰 WebGL，單元測試可以換掉 backend 直接驗證）─────

/** 真正畫圖的函式：回傳 data URL；null = 畫不出來（這個外觀不再重試）；throw 'unsupported' = 整個環境不支援 */
export type PortraitBackend = (spec: PortraitSpec, w: number, h: number) => string | null

interface Entry {
  url: string | null
  state: 'pending' | 'ready' | 'failed'
}

/** 最多快取幾張（頭像 192×256 的 webp 約 10–30 KB）*/
export const PORTRAIT_CACHE_MAX = 64

const cache = new Map<string, Entry>()
const queue: { key: string; spec: PortraitSpec; w: number; h: number }[] = []
const listeners = new Set<() => void>()
let backend: PortraitBackend | null = null
/** 環境不支援 WebGL（建立 context 失敗）：之後一律回 null，不再排隊 */
let unsupported = false
/** WebGL context 遺失中：佇列先停著，恢復後繼續 */
let paused = false
/** 最後一次畫圖失敗的原因（除錯用：__portraitStats）*/
let lastError = ''
let tick = 0

function touch(key: string, e: Entry): void {
  cache.delete(key)
  cache.set(key, e)
}

function evict(): void {
  while (cache.size > PORTRAIT_CACHE_MAX) {
    const k = cache.keys().next().value as string
    cache.delete(k)
  }
}

function schedule(): void {
  if (tick || paused || !queue.length) return
  if (typeof requestAnimationFrame === 'undefined') return
  // 每個 rAF 畫一張：不要在同一幀把一整排圖鑑都畫完卡住主執行緒
  tick = requestAnimationFrame(() => {
    tick = 0
    runOne()
    schedule()
  })
}

/**
 * 小圖畫好的版本號（每畫好／畫失敗一張加一）。元件在 render 裡讀 portraitReady.value 就會在小圖好了時重繪；
 * 比在 useEffect 裡用 onPortraitReady＋useState 可靠：讀了任何 signal 的元件在 props 沒變時，
 * @preact/signals 的 shouldComponentUpdate 會把 hooks 的 setState 擋掉（第 7 輪 HUD 頭像就卡在線條圖示）
 */
export const portraitReady = signal(0)

function notify(): void {
  portraitReady.value++
  for (const cb of [...listeners]) {
    try {
      cb()
    } catch {
      /* 訂閱者自己的錯不影響其他人 */
    }
  }
}

/** 畫佇列裡的下一張；回傳有沒有畫（佇列空了回 false）*/
function runOne(): boolean {
  const job = queue.shift()
  if (!job) return false
  const e = cache.get(job.key)
  // 排隊期間被擠出快取（很久沒人問）：不畫
  if (!e || e.state !== 'pending') return true
  const draw = backend ?? webglBackend
  let url: string | null
  try {
    url = draw(job.spec, job.w, job.h)
  } catch (err) {
    if (err === LOST) {
      // context 遺失中：放回佇列最前面，恢復後再畫
      queue.unshift(job)
      paused = true
      return false
    }
    if (err === UNSUPPORTED) {
      unsupported = true
      queue.length = 0
      for (const v of cache.values()) if (v.state === 'pending') v.state = 'failed'
      notify()
      return true
    }
    url = null
    lastError = err instanceof Error ? `${err.message}\n${err.stack ?? ''}`.slice(0, 600) : String(err)
  }
  e.url = url
  e.state = url ? 'ready' : 'failed'
  notify()
  return true
}

/** 取得一張快取的小圖（data URL）；還沒算好或環境不支援 WebGL 時回 null，呼叫端顯示原本的線條圖示 */
export function portraitUrl(spec: PortraitSpec, size = 128): string | null {
  if (unsupported) return null
  const key = portraitKey(spec, size)
  const e = cache.get(key)
  if (e) {
    touch(key, e)
    return e.url
  }
  const { w, h } = portraitDims(spec, size)
  cache.set(key, { url: null, state: 'pending' })
  evict()
  queue.push({ key, spec: { ...spec }, w, h })
  schedule()
  return null
}

/** 小圖算好時通知（介面據此重繪）；回傳取消訂閱 */
export function onPortraitReady(cb: () => void): () => void {
  listeners.add(cb)
  return () => void listeners.delete(cb)
}

/** 這個環境能不能畫 3D 小圖（還沒試過時當作可以）*/
export function portraitSupported(): boolean {
  return !unsupported
}

/** 測試用：換掉畫圖的 backend（null = 恢復 WebGL）並清空快取、佇列 */
export function __setPortraitBackend(b: PortraitBackend | null): void {
  backend = b
  unsupported = false
  paused = false
  cache.clear()
  queue.length = 0
  if (tick && typeof cancelAnimationFrame !== 'undefined') cancelAnimationFrame(tick)
  tick = 0
}

/** 測試用：同步畫完佇列裡所有的圖；回傳畫了幾張 */
export function __flushPortraits(): number {
  let n = 0
  while (queue.length && !paused) if (runOne()) n++
  return n
}

/** 測試／除錯用：快取裡有幾張、佇列裡還有幾張、畫失敗幾張、最後一次失敗的原因 */
export function __portraitStats(): {
  cached: number
  queued: number
  failed: number
  paused: boolean
  unsupported: boolean
  lastError: string
} {
  let failed = 0
  for (const v of cache.values()) if (v.state === 'failed') failed++
  return { cached: cache.size, queued: queue.length, failed, paused, unsupported, lastError }
}

// ───── WebGL backend ─────

const UNSUPPORTED = 'unsupported'
const LOST = 'lost'

interface Stage {
  renderer: THREE.WebGLRenderer
  scene: THREE.Scene
  camera: THREE.PerspectiveCamera
  lost: boolean
}

let stage: Stage | null = null

/** 共用的離屏 renderer 與燈光場景（第一次要畫時建立）；建不起來 throw UNSUPPORTED */
function getStage(): Stage {
  if (stage) return stage
  if (typeof document === 'undefined') throw UNSUPPORTED
  let renderer: THREE.WebGLRenderer
  try {
    const canvas = document.createElement('canvas')
    canvas.width = canvas.height = 64
    renderer = new THREE.WebGLRenderer({
      canvas,
      alpha: true,
      antialias: true,
      preserveDrawingBuffer: true,
      powerPreference: 'low-power',
      stencil: false,
    })
  } catch {
    throw UNSUPPORTED
  }
  renderer.setPixelRatio(1)
  renderer.outputColorSpace = THREE.SRGBColorSpace
  renderer.toneMapping = THREE.AgXToneMapping
  renderer.toneMappingExposure = 1.35
  renderer.setClearColor(0x000000, 0)
  const scene = new THREE.Scene()
  // 主光：暖白，左前上方（三分之二側光，臉有明暗）
  const key = new THREE.DirectionalLight('#fff1d6', 3.0)
  key.position.set(-2.6, 3.4, 3.2)
  // 邊光：冷青，右後上方（把剪影從透明背景裡勾出來）
  const rim = new THREE.DirectionalLight('#8fd8ff', 3.4)
  rim.position.set(2.8, 2.6, -3.4)
  // 側逆光：鈉燈暖橘，左後低處（站內走廊燈的味道）
  const kick = new THREE.DirectionalLight('#ffb46b', 1.6)
  kick.position.set(-3.2, 0.8, -2.4)
  // 正面低處的柔和補光：暗色制服不會整片黑掉
  const fill = new THREE.DirectionalLight('#9fb3c2', 0.7)
  fill.position.set(0.6, 0.4, 4)
  scene.add(key, rim, kick, fill, new THREE.HemisphereLight('#22303f', '#06080b', 1.1))
  const camera = new THREE.PerspectiveCamera(24, 1, 0.05, 400)
  const st: Stage = { renderer, scene, camera, lost: false }
  renderer.domElement.addEventListener('webglcontextlost', (e) => {
    e.preventDefault()
    st.lost = true
  })
  renderer.domElement.addEventListener('webglcontextrestored', () => {
    st.lost = false
    paused = false
    schedule()
  })
  stage = st
  return st
}

/** 找一個用這個模型的單位定義（圖鑑只給 model 時；比例、半徑用）*/
function defFor(n: ReturnType<typeof normSpec>): UnitDef | undefined {
  if (n.def) {
    const d = n.def.startsWith('item:') ? UNITS.get('groundItem') : UNITS.get(n.def)
    if (d) return d
  }
  for (const d of UNITS.values()) if (d.model === n.model) return d
  return undefined
}

interface Built {
  /** 外層：轉向、置中都動這一層（模型自己的 root 由動畫控制）*/
  holder: THREE.Group
  rig: Rig | null
  model: ModelView | null
  /** 要框進畫面的範圍（holder 未旋轉時的座標）*/
  roi: THREE.Box3
  /** 旋轉時水平方向最遠到哪（即時預覽用，轉到側面也不會切到）*/
  radial: number
  /** 姿勢相位（非人類模型的 update 時間偏移）*/
  t0: number
}

/** 照 units.ts 的方式建模型（同一套 builder、同一組快照欄位）*/
function build(spec: PortraitSpec): Built {
  const n = normSpec(spec)
  const holder = new THREE.Group()
  let rig: Rig | null = null
  let model: ModelView | null = null
  if (n.model === 'human') {
    rig = buildHuman(n.cls, n.color, n.seed)
    if (n.def.startsWith('suit.')) attachSuit(rig, n.def, n.color)
    holder.add(rig.root)
    animateRig(rig, 0, 1, 0, 0, 0)
  } else {
    const def = defFor(n)
    const s: SnapEntity = { i: n.seed, d: n.def || def?.id || n.model, fl: n.hostile ? EntFlag.Hostile : 0 }
    model = buildModel(n.model, def, s)
    holder.add(model.root)
    model.update(0.95, 0.016, 0, 0)
    model.update(1, 0.016, 0, 0)
  }
  holder.updateMatrixWorld(true)
  const all = new THREE.Box3().setFromObject(holder, true)
  if (all.isEmpty()) all.set(new THREE.Vector3(-0.5, 0, -0.5), new THREE.Vector3(0.5, 1, 0.5))
  const size = all.getSize(new THREE.Vector3())
  let roi = all.clone()
  if (n.framing === 'bust') {
    const flat = Math.max(size.x, size.z)
    if (rig || size.y >= flat * 1.3) {
      // 直立的（人類、人形變種、雙足機體）：只框胸口以上（頭佔畫面一半左右）
      const y0 = all.min.y + size.y * (rig ? 0.67 : 0.5)
      const top = boxAbove(holder, y0)
      if (!top.isEmpty()) {
        roi = top
        roi.max.y += size.y * 0.02
      }
    } else if (size.z > size.x * 1.2) {
      // 四足、長條的（模型面向 +z）：框頭的那一半（前腳、頭、肩），尾巴切掉
      roi.min.z = all.max.z - size.z * 0.62
    }
  }
  // 旋轉軸（holder 的 y 軸）到最遠一點的水平距離
  const cx = (roi.min.x + roi.max.x) / 2
  const cz = (roi.min.z + roi.max.z) / 2
  const radial = Math.max(
    Math.hypot(roi.max.x - cx, roi.max.z - cz),
    Math.hypot(roi.min.x - cx, roi.min.z - cz),
  )
  return { holder, rig, model, roi, radial, t0: 1 }
}

const _v = new THREE.Vector3()
const _m = new THREE.Matrix4()

/** 只算高於 y0 的頂點的包圍盒（半身框：腰以下的武器、腿不算進寬度）*/
function boxAbove(root: THREE.Object3D, y0: number): THREE.Box3 {
  const b = new THREE.Box3()
  root.traverse((o) => {
    const mesh = o as THREE.Mesh
    if (!mesh.isMesh || !mesh.visible) return
    const pos = mesh.geometry?.attributes.position
    if (!pos) return
    const inst = (mesh as THREE.InstancedMesh).isInstancedMesh ? (mesh as THREE.InstancedMesh) : null
    const count = inst ? inst.count : 1
    for (let k = 0; k < count; k++) {
      if (inst) {
        inst.getMatrixAt(k, _m)
        _m.premultiply(mesh.matrixWorld)
      } else _m.copy(mesh.matrixWorld)
      // 頂點多的（毛髮、管線）抽樣就好
      const step = Math.max(1, Math.floor(pos.count / 600))
      for (let i = 0; i < pos.count; i += step) {
        _v.fromBufferAttribute(pos, i).applyMatrix4(_m)
        if (_v.y >= y0) b.expandByPoint(_v)
      }
    }
  })
  return b
}

/** 預設的 3/4 側面角度（模型面向 +z，往畫面左邊轉一點）與俯角 */
const YAW = -0.5
const ELEV: Record<'bust' | 'full', number> = { bust: 0.1, full: 0.22 }
/** 框住的範圍佔畫面的比例 */
const FILL: Record<'bust' | 'full', number> = { bust: 0.92, full: 0.86 }

/**
 * 擺好鏡頭：holder 轉 yaw、把框的中心移到原點，鏡頭在 +z 方向往下看一點。
 * 距離用 8 個角的投影直接算（透視投影下水平、垂直方向各自需要的距離取最大）。
 * spin = 即時預覽：水平範圍用旋轉半徑，轉到側面也不會被切到。
 */
function frame(
  b: Built,
  cam: THREE.PerspectiveCamera,
  aspect: number,
  framing: 'bust' | 'full',
  yaw: number,
  spin: boolean,
): void {
  const roi = b.roi
  const center = roi.getCenter(new THREE.Vector3())
  b.holder.rotation.set(0, yaw, 0)
  b.holder.position.set(0, 0, 0)
  b.holder.updateMatrixWorld(true)
  // 旋轉後的中心
  const c = center.clone().applyMatrix4(b.holder.matrixWorld)
  b.holder.position.sub(c)
  b.holder.updateMatrixWorld(true)
  const el = ELEV[framing]
  const dir = new THREE.Vector3(0, Math.sin(el), Math.cos(el))
  // 鏡頭座標軸（看向原點）
  const zAxis = dir.clone()
  const xAxis = new THREE.Vector3(0, 1, 0).cross(zAxis).normalize()
  const yAxis = zAxis.clone().cross(xAxis).normalize()
  cam.aspect = aspect
  const tanV = Math.tan(THREE.MathUtils.degToRad(cam.fov / 2))
  const tanH = tanV * aspect
  const fill = FILL[framing]
  let d = 0.5
  const pts: THREE.Vector3[] = []
  if (spin) {
    const r = b.radial
    const hy = (roi.max.y - roi.min.y) / 2
    for (const sy of [-1, 1])
      for (let a = 0; a < 8; a++)
        pts.push(
          new THREE.Vector3(
            Math.cos((a / 8) * Math.PI * 2) * r,
            sy * hy,
            Math.sin((a / 8) * Math.PI * 2) * r,
          ),
        )
  } else {
    for (const x of [roi.min.x, roi.max.x])
      for (const y of [roi.min.y, roi.max.y])
        for (const z of [roi.min.z, roi.max.z])
          pts.push(new THREE.Vector3(x, y, z).applyMatrix4(b.holder.matrixWorld))
  }
  for (const p of pts) {
    const px = p.dot(xAxis)
    const py = p.dot(yAxis)
    const pz = p.dot(zAxis)
    d = Math.max(d, Math.abs(px) / (tanH * fill) + pz, Math.abs(py) / (tanV * fill) + pz)
  }
  cam.position.copy(dir).multiplyScalar(d)
  cam.near = Math.max(0.01, d * 0.05)
  cam.far = d * 4 + 10
  cam.lookAt(0, 0, 0)
  cam.updateProjectionMatrix()
}

/** 畫一幀到共用的 renderer（尺寸 w×h）：暫時關掉戰爭迷霧與烘焙補光（全域 uniform，主畫面下一幀照常）*/
function renderStage(st: Stage, b: Built, w: number, h: number): void {
  const r = st.renderer
  const cur = r.getSize(new THREE.Vector2())
  if (cur.x !== w || cur.y !== h) r.setSize(w, h, false)
  const fogOn = fogUniforms.uFogOn.value
  const fillOn = fogUniforms.uFillOn.value
  fogUniforms.uFogOn.value = 0
  fogUniforms.uFillOn.value = 0
  st.scene.add(b.holder)
  try {
    r.render(st.scene, st.camera)
  } finally {
    st.scene.remove(b.holder)
    fogUniforms.uFogOn.value = fogOn
    fogUniforms.uFillOn.value = fillOn
  }
}

function webglBackend(spec: PortraitSpec, w: number, h: number): string | null {
  const st = getStage()
  if (st.lost) throw LOST
  const n = normSpec(spec)
  const b = build(spec)
  frame(b, st.camera, w / h, n.framing, YAW, false)
  renderStage(st, b, w, h)
  const c = st.renderer.domElement
  // webp 支援透明、檔案小很多；不支援的瀏覽器會自動回 png
  const url = c.toDataURL('image/webp', 0.92)
  return url.startsWith('data:image/') ? url : null
}

// ───── 即時預覽（慢慢轉）─────

interface Spin {
  el: HTMLElement
  canvas: HTMLCanvasElement
  ctx: CanvasRenderingContext2D
  spec: PortraitSpec
  built: Built | null
  at: number
  /** 上次擺鏡頭時的尺寸（變了才重算）與當時算出的鏡頭 */
  dims: string
  cam: { pos: THREE.Vector3; near: number; far: number } | null
}

const spins = new Set<Spin>()
let spinRaf = 0
let spinLast = 0

function reduced(): boolean {
  try {
    return typeof matchMedia !== 'undefined' && matchMedia('(prefers-reduced-motion: reduce)').matches
  } catch {
    return false
  }
}

function spinFrame(now: number): void {
  spinRaf = spins.size ? requestAnimationFrame(spinFrame) : 0
  if (!spinRaf) return
  // 約 30 fps 就夠順
  if (now - spinLast < 30) return
  const dt = Math.min(0.1, (now - (spinLast || now)) / 1000)
  spinLast = now
  let st: Stage
  try {
    st = getStage()
  } catch {
    unsupported = true
    return
  }
  if (st.lost) return
  const still = reduced()
  for (const s of spins) {
    if (!s.el.isConnected) continue
    const cw = s.el.clientWidth
    const ch = s.el.clientHeight
    if (cw <= 0 || ch <= 0) continue
    const k = Math.min(2, typeof devicePixelRatio === 'number' ? devicePixelRatio || 1 : 1)
    const w = Math.min(768, Math.round(cw * k))
    const h = Math.min(768, Math.round(ch * k))
    if (s.canvas.width !== w || s.canvas.height !== h) {
      s.canvas.width = w
      s.canvas.height = h
    }
    if (!s.built) {
      try {
        s.built = build(s.spec)
      } catch {
        continue
      }
    }
    const b = s.built
    const t = (now - s.at) / 1000
    const n = normSpec(s.spec)
    const yaw = still ? YAW : YAW + t * 0.55
    const dims = `${w}x${h}`
    const cam = st.camera
    // 鏡頭距離只在尺寸變了時算一次（用旋轉半徑框，轉到哪個角度都框得住）
    if (s.dims !== dims || !s.cam) {
      frame(b, cam, w / h, n.framing, yaw, true)
      s.dims = dims
      s.cam = { pos: cam.position.clone(), near: cam.near, far: cam.far }
    } else {
      cam.aspect = w / h
      cam.position.copy(s.cam.pos)
      cam.near = s.cam.near
      cam.far = s.cam.far
      cam.lookAt(0, 0, 0)
      cam.updateProjectionMatrix()
    }
    // 繞著框的中心轉：旋轉後重新置中
    const roiC = b.roi.getCenter(new THREE.Vector3())
    b.holder.position.set(0, 0, 0)
    b.holder.rotation.set(0, yaw, 0)
    b.holder.updateMatrixWorld(true)
    b.holder.position.sub(roiC.applyMatrix4(b.holder.matrixWorld))
    if (!still) {
      if (b.rig) animateRig(b.rig, dt, b.t0 + t, 0, 0, 0)
      else b.model?.update(b.t0 + t, dt, 0, 0)
    }
    renderStage(st, b, w, h)
    s.ctx.clearRect(0, 0, w, h)
    s.ctx.drawImage(st.renderer.domElement, 0, 0, w, h)
  }
}

/** 在 el 裡掛一個慢慢轉的即時預覽；回傳卸載函式。環境不支援時什麼都不做（el 保持原樣，呼叫端的後備圖示照常顯示）*/
export function mountSpin(el: HTMLElement, spec: PortraitSpec): () => void {
  if (unsupported || typeof document === 'undefined' || typeof requestAnimationFrame === 'undefined')
    return () => {}
  try {
    getStage()
  } catch {
    unsupported = true
    return () => {}
  }
  const canvas = document.createElement('canvas')
  canvas.className = 'portrait-spin'
  canvas.setAttribute('aria-hidden', 'true')
  canvas.style.cssText = 'display:block;width:100%;height:100%;pointer-events:none'
  const ctx = canvas.getContext('2d')
  if (!ctx) return () => {}
  el.appendChild(canvas)
  const s: Spin = {
    el,
    canvas,
    ctx,
    spec: { ...spec },
    built: null,
    at: typeof performance !== 'undefined' ? performance.now() : 0,
    dims: '',
    cam: null,
  }
  spins.add(s)
  if (!spinRaf) {
    spinLast = 0
    spinRaf = requestAnimationFrame(spinFrame)
  }
  return () => {
    spins.delete(s)
    canvas.remove()
    if (!spins.size && spinRaf) {
      cancelAnimationFrame(spinRaf)
      spinRaf = 0
    }
  }
}
