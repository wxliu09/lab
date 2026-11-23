// 依大廳末日時間換算的節奏（第 8 輪）：sim（systems/roleSystem.ts 的 EP 每秒結算）與 UI（說明面板、目標面板）共用同一個公式。
// UI 不 import sim，所以放在 shared。
import { ANDROID_EP } from './content/forms'

/** 原作仿生人每秒 EP（研究 02 §5.5、§6.1：oGv 19415，Qo += 1.5，2000 EP ≈ 22.2 分）*/
export const ANDROID_EP_BASE = 1.5

/**
 * 仿生人滿 2000 EP（可以升級底盤）的時刻，落在「預期末日開始時刻」的這個比例。
 * 原作 22.2 分 ÷ 原作末日 55–70 分的中點 62.5 分 ≈ 35.5%；本作預設末日 30–40 分，照原作的 1.5 要 22 分，
 * 已經是中點 35 分的 63%（30 分就開始的局是 74%），升級後沒幾分鐘就末日了（第 8 輪審查 D）。
 */
export const ANDROID_UPGRADE_FRAC = 0.4

/**
 * 仿生人每秒自動得到的 EP（大廳的 EP 倍率另外再乘，見 Game.addEp）：讓滿 2000 EP 的時間約是預期末日開始時刻（末日設定的中點）的 40%，
 * 但不低於原作的 1.5。原作末日 55–70 分 → 1.5（照原作）；本作預設 30–40 分 → 約 2.38（14 分鐘滿）；練習局 20–25 分 → 約 3.7。
 * 本作的調整：原作是固定 1.5，末日時間本來就不能改
 */
export function androidEpPerSec(apocalypse: readonly [number, number] | undefined): number {
  const a = Number(apocalypse?.[0])
  const b = Number(apocalypse?.[1])
  const mid = ((Number.isFinite(a) ? a : 0) + (Number.isFinite(b) ? b : 0)) * 30
  if (!(mid > 0)) return ANDROID_EP_BASE
  return Math.max(ANDROID_EP_BASE, ANDROID_EP / (ANDROID_UPGRADE_FRAC * mid))
}
