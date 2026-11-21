// 介面文字（第 6 輪（付費玩家第一晚審查）介面：設定、頂列、文字一致性、提示）。
// 用 addStrings 在載入時註冊，App.tsx 有 `import './strings/ui6'`（在 sim7 之後，可以覆寫同名 key）。
import { addStrings } from '../i18n'

export const UI6_ZH: Record<string, string> = {}

export const UI6_EN: Record<string, string> = {}

addStrings(UI6_ZH, UI6_EN)
