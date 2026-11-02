// 遊戲選單（Esc）：繼續、進化、說明、圖鑑、設定、離開對局。原本對局中沒有任何離開的方法，Esc 又被拿去開進化選單。
import { useLayoutEffect } from 'preact/hooks'
import { evolveOpen, menuOpen } from '../../client/input'
import { isHost, leave, world } from '../../client/session'
import { t } from '../i18n'
import { guideOpen } from './Guide'
import { codexOpen } from './Codex'
import { settingsOpen } from '../screens/Settings'

export function GameMenu() {
  const open = menuOpen.value
  // Esc 在 capture 階段攔下：只關選單，不要再被其他快捷鍵處理
  useLayoutEffect(() => {
    if (!open) return
    const k = (e: KeyboardEvent) => {
      if (e.code !== 'Escape') return
      e.stopImmediatePropagation()
      menuOpen.value = false
    }
    window.addEventListener('keydown', k, true)
    return () => window.removeEventListener('keydown', k, true)
  }, [open])
  if (!open) return null
  const me = world.me
  const canEvolve = me.role === 'xeno' || me.role === 'mutant' || me.role === 'android'
  const go = (f: () => void) => () => {
    menuOpen.value = false
    f()
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
          <button onClick={go(() => (guideOpen.value = true))}>{t('gmenu.help')}</button>
          <button onClick={go(() => (codexOpen.value = true))}>{t('gmenu.codex')}</button>
          <button onClick={go(() => (settingsOpen.value = true))}>{t('gmenu.settings')}</button>
          <div class="sep" />
          <button
            class="ghost"
            data-testid="leave-game"
            onClick={() => {
              const msg = t('gmenu.leaveConfirm') + (isHost.value ? '\n' + t('gmenu.leaveHost') : '')
              if (window.confirm(msg)) {
                menuOpen.value = false
                leave()
              }
            }}
          >
            {t('gmenu.leave')}
          </button>
        </div>
      </div>
    </div>
  )
}
