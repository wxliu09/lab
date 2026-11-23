// 介面文字（第 6 輪（付費玩家第一晚審查）介面：設定、頂列、文字一致性、提示）。
// 用 addStrings 在載入時註冊，App.tsx 有 `import './strings/ui6'`（在 sim7 之後，可以覆寫同名 key）。
import { addStrings } from '../i18n'

export const UI6_ZH: Record<string, string> = {
  // ───── 設定：網路設定收進「進階連線設定」、所有設定即時存檔（Settings.tsx）─────
  'ui6.settings.advanced': '進階連線設定',
  'ui6.settings.advancedNote':
    '預設設定適用於大多數網路，朋友連不上時才需要調整。變更會在下次建立或加入房間時生效。',
  'ui6.settings.netDefault': 'Nostr（預設）',
  'ui6.settings.turnBad': 'JSON 格式錯誤：這段 TURN 設定還沒有儲存，目前沿用上一次的設定。',
  'ui6.settings.autoSaved': '所有設定都會立即生效並自動儲存',
  // ───── 目標面板（Guide.tsx）─────
  // 駕駛中（pilotStep）：按鍵照實際綁定（右鍵移動、停靠技能的快捷鍵、{key_unpilot} 離開控制台；第 9 輪起也跟著按鍵設定）
  'ui6.guide.s.pilotShip': '駕船：右鍵移動・按 {k}「{name}」再點站點（畫面或小地圖都可以）停靠・{key_unpilot} 離開控制台',
  'ui6.guide.s.pilotShipNoDock': '駕船：右鍵移動・{key_unpilot} 離開控制台',
  'ui6.guide.s.pilotStation': '駕駛站點：右鍵移動整座站・指令卡換成站點的技能・{key_unpilot} 離開控制台',
  'ui6.guide.s.pilotFixed': '駕駛中：指令卡換成載具的技能・{key_unpilot} 離開控制台',
  'ui6.guide.s.pilotDrone': '操控防禦無人機：右鍵移動・{key_unpilot} 交回自己的角色（離開圈子也會斷線）',
  // EP 已達標但還不能選（epLeftText）
  'ui6.guide.epEvolving': '進化中',
  'ui6.guide.epEnough': 'EP 已足夠',
  // ───── 範圍傷害會波及 NPC 船員（技能、道具 tooltip 與圖鑑；aoe.ts 的 hitsBystanders）─────
  'ui6.tip.aoeCrew': '範圍傷害不分敵我：附近的 NPC 船員也會被打到，被打傷的船員會反擊一段時間。',
  'ui6.codex.aoeCrew': '（範圍傷害，會波及 NPC 船員）',
  // ───── 圖鑑「地點」的出現條件（Codex.tsx 的 placeWhenKey）─────
  'ui6.codex.enable.caldera': '7 人以上時隨機出現',
  'ui6.codex.place.calderaWhen':
    '出現條件：開局 7 人以上時，約三分之一的局會出現，而且要有人抽到工程師（工程師會在這裡出生）。',
}

export const UI6_EN: Record<string, string> = {
  'ui6.settings.advanced': 'Advanced connection settings',
  'ui6.settings.advancedNote':
    'The defaults work on most networks; only change these if friends cannot connect. Changes apply the next time you create or join a room.',
  'ui6.settings.netDefault': 'Nostr (default)',
  'ui6.settings.turnBad':
    'Invalid JSON: this TURN setting has not been saved; the previous one stays in use.',
  'ui6.settings.autoSaved': 'Changes apply right away and are saved automatically',
  'ui6.guide.s.pilotShip':
    'Flying: right-click to move · press {k} ({name}) then click a station (in view or on the minimap) to dock · {key_unpilot} to leave the console',
  'ui6.guide.s.pilotShipNoDock': 'Flying: right-click to move · {key_unpilot} to leave the console',
  'ui6.guide.s.pilotStation':
    'Piloting the station: right-click to move it · the command card holds its skills · {key_unpilot} to leave the console',
  'ui6.guide.s.pilotFixed': 'Piloting: the command card holds the vehicle’s skills · {key_unpilot} to leave the console',
  'ui6.guide.s.pilotDrone':
    'Defense drone: right-click to move · {key_unpilot} to return to your character (stepping out of the ring also cuts the link)',
  'ui6.guide.epEvolving': 'Evolving',
  'ui6.guide.epEnough': 'Enough EP',
  'ui6.tip.aoeCrew':
    'Area damage hits everyone: nearby NPC crew get hurt too, and a crew member you hurt fights back for a while.',
  'ui6.codex.aoeCrew': ' (Area damage: also hits NPC crew.)',
  'ui6.codex.enable.caldera': 'Random, 7+ players',
  'ui6.codex.place.calderaWhen':
    'When it appears: in games that start with 7 or more players, about one game in three, and only if someone draws the Engineer class (who then starts here).',
}

addStrings(UI6_ZH, UI6_EN)
