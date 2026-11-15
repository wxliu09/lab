// 介面文字（第五批，新手試玩審查）：平手的原因、進化確認依身分、進化分支預覽、變種人的吞噬提示與 EP 回饋、
// 遊戲內的離開確認（練習局與多人局分開說）。
export const UI5_ZH: Record<string, string> = {
  // ───── 結算：平手的原因（EndResult.drawWhy）─────
  'end.drawWhy.wipe': '各方同歸於盡，沒有任何一方存活。',
  'end.drawWhy.doom': '末日倒數結束時仍未分出勝負。',

  // ───── 進化確認：異形結繭不能動、變種人肉團能慢慢動 ─────
  'evo.confirmHint.xeno': '進化不能取消；結繭的 60 秒內原地不動，繭被打破你就會死。',
  'evo.confirmHint.mutant': '進化不能取消；60 秒內你是無敵的肉團，只能緩慢移動，所在的站被毀一樣會死。',
  'evo.confirmHint.android': '換機體不能取消；鑄造台建造約需 30 秒。',

  // ───── 進化選單：EP 不足時預覽下一階的分支（灰色、不能選）─────
  'ui5.evo.preview': '下一階可以選的分支（EP 夠了才能選）：',
  'ui5.evo.previewNeed': '需要 {n} EP',

  // ───── 變種人：生物懸停說明、EP 回饋 ─────
  'ui5.hover.devour': '{k} 吞噬：+{n} EP',
  'ui5.hover.devourCard': '指令卡「吞噬」：+{n} EP',
  'ui5.ep.gain': '+{n} EP',

  // ───── 離開對局：遊戲內確認（Esc 取消）─────
  'ui5.leave.title': '離開對局？',
  'ui5.leave.practice': '這場練習會直接結束，不會保留進度；之後可以從主選單再開一場。',
  'ui5.leave.guest': '離開後無法回到這局。',
  'ui5.leave.host': '離開後無法回到這局。你是主機：離開會讓這局對所有人結束。',
  'ui5.leave.ok': '離開對局',
  'ui5.leave.okPractice': '結束練習',
  'ui5.leave.cancel': '取消（Esc）',
}

export const UI5_EN: Record<string, string> = {
  'end.drawWhy.wipe': 'Every side was wiped out; no one survived.',
  'end.drawWhy.doom': 'Doomsday ran its course with no side victorious.',

  'evo.confirmHint.xeno': 'Evolution cannot be cancelled. You stay put in a cocoon for 60 s; if it breaks, you die.',
  'evo.confirmHint.mutant': 'Evolution cannot be cancelled. For 60 s you are an invulnerable mass that can only crawl; you still die if the station is destroyed.',
  'evo.confirmHint.android': 'A new chassis cannot be cancelled; the fabricator takes about 30 s.',

  'ui5.evo.preview': 'Branches at the next tier (pick one once you have the EP):',
  'ui5.evo.previewNeed': 'Needs {n} EP',

  'ui5.hover.devour': '{k} Devour: +{n} EP',
  'ui5.hover.devourCard': 'Devour (command card): +{n} EP',
  'ui5.ep.gain': '+{n} EP',

  'ui5.leave.title': 'Leave the game?',
  'ui5.leave.practice': 'This practice game ends right away and is not saved. You can start another from the main menu.',
  'ui5.leave.guest': 'You cannot come back to this game.',
  'ui5.leave.host': 'You cannot come back to this game. You are the host: leaving ends it for everyone.',
  'ui5.leave.ok': 'Leave game',
  'ui5.leave.okPractice': 'End practice',
  'ui5.leave.cancel': 'Cancel (Esc)',
}
