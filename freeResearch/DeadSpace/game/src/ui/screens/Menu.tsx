import { useEffect, useState } from 'preact/hooks'
import { MAX_PLAYERS, PLAYER_COLORS, ROOM_ALPHABET } from '../../shared/constants'
import { DEFAULT_SETTINGS, PRACTICE_ROLES, type PracticeRole } from '../../shared/protocol/messages'
import { cancelJoin, createRoom, joinRoom, loadProfile, notice, screen, startPractice } from '../../client/session'
import { t } from '../i18n'
import { Settings } from './Settings'
import { codexOpen } from '../hud/Codex'
import { loadNetSettings } from '../../net/trystero'
import { RoleMixView, roleOutcomes } from './Lobby'
import '../lobby2.css'

const PRACTICE_KEY = 'xc.practice'

function loadPracticePrefs(): { role: PracticeRole; bots: number } {
  try {
    const raw = JSON.parse(localStorage.getItem(PRACTICE_KEY) ?? 'null') as { role?: unknown; bots?: unknown } | null
    if (raw) {
      const role = PRACTICE_ROLES.includes(raw.role as PracticeRole) ? (raw.role as PracticeRole) : 'random'
      const bots = typeof raw.bots === 'number' && raw.bots >= 1 && raw.bots <= MAX_PLAYERS - 1 ? Math.round(raw.bots) : 5
      return { role, bots }
    }
  } catch {
    /* ignore */
  }
  return { role: 'random', bots: 5 }
}

function savePracticePrefs(p: { role: PracticeRole; bots: number }): void {
  try {
    localStorage.setItem(PRACTICE_KEY, JSON.stringify(p))
  } catch {
    /* ignore */
  }
}

/** 單機練習對話框：選自己的身分與 AI 數量（只有單機練習有這個入口；多人房間的身分一律照規則抽）*/
function PracticeDialog({ onClose, onStart }: { onClose: () => void; onStart: (role: PracticeRole, bots: number) => void }) {
  const [pref] = useState(loadPracticePrefs)
  const [role, setRole] = useState<PracticeRole>(pref.role)
  const [bots, setBots] = useState(pref.bots)
  useEffect(() => {
    const key = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose()
    }
    window.addEventListener('keydown', key)
    return () => window.removeEventListener('keydown', key)
  }, [onClose])
  const n = bots + 1
  const go = () => {
    savePracticePrefs({ role, bots })
    onStart(role, bots)
  }
  return (
    <div class="modal-back" onClick={(e) => e.target === e.currentTarget && onClose()}>
      <div class="panel modal practice-modal" data-testid="practice-dialog" role="dialog" aria-modal="true" aria-labelledby="practice-title">
        <h2 id="practice-title">{t('practice.title')}</h2>
        <div class="practice-sub">{t('practice.sub')}</div>
        <h3>{t('practice.role')}</h3>
        <div class="role-pick" role="radiogroup">
          {PRACTICE_ROLES.map((r) => (
            <button
              key={r}
              type="button"
              role="radio"
              aria-checked={role === r}
              class={'role-opt r-' + r + (role === r ? ' on' : '')}
              data-testid={'practice-role-' + r}
              onClick={() => setRole(r)}
            >
              <b>{t('practice.r.' + r)}</b>
              <span>{t('practice.r.' + r + '.d')}</span>
            </button>
          ))}
        </div>
        <h3>{t('practice.bots')}</h3>
        <div class="bots-row">
          <button type="button" class="small ghost" aria-label="−" disabled={bots <= 1} onClick={() => setBots(Math.max(1, bots - 1))}>
            −
          </button>
          <input
            type="range"
            data-testid="practice-bots"
            min={1}
            max={MAX_PLAYERS - 1}
            value={bots}
            onInput={(e) => setBots(Number((e.target as HTMLInputElement).value))}
          />
          <button type="button" class="small ghost" aria-label="+" disabled={bots >= MAX_PLAYERS - 1} onClick={() => setBots(Math.min(MAX_PLAYERS - 1, bots + 1))}>
            +
          </button>
          <span class="bots-n">{t('practice.botsN', { n: bots })}</span>
        </div>
        <div class="practice-mix" data-testid="practice-mix">
          {role === 'random' ? (
            <>
              <span class="mix-self">{t('practice.mix.all', { n })}</span>
              <RoleMixView outcomes={roleOutcomes(n, DEFAULT_SETTINGS)} total={n} />
            </>
          ) : (
            <>
              <span class="mix-self">{t('practice.mix.self', { role: t('practice.r.' + role) })}</span>
              <span class="dim">·</span>
              <span class="dim">{t('practice.mix.others')}</span>
              <RoleMixView outcomes={roleOutcomes(n, DEFAULT_SETTINGS, role)} total={n - 1} />
            </>
          )}
        </div>
        <div class="practice-foot">
          <button type="button" class="ghost" onClick={onClose}>
            {t('practice.cancel')}
          </button>
          <button type="button" class="primary" data-testid="practice-start" onClick={go}>
            {t('practice.start')}
          </button>
        </div>
      </div>
    </div>
  )
}

export function Menu() {
  const prof = loadProfile()
  const [name, setName] = useState(prof.name)
  const [color, setColor] = useState(prof.color)
  const [code, setCode] = useState(() => new URLSearchParams(location.hash.slice(1)).get('room') ?? '')
  const [showSettings, setShowSettings] = useState(false)
  const [showPractice, setShowPractice] = useState(false)
  const connecting = screen.value === 'connecting'
  // 連線中按 Esc 等同按「取消」（設定、練習對話框、圖鑑開著時 Esc 留給它們關閉自己）
  useEffect(() => {
    if (!connecting) return
    const key = (e: KeyboardEvent) => {
      if (e.key !== 'Escape' || showSettings || showPractice || codexOpen.value) return
      e.preventDefault()
      cancelJoin()
    }
    window.addEventListener('keydown', key)
    return () => window.removeEventListener('keydown', key)
  }, [connecting, showSettings, showPractice])
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
          <label for="room-code" class="code-label">
            {t('menu.codeLabel')}
          </label>
          <div class="row">
            <input
              id="room-code"
              class="code"
              data-testid="code"
              maxLength={5}
              aria-label={t('menu.codeLabel')}
              autoComplete="off"
              spellcheck={false}
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
            <button class="ghost grow" data-testid="practice" disabled={connecting} title={t('practice.hint')} onClick={() => setShowPractice(true)}>
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
        <div class="notice row" data-testid="notice">
          <span class="grow">
            {connecting ? t('menu.connecting') : ''} {notice.value}
          </span>
          {connecting && (
            <button class="small ghost" data-testid="cancel-join" onClick={() => cancelJoin()}>
              {t('menu.cancelJoin')}
            </button>
          )}
        </div>
      </div>
      <div class="foot">
        {t('menu.netHint', { strategy: loadNetSettings().strategy })} · {t('menu.homage')}
      </div>
      {showSettings && <Settings onClose={() => setShowSettings(false)} />}
      {showPractice && (
        <PracticeDialog
          onClose={() => setShowPractice(false)}
          onStart={(role, bots) => {
            setShowPractice(false)
            void startPractice(profile(), bots, role)
          }}
        />
      )}
    </>
  )
}
