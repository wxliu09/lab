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
  'ui5.leave.guest': '離開後 90 秒內還能用房號加入回到原席位；超過就會被判定離開。',
  'ui5.leave.host': '離開後無法回到這局。你是主機：離開會讓這局對所有人結束，所有人的身分會公開。',
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

  // ───── 第 4 輪（老手／多人公平視角）：大廳的末日節奏與「原作沒有的事件」、調查筆記的本機封鎖、Esc 選單開筆記 ─────
  // 末日時間：快節奏是本作的預設；原作的末日計時器是 GetRandomReal(3300, 4200) 秒（研究 03 §6.3）
  'ui5.lobby.apo': '末日時間',
  'ui5.lobby.apo.fast': '快節奏 {a}–{b} 分（預設）',
  'ui5.lobby.apo.classic': '原作 {a}–{b} 分',
  'ui5.lobby.apo.custom': '{a}–{b} 分',
  'ui5.lobby.tip.apo':
    '末日事件會在這段時間內隨機觸發：協和安全理事會的艦隊來清場，或軌道穩定器失效。HUD 上的「星區穩定度」會逐漸下降，觸發前 60 秒預告。\n快節奏 {fa}–{fb} 分（預設）：本作的改良，一局比較緊湊，中後期比較短。\n原作 {ca}–{cb} 分：原作的時間。中後期拉長，異形、變種人比較有機會累積到 T3 的 EP、進化到最強的形態。',
  // 原作沒有的事件（sim 的 EXTRA_EVENTS：GDD §7.8 原作留下但沒接上的三個事件；研究 03 §6.2 的死碼與無引用的天守收容失效字串）。
  // 關閉時 windfall（原作 #3，原作在發錢前就 return）照原作沒有效果
  'ui5.lobby.extra': '原作沒有的事件',
  'ui5.lobby.tip.extra':
    '開啟時，隨機事件除了原作有的那些，還可能抽到本作補上的三種（原作留下設計、但沒有接上）：\n・通訊病毒（開局 10 分鐘後才可能出現）：所有人的名字清空 10 秒，之後名字與顏色在玩家之間隨機互換（職業頭銜跟著人，不換），約 3 分鐘後恢復；你會收到私訊，知道自己現在在別人眼中叫什麼。\n・蛞蝓仔大量出現：各站室內湧進一大群蛞蝓仔（女帝號 16 隻，其他站各 8 隻）。\n・天守收容失效：180 秒內要駕駛天守砲台、用主砲對翠原星放電，否則砲台自爆，站內的人全部陪葬。\n關閉時只會抽到原作有的事件；「補給船提早抵達」也照原作沒有效果（開啟時會把所有販賣機補滿）。',

  // 調查筆記：本機封鎖（以名字為準，見 client/mute.ts）
  'ui5.notes.mute': '封鎖此人',
  'ui5.notes.unmute': '解除封鎖',
  'ui5.notes.muteBody': '只在你這邊隱藏他的聊天與小地圖信號；通訊病毒換名後，封鎖會跟著名字走。',
  'ui5.notes.muteSelf': '這個名字現在是你自己的，不能封鎖。',
  'ui5.notes.muted': '已封鎖',

  // ───── 第 5 輪：大廳一鍵設定（原作模式／本作預設）、調查筆記名字旁的職業與死亡標記、主機中止的結算 ─────
  // 一鍵設定只改末日時間、原作沒有的事件、NPC 船員、站點四項；說明裡的值由 Lobby.tsx 依設定表組出來
  'ui5.lobby.preset': '一鍵設定',
  'ui5.lobby.preset.modern': '本作預設',
  'ui5.lobby.preset.classic': '原作模式',
  'ui5.lobby.preset.modern.intro': '把這幾項還原成本作的預設：',
  'ui5.lobby.preset.classic.intro': '照原作的節奏開局（給想玩原汁原味的老玩家）。按下會把這幾項改成：',
  'ui5.lobby.preset.line': '・{k}：{v}',
  'ui5.lobby.preset.rest': '其他設定（身分、AI 玩家、EP 倍率、事件頻率、聊天與死亡規則）不變。',
  'ui5.lobby.preset.current': '目前的設定就是這個模式。',
  'ui5.lobby.preset.hostOnly': '只有主機可以套用。',
  'ui5.lobby.preset.on': '開啟',
  'ui5.lobby.preset.off': '關閉',
  'ui5.lobby.preset.npcAuto': '自動（依人數）',
  'ui5.lobby.preset.npcNone': '0（原作沒有 NPC 船員）',
  'ui5.lobby.preset.npcN': '{n} 名',
  'ui5.lobby.preset.stations': '站點',
  'ui5.lobby.preset.stationsAuto': '自動決定要開哪些站',
  'ui5.lobby.preset.stationsN': '指定的 {n} 個站',

  // 調查筆記：職業只在看得到這個名字的人時顯示（頭頂名字的頭銜）；死者來自全場的死亡公告
  'ui5.notes.classBody': '頭頂名字帶著職業頭銜；只有這個名字的人在你的視野裡時才顯示，看不到就留空。',
  'ui5.notes.dead': '† 已死亡',
  'ui5.notes.deadBody': '全場的死亡公告點過這個名字。',

  // 結算：主機中止了這局
  'ui5.end.aborted': '主機中止了這局：以下是所有人的身分',
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
  'ui5.leave.guest': 'Within 90 seconds you can rejoin with the room code and get your seat back; after that you count as having left.',
  'ui5.leave.host': 'You cannot come back to this game. You are the host: leaving ends it for everyone and reveals every role.',
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

  'ui5.lobby.apo': 'Apocalypse',
  'ui5.lobby.apo.fast': 'Fast {a}–{b} min (default)',
  'ui5.lobby.apo.classic': 'Classic {a}–{b} min',
  'ui5.lobby.apo.custom': '{a}–{b} min',
  'ui5.lobby.tip.apo':
    'The apocalypse triggers at a random time in this range: either a Directorate fleet arrives to sterilise the sector, or the orbital stabilisers fail. The “Sector stability” bar on the HUD drops over time, with a 60-second warning.\nFast {fa}–{fb} min (default): this game’s change, for tighter rounds with a shorter late game.\nClassic {ca}–{cb} min: the original timing. The late game runs longer, so xenos and mutants have a better shot at earning the EP for T3, their strongest forms.',
  'ui5.lobby.extra': 'Extra events',
  'ui5.lobby.tip.extra':
    'When on, besides the original events the director can also draw three this game added (the original left them unfinished):\n• Comm virus (never in the first 10 minutes): everyone’s name goes blank for 10 s, then names and colors are shuffled among the players (class titles stay with each person) for about 3 minutes; a private message tells you what others now see you as.\n• Slugling swarm: sluglings pour into every station interior (16 on the Empress Nyx, 8 on each other station).\n• Tenshu containment failure: within 180 s someone must pilot Tenshu Battery and discharge its main gun at Verdance, or the battery blows up with everyone aboard.\nWhen off, only events the original had can be drawn, and the early supply run does nothing, as in the original (when on, it restocks every vendor).',

  'ui5.notes.mute': 'Block this player',
  'ui5.notes.unmute': 'Unblock',
  'ui5.notes.muteBody': 'Hides their chat and minimap pings on your screen only. If the comm virus swaps names, the block follows the name.',
  'ui5.notes.muteSelf': 'That name is currently yours, so you cannot block it.',
  'ui5.notes.muted': 'Blocked',

  'ui5.lobby.preset': 'Presets',
  'ui5.lobby.preset.modern': 'Default mode',
  'ui5.lobby.preset.classic': 'Classic mode',
  'ui5.lobby.preset.modern.intro': 'Restores this game’s defaults for these settings:',
  'ui5.lobby.preset.classic.intro': 'Play at the original game’s pace, for veterans who want it as it was. Sets:',
  'ui5.lobby.preset.line': '• {k}: {v}',
  'ui5.lobby.preset.rest': 'Everything else (roles, AI players, EP and event rates, chat and death rules) stays as it is.',
  'ui5.lobby.preset.current': 'The settings match this mode right now.',
  'ui5.lobby.preset.hostOnly': 'Only the host can apply it.',
  'ui5.lobby.preset.on': 'On',
  'ui5.lobby.preset.off': 'Off',
  'ui5.lobby.preset.npcAuto': 'Auto (by player count)',
  'ui5.lobby.preset.npcNone': '0 (the original has no NPC crew)',
  'ui5.lobby.preset.npcN': '{n}',
  'ui5.lobby.preset.stations': 'Stations',
  'ui5.lobby.preset.stationsAuto': 'Chosen automatically',
  'ui5.lobby.preset.stationsN': '{n} picked stations',

  'ui5.notes.classBody': 'Read from the class title over their head. Shown only while someone with this name is in your view; blank otherwise.',
  'ui5.notes.dead': '† Dead',
  'ui5.notes.deadBody': 'A death announcement has named this player.',

  'ui5.end.aborted': 'The host aborted this game. Here is everyone’s role:',
}
