// 隨機事件的介面：政府強化劑五選一、假結束畫面、星區穩定度條
import { signal } from '@preact/signals'
import { useEffect, useState } from 'preact/hooks'
import { send, snapTick, world } from '../../client/session'
import { regFx } from '../../render/fxBinding'
import { t } from '../i18n'
import { Icon } from '../icons'

const ENH: { k: string; icon: string }[] = [
  { k: 'speed', icon: 'speed' },
  { k: 'hp', icon: 'heal' },
  { k: 'atk', icon: 'gun' },
  { k: 'mp', icon: 'battery' },
  { k: 'range', icon: 'eye' },
]

export function EnhancerPanel() {
  void snapTick.value
  if (!world.me.enh) return null
  return (
    <div class="panel" data-testid="enhancer" style={{ position: 'absolute', left: '50%', top: '30%', transform: 'translateX(-50%)', padding: '14px 16px', width: '360px' }}>
      <h2 style={{ marginTop: 0 }}>{t('enh.title')}</h2>
      <div class="dim" style={{ fontSize: '12px', marginBottom: '10px' }}>
        {t('enh.hint')}
      </div>
      <div class="col" style={{ gap: '6px' }}>
        {ENH.map((e, i) => (
          <button key={e.k} class="row" style={{ gap: '10px', justifyContent: 'flex-start' }} onClick={() => send({ t: 'cmd', seq: 0, c: { k: 'enhance', s: i } })}>
            <Icon name={e.icon} size={20} />
            <span>{t('enh.' + e.k)}</span>
          </button>
        ))}
      </div>
    </div>
  )
}

/** 假結束畫面：sim 送 fakeEnd 特效，6 秒後自己消失（之後系統訊息改口）*/
const fakeEndUntil = signal(0)
regFx('fakeEnd', (_gs, _w, f) => {
  fakeEndUntil.value = performance.now() + (f.v ?? 6) * 1000
})

export function FakeEnd() {
  const [, force] = useState(0)
  const until = fakeEndUntil.value
  useEffect(() => {
    if (!until) return
    const id = setTimeout(() => force((n) => n + 1), Math.max(0, until - performance.now()) + 20)
    return () => clearTimeout(id)
  }, [until])
  if (!until || performance.now() > until) return null
  return (
    <div class="end-fake" data-testid="fake-end">
      <div class="end-fake-title">{t('end.crew')}</div>
      <div class="dim">{t('event.fakeEndSub')}</div>
    </div>
  )
}

/** 星區穩定度：末日的軟計時；低於 25% 轉紅並閃爍 */
export function Stability() {
  void snapTick.value
  const s = world.w.stab
  if (s === undefined) return null
  const pct = Math.round(s * 100)
  const low = pct <= 25
  return (
    <span class={'stab' + (low ? ' low' : '')} title={t('game.stability')}>
      <span class="dim">{t('game.stability')}</span>
      <span class="stab-bar">
        <span style={{ width: pct + '%' }} />
      </span>
      <b>{pct}%</b>
    </span>
  )
}
