// 場景佈置（美術聖經 §7 密度規則）：每間房一個辨識主道具（靠牆）、牆邊中型雜物、牆頂管線與線槽、地面細節（刮痕、髒污、
// 胎痕、油漬、水漬、排水蓋、噴漆編號、標線、警示斜紋、地面電纜）。
//
// 硬性限制（sim 的碰撞與尋路不變，單位會穿過這裡加的任何東西）：
// - 可走的地面上只放貼地的東西（≤ 0.15 m）：貼花、電纜、電纜護橋；
// - 高的東西只貼著牆（離牆面 ≤ 0.36 m：單位半徑 0.4，圓心到不了）或在頭頂（2.1 m 以上、貼牆的管線）；
// - 不蓋門、設施、道具、房名：門口兩格、設施與道具周圍一格不放牆邊雜物，貼花避開設施光圈、門口斜紋、房名、停機坪；
// - 南牆（背對鏡頭）的內側看不到，不放東西。
// 依畫質分級（detailTier）：low 只有少量雜物與貼花（材質盡量和站內道具共用，draw call 幾乎不變）；medium 多一些、接觸陰影；
// high／ultra 才有燈下光柱、光柱裡的浮塵、濕地反光、牆腳接觸陰影。
// 全部由站點 id 與房間 index 決定的亂數產生（同一種房間在不同站、不同位置長得不一樣；分段建站與同步建站結果相同）。
import * as THREE from 'three'
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js'
import { Cell, type ParsedLayout, type RoomInstance } from '../shared/layout'
import { Batcher, box, cyl, rbox, sphere, torus } from './batch'
import { FILL_SCALE, Mat, fogUniforms, withFog } from './materials'
import { ATLAS, atlasRect, dressAtlas, emblemTex, screenTex } from './tex'
import { quality } from './quality'
import type { Theme } from './themes'
import type { Steps } from './steps'
import type { Animated } from './props'

/** 場景細節等級：0 low、1 medium、2 high、3 ultra */
export type Tier = 0 | 1 | 2 | 3
export function detailTier(): Tier {
  return ({ low: 0, medium: 1, high: 2, ultra: 3 } as const)[quality.value] ?? 1
}

export interface DressCtx {
  /** 站點 id 的雜湊（亂數種子）*/
  seed: number
  l: ParsedLayout
  th: Theme
  group: THREE.Group
  /** 站內道具的 Batcher：牆邊雜物用同樣的材質時直接合併，不多 draw call */
  props: Batcher
  anim: Animated[]
  cellAt(col: number, row: number): Cell
  /** 牆格被斜切（牆面是斜的）*/
  cut(i: number): boolean
  /** 房名地貼的中心（sim 公尺），key = 房間 index */
  labels: Map<number, { x: number; y: number }>
  outdoor: boolean
  tier: Tier
}

// ───── 亂數 ─────

function mulberry(seed: number): () => number {
  let a = seed >>> 0
  return () => {
    a = (a + 0x6d2b79f5) >>> 0
    let t = a
    t = Math.imul(t ^ (t >>> 15), t | 1)
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61)
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
}

type Rng = () => number
const pick = <T>(r: Rng, a: readonly T[]): T => a[Math.floor(r() * a.length) % a.length]
const range = (r: Rng, a: number, b: number) => a + (b - a) * r()

// ───── 房間分類 ─────

type Fam = 'crew' | 'mess' | 'ops' | 'med' | 'lab' | 'power' | 'ind' | 'mil' | 'pen' | 'corr' | 'decay'

const FAMILY: Record<string, Fam> = {
  quarters: 'crew',
  lounge: 'crew',
  captain: 'crew',
  commissary: 'mess',
  outpost: 'mess',
  bridge: 'ops',
  radar: 'ops',
  comms: 'ops',
  teleport: 'ops',
  medbay: 'med',
  lab: 'lab',
  gitlab: 'lab',
  power: 'power',
  reactor: 'power',
  engine: 'power',
  hangar: 'ind',
  dronebay: 'ind',
  cargo: 'ind',
  closet: 'ind',
  pods: 'ind',
  foundry: 'ind',
  factory: 'ind',
  furnace: 'ind',
  conveyor: 'ind',
  airlock: 'ind',
  dropbay: 'ind',
  brig: 'mil',
  cannon: 'mil',
  armory: 'mil',
  cell: 'pen',
  corridor: 'corr',
  derelict: 'decay',
  base: 'ind',
  cabin: 'corr',
}

/** 'x' 道具超過 2 m 的房間類型（頭頂管線不從它們上方經過）*/
const TALL_PROPS = new Set(['lab', 'comms', 'cannon', 'reactor', 'airlock', 'dropbay', 'teleport', 'foundry', 'code', 'brig', 'grass', 'outpost'])

/** 工業感的房間：胎痕、油漬、地面標線 */
const INDUSTRIAL = new Set<Fam>(['ind', 'mil', 'power', 'decay'])

// ───── 材質（每座站一組，盡量用材質庫快取的共用材質）─────

interface Palette {
  frame: THREE.Material
  body: THREE.Material
  paint: THREE.Material
  paint2: THREE.Material
  light: THREE.Material
  rubber: THREE.Material
  pipe: THREE.Material
  warn: THREE.Material
  red: THREE.Material
  brass: THREE.Material
  led: THREE.Material
  warm: THREE.Material
  green: THREE.Material
}

/**
 * low 的材質收斂成幾種（paint2→paint、pipe→frame、brass→warn、暖色與綠色燈→主題燈色）：
 * frame（= 窗框飾條）、body（= 牆頂船殼）、light、rubber 和站內道具同一個材質，併進同一個 mesh，不多 draw call。
 */
function palette(th: Theme, outdoor: boolean, tier: Tier): Palette {
  const p = fullPalette(th, outdoor)
  if (tier > 0) return p
  return { ...p, paint2: p.paint, pipe: p.frame, brass: p.warn, warm: p.led, green: p.led }
}

function fullPalette(th: Theme, outdoor: boolean): Palette {
  const d = th.dress ?? {}
  const trim = outdoor || th.trim.includes(':') ? (th.built?.trim ?? '#9aa0a6') : th.trim
  const hull = outdoor || th.hull.includes(':') ? (th.built?.cap ?? '#48494c') : th.hull
  const decay = !!d.decay
  return {
    frame: decay ? Mat.metal('#5a4a3e', 0.5) : Mat.metal(trim, 0.5, false),
    body: Mat.metal(hull, 0.6),
    paint: Mat.paint(d.paint ?? '#5a6470', decay ? 0.85 : 0.5),
    paint2: Mat.paint(d.paint2 ?? '#56624a', 0.6),
    light: decay ? Mat.paint('#8a7a66', 0.8) : Mat.paint('#c9d1d8', 0.45),
    rubber: Mat.rubber(),
    pipe: Mat.metal(d.pipe ?? '#7a848c', 0.7, false),
    warn: Mat.paint(decay ? '#9a7a2a' : '#c9a23a', 0.6),
    red: Mat.paint(decay ? '#7a3a2a' : '#a8322a', 0.45),
    brass: Mat.metal('#a8844a', 0.85, false),
    led: Mat.emissive(th.wallAccent, 2.4),
    warm: Mat.emissive('#ffb46b', 2.2),
    green: Mat.emissive('#5cf2a5', 2.4),
  }
}

// ───── 牆面座標系 ─────

/** 牆面上的一點：(x, y) sim 公尺、(nx, ny) 指向房間的法線、(tx, ty) 沿牆切線；rot = three 的 rotY（local +Z = 法線）*/
interface Frame {
  x: number
  y: number
  nx: number
  ny: number
  tx: number
  ty: number
  rot: number
}

function frameOf(x: number, y: number, nx: number, ny: number): Frame {
  const rot = Math.atan2(nx, -ny)
  return { x, y, nx, ny, tx: Math.cos(rot), ty: Math.sin(rot), rot }
}

const _m = new THREE.Matrix4()
const _q = new THREE.Quaternion()
const _e = new THREE.Euler(0, 0, 0, 'YXZ')
const _p = new THREE.Vector3()
const _s = new THREE.Vector3()

/** 零件組裝：牆面座標（a = 沿牆、y = 高、o = 離牆面）放進 Batcher */
class Kit {
  f!: Frame
  constructor(
    readonly b: Batcher,
    readonly pal: Palette,
    readonly tier: Tier,
  ) {}
  at(f: Frame): this {
    this.f = f
    return this
  }
  p(geo: THREE.BufferGeometry, mat: THREE.Material, a: number, y: number, o: number, ry = 0, rx = 0, rz = 0, sx = 1, sy = 1, sz = 1): void {
    const f = this.f
    _e.set(rx, f.rot + ry, rz, 'YXZ')
    _q.setFromEuler(_e)
    _m.compose(_p.set(f.x + f.tx * a + f.nx * o, y, -(f.y + f.ty * a + f.ny * o)), _q, _s.set(sx, sy, sz))
    this.b.addMatrix(geo, mat, _m)
  }
}

const ALONG = Math.PI / 2 // rz：Y 軸的圓柱放倒成沿牆（local X）
const OUTWARD = Math.PI / 2 // rx：放倒成垂直牆面（local Z）

// ───── 牆邊雜物（深度 ≤ 0.36 m）─────

type Item = (k: Kit, a: number, r: Rng) => void
interface ItemDef {
  w: number
  f: Item
}

/** 一或兩個淺置物櫃 */
function lockers(k: Kit, a: number, n: number, r: Rng, mat = k.pal.paint): void {
  const W = 0.5
  for (let i = 0; i < n; i++) {
    const x = a + (i - (n - 1) / 2) * (W + 0.02)
    const h = 1.95
    k.p(box(W, h, 0.3), mat, x, h / 2, 0.15)
    k.p(box(W - 0.06, h - 0.2, 0.02), mat, x, h / 2 + 0.04, 0.31)
    k.p(box(W, 0.08, 0.31), k.pal.body, x, 0.04, 0.155)
    for (const vy of [1.74, 1.69, 1.64, 0.36, 0.31]) k.p(box(0.24, 0.018, 0.012), k.pal.body, x, vy, 0.322)
    k.p(box(0.025, 0.16, 0.03), k.pal.frame, x + 0.16, 1.05, 0.33)
    k.p(box(0.13, 0.045, 0.006), r() < 0.7 ? k.pal.light : k.pal.warn, x, 1.5, 0.322)
    if (k.tier >= 2 && r() < 0.35) k.p(rbox(0.32, 0.16, 0.24, 0.05), k.pal.paint2, x + range(r, -0.06, 0.06), h + 0.08, 0.15, range(r, -0.3, 0.3))
  }
}

/** 牆架：直柱＋層板＋小箱子（實驗室放發光標本瓶）*/
function shelf(k: Kit, a: number, w: number, r: Rng, jars: THREE.Material[] | null): void {
  const H = 1.75
  for (const dx of [-w / 2 + 0.02, w / 2 - 0.02]) for (const o of [0.03, 0.29]) k.p(box(0.03, H, 0.03), k.pal.frame, a + dx, H / 2, o)
  const levels = [0.35, 0.8, 1.25, 1.7]
  for (const y of levels) k.p(box(w, 0.025, 0.31), k.pal.frame, a, y, 0.16)
  const cols = [k.pal.paint2, k.pal.light, k.pal.paint, k.pal.warn]
  for (const y of levels.slice(0, 3)) {
    let x = -w / 2 + 0.08
    while (x < w / 2 - 0.12) {
      if (jars && r() < 0.6) {
        const jr = 0.05 + r() * 0.02
        const jh = 0.14 + r() * 0.1
        k.p(cyl(jr, jr, jh, 8), pick(r, jars), a + x + jr, y + 0.013 + jh / 2, 0.16)
        k.p(cyl(jr + 0.006, jr + 0.006, 0.03, 8), k.pal.frame, a + x + jr, y + 0.013 + jh + 0.015, 0.16)
        x += jr * 2 + 0.04 + r() * 0.06
      } else if (r() < 0.75) {
        const bw = 0.12 + r() * 0.16
        const bh = 0.1 + r() * 0.2
        k.p(box(bw, bh, 0.22 + r() * 0.05), pick(r, cols), a + x + bw / 2, y + 0.013 + bh / 2, 0.15, range(r, -0.08, 0.08))
        x += bw + 0.03 + r() * 0.08
      } else x += 0.15
    }
  }
}

/** 接線盒：箱體＋往上接到牆頂線槽的導管＋指示燈 */
function panel(k: Kit, a: number, r: Rng): void {
  const w = 0.42 + r() * 0.16
  const h = 0.5 + r() * 0.2
  const y = 1.1 + r() * 0.3
  k.p(box(w, h, 0.14), k.pal.body, a, y, 0.07)
  k.p(box(w - 0.06, h - 0.06, 0.012), k.pal.paint, a, y, 0.145)
  k.p(box(0.16, 0.1, 0.006), k.pal.warn, a - w / 4, y + h / 2 - 0.1, 0.153)
  k.p(box(0.03, 0.03, 0.012), r() < 0.5 ? k.pal.led : k.pal.warm, a + w / 2 - 0.08, y + h / 2 - 0.08, 0.155)
  const top = y + h / 2
  for (const dx of [-0.1, 0.06]) k.p(cyl(0.022, 0.022, 2.32 - top, 6), k.pal.frame, a + dx, (2.32 + top) / 2, 0.05)
  if (k.tier >= 1) k.p(cyl(0.02, 0.02, y - h / 2, 6), k.pal.rubber, a + w / 2 - 0.06, (y - h / 2) / 2, 0.05)
}

/** 直立管線：兩根管＋法蘭＋閥門手輪 */
function pipesV(k: Kit, a: number, r: Rng): void {
  const r1 = 0.05 + r() * 0.015
  k.p(cyl(r1, r1, 2.32, 10), k.pal.pipe, a, 1.16, 0.09)
  k.p(cyl(0.032, 0.032, 2.32, 8), k.pal.pipe, a + 0.17, 1.16, 0.06)
  for (const y of [0.25, 1.6]) k.p(cyl(r1 + 0.025, r1 + 0.025, 0.06, 10), k.pal.frame, a, y, 0.09)
  const vy = 0.9 + r() * 0.4
  k.p(cyl(r1 + 0.02, r1 + 0.02, 0.16, 10), k.pal.body, a, vy, 0.09)
  k.p(cyl(0.015, 0.015, 0.14, 6), k.pal.frame, a, vy, 0.2, 0, OUTWARD)
  k.p(torus(0.09, 0.012, 5, 16), k.pal.red, a, vy, 0.27)
  for (const y of [0.6, 1.9]) k.p(box(0.34, 0.05, 0.1), k.pal.body, a + 0.08, y, 0.05)
}

/** 滅火器（含牆上托架與上方標示）*/
function extinguisher(k: Kit, a: number): void {
  k.p(box(0.18, 0.06, 0.08), k.pal.body, a, 0.5, 0.04)
  k.p(cyl(0.075, 0.075, 0.46, 10), k.pal.red, a, 0.68, 0.11)
  k.p(sphere(0.075, 10, 6), k.pal.red, a, 0.91, 0.11, 0, 0, 0, 1, 0.5, 1)
  k.p(box(0.04, 0.08, 0.05), k.pal.body, a, 0.97, 0.11)
  k.p(cyl(0.012, 0.012, 0.3, 5), k.pal.rubber, a + 0.08, 0.82, 0.13, 0, 0, 0.3)
  k.p(box(0.2, 0.2, 0.008), k.pal.red, a, 1.3, 0.004)
  k.p(box(0.12, 0.05, 0.004), k.pal.light, a, 1.3, 0.01)
}

/** 立著的電纜捲盤（軸垂直牆面，深 0.26 m）*/
function reel(k: Kit, a: number, r: Rng): void {
  const R = 0.26 + r() * 0.08
  for (const o of [0.03, 0.27]) k.p(cyl(R, R, 0.025, 14), k.pal.paint2, a, R, o, 0, OUTWARD)
  k.p(cyl(R * 0.45, R * 0.45, 0.24, 10), k.pal.body, a, R, 0.15, 0, OUTWARD)
  k.p(torus(R * 0.68, R * 0.22, 6, 14), k.pal.rubber, a, R, 0.15)
  k.p(cyl(0.02, 0.02, 0.5, 5), k.pal.rubber, a + R * 0.8, 0.05, 0.25, 0, 0, ALONG + 0.15)
}

/** 疊起來的小貨箱（貼牆，深 ≤ 0.36）*/
function crates(k: Kit, a: number, r: Rng): void {
  let y = 0
  let x = a
  const n = 1 + Math.floor(r() * 3)
  for (let i = 0; i < n; i++) {
    const w = 0.42 + r() * 0.2
    const h = 0.26 + r() * 0.16
    const m = i % 2 ? k.pal.paint2 : r() < 0.5 ? k.pal.paint : k.pal.warn
    const ry = range(r, -0.08, 0.08)
    k.p(box(w, h, 0.32), m, x, y + h / 2, 0.17, ry)
    k.p(box(w + 0.01, 0.04, 0.33), k.pal.body, x, y + h * 0.7, 0.17, ry)
    if (k.tier >= 1) k.p(box(0.12, 0.08, 0.004), k.pal.light, x - w * 0.2, y + h * 0.4, 0.335, ry)
    y += h
    x += range(r, -0.08, 0.08)
  }
}

/** 窄工具推車（深 0.32）*/
function cart(k: Kit, a: number, r: Rng): void {
  const w = 0.7
  for (const dx of [-w / 2 + 0.03, w / 2 - 0.03]) for (const o of [0.04, 0.3]) k.p(box(0.025, 0.82, 0.025), k.pal.frame, a + dx, 0.47, o)
  for (const y of [0.18, 0.55, 0.86]) k.p(box(w, 0.03, 0.3), y > 0.8 ? k.pal.red : k.pal.frame, a, y, 0.17)
  for (const dx of [-w / 2 + 0.05, w / 2 - 0.05]) for (const o of [0.06, 0.28]) k.p(cyl(0.045, 0.045, 0.03, 8), k.pal.rubber, a + dx, 0.045, o, 0, 0, ALONG)
  k.p(cyl(0.015, 0.015, w, 6), k.pal.frame, a, 0.95, 0.32, 0, 0, ALONG)
  for (let i = 0; i < 3; i++) k.p(box(0.1 + r() * 0.12, 0.06 + r() * 0.1, 0.18), pick(r, [k.pal.paint2, k.pal.body, k.pal.warn]), a - 0.2 + i * 0.2, 0.62, 0.17, range(r, -0.2, 0.2))
}

/** 氣瓶（2–3 支，鏈條固定在牆上；適合牆角）*/
function canisters(k: Kit, a: number, r: Rng): void {
  const n = 2 + Math.floor(r() * 2)
  const cols = [k.pal.paint2, k.pal.light, k.pal.paint, k.pal.red]
  for (let i = 0; i < n; i++) {
    const x = a + (i - (n - 1) / 2) * 0.22
    const h = 1.1 + r() * 0.3
    const m = pick(r, cols)
    k.p(cyl(0.1, 0.1, h, 10), m, x, h / 2, 0.13)
    k.p(sphere(0.1, 10, 6), m, x, h, 0.13, 0, 0, 0, 1, 0.6, 1)
    k.p(cyl(0.035, 0.035, 0.12, 6), k.pal.frame, x, h + 0.1, 0.13)
  }
  k.p(box(n * 0.22 + 0.06, 0.03, 0.02), k.pal.frame, a, 0.9, 0.24)
  k.p(box(n * 0.22 + 0.06, 0.04, 0.05), k.pal.body, a, 0.9, 0.02)
}

/** 垃圾桶（牆角）*/
function bin(k: Kit, a: number, r: Rng): void {
  const m = r() < 0.5 ? k.pal.paint : k.pal.paint2
  k.p(cyl(0.16, 0.14, 0.5, 12), m, a, 0.25, 0.18)
  k.p(cyl(0.17, 0.17, 0.04, 12), k.pal.body, a, 0.52, 0.18)
}

/** 消防水帶箱 */
function hosebox(k: Kit, a: number): void {
  k.p(box(0.55, 0.65, 0.18), k.pal.red, a, 1.05, 0.09)
  k.p(box(0.45, 0.5, 0.01), k.pal.body, a, 1.05, 0.185)
  k.p(torus(0.15, 0.04, 6, 14), k.pal.light, a, 1.05, 0.2)
  k.p(box(0.3, 0.06, 0.006), k.pal.light, a, 1.45, 0.012)
}

/** 牆上終端機（螢幕）*/
function terminal(k: Kit, a: number, scr: THREE.Material): void {
  k.p(box(0.62, 0.44, 0.06), k.pal.body, a, 1.4, 0.03)
  k.p(new THREE.PlaneGeometry(0.54, 0.36), scr, a, 1.4, 0.062)
  k.p(box(0.5, 0.06, 0.16), k.pal.frame, a, 1.08, 0.08, 0, 0.35)
  k.p(cyl(0.015, 0.015, 1.05, 5), k.pal.rubber, a + 0.25, 0.53, 0.03)
}

/** 牆腳通風口 */
function vent(k: Kit, a: number): void {
  k.p(box(0.62, 0.32, 0.03), k.pal.body, a, 0.3, 0.015)
  for (let i = 0; i < 5; i++) k.p(box(0.54, 0.02, 0.03), k.pal.frame, a, 0.18 + i * 0.06, 0.035, 0, -0.5)
}

/** 單一配電櫃（高）*/
function breaker(k: Kit, a: number, r: Rng): void {
  k.p(box(0.62, 2.0, 0.3), k.pal.paint, a, 1.0, 0.15)
  k.p(box(0.56, 1.8, 0.02), k.pal.body, a, 1.02, 0.305)
  k.p(box(0.18, 0.12, 0.006), k.pal.warn, a, 1.62, 0.318)
  k.p(box(0.04, 0.22, 0.05), k.pal.red, a + 0.18, 1.15, 0.33, 0, 0, r() < 0.5 ? 0.4 : -0.4)
  for (let i = 0; i < 3; i++) k.p(box(0.035, 0.035, 0.02), i === 0 ? k.pal.green : i === 1 ? k.pal.warm : k.pal.led, a - 0.18 + i * 0.07, 1.42, 0.32)
  for (const dx of [-0.15, 0.12]) k.p(cyl(0.035, 0.035, 0.32, 8), k.pal.frame, a + dx, 2.16, 0.15)
}

/** 彈藥架上一排直立的砲彈 */
function shellRow(k: Kit, a: number, w: number, y: number): void {
  for (let x = -w / 2 + 0.09; x <= w / 2 - 0.09; x += 0.17) {
    k.p(cyl(0.065, 0.065, 0.42, 10), k.pal.brass, a + x, y + 0.21, 0.17)
    k.p(cyl(0.012, 0.065, 0.16, 10), k.pal.body, a + x, y + 0.5, 0.17)
    k.p(cyl(0.068, 0.068, 0.03, 10), k.pal.warn, a + x, y + 0.36, 0.17)
  }
}

// ───── 每一類房間的主道具（貼北牆＝鏡頭看得到的牆，寬 w 以內）─────

type Hero = (k: Kit, w: number, r: Rng, ctx: HeroCtx) => void
interface HeroCtx {
  screens: THREE.Material[]
  jars: THREE.Material[]
}

const HEROES: Partial<Record<Fam, { min: number; max: number; f: Hero }>> = {
  crew: {
    min: 2,
    max: 3.6,
    f(k, w, r) {
      const n = Math.max(3, Math.min(7, Math.floor(w / 0.52)))
      lockers(k, 0, n, r)
    },
  },
  mess: {
    min: 2,
    max: 3.2,
    f(k, w, r, c) {
      const wb = Math.min(w, 2.8)
      k.p(box(wb, 0.78, 0.06), k.pal.body, 0, 1.98, 0.03)
      k.p(new THREE.PlaneGeometry(wb - 0.12, 0.64), c.screens[0], 0, 1.98, 0.062)
      const m = Math.max(2, Math.min(4, Math.floor(wb / 0.62)))
      for (let i = 0; i < m; i++) {
        const x = (i - (m - 1) / 2) * 0.62
        k.p(box(0.54, 1.3, 0.32), k.pal.light, x, 0.65, 0.16)
        k.p(box(0.36, 0.32, 0.02), k.pal.body, x, 0.8, 0.325)
        k.p(box(0.38, 0.03, 0.012), i % 2 ? k.pal.warm : k.pal.led, x, 1.12, 0.326)
        k.p(cyl(0.025, 0.025, 0.08, 6), k.pal.frame, x, 0.92, 0.3)
        k.p(box(0.4, 0.025, 0.1), k.pal.frame, x, 0.55, 0.3)
        k.p(box(0.4, 0.2, 0.01), k.pal.paint, x, 0.25, 0.325)
      }
      // 托盤堆
      for (let i = 0; i < 4; i++) k.p(box(0.38, 0.018, 0.27), k.pal.paint2, (m / 2) * 0.62 - 0.31 + range(r, -0.02, 0.02), 1.31 + i * 0.02, 0.16, range(r, -0.05, 0.05))
    },
  },
  ops: {
    min: 2,
    max: 3.4,
    f(k, w, r, c) {
      const wv = Math.min(w, 3.2)
      const cols = Math.max(2, Math.round(wv / 1.0))
      const cw = wv / cols
      k.p(box(wv + 0.08, 1.32, 0.05), k.pal.body, 0, 1.62, 0.025)
      for (let i = 0; i < cols; i++)
        for (let j = 0; j < 2; j++) k.p(new THREE.PlaneGeometry(cw - 0.08, 0.56), c.screens[(i + j) % c.screens.length], (i - (cols - 1) / 2) * cw, 1.31 + j * 0.62, 0.053)
      k.p(box(wv * 0.8, 0.06, 0.26), k.pal.frame, 0, 0.92, 0.13, 0, 0.25)
      for (let i = 0; i < 6; i++) k.p(box(0.035, 0.035, 0.02), i % 3 ? k.pal.led : k.pal.warm, -wv * 0.3 + i * wv * 0.12, 0.95, 0.24)
      for (let i = 0; i < 3; i++) k.p(cyl(0.018, 0.018, 0.96, 5), k.pal.rubber, wv / 2 - 0.08 - i * 0.045, 0.48, 0.04)
      void r
    },
  },
  med: {
    min: 2,
    max: 3.2,
    f(k, w, r) {
      const n = Math.max(2, Math.min(5, Math.floor(w / 0.62)))
      for (let i = 0; i < n; i++) {
        const x = (i - (n - 1) / 2) * 0.62
        k.p(box(0.6, 0.72, 0.32), k.pal.light, x, 1.68, 0.16)
        k.p(box(0.005, 0.66, 0.012), k.pal.body, x, 1.68, 0.326)
        k.p(box(0.12, 0.02, 0.03), k.pal.frame, x - 0.08, 1.4, 0.33)
        k.p(box(0.6, 0.8, 0.3), k.pal.light, x, 0.4, 0.15)
        k.p(box(0.56, 0.02, 0.012), k.pal.body, x, 0.62, 0.305)
      }
      const mid = 0
      k.p(box(0.26, 0.08, 0.01), k.pal.green, mid, 1.72, 0.33)
      k.p(box(0.08, 0.26, 0.01), k.pal.green, mid, 1.72, 0.33)
      k.p(box(0.6 * n, 0.04, 0.34), k.pal.frame, 0, 0.82, 0.17)
      // 除顫器與牆上監視器
      const ex = ((n - 1) / 2) * 0.62 + 0.5
      if (w / 2 > ex + 0.2) {
        k.p(box(0.3, 0.38, 0.14), k.pal.warn, ex, 1.25, 0.07)
        k.p(box(0.16, 0.06, 0.006), k.pal.green, ex, 1.32, 0.143)
      }
      void r
    },
  },
  lab: {
    min: 2,
    max: 3.2,
    f(k, w, r, c) {
      const n = w >= 2.3 ? 2 : 1
      for (let i = 0; i < n; i++) shelf(k, (i - (n - 1) / 2) * 1.12, 1.05, r, c.jars)
    },
  },
  power: {
    min: 2,
    max: 3.2,
    f(k, w, r) {
      const n = Math.max(2, Math.min(4, Math.floor(w / 0.7)))
      for (let i = 0; i < n; i++) breaker(k, (i - (n - 1) / 2) * 0.68, r)
      k.p(box(0.68 * n + 0.1, 0.12, 0.2), k.pal.body, 0, 2.28, 0.1)
      k.p(box(0.68 * n, 0.03, 0.006), k.pal.warn, 0, 2.26, 0.203)
    },
  },
  ind: {
    min: 2,
    max: 3,
    f(k, w, r) {
      const wt = Math.min(w, 2.6)
      k.p(box(wt, 1.0, 0.03), k.pal.body, 0, 1.55, 0.015)
      k.p(box(wt - 0.06, 0.94, 0.006), k.pal.paint2, 0, 1.55, 0.033)
      // 掛在洞洞板上的工具剪影
      let x = -wt / 2 + 0.15
      while (x < wt / 2 - 0.15) {
        const t = r()
        if (t < 0.35) {
          k.p(box(0.035, 0.3, 0.015), k.pal.frame, x, 1.55, 0.045, 0, 0, range(r, -0.1, 0.1))
          k.p(box(0.09, 0.05, 0.016), k.pal.frame, x, 1.72, 0.045)
        } else if (t < 0.65) {
          k.p(box(0.03, 0.26, 0.02), k.pal.red, x, 1.5, 0.045)
          k.p(box(0.13, 0.045, 0.03), k.pal.frame, x, 1.65, 0.05)
        } else k.p(torus(0.08, 0.015, 5, 12), k.pal.rubber, x, 1.6, 0.045)
        x += 0.16 + r() * 0.12
      }
      // 工具櫃（抽屜）
      const cx = -wt / 2 + 0.4
      k.p(box(0.72, 0.92, 0.34), k.pal.red, cx, 0.46, 0.17)
      for (let i = 0; i < 5; i++) {
        k.p(box(0.68, 0.006, 0.006), k.pal.body, cx, 0.2 + i * 0.15, 0.343)
        k.p(box(0.2, 0.02, 0.02), k.pal.frame, cx, 0.27 + i * 0.15, 0.35)
      }
      if (wt > 1.8) reel(k, wt / 2 - 0.35, r)
    },
  },
  mil: {
    min: 2,
    max: 3.4,
    f(k, w, r) {
      const wr = Math.min(w, 3)
      for (const dx of [-wr / 2 + 0.02, 0, wr / 2 - 0.02]) for (const o of [0.03, 0.31]) k.p(box(0.04, 1.75, 0.04), k.pal.frame, dx, 0.875, o)
      for (const y of [0.08, 0.66, 1.24]) {
        k.p(box(wr, 0.04, 0.34), k.pal.frame, 0, y, 0.17)
        shellRow(k, -wr / 4, wr / 2 - 0.08, y + 0.02)
        if (r() < 0.75) shellRow(k, wr / 4, wr / 2 - 0.08, y + 0.02)
      }
      k.p(box(wr, 0.08, 0.36), k.pal.body, 0, 1.78, 0.18)
      k.p(box(0.4, 0.12, 0.006), k.pal.warn, 0, 1.78, 0.363)
    },
  },
  pen: {
    min: 2,
    max: 3,
    f(k, w, r) {
      // 餵食／沖洗站：橫向閥門歧管＋水帶捲盤＋飼料斗
      const wm = Math.min(w, 2.6)
      k.p(cyl(0.06, 0.06, wm, 10), k.pal.pipe, 0, 1.25, 0.12, 0, 0, ALONG)
      for (let i = 0; i < 3; i++) {
        const x = (i - 1) * wm * 0.3
        k.p(cyl(0.04, 0.04, 1.2, 8), k.pal.pipe, x, 0.62, 0.12)
        k.p(torus(0.08, 0.012, 5, 14), k.pal.red, x, 1.25, 0.22)
        k.p(cyl(0.015, 0.015, 0.1, 5), k.pal.frame, x, 1.25, 0.17, 0, OUTWARD)
      }
      reel(k, wm / 2 - 0.3, r)
      k.p(box(0.5, 0.6, 0.32), k.pal.warn, -wm / 2 + 0.3, 0.9, 0.16)
      k.p(box(0.3, 0.3, 0.2), k.pal.warn, -wm / 2 + 0.3, 0.45, 0.12, 0, -0.4)
      k.p(box(0.52, 0.04, 0.33), k.pal.body, -wm / 2 + 0.3, 1.22, 0.165)
    },
  },
  decay: {
    min: 2,
    max: 3,
    f(k, w, r) {
      const n = Math.max(2, Math.min(5, Math.floor(w / 0.52)))
      for (let i = 0; i < n; i++) {
        if (r() < 0.25) continue
        lockers(k, (i - (n - 1) / 2) * 0.52, 1, r)
      }
    },
  },
}

/** 各類房間牆邊雜物的候選（寬度、組裝函式），亂數挑 */
function itemsFor(f: Fam, c: HeroCtx): ItemDef[] {
  const L: ItemDef = { w: 1.06, f: (k, a, r) => lockers(k, a, 2, r) }
  const SH: ItemDef = { w: 1.0, f: (k, a, r) => shelf(k, a, 0.9, r, null) }
  const JAR: ItemDef = { w: 1.0, f: (k, a, r) => shelf(k, a, 0.9, r, c.jars) }
  const PN: ItemDef = { w: 0.6, f: panel }
  const PV: ItemDef = { w: 0.45, f: pipesV }
  const EX: ItemDef = { w: 0.3, f: (k, a) => extinguisher(k, a) }
  const RL: ItemDef = { w: 0.7, f: reel }
  const CR: ItemDef = { w: 0.7, f: crates }
  const CT: ItemDef = { w: 0.75, f: cart }
  const CN: ItemDef = { w: 0.7, f: canisters }
  const BN: ItemDef = { w: 0.4, f: bin }
  const HB: ItemDef = { w: 0.6, f: (k, a) => hosebox(k, a) }
  const TM: ItemDef = { w: 0.7, f: (k, a, r) => terminal(k, a, pick(r, c.screens)) }
  const VT: ItemDef = { w: 0.65, f: (k, a) => vent(k, a) }
  const BR: ItemDef = { w: 0.65, f: breaker }
  switch (f) {
    case 'crew':
      return [L, L, SH, BN, VT, EX]
    case 'mess':
      return [BN, CR, CT, SH, VT, EX, TM]
    case 'ops':
      return [PN, TM, TM, PV, VT, EX]
    case 'med':
      return [EX, BN, CT, PN, SH, TM]
    case 'lab':
      return [JAR, CN, PN, SH, TM, EX]
    case 'power':
      return [PN, PV, PV, CN, RL, BR]
    case 'ind':
      return [CR, CR, RL, CT, CN, PN, PV, HB, EX]
    case 'mil':
      return [CR, CR, PN, EX, L, PV]
    case 'pen':
      return [HB, PV, BN, RL, PN]
    case 'corr':
      return [EX, PN, VT, PV, HB]
    case 'decay':
      return [CR, CR, RL, CN, PN, VT, BN]
  }
}

// ───── 地面貼花（圖集，整站一個 mesh）─────

type RGBA = [number, number, number, number]

class Decals {
  pos: number[] = []
  uv: number[] = []
  col: number[] = []
  idx: number[] = []
  /** 一片貼花：中心 (x, y) sim 公尺、寬 w × 高 h、角度 rot（逆時針，local +y = 貼圖上方）*/
  add(cell: number, x: number, y: number, w: number, h: number, rot: number, c: RGBA, lift = 0.006, u0 = 0, u1 = 1): void {
    const [a0, b0, a1, b1] = cell < 0 ? [0, 0, 1, 1] : atlasRect(cell)
    const cs = Math.cos(rot)
    const sn = Math.sin(rot)
    const n = this.pos.length / 3
    for (const [lx, ly, u, v] of [
      [-w / 2, -h / 2, u0, 0],
      [w / 2, -h / 2, u1, 0],
      [w / 2, h / 2, u1, 1],
      [-w / 2, h / 2, u0, 1],
    ]) {
      const px = x + lx * cs - ly * sn
      const py = y + lx * sn + ly * cs
      this.pos.push(px, lift, -py)
      this.uv.push(a0 + (a1 - a0) * u, b0 + (b1 - b0) * v)
      this.col.push(c[0], c[1], c[2], c[3])
    }
    this.idx.push(n, n + 1, n + 2, n, n + 2, n + 3)
  }
  build(group: THREE.Object3D, mat: THREE.Material, order = -1): THREE.Mesh | null {
    if (!this.idx.length) return null
    const g = new THREE.BufferGeometry()
    g.setAttribute('position', new THREE.Float32BufferAttribute(this.pos, 3))
    g.setAttribute('normal', new THREE.Float32BufferAttribute(new Float32Array(this.pos.length).map((_, i) => (i % 3 === 1 ? 1 : 0)), 3))
    g.setAttribute('uv', new THREE.Float32BufferAttribute(this.uv, 2))
    g.setAttribute('color', new THREE.Float32BufferAttribute(this.col, 4))
    g.setIndex(this.idx)
    g.computeBoundingSphere()
    const m = new THREE.Mesh(g, mat)
    m.renderOrder = order
    m.matrixAutoUpdate = false
    m.receiveShadow = false
    m.castShadow = false
    group.add(m)
    return m
  }
}

let decalMat: THREE.MeshBasicMaterial | null = null
/** 地面貼花材質（圖集 × 頂點色 RGBA；污漬是深色、油漆是亮色）：所有站共用、不 dispose */
function decalMaterial(): THREE.MeshBasicMaterial {
  if (!decalMat) {
    decalMat = withFog(new THREE.MeshBasicMaterial({ map: dressAtlas(), vertexColors: true, transparent: true, depthWrite: false, polygonOffset: true, polygonOffsetFactor: -2, polygonOffsetUnits: -2 }))
    decalMat.userData.keep = true
  }
  return decalMat
}

let emblemMat: THREE.MeshBasicMaterial | null = null
/** 地面徽記材質（頂點色 RGBA 染色）：共用、不 dispose */
function emblemMaterial(): THREE.MeshBasicMaterial {
  if (!emblemMat) {
    emblemMat = withFog(new THREE.MeshBasicMaterial({ map: emblemTex(), vertexColors: true, transparent: true, depthWrite: false, polygonOffset: true, polygonOffsetFactor: -2, polygonOffsetUnits: -2 }))
    emblemMat.userData.keep = true
  }
  return emblemMat
}

let sheenMat: THREE.MeshStandardMaterial | null = null
/** 高畫質的濕地反光：深色、極低粗糙度（點光源在水面上拉出高光）*/
function sheenMaterial(): THREE.MeshStandardMaterial {
  if (!sheenMat) {
    const m = new THREE.MeshStandardMaterial({ color: '#141a1a', map: dressAtlas(), vertexColors: true, roughness: 0.04, metalness: 0.2, transparent: true, depthWrite: false, polygonOffset: true, polygonOffsetFactor: -2, polygonOffsetUnits: -2 })
    // 沒有環境貼圖：用烘焙補光圖當「倒映的房間燈光」，斜看時（fresnel）更亮（vXcWorld、uFillTex 由 withFog 宣告）
    m.onBeforeCompile = (shader) => {
      shader.fragmentShader = shader.fragmentShader.replace(
        '#include <emissivemap_fragment>',
        `#include <emissivemap_fragment>
        {
          vec2 xcSp = vec2(vXcWorld.x, -vXcWorld.z);
          vec3 xcRf = texture2D(uFillTex, (xcSp - uFogRect.xy) / uFogRect.zw).rgb * ${FILL_SCALE.toFixed(1)} * uFillOn;
          float xcFr = pow(1.0 - abs(dot(normalize(vViewPosition), normal)), 2.0);
          totalEmissiveRadiance += xcRf * (0.06 + 0.3 * xcFr) * uFillTint;
        }`,
      )
    }
    m.customProgramCacheKey = () => 'xcsheen'
    sheenMat = withFog(m)
    sheenMat.userData.keep = true
  }
  return sheenMat
}

// ───── 主程式 ─────

const N = 0
const W_ = 2
const E_ = 3

interface Slot {
  col: number
  row: number
  dir: number
  /** 這一格牆面的中心 */
  f: Frame
}

interface Run {
  slots: Slot[]
  dir: number
  /** 兩端是凹角（沿牆方向接著是牆）*/
  cornerA: boolean
  cornerB: boolean
}

/** 佔用旗標 */
const F_FLOOR = 1
/** 貼花不要蓋到（設施光圈、門口斜紋、房名、停機坪）*/
const F_KEEP = 2
/** 道具與設施旁邊（牆邊雜物不放：道具常超出格子）*/
const F_PROP = 4
/** 門口兩格內（牆邊雜物不放）*/
const F_DOOR = 8

/**
 * 佈置一座站（分段：每一間房之後 yield）。牆邊雜物與牆頂管線併進 ctx.props（站內道具的 Batcher）；
 * 地面貼花、地面電纜、接觸陰影另外合併成幾個 mesh 加進 group。回傳「燈下光柱」要用的資料交給 dressLightsSteps。
 */
export function* dressStationSteps(ctx: DressCtx): Steps {
  const { l, th, tier } = ctx
  if (th.dress?.off) return
  const W = l.w
  const H = l.h
  const occ = new Uint8Array(W * H)
  const inb = (c: number, r: number) => c >= 0 && r >= 0 && c < W && r < H
  const mark = (c: number, r: number, rad: number, f: number) => {
    for (let dr = -rad; dr <= rad; dr++) for (let dc = -rad; dc <= rad; dc++) if (inb(c + dc, r + dr)) occ[(r + dr) * W + c + dc] |= f
  }
  for (let r = 0; r < H; r++) {
    for (let c = 0; c < W; c++) {
      const k = l.cells[r * W + c] as Cell
      if (k === Cell.Floor || k === Cell.Hazard) occ[r * W + c] |= F_FLOOR
      else if (k === Cell.Crate || k === Cell.Fixture) mark(c, r, 1, F_PROP)
      else if (k === Cell.Door) {
        mark(c, r, 2, F_DOOR)
        mark(c, r, 1, F_KEEP)
      }
    }
  }
  for (const p of l.pois) {
    mark(p.col, p.row, 1, F_PROP | F_KEEP)
  }
  for (const pad of l.pads) {
    const { col, row } = { col: Math.floor(pad.x), row: H - 1 - Math.floor(pad.y) }
    mark(col, row, 3, F_KEEP)
  }
  for (const [, at] of ctx.labels) {
    for (let y = Math.floor(at.y - 1.2); y <= Math.floor(at.y + 1.1); y++)
      for (let x = Math.floor(at.x - 3.4); x <= Math.floor(at.x + 3.3); x++) if (inb(x, H - 1 - y)) occ[(H - 1 - y) * W + x] |= F_KEEP
  }
  yield

  const pal = palette(th, ctx.outdoor, tier)
  const kit = new Kit(ctx.props, pal, tier)
  // 螢幕與標本瓶：每座站最多兩種（各一個材質；low 各一種）
  const ui = Mat.screen(screenTex('ui', '#7fd8ff', 3), 1.7)
  const hc: HeroCtx = tier === 0 ? { screens: [ui], jars: [pal.led] } : { screens: [ui, Mat.screen(screenTex('radar', th.wallAccent, 4), 1.6)], jars: [Mat.emissive(th.wallAccent, 1.2), Mat.emissive('#b28cff', 1.2)] }
  const dec = new Decals()
  const sheen = new Decals()
  const emblem = new Decals()
  const cable = new Batcher()
  const wet = !!th.dress?.wet
  const decay = !!th.dress?.decay
  const lineHex = new THREE.Color(th.dress?.line ?? '#ffc23d')
  const lineCol: RGBA = [lineHex.r, lineHex.g, lineHex.b, 0.5]
  const builtRooms = new Set(th.built?.rooms ?? [])
  const floorVariant = (type: string) => (th.floor[type] ?? th.defaultFloor).variant

  // 依房間分組的地板格
  const cellsOf = new Map<number, number[]>()
  for (let i = 0; i < W * H; i++) {
    const ri = l.roomOf[i]
    if (ri < 0 || !(occ[i] & F_FLOOR)) continue
    let a = cellsOf.get(ri)
    if (!a) cellsOf.set(ri, (a = []))
    a.push(i)
  }
  // 門中心（每間房連到哪些門）
  const doorsOf = new Map<number, { x: number; y: number }[]>()
  for (const d of l.doors) {
    const seen = new Set<number>()
    for (const [c, r] of d.cells) {
      for (const [dc, dr] of [[0, 1], [0, -1], [1, 0], [-1, 0]]) {
        if (!inb(c + dc, r + dr)) continue
        const ri = l.roomOf[(r + dr) * W + c + dc]
        if (ri < 0 || seen.has(ri)) continue
        seen.add(ri)
        let a = doorsOf.get(ri)
        if (!a) doorsOf.set(ri, (a = []))
        a.push({ x: d.x, y: d.y })
      }
    }
  }

  // 頭頂管線不能經過的格：設施（販賣機 2.1 m）、門，與高道具（培養槽、機櫃、導能柱…）周圍一格
  const tall = new Uint8Array(W * H)
  for (let r = 0; r < H; r++) {
    for (let c = 0; c < W; c++) {
      const k = l.cells[r * W + c] as Cell
      const ri = l.roomOf[r * W + c]
      const hi = k === Cell.Fixture || k === Cell.Door || (k === Cell.Crate && (ri < 0 || TALL_PROPS.has(l.rooms[ri].spec.type)))
      if (!hi) continue
      for (let dr = -1; dr <= 1; dr++) for (let dc = -1; dc <= 1; dc++) if (inb(c + dc, r + dr)) tall[(r + dr) * W + c + dc] = 1
    }
  }
  for (const p of l.pois) for (let dr = -1; dr <= 1; dr++) for (let dc = -1; dc <= 1; dc++) if (inb(p.col + dc, p.row + dr)) tall[(p.row + dr) * W + p.col + dc] = 1
  // 大型設施（主砲）周圍的警示斜紋：同一塊設施格 ≥ 8 格才畫
  yield* hazardBorders(ctx, occ, dec)

  for (const r of l.rooms) {
    const cells = cellsOf.get(r.index)
    if (!cells?.length) continue
    const fam = FAMILY[r.spec.type] ?? (r.spec.type === 'corridor' ? 'corr' : null)
    const variant = floorVariant(r.spec.type)
    const natural = variant === 'grass' || variant === 'rock'
    const rng = mulberry((ctx.seed * 2654435761) ^ (r.index * 0x9e3779b1) ^ 0x51ed27)
    // 室外：只有人造房間（營舍、掩體、工廠…）有牆邊佈置
    if (fam && (!ctx.outdoor || builtRooms.has(r.spec.type))) {
      const runs = wallRuns(ctx, occ, r, cells)
      // 頭頂管線：房間的地板格＋矮道具格
      const pipeCells: number[] = []
      for (let i = 0; i < W * H; i++) if (l.roomOf[i] === r.index && (occ[i] & F_FLOOR || l.cells[i] === Cell.Crate)) pipeCells.push(i)
      dressWalls(kit, runs, wallRuns(ctx, occ, r, pipeCells, tall), fam, rng, hc, tier)
      if (tier >= 2) for (const run of runs) wallAO(dec, run)
    }
    if (!natural) dressFloor(ctx, occ, r, cells, fam ?? 'corr', rng, dec, sheen, cable, { wet, decay, lineCol, pal, emblem, accent: th.wallAccent }, doorsOf.get(r.index) ?? [])
    yield
  }

  // 厚牆頂（medium 起，站內）：沿牆芯走的導管＋通風箱（離牆頂 ≤ 0.14 m，不多擋視線）
  if (tier >= 1 && !ctx.outdoor) capRuns(ctx, kit, mulberry(ctx.seed ^ 0xca95))
  yield
  // 接觸陰影（medium 起）：道具格、設施底下一片柔和暗斑
  if (tier >= 1) {
    const k = tier >= 2 ? 1 : 0.75
    for (let i = 0; i < W * H; i++) {
      if (l.cells[i] !== Cell.Crate) continue
      const c = i % W
      const rr = (i - c) / W
      dec.add(ATLAS.blob, c + 0.5, H - rr - 0.5, 1.55, 1.55, 0, [0, 0, 0, 0.42 * k], 0.004)
    }
    for (const p of l.pois) {
      const s = POI_SHADOW[p.def.kind] ?? (p.def.solid === false ? 0 : 1.5)
      if (s > 0) dec.add(ATLAS.blob, p.x, p.y, s, s, 0, [0, 0, 0, 0.38 * k], 0.004)
    }
  }
  yield
  dec.build(ctx.group, decalMaterial())
  if (sheen.idx.length) sheen.build(ctx.group, sheenMaterial(), -1)
  if (emblem.idx.length) emblem.build(ctx.group, emblemMaterial(), -1)
  yield* cable.buildSteps(ctx.group, { cast: tier >= 2, receive: true })
}

/** 厚牆（八鄰都是牆）的牆芯：水平、垂直各找連續 ≥ 5 格的段，放一根導管＋托架，偶爾一個通風箱 */
function capRuns(ctx: DressCtx, k: Kit, rng: Rng): void {
  const { l } = ctx
  const W = l.w
  const H = l.h
  const TOP = 2.46
  const core = (c: number, r: number) => {
    if (c < 1 || r < 1 || c >= W - 1 || r >= H - 1) return false
    for (let dr = -1; dr <= 1; dr++) for (let dc = -1; dc <= 1; dc++) if (l.cells[(r + dr) * W + c + dc] !== Cell.Wall || ctx.cut((r + dr) * W + c + dc)) return false
    return true
  }
  const lay = (x0: number, y0: number, x1: number, y1: number) => {
    const len = Math.hypot(x1 - x0, y1 - y0)
    const horiz = Math.abs(x1 - x0) > Math.abs(y1 - y0)
    const f = frameOf((x0 + x1) / 2, (y0 + y1) / 2, horiz ? 0 : 1, horiz ? -1 : 0)
    k.at(f)
    const r1 = 0.055
    const off = rng() < 0.5 ? -0.18 : 0.18
    k.p(cyl(r1, r1, len, 8), k.pal.pipe, 0, TOP + r1, off, 0, 0, ALONG)
    if (rng() < 0.6) k.p(cyl(0.035, 0.035, len, 6), k.pal.rubber, 0, TOP + 0.035, -off * 0.9, 0, 0, ALONG)
    for (let a = -len / 2 + 0.6; a < len / 2 - 0.3; a += 2) k.p(box(0.08, 0.05, 0.5), k.pal.body, a, TOP + 0.025, 0)
    if (len > 6 && rng() < 0.7) {
      const a = (rng() - 0.5) * (len - 3)
      k.p(box(0.7, 0.12, 0.5), k.pal.body, a, TOP + 0.06, 0)
      for (let i = 0; i < 4; i++) k.p(box(0.6, 0.012, 0.05), k.pal.frame, a, TOP + 0.126, -0.15 + i * 0.1)
    }
  }
  for (let r = 1; r < H - 1; r++) {
    let c = 1
    while (c < W - 1) {
      if (!core(c, r)) {
        c++
        continue
      }
      let e = c
      while (e < W - 1 && core(e, r)) e++
      // 太長的牆芯分段（每段一根管）
      for (let a = c; e - a >= 5; a += 14) {
        const b = Math.min(e, a + 14)
        const m = Math.floor((a + b) / 2)
        // 只走三格厚的牆（牆芯一格寬）：上下不是牆芯
        if (b - a >= 5 && !core(m, r - 1) && !core(m, r + 1)) lay(a + 0.2, H - r - 0.5, b - 0.2, H - r - 0.5)
      }
      c = e
    }
  }
  for (let c = 1; c < W - 1; c++) {
    let r = 1
    while (r < H - 1) {
      if (!core(c, r)) {
        r++
        continue
      }
      let e = r
      while (e < H - 1 && core(c, e)) e++
      for (let a = r; e - a >= 5; a += 14) {
        const b = Math.min(e, a + 14)
        const m = Math.floor((a + b) / 2)
        if (b - a >= 5 && !core(c - 1, m) && !core(c + 1, m)) lay(c + 0.5, H - a - 0.2, c + 0.5, H - b + 0.2)
      }
      r = e
    }
  }
}

/** 設施底下的接觸陰影大小（m）*/
const POI_SHADOW: Record<string, number> = {
  vendor: 1.6,
  console: 2.2,
  shipConsole: 2.2,
  git: 2.9,
  regenerator: 1.3,
  rummageBox: 1.3,
  powerConsole: 1.9,
  enhancer: 1.1,
  moduleFactory: 2.4,
  moduleSocket: 1.4,
  fabricator: 2.2,
  cellConsole: 1.9,
  cageConsole: 1.9,
  penguinStatue: 1.5,
  codePanel: 1.4,
  arcLeak: 1.2,
  cannonBreech: 0,
  cannonBody: 0,
  fabricatorPad: 0,
  cagePad: 0,
  teleportPad: 0,
  moduleOut: 0,
  pad: 0,
}

/** 一間房的牆邊格（北、西、東牆；南牆背對鏡頭）依牆面接成連續段 */
function wallRuns(ctx: DressCtx, occ: Uint8Array, r: RoomInstance, cells: number[], tall: Uint8Array | null = null): Run[] {
  const { l } = ctx
  const W = l.w
  const H = l.h
  const solidWall = (c: number, rr: number) => c >= 0 && rr >= 0 && c < W && rr < H && l.cells[rr * W + c] === Cell.Wall && !ctx.cut(rr * W + c)
  const slots = new Map<string, Slot>()
  for (const i of cells) {
    // 牆邊雜物：避開道具、設施、門口；頭頂管線（tall 有給）：只避開高的道具與設施（矮道具上方照樣走管）
    if (tall ? tall[i] : occ[i] & (F_PROP | F_DOOR)) continue
    const c = i % W
    const rr = (i - c) / W
    if (solidWall(c, rr - 1)) slots.set(`${N}:${c},${rr}`, { col: c, row: rr, dir: N, f: frameOf(c + 0.5, H - rr, 0, -1) })
    if (solidWall(c - 1, rr)) slots.set(`${W_}:${c},${rr}`, { col: c, row: rr, dir: W_, f: frameOf(c, H - rr - 0.5, 1, 0) })
    if (solidWall(c + 1, rr)) slots.set(`${E_}:${c},${rr}`, { col: c, row: rr, dir: E_, f: frameOf(c + 1, H - rr - 0.5, -1, 0) })
  }
  const runs: Run[] = []
  const done = new Set<string>()
  // 沿切線方向的格子位移：北牆 +col；西牆 sim +y = -row；東牆 sim -y = +row
  const step = (dir: number): [number, number] => (dir === N ? [1, 0] : dir === W_ ? [0, -1] : [0, 1])
  for (const [key, s] of slots) {
    if (done.has(key)) continue
    const [dc, dr] = step(s.dir)
    // 往回找到起點
    let c = s.col
    let rr = s.row
    while (slots.has(`${s.dir}:${c - dc},${rr - dr}`)) {
      c -= dc
      rr -= dr
    }
    const run: Slot[] = []
    while (slots.has(`${s.dir}:${c},${rr}`)) {
      const k = `${s.dir}:${c},${rr}`
      run.push(slots.get(k)!)
      done.add(k)
      c += dc
      rr += dr
    }
    const a = run[0]
    const b = run[run.length - 1]
    const corner = (cc: number, r2: number) => solidWall(cc, r2)
    runs.push({ slots: run, dir: s.dir, cornerA: corner(a.col - dc, a.row - dr), cornerB: corner(b.col + dc, b.row + dr) })
  }
  // 固定順序（Map 的插入順序取決於格子掃描順序，已經是決定性的）
  return runs
}

/** 一段牆中心的座標系；t = 沿牆從段中心起算的位移 */
function runFrame(run: Run): Frame {
  const a = run.slots[0].f
  const b = run.slots[run.slots.length - 1].f
  return frameOf((a.x + b.x) / 2, (a.y + b.y) / 2, a.nx, a.ny)
}

/** 牆邊：主道具、雜物、牆頂管線 */
function dressWalls(k: Kit, runs: Run[], pipeRuns: Run[], fam: Fam, rng: Rng, hc: HeroCtx, tier: Tier): void {
  const used = new Map<Run, [number, number][]>()
  const free = (run: Run, a0: number, a1: number) => !(used.get(run) ?? []).some(([u0, u1]) => a1 > u0 - 0.15 && a0 < u1 + 0.15)
  const take = (run: Run, a0: number, a1: number) => {
    let a = used.get(run)
    if (!a) used.set(run, (a = []))
    a.push([a0, a1])
  }
  // 主道具：鏡頭看得到的北牆裡最長的一段
  const hero = HEROES[fam]
  if (hero) {
    const cand = runs.filter((r) => r.dir === N && r.slots.length >= hero.min + 0.5).sort((a, b) => b.slots.length - a.slots.length)
    const run = cand[0] ?? runs.filter((r) => r.slots.length >= hero.min + 0.5).sort((a, b) => b.slots.length - a.slots.length)[0]
    if (run) {
      const len = run.slots.length
      const w = Math.min(hero.max, len - 0.4)
      const slack = Math.max(0, (len - w) / 2 - 0.2)
      const at = (rng() - 0.5) * 2 * slack * 0.6
      const f = runFrame(run)
      k.at(frameOf(f.x + f.tx * at, f.y + f.ty * at, f.nx, f.ny))
      hero.f(k, w, rng, hc)
      take(run, at - w / 2, at + w / 2)
    }
  }
  // 牆頂管線（北、西、東牆，夠長的段）：兩根管＋托架＋法蘭；控制室、宿舍、醫療、實驗室改成線槽
  const tray = fam === 'ops' || fam === 'crew' || fam === 'med' || fam === 'lab' || fam === 'mess'
  for (const run of pipeRuns) {
    const len = run.slots.length
    if (len < 4) continue
    if (fam === 'corr' && run.dir !== N) continue
    if (tier === 0 && rng() < 0.35) continue
    const f = runFrame(run)
    const a0 = -len / 2 + (run.cornerA ? 0 : 0.15)
    const a1 = len / 2 - (run.cornerB ? 0 : 0.15)
    const L = a1 - a0
    const mid = (a0 + a1) / 2
    k.at(f)
    if (tray) {
      k.p(box(L, 0.03, 0.22), k.pal.frame, mid, 2.12, 0.13)
      k.p(box(L, 0.07, 0.015), k.pal.frame, mid, 2.15, 0.235)
      for (let i = 0; i < 3; i++) k.p(cyl(0.022, 0.022, L, 5), i === 1 ? k.pal.red : k.pal.rubber, mid, 2.155, 0.07 + i * 0.05, 0, 0, ALONG)
      for (let a = a0 + 0.4; a < a1; a += 1.3) k.p(box(0.04, 0.16, 0.24), k.pal.body, a, 2.2, 0.12)
    } else {
      const r1 = 0.07 + rng() * 0.02
      k.p(cyl(r1, r1, L, 10), k.pal.pipe, mid, 2.17, 0.13, 0, 0, ALONG)
      k.p(cyl(0.045, 0.045, L, 8), k.pal.pipe, mid, 2.32, 0.27, 0, 0, ALONG)
      for (let a = a0 + 0.5; a < a1; a += 1.4) k.p(box(0.05, 0.3, 0.36), k.pal.body, a, 2.22, 0.18)
      if (tier >= 1) for (let a = a0 + 1.2; a < a1 - 0.3; a += 2.8) k.p(cyl(r1 + 0.03, r1 + 0.03, 0.08, 10), k.pal.frame, a, 2.17, 0.13, 0, 0, ALONG)
      if (tier >= 2 && L > 6) {
        const va = mid + (rng() - 0.5) * (L - 2)
        k.p(cyl(0.012, 0.012, 0.12, 5), k.pal.frame, va, 2.17, 0.24, 0, OUTWARD)
        k.p(torus(0.08, 0.012, 5, 14), k.pal.red, va, 2.17, 0.3)
      }
    }
  }
  // 牆邊雜物
  const items = itemsFor(fam, hc)
  const p = (fam === 'corr' ? [0.08, 0.14, 0.2, 0.24] : [0.2, 0.34, 0.46, 0.54])[tier]
  for (const run of runs) {
    const len = run.slots.length
    const f = runFrame(run)
    // 凹角：牆角雜物（氣瓶、垃圾桶、箱子）
    for (const [isCorner, side] of [
      [run.cornerA, -1],
      [run.cornerB, 1],
    ] as const) {
      if (!isCorner || fam === 'corr' || rng() > p * 1.3) continue
      const it = pick(rng, [{ w: 0.7, f: canisters }, { w: 0.4, f: bin }, { w: 0.7, f: crates }] as ItemDef[])
      const a = side * (len / 2 - it.w / 2 - 0.05)
      if (!free(run, a - it.w / 2, a + it.w / 2) || it.w > len) continue
      k.at(f)
      it.f(k, a, rng)
      take(run, a - it.w / 2, a + it.w / 2)
    }
    let t = -len / 2 + 0.2 + rng() * 0.8
    while (t < len / 2 - 0.3) {
      const it = pick(rng, items)
      if (t + it.w > len / 2 - 0.1) break
      const a = t + it.w / 2
      if (rng() < p && free(run, t, t + it.w)) {
        k.at(f)
        it.f(k, a, rng)
        take(run, t, t + it.w)
        t += it.w + 0.3 + rng() * 1.2
      } else t += 0.6 + rng() * 0.6
    }
  }
}

/** 牆腳接觸陰影（high 起）：沿牆貼一條往房間內淡出的暗帶 */
function wallAO(dec: Decals, run: Run): void {
  const f = run.slots[0].f
  const rot = Math.atan2(-f.nx, f.ny)
  for (const s of run.slots) {
    const g = s.f
    dec.add(ATLAS.ao, g.x + g.nx * 0.22, g.y + g.ny * 0.22, 1.0, 0.44, rot, [0, 0, 0, 0.5], 0.003)
  }
}

interface FloorOpts {
  wet: boolean
  decay: boolean
  lineCol: RGBA
  pal: Palette
  emblem: Decals
  accent: string
}

/** 有地面發光虛線外圈的控制台 */
const CONSOLES = new Set(['console', 'shipConsole', 'powerConsole', 'cellConsole', 'cageConsole'])

/** (x, y) 為中心、半寬 hw × 半高 hh 的矩形內全是同一間房的空地板（不是道具、設施周圍、門口、房名）*/
function rectOpen(l: ParsedLayout, occ: Uint8Array, x: number, y: number, hw: number, hh: number, room: number): boolean {
  for (let yy = Math.floor(y - hh); yy <= Math.floor(y + hh - 1e-6); yy++) {
    for (let xx = Math.floor(x - hw); xx <= Math.floor(x + hw - 1e-6); xx++) {
      const r = l.h - 1 - yy
      if (xx < 0 || r < 0 || xx >= l.w || r >= l.h) return false
      const i = r * l.w + xx
      if (!(occ[i] & F_FLOOR) || occ[i] & (F_KEEP | F_PROP) || l.roomOf[i] !== room) return false
    }
  }
  return true
}

/** 地面細節：刮痕、髒污、編號、標線、胎痕、油漬、排水蓋、水漬、地面電纜 */
function dressFloor(ctx: DressCtx, occ: Uint8Array, r: RoomInstance, cells: number[], fam: Fam, rng: Rng, dec: Decals, sheen: Decals, cable: Batcher, o: FloorOpts, doors: { x: number; y: number }[]): void {
  const { l, tier } = ctx
  const W = l.w
  const H = l.h
  const n = cells.length
  const cxy = (i: number) => {
    const c = i % W
    const rr = (i - c) / W
    return { c, rr, x: c + 0.5, y: H - rr - 0.5 }
  }
  const open = (i: number) => !(occ[i] & (F_KEEP | F_PROP))
  const freeCells = cells.filter(open)
  if (!freeCells.length) return
  const any = () => cxy(freeCells[Math.floor(rng() * freeCells.length) % freeCells.length])
  // 走動路線：門與門、門與房間中心之間的連線附近刮痕多
  const paths: [number, number, number, number][] = []
  for (let i = 0; i < doors.length; i++) {
    paths.push([doors[i].x, doors[i].y, r.cx, r.cy])
    for (let j = i + 1; j < doors.length; j++) paths.push([doors[i].x, doors[i].y, doors[j].x, doors[j].y])
  }
  const traffic = (x: number, y: number) => {
    let best = 99
    for (const [ax, ay, bx, by] of paths) {
      const dx = bx - ax
      const dy = by - ay
      const t = Math.max(0, Math.min(1, ((x - ax) * dx + (y - ay) * dy) / (dx * dx + dy * dy || 1)))
      best = Math.min(best, Math.hypot(x - ax - dx * t, y - ay - dy * t))
    }
    return best
  }
  const dirt: RGBA = o.decay ? [0.09, 0.06, 0.04, 1] : [0.04, 0.045, 0.05, 1]
  const scale = [0.55, 0.8, 1, 1.15][tier]
  // 刮痕：沿走動路線
  const nScuff = Math.round((n / 11) * scale)
  for (let k = 0, tries = 0; k < nScuff && tries < nScuff * 4; tries++) {
    const p = any()
    const d = paths.length ? traffic(p.x, p.y) : 0
    if (rng() > Math.exp(-(d * d) / 10) + 0.18) continue
    k++
    const s = range(rng, 1.6, 3.2)
    dec.add(ATLAS.scuff, p.x + range(rng, -0.5, 0.5), p.y + range(rng, -0.5, 0.5), s, s, rng() * 6.283, [dirt[0], dirt[1], dirt[2], range(rng, 0.35, 0.6)])
  }
  // 髒污：靠牆與牆角多
  const nGrime = Math.round((n / 16) * scale)
  for (let k = 0; k < nGrime; k++) {
    const p = any()
    const s = range(rng, 1.8, 3.6)
    dec.add(ATLAS.grime, p.x, p.y, s, s, rng() * 6.283, [dirt[0] * 1.6, dirt[1] * 1.4, dirt[2], range(rng, 0.2, 0.38)])
  }
  // 裂縫（廢站、軍事）
  if (o.decay || fam === 'mil') {
    for (let k = 0; k < Math.round(n / 40); k++) {
      const p = any()
      const s = range(rng, 1, 2)
      dec.add(ATLAS.crack, p.x, p.y, s, s, rng() * 6.283, [0.02, 0.02, 0.02, 0.55])
    }
  }
  // 噴漆編號：靠牆第二、三排，字朝牆（站在房裡面向牆讀）；同一間房彼此至少隔 5 m、不重複同一個編號
  if (n >= 30 && fam !== 'corr') {
    const want = 1 + Math.floor(n / 140) + (tier >= 2 ? 1 : 0)
    const placed: { x: number; y: number; cell: number }[] = []
    const cellsLeft = [ATLAS.stencilA, ATLAS.stencilB, ATLAS.stencilC]
    for (let tries = 0; placed.length < want && tries < 80 && cellsLeft.length; tries++) {
      const p = any()
      if (placed.some((q) => Math.hypot(q.x - p.x, q.y - p.y) < 5)) continue
      let best: [number, number] | null = null
      for (const [dc, dr, nx, ny] of [[0, -2, 0, -1], [0, 2, 0, 1], [-2, 0, 1, 0], [2, 0, -1, 0], [0, -3, 0, -1], [-3, 0, 1, 0], [3, 0, -1, 0]] as const) {
        const cc = p.c + dc
        const r2 = p.rr + dr
        if (cc < 0 || r2 < 0 || cc >= W || r2 >= H) continue
        if (l.cells[r2 * W + cc] === Cell.Wall) {
          best = [nx, ny]
          break
        }
      }
      // 南牆（牆在南邊）背對鏡頭會被牆擋住，不放
      if (!best || best[1] === 1) continue
      const cell = cellsLeft.splice(Math.floor(rng() * cellsLeft.length) % cellsLeft.length, 1)[0]
      placed.push({ x: p.x, y: p.y, cell })
      const col: RGBA = rng() < 0.6 ? [0.9, 0.9, 0.88, 0.36] : [o.lineCol[0], o.lineCol[1], o.lineCol[2], 0.45]
      const s = range(rng, 0.95, 1.25)
      dec.add(cell, p.x, p.y, s, s, Math.atan2(best[0], -best[1]), col, 0.008)
    }
  }
  // 工業、軍事、動力房間：地上漆一兩個裝卸區框（標線＋四角斜紋），medium 起
  if (tier >= 1 && n > 60 && (fam === 'ind' || fam === 'mil' || fam === 'power' || fam === 'decay')) {
    const want = n > 160 ? 2 : 1
    for (let k = 0, tries = 0; k < want && tries < 50; tries++) {
      const p = any()
      const w = Math.round(range(rng, 2, 4))
      const h = Math.round(range(rng, 2, 3))
      const cx = Math.floor(p.x) + (w % 2 ? 0.5 : 0)
      const cy = Math.floor(p.y) + (h % 2 ? 0.5 : 0)
      if (!rectOpen(l, occ, cx, cy, w / 2 + 0.4, h / 2 + 0.4, r.index)) continue
      k++
      const col: RGBA = [o.lineCol[0], o.lineCol[1], o.lineCol[2], 0.42]
      for (let i = 0; i < w; i++) {
        const x = cx - w / 2 + i + 0.5
        dec.add(ATLAS.line, x, cy + h / 2, 1.0, 0.08, 0, col, 0.007, (i % 3) / 3, (i % 3) / 3 + 0.33)
        dec.add(ATLAS.line, x, cy - h / 2, 1.0, 0.08, 0, col, 0.007, ((i + 1) % 3) / 3, ((i + 1) % 3) / 3 + 0.33)
      }
      for (let j = 0; j < h; j++) {
        const y = cy - h / 2 + j + 0.5
        dec.add(ATLAS.line, cx - w / 2, y, 1.0, 0.08, Math.PI / 2, col, 0.007, (j % 3) / 3, (j % 3) / 3 + 0.33)
        dec.add(ATLAS.line, cx + w / 2, y, 1.0, 0.08, Math.PI / 2, col, 0.007, ((j + 2) % 3) / 3, ((j + 2) % 3) / 3 + 0.33)
      }
      for (const [sx, sy] of [[-1, -1], [1, -1], [-1, 1], [1, 1]]) {
        dec.add(ATLAS.hazard, cx + sx * (w / 2 - 0.35), cy + sy * (h / 2 - 0.08), 0.62, 0.14, 0, [1, 0.8, 0.3, 0.5], 0.0075, 0, 0.6)
      }
    }
  }
  // 工業房間：胎痕、油漬
  if (INDUSTRIAL.has(fam)) {
    if (n > 70) {
      for (let k = 0; k < Math.round((n / 90) * scale) + 1; k++) {
        const p = any()
        const s = range(rng, 3.2, 4.4)
        dec.add(ATLAS.tyre, p.x, p.y, s, s, rng() * 6.283, [0.03, 0.03, 0.03, range(rng, 0.3, 0.5)])
      }
    }
    for (let k = 0; k < Math.round((n / 45) * scale); k++) {
      const p = any()
      const s = range(rng, 0.5, 1.3)
      dec.add(ATLAS.oil, p.x + range(rng, -0.4, 0.4), p.y + range(rng, -0.4, 0.4), s, s * range(rng, 0.7, 1), rng() * 6.283, [0.02, 0.02, 0.018, range(rng, 0.45, 0.7)])
    }
  }
  // 標線：沿北、西、東牆離牆 1.3 m 一條（只在空的地板上畫）。工業類房間是油漆標線（medium 起）；
  // 宿舍、醫療、實驗室、控制室是嵌在地板裡的發光導引條（各畫質都有，和牆上燈條同一個材質）
  const paintLane = tier >= 1 && n > 60 && (INDUSTRIAL.has(fam) || fam === 'mess')
  const lightLane = n > 60 && (fam === 'crew' || fam === 'med' || fam === 'lab' || fam === 'ops')
  if (paintLane || lightLane) {
    for (const i of cells) {
      const p = cxy(i)
      for (const [dc, dr, horiz] of [[0, -2, true], [-2, 0, false], [2, 0, false]] as const) {
        const cc = p.c + dc
        const r2 = p.rr + dr
        if (cc < 0 || r2 < 0 || cc >= W || r2 >= H || l.cells[r2 * W + cc] !== Cell.Wall) continue
        // 中間那格要是空的地板（不是牆、道具）
        const mc = p.c + dc / 2
        const mr = p.rr + dr / 2
        if (!(occ[mr * W + mc] & F_FLOOR) || (occ[mr * W + mc] & F_PROP) || !open(i)) continue
        const off = 0.2
        const x = horiz ? p.x : p.x + (dc < 0 ? -off : off)
        const y = horiz ? p.y + (dr < 0 ? off : -off) : p.y
        if (paintLane) {
          const u0 = ((horiz ? p.c : p.rr) % 3) / 3
          dec.add(ATLAS.line, x, y, 1.0, 0.09, horiz ? 0 : Math.PI / 2, o.lineCol, 0.007, u0, u0 + 0.33)
        } else {
          // 一格一段（0.6 m）：嵌入的暗框＋發光條
          cable.add(box(horiz ? 0.66 : 0.1, 0.006, horiz ? 0.1 : 0.66), o.pal.body, x, 0.003, -y)
          cable.add(box(horiz ? 0.6 : 0.045, 0.009, horiz ? 0.045 : 0.6), o.pal.led, x, 0.0045, -y)
        }
      }
    }
  }
  // 大房間（≥ 150 格）的地面中央：一個噴漆徽記（餐廳、控制室、實驗室、醫療、宿舍），離房名至少 4 m
  if (n >= 150 && (fam === 'mess' || fam === 'ops' || fam === 'lab' || fam === 'med' || fam === 'crew')) {
    const lab = ctx.labels.get(r.index)
    let best: { x: number; y: number; d: number } | null = null
    for (const i of freeCells) {
      const p = cxy(i)
      const R = 2.3
      if (lab && Math.hypot(p.x + 0.5 - lab.x, p.y + 0.5 - lab.y) < R + 2.2) continue
      if (!rectOpen(l, occ, p.x + 0.5, p.y + 0.5, R, R, r.index)) continue
      // 越靠房間中央越好
      const d = Math.hypot(p.x + 0.5 - r.cx, p.y + 0.5 - r.cy) + rng() * 2
      if (!best || d < best.d) best = { x: p.x + 0.5, y: p.y + 0.5, d }
    }
    if (best) {
      const c = new THREE.Color(fam === 'med' ? '#5cf2a5' : fam === 'crew' ? '#ffd9a8' : o.accent)
      o.emblem.add(-1, best.x, best.y, 4.4, 4.4, 0, [c.r, c.g, c.b, 0.32], 0.0075)
      // 徽記外圈：四角的警示斜紋短條
      for (const [sx, sy] of [[-1, -1], [1, -1], [-1, 1], [1, 1]]) dec.add(ATLAS.line, best.x + sx * 2.0, best.y + sy * 2.0, 0.6, 0.06, sx * sy > 0 ? -Math.PI / 4 : Math.PI / 4, [c.r, c.g, c.b, 0.35], 0.007)
    }
  }
  // 排水蓋／檢修蓋（格子對齊）
  if (fam === 'pen' || fam === 'lab' || fam === 'med' || INDUSTRIAL.has(fam) || o.wet) {
    for (let k = 0; k < Math.max(1, Math.round(n / 55)); k++) {
      const p = any()
      if (rng() < 0.5) dec.add(ATLAS.drain, p.x, p.y, 0.62, 0.62, 0, [0.85, 0.85, 0.85, 0.95], 0.005)
      else dec.add(ATLAS.hatchPlate, p.x, p.y, 0.9, 0.9, (Math.floor(rng() * 4) * Math.PI) / 2, [0.8, 0.82, 0.85, 0.95], 0.005)
    }
  }
  // 水漬（潮濕的站；收容隔間多）
  if (o.wet) {
    const nP = Math.round((n / (fam === 'pen' ? 12 : 26)) * scale)
    for (let k = 0; k < nP; k++) {
      const p = any()
      const s = range(rng, 0.8, 2.2)
      const rot = rng() * 6.283
      const x = p.x + range(rng, -0.4, 0.4)
      const y = p.y + range(rng, -0.4, 0.4)
      dec.add(ATLAS.puddle, x, y, s, s * range(rng, 0.6, 1), rot, o.decay ? [0.06, 0.045, 0.03, 0.3] : [0.03, 0.07, 0.07, 0.26], 0.005)
      if (tier >= 2) sheen.add(ATLAS.puddle, x, y, s * 0.92, s * range(rng, 0.55, 0.9), rot, [1, 1, 1, 0.55], 0.006)
    }
  }
  // 走廊：地面導引燈（沿走廊中線每 2 m 一小段發光條，避開走廊箭頭與門口）
  if (fam === 'corr' && n > 20) {
    const horiz = r.maxX - r.minX > r.maxY - r.minY
    const len = horiz ? r.maxX - r.minX : r.maxY - r.minY
    const glow = o.pal.led
    for (let s2 = 1.2; s2 < len - 1; s2 += 2) {
      // stationBuilder 的走廊箭頭在 6、20、34… m
      if (((s2 - 6) % 14 + 14) % 14 < 1.4 || ((s2 - 6) % 14 + 14) % 14 > 12.6) continue
      const x = horiz ? r.minX + s2 : r.cx
      const y = horiz ? r.cy : r.minY + s2
      const c = Math.floor(x)
      const rr = H - 1 - Math.floor(y)
      if (c < 0 || rr < 0 || c >= W || rr >= H) continue
      const i = rr * W + c
      if (!(occ[i] & F_FLOOR) || occ[i] & F_KEEP || l.roomOf[i] !== r.index) continue
      cable.add(box(horiz ? 0.5 : 0.07, 0.008, horiz ? 0.07 : 0.5), glow, x, 0.004, -y)
    }
  }
  // 控制台外圈：一圈地面發光虛線（設施光圈外 0.8 m）
  for (const poi of l.pois) {
    if (!CONSOLES.has(poi.def.kind) || l.roomOf[poi.row * W + poi.col] !== r.index) continue
    const glow = o.pal.led
    const R = 1.9
    for (let k = 0; k < 16; k++) {
      const a = (k / 16) * Math.PI * 2
      const x = poi.x + Math.cos(a) * R
      const y = poi.y + Math.sin(a) * R
      const c = Math.floor(x)
      const rr = H - 1 - Math.floor(y)
      if (l.cells[rr * W + c] !== Cell.Floor) continue
      cable.add(box(0.32, 0.008, 0.05), glow, x, 0.004, -y, a + Math.PI / 2)
    }
  }
  // 地面電纜（medium 起）：從牆邊拉到房裡的設施或道具，地上一束 2–3 條、跨過走道處加護橋
  if (tier >= 1 && (fam === 'ops' || fam === 'power' || fam === 'lab' || fam === 'ind' || fam === 'mil' || fam === 'decay')) {
    const want = Math.min(3, 1 + Math.floor(n / 120))
    for (let k = 0; k < want; k++) floorCable(ctx, occ, cells, rng, cable, o.pal)
  }
}

/** 一束地面電纜：從房間的某段牆腳出發，L 形繞到最近的設施／道具旁邊；路上碰到非地板就放棄 */
function floorCable(ctx: DressCtx, occ: Uint8Array, cells: number[], rng: Rng, cable: Batcher, pal: Palette): void {
  const { l } = ctx
  const W = l.w
  const H = l.h
  // 起點：貼北／西／東牆的空地板格
  const starts = cells.filter((i) => {
    const c = i % W
    const r = (i - c) / W
    return !(occ[i] & (F_PROP | F_DOOR)) && [[0, -1], [-1, 0], [1, 0]].some(([dc, dr]) => l.cells[(r + dr) * W + c + dc] === Cell.Wall)
  })
  if (!starts.length) return
  const s = starts[Math.floor(rng() * starts.length) % starts.length]
  const sc = s % W
  const sr = (s - sc) / W
  const [dc, dr] = [[0, -1], [-1, 0], [1, 0]].find(([a, b]) => l.cells[(sr + b) * W + sc + a] === Cell.Wall)!
  // sim：牆面上的點與往房間的法線
  const nx = -dc
  const ny = dr
  const sx = sc + 0.5 - nx * 0.42
  const sy = H - sr - 0.5 - ny * 0.42
  // 終點：同房間裡最近的道具／設施格（旁邊一格的地板中心）
  let best: { x: number; y: number; d: number } | null = null
  const room = l.roomOf[s]
  for (const i of cells) {
    const c = i % W
    const r = (i - c) / W
    for (const [a, b] of [[0, 1], [0, -1], [1, 0], [-1, 0]]) {
      const k = l.cells[(r + b) * W + c + a]
      if (k !== Cell.Crate && k !== Cell.Fixture) continue
      const x = c + 0.5
      const y = H - r - 0.5
      const d = Math.hypot(x - sx, y - sy)
      if (d < 3 || d > 16) continue
      const dd = d + rng() * 3
      if (!best || dd < best.d) best = { x: x + a * 0.25, y: y - b * 0.25, d: dd }
    }
  }
  if (!best) return
  // L 形：先垂直離牆 0.8 m，再沿較長的軸走、轉一次彎
  const p1 = { x: sx + nx * 0.8, y: sy + ny * 0.8 }
  const mid = Math.abs(nx) > 0 ? { x: best.x, y: p1.y } : { x: p1.x, y: best.y }
  const pts = [{ x: sx, y: sy }, p1, mid, best]
  // 沿線取樣：都要是同一間房的地板（不是道具、設施、門）
  for (let k = 0; k + 1 < pts.length; k++) {
    const a = pts[k]
    const b = pts[k + 1]
    const len = Math.hypot(b.x - a.x, b.y - a.y)
    for (let t = 0; t <= len; t += 0.25) {
      const x = a.x + ((b.x - a.x) * t) / Math.max(len, 1e-6)
      const y = a.y + ((b.y - a.y) * t) / Math.max(len, 1e-6)
      const c = Math.floor(x)
      const r = H - 1 - Math.floor(y)
      const i = r * W + c
      if (c < 0 || r < 0 || c >= W || r >= H) return
      const kc = l.cells[i] as Cell
      const end = k === pts.length - 2 && t > len - 0.6
      if (!end && (kc !== Cell.Floor || l.roomOf[i] !== room)) return
    }
  }
  const n = 2 + Math.floor(rng() * 2)
  for (let j = 0; j < n; j++) {
    const off = (j - (n - 1) / 2) * 0.07
    const v: THREE.Vector3[] = []
    for (let k = 0; k < pts.length; k++) {
      const a = pts[k]
      // 垂直走向的偏移：用前後兩段的方向決定
      const b = pts[Math.min(pts.length - 1, k + 1)]
      const pa = pts[Math.max(0, k - 1)]
      const dx = b.x - pa.x
      const dy = b.y - pa.y
      const L = Math.hypot(dx, dy) || 1
      const ox = (-dy / L) * off
      const oy = (dx / L) * off
      v.push(new THREE.Vector3(a.x + ox + (k > 0 && k < pts.length - 1 ? range(rng, -0.08, 0.08) : 0), k === 0 ? 0.25 : 0.028, -(a.y + oy)))
    }
    // 牆腳往上接到牆上的接線盒高度
    v.unshift(new THREE.Vector3(v[0].x - nx * 0.05, 0.9, v[0].z + ny * 0.05))
    const curve = new THREE.CatmullRomCurve3(v, false, 'centripetal', 0.2)
    const len = curve.getLength()
    const g = new THREE.TubeGeometry(curve, Math.max(8, Math.round(len * 3)), 0.024, 5, false)
    cable.add(g, j === 1 ? pal.red : pal.rubber, 0, 0, 0)
    g.dispose()
  }
  // 電纜護橋：在中段（mid 附近）跨一座黃色護橋
  const ax = (p1.x + mid.x) / 2
  const ay = (p1.y + mid.y) / 2
  const horiz = Math.abs(mid.x - p1.x) > Math.abs(mid.y - p1.y)
  if (Math.hypot(mid.x - p1.x, mid.y - p1.y) > 1.6) {
    cable.add(box(0.42, 0.05, 0.36), pal.warn, ax, 0.025, -ay, horiz ? Math.PI / 2 : 0)
    cable.add(box(0.06, 0.052, 0.37), pal.body, ax, 0.026, -ay, horiz ? Math.PI / 2 : 0)
  }
  // 牆上的接線盒（電纜的起點）
  const kit = new Kit(cable, pal, ctx.tier)
  kit.at(frameOf(sx - nx * 0.08, sy - ny * 0.08, nx, ny))
  kit.p(box(0.36, 0.42, 0.12), pal.body, 0, 0.95, 0.06)
  kit.p(box(0.04, 0.04, 0.012), pal.warm, 0.12, 1.1, 0.125)
}

/** 大型設施（≥ 8 格，例如主砲）周圍的地面警示斜紋＋一兩個 KEEP CLEAR */
function* hazardBorders(ctx: DressCtx, occ: Uint8Array, dec: Decals): Steps {
  const { l } = ctx
  const W = l.w
  const H = l.h
  const seen = new Uint8Array(W * H)
  const rng = mulberry(ctx.seed ^ 0xbad5eed)
  for (let i0 = 0; i0 < W * H; i0++) {
    if (seen[i0] || l.cells[i0] !== Cell.Fixture) continue
    const blob: number[] = []
    const q = [i0]
    seen[i0] = 1
    while (q.length) {
      const i = q.pop()!
      blob.push(i)
      const c = i % W
      const r = (i - c) / W
      for (const [dc, dr] of [[0, 1], [0, -1], [1, 0], [-1, 0]]) {
        const cc = c + dc
        const rr = r + dr
        if (cc < 0 || rr < 0 || cc >= W || rr >= H) continue
        const j = rr * W + cc
        if (seen[j] || l.cells[j] !== Cell.Fixture) continue
        seen[j] = 1
        q.push(j)
      }
    }
    if (blob.length < 8) continue
    let kc = 0
    for (const i of blob) {
      const c = i % W
      const r = (i - c) / W
      for (const [dc, dr] of [[0, 1], [0, -1], [1, 0], [-1, 0]]) {
        const cc = c + dc
        const rr = r + dr
        if (cc < 0 || rr < 0 || cc >= W || rr >= H) continue
        const j = rr * W + cc
        if (!(occ[j] & F_FLOOR) || l.cells[j] !== Cell.Floor) continue
        // 斜紋貼在地板格靠設施那一側（寬 0.32 m）
        const x = cc + 0.5 - dc * 0.32
        const y = H - rr - 0.5 + dr * 0.32
        const rot = dc !== 0 ? Math.PI / 2 : 0
        dec.add(ATLAS.hazard, x, y, 1.0, 0.3, rot, [1, 0.78, 0.25, 0.62], 0.007, (cc + rr) % 2 ? 0 : 0.5, (cc + rr) % 2 ? 0.5 : 1)
        // KEEP CLEAR 只寫在設施南側（字朝鏡頭）
        if (kc < 2 && dr === 1 && rng() < 0.08) {
          kc++
          dec.add(ATLAS.keepClear, cc + 0.5, H - rr - 0.5 - 0.35, 1.6, 1.6, 0, [1, 0.85, 0.35, 0.5], 0.008)
        }
      }
    }
    yield
  }
}

// ───── 燈下光柱、浮塵（high／ultra）─────

export interface LampSpot {
  x: number
  /** three 的 z（= -sim y）*/
  z: number
  color: THREE.Color
  /** 光柱底部半徑 */
  r: number
}

let coneMat: THREE.ShaderMaterial | null = null
/**
 * 光柱材質：加成混合、不寫深度；視角越貼近側面越淡（柔和的邊）、上下兩端淡出；
 * 受戰爭迷霧遮蔽（視野外看不到）並跟著補光色調（緊急照明時轉紅）。所有站共用、不 dispose。
 */
function coneMaterial(): THREE.ShaderMaterial {
  if (!coneMat) {
    coneMat = new THREE.ShaderMaterial({
      uniforms: { uFogTex: fogUniforms.uFogTex, uFogRect: fogUniforms.uFogRect, uFogOn: fogUniforms.uFogOn, uFillTint: fogUniforms.uFillTint, uTime: fogUniforms.uTime },
      vertexShader: `
        attribute vec4 aCone;
        varying vec4 vC;
        varying float vH;
        varying vec3 vN;
        varying vec3 vV;
        varying vec3 vW;
        void main() {
          vC = aCone;
          vH = uv.y;
          vec4 wp = modelMatrix * vec4(position, 1.0);
          vW = wp.xyz;
          vec4 mv = viewMatrix * wp;
          vV = -mv.xyz;
          vN = normalize(normalMatrix * normal);
          gl_Position = projectionMatrix * mv;
        }`,
      fragmentShader: `
        uniform sampler2D uFogTex;
        uniform vec4 uFogRect;
        uniform float uFogOn;
        uniform vec3 uFillTint;
        uniform float uTime;
        varying vec4 vC;
        varying float vH;
        varying vec3 vN;
        varying vec3 vV;
        varying vec3 vW;
        void main() {
          float edge = pow(abs(dot(normalize(vN), normalize(vV))), 1.7);
          float k = smoothstep(0.0, 0.6, vH) * (1.0 - smoothstep(0.84, 1.0, vH));
          float flick = 0.94 + 0.06 * sin(uTime * 1.3 + vW.x * 0.7 + vW.z * 0.4);
          float a = vC.a * edge * k * flick;
          if (uFogOn > 0.5) {
            vec2 fuv = vec2((vW.x - uFogRect.x) / uFogRect.z, (-vW.z - uFogRect.y) / uFogRect.w);
            a *= smoothstep(0.05, 0.95, texture2D(uFogTex, fuv).r);
          }
          gl_FragColor = vec4(vC.rgb * uFillTint * a, 1.0);
        }`,
      transparent: true,
      depthWrite: false,
      blending: THREE.AdditiveBlending,
      side: THREE.DoubleSide,
    })
    coneMat.userData.keep = true
  }
  return coneMat
}

/**
 * 燈下的光柱與光柱裡的浮塵（high 起；medium 只有少量浮塵）：位置是房間頂燈（stationBuilder 的 lights，y 4.2 的那些）。
 * 一座站的光柱合成一個 mesh、浮塵一個 Points。
 */
export function dressLights(group: THREE.Group, spots: LampSpot[], tier: Tier, seed: number, particles: number): void {
  if (tier < 1 || !spots.length) return
  const rng = mulberry(seed ^ 0x1a2b3c)
  if (tier >= 2) {
    const geos: THREE.BufferGeometry[] = []
    const H = 2.3
    const k = tier >= 3 ? 0.13 : 0.11
    for (const s of spots) {
      const g = new THREE.CylinderGeometry(0.3, s.r, H, 20, 1, true).toNonIndexed()
      g.translate(s.x, 0.04 + H / 2, s.z)
      const n = g.attributes.position.count
      const a = new Float32Array(n * 4)
      for (let i = 0; i < n; i++) a.set([s.color.r, s.color.g, s.color.b, k], i * 4)
      g.setAttribute('aCone', new THREE.BufferAttribute(a, 4))
      geos.push(g)
    }
    const merged = mergeGeometries(geos, false)
    for (const g of geos) g.dispose()
    if (merged) {
      merged.computeBoundingSphere()
      const m = new THREE.Mesh(merged, coneMaterial())
      m.renderOrder = 3
      m.matrixAutoUpdate = false
      group.add(m)
    }
  }
  // 浮塵：光柱裡緩慢飄動的亮點
  const per = [0, 8, 22, 40][tier]
  const total = Math.min(Math.round(particles * 0.35), spots.length * per)
  if (total <= 0) return
  const pos = new Float32Array(total * 3)
  const col = new Float32Array(total * 3)
  const ph = new Float32Array(total * 2)
  for (let k = 0; k < total; k++) {
    const s = spots[k % spots.length]
    const h = 0.3 + rng() * 1.9
    const rad = (0.28 + (s.r - 0.28) * (1 - h / 2.34)) * Math.sqrt(rng()) * 0.85
    const a = rng() * 6.283
    pos[k * 3] = s.x + Math.cos(a) * rad
    pos[k * 3 + 1] = h
    pos[k * 3 + 2] = s.z + Math.sin(a) * rad
    const b = 0.5 + rng() * 0.5
    col[k * 3] = (s.color.r * 0.6 + 0.4) * b
    col[k * 3 + 1] = (s.color.g * 0.6 + 0.4) * b
    col[k * 3 + 2] = (s.color.b * 0.6 + 0.4) * b
    ph[k * 2] = rng()
    ph[k * 2 + 1] = rng()
  }
  const geo = new THREE.BufferGeometry()
  geo.setAttribute('position', new THREE.BufferAttribute(pos, 3))
  geo.setAttribute('color', new THREE.BufferAttribute(col, 3))
  geo.setAttribute('aDust', new THREE.BufferAttribute(ph, 2))
  geo.computeBoundingSphere()
  const mat = new THREE.PointsMaterial({ size: 0.045, map: dustSprite(), vertexColors: true, transparent: true, opacity: 0.7, depthWrite: false, blending: THREE.AdditiveBlending, sizeAttenuation: true })
  mat.onBeforeCompile = (shader) => {
    shader.vertexShader = shader.vertexShader
      .replace('#include <common>', '#include <common>\nattribute vec2 aDust;\nuniform float uTime;')
      .replace(
        '#include <begin_vertex>',
        `#include <begin_vertex>
        float dT = uTime * (0.08 + aDust.y * 0.07) + aDust.x * 6.2832;
        transformed += vec3(sin(dT) * 0.22, sin(dT * 1.3 + aDust.y * 5.0) * 0.12, cos(dT * 0.9) * 0.22);`,
      )
      .replace('gl_PointSize = size;', 'gl_PointSize = size * (0.6 + aDust.y * 0.8) * (0.7 + 0.3 * sin(uTime * 2.1 + aDust.x * 40.0));')
  }
  mat.customProgramCacheKey = () => 'xcmote'
  const pts = new THREE.Points(geo, withFog(mat))
  pts.frustumCulled = false
  pts.matrixAutoUpdate = false
  pts.renderOrder = 3
  group.add(pts)
}

let moteTex: THREE.Texture | null = null
function dustSprite(): THREE.Texture {
  if (!moteTex) {
    const c = document.createElement('canvas')
    c.width = c.height = 32
    const x = c.getContext('2d')!
    const g = x.createRadialGradient(16, 16, 0, 16, 16, 16)
    g.addColorStop(0, 'rgba(255,255,255,1)')
    g.addColorStop(0.35, 'rgba(255,255,255,0.5)')
    g.addColorStop(1, 'rgba(255,255,255,0)')
    x.fillStyle = g
    x.fillRect(0, 0, 32, 32)
    moteTex = new THREE.CanvasTexture(c)
    moteTex.userData.keep = true
  }
  return moteTex
}
