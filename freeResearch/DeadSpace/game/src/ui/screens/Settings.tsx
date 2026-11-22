import { useLayoutEffect, useState } from 'preact/hooks'
import { signal } from '@preact/signals'
import { lang, setLang, t, type Lang } from '../i18n'
import { loadNetSettings, saveNetSettings, type SignalStrategy } from '../../net/trystero'
import { quality, setQuality, type Quality } from '../../render/quality'
import { audioPrefs, setAudioPref, sfx, type AudioPrefs } from '../../audio/sfx'
import { setUiScale, uiScalePref, uiZoom } from '../uiScale'
import { uiScaleTexts } from './uiScaleText'
import { edgeScrollOn, edgeSpeed, setEdgeScroll, setEdgeSpeed } from '../../client/controlPrefs'
import { modalChecks } from '../../client/input'
import { hintsEnabled, resetHints } from '../hud/Guide'
import '../strings/art2'
import '../ui6.css'
import '../strings/ui6'

/** 0–100 之類的滑桿＋數值；fmt = 自訂數值的寫法（預設「數值＋單位」）*/
function Slider({ id, min, max, value, onInput, onChange, unit = '', fmt }: { id: string; min: number; max: number; value: number; onInput: (v: number) => void; onChange?: () => void; unit?: string; fmt?: (v: number) => string }) {
  return (
    <div class="row" style={{ gap: '8px' }}>
      <input type="range" min={min} max={max} value={value} style={{ width: '160px' }} data-testid={id} onInput={(e) => onInput(Number((e.target as HTMLInputElement).value))} onChange={onChange} />
      <span class="mono dim" style={{ width: '48px', textAlign: 'right' }} data-testid={id + '-value'}>
        {fmt ? fmt(value) : `${value}${unit}`}
      </span>
    </div>
  )
}

const VOL_KEYS: (keyof Omit<AudioPrefs, 'muted' | 'mono'>)[] = ['master', 'music', 'sfx', 'ui', 'ambient']

/** 放開滑桿時的試聽（第 7 輪：音樂、環境音原本都放介面分軌的 notify，聽不出這條滑桿的效果）：[音效, 分軌] */
const VOL_PREVIEW: Record<(typeof VOL_KEYS)[number], [string, Parameters<typeof sfx>[3]]> = {
  master: ['pickup', undefined],
  music: ['previewMusic', 'music'],
  sfx: ['pistol', 'sfx'],
  ui: ['notify', undefined],
  ambient: ['previewAmbient', 'ambient'],
}

/** 對局中的設定視窗（頂列齒輪）：掛在 GameScreen 的根層，不能放在頂列裡面（會被頂列的定位困住）*/
export const settingsOpen = signal(false)
modalChecks.push(() => settingsOpen.value)

export function InGameSettings() {
  if (!settingsOpen.value) return null
  // 對局中不顯示網路設定（只在下次建立／加入房間時生效，局中改了也沒用，只會讓人緊張）
  return <Settings onClose={() => (settingsOpen.value = false)} net={false} />
}

/** TURN 輸入框的內容 → 伺服器清單；空白 = 不用 TURN；格式不對回傳 null */
export function parseTurn(text: string): RTCIceServer[] | null {
  if (!text.trim()) return []
  try {
    const v = JSON.parse(text) as unknown
    return Array.isArray(v) ? (v as RTCIceServer[]) : null
  } catch {
    return null
  }
}

/**
 * 進階連線設定（主選單的設定才有；預設收合）：連線方式與 TURN。和其他設定一樣即時存檔（第 6 輪審查 P2：
 * 原本只有這兩項要按「儲存」，按「關閉」或點背景就被默默丟掉）。TURN 格式不對時不存，顯示錯誤，保留上一次存好的值。
 */
function NetSettings() {
  const ns = loadNetSettings()
  const [strategy, setStrategy] = useState<string>(ns.strategy)
  const [turn, setTurn] = useState(ns.turn.length ? JSON.stringify(ns.turn, null, 1) : '')
  const [err, setErr] = useState('')
  const saved = (s: string, tx: string) => saveNetSettings({ strategy: s as SignalStrategy, turn: parseTurn(tx) ?? loadNetSettings().turn })
  return (
    <details class="settings-adv" data-testid="settings-advanced">
      <summary>{t('ui6.settings.advanced')}</summary>
      <div class="dim settings-adv-note">{t('ui6.settings.advancedNote')}</div>
      <div class="setrow">
        <label>{t('settings.net')}</label>
        <select
          data-testid="net-strategy"
          value={strategy}
          onChange={(e) => {
            const v = (e.target as HTMLSelectElement).value
            setStrategy(v)
            saved(v, turn)
          }}
        >
          <option value="nostr">{t('ui6.settings.netDefault')}</option>
          <option value="mqtt">MQTT</option>
          <option value="torrent">BitTorrent</option>
          {/* 同一瀏覽器多分頁（BroadcastChannel）只給開發與測試 build；正式版不顯示（e2e 用網址 ?net=bc 選這個傳輸）*/}
          {__TEST_HOOKS__ && <option value="local">{t('settings.local')}</option>}
        </select>
      </div>
      <label>{t('settings.turn')}</label>
      <textarea
        rows={4}
        data-testid="net-turn"
        value={turn}
        onInput={(e) => {
          const v = (e.target as HTMLTextAreaElement).value
          setTurn(v)
          const ok = parseTurn(v) !== null
          setErr(ok ? '' : t('ui6.settings.turnBad'))
          if (ok) saved(strategy, v)
        }}
      />
      {err && (
        <div class="notice" data-testid="net-turn-err">
          {err}
        </div>
      )}
      <div class="dim" style={{ fontSize: '13px', wordBreak: 'break-all' }}>
        {t('settings.turnHelp')}
      </div>
    </details>
  )
}

export function Settings({ onClose, net = true }: { onClose: () => void; net?: boolean }) {
  // Esc 關閉；capture 階段攔下，免得同一個 Esc 又打開進化選單。
  // 用 layout effect：一渲染就掛上（useEffect 要等下一次繪製，畫面很慢時會漏掉緊接著的 Esc）
  useLayoutEffect(() => {
    const k = (e: KeyboardEvent) => {
      if (e.code !== 'Escape') return
      e.stopImmediatePropagation()
      onClose()
    }
    window.addEventListener('keydown', k, true)
    return () => window.removeEventListener('keydown', k, true)
  }, [onClose])
  const [hintMsg, setHintMsg] = useState('')
  return (
    <div class="modal-back" onClick={onClose}>
      {/* 內容區可捲動、按鈕列固定在底部：小視窗也一定看得到「關閉」*/}
      <div class="panel modal settings-modal" data-testid="settings" onClick={(e) => e.stopPropagation()}>
        <h2>{t('settings.title')}</h2>
        <div class="col settings-body" data-testid="settings-body">
          <div class="setrow">
            <label>
              {t('settings.lang')}
              <div class="dim" style={{ fontSize: '13px' }} data-testid="lang-note">
                {t('art2.labelLang')}
              </div>
            </label>
            <select value={lang.value} onChange={(e) => setLang((e.target as HTMLSelectElement).value as Lang)}>
              <option value="zh">繁體中文</option>
              <option value="en">English</option>
            </select>
          </div>
          <div class="setrow">
            <label>
              {t('settings.quality')}
              <div class="dim" style={{ fontSize: '13px' }} data-testid="quality-note">
                {t('art1.qualityNote')}
              </div>
            </label>
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
              <div class="dim" style={{ fontSize: '13px' }} data-testid="ui-scale-note">
                {t('ui5.settings.uiScaleNote', { pct: uiScaleTexts(uiScalePref.value, uiZoom.value).actual })}
              </div>
            </label>
            <Slider id="ui-scale" min={70} max={160} value={Math.round(uiScalePref.value * 100)} fmt={(v) => uiScaleTexts(v / 100, 1).mult} onInput={(v) => setUiScale(v / 100)} />
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
                onChange={() => sfx(VOL_PREVIEW[k][0], undefined, undefined, VOL_PREVIEW[k][1])}
              />
            </div>
          ))}
          <div class="setrow">
            <label>{t('settings.mute')}</label>
            <input type="checkbox" checked={audioPrefs.value.muted} onChange={(e) => setAudioPref('muted', (e.target as HTMLInputElement).checked)} />
          </div>
          <div class="setrow">
            <label title={t('snd7.monoHint')}>{t('snd7.mono')}</label>
            <input type="checkbox" data-testid="mono-audio" title={t('snd7.monoHint')} checked={audioPrefs.value.mono} onChange={(e) => setAudioPref('mono', (e.target as HTMLInputElement).checked)} />
          </div>
          {net && <NetSettings />}
        </div>
        <div class="settings-foot">
          {/* 所有設定都即時生效、自動存檔：只有「關閉」（第 6 輪審查：原本的「儲存」只管網路設定，語意誤導）*/}
          <div class="row" style={{ alignItems: 'center' }}>
            <span class="dim grow" style={{ fontSize: '13px' }} data-testid="settings-autosave">
              {t('ui6.settings.autoSaved')}
            </span>
            <button class="primary" data-testid="settings-close" onClick={onClose}>
              {t('settings.close')}
            </button>
          </div>
        </div>
      </div>
    </div>
  )
}
