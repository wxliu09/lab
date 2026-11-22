// 按鍵設定（第 7 輪：可重新指定）：input.ts 綁的每個動作、預設鍵（和第 7 輪以前寫死在 input.ts 的鍵完全相同）、
// 存 localStorage（只存和預設不同的）、衝突時交換、恢復預設。
// 鍵一律用 KeyboardEvent.code（實體位置，不受輸入法、Shift 影響）；顯示用的字依鍵盤配置
// （navigator.keyboard.getLayoutMap：AZERTY 的 KeyQ 顯示 A），拿不到就從 code 推（KeyQ → Q）。
// 本模組只依賴 signals（abilityKeys、設定頁、測試都會 import，不能 import input.ts）。
import { computed, signal } from '@preact/signals'

export type ActionGroup = 'ability' | 'item' | 'command' | 'camera' | 'ui'

export const ACTION_IDS = [
  'ability1',
  'ability2',
  'ability3',
  'ability4',
  'ability5',
  'ability6',
  'item1',
  'item2',
  'item3',
  'item4',
  'item5',
  'item6',
  'attack',
  'stop',
  'hold',
  'unpilot',
  'evolve',
  'camSelf',
  'camLeft',
  'camRight',
  'camUp',
  'camDown',
  'chat',
  'mute',
  'hideHud',
  'selectSelf',
  'menu',
  'guide',
  'notes',
  'codex',
] as const
export type ActionId = (typeof ACTION_IDS)[number]

export interface ActionDef {
  id: ActionId
  group: ActionGroup
  /** 預設鍵（KeyboardEvent.code；'' = 預設沒有按鍵）*/
  def: string
  /** 固定鍵：由別的模組處理（Esc、說明 G、筆記 Tab、圖鑑 F1），設定頁只顯示、不能改 */
  fixed?: boolean
}

const ACT = (id: ActionId, group: ActionGroup, def: string, fixed = false): ActionDef => (fixed ? { id, group, def, fixed } : { id, group, def })

/** 指令卡技能格的動作（指令卡順序）*/
export const ABILITY_ACTIONS: readonly ActionId[] = ['ability1', 'ability2', 'ability3', 'ability4', 'ability5', 'ability6']
/** 背包格的動作 */
export const ITEM_ACTIONS: readonly ActionId[] = ['item1', 'item2', 'item3', 'item4', 'item5', 'item6']

export const ACTIONS: readonly ActionDef[] = [
  ...['KeyQ', 'KeyW', 'KeyE', 'KeyR', 'KeyD', 'KeyF'].map((c, i) => ACT(ABILITY_ACTIONS[i], 'ability', c)),
  ...ITEM_ACTIONS.map((id, i) => ACT(id, 'item', 'Digit' + (i + 1))),
  ACT('attack', 'command', 'KeyA'),
  ACT('stop', 'command', 'KeyS'),
  ACT('hold', 'command', 'KeyH'),
  ACT('unpilot', 'command', 'KeyB'),
  ACT('evolve', 'command', 'KeyV'),
  ACT('camSelf', 'camera', 'Space'),
  ACT('camLeft', 'camera', 'ArrowLeft'),
  ACT('camRight', 'camera', 'ArrowRight'),
  ACT('camUp', 'camera', 'ArrowUp'),
  ACT('camDown', 'camera', 'ArrowDown'),
  ACT('chat', 'ui', 'Enter'),
  ACT('mute', 'ui', 'KeyM'),
  ACT('hideHud', 'ui', 'F9'),
  // WC3 的 F1 選英雄；這裡 F1 是圖鑑，預設不給鍵（玩家可以自己指定）
  ACT('selectSelf', 'ui', ''),
  ACT('menu', 'ui', 'Escape', true),
  ACT('guide', 'ui', 'KeyG', true),
  ACT('notes', 'ui', 'Tab', true),
  ACT('codex', 'ui', 'F1', true),
]

export const ACTION_BY_ID: ReadonlyMap<ActionId, ActionDef> = new Map(ACTIONS.map((a) => [a.id, a]))

/** 鏡頭捲動動作 → 鏡頭（RtsCamera.key）認得的方向鍵 code */
export const CAM_KEYS: Partial<Record<ActionId, string>> = { camLeft: 'ArrowLeft', camRight: 'ArrowRight', camUp: 'ArrowUp', camDown: 'ArrowDown' }

/**
 * 不能指定的鍵：修飾鍵（Shift = 佇列、Alt = 信號、Ctrl／Meta 是瀏覽器快捷鍵）、瀏覽器保留鍵（重新整理、全螢幕、開發者工具）、
 * 輸入法與系統鍵。固定動作的鍵（Esc、G、Tab、F1）另外看 fixedOwner。
 */
const SYSTEM_RESERVED = new Set([
  'ShiftLeft',
  'ShiftRight',
  'ControlLeft',
  'ControlRight',
  'AltLeft',
  'AltRight',
  'MetaLeft',
  'MetaRight',
  'OSLeft',
  'OSRight',
  'CapsLock',
  'NumLock',
  'ScrollLock',
  'ContextMenu',
  'PrintScreen',
  'Fn',
  'FnLock',
  'F5',
  'F11',
  'F12',
  'Lang1',
  'Lang2',
  'KanaMode',
  'Convert',
  'NonConvert',
  'Unidentified',
])

export function isSystemReserved(code: string): boolean {
  return !code || SYSTEM_RESERVED.has(code)
}

/** 這個鍵被哪個固定動作佔用（不能指定給別的動作）*/
export function fixedOwner(code: string): ActionId | null {
  for (const a of ACTIONS) if (a.fixed && a.def === code) return a.id
  return null
}

export type KeyMap = Record<ActionId, string>

export function defaultKeymap(): KeyMap {
  const m = {} as KeyMap
  for (const a of ACTIONS) m[a.id] = a.def
  return m
}

const STORE = 'xc.keymap'

function storage(): Storage | null {
  try {
    return typeof localStorage !== 'undefined' ? localStorage : null
  } catch {
    return null
  }
}

/** 一組按鍵有沒有重複（未設定的不算）*/
function hasDup(m: KeyMap): boolean {
  const seen = new Set<string>()
  for (const id of ACTION_IDS) {
    const c = m[id]
    if (!c) continue
    if (seen.has(c)) return true
    seen.add(c)
  }
  return false
}

/** 讀存檔：只套用認得的動作與可以指定的鍵；存檔壞了（重複、格式不對）就整個用預設 */
export function loadKeymap(): KeyMap {
  const m = defaultKeymap()
  try {
    const raw = storage()?.getItem(STORE)
    if (!raw) return m
    const v = JSON.parse(raw) as unknown
    if (!v || typeof v !== 'object' || Array.isArray(v)) return m
    for (const [id, code] of Object.entries(v as Record<string, unknown>)) {
      const a = ACTION_BY_ID.get(id as ActionId)
      if (!a || a.fixed || typeof code !== 'string') continue
      if (code && (isSystemReserved(code) || fixedOwner(code))) continue
      m[a.id] = code
    }
    return hasDup(m) ? defaultKeymap() : m
  } catch {
    return defaultKeymap()
  }
}

function saveKeymap(m: KeyMap): void {
  const diff: Record<string, string> = {}
  for (const a of ACTIONS) if (!a.fixed && m[a.id] !== a.def) diff[a.id] = m[a.id]
  try {
    const s = storage()
    if (!s) return
    if (Object.keys(diff).length) s.setItem(STORE, JSON.stringify(diff))
    else s.removeItem(STORE)
  } catch {
    /* ignore */
  }
}

/** 目前的按鍵（動作 → code）*/
export const keymap = signal<KeyMap>(loadKeymap())

/** code → 動作（反查；固定動作也在裡面）*/
const byCode = computed(() => {
  const m = new Map<string, ActionId>()
  const km = keymap.value
  for (const id of ACTION_IDS) if (km[id]) m.set(km[id], id)
  return m
})

/** 動作目前的鍵（code；'' = 沒有按鍵）*/
export function codeFor(id: ActionId): string {
  return keymap.value[id] ?? ''
}

/** 這個鍵（code）對應的動作；沒有回傳 null */
export function actionFor(code: string): ActionId | null {
  return (code && byCode.value.get(code)) || null
}

export type BindResult =
  | { ok: true; id: ActionId; code: string; swapped?: ActionId; swappedTo?: string }
  | { ok: false; id: ActionId; code: string; reason: 'fixed' | 'reserved' | 'system' | 'same'; owner?: ActionId }

/**
 * 把動作指定成新的鍵。新鍵已經被別的動作用了：兩個交換（那個動作換成這個動作原本的鍵，可能是「沒有按鍵」），
 * 回傳 swapped 讓設定頁說明。固定動作不能改；修飾鍵、瀏覽器保留鍵、固定動作的鍵不能指定。
 */
export function bindKey(id: ActionId, code: string): BindResult {
  const a = ACTION_BY_ID.get(id)
  if (!a || a.fixed) return { ok: false, id, code, reason: 'fixed' }
  if (isSystemReserved(code)) return { ok: false, id, code, reason: 'system' }
  const owner = fixedOwner(code)
  if (owner) return { ok: false, id, code, reason: 'reserved', owner }
  const cur = keymap.value
  if (cur[id] === code) return { ok: false, id, code, reason: 'same' }
  const next = { ...cur }
  const other = ACTION_IDS.find((x) => x !== id && cur[x] === code)
  const old = cur[id]
  next[id] = code
  if (other) next[other] = old
  keymap.value = next
  saveKeymap(next)
  return other ? { ok: true, id, code, swapped: other, swappedTo: old } : { ok: true, id, code }
}

/** 恢復全部預設 */
export function resetKeymap(): void {
  keymap.value = defaultKeymap()
  saveKeymap(keymap.value)
}

/** 按鍵設定面板正在等玩家按新鍵（設定頁的 Esc 關閉、遊戲快捷鍵這時都不要處理）*/
export const keyCapturing = signal(false)

// ───────── 顯示用的按鍵名稱 ─────────

/** 鍵盤配置（code → 這個鍵打出來的字；Chromium 的 navigator.keyboard.getLayoutMap）；null = 拿不到 */
export const layoutMap = signal<ReadonlyMap<string, string> | null>(null)

interface KeyboardLike {
  getLayoutMap?: () => Promise<ReadonlyMap<string, string>>
}

/** 重新讀鍵盤配置（切換輸入法配置後回到視窗時）*/
export function refreshLayout(): void {
  try {
    const kb = (typeof navigator !== 'undefined' ? (navigator as unknown as { keyboard?: KeyboardLike }).keyboard : undefined) ?? undefined
    if (!kb?.getLayoutMap) return
    kb.getLayoutMap().then(
      (m) => {
        const next = new Map<string, string>()
        m.forEach((v, k) => next.set(k, v))
        const prev = layoutMap.value
        // 沒變就不觸發重繪
        if (prev && prev.size === next.size && [...next].every(([k, v]) => prev.get(k) === v)) return
        layoutMap.value = next
      },
      () => {},
    )
  } catch {
    /* 跨來源 iframe 等情況會丟例外：用 code 推 */
  }
}

if (typeof window !== 'undefined') {
  refreshLayout()
  window.addEventListener('focus', refreshLayout)
}

const NAMED: Record<string, string> = {
  Space: 'Space',
  Enter: 'Enter',
  NumpadEnter: 'Enter',
  Escape: 'Esc',
  Tab: 'Tab',
  Backspace: 'Bksp',
  Delete: 'Del',
  Insert: 'Ins',
  Home: 'Home',
  End: 'End',
  PageUp: 'PgUp',
  PageDown: 'PgDn',
  ArrowLeft: '←',
  ArrowRight: '→',
  ArrowUp: '↑',
  ArrowDown: '↓',
  Backquote: '`',
  Minus: '-',
  Equal: '=',
  BracketLeft: '[',
  BracketRight: ']',
  Backslash: '\\',
  IntlBackslash: '\\',
  Semicolon: ';',
  Quote: "'",
  Comma: ',',
  Period: '.',
  Slash: '/',
  NumpadAdd: 'Num+',
  NumpadSubtract: 'Num-',
  NumpadMultiply: 'Num*',
  NumpadDivide: 'Num/',
  NumpadDecimal: 'Num.',
}

/** 符號鍵：各國鍵盤配置印的字不同，先查 layoutMap */
const PUNCT = new Set(['Backquote', 'Minus', 'Equal', 'BracketLeft', 'BracketRight', 'Backslash', 'IntlBackslash', 'Semicolon', 'Quote', 'Comma', 'Period', 'Slash'])

/**
 * 按鍵的顯示名稱（HUD 鍵帽、說明、設定頁）。字母與符號鍵依鍵盤配置（AZERTY 的 KeyQ → A）；
 * 數字列一律顯示數字（AZERTY 不按 Shift 是 &é"…，鍵帽上也印著數字）；'' = 沒有按鍵。
 */
export function keyLabel(code: string, layout: ReadonlyMap<string, string> | null = layoutMap.value): string {
  if (!code) return ''
  const dg = /^Digit(\d)$/.exec(code)
  if (dg) return dg[1]
  const np = /^Numpad(\d)$/.exec(code)
  if (np) return 'Num' + np[1]
  if (/^F\d{1,2}$/.test(code)) return code
  // 功能鍵（Space、方向鍵…）用固定名稱；符號鍵先看鍵盤配置（各國配置的符號不同）
  if (NAMED[code] && !PUNCT.has(code)) return NAMED[code]
  const ch = layout?.get(code)
  if (ch && ch.trim() && ch.length <= 2) return ch.toUpperCase()
  const k = /^Key([A-Z])$/.exec(code)
  if (k) return k[1]
  return NAMED[code] ?? code
}

/** 動作目前的鍵的顯示名稱（'' = 沒有按鍵）*/
export function actionLabel(id: ActionId): string {
  return keyLabel(codeFor(id))
}
