import { useState } from 'preact/hooks'
import { lang, setLang, t, type Lang } from '../i18n'
import { loadNetSettings, saveNetSettings, type SignalStrategy } from '../../net/trystero'
import { quality, setQuality, type Quality } from '../../render/quality'

export function Settings({ onClose }: { onClose: () => void }) {
  const ns = loadNetSettings()
  const [strategy, setStrategy] = useState<string>(ns.strategy)
  const [turn, setTurn] = useState(ns.turn.length ? JSON.stringify(ns.turn, null, 1) : '')
  const [err, setErr] = useState('')
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
