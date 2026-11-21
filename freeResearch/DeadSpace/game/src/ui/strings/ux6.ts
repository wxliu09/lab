// 介面文字（第 6 輪（付費玩家第一晚審查）client 端：點選目標、右鍵攻擊、吞噬瞄準、停靠、標籤、背景暫停）。
// 用 addStrings 在載入時註冊，App.tsx 有 `import './strings/ux6'`（在 sim7 之後，可以覆寫同名 key）。
import { addStrings } from '../i18n'

export const UX6_ZH: Record<string, string> = {}

export const UX6_EN: Record<string, string> = {}

addStrings(UX6_ZH, UX6_EN)
