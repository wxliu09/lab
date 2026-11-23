// 介面文字（第 6 輪（付費玩家第一晚審查）client 端：點選目標、右鍵攻擊、吞噬瞄準、停靠、標籤、背景暫停）。
// 用 addStrings 在載入時註冊，App.tsx 有 `import './strings/ux6'`（在 sim7 之後，可以覆寫同名 key）。
import { addStrings } from '../i18n'

export const UX6_ZH: Record<string, string> = {
  // 對自己放的技能（抽血、慰藉護盾、投影分身）：瞄準時畫在自己頭上的提示（render/overlay.ts）
  'ux6.aim.self': '再按 {k}：對自己',
  // 吞噬瞄準點空：附近沒有吞得下的東西
  'ux6.aim.devourMiss': '那裡沒有吞得下的東西：吞得下的目標腳下有閃爍的圈 · 右鍵或 Esc 取消',
  // 停靠／設定航線（只對站點）點空
  'ux6.aim.stationMiss': '要點在站點上（點在站點或站名附近都算，也可以直接點小地圖上的站點）· 右鍵或 Esc 取消',
  // 懸停分類：NPC 船員（以前寫「生物」）
  'ux6.hover.cat.npcCrew': 'NPC 船員',
  // 外觀一看就是異形／變種人（或牠們的眷屬、卵、繭），又不是自己已知的隊友：右鍵＝攻擊
  'ux6.hover.cat.monster': '敵對 · 已現形的怪物',
  // 吞噬瞄準：吞得下的目標腳下的圈旁邊標 EP
  'ux6.devour.ep': '+{n} EP',
  // 吞噬：機械（綏靖機器人、無人機、砲塔…）吞不下
  'ux6.devour.no.machine': '不能吞噬：機械吞不下（只吞得下小動物、失敗／暴走實驗體、異常體和 NPC 船員）',
  // 船艙艙門（停靠後走過去下船）：世界標籤與懸停卡片
  'ux6.hatch.docked': '艙門 · 走過去下船',
  'ux6.hatch.flying': '艙門 · 停靠後才能下船',
  'ux6.hatch.any': '艙門 · 停靠時走過去下船',
  'ux6.hatch.title': '艙門',
  'ux6.hatch.cat': '船艙出入口',
  'ux6.hatch.body': '停靠在站上時，走到這裡就會下船；強行登艦連結期間會通往對方那裡。在太空中飛行時走過來不會發生任何事。',
  'ux6.hatch.hint.docked': '右鍵：走過去下船',
  'ux6.hatch.hint.flying': '現在在太空中：先駕駛這艘船，對站點使用「停靠」才能下船',
  // 駕駛中用站內監控掃描：暫時切到站內畫面
  'ux6.sweep.peek': '監控掃描：暫時顯示站內畫面 {s} 秒 · 點一下畫面或按 {key_camSelf} 回到駕駛',
  // 覆寫 ux.ts 的 r3b.pause.sub：單機練習切到背景、局中載入場景時也會自動暫停
  'r3b.pause.sub': '關掉選單、說明、圖鑑或設定就繼續（切到其他分頁、載入場景時也會自動暫停）',
}

export const UX6_EN: Record<string, string> = {
  'ux6.aim.self': 'Press {k} again: yourself',
  'ux6.aim.devourMiss': 'Nothing devourable there: devourable targets have a pulsing ring at their feet · right-click or Esc to cancel',
  'ux6.aim.stationMiss': 'Click a station (on or near the station or its name counts, or click it on the minimap) · right-click or Esc to cancel',
  'ux6.hover.cat.npcCrew': 'NPC crew',
  'ux6.hover.cat.monster': 'Hostile · revealed monster',
  'ux6.devour.ep': '+{n} EP',
  'ux6.devour.no.machine': 'Cannot devour: machines can’t be swallowed (only small animals, failed or rampant experiments, Anomalies and NPC crew)',
  'ux6.hatch.docked': 'Hatch · walk over to disembark',
  'ux6.hatch.flying': 'Hatch · dock first to disembark',
  'ux6.hatch.any': 'Hatch · walk over while docked to disembark',
  'ux6.hatch.title': 'Hatch',
  'ux6.hatch.cat': 'Cabin exit',
  'ux6.hatch.body': 'While docked at a station, walk here to disembark; during a boarding link it leads to the other side. In open space nothing happens.',
  'ux6.hatch.hint.docked': 'Right-click: walk over to disembark',
  'ux6.hatch.hint.flying': 'You are in space: pilot the craft and use Dock on a station first to disembark',
  'ux6.sweep.peek': 'Surveillance sweep: showing the station interior for {s}s · click the view or press {key_camSelf} to return to piloting',
  'r3b.pause.sub': 'Close the menu, help, codex or settings to resume (also pauses automatically while in another tab or loading a scene)',
}

addStrings(UX6_ZH, UX6_EN)
