// 聊天路由（研究 02 §10.3）：在 sim 內依存活狀態、所在 zone、頻道決定誰收得到
import type { ChatChannel, ChatLine, HostMsg } from '../../shared/protocol/messages'
import { shownBase, shownName, type Game, type GamePlayer } from '../game'
import { PLAYER_COLORS } from '../../shared/constants'
import { sanitizeName } from '../../shared/protocol/validate'
import { listArgs } from '../../shared/sysArgs'
import { SPACE_HALF } from '../world'
import type { Ent, ItemInst } from '../ent'
import { carries } from './items'

/** 死後 4 秒內的發言仍讓活人看到（遺言）*/
export const LAST_WORDS = 4

function deliver(g: Game, line: ChatLine, to: GamePlayer[]): void {
  for (const q of to) q.chatOut.push(line)
}

/** 還在遺言時間內（死後 LAST_WORDS 秒，活人仍聽得到）*/
export function inLastWords(g: Game, p: GamePlayer): boolean {
  return !p.alive && !p.spectator && p.deadAt >= 0 && g.time - p.deadAt <= LAST_WORDS
}

/** 死後還有機會回來：仿生人的記憶核心還在、也沒有放棄復活 */
export function canStillRevive(p: GamePlayer): boolean {
  return p.role === 'android' && !!p.data.coreOnly && !p.stayDead && !p.left
}

/**
 * 死亡即退出：把這位死者標記為出局（遺言時間結束後、或投票開啟這個模式時）。
 * 還能靠記憶核心復活的仿生人不算出局；放棄復活（-shutdown）時再補標記。
 */
export function bootIfOut(g: Game, p: GamePlayer): void {
  if (!g.settings.bootOnDeath || p.alive || p.spectator || p.data.booted) return
  if (canStillRevive(p)) return
  p.data.booted = true
}

/** 死亡即退出模式下已出局：不再收到玩家之間的聊天（系統公告照收）*/
function isBooted(p: GamePlayer): boolean {
  return !p.alive && !!p.data.booted
}

/**
 * 聽得到死者頻道的人：死了、沒出局，而且不會再回到活人那邊。
 * 等記憶核心復活的仿生人視野刻意只剩核心附近；若讓他聽死者頻道（死者看得到全場），復活後就把全知情報帶回活人方。
 */
export function hearsDead(p: GamePlayer): boolean {
  return !p.alive && !isBooted(p) && !canStillRevive(p)
}

export function routeChat(g: Game, p: GamePlayer, ch: ChatChannel, text: string, groupName?: string): void {
  if (text.startsWith('-') && text.length > 1) {
    chatCommand(g, p, text.slice(1).trim())
    return
  }
  const t = g.time
  const lastWords = inLastWords(g, p)
  const speakingAlive = p.alive || lastWords
  // 群組頻道：活人（含遺言時間）才能用；死者打的群組訊息改走死者頻道（頻道由 server 決定，client 不必先改）
  if (ch === 'group' && speakingAlive) {
    groupChat(g, p, groupName ?? '', text)
    return
  }
  // 賽後：遊戲已經結束、沒有隱藏資訊要保護，所有人（含死者、出局者）都在同一個頻道
  if (g.ended) {
    deliver(g, { from: p.baseName, color: p.color, ch: 'all', text, time: g.time }, g.allPlayers())
    return
  }
  if (p.data.deadMuted && !p.alive) return
  // 死亡即退出：出局的人只剩遺言時間能說話，也收不到死者頻道
  if (!p.alive && p.data.booted && !lastWords) {
    g.privateLine(p.slot, 'chat.booted')
    return
  }
  const everyone = g.allPlayers()
  const dead = everyone.filter(hearsDead)
  const eavesdrop = everyone.filter((q) => q.flags.listen)
  const name = p.alive && p.mutedUntil > t ? '' : p.name
  const main = g.mainOf(p)
  if (!speakingAlive || ch === 'dead') {
    if (p.alive) return
    // 等記憶核心復活的仿生人（遺言時間過後）：說的話不進死者頻道，變成記憶核心位置的浮動文字（原作 aAv 20649–20672）
    if (!lastWords && canStillRevive(p)) {
      coreChat(g, p, text)
      return
    }
    const line: ChatLine = { from: p.baseName, color: p.color, ch: 'dead', text, time: t }
    deliver(g, line, uniq([...dead, ...eavesdrop]))
    return
  }
  if (ch === 'team') {
    const f = g.faction(p)
    if (f === 'crew') {
      g.privateLine(p.slot, 'chat.noTeam')
      return
    }
    const mates = everyone.filter((q) => q.alive && g.faction(q) === f)
    const line: ChatLine = { from: p.name, color: p.color, ch: 'team', text, time: t }
    deliver(g, line, uniq([...mates, ...eavesdrop]))
    return
  }
  // 全體：活人＋死者（出局的人除外）；可設定只限同站
  let to = everyone.filter((q) => !isBooted(q) || q.flags.listen)
  if (g.settings.localChat && main) {
    to = to.filter((q) => !q.alive || g.mainOf(q)?.zone === main.zone || q.slot === p.slot)
    to = uniq([...to, ...eavesdrop])
  }
  // 千面化身：聲音也跟著偽裝成目標
  const fake = main?.data.fake as { name: string; color: number } | undefined
  const shown = fake && name ? fake.name : name
  const color = fake && name ? fake.color : p.color
  const line: ChatLine = { from: shown, color: shown ? color : -1, ch: 'all', text, time: t }
  // 對話泡泡只掛在「看起來就是說話者」的單位上：匿名形態或被消音時不掛（否則等於公開身分；千面化身例外，泡泡掛在偽裝上），
  // 而且只給當下看得到那個單位的人
  // 系統 key 形式的發言（AI 公布驗血結果，`@key|k=v`）照樣掛泡泡：client 的泡泡與聊天紀錄都依語言解碼
  const bubble = !lastWords && main && (!main.anon || !!fake) && !!shown ? main.id : 0
  for (const q of to) q.chatOut.push(bubble && q.view.visible.has(bubble) ? { ...line, e: bubble } : line)
}

function uniq(a: GamePlayer[]): GamePlayer[] {
  return [...new Set(a)]
}

// ───────── 記憶核心的浮動文字（原作 aAv 20649–20672、RB 23738–23752）─────────

/**
 * 記憶核心此刻所在的實體：地上的核心本身，或帶著它的單位（背包或寄放處，同 vision.ts 的 findCore）。
 * 正在鑄造台重建（data.core = 0）或核心不見了：undefined
 */
export function coreHolder(g: Game, p: GamePlayer): Ent | undefined {
  const mine = (it: ItemInst | null | undefined): boolean => !!it && it.id === 'memoryCore' && (it.data as { android?: number } | undefined)?.android === p.slot
  const id = p.data.core as number | undefined
  if (!id) return undefined
  const onGround = g.world.get(id)
  if (onGround && mine(onGround.data.item as ItemInst | undefined)) return onGround
  for (const e of g.world.ents.values()) {
    if (carries(e, mine)) return e
    if (e.alive && mine(e.data.item as ItemInst | undefined)) return e
  }
  return undefined
}

/**
 * 等記憶核心復活的仿生人說話：原作把他的名字補滿空白（一般聊天等於沒人看得到）、也不轉給死者（k6／l6 排除 Cv），
 * 改在記憶卡的位置（被人撿走就是撿的人的位置）建一個 5 秒的浮動文字，只對「此刻看得到那個位置」的玩家顯示（IsLocationVisibleToPlayer）。
 * 本作：泡泡掛在核心（或帶著它的單位）上，只送給此刻看得到那個實體的人——活人、死者、仿生人自己都一樣依視野判斷
 * （死者看得到所觀戰的整個站；出局的人什麼都看不到）。帶著核心的單位隱形時，看不見它的人也收不到（不能讓浮動文字替隱形單位標出位置）。
 * 浮動文字只有內容、沒有名字與顏色（原作同）。核心正在鑄造台重建、或找不到時：原作誰都看不到；本作只回給說話者自己（不掛泡泡），讓他知道沒有人聽得到
 */
function coreChat(g: Game, p: GamePlayer, text: string): void {
  const line: ChatLine = { from: '', color: -1, ch: 'all', text, time: g.time }
  const src = coreHolder(g, p)
  if (!src) {
    deliver(g, line, [p])
    return
  }
  const to = g.allPlayers().filter((q) => q.view.visible.has(src.id) || q.flags.listen)
  for (const q of uniq([...to, p])) q.chatOut.push(q.view.visible.has(src.id) ? { ...line, e: src.id } : line)
}

// ───────── 群組（研究 02 §10.3：-creategroup／-add／;group msg）─────────

interface Group {
  name: string
  owner: number
  members: Set<number>
}

function groups(g: Game): Map<string, Group> {
  return ((g as unknown as { _groups?: Map<string, Group> })._groups ??= new Map())
}

/**
 * 介面依語言顯示的名字（client 的 localizeName：「博士·Bob」「Agent Bob」「Crew 3」）轉回 sim 的寫法再比對，
 * 照畫面上看到的全名打指令也找得到人
 */
export function normalizeNameQuery(q: string): string {
  let s = q.trim().toLowerCase()
  // 中文職業前綴（xx·）與英文晉升頭銜（agent ）
  const dot = s.lastIndexOf('·')
  if (dot >= 0 && dot < s.length - 1) s = s.slice(dot + 1)
  s = s.replace(/^agent\s+/, '')
  // en 介面的預設名「Crew N」＝ sim 的「船員 N」
  const crew = /^crew\s*(\d+)$/.exec(s)
  if (crew) s = '船員 ' + crew[1]
  return s.trim()
}

/** 指令裡的玩家查詢結果：找到一位、符合的人不只一位（不猜）、或找不到 */
export type PlayerLookup = { one: GamePlayer } | { many: GamePlayer[] } | null

/**
 * 指令裡的玩家（-add／-remove／-votekick／-liquidate）：顏色名稱優先，再比名字。
 * 只比對別人眼中的名字（顯示名字、顯示用本名）：通訊病毒換過名字後，用真名找不到人（否則能從找到的是誰反推真名）。
 * 先找完全相符（正規化後：大小寫、中文職業前綴、英文晉升頭銜、「Crew N」）；沒有才找「包含」查詢字串的人。
 * 符合的人不只一位時不猜（Hana 與 hana2 都包含「han」），交給呼叫端私訊列出候選人
 */
export function lookupPlayer(g: Game, q: string): PlayerLookup {
  const s = normalizeNameQuery(q)
  if (!s) return null
  const colorIdx = PLAYER_COLORS.findIndex((c) => c.id === s)
  if (colorIdx >= 0) {
    const p = g.allPlayers().find((x) => x.color === colorIdx)
    return p ? { one: p } : null
  }
  const names = (p: GamePlayer): string[] => [p.name.toLowerCase(), shownBase(p).toLowerCase()].filter((n) => !!n)
  const exact = g.allPlayers().filter((p) => names(p).some((n) => n === s))
  const hits = exact.length ? exact : g.allPlayers().filter((p) => names(p).some((n) => n.includes(s)))
  if (!hits.length) return null
  return hits.length === 1 ? { one: hits[0] } : { many: hits }
}

/**
 * 查詢對到不只一位：私訊列出候選人（只給下指令的人），這次不執行。
 * 名單用別人眼中的顯示名字、依名字排序（不照席位順序：通訊病毒換名後，照席位排等於告訴你誰換成了誰）
 */
function ambiguous(g: Game, p: GamePlayer, q: string, many: GamePlayer[]): void {
  const rows = many.map((x) => ({ zh: shownName(x) || '???', en: enDefault(shownName(x), shownBase(x)) || '???' }))
  rows.sort((a, b) => (a.zh < b.zh ? -1 : a.zh > b.zh ? 1 : 0))
  g.privateLine(p.slot, 'chat.ambiguous', {
    q: q.trim().slice(0, 16),
    ...listArgs(
      rows.map((r) => r.zh),
      rows.map((r) => r.en),
    ),
  })
}

/** 查一位玩家：找到就回傳；不只一位時私訊候選人、回傳 'many'；找不到回傳 undefined */
function resolvePlayer(g: Game, p: GamePlayer, q: string): GamePlayer | 'many' | undefined {
  const r = lookupPlayer(g, q)
  if (!r) return undefined
  if ('many' in r) {
    ambiguous(g, p, q, r.many)
    return 'many'
  }
  return r.one
}

function groupChat(g: Game, p: GamePlayer, name: string, text: string): void {
  const gr = groups(g).get(name.toLowerCase())
  if (!gr || !gr.members.has(p.slot)) {
    g.privateLine(p.slot, 'chat.noGroup', { group: name })
    return
  }
  // 先把已死的成員踢出群組（遺言時間內的發言者自己除外）
  for (const m of [...gr.members]) {
    const q = g.players[m]
    if (!q || (!q.alive && !(q === p && inLastWords(g, q)))) gr.members.delete(m)
  }
  // 被消音（Mute-ilate）或通訊病毒清空名字時沒有名字，也不帶顏色（和公頻一致：顏色本身就能認出是誰）
  const from = p.mutedUntil > g.time ? '' : p.name
  const line: ChatLine = { from, color: from ? p.color : -1, ch: 'group', text, time: g.time, group: gr.name }
  // 群組＋所有死者（研究 02 §10.3）；出局的人不收
  const to = g.allPlayers().filter((q) => gr.members.has(q.slot) || hearsDead(q) || q.flags.listen)
  deliver(g, line, uniq(to))
  g.onGroupChat?.(p, text)
}

/** 以「-」開頭的聊天指令 */
function chatCommand(g: Game, p: GamePlayer, cmd: string): void {
  const [head, ...rest] = cmd.split(/\s+/)
  const arg = rest.join(' ')
  const f = g.faction(p)
  switch (head.toLowerCase()) {
    case 'help':
    case 'commands':
      g.privateLine(p.slot, 'chat.help')
      break
    case 'names': {
      // 名單兩種語言都送（分隔符號、死亡標記依語言）；附大廳原名、依名字排序（見 namesList）
      g.privateLine(p.slot, 'chat.names', namesList(g))
      break
    }
    case 'status': {
      // 只依「已經公告過的死亡」回答：本局不存在、或還沒公告死亡的一方一律當作還活著
      // （3–4 人局只有一種異類；若照實回答「不存在＝已死」，等於公開本局是哪一種）
      const xd = !!g.data.xenoDeathAnnounced
      const md = !!g.data.mutantDeathAnnounced
      g.privateLine(p.slot, xd && md ? 'chat.status.bothDead' : xd ? 'chat.status.xenoDead' : md ? 'chat.status.mutantDead' : 'chat.status.bothAlive')
      break
    }
    case 'l':
    case 'liquidate': {
      if (f === 'crew' || p.spawnOf || !p.alive) return
      const q = resolvePlayer(g, p, arg)
      if (q === 'many') return
      if (!q || q.spawnOf !== f) {
        g.privateLine(p.slot, 'chat.noSuchSpawn')
        return
      }
      const u = g.mainOf(q)
      if (u) {
        q.stayDead = true
        // 死因明確標記（死者自己知道是誰的 spawn，說「被你的主腦清除」不洩漏任何事）
        u.data.deathCause = 'purged'
        g.killEnt(u, null, -1)
      }
      break
    }
    case 'slug':
    case 'iamtheslugling':
      if (p.alive || p.spectator) return
      if (p.data.booted) {
        g.privateLine(p.slot, 'chat.booted')
        return
      }
      if (!g.possessSlug?.(p.slot)) g.privateLine(p.slot, 'chat.noSlug')
      break
    case 'allow':
    case 'disallow':
      if (f === 'crew' || p.spawnOf) return
      p.data.allowSpawnAttack = head.toLowerCase() === 'allow'
      g.privateLine(p.slot, p.data.allowSpawnAttack ? 'chat.allowed' : 'chat.disallowed')
      break
    case 'list': {
      // -list <群組>：原作 vWv／vzv 18314–18333，活人、而且是群組成員本人才能查
      if (rest[0]) {
        listGroup(g, p, rest[0])
        break
      }
      // 沒有給群組名：異類照舊列出自己的陣營（舊用法），其他人提示用法（回覆只給自己，不透露身分）
      if (f !== 'crew' && p.alive) factionList(g, p)
      else g.privateLine(p.slot, 'chat.listUsage')
      break
    }
    case 'listaliens':
    case 'listmutants':
      if (f === 'crew' || !p.alive) return
      factionList(g, p)
      break
    case 'creategroup': {
      // 群組名稱是一個詞（-add 與「;群組 訊息」都以第一個空白分隔），可以是中文
      const name = sanitizeName(rest[0] ?? '')
      if (!p.alive || !name) return
      const key = name.toLowerCase()
      if (groups(g).has(key)) {
        g.privateLine(p.slot, 'chat.groupTaken')
        return
      }
      groups(g).set(key, { name, owner: p.slot, members: new Set([p.slot]) })
      g.privateLine(p.slot, 'chat.groupCreated', { group: name })
      break
    }
    case 'add':
    case 'remove': {
      const [gname, ...who] = rest
      const gr = groups(g).get((gname ?? '').toLowerCase())
      if (!gr || gr.owner !== p.slot) return
      const one = who.join(' ') === 'all' ? undefined : resolvePlayer(g, p, who.join(' '))
      // 名字對到不只一位：已經私訊候選人，這次不加也不移除
      if (one === 'many') return
      const targets = who.join(' ') === 'all' ? g.allPlayers().filter((q) => q.alive) : one ? [one] : []
      for (const q of targets) {
        if (head === 'add') gr.members.add(q.slot)
        else if (q.slot !== p.slot) gr.members.delete(q.slot)
        if (head === 'add' && q.slot !== p.slot) g.privateLine(q.slot, 'chat.addedToGroup', { group: gr.name, name: p.name })
      }
      g.privateLine(p.slot, 'chat.groupList', { group: gr.name, ...listArgs([...gr.members].map((m) => g.players[m]?.name ?? '?')) })
      break
    }
    case 'rename': {
      // 通訊病毒清空名字的 10 秒內不能改名（名字換好時會蓋掉）
      if (!p.alive || g.time > 180 || !arg || p.data.virusTitle !== undefined) return
      // 頭銜＝顯示名字扣掉顯示用本名（通訊病毒換過名字時，本名部分是換到的名字）
      const cls = p.name.slice(0, Math.max(0, p.name.length - shownBase(p).length))
      const nn = arg
        .replace(/[^\p{L}\p{N} _-]/gu, '')
        .replace(/\s+/g, ' ')
        .trim()
        .slice(0, 16)
      if (!nn) return
      // 混用容易互相冒充的文字系統（拉丁字母裡夾西里爾字母、希臘字母…）：「Dr. Аlice」看起來就是「Dr. Alice」
      if (mixedScript(nn)) {
        g.privateLine(p.slot, 'chat.nameMixed')
        return
      }
      // 不能改成別人目前的顯示名字（冒名發言）：比對正規化後的寫法（大小寫、同形異字、全形、空白與符號、「Crew 3」＝「船員 3」）。
      // 只比對別人眼中的名字：通訊病毒換過名字後，比對真名會從「這個名字不能用」反推出誰的真名是什麼
      const sk = nameSkeleton(nn)
      const skFull = nameSkeleton(cls + nn)
      if (g.allPlayers().some((q) => q !== p && [shownBase(q), shownName(q)].some((n) => nameSkeleton(n) === sk || nameSkeleton(n) === skFull))) {
        g.privateLine(p.slot, 'chat.nameTaken')
        return
      }
      // 新名字背後的大廳原名＝改名前別人眼中的大廳原名（-names 用；見 shownLobby）
      lobbyTable(g).set(nn, shownLobby(g, p))
      p.baseName = nn
      p.data.shownBase = undefined
      p.name = cls + nn
      const u = g.mainOf(p)
      if (u && !u.anon) u.name = p.name
      break
    }
    case 'vote':
      if (arg.startsWith('death')) g.handleVote(p.slot, 'deathStart')
      break
    case 'votekick': {
      const q = resolvePlayer(g, p, arg)
      if (q && q !== 'many') g.handleVote(p.slot, 'kick', q.slot)
      break
    }
    case 'shutdown':
      if (p.role === 'android' && !p.alive) {
        p.stayDead = true
        const core = g.world.get(p.data.core as number)
        if (core) g.world.remove(core)
        g.privateLine(p.slot, 'role.shutdownDone')
        // 放棄復活＝真的出局了（遺言時間內則等遺言結束時再標記）
        if (!inLastWords(g, p)) bootIfOut(g, p)
      }
      break
    default:
      g.privateLine(p.slot, 'chat.unknownCmd')
  }
}

// ───────── 名單 ─────────

/**
 * -names、群組名單的死亡標記：只標已經全場公告過的死亡。
 * 主單位死亡時（roleSystem onMainDeath）同時公告死亡並記下 deadAt；被救活時 deadAt 歸 -1。
 * 旁觀的主機一開始就不是「活著」，但從沒參戰、也沒有死亡公告，不能標成死亡（頂列的存活人數也不算他）
 */
export function knownDead(p: GamePlayer): boolean {
  return !p.alive && !p.spectator && p.deadAt >= 0
}

/** -rename 換過的名字 → 這個名字背後的大廳原名（沒改過名的不記：大廳原名就是名字本身）*/
function lobbyTable(g: Game): Map<string, string> {
  return ((g.data.lobbyNames as Map<string, string> | undefined) ??= new Map())
}

/**
 * 別人眼中這位玩家的大廳原名（原作 B7 17370–17376：-names 每一行是「目前名字: 大廳原名 re[]」，re[] 是開局前記下的名字（emv 18719））。
 * 原作的大廳原名是固定的真名，用意是讓 -rename 只是換個稱呼、不能藏身分。本作還有通訊病毒（原作是死碼 vOv 18037，沒有和 re[] 一起設計）：
 * 病毒把「顯示用本名」與顏色互換，若照原作附上真正的大廳原名，病毒就完全失效。所以大廳原名跟著顯示用本名走：
 * 病毒換給你的是誰的名字，你在 -names 就附上那個名字原本的大廳名。沒有病毒時和原作完全相同；
 * 病毒之後再 -rename，新名字附上的是改名前別人眼中的大廳名（不是真名），不會因為改名而露出真名。
 */
export function shownLobby(g: Game, p: GamePlayer): string {
  const b = shownBase(p)
  return lobbyTable(g).get(b) ?? b
}

const SIM_DEFAULT = /^船員 (\d+)$/

/** 英文名單用：預設名字「船員 N」先換成「Crew N」（後面接了其他字樣時，client 認不出預設名字）*/
function enDefault(name: string, base: string): string {
  const m = SIM_DEFAULT.exec(base)
  if (!m || !name.endsWith(base)) return name
  return name.slice(0, name.length - base.length) + 'Crew ' + m[1]
}

/**
 * -names 的名單（兩種語言）：顯示名字＋大廳原名（和顯示用本名不同時才附）＋死亡／旁觀標記。
 * 依顯示名字排序，不照席位順序：通訊病毒換名後，照席位排的名單和換名前一比就知道誰換成了誰。
 * 病毒清空名字的 10 秒內名字是空的，顯示成 ???，也不附大廳原名
 */
function namesList(g: Game): Record<string, string> {
  const rows = g.allPlayers().map((q) => {
    const base = shownBase(q)
    const lobby = shownLobby(g, q)
    const disp = q.name
    const extra = !!disp && lobby !== base
    const zh = (disp || '???') + (extra ? `（大廳名：${lobby}）` : '') + (q.spectator ? '（旁觀）' : knownDead(q) ? '（死亡）' : '')
    const en =
      (disp ? (extra || q.spectator ? enDefault(disp, base) : disp) : '???') +
      (extra ? ` (lobby: ${enDefault(lobby, lobby)})` : '') +
      (q.spectator ? ' (spectating)' : knownDead(q) ? ' (dead)' : '')
    return { zh, en }
  })
  rows.sort((a, b) => (a.zh < b.zh ? -1 : a.zh > b.zh ? 1 : 0))
  return listArgs(
    rows.map((r) => r.zh),
    rows.map((r) => r.en),
  )
}

/** 異類的陣營名單（-listaliens／-listmutants；只給本人），並在小地圖標出同伴位置 */
function factionList(g: Game, p: GamePlayer): void {
  const f = g.faction(p)
  const mates = g.allPlayers().filter((q) => g.faction(q) === f)
  g.privateLine(p.slot, 'chat.factionList', listArgs(mates.map((q) => q.name + (q.alive ? '' : '（死亡）')), mates.map((q) => q.name + (q.alive ? '' : ' (dead)'))))
  for (const q of mates) {
    const u = g.mainOf(q)
    if (u && q.alive) g.emitFx({ k: 'ping', z: u.zone, x: u.x, y: u.y }, [p.slot])
  }
}

/**
 * -list <群組>：群組成員名單，只給查詢的人。原作只有活人、而且是成員本人才查得到（vWv、vYv）；
 * 群組不存在、或你不是成員，回同一句話（不透露別人建了哪些群組）
 */
function listGroup(g: Game, p: GamePlayer, name: string): void {
  const gr = groups(g).get(name.toLowerCase())
  if (!p.alive || !gr || !gr.members.has(p.slot)) {
    g.privateLine(p.slot, 'chat.noGroup', { group: name.slice(0, 16) })
    return
  }
  const ms = [...gr.members].map((m) => g.players[m]).filter((q): q is GamePlayer => !!q)
  g.privateLine(p.slot, 'chat.groupMembers', {
    group: gr.name,
    ...listArgs(
      ms.map((q) => (q.name || '???') + (knownDead(q) ? '（死亡）' : '')),
      ms.map((q) => (q.name || '???') + (knownDead(q) ? ' (dead)' : '')),
    ),
  })
}

// ───────── 名字的正規化（防冒名）─────────

/** 大寫的同形字先對到拉丁大寫：小寫化之後有些會變成長得不一樣的字（希臘 Η → η）*/
const UPPER_LOOK: Record<string, string> = {
  А: 'A', В: 'B', Е: 'E', К: 'K', М: 'M', Н: 'H', О: 'O', Р: 'P', С: 'C', Т: 'T', У: 'Y', Х: 'X', Ѕ: 'S', І: 'I', Ј: 'J', Ԛ: 'Q', Ԝ: 'W', Ү: 'Y', Ӏ: 'I',
  Α: 'A', Β: 'B', Ε: 'E', Ζ: 'Z', Η: 'H', Ι: 'I', Κ: 'K', Μ: 'M', Ν: 'N', Ο: 'O', Ρ: 'P', Τ: 'T', Υ: 'Y', Χ: 'X',
}
/** 小寫的同形字（西里爾、希臘、拉丁擴充）→ 拉丁小寫 */
const LOWER_LOOK: Record<string, string> = {
  а: 'a', е: 'e', ё: 'e', о: 'o', р: 'p', с: 'c', у: 'y', х: 'x', ѕ: 's', і: 'i', ї: 'i', ј: 'j', ԁ: 'd', ԛ: 'q', ԝ: 'w', һ: 'h', ӏ: 'l', ү: 'y', к: 'k',
  α: 'a', ο: 'o', ρ: 'p', ν: 'v', υ: 'u', ι: 'i', κ: 'k', χ: 'x', ε: 'e', ω: 'w', ϲ: 'c', ϳ: 'j',
  ı: 'i', ɩ: 'i', ɡ: 'g',
}

/**
 * 名字的比對用寫法：全形／相容字元統一（NFKC）、同形字換成拉丁字母、去掉重音、大小寫、空白與標點，
 * 再把容易看錯的字併成一個（0／o、1／l／i／I、rn／m、vv／w），en 介面的「Crew N」等於預設名字「船員 N」。
 * 只用來判斷「看起來是不是同一個名字」，寧可多擋：兩個名字的寫法相同就視為撞名
 */
export function nameSkeleton(name: string): string {
  let s = [...name.normalize('NFKC')].map((c) => UPPER_LOOK[c] ?? c).join('')
  s = s.toLowerCase().normalize('NFD').replace(/\p{M}/gu, '')
  s = [...s].map((c) => LOWER_LOOK[c] ?? c).join('')
  s = s.replace(/[\s_\-.·・'’]/gu, '')
  const crew = /^crew(\d+)$/.exec(s)
  if (crew) s = '船員' + crew[1]
  return s.replace(/0/g, 'o').replace(/[1i|]/g, 'l').replace(/rn/g, 'm').replace(/vv/g, 'w')
}

const SCRIPTS: [string, RegExp][] = [
  ['Latin', /\p{Script=Latin}/u],
  ['Cyrillic', /\p{Script=Cyrillic}/u],
  ['Greek', /\p{Script=Greek}/u],
  ['Han', /\p{Script=Han}/u],
  ['Hiragana', /\p{Script=Hiragana}/u],
  ['Katakana', /\p{Script=Katakana}/u],
  ['Hangul', /\p{Script=Hangul}/u],
  ['Bopomofo', /\p{Script=Bopomofo}/u],
]
/** 可以混用的組合（Unicode UTS #39 的 Highly Restrictive：中日韓文字搭配拉丁字母很常見，也不容易互相冒充）*/
const MIX_OK: readonly string[][] = [
  ['Latin', 'Han', 'Hiragana', 'Katakana'],
  ['Latin', 'Han', 'Bopomofo'],
  ['Latin', 'Han', 'Hangul'],
]

/** 名字裡的字母是不是混用了容易互相冒充的文字系統（拉丁＋西里爾、拉丁＋希臘、西里爾＋希臘…）；數字、符號不算 */
export function mixedScript(name: string): boolean {
  const set = new Set<string>()
  for (const c of name) {
    if (!/\p{L}/u.test(c) || /[\p{Script=Common}\p{Script=Inherited}]/u.test(c)) continue
    set.add(SCRIPTS.find(([, re]) => re.test(c))?.[0] ?? 'Other')
  }
  if (set.size <= 1) return false
  return !MIX_OK.some((ok) => [...set].every((x) => ok.includes(x)))
}

// ───────── 小地圖信號 ─────────

/**
 * 小地圖信號（原作全員結盟，Alt＋點小地圖大家都看得到；本作活人與死者分開，和聊天一樣不讓死者的全知情報流回活人）。
 * - 座標要在該 zone 的範圍內（太空：±SPACE_HALF；站內：版面範圍），zone 要存在、還沒被摧毀。
 * - 活人發的只給活人（大廳設定「全體聊天只限同站」時只給同站的人）；死者與旁觀者發的只給死者與旁觀者
 *   （出局的人、等記憶核心復活的仿生人、被投票禁言的死者不能發也收不到，同 hearsDead）。
 * - 名字與顏色用發送者此刻別人眼中的樣子：千面化身用偽裝對象的；被消音或通訊病毒清空名字時沒有名字、也不帶顏色。
 * 不回送給發送者自己（client 送出時已經先顯示）。限流在 server（每人約 2 秒 1 次、連發 3 次）
 */
export function routeMapPing(g: Game, p: GamePlayer, z: number, x: number, y: number): void {
  const zone = g.world.zones[z]
  if (!zone || !zone.alive || !Number.isFinite(x) || !Number.isFinite(y)) return
  if (zone.kind === 'space') {
    if (Math.abs(x) > SPACE_HALF || Math.abs(y) > SPACE_HALF) return
  } else {
    const l = zone.layout
    if (!l || !zone.station || x < 0 || y < 0 || x > l.w || y > l.h) return
  }
  const everyone = g.allPlayers()
  let to: GamePlayer[]
  let name = p.mutedUntil > g.time && p.alive ? '' : p.name
  let color = p.color
  if (p.alive) {
    const main = g.mainOf(p)
    const fake = main?.data.fake as { name: string; color: number } | undefined
    if (fake && name) {
      name = fake.name
      color = fake.color
    }
    to = everyone.filter((q) => q.alive && !q.spectator)
    if (g.settings.localChat && main) to = to.filter((q) => g.mainOf(q)?.zone === main.zone)
  } else {
    if (!hearsDead(p) || p.data.deadMuted) return
    to = everyone.filter(hearsDead)
  }
  const msg: HostMsg = { t: 'mapPing', z, x: Math.round(x * 100) / 100, y: Math.round(y * 100) / 100, name, color: name ? color : -1 }
  for (const q of uniq([...to, ...everyone.filter((e) => e.flags.listen)])) if (q !== p && q.connected && !q.bot) g.send(q.slot, msg)
}
