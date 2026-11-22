// 2D 疊加層：名稱、血條、聊天泡泡、施法進度、目標圈（canvas 繪製，中文字清晰）
import * as THREE from 'three'
import { PLAYER_COLORS } from '../shared/constants'
import { EntFlag, type Command } from '../shared/protocol/messages'
import { UNITS, VENDORS, isZoneObject } from '../shared/content/registry'
import type { UnitDef } from '../shared/content/types'
import { roomAt } from '../shared/layout'
import type { ClientWorld } from '../client/world'
import type { GameScene } from './gameScene'
import { loc, sysText, t } from '../ui/i18n'
import '../ui/strings/art3'
import '../ui/strings/ux6'
import '../ui/strings/cam7'
import { uiZoom } from '../ui/uiScale'
import { entDefName, localizeName } from '../ui/names'
import { STATION_BY_ID } from '../shared/content/stations/index'
import { meCtx, promptKey } from '../client/interactKind'
import { aimAbility, aimSelfKey, cursorWorld, lastInteract, targetMode } from '../client/input'
import { cmdTaps } from '../client/session'
import { hiContrast } from '../client/viewPrefs'
import { DEVOUR, devourable } from '../client/devourInfo'
import { cabinHatch } from '../client/hatch'
import { isMuted } from '../client/mute'
import { panelEntries, pickPanel } from '../client/interactPanels'
import { consoleSpots, WaypointQueue, type ConsoleSpot } from './moveTargets'

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

type Rect = { l: number; r: number; t: number; b: number }

/**
 * 聊天泡泡的位置（審查 R3：泡泡蓋住名字、互動提示、設施標籤）：從單位頭上的預設位置開始，跟已經放好的東西
 * （名字、互動提示、設施標籤、先放好的泡泡）重疊就往上錯開一格（泡泡高＋間距），最多 tries 次；都放不下就用最高的那格
 * （聊天不能不見）。回傳泡泡的矩形（b = 泡泡底邊）。
 */
export function placeBubble(sx: number, bottom: number, w: number, h: number, placed: readonly Rect[], tries = 4, gap = 3): Rect {
  const hit = (q: Rect) => placed.some((p) => q.l < p.r && q.r > p.l && q.t < p.b && q.b > p.t)
  let rect: Rect = { l: sx - w / 2, r: sx + w / 2, t: bottom - h, b: bottom }
  for (let k = 0; k <= tries; k++) {
    const b = bottom - k * (h + gap)
    rect = { l: sx - w / 2, r: sx + w / 2, t: b - h, b }
    if (!hit(rect)) return rect
  }
  return rect
}

/**
 * 聊天泡泡夾在畫面內（第 6 輪審查：站在畫面左緣的人說話，泡泡被切掉一半）：左右各留 pad，太寬就貼左邊；
 * 頂端超出畫面就往下移。回傳平移後的矩形（寬高不變）。
 */
export function clampRect(r: Rect, w: number, h: number, pad = 4): Rect {
  const rw = r.r - r.l
  const rh = r.b - r.t
  let dx = 0
  if (r.r > w - pad) dx = w - pad - r.r
  if (r.l + dx < pad) dx = pad - r.l
  const dy = r.t < pad ? pad - r.t : 0
  const l = r.l + dx
  const t = r.t + dy
  return { l, r: l + rw, t, b: t + rh }
}

/**
 * 畫面上蓋著 overlay 的 HUD 面板（玻璃面板是半透明的，名字、站名直接畫在下面看起來像是畫在面板上面；第 6 輪審查：
 * 「餘燼衛星」壓到「離開控制台 B」按鈕）：overlay 把這些範圍裁掉，世界標籤一律在 HUD 之下。
 */
const HUD_SEL = '.layer .panel, .layer button.unpilot'
/** HUD 範圍多久量一次（秒）：getBoundingClientRect 要排版，不要每幀做 */
const HUD_EVERY = 0.25

/**
 * 頭上要不要畫血條：受傷、選取／懸停、自己的才畫；區域物件（燃燒的地板、毒雲、地雷這類 hazard／不可選的固定物）一律不畫
 * （第 7 輪審查：自己放的燃燒地板頭上掛著一條綠色血條）。
 */
export function hpBarVisible(hp: number, mhp: number, hot: boolean, mine: boolean, def: UnitDef | undefined): boolean {
  return (hp < mhp || hot || mine) && !isZoneObject(def)
}

/** 血條的白色「殘影」段：受傷後先停 GHOST_HOLD 秒，再縮到目前血量（看得出剛剛那一下扣了多少）*/
export interface HpGhost {
  /** 殘影的長度（0..1）*/
  g: number
  /** 上一幀的血量比例 */
  k: number
  /** 最近一次掉血的時間（秒）*/
  at: number
}
export const GHOST_HOLD = 0.4

/** 推進殘影一幀：k = 目前血量比例、now = 秒、dt = 這一幀的秒數；回傳殘影長度。補血時殘影直接跟上（不畫）。純函式（單元測試）*/
export function ghostStep(s: HpGhost, k: number, now: number, dt: number): number {
  // 又挨了一下：重新等（連續受傷時殘影停在受傷前的血量，停手 0.4 秒後才一起縮）
  if (k < s.k - 1e-4) s.at = now
  s.k = k
  if (k >= s.g) s.g = k
  else if (now - s.at >= GHOST_HOLD) {
    // 先快後慢地縮：指數逼近，加一點等速（尾巴不會拖很久）
    const step = Math.max(0.5 * dt, (s.g - k) * (1 - Math.exp(-dt * 6)))
    s.g = Math.max(k, s.g - step)
  }
  return s.g
}

/** 實體的身體半徑（公尺；sim 判定射程時加上它）：站點用太空中的外觀半徑、販賣機的定義只在 sim 端 */
function bodyRadius(d: string | undefined): number {
  const id = d ?? ''
  if (id.startsWith('station.')) return STATION_BY_ID.get(id.slice(8))?.space.radius ?? 3
  return UNITS.get(id)?.radius ?? (id.startsWith('vendor.') ? 0.6 : 0.4)
}

/** 投影到畫面上的地面圈的點數：大圈多一點，才不會看出折角 */
function ringSegs(r: number): number {
  return Math.max(24, Math.min(96, Math.round(20 + r * 8)))
}

/** 虛線樣式（setLineDash 會複製陣列；常數陣列不必每幀配置）*/
const DASH_AIM_OUT = [7, 5]
const DASH_PATH = [1.5, 5]
const DASH_NONE: number[] = []

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
  /** 蓋在 overlay 上的 HUD 面板（CSS px，相對 overlay 左上角）與下次量測的時間（performance.now 秒）*/
  private hud: Rect[] = []
  private hudAt = 0
  /** 各單位血條的殘影（id → 狀態，ghostStep）；定期清掉已經不在快照裡的 */
  private ghosts = new Map<number, HpGhost>()
  private ghostPruneAt = 0
  /** 上一次畫的時間（秒）：殘影的 dt */
  private lastAt = 0
  /** 高對比模式低血量的斜紋（第一次用到才建；沒有 DOM 的測試環境是 null）*/
  private hatch: CanvasPattern | null | undefined
  /** 自己下過的 Shift 佇列（moveTargets.ts）：旁聽送出的指令 */
  readonly waypoints = new WaypointQueue()
  /** 最近一次 draw 的世界（旁聽指令時查自己操控的單位）*/
  private world: ClientWorld | null = null
  /** 查實體目前位置（路徑點跟著移動中的目標）：重複使用同一個物件 */
  private readonly pt = { x: 0, y: 0 }
  private readonly entPos = (id: number): { x: number; y: number } | null => {
    const e = this.world?.ents.get(id)
    if (!e) return null
    this.pt.x = e.x
    this.pt.y = e.y
    return this.pt
  }
  private readonly onCmd = (c: Command): void => {
    const w = this.world
    if (w) this.waypoints.onCmd(c, w.me.control || w.me.unit || 0, w.now())
  }

  constructor(parent: HTMLElement) {
    this.canvas = document.createElement('canvas')
    this.canvas.className = 'view'
    this.canvas.style.pointerEvents = 'none'
    // 插在 3D 畫面正後面、所有 HUD 之前：名字與提示不能畫到面板上面
    const view = parent.querySelector('canvas.view')
    parent.insertBefore(this.canvas, view ? view.nextSibling : parent.firstChild)
    this.ctx = this.canvas.getContext('2d')!
    cmdTaps.push(this.onCmd)
  }

  dispose(): void {
    this.canvas.remove()
    const i = cmdTaps.indexOf(this.onCmd)
    if (i >= 0) cmdTaps.splice(i, 1)
    this.world = null
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
    // HUD 面板蓋住的範圍裁掉：世界標籤（名字、站名、泡泡、提示）都畫在 HUD 之下
    const hud = this.hudRects()
    x.save()
    if (hud.length) {
      x.beginPath()
      x.rect(0, 0, w, h)
      for (const r of hud) x.rect(r.l, r.t, r.r - r.l, r.b - r.t)
      x.clip('evenodd')
    }
    this.world = world
    this.drawWorld(scene, world, x, w, h)
    x.restore()
    // 換 zone／換操控對象的淡入（GameScene.fadeAlpha）：蓋在 3D 畫面與世界標籤上、HUD 之下
    const fa = scene.fadeAlpha()
    if (fa > 0.004) {
      x.globalAlpha = fa
      x.fillStyle = '#030507'
      x.fillRect(0, 0, w, h)
      x.globalAlpha = 1
    }
  }

  /** 量 HUD 面板的範圍（HUD_EVERY 秒一次；測試環境沒有 DOM 時是空的）*/
  private hudRects(): Rect[] {
    const now = performance.now() / 1000
    if (now < this.hudAt) return this.hud
    this.hudAt = now + HUD_EVERY
    const host = this.canvas.parentElement
    if (!host || typeof host.querySelectorAll !== 'function') return (this.hud = [])
    const base = this.canvas.getBoundingClientRect()
    const out: Rect[] = []
    for (const el of host.querySelectorAll(HUD_SEL)) {
      const r = el.getBoundingClientRect()
      if (r.width < 1 || r.height < 1) continue
      out.push({ l: r.left - base.left, r: r.right - base.left, t: r.top - base.top, b: r.bottom - base.top })
    }
    return (this.hud = out)
  }

  private drawWorld(scene: GameScene, world: ClientWorld, x: CanvasRenderingContext2D, w: number, h: number): void {
    const cam = scene.camera
    const now = world.now()
    const dt = Math.min(0.1, Math.max(0, now - this.lastAt))
    this.lastAt = now
    const hc = hiContrast.value
    const z = Math.min(1.6, uiZoom.value)
    if (now > this.ghostPruneAt) {
      this.ghostPruneAt = now + 2
      for (const id of this.ghosts.keys()) if (!world.ents.has(id)) this.ghosts.delete(id)
    }
    const labels: { name: string; sx: number; sy: number; color: string; pri: number }[] = []
    const stationLabels: { name: string; sx: number; sy: number; color: string; pri: number; ent: number }[] = []
    scene.stationHits = []
    /** 單位身體在畫面上的範圍：設施標籤不能蓋住人 */
    const bodies: { l: number; r: number; t: number; b: number }[] = []
    const bubbles = new Map<number, { text: string; color: number }>()
    world.bubbles = world.bubbles.filter((b) => b.until > now)
    // 本機封鎖的人（client/mute.ts）的泡泡不畫
    for (const b of world.bubbles) if (!isMuted(b.from)) bubbles.set(b.e, b)
    /** 聊天泡泡最後才畫：要避開名字、互動提示、設施標籤 */
    const pendingBubbles: { sx: number; bottom: number; text: string }[] = []
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
            stationLabels.push({ name: nm, sx: cx, sy: Math.max(cy, by) + 18 * z, color: piloted ? PLAYER_COLORS[e.s.c!].hex : '#bfe9ff', pri: 1, ent: id })
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
      // 血條：受傷、選取、自己才顯示（區域物件不畫，見 hpBarVisible）。殘影每個看得到的單位都推進（滿血時也記著，
      // 第一下受傷才有殘影可畫）
      if (!isZoneObject(def)) {
        const k = Math.max(0, Math.min(1, hp / Math.max(1, mhp)))
        let gh = this.ghosts.get(id)
        if (!gh) this.ghosts.set(id, (gh = { g: k, k, at: -1e9 }))
        const g = ghostStep(gh, k, now, dt)
        if (hpBarVisible(hp, mhp, hot, mine, def)) {
          const bw = Math.max(34, Math.min(70, (def?.radius ?? 0.4) * 80))
          this.hpBar(x, sx, sy, bw, k, g, hc)
          if (e.s.mmp && e.s.mp !== undefined) {
            x.fillStyle = 'rgba(0,0,0,0.65)'
            x.fillRect(sx - bw / 2 - 1, sy + 5, bw + 2, 4)
            x.fillStyle = '#4a9dff'
            x.fillRect(sx - bw / 2, sy + 6, (bw * e.s.mp) / Math.max(1, e.s.mmp), 2)
          }
        }
      }
      // 名稱：先收集，最後統一做避讓再畫。中立單位用灰藍（和腳下光圈、太空小地圖同色），和白色玩家（#eff0f3）分得開
      const name = localizeName(e.s.n) || (hot ? loc(def?.name) : '')
      if (name && (hot || (e.s.o ?? -1) >= 0)) labels.push({ name, sx, sy: sy - 5, color: e.s.c !== undefined && e.s.c >= 0 ? PLAYER_COLORS[e.s.c].hex : '#9fb3c2', pri: hot ? 2 : mine ? 1 : 0 })
      const b = bubbles.get(id)
      if (b) pendingBubbles.push({ sx, bottom: sy - 24 * z, text: b.text })
    }
    const placed: { l: number; r: number; t: number; b: number }[] = []
    // 地面上的標記最先畫（名字、提示蓋在上面）：Shift 佇列的路徑、技能射程／效果範圍、吞噬目標的閃爍圈
    this.waypointPath(scene, world, x, w, h, z)
    this.aimPreview(scene, world, x, w, h, z, now)
    this.devourMarks(scene, world, x, w, h, z, now)
    const pr = this.prompt(scene, world, x, w, h, z, now)
    if (pr) placed.push(pr)
    const sh = this.selfAimHint(scene, world, x, w, h, z)
    if (sh) placed.push(sh)
    this.drawLabels(x, labels, placed, z)
    const hl = this.hatchLabel(scene, world, x, w, h, z, now, placed)
    if (hl) placed.push(hl)
    this.facilityLabels(scene, world, x, w, h, z, placed, bodies)
    // 聊天泡泡：由下往上（畫面下方的先放），重疊就往上錯開；夾在畫面內
    pendingBubbles.sort((a, b) => b.bottom - a.bottom)
    for (const pb of pendingBubbles) placed.push(this.bubble(x, pb.sx, pb.bottom, pb.text, z, placed, w, h))
    // 站名：字大一點、全部畫（站點彼此距離遠，不做省略）
    x.save()
    x.font = `700 ${Math.round(15 * z)}px "Noto Sans TC", sans-serif`
    x.textAlign = 'center'
    for (const lb of stationLabels) {
      ensureGlyphs(lb.name)
      // 點在站名上＝點到那座站（input.ts labelAt）：範圍上下各多留幾 px
      const hw = x.measureText(lb.name).width / 2 + 6
      const fs = 15 * z
      scene.stationHits.push({ l: lb.sx - hw, r: lb.sx + hw, t: lb.sy - fs - 4, b: lb.sy + 6, ent: lb.ent })
      // 游標下（或瞄準中點下去會選到）的那座站：站名加框，看得出點下去是哪一座（停靠、設定航線、右鍵飛過去）
      if (lb.ent === scene.units.hovered) {
        x.lineWidth = 1.5
        x.strokeStyle = targetMode.value ? '#b28cff' : '#ffc23d'
        x.fillStyle = 'rgba(8,12,18,0.6)'
        x.beginPath()
        x.roundRect(lb.sx - hw, lb.sy - fs - 4, hw * 2, fs + 10, 4)
        x.fill()
        x.stroke()
      }
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
    // 右側互動面板正顯示的那一台（範圍內有好幾台時玩家右鍵或點分頁選的）：提示標它，不要標最近的另一台卻寫「面板已在右側開啟」
    const pick = pickPanel(panelEntries(me, world.ents, world.me.fac), lastInteract.value)
    if (pick && world.ents.has(pick.id)) best = { id: pick.id, d: pick.dist }
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
   * 一條血條（左緣 sx − bw/2、上緣 sy、高 4 px）：深色底、白色殘影段（g > k 的部分）、依血量變色的填色。
   * 高對比（設定頁）：不只靠顏色分辨 — 每 25% 一道刻痕、血量 ≤ 30% 時填色加斜紋、外圍一圈亮邊。
   */
  private hpBar(x: CanvasRenderingContext2D, sx: number, sy: number, bw: number, k: number, g: number, hc: boolean): void {
    const l = sx - bw / 2
    x.fillStyle = 'rgba(0,0,0,0.65)'
    x.fillRect(l - 1, sy - 1, bw + 2, 6)
    if (g > k + 0.002) {
      x.fillStyle = 'rgba(255,255,255,0.9)'
      x.fillRect(l + bw * k, sy, bw * (g - k), 4)
    }
    x.fillStyle = k > 0.6 ? '#4ddf8a' : k > 0.3 ? '#ffc23d' : '#ff4a3d'
    x.fillRect(l, sy, bw * k, 4)
    if (!hc) return
    if (k <= 0.3) {
      const hatch = this.hatchPattern(x)
      if (hatch) {
        x.fillStyle = hatch
        x.fillRect(l, sy, bw * k, 4)
      }
    }
    x.fillStyle = 'rgba(0,0,0,0.85)'
    for (let i = 1; i < 4; i++) x.fillRect(Math.round(l + (bw * i) / 4), sy - 1, 1, 6)
    x.strokeStyle = 'rgba(255,255,255,0.75)'
    x.lineWidth = 1
    x.strokeRect(l - 1.5, sy - 1.5, bw + 3, 7)
  }

  /** 高對比低血量的斜紋（6×6 px 一格，第一次用到才建）*/
  private hatchPattern(x: CanvasRenderingContext2D): CanvasPattern | null {
    if (this.hatch !== undefined) return this.hatch
    this.hatch = null
    try {
      const c = document.createElement('canvas')
      c.width = c.height = 6
      const g = c.getContext('2d')
      if (g) {
        g.strokeStyle = 'rgba(0,0,0,0.75)'
        g.lineWidth = 1.5
        g.beginPath()
        g.moveTo(-1, 7)
        g.lineTo(7, -1)
        g.moveTo(-1, 1)
        g.lineTo(1, -1)
        g.moveTo(5, 7)
        g.lineTo(7, 5)
        g.stroke()
        this.hatch = x.createPattern(c, 'repeat')
      }
    } catch {
      this.hatch = null
    }
    return this.hatch
  }

  /**
   * 地面上的一個圈（three 世界座標中心 cx／cz、半徑 r 公尺、離地 y）投影到畫面、建成路徑（不描邊）。
   * 落在鏡頭後面的點抬筆跳過（大射程圈的一部分可能在鏡頭後方）。回傳畫了幾個點（0 = 整圈都看不到）。
   */
  private ringPath(x: CanvasRenderingContext2D, cam: THREE.Camera, cx: number, cz: number, r: number, w: number, h: number, y = 0.05): number {
    const n = ringSegs(r)
    let drawn = 0
    let pen = false
    x.beginPath()
    for (let k = 0; k <= n; k++) {
      const a = (k / n) * Math.PI * 2
      this.v.set(cx + Math.cos(a) * r, y, cz + Math.sin(a) * r).project(cam)
      if (this.v.z > 1) {
        pen = false
        continue
      }
      const px = (this.v.x * 0.5 + 0.5) * w
      const py = (-this.v.y * 0.5 + 0.5) * h
      if (pen) x.lineTo(px, py)
      else x.moveTo(px, py)
      pen = true
      drawn++
    }
    if (drawn === n + 1) x.closePath()
    return drawn
  }

  /** 地面上一點投影到畫面（寫進 this.v 的 x／y = 畫面 px）；在鏡頭後面回傳 false */
  private groundPx(cam: THREE.Camera, gx: number, gz: number, w: number, h: number, y = 0.05): boolean {
    this.v.set(gx, y, gz).project(cam)
    if (this.v.z > 1) return false
    this.v.x = (this.v.x * 0.5 + 0.5) * w
    this.v.y = (-this.v.y * 0.5 + 0.5) * h
    return true
  }

  /**
   * 技能／道具的瞄準預覽（第 7 輪審查：TargetMode 帶了 aoe／range，畫面上卻什麼都沒有）：
   * - 射程圈：施法者（自己操控的單位）腳下，半徑 = 射程 + 身體半徑（sim abilities.ts inRange 的判定），細青線、微光暈、刻度。
   * - 效果範圍圈：對單位的技能吸附到瞄準預覽選到的目標（units.hovered），否則在游標下的地面；淡紫填色、亮邊、中心十字。
   * - 超出射程：效果圈轉灰、走動的虛線，並從射程圈拉一條灰色虛線到目標（下令之後會先走過去），下方標「超出射程」。
   * 只用 client 本來就看得到的東西（自己的單位、游標、快照裡的目標），跨 zone 的技能（anyZone）不畫射程。
   */
  private aimPreview(scene: GameScene, world: ClientWorld, x: CanvasRenderingContext2D, w: number, h: number, z: number, now: number): void {
    const tm = targetMode.value
    if (!tm || tm.kind === 'attack') return
    const range = tm.range ?? 0
    const aoe = tm.aoe ?? 0
    if (range <= 0 && aoe <= 0) return
    const cam = scene.camera
    const anyZone = !!aimAbility(tm)?.filter?.anyZone
    const cid = world.me.control || world.me.unit || 0
    const ce = cid ? world.ents.get(cid) : undefined
    const here = !!ce && ce.s.z === scene.zone && world.me.alive !== false
    const cuv = here ? scene.units.views.get(cid) : undefined
    const cx = cuv ? cuv.root.position.x : (ce?.x ?? 0)
    const cz = cuv ? cuv.root.position.z : -(ce?.y ?? 0)
    const reach = range + (here ? bodyRadius(ce!.s.d) : 0)
    // 效果中心：對單位的技能吸附到瞄準預覽的目標，否則游標下的地面
    let ax = 0
    let az = 0
    let ar = 0
    let has = false
    const hv = tm.target === 'unit' || tm.target === 'unitOrPoint' ? scene.units.hovered : 0
    const he = hv ? world.ents.get(hv) : undefined
    if (he && he.s.z === scene.zone) {
      const uv = scene.units.views.get(hv)
      ax = uv ? uv.root.position.x : he.x
      az = uv ? uv.root.position.z : -he.y
      ar = bodyRadius(he.s.d)
      has = true
    } else {
      const cw = cursorWorld.value
      if (cw) {
        ax = cw.x
        az = -cw.y
        has = true
      }
    }
    const measured = here && range > 0 && !anyZone
    const out = measured && has && Math.hypot(ax - cx, az - cz) > reach + ar + 0.05
    x.save()
    x.lineCap = 'round'
    x.lineJoin = 'round'
    if (measured && this.ringPath(x, cam, cx, cz, reach, w, h)) {
      x.globalAlpha = 0.16
      x.lineWidth = 5 * z
      x.strokeStyle = '#7fd8ff'
      x.stroke()
      x.globalAlpha = out ? 0.85 : 0.6
      x.lineWidth = 1.3 * z
      x.strokeStyle = '#a8ecff'
      x.stroke()
      // 刻度：16 道往內的短線（戰術疊加層的質感，也看得出圈的尺寸）
      const tk = Math.min(0.35, reach * 0.08)
      x.globalAlpha = 0.5
      x.lineWidth = 1 * z
      x.beginPath()
      for (let i = 0; i < 16; i++) {
        const a = (i / 16) * Math.PI * 2
        const c = Math.cos(a)
        const sn = Math.sin(a)
        if (!this.groundPx(cam, cx + c * reach, cz + sn * reach, w, h)) continue
        x.moveTo(this.v.x, this.v.y)
        if (this.groundPx(cam, cx + c * (reach - tk), cz + sn * (reach - tk), w, h)) x.lineTo(this.v.x, this.v.y)
      }
      x.stroke()
    }
    if (has && out) {
      // 從射程圈邊緣拉到目標的灰色虛線：下令之後會先走過去
      const d = Math.hypot(ax - cx, az - cz) || 1
      const ex = cx + ((ax - cx) / d) * reach
      const ez = cz + ((az - cz) / d) * reach
      if (this.groundPx(cam, ex, ez, w, h)) {
        const x0 = this.v.x
        const y0 = this.v.y
        if (this.groundPx(cam, ax, az, w, h)) {
          x.globalAlpha = 0.7
          x.setLineDash(DASH_AIM_OUT)
          x.lineDashOffset = -now * 14
          x.lineWidth = 1.2 * z
          x.strokeStyle = '#aab4be'
          x.beginPath()
          x.moveTo(x0, y0)
          x.lineTo(this.v.x, this.v.y)
          x.stroke()
          x.setLineDash(DASH_NONE)
        }
      }
    }
    if (has && aoe > 0 && this.ringPath(x, cam, ax, az, aoe, w, h)) {
      const pulse = 0.5 + 0.5 * Math.sin(now * 4)
      x.globalAlpha = out ? 0.05 : 0.08 + 0.04 * pulse
      x.fillStyle = out ? '#9aa4ae' : '#b28cff'
      x.fill()
      x.globalAlpha = 0.2
      x.lineWidth = 6 * z
      x.strokeStyle = out ? '#6a7480' : '#9b6bff'
      x.stroke()
      x.globalAlpha = 0.95
      x.lineWidth = 1.6 * z
      x.strokeStyle = out ? '#b9c2cb' : '#ddccff'
      if (out) {
        x.setLineDash(DASH_AIM_OUT)
        x.lineDashOffset = -now * 14
      }
      x.stroke()
      x.setLineDash(DASH_NONE)
    }
    if (has && (aoe > 0 || out) && this.groundPx(cam, ax, az, w, h)) {
      // 中心十字
      const px = this.v.x
      const py = this.v.y
      const c = 4 * z
      x.globalAlpha = 0.9
      x.lineWidth = 1.3 * z
      x.strokeStyle = out ? '#b9c2cb' : '#ddccff'
      x.beginPath()
      x.moveTo(px - c, py)
      x.lineTo(px + c, py)
      x.moveTo(px, py - c * 0.7)
      x.lineTo(px, py + c * 0.7)
      x.stroke()
      if (out && this.groundPx(cam, ax, az + Math.max(aoe, ar, 0.4), w, h)) {
        const label = t('cam7.aim.out')
        ensureGlyphs(label)
        x.globalAlpha = 1
        x.font = `600 ${Math.round(12 * z)}px "Noto Sans TC", sans-serif`
        x.textAlign = 'center'
        x.lineWidth = 3.5
        x.strokeStyle = 'rgba(0,0,0,0.85)'
        const ly = this.v.y + 14 * z
        x.strokeText(label, this.v.x, ly)
        x.fillStyle = '#c9d2da'
        x.fillText(label, this.v.x, ly)
      }
    }
    x.restore()
  }

  /**
   * 自己下過的 Shift 佇列（moveTargets.ts WaypointQueue，client 端推測、不加快照欄位）：選取中的是自己操控的單位（或沒選）時，
   * 從腳下經過每個排隊的點畫一條細點線，點上畫小菱形；移動青色、攻擊移動橘紅、施法紫、互動琥珀。
   */
  private waypointPath(scene: GameScene, world: ClientWorld, x: CanvasRenderingContext2D, w: number, h: number, z: number): void {
    const q = this.waypoints
    const cid = world.me.control || world.me.unit || 0
    const ce = cid ? world.ents.get(cid) : undefined
    if (!ce) {
      if (q.pts.length) q.clear()
      return
    }
    q.update(cid, ce.x, ce.y, (ce.s.st ?? 0) === 0, world.now(), this.entPos)
    if (!q.visible() || ce.s.z !== scene.zone || world.me.alive === false) return
    const sel = scene.units.selected
    if (sel && sel !== cid) return
    const cam = scene.camera
    const uv = scene.units.views.get(cid)
    if (!this.groundPx(cam, uv ? uv.root.position.x : ce.x, uv ? uv.root.position.z : -ce.y, w, h)) return
    let px = this.v.x
    let py = this.v.y
    x.save()
    x.lineCap = 'round'
    x.setLineDash(DASH_PATH)
    x.lineWidth = 1.8 * z
    const r = 3.5 * z
    for (const p of q.pts) {
      const at = p.e ? this.entPos(p.e) : p
      if (!at || !this.groundPx(cam, at.x, -at.y, w, h)) continue
      const col = p.kind === 'amove' ? '#ff8a6a' : p.kind === 'cast' ? '#c9a8ff' : p.kind === 'act' ? '#ffc23d' : '#8fe3ff'
      x.globalAlpha = 0.75
      x.strokeStyle = col
      x.beginPath()
      x.moveTo(px, py)
      x.lineTo(this.v.x, this.v.y)
      x.stroke()
      px = this.v.x
      py = this.v.y
      x.setLineDash(DASH_NONE)
      x.globalAlpha = 0.95
      x.fillStyle = 'rgba(0,0,0,0.55)'
      x.beginPath()
      x.moveTo(px, py - r - 1.5)
      x.lineTo(px + r + 1.5, py)
      x.lineTo(px, py + r + 1.5)
      x.lineTo(px - r - 1.5, py)
      x.closePath()
      x.fill()
      x.fillStyle = col
      x.beginPath()
      x.moveTo(px, py - r)
      x.lineTo(px + r, py)
      x.lineTo(px, py + r)
      x.lineTo(px - r, py)
      x.closePath()
      x.fill()
      x.setLineDash(DASH_PATH)
    }
    x.restore()
  }

  /**
   * 吞噬瞄準（第 6 輪審查：深藍小團在藍色地板上看不見）：畫面裡每個吞得下的目標，腳下畫一個閃爍的地面圈（照透視投影成橢圓）；
   * 點下去會選到的那一個（input.ts 的瞄準預覽 = units.hovered）圈畫粗、亮，旁邊標 EP。
   * 只標快照裡看得到的實體（本來就在視野內），吞不吞得下只看外觀 id（devourInfo.ts devourable）。
   */
  private devourMarks(scene: GameScene, world: ClientWorld, x: CanvasRenderingContext2D, w: number, h: number, z: number, now: number): void {
    const tm = targetMode.value
    if (!tm || tm.kind !== 'ability' || tm.id !== DEVOUR) return
    const pick = scene.units.hovered
    const cam = scene.camera
    const pulse = 0.5 + 0.5 * Math.sin(now * 6)
    x.save()
    for (const e of world.ents.values()) {
      if (e.s.z !== scene.zone || !devourable(e.s)) continue
      const uv = scene.units.views.get(e.s.i)
      const cx = uv ? uv.root.position.x : e.x
      const cz = uv ? uv.root.position.z : -e.y
      const hot = e.s.i === pick
      const r = (UNITS.get(e.s.d ?? '')?.radius ?? 0.35) + (hot ? 0.35 : 0.25) + pulse * 0.12
      // 地面圈投影到畫面
      if (!this.ringPath(x, cam, cx, cz, r, w, h)) continue
      // 先畫深色外框再畫亮色：在亮地板、暗地板上都看得到
      x.globalAlpha = hot ? 0.95 : 0.55 + 0.4 * pulse
      x.lineWidth = (hot ? 6 : 4.5) * z
      x.strokeStyle = 'rgba(0,0,0,0.75)'
      x.stroke()
      x.lineWidth = (hot ? 3 : 2) * z
      x.strokeStyle = hot ? '#d8ff7a' : '#9dff6a'
      x.stroke()
      if (hot) {
        const n = UNITS.get(e.s.d ?? '')?.devourEp ?? 0
        this.v.set(cx + r, 0.05, cz).project(cam)
        const lx = (this.v.x * 0.5 + 0.5) * w + 6 * z
        const ly = (-this.v.y * 0.5 + 0.5) * h
        const label = t('ux6.devour.ep', { n })
        x.globalAlpha = 1
        x.font = `700 ${Math.round(13 * z)}px "Noto Sans TC", sans-serif`
        x.textAlign = 'left'
        x.lineWidth = 4
        x.strokeStyle = 'rgba(0,0,0,0.85)'
        x.strokeText(label, lx, ly)
        x.fillStyle = '#d8ff7a'
        x.fillText(label, lx, ly)
      }
    }
    x.restore()
  }

  /**
   * 瞄準可以對自己放的技能／道具（抽血、慰藉護盾、投影分身）時，自己腳下標「再按 3：對自己」（input.ts selfCast 的捷徑）。
   * 標在腳下：頭上已經有名字、血條、互動提示，擠在一起看不清楚。回傳標籤的範圍（泡泡要避開）。
   */
  private selfAimHint(scene: GameScene, world: ClientWorld, x: CanvasRenderingContext2D, w: number, h: number, z: number): Rect | null {
    const k = aimSelfKey(targetMode.value)
    if (!k) return null
    const id = world.me.control || world.me.unit || 0
    const uv = scene.units.views.get(id)
    if (!uv) return null
    this.v.copy(uv.root.position)
    this.v.project(scene.camera)
    if (this.v.z > 1 || Math.abs(this.v.x) > 1 || Math.abs(this.v.y) > 1) return null
    const sx = (this.v.x * 0.5 + 0.5) * w
    const sy = (-this.v.y * 0.5 + 0.5) * h + 30 * z
    const text = t('ux6.aim.self', { k })
    ensureGlyphs(text)
    x.save()
    x.font = `600 ${Math.round(13 * z)}px "Noto Sans TC", sans-serif`
    x.textAlign = 'center'
    const pw = x.measureText(text).width + 14 * z
    const ph = 20 * z
    const r = clampRect({ l: sx - pw / 2, r: sx + pw / 2, t: sy - ph, b: sy }, w, h)
    x.fillStyle = 'rgba(20,10,34,0.85)'
    x.strokeStyle = 'rgba(178,140,255,0.85)'
    x.lineWidth = 1
    x.beginPath()
    x.roundRect(r.l, r.t, pw, ph, 4)
    x.fill()
    x.stroke()
    x.fillStyle = '#e3d6ff'
    x.fillText(text, (r.l + r.r) / 2, r.b - 6 * z)
    x.restore()
    return r
  }

  /**
   * 船艙艙門的標籤（第 6 輪審查：停靠後艙門沒有標示）：自己站在船艙裡（沒在駕駛）時，在艙門上方標「艙門 · 走過去下船」；
   * 停靠中閃爍、在太空中寫「停靠後才能下船」（client/hatch.ts 從太空層推斷）。點在標籤上＝點到艙門（scene.hatchHit）。
   */
  private hatchLabel(scene: GameScene, world: ClientWorld, x: CanvasRenderingContext2D, w: number, h: number, z: number, now: number, placed: readonly Rect[]): Rect | null {
    scene.hatchHit = null
    const hc = cabinHatch(world, scene.zones)
    if (!hc || hc.zone !== scene.zone) return null
    this.v.set(hc.x, 1.4, -hc.y).project(scene.camera)
    if (this.v.z > 1 || Math.abs(this.v.x) > 1 || Math.abs(this.v.y) > 1) return null
    const sx = (this.v.x * 0.5 + 0.5) * w
    let sy = (-this.v.y * 0.5 + 0.5) * h
    const text = t(hc.docked === true ? 'ux6.hatch.docked' : hc.docked === false ? 'ux6.hatch.flying' : 'ux6.hatch.any')
    ensureGlyphs(text)
    const r = 6 * z
    const fs = Math.round(13 * z)
    x.save()
    x.font = `700 ${fs}px "Noto Sans TC", sans-serif`
    x.textAlign = 'center'
    const half = x.measureText(text).width / 2 + 4
    // 跟互動提示、名字重疊就往上錯開一行
    const hit = (q: Rect) => placed.some((p) => q.l < p.r && q.r > p.l && q.t < p.b && q.b > p.t)
    for (let k = 0; k < 2 && hit({ l: sx - half, r: sx + half, t: sy - r - fs - 8 * z, b: sy + r }); k++) sy -= fs + 6
    const live = hc.docked !== false
    const pulse = live ? 0.65 + 0.35 * Math.sin(now * 5) : 0.6
    // 菱形標記（同互動提示）：停靠中閃爍
    x.globalAlpha = pulse
    x.strokeStyle = '#ffc23d'
    x.lineWidth = 2
    x.beginPath()
    x.moveTo(sx, sy - r)
    x.lineTo(sx + r, sy)
    x.lineTo(sx, sy + r)
    x.lineTo(sx - r, sy)
    x.closePath()
    x.stroke()
    x.globalAlpha = live ? 1 : 0.8
    x.lineWidth = 4
    x.strokeStyle = 'rgba(0,0,0,0.85)'
    const ty = sy - r - 8 * z
    x.strokeText(text, sx, ty)
    x.fillStyle = live ? '#ffe2a0' : '#b9c4cf'
    x.fillText(text, sx, ty)
    x.restore()
    const rect = { l: sx - half, r: sx + half, t: ty - fs - 2, b: sy + r }
    scene.hatchHit = { ...rect, x: hc.x, y: hc.y }
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

  /** 畫一個聊天泡泡（底邊預設在 bottom，跟 placed 重疊就往上錯開，見 placeBubble；夾在畫面內，見 clampRect）；回傳實際的矩形 */
  private bubble(x: CanvasRenderingContext2D, sx: number, bottom: number, raw: string, z = 1, placed: readonly Rect[] = [], vw = Infinity, vh = Infinity): Rect {
    // AI 的公告發言是系統 key 形式（`@key|k=v`），依目前語言解碼
    const text = sysText(raw)
    ensureGlyphs(text)
    x.font = `${Math.round(14 * z)}px "Noto Sans TC", sans-serif`
    const t = text.length > 40 ? text.slice(0, 40) + '…' : text
    const tw = x.measureText(t).width
    const pw = tw + 16 * z
    const ph = 24 * z
    const r = clampRect(placeBubble(sx, bottom, pw, ph, placed, 4, 3 * z), vw, vh)
    const cx = (r.l + r.r) / 2
    x.fillStyle = 'rgba(10,16,22,0.85)'
    x.strokeStyle = 'rgba(159,231,255,0.5)'
    x.lineWidth = 1
    x.beginPath()
    x.roundRect(r.l, r.t, pw, ph, 4)
    x.fill()
    x.stroke()
    x.fillStyle = '#e8f6ff'
    x.textAlign = 'center'
    x.fillText(t, cx, r.b - 7 * z)
    return r
  }
}
