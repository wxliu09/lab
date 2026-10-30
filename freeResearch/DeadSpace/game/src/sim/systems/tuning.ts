// 除錯與調校指令的執行層（測試掛勾共用）。所有操作以短代碼識別，參數逐一驗證；結果只回給發送者。
import type { Game, GamePlayer, Role } from '../game'
import type { Ent } from '../ent'
import { FORMS, ITEMS, UNITS, itemDef, unitDef } from '../../shared/content/registry'
import { PLAYER_COLORS } from '../../shared/constants'
import { roomAt } from '../../shared/layout'
import { NEUTRAL } from '../ent'
import { heal } from './damage'
import { giveItem, makeItem, morph, wearSuit } from './items'
import { restockAll } from './vendors'
import { recomputeStats } from './buffs'
import { replaceMain } from './roleSystem'

export interface TuneResult {
  ok: boolean
  msg: string
  data?: unknown
}

type ArgT = 'who' | 'num' | 'bool' | 'str' | 'int' | 'opt'

interface Op {
  args: ArgT[]
  run: (t: Tuning, slot: number, a: unknown[]) => TuneResult
}

const ok = (msg: string, data?: unknown): TuneResult => ({ ok: true, msg, data })
const bad = (msg: string): TuneResult => ({ ok: false, msg })

export class Tuning {
  constructor(readonly g: Game) {}

  /** 依玩家槽位執行（經過驗證的入口）*/
  run(slot: number, code: string, args: unknown[]): TuneResult {
    const op = OPS[code]
    if (!op) return bad('?')
    if (args.length > op.args.length) return bad('args')
    for (let i = 0; i < args.length; i++) {
      const v = args[i]
      if (v === null || v === undefined) continue
      const ty = op.args[i]
      if ((ty === 'num' || ty === 'int') && (typeof v !== 'number' || !Number.isFinite(v))) return bad('args')
      if (ty === 'int' && !Number.isInteger(v)) return bad('args')
      if (ty === 'bool' && typeof v !== 'boolean') return bad('args')
      if ((ty === 'str' || ty === 'who') && typeof v !== 'string' && !(ty === 'who' && typeof v === 'number')) return bad('args')
    }
    try {
      return op.run(this, slot, args)
    } catch {
      return bad('error')
    }
  }

  /** who 參數 → 玩家清單；比對到多人時回傳候選字串 */
  resolve(slot: number, who: unknown, allowMany: boolean): GamePlayer[] | string {
    const g = this.g
    const all = g.allPlayers()
    const me = g.players[slot]
    if (who === undefined || who === null || who === 'me') return me ? [me] : []
    if (typeof who === 'number') {
      const p = all.find((q) => q.slot === who - 1)
      return p ? [p] : 'no match'
    }
    const s = String(who).trim().toLowerCase()
    const group = (pred: (p: GamePlayer) => boolean) => (allowMany ? all.filter(pred) : 'many')
    if (s === 'all') return group(() => true)
    if (s === 'humans') return group((p) => g.faction(p) === 'crew' && p.role !== 'android')
    if (s === 'xeno') return group((p) => g.faction(p) === 'xeno')
    if (s === 'mutant') return group((p) => g.faction(p) === 'mutant')
    if (s === 'android') return group((p) => p.role === 'android')
    if (/^\d{1,2}$/.test(s)) {
      const p = all.find((q) => q.slot === Number(s) - 1)
      return p ? [p] : 'no match'
    }
    const ci = PLAYER_COLORS.findIndex((c) => c.id === s)
    if (ci >= 0) {
      const p = all.find((q) => q.color === ci)
      return p ? [p] : 'no match'
    }
    const hits = all.filter((q) => q.name.toLowerCase().includes(s) || q.baseName.toLowerCase().includes(s))
    if (hits.length === 1) return hits
    if (hits.length === 0) return 'no match'
    return 'many: ' + hits.map((h) => `${h.slot + 1}:${h.baseName}`).join(', ')
  }

  /** 測試掛勾入口（Playwright／Vitest）*/
  hook(op: string, args: unknown[]): unknown {
    const g = this.g
    switch (op) {
      case 'status':
        return {
          time: g.time,
          players: g.allPlayers().map((p) => ({ slot: p.slot, role: p.role, alive: p.alive, classId: p.classId, spawn: p.spawnOf })),
        }
      case 'skip': {
        const secs = Number(args[0]) || 0
        const n = Math.min(20 * 3600, Math.round(secs * 20))
        for (let i = 0; i < n; i++) g.stepOnce()
        return { time: g.time }
      }
      case 'vision': {
        const p = g.players[Number(args[0])]
        if (!p) return { error: 'bad slot' }
        p.flags.wide = !!args[1]
        return { ok: true }
      }
      case 'role': {
        const p = g.players[Number(args[0])]
        const r = String(args[1])
        if (!p || !['human', 'xeno', 'mutant', 'android'].includes(r)) return { error: 'bad args' }
        setRole(g, p, r as Role)
        return { ok: true }
      }
      case 'run':
        return this.run(Number(args[0]) || 0, String(args[1]), (args[2] as unknown[]) ?? [])
      default:
        return { error: 'unknown hook ' + op }
    }
  }
}

function setRole(g: Game, p: GamePlayer, r: Role): void {
  g.setRole(p, r)
  const u = g.mainOf(p)
  if (!u || !u.tags.has('personnel')) return
  const extra = ((u.data.extraAbilities as string[]) ?? []).filter((a) => a !== 'xeno.form' && a !== 'mut.devour')
  if (r === 'xeno') extra.push('xeno.form')
  if (r === 'mutant') extra.push('mut.devour')
  u.data.extraAbilities = extra
  morph(g, u, u.def.id)
}

function targets(t: Tuning, slot: number, who: unknown, many = true): GamePlayer[] | TuneResult {
  const r = t.resolve(slot, who, many)
  if (typeof r === 'string') return bad(r)
  if (!r.length) return bad('no match')
  return r
}

function placeOf(g: Game, place: string, slot: number): { zone: number; x: number; y: number } | null {
  const s = place.trim()
  const me = g.mainOf(g.players[slot])
  const m = /^(-?\d+(?:\.\d+)?)\s*,\s*(-?\d+(?:\.\d+)?)$/.exec(s)
  if (m && me) return { zone: me.zone, x: Number(m[1]), y: Number(m[2]) }
  if (s === 'space') return { zone: 0, x: g.world.rng.range(-20, 20), y: g.world.rng.range(-20, 20) }
  const [zk, roomId] = s.split(':')
  const z = g.world.zones.find((q) => q.key === zk && q.alive)
  if (z?.layout) {
    const room = roomId ? z.layout.rooms.find((r) => r.spec.id === roomId) : undefined
    const pt = room ? { x: room.cx, y: room.cy } : z.layout.spawns[0] ?? { x: z.layout.w / 2, y: z.layout.h / 2 }
    const n = z.nav!.nearestOpen(pt.x, pt.y)
    return n ? { zone: z.id, ...n } : null
  }
  // 玩家名稱：傳到他旁邊
  const hits = g.allPlayers().filter((q) => q.baseName.toLowerCase().includes(s.toLowerCase()))
  if (hits.length === 1) {
    const u = g.mainOf(hits[0])
    if (u) return { zone: u.zone, x: u.x + 1, y: u.y }
  }
  return null
}

function locate(g: Game, u: Ent | undefined): string {
  if (!u) return '-'
  const z = g.world.zones[u.zone]
  if (!z.layout) return z.key
  const r = roomAt(z.layout, u.x, u.y)
  return r ? `${z.key}:${r.spec.id}` : z.key
}

const OPS: Record<string, Op> = {
  // ───── 資訊 ─────
  za: {
    args: [],
    run: (t) => {
      const g = t.g
      return ok('status', {
        time: Math.round(g.time),
        paused: g.paused,
        timeScale: g.timeScale,
        stations: g.world.zones.filter((z) => z.station).map((z) => `${z.key}${z.alive ? '' : '(x)'}`),
        alive: g.allPlayers().filter((p) => p.alive).length,
        players: g.allPlayers().length,
        ents: g.world.ents.size,
      })
    },
  },
  zb: {
    args: [],
    run: (t) => {
      const g = t.g
      return ok(
        'players',
        g.allPlayers().map((p) => {
          const u = g.mainOf(p)
          return {
            slot: p.slot + 1,
            name: p.baseName,
            color: PLAYER_COLORS[p.color]?.id,
            role: p.role + (p.spawnOf ? `>${p.spawnOf}` : ''),
            class: p.classId,
            form: u?.def.id ?? '-',
            hp: u ? `${Math.ceil(u.hp)}/${u.maxHp}` : '-',
            ep: Math.floor(p.ep),
            at: locate(g, u),
            alive: p.alive,
          }
        }),
      )
    },
  },
  zc: {
    args: [],
    run: (t) => ok('roles', Object.fromEntries(t.g.allPlayers().map((p) => [`${p.slot + 1}:${p.baseName}`, p.role + (p.spawnOf ? `>${p.spawnOf}` : '')]))),
  },
  zd: {
    args: ['str'],
    run: (t, _s, a) => {
      const kind = String(a[0] ?? 'items')
      const g = t.g
      if (kind === 'items') return ok(kind, [...ITEMS.keys()])
      if (kind === 'units') return ok(kind, [...UNITS.keys()])
      if (kind === 'forms') return ok(kind, [...FORMS.keys()])
      if (kind === 'places') return ok(kind, g.world.zones.flatMap((z) => (z.layout ? [z.key, ...z.layout.rooms.map((r) => `${z.key}:${r.spec.id}`)] : [z.key])))
      if (kind === 'events') return ok(kind, g.eventIds?.() ?? [])
      if (kind === 'stations') return ok(kind, g.world.zones.filter((z) => z.station).map((z) => z.key))
      if (kind === 'vendors') return ok(kind, [...new Set([...g.world.ents.values()].filter((e) => e.data.vendor).map((e) => e.data.vendor as string))])
      return bad('items|units|forms|places|events|stations|vendors')
    },
  },
  // ───── 視野（只影響自己）─────
  ya: { args: ['bool'], run: (t, s, a) => flag(t, s, 'wide', a[0]) },
  yb: { args: ['bool'], run: (t, s, a) => flag(t, s, 'listen', a[0]) },
  yc: { args: ['bool'], run: (t, s, a) => flag(t, s, 'reveal', a[0]) },
  // ───── 資源 ─────
  xa: {
    args: ['num', 'who'],
    run: (t, s, a) => {
      const ps = targets(t, s, a[1])
      if (!Array.isArray(ps)) return ps
      const n = Number(a[0] ?? 0)
      for (const p of ps) p.ep = Math.max(0, p.ep + n)
      return ok(`ep ${n >= 0 ? '+' : ''}${n} × ${ps.length}`)
    },
  },
  xb: {
    args: ['str', 'who', 'int'],
    run: (t, s, a) => {
      const id = String(a[0] ?? '')
      if (!itemDef(id)) return bad('item?')
      const ps = targets(t, s, a[1])
      if (!Array.isArray(ps)) return ps
      const n = Math.max(1, Math.min(6, Number(a[2] ?? 1)))
      for (const p of ps) {
        const u = t.g.mainOf(p)
        if (!u) continue
        for (let i = 0; i < n; i++) giveItem(t.g, u, makeItem(id))
      }
      return ok(`${id} × ${n} → ${ps.length}`)
    },
  },
  xc: {
    args: ['str'],
    run: (t, _s, a) => ok(`restock ${restockAll(t.g, a[0] ? String(a[0]) : undefined)}`),
  },
  // ───── 單位 ─────
  wa: {
    args: ['who', 'bool'],
    run: (t, s, a) =>
      each(t, s, a[0], (u) => {
        u.data.god = a[1] !== false
        u.statsDirty = true
      }),
  },
  wb: { args: ['who'], run: (t, s, a) => each(t, s, a[0], (u) => (heal(t.g, u, u.maxHp), (u.mp = u.maxMp))) },
  wc: {
    args: ['who'],
    run: (t, s, a) =>
      each(t, s, a[0], (u) => {
        u.data.god = false
        u.statsDirty = true
        recomputeStats(u)
        t.g.killEnt(u, null, -1)
      }),
  },
  wd: {
    args: ['who'],
    run: (t, s, a) => {
      const ps = targets(t, s, a[0])
      if (!Array.isArray(ps)) return ps
      let n = 0
      for (const p of ps) {
        if (p.alive) continue
        const z = t.g.world.zones[p.specZone]?.layout ? p.specZone : 1
        const l = t.g.world.zones[z].layout!
        const pt = l.spawns[t.g.world.rng.int(0, l.spawns.length - 1)]
        p.stayDead = false
        if (t.g.revivePlayer(p.slot, { zone: z, x: pt.x, y: pt.y })) n++
      }
      return ok(`revive ${n}`)
    },
  },
  we: {
    args: ['str', 'who'],
    run: (t, s, a) => {
      const at = placeOf(t.g, String(a[0] ?? ''), s)
      if (!at) return bad('place?')
      return each(t, s, a[1], (u) => {
        const z = t.g.world.zones[at.zone]
        const n = z.nav?.nearestOpen(at.x, at.y) ?? at
        t.g.world.relocate(u, at.zone, n.x, n.y)
        u.order = null
        const p = t.g.players[u.owner]
        if (p && p.control !== u.id) p.control = u.id
      })
    },
  },
  wf: {
    args: ['num', 'who'],
    run: (t, s, a) => {
      const k = Math.max(0.1, Math.min(10, Number(a[0] ?? 1)))
      return each(t, s, a[1], (u) => {
        u.data.speedMult = k
        u.statsDirty = true
      })
    },
  },
  wg: {
    args: ['str', 'who'],
    run: (t, s, a) => {
      const f = FORMS.get(String(a[0] ?? ''))
      if (!f || !UNITS.has(f.unit)) return bad('form?')
      const ps = targets(t, s, a[1])
      if (!Array.isArray(ps)) return ps
      for (const p of ps) {
        const u = t.g.mainOf(p)
        if (!u) continue
        const nu = replaceMain(t.g, p, u, f.unit, { anon: f.faction === 'xeno' && p.role === 'xeno' && !p.spawnOf, keepHpPct: true })
        if (p.role === f.faction || (f.faction === 'android' && p.role === 'android')) {
          p.form = f.id
          p.tier = f.tier
        }
        void nu
      }
      return ok(`${f.id} → ${ps.length}`)
    },
  },
  wh: {
    args: ['str', 'who'],
    run: (t, s, a) => {
      const id = String(a[0] ?? '')
      if (!itemDef(id)?.suit) return bad('suit?')
      return each(t, s, a[1], (u) => {
        const slot = giveItem(t.g, u, makeItem(id))
        if (slot >= 0) wearSuit(t.g, u, slot)
      })
    },
  },
  wi: {
    args: ['bool', 'who'],
    run: (t, s, a) =>
      each(t, s, a[1], (u) => {
        u.data.noCd = a[0] !== false
        if (u.data.noCd) u.cds.clear()
      }),
  },
  wj: {
    args: ['str', 'int', 'str'],
    run: (t, s, a) => {
      const def = UNITS.get(String(a[0] ?? ''))
      if (!def) return bad('unit?')
      const n = Math.max(1, Math.min(30, Number(a[1] ?? 1)))
      const me = t.g.mainOf(t.g.players[s])
      const at = a[2] ? placeOf(t.g, String(a[2]), s) : me ? { zone: me.zone, x: me.x + 2, y: me.y } : null
      if (!at) return bad('place?')
      const hostile = def.tags.includes('creature') || !!def.ai
      for (let i = 0; i < n; i++) {
        const z = t.g.world.zones[at.zone]
        const p = z.nav?.nearestOpen(at.x + t.g.world.rng.range(-1.5, 1.5), at.y + t.g.world.rng.range(-1.5, 1.5)) ?? at
        const e = t.g.world.spawn(unitDef(def.id), at.zone, p.x, p.y, hostile ? -2 : NEUTRAL)
        e.acquire = hostile
        if (at.zone === 0) e.global = true
      }
      return ok(`${def.id} × ${n}`)
    },
  },
  // ───── 規則 ─────
  va: {
    args: ['str', 'who', 'str'],
    run: (t, s, a) => {
      const r = String(a[0] ?? '')
      if (!['human', 'xeno', 'mutant', 'android'].includes(r)) return bad('role?')
      if (a[2] !== 'force') return bad("force?")
      const ps = targets(t, s, a[1], false)
      if (!Array.isArray(ps)) return ps
      for (const p of ps) setRole(t.g, p, r as Role)
      return ok(`${r} → ${ps.map((p) => p.baseName).join(',')}`)
    },
  },
  vb: {
    args: ['num'],
    run: (t, _s, a) => {
      t.g.timeScale = Math.max(0.25, Math.min(4, Number(a[0] ?? 1)))
      return ok(`x${t.g.timeScale}`)
    },
  },
  vc: { args: [], run: (t) => ((t.g.paused = true), ok('paused')) },
  vd: { args: [], run: (t) => ((t.g.paused = false), ok('resumed')) },
  // ───── 事件 ─────
  ua: {
    args: ['str'],
    run: (t, _s, a) => (t.g.triggerEvent?.(String(a[0] ?? ''), true) ? ok('ok') : bad('event?')),
  },
  ub: {
    args: ['str'],
    run: (t, _s, a) => {
      const k = String(a[0] ?? '')
      if (k !== 'fleet' && k !== 'orbit') return bad('fleet|orbit')
      return t.g.startApocalypse?.(k) ? ok('ok') : bad('n/a')
    },
  },
  uc: {
    args: ['str'],
    run: (t, _s, a) => (t.g.destroyStation?.(String(a[0] ?? '')) ? ok('ok') : bad('station?')),
  },
  ud: {
    args: ['str'],
    run: (t, _s, a) => {
      const f = String(a[0] ?? '')
      const map: Record<string, 'crew' | 'xeno' | 'mutant' | 'draw'> = { crew: 'crew', human: 'crew', humans: 'crew', xeno: 'xeno', alien: 'xeno', mutant: 'mutant', draw: 'draw' }
      if (!map[f]) return bad('crew|xeno|mutant|draw')
      t.g.endGame(map[f])
      return ok('ok')
    },
  },
}

function flag(t: Tuning, slot: number, k: 'wide' | 'listen' | 'reveal', v: unknown): TuneResult {
  const p = t.g.players[slot]
  if (!p) return bad('?')
  p.flags[k] = v !== false
  p.view.known.clear()
  return ok(`${p.flags[k]}`)
}

function each(t: Tuning, slot: number, who: unknown, fn: (u: Ent, p: GamePlayer) => void): TuneResult {
  const ps = targets(t, slot, who)
  if (!Array.isArray(ps)) return ps
  let n = 0
  for (const p of ps) {
    const u = t.g.mainOf(p)
    if (!u) continue
    fn(u, p)
    n++
  }
  return ok(`${n}`)
}
