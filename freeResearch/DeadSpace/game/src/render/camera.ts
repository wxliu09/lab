// RTS 鏡頭：斜俯視、滾輪縮放（俯角隨縮放在 48–64° 微調）、邊緣捲動、方向鍵、中鍵拖曳
import * as THREE from 'three'

export class RtsCamera {
  readonly cam: THREE.PerspectiveCamera
  /** 注視點（sim 座標）*/
  tx = 0
  ty = 0
  /** 平滑後的實際注視點 */
  private sx = 0
  private sy = 0
  zoom = 0.5
  private zs = 0.5
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
  follow: (() => { x: number; y: number } | null) | null = null
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
    this.tx = x
    this.ty = y
  }

  key(code: string, down: boolean): void {
    if (down) this.keys.add(code)
    else this.keys.delete(code)
  }

  mouseAt(x: number, y: number, inside: boolean): void {
    this.mouse = { x, y, inside }
  }

  wheel(dy: number): void {
    this.zoom = Math.max(0, Math.min(1, this.zoom + dy * 0.0009))
  }

  pan(dx: number, dy: number, viewH: number): void {
    const dist = this.distance()
    const k = (dist * Math.tan((this.fov * Math.PI) / 360) * 2) / viewH
    this.tx -= dx * k
    this.ty += dy * k * 1.25
    this.follow = null
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
    if (this.edgeScroll && this.mouse.inside) {
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
      this.follow = null
    }
    const f = this.follow?.()
    if (f) {
      this.tx = f.x
      this.ty = f.y
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
    const sh = this.shake * this.shake * 0.6
    const jx = (Math.random() - 0.5) * sh
    const jy = (Math.random() - 0.5) * sh
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
