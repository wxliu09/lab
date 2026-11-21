// 介面文字（第 6 輪（付費玩家第一晚審查）多人：回到大廳再來一局、大廳 AI 難度、大廳聊天）。
// 用 addStrings 在載入時註冊，App.tsx 有 `import './strings/room6'`（在 sim7 之後，可以覆寫同名 key）。
import { addStrings } from '../i18n'

export const ROOM6_ZH: Record<string, string> = {
  // ───── 結算畫面：多人局回到大廳（同一房號再來一局）─────
  'room6.end.toLobby': '回到大廳（同一房號）',
  'room6.end.toLobbyTip':
    '帶還在線的人一起回到房間 {code} 的大廳：座位、顏色、名字和房間設定（含 AI 數量與難度）都保留，可以直接再開一局。已經離開的人會從名單移除，AI 玩家開局時重新補位。',
  'room6.end.hostLeaveTip': '你是主機：回到主選單會關閉這個房間，其他人也會一起斷線。想再玩一局請按「回到大廳」。',
  'room6.end.guestHint': '主機回到大廳時，你會自動一起回到同一個房間，可以直接再玩一局。想現在離開就按「回到主選單」。',
  // 關掉結算畫面（繼續觀看）之後，上方的小列
  'room6.after.title': '這局已結束',
  'room6.after.results': '查看結算',
  'room6.after.guest': '主機回到大廳時你會一起回去',

  // ───── 大廳：AI 難度（沿用練習的「簡單／一般」用語；多人房不套用練習專屬的規則，說明另外寫）─────
  'room6.lobby.ai.tip':
    '補空位的 AI 玩家怎麼行動，只有主機能改。\n' +
    '簡單：AI 船員較晚才去驗血、只驗一輪；驗血結果照樣在全體頻道公布，但不點名指認，也不會主動對人開火（被打才還手）。AI 異類開局 7 分鐘內不動手。適合有新手的朋友房。\n' +
    '一般：AI 船員主動找人驗血，查出可疑的人會公開指認、跟著監視，有確切證據（例如只剩他可能被感染、或親眼看到他攻擊人）才開火；AI 異類開局 2 分鐘後就可能動手。\n' +
    '兩種難度都只改 AI 的行為，真人的規則（例如基因檢測器 7 分鐘開放）照原作。',
}

export const ROOM6_EN: Record<string, string> = {
  'room6.end.toLobby': 'Back to lobby (same room)',
  'room6.end.toLobbyTip':
    'Take everyone still connected back to the lobby of room {code}: seats, colors, names and room settings (including AI count and difficulty) are kept, so you can start the next game right away. Players who left are removed; AI players fill the empty seats again at the start.',
  'room6.end.hostLeaveTip': 'You are the host: going back to the menu closes this room and disconnects everyone. To play again, use "Back to lobby".',
  'room6.end.guestHint': 'When the host goes back to the lobby, you will return to the same room with them and can play again. To leave now, use "Back to menu".',
  'room6.after.title': 'This game is over',
  'room6.after.results': 'View results',
  'room6.after.guest': 'You will follow the host back to the lobby',

  'room6.lobby.ai.tip':
    'How the AI players filling empty seats behave. Only the host can change this.\n' +
    'Easy: AI crew test blood later and only once; they still post the result in all chat, but never name a suspect or shoot first (they only fight back). AI threats wait 7 minutes before striking. Good for friends with newcomers.\n' +
    'Normal: AI crew actively blood-test people, publicly name and shadow anyone suspicious, and open fire only on hard evidence (they are the only one left who could be infected, or were seen attacking someone); AI threats may strike after 2 minutes.\n' +
    'Either way only the AI changes; the rules for human players (such as gene testing opening at minute 7) stay as in the original.',
}

addStrings(ROOM6_ZH, ROOM6_EN)
