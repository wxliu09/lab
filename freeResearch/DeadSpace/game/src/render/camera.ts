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
  follow: (() => { x: number; y: number } | null) | null = null

  constructor() {
    this.cam = new THREE.PerspectiveCamera(this.fov, 16 / 9, 0.5, 400)
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
    if (this.keys.has('ArrowLeft')) mx -= 1
    if (this.keys.has('ArrowRight')) mx += 1
    if (this.keys.has('ArrowUp')) my += 1
    if (this.keys.has('ArrowDown')) my -= 1
    if (this.edgeScroll && this.mouse.inside) {
      const m = 6
      if (this.mouse.x <= m) mx -= 1
      if (this.mouse.x >= viewW - m) mx += 1
      if (this.mouse.y <= m) my += 1
      if (this.mouse.y >= viewH - m) my -= 1
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
