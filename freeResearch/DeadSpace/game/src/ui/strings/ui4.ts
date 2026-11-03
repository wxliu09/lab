// 介面文字（第四批）：名字依介面語言顯示、背包拖曳（交換／給予）、大廳主機提示
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
  'guide.ctl.drag.k': '拖曳',
  'guide.ctl.drag': '背包格拖到另一格：交換位置；拖到人身上：走過去交給他',

  // ───── 結算卡：被轉化的人 ─────
  'ui4.end.spawn': '眷屬',

  // ───── 大廳 ─────
  'ui4.lobby.hostHint': '你是主機：主機電腦的卡頓會傳給所有人，建議用效能較好的電腦當主機',
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
  'guide.ctl.drag.k': 'Drag',
  'guide.ctl.drag': 'Inventory slot onto another slot: swap. Onto a person: walk over and hand it to them.',

  'ui4.end.spawn': ' spawn',

  'ui4.lobby.hostHint': 'You are the host: any lag on the host computer reaches every player, so host from your fastest machine.',
}
