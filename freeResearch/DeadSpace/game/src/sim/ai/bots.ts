// AI bots（M9）：填人數、練習模式、headless 對局測試。
// 只透過 handleCommand 下指令（和真人走同一條驗證路徑），只用自己的視野（p.view.visible）挑目標。
// 人類：買防護服（各有各的習慣：有人一直穿、有人在宿舍休息時脫下、有人拖到後期才穿）、驗血並在全體頻道公布結果、
// 遇到怪物開火、受傷逃跑；異類：落單時感染、湊夠 EP 就躲起來進化、變身後獵殺。
// AI 不會主動登船或駕駛；誤上船、誤站上控制台時會自己離開。
import type { Command } from '../../shared/protocol/messages'
import { abilityDef, itemDef } from '../../shared/content/registry'
import { roomAt } from '../../shared/layout'
import { sampleListArgs } from '../../shared/sysArgs'
import { HOSTILE, dist2, type Ent } from '../ent'
import { fmtKey, type Game, type GamePlayer } from '../game'
import { handleCommand } from '../systems/orders'
import { cdReady } from '../systems/abilities'
import { VENDOR_RANGE, type StockState } from '../systems/vendors'
import { consolePos, spaceOf } from '../systems/space'

interface Brain {
  next: number
  goal: Goal | null
  /** 這台檢測器已抽過的目標 */
  drawn: Set<number>
  /** 不能再試的目標（指令失敗）*/
  skip: Map<number, number>
  evolveAt: number
  /** 驗血「有感染」名單上的人（抽血時看到的名字）→ 出現在幾份有感染的報告裡 */
  suspects: Map<string, number>
  /** 出現在乾淨報告裡的名字 */
  cleared: Set<string>
  /** 這台檢測器已抽過的人（抽血時看到的名字）*/
  drawnNames: Set<string>
  /** 已經處理過幾份自己的驗血報告 */
  reported: number
  /** 已經取過報告的解析器（每台只取一次：庫存補到 3 份、每 30 秒補貨，一直取會一直公告同一份結果）*/
  boughtFrom: Set<number>
  /** 已經公布過的「結果＋名單」：同一份結果不再公告、也不再重複累加嫌疑 */
  seenReports: Set<string>
  /** 已經公開指認的對象（名字）*/
  accused: string
  /** 最近一次察覺威脅（看到玩家的怪物形態、被攻擊）的時間 */
  alarmAt: number
  /** 上次穿脫防護服的時間（避免來回切換）*/
  suitAt: number
}

/**
 * 防護服習慣：always = 一拿到就穿、永不脫；casual = 平常穿著，在宿舍、販賣區等休息處且沒有威脅時脫下；
 * late = 拖到中後期（或察覺威脅）才穿。讓練習模式裡也有沒穿防護服的人，寄生與朊毒才練得到。
 */
type SuitPlan = 'always' | 'casual' | 'late'

type Goal =
  | { k: 'buy'; vendor: number; item: string; until: number }
  | { k: 'goto'; x: number; y: number; until: number }
  | { k: 'hunt'; e: number; until: number }
  | { k: 'flee'; x: number; y: number; until: number }
  | { k: 'cast'; a: string; e: number; until: number; slot?: number }
  | { k: 'results'; vendor: number; until: number }

const SUIT_VENDORS = new Set(['suitA', 'suitB', 'suitC', 'suitD'])

function brainOf(g: Game, p: GamePlayer): Brain {
  return (p.data.brain ??= {
    next: g.time + g.world.rng.range(1, 3),
    goal: null,
    drawn: new Set(),
    skip: new Map(),
    evolveAt: 0,
    suspects: new Map(),
    cleared: new Set(),
    drawnNames: new Set(),
    reported: 0,
    boughtFrom: new Set(),
    seenReports: new Set(),
    accused: '',
    alarmAt: -1e9,
    suitAt: -1e9,
  }) as Brain
}

/**
 * 每位人類 AI 的防護服習慣：第一次需要時一次分配給當下所有人類方 AI（用 sim 的 rng，可重現）。
 * 洗牌後依序給 late、casual、always，其餘隨機——只要有人類 AI，就至少有一個晚穿的。
 */
function suitPlanOf(g: Game, p: GamePlayer): SuitPlan {
  const plans = (g.data.botSuitPlans ??= assignSuitPlans(g)) as Map<number, SuitPlan>
  return plans.get(p.slot) ?? 'always'
}

function assignSuitPlans(g: Game): Map<number, SuitPlan> {
  const rng = g.world.rng
  const crew = g.allPlayers().filter((q) => q.bot && !q.spectator && g.faction(q) === 'crew')
  for (let i = crew.length - 1; i > 0; i--) {
    const j = rng.int(0, i)
    ;[crew[i], crew[j]] = [crew[j], crew[i]]
  }
  const out = new Map<number, SuitPlan>()
  const base: SuitPlan[] = ['late', 'casual', 'always']
  crew.forEach((q, i) => {
    const plan = i < base.length ? base[i] : rng.pick(base)
    out.set(q.slot, plan)
    // 晚穿的人在 9–15 分鐘之間才去穿
    if (plan === 'late') q.data.botSuitLateAt = rng.range(540, 900)
  })
  return out
}

/** 休息處：宿舍、販賣區、交誼廳、醫療室 */
const REST_ROOMS = new Set(['quarters', 'commissary', 'lounge', 'medbay'])

function resting(g: Game, u: Ent): boolean {
  const l = g.world.zones[u.zone]?.layout
  const r = l ? roomAt(l, u.x, u.y) : null
  return !!r && REST_ROOMS.has(r.spec.type)
}

function cmd(g: Game, p: GamePlayer, c: Command): void {
  handleCommand(g, p, c)
}

function visibleEnts(g: Game, p: GamePlayer, u: Ent, r: number): Ent[] {
  const out: Ent[] = []
  for (const e of g.world.query(u.zone, u.x, u.y, r)) if (e !== u && e.alive && p.view.visible.has(e.id)) out.push(e)
  return out
}

function nearest(u: Ent, list: Ent[]): Ent | null {
  let best: Ent | null = null
  for (const e of list) if (!best || dist2(u, e) < dist2(u, best)) best = e
  return best
}

const looksHuman = (e: Ent) => e.tags.has('personnel') || e.tags.has('suit')

/** 這個單位對 bot 而言是「敵人」嗎（只看得到外觀：人類 bot 不知道誰是異類）*/
function isFoe(g: Game, p: GamePlayer, e: Ent): boolean {
  if (e.owner === HOSTILE) return !e.tags.has('noTarget')
  if (e.owner < 0 || e.owner === p.slot) return false
  const f = g.faction(p)
  // 打不死的東西（執行長的機器管家等）不算威脅
  if (e.tags.has('invuln') || e.tags.has('butler')) return false
  if (f === 'crew') return !looksHuman(e) && !e.tags.has('structure') && !e.tags.has('ship') && !e.tags.has('station') && !e.tags.has('drone') && !e.tags.has('corpse')
  // 異類：同陣營不打
  const o = g.players[e.owner]
  return !!o && g.faction(o) !== f && !e.tags.has('structure') && !e.tags.has('corpse')
}

function itemSlot(u: Ent, id: string): number {
  return u.inv ? u.inv.findIndex((x) => x?.id === id) : -1
}

function vendorWith(g: Game, p: GamePlayer, u: Ent, pred: (ref: string, s: StockState) => boolean): { v: Ent; item: string } | null {
  let best: { v: Ent; item: string } | null = null
  let bd = Infinity
  for (const v of g.world.inZone(u.zone)) {
    if (!v.alive || !v.data.vendor || !v.data.stock) continue
    for (const s of v.data.stock as StockState[]) {
      if (s.count <= 0 || g.time < s.availAt || !pred(v.data.vendor as string, s)) continue
      const d = dist2(u, v)
      if (d < bd) {
        bd = d
        best = { v, item: s.item }
      }
    }
  }
  void p
  return best
}

function randomRoomPoint(g: Game, u: Ent, types?: Set<string>): { x: number; y: number } | null {
  const z = g.world.zones[u.zone]
  const all = z.layout?.rooms ?? []
  const pref = types ? all.filter((r) => types.has(r.spec.type)) : all
  const rooms = pref.length ? pref : all
  if (!rooms.length || !z.nav) return null
  const r = g.world.rng.pick(rooms)
  return z.nav.nearestOpen(r.cx + g.world.rng.range(-1.5, 1.5), r.cy + g.world.rng.range(-1.5, 1.5))
}

// ───────── 目標執行 ─────────

function pursue(g: Game, p: GamePlayer, u: Ent, b: Brain): boolean {
  const goal = b.goal
  if (!goal) return false
  if (g.time > goal.until) {
    b.goal = null
    return false
  }
  switch (goal.k) {
    case 'buy':
    case 'results': {
      const v = g.world.get(goal.vendor)
      if (!v || !v.alive || v.zone !== u.zone) return (b.goal = null), false
      const r = VENDOR_RANGE + v.radius - 0.3
      if (dist2(u, v) > r * r) {
        if (u.order?.k !== 'move') cmd(g, p, { k: 'move', x: v.x, y: v.y })
        return true
      }
      cmd(g, p, { k: 'buy', e: v.id, a: goal.k === 'buy' ? goal.item : 'testResults' })
      if (goal.k === 'results') b.boughtFrom.add(v.id)
      b.goal = null
      return true
    }
    case 'goto':
    case 'flee': {
      if (Math.hypot(u.x - goal.x, u.y - goal.y) < 1.2) return (b.goal = null), false
      if (!u.order || u.order.k !== 'move') cmd(g, p, { k: 'move', x: goal.x, y: goal.y })
      return true
    }
    case 'hunt': {
      const t = g.world.get(goal.e)
      if (!t || !t.alive || t.zone !== u.zone || !p.view.visible.has(t.id)) return (b.goal = null), false
      if (u.order?.k !== 'attack' || u.order.e !== t.id) cmd(g, p, { k: 'attack', e: t.id })
      return true
    }
    case 'cast': {
      const t = g.world.get(goal.e)
      if (!t || !t.alive || t.zone !== u.zone || !p.view.visible.has(t.id)) return (b.goal = null), false
      if (u.cast) return true
      const ab = abilityDef(goal.slot !== undefined ? (itemDef(u.inv?.[goal.slot]?.id ?? '')?.use ?? '') : goal.a)
      const range = (ab?.range ?? 1.4) + u.radius + t.radius - 0.2
      if (dist2(u, t) > range * range) {
        if (u.order?.k !== 'follow' || u.order.e !== t.id) cmd(g, p, { k: 'follow', e: t.id })
        return true
      }
      if (goal.slot !== undefined) cmd(g, p, { k: 'use', s: goal.slot, e: t.id })
      else cmd(g, p, { k: 'cast', a: goal.a, e: t.id })
      b.skip.set(t.id, g.time + 20)
      b.goal = null
      return true
    }
  }
}

// ───────── 決策 ─────────

function thinkCrew(g: Game, p: GamePlayer, u: Ent, b: Brain): void {
  const near = visibleEnts(g, p, u, 10)
  // 察覺威脅：看到玩家的怪物形態，或剛被攻擊
  if (near.some((e) => e.owner >= 0 && (isFoe(g, p, e) || e.tags.has('mutantForm'))) || g.time - u.lastDamageTime < 3) b.alarmAt = g.time
  // 受傷過重：逃
  if (u.hp < u.maxHp * 0.3 && g.time - u.lastDamageTime < 4) {
    const kit = ['traumaKit', 'mediSwarm'].map((id) => itemSlot(u, id)).find((s) => s >= 0)
    if (kit !== undefined && kit >= 0) cmd(g, p, { k: 'use', s: kit })
    const pt = randomRoomPoint(g, u)
    if (pt) b.goal = { k: 'flee', ...pt, until: g.time + 8 }
    return
  }
  // 反擊／看到怪物
  const attacker = g.world.get(u.lastHitBy)
  if (attacker && attacker.alive && g.time - u.lastDamageTime < 3 && p.view.visible.has(attacker.id) && attacker.zone === u.zone && attacker.owner !== p.slot) {
    b.goal = { k: 'hunt', e: attacker.id, until: g.time + 10 }
    return
  }
  const foe = nearest(u, near.filter((e) => isFoe(g, p, e)))
  if (foe && u.def.attack) {
    b.goal = { k: 'hunt', e: foe.id, until: g.time + 10 }
    return
  }
  // 驗血指認出來的人：看到就開火
  if (b.accused && u.def.attack) {
    const t = near.find((e) => e.isMain && e.owner >= 0 && e.owner !== p.slot && seenName(g, e) === b.accused)
    if (t) {
      b.goal = { k: 'hunt', e: t.id, until: g.time + 10 }
      return
    }
  }
  // 驗血
  const res = itemSlot(u, 'gitResolver')
  if (res >= 0) {
    cmd(g, p, { k: 'use', s: res, x: u.x + 0.8, y: u.y })
    return
  }
  const mine = g.world
    .inZone(u.zone)
    .find((e) => e.alive && e.data.vendor === 'gitResolver' && e.owner === p.slot && !b.boughtFrom.has(e.id) && p.view.visible.has(e.id))
  if (mine && ((mine.data.stock as StockState[] | undefined)?.some((s) => s.count > 0 && g.time >= s.availAt) ?? false)) {
    b.goal = { k: 'results', vendor: mine.id, until: g.time + 20 }
    return
  }
  const sampler = itemSlot(u, 'geneSampler')
  if (sampler >= 0) {
    // 只用看得到的外觀判斷（全像分身看起來就是本人；同名的人只抽一次），不用 isMain／真正的擁有者這類隱藏資訊
    const cand = near.filter(
      (e) => (e.isMain || !!e.data.looksMain) && e.owner >= 0 && looksHuman(e) && !b.drawnNames.has(seenName(g, e)) && (b.skip.get(e.id) ?? 0) < g.time,
    )
    const who = nearest(u, narrowSuspects(g, b, cand))
    const self = !b.drawn.has(p.slot) ? u : null
    const t = who ?? self
    if (t) {
      b.drawn.add(t.owner)
      b.drawnNames.add(seenName(g, t))
      b.goal = { k: 'cast', a: 'ab.item.geneSampler', e: t.id, slot: sampler, until: g.time + 15 }
      return
    }
  } else if (g.time > 420 && (!p.data.botTested || (p.data.botRetest && !b.accused && g.time >= (p.data.botRetestAt as number)))) {
    const v = vendorWith(g, p, u, (_ref, s) => s.item === 'geneSampler')
    if (v) {
      b.drawn.clear()
      b.drawnNames.clear()
      if (p.data.botTested) p.data.botRetest = false
      p.data.botTested = true
      b.goal = { k: 'buy', vendor: v.v.id, item: v.item, until: g.time + 30 }
      return
    }
  }
  // 防護服（依各自的習慣）
  const plan = suitPlanOf(g, p)
  const calm = g.time - b.alarmAt > 60 && u.hp >= u.maxHp * 0.6
  if (u.suit) {
    // 平常穿著的人：在休息處、沒有威脅時脫下來喘口氣
    if (plan === 'casual' && calm && resting(g, u) && g.time - b.suitAt > 20 && u.abilities.includes('suit.drop')) {
      b.suitAt = g.time
      cmd(g, p, { k: 'cast', a: 'suit.drop' })
      return
    }
  } else if (u.tags.has('personnel')) {
    const wantSuit =
      plan === 'always' ||
      (plan === 'casual' && (!calm || !resting(g, u))) ||
      (plan === 'late' && (g.time >= ((p.data.botSuitLateAt as number | undefined) ?? 0) || g.time - b.alarmAt < 30))
    if (wantSuit) {
      const have = u.inv?.findIndex((x) => !!x && !!itemDef(x.id)?.suit) ?? -1
      if (have >= 0 && (g.time - b.suitAt > 8 || !calm)) {
        b.suitAt = g.time
        cmd(g, p, { k: 'use', s: have })
        return
      }
      if (have < 0 && !p.data.botSuitTried) {
        const v = vendorWith(g, p, u, (ref) => SUIT_VENDORS.has(ref))
        if (v) {
          p.data.botSuitTried = true
          b.goal = { k: 'buy', vendor: v.v.id, item: v.item, until: g.time + 40 }
          return
        }
      }
    }
  }
  wander(g, p, u, b, plan === 'casual' ? REST_ROOMS : undefined)
}

/** 抽血時看到的名字（git.ts 的 shownName 同一套規則：偽裝就是偽裝對象，匿名形態沒有名字）*/
function seenName(g: Game, e: Ent): string {
  const fake = e.data.fake as { owner: number; name: string } | undefined
  if (fake) return fake.owner >= 0 ? (g.players[fake.owner]?.name ?? fake.name) : ''
  if (e.anon) return ''
  return g.players[e.owner]?.name || e.name
}

/**
 * 讀自己新拿到的驗血報告：在全體頻道公布結果（系統 key＋參數，client 依語言顯示），
 * 有感染時把名單上的其他人記為嫌疑；只剩一個最可疑的人就公開指認、看到就開火。
 */
function readReports(g: Game, p: GamePlayer, b: Brain): void {
  const reports = p.gitReports
  while (b.reported < reports.length) {
    const r = reports[b.reported++]
    const names = r.names.filter((n) => !!n)
    if (!names.length) continue
    const key = r.result + ':' + [...names].sort().join('|')
    if (b.seenReports.has(key)) continue
    b.seenReports.add(key)
    // 名單兩種語言都送（匿名形態依語言換成形態名）
    const list = sampleListArgs(names)
    if (r.result === 'clean') {
      for (const n of names) {
        b.cleared.add(n)
        b.suspects.delete(n)
      }
      say(g, p, 'play1.bot.gitClean', list)
    } else if (r.result === 'infected') {
      for (const n of names) if (n !== p.name && !b.cleared.has(n)) b.suspects.set(n, (b.suspects.get(n) ?? 0) + 1)
      say(g, p, 'play1.bot.gitInfected', list)
      // 還認不出是誰：之後再驗一次縮小範圍
      if (!topSuspect(b) && !p.data.botRetestDone) {
        p.data.botRetest = true
        p.data.botRetestDone = true
        p.data.botRetestAt = g.time + 20
      }
    } else {
      // 錯誤、離線也照樣說出來：只有部分結果會公布的話，「沒說話」本身就是線索
      say(g, p, r.result === 'error' ? 'play1.bot.gitError' : 'play1.bot.gitOffline', list)
      continue
    }
    const top = topSuspect(b)
    if (top && top !== b.accused) {
      b.accused = top
      say(g, p, 'play1.bot.accuse', { name: top })
    }
  }
}

/** 複驗時縮小範圍：一份樣本只放一名嫌疑人（先挑嫌疑人，抽到一個之後就避開其他嫌疑人）*/
function narrowSuspects(g: Game, b: Brain, cand: Ent[]): Ent[] {
  const sus = (e: Ent) => (b.suspects.get(seenName(g, e)) ?? 0) > 0 && !b.cleared.has(seenName(g, e))
  if (!b.suspects.size) return cand
  const haveOne = [...b.drawnNames].some((n) => (b.suspects.get(n) ?? 0) > 0)
  const pick = haveOne ? cand.filter((e) => !sus(e)) : cand.filter(sus)
  return pick.length ? pick : haveOne ? [] : cand
}

/** 唯一最可疑的人（出現在最多份有感染報告裡、且沒有並列）*/
function topSuspect(b: Brain): string {
  let best = ''
  let bestN = 0
  let tie = false
  for (const [n, c] of b.suspects) {
    if (b.cleared.has(n)) continue
    if (c > bestN) {
      best = n
      bestN = c
      tie = false
    } else if (c === bestN) tie = true
  }
  return bestN > 0 && !tie ? best : ''
}

/** AI 在全體頻道說話：走一般的聊天路由（名字、偽裝、只限同站等規則照舊），內容是 i18n 的系統 key */
function say(g: Game, p: GamePlayer, key: string, args: Record<string, string | number>): void {
  g.handleChat(p.slot, 'all', fmtKey(key, args))
}

function thinkEvil(g: Game, p: GamePlayer, u: Ent, b: Brain): void {
  const near = visibleEnts(g, p, u, 12)
  const crew = near.filter((e) => e.isMain && e.owner >= 0 && g.faction(g.players[e.owner]!) === 'crew' && looksHuman(e))
  const close = crew.filter((e) => dist2(e, u) < 8 * 8)
  const humanForm = looksHuman(u)
  const ready = (a: string) => {
    const ab = abilityDef(a)
    return !!ab && u.abilities.includes(a) && cdReady(g, u, ab) && (ab.mana ?? 0) <= u.mp
  }
  // 進化：EP 夠、附近沒有人類
  const opts = g.evolveOptions(p)
  if (opts.length && !crew.some((e) => dist2(e, u) < 12 * 12) && g.time >= b.evolveAt && u.zone !== 0) {
    b.evolveAt = g.time + 30
    cmd(g, p, { k: 'evolve', a: g.world.rng.pick(opts) })
    return
  }
  // 變種人：吞小動物累積 EP（人形與怪物形態都可以）
  if (ready('mut.devour')) {
    const food = nearest(u, near.filter((e) => !!e.def.devourEp && e.owner < 0 && e.alive && !e.isMain))
    if (food && !close.length) {
      b.goal = { k: 'cast', a: 'mut.devour', e: food.id, until: g.time + 10 }
      return
    }
  }
  const infect = ['xeno.parasite', 'mut.prion3', 'mut.prion2', 'mut.prion'].find((a) => ready(a))
  if (humanForm) {
    // 落單的人類就在眼前：異形先變身再寄生；變種人人形沒有感染技能，只能先進化
    if (close.length === 1 && crew.length === 1 && (b.skip.get(close[0].id) ?? 0) < g.time) {
      if (infect) {
        b.goal = { k: 'cast', a: infect, e: close[0].id, until: g.time + 12 }
        return
      }
      const form = ['xeno.form', 'xeno.spawnForm'].find((a) => ready(a))
      if (form) {
        cmd(g, p, { k: 'cast', a: form })
        p.data.botShiftAt = g.time
        return
      }
    }
    // 被打就變身反擊
    if (g.time - u.lastDamageTime < 2) {
      const form = ['xeno.form', 'xeno.spawnForm'].find((a) => ready(a))
      if (form) {
        cmd(g, p, { k: 'cast', a: form })
        p.data.botShiftAt = g.time
        return
      }
    }
    wander(g, p, u, b)
    return
  }
  // 怪物形態
  if (infect && close.length) {
    const t = nearest(u, close.filter((e) => (b.skip.get(e.id) ?? 0) < g.time))
    if (t) {
      b.goal = { k: 'cast', a: infect, e: t.id, until: g.time + 8 }
      return
    }
  }
  // 太多人看到、或寄生完一陣子：變回人形
  const back = ['xeno.human', 'xeno.spawnHuman'].find((a) => ready(a))
  if (back && (crew.length >= 3 || (!crew.length && g.time - ((p.data.botShiftAt as number) ?? 0) > 25))) {
    cmd(g, p, { k: 'cast', a: back })
    return
  }
  // 沒人時下蛋
  if (!crew.length && ready('xeno.egg') && g.world.rng.chance(0.3)) {
    cmd(g, p, { k: 'cast', a: 'xeno.egg', x: u.x + 0.8, y: u.y })
    return
  }
  const foe = nearest(u, near.filter((e) => isFoe(g, p, e)))
  if (foe && (crew.length <= 2 || p.tier >= 2)) {
    for (const a of u.abilities) {
      const ab = abilityDef(a)
      if (!ab || ab.target !== 'unit' || !ready(a) || ab.passiveBuff || a.startsWith('xeno.') || a.startsWith('mut.')) continue
      if (g.world.rng.chance(0.3)) {
        b.goal = { k: 'cast', a, e: foe.id, until: g.time + 6 }
        return
      }
    }
    b.goal = { k: 'hunt', e: foe.id, until: g.time + 12 }
    return
  }
  wander(g, p, u, b)
}

function wander(g: Game, p: GamePlayer, u: Ent, b: Brain, prefer?: Set<string>): void {
  if (u.order) return
  if (!g.world.rng.chance(0.4)) return
  const pt = randomRoomPoint(g, u, prefer && g.world.rng.chance(0.5) ? prefer : undefined)
  if (pt) b.goal = { k: 'goto', ...pt, until: g.time + 25 }
  void p
}

function stepBots(g: Game): void {
  if (g.ended) return
  const t = g.time
  for (const p of g.allPlayers()) {
    if (!p.bot || p.spectator) continue
    const b = brainOf(g, p)
    if (t < b.next) continue
    b.next = t + 0.5 + g.world.rng.range(0, 0.3)
    // 死亡模式投票：bots 一律選觀戰
    if (p.alive && g.votes.death && !g.votes.death.ballots.has(p.slot)) g.handleVote(p.slot, 'spectate')
    if (!p.alive) continue
    // 新的驗血報告：馬上公布（不等手上的目標做完）
    if (g.faction(p) === 'crew') readReports(g, p, b)
    const u = g.controlOf(p)
    if (!u || !u.alive || u.data.frozen || p.evolvingUntil > t || u.tags.has('cocoon')) continue
    // 誤站上控制台、接手了站點或船艇：交回控制（AI 不會駕駛），之後照常走開
    if (u.id !== p.main && spaceOf(g).pilots.get(u.id) === p.main) {
      cmd(g, p, { k: 'unpilot' })
      b.goal = null
      // 交還後先走離控制台幾公尺，免得閒晃的目標點又落在控制台旁、被接回去
      const body = g.world.get(p.main)
      const c = body ? consolePos(g, g.world.zones[body.zone]) : null
      if (body && c) {
        const a = Math.atan2(body.y - c.y, body.x - c.x) + g.world.rng.range(-0.6, 0.6)
        const nav = g.world.zones[body.zone].nav
        const pt = nav?.nearestOpen(c.x + Math.cos(a) * 3, c.y + Math.sin(a) * 3)
        if (pt) b.goal = { k: 'goto', ...pt, until: t + 8 }
      }
      continue
    }
    if (u.zone === 0) continue
    // 在船艙裡（AI 不會開船）：走回艙門下船
    if (leaveCabin(g, p, u, b)) continue
    if (pursue(g, p, u, b)) {
      // 追擊中仍會優先處理逃跑
      if (b.goal?.k !== 'flee' && u.hp < u.maxHp * 0.25 && g.faction(p) === 'crew') b.goal = null
      continue
    }
    if (g.faction(p) === 'crew') thinkCrew(g, p, u, b)
    else thinkEvil(g, p, u, b)
  }
}

/** 主單位在停泊中的船艙裡：設定走向艙門的目標（exitShip 在艙門上觸發）。回傳 true = 這一輪只做這件事 */
function leaveCabin(g: Game, p: GamePlayer, u: Ent, b: Brain): boolean {
  if (u.id !== p.main) return false
  const z = g.world.zones[u.zone]
  const key = z.data.ship as string | undefined
  const inst = key ? spaceOf(g).ships.get(key) : undefined
  const exit = z.layout?.exits[0]
  if (!inst?.docked || !exit) return false
  if (Math.hypot(u.x - exit.x, u.y - exit.y) > 0.3 && (u.order?.k !== 'move' || u.order.x !== exit.x || u.order.y !== exit.y)) cmd(g, p, { k: 'move', x: exit.x, y: exit.y })
  b.goal = null
  return true
}

const installed = new WeakSet<Game>()

export function installBots(g: Game): void {
  if (installed.has(g)) return
  installed.add(g)
  if (!g.allPlayers().some((p) => p.bot)) return
  g.systems.push({ name: 'bots', fn: stepBots })
}
