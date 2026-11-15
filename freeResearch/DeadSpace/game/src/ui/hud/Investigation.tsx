// 推理工具：調查筆記（Tab）、驗血報告、監視器畫面、門禁紀錄（GDD §9）
import { useEffect, useState } from 'preact/hooks'
import { signal } from '@preact/signals'
import { PLAYER_COLORS } from '../../shared/constants'
import type { NoteMark } from '../../shared/protocol/messages'
import { send, sendCmd, snapTick, startInfo, world } from '../../client/session'
import { dialogOpen, panelChecks, targetMode, typingInField } from '../../client/input'
import { lang, listJoin, t } from '../i18n'
import { sampleName } from '../../shared/sysArgs'
import { Icon } from '../icons'
import { tipProps } from '../tooltip'
import { SIM_AGENT_TITLE, localizeName } from '../names'
import { CLASSES } from '../../shared/content/registry'
import { isMuted, setMuted } from '../../client/mute'
import '../ui4.css'

export const notesOpen = signal(false)

// ───────── 本機封鎖（第 4 輪）─────────
// client/mute.ts 以「完整的顯示名字」比對：公開／陣營／群組頻道與小地圖信號帶的是 sim 的顯示名字（職業前綴＋本名，例如「Dr. Alice」；
// 晉升後是「特務·Alice」），死者頻道帶的是本名；調查筆記這一列只有開局名單上的本名（startInfo）。
// 所以封鎖一個本名時，把它的每一種寫法都封起來：通訊病毒換名後頭銜跟著人走、本名換到別人身上，封鎖就跟著這個本名走。
// 只用公開的內容（職業前綴表），不去查這個名字現在是誰（那會把病毒換名對回真人）。

/** 封鎖本名 base 時要一起封的顯示名字：本名、晉升頭銜＋本名、各職業前綴＋本名 */
export function muteNames(base: string): string[] {
  if (!base) return []
  const out = new Set([base, SIM_AGENT_TITLE + base])
  for (const c of CLASSES.values()) if (c.prefix.en) out.add(c.prefix.en + base)
  return [...out]
}

/** 這個本名有沒有被封鎖（任何一種寫法被封就算；在聊天那邊單獨封了某個寫法，這裡也看得出來）*/
export function isNameMuted(base: string): boolean {
  return muteNames(base).some(isMuted)
}

/** 封鎖／解除封鎖這個本名的所有寫法 */
export function setNameMuted(base: string, on: boolean): void {
  for (const n of muteNames(base)) setMuted(n, on)
}

/** 這個本名是不是「現在的自己」（selfNames：自己目前的顯示名字、開局名單上的本名）：不能封鎖自己 */
export function isOwnName(base: string, selfNames: readonly string[]): boolean {
  const all = muteNames(base)
  return selfNames.some((n) => !!n && all.includes(n))
}

// 筆記是側邊面板：開著時照樣能用快捷鍵操作，只停用邊緣捲動
panelChecks.push(() => notesOpen.value)
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
        // 設定、圖鑑等對話框開著時，Tab 留給對話框移動焦點，不要開關筆記
        if (dialogOpen()) return
        e.preventDefault()
        notesOpen.value = !notesOpen.value
      } else if (e.code === 'Escape' && notesOpen.value && !typingInField() && !targetMode.value) {
        // 瞄準中的 Esc 先取消瞄準（交給 Input），下一次 Esc 才關筆記
        e.stopImmediatePropagation()
        notesOpen.value = false
      }
    }
    window.addEventListener('keydown', k, true)
    return () => window.removeEventListener('keydown', k, true)
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
  // 死者與旁觀者看得到全場：不能把筆記分享出去（server 也會擋給活人的分享），自己的筆記照樣可以編輯
  const canShare = me.alive !== false
  // 自己現在的名字：自己的主單位一定看得到真名（通訊病毒換過就是換到的名字）；再加上開局名單上的本名
  const selfNames = [world.ents.get(me.unit ?? -1)?.s.n ?? '', players.find((p) => p.slot === me.slot)?.name ?? '']
  return (
    <div class="panel solid" data-testid="notes" style={{ position: 'absolute', left: '12px', top: '54px', width: '380px', maxHeight: '60vh', overflow: 'auto', padding: '12px' }}>
      <h2>{t('notes.title')}</h2>
      <div class="col" style={{ gap: '5px' }}>
        {players
          .filter((p) => p.slot !== me.slot)
          .map((p) => {
            const n = mine.get(p.slot)
            const cur = MARKS.find((x) => x.m === (n?.mark ?? 'none'))!
            const muted = isNameMuted(p.name)
            // 名字現在是自己的（通訊病毒換到的）就不能封；已經封了的照樣可以解除
            const locked = isOwnName(p.name, selfNames) && !muted
            return (
              <div key={p.slot} class={'row note-row' + (muted ? ' is-muted' : '')} style={{ gap: '6px', borderLeft: `3px solid ${PLAYER_COLORS[p.color]?.hex}`, paddingLeft: '6px' }}>
                <div class="grow" style={{ minWidth: 0 }}>
                  <div class="note-name" style={{ fontSize: '15px' }}>
                    {localizeName(p.name)}
                    {muted && <span class="note-muted-tag">{t('ui5.notes.muted')}</span>}
                  </div>
                  {edit === p.slot ? (
                    <input
                      value={text}
                      maxLength={200}
                      style={{ width: '100%', fontSize: '14px', padding: '3px 5px' }}
                      onInput={(e) => setText((e.target as HTMLInputElement).value)}
                      onKeyDown={(e) => {
                        e.stopPropagation()
                        if (e.key === 'Enter') {
                          send({ t: 'note', target: p.slot, mark: n?.mark ?? 'none', text })
                          setEdit(null)
                        } else if (e.key === 'Escape') setEdit(null)
                      }}
                      // 點到別處也存（原本只有 Enter 才存，打好的字會不見）
                      onBlur={() => {
                        if (text !== (n?.text ?? '')) send({ t: 'note', target: p.slot, mark: n?.mark ?? 'none', text })
                        setEdit(null)
                      }}
                      ref={(el) => el?.focus()}
                    />
                  ) : (
                    <div class="dim" style={{ fontSize: '13px', cursor: 'text' }} onClick={() => (setEdit(p.slot), setText(n?.text ?? ''))}>
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
                {canShare && (
                  <button
                    class="small ghost"
                    {...tipProps(() => ({ title: t('notes.share'), body: t('notes.shareBody') }))}
                    onClick={() => {
                      // 分享會把你對所有人的標記與筆記都送給對方：先確認
                      if (window.confirm(t('notes.shareConfirm', { name: localizeName(p.name) }))) send({ t: 'shareNotes', to: p.slot })
                    }}
                  >
                    ↗
                  </button>
                )}
                {/* 本機封鎖：只在自己這端隱藏他的聊天與小地圖信號（不送任何東西給主機）。用 aria-disabled 而不是 disabled，停用時懸停說明照樣出得來 */}
                <button
                  class={'small ghost note-mute' + (muted ? ' on' : '')}
                  data-testid={'note-mute-' + p.slot}
                  aria-pressed={muted}
                  aria-disabled={locked}
                  aria-label={t(muted ? 'ui5.notes.unmute' : 'ui5.notes.mute')}
                  {...tipProps(() => ({ title: t(muted ? 'ui5.notes.unmute' : 'ui5.notes.mute'), body: t(locked ? 'ui5.notes.muteSelf' : 'ui5.notes.muteBody') }))}
                  onClick={() => {
                    if (!locked) setNameMuted(p.name, !muted)
                  }}
                >
                  <Icon name={muted ? 'muted' : 'sound'} size={14} color="currentColor" />
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
            <div key={i} style={{ fontSize: '13px', padding: '3px 0' }}>
              <span class="mono dim">
                {Math.floor(r.time / 60)}:{String(Math.floor(r.time % 60)).padStart(2, '0')}
              </span>{' '}
              {listJoin(r.names.map((n) => localizeName(sampleName(n, lang.value))))} → <b style={{ color: r.result === 'clean' ? '#5cf2a5' : r.result === 'infected' ? '#ff3b3b' : '#ffc23d' }}>{t('git.' + r.result)}</b>
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
              <div key={i} style={{ fontSize: '13px' }}>
                <b>{localizeName(from?.name)}</b>
                {t('sep.colon')}
                {localizeName(about?.name)} — {t('notes.mark.' + n.mark)} {n.text}
              </div>
            )
          })}
        </>
      )}
      <div class="dim" style={{ fontSize: '13px', marginTop: '8px' }}>
        {canShare ? t('notes.hint') : t('notes2.deadHint')}
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
      <span class="dim" style={{ fontSize: '13px' }}>
        {t('door.log')}
      </span>
      {d.log
        .slice()
        .reverse()
        .map((l, i) => (
          <span key={i} title={t('door.sil.' + l.sil)} style={{ display: 'inline-flex', alignItems: 'center', gap: '3px', fontSize: '13px' }} class="mono">
            <Icon name={SIL[l.sil] ?? 'unknown'} size={16} color={l.sil === 'creature' ? '#ff7a6a' : '#9fe7ff'} />
            {Math.max(0, Math.round(now - l.t))}s
          </span>
        ))}
    </div>
  )
}
