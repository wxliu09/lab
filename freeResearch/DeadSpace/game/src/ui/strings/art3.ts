// 介面文字（新手試玩回饋：操作、小地圖、鏡頭）：小地圖右鍵點到走不到的地方的提示、瞄準單位點空了、
// 小地圖上選目標、身旁設施的短名稱標籤（overlay.ts）
// 用 addStrings 在載入時註冊（使用的模組 import 這個檔案即可：ui/hud/Hud.tsx）
import { addStrings } from '../i18n'

export const ART3_ZH: Record<string, string> = {
  'art3.unreachable': '無法到達',
  'art3.aim.miss': '要點在目標身上 · 右鍵或 Esc 取消瞄準',
  'art3.aim.mapMiss': '小地圖上那裡沒有可以選的目標 · 右鍵或 Esc 取消瞄準',
  'art3.aim.mapHint': ' · 也可以直接點小地圖',
  'art3.minimap.aim': '瞄準中：左鍵選這裡 · 右鍵取消',
  'art3.minimap.aimPick': '左鍵：選為目標',
  // 身旁設施的短名稱（外觀一樣的販賣機、生命再生器；overlay.ts facilityLabels）
  'art3.fac.medical': '醫療補給',
  'art3.fac.suitA': '防護服·紅',
  'art3.fac.suitB': '防護服·藍',
  'art3.fac.suitC': '防護服·青',
  'art3.fac.suitD': '防護服·黃',
  'art3.fac.fusion': '熱融炸彈',
  'art3.fac.teleportFactory': '傳送裝置',
  'art3.fac.maintenance': '維修站',
  'art3.fac.maintenanceB': '收容維修站',
  'art3.fac.radar': '雷達站',
  'art3.fac.outpost': '前哨補給',
  'art3.fac.escapePod': '救生艙',
  'art3.fac.gravity': '重力控制',
  'art3.fac.lq': 'LQ 倉儲',
  'art3.fac.regen': '再生器',
}

export const ART3_EN: Record<string, string> = {
  'art3.unreachable': "Can't get there",
  'art3.aim.miss': 'Click on a target · right-click or Esc to cancel',
  'art3.aim.mapMiss': 'Nothing to target there on the minimap · right-click or Esc to cancel',
  'art3.aim.mapHint': ' · or click it on the minimap',
  'art3.minimap.aim': 'Aiming: left-click picks this spot · right-click cancels',
  'art3.minimap.aimPick': 'Left-click: pick as target',
  'art3.fac.medical': 'Medical',
  'art3.fac.suitA': 'Suits · Red',
  'art3.fac.suitB': 'Suits · Blue',
  'art3.fac.suitC': 'Suits · Cyan',
  'art3.fac.suitD': 'Suits · Yellow',
  'art3.fac.fusion': 'Fusion Charges',
  'art3.fac.teleportFactory': 'Proto-Portals',
  'art3.fac.maintenance': 'Maintenance',
  'art3.fac.maintenanceB': 'Containment Maint.',
  'art3.fac.radar': 'Radar',
  'art3.fac.outpost': 'Outpost',
  'art3.fac.escapePod': 'Escape Pods',
  'art3.fac.gravity': 'Gravity Control',
  'art3.fac.lq': 'LQ Storage',
  'art3.fac.regen': 'Regenerator',
}

addStrings(ART3_ZH, ART3_EN)
