// 介面文字（第三批：結算時間軸、連線逾時、分隔符號、單複數、出局、施法時間）
// 時間軸：sim 的 g.log 以 `@key|k=v` 傳來（見 sim/game.ts 的 fmtKey）。
// 參數 name = 玩家名稱；unit = 單位 id（sysText 換成目前語言的名稱）；nz／ne = 站點或船的中文／英文名稱
export const UX3_ZH: Record<string, string> = {
  // ───── 分隔符號（英文用逗號、冒號加空白）─────
  'sep.list': '、',
  'sep.colon': '：',
  'sep.wide': '　',
  'sep.paren': '（{s}）',
  'net.waitLoad': '等待其他玩家載入（還有 {n} 人）…',

  // ───── 結算時間軸 ─────
  'tl.death.mutant': '{name}（變種人）死亡',
  'tl.death.xeno': '{name}（異形）死亡',
  'tl.death.xenoSpawn': '{name}（異形 spawn）死亡',
  'tl.death.mutantSpawn': '{name}（變種人 spawn）死亡',
  'tl.death.android': '{name}（仿生人）損毀',
  'tl.death.crew': '{name} 遇害',
  'tl.convert.xeno': '{name} 被轉化為異形 spawn',
  'tl.convert.mutant': '{name} 被轉化為變種人 spawn',
  'tl.evolve': '{name} 進化為{unit}',
  'tl.promotion': '{name} 獲得晉升',
  'tl.wormhole': '蟲洞物體出現',
  'tl.pirate': '海盜船出現',
  'tl.apoc.fleet': '末日：艦隊清場',
  'tl.apoc.orbit': '末日：軌道穩定器失效',
  'tl.blackhole': '黑洞裝置啟動',
  'tl.destroyed': '{nz} 被摧毀',
  'tl.cannon': '天守主砲向 {nz} 開火',
  'tl.bravadoLand': '豪勇號降落在翠原星',
  'tl.bravadoLaunch': '豪勇號從翠原星升空',
  'end.timelineEmpty': '這局沒有記錄到重大事件。',

  // ───── 加入房間：逾時、取消 ─────
  'menu.cancelJoin': '取消',
  'menu.joinTimeout': '{s} 秒內沒有找到主機：確認房號，或請主機確認分頁仍開著。',
  'menu.codeLabel': '房號（5 碼）',

  // ───── 出局（死亡即退出）─────
  'death.youBooted': '你死了。這局是「死亡即退出」模式：你已出局，不能觀戰，結果會在對局結束時公布。',
  'guide3.goal.booted': '你已出局，等待結算',
  'guide3.s.booted': '這局死亡即退出：不能觀戰、收不到玩家聊天',
  'guide3.s.bootedLeave': '可以直接回主選單；結算時會公布所有人的身分',
  'guide3.r.booted.1': '這局是「死亡即退出」模式：死後不能觀戰，也收不到玩家之間的聊天。',
  'guide3.r.booted.2': '系統公告仍會出現在聊天紀錄；結算畫面會公布所有人的身分與時間軸。',

  // ───── 說明面板 ─────
  'guide3.help.moreLine': 'F1 圖鑑：完整規則與資料 · 聊天輸入 -help：所有指令 · 滑鼠停在技能、道具上：詳細說明',
  'guide3.help.scroll': '往下捲動還有內容',
  'guide3.map.selfRing': '你（白框）',
  'guide3.map.playersDot': '其他玩家（玩家色）',
  'guide3.map.hostileDiamond': '敵對單位（菱形）',
  'guide3.map.otherDot': '其他單位、物品',

  // ───── 技能說明：施法時間 ─────
  'tip3.castTime': '施法時間',
  'tip3.channel': '引導時間',
  'tip3.target.cast': '施法 {s} 秒後生效（期間被打斷就取消）',
  'tip3.target.channel': '持續引導 {s} 秒',

  // ───── 進化選單（人類按 V）─────
  'evo3.close': '關閉',

  // ───── 觀戰 ─────
  'spec3.nth': '{name} #{n}',
  'spec3.portraitDead': '觀戰中',
  'spec3.portraitHint': '左鍵點選單位，可以在這裡查看它的狀態',

  // ───── 離開頁面確認 ─────
  'leave3.confirm': '離開或重新整理頁面會中斷對局。確定要離開嗎？',

  // ───── 上方大公告的標題句（Announce.tsx：有 key.title 就只顯示標題，對策等完整內容留在聊天紀錄）─────
  'event.wasps.title': '無人戰機群入侵：太空中的站點與船艇會遭圍攻',
  'event.asteroids.title': '小行星群從南側飄入：撞上站點或船艇會重創',
  'event.tenshu.title': '天守收容失效：{s} 秒內主砲要對翠原星放電',
  'event.pirate.title': '黑鷗旗護盾船入侵：登艦癱瘓它的主控台',
  'event.enhancer.title': '女帝號投放了性能強化劑（限人員本人領取）',
  'event.wormhole.title': '星區邊緣出現蟲洞：預估 {m}:{s} 後閉合',
  'event.promotion.title': '總部來電：{name} 獲得晉升',
  'apoc.fleet.title': '協和安全理事會子艦隊接近：{s} 秒後抵達',
  'apoc.orbit.title': '軌道穩定系統全面失效：立刻到翠原星地表避難',
  'event.doors.title': '門控制器故障：門會毫無預警地猛然關上',
  'event.woolly.title': '一艘毛茸茸的船出現在星區裡',
  'event.breeding.title': '翠原星進入繁殖季：蛞蝓仔長成了雪團獸',
  'event.ad.title': '【廣告】極光牌保暖帽，真空中也風度翩翩！',
  // 公告的「詳見聊天」小字
  'f7.announce.more': '詳見聊天',
  // 出局者的頭像欄
  'f7.portraitBooted': '已出局',
}

export const UX3_EN: Record<string, string> = {
  // ───── Separators ─────
  'sep.list': ', ',
  'sep.colon': ': ',
  'sep.wide': ' · ',
  'sep.paren': ' ({s})',
  'net.waitLoad': 'Waiting for other players to load ({n} left)…',

  // ───── Results timeline ─────
  'tl.death.mutant': '{name} (Mutant) died',
  'tl.death.xeno': '{name} (Xeno) died',
  'tl.death.xenoSpawn': '{name} (Xeno spawn) died',
  'tl.death.mutantSpawn': '{name} (Mutant spawn) died',
  'tl.death.android': '{name} (Android) was wrecked',
  'tl.death.crew': '{name} was killed',
  'tl.convert.xeno': '{name} was turned into a xeno spawn',
  'tl.convert.mutant': '{name} was turned into a mutant spawn',
  'tl.evolve': '{name} evolved into {unit}',
  'tl.promotion': '{name} was promoted',
  'tl.wormhole': 'A wormhole object appeared',
  'tl.pirate': 'A pirate ship appeared',
  'tl.apoc.fleet': 'Apocalypse: the fleet arrives to sterilise the sector',
  'tl.apoc.orbit': 'Apocalypse: the orbital stabilisers failed',
  'tl.blackhole': 'The black hole device activated',
  'tl.destroyed': '{ne} was destroyed',
  'tl.cannon': 'The Tenshu main gun fired at {ne}',
  'tl.bravadoLand': 'The Bravado landed on Verdance',
  'tl.bravadoLaunch': 'The Bravado lifted off from Verdance',
  'end.timelineEmpty': 'No major events were recorded this game.',

  // ───── Joining a room: timeout, cancel ─────
  'menu.cancelJoin': 'Cancel',
  'menu.joinTimeout': 'No host found within {s} s: check the code, or ask the host to keep the tab open.',
  'menu.codeLabel': 'Room code (5 characters)',

  // ───── Booted (Boot on Death) ─────
  'death.youBooted': 'You died. This game uses Boot on Death: you are out and cannot spectate. Results are announced when the game ends.',
  'guide3.goal.booted': 'You are out; waiting for the results',
  'guide3.s.booted': 'Boot on Death: no spectating, no player chat',
  'guide3.s.bootedLeave': 'You can return to the menu; the results reveal every role',
  'guide3.r.booted.1': 'This game uses Boot on Death: the dead cannot spectate or receive player chat.',
  'guide3.r.booted.2': 'System announcements still appear in the chat log; the results screen reveals every role and a timeline.',

  // ───── Help panel ─────
  'guide3.help.moreLine': 'F1 codex: full rules and data · Type -help in chat: every command · Hover skills and items: details',
  'guide3.help.scroll': 'Scroll down for more',
  'guide3.map.selfRing': 'You (white ring)',
  'guide3.map.playersDot': 'Other players (their color)',
  'guide3.map.hostileDiamond': 'Hostiles (diamond)',
  'guide3.map.otherDot': 'Other units, items',

  // ───── Ability tooltip: cast time ─────
  'tip3.castTime': 'Cast time',
  'tip3.channel': 'Channel',
  'tip3.target.cast': 'Takes effect after a {s} s cast (cancelled if interrupted)',
  'tip3.target.channel': 'Channelled for {s} s',

  // ───── Evolution menu (human pressing V) ─────
  'evo3.close': 'Close',

  // ───── Spectating ─────
  'spec3.nth': '{name} #{n}',
  'spec3.portraitDead': 'Spectating',
  'spec3.portraitHint': 'Left-click a unit to see its status here',

  // ───── Leave-page confirmation ─────
  'leave3.confirm': 'Leaving or reloading the page will drop you from the game. Leave anyway?',

  // ───── Headline for the big top announcement (full text stays in the chat log) ─────
  'event.wasps.title': 'Drone swarm inbound: stations and craft besieged',
  'event.asteroids.title': 'Asteroids drifting in from the south',
  'event.tenshu.title': 'Tenshu containment failed: fire at Verdance in {s} s',
  'event.pirate.title': 'Black Gull pirates inbound: disable their console',
  'event.enhancer.title': 'Performance enhancers dropped on the Empress Nyx',
  'event.wormhole.title': 'Wormhole at the sector edge: closes in {m}:{s}',
  'event.promotion.title': 'Headquarters: {name} has been promoted',
  'apoc.fleet.title': 'Directorate sub-fleet inbound: ETA {s} s',
  'apoc.orbit.title': 'Orbital stabilizers failed: get to Verdance now',
  'event.doors.title': 'Door controllers failing: doors may slam shut',
  'event.woolly.title': 'A very fluffy ship has appeared in the sector',
  'event.breeding.title': 'Verdance breeding season: beware the snowgles',
  'event.ad.title': '[AD] Aurora beanies: look sharp, even in vacuum!',
  'f7.announce.more': 'details in chat',
  'f7.portraitBooted': 'You are out',

  // ───── Singular forms (t() uses key.one when n = 1) ─────
  'lobby2.roles.count.one': '1 combatant at start (incl. AI)',
  'vote.kickLeft.one': '1 more vote needed',
  'space.scanResult.one': '1 lifeform detected aboard {ne}',
  'mut.totalInfection.one': 'Total infection: 1 crew member has been seeded with prions.',
  'fac.caged.one': 'Caged 1 specimen.',
  'st.cordonOk.one': 'Beacon hit {ne}: 1 door locked.',
  'mut.intestines.one': 'Inner sight: you have 1 hive heart with {hp} total health.',
}
