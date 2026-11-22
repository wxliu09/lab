// 室外地表（翠原星、餘燼衛星）：地面的顏色斑塊與低起伏（只是外觀：sim 的地面是平的，單位照樣站在 y = 0）、
// 翠原星的程序化草葉（一個 InstancedMesh，vertex shader 隨風擺動）。美術聖經 §3.3：異星草原、淡紫天光；灰黑岩地。
import * as THREE from 'three'
import { Cell, type ParsedLayout } from '../shared/layout'
import { groundTone } from './rockWalls'
import { withFog } from './materials'
import type { Theme } from './themes'
import type { Tier } from './dressing'

// ───── 雜訊 ─────

function h2(x: number, y: number, s: number): number {
  let h = Math.imul(x | 0, 0x27d4eb2d) ^ Math.imul(y | 0, 0x165667b1) ^ Math.imul(s | 0, 0x85ebca6b)
  h = Math.imul(h ^ (h >>> 15), 0x2c1b3c6d)
  h = Math.imul(h ^ (h >>> 12), 0x297a2d39)
  return ((h ^ (h >>> 15)) >>> 0) / 4294967296
}

function vn2(x: number, y: number, s: number): number {
  const xi = Math.floor(x)
  const yi = Math.floor(y)
  const xf = x - xi
  const yf = y - yi
  const u = xf * xf * (3 - 2 * xf)
  const v = yf * yf * (3 - 2 * yf)
  const a = h2(xi, yi, s)
  const b = h2(xi + 1, yi, s)
  const c = h2(xi, yi + 1, s)
  const d = h2(xi + 1, yi + 1, s)
  return a + (b - a) * u + (c - a) * v + (a - b - c + d) * u * v
}

/** 0..1 的 fbm */
function fbm2(x: number, y: number, s: number, oct = 3): number {
  let sum = 0
  let amp = 1
  let norm = 0
  let f = 1
  for (let i = 0; i < oct; i++) {
    sum += amp * vn2(x * f, y * f, s + i * 57)
    norm += amp
    amp *= 0.5
    f *= 2.07
  }
  return sum / norm
}

const sstep = (a: number, b: number, x: number) => {
  const t = Math.max(0, Math.min(1, (x - a) / (b - a)))
  return t * t * (3 - 2 * t)
}

// ───── 地面 ─────

/**
 * 地面色調（頂點色的 RGB 倍率）：草地在「茂盛的青綠 ↔ 乾燥的黃褐」之間漂移，零星一片淡紫（異星花叢）；
 * 岩地在冷灰與暖褐之間漂移。全部乘上原本的低頻明暗（groundTone）。草葉的顏色也用同一個函式，和地面對得上。
 */
export function groundTint(x: number, y: number, variant: string, out: [number, number, number] = [1, 1, 1]): [number, number, number] {
  const t = groundTone(x, y)
  if (variant === 'grass') {
    const dry = sstep(0.42, 0.68, fbm2(x * 0.06, y * 0.06, 811))
    const vio = sstep(0.62, 0.8, fbm2(x * 0.09 + 31, y * 0.09 - 17, 812)) * 0.75
    let r = 0.86 + (1.2 - 0.86) * dry
    let g = 1.05 + (1.06 - 1.05) * dry
    let b = 0.98 + (0.74 - 0.98) * dry
    r += (1.08 - r) * vio
    g += (0.86 - g) * vio
    b += (1.24 - b) * vio
    out[0] = r * t
    out[1] = g * t
    out[2] = b * t
  } else if (variant === 'rock') {
    const w = fbm2(x * 0.07, y * 0.07, 821)
    const k = (w - 0.5) * 0.22
    out[0] = t * (1 + k)
    out[1] = t * (1 + k * 0.3)
    out[2] = t * (1 - k * 0.6)
  } else {
    out[0] = out[1] = out[2] = t
  }
  return out
}

/** 視覺上的地形高度（m，用來算法線：起伏比實際位移誇張，打光讀得出丘陵）*/
function reliefH(x: number, y: number, variant: string): number {
  const s = variant === 'rock' ? 0.55 : 0.4
  return (fbm2(x * 0.11, y * 0.11, 831, 3) - 0.5) * s * 2 + (fbm2(x * 0.37, y * 0.37, 832, 2) - 0.5) * s * 0.5
}

export interface GroundField {
  /** 每個格點（(w+1)×(h+1)，index = row * (w+1) + col，row 0 = 最上方）的 RGB 倍率、位移、法線 */
  col: Float32Array
  y: Float32Array
  nrm: Float32Array
}

/**
 * 室外地面的格點欄位：格點旁邊只要有牆、門、設施、道具、危險區或不是自然地面（人造房間的混凝土）就固定 y = 0、法線朝上，
 * 往外兩格內漸變（岩壁底、門檻、設施底座不會浮起來或出現縫）。位移只往下（最多 6 cm 的淺窪）：單位腳下、貼地的光圈與房名不會被埋住。
 */
export function groundField(l: ParsedLayout, variantAt: (col: number, row: number) => string | null): GroundField {
  const CW = l.w + 1
  const CH = l.h + 1
  const n = CW * CH
  const hard = new Float32Array(n).fill(99)
  const q: number[] = []
  const natural = (c: number, r: number) => {
    if (c < 0 || r < 0 || c >= l.w || r >= l.h) return false
    const k = l.cells[r * l.w + c] as Cell
    if (k !== Cell.Floor) return false
    const v = variantAt(c, r)
    return v === 'grass' || v === 'rock'
  }
  for (let r = 0; r < CH; r++) {
    for (let c = 0; c < CW; c++) {
      let ok = true
      for (const [dc, dr] of [[-1, -1], [0, -1], [-1, 0], [0, 0]]) if (!natural(c + dc, r + dr)) ok = false
      if (!ok) {
        hard[r * CW + c] = 0
        q.push(r * CW + c)
      }
    }
  }
  for (const p of l.pois) {
    for (let dr = -1; dr <= 2; dr++)
      for (let dc = -1; dc <= 2; dc++) {
        const c = p.col + dc
        const r = p.row + dr
        if (c < 0 || r < 0 || c >= CW || r >= CH || hard[r * CW + c] === 0) continue
        hard[r * CW + c] = 0
        q.push(r * CW + c)
      }
  }
  for (let qi = 0; qi < q.length; qi++) {
    const i = q[qi]
    const c = i % CW
    const r = (i - c) / CW
    const d = hard[i] + 1
    if (d > 3) continue
    for (const [dc, dr] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
      const cc = c + dc
      const rr = r + dr
      if (cc < 0 || rr < 0 || cc >= CW || rr >= CH) continue
      const j = rr * CW + cc
      if (hard[j] > d) {
        hard[j] = d
        q.push(j)
      }
    }
  }
  const col = new Float32Array(n * 3)
  const ys = new Float32Array(n)
  const nrm = new Float32Array(n * 3)
  const tint: [number, number, number] = [1, 1, 1]
  for (let r = 0; r < CH; r++) {
    for (let c = 0; c < CW; c++) {
      const i = r * CW + c
      const x = c
      const y = l.h - r
      // 這個格點的地面種類：取四周第一個有種類的格
      let v: string | null = null
      for (const [dc, dr] of [[0, 0], [-1, 0], [0, -1], [-1, -1]]) {
        const cc = c + dc
        const rr = r + dr
        if (cc >= 0 && rr >= 0 && cc < l.w && rr < l.h && (v = variantAt(cc, rr))) break
      }
      groundTint(x, y, v ?? 'concrete', tint)
      col.set(tint, i * 3)
      const w = sstep(0, 2, hard[i])
      if (v === 'grass' || v === 'rock') {
        const e = 0.35
        const hx = reliefH(x + e, y, v) - reliefH(x - e, y, v)
        const hy = reliefH(x, y + e, v) - reliefH(x, y - e, v)
        const k = (0.35 + 0.65 * w) / (2 * e)
        // three：x 同向、z = -y → 法線 (-dH/dx, 1, +dH/dy)
        const nx = -hx * k
        const nz = hy * k
        const len = Math.hypot(nx, 1, nz)
        nrm[i * 3] = nx / len
        nrm[i * 3 + 1] = 1 / len
        nrm[i * 3 + 2] = nz / len
        ys[i] = -0.06 * w * sstep(0.5, 0.75, fbm2(x * 0.13, y * 0.13, 841))
      } else {
        nrm[i * 3 + 1] = 1
      }
    }
  }
  return { col, y: ys, nrm }
}

// ───── 草葉 ─────

/**
 * 草叢不長的格（1）：設施周圍一格（降落場的大圓 6 格、降落傳送門 2 格）、門口兩格、停機坪三格、房名地貼、道具格。
 * labels = 房名地貼的中心（sim 公尺）。
 */
export function grassAvoidMask(l: ParsedLayout, labels: Iterable<{ x: number; y: number }>): Uint8Array {
  const avoid = new Uint8Array(l.w * l.h)
  const mark = (c0: number, r0: number, rad: number) => {
    for (let r = r0 - rad; r <= r0 + rad; r++)
      for (let c = c0 - rad; c <= c0 + rad; c++) if (c >= 0 && r >= 0 && c < l.w && r < l.h && Math.hypot(c - c0, r - r0) <= rad + 0.5) avoid[r * l.w + c] = 1
  }
  for (const p of l.pois) mark(p.col, p.row, p.def.kind === 'landingSite' ? 6 : p.def.kind === 'landingPortal' ? 2 : 1)
  for (const d of l.doors) for (const [c, r] of d.cells) mark(c, r, 2)
  for (const pad of l.pads) mark(Math.floor(pad.x), l.h - 1 - Math.floor(pad.y), 3)
  for (const at of labels) for (let dx = -3; dx <= 3; dx++) for (let dy = -1; dy <= 1; dy++) mark(Math.floor(at.x + dx), l.h - 1 - Math.floor(at.y + dy), 0)
  for (let i = 0; i < l.w * l.h; i++) if (l.cells[i] === Cell.Crate) avoid[i] = 1
  return avoid
}

/** 一叢草：b 片葉，每片三段（底 → 中 → 尖）；attribute aBend = 高度比例（擺動權重）*/
function clumpGeo(seed: number, b: number, base: THREE.Color, tip: THREE.Color, flower: THREE.Color | null): THREE.BufferGeometry {
  let s = seed * 9301 + 49297
  const rnd = () => ((s = (s * 9301 + 49297) % 233280) / 233280)
  const pos: number[] = []
  const col: number[] = []
  const bend: number[] = []
  const nrm: number[] = []
  const idx: number[] = []
  for (let k = 0; k < b; k++) {
    const a = rnd() * Math.PI * 2
    const d = Math.sqrt(rnd()) * 0.42
    const ox = Math.cos(a) * d
    const oz = Math.sin(a) * d
    const yaw = rnd() * Math.PI
    const h = 0.12 + rnd() * 0.16
    const wd = 0.03 + rnd() * 0.022
    const lean = 0.25 + rnd() * 0.5
    const lx = Math.cos(yaw)
    const lz = Math.sin(yaw)
    // 葉子朝外傾
    const tx = Math.cos(a) * lean * h
    const tz = Math.sin(a) * lean * h
    const isFlower = !!flower && k === 0
    const v0 = pos.length / 3
    const rows: [number, number][] = [
      [0, 1],
      [0.55, 0.6],
    ]
    for (const [f, wf] of rows) {
      const cx = ox + tx * f * f
      const cz = oz + tz * f * f
      for (const side of [-1, 1]) {
        pos.push(cx + lx * wd * wf * side, h * f, cz + lz * wd * wf * side)
        const c = base.clone().lerp(tip, f)
        col.push(c.r, c.g, c.b)
        bend.push(f)
        nrm.push(0, 1, 0)
      }
    }
    pos.push(ox + tx, h * (isFlower ? 1.15 : 1), oz + tz)
    const c = isFlower ? flower : tip
    col.push(c.r, c.g, c.b)
    bend.push(1)
    nrm.push(0, 1, 0)
    idx.push(v0, v0 + 1, v0 + 3, v0, v0 + 3, v0 + 2, v0 + 2, v0 + 3, v0 + 4)
  }
  const g = new THREE.BufferGeometry()
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3))
  g.setAttribute('normal', new THREE.Float32BufferAttribute(nrm, 3))
  g.setAttribute('color', new THREE.Float32BufferAttribute(col, 3))
  g.setAttribute('aBend', new THREE.Float32BufferAttribute(bend, 1))
  g.setIndex(idx)
  g.computeBoundingSphere()
  return g
}

let grassMat: THREE.MeshStandardMaterial | null = null
/** 草葉材質：頂點色（根暗尖亮）× instance 色（地面斑塊）；vertex shader 隨風擺動（世界座標的波＋陣風）。共用、不 dispose */
function grassMaterial(): THREE.MeshStandardMaterial {
  if (!grassMat) {
    const m = new THREE.MeshStandardMaterial({ vertexColors: true, side: THREE.DoubleSide, roughness: 0.82, metalness: 0 })
    m.onBeforeCompile = (shader) => {
      // 雙面草葉：背面不翻轉法線（法線一律朝上，和地面同樣受光；否則一半的葉子從下方受光、看起來是黑線）
      shader.fragmentShader = shader.fragmentShader.replace('#include <normal_fragment_begin>', '#include <normal_fragment_begin>\nnormal = normalize(vNormal);')
      shader.vertexShader = shader.vertexShader.replace('#include <common>', '#include <common>\nattribute float aBend;\nuniform float uTime;').replace(
        '#include <begin_vertex>',
        `#include <begin_vertex>
        #ifdef USE_INSTANCING
          vec2 gIp = vec2(instanceMatrix[3][0], instanceMatrix[3][2]);
          mat3 gIm = mat3(instanceMatrix);
        #else
          vec2 gIp = vec2(0.0);
          mat3 gIm = mat3(1.0);
        #endif
        float gW = aBend * aBend;
        float gPh = uTime * 1.7 + gIp.x * 0.45 + gIp.y * 0.31;
        float gGust = 0.5 + 0.5 * sin(uTime * 0.41 + gIp.x * 0.06 - gIp.y * 0.05);
        vec3 gWind = vec3(sin(gPh) * 0.035 + 0.05 * gGust, 0.0, cos(gPh * 0.83 + 1.3) * 0.025) * gW;
        // world -> local (instance: yaw + uniform scale)
        transformed += transpose(gIm) * gWind / max(dot(gIm[0], gIm[0]), 1e-4);`,
      )
    }
    m.customProgramCacheKey = () => 'xcgrass'
    grassMat = withFog(m)
    grassMat.userData.keep = true
  }
  return grassMat
}

/**
 * 翠原星的草：草地格上撒草叢（每格數量依畫質：low 稀疏），避開設施、門、停機坪與降落場、道具格、房名；
 * 一般草叢一個 InstancedMesh，medium 起再一個開花的（葉尖淡紫）。instance 色 = 該處地面斑塊色。
 */
export function buildGrass(group: THREE.Group, l: ParsedLayout, th: Theme, variantAt: (col: number, row: number) => string | null, avoid: (col: number, row: number) => boolean, tier: Tier, seed: number): void {
  const gb = th.grassBlades
  if (!gb) return
  const per = [0.35, 0.9, 1.7, 2.5][tier]
  const blades = [6, 8, 9, 10][tier]
  let s = seed >>> 0 || 1
  const rnd = () => {
    s = (s + 0x6d2b79f5) >>> 0
    let t = s
    t = Math.imul(t ^ (t >>> 15), t | 1)
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61)
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
  const plain: number[] = []
  const flowered: number[] = []
  for (let r = 0; r < l.h; r++) {
    for (let c = 0; c < l.w; c++) {
      if (l.cells[r * l.w + c] !== Cell.Floor || variantAt(c, r) !== 'grass' || avoid(c, r)) continue
      let k = per
      while (k > 0) {
        if (rnd() < Math.min(1, k)) {
          const x = c + 0.1 + rnd() * 0.8
          const y = l.h - r - 0.9 + rnd() * 0.8
          const fl = tier >= 1 && fbm2(x * 0.2, y * 0.2, 851) > 0.58 && rnd() < 0.5
          ;(fl ? flowered : plain).push(x, y)
        }
        k -= 1
      }
    }
  }
  const base = new THREE.Color(gb.base)
  const tip = new THREE.Color(gb.tip)
  const m4 = new THREE.Matrix4()
  const q = new THREE.Quaternion()
  const up = new THREE.Vector3(0, 1, 0)
  const tint: [number, number, number] = [1, 1, 1]
  const tc = new THREE.Color()
  const make = (list: number[], flower: THREE.Color | null, gseed: number) => {
    const n = list.length / 2
    if (!n) return
    const geo = clumpGeo(gseed, blades, base, tip, flower)
    const im = new THREE.InstancedMesh(geo, grassMaterial(), n)
    for (let i = 0; i < n; i++) {
      const x = list[i * 2]
      const y = list[i * 2 + 1]
      const sc = 0.75 + rnd() * 0.6
      q.setFromAxisAngle(up, rnd() * Math.PI * 2)
      m4.compose(new THREE.Vector3(x, 0, -y), q, new THREE.Vector3(sc, sc * (0.8 + rnd() * 0.5), sc))
      im.setMatrixAt(i, m4)
      groundTint(x, y, 'grass', tint)
      const j = 0.9 + rnd() * 0.2
      im.setColorAt(i, tc.setRGB(tint[0] * j, tint[1] * j, tint[2] * j))
    }
    im.instanceMatrix.needsUpdate = true
    if (im.instanceColor) im.instanceColor.needsUpdate = true
    im.computeBoundingSphere()
    im.castShadow = false
    im.receiveShadow = tier >= 2
    im.frustumCulled = true
    group.add(im)
  }
  make(plain, null, 11)
  make(flowered, new THREE.Color(gb.flower), 23)
}
