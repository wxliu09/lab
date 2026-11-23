// 跨局戰績（第 8 輪）：大廳的「本季戰績」表＋「上一局回顧」＋重設；結算畫面用的精簡版（compact）。
// 資料在 client/seasonStats.ts（這台電腦的 localStorage）；這裡只負責顯示。
import { useEffect, useState } from 'preact/hooks'
import {
  FACTIONS,
  currentGameRecorded,
  inPracticeRoom,
  nightActive,
  refreshSeason,
  resetSeason,
  season,
  shownStreak,
  standings,
  watchSeasonStats,
  type Faction,
  type LastGame,
  type SeasonData,
  type StandingRow,
} from '../../client/seasonStats'
import { lang, listJoin, t } from '../i18n'
import { localizeName } from '../names'
import { tipProps } from '../tooltip'
import '../strings/ui8'
import '../ui8.css'

// 收到結算就記一局（只在瀏覽器裡裝；單元測試的 node 環境沒有 window）
if (typeof window !== 'undefined') watchSeasonStats()

/** 陣營的字色（和結算畫面一樣用亮色）*/
const FAC_TEXT: Record<Faction, string> = {
  human: 'var(--human)',
  xeno: 'var(--xeno-text)',
  mutant: 'var(--mutant-text)',
  android: 'var(--android)',
}
const SIDE_TEXT: Record<LastGame['winner'], string> = {
  crew: 'var(--human)',
  xeno: 'var(--xeno-text)',
  mutant: 'var(--mutant-text)',
  draw: 'var(--dim)',
}

/** 回顧裡最多列幾個贏家的名字 */
const LAST_NAMES = 4

/** 上一局的結果：「異形勝」「平手（末日倒數結束）」 */
export function lastResultText(l: LastGame): string {
  if (l.winner === 'draw') return t(l.drawWhy === 'doom' || l.drawWhy === 'wipe' ? 'ui8.season.last.drawWhy.' + l.drawWhy : 'ui8.season.last.draw')
  return t('ui8.season.last.side.' + l.winner)
}

/** 上一局的贏家名單：「阿明（眷屬）、小華、Bob（AI）等 2 人」；平手回傳空字串 */
export function lastWinnersText(l: LastGame): string {
  const won = l.lineup.filter((p) => p.won)
  if (l.winner === 'draw' || !won.length) return ''
  const names = won.slice(0, LAST_NAMES).map((p) => localizeName(p.name) + (p.spawn ? t('ui8.season.last.spawn') : '') + (p.bot ? t('ui8.season.last.bot') : ''))
  const more = won.length - LAST_NAMES
  return listJoin(names) + (more > 0 ? ' ' + t('ui8.season.last.more', { n: more }) : '')
}

/** 連勝欄：「3 連勝」「2 連敗」；不到 2 場（0、±1）= 空白（seasonStats.ts shownStreak）*/
export function streakText(n: number): string {
  const k = shownStreak(n)
  if (k > 0) return t('ui8.season.win', { n: k })
  if (k < 0) return t('ui8.season.loss', { n: -k })
  return ''
}

/** 一列的說明：今晚、本季（各陣營）、連勝連敗 */
function rowTip(r: StandingRow): string {
  const by = (b: StandingRow['by']) => FACTIONS.filter((f) => b[f][0] > 0).map((f) => t('ui8.season.row.by', { role: t('role.' + f), w: b[f][1], g: b[f][0] }))
  const lines = [
    ...(r.nightGames ? [t('ui8.season.row.night', { w: r.nightWins, g: r.nightGames }), ...by(r.nightBy)] : [t('ui8.season.row.noNight')]),
    t('ui8.season.row.season', { w: r.wins, g: r.games }),
    ...by(r.by),
  ]
  const k = shownStreak(r.streak)
  if (k > 0) lines.push(t('ui8.season.row.win', { n: k }))
  if (k < 0) lines.push(t('ui8.season.row.loss', { n: -k }))
  return lines.join('\n')
}

/** 上一局回顧的完整說明（懸停）：結果、所有贏家、第幾局、幾分鐘 */
function lastTip(l: LastGame): string {
  const won = l.lineup.filter((p) => p.won)
  const names = won.map((p) => localizeName(p.name) + (p.spawn ? t('ui8.season.last.spawn') : '') + (p.bot ? t('ui8.season.last.bot') : ''))
  return [t('ui8.season.last.n', { n: l.n, m: Math.max(1, Math.round(l.duration / 60)) }), ...(names.length ? [listJoin(names)] : [])].join('\n')
}

function LastLine({ l }: { l: LastGame }) {
  const who = lastWinnersText(l)
  return (
    <div class="u8s-last" data-testid="season-last" {...tipProps(() => ({ title: t('ui8.season.lastTitle', { r: lastResultText(l) }), body: lastTip(l) }))}>
      <span class="u8s-last-l">{t('ui8.season.last')}</span>
      <b style={{ color: SIDE_TEXT[l.winner] }}>{lastResultText(l)}</b>
      {who && <span class="u8s-last-who">{who}</span>}
    </div>
  )
}

/** 重設的確認列（取代標題列，不跳原生對話框）*/
function ResetConfirm({ onDone }: { onDone: () => void }) {
  return (
    <div class="u8s-head u8s-confirm" role="group" data-testid="season-reset-confirm">
      <span>{t('ui8.season.reset.q')}</span>
      <span class="grow" />
      <button
        type="button"
        class="small danger"
        data-testid="season-reset-yes"
        onClick={() => {
          resetSeason()
          onDone()
        }}
      >
        {t('ui8.season.reset.yes')}
      </button>
      <button type="button" class="small ghost" data-testid="season-reset-no" onClick={onDone}>
        {t('ui8.season.reset.no')}
      </button>
    </div>
  )
}

function Table({ rows, factions }: { rows: StandingRow[]; factions: boolean }) {
  return (
    <table class="u8s-table" data-testid="season-table">
      <thead>
        <tr>
          <th class="u8s-name">{t('ui8.season.col.name')}</th>
          <th>{t('ui8.season.col.night')}</th>
          <th>{t('ui8.season.col.season')}</th>
          {factions &&
            FACTIONS.map((f) => (
              <th key={f} class="u8s-f" style={{ color: FAC_TEXT[f] }} title={t('ui8.season.col.fTip', { role: t('role.' + f) })}>
                {t('ui8.season.col.f.' + f)}
              </th>
            ))}
          <th>{t('ui8.season.col.streak')}</th>
        </tr>
      </thead>
      <tbody>
        {rows.map((r) => (
          <tr
            key={r.key}
            class={r.present ? undefined : 'away'}
            data-testid="season-row"
            {...tipProps(() => ({
              title: localizeName(r.name),
              body: rowTip(r),
              hint: r.present ? undefined : t('ui8.season.row.away'),
            }))}
          >
            <td class="u8s-name">{localizeName(r.name)}</td>
            <td class="mono">{r.nightGames ? t('ui8.season.wg', { w: r.nightWins, g: r.nightGames }) : '—'}</td>
            <td class="mono">{t('ui8.season.wg', { w: r.wins, g: r.games })}</td>
            {factions &&
              FACTIONS.map((f) => (
                <td key={f} class={'mono u8s-f' + (r.by[f][1] ? '' : ' zero')} style={r.by[f][1] ? { color: FAC_TEXT[f] } : undefined}>
                  {r.by[f][1]}
                </td>
              ))}
            <td class={'mono u8s-streak' + (shownStreak(r.streak) > 0 ? ' up' : shownStreak(r.streak) < 0 ? ' down' : '')}>{streakText(r.streak)}</td>
          </tr>
        ))}
      </tbody>
    </table>
  )
}

/**
 * 本季戰績。
 * - 大廳（預設）：標題列（第幾晚、本季幾局、重設）、上一局回顧、全部玩家的表（present = 大廳裡的人排前面，其他人淡一點）；
 *   還沒有任何紀錄時不顯示（大廳聊天佔滿整列）。
 * - compact（結算畫面）：只列剛結束這局的真人，不分陣營欄、不能重設；練習局顯示一行「不列入戰績」；
 *   這局沒有記（主機中止、沒有真人參戰）就不顯示（不拿上一局的紀錄冒充）。practice 不給就自己看房號。
 */
export function SeasonStats({ compact = false, present, practice }: { compact?: boolean; present?: readonly string[]; practice?: boolean }) {
  void lang.value
  const d: SeasonData = season.value
  const [ask, setAsk] = useState(false)
  // 大廳打開時重讀一次（其他分頁、上一次開遊戲記的）
  useEffect(() => {
    if (!compact) refreshSeason()
  }, [compact])
  if (compact && (practice ?? inPracticeRoom()))
    return (
      <div class="u8s compact dim" data-testid="season-stats">
        {t('ui8.season.practice')}
      </div>
    )
  if (!d.games || !d.last) return null
  if (compact && currentGameRecorded(d) === false) return null
  const now = Date.now()
  const live = nightActive(d, now)
  if (compact) {
    const lineup = d.last.lineup.filter((p) => !p.bot).map((p) => p.name)
    const rows = standings(d, now, { only: lineup, present: lineup })
    if (!rows.length) return null
    return (
      <div class="u8s compact" data-testid="season-stats" {...tipProps(() => ({ title: t('ui8.season.title'), body: t('ui8.season.about') }))}>
        <div class="u8s-head">
          <b>{t('ui8.season.title')}</b>
          <span class="dim">{t('ui8.season.compact.meta', { n: live ? d.nightGames : 0, games: d.games })}</span>
        </div>
        <div class="u8s-chips">
          {rows.map((r) => (
            <div key={r.key} class="u8s-chip" data-testid="season-row" {...tipProps(() => ({ title: localizeName(r.name), body: rowTip(r) }))}>
              <b>{localizeName(r.name)}</b>
              <span class="mono">
                {t('ui8.season.col.night')} {t('ui8.season.wg', { w: r.nightWins, g: r.nightGames })}
              </span>
              <span class="mono dim">
                {t('ui8.season.col.season')} {t('ui8.season.wg', { w: r.wins, g: r.games })}
              </span>
              {shownStreak(r.streak) !== 0 && <span class={'mono u8s-streak ' + (r.streak > 0 ? 'up' : 'down')}>{streakText(r.streak)}</span>}
            </div>
          ))}
        </div>
      </div>
    )
  }
  const rows = standings(d, now, { present })
  return (
    <div class="panel u8s" data-testid="season-stats">
      {ask ? (
        <ResetConfirm onDone={() => setAsk(false)} />
      ) : (
        <div class="u8s-head">
          <h3 {...tipProps(() => ({ title: t('ui8.season.title'), body: t('ui8.season.about') }))}>
            {t('ui8.season.short')}
            <span class="tipmark" aria-hidden="true">
              ?
            </span>
          </h3>
          <span class="dim u8s-meta">{t('ui8.season.meta', { night: d.night, games: d.games })}</span>
          <span class="grow" />
          <button
            type="button"
            class="small ghost u8s-reset"
            data-testid="season-reset"
            onClick={() => setAsk(true)}
            {...tipProps(() => ({ title: t('ui8.season.reset'), body: t('ui8.season.resetTip') }))}
          >
            {t('ui8.season.reset')}
          </button>
        </div>
      )}
      <LastLine l={d.last} />
      <div class="u8s-scroll">
        <Table rows={rows} factions />
      </div>
    </div>
  )
}
