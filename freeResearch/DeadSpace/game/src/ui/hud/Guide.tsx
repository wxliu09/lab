// 遊戲內指引：目標面板（左上常駐、可收合）、情境提示（一次性 toast）、說明面板（G）。
// 只讀自己的私有狀態（world.me）、自己的主單位，以及快照裡本來就看得到的實體與全域狀態；
// 不顯示、也不暗示別人的身分。規則細節的出處見 strings/guide.ts 開頭。
import { effect, signal } from '@preact/signals'
import { useEffect, useLayoutEffect, useRef, useState } from 'preact/hooks'
import type { PrivateState, WorldPublic } from '../../shared/protocol/messages'
import { CLASSES, UNITS, abilityDef, buffDef, itemDef } from '../../shared/content/registry'
import '../../shared/content/index'
import { snapTick, startInfo, world } from '../../client/session'
import { chatOpen, dialogOpen, evolveOpen, modalChecks, typingInField } from '../../client/input'
import { codexOpen } from './Codex'
import { notesOpen } from './Investigation'
import { addStrings, hasString, lang, listJoin, loc, t } from '../i18n'
import { PLAYER_COLORS } from '../../shared/constants'
import { tipProps } from '../tooltip'
import { Icon } from '../icons'
import { GUIDE_EN, GUIDE_ZH, HELP_CONTROLS, HELP_THINGS } from '../strings/guide'
import { sampleName } from '../../shared/sysArgs'
import { localizeName } from '../names'
import { PLAY1_EN, PLAY1_ZH } from '../strings/play1'
import '../guide.css'

addStrings(GUIDE_ZH, GUIDE_EN)
// 第 1 輪玩法修正的字串（AI 驗血公告、進化原因、感染提示、博士專長）；i18n.ts 也會註冊時重複無妨
addStrings(PLAY1_ZH, PLAY1_EN)

/** 研究員的博士專長：「名稱（效果）」；不是研究員回傳空字串（只讀自己的私有狀態）*/
export function phdText(me: Partial<PrivateState>, fmt = 'play1.phd'): string {
  const bd = me.phd ? buffDef('cls.phd.' + me.phd) : undefined
  if (!bd) return ''
  return t(fmt, { name: loc(bd.name), desc: loc(bd.desc) })
}

// ───────── 偏好（localStorage）─────────

const K_ON = 'xc.hints'
const K_SEEN = 'xc.hints.seen'
const K_FOLD = 'xc.guide.fold'

function lsGet(k: string): string | null {
  try {
    return localStorage.getItem(k)
  } catch {
    return null
  }
}

function lsSet(k: string, v: string): void {
  try {
    localStorage.setItem(k, v)
  } catch {
    /* ignore */
  }
}

/** 情境提示開關（設定頁用；預設開）。關掉只停情境提示，目標面板照常。 */
export const hintsEnabled = signal(lsGet(K_ON) !== '0')
effect(() => lsSet(K_ON, hintsEnabled.value ? '1' : '0'))

/** 說明面板（G）是否開著 */
export const guideOpen = signal(false)
modalChecks.push(() => guideOpen.value)

/** 已看過的提示（每台瀏覽器每種只出現一次）*/
export interface HintStore {
  has(id: string): boolean
  add(id: string): void
  clear(): void
}

/** 存在 localStorage 的提示紀錄；每次都重讀，同一瀏覽器的其他分頁看過的也算 */
export function localHintStore(key = K_SEEN): HintStore {
  let raw: string | null = null
  let set = new Set<string>()
  const load = (): Set<string> => {
    const r = lsGet(key)
    if (r === raw) return set
    raw = r
    try {
      const a: unknown = JSON.parse(r ?? '[]')
      set = new Set(Array.isArray(a) ? a.filter((x): x is string => typeof x === 'string') : [])
    } catch {
      set = new Set()
    }
    return set
  }
  return {
    has: (id) => load().has(id),
    add: (id) => {
      const s = load()
      s.add(id)
      raw = JSON.stringify([...s])
      lsSet(key, raw)
    },
    clear: () => {
      set = new Set()
      raw = '[]'
      lsSet(key, raw)
    },
  }
}

const store = localHintStore()
const hintsEpoch = signal(0)

/** 重新顯示所有情境提示（設定頁用）*/
export function resetHints(): void {
  store.clear()
  hintsEpoch.value++
}

// ───────── 提示佇列 ─────────

export interface Hint {
  id: string
  /** 數字小的先顯示 */
  pri: number
  args?: Record<string, string | number>
}

export interface ActiveHint extends Hint {
  left: number
  life: number
}

export const HINT_LIFE = 12
export const MAX_HINTS = 2

/** 警告類提示（樣式：黃框）*/
const WARN_HINTS = new Set(['lowHp', 'lowHpNoKit', 'death', 'deathAndroid', 'stab', 'androidFf', 'parasited', 'prioned'])
/** 不等空位的提示：警告，和「身在哪裡」的提示（船艙裡的下船方法：排在教學提示後面就等於下船之後才出現）*/
export const URGENT_HINTS = new Set([...WARN_HINTS, 'shipInside'])
/** 有時效的提示：條件消失（開始結繭／進化、血量回來、感染清除、下了船、死亡）就連顯示中的也收回 */
export const TRANSIENT_HINTS = new Set(['evolveXeno', 'evolveMutant', 'evolveAndroid', 'androidFull', 'lowHp', 'lowHpNoKit', 'parasited', 'prioned', 'shipInside'])

export class HintQueue {
  active: ActiveHint[] = []
  queue: Hint[] = []
  /** 這個佇列自己顯示過的（被退回佇列時不會因為「看過了」而被丟掉）*/
  private mine = new Set<string>()

  constructor(
    private store: HintStore,
    private life = HINT_LIFE,
    private urgent: Set<string> = URGENT_HINTS,
    private transient: Set<string> = TRANSIENT_HINTS,
  ) {}

  /** 條件成立：沒看過、也不在畫面或佇列裡就排進去（已在佇列裡的更新參數，例如快捷鍵）*/
  offer(h: Hint): boolean {
    const queued = this.queue.find((q) => q.id === h.id)
    if (queued) {
      queued.args = h.args
      return false
    }
    if (this.mine.has(h.id) || this.store.has(h.id)) return false
    let i = this.queue.findIndex((q) => q.pri > h.pri)
    if (i < 0) i = this.queue.length
    this.queue.splice(i, 0, h)
    return true
  }

  /**
   * 推進時間。blocked（被全螢幕畫面擋住）時不倒數也不補位；hold = 滑鼠停著的那則不倒數；
   * current = 目前成立的條件：還在排隊的提示條件消失就移除（離開了販賣機、血量回來了、身分變了），
   * 下次條件成立再排（退回佇列的提示也一樣：條件消失就丟掉）。回傳畫面是否有變。
   */
  tick(dt: number, blocked: boolean, max = MAX_HINTS, hold: string | null = null, current?: Set<string>): boolean {
    let changed = false
    if (current) {
      // 被頂掉、退回佇列的提示也要條件仍成立才留著（死了就不該再看到「基本操作」）
      this.queue = this.queue.filter((q) => current.has(q.id))
      // 有時效的提示條件消失：顯示中的也收回（例如「可以進化」在開始結繭後還掛著）
      const n = this.active.length
      this.active = this.active.filter((a) => !this.transient.has(a.id) || current.has(a.id))
      if (n !== this.active.length) changed = true
    }
    if (blocked) return changed
    for (const a of this.active) if (a.id !== hold) a.left -= dt
    const n = this.active.length
    this.active = this.active.filter((a) => a.left > 0)
    if (this.active.length !== n) changed = true
    while (this.queue.length) {
      // 緊急提示優先；滿了就頂掉最後一則一般提示（退回佇列最前面，稍後一定會再顯示）
      let i = this.queue.findIndex((q) => this.urgent.has(q.id))
      if (i < 0) {
        if (this.active.length >= max) break
        i = 0
      } else if (this.active.length >= max) {
        let vi = -1
        for (let k = this.active.length - 1; k >= 0 && vi < 0; k--) if (!this.urgent.has(this.active[k].id)) vi = k
        if (vi < 0) break
        const [v] = this.active.splice(vi, 1)
        // 依優先順序插回佇列
        let at = this.queue.findIndex((q) => q.pri > v.pri)
        if (at < 0) at = this.queue.length
        this.queue.splice(at, 0, { id: v.id, pri: v.pri, args: v.args })
        i = this.queue.findIndex((q) => this.urgent.has(q.id))
      }
      const [h] = this.queue.splice(i, 1)
      if (!this.mine.has(h.id)) {
        if (this.store.has(h.id)) continue
        this.store.add(h.id)
        this.mine.add(h.id)
      }
      // 緊急提示放最上面（版面放不下時 deferLast 退回的是最後一則，不會是它）
      const a = { ...h, left: this.life, life: this.life }
      if (this.urgent.has(h.id)) this.active.unshift(a)
      else this.active.push(a)
      changed = true
    }
    return changed
  }

  dismiss(id: string): void {
    this.active = this.active.filter((a) => a.id !== id)
  }

  /** 版面放不下：把最後一則退回佇列最前面，稍後再顯示 */
  deferLast(): void {
    const a = this.active.pop()
    if (a) this.queue.unshift({ id: a.id, pri: a.pri, args: a.args })
  }

  /** 清空畫面與佇列（關閉提示）；forget = 連「自己顯示過」的紀錄一起清（重新顯示提示）*/
  clear(forget = false): void {
    this.active = []
    this.queue = []
    if (forget) this.mine.clear()
  }
}

// ───────── 身分與目標（純函式，只吃自己的私有狀態）─────────

export type Identity = 'human' | 'xeno' | 'mutant' | 'android' | 'spawnXeno' | 'spawnMutant' | 'dead' | 'deadAndroid' | 'spectator'

/** Guide 需要的全部輸入：自己的私有狀態、公開的全域狀態、自己的主單位、身旁看得到的實體 */
export interface GuideView {
  me: Partial<PrivateState>
  w: Partial<WorldPublic>
  self?: { d?: string; hp?: number; mhp?: number; b?: string[] }
  /** 同一區、身旁幾公尺內看得到的實體（def id 與距離）*/
  near: { d: string; dist: number }[]
  /** 目前所在 zone 的站點 id（'ship:…' = 船艙）*/
  zoneStation?: string
}

export function identityOf(me: Partial<PrivateState>): Identity | null {
  if (!me.role) return null
  if (me.role === 'spectator') return 'spectator'
  if (me.alive === false) return me.role === 'android' ? 'deadAndroid' : 'dead'
  if (me.spawn) return me.faction === 'mutant' ? 'spawnMutant' : 'spawnXeno'
  return me.role
}

const HOTKEYS = ['Q', 'W', 'E', 'R', 'D', 'F']

/** 技能的快捷鍵（指令卡順序，同 input.ts）；null = 沒有這個技能，'' = 有但沒有快捷鍵 */
export function abilityKey(me: Partial<PrivateState>, id: string): string | null {
  const list = (me.abilities ?? []).filter((a) => abilityDef(a.id)?.target !== 'passive')
  const i = list.findIndex((a) => a.id === id)
  if (i < 0) return null
  return HOTKEYS[i] ?? ''
}

function keyText(k: string): string {
  return k || t('guide.card')
}

/** 背包裡第一個符合的格子（0 起算；-1 = 沒有）*/
/** 看得到的販賣機裡，有沒有已經上架的基因檢測器（補給事件會提早上架）*/
function samplerInStock(): boolean {
  for (const e of world.ents.values()) {
    const s = e.s.x2?.s
    if (typeof s !== 'string') continue
    for (const row of s.split('|')) {
      const [id, n] = row.split(':')
      if (id === 'geneSampler' && Number(n) > 0) return true
    }
  }
  return false
}

export function invSlot(me: Partial<PrivateState>, pred: (item: string) => boolean): number {
  return (me.inv ?? []).findIndex((s) => !!s && pred(s.item))
}

function isSuitItem(id: string): boolean {
  return !!itemDef(id)?.suit
}

function suited(v: GuideView): boolean {
  return !!UNITS.get(v.self?.d ?? '')?.tags.includes('suit')
}

function fmtTime(s: number): string {
  const v = Math.max(0, Math.ceil(s))
  return `${Math.floor(v / 60)}:${String(v % 60).padStart(2, '0')}`
}

export interface Step {
  key: string
  args?: Record<string, string | number>
  dim?: boolean
}

export interface Objective {
  id: Identity
  goal: string
  sub?: string
  steps: Step[]
  ep?: { ep: number; next: number; ready: boolean }
}

/** 基因檢測器上架時間（content/vendors.ts：醫療補給與 GIT 檢測儀的 delay）*/
const SAMPLER_AT = 420

function classStep(me: Partial<PrivateState>, v: GuideView): Step | null {
  const c = CLASSES.get(me.classId ?? '')
  if (!c) return null
  // 職業特色的短句（標題已經寫了職業名）；沒有短句就用內容表的說明。
  // 博士專長以被動套用、不在自己單位的 buff 清單裡，改讀私有狀態的 phd（只給本人）
  void v
  const phd = phdText(me)
  const short = 'guide.cls.' + c.id + (phd ? 'Phd' : '')
  const desc = hasString(lang.value, short) ? t(short, { phd }) : loc(c.desc)
  return { key: 'guide.s.class', args: { cls: loc(c.name), desc }, dim: true }
}

export function objectiveFor(v: GuideView): Objective | null {
  const me = v.me
  const id = identityOf(me)
  if (!id) return null
  const steps: Step[] = []
  const add = (key: string, args?: Step['args']) => steps.push({ key, args })
  // 正在進化（結繭、肉團）時不再顯示「可以進化」
  const ready = (me.canEvolve?.length ?? 0) > 0 && !me.evolving
  const ep = (me.epNext ?? 0) > 0 ? { ep: me.ep ?? 0, next: me.epNext!, ready } : undefined
  const time = v.w.t ?? 0
  let sub: string | undefined
  switch (id) {
    case 'human': {
      sub = t('class.' + (me.classId ?? ''))
      const suitAt = invSlot(me, isSuitItem)
      if (!suited(v)) {
        if (suitAt >= 0) add('guide.s.suitWear', { k: suitAt + 1 })
        else add('guide.s.suitGet')
      }
      const res = invSlot(me, (i) => i === 'gitResolver')
      const smp = invSlot(me, (i) => i === 'geneSampler')
      if (res >= 0) add('guide.s.resolverUse', { k: res + 1 })
      else if (smp >= 0) {
        // 抽血進度：已抽的人（自己的資訊）
        const names = me.inv?.[smp]?.samples ?? []
        if (names.length) add('guide.s.samplerProgress', { k: smp + 1, n: names.length, names: listJoin(names.map((x) => localizeName(sampleName(x, lang.value)))) })
        else add('guide.s.samplerUse', { k: smp + 1 })
      } else if (time < SAMPLER_AT && !samplerInStock()) add('guide.s.samplerWait', { t: fmtTime(SAMPLER_AT - time) })
      else add('guide.s.samplerGet')
      add('guide.s.attack')
      if (steps.length < 3) add('guide.s.notes')
      const cs = classStep(me, v)
      if (cs) steps.push(cs)
      break
    }
    case 'xeno': {
      sub = t('guide.sub.tier', { n: Math.max(1, me.tier ?? 1) })
      if (me.evolving) add('guide.s.cocoon', { s: me.evolving })
      else if (ready) add('guide.s.evolveXeno')
      const kf = abilityKey(me, 'xeno.form')
      if (kf !== null) {
        add('guide.s.shed', { k: keyText(kf) })
        add('guide.s.alienOnly')
      } else {
        const kp = abilityKey(me, 'xeno.parasite')
        const ke = abilityKey(me, 'xeno.egg')
        const kh = abilityKey(me, 'xeno.human')
        if (kp !== null) add('guide.s.parasite', { k: keyText(kp) })
        if (ke !== null) add('guide.s.egg', { k: keyText(ke) })
        if (kh !== null) add('guide.s.wear', { k: keyText(kh) })
      }
      add('guide.s.killEp')
      break
    }
    case 'mutant': {
      const tier = me.tier ?? 0
      sub = tier > 0 ? t('guide.sub.tier', { n: tier }) : t('guide.sub.human')
      if (me.evolving) add('guide.s.massing', { s: me.evolving })
      else if (ready) add(tier === 0 ? 'guide.s.evolvePath' : 'guide.s.evolveMutant')
      const kd = abilityKey(me, 'mut.devour')
      if (tier === 0) {
        // 肉團（進化中）已經現形，不再叫他保持偽裝
        if (!me.evolving) add('guide.s.hide')
        if (kd !== null) add('guide.s.devour', { k: keyText(kd) })
        add('guide.s.dmgEp')
      } else {
        const kc = abilityKey(me, 'mut.cannibalize')
        const kp = abilityKey(me, 'mut.prion')
        if (kc !== null) add('guide.s.cannibal', { k: keyText(kc) })
        if (kp !== null) add('guide.s.prion', { k: keyText(kp) })
        if (kd !== null) add('guide.s.devour', { k: keyText(kd) })
        add('guide.s.hunt')
      }
      break
    }
    case 'android': {
      sub = t('class.' + (me.classId ?? ''))
      add('guide.s.helpCrew')
      add('guide.s.ff')
      if (ep) add(ready ? 'guide.s.androidPick' : ep.ep >= ep.next ? 'guide.s.androidReady' : 'guide.s.androidEp')
      add('guide.s.core')
      break
    }
    case 'spawnXeno': {
      const kd = abilityKey(me, 'xeno.spawnHuman')
      const ka = abilityKey(me, 'xeno.spawnForm')
      const kp = abilityKey(me, 'xeno.parasite')
      if (kp !== null) add('guide.s.parasite', { k: keyText(kp) })
      if (kd !== null) add('guide.s.dormant', { k: keyText(kd) })
      if (ka !== null) add('guide.s.awaken', { k: keyText(ka) })
      add('guide.s.team')
      add('guide.s.spawnWin')
      break
    }
    case 'spawnMutant': {
      const kp = abilityKey(me, 'mut.prion')
      if (kp !== null) add('guide.s.prion', { k: keyText(kp) })
      add('guide.s.team')
      add('guide.s.spawnWin')
      break
    }
    case 'dead':
      // 死亡即退出：已出局，不能觀戰
      if (me.booted) {
        add('guide3.s.booted')
        add('guide3.s.bootedLeave')
        break
      }
      add('guide.s.specPick')
      add('guide.s.deadChat')
      add('guide.s.slug')
      add('guide.s.endReveal')
      break
    case 'deadAndroid':
      add('guide.s.coreRevive')
      add('guide.s.coreRemote')
      add('guide.s.shutdown')
      break
    case 'spectator':
      add('guide.s.specPick')
      add('guide.s.deadChat')
      add('guide.s.endReveal')
      break
  }
  const live = id === 'xeno' || id === 'mutant' || id === 'android'
  const goal = id === 'dead' && me.booted ? 'guide3.goal.booted' : 'guide.goal.' + id
  return { id, goal, sub, steps: steps.slice(0, 4), ep: live ? ep : undefined }
}

// ───────── 情境提示的觸發條件（純函式）─────────

/** 身旁設施的觸發距離（公尺）；販賣機與 VendorPanel 一致 */
const NEAR: [test: (d: string) => boolean, r: number, hint: (id: Identity, v: GuideView) => Hint | null][] = [
  [(d) => d === 'vendor.escapePod', 2.9, () => ({ id: 'pod', pri: 26 })],
  [(d) => d.startsWith('vendor.'), 2.9, () => ({ id: 'vendor', pri: 24 })],
  [(d) => d === 'struct.git', 3.5, () => ({ id: 'git', pri: 24 })],
  [(d) => d === 'struct.console', 3, () => ({ id: 'console', pri: 24 })],
  [(d) => d.startsWith('docked.'), 4.5, () => ({ id: 'ship', pri: 24 })],
  [(d) => d === 'struct.droneControl', 2.5, () => ({ id: 'drone', pri: 26 })],
  [(d) => d === 'fac.fabricator', 4.5, (id) => ({ id: id === 'android' ? 'fabAndroid' : 'fab', pri: 26 })],
  [
    (d) => d === 'struct.rummage',
    3,
    (_id, v) => {
      const k = abilityKey(v.me, 'cls.rummage')
      return k === null ? null : { id: 'rummage', pri: 27, args: { k: keyText(k) } }
    },
  ],
]

/** 目前成立的提示條件（佇列會濾掉看過的）*/
export function detectHints(v: GuideView): Hint[] {
  const me = v.me
  const id = identityOf(me)
  if (!id) return []
  const out: Hint[] = []
  const add = (hid: string, pri: number, args?: Hint['args']) => out.push({ id: hid, pri, args })
  const time = v.w.t ?? 0
  if (id === 'spectator') add('spectate', 4)
  if (id === 'dead' && !me.booted) add('death', 0)
  if (id === 'deadAndroid') add('deathAndroid', 0)
  const alive = me.alive !== false && id !== 'spectator' && id !== 'dead' && id !== 'deadAndroid'
  if (!alive) return out
  add('start', 10)
  add('keys', 11)
  if (time >= 40) add('ally', 30)
  if (time >= 150) add('notes', 40)
  if ((v.w.stab ?? 1) <= 0.5) add('stab', 35)
  // 身分的關鍵技能
  if (id === 'xeno') {
    const kf = abilityKey(me, 'xeno.form')
    if (kf !== null) add('xenoShed', 20, { k: keyText(kf) })
    const kp = abilityKey(me, 'xeno.parasite')
    const ke = abilityKey(me, 'xeno.egg')
    const kh = abilityKey(me, 'xeno.human')
    if (kp !== null && ke !== null && kh !== null) add('xenoAlien', 20, { kp: keyText(kp), ke: keyText(ke), kh: keyText(kh) })
  }
  if (id === 'spawnXeno') {
    add('spawnXeno', 2)
    const kp = abilityKey(me, 'xeno.parasite')
    const kh = abilityKey(me, 'xeno.spawnHuman')
    if (kp !== null && kh !== null) add('xenoSpawnForm', 20, { kp: keyText(kp), kh: keyText(kh) })
  }
  if (id === 'spawnMutant') add('spawnMutant', 2)
  if (id === 'mutant') {
    const kd = abilityKey(me, 'mut.devour')
    if (kd !== null) add('mutantDevour', 20, { k: keyText(kd) })
  }
  if (id === 'android') {
    add('androidFf', 20)
    if ((me.epNext ?? 0) > 0 && (me.ep ?? 0) >= (me.epNext ?? 0) && !me.canEvolve?.length) add('androidFull', 5)
  }
  if (me.canEvolve?.length && !me.evolving && (id === 'xeno' || id === 'mutant' || id === 'android')) add(id === 'xeno' ? 'evolveXeno' : id === 'mutant' ? 'evolveMutant' : 'evolveAndroid', 3)
  // 背包
  if ((me.inv ?? []).some(Boolean)) add('item', 25)
  const suitAt = invSlot(me, isSuitItem)
  if (suitAt >= 0 && !suited(v)) add('suit', 22, { k: suitAt + 1 })
  const smp = invSlot(me, (i) => i === 'geneSampler')
  if (smp >= 0) add('sampler', 21, { k: smp + 1 })
  const res = invSlot(me, (i) => i === 'gitResolver')
  if (res >= 0) add('resolver', 21, { k: res + 1 })
  const core = invSlot(me, (i) => i === 'memoryCore')
  if (core >= 0) add('core', 21, { k: core + 1 })
  if ((me.gitReports?.length ?? 0) > 0) add('report', 15)
  // 狀態
  const hp = v.self?.hp ?? 0
  const mhp = v.self?.mhp ?? 0
  // 低血量：背包有醫療品才叫他用背包裡的，沒有就指向醫療補給／醫護兵
  if (mhp > 0 && hp > 0 && hp / mhp < 0.35 && !me.evolving) add(invSlot(me, (i) => itemDef(i)?.cat === 'medical') >= 0 ? 'lowHp' : 'lowHpNoKit', 1)
  // 被寄生／感染朊毒（自己的狀態清單本來就看得到）：人類死時會被轉化，教他用抗體包
  if (id === 'human') {
    const inf = (v.self?.b ?? []).map((b) => buffDef(b)?.infection).find((x) => x === 'parasite' || x === 'prion')
    if (inf) add(inf === 'parasite' ? 'parasited' : 'prioned', 1)
  }
  if (me.zone === 0) add('space', 23)
  else if (v.zoneStation?.startsWith('ship:')) add('shipInside', 23)
  if (me.fac) add('facility', 26)
  // 身旁的設施
  const seen = new Set<string>()
  for (const n of v.near) {
    for (const [test, r, mk] of NEAR) {
      if (n.dist > r || !test(n.d)) continue
      const h = mk(id, v)
      if (h && !seen.has(h.id)) {
        seen.add(h.id)
        out.push(h)
      }
      break
    }
  }
  return out
}

// ───────── 讀取 client 世界 ─────────

function viewFromWorld(): GuideView {
  const me = world.me
  const self = world.ents.get(me.unit ?? 0)
  const near: GuideView['near'] = []
  if (self && me.alive !== false) {
    for (const e of world.ents.values()) {
      if (e === self || e.s.z !== self.s.z || !e.s.d) continue
      const dist = Math.hypot(e.x - self.x, e.y - self.y)
      if (dist <= 5) near.push({ d: e.s.d, dist })
    }
  }
  const zs = startInfo.value?.zones?.find((z) => z[0] === me.zone)?.[2]
  return { me, w: world.w, self: self ? { d: self.s.d, hp: self.s.hp, mhp: self.s.mhp, b: self.s.b } : undefined, near, zoneStation: zs }
}

/** 全螢幕畫面擋住時暫停提示（角色揭露、結算、圖鑑、說明、筆記、進化選單）*/
function blocked(): boolean {
  if (guideOpen.value || codexOpen.value || notesOpen.value || evolveOpen.value) return true
  return !!document.querySelector('[data-testid="reveal"],[data-testid="end"]')
}

/** 元素實際的縮放倍率（介面套了 CSS zoom）*/
function zoomOf(el: HTMLElement): number {
  const h = el.offsetHeight
  if (h > 0) return el.getBoundingClientRect().height / h
  return parseFloat(getComputedStyle(el).zoom) || 1
}

/** 目標面板＋提示能用的高度（CSS px）：不超過 40vh，也不壓到聊天紀錄（聊天由下往上長，量它目前的頂端）*/
function dockMax(dock: HTMLElement): number {
  const z = zoomOf(dock)
  const top = dock.getBoundingClientRect().top
  let limit = window.innerHeight * 0.4
  const chat = document.querySelector('.chat') as HTMLElement | null
  const r = chat?.getBoundingClientRect()
  if (r && r.height > 0) limit = Math.min(limit, r.top - top - 10 * z)
  return Math.max(48, Math.floor(limit / z))
}

// ───────── 介面 ─────────

const ID_COLOR: Record<Identity, [accent: string, text: string]> = {
  human: ['#9fe7ff', '#9fe7ff'],
  xeno: ['#7a3cff', '#b28cff'],
  mutant: ['#c8323c', '#ff6b72'],
  android: ['#ffb000', '#ffc23d'],
  spawnXeno: ['#7a3cff', '#b28cff'],
  spawnMutant: ['#c8323c', '#ff6b72'],
  dead: ['#8b7bb8', '#c9b6ff'],
  deadAndroid: ['#ffb000', '#ffc23d'],
  spectator: ['#8b9aa8', '#cfd8df'],
}

const HINT_ICON: Record<string, string> = {
  start: 'move',
  keys: 'info',
  ally: 'attack',
  spectate: 'eye',
  xenoShed: 'tentacle',
  xenoAlien: 'infect',
  xenoSpawnForm: 'infect',
  mutantDevour: 'devour',
  androidFf: 'gear',
  spawnXeno: 'infect',
  spawnMutant: 'infect',
  evolveXeno: 'evolve',
  evolveMutant: 'evolve',
  evolveAndroid: 'evolve',
  androidFull: 'evolve',
  item: 'info',
  suit: 'suit',
  sampler: 'dna',
  resolver: 'dna',
  report: 'scan',
  vendor: 'vendor',
  git: 'dna',
  console: 'gear',
  ship: 'ship',
  shipInside: 'ship',
  space: 'ship',
  facility: 'gear',
  drone: 'drone',
  fab: 'gear',
  fabAndroid: 'gear',
  core: 'core',
  pod: 'pod',
  rummage: 'gear',
  lowHp: 'heal',
  lowHpNoKit: 'heal',
  parasited: 'infect',
  prioned: 'infect',
  death: 'skull',
  deathAndroid: 'core',
  notes: 'info',
  stab: 'clock',
}


/** 說明面板：各身分的玩法要點 */
export const ROLE_TIPS: Record<Identity, string[]> = {
  human: ['human.1', 'human.2', 'human.3', 'human.4'],
  xeno: ['xeno.1', 'xeno.2', 'xeno.3', 'xeno.4', 'xeno.5', 'xeno.6'],
  mutant: ['mutant.1', 'mutant.2', 'mutant.3', 'mutant.4', 'mutant.5', 'mutant.6'],
  android: ['android.1', 'android.2', 'android.3', 'android.4', 'android.5'],
  spawnXeno: ['spawn.1', 'spawn.2', 'spawn.3', 'spawnXeno.4'],
  spawnMutant: ['spawn.1', 'spawn.2', 'spawn.3'],
  dead: ['dead.1', 'dead.2', 'dead.3', 'dead.4'],
  deadAndroid: ['deadAndroid.1', 'deadAndroid.2', 'deadAndroid.3', 'deadAndroid.4'],
  spectator: ['spectator.1', 'spectator.2', 'spectator.3'],
}

/** 小地圖圖例：單位的畫法見 Hud.tsx 的 drawMinimapUnit，設施顏色見 poiColor（單位四項另外畫，見 MapLegend）*/
const MAP_LEGEND: [color: string, key: string, dot: boolean][] = [
  ['#ffc23d', 'door', false],
  ['#7fd8ff', 'console', false],
  ['#ff7fa0', 'medical', false],
  ['#ff9a3d', 'suit', false],
  ['#5cf2a5', 'vendor', false],
  ['#33ffd1', 'git', false],
  ['#8a9aa8', 'fac', false],
]

export function Guide() {
  void snapTick.value
  void lang.value
  const [fold, setFold] = useState(() => lsGet(K_FOLD) === '1')
  const [, rerender] = useState(0)
  const queue = useRef<HintQueue | null>(null)
  if (!queue.current) queue.current = new HintQueue(store)
  const dock = useRef<HTMLDivElement>(null)
  const limit = useRef(MAX_HINTS)
  /** 版面放不下時，目標面板暫時精簡的程度（0 完整 → 3 只剩標題）*/
  const squeeze = useRef(0)
  const layoutKey = useRef('')
  const measured = useRef(0)
  const hover = useRef<string | null>(null)
  const [maxH, setMaxH] = useState<number | null>(null)

  // G 開關說明；說明開著時 Esc 只關說明（不打開進化選單）
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.code === 'Escape' && guideOpen.value) {
        e.preventDefault()
        e.stopImmediatePropagation()
        guideOpen.value = false
        return
      }
      if (e.code !== 'KeyG' || e.repeat || e.ctrlKey || e.metaKey || e.altKey) return
      if (typingInField() || chatOpen.value || codexOpen.value) return
      // 其他對話框（設定、遊戲選單、進化）開著時不疊開說明
      if (!guideOpen.value && dialogOpen()) return
      e.preventDefault()
      guideOpen.value = !guideOpen.value
    }
    window.addEventListener('keydown', onKey, true)
    return () => {
      window.removeEventListener('keydown', onKey, true)
      guideOpen.value = false
    }
  }, [])

  // 每 250 ms：檢查觸發條件、推進提示倒數、量版面
  useEffect(() => {
    let last = performance.now()
    let epoch = hintsEpoch.value
    let n = 0
    const step = () => {
      const now = performance.now()
      const dt = Math.min(1, (now - last) / 1000)
      last = now
      const q = queue.current!
      let changed = false
      if (epoch !== hintsEpoch.value) {
        epoch = hintsEpoch.value
        q.clear(true)
        changed = true
      }
      // 關掉提示、或已出局（死亡即退出：什麼都不能做了）：情境提示全部停止並清掉
      if (!hintsEnabled.value || world.me.booted) {
        if (q.active.length || q.queue.length) {
          q.clear()
          changed = true
        }
      } else {
        const hints = detectHints(viewFromWorld())
        for (const h of hints) q.offer(h)
        if (!q.active.length) limit.current = MAX_HINTS
        changed = q.tick(dt, blocked(), limit.current, hover.current, new Set(hints.map((h) => h.id))) || changed
      }
      if (dock.current && n++ % 4 === 0) {
        const m = dockMax(dock.current)
        setMaxH((p) => (p !== null && Math.abs(p - m) < 2 ? p : m))
      }
      if (changed || q.active.length) rerender((x) => x + 1)
    }
    const h = setInterval(step, 250)
    return () => clearInterval(h)
  }, [])

  // 版面放不下（高度上限見 dockMax）：先把第二則提示退回佇列，再逐步精簡目標面板。
  // 顯示中的提示、可用高度或收合狀態一變，就從完整面板重新試（都在同一次繪製前完成，不會閃）
  useLayoutEffect(() => {
    const el = dock.current
    const q = queue.current!
    if (!el) return
    const key = `${q.active.map((a) => a.id).join(',')}|${maxH}|${fold}`
    const fresh = key !== layoutKey.current
    if (fresh) {
      layoutKey.current = key
      if (squeeze.current) {
        squeeze.current = 0
        rerender((x) => x + 1)
        return
      }
    }
    // 每次快照都會重繪：沒有提示、版面也沒變時不必量（量高度會強迫瀏覽器同步排版）
    if (!fresh && !q.active.length && !squeeze.current && measured.current++ % 20 !== 0) return
    if (el.scrollHeight <= el.clientHeight + 1) return
    if (q.active.length >= 2) {
      q.deferLast()
      limit.current = 1
    } else if (squeeze.current < 3 && !fold) squeeze.current++
    else return
    rerender((x) => x + 1)
  })

  const v = viewFromWorld()
  const obj = objectiveFor(v)
  const q = queue.current
  const toggleFold = () => {
    setFold(!fold)
    lsSet(K_FOLD, fold ? '0' : '1')
  }
  return (
    <>
      {obj && !notesOpen.value && (
        <div class="guide-dock" ref={dock} style={maxH ? { maxHeight: `${maxH}px` } : undefined}>
          <Objectives obj={obj} fold={fold} squeeze={squeeze.current} onFold={toggleFold} />
          {q.active.length > 0 && (
            <div class="guide-toasts" data-testid="guide-toasts">
              {q.active.map((a) => (
                <div
                  key={a.id}
                  class={'panel guide-toast' + (WARN_HINTS.has(a.id) ? ' warn' : '')}
                  data-testid={'guide-toast-' + a.id}
                  role="status"
                  onClick={() => {
                    q.dismiss(a.id)
                    if (hover.current === a.id) hover.current = null
                    rerender((x) => x + 1)
                  }}
                  onMouseEnter={() => (hover.current = a.id)}
                  onMouseLeave={() => (hover.current = null)}
                >
                  <div class="guide-toast-t">
                    <Icon name={HINT_ICON[a.id] ?? 'info'} size={16} color="currentColor" />
                    <span>{t('guide.h.' + a.id + '.t')}</span>
                  </div>
                  <div class="guide-toast-b">{t('guide.h.' + a.id, a.args)}</div>
                  <span class="guide-toast-x" aria-label={t('guide.toast.close')}>
                    ✕
                  </span>
                  <i class="guide-toast-life" style={{ transform: `scaleX(${Math.max(0, a.left / a.life)})` }} />
                </div>
              ))}
            </div>
          )}
        </div>
      )}
      {guideOpen.value && <HelpPanel id={identityOf(world.me)} v={v} />}
    </>
  )
}

function Objectives({ obj, fold, squeeze, onFold }: { obj: Objective; fold: boolean; squeeze: number; onFold: () => void }) {
  const [accent, text] = ID_COLOR[obj.id]
  const ep = obj.ep
  return (
    <div class={'panel guide-obj' + (fold ? ' folded' : '') + (squeeze && !fold ? ' sq' + squeeze : '')} data-testid="guide-objectives" style={{ '--gc': accent, '--gt': text }}>
      <div class="guide-head">
        <span class="guide-title">
          <span class="guide-role" data-testid="guide-role">
            {t('guide.id.' + obj.id)}
          </span>
          {obj.sub && <span class="guide-sub">{obj.sub}</span>}
          {(fold || squeeze > 0) && ep && <span class="guide-sub mono">{t('guide.ep', { ep: ep.ep, next: ep.next })}</span>}
        </span>
        <button class="small ghost guide-btn" data-testid="guide-help-btn" onClick={() => (guideOpen.value = !guideOpen.value)} {...tipProps(() => ({ title: t('guide.btn.helpTip'), tag: 'G' }))}>
          {t('guide.btn.help')}
        </button>
        <button class="small ghost guide-btn guide-fold" data-testid="guide-fold" aria-expanded={!fold} onClick={onFold} {...tipProps(() => ({ title: t(fold ? 'guide.btn.unfold' : 'guide.btn.fold') }))}>
          {fold ? '▸' : '▾'}
        </button>
      </div>
      {!fold && (
        <>
          <div class="guide-goal">
            <span class="guide-goal-l">{t('guide.goalLabel')}</span>
            <span>{t(obj.goal)}</span>
          </div>
          {ep && (
            <div class="guide-ep" data-testid="guide-ep">
              <span class="mono">{t('guide.ep', { ep: ep.ep, next: ep.next })}</span>
              <span class="guide-epbar">
                <i style={{ transform: `scaleX(${Math.min(1, ep.ep / ep.next)})` }} />
              </span>
              <span class={ep.ready ? 'guide-ready' : 'dim'}>{ep.ready ? t('guide.epReady') : t('guide.epLeft', { n: Math.max(0, ep.next - ep.ep) })}</span>
            </div>
          )}
          <ul class="guide-steps">
            {obj.steps.map((s) => (
              <li key={s.key} class={s.dim ? 'dim' : undefined}>
                {t(s.key, s.args)}
              </li>
            ))}
          </ul>
        </>
      )}
    </div>
  )
}

/** 小地圖圖例：單位四項照 drawMinimapUnit 的實際畫法（形狀＋外框），設施照 poiColor */
function MapLegend() {
  const me = world.me
  const mine = startInfo.value?.players.find((p) => p.slot === me.slot)?.color
  const myColor = mine !== undefined ? (PLAYER_COLORS[mine]?.hex ?? '#cfd8df') : '#cfd8df'
  return (
    <div class="guide-legend" data-testid="guide-legend">
      <div>
        <i class="guide-sw dot mm-self" style={{ background: myColor }} />
        {t('guide3.map.selfRing')}
      </div>
      <div>
        <i class="guide-sw dot mm-players" />
        {t('guide3.map.playersDot')}
      </div>
      <div>
        <i class="guide-sw mm-hostile" />
        {t('guide3.map.hostileDiamond')}
      </div>
      <div>
        <i class="guide-sw dot mm-other" />
        {t('guide3.map.otherDot')}
      </div>
      {MAP_LEGEND.map(([col, k, dot]) => (
        <div key={k}>
          <i class={'guide-sw' + (dot ? ' dot' : '')} style={{ background: col }} />
          {t('guide.map.' + k)}
        </div>
      ))}
      <div>
        <i class="guide-sw frame" />
        {t('guide.map.view')}
      </div>
    </div>
  )
}

function HelpPanel({ id, v }: { id: Identity | null; v: GuideView }) {
  const close = () => (guideOpen.value = false)
  const me = v.me
  const booted = id === 'dead' && !!me.booted
  const tips = id ? (booted ? ['guide3.r.booted.1', 'guide3.r.booted.2'] : ROLE_TIPS[id].map((k) => 'guide.r.' + k)).map((k) => t(k)) : []
  const c = CLASSES.get(me.classId ?? '')
  if (c && (id === 'human' || id === 'xeno' || id === 'mutant' || id === 'android')) {
    tips.push(t(id === 'human' ? 'guide.r.class' : 'guide.r.cover', { cls: loc(c.name), desc: loc(c.desc) }))
    const phd = phdText(me, 'play1.help.phd')
    if (phd) tips.push(phd)
  }
  // 放不下要捲動時，在底部顯示明顯的捲動提示（捲到底就收起來）
  const body = useRef<HTMLDivElement>(null)
  const [more, setMore] = useState(false)
  const check = () => {
    const el = body.current
    if (el) setMore(el.scrollHeight - el.scrollTop - el.clientHeight > 4)
  }
  useLayoutEffect(check)
  useEffect(() => {
    // 視窗或介面縮放改變（--ui-zoom 不會觸發 resize）時重新判斷
    const el = body.current
    const ro = typeof ResizeObserver === 'undefined' ? null : new ResizeObserver(check)
    if (el && ro) {
      ro.observe(el)
      for (const c of el.children) ro.observe(c)
    }
    window.addEventListener('resize', check)
    return () => {
      ro?.disconnect()
      window.removeEventListener('resize', check)
    }
  }, [])
  return (
    <div class="guide-help-back" onClick={(e) => e.target === e.currentTarget && close()}>
      <div class="panel guide-help" data-testid="guide-help" role="dialog" aria-label={t('guide.help.title')}>
        <div class="guide-help-head">
          <h2>{t('guide.help.title')}</h2>
          <span class="grow" />
          <button class="small ghost" data-testid="guide-help-close" onClick={close}>
            {t('guide.btn.close')} ✕
          </button>
        </div>
        <div class="guide-help-body" ref={body} onScroll={check}>
          <div class="guide-col">
            <section>
              <h3>{t('guide.help.controls')}</h3>
              <div class="guide-keys">
                {HELP_CONTROLS.map((k) => (
                  <div class="guide-key-row" key={k}>
                    <span class="guide-kbd">{t('guide.ctl.' + k + '.k')}</span>
                    <span>{t('guide.ctl.' + k)}</span>
                  </div>
                ))}
              </div>
            </section>
          </div>
          <div class="guide-col">
            {id && (
              <section data-testid="guide-help-role">
                <h3 style={{ color: ID_COLOR[id][1] }}>{t('guide.help.role', { role: t('guide.id.' + id) })}</h3>
                <ul class="guide-list">
                  {tips.map((s, i) => (
                    <li key={i}>{s}</li>
                  ))}
                </ul>
              </section>
            )}
            <section>
              <h3>{t('guide.help.map')}</h3>
              <MapLegend />
              <p class="dim">{t('guide.map.space')}</p>
            </section>
          </div>
          <div class="guide-col">
            <section>
              <h3>{t('guide.help.things')}</h3>
              <div class="guide-things">
                {HELP_THINGS.map((k) => (
                  <div key={k}>
                    <b>{t('guide.th.' + k + '.t')}</b>
                    <span>{t('guide.th.' + k)}</span>
                  </div>
                ))}
              </div>
            </section>
          </div>
        </div>
        {more && (
          <div class="guide-help-more" data-testid="guide-help-more" aria-hidden="true">
            <span>▼ {t('guide3.help.scroll')}</span>
          </div>
        )}
        <div class="dim guide-help-foot">
          <span>{t('guide3.help.moreLine')}</span>
          <span>{t('guide.help.foot')}</span>
        </div>
      </div>
    </div>
  )
}
