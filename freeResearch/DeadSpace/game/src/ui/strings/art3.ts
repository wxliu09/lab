// 介面文字（新手試玩回饋：操作、小地圖、鏡頭）：小地圖右鍵點到走不到的地方的提示
// 用 addStrings 在載入時註冊（使用的模組 import 這個檔案即可：ui/hud/Hud.tsx）
import { addStrings } from '../i18n'

export const ART3_ZH: Record<string, string> = {
  'art3.unreachable': '無法到達',
}

export const ART3_EN: Record<string, string> = {
  'art3.unreachable': "Can't get there",
}

addStrings(ART3_ZH, ART3_EN)
