import { addStrings } from '../i18n'

// ───── 第 8 輪（規則與節奏）：末日公告、無人機群圍攻撤離、抽血集合、GIT 錯誤報告 ─────

export const RULE8_ZH: Record<string, string> = {
  // 子艦隊（原作 LG：只剩翠原星可打時才打它）
  'rule8.fleet.planet': '子艦隊轉向砲擊翠原星：太空中已經沒有別的目標了。地表會不斷落下隕石、殘留輻射越積越高，躲開紅色警戒圈；發射船艇或逃生艙可以把艦隊引開。',
  // 軌道穩定器失效：翠原星被拉向恆星
  'rule8.orbit.burnSoon': '翠原星再 {s} 秒就會被拉進恆星的灼燒範圍：行星本身燒不壞，但灼燒會讓地表開始落下隕石，到時躲開紅色警戒圈與落點的輻射區。',
  'rule8.orbit.burnNow': '翠原星進入了恆星的灼燒範圍：地表開始落下隕石，殘留輻射會越積越高，躲開紅色警戒圈。',
  // 無人機群圍攻
  'rule8.siege.evac': '{nz}被無人機群圍攻，站體剩不到一半：站上的人先撤離（逃生艙、停泊的船）！',
  // 抽血集合（對地面使用基因檢測器）
  'rule8.git.rally': '{name} 在{sz}・{rz}抽血，{s} 秒內過去就能一起驗（三人一份樣本）。',
  'rule8.git.rallyHall': '{name} 在{sz}抽血，{s} 秒內過去就能一起驗（三人一份樣本）。',
  'rule8.git.rallyCd': '剛找過人來抽血，{s} 秒後才能再發一次。',
  'rule8.git.rallySpace': '在太空中沒辦法找人來抽血：先回到站上或船艙裡。',
  'rule8.git.rallyAnon': '現在這副樣子沒辦法找人來抽血。',
  // GIT 報告：錯誤（原作規則：仿生人讓結果變成錯誤）
  'rule8.git.report.error': '這份樣本驗出的 DNA：{lz}。判讀錯誤：樣本三人之中有一名仿生人（仿生人沒有血可驗，所以也判讀不出有沒有人感染）。',
}

export const RULE8_EN: Record<string, string> = {
  'rule8.fleet.planet': 'The sub-fleet has turned its guns on Verdance: nothing else is left to hit in space. Debris will keep falling on the surface and the fallout will keep building, so stay out of red warning circles. Launching a craft or an escape pod will draw the fleet away.',
  'rule8.orbit.burnSoon': 'Verdance will be dragged into the star’s burn range in {s} s. The planet itself won’t burn, but the heat will start bringing debris down on the surface. Stay out of red warning circles and fallout zones.',
  'rule8.orbit.burnNow': 'Verdance is inside the star’s burn range: debris is falling on the surface and the fallout will keep building. Stay out of red warning circles.',
  'rule8.siege.evac': '{ne} is under drone-swarm attack and below half integrity. Everyone aboard, evacuate now (escape pod or a docked craft)!',
  'rule8.git.rally': '{name} is drawing blood in {re} on {se}. Get there within {s} s to be tested together (three people per sample).',
  'rule8.git.rallyHall': '{name} is drawing blood on {se}. Get there within {s} s to be tested together (three people per sample).',
  'rule8.git.rallyCd': 'You just called for a blood draw. You can call again in {s} s.',
  'rule8.git.rallySpace': 'You can’t call people for a blood draw out in space. Get back aboard a station or craft first.',
  'rule8.git.rallyAnon': 'You can’t call anyone for a blood draw looking like this.',
  'rule8.git.report.error': 'DNA found in this sample: {le}. Analysis error: one of the three people in this sample is the android (an android has no blood to test, so whether anyone is infected can’t be read either).',
}

addStrings(RULE8_ZH, RULE8_EN)
