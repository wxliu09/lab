import { useState } from 'preact/hooks'
import { PLAYER_COLORS } from '../../shared/constants'
import type { LobbySettings } from '../../shared/protocol/messages'
import { chatLog, hostConflict, isHost, leave, lobby, mySlot, send } from '../../client/session'
import { sysText, t } from '../i18n'

function Tri({ k, s }: { k: 'aliens' | 'mutants' | 'androids'; s: LobbySettings }) {
  const v = s[k]
  return (
    <select
      disabled={!isHost.value}
      value={String(v)}
      onChange={(e) => {
        const raw = (e.target as HTMLSelectElement).value
        send({ t: 'settings', s: { [k]: raw === 'auto' ? 'auto' : Number(raw) } as Partial<LobbySettings> })
      }}
    >
      <option value="auto">{t('lobby.set.auto')}</option>
      <option value="0">{t('lobby.set.off')}</option>
      <option value="1">{t('lobby.set.on')}</option>
    </select>
  )
}

function Num({ k, s, min, max, step = 1 }: { k: keyof LobbySettings; s: LobbySettings; min: number; max: number; step?: number }) {
  return (
    <input
      type="number"
      style={{ width: '70px' }}
      disabled={!isHost.value}
      min={min}
      max={max}
      step={step}
      value={s[k] as number}
      onChange={(e) => {
        const n = Number((e.target as HTMLInputElement).value)
        if (Number.isFinite(n)) send({ t: 'settings', s: { [k]: Math.max(min, Math.min(max, n)) } as Partial<LobbySettings> })
      }}
    />
  )
}

function Check({ k, s }: { k: keyof LobbySettings; s: LobbySettings }) {
  return (
    <input
      type="checkbox"
      disabled={!isHost.value}
      checked={!!s[k]}
      onChange={(e) => send({ t: 'settings', s: { [k]: (e.target as HTMLInputElement).checked } as Partial<LobbySettings> })}
    />
  )
}

export function Lobby() {
  const L = lobby.value
  const [msg, setMsg] = useState('')
  const [copied, setCopied] = useState(false)
  if (!L) return <div class="panel modal">{t('menu.connecting')}</div>
  const me = L.players.find((p) => p.slot === mySlot.value)
  const s = L.settings
  const taken = new Set(L.players.filter((p) => p.slot !== mySlot.value).map((p) => p.color))
  const copy = () => {
    const url = `${location.origin}${location.pathname}${location.search}#room=${L.code}`
    void navigator.clipboard?.writeText(url).then(() => setCopied(true))
  }
  return (
    <div class="lobby" data-testid="lobby">
      <div class="panel lobby-head">
        <div>
          <label>{t('lobby.code')}</label>
          <div class="roomcode" data-testid="roomcode">
            {L.code}
          </div>
        </div>
        <button class="small" onClick={copy}>
          {copied ? t('lobby.copied') : t('lobby.copy')}
        </button>
        <div class="grow" />
        {hostConflict.value && <div class="notice">{t('lobby.hostConflict')}</div>}
        <div class="logo" style={{ fontSize: '26px' }}>
          XENOCYTE
        </div>
      </div>
      <div class="panel players">
        <h2>{t('lobby.players', { n: L.players.length })}</h2>
        <div class="pgrid">
          {L.players.map((p) => (
            <div class="pcard" key={p.slot} data-testid={'pcard-' + p.slot} style={{ '--pc': PLAYER_COLORS[p.color]?.hex }}>
              <div class="pname">{p.name}</div>
              <div class="ptags">
                {p.host && <span class="tag host">{t('lobby.host')}</span>}
                {p.bot && <span class="tag">{t('lobby.bot')}</span>}
                {p.ready && <span class="tag ready">{t('lobby.ready')}</span>}
                {!p.connected && <span class="tag">{t('lobby.offline')}</span>}
                <span class="grow" />
                {isHost.value && !p.host && (
                  <button class="small ghost" onClick={() => send({ t: 'kick', slot: p.slot })}>
                    {t('lobby.kick')}
                  </button>
                )}
              </div>
            </div>
          ))}
          {Array.from({ length: Math.max(0, 12 - L.players.length) }, (_, i) => (
            <div class="pcard empty" key={'e' + i}>
              —
            </div>
          ))}
        </div>
        <div class="sep" />
        <label>{t('menu.color')}</label>
        <div class="swatches" style={{ marginTop: '6px' }}>
          {PLAYER_COLORS.map((c, i) => (
            <div
              key={c.id}
              class={'swatch' + (me?.color === i ? ' on' : '')}
              style={{ background: c.hex, color: c.hex, opacity: taken.has(i) ? 0.2 : 1 }}
              onClick={() => !taken.has(i) && send({ t: 'lobby', color: i })}
            />
          ))}
        </div>
      </div>
      <div class="panel settings-panel">
        <h2>{t('lobby.settings')}</h2>
        <div class="setrow">
          <label>{t('lobby.set.aliens')}</label>
          <Tri k="aliens" s={s} />
        </div>
        <div class="setrow">
          <label>{t('lobby.set.mutants')}</label>
          <Tri k="mutants" s={s} />
        </div>
        <div class="setrow">
          <label>{t('lobby.set.androids')}</label>
          <Tri k="androids" s={s} />
        </div>
        <div class="setrow">
          <label>{t('lobby.set.npc')}</label>
          <Num k="npcCrew" s={s} min={-1} max={8} />
        </div>
        <div class="setrow">
          <label>{t('lobby.set.bots')}</label>
          <Num k="bots" s={s} min={0} max={11} />
        </div>
        <div class="setrow">
          <label>{t('lobby.set.ep')}</label>
          <Num k="epMult" s={s} min={0.25} max={4} step={0.25} />
        </div>
        <div class="setrow">
          <label>{t('lobby.set.events')}</label>
          <Num k="eventMult" s={s} min={0.25} max={4} step={0.25} />
        </div>
        <div class="setrow">
          <label>{t('lobby.set.apo')}</label>
          <span class="mono">
            {s.apocalypse[0]}–{s.apocalypse[1]}
          </span>
        </div>
        <div class="setrow">
          <label>{t('lobby.set.localChat')}</label>
          <Check k="localChat" s={s} />
        </div>
        <div class="setrow">
          <label>{t('lobby.set.boot')}</label>
          <Check k="bootOnDeath" s={s} />
        </div>
        <div class="setrow">
          <label>{t('lobby.set.spectate')}</label>
          <Check k="hostSpectate" s={s} />
        </div>
        <div class="sep" />
        <h3>{t('lobby.chat')}</h3>
        <div class="lobby-chat">
          {chatLog.value.map((l, i) => (
            <div key={i}>
              <b style={{ color: PLAYER_COLORS[l.color]?.hex }}>{l.from}</b>: {sysText(l.text)}
            </div>
          ))}
        </div>
        <input
          style={{ width: '100%', marginTop: '6px' }}
          value={msg}
          maxLength={200}
          onInput={(e) => setMsg((e.target as HTMLInputElement).value)}
          onKeyDown={(e) => {
            if (e.key === 'Enter' && msg.trim()) {
              send({ t: 'chat', ch: 'all', text: msg })
              setMsg('')
            }
          }}
        />
      </div>
      <div class="panel lobby-foot">
        <button class="ghost" onClick={() => leave()}>
          {t('lobby.leave')}
        </button>
        <div class="grow" />
        {!isHost.value && <span class="dim">{t('lobby.waiting')}</span>}
        <button data-testid="ready" onClick={() => send({ t: 'lobby', ready: !me?.ready })}>
          {me?.ready ? t('lobby.notReady') : t('lobby.ready')}
        </button>
        {isHost.value && (
          <button class="primary" data-testid="start" onClick={() => send({ t: 'start' })}>
            {t('lobby.start')}
          </button>
        )}
      </div>
    </div>
  )
}
