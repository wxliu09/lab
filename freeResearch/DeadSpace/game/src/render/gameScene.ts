// 遊戲場景：一次只渲染玩家所在的 zone；站體快取、迷霧、燈光池、手電筒、單位同步
import * as THREE from 'three'
import { STATION_BY_ID } from '../shared/content/stations/index'
import { parseLayout, cellAt as layoutCell, type ParsedLayout } from '../shared/layout'
import { UNITS } from '../shared/content/registry'
import { EntFlag, type SnapEntity } from '../shared/protocol/messages'
import type { ClientWorld, CEnt } from '../client/world'
import type { SceneLike } from './engine'
import { RtsCamera } from './camera'
import { buildStation, updateDoors, type RoomLight, type StationView } from './stationBuilder'
import { FogMap } from './fog'
import { UnitLayer } from './units'
import { fogUniforms, emergencyStripMat } from './materials'
import { isSoftwareGl, preset } from './quality'
import { Fx } from './fx'
import '../shared/content/index'
import { SHIP_BY_ID } from '../shared/content/ships'
import type { StationDef } from '../shared/content/stations/types'
import { makeSky } from './space/sky'
import './models/ships'
import './models/devices'
import { updateBuffFx } from './buffFx'
import { MODELS, buildModel } from './models/index'

/** 預建站點時用到的引擎功能（GameScreen 傳入 Engine）*/
export interface PrebuildHost {
  renderer: THREE.WebGLRenderer
  compileAsync(obj: THREE.Object3D, camera: THREE.Camera, target: THREE.Scene): Promise<unknown>
}

type IdleCb = (dl?: { timeRemaining(): number }) => void

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

/** 緊急照明：燈光、補光、環境光的目標色 */
const EMERGENCY = new THREE.Color('#ff2a18')
const EMERGENCY_FILL = new THREE.Color(1, 0.16, 0.1)
const EMERGENCY_SKY = new THREE.Color('#3a0806')

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
  /** 結構實體 id ↔ POI 格 */
  poiEnt = new Map<string, number>()
  grade = { hue: 0, sat: 0.02, bright: 0, contrast: 0.06 }
  onZoneChange: ((z: ZoneInfo) => void) | null = null
  centeredOnce = false
  /** 上次對準時的操控對象與 zone（變了就重新對準）*/
  private lastCtlKey = ''
  /** 本幀受到的傷害脈衝（0..1）*/
  damage = 0
  /** 預建：還沒建的站（zone id；0 = 太空層）、目前這一站還沒上傳的貼圖、是否全部完成 */
  private prebuildHost: PrebuildHost | null = null
  private prebuildQ: number[] = []
  private prebuildTex: THREE.Texture[] = []
  /** 這一局（這個 WebGL context）已經送去上傳的貼圖；貼圖是模組層級快取、跨局共用，新的一局要重新上傳 */
  private uploaded = new WeakSet<THREE.Texture>()
  private prebuildBusy = false
  /** 預編譯完成、還沒「第一次使用」的 program：第一次使用會同步查詢連結結果（沒有 KHR_parallel_shader_compile 時會等 GPU），也在空閒時間先做 */
  private prebuildWarm = false
  private warmed = new WeakSet<object>()
  private cancelIdle: (() => void) | null = null
  private disposed = false
  prebuildDone = false
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
    this.scene.add(this.units.group)
    this.fx = new Fx(this.scene)
  }

  setZones(list: [number, string, string][]): void {
    for (const [id, key, stationId] of list) {
      if (this.zones.has(id)) continue
      const st = stationDefOf(stationId)
      if (!st) continue
      this.zones.set(id, { id, key, station: stationId, layout: parseLayout(st.layout) })
    }
    if (this.prebuildHost) this.queuePrebuild()
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
   * 預建太空層時先各建一份暫時的模型，只用來預熱貼圖／材質快取與預編譯，之後丟掉（幾何從沒上傳過）。
   */
  private spaceWarmGroup(): THREE.Group {
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
    }
    return g
  }

  /**
   * 建立站體（不加進場景）。不在目前 zone 的站體從場景圖移除而不只是隱藏：
   * 隱藏的物件每幀仍會跑 updateMatrixWorld，整局預建所有站之後這筆成本會變得明顯。
   */
  private buildView(id: number): StationView | undefined {
    let v = this.views.get(id)
    if (v) return v
    const info = this.zones.get(id)
    const def = info && stationDefOf(info.station)
    if (!info || !def) return undefined
    v = buildStation(def, info.layout)
    this.views.set(id, v)
    this.fogs.set(id, new FogMap(info.layout))
    return v
  }

  /**
   * 開局後在空閒時間逐站預建本局的站點：建站體、上傳貼圖、預編譯 shader；之後第一次進站不會卡住主執行緒（主機卡住會讓所有客人收不到快照）。
   * 軟體算繪（SwiftShader 等）建一站要好幾秒，預建會讓開局後一兩分鐘持續卡頓，所以不預建、維持第一次進站才建；
   * localStorage `xc.prebuild` = '1'／'0' 可強制開關（量測用）。
   */
  startPrebuild(host: PrebuildHost): void {
    let force: string | null = null
    try {
      force = localStorage.getItem('xc.prebuild')
    } catch {
      /* ignore */
    }
    if (force === '0' || (force !== '1' && isSoftwareGl(host.renderer.getContext()))) return
    this.prebuildHost = host
    this.queuePrebuild()
  }

  private queuePrebuild(): void {
    const q = [...this.zones.keys()].filter((id) => !this.views.has(id)).sort((a, b) => a - b)
    if (!this.space) q.push(0)
    this.prebuildQ = q
    this.prebuildDone = q.length === 0 && this.prebuildTex.length === 0 && !this.prebuildBusy && !this.prebuildWarm
    this.scheduleIdle(1500)
  }

  private scheduleIdle(timeout: number): void {
    if (this.cancelIdle || this.disposed || this.prebuildDone) return
    this.cancelIdle = onIdle((dl) => {
      this.cancelIdle = null
      this.prebuildStep(dl)
    }, timeout)
  }

  /** 一次 idle callback 做一件事：建一站，或在剩餘時間內上傳幾張貼圖，或送出一次 shader 預編譯 */
  private prebuildStep(dl?: { timeRemaining(): number }): void {
    const host = this.prebuildHost
    if (!host || this.disposed) return
    // 開局第一站還沒顯示之前不搶時間
    if (this.zone < 0 || this.prebuildBusy) return this.scheduleIdle(1000)
    if (this.prebuildTex.length) {
      const t0 = performance.now()
      do {
        const tex = this.prebuildTex.pop()!
        if (!this.uploaded.has(tex)) {
          this.uploaded.add(tex)
          host.renderer.initTexture(tex)
        }
      } while (this.prebuildTex.length && (dl ? dl.timeRemaining() > 4 : performance.now() - t0 < 6))
      return this.scheduleIdle(500)
    }
    if (this.prebuildWarm) {
      // 每次至少處理一個（idle callback 逾時觸發時 timeRemaining() 是 0）
      const t0 = performance.now()
      let n = 0
      let left = false
      for (const p of host.renderer.info.programs ?? []) {
        if (this.warmed.has(p)) continue
        if (n > 0 && (dl ? dl.timeRemaining() <= 4 : performance.now() - t0 >= 6)) {
          left = true
          break
        }
        n++
        this.warmed.add(p)
        p.getUniforms()
      }
      this.prebuildWarm = left
      return this.scheduleIdle(500)
    }
    const id = this.prebuildQ.shift()
    if (id === undefined) {
      this.prebuildDone = true
      return
    }
    let obj: THREE.Object3D | null = null
    let warm: THREE.Group | null = null
    if (id === 0) {
      if (!this.space) {
        obj = this.buildSpace().group
        warm = this.spaceWarmGroup()
        obj.add(warm)
      }
    } else if (!this.views.has(id)) {
      obj = this.buildView(id)?.group ?? null
    }
    if (!obj) return this.scheduleIdle(200)
    // 收集這一站的貼圖：下幾次 idle 分批上傳（同一張共用貼圖只上傳一次）
    const seen = new Set<THREE.Texture>()
    obj.traverse((o) => {
      const ms = (o as THREE.Mesh).material
      if (!ms) return
      for (const m of Array.isArray(ms) ? ms : [ms]) {
        for (const v of Object.values(m)) if (v instanceof THREE.Texture && !this.uploaded.has(v)) seen.add(v)
      }
    })
    this.prebuildTex = [...seen]
    // shader 預編譯：KHR_parallel_shader_compile 可用時不阻塞主執行緒。燈光數量是 program key 的一部分，
    // 要和正式渲染時一致：站內 = 本場景的燈（太空層的太陽不算）；太空層 = 本場景的燈＋太陽。
    // compile 會分別收集 target 與 obj 的可見燈光，所以太空層先從場景拿下、暫時設為可見，避免太陽算兩次。
    this.prebuildBusy = true
    const done = () => {
      this.prebuildBusy = false
      this.prebuildWarm = true
      this.scheduleIdle(500)
    }
    const sp = this.space?.group
    const spVis = sp?.visible ?? false
    const isSpace = obj === sp
    if (sp) {
      if (isSpace) {
        this.scene.remove(sp)
        sp.visible = true
      } else sp.visible = false
    }
    try {
      host.compileAsync(obj, this.camera, this.scene).then(done, done)
    } catch {
      done()
    } finally {
      if (sp) {
        sp.visible = spVis
        if (isSpace) this.scene.add(sp)
      }
      if (warm) obj.remove(warm)
    }
  }

  private ensureZone(id: number): void {
    if (this.zone === id) return
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
        this.grade = { hue: 0, sat: 0.1, bright: 0, contrast: 0.08 }
        this.units.clear()
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
    this.emK = 0
    this.emOn = false
    this.setStrips(v, false)
    this.grade = th.grade
    this.rts.setBounds(0, 0, info.layout.w, info.layout.h)
    this.units.clear()
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

  private isStaticStructure(e: CEnt): boolean {
    const def = UNITS.get(e.s.d ?? '')
    if (!def?.tags.includes('structure')) return false
    const info = this.zones.get(e.s.z ?? -1)
    if (!info) return false
    const { col, row } = layoutCell(info.layout, (e.s.x ?? 0) / 100, (e.s.y ?? 0) / 100)
    const key = `${col},${row}`
    if (this.views.get(info.id)?.pois.has(key)) {
      this.poiEnt.set(`${info.id}:${key}`, e.s.i)
      return true
    }
    return false
  }

  update(dt: number, t: number): void {
    const w = this.world
    w.interpolate()
    const zid = this.viewZone()
    this.ensureZone(zid)
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
    }
    this.units.sync(w.ents.values(), zid, (e) => this.isStaticStructure(e), dt, t)
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

  /** 依鏡頭位置分配燈光池（每 0.25 秒）並做淡入淡出、緊急照明色調（每幀）*/
  private updatePool(view: StationView, dt: number, t: number): void {
    this.lightT -= dt
    if (this.lightT <= 0) {
      this.lightT = 0.25
      const cx = this.rts.tx
      const cy = this.rts.ty
      const d2 = (a: RoomLight) => (a.x - cx) ** 2 + (-a.z - cy) ** 2
      const sorted = [...view.lights].sort((a, b) => d2(a) - d2(b))
      // 前兩盞給投影的 spot、其餘給點光；同一組裡已經在用的燈留在原本的槽位，只替換掉出名單的
      const nSpot = this.pool.filter((p) => p.l instanceof THREE.SpotLight).length
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
        for (const s of slots) if (!s.next) s.next = add.shift() ?? null
      }
    }
    const FADE = 1 / 0.3
    const em = this.emK
    const pulse = 0.78 + 0.22 * Math.sin(t * 1.6)
    for (const s of this.pool) {
      const l = s.l
      if (s.next !== s.cur) {
        // 換燈：先淡出，熄滅後才搬到新位置再淡入
        s.w = Math.max(0, s.w - dt * FADE)
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
      } else if (s.cur) s.w = Math.min(1, s.w + dt * FADE)
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
      l.intensity = base * e * (1 - em * (1 - 0.32 * pulse))
    }
    // 補光圖與環境光跟著轉紅
    const hb = this.hemiBase
    if (hb.k > 0) {
      if (em > 0) {
        fogUniforms.uFillTint.value.setRGB(1, 1, 1).lerp(EMERGENCY_FILL, em).multiplyScalar(1 - em * (1 - 0.45 * pulse))
        this.hemi.color.copy(hb.sky).lerp(EMERGENCY_SKY, em)
        this.hemi.groundColor.copy(hb.ground)
        this.hemi.intensity = hb.k * (1 - em * 0.4)
      } else {
        fogUniforms.uFillTint.value.setRGB(1, 1, 1)
        this.hemi.color.copy(hb.sky)
        this.hemi.intensity = hb.k
      }
    }
    if (em > 0) emergencyStripMat.emissiveIntensity = 0.6 + 1.6 * pulse
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
    this.cancelIdle?.()
    this.cancelIdle = null
    this.prebuildHost = null
    this.prebuildTex = []
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
    this.prebuildQ = []
  }

  /** 螢幕拾取：回傳實體 id（單位或設施）*/
  pick(ndcX: number, ndcY: number): number {
    const ray = new THREE.Raycaster()
    ray.setFromCamera(new THREE.Vector2(ndcX, ndcY), this.camera)
    const targets: THREE.Object3D[] = [this.units.group]
    const view = this.views.get(this.zone)
    if (view) for (const g of view.pois.values()) targets.push(g)
    const hits = ray.intersectObjects(targets, true)
    for (const h of hits) {
      let o: THREE.Object3D | null = h.object
      while (o) {
        if (o.userData.entId) return o.userData.entId as number
        if (o.parent && view && [...view.pois.entries()].some(([, g]) => g === o)) {
          const key = [...view.pois.entries()].find(([, g]) => g === o)![0]
          const id = this.poiEnt.get(`${this.zone}:${key}`)
          if (id) return id
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
