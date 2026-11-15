// 變身被看到就曝光：異形褪去／披上人皮、眷屬甦醒／沉眠、假面者千面／卸面，以及從人形進化（結繭、變肉團、仿生人換機體）。
// 這些動作一旦被別人看見，就等於公開「那個人是異類」。自己的視野裡有其他人形單位時，施法條與技能說明加上警告，
// 按下技能（或打開進化選單）時跳一次本機提示。
// 只用快照裡看得到的東西（同一個 zone、自己看得到的單位、外觀與旗標）；看不到的人（隱形、牆後）照樣算不到，不會多洩漏什麼。
import { UNITS } from '../shared/content/registry'
import type { Tag } from '../shared/content/types'
import { EntFlag, type PrivateState, type SnapEntity } from '../shared/protocol/messages'

/** 被看到就曝光的技能（content/roleAbilities.ts、forms/xeno.ts 的 id）*/
export const EXPOSING_ABILITIES: ReadonlySet<string> = new Set(['xeno.form', 'xeno.human', 'xeno.spawnForm', 'xeno.spawnHuman', 'ab.mimic.masks', 'xeno.unmask'])

/** 會看的「人形」單位：人員（玩家、NPC 船員）、異形／變種人形態、仿生人機體 */
const WATCHER_TAGS: Tag[] = ['personnel', 'xenoForm', 'mutantForm', 'chassis']
/** 不算目擊者的東西 */
const NOT_WATCHER_TAGS: Tag[] = ['structure', 'summon', 'device', 'egg', 'cocoon', 'corpse', 'noTarget']

/** 這個單位算不算看得到你的人形單位（自己、自己的單位、知道是同一邊的盟友、屍體不算）*/
export function isWatcher(s: SnapEntity, myIds: ReadonlySet<number>, myZone: number | undefined): boolean {
  if (myIds.has(s.i) || s.z !== myZone) return false
  const fl = s.fl ?? 0
  if (fl & (EntFlag.Mine | EntFlag.Ally | EntFlag.Corpse)) return false
  const d = s.d ?? ''
  if (d.startsWith('item:') || d.startsWith('vendor.') || d.startsWith('station.')) return false
  const tags = UNITS.get(d)?.tags ?? []
  if (NOT_WATCHER_TAGS.some((t) => tags.includes(t))) return false
  return WATCHER_TAGS.some((t) => tags.includes(t)) || (s.o ?? -1) >= 0
}

/** 自己視野裡看得到你的人形單位數 */
export function watcherCount(w: { me: Partial<PrivateState>; ents: ReadonlyMap<number, { s: SnapEntity }> }): number {
  const unit = w.me.unit ?? 0
  const ctl = w.me.control ?? 0
  const mine = new Set([unit, ctl].filter(Boolean))
  const myZone = w.ents.get(unit)?.s.z
  if (myZone === undefined) return 0
  let n = 0
  for (const e of w.ents.values()) if (isWatcher(e.s, mine, myZone)) n++
  return n
}

/**
 * 自己現在的樣子是「認得出是誰」的（有名字或玩家色）：從這個樣子進化（結繭、變肉團、換機體）會被認出來。
 * 已經是匿名的異形形態時進化，別人只看到一隻異形結繭，不知道是誰。
 */
export function looksNamed(w: { me: Partial<PrivateState>; ents: ReadonlyMap<number, { s: SnapEntity }> }): boolean {
  const s = w.ents.get(w.me.unit ?? 0)?.s
  return !!s && (!!s.n || (s.c ?? -1) >= 0)
}

/** 會變身的身分（異形、變種人、仿生人；眷屬也會變身）*/
export function canShapeshift(me: Partial<PrivateState>): boolean {
  return me.role === 'xeno' || me.role === 'mutant' || me.role === 'android' || !!me.spawn
}
