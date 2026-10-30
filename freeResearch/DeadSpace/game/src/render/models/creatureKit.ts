// 異類共用工具：有機材質、蒙皮觸手（CatmullRom tube）、甲殼片、膿包、棘刺、步態與生命週期動畫
import * as THREE from 'three'
import type { UnitDef } from '../../shared/content/types'
import type { SnapEntity } from '../../shared/protocol/messages'
import { Mat, withFog, withRim } from '../materials'

// ───── 陣營色（美術聖經 §3.2）─────
export const XENO = { main: '#7a3cff', acc: '#33ffd1' }
export const MUT = { main: '#c8323c', acc: '#e8b04a' }
export const DROID = { main: '#ffb000', acc: '#e6e6e6' }

// ───── 材質（都由 Mat.* 衍生，保留戰爭迷霧與程序化貼圖）─────

const mats = new Map<string, THREE.Material>()

/**
 * 邊光：沿用 materials.ts 的 withRim，但修正視線方向。
 * withRim 目前用 normalize(-vViewPosition)（相機→表面），正面像素的 dot 一律被 clamp 成 0，
 * 邊光變成整個正面均勻發光；這裡只對本檔的材質把方向改成 normalize(vViewPosition)（表面→相機）。
 * withRim 修好之後這個 replace 不會命中，自動變成 no-op。
 */
function rimmed<T extends THREE.MeshStandardMaterial>(m: T, color: string, k: number): T {
  withRim(m, color, k)
  const prev = m.onBeforeCompile
  m.onBeforeCompile = (shader, r) => {
    prev.call(m, shader, r)
    shader.fragmentShader = shader.fragmentShader.replace('dot(normalize(-vViewPosition), normal)', 'dot(normalize(vViewPosition), normal)')
  }
  const key = m.customProgramCacheKey.bind(m)
  m.customProgramCacheKey = () => key() + ':fix'
  return m
}
function cached<T extends THREE.Material>(k: string, f: () => T): T {
  let m = mats.get(k) as T | undefined
  if (!m) mats.set(k, (m = f()))
  return m
}

/** 濕潤有機皮膚：細胞紋＋血管紋貼圖（Mat.organic）、clearcoat 濕亮、fresnel 邊光。gloss 越小越濕 */
export function flesh(tint: string, rim: string, gloss = 0.3, rimK = 0.55): THREE.MeshStandardMaterial {
  return cached(`flesh:${tint}:${rim}:${gloss}:${rimK}`, () => {
    const vein = '#' + new THREE.Color(tint).lerp(new THREE.Color(rim), 0.3).multiplyScalar(1.25).getHexString()
    const m = Mat.organic(tint, vein, 0).clone()
    m.metalness = 0
    m.roughness = 0.6 + gloss * 0.8
    m.clearcoat = THREE.MathUtils.clamp(1.05 - gloss, 0.2, 1)
    m.clearcoatRoughness = 0.12 + gloss * 0.35
    return rimmed(withFog(m), rim, rimK)
  })
}

/** 光滑表面（骨、面具、衣物殘片）：烤漆貼圖、低金屬、邊光 */
export function smooth(tint: string, rim: string, gloss = 0.4, rimK = 0.4): THREE.MeshStandardMaterial {
  return cached(`smooth:${tint}:${rim}:${gloss}:${rimK}`, () => {
    const m = Mat.paint(tint, gloss).clone()
    m.metalness = 0.04
    return rimmed(withFog(m), rim, rimK)
  })
}

/** 甲殼：半金屬光澤、細刮痕貼圖、邊光 */
export function chitin(tint: string, rim: string, metal = 0.35, rimK = 0.45): THREE.MeshStandardMaterial {
  return cached(`chitin:${tint}:${rim}:${metal}:${rimK}`, () => {
    const m = Mat.armor(tint, rim).clone()
    m.metalness = metal
    m.roughness = 0.75
    return rimmed(withFog(m), rim, rimK)
  })
}

/** 機殼（仿生人）：烤漆金屬、邊光 */
export function shellPaint(tint: string, rim: string, rough = 0.45, rimK = 0.3): THREE.MeshStandardMaterial {
  return cached(`shell:${tint}:${rim}:${rough}:${rimK}`, () => {
    const m = Mat.metal(tint, 0.45, true).clone()
    m.roughness = rough * 1.8
    return rimmed(withFog(m), rim, rimK)
  })
}

/** 半透明膜（clearcoat） */
export function membrane(tint: string, opacity = 0.35): THREE.MeshPhysicalMaterial {
  return Mat.glass(tint, opacity)
}

/** 機械零件：烤漆／橡膠金屬＋很淡的邊光（避免與沒有邊光的 Mat.* 共用 shader 程式）*/
export function metalPart(tint: string, metalness = 0.7, rim = '#9fe7ff', rimK = 0.15): THREE.MeshStandardMaterial {
  return cached(`mpart:${tint}:${metalness}:${rim}:${rimK}`, () => {
    const m = Mat.metal(tint, metalness, false).clone()
    return rimmed(withFog(m), rim, rimK)
  })
}

export function rubberPart(tint = '#1d2024', rim = '#9fe7ff'): THREE.MeshStandardMaterial {
  return cached(`rpart:${tint}:${rim}`, () => {
    const m = Mat.rubber(tint).clone()
    return rimmed(withFog(m), rim, 0.12)
  })
}

/** 共用發光（不脈動）*/
export function glow(color: string, k = 2.5): THREE.MeshStandardMaterial {
  return Mat.emissive(color, k)
}

/** 每個實例自己的發光材質（emissiveIntensity 可脈動，不影響別人）*/
export function liveGlow(color: string, k = 2.5): THREE.MeshStandardMaterial {
  return withFog(Mat.emissive(color, k).clone())
}

/** 每個實例自己的半透明發光液體（可脈動透明度與亮度）*/
export function liveLiquid(color: string, opacity = 0.5, emi = 0.9): THREE.MeshPhysicalMaterial {
  const m = withFog(Mat.liquid(color).clone())
  m.opacity = opacity
  m.emissiveIntensity = emi
  return m
}

/** 每個實例自己的半透明膜（殘影、扭曲光暈用）*/
export function liveGlass(tint: string, opacity = 0.3): THREE.MeshPhysicalMaterial {
  const m = withFog(Mat.glass(tint, opacity).clone())
  return m
}

// ───── spawn 變體 ─────

export interface Variant {
  spawn: boolean
  /** 發光強度倍率 */
  gk: number
  /** 模型縮放 */
  scale: number
  /** 動畫相位 */
  ph: number
}

/** spawn 型共用同一模型：縮小 0.85、發光偏暗（def 已經自帶縮放時不重複縮）*/
export function variant(def: UnitDef | undefined, s: SnapEntity): Variant {
  const spawn = !!s.d?.endsWith('.spawn')
  const already = (def?.scale ?? 1) < 1
  return { spawn, gk: spawn ? 0.55 : 1, scale: spawn && !already ? 0.85 : 1, ph: (s.i * 1.618) % (Math.PI * 2) }
}

/** 發光色：spawn 型往暗處偏 */
export function tone(hex: string, v: Variant): string {
  if (!v.spawn) return hex
  const c = new THREE.Color(hex).lerp(new THREE.Color('#000000'), 0.35)
  return '#' + c.getHexString()
}

// ───── 幾何 ─────

const geos = new Map<string, THREE.BufferGeometry>()
function geo<T extends THREE.BufferGeometry>(k: string, f: () => T): T {
  let g = geos.get(k) as T | undefined
  if (!g) geos.set(k, (g = f()))
  return g
}

/** 圓頂（部分球面），用於甲殼片、頭殼。共用，不要 dispose */
export function dome(r = 1, ws = 14, hs = 7, theta = Math.PI / 2): THREE.BufferGeometry {
  return geo(`dome:${r}:${ws}:${hs}:${theta}`, () => new THREE.SphereGeometry(r, ws, hs, 0, Math.PI * 2, 0, theta))
}

/** 錐形（棘刺、爪）：底在 y=0、尖端在 y=h */
export function spikeGeo(r: number, h: number, seg = 6): THREE.BufferGeometry {
  return geo(`spike:${r}:${h}:${seg}`, () => {
    const g = new THREE.ConeGeometry(r, h, seg, 1)
    g.translate(0, h / 2, 0)
    return g
  })
}

/** 彎曲的爪／角：沿 CatmullRom 曲線的錐管，底在原點往 +Y 延伸並向 +Z 彎 */
export function hornGeo(len: number, r: number, bend = 0.4, seg = 8, rad = 6): THREE.BufferGeometry {
  return geo(`horn:${len}:${r}:${bend}:${seg}:${rad}`, () => {
    const curve = new THREE.CatmullRomCurve3([
      new THREE.Vector3(0, 0, 0),
      new THREE.Vector3(0, len * 0.4, len * bend * 0.15),
      new THREE.Vector3(0, len * 0.75, len * bend * 0.5),
      new THREE.Vector3(0, len, len * bend),
    ])
    const g = new THREE.TubeGeometry(curve, seg, 1, rad, false)
    const pos = g.attributes.position
    const nrm = g.attributes.normal
    const P = new THREE.Vector3()
    for (let i = 0; i <= seg; i++) {
      curve.getPointAt(i / seg, P)
      const rr = r * Math.max(0.02, 1 - i / seg)
      for (let j = 0; j <= rad; j++) {
        const k = i * (rad + 1) + j
        pos.setXYZ(k, P.x + nrm.getX(k) * rr, P.y + nrm.getY(k) * rr, P.z + nrm.getZ(k) * rr)
      }
    }
    return g
  })
}

/** 扭曲的有機團塊（球面加雜訊位移），用於肉瘤、不定形體 */
export function lumpGeo(r: number, seed: number, amp = 0.18, ws = 14, hs = 10): THREE.BufferGeometry {
  return geo(`lump:${r}:${seed}:${amp}:${ws}:${hs}`, () => {
    const g = new THREE.SphereGeometry(r, ws, hs)
    const pos = g.attributes.position
    const v = new THREE.Vector3()
    for (let i = 0; i < pos.count; i++) {
      v.fromBufferAttribute(pos, i)
      const n = v.clone().normalize()
      const d = Math.sin(n.x * 3.1 + seed) * Math.sin(n.y * 2.7 + seed * 1.7) * Math.sin(n.z * 3.3 + seed * 0.7) + 0.5 * Math.sin(n.x * 7 + n.z * 5 + seed)
      v.addScaledVector(n, d * amp * r)
      pos.setXYZ(i, v.x, v.y, v.z)
    }
    g.computeVertexNormals()
    return g
  })
}

/** 岩塊／殘骸（低面數十二面體，共用）*/
export function rockGeo(): THREE.BufferGeometry {
  return geo('rock', () => new THREE.DodecahedronGeometry(1, 0))
}

/** Lathe（旋轉體），共用 */
export function lathe(points: [number, number][], seg = 16): THREE.BufferGeometry {
  return geo(`lathe:${JSON.stringify(points)}:${seg}`, () => new THREE.LatheGeometry(points.map(([x, y]) => new THREE.Vector2(x, y)), seg))
}

/** 以建構時的縮放為基準乘上倍率（脈動用，避免覆蓋掉橢球的原始比例）*/
export function scaleBy(o: THREE.Object3D, k: number): void {
  const b = (o.userData.s0 as THREE.Vector3 | undefined) ?? (o.userData.s0 = o.scale.clone())
  o.scale.copy(b).multiplyScalar(k)
}

// ───── 物件組裝 ─────

export function part(
  parent: THREE.Object3D,
  g: THREE.BufferGeometry,
  m: THREE.Material,
  x = 0,
  y = 0,
  z = 0,
  sx = 1,
  sy = sx,
  sz = sx,
  rx = 0,
  ry = 0,
  rz = 0,
): THREE.Mesh {
  const o = new THREE.Mesh(g, m)
  o.position.set(x, y, z)
  o.scale.set(sx, sy, sz)
  o.rotation.set(rx, ry, rz)
  o.castShadow = true
  o.receiveShadow = true
  parent.add(o)
  return o
}

export function grp(parent: THREE.Object3D, x = 0, y = 0, z = 0, rx = 0, ry = 0, rz = 0): THREE.Group {
  const g = new THREE.Group()
  g.position.set(x, y, z)
  g.rotation.set(rx, ry, rz)
  parent.add(g)
  return g
}

/** 棘刺：底部樞紐在 (x,y,z)，朝 rx/rz 傾斜 */
export function spike(parent: THREE.Object3D, r: number, h: number, m: THREE.Material, x: number, y: number, z: number, rx = 0, rz = 0, seg = 6): THREE.Mesh {
  return part(parent, spikeGeo(r, h, seg), m, x, y, z, 1, 1, 1, rx, 0, rz)
}

/** 確定性亂數（每種模型固定外形）*/
export function rng(seed: number): () => number {
  let a = seed >>> 0 || 1
  return () => {
    a = (a + 0x6d2b79f5) >>> 0
    let t = a
    t = Math.imul(t ^ (t >>> 15), t | 1)
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61)
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
}

// ───── 蒙皮觸手：CatmullRom tube＋骨鏈，update 擺動（GPU skinning，幾何共用）─────

function tentacleGeo(len: number, r0: number, r1: number, nb: number, tub: number, rad: number, ridge: number): THREE.BufferGeometry {
  return geo(`tent:${len}:${r0}:${r1}:${nb}:${tub}:${rad}:${ridge}`, () => {
    const curve = new THREE.CatmullRomCurve3([0, 0.34, 0.67, 1].map((u) => new THREE.Vector3(0, u * len, 0)))
    const g = new THREE.TubeGeometry(curve, tub, 1, rad, false)
    const pos = g.attributes.position
    const nrm = g.attributes.normal
    const P = new THREE.Vector3()
    const si = new Uint16Array(pos.count * 4)
    const sw = new Float32Array(pos.count * 4)
    for (let i = 0; i <= tub; i++) {
      const u = i / tub
      curve.getPointAt(u, P)
      let r = THREE.MathUtils.lerp(r0, r1, Math.pow(u, 0.85)) * (1 + ridge * Math.sin(u * tub * 1.6))
      if (i === tub) r *= 0.25
      if (i === 0) r *= 0.92
      const s = Math.min(nb - 1 - 1e-4, u * (nb - 1))
      const b = Math.floor(s)
      const w = s - b
      for (let j = 0; j <= rad; j++) {
        const k = i * (rad + 1) + j
        pos.setXYZ(k, P.x + nrm.getX(k) * r, P.y + nrm.getY(k) * r, P.z + nrm.getZ(k) * r)
        si[k * 4] = b
        si[k * 4 + 1] = Math.min(nb - 1, b + 1)
        sw[k * 4] = 1 - w
        sw[k * 4 + 1] = w
      }
    }
    g.setAttribute('skinIndex', new THREE.Uint16BufferAttribute(si, 4))
    g.setAttribute('skinWeight', new THREE.Float32BufferAttribute(sw, 4))
    return g
  })
}

export interface TentacleOpts {
  len: number
  r0: number
  r1?: number
  bones?: number
  tub?: number
  rad?: number
  /** 表面環紋（0..0.2）*/
  ridge?: number
}

/** 觸手／尾巴／蛇身：沿 local +Y 生長，用 bend() 每幀彎曲 */
export class Tentacle {
  readonly mesh: THREE.SkinnedMesh
  readonly bones: THREE.Bone[] = []
  /** 尖端掛點（發光球、刺、頭）*/
  readonly tip: THREE.Bone
  constructor(parent: THREE.Object3D, o: TentacleOpts, m: THREE.Material) {
    const nb = o.bones ?? 6
    const g = tentacleGeo(o.len, o.r0, o.r1 ?? o.r0 * 0.2, nb, o.tub ?? 14, o.rad ?? 7, o.ridge ?? 0)
    this.mesh = new THREE.SkinnedMesh(g, m)
    for (let i = 0; i < nb; i++) {
      const b = new THREE.Bone()
      b.position.y = i === 0 ? 0 : o.len / (nb - 1)
      if (i === 0) this.mesh.add(b)
      else this.bones[i - 1].add(b)
      this.bones.push(b)
    }
    this.mesh.bind(new THREE.Skeleton(this.bones))
    this.mesh.castShadow = true
    this.mesh.frustumCulled = false
    this.tip = this.bones[nb - 1]
    parent.add(this.mesh)
  }

  /**
   * 擺動：每節繞 x／z 的角度 = 捲曲 + 振幅·sin(t·頻率 − 節·延遲 + 相位)。
   * 振幅隨節數遞增（根部穩、尾端甩）。
   */
  bend(t: number, ax: number, az: number, freq: number, ph = 0, curlX = 0, curlZ = 0, lag = 0.7): void {
    const n = this.bones.length
    for (let i = 1; i < n; i++) {
      const k = 0.4 + (i / n) * 0.9
      const a = t * freq - i * lag + ph
      this.bones[i].rotation.x = curlX + Math.sin(a) * ax * k
      this.bones[i].rotation.z = curlZ + Math.cos(a * 0.87 + 1.3) * az * k
    }
  }

  /** 每節的伸縮（脈動、塌陷）*/
  squash(k: number): void {
    for (let i = 1; i < this.bones.length; i++) this.bones[i].scale.setScalar(k)
  }
}

// ───── 甲殼、膿包、靜脈 ─────

/** 一排重疊的甲殼片（沿 z 軸，從 z0 到 z1），回傳每片的 group 方便脈動 */
export function plates(parent: THREE.Object3D, n: number, z0: number, z1: number, y: number, w: number, h: number, l: number, m: THREE.Material, tilt = 0.25, taper = 0.25): THREE.Mesh[] {
  const out: THREE.Mesh[] = []
  for (let i = 0; i < n; i++) {
    const u = n === 1 ? 0 : i / (n - 1)
    const s = 1 - taper * Math.abs(u - 0.35) * 1.6
    const p = part(parent, dome(1, 12, 5, Math.PI * 0.42), m, 0, y - u * 0.02, THREE.MathUtils.lerp(z0, z1, u), w * s, h * s, l, -tilt, 0, 0)
    out.push(p)
  }
  return out
}

/** 膿包／發光囊：at 回傳 [x, y, z, 大小]，以 center 為中心朝外生長；回傳發光核心（可脈動）*/
export function pustules(
  parent: THREE.Object3D,
  n: number,
  seed: number,
  at: (r: () => number, i: number) => [number, number, number, number],
  skin: THREE.Material,
  core: THREE.Material,
  center: [number, number, number] = [0, 0, 0],
): THREE.Mesh[] {
  const r = rng(seed)
  const out: THREE.Mesh[] = []
  const up = new THREE.Vector3(0, 1, 0)
  const d = new THREE.Vector3()
  for (let i = 0; i < n; i++) {
    const [x, y, z, s] = at(r, i)
    const g = grp(parent, x, y, z)
    d.set(x - center[0], y - center[1], z - center[2])
    if (d.lengthSq() > 1e-6) g.quaternion.setFromUnitVectors(up, d.normalize())
    part(g, dome(1, 8, 4, Math.PI * 0.55), skin, 0, -s * 0.25, 0, s * 1.15, s * 0.9, s * 1.15)
    const c = part(g, dome(1, 8, 3, Math.PI * 0.5), core, 0, s * 0.05, 0, s * 0.8, s * 0.75, s * 0.8)
    c.castShadow = false
    out.push(c)
  }
  return out
}

/** 發光靜脈：一條貼在表面的細管（CatmullRom）*/
export function vein(parent: THREE.Object3D, pts: [number, number, number][], r: number, m: THREE.Material, seg = 12): THREE.Mesh {
  const curve = new THREE.CatmullRomCurve3(pts.map(([x, y, z]) => new THREE.Vector3(x, y, z)))
  const g = geo(`vein:${JSON.stringify(pts)}:${r}:${seg}`, () => new THREE.TubeGeometry(curve, seg, r, 4, false))
  const o = part(parent, g, m)
  o.castShadow = false
  return o
}

// ───── 動畫：生命週期與步態 ─────

const ease = (k: number) => 1 - (1 - k) * (1 - k)

/** 每個模型一份：平滑後的移動量、攻擊節奏、死亡進度（1 秒內倒下）*/
export class Life {
  deadAt = -1
  /** 0..1 死亡進度（ease-out）*/
  dead = 0
  /** 0..1 平滑後的移動權重 */
  move = 0
  /** 0..1 平滑後的攻擊權重 */
  atk = 0
  /** 0..1 平滑後的施法／引導權重 */
  cast = 0
  /** 步態相位（弧度）*/
  walk = 0
  /** 攻擊揮擊曲線（-0.35 蓄力 → 1 出手 → 0 收回）*/
  strike = 0
  private atkT = 0
  constructor(
    readonly ph: number,
    readonly stride = 6,
    readonly atkRate = 1.1,
  ) {}

  step(t: number, dt: number, speed: number, state: number): void {
    if (state === 4) {
      if (this.deadAt < 0) this.deadAt = t
      this.dead = ease(Math.min(1, (t - this.deadAt) / 0.9))
    } else {
      this.deadAt = -1
      this.dead = 0
    }
    const k = Math.min(1, dt * 7)
    const mv = state !== 4 && (state === 1 || speed > 0.15) ? 1 : 0
    this.move += (mv - this.move) * k
    this.atk += ((state === 2 ? 1 : 0) - this.atk) * Math.min(1, dt * 9)
    this.cast += ((state === 3 || state === 5 ? 1 : 0) - this.cast) * k
    const sp = Math.max(speed, state === 1 ? 2.5 : 0)
    this.walk += dt * (this.stride * (0.55 + Math.min(1.6, sp / 3) * 0.6)) * this.move
    if (state === 2) {
      this.atkT += dt * this.atkRate
      const p = this.atkT % 1
      this.strike = p < 0.45 ? -0.35 * Math.sin((p / 0.45) * Math.PI * 0.5) : p < 0.6 ? -0.35 + 1.35 * Math.sin(((p - 0.45) / 0.15) * Math.PI * 0.5) : 1 - ease((p - 0.6) / 0.4)
    } else {
      this.atkT = 0.3
      this.strike *= 1 - k
    }
  }

  /** 呼吸／脈動（0..1）*/
  breathe(t: number, f = 1.6): number {
    return 0.5 + 0.5 * Math.sin(t * f + this.ph)
  }
}

/** 多足步態：第 i 隻腳的擺動（-1..1）與抬腳（0..1）*/
export function stepOf(walk: number, offset: number): [number, number] {
  const a = walk + offset * Math.PI * 2
  return [Math.sin(a), Math.max(0, Math.cos(a))]
}

/** 死亡：往側邊倒下並下沉（body 為要倒的 group，h 為重心高度）*/
export function topple(body: THREE.Object3D, k: number, side = 1, h = 0.5): void {
  body.rotation.z = side * k * 1.35
  body.position.y = -k * h * 0.55
}

/** 漂浮者死亡：掉到地上並壓扁 */
export function drop(body: THREE.Object3D, k: number, hover: number): void {
  body.position.y = hover * (1 - k) - k * 0.15
  body.rotation.x = k * 0.9
  body.scale.y = 1 - k * 0.35
}

/** 把整棵 Object3D 內的觸手／動畫掛點一起更新的小工具 */
export type Tick = (t: number, dt: number) => void

// ───── 肢段 ─────

/** 有機肢段：從關節往 -Y 長 l 的橢球（自然收尾）*/
export function seg(parent: THREE.Object3D, l: number, r: number, m: THREE.Material, rz = r): THREE.Mesh {
  return part(parent, sphereGeo(), m, 0, -l / 2, 0, r, l * 0.62, rz)
}

/** 共用的單位球（縮放成橢球用）*/
export function sphereGeo(ws = 10, hs = 7): THREE.BufferGeometry {
  return geo(`usph:${ws}:${hs}`, () => new THREE.SphereGeometry(1, ws, hs))
}

/** 橢球零件 */
export function ell(parent: THREE.Object3D, m: THREE.Material, x: number, y: number, z: number, rx: number, ry: number, rz: number, ws = 10, hs = 7): THREE.Mesh {
  return part(parent, sphereGeo(ws, hs), m, x, y, z, rx, ry, rz)
}

export interface Leg {
  hip: THREE.Group
  knee: THREE.Group
  foot: THREE.Group
  a1: number
  a2: number
  front: boolean
  side: number
}

/**
 * 兩節腿：hip 在 (x,y,z)，大腿長 l1、與垂直夾角 a1（正值往後），小腿總角 a12（相對垂直）。
 * 小腿長度自動算到腳底碰地。
 */
export function leg2(parent: THREE.Object3D, x: number, y: number, z: number, l1: number, a1: number, a12: number, r1: number, r2: number, m: THREE.Material, front: boolean, ground = y): Leg {
  const hip = grp(parent, x, y, z, a1)
  seg(hip, l1, r1, m)
  const l2 = Math.max(0.1, (ground - l1 * Math.cos(a1)) / Math.cos(a12))
  const knee = grp(hip, 0, -l1, 0, a12 - a1)
  seg(knee, l2, r2, m)
  const foot = grp(knee, 0, -l2, 0, -(a12))
  return { hip, knee, foot, a1, a2: a12 - a1, front, side: Math.sign(x) || 1 }
}

/** 腳爪：在 foot 上加 n 根往前的爪 */
export function claws(foot: THREE.Object3D, n: number, len: number, r: number, m: THREE.Material, spread = 0.5): void {
  for (let i = 0; i < n; i++) {
    const a = n === 1 ? 0 : (i / (n - 1) - 0.5) * spread
    const g = grp(foot, Math.sin(a) * r * 1.5, r * 0.3, 0, Math.PI / 2 - 0.25, a, 0)
    part(g, hornGeo(len, r, 0.5, 4, 4), m)
  }
}

/** 腿的步態：swing -1..1、lift 0..1、k 為移動權重 */
export function animLeg(l: Leg, sw: number, lift: number, k: number, amp = 0.45, bend = 0.7): void {
  l.hip.rotation.x = l.a1 - sw * amp * k
  l.knee.rotation.x = l.a2 + (l.front ? -1 : 1) * lift * bend * k
  l.foot.rotation.x = -(l.a1 + l.a2) + sw * amp * k * 0.5
}

/** 死亡時把腿縮起來 */
export function foldLeg(l: Leg, k: number): void {
  l.hip.rotation.x = THREE.MathUtils.lerp(l.hip.rotation.x, l.a1 + (l.front ? -0.9 : 0.9), k)
  l.knee.rotation.x = THREE.MathUtils.lerp(l.knee.rotation.x, l.a2 + (l.front ? 1.2 : -1.2), k)
}

// ───── 蜘蛛式多足（側向展開、膝蓋高於身體）─────

export interface SpiderLeg {
  hip: THREE.Group
  femur: THREE.Group
  knee: THREE.Group
  yaw: number
  up: number
  down: number
}

/** 側向的多節腿：hip 在 (x,y,z)，朝 yaw 方向（0 = +X）展開；股節往上 up、脛節往下到地面 */
export function spiderLeg(parent: THREE.Object3D, x: number, y: number, z: number, yaw: number, l1: number, r: number, up: number, reach: number, m: THREE.Material, tip?: THREE.Material, ws = 8, hs = 5): SpiderLeg {
  const hip = grp(parent, x, y, z, 0, yaw, 0)
  const femur = grp(hip, 0, 0, 0, 0, 0, up)
  part(femur, sphereGeo(ws, hs), m, l1 / 2, 0, 0, l1 * 0.55, r, r)
  // 膝蓋位置 (l1·cos up, y + l1·sin up)；脛節要從那裡落到地面、水平再伸 reach
  const ky = y + l1 * Math.sin(up)
  const down = Math.atan2(ky, reach)
  const l2 = Math.hypot(ky, reach)
  const knee = grp(femur, l1, 0, 0, 0, 0, -up - down)
  part(knee, sphereGeo(ws, hs), m, l2 / 2, 0, 0, l2 * 0.53, r * 0.75, r * 0.75)
  if (tip) part(knee, spikeGeo(r * 0.55, Math.min(0.22, l2 * 0.3), 4), tip, l2 * 0.97, 0, 0, 1, 1, 1, 0, 0, -Math.PI / 2)
  return { hip, femur, knee, yaw, up, down }
}

export function animSpider(l: SpiderLeg, sw: number, lift: number, k: number, amp = 0.25): void {
  l.hip.rotation.y = l.yaw + sw * amp * k
  l.femur.rotation.z = l.up + lift * 0.35 * k
}

// ───── 四足骨架（異形原型體系、潛伏者…）─────

export interface QuadOpts {
  skin: THREE.Material
  /** 胸腔與骨盆的橢球半徑 */
  chest: [number, number, number]
  pelvis: [number, number, number]
  chestZ: number
  pelvisZ: number
  shH: number
  hipH: number
  legW: number
  /** 前腿：[大腿長, 大腿角, 小腿角] */
  fl: [number, number, number]
  rl: [number, number, number]
  legR: [number, number]
  neckLen: number
  neckPitch: number
  tail?: TentacleOpts
  tailMat?: THREE.Material
}

export interface QuadRig {
  body: THREE.Group
  spine: THREE.Group
  chest: THREE.Group
  pelvis: THREE.Group
  neck: THREE.Group
  head: THREE.Group
  legs: Leg[]
  tail: Tentacle | null
  tailBase: THREE.Group | null
  o: QuadOpts
}

export function buildQuad(parent: THREE.Object3D, o: QuadOpts): QuadRig {
  const body = grp(parent)
  const spine = grp(body)
  const chest = grp(spine, 0, o.shH, o.chestZ)
  ell(chest, o.skin, 0, 0, 0, ...o.chest)
  const pelvis = grp(spine, 0, o.hipH, o.pelvisZ)
  ell(pelvis, o.skin, 0, 0, 0, ...o.pelvis)
  // 腰：連接胸腔與骨盆
  const wz = (o.chestZ + o.pelvisZ) / 2
  ell(spine, o.skin, 0, (o.shH + o.hipH) / 2 + 0.02, wz, o.pelvis[0] * 0.75, o.pelvis[1] * 0.8, Math.abs(o.chestZ - o.pelvisZ) * 0.45)
  const neck = grp(chest, 0, o.chest[1] * 0.35, o.chest[2] * 0.75, -o.neckPitch)
  ell(neck, o.skin, 0, 0, o.neckLen / 2, o.chest[0] * 0.42, o.chest[1] * 0.42, o.neckLen * 0.6)
  const head = grp(neck, 0, 0, o.neckLen, o.neckPitch)
  const [fl1, fa1, fa2] = o.fl
  const [rl1, ra1, ra2] = o.rl
  const legs = [
    leg2(spine, -o.legW, o.shH - o.chest[1] * 0.25, o.chestZ + o.chest[2] * 0.25, fl1, fa1, fa2, o.legR[0], o.legR[1], o.skin, true),
    leg2(spine, o.legW, o.shH - o.chest[1] * 0.25, o.chestZ + o.chest[2] * 0.25, fl1, fa1, fa2, o.legR[0], o.legR[1], o.skin, true),
    leg2(spine, -o.legW * 0.92, o.hipH - o.pelvis[1] * 0.2, o.pelvisZ - o.pelvis[2] * 0.1, rl1, ra1, ra2, o.legR[0] * 1.1, o.legR[1], o.skin, false),
    leg2(spine, o.legW * 0.92, o.hipH - o.pelvis[1] * 0.2, o.pelvisZ - o.pelvis[2] * 0.1, rl1, ra1, ra2, o.legR[0] * 1.1, o.legR[1], o.skin, false),
  ]
  let tail: Tentacle | null = null
  let tailBase: THREE.Group | null = null
  if (o.tail) {
    tailBase = grp(pelvis, 0, o.pelvis[1] * 0.25, -o.pelvis[2] * 0.8, -Math.PI / 2 - 0.25)
    tail = new Tentacle(tailBase, o.tail, o.tailMat ?? o.skin)
  }
  return { body, spine, chest, pelvis, neck, head, legs, tail, tailBase, o }
}

/** 四足的標準動畫（小跑步態、呼吸、前撲、側倒）*/
export function animQuad(r: QuadRig, L: Life, t: number, amp = 0.45, bob = 0.06, lunge = 0.3): void {
  const k = L.move
  const off = [0, 0.5, 0.5, 0]
  for (let i = 0; i < 4; i++) {
    const [sw, lift] = stepOf(L.walk, off[i])
    animLeg(r.legs[i], sw, lift, k, amp)
  }
  const br = L.breathe(t)
  r.chest.scale.set(1 + br * 0.03, 1 + br * 0.04, 1)
  r.spine.position.y = Math.abs(Math.sin(L.walk)) * bob * k + (1 - k) * (br - 0.5) * 0.015
  r.spine.rotation.x = Math.sin(L.walk * 2) * 0.03 * k + 0.05 * k
  r.spine.rotation.z = Math.sin(L.walk) * 0.03 * k
  // 攻擊：前撲＋前腳抬起
  const s = L.strike * L.atk
  r.spine.position.z = s * lunge
  r.spine.rotation.x += -Math.max(0, s) * 0.12 + Math.min(0, s) * -0.1
  for (let i = 0; i < 2; i++) r.legs[i].hip.rotation.x -= Math.max(0, s) * 0.8
  r.neck.rotation.x = -r.o.neckPitch + Math.sin(t * 0.7 + L.ph) * 0.05 * (1 - k) + k * 0.15 + Math.max(0, s) * 0.3
  r.neck.rotation.y = Math.sin(t * 0.45 + L.ph) * 0.25 * (1 - k) * (1 - L.atk)
  if (r.tail) r.tail.bend(t, 0.08 + k * 0.06, 0.2 + k * 0.1, 1.6 + k * 2.5, L.ph, 0.11 - k * 0.05, Math.sin(t * 0.37 + L.ph) * 0.14 * (1 - k))
  if (L.dead > 0) {
    for (const l of r.legs) foldLeg(l, L.dead)
    topple(r.body, L.dead, 1, r.o.shH)
    if (r.tail) r.tail.bend(t, 0, 0, 0, 0, 0.15 * L.dead, 0.2 * L.dead)
  } else {
    r.body.rotation.z = 0
    r.body.position.y = 0
  }
}

// ───── 雙足骨架（變種人、時滯殭屍…）─────

export interface BipedOpts {
  skin: THREE.Material
  limb?: THREE.Material
  hipH: number
  /** 軀幹橢球半徑 */
  torso: [number, number, number]
  /** 骨盆橢球半徑 */
  pelvis: [number, number, number]
  /** 駝背（前傾）*/
  hunch: number
  shoulderW: number
  arm: [number, number]
  armR: [number, number]
  /** 大腿長、大腿角、小腿角（數位腳：小腿往後）*/
  thigh: [number, number, number]
  legR: [number, number]
  legW: number
  headR: [number, number, number]
  neckLen: number
}

export interface BipedRig {
  body: THREE.Group
  hips: THREE.Group
  torso: THREE.Group
  head: THREE.Group
  neck: THREE.Group
  arms: { sh: THREE.Group; el: THREE.Group; hand: THREE.Group }[]
  legs: Leg[]
  o: BipedOpts
}

export function buildBiped(parent: THREE.Object3D, o: BipedOpts): BipedRig {
  const limb = o.limb ?? o.skin
  const body = grp(parent)
  const hips = grp(body, 0, o.hipH, 0)
  ell(hips, o.skin, 0, 0, 0, ...o.pelvis)
  const torso = grp(hips, 0, o.pelvis[1] * 0.6, 0, o.hunch)
  ell(torso, o.skin, 0, o.torso[1] * 0.85, 0, ...o.torso)
  const top = o.torso[1] * 1.6
  const neck = grp(torso, 0, top, o.torso[2] * 0.25, -o.hunch * 0.6)
  ell(neck, o.skin, 0, o.neckLen * 0.4, 0, o.headR[0] * 0.55, o.neckLen * 0.7, o.headR[0] * 0.55)
  const head = grp(neck, 0, o.neckLen, 0.02)
  const arms: BipedRig['arms'] = []
  for (const sd of [-1, 1]) {
    const sh = grp(torso, sd * o.shoulderW, top * 0.88, 0, 0, 0, sd * 0.12)
    ell(sh, o.skin, 0, 0, 0, o.armR[0] * 1.3, o.armR[0] * 1.2, o.armR[0] * 1.3)
    seg(sh, o.arm[0], o.armR[0], limb)
    const el = grp(sh, 0, -o.arm[0], 0, -0.35)
    seg(el, o.arm[1], o.armR[1], limb)
    const hand = grp(el, 0, -o.arm[1], 0)
    arms.push({ sh, el, hand })
  }
  const [l1, a1, a2] = o.thigh
  const legs = [-1, 1].map((sd) => leg2(hips, sd * o.legW, 0, 0, l1, a1, a2, o.legR[0], o.legR[1], limb, false, o.hipH))
  return { body, hips, torso, head, neck, arms, legs, o }
}

/** 雙足的標準動畫：走路、呼吸、雙臂輪流揮擊、往後倒 */
export function animBiped(r: BipedRig, L: Life, t: number, amp = 0.55, swingArms = 0.5): void {
  const k = L.move
  const br = L.breathe(t, 1.4)
  for (let i = 0; i < 2; i++) {
    const [sw, lift] = stepOf(L.walk, i * 0.5)
    animLeg(r.legs[i], sw, lift, k, amp, 0.9)
  }
  r.hips.position.y = r.o.hipH + Math.abs(Math.cos(L.walk)) * 0.05 * k - k * 0.03
  r.torso.rotation.x = r.o.hunch + k * 0.1 + (br - 0.5) * 0.02
  r.torso.rotation.y = Math.sin(L.walk) * 0.1 * k
  r.torso.scale.set(1 + br * 0.025, 1 + br * 0.02, 1 + br * 0.025)
  r.neck.rotation.y = Math.sin(t * 0.5 + L.ph) * 0.3 * (1 - k) * (1 - L.atk)
  const s = L.strike * L.atk
  for (let i = 0; i < 2; i++) {
    const a = r.arms[i]
    const sw = Math.sin(L.walk + i * Math.PI) * swingArms * k
    // 攻擊：右手主揮、左手輔助；蓄力往後上舉，出手往前下劈
    const hit = i === 1 ? s : s * 0.45
    a.sh.rotation.x = sw - Math.max(0, hit) * 1.6 + Math.min(0, hit) * -2.2 - L.cast * 1.1
    a.el.rotation.x = -0.35 - Math.max(0, -hit) * 1.2 - L.cast * 0.3
    a.sh.rotation.z = (i === 0 ? -1 : 1) * (0.12 + Math.max(0, hit) * 0.3 + L.cast * 0.25)
  }
  r.torso.rotation.y += s * 0.25
  if (L.dead > 0) {
    const d = L.dead
    r.body.rotation.x = -d * Math.PI * 0.47
    r.body.position.y = d * 0.15
    for (const l of r.legs) l.hip.rotation.x = THREE.MathUtils.lerp(l.hip.rotation.x, -0.5, d)
    for (const a of r.arms) a.sh.rotation.x = THREE.MathUtils.lerp(a.sh.rotation.x, -2.4, d)
  } else {
    r.body.rotation.x = 0
    r.body.position.y = 0
  }
}
