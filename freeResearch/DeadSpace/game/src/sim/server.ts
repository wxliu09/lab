// 主機端的權威 server：大廳、連線管理、訊息路由。跑在 Sim Worker 裡（測試時直接在 Node 裡跑）。
// peer 'local' 永遠是主機自己的本機 client（由主機的主執行緒指定，遠端 peer 無法冒充）。
import { DEFAULT_SETTINGS, type ClientMsg, type HostMsg, type LobbyPlayerInfo, type LobbySettings } from '../shared/protocol/messages'
import { encode } from '../shared/protocol/codec'
import { parseClientBytes, sanitizeName, sanitizeText } from '../shared/protocol/validate'
import { MAX_PLAYERS, PLAYER_COLORS, PROTOCOL_VERSION, RECONNECT_GRACE_S, TICK_DT } from '../shared/constants'
import { Rng } from '../shared/rng'
import { Game, type GameInit } from './game'

export const LOCAL_PEER = 'local'

export interface ServerIO {
  send(peer: string, data: Uint8Array): void
}

interface LobbyPlayer {
  slot: number
  name: string
  color: number
  ready: boolean
  peer: string | null
  token: string
  host: boolean
  bot: boolean
  /** 斷線時刻（秒，server 時鐘）；null = 在線 */
  droppedAt: number | null
}

/** 每位 peer 的權杖桶限流 */
class Bucket {
  private tokens: number
  private last = 0
  constructor(
    private cap: number,
    private rate: number,
  ) {
    this.tokens = cap
  }
  take(now: number): boolean {
    this.tokens = Math.min(this.cap, this.tokens + (now - this.last) * this.rate)
    this.last = now
    if (this.tokens < 1) return false
    this.tokens -= 1
    return true
  }
}

interface PeerState {
  slot: number | null
  general: Bucket
  chat: Bucket
  tune: Bucket
  hello: Bucket
  strikes: number
}

export class GameServer {
  readonly players: (LobbyPlayer | null)[] = new Array(MAX_PLAYERS).fill(null)
  private peers = new Map<string, PeerState>()
  private kickedTokens = new Set<string>()
  settings: LobbySettings = { ...DEFAULT_SETTINGS }
  phase: 'lobby' | 'game' = 'lobby'
  game: Game | null = null
  /** server 時鐘（秒），由 tick 推進；測試可直接改 */
  now = 0
  private lobbyDirty = false
  private rng: Rng
  hostHidden = false

  constructor(
    readonly code: string,
    private io: ServerIO,
    seed = (Math.random() * 0x7fffffff) | 0,
  ) {
    this.rng = new Rng(seed)
    this.settings.seed = seed
  }

  // ───────── 連線事件 ─────────

  onJoin(peer: string): void {
    if (!this.peers.has(peer)) {
      this.peers.set(peer, {
        slot: null,
        general: new Bucket(60, 40),
        chat: new Bucket(6, 2),
        tune: new Bucket(10, 10),
        hello: new Bucket(3, 0.5),
        strikes: 0,
      })
    }
    this.sendTo(peer, { t: 'host', ver: PROTOCOL_VERSION })
  }

  onLeave(peer: string): void {
    const ps = this.peers.get(peer)
    this.peers.delete(peer)
    if (!ps || ps.slot === null) return
    const p = this.players[ps.slot]
    if (!p || p.peer !== peer) return
    p.peer = null
    p.droppedAt = this.now
    p.ready = false
    this.game?.setConnected(p.slot, false)
    this.lobbyDirty = true
  }

  onMessage(peer: string, data: Uint8Array): void {
    const ps = this.peers.get(peer)
    if (!ps) return
    if (!ps.general.take(this.now)) return
    const msg = parseClientBytes(data)
    if (!msg) {
      ps.strikes++
      return
    }
    try {
      this.route(peer, ps, msg)
    } catch (e) {
      // 任何單一訊息都不能讓 server 崩潰
      if (__DEV__) console.error('[server] message error', e)
    }
  }

  private route(peer: string, ps: PeerState, msg: ClientMsg): void {
    if (msg.t === 'hello') {
      if (!ps.hello.take(this.now)) return
      this.handleHello(peer, ps, msg)
      return
    }
    if (msg.t === 'ping') {
      this.sendTo(peer, { t: 'pong', n: msg.n, tick: this.game?.tick ?? 0 })
      return
    }
    const slot = ps.slot
    if (slot === null) return
    const p = this.players[slot]
    if (!p || p.peer !== peer) return
    const isHost = peer === LOCAL_PEER
    switch (msg.t) {
      case 'lobby':
        if (this.phase !== 'lobby') return
        if (msg.name !== undefined) p.name = this.uniqueName(sanitizeName(msg.name) || p.name, slot)
        if (msg.color !== undefined && !this.colorTaken(msg.color, slot)) p.color = msg.color
        if (msg.ready !== undefined) p.ready = msg.ready
        this.lobbyDirty = true
        break
      case 'settings':
        if (!isHost || this.phase !== 'lobby') return
        Object.assign(this.settings, msg.s)
        this.lobbyDirty = true
        break
      case 'start':
        if (!isHost || this.phase !== 'lobby') return
        this.startGame()
        break
      case 'kick': {
        if (!isHost || msg.slot === slot) return
        const target = this.players[msg.slot]
        if (!target) return
        if (this.phase === 'game') return
        this.kickedTokens.add(target.token)
        if (target.peer) this.sendTo(target.peer, { t: 'reject', reason: 'kicked' })
        if (target.peer) {
          const tps = this.peers.get(target.peer)
          if (tps) tps.slot = null
        }
        this.players[msg.slot] = null
        this.lobbyDirty = true
        break
      }
      case 'chat': {
        if (!ps.chat.take(this.now)) return
        const text = sanitizeText(msg.text).trim()
        if (!text) return
        if (this.phase === 'lobby') {
          this.broadcastLobby({
            t: 'chat',
            lines: [{ from: p.name, color: p.color, ch: 'all', text, time: this.now }],
          })
        } else this.game?.handleChat(slot, msg.ch, text, msg.to)
        break
      }
      case 'cmd':
        this.game?.handleCommand(slot, msg.c)
        break
      case 'vote':
        this.game?.handleVote(slot, msg.v, msg.arg)
        break
      case 'note':
        this.game?.handleNote(slot, msg.target, msg.mark, msg.text ? sanitizeText(msg.text) : '')
        break
      case 'shareNotes':
        this.game?.shareNotes(slot, msg.to)
        break
      case 'Tune':
        if (!ps.tune.take(this.now)) return
        if (this.game) this.game.handleTune(slot, msg.id, msg.op, msg.args)
        else this.sendTo(peer, { t: 'TuneResult', id: msg.id, ok: false, msg: 'no game' })
        break
    }
  }

  private handleHello(peer: string, ps: PeerState, msg: Extract<ClientMsg, { t: 'hello' }>): void {
    if (msg.ver !== PROTOCOL_VERSION) {
      this.sendTo(peer, { t: 'reject', reason: 'version' })
      return
    }
    if (this.kickedTokens.has(msg.token)) {
      this.sendTo(peer, { t: 'reject', reason: 'kicked' })
      return
    }
    // 重連：同一個 token 回到原席位
    const existing = this.players.find((p) => p && !p.bot && p.token === msg.token)
    if (existing) {
      // 主機席位只能由 local peer 取得；遠端 peer 拿主機 token 也不行
      if (existing.host !== (peer === LOCAL_PEER)) {
        this.sendTo(peer, { t: 'reject', reason: 'invalid' })
        return
      }
      if (existing.peer && existing.peer !== peer) {
        const old = this.peers.get(existing.peer)
        if (old) old.slot = null
      }
      existing.peer = peer
      existing.droppedAt = null
      ps.slot = existing.slot
      this.sendTo(peer, { t: 'welcome', slot: existing.slot, token: existing.token })
      this.lobbyDirty = true
      if (this.game) {
        this.game.setConnected(existing.slot, true)
        this.game.resendStart(existing.slot)
      }
      return
    }
    if (this.phase !== 'lobby') {
      this.sendTo(peer, { t: 'reject', reason: 'started' })
      return
    }
    if (ps.slot !== null) return
    const slot = this.players.findIndex((p) => p === null)
    if (slot < 0) {
      this.sendTo(peer, { t: 'reject', reason: 'full' })
      return
    }
    const name = this.uniqueName(sanitizeName(msg.name) || `船員 ${slot + 1}`, slot)
    const color = this.colorTaken(msg.color, slot) ? this.firstFreeColor() : msg.color
    this.players[slot] = {
      slot,
      name,
      color,
      ready: false,
      peer,
      token: msg.token,
      host: peer === LOCAL_PEER,
      bot: false,
      droppedAt: null,
    }
    ps.slot = slot
    this.sendTo(peer, { t: 'welcome', slot, token: msg.token })
    this.lobbyDirty = true
  }

  private colorTaken(c: number, exceptSlot: number): boolean {
    return this.players.some((p) => p && p.slot !== exceptSlot && p.color === c)
  }
  private firstFreeColor(): number {
    for (let c = 0; c < PLAYER_COLORS.length; c++) if (!this.colorTaken(c, -1)) return c
    return 0
  }
  private uniqueName(name: string, slot: number): string {
    let n = name
    let k = 2
    while (this.players.some((p) => p && p.slot !== slot && p.name === n)) n = `${name}${k++}`
    return n
  }

  // ───────── 開局 ─────────

  startGame(): void {
    if (this.phase !== 'lobby') return
    // 填 bots
    let bots = this.settings.bots
    for (let s = 0; s < MAX_PLAYERS && bots > 0; s++) {
      if (this.players[s]) continue
      this.players[s] = {
        slot: s,
        name: `BOT-${String.fromCharCode(65 + s)}`,
        color: this.firstFreeColor(),
        ready: true,
        peer: null,
        token: 'bot' + s,
        host: false,
        bot: true,
        droppedAt: null,
      }
      bots--
    }
    const roster = this.players.filter((p): p is LobbyPlayer => p !== null)
    if (roster.length === 0) return
    const init: GameInit = {
      seed: this.settings.seed || this.rng.id31(),
      settings: { ...this.settings },
      players: roster.map((p) => ({
        slot: p.slot,
        name: p.name,
        color: p.color,
        bot: p.bot,
        connected: p.bot || p.peer !== null,
        spectator: p.host && this.settings.hostSpectate,
      })),
      send: (slot, msg) => {
        const p = this.players[slot]
        if (p?.peer) this.sendTo(p.peer, msg)
      },
    }
    this.phase = 'game'
    this.game = new Game(init)
    this.lobbyDirty = true
  }

  // ───────── 迴圈 ─────────

  tick(): void {
    this.now += TICK_DT
    // 斷線寬限
    for (const p of this.players) {
      if (!p || p.bot || p.droppedAt === null) continue
      if (this.now - p.droppedAt > RECONNECT_GRACE_S) {
        if (this.phase === 'lobby') {
          this.players[p.slot] = null
          this.lobbyDirty = true
        } else {
          p.droppedAt = null
          this.game?.playerLeft(p.slot)
        }
      }
    }
    if (this.game) {
      this.game.hostHidden = this.hostHidden
      this.game.step()
    }
    if (this.lobbyDirty) {
      this.lobbyDirty = false
      this.broadcastLobby(this.lobbyState())
    }
  }

  lobbyState(): HostMsg {
    const players: LobbyPlayerInfo[] = this.players
      .filter((p): p is LobbyPlayer => p !== null)
      .map((p) => ({
        slot: p.slot,
        name: p.name,
        color: p.color,
        ready: p.ready,
        connected: p.bot || p.peer !== null,
        host: p.host,
        bot: p.bot,
      }))
    return { t: 'lobbyState', players, settings: this.settings, code: this.code }
  }

  private broadcastLobby(msg: HostMsg): void {
    const data = encode(msg)
    for (const p of this.players) if (p?.peer) this.io.send(p.peer, data)
  }

  sendTo(peer: string, msg: HostMsg): void {
    this.io.send(peer, encode(msg))
  }

  /** 大廳階段的測試掛勾 */
  lobbyHook(op: string, args: unknown[]): unknown {
    if (op === 'settings' && args[0] && typeof args[0] === 'object') {
      Object.assign(this.settings, args[0])
      this.lobbyDirty = true
      return { ok: true }
    }
    if (op === 'start') {
      this.startGame()
      return { ok: this.phase === 'game' }
    }
    return { error: 'no game' }
  }

  slotOfPeer(peer: string): number | null {
    return this.peers.get(peer)?.slot ?? null
  }
}
