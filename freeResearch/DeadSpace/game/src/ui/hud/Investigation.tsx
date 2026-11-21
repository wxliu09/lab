// 推理工具：調查筆記（Tab）、驗血報告、監視器畫面、門禁紀錄（GDD §9）
import { useEffect, useState } from 'preact/hooks'
import { effect, signal } from '@preact/signals'
import { PLAYER_COLORS } from '../../shared/constants'
import type { ChatLine, NoteMark, SnapEntity } from '../../shared/protocol/messages'
import { chatLog, send, sendCmd, snapTick, startInfo, world } from '../../client/session'
import { dialogOpen, panelChecks, targetMode, typingInField } from '../../client/input'
import { hasString, lang, listJoin, loc, t } from '../i18n'
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

// ───────── 名字旁的職業與死亡標記（第 5 輪，審查 P3-10）─────────
// 大家口頭都用職業稱呼（頭頂名字就是「頭銜＋本名」），筆記這一列只有本名：在名字旁補上職業，並標出已公告的死者。
// 只用公開資訊：
// - 職業：快照裡「現在看得到、不匿名」的人的 cl（cl 只對不匿名的人送出，異形形態、蛋、繭一律是空的；頭頂名字的頭銜、
//   人物外觀本來就看得出職業）。以顯示名字對上這一列的本名，不用擁有者槽位去對：通訊病毒換名後，用槽位對會把換過的名字
//   對回真人；用名字對，顯示的就是別人眼中「叫這個名字的人」的頭銜。看不到就留空，不記憶、不推測。
// - 死亡：client 收到的全場死亡公告（系統訊息 `@death.<種類>|name=<顯示名字>`，sim roleSystem announceDeath；
//   原作每一種死亡都先點名）。不看快照裡的任何欄位。

/** 這一列本名在場上可能的顯示名字：職業頭銜＋本名、晉升頭銜＋本名。不含沒有頭銜的本名：玩家的顯示名字一定帶頭銜，
 * 免得有人把本名取成「Medic Bob」而對到醫護兵 Bob */
export function titledNames(base: string): string[] {
  return muteNames(base).filter((n) => n !== base)
}

/** 看得到的職業：職業 id，以及是不是晉升後的頭銜（政委晉升成特務：classId 不變、頭銜改成「特務·」）*/
export interface SeenClass {
  id: string
  agent: boolean
}

/**
 * 目前看得到的人：顯示名字 → 職業。只收顯示名字與職業都有、而且職業是已知職業的實體；
 * 同一個名字出現兩種職業（偽裝之類）記成 null，不猜。
 */
export function seenClasses(ents: Iterable<Pick<SnapEntity, 'n' | 'cl'>>): Map<string, SeenClass | null> {
  const out = new Map<string, SeenClass | null>()
  for (const s of ents) {
    if (!s.n || !s.cl || !CLASSES.has(s.cl)) continue
    const c: SeenClass = { id: s.cl, agent: s.n.startsWith(SIM_AGENT_TITLE) }
    if (!out.has(s.n)) out.set(s.n, c)
    else {
      const prev = out.get(s.n)
      if (prev && (prev.id !== c.id || prev.agent !== c.agent)) out.set(s.n, null)
    }
  }
  return out
}

/** 這一列本名現在看得到的職業；看不到、名字清空中（通訊病毒的 10 秒）或對到兩種職業時回傳 null */
export function classFor(base: string, seen: ReadonlyMap<string, SeenClass | null>): SeenClass | null {
  let found: SeenClass | null = null
  for (const n of titledNames(base)) {
    if (!seen.has(n)) continue
    const c = seen.get(n) ?? null
    if (!c || (found && (found.id !== c.id || found.agent !== c.agent))) return null
    found = c
  }
  return found
}

/** 職業的顯示名稱（晉升過的政委寫「特務」，和結算畫面一樣）*/
export function classText(c: SeenClass): string {
  if (c.agent) return t('ui5.class.agent')
  return hasString(lang.value, 'class.' + c.id) ? t('class.' + c.id) : loc(CLASSES.get(c.id)?.name) || c.id
}

const DEATH_KEY = /^death\.[A-Za-z]+$/

/** 系統訊息裡死亡公告點到的名字（`@death.<種類>|name=…`；沒有帶名字的不算）*/
export function deathNamesIn(lines: Iterable<Pick<ChatLine, 'ch' | 'text'>>): string[] {
  const out: string[] = []
  for (const l of lines) {
    if (l.ch !== 'sys' || !l.text.startsWith('@death.')) continue
    const [key, ...args] = l.text.slice(1).split('|')
    if (!DEATH_KEY.test(key)) continue
    for (const a of args) {
      const i = a.indexOf('=')
      if (i > 0 && a.slice(0, i) === 'name' && a.length > i + 1) out.push(a.slice(i + 1))
    }
  }
  return out
}

/** 這一列的本名有沒有被死亡公告點過名（公告帶的是當時的顯示名字；sim 的 fmtKey 會拿掉 | 與 =，比對時一樣處理）*/
export function announcedDead(base: string, dead: ReadonlySet<string>): boolean {
  return titledNames(base).some((n) => dead.has(n.replace(/[|=]/g, '')))
}

/** 這一局聽到的死亡公告（名字）。chatLog 只留最近 200 行，所以開著監看、每批新訊息都收進來 */
export const heardDead = signal<ReadonlySet<string>>(new Set())
let watchingDeaths = false

/**
 * 開始監看死亡公告（只開一次；筆記面板掛上時呼叫，不在模組載入時讀 session）。
 * 換一局（gid 不同）就清空；換局的當下 chatLog 裡還是上一局的訊息（session 隨後才清空），那些不算。
 */
export function watchDeaths(): void {
  if (watchingDeaths) return
  watchingDeaths = true
  const done = new WeakSet<object>()
  let game: unknown = undefined
  effect(() => {
    const lines = chatLog.value
    const info = startInfo.value
    const key = info ? (info.gid ?? 'seed:' + info.seed) : null
    let names = heardDead.peek()
    let changed = false
    if (key !== game) {
      // 第一次（game 還是 undefined）照樣收目前 chatLog 裡的公告：面板可能在這一局中途才掛上
      if (game !== undefined) for (const l of lines) done.add(l)
      game = key
      names = new Set()
      changed = true
    }
    const fresh = lines.filter((l) => !done.has(l))
    for (const l of fresh) done.add(l)
    const add = deathNamesIn(fresh).filter((n) => !names.has(n))
    if (add.length) {
      names = new Set([...names, ...add])
      changed = true
    }
    if (changed) heardDead.value = names
  })
}

/**
 * 筆記標題：面板標題（h2）是全大寫的樣式，會把「（Tab）」變成「（TAB）」，和 Esc 選單、頂列按鈕說明寫的「Tab」不一致；
 * 按鍵的部分另外包起來、不轉大寫（第 6 輪審查）。
 */
export function splitKeyHint(title: string): [string, string] {
  const m = /^(.*?)(\s*[（(]Tab[)）])$/.exec(title)
  return m ? [m[1], m[2]] : [title, '']
}

function NotesTitle() {
  const [name, key] = splitKeyHint(t('notes.title'))
  return (
    <h2>
      {name}
      {key && <span style={{ textTransform: 'none' }}>{key}</span>}
    </h2>
  )
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

/** 快照裡目前看得到的實體（只取公開欄位：顯示名字、職業）*/
function* visibleSnaps(): Generator<Pick<SnapEntity, 'n' | 'cl'>> {
  for (const e of world.ents.values()) yield e.s
}

export function NotesPanel() {
  void snapTick.value
  // 死亡公告的監看在面板掛上時就開始（面板關著也照樣收），不必等第一次打開
  useEffect(() => watchDeaths(), [])
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
  // 名字旁的職業（現在看得到的人）與死亡標記（死亡公告點過名的人）
  const seen = seenClasses(visibleSnaps())
  const dead = heardDead.value
  return (
    <div class="panel solid notes-panel" data-testid="notes" style={{ position: 'absolute', left: '12px', top: '54px', width: '380px', maxHeight: '60vh', overflow: 'auto', padding: '12px' }}>
      <NotesTitle />
      <div class="col" style={{ gap: '5px' }}>
        {players
          .filter((p) => p.slot !== me.slot)
          .map((p) => {
            const n = mine.get(p.slot)
            const cur = MARKS.find((x) => x.m === (n?.mark ?? 'none'))!
            const muted = isNameMuted(p.name)
            // 名字現在是自己的（通訊病毒換到的）就不能封；已經封了的照樣可以解除
            const locked = isOwnName(p.name, selfNames) && !muted
            const cls = classFor(p.name, seen)
            const isDead = announcedDead(p.name, dead)
            return (
              <div key={p.slot} class={'row note-row' + (muted ? ' is-muted' : '') + (isDead ? ' is-dead' : '')} data-testid={'note-row-' + p.slot} style={{ gap: '6px', borderLeft: `3px solid ${PLAYER_COLORS[p.color]?.hex}`, paddingLeft: '6px' }}>
                <div class="grow" style={{ minWidth: 0 }}>
                  <div class="note-name" style={{ fontSize: '15px' }}>
                    <span class="note-base">{localizeName(p.name)}</span>
                    {cls && (
                      <span class="note-class" data-testid={'note-class-' + p.slot} {...tipProps(() => ({ title: classText(cls), body: t('ui5.notes.classBody') }))}>
                        {classText(cls)}
                      </span>
                    )}
                    {isDead && (
                      <span class="note-dead" data-testid={'note-dead-' + p.slot} {...tipProps(() => ({ title: t('ui5.notes.dead'), body: t('ui5.notes.deadBody') }))}>
                        {t('ui5.notes.dead')}
                      </span>
                    )}
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
