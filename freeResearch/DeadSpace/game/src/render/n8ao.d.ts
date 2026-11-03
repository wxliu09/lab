declare module 'n8ao' {
  import type { Camera, Color, Scene } from 'three'
  import { Pass } from 'postprocessing'
  export class N8AOPostPass extends Pass {
    constructor(scene: Scene, camera: Camera, width?: number, height?: number)
    /** 每幀渲染時讀取；換場景時直接改（N8AO 沒有覆寫 mainScene／mainCamera setter）*/
    scene: Scene
    camera: Camera
    configuration: {
      aoSamples: number
      aoRadius: number
      denoiseSamples: number
      denoiseRadius: number
      distanceFalloff: number
      intensity: number
      color: Color
      halfRes: boolean
      depthAwareUpsampling: boolean
      screenSpaceRadius: boolean
      gammaCorrection: boolean
      transparencyAware: boolean
    }
    setQualityMode(mode: 'Performance' | 'Low' | 'Medium' | 'High' | 'Ultra'): void
    setSize(w: number, h: number): void
  }
}
