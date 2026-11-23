// 第 8 輪審查 B：大量 headless 對局統計＋AI 身分破綻（role tell）行為取樣。
// 用 rolldown 打包成 node 可直接跑的檔案（build.mjs），每局輸出一行 JSON。
// 用法：node dist/harness.mjs --n 8 --level normal --host bot --room mp --seed0 0 --count 10 --out data/x.jsonl [--perf]
/* eslint-disable */
import { GameServer, LOCAL_PEER } from '@game/sim/server'
import { encode } from '@game/shared/protocol/codec'
import { PRACTICE_ROOM } from '@game/shared/protocol/messages'
import { DAMAGE_HOOKS, DEATH_HOOKS } from '@game/sim/systems/damage'
import { eventsOf } from '@game/sim/systems/events'
import { timelineCause } from '@game/sim/systems/death'
import { roomAt } from '@game/shared/layout'
import { buildSnapshot, newViewState } from '@game/sim/systems/snapshot'
import { stationsOf } from '@game/sim/systems/stations'
import { spaceOf } from '@game/sim/systems/space'
import { writeFileSync, appendFileSync, readFileSync } from 'node:fs'
import { performance } from 'node:perf_hooks'

const args: Record<string, string> = {}
for (let i = 2; i < process.argv.length; i++) {
  const a = process.argv[i]
  if (a.startsWith('--')) {
    const k = a.slice(2)
    const v = process.argv[i + 1] && !process.argv[i + 1].startsWith('--') ? process.argv[++i] : '1'
    args[k] = v
  }
}
const N = Number(args.n ?? 8)
const LEVEL = (args.level ?? 'normal') as 'easy' | 'normal'
const HOST = args.host ?? 'bot' // bot | idle
const ROOM = args.room ?? 'mp' // mp | practice
const SEED0 = Number(args.seed0 ?? 0)
const COUNT = Number(args.count ?? 1)
const OUT = args.out ?? 'out.jsonl'
const HOSTROLE = args.hostRole // 練習房指定主機身分（xeno／mutant／human）
const PERF = !!args.perf // 額外為每個 AI 建快照＋encode，模擬 12 位真人 client 的主機負擔

const REST = new Set(['quarters', 'commissary', 'lounge', 'medbay'])
const looksHuman = (e: any) => e && (e.tags.has('personnel') || e.tags.has('suit'))

function join(s: any, peer: string, name: string) {
  s.onJoin(peer)
  const send = (m: any) => s.onMessage(peer, encode(m))
  send({ t: 'hello', name, color: 0, ver: 1, token: 'tok' + name.padEnd(8, 'x') })
  return send
}

function roleBucket(p: any): string {
  if (p.role === 'android') return p.android ? 'androidTurned' : 'android'
  if (p.spawnOf) return p.spawnOf + 'Spawn'
  return p.role // human | xeno | mutant
}

// 對數直方圖（tick 成本）：0.01 ms ~ 10 s
const HB = 400
function hbin(ms: number): number {
  return Math.max(0, Math.min(HB - 1, Math.floor(Math.log10(Math.max(ms, 0.01) / 0.01) * 66.7)))
}

// ───────── cmd 掛鉤（build.mjs 在 bots.ts 的 cmd() 裡插入 globalThis.__xcCmd）─────────
let CUR: any = null
;(globalThis as any).__xcCmd = (g: any, p: any, c: any) => {
  if (!CUR || CUR.g !== g) return
  CUR.onCmd(p, c)
}

function runOne(seed: number) {
  const code = ROOM === 'practice' ? PRACTICE_ROOM : 'TEST1'
  const s: any = new GameServer(code, { send: () => {} }, seed, seed ^ 0x5bd1e995)
  const host = join(s, LOCAL_PEER, 'Host')
  host({ t: 'settings', s: { bots: N - 1, aiLevel: LEVEL } })
  host(HOSTROLE ? { t: 'start', role: HOSTROLE } : { t: 'start' })
  const g: any = s.game
  if (!g) throw new Error('no game')
  if (HOST === 'bot') g.players[0].bot = true
  const ps: any[] = g.allPlayers().filter((p: any) => !p.spectator)
  const init: any = {}
  for (const p of ps) init[p.slot] = { role: p.role, cls: p.classId, bot: p.bot, name0: p.name }

  const R: any = {
    seed,
    n: N,
    level: LEVEL,
    host: HOST,
    room: ROOM,
    practice: !!g.practice,
    hostRole: g.players[0].role,
    hostForced: HOSTROLE ?? '',
    roles: ps.map((p) => ({ slot: p.slot, role: p.role, cls: p.classId, bot: p.bot })),
    npcCrew: [...g.world.ents.values()].filter((e: any) => e.def.ai === 'crew' && e.owner === -1).length,
    deaths: [] as any[],
    chat: [] as any[],
    reports: [] as any[],
    cmds: {} as any, // role -> kind -> count
    perBot: {} as any, // slot -> 行為統計
    zoneTime: {} as any, // zone key -> 活人秒數
    zoneTimeRole: {} as any,
    attacks: [] as any[], // AI 對玩家單位下的攻擊命令（攻擊者身分、目標身分、時間）
    evolve: [] as any[],
    infections: [] as any[],
    firstInf: -1,
    apoc: '',
    apocAt: -1,
    apocWarnAt: -1,
    apocAlive: -1,
    apocAliveBy: null as any,
    radMax: 0,
    events: [] as string[],
    tick: { hist: new Array(HB).fill(0), n: 0, sum: 0, max: 0, extraHist: PERF ? new Array(HB).fill(0) : null, extraSum: 0, cpuHist: new Array(HB).fill(0), cpuSum: 0, cpuMax: 0 },
    ffCrew: 0,
    ffCrewEarly: 0,
  }

  const atkSeen = new Set<string>()
  const mainOf = (p: any) => g.world.get(p.main)
  const factionAt = (slot: number) => (slot >= 0 && g.players[slot] ? g.faction(g.players[slot]) : 'none')
  const ensureBot = (p: any) =>
    (R.perBot[p.slot] ??= {
      slot: p.slot,
      role0: init[p.slot]?.role,
      cls: p.classId,
      bot: p.bot,
      w: {}, // window -> stats
      firstSuit: -1,
      firstBuy: -1,
      firstMoveAway: -1,
      buys: {},
      uses: {},
      casts: {},
      chats: {},
      zoneChanges: 0,
      draws: 0,
      monsterSecs: 0,
      aliveSecs: 0,
      deathT: -1,
      suitTypes: [],
    })

  // 除錯：XC_DBG=身分（例：xeno）→ 印出該身分 AI 的指令與私訊
  const DBG = process.env.XC_DBG ?? ''
  if (DBG) {
    const op = g.privateLine.bind(g)
    g.privateLine = (slot: number, key: string, a?: any) => {
      const q = g.players[slot]
      if (q?.bot && roleBucket(q) === DBG) console.log('PRIV', Math.round(g.time), slot, key, JSON.stringify(a ?? {}))
      return op(slot, key, a)
    }
  }
  CUR = {
    g,
    onCmd(p: any, c: any) {
      if (DBG && roleBucket(p) === DBG) {
        const u = g.controlOf(p)
        const t = c.e !== undefined ? g.world.get(c.e) : null
        console.log('CMD', g.time.toFixed(1), p.slot, JSON.stringify(c), 'def', u?.def?.id, 'cast', u?.cast?.ability ?? '', 'tgt', t ? t.def.id + '/' + t.owner + ' d=' + Math.hypot(t.x - u.x, t.y - u.y).toFixed(1) : '')
      }
      const rb = roleBucket(p)
      const m = (R.cmds[rb] ??= {})
      const B = ensureBot(p)
      let key = c.k
      const u = g.controlOf(p)
      if (c.k === 'unpilot') B.unp = (B.unp ?? 0) + 1
      if (c.k === 'use') {
        const id = u?.inv?.[c.s]?.id ?? '?'
        key = 'use:' + id
        B.uses[id] = (B.uses[id] ?? 0) + 1
      } else if (c.k === 'buy') {
        key = 'buy:' + c.a
        B.buys[c.a] = (B.buys[c.a] ?? 0) + 1
        if (B.firstBuy < 0) B.firstBuy = Math.round(g.time)
      } else if (c.k === 'cast') {
        key = 'cast:' + c.a
        B.casts[c.a] = (B.casts[c.a] ?? 0) + 1
      } else if (c.k === 'evolve') {
        key = 'evolve:' + c.a
        R.evolve.push({ t: Math.round(g.time), slot: p.slot, rb, form: c.a })
      } else if (c.k === 'attack' && c.e !== undefined) {
        const t = g.world.get(c.e)
        if (t && t.owner >= 0 && g.players[t.owner] && t.owner !== p.slot) {
          const k2 = p.slot + '>' + t.owner
          if (!atkSeen.has(k2)) {
            atkSeen.add(k2)
            R.attacks.push({ t: Math.round(g.time), a: p.slot, ar: rb, tr: roleBucket(g.players[t.owner]), tHuman: looksHuman(t), tBot: g.players[t.owner].bot })
          }
        }
        key = 'attack:' + (t ? (t.owner >= 0 ? 'player' : t.owner === -2 ? 'hostile' : 'npc') : '?')
      }
      m[key] = (m[key] ?? 0) + 1
    },
  }

  // 聊天：AI 的系統 key（驗血結果、指認、提醒、撤離）
  const origChat = g.handleChat.bind(g)
  g.handleChat = (slot: number, ch: string, text: string) => {
    const p = g.players[slot]
    if (p?.bot && typeof text === 'string' && text.startsWith('@')) {
      const parts = text.slice(1).split('|')
      const key = parts[0]
      const a: any = {}
      for (const kv of parts.slice(1)) {
        const i = kv.indexOf('=')
        a[kv.slice(0, i)] = kv.slice(i + 1)
      }
      const rec: any = { t: Math.round(g.time), slot, rb: roleBucket(p), key }
      if (a.name) {
        const q = g.allPlayers().find((x: any) => x.name === a.name)
        rec.target = q ? q.slot : -1
        rec.tr = q ? roleBucket(q) : '?'
        rec.tBot = q ? q.bot : null
        rec.tAlive = q ? q.alive : null
      }
      R.chat.push(rec)
      const B = ensureBot(p)
      B.chats[key] = (B.chats[key] ?? 0) + 1
    }
    return origChat(slot, ch, text)
  }

  const dh = (g2: any, src: any, t: any, amount: number, o: any) => {
    if (g2 !== g || !src || amount <= 0 || src.owner < 0) return
    const sp = g.players[src.owner]
    if (!sp || g.faction(sp) !== 'crew') return
    if (t.owner >= 0 && t.owner !== src.owner && t.isMain && g.players[t.owner] && g.faction(g.players[t.owner]) === 'crew') {
      R.ffCrew += amount
      if (g.time < 420) R.ffCrewEarly += amount
    }
  }
  const stationKills: any[] = []
  // 站內單位被站點毀滅波及時：站的太空實體此刻正在死亡掛鉤裡（還沒從 world 移除），用它最後被誰打到
  const stationBy = (zone: number): string => {
    const z = g.world.zones[zone]
    if (!z) return '?'
    const se = g.world.get(z.spaceEnt)
    if (!se) return z.alive ? '?' : 'lethalZone'
    if (se.alive && z.alive === false && g.time - (z.lethalUntil - 300) > 0.2) return 'lethalZone'
    const lh = g.world.get(se.lastHitBy)
    return (lh && g.time - se.lastHitTime < 5 ? lh.def.id : '') || se.data.destroyCause || 'none'
  }
  const kh = (g2: any, u: any, killer: any, killerSlot: number) => {
    if (g2 !== g) return
    // 站點／船艇的太空實體被擊毀：記下是誰（或最後打到它的東西）
    if (u.data?.interior !== undefined && !u.isMain) {
      const lh = g.world.get(u.lastHitBy)
      const zk = g.world.zones[u.data.interior]?.key ?? '?'
      const by = killer?.def?.id || (lh && g.time - u.lastHitTime < 5 ? lh.def.id : '') || (u.data.destroyCause ?? '') || 'none'
      stationKills.push({ t: Math.round(g.time), z: u.data.interior, zk, by, doom: !!eventsOf(g).apoc })
      return
    }
    if (!u.isMain || u.owner < 0) return
    const p = g.players[u.owner]
    // 轉化（被寄生／朊毒的人死亡變成眷屬）：roleSystem 的掛鉤先跑，p.main 已經換成新身體，u.data.converted = true
    const conv = !!u.data.converted
    if (!p || (p.main !== u.id && !conv) || p.spectator) return
    let cause: any = { k: '?' }
    try {
      cause = timelineCause(g, p, u, killer, killerSlot)
    } catch {}
    const ld = u.data.lastDmg
    const ev = eventsOf(g)
    const ks = killer ? killer.owner : killerSlot
    R.deaths.push({
      t: Math.round(g.time),
      slot: p.slot,
      vr: conv ? (p.role === 'android' ? 'android' : p.role === 'xeno' ? 'xeno' : 'human') : roleBucket(p),
      conv: conv ? p.spawnOf : '',
      vBot: p.bot,
      vHuman: looksHuman(u),
      zone: g.world.zones[u.zone]?.key ?? '?',
      k: cause.k,
      buff: ld && ld.t === g.time ? (ld.buff ?? '') : '',
      env: ld && ld.t === g.time ? (ld.env ?? (ld.lethal ? 'lethal' : '')) : '',
      killerDef: killer?.def?.id ?? (ld && ld.t === g.time && ld.lethal ? 'station:' + stationBy(u.zone) : ''),
      killerOwner: ks,
      kr: ks >= 0 && g.players[ks] ? roleBucket(g.players[ks]) : ks === -2 ? 'hostile' : ks === -1 ? 'neutral' : 'none',
      kBot: ks >= 0 && g.players[ks] ? g.players[ks].bot : null,
      doom: !!ev.apoc,
      warned: !!ev.apocWarned,
    })
  }
  DAMAGE_HOOKS.push(dh)
  DEATH_HOOKS.push(kh)

  // 行為取樣（每秒一次）
  const last: any = {}
  const lastZone: any = {}
  const shadow: any = {}
  let infPrev = 0
  const max = process.env.XC_MAXMIN ? Number(process.env.XC_MAXMIN) * 60 * 20 : (ROOM === 'practice' ? 40 : 55) * 60 * 20
  let i = 0
  try {
    for (; i < max && !g.ended; i++) {
      const c0 = process.cpuUsage()
      const t0 = performance.now()
      s.tick()
      const dt = performance.now() - t0
      const cu = process.cpuUsage(c0)
      const cms = (cu.user + cu.system) / 1000
      R.tick.cpuHist[hbin(cms)]++
      R.tick.cpuSum += cms
      if (cms > R.tick.cpuMax) R.tick.cpuMax = cms
      R.tick.hist[hbin(dt)]++
      R.tick.n++
      R.tick.sum += dt
      if (dt > R.tick.max) R.tick.max = dt
      if (PERF) {
        // 其餘每位玩家各自一份快照＋encode（模擬全員都是連線中的真人時，主機每個 tick 的額外負擔）
        const t1 = performance.now()
        const cx0 = process.cpuUsage()
        for (const p of g.allPlayers()) {
          if (!p.bot) continue
          const sh = (shadow[p.slot] ??= Object.assign(Object.create(p), { view: newViewState() }))
          sh.view.visible = p.view.visible
          // vision 結果：用 computeVision 的副作用之外的方式拿不到，這裡以 p.view.visible 重建最小 VisionResult
          try {
            const vis = (g as any).__lastVis?.get(p.slot)
            if (vis) encode({ t: 'snap', s: buildSnapshot(g, sh, vis) } as any)
          } catch {}
        }
        const d2 = performance.now() - t1
        const cx = process.cpuUsage(cx0)
        const c2 = (cx.user + cx.system) / 1000
        R.tick.extraHist[hbin(dt + d2)]++
        R.tick.extraSum += d2
        // CPU 時間版：sim tick（含 1 位真人的快照）＋其餘每位玩家的快照與 encode
        ;(R.tick.extraCpuHist ??= new Array(HB).fill(0))[hbin(cms + c2)]++
        R.tick.extraCpuSum = (R.tick.extraCpuSum ?? 0) + c2
        if (cms + c2 > (R.tick.extraCpuMax ?? 0)) R.tick.extraCpuMax = cms + c2
      }
      const ev = eventsOf(g)
      if (ev.apocWarned && R.apocWarnAt < 0) R.apocWarnAt = Math.round(g.time)
      if (ev.apoc && R.apocAt < 0) {
        R.apoc = ev.apoc
        R.apocAt = Math.round(g.time)
        const al = ps.filter((p) => p.alive)
        R.apocAlive = al.length
        R.apocAliveBy = {}
        for (const p of al) R.apocAliveBy[g.faction(p)] = (R.apocAliveBy[g.faction(p)] ?? 0) + 1
      }
      if (g.world.tick % 20 !== 0) continue
      const st = stationsOf(g)
      if (st.rad > R.radMax) R.radMax = st.rad
      if (!ev.apocWarned && st.rad > (R.radMaxPre ?? 0)) R.radMaxPre = st.rad
      const infNow = ps.reduce((a, p) => a + p.stats.infections, 0)
      if (infNow > infPrev) {
        if (R.firstInf < 0) R.firstInf = Math.round(g.time)
        R.infections.push(Math.round(g.time))
        infPrev = infNow
      }
      const win = ev.apoc ? 'doom' : g.time < 120 ? 'w0' : g.time < 420 ? 'w1' : g.time < 900 ? 'w2' : 'w3'
      // 所有活人主單位
      const bodies: any[] = []
      for (const p of ps) {
        if (!p.alive) continue
        const u = mainOf(p)
        if (u && u.alive) bodies.push({ p, u })
      }
      for (const { p, u } of bodies) {
        const zk = g.world.zones[u.zone]?.key ?? '?'
        R.zoneTime[zk] = (R.zoneTime[zk] ?? 0) + 1
        const zr = (R.zoneTimeRole[roleBucket(p)] ??= {})
        zr[zk] = (zr[zk] ?? 0) + 1
        if (!p.bot) continue
        const B = ensureBot(p)
        B.aliveSecs++
        if (lastZone[p.slot] !== undefined && lastZone[p.slot] !== u.zone) B.zoneChanges++
        lastZone[p.slot] = u.zone
        if (u.suit && !B.suitTypes.includes(u.suit.id)) B.suitTypes.push(u.suit.id)
        if (u.suit && B.firstSuit < 0) B.firstSuit = Math.round(g.time)
        const hf = looksHuman(u)
        if (!hf) {
          B.monsterSecs++
          continue
        }
        const ctl = g.controlOf(p)
        const piloting = ctl && ctl.id !== u.id
        const z = g.world.zones[u.zone]
        const inStation = z && z.kind !== 'space' && !!z.layout
        let near = Infinity
        let n8 = 0
        let n12 = 0
        let nh = 0
        for (const o of bodies) {
          if (o.p === p || o.u.zone !== u.zone) continue
          const d = Math.hypot(o.u.x - u.x, o.u.y - u.y)
          if (d < near) near = d
          if (d < 8) n8++
          if (d < 12) n12++
          if (d < 12 && looksHuman(o.u)) nh++
        }
        const lp = last[p.slot]
        const moved = lp && lp.z === u.zone ? Math.hypot(lp.x - u.x, lp.y - u.y) : 0
        last[p.slot] = { x: u.x, y: u.y, z: u.zone }
        const W = (B.w[roleBucket(p) + ':' + win] ??= { n: 0, suit: 0, alone8: 0, alone12: 0, nearSum: 0, idle: 0, rest: 0, moving: 0, pilot: 0, nyx: 0, sampler: 0, follow: 0, distMoved: 0, crowd: 0 })
        W.n++
        if (u.suit) W.suit++
        if (n8 === 0) W.alone8++
        if (n12 === 0) W.alone12++
        if (n12 >= 3) W.crowd++
        W.nearSum += Math.min(near, 40)
        if (moved < 0.2) W.idle++
        else W.moving++
        W.distMoved += Math.min(moved, 10)
        if (piloting) W.pilot++
        if (zk === 'nyx') W.nyx++
        if (u.inv?.some((x: any) => x?.id === 'geneSampler')) W.sampler++
        if (u.order?.k === 'follow' || (near < 5 && moved > 0.5)) W.follow++
        if (inStation) {
          const r = roomAt(z.layout, u.x, u.y)
          if (r && REST.has(r.spec.type)) W.rest++
        }
      }
    }
  } finally {
    DAMAGE_HOOKS.splice(DAMAGE_HOOKS.indexOf(dh), 1)
    DEATH_HOOKS.splice(DEATH_HOOKS.indexOf(kh), 1)
    CUR = null
  }
  R.winner = g.ended ? g.ended.winner : 'none'
  R.drawWhy = g.ended?.drawWhy ?? ''
  R.dur = Math.round(g.time)
  R.events = [...(eventsOf(g).used ?? [])]
  R.stationKills = stationKills
  R.radFields = [...g.world.ents.values()].filter((e: any) => e.def.id === 'hz.radField').length
  R.endRoles = ps.map((p) => ({ slot: p.slot, rb: roleBucket(p), alive: p.alive, tier: p.tier, form: p.form, ep: Math.round(p.ep), kills: p.stats.kills, inf: p.stats.infections, tests: p.stats.tests, zone: p.alive ? (g.world.zones[mainOf(p)?.zone]?.key ?? '?') : '' }))
  for (const p of ps) {
    R.reports.push(...p.gitReports.map((r: any) => ({ slot: p.slot, rb: roleBucket(p), t: r.time, result: r.result, names: r.names.length, truth: r.names.map((n: string) => { const q = g.allPlayers().find((x: any) => x.name === n); return q ? roleBucket(q) : n.startsWith('\u0001') ? 'anon' : '?' }) })))
    if (R.perBot[p.slot]) R.perBot[p.slot].deathT = p.alive ? -1 : Math.round(p.deadAt ?? -1)
  }
  return R
}

// PERF：攔 computeVision 的結果（game.flush 每個 tick 算一次；我們沒辦法直接拿到，改由 build.mjs 在 flush 裡把 vis 存到 g.__lastVis）

writeFileSync(OUT, '', { flag: 'a' })
// 已經跑過的 seed 不重跑（中斷後可以直接重新執行同一份 jobs）
const doneSeeds = new Set<number>()
for (const l of readFileSync(OUT, 'utf8').split('\n')) {
  if (!l.trim()) continue
  try {
    const r = JSON.parse(l)
    if (!r.error) doneSeeds.add(r.seed)
  } catch {}
}
for (let k = 0; k < COUNT; k++) {
  const seed = 5000 + (SEED0 + k) * 7919
  if (doneSeeds.has(seed)) continue
  const t0 = Date.now()
  let R: any
  try {
    R = runOne(seed)
  } catch (e: any) {
    R = { seed, n: N, level: LEVEL, host: HOST, room: ROOM, error: String(e?.stack ?? e) }
  }
  R.wall = Date.now() - t0
  appendFileSync(OUT, JSON.stringify(R) + '\n')
  process.stdout.write(`${N}p ${LEVEL} ${HOST} ${ROOM} seed=${seed} -> ${R.winner}@${Math.round((R.dur ?? 0) / 60)}m wall=${(R.wall / 1000).toFixed(1)}s\n`)
}
