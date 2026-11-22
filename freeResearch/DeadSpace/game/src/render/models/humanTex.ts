// 人形貼圖集：一張 512×512 的程序化貼圖（4×4 格、每格 128 px），一格一種表面（布、帆布、絎縫、針織、迷彩、皮革、橡膠、
// 濾網、皮膚、頭髮、模板字、警示斜紋、烤漆、裝甲板、金屬、面罩玻璃）。
// 每格只存「明暗＋粗糙度＋金屬度＋高度」，顏色由頂點色決定：所有人形共用同一個材質（每塊骨架一個 draw call），
// 不同職業、玩家、防護服只差在頂點色與 UV 落在哪一格（美術聖經 §6：底色變化、粗糙度變化、邊緣磨損）。
import * as THREE from 'three'

/** 格子名 → 位置（col, row）；金屬、玻璃這類高金屬度的放在角落，mipmap 互相滲色時影響最小 */
export const TILES = {
  fabric: [0, 0],
  canvas: [1, 0],
  quilt: [2, 0],
  knit: [3, 0],
  camo: [0, 1],
  leather: [1, 1],
  rubber: [2, 1],
  grille: [3, 1],
  skin: [0, 2],
  hair: [1, 2],
  stencil: [2, 2],
  hazard: [3, 2],
  paint: [0, 3],
  plate: [1, 3],
  metal: [2, 3],
  glass: [3, 3],
} as const

export type Tile = keyof typeof TILES

export const ATLAS = 512
export const CELL = 128
/** 零件的 UV 只用到格子中間這一塊（四周留邊，遠距離的 mipmap 不會吃到隔壁格）*/
export const PAD = 14

interface Texel {
  /** 明暗（乘上頂點色）*/
  a: number
  r: number
  m: number
  /** 高度（法線貼圖）*/
  h: number
}

function hash(x: number, y: number, s: number): number {
  let h = Math.imul(x | 0, 374761393) + Math.imul(y | 0, 668265263) + Math.imul(s | 0, 2147483647)
  h = Math.imul(h ^ (h >>> 13), 1274126177)
  return ((h ^ (h >>> 16)) >>> 0) / 4294967296
}

/** 值雜訊（0..1），週期 period 格 */
function vnoise(x: number, y: number, s: number): number {
  const xi = Math.floor(x)
  const yi = Math.floor(y)
  const xf = x - xi
  const yf = y - yi
  const a = hash(xi, yi, s)
  const b = hash(xi + 1, yi, s)
  const c = hash(xi, yi + 1, s)
  const d = hash(xi + 1, yi + 1, s)
  const u = xf * xf * (3 - 2 * xf)
  const v = yf * yf * (3 - 2 * yf)
  return a + (b - a) * u + (c - a) * v + (a - b - c + d) * u * v
}

function fbm(x: number, y: number, oct: number, s: number): number {
  let sum = 0
  let amp = 0.5
  let norm = 0
  let f = 1
  for (let i = 0; i < oct; i++) {
    sum += vnoise(x * f, y * f, s + i * 31) * amp
    norm += amp
    amp *= 0.5
    f *= 2
  }
  return sum / norm
}

const clamp01 = (v: number) => (v < 0 ? 0 : v > 1 ? 1 : v)
const smooth = (a: number, b: number, x: number) => {
  const t = clamp01((x - a) / (b - a))
  return t * t * (3 - 2 * t)
}

/** 零星的掉漆斑（0..1）：雜訊切出的不規則小塊。邊緣磨損另外由頂點色做（斜角面變亮，見 humanKit bake）*/
function chip(x: number, y: number, s: number): number {
  return smooth(0.7, 0.8, fbm(x / 7, y / 7, 3, s))
}

/** 斜劃痕（細亮線）*/
function scratches(x: number, y: number, s: number, n: number): number {
  let v = 0
  for (let i = 0; i < n; i++) {
    const ox = hash(i, 1, s) * CELL
    const oy = hash(i, 2, s) * CELL
    const ang = hash(i, 3, s) * Math.PI
    const len = 12 + hash(i, 4, s) * 30
    const dx = x - ox
    const dy = y - oy
    const along = dx * Math.cos(ang) + dy * Math.sin(ang)
    const across = -dx * Math.sin(ang) + dy * Math.cos(ang)
    if (Math.abs(along) < len && Math.abs(across) < 0.6) v = Math.max(v, 1 - Math.abs(along) / len)
  }
  return v
}

// 模板字：3×5 點陣的幾個假字元（不是真的字，只是「印著編號」的感覺）
const GLYPHS = [
  0b111101101101111, 0b010110010010111, 0b111001111100111, 0b111001011001111, 0b101101111001001,
  0b111100111001111, 0b110101110101110, 0b111100100100111,
]

const GEN: Record<Tile, (x: number, y: number) => Texel> = {
  fabric: (x, y) => {
    // 細斜紋＋低頻皺褶＋髒污
    const tw = ((x + y) & 1) === 0 ? 0.012 : -0.008
    const fold = (fbm(x / 22, y / 30, 3, 11) - 0.5) * 0.1
    const dirt = Math.max(0, fbm(x / 40, y / 40, 3, 12) - 0.55) * 0.6
    return { a: 0.9 + tw + fold - dirt, r: 0.82 + dirt * 0.2 - tw, m: 0, h: 0.5 + tw * 2 + fold * 1.5 }
  },
  canvas: (x, y) => {
    // 粗平紋＋車縫線（工作服）
    const w = (x & 1 ? -0.015 : 0) + (y & 1 ? -0.012 : 0)
    const yy = y - PAD
    const seam = (yy > 18 && yy < 21) || (yy > 78 && yy < 81) ? ((x >> 1) % 3 !== 0 ? 1 : 0) : 0
    const dirt = Math.max(0, fbm(x / 30, y / 30, 3, 21) - 0.5) * 0.7
    return { a: 0.88 + w + seam * 0.04 - dirt, r: 0.88 + dirt * 0.1, m: 0, h: 0.5 + w * 2 + seam * 0.2 }
  },
  quilt: (x, y) => {
    // 菱形絎縫：縫線凹、格內鼓
    const u = (x - PAD) / (CELL - PAD * 2)
    const v = (y - PAD) / (CELL - PAD * 2)
    const d1 = Math.abs((((u + v) * 3) % 1) - 0.5)
    const d2 = Math.abs((((((u - v) * 3) % 1) + 1) % 1) - 0.5)
    const groove = 1 - smooth(0.0, 0.08, 0.5 - Math.max(d1, d2))
    const puff = Math.min(0.5 - d1, 0.5 - d2)
    return { a: 0.9 - groove * 0.22 + puff * 0.1, r: 0.7 + groove * 0.2, m: 0, h: 0.3 + puff * 1.2 }
  },
  knit: (x, y) => {
    const rib = Math.sin((x * Math.PI) / 3) * 0.5 + 0.5
    const n = (vnoise(x / 2, y / 2, 31) - 0.5) * 0.06
    return { a: 0.8 + rib * 0.12 + n, r: 0.92, m: 0, h: 0.4 + rib * 0.4 }
  },
  camo: (x, y) => {
    // 三色迷彩（亮度三階，頂點色決定色相）＋布紋
    const n = fbm(x / 26, y / 20, 4, 41)
    const lvl = n < 0.42 ? 0.5 : n < 0.58 ? 0.74 : 1
    const tw = ((x + y) & 3) < 2 ? 0.02 : -0.01
    return { a: lvl * (0.95 + tw), r: 0.86, m: 0, h: 0.5 + tw * 2 }
  },
  leather: (x, y) => {
    const peb = vnoise(x / 2.2, y / 2.2, 51)
    const crease = Math.abs(fbm(x / 18, y / 9, 3, 52) - 0.5) < 0.018 ? 0.5 : 0
    const wear = fbm(x / 25, y / 25, 3, 53)
    return {
      a: 0.78 + peb * 0.1 - crease * 0.15 + (wear - 0.5) * 0.2,
      r: 0.62 - peb * 0.12 + crease * 0.2 - wear * 0.1,
      m: 0,
      h: 0.5 + peb * 0.25 - crease * 0.3,
    }
  },
  rubber: (x, y) => {
    const g = vnoise(x / 1.5, y / 1.5, 61)
    const scuff = Math.max(0, fbm(x / 20, y / 20, 3, 62) - 0.6) * 1.2
    return { a: 0.85 + (g - 0.5) * 0.08 + scuff * 0.3, r: 0.9 - scuff * 0.25, m: 0, h: 0.5 + g * 0.1 }
  },
  grille: (x, y) => {
    // 打孔濾網（防毒面具濾罐、散熱孔）
    const cx = ((x - PAD) % 8) - 4
    const cy = ((y - PAD) % 8) - 4
    const hole = cx * cx + cy * cy < 6 ? 1 : 0
    return { a: hole ? 0.18 : 0.8, r: hole ? 0.9 : 0.45, m: hole ? 0 : 0.55, h: hole ? 0.1 : 0.6 }
  },
  skin: (x, y) => {
    // 淡淡的血色斑與毛孔（近看不會像髒污）
    const b = fbm(x / 30, y / 30, 2, 71) - 0.5
    const f = vnoise(x / 2, y / 2, 72) - 0.5
    return { a: 0.97 + b * 0.04 + f * 0.012, r: 0.58 + b * 0.14 + f * 0.04, m: 0, h: 0.5 + f * 0.035 }
  },
  hair: (x, y) => {
    // 髮絲：沿 v 方向的細條紋（每欄亮度不同，沿 y 緩慢變化）
    const strand = hash(x, 0, 81) * 0.5 + vnoise(x / 1.3, y / 26, 82) * 0.5
    const clump = fbm(x / 9, y / 40, 2, 83)
    return {
      a: 0.62 + strand * 0.3 + (clump - 0.5) * 0.2,
      r: 0.5 + (1 - strand) * 0.25,
      m: 0,
      h: 0.4 + strand * 0.5,
    }
  },
  stencil: (x, y) => {
    // 烤漆底＋一排模板字（編號、警語）
    const base = 0.86 + (fbm(x / 20, y / 20, 3, 91) - 0.5) * 0.08
    const gx = Math.floor((x - 24) / 4)
    const gy = Math.floor((y - 54) / 4)
    let ink = 0
    if (gy >= 0 && gy < 5 && gx >= 0 && gx < 20 && gx % 4 !== 3) {
      const g = GLYPHS[Math.floor(gx / 4) % GLYPHS.length]
      const bit = 14 - (gy * 3 + (gx % 4))
      ink = (g >> bit) & 1 ? 1 : 0
    }
    const worn = fbm(x / 6, y / 6, 2, 92) > 0.62 ? 0.5 : 1
    return { a: base - ink * 0.62 * worn, r: 0.5 + ink * 0.15, m: 0.05, h: 0.5 }
  },
  hazard: (x, y) => {
    // 警示斜紋（亮＝警示色、暗＝黑）＋磨損
    const stripe = ((x + y) >> 4) & 1
    const wear = fbm(x / 8, y / 8, 3, 101) > 0.66 ? 1 : 0
    const a = stripe ? 0.12 : 1
    return { a: wear ? 0.55 : a, r: wear ? 0.35 : 0.5, m: wear ? 0.6 : 0.05, h: 0.5 - wear * 0.05 }
  },
  paint: (x, y) => {
    // 烤漆：細雜訊、刮痕、邊緣掉漆（露出金屬）
    const n = (fbm(x / 14, y / 14, 3, 111) - 0.5) * 0.06
    const dirt = Math.max(0, fbm(x / 36, y / 36, 3, 112) - 0.55) * 0.5
    const c = chip(x, y, 113)
    const sc = scratches(x, y, 114, 9)
    const bare = Math.max(c, sc * 0.8)
    // 掉漆處偏亮、偏灰、略有金屬感（站內沒有環境反射，金屬度太高會變黑）
    return {
      a: 0.92 + n - dirt + bare * 0.14,
      r: 0.42 + dirt * 0.4 - bare * 0.1,
      m: 0.04 + bare * 0.28,
      h: 0.5 - c * 0.06 - sc * 0.05,
    }
  },
  plate: (x, y) => {
    // 裝甲板：烤漆＋板縫凹槽＋鉚釘
    const p = GEN.paint(x, y)
    const sx = Math.abs(x - 64)
    const sy = Math.abs(y - 48)
    const seam = sx < 1.2 || sy < 1.2 ? 1 : 0
    let rivet = 0
    for (const [rx, ry] of [
      [56, 40],
      [72, 40],
      [56, 56],
      [72, 56],
      [28, 44],
      [100, 52],
    ]) {
      const d = (x - rx) ** 2 + (y - ry) ** 2
      if (d < 4) rivet = 1
    }
    return {
      a: p.a * (seam ? 0.45 : 1) + rivet * 0.1,
      r: seam ? 0.85 : rivet ? 0.3 : p.r,
      m: rivet ? 0.7 : p.m,
      h: seam ? 0.15 : rivet ? 0.85 : p.h,
    }
  },
  metal: (x, y) => {
    // 拉絲金屬
    const brush = vnoise(x / 40, y * 1.7, 121) * 0.6 + vnoise(x / 9, y * 0.9, 122) * 0.4
    const sc = scratches(x, y, 123, 6)
    return {
      a: 0.82 + brush * 0.16 + sc * 0.1,
      r: 0.3 + (1 - brush) * 0.14 + sc * 0.1,
      m: 0.72,
      h: 0.5 + brush * 0.04,
    }
  },
  glass: (x, y) => {
    // 面罩玻璃：上亮下暗的反光漸層＋淡指紋
    const v = (y - PAD) / (CELL - PAD * 2)
    const smudge = Math.max(0, fbm(x / 10, y / 10, 3, 131) - 0.6) * 0.8
    return { a: 0.75 - v * 0.3, r: 0.06 + smudge * 0.25, m: 0.6, h: 0.5 }
  },
}

export interface HumanAtlas {
  map: THREE.Texture
  orm: THREE.Texture
  normal: THREE.Texture
}

let atlas: HumanAtlas | null = null

function tex(c: HTMLCanvasElement, srgb: boolean): THREE.CanvasTexture {
  const t = new THREE.CanvasTexture(c)
  t.colorSpace = srgb ? THREE.SRGBColorSpace : THREE.NoColorSpace
  t.wrapS = t.wrapT = THREE.ClampToEdgeWrapping
  t.anisotropy = 4
  t.generateMipmaps = true
  t.minFilter = THREE.LinearMipmapLinearFilter
  t.userData.shared = true
  t.needsUpdate = true
  return t
}

/** 產生（第一次呼叫時）並回傳共用的人形貼圖集 */
export function humanAtlas(): HumanAtlas {
  if (atlas) return atlas
  const S = ATLAS
  const mk = () => {
    const c = document.createElement('canvas')
    c.width = c.height = S
    return [c, c.getContext('2d', { willReadFrequently: true })!] as const
  }
  const [ca, xa] = mk()
  const [co, xo] = mk()
  const [cn, xn] = mk()
  const a = xa.createImageData(S, S)
  const o = xo.createImageData(S, S)
  const n = xn.createImageData(S, S)
  const h = new Float32Array(S * S)
  for (const [name, [tc, tr]] of Object.entries(TILES) as [Tile, readonly [number, number]][]) {
    const gen = GEN[name]
    for (let y = 0; y < CELL; y++) {
      for (let x = 0; x < CELL; x++) {
        const t = gen(x, y)
        const px = tc * CELL + x
        const py = tr * CELL + y
        const i = py * S + px
        const k = i * 4
        const lum = clamp01(t.a) * 255
        a.data[k] = a.data[k + 1] = a.data[k + 2] = lum
        a.data[k + 3] = 255
        o.data[k] = 255
        o.data[k + 1] = clamp01(t.r) * 255
        o.data[k + 2] = clamp01(t.m) * 255
        o.data[k + 3] = 255
        h[i] = t.h
      }
    }
  }
  // 高度 → 法線（格子邊界取到隔壁格的值也沒關係：零件 UV 不會用到邊）
  for (let y = 0; y < S; y++) {
    for (let x = 0; x < S; x++) {
      const l = h[y * S + Math.max(0, x - 1)]
      const r = h[y * S + Math.min(S - 1, x + 1)]
      const u = h[Math.max(0, y - 1) * S + x]
      const d = h[Math.min(S - 1, y + 1) * S + x]
      let nx = (l - r) * 3
      let ny = (u - d) * 3
      const len = Math.hypot(nx, ny, 1)
      nx /= len
      ny /= len
      const k = (y * S + x) * 4
      n.data[k] = (nx * 0.5 + 0.5) * 255
      n.data[k + 1] = (ny * 0.5 + 0.5) * 255
      n.data[k + 2] = (1 / len) * 0.5 * 255 + 127.5
      n.data[k + 3] = 255
    }
  }
  xa.putImageData(a, 0, 0)
  xo.putImageData(o, 0, 0)
  xn.putImageData(n, 0, 0)
  atlas = { map: tex(ca, true), orm: tex(co, false), normal: tex(cn, false) }
  return atlas
}

/** 格子的 UV 範圍（已扣掉留邊）：[u0, v0, u1, v1]；v 依 three 的慣例由下往上（canvas 第 0 列在最上面）*/
export function tileRect(t: Tile): [number, number, number, number] {
  const [c, r] = TILES[t]
  const u0 = (c * CELL + PAD) / ATLAS
  const u1 = ((c + 1) * CELL - PAD) / ATLAS
  // CanvasTexture flipY = true：canvas 的第 r 列 → v = 1 - r/4
  const v1 = 1 - (r * CELL + PAD) / ATLAS
  const v0 = 1 - ((r + 1) * CELL - PAD) / ATLAS
  return [u0, v0, u1, v1]
}
