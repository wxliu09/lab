// 介面文字（第 7 輪（視聽與手感）鏡頭與世界疊加層：瞄準預覽、鏡頭跟隨）。
// 用 addStrings 在載入時註冊，App.tsx 有 `import './strings/cam7'`；render/overlay.ts、gameScene.ts 也各自 import。
import { addStrings } from '../i18n'

export const CAM7_ZH: Record<string, string> = {
  // 技能／道具瞄準：目標在射程外（下令後會先走過去）；標在效果範圍圈下方（render/overlay.ts aimPreview）
  'cam7.aim.out': '超出射程・會先走過去',
  // 開始駕駛（站點、船艇、無人機）且設定開著「駕駛時鏡頭自動跟隨」：鏡頭開始跟著載具（render/gameScene.ts）
  'cam7.follow.pilot': '鏡頭跟著你駕駛的載具・移動鏡頭就會停止跟隨',
}

export const CAM7_EN: Record<string, string> = {
  'cam7.aim.out': 'Out of range · will move closer first',
  'cam7.follow.pilot': 'Camera is following your vessel · pan the camera to stop',
}

addStrings(CAM7_ZH, CAM7_EN)
