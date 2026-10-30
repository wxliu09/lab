// 程序化人物：略誇張的英雄比例、收藏公仔質感（美術聖經 §8）。正面朝 local +Z。
import * as THREE from 'three'
import { box, capsule, cyl, rbox, sphere, torus } from '../batch'
import { Mat } from '../materials'

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

interface Look {
  suit: string
  trim: string
  skin: string
  hair: string
  helmet: boolean
  extra?: (r: Rig, playerColor: string) => void
}

const SKINS = ['#e0b49a', '#c8946f', '#8d5a3b', '#f1cdb4', '#a8774f']

const LOOKS: Record<string, Look> = {
  researcher: {
    suit: '#d6dde1',
    trim: '#33ffd1',
    skin: SKINS[0],
    hair: '#3a2a22',
    helmet: false,
    extra: (r) => {
      // 白袍下擺
      const coat = mesh(rbox(0.5, 0.42, 0.32, 0.08), Mat.fabric('#e9eef0'))
      coat.position.set(0, -0.32, 0)
      r.torso.add(coat)
      const pad = mesh(rbox(0.16, 0.2, 0.03, 0.02), Mat.screen(screenTexCache('#33ffd1'), 1.2))
      pad.position.set(0.12, 0.02, 0.2)
      r.torso.add(pad)
    },
  },
  security: {
    suit: '#2b394c',
    trim: '#9fe7ff',
    skin: SKINS[1],
    hair: '#1d1a18',
    helmet: true,
    extra: (r) => {
      const vest = mesh(rbox(0.5, 0.42, 0.34, 0.06), Mat.metal('#3d4a5a', 0.5))
      vest.position.set(0, 0.04, 0)
      r.torso.add(vest)
    },
  },
  medic: {
    suit: '#e7ecee',
    trim: '#5cf2a5',
    skin: SKINS[3],
    hair: '#5a3a2a',
    helmet: false,
    extra: (r) => {
      const cross = mesh(box(0.14, 0.04, 0.01), Mat.emissive('#ff4a4a', 1.4))
      cross.position.set(0, 0.06, 0.205)
      const cross2 = mesh(box(0.04, 0.14, 0.01), Mat.emissive('#ff4a4a', 1.4))
      cross2.position.set(0, 0.06, 0.205)
      r.torso.add(cross, cross2)
      const bag = mesh(rbox(0.22, 0.18, 0.12, 0.04), Mat.fabric('#b8c4c8'))
      bag.position.set(-0.24, -0.28, 0.02)
      r.torso.add(bag)
    },
  },
  captain: {
    suit: '#1e2938',
    trim: '#ffc23d',
    skin: SKINS[2],
    hair: '#cfcfcf',
    helmet: false,
    extra: (r) => {
      for (const s of [-1, 1]) {
        const ep = mesh(rbox(0.16, 0.04, 0.14, 0.02), Mat.metal('#ffc23d', 0.9, false))
        ep.position.set(s * 0.22, 0.24, 0)
        r.torso.add(ep)
      }
      const cap = mesh(cyl(0.15, 0.15, 0.07, 18), Mat.fabric('#1e2938'))
      cap.position.set(0, 0.17, 0)
      const brim = mesh(cyl(0.17, 0.17, 0.015, 18), Mat.metal('#111', 0.4))
      brim.position.set(0, 0.135, 0.04)
      r.head.add(cap, brim)
    },
  },
  janitor: {
    suit: '#5a6638',
    trim: '#ffc23d',
    skin: SKINS[4],
    hair: '#2a2018',
    helmet: false,
    extra: (r) => {
      const belt = mesh(torus(0.22, 0.035, 6, 20), Mat.rubber('#2a2418'))
      belt.rotation.x = Math.PI / 2
      belt.position.y = -0.24
      r.torso.add(belt)
      const mop = mesh(cyl(0.015, 0.015, 1.2, 6), Mat.metal('#8a8a7a', 0.4))
      mop.position.set(-0.05, 0.1, -0.2)
      mop.rotation.z = 0.35
      r.torso.add(mop)
    },
  },
  ceo: {
    suit: '#26262c',
    trim: '#e6e6e6',
    skin: SKINS[3],
    hair: '#6a4a2a',
    helmet: false,
    extra: (r) => {
      const shirt = mesh(box(0.1, 0.28, 0.01), Mat.fabric('#e8e8ea'))
      shirt.position.set(0, 0.06, 0.205)
      const tie = mesh(box(0.035, 0.22, 0.012), Mat.fabric('#a02a2a'))
      tie.position.set(0, 0.04, 0.212)
      r.torso.add(shirt, tie)
    },
  },
  commissar: {
    suit: '#18181c',
    trim: '#c8323c',
    skin: SKINS[0],
    hair: '#151515',
    helmet: false,
    extra: (r) => {
      const band = mesh(cyl(0.075, 0.075, 0.07, 12), Mat.fabric('#c8323c'))
      band.position.set(0, -0.08, 0)
      r.armL.add(band)
      const cap = mesh(cyl(0.16, 0.13, 0.1, 18), Mat.fabric('#18181c'))
      cap.position.set(0, 0.18, -0.01)
      const badge = mesh(box(0.06, 0.04, 0.01), Mat.metal('#c8323c', 0.6, false))
      badge.position.set(0, 0.19, 0.13)
      r.head.add(cap, badge)
    },
  },
  engineer: {
    suit: '#c26a2a',
    trim: '#ffc23d',
    skin: SKINS[1],
    hair: '#3a2a1a',
    helmet: true,
    extra: (r) => {
      const belt = mesh(torus(0.22, 0.035, 6, 20), Mat.rubber('#3a2a18'))
      belt.rotation.x = Math.PI / 2
      belt.position.y = -0.24
      r.torso.add(belt)
      for (const s of [-1, 1]) {
        const pouch = mesh(rbox(0.08, 0.1, 0.06, 0.02), Mat.fabric('#5a4a2a'))
        pouch.position.set(s * 0.16, -0.27, 0.15)
        r.torso.add(pouch)
      }
    },
  },
  corporal: {
    suit: '#4b5a46',
    trim: '#9fe7ff',
    skin: SKINS[2],
    hair: '#1a1a1a',
    helmet: true,
    extra: (r) => {
      const vest = mesh(rbox(0.5, 0.4, 0.34, 0.06), Mat.metal('#56634e', 0.4))
      r.torso.add(vest)
    },
  },
  ace: {
    suit: '#46597a',
    trim: '#ffb46b',
    skin: SKINS[3],
    hair: '#6a3a1a',
    helmet: true,
    extra: (r) => {
      const scarf = mesh(torus(0.11, 0.035, 6, 16), Mat.fabric('#e8e0d0'))
      scarf.rotation.x = Math.PI / 2
      scarf.position.y = 0.27
      r.torso.add(scarf)
    },
  },
}

const scrCache = new Map<string, THREE.Texture>()
function screenTexCache(color: string): THREE.Texture {
  let t = scrCache.get(color)
  if (!t) {
    const c = document.createElement('canvas')
    c.width = c.height = 64
    const x = c.getContext('2d')!
    x.fillStyle = '#021'
    x.fillRect(0, 0, 64, 64)
    x.fillStyle = color
    for (let i = 0; i < 6; i++) x.fillRect(6, 8 + i * 9, 20 + ((i * 17) % 34), 4)
    t = new THREE.CanvasTexture(c)
    t.colorSpace = THREE.SRGBColorSpace
    scrCache.set(color, t)
  }
  return t
}

function mesh(g: THREE.BufferGeometry, m: THREE.Material): THREE.Mesh {
  const o = new THREE.Mesh(g, m)
  o.castShadow = true
  o.receiveShadow = true
  return o
}

function grp(parent: THREE.Object3D, x: number, y: number, z: number): THREE.Group {
  const g = new THREE.Group()
  g.position.set(x, y, z)
  parent.add(g)
  return g
}

/** 建立人物骨架；classId 決定外觀，playerColor 標在肩章 */
export function buildHuman(classId: string, playerColor: string, seed = 0): Rig {
  const look = LOOKS[classId] ?? LOOKS.researcher
  const suit = Mat.cloth(look.suit, look.trim)
  const dark = Mat.rubber('#22262b')
  const skin = Mat.skin(SKINS[seed % SKINS.length] ?? look.skin)
  const pc = Mat.armor(playerColor, playerColor)
  const trimEmi = Mat.emissive(look.trim, 1.6)
  const root = new THREE.Group()
  const body = grp(root, 0, 0, 0)
  // 骨盆
  const hip = grp(body, 0, 0.95, 0)
  hip.add(mesh(rbox(0.36, 0.2, 0.24, 0.07), suit))
  // 腿
  const leg = (side: number): [THREE.Group, THREE.Group] => {
    const thigh = grp(hip, side * 0.11, -0.04, 0)
    const t = mesh(capsule(0.085, 0.3, 4, 10), suit)
    t.position.y = -0.2
    thigh.add(t)
    const knee = grp(thigh, 0, -0.42, 0)
    const pad = mesh(rbox(0.13, 0.1, 0.06, 0.03), Mat.metal('#4a535c', 0.5))
    pad.position.set(0, 0, 0.07)
    knee.add(pad)
    const s = mesh(capsule(0.075, 0.3, 4, 10), suit)
    s.position.y = -0.2
    knee.add(s)
    const boot = mesh(rbox(0.15, 0.12, 0.26, 0.04), dark)
    boot.position.set(0, -0.42, 0.04)
    knee.add(boot)
    return [thigh, knee]
  }
  const [legL, shinL] = leg(-1)
  const [legR, shinR] = leg(1)
  // 軀幹
  const torso = grp(hip, 0, 0.36, 0)
  const chest = mesh(rbox(0.48, 0.52, 0.32, 0.1), suit)
  torso.add(chest)
  const collar = mesh(rbox(0.26, 0.08, 0.22, 0.03), dark)
  collar.position.y = 0.27
  torso.add(collar)
  const trim = mesh(box(0.42, 0.025, 0.01), trimEmi)
  trim.position.set(0, 0.12, 0.165)
  torso.add(trim)
  // 背包
  const pack = mesh(rbox(0.36, 0.38, 0.16, 0.05), Mat.metal('#4a535c', 0.6))
  pack.position.set(0, 0.02, -0.22)
  torso.add(pack)
  const packLight = mesh(box(0.2, 0.03, 0.01), trimEmi)
  packLight.position.set(0, 0.12, -0.305)
  torso.add(packLight)
  // 頭
  const head = grp(torso, 0, 0.42, 0.01)
  head.add(mesh(sphere(0.135, 18, 14), skin))
  if (look.helmet) {
    const helm = mesh(sphere(0.155, 18, 12), Mat.metal('#3a4550', 0.5))
    helm.scale.set(1, 0.9, 1.05)
    helm.position.y = 0.03
    head.add(helm)
    const visor = mesh(rbox(0.22, 0.07, 0.06, 0.03), Mat.emissive(look.trim, 1.2))
    visor.position.set(0, 0.0, 0.13)
    head.add(visor)
  } else {
    const hair = mesh(sphere(0.142, 16, 10, ), Mat.fabric(look.hair))
    hair.scale.set(1, 0.7, 1)
    hair.position.set(0, 0.06, -0.015)
    head.add(hair)
    for (const s of [-1, 1]) {
      const eye = mesh(sphere(0.018, 6, 4), Mat.rubber('#111'))
      eye.position.set(s * 0.045, 0.01, 0.125)
      head.add(eye)
    }
  }
  // 手臂
  const arm = (side: number): [THREE.Group, THREE.Group] => {
    const sh = grp(torso, side * 0.3, 0.2, 0)
    const pad = mesh(rbox(0.17, 0.12, 0.2, 0.05), pc)
    pad.position.y = 0.04
    sh.add(pad)
    const up = mesh(capsule(0.07, 0.22, 4, 10), suit)
    up.position.y = -0.16
    sh.add(up)
    const el = grp(sh, 0, -0.32, 0)
    const fo = mesh(capsule(0.062, 0.2, 4, 10), suit)
    fo.position.y = -0.13
    el.add(fo)
    const hand = mesh(sphere(0.06, 10, 8), Mat.rubber('#2a2e33'))
    hand.position.y = -0.3
    el.add(hand)
    return [sh, el]
  }
  const [armL, foreL] = arm(-1)
  const [armR, foreR] = arm(1)
  // 手槍
  const gun = new THREE.Group()
  gun.position.set(0, -0.3, 0.05)
  foreR.add(gun)
  const g1 = mesh(rbox(0.06, 0.09, 0.22, 0.02), Mat.metal('#2a2e33', 0.8))
  g1.position.z = 0.06
  gun.add(g1)
  const muzzle = new THREE.Object3D()
  muzzle.position.set(0, 0.0, 0.2)
  gun.add(muzzle)
  const lamp = new THREE.Object3D()
  lamp.position.set(0, 0.25, 0.25)
  torso.add(lamp)
  const rig: Rig = { root, body, torso, head, armL, armR, foreL, foreR, legL, legR, shinL, shinR, muzzle, lamp, phase: seed, height: 1.85, extra: [] }
  look.extra?.(rig, playerColor)
  return rig
}

/** 程序化動畫：idle 呼吸、走路、攻擊、施法、死亡 */
export function animateRig(r: Rig, dt: number, t: number, moving: number, state: number, deadT: number): void {
  const speed = moving
  if (state === 4) {
    // 死亡：倒地
    const k = Math.min(1, deadT * 2.2)
    const e = 1 - (1 - k) * (1 - k)
    r.body.rotation.x = -e * Math.PI * 0.48
    r.body.position.y = e * 0.18
    r.armL.rotation.x = -e * 1.2
    r.armR.rotation.x = -e * 0.7
    return
  }
  r.body.rotation.x = 0
  if (speed > 0.05) {
    r.phase += dt * (5.5 + speed * 1.4)
    const s = Math.sin(r.phase)
    const c = Math.cos(r.phase)
    const amp = Math.min(1, speed / 3)
    r.legL.rotation.x = s * 0.65 * amp
    r.legR.rotation.x = -s * 0.65 * amp
    r.shinL.rotation.x = Math.max(0, -c) * 0.9 * amp
    r.shinR.rotation.x = Math.max(0, c) * 0.9 * amp
    r.armL.rotation.x = -s * 0.45 * amp
    r.armR.rotation.x = state === 2 ? -1.35 : s * 0.45 * amp
    r.body.position.y = Math.abs(c) * 0.05 * amp
    r.torso.rotation.y = s * 0.08 * amp
    r.torso.rotation.x = 0.08 * amp
  } else {
    // 放鬆回到站姿
    const k = Math.min(1, dt * 8)
    r.legL.rotation.x *= 1 - k
    r.legR.rotation.x *= 1 - k
    r.shinL.rotation.x *= 1 - k
    r.shinR.rotation.x *= 1 - k
    r.armL.rotation.x *= 1 - k
    r.torso.rotation.y *= 1 - k
    r.torso.rotation.x *= 1 - k
    r.body.position.y = Math.sin(t * 1.6 + r.phase) * 0.008
    r.torso.scale.y = 1 + Math.sin(t * 1.6 + r.phase) * 0.012
    if (state === 2) r.armR.rotation.x = -1.4
    else if (state === 3 || state === 5) {
      r.armR.rotation.x = -0.9 + Math.sin(t * 6) * 0.08
      r.armL.rotation.x = -0.9 - Math.sin(t * 6) * 0.08
    } else r.armR.rotation.x *= 1 - k
  }
  for (const f of r.extra) f(t, dt)
}
