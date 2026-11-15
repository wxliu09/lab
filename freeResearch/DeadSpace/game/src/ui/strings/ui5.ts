// 介面文字（第五批，新手試玩審查）：平手的原因、進化確認依身分、進化分支預覽、變種人的吞噬提示與 EP 回饋、
// 遊戲內的離開確認（練習局與多人局分開說）。
// 第 3 輪人類玩家視角審查：練習「再來一局」、晉升後的職業名、大廳唯讀設定、主選單語言切換、介面大小的數字、圖鑑同名生物。
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
  'ui5.ep.gain': '+{n} EP',

  // ───── 離開對局：遊戲內確認（Esc 取消）─────
  'ui5.leave.title': '離開對局？',
  'ui5.leave.practice': '這場練習會直接結束，不會保留進度；之後可以從主選單再開一場。',
  'ui5.leave.guest': '離開後無法回到這局。',
  'ui5.leave.host': '離開後無法回到這局。你是主機：離開會讓這局對所有人結束。',
  'ui5.leave.ok': '離開對局',
  'ui5.leave.okPractice': '結束練習',
  'ui5.leave.cancel': '取消（Esc）',
  // ───── 第 3 輪：練習「再來一局」（觀戰、出局、結算畫面）─────
  'ui5.practice.again': '再來一局',
  'ui5.practice.againTip': '用同樣的設定馬上重開一場練習：{role}、{n} 個 AI、{ai}難度。',
  'ui5.practice.againDead': '這場練習你已經出局了，可以直接再來一局。',

  // ───── 晉升後的職業（政委晉升成特務：名字前面多了「特務·」）─────
  'ui5.class.agent': '特務',

  // ───── 大廳：客人看到的設定是唯讀的 ─────
  'ui5.lobby.readonly': '設定由主機決定，你只能查看。',

  // ───── 主選單右上角的語言切換 ─────
  'ui5.menu.lang': '介面語言',

  // ───── 設定：介面大小（滑桿是你加的倍率，說明列是實際大小）─────
  'ui5.settings.uiScaleNote': '會依視窗大小自動調整，再乘上右邊的倍率；目前實際大小 {pct}%',

  // ───── 圖鑑：同名的生物合併成一項，列出各種個體 ─────
  'ui5.codex.variants': '這個名字底下其實有 {n} 種個體，數值相同，差在出現的地方、吞噬 EP 與掉落物：',
  'ui5.codex.var.line': '{where}：吞噬 +{ep} EP{drop}',
  'ui5.codex.var.dropAlways': '，必定掉落{item}',
  'ui5.codex.var.dropMaybe': '，有機會掉落 {n} 種道具之一（最常見的是{items}）',
  'ui5.codex.where.creature.failed': '{nyx}實驗室的常見個體；實驗室動力開啟時每 45 秒多長出一隻（最多 12 隻）',
  'ui5.codex.where.creature.failedSheep': '{nyx}實驗室開局的 4 隻之一',
  'ui5.codex.where.creature.anomaly': '「空間顫動」事件時，一口氣在玩家身邊冒出 12 隻',
  'ui5.codex.where.creature.anomalyCaged': '{vivarium}第 2 間隔間關著的 5 隻',
  'ui5.codex.where.creature.anomalyRich': '{verdance}地表',
}

export const UI5_EN: Record<string, string> = {
  'end.drawWhy.wipe': 'Every side was wiped out; no one survived.',
  'end.drawWhy.doom': 'Doomsday ran its course with no side victorious.',

  'evo.confirmHint.xeno': 'Evolution cannot be cancelled. You stay put in a cocoon for 60 s; if it breaks, you die.',
  'evo.confirmHint.mutant': 'Evolution cannot be cancelled. For 60 s you are an invulnerable mass that can only crawl; you still die if the station is destroyed.',
  'evo.confirmHint.android': 'A new chassis cannot be cancelled; the fabricator takes about 30 s.',

  'ui5.evo.preview': 'Branches at the next tier (pick one once you have the EP):',
  'ui5.evo.previewNeed': 'Needs {n} EP',

  'ui5.ep.gain': '+{n} EP',

  'ui5.leave.title': 'Leave the game?',
  'ui5.leave.practice': 'This practice game ends right away and is not saved. You can start another from the main menu.',
  'ui5.leave.guest': 'You cannot come back to this game.',
  'ui5.leave.host': 'You cannot come back to this game. You are the host: leaving ends it for everyone.',
  'ui5.leave.ok': 'Leave game',
  'ui5.leave.okPractice': 'End practice',
  'ui5.leave.cancel': 'Cancel (Esc)',
  'ui5.practice.again': 'Play again',
  'ui5.practice.againTip': 'Start another practice game right away with the same setup: {role}, {n} AI, {ai}.',
  'ui5.practice.againDead': 'You are out of this practice game. Start another one right away.',

  'ui5.class.agent': 'Agent',

  'ui5.lobby.readonly': 'The host sets these; you can only view them.',

  'ui5.menu.lang': 'Language',

  'ui5.settings.uiScaleNote': 'Scales with the window, then times the multiplier on the right; actual size now {pct}%',

  'ui5.codex.variants': '{n} kinds share this name and stats. They differ in where they appear, the EP they give when devoured, and what they drop:',
  'ui5.codex.var.line': '{where}: devour +{ep} EP{drop}',
  'ui5.codex.var.dropAlways': '; always drops {item}',
  'ui5.codex.var.dropMaybe': '; may drop one of {n} items (most often {items})',
  'ui5.codex.where.creature.failed': 'The usual ones in the {nyx} lab; with lab power on, another grows every 45 s (up to 12)',
  'ui5.codex.where.creature.failedSheep': 'One of the 4 in the {nyx} lab at the start',
  'ui5.codex.where.creature.anomaly': 'The spatial tremor event drops 12 of them around the players at once',
  'ui5.codex.where.creature.anomalyRich': 'On the surface of {verdance}',
  'ui5.codex.where.creature.anomalyCaged': 'The 5 kept in cell 2 of the {vivarium}',
}
