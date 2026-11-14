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
import { bakeTree } from './batch'

/** 倒地多久之後把人形屍體烘焙成靜態 mesh（倒地動畫約 0.45 秒）；每幀最多烘焙幾具（進站時一次出現很多具屍體）*/
const BAKE_AFTER = 0.6
const BAKES_PER_FRAME = 2

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
  /** 人形屍體已經烘焙成靜態 mesh（骨架不再動畫；復活時整個重建）*/
  baked: boolean
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
  /**
   * 預先建好、還沒顯示的單位視圖（第一次進太空的分段載入：各站船殼、船艦一個一片，GameScene.spaceLoadSteps）：
   * 那個 zone 的 sync 遇到同 id、同外觀 key 的直接拿來用，第一次同步之後沒用到的丟掉
   */
  private pending = new Map<number, { v: UnitView; zone: number }>()

  private makeKey(e: CEnt): string {
    const s = e.s
    return `${s.d}|${s.cl ?? ''}|${s.c ?? -1}|${(s.fl ?? 0) & EntFlag.Corpse}`
  }

  /** 預先建一個單位的視圖（不加進場景）；已經有了就不做 */
  prepare(e: CEnt): void {
    if (this.views.has(e.s.i) || this.pending.has(e.s.i)) return
    this.pending.set(e.s.i, { v: this.create(e, false), zone: e.s.z ?? -1 })
  }

  /** 預先建好、還沒顯示的某個 zone 的單位模型（預編譯、上傳貼圖用）*/
  pendingRoots(zone: number): THREE.Object3D[] {
    const out: THREE.Object3D[] = []
    for (const p of this.pending.values()) if (p.zone === zone) out.push(p.v.root)
    return out
  }

  private create(e: CEnt, show = true): UnitView {
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
      // 模型本身的零件（之後 buff 掛上的帽子、殼層不算）：倒地之後烘焙用
      rig.root.traverse((o) => {
        if ((o as THREE.Mesh).isMesh) o.userData.rigPart = true
      })
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
    if (show) this.group.add(root)
    return { id: s.i, root, rig, model, ring, ringCol, key: this.makeKey(e), lastX: e.x, lastY: e.y, speed: 0, deadAt: -1, height, fade: 0, baked: false }
  }

  sync(ents: Iterable<CEnt>, zone: number, skip: (e: CEnt) => boolean, dt: number, t: number): void {
    const seen = this.seen
    seen.clear()
    let bakes = 0
    for (const e of ents) {
      if (e.s.z !== zone || skip(e)) continue
      seen.add(e.s.i)
      let v = this.views.get(e.s.i)
      const key = this.makeKey(e)
      // 烘焙過的屍體站起來了（復活）：骨架已經合併，重建
      if (v && (v.key !== key || (v.baked && (e.s.st ?? 0) !== 4))) {
        this.removeView(v)
        v = undefined
      }
      if (!v) {
        const p = this.pending.get(e.s.i)
        if (p && p.v.key === key) {
          v = p.v
          this.group.add(v.root)
        } else v = this.create(e)
        this.pending.delete(e.s.i)
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
        if (v.rig && !v.baked) animateRig(v.rig, dt, t, v.speed, st, v.deadAt >= 0 ? t - v.deadAt : 0)
        if (v.model) v.model.update(t, dt, v.speed, st)
      }
      // 倒地的人形屍體不會再動：零件依材質烘焙成幾個靜態 mesh（一具約 30 個 draw call → 十幾個）。
      // 自己的單位（手電筒、槍口跟著骨架）與隱形中（材質是暫時的半透明複本）的不烘焙
      if (v.rig && !v.baked && st === 4 && v.deadAt >= 0 && t - v.deadAt > BAKE_AFTER && v.fade === 0 && !(fl & EntFlag.Mine) && bakes < BAKES_PER_FRAME) {
        bakes++
        animateRig(v.rig, 0, t, 0, 4, 10)
        for (const m of bakeTree(v.rig.root, (o) => !!o.userData.rigPart)) m.userData.entId = v.id
        v.baked = true
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
    for (const [id, p] of this.pending) if (p.zone === zone) this.pending.delete(id)
  }

  private removeView(v: UnitView): void {
    this.group.remove(v.root)
    this.views.delete(v.id)
    // 烘焙出來的屍體幾何是這個單位自己的
    if (v.baked)
      v.root.traverse((o) => {
        const g = (o as THREE.Mesh).geometry
        if (g?.userData.baked) g.dispose()
      })
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
