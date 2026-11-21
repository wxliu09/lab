// 介面文字（第 6 輪（付費玩家第一晚審查）sim 端：NPC 仇恨與還手、練習 AI、通訊病毒、抽血通知、死因）。
// 用 addStrings 在載入時註冊，App.tsx 有 `import './strings/sim8'`（在 sim7 之後，可以覆寫同名 key）。
import { addStrings } from '../i18n'

export const SIM8_ZH: Record<string, string> = {
  // 被 NPC 船員、防禦無人機打死時的補充說明（只給死者；death.ts 的 DeathReport.note）
  'death.note.npc.crew': '└ 是你先傷到了船員，他們才對你開火（擦到一下約記仇 10 秒，重傷約 30 秒；被打時你的單位會自動還手）。',
  'death.note.npc.drone': '└ 是你先打到了防禦無人機，無人機才對你開火（記仇 10–30 秒）。',
  'death.note.npc.monster': '└ 船員看到你以怪物形態傷人，才對你開火。',
  'death.note.npc.helped': '└ 船員看到有人在和你交戰，出手幫了對方。',
  // 被抽血（git.ts：只在看得到抽血者時送出；名字是你眼中他現在顯示的名字）
  'git.msg.drawnBy': '{name} 抽了你的血（基因檢測樣本）。',
  // 通訊病毒結束：私訊每個人恢復後的名字（換名時的私訊 event.virusYou 在 sim6）
  'event.virusRestored': '通訊病毒解除：你的名字和顏色恢復成「{name}」。',
  'event.virusEnd': '通訊網路的病毒清除了，每個人的識別資料恢復正常。',
  // 結算時間軸：持續傷害帶出來源
  'tl.cause.dotOf': '└ 死因：{uz}（持續傷害）',
  'tl.cause.dotBy': '└ 死因：{name} 造成的{uz}（持續傷害）',
  // 練習 AI：只憑交叉比對推論出的嫌疑人，只公開提醒、盯著，不直接開火
  'play1.bot.suspect': '交叉比對我的驗血結果，{name} 最可疑。先別開槍，我會盯著他；他一變身就動手。',
  'play1.bot.evac': '星區撐不住了，我要撤到翠原星地表！',
}

export const SIM8_EN: Record<string, string> = {
  'death.note.npc.crew': '└ You hurt the crew first; that is why they opened fire (a graze is held against you for about 10 s, a real wound about 30 s; your unit fights back on its own when they shoot).',
  'death.note.npc.drone': '└ You hit a defense drone first; that is why it opened fire (it holds a grudge for 10–30 s).',
  'death.note.npc.monster': '└ The crew saw you hurting people in monster form, so they opened fire.',
  'death.note.npc.helped': '└ The crew saw someone fighting you and stepped in to help them.',
  'git.msg.drawnBy': '{name} took a blood sample from you.',
  'event.virusRestored': 'Comm virus cleared: your name and color are back to "{name}".',
  'event.virusEnd': 'The comm network is clean again; everyone\'s identity records are back to normal.',
  'tl.cause.dotOf': '└ Cause: {ue} (damage over time)',
  'tl.cause.dotBy': "└ Cause: {ue} from {name} (damage over time)",
  'play1.bot.suspect': 'Cross-checking my blood tests, {name} looks the most suspicious. Hold your fire; I will keep an eye on them and shoot the moment they change.',
  'play1.bot.evac': 'The sector is falling apart. I am evacuating to the surface of Verdance!',
}

addStrings(SIM8_ZH, SIM8_EN)
