// 遊戲選單（Esc）：繼續、進化、調查筆記、說明、圖鑑、設定、離開對局。原本對局中沒有任何離開的方法，Esc 又被拿去開進化選單。
// 調查筆記（第 4 輪）：只用滑鼠的人也打得開（原本只有 Tab）。
// 離開對局用遊戲內的確認對話框（不用瀏覽器原生 confirm）：Esc 取消、回到選單；練習局用單機的說法。
// 關分頁時的 beforeunload 原生確認在 App.tsx，不歸這裡管。
import { useLayoutEffect, useRef, useState } from 'preact/hooks'
import { evolveOpen, menuOpen } from '../../client/input'
import { currentRoom, isHost, leave, world } from '../../client/session'
import { PRACTICE_ROOM } from '../../shared/protocol/messages'
import { t } from '../i18n'
import { guideOpen } from './Guide'
import { codexOpen } from './Codex'
import { notesOpen } from './Investigation'
import { settingsOpen } from '../screens/Settings'
import { leaveText } from './textRules'

export function GameMenu() {
  const open = menuOpen.value
  const [confirming, setConfirming] = useState(false)
  const confirmRef = useRef(false)
  confirmRef.current = confirming
  const cancelBtn = useRef<HTMLButtonElement>(null)
  // Esc 在 capture 階段攔下：確認對話框開著時只取消確認（回到選單），否則關選單；都不要再被其他快捷鍵處理
  useLayoutEffect(() => {
    if (!open) {
      setConfirming(false)
      return
    }
    const k = (e: KeyboardEvent) => {
      if (e.code !== 'Escape') return
      e.preventDefault()
      e.stopImmediatePropagation()
      if (confirmRef.current) setConfirming(false)
      else menuOpen.value = false
    }
    window.addEventListener('keydown', k, true)
    return () => window.removeEventListener('keydown', k, true)
  }, [open])
  // 確認對話框打開時把焦點放在「取消」：離開不可逆，手滑按到 Enter 也不會離開
  useLayoutEffect(() => {
    if (confirming) cancelBtn.current?.focus()
  }, [confirming])
  if (!open) return null
  const me = world.me
  const canEvolve = me.role === 'xeno' || me.role === 'mutant' || me.role === 'android'
  const go = (f: () => void) => () => {
    menuOpen.value = false
    f()
  }
  if (confirming) {
    const txt = leaveText(currentRoom() === PRACTICE_ROOM, isHost.value)
    return (
      <div class="modal-back" data-testid="game-menu" onClick={() => setConfirming(false)}>
        <div class="panel modal gmenu leave-confirm" role="alertdialog" aria-modal="true" aria-labelledby="leave-title" aria-describedby="leave-body" data-testid="leave-confirm" onClick={(e) => e.stopPropagation()}>
          <h2 id="leave-title">{t('ui5.leave.title')}</h2>
          <p id="leave-body" class="leave-body">
            {t(txt.body)}
          </p>
          <div class="row leave-actions">
            <button ref={cancelBtn} class="ghost grow" data-testid="leave-cancel" onClick={() => setConfirming(false)}>
              {t('ui5.leave.cancel')}
            </button>
            <button
              class="danger grow"
              data-testid="leave-ok"
              onClick={() => {
                setConfirming(false)
                menuOpen.value = false
                leave()
              }}
            >
              {t(txt.ok)}
            </button>
          </div>
        </div>
      </div>
    )
  }
  return (
    <div class="modal-back" data-testid="game-menu" onClick={() => (menuOpen.value = false)}>
      <div class="panel modal gmenu" onClick={(e) => e.stopPropagation()}>
        <h2>{t('gmenu.title')}</h2>
        <div class="col" style={{ gap: '8px' }}>
          <button class="primary" onClick={() => (menuOpen.value = false)}>
            {t('gmenu.resume')}
          </button>
          {canEvolve && me.alive !== false && <button onClick={go(() => (evolveOpen.value = true))}>{t('gmenu.evolve')}</button>}
          <button data-testid="gmenu-notes" onClick={go(() => (notesOpen.value = true))}>
            {t('notes.title')}
          </button>
          <button onClick={go(() => (guideOpen.value = true))}>{t('gmenu.help')}</button>
          <button onClick={go(() => (codexOpen.value = true))}>{t('gmenu.codex')}</button>
          <button onClick={go(() => (settingsOpen.value = true))}>{t('gmenu.settings')}</button>
          <div class="sep" />
          <button class="ghost" data-testid="leave-game" onClick={() => setConfirming(true)}>
            {t('gmenu.leave')}
          </button>
        </div>
      </div>
    </div>
  )
}
