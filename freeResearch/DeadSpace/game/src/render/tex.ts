// 程序化貼圖：載入時用 canvas 生成並快取（美術聖經 §6：底色變化、粗糙度變化、邊緣磨損）
import * as THREE from 'three'

const cache = new Map<string, THREE.Texture>()

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

export function floorSet(variant: 'plate' | 'grate' | 'tile' | 'rubber' | 'concrete', tint: string, seed = 3): PbrSet {
  const key = `floor:${variant}:${tint}:${seed}`
  const have = cache.get(key + ':map')
  if (have) return { map: have, roughnessMap: cache.get(key + ':r')!, normalMap: cache.get(key + ':n')! }
  const S = 512
  const grime = noiseField(S, 6, seed, 6)
  const fine = noiseField(S, 3, seed + 9, 32)
  const height = new Float32Array(S * S)
  const [ca, xa] = canvas(S, S)
  const [cr, xr] = canvas(S, S)
  const [cn, xn] = canvas(S, S)
  const albedo = xa.createImageData(S, S)
  const rough = xr.createImageData(S, S)
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
  xr.putImageData(rough, 0, 0)
  xn.putImageData(heightToNormal(height, S, 6), 0, 0)
  // 偶爾的油漆標記
  xa.globalAlpha = 0.5
  xa.fillStyle = '#c9a23a'
  xa.font = 'bold 28px monospace'
  xa.fillText(String((seed * 37) % 90 + 10), 30, 60)
  xa.globalAlpha = 1
  const map = toTex(ca, true)
  const roughnessMap = toTex(cr, false)
  const normalMap = toTex(cn, false)
  cache.set(key + ':map', map)
  cache.set(key + ':r', roughnessMap)
  cache.set(key + ':n', normalMap)
  return { map, roughnessMap, normalMap }
}

// ───── 牆板（u = 沿牆 2 m，v = 牆高）─────

export function wallSet(tint: string, accent: string, seed = 5): PbrSet {
  const key = `wall:${tint}:${accent}:${seed}`
  const have = cache.get(key + ':map')
  if (have) return { map: have, roughnessMap: cache.get(key + ':r')!, normalMap: cache.get(key + ':n')! }
  const W = 512
  const H = 512
  const grime = noiseField(W, 5, seed, 3)
  const fine = noiseField(W, 3, seed + 3, 32)
  const [ca, xa] = canvas(W, H)
  const [cr, xr] = canvas(W, H)
  const [cn, xn] = canvas(W, H)
  const albedo = xa.createImageData(W, H)
  const rough = xr.createImageData(W, H)
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
  xr.putImageData(rough, 0, 0)
  xn.putImageData(heightToNormal(height, W, 5), 0, 0)
  const map = toTex(ca, true)
  const roughnessMap = toTex(cr, false)
  const normalMap = toTex(cn, false)
  cache.set(key + ':map', map)
  cache.set(key + ':r', roughnessMap)
  cache.set(key + ':n', normalMap)
  return { map, roughnessMap, normalMap }
}

// ───── 通用金屬（道具、機殼）─────

export function metalSet(tint: string, seed = 11, panels = true): PbrSet {
  const key = `metal:${tint}:${seed}:${panels}`
  const have = cache.get(key + ':map')
  if (have) return { map: have, roughnessMap: cache.get(key + ':r')!, normalMap: cache.get(key + ':n')! }
  const S = 256
  const grime = noiseField(S, 5, seed, 2)
  const fine = noiseField(S, 3, seed + 1, 24)
  const [ca, xa] = canvas(S, S)
  const [cr, xr] = canvas(S, S)
  const [cn, xn] = canvas(S, S)
  const a = xa.createImageData(S, S)
  const r = xr.createImageData(S, S)
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
  xr.putImageData(r, 0, 0)
  xn.putImageData(heightToNormal(h, S, 4), 0, 0)
  const map = toTex(ca, true)
  const roughnessMap = toTex(cr, false)
  const normalMap = toTex(cn, false)
  cache.set(key + ':map', map)
  cache.set(key + ':r', roughnessMap)
  cache.set(key + ':n', normalMap)
  return { map, roughnessMap, normalMap }
}

// ───── 布料／衣物 ─────

export function fabricSet(tint: string, seed = 21): PbrSet {
  const key = `fabric:${tint}:${seed}`
  const have = cache.get(key + ':map')
  if (have) return { map: have, roughnessMap: cache.get(key + ':r')!, normalMap: cache.get(key + ':n')! }
  const S = 128
  const grime = noiseField(S, 4, seed, 2)
  const [ca, xa] = canvas(S, S)
  const [cr, xr] = canvas(S, S)
  const [cn, xn] = canvas(S, S)
  const a = xa.createImageData(S, S)
  const r = xr.createImageData(S, S)
  const h = new Float32Array(S * S)
  const [tr, tg, tb] = hexRgb(tint)
  for (let y = 0; y < S; y++) {
    for (let x = 0; x < S; x++) {
      const i = y * S + x
      const weave = ((x + (y % 4 < 2 ? 0 : 2)) % 4 < 2 ? 1 : 0) * 0.06
      const dirt = Math.max(0, grime[i] - 0.55) * 1.4
      const lum = (0.94 + weave) * (1 - dirt * 0.35)
      const o = i * 4
      a.data[o] = Math.min(255, tr * lum)
      a.data[o + 1] = Math.min(255, tg * lum)
      a.data[o + 2] = Math.min(255, tb * lum)
      a.data[o + 3] = 255
      const rr = Math.min(1, 0.78 + dirt * 0.15 - weave)
      r.data[o] = r.data[o + 1] = r.data[o + 2] = rr * 255
      r.data[o + 3] = 255
      h[i] = 0.5 + weave * 2
    }
  }
  xa.putImageData(a, 0, 0)
  xr.putImageData(r, 0, 0)
  xn.putImageData(heightToNormal(h, S, 3), 0, 0)
  const map = toTex(ca, true)
  const roughnessMap = toTex(cr, false)
  const normalMap = toTex(cn, false)
  cache.set(key + ':map', map)
  cache.set(key + ':r', roughnessMap)
  cache.set(key + ':n', normalMap)
  return { map, roughnessMap, normalMap }
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
export function decalTex(kind: 'arrow' | 'hazard' | 'cross' | 'pad' | 'ring' | 'glow', color = '#ffc23d'): THREE.Texture {
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
  } else {
    const g = x.createRadialGradient(128, 128, 0, 128, 128, 128)
    g.addColorStop(0, color)
    g.addColorStop(1, 'rgba(0,0,0,0)')
    x.fillStyle = g
    x.fillRect(0, 0, 256, 256)
  }
  // 磨損：挖掉一些像素
  if (kind !== 'glow' && kind !== 'ring') {
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
