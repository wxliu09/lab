// 介面文字（第 9 輪上架前總評的修正：按鍵說明與目標面板）
// 按鍵佔位符 {key_<動作>}／{keys_<組>} 由 i18n.ts 的 withKeys 照按鍵設定換成目前的鍵（改鍵後跟著變）。
import { addStrings } from '../i18n'

export const FIX9K_ZH: Record<string, string> = {
  // ───── 按鍵佔位符 ─────
  // 動作沒有按鍵（玩家在按鍵設定裡交換掉了）
  'fix9k.key.unset': '未設定按鍵',
  // 鏡頭捲動四個鍵都是預設的方向鍵時，整組寫成這個
  'fix9k.keys.arrows': '方向鍵',
  // 背包那一格沒有按鍵（目標面板、提示的「按 {k} 穿上／抽血…」）
  'fix9k.key.slot': '背包第 {n} 格',

  // ───── 目標面板：船艙（還沒駕駛）─────
  // 停泊中：站上船艙控制台開始 10 秒發射倒數（sim space.ts LAUNCH_S），下船走船艙左側的艙門
  'fix9k.guide.s.cabinLaunch': '站上船艙的控制台，10 秒後發射；要下船就走到船艙最左側的艙門',
  // 發射倒數中（私有狀態 launchIn）：倒數最後 3 秒前離開控制台就會取消
  'fix9k.guide.s.cabinLaunching': '{s} 秒後發射：站在控制台上的人會駕駛這艘船（最後 3 秒前離開控制台就取消）',
  'fix9k.guide.s.cabinFlying': '船在太空中：站上控制台就能駕駛；要先對站點「停靠」才能下船',
  'fix9k.guide.s.cabinUnknown': '站上控制台：停泊中 10 秒後發射，在太空中就直接接手駕駛',

  // ───── 目標面板：死後附身蛞蝓仔（sim creatures.ts possessSlugling：控制權給那隻蛞蝓仔，牠死了就回到觀戰）─────
  'fix9k.guide.s.slugMove': '你附身了一隻蛞蝓仔：右鍵移動，右鍵點人就跟著他走；{key_stop} 停下',
  'fix9k.guide.s.slugLife': '活人看得到牠、聽不到你說話；牠死了你就回到觀戰',
  'fix9k.guide.s.slugUsed': '這局附身蛞蝓仔的機會已經用掉了（每人一次）',
  'fix9k.guide.r.dead.slug': '你正附身著一隻蛞蝓仔：右鍵移動或跟著別人走，活人看得到牠、聽不到你說話；牠死了就回到觀戰（附身每人只有一次）。',

  // ───── 目標面板：所在站點耐久偏低或正在快速受損（太空層站點實體的 hp／mhp，所有人都看得到）─────
  'fix9k.guide.s.hull': '{st}耐久 {n}%：快到救生艙或停機坪離開',
  'fix9k.guide.s.hullFall': '{st}正在受損，耐久 {n}%：先往救生艙或停機坪移動',

  // ───── 目標面板：仿生人 EP 滿了但不在裁決者號 ─────
  'fix9k.guide.s.androidGo': 'EP 滿了：到救生艙裝置搭救生艙（或開船）去裁決者號，站上鑄造台旁的平台按 {key_evolve}',

  // ───── 目標面板：這局已經結算（標題用 room6.after.title「這局已結束」）；{res}／{again}／{lobby} 是上方小列按鈕的名稱 ─────
  'fix9k.guide.s.endOnly': '按上方小列的「{res}」看所有人的身分與時間軸',
  'fix9k.guide.s.endPractice': '按上方小列的「{res}」看所有人的身分；「{again}」用同樣的設定馬上重開',
  'fix9k.guide.s.endHost': '按上方小列的「{res}」看所有人的身分；「{lobby}」帶大家回到大廳再開一局',
  'fix9k.guide.s.endGuest': '按上方小列的「{res}」看所有人的身分；主機回到大廳時你會一起回去',

  // ───── 情境提示：依身分給（第 9 輪休閒玩家審查）─────
  // 醫護兵的治療術只治人員（classAbilities.ts cls.mend 的 filter tag personnel）：異形形態、進化後的變種人、仿生人機體治不了
  'guide.h.lowHpSolo.t': '生命偏低',
  'guide.h.lowHpSolo': '先撤退！背包裡的急救包可以回血；醫護兵治不了你現在的樣子。',
  'guide.h.lowHpSoloNoKit.t': '生命偏低',
  'guide.h.lowHpSoloNoKit': '先撤退！醫護兵治不了你現在的樣子：先躲到沒人的地方，別硬拚。',
  // 仿生人：樣本裡有自己的血，報告會變成「錯誤」（guide.r.android.3）
  'guide.h.samplerAndroid.t': '基因檢測器',
  'guide.h.samplerAndroid': '按 {k} 再點一個人，花 3 秒抽血。別抽自己：樣本裡有你的血，報告會變成「錯誤」。每人只能抽一次，湊滿 3 人份就能送驗。',
  // 異類（人形時血會被驗出來）
  'guide.h.samplerHidden.t': '基因檢測器',
  'guide.h.samplerHidden': '按 {k} 再點一個人，花 3 秒抽血。別抽自己：你的血會讓報告驗出異類。每人只能抽一次，湊滿 3 人份就能送驗。',
}

export const FIX9K_EN: Record<string, string> = {
  'fix9k.key.unset': 'unbound',
  'fix9k.keys.arrows': 'Arrow keys',
  'fix9k.key.slot': 'inventory slot {n}',

  'fix9k.guide.s.cabinLaunch': 'Stand on the cabin console to launch in 10 s; to get off, walk to the hatch at the far left of the cabin',
  'fix9k.guide.s.cabinLaunching': 'Launch in {s} s: whoever stands on the console flies the craft (stepping off before the last 3 s cancels it)',
  'fix9k.guide.s.cabinFlying': 'The craft is in space: stand on the console to fly it; Dock at a station before you can get off',
  'fix9k.guide.s.cabinUnknown': 'Stand on the console: docked, it launches in 10 s; in space, you take the helm at once',

  'fix9k.guide.s.slugMove': 'You possess a slugling: right-click to move, right-click someone to follow them; {key_stop} stops',
  'fix9k.guide.s.slugLife': 'The living can see it but cannot hear you; if it dies you go back to spectating',
  'fix9k.guide.s.slugUsed': 'You have used your slugling possession for this game (once each)',
  'fix9k.guide.r.dead.slug': 'You are possessing a slugling: right-click to move or follow someone. The living can see it but cannot hear you; if it dies you go back to spectating (one possession each).',

  'fix9k.guide.s.hull': '{st} hull at {n}%: get to an escape pod or a docked craft and leave',
  'fix9k.guide.s.hullFall': '{st} is taking damage, hull at {n}%: head for an escape pod or a docked craft',

  'fix9k.guide.s.androidGo': 'EP full: take an escape pod (or a craft) to the Adjudicatrix, then stand on the fabrication pad and press {key_evolve}',

  'fix9k.guide.s.endOnly': 'Use “{res}” in the bar at the top to see everyone’s role and the timeline',
  'fix9k.guide.s.endPractice': 'Use “{res}” in the bar at the top to see everyone’s role; “{again}” restarts with the same setup',
  'fix9k.guide.s.endHost': 'Use “{res}” in the bar at the top to see everyone’s role; “{lobby}” takes everyone back for another game',
  'fix9k.guide.s.endGuest': 'Use “{res}” in the bar at the top to see everyone’s role; you will follow the host back to the lobby',

  'guide.h.lowHpSolo.t': 'Health low',
  'guide.h.lowHpSolo': 'Fall back! A trauma kit from your pack heals you; medics cannot patch up what you are now.',
  'guide.h.lowHpSoloNoKit.t': 'Health low',
  'guide.h.lowHpSoloNoKit': 'Fall back! Medics cannot patch up what you are now: lie low somewhere empty and stop pushing.',
  'guide.h.samplerAndroid.t': 'Gene sampler',
  'guide.h.samplerAndroid': 'Press {k}, then click someone to draw blood (3 s). Not yourself: your blood in the sample turns the report into ERROR. Three different people fill it.',
  'guide.h.samplerHidden.t': 'Gene sampler',
  'guide.h.samplerHidden': 'Press {k}, then click someone to draw blood (3 s). Not yourself: your blood would make the report come back infected. Three different people fill it.',
}

addStrings(FIX9K_ZH, FIX9K_EN)
