// 隨機事件導演與末日（GDD §7.8、研究 03 §6）。
// 修正原作讓事件鏈永久中斷的 bug（空事件、門故障、新聞用完）；加入原作沒接上的三個事件（EXTRA_EVENTS，大廳 extraEvents 可關掉）。
// 由測試或除錯觸發的事件（forced）走完全相同的路徑：系統訊息不提觸發者，看起來就像隨機抽到。
import { ALL_STATIONS } from '../../shared/content/stations/index'
import { unitDef } from '../../shared/content/registry'
import { HOSTILE, NEUTRAL, dist2, type Ent } from '../ent'
import { fmtKey, shownBase, type Game, type GamePlayer } from '../game'
import { addStation, markersOf } from '../setup'
import { SPACE_HALF, SPACE_ZONE, type Zone } from '../world'
import { populateZone, spawnCreature } from '../ai/creatures'
import { DAMAGE_HOOKS, DEATH_HOOKS, damage } from './damage'
import { EXTRA_COMMANDS } from './orders'
import { dropOnGround, giveItem, makeItem } from './items'
import { restockAll } from './vendors'
import { SUN_ENTER, destroyInterior, spaceOf, zoneLabel } from './space'
import type { StationsState } from './stations'
import type { WorldPublic } from '../../shared/protocol/messages'
import { locArgs } from '../../shared/sysArgs'
import { recomputeStats } from './buffs'
import { isEasy } from '../ai/level'
import { cycleOpen, doorCycle, inDoorGap, untilOpen } from './movement'
import { butlerName, master } from './roleSystem'

type Range = [number, number]

interface EventDef {
  id: string
  /** 一次性：生效後不再抽到 */
  once: boolean
  /** 下一個事件的延遲（秒）*/
  next: Range
  /** 前置條件（不成立就不會被抽到）*/
  ok?: (g: Game) => boolean
  /** 回傳 false = 這次沒有生效（假結束畫面 5/6 的情況）*/
  run: (g: Game, forced: boolean) => boolean
  /**
   * 抽到但沒有生效時照樣用掉，下一個事件在這麼多秒後（不乘事件頻率）。
   * 原作政委晉升 X8 17641–17660：一進來就設 xe[1]=true，條件不成立就 StartTimerBJ(ee, 1.)
   */
  failNext?: number
}

interface Asteroid {
  id: number
  vx: number
  vy: number
}

export interface EventState {
  next: number
  used: Set<string>
  /** 「有東西要來了」剩下的連發數 */
  chain: number
  chainNext: number
  news: number[]
  /** 末日 */
  apocAt: number
  apocWarned: boolean
  apoc: '' | 'fleet' | 'orbit'
  apocStart: number
  fleetAt: number
  fleetPos: { x: number; y: number }
  /** 無人機艦隊 */
  waspLeft: number
  waspNext: number
  /** 門故障到期 */
  doorsUntil: number
  /** 門故障開始的時間（剛公告過的這段時間內，等門的私訊不再重複說一次，見 movement.ts）*/
  doorsAt: number
  doorPhase: Map<string, boolean>
  /** 小行星 */
  waves: number[]
  waveNext: number
  rocks: Asteroid[]
  /** 未識別物體 */
  uoZone: number
  uoUntil: number
  /** 海盜船 */
  pirateZone: number
  pirateBoom: number
  pirateWander: number
  /** 天守砲台收容失效 */
  tenshuUntil: number
  /** 強化劑 */
  enhancer: boolean
  /** 未識別物體的啟用碼（蟲洞閉合後仍有效，用一次就失效）*/
  code: string
  /** 中段張力下限（本作新增，見 stepTensionFloor）：最後一次有玩家死亡、或有事件生效的時刻 */
  lastStir: number
  /** 中段張力下限把下一個事件提前了幾次（測試、統計用）*/
  pulls: number
  /** 子艦隊轉向砲擊翠原星的全場公告：上次公告的時刻（0 = 還沒有）、上次看到「正在砲擊」的時刻 */
  fleetPlanetSaid: number
  fleetPlanetSeen: number
  /** 軌道失效：翠原星快進入恆星灼燒範圍的公告已發、已經進入範圍的公告已發 */
  burnWarned: boolean
  burnEntered: boolean
  /** 無人機群圍攻中的站：zone id → 最後一次被胡蜂戰機打到的時刻 */
  siege: Map<number, number>
  /** 已經公告過「先撤離」的站（zone id；每座站一次）*/
  siegeWarned: Set<number>
}

export function eventsOf(g: Game): EventState {
  return g.data.events as EventState
}

const R = (g: Game, r: Range) => g.world.rng.range(r[0], r[1])
const zoneByKey = (g: Game, key: string): Zone | undefined => g.world.zones.find((z) => z.key === key && z.alive)
const stationDef = (id: string) => ALL_STATIONS.find((s) => s.id === id)
const humans = (g: Game) => g.allPlayers().filter((p) => !p.spectator)

/** 原作 KIRZ95 新聞的位置：12 則原創頭條（只是氛圍）*/
const NEWS = 12
/** 強化劑五選一（研究 03 §6.2 #8）*/
export const ENHANCE = ['speed', 'hp', 'atk', 'mp', 'range'] as const

// ───────── 原作沒有的事件（大廳 extraEvents = false 時不抽）─────────

/**
 * 原作 1.8.2 的事件表只有 oe[1..15]（war3map.j e8 17577–17593；抽法 r8 17619 抽 1–16，16 是空的）。
 * 下面三個事件不在 oe[] 裡、也沒有任何地方 TriggerExecute 它們，是本作接上或新做的：
 * - virus 通訊病毒：原作死碼 vOv 18037（觸發器 ib 23485–23487 建立後停用，從未加進 oe[]）
 * - slugSwarm 蛞蝓仔大量出沒：原作死碼 vov 17925（觸發器 rb 23482–23484，同上）
 * - tenshu 天守砲台收容失效：原作只剩一則沒人引用的字串（研究 03 §6.2 TRIGSTR_2311，J 裡 0 次引用），效果全是本作設計
 * 另外 windfall（#3，c8 17701）是原作的事件格，但原作在發錢之前就 return，沒有任何效果；本作改成販賣機補滿。
 * extraEvents = false 時它照原作：照樣會被抽到、照樣佔用 90–1200 秒的間隔，只是什麼都不發生（見 windfall 的 run）。
 */
export const EXTRA_EVENTS: ReadonlySet<string> = new Set(['virus', 'slugSwarm', 'tenshu'])

/** 這一局只出原作有的事件（大廳 extraEvents = false）*/
export function originalEventsOnly(g: Game): boolean {
  return g.settings.extraEvents === false
}

// ───────── 練習局專屬規則（正式局：末日照大廳設定（本作預設 30–40 分，原作 55–70 分）、每個可抽的事件機會均等）─────────

/** 練習局的末日時間（分鐘）：比正式局早，一局練習不會拖太久（主機明確改過末日設定就照主機的；由 server 開局時寫進 settings）*/
export const PRACTICE_APOCALYPSE: readonly [number, number] = [20, 25]
/** 練習局的事件抽中權重：致命的無人戰機、小行星減半（沒列出的 = 1）*/
export const PRACTICE_EVENT_WEIGHT: Readonly<Record<string, number>> = { wasps: 0.5, asteroids: 0.5 }

/** 某個事件這一局的抽中權重（正式局一律 1）*/
export function eventWeight(g: Game, id: string): number {
  return g.practice ? (PRACTICE_EVENT_WEIGHT[id] ?? 1) : 1
}

/**
 * 練習局簡單難度：會摧毀站點的大型事件在開局這麼多秒之前不會被抽到（一般難度、正式局照舊）。
 * 無人機群（50 架胡蜂戰機圍攻站點）、小行星雨（撞站傷害 = 岩石 HP×4）、天守反物質收容失效（180 秒內沒放電就毀掉天守）、
 * 海盜船（敵對戰艦在太空遊蕩、會砲擊路過的站與船）。測試或除錯強制觸發（forced）不受影響。
 */
export const EASY_SAFE_UNTIL = 900
export const STATION_KILLERS: ReadonlySet<string> = new Set(['wasps', 'asteroids', 'tenshu', 'pirate'])

/** 簡單練習局整局都不會隨機抽到的事件：通訊病毒（名字與顏色互換，新手很難跟上誰是誰；除錯強制觸發不受影響）*/
export const EASY_NEVER: ReadonlySet<string> = new Set(['virus'])

/**
 * 通訊病毒（本作接上的額外事件，原作 1.8.2 是死碼、從來不會發生）在開局這麼多秒之前不會被隨機抽到：
 * 開局 3 分鐘就換名字，大家連彼此的真名都還沒認熟，只會一頭霧水（第 6 輪審查 A P2）。
 * 「只出原作事件」的大廳設定本來就不出這個事件，所以這條只影響本作預設；強制觸發（測試、除錯）不受影響
 */
export const VIRUS_EARLIEST = 600
/** 通訊病毒換掉的名字與顏色維持多久（秒；從換好名字起算），之後全部恢復 */
export const VIRUS_SWAP_S = 180
/** 通訊病毒先清空名字多久（秒）才換上別人的名字 */
const VIRUS_BLANK_S = 10

/** 這個事件現在能不能被隨機抽到（只出原作事件的大廳設定、簡單練習局的開局保護、通訊病毒的開局保護）*/
function drawable(g: Game, id: string): boolean {
  if (originalEventsOnly(g) && EXTRA_EVENTS.has(id)) return false
  if (g.practice && isEasy(g) && EASY_NEVER.has(id)) return false
  if (id === 'virus' && g.time < VIRUS_EARLIEST) return false
  return !(g.practice && isEasy(g) && g.time < EASY_SAFE_UNTIL && STATION_KILLERS.has(id))
}

// ───────── 事件表 ─────────

const EVENTS: EventDef[] = [
  {
    // 原作 X8 17647–17660：本局有政委、還活著，而且不是異形或變種人的主腦（V8：Rv==cv／Rv==Bv 才排除；眷屬、仿生人照樣晉升）。
    // 沒有條件可以擋抽籤：抽到就用掉，條件不成立時 1 秒後再抽下一個事件（failNext）
    id: 'promotion',
    once: true,
    next: [180, 900],
    failNext: 1,
    run: (g) => {
      const p = g.allPlayers().find((q) => q.classId === 'commissar' && q.alive && !q.spectator)
      const u = p ? g.mainOf(p) : undefined
      if (!p || !u || !u.alive || p === master(g, 'xeno') || p === master(g, 'mutant')) return false
      giveItem(g, u, makeItem('suit.operative'))
      // 職業仍是政委（classId 不變：職業技能、背景都照舊）；client 顯示職業時看 promoted 改寫「特務」
      p.data.promoted = true
      // 公告與新名字都用別人眼中的本名（通訊病毒換過名字時不能把真名說出來）；時間軸記真名
      const base = shownBase(p)
      g.systemAll('event.promotion', { name: base })
      // 通訊病毒清空名字的 10 秒內：頭銜先記下來，名字換好時一起套上
      if (p.data.virusTitle !== undefined) p.data.virusTitle = AGENT_TITLE
      else {
        p.name = AGENT_TITLE + base
        u.name = p.name
      }
      g.log(fmtKey('tl.promotion', { name: p.baseName }))
      return true
    },
  },
  {
    id: 'wormhole',
    once: true,
    next: [90, 900],
    ok: (g) => !!stationDef('uo') && !zoneByKey(g, 'uo'),
    run: (g) => {
      const st = stationDef('uo')!
      const z = addEventStation(g, st.id, st.space.pos)
      const ev = eventsOf(g)
      ev.uoZone = z.id
      ev.uoUntil = g.time + 397
      z.data.code = String(g.secret.int(1000, 9999))
      ev.code = z.data.code as string
      const se = g.world.get(z.spaceEnt)
      if (se) g.emitFx({ k: 'ping', z: SPACE_ZONE, x: se.x, y: se.y, v: 15, s: 'event' })
      g.systemAll('event.wormhole', { m: 6, s: 37 })
      g.log(fmtKey('tl.wormhole'))
      return true
    },
  },
  {
    id: 'windfall',
    once: true,
    next: [90, 1200],
    run: (g) => {
      // 只出原作事件：原作 c8 在發 8000 credits 之前就 return（17701–17708），這一格只佔用事件間隔、什麼都不發生
      if (originalEventsOnly(g)) return true
      restockAll(g)
      g.systemAll('event.windfall')
      return true
    },
  },
  {
    id: 'pirate',
    once: true,
    next: [90, 1200],
    ok: (g) => !!stationDef('pirate') && !zoneByKey(g, 'pirate'),
    run: (g) => {
      const rng = g.world.rng
      const at: [number, number] = [rng.range(-32, 32), rng.range(-32, 32)]
      const z = addEventStation(g, 'pirate', at, HOSTILE)
      const ev = eventsOf(g)
      ev.pirateZone = z.id
      ev.pirateWander = 0
      const se = g.world.get(z.spaceEnt)
      if (se) {
        se.acquire = true
        g.emitFx({ k: 'ping', z: SPACE_ZONE, x: se.x, y: se.y, v: 10, s: 'event' })
      }
      g.systemAll('event.pirate')
      g.log(fmtKey('tl.pirate'))
      return true
    },
  },
  {
    id: 'breeding',
    once: true,
    next: [90, 1200],
    ok: (g) => [...g.world.ents.values()].some((e) => e.alive && e.def.id === 'creature.slugling' && e.owner === NEUTRAL),
    run: (g) => {
      for (const e of [...g.world.ents.values()]) {
        if (!e.alive || e.def.id !== 'creature.slugling' || e.owner !== NEUTRAL) continue
        const { zone, x, y } = e
        const cell = e.data.cell
        g.world.remove(e)
        const s = spawnCreature(g, 'creature.snowgle', zone, x, y)
        if (s && cell !== undefined) s.data.cell = cell
      }
      g.systemAll('event.breeding')
      return true
    },
  },
  {
    id: 'anomalies',
    once: true,
    next: [90, 1200],
    ok: (g) => anomalyHosts(g).length > 0,
    run: (g) => {
      const hosts = anomalyHosts(g)
      if (!hosts.length) return false
      for (let i = 0; i < 12; i++) {
        const u = g.world.rng.pick(hosts)
        spawnCreature(g, 'creature.anomaly', u.zone, u.x, u.y, 2.5)
      }
      g.systemAll('event.anomalies')
      return true
    },
  },
  {
    id: 'news',
    once: false,
    next: [10, 300],
    ok: (g) => eventsOf(g).news.length > 0,
    run: (g) => {
      const ev = eventsOf(g)
      const i = g.world.rng.int(0, ev.news.length - 1)
      const n = ev.news.splice(i, 1)[0]
      g.systemAll('news.' + n)
      return true
    },
  },
  {
    id: 'enhancer',
    once: true,
    next: [10, 1200],
    ok: (g) => !!enhancerEnt(g),
    run: (g) => {
      const e = enhancerEnt(g)
      if (!e) return false
      eventsOf(g).enhancer = true
      g.emitFx({ k: 'ping', z: e.zone, x: e.x, y: e.y, v: 12, s: 'event' })
      g.systemAll('event.enhancer')
      return true
    },
  },
  {
    id: 'wasps',
    once: true,
    next: [140, 1250],
    run: (g) => {
      const ev = eventsOf(g)
      ev.waspLeft = 50
      ev.waspNext = g.time
      g.systemAll('event.wasps')
      return true
    },
  },
  {
    id: 'solar',
    once: true,
    next: [90, 1200],
    run: (g) => {
      spaceOf(g).sunFactor = 6 / 1.7
      g.emitFx({ k: 'solar', z: SPACE_ZONE, x: 6.5, y: -2.9 })
      g.systemAll('event.solar')
      return true
    },
  },
  {
    id: 'doors',
    once: false,
    next: [400, 1400],
    ok: (g) => eventsOf(g).doorsUntil <= g.time,
    run: (g) => {
      eventsOf(g).doorsUntil = g.time + R(g, [300, 600])
      eventsOf(g).doorsAt = g.time
      g.systemAll('event.doors')
      return true
    },
  },
  {
    id: 'asteroids',
    once: true,
    next: [90, 1200],
    run: (g) => {
      const ev = eventsOf(g)
      ev.waves = [8, 9, 10, 11, 12]
      ev.waveNext = g.time
      g.systemAll('event.asteroids')
      return true
    },
  },
  {
    id: 'ad',
    once: true,
    next: [10, 300],
    run: (g) => {
      g.systemAll('event.ad')
      return true
    },
  },
  {
    id: 'foul',
    once: true,
    next: [240, 600],
    run: (g) => {
      const ev = eventsOf(g)
      ev.chain = 3
      ev.chainNext = g.time + R(g, [15, 30])
      g.systemAll('event.foul')
      return true
    },
  },
  {
    id: 'fakeEnd',
    once: true,
    next: [10, 300],
    run: (g, forced) => {
      if (!forced && !g.world.rng.chance(1 / 6)) return false
      g.systemAll('event.fakeEnd')
      for (const p of g.allPlayers()) g.emitFx({ k: 'fakeEnd', z: -1, x: 0, y: 0, v: 6 }, [p.slot])
      g.after(6, () => g.systemAll('event.fakeEnd2'))
      return true
    },
  },
  {
    // 通訊病毒：名字清空 10 秒後，「本名」部分與顏色隨機互換，VIRUS_SWAP_S 秒後全部恢復。頭銜（職業前綴、晉升頭銜）跟著人走，不跟著名字換：
    // 換名前後的名字一律是「自己的頭銜＋顯示用本名」（職業本來就看得到），不會出現有前綴、沒前綴的兩個「幾乎同名」的人。
    // 換好時私訊每個人「別人眼中的你現在叫什麼、多久後恢復」，恢復時再私訊一次（name 參數由 client 依語言換掉職業前綴）。
    // 私訊只說自己的名字，不說別人換成了誰（那正是這個事件要藏的東西）。
    id: 'virus',
    once: true,
    next: [90, 1200],
    ok: (g) => humans(g).length >= 2,
    run: (g) => {
      const ps = humans(g)
      for (const p of ps) {
        p.data.virusTitle = nameTitle(p)
        p.data.virusColor = p.color
        setShownName(g, p, '', p.color)
      }
      g.systemAll('event.virus')
      g.after(VIRUS_BLANK_S, () => {
        const before = ps.map((p) => shownBase(p))
        const names = g.world.rng.shuffle([...before])
        const colors = g.world.rng.shuffle(ps.map((p) => p.color))
        ps.forEach((p, i) => {
          const title = (p.data.virusTitle as string | undefined) ?? ''
          p.data.virusTitle = undefined
          p.data.shownBase = names[i]
          setShownName(g, p, title + names[i], colors[i])
        })
        g.systemAll('event.virusDone', { s: VIRUS_SWAP_S })
        // 私訊只給活著、而且名字真的換掉的人（第 9 輪：以前死者、洗牌後抽回自己名字的人也收到「你現在顯示為『（自己的名字）』」）
        ps.forEach((p, i) => {
          if (p.alive && names[i] !== before[i]) g.privateLine(p.slot, 'event.virusYou', { name: p.name, s: VIRUS_SWAP_S })
        })
        g.after(VIRUS_SWAP_S, () => endVirus(g, ps))
      })
      return true
    },
  },
  {
    id: 'slugSwarm',
    once: true,
    next: [90, 1200],
    run: (g) => {
      const rng = g.world.rng
      for (const z of g.world.zones) {
        if (!z.alive || !z.layout || !z.station || z.station.outdoor || z.station.enable === 'event' || z.key.startsWith('ship:')) continue
        const rooms = z.layout.rooms.filter((r) => r.cells >= 20)
        if (!rooms.length) continue
        const n = z.key === 'nyx' ? 16 : 8
        for (let i = 0; i < n; i++) {
          const r = rng.pick(rooms)
          spawnCreature(g, 'creature.slugling', z.id, r.cx, r.cy, 2)
        }
      }
      g.systemAll('event.slugSwarm')
      return true
    },
  },
  {
    id: 'tenshu',
    once: true,
    next: [90, 1200],
    ok: (g) => !!zoneByKey(g, 'tenshu') && !!zoneByKey(g, 'verdance'),
    run: (g) => {
      eventsOf(g).tenshuUntil = g.time + 180
      g.systemAll('event.tenshu', { s: 180 })
      return true
    },
  },
]

const BY_ID = new Map(EVENTS.map((e) => [e.id, e]))

function anomalyHosts(g: Game): Ent[] {
  return g.allPlayers()
    .filter((p) => p.alive)
    .map((p) => g.mainOf(p))
    .filter((u): u is Ent => !!u && u.alive && u.zone !== SPACE_ZONE && !!g.world.zones[u.zone].nav)
}

function enhancerEnt(g: Game): Ent | undefined {
  const nyx = zoneByKey(g, 'nyx')
  if (!nyx) return undefined
  return g.world.inZone(nyx.id).find((e) => e.def.id === 'struct.enhancer' && e.alive)
}

/** 晉升頭銜（client 的 ui/names.ts 依語言換掉）*/
const AGENT_TITLE = '特務·'

/** 名字前面的頭銜：顯示名字扣掉顯示用本名的部分（職業前綴「Dr. 」、晉升頭銜「特務·」；沒有就是空字串）*/
function nameTitle(p: GamePlayer): string {
  const base = shownBase(p)
  return p.name.length > base.length && p.name.endsWith(base) ? p.name.slice(0, p.name.length - base.length) : ''
}

/** 通訊病毒結束：每個人的名字（頭銜照目前的，例如期間晉升的「特務·」）與顏色恢復原狀，私訊各自恢復後的名字 */
function endVirus(g: Game, ps: GamePlayer[]): void {
  if (g.ended) return
  // 恢復的私訊同樣只給活著、名字真的被換過的人（名字沒換過，「恢復成『自己的名字』」沒有意義）
  const changed = new Set(ps.filter((p) => shownBase(p) !== p.baseName).map((p) => p.slot))
  for (const p of ps) {
    const title = nameTitle(p)
    p.data.shownBase = undefined
    const color = (p.data.virusColor as number | undefined) ?? p.color
    p.data.virusColor = undefined
    setShownName(g, p, title + p.baseName, color)
  }
  g.systemAll('event.virusEnd')
  for (const p of ps) if (p.alive && changed.has(p.slot)) g.privateLine(p.slot, 'event.virusRestored', { name: p.name })
}

/** 名字與顏色（通訊病毒）：玩家、主單位、聊天、執行長的管家都跟著變（name 空字串 = 清空中）*/
function setShownName(g: Game, p: GamePlayer, name: string, color: number): void {
  p.name = name
  p.color = color
  const u = g.mainOf(p)
  if (u) {
    u.name = name
    u.color = color
  }
  for (const b of g.world.ents.values()) {
    if (!b.tags.has('butler') || b.data.butlerOf !== p.slot) continue
    b.name = name ? butlerName(p) : ''
    b.color = color
  }
}

/** 事件站：建立 zone、登錄停機坪、生成站內生物；告知所有 client 新的 zone */
function addEventStation(g: Game, id: string, pos: [number, number], owner = NEUTRAL): Zone {
  const st = stationDef(id)!
  const z = addStation(g, st, pos, owner)
  spaceOf(g).pads.set(z.id, z.layout!.pads.map(() => null))
  populateZone(g, z)
  g.zonesChanged?.()
  return z
}

// ───────── 觸發 ─────────

function fire(g: Game, id: string, forced: boolean): boolean {
  const ev = eventsOf(g)
  const def = BY_ID.get(id)
  if (!def || g.ended) return false
  if (def.once && ev.used.has(id)) return false
  if (def.ok && !def.ok(g)) return false
  let ran = false
  try {
    ran = def.run(g, forced)
  } catch (e) {
    if (__DEV__) console.error('[event]', id, e)
  }
  // failNext：沒有生效也算用掉（原作政委晉升）
  if ((ran || def.failNext !== undefined) && def.once) ev.used.add(id)
  if (ran && !FLAVOR_EVENTS.has(id)) ev.lastStir = g.time
  return ran
}

function candidates(g: Game, inChain: boolean): EventDef[] {
  const ev = eventsOf(g)
  return EVENTS.filter((d) => !(d.once && ev.used.has(d.id)) && !(inChain && d.id === 'foul') && drawable(g, d.id) && (!d.ok || d.ok(g)))
}

/** 抽出下一個隨機事件（只抽、不觸發；測試用來統計權重）。正式局維持原本的均等抽法（亂數用量也一樣），練習局依權重抽 */
export function pickEvent(g: Game, inChain: boolean): string | null {
  const list = candidates(g, inChain)
  if (!list.length) return null
  return (g.practice ? weightedPick(g, list) : g.world.rng.pick(list)).id
}

/** 抽一個事件並觸發；回傳抽到的事件與它有沒有生效 */
function drawAndFire(g: Game, inChain: boolean): { d: EventDef; ran: boolean } | null {
  const id = pickEvent(g, inChain)
  const d = id ? BY_ID.get(id) : undefined
  if (!d) return null
  return { d, ran: fire(g, d.id, false) }
}

function weightedPick(g: Game, list: EventDef[]): EventDef {
  let sum = 0
  for (const d of list) sum += eventWeight(g, d.id)
  let r = g.world.rng.next() * sum
  for (const d of list) {
    r -= eventWeight(g, d.id)
    if (r < 0) return d
  }
  return list[list.length - 1]
}

// ───────── 末日 ─────────

function startApocalypse(g: Game, kind: 'fleet' | 'orbit'): boolean {
  const ev = eventsOf(g)
  if (ev.apoc || g.ended) return false
  ev.apoc = kind
  ev.apocStart = g.time
  ev.apocWarned = true
  if (kind === 'fleet') {
    const rng = g.world.rng
    const edge = rng.int(0, 3)
    const s = SPACE_HALF - 4
    const t = rng.range(-s, s)
    ev.fleetPos = edge === 0 ? { x: -s, y: t } : edge === 1 ? { x: s, y: t } : edge === 2 ? { x: t, y: -s } : { x: t, y: s }
    ev.fleetAt = g.time + 120
    g.systemAll('apoc.fleet', { s: 120 })
    if (zoneByKey(g, 'adjudicatrix')) g.emitFx({ k: 'ping', z: SPACE_ZONE, x: ev.fleetPos.x, y: ev.fleetPos.y, v: 120, s: 'fleet' })
  } else {
    g.data.orbitsStopped = true
    g.systemAll('apoc.orbit')
    g.emitFx({ k: 'orbitFail', z: SPACE_ZONE, x: 6.5, y: -2.9 })
  }
  g.log(fmtKey(kind === 'fleet' ? 'tl.apoc.fleet' : 'tl.apoc.orbit'))
  return true
}

function stepApocalypse(g: Game, ev: EventState): void {
  const t = g.time
  if (!ev.apoc) {
    if (!ev.apocWarned && t >= ev.apocAt - 60) {
      ev.apocWarned = true
      g.systemAll('apoc.warn')
    }
    if (t >= ev.apocAt) startApocalypse(g, g.world.rng.chance(0.5) ? 'fleet' : 'orbit')
    return
  }
  if (ev.apoc === 'fleet' && ev.fleetAt > 0 && t >= ev.fleetAt) {
    ev.fleetAt = 0
    const { x, y } = ev.fleetPos
    const ids = ['fleet.hydra', 'fleet.censure', 'fleet.erstfall', ...Array(6).fill('fleet.kestrel')]
    ids.forEach((id, i) => {
      const a = (i / ids.length) * Math.PI * 2
      spawnCreature(g, id, SPACE_ZONE, x + Math.cos(a) * 3, y + Math.sin(a) * 3)
    })
    // 海盜船改為中立
    const pz = g.world.zones[ev.pirateZone]
    const ps = pz?.alive ? g.world.get(pz.spaceEnt) : undefined
    if (ps) {
      ps.owner = NEUTRAL
      ps.acquire = false
      ps.order = null
    }
    g.systemAll('apoc.fleetArrive')
  }
  if (ev.apoc === 'orbit') {
    // 所有太空物體被拉向恆星：船與太空形態以（自身移速＋0.15）m/s，其餘 0.25 m/s
    const sun = g.world.inZone(SPACE_ZONE).find((e) => e.def.id === 'space.sun')
    if (sun) {
      const dt = 1 / 20
      for (const e of g.world.inZone(SPACE_ZONE)) {
        if (e === sun || !e.alive || e.tags.has('noTarget')) continue
        const dx = sun.x - e.x
        const dy = sun.y - e.y
        const d = Math.hypot(dx, dy)
        if (d < 0.05) continue
        const v = e.tags.has('ship') || e.owner >= 0 ? e.stats.speed + ORBIT_PULL_SHIP : ORBIT_PULL
        const step = Math.min(d, v * dt)
        e.x += (dx / d) * step
        e.y += (dy / d) * step
        g.world.moved(e)
      }
    }
  }
  // 末日後 10 分鐘仍未分出勝負：平手收尾（原作兩位主腦都活著時永不結束）
  if (t >= ev.apocStart + 600 && !g.ended) g.endGame('draw', 'doom')
}

// ───────── 公開的進行中事件（worldPublic.ev）─────────

/**
 * 進行中的重大事件（給目標面板顯示對策）。只放全場都已經知道的事：每一項開始時都有全場公告，
 * 判斷依據也都是所有人本來就看得到的東西（太空層的單位對所有人可見、末日類型本來就在 w.apo、天守倒數與解除都有全場公告）。
 * - drones：無人機群（還在一架架飛進來，或太空中還有胡蜂戰機）
 * - asteroids：小行星雨（還有下一波，或太空中還有沒飛出邊界的岩石）
 * - tenshu：天守反物質收容失效倒數中
 * - pirate：敵對的海盜船還在（末日艦隊抵達後海盜改為中立就不算）
 * - doom：末日已經開始
 * - doors：門控制器故障中
 */
export function publicEvents(g: Game): string[] {
  const ev = g.data.events as EventState | undefined
  if (!ev) return []
  const out: string[] = []
  const space = g.world.inZone(SPACE_ZONE)
  if (ev.used.has('wasps') && (ev.waspLeft > 0 || space.some((e) => e.alive && e.def.id === 'ship.wasp'))) out.push('drones')
  if (ev.waves.length > 0 || ev.rocks.length > 0) out.push('asteroids')
  if (ev.tenshuUntil > 0) out.push('tenshu')
  const pz = ev.pirateZone > 0 ? g.world.zones[ev.pirateZone] : undefined
  const ps = pz?.alive ? g.world.get(pz.spaceEnt) : undefined
  if (ps && ps.alive && ps.owner === HOSTILE) out.push('pirate')
  if (ev.apoc) out.push('doom')
  // 門控制器故障：全場公告過、修好也會公告
  if (ev.doorsUntil > 0) out.push('doors')
  return out
}

// ───────── 末日的公開狀態與公告（worldPublic.rad／fleetPlanet／burnIn／siege；第 8 輪）─────────

/** 軌道失效：站、行星、逃生艙以外的東西被拉向恆星的速度（原作 vlv 18182：每 0.04 秒 1 單位 = 0.25 m/s）*/
export const ORBIT_PULL = 0.25
/** 軌道失效：船與太空形態的拉力是自身移速再加這麼多（原作 (移速 + 15) / 25 每 0.04 秒）*/
export const ORBIT_PULL_SHIP = 0.15
/** 翠原星還剩這麼多秒進入恆星灼燒範圍時全場公告（本作新增的提醒）*/
export const BURN_WARN_S = 30
/** 子艦隊多久沒打到翠原星就不算「正在砲擊」（秒）*/
const FLEET_HIT_HOLD = 3
/** 兩次「艦隊轉向砲擊翠原星」公告之間至少隔多久（秒；中間要有一段沒在砲擊）*/
const FLEET_SAY_GAP = 90
/** 被胡蜂戰機打到後多久內算「圍攻中」（秒）*/
const SIEGE_HOLD = 5
/** 圍攻中的站生命低於這個比例：全場公告先撤離（每座站一次）*/
export const SIEGE_EVAC = 0.5
const WASP = 'ship.wasp'

const verdanceEnt = (g: Game): Ent | undefined => {
  const z = zoneByKey(g, 'verdance')
  const e = z ? g.world.get(z.spaceEnt) : undefined
  return e && e.alive ? e : undefined
}
const sunEnt = (g: Game): Ent | undefined => g.world.inZone(SPACE_ZONE).find((e) => e.def.id === 'space.sun')

/** 子艦隊正在砲擊翠原星：有艦隊艦艇把它當成目標（只剩它可打，見 ai/creatures.ts fleetGoal），而且剛剛打到了它 */
export function fleetOnPlanet(g: Game): boolean {
  const ev = eventsOf(g)
  if (!ev || ev.apoc !== 'fleet') return false
  const v = verdanceEnt(g)
  const S = g.data.stations as StationsState | undefined
  if (!v || !S?.fleetHitAt || g.time - S.fleetHitAt > FLEET_HIT_HOLD) return false
  return g.world.inZone(SPACE_ZONE).some((e) => e.alive && e.def.ai === 'fleet' && e.data.fleetGoal === v.id)
}

/**
 * 軌道失效：翠原星還要幾秒被拉進恆星的灼燒範圍（中心距離扣掉行星半徑 ≤ 6 公尺；原作 XS 的 600 範圍）。
 * 行星以 0.25 m/s 直直被拉向恆星，所以就是剩下的距離 ÷ 0.25。已經在範圍裡、不是軌道失效、行星不在 → null
 */
export function burnInSec(g: Game): number | null {
  const ev = eventsOf(g)
  if (!ev || ev.apoc !== 'orbit') return null
  const v = verdanceEnt(g)
  const sun = sunEnt(g)
  if (!v || !sun) return null
  const gap = Math.hypot(v.x - sun.x, v.y - sun.y) - v.radius - SUN_ENTER
  return gap > 0 ? Math.ceil(gap / ORBIT_PULL) : null
}

/** 無人機群圍攻中的站：[站 key, 剩餘生命比例（0.05 一格）]，依站的順序 */
function siegeList(g: Game, ev: EventState): [string, number][] {
  const out: [string, number][] = []
  for (const [zid, at] of ev.siege) {
    const z = g.world.zones[zid]
    const e = z?.alive ? g.world.get(z.spaceEnt) : undefined
    if (!e || !e.alive || g.time - at > SIEGE_HOLD) {
      ev.siege.delete(zid)
      continue
    }
    out.push([z.key, Math.max(0.05, Math.round((e.hp / Math.max(1, e.maxHp)) * 20) / 20)])
  }
  return out
}

const doomCache = new WeakMap<Game, { tick: number; v: Partial<WorldPublic> }>()

/**
 * 末日與災害的公開狀態（worldPublic 的 rad／fleetPlanet／burnIn／siege）：每一項只在條件成立時有值，否則是 undefined
 * （快照差量只在出現、改變、消失時送一次；消失時送 undefined，client 的 Object.assign 就清掉）。
 * 全是所有人本來就知道的事：地表殘留輻射是公開現象（每次隕擊都對全體 ping）、太空層對所有人可見、
 * 末日類型本來就在 w.apo、無人機群有全場公告。不分觀看者，同一個 tick 只算一次
 */
export function publicDoom(g: Game): Partial<WorldPublic> {
  const c = doomCache.get(g)
  if (c && c.tick === g.world.tick) return c.v
  const ev = g.data.events as EventState | undefined
  const S = g.data.stations as StationsState | undefined
  const rad = S && S.rad >= 0.5 ? Math.round(S.rad) : 0
  const burn = ev ? burnInSec(g) : null
  const siege = ev ? siegeList(g, ev) : []
  const v: Partial<WorldPublic> = {
    rad: rad > 0 ? rad : undefined,
    fleetPlanet: ev && fleetOnPlanet(g) ? true : undefined,
    burnIn: burn ?? undefined,
    siege: siege.length ? siege : undefined,
  }
  doomCache.set(g, { tick: g.world.tick, v })
  return v
}

/**
 * 末日與圍攻的全場公告（每秒檢查一次；本作新增的提醒，規則不變）：
 * - 子艦隊轉向砲擊翠原星（太空中已經沒有別的目標）
 * - 軌道失效：翠原星再 30 秒就進入恆星灼燒範圍、已經進入
 * - 無人機群圍攻的站生命低於一半：先撤離
 */
function stepDoomNotices(g: Game, ev: EventState): void {
  const t = g.time
  if (ev.apoc === 'fleet' && fleetOnPlanet(g)) {
    if (!ev.fleetPlanetSaid || t - ev.fleetPlanetSeen > FLEET_SAY_GAP) {
      ev.fleetPlanetSaid = t
      g.systemAll('rule8.fleet.planet')
    }
    ev.fleetPlanetSeen = t
  }
  if (ev.apoc === 'orbit' && !ev.burnEntered && verdanceEnt(g)) {
    const s = burnInSec(g)
    if (s === null) {
      ev.burnEntered = true
      ev.burnWarned = true
      g.systemAll('rule8.orbit.burnNow')
    } else if (!ev.burnWarned && s <= BURN_WARN_S) {
      ev.burnWarned = true
      g.systemAll('rule8.orbit.burnSoon', { s })
    }
  }
  for (const [zid, at] of ev.siege) {
    if (ev.siegeWarned.has(zid) || t - at > SIEGE_HOLD) continue
    const z = g.world.zones[zid]
    const e = z?.alive ? g.world.get(z.spaceEnt) : undefined
    if (!e || e.hp / Math.max(1, e.maxHp) >= SIEGE_EVAC) continue
    ev.siegeWarned.add(zid)
    g.systemAll('rule8.siege.evac', locArgs(zoneLabel(g, z)))
  }
}

// ───────── 中段張力下限（本作新增；大廳 extraEvents = false 的原作模式不啟用）─────────

/** 只是氛圍、不算「有事發生」的事件：新聞頭條、帽子廣告 */
const FLAVOR_EVENTS: ReadonlySet<string> = new Set(['news', 'ad'])
/** 開局這麼多秒以後才啟用 */
export const TENSION_AFTER = 12 * 60
/** 這麼多秒沒有玩家死亡、也沒有事件生效 */
export const TENSION_QUIET = 6 * 60
/** 就把下一個事件提前到這段時間內（秒）*/
export const TENSION_PULL: Range = [30, 90]

/** 這一局有沒有中段張力下限：本作的額外事件開著（原作模式關掉）、事件沒有被關掉（事件倍率 > 0）*/
export function tensionFloorOn(g: Game): boolean {
  return !originalEventsOnly(g) && g.settings.eventMult > 0
}

/**
 * 中段張力下限：第 8 輪審查 D 統計 15–30 分這一段每 5 分鐘只死 0.17–0.56 人，最長「沒人死、也沒事件」的空檔中位數 10.9 分。
 * 開局 12 分鐘以後，6 分鐘沒有玩家死亡、也沒有事件生效，就把下一個隨機事件提前到 30–90 秒內（只動排程，不改事件本身）。
 * 原作的排程照舊是各事件自己的 90–1200 秒等（研究 03 §6.1）；原作模式（extraEvents = false）不啟用，連亂數用量都不變
 */
function stepTensionFloor(g: Game, ev: EventState): void {
  if (!tensionFloorOn(g) || ev.apoc || ev.chain > 0) return
  const t = g.time
  if (t < TENSION_AFTER || t - ev.lastStir < TENSION_QUIET) return
  const lim = t + TENSION_PULL[1]
  if (!Number.isFinite(ev.next) || ev.next <= lim) return
  ev.next = t + R(g, TENSION_PULL)
  ev.pulls++
}

// ───────── 持續中的事件 ─────────

function stepOngoing(g: Game, ev: EventState): void {
  const t = g.time
  const w = g.world
  const rng = w.rng
  // 胡蜂無人戰機：每秒一架
  if (ev.waspLeft > 0 && t >= ev.waspNext) {
    ev.waspLeft--
    ev.waspNext = t + 1
    const s = SPACE_HALF - 3
    spawnCreature(g, 'ship.wasp', SPACE_ZONE, rng.range(-s, s), rng.range(-s, s))
  }
  // 小行星帶
  if (ev.waves.length && t >= ev.waveNext) {
    const n = ev.waves.shift()!
    for (let i = 0; i < n; i++) spawnRock(g, ev)
    ev.waveNext = t + R(g, [0.1, 5])
  }
  if (ev.rocks.length) stepRocks(g, ev)
  // 門故障：沒有權限需求的門每 2.25 秒開 1.5 秒、猛關 0.75 秒，夾到 225 傷害並擊退
  if (ev.doorsUntil > 0) {
    if (t >= ev.doorsUntil) {
      ev.doorsUntil = 0
      endDoorMalfunction(g, ev)
      g.systemAll('event.doorsFixed')
    } else stepDoorMalfunction(g, ev)
  }
  // 未識別物體：397 秒後解體，內部全滅
  if (ev.uoUntil > 0 && t >= ev.uoUntil) {
    ev.uoUntil = 0
    removeEventStation(g, ev.uoZone)
    g.systemAll('event.wormholeClosed')
  }
  // 海盜船：主控台被毀 → 40 秒自爆；平時在太空中緩慢遊蕩
  const pz = w.zones[ev.pirateZone]
  if (ev.pirateZone > 0 && pz?.alive) {
    if (ev.pirateBoom > 0 && t >= ev.pirateBoom) {
      ev.pirateBoom = 0
      removeEventStation(g, pz.id)
    } else {
      const ship = w.get(pz.spaceEnt)
      if (ship && ship.owner === HOSTILE && t >= ev.pirateWander && (!ship.order || ship.order.k !== 'attack')) {
        ev.pirateWander = t + R(g, [20, 40])
        const s = SPACE_HALF - 8
        ship.order = { k: 'amove', x: rng.range(-s, s), y: rng.range(-s, s) }
      }
    }
  }
  // 天守砲台收容失效
  if (ev.tenshuUntil > 0 && t >= ev.tenshuUntil) {
    ev.tenshuUntil = 0
    g.systemAll('event.tenshuFail')
    g.destroyStation?.('tenshu')
  }
  // 政府強化劑：人員形態（含穿防護服的人員；原作看 point value 220000，著裝人員也是）走到裝置旁 → 私下提供五選一
  if (ev.enhancer && w.tick % 5 === 0) {
    const e = enhancerEnt(g)
    if (!e) ev.enhancer = false
    else {
      for (const p of g.allPlayers()) {
        const u = g.mainOf(p)
        const near = !!u && u.alive && u.zone === e.zone && dist2(u, e) < 2.2 * 2.2
        if (!near || p.data.enhDone) {
          p.data.enhOffer = false
          continue
        }
        if (!u!.tags.has('personnel')) {
          if (!p.data.enhRefused) g.privateLine(p.slot, 'event.enhNotYou')
          p.data.enhRefused = true
          continue
        }
        p.data.enhOffer = true
      }
    }
  }
}

function removeEventStation(g: Game, zoneId: number): void {
  const z = g.world.zones[zoneId]
  if (!z || !z.alive) return
  const se = g.world.get(z.spaceEnt)
  destroyInterior(g, z.id, null)
  if (se) g.world.remove(se)
  g.stations = g.stations.filter((s) => s !== z.key)
}

/** 小行星的生命上限（原作 h04D uhpm 20000）與碰撞半徑（原作 Hh 以 TriggerRegisterUnitInRangeSimple 90 偵測碰撞：90 單位 = 0.9 公尺）*/
export const ROCK_MAX_HP = 20000
export const ROCK_RADIUS = 0.9

/**
 * 一顆小行星（原作 U8 17847–17880、Hh 4826–4840）：ve = rand(0,1)；外觀縮放 50 + 200·ve %；
 * 生命 = 上限 20000 的 ve × 100%（SetUnitLifePercentBJ），所以撞站傷害（當前生命 ×4）在 0–80000 之間、與外觀大小同步；
 * 碰撞半徑固定 0.9 公尺，不隨外觀縮放。速度 20–90 單位/秒（0.2–0.9 m/s）。
 */
function spawnRock(g: Game, ev: EventState): void {
  const rng = g.world.rng
  const ve = rng.next()
  const sc = 0.5 + 2 * ve
  const x = rng.range(-SPACE_HALF + 3, SPACE_HALF - 3)
  const y = -SPACE_HALF + 1.5
  const e = g.world.spawn(unitDef('space.asteroid'), SPACE_ZONE, x, y, HOSTILE)
  e.global = true
  e.acquire = false
  e.radius = ROCK_RADIUS
  e.maxHp = ROCK_MAX_HP
  e.hp = Math.max(1, Math.round(ROCK_MAX_HP * ve))
  e.x2 = { sc: Math.round(sc * 100) / 100 }
  const sp = rng.range(0.2, 0.9)
  let ang = Math.PI / 2 + rng.range(-0.35, 0.35)
  if (rng.chance(0.5)) {
    const targets = g.world.inZone(SPACE_ZONE).filter((o) => o.alive && (o.tags.has('station') || o.tags.has('ship')))
    if (targets.length) {
      const tg = rng.pick(targets)
      ang = Math.atan2(tg.y - y, tg.x - x)
    }
  }
  e.facing = ang
  ev.rocks.push({ id: e.id, vx: Math.cos(ang) * sp, vy: Math.sin(ang) * sp })
}

function stepRocks(g: Game, ev: EventState): void {
  const dt = 1 / 20
  const w = g.world
  ev.rocks = ev.rocks.filter((r) => {
    const e = w.get(r.id)
    if (!e || !e.alive) return false
    e.x += r.vx * dt
    e.y += r.vy * dt
    w.moved(e)
    if (Math.abs(e.x) > SPACE_HALF + 2 || Math.abs(e.y) > SPACE_HALF + 2) {
      w.remove(e)
      return false
    }
    for (const o of w.query(SPACE_ZONE, e.x, e.y, e.radius + 4)) {
      if (o === e || !o.alive || !(o.tags.has('station') || o.tags.has('ship'))) continue
      const rr = e.radius + o.radius
      if (dist2(e, o) > rr * rr) continue
      // 爆炸特效的大小跟著外觀縮放（碰撞半徑固定，見 spawnRock）
      g.emitFx({ k: 'asteroidHit', z: SPACE_ZONE, x: e.x, y: e.y, v: ROCK_RADIUS * (Number(e.x2?.sc) || 1) })
      if (o.tags.has('station')) {
        damage(g, null, o, e.hp * 4, { kind: 'blast', pure: true, env: 'rock' })
        w.remove(e)
        return false
      }
      // 船：3000 傷害並被撞開
      damage(g, null, o, 3000, { kind: 'blast', pure: true, env: 'rock' })
      const d = Math.max(0.01, Math.sqrt(dist2(e, o)))
      o.vx += ((o.x - e.x) / d) * 5
      o.vy += ((o.y - e.y) / d) * 5
      w.remove(e)
      return false
    }
    return true
  })
}

/** 門猛關的傷害；生命不到 DOOR_SPARE_HP 的單位不扣這麼多，而是被夾到只剩 1 點（原作 eJ：不會被門夾死在低血量）*/
export const DOOR_DMG = 225
export const DOOR_SPARE_HP = 175

/**
 * 門控制器故障（研究 03 事件 #11；時間表照原作 war3map.j 的 cJ／Zj／xJ／eJ，見 movement.ts 的 DOOR_*）：
 * 沒有權限需求、沒鎖、沒壞的門每 2.25 秒一個週期，開 1.5 秒、猛關後關 0.75 秒；不管旁邊有沒有人都照週期開關。
 * 猛關的那一下夾到門縫裡（單位中心離門板中線 < 0.55 公尺）的單位：225 傷害並彈開；生命 ≤ 175 的改成只剩 1 點。
 * 關著的時候門是實心的（forced：到重新打開的時刻為止）；d.cycling 讓移動系統把它當成會週期打開的門來尋路。
 */
function stepDoorMalfunction(g: Game, ev: EventState): void {
  const t = g.time
  for (const z of g.world.zones) {
    if (!z.alive || !z.layout || !z.nav) continue
    for (const d of z.doors) {
      const key = z.id + ':' + d.index
      if (d.clearance || d.security || d.locked || d.broken) {
        // 故障中被鎖上、被打壞：交回一般的門邏輯
        if (d.cycling) {
          d.cycling = false
          d.forced = 0
        }
        ev.doorPhase.delete(key)
        continue
      }
      d.cycling = true
      const ph = doorCycle(t, d.index)
      const shut = !cycleOpen(ph)
      d.forced = shut ? t + untilOpen(ph) : 0
      // 第一次看到這扇門：原本就關著的不算「猛關」
      const was = ev.doorPhase.get(key) ?? !d.open
      ev.doorPhase.set(key, shut)
      if (d.open === shut) {
        d.open = !shut
        z.nav.doorClosed[d.index] = shut ? 1 : 0
      }
      if (!shut || was) continue
      // 剛猛然關上：夾到門縫裡的單位
      const inst = z.layout.doors[d.index]
      g.emitFx({ k: 'doorSlam', z: z.id, x: inst.x, y: inst.y })
      for (const u of g.world.query(z.id, inst.x, inst.y, inst.width / 2 + 1)) {
        if (!u.alive || u.def.speed <= 0 || u.tags.has('structure') || u.tags.has('noTarget')) continue
        if (!inDoorGap(inst, u.x, u.y, u.radius)) continue
        if (u.hp <= DOOR_SPARE_HP) damage(g, null, u, u.hp - 1, { kind: 'normal', pure: true, spare: true, env: 'door' })
        else damage(g, null, u, DOOR_DMG, { kind: 'normal', env: 'door' })
        const p = z.nav.nearestOpen(u.x + (u.x - inst.x) * 2 + 0.01, u.y + (u.y - inst.y) * 2 + 0.01, (i) => i !== d.index)
        if (p && u.alive) g.world.relocate(u, z.id, p.x, p.y)
      }
    }
  }
}

/** 門控制器修好：所有週期開關的門交回一般的自動門邏輯 */
function endDoorMalfunction(g: Game, ev: EventState): void {
  ev.doorPhase.clear()
  for (const z of g.world.zones) {
    for (const d of z.doors) {
      if (!d.cycling) continue
      d.cycling = false
      d.forced = 0
    }
  }
}

// ───────── 強化劑選擇 ─────────

function applyEnhance(g: Game, p: GamePlayer, u: Ent, i: number): void {
  const k = ENHANCE[i]
  p.data.enhDone = true
  p.data.enhOffer = false
  const passives = ((u.data.passives as string[] | undefined) ??= [])
  if (k === 'speed') passives.push('bf.enh.speed')
  if (k === 'atk') passives.push('bf.enh.atk')
  if (k === 'range') passives.push('bf.enh.range')
  if (k === 'hp') {
    u.data.hpAdd = ((u.data.hpAdd as number) ?? 0) + 100
    u.maxHp += 100
    u.hp += 100
  }
  if (k === 'mp') {
    u.data.mpAdd = ((u.data.mpAdd as number) ?? 0) + 50
    u.maxMp += 50
    u.mp += 50
  }
  u.statsDirty = true
  recomputeStats(u)
  g.privateLine(p.slot, 'event.enhDone.' + k)
  g.emitFx({ k: 'enhance', z: u.zone, x: u.x, y: u.y, e: u.id })
}

// ───────── 安裝 ─────────

const installed = new WeakSet<Game>()

export function installEvents(g: Game): void {
  if (installed.has(g)) return
  installed.add(g)
  const rng = g.world.rng
  const [a0, a1] = g.settings.apocalypse
  const ev: EventState = {
    next: g.settings.eventMult > 0 ? R(g, [180, 720]) / g.settings.eventMult : Infinity,
    used: new Set(),
    chain: 0,
    chainNext: 0,
    news: Array.from({ length: NEWS }, (_, i) => i + 1),
    apocAt: rng.range(Math.min(a0, a1), Math.max(a0, a1)) * 60,
    apocWarned: false,
    apoc: '',
    apocStart: 0,
    fleetAt: 0,
    fleetPos: { x: 0, y: 0 },
    waspLeft: 0,
    waspNext: 0,
    doorsUntil: 0,
    doorsAt: -1e9,
    doorPhase: new Map(),
    waves: [],
    waveNext: 0,
    rocks: [],
    uoZone: 0,
    uoUntil: 0,
    pirateZone: 0,
    pirateBoom: 0,
    pirateWander: 0,
    tenshuUntil: 0,
    enhancer: false,
    code: '',
    lastStir: 0,
    pulls: 0,
    fleetPlanetSaid: 0,
    fleetPlanetSeen: -1e9,
    burnWarned: false,
    burnEntered: false,
    siege: new Map(),
    siegeWarned: new Set(),
  }
  g.data.events = ev

  g.systems.push({
    name: 'events',
    fn: (gg) => {
      if (gg.ended) return
      const t = gg.time
      if (ev.chain > 0) {
        if (t >= ev.chainNext) {
          ev.chain--
          ev.chainNext = t + R(gg, [15, 30])
          const r = drawAndFire(gg, true)
          // 連發中抽到沒生效的政委晉升：原作的 1 秒計時器會在連發之間多觸發一個事件，這裡把這一發補回來、1 秒後再抽
          if (r && !r.ran && r.d.failNext !== undefined) {
            ev.chain++
            ev.chainNext = t + r.d.failNext
          }
        }
      } else if (t >= ev.next) {
        const r = drawAndFire(gg, false)
        const mult = Math.max(0.05, gg.settings.eventMult)
        // 沒有可抽的事件時每 60 秒再看一次（例如新聞用完、條件都不成立）；抽到沒生效、要馬上再抽的事件照它的 failNext
        ev.next = t + (!r ? 60 / mult : !r.ran && r.d.failNext !== undefined ? r.d.failNext : R(gg, r.d.next) / mult)
      }
      stepTensionFloor(gg, ev)
      stepOngoing(gg, ev)
      stepApocalypse(gg, ev)
      if (gg.world.tick % 20 === 0) stepDoomNotices(gg, ev)
    },
  })

  // 玩家死亡：中段張力下限的計時歸零
  DEATH_HOOKS.push((g2, u) => {
    if (g2 === g && u.isMain && u.owner >= 0) ev.lastStir = g.time
  })

  // 無人機群圍攻：胡蜂戰機打到站點（太空中的站體）就記下來（worldPublic.siege、撤離公告）
  DAMAGE_HOOKS.push((g2, src, t, amount) => {
    if (g2 !== g || amount <= 0 || src?.def.id !== WASP || t.zone !== SPACE_ZONE) return
    const zid = t.data.interior as number | undefined
    const z = zid !== undefined ? g.world.zones[zid] : undefined
    if (!z?.alive || !z.station || z.data.ship || z.key === 'verdance') return
    ev.siege.set(z.id, g.time)
  })

  g.onGroupChat = (p, text) => blackHoleEgg(g, p, text)
  g.triggerEvent = (id, forced) => fire(g, id, forced)
  g.eventIds = () => EVENTS.map((e) => e.id)
  g.startApocalypse = (kind) => startApocalypse(g, kind)

  // 海盜船主控台被毀 → 自爆倒數；船被直接打爆也一樣全滅（站點毀滅流程）
  DEATH_HOOKS.push((g2, u) => {
    if (g2 !== g) return
    if (ev.pirateZone > 0 && u.zone === ev.pirateZone && u.def.id === 'struct.consolePirate' && !ev.pirateBoom) {
      ev.pirateBoom = g.time + 40
      for (const q of g.world.inZone(u.zone)) if (q.isMain && q.owner >= 0) g.privateLine(q.owner, 'event.pirateSelfDestruct', { s: 40 })
      g.emitFx({ k: 'alarm', z: u.zone, x: u.x, y: u.y, v: 40 })
    }
  })

  EXTRA_COMMANDS.set('enhance', (g2, p, u, c) => {
    if (g2 !== g) return
    if (!p.data.enhOffer || p.data.enhDone || c.s === undefined) return
    const i = Math.floor(c.s)
    if (i < 0 || i >= ENHANCE.length || !u.tags.has('personnel')) return
    const e = enhancerEnt(g)
    if (!e || u.zone !== e.zone || dist2(u, e) > 2.6 * 2.6) return
    applyEnhance(g, p, u, i)
  })
}

// ───────── 彩蛋：黑洞裝置（研究 03 §7）─────────
// 原作的通關句以雜湊比對、無法還原；本作自訂一句致敬台詞，加上未識別物體裡的 4 位數啟用碼。
const PASS = ['願群星記得我們', 'may the stars remember us']
const EGG_TIME = 2700

function blackHoleEgg(g: Game, p: GamePlayer, text: string): void {
  const ev = eventsOf(g)
  if (!ev.code) return
  const norm = text.toLowerCase().replace(/[\s,，.。!！'’]/g, '')
  if (!PASS.some((x) => norm.includes(x.replace(/\s/g, ''))) || !norm.includes(ev.code)) return
  if (g.time < EGG_TIME) {
    g.privateLine(p.slot, 'egg.tooEarly', { s: Math.ceil(EGG_TIME - g.time) })
    return
  }
  ev.code = ''
  g.privateLine(p.slot, 'egg.accepted')
  // 黑洞裝置出現在餘燼衛星；7 座站的落點各出現一名蛞蝓特工
  const cinder = zoneByKey(g, 'cinder')
  const at = cinder ? (markersOf(cinder).moduleOut?.[0] ?? cinder.layout?.spawns[0] ?? null) : null
  if (cinder && at) dropOnGround(g, cinder.id, at.x, at.y, makeItem('singularity'))
  let n = 0
  for (const z of g.world.zones) {
    if (n >= 7 || !z.alive || !z.layout || !z.station || z.station.enable === 'event' || z.key.startsWith('ship:')) continue
    const pt = markersOf(z).podLanding?.[0] ?? z.layout.spawns[0]
    if (!pt) continue
    spawnCreature(g, 'npc.slugOperative', z.id, pt.x, pt.y, 1)
    n++
  }
  g.log(fmtKey('tl.blackhole'))
}

/** 天守砲台對翠原星放電（M7 主砲腳本呼叫）：解除收容失效 */
export function tenshuDischarged(g: Game, target: Ent): boolean {
  const ev = eventsOf(g)
  if (!ev || ev.tenshuUntil <= 0) return false
  const vz = zoneByKey(g, 'verdance')
  if (!vz || target.id !== vz.spaceEnt) return false
  ev.tenshuUntil = 0
  g.systemAll('event.tenshuOk')
  return true
}

/** 未識別物體內的啟用碼（M7 codePanel 互動顯示）*/
export function uoCode(g: Game): string | null {
  const ev = eventsOf(g)
  const z = ev ? g.world.zones[ev.uoZone] : undefined
  return z?.alive ? ((z.data.code as string) ?? null) : null
}

