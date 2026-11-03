import { useEffect } from 'preact/hooks'
import { isHost, lobby, screen } from '../client/session'
import { PRACTICE_ROOM } from '../shared/protocol/messages'
import { Menu } from './screens/Menu'
import { Lobby } from './screens/Lobby'
import { GameScreen } from './screens/GameScreen'
import { MenuBackdrop } from './MenuBackdrop'
import { Codex } from './hud/Codex'
import { TooltipLayer } from './tooltip'
import { t } from './i18n'

/**
 * 對局中（或在大廳當主機）關分頁、重新整理前先確認：主機一走整房都斷線。
 * 測試 build（e2e 會重新整理頁面）預設不掛，localStorage 設 xc.unloadGuard=1 才掛。
 */
function unloadGuardOn(): boolean {
  if (!__TEST_HOOKS__) return true
  try {
    return localStorage.getItem('xc.unloadGuard') === '1'
  } catch {
    return false
  }
}

function useUnloadGuard(active: boolean): void {
  useEffect(() => {
    if (!active || !unloadGuardOn()) return
    const h = (e: BeforeUnloadEvent) => {
      e.preventDefault()
      // 舊瀏覽器要設定 returnValue 才會跳確認（文字由瀏覽器決定）
      e.returnValue = t('leave3.confirm')
      return e.returnValue
    }
    window.addEventListener('beforeunload', h)
    return () => window.removeEventListener('beforeunload', h)
  }, [active])
}

export function App() {
  const s = screen.value
  useUnloadGuard(s === 'game' || (s === 'lobby' && isHost.value))
  return (
    <>
      {s !== 'game' && <MenuBackdrop />}
      {(s === 'menu' || s === 'connecting') && <Menu />}
      {/* 單機練習會直接開局：不顯示大廳（裡面「人數不足」的提示會誤導），改顯示準備中 */}
      {s === 'lobby' && lobby.value?.code === PRACTICE_ROOM && (
        <div class="modal-back" data-testid="practice-loading">
          <div class="panel modal" style={{ textAlign: 'center', width: 'min(420px, 92vw)' }}>
            {t('load.practice')}
          </div>
        </div>
      )}
      {s === 'lobby' && lobby.value?.code !== PRACTICE_ROOM && <Lobby />}
      {s === 'game' && <GameScreen />}
      <Codex />
      <TooltipLayer />
    </>
  )
}
