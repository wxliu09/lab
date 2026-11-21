// 介面文字（第 6 輪（付費玩家第一晚審查）多人：回到大廳再來一局、大廳 AI 難度、大廳聊天）。
// 用 addStrings 在載入時註冊，App.tsx 有 `import './strings/room6'`（在 sim7 之後，可以覆寫同名 key）。
import { addStrings } from '../i18n'

export const ROOM6_ZH: Record<string, string> = {}

export const ROOM6_EN: Record<string, string> = {}

addStrings(ROOM6_ZH, ROOM6_EN)
