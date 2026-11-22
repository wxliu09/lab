// 單位視圖：依快照實體建立／更新模型、動畫、腳下光圈；受擊反應（閃光、後座、頓幀）、變身過場（顫抖、裂紋、彈出）
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
import { hitExpect, hitStep, hitStop, hitTrigger, hpFlash, hpHit, newHit, newPose, popScale, type HitOpts, type HitState } from './fx/hitReact'
import { buildShells, crackMat, disposeShells, flashMat, setCracks, setFlash, showShells, type Shells } from './fx/bodyfx'

/** 倒地多久之後把人形屍體烘焙成靜態 mesh（倒地動畫約 0.45 秒）；每幀最多烘焙幾具（進站時一次出現很多具屍體）*/
const BAKE_AFTER = 0.6
const BAKES_PER_FRAME = 2

export interface UnitView {
  id: number
  root: THREE.Group
  /** 包住模型的中間節點：受擊後座／壓扁、變身彈出與顫抖只動這一層（腳下的選取圈、光暈不跟著晃）*/
  body: THREE.Group
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
  /** 最後看到的外觀 def 與旗標（死亡噴濺、變身過場只看「看起來的樣子」，不讀身分）*/
  d: string
  fl: number
  /** 會被打退、會顫抖的單位（非建築、非屍體、非區域物件）*/
  mobile: boolean
  /** 上一份快照的 HP（受擊偵測）*/
  hp: number | undefined
  mhp: number | undefined
  hit: HitState
  /** 受擊閃光覆蓋層（第一次受擊才建；零件太多的大模型不做 → noFlash）*/
  flash: Shells | null
  noFlash: boolean
  /** 變身裂紋覆蓋層與進度 */
  cracks: Shells | null
  crackK: number
  /** 動畫時鐘（頓幀時放慢；不影響 sim）*/
  at: number
  /** 最近一次知道方向的受擊（死亡噴濺方向）*/
  hitAt: number
  /** 最近一次閃避（miss 特效）：同一下的命中反應取消 */
  missAt: number
  /** 變身：新外形延後出現並彈出 0.7 → 1.05 → 1 */
  pop: { t0: number; dur: number } | null
  /** 詠唱變身中的顫抖、弓身、裂紋（只有自己與知情的同陣營看得到，見 strain()）*/
  strain: { t0: number; dur: number; c: string; c2: string } | null
  /** body 的變換被動過（要歸零）*/
  bodyDirty: boolean
}

/** 死亡特效要的「最後看到的樣子」*/
export interface UnitLook {
  d: string
  fl: number
  x: number
  y: number
  /** 世界高度（含縮放）*/
  h: number
  human: boolean
  mobile: boolean
  /** 大型單位（死亡時鏡頭震動、低沉悶響）*/
  big: boolean
  /** 最近 1.5 秒內的受擊方向（sim 座標單位向量）*/
  dir: [number, number] | null
  radius: number
  /** 面向（sim 座標單位向量；人形屍體往後倒）*/
  fx: number
  fy: number
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

const POSE = newPose()
const tmpV = new THREE.Vector3()

export class UnitLayer {
  readonly group = new THREE.Group()
  readonly views = new Map<number, UnitView>()
  selected = 0
  hovered = 0
  /** 上一次 sync 的時間（特效事件觸發受擊時用的時鐘）*/
  private now = 0
  /** sync 每幀重複使用 */
  private seen = new Set<number>()
  /**
   * 預先建好、還沒顯示的單位視圖（第一次進太空的分段載入：各站船殼、船艦一個一片，GameScene.spaceLoadSteps）：
   * 那個 zone 的 sync 遇到同 id、同外觀 key 的直接拿來用，第一次同步之後沒用到的丟掉
   */
  private pending = new Map<number, { v: UnitView; zone: number }>()
  /** 變身過場留下的舊外形（從 views 拿出來，由特效驅動顫抖、裂開；到期由 sync 收掉）*/
  private husks: { v: UnitView; until: number }[] = []
  /** 還沒建出視圖的新外形：建出來時延後出現並彈出（t0 = 開始彈出的時間）*/
  private pops = new Map<number, { t0: number; dur: number; until: number }>()
  /** 剛死掉的位置：同一處冒出來的屍體接著受擊的紅閃與後仰（屍體是另一個實體）*/
  private deaths: { x: number; y: number; t: number; dx: number; dy: number }[] = []
  /** 最近的爆炸（boom／fusion 特效）：範圍內接著掉血的單位往外被推 */
  private blasts: { x: number; y: number; r: number; t: number }[] = []

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
    const body = new THREE.Group()
    root.add(body)
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
      body.add(rig.root)
      height = rig.height * 1.18
    } else {
      model = buildModel(modelId, def, s)
      body.add(model.root)
      height = model.height
    }
    if (def?.scale) {
      root.scale.setScalar(def.scale)
      height *= def.scale
    }
    let ring: THREE.Mesh | null = null
    let ringCol = ''
    const corpse = ((s.fl ?? 0) & EntFlag.Corpse) !== 0
    const structure = station || !!def?.tags.includes('structure')
    const isUnit = !structure && !corpse && !isZoneObject(def)
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
    const v: UnitView = {
      id: s.i,
      root,
      body,
      rig,
      model,
      ring,
      ringCol,
      key: this.makeKey(e),
      lastX: e.x,
      lastY: e.y,
      speed: 0,
      deadAt: -1,
      height,
      fade: 0,
      baked: false,
      d: s.d ?? '',
      fl: s.fl ?? 0,
      mobile: isUnit && !isItem,
      hp: undefined,
      mhp: undefined,
      hit: newHit(),
      flash: null,
      noFlash: false,
      cracks: null,
      crackK: 0,
      at: this.now,
      hitAt: -Infinity,
      missAt: -Infinity,
      pop: null,
      strain: null,
      bodyDirty: false,
    }
    // 剛死掉的地方冒出來的屍體：接著那一下的紅閃與後仰（只看位置與時間）
    if (corpse && this.deaths.length) {
      for (let i = this.deaths.length - 1; i >= 0; i--) {
        const m = this.deaths[i]
        if (this.now - m.t > 0.8 || Math.hypot(m.x - e.x, m.y - e.y) > 0.8) continue
        hitTrigger(v.hit, this.now, { k: 1, red: true, dx: m.dx, dy: m.dy })
        v.mobile = true
        this.deaths.splice(i, 1)
        break
      }
    }
    return v
  }

  // ───── 受擊反應（特效事件呼叫）─────

  /** 命中瞬間（atk／proj 命中、爆炸）：from = 攻擊來源的 sim 座標（決定後座方向）*/
  hit(id: number | undefined, o: HitOpts & { from?: { x: number; y: number } } = {}): void {
    const v = id ? this.views.get(id) : undefined
    if (!v || v.deadAt >= 0 || this.now - v.missAt < 0.25) return
    let dx = o.dx
    let dy = o.dy
    if (o.from) {
      dx = v.lastX - o.from.x
      dy = v.lastY - o.from.y
    }
    if (dx || dy) v.hitAt = this.now
    hitTrigger(v.hit, this.now, { ...o, dx, dy, fromHp: false })
  }

  /** 預告：dur 秒內會有特效觸發的命中（近戰揮擊的命中點晚一點），這段時間的 HP 下降不要先閃 */
  expectHit(id: number | undefined, dur?: number): void {
    const v = id ? this.views.get(id) : undefined
    if (v) hitExpect(v.hit, this.now, dur)
  }

  /** 爆炸：r 公尺內接下來 0.4 秒掉血的單位，後座方向是離開爆心 */
  blast(x: number, y: number, r: number): void {
    this.blasts.push({ x, y, r, t: this.now })
    if (this.blasts.length > 6) this.blasts.shift()
  }

  /** 閃避（miss 特效）：取消同一下排定的命中反應 */
  missed(id: number | undefined): void {
    const v = id ? this.views.get(id) : undefined
    if (v) v.missAt = this.now
  }

  /** 近戰的攻擊者也頓一下 */
  hitStop(id: number | undefined): void {
    const v = id ? this.views.get(id) : undefined
    if (v) hitStop(v.hit)
  }

  /** 死亡特效用：這個 id 最後看到的樣子（沒有視圖 = 不在畫面上 → null）*/
  look(id: number | undefined): UnitLook | null {
    const v = id ? this.views.get(id) : undefined
    if (!v) return null
    const def = UNITS.get(v.d)
    const h = v.height
    const recent = this.now - v.hitAt < 1.5 && (v.hit.dx || v.hit.dy)
    return {
      d: v.d,
      fl: v.fl,
      x: v.root.position.x,
      y: -v.root.position.z,
      h,
      human: !!v.rig,
      mobile: v.mobile,
      big: h > 2.4 || (def?.radius ?? 0) >= 0.75,
      dir: recent ? [v.hit.dx, v.hit.dy] : null,
      radius: def?.radius ?? 0.4,
      fx: Math.sin(v.root.rotation.y),
      fy: -Math.cos(v.root.rotation.y),
    }
  }

  /** 死亡：這個單位最後一下的紅閃交給同一處冒出來的屍體接著做 */
  markDeath(x: number, y: number, dir: [number, number] | null): void {
    this.deaths.push({ x, y, t: this.now, dx: dir?.[0] ?? 0, dy: dir?.[1] ?? 0 })
    if (this.deaths.length > 8) this.deaths.shift()
  }

  // ───── 變身過場 ─────

  /**
   * 把變身前的舊外形從視圖表拿出來（還留在場景裡）交給特效驅動：在 (x, y) 附近、已經不在世界裡（gone）的視圖。
   * life 秒後由 sync 自動收掉（特效被清掉也不會殘留）
   */
  takeHusk(x: number, y: number, except: number | undefined, gone: (id: number) => boolean, life: number): UnitView | null {
    let best: UnitView | null = null
    let bd = 1.2
    for (const v of this.views.values()) {
      if (v.id === except || !gone(v.id) || v.deadAt >= 0) continue
      const d = Math.hypot(v.root.position.x - x, -v.root.position.z - y)
      if (d < bd) {
        bd = d
        best = v
      }
    }
    if (!best) return null
    this.views.delete(best.id)
    best.root.traverse((o) => delete o.userData.entId)
    if (best.ring) best.ring.visible = false
    this.husks.push({ v: best, until: this.now + life })
    return best
  }

  /** 新外形延後 delay 秒出現，接著在 dur 秒內彈出 0.7 → 1.05 → 1（視圖還沒建好也可以先登記）*/
  popIn(id: number | undefined, delay: number, dur = 0.34): void {
    if (!id) return
    const t0 = this.now + delay
    const v = this.views.get(id)
    if (v) {
      v.pop = { t0, dur }
      return
    }
    this.pops.set(id, { t0, dur, until: this.now + delay + 3 })
  }

  /** 詠唱變身：dur 秒內顫抖、弓身、裂紋長出來（呼叫端負責只在觀看者本來就知道時呼叫）*/
  strain(id: number | undefined, dur: number, c: string, c2: string): void {
    const v = id ? this.views.get(id) : undefined
    if (v) v.strain = { t0: this.now, dur: Math.max(0.5, dur), c, c2 }
  }

  /** 設定某個視圖（含變身殘殼）的裂紋進度與顏色；第一次呼叫時建覆蓋層 */
  setCracks(v: UnitView, k: number, c?: string, c2?: string): void {
    v.crackK = k
    if (k <= 0.005 && !v.cracks) return
    if (!v.cracks) {
      if (v.noFlash) return
      v.cracks = buildShells(v.body, crackMat(c ?? '#33ffd1', c2 ?? '#7a3cff', 6.5 / Math.max(0.8, Math.min(2.5, v.height / 1.9))), 64, 6)
      if (!v.cracks) {
        v.noFlash = true
        return
      }
    }
    v.root.getWorldPosition(tmpV)
    setCracks(v.cracks, k, this.now, tmpV, c, c2)
  }

  /** 每幀：受擊姿勢、彈出、詠唱顫抖 → body 的變換（回傳這一幀動畫時間的倍率）*/
  private pose(v: UnitView, dt: number, t: number): number {
    const p = hitStep(v.hit, dt, POSE)
    let px = 0
    let pz = 0
    let sx = 1
    let sy = 1
    let rx = 0
    let rz = 0
    let any = false
    if (p.active && v.mobile && (p.push > 0 || p.squash !== 1)) {
      // 世界方向 (dx, −dy) 轉到 root 的本地座標（root 只繞 y 轉、等比縮放）
      const a = v.root.rotation.y
      const c = Math.cos(a)
      const s = Math.sin(a)
      const wx = p.dx
      const wz = -p.dy
      const lx = wx * c - wz * s
      const lz = wx * s + wz * c
      const inv = 1 / (v.root.scale.x || 1)
      px = lx * p.push * inv
      pz = lz * p.push * inv
      sy = p.squash
      sx = 1 + (1 - p.squash) * 0.5
      rx = lz * p.lean
      rz = -lx * p.lean
      any = true
    }
    // 受擊閃光
    if (p.flash > 0.01) {
      if (!v.flash && !v.noFlash) {
        v.flash = buildShells(v.body, flashMat())
        if (!v.flash) v.noFlash = true
      }
      if (v.flash) setFlash(v.flash, p.flash * 0.78, p.red)
    } else if (v.flash?.visible) showShells(v.flash, false)
    // 變身彈出
    let vis = true
    if (v.pop) {
      const u = (t - v.pop.t0) / v.pop.dur
      if (u < 0) vis = false
      else {
        const k = popScale(u)
        sx *= k
        sy *= k
        any = true
        if (u >= 1) v.pop = null
      }
    }
    v.body.visible = vis
    // 詠唱變身：越來越劇烈的顫抖＋弓身，裂紋跟著詠唱進度長出來（被打斷就收掉）
    if (v.strain) {
      const k = Math.min(1, (t - v.strain.t0) / v.strain.dur)
      const amp = 0.006 + 0.03 * k * k
      px += (Math.random() - 0.5) * amp
      pz += (Math.random() - 0.5) * amp
      if (!v.rig) rx += 0.12 * k
      rz += Math.sin(t * 31) * 0.03 * k
      sy *= 1 - 0.04 * k
      any = true
      this.setCracks(v, Math.min(0.85, k * 0.95), v.strain.c, v.strain.c2)
    } else if (v.cracks) {
      // 詠唱中斷：裂紋快速收掉
      const k = Math.max(0, v.crackK - dt * 3)
      this.setCracks(v, k)
      if (k <= 0) {
        disposeShells(v.cracks)
        v.cracks = null
      }
    }
    if (any || v.bodyDirty) {
      v.body.position.set(px, 0, pz)
      v.body.scale.set(sx, sy, sx)
      v.body.rotation.set(rx, 0, rz)
      v.bodyDirty = any
    }
    return p.timeScale
  }

  sync(ents: Iterable<CEnt>, zone: number, skip: (e: CEnt) => boolean, dt: number, t: number): void {
    this.now = t
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
          v.at = t
          this.group.add(v.root)
        } else v = this.create(e)
        this.pending.delete(e.s.i)
        this.views.set(e.s.i, v)
        v.lastX = e.x
        v.lastY = e.y
        const pop = this.pops.get(e.s.i)
        if (pop) {
          v.pop = { t0: pop.t0, dur: pop.dur }
          this.pops.delete(e.s.i)
        }
      }
      v.root.position.set(e.x, 0, -e.y)
      v.root.rotation.y = Math.atan2(Math.cos(e.f), -Math.sin(e.f))
      const moved = Math.hypot(e.x - v.lastX, e.y - v.lastY)
      v.speed = v.speed * 0.8 + (dt > 0 ? moved / dt : 0) * 0.2
      v.lastX = e.x
      v.lastY = e.y
      const st = e.s.st ?? 0
      if (st === 4 && v.deadAt < 0) {
        v.deadAt = t
        v.strain = null
      }
      const fl = e.s.fl ?? 0
      v.fl = fl
      // 受擊偵測：快照之間 HP 下降（DoT、爆炸、看不到來源的傷害）；特效已經觸發過的同一下會被合併
      if (st !== 4 && !(fl & EntFlag.Corpse)) {
        const frac = hpHit(v.hp, v.mhp, e.s.hp, e.s.mhp)
        if (frac > 0) {
          const o: HitOpts = { ...hpFlash(frac), fromHp: true }
          // 爆炸範圍內：往外推、偏紅
          for (const b of this.blasts) {
            if (t - b.t > 0.45) continue
            const bx = e.x - b.x
            const by = e.y - b.y
            if (Math.hypot(bx, by) > b.r + 1) continue
            o.dx = bx
            o.dy = by
            o.k = Math.max(o.k ?? 0, 0.8)
            o.red = true
            v.hitAt = t
            break
          }
          hitTrigger(v.hit, t, o)
        }
      }
      v.hp = e.s.hp
      v.mhp = e.s.mhp
      // 詠唱結束或被打斷：停止顫抖（裂紋在 pose 裡收掉）
      if (v.strain && st !== 3 && st !== 5) v.strain = null
      // 隱形：自己與隊友看得到半透明
      const stealth = (fl & EntFlag.Stealth) !== 0
      v.root.visible = true
      if (stealth !== (v.fade > 0)) {
        v.fade = stealth ? 1 : 0
        v.root.traverse((o) => {
          if (o.userData.overlay) return
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
      // 受擊姿勢與頓幀：動畫時鐘依倍率前進（頓幀時幾乎停住）
      const ts = this.pose(v, dt, t)
      const adt = dt * ts
      v.at += adt
      // 石化：凍結在當下的姿勢（待機呼吸、步態、脈動都停）；死亡時照常播倒地動畫
      const frozen = (fl & EntFlag.Petrified) !== 0 && st !== 4
      if (!frozen) {
        if (v.rig && !v.baked) {
          animateRig(v.rig, adt, v.at, v.speed, st, v.deadAt >= 0 ? t - v.deadAt : 0)
          // 詠唱變身：往前弓身、雙手抱住身體
          if (v.strain) {
            const k = Math.min(1, (t - v.strain.t0) / v.strain.dur)
            v.rig.torso.rotation.x = 0.45 * k + Math.sin(t * 23) * 0.04 * k
            v.rig.head.rotation.x = 0.25 * k
            v.rig.armL.rotation.x = -0.5 - 0.4 * k
            v.rig.armR.rotation.x = -0.5 - 0.4 * k
          }
        }
        if (v.model) v.model.update(v.at, adt, v.speed, st)
      }
      // 倒地的人形屍體不會再動：零件依材質烘焙成幾個靜態 mesh（一具約 30 個 draw call → 十幾個）。
      // 自己的單位（手電筒、槍口跟著骨架）與隱形中（材質是暫時的半透明複本）的不烘焙
      if (v.rig && !v.baked && st === 4 && v.deadAt >= 0 && t - v.deadAt > BAKE_AFTER && v.fade === 0 && !(fl & EntFlag.Mine) && bakes < BAKES_PER_FRAME) {
        bakes++
        this.dropOverlays(v)
        animateRig(v.rig, 0, t, 0, 4, 10)
        for (const m of bakeTree(v.rig.root, (o) => !!o.userData.rigPart)) m.userData.entId = v.id
        v.baked = true
        v.noFlash = true
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
    // 變身殘殼到期
    for (let i = this.husks.length - 1; i >= 0; i--) {
      const h = this.husks[i]
      if (t < h.until) continue
      this.husks.splice(i, 1)
      this.disposeView(h.v)
    }
    if (this.pops.size) for (const [id, p] of this.pops) if (t > p.until) this.pops.delete(id)
    if (this.deaths.length && t - this.deaths[0].t > 1) this.deaths = this.deaths.filter((d) => t - d.t <= 1)
    if (this.blasts.length && t - this.blasts[0].t > 0.5) this.blasts = this.blasts.filter((b) => t - b.t <= 0.5)
  }

  /** 拿掉受擊閃光與裂紋覆蓋層（烘焙前、移除時）*/
  private dropOverlays(v: UnitView): void {
    if (v.flash) disposeShells(v.flash)
    if (v.cracks) disposeShells(v.cracks)
    v.flash = null
    v.cracks = null
  }

  private removeView(v: UnitView): void {
    this.views.delete(v.id)
    this.disposeView(v)
  }

  private disposeView(v: UnitView): void {
    this.group.remove(v.root)
    this.dropOverlays(v)
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
    for (const h of this.husks) this.disposeView(h.v)
    this.husks = []
    this.pops.clear()
    this.deaths = []
    this.blasts = []
  }
}
