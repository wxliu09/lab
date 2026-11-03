// 進化選單、旁觀列、死亡模式投票、結算畫面
import { useState } from 'preact/hooks'
import { FORMS, UNITS } from '../../shared/content/registry'
import { PLAYER_COLORS } from '../../shared/constants'
import { endResult, leave, send, sendCmd, snapTick, startInfo, world } from '../../client/session'
import { chatPassChecks, evolveOpen, modalChecks, mutePassChecks } from '../../client/input'
import { addStrings, loc, sysText, t } from '../i18n'
import { Icon } from '../icons'
import { localizeName } from '../names'
import { stationDefOf } from '../../render/gameScene'
import { TopSlot } from './Announce'
import { evolveBlock } from './evolveWhy'
import { PLAY1_EN, PLAY1_ZH } from '../strings/play1'

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
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(210px, 1fr))', gap: '10px' }}>
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
            <span class="dim" style={{ fontSize: '13px' }}>
              {t('evo.confirmHint')}
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

export function SpectatorBar() {
  void snapTick.value
  const me = world.me
  const dead = me.alive === false || me.role === 'spectator'
  if (!dead) return null
  // 等記憶核心復活的仿生人：只能透過核心觀看，不能切換觀戰
  if (me.coreWait) return null
  // 死亡即退出：出局，不能觀戰（結算後讓位給結算卡）
  if (me.booted && !endResult.value)
    return (
      <div class="modal-back" data-testid="booted">
        <div class="panel modal" style={{ textAlign: 'center', width: 'min(460px, 92vw)' }}>
          <h2>{t('boot.title')}</h2>
          <p class="dim" style={{ fontSize: '15px', lineHeight: 1.6 }}>
            {t('boot2.body')}
          </p>
          <button class="primary" onClick={() => leave()}>
            {t('boot.leave')}
          </button>
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

export function EndScreen() {
  const r = endResult.value
  if (!r) return null
  return (
    <div class="modal-back" style={{ background: 'rgba(0,0,0,0.75)' }}>
      <div class="panel modal end-card" data-testid="end" style={{ width: 'min(900px, 94vw)' }}>
        <div class="logo" style={{ fontSize: '30px', marginBottom: '6px' }}>
          {t('end.' + r.winner)}
        </div>
        <div class="dim mono">
          {t('end.duration')} {Math.floor(r.duration / 60)}:{String(r.duration % 60).padStart(2, '0')}
        </div>
        <div class="sep" />
        <div class="pgrid">
          {r.players.map((p) => (
            <div class="pcard" key={p.slot} style={{ '--pc': PLAYER_COLORS[p.color]?.hex }}>
              <div class="pname">{localizeName(p.name)}</div>
              <div class="row end-role">
                <span style={{ color: ROLE_COL[p.role] }}>{t('role.' + p.role)}{p.spawn ? t('ui4.end.spawn') : ''}</span>
                <span class="dim">{t('class.' + p.classId)}</span>
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
          ))}
        </div>
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
        <div class="row" style={{ marginTop: '14px' }}>
          <button class="primary" onClick={() => leave()}>
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
