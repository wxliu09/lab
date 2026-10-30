// 每位玩家各自的快照（delta：只送變動欄位）。這裡是隱藏資訊的最後一道關卡：
// - 只放可見實體；
// - 永遠不放身分、陣營欄位；
// - 匿名單位（異形形態、蛋、繭）的擁有者、名字、顏色一律遮蔽，除非觀看者本來就知道（本人或同陣營）；
// - 感染類 buff 只給本人與施放者陣營。
import type { Ent } from '../ent'
import type { Game, GamePlayer } from '../game'
import { EntFlag, type PrivateState, type SnapEntity, type Snapshot } from '../../shared/protocol/messages'
import { buffDef } from '../../shared/content/registry'
import { knowsOwner, pointVisible, type VisionResult, type VisionSource } from './vision'
import { privateState } from './private'

export interface ViewState {
  known: Map<number, SnapEntity>
  me: Map<string, string>
  doors: Map<string, number>
  w: Map<string, string>
  vs: string
  visible: Set<number>
  extraSources: (VisionSource & { until: number })[]
}

export function newViewState(): ViewState {
  return { known: new Map(), me: new Map(), doors: new Map(), w: new Map(), vs: '', visible: new Set(), extraSources: [] }
}

function sameFaction(g: Game, viewer: GamePlayer, slot: number): boolean {
  if (slot < 0) return false
  const o = g.players[slot]
  if (!o) return false
  const f = g.faction(o)
  return f !== 'crew' && f === g.faction(viewer)
}

export function entView(g: Game, viewer: GamePlayer, e: Ent): SnapEntity {
  const knows = knowsOwner(g, viewer, e)
  const own = e.owner === viewer.slot
  const ally = own || (knows && sameFaction(g, viewer, e.owner))
  const disguised = !knows && e.data.fake
  const fake = disguised ? (e.data.fake as { def: string; owner: number; name: string; color: number; cls: string }) : null
  let fl = 0
  const st = e.stats
  if (st.invuln) fl |= EntFlag.Invuln
  if (st.stealth) fl |= EntFlag.Stealth
  if (st.stunned) fl |= EntFlag.Stunned
  if (own) fl |= EntFlag.Mine
  if (ally && !own) fl |= EntFlag.Ally
  if (e.owner === -2) fl |= EntFlag.Hostile
  if (e.tags.has('corpse')) fl |= EntFlag.Corpse
  if (e.tags.has('flying')) fl |= EntFlag.Hover
  if (e.tags.has('structure') || e.data.item) fl |= EntFlag.Interactable
  if (e.illusion && ally) fl |= EntFlag.Hallucination
  if (e.buffs.some((b) => b.shield && b.shield > 0)) fl |= EntFlag.Shielded
  if (e.data.petrified) fl |= EntFlag.Petrified
  const s: SnapEntity = {
    i: e.id,
    d: fake ? fake.def : (e.data.viewDef ?? e.def.id),
    z: e.zone,
    x: Math.round(e.x * 100),
    y: Math.round(e.y * 100),
    f: Math.round(e.facing * 100),
    hp: Math.ceil(Math.max(0, e.hp)),
    mhp: Math.round(e.maxHp),
    o: fake ? fake.owner : knows ? e.owner : e.owner < 0 ? e.owner : -1,
    n: fake ? fake.name : knows ? (e.data.muteName ? '' : e.name) : '',
    c: fake ? fake.color : knows ? e.color : -1,
    cl: fake ? fake.cls : knows ? e.classId : '',
    st: e.anim,
    fl,
  }
  if (ally) {
    s.mp = Math.round(e.mp)
    s.mmp = Math.round(e.maxMp)
  }
  const buffs: string[] = []
  for (const b of e.buffs) {
    const bd = buffDef(b.id)
    if (!bd) continue
    if (bd.vis === 'all' || own || (bd.vis === 'casterFaction' && (b.srcSlot === viewer.slot || sameFaction(g, viewer, b.srcSlot))))
      buffs.push(b.id)
  }
  s.b = buffs
  if (e.animTarget) s.tg = e.animTarget
  if (e.x2) s.x2 = e.x2
  return s
}

const KEYS: (keyof SnapEntity)[] = ['d', 'z', 'x', 'y', 'f', 'hp', 'mhp', 'mp', 'mmp', 'o', 'n', 'c', 'cl', 'st', 'fl', 'tg']

function diff(prev: SnapEntity | undefined, cur: SnapEntity): SnapEntity | null {
  if (!prev) return cur
  const out: SnapEntity = { i: cur.i }
  let any = false
  for (const k of KEYS) {
    if (prev[k] !== cur[k]) {
      ;(out as unknown as Record<string, unknown>)[k] = cur[k] ?? null
      any = true
    }
  }
  const pb = prev.b?.join(',') ?? ''
  const cb = cur.b?.join(',') ?? ''
  if (pb !== cb) {
    out.b = cur.b
    any = true
  }
  if (JSON.stringify(prev.x2 ?? null) !== JSON.stringify(cur.x2 ?? null)) {
    out.x2 = cur.x2 ?? {}
    any = true
  }
  return any ? out : null
}

export function buildSnapshot(g: Game, p: GamePlayer, vis: VisionResult): Snapshot {
  const v = p.view
  const snap: Snapshot = { tick: g.world.tick, time: Math.round(g.time * 100) / 100, e: [], g: [] }
  const seen = new Set<number>()
  for (const e of vis.ents) {
    const cur = entView(g, p, e)
    seen.add(e.id)
    const d = diff(v.known.get(e.id), cur)
    if (d) snap.e.push(d)
    v.known.set(e.id, cur)
  }
  for (const id of v.known.keys()) {
    if (!seen.has(id)) {
      snap.g.push(id)
      v.known.delete(id)
    }
  }
  // 特效：只給看得到的人
  const fx = []
  for (const f of g.fx) {
    if (f.vis) {
      if (!f.vis.includes(p.slot)) continue
    } else if (f.e && seen.has(f.e)) {
      // 附著在看得到的實體上
    } else if (!pointVisible(g, vis, f.z, f.x, f.y)) continue
    const { vis: _v, ...rest } = f
    fx.push(rest)
  }
  if (p.fxOut.length) fx.push(...p.fxOut.splice(0))
  if (fx.length) snap.fx = fx
  // 視野來源
  const vsArr = vis.sources.map((s) => [s.zone, Math.round(s.x * 10), Math.round(s.y * 10), Math.round(s.r * 10)] as [number, number, number, number])
  const vsKey = JSON.stringify(vsArr)
  if (vsKey !== v.vs) {
    v.vs = vsKey
    snap.vs = vsArr
  }
  // 門
  let doors: Record<number, number> | undefined
  for (const [zid, set] of vis.doors) {
    const z = g.world.zones[zid]
    for (const di of set) {
      const d = z.doors[di]
      const code = d.broken ? 3 : d.locked ? 2 : d.open ? 1 : 0
      const key = zid * 10000 + di
      if (v.doors.get(String(key)) !== code) {
        v.doors.set(String(key), code)
        ;(doors ??= {})[key] = code
      }
    }
  }
  if (doors) snap.doors = doors
  // 私有狀態
  const me = privateState(g, p)
  let meDiff: Partial<PrivateState> | undefined
  for (const [k, val] of Object.entries(me)) {
    const j = JSON.stringify(val)
    if (v.me.get(k) !== j) {
      v.me.set(k, j)
      ;((meDiff ??= {}) as Record<string, unknown>)[k] = val
    }
  }
  if (meDiff) snap.me = meDiff
  // 全域公開狀態
  const wp = g.worldPublic()
  let wd: Record<string, unknown> | undefined
  for (const [k, val] of Object.entries(wp)) {
    const j = JSON.stringify(val)
    if (v.w.get(k) !== j) {
      v.w.set(k, j)
      ;(wd ??= {})[k] = val
    }
  }
  if (wd) snap.w = wd
  return snap
}
