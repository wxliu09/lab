// 太空層事件：太陽活動（日焰）、軌道穩定器失效（末日）、小行星撞擊（美術聖經 §10）
import * as THREE from 'three'
import { regFx } from '../fxBinding'
import type { GameScene } from '../gameScene'
import { sfx } from '../../audio/sfx'
import { screenFlash, shake, W } from './kit'

/** 從恆星表面拱起的日珥（二次貝茲曲線的管子，慢慢長出來再淡掉）*/
function prominence(gs: GameScene, z: number, cx: number, cy: number, r: number, ang: number, span: number, height: number, color: string, dur: number): void {
  const a = W(cx + Math.cos(ang) * r, cy + Math.sin(ang) * r, 0)
  const b = W(cx + Math.cos(ang + span) * r, cy + Math.sin(ang + span) * r, 0)
  const mid = new THREE.Vector3().addVectors(a, b).multiplyScalar(0.5)
  const out = mid.clone().sub(W(cx, cy, 0)).normalize()
  const c = mid.clone().addScaledVector(out, height).setY(height * 0.6)
  const curve = new THREE.QuadraticBezierCurve3(a, c, b)
  const core = new THREE.Mesh(new THREE.TubeGeometry(curve, 32, 0.25, 6, false), gs.fx.mat(new THREE.Color(color).lerp(new THREE.Color('#ffffff'), 0.4), 4))
  const halo = new THREE.Mesh(new THREE.TubeGeometry(curve, 32, 0.9, 6, false), gs.fx.mat(color, 1.6, { opacity: 0.3 }))
  const g = new THREE.Group()
  g.add(core, halo)
  const cm = core.material as THREE.MeshBasicMaterial
  const hm = halo.material as THREE.MeshBasicMaterial
  const center = W(cx, cy, 0)
  gs.fx.addTransient(g, dur, z, (k) => {
    const s = 0.3 + 0.7 * Math.min(1, k * 2.5)
    g.scale.setScalar(s)
    g.position.copy(center).multiplyScalar(1 - s)
    const op = k < 0.6 ? 1 : 1 - (k - 0.6) / 0.4
    cm.opacity = op
    hm.opacity = 0.3 * op
  })
}

regFx('solar', (gs, _w, f) => {
  // 日焰：恆星爆亮、日珥拱起、兩道衝擊波掃過星區、太陽風粒子；之後 40 秒日冕維持偏亮（恆星灼燒加劇）
  const z = f.z
  sfx('solar')
  screenFlash(gs, '#fff0d0', 1.6, 1.2)
  gs.fx.glow(z, f.x, f.y, 0, '#fff4d8', 34, 2.5, { tex: 'star', k: 3, grow: 1.6, spin: 0.3 })
  gs.fx.glow(z, f.x, f.y, 0, '#ffb060', 70, 3.5, { k: 1.6, grow: 1.4 })
  gs.fx.glow(z, f.x, f.y, 0, '#ffb060', 40, 40, { k: 0.9, fadeIn: 0.05, opacity: 0.6 })
  for (let i = 0; i < 6; i++) {
    const ang = Math.random() * Math.PI * 2
    gs.fx.after(i * 0.25, () => prominence(gs, z, f.x, f.y, 2.3, ang, 0.5 + Math.random() * 0.6, 3 + Math.random() * 4, i % 2 ? '#ff8a3a' : '#ffd27a', 3 + Math.random()))
  }
  for (let i = 0; i < 2; i++) gs.fx.after(i * 0.6, () => gs.fx.ring(z, f.x, f.y, 3, 70, i ? '#ff8a3a' : '#ffd9a0', 4, { tex: 'ring', k: 2.4, h: 0, ease: 'linear' }))
  gs.fx.emit(z, f.x, f.y, 0, 140, { color: '#fff0c0', color2: '#ff5a1a', speed: 14, life: 3.5, size: 1.2, up: 0, drag: 0.2, area: 2.4, ring: true, radial: 1, hArea: 2 })
  gs.fx.light(z, f.x, f.y, 4, '#ffb060', 3000, 90, 4, { attack: 0.1 })
  shake(gs, 0.35)
})

regFx('orbitFail', (gs, _w, f) => {
  // 軌道穩定器失效：恆星轉紅、重力波向內收縮、整個星區開始被拉向恆星
  const z = f.z
  sfx('orbitFail')
  screenFlash(gs, '#ff3b2a', 1.2, 1.6)
  gs.fx.glow(z, f.x, f.y, 0, '#ff3b2a', 60, 4, { k: 1.8, grow: 1.2 })
  gs.fx.glow(z, f.x, f.y, 0, '#ff5a3a', 36, 60, { k: 0.8, fadeIn: 0.03, opacity: 0.55 })
  for (let i = 0; i < 4; i++) gs.fx.after(i * 0.7, () => gs.fx.ring(z, f.x, f.y, 70, 3, '#ff5a3a', 2.4, { tex: 'ring', k: 2.2, h: 0, ease: 'in' }))
  for (let i = 0; i < 6; i++) {
    gs.fx.after(i * 0.5, () =>
      gs.fx.emit(z, f.x, f.y, 0, 50, { color: '#ffb0a0', color2: '#ff3b2a', speed: 2, life: 3, size: 0.9, up: 0, area: 45, ring: true, radial: -1, pull: 14, swirl: 4, drag: 0, hArea: 3 }),
    )
  }
  gs.fx.light(z, f.x, f.y, 4, '#ff3b2a', 2000, 90, 5, { attack: 0.3 })
  shake(gs, 0.6)
})

regFx('asteroidHit', (gs, _w, f) => {
  const r = Math.max(0.5, f.v ?? 1)
  const z = f.z
  sfx('impact', f.x, f.y)
  gs.fx.flash(z, f.x, f.y, 0.5, '#ffe0b0', r * 1.4, 0.4)
  gs.fx.glow(z, f.x, f.y, 0.5, '#ff8a3a', r * 7, 0.9, { k: 2, grow: 1.5 })
  gs.fx.ring(z, f.x, f.y, r * 0.5, r * 6, '#ffd9a0', 0.9, { tex: 'ring', k: 2.6, h: 0.3 })
  gs.fx.emit(z, f.x, f.y, 0.5, 70, { color: '#fff0c0', color2: '#ff4a1a', speed: r * 6, life: 1, size: 0.9 + r * 0.3, grow: 1.5, up: 0.3, drag: 1.2, hArea: r })
  gs.fx.emit(z, f.x, f.y, 0.5, 40, { color: '#ffffff', color2: '#ffb46b', speed: r * 9, life: 0.9, size: 1, up: 0.3, drag: 0.6, layer: 'spark' })
  gs.fx.emit(z, f.x, f.y, 0.5, 30, { color: '#5a5450', speed: r * 2.5, life: 2.5, size: 1.4 + r * 0.6, up: 0.2, drag: 0.8, layer: 'smoke', alpha: 0.7 })
  gs.fx.debris(z, f.x, f.y, 0.5, 18, 'rock', { speed: r * 5, size: 0.18 * r, up: 0.3, life: 3 })
  gs.fx.light(z, f.x, f.y, 2, '#ffb46b', 600 * r, 20 * r, 0.9)
  shake(gs, Math.min(1, 0.3 + r * 0.25), f.x, f.y)
})
