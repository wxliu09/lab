// 活體庫號的標本（與其他站的同種生物）：竄蟲／竄蟲監工、蛞蝓仔／蛞蝓長老、吼顎獸、失敗實驗體一族、異常體、未知存在。
// 正面朝 local +Z、腳底在 y=0。全部用 boneKit 合併成每種材質一個 SkinnedMesh（一隻 3–6 個 draw call）。
// 配色避開陣營色（異形紫青、變種紅琥珀、仿生琥珀白），而且要壓得過隔間的綠色燈光：暖橘、鏽褐、玫瑰、石板藍。
// 外觀只看 model id 與快照上公開的狀態（st），不碰任何隱藏身分。
import * as THREE from 'three'
import type { UnitDef } from '../../shared/content/types'
import type { SnapEntity } from '../../shared/protocol/messages'
import { box, cyl, rbox, torus } from '../batch'
import { Mat } from '../materials'
import { regModel, type ModelView } from './registry'
import { BoneKit, base, pose, pulse, shift, view } from './boneKit'
import { chitin, dome, flesh, hornGeo, liveGlow, lumpGeo, metalPart, rubberPart, smooth, spikeGeo, stepOf } from './creatureKit'

// ───── 共用的腿 ─────

/** 側向展開的節肢腿（膝蓋高於身體）：hipH = 髖關節離地高度 */
interface SLeg {
  hip: THREE.Bone
  femur: THREE.Bone
}
function sLeg(k: BoneKit, parent: THREE.Bone, slot: string, x: number, y: number, z: number, yaw: number, l1: number, r: number, up: number, reach: number, hipH: number, tip?: string): SLeg {
  const hip = k.bone(parent, x, y, z, 0, yaw, 0)
  const femur = k.bone(hip, 0, 0, 0, 0, 0, up)
  k.ell(femur, slot, l1 / 2, 0, 0, l1 * 0.56, r, r, 5, 4)
  const kh = hipH + l1 * Math.sin(up)
  const down = Math.atan2(kh, reach)
  const l2 = Math.hypot(kh, reach)
  const knee = k.bone(femur, l1, 0, 0, 0, 0, -up - down)
  k.ell(knee, slot, l2 * 0.45, 0, 0, l2 * 0.5, r * 0.78, r * 0.78, 5, 4)
  const sl = Math.min(0.2, l2 * 0.3)
  if (tip) k.part(knee, tip, spikeGeo(r * 0.62, sl, 4), l2 - sl, 0, 0, 1, 1, 1, 0, 0, -Math.PI / 2)
  return { hip, femur }
}
function animSLeg(l: SLeg, sw: number, lift: number, k: number, amp = 0.3): void {
  pose(l.hip, 0, sw * amp * k, 0)
  pose(l.femur, 0, 0, lift * 0.42 * k)
}

/** 垂直的兩節腿：hip 在 (x,y,z)、離地 hipH；a1 大腿角（正 = 往後），a12 小腿的絕對角；小腿長自動算到碰地 */
export interface QLeg {
  hip: THREE.Bone
  knee: THREE.Bone
  foot: THREE.Bone
  front: boolean
  l2: number
}
export function qLeg(k: BoneKit, parent: THREE.Bone, slot: string, x: number, y: number, z: number, hipH: number, l1: number, a1: number, a12: number, r1: number, r2: number, front: boolean, ws = 8, hs = 5): QLeg {
  const hip = k.bone(parent, x, y, z, a1)
  k.ell(hip, slot, 0, -l1 / 2, 0, r1, l1 * 0.6, r1, ws, hs)
  const l2 = Math.max(0.06, (hipH - l1 * Math.cos(a1)) / Math.cos(a12))
  const knee = k.bone(hip, 0, -l1, 0, a12 - a1)
  k.ell(knee, slot, 0, -l2 / 2, 0, r2, l2 * 0.6, r2, ws, hs)
  const foot = k.bone(knee, 0, -l2, 0, -a12)
  return { hip, knee, foot, front, l2 }
}
export function animQLeg(l: QLeg, sw: number, lift: number, k: number, amp = 0.45, bend = 0.7): void {
  pose(l.hip, -sw * amp * k)
  pose(l.knee, (l.front ? -1 : 1) * lift * bend * k)
  pose(l.foot, sw * amp * k * 0.5)
}
/** 死亡時把腿收起來 */
export function foldQLeg(l: QLeg, d: number): void {
  pose(l.hip, (l.front ? -0.9 : 0.9) * d)
  pose(l.knee, (l.front ? 1.2 : -1.2) * d)
}

/** 側倒（樞紐在腳底、身體留在原地）*/
export function toppleBone(b: THREE.Bone, d: number, side: number, h: number): void {
  const a = side * d * 1.35
  const r = b.userData.r0 as THREE.Euler
  b.rotation.z = r.z + a
  shift(b, Math.sin(a) * h * 0.72, -h * 0.5 * (1 - Math.cos(a)) + d * 0.08, 0)
}

const HALF = Math.PI / 2

// ═════════════ 竄蟲／竄蟲監工 ═════════════
// 低矮、寬、多刺的節肢掠食者：三片重疊的鏽褐背甲、往前的一對鐮刀顎、四顆橘紅單眼、捲起的螫尾。
// 監工：大一號、身體前段抬高、背上一排黑甲與脊刺、頭上扇形冠刺（琥珀發光），遠看是「帶頭的那隻」。

function skitter(over: boolean) {
  return (def: UnitDef | undefined, s: SnapEntity): ModelView => {
    const b = base(def, s, 11, over ? 1.25 : 1.5)
    const k = new BoneKit(over ? 'skitterOverseer' : 'skitter', b.root)
    const H = over ? 0.38 : 0.34
    const body = k.bone(null, 0, H, 0, over ? -0.14 : -0.04)
    // 胸節＋三片背甲
    k.ell(body, 'skin', 0, 0, 0.04, 0.19, 0.11, 0.25, 8, 6)
    for (let i = 0; i < 3; i++) k.part(body, 'shell', dome(1, 10, 4, Math.PI * 0.42), 0, 0.045 - i * 0.008, 0.2 - i * 0.13, 0.235 - i * 0.012, 0.13, 0.16, -0.28)
    // 腹節（往後上翹）＋兩片腹甲
    const abd = k.bone(body, 0, 0.02, -0.2, -0.12)
    k.ell(abd, 'skin', 0, 0, -0.17, 0.16, 0.12, 0.22, 8, 6)
    for (let i = 0; i < 2; i++) k.part(abd, 'shell', dome(1, 10, 4, Math.PI * 0.42), 0, 0.05, -0.06 - i * 0.15, 0.19 - i * 0.03, 0.11, 0.14, -0.25)
    // 螫尾：兩節往上捲＋發光的螫針
    const tail = k.bone(abd, 0, 0.06, -0.36, -0.95)
    k.ell(tail, 'skin', 0, 0, -0.08, 0.065, 0.06, 0.11, 8, 5)
    k.part(tail, 'shell', dome(1, 6, 3, Math.PI * 0.45), 0, 0.03, -0.08, 0.07, 0.05, 0.1, -0.2)
    const tail2 = k.bone(tail, 0, 0, -0.16, -0.75)
    k.ell(tail2, 'skin', 0, 0, -0.07, 0.05, 0.045, 0.09, 8, 5)
    k.part(tail2, 'glow', spikeGeo(0.035, 0.15, 5), 0, 0, -0.13, 1, 1, 1, -HALF)
    // 頭：楔形頭殼、四顆單眼、一對鐮刀顎
    const head = k.bone(body, 0, 0.01, 0.3)
    k.ell(head, 'skin', 0, 0, 0.06, 0.14, 0.085, 0.13, 8, 5)
    k.part(head, 'shell', dome(1, 10, 4, Math.PI * 0.45), 0, 0.02, 0.05, 0.155, 0.1, 0.15, -0.22)
    for (const sd of [-1, 1]) {
      k.ell(head, 'glow', sd * 0.045, 0.06, 0.155, 0.03, 0.026, 0.026, 6, 4)
      k.ell(head, 'glow', sd * 0.095, 0.045, 0.12, 0.022, 0.02, 0.02, 5, 3)
    }
    const mand: THREE.Bone[] = []
    for (const sd of [-1, 1]) {
      const m = k.bone(head, sd * 0.07, -0.03, 0.15)
      k.ell(m, 'dark', sd * 0.015, 0, 0.04, 0.035, 0.032, 0.07, 5, 3, 0, sd * 0.35, 0)
      k.part(m, 'dark', hornGeo(0.22, 0.03, 0.75, 5, 4), sd * 0.03, 0, 0.06, 1, 1, 1, 0, -sd * HALF, -sd * HALF)
      mand.push(m)
    }
    // 六條腿（前長後短、前腳往前伸）
    const legs: SLeg[] = []
    const yaws = [0.62, 0.05, -0.5]
    for (const sd of [-1, 1])
      yaws.forEach((y, i) => {
        const yaw = sd > 0 ? -y : Math.PI + y
        legs.push(sLeg(k, body, 'dark', sd * 0.15, -0.01, 0.15 - i * 0.13, yaw, i === 0 ? 0.32 : 0.29, over ? 0.036 : 0.03, 0.85, i === 0 ? 0.3 : 0.24, H, 'shell'))
      })
    const glowCol = '#ff5a1a'
    const gl = liveGlow(glowCol, 3)
    const mats: Record<string, THREE.Material> = {
      skin: flesh('#4a2616', '#ff8a3a', 0.32, 0.4),
      shell: chitin('#7a3e1c', '#ffb46b', 0.4, 0.5),
      dark: chitin('#2a1a12', '#ff8a3a', 0.3, 0.35),
      glow: gl,
    }
    let crest: THREE.Bone | null = null
    let gl2: THREE.MeshStandardMaterial | null = null
    if (over) {
      // 監工：背上一排黑甲＋脊刺、兩顆琥珀色背囊、肩甲、頭上的扇形冠刺
      for (let i = 0; i < 3; i++) k.part(body, 'armor', dome(1, 10, 4, Math.PI * 0.38), 0, 0.1 - i * 0.01, 0.17 - i * 0.13, 0.17, 0.09, 0.12, -0.32)
      for (let i = 0; i < 5; i++) k.part(body, 'armor', spikeGeo(0.035, 0.2 - Math.abs(i - 1.5) * 0.03, 5), 0, 0.15, 0.22 - i * 0.1, 1, 1, 1, -0.55)
      for (let i = 0; i < 3; i++) k.part(abd, 'armor', spikeGeo(0.028, 0.13, 5), 0, 0.13, -0.04 - i * 0.12, 1, 1, 1, -0.7)
      for (const sd of [-1, 1]) {
        k.ell(body, 'glow2', sd * 0.13, 0.08, -0.05, 0.05, 0.035, 0.07, 6, 4)
        k.part(body, 'armor', dome(1, 8, 4, Math.PI * 0.45), sd * 0.17, 0.05, 0.16, 0.1, 0.07, 0.11, 0, 0, -sd * 0.5)
      }
      crest = k.bone(head, 0, 0.07, 0.02)
      for (let i = 0; i < 3; i++) {
        const a = (i - 1) * 0.45
        k.part(crest, 'armor', spikeGeo(0.03, 0.26, 5), Math.sin(a) * 0.03, 0, 0, 1, 1, 1, -0.45, 0, -a)
        k.ell(crest, 'glow2', Math.sin(a) * 0.29, Math.cos(a) * 0.234, -Math.cos(a) * 0.113, 0.024, 0.024, 0.024, 6, 4)
      }
      gl2 = liveGlow('#ffc23d', 2.6)
      mats.armor = chitin('#211c1a', '#ffc23d', 0.55, 0.5)
      mats.glow2 = gl2
    }
    k.finish(mats)
    const ph = b.L.ph
    return view(b, over ? 1.3 : 1, over ? 0.95 : 0.65, (t) => {
      const L = b.L
      const mv = L.move
      // 三腳交替步態：左前＋右中＋左後 一組，另一組反相
      legs.forEach((l, j) => {
        const i = j % 3
        const grp = (i + (j < 3 ? 0 : 1)) % 2
        const [sw, lift] = stepOf(L.walk, grp * 0.5)
        animSLeg(l, sw, lift, mv, 0.34)
      })
      const br = L.breathe(t, 2.2)
      const st = L.strike * L.atk
      shift(body, 0, Math.abs(Math.sin(L.walk * 2)) * 0.018 * mv + (1 - mv) * br * 0.01 - Math.max(0, st) * 0.03, Math.max(0, st) * 0.08)
      pose(body, Math.max(0, st) * 0.16 + Math.min(0, st) * -0.18, 0, Math.sin(L.walk) * 0.04 * mv)
      abd.scale.setScalar(1 + br * 0.035)
      // 頭：待機時抽動張望；攻擊時壓低前刺
      const twitch = Math.sin(t * 0.9 + ph) * 0.28 + (Math.sin(t * 7.3 + ph * 3) > 0.92 ? 0.12 : 0)
      pose(head, Math.max(0, st) * 0.25, twitch * (1 - mv) * (1 - L.atk), 0)
      // 顎：平時細碎開合，攻擊蓄力張開、出手時夾合
      const open = 0.1 + Math.sin(t * 11 + ph) * 0.04 * (1 - mv) + L.atk * (st < 0 ? 0.55 : 0.5 * (1 - Math.max(0, st)))
      pose(mand[0], 0, -open, 0)
      pose(mand[1], 0, open, 0)
      // 螫尾：待機輕擺、攻擊時往前刺
      pose(tail, Math.sin(t * 2 + ph) * 0.08 - Math.max(0, st) * 0.45, Math.sin(t * 1.3 + ph) * 0.12, 0)
      pose(tail2, Math.sin(t * 2 - 0.6 + ph) * 0.1 - Math.max(0, st) * 0.35)
      if (crest) pose(crest, Math.sin(t * 1.7 + ph) * 0.06 - L.atk * 0.25)
      pulse(gl, 3, t, L, 2.6)
      if (gl2) pulse(gl2, 2.6, t, L, 1.4)
      if (L.dead > 0) {
        // 死蟲：翻肚、六腳朝天縮起
        const d = L.dead
        for (const l of legs) pose(l.femur, 0, 0, d * 1.1)
        pose(body, 0, 0, d * 2.9)
        shift(body, 0, -d * 0.2, 0)
      }
    })
  }
}

regModel('creature.skitter', skitter(false))
regModel('creature.skitterOverseer', skitter(true))

// ═════════════ 蛞蝓仔／蛞蝓長老 ═════════════
// 濕潤的玫瑰色軟體、底下一圈荷葉邊的腹足、背上兩排桃紅色發光斑點、一對頂著發光眼球的眼柄。蠕動前進（體節依序伸縮）。
// 長老：大一號、暗紫老皮、背上一個帶琥珀色紋路的螺旋殼、藤壺般的硬疙瘩、垂下的長鬚、第三根眼柄。

/** 平旋螺殼（對數螺線的錐管，捲軸沿 x）：蛞蝓長老背上的蝸牛殼。共用 */
let snailGeo: THREE.BufferGeometry | null = null
function snailShellGeo(): THREE.BufferGeometry {
  if (snailGeo) return snailGeo
  const N = 40
  const R = 8
  const th0 = 0.6
  const th1 = 3.3 * Math.PI
  const pts: THREE.Vector3[] = []
  for (let i = 0; i <= N; i++) {
    const th = th0 + ((th1 - th0) * i) / N
    const r = 0.02 * Math.exp(0.2 * th)
    // 每圈往 +x 退一點（不是完全平的盤，比較像真的蝸牛殼）
    pts.push(new THREE.Vector3(0.05 * (1 - i / N), r * Math.sin(th), r * Math.cos(th)))
  }
  const curve = new THREE.CatmullRomCurve3(pts)
  const g = new THREE.TubeGeometry(curve, N, 1, R, false)
  const pos = g.attributes.position
  const nrm = g.attributes.normal
  const P = new THREE.Vector3()
  for (let i = 0; i <= N; i++) {
    const u = i / N
    curve.getPointAt(u, P)
    const th = th0 + (th1 - th0) * u
    const rr = 0.02 * Math.exp(0.2 * th) * 0.62 * (i === N ? 0.92 : 1)
    for (let j = 0; j <= R; j++) {
      const k = i * (R + 1) + j
      pos.setXYZ(k, P.x + nrm.getX(k) * rr, P.y + nrm.getY(k) * rr, P.z + nrm.getZ(k) * rr)
    }
  }
  g.computeVertexNormals()
  snailGeo = g
  return g
}

function slug(elder: boolean) {
  return (def: UnitDef | undefined, s: SnapEntity): ModelView => {
    const b = base(def, s, 5, 1.2)
    const k = new BoneKit(elder ? 'elderSlug' : 'slugling', b.root)
    const root = k.bone(null)
    // 腹足：荷葉邊的扁平裙（不動）
    k.part(root, 'belly', lumpGeo(1, 7, 0.14, 14, 6), 0, 0.035, 0, 0.18, 0.05, 0.38)
    // 四個體節：尾→頭（互為兄弟，各自伸縮，做出蠕動波）
    const segs: THREE.Bone[] = []
    const SZ: [number, number, number, number, number][] = [
      // z, y, rx, ry, rz（彼此重疊很多，看起來是一條連續的軟體，不是一串珠子）
      [-0.2, 0.08, 0.105, 0.08, 0.19],
      [-0.05, 0.11, 0.14, 0.115, 0.2],
      [0.09, 0.125, 0.135, 0.125, 0.17],
    ]
    for (const [z, y, rx, ry, rz] of SZ) {
      const g = k.bone(root, 0, 0, z)
      k.ell(g, 'skin', 0, y, 0, rx, ry, rz)
      // 背脊一道略深的稜線與兩排發光斑點
      k.ell(g, 'dark', 0, y + ry * 0.72, 0, rx * 0.3, ry * 0.32, rz * 0.85, 8, 5)
      for (const sd of [-1, 1]) k.ell(g, 'glow', sd * rx * 0.55, y + ry * 0.7, rz * 0.1, 0.022, 0.014, 0.03, 6, 4)
      segs.push(g)
    }
    const head = k.bone(root, 0, 0.1, 0.22)
    k.ell(head, 'skin', 0, 0.02, 0.02, 0.115, 0.1, 0.11)
    // 嘴邊的兩根觸鬚
    for (const sd of [-1, 1]) k.part(head, 'skin', spikeGeo(0.022, 0.1, 5), sd * 0.05, -0.04, 0.09, 1, 1, 1, HALF + 0.35, 0, -sd * 0.3)
    // 眼柄：兩節，頂端是發光眼球（長老多一根中間的短眼柄）
    const stalks: { a: THREE.Bone; b: THREE.Bone; sd: number }[] = []
    const stalkAt: [number, number][] = elder ? [[-1, 0.14], [1, 0.14], [0, 0.1]] : [[-1, 0.13], [1, 0.13]]
    for (const [sd, len] of stalkAt) {
      const a = k.bone(head, sd * 0.045, 0.09, 0.02, 0.25, 0, -sd * 0.28)
      k.ell(a, 'skin', 0, len * 0.5, 0, 0.018, len * 0.55, 0.018, 6, 4)
      const tip = k.bone(a, 0, len, 0, 0.18)
      k.ell(tip, 'skin', 0, 0.035, 0, 0.022, 0.05, 0.022, 6, 4)
      k.ell(tip, 'glow', 0, 0.07, 0.006, 0.033, 0.033, 0.033, 8, 6)
      stalks.push({ a, b: tip, sd })
    }
    const mats: Record<string, THREE.Material> = {}
    const whisk: THREE.Bone[] = []
    let gl2: THREE.MeshStandardMaterial | null = null
    if (elder) {
      // 蝸牛殼：側立的平旋螺殼（往一側斜 0.5，俯視也看得到捲紋）；沿著螺紋三道琥珀色光紋
      const shell = k.bone(segs[1], 0, 0.27, -0.03, 0, 0, 0.5)
      k.part(shell, 'shell', snailShellGeo(), 0, 0, 0)
      for (let i = 0; i < 4; i++) {
        const th = 5.2 + i * 1.3
        const r = 0.02 * Math.exp(0.2 * th) * 1.56
        const x = 0.05 * (1 - (th - 0.6) / (3.3 * Math.PI - 0.6))
        k.ell(shell, 'glow2', x, r * Math.sin(th), r * Math.cos(th), 0.04, 0.012, 0.028, 6, 4, HALF - th, 0, 0)
      }
      // 藤壺硬疙瘩
      for (let i = 0; i < 5; i++) {
        const g = segs[i % 2 === 0 ? 0 : 2]
        const a = i * 1.7
        k.part(g, 'shell', lumpGeo(1, 40 + i, 0.3, 8, 5), Math.sin(a) * 0.1, 0.1 + (i % 2) * 0.04, Math.cos(a) * 0.08, 0.035, 0.025, 0.035)
      }
      // 垂下的長鬚
      for (const sd of [-1, 1]) {
        const w = k.bone(head, sd * 0.07, -0.02, 0.08, 0.4, 0, -sd * 0.4)
        k.part(w, 'skin', spikeGeo(0.014, 0.24, 4), 0, 0, 0, 1, 1, 1, HALF + 0.2)
        whisk.push(w)
      }
      gl2 = liveGlow('#ffc23d', 2.2)
      mats.shell = smooth('#5c7a6e', '#ffd27a', 0.45, 0.4)
      mats.glow2 = gl2
    }
    // 蛞蝓仔的光用桃紅：隔間是綠光，青色的斑點會跟環境光混在一起
    const gl = liveGlow(elder ? '#ffd27a' : '#ff4aa8', elder ? 2 : 2.6)
    Object.assign(mats, {
      // 邊光用自己的玫瑰色（自發光，不受隔間綠光影響）；光澤壓低一點，免得 clearcoat 反射頂燈變成一片白
      skin: elder ? flesh('#7a4a72', '#ffc23d', 0.3, 0.4) : flesh('#b8487a', '#ff7ab6', 0.34, 0.5),
      dark: elder ? flesh('#3a2434', '#ffc23d', 0.3, 0.35) : flesh('#6a1e4a', '#ff7ab6', 0.36, 0.45),
      belly: elder ? flesh('#b89090', '#ffc23d', 0.35, 0.25) : flesh('#e8b4c4', '#ff7ab6', 0.4, 0.35),
      glow: gl,
    })
    k.finish(mats)
    const ph = b.L.ph
    return view(b, elder ? 1.6 : 1.3, elder ? 0.62 : 0.5, (t) => {
      const L = b.L
      const mv = L.move
      const br = L.breathe(t, 1.3)
      // 蠕動：一道從尾往頭傳的伸縮波
      segs.forEach((g, i) => {
        const w = Math.sin(L.walk * 1.3 - i * 1.2)
        g.scale.set(1 + br * 0.03 - w * 0.06 * mv, 1 + br * 0.04 - w * 0.1 * mv, 1 + w * 0.2 * mv)
        shift(g, 0, 0, w * 0.025 * mv)
      })
      const st = L.strike * L.atk
      // 攻擊（蛞蝓特工）：前段抬起往前撞
      shift(head, 0, Math.max(0, -st) * 0.08 + Math.sin(L.walk * 1.3 - 3.6) * 0.012 * mv, Math.max(0, st) * 0.1)
      pose(head, -Math.max(0, -st) * 0.5 + Math.max(0, st) * 0.3 + Math.sin(t * 0.8 + ph) * 0.05, Math.sin(t * 0.5 + ph) * 0.2 * (1 - mv), 0)
      pose(segs[2], -L.atk * 0.15)
      stalks.forEach((e, i) => {
        const a = t * (1.3 + i * 0.27) + ph + i * 2
        pose(e.a, Math.sin(a) * 0.18 + mv * 0.25 - L.cast * 0.3, 0, Math.cos(a * 0.8) * 0.15)
        pose(e.b, Math.sin(a + 1) * 0.25)
      })
      whisk.forEach((w, i) => pose(w, Math.sin(t * 1.1 + i * 2 + ph) * 0.15, 0, Math.sin(t * 0.9 + i) * 0.1))
      pulse(gl, elder ? 2 : 2.4, t, L, 1.6)
      if (gl2) pulse(gl2, 2.2, t, L, 0.9)
      if (L.dead > 0) {
        // 洩氣：攤平、眼柄垂下
        const d = L.dead
        for (const g of segs) g.scale.set(1 + d * 0.15, 1 - d * 0.45, 1 + d * 0.05)
        for (const e of stalks) pose(e.a, d * 1.4, 0, -e.sd * d * 0.6)
        shift(head, 0, -d * 0.06, 0)
      }
    })
  }
}

regModel('creature.slugling', slug(false))
regModel('creature.elderSlug', slug(true))

// ═════════════ 吼顎獸 ═════════════
// 重量級：駝背、以指節著地的巨大前臂、比頭還大的下顎與上翹的獠牙；吼叫（攻擊）時下顎張到底，喉囊與口腔透出熔爐般的橘光。
// 石板藍的厚皮＋骨白的背板與獠牙，在綠色隔間裡一眼就認得出輪廓。

regModel('creature.murmaw', (def, s) => {
  const b = base(def, s, 4, 0.7)
  const k = new BoneKit('murmaw', b.root)
  const root = k.bone(null)
  const spine = k.bone(root, 0, 0.95, 0)
  // 胸腔（高、寬）＋肩峰
  const chest = k.bone(spine, 0, 0.18, 0.28)
  k.ell(chest, 'hide', 0, 0, 0, 0.55, 0.48, 0.5, 12, 8)
  for (const sd of [-1, 1]) k.ell(chest, 'hide', sd * 0.36, 0.22, 0.05, 0.3, 0.28, 0.32)
  // 背上的骨板（遠看是一排白色鋸齒）
  for (let i = 0; i < 4; i++) k.part(chest, 'bone', dome(1, 10, 4, Math.PI * 0.45), 0, 0.44 - i * 0.02, 0.18 - i * 0.2, 0.2 - i * 0.02, 0.14, 0.16, -0.5)
  for (let i = 0; i < 3; i++) for (const sd of [-1, 1]) k.part(chest, 'bone', spikeGeo(0.04, 0.16, 5), sd * 0.32, 0.42, 0.05 - i * 0.15, 1, 1, 1, -0.5, 0, -sd * 0.4)
  // 骨盆（較低較窄）＋短尾
  const pelvis = k.bone(spine, 0, -0.02, -0.45)
  k.ell(pelvis, 'hide', 0, 0, 0, 0.4, 0.34, 0.38)
  k.ell(spine, 'hide', 0, 0.06, -0.12, 0.42, 0.38, 0.4)
  for (let i = 0; i < 2; i++) k.part(pelvis, 'bone', dome(1, 10, 4, Math.PI * 0.45), 0, 0.3, -0.05 - i * 0.18, 0.15, 0.1, 0.13, -0.6)
  k.part(pelvis, 'hide', spikeGeo(0.12, 0.42, 7), 0, 0.02, -0.32, 1, 1, 1, -HALF - 0.5)
  // 頭：低垂、骨質眉脊、深陷的四顆眼
  const neck = k.bone(chest, 0, 0.02, 0.42, 0.25)
  k.ell(neck, 'hide', 0, 0, 0.08, 0.27, 0.26, 0.2)
  const head = k.bone(neck, 0, -0.04, 0.22, -0.2)
  k.ell(head, 'hide', 0, 0.04, 0.08, 0.28, 0.2, 0.26)
  k.part(head, 'bone', dome(1, 10, 4, Math.PI * 0.5), 0, 0.1, 0.12, 0.27, 0.12, 0.2, -0.3)
  for (const sd of [-1, 1]) {
    k.ell(head, 'glow', sd * 0.1, 0.07, 0.3, 0.035, 0.025, 0.02, 6, 4)
    k.ell(head, 'glow', sd * 0.18, 0.06, 0.24, 0.025, 0.02, 0.018, 6, 4)
  }
  // 上顎的一排牙
  for (let i = 0; i < 4; i++) for (const sd of [-1, 1]) k.part(head, 'bone', spikeGeo(0.025, 0.09, 4), sd * (0.06 + i * 0.05), -0.06, 0.28 - i * 0.04, 1, 1, 1, Math.PI)
  // 下顎：比頭大、往前突出；喉囊；兩根上翹的獠牙
  const jaw = k.bone(head, 0, -0.06, -0.02)
  k.ell(jaw, 'hide', 0, -0.08, 0.2, 0.33, 0.12, 0.42)
  k.ell(jaw, 'glow', 0, -0.0, 0.22, 0.24, 0.05, 0.3, 8, 5)
  k.ell(jaw, 'throat', 0, -0.14, 0.02, 0.22, 0.13, 0.2, 8, 6)
  for (let i = 0; i < 5; i++) for (const sd of [-1, 1]) k.part(jaw, 'bone', spikeGeo(0.026, 0.1, 4), sd * (0.07 + i * 0.045), -0.02, 0.5 - i * 0.07)
  for (const sd of [-1, 1]) k.part(jaw, 'bone', hornGeo(0.42, 0.06, 0.55, 8, 6), sd * 0.27, -0.05, 0.36, 1, 1, 1, -0.2, 0, -sd * 0.35)
  // 前臂：粗壯、以指節著地
  const arms = [-1, 1].map((sd) => {
    const l = qLeg(k, chest, 'hide', sd * 0.5, -0.05, 0.12, 1.08, 0.5, -0.25, 0.12, 0.17, 0.19, true, 10, 6)
    k.ell(l.foot, 'dark', 0, 0.06, 0.04, 0.17, 0.12, 0.17, 8, 5)
    for (let i = 0; i < 3; i++) k.part(l.foot, 'bone', hornGeo(0.16, 0.035, 0.5, 4, 4), (i - 1) * 0.08, 0.02, 0.14, 1, 1, 1, HALF + 0.3, 0, 0)
    return l
  })
  // 後腿：短、往前蹲
  const hind = [-1, 1].map((sd) => {
    const l = qLeg(k, pelvis, 'hide', sd * 0.3, -0.12, -0.02, 0.81, 0.42, -0.5, 0.35, 0.15, 0.12, false, 10, 6)
    k.ell(l.foot, 'dark', 0, 0.03, 0.08, 0.12, 0.06, 0.18, 8, 5)
    return l
  })
  const gl = liveGlow('#ff8a2a', 2.6)
  const th = liveGlow('#ff6a1a', 1.2)
  k.finish({
    hide: flesh('#33445e', '#8fb8e8', 0.42, 0.3),
    bone: smooth('#d8ccb0', '#ffb46b', 0.5, 0.3),
    dark: chitin('#1a1e26', '#ff9a4a', 0.4, 0.3),
    glow: gl,
    throat: th,
  })
  const legs = [arms[0], arms[1], hind[0], hind[1]]
  const ph = b.L.ph
  return view(b, 1, 1.9, (t) => {
    const L = b.L
    const mv = L.move
    const off = [0, 0.5, 0.5, 0]
    legs.forEach((l, i) => {
      const [sw, lift] = stepOf(L.walk, off[i])
      animQLeg(l, sw, lift, mv, i < 2 ? 0.38 : 0.42, 0.6)
    })
    const br = L.breathe(t, 1.1)
    chest.scale.set(1 + br * 0.03, 1 + br * 0.045, 1 + br * 0.02)
    // 沉重的搖擺步：每一步身體往著地那側壓
    const st = L.strike * L.atk
    shift(spine, 0, Math.abs(Math.sin(L.walk)) * 0.05 * mv - mv * 0.03 + Math.max(0, -st) * 0.18, Math.max(0, st) * 0.22)
    pose(spine, -Math.max(0, -st) * 0.32 + Math.max(0, st) * 0.22, Math.sin(L.walk) * 0.06 * mv, Math.sin(L.walk) * 0.07 * mv)
    // 攻擊：抬起上身、雙臂高舉 → 往下砸
    for (const a of arms) {
      pose(a.hip, -Math.max(0, -st) * 1.6 - Math.max(0, st) * 0.3)
      pose(a.knee, -Math.max(0, -st) * 0.6)
    }
    // 吼叫：下顎張到底，喉囊鼓起
    const roar = Math.max(L.atk * (st < 0 ? 0.6 + -st : 1 - Math.max(0, st) * 0.4), L.cast)
    pose(jaw, roar * 0.75 + Math.sin(t * 1.7 + ph) * 0.04 * (1 - L.atk))
    pose(neck, -roar * 0.3, Math.sin(t * 0.4 + ph) * 0.3 * (1 - mv) * (1 - L.atk), 0)
    pose(head, -roar * 0.2)
    gl.emissiveIntensity = (1.2 + roar * 3.5 + br * 0.3) * (1 - L.dead)
    th.emissiveIntensity = (0.5 + br * 0.5 + roar * 2.5) * (1 - L.dead)
    if (L.dead > 0) {
      for (const l of legs) foldQLeg(l, L.dead)
      toppleBone(root, L.dead, 1, 1.0)
      pose(jaw, L.dead * 0.5)
    }
  })
})

// ═════════════ 失敗實驗體一族 ═════════════
// 同一副「實驗失敗的蒼白肉團」：手術釘、繃帶、標本吊牌、背上插著的藥劑罐（實驗室綠）。各變體換腿型與附加物：
//  失敗實驗體：三條長短不一的腿、一顆大眼，可憐地蹣跚。
//  失敗實驗體（羊）：背上一叢羊毛、羊耳、粉紅鼻子。
//  暴走實驗體：橘紅色的爆炸囊（會脈動）、罐子破了、背上骨刺、四腳衝撞。
//  暴走實驗體（巨型）：駝背的巨漢，右臂是一整塊肉棍、更多爆炸囊。
//  暴走實驗體（迅捷）：拉長的瘦身、四條細長反關節腳、頭上套著實驗室的金屬束具。
//  實驗生物（實驗袍召喚的 monstrosity）：暴走體的骨架，但戴著青色的控制項圈、囊是青色的（受控）。

type FailKind = 'failed' | 'sheep' | 'hostile' | 'brute' | 'swift' | 'pet'

function failedModel(kind: FailKind) {
  return (def: UnitDef | undefined, s: SnapEntity): ModelView => {
    const angry = kind === 'hostile' || kind === 'brute' || kind === 'pet'
    const swift = kind === 'swift'
    const brute = kind === 'brute'
    const b = base(def, s, swift ? 10 : brute ? 4.5 : angry ? 7 : 5, swift ? 1.6 : 1.1)
    const k = new BoneKit('failed.' + kind, b.root)
    const root = k.bone(null)
    const H = swift ? 0.62 : brute ? 0.82 : 0.55
    // 髖（不俯仰，腿掛在這裡才會踩在地上）→ 身體（巨型駝背往前傾）
    const hips = k.bone(root, 0, H, 0)
    const body = k.bone(hips, 0, 0, 0, brute ? 0.35 : swift ? 0.1 : 0)
    const RB: [number, number, number] = swift ? [0.2, 0.18, 0.46] : brute ? [0.46, 0.44, 0.4] : [0.36, 0.3, 0.4]
    // 肉團身體：不規則團塊＋另一團歪掉的副瘤
    if (swift) {
      k.part(body, 'skin', lumpGeo(1, 11, 0.16, 12, 8), 0, 0, 0, ...RB)
      for (let i = 0; i < 5; i++) k.part(body, 'bone', spikeGeo(0.03, 0.12, 4), 0, 0.15, 0.25 - i * 0.12, 1, 1, 1, -0.6)
    } else {
      k.part(body, 'skin', lumpGeo(1, brute ? 17 : 3, 0.2, 14, 9), 0, 0.02, 0, ...RB)
      k.part(body, 'skin', lumpGeo(1, 9, 0.25, 10, 6), -0.17, 0.12, -0.12, 0.18, 0.15, 0.17)
    }
    // 紗布貼片（交叉的膠帶）與手術釘
    for (const sd of [-1, 1]) {
      const gx = sd * RB[0] * 0.9
      k.ell(body, 'cloth', gx, RB[1] * 0.15, sd * 0.06, 0.02, RB[1] * 0.32, RB[2] * 0.26, 6, 4, 0, 0, sd * -0.25)
      for (const a of [-0.7, 0.7]) k.part(body, 'stitch', box(0.012, RB[1] * 0.7, 0.025), gx + sd * 0.02, RB[1] * 0.15, sd * 0.06, 1, 1, 1, a, 0, sd * -0.25)
    }
    for (let i = 0; i < 4; i++) k.part(body, 'metal', box(0.012, 0.012, 0.09), 0.06 + i * 0.045, (swift ? 0.17 : 0.27) - i * 0.03, 0.12 + i * 0.03, 1, 1, 1, 0.4, 0.3, 0)
    k.part(body, 'stitch', box(0.2, 0.012, 0.012), 0.08, swift ? 0.17 : 0.27, 0.15, 1, 1, 1, 0.4, 0.3, -0.3)
    // 標本吊牌（警示黃）
    k.part(body, 'tag', rbox(0.09, 0.06, 0.012, 0.008, 1), swift ? 0.15 : 0.3, swift ? -0.05 : -0.05, 0.2, 1, 1, 1, 0, 0.9, 0.2)
    // 背上的藥劑罐（破罐子：沒有玻璃、只剩框與漏出的光）
    let can: THREE.Bone | null = null
    if (kind !== 'swift') {
      can = k.bone(body, 0.05, brute ? 0.42 : 0.3, -0.05, -0.25, 0, 0.15)
      k.part(can, 'metal', cyl(0.085, 0.085, 0.04, 10), 0, 0, 0)
      if (kind === 'hostile' || kind === 'brute') {
        k.part(can, 'glow', lumpGeo(1, 5, 0.3, 8, 5), 0, 0.06, 0, 0.06, 0.06, 0.06)
        for (let i = 0; i < 3; i++) k.part(can, 'metal', box(0.015, 0.16 - i * 0.04, 0.015), Math.cos(i * 2.1) * 0.075, 0.08, Math.sin(i * 2.1) * 0.075, 1, 1, 1, 0, 0, 0.2 * (i - 1))
      } else {
        k.part(can, 'glass', cyl(0.07, 0.07, 0.2, 10), 0, 0.12, 0)
        k.part(can, 'glow', cyl(0.058, 0.058, 0.14, 8), 0, 0.1, 0)
        k.part(can, 'metal', cyl(0.085, 0.07, 0.04, 10), 0, 0.24, 0)
        k.part(can, 'metal', cyl(0.012, 0.012, 0.2, 4), 0.04, 0.32, 0, 1, 1, 1, 0, 0, -0.5)
      }
      // 罐子接進身體的管子
      k.part(can, 'tube', torus(0.11, 0.016, 4, 10, Math.PI), -0.1, -0.02, 0, 1, 1, 1, 0, 0, HALF)
    }
    // 頭：低垂、一顆大眼＋一顆退化的小眼、裂嘴
    const head = k.bone(body, swift ? 0 : 0.06, swift ? 0.05 : brute ? 0.25 : -0.05, swift ? 0.48 : brute ? 0.32 : 0.36, swift ? -0.3 : 0.25)
    if (kind === 'sheep') {
      k.ell(head, 'face', 0, 0, 0.06, 0.12, 0.11, 0.14, 10, 7)
      for (const sd of [-1, 1]) k.ell(head, 'face', sd * 0.13, 0.03, 0.02, 0.07, 0.025, 0.035, 6, 4, 0, 0, sd * 0.5)
      k.ell(head, 'nose', 0, -0.02, 0.19, 0.035, 0.025, 0.02, 6, 4)
    } else k.ell(head, 'skin', 0, 0, 0.06, swift ? 0.1 : 0.13, swift ? 0.09 : 0.12, swift ? 0.16 : 0.14, 10, 7)
    k.ell(head, 'eye', -0.05, 0.04, swift ? 0.17 : 0.16, 0.055, 0.055, 0.04, 8, 6)
    k.ell(head, 'glow', -0.05, 0.045, swift ? 0.2 : 0.19, 0.025, 0.025, 0.012, 6, 4)
    k.ell(head, 'eye', 0.07, 0.07, 0.13, 0.025, 0.022, 0.02, 6, 4)
    const jaw = k.bone(head, 0, -0.06, 0.06)
    k.ell(jaw, kind === 'sheep' ? 'face' : 'skin', 0, -0.03, 0.06, swift ? 0.08 : 0.1, 0.04, swift ? 0.12 : 0.1, 8, 5)
    if (angry || swift) for (let i = 0; i < 3; i++) for (const sd of [-1, 1]) k.part(jaw, 'bone', spikeGeo(0.014, 0.05, 4), sd * (0.025 + i * 0.025), 0, 0.14 - i * 0.03)
    if (swift) {
      // 頭上的金屬束具＋綠色指示燈
      k.part(head, 'metal', torus(0.11, 0.014, 4, 14), 0, 0.02, 0.08, 1, 1, 1.2, HALF + 0.3)
      k.part(head, 'metal', box(0.03, 0.03, 0.16), 0, 0.11, 0.05)
      k.ell(head, 'glow', 0, 0.13, 0.12, 0.02, 0.02, 0.02, 6, 4)
    }
    if (kind === 'pet') {
      // 受控的項圈：金屬環＋青色指示燈
      k.part(head, 'metal', torus(0.14, 0.025, 5, 16), 0, -0.04, -0.04, 1, 1, 1, HALF - 0.4)
      for (let i = 0; i < 3; i++) k.ell(head, 'glow2', (i - 1) * 0.06, -0.1, 0.06, 0.018, 0.018, 0.018, 6, 4)
    }
    // 羊毛（失敗實驗體（羊））
    if (kind === 'sheep') {
      for (let i = 0; i < 9; i++) {
        const a = i * 2.4
        const r = 0.12 + (i % 3) * 0.07
        k.ell(body, 'wool', Math.cos(a) * r, 0.2 + (i % 2) * 0.06, Math.sin(a) * r * 1.1 - 0.05, 0.12, 0.1, 0.12, 8, 5)
      }
    }
    // 爆炸囊（暴走型；受控的是青色）
    const nSacs = brute ? 7 : angry ? 5 : 0
    for (let i = 0; i < nSacs; i++) {
      const a = i * 2.3 + 0.4
      const rr = brute ? 0.42 : 0.33
      const y = (i % 3) * 0.1 - 0.02
      k.ell(body, 'skin', Math.cos(a) * rr * 0.92, y, Math.sin(a) * rr * 0.85, 0.08, 0.07, 0.08, 8, 5)
      k.ell(body, 'sac', Math.cos(a) * rr, y + 0.01, Math.sin(a) * rr * 0.92, 0.06, 0.055, 0.06, 8, 5)
    }
    if (angry) for (let i = 0; i < 4; i++) k.part(body, 'bone', hornGeo(0.18, 0.035, 0.5, 5, 4), -0.12 + i * 0.07, brute ? 0.38 : 0.26, -0.1 - i * 0.04, 1, 1, 1, -0.5 - i * 0.1, Math.PI, 0)
    // 腿
    const legs: QLeg[] = []
    if (swift) {
      for (const [x, z, front] of [
        [-0.13, 0.26, true],
        [0.13, 0.26, true],
        [-0.13, -0.26, false],
        [0.13, -0.26, false],
      ] as [number, number, boolean][])
        legs.push(qLeg(k, hips, 'skin', x, -0.05, z, H - 0.05, 0.34, front ? -0.35 : -0.55, front ? 0.25 : 0.5, 0.05, 0.035, front, 6, 4))
    } else if (kind === 'failed' || kind === 'sheep') {
      // 三條長短不一的腿：左前粗、右前細、後面一條粗短
      legs.push(qLeg(k, hips, 'skin', -0.17, -0.18, 0.15, H - 0.18, 0.2, -0.2, 0.15, 0.07, 0.06, true, 6, 4))
      legs.push(qLeg(k, hips, 'skin', 0.17, -0.15, 0.17, H - 0.15, 0.22, -0.3, 0.1, 0.05, 0.04, true, 6, 4))
      legs.push(qLeg(k, hips, 'skin', 0.03, -0.2, -0.22, H - 0.2, 0.18, 0.2, -0.1, 0.09, 0.075, false, 6, 4))
    } else if (brute) {
      for (const sd of [-1, 1]) legs.push(qLeg(k, hips, 'skin', sd * 0.24, -0.3, -0.12, H - 0.3, 0.32, -0.3, 0.2, 0.12, 0.1, false, 8, 5))
    } else {
      for (const [x, z, front] of [
        [-0.2, 0.2, true],
        [0.2, 0.2, true],
        [-0.2, -0.2, false],
        [0.2, -0.2, false],
      ] as [number, number, boolean][])
        legs.push(qLeg(k, hips, 'skin', x, -0.18, z, H - 0.18, 0.2, front ? -0.2 : -0.4, front ? 0.2 : 0.3, 0.07, 0.055, front, 6, 4))
    }
    // 巨型：右臂是一整塊肉棍（拖在地上）、左臂萎縮
    let club: THREE.Bone | null = null
    let clubEl: THREE.Bone | null = null
    if (brute) {
      club = k.bone(body, 0.46, 0.22, 0.12, -0.2, 0, 0.25)
      k.ell(club, 'skin', 0, -0.2, 0, 0.13, 0.26, 0.13, 8, 6)
      clubEl = k.bone(club, 0, -0.42, 0, -0.5)
      k.part(clubEl, 'skin', lumpGeo(1, 23, 0.22, 12, 8), 0, -0.25, 0.02, 0.22, 0.34, 0.22)
      for (let i = 0; i < 4; i++) k.part(clubEl, 'bone', spikeGeo(0.035, 0.12, 4), Math.cos(i * 1.6) * 0.18, -0.4 + (i % 2) * 0.12, Math.sin(i * 1.6) * 0.18, 1, 1, 1, Math.sin(i * 1.6) * 1.3, 0, -Math.cos(i * 1.6) * 1.3)
      k.ell(clubEl, 'sac', 0.12, -0.15, 0.14, 0.06, 0.06, 0.06, 8, 5)
      const arm = k.bone(body, -0.42, 0.15, 0.2, -0.9, 0, -0.3)
      k.ell(arm, 'skin', 0, -0.1, 0, 0.05, 0.13, 0.05, 6, 4)
      k.part(arm, 'bone', hornGeo(0.12, 0.025, 0.5, 4, 4), 0, -0.22, 0, 1, 1, 1, Math.PI)
    }
    const sacCol = kind === 'pet' ? '#33ffd1' : '#ff5a1a'
    const sac = liveGlow(sacCol, 2.6)
    const gl = liveGlow('#b6ff3a', 2.2)
    const mats: Record<string, THREE.Material> = {
      skin: angry && kind !== 'pet' ? flesh('#c07468', '#ffb08a', 0.36, 0.3) : swift ? flesh('#c0a090', '#d8ff9a', 0.34, 0.28) : flesh('#d8b4a4', '#d8ff9a', 0.4, 0.25),
      cloth: Mat.cloth('#d8d0b8', '#ffffff'),
      metal: metalPart('#9aa2aa', 0.85, '#b6ff3a', 0.15),
      stitch: rubberPart('#1a1416', '#b6ff3a'),
      tag: smooth('#ffc23d', '#ffffff', 0.5, 0.2),
      tube: rubberPart('#2a2e33', '#b6ff3a'),
      eye: smooth('#e8e2d0', '#ffffff', 0.15, 0.2),
      bone: smooth('#e0d4b8', '#ffb46b', 0.5, 0.3),
      glow: gl,
    }
    if (kind !== 'swift' && kind !== 'hostile' && kind !== 'brute') mats.glass = Mat.glass('#c8ffd0', 0.35)
    if (nSacs || brute) mats.sac = sac
    if (kind === 'sheep') {
      mats.wool = Mat.cloth('#efe9dc', '#ffffff')
      mats.face = flesh('#3a2e2a', '#ffffff', 0.5, 0.25)
      mats.nose = smooth('#e89aa0', '#ffffff', 0.4, 0.2)
    }
    if (kind === 'pet') mats.glow2 = Mat.emissive('#33ffd1', 2.6)
    k.finish(mats)
    const ph = b.L.ph
    return view(b, brute ? 1.5 : swift ? 1.05 : kind === 'pet' ? 1.15 : 1, brute ? 1.45 : swift ? 1.0 : 1.05, (t) => {
      const L = b.L
      const mv = L.move
      const br = L.breathe(t, angry ? 2.2 : 1.2)
      const st = L.strike * L.atk
      // 步態：三腳型是歪斜的蹣跚；四腳型小跑；巨型是左右搖晃的重步
      if (legs.length === 3) {
        legs.forEach((l, i) => {
          const [sw, lift] = stepOf(L.walk, i / 3)
          animQLeg(l, sw, lift, mv, 0.5, 0.8)
        })
      } else if (legs.length === 2) {
        legs.forEach((l, i) => {
          const [sw, lift] = stepOf(L.walk, i * 0.5)
          animQLeg(l, sw, lift, mv, 0.4, 0.9)
        })
      } else {
        const off = [0, 0.5, 0.5, 0]
        legs.forEach((l, i) => {
          const [sw, lift] = stepOf(L.walk, off[i])
          animQLeg(l, sw, lift, mv, swift ? 0.55 : 0.45, 0.7)
        })
      }
      const wob = legs.length === 4 ? 0.03 : 0.1
      shift(hips, 0, Math.abs(Math.sin(L.walk)) * 0.04 * mv + br * 0.012 - Math.max(0, st) * 0.04, Math.max(0, st) * (swift ? 0.2 : 0.12))
      pose(body, Math.max(0, st) * 0.2 - Math.max(0, -st) * 0.12, Math.sin(L.walk * 0.5) * 0.05 * mv, Math.sin(L.walk) * wob * mv + Math.sin(t * 0.6 + ph) * 0.03 * (1 - mv))
      body.scale.set(1 + br * 0.04, 1 + br * 0.03, 1 + br * 0.04)
      // 頭：可憐地晃（失敗型）／衝撞時張嘴
      const look = Math.sin(t * 0.7 + ph) * 0.3 * (1 - mv) * (1 - L.atk)
      pose(head, Math.sin(t * 1.9 + ph) * 0.06 + Math.max(0, st) * 0.3, look, Math.sin(t * 0.5 + ph) * (angry ? 0.05 : 0.15))
      pose(jaw, 0.08 + Math.sin(t * 3 + ph) * 0.04 + L.atk * 0.5 * (st < 0 ? 1 : 1 - st * 0.6))
      if (can) pose(can, Math.sin(L.walk + 1) * 0.12 * mv, 0, Math.sin(t * 1.3 + ph) * 0.06)
      if (club && clubEl) {
        // 肉棍：走路時拖著擺；攻擊高舉 → 砸下
        pose(club, -Math.max(0, -st) * 2.2 + Math.max(0, st) * 0.4 + Math.sin(L.walk) * 0.2 * mv, 0, -Math.max(0, -st) * 0.3)
        pose(clubEl, -Math.max(0, -st) * 0.5 + Math.max(0, st) * 0.3)
      }
      pulse(sac, 2.6, t, L, angry ? 5 : 3, 0.55)
      pulse(gl, 2.2, t, L, 1.1)
      if (L.dead > 0) {
        for (const l of legs) foldQLeg(l, L.dead)
        toppleBone(root, L.dead, -1, H)
        if (club) pose(club, L.dead * -0.4)
      }
    })
  }
}

regModel('creature.failed', failedModel('failed'))
regModel('creature.failedSheep', failedModel('sheep'))
regModel('creature.failedHostile', failedModel('hostile'))
regModel('creature.failedBrute', failedModel('brute'))
regModel('creature.failedSwift', failedModel('swift'))
regModel('monstrosity', failedModel('pet'))

// ═════════════ 異常體 ═════════════
// 漂浮的「錯誤」：半透明膜包著一顆發光晶核、三片繞軌道的晶片、一圈傾斜的光環、四條拖曳的薄鰭。
// 不時「跳格」（位置與大小瞬間抖一下）。富含型（anomalyRich）晶核偏金色，比較好認出那隻值錢的。

let octa: THREE.BufferGeometry | null = null
const octaGeo = () => (octa ??= new THREE.OctahedronGeometry(1, 0))

function anomaly(rich: boolean) {
  return (def: UnitDef | undefined, s: SnapEntity): ModelView => {
    const b = base(def, s, 8, 1)
    const k = new BoneKit('anomaly', b.root)
    const HOV = 0.55
    const core = k.bone(null, 0, HOV, 0)
    k.part(core, 'core', octaGeo(), 0, 0, 0, 0.085, 0.12, 0.085)
    k.ell(core, 'skin', 0, 0, 0, 0.17, 0.16, 0.17, 12, 8)
    const halo = k.bone(core, 0, 0, 0, 0.5, 0, 0.3)
    k.part(halo, 'halo', torus(0.26, 0.01, 4, 32), 0, 0, 0, 1, 1, 1, HALF)
    const orbit = k.bone(core)
    for (let i = 0; i < 3; i++) {
      const a = (i / 3) * Math.PI * 2
      k.part(orbit, 'shard', octaGeo(), Math.cos(a) * 0.27, Math.sin(a * 2) * 0.05, Math.sin(a) * 0.27, 0.028, 0.07, 0.028, 0.3, a, 0.4)
    }
    const fins: THREE.Bone[] = []
    for (let i = 0; i < 4; i++) {
      const a = (i / 4) * Math.PI * 2 + 0.4
      const f = k.bone(core, Math.cos(a) * 0.08, -0.12, Math.sin(a) * 0.08, Math.sin(a) * 0.35, 0, -Math.cos(a) * 0.35)
      k.ell(f, 'fin', 0, -0.1, 0, 0.03, 0.12, 0.012, 6, 4, 0, -a, 0)
      fins.push(f)
    }
    const cc = rich ? '#ffd27a' : '#e2d2ff'
    const gl = liveGlow(cc, 3.2)
    const hl = liveGlow(rich ? '#ffe7a8' : '#b26bff', 2.2)
    k.finish({
      core: gl,
      skin: Mat.glass(rich ? '#ffe9b8' : '#d8c8ff', 0.28),
      halo: hl,
      shard: smooth(rich ? '#e8c060' : '#7fd8ff', '#ffffff', 0.15, 0.9),
      fin: flesh(rich ? '#5a4420' : '#3a2a5a', cc, 0.25, 0.7),
    })
    const ph = b.L.ph
    let glitchT = 0
    return view(b, 1, 0.95, (t, dt) => {
      const L = b.L
      const mv = L.move
      // 跳格：偶爾瞬間位移／壓扁一下
      glitchT -= dt
      if (glitchT <= 0 && Math.random() < dt * 0.6) glitchT = 0.09
      const g = glitchT > 0 ? 1 : 0
      const hov = HOV + Math.sin(t * 2.1 + ph) * 0.06
      shift(core, g * (Math.random() - 0.5) * 0.12, hov - HOV - L.dead * (HOV - 0.12), g * (Math.random() - 0.5) * 0.12)
      pose(core, mv * 0.35, t * 0.4, Math.sin(t * 1.3 + ph) * 0.1)
      core.scale.set(1 + g * 0.3, 1 - g * 0.35 + Math.sin(t * 5 + ph) * 0.03, 1 + g * 0.3)
      pose(halo, Math.sin(t * 0.7 + ph) * 0.3, t * 1.4, 0)
      pose(orbit, 0, t * (1.6 + mv * 2), 0)
      fins.forEach((f, i) => pose(f, Math.sin(t * 3 + i * 1.6) * 0.2 + mv * 0.5, 0, Math.cos(t * 2.4 + i) * 0.15))
      gl.emissiveIntensity = (2.6 + Math.sin(t * 6 + ph) * 0.6 + g * 3 + L.cast * 2) * (1 - L.dead * 0.92)
      hl.emissiveIntensity = (2 + g * 2) * (1 - L.dead)
    })
  }
}

regModel('creature.anomaly', anomaly(false))
regModel('creature.anomalyCaged', anomaly(false))
regModel('creature.anomalyRich', anomaly(true))

// ═════════════ 未知存在 ═════════════
// 天生隱匿的光環傷害源：一團吸光的黑色披影（一層層的黑色團塊）、懸空、一枚蒼白的眼環，底下拖著幾縷黑煙。

regModel('creature.entity', (def, s) => {
  const b = base(def, s, 3, 1)
  const k = new BoneKit('entity', b.root)
  const core = k.bone(null, 0, 0.35, 0)
  const L0: [number, number, number, number][] = [
    [0, 0.25, 0.32, 0.3],
    [0.02, 0.6, 0.26, 0.28],
    [-0.02, 0.92, 0.2, 0.2],
    [0, 1.15, 0.15, 0.15],
  ]
  L0.forEach(([x, y, r, h], i) => k.part(core, 'shade', lumpGeo(1, 60 + i, 0.25, 10, 7), x, y, 0, r, h, r))
  // 斗篷似的下擺
  for (let i = 0; i < 5; i++) {
    const a = (i / 5) * Math.PI * 2
    k.part(core, 'shade', spikeGeo(0.08, 0.4, 5), Math.cos(a) * 0.2, 0.12, Math.sin(a) * 0.2, 1, 1, 1, Math.PI + Math.sin(a) * 0.3, 0, -Math.cos(a) * 0.3)
  }
  const eye = k.bone(core, 0, 1.0, 0.16)
  k.part(eye, 'eye', torus(0.07, 0.012, 4, 20), 0, 0, 0)
  k.ell(eye, 'eye', 0, 0, 0, 0.022, 0.022, 0.01, 6, 4)
  const ey = liveGlow('#e8f0ff', 3)
  k.finish({ shade: flesh('#0c0a12', '#b6a8ff', 0.7, 0.75), eye: ey })
  const ph = b.L.ph
  return view(b, 1, 1.6, (t) => {
    const L = b.L
    shift(core, 0, Math.sin(t * 1.2 + ph) * 0.08, 0)
    pose(core, 0, Math.sin(t * 0.3 + ph) * 0.4, Math.sin(t * 0.8) * 0.05)
    core.scale.set(1 + Math.sin(t * 2.3) * 0.04, 1 + Math.sin(t * 1.7 + 1) * 0.03, 1 + Math.sin(t * 2.3) * 0.04)
    eye.scale.setScalar(1 + Math.sin(t * 3 + ph) * 0.15)
    ey.emissiveIntensity = (2.4 + Math.sin(t * 4.7) * 0.8) * (1 - L.dead)
  })
})
