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
} from 'postprocessing'
import { N8AOPostPass } from 'n8ao'
import { effect } from '@preact/signals'
import { preset, quality } from './quality'
import { fogUniforms } from './materials'

export interface SceneLike {
  scene: THREE.Scene
  camera: THREE.PerspectiveCamera
  update(dt: number, t: number): void
  /** 場景專屬的色彩分級 */
  grade?: { hue: number; sat: number; bright: number; contrast: number }
  dispose?(): void
}

export class Engine {
  readonly renderer: THREE.WebGLRenderer
  private composer: EffectComposer
  private renderPass: RenderPass
  private aoPass: N8AOPostPass | null = null
  private bloom: BloomEffect
  private ca: ChromaticAberrationEffect
  private hue: HueSaturationEffect
  private bc: BrightnessContrastEffect
  private vignette: VignetteEffect
  private current: SceneLike | null = null
  private sc: THREE.Scene = new THREE.Scene()
  private cm: THREE.Camera = new THREE.PerspectiveCamera()
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
    this.bloom = new BloomEffect({ intensity: 1.1, luminanceThreshold: 0.82, luminanceSmoothing: 0.25, mipmapBlur: true, radius: 0.7 })
    this.ca = new ChromaticAberrationEffect({ offset: new THREE.Vector2(0, 0), radialModulation: true, modulationOffset: 0.3 })
    this.hue = new HueSaturationEffect({ hue: 0, saturation: 0 })
    this.bc = new BrightnessContrastEffect({ brightness: 0, contrast: 0.05 })
    this.vignette = new VignetteEffect({ offset: 0.3, darkness: 0.62 })
    this.stopQ = effect(() => {
      void quality.value
      this.rebuild()
    })
    window.addEventListener('resize', this.onResize)
  }

  private rebuild(): void {
    const q = preset()
    this.composer.removeAllPasses()
    this.composer.addPass(this.renderPass)
    this.aoPass = null
    if (q.ssao > 0) {
      this.aoPass = new N8AOPostPass(this.sc, this.cm, 1, 1)
      this.aoPass.configuration.aoRadius = 1.6
      this.aoPass.configuration.distanceFalloff = 0.6
      this.aoPass.configuration.intensity = 2.6
      this.aoPass.configuration.halfRes = q.ssao < 2
      this.aoPass.configuration.gammaCorrection = false
      this.aoPass.setQualityMode(q.ssao < 2 ? 'Low' : 'Medium')
      this.composer.addPass(this.aoPass)
    }
    this.bloom.intensity = 1.1 * q.bloom
    const tone = new ToneMappingEffect({ mode: ToneMappingMode.AGX })
    const noise = new NoiseEffect({ premultiply: true, blendFunction: BlendFunction.SCREEN })
    noise.blendMode.opacity.value = 0.035
    const smaa = new SMAAEffect()
    // 卷積類效果（色差、SMAA）各自一個 pass
    this.composer.addPass(new EffectPass(this.cm, this.bloom, tone, this.hue, this.bc, this.vignette, noise))
    this.composer.addPass(new EffectPass(this.cm, this.ca))
    this.composer.addPass(new EffectPass(this.cm, smaa))
    this.renderer.shadowMap.enabled = q.shadows > 0
    this.onResize()
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

  setScene(s: SceneLike | null): void {
    if (this.current && this.current !== s) this.current.dispose?.()
    this.current = s
    if (!s) return
    this.sc = s.scene
    this.cm = s.camera
    this.renderPass.mainScene = s.scene
    this.renderPass.mainCamera = s.camera
    this.rebuild()
    const g = s.grade ?? { hue: 0, sat: 0, bright: 0, contrast: 0.05 }
    this.hue.hue = g.hue
    this.hue.saturation = g.sat
    this.bc.brightness = g.bright
    this.bc.contrast = g.contrast
  }

  start(): void {
    if (this.raf) return
    const loop = () => {
      this.raf = requestAnimationFrame(loop)
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
      // 受傷色差脈衝
      this.damagePulse = Math.max(0, this.damagePulse - dt * 2.5)
      const o = this.damagePulse * 0.006
      this.ca.offset.set(o, o * 0.6)
      this.composer.render(dt)
    }
    this.raf = requestAnimationFrame(loop)
  }

  stop(): void {
    cancelAnimationFrame(this.raf)
    this.raf = 0
  }

  dispose(): void {
    this.stop()
    this.stopQ()
    window.removeEventListener('resize', this.onResize)
    this.current?.dispose?.()
    this.composer.dispose()
    this.renderer.dispose()
    this.renderer.forceContextLoss()
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
