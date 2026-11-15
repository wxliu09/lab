// 介面文字（第 4 輪：老手／多人公平視角審查，sim 端的社交與連線）。sim 端以 `@key|k=v` 送出；
// 用 addStrings 在載入時註冊，App.tsx 有 `import './strings/sim7'`（在 sim6 之後，可以覆寫同名 key）。
import { addStrings } from '../i18n'

export const SIM7_ZH: Record<string, string> = {}

export const SIM7_EN: Record<string, string> = {}

addStrings(SIM7_ZH, SIM7_EN)
