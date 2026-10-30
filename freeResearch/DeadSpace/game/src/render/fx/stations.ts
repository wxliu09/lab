// 站點設施與太空站技能的特效（天守主砲、反物質傳送、豪勇號降落、傳送台、鑄造台、標本籠、跳躍、重力校正、封鎖信標…）
import * as THREE from 'three'
import { regFx } from '../fxBinding'
import type { GameScene } from '../gameScene'
import { sfx } from '../../audio/sfx'
import { UNITS } from '../../shared/content/registry'
import { GEO } from '../fx'
import { at, beam, burst, entPos, follow3, muzzleOf, pillar, screenFlash, shake, telegraph, W } from './kit'

function every(gs: GameScene, z: number, dur: number, dt: number, fn: (k: number, t: number) => void): void {
  let last = -1
  gs.fx.addTransient(new THREE.Object3D(), dur, z, (k, t) => {
    if (last >= 0 && t - last < dt) return
    last = t
    fn(k, t)
  })
}

/** 太空站的半徑（模型大小）*/
function radiusOf(gs: GameScene, id?: number, fallback = 3): number {
  const e = id ? gs.world.ents.get(id) : undefined
  const d = e ? UNITS.get(e.s.d ?? '') : undefined
  return Math.max(1, d?.radius ?? fallback)
}

// ───────── 天守主砲 ─────────

regFx('cannonFire', (gs, _w, f) => {
  const z = f.z
  if (z !== 0) {
    // 站內：砲尾開火
    sfx('bigBoom', f.x, f.y)
    sfx('slam', f.x, f.y)
    gs.fx.flash(z, f.x, f.y, 1.2, '#9fe7ff', 1.4, 0.35)
    gs.fx.emit(z, f.x, f.y, 1, 40, { color: '#ffffff', color2: '#7fd8ff', speed: 6, life: 0.5, size: 1, up: 0.6, grav: 8, layer: 'spark' })
    gs.fx.emit(z, f.x, f.y, 0.8, 24, { color: '#4a5058', speed: 2.5, life: 2.2, size: 1, up: 0.5, layer: 'smoke', alpha: 0.65 })
    gs.fx.ring(z, f.x, f.y, 0.4, 4, '#9fe7ff', 0.6, { tex: 'ring', k: 2.6 })
    shake(gs, 0.8, f.x, f.y)
    return
  }
  const dx = (f.x2 ?? f.x) - f.x
  const dy = (f.y2 ?? f.y) - f.y
  const l = Math.hypot(dx, dy) || 1
  const r = 3.2
  const mx = f.x + (dx / l) * r
  const my = f.y + (dy / l) * r
  sfx('bigBoom', mx, my)
  sfx('chrono', mx, my)
  gs.fx.flash(z, mx, my, 0.5, '#bfefff', 2.2, 0.5)
  gs.fx.glow(z, mx, my, 0.5, '#7fd8ff', 9, 0.8, { tex: 'star', k: 2.6, grow: 1.4 })
  gs.fx.ring(z, mx, my, 0.5, 6, '#9fe7ff', 0.7, { tex: 'ring', k: 2.6, h: 0.3 })
  gs.fx.emit(z, mx, my, 0.5, 50, { color: '#ffffff', color2: '#7fd8ff', speed: 9, life: 0.8, size: 0.6, up: 0.2, dir: [dx, dy], spread: 0.5 })
  gs.fx.light(z, mx, my, 2, '#9fe7ff', 600, 25, 0.6)
  shake(gs, 0.5, mx, my)
})

regFx('cannonFizzle', (gs, _w, f) => {
  sfx('implode', f.x, f.y)
  gs.fx.glow(f.z, f.x, f.y, 0.5, '#9fe7ff', 3, 0.8, { k: 2, grow: 0.2 })
  gs.fx.emit(f.z, f.x, f.y, 0.5, 30, { color: '#d8f6ff', color2: '#3a6a9a', speed: 2, life: 1.2, size: 0.4, up: 0.2, drag: 0.6 })
})

regFx('cannonHit', (gs, _w, f) => {
  const r = Math.max(1, f.v ?? 2)
  const p = at(gs, f)
  sfx('impact', p.x, p.y)
  screenFlash(gs, '#dff4ff', 1.6, 0.4, p.x, p.y)
  gs.fx.flash(f.z, p.x, p.y, 0.6, '#e8f6ff', r * 0.9, 0.5)
  gs.fx.glow(f.z, p.x, p.y, 0.6, '#7fd8ff', r * 6, 1.2, { k: 2.2, grow: 1.5 })
  gs.fx.ring(f.z, p.x, p.y, r * 0.4, r * 4, '#9fe7ff', 1, { tex: 'ring', k: 2.8, h: 0.3 })
  gs.fx.emit(f.z, p.x, p.y, 0.6, 90, { color: '#ffffff', color2: '#ff7a3a', speed: r * 5, life: 1.2, size: 1, grow: 1.4, up: 0.2, drag: 1, hArea: r })
  gs.fx.emit(f.z, p.x, p.y, 0.6, 30, { color: '#3a3a42', speed: r * 2, life: 3, size: 2, up: 0.1, drag: 0.6, layer: 'smoke', alpha: 0.6 })
  gs.fx.debris(f.z, p.x, p.y, 0.6, 16, 'metal', { speed: r * 4, size: 0.25, up: 0.2, life: 3.5 })
  gs.fx.light(f.z, p.x, p.y, 2, '#9fe7ff', 1200, r * 12, 1)
  shake(gs, 0.9, p.x, p.y)
})

// ───────── 反物質傳送 ─────────

regFx('atmLock', (gs, _w, f) => {
  // 60 秒鎖定：目標站外圍的紅色瞄準環（跟著站走）
  const dur = f.v ?? 60
  const r = radiusOf(gs, f.e, 3) * 1.5
  sfx('alarm', f.x, f.y)
  sfx('lock', f.x, f.y)
  const fol = follow3(gs, f.e, 0, { x: f.x, y: f.y })
  gs.fx.ring(f.z, f.x, f.y, r, r, '#ff3b3b', dur, { tex: 'arrows', k: 2.2, spin: 0.6, env: 'pulse', pulseHz: 0.8, follow: fol, h: 0.2 })
  gs.fx.ring(f.z, f.x, f.y, r * 1.25, r * 1.25, '#ff3b3b', dur, { tex: 'ring', k: 1.8, env: 'pulse', pulseHz: 1.6, follow: fol, h: 0.2 })
  gs.fx.ring(f.z, f.x, f.y, r * 4, r, '#ff3b3b', 1.2, { tex: 'ring', k: 2.4, ease: 'in', follow: fol, h: 0.2 })
})

regFx('atmStrike', (gs, _w, f) => {
  const r = Math.max(2, f.v ?? 3)
  const p = at(gs, f)
  sfx('nuke', p.x, p.y)
  screenFlash(gs, '#f0e8ff', 3, 1, p.x, p.y)
  // 先向內塌縮，再爆開
  gs.fx.ring(f.z, p.x, p.y, r * 4, 0.5, '#c9a8ff', 0.5, { tex: 'ring', k: 3, ease: 'in', h: 0.3 })
  gs.fx.after(0.45, () => {
    gs.fx.flash(f.z, p.x, p.y, 0.6, '#ffffff', r * 1.5, 0.8)
    gs.fx.glow(f.z, p.x, p.y, 0.6, '#b28cff', r * 10, 2.4, { k: 2.4, grow: 1.6 })
    gs.fx.glow(f.z, p.x, p.y, 0.6, '#ffffff', r * 5, 1, { tex: 'star', k: 3, grow: 2 })
    for (let i = 0; i < 3; i++) gs.fx.after(i * 0.2, () => gs.fx.ring(f.z, p.x, p.y, r, r * (8 + i * 3), i % 2 ? '#ff9a5a' : '#c9a8ff', 1.8, { tex: 'ring', k: 3, h: 0.3 }))
    gs.fx.emit(f.z, p.x, p.y, 0.6, 160, { color: '#ffffff', color2: '#7a3cff', speed: r * 6, life: 1.6, size: 1.4, grow: 1.5, up: 0.2, drag: 0.8, hArea: r })
    gs.fx.debris(f.z, p.x, p.y, 0.6, 30, 'metal', { speed: r * 5, size: 0.35, up: 0.2, life: 5 })
    gs.fx.light(f.z, p.x, p.y, 3, '#c9a8ff', 4000, 90, 2)
    shake(gs, 1)
  })
})

// ───────── 豪勇號降落／升空 ─────────

regFx('bravadoLand', (gs, _w, f) => {
  sfx('rocket', f.x, f.y)
  gs.fx.after(0.6, () => sfx('thud', f.x, f.y))
  gs.fx.ring(f.z, f.x, f.y, 1, 7, '#ffb46b', 1.2, { tex: 'ring', k: 2.2, h: 0.3 })
  gs.fx.glow(f.z, f.x, f.y, 0.5, '#ffd9a0', 8, 1, { k: 1.8, grow: 1.4 })
  gs.fx.emit(f.z, f.x, f.y, 0.4, 60, { color: '#d8d0c0', speed: 5, life: 2, size: 1.6, up: 0.1, drag: 1, layer: 'smoke', alpha: 0.5, area: 2, radial: 1 })
  gs.fx.emit(f.z, f.x, f.y, 0.4, 40, { color: '#ffe0a0', color2: '#ff6a1a', speed: 4, life: 0.8, size: 0.8, up: 0.2 })
})

regFx('bravadoLaunch', (gs, _w, f) => {
  sfx('rocket', f.x, f.y)
  sfx('rumble', f.x, f.y)
  gs.fx.flash(f.z, f.x, f.y, 0.5, '#ffd9a0', 2, 0.5)
  gs.fx.ring(f.z, f.x, f.y, 1, 8, '#ffb46b', 1.4, { tex: 'ring', k: 2.4, h: 0.3 })
  gs.fx.emit(f.z, f.x, f.y, 0.4, 80, { color: '#ffe8c0', color2: '#ff5a1a', speed: 6, life: 1.2, size: 1, grow: 1.6, up: 0.2, drag: 1 })
  gs.fx.emit(f.z, f.x, f.y, 0.4, 40, { color: '#8a8478', speed: 3, life: 3, size: 2, up: 0.1, drag: 0.6, layer: 'smoke', alpha: 0.5 })
  shake(gs, 0.6, f.x, f.y)
})

// ───────── 傳送台（擺渡號）─────────

regFx('portCharge', (gs, _w, f) => {
  const dur = f.v ?? 19.5
  sfx('charge', f.x, f.y)
  telegraph(gs, f.z, f.x, f.y, 1.4, '#7fd8ff', dur, { hz: 0.6 })
  gs.fx.ring(f.z, f.x, f.y, 1.3, 1.3, '#9fe7ff', dur, { tex: 'swirl', k: 1.4, spin: 1.5, env: 'hold', fadeIn: 0.1, opacity: 0.6 })
  every(gs, f.z, dur, 0.08, (k) => {
    gs.fx.emit(f.z, f.x, f.y, 0.1, 1 + Math.round(k * 3), { color: '#d8f6ff', color2: '#7fd8ff', speed: 0.3 + k, life: 1, size: 0.12, up: 1.2 + k * 2, area: 1.2, ring: true, drag: 0.3 })
  })
  gs.fx.after(Math.max(0, dur - 2.5), () => {
    sfx('charge', f.x, f.y)
    pillar(gs, f.z, f.x, f.y, 0.9, 3, '#9fe7ff', 2.7, { k: 1.8 })
  })
})

function portBlast(gs: GameScene, z: number, x: number, y: number, inward: boolean): void {
  sfx('warp', x, y)
  pillar(gs, z, x, y, 0.6, 3.2, '#9fe7ff', 0.7, { k: 2.4, shrink: inward })
  gs.fx.flash(z, x, y, 1, '#d8f6ff', 0.8, 0.3)
  gs.fx.ring(z, x, y, inward ? 1.6 : 0.2, inward ? 0.2 : 1.8, '#9fe7ff', 0.45, { tex: 'ring', k: 2.4 })
  gs.fx.emit(z, x, y, 1, 30, { color: '#ffffff', color2: '#7fd8ff', speed: 2, life: 0.6, size: 0.18, up: 0.6, area: inward ? 1.2 : 0, ring: inward, radial: inward ? -1 : 0, hArea: 1.8 })
}

regFx('portDepart', (gs, _w, f) => {
  const p = at(gs, f)
  portBlast(gs, f.z, p.x, p.y, true)
})
regFx('portArrive', (gs, _w, f) => portBlast(gs, f.z, f.x, f.y, false))
regFx('portalHop', (gs, _w, f) => {
  const p = at(gs, f)
  sfx('blink', p.x, p.y)
  gs.fx.ring(f.z, p.x, p.y, 1.2, 0.2, '#9fe7ff', 0.35, { tex: 'swirl', k: 2, spin: 8, ease: 'in' })
  gs.fx.flash(f.z, p.x, p.y, 1, '#9fe7ff', 0.4, 0.2)
  gs.fx.emit(f.z, p.x, p.y, 1, 16, { color: '#d8f6ff', speed: 1.2, life: 0.4, size: 0.14, up: 0.6, hArea: 1.4 })
})

// ───────── 女帝號跳躍（模組）─────────

regFx('jumpCharge', (gs, _w, f) => {
  const dur = f.v ?? 20
  const r = radiusOf(gs, f.e, 3)
  sfx('charge', f.x, f.y)
  const fol = follow3(gs, f.e, 0, { x: f.x, y: f.y })
  // 目的地的到達圈
  telegraph(gs, f.z, f.x2 ?? f.x, f.y2 ?? f.y, r * 1.2, '#9fe7ff', dur, { hz: 0.5 })
  gs.fx.ring(f.z, f.x, f.y, r * 1.6, r * 1.6, '#9fe7ff', dur, { tex: 'swirl', k: 1.6, spin: 0.8, env: 'hold', fadeIn: 0.2, opacity: 0.7, follow: fol, h: 0.2 })
  every(gs, f.z, dur, 0.06, (k) => {
    const p = entPos(gs, f.e) ?? { x: f.x, y: f.y, h: 2 }
    gs.fx.emit(f.z, p.x, p.y, 0.3, 1 + Math.round(k * 3), { color: '#d8f6ff', color2: '#4a8aff', speed: 1 + k * 3, life: 1, size: 0.4, up: 0.05, area: r * 2.2, ring: true, radial: -1, swirl: 3 + k * 8, drag: 0.2 })
  })
  gs.fx.after(Math.max(0, dur - 1.6), () => sfx('charge', f.x, f.y))
})

regFx('jumpArrive', (gs, _w, f) => {
  const ox = f.x2 ?? f.x
  const oy = f.y2 ?? f.y
  sfx('warp', f.x, f.y)
  sfx('bigBoom', f.x, f.y)
  // 出發點：塌縮；到達點：爆開；兩點之間一道拉長的光
  gs.fx.ring(f.z, ox, oy, 8, 0.5, '#9fe7ff', 0.5, { tex: 'ring', k: 2.6, ease: 'in', h: 0.3 })
  gs.fx.glow(f.z, ox, oy, 0.5, '#9fe7ff', 6, 0.5, { k: 2, grow: 0.1 })
  beam(gs, f.z, W(ox, oy, 0.5), W(f.x, f.y, 0.5), '#bfefff', 0.6, 0.45, { k: 3 })
  gs.fx.flash(f.z, f.x, f.y, 0.5, '#e8f6ff', 2.5, 0.5)
  gs.fx.ring(f.z, f.x, f.y, 0.5, 12, '#9fe7ff', 1, { tex: 'ring', k: 2.6, h: 0.3 })
  gs.fx.emit(f.z, f.x, f.y, 0.5, 80, { color: '#ffffff', color2: '#4a8aff', speed: 8, life: 1, size: 0.6, up: 0.1, drag: 1 })
  screenFlash(gs, '#dff4ff', 1.4, 0.4, f.x, f.y)
  shake(gs, 0.5, f.x, f.y)
})

// ───────── 重力校正、封鎖信標、外部維修 ─────────

regFx('gravCorrection', (gs, _w, f) => {
  const dur = Math.max(1, f.v ?? 4)
  const dx = (f.x2 ?? f.x) - f.x
  const dy = (f.y2 ?? f.y) - f.y
  const l = Math.hypot(dx, dy) || 1
  const r = radiusOf(gs, f.e, 3)
  sfx('grav', f.x, f.y)
  every(gs, f.z, dur, 0.35, () => {
    const p = entPos(gs, f.e) ?? { x: f.x, y: f.y, h: 2 }
    // 推力環從背面往後擴散
    const bx = p.x - (dx / l) * r * 1.2
    const by = p.y - (dy / l) * r * 1.2
    const m = gs.fx.mesh(GEO.torus, '#9fa8ff', 2.2, { opacity: 0.8 })
    const dir = W(-dx / l, -dy / l, 0).normalize()
    m.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), dir)
    const mm = m.material as THREE.MeshBasicMaterial
    gs.fx.addTransient(m, 1.2, f.z, (k) => {
      m.position.copy(W(bx - (dx / l) * k * 5, by - (dy / l) * k * 5, 0.3))
      m.scale.setScalar(r * (0.6 + k * 1.2))
      mm.opacity = 0.8 * (1 - k)
    })
    gs.fx.emit(f.z, bx, by, 0.3, 6, { color: '#c8d0ff', speed: 4, life: 0.8, size: 0.4, up: 0, dir: [-dx, -dy], spread: 0.4 })
  })
  sfx('rumble', f.x, f.y)
})

regFx('cordonBeam', (gs, _w, f) => {
  const a = entPos(gs, f.e) ?? { x: f.x, y: f.y, h: 2 }
  const b = entPos(gs, f.e2) ?? { x: f.x2 ?? f.x, y: f.y2 ?? f.y, h: 2 }
  sfx('lock', b.x, b.y)
  sfx('laser', a.x, a.y)
  beam(gs, f.z, W(a.x, a.y, 0.6), W(b.x, b.y, 0.6), '#ffc23d', 0.25, 1, {
    flow: '#ffe08a',
    track: () => {
      const p = entPos(gs, f.e) ?? a
      const q = entPos(gs, f.e2) ?? b
      return [W(p.x, p.y, 0.6), W(q.x, q.y, 0.6)]
    },
  })
  const r = radiusOf(gs, f.e2, 2.5) * 1.3
  gs.fx.ring(f.z, b.x, b.y, r * 2, r, '#ffc23d', 0.8, { tex: 'arrows', k: 2.4, ease: 'in', spin: -2, follow: follow3(gs, f.e2, 0), h: 0.3 })
  gs.fx.glow(f.z, b.x, b.y, 1.5, '#ffc23d', 2.4, 1.6, { tex: 'lock', k: 2.4, fadeIn: 0.1, follow: follow3(gs, f.e2, 0.8) })
})

regFx('repairBeam', (gs, _w, f) => {
  const a = muzzleOf(gs, f.e) ?? entPos(gs, f.e) ?? { x: f.x, y: f.y, h: 0.6 }
  const tx = f.x2 ?? f.x
  const ty = f.y2 ?? f.y
  sfx('healBeam', a.x, a.y)
  beam(gs, f.z, W(a.x, a.y, 0.6), W(tx, ty, 0.6), '#5cf2a5', 0.12, 0.45, { flow: '#d8ffe8' })
  gs.fx.emit(f.z, tx, ty, 0.6, 10, { color: '#ffffff', color2: '#5cf2a5', speed: 3, life: 0.5, size: 1, up: 0.3, layer: 'spark' })
  gs.fx.glow(f.z, tx, ty, 0.6, '#5cf2a5', 2.4, 0.4, { k: 2 })
})

// ───────── 設施（站內）─────────

regFx('cageBuild', (gs, _w, f) => {
  const dur = f.v ?? 10
  sfx('deploy', f.x, f.y)
  telegraph(gs, f.z, f.x, f.y, 1.6, '#ffc23d', dur, { hz: 0.7 })
  const ring = gs.fx.mesh(GEO.ringThin, '#ffc23d', 3)
  ring.scale.setScalar(1.3)
  gs.fx.addTransient(ring, dur, f.z, (k, t) => {
    ring.position.copy(W(f.x, f.y, (0.5 + 0.5 * Math.sin(t * 2)) * 1.8 * Math.min(1, k * 4)))
  })
  every(gs, f.z, dur, 0.12, () => {
    const a = Math.random() * Math.PI * 2
    gs.fx.emit(f.z, f.x + Math.cos(a) * 1.3, f.y + Math.sin(a) * 1.3, Math.random() * 1.8, 3, { color: '#ffffff', color2: '#ffb000', speed: 2.4, life: 0.4, size: 1, up: 0.4, grav: 10, layer: 'spark' })
  })
  every(gs, f.z, dur, 1.1, () => sfx('weld', f.x, f.y))
})

regFx('cageDone', (gs, _w, f) => {
  sfx('clang', f.x, f.y)
  gs.fx.flash(f.z, f.x, f.y, 1, '#ffd27a', 0.8, 0.3)
  gs.fx.ring(f.z, f.x, f.y, 0.3, 2.2, '#ffc23d', 0.5, { tex: 'ring', k: 2.4 })
  pillar(gs, f.z, f.x, f.y, 0.9, 2.2, '#ffc23d', 0.6, { k: 1.4 })
})

regFx('cageBreak', (gs, _w, f) => {
  sfx('shatterMetal', f.x, f.y)
  sfx('boom', f.x, f.y)
  gs.fx.debris(f.z, f.x, f.y, 1, 14, 'metal', { speed: 4, size: 0.1, up: 0.9 })
  gs.fx.debris(f.z, f.x, f.y, 1, 10, 'glass', { speed: 3, size: 0.07, life: 1.4, colors: ['#e8fff8'] })
  gs.fx.emit(f.z, f.x, f.y, 1, 26, { color: '#ffffff', color2: '#ffc23d', speed: 5, life: 0.5, size: 1, up: 0.6, grav: 9, layer: 'spark' })
  gs.fx.emit(f.z, f.x, f.y, 0.6, 10, { color: '#5a5450', speed: 1.4, life: 1.6, size: 0.8, up: 0.4, layer: 'smoke', alpha: 0.5 })
  shake(gs, 0.3, f.x, f.y)
})

regFx('fabricate', (gs, _w, f) => {
  // 鑄造台重建仿生人：30 秒的組裝光束、零件在台上聚合
  const dur = f.v ?? 30
  const px = f.x2 ?? f.x
  const py = f.y2 ?? f.y
  sfx('repair', f.x, f.y)
  telegraph(gs, f.z, px, py, 0.9, '#ffb000', dur, { hz: 0.5 })
  every(gs, f.z, dur, 0.5, () => beam(gs, f.z, W(f.x, f.y, 1.4), W(px + (Math.random() - 0.5) * 0.4, py + (Math.random() - 0.5) * 0.4, 0.2 + Math.random() * 1.4), '#ffb000', 0.025, 0.45, { k: 3 }))
  every(gs, f.z, dur, 0.1, (k) => {
    gs.fx.emit(f.z, px, py, 0.1 + k * 1.6, 2, { color: '#ffffff', color2: '#ffb000', speed: 2, life: 0.35, size: 1, up: 0.5, grav: 8, layer: 'spark' })
    gs.fx.emit(f.z, px, py, 0.5, 1, { color: '#ffe0a0', speed: 0.3, life: 0.8, size: 0.12, up: 0.2, area: 0.8, ring: true, radial: -1, hArea: 1.6 })
  })
  every(gs, f.z, dur, 2.5, () => sfx('repair', px, py))
})

regFx('fabricated', (gs, _w, f) => {
  const p = at(gs, f)
  sfx('deploy', p.x, p.y)
  sfx('evolve', p.x, p.y)
  pillar(gs, f.z, p.x, p.y, 0.7, 3, '#ffb000', 0.9, { k: 2 })
  gs.fx.flash(f.z, p.x, p.y, 1, '#ffe0a0', 0.9, 0.35)
  gs.fx.ring(f.z, p.x, p.y, 0.2, 2, '#ffb000', 0.6, { tex: 'ring', k: 2.4 })
  gs.fx.emit(f.z, p.x, p.y, 1, 30, { color: '#ffffff', color2: '#ffb000', speed: 3, life: 0.6, size: 1, up: 0.6, layer: 'spark', hArea: 1.6 })
})

regFx('factoryStart', (gs, _w, f) => {
  const p = at(gs, f)
  sfx('arm', p.x, p.y)
  sfx('clank', p.x, p.y)
  gs.fx.ring(f.z, p.x, p.y, 0.3, 1.6, '#ffb000', 0.6, { tex: 'ring', k: 2.2 })
  gs.fx.emit(f.z, p.x, p.y, 1, 14, { color: '#ffffff', color2: '#ffb000', speed: 2.6, life: 0.4, size: 1, up: 0.6, grav: 9, layer: 'spark' })
  gs.fx.emit(f.z, p.x, p.y, 1.2, 6, { color: '#8a8a8a', speed: 0.4, life: 1.6, size: 0.5, up: 1, layer: 'smoke', alpha: 0.35 })
})

regFx('moduleDone', (gs, _w, f) => {
  const tx = f.x2 ?? f.x
  const ty = f.y2 ?? f.y
  sfx('vend', f.x, f.y)
  const orb = gs.fx.sprite('star', '#ffe08a', 2.6)
  orb.scale.setScalar(0.4)
  gs.fx.addTransient(orb, 0.5, f.z, (k) => orb.position.copy(W(f.x + (tx - f.x) * k, f.y + (ty - f.y) * k, 1 + Math.sin(k * Math.PI) * 0.8 - k * 0.8)))
  gs.fx.after(0.5, () => burst(gs, f.z, tx, ty, 0.3, '#ffe08a', 0.6, { ring: true }))
})

regFx('moduleInstall', (gs, _w, f) => {
  const p = at(gs, f)
  sfx('deploy', p.x, p.y)
  pillar(gs, f.z, p.x, p.y, 0.6, 2.4, '#33ffd1', 0.7, { k: 1.8 })
  gs.fx.ring(f.z, p.x, p.y, 0.2, 1.6, '#33ffd1', 0.5, { tex: 'ring', k: 2.4 })
  gs.fx.emit(f.z, p.x, p.y, 1, 20, { color: '#ffffff', color2: '#33ffd1', speed: 2.5, life: 0.5, size: 1, up: 0.7, grav: 6, layer: 'spark', hArea: 1.4 })
})

regFx('gitDraw', (gs, _w, f) => {
  // 抽血：一滴血被吸進取樣器，旁邊閃過 DNA 雙螺旋
  const p = at(gs, f)
  sfx('beep', p.x, p.y)
  const h = Math.min(1.3, p.h * 0.55)
  gs.fx.emit(f.z, p.x, p.y, h, 6, { color: '#ff3b3b', color2: '#7a0a0a', speed: 0.6, life: 0.6, size: 0.12, up: 1.4, drag: 2 })
  every(gs, f.z, 0.8, 0.03, (k) => {
    for (const s of [0, Math.PI]) {
      const a = k * Math.PI * 5 + s
      gs.fx.emit(f.z, p.x + Math.cos(a) * 0.22, p.y + Math.sin(a) * 0.22, h + 0.3 + k * 0.8, 1, { color: s ? '#33ffd1' : '#9fe7ff', speed: 0.02, life: 0.5, size: 0.1, up: 0 })
    }
  })
})

regFx('neurotoxin', (gs, _w, f) => {
  // 神經毒素灌進站內（只給受害者本人看）：身邊冒出黃綠色毒霧
  const p = at(gs, f)
  gs.fx.emit(f.z, p.x, p.y, 0.4, 4, { color: '#8a9a3a', speed: 0.4, life: 1.6, size: 0.8, up: 0.5, area: 0.6, layer: 'smoke', alpha: 0.35 })
  gs.fx.emit(f.z, p.x, p.y, 1, 3, { color: '#c8ff5a', speed: 0.2, life: 0.8, size: 0.1, up: 0.4, area: 0.4 })
})

const POWER_COLOR: Record<string, string> = { normal: '#9fe7ff', ambient: '#5cf2a5', explorer: '#ffc23d', station: '#ff7a2a', lab: '#b28cff' }

regFx('powerMode', (gs, _w, f) => {
  const col = POWER_COLOR[f.s ?? 'normal'] ?? '#9fe7ff'
  sfx('arm', f.x, f.y)
  gs.fx.ring(f.z, f.x, f.y, 0.3, 6, col, 1.2, { tex: 'ring', k: 2.4 })
  gs.fx.ring(f.z, f.x, f.y, 0.3, 3, col, 0.8, { tex: 'grid', k: 1.4, opacity: 0.6 })
  gs.fx.emit(f.z, f.x, f.y, 1.2, 16, { color: '#ffffff', color2: col, speed: 2.4, life: 0.4, size: 1, up: 0.5, layer: 'spark' })
  gs.fx.light(f.z, f.x, f.y, 2, col, 40, 8, 1, { attack: 0.2, flicker: 0.3 })
})

regFx('remote', (gs, _w, f) => {
  const p = at(gs, f)
  sfx('scan', p.x, p.y)
  for (let i = 0; i < 3; i++) gs.fx.after(i * 0.15, () => gs.fx.ring(f.z, p.x, p.y, 0.3, 2.4, '#33ffd1', 0.6, { tex: 'ring', k: 2, h: Math.min(2, p.h), follow: follow3(gs, f.e, 0) }))
  gs.fx.emit(f.z, p.x, p.y, Math.min(2, p.h), 12, { color: '#d8fff8', color2: '#33ffd1', speed: 1.5, life: 0.4, size: 0.1, up: 0.2 })
})
