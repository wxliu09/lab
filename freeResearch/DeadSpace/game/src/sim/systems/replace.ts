// 開局早退補位（原作 war3map.j j6 17042–17083、抽人 H6 17034–17041、資格 uf 3485–3491）。
//
// 原作：玩家離開時（TriggerRegisterPlayerEventLeave）若遊戲時間 ≤ 90 秒、而且他是外星人（Bv）、突變體（cv）或機器人（Cv），
// 就從「不是 uf() 的玩家」（不是外星／突變陣營、也不是機器人）隨機抽一位，把那個身分變數改指向他：
// - 補位者留在原本的身體裡，只是身分換了（沒有換單位）；外星人另外和 Player14（外星生物）結盟（17067）
//   （本作的敵對生物對所有人一樣，combat.ts isHostile，沒有對應的設定）。
// - 原作 17044 算了離開者是否已死（b），但沒有用到：已經被殺死的外星人離開也會補位。本作只補「還活著」的。
// - EP 是全域變數（外星人 Kx 等），補位者直接接手離開者累積的 EP。
// - 補位者收到私訊「You are now the …」；全場公告「Reassigning a new …」（不點名），抽不到人時公告「Not enough players…」。
// - 原作缺陷：新外星人沒有 A02O（變身）、新突變體沒有 A05M（吞食），要換一次衣服才拿到；H6 不檢查存活與在線。
//
// 本作：
// - 「離開的時刻」是斷線的當下（game.playerDropped 記下遊戲時間），不是 90 秒寬限結束的時候；寬限內回來就清掉、不補位。
// - 正式判定離開（game.playerLeft）時才補：離開時刻 ≤ 90 秒，而且他到那時仍是活著的主腦／仿生人（寬限期間身體被打死就不補）。
// - 候選：活著、在線、人類陣營、不是仿生人的參戰者。占玩家席位的 AI 也算（見 replaceCandidates 的說明）。
// - 補位者照修正後的規則拿到變身／吞食技能；補位只私訊本人。全場公告照原作不點名，只說「已另外選人接任」：
//   離開者的死亡公告（異形被消滅了！）本來就會說出他的身分，若不說有人接任，`-status` 和勝負就會和公告矛盾。
import { CLASSES } from '../../shared/content/registry'
import { fmtKey, type Game, type GamePlayer } from '../game'
import { slotOrder } from './items'

/** 開局多少秒內離開才補位（原作 TimerGetElapsed(Go) <= 90.）*/
export const REPLACE_WINDOW_S = 90

type Seat = 'xeno' | 'mutant' | 'android'

/** 斷線（或主動離開）的當下：記下遊戲時間。已經記過就不覆蓋（同一次離線只算第一次）*/
export function noteDeparture(g: Game, p: GamePlayer): void {
  if (p.data.departAt === undefined) p.data.departAt = g.time
}

/** 寬限內回來：這次斷線不算離開 */
export function clearDeparture(p: GamePlayer): void {
  p.data.departAt = undefined
}

/**
 * 這位離開者佔著哪個需要補位的身分（null = 不補）。要在殺死主單位之前判斷。
 * 外星人：主腦（不是 spawn、沒有因朊毒失去主腦身分，原作 Z6 17169 會把 Bv 設成 null）；突變體：主腦；
 * 仿生人：原作 Cv 不看是否被遙控器改寫成異類 spawn，這裡一樣只看身分。
 */
export function earlySeat(g: Game, p: GamePlayer): Seat | null {
  const at = (p.data.departAt as number | undefined) ?? g.time
  if (at > REPLACE_WINDOW_S || g.ended || p.spectator || p.bot) return null
  const u = g.mainOf(p)
  if (!p.alive || !u || !u.alive) return null
  if (p.role === 'xeno' && !p.spawnOf && !p.data.lostMaster) return 'xeno'
  if (p.role === 'mutant' && !p.spawnOf) return 'mutant'
  if (p.role === 'android') return 'android'
  return null
}

/**
 * 補位候選人：活著、在線、人類陣營（不是任何異類的 spawn）、不是仿生人的參戰者。
 * 占玩家席位的 AI 也算：原作 H6 從所有玩家（bj_FORCE_ALL_PLAYERS）裡抽，只排除 uf() 的人；本作開局分配身分時 AI 席位
 * 本來就和真人一起抽（roles.ts assignRoles），補位沿用同一個候選範圍，機率分布和開局相同。
 * 若只從真人抽，候選變少，沒被抽中的真人就更容易推出是誰補上（例如只剩兩名真人時，另一位一定就是新的異類）。
 */
export function replaceCandidates(g: Game, leaver: GamePlayer): GamePlayer[] {
  return g.allPlayers().filter((q) => {
    if (q === leaver || q.spectator || q.left || !q.alive || !(q.bot || q.connected)) return false
    if (g.faction(q) !== 'crew' || q.role === 'android') return false
    const u = g.mainOf(q)
    return !!u && u.alive && !u.data.petrified
  })
}

/** 身分技能（變身、吞食）：記在 extraAbilities（之後換衣服、變身回人形都會重建），人形的話立刻加進技能列 */
function grantAbility(g: Game, q: GamePlayer, id: string): void {
  const u = g.mainOf(q)
  if (!u) return
  const extra = (u.data.extraAbilities as string[] | undefined) ?? []
  if (!extra.includes(id)) u.data.extraAbilities = [...extra, id]
  if (u.tags.has('personnel') && !u.abilities.includes(id)) u.abilities = slotOrder([...u.abilities, id])
}

function tlName(q: GamePlayer): string {
  return (CLASSES.get(q.classId)?.prefix.en ?? '') + q.baseName
}

/**
 * 正式判定離開之後補位（呼叫端先用 earlySeat 判斷、再殺死離開者的主單位、最後呼叫這裡）。
 * 離開者的身分改成人類，原本的身分記在 data.leftRole（只給結算畫面用）：遊戲裡到處用「role === 'xeno' 且不是 spawn」
 * 找主腦（變身、spawn 的形態、勝負判定），兩個主腦並存會找錯人。
 */
export function replaceSeat(g: Game, leaver: GamePlayer, seat: Seat): GamePlayer | null {
  const cands = replaceCandidates(g, leaver)
  leaver.data.leftRole = leaver.role
  g.setRole(leaver, 'human')
  if (!cands.length) {
    g.systemAll(seat === 'xeno' ? 'replace.none.xeno' : seat === 'mutant' ? 'replace.none.mutant' : 'replace.none.android')
    return null
  }
  // 身分相關的抽選一律用祕密亂數流（和開局分配身分相同）
  const q = g.secret.pick(cands)
  g.setRole(q, seat)
  // EP 照原作是這個身分的（全域變數）：接手離開者累積的 EP，離開者歸零
  q.ep = leaver.ep
  leaver.ep = 0
  q.tier = 0
  q.form = ''
  if (seat === 'xeno') grantAbility(g, q, 'xeno.form')
  else if (seat === 'mutant') grantAbility(g, q, 'mut.devour')
  // -status 只依公告過的死亡回答：離開者的死亡已經公告了，接著公告有人接任，-status 也跟著回到「還活著」
  if (seat === 'xeno') g.data.xenoDeathAnnounced = false
  if (seat === 'mutant') g.data.mutantDeathAnnounced = false
  g.systemAll(seat === 'xeno' ? 'replace.xeno' : seat === 'mutant' ? 'replace.mutant' : 'replace.android')
  // 補位者本人：私訊說明（只有他知道）
  g.privateLine(q.slot, seat === 'xeno' ? 'replace.you.xeno' : seat === 'mutant' ? 'replace.you.mutant' : 'replace.you.android')
  // 結算時間軸（對局中不會送出；結算本來就公開所有人的身分）
  g.log(fmtKey(seat === 'xeno' ? 'tl.replace.xeno' : seat === 'mutant' ? 'tl.replace.mutant' : 'tl.replace.android', { name: tlName(q) }))
  g.checkVictory()
  return q
}
