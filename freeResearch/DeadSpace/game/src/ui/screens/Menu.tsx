import { useState } from 'preact/hooks'
import { PLAYER_COLORS, ROOM_ALPHABET } from '../../shared/constants'
import { createRoom, joinRoom, loadProfile, notice, screen, startPractice } from '../../client/session'
import { t } from '../i18n'
import { Settings } from './Settings'
import { codexOpen } from '../hud/Codex'
import { loadNetSettings } from '../../net/trystero'

export function Menu() {
  const prof = loadProfile()
  const [name, setName] = useState(prof.name)
  const [color, setColor] = useState(prof.color)
  const [code, setCode] = useState(() => new URLSearchParams(location.hash.slice(1)).get('room') ?? '')
  const [showSettings, setShowSettings] = useState(false)
  const connecting = screen.value === 'connecting'
  const profile = () => ({ name: name.trim() || 'Crew', color })
  const validCode = code.length === 5 && [...code.toUpperCase()].every((ch) => ROOM_ALPHABET.includes(ch))
  return (
    <>
      <div class="panel menu" data-testid="menu">
        <div class="logo">XENOCYTE</div>
        <div class="logo-sub">異 胞</div>
        <div class="tagline">{t('app.tagline')}</div>
        <div class="col">
          <label>{t('menu.name')}</label>
          <input
            data-testid="name"
            maxLength={16}
            value={name}
            onInput={(e) => setName((e.target as HTMLInputElement).value)}
            placeholder="Crew"
          />
          <label>{t('menu.color')}</label>
          <div class="swatches">
            {PLAYER_COLORS.map((c, i) => (
              <div
                key={c.id}
                class={'swatch' + (i === color ? ' on' : '')}
                style={{ background: c.hex, color: c.hex }}
                title={c.id}
                onClick={() => setColor(i)}
              />
            ))}
          </div>
        </div>
        <div class="sep" />
        <div class="col">
          <button class="primary" data-testid="create" disabled={connecting} onClick={() => void createRoom(profile())}>
            {t('menu.create')}
          </button>
          <div class="row">
            <input
              class="code"
              data-testid="code"
              maxLength={5}
              value={code}
              placeholder="XXXXX"
              onInput={(e) => setCode((e.target as HTMLInputElement).value.toUpperCase())}
              onKeyDown={(e) => {
                if (e.key === 'Enter' && validCode) void joinRoom(code, profile())
              }}
            />
            <button class="grow" data-testid="join" disabled={!validCode || connecting} onClick={() => void joinRoom(code, profile())}>
              {t('menu.join')}
            </button>
          </div>
          <div class="row">
            <button class="ghost grow" data-testid="practice" disabled={connecting} title={t('menu.practiceHint')} onClick={() => void startPractice(profile(), 5)}>
              {t('menu.practice')}
            </button>
            <button class="ghost grow" data-testid="codex-open" onClick={() => (codexOpen.value = true)}>
              {t('codex.title')}
            </button>
            <button class="ghost grow" onClick={() => setShowSettings(true)}>
              {t('menu.settings')}
            </button>
          </div>
        </div>
        <div class="notice" data-testid="notice">
          {connecting ? t('menu.connecting') : ''} {notice.value}
        </div>
      </div>
      <div class="foot">
        {t('menu.netHint', { strategy: loadNetSettings().strategy })} · 致敬 Metastasis（FelFox &amp; Clan Sirs）
      </div>
      {showSettings && <Settings onClose={() => setShowSettings(false)} />}
    </>
  )
}
