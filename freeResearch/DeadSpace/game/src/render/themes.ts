// 各地點的視覺主題（美術聖經 §3.3）
import type { FloorVariant } from './tex'

export interface Theme {
  /** 牆板色；'rock:#rrggbb' = 室外岩壁、'flesh:#rrggbb' = 有機腔壁 */
  wall: string
  wallAccent: string
  /** 牆頂色（同樣接受 'rock:'／'flesh:'）*/
  hull: string
  trim: string
  floor: Record<string, { variant: FloorVariant; tint: string }>
  defaultFloor: { variant: FloorVariant; tint: string }
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

THEMES.ship = {
  ...THEMES.nyx,
  wall: '#6a737c',
  wallAccent: '#7fd8ff',
  floor: { cabin: { variant: 'grate', tint: '#4a525a' } },
  defaultFloor: { variant: 'grate', tint: '#4a525a' },
  ambient: 0.8,
}

// ───── 其餘地點（美術聖經 §3.3：每一站都要長得不一樣）─────

/** 裁決者號：深海軍藍＋琥珀色儀表、雷達旋轉光 */
THEMES.adjudicatrix = {
  wall: '#56657f',
  wallAccent: '#ffb000',
  hull: '#121a28',
  trim: '#8ea0bd',
  floor: {
    corridor: { variant: 'grate', tint: '#3b475a' },
    bridge: { variant: 'tile', tint: '#26324a' },
    radar: { variant: 'plate', tint: '#2c374c' },
    comms: { variant: 'tile', tint: '#2a3650' },
    commissary: { variant: 'plate', tint: '#485365' },
    foundry: { variant: 'grate', tint: '#40444b' },
    quarters: { variant: 'rubber', tint: '#384356' },
    hangar: { variant: 'concrete', tint: '#515862' },
    pods: { variant: 'plate', tint: '#434c5a' },
    cargo: { variant: 'plate', tint: '#3f4855' },
  },
  defaultFloor: { variant: 'plate', tint: '#3f4a5c' },
  light: '#dce8ff',
  ambientSky: '#26365a',
  ambientGround: '#07090e',
  ambient: 1.15,
  lightScale: 1,
  grade: { hue: -0.02, sat: 0.04, bright: 0, contrast: 0.08 },
}

/** 天守砲台：黑＋橘、巨大砲管、能量導管脈動 */
THEMES.tenshu = {
  wall: '#5a524b',
  wallAccent: '#ff7a2a',
  hull: '#121110',
  trim: '#9a6a44',
  floor: {
    cannon: { variant: 'grate', tint: '#4a4540' },
    bridge: { variant: 'tile', tint: '#3e3a36' },
    corridor: { variant: 'grate', tint: '#4a4540' },
    hangar: { variant: 'concrete', tint: '#5a5652' },
    reactor: { variant: 'grate', tint: '#46403b' },
    medbay: { variant: 'tile', tint: '#8d969c' },
    pods: { variant: 'plate', tint: '#4c4743' },
    armory: { variant: 'plate', tint: '#4c4743' },
    cargo: { variant: 'plate', tint: '#4e4944' },
  },
  defaultFloor: { variant: 'plate', tint: '#4c4743' },
  light: '#ffd8b8',
  ambientSky: '#4a3626',
  ambientGround: '#0a0806',
  ambient: 1.2,
  lightScale: 1.3,
  grade: { hue: 0.02, sat: 0.06, bright: -0.01, contrast: 0.12 },
}

/** 七號廢站：鏽蝕、斷電、火花、閃爍燈、漂浮塵埃 */
THEMES.hulk7 = {
  wall: '#6e5444',
  wallAccent: '#ff8a3a',
  hull: '#1a1410',
  trim: '#7a5a40',
  floor: {
    derelict: { variant: 'plate', tint: '#4b3d33' },
  },
  defaultFloor: { variant: 'grate', tint: '#3f342c' },
  light: '#d8b890',
  ambientSky: '#30241a',
  ambientGround: '#060504',
  ambient: 0.9,
  lightScale: 0.7,
  grade: { hue: 0.03, sat: -0.12, bright: -0.03, contrast: 0.14 },
  dust: '#c8a070',
}

/** 豪勇號：槍鐵灰、紅色戰備燈、艙門厚重 */
THEMES.bravado = {
  wall: '#5d646b',
  wallAccent: '#ff3b3b',
  hull: '#15181c',
  trim: '#9aa2aa',
  floor: {
    corridor: { variant: 'grate', tint: '#3d4248' },
    engine: { variant: 'grate', tint: '#33373c' },
    armory: { variant: 'plate', tint: '#454b52' },
    quarters: { variant: 'rubber', tint: '#3c4148' },
    captain: { variant: 'tile', tint: '#4a3f38' },
    bridge: { variant: 'tile', tint: '#2c3137' },
    pods: { variant: 'plate', tint: '#41464c' },
    medbay: { variant: 'tile', tint: '#8f99a1' },
    dropbay: { variant: 'plate', tint: '#3a3f45' },
    commissary: { variant: 'plate', tint: '#474d54' },
    hangar: { variant: 'concrete', tint: '#50555a' },
  },
  defaultFloor: { variant: 'plate', tint: '#454b52' },
  light: '#e4e8ec',
  ambientSky: '#38282e',
  ambientGround: '#09090b',
  ambient: 1.1,
  lightScale: 1,
  grade: { hue: 0, sat: -0.04, bright: 0, contrast: 0.1 },
}

/** 火口號：工業黃、粉塵、輸送帶、熔爐橘光 */
THEMES.caldera = {
  wall: '#8c7a46',
  wallAccent: '#ffd23d',
  hull: '#1b1710',
  trim: '#c9a23a',
  floor: {
    furnace: { variant: 'grate', tint: '#4a4236' },
    conveyor: { variant: 'plate', tint: '#443d32' },
    bridge: { variant: 'tile', tint: '#2f2c27' },
    corridor: { variant: 'grate', tint: '#3d372d' },
    quarters: { variant: 'rubber', tint: '#3c372f' },
    medbay: { variant: 'tile', tint: '#8f969a' },
    pods: { variant: 'plate', tint: '#433d33' },
    airlock: { variant: 'plate', tint: '#4a4538' },
  },
  defaultFloor: { variant: 'plate', tint: '#443d32' },
  light: '#ffe8c0',
  ambientSky: '#3a2e1c',
  ambientGround: '#080604',
  ambient: 1.1,
  lightScale: 1,
  grade: { hue: 0.03, sat: 0.06, bright: 0, contrast: 0.1 },
  dust: '#d8b070',
}

/** 活體庫號：綠色培養槽光、潮濕地面、隔間玻璃 */
THEMES.vivarium = {
  wall: '#7f9488',
  wallAccent: '#33ffd1',
  hull: '#121a17',
  trim: '#a8c4b6',
  floor: {
    hangar: { variant: 'concrete', tint: '#4b534f' },
    corridor: { variant: 'grate', tint: '#3c4943' },
    lab: { variant: 'tile', tint: '#5e7369' },
    commissary: { variant: 'plate', tint: '#4a5650' },
    pods: { variant: 'plate', tint: '#45514b' },
    cell: { variant: 'concrete', tint: '#3d4a40' },
  },
  defaultFloor: { variant: 'plate', tint: '#4a5650' },
  light: '#e0fff0',
  ambientSky: '#1e3a2c',
  ambientGround: '#050907',
  ambient: 1.15,
  lightScale: 1,
  grade: { hue: 0.02, sat: 0.05, bright: 0, contrast: 0.08 },
}

/** 擺渡號：指標標誌、候車座位、傳送門藍光 */
THEMES.portage = {
  wall: '#8a96a4',
  wallAccent: '#6fb8ff',
  hull: '#141a22',
  trim: '#c6d2de',
  floor: {
    teleport: { variant: 'tile', tint: '#2f3a4a' },
    bridge: { variant: 'tile', tint: '#323c4a' },
    quarters: { variant: 'rubber', tint: '#465060' },
    corridor: { variant: 'plate', tint: '#4d5764' },
    lounge: { variant: 'rubber', tint: '#3d4a5c' },
    airlock: { variant: 'plate', tint: '#4b5562' },
  },
  defaultFloor: { variant: 'plate', tint: '#4d5764' },
  light: '#e8f4ff',
  ambientSky: '#24344e',
  ambientGround: '#07090d',
  ambient: 1.15,
  lightScale: 1,
  grade: { hue: -0.02, sat: 0.05, bright: 0.01, contrast: 0.06 },
}

/** 翠原星：異星草原、淡紫天光、軍事基地混凝土（室外：岩壁、草地）*/
THEMES.verdance = {
  wall: 'rock:#6e6674',
  wallAccent: '#86c46e',
  hull: 'rock:#5c5662',
  trim: 'rock:#7c7486',
  floor: {
    grass: { variant: 'grass', tint: '#5f8862' },
    base: { variant: 'concrete', tint: '#6a6c70' },
    outpost: { variant: 'concrete', tint: '#76726b' },
    quarters: { variant: 'rubber', tint: '#4a4e56' },
    closet: { variant: 'plate', tint: '#4a4c50' },
    radar: { variant: 'concrete', tint: '#5e6066' },
  },
  defaultFloor: { variant: 'grass', tint: '#5f8862' },
  light: '#e8e0ff',
  ambientSky: '#a49ad8',
  ambientGround: '#33402c',
  ambient: 1.5,
  lightScale: 0.85,
  grade: { hue: 0, sat: 0.06, bright: 0.02, contrast: 0.06 },
}

/** 餘燼衛星：灰黑岩、漂浮碎石、重力裝置環形光（室外：岩壁、岩地）*/
THEMES.cinder = {
  wall: 'rock:#4c4a49',
  wallAccent: '#ff8a3a',
  hull: 'rock:#3c3a39',
  trim: 'rock:#5c5a58',
  floor: {
    rock: { variant: 'rock', tint: '#5a5753' },
    crater: { variant: 'rock', tint: '#403d3b' },
    factory: { variant: 'plate', tint: '#40434a' },
  },
  defaultFloor: { variant: 'rock', tint: '#5a5753' },
  light: '#dfe6ff',
  ambientSky: '#5a6274',
  ambientGround: '#121214',
  ambient: 1.1,
  lightScale: 1,
  grade: { hue: 0, sat: -0.12, bright: 0, contrast: 0.1 },
}

/** 未識別物體：不安的紫綠、有機腔壁 */
THEMES.uo = {
  wall: 'flesh:#3a2a46',
  wallAccent: '#6dff9a',
  hull: 'flesh:#291d33',
  trim: 'flesh:#4a3a58',
  floor: {
    alien: { variant: 'rock', tint: '#3e3446' },
    code: { variant: 'tile', tint: '#263330' },
  },
  defaultFloor: { variant: 'rock', tint: '#3e3446' },
  light: '#c8a0ff',
  ambientSky: '#3a2650',
  ambientGround: '#0a1408',
  ambient: 1.0,
  lightScale: 0.8,
  grade: { hue: 0.05, sat: 0.1, bright: -0.02, contrast: 0.14 },
}

/** 黑鷗號海盜船：骯髒紅、拼裝鋼板 */
THEMES.pirate = {
  wall: '#6a4a44',
  wallAccent: '#ff4a3a',
  hull: '#1a1110',
  trim: '#8a5a4a',
  floor: {
    hangar: { variant: 'concrete', tint: '#4a403c' },
    quarters: { variant: 'rubber', tint: '#40342f' },
    bridge: { variant: 'tile', tint: '#3a2c2a' },
    corridor: { variant: 'grate', tint: '#3d3330' },
    cargo: { variant: 'plate', tint: '#463a34' },
    brig: { variant: 'grate', tint: '#3a302c' },
    engine: { variant: 'grate', tint: '#352c29' },
  },
  defaultFloor: { variant: 'plate', tint: '#463a34' },
  light: '#ffc0a8',
  ambientSky: '#40201a',
  ambientGround: '#080404',
  ambient: 1.05,
  lightScale: 0.95,
  grade: { hue: 0.02, sat: 0.08, bright: -0.02, contrast: 0.12 },
  dust: '#b07a5a',
}

export function theme(id: string): Theme {
  return THEMES[id] ?? THEMES.nyx
}
