// 戰爭迷霧：client 依快照的視野來源，在已知的站體格子上做 raycast 產生可見遮罩（R = 目前可見，G = 曾經看過）
import * as THREE from 'three'
import { Cell, type ParsedLayout } from '../shared/layout'
import { fogUniforms } from './materials'

const RES = 4 // texel / m

export class FogMap {
  readonly w: number
  readonly h: number
  readonly data: Uint8Array
  readonly tex: THREE.DataTexture
  private opaque: Uint8Array
  private vis: Float32Array
  private explored: Uint8Array

  constructor(readonly layout: ParsedLayout) {
    this.w = layout.w * RES
    this.h = layout.h * RES
    this.data = new Uint8Array(this.w * this.h * 4)
    this.vis = new Float32Array(this.w * this.h)
    this.explored = new Uint8Array(this.w * this.h)
    this.tex = new THREE.DataTexture(this.data, this.w, this.h, THREE.RGBAFormat)
    this.tex.magFilter = THREE.LinearFilter
    this.tex.minFilter = THREE.LinearFilter
    this.tex.wrapS = this.tex.wrapT = THREE.ClampToEdgeWrapping
    this.opaque = new Uint8Array(layout.w * layout.h)
    for (let i = 0; i < layout.w * layout.h; i++) {
      const c = layout.cells[i] as Cell
      this.opaque[i] = c === Cell.Wall || c === Cell.Void ? 1 : 0
    }
  }

  bind(): void {
    fogUniforms.uFogTex.value = this.tex
    fogUniforms.uFogRect.value.set(0, 0, this.layout.w, this.layout.h)
    fogUniforms.uFogOn.value = 1
  }

  private cellOpaque(x: number, y: number, doorClosed: (idx: number) => boolean): boolean {
    const l = this.layout
    const col = Math.floor(x)
    const row = l.h - 1 - Math.floor(y)
    if (col < 0 || row < 0 || col >= l.w || row >= l.h) return true
    const i = row * l.w + col
    if (this.opaque[i]) return true
    const d = l.doorOf[i]
    return d >= 0 && doorClosed(d)
  }

  /** 依視野來源重算（約 10 Hz 呼叫）*/
  update(sources: { x: number; y: number; r: number }[], doorClosed: (idx: number) => boolean, full = false): void {
    const { w, h, vis, explored, data } = this
    vis.fill(0)
    if (full) vis.fill(1)
    for (const s of sources) {
      const rays = Math.min(720, Math.max(180, Math.ceil(s.r * 30)))
      const step = 1 / RES / 1.5
      for (let k = 0; k < rays; k++) {
        const a = (k / rays) * Math.PI * 2
        const dx = Math.cos(a) * step
        const dy = Math.sin(a) * step
        let x = s.x
        let y = s.y
        const n = Math.ceil(s.r / step)
        for (let i = 0; i < n; i++) {
          x += dx
          y += dy
          const tx = Math.floor(x * RES)
          const ty = Math.floor(y * RES)
          if (tx < 0 || ty < 0 || tx >= w || ty >= h) break
          const fall = i > n * 0.82 ? 1 - (i - n * 0.82) / (n * 0.18) : 1
          const idx = ty * w + tx
          if (vis[idx] < fall) vis[idx] = fall
          if (this.cellOpaque(x, y, doorClosed)) {
            // 牆面本身亮起，再往內一點點讓牆頂也看得到
            for (let j = 1; j <= 3; j++) {
              const ex = Math.floor((x + dx * j) * RES)
              const ey = Math.floor((y + dy * j) * RES)
              if (ex >= 0 && ey >= 0 && ex < w && ey < h) {
                const ei = ey * w + ex
                if (vis[ei] < fall) vis[ei] = fall
              }
            }
            break
          }
        }
      }
      // 來源周圍一圈保證可見
      const r0 = 0.9 * RES
      for (let oy = -r0; oy <= r0; oy++)
        for (let ox = -r0; ox <= r0; ox++) {
          if (ox * ox + oy * oy > r0 * r0) continue
          const tx = Math.floor(s.x * RES + ox)
          const ty = Math.floor(s.y * RES + oy)
          if (tx >= 0 && ty >= 0 && tx < w && ty < h) vis[ty * w + tx] = 1
        }
    }
    for (let i = 0; i < w * h; i++) {
      const v = vis[i]
      if (v > 0.3) explored[i] = 255
      data[i * 4] = Math.round(v * 255)
      data[i * 4 + 1] = explored[i]
      data[i * 4 + 3] = 255
    }
    this.tex.needsUpdate = true
  }

  /** 某點目前是否可見（給 render 隱藏記憶中的物件）*/
  visibleAt(x: number, y: number): number {
    const tx = Math.floor(x * RES)
    const ty = Math.floor(y * RES)
    if (tx < 0 || ty < 0 || tx >= this.w || ty >= this.h) return 0
    return this.vis[ty * this.w + tx]
  }
}
