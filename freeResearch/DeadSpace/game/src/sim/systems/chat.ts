// 聊天路由（研究 02 §10.3）：在 sim 內依存活狀態、所在 zone、頻道決定誰收得到
import type { ChatChannel, ChatLine } from '../../shared/protocol/messages'
import type { Game, GamePlayer } from '../game'
import { PLAYER_COLORS } from '../../shared/constants'
import { sanitizeName } from '../../shared/protocol/validate'
import { listArgs } from '../../shared/sysArgs'

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

function findPlayer(g: Game, q: string): GamePlayer | undefined {
  const s = normalizeNameQuery(q)
  if (!s) return undefined
  const colorIdx = PLAYER_COLORS.findIndex((c) => c.id === s)
  if (colorIdx >= 0) return g.allPlayers().find((p) => p.color === colorIdx)
  return g.allPlayers().find((p) => p.name.toLowerCase().includes(s) || p.baseName.toLowerCase().includes(s))
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
  const line: ChatLine = { from: p.mutedUntil > g.time ? '' : p.name, color: p.color, ch: 'group', text, time: g.time, group: gr.name }
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
      // 名單兩種語言都送（分隔符號、死亡標記依語言）
      const ps = g.allPlayers()
      g.privateLine(p.slot, 'chat.names', listArgs(ps.map((q) => q.name + (q.alive ? '' : '（死亡）')), ps.map((q) => q.name + (q.alive ? '' : ' (dead)'))))
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
      const q = findPlayer(g, arg)
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
    case 'list':
    case 'listaliens':
    case 'listmutants': {
      if (f === 'crew' || !p.alive) return
      const mates = g.allPlayers().filter((q) => g.faction(q) === f)
      g.privateLine(p.slot, 'chat.factionList', listArgs(mates.map((q) => q.name + (q.alive ? '' : '（死亡）')), mates.map((q) => q.name + (q.alive ? '' : ' (dead)'))))
      for (const q of mates) {
        const u = g.mainOf(q)
        if (u && q.alive) g.emitFx({ k: 'ping', z: u.zone, x: u.x, y: u.y }, [p.slot])
      }
      break
    }
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
      const targets = who.join(' ') === 'all' ? g.allPlayers().filter((q) => q.alive) : [findPlayer(g, who.join(' '))].filter((x): x is GamePlayer => !!x)
      for (const q of targets) {
        if (head === 'add') gr.members.add(q.slot)
        else if (q.slot !== p.slot) gr.members.delete(q.slot)
        if (head === 'add' && q.slot !== p.slot) g.privateLine(q.slot, 'chat.addedToGroup', { group: gr.name, name: p.name })
      }
      g.privateLine(p.slot, 'chat.groupList', { group: gr.name, ...listArgs([...gr.members].map((m) => g.players[m]?.name ?? '?')) })
      break
    }
    case 'rename': {
      if (!p.alive || g.time > 180 || !arg) return
      const cls = p.name.slice(0, p.name.length - p.baseName.length)
      const nn = arg.replace(/[^\p{L}\p{N} _-]/gu, '').slice(0, 16)
      if (!nn) return
      // 不能改成別人的名字（冒名發言）
      if (g.allPlayers().some((q) => q !== p && (q.baseName.toLowerCase() === nn.toLowerCase() || q.name.toLowerCase().endsWith(nn.toLowerCase())))) {
        g.privateLine(p.slot, 'chat.nameTaken')
        return
      }
      p.baseName = nn
      p.name = cls + nn
      const u = g.mainOf(p)
      if (u && !u.anon) u.name = p.name
      break
    }
    case 'vote':
      if (arg.startsWith('death')) g.handleVote(p.slot, 'deathStart')
      break
    case 'votekick': {
      const q = findPlayer(g, arg)
      if (q) g.handleVote(p.slot, 'kick', q.slot)
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
