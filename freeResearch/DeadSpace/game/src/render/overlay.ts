// 2D 疊加層：名稱、血條、聊天泡泡、施法進度、目標圈（canvas 繪製，中文字清晰）
import * as THREE from 'three'
import { PLAYER_COLORS } from '../shared/constants'
import { EntFlag } from '../shared/protocol/messages'
import { UNITS } from '../shared/content/registry'
import type { ClientWorld } from '../client/world'
import type { GameScene } from './gameScene'
import { loc, t } from '../ui/i18n'
import { uiZoom } from '../ui/uiScale'
import { entDefName } from '../ui/names'
import { STATION_BY_ID } from '../shared/content/stations/index'

const requested = new Set<string>()
/** 靠近時會開啟操作面板的設施 */
const PANEL_DEFS = new Set(['struct.power', 'fac.moduleFactory', 'fac.cellConsole', 'fac.cageConsole'])
/** canvas 上的中文字需要先載入對應的字型子集 */
function ensureGlyphs(text: string): void {
  if (!text || requested.has(text)) return
  requested.add(text)
  void document.fonts?.load('600 12px "Noto Sans TC"', text)
}

export class Overlay {
  readonly canvas: HTMLCanvasElement
  private ctx: CanvasRenderingContext2D
  private v = new THREE.Vector3()

  constructor(parent: HTMLElement) {
    this.canvas = document.createElement('canvas')
    this.canvas.className = 'view'
    this.canvas.style.pointerEvents = 'none'
    // 插在 3D 畫面正後面、所有 HUD 之前：名字與提示不能畫到面板上面
    const view = parent.querySelector('canvas.view')
    parent.insertBefore(this.canvas, view ? view.nextSibling : parent.firstChild)
    this.ctx = this.canvas.getContext('2d')!
  }

  dispose(): void {
    this.canvas.remove()
  }

  draw(scene: GameScene, world: ClientWorld): void {
    const c = this.canvas
    const dpr = Math.min(2, window.devicePixelRatio || 1)
    const w = c.clientWidth
    const h = c.clientHeight
    if (c.width !== Math.round(w * dpr) || c.height !== Math.round(h * dpr)) {
      c.width = Math.round(w * dpr)
      c.height = Math.round(h * dpr)
    }
    const x = this.ctx
    x.setTransform(dpr, 0, 0, dpr, 0, 0)
    x.clearRect(0, 0, w, h)
    const cam = scene.camera
    const now = world.now()
    const z = Math.min(1.6, uiZoom.value)
    const labels: { name: string; sx: number; sy: number; color: string; pri: number }[] = []
    const stationLabels: { name: string; sx: number; sy: number; color: string; pri: number }[] = []
    const bubbles = new Map<number, { text: string; color: number }>()
    world.bubbles = world.bubbles.filter((b) => b.until > now)
    for (const b of world.bubbles) bubbles.set(b.e, b)
    for (const [id, uv] of scene.units.views) {
      const e = world.ents.get(id)
      if (!e) continue
      const def = UNITS.get(e.s.d ?? '')
      if (def?.tags.includes('structure') && !def.tags.includes('egg')) continue
      const fl = e.s.fl ?? 0
      if (fl & EntFlag.Corpse) continue
      // 太空層：站點與行星一律標名字（畫在模型下方），不然整片星空分不出哪裡是哪裡
      if (scene.zone === 0 && (e.s.d ?? '').startsWith('station.')) {
        const nm = loc(entDefName(e.s.d))
        if (nm) {
          // 依站點半徑在螢幕上的大小，把名字放在模型正下方
          const rad = STATION_BY_ID.get((e.s.d ?? '').slice(8))?.space.radius ?? 3
          this.v.copy(uv.root.position).project(cam)
          const cx = (this.v.x * 0.5 + 0.5) * w
          const cy = (-this.v.y * 0.5 + 0.5) * h
          this.v.copy(uv.root.position)
          this.v.z += rad
          this.v.project(cam)
          const by = (-this.v.y * 0.5 + 0.5) * h
          if (Math.abs(cx / w - 0.5) <= 0.55 && cy > -50 && cy < h + 50) {
            const piloted = (e.s.o ?? -1) >= 0 && e.s.c !== undefined && e.s.c >= 0
            stationLabels.push({ name: nm, sx: cx, sy: Math.max(cy, by) + 18 * z, color: piloted ? PLAYER_COLORS[e.s.c!].hex : '#bfe9ff', pri: 1 })
          }
        }
        continue
      }
      this.v.copy(uv.root.position)
      this.v.y += uv.height + 0.35
      this.v.project(cam)
      if (this.v.z > 1 || Math.abs(this.v.x) > 1.1 || Math.abs(this.v.y) > 1.1) continue
      const sx = (this.v.x * 0.5 + 0.5) * w
      const sy = (-this.v.y * 0.5 + 0.5) * h
      const hp = e.s.hp ?? 0
      const mhp = e.s.mhp ?? 1
      const hot = id === scene.units.selected || id === scene.units.hovered
      const mine = (fl & EntFlag.Mine) !== 0
      // 血條：受傷、選取、自己才顯示
      if (hp < mhp || hot || mine) {
        const bw = Math.max(34, Math.min(70, (def?.radius ?? 0.4) * 80))
        x.fillStyle = 'rgba(0,0,0,0.65)'
        x.fillRect(sx - bw / 2 - 1, sy - 1, bw + 2, 6)
        const k = Math.max(0, Math.min(1, hp / mhp))
        x.fillStyle = k > 0.6 ? '#4ddf8a' : k > 0.3 ? '#ffc23d' : '#ff4a3d'
        x.fillRect(sx - bw / 2, sy, bw * k, 4)
        if (e.s.mmp && e.s.mp !== undefined) {
          x.fillStyle = 'rgba(0,0,0,0.65)'
          x.fillRect(sx - bw / 2 - 1, sy + 5, bw + 2, 4)
          x.fillStyle = '#4a9dff'
          x.fillRect(sx - bw / 2, sy + 6, (bw * e.s.mp) / Math.max(1, e.s.mmp), 2)
        }
      }
      // 名稱：先收集，最後統一做避讓再畫
      const name = e.s.n || (hot ? loc(def?.name) : '')
      if (name && (hot || (e.s.o ?? -1) >= 0)) labels.push({ name, sx, sy: sy - 5, color: e.s.c !== undefined && e.s.c >= 0 ? PLAYER_COLORS[e.s.c].hex : '#cfd8df', pri: hot ? 2 : mine ? 1 : 0 })
      const b = bubbles.get(id)
      if (b) this.bubble(x, sx, sy - 24 * z, b.text, z)
    }
    const placed: { l: number; r: number; t: number; b: number }[] = []
    const pr = this.prompt(scene, world, x, w, h, z, now)
    if (pr) placed.push(pr)
    this.drawLabels(x, labels, placed, z)
    // 站名：字大一點、全部畫（站點彼此距離遠，不做省略）
    x.save()
    x.font = `700 ${Math.round(15 * z)}px "Noto Sans TC", sans-serif`
    x.textAlign = 'center'
    for (const lb of stationLabels) {
      ensureGlyphs(lb.name)
      x.lineWidth = 4
      x.strokeStyle = 'rgba(0,0,0,0.85)'
      x.strokeText(lb.name, lb.sx, lb.sy)
      x.fillStyle = lb.color
      x.fillText(lb.name, lb.sx, lb.sy)
    }
    x.restore()
  }

  /**
   * 名字避讓：懸停／選取的優先、其次自己，其餘依畫面由上到下。
   * 跟已放好的重疊就往上錯開一行（最多兩次）；還是放不下就只畫名字顏色的小點，懸停時才顯示全名。
   */
  private drawLabels(x: CanvasRenderingContext2D, labels: { name: string; sx: number; sy: number; color: string; pri: number }[], placed: { l: number; r: number; t: number; b: number }[], z: number): void {
    const fs = Math.round(13 * z)
    x.font = `600 ${fs}px "Noto Sans TC", sans-serif`
    x.textAlign = 'center'
    labels.sort((a, b) => b.pri - a.pri || a.sy - b.sy)
    const hit = (r: { l: number; r: number; t: number; b: number }) => placed.some((p) => r.l < p.r && r.r > p.l && r.t < p.b && r.b > p.t)
    for (const lb of labels) {
      ensureGlyphs(lb.name)
      const w2 = x.measureText(lb.name).width / 2 + 3
      let rect = null as null | { l: number; r: number; t: number; b: number }
      for (let k = 0; k < 3; k++) {
        const y = lb.sy - k * (fs + 3)
        const r = { l: lb.sx - w2, r: lb.sx + w2, t: y - fs, b: y + 3 }
        if (!hit(r) || lb.pri >= 2) {
          rect = r
          break
        }
      }
      if (!rect) {
        x.fillStyle = lb.color
        x.beginPath()
        x.arc(lb.sx, lb.sy - fs * 0.4, 3 * z, 0, Math.PI * 2)
        x.fill()
        continue
      }
      placed.push(rect)
      const y = rect.b - 3
      x.lineWidth = 3
      x.strokeStyle = 'rgba(0,0,0,0.8)'
      x.strokeText(lb.name, lb.sx, y)
      x.fillStyle = lb.color
      x.fillText(lb.name, lb.sx, y)
    }
  }

  /** 互動提示：自己附近最近的可互動物件（販賣機、設施、地上物品）上方標出名稱與操作 */
  private prompt(scene: GameScene, world: ClientWorld, x: CanvasRenderingContext2D, w: number, h: number, z: number, now: number): { l: number; r: number; t: number; b: number } | null {
    const meId = world.me.control ?? world.me.unit
    const me = meId ? world.ents.get(meId) : undefined
    if (!me || world.me.alive === false) return null
    let best: { id: number; d: number } | null = null
    for (const e of world.ents.values()) {
      if (e.s.z !== me.s.z || e.s.i === meId) continue
      const fl = e.s.fl ?? 0
      if (fl & EntFlag.Corpse) continue
      const vend = typeof e.s.x2?.s === 'string'
      const item = (e.s.d ?? '').startsWith('item:')
      if (!vend && !item && !(fl & EntFlag.Interactable)) continue
      const d = Math.hypot(e.x - me.x, e.y - me.y)
      if (d < 4.5 && (!best || d < best.d)) best = { id: e.s.i, d }
    }
    if (!best) return null
    const e = world.ents.get(best.id)!
    const uv = scene.units.views.get(best.id)
    if (uv) this.v.copy(uv.root.position)
    else this.v.set(e.x, 0, -e.y)
    this.v.y += (uv?.height ?? 1) + 0.45
    this.v.project(scene.camera)
    if (this.v.z > 1 || Math.abs(this.v.x) > 1 || Math.abs(this.v.y) > 1) return null
    const sx = (this.v.x * 0.5 + 0.5) * w
    const sy = (-this.v.y * 0.5 + 0.5) * h
    const d = e.s.d ?? ''
    const item = d.startsWith('item:')
    const name = item ? loc(entDefName(d)) : e.s.n || loc(entDefName(d))
    const panel = typeof e.s.x2?.s === 'string' || PANEL_DEFS.has(d)
    const act = item ? t('prompt.pickup') : panel && best.d < 2.9 ? t('prompt.panelOpen') : d === 'struct.console' ? t('prompt.pilot') : t('prompt.use')
    ensureGlyphs(name + act)
    const pulse = 0.65 + 0.35 * Math.sin(now * 5)
    // 菱形標記
    const r = 6 * z
    x.save()
    x.translate(sx, sy)
    x.globalAlpha = pulse
    x.strokeStyle = '#ffc23d'
    x.lineWidth = 2
    x.beginPath()
    x.moveTo(0, -r)
    x.lineTo(r, 0)
    x.lineTo(0, r)
    x.lineTo(-r, 0)
    x.closePath()
    x.stroke()
    x.globalAlpha = 1
    x.textAlign = 'center'
    // 名稱在上、操作在下（靠近標記）
    x.font = `600 ${Math.round(13 * z)}px "Noto Sans TC", sans-serif`
    x.lineWidth = 4
    x.strokeStyle = 'rgba(0,0,0,0.85)'
    x.strokeText(act, 0, -r - 8 * z)
    x.fillStyle = '#9fe7ff'
    x.fillText(act, 0, -r - 8 * z)
    const aw = x.measureText(act).width
    x.font = `700 ${Math.round(14 * z)}px "Noto Sans TC", sans-serif`
    x.strokeText(name, 0, -r - 25 * z)
    x.fillStyle = '#ffe2a0'
    x.fillText(name, 0, -r - 25 * z)
    const half = Math.max(aw, x.measureText(name).width) / 2 + 4
    x.restore()
    return { l: sx - half, r: sx + half, t: sy - r - 42 * z, b: sy + r }
  }

  private bubble(x: CanvasRenderingContext2D, sx: number, sy: number, text: string, z = 1): void {
    ensureGlyphs(text)
    x.font = `${Math.round(14 * z)}px "Noto Sans TC", sans-serif`
    const t = text.length > 40 ? text.slice(0, 40) + '…' : text
    const tw = x.measureText(t).width
    const pw = tw + 16 * z
    const ph = 24 * z
    x.fillStyle = 'rgba(10,16,22,0.85)'
    x.strokeStyle = 'rgba(159,231,255,0.5)'
    x.lineWidth = 1
    x.beginPath()
    x.roundRect(sx - pw / 2, sy - ph, pw, ph, 4)
    x.fill()
    x.stroke()
    x.fillStyle = '#e8f6ff'
    x.textAlign = 'center'
    x.fillText(t, sx, sy - 7 * z)
  }
}
