// 介面文字（第 6 輪（付費玩家第一晚審查）sim 端：NPC 仇恨與還手、練習 AI、通訊病毒、抽血通知、死因）。
// 用 addStrings 在載入時註冊，App.tsx 有 `import './strings/sim8'`（在 sim7 之後，可以覆寫同名 key）。
import { addStrings } from '../i18n'

export const SIM8_ZH: Record<string, string> = {}

export const SIM8_EN: Record<string, string> = {}

addStrings(SIM8_ZH, SIM8_EN)
