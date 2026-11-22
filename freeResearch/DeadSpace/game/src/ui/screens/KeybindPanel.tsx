// 按鍵設定面板（設定頁內，第 7 輪）：分組列出 input.ts 的每個動作；點一下再按新鍵（Esc 取消）；
// 新鍵已經有人用就交換並說明；固定鍵（Esc、說明、筆記、圖鑑）只顯示；「恢復預設」。即時存檔（keymap.ts）。
import { useLayoutEffect, useRef, useState } from 'preact/hooks'
import { t } from '../i18n'
import { ACTIONS, bindKey, keyCapturing, keyLabel, keymap, layoutMap, resetKeymap, type ActionGroup, type ActionId, type BindResult } from '../../client/keymap'
import '../strings/feel7'

const GROUPS: ActionGroup[] = ['ability', 'item', 'command', 'camera', 'ui']

/** 動作的顯示名稱 */
export function actionName(id: ActionId): string {
  const m = /^(ability|item)(\d)$/.exec(id)
  return m ? t('feel7.kb.a.' + m[1], { n: m[2] }) : t('feel7.kb.a.' + id)
}

/** 指定結果的說明（ok = 成功，顯示成綠色；否則黃色警告）*/
export function bindMessage(r: BindResult, pressed = ''): { text: string; ok: boolean } {
  const k = keyLabel(r.code) || pressed || r.code
  if (r.ok) {
    const a = actionName(r.id)
    if (!r.swapped) return { text: t('feel7.kb.set', { a, k }), ok: true }
    const b = actionName(r.swapped)
    return r.swappedTo ? { text: t('feel7.kb.swapped', { a, k, b, old: keyLabel(r.swappedTo) }), ok: false } : { text: t('feel7.kb.swappedNone', { a, k, b }), ok: false }
  }
  if (r.reason === 'same') return { text: t('feel7.kb.set', { a: actionName(r.id), k }), ok: true }
  if (r.reason === 'reserved' && r.owner) return { text: t('feel7.kb.reserved', { k, b: actionName(r.owner) }), ok: false }
  return { text: t('feel7.kb.system', { k }), ok: false }
}

/**
 * 按鍵設定。collapsible = 收在可展開的區塊裡（預設；設定頁很長，標題由設定頁的小標題負責）；
 * false = 直接列出、自帶標題（另外給一個分頁時用）。
 * 等新鍵時在 window 的 capture 階段攔下按鍵（比遊戲快捷鍵、設定頁的 Esc 關閉都早），並設 keyCapturing。
 */
export function KeybindPanel({ collapsible = true }: { collapsible?: boolean }) {
  const [cap, setCap] = useState<ActionId | null>(null)
  const [msg, setMsg] = useState<{ text: string; ok: boolean } | null>(null)
  const capRef = useRef<ActionId | null>(null)
  capRef.current = cap
  // 訂閱：改鍵、換鍵盤配置後重畫
  const km = keymap.value
  void layoutMap.value
  const start = (id: ActionId | null) => {
    capRef.current = id
    setCap(id)
    keyCapturing.value = !!id
  }
  // 掛上時就登記（子元件的 layout effect 比設定頁的早跑：Esc 先到這裡，取消等待而不是關掉設定）
  useLayoutEffect(() => {
    const k = (e: KeyboardEvent) => {
      const id = capRef.current
      if (!id) return
      e.preventDefault()
      e.stopImmediatePropagation()
      if (e.repeat) return
      if (e.code === 'Escape') {
        start(null)
        setMsg({ text: t('feel7.kb.cancel'), ok: true })
        return
      }
      const r = bindKey(id, e.code)
      setMsg(bindMessage(r, e.key.length === 1 ? e.key.toUpperCase() : e.key))
      // 修飾鍵、保留鍵：繼續等（玩家多半只是手滑）；其他都結束
      if (r.ok || r.reason === 'same') start(null)
    }
    window.addEventListener('keydown', k, true)
    return () => {
      window.removeEventListener('keydown', k, true)
      keyCapturing.value = false
    }
  }, [])
  const body = (
    <>
      <div class="dim settings-adv-note">{t('feel7.kb.note')}</div>
      {GROUPS.map((g) => (
        <div key={g} data-testid={'kb-group-' + g}>
          <div class="dim" style={{ fontSize: '12px', letterSpacing: '0.06em', margin: '10px 0 2px', color: 'var(--human)' }}>
            {t('feel7.kb.g.' + g)}
          </div>
          {ACTIONS.filter((a) => a.group === g).map((a) => {
            const label = keyLabel(km[a.id])
            const waiting = cap === a.id
            return (
              <div class="setrow" key={a.id} data-testid={'kb-row-' + a.id}>
                <label style={{ fontSize: '14px' }}>{actionName(a.id)}</label>
                {a.fixed ? (
                  <span class="mono dim" data-testid={'kb-' + a.id} title={t('feel7.kb.fixedTip')} style={{ minWidth: '92px', textAlign: 'center', fontSize: '13px', padding: '5px 10px', border: '1px dashed var(--line)', borderRadius: '3px' }}>
                    {label} · {t('feel7.kb.fixed')}
                  </span>
                ) : (
                  <button
                    class={'small mono ' + (waiting ? 'primary' : 'ghost')}
                    data-testid={'kb-' + a.id}
                    data-code={km[a.id]}
                    aria-pressed={waiting}
                    style={{ minWidth: '92px', fontFamily: 'var(--mono)', color: label ? undefined : 'var(--dim)' }}
                    onClick={() => {
                      setMsg(null)
                      start(waiting ? null : a.id)
                    }}
                    onBlur={() => capRef.current === a.id && start(null)}
                  >
                    {waiting ? t('feel7.kb.press') : label || t('feel7.kb.none')}
                  </button>
                )}
              </div>
            )
          })}
        </div>
      ))}
      <div class="row" style={{ alignItems: 'center', gap: '10px', marginTop: '10px' }}>
        <span class="notice grow" data-testid="kb-msg" style={msg?.ok ? { color: 'var(--good)' } : undefined} aria-live="polite">
          {msg?.text ?? ''}
        </span>
        <button
          class="small ghost"
          data-testid="kb-reset"
          onClick={() => {
            start(null)
            resetKeymap()
            setMsg({ text: t('feel7.kb.resetDone'), ok: true })
          }}
        >
          {t('feel7.kb.reset')}
        </button>
      </div>
    </>
  )
  if (!collapsible)
    return (
      <div data-testid="keybind-panel">
        <h3 style={{ margin: '8px 0 2px' }}>{t('feel7.kb.title')}</h3>
        {body}
      </div>
    )
  return (
    <details class="settings-adv" data-testid="keybind-panel">
      <summary data-testid="keybind-open">{t('feel7.kb.open')}</summary>
      {body}
    </details>
  )
}
