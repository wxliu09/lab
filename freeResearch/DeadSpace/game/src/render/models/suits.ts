// 18 套防護服的外觀（美術聖經 §8）：共用的裝甲基底（胸甲、護腿、護臂、重靴、玩家色肩甲、頭盔）
// ＋每套至少一個大剪影零件（背後線圈、肩上發射筒、液氮罐、燃料罐、鏡面翼板、機械臂、磁鐵、散熱鰭…），預設距離下靠剪影就分得出來。
// 零件登記在人形的 Kit 裡、跟身體一起依骨架節點合併；會動的零件（鋸片、光環、粒子）放在自己的子群組裡。
// 外觀只看防護服 id 與玩家色（快照的 d、c），不依賴隱藏身分。
import * as THREE from 'three'
import { Kit, ball, blk, bootGeo, cbox, hose, lathe, ring, tube, type PartOpts, type V3 } from './humanKit'
import { GUN_FRAME, PAULDRON, band, gunPoint, rigBuild, type Rig } from './human'
import type { Tile } from './humanTex'

type Helmet = 'dome' | 'visor' | 'mask' | 'gas' | 'heavy' | 'none'
type Shoulder = 'std' | 'heavy' | 'slim'

interface SuitLook {
  /** 裝甲板色 */
  plate: string
  /** 發光色 */
  glow: string
  /** 內襯（四肢、軀幹的連身衣）*/
  under: string
  underTile?: Tile
  plateTile?: Tile
  helmet: Helmet
  shoulders: Shoulder
  /** false：不建共用胸甲（自己有更厚的）*/
  chest?: boolean
  twoHanded?: boolean
  build: (s: S) => void
}

interface S {
  r: Rig
  k: Kit
  plate: string
  glow: string
  /** 在骨架節點下建一個會動的子群組（零件合併在群組內，群組本身由 r.extra 動畫）*/
  live: (parent: THREE.Object3D, at?: V3) => THREE.Group
}

const DARK = '#2a2f35'

const P = (s: S, o: PartOpts = {}): PartOpts => ({ tile: 'plate', color: s.plate, wear: 1, ...o })
const G = (s: S, glow = 2.2, o: PartOpts = {}): PartOpts => ({ slot: 'glow', color: s.glow, glow, ...o })
const W = (o: PartOpts = {}): PartOpts => ({ frame: GUN_FRAME, ...o })

/** 背後的立柱線圈（特斯拉）*/
function coilTower(s: S, x: number): void {
  const t = s.r.torso
  s.k.add(t, tube(0.022, 0.026, 0.5, 6), { tile: 'metal', color: '#5a6470', at: [x, 0.24, -0.27] })
  for (let i = 0; i < 3; i++)
    s.k.add(
      t,
      ring(0.06 - i * 0.01, 0.016, 3, 9),
      G(s, 2.2, { at: [x, 0.12 + i * 0.1, -0.27], rot: [Math.PI / 2, 0, 0] }),
    )
  s.k.add(t, cbox(0.09, 0.05, 0.09, 0.015), P(s, { at: [x, -0.02, -0.27] }))
}

/** 圓頭槽（燃料罐、液氮罐、酸液罐）：膠囊形 lathe */
function tank(
  s: S,
  at: V3,
  r: number,
  h: number,
  color: string,
  tile: Tile = 'paint',
  o: PartOpts = {},
): void {
  const k = s.k
  k.add(
    s.r.torso,
    lathe(
      [
        [0.0, -h / 2 - r * 0.6],
        [r * 0.7, -h / 2 - r * 0.45],
        [r, -h / 2],
        [r, h / 2],
        [r * 0.7, h / 2 + r * 0.45],
        [0.0, h / 2 + r * 0.6],
      ],
      k.seg(9),
    ),
    { tile, color, at, ...o },
  )
}

const LOOKS: Record<string, SuitLook> = {
  'suit.tesla': {
    plate: '#3a4a66',
    glow: '#7fd8ff',
    under: '#20262f',
    helmet: 'dome',
    shoulders: 'std',
    build: (s) => {
      // 背後兩座線圈塔，頂端的放電球會閃
      coilTower(s, -0.1)
      coilTower(s, 0.1)
      const tips = s.live(s.r.torso, [0, 0.5, -0.27])
      for (const x of [-0.1, 0.1]) s.k.add(tips, ball(0.04, 8, 6), G(s, 3, { at: [x, 0, 0] }))
      s.k.add(tips, blk(0.2, 0.012, 0.012), G(s, 3.4))
      s.r.extra.push((t) => {
        const f = Math.abs(Math.sin(t * 13)) * 0.5
        tips.scale.set(1, 0.8 + f, 0.8 + f)
        tips.rotation.x = Math.sin(t * 31) * 0.3
      })
      // 頭盔頂鰭
      s.k.add(s.r.head, cbox(0.02, 0.07, 0.2, 0.006), P(s, { at: [0, 0.19, -0.01] }))
      // 電弧投射器（右手）：兩支叉頭＋發光球
      s.k.add(s.r.foreR, cbox(0.06, 0.07, 0.16, 0.015), W(P(s, { at: [0, 0.03, 0.05] })))
      for (const x of [-0.025, 0.025])
        s.k.add(
          s.r.foreR,
          blk(0.012, 0.012, 0.12),
          W({ tile: 'metal', color: '#9aa4ae', at: [x, 0.03, 0.18] }),
        )
      s.k.add(s.r.foreR, ball(0.022, 6, 4), G(s, 3, W({ at: [0, 0.03, 0.22] })))
      s.r.muzzle.position.copy(gunPoint(0.23, 0.03))
    },
  },
  'suit.rocket': {
    plate: '#5a4a3a',
    glow: '#ff7a2a',
    under: '#2a2622',
    helmet: 'heavy',
    shoulders: 'heavy',
    build: (s) => {
      const t = s.r.torso
      // 右肩扛著的發射筒（朝前上方）＋左側背後的四聯飛彈莢
      const tilt: V3 = [Math.PI / 2 - 0.12, 0, 0]
      s.k.add(t, tube(0.085, 0.085, 0.78, 10), {
        tile: 'plate',
        color: '#4a4a40',
        at: [0.24, 0.34, 0.02],
        rot: tilt,
        wear: 1,
      })
      s.k.add(t, ring(0.088, 0.018, 4, 12), {
        tile: 'metal',
        color: '#2a2a28',
        at: [0.24, 0.39, 0.4],
        rot: [-0.12, 0, 0],
      })
      s.k.add(t, ring(0.07, 0.014, 4, 12), G(s, 2.4, { at: [0.24, 0.395, 0.41], rot: [-0.12, 0, 0] }))
      band(s.k, t, 0.09, -0.06, 0.06, '#e8c020', 'hazard', { at: [0.24, 0.32, -0.1], rot: tilt })
      s.k.add(t, cbox(0.07, 0.12, 0.1, 0.02), P(s, { at: [0.24, 0.24, 0.0] }))
      s.k.add(t, cbox(0.2, 0.26, 0.16, 0.03), P(s, { at: [-0.06, 0.08, -0.24] }))
      for (let i = 0; i < 4; i++)
        s.k.add(t, tube(0.03, 0.03, 0.01, 8), {
          tile: 'rubber',
          color: '#141414',
          at: [-0.11 + (i % 2) * 0.1, 0.24 - 0.02, -0.21 - Math.floor(i / 2) * 0.07],
          small: true,
        })
      // 單眼瞄準鏡
      s.k.add(s.r.head, tube(0.025, 0.025, 0.06, 8), {
        tile: 'metal',
        color: '#3a3a3a',
        at: [0.07, 0.02, 0.17],
        rot: [Math.PI / 2, 0, 0],
      })
      s.k.add(
        s.r.head,
        tube(0.02, 0.02, 0.004, 8),
        G(s, 3, { at: [0.07, 0.02, 0.2], rot: [Math.PI / 2, 0, 0] }),
      )
      // 火箭從肩上的發射筒出來：槍口改掛在軀幹上
      s.r.torso.add(s.r.muzzle)
      s.r.muzzle.position.set(0.24, 0.39, 0.44)
      // 右手：發射扳機握把
      s.k.add(s.r.foreR, cbox(0.04, 0.09, 0.08, 0.012), W({ tile: 'rubber', color: DARK, at: [0, 0, 0.02] }))
    },
  },
  'suit.cryo': {
    plate: '#a9c9d9',
    glow: '#9fe7ff',
    under: '#3a4a58',
    underTile: 'quilt',
    helmet: 'dome',
    shoulders: 'std',
    build: (s) => {
      // 背後兩支白色液氮罐（霜環發光）＋軟管接到右手噴嘴
      for (const x of [-0.1, 0.1]) {
        tank(s, [x, 0.06, -0.27], 0.075, 0.3, '#e4eef4', 'paint', { wear: 0 })
        s.k.add(
          s.r.torso,
          ring(0.078, 0.012, 3, 10),
          G(s, 2, { at: [x, 0.0, -0.27], rot: [Math.PI / 2, 0, 0] }),
        )
        s.k.add(
          s.r.torso,
          ring(0.078, 0.012, 3, 10),
          G(s, 2, { at: [x, 0.14, -0.27], rot: [Math.PI / 2, 0, 0] }),
        )
        s.k.add(s.r.torso, tube(0.02, 0.02, 0.05, 6), {
          tile: 'metal',
          color: '#7a8a96',
          at: [x, 0.3, -0.27],
          small: true,
        })
      }
      s.k.add(
        s.r.torso,
        hose(
          [
            [0.12, -0.1, -0.3],
            [0.26, -0.15, -0.18],
            [0.33, -0.25, 0.0],
          ],
          0.016,
          8,
          4,
        ),
        { tile: 'rubber', color: '#d8e4ea' },
      )
      // 噴嘴：錐形＋霜環
      s.k.add(
        s.r.foreR,
        lathe(
          [
            [0.03, -0.1],
            [0.05, 0.0],
            [0.042, 0.1],
            [0.028, 0.12],
          ],
          s.k.seg(9),
        ),
        W(P(s, { at: [0, 0.03, 0.08], rot: [Math.PI / 2, 0, 0], wear: 0 })),
      )
      s.k.add(s.r.foreR, ring(0.034, 0.008, 4, 10), G(s, 2.6, W({ at: [0, 0.03, 0.2] })))
      s.r.muzzle.position.copy(gunPoint(0.22, 0.03))
      const frost = s.live(s.r.torso, [0, 0.07, -0.27])
      for (const x of [-0.1, 0.1])
        s.k.add(frost, ring(0.08, 0.008, 3, 12), G(s, 1.6, { at: [x, 0, 0], rot: [Math.PI / 2, 0, 0] }))
      s.r.extra.push((t) => {
        frost.position.y = 0.07 + Math.sin(t * 2.2) * 0.07
        frost.scale.setScalar(0.95 + Math.sin(t * 4.4) * 0.05)
      })
    },
  },
  'suit.plasma': {
    plate: '#2f4a3a',
    glow: '#5cf2a5',
    under: '#1e2622',
    helmet: 'visor',
    shoulders: 'std',
    build: (s) => {
      // 右前臂整支電漿砲（包住前臂的大砲管＋發光線圈）
      const f = s.r.foreR
      s.k.add(
        f,
        lathe(
          [
            [0.07, -0.16],
            [0.09, -0.1],
            [0.095, 0.06],
            [0.08, 0.14],
            [0.05, 0.17],
          ],
          s.k.seg(10),
        ),
        W(P(s, { at: [0, 0.04, 0.02], rot: [Math.PI / 2, 0, 0], wear: 0 })),
      )
      for (let i = 0; i < 3; i++)
        s.k.add(f, ring(0.097, 0.01, 3, 12), G(s, 2.2, W({ at: [0, 0.04, -0.06 + i * 0.07] })))
      s.k.add(f, ring(0.045, 0.012, 4, 12), G(s, 3, W({ at: [0, 0.04, 0.19] })))
      s.r.muzzle.position.copy(gunPoint(0.21, 0.04))
      // 背後的反應爐籠：脈動的電漿核心
      const t = s.r.torso
      s.k.add(t, cbox(0.24, 0.05, 0.16, 0.015), P(s, { at: [0, -0.1, -0.25] }))
      s.k.add(t, cbox(0.24, 0.05, 0.16, 0.015), P(s, { at: [0, 0.24, -0.25] }))
      for (const x of [-0.1, 0.1])
        s.k.add(t, cbox(0.025, 0.32, 0.025, 0.006), { tile: 'metal', color: '#3a4a40', at: [x, 0.07, -0.25] })
      const core = s.live(t, [0, 0.07, -0.25])
      s.k.add(core, ball(0.085, 10, 7), G(s, 2.6))
      s.r.extra.push((tt) => core.scale.setScalar(0.88 + Math.sin(tt * 5) * 0.12))
    },
  },
  'suit.pyro': {
    plate: '#5a3a2a',
    glow: '#ff9a3a',
    under: '#2a201a',
    underTile: 'leather',
    helmet: 'gas',
    shoulders: 'heavy',
    build: (s) => {
      // 背後兩支紅色燃料罐（警示斜紋）＋閥門＋軟管接到長噴嘴
      for (const x of [-0.11, 0.11]) {
        tank(s, [x, 0.05, -0.27], 0.085, 0.34, '#b8452a', 'paint', { wear: 0 })
        band(s.k, s.r.torso, 0.088, -0.03, 0.03, '#e8c020', 'hazard', { at: [x, -0.04, -0.27] })
        s.k.add(s.r.torso, cbox(0.04, 0.05, 0.04, 0.01), {
          tile: 'metal',
          color: '#8a8070',
          at: [x, 0.33, -0.27],
        })
      }
      s.k.add(
        s.r.torso,
        hose(
          [
            [0.11, -0.16, -0.3],
            [0.28, -0.2, -0.16],
            [0.33, -0.32, 0.02],
          ],
          0.02,
          8,
          4,
        ),
        { tile: 'rubber', color: '#2a2420' },
      )
      const f = s.r.foreR
      s.k.add(f, cbox(0.06, 0.08, 0.16, 0.015), W(P(s, { at: [0, 0.03, 0.04] })))
      s.k.add(
        f,
        tube(0.022, 0.03, 0.26, 8),
        W({ tile: 'metal', color: DARK, at: [0, 0.04, 0.24], rot: [Math.PI / 2, 0, 0] }),
      )
      s.k.add(f, ring(0.032, 0.01, 3, 10), W({ tile: 'metal', color: '#6a6058', at: [0, 0.04, 0.36] }))
      s.r.muzzle.position.copy(gunPoint(0.39, 0.04))
      // 長明火
      const pilot = s.live(f)
      pilot.position.copy(gunPoint(0.38, 0.0))
      s.k.add(pilot, ball(0.022, 6, 4), G(s, 3.2))
      s.r.extra.push((t) =>
        pilot.scale.setScalar(0.75 + Math.abs(Math.sin(t * 23) * Math.sin(t * 7.3)) * 0.6),
      )
    },
  },
  'suit.photon': {
    plate: '#d8c88a',
    glow: '#fff2a8',
    under: '#3a3628',
    plateTile: 'metal',
    helmet: 'dome',
    shoulders: 'slim',
    build: (s) => {
      const t = s.r.torso
      // 背後一對斜向張開的鏡面翼板（發光鏡面），邊緣發光
      for (const side of [-1, 1]) {
        s.k.add(t, cbox(0.3, 0.46, 0.022, 0.008), {
          tile: 'metal',
          color: '#f4ecd0',
          at: [side * 0.2, 0.26, -0.26],
          rot: [0.25, side * 0.35, -side * 0.5],
        })
        s.k.add(
          t,
          blk(0.012, 0.44, 0.03),
          G(s, 2.2, { at: [side * 0.33, 0.2, -0.22], rot: [0.25, side * 0.35, -side * 0.5] }),
        )
      }
      s.k.add(t, cbox(0.14, 0.12, 0.08, 0.02), P(s, { at: [0, 0.12, -0.22] }))
      // 胸口發光盤
      s.k.add(t, tube(0.06, 0.06, 0.02, 12), G(s, 2.6, { at: [0, 0.07, 0.175], rot: [Math.PI / 2, 0, 0] }))
      s.k.add(t, ring(0.066, 0.012, 4, 14), { tile: 'metal', color: '#c8b070', at: [0, 0.07, 0.172] })
      // 手上的聚光器
      s.k.add(
        s.r.foreR,
        lathe(
          [
            [0.025, -0.06],
            [0.035, 0.0],
            [0.055, 0.06],
          ],
          s.k.seg(10),
        ),
        W(P(s, { at: [0, 0.03, 0.09], rot: [Math.PI / 2, 0, 0], wear: 0 })),
      )
      s.k.add(
        s.r.foreR,
        tube(0.045, 0.045, 0.004, 10),
        G(s, 3, W({ at: [0, 0.03, 0.155], rot: [Math.PI / 2, 0, 0] })),
      )
      s.r.muzzle.position.copy(gunPoint(0.16, 0.03))
    },
  },
  'suit.service': {
    plate: '#c2a03a',
    glow: '#ffc23d',
    under: '#3a3426',
    underTile: 'canvas',
    helmet: 'heavy',
    shoulders: 'std',
    build: (s) => {
      const t = s.r.torso
      // 背上的機械臂：從背後升起、越過右肩向前，末端是鏈鋸
      s.k.add(t, cbox(0.22, 0.26, 0.12, 0.03), P(s, { at: [0, 0.05, -0.23] }))
      s.k.add(t, cbox(0.07, 0.44, 0.07, 0.015), P(s, { at: [0.2, 0.32, -0.2], rot: [0.5, 0, -0.35] }))
      s.k.add(t, ball(0.05, 8, 5), { tile: 'metal', color: '#5a5a5a', at: [0.29, 0.5, -0.07] })
      s.k.add(t, cbox(0.06, 0.06, 0.36, 0.015), P(s, { at: [0.3, 0.46, 0.1], rot: [0.25, 0, 0] }))
      band(s.k, t, 0.04, -0.1, 0.1, '#e8c020', 'hazard', {
        at: [0.3, 0.46, 0.1],
        rot: [0.25 - Math.PI / 2, 0, 0],
      })
      const saw = s.live(t, [0.3, 0.4, 0.31])
      // 鋸片朝側面、繞自己的軸轉（先轉 y 再轉 z）
      saw.rotation.order = 'ZYX'
      saw.rotation.z = Math.PI / 2
      s.k.add(saw, tube(0.13, 0.13, 0.012, 16), { tile: 'metal', color: '#d8d8d8' })
      s.k.add(saw, tube(0.03, 0.03, 0.03, 8), G(s, 2.4))
      s.r.extra.push((tt) => (saw.rotation.y = tt * 20))
      s.r.torso.add(s.r.muzzle)
      s.r.muzzle.position.set(0.3, 0.4, 0.42)
      // 右手焊槍
      s.k.add(s.r.foreR, cbox(0.04, 0.08, 0.12, 0.01), W({ tile: 'rubber', color: DARK, at: [0, 0.0, 0.03] }))
      s.k.add(
        s.r.foreR,
        tube(0.01, 0.014, 0.1, 6),
        W({ tile: 'metal', color: '#a0a0a0', at: [0, 0.03, 0.13], rot: [Math.PI / 2, 0, 0], small: true }),
      )
    },
  },
  'suit.void': {
    plate: '#141218',
    glow: '#9b5de5',
    under: '#0e0d11',
    underTile: 'rubber',
    plateTile: 'rubber',
    helmet: 'mask',
    shoulders: 'slim',
    build: (s) => {
      // 吸光的黑：兜帽＋破碎披風（剪影是尖帽與長擺）＋繞身的紫色粒子
      const h = s.r.head
      s.k.add(
        h,
        lathe(
          [
            [0.17, -0.1],
            [0.185, 0.0],
            [0.18, 0.08],
            [0.14, 0.17],
            [0.06, 0.24],
            [0.0, 0.27],
          ],
          s.k.seg(11),
          1,
          1.12,
          Math.PI * 0.32,
          Math.PI * 1.36,
        ),
        { tile: 'fabric', color: '#121016', at: [0, 0, -0.02], rot: [-0.25, 0, 0] },
      )
      const k = s.k
      for (const side of [-1, 1]) {
        const leg = side < 0 ? s.r.legL : s.r.legR
        const ps = side > 0 ? 0.5 : Math.PI + 0.1
        const pl = Math.PI - 0.6
        k.add(
          leg,
          lathe(
            [
              [0.22, -0.5],
              [0.2, -0.25],
              [0.186, 0.02],
            ],
            k.seg(7),
            1,
            0.85,
            ps,
            pl,
          ),
          { tile: 'fabric', color: '#151219', at: [-side * 0.11, 0, 0] },
        )
        k.add(
          leg,
          lathe(
            [
              [0.178, 0.02],
              [0.192, -0.25],
              [0.212, -0.5],
            ],
            k.seg(7),
            1,
            0.85,
            ps,
            pl,
          ),
          { tile: 'fabric', color: '#0c0b0e', at: [-side * 0.11, 0, 0] },
        )
      }
      s.k.add(s.r.torso, cbox(0.36, 0.5, 0.02, 0.01), {
        tile: 'fabric',
        color: '#151219',
        at: [0, -0.02, -0.2],
        rot: [0.12, 0, 0],
      })
      s.k.add(s.r.torso, blk(0.3, 0.014, 0.012), G(s, 1.8, { at: [0, 0.16, 0.175] }))
      const motes = s.live(s.r.torso, [0, 0, 0])
      for (let i = 0; i < 6; i++) {
        const a = (i / 6) * Math.PI * 2
        s.k.add(
          motes,
          ball(0.024, 6, 4),
          G(s, 3, {
            at: [
              Math.cos(a) * (0.36 + (i % 2) * 0.08),
              Math.sin(i * 1.7) * 0.25,
              Math.sin(a) * (0.36 + (i % 2) * 0.08),
            ],
          }),
        )
      }
      s.r.extra.push((t) => {
        motes.rotation.y = t * 1.3
        motes.position.y = Math.sin(t * 1.9) * 0.06
      })
      // 武器：手背上的虛空稜晶
      s.k.add(
        s.r.foreR,
        cbox(0.04, 0.04, 0.1, 0.01),
        W({ tile: 'glass', color: '#2a1a3a', at: [0, 0.04, 0.06], rot: [0, 0, Math.PI / 4] }),
      )
      s.k.add(s.r.foreR, blk(0.012, 0.012, 0.11), G(s, 3, W({ at: [0, 0.04, 0.06] })))
      s.r.muzzle.position.copy(gunPoint(0.13, 0.04))
    },
  },
  'suit.mirage': {
    plate: '#6a6f8a',
    glow: '#c9b6ff',
    under: '#2a2c38',
    helmet: 'visor',
    shoulders: 'slim',
    build: (s) => {
      const t = s.r.torso
      // 背後兩支 V 字形投影天線（頂端發光）＋肩上的投影碟＋胸前掃描線
      for (const side of [-1, 1]) {
        s.k.add(
          t,
          cbox(0.035, 0.66, 0.035, 0.01),
          P(s, { at: [side * 0.11, 0.34, -0.23], rot: [-0.15, 0, -side * 0.32] }),
        )
        // 投影帆：天線內側一條發光薄片（俯視看是兩道發光的 V）
        s.k.add(
          t,
          blk(0.1, 0.5, 0.006),
          G(s, 1.5, { at: [side * 0.07, 0.36, -0.235], rot: [-0.15, 0, -side * 0.32] }),
        )
        s.k.add(t, ball(0.034, 8, 5), G(s, 3, { at: [side * 0.21, 0.65, -0.28] }))
        s.k.add(
          t,
          lathe(
            [
              [0.0, -0.015],
              [0.05, 0.0],
              [0.055, 0.012],
            ],
            s.k.seg(10),
          ),
          P(s, { at: [side * 0.27, 0.33, -0.04], rot: [0, 0, -side * 0.5], wear: 0 }),
        )
        s.k.add(t, ball(0.016, 6, 4), G(s, 2.6, { at: [side * 0.28, 0.35, -0.04] }))
      }
      s.k.add(t, cbox(0.18, 0.22, 0.09, 0.02), P(s, { at: [0, 0.05, -0.2] }))
      for (let i = 0; i < 3; i++)
        s.k.add(
          t,
          blk(0.3 - i * 0.05, 0.012, 0.012),
          G(s, 1.8, { at: [0, 0.02 - i * 0.06, 0.168 - i * 0.004] }),
        )
      s.k.add(s.r.foreR, cbox(0.045, 0.07, 0.18, 0.012), W(P(s, { at: [0, 0.03, 0.06] })))
      s.k.add(s.r.foreR, blk(0.012, 0.012, 0.15), G(s, 2.4, W({ at: [0, 0.07, 0.06] })))
      s.r.muzzle.position.copy(gunPoint(0.16, 0.03))
      // 投影閃爍（雜訊）
      s.r.extra.push((tt) => (s.r.root.visible = Math.sin(tt * 31) > -0.97))
    },
  },
  'suit.rad': {
    plate: '#4a4f48',
    glow: '#7dff6a',
    under: '#2e322c',
    underTile: 'quilt',
    helmet: 'gas',
    shoulders: 'heavy',
    chest: false,
    build: (s) => {
      const t = s.r.torso
      // 鉛板：再一層更厚的胸甲＋背後的小型反應爐（綠光從縫隙透出）＋排氣管
      s.k.add(
        t,
        lathe(
          [
            [0.215, -0.16],
            [0.24, -0.05],
            [0.255, 0.1],
            [0.245, 0.19],
            [0.2, 0.235],
          ],
          s.k.seg(12),
          1,
          0.76,
        ),
        P(s, { wear: 0, tile: 'plate' }),
      )
      s.k.add(
        t,
        lathe(
          [
            [0.0, -0.22],
            [0.11, -0.2],
            [0.12, 0.18],
            [0.09, 0.22],
            [0, 0.23],
          ],
          s.k.seg(10),
        ),
        P(s, { at: [0, 0.05, -0.27], wear: 0 }),
      )
      for (let i = 0; i < 3; i++)
        s.k.add(t, blk(0.13, 0.03, 0.04), G(s, 2.4, { at: [0, -0.05 + i * 0.1, -0.375 - 0.0] }))
      for (const x of [-0.08, 0.08])
        s.k.add(t, tube(0.022, 0.022, 0.18, 6), { tile: 'metal', color: '#3a3a36', at: [x, 0.36, -0.27] })
      // 胸前輻射警示牌
      s.k.add(t, cbox(0.1, 0.1, 0.012, 0.004), {
        tile: 'paint',
        color: '#e8c020',
        at: [0, 0.08, 0.19],
        rot: [0, 0, Math.PI / 4],
      })
      s.k.add(t, ball(0.018, 6, 4), { tile: 'paint', color: '#141414', at: [0, 0.08, 0.196] })
      // 手上的反應槍
      s.k.add(s.r.foreR, cbox(0.06, 0.08, 0.2, 0.015), W(P(s, { at: [0, 0.03, 0.07] })))
      s.k.add(
        s.r.foreR,
        tube(0.02, 0.02, 0.06, 6),
        G(s, 2.4, W({ at: [0, 0.03, 0.2], rot: [Math.PI / 2, 0, 0] })),
      )
      s.r.muzzle.position.copy(gunPoint(0.23, 0.03))
      const pulse = s.live(t, [0, 0.05, -0.27])
      s.k.add(pulse, ring(0.125, 0.01, 3, 14), G(s, 2, { rot: [Math.PI / 2, 0, 0] }))
      s.r.extra.push((tt) => (pulse.position.y = 0.05 + Math.sin(tt * 3) * 0.15))
    },
  },
  'suit.operative': {
    plate: '#1c1f24',
    glow: '#ff3b3b',
    under: '#141619',
    underTile: 'rubber',
    helmet: 'visor',
    shoulders: 'slim',
    twoHanded: true,
    build: (s) => {
      // 長程精準步槍（雙手）＋背後的衝刺推進器（兩支噴口）
      const f = s.r.foreR
      s.k.add(
        f,
        cbox(0.045, 0.075, 0.34, 0.012),
        W({ tile: 'paint', color: '#22262b', at: [0, 0.03, 0.1], wear: 1 }),
      )
      s.k.add(
        f,
        tube(0.011, 0.011, 0.34, 6),
        W({ tile: 'metal', color: '#2a2d30', at: [0, 0.045, 0.43], rot: [Math.PI / 2, 0, 0] }),
      )
      s.k.add(
        f,
        tube(0.02, 0.02, 0.16, 8),
        W({ tile: 'metal', color: '#141618', at: [0, 0.1, 0.08], rot: [Math.PI / 2, 0, 0] }),
      )
      s.k.add(
        f,
        tube(0.016, 0.016, 0.004, 8),
        G(s, 2.8, W({ at: [0, 0.1, 0.162], rot: [Math.PI / 2, 0, 0] })),
      )
      s.k.add(f, cbox(0.04, 0.07, 0.16, 0.012), W({ tile: 'paint', color: '#22262b', at: [0, 0.0, -0.13] }))
      s.r.muzzle.position.copy(gunPoint(0.6, 0.045))
      const t = s.r.torso
      s.k.add(t, cbox(0.2, 0.3, 0.1, 0.03), P(s, { at: [0, 0.03, -0.2] }))
      for (const x of [-0.07, 0.07]) {
        s.k.add(
          t,
          lathe(
            [
              [0.045, -0.06],
              [0.035, 0.04],
              [0.025, 0.06],
            ],
            s.k.seg(8),
          ),
          { tile: 'metal', color: '#3a3d42', at: [x, -0.15, -0.22] },
        )
        s.k.add(t, tube(0.03, 0.03, 0.004, 8), G(s, 2.4, { at: [x, -0.21, -0.22] }))
      }
      s.k.add(t, blk(0.012, 0.4, 0.012), G(s, 1.8, { at: [0.12, 0.0, 0.17] }))
    },
  },
  'suit.labcoat': {
    plate: '#e8eef0',
    glow: '#33ffd1',
    under: '',
    helmet: 'none',
    shoulders: 'std',
    build: (s) => {
      const k = s.k
      const t = s.r.torso
      // 白袍（到膝、袍角外擴）＋胸前的試管背帶（三色發光試管）＋額頭上的護目鏡
      const rb = rigBuild(s.r)!
      for (const side of [-1, 1]) {
        const leg = side < 0 ? s.r.legL : s.r.legR
        const ps = side > 0 ? 0.375 : Math.PI + 0.11
        const pl = Math.PI - 0.485
        k.add(
          leg,
          lathe(
            [
              [0.24, -0.44],
              [0.205, -0.24],
              [0.188, 0.02],
            ],
            k.seg(7),
            1,
            0.82,
            ps,
            pl,
          ),
          { tile: 'fabric', color: '#eef3f5', at: [-side * 0.11, 0, 0] },
        )
        k.add(
          leg,
          lathe(
            [
              [0.18, 0.02],
              [0.197, -0.24],
              [0.232, -0.44],
            ],
            k.seg(7),
            1,
            0.82,
            ps,
            pl,
          ),
          { tile: 'fabric', color: '#b8c4c8', at: [-side * 0.11, 0, 0] },
        )
      }
      k.add(
        rb.hip,
        lathe(
          [
            [0.19, -0.06],
            [0.182, 0.05],
            [0.174, 0.13],
          ],
          k.seg(10),
          1,
          0.82,
        ),
        { tile: 'fabric', color: '#eef3f5' },
      )
      k.add(
        t,
        lathe(
          [
            [0.17, -0.27],
            [0.2, -0.1],
            [0.222, 0.08],
            [0.222, 0.16],
            [0.2, 0.22],
            [0.15, 0.26],
          ],
          k.seg(12),
          1,
          0.7,
        ),
        { tile: 'fabric', color: '#eef3f5' },
      )
      k.add(
        t,
        hose(
          [
            [-0.18, 0.2, 0.05],
            [-0.07, 0.1, 0.162],
            [0.07, -0.04, 0.158],
            [0.17, -0.18, 0.06],
          ],
          0.016,
          8,
          4,
        ),
        { tile: 'leather', color: '#5a3a22' },
      )
      const vial = ['#33ffd1', '#ff7eb6', '#ffc23d', '#9b8bff']
      for (let i = 0; i < 4; i++)
        k.add(t, tube(0.016, 0.016, 0.08, 6), {
          slot: 'glow',
          color: vial[i],
          glow: 1.5,
          at: [-0.1 + i * 0.06, 0.13 - i * 0.065, 0.168],
          rot: [0, 0, 0.75],
        })
      for (const x of [-0.05, 0.05])
        k.add(s.r.head, tube(0.028, 0.028, 0.025, 8), {
          tile: 'glass',
          color: '#3a7a7a',
          at: [x, 0.105, 0.115],
          rot: [Math.PI / 2 - 0.6, 0, 0],
        })
      band(k, s.r.head, 0.136, 0.08, 0.1, '#2a2a2a', 'rubber', { rot: [-0.3, 0, 0] }, 1)
    },
  },
  'suit.guard': {
    plate: '#3a5a8a',
    glow: '#4aa8ff',
    under: '#1e2a3a',
    helmet: 'heavy',
    shoulders: 'heavy',
    build: (s) => {
      // 左前臂的大塔盾（十字發光紋）＋繞著左手轉的力場環＋背後的護盾產生器
      const f = s.r.foreL
      s.k.add(f, cbox(0.04, 0.62, 0.4, 0.03), P(s, { at: [-0.08, -0.2, 0.04] }))
      s.k.add(f, blk(0.012, 0.42, 0.04), G(s, 2, { at: [-0.102, -0.2, 0.04] }))
      s.k.add(f, blk(0.012, 0.04, 0.26), G(s, 2, { at: [-0.102, -0.12, 0.04] }))
      s.k.add(f, cbox(0.012, 0.66, 0.44, 0.004), {
        tile: 'metal',
        color: '#8aa0c0',
        at: [-0.06, -0.2, 0.04],
        small: true,
      })
      const halo = s.live(f, [-0.04, -0.2, 0.04])
      s.k.add(halo, ring(0.3, 0.008, 3, 24), G(s, 1.8, { rot: [0, Math.PI / 2, 0] }))
      s.r.extra.push((t) => (halo.rotation.y = t * 1.5))
      const t = s.r.torso
      s.k.add(t, cbox(0.26, 0.3, 0.13, 0.035), P(s, { at: [0, 0.05, -0.23] }))
      s.k.add(t, tube(0.045, 0.045, 0.02, 12), G(s, 2.4, { at: [0, 0.07, -0.3], rot: [Math.PI / 2, 0, 0] }))
      s.k.add(s.r.foreR, cbox(0.05, 0.075, 0.2, 0.012), W(P(s, { at: [0, 0.03, 0.06] })))
      s.k.add(s.r.foreR, blk(0.012, 0.012, 0.12), G(s, 2.2, W({ at: [0, 0.07, 0.06] })))
      s.r.muzzle.position.copy(gunPoint(0.17, 0.03))
    },
  },
  'suit.acid': {
    plate: '#3a4a2a',
    glow: '#b6ff3a',
    under: '#22281c',
    underTile: 'rubber',
    helmet: 'gas',
    shoulders: 'std',
    build: (s) => {
      const t = s.r.torso
      // 背後一支玻璃酸液槽（內部發光液體）＋長噴射槍（射程遠）
      s.k.add(
        t,
        lathe(
          [
            [0.0, -0.2],
            [0.085, -0.19],
            [0.09, 0.16],
            [0.0, 0.17],
          ],
          s.k.seg(9),
        ),
        G(s, 1.4, { at: [0, 0.05, -0.27] }),
      )
      s.k.add(t, ring(0.1, 0.02, 3, 10), {
        tile: 'metal',
        color: '#4a5040',
        at: [0, -0.15, -0.27],
        rot: [Math.PI / 2, 0, 0],
      })
      s.k.add(t, ring(0.1, 0.02, 3, 10), {
        tile: 'metal',
        color: '#4a5040',
        at: [0, 0.22, -0.27],
        rot: [Math.PI / 2, 0, 0],
      })
      for (const a of [0, 2.1, 4.2])
        s.k.add(t, blk(0.018, 0.36, 0.018), {
          tile: 'metal',
          color: '#4a5040',
          at: [Math.sin(a) * 0.1, 0.035, -0.27 + Math.cos(a) * 0.1],
        })
      s.k.add(
        t,
        hose(
          [
            [0.08, -0.14, -0.3],
            [0.25, -0.2, -0.16],
            [0.32, -0.32, 0.02],
          ],
          0.016,
          8,
          4,
        ),
        { tile: 'rubber', color: '#2a3020' },
      )
      const f = s.r.foreR
      s.k.add(f, cbox(0.05, 0.08, 0.22, 0.012), W(P(s, { at: [0, 0.03, 0.06] })))
      s.k.add(
        f,
        tube(0.014, 0.018, 0.34, 6),
        W({ tile: 'metal', color: DARK, at: [0, 0.04, 0.33], rot: [Math.PI / 2, 0, 0] }),
      )
      s.k.add(f, ball(0.02, 6, 4), G(s, 3, W({ at: [0, 0.04, 0.5] })))
      s.r.muzzle.position.copy(gunPoint(0.51, 0.04))
    },
  },
  'suit.gatling': {
    plate: '#5a5248',
    glow: '#ffb46b',
    under: '#2a2622',
    helmet: 'heavy',
    shoulders: 'heavy',
    twoHanded: true,
    build: (s) => {
      // 腰間端著的六管機槍（雙手）＋背後的彈鼓＋彈鏈
      const f = s.r.foreR
      s.k.add(f, cbox(0.12, 0.13, 0.26, 0.025), W(P(s, { at: [0, 0.02, 0.02] })))
      s.k.add(f, cbox(0.05, 0.08, 0.1, 0.012), W({ tile: 'rubber', color: DARK, at: [0, 0.1, -0.05] }))
      const barrels = s.live(f)
      barrels.applyMatrix4(new THREE.Matrix4().makeTranslation(0, 0.02, 0.33).premultiply(GUN_FRAME))
      for (let i = 0; i < 6; i++) {
        const a = (i / 6) * Math.PI * 2
        s.k.add(barrels, tube(0.016, 0.016, 0.42, 5), {
          tile: 'metal',
          color: '#3a3a3a',
          at: [Math.cos(a) * 0.042, Math.sin(a) * 0.042, 0],
          rot: [Math.PI / 2, 0, 0],
        })
      }
      s.k.add(barrels, ring(0.055, 0.012, 4, 12), { tile: 'metal', color: '#2a2a2a', at: [0, 0, 0.18] })
      s.k.add(barrels, ring(0.055, 0.012, 4, 12), {
        tile: 'metal',
        color: '#2a2a2a',
        at: [0, 0, -0.1],
        small: true,
      })
      s.r.extra.push((t) => (barrels.rotation.z = t * 18))
      s.r.muzzle.position.copy(gunPoint(0.55, 0.02))
      const t = s.r.torso
      s.k.add(
        t,
        lathe(
          [
            [0.0, -0.09],
            [0.15, -0.085],
            [0.16, 0.0],
            [0.15, 0.085],
            [0.0, 0.09],
          ],
          s.k.seg(12),
        ),
        P(s, { at: [0, 0.05, -0.29], rot: [0, 0, Math.PI / 2], wear: 0 }),
      )
      s.k.add(t, ring(0.162, 0.012, 3, 14), G(s, 1.6, { at: [0, 0.05, -0.29], rot: [0, Math.PI / 2, 0] }))
      s.k.add(
        t,
        hose(
          [
            [0.12, -0.05, -0.3],
            [0.27, -0.15, -0.12],
            [0.3, -0.3, 0.08],
          ],
          0.025,
          8,
          4,
        ),
        { tile: 'metal', color: '#8a7a50' },
      )
    },
  },
  'suit.force': {
    plate: '#c8d0e0',
    glow: '#9fe7ff',
    under: '#2a3040',
    helmet: 'dome',
    shoulders: 'std',
    build: (s) => {
      // 腰間浮動的大力場環＋背後兩支 V 字發射塔
      const t = s.r.torso
      for (const side of [-1, 1]) {
        s.k.add(
          t,
          cbox(0.05, 0.5, 0.05, 0.015),
          P(s, { at: [side * 0.14, 0.3, -0.24], rot: [-0.12, 0, -side * 0.28] }),
        )
        s.k.add(
          t,
          blk(0.014, 0.4, 0.014),
          G(s, 2.2, { at: [side * 0.145, 0.3, -0.21], rot: [-0.12, 0, -side * 0.28] }),
        )
        s.k.add(t, ball(0.03, 8, 5), G(s, 2.8, { at: [side * 0.21, 0.54, -0.27] }))
      }
      s.k.add(t, cbox(0.2, 0.2, 0.1, 0.03), P(s, { at: [0, 0.04, -0.2] }))
      s.k.add(s.r.head, cbox(0.02, 0.06, 0.2, 0.006), P(s, { at: [0, 0.19, -0.01] }))
      const halo = s.live(t, [0, -0.25, 0])
      s.k.add(halo, ring(0.42, 0.014, 3, 32), G(s, 2.2, { rot: [Math.PI / 2, 0, 0] }))
      // 傾斜的環繞著身體進動（水平環自轉看不出來）
      s.r.extra.push((tt) => {
        halo.rotation.x = Math.sin(tt * 1.3) * 0.16
        halo.rotation.z = Math.cos(tt * 1.3) * 0.16
        halo.position.y = -0.25 + Math.sin(tt * 2) * 0.05
      })
      s.k.add(s.r.foreR, cbox(0.05, 0.07, 0.18, 0.012), W(P(s, { at: [0, 0.03, 0.06] })))
      s.k.add(s.r.foreR, ring(0.03, 0.01, 3, 10), G(s, 2.6, W({ at: [0, 0.03, 0.16] })))
      s.r.muzzle.position.copy(gunPoint(0.17, 0.03))
    },
  },
  'suit.mag': {
    plate: '#2a4a5a',
    glow: '#33ffd1',
    under: '#1a262c',
    helmet: 'visor',
    shoulders: 'std',
    build: (s) => {
      const t = s.r.torso
      // 背後的大型 U 形電磁鐵（兩極發光）＋前臂的電磁線圈
      s.k.add(
        t,
        ring(0.2, 0.045, 5, 14, Math.PI),
        P(s, { at: [0, 0.22, -0.28], rot: [0, 0, Math.PI], wear: 0, tile: 'paint', color: '#c8463a' }),
      )
      for (const side of [-1, 1]) {
        s.k.add(t, cbox(0.1, 0.16, 0.1, 0.02), {
          tile: 'metal',
          color: '#b8c0c8',
          at: [side * 0.2, 0.32, -0.28],
          wear: 1,
        })
        s.k.add(t, blk(0.11, 0.02, 0.11), G(s, 2.6, { at: [side * 0.2, 0.405, -0.28] }))
      }
      s.k.add(t, cbox(0.18, 0.2, 0.1, 0.03), P(s, { at: [0, 0.02, -0.2] }))
      for (const f of [s.r.foreL, s.r.foreR])
        for (let i = 0; i < 2; i++)
          s.k.add(
            f,
            ring(0.08, 0.014, 3, 10),
            G(s, 2.2, { at: [0, -0.07 - i * 0.08, 0], rot: [Math.PI / 2, 0, 0] }),
          )
      s.k.add(s.r.foreR, cbox(0.05, 0.07, 0.16, 0.012), W(P(s, { at: [0, 0.03, 0.05] })))
      s.r.muzzle.position.copy(gunPoint(0.14, 0.03))
    },
  },
  'suit.pulse': {
    plate: '#3a2a4a',
    glow: '#ff7eb6',
    under: '#1e1826',
    helmet: 'dome',
    shoulders: 'std',
    build: (s) => {
      const t = s.r.torso
      // 胸口的大能量核心（脈動）＋接到右手雷射的導管＋背後扇形散熱鰭（過熱）
      s.k.add(t, ring(0.1, 0.022, 4, 14), { tile: 'metal', color: '#4a3a5a', at: [0, 0.06, 0.18] })
      const core = s.live(t, [0, 0.06, 0.18])
      s.k.add(core, ball(0.085, 10, 7), G(s, 2.8, { scale: [1, 1, 0.6] }))
      s.r.extra.push((tt) => core.scale.setScalar(0.85 + Math.abs(Math.sin(tt * 3)) * 0.25))
      for (let i = 0; i < 5; i++) {
        const a = (i - 2) * 0.32
        s.k.add(
          t,
          cbox(0.016, 0.34, 0.12, 0.005),
          P(s, { at: [Math.sin(a) * 0.12, 0.2 + Math.cos(a) * 0.05, -0.25], rot: [0, 0, -a] }),
        )
        s.k.add(
          t,
          blk(0.006, 0.26, 0.01),
          G(s, 1.5, { at: [Math.sin(a) * 0.12, 0.2 + Math.cos(a) * 0.05, -0.31], rot: [0, 0, -a] }),
        )
      }
      s.k.add(
        t,
        hose(
          [
            [0.08, 0.02, 0.17],
            [0.22, 0.05, 0.12],
            [0.3, 0.14, 0.0],
          ],
          0.014,
          8,
          4,
        ),
        { tile: 'rubber', color: '#2a2030' },
      )
      s.k.add(s.r.foreR, cbox(0.055, 0.075, 0.22, 0.012), W(P(s, { at: [0, 0.03, 0.06] })))
      s.k.add(
        s.r.foreR,
        lathe(
          [
            [0.02, -0.03],
            [0.03, 0.0],
            [0.025, 0.03],
          ],
          s.k.seg(8),
        ),
        G(s, 3, W({ at: [0, 0.03, 0.18], rot: [Math.PI / 2, 0, 0] })),
      )
      s.r.muzzle.position.copy(gunPoint(0.21, 0.03))
    },
  },
}

/** 頭盔：外殼＋面罩（依型式）＋發光；全罩式把臉、頭髮都拿掉（藏在殼裡也省三角形）*/
function suitHelmet(s: S, type: Helmet): void {
  if (type === 'none') return
  const k = s.k
  const h = s.r.head
  k.drop('hair', 'hat', 'glasses', 'face', 'helmet', 'skull')
  const shell = (grow: number, color = s.plate, tile: Tile = 'paint') =>
    k.add(
      h,
      lathe(
        [
          [0.13 + grow, -0.15],
          [0.16 + grow, -0.1],
          [0.172 + grow, -0.02],
          [0.17 + grow, 0.06],
          [0.15 + grow, 0.12],
          [0.105 + grow, 0.165],
          [0.05, 0.188 + grow],
          [0, 0.192 + grow],
        ],
        k.seg(12),
        0.96,
        1.05,
      ),
      { tile, color, at: [0, 0.0, -0.005] },
    )
  const visorBand = (
    y0: number,
    y1: number,
    r: number,
    color: string,
    tile: Tile,
    ps = -1.1,
    pl = 2.2,
    o: PartOpts = {},
  ) =>
    k.add(
      h,
      lathe(
        [
          [r - 0.004, y0],
          [r + 0.004, (y0 + y1) / 2],
          [r - 0.004, y1],
        ],
        k.seg(10),
        0.96,
        1.05,
        ps,
        pl,
      ),
      { tile, color, ...o },
    )
  switch (type) {
    case 'dome':
      shell(0)
      visorBand(-0.08, 0.06, 0.176, '#1a2430', 'glass', -1.05, 2.1)
      visorBand(0.064, 0.074, 0.178, s.glow, 'paint', -1.0, 2.0, { slot: 'glow', glow: 1.8 })
      break
    case 'visor':
      shell(0)
      visorBand(-0.03, 0.02, 0.176, s.glow, 'paint', -1.0, 2.0, { slot: 'glow', glow: 2.4 })
      k.add(h, cbox(0.2, 0.06, 0.06, 0.018), { tile: 'plate', color: s.plate, at: [0, -0.1, 0.13], wear: 1 })
      break
    case 'mask':
      // 無臉的光滑黑面具（吸光）
      shell(0, '#0c0b0f', 'glass')
      visorBand(0.0, 0.012, 0.177, s.glow, 'paint', -0.6, 1.2, { slot: 'glow', glow: 1.6 })
      break
    case 'gas':
      // 防毒面具：圓形雙目鏡（發光）＋兩側濾罐
      shell(0)
      for (const x of [-1, 1]) {
        k.add(h, tube(0.038, 0.038, 0.03, 10), {
          tile: 'metal',
          color: '#2a2a2a',
          at: [x * 0.058, 0.01, 0.165],
          rot: [Math.PI / 2, 0, x * 0.0],
        })
        k.add(h, tube(0.03, 0.03, 0.006, 10), {
          slot: 'glow',
          color: s.glow,
          glow: 2.2,
          at: [x * 0.058, 0.01, 0.182],
          rot: [Math.PI / 2, 0, 0],
        })
        k.add(h, tube(0.04, 0.04, 0.07, 10), {
          tile: 'grille',
          color: '#5a5a52',
          at: [x * 0.1, -0.1, 0.12],
          rot: [Math.PI / 2 - 0.4, 0, -x * 0.7],
        })
      }
      k.add(h, cbox(0.08, 0.06, 0.06, 0.02), { tile: 'rubber', color: '#262626', at: [0, -0.08, 0.16] })
      break
    case 'heavy':
      // 重型頭盔：更大的殼＋護面格柵＋頂上的護脊
      shell(0.014)
      k.add(h, cbox(0.18, 0.1, 0.04, 0.012), { tile: 'grille', color: '#3a3a3a', at: [0, -0.06, 0.18] })
      visorBand(0.0, 0.035, 0.19, s.glow, 'paint', -0.9, 1.8, { slot: 'glow', glow: 2.2 })
      k.add(h, cbox(0.05, 0.05, 0.3, 0.015), { tile: 'plate', color: s.plate, at: [0, 0.2, -0.01], wear: 1 })
      break
  }
}

/** 肩甲（玩家色）：依型式大小不同；重型是兩層 */
function suitShoulders(s: S, type: Shoulder): void {
  const k = s.k
  k.drop('pauldron')
  const big = type === 'heavy' ? 1.28 : type === 'slim' ? 0.96 : 1.1
  const dome = PAULDRON(k)
  for (const side of [-1, 1]) {
    const x = side * (0.29 + (big - 1) * 0.1)
    const y = 0.23 + (big - 1) * 0.05
    k.add(s.r.torso, dome, {
      slot: 'pc',
      at: [x, y, 0],
      rot: [0, 0, -side * 0.38],
      scale: [big, big * 1.1, big],
      wear: 0.6,
    })
    // 重型：下面再一層甲片
    if (type === 'heavy')
      k.add(s.r.torso, cbox(0.07, 0.03, 0.24, 0.012), {
        slot: 'pc',
        at: [side * 0.4, 0.15, 0],
        rot: [0, 0, -side * 0.95],
        wear: 0.8,
      })
    k.add(
      s.r.torso,
      lathe(
        [
          [0.118, -0.05],
          [0.124, -0.036],
          [0.122, -0.028],
        ],
        k.seg(10),
        1,
        1.14,
      ),
      { tile: 'rubber', color: '#1a1c20', at: [x, y, 0], rot: [0, 0, -side * 0.38], scale: big, small: true },
    )
    k.add(s.r.torso, blk(0.012, 0.012, 0.18 * big), {
      slot: 'glow',
      color: s.glow,
      glow: 1.6,
      at: [x + side * 0.1 * big * 0.9, y - 0.035, 0],
      rot: [0, 0, -side * 0.38],
      small: true,
    })
  }
}

/** 共用的裝甲基底：連身內襯、胸甲、護腿、護臂、重靴 */
function suitBase(s: S, look: SuitLook): void {
  const k = s.k
  const r = s.r
  // 內襯：四肢與軀幹換成防護服的連身衣
  for (const p of k.parts) {
    const tag = p.o.tag
    if (tag === 'legs' || tag === 'top') p.o = { ...p.o, color: look.under, tile: look.underTile ?? 'canvas' }
    else if (tag === 'hand' || tag === 'cuff') p.o = { ...p.o, color: '#24272c', tile: 'rubber' }
  }
  k.drop('boot', 'kneepad', 'pocket', 'pouch', 'trim', 'collar')
  const pt = look.plateTile ?? 'plate'
  // 胸甲（比軀幹大一圈的硬殼）＋腹部分節
  if (look.chest !== false)
    k.add(
      r.torso,
      lathe(
        [
          [0.185, -0.1],
          [0.205, -0.03],
          [0.226, 0.07],
          [0.232, 0.16],
          [0.208, 0.22],
          [0.16, 0.255],
        ],
        k.seg(12),
        1,
        0.72,
      ),
      { tile: pt, color: s.plate },
    )
  band(k, r.torso, 0.18, -0.2, -0.13, look.under, 'quilt', { small: true }, 0.7)
  // 胸前發光條
  k.add(
    r.torso,
    lathe(
      [
        [0.233, 0.11],
        [0.235, 0.12],
        [0.233, 0.13],
      ],
      k.seg(10),
      1,
      0.73,
      -0.8,
      1.6,
    ),
    { slot: 'glow', color: s.glow, glow: 1.8 },
  )
  // 頸圈
  k.add(
    r.torso,
    lathe(
      [
        [0.09, 0.25],
        [0.105, 0.27],
        [0.1, 0.3],
      ],
      k.seg(10),
      1,
      0.9,
    ),
    { tile: 'metal', color: '#5a6068' },
  )
  for (const side of [-1, 1]) {
    const thigh = side < 0 ? r.legL : r.legR
    const knee = side < 0 ? r.shinL : r.shinR
    const fore = side < 0 ? r.foreL : r.foreR
    const arm = side < 0 ? r.armL : r.armR
    k.add(thigh, cbox(0.14, 0.22, 0.07, 0.02), {
      tile: pt,
      color: s.plate,
      at: [0, -0.2, 0.065],
      rot: [0.05, 0, 0],
      wear: 1,
    })
    k.add(
      knee,
      lathe(
        [
          [0.074, -0.32],
          [0.086, -0.2],
          [0.087, -0.06],
          [0.074, 0.03],
        ],
        k.seg(9),
        1,
        1,
        -1.3,
        2.6,
      ),
      { tile: pt, color: s.plate },
    )
    k.add(knee, cbox(0.11, 0.1, 0.05, 0.02), {
      tile: pt,
      color: s.plate,
      at: [0, 0.0, 0.07],
      rot: [-0.15, 0, 0],
      wear: 1,
    })
    k.add(knee, bootGeo(true), {
      tile: 'rubber',
      color: '#2a2d32',
      at: [0, -0.49, 0.0],
      shade: (_x, y, z) => (y < 0.03 ? 0.4 : z > 0.12 && y < 0.09 ? 1.2 : 1),
    })
    band(k, knee, 0.078, -0.33, -0.28, s.plate, pt, { small: true })
    k.add(
      fore,
      lathe(
        [
          [0.064, -0.22],
          [0.074, -0.15],
          [0.078, -0.06],
          [0.068, -0.02],
        ],
        k.seg(9),
      ),
      { tile: pt, color: s.plate },
    )
    band(k, arm, 0.093, -0.2, -0.12, s.plate, pt, { small: true })
  }
}

/** 套上防護服：連身內襯、裝甲、玩家色肩甲、頭盔、武器、專屬大剪影零件 */
export function attachSuit(r: Rig, suitId: string, playerColor: string): void {
  const look = LOOKS[suitId]
  const rb = rigBuild(r)
  if (!look || !rb) return
  const k = rb.kit
  const s: S = {
    r,
    k,
    plate: look.plate,
    glow: look.glow,
    live: (parent, at = [0, 0, 0]) => {
      const g = new THREE.Group()
      g.position.set(...at)
      parent.add(g)
      return g
    },
  }
  // 職業的道具、帽子、背包、槍都收起來（白袍裝例外：保留職業的頭與背包）
  if (look.helmet === 'none') k.drop('coat', 'prop', 'vest')
  else {
    k.drop('coat', 'pack', 'gun', 'prop', 'vest', 'belt')
    suitBase(s, look)
    suitShoulders(s, look.shoulders)
    suitHelmet(s, look.helmet)
  }
  // 槍口預設回到右手（rocket、service 會改掛到軀幹）
  r.foreR.add(r.muzzle)
  look.build(s)
  if (look.helmet === 'none' && !k.has('gun')) {
    // 白袍：沒有專屬武器，手上拿一支小手槍
    k.add(
      r.foreR,
      cbox(0.042, 0.07, 0.18, 0.01),
      W({ tile: 'paint', color: '#34383e', at: [0, 0.03, 0.065], wear: 1, tag: 'gun' }),
    )
    k.add(
      r.foreR,
      cbox(0.034, 0.085, 0.042, 0.008),
      W({ tile: 'rubber', color: '#1e2024', at: [0, -0.03, -0.005], rot: [0.3, 0, 0], tag: 'gun' }),
    )
    r.muzzle.position.copy(gunPoint(0.17, 0.03))
  }
  rb.key = `${rb.key}|${suitId}`
  rb.twoHanded = !!look.twoHanded
  // 職業的手持道具（拖把）已經收掉
  rb.steadyL = false
  k.finalize(rb.key, playerColor)
  rb.pc = playerColor
}

export const SUIT_IDS = Object.keys(LOOKS)
