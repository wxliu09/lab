import { screen } from '../client/session'
import { Menu } from './screens/Menu'
import { Lobby } from './screens/Lobby'
import { GameScreen } from './screens/GameScreen'
import { MenuBackdrop } from './MenuBackdrop'
import { Codex } from './hud/Codex'
import { TooltipLayer } from './tooltip'

export function App() {
  const s = screen.value
  return (
    <>
      {s !== 'game' && <MenuBackdrop />}
      {(s === 'menu' || s === 'connecting') && <Menu />}
      {s === 'lobby' && <Lobby />}
      {s === 'game' && <GameScreen />}
      <Codex />
      <TooltipLayer />
    </>
  )
}
