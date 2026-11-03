// 音訊導演：依畫面與局勢決定背景音樂情境、環境音，並把各種狀態變化轉成回饋音效。
// 只看 client 本來就看得到的資料（快照、自己的私有狀態、聊天），不會因為音樂而洩漏看不到的東西。
import { effect } from '@preact/signals'
import { EntFlag, type ChatLine, type FxEvent } from '../shared/protocol/messages'
import { chatTaps, cmdTaps, endResult, lobby, screen, snapTick, startInfo, world } from '../client/session'
import { chatOpen, evolveOpen } from '../client/input'
import type { GameScene } from '../render/gameScene'
import { currentAmbient, setAmbient, type AmbientKind } from './ambient'
import { ENGINE_FULL_SPEED, countdownTick, vehicleSpeed, zoneAmbient } from './cues'
import { engineState, setEngine, stopEngine } from './engine'
import { currentMood, musicDuckLevel, setMood, type Mood } from './music'
import { audioContext, debugLevel, debugPeak, listenerPos, sfx } from './sfx'
import { FAMILIES, combatStats, familyOf, playBark, playHit, voicePitch, type BarkKind, type Family, type Hit, type Mat } from './combat'
import { notesOpen } from '../ui/hud/Investigation'
import { codexOpen } from '../ui/hud/Codex'

let scene: GameScene | null = null
let forced: Mood | null = null

/** GameScreen 掛上場景（知道目前看的是哪個 zone、門在哪裡）；離開對局（null）時也放掉最後懸停的元素，不讓它留住上一局的 HUD 與場景 */
export function bindAudioScene(gs: GameScene | null): void {
  scene = gs
  if (!gs) lastHover = null
}

/** 上一個發出懸停音的按鈕（同一顆不重複響）*/
let lastHover: Element | null = null

// ───────── 局勢判定 ─────────

const st = {
  hurtAt: -1e9,
  combatUntil: 0,
  tenseUntil: 0,
  alarmUntil: 0,
  lastHp: -1,
  /** 上一個快照操控的是哪個單位、最大生命多少（換操控對象或脫防護服不能當成受傷）*/
  lastHpId: 0,
  lastMhp: 0,
  lastAlive: true,
  lastInv: [] as (string | null)[],
  lastEp: -1,
  lastCd: new Map<string, number>(),
  lastDoors: new Map<number, number>(),
  steps: new Map<number, { x: number; y: number; acc: number }>(),
  /** 叫聲追蹤：上一個快照看到的樣子 */
  ents: new Map<number, { hp: number; mhp: number; dead: boolean; x: number; y: number; d?: string; c?: number }>(),
  nextIdle: 0,
  heartbeatAt: 0,
  revealedFor: null as unknown,
  lobbyN: -1,
  lobbyReady: -1,
  inGame: false,
  /** 剛按了丟棄的背包格與期限（快照確認那格空了才播丟棄音，被拒絕的丟棄不出聲）*/
  dropSlot: -1,
  dropUntil: 0,
  /** 發射倒數：上一次響過的整數秒 */
  launchBeep: 0,
  /** 海盜船自爆：預計爆炸的本地時間、收到通知時所在的 zone、上一次響過的整數秒 */
  destructAt: 0,
  destructZone: -1,
  destructBeep: 0,
}

const now = () => performance.now() / 1000

const ERROR_KEYS = /^@(cast\.|vendor\.(soldOut|tooFar|offline|noPower)|item\.(full|uniqueOnly|cantSuit|notYet|deployFail)|role\.cant|chat\.(no|nameTaken)|git\.msg\.already|fac\.(tooFar|offline))/

function myUnit() {
  const id = world.me.control ?? world.me.unit
  return id ? world.ents.get(id) : undefined
}

function zoneKind(): [AmbientKind, string] {
  const zid = scene?.zone ?? -1
  const info = startInfo.value?.zones.find((z) => z[0] === zid)
  return zoneAmbient(info?.[2], zid === 0)
}

/** 這個實體看起來是不是威脅（只用快照裡看得到的欄位）*/
function threatening(e: { s: { fl?: number; o?: number; d?: string } }): boolean {
  const fl = e.s.fl ?? 0
  if (fl & (EntFlag.Mine | EntFlag.Ally | EntFlag.Corpse)) return false
  if (fl & EntFlag.Hostile) return true
  const d = e.s.d ?? ''
  return d.startsWith('xeno.') || d.startsWith('mut.') || d.startsWith('fleet.') || d.startsWith('pirate.')
}

function pickMood(): Mood {
  const s = screen.value
  if (s === 'menu' || s === 'connecting') return 'menu'
  if (s === 'lobby') return 'lobby'
  if (endResult.value) return 'dead'
  const me = world.me
  if (me.alive === false) return 'dead'
  if (world.w.apo) return 'apocalypse'
  const t = now()
  const u = myUnit()
  if (u) {
    const zid = u.s.z
    for (const e of world.ents.values()) {
      if (e.s.z !== zid || !threatening(e)) continue
      const d = Math.hypot(e.x - u.x, e.y - u.y)
      if (d < 9 && e.s.st === 2) st.combatUntil = Math.max(st.combatUntil, t + 8)
      if (d < 15) st.tenseUntil = Math.max(st.tenseUntil, t + 6)
    }
    if (u.s.st === 2) st.combatUntil = Math.max(st.combatUntil, t + 6)
    const hpK = (u.s.hp ?? 1) / Math.max(1, u.s.mhp ?? 1)
    if (hpK < 0.3) st.tenseUntil = Math.max(st.tenseUntil, t + 3)
  }
  if (t < st.combatUntil || t - st.hurtAt < 6) return 'combat'
  if (t < st.alarmUntil) return 'alarm'
  if (t < st.tenseUntil || (world.w.stab ?? 1) <= 0.25) return 'tense'
  return 'explore'
}

// ───────── 每個快照的回饋 ─────────

function onSnap(): void {
  if (screen.value !== 'game') return
  const me = world.me
  const u = myUnit()
  const t = now()
  // 角色揭露（每局一次）
  if (me.role && st.revealedFor !== startInfo.value) {
    st.revealedFor = startInfo.value
    const r = me.role
    sfx(r === 'xeno' ? 'revealXeno' : r === 'mutant' ? 'revealMutant' : r === 'android' ? 'revealAndroid' : 'revealHuman')
  }
  // 死亡
  const alive = me.alive !== false
  if (st.lastAlive && !alive) sfx('death')
  st.lastAlive = alive
  // 受傷／低血
  if (u && alive) {
    const hp = u.s.hp ?? 0
    const mhp = Math.max(1, u.s.mhp ?? 1)
    if (u.s.i !== st.lastHpId || mhp !== st.lastMhp) {
      st.lastHpId = u.s.i
      st.lastMhp = mhp
      st.lastHp = -1
    }
    if (st.lastHp >= 0 && hp < st.lastHp - 2) {
      st.hurtAt = t
      sfx(st.lastHp - hp > mhp * 0.12 ? 'hurtBig' : 'hurt')
    }
    st.lastHp = hp
    if (hp / mhp < 0.3 && t >= st.heartbeatAt) {
      st.heartbeatAt = t + (hp / mhp < 0.15 ? 0.7 : 1.05)
      sfx('heartbeat')
    }
  } else st.lastHp = -1
  // 背包：拿到新東西；剛按丟棄的那格空了 → 丟棄音
  const inv = (me.inv ?? []).map((x) => x?.item ?? null)
  if (st.lastInv.length === inv.length) {
    for (let i = 0; i < inv.length; i++) if (inv[i] && inv[i] !== st.lastInv[i] && !st.lastInv.includes(inv[i])) sfx('pickup')
    const s = st.dropSlot
    if (s >= 0 && t < st.dropUntil && st.lastInv[s] && !inv[s]) {
      sfx('drop')
      st.dropSlot = -1
    }
  }
  if (t >= st.dropUntil) st.dropSlot = -1
  st.lastInv = inv
  countdowns(t)
  engine(u)
  // EP 增加（異類）
  const ep = me.ep ?? 0
  if (st.lastEp >= 0 && ep > st.lastEp + 0.5) sfx('epTick')
  st.lastEp = ep
  // 長冷卻的技能好了
  for (const a of me.abilities ?? []) {
    const had = st.lastCd.has(a.id)
    const prev = st.lastCd.get(a.id) ?? 0
    if (prev > 0.2 && a.cd <= 0 && a.maxCd >= 8) sfx('ready')
    // 自己放出技能（冷卻剛開始）：施放音，讓按下去有回饋
    if (had && prev <= 0.05 && a.cd > 0.5 && u) sfx('cast', u.x, u.y)
    st.lastCd.set(a.id, a.cd)
  }
  // 門：鏡頭附近的門開關
  const zid = scene?.zone ?? -1
  const layout = scene?.zones.get(zid)?.layout
  const l = listenerPos()
  for (const [k, v] of world.doors) {
    const prev = st.lastDoors.get(k)
    st.lastDoors.set(k, v)
    if (prev === undefined || prev === v || Math.floor(k / 10000) !== zid || !layout) continue
    const d = layout.doors[k % 10000]
    if (!d || Math.hypot(d.x - l.x, d.y - l.y) > 16) continue
    if (v === 1) sfx('doorOpen', d.x, d.y)
    else if (prev === 1 && v === 0) sfx('doorClose', d.x, d.y)
  }
  // 腳步：自己和附近會走路的單位（最多 4 個來源）
  if (u) stepSounds(u.s.z ?? -1, u.s.i)
  // 受傷、死亡、怪物叫聲：看的是鏡頭所在的 zone
  if (zid >= 0) barks(zid, t)
}

/**
 * 鏡頭附近每個看得到的單位：血量下降 → 痛叫；死亡 → 死亡叫聲；怪物偶爾低吼。
 * 只用快照裡看得到的欄位；叫聲的音色由外觀＋顯示顏色決定（不看 id，偽裝者不會因聲音露餡）。
 */
function barks(zid: number, t: number): void {
  const l = listenerPos()
  let pains = 0
  let deaths = 0
  const seen = new Set<number>()
  const fresh: { x: number; y: number }[] = []
  for (const e of world.ents.values()) {
    const s = e.s
    if (s.z !== zid) continue
    const corpse = !!((s.fl ?? 0) & EntFlag.Corpse)
    const prev = st.ents.get(s.i)
    if (corpse) {
      // 新出現的屍體（sim 會移除單位、在原地生成屍體）
      if (!prev) fresh.push({ x: e.x, y: e.y })
      st.ents.set(s.i, { hp: 0, mhp: 1, dead: true, x: e.x, y: e.y })
      seen.add(s.i)
      continue
    }
    const fam = familyOf(s.d)
    if (!fam) continue
    seen.add(s.i)
    const hp = s.hp ?? 0
    const mhp = Math.max(1, s.mhp ?? 1)
    const dead = hp <= 0
    st.ents.set(s.i, { hp, mhp, dead, x: e.x, y: e.y, d: s.d, c: s.c })
    if (!prev || prev.dead || Math.hypot(e.x - l.x, e.y - l.y) > 22) continue
    const k = voicePitch(s.d, s.c)
    if (dead) {
      if (deaths++ < 2) playBark(fam, 'death', e.x, e.y, k)
    } else if (prev.mhp === mhp && hp < prev.hp - Math.max(2, mhp * 0.03)) {
      if (pains++ < 3) playBark(fam, 'pain', e.x, e.y, k, prev.hp - hp > mhp * 0.12)
    }
  }
  // 消失的單位：原地冒出屍體 → 死了（用它死前的樣子叫）；沒有屍體的機械，低血量時在近處消失也算
  for (const [id, p] of st.ents) {
    if (seen.has(id)) continue
    st.ents.delete(id)
    if (p.dead || !p.d || Math.hypot(p.x - l.x, p.y - l.y) > 22) continue
    const fam = familyOf(p.d)
    if (!fam) continue
    const corpseHere = fresh.some((c) => Math.hypot(c.x - p.x, c.y - p.y) < 1.5)
    const wreck = fam === 'machine' && p.hp <= p.mhp * 0.3 && Math.hypot(p.x - l.x, p.y - l.y) < 14
    if ((corpseHere || wreck) && deaths++ < 2) playBark(fam, 'death', p.x, p.y, voicePitch(p.d, p.c))
  }
  // 怪物待機叫聲：每 3–8 秒，挑一隻附近看得到的非人類
  if (t >= st.nextIdle) {
    st.nextIdle = t + 3 + Math.random() * 5
    const cand = [...world.ents.values()].filter((e) => {
      if (e.s.z !== zid || (e.s.fl ?? 0) & (EntFlag.Corpse | EntFlag.Mine)) return false
      const fam = familyOf(e.s.d)
      return !!fam && fam !== 'human' && Math.hypot(e.x - l.x, e.y - l.y) < 16
    })
    const e = cand[Math.floor(Math.random() * cand.length)]
    if (e) playBark(familyOf(e.s.d)!, 'idle', e.x, e.y, voicePitch(e.s.d, e.s.c))
  }
}

/** 發射倒數（私有狀態 launchIn）與海盜船自爆倒數（私下通知＋本地計時）；只有自己聽得到 */
function countdowns(t: number): void {
  const me = world.me
  st.launchBeep = countdownTick(me.alive === false ? 0 : (me.launchIn ?? 0), st.launchBeep, (n) => sfx(n))
  if (st.destructAt > 0) {
    // 已經離開海盜船（搭船逃走、死了）就不再響
    const left = me.alive !== false && me.zone === st.destructZone ? st.destructAt - t : 0
    st.destructBeep = countdownTick(left, st.destructBeep, (n) => sfx(n))
    if (t >= st.destructAt) st.destructAt = 0
  }
}

/** 引擎循環音：自己正在駕駛（control ≠ 主單位）的載具在太空層（zone 0）移動時，依速度大小 */
function engine(u: ReturnType<typeof myUnit>): void {
  const me = world.me
  const piloting = !!u && me.alive !== false && !!me.control && me.control !== me.unit && u.s.z === 0
  if (!piloting || !u) {
    setEngine(0)
    return
  }
  setEngine(vehicleSpeed(u.samples, world.serverTime) / ENGINE_FULL_SPEED)
}

function stepSounds(zid: number, myId: number): void {
  const l = listenerPos()
  const near = [...world.ents.values()]
    .filter((e) => e.s.z === zid && (e.s.st === 1 || e.s.i === myId) && !((e.s.fl ?? 0) & (EntFlag.Corpse | EntFlag.Hover)))
    .map((e) => ({ e, d: Math.hypot(e.x - l.x, e.y - l.y) }))
    .filter((x) => x.d < 12)
    .sort((a, b) => a.d - b.d)
    .slice(0, 4)
  const keep = new Set<number>()
  for (const { e } of near) {
    keep.add(e.s.i)
    const prev = st.steps.get(e.s.i)
    if (!prev) {
      st.steps.set(e.s.i, { x: e.x, y: e.y, acc: 0 })
      continue
    }
    prev.acc += Math.hypot(e.x - prev.x, e.y - prev.y)
    prev.x = e.x
    prev.y = e.y
    const d = e.s.d ?? ''
    const heavy = d.startsWith('suit.') || d.includes('brute') || d.includes('colossus') || d.includes('pacifier') || d.includes('bulwark')
    const crawler = d.startsWith('creature.') || d.includes('skitter') || d.includes('spider') || d.includes('weaver')
    const stride = heavy ? 1.6 : crawler ? 0.9 : 1.25
    if (prev.acc >= stride) {
      prev.acc = 0
      sfx(crawler ? 'scuttle' : heavy ? 'stepHeavy' : d.startsWith('xeno.') || d.startsWith('mut.') ? 'squish' : 'step', e.x, e.y)
    }
  }
  for (const id of st.steps.keys()) if (!keep.has(id)) st.steps.delete(id)
}

// ───────── 特效、聊天、指令 ─────────

function onFx(f: FxEvent): void {
  if (f.k === 'alarm' && f.z === (scene?.zone ?? -2)) st.alarmUntil = now() + 18
  if (f.k === 'stationBoom' || f.k === 'doorBreak') st.combatUntil = Math.max(st.combatUntil, now() + 5)
}

function onChat(lines: ChatLine[]): void {
  for (const ln of lines) {
    const text = ln.text ?? ''
    if (ln.ch === 'private' && text.startsWith('@event.pirateSelfDestruct')) {
      // 海盜船自爆：通知帶著秒數（@event.pirateSelfDestruct|s=40），本地計時，最後 5 秒每秒一聲
      const s = Number(/\|s=(\d+)/.exec(text)?.[1] ?? 40)
      st.destructAt = now() + s
      st.destructZone = world.me.zone ?? -1
      st.destructBeep = 0
    }
    if (ln.ch === 'private') sfx(ERROR_KEYS.test(text) ? 'error' : 'notify')
    else if (ln.ch === 'sys') {
      if (text.startsWith('@apoc.')) sfx('apocSting')
      else if (text.startsWith('@event.') || text.startsWith('@space.destroyed') || text.startsWith('@git.destroyed')) sfx('eventSting')
      else sfx('announce')
    } else if (ln.ch === 'team' || ln.ch === 'group') sfx('chatTeam')
    else if (ln.ch === 'dead') sfx('chatDead')
    else sfx('chat')
  }
}

function installUiSounds(): void {
  document.addEventListener(
    'pointerover',
    (e) => {
      const el = (e.target as Element | null)?.closest?.('button:not([disabled]), .codex-item, .swatch, .pcard')
      if (!el || el === lastHover) return
      lastHover = el
      sfx('uiHover')
    },
    true,
  )
  document.addEventListener(
    'click',
    (e) => {
      const el = (e.target as Element | null)?.closest?.('button:not([disabled]), .codex-item, .swatch')
      if (el) sfx('ui')
    },
    true,
  )
}

let installed = false

export function installAudioDirector(): void {
  if (installed || typeof window === 'undefined') return
  installed = true
  installUiSounds()
  world.fxTaps.push(onFx)
  cmdTaps.push((c) => {
    if (c.k === 'move' || c.k === 'follow') sfx('cmdMove')
    else if (c.k === 'attack' || c.k === 'amove') sfx('cmdAttack')
    else if (c.k === 'drop' && c.s !== undefined) {
      st.dropSlot = c.s
      st.dropUntil = now() + 2
    }
  })
  // 畫面切換
  let prevScreen = screen.value
  effect(() => {
    const s = screen.value
    if (s === 'game' && prevScreen !== 'game') {
      sfx('gameStart')
      st.lastHp = -1
      st.lastInv = []
      st.lastEp = -1
      st.lastCd.clear()
      st.lastDoors.clear()
      st.steps.clear()
      st.ents.clear()
      st.dropSlot = -1
      st.launchBeep = 0
      st.destructAt = 0
      st.destructBeep = 0
    }
    if (s !== 'game') {
      setAmbient(null)
      stopEngine()
    }
    prevScreen = s
    setMood(forced ?? pickMood())
  })
  // 大廳：有人加入／離開／準備
  effect(() => {
    const lb = lobby.value
    if (!lb || screen.value !== 'lobby') {
      st.lobbyN = -1
      return
    }
    const n = lb.players.length
    const ready = lb.players.filter((p) => p.ready).length
    if (st.lobbyN >= 0 && n > st.lobbyN) sfx('join')
    if (st.lobbyN >= 0 && n < st.lobbyN) sfx('leaveLobby')
    if (st.lobbyReady >= 0 && ready > st.lobbyReady) sfx('readyUp')
    st.lobbyN = n
    st.lobbyReady = ready
  })
  // 快照
  effect(() => {
    void snapTick.value
    onSnap()
  })
  // 聊天（用 tap：chatLog 到 200 行就不再變長，不能用長度判斷新訊息）
  chatTaps.push((lines) => {
    if (screen.value === 'game') onChat(lines)
  })
  // 結算
  effect(() => {
    const r = endResult.value
    if (!r) return
    const f = world.me.faction
    const won = r.winner !== 'draw' && r.winner !== 'aborted' && ((r.winner === 'crew' && f === 'crew') || r.winner === f)
    sfx(won ? 'victory' : 'defeat')
  })
  // 面板開關
  let prevChat = chatOpen.value
  const prevPanels = [evolveOpen.value, notesOpen.value, codexOpen.value]
  effect(() => {
    const c = chatOpen.value
    const panels = [evolveOpen.value, notesOpen.value, codexOpen.value]
    panels.forEach((v, i) => {
      if (v !== prevPanels[i]) sfx(v ? 'uiOpen' : 'uiClose')
      prevPanels[i] = v
    })
    if (c && !prevChat) sfx('uiHover')
    prevChat = c
  })
  if (__TEST_HOOKS__) {
    ;(window as unknown as Record<string, unknown>).__xcAudio = {
      mood: () => currentMood(),
      /** 戰鬥時音樂壓低節點的目前增益（1 = 沒壓）*/
      duck: () => musicDuckLevel(),
      state: () => audioContext()?.state ?? 'none',
      level: () => debugLevel(),
      peak: () => debugPeak(),
      /** 測試：鎖定某個情境（不再自動判定）*/
      force: (m: Mood | null) => {
        forced = m
        if (m) setMood(m)
      },
      sfx: (n: string) => sfx(n),
      /** 測試與混音：在鏡頭位置播叫聲 */
      bark: (fam: Family, kind: BarkKind, big = false) => {
        const l = listenerPos()
        return playBark(fam, kind, l.x, l.y, 1, big)
      },
      families: () => FAMILIES,
      combat: () => ({ ...combatStats }),
      hit: (kind: Hit, mat: Mat) => {
        const l = listenerPos()
        playHit(kind, mat, l.x, l.y)
      },
      /** 測試與混音：直接切環境音（kind = null 關掉）、引擎聲 */
      ambient: (kind: AmbientKind | null, flavor = '') => setAmbient(kind, flavor),
      ambientNow: () => currentAmbient(),
      engine: (k: number) => setEngine(k),
      engineState: () => engineState(),
    }
  }
  // 局勢：每 0.5 秒重新判定音樂情境與環境音
  setInterval(() => {
    setMood(forced ?? pickMood())
    if (screen.value === 'game') setAmbient(...zoneKind())
  }, 500)
}
