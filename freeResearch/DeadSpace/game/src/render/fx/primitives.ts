// 效果原語 {k:'fx', fx:…} 的視覺：技能內容表直接指定的特效（施放點、目標或自身）
// 注意：原語不帶半徑（v），半徑照內容表的 aoe 寫在這裡
import * as THREE from 'three'
import { regFx } from '../fxBinding'
import type { GameScene } from '../gameScene'
import { sfx } from '../../audio/sfx'
import { GEO } from '../fx'
import { at, bolt, burst, entPos, follow3, muzzleOf, pillar, screenFlash, shake, telegraph, W } from './kit'

function every(gs: GameScene, z: number, dur: number, dt: number, fn: (k: number, t: number) => void): void {
  let last = -1
  gs.fx.addTransient(new THREE.Object3D(), dur, z, (k, t) => {
    if (last >= 0 && t - last < dt) return
    last = t
    fn(k, t)
  })
}

// ───────── 雷殛者：落雷 ─────────

regFx('lightningMark', (gs, _w, f) => {
  // 1.2 秒預警：地面電圈、上空雲團聚集、地上小電弧亂竄
  const R = 3
  sfx('charge', f.x, f.y)
  telegraph(gs, f.z, f.x, f.y, R, '#9fd8ff', 1.2, { hz: 2.5 })
  gs.fx.emit(f.z, f.x, f.y, 5, 14, { color: '#1a2030', speed: 0.6, life: 1.4, size: 2.2, up: 0, area: 1.6, swirl: 2, layer: 'smoke', alpha: 0.7 })
  every(gs, f.z, 1.2, 0.12, () => {
    const a = Math.random() * Math.PI * 2
    const r1 = Math.random() * R
    const b = a + (Math.random() - 0.5) * 1.5
    const r2 = Math.random() * R
    bolt(gs, f.z, W(f.x + Math.cos(a) * r1, f.y + Math.sin(a) * r1, 0.08), W(f.x + Math.cos(b) * r2, f.y + Math.sin(b) * r2, 0.08), '#9fd8ff', 0.015, 0.1, { branches: 0, jag: 1.5 })
    gs.fx.glow(f.z, f.x, f.y, 5, '#6a8aff', 2.5, 0.12, { k: 1.4 })
  })
})

regFx('lightning', (gs, _w, f) => {
  const R = 3
  sfx('thunder', f.x, f.y)
  const top = W(f.x + (Math.random() - 0.5) * 2, f.y + (Math.random() - 0.5) * 2, 16)
  const hit = W(f.x, f.y, 0)
  bolt(gs, f.z, top, hit, '#c9e8ff', 0.14, 0.4, { flicker: 0.05, branches: 4, jag: 0.8, segs: 18 })
  for (let i = 0; i < 5; i++) {
    const a = (i / 5) * Math.PI * 2 + Math.random()
    bolt(gs, f.z, W(f.x, f.y, 0.1), W(f.x + Math.cos(a) * R, f.y + Math.sin(a) * R, 0.05), '#9fd8ff', 0.03, 0.25, { branches: 1, jag: 1.4 })
  }
  screenFlash(gs, '#dff0ff', 2, 0.25, f.x, f.y)
  gs.fx.flash(f.z, f.x, f.y, 0.5, '#e8f6ff', 1.6, 0.3)
  gs.fx.light(f.z, f.x, f.y, 3, '#c9e8ff', 600, 14, 0.5, { flicker: 0.6 })
  gs.fx.ring(f.z, f.x, f.y, 0.3, R * 1.2, '#c9e8ff', 0.5, { tex: 'ring', k: 3 })
  gs.fx.decal(f.z, f.x, f.y, R * 1.6, 'scorch', '#ffffff', 16, { opacity: 0.8 })
  gs.fx.decal(f.z, f.x, f.y, R * 2, 'bolt', '#7fd8ff', 1.2, { add: true, k: 2 })
  gs.fx.emit(f.z, f.x, f.y, 0.2, 40, { color: '#ffffff', color2: '#7fd8ff', speed: 6, life: 0.5, size: 1, up: 0.9, grav: 9, layer: 'spark' })
  gs.fx.emit(f.z, f.x, f.y, 0.2, 14, { color: '#4a4a52', speed: 2, life: 1.6, size: 0.9, up: 0.5, layer: 'smoke', alpha: 0.55 })
  shake(gs, 0.55, f.x, f.y)
})

// ───────── 幻影者：墨瞳 ─────────

regFx('blackness', (gs, _w, f) => {
  const p = at(gs, f)
  const h = Math.min(1.9, p.h * 0.9)
  sfx('ink', p.x, p.y)
  gs.fx.emit(f.z, p.x, p.y, h, 26, { color: '#0a0410', speed: 1.4, life: 1.2, size: 0.5, up: 0.2, layer: 'smoke', alpha: 0.9, grow: 2 })
  gs.fx.emit(f.z, p.x, p.y, h, 14, { color: '#14081e', speed: 2.2, life: 0.7, size: 0.18, up: 0.6, grav: 6, layer: 'smoke', alpha: 0.95, grow: 0.8 })
  gs.fx.emit(f.z, p.x, p.y, h, 10, { color: '#7a3cff', speed: 1.5, life: 0.5, size: 0.14, up: 0.4 })
  gs.fx.decal(f.z, p.x, p.y, 1.3, 'splat', '#06020a', 8, { opacity: 0.85 })
})

// ───────── 防護服 ─────────

regFx('teslaNova', (gs, _w, f) => {
  const p = at(gs, f)
  const R = 2.5
  sfx('zap', p.x, p.y)
  sfx('thunder', p.x, p.y)
  gs.fx.flash(f.z, p.x, p.y, 1, '#9fd8ff', 1, 0.3)
  gs.fx.ring(f.z, p.x, p.y, 0.3, R, '#7fd8ff', 0.45, { tex: 'ring', k: 3 })
  for (let i = 0; i < 9; i++) {
    const a = (i / 9) * Math.PI * 2 + Math.random() * 0.3
    bolt(gs, f.z, W(p.x, p.y, 1.1), W(p.x + Math.cos(a) * R, p.y + Math.sin(a) * R, 0.1 + Math.random() * 0.8), '#7fd8ff', 0.03, 0.28, { flicker: 0.05, branches: 1 })
  }
  gs.fx.emit(f.z, p.x, p.y, 1, 40, { color: '#ffffff', color2: '#7fd8ff', speed: 6, life: 0.4, size: 1, up: 0.4, layer: 'spark' })
  gs.fx.decal(f.z, p.x, p.y, R * 2, 'bolt', '#7fd8ff', 0.8, { add: true, k: 2 })
  gs.fx.light(f.z, p.x, p.y, 1.5, '#7fd8ff', 120, 7, 0.4, { flicker: 0.5 })
})

regFx('cryoNova', (gs, _w, f) => {
  const p = at(gs, f)
  const R = 4.5
  sfx('freeze', p.x, p.y)
  gs.fx.flash(f.z, p.x, p.y, 0.8, '#e8f8ff', 0.9, 0.3)
  gs.fx.ring(f.z, p.x, p.y, 0.3, R, '#bfefff', 0.6, { tex: 'ring', k: 2.6 })
  gs.fx.ring(f.z, p.x, p.y, 0.3, R * 0.85, '#ffffff', 0.9, { tex: 'frost', k: 1.4, opacity: 0.8 })
  gs.fx.decal(f.z, p.x, p.y, R * 2, 'frost', '#ffffff', 6, { add: true, k: 0.7, opacity: 0.8, grow: 1.1 })
  gs.fx.debris(f.z, p.x, p.y, 0.5, 18, 'ice', { speed: 5, size: 0.08, up: 0.6 })
  gs.fx.emit(f.z, p.x, p.y, 0.3, 40, { color: '#e8f6ff', speed: R * 1.2, life: 1.2, size: 0.8, up: 0.15, drag: 2, layer: 'smoke', alpha: 0.5, radial: 1, area: 0.3 })
  gs.fx.emit(f.z, p.x, p.y, 0.6, 30, { color: '#ffffff', color2: '#7fd8ff', speed: R * 1.5, life: 0.6, size: 0.18, up: 0.3, drag: 2 })
})

regFx('plasmaBurst', (gs, _w, f) => {
  const R = 1.5
  sfx('plasma', f.x, f.y)
  sfx('boom', f.x, f.y)
  burst(gs, f.z, f.x, f.y, 0.6, '#5cf2a5', R, { sparks: 20, color2: '#1a8a5a' })
  gs.fx.decal(f.z, f.x, f.y, R * 1.6, 'scorch', '#ffffff', 8, { opacity: 0.6 })
  gs.fx.decal(f.z, f.x, f.y, R * 1.4, 'soft', '#5cf2a5', 1.2, { add: true, k: 1.6 })
  gs.fx.light(f.z, f.x, f.y, 1, '#5cf2a5', 60, 6, 0.4)
})

regFx('overheat', (gs, _w, f) => {
  const p = at(gs, f)
  sfx('overheat', p.x, p.y)
  gs.fx.flash(f.z, p.x, p.y, 1, '#ff8a2a', 0.7, 0.3)
  gs.fx.ring(f.z, p.x, p.y, 0.3, 1.8, '#ff6a2a', 0.5, { tex: 'ring', k: 2.4 })
  gs.fx.emit(f.z, p.x, p.y, 1, 30, { color: '#fff0b0', color2: '#ff3b1a', speed: 1.6, life: 0.6, size: 0.45, grow: 1.6, up: 1.4, area: 0.3 })
  gs.fx.emit(f.z, p.x, p.y, 1.2, 10, { color: '#d8d0c8', speed: 1.2, life: 1.2, size: 0.6, up: 1.2, layer: 'smoke', alpha: 0.35 })
  gs.fx.light(f.z, p.x, p.y, 1.2, '#ff6a2a', 40, 5, 0.6)
})

regFx('steamVent', (gs, _w, f) => {
  // 過熱結束：背後噴出兩道蒸汽 1.5 秒
  const p = at(gs, f)
  sfx('steam', p.x, p.y)
  every(gs, f.z, 1.6, 0.04, (k) => {
    const e = gs.world.ents.get(f.e ?? -1)
    const q = entPos(gs, f.e) ?? p
    const back = (e?.f ?? 0) + Math.PI
    for (const s of [-0.4, 0.4]) {
      const a = back + s
      gs.fx.emit(f.z, q.x + Math.cos(back) * 0.25, q.y + Math.sin(back) * 0.25, 1.3, 2, { color: '#e8e4e0', speed: 2.2 * (1 - k * 0.6), life: 0.9, size: 0.35, up: 0.6, dir: [Math.cos(a), Math.sin(a)], spread: 0.2, layer: 'smoke', alpha: 0.4 })
    }
  })
})

regFx('photonFlash', (gs, _w, f) => {
  const p = at(gs, f)
  const h = Math.min(1.9, p.h * 0.9)
  sfx('flash', p.x, p.y)
  gs.fx.glow(f.z, p.x, p.y, h, '#fff8e0', 2.6, 0.45, { tex: 'star', k: 4, grow: 1.4, follow: follow3(gs, f.e, 0.9) })
  gs.fx.glow(f.z, p.x, p.y, h, '#fff2a8', 4.5, 0.6, { tex: 'flare', k: 2.5 })
  gs.fx.light(f.z, p.x, p.y, h, '#fff2a8', 150, 8, 0.4)
  if (f.e === gs.world.me.unit) screenFlash(gs, '#fff8e0', 2, 0.6)
})

regFx('forceBurst', (gs, _w, f) => {
  const R = 3
  sfx('force', f.x, f.y)
  sfx('boom', f.x, f.y)
  const s = gs.fx.mesh(GEO.sphere, '#e8f6ff', 1.4, { opacity: 0.5 })
  s.position.copy(W(f.x, f.y, 0.3))
  const sm = s.material as THREE.MeshBasicMaterial
  gs.fx.addTransient(s, 0.4, f.z, (k) => {
    s.scale.set(R * (0.15 + 0.85 * (1 - (1 - k) ** 3)), R * 0.5 * (0.15 + 0.85 * k), R * (0.15 + 0.85 * (1 - (1 - k) ** 3)))
    sm.opacity = 0.5 * (1 - k) ** 1.6
  })
  gs.fx.ring(f.z, f.x, f.y, 0.3, R * 1.1, '#e8f6ff', 0.45, { tex: 'ring', k: 2.8 })
  gs.fx.ring(f.z, f.x, f.y, 0.3, R, '#7fd8ff', 0.6, { tex: 'arrows', k: 1.6, spin: 2 })
  gs.fx.emit(f.z, f.x, f.y, 0.2, 30, { color: '#8a8078', speed: R * 2.2, life: 1, size: 0.6, up: 0.15, drag: 2.5, layer: 'smoke', alpha: 0.45, radial: 1, area: 0.4 })
  gs.fx.emit(f.z, f.x, f.y, 0.5, 20, { color: '#ffffff', color2: '#7fd8ff', speed: 5, life: 0.35, size: 1, up: 0.4, layer: 'spark' })
})

regFx('phaseMark', (gs, _w, f) => {
  // 相位脈衝標記：1.6 秒的不穩定能量團（看得見、躲得掉）
  const R = 2
  sfx('charge', f.x, f.y)
  telegraph(gs, f.z, f.x, f.y, R, '#ff5ad8', 1.6, { hz: 2 })
  const core = gs.fx.sprite('star', '#ff7ae8', 3)
  core.position.copy(W(f.x, f.y, 0.7))
  const m = core.material
  gs.fx.addTransient(core, 1.6, f.z, (k, t) => {
    const j = 0.04 + k * 0.1
    core.position.set(f.x + (Math.random() - 0.5) * j, 0.7 + (Math.random() - 0.5) * j, -f.y + (Math.random() - 0.5) * j)
    core.scale.setScalar(0.5 + k * 0.6 + Math.sin(t * 30) * 0.1)
    m.rotation = t * 3
  })
  every(gs, f.z, 1.6, 0.06, () => gs.fx.emit(f.z, f.x, f.y, 0.7, 2, { color: '#ffb0f0', color2: '#7a3cff', speed: 1.4, life: 0.3, size: 1, up: 0.3, layer: 'spark' }))
})

regFx('phasePulse', (gs, _w, f) => {
  const R = 2
  sfx('phasePulse', f.x, f.y)
  burst(gs, f.z, f.x, f.y, 0.7, '#ff5ad8', R, { sparks: 24, color2: '#7a3cff', smoke: '#2a1030' })
  pillar(gs, f.z, f.x, f.y, R * 0.45, 2.6, '#ff7ae8', 0.4, { k: 2.2 })
  gs.fx.decal(f.z, f.x, f.y, R * 1.5, 'scorch', '#ffffff', 10, { opacity: 0.6 })
  gs.fx.light(f.z, f.x, f.y, 1, '#ff5ad8', 70, 6, 0.4)
})

regFx('verdictShot', (gs, _w, f) => {
  // 宣判：一發穿甲狙擊（施放者 → 目標點）
  const from = muzzleOf(gs, f.e) ?? { x: f.x, y: f.y, h: 1.3 }
  const tx = f.x2 ?? f.x
  const ty = f.y2 ?? f.y
  sfx('sniper', from.x, from.y)
  gs.fx.tracer(f.z, from.x, from.y, from.h, tx, ty, 1.1, '#fff0c8', 0.1, 0.22)
  gs.fx.flash(f.z, from.x, from.y, from.h, '#ffd9a0', 0.35, 0.1)
  const n = Math.max(3, Math.round(Math.hypot(tx - from.x, ty - from.y) * 1.5))
  for (let i = 0; i < n; i++) {
    const k = i / n
    gs.fx.emit(f.z, from.x + (tx - from.x) * k, from.y + (ty - from.y) * k, from.h + (1.1 - from.h) * k, 1, { color: '#a8a4a0', speed: 0.15, life: 1.2, size: 0.22, up: 0.4, layer: 'smoke', alpha: 0.3 })
  }
  gs.fx.emit(f.z, tx, ty, 1.1, 16, { color: '#ffffff', color2: '#ffd080', speed: 5, life: 0.4, size: 1, up: 0.4, grav: 6, layer: 'spark', dir: [tx - from.x, ty - from.y], spread: 0.5 })
  gs.fx.flash(f.z, tx, ty, 1.1, '#ffd9a0', 0.3, 0.12)
})

// ───────── 仿生人 ─────────

regFx('repair', (gs, _w, f) => {
  const p = at(gs, f)
  sfx('repair', p.x, p.y)
  every(gs, f.z, 2.4, 0.06, (k) => {
    const q = entPos(gs, f.e) ?? p
    const a = k * 30
    gs.fx.emit(f.z, q.x + Math.cos(a) * 0.4, q.y + Math.sin(a) * 0.4, 0.4 + Math.random() * q.h * 0.6, 2, { color: '#ffffff', color2: '#ffb000', speed: 2.2, life: 0.4, size: 1, up: 0.5, grav: 10, layer: 'spark' })
  })
  const ring = gs.fx.mesh(GEO.ringThin, '#ffb000', 3)
  ring.scale.setScalar(0.7)
  gs.fx.addTransient(ring, 2.4, f.z, (k) => {
    const q = entPos(gs, f.e) ?? p
    const kk = (k * 3) % 1
    ring.position.copy(W(q.x, q.y, q.h * kk))
    ;(ring.material as THREE.MeshBasicMaterial).opacity = 0.9 * Math.sin(kk * Math.PI)
  })
  gs.fx.light(f.z, p.x, p.y, 1, '#ffb000', 12, 4, 2.4, { flicker: 0.4, track: follow3(gs, f.e, 0.6) })
})

regFx('rotary', (gs, _w, f) => {
  const p = at(gs, f)
  sfx('rotary', p.x, p.y)
  gs.fx.ring(f.z, p.x, p.y, 0.3, 2.5, '#ffb000', 0.5, { tex: 'ring', k: 2.4 })
  gs.fx.emit(f.z, p.x, p.y, 0.15, 30, { color: '#8a8078', speed: 3.5, life: 1, size: 0.6, up: 0.1, drag: 2.5, layer: 'smoke', alpha: 0.5, radial: 1, area: 0.4, swirl: 6 })
  gs.fx.emit(f.z, p.x, p.y, 0.3, 20, { color: '#ffffff', color2: '#ffb000', speed: 4, life: 0.35, size: 1, up: 0.3, layer: 'spark' })
})

regFx('nukeArm', (gs, _w, f) => {
  // 戰術核爆倒數 3 秒：7 m 輻射警示圈跟著機體走、警報越來越急
  const p = at(gs, f)
  const R = 7
  const dur = 3
  sfx('alarm', p.x, p.y)
  telegraph(gs, f.z, p.x, p.y, R, '#ffb000', dur, { tex: 'trefoil', hz: 1.4, follow: follow3(gs, f.e, 0) })
  let t = 0
  let gap = 0.45
  while (t < dur - 0.05) {
    gs.fx.after(t, () => {
      const q = entPos(gs, f.e) ?? p
      sfx('beep', q.x, q.y)
      gs.fx.light(f.z, q.x, q.y, 1.6, '#ff3b1a', 40, 7, 0.14)
      gs.fx.glow(f.z, q.x, q.y, q.h * 0.9, '#ff3b1a', 1, 0.14, { k: 2.4 })
    })
    t += gap
    gap = Math.max(0.08, gap * 0.8)
  }
})

// ───────── 變種人 ─────────

regFx('roar', (gs, _w, f) => {
  const p = at(gs, f)
  sfx('roar', p.x, p.y)
  for (let i = 0; i < 3; i++) {
    gs.fx.after(i * 0.14, () => {
      const q = entPos(gs, f.e) ?? p
      gs.fx.ring(f.z, q.x, q.y, 0.4, 2.6 + i * 0.6, i % 2 ? '#e8b04a' : '#c8323c', 0.55, { tex: 'ring', k: 2.2, h: 0.08 + i * 0.25 })
    })
  }
  gs.fx.emit(f.z, p.x, p.y, 0.1, 16, { color: '#7a6e60', speed: 2.6, life: 0.9, size: 0.55, up: 0.15, drag: 2.5, layer: 'smoke', alpha: 0.45, radial: 1, area: 0.4 })
  gs.fx.emit(f.z, p.x, p.y, Math.min(1.8, p.h * 0.8), 12, { color: '#ff6a4a', color2: '#5a0a0a', speed: 2, life: 0.5, size: 0.2, up: 0.3, drag: 2 })
  shake(gs, 0.3, p.x, p.y)
})

regFx('quake', (gs, _w, f) => {
  // 震地：五公尺外落下一圈瓦礫（瓦礫本身是實體），這裡做裂地、塵環、震動
  const p = at(gs, f)
  const R = 5.12
  sfx('quake', p.x, p.y)
  gs.fx.decal(f.z, p.x, p.y, R * 1.6, 'crack', '#120e0a', 20, { opacity: 0.9 })
  gs.fx.ring(f.z, p.x, p.y, 0.3, R, '#c8a878', 0.7, { tex: 'ring', k: 1.6 })
  gs.fx.emit(f.z, p.x, p.y, 0.2, 40, { color: '#8a7a64', speed: R * 1.6, life: 1.4, size: 0.9, up: 0.2, drag: 2.2, layer: 'smoke', alpha: 0.6, radial: 1, area: 0.5 })
  every(gs, f.z, 0.8, 0.05, () => {
    const a = Math.random() * Math.PI * 2
    gs.fx.emit(f.z, p.x + Math.cos(a) * R, p.y + Math.sin(a) * R, 3, 2, { color: '#6a6258', speed: 0.6, life: 1.6, size: 0.8, up: -0.6, layer: 'smoke', alpha: 0.5 })
    gs.fx.debris(f.z, p.x + Math.cos(a) * R, p.y + Math.sin(a) * R, 3.5, 1, 'rock', { speed: 0.5, size: 0.12, up: -0.2 })
  })
  shake(gs, 0.9, p.x, p.y)
})

// ───────── 異形：遠爆種 ─────────

regFx('xenoBombMark', (gs, _w, f) => {
  // 3 秒後爆開（之後的 fusion 特效負責爆炸）：脈動的熾熱種子＋5.5 m 預警
  const R = 5.5
  const dur = 3
  telegraph(gs, f.z, f.x, f.y, R, '#ff7a3a', dur, { hz: 1.2 })
  const seed = gs.fx.mesh(GEO.ico1, '#ffb060', 3)
  seed.position.copy(W(f.x, f.y, 0.35))
  const halo = gs.fx.sprite('soft', '#ff6a2a', 2)
  halo.position.copy(W(f.x, f.y, 0.4))
  const vein = gs.fx.sprite('star', '#b28cff', 1.6)
  vein.position.copy(W(f.x, f.y, 0.4))
  const g = new THREE.Group()
  g.add(seed, halo, vein)
  gs.fx.addTransient(g, dur, f.z, (k, t) => {
    const hz = 1 + k * 4
    const beat = Math.max(0, Math.sin(t * hz * Math.PI * 2)) ** 3
    seed.scale.setScalar(0.18 + 0.05 * beat + k * 0.08)
    seed.rotation.y = t
    halo.scale.setScalar(1.2 + beat * 0.8 + k)
    vein.scale.setScalar(0.8 + beat * 0.5)
  })
  let t = 0
  let gap = 0.6
  while (t < dur - 0.05) {
    gs.fx.after(t, () => sfx('heartbeat', f.x, f.y))
    t += gap
    gap = Math.max(0.15, gap * 0.8)
  }
  gs.fx.light(f.z, f.x, f.y, 0.6, '#ff7a3a', 25, 5, dur, { attack: 0.8 })
})
