// 特效 id → 視覺（美術聖經 §11）。sim 只送事件，這裡決定長相。
import * as THREE from 'three'
import { regFx } from './fxBinding'
import { W } from './stationBuilder'
import type { GameScene } from './gameScene'
import type { ClientWorld } from '../client/world'
import { sfx } from '../audio/sfx'

interface Look {
  color: string
  /** 曳光寬度 */
  w?: number
  /** 飛行物大小 */
  size?: number
  muzzle?: number
  hit?: number
  trail?: boolean
  sound?: string
  /** 特殊形狀 */
  style?: 'tracer' | 'orb' | 'bolt' | 'flame' | 'beam' | 'rocket' | 'spit'
}

export const LOOKS: Record<string, Look> = {
  pistol: { color: '#ffd9a0', w: 0.03, muzzle: 0.12, hit: 0.1, sound: 'pistol', style: 'tracer' },
  rifle: { color: '#ffe0a8', w: 0.035, muzzle: 0.15, hit: 0.12, sound: 'rifle', style: 'tracer' },
  heavyRifle: { color: '#ffc880', w: 0.05, muzzle: 0.2, hit: 0.16, sound: 'heavy', style: 'tracer' },
  plasma: { color: '#5cf2a5', size: 0.16, hit: 0.25, sound: 'plasma', style: 'orb' },
  tesla: { color: '#7fd8ff', w: 0.04, hit: 0.2, sound: 'zap', style: 'bolt' },
  cryo: { color: '#bfefff', size: 0.12, hit: 0.2, sound: 'cryo', style: 'orb' },
  flame: { color: '#ff8a2a', hit: 0.15, sound: 'flame', style: 'flame' },
  photon: { color: '#fff2a8', w: 0.05, hit: 0.18, sound: 'laser', style: 'beam' },
  saw: { color: '#ffd080', hit: 0.12, sound: 'saw', style: 'tracer' },
  void: { color: '#9b5de5', size: 0.14, hit: 0.22, sound: 'void', style: 'orb' },
  mirage: { color: '#c9b6ff', w: 0.035, hit: 0.1, sound: 'rifle', style: 'tracer' },
  rad: { color: '#7dff6a', size: 0.13, hit: 0.2, sound: 'plasma', style: 'orb' },
  operative: { color: '#ff7a6a', w: 0.04, muzzle: 0.2, hit: 0.15, sound: 'heavy', style: 'tracer' },
  acid: { color: '#b6ff3a', size: 0.12, hit: 0.2, sound: 'spit', style: 'spit' },
  gatling: { color: '#ffe0a8', w: 0.025, muzzle: 0.1, hit: 0.07, sound: 'gatling', style: 'tracer' },
  force: { color: '#e8f6ff', size: 0.15, hit: 0.25, sound: 'force', style: 'orb' },
  mag: { color: '#33ffd1', size: 0.08, hit: 0.15, sound: 'mag', style: 'orb' },
  pulse: { color: '#ff7eb6', w: 0.06, hit: 0.15, sound: 'laser', style: 'beam' },
  rocket: { color: '#ffb46b', size: 0.14, hit: 0.5, sound: 'rocket', style: 'rocket', trail: true },
  grenade: { color: '#ffc23d', size: 0.1, hit: 0.5, sound: 'thump', style: 'orb' },
  claw: { color: '#ff5a4a', hit: 0.14, sound: 'claw' },
  bite: { color: '#ff5a4a', hit: 0.14, sound: 'claw' },
  xeno: { color: '#33ffd1', size: 0.14, hit: 0.2, sound: 'spit', style: 'spit' },
  stationGun: { color: '#9fe7ff', size: 0.35, hit: 1.2, sound: 'heavy', style: 'orb' },
  lightning: { color: '#c9e8ff', w: 0.08, hit: 0.4, sound: 'zap', style: 'bolt' },
}

function look(id?: string): Look {
  return LOOKS[id ?? ''] ?? { color: '#ffe0a8', w: 0.03, hit: 0.1, style: 'tracer' }
}

/** 單位的槍口高度 */
function muzzleOf(gs: GameScene, id?: number): { x: number; y: number; h: number } | null {
  if (!id) return null
  const v = gs.units.views.get(id)
  const e = gs.world.ents.get(id)
  if (!v || !e) return null
  if (v.rig) {
    const p = new THREE.Vector3()
    v.rig.muzzle.getWorldPosition(p)
    return { x: p.x, y: -p.z, h: p.y }
  }
  return { x: e.x, y: e.y, h: v.height * 0.6 }
}

function posOf(w: ClientWorld, id: number | undefined, fx: number, fy: number): { x: number; y: number } {
  const e = id ? w.ents.get(id) : undefined
  return e ? { x: e.x, y: e.y } : { x: fx, y: fy }
}

function zigzag(gs: GameScene, z: number, a: THREE.Vector3, b: THREE.Vector3, color: string, width: number): void {
  const pts: THREE.Vector3[] = []
  const n = 8
  for (let i = 0; i <= n; i++) {
    const p = a.clone().lerp(b, i / n)
    if (i > 0 && i < n) p.add(new THREE.Vector3((Math.random() - 0.5) * 0.4, (Math.random() - 0.5) * 0.3, (Math.random() - 0.5) * 0.4))
    pts.push(p)
  }
  const geo = new THREE.TubeGeometry(new THREE.CatmullRomCurve3(pts), 16, width, 4)
  const mesh = new THREE.Mesh(geo, new THREE.MeshBasicMaterial({ color: new THREE.Color(color).multiplyScalar(5), transparent: true, blending: THREE.AdditiveBlending, depthWrite: false }))
  gs.fx.addTransient(mesh, 0.12, z, (k) => ((mesh.material as THREE.MeshBasicMaterial).opacity = 1 - k))
}

regFx('atk', (gs, w, f) => {
  const L = look(f.s)
  const from = muzzleOf(gs, f.e) ?? { x: f.x, y: f.y, h: 1.2 }
  const to = posOf(w, f.e2, f.x2 ?? f.x, f.y2 ?? f.y)
  const hitH = 1.0
  if (L.sound) sfx(L.sound, from.x, from.y)
  if (L.style === 'bolt') zigzag(gs, f.z, W(from.x, from.y, from.h), W(to.x, to.y, hitH), L.color, L.w ?? 0.04)
  else if (L.style === 'flame') {
    const dx = to.x - from.x
    const dy = to.y - from.y
    gs.fx.emit(f.z, from.x, from.y, from.h, 14, { color: L.color, speed: Math.hypot(dx, dy) * 2.2, life: 0.4, size: 0.5, up: 0.1, drag: 3, dir: [dx, dy], spread: 0.18 })
  } else if (L.style === 'beam') gs.fx.tracer(f.z, from.x, from.y, from.h, to.x, to.y, hitH, L.color, L.w ?? 0.05, 0.14)
  else if (!L.style && f.s && (f.s === 'claw' || f.s === 'bite')) {
    // 近戰：只有命中火花
  } else gs.fx.tracer(f.z, from.x, from.y, from.h, to.x, to.y, hitH, L.color, L.w ?? 0.03)
  if (L.muzzle) gs.fx.flash(f.z, from.x, from.y, from.h, L.color, L.muzzle, 0.06)
  gs.fx.emit(f.z, to.x, to.y, hitH, 6, { color: L.color, speed: 3, life: 0.25, size: 0.18, up: 0.6, grav: 6 })
  if (f.e2 === gs.world.me.unit) gs.damage = Math.min(1, gs.damage + 0.25)
})

regFx('proj', (gs, w, f) => {
  const L = look(f.s)
  const from = muzzleOf(gs, f.e) ?? { x: f.x, y: f.y, h: 1.1 }
  if (L.sound) sfx(L.sound, from.x, from.y)
  const size = L.size ?? 0.1
  const g = new THREE.Group()
  const core = new THREE.Mesh(new THREE.SphereGeometry(size, 10, 8), new THREE.MeshBasicMaterial({ color: new THREE.Color(L.color).multiplyScalar(5), blending: THREE.AdditiveBlending, transparent: true, depthWrite: false }))
  g.add(core)
  const light = new THREE.PointLight(L.color, 6, 3.5, 2)
  g.add(light)
  const speed = f.v ?? 15
  const tx0 = f.x2 ?? f.x
  const ty0 = f.y2 ?? f.y
  const dist = Math.hypot(tx0 - from.x, ty0 - from.y)
  const dur = Math.max(0.05, dist / speed)
  const arc = f.s === 'grenade' ? 1.6 : 0
  g.position.copy(W(from.x, from.y, from.h))
  let lastEmit = 0
  gs.fx.addTransient(g, dur, f.z, (k) => {
    const to = posOf(w, f.e2, tx0, ty0)
    const x = from.x + (to.x - from.x) * k
    const y = from.y + (to.y - from.y) * k
    const h = from.h + (1.0 - from.h) * k + Math.sin(k * Math.PI) * arc
    g.position.copy(W(x, y, h))
    if (L.trail && k - lastEmit > 0.04) {
      lastEmit = k
      gs.fx.emit(f.z, x, y, h, 2, { color: '#a0a0a0', speed: 0.3, life: 0.6, size: 0.35, up: 0.3, drag: 2 })
      gs.fx.emit(f.z, x, y, h, 1, { color: L.color, speed: 0.2, life: 0.15, size: 0.3, up: 0 })
    }
    if (k >= 0.999) gs.fx.emit(f.z, x, y, 1, 8, { color: L.color, speed: 3, life: 0.3, size: 0.25, up: 0.7, grav: 5 })
  })
})

regFx('boom', (gs, _w, f) => {
  const r = Math.max(0.6, f.v ?? 1.5)
  sfx(r > 3 ? 'bigBoom' : 'boom', f.x, f.y)
  gs.fx.flash(f.z, f.x, f.y, 0.8, '#ffb46b', Math.min(2.5, r * 0.5), 0.25)
  gs.fx.shock(f.z, f.x, f.y, r * 1.2, '#ffb46b', 0.45)
  gs.fx.emit(f.z, f.x, f.y, 0.5, Math.min(120, 30 + r * 12), { color: '#ffb46b', speed: r * 3, life: 0.6, size: 0.6, up: 0.8, drag: 2.5, grav: 2 })
  gs.fx.emit(f.z, f.x, f.y, 0.4, Math.min(60, 20 + r * 6), { color: '#5a5048', speed: r * 1.2, life: 1.6, size: 1.1, up: 0.5, drag: 1.5 })
  gs.rts.shake = Math.max(gs.rts.shake, Math.min(1, r / 4))
})

regFx('heal', (gs, w, f) => {
  const p = posOf(w, f.e, f.x, f.y)
  gs.fx.emit(f.z, p.x, p.y, 0.3, 10, { color: '#5cf2a5', speed: 0.6, life: 0.9, size: 0.22, up: 2.2, drag: 1.5 })
})

regFx('miss', (gs, w, f) => {
  const p = posOf(w, f.e, f.x, f.y)
  gs.fx.emit(f.z, p.x, p.y, 1.2, 4, { color: '#ffffff', speed: 1.5, life: 0.3, size: 0.12, up: 1 })
})

regFx('blink', (gs, _w, f) => {
  sfx('blink', f.x, f.y)
  for (const [x, y] of [
    [f.x, f.y],
    [f.x2 ?? f.x, f.y2 ?? f.y],
  ]) {
    gs.fx.flash(f.z, x, y, 1, '#b28cff', 0.6, 0.2)
    gs.fx.emit(f.z, x, y, 1, 24, { color: '#b28cff', speed: 3, life: 0.5, size: 0.25, up: 0.5 })
  }
})

regFx('dash', (gs, _w, f) => {
  gs.fx.emit(f.z, f.x, f.y, 0.3, 16, { color: '#e8f6ff', speed: 2, life: 0.4, size: 0.35, up: 0.2, dir: [(f.x2 ?? f.x) - f.x, (f.y2 ?? f.y) - f.y], spread: 0.4 })
})

regFx('summon', (gs, _w, f) => {
  gs.fx.shock(f.z, f.x, f.y, 1.5, '#b28cff', 0.4)
  gs.fx.emit(f.z, f.x, f.y, 0.5, 16, { color: '#b28cff', speed: 2, life: 0.5, size: 0.25, up: 1 })
})

regFx('vend', (gs, _w, f) => {
  sfx('vend', f.x, f.y)
  gs.fx.emit(f.z, f.x, f.y, 1.2, 8, { color: '#9fe7ff', speed: 1, life: 0.4, size: 0.15, up: 0.5 })
})

regFx('suitOn', (gs, w, f) => {
  const p = posOf(w, f.e, f.x, f.y)
  sfx('suit', p.x, p.y)
  gs.fx.shock(f.z, p.x, p.y, 1.4, '#ffc23d', 0.5)
  gs.fx.emit(f.z, p.x, p.y, 1, 20, { color: '#ffc23d', speed: 1.5, life: 0.6, size: 0.2, up: 1.5 })
})
regFx('suitOff', (gs, w, f) => {
  const p = posOf(w, f.e, f.x, f.y)
  gs.fx.emit(f.z, p.x, p.y, 1, 12, { color: '#9fe7ff', speed: 1, life: 0.5, size: 0.2, up: 1 })
})

regFx('castStart', (gs, w, f) => {
  const p = posOf(w, f.e, f.x, f.y)
  gs.fx.shock(f.z, p.x, p.y, 1.2, '#b28cff', Math.min(1.5, f.v ?? 0.5))
})

regFx('ping', (gs, _w, f) => {
  sfx('ping', f.x, f.y)
  gs.fx.shock(f.z, f.x, f.y, 3, '#ffc23d', 1.2)
  gs.fx.shock(f.z, f.x, f.y, 2, '#ffc23d', 0.8)
})

regFx('doorBreak', (gs, _w, f) => {
  sfx('boom', f.x, f.y)
  gs.fx.emit(f.z, f.x, f.y, 1.2, 30, { color: '#ffd080', speed: 4, life: 0.6, size: 0.18, up: 1, grav: 8 })
})

regFx('fusion', (gs, _w, f) => {
  sfx('bigBoom', f.x, f.y)
  gs.fx.flash(f.z, f.x, f.y, 1, '#ffe8c0', 4, 0.5)
  gs.fx.shock(f.z, f.x, f.y, 6, '#ffb46b', 0.8)
  gs.fx.emit(f.z, f.x, f.y, 0.5, 200, { color: '#ff9a3a', speed: 9, life: 0.9, size: 0.9, up: 0.6, drag: 2 })
  gs.fx.emit(f.z, f.x, f.y, 0.5, 80, { color: '#3a3430', speed: 3, life: 2.5, size: 1.6, up: 0.5, drag: 1.2 })
  gs.rts.shake = 1
})

regFx('emp', (gs, _w, f) => {
  sfx('zap', f.x, f.y)
  gs.fx.shock(f.z, f.x, f.y, 3, '#7fd8ff', 0.6)
  gs.fx.emit(f.z, f.x, f.y, 0.8, 50, { color: '#7fd8ff', speed: 4, life: 0.5, size: 0.2, up: 0.4 })
})

/** 通用：未登錄的 fx id 也給一點反應（光點），方便新增技能時看得到 */
export function genericFx(gs: GameScene, f: { z: number; x: number; y: number }, color = '#b28cff'): void {
  gs.fx.emit(f.z, f.x, f.y, 1, 10, { color, speed: 1.5, life: 0.5, size: 0.25, up: 1 })
}

regFx('stationBoom', (gs, _w, f) => {
  sfx('bigBoom', f.x, f.y)
  const r = (f.v ?? 3) * 1.5
  for (let i = 0; i < 4; i++) {
    setTimeout(() => {
      const ox = f.x + (Math.random() - 0.5) * r
      const oy = f.y + (Math.random() - 0.5) * r
      gs.fx.flash(f.z, ox, oy, 1, '#ffd9a0', r * 0.8, 0.6)
      gs.fx.emit(f.z, ox, oy, 1, 120, { color: '#ff9a3a', speed: r * 2.5, life: 1.4, size: 1.4, up: 0.3, drag: 1 })
    }, i * 350)
  }
  gs.fx.shock(f.z, f.x, f.y, r * 4, '#ffd9a0', 1.6)
  gs.rts.shake = 1
})

regFx('launch', (gs, _w, f) => {
  sfx('rocket', f.x, f.y)
  gs.fx.emit(f.z, f.x, f.y, 0.5, 40, { color: '#9fe7ff', speed: 2, life: 0.8, size: 0.6, up: 0.4 })
})
regFx('dock', (gs, _w, f) => gs.fx.shock(f.z, f.x, f.y, 3, '#9fe7ff', 0.8))
regFx('board', (gs, _w, f) => gs.fx.emit(f.z, f.x, f.y, 1, 10, { color: '#ffc23d', speed: 1, life: 0.4, size: 0.2, up: 1 }))
regFx('boardLink', (gs, _w, f) => gs.fx.tracer(f.z, f.x, f.y, 0.5, f.x2 ?? f.x, f.y2 ?? f.y, 0.5, '#ffc23d', 0.08, 1))
regFx('alarm', (gs, _w, f) => {
  sfx('alarm', f.x, f.y)
  gs.fx.shock(f.z, f.x, f.y, 4, '#ff3b3b', 1)
})
regFx('xenoShift', (gs, w, f) => {
  const e = f.e ? w.ents.get(f.e) : undefined
  const x = e?.x ?? f.x
  const y = e?.y ?? f.y
  sfx('void', x, y)
  gs.fx.emit(f.z, x, y, 1, 40, { color: '#7a3cff', speed: 2.5, life: 0.9, size: 0.35, up: 1 })
  gs.fx.emit(f.z, x, y, 0.5, 20, { color: '#33ffd1', speed: 1.5, life: 0.7, size: 0.25, up: 0.5 })
})
regFx('cocoon', (gs, _w, f) => {
  gs.fx.shock(f.z, f.x, f.y, 2.5, f.s === 'mutant' ? '#c8323c' : '#7a3cff', 1.2)
  gs.fx.emit(f.z, f.x, f.y, 0.6, 50, { color: f.s === 'mutant' ? '#e8b04a' : '#33ffd1', speed: 2, life: 1.2, size: 0.4, up: 1.4 })
})
regFx('evolved', (gs, _w, f) => {
  sfx('bigBoom', f.x, f.y)
  gs.fx.flash(f.z, f.x, f.y, 1.2, '#b28cff', 2.5, 0.6)
  gs.fx.shock(f.z, f.x, f.y, 5, '#b28cff', 1)
  gs.fx.emit(f.z, f.x, f.y, 0.8, 100, { color: '#b28cff', speed: 5, life: 1, size: 0.5, up: 1 })
})
regFx('infect', (gs, _w, f) => gs.fx.emit(f.z, f.x, f.y, 0.5, 30, { color: '#7a3cff', speed: 1.2, life: 1.2, size: 0.4, up: 0.6 }))
regFx('egg', (gs, _w, f) => gs.fx.emit(f.z, f.x, f.y, 0.3, 14, { color: '#33ffd1', speed: 1, life: 0.8, size: 0.25, up: 0.8 }))
regFx('devour', (gs, _w, f) => gs.fx.emit(f.z, f.x, f.y, 0.6, 24, { color: '#c8323c', speed: 2, life: 0.6, size: 0.3, up: 1, grav: 4 }))
LOOKS.shipGun = { color: '#9fe7ff', size: 0.18, hit: 0.6, sound: 'heavy', style: 'orb' }
