// 輸入：致敬 WC3 的操作（右鍵移動／攻擊／互動、A 攻擊、S 停止、H 原地、QWERDF 技能、1–6 背包、空白鍵回鏡頭）
import { signal } from '@preact/signals'
import { abilityDef, itemDef, UNITS } from '../shared/content/registry'
import { EntFlag } from '../shared/protocol/messages'
import type { GameScene } from '../render/gameScene'
import { sendCmd, world } from './session'

export type TargetMode =
  | null
  | { kind: 'attack' }
  | { kind: 'ability'; id: string; target: string; aoe?: number; range?: number }
  | { kind: 'item'; slot: number; ability: string; target: string; aoe?: number; range?: number }

export const targetMode = signal<TargetMode>(null)
export const selected = signal(0)
export const chatOpen = signal(false)
export const cursorWorld = signal<{ x: number; y: number } | null>(null)
export const evolveOpen = signal(false)

export const HOTKEYS = ['KeyQ', 'KeyW', 'KeyE', 'KeyR', 'KeyD', 'KeyF']

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
  private disposers: (() => void)[] = []

  constructor(
    private el: HTMLElement,
    private scene: GameScene,
  ) {
    const on = <K extends keyof HTMLElementEventMap>(t: K, f: (e: HTMLElementEventMap[K]) => void, target: HTMLElement | Window = el) => {
      target.addEventListener(t, f as EventListener)
      this.disposers.push(() => target.removeEventListener(t, f as EventListener))
    }
    on('contextmenu', (e) => e.preventDefault())
    on('mousedown', (e) => this.down(e))
    on('mouseup', (e) => {
      if (e.button === 1) this.dragging = false
    })
    on('mousemove', (e) => this.move(e))
    on('mouseleave', () => this.scene.rts.mouseAt(-1, -1, false))
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
    if (ent && ent !== me) {
      const e = world.ents.get(ent)
      const def = UNITS.get(e?.s.d ?? '')
      const fl = e?.s.fl ?? 0
      if (def?.tags.includes('structure') || fl & EntFlag.Interactable) {
        sendCmd({ k: 'interact', e: ent, q })
        return
      }
      if (fl & EntFlag.Corpse) {
        sendCmd({ k: 'move', x: (e!.s.x ?? 0) / 100, y: (e!.s.y ?? 0) / 100, q })
        return
      }
      if (fl & EntFlag.Hostile) {
        sendCmd({ k: 'attack', e: ent, q })
        this.scene.fx.clickMarker(zone, e!.x, e!.y, '#ff5a4a')
        return
      }
      // 盟友（所有玩家彼此結盟）：右鍵 = 跟隨；要攻擊請用 A
      sendCmd({ k: 'follow', e: ent, q })
      return
    }
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
    if (typingInField()) return
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
      case 'Escape':
        if (targetMode.value) targetMode.value = null
        else evolveOpen.value = !evolveOpen.value
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
    if (ab.target === 'none' || ab.target === 'self' || ab.target === 'toggle') {
      sendCmd({ k: 'cast', a: ab.id })
      return
    }
    targetMode.value = { kind: 'ability', id: ab.id, target: ab.target, aoe: ab.aoe, range: ab.range }
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
