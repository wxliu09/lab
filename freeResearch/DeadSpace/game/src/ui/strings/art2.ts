// 介面文字（第 4 輪「美術、音效、效能」修正）：自動降畫質的提示、地面房名的語言說明
// 用 addStrings 在載入時註冊（使用的模組 import 這個檔案即可：render/gameScene、ui/screens/Settings）
import { addStrings } from '../i18n'

export const ART2_ZH: Record<string, string> = {
  'art2.autoLow': '畫面太慢，已自動降低畫質（可在設定改回）',
  'art2.labelLang': '站內地面的房名以介面語言為主（下一局生效）',
}

export const ART2_EN: Record<string, string> = {
  'art2.autoLow': 'The game was running slowly, so graphics quality was lowered automatically (you can change it back in Settings)',
  'art2.labelLang': 'Room names painted on station floors follow the interface language (from the next match)',
}

addStrings(ART2_ZH, ART2_EN)
