// 單機練習的設定與「再來一局」（第 3 輪審查）：
// 練習對話框按「開始」與結算／觀戰畫面的「再來一局」走同一條路（startPractice），設定（身分、AI 數量、難度）一模一樣。
// sim 端的練習房結束後不會回到大廳，所以「再來一局」= 關掉這一局的單機主機（leave）、用同樣的設定重新開一間練習房。
import { currentRoom, isHost, leave, loadProfile, startPractice, type Profile } from '../../client/session'
import { MAX_PLAYERS } from '../../shared/constants'
import { AI_LEVELS, PRACTICE_ROLES, PRACTICE_ROOM, type AiLevel, type PracticeRole } from '../../shared/protocol/messages'
import { t } from '../i18n'

/** 一場練習的設定 */
export interface PracticeRun {
  role: PracticeRole
  bots: number
  ai: AiLevel
}

const PRACTICE_KEY = 'xc.practice'
/** 練習的 AI 難度（上次的選擇；沒選過的新手預設簡單）*/
const PRACTICE_AI_KEY = 'xc.practiceAi'

/** 練習對話框上次的身分與 AI 數量（沒有存過就是隨機身分、5 個 AI）*/
export function loadPracticePrefs(): { role: PracticeRole; bots: number } {
  try {
    const raw = JSON.parse(localStorage.getItem(PRACTICE_KEY) ?? 'null') as { role?: unknown; bots?: unknown } | null
    if (raw) {
      const role = PRACTICE_ROLES.includes(raw.role as PracticeRole) ? (raw.role as PracticeRole) : 'random'
      const bots = typeof raw.bots === 'number' && raw.bots >= 1 && raw.bots <= MAX_PLAYERS - 1 ? Math.round(raw.bots) : 5
      return { role, bots }
    }
  } catch {
    /* ignore */
  }
  return { role: 'random', bots: 5 }
}

export function savePracticePrefs(p: { role: PracticeRole; bots: number }): void {
  try {
    localStorage.setItem(PRACTICE_KEY, JSON.stringify(p))
  } catch {
    /* ignore */
  }
}

export function loadAiLevel(): AiLevel {
  try {
    const v = localStorage.getItem(PRACTICE_AI_KEY)
    if (AI_LEVELS.includes(v as AiLevel)) return v as AiLevel
  } catch {
    /* ignore */
  }
  return 'easy'
}

export function saveAiLevel(v: AiLevel): void {
  try {
    localStorage.setItem(PRACTICE_AI_KEY, v)
  } catch {
    /* ignore */
  }
}

/** 這個分頁上一次開練習用的設定（重新整理後就沒有了，改用對話框存下來的偏好）*/
let last: PracticeRun | null = null

/** 上一場練習的設定：這個分頁開過就用那一場的，否則用練習對話框存下來的偏好 */
export function lastPracticeRun(): PracticeRun {
  if (last) return { ...last }
  const p = loadPracticePrefs()
  return { role: p.role, bots: p.bots, ai: loadAiLevel() }
}

/** 開一場練習並記下設定（練習對話框的「開始」與「再來一局」共用）*/
export function runPractice(profile: Profile, run: PracticeRun): void {
  last = { ...run }
  void startPractice(profile, run.bots, run.role, run.ai)
}

/** 目前這一局是不是單機練習（練習房一定是自己當主機；多人房的客人就算打了同樣的房號也不算）*/
export function inPractice(): boolean {
  return currentRoom() === PRACTICE_ROOM && isHost.value
}

/** 再來一局：結束這一場練習，用同樣的設定（身分、AI 數量、難度）馬上再開一場；不是練習局就什麼都不做 */
export function replayPractice(): boolean {
  if (!inPractice()) return false
  const run = lastPracticeRun()
  leave()
  runPractice(loadProfile(), run)
  return true
}

/** 「再來一局」按鈕的說明：用的是哪一組設定（身分、AI 數量、難度）*/
export function againTip(run: PracticeRun = lastPracticeRun()): string {
  return t('ui5.practice.againTip', { role: t('practice.r.' + run.role), n: run.bots, ai: t('ui4.practice.ai.' + run.ai) })
}
