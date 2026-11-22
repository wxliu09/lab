import { useLayoutEffect, useState } from 'preact/hooks'
import type { ComponentChildren } from 'preact'
import { signal } from '@preact/signals'
import { lang, setLang, t, type Lang } from '../i18n'
import { loadNetSettings, saveNetSettings, type SignalStrategy } from '../../net/trystero'
import { DETAIL_CHOICES, RES_MAX, RES_MIN, detailValue, isCustom, quality, resetDetail, setDetail, setQuality, type Quality } from '../../render/quality'
import { audioPrefs, setAudioPref, sfx, type AudioPrefs } from '../../audio/sfx'
import { setUiScale, uiScalePref, uiZoom } from '../uiScale'
import { uiScaleTexts } from './uiScaleText'
import { edgeScrollOn, edgeSpeed, keySpeed, setEdgeScroll, setEdgeSpeed, setKeySpeed, setWheelInvert, setWheelSpeed, wheelInvert, wheelSpeed } from '../../client/controlPrefs'
import { FPS_CAPS, flashOn, followPilot, fpsCap, hiContrast, setFlashOn, setFollowPilot, setFpsCap, setHiContrast, setShakeOn, shakeOn, type FpsCap } from '../../client/viewPrefs'
import { reducedMotion } from '../../client/hitAlert'
import { modalChecks } from '../../client/input'
import { hintsEnabled, resetHints } from '../hud/Guide'
import { KeybindPanel } from './KeybindPanel'
import { keyCapturing } from '../../client/keymap'
import '../strings/art2'
import '../ui6.css'
import '../strings/ui6'
import '../strings/set7'
import '../screens7.css'

/** 0–100 之類的滑桿＋數值；fmt = 自訂數值的寫法（預設「數值＋單位」）*/
function Slider({ id, min, max, step, value, onInput, onChange, unit = '', fmt }: { id: string; min: number; max: number; step?: number; value: number; onInput: (v: number) => void; onChange?: (v: number) => void; unit?: string; fmt?: (v: number) => string }) {
  const val = (e: Event) => Number((e.target as HTMLInputElement).value)
  return (
    <div class="row" style={{ gap: '8px' }}>
      <input type="range" id={'set-' + id} min={min} max={max} step={step} value={value} style={{ width: '160px' }} data-testid={id} onInput={(e) => onInput(val(e))} onChange={onChange && ((e) => onChange(val(e)))} />
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

/**
 * 一列設定：左邊名稱＋（不直觀的選項）一行說明，右邊控制項。forId = 控制項的 id（點名稱就能勾選核取方塊、聚焦下拉選單）
 */
function Row({ label, hint, forId, testid, children }: { label: string; hint?: string; forId?: string; testid?: string; children: ComponentChildren }) {
  return (
    <div class="setrow" data-testid={testid}>
      <label for={forId}>
        {label}
        {hint && <div class="dim set7-hint">{hint}</div>}
      </label>
      {children}
    </div>
  )
}

/** 核取方塊一列（id 同時是 data-testid）*/
function Check({ id, label, hint, checked, onChange }: { id: string; label: string; hint?: string; checked: boolean; onChange: (on: boolean) => void }) {
  return (
    <Row label={label} hint={hint} forId={'set-' + id}>
      <input type="checkbox" id={'set-' + id} data-testid={id} checked={checked} onChange={(e) => onChange((e.target as HTMLInputElement).checked)} />
    </Row>
  )
}

/** 倍率滑桿（40–250%，邊緣捲動、方向鍵捲動、滾輪縮放共用）*/
function SpeedRow({ id, label, value, set }: { id: string; label: string; value: number; set: (v: number) => void }) {
  return (
    <Row label={label} forId={'set-' + id}>
      <Slider id={id} min={40} max={250} value={Math.round(value * 100)} unit="%" onInput={(v) => set(v / 100)} />
    </Row>
  )
}

type ChoiceKey = keyof typeof DETAIL_CHOICES

/** 進階畫質的下拉選單：選項 = DETAIL_CHOICES[k]，名稱依序 = labels */
function DetailSelect({ k, labels }: { k: ChoiceKey; labels: string[] }) {
  const list: readonly number[] = DETAIL_CHOICES[k]
  const v = detailValue(k)
  // 理論上一定在清單裡（存檔有驗證）；萬一不在，顯示最接近的那一項
  const cur = list.includes(v) ? v : list.reduce((a, b) => (Math.abs(b - v) < Math.abs(a - v) ? b : a))
  return (
    <select id={'set-gfx-' + k} data-testid={'gfx-' + k} value={String(cur)} onChange={(e) => setDetail(k, Number((e.target as HTMLSelectElement).value))}>
      {list.map((x, i) => (
        <option key={x} value={String(x)}>
          {labels[i]}
        </option>
      ))}
    </select>
  )
}

/**
 * 解析度滑桿：拖曳時只更新顯示的數字，放開才套用（改 dpr 目前會讓 engine.ts 整條後處理重建，拖曳中每一格都重建會卡）。
 * 鍵盤方向鍵每按一下就是一次 change，照樣即時套用（值從事件讀，不靠還沒重繪的 state）
 */
function ResSlider() {
  const cur = Math.round(detailValue('res') * 100)
  const [drag, setDrag] = useState<number | null>(null)
  return (
    <Slider
      id="gfx-res"
      min={RES_MIN * 100}
      max={RES_MAX * 100}
      step={5}
      value={drag ?? cur}
      unit="%"
      onInput={(v) => setDrag(v)}
      onChange={(v) => {
        setDetail('res', v / 100)
        setDrag(null)
      }}
    />
  )
}

/** 進階畫質（預設收合）：陰影、環境光遮蔽、泛光、粒子密度、解析度；在所選預設之上覆寫，存檔 */
function AdvancedGraphics() {
  const custom = isCustom()
  const base = t('q.' + quality.value)
  const n = (k: string, c: number) => Array.from({ length: c }, (_, i) => t(`set7.${k}.${i}`))
  return (
    <details class="settings-adv set7-adv" data-testid="settings-gfx">
      <summary>
        {t('set7.adv')}
        {custom && (
          <span class="set7-badge" data-testid="gfx-custom">
            {t('set7.adv.custom')}
          </span>
        )}
      </summary>
      <div class="dim settings-adv-note">{t('set7.adv.note')}</div>
      <Row label={t('set7.shadows')} hint={t('set7.shadows.hint')} forId="set-gfx-shadows">
        <DetailSelect k="shadows" labels={n('shadows', 3)} />
      </Row>
      <Row label={t('set7.ssao')} hint={t('set7.ssao.hint')} forId="set-gfx-ssao">
        <DetailSelect k="ssao" labels={n('ssao', 3)} />
      </Row>
      <Row label={t('set7.bloom')} hint={t('set7.bloom.hint')} forId="set-gfx-bloom">
        <DetailSelect k="bloom" labels={n('bloom', 4)} />
      </Row>
      <Row label={t('set7.particles')} hint={t('set7.particles.hint')} forId="set-gfx-particles">
        <DetailSelect k="particles" labels={(['low', 'medium', 'high', 'ultra'] as const).map((q) => t('q.' + q))} />
      </Row>
      <Row label={t('set7.res')} hint={t('set7.res.hint')} forId="set-gfx-res">
        <ResSlider />
      </Row>
      <div class="set7-adv-foot">
        <button class="small ghost" data-testid="gfx-reset" disabled={!custom} onClick={() => resetDetail()}>
          {t('set7.adv.reset', { base })}
        </button>
      </div>
    </details>
  )
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
      // 按鍵設定正在等新鍵：Esc 是取消等待（KeybindPanel 處理），不是關掉設定
      if (keyCapturing.value) return
      e.stopImmediatePropagation()
      onClose()
    }
    window.addEventListener('keydown', k, true)
    return () => window.removeEventListener('keydown', k, true)
  }, [onClose])
  const [hintMsg, setHintMsg] = useState('')
  const custom = isCustom()
  return (
    <div class="modal-back" onClick={onClose}>
      {/* 內容區可捲動、按鈕列固定在底部：小視窗也一定看得到「關閉」*/}
      <div class="panel modal settings-modal set7" data-testid="settings" onClick={(e) => e.stopPropagation()}>
        <h2>{t('settings.title')}</h2>
        <div class="col settings-body" data-testid="settings-body">
          {/* 語言要是第一個下拉選單（e2e 以「第一個 select」切語言）*/}
          <div class="setrow">
            <label for="set-lang">
              {t('settings.lang')}
              <div class="dim set7-hint" data-testid="lang-note">
                {t('art2.labelLang')}
              </div>
            </label>
            <select id="set-lang" value={lang.value} onChange={(e) => setLang((e.target as HTMLSelectElement).value as Lang)}>
              <option value="zh">繁體中文</option>
              <option value="en">English</option>
            </select>
          </div>

          {/* ── 畫面：畫質預設＋進階畫質（個別覆寫）── */}
          <h3>{t('set7.grp.graphics')}</h3>
          <div class="setrow">
            <label for="set-quality">
              {t('settings.quality')}
              <div class="dim set7-hint" data-testid="quality-note">
                {t('art1.qualityNote')}
              </div>
            </label>
            {/* 有個別覆寫時顯示「自訂（以某預設為基礎）」（隱藏選項：清單裡只列四個預設）；再選一個預設 = 清掉覆寫 */}
            <select
              id="set-quality"
              data-testid="quality"
              value={custom ? 'custom' : quality.value}
              onChange={(e) => {
                const v = (e.target as HTMLSelectElement).value
                if (v !== 'custom') setQuality(v as Quality)
              }}
            >
              {custom && (
                <option value="custom" disabled hidden>
                  {t('set7.q.custom', { base: t('q.' + quality.value) })}
                </option>
              )}
              {(['low', 'medium', 'high', 'ultra'] as const).map((q) => (
                <option key={q} value={q}>
                  {t('q.' + q)}
                </option>
              ))}
            </select>
          </div>
          <AdvancedGraphics />

          {/* ── 顯示與輔助：鏡頭震動、閃光、駕駛跟隨、高對比、FPS 上限（client/viewPrefs.ts）── */}
          <h3>{t('set7.grp.display')}</h3>
          {reducedMotion() && (
            <div class="dim set7-note" data-testid="reduced-motion-note">
              {t('set7.reduced')}
            </div>
          )}
          <Check id="shake-on" label={t('set7.shake')} hint={t('set7.shake.hint')} checked={shakeOn.value} onChange={setShakeOn} />
          <Check id="flash-on" label={t('set7.flash')} hint={t('set7.flash.hint')} checked={flashOn.value} onChange={setFlashOn} />
          <Check id="follow-pilot" label={t('set7.follow')} hint={t('set7.follow.hint')} checked={followPilot.value} onChange={setFollowPilot} />
          <Check id="hi-contrast" label={t('set7.hiContrast')} hint={t('set7.hiContrast.hint')} checked={hiContrast.value} onChange={setHiContrast} />
          <Row label={t('set7.fps')} hint={t('set7.fps.hint')} forId="set-fps-cap">
            <select id="set-fps-cap" data-testid="fps-cap" value={String(fpsCap.value)} onChange={(e) => setFpsCap(Number((e.target as HTMLSelectElement).value) as FpsCap)}>
              {FPS_CAPS.map((c) => (
                <option key={c} value={String(c)}>
                  {c === 0 ? t('set7.fps.0') : t('set7.fps.n', { n: c })}
                </option>
              ))}
            </select>
          </Row>

          <h3>{t('settings.ui')}</h3>
          <div class="setrow">
            <label for="set-ui-scale">
              {t('settings.uiScale')}
              <div class="dim set7-hint" data-testid="ui-scale-note">
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

          {/* ── 操作：視野捲動與縮放（client/controlPrefs.ts）、按鍵設定（KeybindPanel，輸入那邊負責內容）── */}
          <h3>{t('settings.controls')}</h3>
          <Check id="edge-scroll" label={t('settings.edgeScroll')} checked={edgeScrollOn.value} onChange={setEdgeScroll} />
          <SpeedRow id="edge-speed" label={t('settings.edgeSpeed')} value={edgeSpeed.value} set={setEdgeSpeed} />
          <SpeedRow id="key-speed" label={t('set7.keySpeed')} value={keySpeed.value} set={setKeySpeed} />
          <SpeedRow id="wheel-speed" label={t('set7.wheelSpeed')} value={wheelSpeed.value} set={setWheelSpeed} />
          <Check id="wheel-invert" label={t('set7.wheelInvert')} hint={t('set7.wheelInvert.hint')} checked={wheelInvert.value} onChange={setWheelInvert} />
          {/* 按鍵設定面板沒有內容時（還沒實作）連小標題一起藏起來（screens7.css 的 :empty）*/}
          <div class="set7-keys" data-testid="keybinds">
            <h4>{t('set7.keys')}</h4>
            <div class="set7-keys-host">
              <KeybindPanel />
            </div>
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
