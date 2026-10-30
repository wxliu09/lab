// 推理工具：調查筆記（Tab）、驗血報告、監視器畫面、門禁紀錄（GDD §9）
import { useEffect, useState } from 'preact/hooks'
import { signal } from '@preact/signals'
import { PLAYER_COLORS } from '../../shared/constants'
import type { NoteMark } from '../../shared/protocol/messages'
import { send, sendCmd, snapTick, startInfo, world } from '../../client/session'
import { typingInField } from '../../client/input'
import { t } from '../i18n'
import { Icon } from '../icons'

export const notesOpen = signal(false)
/** 正在看的監視器畫面（覆寫鏡頭所在 zone）*/
export const feedView = signal<{ id: number; zone: number; x: number; y: number } | null>(null)

const MARKS: { m: NoteMark; color: string }[] = [
  { m: 'none', color: '#8b9aa8' },
  { m: 'trust', color: '#5cf2a5' },
  { m: 'suspect', color: '#ffc23d' },
  { m: 'confirmedEvil', color: '#ff3b3b' },
  { m: 'confirmedClean', color: '#9fe7ff' },
]

export function NotesPanel() {
  void snapTick.value
  useEffect(() => {
    const k = (e: KeyboardEvent) => {
      if (e.code === 'Tab' && !typingInField()) {
        e.preventDefault()
        notesOpen.value = !notesOpen.value
      }
    }
    window.addEventListener('keydown', k)
    return () => window.removeEventListener('keydown', k)
  }, [])
  const [edit, setEdit] = useState<number | null>(null)
  const [text, setText] = useState('')
  if (!notesOpen.value) return null
  const me = world.me
  const players = startInfo.value?.players ?? []
  const notes = me.notes ?? []
  const mine = new Map(notes.filter((n) => n.from === undefined).map((n) => [n.slot, n]))
  const shared = notes.filter((n) => n.from !== undefined)
  const reports = me.gitReports ?? []
  return (
    <div class="panel" data-testid="notes" style={{ position: 'absolute', left: '12px', top: '54px', width: '380px', maxHeight: '60vh', overflow: 'auto', padding: '12px' }}>
      <h2>{t('notes.title')}</h2>
      <div class="col" style={{ gap: '5px' }}>
        {players
          .filter((p) => p.slot !== me.slot)
          .map((p) => {
            const n = mine.get(p.slot)
            const cur = MARKS.find((x) => x.m === (n?.mark ?? 'none'))!
            return (
              <div key={p.slot} class="row" style={{ gap: '6px', borderLeft: `3px solid ${PLAYER_COLORS[p.color]?.hex}`, paddingLeft: '6px' }}>
                <div class="grow" style={{ minWidth: 0 }}>
                  <div style={{ fontSize: '13px' }}>{p.name}</div>
                  {edit === p.slot ? (
                    <input
                      value={text}
                      maxLength={200}
                      style={{ width: '100%', fontSize: '12px', padding: '3px 5px' }}
                      onInput={(e) => setText((e.target as HTMLInputElement).value)}
                      onKeyDown={(e) => {
                        e.stopPropagation()
                        if (e.key === 'Enter') {
                          send({ t: 'note', target: p.slot, mark: n?.mark ?? 'none', text })
                          setEdit(null)
                        }
                      }}
                    />
                  ) : (
                    <div class="dim" style={{ fontSize: '11px', cursor: 'text' }} onClick={() => (setEdit(p.slot), setText(n?.text ?? ''))}>
                      {n?.text || t('notes.add')}
                    </div>
                  )}
                </div>
                <button
                  class="small ghost"
                  title={t('notes.mark.' + cur.m)}
                  style={{ color: cur.color, borderColor: cur.color }}
                  onClick={() => {
                    const i = MARKS.findIndex((x) => x.m === cur.m)
                    const next = MARKS[(i + 1) % MARKS.length].m
                    send({ t: 'note', target: p.slot, mark: next, text: n?.text ?? '' })
                  }}
                >
                  {t('notes.mark.' + cur.m)}
                </button>
                <button class="small ghost" title={t('notes.share')} onClick={() => send({ t: 'shareNotes', to: p.slot })}>
                  ↗
                </button>
              </div>
            )
          })}
      </div>
      {reports.length > 0 && (
        <>
          <div class="sep" />
          <h3>{t('notes.git')}</h3>
          {reports.map((r, i) => (
            <div key={i} style={{ fontSize: '12px', padding: '3px 0' }}>
              <span class="mono dim">
                {Math.floor(r.time / 60)}:{String(Math.floor(r.time % 60)).padStart(2, '0')}
              </span>{' '}
              {r.names.join('、')} → <b style={{ color: r.result === 'clean' ? '#5cf2a5' : r.result === 'infected' ? '#ff3b3b' : '#ffc23d' }}>{t('git.' + r.result)}</b>
            </div>
          ))}
        </>
      )}
      {shared.length > 0 && (
        <>
          <div class="sep" />
          <h3>{t('notes.shared')}</h3>
          {shared.map((n, i) => {
            const from = players.find((p) => p.slot === n.from)
            const about = players.find((p) => p.slot === n.slot)
            return (
              <div key={i} style={{ fontSize: '12px' }}>
                <b>{from?.name}</b>：{about?.name} — {t('notes.mark.' + n.mark)} {n.text}
              </div>
            )
          })}
        </>
      )}
      <div class="dim" style={{ fontSize: '11px', marginTop: '8px' }}>
        {t('notes.hint')}
      </div>
    </div>
  )
}

export function FeedsPanel() {
  void snapTick.value
  const feeds = world.me.feeds ?? []
  const fv = feedView.value
  if (!feeds.length && !fv) return null
  return (
    <div class="panel" style={{ position: 'absolute', right: '12px', top: '54px', padding: '8px', width: '170px' }}>
      <h3>
        <Icon name="camera" size={16} /> {t('feed.title')}
      </h3>
      <div class="col" style={{ gap: '4px' }}>
        {feeds.map(([id, zone, x, y], i) => (
          <div key={id} class="row" style={{ gap: '4px' }}>
            <button class={'small grow' + (fv?.id === id ? ' primary' : '')} onClick={() => (feedView.value = fv?.id === id ? null : { id, zone, x: x / 10, y: y / 10 })}>
              {t('feed.cam', { n: i + 1 })}
            </button>
            <button class="small ghost" title={t('feed.replay')} data-testid={'replay-' + i} onClick={() => sendCmd({ k: 'feedReplay', e: id })}>
              ⟲
            </button>
          </div>
        ))}
        {fv && (
          <button class="small ghost" onClick={() => (feedView.value = null)}>
            {t('feed.back')}
          </button>
        )}
      </div>
    </div>
  )
}

const SIL: Record<string, string> = { crew: 'human', rig: 'suit', creature: 'claw', machine: 'gear' }

export function DoorLog() {
  void snapTick.value
  const d = world.me.doorLog
  if (!d || !d.log.length) return null
  const now = world.w.t ?? 0
  return (
    <div class="panel" style={{ position: 'absolute', left: '50%', bottom: '204px', transform: 'translateX(-50%)', padding: '6px 10px', display: 'flex', gap: '10px', alignItems: 'center' }}>
      <span class="dim" style={{ fontSize: '11px' }}>
        {t('door.log')}
      </span>
      {d.log
        .slice()
        .reverse()
        .map((l, i) => (
          <span key={i} title={t('door.sil.' + l.sil)} style={{ display: 'inline-flex', alignItems: 'center', gap: '3px', fontSize: '11px' }} class="mono">
            <Icon name={SIL[l.sil] ?? 'unknown'} size={16} color={l.sil === 'creature' ? '#ff7a6a' : '#9fe7ff'} />
            {Math.max(0, Math.round(now - l.t))}s
          </span>
        ))}
    </div>
  )
}
