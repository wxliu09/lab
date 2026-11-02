// 室外岩壁（翠原星、餘燼衛星）：把 1 m 格子的牆轉成自然岩層（美術聖經 §7）。
// 版面仍是格子（sim 碰撞不變），這裡只改外觀：
//   1. 岩壁輪廓（半公尺取樣）做 Laplacian 平滑，消掉斜向的階梯形；
//   2. 牆面分 4 層，頂點沿外法線做低頻雜訊凹凸（底部外擴成岩屑坡、頂緣內收成圓肩）；
//   3. 頂面是共用頂點的高度場（離邊緣越遠越高），加不規則岩帽；牆腳散落碎石；
//   4. 圍著人造房間（營舍、掩體、工廠…）的牆維持筆直，改用混凝土牆＋金屬壓條。
// 所有頂點位移都只由「原始格點座標」決定，相鄰格／相鄰面共用同一個值，不會裂縫。
// 合併成少數幾個 Mesh（岩壁面、頂面＋岩帽＋碎石、混凝土牆、牆頂），不會每格多一個 draw call。
import * as THREE from 'three'
import { mergeVertices } from 'three/examples/jsm/utils/BufferGeometryUtils.js'
import { Cell, type ParsedLayout } from '../shared/layout'
import { Batcher, box } from './batch'
import { Mat } from './materials'
import type { Theme } from './themes'

// ───── 雜訊（決定性、三維 value noise）─────

function h3(x: number, y: number, z: number, s: number): number {
  let h = Math.imul(x | 0, 0x27d4eb2d) ^ Math.imul(y | 0, 0x165667b1) ^ Math.imul(z | 0, 0x1b873593) ^ Math.imul(s | 0, 0x85ebca6b)
  h = Math.imul(h ^ (h >>> 15), 0x2c1b3c6d)
  h = Math.imul(h ^ (h >>> 12), 0x297a2d39)
  return ((h ^ (h >>> 15)) >>> 0) / 4294967296
}

function vn3(x: number, y: number, z: number, s: number): number {
  const xi = Math.floor(x)
  const yi = Math.floor(y)
  const zi = Math.floor(z)
  const xf = x - xi
  const yf = y - yi
  const zf = z - zi
  const u = xf * xf * (3 - 2 * xf)
  const v = yf * yf * (3 - 2 * yf)
  const w = zf * zf * (3 - 2 * zf)
  const l = (a: number, b: number, t: number) => a + (b - a) * t
  const c00 = l(h3(xi, yi, zi, s), h3(xi + 1, yi, zi, s), u)
  const c10 = l(h3(xi, yi + 1, zi, s), h3(xi + 1, yi + 1, zi, s), u)
  const c01 = l(h3(xi, yi, zi + 1, s), h3(xi + 1, yi, zi + 1, s), u)
  const c11 = l(h3(xi, yi + 1, zi + 1, s), h3(xi + 1, yi + 1, zi + 1, s), u)
  return l(l(c00, c10, v), l(c01, c11, v), w)
}

/** 約 -1..1 的 fbm */
function fbm3(x: number, y: number, z: number, s: number, oct = 3): number {
  let sum = 0
  let amp = 1
  let norm = 0
  let f = 1
  for (let i = 0; i < oct; i++) {
    sum += amp * (vn3(x * f, y * f, z * f, s + i * 31) * 2 - 1)
    norm += amp
    amp *= 0.5
    f *= 2.03
  }
  return (sum / norm) * 1.7
}

/** 室外地面的低頻明暗（約 0.84..1.1，跨格連續）*/
export function groundTone(x: number, y: number): number {
  return 0.97 + 0.11 * fbm3(x * 0.09, 0.5, y * 0.09, 401, 3) + 0.04 * fbm3(x * 0.37, 2.5, y * 0.37, 402, 2)
}

/** 0..1 的格子亂數 */
function cellRnd(c: number, r: number, k: number, s: number): number {
  return h3(c, r, k, s + 977)
}

const smooth01 = (t: number) => {
  const k = Math.max(0, Math.min(1, t))
  return k * k * (3 - 2 * k)
}

// ───── 分類：人造牆／自然岩壁、與邊緣的距離 ─────

export interface OutdoorWalls {
  /** 每格：1 = 人造牆（筆直、混凝土）*/
  built: Uint8Array
  /** 每格：到最近非實心格的 Chebyshev 距離（非實心 = 0）*/
  dist: Uint8Array
}

const isSolid = (c: Cell) => c === Cell.Wall || c === Cell.Void

export function classifyOutdoor(l: ParsedLayout, th: Theme, cellAt: (c: number, r: number) => Cell, roomType: (c: number, r: number) => string): OutdoorWalls {
  const { w, h } = l
  const dist = new Uint8Array(w * h).fill(255)
  const q: number[] = []
  for (let r = 0; r < h; r++) {
    for (let c = 0; c < w; c++) {
      if (!isSolid(cellAt(c, r))) {
        dist[r * w + c] = 0
        q.push(r * w + c)
      }
    }
  }
  for (let qi = 0; qi < q.length; qi++) {
    const i = q[qi]
    const c = i % w
    const r = (i - c) / w
    const d = dist[i] + 1
    if (d > 250) continue
    for (let dr = -1; dr <= 1; dr++) {
      for (let dc = -1; dc <= 1; dc++) {
        const cc = c + dc
        const rr = r + dr
        if (cc < 0 || rr < 0 || cc >= w || rr >= h) continue
        const j = rr * w + cc
        if (dist[j] > d) {
          dist[j] = d
          q.push(j)
        }
      }
    }
  }
  const built = new Uint8Array(w * h)
  const rooms = new Set(th.built?.rooms ?? [])
  if (rooms.size) {
    for (let r = 0; r < h; r++) {
      for (let c = 0; c < w; c++) {
        if (cellAt(c, r) !== Cell.Wall || dist[r * w + c] > 2) continue
        let b = false
        for (let dr = -2; dr <= 2 && !b; dr++) {
          for (let dc = -2; dc <= 2 && !b; dc++) {
            const k = cellAt(c + dc, r + dr)
            if (isSolid(k) || k === Cell.Door) continue
            if (rooms.has(roomType(c + dc, r + dr))) b = true
          }
        }
        if (b) built[r * w + c] = 1
      }
    }
  }
  return { built, dist }
}

// ───── 幾何累積 ─────

class Geo {
  pos: number[] = []
  nrm: number[] = []
  uv: number[] = []
  col: number[] = []
  /** 平滑法線用：每個頂點的共用鍵（-1 = 保留給定法線）*/
  keys: number[] = []

  push(x: number, y: number, z: number, u: number, v: number, a: number, key = -1, nx = 0, ny = 1, nz = 0): void {
    this.pos.push(x, y, z)
    this.uv.push(u, v)
    this.col.push(a, a, a)
    this.nrm.push(nx, ny, nz)
    this.keys.push(key)
  }

  /** 依共用鍵累積面法線（面積加權），得到跨面平滑的法線 */
  smoothNormals(from = 0): void {
    const acc = new Map<number, [number, number, number]>()
    const p = this.pos
    const tri: number[] = []
    for (let i = from; i < this.keys.length; i += 3) {
      const a = i * 3
      const b = a + 3
      const c = a + 6
      const ux = p[b] - p[a]
      const uy = p[b + 1] - p[a + 1]
      const uz = p[b + 2] - p[a + 2]
      const vx = p[c] - p[a]
      const vy = p[c + 1] - p[a + 1]
      const vz = p[c + 2] - p[a + 2]
      const nx = uy * vz - uz * vy
      const ny = uz * vx - ux * vz
      const nz = ux * vy - uy * vx
      tri.push(nx, ny, nz)
      for (let k = 0; k < 3; k++) {
        const key = this.keys[i + k]
        if (key < 0) continue
        let s = acc.get(key)
        if (!s) acc.set(key, (s = [0, 0, 0]))
        s[0] += nx
        s[1] += ny
        s[2] += nz
      }
    }
    for (let i = from; i < this.keys.length; i++) {
      const key = this.keys[i]
      const t = Math.floor((i - from) / 3) * 3
      const s = key >= 0 ? acc.get(key)! : [tri[t], tri[t + 1], tri[t + 2]]
      const len = Math.hypot(s[0], s[1], s[2]) || 1
      this.nrm[i * 3] = s[0] / len
      this.nrm[i * 3 + 1] = s[1] / len
      this.nrm[i * 3 + 2] = s[2] / len
    }
  }

  /** 附加一個已變換的非索引幾何（岩帽、碎石），頂點色依高度做 AO */
  addGeo(g: THREE.BufferGeometry, m: THREE.Matrix4, nm: THREE.Matrix3, y0: number, y1: number, ao0: number, tint: number): void {
    const pa = g.attributes.position
    const na = g.attributes.normal
    const v = new THREE.Vector3()
    const n = new THREE.Vector3()
    for (let i = 0; i < pa.count; i++) {
      v.fromBufferAttribute(pa, i).applyMatrix4(m)
      n.fromBufferAttribute(na, i).applyMatrix3(nm).normalize()
      const k = smooth01((v.y - y0) / Math.max(0.05, y1 - y0))
      this.push(v.x, v.y, v.z, v.x * 0.5, v.z * 0.5, (ao0 + (1 - ao0) * k) * tint, -1, n.x, n.y, n.z)
    }
  }

  build(mat: THREE.Material, cast: boolean): THREE.Mesh | null {
    if (!this.pos.length) return null
    const g = new THREE.BufferGeometry()
    g.setAttribute('position', new THREE.Float32BufferAttribute(this.pos, 3))
    g.setAttribute('normal', new THREE.Float32BufferAttribute(this.nrm, 3))
    g.setAttribute('uv', new THREE.Float32BufferAttribute(this.uv, 2))
    g.setAttribute('color', new THREE.Float32BufferAttribute(this.col, 3))
    g.computeBoundingSphere()
    const mesh = new THREE.Mesh(g, mat)
    mesh.castShadow = cast
    mesh.receiveShadow = true
    mesh.matrixAutoUpdate = false
    return mesh
  }
}

/** 岩塊幾何（索引化後做雜訊位移再算平滑法線，最後轉非索引）*/
const lumpCache = new Map<string, THREE.BufferGeometry>()
function lump(seed: number, detail: number): THREE.BufferGeometry {
  const key = `${seed}:${detail}`
  let g = lumpCache.get(key)
  if (g) return g
  const ico = new THREE.IcosahedronGeometry(1, detail)
  ico.deleteAttribute('normal')
  ico.deleteAttribute('uv')
  const ig = mergeVertices(ico)
  ico.dispose()
  const pos = ig.attributes.position
  const v = new THREE.Vector3()
  for (let i = 0; i < pos.count; i++) {
    v.fromBufferAttribute(pos, i)
    const k = 1 + 0.32 * fbm3(v.x * 1.3 + seed * 3.1, v.y * 1.3, v.z * 1.3 - seed, 51 + seed, 2) + 0.1 * fbm3(v.x * 3.7, v.y * 3.7 + seed, v.z * 3.7, 61 + seed, 2)
    v.multiplyScalar(Math.max(0.55, k))
    // 底部壓平（埋進地裡的那一面）
    if (v.y < -0.35) v.y = -0.35 + (v.y + 0.35) * 0.3
    pos.setXYZ(i, v.x, v.y, v.z)
  }
  ig.computeVertexNormals()
  g = ig.toNonIndexed()
  ig.dispose()
  g.userData.shared = true
  lumpCache.set(key, g)
  return g
}

// ───── 主程式 ─────

export interface RockWallOpts {
  l: ParsedLayout
  th: Theme
  group: THREE.Group
  cls: OutdoorWalls
  cellAt: (c: number, r: number) => Cell
  wallH: number
  seed: number
}

/** 牆面分層：高度比例、外擴量（正 = 往空地外擴）*/
const LEVELS = [0, 0.3, 0.66, 1]
const PROFILE = [0.14, 0.02, -0.06, -0.2]
/** 半公尺取樣 */
const SUB = 2

export function buildRockWalls(o: RockWallOpts): void {
  const { l, th, group, cls, cellAt, wallH, seed } = o
  const W = l.w
  const H = l.h
  const solid = (c: number, r: number) => isSolid(cellAt(c, r))
  const isWall = (c: number, r: number) => cellAt(c, r) === Cell.Wall
  const builtAt = (c: number, r: number) => c >= 0 && r >= 0 && c < W && r < H && cls.built[r * W + c] === 1
  const distAt = (c: number, r: number) => (c < 0 || r < 0 || c >= W || r >= H ? 255 : cls.dist[r * W + c])

  // ── 格點欄位（(W+1)×(H+1) 個角點）──
  const CW = W + 1
  const cIdx = (c: number, r: number) => r * CW + c
  // 角點離邊緣的距離（四周格子 dist 的最小值）
  const dv = new Float32Array(CW * (H + 1))
  // 角點是否「硬」（門、窗、人造牆旁邊：不位移，保持筆直對齊門框）
  const hardD = new Float32Array(CW * (H + 1)).fill(99)
  const cq: number[] = []
  for (let r = 0; r <= H; r++) {
    for (let c = 0; c <= W; c++) {
      let m = 255
      let hard = false
      for (const [dc, dr] of [[-1, -1], [0, -1], [-1, 0], [0, 0]]) {
        const cc = c + dc
        const rr = r + dr
        if (cc < 0 || rr < 0 || cc >= W || rr >= H) continue
        m = Math.min(m, cls.dist[rr * W + cc])
        const k = cellAt(cc, rr)
        if (k === Cell.Door || k === Cell.Window || k === Cell.Fixture || builtAt(cc, rr)) hard = true
      }
      dv[cIdx(c, r)] = m === 255 ? 6 : m
      if (hard) {
        hardD[cIdx(c, r)] = 0
        cq.push(cIdx(c, r))
      }
    }
  }
  for (let qi = 0; qi < cq.length; qi++) {
    const i = cq[qi]
    const c = i % CW
    const r = (i - c) / CW
    const d = hardD[i] + 1
    if (d > 3) continue
    for (let dr = -1; dr <= 1; dr++) {
      for (let dc = -1; dc <= 1; dc++) {
        const cc = c + dc
        const rr = r + dr
        if (cc < 0 || rr < 0 || cc > W || rr > H) continue
        const j = cIdx(cc, rr)
        if (hardD[j] > d) {
          hardD[j] = d
          cq.push(j)
        }
      }
    }
  }
  const bil = (f: Float32Array, gx: number, gr: number, map: (v: number) => number) => {
    const c0 = Math.max(0, Math.min(W, Math.floor(gx)))
    const r0 = Math.max(0, Math.min(H, Math.floor(gr)))
    const c1 = Math.min(W, c0 + 1)
    const r1 = Math.min(H, r0 + 1)
    const fx = gx - c0
    const fr = gr - r0
    const a = map(f[cIdx(c0, r0)])
    const b = map(f[cIdx(c1, r0)])
    const c = map(f[cIdx(c0, r1)])
    const d = map(f[cIdx(c1, r1)])
    return (a * (1 - fx) + b * fx) * (1 - fr) + (c * (1 - fx) + d * fx) * fr
  }
  /** 自然度 0..1（0 = 門框／人造牆旁邊，不位移）*/
  const wAt = (gx: number, gr: number) => bil(hardD, gx, gr, (d) => smooth01(d / 2))
  const dAt = (gx: number, gr: number) => bil(dv, gx, gr, (d) => Math.min(d, 4))
  /** 頂面高度：邊緣約牆高 ±0.7 m，往岩體內部緩升（坡度小於鏡頭俯角，不會多擋視線）*/
  const topH = (gx: number, gr: number) => {
    const w = wAt(gx, gr)
    const d = dAt(gx, gr)
    const n = 0.42 * fbm3(gx * 0.19, 3.7, gr * 0.19, seed + 5) + 0.16 * fbm3(gx * 0.63, 9.1, gr * 0.63, seed + 6, 2)
    return wallH + w * (n + d * 0.36 * (0.75 + 0.25 * fbm3(gx * 0.11, 1.3, gr * 0.11, seed + 7, 2)))
  }
  const KEYW = 2 * W + 3
  const key2 = (gx: number, gr: number) => Math.round(gr * SUB) * KEYW + Math.round(gx * SUB)

  // ── 1. 收集自然岩壁的外露面，建立輪廓圖 ──
  interface BV {
    x0: number
    r0: number
    x: number
    r: number
    nx: number
    nr: number
    nb: number[]
    w: number
  }
  const bv = new Map<number, BV>()
  const getBV = (gx: number, gr: number): number => {
    const k = key2(gx, gr)
    if (!bv.has(k)) bv.set(k, { x0: gx, r0: gr, x: gx, r: gr, nx: 0, nr: 0, nb: [], w: wAt(gx, gr) })
    return k
  }
  interface Face {
    pts: number[]
    /** 沿牆座標起點（貼圖 u）*/
    u0: number
    du: number
    nx: number
    nr: number
    toFloor: boolean
    col: number
    row: number
  }
  const faces: Face[] = []
  const builtFaces: { ax: number; ar: number; bx: number; br: number; nx: number; nr: number; u0: number }[] = []
  for (let r = 0; r < H; r++) {
    for (let c = 0; c < W; c++) {
      if (!isWall(c, r)) continue
      const sides: [number, number, number, number, number, number, number, number, number][] = [
        // [鄰格 dc, dr, a.x, a.r, b.x, b.r, nx, nr, u 起點]
        [0, -1, c + 1, r, c, r, 0, -1, -(c + 1)],
        [0, 1, c, r + 1, c + 1, r + 1, 0, 1, c],
        [-1, 0, c, r, c, r + 1, -1, 0, r],
        [1, 0, c + 1, r + 1, c + 1, r, 1, 0, -(r + 1)],
      ]
      for (const [dc, dr, ax, ar, bx, br, nx, nr, u0] of sides) {
        const nbC = cellAt(c + dc, r + dr)
        if (nbC === Cell.Wall) continue
        if (builtAt(c, r)) {
          builtFaces.push({ ax, ar, bx, br, nx, nr, u0 })
          continue
        }
        const pts: number[] = []
        for (let k = 0; k <= SUB; k++) pts.push(getBV(ax + ((bx - ax) * k) / SUB, ar + ((br - ar) * k) / SUB))
        for (let k = 0; k < pts.length; k++) {
          const v = bv.get(pts[k])!
          v.nx += nx
          v.nr += nr
          if (k > 0 && !v.nb.includes(pts[k - 1])) v.nb.push(pts[k - 1])
          if (k < pts.length - 1 && !v.nb.includes(pts[k + 1])) v.nb.push(pts[k + 1])
        }
        faces.push({ pts, u0, du: 1, nx, nr, toFloor: nbC !== Cell.Void, col: c, row: r })
      }
    }
  }
  // 輪廓平滑（Laplacian，硬點不動）
  const verts = [...bv.values()]
  for (let it = 0; it < 3; it++) {
    const nxt = verts.map((v) => {
      if (v.w <= 0 || !v.nb.length) return [v.x, v.r]
      let ax = 0
      let ar = 0
      for (const k of v.nb) {
        const n = bv.get(k)!
        ax += n.x
        ar += n.r
      }
      ax /= v.nb.length
      ar /= v.nb.length
      const lam = 0.55 * v.w
      return [v.x + (ax - v.x) * lam, v.r + (ar - v.r) * lam]
    })
    verts.forEach((v, i) => {
      v.x = nxt[i][0]
      v.r = nxt[i][1]
    })
  }
  for (const v of verts) {
    const len = Math.hypot(v.nx, v.nr)
    if (len < 0.3) {
      v.nx = 0
      v.nr = 0
    } else {
      v.nx /= len
      v.nr /= len
    }
  }
  /** 輪廓頂點在第 L 層的位置 [x, y, r]（快取，所有面共用）*/
  const ringCache = new Map<number, [number, number, number, number]>()
  const ring = (k: number, L: number): [number, number, number, number] => {
    const ck = k * 4 + L
    const have = ringCache.get(ck)
    if (have) return have
    const v = bv.get(k)!
    const hT = topH(v.x0, v.r0)
    const f = LEVELS[L]
    let y = f * hT
    const w = v.w
    if (L > 0 && L < LEVELS.length - 1) y += w * 0.16 * fbm3(v.x0 * 0.9, L * 1.7, v.r0 * 0.9, seed + 11, 2)
    const n = 0.24 * fbm3(v.x0 * 0.55, y * 0.55, v.r0 * 0.55, seed + 12) + 0.07 * fbm3(v.x0 * 1.9, y * 1.9, v.r0 * 1.9, seed + 13, 2)
    const rad = w * (PROFILE[L] + n)
    // AO：底部暗、凹進去的地方再暗一點
    const ao = (0.5 + 0.5 * smooth01(f * 1.2)) * (1 + Math.max(-0.25, Math.min(0.12, rad * 0.8))) * (0.9 + 0.1 * fbm3(v.x0 * 0.3, 0, v.r0 * 0.3, seed + 14, 2))
    const out: [number, number, number, number] = [v.x + v.nx * rad, y, v.r + v.nr * rad, ao]
    ringCache.set(ck, out)
    return out
  }

  // ── 2. 岩壁面 ──
  const side = new Geo()
  for (const f of faces) {
    for (let k = 0; k < SUB; k++) {
      const ka = f.pts[k]
      const kb = f.pts[k + 1]
      const ua = (f.u0 + (k / SUB) * f.du) * 0.5
      const ub = (f.u0 + ((k + 1) / SUB) * f.du) * 0.5
      for (let L = 0; L < LEVELS.length - 1; L++) {
        const a0 = ring(ka, L)
        const b0 = ring(kb, L)
        const b1 = ring(kb, L + 1)
        const a1 = ring(ka, L + 1)
        const quad: [[number, number, number, number], number, number][] = [
          [a0, ua, ka * 4 + L],
          [b0, ub, kb * 4 + L],
          [b1, ub, kb * 4 + L + 1],
          [a1, ua, ka * 4 + L + 1],
        ]
        for (const i of [0, 1, 2, 0, 2, 3]) {
          const [p, u, key] = quad[i]
          side.push(p[0], p[1], p[2] - H, u, p[1] / wallH, p[3], key)
        }
      }
    }
  }
  side.smoothNormals()
  const sideMesh = side.build(Mat.wall(th.wall, th.wallAccent), true)
  if (sideMesh) group.add(sideMesh)

  // ── 3. 頂面（高度場，邊緣接到牆面最上層）＋岩帽＋碎石 ──
  const capTint = th.hull.startsWith('rock:') ? th.hull.slice(5) : '#5a5860'
  const topMat = Mat.rock(capTint, 'cap', true)
  const top = new Geo()
  const exposedEdge = new Set<string>()
  for (const f of faces) exposedEdge.add(`${f.col},${f.row},${f.nx},${f.nr}`)
  const TOPK = 1 << 30
  const topPos = (gx: number, gr: number): [number, number, number, number, number] => {
    const k = key2(gx, gr)
    if (bv.has(k)) {
      const p = ring(k, LEVELS.length - 1)
      return [p[0], p[1], p[2], 0.92, k * 4 + 3 + TOPK]
    }
    const y = topH(gx, gr)
    const ao = 0.78 + 0.22 * smooth01((y - wallH + 0.6) / 2)
    return [gx, y, gr, ao, k * 4 + 3 + TOPK]
  }
  for (let r = 0; r < H; r++) {
    for (let c = 0; c < W; c++) {
      if (!isWall(c, r) || builtAt(c, r)) continue
      // 周長（從上方看逆時針）：NW → SW → SE → NE，外露邊加中點
      const per: [number, number][] = [[c, r]]
      const edge = (ax: number, ar: number, bx: number, br: number, exposed: boolean) => {
        if (exposed) for (let k = 1; k < SUB; k++) per.push([ax + ((bx - ax) * k) / SUB, ar + ((br - ar) * k) / SUB])
        per.push([bx, br])
      }
      edge(c, r, c, r + 1, exposedEdge.has(`${c},${r},-1,0`))
      edge(c, r + 1, c + 1, r + 1, exposedEdge.has(`${c},${r},0,1`))
      edge(c + 1, r + 1, c + 1, r, exposedEdge.has(`${c},${r},1,0`))
      edge(c + 1, r, c, r, exposedEdge.has(`${c},${r},0,-1`))
      per.pop()
      const pts = per.map(([x, rr]) => topPos(x, rr))
      const emit = (p: [number, number, number, number, number]) => top.push(p[0], p[1], p[2] - H, p[0] * 0.5, p[2] * 0.5, p[3], p[4])
      if (per.length === 4 && distAt(c, r) > 1) {
        for (const i of [0, 1, 2, 0, 2, 3]) emit(pts[i])
      } else {
        const cx = c + 0.5
        const cr = r + 0.5
        const cy = topH(cx, cr) + 0.12 * wAt(cx, cr)
        const ctr: [number, number, number, number, number] = [cx, cy, cr, 0.95, TOPK * 2 + r * W + c]
        for (let i = 0; i < pts.length; i++) {
          emit(ctr)
          emit(pts[i])
          emit(pts[(i + 1) % pts.length])
        }
      }
    }
  }
  top.smoothNormals()
  // 苔蘚／礦物斑塊：頂面依低頻雜訊往 accent 色偏一點（乘在貼圖上，只改色相不改亮度太多）
  {
    const ac = new THREE.Color(th.wallAccent)
    const mx = Math.max(ac.r, ac.g, ac.b) || 1
    const tr = ac.r / mx
    const tg = ac.g / mx
    const tb = ac.b / mx
    for (let i = 0; i < top.keys.length; i++) {
      const x = top.pos[i * 3]
      const z = top.pos[i * 3 + 2]
      const m = 0.3 * smooth01((fbm3(x * 0.23, 7.7, z * 0.23, seed + 31, 3) - 0.1) * 1.6)
      top.col[i * 3] *= 1 + (tr - 1) * m
      top.col[i * 3 + 1] *= 1 + (tg - 1) * m
      top.col[i * 3 + 2] *= 1 + (tb - 1) * m
    }
  }

  // 岩帽：邊緣格少量、內部格更少但更大；碎石：面向空地的牆腳
  const m4 = new THREE.Matrix4()
  const m3 = new THREE.Matrix3()
  const q = new THREE.Quaternion()
  const e = new THREE.Euler()
  const pv = new THREE.Vector3()
  const sv = new THREE.Vector3()
  const place = (g: THREE.BufferGeometry, x: number, y: number, z: number, sx: number, sy: number, sz: number, ry: number, rx: number, ao0: number, tint: number) => {
    e.set(rx, ry, rx * 0.6)
    q.setFromEuler(e)
    m4.compose(pv.set(x, y, z), q, sv.set(sx, sy, sz))
    m3.getNormalMatrix(m4)
    top.addGeo(g, m4, m3, y - sy * 0.4, y + sy * 0.9, ao0, tint)
  }
  for (let r = 0; r < H; r++) {
    for (let c = 0; c < W; c++) {
      if (!isWall(c, r) || builtAt(c, r)) continue
      const d = distAt(c, r)
      const w = wAt(c + 0.5, r + 0.5)
      if (w < 0.6) continue
      const p = cellRnd(c, r, 1, seed)
      const rim = d <= 1
      if (rim ? p > 0.22 : p > 0.07) continue
      // 往岩體內側偏一點，避免懸出太多
      let ox = 0
      let orr = 0
      for (const [dc, dr] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
        if (!solid(c + dc, r + dr)) {
          ox -= dc
          orr -= dr
        }
      }
      const rad = rim ? 0.34 + cellRnd(c, r, 2, seed) * 0.34 : 0.7 + cellRnd(c, r, 2, seed) * 0.6
      const x = c + 0.5 + ox * 0.12 + (cellRnd(c, r, 3, seed) - 0.5) * 0.3
      const rr = r + 0.5 + orr * 0.12 + (cellRnd(c, r, 4, seed) - 0.5) * 0.3
      const sy = rad * (0.5 + cellRnd(c, r, 5, seed) * 0.35)
      const y = topH(x, rr) - sy * 0.25
      const g = lump(Math.floor(cellRnd(c, r, 6, seed) * 8), 1)
      place(g, x, y, rr - H, rad * (1 + cellRnd(c, r, 7, seed) * 0.3), sy, rad * (0.85 + cellRnd(c, r, 8, seed) * 0.3), cellRnd(c, r, 9, seed) * 6.28, (cellRnd(c, r, 10, seed) - 0.5) * 0.4, 0.55, 0.9 + cellRnd(c, r, 11, seed) * 0.2)
    }
  }
  for (const f of faces) {
    if (!f.toFloor) continue
    const a = bv.get(f.pts[0])!
    const b = bv.get(f.pts[SUB])!
    if (Math.min(a.w, b.w) < 0.5) continue
    const n = Math.floor(cellRnd(f.col * 4 + f.nx + 1, f.row * 4 + f.nr + 1, 20, seed) * 3.2)
    for (let i = 0; i < n; i++) {
      const k = (s: number) => cellRnd(f.col * 4 + f.nx + 1, f.row * 4 + f.nr + 1, 21 + i * 7 + s, seed)
      const t = 0.1 + k(0) * 0.8
      const bx = a.x + (b.x - a.x) * t
      const br = a.r + (b.r - a.r) * t
      const out = 0.12 + k(1) * 0.42
      const s = 0.07 + k(2) * k(2) * 0.2
      place(lump(Math.floor(k(3) * 8) + 8, 0), bx + f.nx * out, s * 0.25, br + f.nr * out - H, s * (1 + k(4) * 0.5), s * (0.55 + k(5) * 0.35), s, k(6) * 6.28, (k(7) - 0.5) * 0.6, 0.5, 0.85 + k(8) * 0.25)
    }
  }
  const topMesh = top.build(topMat, true)
  if (topMesh) group.add(topMesh)

  // ── 4. 人造牆：筆直的混凝土牆面＋牆頂板＋面向房間的金屬壓條 ──
  if (builtFaces.length) {
    const bt = th.built ?? { wall: '#6a6c70', cap: '#2a2e33', trim: '#8a9096', rooms: [] }
    const wallMat = Mat.floor('concrete', bt.wall)
    const g = new Geo()
    for (const f of builtFaces) {
      const v: [number, number, number, number, number][] = [
        [f.ax, 0, f.ar, f.u0 * 0.5, 0.55],
        [f.bx, 0, f.br, (f.u0 + 1) * 0.5, 0.55],
        [f.bx, wallH, f.br, (f.u0 + 1) * 0.5, 1],
        [f.ax, wallH, f.ar, f.u0 * 0.5, 1],
      ]
      for (const i of [0, 1, 2, 0, 2, 3]) {
        const [x, y, rr, u, a] = v[i]
        g.push(x, y, rr - H, u, y * 0.5, a, -1, f.nx, 0, f.nr)
      }
    }
    const m = g.build(wallMat, true)
    if (m) group.add(m)
    const cap = new Batcher()
    // 室外沒有環境貼圖，高金屬度的牆頂會變全黑：牆頂用深色混凝土板，只有壓條是金屬
    const capMat = Mat.floor('concrete', bt.cap)
    const trimMat = Mat.metal(bt.trim, 0.35, false)
    for (let r = 0; r < H; r++) {
      for (let c = 0; c < W; c++) {
        if (!builtAt(c, r)) continue
        cap.add(box(1, 0.08, 1), capMat, c + 0.5, wallH + 0.04, r + 0.5 - H)
        for (const [dc, dr, ox, oz, sx, sz] of [
          [0, -1, 0, -0.47, 1, 0.06],
          [0, 1, 0, 0.47, 1, 0.06],
          [-1, 0, -0.47, 0, 0.06, 1],
          [1, 0, 0.47, 0, 0.06, 1],
        ] as const) {
          if (solid(c + dc, r + dr)) continue
          cap.add(box(sx, 0.1, sz), trimMat, c + 0.5 + ox, wallH + 0.05, r + 0.5 - H + oz)
        }
      }
    }
    cap.build(group, { cast: false, receive: true })
  }
}
