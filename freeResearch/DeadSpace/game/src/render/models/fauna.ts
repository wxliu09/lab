// 翠原星／活體庫號的地球動物（雞、蛙、兔、羊、鹿、灰狐）、雪原生物（雪團獸、雪團守衛）與畸人。
// 動物走「低面數、可愛、一眼認得」：顏色飽和、輪廓誇張（雞冠、長耳、毛球、鹿角、蓬尾），在暗色草原上也看得出來。
// 畸人反過來：不對稱、歪頭、拖地的長臂、縫起來的嘴，要讓人不舒服。
// 正面朝 local +Z、腳底在 y=0；全部用 boneKit（一隻 3–6 個 draw call、幾何依種類共用）。
import * as THREE from 'three'
import type { UnitDef } from '../../shared/content/types'
import type { SnapEntity } from '../../shared/protocol/messages'
import { box, cyl, torus } from '../batch'
import { Mat, withFog, withRim } from '../materials'
import { regModel, type ModelView } from './registry'
import { BoneKit, base, pose, pulse, shift, view } from './boneKit'
import { flesh, hornGeo, liveGlow, lumpGeo, rubberPart, smooth, spikeGeo, stepOf } from './creatureKit'
import { animQLeg, foldQLeg, qLeg, toppleBone, type QLeg } from './vivarium'

const HALF = Math.PI / 2

// ───── 材質 ─────

const furs = new Map<string, THREE.MeshStandardMaterial>()
/** 毛皮：布料貼圖（細密的纖維雜訊＋粗糙度變化）＋淡淡的邊光（俯視時輪廓清楚）*/
function fur(tint: string, rim = '#ffffff', k = 0.22): THREE.MeshStandardMaterial {
  const key = `${tint}:${rim}:${k}`
  let m = furs.get(key)
  if (!m) {
    m = withRim(withFog(Mat.fabric(tint).clone()), rim, k)
    m.userData.shared = true
    furs.set(key, m)
  }
  return m
}

let iceMat: THREE.MeshStandardMaterial | null = null
/** 冰晶：低粗糙度的淡藍烤漆＋微弱的內部冷光＋強邊光 */
function ice(): THREE.MeshStandardMaterial {
  if (!iceMat) {
    const m = withRim(withFog(Mat.paint('#a8dcf4', 0.12).clone()), '#e8fbff', 0.7)
    m.metalness = 0.1
    m.emissive.set('#3fa8e0')
    m.emissiveIntensity = 0.35
    m.userData.shared = true
    iceMat = m
  }
  return iceMat
}

/** 小動物的眼睛：亮面黑珠 */
const EYE = () => smooth('#0e0c0c', '#ffffff', 0.08, 0.15)

let octa: THREE.BufferGeometry | null = null
const crystalGeo = () => (octa ??= new THREE.OctahedronGeometry(1, 0))

// ═════════════ 雞 ═════════════

regModel('creature.chicken', (def, s) => {
  const b = base(def, s, 15, 1)
  const k = new BoneKit('chicken', b.root)
  const root = k.bone(null)
  const body = k.bone(root, 0, 0.27, 0, -0.22)
  k.ell(body, 'white', 0, 0, 0, 0.12, 0.11, 0.16)
  k.ell(body, 'white', 0, -0.02, 0.09, 0.1, 0.1, 0.09, 8, 6)
  const wings = [-1, 1].map((sd) => {
    const w = k.bone(body, sd * 0.1, 0.02, 0)
    k.ell(w, 'cream', sd * 0.012, -0.01, -0.02, 0.03, 0.075, 0.12, 8, 5, 0.25)
    return w
  })
  // 尾羽：白色扇形＋兩根黑亮的長羽
  const tail = k.bone(body, 0, 0.05, -0.13, -0.5)
  for (let i = 0; i < 3; i++) k.ell(tail, 'white', 0, 0.08, 0, 0.02, 0.09, 0.045, 6, 4, 0, 0, (i - 1) * 0.38)
  for (const sd of [-1, 1]) k.ell(tail, 'dark', sd * 0.02, 0.11, -0.02, 0.012, 0.1, 0.03, 6, 4, -0.2, 0, sd * 0.2)
  // 頭：紅冠、肉垂、橘喙
  const head = k.bone(body, 0, 0.08, 0.1, 0.22)
  k.ell(head, 'white', 0, 0.05, 0.01, 0.055, 0.08, 0.055, 8, 5)
  k.ell(head, 'white', 0, 0.13, 0.03, 0.06, 0.06, 0.065, 8, 6)
  for (let i = 0; i < 3; i++) k.ell(head, 'red', 0, 0.19 - Math.abs(i - 1) * 0.012, 0.0 + i * 0.03, 0.012, 0.03, 0.02, 6, 4)
  k.ell(head, 'red', 0, 0.08, 0.085, 0.014, 0.026, 0.016, 6, 4)
  k.part(head, 'beak', spikeGeo(0.018, 0.055, 5), 0, 0.12, 0.085, 1, 1, 1, HALF)
  for (const sd of [-1, 1]) k.ell(head, 'eye', sd * 0.05, 0.14, 0.06, 0.012, 0.014, 0.012, 6, 4)
  // 腳：橘色細腿＋三爪
  const legs = [-1, 1].map((sd) => {
    const l = k.bone(root, sd * 0.045, 0.2, -0.01)
    k.ell(l, 'cream', 0, -0.01, 0, 0.04, 0.045, 0.045, 6, 4)
    k.part(l, 'beak', cyl(0.011, 0.011, 0.17, 5), 0, -0.09, 0)
    for (let i = 0; i < 3; i++) k.part(l, 'beak', spikeGeo(0.009, 0.06, 4), (i - 1) * 0.015, -0.175, 0.005, 1, 1, 1, HALF, 0, -(i - 1) * 0.5)
    return l
  })
  k.finish({
    white: fur('#f2ede4', '#ffffff', 0.18),
    cream: fur('#e6dcc8', '#ffffff', 0.15),
    dark: smooth('#141a18', '#7fd8ff', 0.2, 0.25),
    red: smooth('#d8322c', '#ff8a7a', 0.45, 0.25),
    beak: smooth('#f0a020', '#ffd27a', 0.4, 0.2),
    eye: EYE(),
  })
  const ph = b.L.ph
  return view(b, 1, 0.48, (t) => {
    const L = b.L
    const mv = L.move
    legs.forEach((l, i) => {
      const [sw] = stepOf(L.walk, i * 0.5)
      pose(l, sw * 0.6 * mv)
    })
    // 啄地：每隔幾秒低頭啄兩下（走路時不啄）
    const c = (t * 0.35 + ph * 0.3) % 1
    const peck = c > 0.7 ? Math.abs(Math.sin((c - 0.7) * Math.PI * 6.6)) * (1 - mv) : 0
    shift(body, 0, Math.abs(Math.sin(L.walk)) * 0.015 * mv, 0)
    pose(body, peck * 0.35 + mv * 0.1, 0, Math.sin(L.walk) * 0.05 * mv)
    // 走路時頭一伸一縮
    shift(head, 0, 0, Math.sin(L.walk * 2) * 0.02 * mv)
    pose(head, peck * 0.9, Math.sin(t * 1.3 + ph) * 0.4 * (1 - mv) * (1 - peck), 0)
    pose(tail, Math.sin(t * 2 + ph) * 0.05)
    // 跑起來拍翅膀
    wings.forEach((w, i) => pose(w, 0, 0, (i ? -1 : 1) * Math.max(0, Math.sin(t * 18)) * 0.5 * Math.max(0, mv - 0.6)))
    if (L.dead > 0) {
      toppleBone(root, L.dead, 1, 0.25)
      for (const l of legs) pose(l, -L.dead * 0.8)
    }
  })
})

// ═════════════ 蛙（紅眼樹蛙配色）═════════════

regModel('creature.frog', (def, s) => {
  const b = base(def, s, 5, 1)
  const k = new BoneKit('frog', b.root)
  const root = k.bone(null)
  const jump = k.bone(root)
  const body = k.bone(jump, 0, 0.09, 0, -0.35)
  k.ell(body, 'skin', 0, 0, -0.01, 0.1, 0.07, 0.12)
  k.ell(body, 'skin', 0, 0.03, 0.08, 0.095, 0.058, 0.075, 8, 6)
  k.ell(body, 'belly', 0, -0.03, 0.02, 0.085, 0.05, 0.1, 8, 5)
  for (const sd of [-1, 1]) {
    k.ell(body, 'blue', sd * 0.093, -0.005, -0.01, 0.014, 0.03, 0.08, 6, 4)
    // 凸出的紅眼＋直立瞳孔
    k.ell(body, 'skin', sd * 0.055, 0.07, 0.085, 0.036, 0.032, 0.034, 8, 5)
    k.ell(body, 'eyeR', sd * 0.06, 0.078, 0.1, 0.03, 0.03, 0.028, 8, 6)
    k.ell(body, 'eye', sd * 0.066, 0.08, 0.126, 0.006, 0.02, 0.006, 6, 4)
  }
  for (let i = 0; i < 4; i++) k.ell(body, 'dark', (i % 2 ? 1 : -1) * 0.03, 0.065 - i * 0.004, -0.04 + i * 0.03, 0.016, 0.006, 0.02, 6, 4)
  const throat = k.bone(body, 0, -0.04, 0.1)
  k.ell(throat, 'belly', 0, 0, 0, 0.045, 0.03, 0.04, 6, 4)
  // 後腿：大腿往前收在身側、小腿往後、橘色蹼足
  const back = [-1, 1].map((sd) => {
    const th = k.bone(jump, sd * 0.07, 0.06, -0.07, 0.25, 0, 0)
    k.ell(th, 'skin', sd * 0.02, 0, 0.05, 0.034, 0.03, 0.066, 6, 4, 0, sd * 0.4, 0)
    const sh = k.bone(th, sd * 0.045, -0.02, 0.1)
    k.ell(sh, 'skin', 0, -0.005, -0.055, 0.022, 0.02, 0.06, 6, 4, 0, -sd * 0.3, 0)
    k.ell(sh, 'toe', sd * 0.02, -0.03, -0.08, 0.04, 0.008, 0.05, 6, 4, 0, sd * 0.4, 0)
    return { th, sh }
  })
  const front = [-1, 1].map((sd) => {
    const f = k.bone(jump, sd * 0.06, 0.07, 0.07, 0, 0, -sd * 0.2)
    k.ell(f, 'skin', 0, -0.03, 0, 0.018, 0.045, 0.018, 6, 4)
    k.ell(f, 'toe', 0, -0.065, 0.015, 0.025, 0.007, 0.025, 6, 4)
    return f
  })
  k.finish({
    skin: flesh('#3fa03a', '#d8ff7a', 0.12, 0.35),
    belly: smooth('#f0e4a0', '#ffffff', 0.35, 0.15),
    blue: flesh('#2a6ad8', '#9fe7ff', 0.15, 0.3),
    dark: flesh('#1e5a22', '#d8ff7a', 0.2, 0.2),
    eyeR: smooth('#ff3a1a', '#ffd27a', 0.08, 0.35),
    eye: EYE(),
    toe: smooth('#ff8a2a', '#ffd27a', 0.3, 0.2),
  })
  const ph = b.L.ph
  return view(b, 1.15, 0.22, (t) => {
    const L = b.L
    // 跳躍：走路相位的前 55% 在空中（拋物線），其餘蹲著
    const p = ((L.walk / (Math.PI * 2)) % 1 + 1) % 1
    const air = p < 0.55 ? Math.sin((p / 0.55) * Math.PI) * L.move : 0
    shift(jump, 0, air * 0.16, 0)
    pose(jump, -air * 0.25)
    back.forEach((l) => {
      pose(l.th, air * 1.6)
      pose(l.sh, -air * 0.8)
    })
    front.forEach((f) => pose(f, -air * 0.8))
    // 待機：喉囊鼓動、偶爾眨眼似的縮一下身子
    const br = Math.max(0, Math.sin(t * 3.1 + ph)) * (1 - L.move)
    throat.scale.set(1 + br * 0.5, 1 + br * 0.7, 1 + br * 0.4)
    body.scale.setScalar(1 + L.breathe(t, 2) * 0.02)
    if (L.dead > 0) {
      pose(jump, 0, 0, L.dead * Math.PI)
      shift(jump, 0, L.dead * 0.17, 0)
    }
  })
})

// ═════════════ 兔 ═════════════

regModel('creature.rabbit', (def, s) => {
  const b = base(def, s, 7, 1)
  const k = new BoneKit('rabbit', b.root)
  const root = k.bone(null)
  const hop = k.bone(root)
  const body = k.bone(hop, 0, 0.17, -0.02, -0.15)
  k.ell(body, 'fur', 0, 0, 0, 0.11, 0.11, 0.15)
  k.ell(body, 'fur', 0, -0.02, -0.08, 0.105, 0.1, 0.1, 8, 6)
  k.ell(body, 'white', 0, -0.04, 0.09, 0.075, 0.075, 0.06, 8, 5)
  k.ell(body, 'white', 0, 0.035, -0.165, 0.045, 0.045, 0.04, 8, 5)
  const head = k.bone(body, 0, 0.08, 0.14, 0.15)
  k.ell(head, 'fur', 0, 0.03, 0.04, 0.07, 0.065, 0.08, 8, 6)
  k.ell(head, 'white', 0, 0.005, 0.1, 0.04, 0.03, 0.035, 6, 4)
  k.ell(head, 'pink', 0, 0.022, 0.128, 0.012, 0.01, 0.008, 6, 4)
  for (const sd of [-1, 1]) k.ell(head, 'eye', sd * 0.052, 0.05, 0.075, 0.016, 0.018, 0.014, 6, 4)
  const ears = [-1, 1].map((sd) => {
    const e = k.bone(head, sd * 0.028, 0.085, 0.02, -0.18, 0, -sd * 0.14)
    k.ell(e, 'fur', 0, 0.09, 0, 0.024, 0.1, 0.04, 6, 4)
    k.ell(e, 'pink', 0, 0.09, 0.018, 0.011, 0.08, 0.024, 6, 4)
    return e
  })
  const hind = [-1, 1].map((sd) => {
    const l = k.bone(hop, sd * 0.075, 0.1, -0.08)
    k.ell(l, 'fur', 0, -0.015, 0, 0.045, 0.06, 0.07, 6, 4)
    k.ell(l, 'white', 0, -0.085, 0.035, 0.03, 0.018, 0.08, 6, 4)
    return l
  })
  const fore = [-1, 1].map((sd) => {
    const l = k.bone(hop, sd * 0.045, 0.12, 0.09)
    k.ell(l, 'fur', 0, -0.055, 0, 0.02, 0.06, 0.022, 6, 4)
    k.ell(l, 'white', 0, -0.11, 0.012, 0.022, 0.012, 0.03, 6, 4)
    return l
  })
  k.finish({ fur: fur('#8c7a66', '#ffe8d0', 0.2), white: fur('#f2ece4', '#ffffff', 0.15), pink: smooth('#e8a4a8', '#ffffff', 0.4, 0.15), eye: EYE() })
  const ph = b.L.ph
  return view(b, 1.1, 0.45, (t) => {
    const L = b.L
    const p = ((L.walk / (Math.PI * 2)) % 1 + 1) % 1
    const air = p < 0.6 ? Math.sin((p / 0.6) * Math.PI) * L.move : 0
    shift(hop, 0, air * 0.11, 0)
    pose(hop, -air * 0.3 + Math.max(0, Math.sin((p - 0.6) / 0.4 * Math.PI)) * 0.15 * L.move)
    hind.forEach((l) => pose(l, air * 1.1))
    fore.forEach((l) => pose(l, -air * 0.9))
    // 耳朵跟著跳躍甩、待機時各自轉動；鼻子抽動
    ears.forEach((e, i) => pose(e, air * 0.6 + Math.sin(t * 0.9 + i * 2 + ph) * 0.12 * (1 - L.move), Math.sin(t * 0.6 + i * 3) * 0.3 * (1 - L.move), 0))
    shift(head, 0, Math.sin(t * 14) * 0.003 * (1 - L.move), 0)
    pose(head, Math.sin(t * 0.5 + ph) * 0.1, Math.sin(t * 0.4 + ph) * 0.3 * (1 - L.move), 0)
    body.scale.setScalar(1 + L.breathe(t, 3) * 0.02)
    if (L.dead > 0) toppleBone(root, L.dead, -1, 0.18)
  })
})

// ═════════════ 羊 ═════════════

regModel('creature.sheep', (def, s) => {
  const b = base(def, s, 6, 1)
  const k = new BoneKit('sheep', b.root)
  const root = k.bone(null)
  const body = k.bone(root, 0, 0.48, 0)
  // 羊毛：一團不規則的核心＋一圈蓬鬆的毛球
  k.part(body, 'wool', lumpGeo(1, 33, 0.12, 12, 8), 0, 0, 0, 0.3, 0.25, 0.38)
  for (let i = 0; i < 10; i++) {
    const a = i * 2.4
    const y = 0.08 + (i % 3) * 0.05
    k.ell(body, 'wool', Math.cos(a) * 0.22, y, Math.sin(a) * 0.3, 0.14, 0.12, 0.14, 7, 5)
  }
  k.ell(body, 'wool', 0, 0.06, -0.38, 0.07, 0.07, 0.06, 6, 4)
  const head = k.bone(body, 0, 0.12, 0.36, 0.35)
  k.ell(head, 'face', 0, -0.02, 0.08, 0.085, 0.09, 0.13, 8, 6)
  k.ell(head, 'wool', 0, 0.06, 0.02, 0.1, 0.065, 0.08, 8, 5)
  for (const sd of [-1, 1]) {
    k.ell(head, 'face', sd * 0.11, 0.02, 0.03, 0.07, 0.022, 0.035, 6, 4, 0, 0, -sd * 0.35)
    k.ell(head, 'eye', sd * 0.062, 0.03, 0.12, 0.018, 0.016, 0.014, 6, 4)
  }
  k.ell(head, 'nose', 0, -0.035, 0.2, 0.035, 0.025, 0.02, 6, 4)
  const legs = [
    [-0.15, 0.22, true],
    [0.15, 0.22, true],
    [-0.15, -0.2, false],
    [0.15, -0.2, false],
  ].map(([x, z, f]) => {
    const l = qLeg(k, body, 'leg', x as number, -0.15, z as number, 0.33, 0.16, 0, 0, 0.042, 0.032, f as boolean, 6, 4)
    k.ell(l.foot, 'hoof', 0, 0.02, 0.01, 0.035, 0.025, 0.04, 5, 3)
    return l
  })
  k.finish({ wool: fur('#ece6d8', '#ffffff', 0.2), face: fur('#2e2622', '#ffe8d0', 0.2), leg: fur('#2e2622', '#ffe8d0', 0.15), hoof: smooth('#141210', '#ffffff', 0.3, 0.1), nose: smooth('#8a6a68', '#ffffff', 0.4, 0.1), eye: smooth('#c8a040', '#ffffff', 0.1, 0.1) })
  const ph = b.L.ph
  return view(b, 1, 0.82, (t) => {
    const L = b.L
    const mv = L.move
    const off = [0, 0.5, 0.5, 0]
    legs.forEach((l, i) => {
      const [sw, lift] = stepOf(L.walk, off[i])
      animQLeg(l, sw, lift, mv, 0.45, 0.8)
    })
    shift(body, 0, Math.abs(Math.sin(L.walk)) * 0.025 * mv, 0)
    pose(body, 0, 0, Math.sin(L.walk) * 0.04 * mv)
    body.scale.setScalar(1 + L.breathe(t, 1.4) * 0.02)
    // 吃草：低頭一陣、嚼一嚼、抬頭張望
    const c = (t * 0.12 + ph * 0.2) % 1
    const graze = c < 0.55 ? Math.min(1, Math.sin((c / 0.55) * Math.PI) * 1.8) * (1 - mv) : 0
    pose(head, graze * 0.9 + Math.sin(t * 6) * 0.03 * graze, Math.sin(t * 0.5 + ph) * 0.35 * (1 - mv) * (1 - graze), 0)
    if (L.dead > 0) {
      for (const l of legs) foldQLeg(l, L.dead)
      toppleBone(root, L.dead, 1, 0.45)
    }
  })
})

// ═════════════ 鹿 ═════════════

regModel('creature.stag', (def, s) => {
  const b = base(def, s, 6, 1)
  const k = new BoneKit('stag', b.root)
  const root = k.bone(null)
  const spine = k.bone(root, 0, 0.92, 0)
  const chest = k.bone(spine, 0, 0.02, 0.25)
  k.ell(chest, 'coat', 0, 0, 0, 0.17, 0.22, 0.24)
  k.ell(chest, 'belly', 0, -0.06, 0.12, 0.12, 0.15, 0.12, 8, 5)
  const pelvis = k.bone(spine, 0, 0.02, -0.28)
  k.ell(pelvis, 'coat', 0, 0, 0, 0.16, 0.19, 0.2)
  k.ell(pelvis, 'white', 0, 0.02, -0.17, 0.11, 0.12, 0.06, 8, 5)
  k.ell(pelvis, 'coat', 0, 0.11, -0.2, 0.035, 0.06, 0.03, 6, 4, -0.4)
  k.ell(spine, 'coat', 0, 0.02, 0, 0.168, 0.205, 0.38)
  k.ell(spine, 'belly', 0, -0.1, 0, 0.13, 0.1, 0.32, 8, 5)
  // 長頸＋頭
  const neck = k.bone(chest, 0, 0.12, 0.17, 0.55)
  k.ell(neck, 'coat', 0, 0.17, 0, 0.075, 0.21, 0.085, 8, 6)
  k.ell(neck, 'belly', 0, 0.12, 0.05, 0.05, 0.15, 0.05, 6, 4)
  const head = k.bone(neck, 0, 0.36, 0, -0.85)
  k.ell(head, 'coat', 0, 0, 0.05, 0.066, 0.07, 0.1, 8, 6)
  k.ell(head, 'coat', 0, -0.03, 0.15, 0.045, 0.045, 0.07, 6, 5)
  k.ell(head, 'dark', 0, -0.02, 0.215, 0.025, 0.02, 0.015, 6, 4)
  for (const sd of [-1, 1]) {
    k.ell(head, 'dark', sd * 0.055, 0.025, 0.09, 0.014, 0.016, 0.014, 6, 4)
    k.ell(head, 'coat', sd * 0.08, 0.06, 0.0, 0.07, 0.025, 0.015, 6, 4, 0, 0, sd * 0.5)
  }
  // 鹿角：主幹往上、往外、往前彎，帶三根分叉
  const L0 = 0.5
  const B0 = 0.6
  for (const sd of [-1, 1]) {
    const a = k.bone(head, sd * 0.045, 0.07, 0.0, -0.3, 0, -sd * 0.78)
    k.part(a, 'antler', hornGeo(L0, 0.032, B0, 8, 5), 0, 0, 0)
    k.part(a, 'antler', spikeGeo(0.017, 0.15, 4), 0, L0 * 0.22, L0 * B0 * 0.04, 1, 1, 1, 1.2)
    k.part(a, 'antler', spikeGeo(0.016, 0.18, 4), 0, L0 * 0.45, L0 * B0 * 0.17, 1, 1, 1, 0.55, 0, sd * 0.35)
    k.part(a, 'antler', spikeGeo(0.015, 0.16, 4), 0, L0 * 0.68, L0 * B0 * 0.4, 1, 1, 1, 0.2, 0, -sd * 0.3)
    k.part(a, 'antler', spikeGeo(0.013, 0.12, 4), 0, L0 * 0.86, L0 * B0 * 0.68, 1, 1, 1, -0.4, 0, sd * 0.2)
  }
  const legs = [
    qLeg(k, chest, 'leg', -0.1, -0.12, 0.05, 0.82, 0.36, -0.05, 0.08, 0.045, 0.028, true, 6, 4),
    qLeg(k, chest, 'leg', 0.1, -0.12, 0.05, 0.82, 0.36, -0.05, 0.08, 0.045, 0.028, true, 6, 4),
    qLeg(k, pelvis, 'leg', -0.1, -0.1, -0.02, 0.84, 0.38, -0.32, 0.25, 0.06, 0.03, false, 6, 4),
    qLeg(k, pelvis, 'leg', 0.1, -0.1, -0.02, 0.84, 0.38, -0.32, 0.25, 0.06, 0.03, false, 6, 4),
  ]
  for (const l of legs) k.ell(l.foot, 'dark', 0, 0.025, 0.01, 0.025, 0.03, 0.035, 6, 4)
  k.finish({ coat: fur('#9a6a42', '#ffe0b0', 0.2), belly: fur('#d8bc98', '#ffffff', 0.15), white: fur('#f2ece2', '#ffffff', 0.15), leg: fur('#7a5232', '#ffe0b0', 0.15), dark: smooth('#1a1410', '#ffffff', 0.15, 0.15), antler: smooth('#d8c8a8', '#fff4d8', 0.5, 0.3) })
  const ph = b.L.ph
  return view(b, 1, 1.75, (t) => {
    const L = b.L
    const mv = L.move
    const off = [0, 0.5, 0.5, 0]
    legs.forEach((l, i) => {
      const [sw, lift] = stepOf(L.walk, off[i])
      animQLeg(l, sw, lift, mv, 0.5, 0.9)
    })
    shift(spine, 0, Math.abs(Math.sin(L.walk)) * 0.035 * mv, 0)
    pose(spine, Math.sin(L.walk * 2) * 0.02 * mv, 0, Math.sin(L.walk) * 0.03 * mv)
    chest.scale.setScalar(1 + L.breathe(t, 1.2) * 0.02)
    const c = (t * 0.1 + ph * 0.2) % 1
    const graze = c < 0.4 ? Math.min(1, Math.sin((c / 0.4) * Math.PI) * 1.6) * (1 - mv) : 0
    pose(neck, Math.sin(L.walk * 2) * 0.05 * mv + graze * 1.1, Math.sin(t * 0.4 + ph) * 0.25 * (1 - mv) * (1 - graze), 0)
    pose(head, graze * 0.3)
    if (L.dead > 0) {
      for (const l of legs) foldQLeg(l, L.dead)
      toppleBone(root, L.dead, -1, 0.9)
    }
  })
})

// ═════════════ 灰狐 ═════════════
// 隱匿、回血極快的「靈狐」：灰毛、白胸、黑襪、蓬鬆的大尾巴；眼睛與尾尖帶一點蒼白的冷光（不是一般的狐狸）。

regModel('creature.greyFox', (def, s) => {
  const b = base(def, s, 9, 1.4)
  const k = new BoneKit('greyFox', b.root)
  const root = k.bone(null)
  const spine = k.bone(root, 0, 0.42, 0)
  const chest = k.bone(spine, 0, 0.02, 0.17)
  k.ell(chest, 'fur', 0, 0, 0, 0.11, 0.13, 0.15)
  k.ell(chest, 'white', 0, -0.045, 0.11, 0.075, 0.095, 0.06, 8, 5)
  const pelvis = k.bone(spine, 0, 0.02, -0.18)
  k.ell(pelvis, 'fur', 0, 0, 0, 0.1, 0.11, 0.13)
  k.ell(spine, 'fur', 0, 0.01, 0, 0.108, 0.122, 0.25)
  k.ell(spine, 'rust', 0, -0.02, 0.02, 0.105, 0.07, 0.17, 8, 5)
  const head = k.bone(chest, 0, 0.12, 0.16, 0.12)
  k.ell(head, 'fur', 0, 0.02, 0.03, 0.08, 0.07, 0.08, 8, 6)
  k.part(head, 'fur', spikeGeo(0.045, 0.14, 6), 0, 0.0, 0.07, 1, 0.8, 1, HALF)
  for (const sd of [-1, 1]) {
    k.ell(head, 'white', sd * 0.045, -0.02, 0.07, 0.045, 0.035, 0.05, 6, 4)
    k.ell(head, 'glow', sd * 0.038, 0.035, 0.095, 0.016, 0.009, 0.008, 6, 4, 0, 0, sd * 0.35)
    k.part(head, 'fur', spikeGeo(0.036, 0.1, 4), sd * 0.045, 0.07, 0.0, 1, 1, 0.5, -0.1, 0, -sd * 0.28)
    k.part(head, 'dark', spikeGeo(0.016, 0.04, 4), sd * 0.07, 0.15, -0.01, 1, 1, 0.5, -0.1, 0, -sd * 0.28)
  }
  k.ell(head, 'dark', 0, 0.002, 0.205, 0.016, 0.013, 0.012, 6, 4)
  const jaw = k.bone(head, 0, -0.025, 0.05)
  k.ell(jaw, 'white', 0, -0.012, 0.06, 0.028, 0.014, 0.065, 6, 4)
  // 大尾巴：三節往後上揚、再垂下；白色尾尖（裡面一點冷光）
  const t1 = k.bone(pelvis, 0, 0.05, -0.11, 0.15)
  k.ell(t1, 'fur', 0, 0, -0.07, 0.055, 0.055, 0.09, 7, 5)
  const t2 = k.bone(t1, 0, 0, -0.13, -0.45)
  k.ell(t2, 'fur', 0, 0, -0.07, 0.085, 0.08, 0.11, 7, 5)
  const t3 = k.bone(t2, 0, 0, -0.14, -0.35)
  k.ell(t3, 'fur', 0, 0, -0.04, 0.07, 0.065, 0.075, 7, 5)
  k.ell(t3, 'white', 0, 0, -0.11, 0.05, 0.048, 0.06, 7, 5)
  k.ell(t3, 'glowTip', 0, 0, -0.13, 0.03, 0.03, 0.035, 6, 4)
  const legs = [
    qLeg(k, chest, 'leg', -0.07, -0.1, 0.04, 0.34, 0.17, -0.05, 0.1, 0.03, 0.022, true, 6, 4),
    qLeg(k, chest, 'leg', 0.07, -0.1, 0.04, 0.34, 0.17, -0.05, 0.1, 0.03, 0.022, true, 6, 4),
    qLeg(k, pelvis, 'leg', -0.07, -0.08, -0.02, 0.36, 0.19, -0.35, 0.3, 0.045, 0.025, false, 6, 4),
    qLeg(k, pelvis, 'leg', 0.07, -0.08, -0.02, 0.36, 0.19, -0.35, 0.3, 0.045, 0.025, false, 6, 4),
  ]
  for (const l of legs) k.ell(l.foot, 'dark', 0, 0.015, 0.02, 0.025, 0.018, 0.035, 5, 3)
  const gl = liveGlow('#bfefff', 2.6)
  const tip = liveGlow('#bfefff', 1.2)
  k.finish({ fur: fur('#8e9096', '#bfefff', 0.28), white: fur('#eef0f2', '#ffffff', 0.18), rust: fur('#9a6a4a', '#ffe0c0', 0.18), leg: fur('#3a3a3e', '#bfefff', 0.2), dark: smooth('#121214', '#bfefff', 0.2, 0.2), glow: gl, glowTip: tip })
  const ph = b.L.ph
  return view(b, 1.4, 0.62, (t) => {
    const L = b.L
    const mv = L.move
    const off = [0, 0.5, 0.5, 0]
    legs.forEach((l, i) => {
      const [sw, lift] = stepOf(L.walk, off[i])
      animQLeg(l, sw, lift, mv, 0.55, 0.8)
    })
    const st = L.strike * L.atk
    shift(spine, 0, Math.abs(Math.sin(L.walk)) * 0.025 * mv - Math.max(0, -st) * 0.05, Math.max(0, st) * 0.18)
    pose(spine, Math.max(0, st) * 0.15 - Math.max(0, -st) * 0.1, 0, Math.sin(L.walk) * 0.03 * mv)
    chest.scale.setScalar(1 + L.breathe(t, 1.8) * 0.025)
    // 嗅地、張望；攻擊時咬合
    const sniff = Math.max(0, Math.sin(t * 0.5 + ph)) * (1 - mv) * (1 - L.atk)
    pose(head, sniff * 0.5 + Math.sin(t * 9) * 0.02 * sniff + Math.max(0, st) * 0.2, Math.sin(t * 0.35 + ph) * 0.4 * (1 - mv) * (1 - L.atk), 0)
    pose(jaw, L.atk * (st < 0 ? 0.6 : 0.6 * (1 - st)))
    // 尾巴：跟著步伐甩、待機時慢慢掃
    const sway = Math.sin(t * (1.2 + mv * 4) + ph)
    pose(t1, mv * -0.25, sway * 0.25, 0)
    pose(t2, 0, sway * 0.3, 0)
    pose(t3, 0, Math.sin(t * (1.2 + mv * 4) + ph - 0.8) * 0.35, 0)
    gl.emissiveIntensity = (2.4 + L.atk * 1.5) * (1 - L.dead)
    tip.emissiveIntensity = (0.9 + 0.5 * Math.sin(t * 2 + ph)) * (1 - L.dead)
    if (L.dead > 0) {
      for (const l of legs) foldQLeg(l, L.dead)
      toppleBone(root, L.dead, 1, 0.4)
    }
  })
})

// ═════════════ 雪團獸／雪團守衛 ═════════════
// 一顆會走路的大雪球：蓬亂的白藍長毛、冰牙大嘴、兩條垂到膝蓋的長臂、頭頂幾根冰晶。
// 守衛：灰藍色的毛、頭頂一圈高聳的冰冠、肩上冰晶甲、胸口透出一顆冰藍色核心。

function snowgle(warden: boolean) {
  return (def: UnitDef | undefined, s: SnapEntity): ModelView => {
    const b = base(def, s, 5, 1)
    const k = new BoneKit(warden ? 'snowgleWarden' : 'snowgle', b.root)
    const root = k.bone(null)
    const body = k.bone(root, 0, 0.68, 0)
    k.part(body, 'fur', lumpGeo(1, 21, 0.14, 14, 10), 0, 0, 0, 0.55, 0.55, 0.5)
    for (let i = 0; i < 7; i++) {
      const a = i * 2.2 + 0.5
      const y = 0.15 + (i % 3) * 0.13
      const r = Math.sqrt(Math.max(0.05, 0.3 - y * y)) * 1.0
      k.part(body, 'fur', lumpGeo(1, 30 + i, 0.3, 8, 5), Math.cos(a) * r, y, Math.sin(a) * r * 0.9 - 0.05, 0.17, 0.15, 0.17)
    }
    k.ell(body, 'belly', 0, -0.1, 0.33, 0.36, 0.38, 0.19, 10, 7)
    k.ell(body, 'fur', 0, 0.2, 0.42, 0.3, 0.1, 0.12, 8, 5)
    for (const sd of [-1, 1]) {
      k.ell(body, 'mouth', sd * 0.14, 0.13, 0.475, 0.075, 0.06, 0.03, 8, 5, 0, 0, sd * 0.25)
      k.ell(body, 'glow', sd * 0.14, 0.13, 0.5, 0.058, 0.042, 0.022, 8, 5, 0, 0, sd * 0.25)
      // 冰角：從頭側往上、往外張、往前彎（雪團獸的剪影重點）
      k.part(body, 'ice', hornGeo(warden ? 0.4 : 0.32, warden ? 0.065 : 0.055, 0.55, 6, 5), sd * 0.3, 0.36, 0.2, 1, 1, 1, 0.1, 0, -sd * 0.75)
    }
    // 頭頂冰晶
    const nCr = warden ? 5 : 3
    for (let i = 0; i < nCr; i++) {
      const a = warden ? (i / nCr) * Math.PI * 2 : (i - 1) * 0.6
      const x = warden ? Math.cos(a) * 0.2 : Math.sin(a) * 0.18
      const z = warden ? Math.sin(a) * 0.18 : -0.05 + Math.abs(i - 1) * 0.05
      const h = warden ? 0.26 + (i % 2) * 0.08 : 0.14 + (i === 1 ? 0.06 : 0)
      k.part(body, 'ice', crystalGeo(), x, 0.5 + h * 0.5, z, 0.05, h, 0.05, warden ? Math.sin(a) * 0.35 : -0.2, 0, warden ? -Math.cos(a) * 0.35 : -x * 1.6)
    }
    // 嘴：冰牙＋可張開的下顎
    k.ell(body, 'mouth', 0, -0.04, 0.45, 0.24, 0.1, 0.07, 8, 5)
    for (let i = 0; i < 4; i++) k.part(body, 'ice', spikeGeo(0.03, 0.11, 4), (i - 1.5) * 0.09, 0.03, 0.5, 1, 1, 1, Math.PI)
    const jaw = k.bone(body, 0, -0.06, 0.32)
    k.ell(jaw, 'fur', 0, -0.06, 0.08, 0.25, 0.09, 0.13, 8, 5)
    for (const sd of [-1, 1]) k.part(jaw, 'ice', spikeGeo(0.035, 0.13, 4), sd * 0.12, -0.02, 0.17)
    // 長臂
    const arms = [-1, 1].map((sd) => {
      const sh = k.bone(body, sd * 0.5, 0.05, 0.05, 0, 0, sd * 0.28)
      k.ell(sh, 'fur', 0, -0.15, 0, 0.12, 0.22, 0.12, 8, 6)
      const el = k.bone(sh, 0, -0.32, 0, -0.2)
      k.ell(el, 'fur', 0, -0.16, 0, 0.13, 0.2, 0.13, 8, 6)
      for (let i = 0; i < 3; i++) k.part(el, 'claw', hornGeo(0.14, 0.03, 0.5, 4, 4), (i - 1) * 0.06, -0.32, 0.04, 1, 1, 1, Math.PI - 0.3, 0, 0)
      if (warden) for (let i = 0; i < 3; i++) k.part(el, 'ice', crystalGeo(), sd * 0.1, -0.1 - i * 0.07, -0.02, 0.035, 0.1, 0.035, 0, 0, -sd * (0.9 + i * 0.2))
      return { sh, el }
    })
    // 短腿
    const legs = [-1, 1].map((sd) => {
      const l = k.bone(body, sd * 0.22, -0.45, 0)
      k.ell(l, 'fur', 0, -0.08, 0, 0.13, 0.13, 0.14, 8, 5)
      k.ell(l, 'belly', 0, -0.2, 0.04, 0.12, 0.05, 0.16, 8, 5)
      for (let i = 0; i < 3; i++) k.part(l, 'claw', spikeGeo(0.02, 0.06, 4), (i - 1) * 0.05, -0.22, 0.18, 1, 1, 1, HALF)
      return l
    })
    let core: THREE.MeshStandardMaterial | null = null
    if (warden) {
      // 肩上的冰晶甲＋胸口的冰核
      for (const sd of [-1, 1]) for (let i = 0; i < 3; i++) k.part(body, 'ice', crystalGeo(), sd * (0.42 + i * 0.05), 0.3 - i * 0.04, -0.05 + i * 0.06, 0.05, 0.16 - i * 0.03, 0.05, 0, 0, -sd * (0.5 + i * 0.25))
      k.ell(body, 'core', 0, 0.02, 0.5, 0.09, 0.11, 0.05, 8, 6)
      k.part(body, 'ice', torus(0.12, 0.018, 4, 14), 0, 0.02, 0.5)
      core = liveGlow('#7fd8ff', 3)
    }
    const gl = liveGlow(warden ? '#d8f6ff' : '#7fd8ff', 3)
    const mats: Record<string, THREE.Material> = {
      fur: warden ? fur('#9aaec4', '#7fd8ff', 0.3) : fur('#e2eaf2', '#9fe7ff', 0.3),
      belly: warden ? fur('#c4d0dc', '#9fe7ff', 0.2) : fur('#c8d8e8', '#9fe7ff', 0.2),
      mouth: flesh('#1a1020', '#7fd8ff', 0.2, 0.2),
      claw: smooth('#2a3440', '#9fe7ff', 0.3, 0.3),
      ice: ice(),
      glow: gl,
    }
    if (core) mats.core = core
    k.finish(mats)
    const ph = b.L.ph
    return view(b, warden ? 1.18 : 1, 1.35, (t) => {
      const L = b.L
      const mv = L.move
      legs.forEach((l, i) => {
        const [sw] = stepOf(L.walk, i * 0.5)
        pose(l, -sw * 0.5 * mv)
      })
      // 搖擺的蹦跳步
      const st = L.strike * L.atk
      shift(body, 0, Math.abs(Math.sin(L.walk)) * 0.07 * mv + L.breathe(t, 1.5) * 0.015, Math.max(0, st) * 0.12)
      pose(body, Math.max(0, st) * 0.2 - Math.max(0, -st) * 0.15, 0, Math.sin(L.walk) * 0.09 * mv)
      body.scale.set(1 + L.breathe(t, 1.5) * 0.025, 1 - Math.abs(Math.sin(L.walk)) * 0.04 * mv, 1 + L.breathe(t, 1.5) * 0.025)
      // 手臂：走路甩動；攻擊雙手高舉 → 往下搥
      arms.forEach((a, i) => {
        const sw = Math.sin(L.walk + i * Math.PI) * 0.35 * mv
        pose(a.sh, sw - Math.max(0, -st) * 2.4 - Math.max(0, st) * 0.6 + Math.sin(t * 0.8 + ph + i) * 0.04, 0, 0)
        pose(a.el, -Math.max(0, -st) * 0.5 - L.cast * 0.5)
      })
      pose(jaw, 0.05 + L.atk * 0.5 + Math.sin(t * 0.9 + ph) * 0.04)
      gl.emissiveIntensity = (2.6 + L.atk * 1.5) * (Math.sin(t * 0.8 + ph) > 0.985 ? 0.2 : 1) * (1 - L.dead)
      if (core) pulse(core, 3, t, L, 1.6)
      if (L.dead > 0) {
        pose(body, -L.dead * 1.2)
        shift(body, 0, -L.dead * 0.28, -L.dead * 0.2)
        for (const a of arms) pose(a.sh, -L.dead * 1.2)
      }
    })
  }
}

regModel('creature.snowgle', snowgle(false))
regModel('creature.snowgleWarden', snowgle(true))

// ═════════════ 畸人 ═════════════
// 駝背、歪向一邊的瘦長人形：左右腳不一樣長（一跛一跛）、右臂長到拖地、指頭融成骨刃；左臂萎縮蜷在胸前。
// 頭小、往一側歪成不自然的角度、只剩一隻發黃光的眼（另一隻縫死）、嘴是一道縫起來的直縫；肋骨與脊椎外露、身上有瘀青。

regModel('creature.freakman', (def, s) => {
  const b = base(def, s, 5, 0.9)
  const k = new BoneKit('freakman', b.root)
  const root = k.bone(null)
  const hips = k.bone(root, 0, 0.92, 0)
  k.ell(hips, 'skin', 0, 0, 0, 0.17, 0.12, 0.13, 8, 6)
  k.part(hips, 'rag', lumpGeo(1, 77, 0.3, 10, 6), 0, -0.06, 0, 0.21, 0.15, 0.17)
  const torso = k.bone(hips, 0, 0.08, 0, 0.55, 0, 0.18)
  k.ell(torso, 'skin', 0, 0.28, 0, 0.19, 0.3, 0.15)
  k.part(torso, 'skin', lumpGeo(1, 12, 0.25, 10, 7), 0.04, 0.12, 0.07, 0.15, 0.13, 0.12)
  for (let i = 0; i < 6; i++) k.ell(torso, 'bone', 0, 0.06 + i * 0.09, -0.135, 0.035, 0.03, 0.03, 6, 4)
  // 外露的肋骨（一側）
  for (let i = 0; i < 3; i++) k.part(torso, 'bone', torus(0.12, 0.012, 3, 10, Math.PI * 0.6), -0.06, 0.24 + i * 0.07, 0.05, 1, 1, 1, HALF, 0, Math.PI * 0.35)
  // 瘀青與縫線
  k.ell(torso, 'bruise', 0.12, 0.35, 0.08, 0.07, 0.09, 0.03, 6, 4, 0, 0.6, 0)
  k.ell(torso, 'bruise', -0.1, 0.12, 0.1, 0.06, 0.05, 0.02, 6, 4, 0, -0.5, 0)
  k.part(torso, 'stitch', box(0.012, 0.3, 0.012), 0.03, 0.3, 0.15, 1, 1, 1, 0.2, 0, 0.15)
  for (let i = 0; i < 5; i++) k.part(torso, 'stitch', box(0.05, 0.01, 0.01), 0.03 + (i - 2) * 0.008, 0.18 + i * 0.06, 0.153, 1, 1, 1, 0.2, 0, 0.15)
  // 歪掉的小頭
  const neck = k.bone(torso, 0.02, 0.56, 0.03, -0.35)
  k.ell(neck, 'skin', 0, 0.05, 0, 0.055, 0.08, 0.055, 6, 4)
  const head = k.bone(neck, 0, 0.1, 0.02, -0.25, 0.2, 0.75)
  k.part(head, 'skin', lumpGeo(1, 5, 0.18, 10, 8), 0, 0.07, 0.02, 0.095, 0.13, 0.1)
  k.ell(head, 'glow', 0.04, 0.09, 0.105, 0.03, 0.026, 0.015, 6, 4)
  k.ell(head, 'dark', 0.04, 0.09, 0.098, 0.04, 0.034, 0.012, 6, 4)
  for (const sd of [-1, 1]) k.part(head, 'stitch', box(0.05, 0.008, 0.008), -0.045, 0.09, 0.1, 1, 1, 1, 0, 0, sd * 0.7)
  k.ell(head, 'dark', 0, 0.0, 0.108, 0.012, 0.055, 0.01, 6, 4)
  for (let i = 0; i < 4; i++) k.part(head, 'stitch', box(0.04, 0.008, 0.008), 0, -0.035 + i * 0.025, 0.112)
  // 右臂：長到拖地、骨刃手指
  const sh = k.bone(torso, 0.24, 0.48, 0, 0, 0, 0.15)
  k.ell(sh, 'skin', 0, 0, 0, 0.075, 0.07, 0.075, 6, 4)
  k.ell(sh, 'skin', 0, -0.26, 0, 0.06, 0.28, 0.06, 8, 5)
  const el = k.bone(sh, 0, -0.52, 0, -0.2)
  k.ell(el, 'skin', 0, -0.28, 0, 0.055, 0.3, 0.055, 8, 5)
  k.ell(el, 'bruise', 0.03, -0.2, 0.03, 0.04, 0.1, 0.03, 6, 4)
  const hand = k.bone(el, 0, -0.58, 0)
  k.ell(hand, 'skin', 0, -0.03, 0, 0.05, 0.05, 0.04, 6, 4)
  for (let i = 0; i < 3; i++) k.part(hand, 'bone', hornGeo(0.3 - i * 0.05, 0.022, 0.4, 6, 4), (i - 1) * 0.03, -0.04, 0.0, 1, 1, 1, Math.PI - 0.25, 0, (i - 1) * 0.12)
  // 左臂：萎縮、蜷在胸前
  const shL = k.bone(torso, -0.2, 0.46, 0.04, -0.9, 0, -0.3)
  k.ell(shL, 'skin', 0, -0.07, 0, 0.035, 0.09, 0.035, 6, 4)
  const elL = k.bone(shL, 0, -0.15, 0, -1.7)
  k.ell(elL, 'skin', 0, -0.06, 0, 0.03, 0.08, 0.03, 6, 4)
  for (let i = 0; i < 2; i++) k.part(elL, 'bone', spikeGeo(0.01, 0.06, 4), (i - 0.5) * 0.02, -0.14, 0, 1, 1, 1, Math.PI)
  // 腿：左腿正常、右腿短而屈（跛）
  const legs = [qLeg(k, hips, 'skin', -0.1, -0.05, 0, 0.87, 0.46, -0.12, 0.1, 0.07, 0.05, false, 8, 5), qLeg(k, hips, 'skin', 0.1, -0.05, 0, 0.87, 0.4, -0.55, 0.5, 0.065, 0.045, false, 8, 5)]
  for (const l of legs) k.ell(l.foot, 'skin', 0, 0.02, 0.05, 0.05, 0.03, 0.1, 6, 4)
  const gl = liveGlow('#e8ff5a', 3.2)
  k.finish({
    skin: flesh('#b4a888', '#d8ff7a', 0.5, 0.25),
    bruise: flesh('#5a4a64', '#d8ff7a', 0.45, 0.2),
    bone: smooth('#e0d4b4', '#d8ff7a', 0.5, 0.25),
    stitch: rubberPart('#16100e', '#d8ff7a'),
    dark: flesh('#1a0c0e', '#d8ff7a', 0.3, 0.15),
    rag: fur('#4a4036', '#d8ff7a', 0.15),
    glow: gl,
  })
  const ph = b.L.ph
  let jerk = 0
  let jerkDir = 1
  return view(b, 1.08, 2.0, (t, dt) => {
    const L = b.L
    const mv = L.move
    const legsL = legs as QLeg[]
    legsL.forEach((l, i) => {
      const [sw, lift] = stepOf(L.walk, i * 0.5)
      animQLeg(l, sw, lift, mv, 0.45, 0.9)
    })
    // 跛行：短腳著地那一步整個人往下沉、往右倒
    const limp = Math.max(0, Math.sin(L.walk + Math.PI)) * mv
    shift(hips, 0, -limp * 0.08 + Math.abs(Math.cos(L.walk)) * 0.02 * mv, 0)
    pose(hips, 0, Math.sin(L.walk) * 0.12 * mv, limp * 0.12)
    const st = L.strike * L.atk
    const br = L.breathe(t, 1.1)
    pose(torso, br * 0.03 + mv * 0.1 - Math.max(0, -st) * 0.35 + Math.max(0, st) * 0.3, st * 0.4, Math.sin(t * 0.4 + ph) * 0.05)
    // 抽搐：偶爾猛地一歪頭
    jerk = Math.max(0, jerk - dt * 5)
    if (jerk === 0 && Math.random() < dt * 0.5) {
      jerk = 1
      jerkDir = Math.random() < 0.5 ? -1 : 1
    }
    pose(head, Math.sin(t * 0.6 + ph) * 0.1, Math.sin(t * 0.3 + ph) * 0.3, Math.sin(t * 0.25) * 0.15 + jerk * jerkDir * 0.5)
    // 長臂：拖在身側晃；攻擊時高舉過頭再劈下
    pose(sh, -Math.max(0, -st) * 2.6 + Math.max(0, st) * 0.4 + Math.sin(L.walk) * 0.15 * mv + Math.sin(t * 0.7 + ph) * 0.04, 0, -Math.max(0, -st) * 0.3)
    pose(el, -Math.max(0, -st) * 0.4 + Math.max(0, st) * 0.2)
    pose(hand, Math.sin(t * 5 + ph) * 0.05 + Math.sin(t * 13) * 0.03)
    pose(shL, Math.sin(t * 2.3 + ph) * 0.06)
    gl.emissiveIntensity = (2.8 + Math.sin(t * 7 + ph) * 0.4 + L.atk * 1.5) * (1 - L.dead)
    if (L.dead > 0) {
      // 往前撲倒
      pose(root, L.dead * 1.45)
      shift(root, 0, L.dead * 0.12, 0)
    }
  })
})
