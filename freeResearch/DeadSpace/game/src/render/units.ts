// 單位視圖：依快照實體建立／更新模型、動畫、腳下光圈
import * as THREE from 'three'
import { UNITS } from '../shared/content/registry'
import { EntFlag } from '../shared/protocol/messages'
import { PLAYER_COLORS } from '../shared/constants'
import type { CEnt } from '../client/world'
import { animateRig, buildHuman, type Rig } from './models/human'
import { buildModel, type ModelView } from './models/index'
import { decalTex } from './tex'
import { W } from './stationBuilder'

export interface UnitView {
  id: number
  root: THREE.Group
  rig: Rig | null
  model: ModelView | null
  ring: THREE.Mesh | null
  key: string
  lastX: number
  lastY: number
  speed: number
  deadAt: number
  height: number
  fade: number
}

const ringGeo = new THREE.RingGeometry(0.48, 0.62, 36)

function colorOf(c: number | undefined): string {
  return c !== undefined && c >= 0 ? (PLAYER_COLORS[c]?.hex ?? '#ffffff') : '#ffffff'
}

export class UnitLayer {
  readonly group = new THREE.Group()
  readonly views = new Map<number, UnitView>()
  selected = 0
  hovered = 0

  private makeKey(e: CEnt): string {
    const s = e.s
    return `${s.d}|${s.cl ?? ''}|${s.c ?? -1}|${(s.fl ?? 0) & EntFlag.Corpse}`
  }

  private create(e: CEnt): UnitView {
    const s = e.s
    const def = UNITS.get(s.d ?? '')
    const root = new THREE.Group()
    let rig: Rig | null = null
    let model: ModelView | null = null
    let height = 1.8
    const modelId = def?.model ?? 'unknown'
    if (modelId === 'human') {
      rig = buildHuman(s.cl || 'researcher', colorOf(s.c), s.i % 5)
      rig.root.scale.setScalar(1.18)
      root.add(rig.root)
      height = rig.height * 1.18
    } else {
      model = buildModel(modelId, def, s)
      root.add(model.root)
      height = model.height
    }
    if (def?.scale) root.scale.setScalar(def.scale)
    let ring: THREE.Mesh | null = null
    const isUnit = !def?.tags.includes('structure')
    if (isUnit) {
      const col = s.o !== undefined && s.o >= 0 ? colorOf(s.c) : (s.fl ?? 0) & EntFlag.Hostile ? '#ff3b3b' : '#9fb3c2'
      ring = new THREE.Mesh(
        ringGeo,
        new THREE.MeshBasicMaterial({ color: col, transparent: true, opacity: 0.75, depthWrite: false, blending: THREE.AdditiveBlending }),
      )
      ring.rotation.x = -Math.PI / 2
      ring.position.y = 0.03
      const r = (def?.radius ?? 0.4) * 1.6
      ring.scale.setScalar(r)
      root.add(ring)
      const glow = new THREE.Mesh(
        new THREE.PlaneGeometry(1, 1),
        new THREE.MeshBasicMaterial({ map: decalTex('glow', col), transparent: true, opacity: 0.25, depthWrite: false, blending: THREE.AdditiveBlending }),
      )
      glow.rotation.x = -Math.PI / 2
      glow.position.y = 0.025
      glow.scale.setScalar(r * 2.4)
      root.add(glow)
    }
    root.traverse((o) => (o.userData.entId = s.i))
    this.group.add(root)
    return { id: s.i, root, rig, model, ring, key: this.makeKey(e), lastX: e.x, lastY: e.y, speed: 0, deadAt: -1, height, fade: 0 }
  }

  sync(ents: Iterable<CEnt>, zone: number, skip: (e: CEnt) => boolean, dt: number, t: number): void {
    const seen = new Set<number>()
    for (const e of ents) {
      if (e.s.z !== zone || skip(e)) continue
      seen.add(e.s.i)
      let v = this.views.get(e.s.i)
      const key = this.makeKey(e)
      if (v && v.key !== key) {
        this.removeView(v)
        v = undefined
      }
      if (!v) {
        v = this.create(e)
        this.views.set(e.s.i, v)
        v.lastX = e.x
        v.lastY = e.y
      }
      const p = W(e.x, e.y)
      v.root.position.copy(p)
      v.root.rotation.y = Math.atan2(Math.cos(e.f), -Math.sin(e.f))
      const moved = Math.hypot(e.x - v.lastX, e.y - v.lastY)
      v.speed = v.speed * 0.8 + (dt > 0 ? moved / dt : 0) * 0.2
      v.lastX = e.x
      v.lastY = e.y
      const st = e.s.st ?? 0
      if (st === 4 && v.deadAt < 0) v.deadAt = t
      const fl = e.s.fl ?? 0
      // 隱形：自己與隊友看得到半透明
      const stealth = (fl & EntFlag.Stealth) !== 0
      v.root.visible = true
      if (stealth !== (v.fade > 0)) {
        v.fade = stealth ? 1 : 0
        v.root.traverse((o) => {
          const m = (o as THREE.Mesh).material as THREE.Material | undefined
          if (m && 'opacity' in m && !(o === v!.ring)) {
            if (stealth) {
              o.userData.prevMat = m
              const c = m.clone()
              c.transparent = true
              c.opacity = 0.35
              ;(o as THREE.Mesh).material = c
            } else if (o.userData.prevMat) {
              ;(o as THREE.Mesh).material = o.userData.prevMat
            }
          }
        })
      }
      if (v.rig) animateRig(v.rig, dt, t, v.speed, st, v.deadAt >= 0 ? t - v.deadAt : 0)
      if (v.model) v.model.update(t, dt, v.speed, st)
      if (v.ring) {
        const m = v.ring.material as THREE.MeshBasicMaterial
        const sel = e.s.i === this.selected
        const hov = e.s.i === this.hovered
        m.opacity = sel ? 0.95 + Math.sin(t * 6) * 0.05 : hov ? 0.85 : 0.45
        v.ring.rotation.z = sel ? t * 1.5 : 0
      }
    }
    for (const [id, v] of this.views) if (!seen.has(id)) this.removeView(v)
  }

  private removeView(v: UnitView): void {
    this.group.remove(v.root)
    this.views.delete(v.id)
  }

  clear(): void {
    for (const v of [...this.views.values()]) this.removeView(v)
  }
}
