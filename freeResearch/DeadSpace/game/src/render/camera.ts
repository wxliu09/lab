// RTS 鏡頭：斜俯視、滾輪縮放（俯角隨縮放在 48–64° 微調）、邊緣捲動、方向鍵、中鍵拖曳、跟隨、平滑震動
import * as THREE from 'three'
import { shakeScale } from '../client/viewPrefs'

/**
 * 預設縮放（0 = 最近、1 = 最遠）：第 7 輪審查「預設距離下一個人約 50 px 高，串流壓縮後只剩名字看得清楚」，
 * 從 0.5（站內 37 m）拉近到 0.32（約 28.7 m，近 22%）。站內 14–60 m、太空 22–95 m 的範圍不變。
 */
export const DEFAULT_ZOOM = 0.32

/** 震動噪聲的兩個頻率（Hz）：12–18 Hz 之間、互不成整數比，疊起來不會看出週期 */
const SHAKE_HZ_A = 13.3
const SHAKE_HZ_B = 17.1

/**
 * 平滑的震動噪聲（-1..1）：兩個不同頻率的正弦疊加（取代每幀 Math.random 的抖動：低 fps 時一幀一跳、高 fps 時變成細碎雜訊，
 * 兩種都難看）。seed 讓 x／y 兩軸各走各的相位。純函式（單元測試驗證連續性）。
 */
export function shakeNoise(t: number, seed: number): number {
  const a = Math.sin(t * Math.PI * 2 * SHAKE_HZ_A + seed * 1.7)
  const b = Math.sin(t * Math.PI * 2 * SHAKE_HZ_B + seed * 4.3 + 0.9)
  return a * 0.62 + b * 0.38
}

export class RtsCamera {
  readonly cam: THREE.PerspectiveCamera
  /** 注視點（sim 座標）*/
  tx = 0
  ty = 0
  /** 平滑後的實際注視點 */
  private sx = 0
  private sy = 0
  zoom = DEFAULT_ZOOM
  private zs = DEFAULT_ZOOM
  bounds = { minX: 0, minY: 0, maxX: 100, maxY: 100 }
  minDist = 14
  maxDist = 60
  fov = 34
  shake = 0
  private keys = new Set<string>()
  private mouse = { x: -1, y: -1, inside: false }
  edgeScroll = true
  /** 邊緣捲動速度倍率（設定頁）*/
  edgeSpeed = 1
  /** 方向鍵捲動速度倍率（設定頁）*/
  keySpeed = 1
  /** 跟隨目標（GameScene 依 viewPrefs.followMode 設定；每幀呼叫，回傳 null = 這一幀不跟）*/
  follow: (() => { x: number; y: number } | null) | null = null
  /** 跟隨的緩動速率（1/秒）：0 = 鎖定目標（自己的單位、駕駛的站點）；> 0 = 平滑移過去（觀戰的戰鬥跟隨換目標時不要瞬移）*/
  followEase = 0
  /** 使用者手動移動鏡頭（邊緣捲動、方向鍵、拖曳、點小地圖移到別處）：GameScene 用它把跟隨模式關掉 */
  onManualPan: (() => void) | null = null
  /** 震動噪聲的時間軸（秒）*/
  private shakeT = 0
  /**
   * 畫面底部被 HUD 擋住的高度（CSS px，GameScene 量底部頭像面板）：注視點（tx, ty）改畫在「HUD 以上可見區」的正中央，
   * 不在整個畫面的正中央（不然角色腳下、南邊的人名會被頭像面板蓋住）。用投影偏移（setViewOffset）做：
   * 鏡頭的位置與朝向不變，tx／ty 的語意不變；Raycaster（setFromCamera）與 project() 都用同一個投影矩陣，點選、拾取、名字位置跟著對。
   */
  bottomInset = 0
  /** 目前套用的投影偏移（CSS px）與它對應的畫面大小 */
  private applied = { off: 0, w: 0, h: 0 }

  constructor() {
    this.cam = new THREE.PerspectiveCamera(this.fov, 16 / 9, 0.5, 400)
  }

  /** 依 bottomInset 套用投影偏移（只有變了才重算投影矩陣）*/
  private applyInset(viewW: number, viewH: number): void {
    // 最多往上移 1/5 個畫面（HUD 量錯、或小視窗時 HUD 佔掉大半個畫面，也不要把注視點推出可見區）
    const off = Math.round(Math.max(0, Math.min(viewH * 0.2, this.bottomInset / 2)))
    const a = this.applied
    if (off === a.off && viewW === a.w && viewH === a.h) return
    this.applied = { off, w: viewW, h: viewH }
    if (off > 0 && viewW > 0 && viewH > 0) this.cam.setViewOffset(viewW, viewH, 0, off, viewW, viewH)
    else this.cam.clearViewOffset()
    this.cam.updateProjectionMatrix()
  }

  setBounds(minX: number, minY: number, maxX: number, maxY: number): void {
    this.bounds = { minX, minY, maxX, maxY }
  }

  jump(x: number, y: number): void {
    this.tx = this.sx = x
    this.ty = this.sy = y
  }

  focus(x: number, y: number): void {
    // 跟隨中移到別處（點小地圖）＝手動移動，關掉跟隨；移到跟隨目標本身（空白鍵回到自己）不算
    if (this.follow) {
      const f = this.follow()
      if (!f || Math.hypot(f.x - x, f.y - y) > 1.5) this.manual()
    }
    this.tx = x
    this.ty = y
  }

  /** 手動移動鏡頭：停止跟隨並通知 GameScene */
  private manual(): void {
    this.follow = null
    this.onManualPan?.()
  }

  key(code: string, down: boolean): void {
    if (down) this.keys.add(code)
    else this.keys.delete(code)
  }

  mouseAt(x: number, y: number, inside: boolean): void {
    // 滑鼠真的移動了（不是版面變動時瀏覽器補發的同一個位置）：恢復邊緣捲動
    if (this.edgeHeld && (x !== this.mouse.x || y !== this.mouse.y)) this.edgeHeld = false
    this.mouse = { x, y, inside }
  }

  /**
   * 暫停邊緣捲動，直到滑鼠真的移動（第 9 輪 P2-5）：鏡頭剛自動對準自己（換 zone、下船、換操控對象）時，
   * 游標若停在畫面邊緣（右下角的指令卡、左下的小地圖），鏡頭會在玩家沒碰滑鼠的情況下被一路捲到地圖角落
   */
  holdEdge(): void {
    this.edgeHeld = true
  }
  private edgeHeld = false

  wheel(dy: number): void {
    this.zoom = Math.max(0, Math.min(1, this.zoom + dy * 0.0009))
  }

  pan(dx: number, dy: number, viewH: number): void {
    const dist = this.distance()
    const k = (dist * Math.tan((this.fov * Math.PI) / 360) * 2) / viewH
    this.tx -= dx * k
    this.ty += dy * k * 1.25
    if (dx || dy) this.manual()
  }

  distance(): number {
    return this.minDist + (this.maxDist - this.minDist) * this.zs
  }

  update(dt: number, viewW: number, viewH: number): void {
    const speed = this.distance() * 1.4
    let mx = 0
    let my = 0
    if (this.keys.has('ArrowLeft')) mx -= this.keySpeed
    if (this.keys.has('ArrowRight')) mx += this.keySpeed
    if (this.keys.has('ArrowUp')) my += this.keySpeed
    if (this.keys.has('ArrowDown')) my -= this.keySpeed
    if (this.edgeScroll && this.mouse.inside && !this.edgeHeld) {
      // 邊緣 22px 內開始捲動，越靠邊越快（瀏覽器視窗邊緣很容易滑出去，判定區不能太窄）
      const m = 22
      const ramp = (d: number) => this.edgeSpeed * (0.45 + 0.55 * (1 - Math.max(0, Math.min(m, d)) / m))
      const { x, y } = this.mouse
      if (x <= m) mx -= ramp(x)
      if (x >= viewW - m) mx += ramp(viewW - x)
      if (y <= m) my += ramp(y)
      if (y >= viewH - m) my -= ramp(viewH - y)
    }
    if (mx || my) {
      this.tx += mx * speed * dt
      this.ty += my * speed * dt
      this.manual()
    }
    const f = this.follow?.()
    if (f) {
      if (this.followEase > 0) {
        const fk = 1 - Math.exp(-dt * this.followEase)
        this.tx += (f.x - this.tx) * fk
        this.ty += (f.y - this.ty) * fk
      } else {
        this.tx = f.x
        this.ty = f.y
      }
    }
    const b = this.bounds
    this.tx = Math.max(b.minX, Math.min(b.maxX, this.tx))
    this.ty = Math.max(b.minY, Math.min(b.maxY, this.ty))
    const k = 1 - Math.exp(-dt * 10)
    this.sx += (this.tx - this.sx) * k
    this.sy += (this.ty - this.sy) * k
    this.zs += (this.zoom - this.zs) * (1 - Math.exp(-dt * 8))
    const dist = this.distance()
    const pitch = ((50 + 14 * this.zs) * Math.PI) / 180
    this.shake = Math.max(0, this.shake - dt * 2)
    this.shakeT += dt
    // 平滑噪聲（12–18 Hz）× 使用者設定（關掉震動、或系統要求減少動態時為 0）；沒有震動時不讀設定（matchMedia 每次呼叫都會配置物件）
    const sh = this.shake > 0 ? this.shake * this.shake * 0.3 * shakeScale() : 0
    const jx = sh ? shakeNoise(this.shakeT, 0) * sh : 0
    const jy = sh ? shakeNoise(this.shakeT, 1) * sh : 0
    // 注視點在地面，鏡頭往南（+z）往上
    this.cam.position.set(this.sx + jx, Math.sin(pitch) * dist, -this.sy + Math.cos(pitch) * dist + jy)
    this.cam.lookAt(this.sx + jx, 0.6, -this.sy + jy)
    this.applyInset(viewW, viewH)
  }

  /** 螢幕座標 → 地面（sim 座標）*/
  groundAt(ndcX: number, ndcY: number, h = 0): { x: number; y: number } | null {
    const ray = new THREE.Raycaster()
    ray.setFromCamera(new THREE.Vector2(ndcX, ndcY), this.cam)
    const plane = new THREE.Plane(new THREE.Vector3(0, 1, 0), -h)
    const p = new THREE.Vector3()
    if (!ray.ray.intersectPlane(plane, p)) return null
    return { x: p.x, y: -p.z }
  }
}

/** 觀戰的戰鬥跟隨：選定一場戰鬥之後至少停留這麼久（秒）才換 */
export const ACTION_DWELL = 4
/** 新事件離目前焦點多近（公尺）算同一場戰鬥 */
const ACTION_NEAR = 7
/** 焦點這麼久（秒）沒有新事件就算打完了，可以換到別處 */
const ACTION_QUIET = 1.5
/** 焦點還在打的話，最多停這麼久（秒）就換到別處更新的戰鬥 */
const ACTION_MAX = 9
/** 太舊（秒）的事件不跟過去 */
const ACTION_STALE = 6

/**
 * 觀戰的「戰鬥跟隨」（followMode = 'action'）：GameScene 把看得到的戰鬥、死亡特效（快照裡本來就有的 fx）餵給 note，
 * 每幀用 pick 取得鏡頭要對準的位置。規則：
 * - 還沒有焦點、或焦點在別的 zone：直接跟最新的事件
 * - 同一場戰鬥（離焦點 ACTION_NEAR 內）的新事件：焦點往那裡挪一點（戰鬥慢慢移動時鏡頭跟著飄，不跳）
 * - 別處有更新的事件：焦點至少停 ACTION_DWELL 秒，而且這裡已經安靜 ACTION_QUIET 秒（或已經停了 ACTION_MAX 秒）才換過去
 * 換焦點時鏡頭由 RtsCamera.followEase 平滑移過去。純邏輯（單元測試）。
 */
export class ActionFollow {
  /** 最近一次「不在目前焦點附近」的事件 */
  private ev = { z: -1, x: 0, y: 0, t: -1e9 }
  /** 目前焦點：since = 選定的時間、hit = 這裡最近一次有事件的時間 */
  readonly focus = { z: -1, x: 0, y: 0, since: -1e9, hit: -1e9 }

  note(z: number, x: number, y: number, t: number): void {
    const f = this.focus
    if (f.z === z && Math.hypot(x - f.x, y - f.y) <= ACTION_NEAR) {
      f.hit = t
      f.x += (x - f.x) * 0.2
      f.y += (y - f.y) * 0.2
      return
    }
    const e = this.ev
    e.z = z
    e.x = x
    e.y = y
    e.t = t
  }

  /** 這一幀鏡頭要對準哪裡（zone = 畫面上的 zone；沒有可跟的回傳 null）*/
  pick(zone: number, t: number): { x: number; y: number } | null {
    const f = this.focus
    const e = this.ev
    const fresh = e.z === zone && e.t > f.since && t - e.t <= ACTION_STALE
    if (fresh && (f.z !== zone || (t - f.since >= ACTION_DWELL && (t - f.hit >= ACTION_QUIET || t - f.since >= ACTION_MAX)))) {
      f.z = zone
      f.x = e.x
      f.y = e.y
      f.since = t
      f.hit = e.t
    }
    return f.z === zone ? f : null
  }
}
