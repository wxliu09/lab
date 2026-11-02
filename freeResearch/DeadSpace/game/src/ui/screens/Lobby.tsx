import { useEffect, useRef, useState } from 'preact/hooks'
import type { ComponentChildren, JSX } from 'preact'
import { MAX_PLAYERS, PLAYER_COLORS } from '../../shared/constants'
import type { LobbySettings } from '../../shared/protocol/messages'
import { roleOutcomes, type RoleMix } from '../../shared/roleRules'
import { chatLog, hostConflict, isHost, leave, lobby, mySlot, send } from '../../client/session'
import { sysText, t } from '../i18n'
import { tipProps } from '../tooltip'
import '../lobby2.css'

// 身分預覽：規則在 shared/roleRules.ts（與 sim 共用）
export { roleOutcomes, type RoleMix } from '../../shared/roleRules'

function Chip({ r, children }: { r: string; children: ComponentChildren }) {
  return <span class={'rchip r-' + r}>{children}</span>
}

/** 把可能的組合畫成陣營色塊；total = 這些身分分配在多少人之中 */
export function RoleMixView({ outcomes, total }: { outcomes: RoleMix[]; total: number }) {
  if (!outcomes.length || total <= 0) return <span class="dim">{t('lobby2.roles.none')}</span>
  const chips: JSX.Element[] = []
  const lo = (k: keyof RoleMix) => Math.min(...outcomes.map((o) => o[k]))
  const hi = (k: keyof RoleMix) => Math.max(...outcomes.map((o) => o[k]))
  const sum = (o: RoleMix) => o.xeno + o.mutant + o.android
  const [a, b] = outcomes
  const either = outcomes.length === 2 && a.android === b.android && a.xeno + b.xeno === 1 && a.mutant + b.mutant === 1 && a.xeno !== a.mutant
  if (either) {
    chips.push(
      <Chip key="e" r="either">
        {t('lobby2.roles.either')} <small>{t('lobby2.roles.eitherNote')}</small>
      </Chip>,
    )
    if (a.android) chips.push(<Chip key="a" r="android">{t('role.android')} {a.android}</Chip>)
  } else {
    for (const [k, r] of [
      ['xeno', 'xeno'],
      ['mutant', 'mutant'],
      ['android', 'android'],
    ] as const) {
      const x = lo(k)
      const y = hi(k)
      if (y === 0) continue
      chips.push(
        <Chip key={k} r={r}>
          {x === y ? `${t('role.' + r)} ${x}` : t('lobby2.roles.range', { name: t('role.' + r), a: x, b: y })}
        </Chip>,
      )
    }
  }
  const hMin = total - Math.max(...outcomes.map(sum))
  const hMax = total - Math.min(...outcomes.map(sum))
  if (hMax > 0)
    chips.push(
      <Chip key="h" r="human">
        {hMin === hMax ? `${t('role.human')} ${hMin}` : t('lobby2.roles.range', { name: t('role.human'), a: hMin, b: hMax })}
      </Chip>,
    )
  return <span class="rchips">{chips}</span>
}

// ───────── 設定欄位 ─────────

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

/** NPC 船員：自動（-1）或 0–8 名 */
function NpcSelect({ s, auto }: { s: LobbySettings; auto: number }) {
  return (
    <select
      data-testid="set-npc"
      disabled={!isHost.value}
      value={String(s.npcCrew)}
      onChange={(e) => send({ t: 'settings', s: { npcCrew: Number((e.target as HTMLSelectElement).value) } })}
    >
      <option value="-1">{t('lobby2.npcAuto', { n: auto })}</option>
      {Array.from({ length: 9 }, (_, i) => (
        <option key={i} value={String(i)}>
          {i}
        </option>
      ))}
    </select>
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

/** 一列設定：標籤＋控制項；整列懸停顯示說明 */
function Row({ label, tip, children }: { label: string; tip: string; children: ComponentChildren }) {
  return (
    <div class="setrow" {...tipProps(() => ({ title: label, body: t(tip) }))}>
      <label class="tiplabel">
        {label}
        <span class="tipmark" aria-hidden="true">
          ?
        </span>
      </label>
      {children}
    </div>
  )
}

// ───────── 大廳 ─────────

export function Lobby() {
  const L = lobby.value
  const [msg, setMsg] = useState('')
  const [copied, setCopied] = useState(false)
  const chatRef = useRef<HTMLDivElement>(null)
  const lines = chatLog.value
  useEffect(() => {
    const el = chatRef.current
    if (el) el.scrollTop = el.scrollHeight
  }, [lines.length, L !== null])
  if (!L) return <div class="panel modal">{t('menu.connecting')}</div>
  const me = L.players.find((p) => p.slot === mySlot.value)
  const s = L.settings
  const taken = new Set(L.players.filter((p) => p.slot !== mySlot.value).map((p) => p.color))
  const copy = () => {
    const url = `${location.origin}${location.pathname}${location.search}#room=${L.code}`
    void navigator.clipboard?.writeText(url).then(() => setCopied(true))
  }
  // 開局時的參戰人數：大廳裡的人＋補位 AI，主機只主持時不算主機
  const bots = Math.min(s.bots, Math.max(0, MAX_PLAYERS - L.players.length))
  const n = Math.max(0, L.players.length + bots - (s.hostSpectate && L.players.some((p) => p.host) ? 1 : 0))
  const npcAuto = Math.max(0, Math.min(6, 9 - n))
  const sendChat = () => {
    if (!msg.trim()) return
    send({ t: 'chat', ch: 'all', text: msg })
    setMsg('')
  }
  return (
    <div class="lobby lobby2" data-testid="lobby">
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
        <div class="role-preview" data-testid="role-preview" {...tipProps(() => ({ title: t('lobby2.roles.title'), body: t('lobby2.roles.note') }))}>
          <div class="rp-head">
            <b>{t('lobby2.roles.title')}</b>
            <span class="dim">
              {t('lobby2.roles.count', { n })}
              {s.hostSpectate ? `（${t('lobby2.roles.hostOut')}）` : ''}
            </span>
            <span class="tipmark" aria-hidden="true">
              ?
            </span>
          </div>
          <RoleMixView outcomes={roleOutcomes(n, s)} total={n} />
        </div>
        <div class="grow" />
        {hostConflict.value && <div class="notice">{t('lobby.hostConflict')}</div>}
        <div class="logo" style={{ fontSize: '26px' }}>
          XENOCYTE
        </div>
      </div>
      <div class="lobby-left">
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
            {Array.from({ length: Math.max(0, MAX_PLAYERS - L.players.length) }, (_, i) => (
              <div class="pcard empty" key={'e' + i}>
                —
              </div>
            ))}
          </div>
          <div class="sep" />
          <div class="row lobby-color">
            <label>{t('menu.color')}</label>
            <div class="swatches">
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
        </div>
        <div class="panel lobby-chatbox" data-testid="lobby-chatbox">
          <h3>{t('lobby.chat')}</h3>
          <div class="lobby-chat" ref={chatRef}>
            {lines.length === 0 && <div class="dim">{t('lobby2.chatEmpty')}</div>}
            {lines.map((l, i) => (
              <div key={i}>
                <b style={{ color: PLAYER_COLORS[l.color]?.hex }}>{l.from}</b>: {sysText(l.text)}
              </div>
            ))}
          </div>
          <input
            data-testid="lobby-chat-input"
            value={msg}
            maxLength={200}
            placeholder={t('lobby2.chatHint')}
            onInput={(e) => setMsg((e.target as HTMLInputElement).value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter') sendChat()
            }}
          />
        </div>
      </div>
      <div class="panel settings-panel">
        <h2>{t('lobby.settings')}</h2>
        <Row label={t('lobby.set.aliens')} tip="lobby2.tip.aliens.body">
          <Tri k="aliens" s={s} />
        </Row>
        <Row label={t('lobby.set.mutants')} tip="lobby2.tip.mutants.body">
          <Tri k="mutants" s={s} />
        </Row>
        <Row label={t('lobby.set.androids')} tip="lobby2.tip.androids.body">
          <Tri k="androids" s={s} />
        </Row>
        <Row label={t('lobby.set.npc')} tip="lobby2.tip.npc.body">
          <NpcSelect s={s} auto={npcAuto} />
        </Row>
        <Row label={t('lobby.set.bots')} tip="lobby2.tip.bots.body">
          <Num k="bots" s={s} min={0} max={MAX_PLAYERS - 1} />
        </Row>
        <Row label={t('lobby.set.ep')} tip="lobby2.tip.ep.body">
          <Num k="epMult" s={s} min={0.25} max={4} step={0.25} />
        </Row>
        <Row label={t('lobby.set.events')} tip="lobby2.tip.events.body">
          <Num k="eventMult" s={s} min={0.25} max={4} step={0.25} />
        </Row>
        <Row label={t('lobby.set.apo')} tip="lobby2.tip.apo.body">
          <span class="mono">
            {s.apocalypse[0]}–{s.apocalypse[1]}
          </span>
        </Row>
        <Row label={t('lobby.set.localChat')} tip="lobby2.tip.localChat.body">
          <Check k="localChat" s={s} />
        </Row>
        <Row label={t('lobby.set.boot')} tip="lobby2.tip.boot.body">
          <Check k="bootOnDeath" s={s} />
        </Row>
        <Row label={t('lobby.set.spectate')} tip="lobby2.tip.spectate.body">
          <Check k="hostSpectate" s={s} />
        </Row>
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
