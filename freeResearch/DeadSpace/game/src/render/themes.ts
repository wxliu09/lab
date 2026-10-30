// 各地點的視覺主題（美術聖經 §3.3）
export interface Theme {
  wall: string
  wallAccent: string
  hull: string
  trim: string
  floor: Record<string, { variant: 'plate' | 'grate' | 'tile' | 'rubber' | 'concrete'; tint: string }>
  defaultFloor: { variant: 'plate' | 'grate' | 'tile' | 'rubber' | 'concrete'; tint: string }
  light: string
  ambientSky: string
  ambientGround: string
  ambient: number
  lightScale: number
  grade: { hue: number; sat: number; bright: number; contrast: number }
  dust?: string
}

export const THEMES: Record<string, Theme> = {
  nyx: {
    wall: '#9aa7b2',
    wallAccent: '#33ffd1',
    hull: '#20262d',
    trim: '#c9d3da',
    floor: {
      corridor: { variant: 'grate', tint: '#59626b' },
      bridge: { variant: 'tile', tint: '#3b434c' },
      medbay: { variant: 'tile', tint: '#94a3ad' },
      gitlab: { variant: 'tile', tint: '#7f939f' },
      lab: { variant: 'tile', tint: '#8494a0' },
      quarters: { variant: 'rubber', tint: '#4d5761' },
      commissary: { variant: 'plate', tint: '#56606a' },
      hangar: { variant: 'concrete', tint: '#5d6166' },
      dronebay: { variant: 'plate', tint: '#4b535b' },
      power: { variant: 'grate', tint: '#4d5257' },
      closet: { variant: 'plate', tint: '#3e454b' },
      pods: { variant: 'plate', tint: '#4f575f' },
    },
    defaultFloor: { variant: 'plate', tint: '#4a535c' },
    light: '#e8f6ff',
    ambientSky: '#1b2633',
    ambientGround: '#0b0d10',
    ambient: 0.9,
    lightScale: 1,
    grade: { hue: 0, sat: 0.02, bright: 0, contrast: 0.06 },
  },
}

export function theme(id: string): Theme {
  return THEMES[id] ?? THEMES.nyx
}
