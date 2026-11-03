// 介面文字（第 1 輪「新手體驗與玩法」修正）：AI 公布驗血結果、進化選單的原因、感染提示、博士專長
// 參數：names = 驗血名單（抽血時看到的名字，以「、」連接）；name = 單一名字；n = 數字；desc = 效果說明
export const PLAY1_ZH: Record<string, string> = {
  // ───── AI 在全體頻道公布驗血結果（sim 以 `@key|k=v` 送出）─────
  'play1.bot.gitClean': '驗血結果：{names} 都是乾淨的。',
  'play1.bot.gitInfected': '驗血結果有感染！{names} 裡面藏著異類，大家小心。',
  'play1.bot.accuse': '我認為 {name} 就是異類，看到就開火！',

  // ───── 進化選單：為什麼現在不能進化 ─────
  'play1.evo.dead': '你已經死了，不能進化。',
  'play1.evo.notMain': '正在駕駛載具、附身或搭乘救生艙：先回到自己的身體才能進化。',
  'play1.evo.space': '在太空中不能進化：回到站內再進化。',
  'play1.evo.forge': 'EP 已經夠了：站上裁決者號鑄造台旁的鑄造平台，就能換新機體。',
  'play1.evo.max': '你已經是最終形態了。',
  'play1.evo.need': 'EP 還不夠：還差 {n}。',

  // ───── 情境提示：被感染 ─────
  'guide.h.parasited.t': '你被寄生了',
  'guide.h.parasited': '異形的寄生體正在你體內：每秒中毒，死時會變成異形的 spawn。快用抗體包（醫療補給有賣）把它壓成休眠，46 秒後就會清除；在那之前別死。',
  'guide.h.prioned.t': '你感染了朊毒',
  'guide.h.prioned': '變種人的朊毒正在你體內：每秒中毒，死時會變成變種人的工蟲。快用抗體包（醫療補給有賣）把它壓成休眠，46 秒後就會清除；在那之前別死。',

  // ───── 博士專長（研究員）─────
  'play1.phd': '{name}（{desc}）',
  'play1.reveal.phd': '博士專長：{name}——{desc}',
  'play1.help.phd': '你的博士專長是{name}：{desc}',
}

export const PLAY1_EN: Record<string, string> = {
  // ───── Bots announce blood-test results in all chat ─────
  'play1.bot.gitClean': 'Blood test: {names} came back clean.',
  'play1.bot.gitInfected': 'Blood test came back INFECTED! Something is hiding among {names}. Watch out.',
  'play1.bot.accuse': 'I think {name} is one of them. Shoot on sight!',

  // ───── Evolve menu: why you cannot evolve right now ─────
  'play1.evo.dead': 'You are dead and cannot evolve.',
  'play1.evo.notMain': 'You are piloting, possessing, or riding an escape pod. Return to your own body to evolve.',
  'play1.evo.space': 'You cannot evolve in space. Get back inside a station first.',
  'play1.evo.forge': 'You have enough EP. Step onto the foundry pad beside the Adjudicatrix foundry to take a new chassis.',
  'play1.evo.max': 'You are already in your final form.',
  'play1.evo.need': 'Not enough EP yet: {n} to go.',

  // ───── Hints: infected ─────
  'guide.h.parasited.t': 'You have been implanted',
  'guide.h.parasited': 'A xeno parasite is inside you: it poisons you every second, and when you die you rise as a xeno spawn. Inject an antibody kit (Medical Supplies) to force it dormant; it clears after 46 s. Do not die before then.',
  'guide.h.prioned.t': 'You are infected with prions',
  'guide.h.prioned': 'Mutant prions are inside you: they poison you every second, and when you die you become a mutant drone. Inject an antibody kit (Medical Supplies) to force them dormant; they clear after 46 s. Do not die before then.',

  // ───── Researcher PhD ─────
  'play1.phd': '{name} ({desc})',
  'play1.reveal.phd': 'PhD: {name} — {desc}',
  'play1.help.phd': 'Your doctorate is {name}: {desc}',
}
