import { useEffect, useRef, useState } from 'preact/hooks'
import type { ComponentChildren, JSX } from 'preact'
import { MAX_PLAYERS, PLAYER_COLORS } from '../../shared/constants'
import { AI_LEVELS, DEFAULT_SETTINGS, type AiLevel, type ChatLine, type LobbySettings } from '../../shared/protocol/messages'
import { roleOutcomes, type RoleMix, type RoleRules } from '../../shared/roleRules'
import { chatLog, hostConflict, isHost, leave, lobby, mySlot, send } from '../../client/session'
import { hiddenByMute } from '../../client/chatFilter'
import { listJoin, loc, sysText, t } from '../i18n'
import { tipProps } from '../tooltip'
import { Icon } from '../icons'
import { localizeName, textColorOf } from '../names'
import { STATION_BY_ID } from '../../shared/content/stations/index'
import { SeasonStats } from '../hud/SeasonStats'
import '../strings/ui8'
import '../strings/fix9t'
import '../lobby2.css'
import '../ui4.css'
import '../ui8.css'

// 身分預覽：規則在 shared/roleRules.ts（與 sim 共用）
export { roleOutcomes, type RoleMix } from '../../shared/roleRules'

function Chip({ r, children }: { r: string; children: ComponentChildren }) {
  return <span class={'rchip r-' + r}>{children}</span>
}

/** 把可能的組合畫成陣營色塊；total = 這些身分分配在多少人之中 */
export function RoleMixView({ outcomes, total }: { outcomes: RoleMix[]; total: number }) {
  if (!outcomes.length || total <= 0) return <span class="dim">{t('lobby2.roles.none')}</span>
  const chips: JSX.Element[] = []
  const lo = (k: keyof RoleMix) => Math.min(...outcomes.map((o) => o[k]))
  const hi = (k: keyof RoleMix) => Math.max(...outcomes.map((o) => o[k]))
  const sum = (o: RoleMix) => o.xeno + o.mutant + o.android
  const [a, b] = outcomes
  const either = outcomes.length === 2 && a.android === b.android && a.xeno + b.xeno === 1 && a.mutant + b.mutant === 1 && a.xeno !== a.mutant
  if (either) {
    chips.push(
      <Chip key="e" r="either">
        {t('lobby2.roles.either')} <small>{t('lobby2.roles.eitherNote')}</small>
      </Chip>,
    )
    if (a.android)
      chips.push(
        <Chip key="a" r="android">
          {t('role.android')} {a.android}
        </Chip>,
      )
  } else {
    for (const [k, r] of [
      ['xeno', 'xeno'],
      ['mutant', 'mutant'],
      ['android', 'android'],
    ] as const) {
      const x = lo(k)
      const y = hi(k)
      if (y === 0) continue
      chips.push(
        <Chip key={k} r={r}>
          {x === y ? `${t('role.' + r)} ${x}` : t('lobby2.roles.range', { name: t('role.' + r), a: x, b: y })}
        </Chip>,
      )
    }
  }
  const hMin = total - Math.max(...outcomes.map(sum))
  const hMax = total - Math.min(...outcomes.map(sum))
  if (hMax > 0)
    chips.push(
      <Chip key="h" r="human">
        {hMin === hMax ? `${t('role.human')} ${hMin}` : t('lobby2.roles.range', { name: t('role.human'), a: hMin, b: hMax })}
      </Chip>,
    )
  return <span class="rchips">{chips}</span>
}

/**
 * 一般多人局的最低參戰人數。伺服器開局只擋「一個人都沒有」（sim/server.ts 的 startGame：roster.length === 0），
 * 沒有其他人數門檻，所以這裡依共用的身分規則（roleOutcomes，規則本身不動）推算：
 * 至少 2 人，而且每一種可能的組合都至少留下一名人類的最小人數。
 * 預設設定是 2；把異形、變種人都設成「有」或強制仿生人時，異類會佔滿名額，最低人數跟著變多。
 */
export function minCombatants(s: RoleRules): number {
  for (let n = 2; n <= MAX_PLAYERS; n++) {
    if (roleOutcomes(n, s).every((o) => o.xeno + o.mutant + o.android < n)) return n
  }
  return MAX_PLAYERS
}

// ───────── 設定欄位 ─────────

function Tri({ k, s }: { k: 'aliens' | 'mutants' | 'androids'; s: LobbySettings }) {
  const v = s[k]
  return (
    <select
      disabled={!isHost.value}
      value={String(v)}
      onChange={(e) => {
        const raw = (e.target as HTMLSelectElement).value
        send({ t: 'settings', s: { [k]: raw === 'auto' ? 'auto' : Number(raw) } as Partial<LobbySettings> })
      }}
    >
      <option value="auto">{t('lobby.set.auto')}</option>
      <option value="0">{t('lobby.set.off')}</option>
      <option value="1">{t('lobby.set.on')}</option>
    </select>
  )
}

function Num({ k, s, min, max, step = 1 }: { k: keyof LobbySettings; s: LobbySettings; min: number; max: number; step?: number }) {
  return (
    <input
      type="number"
      style={{ width: '70px' }}
      disabled={!isHost.value}
      min={min}
      max={max}
      step={step}
      value={s[k] as number}
      onChange={(e) => {
        const n = Number((e.target as HTMLInputElement).value)
        if (Number.isFinite(n)) send({ t: 'settings', s: { [k]: Math.max(min, Math.min(max, n)) } as Partial<LobbySettings> })
      }}
    />
  )
}

/** NPC 船員：自動（-1）或 0–8 名 */
function NpcSelect({ s, auto }: { s: LobbySettings; auto: number }) {
  return (
    <select data-testid="set-npc" disabled={!isHost.value} value={String(s.npcCrew)} onChange={(e) => send({ t: 'settings', s: { npcCrew: Number((e.target as HTMLSelectElement).value) } })}>
      <option value="-1">{t('lobby2.npcAuto', { n: auto })}</option>
      {Array.from({ length: 9 }, (_, i) => (
        <option key={i} value={String(i)}>
          {i}
        </option>
      ))}
    </select>
  )
}

/**
 * 末日時間的節奏（[最早, 最晚] 分鐘），選單照這個順序（短到長）：
 * fast＝本作的預設（DEFAULT_SETTINGS.apocalypse）；veteran＝老手節奏（第 8 輪：介於兩者之間，給熟悉規則、想多一點中後期的人）；
 * classic＝原作（研究 03 §6.3：末日計時器 GetRandomReal(3300, 4200) 秒）。
 */
export const APO_PRESETS = {
  fast: [30, 40],
  veteran: [40, 50],
  classic: [55, 70],
} as const satisfies Record<string, readonly [number, number]>
export type ApoPreset = keyof typeof APO_PRESETS
const APO_KEYS = Object.keys(APO_PRESETS) as ApoPreset[]

/** 目前的末日設定是哪一種節奏；兩種都不是（例如舊版主機留下的數字）回傳 null */
export function apoPresetOf(a: readonly [number, number]): ApoPreset | null {
  return APO_KEYS.find((k) => APO_PRESETS[k][0] === a[0] && APO_PRESETS[k][1] === a[1]) ?? null
}

/** 一種節奏在選單、說明裡的名稱（老手節奏的字串是第 8 輪加的）*/
export function apoLabel(k: ApoPreset): string {
  const [a, b] = APO_PRESETS[k]
  return t(k === 'veteran' ? 'ui8.lobby.apo.veteran' : 'ui5.lobby.apo.' + k, { a, b })
}

/** 末日時間的說明：數字跟著 APO_PRESETS，不在字串裡寫死 */
export function apoTip(): string {
  const [fa, fb] = APO_PRESETS.fast
  const [ca, cb] = APO_PRESETS.classic
  const [a, b] = APO_PRESETS.veteran
  return t('ui5.lobby.tip.apo', { fa, fb, ca, cb }) + '\n' + t('ui8.lobby.tip.apoVeteran', { a, b })
}

/** 末日時間：快節奏／老手節奏／原作三選一（主機可改，客人唯讀）*/
function ApoSelect({ s }: { s: LobbySettings }) {
  const cur = apoPresetOf(s.apocalypse)
  return (
    <select
      data-testid="set-apo"
      disabled={!isHost.value}
      value={cur ?? 'custom'}
      onChange={(e) => {
        const k = (e.target as HTMLSelectElement).value as ApoPreset
        const a = APO_PRESETS[k]
        if (a) send({ t: 'settings', s: { apocalypse: [a[0], a[1]] } })
      }}
    >
      {APO_KEYS.map((k) => (
        <option key={k} value={k}>
          {apoLabel(k)}
        </option>
      ))}
      {/* 不是這幾種節奏之一時照實顯示目前的數字（選不到，只能改成上面幾種）*/}
      {!cur && (
        <option value="custom" disabled>
          {t('ui5.lobby.apo.custom', { a: s.apocalypse[0], b: s.apocalypse[1] })}
        </option>
      )}
    </select>
  )
}

// ───────── 一鍵設定：原作模式／本作預設（第 5 輪）─────────

/** 一鍵設定會改的幾項；其他設定（身分、AI 玩家、倍率、聊天與死亡規則）一律不動 */
export const PRESET_KEYS = ['apocalypse', 'extraEvents', 'npcCrew', 'stations'] as const
export type PresetKey = (typeof PRESET_KEYS)[number]
export type PresetValues = Pick<LobbySettings, PresetKey>
export type ModePreset = 'modern' | 'classic'
/** 按鈕的順序：本作預設在前（和末日時間選單「快節奏（預設）→ 原作」同一個順序）*/
export const MODE_KEYS: readonly ModePreset[] = ['modern', 'classic']

/**
 * 兩種模式各自的值：
 * - classic＝原作模式：末日 55–70 分（原作計時器 3300–4200 秒，研究 03 §6.3）；不出原作沒有的事件；
 *   NPC 船員 0（原作沒有 NPC 船員：內容總表「NPC 船員（新增）／本作新增」、GDD §8「NPC 船員（改良）」）；
 *   站點交給自動規則（開哪些站由 sim 照原作的啟用規則決定，不在這裡指定）。
 * - modern＝本作預設：這幾項還原成 DEFAULT_SETTINGS 的值。
 * 每次都回傳新的物件（陣列不和設定表共用）。
 */
export function presetValues(k: ModePreset): PresetValues {
  if (k === 'classic')
    return {
      apocalypse: [APO_PRESETS.classic[0], APO_PRESETS.classic[1]],
      extraEvents: false,
      npcCrew: 0,
      stations: 'auto',
    }
  const d = DEFAULT_SETTINGS
  return {
    apocalypse: [d.apocalypse[0], d.apocalypse[1]],
    extraEvents: d.extraEvents,
    npcCrew: d.npcCrew,
    stations: d.stations === 'auto' ? 'auto' : [...d.stations],
  }
}

function sameStations(a: LobbySettings['stations'], b: LobbySettings['stations']): boolean {
  if (a === 'auto' || b === 'auto') return a === b
  return a.length === b.length && a.every((x, i) => x === b[i])
}

/** 目前的設定剛好是哪一種模式（四項都一樣才算）；都不是回傳 null */
export function modePresetOf(s: PresetValues): ModePreset | null {
  return (
    MODE_KEYS.find((k) => {
      const p = presetValues(k)
      return s.apocalypse[0] === p.apocalypse[0] && s.apocalypse[1] === p.apocalypse[1] && s.extraEvents === p.extraEvents && s.npcCrew === p.npcCrew && sameStations(s.stations, p.stations)
    }) ?? null
  )
}

/** 一項設定在說明裡的寫法：[名稱, 值] */
function presetRow(k: PresetKey, v: PresetValues): [string, string] {
  switch (k) {
    case 'apocalypse': {
      const [a, b] = v.apocalypse
      const p = apoPresetOf(v.apocalypse)
      return [t('ui5.lobby.apo'), p ? apoLabel(p) : t('ui5.lobby.apo.custom', { a, b })]
    }
    case 'extraEvents':
      return [t('ui5.lobby.extra'), t(v.extraEvents ? 'ui5.lobby.preset.on' : 'ui5.lobby.preset.off')]
    case 'npcCrew':
      return [t('lobby.set.npc'), v.npcCrew < 0 ? t('ui5.lobby.preset.npcAuto') : v.npcCrew === 0 ? t('ui5.lobby.preset.npcNone') : t('ui5.lobby.preset.npcN', { n: v.npcCrew })]
    case 'stations':
      return [t('ui5.lobby.preset.stations'), v.stations === 'auto' ? t('ui5.lobby.preset.stationsAuto') : t('ui5.lobby.preset.stationsN', { n: v.stations.length })]
  }
}

/** 一鍵設定的說明：這個模式會把哪幾項改成什麼（數字跟著 presetValues，不在字串裡寫死），其他設定不變 */
export function presetTip(k: ModePreset): string {
  const v = presetValues(k)
  const lines = PRESET_KEYS.map((key) => {
    const [name, val] = presetRow(key, v)
    return t('ui5.lobby.preset.line', { k: name, v: val })
  })
  return [t('ui5.lobby.preset.' + k + '.intro'), ...lines, t('ui5.lobby.preset.rest')].join('\n')
}

/** 送給主機的設定訊息（和其他設定一樣走 settings；四項一起送，主機的驗證全部認得）*/
export function presetMsg(k: ModePreset): { t: 'settings'; s: Partial<LobbySettings> } {
  return { t: 'settings', s: presetValues(k) }
}

/** 房間設定標題列右側的兩個按鈕（只有主機看得到；客人看到的是 ReadonlyBadge）：目前的設定剛好是某個模式時，那個按鈕顯示已選取 */
function PresetButtons({ s }: { s: LobbySettings }) {
  const cur = modePresetOf(s)
  return (
    <div class="mode-presets" role="group" aria-label={t('ui5.lobby.preset')} data-testid="mode-presets">
      {MODE_KEYS.map((k) => (
        <button
          key={k}
          type="button"
          class={'small mode-preset' + (cur === k ? ' on' : '')}
          data-testid={'preset-' + k}
          aria-pressed={cur === k}
          {...tipProps(() => ({
            title: t('ui5.lobby.preset.' + k),
            body: presetTip(k),
            hint: cur === k ? t('ui5.lobby.preset.current') : undefined,
          }))}
          onClick={() => {
            if (isHost.value && cur !== k) send(presetMsg(k))
          }}
        >
          {t('ui5.lobby.preset.' + k)}
        </button>
      ))}
    </div>
  )
}

// ───────── 一鍵設定：小隊地圖、老手節奏（第 8 輪）─────────

/**
 * 小隊地圖關掉的站：活體庫號、擺渡號（auto 規則下兩站每局都開，見 sim/setup.ts ALWAYS_ON_EXTRA）、七號廢站。
 * 用的是站點指定（settings.stations：列出核心站以外要開的站，「-站名」關掉核心站），
 * 所以送 ['-hulk7']＝只開核心站、再拿掉七號廢站（核心站裡唯一純搜刮、沒有任務設施的廢船）；
 * 火口號在 auto 規則下 7 人以上才可能出現，小隊局本來就不會有。
 */
export const SMALL_MAP_OFF: readonly string[] = ['vivarium', 'portage', 'hulk7']
/** 小隊地圖建議的人數上限 */
export const SMALL_MAP_MAX = 6

/** 小隊地圖送出的站點指定（每次給新的陣列）*/
export function smallMapStations(): string[] {
  // 自動站不列就是關掉；核心站要寫「-站名」才會關（sim/setup.ts chooseStations）
  return ['-hulk7']
}

export type ExtraPreset = 'small' | 'veteran'
export const EXTRA_KEYS: readonly ExtraPreset[] = ['small', 'veteran']

/** 這個加選目前開著嗎：小隊地圖＝站點指定剛好是小隊清單；老手節奏＝末日時間剛好是老手節奏 */
export function extraOn(k: ExtraPreset, s: Pick<LobbySettings, 'stations' | 'apocalypse'>): boolean {
  if (k === 'small') return s.stations !== 'auto' && sameStations(s.stations, smallMapStations())
  return apoPresetOf(s.apocalypse) === 'veteran'
}

/**
 * 按下加選送出的設定：關著就打開；開著就關掉（小隊地圖回到自動選站，老手節奏回到快節奏）。
 * 只改自己那一項，其他設定不動
 */
export function extraMsg(k: ExtraPreset, s: Pick<LobbySettings, 'stations' | 'apocalypse'>): { t: 'settings'; s: Partial<LobbySettings> } {
  const on = extraOn(k, s)
  if (k === 'small') return { t: 'settings', s: { stations: on ? 'auto' : smallMapStations() } }
  const [a, b] = on ? APO_PRESETS.fast : APO_PRESETS.veteran
  return { t: 'settings', s: { apocalypse: [a, b] } }
}

/** 加選按鈕上的字 */
export function extraLabel(k: ExtraPreset): string {
  if (k === 'small') return t('ui8.lobby.small', { n: SMALL_MAP_MAX })
  const [a, b] = APO_PRESETS.veteran
  return t('ui8.lobby.veteran', { a, b })
}

/** 加選的說明：會改什麼（站名、分鐘數跟著設定表）、適合誰、怎麼關掉；n = 目前的參戰人數（小隊地圖人太多時提醒）*/
export function extraTip(k: ExtraPreset, n = 0): string {
  if (k === 'small') {
    const names = listJoin(SMALL_MAP_OFF.map((id) => loc(STATION_BY_ID.get(id)?.name) || id))
    const lines = [t('ui8.lobby.small.intro', { names }), t('ui8.lobby.small.best', { n: SMALL_MAP_MAX }), t('ui8.lobby.small.undo'), t('ui8.lobby.extra.rest')]
    if (n > SMALL_MAP_MAX) lines.splice(2, 0, t('ui8.lobby.small.crowd', { n }))
    return lines.join('\n')
  }
  const [a, b] = APO_PRESETS.veteran
  const [fa, fb] = APO_PRESETS.fast
  const [ca, cb] = APO_PRESETS.classic
  return [t('ui8.lobby.veteran.intro', { a, b, fa, fb, ca, cb }), t('ui8.lobby.veteran.why'), t('ui8.lobby.veteran.undo', { a: fa, b: fb }), t('ui8.lobby.extra.rest')].join('\n')
}

/** 標題列第二排：小隊地圖、老手節奏兩個開關（只有主機看得到）*/
function ExtraPresets({ s, n }: { s: LobbySettings; n: number }) {
  return (
    <div class="u8-extras" role="group" aria-label={t('ui5.lobby.preset')} data-testid="extra-presets">
      {EXTRA_KEYS.map((k) => {
        const on = extraOn(k, s)
        // 小隊地圖開著、人卻太多：按鈕換成警告色
        const crowd = k === 'small' && on && n > SMALL_MAP_MAX
        return (
          <button
            key={k}
            type="button"
            class={'small u8-extra' + (on ? ' on' : '') + (crowd ? ' crowd' : '')}
            data-testid={'preset-' + k}
            aria-pressed={on}
            {...tipProps(() => ({
              title: extraLabel(k),
              body: extraTip(k, n),
              hint: on ? t('ui8.lobby.extra.on') : undefined,
            }))}
            onClick={() => {
              if (isHost.value) send(extraMsg(k, s))
            }}
          >
            {extraLabel(k)}
          </button>
        )
      })}
    </div>
  )
}

/** 標題列的摘要：符合的模式＋開著的加選（「本作預設・小隊地圖」）；都沒有就是「自訂」*/
export function presetSummary(s: LobbySettings): string {
  const mode = modePresetOf(s)
  const parts = [...(mode ? [t('ui5.lobby.preset.' + mode)] : []), ...EXTRA_KEYS.filter((k) => extraOn(k, s)).map(extraLabel)]
  return parts.length ? parts.join('・') : t('ui8.lobby.custom')
}

/**
 * 客人：一鍵設定按不了，標題列改成唯讀標示（鎖頭＋目前的模式）；取代原本另佔一行的「設定由主機決定」說明（第 8 輪：
 * 1280×720 客人的設定欄多那一行就放不下最後一列）。懸停看完整說明
 */
function ReadonlyBadge({ s }: { s: LobbySettings }) {
  const sum = presetSummary(s)
  return (
    <div
      class="u8-readonly"
      data-testid="settings-readonly"
      {...tipProps(() => {
        // 符合某個模式時附上那個模式的內容（客人看不到按鈕的說明了）
        const mode = modePresetOf(s)
        return {
          title: t('ui8.lobby.readonlyTitle'),
          body: [t('ui5.lobby.readonly'), ...(mode ? [presetTip(mode)] : [])].join('\n\n'),
        }
      })}
    >
      <Icon name="key" size={13} color="currentColor" />
      <span>{t('ui8.lobby.hostSets', { list: sum })}</span>
    </div>
  )
}

/**
 * AI 難度（第 6 輪）：主機可改、客人唯讀；用語沿用練習對話框的「簡單／一般」。
 * 新開的多人房預設簡單（session.ts ROOM_AI_DEFAULT），練習局照練習對話框的選擇
 */
function AiSelect({ s }: { s: LobbySettings }) {
  return (
    <select
      data-testid="set-ai"
      disabled={!isHost.value}
      value={s.aiLevel}
      onChange={(e) => {
        const v = (e.target as HTMLSelectElement).value as AiLevel
        if (AI_LEVELS.includes(v)) send({ t: 'settings', s: { aiLevel: v } })
      }}
    >
      {AI_LEVELS.map((a) => (
        <option key={a} value={a}>
          {t('ui4.practice.ai.' + a)}
        </option>
      ))}
    </select>
  )
}

function Check({ k, s, testId }: { k: keyof LobbySettings; s: LobbySettings; testId?: string }) {
  return (
    <input
      type="checkbox"
      data-testid={testId}
      disabled={!isHost.value}
      checked={!!s[k]}
      onChange={(e) => send({ t: 'settings', s: { [k]: (e.target as HTMLInputElement).checked } as Partial<LobbySettings> })}
    />
  )
}

/** 一列設定：標籤＋控制項；整列懸停顯示說明（tip 是字串 key，或回傳說明文字的函式）*/
function Row({ label, tip, children }: { label: string; tip: string | (() => string); children: ComponentChildren }) {
  return (
    <div class="setrow" {...tipProps(() => ({ title: label, body: typeof tip === 'function' ? tip() : t(tip) }))}>
      <label class="tiplabel">
        {label}
        <span class="tipmark" aria-hidden="true">
          ?
        </span>
      </label>
      {children}
    </div>
  )
}

// ───────── 大廳 ─────────

/**
 * 大廳聊天要顯示的行（第 6 輪）：本機封鎖的人說的話不顯示（client/mute.ts）；沒有發話者的系統訊息不顯示
 * （上一局的死亡、事件、結算公告不屬於大廳；session.ts 換房、回到大廳時也會清空聊天）。
 * 例外：server 私訊給自己的提示（ch = 'private'：訊息送太快、重複訊息）照常顯示，不然發話的人不知道自己的話沒送出
 */
export function lobbyChatLines(lines: readonly ChatLine[]): ChatLine[] {
  return lines.filter((l) => !hiddenByMute(l) && (l.from !== '' || l.ch === 'private'))
}

/**
 * 大廳左欄的版面（第 6 輪：聊天一長就把玩家名單、踢出按鈕、顏色列擠掉）：玩家名單照內容的高度、不被壓縮；
 * 聊天框只拿剩下的空間（flex-basis 0，不隨聊天內容長高），最高 LOBBY_CHAT_MAX_PX，訊息在框內捲動。
 * 視窗矮到放不下時整個左欄捲動，玩家名單照樣完整
 */
export const LOBBY_CHAT_MAX_PX = 360

/** 踢出要在這麼多毫秒內再按一次才生效（第 9 輪：以前一鍵就踢、沒有確認）*/
export const KICK_CONFIRM_MS = 3000

/**
 * 踢出按鈕按一下的結果（純函式，單元測試用）：armedAt = 上次按下、等待確認的時間（0 = 沒在等）。
 * 第一下只「上膛」（按鈕改寫「再按一次確認」），KICK_CONFIRM_MS 內再按一次才送出踢人；超過時間再按就重新上膛
 */
export function kickClick(armedAt: number, now: number): { kick: boolean; armedAt: number } {
  if (armedAt > 0 && now - armedAt <= KICK_CONFIRM_MS) return { kick: true, armedAt: 0 }
  return { kick: false, armedAt: now }
}

function KickButton({ slot }: { slot: number }) {
  const [armedAt, setArmedAt] = useState(0)
  // 沒有再按：時間到就恢復成「踢出」
  useEffect(() => {
    if (!armedAt) return
    const id = setTimeout(() => setArmedAt(0), KICK_CONFIRM_MS)
    return () => clearTimeout(id)
  }, [armedAt])
  return (
    <button
      type="button"
      class={'small ghost kick-btn' + (armedAt ? ' armed' : '')}
      data-testid={'kick-' + slot}
      onClick={() => {
        const r = kickClick(armedAt, performance.now())
        setArmedAt(r.armedAt)
        if (r.kick) send({ t: 'kick', slot })
      }}
    >
      {armedAt ? t('fix9t.kick.confirm') : t('lobby.kick')}
    </button>
  )
}
const LEFT_STYLE = { overflowY: 'auto' } as const
const PLAYERS_STYLE = { flex: '0 0 auto' } as const
const CHATBOX_STYLE = { flex: '1 1 0px', maxHeight: LOBBY_CHAT_MAX_PX + 'px' } as const
const CHAT_STYLE = { flex: '1 1 0px', minHeight: '54px' } as const

export function Lobby() {
  const L = lobby.value
  const [msg, setMsg] = useState('')
  const [copied, setCopied] = useState(false)
  const chatRef = useRef<HTMLDivElement>(null)
  // 本機封鎖也套用到大廳聊天；沒有發話者的系統訊息不顯示（lobbyChatLines）
  const lines = lobbyChatLines(chatLog.value)
  useEffect(() => {
    const el = chatRef.current
    if (el) el.scrollTop = el.scrollHeight
  }, [lines.length, L !== null])
  if (!L) return <div class="panel modal">{t('menu.connecting')}</div>
  const me = L.players.find((p) => p.slot === mySlot.value)
  const s = L.settings
  const taken = new Set(L.players.filter((p) => p.slot !== mySlot.value).map((p) => p.color))
  const copy = () => {
    const url = `${location.origin}${location.pathname}${location.search}#room=${L.code}`
    void navigator.clipboard?.writeText(url).then(() => setCopied(true))
  }
  // 開局時的參戰人數：大廳裡的人＋補位 AI，主機只主持時不算主機
  const bots = Math.min(s.bots, Math.max(0, MAX_PLAYERS - L.players.length))
  const n = Math.max(0, L.players.length + bots - (s.hostSpectate && L.players.some((p) => p.host) ? 1 : 0))
  const npcAuto = Math.max(0, Math.min(6, 9 - n))
  const need = minCombatants(s)
  const sendChat = () => {
    if (!msg.trim()) return
    send({ t: 'chat', ch: 'all', text: msg })
    setMsg('')
  }
  return (
    <div class="lobby lobby2" data-testid="lobby">
      <div class="panel lobby-head">
        <div>
          <label>{t('lobby.code')}</label>
          <div class="roomcode" data-testid="roomcode">
            {L.code}
          </div>
        </div>
        <button class="small" onClick={copy}>
          {copied ? t('lobby.copied') : t('lobby.copy')}
        </button>
        <div class="role-preview" data-testid="role-preview" {...tipProps(() => ({ title: t('lobby2.roles.title'), body: t('lobby2.roles.note') }))}>
          <div class="rp-head">
            <b>{t('lobby2.roles.title')}</b>
            <span class="dim">
              {t('lobby2.roles.count', { n })}
              {s.hostSpectate ? t('sep.paren', { s: t('lobby2.roles.hostOut') }) : ''}
            </span>
            <span class="tipmark" aria-hidden="true">
              ?
            </span>
          </div>
          {n < need ? (
            // 人數不夠時不列「異形或變種人 1、人類 0」這種組合，改成提示
            <span class="dim" data-testid="role-min">
              {t('lobby2.roles.tooFew', { n: need, practice: t('menu.practice'), bots: t('lobby.set.bots') })}
            </span>
          ) : (
            <RoleMixView outcomes={roleOutcomes(n, s)} total={n} />
          )}
        </div>
        <div class="grow" />
        {hostConflict.value && <div class="notice">{t('lobby.hostConflict')}</div>}
        <div class="logo" style={{ fontSize: '26px' }}>
          XENOCYTE
        </div>
      </div>
      <div class="lobby-left" style={LEFT_STYLE}>
        <div class="panel players" style={PLAYERS_STYLE}>
          <h2>{t('lobby.players', { n: L.players.length })}</h2>
          <div class="pgrid">
            {L.players.map((p) => (
              <div class="pcard" key={p.slot} data-testid={'pcard-' + p.slot} style={{ '--pc': PLAYER_COLORS[p.color]?.hex }}>
                <div class="pname">{localizeName(p.name)}</div>
                <div class="ptags">
                  {p.host && <span class="tag host">{t('lobby.host')}</span>}
                  {p.bot && <span class="tag">{t('lobby.bot')}</span>}
                  {p.ready && <span class="tag ready">{t('lobby.ready')}</span>}
                  {!p.connected && <span class="tag">{t('lobby.offline')}</span>}
                  <span class="grow" />
                  {isHost.value && !p.host && <KickButton slot={p.slot} />}
                </div>
              </div>
            ))}
            {/* 開局時由 AI 補上的位置（第 9 輪：以前只在身分預覽寫「含 AI」，名單上看不到）。
                仍是 .empty（e2e 用 .pcard:not(.empty) 數真人），格子總數不變，1280×720 的版面不受影響 */}
            {Array.from({ length: Math.max(0, MAX_PLAYERS - L.players.length) }, (_, i) =>
              i < bots ? (
                <div class="pcard empty ai-fill" key={'e' + i} data-testid="ai-fill" {...tipProps(() => ({ title: t('fix9t.lobby.aiFill'), body: t('fix9t.lobby.aiFillTip', { set: t('lobby.set.bots') }) }))}>
                  <span class="tag">{t('lobby.bot')}</span>
                  <span>{t('fix9t.lobby.aiFill')}</span>
                </div>
              ) : (
                <div class="pcard empty" key={'e' + i}>
                  —
                </div>
              ),
            )}
          </div>
          <div class="sep" />
          <div class="row lobby-color">
            <label>{t('menu.color')}</label>
            <div class="swatches">
              {PLAYER_COLORS.map((c, i) => (
                <div
                  key={c.id}
                  class={'swatch' + (me?.color === i ? ' on' : '')}
                  style={{ background: c.hex, color: c.hex, opacity: taken.has(i) ? 0.2 : 1 }}
                  onClick={() => !taken.has(i) && send({ t: 'lobby', color: i })}
                />
              ))}
            </div>
          </div>
        </div>
        {/* 聊天與本季戰績並排（還沒有戰績時聊天佔滿整列；SeasonStats 自己不顯示）*/}
        <div class="u8-lower" style={CHATBOX_STYLE}>
          <div class="panel lobby-chatbox" data-testid="lobby-chatbox">
            <h3>{t('lobby.chat')}</h3>
            <div class="lobby-chat" data-testid="lobby-chat" ref={chatRef} style={CHAT_STYLE}>
              {lines.length === 0 && <div class="dim">{t('lobby2.chatEmpty')}</div>}
              {lines.map((l, i) =>
                l.from === '' ? (
                  // 給自己的系統提示（訊息送太快、重複）：沒有發話者，不寫「: 」
                  <div key={i} class="dim">
                    {sysText(l.text)}
                  </div>
                ) : (
                  <div key={i}>
                    <b style={{ color: textColorOf(PLAYER_COLORS[l.color]?.hex) }}>{localizeName(l.from)}</b>: {sysText(l.text)}
                  </div>
                ),
              )}
            </div>
            <input
              data-testid="lobby-chat-input"
              value={msg}
              maxLength={200}
              placeholder={t('lobby2.chatHint')}
              onInput={(e) => setMsg((e.target as HTMLInputElement).value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter') sendChat()
              }}
            />
          </div>
          <SeasonStats present={L.players.filter((p) => !p.bot).map((p) => p.name)} />
        </div>
      </div>
      {/* 客人看到的設定是唯讀的：降低對比、拿掉下拉箭頭；標題列的一鍵設定換成唯讀標示（lobby2.css 的 .readonly、ui8.css）*/}
      <div class={'panel settings-panel' + (isHost.value ? '' : ' readonly')} data-testid="lobby-settings">
        <div class="settings-head">
          <h2>{t('lobby.settings')}</h2>
          {isHost.value ? <PresetButtons s={s} /> : <ReadonlyBadge s={s} />}
          {isHost.value && <ExtraPresets s={s} n={n} />}
        </div>
        <Row label={t('lobby.set.aliens')} tip="lobby2.tip.aliens.body">
          <Tri k="aliens" s={s} />
        </Row>
        <Row label={t('lobby.set.mutants')} tip="lobby2.tip.mutants.body">
          <Tri k="mutants" s={s} />
        </Row>
        <Row label={t('lobby.set.androids')} tip="lobby2.tip.androids.body">
          <Tri k="androids" s={s} />
        </Row>
        <Row label={t('lobby.set.npc')} tip="lobby2.tip.npc.body">
          <NpcSelect s={s} auto={npcAuto} />
        </Row>
        <Row label={t('lobby.set.bots')} tip="lobby2.tip.bots.body">
          <Num k="bots" s={s} min={0} max={MAX_PLAYERS - 1} />
        </Row>
        <Row label={t('ui4.practice.ai')} tip="room6.lobby.ai.tip">
          <AiSelect s={s} />
        </Row>
        <Row label={t('lobby.set.ep')} tip="lobby2.tip.ep.body">
          <Num k="epMult" s={s} min={0.25} max={4} step={0.25} />
        </Row>
        <Row label={t('lobby.set.events')} tip="lobby2.tip.events.body">
          <Num k="eventMult" s={s} min={0.25} max={4} step={0.25} />
        </Row>
        {/* 末日時間：快節奏（預設）、老手節奏、原作三選一 */}
        <Row label={t('ui5.lobby.apo')} tip={apoTip}>
          <ApoSelect s={s} />
        </Row>
        {/* 規則開關排成兩欄（第 8 輪：多了「死者看見真實身分」，1280×720 一欄放不下）*/}
        <div class="u8-toggles" data-testid="set-toggles">
          {/* 第 4 輪：原作沒有的事件可關掉（給想玩原汁原味的老玩家）*/}
          <Row label={t('ui5.lobby.extra')} tip="ui5.lobby.tip.extra">
            <Check k="extraEvents" s={s} testId="set-extra" />
          </Row>
          <Row label={t('lobby.set.localChat')} tip="lobby2.tip.localChat.body">
            <Check k="localChat" s={s} />
          </Row>
          <Row label={t('lobby.set.boot')} tip="lobby2.tip.boot.body">
            <Check k="bootOnDeath" s={s} />
          </Row>
          <Row label={t('lobby.set.spectate')} tip="lobby2.tip.spectate.body">
            <Check k="hostSpectate" s={s} />
          </Row>
          <Row label={t('ui8.lobby.ghostSight')} tip="ui8.lobby.tip.ghostSight">
            <Check k="ghostSight" s={s} testId="set-ghost-sight" />
          </Row>
        </div>
      </div>
      <div class="panel lobby-foot">
        <button class="ghost" onClick={() => leave()}>
          {t('lobby.leave')}
        </button>
        {/* 主機的卡頓會透過快照傳給所有人：提醒用效能較好的電腦當主機 */}
        {isHost.value ? (
          <span class="host-hint" data-testid="host-hint">
            {t('ui4.lobby.hostHint')}
          </span>
        ) : (
          <div class="grow" />
        )}
        {!isHost.value && <span class="dim">{t('lobby.waiting')}</span>}
        <button data-testid="ready" onClick={() => send({ t: 'lobby', ready: !me?.ready })}>
          {me?.ready ? t('lobby.notReady') : t('lobby.ready')}
        </button>
        {isHost.value && (
          <button class="primary" data-testid="start" onClick={() => send({ t: 'start' })}>
            {t('lobby.start')}
          </button>
        )}
      </div>
    </div>
  )
}
