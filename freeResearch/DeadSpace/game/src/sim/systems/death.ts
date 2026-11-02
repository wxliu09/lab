// 死亡：屍體、掉落物、玩家進入旁觀、給死者的死因說明；身分相關的轉化與公告由 roles 系統的 hook 處理
import { BUFFS, UNITS, VENDORS, itemDef, unitDef } from '../../shared/content/registry'
import type { Loc, Tag } from '../../shared/content/types'
import type { SnapEntity } from '../../shared/protocol/messages'
import { NEUTRAL, type Ent } from '../ent'
import type { Game, GamePlayer } from '../game'
import { DAMAGE_HOOKS, DEATH_HOOKS, type DmgOpts } from './damage'
import { dropOnGround } from './items'
import { entView } from './snapshot'

/** 屍體保留秒數（玩家屍體永久，供吞食／辨認）*/
const CREATURE_CORPSE_LIFE = 90

export function makeCorpse(g: Game, u: Ent): Ent | null {
  if (!u.def.corpse) return null
  const c = g.world.spawn(unitDef('corpse'), u.zone, u.x, u.y, NEUTRAL)
  c.facing = u.facing
  c.data.of = u.def.id
  c.data.viewDef = u.def.id
  c.classId = u.classId
  c.data.wasMain = u.isMain
  c.data.slot = u.isMain ? u.owner : -1
  c.data.android = !!u.data.android
  if (!u.isMain) c.lifeEnd = g.time + CREATURE_CORPSE_LIFE
  c.anim = 4
  c.x2 = { of: u.def.id, cl: u.classId }
  return c
}

DEATH_HOOKS.push((g, u, _killer) => {
  if (u.data.noDrops) return
  // 掉落背包與身上的防護服
  if (u.inv) {
    for (let i = 0; i < u.inv.length; i++) {
      const it = u.inv[i]
      if (it) dropOnGround(g, u.zone, u.x, u.y, it)
      u.inv[i] = null
    }
  }
  if (u.suit) {
    dropOnGround(g, u.zone, u.x, u.y, u.suit)
    u.suit = null
  }
  // 生物掉落表
  if (u.def.drops) {
    for (const d of u.def.drops) {
      if (g.world.rng.chance(d.p)) {
        dropOnGround(g, u.zone, u.x, u.y, { id: d.item, charges: 0, cdUntil: 0, uid: g.world.rng.id31() })
        break
      }
    }
  }
})

DEATH_HOOKS.push((g, u) => {
  if (!u.data.converted) makeCorpse(g, u)
  // 瓦礫釋放導航格
  if (u.data.navIdx !== undefined) {
    const nav = g.world.zones[u.zone].nav
    if (nav && nav.dyn[u.data.navIdx] > 0) nav.dyn[u.data.navIdx]--
  }
})

/** 玩家主單位死亡的基本處理（身分轉化與公告在 roles 系統）*/
DEATH_HOOKS.push((g, u, killer, killerSlot) => {
  if (!u.isMain || u.owner < 0) return
  const p = g.players[u.owner]
  if (!p || p.main !== u.id || u.data.converted) return
  // 死因要在死者還「活著」時判定：死後就不再共享陣營視野、也不再認得同陣營的匿名單位
  const report = p.bot || p.left ? null : deathReport(g, p, u, killer, killerSlot)
  g.onMainDeath(p, u, killer, killerSlot)
  if (report && !p.alive) sendDeathReport(g, p, report)
  p.data.hitLog = undefined
  p.data.lastHitSrc = undefined
})

// ───────── 死因說明（只給死者本人）─────────
// 傷害來源一律用「死者當下看到的樣子」描述，規則與快照相同（entView）：偽裝的就是偽裝對象的名字、
// 匿名形態只說是哪一種形態、死者當時看不見的來源只說「看不見的攻擊者」。
// 描述只由 entView 的結果（名字 n、外觀 d、擁有者 o）與開局公開的玩家名單決定，不讀身分或真正的擁有者；
// 合併同一來源時也只比對外觀描述，不比對實體 id（否則「偽裝成 Bob」和「匿名異形」會被併成一筆而露餡）。

/** 一筆傷害來源的外觀描述；k 直接對應私人訊息 key（death.cause.* / death.hit.*）*/
export interface HitView {
  k: 'named' | 'namedAs' | 'owned' | 'anon' | 'unit' | 'unseen' | 'dot' | 'boom' | 'fire' | 'blast' | 'env' | 'self' | 'shutdown' | 'purged' | 'unknown'
  /** 看得到的名字，或看得到的擁有者名字 */
  n?: string
  /** 外觀 def id（dot 時是 buff id），只用來查顯示名稱 */
  d?: string
}

interface HitRec {
  key: string
  v: HitView
  dmg: number
  t: number
}

export interface DeathReport {
  cause: HitView
  /** 擊殺者以外、最近的其他傷害來源（新的在前）*/
  hits: { v: HitView; dmg: number }[]
}

/** 只統計這麼久以內的傷害來源（秒）*/
const HIT_WINDOW = 30
/** 每位玩家最多記住幾種不同的來源 */
const HIT_KEEP = 6
/** 死因之外最多再列幾個來源（死因＋這些 = 最後 3 個來源）*/
const HIT_LIST = 2
/** 匿名形態的外觀（異形形態、變種形態、仿生人機體、蛋）：沒有名字、擁有者未知時，說成「匿名的某種形態」*/
const FORM_TAGS: ReadonlySet<Tag> = new Set<Tag>(['xenoForm', 'mutantForm', 'chassis', 'egg'])

function lookName(d: string): Loc | undefined {
  if (d.startsWith('item:')) return itemDef(d.slice(5))?.name
  const u = UNITS.get(d)
  if (u) return u.name
  if (d.startsWith('vendor.')) return VENDORS.get(d.slice(7))?.name
  return undefined
}

/** 把觀看者眼中的實體（entView 的結果）變成死因描述；只讀 sv 的欄位與公開名單 */
export function describeView(g: Game, sv: SnapEntity): HitView {
  const d = sv.d ?? ''
  const def = UNITS.get(d)
  const known = !!lookName(d)
  if (sv.n) return !known || def?.tags.includes('personnel') ? { k: 'named', n: sv.n } : { k: 'namedAs', n: sv.n, d }
  if (!known) return { k: 'unknown' }
  const o = sv.o ?? -1
  const owner = o >= 0 ? g.players[o] : undefined
  if (owner) return { k: 'owned', n: owner.baseName, d }
  if (o === -1 && def?.tags.some((t) => FORM_TAGS.has(t))) return { k: 'anon', d }
  return { k: 'unit', d }
}

/** 某個實體在死者眼中是什麼（看不見就只說看不見）*/
function entSource(g: Game, p: GamePlayer, victim: Ent, src: Ent): HitView {
  if (src === victim || src.owner === p.slot) return { k: 'self' }
  if (!p.view.visible.has(src.id)) return { k: 'unseen' }
  return describeView(g, entView(g, p, src))
}

function hitView(g: Game, p: GamePlayer, victim: Ent, src: Ent | null, o: DmgOpts): HitView {
  if (o.lethal) return { k: 'boom' }
  if (o.buff) return { k: 'dot', d: o.buff }
  if (src) return entSource(g, p, victim, src)
  // 來源實體已不在：srcSlot 是真正的擁有者，只能用來判斷「是不是自己」，不能拿來描述別人
  if (o.srcSlot === p.slot) return { k: 'self' }
  if (o.kind === 'fire') return { k: 'fire' }
  if (o.kind === 'blast') return { k: 'blast' }
  return { k: 'env' }
}

const hitKey = (v: HitView): string => `${v.k}|${v.n ?? ''}|${v.d ?? ''}`

/** 記錄打在玩家主單位上的每一筆傷害（依外觀合併）*/
DAMAGE_HOOKS.push((g, src, t, amount, o) => {
  if (!t.isMain || t.owner < 0 || amount <= 0) return
  const p = g.players[t.owner]
  if (!p || p.bot || !p.alive || p.main !== t.id) return
  const v = hitView(g, p, t, src, o)
  const key = hitKey(v)
  const log = ((p.data.hitLog as HitRec[] | undefined) ??= [])
  const i = log.findIndex((r) => r.key === key)
  const rec = i >= 0 ? log.splice(i, 1)[0] : { key, v, dmg: 0, t: g.time }
  if (g.time - rec.t > HIT_WINDOW) rec.dmg = 0
  rec.dmg += amount
  rec.t = g.time
  log.push(rec)
  if (log.length > HIT_KEEP) log.shift()
  p.data.lastHitSrc = { id: src?.id ?? 0, t: g.time }
})

export function deathReport(g: Game, p: GamePlayer, u: Ent, killer: Ent | null, killerSlot: number): DeathReport {
  const log = (p.data.hitLog as HitRec[] | undefined) ?? []
  const last = log[log.length - 1]
  const lh = p.data.lastHitSrc as { id: number; t: number } | undefined
  let cause: HitView
  if (u.data.deathCause) cause = { k: u.data.deathCause as HitView['k'] }
  // 致命的那一下剛記錄過（同一 tick、同一個來源）：用當時記下的外觀
  else if (last && last.t === g.time && lh && lh.t === g.time && lh.id === (killer?.id ?? 0)) cause = last.v
  else if (killer) cause = entSource(g, p, u, killer)
  else if (killerSlot === p.slot) cause = { k: 'self' }
  // spawn 被自己的主腦清除（-liquidate）
  else if (p.spawnOf && p.stayDead) cause = { k: 'purged' }
  else cause = { k: 'unknown' }
  const ck = hitKey(cause)
  const hits = log
    .filter((r) => r.key !== ck && g.time - r.t <= HIT_WINDOW)
    .reverse()
    .slice(0, HIT_LIST)
    .map((r) => ({ v: r.v, dmg: r.dmg }))
  return { cause, hits }
}

function hitArgs(v: HitView): Record<string, string> {
  const a: Record<string, string> = {}
  if (v.n) a.n = v.n
  const name = v.d ? (v.k === 'dot' ? BUFFS.get(v.d)?.name : lookName(v.d)) : undefined
  if (name) {
    // client 依語言挑 uz／ue（sim 不知道玩家用哪種語言）
    a.uz = name.zh
    a.ue = name.en
  }
  return a
}

export function sendDeathReport(g: Game, p: GamePlayer, r: DeathReport): void {
  g.privateLine(p.slot, 'death.cause.' + r.cause.k, hitArgs(r.cause))
  for (const h of r.hits) g.privateLine(p.slot, 'death.hit.' + h.v.k, { ...hitArgs(h.v), dmg: Math.max(1, Math.round(h.dmg)) })
}

/** 召喚物到期、致命區 */
export function stepLife(g: Game): void {
  const t = g.time
  for (const u of g.world.ents.values()) {
    if (u.lifeEnd && t >= u.lifeEnd) {
      if (u.alive && !u.tags.has('corpse') && !u.data.zoneObj) g.killEnt(u, null, -1)
      else g.world.remove(u)
    }
  }
}
