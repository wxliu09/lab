import { snapTick, world } from '../../client/session'
import { t } from '../i18n'

export function GameScreen() {
  void snapTick.value
  const me = world.me
  return (
    <div class="layer" data-testid="game">
      <div class="panel hud-top">
        <span>{t('game.time')} {Math.floor((world.w.t ?? 0) / 60)}:{String((world.w.t ?? 0) % 60).padStart(2, '0')}</span>
        <span data-testid="role">{me.role ? t('role.' + me.role) : ''}</span>
      </div>
    </div>
  )
}
