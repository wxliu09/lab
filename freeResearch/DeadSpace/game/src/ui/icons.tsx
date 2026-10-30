// 統一風格的 SVG 圖示（線條＋發光），全部手寫 path，不使用原作或 WC3 圖示
import type { JSX } from 'preact'

const P: Record<string, string> = {
  move: 'M12 3l7 7h-4v8h-6v-8H5z',
  stop: 'M6 6h12v12H6z',
  hold: 'M7 4v16M12 4v16M17 4v16',
  attack: 'M4 20L16 8M14 4l6 6M6 14l4 4M3 21l3-1-2-2z',
  heal: 'M10 4h4v6h6v4h-6v6h-4v-6H4v-4h6z',
  bolt: 'M13 2L5 14h6l-2 8 8-12h-6z',
  fire: 'M12 2c1 4 6 6 6 12a6 6 0 01-12 0c0-3 2-5 3-7 1 2 2 3 3 3-1-3 0-6 0-8z',
  frost: 'M12 2v20M3 7l18 10M3 17L21 7M9 3l3 3 3-3M9 21l3-3 3 3',
  shield: 'M12 2l8 3v6c0 5-3.5 9-8 11-4.5-2-8-6-8-11V5z',
  eye: 'M2 12s4-7 10-7 10 7 10 7-4 7-10 7S2 12 2 12zm10-3a3 3 0 100 6 3 3 0 000-6z',
  dna: 'M7 2c0 6 10 6 10 12s-10 6-10 8M17 2c0 6-10 6-10 12s10 6 10 8M8 6h8M8 18h8M9 12h6',
  bomb: 'M12 8a7 7 0 107 7 7 7 0 00-7-7zM14 6l3-3M17 3l2 2M15 8l2-2',
  grenade: 'M9 6h6v3h2v11H7V9h2zM10 3h4v3h-4z',
  rocket: 'M12 2c3 3 4 7 4 11l2 3-3 1-1 3h-4l-1-3-3-1 2-3c0-4 1-8 4-11zM12 8a1.5 1.5 0 100 3 1.5 1.5 0 000-3z',
  saw: 'M12 4l2 3 3-1 0 3 3 1-2 3 2 3-3 1 0 3-3-1-2 3-2-3-3 1 0-3-3-1 2-3-2-3 3-1 0-3 3 1zM12 9a3 3 0 100 6 3 3 0 000-6z',
  plasma: 'M12 4a8 8 0 100 16 8 8 0 000-16zm0 4a4 4 0 110 8 4 4 0 010-8z',
  tentacle: 'M4 20c4-2 4-6 8-8s6-6 4-9M8 20c2-3 6-4 8-7',
  egg: 'M12 3c4 0 7 6 7 11a7 7 0 01-14 0C5 9 8 3 12 3z',
  claw: 'M5 20l4-14M10 20l3-15M15 20l3-13',
  skull: 'M12 3a8 8 0 00-5 14v3h10v-3a8 8 0 00-5-14zM9 11a1.5 1.5 0 100 3 1.5 1.5 0 000-3zm6 0a1.5 1.5 0 100 3 1.5 1.5 0 000-3z',
  gear: 'M12 8a4 4 0 100 8 4 4 0 000-8zM12 2v3M12 19v3M2 12h3M19 12h3M5 5l2 2M17 17l2 2M5 19l2-2M17 7l2-2',
  door: 'M5 3h14v18H5zM12 3v18M9 12h1M14 12h1',
  card: 'M3 6h18v12H3zM3 10h18M6 15h5',
  radar: 'M12 12L19 5M12 3a9 9 0 109 9M12 7a5 5 0 105 5',
  scan: 'M3 7V3h4M17 3h4v4M21 17v4h-4M7 21H3v-4M3 12h18',
  teleport: 'M12 2v4M12 18v4M7 12a5 5 0 1010 0 5 5 0 00-10 0zM4 8l2 1M18 15l2 1M4 16l2-1M18 9l2-1',
  clock: 'M12 3a9 9 0 100 18 9 9 0 000-18zM12 7v5l3 3',
  mask: 'M4 6c4-2 12-2 16 0 0 8-3 13-8 13S4 14 4 6zM8 10h3M13 10h3M9 15c2 1 4 1 6 0',
  web: 'M12 2v20M2 12h20M5 5l14 14M19 5L5 19M12 7l5 5-5 5-5-5z',
  rock: 'M4 18l3-9 5-4 6 3 2 7-4 4H7z',
  storm: 'M6 14a4 4 0 010-8 5 5 0 0110 0 4 4 0 010 8zM10 16l-2 5M14 16l-2 5',
  beam: 'M3 12h12M15 8l6 4-6 4zM3 9h4M3 15h4',
  gun: 'M3 10h14l4-2v6h-6l-2 5h-3l1-5H3z',
  drone: 'M12 9a3 3 0 100 6 3 3 0 000-6zM5 5l4 4M19 5l-4 4M5 19l4-4M19 19l-4-4M3 3h4M17 3h4M3 21h4M17 21h4',
  ship: 'M12 2l4 9 5 3-5 2-1 6h-6l-1-6-5-2 5-3z',
  pod: 'M8 4h8l2 6v8l-3 3H9l-3-3v-8z',
  module: 'M4 7l8-4 8 4v10l-8 4-8-4zM4 7l8 4 8-4M12 11v10',
  hat: 'M4 17h16M7 17l2-9h6l2 9M9 8l3-4 3 4',
  plush: 'M8 6a3 3 0 116 0 3 3 0 11-6 0zM6 11h12l-1 9H7z',
  pill: 'M5 15l10-10a3.5 3.5 0 015 5L10 20a3.5 3.5 0 01-5-5zM10 10l4 4',
  syringe: 'M18 2l4 4M20 4l-9 9-4-4 9-9M7 13l-4 4 4 4 4-4M9 11l2 2',
  battery: 'M6 5h12v16H6zM10 2h4v3h-4zM9 10h6M9 14h6',
  camera: 'M4 8h11l5-3v14l-5-3H4z',
  sensor: 'M12 14a2 2 0 100-4 2 2 0 000 4zM8 8a6 6 0 000 8M16 8a6 6 0 010 8M5 5a10 10 0 000 14M19 5a10 10 0 010 14',
  key: 'M8 8a4 4 0 107 3l6 6v3h-3v-2h-2v-2l-2-2a4 4 0 01-6-6z',
  suit: 'M8 3h8l2 4v5l-2 2v7h-3v-6h-2v6H8v-7l-2-2V7z',
  wrench: 'M14 4a5 5 0 016 6l-2 1-3-3 1-2zM14 9L4 19l1 1L15 10',
  cloak: 'M12 3c-4 0-6 3-6 7v11l3-2 3 2 3-2 3 2V10c0-4-2-7-6-7z',
  core: 'M12 4l7 4v8l-7 4-7-4V8zM12 9a3 3 0 100 6 3 3 0 000-6z',
  star: 'M12 2l3 7 7 1-5 5 1 7-6-3-6 3 1-7-5-5 7-1z',
  void: 'M12 4a8 8 0 100 16 8 8 0 000-16zM12 9a3 3 0 100 6 3 3 0 000-6zM4 4l3 3M20 20l-3-3',
  infect: 'M12 8a4 4 0 100 8 4 4 0 000-8zM12 2v4M12 18v4M2 12h4M18 12h4M5 5l3 3M16 16l3 3M5 19l3-3M16 8l3-3',
  roar: 'M4 9h4l5-5v16l-5-5H4zM16 8c2 2 2 6 0 8M19 5c4 4 4 10 0 14',
  evolve: 'M12 21V3M5 10l7-7 7 7M7 16h10',
  devour: 'M3 12c3-6 15-6 18 0-3 6-15 6-18 0zM7 12l2-2 2 2 2-2 2 2 2-2',
  human: 'M12 3a3 3 0 100 6 3 3 0 000-6zM6 21v-6a6 6 0 0112 0v6',
  speed: 'M4 12h6M2 8h6M4 16h6M12 6l8 6-8 6z',
  unknown: 'M9 9a3 3 0 116 0c0 2-3 2-3 5M12 18v.5',
}

export function Icon({ name, color = '#9fe7ff', size = 28 }: { name: string; color?: string; size?: number }): JSX.Element {
  const d = P[name] ?? P.unknown
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" style={{ filter: `drop-shadow(0 0 3px ${color})` }}>
      <path d={d} fill="none" stroke={color} stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round" />
    </svg>
  )
}

export const ICON_NAMES = Object.keys(P)
