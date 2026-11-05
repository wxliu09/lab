// 遊戲場景：一次只渲染玩家所在的 zone；站體快取、迷霧、燈光池、手電筒、單位同步
import * as THREE from 'three'
import { STATION_BY_ID } from '../shared/content/stations/index'
import { parseLayout, cellAt as layoutCell, type ParsedLayout } from '../shared/layout'
import { UNITS } from '../shared/content/registry'
import { EntFlag, type SnapEntity } from '../shared/protocol/messages'
import type { ClientWorld, CEnt } from '../client/world'
import type { SceneLike } from './engine'
import { RtsCamera } from './camera'
import { addPoiRing, buildStation, buildStationSteps, updateDoors, type RoomLight, type StationView } from './stationBuilder'
import { poiModel, poiWreck, type Animated } from './props'
import { PoiTracker, sightOf, type PoiLook, type PoiSeen } from './poiState'
import { CrateMemory, type CrateSeen } from './crateMemory'
import { Blizzard } from './weather'
import { CRATE_DEF, isStructureId } from '../client/interactKind'
import { FogMap } from './fog'
import { UnitLayer, unitWarmMeshes } from './units'
import { fogUniforms, emergencyStripMat, isSharedMaterial } from './materials'
import { sfx } from '../audio/sfx'
import { autoLowerQuality, canPrebuild, preset, quality, qualityChosen } from './quality'
import { autoDropState, autoDropStep } from './autoDrop'
import { localNotice, modalChecks } from '../client/input'
import '../ui/strings/art2'
import { effect, signal } from '@preact/signals'
import { runSteps, type Steps } from './steps'
import { deferTextures, textureSteps } from './tex'
import { warmSet } from './fx/kit'
import { Fx } from './fx'
import '../shared/content/index'
import { SHIP_BY_ID } from '../shared/content/ships'
import type { StationDef } from '../shared/content/stations/types'
import { makeSky } from './space/sky'
import './models/ships'
import './models/devices'
import { buffWarmMaterials, updateBuffFx } from './buffFx'
import { MODELS, buildModel } from './models/index'
import { groundItemWarmMeshes } from './models/groundItems'

/** 預建站點時用到的引擎功能（GameScreen 傳入 Engine）*/
export interface PrebuildHost {
  renderer: THREE.WebGLRenderer
  /** 同步預編譯（KHR_parallel_shader_compile 可用時不等 GPU 連結；連結結果之後用 program.isReady() 輪詢）*/
  compile(obj: THREE.Object3D, camera: THREE.Camera, target: THREE.Scene): void
}

type IdleCb = (dl?: { timeRemaining(): number; didTimeout?: boolean }) => void

/** 預建一片的時間上限（idle callback 逾時觸發、頁面一直忙的時候；有空閒時間就用空閒時間）*/
const SLICE_MS = 8
/** 有空閒時間時一片最多做多久 */
const IDLE_MAX_MS = 24
/** 一次 compile 呼叫最多送幾個物件（每個新的 program 要組 shader 字串，約 1–3 ms）*/
const COMPILE_BATCH = 4
/**
 * 要顯示的站還沒建好時（不預建的裝置、預建還沒輪到）的分段建站：一片最多做多久。「載入中」覆蓋層蓋著、這段期間不畫 3D，
 * 所以用預建有空閒時間時的上限；主機的 HostRelay（20 Hz）在兩片之間照常轉送，最多晚這麼久。
 */
const LOAD_SLICE_MS = IDLE_MAX_MS
/** 駕駛中的船離某站多近（太空座標；船速約 1–1.6/秒，約 5–8 秒的航程）就先分段建那一站 */
const LOOKAHEAD_R = 8

/**
 * 預建的開關（quality.ts canPrebuild）：只有 ≤ 4 核心、deviceMemory ≤ 4 GB、行動裝置、軟體算繪（建一站要好幾秒）不預建，
 * 維持第一次進站才建；一般內顯筆電要預建（全部預建多佔約 300 MB GPU 記憶體與 RSS）。
 * localStorage `xc.prebuild` = '1'／'0' 可強制開關（量測用）。
 */
function prebuildAllowed(gl: WebGLRenderingContext | WebGL2RenderingContext): boolean {
  let force: string | null = null
  try {
    force = localStorage.getItem('xc.prebuild')
  } catch {
    /* ignore */
  }
  if (force === '1') return true
  if (force === '0') return false
  return canPrebuild(gl)
}

/** 預編譯一批物件：three 的 compile 只用到根物件的 traverse（收材質）與 traverseVisible（收燈光），用一個假的根物件把零散的 mesh 包成一批 */
function batchRoot(objs: THREE.Object3D[], lights: THREE.Object3D[]): THREE.Object3D {
  return {
    traverse: (cb: (o: THREE.Object3D) => void) => {
      for (const o of objs) cb(o)
    },
    traverseVisible: (cb: (o: THREE.Object3D) => void) => {
      for (const o of lights) cb(o)
    },
  } as unknown as THREE.Object3D
}

/** 要預編譯的物件：每種（材質 × 物件類型 × geometry attribute 組合）取一個；program 只跟這些有關 */
function compileItems(roots: THREE.Object3D[]): THREE.Object3D[] {
  const seen = new Set<string>()
  const out: THREE.Object3D[] = []
  for (const root of roots) {
    root.traverse((o) => {
      const m = o as THREE.Mesh
      if (!m.material || !(m.isMesh || (o as THREE.Points).isPoints || (o as THREE.Line).isLine || (o as THREE.Sprite).isSprite)) return
      const mats = Array.isArray(m.material) ? m.material : [m.material]
      const g = m.geometry
      const im = o as THREE.InstancedMesh
      const k = `${mats.map((x) => x.uuid).join('+')}|${o.type}|${im.isInstancedMesh ? (im.instanceColor ? 2 : 1) : 0}|${g ? Object.keys(g.attributes).join(',') + ':' + Object.keys(g.morphAttributes).length : ''}`
      if (seen.has(k)) return
      seen.add(k)
      out.push(o)
    })
  }
  return out
}

/** 物件用到的貼圖（材質上的所有 Texture 欄位）*/
function texturesOf(roots: THREE.Object3D[], out: Set<THREE.Texture>): void {
  for (const root of roots) {
    root.traverse((o) => {
      const ms = (o as THREE.Mesh).material
      if (!ms) return
      for (const m of Array.isArray(ms) ? ms : [ms]) {
        for (const v of Object.values(m)) if (v instanceof THREE.Texture) out.add(v)
      }
    })
  }
}

/** requestIdleCallback（沒有就退回 setTimeout）；timeout 讓一直忙碌的頁面也會在幾秒內輪到 */
function onIdle(cb: IdleCb, timeout: number): () => void {
  const w = window as unknown as { requestIdleCallback?: (cb: IdleCb, o: { timeout: number }) => number; cancelIdleCallback?: (id: number) => void }
  if (w.requestIdleCallback && w.cancelIdleCallback) {
    const id = w.requestIdleCallback(cb, { timeout })
    return () => w.cancelIdleCallback!(id)
  }
  const id = setTimeout(() => cb(), Math.min(timeout, 200))
  return () => clearTimeout(id)
}

export interface ZoneInfo {
  id: number
  key: string
  station: string
  layout: ParsedLayout
}

/** 站點或船艇內艙的定義 */
export function stationDefOf(id: string): StationDef | undefined {
  if (id.startsWith('ship:')) {
    const sh = SHIP_BY_ID.get(id.slice(5))
    if (!sh) return undefined
    return { id, name: sh.name, theme: 'ship', layout: sh.layout, space: { hp: 1, hpRegen: 0, radius: 1, pos: [0, 0], speed: 0, abilities: [], pilotable: true, model: '' }, enable: 'core' }
  }
  return STATION_BY_ID.get(id)
}

/** 燈光池的一個槽位：cur = 目前照著的房間燈，next = 要換過去的（不同時先淡出）、w = 淡入程度 */
interface PoolSlot {
  l: THREE.SpotLight | THREE.PointLight
  cur: RoomLight | null
  next: RoomLight | null
  w: number
}

/** 燈光池選燈時往鏡頭前方看幾秒（換燈要約 0.2–0.4 秒才亮起來）、最遠幾 m */
const POOL_LEAD = 0.35
const POOL_LEAD_MAX = 6
/** 鏡頭附近（m）：這個範圍內亮著的燈換燈時要錯開 */
const POOL_NEAR = 14

/** 緊急照明：燈光、補光、環境光的目標色 */
const EMERGENCY = new THREE.Color('#ff2a18')
const EMERGENCY_FILL = new THREE.Color(1, 0.16, 0.1)
const EMERGENCY_SKY = new THREE.Color('#3a0806')
/** 暴風雪的天光（冷白）*/
const SNOW_SKY = new THREE.Color('#c9d6ea')

/** 物件與它所有的上層都可見（Raycaster 不看 visible）*/
function shown(o: THREE.Object3D | null): boolean {
  for (; o; o = o.parent) if (!o.visible) return false
  return true
}

/** 釋放換下來的設施外觀自己建的材質與光圈幾何（共用快取的幾何與材質不動）*/
function disposeLocal(root: THREE.Object3D): void {
  root.traverse((o) => {
    const m = o as THREE.Mesh
    if (m.geometry instanceof THREE.RingGeometry) m.geometry.dispose()
    const mm = m.material as THREE.Material | THREE.Material[] | undefined
    for (const x of Array.isArray(mm) ? mm : mm ? [mm] : []) if (!isSharedMaterial(x)) x.dispose()
  })
}

export class GameScene implements SceneLike {
  readonly scene = new THREE.Scene()
  readonly rts = new RtsCamera()
  readonly camera: THREE.PerspectiveCamera
  readonly units = new UnitLayer()
  readonly fx: Fx
  zones = new Map<number, ZoneInfo>()
  private views = new Map<number, StationView>()
  private fogs = new Map<number, FogMap>()
  zone = -1
  /** 燈光池：固定數量的即時光源，輪流借給離鏡頭最近的房間燈（換燈時約 0.3 秒淡出再淡入）*/
  private pool: PoolSlot[] = []
  private hemi: THREE.HemisphereLight
  /** 目前 zone 的主題環境光（緊急照明時改暗紅）*/
  private hemiBase = { sky: new THREE.Color(), ground: new THREE.Color(), k: 0 }
  /** 目前 zone 是否在緊急照明（0..1 淡入淡出）*/
  private emK = 0
  private emOn = false
  private flash: THREE.SpotLight
  private flashTarget = new THREE.Object3D()
  private fogT = 0
  private lightT = 0
  /** 燈光池看的鏡頭位置與速度（m/s，平滑過）*/
  private poolCam = { x: 0, y: 0, vx: 0, vy: 0 }
  /** 結構實體 id ↔ POI 格（key = `${zone}:${col},${row}`）*/
  poiEnt = new Map<string, number>()
  /** 各站固定設施的外觀狀態（完好／損毀的控制台／被摧毀，poiState.ts）*/
  private poiTrackers = new Map<number, PoiTracker>()
  /** 這一幀在目前 zone 的 POI 格上看到的結構實體（key = `${col},${row}`）*/
  private poiSeen = new Map<string, PoiSeen>()
  /** 換上的損毀外觀／殘骸模型（key 同 poiEnt）與它的動畫 */
  private poiAlt = new Map<string, { root: THREE.Object3D; anim: Animated[] }>()
  /** 迷霧更新的那一幀順便更新設施外觀 */
  private poiDue = false
  /** 程式放置的雜物箱的迷霧記憶（crateMemory.ts；zone → 記憶，換站回來還在）*/
  private crateMems = new Map<number, CrateMemory>()
  /** 這一幀在目前 zone 看得到、由單位層畫的雜物箱（版面 POI 格上的由站體畫，不算）*/
  private cratePresent = new Map<number, CrateSeen>()
  /** 目前 zone 畫出來的記憶中的雜物箱（id → 模型）；不放進單位層，點不到也不會有懸停說明 */
  private crateGhosts = new Map<number, THREE.Object3D>()
  private readonly crateGhostGroup = new THREE.Group()
  /** 天氣（目前只有餘燼衛星大氣護盾破掉後的暴風雪）*/
  private blizzard: Blizzard | null = null
  grade = { hue: 0, sat: 0.02, bright: 0, contrast: 0.06 }
  /** 目前 zone 主題的色彩分級（天氣在它上面調整）*/
  private gradeBase = this.grade
  /** 天氣所在的 zone（換站就重建）*/
  private weatherZone = -1
  onZoneChange: ((z: ZoneInfo) => void) | null = null
  centeredOnce = false
  /** 上次對準時的操控對象與 zone（變了就重新對準）*/
  private lastCtlKey = ''
  /** 本幀受到的傷害脈衝（0..1）*/
  damage = 0
  /**
   * 預建：待處理的 zone（0 = 太空層；已經建好的站只重新上傳／預編譯）、目前在跑的分段工作、
   * 正在分段建的站（使用者在它建完之前走進去，就由 buildView 同步把剩下的做完）
   */
  private prebuildHost: PrebuildHost | null = null
  private prebuildQ: number[] = []
  private prebuildIt: Steps | null = null
  private building: { id: number; it: Steps<StationView> } | null = null
  /** 引擎（上傳貼圖、預編譯）：不預建的裝置也有，顯示用的分段建站要用 */
  private host: PrebuildHost | null = null
  /**
   * 顯示用的分段建站：要顯示的站還沒建好時，不整站同步建（翠原星在低階裝置約 4–5 秒，主機卡住會讓所有客人停住），
   * 改成逐片建完（建站體 → 延後的貼圖 → 上傳 → 預編譯，同 prebuildZone）再切過去；期間 loading = true（GameScreen 顯示「載入中」）、
   * 引擎不畫 3D（holdFrame）。每一幀推進一片，片與片之間再用 MessageChannel 接著做（不必等下一幀）。
   */
  private loader: { id: number; it: Steps; wait: boolean; bg: boolean } | null = null
  /** 預先建（lookahead）的下一個空閒時間 */
  private cancelBg: (() => void) | null = null
  /** 預測下一站的計時（每 0.5 秒看一次）*/
  private lookT = 0
  /** 正在分段建要顯示的站（GameScreen 顯示和開局一樣的「載入中」覆蓋層）*/
  readonly loading = signal(false)
  /** 這一幀不畫（等分段建站；Engine.frame 看到就略過渲染）*/
  holdFrame = false
  private pumpCh: MessageChannel | null = null
  private pumpQueued = false
  /** 這一局（這個 WebGL context）已經送去上傳的貼圖；貼圖是模組層級快取、跨局共用，新的一局要重新上傳 */
  private uploaded = new WeakSet<THREE.Texture>()
  /** 已經「第一次使用」過的 program：第一次使用會同步查詢連結結果（沒有 KHR_parallel_shader_compile 時會等 GPU），在空閒時間先做 */
  private warmed = new WeakSet<object>()
  private cancelIdle: (() => void) | null = null
  private stopQuality: (() => void) | null = null
  private disposed = false
  prebuildDone = false
  /** fps 持續過低時自動降畫質（autoDrop.ts）：每局（每個 GameScene）一份狀態；上一幀看的 zone（換站建站的那幾幀不計）*/
  private autoDrop = autoDropState()
  private dropZone = -2
  /** 上一幀之後分頁曾經切到背景（背景時 rAF 停住，回來的第一個間隔不能算成「很慢的一幀」）*/
  private wasHidden = false
  private onVisibility = () => {
    if (document.hidden) this.wasHidden = true
  }
  /** 每幀重複使用的暫存（避免 GC）*/
  private tmpV = new THREE.Vector3()

  constructor(readonly world: ClientWorld) {
    this.camera = this.rts.cam
    this.scene.background = new THREE.Color('#030507')
    this.hemi = new THREE.HemisphereLight('#1b2633', '#0b0d10', 0.8)
    this.scene.add(this.hemi)
    const q = preset()
    // 前兩盞是投影的頂燈（spot），其餘是不投影的點光，讓牆面也被照亮
    for (let i = 0; i < q.maxLights; i++) {
      if (i < 2) {
        const l = new THREE.SpotLight('#ffffff', 0, 12, Math.PI * 0.42, 0.65, 1.4)
        l.castShadow = q.shadows > 0
        l.shadow.mapSize.set(1024, 1024)
        l.shadow.bias = -0.0008
        l.shadow.normalBias = 0.02
        l.shadow.camera.near = 0.5
        l.shadow.camera.far = 14
        this.scene.add(l, l.target)
        this.pool.push({ l, cur: null, next: null, w: 0 })
      } else {
        const l = new THREE.PointLight('#ffffff', 0, 12, 1.6)
        this.scene.add(l)
        this.pool.push({ l, cur: null, next: null, w: 0 })
      }
    }
    this.flash = new THREE.SpotLight('#fff2dc', 0, 16, Math.PI * 0.16, 0.5, 1.2)
    this.flash.castShadow = q.shadows > 1
    this.flash.shadow.mapSize.set(1024, 1024)
    this.flash.shadow.bias = -0.0005
    this.scene.add(this.flash, this.flashTarget)
    this.flash.target = this.flashTarget
    this.scene.add(this.units.group, this.crateGhostGroup)
    this.fx = new Fx(this.scene)
    if (typeof document !== 'undefined') document.addEventListener('visibilitychange', this.onVisibility)
  }

  setZones(list: [number, string, string][]): void {
    let added = false
    for (const [id, key, stationId] of list) {
      if (this.zones.has(id)) continue
      const st = stationDefOf(stationId)
      if (!st) continue
      this.zones.set(id, { id, key, station: stationId, layout: parseLayout(st.layout) })
      added = true
    }
    // 局中出現新的站（事件站）：太空層也重新預熱一次（新船殼的材質組合），第一次進太空才不會再編 shader
    if (this.prebuildHost) this.queuePrebuild(false, added && !!this.space)
  }

  private space: { group: THREE.Group; update: (t: number) => void; sun: THREE.DirectionalLight } | null = null

  /** 建立太空層（隱藏）*/
  private buildSpace(): NonNullable<GameScene['space']> {
    if (!this.space) {
      const sky = makeSky(260)
      const group = new THREE.Group()
      group.add(sky.group)
      const sun = new THREE.DirectionalLight('#fff1d6', 3.2)
      sun.position.set(6.5, 30, 2.9)
      sun.target.position.set(0, 0, 0)
      group.add(sun, sun.target)
      group.visible = false
      this.scene.add(group)
      this.space = { group, update: sky.update, sun }
    }
    return this.space
  }

  private ensureSpace(): void {
    this.buildSpace().group.visible = true
  }

  /**
   * 太空層的單位模型（本局各站的船殼、恆星、小行星、船艦）只在第一次進太空時才建，貼圖與 shader 也是那時才準備：
   * 預建太空層時先各建一份暫時的模型（一個模型一步），只用來預熱貼圖／材質快取與預編譯，之後丟掉（幾何從沒上傳過）。
   * 太空層多了太陽這盞平行光，three 的 program key 含燈光數：連不受光的材質（選取圈、腳下光暈、特效）第一次在太空用到也會新編一份，
   * 所以單位、buff 殼層／石化材質、特效材質與碎片池也各放一個代表物件。
   */
  private *spaceWarmSteps(): Steps<{ group: THREE.Group; fx: THREE.Group; disposeMats: THREE.Material[] }> {
    const g = new THREE.Group()
    const ids = new Set(['space.sun', 'space.asteroid'])
    for (const z of this.zones.values()) ids.add('station.' + z.station)
    for (const k of MODELS.keys()) if (k.startsWith('ship.')) ids.add(k)
    for (const id of ids) {
      if (!MODELS.has(id)) continue
      try {
        g.add(buildModel(id, undefined, { i: 0 } as SnapEntity).root)
      } catch {
        /* 預熱失敗不影響正式建立 */
      }
      yield
    }
    g.add(...unitWarmMeshes())
    const { group: fx, mats } = warmSet(this, buffWarmMaterials())
    g.add(fx)
    g.add(...this.fx.debrisWarm())
    return { group: g, fx, disposeMats: mats }
  }

  /** 站體建好之後登記（加迷霧圖）*/
  private finishView(id: number, v: StationView, info: ZoneInfo): StationView {
    this.views.set(id, v)
    this.fogs.set(id, new FogMap(info.layout))
    return v
  }

  /**
   * 建立站體（不加進場景）。不在目前 zone 的站體從場景圖移除而不只是隱藏：
   * 隱藏的物件每幀仍會跑 updateMatrixWorld，整局預建所有站之後這筆成本會變得明顯。
   * 預建正在分段建這一站（使用者在它建完前走進去）：同步把剩下的步驟做完；之前延後產生的貼圖在 three 上傳時自動做完。
   */
  private buildView(id: number): StationView | undefined {
    const v = this.views.get(id)
    if (v) return v
    const info = this.zones.get(id)
    const def = info && stationDefOf(info.station)
    if (!info || !def) return undefined
    if (this.building?.id === id) {
      const it = this.building.it
      this.building = null
      return this.finishView(id, runSteps(it), info)
    }
    return this.finishView(id, buildStation(def, info.layout), info)
  }

  /**
   * 開局後在空閒時間逐站預建本局的站點：建站體、產生貼圖、上傳貼圖、預編譯 shader；之後第一次進站不會卡住主執行緒（主機卡住會讓所有客人收不到快照）。
   * 每一步都切成幾 ms 的小片：buildStationSteps（每列格子、每個道具）、延後產生的程序化貼圖（tex.ts textureSteps，每片幾列像素）、
   * 一次上傳一張貼圖、一次預編譯幾個物件、一次「第一次使用」一個 program。有空閒時間就做到空閒時間用完；
   * requestIdleCallback 逾時觸發（頁面一直忙）時也只做 SLICE_MS。哪些裝置不預建見 prebuildAllowed。
   */
  startPrebuild(host: PrebuildHost): void {
    if (this.host || this.disposed) return
    // 不預建的裝置也記下引擎：第一次進站時用它分段建（loadSlice）
    this.host = host
    // WebGL context 恢復後所有貼圖與 program 都沒了：已建好的站重新上傳、預編譯
    host.renderer.domElement.addEventListener('webglcontextrestored', this.onRestored)
    if (!prebuildAllowed(host.renderer.getContext())) return
    this.prebuildHost = host
    // 對局中改畫質（陰影開關會改變 program key）：已建好的站重新預編譯（貼圖不用重傳）
    let first = true
    this.stopQuality = effect(() => {
      void quality.value
      if (first) {
        first = false
        return
      }
      this.queuePrebuild(true)
    })
    this.queuePrebuild(false)
  }

  private onRestored = () => {
    this.uploaded = new WeakSet()
    this.warmed = new WeakSet()
    this.queuePrebuild(true)
  }

  /** 排入還沒建的站與太空層；again = 已經建好的也重新上傳／預編譯（context 恢復、改畫質）*/
  private queuePrebuild(again: boolean, spaceAgain = false): void {
    if (!this.prebuildHost || this.disposed) return
    const ids = [...this.zones.keys()].filter((id) => again || !this.views.has(id)).sort((a, b) => a - b)
    if (again || spaceAgain || !this.space) ids.push(0)
    for (const id of ids) if (!this.prebuildQ.includes(id)) this.prebuildQ.push(id)
    this.prebuildDone = !this.prebuildQ.length && !this.prebuildIt
    this.scheduleIdle(1500)
  }

  private scheduleIdle(timeout: number): void {
    if (this.cancelIdle || this.disposed || this.prebuildDone) return
    this.cancelIdle = onIdle((dl) => {
      this.cancelIdle = null
      this.prebuildStep(dl)
    }, timeout)
  }

  /**
   * 一次 idle callback 推進預建一小片：有空閒時間就做到剩 1 ms（最多 IDLE_MAX_MS），逾時觸發（timeRemaining() 是 0）只做 SLICE_MS。
   * 這段時間內第一次用到的程序化貼圖改成延後產生（deferTextures），由 prebuildZone 裡的 textureSteps 分段做完。
   */
  private prebuildStep(dl?: { timeRemaining(): number; didTimeout?: boolean }): void {
    const host = this.prebuildHost
    if (!host || this.disposed) return
    // 開局第一站還沒顯示之前不搶時間；context 遺失中先停
    if (this.zone < 0) return this.scheduleIdle(1000)
    // 正在分段建要顯示的站：讓它先（它會接手預建做到一半的同一站）
    if (this.loader) return this.scheduleIdle(500)
    if (host.renderer.getContext().isContextLost()) return this.scheduleIdle(2000)
    const t0 = performance.now()
    // 空閒時間最多用 IDLE_MAX_MS：主機的 HostRelay 也在主執行緒轉送快照（20 Hz），一片太長會讓轉送延後
    const idle = dl && !dl.didTimeout ? Math.min(IDLE_MAX_MS, dl.timeRemaining() - 1) : 0
    const budget = Math.max(SLICE_MS, idle)
    let wait = false
    deferTextures(() => {
      for (;;) {
        if (!this.prebuildIt) {
          const id = this.prebuildQ.shift()
          if (id === undefined) {
            this.prebuildDone = true
            return
          }
          this.prebuildIt = this.prebuildZone(host, id)
        }
        let r: IteratorResult<void | 'wait', void>
        try {
          r = this.prebuildIt.next()
        } catch (e) {
          // 預建只是背景工作：出錯就放棄這一站（第一次進站時照常同步建立）
          if (__DEV__) console.error(e)
          r = { done: true, value: undefined }
          this.building = null
        }
        if (r.done) this.prebuildIt = null
        else if (r.value === 'wait') {
          wait = true
          return
        }
        if (performance.now() - t0 >= budget) return
      }
    })
    if (!this.prebuildDone) this.scheduleIdle(wait ? 250 : 100)
  }

  /** 預建一個 zone：建站（或太空層的代表模型）→ 延後的貼圖 → 上傳貼圖 → 預編譯 → 等連結並第一次使用 */
  private *prebuildZone(host: PrebuildHost, id: number): Steps {
    let roots: THREE.Object3D[]
    let warm: { group: THREE.Group; fx: THREE.Group; disposeMats: THREE.Material[] } | null = null
    const extraTex: THREE.Texture[] = []
    if (id === 0) {
      const sp = this.buildSpace()
      warm = yield* this.spaceWarmSteps()
      roots = [sp.group, warm.group]
    } else {
      let v = this.views.get(id)
      if (!v) {
        const info = this.zones.get(id)
        const def = info && stationDefOf(info.station)
        if (!info || !def) return
        // 同一站正在被另一份工作分段建（背景預建 ↔ 顯示用的分段建站）：接手它，不從頭建
        const it = this.building?.id === id ? this.building.it : buildStationSteps(def, info.layout)
        this.building = { id, it }
        for (;;) {
          // 使用者在建完前走進這一站：buildView 已經同步做完（building 被清掉）
          if (this.building?.it !== it) break
          const r = it.next()
          if (r.done) {
            this.building = null
            this.finishView(id, r.value, info)
            break
          }
          yield
        }
        v = this.views.get(id)
        if (!v) {
          // 被另一站的分段建頂掉（building 換成別站、這一站的進度丟掉）：預建的裝置排回佇列之後再建
          if (this.prebuildHost && !this.disposed && !this.prebuildQ.includes(id)) {
            this.prebuildQ.push(id)
            this.prebuildDone = false
            this.scheduleIdle(1500)
          }
          return
        }
      }
      // 地上道具的本體／發光材質（道具不屬於站體，第一次有人丟東西才會用到）也一起預編譯
      roots = [v.group, ...groundItemWarmMeshes()]
      if (v.fill) extraTex.push(v.fill)
      const fog = this.fogs.get(id)
      if (fog) {
        // DataTexture 建立時 version = 0，initTexture 不會上傳：先標記，預建時就真的上傳（第一次進站不必再傳）
        fog.tex.needsUpdate = true
        extraTex.push(fog.tex)
      }
    }
    // 延後產生的程序化貼圖（這一站與之前留下的）分段做完
    yield* textureSteps()
    // 上傳貼圖：一次一張（同一張共用貼圖只上傳一次）
    const texs = new Set<THREE.Texture>(extraTex)
    texturesOf(roots, texs)
    for (const t of texs) {
      if (this.uploaded.has(t)) continue
      this.uploaded.add(t)
      host.renderer.initTexture(t)
      yield
    }
    // 預編譯：燈光數量是 program key 的一部分，要和正式渲染時一致：站內 = 本場景的燈（太空層的太陽不算）；太空層 = 本場景的燈＋太陽。
    // 假的根物件只帶太空層的太陽（太空層正在顯示時太陽已經在場景裡，不重複算）；預編譯站內時先把正在顯示的太空層藏起來。
    const items = compileItems(roots)
    for (let i = 0; i < items.length; i += COMPILE_BATCH) {
      const sp = this.space
      const spVis = sp?.group.visible ?? false
      const lights = id === 0 && sp && !spVis ? [sp.sun] : []
      if (sp && id !== 0) sp.group.visible = false
      try {
        host.compile(batchRoot(items.slice(i, i + COMPILE_BATCH), lights), this.camera, this.scene)
      } catch {
        /* 預編譯失敗不影響正式渲染 */
      } finally {
        if (sp) sp.group.visible = spVis
      }
      yield
    }
    if (warm) {
      // 代表物件用完：特效的池化材質還回池子、護盾材質 dispose（同 kit.prewarm）
      warm.fx.traverse((o) => {
        const m = (o as THREE.Mesh).material as THREE.Material | undefined
        if (m && !warm!.disposeMats.includes(m)) this.fx.releaseMat(m)
      })
      for (const m of warm.disposeMats) m.dispose()
    }
    // 等 GPU 連結完成（KHR_parallel_shader_compile；沒有這個擴充時 isReady 一律是 true）再第一次使用，一次一個
    for (;;) {
      let pending = false
      let did = false
      for (const p of host.renderer.info.programs ?? []) {
        if (this.warmed.has(p)) continue
        if (!(p as unknown as { isReady(): boolean }).isReady()) {
          pending = true
          continue
        }
        this.warmed.add(p)
        p.getUniforms()
        did = true
        break
      }
      if (did) yield
      else if (pending) yield 'wait'
      else return
    }
  }

  /**
   * 要顯示的 zone 還沒建好（站點、且已經有站顯示過＝不是開局）：交給分段建站，先維持目前的 zone，建好那一幀才切過去。
   * 開局第一站仍同步建（開局覆蓋層、loaded 回報都等第一幀畫完）；沒有引擎（單元測試）或 context 遺失中也同步建。
   * 回傳這一幀實際顯示的 zone。
   */
  private ensureZone(id: number): number {
    const ld = this.loader
    if (this.zone === id) {
      // 目標換回顯示中的站（例如監視器畫面關掉）：分段建暫停；做到一半的站體留在 building，之後再去那一站時接著做
      if (ld && !ld.bg) this.stopLoad()
      return id
    }
    // 站體建好之後還有貼圖上傳、預編譯：loader 做完才切
    if (this.zone >= 0 && this.zones.has(id) && (ld?.id === id || !this.views.has(id)) && this.host && !this.host.renderer.getContext().isContextLost()) {
      if (ld?.id !== id) this.startLoad(this.host, id, false)
      else if (ld.bg) {
        // 預先建的那一站（lookahead）真的要去了：轉成前景，顯示「載入中」、接著做完
        ld.bg = false
        this.loading.value = true
      }
      this.loadSlice()
      if (this.loader) return this.zone
    }
    // 改去別的地方（太空、已建好的站）或不能分段：放棄前景的這份（預先建的留著）
    if (this.loader && !this.loader.bg) this.stopLoad()
    this.switchZone(id)
    return id
  }

  /** 開始分段建一站（換了目標就丟掉上一份；做到一半的站體留在 building，之後再去那一站時接著做）；bg = 預先建（不顯示載入中、用空閒時間）*/
  private startLoad(host: PrebuildHost, id: number, bg: boolean): void {
    this.stopLoad()
    this.loader = { id, it: this.prebuildZone(host, id), wait: false, bg }
    if (bg) this.scheduleBg(1000)
    else this.loading.value = true
  }

  private stopLoad(): void {
    this.loader = null
    this.loading.value = false
    this.cancelBg?.()
    this.cancelBg = null
  }

  /** 推進分段建站一片（前景最多 LOAD_SLICE_MS；預先建依空閒時間，同 prebuildStep）；做完（或出錯：退回同步建）就清掉 loader。回傳是否還沒做完 */
  private loadSlice(dl?: { timeRemaining(): number; didTimeout?: boolean }): boolean {
    const ld = this.loader
    if (!ld || this.disposed) return false
    const t0 = performance.now()
    const budget = ld.bg ? Math.max(SLICE_MS, dl && !dl.didTimeout ? Math.min(IDLE_MAX_MS, dl.timeRemaining() - 1) : 0) : LOAD_SLICE_MS
    ld.wait = false
    let done = false
    deferTextures(() => {
      for (;;) {
        let r: IteratorResult<void | 'wait', void>
        try {
          r = ld.it.next()
        } catch (e) {
          // 出錯：放棄分段，ensureZone 照舊同步建（buildView 會接手 building 剩下的部分或從頭建）
          if (__DEV__) console.error(e)
          r = { done: true, value: undefined }
          if (this.building?.id === ld.id) this.building = null
        }
        if (r.done) {
          done = true
          return
        }
        if (r.value === 'wait') {
          ld.wait = true
          return
        }
        if (performance.now() - t0 >= budget) return
      }
    })
    if (done) {
      if (this.loader === ld) this.stopLoad()
      return false
    }
    // 前景：片與片之間讓出主執行緒（HostRelay、輸入），不等下一幀就接著做；等 shader 連結時留給下一幀再看。預先建：下一個空閒時間
    if (ld.bg) this.scheduleBg(ld.wait ? 250 : 100)
    else if (!ld.wait) this.queuePump()
    return true
  }

  private scheduleBg(timeout: number): void {
    if (this.cancelBg || this.disposed) return
    this.cancelBg = onIdle((dl) => {
      this.cancelBg = null
      if (this.loader?.bg) this.loadSlice(dl)
    }, timeout)
  }

  /**
   * 預測下一站（不預建的裝置）：駕駛中的船在太空中靠近某站（LOOKAHEAD_R 內最近的一站）就用空閒時間先分段建那一站，
   * 停靠後走出船艙時多半已經建好。已經有 loader（前景或預先建）時不動；預建的裝置本來就會建完全部。
   */
  private lookahead(zid: number): void {
    if (zid !== 0 || this.loader || this.prebuildHost || !this.host) return
    const me = this.world.ents.get(this.world.me.control ?? 0)
    if (!me || me.s.z !== 0) return
    let best: number | undefined
    let bestD = LOOKAHEAD_R * LOOKAHEAD_R
    for (const e of this.world.ents.values()) {
      const d = e.s.d
      if (e.s.z !== 0 || !d?.startsWith('station.')) continue
      const d2 = (e.x - me.x) ** 2 + (e.y - me.y) ** 2
      if (d2 >= bestD) continue
      const z = this.zoneOfStation(d.slice(8))
      if (z === undefined || this.views.has(z)) continue
      bestD = d2
      best = z
    }
    if (best !== undefined) this.startLoad(this.host, best, true)
  }

  private zoneOfStation(station: string): number | undefined {
    for (const z of this.zones.values()) if (z.station === station) return z.id
    return undefined
  }

  private queuePump(): void {
    if (this.pumpQueued || this.disposed) return
    if (typeof MessageChannel === 'undefined') return
    if (!this.pumpCh) {
      this.pumpCh = new MessageChannel()
      this.pumpCh.port1.onmessage = () => {
        this.pumpQueued = false
        // 只推進「目前要顯示」的那一站：目標換了（回到原本的站）就停，下一幀 ensureZone 再決定
        if (this.loader && !this.loader.bg && this.loader.id === this.wantZone) this.loadSlice()
      }
    }
    this.pumpQueued = true
    this.pumpCh.port2.postMessage(0)
  }

  /** 上一幀想顯示的 zone（viewZone）*/
  private wantZone = -1

  private switchZone(id: number): void {
    const old = this.views.get(this.zone)
    if (old) this.scene.remove(old.group)
    if (this.space) this.space.group.visible = false
    this.zone = id
    const info = this.zones.get(id)
    if (!info) {
      fogUniforms.uFogOn.value = 0
      if (id === 0) {
        this.ensureSpace()
        this.hemi.color.set('#22304a')
        this.hemi.groundColor.set('#05060a')
        this.hemi.intensity = 0.7
        this.hemiBase.k = 0
        fogUniforms.uFillOn.value = 0
        this.rts.setBounds(-49, -49, 49, 49)
        this.rts.minDist = 22
        this.rts.maxDist = 95
        this.grade = this.gradeBase = { hue: 0, sat: 0.1, bright: 0, contrast: 0.08 }
        this.units.clear()
        this.clearCrateGhosts()
        this.onZoneChange?.({ id: 0, key: 'space', station: 'space', layout: null as never })
      }
      return
    }
    this.rts.minDist = 14
    this.rts.maxDist = 60
    const v = this.buildView(id)!
    this.scene.add(v.group)
    this.fogs.get(id)!.bind()
    const th = v.theme
    this.hemi.color.set(th.ambientSky)
    this.hemi.groundColor.set(th.ambientGround)
    this.hemi.intensity = th.ambient
    this.hemiBase.sky.set(th.ambientSky)
    this.hemiBase.ground.set(th.ambientGround)
    this.hemiBase.k = th.ambient
    fogUniforms.uFillTex.value = v.fill
    fogUniforms.uFillOn.value = v.fill ? 1 : 0
    fogUniforms.uFillTint.value.setRGB(1, 1, 1)
    // 換站：燈光池從暗處淡入，不沿用上一站的燈
    for (const s of this.pool) {
      s.cur = s.next = null
      s.w = 0
      s.l.intensity = 0
    }
    this.lightT = 0
    this.poolCam.vx = this.poolCam.vy = 0
    this.emK = 0
    this.emOn = false
    this.setStrips(v, false)
    this.grade = this.gradeBase = th.grade
    this.rts.setBounds(0, 0, info.layout.w, info.layout.h)
    this.units.clear()
    this.clearCrateGhosts()
    this.onZoneChange?.(info)
  }

  /** 自己目前操控的單位 */
  myUnit(): CEnt | undefined {
    const id = this.world.me.control || this.world.me.unit
    return id ? this.world.ents.get(id) : undefined
  }

  /** 監視器畫面等：暫時看另一個位置 */
  viewOverride: (() => { zone: number; x: number; y: number } | null) | null = null
  private lastOverride: unknown = null

  viewZone(): number {
    const ov = this.viewOverride?.()
    if (ov) {
      if (this.lastOverride !== ov) {
        this.lastOverride = ov
        this.rts.jump(ov.x, ov.y)
        this.rts.follow = null
      }
      return ov.zone
    }
    if (this.lastOverride) {
      this.lastOverride = null
      const u = this.myUnit()
      if (u) this.rts.jump(u.x, u.y)
    }
    const me = this.world.me
    if (me.alive === false || me.role === 'spectator') return me.specZone ?? 1
    const u = this.myUnit()
    return u?.s.z ?? me.zone ?? 1
  }

  /**
   * 站在 POI 格上的結構實體由站體裡烘焙的 POI 模型代表，不另外建單位模型。
   * 玩家放置的裝置（dev.*）與瓦礫剛好落在 POI 格上時照常畫自己的模型（以前會被當成那格的設施藏起來）。
   */
  private isStaticStructure(e: CEnt): boolean {
    const d = e.s.d ?? ''
    const def = UNITS.get(d)
    // 販賣機的定義只在 sim 端註冊（isStructureId 用 id 前綴認）；以前 client 查不到，每台販賣機裡都藏著一個看不見的備用膠囊模型
    if (!isStructureId(d) || def?.tags.includes('device') || def?.tags.includes('rubble')) return false
    const info = this.zones.get(e.s.z ?? -1)
    if (!info) return false
    const { col, row } = layoutCell(info.layout, (e.s.x ?? 0) / 100, (e.s.y ?? 0) / 100)
    const key = `${col},${row}`
    if (this.views.get(info.id)?.pois.has(key)) {
      this.poiEnt.set(`${info.id}:${key}`, e.s.i)
      this.poiSeen.set(key, { def: d, invuln: ((e.s.fl ?? 0) & EntFlag.Invuln) !== 0 })
      return true
    }
    return false
  }

  /**
   * 固定設施的外觀（約 10 Hz，和迷霧同步）：損毀的控制台換成殘骸外觀、修好換回；被摧毀的設施藏起來換成殘骸。
   * 只在那一格看得到時才下判斷（poiState.ts），視野外維持記憶中的樣子。
   */
  private updatePois(view: StationView, info: ZoneInfo): void {
    const tr = this.poiTracker(info)
    // 死者、旁觀者整個 zone 都看得到（sim 不送視野來源）；靠記憶核心觀看的仿生人有來源，照來源算（poiState.ts sightOf）
    const v = sightOf(this.world, info.id)
    for (const [key, look] of tr.update(performance.now() / 1000, this.poiSeen, v.sources, v.doorClosed, v.full)) this.applyPoiLook(view, info, key, look)
  }

  private poiTracker(info: ZoneInfo): PoiTracker {
    let tr = this.poiTrackers.get(info.id)
    if (!tr) this.poiTrackers.set(info.id, (tr = new PoiTracker(info.layout)))
    return tr
  }

  /** units.sync 的略過條件：站體畫的固定設施略過；順便記下這一幀看得到、由單位層畫的雜物箱 */
  private readonly syncSkip = (e: CEnt): boolean => {
    if (this.isStaticStructure(e)) return true
    if (e.s.d === CRATE_DEF) this.cratePresent.set(e.s.i, { x: e.x, y: e.y, f: e.f })
    return false
  }

  /**
   * 雜物箱的迷霧記憶（每幀，units.sync 之後）：離開視野的箱子畫成記憶中的模型（同一個模型與擺向，材質經過迷霧 shader
   * 自然套上記憶色）；那一格看得到而實體不在才拿掉（crateMemory.ts）。回到視野時實體回到快照，單位層接手畫。
   */
  private updateCrateGhosts(info: ZoneInfo): void {
    let mem = this.crateMems.get(info.id)
    if (!mem) this.crateMems.set(info.id, (mem = new CrateMemory()))
    const tr = this.poiTracker(info)
    const v = sightOf(this.world, info.id)
    mem.update(performance.now() / 1000, this.cratePresent, (x, y) => tr.visibleAt(x, y, v.sources, v.doorClosed), v.full)
    for (const [id, o] of this.crateGhosts) {
      if (mem.isGhost(id)) continue
      this.crateGhostGroup.remove(o)
      this.crateGhosts.delete(id)
    }
    const def = UNITS.get(CRATE_DEF)
    for (const [id, c] of mem.ghosts()) {
      if (this.crateGhosts.has(id)) continue
      // 和單位層同一個建模（漆色依 id），幾何與材質都是共用的：拿掉時不必釋放
      const root = new THREE.Group()
      root.add(buildModel(def?.model ?? 'crate', def, { i: id, d: CRATE_DEF }).root)
      if (def?.scale) root.scale.setScalar(def.scale)
      root.position.set(c.x, 0, -c.y)
      root.rotation.y = Math.atan2(Math.cos(c.f), -Math.sin(c.f))
      this.crateGhostGroup.add(root)
      this.crateGhosts.set(id, root)
    }
  }

  private clearCrateGhosts(): void {
    this.crateGhostGroup.clear()
    this.crateGhosts.clear()
  }

  /** 目前 zone 畫成記憶模型的雜物箱 id（測試掛勾與除錯用）*/
  crateGhostIds(): number[] {
    return [...this.crateGhosts.keys()]
  }

  private applyPoiLook(view: StationView, info: ZoneInfo, key: string, look: PoiLook): void {
    const root = view.pois.get(key)
    if (!root) return
    const id = `${info.id}:${key}`
    const old = this.poiAlt.get(id)
    if (old) {
      old.root.removeFromParent()
      for (const a of old.anim) {
        const i = view.anim.indexOf(a)
        if (i >= 0) view.anim.splice(i, 1)
      }
      disposeLocal(old.root)
      this.poiAlt.delete(id)
    }
    root.visible = look === 'ok'
    if (look === 'gone') this.poiEnt.delete(id)
    if (look === 'ok') return
    const poi = info.layout.pois.find((p) => `${p.col},${p.row}` === key)
    if (!poi) return
    const seed = (poi.col * 73 + poi.row * 31) % 997
    const m = look === 'broken' ? poiModel('consoleBroken', undefined, seed) : poiWreck(poi.def.kind, poi.def.ref, seed)
    m.root.position.copy(root.position)
    m.root.rotation.copy(root.rotation)
    m.root.userData.poiKey = key
    if (m.ring) addPoiRing(m.root, m.ring)
    view.group.add(m.root)
    view.anim.push(...m.anim)
    this.poiAlt.set(id, { root: m.root, anim: m.anim })
  }

  /**
   * fps 持續過低（medium 以上、連續約 10 秒低於 20）且使用者沒選過畫質：降到 low 並顯示本機提示，每局最多一次。
   * 開局載入（還沒顯示站體、等其他人載入、身分揭露畫面）、換站建站、預建期間、分頁在背景、對話框開著時不計（autoDropStep 會重新開始計）。
   */
  private checkAutoDrop(zid: number): void {
    const hidden = this.wasHidden || (typeof document !== 'undefined' && document.hidden)
    this.wasHidden = false
    // 對話框開著（開局的身分揭露、設定、圖鑑、結算）也不計：提示會被蓋住，而且使用者可能正在自己調畫質
    const paused = hidden || this.zone < 0 || zid !== this.dropZone || Number(this.world.w.ld ?? 0) > 0 || (!!this.prebuildHost && !this.prebuildDone) || modalChecks.some((f) => f())
    this.dropZone = zid
    if (!autoDropStep(this.autoDrop, { now: performance.now() / 1000, quality: quality.value, chosen: qualityChosen(), paused })) return
    autoLowerQuality('low')
    localNotice.value = { text: 'art2.autoLow', at: performance.now() }
  }

  update(dt: number, t: number): void {
    const w = this.world
    w.interpolate()
    const want = this.viewZone()
    this.wantZone = want
    const zid = this.ensureZone(want)
    // 要去的站還在分段建（loader）：這一幀不畫、其餘也不更新（「載入中」覆蓋層蓋著），建好那一幀才切過去
    this.holdFrame = zid !== want
    if (this.holdFrame) return
    this.checkAutoDrop(zid)
    const view = this.views.get(zid)
    const fog = this.fogs.get(zid)
    // 第一次進場、或換了操控對象／所在 zone（開始或離開駕駛、登艇、逃生艙、轉觀戰）：鏡頭對準自己
    const mine = this.myUnit()
    const ctlKey = `${this.world.me.control || this.world.me.unit || 0}@${zid}`
    if (mine && (!this.centeredOnce || ctlKey !== this.lastCtlKey) && mine.s.z === zid) {
      this.rts.jump(mine.x, mine.y)
      this.centeredOnce = true
      this.lastCtlKey = ctlKey
    }
    // 門
    if (view) {
      for (const d of view.doors) {
        const st = w.doors.get(zid * 10000 + d.index)
        if (st !== undefined) d.state = st
      }
      updateDoors(view, dt)
      for (const a of view.anim) a.update(t, dt)
    }
    // 迷霧（10 Hz）
    this.fogT -= dt
    if (fog && this.fogT <= 0) {
      this.fogT = 0.1
      const full = w.me.alive === false || w.me.role === 'spectator'
      const srcs = w.vs.filter((s) => s[0] === zid).map((s) => ({ x: s[1] / 10, y: s[2] / 10, r: s[3] / 10 }))
      fog.update(srcs, (idx) => {
        const st = w.doors.get(zid * 10000 + idx)
        return st === undefined || st === 0 || st === 2
      }, full)
      this.poiDue = true
    }
    this.poiSeen.clear()
    this.cratePresent.clear()
    this.units.sync(w.ents.values(), zid, this.syncSkip, dt, t)
    const zinfo = this.zones.get(zid)
    if (view && zinfo && this.poiDue) {
      this.poiDue = false
      this.updatePois(view, zinfo)
    }
    if (view && zinfo) this.updateCrateGhosts(zinfo)

    updateBuffFx(this, dt, t)
    // 燈光池：離鏡頭最近的房間燈；緊急照明（站點斷電）時整站轉暗紅、慢速脈動
    if (view) {
      const info = this.zones.get(zid)
      const em = !!info && !!w.w.pw?.includes(info.key)
      if (em !== this.emOn) {
        this.emOn = em
        this.setStrips(view, em)
      }
      this.emK += Math.sign((em ? 1 : 0) - this.emK) * Math.min(Math.abs((em ? 1 : 0) - this.emK), dt * 1.5)
      this.updatePool(view, dt, t)
    }
    // 預測下一站（不預建的裝置：駕駛中靠近某站就先用空閒時間建）
    this.lookT -= dt
    if (this.lookT <= 0) {
      this.lookT = 0.5
      this.lookahead(zid)
    }
    // 天氣（燈光池之後：環境光的調整疊在緊急照明的結果上）
    this.updateWeather(dt, t, view, zinfo)
    // 手電筒：只有自己的人形單位
    const me = this.units.views.get(mine?.s.i ?? -1)
    if (me?.rig && mine && (mine.s.fl ?? 0) & EntFlag.Mine) {
      const p = this.tmpV
      me.rig.lamp.getWorldPosition(p)
      this.flash.position.copy(p)
      this.flashTarget.position.set(p.x + Math.cos(mine.f) * 6, 0, p.z - Math.sin(mine.f) * 6)
      this.flash.intensity = 30
    } else this.flash.intensity = 0
    this.space?.update(t)
    this.fx.update(dt, t, zid)
    this.rts.update(dt, window.innerWidth, window.innerHeight)
  }

  /**
   * 依鏡頭位置分配燈光池（靜止時每 0.25 秒、移動中每 0.1 秒）並做淡入淡出、緊急照明色調（每幀）。
   * 鏡頭移動中：選燈看「鏡頭前方」（目前位置＋速度 × POOL_LEAD 秒），前方的燈提早淡入、後方的提早放掉；淡入淡出也跟著變快。
   */
  private updatePool(view: StationView, dt: number, t: number): void {
    // 鏡頭速度（平滑；一幀跳太遠＝瞬移、對準，不算速度）
    const pc = this.poolCam
    const mx = this.rts.tx - pc.x
    const my = this.rts.ty - pc.y
    pc.x = this.rts.tx
    pc.y = this.rts.ty
    if (dt > 0) {
      const jump = mx * mx + my * my > 8 * 8
      const a = 1 - Math.exp(-dt / 0.15)
      pc.vx = jump ? 0 : pc.vx + (mx / dt - pc.vx) * a
      pc.vy = jump ? 0 : pc.vy + (my / dt - pc.vy) * a
    }
    const speed = Math.hypot(pc.vx, pc.vy)
    this.lightT -= dt
    if (this.lightT <= 0) {
      this.lightT = speed > 2 ? 0.1 : 0.25
      // 選燈的參考點：鏡頭前方（最多 POOL_LEAD_MAX m）
      const lead = Math.min(POOL_LEAD, POOL_LEAD_MAX / Math.max(speed, 1e-6))
      const cx = this.rts.tx + pc.vx * lead
      const cy = this.rts.ty + pc.vy * lead
      const d2 = (a: RoomLight) => (a.x - cx) ** 2 + (-a.z - cy) ** 2
      const sorted = [...view.lights].sort((a, b) => d2(a) - d2(b))
      // 前兩盞給投影的 spot、其餘給點光；同一組裡已經在用的燈留在原本的槽位，只替換掉出名單的
      const nSpot = this.pool.filter((p) => p.l instanceof THREE.SpotLight).length
      // 錯開換燈：鏡頭附近（POOL_NEAR 內）亮著的燈同時最多換 maxSwap 盞，其餘先留著亮、下一輪再換（總光量不會一下子少掉一半）；
      // 遠處的燈（瞬移、對準之後）不受限制
      const ox = this.rts.tx
      const oy = this.rts.ty
      const near = (rl: RoomLight) => (rl.x - ox) ** 2 + (-rl.z - oy) ** 2 < POOL_NEAR * POOL_NEAR
      const maxSwap = Math.max(1, Math.floor(this.pool.length / 4))
      let swapping = 0
      for (const s of this.pool) if (s.cur && near(s.cur) && (s.next !== s.cur || s.w < 0.6)) swapping++
      for (const [slots, want] of [
        [this.pool.slice(0, nSpot), sorted.slice(0, nSpot)],
        [this.pool.slice(nSpot), sorted.slice(nSpot, this.pool.length)],
      ] as const) {
        const keep = new Set<RoomLight>()
        for (const s of slots) {
          if (s.next && want.includes(s.next) && !keep.has(s.next)) keep.add(s.next)
          else if (s.cur && want.includes(s.cur) && !keep.has(s.cur)) {
            // 還沒熄滅就又進名單：直接淡回來
            s.next = s.cur
            keep.add(s.cur)
          } else s.next = null
        }
        const add = want.filter((rl) => !keep.has(rl))
        // 遲滯：出名單的燈若只比名單最後一盞遠不到 2 m，先留著，頂掉最遠的新候選（鏡頭慢慢移動時不要一直換燈）
        const last = want[want.length - 1]
        const lim = last ? Math.sqrt(d2(last)) + 2 : 0
        for (const s of slots) {
          if (s.next || !s.cur || !add.length) continue
          if (Math.sqrt(d2(s.cur)) <= lim) {
            s.next = s.cur
            add.pop()
          }
        }
        // 要換的槽位：先換空的與遠處的，鏡頭附近亮著的依上限錯開
        const free = slots.filter((s) => !s.next).sort((a, b) => (a.cur ? -d2(a.cur) : -Infinity) - (b.cur ? -d2(b.cur) : -Infinity))
        for (const s of free) {
          const busy = !!s.cur && s.w > 0 && near(s.cur)
          if (busy && add.length && swapping >= maxSwap) {
            s.next = s.cur
            continue
          }
          s.next = add.shift() ?? null
          if (busy && s.next) swapping++
        }
      }
    }
    // 換燈：舊燈很快熄（0.12 秒）、新燈 0.3 秒淡入——鏡頭移動時整體不會暗下來；鏡頭快速移動（≥ 10 m/s）時縮短到 0.07／0.15 秒
    const fk = Math.min(1, speed / 10)
    const FADE_OUT = 1 / (0.12 - 0.05 * fk)
    const FADE_IN = 1 / (0.3 - 0.15 * fk)
    const em = this.emK
    // 緊急照明：慢速、淺的脈動，最暗時仍讀得到房間（燈約 45%、補光約 57%）
    const pulse = 0.91 + 0.09 * Math.sin(t * 1.6)
    for (const s of this.pool) {
      const l = s.l
      if (s.next !== s.cur) {
        // 換燈：先淡出，熄滅後才搬到新位置再淡入
        s.w = Math.max(0, s.w - dt * FADE_OUT)
        if (s.w <= 0) {
          s.cur = s.next
          const rl = s.cur
          if (rl) {
            l.distance = rl.distance
            if (l instanceof THREE.SpotLight) {
              l.position.set(rl.x, rl.y, rl.z)
              l.target.position.set(rl.x, 0, rl.z)
              l.angle = Math.min(1.2, Math.atan(rl.distance / rl.y) * 0.95)
            } else l.position.set(rl.x, 2.1, rl.z)
          }
        }
      } else if (s.cur) s.w = Math.min(1, s.w + dt * FADE_IN)
      const rl = s.cur
      if (!rl) {
        l.intensity = 0
        continue
      }
      // 平滑的淡入淡出曲線
      const e = s.w * s.w * (3 - 2 * s.w)
      const base = rl.intensity * (l instanceof THREE.SpotLight ? 1 : 0.7)
      l.color.copy(rl.color)
      if (em > 0) l.color.lerp(EMERGENCY, em)
      l.intensity = base * e * (1 - em * (1 - 0.55 * pulse))
    }
    // 補光圖與環境光跟著轉紅
    const hb = this.hemiBase
    if (hb.k > 0) {
      if (em > 0) {
        fogUniforms.uFillTint.value.setRGB(1, 1, 1).lerp(EMERGENCY_FILL, em).multiplyScalar(1 - em * (1 - 0.7 * pulse))
        this.hemi.color.copy(hb.sky).lerp(EMERGENCY_SKY, em)
        this.hemi.groundColor.copy(hb.ground)
        this.hemi.intensity = hb.k * (1 - em * 0.4)
      } else {
        fogUniforms.uFillTint.value.setRGB(1, 1, 1)
        this.hemi.color.copy(hb.sky)
        this.hemi.intensity = hb.k
      }
    }
    if (em > 0) emergencyStripMat.emissiveIntensity = 0.6 + 1.6 * (pulse - 0.82) / 0.18
  }

  /**
   * 暴風雪（餘燼衛星大氣護盾破掉後，worldPublic.wx[zone key] = 'blizzard'）：雪、雪霧、積雪，環境光轉冷變亮、色彩分級降飽和。
   * 進站時已經在下雪就直接滿強度；在站裡看著護盾破掉則約 4 秒淡入、積雪慢慢積起來。換站時釋放。
   */
  private updateWeather(dt: number, t: number, view: StationView | undefined, info: ZoneInfo | undefined): void {
    const zid = info?.id ?? this.zone
    const on = !!info && !!view && this.world.w.wx?.[info.key] === 'blizzard'
    if (zid !== this.weatherZone) {
      this.weatherZone = zid
      this.blizzard?.dispose()
      this.blizzard = null
      if (on) {
        this.blizzard = new Blizzard(info!.layout, view!.theme.built?.rooms ?? [])
        this.blizzard.snapTo(true)
        this.scene.add(this.blizzard.group)
      }
    } else if (on && !this.blizzard) {
      this.blizzard = new Blizzard(info!.layout, view!.theme.built?.rooms ?? [])
      this.scene.add(this.blizzard.group)
    }
    const bz = this.blizzard
    if (!bz) return
    bz.target = on ? 1 : 0
    if (bz.update(dt, t, this.rts.tx, this.rts.ty) && this.zone === zid) sfx('windGust')
    const k = bz.k
    const g = this.gradeBase
    if (k > 0.001) {
      this.hemi.color.lerp(SNOW_SKY, 0.5 * k)
      this.hemi.intensity *= 1 + 0.3 * k
      // 色彩分級換新物件時 engine 才重新套用：強度量化成 1/50，淡入期間不必每幀換
      const kk = Math.round(k * 50) / 50
      const sat = g.sat - 0.22 * kk
      if (this.grade === g || this.grade.sat !== sat) this.grade = { hue: g.hue, sat, bright: g.bright + 0.03 * kk, contrast: g.contrast - 0.03 * kk }
    } else if (this.grade !== g) this.grade = g
  }

  /** 牆面燈條換成（或換回）緊急照明的紅色材質 */
  private setStrips(view: StationView, em: boolean): void {
    for (const m of view.strips) {
      if (!m.userData.mat) m.userData.mat = m.material
      m.material = em ? emergencyStripMat : (m.userData.mat as THREE.Material)
    }
  }

  dispose(): void {
    this.disposed = true
    if (typeof document !== 'undefined') document.removeEventListener('visibilitychange', this.onVisibility)
    this.cancelIdle?.()
    this.cancelIdle = null
    this.stopQuality?.()
    this.stopQuality = null
    this.prebuildHost = null
    this.prebuildIt = null
    this.building = null
    this.host?.renderer.domElement.removeEventListener('webglcontextrestored', this.onRestored)
    this.host = null
    this.stopLoad()
    this.holdFrame = false
    if (this.pumpCh) {
      this.pumpCh.port1.onmessage = null
      this.pumpCh.port1.close()
      this.pumpCh.port2.close()
      this.pumpCh = null
    }
    for (const v of this.views.values()) v.dispose()
    this.views.clear()
    for (const f of this.fogs.values()) f.tex.dispose()
    this.fogs.clear()
    this.units.clear()
    this.fx.clear()
    if (Fx.active === this.fx) Fx.active = null
    for (const l of [...this.pool.map((p) => p.l), this.flash]) if (l.castShadow) l.shadow.dispose()
    fogUniforms.uFogOn.value = 0
    fogUniforms.uFogTex.value = null
    fogUniforms.uFillOn.value = 0
    fogUniforms.uFillTex.value = null
    // 放掉場景圖與站點資料：就算 UI 那邊還有東西暫時留住這個物件（例如音效的最後懸停按鈕），整局的模型也能被回收
    this.scene.clear()
    this.space = null
    this.zones.clear()
    this.poiEnt.clear()
    this.poiTrackers.clear()
    this.poiAlt.clear()
    this.crateMems.clear()
    this.clearCrateGhosts()
    this.blizzard?.dispose()
    this.blizzard = null
    this.prebuildQ = []
  }

  /** 螢幕拾取：回傳實體 id（單位或設施）*/
  pick(ndcX: number, ndcY: number): number {
    const ray = new THREE.Raycaster()
    ray.setFromCamera(new THREE.Vector2(ndcX, ndcY), this.camera)
    const targets: THREE.Object3D[] = [this.units.group]
    const view = this.views.get(this.zone)
    if (view) {
      for (const g of view.pois.values()) if (g.visible) targets.push(g)
      // 換上的損毀外觀（殘骸沒有對應的實體，下面會略過）
      for (const [k, a] of this.poiAlt) if (k.startsWith(this.zone + ':')) targets.push(a.root)
    }
    const hits = ray.intersectObjects(targets, true)
    for (const h of hits) {
      // Raycaster 不看 visible：藏起來的零件（閃爍的燈、被換掉的模型）不算
      if (!shown(h.object)) continue
      let o: THREE.Object3D | null = h.object
      while (o) {
        if (o.userData.entId) return o.userData.entId as number
        const pk = o.userData.poiKey as string | undefined
        if (pk !== undefined) {
          const id = this.poiEnt.get(`${this.zone}:${pk}`)
          if (id && this.world.ents.has(id)) return id
          break
        }
        o = o.parent
      }
    }
    // 退而求其次：螢幕距離最近的單位
    let best = 0
    let bestD = 0.0016
    const v3 = new THREE.Vector3()
    for (const [id, uv] of this.units.views) {
      v3.copy(uv.root.position)
      v3.y += uv.height * 0.5
      v3.project(this.camera)
      const d = (v3.x - ndcX) ** 2 + (v3.y - ndcY) ** 2
      if (d < bestD) {
        bestD = d
        best = id
      }
    }
    return best
  }
}
