// 進化選單、旁觀列、死亡模式投票、結算畫面
import { useMemo, useState } from 'preact/hooks'
import { FORMS, UNITS } from '../../shared/content/registry'
import { PLAYER_COLORS } from '../../shared/constants'
import type { EndResult } from '../../shared/protocol/messages'
import { currentRoom, endResult, isHost, lastEnd, leave, leaveGame, returnToLobby, send, sendCmd, snapTick, startInfo, world } from '../../client/session'
import { chatPassChecks, evolveOpen, modalChecks, mutePassChecks } from '../../client/input'
import { addStrings, listJoin, loc, sysText, t } from '../i18n'
import { Icon } from '../icons'
import { localizeName } from '../names'
import { stationDefOf } from '../../render/gameScene'
import { TopSlot } from './Announce'
import { canPreview, evolveBlock, nextForms } from './evolveWhy'
import { drawReasonKey } from './textRules'
import { isHostAbort } from '../../client/hostAbort'
import { PLAY1_EN, PLAY1_ZH } from '../strings/play1'
import { classLabel, promotedSlots } from './Guide'
import { againTip, inPractice, replayPractice } from '../screens/practiceRun'
import { tipProps } from '../tooltip'
import { Spin3D, factionSpec } from './Codex'
import '../strings/set7'
import '../screens7.css'

addStrings(PLAY1_ZH, PLAY1_EN)

// 陣營主色（色條、外框）與文字色（主色在深色底上對比不到 4.5:1，文字用亮色）
const FACTION_COLOR: Record<string, string> = { xeno: '#7a3cff', mutant: '#c8323c', android: '#ffb000' }
const FACTION_TEXT: Record<string, string> = { xeno: '#b28cff', mutant: '#ff6b72', android: '#ffb000' }

// 結算畫面、出局畫面開著時，遊戲快捷鍵不處理；但結算時仍可按 Enter 聊天（賽後聊天），兩者都可以按 M 靜音
const endOpen = () => !!endResult.value
// 結算後出局畫面讓位給結算卡（才能賽後聊天）
const bootedOpen = () => !!world.me.booted && !endResult.value
modalChecks.push(endOpen, bootedOpen)
chatPassChecks.push(endOpen)
mutePassChecks.push(endOpen, bootedOpen)

export function EvolveMenu() {
  void snapTick.value
  // 進化不可逆（原地結繭、可能自曝）：先選，再按確認
  const [pick, setPick] = useState<string | null>(null)
  if (!evolveOpen.value) return null
  const me = world.me
  const opts = me.canEvolve ?? []
  const role = me.role ?? 'human'
  // 為什麼現在不能進化（死亡、駕駛中、太空中、EP 不足、仿生人不在鑄造平台…），null = 可以選
  const why = evolveBlock(me)
  const dead = me.alive === false
  if (role === 'human' || me.spawn || dead) {
    return (
      <div class="modal-back" onClick={() => (evolveOpen.value = false)}>
        <div class="panel modal" data-testid="evolve-none" style={{ width: '420px' }} onClick={(e) => e.stopPropagation()}>
          <h2>{t('evo.title')}</h2>
          <div class="dim">{t(dead ? 'play1.evo.dead' : 'evo.none')}</div>
          <div class="row" style={{ justifyContent: 'flex-end', marginTop: '14px' }}>
            <button class="small" data-testid="evolve-close" onClick={() => (evolveOpen.value = false)}>
              {t('evo3.close')}
            </button>
          </div>
        </div>
      </div>
    )
  }
  const col = FACTION_COLOR[role] ?? '#9fe7ff'
  const tcol = FACTION_TEXT[role] ?? '#9fe7ff'
  // 還不能進化（多半是 EP 不足）：用灰色預覽下一階的分支，讓人知道在存什麼（不能選）
  const preview = canPreview(why) ? nextForms(me, world.ents.get(me.unit ?? 0)?.s.d) : []
  const confirmHint = role === 'xeno' || role === 'mutant' || role === 'android' ? 'evo.confirmHint.' + role : 'evo.confirmHint'
  return (
    <div class="modal-back" onClick={() => (evolveOpen.value = false)}>
      <div class="panel modal" data-testid="evolve" style={{ width: 'min(760px, 94vw)' }} onClick={(e) => e.stopPropagation()}>
        <h2 style={{ color: tcol }}>{t('evo.title')}</h2>
        <div class="row" style={{ marginBottom: '12px' }}>
          <span class="mono">
            EP {me.ep ?? 0}
            {me.epNext ? ` / ${me.epNext}` : ''}
          </span>
          <div class="bar ep grow">
            <i style={{ transform: `scaleX(${me.epNext ? Math.min(1, (me.ep ?? 0) / me.epNext) : 1})` }} />
          </div>
        </div>
        {me.evolving ? <div class="notice">{t('evo.inProgress', { s: me.evolving })}</div> : null}
        {why && (
          <div class="dim" data-testid="evolve-why">
            {t(why.key, why.args)}
          </div>
        )}
        {preview.length > 0 && (
          <div class="evo-preview" data-testid="evolve-preview">
            <div class="dim evo-preview-h">{t('ui5.evo.preview')}</div>
            <div class="evo-grid">
              {preview.map((f) => {
                const u = UNITS.get(f.unit)
                return (
                  <div key={f.id} class="pcard evo-locked" style={{ '--pc': col }} data-testid={'evo-preview-' + f.id} aria-disabled="true">
                    <div class="row">
                      <Icon name="evolve" color="#6f7d89" size={24} />
                      <div class="pname">{loc(u?.name) || f.id}</div>
                      <span class="grow" />
                      <span class="mono evo-need">{t('ui5.evo.previewNeed', { n: f.ep })}</span>
                    </div>
                    <div class="evo-desc">{loc(f.desc)}</div>
                  </div>
                )
              })}
            </div>
          </div>
        )}
        <div class="evo-grid">
          {(why ? [] : opts).map((id) => {
            const f = FORMS.get(id)
            const u = f ? UNITS.get(f.unit) : undefined
            return (
              <div
                key={id}
                class={'pcard' + (pick === id ? ' picked' : '')}
                style={{ '--pc': col, cursor: 'pointer', outline: pick === id ? `2px solid ${col}` : undefined }}
                data-testid={'evo-' + id}
                onClick={() => setPick(id)}
              >
                <div class="row">
                  <Icon name="evolve" color={col} />
                  <div class="pname">{loc(u?.name) || id}</div>
                </div>
                <div class="dim" style={{ fontSize: '14px', marginTop: '6px', lineHeight: 1.55 }}>
                  {loc(f?.desc)}
                </div>
                {u && (
                  <div class="mono dim" style={{ fontSize: '13px', marginTop: '6px' }}>
                    {t('tip.hp')} {u.hp} · {t('tip.atk')} {u.attack?.dmg[0] ?? 0} · {t('tip.speed')} {u.speed}
                  </div>
                )}
              </div>
            )
          })}
        </div>
        {pick && !why && opts.includes(pick) && (
          <div class="row" style={{ marginTop: '12px', gap: '10px', alignItems: 'center' }}>
            <button
              class="primary"
              data-testid="evo-confirm"
              onClick={() => {
                sendCmd({ k: 'evolve', a: pick })
                setPick(null)
                evolveOpen.value = false
              }}
            >
              {t('evo.confirm', { name: loc(UNITS.get(FORMS.get(pick)?.unit ?? '')?.name) || pick })}
            </button>
            <span class="dim" style={{ fontSize: '13px' }} data-testid="evo-confirm-hint">
              {t(confirmHint)}
            </span>
          </div>
        )}
        <div class="dim" style={{ marginTop: '12px', fontSize: '13px' }}>
          {role === 'xeno' ? t('evo.xenoHint') : role === 'mutant' ? t('evo.mutantHint') : t('evo.androidHint')}
        </div>
      </div>
    </div>
  )
}

/** 單機練習的「再來一局」：同樣的設定直接重開（多人局不顯示）*/
function PracticeAgain({ cls = '', wide = false }: { cls?: string; wide?: boolean }) {
  if (!inPractice()) return null
  return (
    <button
      class={cls}
      style={wide ? { width: '100%' } : undefined}
      data-testid="practice-again"
      onClick={(e) => {
        ;(e.currentTarget as HTMLElement).blur()
        replayPractice()
      }}
      {...tipProps(() => ({ title: t('ui5.practice.again'), body: againTip() }))}
    >
      {t('ui5.practice.again')}
    </button>
  )
}

export function SpectatorBar() {
  void snapTick.value
  const me = world.me
  const dead = me.alive === false || me.role === 'spectator'
  if (!dead) return null
  // 等記憶核心復活的仿生人：只能透過核心觀看，不能切換觀戰（練習局仍可直接再來一局）
  if (me.coreWait)
    return inPractice() ? (
      <div class="panel" style={{ position: 'absolute', top: '54px', right: '12px', padding: '10px', width: '220px' }}>
        <PracticeAgain cls="primary" wide />
      </div>
    ) : null
  // 死亡即退出：出局，不能觀戰（結算後讓位給結算卡）
  if (me.booted && !endResult.value)
    return (
      <div class="modal-back" data-testid="booted">
        <div class="panel modal" style={{ textAlign: 'center', width: 'min(460px, 92vw)' }}>
          <h2>{t('boot.title')}</h2>
          <p class="dim" style={{ fontSize: '15px', lineHeight: 1.6 }}>
            {t('boot2.body')}
          </p>
          {inPractice() && (
            <p class="dim" style={{ fontSize: '14px', lineHeight: 1.6 }}>
              {t('ui5.practice.againDead')}
            </p>
          )}
          <div class="row" style={{ justifyContent: 'center', gap: '10px' }}>
            <PracticeAgain cls="primary" />
            {/* 主機出局後離開也要先中止並揭曉身分（session.leaveGame）*/}
            <button class={inPractice() ? 'ghost' : 'primary'} onClick={() => void leaveGame()}>
              {t('boot.leave')}
            </button>
          </div>
        </div>
      </div>
    )
  const zones = startInfo.value?.zones ?? []
  // 同型的船（例如兩艘紅隼級探索艇）名稱一樣：重複的加上編號
  const names = zones.map(([, , st]) => loc(stationDefOf(st)?.name))
  const total = new Map<string, number>()
  for (const n of names) total.set(n, (total.get(n) ?? 0) + 1)
  const seen = new Map<string, number>()
  const labels = names.map((n) => {
    if ((total.get(n) ?? 0) < 2) return n
    const k = (seen.get(n) ?? 0) + 1
    seen.set(n, k)
    return t('spec3.nth', { name: n, n: k })
  })
  return (
    <div class="panel" style={{ position: 'absolute', top: '54px', right: '12px', padding: '10px', width: '220px', maxHeight: 'calc(100vh / var(--ui-zoom, 1) - 290px)', overflowY: 'auto' }}>
      {/* 單機練習死了：不用回主選單重選，直接用同樣的設定再來一局（放最上面：站點一多，清單會捲動）*/}
      {inPractice() && me.role !== 'spectator' && (
        <>
          <PracticeAgain cls="primary" wide />
          <div class="sep" style={{ margin: '10px 0 8px' }} />
        </>
      )}
      <h3>{t('spec.title')}</h3>
      <div class="col" style={{ gap: '4px' }}>
        <button class={'small' + (me.specZone === 0 ? ' primary' : '')} onClick={() => sendCmd({ k: 'spec', s: 0 })}>
          {t('spec.space')}
        </button>
        {zones.map(([id], i) => (
          <button key={id} class={'small' + (me.specZone === id ? ' primary' : '')} onClick={() => sendCmd({ k: 'spec', s: id })}>
            {labels[i]}
          </button>
        ))}
      </div>
    </div>
  )
}

export function DeathVote() {
  void snapTick.value
  const v = world.w.vote
  if (!v || world.me.alive === false) return null
  return (
    <TopSlot order={2}>
      <div class="panel top-vote" data-testid="death-vote">
        <b>{t('vote.deathTitle')}</b> <span class="dim mono">{v.until}s</span>
        <div class="row" style={{ marginTop: '8px', justifyContent: 'center' }}>
          <button class="small" onClick={() => send({ t: 'vote', v: 'spectate' })}>
            {t('vote.spectate')} ({v.spec})
          </button>
          <button class="small" onClick={() => send({ t: 'vote', v: 'boot' })}>
            {t('vote.boot')} ({v.boot})
          </button>
        </div>
      </div>
    </TopSlot>
  )
}

const ROLE_COL: Record<string, string> = { human: '#9fe7ff', ...FACTION_TEXT }

/**
 * 結算標題下一行的說明 key（第 5 輪）：主機中止了這局（sim 的 winner = 'aborted'、abortWhy = 'host'，判斷與 client/hostAbort.ts 共用）
 * → 「主機中止了這局：以下是所有人的身分」；平手 → 平手的原因；其他 null。只看結算本身（結算時公開給所有人的資料）。
 * drawWhy、abortWhy 都由 sim 新增：用寬鬆型別讀，舊版結果沒有這些欄位也照常顯示
 */
export function endNoteKey(r: EndResult): string | null {
  if (isHostAbort(r)) return 'ui5.end.aborted'
  return drawReasonKey(r as EndResult & { drawWhy?: unknown })
}

/**
 * 多人局結算後能不能回到大廳（第 6 輪：同一房號再來一局，session.returnToLobby → server.ts returnToLobby）：
 * 練習局不算（練習用「再來一局」重開一間練習房），主機中止的也不算（主機接著就會關掉房間）
 */
export function lobbyAgain(r: EndResult | null, practice: boolean): boolean {
  return !!r && !practice && !isHostAbort(r)
}

/** 主機的「回到大廳（同一房號）」按鈕（結算畫面、關掉結算畫面後的小列共用）*/
function ToLobbyButton({ cls }: { cls: string }) {
  return (
    <button
      class={cls}
      data-testid="back-to-lobby"
      onClick={(e) => {
        ;(e.currentTarget as HTMLElement).blur()
        returnToLobby()
      }}
      {...tipProps(() => ({ title: t('room6.end.toLobby'), body: t('room6.end.toLobbyTip', { code: currentRoom() }) }))}
    >
      {t('room6.end.toLobby')}
    </button>
  )
}

/**
 * 按「繼續觀看」關掉結算畫面之後（多人局）：上方一條小列，可以重新打開結算；主機在這裡也能回到大廳，
 * 客人看到「主機回到大廳時你會一起回去」。練習局照舊（觀戰列上的「再來一局」）
 */
function AfterEndBar() {
  const r = lastEnd.value
  if (!lobbyAgain(r, inPractice())) return null
  const host = isHost.value
  return (
    <TopSlot order={3}>
      <div class="panel top-vote" data-testid="end-after">
        <b>{t('room6.after.title')}</b>
        <div class="row" style={{ marginTop: '8px', justifyContent: 'center', gap: '8px' }}>
          <button class="small" data-testid="end-reopen" onClick={() => (endResult.value = r)}>
            {t('room6.after.results')}
          </button>
          {host && <ToLobbyButton cls="small primary" />}
        </div>
        {!host && (
          <div class="dim" style={{ marginTop: '6px', fontSize: '13px' }}>
            {t('room6.after.guest')}
          </div>
        )}
      </div>
    </TopSlot>
  )
}

/** 結算的勝方 → [模型的陣營, 光暈色, 退回用的線條圖示]；平手、中止沒有 */
const WINNER: Record<string, [string, string, string]> = {
  crew: ['human', '#9fe7ff', 'human'],
  xeno: ['xeno', FACTION_COLOR.xeno, 'claw'],
  mutant: ['mutant', FACTION_COLOR.mutant, 'dna'],
}

/** 翻牌爆光的顏色（人類青、異形紫、變種人紅、仿生人琥珀）*/
const BURST_COL: Record<string, string> = { human: '#9fe7ff', ...FACTION_COLOR }

/**
 * 結算卡翻牌的順序（第 7 輪）：版面照原本的順序，翻開的先後是人類先、異類（含眷屬）最後，留到最後揭曉。
 * 回傳每個玩家的名次（0 起算），和 players 同序
 */
export function flipOrder(players: readonly { role: string }[]): number[] {
  const idx = players.map((_, i) => i)
  const rank = [...idx.filter((i) => players[i].role === 'human'), ...idx.filter((i) => players[i].role !== 'human')]
  const out = new Array<number>(players.length)
  rank.forEach((i, k) => (out[i] = k))
  return out
}

/** 結算卡翻牌：同一份結算只翻一次（按「繼續觀看」再打開不重播）*/
const flipped = new WeakSet<EndResult>()
function firstShow(r: EndResult): boolean {
  if (flipped.has(r)) return false
  flipped.add(r)
  return true
}

export function EndScreen() {
  const r = endResult.value
  const anim = useMemo(() => (r ? firstShow(r) : false), [r])
  if (!r) return <AfterEndBar />
  // 標題下一行：主機中止、平手的原因（見 endNoteKey）
  const why = endNoteKey(r)
  // 多人局：主機可以帶大家回到同一個房間的大廳；客人看到「主機回到大廳時你會一起回去」
  const again = lobbyAgain(r, inPractice())
  const host = isHost.value
  // 晉升過的政委顯示「特務」（sim 不改 classId，見 promotedSlots）
  const promoted = promotedSlots(r)
  // 只主持不參戰的主機（sim 標 spectator）：不是參戰者，不列成「人類 死亡」的卡片，另外一行寫在下面
  const players = r.players.filter((p) => !p.spectator)
  const specs = r.players.filter((p) => p.spectator)
  const order = flipOrder(players)
  const win = WINNER[r.winner]
  return (
    <div class="modal-back" style={{ background: 'rgba(0,0,0,0.75)' }}>
      <div class={'panel modal end-card' + (anim ? ' r7e-anim' : '')} data-testid="end" style={{ width: 'min(900px, 94vw)' }}>
        {/* 標題列：勝方陣營的模型慢慢轉（平手、中止沒有）*/}
        <div class="r7e-head">
          {win && (
            <Spin3D spec={factionSpec(win[0])} glow={win[1]} cls="r7e-winner" testid="end-winner-model">
              <Icon name={win[2]} color={win[1]} size={56} />
            </Spin3D>
          )}
          <div class="r7e-title">
            <div class="logo" style={{ fontSize: '30px', marginBottom: '6px' }}>
              {t('end.' + r.winner)}
            </div>
            {why && (
              <div class="end-why" data-testid={why === 'ui5.end.aborted' ? 'end-aborted' : 'end-why'}>
                {t(why)}
              </div>
            )}
            <div class="dim mono">
              {t('end.duration')} {Math.floor(r.duration / 60)}:{String(r.duration % 60).padStart(2, '0')}
            </div>
          </div>
        </div>
        <div class="sep" />
        {/* 玩家卡：依序翻開揭曉身分（人類先、異類最後），翻開時一圈陣營色的爆光；減少動態效果時直接顯示（screens7.css）*/}
        <div class="pgrid">
          {players.map((p, i) => (
            <div
              class={'r7e-slot' + (p.role !== 'human' ? ' r7e-foe' : '')}
              key={p.slot}
              data-testid="end-player"
              style={{ '--d': `${350 + order[i] * 170}ms`, '--fc': BURST_COL[p.role] ?? '#9fe7ff' }}
            >
              <div class="r7e-flip">
                <div class="pcard r7e-face" style={{ '--pc': PLAYER_COLORS[p.color]?.hex }}>
                  <div class="pname">{localizeName(p.name)}</div>
                  <div class="row end-role">
                    <span style={{ color: ROLE_COL[p.role] }}>{t('role.' + p.role)}{p.spawn ? t('ui4.end.spawn') : ''}</span>
                    <span class="dim">{classLabel(p.classId, promoted.has(p.slot))}</span>
                    <span class="grow" />
                    <span class="dim">{p.alive ? t('end.alive') : t('end.dead')}</span>
                  </div>
                  <div class="mono dim end-stats">
                    <span>
                      {t('end.kills')} {p.kills}
                    </span>
                    <span>
                      {t('end.infections')} {p.infections}
                    </span>
                    <span>
                      {t('end.tests')} {p.tests}
                    </span>
                  </div>
                </div>
                {anim && (
                  <div class="pcard r7e-cover" aria-hidden="true" style={{ '--pc': PLAYER_COLORS[p.color]?.hex }}>
                    <div class="pname">{localizeName(p.name)}</div>
                    <div class="r7e-unknown">
                      <span class="r7e-q">?</span>
                      {t('set7.end.unknown')}
                    </div>
                  </div>
                )}
              </div>
              {anim && <div class="r7e-burst" aria-hidden="true" />}
            </div>
          ))}
        </div>
        {specs.length > 0 && (
          <div class="dim r7e-spec" data-testid="end-spectators">
            {t('set7.end.spectators', { names: listJoin(specs.map((p) => localizeName(p.name))) })}
          </div>
        )}
        <div class="sep" />
        <h3>{t('end.timeline')}</h3>
        <div class="col end-timeline" data-testid="end-timeline">
          {r.timeline.length === 0 && <div class="dim">{t('end.timelineEmpty')}</div>}
          {r.timeline.map((e, i) => (
            <div key={i}>
              <span class="mono dim">
                {Math.floor(e.t / 60)}:{String(e.t % 60).padStart(2, '0')}
              </span>{' '}
              {/* sim 以 `@key|k=v` 傳來（fmtKey）；結局本身是裸 key 'end.xxx' */}
              {e.text.startsWith('end.') ? t(e.text) : sysText(e.text)}
            </div>
          ))}
        </div>
        {again && !host && (
          <div class="end-why" data-testid="end-lobby-hint" style={{ marginTop: '12px', fontSize: '14px' }}>
            {t('room6.end.guestHint')}
          </div>
        )}
        <div class="row" style={{ marginTop: '14px' }}>
          <PracticeAgain cls="primary" />
          {again && host && <ToLobbyButton cls="primary" />}
          {/* 多人局可以回到大廳時，「回到主選單」不再是主要按鈕（主機按了會關掉房間：說明裡提醒）*/}
          <button
            class={inPractice() || again ? '' : 'primary'}
            data-testid="end-back"
            onClick={() => leave()}
            {...(again && host ? tipProps(() => ({ title: t('end.back'), body: t('room6.end.hostLeaveTip') })) : {})}
          >
            {t('end.back')}
          </button>
          <button class="ghost" onClick={() => (endResult.value = null)}>
            {t('end.stay')}
          </button>
        </div>
      </div>
    </div>
  )
}
