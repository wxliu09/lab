// 進化選單、旁觀列、死亡模式投票、結算畫面
import { FORMS, UNITS } from '../../shared/content/registry'
import { PLAYER_COLORS } from '../../shared/constants'
import { endResult, leave, send, sendCmd, snapTick, startInfo, world } from '../../client/session'
import { evolveOpen } from '../../client/input'
import { loc, t } from '../i18n'
import { Icon } from '../icons'
import { STATION_BY_ID } from '../../shared/content/stations/index'

const FACTION_COLOR: Record<string, string> = { xeno: '#7a3cff', mutant: '#c8323c', android: '#ffb000' }

export function EvolveMenu() {
  void snapTick.value
  if (!evolveOpen.value) return null
  const me = world.me
  const opts = me.canEvolve ?? []
  const role = me.role ?? 'human'
  if (role === 'human' || me.spawn) {
    return (
      <div class="modal-back" onClick={() => (evolveOpen.value = false)}>
        <div class="panel modal" style={{ width: '420px' }}>
          <h2>{t('evo.title')}</h2>
          <div class="dim">{t('evo.none')}</div>
        </div>
      </div>
    )
  }
  const col = FACTION_COLOR[role] ?? '#9fe7ff'
  return (
    <div class="modal-back" onClick={() => (evolveOpen.value = false)}>
      <div class="panel modal" data-testid="evolve" style={{ width: 'min(760px, 94vw)' }} onClick={(e) => e.stopPropagation()}>
        <h2 style={{ color: col }}>{t('evo.title')}</h2>
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
        {opts.length === 0 && !me.evolving && <div class="dim">{t('evo.notYet')}</div>}
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(210px, 1fr))', gap: '10px' }}>
          {opts.map((id) => {
            const f = FORMS.get(id)
            const u = f ? UNITS.get(f.unit) : undefined
            return (
              <div key={id} class="pcard" style={{ '--pc': col, cursor: 'pointer' }} data-testid={'evo-' + id} onClick={() => {
                sendCmd({ k: 'evolve', a: id })
                evolveOpen.value = false
              }}>
                <div class="row">
                  <Icon name="evolve" color={col} />
                  <div class="pname">{loc(u?.name) || id}</div>
                </div>
                <div class="dim" style={{ fontSize: '12px', marginTop: '6px', lineHeight: 1.5 }}>
                  {loc(f?.desc)}
                </div>
                {u && (
                  <div class="mono dim" style={{ fontSize: '11px', marginTop: '6px' }}>
                    HP {u.hp} · ATK {u.attack?.dmg[0] ?? 0} · SPD {u.speed}
                  </div>
                )}
              </div>
            )
          })}
        </div>
        <div class="dim" style={{ marginTop: '12px', fontSize: '12px' }}>
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
  const zones = startInfo.value?.zones ?? []
  return (
    <div class="panel" style={{ position: 'absolute', top: '54px', right: '12px', padding: '10px', width: '220px' }}>
      <h3>{t('spec.title')}</h3>
      <div class="col" style={{ gap: '4px' }}>
        <button class={'small' + (me.specZone === 0 ? ' primary' : '')} onClick={() => sendCmd({ k: 'spec', s: 0 })}>
          {t('spec.space')}
        </button>
        {zones.map(([id, , st]) => (
          <button key={id} class={'small' + (me.specZone === id ? ' primary' : '')} onClick={() => sendCmd({ k: 'spec', s: id })}>
            {loc(STATION_BY_ID.get(st)?.name)}
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
    <div class="panel" style={{ position: 'absolute', top: '96px', left: '50%', transform: 'translateX(-50%)', padding: '12px 16px' }}>
      <b>{t('vote.deathTitle')}</b> <span class="dim mono">{v.until}s</span>
      <div class="row" style={{ marginTop: '8px' }}>
        <button class="small" onClick={() => send({ t: 'vote', v: 'spectate' })}>
          {t('vote.spectate')} ({v.spec})
        </button>
        <button class="small" onClick={() => send({ t: 'vote', v: 'boot' })}>
          {t('vote.boot')} ({v.boot})
        </button>
      </div>
    </div>
  )
}

const ROLE_COL: Record<string, string> = { human: '#9fe7ff', xeno: '#7a3cff', mutant: '#c8323c', android: '#ffb000' }

export function EndScreen() {
  const r = endResult.value
  if (!r) return null
  return (
    <div class="modal-back" style={{ background: 'rgba(0,0,0,0.75)' }}>
      <div class="panel modal" data-testid="end" style={{ width: 'min(860px, 94vw)' }}>
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
              <div class="pname">{p.name}</div>
              <div class="row" style={{ gap: '6px', marginTop: '4px', fontSize: '12px' }}>
                <span style={{ color: ROLE_COL[p.role] }}>{t('role.' + p.role)}{p.spawn ? ' spawn' : ''}</span>
                <span class="dim">{t('class.' + p.classId)}</span>
                <span class="grow" />
                <span class="dim">{p.alive ? t('end.alive') : t('end.dead')}</span>
              </div>
              <div class="mono dim" style={{ fontSize: '11px', marginTop: '4px' }}>
                K {p.kills} · INF {p.infections} · GIT {p.tests}
              </div>
            </div>
          ))}
        </div>
        <div class="sep" />
        <h3>{t('end.timeline')}</h3>
        <div style={{ maxHeight: '180px', overflow: 'auto', fontSize: '12px' }} class="col">
          {r.timeline.map((e, i) => (
            <div key={i}>
              <span class="mono dim">
                {Math.floor(e.t / 60)}:{String(e.t % 60).padStart(2, '0')}
              </span>{' '}
              {e.text.startsWith('end.') ? t(e.text) : e.text}
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
