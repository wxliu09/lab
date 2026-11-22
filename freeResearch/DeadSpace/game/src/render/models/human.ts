// 程序化人物：略誇張的英雄比例、收藏公仔質感（美術聖經 §8）。正面朝 local +Z。
// 身體由 lathe 圓潤肢段（大腿、小腿、上臂、前臂各自收腰、有肌肉起伏）、斜角硬殼（護膝、背包、槍）、擠出的靴子與手套組成，
// 全部登記在 Kit 裡、最後依骨架節點合併（見 humanKit.ts）。
// 外觀只看 classId、playerColor、seed（快照的 cl、c 與 id）：偽裝成人類的異形走同一條路，任何零件都不依賴隱藏身分。
import * as THREE from 'three'
import { quality } from '../quality'
import {
  Kit,
  ball,
  blk,
  bootGeo,
  cbox,
  handGeo,
  hose,
  lathe,
  ring,
  tube,
  type PartOpts,
  type V3,
} from './humanKit'
import type { Tile } from './humanTex'

export interface Rig {
  root: THREE.Group
  body: THREE.Group
  torso: THREE.Group
  head: THREE.Group
  armL: THREE.Group
  armR: THREE.Group
  foreL: THREE.Group
  foreR: THREE.Group
  legL: THREE.Group
  legR: THREE.Group
  shinL: THREE.Group
  shinR: THREE.Group
  /** 武器槍口（特效起點）*/
  muzzle: THREE.Object3D
  /** 手電筒掛點 */
  lamp: THREE.Object3D
  phase: number
  height: number
  /** 自訂動畫（線圈旋轉、燃料罐霧氣…）*/
  extra: ((t: number, dt: number) => void)[]
}

/** 骨架之外、建構與防護服共用的資料（不放進 Rig，公開介面不變）*/
export interface RigBuild {
  kit: Kit
  cls: string
  seed: number
  pc: string
  /** 髖部（大腿、腰帶掛在這）*/
  hip: THREE.Group
  /** 雙手持槍（瞄準時左手扶槍）*/
  twoHanded: boolean
  /** 左手拿長東西，走路少擺 */
  steadyL: boolean
  /** 目前的外觀 key（防護服重建時換掉）*/
  key: string
}

const builds = new WeakMap<Rig, RigBuild>()

/** 防護服用：取得這個人形的建構資料 */
export function rigBuild(r: Rig): RigBuild | undefined {
  return builds.get(r)
}

// ───── 尺寸（骨架節點位置，動畫依賴這些，不要改）─────

const HIP_Y = 0.95
const THIGH_X = 0.11
const KNEE_Y = -0.42
const TORSO_Y = 0.36
const SHOULDER: V3 = [0.3, 0.2, 0]
const ELBOW_Y = -0.32
const HAND_Y = -0.3

/** 槍的握持座標系（前臂座標）：+Z = 槍管。手臂垂下時槍口朝前下方，舉槍瞄準（armR.x ≈ -1.4）時槍管水平朝前 */
export const GUN_FRAME = new THREE.Matrix4().compose(
  new THREE.Vector3(0, HAND_Y + 0.005, 0.012),
  new THREE.Quaternion().setFromEuler(new THREE.Euler(Math.PI / 2 - 0.18, 0, 0)),
  new THREE.Vector3(1, 1, 1),
)

/** 握持座標系裡的一點 → 前臂座標 */
export function gunPoint(z: number, y = 0.02): THREE.Vector3 {
  return new THREE.Vector3(0, y, z).applyMatrix4(GUN_FRAME)
}

// ───── 調色盤 ─────

const SKINS = ['#e0b49a', '#c8946f', '#8d5a3b', '#f1cdb4', '#a8774f']
const HAIRS = ['#2a1d16', '#4a3020', '#161414', '#7a4426', '#b08a58', '#8b8e93']

type Pack = 'std' | 'medic' | 'tank' | 'chute' | 'tool' | 'radio' | 'none'
type Gun = 'pistol' | 'smg' | 'revolver' | 'rifle'

interface ClassLook {
  /** 上衣／外套 */
  top: string
  topTile: Tile
  /** 褲子 */
  pants: string
  pantsTile: Tile
  boots: string
  bootTile: Tile
  /** 手套（null = 空手，用膚色）*/
  gloves: string | null
  /** 自發光重點色 */
  trim: string
  /** 護具、背包烤漆 */
  gear: string
  pack: Pack
  gun: Gun
  kneePads: boolean
  /** 左手拿長東西（拖把）：走路時左手少擺 */
  steadyL?: boolean
  /** 頭上：頭髮之外的帽子／頭盔（tag hat／helmet）*/
  head: (b: B) => void
  /** 職業道具 */
  extra: (b: B) => void
}

/** 建構中的上下文 */
interface B {
  r: Rig
  k: Kit
  hip: THREE.Group
  look: ClassLook
  seed: number
  /** 依 seed＋職業的固定亂數（0..1）*/
  rnd: (i: number) => number
  skin: string
  hair: string
}

function hash(a: number, b: number, c: number): number {
  let h = Math.imul(a | 0, 374761393) + Math.imul(b | 0, 668265263) + Math.imul(c | 0, 1274126177)
  h = Math.imul(h ^ (h >>> 13), 1103515245)
  return ((h ^ (h >>> 16)) >>> 0) / 4294967296
}

function strHash(s: string): number {
  let h = 7
  for (let i = 0; i < s.length; i++) h = Math.imul(h ^ s.charCodeAt(i), 16777619)
  return h >>> 0
}

/** 明暗微調（同一職業的船員不會完全同色）*/
function tint(hex: string, k: number): string {
  const c = new THREE.Color(hex)
  c.multiplyScalar(k)
  return '#' + c.getHexString()
}

// ───── 共用零件 ─────

/** 長外套下擺：左右兩片各掛在大腿上（跟著腿擺動、走路時像在甩動），前面開襟、後面開衩；內外兩層（看得到內裡）*/
function coatTails(
  b: B,
  len: number,
  flare: number,
  color: string,
  tile: Tile = 'fabric',
  hem?: string,
): void {
  const k = b.k
  const gap = 0.75
  const slit = 0.22
  const top = 0.186
  for (const side of [-1, 1]) {
    const leg = side < 0 ? b.r.legL : b.r.legR
    const ps = side > 0 ? gap / 2 : Math.PI + slit / 2
    const pl = Math.PI - gap / 2 - slit / 2
    const out: [number, number][] = [
      [top + flare, -len],
      [top + flare * 0.45, -len * 0.55],
      [top, 0.02],
    ]
    const inn = out.map(([r, y]) => [r - 0.008, y] as [number, number]).reverse()
    const at: V3 = [-side * THIGH_X, 0, 0]
    k.add(leg, lathe(out, k.seg(7), 1, 0.8, ps, pl), { tile, color, at, tag: 'coat' })
    k.add(leg, lathe(inn, k.seg(7), 1, 0.8, ps, pl), { tile, color: tint(color, 0.7), at, tag: 'coat' })
    if (hem)
      k.add(
        leg,
        lathe(
          [
            [top + flare + 0.003, -len + 0.005],
            [top + flare + 0.003, -len + 0.035],
          ],
          k.seg(7),
          1,
          0.8,
          ps,
          pl,
        ),
        { tile: 'canvas', color: hem, at, tag: 'coat', small: true },
      )
  }
  // 腰部到髖關節：蓋住骨盆
  k.add(
    b.hip,
    lathe(
      [
        [top + 0.002, -0.06],
        [0.18, 0.05],
        [0.172, 0.13],
      ],
      k.seg(10),
      1,
      0.8,
    ),
    { tile, color, tag: 'coat' },
  )
}

/** 帶狀護圈（袖口、反光條、臂章）：繞著肢段的一圈 */
export function band(
  k: Kit,
  node: THREE.Object3D,
  r: number,
  y0: number,
  y1: number,
  color: string,
  tile: Tile = 'canvas',
  o: PartOpts = {},
  sz = 1,
): void {
  k.add(
    node,
    lathe(
      [
        [r - 0.004, y0],
        [r, (y0 + y1) / 2],
        [r - 0.004, y1],
      ],
      k.seg(sz === 1 ? 8 : 12),
      1,
      sz,
    ),
    { tile, color, ...o },
  )
}

/** 紅十字（兩塊交叉的薄板）*/
function cross(k: Kit, node: THREE.Object3D, at: V3, size: number, rot: V3 = [0, 0, 0], tag?: string): void {
  const t = size * 0.32
  const o = { tile: 'paint' as Tile, color: '#e03030', at, rot, tag }
  k.add(node, blk(size, t, 0.012), o)
  k.add(node, blk(t, size, 0.012), o)
}

/** 頭髮：seed 決定髮型（短髮、油頭、包頭、平頭、馬尾、光頭＋鬍子）*/
function hairStyle(b: B, style: number, under = false): void {
  const k = b.k
  const h = b.r.head
  const o: PartOpts = { tile: 'hair', color: b.hair, tag: 'hair' }
  // 戴帽子：頭髮貼頭皮，不建會穿出帽子的油頭與包頭
  if (under && (style === 1 || style === 2)) style = 3
  const cap = (grow: number) =>
    lathe(
      [
        [0.119 + grow, 0.0],
        [0.128 + grow, 0.04],
        [0.124 + grow, 0.085],
        [0.106 + grow, 0.122],
        [0.07 + grow * 0.5, 0.152],
        [0, 0.166 + grow],
      ],
      k.seg(12),
      0.95,
      1.06,
    )
  if (style === 5) {
    // 光頭＋落腮鬍
    k.add(
      h,
      lathe(
        [
          [0.05, -0.154],
          [0.094, -0.128],
          [0.117, -0.08],
          [0.121, -0.05],
        ],
        k.seg(10),
        0.95,
        1.08,
        -1.05,
        2.1,
      ),
      { ...o, at: [0, 0, 0.004] },
    )
    return
  }
  k.add(h, cap(under ? -0.008 : style === 3 ? -0.004 : 0.004), {
    ...o,
    at: [0, 0.012, -0.01],
    rot: [-0.3, 0, 0],
  })
  if (style === 1) k.add(h, cbox(0.13, 0.05, 0.1, 0.02), { ...o, at: [0, 0.135, 0.05], rot: [-0.35, 0, 0] })
  if (style === 2) k.add(h, ball(0.048, 8, 6), { ...o, at: [0, 0.09, -0.13] })
  if (style === 4) k.add(h, cbox(0.05, 0.14, 0.04, 0.015), { ...o, at: [0, -0.04, -0.13], rot: [0.35, 0, 0] })
}

/** 頭盔：外殼（略往後傾，前緣在額頭上）＋護目鏡片＋發光目鏡 */
function helmet(
  b: B,
  color: string,
  visor: string,
  glowCol: string,
  opts: { brim?: boolean; ear?: boolean; big?: boolean } = {},
): void {
  const k = b.k
  const h = b.r.head
  const g = opts.big ? 0.012 : 0
  k.add(
    h,
    lathe(
      [
        [0.152 + g, -0.035],
        [0.162 + g, 0.0],
        [0.165 + g, 0.06],
        [0.148 + g, 0.115],
        [0.108 + g, 0.158],
        [0.055, 0.182 + g],
        [0, 0.188 + g],
      ],
      k.seg(12),
      0.96,
      1.05,
    ),
    { tile: 'paint', color, at: [0, 0.01, -0.006], rot: [-0.16, 0, 0], tag: 'helmet' },
  )
  // 面罩：前方一片弧形玻璃，蓋住眼睛
  const vh = opts.big ? 0.12 : 0.075
  k.add(
    h,
    lathe(
      [
        [0.156 + g, -vh * 0.6],
        [0.162 + g, -vh * 0.1],
        [0.158 + g, vh * 0.4],
      ],
      k.seg(10),
      0.96,
      1.04,
      -1.15,
      2.3,
    ),
    { tile: 'glass', color: visor, at: [0, 0.004, 0.006], tag: 'helmet' },
  )
  // 發光目鏡（透過面罩看得到的兩點）
  for (const s of [-1, 1])
    k.add(h, blk(0.05, 0.018, 0.012), {
      slot: 'glow',
      color: glowCol,
      glow: 2,
      at: [s * 0.046, 0.006, 0.166 + g],
      rot: [0, s * 0.3, 0],
      tag: 'helmet',
    })
  if (opts.brim)
    k.add(h, cbox(0.24, 0.018, 0.08, 0.008), {
      tile: 'paint',
      color,
      at: [0, 0.055, 0.14],
      rot: [0.25, 0, 0],
      tag: 'helmet',
      wear: 0.8,
    })
  if (opts.ear)
    for (const s of [-1, 1])
      k.add(h, cbox(0.04, 0.075, 0.07, 0.014), {
        tile: 'paint',
        color: tint(color, 0.75),
        at: [s * 0.16, -0.01, -0.005],
        tag: 'helmet',
        wear: 1,
        small: true,
      })
  // seed 細節：天線、側燈
  const d = Math.floor(b.rnd(7) * 3)
  if (d === 0)
    k.add(h, tube(0.005, 0.007, 0.16, 5), {
      tile: 'metal',
      color: '#9aa2aa',
      at: [-0.12, 0.17, -0.06],
      rot: [-0.3, 0, 0.25],
      tag: 'helmet',
      small: true,
    })
  if (d === 1) {
    k.add(h, cbox(0.035, 0.03, 0.05, 0.008), {
      tile: 'metal',
      color: '#4a4f55',
      at: [0.155, 0.04, 0.04],
      tag: 'helmet',
      small: true,
    })
    k.add(h, blk(0.024, 0.02, 0.01), {
      slot: 'glow',
      color: '#fff2c8',
      glow: 2.2,
      at: [0.157, 0.04, 0.067],
      tag: 'helmet',
      small: true,
    })
  }
}

/** 帽子（大盤帽、鴨舌帽）：帽身 lathe＋帽簷 */
function peakedCap(
  b: B,
  crown: string,
  bandCol: string,
  opts: { tall?: boolean; badge?: string } = {},
): void {
  const k = b.k
  const h = b.r.head
  const t = opts.tall ? 0.03 : 0
  k.add(
    h,
    lathe(
      [
        [0.128, 0.05],
        [0.132, 0.1],
        [0.15 + t, 0.15 + t],
        [0.158 + t, 0.17 + t],
        [0.12, 0.185 + t],
        [0, 0.19 + t],
      ],
      k.seg(12),
      1,
      1.06,
    ),
    { tile: 'fabric', color: crown, at: [0, 0, -0.005], rot: [-0.08, 0, 0], tag: 'hat' },
  )
  band(k, h, 0.135, 0.05, 0.095, bandCol, 'fabric', { tag: 'hat', at: [0, 0, -0.002] })
  // 帽簷
  k.add(
    h,
    lathe(
      [
        [0.13, 0.0],
        [0.16, -0.008],
        [0.165, -0.002],
        [0.13, 0.008],
      ],
      k.seg(10),
      1,
      1.2,
      -1.1,
      2.2,
    ),
    { tile: 'leather', color: '#101114', at: [0, 0.06, 0.02], rot: [0.18, 0, 0], tag: 'hat' },
  )
  if (opts.badge)
    k.add(h, cbox(0.045, 0.04, 0.012, 0.006), {
      tile: 'metal',
      color: opts.badge,
      at: [0, 0.115 + t * 0.5, 0.148],
      rot: [-0.25, 0, 0],
      tag: 'hat',
      wear: 1,
    })
}

// ───── 身體 ─────

function legs(b: B): void {
  const k = b.k
  const L = b.look
  for (const side of [-1, 1]) {
    const thigh = side < 0 ? b.r.legL : b.r.legR
    const knee = side < 0 ? b.r.shinL : b.r.shinR
    k.add(
      thigh,
      lathe(
        [
          [0.066, -0.44],
          [0.08, -0.34],
          [0.098, -0.16],
          [0.097, -0.01],
          [0.07, 0.06],
          [0.025, 0.09],
        ],
        k.seg(8),
      ),
      { tile: L.pantsTile, color: L.pants, tag: 'legs' },
    )
    // 側口袋
    k.add(thigh, cbox(0.035, 0.11, 0.1, 0.012), {
      tile: L.pantsTile,
      color: tint(L.pants, 0.85),
      at: [side * 0.085, -0.2, 0.005],
      tag: 'pocket',
      small: true,
    })
    k.add(
      knee,
      lathe(
        [
          [0.054, -0.37],
          [0.063, -0.28],
          [0.077, -0.12],
          [0.071, 0.0],
          [0.044, 0.05],
        ],
        k.seg(8),
      ),
      { tile: L.pantsTile, color: L.pants, tag: 'legs' },
    )
    if (L.kneePads)
      k.add(knee, cbox(0.1, 0.11, 0.045, 0.016), {
        tile: 'plate',
        color: L.gear,
        at: [0, -0.02, 0.064],
        rot: [-0.12, 0, 0],
        wear: 1,
        tag: 'kneepad',
      })
    k.add(knee, bootGeo(), {
      tile: L.bootTile,
      color: L.boots,
      at: [0, -0.49, 0.0],
      tag: 'boot',
      // 鞋底較暗、鞋尖磨亮
      shade: (_x, y, z) => (y < 0.028 ? 0.38 : z > 0.11 && y < 0.09 ? 1.18 : 1),
    })
    band(k, knee, 0.069, -0.335, -0.3, tint(L.boots, 0.8), 'rubber', { small: true, tag: 'boot' })
  }
  // 骨盆＋腰帶
  k.add(
    b.hip,
    lathe(
      [
        [0.07, -0.14],
        [0.135, -0.11],
        [0.162, -0.04],
        [0.17, 0.04],
        [0.165, 0.12],
      ],
      k.seg(10),
      1,
      0.74,
    ),
    { tile: L.pantsTile, color: L.pants, tag: 'legs' },
  )
  k.add(
    b.hip,
    lathe(
      [
        [0.168, 0.07],
        [0.174, 0.08],
        [0.174, 0.112],
        [0.168, 0.122],
      ],
      k.seg(12),
      1,
      0.76,
    ),
    { tile: 'leather', color: '#2a2622', tag: 'belt' },
  )
  k.add(b.hip, cbox(0.056, 0.042, 0.016, 0.006), {
    tile: 'metal',
    color: '#b9b4a8',
    at: [0, 0.096, 0.132],
    wear: 1,
    tag: 'belt',
  })
  // seed：腰間小包
  if (b.rnd(3) > 0.4) {
    const s = b.rnd(4) > 0.5 ? 1 : -1
    k.add(b.hip, cbox(0.075, 0.08, 0.05, 0.014), {
      tile: 'canvas',
      color: tint(L.gear, 0.9),
      at: [s * 0.15, 0.04, 0.07],
      rot: [0, s * 0.7, 0],
      tag: 'pouch',
      small: true,
    })
  }
}

/** 肩甲殼：扁的弧形，前後略長（肩甲與防護服共用）*/
export function PAULDRON(k: Kit): THREE.BufferGeometry {
  return lathe(
    [
      [0.116, -0.034],
      [0.127, -0.016],
      [0.114, 0.014],
      [0.082, 0.034],
      [0.042, 0.045],
      [0, 0.048],
    ],
    k.seg(10),
    1,
    1.14,
  )
}

function torso(b: B): void {
  const k = b.k
  const L = b.look
  const t = b.r.torso
  k.add(
    t,
    lathe(
      [
        [0.15, -0.27],
        [0.168, -0.15],
        [0.19, -0.02],
        [0.213, 0.1],
        [0.214, 0.17],
        [0.19, 0.228],
        [0.12, 0.27],
        [0.06, 0.292],
      ],
      k.seg(12),
      1,
      0.68,
    ),
    { tile: L.topTile, color: L.top, tag: 'top' },
  )
  // 脖子
  k.add(
    t,
    lathe(
      [
        [0.052, 0.25],
        [0.05, 0.33],
        [0.047, 0.37],
      ],
      k.seg(8),
    ),
    { tile: 'skin', color: b.skin },
  )
  // 立領
  k.add(
    t,
    lathe(
      [
        [0.084, 0.262],
        [0.092, 0.29],
        [0.09, 0.322],
        [0.082, 0.33],
      ],
      k.seg(10),
      1,
      0.86,
    ),
    { tile: L.topTile, color: tint(L.top, 0.82), tag: 'collar' },
  )
  // 胸前發光線（職業色）
  k.add(
    t,
    lathe(
      [
        [0.2165, 0.092],
        [0.2185, 0.1],
        [0.2165, 0.108],
      ],
      k.seg(10),
      1,
      0.69,
      -0.95,
      1.9,
    ),
    { slot: 'glow', color: L.trim, glow: 1.5, tag: 'trim' },
  )
  // 肩甲（玩家色）：預設距離下最重要的辨識——從上方看是兩塊明顯的色塊。扁的弧形殼＋下面一圈深色襯墊
  for (const s of [-1, 1]) {
    k.add(t, PAULDRON(k), {
      slot: 'pc',
      at: [s * 0.29, 0.222, 0],
      rot: [0, 0, -s * 0.36],
      tag: 'pauldron',
      wear: 0.6,
    })
    k.add(
      t,
      lathe(
        [
          [0.112, -0.048],
          [0.118, -0.034],
          [0.116, -0.026],
        ],
        k.seg(10),
        1,
        1.12,
      ),
      {
        tile: 'rubber',
        color: '#1d2024',
        at: [s * 0.29, 0.222, 0],
        rot: [0, 0, -s * 0.36],
        tag: 'pauldron',
        small: true,
      },
    )
  }
  // 手電筒掛點
  b.r.lamp.position.set(0, 0.25, 0.25)
}

function arms(b: B): void {
  const k = b.k
  const L = b.look
  for (const side of [-1, 1]) {
    const sh = side < 0 ? b.r.armL : b.r.armR
    const el = side < 0 ? b.r.foreL : b.r.foreR
    k.add(
      sh,
      lathe(
        [
          [0.062, -0.33],
          [0.075, -0.22],
          [0.09, -0.07],
          [0.085, 0.0],
          [0.052, 0.036],
          [0, 0.046],
        ],
        k.seg(8),
      ),
      { tile: L.topTile, color: L.top, tag: 'top' },
    )
    k.add(
      el,
      lathe(
        [
          [0.05, -0.25],
          [0.06, -0.18],
          [0.071, -0.07],
          [0.062, 0.015],
          [0, 0.045],
        ],
        k.seg(8),
      ),
      { tile: L.topTile, color: L.top, tag: 'top' },
    )
    const glove = L.gloves ?? b.skin
    // 袖口／手套口
    band(
      k,
      el,
      0.064,
      -0.255,
      -0.2,
      L.gloves ? tint(L.gloves, 0.85) : tint(L.top, 0.8),
      L.gloves ? 'rubber' : L.topTile,
      { tag: 'cuff' },
    )
    k.add(el, handGeo(side), {
      tile: L.gloves ? 'rubber' : 'skin',
      color: glove,
      at: [0, HAND_Y, 0],
      tag: 'hand',
    })
  }
}

function head(b: B): void {
  const k = b.k
  const h = b.r.head
  k.add(
    h,
    lathe(
      [
        [0, -0.146],
        [0.07, -0.13],
        [0.11, -0.07],
        [0.125, 0.0],
        [0.118, 0.075],
        [0.082, 0.132],
        [0, 0.156],
      ],
      k.seg(12),
      0.92,
      1.04,
    ),
    { tile: 'skin', color: b.skin, tag: 'skull' },
  )
  // 五官：鼻、眼、眉、耳（低畫質省略眉與耳）
  k.add(h, cbox(0.028, 0.042, 0.03, 0.008), {
    tile: 'skin',
    color: tint(b.skin, 0.95),
    at: [0, -0.02, 0.122],
    rot: [0.25, 0, 0],
    tag: 'face',
  })
  for (const s of [-1, 1]) {
    k.add(h, blk(0.026, 0.017, 0.016), {
      tile: 'skin',
      color: '#17181c',
      at: [s * 0.042, 0.012, 0.118],
      rot: [0, s * 0.3, 0],
      tag: 'face',
    })
    k.add(h, blk(0.036, 0.011, 0.016), {
      tile: 'hair',
      color: b.hair,
      at: [s * 0.043, 0.036, 0.117],
      rot: [0, s * 0.3, -s * 0.12],
      tag: 'face',
      small: true,
    })
    k.add(h, blk(0.018, 0.045, 0.032), {
      tile: 'skin',
      color: tint(b.skin, 0.92),
      at: [s * 0.113, -0.005, 0.0],
      tag: 'face',
      small: true,
    })
  }
}

/** 背包（維生包）：玩家色的頂條從後上方看得到 */
function pack(b: B): void {
  const k = b.k
  const t = b.r.torso
  const L = b.look
  const o: PartOpts = { tag: 'pack' }
  switch (L.pack) {
    case 'none':
      return
    case 'medic': {
      k.add(t, cbox(0.32, 0.34, 0.15, 0.04), {
        ...o,
        tile: 'paint',
        color: '#e8ecee',
        at: [0, 0.03, -0.215],
        wear: 1,
      })
      cross(k, t, [0, 0.05, -0.292], 0.16, [0, 0, 0], 'pack')
      // 頂面也有十字：從俯視角就看得到
      cross(k, t, [0, 0.202, -0.215], 0.12, [-Math.PI / 2, 0, 0], 'pack')
      k.add(t, blk(0.2, 0.02, 0.01), { ...o, slot: 'glow', color: L.trim, glow: 1.4, at: [0, -0.1, -0.292] })
      break
    }
    case 'tank': {
      // 清潔工的噴霧藥劑桶＋軟管
      k.add(
        t,
        lathe(
          [
            [0.0, -0.17],
            [0.1, -0.16],
            [0.115, -0.1],
            [0.115, 0.1],
            [0.09, 0.16],
            [0.03, 0.18],
            [0.0, 0.18],
          ],
          k.seg(10),
        ),
        { ...o, tile: 'paint', color: '#d6b32e', at: [0, 0.02, -0.24] },
      )
      k.add(t, tube(0.03, 0.03, 0.04, 8), { ...o, tile: 'metal', color: '#8a8a80', at: [0, 0.22, -0.24] })
      band(k, t, 0.118, -0.02, 0.02, '#e8c020', 'hazard', { ...o, at: [0, 0.02, -0.24], small: true })
      k.add(
        t,
        hose(
          [
            [0.09, -0.12, -0.26],
            [0.2, -0.2, -0.18],
            [0.24, -0.3, 0.0],
          ],
          0.014,
          8,
          4,
        ),
        { ...o, tile: 'rubber', color: '#2a2a2a', small: true },
      )
      break
    }
    case 'chute': {
      // 飛官的降落傘包：圓角絎縫包＋胸前背帶
      k.add(t, cbox(0.34, 0.36, 0.13, 0.055), { ...o, tile: 'quilt', color: '#6e6a52', at: [0, 0.0, -0.21] })
      for (const s of [-1, 1])
        k.add(t, cbox(0.04, 0.5, 0.02, 0.008), {
          ...o,
          tile: 'canvas',
          color: '#2f3138',
          at: [s * 0.09, 0.0, 0.146],
          rot: [0.05, 0, s * 0.15],
        })
      k.add(t, cbox(0.06, 0.06, 0.02, 0.008), {
        ...o,
        tile: 'metal',
        color: '#c8c8c0',
        at: [0, -0.03, 0.152],
        wear: 1,
        small: true,
      })
      break
    }
    default: {
      // 標準維生包（研究員、保全、工程師、下士）；seed 決定側邊氣瓶／捲墊／天線
      k.add(t, cbox(0.3, 0.34, 0.12, 0.035), {
        ...o,
        tile: 'plate',
        color: L.gear,
        at: [0, 0.03, -0.205],
        wear: 1,
      })
      k.add(t, blk(0.18, 0.024, 0.01), {
        ...o,
        slot: 'glow',
        color: L.trim,
        glow: 1.5,
        at: [0, 0.13, -0.267],
      })
      const d = Math.floor(b.rnd(11) * 4)
      if (d === 0 || L.pack === 'tool') {
        k.add(t, tube(0.04, 0.04, 0.26, 8), {
          ...o,
          tile: 'paint',
          color: '#c8ccd0',
          at: [0.16, 0.02, -0.21],
          small: true,
        })
        k.add(t, ball(0.04, 8, 4), {
          ...o,
          tile: 'paint',
          color: '#c8ccd0',
          at: [0.16, 0.15, -0.21],
          small: true,
        })
      }
      if (d === 1 || L.pack === 'radio')
        k.add(t, tube(0.006, 0.008, 0.34, 5), {
          ...o,
          tile: 'metal',
          color: '#7a8088',
          at: [-0.11, 0.33, -0.22],
          rot: [-0.15, 0, 0.08],
          small: true,
        })
      if (d === 2)
        k.add(t, tube(0.055, 0.055, 0.3, 9), {
          ...o,
          tile: 'canvas',
          color: '#5a5a4a',
          at: [0, 0.24, -0.2],
          rot: [0, 0, Math.PI / 2],
          small: true,
        })
      if (L.pack === 'tool')
        k.add(t, ring(0.07, 0.016, 4, 12), {
          ...o,
          tile: 'rubber',
          color: '#2a2a2a',
          at: [-0.04, 0.04, -0.272],
          small: true,
        })
    }
  }
  // 背包頂條（玩家色）：從後上方辨識
  if (L.pack !== 'tank')
    k.add(t, cbox(0.24, 0.026, 0.07, 0.01), {
      ...o,
      slot: 'pc',
      at: [0, L.pack === 'chute' ? 0.185 : 0.205, -0.21],
      wear: 0.6,
    })
}

function gun(b: B): void {
  const k = b.k
  const f = b.r.foreR
  const o: PartOpts = { frame: GUN_FRAME, tag: 'gun' }
  const dark = '#2b2f35'
  let mz = 0.17
  switch (b.look.gun) {
    case 'rifle':
      k.add(f, cbox(0.05, 0.08, 0.32, 0.012), {
        ...o,
        tile: 'paint',
        color: '#3a4030',
        at: [0, 0.03, 0.09],
        wear: 1,
      })
      k.add(f, tube(0.012, 0.012, 0.16, 6), {
        ...o,
        tile: 'metal',
        color: dark,
        at: [0, 0.045, 0.32],
        rot: [Math.PI / 2, 0, 0],
      })
      k.add(f, cbox(0.04, 0.075, 0.15, 0.012), {
        ...o,
        tile: 'paint',
        color: '#3a4030',
        at: [0, 0.0, -0.13],
        wear: 1,
      })
      k.add(f, cbox(0.03, 0.11, 0.05, 0.008), {
        ...o,
        tile: 'metal',
        color: dark,
        at: [0, -0.06, 0.12],
        rot: [0.25, 0, 0],
      })
      k.add(f, tube(0.018, 0.018, 0.12, 6), {
        ...o,
        tile: 'metal',
        color: '#202326',
        at: [0, 0.09, 0.08],
        rot: [Math.PI / 2, 0, 0],
        small: true,
      })
      k.add(f, blk(0.012, 0.012, 0.01), {
        ...o,
        slot: 'glow',
        color: b.look.trim,
        glow: 2,
        at: [0, 0.09, 0.145],
        small: true,
      })
      mz = 0.41
      break
    case 'revolver':
      k.add(f, cbox(0.03, 0.035, 0.22, 0.008), { ...o, tile: 'metal', color: '#3a3d42', at: [0, 0.04, 0.13] })
      k.add(f, tube(0.03, 0.03, 0.055, 8), {
        ...o,
        tile: 'metal',
        color: '#4a4d52',
        at: [0, 0.03, 0.01],
        rot: [Math.PI / 2, 0, 0],
      })
      k.add(f, cbox(0.032, 0.09, 0.045, 0.01), {
        ...o,
        tile: 'leather',
        color: '#3a2418',
        at: [0, -0.03, -0.03],
        rot: [0.35, 0, 0],
      })
      k.add(f, blk(0.008, 0.01, 0.16), {
        ...o,
        slot: 'glow',
        color: '#ff4a3a',
        glow: 2,
        at: [0, 0.062, 0.13],
      })
      mz = 0.25
      break
    case 'smg':
      k.add(f, cbox(0.05, 0.08, 0.24, 0.012), {
        ...o,
        tile: 'paint',
        color: '#30363e',
        at: [0, 0.03, 0.07],
        wear: 1,
      })
      k.add(f, cbox(0.03, 0.12, 0.04, 0.008), {
        ...o,
        tile: 'metal',
        color: dark,
        at: [0, -0.05, 0.03],
        rot: [0.15, 0, 0],
      })
      k.add(f, blk(0.012, 0.012, 0.01), {
        ...o,
        slot: 'glow',
        color: b.look.trim,
        glow: 2,
        at: [0, 0.075, 0.05],
      })
      mz = 0.21
      break
    default:
      k.add(f, cbox(0.042, 0.07, 0.18, 0.01), {
        ...o,
        tile: 'paint',
        color: '#34383e',
        at: [0, 0.03, 0.065],
        wear: 1,
      })
      k.add(f, cbox(0.034, 0.085, 0.042, 0.008), {
        ...o,
        tile: 'rubber',
        color: '#1e2024',
        at: [0, -0.03, -0.005],
        rot: [0.3, 0, 0],
      })
      k.add(f, blk(0.01, 0.01, 0.06), {
        ...o,
        slot: 'glow',
        color: b.look.trim,
        glow: 1.8,
        at: [0, 0.067, 0.07],
        small: true,
      })
  }
  b.r.muzzle.position.copy(gunPoint(mz, 0.03))
}

// ───── 職業外觀 ─────

/** 左手拿的東西：放在手心前方 */
const IN_HAND_L: V3 = [0, HAND_Y - 0.04, 0.02]

const LOOKS: Record<string, ClassLook> = {
  researcher: {
    top: '#dde3e6',
    topTile: 'fabric',
    pants: '#3a4250',
    pantsTile: 'canvas',
    boots: '#2a2c30',
    bootTile: 'leather',
    gloves: '#a9cbe0',
    trim: '#33ffd1',
    gear: '#5d6873',
    pack: 'std',
    gun: 'pistol',
    kneePads: false,
    head: (b) => {
      hairStyle(b, Math.floor(b.rnd(1) * 6))
      // AR 眼鏡：一條發光細帶（職業色）
      const k = b.k
      k.add(
        b.r.head,
        lathe(
          [
            [0.126, 0.002],
            [0.128, 0.012],
            [0.126, 0.022],
          ],
          k.seg(8),
          0.93,
          1.05,
          -0.75,
          1.5,
        ),
        { slot: 'glow', color: '#33ffd1', glow: 1.6, tag: 'glasses' },
      )
    },
    extra: (b) => {
      const k = b.k
      // 長白袍（到膝）＋袍上的口袋、識別證
      coatTails(b, 0.4, 0.04, '#e8edf0', 'fabric', '#33b8a8')
      k.add(b.r.torso, cbox(0.07, 0.08, 0.02, 0.008), {
        tile: 'fabric',
        color: '#cfd6da',
        at: [0.11, 0.06, 0.138],
        rot: [0, 0.4, 0],
        small: true,
      })
      k.add(b.r.torso, blk(0.045, 0.06, 0.008), {
        slot: 'glow',
        color: '#9fe7ff',
        glow: 1.2,
        at: [-0.11, 0.05, 0.142],
        rot: [0, -0.4, 0],
      })
      // 平板（左手）
      k.add(b.r.foreL, cbox(0.02, 0.2, 0.14, 0.008), {
        tile: 'paint',
        color: '#2a3036',
        at: IN_HAND_L,
        rot: [0.2, 0, 0],
        tag: 'prop',
      })
      k.add(b.r.foreL, blk(0.006, 0.17, 0.115), {
        slot: 'glow',
        color: '#33ffd1',
        glow: 1.1,
        at: [-0.012, IN_HAND_L[1], IN_HAND_L[2]],
        rot: [0.2, 0, 0],
        tag: 'prop',
      })
    },
  },
  security: {
    top: '#2b394c',
    topTile: 'canvas',
    pants: '#26303c',
    pantsTile: 'canvas',
    boots: '#1c1e22',
    bootTile: 'leather',
    gloves: '#22262b',
    trim: '#9fe7ff',
    gear: '#3d4a5a',
    pack: 'radio',
    gun: 'smg',
    kneePads: true,
    head: (b) => helmet(b, '#33404f', '#1c2630', '#9fe7ff', { ear: true }),
    extra: (b) => {
      const k = b.k
      const t = b.r.torso
      // 防彈背心：比軀幹大一圈的硬殼＋背後模板字
      k.add(
        t,
        lathe(
          [
            [0.19, -0.17],
            [0.205, -0.08],
            [0.226, 0.05],
            [0.23, 0.15],
            [0.205, 0.21],
          ],
          k.seg(12),
          1,
          0.72,
        ),
        { tile: 'plate', color: '#3d4a5a', tag: 'vest' },
      )
      k.add(t, cbox(0.22, 0.06, 0.02, 0.006), {
        tile: 'stencil',
        color: '#cfd8e0',
        at: [0, -0.1, -0.165],
        rot: [0, Math.PI, 0],
        tag: 'vest',
        small: true,
      })
      // 警棍（腰側）
      k.add(b.hip, tube(0.016, 0.016, 0.34, 6), {
        tile: 'rubber',
        color: '#1a1a1c',
        at: [-0.17, -0.05, 0.03],
        rot: [0.15, 0, 0.1],
        tag: 'prop',
        small: true,
      })
      // 防暴盾（左前臂）：大片的剪影
      const f = b.r.foreL
      k.add(f, cbox(0.035, 0.46, 0.3, 0.02), {
        tile: 'plate',
        color: '#2c3440',
        at: [-0.07, -0.16, 0.03],
        rot: [0, 0, 0.04],
        wear: 1,
        tag: 'prop',
      })
      k.add(f, blk(0.012, 0.32, 0.03), {
        slot: 'glow',
        color: '#9fe7ff',
        glow: 1.4,
        at: [-0.089, -0.16, 0.03],
        tag: 'prop',
      })
      k.add(f, cbox(0.012, 0.08, 0.22, 0.004), {
        tile: 'stencil',
        color: '#dfe6ee',
        at: [-0.089, -0.04, 0.03],
        rot: [0, -Math.PI / 2, 0],
        tag: 'prop',
        small: true,
      })
    },
  },
  medic: {
    top: '#eef2f3',
    topTile: 'fabric',
    pants: '#4f8f86',
    pantsTile: 'canvas',
    boots: '#c9d0d3',
    bootTile: 'rubber',
    gloves: '#7fb0d8',
    trim: '#5cf2a5',
    gear: '#d8dde0',
    pack: 'medic',
    gun: 'pistol',
    kneePads: false,
    head: (b) => {
      hairStyle(b, Math.floor(b.rnd(1) * 6))
      // 耳掛麥克風
      const k = b.k
      k.add(b.r.head, cbox(0.03, 0.05, 0.04, 0.01), {
        tile: 'paint',
        color: '#e8ecee',
        at: [0.12, -0.01, 0.0],
        tag: 'hat',
        small: true,
      })
      k.add(b.r.head, blk(0.008, 0.008, 0.09), {
        tile: 'metal',
        color: '#8a9096',
        at: [0.115, -0.05, 0.06],
        rot: [0, -0.4, 0],
        tag: 'hat',
        small: true,
      })
      k.add(b.r.head, blk(0.014, 0.014, 0.01), {
        slot: 'glow',
        color: '#5cf2a5',
        glow: 2,
        at: [0.1, -0.06, 0.104],
        tag: 'hat',
        small: true,
      })
    },
    extra: (b) => {
      const k = b.k
      // 短白袍（到大腿中段，綠色滾邊）＋胸前十字＋紅白臂章
      coatTails(b, 0.26, 0.05, '#f2f5f6', 'fabric', '#3fbf86')
      cross(k, b.r.torso, [0, 0.07, 0.15], 0.09)
      band(k, b.r.armL, 0.094, -0.14, -0.07, '#f2f2f2', 'canvas')
      cross(k, b.r.armL, [-0.095, -0.105, 0], 0.05, [0, -Math.PI / 2, 0])
      // 急救箱（左手）
      const f = b.r.foreL
      k.add(f, cbox(0.1, 0.16, 0.2, 0.025), {
        tile: 'paint',
        color: '#eef0f0',
        at: [0, IN_HAND_L[1] - 0.08, 0.02],
        wear: 1,
        tag: 'prop',
      })
      cross(k, f, [-0.052, IN_HAND_L[1] - 0.08, 0.02], 0.08, [0, -Math.PI / 2, 0], 'prop')
      k.add(f, cbox(0.03, 0.03, 0.09, 0.008), {
        tile: 'rubber',
        color: '#30363c',
        at: [0, IN_HAND_L[1] + 0.01, 0.02],
        tag: 'prop',
        small: true,
      })
    },
  },
  captain: {
    top: '#1e2938',
    topTile: 'fabric',
    pants: '#1b2431',
    pantsTile: 'fabric',
    boots: '#141518',
    bootTile: 'leather',
    gloves: '#e4e2dc',
    trim: '#ffc23d',
    gear: '#2a3442',
    pack: 'none',
    gun: 'pistol',
    kneePads: false,
    head: (b) => {
      hairStyle(b, [0, 3, 5][Math.floor(b.rnd(1) * 3)], true)
      // 白頂大盤帽（俯視一眼認得出艦長）＋金色帽徽
      peakedCap(b, '#ecebe4', '#1a2230', { badge: '#e0b040' })
    },
    extra: (b) => {
      const k = b.k
      const t = b.r.torso
      // 長大衣（到膝）＋雙排金扣、金色袖章、衣領金邊
      coatTails(b, 0.42, 0.05, '#1e2938', 'fabric', '#c9a03a')
      for (const s of [-1, 1])
        for (let i = 0; i < 3; i++)
          k.add(t, blk(0.02, 0.02, 0.012), {
            tile: 'metal',
            color: '#e0b040',
            at: [s * 0.06, 0.1 - i * 0.09, 0.148 - i * 0.006],
            small: true,
          })
      for (const f of [b.r.foreL, b.r.foreR]) {
        band(k, f, 0.07, -0.175, -0.155, '#d8a838', 'metal')
        band(k, f, 0.072, -0.145, -0.135, '#d8a838', 'metal', { small: true })
      }
      band(k, t, 0.094, 0.31, 0.33, '#d8a838', 'metal', { small: true, at: [0, 0, 0.002] }, 0.87)
      // 胸前勳表
      k.add(t, blk(0.07, 0.03, 0.008), {
        tile: 'stencil',
        color: '#c8463a',
        at: [-0.1, 0.13, 0.147],
        rot: [0, -0.35, 0],
        small: true,
      })
    },
  },
  janitor: {
    top: '#5a6638',
    topTile: 'canvas',
    pants: '#525c34',
    pantsTile: 'canvas',
    boots: '#c9a227',
    bootTile: 'rubber',
    gloves: '#d8b43a',
    trim: '#ffc23d',
    gear: '#4a4a3a',
    pack: 'tank',
    gun: 'pistol',
    kneePads: true,
    steadyL: true,
    head: (b) => {
      hairStyle(b, Math.floor(b.rnd(1) * 6), true)
      // 毛線帽
      const k = b.k
      k.add(
        b.r.head,
        lathe(
          [
            [0.13, 0.03],
            [0.134, 0.07],
            [0.124, 0.12],
            [0.09, 0.16],
            [0.04, 0.178],
            [0, 0.18],
          ],
          k.seg(11),
          0.97,
          1.06,
        ),
        { tile: 'knit', color: '#a8432f', at: [0, 0.01, -0.01], rot: [-0.25, 0, 0], tag: 'hat' },
      )
      band(k, b.r.head, 0.135, 0.02, 0.06, '#8a3626', 'knit', {
        tag: 'hat',
        at: [0, 0.01, -0.01],
        rot: [-0.25, 0, 0],
      })
    },
    extra: (b) => {
      const k = b.k
      // 反光條（手臂、小腿）
      for (const f of [b.r.foreL, b.r.foreR]) band(k, f, 0.075, -0.09, -0.06, '#e8f05a', 'canvas')
      for (const s of [b.r.shinL, b.r.shinR]) band(k, s, 0.081, -0.17, -0.13, '#e8f05a', 'canvas')
      // 拖把（左手）：長桿＋拖把頭貼地
      const f = b.r.foreL
      k.add(f, tube(0.014, 0.014, 1.3, 6), {
        tile: 'metal',
        color: '#9a9a8a',
        at: [0, -0.45, 0.05],
        rot: [0.06, 0, 0],
        tag: 'prop',
      })
      k.add(f, cbox(0.07, 0.06, 0.26, 0.02), {
        tile: 'knit',
        color: '#c8c2b0',
        at: [0, -1.12, 0.09],
        rot: [0.06, 0, 0],
        tag: 'prop',
      })
      k.add(f, cbox(0.05, 0.03, 0.2, 0.008), {
        tile: 'paint',
        color: '#3a6ab0',
        at: [0, -1.075, 0.088],
        rot: [0.06, 0, 0],
        tag: 'prop',
        small: true,
      })
    },
  },
  ceo: {
    top: '#26262c',
    topTile: 'fabric',
    pants: '#232328',
    pantsTile: 'fabric',
    boots: '#121214',
    bootTile: 'leather',
    gloves: null,
    trim: '#e6e6e6',
    gear: '#3a3a40',
    pack: 'none',
    gun: 'pistol',
    kneePads: false,
    head: (b) => {
      // 油頭
      hairStyle(b, [1, 0, 1][Math.floor(b.rnd(1) * 3)])
      b.k.add(b.r.head, blk(0.012, 0.03, 0.02), {
        slot: 'glow',
        color: '#9fe7ff',
        glow: 1.6,
        at: [-0.12, -0.02, 0.01],
        tag: 'hat',
        small: true,
      })
    },
    extra: (b) => {
      const k = b.k
      const t = b.r.torso
      // 西裝外套下擺（到臀下）＋白襯衫 V 領＋紅領帶＋口袋巾
      coatTails(b, 0.16, 0.02, '#26262c', 'fabric')
      k.add(
        t,
        lathe(
          [
            [0.11, -0.05],
            [0.16, 0.12],
            [0.1, 0.25],
          ],
          k.seg(6),
          1,
          0.7,
          -0.4,
          0.8,
        ),
        { tile: 'fabric', color: '#eceef0', at: [0, 0, 0.042] },
      )
      k.add(t, cbox(0.04, 0.2, 0.012, 0.004), {
        tile: 'fabric',
        color: '#a82a2a',
        at: [0, 0.12, 0.152],
        rot: [-0.18, 0, 0],
      })
      k.add(t, cbox(0.035, 0.035, 0.014, 0.004), {
        tile: 'fabric',
        color: '#8a1e1e',
        at: [0, 0.225, 0.13],
        rot: [-0.3, 0, 0],
        small: true,
      })
      k.add(t, blk(0.04, 0.025, 0.01), {
        tile: 'fabric',
        color: '#d8c070',
        at: [0.12, 0.12, 0.136],
        rot: [0, 0.45, 0],
        small: true,
      })
      // 公事包（左手）
      const f = b.r.foreL
      k.add(f, cbox(0.07, 0.24, 0.32, 0.02), {
        tile: 'leather',
        color: '#4a2e1c',
        at: [0, IN_HAND_L[1] - 0.12, 0.02],
        wear: 1,
        tag: 'prop',
      })
      k.add(f, cbox(0.074, 0.03, 0.06, 0.006), {
        tile: 'metal',
        color: '#d0b060',
        at: [0, IN_HAND_L[1] - 0.02, 0.02],
        tag: 'prop',
        small: true,
      })
    },
  },
  commissar: {
    top: '#18181c',
    topTile: 'leather',
    pants: '#161619',
    pantsTile: 'fabric',
    boots: '#0f0f11',
    bootTile: 'leather',
    gloves: '#141416',
    trim: '#c8323c',
    gear: '#202024',
    pack: 'none',
    gun: 'revolver',
    kneePads: false,
    head: (b) => {
      hairStyle(b, [3, 0, 5][Math.floor(b.rnd(1) * 3)], true)
      // 高筒大盤帽（黑帽身、紅帽圈）
      peakedCap(b, '#16161a', '#b02a32', { tall: true, badge: '#c8323c' })
    },
    extra: (b) => {
      const k = b.k
      const t = b.r.torso
      // 長大衣（過膝、下擺外擴）＋斜背帶＋紅臂章＋長筒靴
      coatTails(b, 0.5, 0.08, '#18181c', 'leather', '#7a1a20')
      k.add(
        t,
        hose(
          [
            [-0.17, 0.22, 0.06],
            [-0.06, 0.12, 0.15],
            [0.08, -0.04, 0.142],
            [0.165, -0.2, 0.08],
          ],
          0.014,
          8,
          4,
        ),
        { tile: 'leather', color: '#3a2418' },
      )
      k.add(
        t,
        hose(
          [
            [-0.17, 0.22, -0.06],
            [-0.06, 0.12, -0.15],
            [0.08, -0.04, -0.142],
            [0.165, -0.2, -0.08],
          ],
          0.014,
          8,
          4,
        ),
        { tile: 'leather', color: '#3a2418', small: true },
      )
      band(k, b.r.armL, 0.094, -0.16, -0.08, '#c8323c', 'fabric')
      k.add(b.r.armL, blk(0.012, 0.04, 0.04), {
        tile: 'paint',
        color: '#e8c050',
        at: [-0.095, -0.12, 0],
        small: true,
      })
      for (const s of [b.r.shinL, b.r.shinR]) band(k, s, 0.082, -0.33, -0.04, '#101012', 'leather')
    },
  },
  engineer: {
    // 深灰藍連身工作服＋橘色反光背心（整件橘色在暗處會被看成裸露的皮膚）
    top: '#3e4a58',
    topTile: 'canvas',
    pants: '#384350',
    pantsTile: 'canvas',
    boots: '#3a2a1a',
    bootTile: 'leather',
    gloves: '#6a4a2a',
    trim: '#ffc23d',
    gear: '#4a4f55',
    pack: 'tool',
    gun: 'pistol',
    kneePads: true,
    head: (b) => {
      hairStyle(b, Math.floor(b.rnd(1) * 6), true)
      const k = b.k
      const h = b.r.head
      // 黃色工程帽＋頭燈＋帽上的護目鏡
      k.add(
        h,
        lathe(
          [
            [0.17, 0.028],
            [0.176, 0.04],
            [0.14, 0.05],
            [0.142, 0.1],
            [0.118, 0.15],
            [0.07, 0.18],
            [0, 0.188],
          ],
          k.seg(10),
          0.96,
          1.08,
        ),
        { tile: 'paint', color: '#f0c030', at: [0, 0.012, 0.0], rot: [-0.08, 0, 0], tag: 'hat' },
      )
      k.add(h, cbox(0.03, 0.03, 0.16, 0.01), {
        tile: 'paint',
        color: '#d8a820',
        at: [0, 0.19, 0.0],
        rot: [-0.08, 0, 0],
        tag: 'hat',
        small: true,
      })
      k.add(h, tube(0.022, 0.024, 0.03, 8), {
        tile: 'metal',
        color: '#3a3d40',
        at: [0, 0.095, 0.15],
        rot: [Math.PI / 2 - 0.1, 0, 0],
        tag: 'hat',
      })
      k.add(h, tube(0.018, 0.018, 0.004, 8), {
        slot: 'glow',
        color: '#fff2c8',
        glow: 2.6,
        at: [0, 0.097, 0.166],
        rot: [Math.PI / 2 - 0.1, 0, 0],
        tag: 'hat',
      })
      for (const s of [-1, 1])
        k.add(h, tube(0.026, 0.026, 0.02, 8), {
          slot: 'glow',
          color: '#ffb46b',
          glow: 1.3,
          at: [s * 0.05, 0.075, 0.128],
          rot: [Math.PI / 2 - 0.5, 0, 0],
          tag: 'hat',
        })
      band(k, h, 0.133, 0.06, 0.08, '#2a2a2a', 'rubber', { tag: 'hat', small: true, rot: [-0.25, 0, 0] })
    },
    extra: (b) => {
      const k = b.k
      // 工具腰帶：寬皮帶＋三個工具袋＋槌子、扳手掛在腰側
      k.drop('belt')
      k.add(
        b.hip,
        lathe(
          [
            [0.176, 0.03],
            [0.184, 0.045],
            [0.184, 0.11],
            [0.176, 0.125],
          ],
          k.seg(12),
          1,
          0.78,
        ),
        { tile: 'leather', color: '#5a3a1e', tag: 'belt' },
      )
      for (const [x, ry] of [
        [-0.16, -0.7],
        [0.16, 0.7],
        [0.0, 0],
      ] as const) {
        const z = ry === 0 ? -0.15 : 0.08
        k.add(b.hip, cbox(0.09, 0.1, 0.055, 0.016), {
          tile: 'leather',
          color: '#6a4628',
          at: [x, 0.02, z],
          rot: [0, ry === 0 ? Math.PI : ry, 0],
          wear: 0.7,
          tag: 'belt',
        })
      }
      k.add(b.hip, tube(0.012, 0.012, 0.22, 5), {
        tile: 'leather',
        color: '#7a5030',
        at: [0.2, -0.04, 0.0],
        rot: [0, 0, 0.1],
        tag: 'belt',
        small: true,
      })
      k.add(b.hip, cbox(0.05, 0.035, 0.09, 0.008), {
        tile: 'metal',
        color: '#6a6e72',
        at: [0.205, 0.07, 0.0],
        tag: 'belt',
        small: true,
      })
      // 大管鉗（左手）
      const f = b.r.foreL
      k.add(f, cbox(0.03, 0.5, 0.04, 0.008), {
        tile: 'metal',
        color: '#b04a2a',
        at: [0, HAND_Y - 0.15, 0.04],
        rot: [0.12, 0, 0],
        tag: 'prop',
      })
      k.add(f, cbox(0.04, 0.09, 0.13, 0.012), {
        tile: 'metal',
        color: '#8a8e92',
        at: [0, HAND_Y - 0.4, 0.09],
        rot: [0.12, 0, 0],
        wear: 1,
        tag: 'prop',
      })
      // 橘色反光背心（比軀幹大一圈）＋兩道反光條；俯視時跟黃色工程帽一起是工程師的記號
      k.add(
        b.r.torso,
        lathe(
          [
            [0.176, -0.2],
            [0.198, -0.06],
            [0.222, 0.08],
            [0.224, 0.16],
            [0.196, 0.215],
          ],
          k.seg(12),
          1,
          0.71,
        ),
        { tile: 'canvas', color: '#e0682a', tag: 'vest' },
      )
      band(k, b.r.torso, 0.21, -0.04, -0.005, '#e8f05a', 'canvas', { tag: 'vest' }, 0.72)
      band(k, b.r.torso, 0.229, 0.1, 0.135, '#e8f05a', 'canvas', { tag: 'vest' }, 0.72)
    },
  },
  corporal: {
    top: '#5d6a52',
    topTile: 'camo',
    pants: '#56634e',
    pantsTile: 'camo',
    boots: '#2a2620',
    bootTile: 'leather',
    gloves: '#3a3a30',
    trim: '#9fe7ff',
    gear: '#3f4a3a',
    pack: 'std',
    gun: 'rifle',
    kneePads: true,
    head: (b) => {
      const k = b.k
      helmet(b, '#4b5a46', '#202820', '#9fe7ff', { brim: false })
      // 帽套網＋護目鏡推到盔上
      for (const s of [-1, 1])
        k.add(b.r.head, tube(0.03, 0.03, 0.025, 8), {
          tile: 'glass',
          color: '#3a6070',
          at: [s * 0.05, 0.1, 0.13],
          rot: [Math.PI / 2 - 0.7, 0, 0],
          tag: 'helmet',
          small: true,
        })
      band(k, b.r.head, 0.154, 0.075, 0.095, '#2a2a22', 'rubber', {
        tag: 'helmet',
        rot: [-0.3, 0, 0],
        small: true,
      })
    },
    extra: (b) => {
      const k = b.k
      const t = b.r.torso
      // 彈匣背心：胸前三個彈匣袋＋無線電
      k.add(
        t,
        lathe(
          [
            [0.19, -0.15],
            [0.206, -0.06],
            [0.226, 0.06],
            [0.228, 0.15],
            [0.2, 0.2],
          ],
          k.seg(12),
          1,
          0.72,
        ),
        { tile: 'canvas', color: '#3f4a3a', tag: 'vest' },
      )
      for (let i = 0; i < 3; i++)
        k.add(t, cbox(0.065, 0.1, 0.045, 0.012), {
          tile: 'canvas',
          color: '#46523f',
          at: [(i - 1) * 0.075, -0.04, 0.17],
          wear: 0.6,
          tag: 'vest',
        })
      k.add(t, cbox(0.05, 0.08, 0.035, 0.01), {
        tile: 'paint',
        color: '#2a2e2a',
        at: [-0.13, 0.15, 0.13],
        rot: [0, -0.5, 0],
        tag: 'vest',
        small: true,
      })
      k.add(t, tube(0.004, 0.005, 0.14, 4), {
        tile: 'metal',
        color: '#666',
        at: [-0.15, 0.24, 0.12],
        tag: 'vest',
        small: true,
      })
      // 階級章（臂上兩道 V）
      for (let i = 0; i < 2; i++)
        k.add(b.r.armR, cbox(0.012, 0.016, 0.07, 0.003), {
          tile: 'paint',
          color: '#e8d27a',
          at: [0.091, -0.1 - i * 0.025, 0],
          small: true,
        })
    },
  },
  ace: {
    top: '#6b4a32',
    topTile: 'leather',
    pants: '#46597a',
    pantsTile: 'canvas',
    boots: '#2a2420',
    bootTile: 'leather',
    gloves: '#3a2a20',
    trim: '#ffb46b',
    gear: '#46597a',
    pack: 'chute',
    gun: 'pistol',
    kneePads: false,
    head: (b) => {
      const k = b.k
      // 飛行頭盔：白色外殼＋金色大面罩（整張臉）＋氧氣軟管
      helmet(b, '#d8dde0', '#c8963a', '#ffb46b', { big: true, ear: true })
      k.add(
        b.r.head,
        hose(
          [
            [0.05, -0.1, 0.13],
            [0.12, -0.17, 0.08],
            [0.16, -0.24, -0.02],
          ],
          0.014,
          6,
          4,
        ),
        { tile: 'rubber', color: '#3a3a3a', tag: 'helmet', small: true },
      )
      band(k, b.r.head, 0.17, 0.02, 0.045, '#e0702a', 'paint', {
        tag: 'helmet',
        rot: [-0.16, 0, 0],
        at: [0, 0.01, -0.006],
      })
    },
    extra: (b) => {
      const k = b.k
      const t = b.r.torso
      // 飛行夾克的羊毛大翻領（俯視很明顯）＋白圍巾（尾巴垂在背後）
      k.drop('collar')
      k.add(
        t,
        lathe(
          [
            [0.12, 0.2],
            [0.175, 0.225],
            [0.16, 0.262],
            [0.1, 0.29],
          ],
          k.seg(12),
          1,
          0.82,
        ),
        { tile: 'knit', color: '#e8dcc0', tag: 'collar' },
      )
      k.add(t, ring(0.07, 0.03, 5, 12), {
        tile: 'fabric',
        color: '#f0ece4',
        at: [0, 0.3, 0.01],
        rot: [Math.PI / 2, 0, 0],
      })
      k.add(t, cbox(0.07, 0.24, 0.02, 0.008), {
        tile: 'fabric',
        color: '#f0ece4',
        at: [0.05, 0.16, -0.2],
        rot: [0.25, 0, 0.12],
        small: true,
      })
      // 夾克下擺羅紋
      band(k, t, 0.17, -0.275, -0.22, '#4a3424', 'knit', {}, 0.72)
      // 肩章（飛行隊徽）
      k.add(b.r.armL, cbox(0.012, 0.06, 0.06, 0.005), {
        tile: 'paint',
        color: '#e0702a',
        at: [-0.091, -0.08, 0],
        small: true,
      })
    },
  },
}

/** 建立人物骨架；classId 決定外觀，playerColor 標在肩甲與背包頂條，seed（id 推出）決定膚色、髮型與小配件 */
export function buildHuman(classId: string, playerColor: string, seed = 0): Rig {
  const cls = LOOKS[classId] ? classId : 'researcher'
  const look = LOOKS[cls]
  const lod: 0 | 1 = quality.value === 'low' ? 0 : 1
  const k = new Kit(lod)
  const root = new THREE.Group()
  const body = new THREE.Group()
  root.add(body)
  const g = (parent: THREE.Object3D, x: number, y: number, z: number) => {
    const o = new THREE.Group()
    o.position.set(x, y, z)
    parent.add(o)
    return o
  }
  const hip = g(body, 0, HIP_Y, 0)
  const legL = g(hip, -THIGH_X, -0.04, 0)
  const legR = g(hip, THIGH_X, -0.04, 0)
  const shinL = g(legL, 0, KNEE_Y, 0)
  const shinR = g(legR, 0, KNEE_Y, 0)
  const torsoG = g(hip, 0, TORSO_Y, 0)
  const headG = g(torsoG, 0, 0.42, 0.01)
  // 頭略大（英雄比例，俯視距離下臉與帽子讀得出來）
  headG.scale.setScalar(1.08)
  const armL = g(torsoG, -SHOULDER[0], SHOULDER[1], 0)
  const armR = g(torsoG, SHOULDER[0], SHOULDER[1], 0)
  const foreL = g(armL, 0, ELBOW_Y, 0)
  const foreR = g(armR, 0, ELBOW_Y, 0)
  const muzzle = new THREE.Object3D()
  foreR.add(muzzle)
  const lamp = new THREE.Object3D()
  torsoG.add(lamp)
  const s = Math.abs(seed | 0)
  const rig: Rig = {
    root,
    body,
    torso: torsoG,
    head: headG,
    armL,
    armR,
    foreL,
    foreR,
    legL,
    legR,
    shinL,
    shinR,
    muzzle,
    lamp,
    phase: seed,
    height: 1.85,
    extra: [],
  }
  const ch = strHash(cls)
  const b: B = {
    r: rig,
    k,
    hip,
    look,
    seed: s,
    rnd: (i) => hash(s, ch, i),
    skin: SKINS[s % SKINS.length],
    hair: HAIRS[(s + (ch % 3)) % HAIRS.length],
  }
  // 同職業的船員衣服明暗略有不同（seed）
  const jitter = 0.94 + b.rnd(2) * 0.1
  b.look = { ...look, top: tint(look.top, jitter), pants: tint(look.pants, 2 - jitter) }
  legs(b)
  torso(b)
  arms(b)
  head(b)
  look.head(b)
  pack(b)
  gun(b)
  look.extra(b)
  const key = `${cls}|${s}|${lod}`
  k.finalize(key, playerColor)
  builds.set(rig, {
    kit: k,
    cls,
    seed: s,
    pc: playerColor,
    hip,
    twoHanded: look.gun === 'rifle',
    steadyL: !!look.steadyL,
    key,
  })
  return rig
}

// ───── 動畫 ─────

interface Anim {
  st: number
  /** 進入目前狀態多久（秒）*/
  stT: number
  walk: number
  aim: number
  cast: number
  /** 倒地開始時的姿勢（倒地動畫從這裡插值到最終姿勢；結果只取決於 deadT）*/
  from: number[] | null
}

const anims = new WeakMap<Rig, Anim>()

const POSE_KEYS = [
  'legL.x',
  'legR.x',
  'shinL.x',
  'shinR.x',
  'armL.x',
  'armR.x',
  'armL.z',
  'armR.z',
  'foreL.x',
  'foreR.x',
  'torso.y',
  'torso.x',
  'head.y',
  'head.x',
] as const

function poseOf(r: Rig): number[] {
  return [
    r.legL.rotation.x,
    r.legR.rotation.x,
    r.shinL.rotation.x,
    r.shinR.rotation.x,
    r.armL.rotation.x,
    r.armR.rotation.x,
    r.armL.rotation.z,
    r.armR.rotation.z,
    r.foreL.rotation.x,
    r.foreR.rotation.x,
    r.torso.rotation.y,
    r.torso.rotation.x,
    r.head.rotation.y,
    r.head.rotation.x,
  ]
}

/** 倒地的最終姿勢（同 POSE_KEYS 順序）*/
const DEAD_POSE = [0.12, -0.2, 0.25, 0.4, -1.2, -0.7, -0.45, 0.4, -0.3, -0.5, 0.15, 0, 0.5, -0.1]

function setPose(r: Rig, p: number[]): void {
  r.legL.rotation.x = p[0]
  r.legR.rotation.x = p[1]
  r.shinL.rotation.x = p[2]
  r.shinR.rotation.x = p[3]
  r.armL.rotation.x = p[4]
  r.armR.rotation.x = p[5]
  r.armL.rotation.z = p[6]
  r.armR.rotation.z = p[7]
  r.foreL.rotation.x = p[8]
  r.foreR.rotation.x = p[9]
  r.torso.rotation.y = p[10]
  r.torso.rotation.x = p[11]
  r.head.rotation.y = p[12]
  r.head.rotation.x = p[13]
}

const tmpPose: number[] = new Array(POSE_KEYS.length).fill(0)

/** 程序化動畫：idle 呼吸與重心轉移、走路（骨盆扭轉、手肘擺動、上下起伏）、攻擊（預備動作後舉槍瞄準）、施法、死亡（膝蓋一軟、往後倒、落地回彈）*/
export function animateRig(
  r: Rig,
  dt: number,
  t: number,
  moving: number,
  state: number,
  deadT: number,
): void {
  let a = anims.get(r)
  if (!a) anims.set(r, (a = { st: -1, stT: 0, walk: 0, aim: 0, cast: 0, from: null }))
  if (state !== a.st) {
    if (state === 4) a.from = poseOf(r)
    a.st = state
    a.stT = 0
  } else a.stT += dt
  const hip = r.torso.parent ?? r.body
  if (state === 4) {
    // 死亡：先膝蓋一軟（0.1 s）、再往後倒（約 0.45 s 落地）、落地小回彈；姿勢只取決於 deadT（烘焙屍體時用 deadT = 10 取最終姿勢）
    const k = Math.min(1, deadT * 2.2)
    const e = 1 - (1 - k) * (1 - k)
    const buckle = Math.sin(Math.min(1, deadT * 2.2) * Math.PI)
    const land = deadT > 0.455 && deadT < 0.6 ? Math.sin(((deadT - 0.455) / 0.145) * Math.PI) : 0
    r.body.rotation.x = -e * Math.PI * 0.48 + land * 0.04
    r.body.position.y = e * 0.18 + land * 0.025
    hip.rotation.set(0, 0, 0)
    r.torso.scale.y = 1
    const from = a.from ?? DEAD_POSE.map(() => 0)
    for (let i = 0; i < DEAD_POSE.length; i++) tmpPose[i] = from[i] + (DEAD_POSE[i] - from[i]) * e
    // 膝蓋一軟
    tmpPose[2] += buckle * 0.5
    tmpPose[3] += buckle * 0.6
    tmpPose[0] -= buckle * 0.25
    tmpPose[1] -= buckle * 0.3
    setPose(r, tmpPose)
    r.head.rotation.z = e * 0.3
    return
  }
  r.body.rotation.x = 0
  r.head.rotation.z = 0
  const ex = (rate: number) => 1 - Math.exp(-dt * rate)
  const moveOn = moving > 0.05 ? 1 : 0
  a.walk += (moveOn - a.walk) * ex(7)
  a.aim += ((state === 2 ? 1 : 0) - a.aim) * ex(state === 2 ? 16 : 7)
  a.cast += ((state === 3 || state === 5 ? 1 : 0) - a.cast) * ex(9)
  const rb = rigBuild(r)
  const twoH = rb?.twoHanded ?? false
  const steadyL = rb?.steadyL ? 0.3 : 1
  const breathe = Math.sin(t * 1.6 + r.phase)
  r.torso.scale.y = 1 + breathe * 0.012
  // 待機姿勢（手肘微彎、手臂略張開、慢慢左右看）
  const idleLook = Math.sin(t * 0.31 + r.phase * 2.1) * Math.sin(t * 0.13 + r.phase)
  let legL = 0
  let legR = 0
  let shinL = 0
  let shinR = 0
  let armLx = 0
  let armRx = 0
  let armLz = -0.07
  let armRz = 0.07
  let foreL = -0.14
  let foreR = -0.14
  let torsoY = 0
  let torsoX = 0
  let headY = idleLook * 0.35 * (1 - a.walk)
  let headX = 0
  let bob = breathe * 0.006
  let hipY = 0
  let hipZ = Math.sin(t * 0.42 + r.phase) * 0.025 * (1 - a.walk)
  if (a.walk > 0.01) {
    // 走路：步頻隨速度；骨盆隨跨步扭轉、肩膀反向；手肘在往前擺時彎得多；身體在單腳支撐時最高
    r.phase += dt * (5.5 + moving * 1.4)
    const s = Math.sin(r.phase)
    const c = Math.cos(r.phase)
    const amp = Math.min(1, moving / 3) * a.walk
    legL = s * 0.62 * amp
    legR = -s * 0.62 * amp
    shinL = (Math.max(0, -c) * 0.95 + 0.12) * amp
    shinR = (Math.max(0, c) * 0.95 + 0.12) * amp
    armLx = -s * 0.5 * amp * steadyL
    armRx = s * 0.5 * amp
    foreL += -(0.15 + Math.max(0, s) * 0.45) * amp
    foreR += -(0.15 + Math.max(0, -s) * 0.45) * amp
    hipY = -s * 0.12 * amp
    hipZ += c * 0.03 * amp
    torsoY = s * 0.2 * amp
    torsoX = 0.09 * amp
    headY += -torsoY * 0.5
    headX = -0.05 * amp
    bob = Math.abs(c) * 0.05 * amp - 0.015 * amp
  }
  if (a.cast > 0.01) {
    // 施法：雙手前伸、掌心張開、微微後仰，手上有節奏地抖動
    const w = Math.sin(t * 6) * 0.08
    armLx += (-0.95 - w - armLx) * a.cast
    armRx += (-0.95 + w - armRx) * a.cast
    armLz += (0.25 - armLz) * a.cast
    armRz += (-0.25 - armRz) * a.cast
    foreL += (-0.3 - foreL) * a.cast
    foreR += (-0.3 - foreR) * a.cast
    torsoX += (-0.06 - torsoX) * a.cast
    headX += (-0.1 - headX) * a.cast
  }
  if (a.aim > 0.01) {
    // 攻擊：剛進入攻擊狀態的 0.22 s 是預備動作（壓低、側身、手往下收），之後舉槍瞄準；雙手武器左手扶槍
    const ant = state === 2 && a.stT < 0.22 ? Math.sin((a.stT / 0.22) * Math.PI) : 0
    const k = a.aim
    armRx += (-1.42 + ant * 0.55 - armRx) * k
    armRz += (0.02 - armRz) * k
    foreR += (-0.05 - foreR) * k
    torsoY += (-0.14 - ant * 0.25 - torsoY) * k
    headY += (0.12 + ant * 0.15 - headY) * k
    bob -= ant * 0.035
    if (twoH) {
      armLx += (-1.2 - armLx) * k
      armLz += (0.5 - armLz) * k
      foreL += (-0.55 - foreL) * k
    } else {
      armLx += (-0.15 - armLx) * k * (1 - a.walk * 0.7)
    }
  }
  r.legL.rotation.x = legL
  r.legR.rotation.x = legR
  r.shinL.rotation.x = shinL
  r.shinR.rotation.x = shinR
  r.armL.rotation.x = armLx
  r.armR.rotation.x = armRx
  r.armL.rotation.z = armLz
  r.armR.rotation.z = armRz
  r.foreL.rotation.x = foreL
  r.foreR.rotation.x = foreR
  r.torso.rotation.y = torsoY
  r.torso.rotation.x = torsoX
  r.head.rotation.y = headY
  r.head.rotation.x = headX
  hip.rotation.y = hipY
  hip.rotation.z = hipZ
  r.body.position.y = bob
  for (const f of r.extra) f(t, dt)
}
