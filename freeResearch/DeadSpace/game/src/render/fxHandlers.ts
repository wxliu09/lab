// 特效 id → 視覺（美術聖經 §11）。sim 只送事件，這裡決定長相。
// 攻擊與投射物的樣式在 LOOKS；技能、事件、效果原語、太空事件在 ./fx/*.ts
import * as THREE from 'three'
import { regFx } from './fxBinding'
import { W } from './stationBuilder'
import type { GameScene } from './gameScene'
import { sfx } from '../audio/sfx'
import { GEO } from './fx'
import { fxTex } from './fx/tex'
import { beam, bolt, burst, entPos, hot, muzzleOf, posOf, screenFlash, shake } from './fx/kit'
import { Mat } from './materials'
import { rockMat } from './fx/mats'
// 技能、事件、效果原語、太空事件
import './fx/abilities'
import './fx/primitives'
import './fx/space'

type Style =
  | 'tracer'
  | 'orb'
  | 'bolt'
  | 'flame'
  | 'beam'
  | 'rocket'
  | 'spit'
  | 'claw'
  | 'arc'
  | 'chrono'
  | 'fireball'
  | 'spine'
  | 'silk'
  | 'spore'
  | 'lob'
  | 'wave'
  | 'grenade'

interface Look {
  color: string
  /** 第二色（拖尾、外圈）*/
  color2?: string
  /** 曳光寬度 */
  w?: number
  /** 飛行物大小 */
  size?: number
  muzzle?: number
  hit?: number
  trail?: boolean
  sound?: string
  /** 命中音 */
  hitSound?: string
  style?: Style
  /** lob：投擲物外形 */
  shape?: 'flask' | 'rock' | 'wrench' | 'debris'
  /** wave：地面波的種類 */
  wave?: 'energy' | 'dust' | 'goo'
}

export const LOOKS: Record<string, Look> = {
  pistol: { color: '#ffd9a0', w: 0.03, muzzle: 0.12, hit: 0.1, sound: 'pistol', style: 'tracer' },
  rifle: { color: '#ffe0a8', w: 0.035, muzzle: 0.15, hit: 0.12, sound: 'rifle', style: 'tracer' },
  heavyRifle: { color: '#ffc880', w: 0.05, muzzle: 0.2, hit: 0.16, sound: 'heavy', style: 'tracer' },
  plasma: { color: '#5cf2a5', size: 0.16, hit: 0.25, sound: 'plasma', style: 'orb' },
  tesla: { color: '#7fd8ff', w: 0.04, hit: 0.2, sound: 'zap', style: 'bolt' },
  cryo: { color: '#bfefff', color2: '#7fd8ff', size: 0.12, hit: 0.2, sound: 'cryo', style: 'orb' },
  flame: { color: '#ff8a2a', color2: '#ff3b1a', hit: 0.15, sound: 'flame', style: 'flame' },
  photon: { color: '#fff2a8', w: 0.05, hit: 0.18, sound: 'laser', style: 'beam' },
  saw: { color: '#ffd080', w: 0.025, hit: 0.12, sound: 'saw', style: 'tracer' },
  void: { color: '#9b5de5', color2: '#2a0a4a', size: 0.14, hit: 0.22, sound: 'void', style: 'orb' },
  mirage: { color: '#c9b6ff', w: 0.035, hit: 0.1, sound: 'rifle', style: 'tracer' },
  rad: { color: '#7dff6a', size: 0.13, hit: 0.2, sound: 'plasma', style: 'orb' },
  operative: { color: '#ff7a6a', w: 0.04, muzzle: 0.2, hit: 0.15, sound: 'heavy', style: 'tracer' },
  acid: { color: '#b6ff3a', color2: '#5a8a10', size: 0.12, hit: 0.2, sound: 'spit', hitSound: 'splat', style: 'spit' },
  gatling: { color: '#ffe0a8', w: 0.025, muzzle: 0.1, hit: 0.07, sound: 'gatling', style: 'tracer' },
  force: { color: '#e8f6ff', size: 0.15, hit: 0.25, sound: 'force', style: 'orb' },
  mag: { color: '#33ffd1', size: 0.08, hit: 0.15, sound: 'mag', style: 'orb' },
  pulse: { color: '#ff7eb6', w: 0.06, hit: 0.15, sound: 'laser', style: 'beam' },
  rocket: { color: '#ffb46b', size: 0.14, hit: 0.5, sound: 'rocket', style: 'rocket', trail: true },
  grenade: { color: '#ffc23d', size: 0.1, hit: 0.5, sound: 'thump', style: 'grenade' },
  claw: { color: '#ff5a4a', hit: 0.14, sound: 'claw', style: 'claw' },
  bite: { color: '#ff5a4a', hit: 0.14, sound: 'bite', style: 'claw' },
  xeno: { color: '#33ffd1', color2: '#7a3cff', size: 0.14, hit: 0.2, sound: 'spit', hitSound: 'splat', style: 'spit' },
  stationGun: { color: '#9fe7ff', size: 0.35, hit: 1.2, sound: 'heavy', style: 'orb' },
  lightning: { color: '#c9e8ff', w: 0.08, hit: 0.4, sound: 'zap', style: 'bolt' },
  shipGun: { color: '#9fe7ff', size: 0.18, hit: 0.6, sound: 'heavy', style: 'orb' },
  // ── 異形 ──
  xenoArc: { color: '#33ffd1', color2: '#7a3cff', hit: 0.2, sound: 'arc', style: 'arc' },
  xenoOrb: { color: '#b28cff', color2: '#33ffd1', size: 0.16, hit: 0.3, sound: 'void', style: 'orb' },
  chrono: { color: '#ffd27a', color2: '#7fd8ff', w: 0.05, hit: 0.25, sound: 'chrono', style: 'chrono' },
  fire: { color: '#ffb040', color2: '#ff3b1a', size: 0.15, hit: 0.3, sound: 'fireball', hitSound: 'flame', style: 'fireball' },
  skyfire: { color: '#9fe7ff', color2: '#ff8a2a', size: 0.15, hit: 0.3, sound: 'fireball', hitSound: 'zap', style: 'fireball' },
  silk: { color: '#eaf6ff', size: 0.07, hit: 0.15, sound: 'silk', hitSound: 'splat', style: 'silk' },
  // ── 變種人 ──
  mutSpine: { color: '#f2e6c8', color2: '#c8323c', size: 0.1, hit: 0.25, sound: 'spine', hitSound: 'bite', style: 'spine' },
  hiveSpore: { color: '#e8b04a', color2: '#c8323c', size: 0.3, hit: 0.9, sound: 'spore', hitSound: 'splat', style: 'spore' },
  rock: { color: '#8a7a68', size: 0.36, hit: 0.5, sound: 'throw', style: 'lob', shape: 'rock' },
  sludge: { color: '#7a8a3a', color2: '#3a3a14', size: 0.5, hit: 0.4, sound: 'sludge', hitSound: 'splat', style: 'wave', wave: 'goo' },
  quake: { color: '#a08a6a', size: 0.6, hit: 0.4, sound: 'rumble', style: 'wave', wave: 'dust' },
  // ── 仿生人、防護服、道具 ──
  pulseWave: { color: '#ffb000', color2: '#ff6a00', size: 0.7, hit: 0.4, sound: 'pulseWave', style: 'wave', wave: 'energy' },
  acidSpit: { color: '#c8ff3a', color2: '#5a8a10', size: 0.18, hit: 0.35, sound: 'spit', hitSound: 'splat', style: 'spit' },
  flask: { color: '#7dff6a', size: 0.12, hit: 0.3, sound: 'throw', hitSound: 'glass', style: 'lob', shape: 'flask' },
  wrench: { color: '#b0b8c0', size: 0.2, hit: 0.2, sound: 'throw', hitSound: 'clang', style: 'lob', shape: 'wrench' },
  debris: { color: '#8a8078', size: 0.3, hit: 0.3, sound: 'throw', style: 'lob', shape: 'debris' },
}

function look(id?: string): Look {
  return LOOKS[id ?? ''] ?? { color: '#ffe0a8', w: 0.03, hit: 0.1, style: 'tracer' }
}

// ───────── 共用 geometry ─────────

/** 揮砍弧（水平半圈，沿 +X 展開）*/
const arcGeo = new THREE.TorusGeometry(1, 0.05, 3, 28, Math.PI * 0.95).rotateX(Math.PI / 2)
arcGeo.userData.shared = true
/** 地面波前（直立的弧面，凸向 +Z）*/
const waveGeo = new THREE.CylinderGeometry(1, 1, 1, 18, 1, true, -Math.PI * 0.35, Math.PI * 0.7)
waveGeo.translate(0, 0.5, 0)
waveGeo.userData.shared = true

const metalMat = Mat.metal('#8a9096', 0.85, false)
metalMat.userData.keep = true

// ───────── 普攻（命中型）─────────

function clawMarks(gs: GameScene, z: number, x: number, y: number, h: number, from: { x: number; y: number }, color: string, n = 3): void {
  // 三道平行的斜爪痕，面向攻擊者、由左上劃到右下
  const g = new THREE.Group()
  g.rotation.y = Math.atan2(x - from.x, -(y - from.y))
  g.position.copy(W(x, y, h))
  const len = 0.62
  const slashes: THREE.Mesh[] = []
  for (let i = 0; i < n; i++) {
    const pivot = new THREE.Group()
    pivot.position.set((i - (n - 1) / 2) * 0.14, (i - (n - 1) / 2) * -0.04, 0)
    pivot.rotation.z = n === 2 ? (i ? -0.7 : 0.7) : -0.85
    const m = gs.fx.mesh(GEO.beam, hot(color, 0.45), 4.5)
    m.rotation.y = Math.PI / 2
    m.position.x = -len / 2
    m.scale.set(0.014, 0.014, 0.01)
    pivot.add(m)
    g.add(pivot)
    slashes.push(m)
  }
  const mats = slashes.map((m) => m.material as THREE.MeshBasicMaterial)
  gs.fx.addTransient(g, 0.24, z, (k) => {
    slashes.forEach((m, i) => (m.scale.z = len * Math.max(0.01, Math.min(1, k * 5 - i * 0.35))))
    mats.forEach((m) => (m.opacity = k < 0.3 ? 1 : (1 - (k - 0.3) / 0.7) ** 1.3))
  })
}

regFx('atk', (gs, w, f) => {
  const L = look(f.s)
  const from = muzzleOf(gs, f.e) ?? { x: f.x, y: f.y, h: 1.2 }
  const to = posOf(w, f.e2, f.x2 ?? f.x, f.y2 ?? f.y)
  const tp = entPos(gs, f.e2)
  const hitH = tp ? Math.min(1.3, Math.max(0.4, tp.h * 0.55)) : 1.0
  if (L.sound) sfx(L.sound, from.x, from.y)
  const style = L.style ?? 'tracer'
  const z = f.z
  switch (style) {
    case 'bolt': {
      bolt(gs, z, W(from.x, from.y, from.h), W(to.x, to.y, hitH), L.color, (L.w ?? 0.04) * 1.2, f.s === 'lightning' ? 0.22 : 0.14, { flicker: 0.05 })
      gs.fx.light(z, to.x, to.y, hitH + 0.3, L.color, 30, 5, 0.18, { flicker: 0.5 })
      gs.fx.emit(z, to.x, to.y, hitH, 10, { color: '#ffffff', color2: L.color, speed: 4, life: 0.3, size: 1, up: 0.6, grav: 5, layer: 'spark' })
      break
    }
    case 'flame': {
      const dx = to.x - from.x
      const dy = to.y - from.y
      const d = Math.hypot(dx, dy)
      gs.fx.emit(z, from.x, from.y, from.h, 16, { color: '#fff0b0', color2: L.color2 ?? '#ff3b1a', speed: d * 2.2, life: 0.42, size: 0.55, grow: 2.2, up: 0.12, drag: 3, dir: [dx, dy], spread: 0.16 })
      gs.fx.emit(z, from.x, from.y, from.h, 3, { color: '#2a2420', speed: d * 1.4, life: 1, size: 0.6, up: 0.5, drag: 2, dir: [dx, dy], spread: 0.25, layer: 'smoke', alpha: 0.4 })
      gs.fx.light(z, (from.x + to.x) / 2, (from.y + to.y) / 2, 0.9, '#ff8a2a', 18, 5, 0.25, { flicker: 0.4 })
      break
    }
    case 'beam':
      beam(gs, z, W(from.x, from.y, from.h), W(to.x, to.y, hitH), L.color, L.w ?? 0.05, 0.16)
      break
    case 'chrono': {
      beam(gs, z, W(from.x, from.y, from.h), W(to.x, to.y, hitH), L.color, L.w ?? 0.05, 0.22, { flow: L.color2, flowDir: 1 })
      gs.fx.ring(z, to.x, to.y, 0.5, 0.9, L.color, 0.5, { tex: 'clock', k: 2, spin: -4, h: 0.05 })
      gs.fx.emit(z, to.x, to.y, hitH, 8, { color: L.color2 ?? '#7fd8ff', speed: 0.6, life: 0.8, size: 0.16, up: 0.4, drag: 0.5 })
      break
    }
    case 'claw':
      clawMarks(gs, z, to.x, to.y, hitH, from, L.color, f.s === 'bite' ? 2 : 3)
      gs.fx.emit(z, to.x, to.y, hitH, 8, { color: '#ff4a3a', color2: '#5a0a0a', speed: 2.5, life: 0.4, size: 0.12, up: 0.4, grav: 9, layer: 'spark' })
      break
    case 'arc': {
      const g = new THREE.Group()
      const a1 = gs.fx.mesh(arcGeo, hot(L.color, 0.3), 4)
      const a2 = gs.fx.mesh(arcGeo, L.color2 ?? L.color, 2, { opacity: 0.5 })
      a2.scale.setScalar(1.15)
      g.add(a1, a2)
      g.position.copy(W(to.x, to.y, hitH))
      g.rotation.y = Math.atan2(-(to.y - from.y), to.x - from.x) + Math.PI / 2 + 0.6
      g.rotation.z = 0.35
      const m1 = a1.material as THREE.MeshBasicMaterial
      const m2 = a2.material as THREE.MeshBasicMaterial
      gs.fx.addTransient(g, 0.25, z, (k) => {
        g.scale.setScalar(0.4 + k * 0.5)
        g.rotation.y -= 0.12
        m1.opacity = (1 - k) ** 1.3
        m2.opacity = 0.5 * (1 - k)
      })
      gs.fx.emit(z, to.x, to.y, hitH, 12, { color: L.color, color2: L.color2, speed: 3, life: 0.35, size: 0.16, up: 0.5, drag: 3 })
      gs.fx.light(z, to.x, to.y, hitH, L.color, 14, 4, 0.2)
      break
    }
    default:
      gs.fx.tracer(z, from.x, from.y, from.h, to.x, to.y, hitH, L.color, L.w ?? 0.03)
      gs.fx.emit(z, to.x, to.y, hitH, 4, { color: '#fff0c8', color2: L.color, speed: 3.5, life: 0.25, size: 1, up: 0.5, grav: 9, layer: 'spark' })
  }
  if (L.muzzle) {
    gs.fx.flash(z, from.x, from.y, from.h, L.color, L.muzzle, 0.06)
    gs.fx.emit(z, from.x, from.y, from.h, 1, { color: '#6a6460', speed: 0.3, life: 0.6, size: 0.25, up: 1, layer: 'smoke', alpha: 0.25 })
  }
  if (style !== 'claw') gs.fx.emit(z, to.x, to.y, hitH, 5, { color: L.color, speed: 3, life: 0.25, size: 0.16, up: 0.6, grav: 6 })
  if (f.e2 === gs.world.me.unit) gs.damage = Math.min(1, gs.damage + 0.25)
})

// ───────── 投射物 ─────────

function projBody(gs: GameScene, L: Look): { g: THREE.Group; spin?: THREE.Object3D; light: boolean } {
  const g = new THREE.Group()
  const size = L.size ?? 0.1
  const style = L.style
  if (style === 'lob') {
    let body: THREE.Mesh
    if (L.shape === 'rock' || L.shape === 'debris') {
      body = new THREE.Mesh(GEO.dodeca, rockMat())
      body.scale.set(size, size * 0.8, size * 0.9)
    } else if (L.shape === 'wrench') {
      body = new THREE.Mesh(GEO.box, metalMat)
      body.scale.set(size * 1.6, size * 0.18, size * 0.35)
      const head = new THREE.Mesh(GEO.box, metalMat)
      head.scale.set(0.22, 1.8, 1.4)
      head.position.x = 0.5
      body.add(head)
    } else {
      // 試劑瓶：發光液體＋玻璃外殼
      body = gs.fx.mesh(GEO.sphere, L.color, 3)
      body.scale.setScalar(size * 0.7)
      const glass = gs.fx.mesh(GEO.sphereLo, '#e8fff0', 0.6, { opacity: 0.35 })
      glass.scale.setScalar(1.35)
      const neck = gs.fx.mesh(GEO.cyl, '#e8fff0', 0.8, { opacity: 0.4 })
      neck.scale.set(0.35, 1.4, 0.35)
      neck.position.y = 0.9
      body.add(glass, neck)
    }
    body.castShadow = false
    g.add(body)
    return { g, spin: body, light: L.shape === 'flask' }
  }
  if (style === 'rocket') {
    const body = new THREE.Mesh(GEO.beam, metalMat)
    body.scale.set(size * 0.35, size * 0.35, size * 2.4)
    body.position.z = -size * 1.2
    const flame = gs.fx.sprite('soft', '#ffd08a', 4)
    flame.scale.setScalar(size * 4)
    flame.position.z = -size * 1.4
    g.add(body, flame)
    return { g, light: true }
  }
  if (style === 'spine') {
    const n = gs.fx.mesh(GEO.cone, hot(L.color, 0.2), 2.2)
    n.rotation.x = Math.PI / 2
    n.scale.set(size * 0.35, size * 6, size * 0.35)
    n.position.z = -size * 3
    const glow = gs.fx.mesh(GEO.beam, L.color2 ?? L.color, 1.5, { opacity: 0.35 })
    glow.scale.set(size * 0.6, size * 0.6, size * 8)
    glow.position.z = -size * 8
    g.add(n, glow)
    return { g, light: false }
  }
  if (style === 'wave') {
    if (L.wave === 'energy') {
      const front = gs.fx.mesh(waveGeo, L.color, 3, { side: THREE.DoubleSide, map: fxTex('grad'), opacity: 0.9 })
      front.scale.set(size, size * 0.9, size * 0.6)
      const inner = gs.fx.mesh(waveGeo, hot(L.color, 0.5), 3, { side: THREE.DoubleSide, map: fxTex('grad'), opacity: 0.6 })
      inner.scale.set(size * 0.8, size * 0.6, size * 0.45)
      g.add(front, inner)
    }
    return { g, light: L.wave === 'energy' }
  }
  // 發光彈體：白熱核心＋有色光暈（多層）
  const core = gs.fx.mesh(style === 'spore' ? GEO.ico1 : GEO.sphere, style === 'spore' ? L.color : hot(L.color, 0.55), style === 'spore' ? 2 : 5)
  core.scale.setScalar(size * (style === 'grenade' ? 0.7 : 1))
  const halo = gs.fx.sprite('soft', L.color, 2.4)
  halo.scale.setScalar(size * (style === 'grenade' ? 3 : 6.5))
  g.add(core, halo)
  if (style === 'grenade') {
    const shell = new THREE.Mesh(GEO.sphere, metalMat)
    shell.scale.setScalar(size * 0.9)
    g.add(shell)
  }
  if (L.color2 && style === 'orb') {
    const outer = gs.fx.sprite('star', L.color2, 1.6)
    outer.scale.setScalar(size * 4)
    g.add(outer)
  }
  return { g, spin: style === 'spore' ? core : undefined, light: (L.size ?? 0) >= 0.12 }
}

function impact(gs: GameScene, z: number, L: Look, x: number, y: number, h: number, dir: [number, number]): void {
  const c = L.color
  const hit = L.hit ?? 0.2
  if (L.hitSound) sfx(L.hitSound, x, y)
  switch (L.style) {
    case 'spit':
      gs.fx.emit(z, x, y, h, 14, { color: c, color2: L.color2, speed: 2.6, life: 0.5, size: 0.16, up: 0.7, grav: 9 })
      gs.fx.decal(z, x, y, 0.5 + hit * 2, 'splat', c, 2.5, { add: true, k: 0.6, opacity: 0.7 })
      break
    case 'fireball':
      burst(gs, z, x, y, h, c, 0.6 + hit, { smoke: '#2a2420', color2: L.color2 })
      gs.fx.decal(z, x, y, 0.9, 'scorch', '#ffffff', 5, { opacity: 0.6 })
      break
    case 'spine':
      gs.fx.debris(z, x, y, h, 4, 'bone', { speed: 2.5, size: 0.05, life: 1.2 })
      gs.fx.emit(z, x, y, h, 8, { color: '#ff4a3a', color2: '#5a0a0a', speed: 3, life: 0.35, size: 1, up: 0.4, grav: 9, layer: 'spark' })
      break
    case 'silk':
      gs.fx.emit(z, x, y, h, 10, { color: '#ffffff', speed: 1.6, life: 0.5, size: 0.12, up: 0.3, grav: 4 })
      gs.fx.decal(z, x, y, 0.8, 'web', '#e8f6ff', 3, { add: true, k: 0.8, opacity: 0.6 })
      break
    case 'spore':
      gs.fx.flash(z, x, y, h, c, hit * 0.6, 0.25)
      gs.fx.emit(z, x, y, h, 30, { color: '#e8d04a', color2: '#7a8a20', speed: 3, life: 1.6, size: 0.3, up: 0.3, drag: 1.5 })
      gs.fx.debris(z, x, y, h, 6, 'flesh', { speed: 4, size: 0.1 })
      gs.fx.emit(z, x, y, h, 6, { color: '#5a3a2a', speed: 1.5, life: 1.8, size: 1, up: 0.2, layer: 'smoke', alpha: 0.5 })
      break
    case 'lob':
      if (L.shape === 'flask') {
        gs.fx.debris(z, x, y, h, 6, 'glass', { speed: 2.5, size: 0.05, life: 1, colors: ['#e8fff0'] })
        gs.fx.emit(z, x, y, h, 16, { color: c, speed: 2.4, life: 0.6, size: 0.2, up: 0.5, grav: 8 })
        gs.fx.emit(z, x, y, 0.3, 5, { color: '#5a8a3a', speed: 0.5, life: 1.8, size: 0.6, up: 0.6, layer: 'smoke', alpha: 0.4 })
        gs.fx.decal(z, x, y, 1.1, 'splat', c, 3, { add: true, k: 0.7, opacity: 0.6 })
      } else if (L.shape === 'wrench') {
        gs.fx.emit(z, x, y, h, 10, { color: '#ffffff', color2: '#ffd080', speed: 4, life: 0.3, size: 1, up: 0.6, grav: 9, layer: 'spark' })
      } else {
        gs.fx.debris(z, x, y, h, 6, 'rock', { speed: 3, size: 0.12 })
        gs.fx.emit(z, x, y, 0.3, 8, { color: '#7a6e60', speed: 1.4, life: 1.3, size: 0.7, up: 0.4, layer: 'smoke', alpha: 0.5 })
      }
      break
    case 'wave':
      if (L.wave === 'energy') burst(gs, z, x, y, 0.5, c, 0.8, { ring: false })
      break
    case 'grenade':
      gs.fx.emit(z, x, y, 0.2, 4, { color: '#8a8078', speed: 0.6, life: 0.6, size: 0.3, up: 0.5, layer: 'smoke', alpha: 0.35 })
      break
    case 'rocket':
      break
    default:
      gs.fx.flash(z, x, y, h, c, Math.max(0.12, hit * 0.7), 0.16)
      gs.fx.emit(z, x, y, h, 10, { color: c, color2: L.color2, speed: 3, life: 0.35, size: 0.22, up: 0.7, grav: 5 })
      gs.fx.emit(z, x, y, h, 6, { color: '#ffffff', color2: c, speed: 4, life: 0.3, size: 1, up: 0.6, grav: 6, layer: 'spark' })
      if (hit >= 0.6) gs.fx.ring(z, x, y, 0.2, hit * 2, c, 0.4, { tex: 'ring', k: 2.4 })
  }
  void dir
}

regFx('proj', (gs, w, f) => {
  const L = look(f.s)
  const z = f.z
  const from = muzzleOf(gs, f.e) ?? { x: f.x, y: f.y, h: z === 0 ? 0.8 : 1.1 }
  if (L.sound) sfx(L.sound, from.x, from.y)
  const speed = f.v ?? 15
  const tx0 = f.x2 ?? f.x
  const ty0 = f.y2 ?? f.y
  const dist = Math.hypot(tx0 - from.x, ty0 - from.y)
  const dur = Math.max(0.05, dist / speed)
  const style = L.style ?? 'orb'
  const lob = style === 'lob' || style === 'grenade'
  const arc = lob ? Math.min(2.4, 0.6 + dist * 0.18) : style === 'spit' || style === 'spore' ? dist * 0.05 : 0
  const ground = style === 'wave'
  const endH = ground ? 0.05 : z === 0 ? 0.8 : 1.0
  const startH = ground ? 0.05 : from.h
  const { g, spin, light } = projBody(gs, L)
  g.position.copy(W(from.x, from.y, startH))
  const prev = new THREE.Vector3().copy(g.position)
  const look3 = new THREE.Vector3()
  const pos3 = new THREE.Vector3()
  if (light) gs.fx.light(z, from.x, from.y, startH, L.color, style === 'rocket' ? 14 : 8, 3.5, dur + 0.05, { track: () => pos3 })
  let lastEmit = 0
  let lastDecal = 0
  let done = false
  // 絲線：從發射點拉出一條白線
  let strand: THREE.Mesh | null = null
  if (style === 'silk') {
    const sm = gs.fx.mesh(GEO.beam, '#eaf6ff', 1.6, { opacity: 0.7 })
    strand = sm
    gs.fx.addTransient(sm, dur + 0.3, z, (k) => ((sm.material as THREE.MeshBasicMaterial).opacity = 0.7 * Math.min(1, (1 - k) * 4)))
  }
  const src = W(from.x, from.y, from.h)
  gs.fx.addTransient(g, dur, z, (k, t) => {
    const to = posOf(w, f.e2, tx0, ty0)
    const x = from.x + (to.x - from.x) * k
    const y = from.y + (to.y - from.y) * k
    const h = startH + (endH - startH) * k + Math.sin(k * Math.PI) * arc
    g.position.copy(W(x, y, h))
    pos3.copy(g.position)
    look3.copy(g.position).sub(prev)
    if (look3.lengthSq() > 1e-6 && style !== 'lob') {
      look3.add(g.position)
      g.lookAt(look3)
    }
    prev.copy(g.position)
    if (spin) {
      spin.rotation.x += 0.35
      spin.rotation.y += 0.21
    }
    if (strand) {
      strand.position.copy(src)
      strand.lookAt(g.position)
      strand.scale.set(0.008, 0.008, Math.max(0.01, src.distanceTo(g.position)))
    }
    const dir: [number, number] = [to.x - from.x, to.y - from.y]
    if (t - lastEmit > 0.03) {
      lastEmit = t
      switch (style) {
        case 'rocket':
          gs.fx.emit(z, x, y, h, 2, { color: '#a0a0a0', speed: 0.3, life: 0.9, size: 0.45, up: 0.3, drag: 2, layer: 'smoke', alpha: 0.45 })
          gs.fx.emit(z, x, y, h, 2, { color: '#ffe0a0', color2: '#ff5a1a', speed: 0.4, life: 0.18, size: 0.35, up: 0 })
          break
        case 'fireball':
          gs.fx.emit(z, x, y, h, 3, { color: hot(L.color, 0.4).getStyle(), color2: L.color2, speed: 0.6, life: 0.35, size: (L.size ?? 0.15) * 3, grow: 1.6, up: 0.4 })
          gs.fx.emit(z, x, y, h, 1, { color: '#2a2420', speed: 0.3, life: 0.8, size: 0.4, up: 0.6, layer: 'smoke', alpha: 0.35 })
          break
        case 'spit':
          gs.fx.emit(z, x, y, h, 2, { color: L.color, color2: L.color2, speed: 0.3, life: 0.5, size: (L.size ?? 0.12) * 1.4, up: 0, grav: 6 })
          break
        case 'spore':
          gs.fx.emit(z, x, y, h, 2, { color: '#e8d04a', color2: '#7a8a20', speed: 0.5, life: 1.2, size: 0.2, up: 0.2, drag: 1 })
          break
        case 'lob':
          if (L.shape === 'rock' || L.shape === 'debris') gs.fx.emit(z, x, y, h, 1, { color: '#7a6e60', speed: 0.2, life: 0.7, size: 0.3, up: 0.1, layer: 'smoke', alpha: 0.35 })
          else if (L.shape === 'flask') gs.fx.emit(z, x, y, h, 1, { color: L.color, speed: 0.2, life: 0.4, size: 0.1, up: 0, grav: 4 })
          break
        case 'wave': {
          const w2 = L.wave
          const side = (Math.random() - 0.5) * (L.size ?? 0.5) * 1.4
          const ang = Math.atan2(dir[1], dir[0]) + Math.PI / 2
          const sx = x + Math.cos(ang) * side
          const sy = y + Math.sin(ang) * side
          if (w2 === 'dust') {
            gs.fx.emit(z, sx, sy, 0.1, 2, { color: '#8a7a64', speed: 1, life: 1.1, size: 0.7, up: 1.2, drag: 2, layer: 'smoke', alpha: 0.55 })
            gs.fx.debris(z, sx, sy, 0.1, 1, 'rock', { speed: 1.2, up: 3, size: 0.08, life: 1 })
          } else if (w2 === 'goo') {
            gs.fx.emit(z, sx, sy, 0.2, 2, { color: '#4a5a1a', speed: 0.8, life: 0.9, size: 0.55, up: 0.6, layer: 'smoke', alpha: 0.7 })
            gs.fx.emit(z, sx, sy, 0.2, 2, { color: '#a8c040', speed: 1.5, life: 0.5, size: 0.14, up: 1.4, grav: 8 })
          } else {
            gs.fx.emit(z, sx, sy, 0.3, 2, { color: '#ffffff', color2: L.color, speed: 2, life: 0.3, size: 1, up: 1, grav: 4, layer: 'spark' })
            gs.fx.emit(z, x, y, 0.4, 1, { color: L.color, color2: L.color2, speed: 0.4, life: 0.4, size: 0.5, up: 0.4 })
          }
          if (t - lastDecal > 0.12 && w2 !== 'energy') {
            lastDecal = t
            gs.fx.decal(z, x, y, w2 === 'dust' ? 1.1 : 0.9, w2 === 'dust' ? 'crack' : 'splat', w2 === 'dust' ? '#1a1612' : '#4a5a1a', w2 === 'dust' ? 6 : 3, { opacity: 0.7 })
          }
          break
        }
        case 'grenade':
          break
        default:
          if (L.trail || (L.size ?? 0) >= 0.12) gs.fx.emit(z, x, y, h, 1, { color: L.color, color2: L.color2, speed: 0.2, life: 0.22, size: (L.size ?? 0.1) * 2.4, up: 0 })
      }
    }
    if (k >= 0.999 && !done) {
      done = true
      impact(gs, z, L, x, y, h, dir)
    }
  })
})

// ───────── 爆炸 ─────────

regFx('boom', (gs, _w, f) => {
  const r = Math.max(0.6, f.v ?? 1.5)
  const z = f.z
  sfx(r > 3 ? 'bigBoom' : 'boom', f.x, f.y)
  gs.fx.flash(z, f.x, f.y, 0.8, '#ffd9a0', Math.min(2.5, r * 0.5), 0.25)
  gs.fx.glow(z, f.x, f.y, 0.6, '#ff8a3a', r * 3.2, 0.5, { k: 1.8, grow: 1.4 })
  gs.fx.shock(z, f.x, f.y, r * 1.2, '#ffb46b', 0.45)
  gs.fx.emit(z, f.x, f.y, 0.5, Math.min(110, 26 + r * 12), { color: '#fff0c0', color2: '#ff4a1a', speed: r * 3, life: 0.6, size: 0.6, grow: 1.6, up: 0.8, drag: 2.5, grav: 2 })
  gs.fx.emit(z, f.x, f.y, 0.5, Math.min(50, 14 + r * 8), { color: '#ffffff', color2: '#ffb46b', speed: r * 4 + 3, life: 0.55, size: 1, up: 0.9, grav: 9, drag: 0.8, layer: 'spark' })
  gs.fx.emit(z, f.x, f.y, 0.4, Math.min(40, 10 + r * 6), { color: '#3a3430', speed: r * 1.2, life: 2, size: 1 + r * 0.25, up: 0.5, drag: 1.5, layer: 'smoke', alpha: 0.7 })
  gs.fx.debris(z, f.x, f.y, 0.4, Math.min(16, 4 + r * 3), 'metal', { speed: r * 2.2 + 2, size: 0.08, up: 1 })
  gs.fx.decal(z, f.x, f.y, r * 1.6, 'scorch', '#ffffff', 14, { opacity: 0.85 })
  gs.fx.decal(z, f.x, f.y, r * 1.1, 'soft', '#ff6a2a', 1.8, { add: true, k: 1.4, opacity: 0.8 })
  shake(gs, Math.min(1, r / 4), f.x, f.y)
})

regFx('heal', (gs, _w, f) => {
  const p = entPos(gs, f.e) ?? { x: f.x, y: f.y, h: 1.6 }
  const z = f.z
  sfx('heal', p.x, p.y)
  const r = f.v ?? 0
  if (r > 0) gs.fx.ring(z, p.x, p.y, 0.3, r, '#5cf2a5', 0.9, { tex: 'ring', k: 1.6 })
  gs.fx.ring(z, p.x, p.y, 0.3, 0.9, '#5cf2a5', 0.7, { tex: 'ring', k: 2 })
  gs.fx.emit(z, p.x, p.y, 0.3, 12, { color: '#b8ffd8', color2: '#5cf2a5', speed: 0.6, life: 1, size: 0.22, up: 2.2, drag: 1.5, area: 0.4 })
  for (let i = 0; i < 3; i++) {
    const a = (i / 3) * Math.PI * 2 + Math.random()
    const cx = p.x + Math.cos(a) * 0.35
    const cy = p.y + Math.sin(a) * 0.35
    const s = gs.fx.glow(z, cx, cy, 0.6 + i * 0.25, '#5cf2a5', 0.28, 0.9, { tex: 'cross', k: 2.4, fadeIn: 0.15 })
    const y0 = s.position.y
    gs.fx.addTransient(new THREE.Object3D(), 0.9, z, (k) => (s.position.y = y0 + k * 0.9))
  }
})

regFx('miss', (gs, _w, f) => {
  const p = entPos(gs, f.e) ?? { x: f.x, y: f.y, h: 1.6 }
  gs.fx.emit(f.z, p.x, p.y, Math.min(1.4, p.h * 0.7), 5, { color: '#ffffff', speed: 1.5, life: 0.3, size: 0.12, up: 1 })
  gs.fx.ring(f.z, p.x, p.y, 0.3, 0.7, '#ffffff', 0.3, { tex: 'ring', k: 1.2, opacity: 0.6, h: 0.5 })
})

regFx('blink', (gs, _w, f) => {
  sfx(f.s === 'crab' ? 'hop' : 'blink', f.x, f.y)
  const col = f.s === 'crab' ? '#e8b04a' : '#b28cff'
  for (const [x, y, out] of [
    [f.x, f.y, 1],
    [f.x2 ?? f.x, f.y2 ?? f.y, -1],
  ]) {
    gs.fx.flash(f.z, x, y, 1, col, 0.5, 0.2)
    gs.fx.emit(f.z, x, y, 1, 20, { color: col, color2: '#33ffd1', speed: 3, life: 0.5, size: 0.22, up: 0.5, area: out < 0 ? 1 : 0, radial: out < 0 ? -1 : 0 })
    gs.fx.ring(f.z, x, y, out > 0 ? 0.2 : 1.3, out > 0 ? 1.3 : 0.2, col, 0.35, { tex: 'ring', k: 2 })
  }
  if (f.s !== 'crab') gs.fx.tracer(f.z, f.x, f.y, 1, f.x2 ?? f.x, f.y2 ?? f.y, 1, col, 0.08, 0.18)
})

regFx('dash', (gs, w, f) => {
  const dx = (f.x2 ?? f.x) - f.x
  const dy = (f.y2 ?? f.y) - f.y
  gs.fx.emit(f.z, f.x, f.y, 0.3, 16, { color: '#e8f6ff', speed: 2, life: 0.4, size: 0.35, up: 0.2, dir: [-dx, -dy], spread: 0.4 })
  gs.fx.emit(f.z, f.x, f.y, 0.2, 6, { color: '#8a8078', speed: 1, life: 0.9, size: 0.5, up: 0.3, layer: 'smoke', alpha: 0.4 })
  // 衝刺途中的殘跡
  const id = f.e
  let last = 0
  gs.fx.addTransient(new THREE.Object3D(), 0.45, f.z, (_k, t) => {
    if (t - last < 0.04) return
    last = t
    const e = id ? w.ents.get(id) : undefined
    if (e) gs.fx.emit(f.z, e.x, e.y, 0.6, 2, { color: '#e8f6ff', speed: 0.3, life: 0.3, size: 0.3, up: 0.2 })
  })
})

regFx('summon', (gs, _w, f) => {
  const s = f.s ?? ''
  const col = s.startsWith('mut.') ? '#c8323c' : s.startsWith('rig.') || s.startsWith('dev.') ? '#9fe7ff' : '#b28cff'
  const col2 = s.startsWith('mut.') ? '#e8b04a' : s.startsWith('rig.') ? '#ffffff' : '#33ffd1'
  sfx(s.startsWith('rig.') ? 'deploy' : 'summon', f.x, f.y)
  gs.fx.ring(f.z, f.x, f.y, 0.2, 1.6, col, 0.5, { tex: 'ring', k: 2.2 })
  gs.fx.emit(f.z, f.x, f.y, 0.5, 18, { color: col, color2: col2, speed: 2, life: 0.6, size: 0.25, up: 1 })
  gs.fx.glow(f.z, f.x, f.y, 0.8, col, 2, 0.4, { k: 1.6 })
  if (s.startsWith('mut.')) gs.fx.decal(f.z, f.x, f.y, 1.4, 'splat', '#5a1a1a', 5, { opacity: 0.7 })
})

regFx('vend', (gs, _w, f) => {
  sfx('vend', f.x, f.y)
  gs.fx.emit(f.z, f.x, f.y, 1.2, 8, { color: '#9fe7ff', speed: 1, life: 0.4, size: 0.15, up: 0.5 })
  gs.fx.glow(f.z, f.x, f.y, 1.0, '#9fe7ff', 0.8, 0.3, { k: 1.6 })
})

regFx('suitOn', (gs, _w, f) => {
  const p = entPos(gs, f.e) ?? { x: f.x, y: f.y, h: 1.8 }
  sfx('suit', p.x, p.y)
  gs.fx.shock(f.z, p.x, p.y, 1.4, '#ffc23d', 0.5)
  gs.fx.emit(f.z, p.x, p.y, 1, 20, { color: '#ffc23d', speed: 1.5, life: 0.6, size: 0.2, up: 1.5 })
  const root = gs.units.views.get(f.e ?? -1)
  void root
  // 由下往上的組裝掃描環
  const ring = gs.fx.mesh(GEO.ringThin, '#ffc23d', 3)
  ring.position.copy(W(p.x, p.y, 0))
  ring.scale.setScalar(0.55)
  gs.fx.addTransient(ring, 0.6, f.z, (k) => {
    ring.position.y = k * p.h
    ;(ring.material as THREE.MeshBasicMaterial).opacity = 1 - k * 0.5
  })
})
regFx('suitOff', (gs, _w, f) => {
  const p = entPos(gs, f.e) ?? { x: f.x, y: f.y, h: 1.8 }
  gs.fx.emit(f.z, p.x, p.y, 1, 12, { color: '#9fe7ff', speed: 1, life: 0.5, size: 0.2, up: 1 })
  gs.fx.debris(f.z, p.x, p.y, 1, 5, 'metal', { speed: 2, size: 0.07 })
})

regFx('castStart', (gs, _w, f) => {
  const p = entPos(gs, f.e) ?? { x: f.x, y: f.y, h: 1.8 }
  const dur = Math.min(4, Math.max(0.4, f.v ?? 0.5))
  gs.fx.ring(f.z, p.x, p.y, 1.1, 0.4, '#b28cff', dur, { tex: 'ring', k: 1.8, ease: 'linear' })
})

regFx('ping', (gs, _w, f) => {
  const col = f.s === 'tracker' ? '#ff5a4a' : f.s === 'fleet' ? '#ff3b3b' : f.s === 'sensor' ? '#ff7a2a' : '#ffc23d'
  sfx(f.s === 'sensor' ? 'beep' : 'ping', f.x, f.y)
  const big = f.z === 0 ? 3 : 1
  gs.fx.ring(f.z, f.x, f.y, 0.2, 3 * big, col, 1.2, { tex: 'ring', k: 2.4 })
  gs.fx.ring(f.z, f.x, f.y, 0.2, 2 * big, col, 0.8, { tex: 'ring', k: 2.4 })
  gs.fx.glow(f.z, f.x, f.y, 0.4, col, 0.8 * big, 1.2, { k: 2 })
})

regFx('doorBreak', (gs, _w, f) => {
  sfx('slam', f.x, f.y)
  sfx('boom', f.x, f.y)
  gs.fx.emit(f.z, f.x, f.y, 1.2, 30, { color: '#ffffff', color2: '#ffd080', speed: 4, life: 0.6, size: 1, up: 1, grav: 8, layer: 'spark' })
  gs.fx.debris(f.z, f.x, f.y, 1.2, 10, 'metal', { speed: 4, size: 0.12 })
  gs.fx.emit(f.z, f.x, f.y, 0.6, 10, { color: '#5a5450', speed: 1.5, life: 1.6, size: 0.8, up: 0.4, layer: 'smoke', alpha: 0.6 })
  shake(gs, 0.4, f.x, f.y)
})

regFx('fusion', (gs, _w, f) => {
  // 熱融炸彈／戰術核爆：白屏 → 火球 → 衝擊波 → 蕈狀煙柱 → 焦痕
  const r = f.v ?? 5.5
  const z = f.z
  sfx('nuke', f.x, f.y)
  screenFlash(gs, '#fff4e0', 3, 0.5, f.x, f.y)
  gs.fx.flash(z, f.x, f.y, 1, '#fff4e0', Math.min(4, r * 0.7), 0.5)
  gs.fx.glow(z, f.x, f.y, 1.2, '#ffb060', r * 3.5, 1.4, { k: 2.2, grow: 1.3 })
  gs.fx.light(z, f.x, f.y, 2, '#ffb46b', 900, r * 4, 1.6)
  gs.fx.ring(z, f.x, f.y, 0.5, r * 1.25, '#ffd9a0', 0.8, { tex: 'ring', k: 3 })
  gs.fx.ring(z, f.x, f.y, 0.3, r * 0.8, '#ff8a3a', 1.3, { tex: 'ring', k: 2 })
  gs.fx.emit(z, f.x, f.y, 0.6, 160, { color: '#fff4d0', color2: '#ff3b1a', speed: r * 1.7, life: 0.9, size: 0.9, grow: 1.8, up: 0.5, drag: 2 })
  gs.fx.emit(z, f.x, f.y, 0.6, 60, { color: '#ffffff', color2: '#ffb46b', speed: r * 2.2, life: 0.8, size: 1, up: 0.8, grav: 6, drag: 0.6, layer: 'spark' })
  gs.fx.emit(z, f.x, f.y, 0.4, 50, { color: '#3a3430', speed: r * 0.6, life: 3, size: 1.6, up: 0.3, drag: 1.2, layer: 'smoke', alpha: 0.75, area: r * 0.3 })
  gs.fx.debris(z, f.x, f.y, 0.5, 24, 'metal', { speed: r * 1.6, size: 0.12, up: 1.2 })
  gs.fx.debris(z, f.x, f.y, 0.5, 14, 'rock', { speed: r * 1.2, size: 0.14, up: 1.4 })
  // 煙柱
  for (let i = 0; i < 8; i++) {
    gs.fx.after(0.1 + i * 0.12, () => {
      gs.fx.emit(z, f.x, f.y, 0.5 + i * 0.5, 6, { color: i < 3 ? '#5a3a20' : '#3a3430', speed: 0.6 + i * 0.12, life: 2.6, size: 1.3 + i * 0.12, up: 0.9, drag: 1, layer: 'smoke', alpha: 0.7 })
      gs.fx.emit(z, f.x, f.y, 0.5 + i * 0.5, 3, { color: '#ffb060', color2: '#a02010', speed: 0.5, life: 0.8, size: 0.9, up: 0.8 })
    })
  }
  gs.fx.decal(z, f.x, f.y, r * 1.9, 'scorch', '#ffffff', 30, { opacity: 0.95 })
  gs.fx.decal(z, f.x, f.y, r * 1.3, 'soft', '#ff5a1a', 4, { add: true, k: 1.5 })
  shake(gs, 1, f.x, f.y)
})

regFx('emp', (gs, _w, f) => {
  const r = f.v ?? 2.5
  const p = entPos(gs, f.e) ?? { x: f.x, y: f.y, h: 1 }
  sfx('emp', p.x, p.y)
  gs.fx.flash(f.z, p.x, p.y, 0.8, '#7fd8ff', 0.6, 0.2)
  gs.fx.ring(f.z, p.x, p.y, 0.2, r, '#7fd8ff', 0.5, { tex: 'ring', k: 2.6 })
  gs.fx.ring(f.z, p.x, p.y, 0.2, r * 0.7, '#ffffff', 0.35, { tex: 'ring', k: 1.6 })
  gs.fx.emit(f.z, p.x, p.y, 0.8, 40, { color: '#ffffff', color2: '#7fd8ff', speed: 5, life: 0.4, size: 1, up: 0.3, layer: 'spark' })
  for (let i = 0; i < 5; i++) {
    const a = Math.random() * Math.PI * 2
    bolt(gs, f.z, W(p.x, p.y, 0.8), W(p.x + Math.cos(a) * r * 0.8, p.y + Math.sin(a) * r * 0.8, 0.1), '#7fd8ff', 0.025, 0.15, { branches: 0 })
  }
})

/** 通用：未登錄的 fx id 也給一點反應（光點），方便新增技能時看得到 */
export function genericFx(gs: GameScene, f: { z: number; x: number; y: number }, color = '#b28cff'): void {
  gs.fx.emit(f.z, f.x, f.y, 1, 10, { color, speed: 1.5, life: 0.5, size: 0.25, up: 1 })
}

regFx('stationBoom', (gs, _w, f) => {
  sfx('bigBoom')
  const r = (f.v ?? 3) * 1.5
  const z = f.z
  for (let i = 0; i < 5; i++) {
    gs.fx.after(i * 0.32, () => {
      const ox = f.x + (Math.random() - 0.5) * r
      const oy = f.y + (Math.random() - 0.5) * r
      sfx('boom', ox, oy)
      gs.fx.flash(z, ox, oy, 1, '#ffd9a0', r * 0.6, 0.6)
      gs.fx.emit(z, ox, oy, 1, 80, { color: '#fff0c0', color2: '#ff3b1a', speed: r * 2.2, life: 1.4, size: 1.4, grow: 1.6, up: 0.2, drag: 1 })
      gs.fx.emit(z, ox, oy, 1, 30, { color: '#3a3430', speed: r * 0.8, life: 3, size: 2, up: 0.1, drag: 0.8, layer: 'smoke', alpha: 0.6 })
      gs.fx.debris(z, ox, oy, 1, 10, 'metal', { speed: r * 2, size: 0.25, up: 0.3, life: 4 })
    })
  }
  screenFlash(gs, '#ffe8c8', 2.5, 0.6, f.x, f.y)
  gs.fx.ring(z, f.x, f.y, 0.5, r * 4, '#ffd9a0', 1.6, { tex: 'ring', k: 3, h: 0.8 })
  gs.fx.light(z, f.x, f.y, 3, '#ffb46b', 1500, r * 8, 2)
  shake(gs, 1, f.x, f.y)
})

regFx('launch', (gs, _w, f) => {
  sfx('rocket', f.x, f.y)
  gs.fx.emit(f.z, f.x, f.y, 0.5, 40, { color: '#9fe7ff', speed: 2, life: 0.8, size: 0.6, up: 0.4 })
  gs.fx.ring(f.z, f.x, f.y, 0.3, 3, '#9fe7ff', 0.7, { tex: 'ring', k: 2 })
})
regFx('dock', (gs, _w, f) => {
  sfx('clang', f.x, f.y)
  gs.fx.shock(f.z, f.x, f.y, 3, '#9fe7ff', 0.8)
})
regFx('board', (gs, _w, f) => gs.fx.emit(f.z, f.x, f.y, 1, 10, { color: '#ffc23d', speed: 1, life: 0.4, size: 0.2, up: 1 }))
regFx('boardLink', (gs, _w, f) => beam(gs, f.z, W(f.x, f.y, 0.5), W(f.x2 ?? f.x, f.y2 ?? f.y, 0.5), '#ffc23d', 0.12, 1, { flow: '#ffe08a' }))
regFx('alarm', (gs, _w, f) => {
  sfx('alarm', f.x, f.y)
  gs.fx.shock(f.z, f.x, f.y, 4, '#ff3b3b', 1)
  gs.fx.light(f.z, f.x, f.y, 2, '#ff3b3b', 40, 8, 1.2, { attack: 0.2 })
})
regFx('xenoShift', (gs, _w, f) => {
  const p = entPos(gs, f.e) ?? { x: f.x, y: f.y, h: 1.6 }
  sfx('morph', p.x, p.y)
  gs.fx.emit(f.z, p.x, p.y, 1, 40, { color: '#7a3cff', speed: 2.5, life: 0.9, size: 0.35, up: 1 })
  gs.fx.emit(f.z, p.x, p.y, 0.5, 20, { color: '#33ffd1', speed: 1.5, life: 0.7, size: 0.25, up: 0.5 })
  gs.fx.emit(f.z, p.x, p.y, 0.6, 12, { color: '#1a0a2a', speed: 1.2, life: 1.4, size: 0.9, up: 0.6, layer: 'smoke', alpha: 0.7 })
  gs.fx.debris(f.z, p.x, p.y, 1, 8, 'flesh', { speed: 3, size: 0.07, colors: ['#3a1a5a', '#7a3cff', '#1a0a2a'] })
  gs.fx.decal(f.z, p.x, p.y, 1.6, 'splat', '#2a1040', 6, { opacity: 0.8 })
})
regFx('cocoon', (gs, _w, f) => {
  const mut = f.s === 'mutant'
  sfx('squelch', f.x, f.y)
  gs.fx.shock(f.z, f.x, f.y, 2.5, mut ? '#c8323c' : '#7a3cff', 1.2)
  gs.fx.emit(f.z, f.x, f.y, 0.6, 50, { color: mut ? '#e8b04a' : '#33ffd1', speed: 2, life: 1.2, size: 0.4, up: 1.4 })
  gs.fx.decal(f.z, f.x, f.y, 2.4, 'splat', mut ? '#4a1414' : '#1e0c34', 20, { opacity: 0.8 })
})
regFx('evolved', (gs, _w, f) => {
  sfx('evolve', f.x, f.y)
  gs.fx.flash(f.z, f.x, f.y, 1.2, '#b28cff', 2.5, 0.6)
  gs.fx.shock(f.z, f.x, f.y, 5, '#b28cff', 1)
  gs.fx.emit(f.z, f.x, f.y, 0.8, 100, { color: '#b28cff', color2: '#33ffd1', speed: 5, life: 1, size: 0.5, up: 1 })
  gs.fx.debris(f.z, f.x, f.y, 1, 14, 'flesh', { speed: 5, size: 0.12, colors: ['#3a1a5a', '#5a2a4a', '#7a3cff'] })
  shake(gs, 0.5, f.x, f.y)
})
regFx('infect', (gs, _w, f) => {
  gs.fx.emit(f.z, f.x, f.y, 0.5, 30, { color: '#7a3cff', speed: 1.2, life: 1.2, size: 0.4, up: 0.6 })
  gs.fx.emit(f.z, f.x, f.y, 0.5, 8, { color: '#14081e', speed: 0.8, life: 1.6, size: 0.7, up: 0.4, layer: 'smoke', alpha: 0.6 })
})
regFx('egg', (gs, _w, f) => {
  sfx('squelch', f.x, f.y)
  gs.fx.emit(f.z, f.x, f.y, 0.3, 14, { color: '#33ffd1', speed: 1, life: 0.8, size: 0.25, up: 0.8 })
  gs.fx.decal(f.z, f.x, f.y, 1.2, 'splat', '#1e3a34', 10, { opacity: 0.7 })
})
regFx('devour', (gs, _w, f) => {
  sfx('bite', f.x, f.y)
  gs.fx.emit(f.z, f.x, f.y, 0.6, 24, { color: '#c8323c', color2: '#4a0a0a', speed: 2, life: 0.6, size: 0.3, up: 1, grav: 4 })
  gs.fx.debris(f.z, f.x, f.y, 0.6, 6, 'flesh', { speed: 2.5, size: 0.07 })
  gs.fx.decal(f.z, f.x, f.y, 1.4, 'splat', '#4a0a0a', 12, { opacity: 0.85 })
})
