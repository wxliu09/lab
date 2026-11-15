// 2D 疊加層：名稱、血條、聊天泡泡、施法進度、目標圈（canvas 繪製，中文字清晰）
import * as THREE from 'three'
import { PLAYER_COLORS } from '../shared/constants'
import { EntFlag } from '../shared/protocol/messages'
import { UNITS, VENDORS } from '../shared/content/registry'
import { roomAt } from '../shared/layout'
import type { ClientWorld } from '../client/world'
import type { GameScene } from './gameScene'
import { loc, sysText, t } from '../ui/i18n'
import '../ui/strings/art3'
import { uiZoom } from '../ui/uiScale'
import { entDefName, localizeName } from '../ui/names'
import { STATION_BY_ID } from '../shared/content/stations/index'
import { meCtx, promptKey } from '../client/interactKind'
import { consoleSpots, type ConsoleSpot } from './moveTargets'

const requested = new Set<string>()
/** 身旁設施的短名稱標籤：同房間、或離自己主單位這麼近（公尺）以內才標 */
export const FAC_LABEL_R = 6

/**
 * 長得一樣的設施（外觀都是販賣機的那幾種、生命再生器）的短名稱字串 key；其他東西回傳 null。
 * 販賣機的外觀 id 是 vendor.<販賣機 id>（定義只在 sim 端註冊，client 查販賣機表）。
 */
export function facLabelKey(d: string): string | null {
  if (d === 'struct.regen') return 'art3.fac.regen'
  if (!d.startsWith('vendor.')) return null
  const v = VENDORS.get(d.slice(7))
  return v && v.model === 'vendor' ? 'art3.fac.' + v.id : null
}

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
    /** 單位身體在畫面上的範圍：設施標籤不能蓋住人 */
    const bodies: { l: number; r: number; t: number; b: number }[] = []
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
          // 外觀半徑（模型上的 userData.radius）優先，沒有才用碰撞半徑
          const rad = (uv.model?.root.userData.radius as number | undefined) ?? STATION_BY_ID.get((e.s.d ?? '').slice(8))?.space.radius ?? 3
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
      this.v.copy(uv.root.position).project(cam)
      const footY = (-this.v.y * 0.5 + 0.5) * h
      const half = Math.max(10, (footY - sy) * 0.32)
      bodies.push({ l: sx - half, r: sx + half, t: sy - 14, b: footY + 4 })
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
      // 名稱：先收集，最後統一做避讓再畫。中立單位用灰藍（和腳下光圈、太空小地圖同色），和白色玩家（#eff0f3）分得開
      const name = localizeName(e.s.n) || (hot ? loc(def?.name) : '')
      if (name && (hot || (e.s.o ?? -1) >= 0)) labels.push({ name, sx, sy: sy - 5, color: e.s.c !== undefined && e.s.c >= 0 ? PLAYER_COLORS[e.s.c].hex : '#9fb3c2', pri: hot ? 2 : mine ? 1 : 0 })
      const b = bubbles.get(id)
      if (b) this.bubble(x, sx, sy - 24 * z, b.text, z)
    }
    const placed: { l: number; r: number; t: number; b: number }[] = []
    const pr = this.prompt(scene, world, x, w, h, z, now)
    if (pr) placed.push(pr)
    this.drawLabels(x, labels, placed, z)
    this.facilityLabels(scene, world, x, w, h, z, placed, bodies)
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
    scene.promptHit = null
    const meId = world.me.control ?? world.me.unit
    const me = meId ? world.ents.get(meId) : undefined
    if (!me || world.me.alive === false) return null
    // 雜物箱只對有翻找技能的人標「右鍵 翻找」
    const mc = meCtx(world)
    let best: { id: number; d: number; poi?: ConsoleSpot } | null = null
    for (const e of world.ents.values()) {
      if (e.s.z !== me.s.z || e.s.i === meId) continue
      const fl = e.s.fl ?? 0
      if (fl & EntFlag.Corpse) continue
      const vend = typeof e.s.x2?.s === 'string'
      const item = (e.s.d ?? '').startsWith('item:')
      if (!vend && !item && !(fl & EntFlag.Interactable)) continue
      const d = Math.hypot(e.x - me.x, e.y - me.y)
      // 沒有「使用」可言的東西（瓦礫、雕像、降落場、裝置、損毀的控制台…）不標（interactKind.ts）
      if (d < 4.5 && (!best || d < best.d) && promptKey(e.s, d < 2.9, mc)) best = { id: e.s.i, d }
    }
    // 船艙控制台：sim 不生成實體（只記位置），照版面標，和站點主控台一樣寫「控制台 · 右鍵 走上去駕駛」
    const info = me.s.z === scene.zone ? scene.zones.get(scene.zone) : undefined
    if (info)
      for (const s of consoleSpots(info.layout)) {
        if (s.kind !== 'shipConsole') continue
        const d = Math.hypot(s.x - me.x, s.y - me.y)
        if (d < 4.5 && (!best || d < best.d)) best = { id: 0, d, poi: s }
      }
    if (!best) return null
    const e = best.poi ? undefined : world.ents.get(best.id)!
    const uv = e ? scene.units.views.get(best.id) : undefined
    if (uv) this.v.copy(uv.root.position)
    else if (e) this.v.set(e.x, 0, -e.y)
    else this.v.set(best.poi!.x, 0, -best.poi!.y)
    // 沒有單位視圖的是烘焙在站體裡的固定設施（販賣機約 2 m 高）：標在它頭上
    this.v.y += (uv?.height ?? 2) + 0.45
    this.v.project(scene.camera)
    if (this.v.z > 1 || Math.abs(this.v.x) > 1 || Math.abs(this.v.y) > 1) return null
    const sx = (this.v.x * 0.5 + 0.5) * w
    const sy = (-this.v.y * 0.5 + 0.5) * h
    const d = e ? (e.s.d ?? '') : 'struct.console'
    const item = d.startsWith('item:')
    const name = item ? loc(entDefName(d)) : localizeName(e?.s.n) || loc(entDefName(d))
    const act = t(e ? (promptKey(e.s, best.d < 2.9, mc) ?? 'prompt.use') : 'prompt.pilot')
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
    const rect = { l: sx - half, r: sx + half, t: sy - r - 42 * z, b: sy + r }
    // 點在標籤上＝點到它標的對象（input.ts）：標籤浮在設施上方，底下常常是牆，以前右鍵會走到牆邊
    scene.promptHit = { ...rect, ent: best.id, poi: best.poi }
    return rect
  }

  /**
   * 身旁設施的短名稱（審查 R2：販賣機、維修站、醫療補給、生命再生器長得一樣，分不出哪台是哪台）：
   * 自己主單位同房間、或 FAC_LABEL_R 內的這些設施頭上常駐一個小標籤，樣式同互動提示（琥珀色字、黑邊、小菱形），
   * 但不閃、字小一號。互動提示已經標著的那一台不重複標。跟名字、互動提示重疊就往上錯開一行，
   * 還是會蓋到名字或人的身體就不畫（不擋單位）。
   */
  private facilityLabels(scene: GameScene, world: ClientWorld, x: CanvasRenderingContext2D, w: number, h: number, z: number, placed: { l: number; r: number; t: number; b: number }[], bodies: { l: number; r: number; t: number; b: number }[]): void {
    const me = world.ents.get(world.me.unit ?? 0)
    if (!me || world.me.alive === false || me.s.z !== scene.zone) return
    const info = scene.zones.get(scene.zone)
    if (!info) return
    const room = roomAt(info.layout, me.x, me.y)
    const skip = scene.promptHit?.ent ?? 0
    const list: { key: string; x: number; y: number; d: number }[] = []
    for (const e of world.ents.values()) {
      if (e.s.z !== scene.zone || e.s.i === skip) continue
      const key = facLabelKey(e.s.d ?? '')
      if (!key) continue
      const d = Math.hypot(e.x - me.x, e.y - me.y)
      if (d > FAC_LABEL_R && !(room && roomAt(info.layout, e.x, e.y)?.index === room.index)) continue
      list.push({ key, x: e.x, y: e.y, d })
    }
    if (!list.length) return
    list.sort((a, b) => a.d - b.d)
    const fs = Math.round(12 * z)
    const r = 3.5 * z
    const hit = (q: { l: number; r: number; t: number; b: number }) => placed.some((p) => q.l < p.r && q.r > p.l && q.t < p.b && q.b > p.t) || bodies.some((p) => q.l < p.r && q.r > p.l && q.t < p.b && q.b > p.t)
    x.save()
    x.font = `700 ${fs}px "Noto Sans TC", sans-serif`
    x.textAlign = 'center'
    for (const f of list) {
      // 烘焙在站體裡的設施（販賣機約 2 m 高、再生器矮一點）：標在頂上，跟互動提示同一個高度
      this.v.set(f.x, 2.2, -f.y)
      this.v.project(scene.camera)
      if (this.v.z > 1 || Math.abs(this.v.x) > 1 || Math.abs(this.v.y) > 1) continue
      const sx = (this.v.x * 0.5 + 0.5) * w
      const sy = (-this.v.y * 0.5 + 0.5) * h
      const name = t(f.key)
      ensureGlyphs(name)
      const half = x.measureText(name).width / 2 + 3
      let rect = null as null | { l: number; r: number; t: number; b: number }
      for (let k = 0; k < 2 && !rect; k++) {
        const ty = sy - r - 5 * z - k * (fs + 3)
        const q = { l: sx - half, r: sx + half, t: ty - fs, b: ty + 3 }
        if (!hit(q)) rect = q
      }
      if (!rect) continue
      placed.push(rect)
      const ty = rect.b - 3
      x.globalAlpha = 0.9
      // 小菱形（不閃，跟互動提示的大菱形區分）
      x.strokeStyle = '#ffc23d'
      x.lineWidth = 1.5
      x.beginPath()
      x.moveTo(sx, sy - r)
      x.lineTo(sx + r, sy)
      x.lineTo(sx, sy + r)
      x.lineTo(sx - r, sy)
      x.closePath()
      x.stroke()
      x.lineWidth = 3.5
      x.strokeStyle = 'rgba(0,0,0,0.85)'
      x.strokeText(name, sx, ty)
      x.fillStyle = '#ffe2a0'
      x.fillText(name, sx, ty)
    }
    x.restore()
  }

  private bubble(x: CanvasRenderingContext2D, sx: number, sy: number, raw: string, z = 1): void {
    // AI 的公告發言是系統 key 形式（`@key|k=v`），依目前語言解碼
    const text = sysText(raw)
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
