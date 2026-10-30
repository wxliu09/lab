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

function initial(): Quality {
  try {
    const v = localStorage.getItem('xc.quality')
    if (v === 'low' || v === 'medium' || v === 'high' || v === 'ultra') return v
  } catch {
    /* ignore */
  }
  return 'medium'
}

export const quality = signal<Quality>(initial())

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
