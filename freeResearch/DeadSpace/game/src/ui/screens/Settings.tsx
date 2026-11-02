import { useState } from 'preact/hooks'
import { lang, setLang, t, type Lang } from '../i18n'
import { loadNetSettings, saveNetSettings, type SignalStrategy } from '../../net/trystero'
import { quality, setQuality, type Quality } from '../../render/quality'
import { audioPrefs, setAudioPref, sfx, type AudioPrefs } from '../../audio/sfx'
import { setUiScale, uiScalePref, uiZoom } from '../uiScale'
import { edgeScrollOn, edgeSpeed, setEdgeScroll, setEdgeSpeed } from '../../client/controlPrefs'
import { hintsEnabled, resetHints } from '../hud/Guide'

/** 0–100 之類的滑桿＋數值 */
function Slider({ id, min, max, value, onInput, onChange, unit = '' }: { id: string; min: number; max: number; value: number; onInput: (v: number) => void; onChange?: () => void; unit?: string }) {
  return (
    <div class="row" style={{ gap: '8px' }}>
      <input type="range" min={min} max={max} value={value} style={{ width: '160px' }} data-testid={id} onInput={(e) => onInput(Number((e.target as HTMLInputElement).value))} onChange={onChange} />
      <span class="mono dim" style={{ width: '48px', textAlign: 'right' }}>
        {value}
        {unit}
      </span>
    </div>
  )
}

const VOL_KEYS: (keyof Omit<AudioPrefs, 'muted'>)[] = ['master', 'music', 'sfx', 'ambient']

export function Settings({ onClose }: { onClose: () => void }) {
  const ns = loadNetSettings()
  const [strategy, setStrategy] = useState<string>(ns.strategy)
  const [turn, setTurn] = useState(ns.turn.length ? JSON.stringify(ns.turn, null, 1) : '')
  const [err, setErr] = useState('')
  const [hintMsg, setHintMsg] = useState('')
  const save = () => {
    let parsed: RTCIceServer[] = []
    if (turn.trim()) {
      try {
        const v = JSON.parse(turn) as unknown
        if (!Array.isArray(v)) throw new Error('not array')
        parsed = v as RTCIceServer[]
      } catch {
        setErr(t('settings.badJson'))
        return
      }
    }
    saveNetSettings({ strategy: strategy as SignalStrategy, turn: parsed })
    onClose()
  }
  return (
    <div class="modal-back" onClick={onClose}>
      <div class="panel modal" onClick={(e) => e.stopPropagation()}>
        <h2>{t('settings.title')}</h2>
        <div class="col">
          <div class="setrow">
            <label>{t('settings.lang')}</label>
            <select value={lang.value} onChange={(e) => setLang((e.target as HTMLSelectElement).value as Lang)}>
              <option value="zh">繁體中文</option>
              <option value="en">English</option>
            </select>
          </div>
          <div class="setrow">
            <label>{t('settings.quality')}</label>
            <select value={quality.value} onChange={(e) => setQuality((e.target as HTMLSelectElement).value as Quality)}>
              {(['low', 'medium', 'high', 'ultra'] as const).map((q) => (
                <option key={q} value={q}>
                  {t('q.' + q)}
                </option>
              ))}
            </select>
          </div>
          <h3 style={{ margin: '8px 0 2px' }}>{t('settings.ui')}</h3>
          <div class="setrow">
            <label>
              {t('settings.uiScale')}
              <div class="dim" style={{ fontSize: '12px' }}>
                {t('settings.uiScaleAuto')} · {Math.round(uiZoom.value * 100)}%
              </div>
            </label>
            <Slider id="ui-scale" min={70} max={160} value={Math.round(uiScalePref.value * 100)} unit="%" onInput={(v) => setUiScale(v / 100)} />
          </div>
          <div class="setrow">
            <label>{t('settings.hints')}</label>
            <div class="row" style={{ gap: '10px' }}>
              <button class="small ghost" data-testid="hints-reset" onClick={() => (resetHints(), setHintMsg(t('settings.hintsResetDone')))}>
                {hintMsg || t('settings.hintsReset')}
              </button>
              <input type="checkbox" data-testid="hints-on" checked={hintsEnabled.value} onChange={(e) => (hintsEnabled.value = (e.target as HTMLInputElement).checked)} />
            </div>
          </div>
          <h3 style={{ margin: '8px 0 2px' }}>{t('settings.controls')}</h3>
          <div class="setrow">
            <label>{t('settings.edgeScroll')}</label>
            <input type="checkbox" data-testid="edge-scroll" checked={edgeScrollOn.value} onChange={(e) => setEdgeScroll((e.target as HTMLInputElement).checked)} />
          </div>
          <div class="setrow">
            <label>{t('settings.edgeSpeed')}</label>
            <Slider id="edge-speed" min={40} max={250} value={Math.round(edgeSpeed.value * 100)} unit="%" onInput={(v) => setEdgeSpeed(v / 100)} />
          </div>
          <h3 style={{ margin: '8px 0 2px' }}>{t('settings.audio')}</h3>
          {VOL_KEYS.map((k) => (
            <div class="setrow" key={k}>
              <label>{t('settings.vol.' + k)}</label>
              <Slider
                id={'vol-' + k}
                min={0}
                max={100}
                value={Math.round(audioPrefs.value[k] * 100)}
                onInput={(v) => setAudioPref(k, v / 100)}
                onChange={() => sfx(k === 'music' || k === 'ambient' ? 'notify' : 'pickup')}
              />
            </div>
          ))}
          <div class="setrow">
            <label>{t('settings.mute')}</label>
            <input type="checkbox" checked={audioPrefs.value.muted} onChange={(e) => setAudioPref('muted', (e.target as HTMLInputElement).checked)} />
          </div>
          <div class="setrow">
            <label>{t('settings.net')}</label>
            <select value={strategy} onChange={(e) => setStrategy((e.target as HTMLSelectElement).value)}>
              <option value="nostr">Nostr</option>
              <option value="mqtt">MQTT</option>
              <option value="torrent">BitTorrent</option>
              <option value="local">{t('settings.local')}</option>
            </select>
          </div>
          <label>{t('settings.turn')}</label>
          <textarea rows={4} value={turn} onInput={(e) => setTurn((e.target as HTMLTextAreaElement).value)} />
          <div class="dim" style={{ fontSize: '11px' }}>
            {t('settings.turnHelp')}
          </div>
          <div class="notice">{err}</div>
          <div class="row">
            <button class="primary grow" onClick={save}>
              {t('settings.save')}
            </button>
            <button class="ghost" onClick={onClose}>
              {t('settings.close')}
            </button>
          </div>
        </div>
      </div>
    </div>
  )
}
