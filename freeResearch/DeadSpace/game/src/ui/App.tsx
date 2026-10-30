import { screen } from '../client/session'
import { Menu } from './screens/Menu'
import { Lobby } from './screens/Lobby'
import { GameScreen } from './screens/GameScreen'
import { MenuBackdrop } from './MenuBackdrop'

export function App() {
  const s = screen.value
  return (
    <>
      {s !== 'game' && <MenuBackdrop />}
      {(s === 'menu' || s === 'connecting') && <Menu />}
      {s === 'lobby' && <Lobby />}
      {s === 'game' && <GameScreen />}
    </>
  )
}
