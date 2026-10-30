// 聊天路由（研究 02 §10.3）：在 sim 內依存活狀態、所在 zone、頻道決定誰收得到
import type { ChatChannel, ChatLine } from '../../shared/protocol/messages'
import type { Game, GamePlayer } from '../game'
import { PLAYER_COLORS } from '../../shared/constants'

/** 死後 4 秒內的發言仍讓活人看到（遺言）*/
export const LAST_WORDS = 4

function deliver(g: Game, line: ChatLine, to: GamePlayer[]): void {
  for (const q of to) q.chatOut.push(line)
}

export function routeChat(g: Game, p: GamePlayer, ch: ChatChannel, text: string, groupName?: string): void {
  if (text.startsWith('-') && text.length > 1) {
    chatCommand(g, p, text.slice(1).trim())
    return
  }
  if (ch === 'group') {
    groupChat(g, p, groupName ?? '', text)
    return
  }
  if (p.data.deadMuted && !p.alive) return
  const t = g.time
  const inLastWords = !p.alive && p.deadAt >= 0 && t - p.deadAt <= LAST_WORDS
  const speakingAlive = p.alive || inLastWords
  const everyone = g.allPlayers()
  const dead = everyone.filter((q) => !q.alive)
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
  // 全體：活人＋死者；可設定只限同站
  let to = everyone
  if (g.settings.localChat && main) {
    to = everyone.filter((q) => !q.alive || g.mainOf(q)?.zone === main.zone || q.slot === p.slot)
    to = uniq([...to, ...eavesdrop])
  }
  // 千面化身：聲音也跟著偽裝成目標
  const fake = main?.data.fake as { name: string; color: number } | undefined
  const shown = fake && name ? fake.name : name
  const color = fake && name ? fake.color : p.color
  const line: ChatLine = { from: shown, color: shown ? color : -1, ch: 'all', text, time: t }
  // 對話泡泡只掛在「看起來就是說話者」的單位上：匿名形態或被消音時不掛（否則等於公開身分；千面化身例外，泡泡掛在偽裝上），
  // 而且只給當下看得到那個單位的人
  const bubble = !inLastWords && main && (!main.anon || !!fake) && !!shown ? main.id : 0
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

function findPlayer(g: Game, q: string): GamePlayer | undefined {
  const s = q.trim().toLowerCase()
  if (!s) return undefined
  const colorIdx = PLAYER_COLORS.findIndex((c) => c.id === s)
  if (colorIdx >= 0) return g.allPlayers().find((p) => p.color === colorIdx)
  return g.allPlayers().find((p) => p.name.toLowerCase().includes(s) || p.baseName.toLowerCase().includes(s))
}

function groupChat(g: Game, p: GamePlayer, name: string, text: string): void {
  if (!p.alive) return
  const gr = groups(g).get(name.toLowerCase())
  if (!gr || !gr.members.has(p.slot)) {
    g.privateLine(p.slot, 'chat.noGroup', { group: name })
    return
  }
  for (const m of [...gr.members]) if (!g.players[m]?.alive) gr.members.delete(m)
  const line: ChatLine = { from: p.mutedUntil > g.time ? '' : p.name, color: p.color, ch: 'group', text, time: g.time, group: gr.name }
  const to = g.allPlayers().filter((q) => gr.members.has(q.slot) || !q.alive || q.flags.listen)
  deliver(g, line, uniq(to))
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
      const list = g.allPlayers().map((q) => `${q.name}${q.alive ? '' : '（DEAD）'}`).join('、')
      g.privateLine(p.slot, 'chat.names', { list })
      break
    }
    case 'status': {
      const xm = g.allPlayers().find((q) => q.role === 'xeno' && !q.spawnOf)
      const mm = g.allPlayers().find((q) => q.role === 'mutant' && !q.spawnOf)
      const xd = !xm || !xm.alive
      const md = !mm || !mm.alive
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
        g.killEnt(u, null, -1)
      }
      break
    }
    case 'slug':
    case 'iamtheslugling':
      if (p.alive || p.spectator) return
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
      g.privateLine(p.slot, 'chat.factionList', { list: mates.map((q) => q.name + (q.alive ? '' : '（DEAD）')).join('、') })
      for (const q of mates) {
        const u = g.mainOf(q)
        if (u && q.alive) g.emitFx({ k: 'ping', z: u.zone, x: u.x, y: u.y }, [p.slot])
      }
      break
    }
    case 'creategroup': {
      if (!p.alive || !arg) return
      const key = arg.toLowerCase().slice(0, 16)
      if (groups(g).has(key)) {
        g.privateLine(p.slot, 'chat.groupTaken')
        return
      }
      groups(g).set(key, { name: arg.slice(0, 16), owner: p.slot, members: new Set([p.slot]) })
      g.privateLine(p.slot, 'chat.groupCreated', { group: arg.slice(0, 16) })
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
      g.privateLine(p.slot, 'chat.groupList', { group: gr.name, list: [...gr.members].map((m) => g.players[m]?.name ?? '?').join('、') })
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
      }
      break
    default:
      g.privateLine(p.slot, 'chat.unknownCmd')
  }
}
