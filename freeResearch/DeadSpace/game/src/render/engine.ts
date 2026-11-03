// 渲染引擎：WebGLRenderer＋後處理（N8AO → Bloom → AgX tone mapping → Vignette → 顆粒 → 受傷色差）
import * as THREE from 'three'
import {
  BloomEffect,
  ChromaticAberrationEffect,
  EffectComposer,
  EffectPass,
  NoiseEffect,
  RenderPass,
  SMAAEffect,
  ToneMappingEffect,
  ToneMappingMode,
  VignetteEffect,
  BlendFunction,
  HueSaturationEffect,
  BrightnessContrastEffect,
  type Pass,
} from 'postprocessing'
import { N8AOPostPass } from 'n8ao'
import { effect, signal } from '@preact/signals'
import { autoQuality, preset, quality } from './quality'
import { fogUniforms } from './materials'

export interface SceneLike {
  scene: THREE.Scene
  camera: THREE.PerspectiveCamera
  update(dt: number, t: number): void
  /** 場景專屬的色彩分級 */
  grade?: { hue: number; sat: number; bright: number; contrast: number }
  dispose?(): void
}

type Grade = NonNullable<SceneLike['grade']>
const DEFAULT_GRADE: Grade = { hue: 0, sat: 0, bright: 0, contrast: 0.05 }

/** WebGL context 遺失中（驅動重置、GPU 被搶走）：HUD 顯示提示，恢復後自動消失 */
export const gpuLost = signal(false)

/** N8AO 的全螢幕三角形（copyQuad 等）不在 Pass.dispose 的清單裡，另外釋放 */
function disposeQuads(p: Pass): void {
  if (!(p instanceof N8AOPostPass)) return
  for (const v of Object.values(p as unknown as Record<string, unknown>)) {
    const q = v as { _mesh?: unknown; dispose?: () => void } | null
    if (q && typeof q === 'object' && q._mesh && typeof q.dispose === 'function') q.dispose()
  }
}

export class Engine {
  readonly renderer: THREE.WebGLRenderer
  private composer: EffectComposer
  private renderPass: RenderPass
  private aoPass: N8AOPostPass | null = null
  /** renderPass 以外、由引擎建立的 pass；只在建構與畫質變更時重建（換場景、換 zone 不重建）*/
  private passes: Pass[] = []
  private ca: ChromaticAberrationEffect | null = null
  private hue: HueSaturationEffect | null = null
  private bc: BrightnessContrastEffect | null = null
  private current: SceneLike | null = null
  /** 沒有場景時讓 pass 指向空場景，舊場景才能被回收 */
  private readonly blankScene = new THREE.Scene()
  private readonly blankCam = new THREE.PerspectiveCamera()
  private sc: THREE.Scene = this.blankScene
  private cm: THREE.Camera = this.blankCam
  private raf = 0
  private last = performance.now()
  private t0 = performance.now()
  damagePulse = 0
  fps = 60
  private frames = 0
  private fpsT = performance.now()
  private stopQ: () => void

  constructor(readonly canvas: HTMLCanvasElement) {
    this.renderer = new THREE.WebGLRenderer({
      canvas,
      antialias: false,
      stencil: false,
      depth: true,
      powerPreference: 'high-performance',
      preserveDrawingBuffer: false,
    })
    this.renderer.outputColorSpace = THREE.SRGBColorSpace
    this.renderer.toneMapping = THREE.NoToneMapping
    this.renderer.shadowMap.type = THREE.PCFShadowMap
    this.composer = new EffectComposer(this.renderer, { frameBufferType: THREE.HalfFloatType, multisampling: 0 })
    this.renderPass = new RenderPass(this.sc, this.cm)
    // 首次啟動（沒選過畫質）：依 GPU／核心數／記憶體自動選 low 或 medium
    autoQuality(this.renderer.getContext())
    this.stopQ = effect(() => {
      void quality.value
      this.rebuild()
    })
    window.addEventListener('resize', this.onResize)
    // three 的 lost handler 已經 preventDefault（瀏覽器才會嘗試恢復）；這裡只更新提示
    canvas.addEventListener('webglcontextlost', this.onLost)
    canvas.addEventListener('webglcontextrestored', this.onRestored)
  }

  private onLost = () => {
    gpuLost.value = true
  }

  private onRestored = () => {
    gpuLost.value = false
  }

  /** 依畫質建立整條後處理鏈：先 dispose 舊的 pass（EffectPass 會連同 effect 一起釋放）再重建 */
  private rebuild(): void {
    const q = preset()
    this.composer.removeAllPasses()
    for (const p of this.passes) {
      p.dispose()
      disposeQuads(p)
    }
    this.passes = []
    this.composer.addPass(this.renderPass)
    this.aoPass = null
    if (q.ssao > 0) {
      const ao = new N8AOPostPass(this.sc, this.cm, 1, 1)
      ao.configuration.aoRadius = 1.6
      ao.configuration.distanceFalloff = 0.6
      ao.configuration.intensity = 2.6
      ao.configuration.halfRes = q.ssao < 2
      ao.configuration.gammaCorrection = false
      ao.setQualityMode(q.ssao < 2 ? 'Low' : 'Medium')
      this.aoPass = ao
      this.passes.push(ao)
    }
    const bloom = new BloomEffect({ intensity: 1.1 * q.bloom, luminanceThreshold: 0.82, luminanceSmoothing: 0.25, mipmapBlur: true, radius: 0.7 })
    this.ca = new ChromaticAberrationEffect({ offset: new THREE.Vector2(0, 0), radialModulation: true, modulationOffset: 0.3 })
    this.hue = new HueSaturationEffect({ hue: 0, saturation: 0 })
    this.bc = new BrightnessContrastEffect({ brightness: 0, contrast: 0.05 })
    const vignette = new VignetteEffect({ offset: 0.3, darkness: 0.62 })
    const tone = new ToneMappingEffect({ mode: ToneMappingMode.AGX })
    const noise = new NoiseEffect({ premultiply: true, blendFunction: BlendFunction.SCREEN })
    noise.blendMode.opacity.value = 0.035
    const smaa = new SMAAEffect()
    // 卷積類效果（色差、SMAA）各自一個 pass
    this.passes.push(new EffectPass(this.cm, bloom, tone, this.hue, this.bc, vignette, noise), new EffectPass(this.cm, this.ca), new EffectPass(this.cm, smaa))
    for (const p of this.passes) this.composer.addPass(p)
    this.applyGrade(this.current?.grade)
    this.renderer.shadowMap.enabled = q.shadows > 0
    this.onResize()
  }

  /** 目前套用的色彩分級（場景換了新的分級物件就重新套用，例如天氣淡入）*/
  private appliedGrade: Grade | undefined

  private applyGrade(g: Grade = DEFAULT_GRADE): void {
    this.appliedGrade = g
    if (!this.hue || !this.bc) return
    this.hue.hue = g.hue
    this.hue.saturation = g.sat
    this.bc.brightness = g.bright
    this.bc.contrast = g.contrast
  }

  private onResize = () => {
    const q = preset()
    const dpr = Math.min(window.devicePixelRatio || 1, q.dpr)
    const w = this.canvas.clientWidth || window.innerWidth
    const h = this.canvas.clientHeight || window.innerHeight
    this.renderer.setPixelRatio(dpr)
    this.renderer.setSize(w, h, false)
    this.composer.setSize(w, h, false)
    if (this.current) {
      this.current.camera.aspect = w / h
      this.current.camera.updateProjectionMatrix()
    }
  }

  /**
   * 換場景只換 pass 的 mainScene／mainCamera 與色彩分級，不重建後處理（換 zone 也走這裡，只更新色彩分級）。
   * 換成另一個場景時釋放舊場景。
   */
  setScene(s: SceneLike | null): void {
    if (s !== this.current) {
      if (this.current) this.current.dispose?.()
      this.current = s
      this.sc = s?.scene ?? this.blankScene
      this.cm = s?.camera ?? this.blankCam
      this.composer.setMainScene(this.sc)
      this.composer.setMainCamera(this.cm)
      if (this.aoPass) {
        this.aoPass.scene = this.sc
        this.aoPass.camera = this.cm
      }
      if (s) this.onResize()
    }
    if (s) this.applyGrade(s.grade)
  }

  /**
   * 預先編譯 shader（不等 GPU 連結完成；預建自己用 program.isReady() 分段輪詢）：用後處理實際渲染的 render target（線性輸出色彩空間），
   * 編出來的 program 才會在正式渲染時命中快取。obj 可以是隱藏中的群組；target = 提供燈光的場景。
   */
  compile(obj: THREE.Object3D, camera: THREE.Camera, target: THREE.Scene): void {
    if (gpuLost.value) return
    const r = this.renderer
    const prev = r.getRenderTarget()
    r.setRenderTarget(this.composer.inputBuffer)
    try {
      r.compile(obj, camera, target)
    } finally {
      r.setRenderTarget(prev)
    }
  }

  /** 開始 rAF 迴圈；immediate = 先同步畫一幀（開局：建場景與第一幀在同一個工作裡做完）*/
  start(immediate = false): void {
    if (this.raf) return
    const loop = () => {
      this.raf = requestAnimationFrame(loop)
      this.frame()
    }
    this.raf = requestAnimationFrame(loop)
    if (immediate) this.frame()
  }

  /** 畫一幀：更新目前場景、後處理輸出 */
  private frame(): void {
    const now = performance.now()
    const dt = Math.min(0.1, (now - this.last) / 1000)
    this.last = now
    const t = (now - this.t0) / 1000
    fogUniforms.uTime.value = t
    this.frames++
    if (now - this.fpsT > 1000) {
      this.fps = (this.frames * 1000) / (now - this.fpsT)
      this.frames = 0
      this.fpsT = now
    }
    if (!this.current) return
    this.current.update(dt, t)
    if (this.current.grade && this.current.grade !== this.appliedGrade) this.applyGrade(this.current.grade)
    // 受傷色差脈衝
    this.damagePulse = Math.max(0, this.damagePulse - dt * 2.5)
    const o = this.damagePulse * 0.006
    this.ca?.offset.set(o, o * 0.6)
    this.composer.render(dt)
  }

  stop(): void {
    cancelAnimationFrame(this.raf)
    this.raf = 0
  }

  dispose(): void {
    this.stop()
    this.stopQ()
    window.removeEventListener('resize', this.onResize)
    this.canvas.removeEventListener('webglcontextlost', this.onLost)
    this.canvas.removeEventListener('webglcontextrestored', this.onRestored)
    this.current?.dispose?.()
    this.current = null
    for (const p of this.passes) disposeQuads(p)
    this.composer.dispose()
    this.renderer.dispose()
    this.renderer.forceContextLoss()
    gpuLost.value = false
  }
}

let shared: Engine | null = null

export function currentFps(): number {
  return shared?.fps ?? 0
}

/** 全頁共用一個 WebGL context（主選單與遊戲切換場景）*/
export function getEngine(canvas: HTMLCanvasElement): Engine {
  if (shared && shared.canvas !== canvas) {
    shared.dispose()
    shared = null
  }
  if (!shared) shared = new Engine(canvas)
  return shared
}
