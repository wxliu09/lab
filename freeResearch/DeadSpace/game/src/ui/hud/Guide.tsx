// 遊戲內指引：目標面板（左上常駐、可收合）、情境提示（一次性 toast）、說明面板（G）。
// 只讀自己的私有狀態（world.me）、自己的主單位，以及快照裡本來就看得到的實體與全域狀態；
// 不顯示、也不暗示別人的身分。規則細節的出處見 strings/guide.ts 開頭。
import { effect, signal } from '@preact/signals'
import { useEffect, useLayoutEffect, useRef, useState } from 'preact/hooks'
import type { PrivateState, WorldPublic } from '../../shared/protocol/messages'
import { CLASSES, UNITS, abilityDef, buffDef, itemDef } from '../../shared/content/registry'
import '../../shared/content/index'
import { snapTick, startInfo, world } from '../../client/session'
import { chatOpen, evolveOpen, modalChecks, typingInField } from '../../client/input'
import { codexOpen } from './Codex'
import { notesOpen } from './Investigation'
import { addStrings, hasString, lang, loc, t } from '../i18n'
import { tipProps } from '../tooltip'
import { Icon } from '../icons'
import { GUIDE_EN, GUIDE_ZH, HELP_CONTROLS, HELP_THINGS } from '../strings/guide'
import '../guide.css'

addStrings(GUIDE_ZH, GUIDE_EN)

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

export class HintQueue {
  active: ActiveHint[] = []
  queue: Hint[] = []
  /** 這個佇列自己顯示過的（被退回佇列時不會因為「看過了」而被丟掉）*/
  private mine = new Set<string>()

  constructor(
    private store: HintStore,
    private life = HINT_LIFE,
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
   * 下次條件成立再排；退回佇列的提示已經記為看過，一定會顯示。回傳畫面是否有變。
   */
  tick(dt: number, blocked: boolean, max = MAX_HINTS, hold: string | null = null, current?: Set<string>): boolean {
    let changed = false
    if (current) this.queue = this.queue.filter((q) => this.mine.has(q.id) || current.has(q.id))
    if (blocked) return false
    for (const a of this.active) if (a.id !== hold) a.left -= dt
    const n = this.active.length
    this.active = this.active.filter((a) => a.left > 0)
    if (this.active.length !== n) changed = true
    while (this.active.length < max && this.queue.length) {
      const h = this.queue.shift()!
      if (!this.mine.has(h.id)) {
        if (this.store.has(h.id)) continue
        this.store.add(h.id)
        this.mine.add(h.id)
      }
      this.active.push({ ...h, left: this.life, life: this.life })
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
  // 職業特色的短句（標題已經寫了職業名）；沒有短句就用內容表的說明
  const phd = (v.self?.b ?? []).find((b) => b.startsWith('cls.phd.'))
  const short = 'guide.cls.' + c.id + (phd ? 'Phd' : '')
  const desc = hasString(lang.value, short) ? t(short, { phd: phd ? loc(buffDef(phd)?.name) : '' }) : loc(c.desc)
  return { key: 'guide.s.class', args: { cls: loc(c.name), desc }, dim: true }
}

export function objectiveFor(v: GuideView): Objective | null {
  const me = v.me
  const id = identityOf(me)
  if (!id) return null
  const steps: Step[] = []
  const add = (key: string, args?: Step['args']) => steps.push({ key, args })
  const ep = (me.epNext ?? 0) > 0 ? { ep: me.ep ?? 0, next: me.epNext!, ready: (me.canEvolve?.length ?? 0) > 0 } : undefined
  const ready = (me.canEvolve?.length ?? 0) > 0
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
      else if (smp >= 0) add('guide.s.samplerUse', { k: smp + 1 })
      else if (time < SAMPLER_AT) add('guide.s.samplerWait', { t: fmtTime(SAMPLER_AT - time) })
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
        add('guide.s.hide')
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
  return { id, goal: 'guide.goal.' + id, sub, steps: steps.slice(0, 4), ep: live ? ep : undefined }
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
  if (id === 'dead') add('death', 0)
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
  if (me.canEvolve?.length && (id === 'xeno' || id === 'mutant' || id === 'android')) add(id === 'xeno' ? 'evolveXeno' : id === 'mutant' ? 'evolveMutant' : 'evolveAndroid', 3)
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
  if (mhp > 0 && hp > 0 && hp / mhp < 0.35 && !me.evolving) add('lowHp', 1)
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
  death: 'skull',
  deathAndroid: 'core',
  notes: 'info',
  stab: 'clock',
}

const WARN_HINTS = new Set(['lowHp', 'death', 'deathAndroid', 'stab', 'androidFf'])

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

/** 小地圖圖例：顏色與 Hud.tsx 的 Minimap 一致 */
const MAP_LEGEND: [color: string, key: string, dot: boolean][] = [
  ['#9fe7ff', 'self', true],
  ['#ffb000', 'players', true],
  ['#ff3b3b', 'hostile', true],
  ['#cfd8df', 'other', true],
  ['#ffc23d', 'door', false],
  ['#7fd8ff', 'console', false],
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
      if (!hintsEnabled.value) {
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
        <span class="guide-role" data-testid="guide-role">
          {t('guide.id.' + obj.id)}
        </span>
        {obj.sub && <span class="guide-sub">{obj.sub}</span>}
        {(fold || squeeze > 0) && ep && <span class="guide-sub mono">{t('guide.ep', { ep: ep.ep, next: ep.next })}</span>}
        <span class="grow" />
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

function HelpPanel({ id, v }: { id: Identity | null; v: GuideView }) {
  const close = () => (guideOpen.value = false)
  const me = v.me
  const tips = id ? ROLE_TIPS[id].map((k) => t('guide.r.' + k)) : []
  const c = CLASSES.get(me.classId ?? '')
  if (c && (id === 'human' || id === 'xeno' || id === 'mutant' || id === 'android')) {
    tips.push(t(id === 'human' ? 'guide.r.class' : 'guide.r.cover', { cls: loc(c.name), desc: loc(c.desc) }))
  }
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
        <div class="guide-help-body">
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
              <div class="guide-legend">
                {MAP_LEGEND.map(([col, k, dot]) => (
                  <div key={k}>
                    <i class={'guide-sw' + (dot ? ' dot' : '') + (k === 'self' ? ' big' : '')} style={{ background: col }} />
                    {t('guide.map.' + k)}
                  </div>
                ))}
                <div>
                  <i class="guide-sw frame" />
                  {t('guide.map.view')}
                </div>
              </div>
              <p class="dim">{t('guide.map.space')}</p>
            </section>
            <section>
              <h3>{t('guide.help.more')}</h3>
              <ul class="guide-list">
                <li>{t('guide.more.codex')}</li>
                <li>{t('guide.more.chat')}</li>
                <li>{t('guide.more.tips')}</li>
              </ul>
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
        <div class="dim guide-help-foot">{t('guide.help.foot')}</div>
      </div>
    </div>
  )
}
