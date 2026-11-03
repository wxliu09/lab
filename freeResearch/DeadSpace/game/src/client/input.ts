// 輸入：致敬 WC3 的操作（右鍵移動／攻擊／互動、A 攻擊、S 停止、H 原地、QWERDF 技能、1–6 背包、空白鍵回鏡頭）
import { effect, signal } from '@preact/signals'
import { edgeScrollOn, edgeSpeed } from './controlPrefs'
import { audioPrefs, setAudioPref } from '../audio/sfx'
import { abilityDef, itemDef } from '../shared/content/registry'
import type { SnapEntity } from '../shared/protocol/messages'
import type { GameScene } from '../render/gameScene'
import { sendCmd, world } from './session'
import { giveRefusal } from './give'
import { rightClickAction } from './interactKind'

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
/** 本機提示（不經網路，例如「再按一次脫下防護服」）：Announce 會顯示。text = 字串 key；life = 顯示毫秒（不給就依字數，Announce.tsx noticeLife）*/
export const localNotice = signal<{ text: string; at: number; life?: number } | null>(null)
/** 最後一次右鍵互動的對象（販賣機挨在一起時，面板優先顯示這台）*/
export const lastInteract = signal(0)

export const HOTKEYS = ['KeyQ', 'KeyW', 'KeyE', 'KeyR', 'KeyD', 'KeyF']

/**
 * 各個對話框登記「我現在開著嗎」（避免 client → ui 的循環 import）：
 * 開著時不做邊緣捲動、不顯示場景懸停，遊戲快捷鍵也不處理（免得在設定、圖鑑裡按 Q／1 就放技能、用道具）。
 */
export const modalChecks: (() => boolean)[] = [() => evolveOpen.value, () => menuOpen.value]
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

export class Input {
  private shift = false
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
    const [nx, ny] = this.ndc(e)
    cursorWorld.value = this.scene.rts.groundAt(nx, ny)
    this.scene.units.hovered = this.scene.pick(nx, ny)
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
      this.rightClick(ent, pt, zone)
      return
    }
    if (e.button === 0) {
      if (tm) {
        this.applyTarget(tm, ent, pt, zone)
        if (!e.shiftKey) targetMode.value = null
        return
      }
      selected.value = ent || (world.me.control ?? 0)
      this.scene.units.selected = selected.value
    }
  }

  private rightClick(ent: number, pt: { x: number; y: number } | null, zone: number): void {
    const q = this.shift
    const me = world.me.control ?? world.me.unit
    const e = ent && ent !== me ? world.ents.get(ent) : undefined
    if (e) {
      // 依類別決定（interactKind.ts）：敵方建物在「可互動」之前判斷，降落場這種大地貼當成點地面
      switch (rightClickAction(e.s)) {
        case 'pickup':
          // 地上的物品：撿起來（sim 的 interact 只會走過去，不會撿）
          sendCmd({ k: 'pickup', e: ent, q })
          this.scene.fx.clickMarker(zone, e.x, e.y, '#ffc23d')
          return
        case 'center':
          // 控制台、無人機控制圈、降落傳送門：要站到正中央才會觸發（interact 只會停在旁邊），直接走到中心
          sendCmd({ k: 'move', x: e.x, y: e.y, q })
          this.scene.fx.clickMarker(zone, e.x, e.y, '#ffc23d')
          return
        case 'interact':
          lastInteract.value = ent
          sendCmd({ k: 'interact', e: ent, q })
          return
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
    // 點地面（或點到自己、只是場景的地貼、剛離開視野的實體）：走過去
    if (pt) {
      sendCmd({ k: 'move', x: pt.x, y: pt.y, q })
      this.scene.fx.clickMarker(zone, pt.x, pt.y)
    }
  }

  private applyTarget(tm: NonNullable<TargetMode>, ent: number, pt: { x: number; y: number } | null, zone: number): void {
    const q = this.shift
    if (tm.kind === 'attack') {
      if (ent && ent !== world.me.control) sendCmd({ k: 'attack', e: ent, q })
      else if (pt) {
        sendCmd({ k: 'amove', x: pt.x, y: pt.y, q })
        this.scene.fx.clickMarker(zone, pt.x, pt.y, '#ff5a4a')
      }
      return
    }
    const wantsUnit = tm.target === 'unit' || tm.target === 'unitOrPoint'
    const wantsPoint = tm.target === 'point' || tm.target === 'unitOrPoint'
    if (tm.kind === 'ability') {
      if (wantsUnit && ent) sendCmd({ k: 'cast', a: tm.id, e: ent, q })
      else if (wantsPoint && pt) sendCmd({ k: 'cast', a: tm.id, x: pt.x, y: pt.y, q })
    } else {
      if (wantsUnit && ent) sendCmd({ k: 'use', s: tm.slot, e: ent, q })
      else if (wantsPoint && pt) sendCmd({ k: 'use', s: tm.slot, x: pt.x, y: pt.y, q })
    }
    if (pt) this.scene.fx.clickMarker(zone, pt.x, pt.y, '#b28cff')
  }

  private key(e: KeyboardEvent, down: boolean): void {
    // 聊天框剛打開、還沒拿到焦點的那一瞬間也不觸發快捷鍵
    if (typingInField() || chatOpen.value) return
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
        // 取消瞄準 → 關進化選單 → 開關遊戲選單
        if (targetMode.value) targetMode.value = null
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
    if (ab.target === 'none' || ab.target === 'self' || ab.target === 'toggle') {
      sendCmd({ k: 'cast', a: ab.id })
      return
    }
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
    targetMode.value = { kind: 'item', slot, ability: ab.id, target: ab.target, aoe: ab.aoe, range: ab.range }
  }
}
