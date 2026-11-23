// 主機端的權威 server：大廳、連線管理、訊息路由。跑在 Sim Worker 裡（測試時直接在 Node 裡跑）。
// peer 'local' 永遠是主機自己的本機 client（由主機的主執行緒指定，遠端 peer 無法冒充）。
import { DEFAULT_SETTINGS, PRACTICE_ROOM, type ClientMsg, type HostMsg, type LobbyPlayerInfo, type LobbySettings, type PracticeRole } from '../shared/protocol/messages'
import { encode } from '../shared/protocol/codec'
import { parseClientBytes, sanitizeName, sanitizeText } from '../shared/protocol/validate'
import { MAX_PLAYERS, PLAYER_COLORS, PROTOCOL_VERSION, RECONNECT_GRACE_S, TICK_DT } from '../shared/constants'
import { Rng } from '../shared/rng'
import { Game, fmtKey, type GameInit } from './game'
import { PRACTICE_APOCALYPSE } from './systems/events'
import { nameSkeleton } from './systems/chat'

export const LOCAL_PEER = 'local'
/** 開局等玩家載入的上限（秒，server 時間）：有人卡住也不會讓整局停著 */
export const LOAD_WAIT_S = 25
/** 只有一位真人時的上限 */
export const LOAD_WAIT_SOLO_S = 120
/** 單機練習暫停的上限（秒，server 時鐘）：超過就自動繼續 */
export const PRACTICE_PAUSE_MAX_S = 600
/** 聊天限流：持續約 1 行／1.5 秒，短暫連發最多 CHAT_BURST 行（每行 200 字由 sanitizeText 截斷）*/
export const CHAT_BURST = 4
export const CHAT_RATE = 1 / 1.5
/** 同一個人這麼多秒內送出相同的內容（同一頻道）就壓掉，私訊提示 */
export const CHAT_DUPE_S = 10
/** 聊天超過限流被丟掉時私訊提示發送者；同一個連線這麼多秒內最多提示一次（提示本身不能變成洗版）*/
export const CHAT_FAST_HINT_S = 5
/** 小地圖信號限流：每人約 2 秒 1 次，短暫連發最多 3 次 */
export const PING_BURST = 3
export const PING_RATE = 0.5

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
  ping: Bucket
  tune: Bucket
  hello: Bucket
  strikes: number
  /** 上次提示「訊息送太快」的時刻（server 時鐘）*/
  fastHintAt: number
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
  private games = 0
  private rng: Rng
  hostHidden = false
  /** 開局時等玩家回報載入完成（正式環境由 worker 打開；單元測試的 Harness 不等）*/
  waitClients = false
  /** 還沒回報載入完成的玩家 slot；null = 不在等 */
  private loading: Set<number> | null = null
  private loadDeadline = 0
  /** 主機明確改過末日時間（設定訊息帶了 apocalypse）：練習局就照主機的設定，不套用練習的預設範圍 */
  private apoCustom = false
  /** 單機練習暫停開始的時刻（server 時鐘）；null = 沒有暫停 */
  private pauseAt: number | null = null
  /** 每個席位上一則聊天（壓掉重複用）：比對用的內容、送出時刻（server 時鐘）、這一串重複是否已經提示過 */
  private lastChat = new Map<number, { key: string; at: number; hinted: boolean }>()

  constructor(
    readonly code: string,
    private io: ServerIO,
    /** 公開的亂數流 GameServer.rng 的種子：只用來產生每局的地圖種子（版面），推不出任何秘密 */
    seed = (Math.random() * 0x7fffffff) | 0,
    /**
     * 秘密亂數流（身分、事件、實體 id…）的明確種子：只給單元測試固定結果用（第 n 局用 secret + n）。
     * 省略 = 正式對局（worker 一律省略）：每局三條秘密流各自用 128 bit 密碼學亂數（game.ts secretSeeds；盤點表在 SecretSeeds 上方）
     */
    private secret?: number,
  ) {
    this.rng = new Rng(seed)
    // 地圖種子只留在主機：大廳設定裡的 seed 只有主機手動指定時才非 0
    this.settings.seed = 0
  }

  // ───────── 連線事件 ─────────

  onJoin(peer: string): void {
    if (!this.peers.has(peer)) {
      this.peers.set(peer, {
        slot: null,
        general: new Bucket(60, 40),
        chat: new Bucket(CHAT_BURST, CHAT_RATE),
        ping: new Bucket(PING_BURST, PING_RATE),
        tune: new Bucket(10, 10),
        hello: new Bucket(3, 0.5),
        strikes: 0,
        fastHintAt: -Infinity,
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
    // 開局等待載入中斷線：不再等他（重連後照常加入）
    this.loading?.delete(p.slot)
    // 單機練習暫停中斷線：自動繼續（不讓沒人看著的一局一直停著）
    this.resumePause()
    this.game?.setConnected(p.slot, false)
    if (this.game && !this.game.ended) this.game.playerDropped(p.slot)
    // 對局中不為了連線狀態廣播大廳名單：名單上有每個席位的連線狀態與大廳名字，廣播出去等於點名是誰斷線
    if (this.phase === 'lobby') this.lobbyDirty = true
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
        this.applySettings(msg.s)
        break
      case 'start':
        if (!isHost || this.phase !== 'lobby') return
        this.startGame(msg.role)
        break
      case 'loaded':
        this.loading?.delete(slot)
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
        if (!ps.chat.take(this.now)) {
          // 以前默默丟掉，發送者不知道自己的話沒送出（第 5 輪審查 P3-4）
          this.hintTooFast(peer, ps, slot)
          return
        }
        const raw = sanitizeText(msg.text).trim()
        if (!raw) return
        if (this.isDupeChat(peer, slot, msg.ch, msg.to, raw)) return
        // 「@」開頭是系統訊息 key 的格式（client 會翻譯）：玩家打的字前面加零寬空白，照原樣顯示、不被當成系統訊息
        const text = raw.startsWith('@') ? '\u200b' + raw : raw
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
      case 'pause':
        if (msg.on) this.pauseSolo(slot)
        else this.resumePause()
        break
      case 'mapPing':
        if (this.phase !== 'game' || !ps.ping.take(this.now)) return
        this.game?.handleMapPing(slot, msg.z, msg.x, msg.y)
        break
      case 'prophecy':
        // 亡靈預言（第 8 輪）：誰能預言、能改幾次由 sim 判斷（systems/spectate.ts）
        if (this.phase !== 'game') return
        this.game?.handleProphecy(slot, msg.win, msg.mind)
        break
      case 'abort': {
        // 主機中止對局：只接受本機（主機分頁自己）送來的，其他 peer 一律忽略
        if (peer !== LOCAL_PEER) return
        const ended = this.abortGame()
        this.onAbort?.(ended)
        break
      }
      case 'backToLobby':
        // 結算後回到大廳（同一房號再來一局）：同上，只接受本機送來的；能不能回去由 returnToLobby 判斷
        if (peer !== LOCAL_PEER) return
        this.returnToLobby()
        break
      case 'Tune':
        // 只接受本機（主機分頁自己）送來的；其他 peer 一律忽略
        if (peer !== LOCAL_PEER || !ps.tune.take(this.now)) return
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
      const wasOff = existing.peer === null
      const back = wasOff && existing.droppedAt !== null
      existing.peer = peer
      existing.droppedAt = null
      ps.slot = existing.slot
      this.sendTo(peer, { t: 'welcome', slot: existing.slot, token: existing.token })
      // 對局中只把大廳名單（設定）送給回來的人，不廣播：廣播的時機本身就透露「剛才是誰回來了」
      if (this.phase === 'lobby') {
        this.lobbyDirty = true
        // 主機帶大家回到大廳（returnToLobby）的那一則，這個人可能剛好在短暫失聯中沒收到（NetClient 失聯期間的訊息會丟掉）、
        // 還停在上一局的畫面：重新打招呼時再送一次（client 已經在大廳就不做事；一局都還沒開過就不用送）
        if (this.games > 0) this.sendTo(peer, { t: 'backToLobby' })
      } else this.sendTo(peer, this.lobbyState())
      if (this.game) {
        this.game.setConnected(existing.slot, true)
        this.game.resendStart(existing.slot)
        // 斷線後在寬限時間內回來：公開說一聲（不點名；同一個連線重送 hello、換分頁接手不算）
        if (back && !this.game.ended) this.game.playerRejoined(existing.slot)
        // 超過寬限才回來（已判定離開）：私訊本人說明現在是觀戰
        else if (wasOff) this.game.playerReturnedAfterLeave(existing.slot)
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
    // 回到大廳時不在線、座位被讓出的人又連上了：他可能還停在上一局的畫面（client 已經在大廳、或是新加入的人就不做事）
    if (this.games > 0) this.sendTo(peer, { t: 'backToLobby' })
    this.lobbyDirty = true
  }

  private colorTaken(c: number, exceptSlot: number): boolean {
    return this.players.some((p) => p && p.slot !== exceptSlot && p.color === c)
  }
  private firstFreeColor(): number {
    for (let c = 0; c < PLAYER_COLORS.length; c++) if (!this.colorTaken(c, -1)) return c
    return 0
  }
  /** 大廳名字不能和別人重複：比對正規化後的寫法（大小寫、同形異字、全形、「Crew 3」＝「船員 3」），撞名就在後面加數字 */
  private uniqueName(name: string, slot: number): string {
    let n = name
    let k = 2
    const taken = (s: string) => this.players.some((p) => p && p.slot !== slot && nameSkeleton(p.name) === nameSkeleton(s))
    while (taken(n)) n = `${name}${k++}`
    return n
  }

  /**
   * 同一個人 CHAT_DUPE_S 秒內在同一個頻道送出相同的內容：壓掉並私訊提示（同一串重複只提示一次）。
   * 「-」開頭的指令不算（輸出只給自己，重查名單、狀態不會洗到別人）
   */
  private isDupeChat(peer: string, slot: number, ch: string, to: string | undefined, raw: string): boolean {
    if (this.phase === 'game' && raw.startsWith('-') && raw.length > 1) return false
    const key = `${ch}|${to ?? ''}|${raw.replace(/\s+/g, ' ').toLowerCase()}`
    const last = this.lastChat.get(slot)
    if (last && last.key === key && this.now - last.at < CHAT_DUPE_S) {
      if (!last.hinted) {
        last.hinted = true
        if (this.game) this.game.privateLine(slot, 'chat.dupe', { s: CHAT_DUPE_S })
        else this.sendTo(peer, { t: 'chat', lines: [{ from: '', color: -1, ch: 'private', text: fmtKey('chat.dupe', { s: CHAT_DUPE_S }), time: this.now }] })
      }
      return true
    }
    this.lastChat.set(slot, { key, at: this.now, hinted: false })
    return false
  }

  /** 聊天超過限流被丟掉：私訊發送者「訊息送太快了，有些沒送出」，同一個連線 CHAT_FAST_HINT_S 秒內最多一次 */
  private hintTooFast(peer: string, ps: PeerState, slot: number): void {
    if (this.now - ps.fastHintAt < CHAT_FAST_HINT_S) return
    ps.fastHintAt = this.now
    if (this.game) this.game.privateLine(slot, 'chat.tooFast')
    else this.sendTo(peer, { t: 'chat', lines: [{ from: '', color: -1, ch: 'private', text: fmtKey('chat.tooFast'), time: this.now }] })
  }

  private applySettings(s: Partial<LobbySettings>): void {
    if (s.apocalypse !== undefined) this.apoCustom = true
    Object.assign(this.settings, s)
    this.lobbyDirty = true
  }

  // ───────── 開局 ─────────

  /** practiceRole：單機練習指定的主機身分（只在練習房、而且除了主機都是 AI 時才生效）*/
  startGame(practiceRole?: PracticeRole): void {
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
    const host = roster.find((p) => p.host)
    const practice = this.code === PRACTICE_ROOM && !!host && !this.settings.hostSpectate && roster.every((p) => p.bot || p.host)
    const settings: LobbySettings = { ...this.settings }
    // 練習局的末日提前（主機明確改過就照主機的；正式局完全不變）
    if (practice && !this.apoCustom) settings.apocalypse = [...PRACTICE_APOCALYPSE]
    const init: GameInit = {
      seed: this.settings.seed || this.rng.id31(),
      secret: this.secret !== undefined ? this.secret + this.games : undefined,
      settings,
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
      forceRole: practice && practiceRole && practiceRole !== 'random' ? { slot: host!.slot, role: practiceRole } : undefined,
      practice,
    }
    this.phase = 'game'
    this.game = new Game(init)
    this.games++
    // 等連線中的真人都載入完（建場景、畫出第一個畫面）才開始推進：慢的電腦不會一進場就少掉一兩分鐘
    if (this.waitClients) {
      this.loading = new Set(roster.filter((p) => !p.bot && p.peer !== null).map((p) => p.slot))
      // 只有一位真人（單機練習）時沒有人會被拖住：等久一點，慢的電腦也能從頭開始
      this.loadDeadline = this.now + (this.loading.size <= 1 ? LOAD_WAIT_SOLO_S : LOAD_WAIT_S)
    }
    this.lobbyDirty = true
  }

  // ───────── 主機中止 ─────────

  /**
   * 本機 client 送了 abort（主機在對局中離開、關閉分頁）之後呼叫：ended = 這次有沒有結算（大廳或已結算時 false）。
   * worker 用它在結算訊息送出之後回報主執行緒（{ t: 'aborted' }），主機分頁收到就可以終止 worker、關連線
   */
  onAbort?: (ended: boolean) => void

  /** 主機中止：對局進行中就立刻結算（winner = 'aborted'、abortWhy = 'host'），公開所有身分給所有在線的人 */
  abortGame(): boolean {
    const g = this.game
    if (this.phase !== 'game' || !g || g.ended) return false
    return g.abort()
  }

  // ───────── 回到大廳（同一房號再來一局）─────────

  /** 現在能不能回到大廳：多人房、對局已經正常結算（主機中止的不行：主機接著就會關掉房間）*/
  canReturnToLobby(): boolean {
    const r = this.game?.ended
    return this.phase === 'game' && !!r && r.winner !== 'aborted' && this.code !== PRACTICE_ROOM
  }

  /**
   * 結算後回到大廳（第 6 輪：多人「再來一局」，ClientMsg backToLobby）：
   * - 丟掉上一局的模擬（Game 整個不要了，下一局開局時照常建新的：身分、世界、亂數流都是新的，不沿用上一局的任何狀態）；
   * - 同一房號，大廳設定（含 AI 數量、AI 難度、主機手動改過的末日時間）原封不動；
   * - 還連著的真人保留座位（slot 順序、顏色、名字不變），「準備」清掉；AI 玩家拿掉（下一局開局時依設定重新補位）；
   * - 不在線的真人一律讓出座位：已經判定離開的、還在斷線寬限內的都一樣。結算畫面按「回到主選單」的人在 server 看來
   *   就是斷線（傳輸層分不出主動離開還是網路斷掉），保留座位的話他會被排進下一局、拿到身分、90 秒後才被判定離開。
   *   真的只是斷線的人重新連上時照常加入大廳（拿最前面的空位），handleHello 會送 backToLobby 讓他離開上一局的畫面；
   * - 每位在線的人先收到 backToLobby（client 清掉對局狀態、回到大廳畫面），緊接著收到 lobbyState。
   * 上一局的訊息都在 backToLobby 之前送完（同一條有序的連線），之後不會再有上一局的快照、聊天或結算。
   * 練習房不用這條路（練習的「再來一局」是重開一間練習房，practiceRun.ts）。回傳有沒有回到大廳
   */
  returnToLobby(): boolean {
    if (!this.canReturnToLobby()) return false
    this.game = null
    this.phase = 'lobby'
    this.loading = null
    this.pauseAt = null
    this.lastChat.clear()
    for (const p of this.players) {
      if (!p) continue
      if (p.bot || p.peer === null) this.players[p.slot] = null
      else {
        p.ready = false
        p.droppedAt = null
      }
    }
    for (const p of this.players) if (p?.peer) this.sendTo(p.peer, { t: 'backToLobby' })
    this.lobbyDirty = false
    this.broadcastLobby(this.lobbyState())
    return true
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
      // 單機練習暫停：滿 10 分鐘、或不再是「只有 1 名真人在線的練習局」就自動繼續
      if (this.pauseAt !== null) {
        if (this.now - this.pauseAt >= PRACTICE_PAUSE_MAX_S) this.resumePause(true)
        else if (this.soloHuman() === null || this.game.ended) this.resumePause()
      }
      if (this.loading && (this.loading.size === 0 || this.now >= this.loadDeadline)) this.loading = null
      this.game.hold = this.loading ? this.loading.size : 0
      this.game.step()
    }
    if (this.lobbyDirty) {
      this.lobbyDirty = false
      this.broadcastLobby(this.lobbyState())
    }
  }

  // ───────── 單機練習暫停 ─────────

  /** 練習局裡唯一一名連線中的真人（slot）；不是練習局、沒有或不只一名真人時 null */
  private soloHuman(): number | null {
    if (!this.game?.practice) return null
    const humans = this.players.filter((p): p is LobbyPlayer => !!p && !p.bot && p.peer !== null)
    return humans.length === 1 ? humans[0].slot : null
  }

  /** client 打開遊戲選單、說明、圖鑑：只在練習局、只有 1 名真人在線、而且就是他送的時候才暫停 */
  private pauseSolo(slot: number): void {
    const g = this.game
    if (!g || g.ended || this.soloHuman() !== slot) return
    if (this.pauseAt === null) this.pauseAt = this.now
    g.menuPause = true
  }

  /** 繼續（timeout = 暫停滿 10 分鐘自動繼續：私訊本人說明）*/
  private resumePause(timeout = false): void {
    if (this.pauseAt === null) return
    this.pauseAt = null
    const g = this.game
    if (!g) return
    g.menuPause = false
    const slot = this.soloHuman()
    if (timeout && slot !== null) g.privateLine(slot, 'pause.timeout', { m: PRACTICE_PAUSE_MAX_S / 60 })
  }

  lobbyState(): HostMsg {
    const players: LobbyPlayerInfo[] = this.players
      .filter((p): p is LobbyPlayer => p !== null)
      .map((p) => ({
        slot: p.slot,
        name: p.name,
        color: p.color,
        ready: p.ready,
        // 對局中一律回報在線：大廳名單不能變成「誰斷線了」的公開管道（寬限期間的斷線公告刻意不點名）
        connected: this.phase === 'game' || p.bot || p.peer !== null,
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
      this.applySettings(args[0] as Partial<LobbySettings>)
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
