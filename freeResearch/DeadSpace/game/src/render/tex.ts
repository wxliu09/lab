// 程序化貼圖：載入時用 canvas 生成並快取（美術聖經 §6：底色變化、粗糙度變化、邊緣磨損）
import * as THREE from 'three'

/**
 * 貼圖快取。albedo 依色調各一張（key 含 tint）；粗糙度與法線跟色調無關，以「種類＋variant＋seed」為 key 共用
 * （同一組雜訊、同一套接縫，不同色調的地板／牆板／金屬共用同一張法線與粗糙度，GPU 記憶體約省 2/3）。
 */
const cache = new Map<string, THREE.Texture>()

/** 貼圖庫快取的共用貼圖：釋放站點時不能 dispose */
export function isSharedTexture(t: THREE.Texture): boolean {
  if (t.userData.shared || t.userData.keep) return true
  for (const v of cache.values()) if (v === t) return true
  return false
}

function canvas(w: number, h: number): [HTMLCanvasElement, CanvasRenderingContext2D] {
  const c = document.createElement('canvas')
  c.width = w
  c.height = h
  return [c, c.getContext('2d', { willReadFrequently: true })!]
}

// ───── 雜訊 ─────

function hash(x: number, y: number, s: number): number {
  let h = x * 374761393 + y * 668265263 + s * 2147483647
  h = (h ^ (h >>> 13)) * 1274126177
  return ((h ^ (h >>> 16)) >>> 0) / 4294967296
}

function vnoise(x: number, y: number, s: number, period: number): number {
  const xi = Math.floor(x)
  const yi = Math.floor(y)
  const xf = x - xi
  const yf = y - yi
  const p = (a: number) => ((a % period) + period) % period
  const a = hash(p(xi), p(yi), s)
  const b = hash(p(xi + 1), p(yi), s)
  const c = hash(p(xi), p(yi + 1), s)
  const d = hash(p(xi + 1), p(yi + 1), s)
  const u = xf * xf * (3 - 2 * xf)
  const v = yf * yf * (3 - 2 * yf)
  return a + (b - a) * u + (c - a) * v + (a - b - c + d) * u * v
}

/** 可無縫拼接的 fbm（0..1）*/
export function fbm(x: number, y: number, size: number, oct = 5, seed = 1, base = 4): number {
  let sum = 0
  let amp = 0.5
  let freq = base
  let norm = 0
  for (let i = 0; i < oct; i++) {
    sum += amp * vnoise((x / size) * freq, (y / size) * freq, seed + i * 17, freq)
    norm += amp
    amp *= 0.5
    freq *= 2
  }
  return sum / norm
}

function noiseField(size: number, oct: number, seed: number, base = 4): Float32Array {
  const f = new Float32Array(size * size)
  for (let y = 0; y < size; y++) for (let x = 0; x < size; x++) f[y * size + x] = fbm(x, y, size, oct, seed, base)
  return f
}

/**
 * 站內常用、色調很多的貼圖（地板、牆板、金屬、布料）的雜訊場保留起來：同一組 seed 換色調時不用重算 fbm。
 * 組合是程式裡寫死的幾種 seed，總量約 6 MB。唯讀使用。
 */
const fields = new Map<string, Float32Array>()
function field(size: number, oct: number, seed: number, base = 4): Float32Array {
  const k = `${size}:${oct}:${seed}:${base}`
  let f = fields.get(k)
  if (!f) {
    f = noiseField(size, oct, seed, base)
    fields.set(k, f)
  }
  return f
}

/** 共用的粗糙度＋法線（沒有就回傳 null，由呼叫端產生後 putDetail）*/
function getDetail(dkey: string): { roughnessMap: THREE.Texture; normalMap: THREE.Texture } | null {
  const r = cache.get(dkey + ':r')
  const n = cache.get(dkey + ':n')
  return r && n ? { roughnessMap: r, normalMap: n } : null
}

function putDetail(dkey: string, rough: ImageData, height: Float32Array, size: number, strength: number): { roughnessMap: THREE.Texture; normalMap: THREE.Texture } {
  const [cr, xr] = canvas(size, size)
  const [cn, xn] = canvas(size, size)
  xr.putImageData(rough, 0, 0)
  xn.putImageData(heightToNormal(height, size, strength), 0, 0)
  const d = { roughnessMap: toTex(cr, false), normalMap: toTex(cn, false) }
  cache.set(dkey + ':r', d.roughnessMap)
  cache.set(dkey + ':n', d.normalMap)
  return d
}

/** 高度圖 → 法線貼圖 */
function heightToNormal(h: Float32Array, size: number, strength: number): ImageData {
  const img = new ImageData(size, size)
  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      const l = h[y * size + ((x - 1 + size) % size)]
      const r = h[y * size + ((x + 1) % size)]
      const u = h[((y - 1 + size) % size) * size + x]
      const d = h[((y + 1) % size) * size + x]
      let nx = (l - r) * strength
      let ny = (u - d) * strength
      let nz = 1
      const len = Math.hypot(nx, ny, nz)
      nx /= len
      ny /= len
      nz /= len
      const i = (y * size + x) * 4
      img.data[i] = (nx * 0.5 + 0.5) * 255
      img.data[i + 1] = (ny * 0.5 + 0.5) * 255
      img.data[i + 2] = (nz * 0.5 + 0.5) * 255
      img.data[i + 3] = 255
    }
  }
  return img
}

function toTex(c: HTMLCanvasElement, srgb: boolean, repeat = true): THREE.CanvasTexture {
  const t = new THREE.CanvasTexture(c)
  t.colorSpace = srgb ? THREE.SRGBColorSpace : THREE.NoColorSpace
  if (repeat) t.wrapS = t.wrapT = THREE.RepeatWrapping
  t.anisotropy = 8
  t.generateMipmaps = true
  t.minFilter = THREE.LinearMipmapLinearFilter
  t.needsUpdate = true
  return t
}

export interface PbrSet {
  map: THREE.Texture
  roughnessMap: THREE.Texture
  normalMap: THREE.Texture
  aoMap?: THREE.Texture
}

function hexRgb(hex: string): [number, number, number] {
  const n = parseInt(hex.slice(1), 16)
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255]
}

// ───── 地板金屬板（2×2 m 一個 tile）─────

/** 地板材質種類：站內金屬／磁磚／橡膠／混凝土，室外草地與岩地 */
export type FloorVariant = 'plate' | 'grate' | 'tile' | 'rubber' | 'concrete' | 'grass' | 'rock'

export function floorSet(variant: FloorVariant, tint: string, seed = 3): PbrSet {
  if (variant === 'grass') return grassSet(tint, seed)
  if (variant === 'rock') return rockSet(tint, seed, 'floor')
  const key = `floor:${variant}:${tint}:${seed}`
  const dkey = `floor:${variant}:${seed}`
  const have = cache.get(key + ':map')
  const shared = getDetail(dkey)
  if (have && shared) return { map: have, ...shared }
  const S = 512
  const grime = field(S, 6, seed, 6)
  const fine = field(S, 3, seed + 9, 32)
  const height = new Float32Array(S * S)
  const [ca, xa] = canvas(S, S)
  const albedo = xa.createImageData(S, S)
  const rough = new ImageData(S, S)
  const [tr, tg, tb] = hexRgb(tint)
  const panel = variant === 'tile' ? 128 : 256
  for (let y = 0; y < S; y++) {
    for (let x = 0; x < S; x++) {
      const i = y * S + x
      const px = x % panel
      const py = y % panel
      const edge = Math.min(px, py, panel - 1 - px, panel - 1 - py)
      let hgt = 0.5
      let base = 1
      let r = 0.62
      // 面板接縫
      if (edge < 2) {
        hgt = 0.05
        base = 0.35
        r = 0.9
      } else if (edge < 6) {
        hgt = 0.5 - (6 - edge) * 0.04
        base = 0.85
        r = 0.45 // 邊緣被磨亮
      }
      // 防滑紋（菱形）
      if (variant === 'plate' && edge >= 6) {
        const u = (px + py) % 24
        const v = (px - py + 240) % 24
        const dia = (u < 3 && v > 8 && v < 16) || (v < 3 && u > 8 && u < 16)
        if (dia) {
          hgt = 0.68
          base = 1.12
          r = 0.4
        }
      }
      if (variant === 'grate' && edge >= 4) {
        const g = (px % 16 < 3 || py % 16 < 3) ? 1 : 0
        if (!g) {
          hgt = 0.12
          base = 0.25
          r = 0.95
        } else {
          hgt = 0.6
          base = 1.15
          r = 0.35
        }
      }
      if (variant === 'concrete') {
        hgt = 0.5 + (fine[i] - 0.5) * 0.3
        base = 0.85 + fine[i] * 0.3
        r = 0.85
      }
      if (variant === 'rubber') {
        const dot = ((px % 20) - 10) ** 2 + ((py % 20) - 10) ** 2 < 14
        if (dot) {
          hgt = 0.7
          base = 1.05
        }
        r = 0.88
      }
      // 鉚釘
      if (variant !== 'concrete' && variant !== 'rubber') {
        const rx = px < panel / 2 ? px - 14 : px - (panel - 14)
        const ry = py < panel / 2 ? py - 14 : py - (panel - 14)
        if (rx * rx + ry * ry < 16) {
          hgt = 0.8 - (rx * rx + ry * ry) * 0.02
          base = 1.25
          r = 0.3
        }
      }
      // 髒污：凹處與隨機區塊
      const g = grime[i]
      const dirt = Math.max(0, g - 0.5) * 1.1 + (hgt < 0.3 ? 0.25 : 0)
      const scratch = fine[i] > 0.86 ? 0.05 : 0
      const lum = base * (0.93 + fine[i] * 0.14) * (1 - dirt * 0.35) + scratch
      height[i] = hgt + (fine[i] - 0.5) * 0.04
      const o = i * 4
      albedo.data[o] = Math.min(255, tr * lum * (1 - dirt * 0.1))
      albedo.data[o + 1] = Math.min(255, tg * lum * (1 - dirt * 0.15))
      albedo.data[o + 2] = Math.min(255, tb * lum * (1 - dirt * 0.25))
      albedo.data[o + 3] = 255
      const rr = Math.min(1, r + dirt * 0.25 - scratch * 2 + (fine[i] - 0.5) * 0.12)
      rough.data[o] = rough.data[o + 1] = rough.data[o + 2] = rr * 255
      rough.data[o + 3] = 255
    }
  }
  xa.putImageData(albedo, 0, 0)
  // 偶爾的油漆標記
  xa.globalAlpha = 0.5
  xa.fillStyle = '#c9a23a'
  xa.font = 'bold 28px monospace'
  xa.fillText(String((seed * 37) % 90 + 10), 30, 60)
  xa.globalAlpha = 1
  const map = toTex(ca, true)
  cache.set(key + ':map', map)
  return { map, ...(shared ?? putDetail(dkey, rough, height, S, 6)) }
}

// ───── 牆板（u = 沿牆 2 m，v = 牆高）─────

export function wallSet(tint: string, accent: string, seed = 5): PbrSet {
  const key = `wall:${tint}:${accent}:${seed}`
  const dkey = `wall:${seed}`
  const have = cache.get(key + ':map')
  const shared = getDetail(dkey)
  if (have && shared) return { map: have, ...shared }
  const W = 512
  const H = 512
  const grime = field(W, 5, seed, 3)
  const fine = field(W, 3, seed + 3, 32)
  const [ca, xa] = canvas(W, H)
  const albedo = xa.createImageData(W, H)
  const rough = new ImageData(W, H)
  const height = new Float32Array(W * H)
  const [tr, tg, tb] = hexRgb(tint)
  const [ar, ag, ab] = hexRgb(accent)
  for (let y = 0; y < H; y++) {
    for (let x = 0; x < W; x++) {
      const i = y * W + x
      // 上下分段：頂部飾條 / 主面板 / 底部踢腳（警示斜紋）
      const v = y / H
      let hgt = 0.5
      let col: [number, number, number] = [tr, tg, tb]
      let r = 0.55
      const px = x % 256
      if (v > 0.9) {
        // 踢腳板：黃黑斜紋
        const stripe = Math.floor((x + y) / 22) % 2 === 0
        col = stripe ? [255, 194, 61] : [26, 26, 26]
        r = 0.7
        hgt = 0.6
      } else if (v < 0.08) {
        col = [tr * 0.6, tg * 0.6, tb * 0.6]
        hgt = 0.65
        r = 0.4
      } else if (v > 0.3 && v < 0.335) {
        // 燈條溝槽（emissive 另外做）
        col = [ar * 0.5, ag * 0.5, ab * 0.5]
        hgt = 0.3
        r = 0.3
      } else {
        const seam = px < 3 || px > 252 || Math.abs(v - 0.62) < 0.006
        if (seam) {
          hgt = 0.1
          col = [tr * 0.35, tg * 0.35, tb * 0.35]
          r = 0.9
        }
        // 通風口
        const vx = (x + 128) % 512
        if (vx > 60 && vx < 180 && v > 0.68 && v < 0.84 && Math.floor(y / 6) % 2 === 0) {
          hgt = 0.15
          col = [18, 20, 23]
          r = 0.9
        }
      }
      const dirt = Math.max(0, grime[i] - 0.5) * 1.6 + (v > 0.8 ? 0.2 : 0)
      const lum = (0.9 + fine[i] * 0.2) * (1 - dirt * 0.4)
      const o = i * 4
      albedo.data[o] = Math.min(255, col[0] * lum)
      albedo.data[o + 1] = Math.min(255, col[1] * lum)
      albedo.data[o + 2] = Math.min(255, col[2] * lum * (1 - dirt * 0.1))
      albedo.data[o + 3] = 255
      const rr = Math.min(1, r + dirt * 0.25 + (fine[i] - 0.5) * 0.1)
      rough.data[o] = rough.data[o + 1] = rough.data[o + 2] = rr * 255
      rough.data[o + 3] = 255
      height[i] = hgt
    }
  }
  xa.putImageData(albedo, 0, 0)
  // 編號貼紙
  for (let k = 0; k < 2; k++) {
    const sx = 40 + k * 256 + (seed * 13) % 60
    xa.fillStyle = 'rgba(230,236,240,0.85)'
    xa.fillRect(sx, 170, 54, 22)
    xa.fillStyle = '#20262c'
    xa.font = 'bold 15px monospace'
    xa.fillText(`${String.fromCharCode(65 + ((seed + k) % 26))}-${(seed * 7 + k * 31) % 900 + 100}`, sx + 4, 187)
  }
  const map = toTex(ca, true)
  cache.set(key + ':map', map)
  return { map, ...(shared ?? putDetail(dkey, rough, height, W, 5)) }
}

// ───── 通用金屬（道具、機殼）─────

export function metalSet(tint: string, seed = 11, panels = true): PbrSet {
  const key = `metal:${tint}:${seed}:${panels}`
  const dkey = `metal:${seed}:${panels}`
  const have = cache.get(key + ':map')
  const shared = getDetail(dkey)
  if (have && shared) return { map: have, ...shared }
  const S = 256
  const grime = field(S, 5, seed, 2)
  const fine = field(S, 3, seed + 1, 24)
  const [ca, xa] = canvas(S, S)
  const a = xa.createImageData(S, S)
  const r = new ImageData(S, S)
  const h = new Float32Array(S * S)
  const [tr, tg, tb] = hexRgb(tint)
  for (let y = 0; y < S; y++) {
    for (let x = 0; x < S; x++) {
      const i = y * S + x
      const seam = panels && (x % 128 < 2 || y % 128 < 2)
      const edgeWear = panels && (x % 128 < 6 || y % 128 < 6) && !seam
      const dirt = Math.max(0, grime[i] - 0.5) * 1.5
      const lum = (seam ? 0.4 : 1) * (0.88 + fine[i] * 0.24) * (1 - dirt * 0.35) + (edgeWear ? 0.12 : 0)
      const o = i * 4
      a.data[o] = Math.min(255, tr * lum)
      a.data[o + 1] = Math.min(255, tg * lum)
      a.data[o + 2] = Math.min(255, tb * lum)
      a.data[o + 3] = 255
      const rr = Math.min(1, (seam ? 0.9 : edgeWear ? 0.3 : 0.5) + dirt * 0.3 + (fine[i] - 0.5) * 0.15)
      r.data[o] = r.data[o + 1] = r.data[o + 2] = rr * 255
      r.data[o + 3] = 255
      h[i] = seam ? 0.2 : 0.5 + (fine[i] - 0.5) * 0.05
    }
  }
  xa.putImageData(a, 0, 0)
  const map = toTex(ca, true)
  cache.set(key + ':map', map)
  return { map, ...(shared ?? putDetail(dkey, r, h, S, 4)) }
}

// ───── 布料／衣物 ─────

export function fabricSet(tint: string, seed = 21): PbrSet {
  const key = `fabric:${tint}:${seed}`
  const dkey = `fabric:${seed}`
  const have = cache.get(key + ':map')
  const shared = getDetail(dkey)
  if (have && shared) return { map: have, ...shared }
  const S = 128
  const grime = field(S, 4, seed, 2)
  const [ca, xa] = canvas(S, S)
  const a = xa.createImageData(S, S)
  const r = new ImageData(S, S)
  const h = new Float32Array(S * S)
  const [tr, tg, tb] = hexRgb(tint)
  for (let y = 0; y < S; y++) {
    for (let x = 0; x < S; x++) {
      const i = y * S + x
      // 細斜紋（1 px 交錯，俯視距離下 mipmap 會融成布面質感、不會看成棋盤格）＋低頻皺褶
      const weave = ((x + y) & 1) * 0.018 + (((x >> 1) + y) & 1) * 0.01
      const fold = (grime[(i * 7) % (S * S)] - 0.5) * 0.08
      const dirt = Math.max(0, grime[i] - 0.55) * 1.4
      const lum = (0.95 + weave + fold) * (1 - dirt * 0.35)
      const o = i * 4
      a.data[o] = Math.min(255, tr * lum)
      a.data[o + 1] = Math.min(255, tg * lum)
      a.data[o + 2] = Math.min(255, tb * lum)
      a.data[o + 3] = 255
      const rr = Math.min(1, 0.8 + dirt * 0.12 - weave * 0.8 + fold * 0.5)
      r.data[o] = r.data[o + 1] = r.data[o + 2] = rr * 255
      r.data[o + 3] = 255
      h[i] = 0.5 + weave * 1.2 + fold * 0.8
    }
  }
  xa.putImageData(a, 0, 0)
  const map = toTex(ca, true)
  cache.set(key + ':map', map)
  return { map, ...(shared ?? putDetail(dkey, r, h, S, 3)) }
}

/** 皮膚：淡淡的膚色雜斑（雀斑／血色）＋粗糙度變化（額頭鼻樑較亮、其餘霧面）＋極淡的毛孔法線 */
export function skinSet(tint: string, seed = 61): PbrSet {
  const key = `skin:${tint}:${seed}`
  const dkey = `skin:${seed}`
  const have = cache.get(key + ':map')
  const shared = getDetail(dkey)
  if (have && shared) return { map: have, ...shared }
  const S = 64
  const blot = field(S, 3, seed, 2)
  const fine = noiseField(S, 2, seed + 1, 16)
  const [ca, xa] = canvas(S, S)
  const a = xa.createImageData(S, S)
  const r = new ImageData(S, S)
  const h = new Float32Array(S * S)
  const [tr, tg, tb] = hexRgb(tint)
  for (let i = 0; i < S * S; i++) {
    const b = blot[i] - 0.5
    const f = fine[i] - 0.5
    // 血色斑：紅通道略多、藍通道略少
    const lum = 0.97 + b * 0.08 + f * 0.04
    const o = i * 4
    a.data[o] = Math.min(255, tr * (lum + b * 0.03))
    a.data[o + 1] = Math.min(255, tg * lum)
    a.data[o + 2] = Math.min(255, tb * (lum - b * 0.03))
    a.data[o + 3] = 255
    const rr = Math.max(0, Math.min(1, 0.6 + b * 0.22 + f * 0.08))
    r.data[o] = r.data[o + 1] = r.data[o + 2] = rr * 255
    r.data[o + 3] = 255
    h[i] = 0.5 + f * 0.25
  }
  xa.putImageData(a, 0, 0)
  const map = toTex(ca, true)
  cache.set(key + ':map', map)
  return { map, ...(shared ?? putDetail(dkey, r, h, S, 1.2)) }
}

// ───── 全像螢幕（emissive）─────

export function screenTex(kind: 'ui' | 'radar' | 'dna' | 'vendor' | 'warn', color: string, seed = 1): THREE.Texture {
  const key = `screen:${kind}:${color}:${seed}`
  const have = cache.get(key)
  if (have) return have
  const [c, x] = canvas(256, 256)
  x.fillStyle = '#02070a'
  x.fillRect(0, 0, 256, 256)
  x.strokeStyle = color
  x.fillStyle = color
  x.lineWidth = 2
  let rs = seed * 9301 + 49297
  const rnd = () => ((rs = (rs * 9301 + 49297) % 233280) / 233280)
  if (kind === 'ui' || kind === 'vendor') {
    x.globalAlpha = 0.9
    x.strokeRect(10, 10, 236, 236)
    x.font = 'bold 18px monospace'
    x.fillText(kind === 'vendor' ? 'SUPPLY' : 'SYS.' + ((seed * 13) % 99), 20, 36)
    x.globalAlpha = 0.55
    for (let i = 0; i < 9; i++) {
      const w = 40 + rnd() * 170
      x.fillRect(20, 52 + i * 18, w, 7)
    }
    x.globalAlpha = 0.8
    x.beginPath()
    for (let i = 0; i <= 20; i++) {
      const px = 20 + i * 10.8
      const py = 225 - rnd() * 40
      if (i === 0) x.moveTo(px, py)
      else x.lineTo(px, py)
    }
    x.stroke()
  } else if (kind === 'radar') {
    x.globalAlpha = 0.7
    for (let r = 30; r < 128; r += 30) {
      x.beginPath()
      x.arc(128, 128, r, 0, Math.PI * 2)
      x.stroke()
    }
    x.beginPath()
    x.moveTo(128, 0)
    x.lineTo(128, 256)
    x.moveTo(0, 128)
    x.lineTo(256, 128)
    x.stroke()
    for (let i = 0; i < 7; i++) {
      x.beginPath()
      x.arc(30 + rnd() * 196, 30 + rnd() * 196, 4, 0, Math.PI * 2)
      x.fill()
    }
  } else if (kind === 'dna') {
    x.globalAlpha = 0.9
    for (let i = 0; i < 256; i += 4) {
      const a = Math.sin(i * 0.06) * 60
      x.fillRect(128 + a - 3, i, 6, 3)
      x.fillRect(128 - a - 3, i, 6, 3)
      if (i % 16 === 0) {
        x.globalAlpha = 0.4
        x.fillRect(128 - Math.abs(a), i, Math.abs(a) * 2, 2)
        x.globalAlpha = 0.9
      }
    }
  } else {
    x.globalAlpha = 0.85
    for (let i = -256; i < 512; i += 40) {
      x.beginPath()
      x.moveTo(i, 0)
      x.lineTo(i + 256, 256)
      x.lineWidth = 16
      x.stroke()
    }
  }
  // 掃描線
  x.globalAlpha = 0.18
  x.fillStyle = '#000'
  for (let y = 0; y < 256; y += 3) x.fillRect(0, y, 256, 1)
  x.globalAlpha = 1
  const t = toTex(c, true, false)
  cache.set(key, t)
  return t
}

/** 地面貼花：箭頭、編號、警示邊 */
export function decalTex(kind: 'arrow' | 'hazard' | 'cross' | 'pad' | 'ring' | 'glow' | 'hex' | 'chevron' | 'dash' | 'stain' | 'frame' | 'sweep', color = '#ffc23d'): THREE.Texture {
  const key = `decal:${kind}:${color}`
  const have = cache.get(key)
  if (have) return have
  const [c, x] = canvas(256, 256)
  x.clearRect(0, 0, 256, 256)
  x.fillStyle = color
  x.strokeStyle = color
  const wear = noiseField(64, 3, 7, 4)
  if (kind === 'arrow') {
    x.beginPath()
    x.moveTo(128, 30)
    x.lineTo(210, 130)
    x.lineTo(160, 130)
    x.lineTo(160, 226)
    x.lineTo(96, 226)
    x.lineTo(96, 130)
    x.lineTo(46, 130)
    x.closePath()
    x.fill()
  } else if (kind === 'hazard') {
    for (let i = -256; i < 512; i += 48) {
      x.beginPath()
      x.moveTo(i, 0)
      x.lineTo(i + 24, 0)
      x.lineTo(i + 280, 256)
      x.lineTo(i + 256, 256)
      x.closePath()
      x.fill()
    }
  } else if (kind === 'cross') {
    x.fillRect(98, 40, 60, 176)
    x.fillRect(40, 98, 176, 60)
  } else if (kind === 'pad') {
    x.lineWidth = 10
    x.beginPath()
    x.arc(128, 128, 110, 0, Math.PI * 2)
    x.stroke()
    x.lineWidth = 4
    x.beginPath()
    x.arc(128, 128, 84, 0, Math.PI * 2)
    x.stroke()
    x.font = 'bold 90px sans-serif'
    x.textAlign = 'center'
    x.textBaseline = 'middle'
    x.fillText('H', 128, 132)
  } else if (kind === 'ring') {
    x.lineWidth = 14
    x.beginPath()
    x.arc(128, 128, 104, 0, Math.PI * 2)
    x.stroke()
  } else if (kind === 'hex') {
    // 蜂巢格（傳送台）：一格 256 px 剛好拼接
    x.lineWidth = 5
    const r = 32
    const hw = Math.sqrt(3) * r
    for (let row = -1; row < 6; row++) {
      for (let col = -1; col < 5; col++) {
        const cx = col * hw + (row % 2 ? hw / 2 : 0)
        const cy = row * r * 1.5
        x.beginPath()
        for (let k = 0; k <= 6; k++) {
          const a = Math.PI / 6 + (k * Math.PI) / 3
          if (k === 0) x.moveTo(cx + Math.cos(a) * r, cy + Math.sin(a) * r)
          else x.lineTo(cx + Math.cos(a) * r, cy + Math.sin(a) * r)
        }
        x.stroke()
      }
    }
  } else if (kind === 'chevron') {
    x.lineWidth = 22
    x.lineJoin = 'miter'
    for (let k = 0; k < 3; k++) {
      x.globalAlpha = 0.45 + k * 0.25
      x.beginPath()
      x.moveTo(60 + k * 52, 40)
      x.lineTo(110 + k * 52, 128)
      x.lineTo(60 + k * 52, 216)
      x.stroke()
    }
    x.globalAlpha = 1
  } else if (kind === 'dash') {
    x.lineWidth = 10
    x.setLineDash([26, 18])
    x.beginPath()
    x.arc(128, 128, 108, 0, Math.PI * 2)
    x.stroke()
    x.setLineDash([])
  } else if (kind === 'stain') {
    // 不規則潑濺：大塊＋飛濺小點
    let rs = 977
    const rnd = () => ((rs = (rs * 9301 + 49297) % 233280) / 233280)
    for (let k = 0; k < 14; k++) {
      const a = rnd() * Math.PI * 2
      const d = rnd() * 46
      x.globalAlpha = 0.5 + rnd() * 0.4
      x.beginPath()
      x.ellipse(128 + Math.cos(a) * d, 128 + Math.sin(a) * d, 18 + rnd() * 30, 12 + rnd() * 22, rnd() * 3, 0, Math.PI * 2)
      x.fill()
    }
    for (let k = 0; k < 40; k++) {
      const a = rnd() * Math.PI * 2
      const d = 60 + rnd() * 60
      x.globalAlpha = 0.4 + rnd() * 0.5
      x.beginPath()
      x.arc(128 + Math.cos(a) * d, 128 + Math.sin(a) * d, 1.5 + rnd() * 5, 0, Math.PI * 2)
      x.fill()
    }
    x.globalAlpha = 1
  } else if (kind === 'sweep') {
    // 雷達掃描扇形：前緣亮、往後漸淡，外加刻度環
    for (let k = 0; k < 60; k++) {
      x.globalAlpha = Math.pow(1 - k / 60, 2) * 0.9
      x.beginPath()
      x.moveTo(128, 128)
      x.arc(128, 128, 124, -k * 0.018 - 0.018, -k * 0.018)
      x.closePath()
      x.fill()
    }
    x.globalAlpha = 0.5
    x.lineWidth = 2
    for (const r of [40, 80, 122]) {
      x.beginPath()
      x.arc(128, 128, r, 0, Math.PI * 2)
      x.stroke()
    }
    x.globalAlpha = 1
  } else if (kind === 'frame') {
    x.lineWidth = 8
    x.strokeRect(8, 8, 240, 240)
    x.lineWidth = 18
    for (const [cx, cy, dx, dy] of [[8, 8, 1, 1], [248, 8, -1, 1], [8, 248, 1, -1], [248, 248, -1, -1]]) {
      x.beginPath()
      x.moveTo(cx, cy + dy * 46)
      x.lineTo(cx, cy)
      x.lineTo(cx + dx * 46, cy)
      x.stroke()
    }
  } else {
    const g = x.createRadialGradient(128, 128, 0, 128, 128, 128)
    g.addColorStop(0, color)
    g.addColorStop(1, 'rgba(0,0,0,0)')
    x.fillStyle = g
    x.fillRect(0, 0, 256, 256)
  }
  // 磨損：挖掉一些像素
  if (kind !== 'glow' && kind !== 'ring' && kind !== 'sweep') {
    const img = x.getImageData(0, 0, 256, 256)
    for (let y = 0; y < 256; y++)
      for (let xx = 0; xx < 256; xx++) {
        const w = wear[(y >> 2) * 64 + (xx >> 2)]
        if (w > 0.62) img.data[(y * 256 + xx) * 4 + 3] *= Math.max(0, 1 - (w - 0.62) * 4)
      }
    x.putImageData(img, 0, 0)
  }
  const t = toTex(c, true, false)
  cache.set(key, t)
  return t
}

// ───── 室外：草地、岩地、岩壁、有機組織（翠原星、餘燼衛星、未識別物體）─────

/** key = albedo（含色調）；dkey = 粗糙度＋法線（不含色調，跨色調共用；make 收到 dkey 傳給 finishSet）*/
function cache3(key: string, dkey: string, make: (dkey: string) => PbrSet): PbrSet {
  const have = cache.get(key + ':map')
  const shared = getDetail(dkey)
  if (have && shared) return { map: have, ...shared }
  const set = make(dkey)
  cache.set(key + ':map', set.map)
  return set
}

function rand32(seed: number): () => number {
  let a = seed * 2654435761 + 1013904223
  return () => {
    a |= 0
    a = (a + 0x6d2b79f5) | 0
    let t = Math.imul(a ^ (a >>> 15), 1 | a)
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
}

/** 可無縫拼接的 Worley（F1、F2）：cells×cells 格、每格一點 */
function worley(size: number, cells: number, seed: number): { f1: Float32Array; f2: Float32Array; id: Float32Array } {
  const rnd = rand32(seed)
  const pts: [number, number][] = []
  for (let i = 0; i < cells * cells; i++) pts.push([rnd(), rnd()])
  const f1 = new Float32Array(size * size)
  const f2 = new Float32Array(size * size)
  const id = new Float32Array(size * size)
  const cs = size / cells
  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      const cx = Math.floor(x / cs)
      const cy = Math.floor(y / cs)
      let d1 = 1e9
      let d2 = 1e9
      let best = 0
      for (let oy = -1; oy <= 1; oy++) {
        for (let ox = -1; ox <= 1; ox++) {
          const gx = cx + ox
          const gy = cy + oy
          const wx = ((gx % cells) + cells) % cells
          const wy = ((gy % cells) + cells) % cells
          const k = wy * cells + wx
          const px = (gx + pts[k][0]) * cs
          const py = (gy + pts[k][1]) * cs
          const d = Math.hypot(px - x, py - y) / cs
          if (d < d1) {
            d2 = d1
            d1 = d
            best = k
          } else if (d < d2) d2 = d
        }
      }
      const i = y * size + x
      f1[i] = d1
      f2[i] = d2
      id[i] = (best * 0.618034) % 1
    }
  }
  return { f1, f2, id }
}

function finishSet(S: number, albedo: Uint8ClampedArray, rough: Float32Array, height: Float32Array, strength: number, dkey: string): PbrSet {
  const [ca, xa] = canvas(S, S)
  const a = xa.createImageData(S, S)
  a.data.set(albedo)
  xa.putImageData(a, 0, 0)
  const map = toTex(ca, true)
  const shared = getDetail(dkey)
  if (shared) return { map, ...shared }
  const r = new ImageData(S, S)
  for (let i = 0; i < S * S; i++) {
    const v = Math.max(0, Math.min(1, rough[i])) * 255
    r.data[i * 4] = r.data[i * 4 + 1] = r.data[i * 4 + 2] = v
    r.data[i * 4 + 3] = 255
  }
  return { map, ...putDetail(dkey, r, height, S, strength) }
}

/** 異星草地：底色斑塊＋細草葉筆觸＋泥土塊，草葉高度做法線 */
export function grassSet(tint: string, seed = 3): PbrSet {
  return cache3(`grass:${tint}:${seed}`, `grass:${seed}`, (dkey) => {
    const S = 512
    const patch = noiseField(S, 5, seed + 40, 3)
    const fine = noiseField(S, 3, seed + 41, 48)
    const [tr, tg, tb] = hexRgb(tint)
    const albedo = new Uint8ClampedArray(S * S * 4)
    const rough = new Float32Array(S * S)
    const height = new Float32Array(S * S)
    for (let i = 0; i < S * S; i++) {
      const p = patch[i]
      const dirt = Math.max(0, 0.36 - p) * 2.2
      const lum = 0.72 + p * 0.5 + (fine[i] - 0.5) * 0.25
      // 斑塊：暖黃綠到冷青紫之間偏移
      const warm = (p - 0.5) * 0.35
      albedo[i * 4] = (tr * (1 + warm * 0.6) * lum) * (1 - dirt) + 74 * dirt
      albedo[i * 4 + 1] = (tg * (1 + warm * 0.2) * lum) * (1 - dirt) + 60 * dirt
      albedo[i * 4 + 2] = (tb * (1 - warm * 0.5) * lum) * (1 - dirt) + 52 * dirt
      albedo[i * 4 + 3] = 255
      rough[i] = 0.82 + fine[i] * 0.12 - dirt * 0.1
      height[i] = 0.35 + fine[i] * 0.1
    }
    // 草葉：短筆觸（顏色與高度同時寫入）
    const rnd = rand32(seed + 7)
    const strokes = 5200
    for (let k = 0; k < strokes; k++) {
      const x0 = rnd() * S
      const y0 = rnd() * S
      const len = 5 + rnd() * 11
      const ang = -Math.PI / 2 + (rnd() - 0.5) * 1.3
      const light = 0.75 + rnd() * 0.6
      const tipHue = rnd() < 0.12
      for (let t = 0; t < len; t++) {
        const f = t / len
        const x = Math.floor(x0 + Math.cos(ang) * t + f * f * 2 * (rnd() - 0.5)) & (S - 1)
        const y = Math.floor(y0 + Math.sin(ang) * t) & (S - 1)
        const i = y * S + x
        const l = light * (0.75 + f * 0.45)
        albedo[i * 4] = Math.min(255, tr * l * (tipHue ? 1.35 : 1))
        albedo[i * 4 + 1] = Math.min(255, tg * l * (tipHue ? 0.9 : 1))
        albedo[i * 4 + 2] = Math.min(255, tb * l * (tipHue ? 1.4 : 1))
        height[i] = 0.45 + f * 0.5
        rough[i] = 0.62 + (1 - f) * 0.2
      }
    }
    return finishSet(S, albedo, rough, height, 5, dkey)
  })
}

const sstep = (a: number, b: number, x: number) => {
  const t = Math.max(0, Math.min(1, (x - a) / (b - a)))
  return t * t * (3 - 2 * t)
}

/**
 * 岩地（floor）／岩塊（cap）。
 * floor：細砂風化層＋露出的基岩斑塊（裂紋只在基岩上、斷斷續續）＋小隕石坑＋碎石，沒有一格一格的石板明暗；
 *        站體以 4 m 一個 tile 鋪（stationBuilder），再疊頂點色的低頻明暗，看不出重複。
 * cap：巨石、岩壁頂、雕像：fbm 明暗＋斷續的細裂紋＋礦物斑點，Worley 面只留很淡的面差。
 */
export function rockSet(tint: string, seed = 3, mode: 'floor' | 'cap' = 'floor'): PbrSet {
  return cache3(`rock2:${tint}:${seed}:${mode}`, `rock2:${seed}:${mode}`, (dkey) => {
    const S = 512
    const floor = mode === 'floor'
    const wv = worley(S, floor ? 6 : 5, seed + 90)
    const big = noiseField(S, 5, seed + 91, floor ? 2 : 3)
    const mid = noiseField(S, 4, seed + 94, floor ? 6 : 10)
    const fine = noiseField(S, 4, seed + 92, 40)
    const grain = noiseField(S, 2, seed + 95, 128)
    const [tr, tg, tb] = hexRgb(tint)
    const albedo = new Uint8ClampedArray(S * S * 4)
    const rough = new Float32Array(S * S)
    const height = new Float32Array(S * S)
    const rnd = rand32(seed + 93)
    for (let i = 0; i < S * S; i++) {
      const edge = wv.f2[i] - wv.f1[i]
      let lum: number
      let h: number
      let r: number
      let warm: number
      if (floor) {
        const b = big[i] * 0.65 + mid[i] * 0.35
        const bed = sstep(0.5, 0.6, b)
        const crack = (edge < 0.03 ? 1 - edge / 0.03 : 0) * bed * sstep(0.42, 0.6, fine[i] * 0.6 + mid[i] * 0.5)
        const lumBed = 0.8 + (fine[i] - 0.5) * 0.5 + (mid[i] - 0.5) * 0.35 + (wv.id[i] - 0.5) * 0.08 - crack * 0.55
        const lumReg = 0.98 + (grain[i] - 0.5) * 0.3 + (mid[i] - 0.5) * 0.28 + (fine[i] - 0.5) * 0.12 + (big[i] - 0.5) * 0.2
        lum = lumReg + (lumBed - lumReg) * bed
        h = 0.42 + grain[i] * 0.06 + fine[i] * 0.04 + (0.16 + (1 - wv.f1[i]) * 0.05 + (fine[i] - 0.5) * 0.22) * bed - crack * 0.3
        r = 0.93 + (0.82 + (fine[i] - 0.5) * 0.22 - 0.93) * bed + crack * 0.06
        warm = 0.03 - bed * 0.06
      } else {
        const crack = (edge < 0.025 ? 1 - edge / 0.025 : 0) * sstep(0.45, 0.6, mid[i])
        lum = (0.76 + (wv.id[i] - 0.5) * 0.1 + (big[i] - 0.5) * 0.5 + (fine[i] - 0.5) * 0.35 + (mid[i] - 0.5) * 0.2) * (1 - crack * 0.45)
        h = 0.55 + (1 - wv.f1[i]) * 0.1 + (big[i] - 0.5) * 0.25 + (fine[i] - 0.5) * 0.18 - crack * 0.45
        r = 0.8 + crack * 0.15 + (fine[i] - 0.5) * 0.2
        warm = (big[i] - 0.5) * 0.06
      }
      height[i] = h
      albedo[i * 4] = tr * lum * (1 + warm)
      albedo[i * 4 + 1] = tg * lum
      albedo[i * 4 + 2] = tb * lum * (1 - warm)
      albedo[i * 4 + 3] = 255
      rough[i] = r
    }
    const W = S - 1
    // 小隕石坑（只在岩地）：碗狀凹陷＋隆起的坑緣、坑底略暗
    if (floor) {
      for (let k = 0; k < 16; k++) {
        const cx = rnd() * S
        const cy = rnd() * S
        const R = 5 + rnd() * rnd() * 46
        const ext = Math.ceil(R * 1.5)
        for (let y = Math.floor(cy - ext); y <= cy + ext; y++) {
          for (let x = Math.floor(cx - ext); x <= cx + ext; x++) {
            const d = Math.hypot(x - cx, y - cy) / R
            if (d > 1.5) continue
            const i = (y & W) * S + (x & W)
            const bowl = d < 1 ? -(1 - d * d) * 0.32 : 0
            const rim = Math.exp(-((d - 1) ** 2) * 28) * 0.14
            height[i] += bowl + rim
            const l = d < 0.95 ? 0.86 + d * 0.08 : 1 + rim * 0.9
            albedo[i * 4] *= l
            albedo[i * 4 + 1] *= l
            albedo[i * 4 + 2] *= l
            if (d < 1) rough[i] = Math.min(1, rough[i] + 0.04)
          }
        }
      }
    }
    // 碎石／礦物斑點
    for (let k = 0; k < (floor ? 700 : 260); k++) {
      const cx = rnd() * S
      const cy = rnd() * S
      const rr = floor ? 1.5 + rnd() * rnd() * 5 : 0.8 + rnd() * 1.6
      const l = floor ? 0.55 + rnd() * 0.75 : 1.1 + rnd() * 0.35
      for (let y = Math.floor(cy - rr); y <= cy + rr; y++) {
        for (let x = Math.floor(cx - rr); x <= cx + rr; x++) {
          const d = Math.hypot(x - cx, y - cy) / rr
          if (d > 1) continue
          const i = (y & W) * S + (x & W)
          height[i] += (1 - d * d) * (floor ? 0.22 : 0.06)
          albedo[i * 4] = tr * l
          albedo[i * 4 + 1] = tg * l
          albedo[i * 4 + 2] = tb * l * 1.02
          rough[i] = floor ? 0.62 : 0.55
        }
      }
    }
    return finishSet(S, albedo, rough, height, floor ? 6 : 8, dkey)
  })
}

/**
 * 岩壁（u = 沿牆 2 m，v = 牆高 2.4 m，垂直方向也無縫）：被扭曲的水平岩層（粗細兩組）、
 * 突出的層理岩棚、斷續的裂縫、縫隙與岩棚上的苔蘚／礦脈（accent）。Worley 面只留很淡的明暗。
 */
export function rockWallSet(tint: string, accent: string, seed = 5): PbrSet {
  return cache3(`rockwall2:${tint}:${accent}:${seed}`, `rockwall2:${seed}`, (dkey) => {
    const S = 512
    const big = noiseField(S, 5, seed + 60, 3)
    const fine = noiseField(S, 4, seed + 61, 36)
    const mid = noiseField(S, 4, seed + 63, 8)
    const wv = worley(S, 6, seed + 62)
    const [tr, tg, tb] = hexRgb(tint)
    const [ar, ag, ab] = hexRgb(accent)
    const albedo = new Uint8ClampedArray(S * S * 4)
    const rough = new Float32Array(S * S)
    const height = new Float32Array(S * S)
    for (let y = 0; y < S; y++) {
      for (let x = 0; x < S; x++) {
        const i = y * S + x
        const v = y / S
        // 岩層：sin 的頻率取偶數倍 π，垂直方向無縫；以低頻噪音扭曲成起伏的層理
        const s1 = Math.sin((v * 8 + big[i] * 1.8) * Math.PI)
        const s2 = Math.sin((v * 22 + big[i] * 2.6 + mid[i] * 0.8) * Math.PI)
        const layer = s1 * 0.65 + s2 * 0.3
        const ledge = s1 > 0.78 ? (s1 - 0.78) / 0.22 : 0
        const groove = s1 < -0.86 ? (-0.86 - s1) / 0.14 : 0
        const edge = wv.f2[i] - wv.f1[i]
        const crack = Math.max(edge < 0.035 ? (1 - edge / 0.035) * sstep(0.44, 0.6, mid[i]) : 0, groove * 0.7)
        const moss = Math.max(0, (crack * 0.8 + ledge * 0.7) * (fine[i] + big[i] - 0.72) * 2.2)
        const lum = (0.66 + layer * 0.13 + (wv.id[i] - 0.5) * 0.08 + (big[i] - 0.5) * 0.36 + (fine[i] - 0.5) * 0.26 + ledge * 0.08) * (1 - crack * 0.6)
        const m = Math.min(1, moss)
        albedo[i * 4] = tr * lum * (1 - m) + ar * 0.55 * m
        albedo[i * 4 + 1] = tg * lum * (1 - m) + ag * 0.55 * m
        albedo[i * 4 + 2] = tb * lum * (1 - m) + ab * 0.55 * m
        albedo[i * 4 + 3] = 255
        rough[i] = 0.86 - ledge * 0.12 + crack * 0.1 - m * 0.25
        height[i] = 0.5 + layer * 0.16 + ledge * 0.12 + (1 - wv.f1[i]) * 0.06 + (fine[i] - 0.5) * 0.15 - crack * 0.4
      }
    }
    return finishSet(S, albedo, rough, height, 7, dkey)
  })
}

/** 有機組織：濕潤的肉質表面＋發光血管（未識別物體、標本）*/
export function organicSet(tint: string, vein: string, seed = 9): PbrSet {
  return cache3(`organic:${tint}:${vein}:${seed}`, `organic:${seed}`, (dkey) => {
    const S = 256
    const wv = worley(S, 6, seed + 70)
    const big = noiseField(S, 4, seed + 71, 3)
    const fine = noiseField(S, 3, seed + 72, 24)
    const [tr, tg, tb] = hexRgb(tint)
    const [vr, vg, vb] = hexRgb(vein)
    const albedo = new Uint8ClampedArray(S * S * 4)
    const rough = new Float32Array(S * S)
    const height = new Float32Array(S * S)
    for (let i = 0; i < S * S; i++) {
      const edge = wv.f2[i] - wv.f1[i]
      const v = edge < 0.06 ? 1 - edge / 0.06 : 0
      const lum = 0.65 + big[i] * 0.45 + (fine[i] - 0.5) * 0.2
      albedo[i * 4] = tr * lum * (1 - v) + vr * v
      albedo[i * 4 + 1] = tg * lum * (1 - v) + vg * v
      albedo[i * 4 + 2] = tb * lum * (1 - v) + vb * v
      albedo[i * 4 + 3] = 255
      rough[i] = 0.35 + fine[i] * 0.3 - v * 0.15
      height[i] = 0.5 + (wv.f1[i] - 0.4) * 0.3 + v * 0.3 + (fine[i] - 0.5) * 0.1
    }
    return finishSet(S, albedo, rough, height, 5, dkey)
  })
}

/**
 * 有機腔壁的發光血管遮罩（與 organicSet 同一組 Worley 邊緣，對得上底色裡的血管）：
 * 主血管亮、細支微亮，再用低頻雜訊讓一段段明暗不均，像體液在裡面流動。
 */
export function organicGlowTex(seed = 9): THREE.Texture {
  const key = `organicGlow:${seed}`
  const have = cache.get(key)
  if (have) return have
  const S = 256
  const wv = worley(S, 6, seed + 70)
  const big = noiseField(S, 4, seed + 73, 3)
  const [c, x] = canvas(S, S)
  const img = x.createImageData(S, S)
  for (let i = 0; i < S * S; i++) {
    const edge = wv.f2[i] - wv.f1[i]
    const v = edge < 0.06 ? 1 - edge / 0.06 : 0
    const k = Math.pow(v, 1.6) * Math.max(0, Math.min(1, (big[i] - 0.3) * 1.8))
    const o = i * 4
    img.data[o] = img.data[o + 1] = img.data[o + 2] = Math.round(k * 255)
    img.data[o + 3] = 255
  }
  x.putImageData(img, 0, 0)
  const t = toTex(c, true)
  cache.set(key, t)
  return t
}

/** 外星文字面板：發光符號格（未識別物體的啟用碼面板）*/
export function glyphTex(color: string, seed = 1): THREE.Texture {
  const key = `glyph:${color}:${seed}`
  const have = cache.get(key)
  if (have) return have
  const [c, x] = canvas(256, 256)
  x.fillStyle = '#020604'
  x.fillRect(0, 0, 256, 256)
  const rnd = rand32(seed + 3)
  x.strokeStyle = color
  x.fillStyle = color
  x.lineCap = 'round'
  for (let gy = 0; gy < 5; gy++) {
    for (let gx = 0; gx < 4; gx++) {
      const ox = 22 + gx * 56
      const oy = 18 + gy * 46
      x.globalAlpha = 0.55 + rnd() * 0.45
      x.lineWidth = 2 + rnd() * 2
      x.beginPath()
      for (let k = 0; k < 4; k++) {
        const ax = ox + rnd() * 30
        const ay = oy + rnd() * 30
        if (rnd() < 0.5) {
          x.moveTo(ax, ay)
          x.lineTo(ox + rnd() * 30, oy + rnd() * 30)
        } else {
          x.moveTo(ax + 6, ay)
          x.arc(ax, ay, 4 + rnd() * 6, 0, Math.PI * (1 + rnd()))
        }
      }
      x.stroke()
      if (rnd() < 0.3) {
        x.beginPath()
        x.arc(ox + 15, oy + 15, 2.5, 0, Math.PI * 2)
        x.fill()
      }
    }
  }
  x.globalAlpha = 0.16
  x.fillStyle = '#000'
  for (let y = 0; y < 256; y += 3) x.fillRect(0, y, 256, 1)
  x.globalAlpha = 1
  const t = toTex(c, true, false)
  cache.set(key, t)
  return t
}
