// 輸入：致敬 WC3 的操作（右鍵移動／攻擊／互動、A 攻擊、S 停止、H 原地、QWERDF 技能、1–6 背包、空白鍵回鏡頭）
import { effect, signal } from '@preact/signals'
import { Vector3 } from 'three'
import { edgeScrollOn, edgeSpeed } from './controlPrefs'
import { audioPrefs, setAudioPref } from '../audio/sfx'
import { UNITS, abilityDef, itemDef } from '../shared/content/registry'
import type { TargetFilter } from '../shared/content/types'
import { STATION_BY_ID } from '../shared/content/stations/index'
import type { SnapEntity } from '../shared/protocol/messages'
import type { GameScene } from '../render/gameScene'
import { CONSOLE_KINDS, CONSOLE_LOCK_PAD, CONSOLE_R, DEFAULT_BODY_R, consoleApproach, consoleSpots, reachFrom, type Pt } from '../render/moveTargets'
import { entDefName } from '../ui/names'
import { loc, t } from '../ui/i18n'
import { showCursorTip } from '../ui/tooltip'
import { cmdTaps, hostGone, sendCmd, snapTick, world } from './session'
import { EXPOSING_ABILITIES, canShapeshift, looksNamed, watcherCount } from './exposure'
import { giveRefusal } from './give'
import { meCtx, rightClickAction, rummageClick } from './interactKind'
import { SNAP_M, SNAP_MIN_PX, SNAP_MIN_PX_SPACE, SNAP_M_DEVOUR, SNAP_M_SPACE, chooseUnitTarget, isStructureLike, mapPickTarget, segDist, targetOk, wantsStructure, type SnapCand } from './targetSnap'
import { DEVOUR, devourable } from './devourInfo'
import { sweepPeek } from './sweepPeek'
import { cabinHatch } from './hatch'
import '../ui/strings/ux6'

export type TargetMode =
  | null
  | { kind: 'attack' }
  | { kind: 'ability'; id: string; target: string; aoe?: number; range?: number }
  | { kind: 'item'; slot: number; ability: string; target: string; aoe?: number; range?: number }

export const targetMode = signal<TargetMode>(null)
export const selected = signal(0)
export const chatOpen = signal(false)
export const cursorWorld = signal<{ x: number; y: number } | null>(null)
/** 游標的螢幕座標（場景懸停說明用）*/
export const cursorScreen = { x: 0, y: 0, overView: false }
export const evolveOpen = signal(false)
/** 遊戲選單（Esc）：繼續、說明、圖鑑、設定、離開對局 */
export const menuOpen = signal(false)
/** 本機提示（不經網路，例如「再按一次脫下防護服」）：Announce 會顯示。text = 字串 key（args = 代入的參數）；life = 顯示毫秒（不給就依字數，Announce.tsx noticeLife）*/
export const localNotice = signal<{ text: string; at: number; life?: number; args?: Record<string, string | number> } | null>(null)
/**
 * 最後一次互動的對象（右鍵、互動指令、或點互動面板上方的分頁）：範圍內有好幾台販賣機／設施時，面板優先顯示這台
 * （client/interactPanels.ts）
 */
export const lastInteract = signal(0)

let exposeAt = 0
/**
 * 變身被看到就曝光（exposure.ts）：視野裡有其他人形單位時跳一次本機提示。key = 提示字串；
 * 連按時 1.5 秒內只提示一次。回傳是否提示了。
 */
export function exposeWarn(key: string): boolean {
  const n = watcherCount(world)
  if (n <= 0) return false
  const now = performance.now()
  if (now - exposeAt < 1500) return false
  exposeAt = now
  localNotice.value = { text: key, args: { n }, at: now }
  return true
}

export const HOTKEYS = ['KeyQ', 'KeyW', 'KeyE', 'KeyR', 'KeyD', 'KeyF']

/**
 * 各個對話框登記「我現在開著嗎」（避免 client → ui 的循環 import）：
 * 開著時不做邊緣捲動、不顯示場景懸停，遊戲快捷鍵也不處理（免得在設定、圖鑑裡按 Q／1 就放技能、用道具）。
 */
export const modalChecks: (() => boolean)[] = [() => evolveOpen.value, () => menuOpen.value, () => hostGone.value]
/** 不擋快捷鍵的側邊面板（調查筆記：邊看邊操作）：開著時只停用邊緣捲動與場景懸停 */
export const panelChecks: (() => boolean)[] = []
/** 開著時仍可按 Enter 聊天的對話框（結算畫面：賽後聊天）；要和 modalChecks 登記同一個函式 */
export const chatPassChecks: (() => boolean)[] = []
/** 開著時仍可按 M 靜音的對話框（結算、出局畫面）；要和 modalChecks 登記同一個函式 */
export const mutePassChecks: (() => boolean)[] = []

/** 目前開著的對話框都在 pass 名單裡（至少開著一個）*/
function onlyPass(pass: (() => boolean)[]): boolean {
  return modalChecks.every((f) => !f() || pass.includes(f))
}

/** 有對話框開著：遊戲快捷鍵不處理 */
export function dialogOpen(): boolean {
  return modalChecks.some((f) => f())
}

/** 有對話框或側邊面板開著：不做邊緣捲動、不顯示場景懸停 */
export function modalOpen(): boolean {
  return dialogOpen() || panelChecks.some((f) => f())
}

/**
 * 正在駕駛站點／船艇／防禦無人機（指令送給載具，不是自己的角色），可以用 unpilot 離開。
 * 逃生艙、變種人化蟲、重力校正指揮點等也會換操控對象，但不能「離開控制台」，不算。
 */
export function isPiloting(): boolean {
  const c = world.me.control
  if (!c || !world.me.unit || c === world.me.unit || world.me.alive === false) return false
  const d = world.ents.get(c)?.s.d ?? ''
  return d.startsWith('station.') || (d.startsWith('ship.') && d !== 'ship.pod') || d === 'npc.defenseDrone'
}

/**
 * Alt＋左鍵發小地圖信號（client/mapPing.ts 註冊）：mapPing 要 import input（本機提示），反過來由它登記，避免循環 import。
 * 回傳是否處理了這一下（處理了就不再當成選取或瞄準）。
 */
export const altClick: { ping: ((zone: number, x: number, y: number, bounds: { w: number; h: number } | null) => boolean) | null } = { ping: null }

/** 以目前的自己判斷這個實體能不能收下拖過來的道具（見 give.ts 的 giveRefusal）*/
export function giveRefusalHere(s: SnapEntity | undefined): string | null {
  const ctl = world.me.control || world.me.unit
  return giveRefusal(s, { unit: world.me.unit, control: world.me.control, zone: ctl ? world.ents.get(ctl)?.s.z : undefined })
}

/** 輸入框聚焦時不處理遊戲按鍵 */
export function typingInField(): boolean {
  const a = document.activeElement as HTMLElement | null
  return !!a && (a.tagName === 'INPUT' || a.tagName === 'TEXTAREA' || a.isContentEditable)
}

/** 單位的身體半徑（sim 判定站上控制台時要加上它）*/
function bodyRadius(s: SnapEntity | undefined): number {
  return UNITS.get(s?.d ?? '')?.radius ?? DEFAULT_BODY_R
}

/**
 * 拾取不到實體時改用的點選對象：頭頂提示標籤標的東西（ent = 實體 id），或沒有實體的控制台（船艙控制台、視野外的主控台：ent = 0，
 * x／y = 控制圈中心）
 */
interface AltTarget {
  x: number
  y: number
  ent: number
  /** 船艙的艙門（client/hatch.ts；沒有實體）：右鍵＝走過去，懸停顯示艙門的說明 */
  hatch?: boolean
}

/** 技能或道具的瞄準模式（不含 A 攻擊）*/
export type AimMode = Extract<NonNullable<TargetMode>, { kind: 'ability' | 'item' }>

/** 瞄準模式對應的技能定義（道具＝它的使用技能）*/
export function aimAbility(tm: AimMode) {
  return abilityDef(tm.kind === 'ability' ? tm.id : tm.ability)
}

/** 自己目前操控的單位（sim 施法的 caster）*/
function casterId(): number {
  return world.me.control || world.me.unit || 0
}

/** 實體的身體半徑（公尺）：站點用太空中的外觀半徑；販賣機的定義只在 sim 端 */
function entRadius(s: SnapEntity): number {
  const d = s.d ?? ''
  if (d.startsWith('station.')) return STATION_BY_ID.get(d.slice(8))?.space.radius ?? 3
  return UNITS.get(d)?.radius ?? (d.startsWith('vendor.') ? 0.6 : DEFAULT_BODY_R)
}

/** 吸附時排在後面的對象：建物、自己（操控中的載具，以及坐在救生艙裡、跟著艙移動的自己本人）*/
function lowPri(s: SnapEntity, self: number): boolean {
  return s.i === self || s.i === world.me.unit || isStructureLike(s)
}

/**
 * 瞄準中的技能／道具可以對自己放（篩選有 self：抽血、慰藉護盾、投影分身）時，再按一次同一個鍵就對自己施放（Input.selfCast）：
 * 回傳那個鍵的顯示名稱（道具 = 背包格號、技能 = 指令卡快捷鍵），不能對自己放回傳 null。overlay 畫在自己腳下提示。
 */
export function aimSelfKey(tm: TargetMode): string | null {
  if (!tm || tm.kind === 'attack' || (tm.target !== 'unit' && tm.target !== 'unitOrPoint')) return null
  if (!aimAbility(tm)?.filter?.self) return null
  if (tm.kind === 'item') return String(tm.slot + 1)
  const list = (world.me.abilities ?? []).filter((a) => abilityDef(a.id)?.target !== 'passive')
  const i = list.findIndex((a) => a.id === tm.id)
  return i >= 0 && i < HOTKEYS.length ? HOTKEYS[i].slice(3) : null
}

/** 送出瞄準中的技能／道具：對單位（e）或對地面一點 */
function sendAim(tm: AimMode, to: { e: number } | Pt, q: boolean): void {
  if (tm.kind === 'ability') sendCmd({ k: 'cast', a: tm.id, ...to, q })
  else sendCmd({ k: 'use', s: tm.slot, ...to, q })
}

let missAt = 0
/** 瞄準時點空了（附近也沒有可選的目標）：保持瞄準，提示要點在目標身上；連點時 1.2 秒內只提示一次 */
export function aimMiss(key = 'art3.aim.miss'): void {
  const now = performance.now()
  if (now - missAt < 1200) return
  missAt = now
  localNotice.value = { text: key, at: now }
}

/**
 * 小地圖左鍵（瞄準中）：點的位置附近有符合篩選的目標就對它施放（救生艙「設定航線」選站、天守主砲選站…）；
 * 技能可以對地面就對那一點施放；都不行就保持瞄準並提示。tolM = 小地圖上的點擊容差（公尺）。
 * 回傳是否送出了指令（呼叫端決定要不要結束瞄準）。A 攻擊由小地圖自己處理（攻擊移動）。
 */
export function mapAim(scene: GameScene, tm: AimMode, p: Pt, tolM: number, q: boolean): boolean {
  const ab = aimAbility(tm)
  const wantsUnit = tm.target === 'unit' || tm.target === 'unitOrPoint'
  const wantsPoint = tm.target === 'point' || tm.target === 'unitOrPoint'
  if (wantsUnit) {
    const id = mapPick(scene, p, tolM, ab?.filter)
    const e = id ? world.ents.get(id) : undefined
    if (e) {
      sendAim(tm, { e: id }, q)
      scene.fx.clickMarker(scene.zone, e.x, e.y, '#b28cff')
      return true
    }
  }
  if (wantsPoint) {
    sendAim(tm, { x: p.x, y: p.y }, q)
    scene.fx.clickMarker(scene.zone, p.x, p.y, '#b28cff')
    return true
  }
  aimMiss('art3.aim.mapMiss')
  return false
}

/** 小地圖上 p 附近（tolM 公尺內，加上目標半徑）符合篩選、離 p 最近的實體（0 = 沒有）*/
export function mapPick(scene: GameScene, p: Pt, tolM: number, f: TargetFilter | undefined): number {
  const self = casterId()
  const cands: { id: number; x: number; y: number; r: number; ok: boolean; low: boolean }[] = []
  for (const e of world.ents.values()) {
    if (e.s.z !== scene.zone) continue
    cands.push({ id: e.s.i, x: e.x, y: e.y, r: entRadius(e.s), ok: targetOk(e.s, f, self), low: lowPri(e.s, self) })
  }
  return mapPickTarget(p, cands, tolM, wantsStructure(f))
}

const V_FOOT = new Vector3()
const V_TMP = new Vector3()
const V_RIGHT = new Vector3()

export class Input {
  private shift = false
  /**
   * 剛交出控制台（按 B、或駕駛的船停靠時被鎖住）的那一台：sim 要等人離開控制圈才會讓同一個人重新駕駛，
   * 站在圈裡右鍵它什麼都不會發生。記下來，右鍵它時先退出圈外再走回來（Input.goPilot）。走遠了就清掉。
   */
  private leftConsole: { zone: number; x: number; y: number } | null = null
  /** 游標下的船艙控制台（沒有實體，WorldHover 不會說明它；由這裡顯示同一張懸停卡片）*/
  private spotHover: { key: string; since: number; shown: boolean; spot: AltTarget | null } = { key: '', since: 0, shown: false, spot: null }
  /** 最後一次的游標位置（瞄準中每 0.1 秒重算一次預覽：單位會走動）*/
  private lastMouse: { x: number; y: number } | null = null
  private dragging = false
  private dragX = 0
  private dragY = 0
  private last = { x: -1, y: -1 }
  private dropArmed = 0
  private disposers: (() => void)[] = []

  constructor(
    private el: HTMLElement,
    private scene: GameScene,
  ) {
    const on = <K extends keyof HTMLElementEventMap>(t: K, f: (e: HTMLElementEventMap[K]) => void, target: HTMLElement | Window = el) => {
      target.addEventListener(t, f as EventListener)
      this.disposers.push(() => target.removeEventListener(t, f as EventListener))
    }
    // 右鍵是遊戲操作（移動、互動）：對局中整個視窗都不跳瀏覽器選單（滑鼠在 HUD 面板、聊天、小地圖上也一樣）；
    // 只有文字輸入框保留原生選單（複製、貼上）
    on(
      'contextmenu',
      (e) => {
        const t = e.target
        if (t instanceof HTMLInputElement || t instanceof HTMLTextAreaElement || (t instanceof HTMLElement && t.isContentEditable)) return
        e.preventDefault()
      },
      window,
    )
    on('mousedown', (e) => this.down(e))
    on('mouseup', (e) => {
      if (e.button === 1) this.dragging = false
    })
    on('mousemove', (e) => this.move(e))
    // 邊緣捲動用整個視窗的滑鼠位置：滑鼠在 HUD 上（例如底部面板）也要能捲；
    // 滑鼠從邊緣滑出瀏覽器視窗時，視為停在那個邊緣，繼續捲動直到回來或視窗失焦。
    const wmove = (e: PointerEvent) => {
      const r = this.el.getBoundingClientRect()
      this.last = { x: e.clientX - r.left, y: e.clientY - r.top }
      // 對話框開著時（設定、圖鑑、說明、筆記、進化）不要邊緣捲動
      this.scene.rts.mouseAt(this.last.x, this.last.y, !modalOpen())
      cursorScreen.x = e.clientX
      cursorScreen.y = e.clientY
      cursorScreen.overView = e.target === this.el
      if (e.target !== this.el) {
        // 在 HUD 上：不要留著上一次的懸停目標
        this.scene.units.hovered = 0
        cursorWorld.value = null
      }
    }
    const wout = (e: MouseEvent) => {
      if (e.relatedTarget) return
      const r = this.el.getBoundingClientRect()
      const near = 56
      let { x, y } = this.last
      const atEdge = x <= near || y <= near || x >= r.width - near || y >= r.height - near
      if (!atEdge || modalOpen()) return this.scene.rts.mouseAt(-1, -1, false)
      if (x <= near) x = 0
      else if (x >= r.width - near) x = r.width
      if (y <= near) y = 0
      else if (y >= r.height - near) y = r.height
      this.scene.rts.mouseAt(x, y, true)
    }
    const stop = () => this.scene.rts.mouseAt(-1, -1, false)
    on('pointermove', wmove, window)
    on('mouseout', wout, window)
    on('blur', stop, window)
    const vis = () => document.hidden && stop()
    document.addEventListener('visibilitychange', vis)
    this.disposers.push(() => document.removeEventListener('visibilitychange', vis))
    this.disposers.push(
      effect(() => {
        this.scene.rts.edgeScroll = edgeScrollOn.value
        this.scene.rts.edgeSpeed = edgeSpeed.value
      }),
    )
    on('wheel', (e) => {
      e.preventDefault()
      this.scene.rts.wheel(e.deltaY)
    })
    // 每份快照：記下剛交出的控制台；選取跟著換掉的主單位（變身、進化、結繭都會換一個新的實體）
    let wasPiloting = false
    let prevUnit = world.me.unit
    this.disposers.push(
      effect(() => {
        void snapTick.value
        const piloting = isPiloting()
        if (wasPiloting && !piloting) this.markLeftConsole()
        wasPiloting = piloting
        this.forgetLeftConsole()
        const u = world.me.unit
        if (u !== prevUnit) {
          // peek：只跟著快照跑，不訂閱選取本身
          if (prevUnit && selected.peek() === prevUnit && u) {
            selected.value = u
            this.scene.units.selected = u
          }
          prevUnit = u
        }
      }),
    )
    // 送出互動指令（右鍵、腳本、測試）：記下對象，面板優先顯示那一台
    const tapInteract = (c: { k: string; e?: number }) => {
      if (c.k === 'interact' && c.e) lastInteract.value = c.e
    }
    cmdTaps.push(tapInteract)
    this.disposers.push(() => {
      const i = cmdTaps.indexOf(tapInteract)
      if (i >= 0) cmdTaps.splice(i, 1)
    })
    // 打開進化選單：從認得出是誰的樣子進化（結繭、變肉團、換機體）會被旁邊的人看到，先提醒
    this.disposers.push(
      effect(() => {
        if (evolveOpen.value && canShapeshift(world.me) && looksNamed(world)) exposeWarn('r3b.expose.evolve')
      }),
    )
    // 船艙控制台的懸停卡片（同 WorldHover：停留 0.25 秒才顯示）
    const hov = setInterval(() => {
      this.spotTip()
      // 瞄準中：游標沒動、單位在走，預覽（會選到誰）也要跟著更新
      if (targetMode.value && this.lastMouse && cursorScreen.overView) this.hoverAt(this.lastMouse.x, this.lastMouse.y)
    }, 100)
    this.disposers.push(() => {
      clearInterval(hov)
      if (this.spotHover.shown) showCursorTip(null, 0, 0)
    })
    const kd = (e: KeyboardEvent) => this.key(e, true)
    const ku = (e: KeyboardEvent) => this.key(e, false)
    window.addEventListener('keydown', kd)
    window.addEventListener('keyup', ku)
    this.disposers.push(() => window.removeEventListener('keydown', kd), () => window.removeEventListener('keyup', ku))
  }

  dispose(): void {
    for (const d of this.disposers) d()
  }

  private ndc(e: MouseEvent): [number, number] {
    const r = this.el.getBoundingClientRect()
    return [((e.clientX - r.left) / r.width) * 2 - 1, -((e.clientY - r.top) / r.height) * 2 + 1]
  }

  private move(e: MouseEvent): void {
    const r = this.el.getBoundingClientRect()
    this.scene.rts.mouseAt(e.clientX - r.left, e.clientY - r.top, true)
    if (this.dragging) {
      this.scene.rts.pan(e.clientX - this.dragX, e.clientY - this.dragY, r.height)
      this.dragX = e.clientX
      this.dragY = e.clientY
    }
    this.lastMouse = { x: e.clientX, y: e.clientY }
    this.hoverAt(e.clientX, e.clientY)
  }

  /**
   * 游標下的東西（clientX／Y = 視窗座標）：懸停的實體、沒有實體的控制台與艙門。
   * 瞄準「點一個單位」的技能時，懸停改成「現在點下去會選到誰」（含吸附，同 applyTarget）：選取圈與名字標在那個單位上，
   * 點下去就是看到的那個（第 6 輪審查：懸停顯示自己，點下去卻抽到旁邊的人）。
   */
  private hoverAt(clientX: number, clientY: number): void {
    const r = this.el.getBoundingClientRect()
    const nx = ((clientX - r.left) / r.width) * 2 - 1
    const ny = -((clientY - r.top) / r.height) * 2 + 1
    const ground = this.scene.rts.groundAt(nx, ny)
    cursorWorld.value = ground
    let hov = this.scene.pick(nx, ny)
    let spot: AltTarget | null = null
    if (!hov) {
      // 游標在頭頂提示標籤上（底下常常是牆）：當成懸停在它標的對象；船艙控制台、艙門沒有實體，另外記
      const lb = this.labelAt(clientX, clientY)
      if (lb?.ent) hov = lb.ent
      else spot = lb ?? (this.zoneHasShipConsole() ? (this.consoleSpotAt(nx, ny) ?? this.hatchAt(ground)) : null)
    }
    const tm = targetMode.value
    if (tm && tm.kind !== 'attack' && tm.target === 'unit') hov = this.aimChoice(tm, hov, clientX - r.left, clientY - r.top)
    this.scene.units.hovered = hov
    const key = spot ? `${this.scene.zone}:${spot.x},${spot.y}` : ''
    if (key !== this.spotHover.key) this.spotHover = { key, since: performance.now(), shown: this.spotHover.shown, spot }
  }

  /**
   * 滑鼠在 overlay.ts 畫的標籤上：頭頂互動提示（標的對象）、太空層的站名（那座站）、船艙艙門的標籤（艙門）。
   * clientX／Y = 視窗座標。
   */
  private labelAt(clientX: number, clientY: number): AltTarget | null {
    const r = this.el.getBoundingClientRect()
    const x = clientX - r.left
    const y = clientY - r.top
    const inside = (h: { l: number; r: number; t: number; b: number }) => x >= h.l && x <= h.r && y >= h.t && y <= h.b
    const h = this.scene.promptHit
    if (h && inside(h)) {
      if (h.poi) return { x: h.poi.x, y: h.poi.y, ent: 0 }
      const t = world.ents.get(h.ent)
      if (t) return { x: (t.s.x ?? 0) / 100, y: (t.s.y ?? 0) / 100, ent: h.ent }
    }
    // 站名畫在站點模型正下方，點在名字上也算點到那座站（第 6 輪審查：停靠時點移動中的站點容易點空）
    for (const sh of this.scene.stationHits) {
      const t = world.ents.get(sh.ent)
      if (t && inside(sh)) return { x: t.x, y: t.y, ent: sh.ent }
    }
    const hh = this.scene.hatchHit
    if (hh && inside(hh)) return { x: hh.x, y: hh.y, ent: 0, hatch: true }
    return null
  }

  /** 游標所在的地面就是船艙艙門那一格（0.75 m 內）：回傳艙門 */
  private hatchAt(ground: Pt | null): AltTarget | null {
    if (!ground) return null
    const hc = cabinHatch(world, this.scene.zones)
    if (!hc || hc.zone !== this.scene.zone || Math.hypot(ground.x - hc.x, ground.y - hc.y) > 0.75) return null
    return { x: hc.x, y: hc.y, ent: 0, hatch: true }
  }

  /** 目前畫面的 zone 有沒有船艙控制台（只有船艙要在每次移動滑鼠時多拾取一次設施模型）*/
  private zoneHasShipConsole(): boolean {
    const info = this.scene.zones.get(this.scene.zone)
    return !!info && info.layout.pois.some((p) => p.def.kind === 'shipConsole')
  }

  /** 游標下的船艙控制台模型（sim 沒有實體，pick 拾取不到）*/
  private consoleSpotAt(nx: number, ny: number): AltTarget | null {
    const p = this.scene.pickPoi(nx, ny)
    return p && p.def.kind === 'shipConsole' ? { x: p.x, y: p.y, ent: 0 } : null
  }

  /** 游標下拾取不到實體的控制台模型：船艙控制台、或在視野外（快照裡沒有實體）的站點主控台 */
  private consoleModelAt(nx: number, ny: number): AltTarget | null {
    const p = this.scene.pickPoi(nx, ny)
    return p && CONSOLE_KINDS.has(p.def.kind) ? { x: p.x, y: p.y, ent: 0 } : null
  }

  /** 船艙控制台的懸停卡片：內容和站點主控台一樣（WorldHover 的 hoverTip），只是沒有血量；艙門另有說明 */
  private spotTip(): void {
    const h = this.spotHover
    const want = !!h.key && cursorScreen.overView && !targetMode.value && !modalOpen() && !this.scene.units.hovered && performance.now() - h.since >= 250
    if (want && h.spot?.hatch) {
      const docked = cabinHatch(world, this.scene.zones)?.docked
      showCursorTip({ title: t('ux6.hatch.title'), sub: t('ux6.hatch.cat'), body: t('ux6.hatch.body'), hint: t(docked === false ? 'ux6.hatch.hint.flying' : 'ux6.hatch.hint.docked'), color: '#ffc23d' }, cursorScreen.x, cursorScreen.y)
      h.shown = true
    } else if (want) {
      const d = 'struct.console'
      showCursorTip({ title: loc(entDefName(d)), sub: t('hover.cat.structure'), body: t('hover.desc.' + d), hint: t('hover.hint.console'), color: '#ffc23d' }, cursorScreen.x, cursorScreen.y)
      h.shown = true
    } else if (h.shown) {
      h.shown = false
      showCursorTip(null, 0, 0)
    }
  }

  /** 剛停止駕駛：記下自己主單位旁邊的那一台控制台（交還鎖在它上面）*/
  private markLeftConsole(): void {
    const u = world.ents.get(world.me.unit ?? 0)
    const info = u ? this.scene.zones.get(u.s.z ?? -1) : undefined
    this.leftConsole = null
    if (!u || !info) return
    const lim = CONSOLE_R + bodyRadius(u.s) + CONSOLE_LOCK_PAD + 0.3
    for (const c of consoleSpots(info.layout)) if (Math.hypot(u.x - c.x, u.y - c.y) <= lim) this.leftConsole = { zone: info.id, x: c.x, y: c.y }
  }

  /** 已經走出交還鎖的範圍（或換了 zone）：不用再先退出去 */
  private forgetLeftConsole(): void {
    const lc = this.leftConsole
    if (!lc) return
    const u = world.ents.get(world.me.unit ?? 0)
    if (!u || u.s.z !== lc.zone || Math.hypot(u.x - lc.x, u.y - lc.y) > CONSOLE_R + bodyRadius(u.s) + CONSOLE_LOCK_PAD + 0.1) this.leftConsole = null
  }

  /**
   * 右鍵控制台＝走上去駕駛。控制台本體是實心的：送它的中心點，sim 會改走到最近的可走格，常常是控制台後面的牆邊，
   * 站不進控制圈。改走到控制圈裡站得到、離自己最近的一點（moveTargets.ts consoleApproach）。
   * 剛交出這一台、還站在圈裡（sim 的交還鎖還沒解開）：先退到圈外，再排隊走回來。
   */
  private goPilot(c: AltTarget, zone: number, q: boolean): void {
    const ctl = world.ents.get(world.me.control || world.me.unit || 0)
    const info = this.scene.zones.get(zone)
    const from: Pt | null = ctl && ctl.s.z === zone ? { x: ctl.x, y: ctl.y } : null
    const r = bodyRadius(ctl?.s)
    const ap = info && from ? consoleApproach(info.layout, c, from, r, reachFrom(info.layout, from)) : null
    if (!ap || !from) {
      sendCmd({ k: 'move', x: c.x, y: c.y, q })
      this.scene.fx.clickMarker(zone, c.x, c.y, '#ffc23d')
      return
    }
    const lc = this.leftConsole
    const locked = !!lc && lc.zone === zone && Math.hypot(lc.x - c.x, lc.y - c.y) < 0.1 && Math.hypot(from.x - c.x, from.y - c.y) <= CONSOLE_R + r + CONSOLE_LOCK_PAD + 0.1
    if (locked && ap.out) {
      sendCmd({ k: 'move', x: ap.out.x, y: ap.out.y, q })
      sendCmd({ k: 'move', x: ap.stand.x, y: ap.stand.y, q: true })
    } else sendCmd({ k: 'move', x: ap.stand.x, y: ap.stand.y, q })
    this.scene.fx.clickMarker(zone, ap.stand.x, ap.stand.y, '#ffc23d')
  }

  private down(e: MouseEvent): void {
    this.shift = e.shiftKey
    if (e.button === 1) {
      this.dragging = true
      this.dragX = e.clientX
      this.dragY = e.clientY
      e.preventDefault()
      return
    }
    // 駕駛中的監控掃描暫時顯示站內（sweepPeek.ts）：點一下畫面就回到駕駛畫面（這一下不當成指令：座標是站內的）
    if (sweepPeek.active && (e.button === 0 || e.button === 2)) {
      sweepPeek.end()
      return
    }
    const [nx, ny] = this.ndc(e)
    const pt = this.scene.rts.groundAt(nx, ny)
    const ent = this.scene.pick(nx, ny)
    const zone = this.scene.zone
    const tm = targetMode.value
    if (e.button === 2) {
      if (tm) {
        targetMode.value = null
        return
      }
      // 沒點到實體：游標在頭頂提示標籤上、或在沒有實體的控制台模型上（船艙控制台、視野外的主控台），當成點到它
      this.rightClick(ent, pt, zone, ent ? null : (this.labelAt(e.clientX, e.clientY) ?? this.consoleModelAt(nx, ny)))
      return
    }
    if (e.button === 0) {
      // Alt＋左鍵＝在那裡發信號（全員的小地圖與地面都會閃一下）；瞄準中也可以，瞄準照樣保留
      if (e.altKey && altClick.ping) {
        e.preventDefault()
        if (pt) altClick.ping(zone, pt.x, pt.y, this.scene.zones.get(zone)?.layout ?? null)
        return
      }
      if (tm) {
        // 沒有送出指令（點空了、附近也沒有可選的目標）：保持瞄準，不要無聲取消。點在標籤上（站名、互動提示）＝點到它標的對象
        const r = this.el.getBoundingClientRect()
        const direct = ent || this.labelAt(e.clientX, e.clientY)?.ent || 0
        const done = this.applyTarget(tm, direct, pt, zone, e.clientX - r.left, e.clientY - r.top)
        if (done && !e.shiftKey) targetMode.value = null
        return
      }
      selected.value = ent || (world.me.control ?? 0)
      this.scene.units.selected = selected.value
    }
  }

  private rightClick(ent: number, pt: { x: number; y: number } | null, zone: number, alt: AltTarget | null = null): void {
    const q = this.shift
    const me = world.me.control ?? world.me.unit
    const e = ent && ent !== me ? world.ents.get(ent) : undefined
    if (e) {
      // 依類別決定（interactKind.ts）：敵方建物在「可互動」之前判斷，降落場這種大地貼當成點地面
      const mc = meCtx(world)
      switch (rightClickAction(e.s, mc)) {
        case 'pickup':
          // 地上的物品：撿起來（sim 的 interact 只會走過去，不會撿）
          sendCmd({ k: 'pickup', e: ent, q })
          this.scene.fx.clickMarker(zone, e.x, e.y, '#ffc23d')
          return
        case 'center':
          // 駕駛控制台：走進控制圈（本體是實心的，見 goPilot）
          if (e.s.d === 'struct.console') {
            this.goPilot({ x: (e.s.x ?? 0) / 100, y: (e.s.y ?? 0) / 100, ent }, zone, q)
            return
          }
          // 無人機控制圈、降落傳送門（不佔格）：要站到正中央才會觸發（interact 只會停在旁邊），直接走到中心
          sendCmd({ k: 'move', x: e.x, y: e.y, q })
          this.scene.fx.clickMarker(zone, e.x, e.y, '#ffc23d')
          return
        case 'interact':
          lastInteract.value = ent
          sendCmd({ k: 'interact', e: ent, q })
          return
        case 'rummage': {
          // 雜物箱、自己有翻找技能：走過去翻找；冷卻中／能量不足時照樣走過去，並說明為什麼還不能翻
          const r = rummageClick(ent, e.s, mc, q)
          sendCmd(r.cmd)
          if (r.notice) localNotice.value = { text: r.notice.key, args: r.notice.args, at: performance.now() }
          this.scene.fx.clickMarker(zone, e.x, e.y, '#ffc23d')
          return
        }
        case 'corpse':
          sendCmd({ k: 'move', x: (e.s.x ?? 0) / 100, y: (e.s.y ?? 0) / 100, q })
          return
        case 'attack':
          sendCmd({ k: 'attack', e: ent, q })
          this.scene.fx.clickMarker(zone, e.x, e.y, '#ff5a4a')
          return
        case 'follow':
          // 盟友（所有玩家彼此結盟）：右鍵 = 跟隨；要攻擊請用 A
          sendCmd({ k: 'follow', e: ent, q })
          return
        case 'ground':
          break
      }
    }
    // 點在頭頂標籤上＝點它標的對象（販賣機、控制台…）；沒有實體的控制台＝去駕駛；艙門＝走過去（停靠中就會下船）
    if (alt) {
      if (alt.ent) this.rightClick(alt.ent, pt, zone)
      else if (alt.hatch) {
        sendCmd({ k: 'move', x: alt.x, y: alt.y, q })
        this.scene.fx.clickMarker(zone, alt.x, alt.y)
      } else this.goPilot(alt, zone, q)
      return
    }
    // 點地面（或點到自己、只是場景的地貼、剛離開視野的實體）：走過去
    if (pt) {
      sendCmd({ k: 'move', x: pt.x, y: pt.y, q })
      this.scene.fx.clickMarker(zone, pt.x, pt.y)
    }
  }

  /**
   * 瞄準中的左鍵（mx／my = 點擊位置，畫面座標 px）。回傳是否送出了指令。
   * 只能點單位的技能與道具（抽血、寄生、停靠…）：沒有正好點在模型上時，吸附到附近約 1 格內符合篩選的單位
   * （targetSnap.ts chooseUnitTarget）；附近也沒有就保持瞄準並提示。可以點地面的照舊。
   */
  private applyTarget(tm: NonNullable<TargetMode>, ent: number, pt: { x: number; y: number } | null, zone: number, mx: number, my: number): boolean {
    const q = this.shift
    if (tm.kind === 'attack') {
      if (ent && ent !== world.me.control) {
        sendCmd({ k: 'attack', e: ent, q })
        return true
      }
      if (!pt) return false
      sendCmd({ k: 'amove', x: pt.x, y: pt.y, q })
      this.scene.fx.clickMarker(zone, pt.x, pt.y, '#ff5a4a')
      return true
    }
    if (tm.target === 'unit') {
      const id = this.aimChoice(tm, ent, mx, my)
      const e = id ? world.ents.get(id) : undefined
      // 只能對站點放的（停靠、設定航線）點到自己的船、恆星：sim 只會回「無效的目標」，改成說明要點在站點上
      const f = aimAbility(tm)?.filter
      if (!e || (f?.station && !targetOk(e.s, f, casterId()))) {
        aimMiss(this.missKey(tm))
        return false
      }
      sendAim(tm, { e: id }, q)
      this.scene.fx.clickMarker(zone, e.x, e.y, '#b28cff')
      return true
    }
    const wantsUnit = tm.target === 'unitOrPoint'
    const wantsPoint = tm.target === 'point' || tm.target === 'unitOrPoint'
    if (wantsUnit && ent) sendAim(tm, { e: ent }, q)
    else if (wantsPoint && pt) sendAim(tm, { x: pt.x, y: pt.y }, q)
    else return false
    if (pt) this.scene.fx.clickMarker(zone, pt.x, pt.y, '#b28cff')
    return true
  }

  /**
   * 「點一個單位」的技能現在點在 (mx, my)（畫面 px）會選到誰（0 = 沒有）。direct = 游標下直接拾取到的實體。
   * 吞噬只吸附吞得下的目標、範圍放寬（深色小生物在地板上看不清楚）；太空層的對象（站點、船）範圍也放寬（移動中的站點容易點空，
   * 站名在模型下方）。
   */
  private aimChoice(tm: AimMode, direct: number, mx: number, my: number): number {
    const ab = aimAbility(tm)
    const f = ab?.filter
    const opt = ab?.id === DEVOUR ? { ok: devourable, m: SNAP_M_DEVOUR } : this.scene.zone === 0 ? { m: SNAP_M_SPACE, minPx: SNAP_MIN_PX_SPACE } : {}
    return chooseUnitTarget(direct, this.snapCands(mx, my, f, direct, opt), wantsStructure(f))
  }

  /** 瞄準點空時的提示：吞噬說明吞得下的有閃爍的圈；對站點的技能說明點在站點或站名附近都算 */
  private missKey(tm: AimMode): string | undefined {
    const ab = aimAbility(tm)
    if (ab?.id === DEVOUR) return 'ux6.aim.devourMiss'
    if (ab?.filter?.station) return 'ux6.aim.stationMiss'
    return undefined
  }

  /**
   * 瞄準吸附的候選：目前畫面裡每個實體在螢幕上的身體中軸（腳 → 頭）到點擊位置的距離，與它的吸附範圍
   * （身體半徑＋約 1 格，依它所在深度換算成 px）。烘焙在站體裡的設施沒有單位視圖，用實體座標、約 2 m 高。
   * opt.ok = 額外的篩選（吞噬：吞得下）；opt.m／minPx = 吸附範圍（公尺、螢幕下限）。
   */
  private snapCands(mx: number, my: number, f: TargetFilter | undefined, direct: number, opt: { ok?: (s: SnapEntity) => boolean; m?: number; minPx?: number } = {}): SnapCand[] {
    const cam = this.scene.camera
    const r = this.el.getBoundingClientRect()
    const self = casterId()
    const zone = this.scene.zone
    V_RIGHT.setFromMatrixColumn(cam.matrixWorld, 0).normalize()
    const sx = (v: Vector3) => (v.x * 0.5 + 0.5) * r.width
    const sy = (v: Vector3) => (-v.y * 0.5 + 0.5) * r.height
    const out: SnapCand[] = []
    for (const e of world.ents.values()) {
      if (e.s.z !== zone) continue
      const ok = targetOk(e.s, f, self) && (!opt.ok || opt.ok(e.s))
      // 不符合篩選的只有直接點中的那一個需要（chooseUnitTarget 要知道它不符合），其他的不用投影
      if (!ok && e.s.i !== direct) continue
      const uv = this.scene.units.views.get(e.s.i)
      if (uv) V_FOOT.copy(uv.root.position)
      else V_FOOT.set(e.x, 0, -e.y)
      const h = uv?.height ?? 2
      const rad = entRadius(e.s)
      V_TMP.copy(V_FOOT).addScaledVector(V_RIGHT, 1).project(cam)
      const sideX = sx(V_TMP)
      const sideY = sy(V_TMP)
      V_TMP.copy(V_FOOT)
      V_TMP.y += h
      V_TMP.project(cam)
      const headX = sx(V_TMP)
      const headY = sy(V_TMP)
      V_FOOT.project(cam)
      if (V_FOOT.z > 1) continue
      const footX = sx(V_FOOT)
      const footY = sy(V_FOOT)
      const pxPerM = Math.hypot(sideX - footX, sideY - footY)
      out.push({
        id: e.s.i,
        dist: segDist(mx, my, footX, footY, headX, headY),
        tol: Math.max(opt.minPx ?? SNAP_MIN_PX, (rad + (opt.m ?? SNAP_M)) * pxPerM),
        ok,
        low: lowPri(e.s, self),
        self: e.s.i === self || e.s.i === world.me.unit,
      })
    }
    return out
  }

  private key(e: KeyboardEvent, down: boolean): void {
    // 聊天框剛打開、還沒拿到焦點的那一瞬間也不觸發快捷鍵
    if (typingInField() || chatOpen.value) return
    // 單按 Alt（Alt＋點發信號）：不要讓瀏覽器把焦點移到選單列（Windows、Firefox 放開 Alt 會打開選單）
    if (e.key === 'Alt') e.preventDefault()
    if (dialogOpen()) {
      // 對話框開著：遊戲快捷鍵一律不處理。各對話框的 Esc 在 capture 階段自己處理；進化選單在這裡用 Esc／V 關掉。
      // 方向鍵放開照樣送出，免得在對話框打開前按著的方向鍵卡住、鏡頭一直捲
      if (!down && e.code.startsWith('Arrow')) this.scene.rts.key(e.code, false)
      if (down && !e.repeat && evolveOpen.value && (e.code === 'Escape' || e.code === 'KeyV')) evolveOpen.value = false
      if (down && !e.repeat && e.code === 'Enter' && onlyPass(chatPassChecks)) {
        chatOpen.value = true
        e.preventDefault()
      }
      if (down && !e.repeat && e.code === 'KeyM' && !e.ctrlKey && !e.metaKey && !e.altKey && onlyPass(mutePassChecks)) setAudioPref('muted', !audioPrefs.value.muted)
      return
    }
    if (e.code.startsWith('Arrow')) {
      this.scene.rts.key(e.code, down)
      e.preventDefault()
      return
    }
    if (!down || e.repeat) return
    if (e.ctrlKey || e.metaKey || e.altKey) return
    switch (e.code) {
      case 'Space': {
        // 監控掃描的站內畫面：先回到駕駛畫面（GameScene 結束暫時畫面時會對準自己）
        if (sweepPeek.active) sweepPeek.end()
        const u = this.scene.myUnit()
        if (u) this.scene.rts.focus(u.x, u.y)
        e.preventDefault()
        return
      }
      case 'Enter':
        chatOpen.value = true
        e.preventDefault()
        return
      case 'KeyM':
        setAudioPref('muted', !audioPrefs.value.muted)
        return
      case 'KeyB':
        // 駕駛中：離開控制台
        if (isPiloting()) sendCmd({ k: 'unpilot' })
        return
      case 'Escape':
        // 取消瞄準 → 結束監控掃描的站內畫面 → 關進化選單 → 開關遊戲選單
        if (targetMode.value) targetMode.value = null
        else if (sweepPeek.active) sweepPeek.end()
        else if (evolveOpen.value) evolveOpen.value = false
        else menuOpen.value = !menuOpen.value
        return
      case 'KeyV':
        evolveOpen.value = !evolveOpen.value
        return
      case 'KeyA':
        targetMode.value = { kind: 'attack' }
        return
      case 'KeyS':
        sendCmd({ k: 'stop' })
        return
      case 'KeyH':
        sendCmd({ k: 'hold' })
        return
    }
    const hk = HOTKEYS.indexOf(e.code)
    if (hk >= 0) {
      this.useAbility(hk)
      return
    }
    const digit = /^Digit([1-6])$/.exec(e.code)
    if (digit) this.useItem(Number(digit[1]) - 1)
  }

  useAbility(index: number): void {
    const list = (world.me.abilities ?? []).filter((a) => abilityDef(a.id)?.target !== 'passive')
    const st = list[index]
    if (!st) return
    const ab = abilityDef(st.id)
    if (!ab || st.cd > 0) return
    // 脫下防護服不可逆、又排在戰鬥技能旁邊：1.5 秒內再按一次才執行
    if (ab.id === 'suit.drop') {
      const now = performance.now()
      if (now - this.dropArmed > 1500) {
        this.dropArmed = now
        // 提示只顯示到確認時限為止（再按一次的有效時間）
        localNotice.value = { text: 'suit.dropConfirm', at: now, life: 1500 }
        return
      }
      this.dropArmed = 0
    }
    // 變身、褪皮、千面…被看到就曝光：視野裡有人時提醒一次（有詠唱時間的，施法條上也會警告，按 S 可以取消）
    if (EXPOSING_ABILITIES.has(ab.id)) exposeWarn(ab.cast ? 'r3b.expose.press' : 'r3b.expose.pressNow')
    if (ab.target === 'none' || ab.target === 'self' || ab.target === 'toggle') {
      sendCmd({ k: 'cast', a: ab.id })
      return
    }
    // 瞄準中再按一次同一個鍵：能對自己放的就對自己放
    const cur = targetMode.value
    if (cur?.kind === 'ability' && cur.id === ab.id && this.selfCast(cur)) return
    targetMode.value = { kind: 'ability', id: ab.id, target: ab.target, aoe: ab.aoe, range: ab.range }
  }

  /**
   * 背包格拖到場景上放開（螢幕座標）：放在能收道具的單位身上＝給予（sim 會先走到對方身邊）。
   * 放在空地或自己身上＝取消；對象不行就顯示現有的錯誤訊息。回傳是否送出了給予。
   */
  dropItemOn(slot: number, clientX: number, clientY: number, queue = false): boolean {
    if (!world.me.inv?.[slot]) return false
    const r = this.el.getBoundingClientRect()
    const nx = ((clientX - r.left) / r.width) * 2 - 1
    const ny = -((clientY - r.top) / r.height) * 2 + 1
    const id = this.scene.pick(nx, ny)
    const e = id ? world.ents.get(id) : undefined
    const why = giveRefusalHere(e?.s)
    if (why) localNotice.value = { text: why, at: performance.now() }
    if (why !== null || !e) return false
    sendCmd({ k: 'give', e: id, s: slot, q: queue })
    this.scene.fx.clickMarker(this.scene.zone, e.x, e.y, '#5cf2a5')
    return true
  }

  useItem(slot: number): void {
    const it = world.me.inv?.[slot]
    if (!it) return
    const def = itemDef(it.item)
    if (!def) return
    if (def.suit) {
      sendCmd({ k: 'use', s: slot })
      return
    }
    const ab = def.use ? abilityDef(def.use) : undefined
    if (!ab || ab.target === 'none' || ab.target === 'self') {
      sendCmd({ k: 'use', s: slot })
      return
    }
    // 瞄準中再按一次同一格（例如按 3 抽血、再按 3）：能對自己放的就對自己放
    const cur = targetMode.value
    if (cur?.kind === 'item' && cur.slot === slot && this.selfCast(cur)) return
    targetMode.value = { kind: 'item', slot, ability: ab.id, target: ab.target, aoe: ab.aoe, range: ab.range }
  }

  /**
   * 對自己施放瞄準中的技能／道具（第 6 輪審查：抽自己的捷徑）。只有篩選允許對自己放（aimSelfKey 不是 null）才做，
   * 回傳是否送出了。和 WC3／Dota 的「連按兩下＝對自己」同一個習慣；瞄準時自己腳下會標「再按 3：對自己」（overlay.ts）。
   */
  private selfCast(tm: AimMode): boolean {
    if (aimSelfKey(tm) === null) return false
    const id = casterId()
    const me = world.ents.get(id)
    if (!me) return false
    sendAim(tm, { e: id }, false)
    this.scene.fx.clickMarker(this.scene.zone, me.x, me.y, '#b28cff')
    targetMode.value = null
    return true
  }
}
