// 技能與事件特效（sim 直接 emitFx 的 id）：異形、變種人、防護服、道具、裝置、隨機事件
import * as THREE from 'three'
import { regFx } from '../fxBinding'
import type { GameScene } from '../gameScene'
import type { FxEvent } from '../../shared/protocol/messages'
import { sfx } from '../../audio/sfx'
import { GEO } from '../fx'
import { fxTex } from './tex'
import { at, beam, bolt, dome, entPos, follow3, ghost, pillar, shake, shieldMat, telegraph, viewRoot, W } from './kit'

const XV = '#7a3cff'
const XC = '#33ffd1'
const MR = '#c8323c'
const MA = '#e8b04a'

/** 每 dt 秒呼叫一次 fn，持續 dur 秒（特效時鐘）*/
function every(gs: GameScene, z: number, dur: number, dt: number, fn: (k: number, t: number) => void): void {
  let last = -1
  gs.fx.addTransient(new THREE.Object3D(), dur, z, (k, t) => {
    if (last >= 0 && t - last < dt) return
    last = t
    fn(k, t)
  })
}

// ───────── 光束（汲取器、能量虹吸、生命轉移）─────────

regFx('beam', (gs, _w, f) => {
  const s = f.s ?? 'plasma'
  const col = s === 'pulse' ? '#ff7eb6' : s === 'heal' ? '#5cf2a5' : '#7dff6a'
  const flow = s === 'pulse' ? '#ffd0e8' : s === 'heal' ? '#d8ffe8' : '#c8ff9a'
  const dur = s === 'plasma' ? 0.55 : s === 'pulse' ? 0.3 : 0.7
  const a0 = entPos(gs, f.e) ?? { x: f.x, y: f.y, h: 1.2 }
  const b0 = entPos(gs, f.e2) ?? { x: f.x2 ?? f.x, y: f.y2 ?? f.y, h: 1.6 }
  const ha = s === 'plasma' ? 0.62 : 0.6
  const track = (): [THREE.Vector3, THREE.Vector3] | null => {
    const a = entPos(gs, f.e) ?? a0
    const b = entPos(gs, f.e2) ?? b0
    return [W(a.x, a.y, Math.min(1.3, a.h * ha)), W(b.x, b.y, Math.min(1.3, b.h * 0.55))]
  }
  const [A, B] = track()!
  // 汲取：能量從目標流回裝置；虹吸：從目標流向施放者（x→x2）；治療：施放者流向目標
  beam(gs, f.z, A, B, col, s === 'heal' ? 0.06 : 0.045, dur, { flow, flowDir: s === 'plasma' ? -1 : 1, track, wobble: 0.15 })
  sfx(s === 'heal' ? 'healBeam' : 'drain', a0.x, a0.y)
  const tgt = s === 'plasma' ? b0 : s === 'pulse' ? a0 : b0
  gs.fx.emit(f.z, tgt.x, tgt.y, Math.min(1.3, tgt.h * 0.55), 4, { color: '#ffffff', color2: col, speed: 2, life: 0.3, size: 1, up: 0.5, grav: 4, layer: 'spark' })
})

// ───────── 異形 ─────────

regFx('deflect', (gs, _w, f) => {
  const p = at(gs, f)
  sfx('deflect', p.x, p.y)
  dome(gs, f.z, p.x, p.y, Math.max(0.6, p.h * 0.55), XC, 0.35, { sphere: true, follow: follow3(gs, f.e, 0), k: 2.2, pop: true })
  gs.fx.emit(f.z, p.x, p.y, p.h * 0.55, 8, { color: '#ffffff', color2: XC, speed: 3, life: 0.3, size: 1, up: 0.4, layer: 'spark' })
})

regFx('mirageBreak', (gs, _w, f) => {
  sfx('shatter', f.x, f.y)
  gs.fx.flash(f.z, f.x, f.y, 1, '#c9b6ff', 0.5, 0.35)
  gs.fx.ring(f.z, f.x, f.y, 0.3, 1.4, '#c9b6ff', 0.4, { tex: 'ring', k: 2 })
  gs.fx.debris(f.z, f.x, f.y, 1, 14, 'glass', { speed: 3.5, size: 0.08, up: 0.9, life: 1.4 })
  gs.fx.emit(f.z, f.x, f.y, 1, 20, { color: '#e8dcff', color2: '#7a3cff', speed: 2.5, life: 0.6, size: 0.14, up: 0.6, hArea: 1.2 })
})

regFx('entropy', (gs, _w, f) => {
  const r = f.v ?? 3
  sfx('implode', f.x, f.y)
  gs.fx.ring(f.z, f.x, f.y, r * 1.2, 0.2, '#8a4cff', 0.6, { tex: 'ring', k: 2.6, ease: 'in' })
  gs.fx.ring(f.z, f.x, f.y, 0.3, r, '#1a0a3a', 1.2, { tex: 'swirl', k: 1, add: false, opacity: 0.7, spin: 3, fadeIn: 0.2 })
  gs.fx.emit(f.z, f.x, f.y, 0.4, 40, { color: '#b28cff', color2: XC, speed: 0.6, life: 0.9, size: 0.22, up: 0.05, area: r, ring: true, radial: -1, pull: 6, swirl: 4, drag: 0.5 })
  gs.fx.flash(f.z, f.x, f.y, 0.4, '#8a4cff', 0.5, 0.3)
})

regFx('steal', (gs, w, f) => {
  // 道具從目標身上被扯走，畫弧飛向竊賊
  sfx('steal', f.x, f.y)
  const from = entPos(gs, f.e2) ?? { x: f.x, y: f.y, h: 1.6 }
  const fromH = Math.min(1.2, from.h * 0.55)
  const orb = gs.fx.sprite('star', '#ffe08a', 3)
  orb.scale.setScalar(0.45)
  const core = gs.fx.mesh(GEO.octa, '#ffd060', 3)
  core.scale.setScalar(0.07)
  const g = new THREE.Group()
  g.add(orb, core)
  let last = 0
  gs.fx.addTransient(g, 0.45, f.z, (k, t) => {
    const to = entPos(gs, f.e) ?? { x: f.x2 ?? f.x, y: f.y2 ?? f.y, h: 1.6 }
    const x = from.x + (to.x - from.x) * k
    const y = from.y + (to.y - from.y) * k
    const h = fromH + (Math.min(1.2, to.h * 0.55) - fromH) * k + Math.sin(k * Math.PI) * 1.1
    g.position.copy(W(x, y, h))
    core.rotation.y += 0.4
    if (t - last > 0.025) {
      last = t
      gs.fx.emit(f.z, x, y, h, 2, { color: '#ffe08a', speed: 0.3, life: 0.4, size: 0.12, up: 0 })
    }
  })
  gs.fx.emit(f.z, from.x, from.y, fromH, 8, { color: '#ffffff', color2: '#ffd060', speed: 2.5, life: 0.3, size: 1, up: 0.5, layer: 'spark' })
  void w
})

regFx('flux', (gs, _w, f) => {
  const p = at(gs, f)
  sfx('rewind', p.x, p.y)
  gs.fx.ring(f.z, p.x, p.y, 0.4, 2.2, '#7fd8ff', 1, { tex: 'clock', k: 2.2, spin: -3 })
  gs.fx.ring(f.z, p.x, p.y, 2.4, 0.3, '#ffd27a', 0.8, { tex: 'ring', k: 2, ease: 'in' })
  gs.fx.emit(f.z, p.x, p.y, 1, 30, { color: '#bfefff', color2: '#ffd27a', speed: 0.8, life: 1, size: 0.18, up: 0.2, area: 1.8, ring: true, radial: -1, hArea: 1.4, drag: 0.3 })
  const r = viewRoot(gs, f.e)
  if (r) ghost(gs, r, '#7fd8ff', 0.9, { opacity: 0.45, drift: new THREE.Vector3(0.6, 0, 0.4) })
})

regFx('mute', (gs, _w, f) => {
  const p = at(gs, f)
  sfx('mute', p.x, p.y)
  const h = Math.min(2, p.h * 0.95)
  for (let i = 0; i < 3; i++) {
    gs.fx.after(i * 0.12, () => gs.fx.ring(f.z, p.x, p.y, 1.6, 0.15, '#b28cff', 0.45, { tex: 'ring', k: 2.4, h, ease: 'in', follow: follow3(gs, f.e, 0) }))
  }
  const icon = gs.fx.glow(f.z, p.x, p.y, h + 0.5, '#d8c8ff', 0.5, 1.6, { tex: 'muted', k: 1.8, fadeIn: 0.15, over: true, follow: () => {
    const q = entPos(gs, f.e)
    return q ? W(q.x, q.y, Math.min(2, q.h * 0.95) + 0.5) : null
  } })
  void icon
})

regFx('manifold', (gs, _w, f) => {
  const p = at(gs, f)
  const n = Math.max(1, f.v ?? 1)
  sfx('mirror', p.x, p.y)
  gs.fx.flash(f.z, p.x, p.y, 1, '#c9b6ff', 0.8, 0.25)
  gs.fx.debris(f.z, p.x, p.y, 1.1, 10, 'glass', { speed: 3, size: 0.07, life: 1.2 })
  gs.fx.ring(f.z, p.x, p.y, 0.2, 1.8, '#c9b6ff', 0.5, { tex: 'ring', k: 2 })
  const r = viewRoot(gs, f.e)
  if (r)
    for (let i = 0; i < n + 1; i++) {
      const a = (i / (n + 1)) * Math.PI * 2
      ghost(gs, r, i % 2 ? '#7a3cff' : '#c9b6ff', 0.6, { opacity: 0.4, drift: new THREE.Vector3(Math.cos(a) * 1.2, 0, Math.sin(a) * 1.2) })
    }
})

regFx('petrify', (gs, _w, f) => {
  // 石化：蛇瞳的綠光一閃，石殼由腳往頭爬上去（一圈灰環往上掃），石屑與塵霧
  const p = at(gs, f)
  sfx('stone', p.x, p.y)
  gs.fx.flash(f.z, p.x, p.y, p.h * 0.7, '#b8ff9a', 0.7, 0.35)
  const ring = gs.fx.mesh(GEO.ringThin, '#d8e0c8', 2.6)
  ring.scale.setScalar(0.5)
  const band = gs.fx.mesh(GEO.cyl, '#c8d0b8', 1.2, { map: fxTex('grad'), side: THREE.DoubleSide, opacity: 0.6 })
  const g = new THREE.Group()
  g.add(ring, band)
  g.position.copy(W(p.x, p.y, 0))
  const rm = ring.material as THREE.MeshBasicMaterial
  const bm = band.material as THREE.MeshBasicMaterial
  gs.fx.addTransient(g, 0.9, f.z, (k) => {
    const h = p.h * Math.min(1, k * 1.4)
    ring.position.y = h
    band.scale.set(0.45, Math.max(0.01, h), 0.45)
    rm.opacity = 1 - k * 0.6
    bm.opacity = 0.6 * (1 - k)
  })
  gs.fx.emit(f.z, p.x, p.y, 0.2, 30, { color: '#8a867a', speed: 0.7, life: 1.6, size: 0.5, up: 1.4, area: 0.6, swirl: 3, layer: 'smoke', alpha: 0.65 })
  gs.fx.emit(f.z, p.x, p.y, p.h * 0.5, 18, { color: '#e8f0d0', color2: '#7a8a6a', speed: 1.2, life: 0.8, size: 0.14, up: 0.4, hArea: p.h * 0.8 })
  gs.fx.debris(f.z, p.x, p.y, 0.3, 8, 'rock', { speed: 1.4, size: 0.07, up: 0.8, colors: ['#9a968a', '#7a766c'] })
  gs.fx.decal(f.z, p.x, p.y, 1.8, 'crack', '#2a2824', 12, { opacity: 0.75 })
})

regFx('unpetrify', (gs, _w, f) => {
  // 石殼崩裂：白光一閃、大塊石片四散、塵霧
  const p = at(gs, f)
  sfx('crumble', p.x, p.y)
  gs.fx.flash(f.z, p.x, p.y, p.h * 0.6, '#f0f0e0', 0.6, 0.25)
  gs.fx.debris(f.z, p.x, p.y, p.h * 0.6, 22, 'rock', { speed: 3, size: 0.14, up: 0.8, colors: ['#9a968a', '#7a766c', '#b0aca0'], area: 0.3 })
  gs.fx.emit(f.z, p.x, p.y, p.h * 0.5, 24, { color: '#9a968a', speed: 1.6, life: 1.6, size: 0.6, up: 0.4, hArea: p.h * 0.8, layer: 'smoke', alpha: 0.6 })
  gs.fx.ring(f.z, p.x, p.y, 0.3, 1.6, '#d8d4c8', 0.45, { tex: 'ring', k: 1.8 })
})

regFx('swarmbolt', (gs, _w, f) => {
  const a = entPos(gs, f.e) ?? { x: f.x, y: f.y, h: 1.6 }
  const b = entPos(gs, f.e2) ?? { x: f.x2 ?? f.x, y: f.y2 ?? f.y, h: 1.6 }
  sfx('zap', a.x, a.y)
  bolt(gs, f.z, W(a.x, a.y, Math.min(1.4, a.h * 0.6)), W(b.x, b.y, Math.min(1.3, b.h * 0.55)), '#c9a8ff', 0.07, 0.25, { flicker: 0.05, branches: 1, k: 7 })
  gs.fx.glow(f.z, b.x, b.y, Math.min(1.3, b.h * 0.55), '#b28cff', 1.2, 0.25, { tex: 'star', k: 2.4 })
  gs.fx.emit(f.z, b.x, b.y, Math.min(1.3, b.h * 0.55), 8, { color: XC, color2: XV, speed: 2.5, life: 0.35, size: 0.16, up: 0.5 })
  gs.fx.light(f.z, b.x, b.y, 1, '#b28cff', 14, 4, 0.2, { flicker: 0.5 })
})

regFx('coreForm', (gs, _w, f) => {
  const p = at(gs, f)
  sfx('squelch', p.x, p.y)
  sfx('evolve', p.x, p.y)
  gs.fx.flash(f.z, p.x, p.y, 0.8, XC, 1.2, 0.4)
  gs.fx.debris(f.z, p.x, p.y, 0.9, 18, 'flesh', { speed: 4, size: 0.12, colors: ['#3a1a5a', '#5a2a7a', '#1a0a2a'] })
  gs.fx.emit(f.z, p.x, p.y, 0.8, 40, { color: XC, color2: XV, speed: 3.5, life: 0.8, size: 0.3, up: 0.8, grav: 3 })
  gs.fx.emit(f.z, p.x, p.y, 0.6, 12, { color: '#1a0a2a', speed: 1.4, life: 1.6, size: 0.9, up: 0.4, layer: 'smoke', alpha: 0.7 })
  gs.fx.decal(f.z, p.x, p.y, 2.2, 'splat', '#1e0c34', 20, { opacity: 0.85 })
  gs.fx.ring(f.z, p.x, p.y, 0.3, 2.4, XV, 0.6, { tex: 'ring', k: 2.4 })
})

regFx('coreReform', (gs, _w, f) => {
  // 裸核重生：四周的光與肉屑被吸回核心，最後一爆長回原形
  const p = at(gs, f)
  sfx('morph', p.x, p.y)
  gs.fx.ring(f.z, p.x, p.y, 2.6, 0.3, XV, 0.5, { tex: 'ring', k: 2.6, ease: 'in' })
  gs.fx.glow(f.z, p.x, p.y, 0.8, XC, 1.6, 0.5, { k: 2, grow: 0.4, fadeIn: 0.6 })
  gs.fx.emit(f.z, p.x, p.y, 0.6, 60, { color: '#c9a8ff', color2: XC, speed: 1.6, life: 0.55, size: 0.3, up: 0.3, area: 2.4, ring: true, radial: -1, pull: 10, hArea: 1.2 })
  gs.fx.debris(f.z, p.x, p.y, 0.2, 6, 'flesh', { speed: 0.6, size: 0.06, up: 2.2, colors: ['#3a1a5a', '#7a3cff'] })
  gs.fx.after(0.45, () => {
    const q = entPos(gs, f.e) ?? p
    gs.fx.flash(f.z, q.x, q.y, 1, '#b28cff', 1.2, 0.4)
    gs.fx.ring(f.z, q.x, q.y, 0.2, 2.6, XC, 0.5, { tex: 'ring', k: 2.4 })
    gs.fx.debris(f.z, q.x, q.y, 1, 8, 'flesh', { speed: 3, size: 0.08, colors: ['#3a1a5a', '#7a3cff'] })
  })
})

regFx('web', (gs, _w, f) => {
  sfx('silk', f.x, f.y)
  gs.fx.decal(f.z, f.x, f.y, 2.2, 'web', '#e8f6ff', 8, { add: true, k: 1.1, opacity: 0.7, fadeIn: 0.05 })
  gs.fx.emit(f.z, f.x, f.y, 0.3, 14, { color: '#ffffff', speed: 1.4, life: 0.6, size: 0.1, up: 0.6, grav: 3 })
})

regFx('webwire', (gs, _w, f) => {
  // 絲線從前一個錨點射向新錨點；之後的常駐連線由 buffFx 依 x2.link 畫
  sfx('silk', f.x, f.y)
  const a = W(f.x, f.y, 0.62)
  const b = W(f.x2 ?? f.x, f.y2 ?? f.y, 0.62)
  const m = gs.fx.mesh(GEO.beam, '#eaf6ff', 2.2, { opacity: 0.9 })
  m.position.copy(a)
  m.lookAt(b)
  const len = a.distanceTo(b)
  const mm = m.material as THREE.MeshBasicMaterial
  gs.fx.addTransient(m, 0.5, f.z, (k) => {
    m.scale.set(0.012, 0.012, Math.max(0.01, len * Math.min(1, k * 3)))
    mm.opacity = 0.9 * (k < 0.5 ? 1 : 1 - (k - 0.5) * 2)
  })
  gs.fx.after(0.16, () => gs.fx.emit(f.z, f.x2 ?? f.x, f.y2 ?? f.y, 0.6, 8, { color: '#ffffff', speed: 1.2, life: 0.4, size: 0.1, up: 0.3 }))
})

regFx('tripped', (gs, _w, f) => {
  const p = at(gs, f)
  sfx('snap', p.x, p.y)
  gs.fx.emit(f.z, p.x, p.y, 0.3, 16, { color: '#ffffff', speed: 2, life: 0.4, size: 0.1, up: 0.5, grav: 4 })
  gs.fx.emit(f.z, p.x, p.y, 0.1, 5, { color: '#8a8078', speed: 1, life: 0.8, size: 0.45, up: 0.4, layer: 'smoke', alpha: 0.4 })
  gs.fx.decal(f.z, p.x, p.y, 1, 'web', '#e8f6ff', 2, { add: true, k: 0.8, opacity: 0.6 })
})

regFx('fountain', (gs, _w, f) => {
  // 蛛絲噴泉：中心噴出白絲，2 秒內 4 波黏團落在半徑 r 內
  const r = f.v ?? 3
  sfx('silk', f.x, f.y)
  gs.fx.ring(f.z, f.x, f.y, r, r, '#e8f6ff', 2.6, { tex: 'ring', k: 1.4, env: 'hold', opacity: 0.6 })
  gs.fx.decal(f.z, f.x, f.y, r * 1.1, 'web', '#e8f6ff', 5, { add: true, k: 0.7, opacity: 0.45 })
  every(gs, f.z, 2.4, 0.05, () => {
    gs.fx.emit(f.z, f.x, f.y, 0.4, 3, { color: '#ffffff', color2: '#c8e8ff', speed: 3, life: 1, size: 0.14, up: 2.2, grav: 9, drag: 0.4, spread: 1 })
  })
  gs.fx.light(f.z, f.x, f.y, 1, '#e8f6ff', 10, r * 1.5, 2.5, { attack: 0.2 })
})

regFx('webGlob', (gs, _w, f) => {
  const r = f.v ?? 1.2
  const glob = gs.fx.mesh(GEO.sphereLo, '#f0faff', 1.6, { opacity: 0.9 })
  glob.scale.setScalar(0.16)
  gs.fx.addTransient(glob, 0.22, f.z, (k) => glob.position.copy(W(f.x, f.y, 3.5 * (1 - k * k) + 0.1)))
  gs.fx.after(0.22, () => {
    sfx('splat', f.x, f.y)
    gs.fx.decal(f.z, f.x, f.y, r * 2, 'web', '#f0faff', 2.6, { add: true, k: 1, opacity: 0.7, grow: 1.15 })
    gs.fx.decal(f.z, f.x, f.y, r * 1.1, 'splat', '#c8d8e0', 2.6, { opacity: 0.5 })
    gs.fx.emit(f.z, f.x, f.y, 0.2, 14, { color: '#ffffff', speed: 2, life: 0.5, size: 0.12, up: 0.7, grav: 6 })
  })
})

regFx('relocate', (gs, _w, f) => {
  // 虛空裂隙：一道直立的黑縫張開又闔上，四周的光被吸進去
  sfx('warp', f.x, f.y)
  const g = new THREE.Group()
  const slit = gs.fx.mesh(GEO.plane, '#05010a', 1, { add: false, side: THREE.DoubleSide, map: fxTex('soft'), opacity: 0.95 })
  const glow = gs.fx.mesh(GEO.plane, '#8a4cff', 2.2, { side: THREE.DoubleSide, map: fxTex('soft'), opacity: 0.8 })
  glow.scale.set(2.2, 1.3, 1)
  glow.position.z = -0.02
  const rim = gs.fx.mesh(GEO.plane, '#d8c0ff', 3.5, { side: THREE.DoubleSide, map: fxTex('ring') })
  rim.scale.set(1.15, 1.05, 1)
  rim.position.z = 0.01
  const crack = gs.fx.mesh(GEO.plane, '#ffffff', 4, { side: THREE.DoubleSide, map: fxTex('streak') })
  crack.rotation.z = Math.PI / 2
  crack.scale.set(1.2, 0.08, 1)
  crack.position.z = 0.02
  g.add(glow, slit, rim, crack)
  g.position.copy(W(f.x, f.y, 1.1))
  const look = new THREE.Vector3()
  const rm = rim.material as THREE.MeshBasicMaterial
  const cm = crack.material as THREE.MeshBasicMaterial
  gs.fx.addTransient(g, 0.7, f.z, (k) => {
    look.copy(gs.camera.position)
    look.y = g.position.y
    g.lookAt(look)
    const open = Math.sin(Math.min(1, k * 1.15) * Math.PI)
    g.scale.set(0.12 + open * 0.8, 2.4 * (0.4 + open * 0.6), 1)
    rm.opacity = open
    cm.opacity = 1 - open * 0.7
  })
  gs.fx.emit(f.z, f.x, f.y, 1.1, 36, { color: '#b28cff', color2: XC, speed: 0.8, life: 0.6, size: 0.16, up: 0, area: 1.6, ring: true, radial: -1, pull: 9, hArea: 1.6, drag: 0.2 })
  gs.fx.light(f.z, f.x, f.y, 1.2, '#8a4cff', 20, 5, 0.7, { attack: 0.3 })
  gs.fx.decal(f.z, f.x, f.y, 1.4, 'soft', '#05010a', 1.2, { opacity: 0.8 })
})

function swirlAt(gs: GameScene, f: FxEvent, c1: string, c2: string, snd: string): void {
  const p = at(gs, f)
  sfx(snd, p.x, p.y)
  gs.fx.ring(f.z, p.x, p.y, 1.4, 0.2, c1, 0.4, { tex: 'swirl', k: 2, spin: 8, ease: 'in' })
  gs.fx.flash(f.z, p.x, p.y, 1, c1, 0.5, 0.2)
  gs.fx.emit(f.z, p.x, p.y, 1, 20, { color: c1, color2: c2, speed: 1, life: 0.5, size: 0.18, up: 0.3, area: 1.2, ring: true, radial: -1, swirl: 6, pull: 5, hArea: 1.4 })
}

regFx('swap', (gs, _w, f) => swirlAt(gs, f, '#b28cff', XC, 'blink'))

regFx('rewind', (gs, _w, f) => {
  const p = at(gs, f)
  sfx('rewind', p.x, p.y)
  gs.fx.ring(f.z, p.x, p.y, 2, 0.4, '#ffd27a', 0.7, { tex: 'clock', k: 2.4, spin: -9, ease: 'in' })
  gs.fx.ring(f.z, p.x, p.y, 0.4, 1.6, '#7fd8ff', 0.5, { tex: 'ring', k: 2 })
  gs.fx.emit(f.z, p.x, p.y, 1, 30, { color: '#ffe8b0', color2: '#7fd8ff', speed: 1, life: 0.6, size: 0.16, up: 0.2, area: 1.8, ring: true, radial: -1, swirl: -5, hArea: 1.6, drag: 0.2 })
  pillar(gs, f.z, p.x, p.y, 0.5, 2.4, '#ffd27a', 0.5, { shrink: true, k: 1.6 })
  const r = viewRoot(gs, f.e)
  if (r) ghost(gs, r, '#ffd27a', 0.5, { opacity: 0.5, grow: 1.15 })
})

regFx('masks', (gs, _w, f) => {
  // 化身／卸面：紫黑色的煙把身體包起來，碎面具片收攏（化身）或炸開（卸面）
  const p = at(gs, f)
  const end = f.s === 'end'
  sfx('morph', p.x, p.y)
  gs.fx.flash(f.z, p.x, p.y, p.h * 0.6, '#b28cff', 0.7, 0.35)
  gs.fx.ring(f.z, p.x, p.y, end ? 0.3 : 1.8, end ? 1.8 : 0.3, '#b28cff', 0.5, { tex: 'ring', k: 2.4, ease: end ? 'out' : 'in' })
  pillar(gs, f.z, p.x, p.y, 0.55, p.h * 1.2, '#7a3cff', 0.6, { k: 1.6, shrink: !end })
  gs.fx.emit(f.z, p.x, p.y, 0.8, 26, { color: '#2a1440', speed: 0.8, life: 1.2, size: 0.7, up: 0.8, area: 0.5, swirl: 4, hArea: 1.4, layer: 'smoke', alpha: 0.85 })
  gs.fx.emit(f.z, p.x, p.y, 1, 30, { color: '#d8c0ff', color2: XC, speed: 1.4, life: 0.7, size: 0.18, up: 0.4, area: end ? 0 : 1.4, ring: !end, radial: end ? 1 : -1, hArea: 1.4 })
  gs.fx.debris(f.z, p.x, p.y, 1.2, 10, 'glass', { speed: end ? 3 : 1.4, size: 0.08, life: 1, colors: ['#e8dcff', '#b28cff'] })
  const r = viewRoot(gs, f.e)
  if (r) ghost(gs, r, '#b28cff', 0.5, { opacity: 0.55, grow: end ? 1.3 : 0.85 })
})

// ───────── 變種人 ─────────

regFx('crush', (gs, _w, f) => {
  sfx('crunch', f.x, f.y)
  gs.fx.debris(f.z, f.x, f.y, 0.3, 8, 'rock', { speed: 2.2, size: 0.1, up: 0.8 })
  gs.fx.emit(f.z, f.x, f.y, 0.2, 10, { color: '#7a6e60', speed: 1.4, life: 1.3, size: 0.6, up: 0.4, layer: 'smoke', alpha: 0.55 })
})

regFx('smash', (gs, _w, f) => {
  const r = f.v ?? 1.2
  sfx('smash', f.x, f.y)
  gs.fx.flash(f.z, f.x, f.y, 0.3, '#ffb46b', 0.6, 0.18)
  gs.fx.ring(f.z, f.x, f.y, 0.2, r * 2.4, '#e8b04a', 0.5, { tex: 'ring', k: 2.2 })
  gs.fx.decal(f.z, f.x, f.y, r * 3, 'crack', '#120e0a', 16, { opacity: 0.9 })
  gs.fx.decal(f.z, f.x, f.y, r * 1.6, 'scorch', '#ffffff', 12, { opacity: 0.5 })
  gs.fx.debris(f.z, f.x, f.y, 0.2, 14, 'rock', { speed: 3.4, size: 0.12, up: 1.3 })
  gs.fx.emit(f.z, f.x, f.y, 0.2, 26, { color: '#8a7a64', speed: r * 2.6, life: 1.2, size: 0.7, up: 0.25, drag: 2.5, layer: 'smoke', alpha: 0.6, area: 0.4, radial: 1 })
  gs.fx.emit(f.z, f.x, f.y, 0.3, 16, { color: '#ffffff', color2: MA, speed: 5, life: 0.4, size: 1, up: 0.8, grav: 10, layer: 'spark' })
  shake(gs, 0.6, f.x, f.y)
})

regFx('bite', (gs, _w, f) => {
  // 媒介蟲咬：紅色噴濺＋黃綠膿液，咬痕處一閃
  const p = at(gs, f)
  sfx('bite', p.x, p.y)
  const h = Math.min(1.2, p.h * 0.5)
  gs.fx.flash(f.z, p.x, p.y, h, '#ff4a3a', 0.35, 0.2)
  gs.fx.emit(f.z, p.x, p.y, h, 20, { color: '#ff5a4a', color2: '#4a0a0a', speed: 2.6, life: 0.5, size: 0.2, up: 0.5, grav: 9 })
  gs.fx.emit(f.z, p.x, p.y, h, 10, { color: '#ffffff', color2: '#ff3b3b', speed: 3, life: 0.3, size: 1, up: 0.4, grav: 8, layer: 'spark' })
  gs.fx.emit(f.z, p.x, p.y, h, 8, { color: '#c8e84a', color2: '#5a6a10', speed: 1.2, life: 0.9, size: 0.2, up: 0.2, grav: 3 })
  gs.fx.decal(f.z, p.x, p.y, 0.9, 'splat', '#7a1010', 6, { opacity: 0.8 })
})

regFx('burst', (gs, _w, f) => {
  // 蛻散：肉身炸開成一群蠕蟲
  const p = at(gs, f)
  sfx('squelch', p.x, p.y)
  sfx('boom', p.x, p.y)
  gs.fx.flash(f.z, p.x, p.y, 0.8, MA, 0.8, 0.25)
  gs.fx.debris(f.z, p.x, p.y, 0.9, 22, 'flesh', { speed: 5, size: 0.11, up: 1.1, colors: ['#6a1a24', '#4a2030', '#7a3a2a', '#c8b060'] })
  gs.fx.emit(f.z, p.x, p.y, 0.8, 36, { color: '#ff4a3a', color2: '#3a0505', speed: 4, life: 0.7, size: 0.22, up: 0.8, grav: 9 })
  gs.fx.emit(f.z, p.x, p.y, 0.8, 16, { color: '#d8e84a', color2: '#4a5a10', speed: 3, life: 0.8, size: 0.2, up: 0.9, grav: 8 })
  gs.fx.emit(f.z, p.x, p.y, 0.6, 12, { color: '#3a1010', speed: 1.4, life: 1.6, size: 0.9, up: 0.4, layer: 'smoke', alpha: 0.7 })
  gs.fx.decal(f.z, p.x, p.y, 2.6, 'splat', '#4a0a0a', 20, { opacity: 0.9 })
  gs.fx.ring(f.z, p.x, p.y, 0.3, 2.2, MR, 0.5, { tex: 'ring', k: 2 })
  shake(gs, 0.35, p.x, p.y)
})

regFx('taint', (gs, _w, f) => {
  // 污染販賣機（只有變種人看得到）：機身冒出黃綠膿霧、流下黏液
  const p = at(gs, f)
  sfx('squelch', p.x, p.y)
  gs.fx.glow(f.z, p.x, p.y, 1.2, '#a8e840', 2.2, 0.8, { k: 1.6, grow: 1.3 })
  gs.fx.ring(f.z, p.x, p.y, 0.3, 1.8, '#a8e840', 0.6, { tex: 'ring', k: 2 })
  gs.fx.emit(f.z, p.x, p.y, 1.6, 26, { color: '#c8ff5a', color2: '#4a2a4a', speed: 0.8, life: 1.4, size: 0.22, up: 0.1, grav: 3, area: 0.5 })
  gs.fx.emit(f.z, p.x, p.y, 1.2, 12, { color: '#6a7a3a', speed: 0.5, life: 2, size: 0.8, up: 0.6, layer: 'smoke', alpha: 0.6, area: 0.4 })
  gs.fx.decal(f.z, p.x, p.y, 1.8, 'splat', '#5a7a14', 20, { add: true, k: 0.5, opacity: 0.7 })
})

// ───────── 防護服 ─────────

regFx('voidBurst', (gs, _w, f) => {
  const r = f.v ?? 2.5
  sfx('void', f.x, f.y)
  sfx('implode', f.x, f.y)
  const sm = shieldMat('#9b5de5', 2.2, 0)
  const s = new THREE.Mesh(GEO.sphere, sm)
  s.raycast = () => {}
  s.position.copy(W(f.x, f.y, 0.6))
  gs.fx.addTransient(s, 0.5, f.z, (k, t) => {
    s.scale.setScalar(0.2 + r * (1 - (1 - k) ** 2))
    sm.uniforms.uTime.value = t
    sm.uniforms.uOpacity.value = (1 - k) ** 1.5
  })
  gs.fx.ring(f.z, f.x, f.y, 0.4, r, '#2a0a4a', 0.9, { tex: 'swirl', k: 1, add: false, spin: 6, opacity: 0.8 })
  gs.fx.ring(f.z, f.x, f.y, 0.2, r * 1.1, '#9b5de5', 0.5, { tex: 'ring', k: 2.4 })
  gs.fx.emit(f.z, f.x, f.y, 0.6, 30, { color: '#c9a8ff', color2: '#2a0a4a', speed: r * 1.5, life: 0.7, size: 0.22, up: 0.4, drag: 2, swirl: 5 })
  gs.fx.emit(f.z, f.x, f.y, 0.5, 10, { color: '#14081e', speed: r * 0.6, life: 1.4, size: 0.8, up: 0.3, layer: 'smoke', alpha: 0.7 })
})

regFx('phaseShift', (gs, _w, f) => {
  const p = at(gs, f)
  sfx('phase', p.x, p.y)
  gs.fx.ring(f.z, p.x, p.y, 0.3, 1.3, '#9b5de5', 0.4, { tex: 'ring', k: 2.2, follow: follow3(gs, f.e, 0) })
  gs.fx.emit(f.z, p.x, p.y, 1, 16, { color: '#c9a8ff', color2: '#2a0a4a', speed: 0.8, life: 0.5, size: 0.16, up: 0.2, area: 0.8, ring: true, radial: -1, hArea: 1.4 })
  const r = viewRoot(gs, f.e)
  if (r) ghost(gs, r, '#9b5de5', 0.4, { opacity: 0.55, grow: 1.12 })
})

regFx('mirage', (gs, _w, f) => {
  const p = at(gs, f)
  sfx('mirror', p.x, p.y)
  pillar(gs, f.z, p.x, p.y, 0.45, 2.2, '#c9b6ff', 0.5, { k: 1.8 })
  gs.fx.emit(f.z, p.x, p.y, 1, 20, { color: '#e8dcff', color2: '#7a3cff', speed: 0.6, life: 0.7, size: 0.14, up: 0.6, hArea: 1.6, area: 0.4 })
  gs.fx.after(0.05, () => {
    const r = viewRoot(gs, f.e)
    if (r) ghost(gs, r, '#c9b6ff', 0.5, { opacity: 0.6, grow: 1.1 })
  })
})

regFx('radBurst', (gs, _w, f) => {
  const r = f.v ?? 4
  sfx('geiger', f.x, f.y)
  sfx('boom', f.x, f.y)
  gs.fx.flash(f.z, f.x, f.y, 0.9, '#7dff6a', 1.2, 0.35)
  gs.fx.ring(f.z, f.x, f.y, 0.3, r, '#7dff6a', 0.7, { tex: 'ring', k: 2.6 })
  gs.fx.ring(f.z, f.x, f.y, r * 0.6, r * 0.6, '#7dff6a', 2.2, { tex: 'trefoil', k: 1.2, opacity: 0.55, fadeIn: 0.1, spin: 0.4 })
  gs.fx.emit(f.z, f.x, f.y, 0.8, 50, { color: '#d8ff9a', color2: '#2a8a1a', speed: r * 1.4, life: 0.9, size: 0.3, up: 0.6, drag: 2 })
  gs.fx.emit(f.z, f.x, f.y, 0.3, 20, { color: '#7dff6a', speed: 0.4, life: 2, size: 0.16, up: 2, area: r * 0.8, drag: 0.5 })
  gs.fx.emit(f.z, f.x, f.y, 0.5, 14, { color: '#4a5a2a', speed: r * 0.5, life: 2, size: 1, up: 0.4, layer: 'smoke', alpha: 0.5 })
  gs.fx.light(f.z, f.x, f.y, 1.2, '#7dff6a', 80, r * 2.5, 1.2)
  shake(gs, 0.4, f.x, f.y)
})

regFx('braced', (gs, _w, f) => {
  const p = at(gs, f)
  sfx('clank', p.x, p.y)
  gs.fx.emit(f.z, p.x, p.y, 0.1, 12, { color: '#8a8078', speed: 1.6, life: 0.8, size: 0.45, up: 0.25, layer: 'smoke', alpha: 0.45, area: 0.3, radial: 1 })
  gs.fx.emit(f.z, p.x, p.y, 0.15, 12, { color: '#ffffff', color2: '#ffc23d', speed: 2.8, life: 0.3, size: 1, up: 0.4, grav: 9, layer: 'spark' })
  gs.fx.ring(f.z, p.x, p.y, 0.2, 1, '#ffc23d', 0.35, { tex: 'ring', k: 2 })
})

regFx('polarity', (gs, _w, f) => {
  const p = at(gs, f)
  const pull = !!gs.world.ents.get(f.e ?? -1)?.s.b?.includes('bf.force.pull')
  sfx('polarity', p.x, p.y)
  gs.fx.ring(f.z, p.x, p.y, pull ? 1.8 : 0.4, pull ? 0.5 : 1.8, '#e8f6ff', 0.6, { tex: 'arrows', k: 2, spin: pull ? -5 : 5, follow: follow3(gs, f.e, 0) })
  gs.fx.emit(f.z, p.x, p.y, 0.8, 16, { color: '#e8f6ff', color2: '#7fd8ff', speed: 1.5, life: 0.4, size: 0.16, up: 0.2, area: pull ? 1.6 : 0.3, ring: pull, radial: pull ? -1 : 1 })
})

regFx('slivBurst', (gs, _w, f) => {
  const p = at(gs, f)
  const n = Math.max(1, f.v ?? 1)
  sfx('shatterMetal', p.x, p.y)
  const h = Math.min(1.2, p.h * 0.55)
  gs.fx.flash(f.z, p.x, p.y, h, '#33ffd1', 0.3 + n * 0.05, 0.18)
  gs.fx.debris(f.z, p.x, p.y, h, 3 + n * 2, 'metal', { speed: 4, size: 0.06, colors: ['#9ab0b8', '#c8e8f0', '#5a7a80'] })
  gs.fx.emit(f.z, p.x, p.y, h, 6 + n * 3, { color: '#ffffff', color2: '#33ffd1', speed: 4, life: 0.35, size: 1, up: 0.5, grav: 6, layer: 'spark' })
})

regFx('weld', (gs, _w, f) => {
  const p = at(gs, f)
  sfx('weld', p.x, p.y)
  const h = Math.min(1, p.h * 0.5)
  every(gs, f.z, 0.5, 0.04, () => {
    const q = entPos(gs, f.e) ?? p
    gs.fx.emit(f.z, q.x, q.y, h, 4, { color: '#ffffff', color2: '#ff8a2a', speed: 3, life: 0.5, size: 1, up: 0.6, grav: 12, layer: 'spark' })
  })
  gs.fx.glow(f.z, p.x, p.y, h, '#bfe8ff', 0.9, 0.5, { tex: 'star', k: 3.4, follow: follow3(gs, f.e, 0.5), over: true, spin: 6 })
  gs.fx.light(f.z, p.x, p.y, h + 0.2, '#bfe8ff', 16, 3.5, 0.5, { flicker: 0.6 })
  gs.fx.emit(f.z, p.x, p.y, h, 3, { color: '#8a8a8a', speed: 0.3, life: 1.2, size: 0.35, up: 1, layer: 'smoke', alpha: 0.3 })
})

// ───────── 道具與裝置 ─────────

regFx('cloak', (gs, _w, f) => {
  const p = at(gs, f)
  sfx('cloak', p.x, p.y)
  gs.fx.ring(f.z, p.x, p.y, 1.4, 0.3, '#bfefff', 0.45, { tex: 'ring', k: 2.2, ease: 'in' })
  gs.fx.emit(f.z, p.x, p.y, 1, 24, { color: '#ffffff', color2: '#7fd8ff', speed: 0.8, life: 0.5, size: 0.12, up: 0.1, area: 1.1, radial: -1, hArea: 1.6 })
  const r = viewRoot(gs, f.e)
  if (r) ghost(gs, r, '#bfefff', 0.5, { opacity: 0.55, grow: 1.08 })
})

regFx('deploy', (gs, _w, f) => {
  const big = f.s === 'struct.console'
  const r = big ? 1.1 : 0.55
  sfx('deploy', f.x, f.y)
  const ring = gs.fx.mesh(GEO.ringThin, '#9fe7ff', 3)
  ring.position.copy(W(f.x, f.y, 0))
  ring.scale.setScalar(r)
  const grid = gs.fx.mesh(GEO.flat, '#9fe7ff', 1.2, { map: fxTex('grid'), opacity: 0.6 })
  grid.position.copy(W(f.x, f.y, 0.04))
  grid.scale.setScalar(r)
  const g = new THREE.Group()
  g.add(ring, grid)
  const rm = ring.material as THREE.MeshBasicMaterial
  const gm = grid.material as THREE.MeshBasicMaterial
  gs.fx.addTransient(g, 0.8, f.z, (k) => {
    ring.position.y = Math.sin(k * Math.PI) * (big ? 1.6 : 0.9)
    rm.opacity = 1 - k * 0.6
    gm.opacity = 0.6 * (1 - k)
  })
  pillar(gs, f.z, f.x, f.y, r * 0.8, big ? 2 : 1.2, '#9fe7ff', 0.6, { k: 1.4 })
  gs.fx.emit(f.z, f.x, f.y, 0.2, 14, { color: '#ffffff', color2: '#9fe7ff', speed: 2, life: 0.35, size: 1, up: 0.8, grav: 6, layer: 'spark' })
})

function doorAt(gs: GameScene, z: number, x: number, y: number): { horizontal: boolean; width: number } {
  const L = gs.zones.get(z)?.layout
  let best: { horizontal: boolean; width: number } = { horizontal: true, width: 2 }
  let bd = 4
  for (const d of L?.doors ?? []) {
    const dd = (d.x - x) ** 2 + (d.y - y) ** 2
    if (dd < bd) {
      bd = dd
      best = d
    }
  }
  return best
}

regFx('doorLock', (gs, _w, f) => {
  const locked = (f.v ?? 1) > 0
  const col = locked ? '#ff3b3b' : '#5cf2a5'
  sfx(locked ? 'lock' : 'unlock', f.x, f.y)
  const s = gs.fx.glow(f.z, f.x, f.y, 2.3, col, 0.7, 1.4, { tex: locked ? 'lock' : 'unlock', k: 2.2, fadeIn: 0.1, over: true })
  const y0 = s.position.y
  gs.fx.addTransient(new THREE.Object3D(), 1.4, f.z, (k) => (s.position.y = y0 + k * 0.3))
  gs.fx.ring(f.z, f.x, f.y, 0.3, 1.4, col, 0.6, { tex: 'ring', k: 2 })
  gs.fx.light(f.z, f.x, f.y, 1.6, col, 18, 4, 0.8)
})

regFx('doorSlam', (gs, _w, f) => {
  const d = doorAt(gs, f.z, f.x, f.y)
  sfx('slam', f.x, f.y)
  // 門板沿 x（horizontal）時通道南北向：灰塵往南北噴、火花沿門縫
  const across: [number, number] = d.horizontal ? [0, 1] : [1, 0]
  const along: [number, number] = d.horizontal ? [1, 0] : [0, 1]
  for (const s of [-1, 1]) {
    gs.fx.emit(f.z, f.x, f.y, 0.3, 10, { color: '#7a746c', speed: 2.4, life: 1, size: 0.6, up: 0.3, dir: [across[0] * s, across[1] * s], spread: 0.7, layer: 'smoke', alpha: 0.5 })
    gs.fx.emit(f.z, f.x + along[0] * s * d.width * 0.45, f.y + along[1] * s * d.width * 0.45, 1, 8, { color: '#ffffff', color2: '#ffb46b', speed: 3.5, life: 0.4, size: 1, up: 0.5, grav: 10, layer: 'spark', hArea: 1.6 })
  }
  gs.fx.debris(f.z, f.x, f.y, 1.4, 4, 'metal', { speed: 2, size: 0.05 })
  gs.fx.light(f.z, f.x, f.y, 1.4, '#ffb46b', 14, 4, 0.25)
  shake(gs, 0.35, f.x, f.y)
})

regFx('enhance', (gs, _w, f) => {
  // 強化劑注射：金色雙螺旋繞身而上
  const p = at(gs, f)
  sfx('enhance', p.x, p.y)
  gs.fx.flash(f.z, p.x, p.y, 1, '#ffd27a', 0.6, 0.3)
  gs.fx.ring(f.z, p.x, p.y, 0.3, 1.5, '#ffd27a', 0.7, { tex: 'ring', k: 2.2 })
  every(gs, f.z, 1.1, 0.03, (k) => {
    const q = entPos(gs, f.e) ?? p
    for (const s of [0, Math.PI]) {
      const a = k * Math.PI * 6 + s
      gs.fx.emit(f.z, q.x + Math.cos(a) * 0.45, q.y + Math.sin(a) * 0.45, k * q.h * 1.1, 1, { color: s ? '#ffd27a' : '#fff4d0', speed: 0.05, life: 0.7, size: 0.2, up: 0.5 })
    }
  })
  pillar(gs, f.z, p.x, p.y, 0.5, 2.4, '#ffd27a', 1.1, { k: 1.2 })
})

regFx('fusionArm', (gs, _w, f) => {
  // 熱融炸彈倒數：5.5 m 危險圈＋越來越急的嗶聲（模型本身的燈也會加速閃）
  const dur = f.v ?? 3
  telegraph(gs, f.z, f.x, f.y, 5.5, '#ff3b1a', dur, { hz: 1.5 })
  sfx('arm', f.x, f.y)
  let t = 0
  let gap = 0.5
  while (t < dur - 0.05) {
    const when = t
    gs.fx.after(when, () => {
      sfx('beep', f.x, f.y)
      gs.fx.light(f.z, f.x, f.y, 0.6, '#ff3b1a', 20, 4, 0.12)
    })
    t += gap
    gap = Math.max(0.08, gap * 0.78)
  }
})

regFx('grav', (gs, _w, f) => {
  // 重力牽引／推開：一串扭曲環沿著連線移動
  const push = (f.v ?? 1) > 0
  const a = entPos(gs, f.e) ?? { x: f.x, y: f.y, h: 1.6 }
  const b = entPos(gs, f.e2) ?? { x: f.x2 ?? f.x, y: f.y2 ?? f.y, h: 1.6 }
  sfx('grav', a.x, a.y)
  const A = W(a.x, a.y, 1)
  const B = W(b.x, b.y, 1)
  for (let i = 0; i < 5; i++) {
    const m = gs.fx.mesh(GEO.torus, '#9fa8ff', 2.4, { opacity: 0.8 })
    const mm = m.material as THREE.MeshBasicMaterial
    const dir = B.clone().sub(A).normalize()
    m.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), dir)
    gs.fx.after(i * 0.07, () =>
      gs.fx.addTransient(m, 0.45, f.z, (k) => {
        const kk = push ? k : 1 - k
        m.position.copy(A).lerp(B, kk)
        m.scale.setScalar(0.3 + (push ? k : 1 - k) * 0.4)
        mm.opacity = 0.8 * Math.sin(k * Math.PI)
      }),
    )
  }
  beam(gs, f.z, A, B, '#7a86ff', 0.03, 0.4, { k: 2 })
})

regFx('holo', (gs, _w, f) => {
  const p = at(gs, f)
  sfx('holo', p.x, p.y)
  const ring = gs.fx.mesh(GEO.ringThin, '#9fe7ff', 3)
  ring.scale.setScalar(0.6)
  gs.fx.addTransient(ring, 0.8, f.z, (k) => {
    const q = entPos(gs, f.e) ?? p
    const kk = (k * 2) % 1
    ring.position.copy(W(q.x, q.y, q.h * (k < 0.5 ? 1 - kk : kk)))
    ;(ring.material as THREE.MeshBasicMaterial).opacity = 1 - k * 0.5
  })
  gs.fx.emit(f.z, p.x, p.y, 1, 20, { color: '#d8f6ff', color2: '#9fe7ff', speed: 0.4, life: 0.7, size: 0.1, up: 0.6, area: 0.5, hArea: 1.8 })
  const r = viewRoot(gs, f.e)
  if (r) gs.fx.after(0.05, () => ghost(gs, r, '#9fe7ff', 0.6, { opacity: 0.45, grow: 1.05 }))
})

regFx('portalCharge', (gs, _w, f) => {
  // 實驗傳送裝置：3 秒充能（半徑 4 的圈、旋渦收束、音調上升），最後一閃
  const dur = f.v ?? 3
  const R = 4
  sfx('charge', f.x, f.y)
  telegraph(gs, f.z, f.x, f.y, R, '#7fd8ff', dur, { hz: 1 })
  gs.fx.ring(f.z, f.x, f.y, R * 0.9, R * 0.9, '#9fe7ff', dur, { tex: 'swirl', k: 1.4, spin: 2.5, env: 'hold', fadeIn: 0.3, opacity: 0.6 })
  every(gs, f.z, dur, 0.05, (k) => {
    gs.fx.emit(f.z, f.x, f.y, 0.3, 3, { color: '#d8f6ff', color2: '#7fd8ff', speed: 0.6 + k * 1.5, life: 0.7, size: 0.14, up: 0.1, area: R, ring: true, radial: -1, swirl: 5 + k * 6, pull: 3 + k * 6, drag: 0.2 })
  })
  pillar(gs, f.z, f.x, f.y, 0.6, 3, '#7fd8ff', dur, { k: 1.2, spin: 0.1 })
  gs.fx.after(dur, () => {
    sfx('warp', f.x, f.y)
    gs.fx.flash(f.z, f.x, f.y, 1, '#d8f6ff', 1.6, 0.4)
    gs.fx.ring(f.z, f.x, f.y, 0.4, R * 1.2, '#9fe7ff', 0.6, { tex: 'ring', k: 3 })
    gs.fx.emit(f.z, f.x, f.y, 1, 50, { color: '#ffffff', color2: '#7fd8ff', speed: 5, life: 0.5, size: 0.2, up: 0.5 })
  })
})

regFx('revive', (gs, _w, f) => {
  const p = at(gs, f)
  sfx('revive', p.x, p.y)
  pillar(gs, f.z, p.x, p.y, 0.6, 3, '#d8ffe8', 1, { k: 1.8 })
  gs.fx.ring(f.z, p.x, p.y, 0.2, 1.8, '#5cf2a5', 0.7, { tex: 'ring', k: 2.4 })
  for (let i = 0; i < 4; i++) {
    const a = Math.random() * Math.PI * 2
    bolt(gs, f.z, W(p.x, p.y, 1), W(p.x + Math.cos(a) * 0.6, p.y + Math.sin(a) * 0.6, 0.3 + Math.random()), '#bfe8ff', 0.02, 0.15, { branches: 0 })
  }
  const c = gs.fx.glow(f.z, p.x, p.y, Math.max(1.6, p.h + 0.3), '#5cf2a5', 0.6, 1.2, { tex: 'cross', k: 2.6, fadeIn: 0.15, over: true })
  const y0 = c.position.y
  gs.fx.addTransient(new THREE.Object3D(), 1.2, f.z, (k) => (c.position.y = y0 + k * 1))
  gs.fx.emit(f.z, p.x, p.y, 0.3, 20, { color: '#d8ffe8', color2: '#5cf2a5', speed: 0.5, life: 1.2, size: 0.2, up: 2.4, area: 0.5 })
})

regFx('rummage', (gs, _w, f) => {
  const p = at(gs, f)
  sfx('rummage', p.x, p.y)
  gs.fx.debris(f.z, p.x, p.y, 0.6, 10, 'rock', { speed: 2.2, size: 0.07, up: 1, colors: ['#b09060', '#e8e0d0', '#8a7a5a'] })
  gs.fx.debris(f.z, p.x, p.y, 0.6, 4, 'metal', { speed: 2, size: 0.05 })
  gs.fx.emit(f.z, p.x, p.y, 0.4, 10, { color: '#8a8070', speed: 1, life: 1.4, size: 0.6, up: 0.5, layer: 'smoke', alpha: 0.45 })
})

regFx('scan', (gs, _w, f) => {
  sfx('scan', f.x, f.y)
  const ring = gs.fx.mesh(GEO.ringThin, '#33ffd1', 3)
  ring.scale.setScalar(0.65)
  const disc = gs.fx.mesh(GEO.flat, '#33ffd1', 0.8, { map: fxTex('grid'), opacity: 0.4 })
  disc.scale.setScalar(0.65)
  const g = new THREE.Group()
  g.add(ring, disc)
  g.position.copy(W(f.x, f.y, 0))
  gs.fx.addTransient(g, 1.2, f.z, (k) => {
    const kk = (k * 2) % 1
    const h = 2 * (Math.floor(k * 2) % 2 ? 1 - kk : kk)
    ring.position.y = h
    disc.position.y = h
    ;(ring.material as THREE.MeshBasicMaterial).opacity = 1 - k * 0.4
  })
})

regFx('shake', (gs, _w, f) => {
  shake(gs, (f.v ?? 1) * 0.85)
  sfx('rumble', f.x, f.y)
})

regFx('skyDrop', (gs, _w, f) => {
  // 從天而降：一道白藍流光落地，雪白塵環
  const p = { x: f.x, y: f.y }
  sfx('whoosh', p.x, p.y)
  const streak = gs.fx.mesh(GEO.beam, '#d8f0ff', 3, { opacity: 0.9 })
  streak.rotation.x = Math.PI / 2
  gs.fx.addTransient(streak, 0.35, f.z, (k) => {
    const top = 14 * (1 - k)
    streak.position.copy(W(p.x, p.y, top + 3))
    streak.scale.set(0.12, 0.12, 3)
  })
  gs.fx.after(0.35, () => {
    sfx('thud', p.x, p.y)
    gs.fx.flash(f.z, p.x, p.y, 0.4, '#d8f0ff', 0.8, 0.25)
    gs.fx.ring(f.z, p.x, p.y, 0.3, 3, '#e8f6ff', 0.6, { tex: 'ring', k: 2 })
    gs.fx.emit(f.z, p.x, p.y, 0.2, 30, { color: '#e8f0f8', speed: 3, life: 1.4, size: 0.7, up: 0.3, drag: 2.5, layer: 'smoke', alpha: 0.6, radial: 1, area: 0.3 })
    gs.fx.debris(f.z, p.x, p.y, 0.3, 10, 'ice', { speed: 3, size: 0.07, up: 1 })
    gs.fx.decal(f.z, p.x, p.y, 2.4, 'frost', '#ffffff', 8, { add: true, k: 0.6, opacity: 0.7 })
    gs.fx.decal(f.z, p.x, p.y, 2, 'crack', '#1a1a1e', 10, { opacity: 0.7 })
    shake(gs, 0.5, p.x, p.y)
  })
})

regFx('void', (gs, _w, f) => {
  // 奇點生成：8 m 內的光往中心塌縮（之後的常駐黑洞由 singularity 模型負責）
  const R = 8
  sfx('implode', f.x, f.y)
  sfx('void', f.x, f.y)
  gs.fx.ring(f.z, f.x, f.y, R, 0.3, '#9b5de5', 0.8, { tex: 'ring', k: 2.6, ease: 'in' })
  gs.fx.ring(f.z, f.x, f.y, R * 0.7, 0.2, '#ff9a5a', 0.6, { tex: 'ring', k: 1.6, ease: 'in' })
  gs.fx.emit(f.z, f.x, f.y, 0.5, 60, { color: '#c9a8ff', color2: '#ff9a5a', speed: 0.5, life: 1.1, size: 0.2, up: 0, area: R * 0.9, radial: -1, pull: 9, swirl: 4, hArea: 1, drag: 0.1 })
  gs.fx.after(0.7, () => {
    gs.fx.flash(f.z, f.x, f.y, 0.9, '#b28cff', 0.9, 0.3)
    gs.fx.light(f.z, f.x, f.y, 1, '#8a4cff', 40, 9, (f.v ?? 8) - 0.7, { attack: 0.05 })
  })
  shake(gs, 0.3, f.x, f.y)
})
