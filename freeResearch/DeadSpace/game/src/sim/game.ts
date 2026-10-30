// 一局遊戲：玩家、世界、系統排程、快照與聊天。由 GameServer 建立，跑在 Sim Worker。
import type {
  ChatChannel,
  ChatLine,
  Command,
  EndResult,
  FxEvent,
  GitReport,
  HostMsg,
  LobbySettings,
  NoteEntry,
  NoteMark,
  StartInfo,
} from '../shared/protocol/messages'
import { TICK_DT } from '../shared/constants'
import { World } from './world'
import type { Ent } from './ent'
import { setupWorld } from './setup'
import { assignRoles } from './systems/roles'
import { handleCommand } from './systems/orders'
import { stepMovement, stepDoors } from './systems/movement'
import { computeVision } from './systems/vision'
import { buildSnapshot, type ViewState, newViewState } from './systems/snapshot'
import { routeChat } from './systems/chat'
import { Tuning } from './systems/tuning'
import { stepCombat } from './systems/combat'
import { stepBuffs } from './systems/buffs'
import { stepCasting, stepAutocast } from './systems/abilities'
import { stepProjectiles, type Projectile } from './systems/projectiles'
import { stepDashes, SCRIPTS } from './systems/effects'
import { stepItemOrders } from './systems/items'
import { stepVendors } from './systems/vendors'
import { DEATH_HOOKS, damage } from './systems/damage'
import { stepLife } from './systems/death'
import type { AbilityDef } from '../shared/content/types'
import type { ItemInst } from './ent'
import { NEUTRAL } from './ent'
import { unitDef } from '../shared/content/registry'
import './scripts/index'

export type Role = 'human' | 'xeno' | 'mutant' | 'android'
export type Faction = 'crew' | 'xeno' | 'mutant'

export interface GameInit {
  seed: number
  settings: LobbySettings
  players: { slot: number; name: string; color: number; bot: boolean; connected: boolean; spectator: boolean }[]
  send: (slot: number, msg: HostMsg) => void
}

/** 每位玩家各自的資訊放寬旗標（除錯工具用；只影響本人的快照與聊天）*/
export interface ViewFlags {
  mapHack: boolean
  hear: boolean
  xray: boolean
}

export interface GamePlayer {
  slot: number
  name: string
  baseName: string
  color: number
  bot: boolean
  connected: boolean
  left: boolean
  spectator: boolean
  role: Role
  /** 被轉化成 spawn：跟隨的陣營 */
  spawnOf: 'xeno' | 'mutant' | null
  /** 仿生人被遙控器轉陣營 */
  android: boolean
  classId: string
  phd: string
  main: number
  control: number
  alive: boolean
  deadAt: number
  /** 永久死亡（不可再被復活）*/
  stayDead: boolean
  ep: number
  tier: number
  form: string
  evolvingUntil: number
  mutedUntil: number
  muteName: boolean
  notes: Map<number, NoteEntry>
  gitReports: GitReport[]
  view: ViewState
  flags: ViewFlags
  stats: { kills: number; infections: number; tests: number }
  chatOut: ChatLine[]
  fxOut: FxEvent[]
  bio: string
  hint: string
  specZone: number
  feeds: number[]
  /** 本局身分揭露是否已送出 */
  started: boolean
}

export class Game {
  readonly world: World
  readonly players: GamePlayer[] = []
  readonly settings: LobbySettings
  readonly send: GameInit['send']
  tick = 0
  hostHidden = false
  paused = false
  timeScale = 1
  private acc = 0
  ended: EndResult | null = null
  readonly timeline: { t: number; text: string }[] = []
  readonly tuning: Tuning
  /** 啟用的站 id */
  stations: string[] = []
  /** 這一 tick 要廣播的特效（依可見性過濾後送出）*/
  fx: (FxEvent & { vis?: number[] })[] = []
  /** 系統訊息佇列 */
  sysLines: { line: ChatLine; to: number[] | 'all' }[] = []
  projectiles: Projectile[] = []
  private timers: { at: number; fn: () => void }[] = []
  /** 其他系統掛上的事件 */
  onCast?: (u: Ent, ab: AbilityDef, target?: Ent) => void
  onItemGained?: (u: Ent, it: ItemInst) => void
  onItemLost?: (u: Ent, it: ItemInst) => void
  onBuy?: (u: Ent, vendor: Ent, item: string) => void
  onMorph?: (u: Ent) => void
  customHostile?: (a: Ent, b: Ent) => boolean
  /** 每 tick 額外執行的系統（AI、事件、太空…）*/
  readonly systems: { name: string; fn: (g: Game) => void }[] = []

  constructor(init: GameInit) {
    this.settings = init.settings
    this.send = init.send
    this.world = new World(init.seed)
    for (const p of init.players) {
      this.players[p.slot] = {
        slot: p.slot,
        name: p.name,
        baseName: p.name,
        color: p.color,
        bot: p.bot,
        connected: p.connected,
        left: false,
        spectator: p.spectator,
        role: 'human',
        spawnOf: null,
        android: false,
        classId: '',
        phd: '',
        main: 0,
        control: 0,
        alive: !p.spectator,
        deadAt: -1,
        stayDead: false,
        ep: 0,
        tier: 0,
        form: '',
        evolvingUntil: 0,
        mutedUntil: 0,
        muteName: false,
        notes: new Map(),
        gitReports: [],
        view: newViewState(),
        flags: { mapHack: false, hear: false, xray: false },
        stats: { kills: 0, infections: 0, tests: 0 },
        chatOut: [],
        fxOut: [],
        bio: '',
        hint: '',
        specZone: 1,
        feeds: [],
        started: false,
      }
    }
    this.tuning = new Tuning(this)
    setupWorld(this)
    assignRoles(this)
    for (const p of this.allPlayers()) this.resendStart(p.slot)
  }

  allPlayers(): GamePlayer[] {
    return this.players.filter((p): p is GamePlayer => !!p)
  }

  player(slot: number): GamePlayer | undefined {
    return this.players[slot]
  }

  faction(p: GamePlayer): Faction {
    if (p.spawnOf) return p.spawnOf
    if (p.role === 'xeno') return 'xeno'
    if (p.role === 'mutant') return 'mutant'
    return 'crew'
  }

  factionOfSlot(slot: number): Faction | null {
    const p = this.players[slot]
    return p ? this.faction(p) : null
  }

  mainOf(p: GamePlayer): Ent | undefined {
    return this.world.get(p.main)
  }

  controlOf(p: GamePlayer): Ent | undefined {
    return this.world.get(p.control) ?? this.world.get(p.main)
  }

  get time(): number {
    return this.world.time
  }

  // ───────── 連線 ─────────

  setConnected(slot: number, c: boolean): void {
    const p = this.players[slot]
    if (!p) return
    p.connected = c
    if (c) p.view = newViewState()
  }

  resendStart(slot: number): void {
    const p = this.players[slot]
    if (!p) return
    const info: StartInfo = {
      slot,
      seed: 0,
      stations: this.stations,
      zones: this.world.zones.filter((z) => z.station).map((z) => [z.id, z.key, z.station!.id] as [number, string, string]),
      players: this.allPlayers().map((q) => ({ slot: q.slot, name: q.baseName, color: q.color, bot: q.bot })),
      spectator: p.spectator,
    }
    p.view = newViewState()
    this.send(slot, { t: 'start', info })
    if (this.ended) this.send(slot, { t: 'end', result: this.ended })
  }

  playerLeft(slot: number): void {
    const p = this.players[slot]
    if (!p || p.left) return
    p.left = true
    p.connected = false
    this.systemAll('sys.left', { name: p.baseName })
    const u = this.mainOf(p)
    if (u && u.alive) {
      p.stayDead = true
      this.kill(u, null)
    }
  }

  // ───────── 輸入 ─────────

  handleCommand(slot: number, c: Command): void {
    const p = this.players[slot]
    if (!p || this.ended) return
    handleCommand(this, p, c)
  }

  handleChat(slot: number, ch: ChatChannel, text: string, to?: string): void {
    const p = this.players[slot]
    if (!p) return
    routeChat(this, p, ch, text, to)
  }

  handleVote(_slot: number, _v: string, _arg?: number): void {
    // M4：死亡模式投票、禁言投票
  }

  handleNote(slot: number, target: number, mark: NoteMark, text: string): void {
    const p = this.players[slot]
    if (!p || !this.players[target]) return
    p.notes.set(target, { slot: target, mark, text })
  }

  shareNotes(slot: number, to: number): void {
    const p = this.players[slot]
    const q = this.players[to]
    if (!p || !q || slot === to) return
    for (const n of p.notes.values()) {
      if (n.mark === 'none' && !n.text) continue
      q.notes.set(n.slot + 100 * (slot + 1), { ...n, from: slot })
    }
    this.privateLine(q.slot, 'sys.notesShared', { name: p.name })
  }

  handleTune(slot: number, id: number, op: string, args: unknown[]): void {
    const r = this.tuning.run(slot, op, args)
    this.send(slot, { t: 'TuneResult', id, ok: r.ok, msg: r.msg, data: r.data })
  }

  // ───────── 訊息 ─────────

  systemAll(key: string, args?: Record<string, string | number>): void {
    this.sysLines.push({ line: { from: '', color: -1, ch: 'sys', text: fmtKey(key, args), time: this.time }, to: 'all' })
  }

  privateLine(slot: number, key: string, args?: Record<string, string | number>): void {
    this.sysLines.push({ line: { from: '', color: -1, ch: 'private', text: fmtKey(key, args), time: this.time }, to: [slot] })
  }

  log(text: string): void {
    this.timeline.push({ t: Math.round(this.time), text })
  }

  emitFx(fx: FxEvent, vis?: number[]): void {
    this.fx.push(vis ? { ...fx, vis } : fx)
  }

  /** 改變玩家身分（測試掛勾、補位）*/
  setRole(p: GamePlayer, role: Role): void {
    p.role = role
    p.spawnOf = null
    p.bio = `bio.${p.classId}.${role}`
  }

  worldPublic(): Record<string, unknown> {
    return {
      t: Math.floor(this.time),
      st: this.world.zones.filter((z) => z.alive && z.station).map((z) => z.key),
      bg: this.hostHidden,
      pz: this.paused,
    }
  }

  epNext(p: GamePlayer): number {
    void p
    return 0
  }

  evolveOptions(p: GamePlayer): string[] {
    void p
    return []
  }

  // ───────── 生命週期 ─────────

  kill(u: Ent, killer: Ent | null): void {
    this.killEnt(u, killer, killer?.owner ?? -1)
  }

  /** 單位死亡：hooks（掉落、屍體、身分轉化、公告、勝負）→ 移除 */
  killEnt(u: Ent, killer: Ent | null, killerSlot = killer?.owner ?? -1): void {
    if (!u.alive) return
    u.alive = false
    u.hp = 0
    u.anim = 4
    u.order = null
    u.queue.length = 0
    u.path = null
    u.cast = null
    u.data.dash = undefined
    for (const h of DEATH_HOOKS) {
      try {
        h(this, u, killer, killerSlot)
      } catch (e) {
        if (__DEV__) console.error('[death hook]', e)
      }
    }
    if (u.data.keepOnDeath) return
    this.world.remove(u)
  }

  /** 主單位死亡（roles 系統會覆寫以處理 spawn 轉化與公告）*/
  onMainDeath(p: GamePlayer, u: Ent, _killer: Ent | null, _killerSlot: number): void {
    p.alive = false
    p.deadAt = this.time
    p.specZone = u.zone
    p.control = 0
    this.systemAll('death.innocent')
  }

  /** 排程：t 秒後執行 */
  after(t: number, fn: () => void): void {
    this.timers.push({ at: this.time + t, fn })
  }

  castFail(u: Ent, why: string): void {
    if (u.owner >= 0 && u.isMain) this.privateLine(u.owner, 'cast.' + why)
  }

  spawnRubble(zone: number, x: number, y: number, count: number, radius: number): void {
    const z = this.world.zones[zone]
    if (!z.nav) return
    const def = unitDef('rubble')
    for (let i = 0; i < count; i++) {
      const a = this.world.rng.range(0, Math.PI * 2)
      const r = Math.sqrt(this.world.rng.next()) * radius
      const px = x + Math.cos(a) * r
      const py = y + Math.sin(a) * r
      const idx = z.nav.idx(px, py)
      if (idx < 0 || z.nav.solid[idx] || z.nav.dyn[idx] || z.nav.doorOf[idx] >= 0) continue
      const e = this.world.spawn(def, zone, Math.floor(px) + 0.5, Math.floor(py) + 0.5, NEUTRAL)
      e.facing = a
      e.data.navIdx = idx
      z.nav.dyn[idx]++
    }
  }

  damageDoorsNear(zone: number, x: number, y: number, r: number, dmg: number): void {
    const z = this.world.zones[zone]
    if (!z.layout) return
    for (const d of z.layout.doors) {
      if ((d.x - x) ** 2 + (d.y - y) ** 2 > (r + d.width / 2) ** 2) continue
      const st = z.doors[d.index]
      if (st.broken) continue
      st.hp -= dmg
      if (st.hp <= 0) {
        st.broken = true
        st.open = true
        z.nav!.doorClosed[d.index] = 0
        this.emitFx({ k: 'doorBreak', z: zone, x: d.x, y: d.y })
      }
    }
  }

  damage(src: Ent | null, t: Ent, amount: number): number {
    return damage(this, src, t, amount)
  }

  script(name: string) {
    return SCRIPTS.get(name)
  }

  /** 由 server 以 20 Hz 呼叫；依 timeScale 推進模擬 */
  step(): void {
    if (this.paused || this.ended) {
      this.flush()
      return
    }
    this.acc += this.timeScale
    while (this.acc >= 1) {
      this.acc -= 1
      this.simTick()
    }
    this.flush()
  }

  /** 不送快照地推進一個模擬 tick（跳過時間用）*/
  stepOnce(): void {
    if (!this.ended) this.simTick()
  }

  private simTick(): void {
    const w = this.world
    w.tick++
    w.time += TICK_DT
    this.tick = w.tick
    // 排程
    if (this.timers.length) {
      const due = this.timers.filter((x) => x.at <= w.time)
      if (due.length) {
        this.timers = this.timers.filter((x) => x.at > w.time)
        for (const d of due) {
          try {
            d.fn()
          } catch (e) {
            if (__DEV__) console.error('[timer]', e)
          }
        }
      }
    }
    stepDoors(this)
    stepAutocast(this)
    stepCasting(this)
    stepItemOrders(this)
    for (const s of this.systems) {
      try {
        s.fn(this)
      } catch (e) {
        if (__DEV__) console.error('[system]', s.name, e)
      }
    }
    stepMovement(this)
    stepDashes(this, TICK_DT)
    stepBuffs(this)
    stepCombat(this)
    stepProjectiles(this)
    stepVendors(this)
    stepLife(this)
  }

  /** 每次 server tick 都送快照（暫停時也送，讓畫面維持）*/
  private flush(): void {
    const vis = computeVision(this)
    for (const p of this.allPlayers()) {
      if (p.bot || !p.connected) {
        p.chatOut.length = 0
        p.fxOut.length = 0
        continue
      }
      const snap = buildSnapshot(this, p, vis.get(p.slot)!)
      this.send(p.slot, { t: 'snap', s: snap })
    }
    // 聊天
    for (const { line, to } of this.sysLines) {
      const targets = to === 'all' ? this.allPlayers() : to.map((s) => this.players[s]).filter(Boolean)
      for (const p of targets) p.chatOut.push(line)
    }
    this.sysLines.length = 0
    for (const p of this.allPlayers()) {
      if (p.chatOut.length && p.connected && !p.bot) this.send(p.slot, { t: 'chat', lines: p.chatOut.splice(0) })
      else p.chatOut.length = 0
    }
    this.fx.length = 0
  }
}

/** 系統訊息以 key＋參數傳給 client 翻譯：`@key|k=v|k=v` */
export function fmtKey(key: string, args?: Record<string, string | number>): string {
  if (!args) return '@' + key
  return '@' + key + Object.entries(args).map(([k, v]) => `|${k}=${String(v).replace(/[|=]/g, '')}`).join('')
}
