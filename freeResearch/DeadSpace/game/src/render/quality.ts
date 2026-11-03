// 畫質預設（美術聖經 §14）
import { signal } from '@preact/signals'

export type Quality = 'low' | 'medium' | 'high' | 'ultra'

export interface QualityPreset {
  dpr: number
  shadows: 0 | 1 | 2
  ssao: 0 | 1 | 2
  bloom: number
  particles: number
  maxLights: number
}

export const PRESETS: Record<Quality, QualityPreset> = {
  low: { dpr: 1, shadows: 0, ssao: 0, bloom: 0.5, particles: 500, maxLights: 4 },
  medium: { dpr: 1.25, shadows: 1, ssao: 1, bloom: 0.8, particles: 1500, maxLights: 6 },
  high: { dpr: 1.5, shadows: 2, ssao: 2, bloom: 1, particles: 3000, maxLights: 8 },
  ultra: { dpr: 2, shadows: 2, ssao: 2, bloom: 1, particles: 6000, maxLights: 8 },
}

function stored(): Quality | null {
  try {
    const v = localStorage.getItem('xc.quality')
    if (v === 'low' || v === 'medium' || v === 'high' || v === 'ultra') return v
  } catch {
    /* ignore */
  }
  return null
}

export const quality = signal<Quality>(stored() ?? 'medium')

/** 內顯、行動裝置 GPU、軟體算繪（Intel Arc 是獨顯；Apple M 系列效能足夠跑 medium，不算在內）*/
const WEAK_GPU = /swiftshader|llvmpipe|softpipe|software|basic render|intel(?!.*\barc\b)|radeon\(tm\) graphics|radeon vega|vega \d+ graphics|mali|adreno|powervr|videocore|apple gpu/i

const SOFTWARE_GL = /swiftshader|llvmpipe|softpipe|software|basic render/i

function glName(gl: WebGLRenderingContext | WebGL2RenderingContext | null): string {
  try {
    if (!gl) return ''
    const ext = gl.getExtension('WEBGL_debug_renderer_info')
    return String(gl.getParameter(ext ? ext.UNMASKED_RENDERER_WEBGL : gl.RENDERER) ?? '')
  } catch {
    return ''
  }
}

/** 軟體算繪（沒有可用的 GPU）*/
export function isSoftwareGl(gl: WebGLRenderingContext | WebGL2RenderingContext | null): boolean {
  return SOFTWARE_GL.test(glName(gl))
}

/**
 * 依裝置推測的預設畫質：GPU 名稱（WEBGL_debug_renderer_info）、邏輯核心數、記憶體（deviceMemory，Chrome 才有）。
 * 低階或內顯 → low，其餘 medium。
 * Safari 不回報實際型號，Apple Silicon 的 Mac 與 iPhone／iPad 都只回 'Apple GPU'：沒有觸控點（maxTouchPoints = 0）的是 Mac（M 系列），
 * 和 Chrome 回報的「Apple M…」一樣給 medium；有觸控點（iPad 的 Safari 也假裝成 Mac，但 maxTouchPoints > 0）維持 low。
 */
export function detectQuality(gl: WebGLRenderingContext | WebGL2RenderingContext | null, nav: { hardwareConcurrency?: number; deviceMemory?: number; maxTouchPoints?: number } = navigator): Quality {
  const cores = nav.hardwareConcurrency ?? 8
  const mem = nav.deviceMemory
  if (cores <= 4 || (mem !== undefined && mem <= 4)) return 'low'
  const name = glName(gl)
  if (/^apple gpu$/i.test(name.trim()) && nav.maxTouchPoints === 0) return 'medium'
  return WEAK_GPU.test(name) ? 'low' : 'medium'
}

/** 首次啟動（使用者沒選過畫質）：依裝置自動選，不寫入設定；使用者自己選過的設定優先 */
export function autoQuality(gl: WebGLRenderingContext | WebGL2RenderingContext | null): void {
  if (stored()) return
  const q = detectQuality(gl)
  if (q !== quality.value) quality.value = q
}

export function setQuality(q: Quality): void {
  quality.value = q
  try {
    localStorage.setItem('xc.quality', q)
  } catch {
    /* ignore */
  }
}

export function preset(): QualityPreset {
  return PRESETS[quality.value]
}
