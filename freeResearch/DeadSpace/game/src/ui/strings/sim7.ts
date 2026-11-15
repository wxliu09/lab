// 介面文字（第 4 輪：老手／多人公平視角審查，sim 端的社交與連線）。sim 端以 `@key|k=v` 送出；
// 用 addStrings 在載入時註冊，App.tsx 有 `import './strings/sim7'`（在 sim6 之後，可以覆寫同名 key）。
// - 寬限期間的斷線／重新連線公告不點名（sys.droppedAnon／sys.rejoinedAnon）；超過寬限才回來的私訊說明（sys.leftYou*）
// - 開局早退補位（replace.*：全場公告不點名；replace.you.* 只給補位者；tl.replace.* 是結算時間軸）
// - 聊天：重複訊息被壓掉的提示、-list <群組>、-rename 擋混用文字系統；-help 覆寫（events.ts 的舊版只說「異類限定：-list」）
import { addStrings } from '../i18n'

export const SIM7_ZH: Record<string, string> = {
  // 斷線（寬限期間不點名：匿名形態斷線時身體會停在原地，點名就能把形態對回真人）
  'sys.droppedAnon': '有一名玩家斷線了（{s} 秒內可以重新連線）',
  'sys.rejoinedAnon': '斷線的玩家重新連上了',
  'sys.leftYou': '你斷線超過 {s} 秒，已經判定離開遊戲：你的角色已死亡，現在是觀戰。',
  'sys.leftYouBooted': '你斷線超過 {s} 秒，已經判定離開遊戲：你的角色已死亡；本局是「死亡即退出」，不能觀戰。',
  // 開局早退補位（全場公告：不說是誰）
  'replace.xeno': '異形在開局不久就離開了，已經從船員之中另外選出一位接任異形。',
  'replace.mutant': '變種人在開局不久就離開了，已經從船員之中另外選出一位接任變種人。',
  'replace.android': '仿生人在開局不久就離開了，已經從船員之中另外選出一位接任仿生人。',
  'replace.none.xeno': '異形在開局不久就離開了，但已經沒有人可以接任。',
  'replace.none.mutant': '變種人在開局不久就離開了，但已經沒有人可以接任。',
  'replace.none.android': '仿生人在開局不久就離開了，但已經沒有人可以接任。',
  // 補位者本人（只有他收到）
  'replace.you.xeno': '原本的異形離開了，你被選中接任：你現在是異形。消滅所有敵人；按 Q 可以變成異形形態。沒有人知道是你接任的。',
  'replace.you.mutant': '原本的變種人離開了，你被選中接任：你現在是變種人。消滅所有敵人；按 Q 可以吞食屍體。沒有人知道是你接任的。',
  'replace.you.android': '原本的仿生人離開了，你被選中接任：你現在是仿生人。保護船員、找出異類。沒有人知道是你接任的。',
  // 結算時間軸
  'tl.replace.xeno': '{name} 接任異形（原本的異形開局不久就離開了）',
  'tl.replace.mutant': '{name} 接任變種人（原本的變種人開局不久就離開了）',
  'tl.replace.android': '{name} 接任仿生人（原本的仿生人開局不久就離開了）',
  // 聊天
  'chat.dupe': '同一句話 {s} 秒內不要重複送出（這一則沒有送出）',
  'chat.listUsage': '用法：-list 群組名稱（列出你所在群組的成員）',
  'chat.groupMembers': '群組 {group} 的成員：{lz}',
  'chat.nameMixed': '名字不能混用容易看錯的不同文字（例如拉丁字母夾著西里爾或希臘字母）。',
  'chat.help':
    '聊天指令：-names 列出玩家（附大廳原名）｜-status 異類主腦是否存活｜-rename 新名字（開局 3 分鐘內）｜-creategroup 名稱、-add 群組 玩家、-remove 群組 玩家、-list 群組（列出成員，限成員）、;群組 訊息｜-vote death 發起死亡模式投票｜-votekick 玩家（死者）｜-slug 死後附身蛞蝓仔｜異類限定：-listaliens／-listmutants 列出同伴、-allow／-disallow、-liquidate 玩家',
}

export const SIM7_EN: Record<string, string> = {
  'sys.droppedAnon': 'A player disconnected (they have {s} s to reconnect)',
  'sys.rejoinedAnon': 'The disconnected player reconnected',
  'sys.leftYou': 'You were disconnected for more than {s} s and have been counted as having left: your character is dead and you are now spectating.',
  'sys.leftYouBooted': 'You were disconnected for more than {s} s and have been counted as having left: your character is dead, and this game uses Boot on Death, so you cannot spectate.',
  'replace.xeno': 'The xeno left early in the game. Someone else from the crew has been chosen to take over as the xeno.',
  'replace.mutant': 'The mutant left early in the game. Someone else from the crew has been chosen to take over as the mutant.',
  'replace.android': 'The android left early in the game. Someone else from the crew has been chosen to take over as the android.',
  'replace.none.xeno': 'The xeno left early in the game, but no one is left to take over.',
  'replace.none.mutant': 'The mutant left early in the game, but no one is left to take over.',
  'replace.none.android': 'The android left early in the game, but no one is left to take over.',
  'replace.you.xeno': 'The original xeno left and you were chosen to take over: you are now the xeno. Destroy all enemies; press Q to take xeno form. No one knows it was you.',
  'replace.you.mutant': 'The original mutant left and you were chosen to take over: you are now the mutant. Destroy all enemies; press Q to devour corpses. No one knows it was you.',
  'replace.you.android': 'The original android left and you were chosen to take over: you are now the android. Protect the crew and find the hidden factions. No one knows it was you.',
  'tl.replace.xeno': '{name} took over as the xeno (the original xeno left early)',
  'tl.replace.mutant': '{name} took over as the mutant (the original mutant left early)',
  'tl.replace.android': '{name} took over as the android (the original android left early)',
  'chat.dupe': 'Please do not repeat the same line within {s} s (this one was not sent)',
  'chat.listUsage': 'Usage: -list group (lists the members of a group you are in)',
  'chat.groupMembers': 'Members of group {group}: {le}',
  'chat.nameMixed': 'Names cannot mix easily confused scripts (for example Latin letters mixed with Cyrillic or Greek ones).',
  'chat.help':
    'Chat commands: -names list players (with lobby names) | -status are the hidden masterminds alive | -rename new name (first 3 minutes) | -creategroup name, -add group player, -remove group player, -list group (members only), ;group message | -vote death start the death-mode vote | -votekick player (dead) | -slug possess a slugling after death | Hidden factions only: -listaliens / -listmutants list your allies, -allow / -disallow, -liquidate player',
}

addStrings(SIM7_ZH, SIM7_EN)
