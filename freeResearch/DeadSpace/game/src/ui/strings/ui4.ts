// 介面文字（第四批）：名字依介面語言顯示、背包拖曳（交換／給予）、大廳主機提示、雜物箱的右鍵翻找、說明面板分頁、練習的 AI 難度
// 名字：sim 把職業前綴（classes.ts 的 prefix.en）、晉升頭銜「特務·」、管家後綴「 的管家」、預設名「船員 N」直接寫進名字字串；
// client 依語言換掉（見 ui/names.ts 的 localizeName）。前綴的 key 是 name.prefix.<職業 id>。
export const UI4_ZH: Record<string, string> = {
  // ───── 名字 ─────
  'name.prefix.researcher': '博士·',
  'name.prefix.security': '列兵·',
  'name.prefix.medic': '醫護兵·',
  'name.prefix.captain': '艦長·',
  'name.prefix.janitor': '清潔工·',
  'name.prefix.ceo': '執行長·',
  'name.prefix.commissar': '政委·',
  'name.prefix.engineer': '工程師·',
  'name.prefix.corporal': '下士·',
  'name.prefix.ace': '王牌·',
  'name.prefix.agent': '特務·',
  'name.butler': '{name} 的管家',
  'name.default': '船員 {n}',

  // ───── 背包拖曳：交換位置、給予 ─────
  'ui4.drag.hint': '放到另一格＝交換位置；放到人身上＝走過去交給他；放回原處取消',
  'ui4.tip.drag': '拖到另一格交換位置；拖到人身上交給他',
  'ui4.drop.give': '放開：走過去交給他',
  'item.giveFull': '對方的背包已滿',
  'ui4.alive': '存活',
  'ui4.alive.title': '存活人數',
  'ui4.alive.body': '全場還活著的參戰者／總人數，不分身分：被轉化成眷屬的人也算活著，仿生人等記憶核心重建時算死亡。和 -names 名單一致。',
  'guide.ctl.drag.k': '拖曳',
  'guide.ctl.drag': '背包格拖到另一格：交換位置；拖到人身上：走過去交給他',

  // ───── 結算卡：被轉化的人 ─────
  'ui4.end.spawn': '眷屬',

  // ───── 大廳 ─────
  'ui4.lobby.hostHint': '你是主機：主機電腦的卡頓會傳給所有人，建議用效能較好的電腦當主機',

  // ───── 雜物箱：右鍵翻找（自己有翻找技能時）、沒有技能的人只能打破 ─────
  'ui4.hover.rummage': '右鍵：走過去翻找（箱子會報銷）',
  'ui4.hover.crate': '有翻找技能的職業可以翻找；其他人可以打破（按 A 攻擊）',
  'ui4.prompt.rummage': '右鍵 翻找',

  // ───── 說明面板（G）分頁：一頁放得下、不用捲動 ─────
  'ui4.help.tabs': '說明分頁',
  'ui4.help.tab.role': '目標與身分',
  'ui4.help.tab.controls': '操作',
  'ui4.help.tab.things': '站點與設施',
  'ui4.help.now': '現在該做什麼',
  'ui4.help.ctl.unit': '指揮單位',
  'ui4.help.ctl.view': '視野與介面',
  'ui4.help.foot': '← →／1–3 切換分頁 · G 開關說明 · Esc 關閉',

  // ───── 單機練習：AI 難度 ─────
  'ui4.practice.ai': 'AI 難度',
  'ui4.practice.ai.easy': '簡單',
  'ui4.practice.ai.easy.d': 'AI 船員驗血較慢、不公開指認、不主動開火，AI 異類也較晚動手。適合新手熟悉流程。',
  'ui4.practice.ai.normal': '一般',
  'ui4.practice.ai.normal.d': 'AI 船員主動找人驗血，查出可疑的人會公開指認並開火。',
}

export const UI4_EN: Record<string, string> = {
  'name.prefix.researcher': 'Dr. ',
  'name.prefix.security': 'Private ',
  'name.prefix.medic': 'Medic ',
  'name.prefix.captain': 'Captain ',
  'name.prefix.janitor': 'Janitor ',
  'name.prefix.ceo': 'CEO ',
  'name.prefix.commissar': 'Commissar ',
  'name.prefix.engineer': 'Engineer ',
  'name.prefix.corporal': 'Corporal ',
  'name.prefix.ace': 'Ace ',
  'name.prefix.agent': 'Agent ',
  'name.butler': "{name}'s Butler",
  'name.default': 'Crew {n}',

  'ui4.drag.hint': 'Drop on another slot to swap, or on someone to walk over and hand it to them. Drop it back to cancel.',
  'ui4.tip.drag': 'Drag to another slot to swap; drag onto someone to hand it over',
  'ui4.drop.give': 'Release to walk over and hand it to them',
  'item.giveFull': 'Their inventory is full',
  'ui4.alive': 'Alive',
  'ui4.alive.title': 'Players alive',
  'ui4.alive.body': 'Participants still alive out of the total, regardless of role: converted spawn count as alive, and an android waiting on its memory core counts as dead. Matches the -names list.',
  'guide.ctl.drag.k': 'Drag',
  'guide.ctl.drag': 'Inventory slot onto another slot: swap. Onto a person: walk over and hand it to them.',

  'ui4.end.spawn': ' spawn',

  'ui4.lobby.hostHint': 'You are the host: any lag on the host computer reaches every player, so host from your fastest machine.',

  'ui4.hover.rummage': 'Right-click: walk over and rummage (the crate is ruined)',
  'ui4.hover.crate': 'Classes with Rummage can search it; anyone else can break it (press A to attack)',
  'ui4.prompt.rummage': 'Right-click to rummage',

  'ui4.help.tabs': 'Guide pages',
  'ui4.help.tab.role': 'Goal & role',
  'ui4.help.tab.controls': 'Controls',
  'ui4.help.tab.things': 'Stations & facilities',
  'ui4.help.now': 'What to do now',
  'ui4.help.ctl.unit': 'Commanding your unit',
  'ui4.help.ctl.view': 'View & interface',
  'ui4.help.foot': '← → or 1–3 switch pages · G toggles this guide · Esc closes',

  'ui4.practice.ai': 'AI difficulty',
  'ui4.practice.ai.easy': 'Easy',
  'ui4.practice.ai.easy.d': "AI crew test blood slowly, never accuse publicly and don't shoot first; AI threats also strike later. Good for learning the ropes.",
  'ui4.practice.ai.normal': 'Normal',
  'ui4.practice.ai.normal.d': 'AI crew actively blood-test people, then publicly accuse and open fire on anyone they catch.',
}
