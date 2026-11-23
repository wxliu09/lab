// 介面文字（第 9 輪上架前總評的修正：文字一致性與小修）
import { addStrings } from '../i18n'

export const FIX9T_ZH: Record<string, string> = {
  // 練習對話框：AI 難度卡片只寫一兩句；完整說明（ui4.practice.ai.*.d）放 tooltip
  'fix9t.practice.ai.easy.d': '對新手寬容：AI 不會主動打你、不會點名指認你，異類開局 7 分鐘內不動手。適合第一次玩。',
  'fix9t.practice.ai.normal.d': 'AI 船員主動驗血、公開指認可疑的人；異類開局 2 分鐘後就可能動手。',
  // 大廳：踢出要再按一次確認；開局時由 AI 補上的位置
  'fix9t.kick.confirm': '再按一次確認',
  'fix9t.lobby.aiFill': 'AI 補位',
  'fix9t.lobby.aiFillTip': '開局時由一名 AI 玩家坐這個位置（房間設定「{set}」）。有人加入就讓給真人。',
  // 防護服 tooltip、圖鑑、頭像：每秒傷害
  'fix9t.tip.dps': '每秒傷害',
  // 頭像能力值的 tooltip
  'fix9t.portrait.title': '能力值',
  'fix9t.portrait.mods': '已計入：{list}',
  'fix9t.portrait.base': '只計入看得到的加成（職業被動、公開的狀態效果）。',
  // 頂列 EP：已達下一個門檻
  'fix9t.ep.ready': '可進化',
  'fix9t.ep.readyAndroid': '可升級',
  // 互動面板的分頁：同名的好幾台（例如兩台 GIT 解析器）
  'fix9t.panel.mine': '{name}（你的）',
  'fix9t.panel.nth': '{name} #{n}',
}

export const FIX9T_EN: Record<string, string> = {
  'fix9t.practice.ai.easy.d': 'Forgiving: AI never shoots you first or names you, and AI threats hold off for the first 7 minutes. Best for a first game.',
  'fix9t.practice.ai.normal.d': 'AI crew actively blood-test and publicly name suspects; AI threats may strike after 2 minutes.',
  'fix9t.kick.confirm': 'Click again to confirm',
  'fix9t.lobby.aiFill': 'AI fill-in',
  'fix9t.lobby.aiFillTip': 'An AI player takes this seat when the game starts (room setting “{set}”). It makes way if a person joins.',
  'fix9t.tip.dps': 'DPS',
  'fix9t.portrait.title': 'Stats',
  'fix9t.portrait.mods': 'Includes: {list}',
  'fix9t.portrait.base': 'Only bonuses you can see are included (class passives, visible status effects).',
  'fix9t.ep.ready': 'ready',
  'fix9t.ep.readyAndroid': 'ready',
  'fix9t.panel.mine': '{name} (yours)',
  'fix9t.panel.nth': '{name} #{n}',
}

addStrings(FIX9T_ZH, FIX9T_EN)
