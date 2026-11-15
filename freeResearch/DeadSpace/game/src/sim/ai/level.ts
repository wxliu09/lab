// 練習 AI 難度（LobbySettings.aiLevel）的共用判斷。AI 本身（bots.ts）以及跟著難度調整的規則
// （簡單難度延後毀站事件 events.ts、提早開放基因檢測 vendors.ts）都從這裡讀，避免各自寫一份、也避免 systems ↔ ai 互相 import。
import type { Game } from '../game'

/** 簡單難度（練習對話框可選；多人房一律 normal）*/
export const isEasy = (g: Game): boolean => g.settings.aiLevel === 'easy'
