// 單位視圖：依快照實體建立／更新模型、動畫、腳下光圈
import * as THREE from 'three'
import { UNITS, isZoneObject } from '../shared/content/registry'
import { EntFlag } from '../shared/protocol/messages'
import { PLAYER_COLORS } from '../shared/constants'
import type { CEnt } from '../client/world'
import { animateRig, buildHuman, type Rig } from './models/human'
import { buildModel, type ModelView } from './models/index'
import { attachSuit } from './models/suits'
import './models/misc'
import './models/xeno'
import './models/mutant'
import './models/android'
import { decalTex } from './tex'

export interface UnitView {
  id: number
  root: THREE.Group
  rig: Rig | null
  model: ModelView | null
  ring: THREE.Mesh | null
  /** 選取圈的顏色（材質依顏色＋狀態共用）*/
  ringCol: string
  key: string
  lastX: number
  lastY: number
  speed: number
  deadAt: number
  height: number
  fade: number
}

const ringGeo = new THREE.RingGeometry(0.48, 0.62, 36)
ringGeo.userData.shared = true
const glowGeo = new THREE.PlaneGeometry(1, 1)
glowGeo.userData.shared = true

/** 選取圈材質：依顏色＋狀態（0 一般、1 懸停、2 選取）共用；選取中的透明度每幀脈動（同時只會有一個選取單位）*/
const RING_OPACITY = [0.45, 0.85, 0.95]
const ringMats = new Map<string, THREE.MeshBasicMaterial>()
function ringMat(col: string, state: number): THREE.MeshBasicMaterial {
  const k = col + '|' + state
  let m = ringMats.get(k)
  if (!m) {
    m = new THREE.MeshBasicMaterial({ color: col, transparent: true, opacity: RING_OPACITY[state], depthWrite: false, blending: THREE.AdditiveBlending })
    m.userData.keep = true
    ringMats.set(k, m)
  }
  return m
}
/** 腳下光暈材質：依顏色共用 */
const glowMats = new Map<string, THREE.MeshBasicMaterial>()
function glowMat(col: string): THREE.MeshBasicMaterial {
  let m = glowMats.get(col)
  if (!m) {
    m = new THREE.MeshBasicMaterial({ map: decalTex('glow', col), transparent: true, opacity: 0.25, depthWrite: false, blending: THREE.AdditiveBlending })
    m.userData.keep = true
    glowMats.set(col, m)
  }
  return m
}

/** 預熱用：選取圈與腳下光暈各一個（同色同狀態的材質共用同一支 shader；燈光組合不同的場景要各編一份）*/
export function unitWarmMeshes(): THREE.Object3D[] {
  return [new THREE.Mesh(ringGeo, ringMat('#ffffff', 0)), new THREE.Mesh(glowGeo, glowMat('#ffffff'))]
}

function colorOf(c: number | undefined): string {
  return c !== undefined && c >= 0 ? (PLAYER_COLORS[c]?.hex ?? '#ffffff') : '#ffffff'
}

export class UnitLayer {
  readonly group = new THREE.Group()
  readonly views = new Map<number, UnitView>()
  selected = 0
  hovered = 0
  /** sync 每幀重複使用 */
  private seen = new Set<number>()

  private makeKey(e: CEnt): string {
    const s = e.s
    return `${s.d}|${s.cl ?? ''}|${s.c ?? -1}|${(s.fl ?? 0) & EntFlag.Corpse}`
  }

  private create(e: CEnt): UnitView {
    const s = e.s
    const isItem = (s.d ?? '').startsWith('item:')
    const def = isItem ? UNITS.get('groundItem') : UNITS.get(s.d ?? '')
    const root = new THREE.Group()
    let rig: Rig | null = null
    let model: ModelView | null = null
    let height: number
    // 站點的 UnitDef 只在 sim 端動態註冊（client 查不到）；它的 model id 本來就是外觀 id（'station.<id>'）
    const station = !def && (s.d ?? '').startsWith('station.')
    const modelId = def?.model ?? (station ? s.d! : 'unknown')
    if (modelId === 'human') {
      rig = buildHuman(s.cl || 'researcher', colorOf(s.c), s.i % 5)
      if ((s.d ?? '').startsWith('suit.')) attachSuit(rig, s.d!, colorOf(s.c))
      rig.root.scale.setScalar(1.18)
      root.add(rig.root)
      height = rig.height * 1.18
    } else {
      model = buildModel(modelId, def, s)
      root.add(model.root)
      height = model.height
    }
    if (def?.scale) {
      root.scale.setScalar(def.scale)
      height *= def.scale
    }
    let ring: THREE.Mesh | null = null
    let ringCol = ''
    const isUnit = !station && !def?.tags.includes('structure') && !((s.fl ?? 0) & EntFlag.Corpse) && !isZoneObject(def)
    if (isUnit) {
      const col = s.o !== undefined && s.o >= 0 ? colorOf(s.c) : (s.fl ?? 0) & EntFlag.Hostile ? '#ff3b3b' : '#9fb3c2'
      ringCol = col
      ring = new THREE.Mesh(ringGeo, ringMat(col, 0))
      ring.rotation.x = -Math.PI / 2
      ring.position.y = 0.03
      const r = (def?.radius ?? 0.4) * 1.6
      ring.scale.setScalar(r)
      root.add(ring)
      // 腳下光暈：地上道具自己有分類色的光圈（groundItems.ts），不再疊一層灰色光暈（少一個 draw call）
      if (!isItem) {
        const glow = new THREE.Mesh(glowGeo, glowMat(col))
        glow.rotation.x = -Math.PI / 2
        glow.position.y = 0.025
        glow.scale.setScalar(r * 2.4)
        root.add(glow)
      }
    }
    root.traverse((o) => (o.userData.entId = s.i))
    this.group.add(root)
    return { id: s.i, root, rig, model, ring, ringCol, key: this.makeKey(e), lastX: e.x, lastY: e.y, speed: 0, deadAt: -1, height, fade: 0 }
  }

  sync(ents: Iterable<CEnt>, zone: number, skip: (e: CEnt) => boolean, dt: number, t: number): void {
    const seen = this.seen
    seen.clear()
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
      v.root.position.set(e.x, 0, -e.y)
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
              // 半透明的複本是這個單位自己的：換回原材質時釋放
              m.dispose()
              ;(o as THREE.Mesh).material = o.userData.prevMat
              delete o.userData.prevMat
            }
          }
        })
      }
      // 石化：凍結在當下的姿勢（待機呼吸、步態、脈動都停）；死亡時照常播倒地動畫
      const frozen = (fl & EntFlag.Petrified) !== 0 && st !== 4
      if (!frozen) {
        if (v.rig) animateRig(v.rig, dt, t, v.speed, st, v.deadAt >= 0 ? t - v.deadAt : 0)
        if (v.model) v.model.update(t, dt, v.speed, st)
      }
      if (v.ring) {
        const sel = e.s.i === this.selected
        const hov = e.s.i === this.hovered
        const m = ringMat(v.ringCol, sel ? 2 : hov ? 1 : 0)
        v.ring.material = m
        if (sel) m.opacity = 0.95 + Math.sin(t * 6) * 0.05
        v.ring.rotation.z = sel ? t * 1.5 : 0
      }
    }
    for (const [id, v] of this.views) if (!seen.has(id)) this.removeView(v)
  }

  private removeView(v: UnitView): void {
    this.group.remove(v.root)
    this.views.delete(v.id)
    // 隱形時換上的半透明材質複本（選取圈與光暈的材質依顏色共用，不釋放）
    v.root.traverse((o) => {
      if (!o.userData.prevMat) return
      ;((o as THREE.Mesh).material as THREE.Material).dispose()
      ;(o as THREE.Mesh).material = o.userData.prevMat
      delete o.userData.prevMat
    })
  }

  clear(): void {
    for (const v of [...this.views.values()]) this.removeView(v)
  }
}
