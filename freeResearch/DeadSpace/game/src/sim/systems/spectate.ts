// 第 8 輪「第十場之後」：死者與旁觀者的三件事（只服務已經出局的人，活人的快照完全不變）。
//
// 1. 觀戰看板（PrivateState.spec）：每個存活地點的活人數、最近一次交戰、最近的死亡。server 每秒算一次，
//    只放進「看得到全場」的死者／旁觀者的私有狀態（seesBoard）。死者本來就能切到任何一站看整個 zone，
//    看板只是把他們切站就看得到的東西整理好：
//    - 活人數不算隱形中、躲在逃生艙裡的人（死者在 zone 裡也看不到他們，vision.ts）；
//    - 交戰只算死者看得到的特效（隱形攻擊者的特效不算，和 snapshot.ts 的過濾一致；私人特效不算）；
//    - 死亡只帶全場公告過的資訊（名字＋公告的身分，roleSystem.ts announceDeath），地點是死者切站就看得到的屍體位置。
//    遺言時間內（剛死、活人還聽得到他說話的 4 秒）不給看板，免得剛死的人把整理好的情報喊給活人。
// 2. 亡靈預言（PrivateState.proph、EndResult.prophecies）：死者私下預言勝方（可選主腦是誰），最多改一次；
//    只存在 server、只回給預言者本人，結算時才公開。活人永遠收不到。
// 3. 亡者之眼（settings.ghostSight，預設關）：死後過了所有復活窗口（GHOST_DELAY）才開啟，開啟的同時永久不能再被
//    喚回（stayDead：急救、異形的時滯喚回都要求 !stayDead），所以看過真實身分的人不可能回到活人那邊；
//    蛞蝓仔附身（死者唯一能碰到活人的管道）在這個模式整局停用（chat.ts）。實際的「看得見」在 vision.ts ghostSees。
import { shownName, type Game, type GamePlayer } from '../game'
import type { FxEvent, PrivateState, ProphecyResult, ProphecyView, ProphecyWin, Snapshot, SpecBoard, SpecDeath, SpecRow } from '../../shared/protocol/messages'
import { SPACE_ZONE } from '../world'
import { inLastWords } from './chat'
import { ghostSees } from './vision'

/**
 * 亡者之眼在死後幾秒開啟：要晚於所有能把人救回來的窗口——急救（scripts/items.ts REVIVE_WINDOW = 45 秒，以屍體出生時刻起算）
 * 與遺言（chat.ts LAST_WORDS = 4 秒）。不從 scripts/items.ts import（那邊會註冊一大堆腳本），由單元測試確認大小關係
 */
export const GHOST_DELAY = 46
/** 看板多久重算一次（tick）：活人數、熱度衰減；有人死亡時立刻重算 */
const BOARD_TICKS = 20
/** 交戰熱度的衰減時間常數（秒）*/
const HEAT_TAU = 8
/** 看板保留的最近死亡筆數 */
const DEATHS_KEPT = 12
/** 亡靈預言最多改幾次（第一次預言之後）*/
export const PROPHECY_CHANGES = 1

/** 算「交戰」的特效（和 client 的戰鬥跟隨同一組；die 不算：玩家死亡另外記，生物死亡前一定先有攻擊）*/
const COMBAT_FX: ReadonlySet<string> = new Set(['atk', 'proj', 'beam', 'boom', 'blast', 'devour', 'swarmbolt', 'cannonFire', 'stationBoom'])
/** 本身就是重大戰鬥的特效（爆炸、主砲、吞噬、站體爆炸）：沒有攻擊者／目標也算有玩家參與 */
const BIG_FX: ReadonlySet<string> = new Set(['boom', 'blast', 'devour', 'cannonFire', 'stationBoom'])

interface ZoneHeat {
  heat: number
  /** heat 上次衰減到的時刻 */
  at: number
  /** 最近一次「有玩家參與」的交戰時刻（-1 = 沒有）*/
  combat: number
  /** 交戰焦點（最近一次有玩家參與的交戰位置；還沒有時是最近任何一次事件的位置）*/
  hx: number
  hy: number
}

interface Proph {
  win: ProphecyWin
  mind: number
  /** 最後一次預言（含改）的時刻 */
  t: number
  changes: number
}

interface SpecState {
  heat: Map<number, ZoneHeat>
  deaths: SpecDeath[]
  /** slot → 已經記過的那次死亡（deadAt）*/
  seen: Map<number, number>
  board: SpecBoard | null
  /** board 的 JSON（每位觀看者每個 tick 都要比對有沒有變，同一份看板只序列化一次）*/
  boardJson: string
  boardTick: number
}

function stateOf(g: Game): SpecState {
  return ((g.data.spec8 as SpecState | undefined) ??= { heat: new Map(), deaths: [], seen: new Map(), board: null, boardJson: '', boardTick: -1 })
}

/**
 * 看得到全場的死者／旁觀者（和 vision.ts 的旁觀分支一致）：不是活人、沒有出局、不是等記憶核心復活的仿生人
 * （他只能透過核心看）。剛死、還在遺言時間內的不算（見檔頭）
 */
export function seesBoard(g: Game, p: GamePlayer): boolean {
  if (p.alive && !p.spectator) return false
  if (p.data.booted) return false
  if (p.data.coreOnly && !p.stayDead) return false
  return !inLastWords(g, p)
}

/** 公告的死者身分（必須和 roleSystem.ts announceDeath 一致：只帶全場公告過的東西；單元測試比對公告的 key）*/
export function deathKind(p: GamePlayer): string {
  if (p.role === 'mutant' && !p.spawnOf) return 'mutant'
  if (p.role === 'xeno' && !p.spawnOf) return 'xeno'
  if (p.role === 'android') return 'android'
  if (p.spawnOf === 'xeno') return 'xenoSpawn'
  if (p.spawnOf === 'mutant') return 'mutantSpawn'
  return 'innocent'
}

function decay(h: ZoneHeat, t: number): void {
  if (t > h.at) {
    h.heat *= Math.exp(-(t - h.at) / HEAT_TAU)
    h.at = t
  }
}

function noteFx(g: Game, st: SpecState, f: FxEvent & { vis?: number[] }): void {
  if (!COMBAT_FX.has(f.k) || f.vis) return
  if (f.k === 'beam' && f.s === 'heal') return
  const src = f.e ? g.world.get(f.e) : undefined
  // 隱形的攻擊者：死者在 zone 裡也看不到它的攻擊特效（snapshot.ts 同樣的過濾）
  if (src && src.alive && src.stats.stealth) return
  const tgt = f.e2 ? g.world.get(f.e2) : undefined
  const struct = !!tgt && tgt.tags.has('structure') && f.z !== SPACE_ZONE
  const players = BIG_FX.has(f.k) || (!!src && src.owner >= 0) || (!!tgt && tgt.owner >= 0)
  const t = g.time
  let h = st.heat.get(f.z)
  if (!h) st.heat.set(f.z, (h = { heat: 0, at: t, combat: -1, hx: f.x, hy: f.y }))
  decay(h, t)
  // 打雜物箱、設施只算一點熱度；生物之間（砲塔打蛞蝓）算少一點；有玩家參與的才是「交戰中」
  h.heat = Math.min(200, h.heat + (struct ? 0.25 : players ? 1 : 0.3))
  const mid = f.k === 'atk' && f.x2 !== undefined && f.y2 !== undefined
  const x = mid ? (f.x + f.x2!) / 2 : f.x
  const y = mid ? (f.y + f.y2!) / 2 : f.y
  if (players && !struct) {
    h.combat = t
    h.hx = x
    h.hy = y
  } else if (h.combat < 0 || t - h.combat > 10) {
    h.hx = x
    h.hy = y
  }
}

function buildBoard(g: Game, st: SpecState): SpecBoard {
  const living = new Map<number, number>()
  for (const p of g.allPlayers()) {
    if (!p.alive || p.spectator) continue
    const u = g.mainOf(p)
    // 隱形中、躲在逃生艙裡的人：死者在 zone 裡也看不到（vision.ts），不算進人數
    if (!u || !u.alive || u.data.inPod || u.stats.stealth) continue
    living.set(u.zone, (living.get(u.zone) ?? 0) + 1)
  }
  const t = g.time
  const ids = [SPACE_ZONE, ...g.world.zones.filter((z) => z.alive && z.station).map((z) => z.id)]
  const rows: SpecRow[] = ids.map((id) => {
    const h = st.heat.get(id)
    if (h) decay(h, t)
    const heat = h ? Math.min(99, Math.round(h.heat)) : 0
    return [id, living.get(id) ?? 0, h && h.combat >= 0 ? Math.floor(h.combat) : -1, heat, h ? Math.round(h.hx) : 0, h ? Math.round(h.hy) : 0]
  })
  return { z: rows, d: st.deaths.slice() }
}

/**
 * 每次 flush（送快照之前）呼叫：記下這段時間的交戰特效與玩家死亡、開啟亡者之眼、復活的人的預言作廢、需要時重算看板。
 * 不用任何亂數、不改任何活人看得到的狀態（亡者之眼只設死者自己的 stayDead）
 */
export function stepSpectate(g: Game): void {
  const st = stateOf(g)
  for (const f of g.fx) noteFx(g, st, f)
  let dirty = false
  for (const p of g.allPlayers()) {
    if (p.spectator) continue
    if (p.alive) {
      // 復活了：預言屬於亡者，作廢（再死一次可以重新預言）
      if (p.data.proph) delete p.data.proph
      continue
    }
    if (p.deadAt >= 0 && st.seen.get(p.slot) !== p.deadAt) {
      st.seen.set(p.slot, p.deadAt)
      // 地點：死亡時 onMainDeath 把觀戰 zone 設成死亡地點（同一個 tick，玩家還來不及切站）
      // 名字：別人眼中此刻的名字（和死亡公告同一個；通訊病毒清空名字的那幾秒用記下的頭銜補上）
      st.deaths.unshift([p.specZone, Math.floor(p.deadAt), shownName(p), deathKind(p)])
      if (st.deaths.length > DEATHS_KEPT) st.deaths.length = DEATHS_KEPT
      dirty = true
    }
    if (g.settings.ghostSight && !p.data.ghostEye && eyeReady(g, p)) {
      // 看過真實身分的人永遠不能再回到活人那邊（急救、時滯喚回都要求 !stayDead）
      p.stayDead = true
      p.data.ghostEye = true
      g.privateLine(p.slot, 'ghost8.eye.open')
    }
  }
  if (dirty || !st.board || g.world.tick - st.boardTick >= BOARD_TICKS) {
    st.board = buildBoard(g, st)
    st.boardJson = JSON.stringify(st.board)
    st.boardTick = g.world.tick
  }
}

/** 亡者之眼可以開了：死透了（不是等記憶核心的仿生人、沒出局）而且過了所有復活窗口 */
function eyeReady(g: Game, p: GamePlayer): boolean {
  if (p.alive || p.spectator || p.data.booted || p.deadAt < 0) return false
  if (p.data.coreOnly && !p.stayDead) return false
  return g.time - p.deadAt >= GHOST_DELAY
}

/** 亡者之眼的狀態（只給看得到看板的死者／旁觀者）：0 = 已開啟；正數 = 還要幾秒；undefined = 不適用 */
function ghostIn(g: Game, p: GamePlayer): number | undefined {
  if (!g.settings.ghostSight) return undefined
  if (ghostSees(g, p)) return 0
  if (p.spectator || p.deadAt < 0) return undefined
  return Math.max(1, Math.ceil(p.deadAt + GHOST_DELAY - g.time))
}

/** 能不能預言：看得到全場的死者或旁觀者（沒出局、不在遺言時間、不是等核心復活的仿生人）*/
export function canProphesy(g: Game, p: GamePlayer): boolean {
  return !g.ended && seesBoard(g, p)
}

/**
 * 亡靈預言（ClientMsg prophecy）：win = 預言的勝方，mind = 預言誰是主腦（異形或變種人的原始主腦；可省略）。
 * 第一次之後最多改 PROPHECY_CHANGES 次；完全相同的預言不算改。只回私訊給本人
 */
export function prophesy(g: Game, p: GamePlayer, win: ProphecyWin, mind?: number): void {
  if (!canProphesy(g, p)) return
  const cur = p.data.proph as Proph | undefined
  // 亡者之眼已經睜開：主腦是誰一看就知道，不能再猜（睜眼之前猜的照算；之後只能改押勝方）
  const m = ghostSees(g, p) ? (cur?.mind ?? -1) : (mind ?? -1)
  if (m >= 0 && m !== cur?.mind) {
    // 名單上的任何其他人都可以猜（client 分不出誰是只主持的主機：猜他就是猜錯）
    const q = g.players[m]
    if (!q || q.slot === p.slot) return
  }
  if (cur) {
    if (cur.win === win && cur.mind === m) return
    if (cur.changes >= PROPHECY_CHANGES) {
      g.privateLine(p.slot, 'ghost8.proph.locked')
      return
    }
    cur.win = win
    cur.mind = m
    cur.t = g.time
    cur.changes++
    g.privateLine(p.slot, 'ghost8.proph.changed')
    return
  }
  p.data.proph = { win, mind: m, t: g.time, changes: 0 } satisfies Proph
  g.privateLine(p.slot, 'ghost8.proph.sealed')
}

/** 結算時公開的預言（每位有預言的人一筆；主機中止、平手時沒有人猜中）*/
export function prophecyResults(g: Game, winner: string): ProphecyResult[] {
  const out: ProphecyResult[] = []
  for (const p of g.allPlayers()) {
    const pr = p.data.proph as Proph | undefined
    if (!pr) continue
    const r: ProphecyResult = { slot: p.slot, win: pr.win, t: Math.round(pr.t), changed: pr.changes > 0, ok: pr.win === winner }
    if (pr.mind >= 0) {
      const q = g.players[pr.mind]
      const role = (q?.data.leftRole as string | undefined) ?? q?.role
      r.mind = pr.mind
      r.mindOk = role === 'xeno' || role === 'mutant'
    }
    out.push(r)
  }
  return out
}

/**
 * 把死者／旁觀者專屬的欄位加進這位觀看者的快照（me.spec、me.proph、me.ghost）；活人什麼都不加。
 * 和 snapshot.ts 的私有狀態一樣只送有變動的欄位（共用 ViewState.me 的去重表，重新連線時一起清掉）
 */
export function specSnap(g: Game, p: GamePlayer, snap: Snapshot): void {
  if (!seesBoard(g, p)) return
  const st = stateOf(g)
  const v = p.view
  if (st.board && v.me.get('spec') !== st.boardJson) {
    v.me.set('spec', st.boardJson)
    ;(snap.me ??= {}).spec = st.board
  }
  const pr = p.data.proph as Proph | undefined
  const view: ProphecyView | null = pr ? { win: pr.win, mind: pr.mind, t: Math.round(pr.t), left: PROPHECY_CHANGES - pr.changes } : null
  const extra: Partial<PrivateState> = { proph: view }
  const gi = ghostIn(g, p)
  if (gi !== undefined) extra.ghost = gi
  for (const [k, val] of Object.entries(extra)) {
    const j = JSON.stringify(val)
    if (v.me.get(k) === j) continue
    v.me.set(k, j)
    ;((snap.me ??= {}) as Record<string, unknown>)[k] = val
  }
}
