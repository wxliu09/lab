// 身分系統：職業配置、spawn 轉化、死亡公告、EP、進化、仿生人誤殺懲罰、勝負判定（研究 02 §1–§6、§10–§11）
import { BUFFS, CLASSES, FORMS, UNITS, itemDef, unitDef } from '../../shared/content/registry'
import { PHDS, SECURITY_SUITS } from '../../shared/content/classes'
import { evolveChoices } from '../../shared/content/forms'
import type { Command, EndResult } from '../../shared/protocol/messages'
import { NEUTRAL, type Ent } from '../ent'
import type { Faction, Game, GamePlayer } from '../game'
import { DAMAGE_HOOKS, DEATH_HOOKS } from './damage'
import { applyBuff } from './buffs'
import { dropOnGround, giveItem, makeItem, morph } from './items'
import { EXTRA_COMMANDS, issue } from './orders'
import { LAST_WORDS } from './chat'

// ───────── 工具 ─────────

export function isSpawn(p: GamePlayer, f?: Faction): boolean {
  return !!p.spawnOf && (!f || p.spawnOf === f)
}

/** 遊戲邏輯上「活著」：玩家存活、主單位存在、沒被石化 */
export function aliveMain(g: Game, p: GamePlayer): boolean {
  if (!p.alive || p.left) return false
  const u = g.mainOf(p)
  return !!u && u.alive && !u.data.petrified
}

export function master(g: Game, f: 'xeno' | 'mutant'): GamePlayer | undefined {
  return g.allPlayers().find((p) => p.role === f && !p.spawnOf && !p.data.lostMaster)
}

/** 死亡單位身上的感染（朊毒優先，受控狀態也算）*/
export function infectionOf(u: Ent): 'prion' | 'parasite' | null {
  let par = false
  let brood = false
  let prion = false
  for (const b of u.buffs) {
    const d = BUFFS.get(b.id)
    if (!d?.infection) continue
    if (d.infection === 'prion' || d.infection === 'containedPrion') {
      prion = true
      if (d.flags?.brood) brood = true
    }
    if (d.infection === 'parasite' || d.infection === 'containedParasite') par = true
  }
  void brood
  return prion ? 'prion' : par ? 'parasite' : null
}

function hasBrood(u: Ent): boolean {
  return u.buffs.some((b) => BUFFS.get(b.id)?.flags?.brood)
}

/** 目前該陣營 spawn 應該用的單位 */
function spawnDefFor(g: Game, f: 'xeno' | 'mutant'): string {
  const m = master(g, f)
  const form = m ? FORMS.get(m.form) : undefined
  if (form?.spawnUnit && UNITS.has(form.spawnUnit)) return form.spawnUnit
  if (f === 'xeno') return UNITS.has('xeno.protoform.spawn') ? 'xeno.protoform.spawn' : 'personnel'
  return UNITS.has('mut.drone') ? 'mut.drone' : 'personnel'
}

function setMain(g: Game, p: GamePlayer, u: Ent, anon: boolean): void {
  u.isMain = true
  u.owner = p.slot
  u.anon = anon
  u.name = anon ? '' : p.name
  u.color = anon ? -1 : p.color
  u.classId = anon ? '' : p.classId
  p.main = u.id
  p.control = u.id
}

function moveInventory(from: Ent, to: Ent): void {
  if (!from.inv || !to.inv) return
  for (let i = 0; i < from.inv.length; i++) {
    const it = from.inv[i]
    if (!it) continue
    const s = to.inv.findIndex((x) => x === null)
    if (s >= 0) to.inv[s] = it
    from.inv[i] = null
  }
  if (from.suit) {
    const s = to.inv.findIndex((x) => x === null)
    if (s >= 0) to.inv[s] = from.suit
    from.suit = null
  }
  to.statsDirty = true
}

/** 原地把主單位換成另一個單位（變身、進化、轉化）*/
export function replaceMain(g: Game, p: GamePlayer, old: Ent, defId: string, opts: { anon: boolean; hpPct?: number; keepHpPct?: boolean }): Ent {
  const def = unitDef(defId)
  const u = g.world.spawn(def, old.zone, old.x, old.y, p.slot)
  u.facing = old.facing
  const hpK = opts.keepHpPct ? old.hp / old.maxHp : (opts.hpPct ?? 1)
  const mpK = old.maxMp > 0 ? old.mp / old.maxMp : 1
  u.hp = Math.max(1, u.maxHp * hpK)
  u.mp = u.maxMp * mpK
  moveInventory(old, u)
  // 保留持續中的負面狀態（寄生不會因變身消失）
  // 只帶走看不見的負面狀態（感染等）：全域可見的減益若跟著變身，旁人就能把兩種外形對起來
  for (const b of old.buffs) {
    const d = BUFFS.get(b.id)
    if (!d || d.good || d.stun) continue
    if (d.vis === 'all' && !d.infection) continue
    u.buffs.push({ ...b })
  }
  u.data.extraAbilities = old.data.extraAbilities
  u.data.passives = old.data.passives
  setMain(g, p, u, opts.anon)
  if (u.tags.has('personnel')) morph(g, u, defId)
  u.statsDirty = true
  old.data.converted = true
  old.data.noDrops = true
  old.alive = false
  g.world.remove(old)
  return u
}

// ───────── 職業配置 ─────────

export function setupClass(g: Game, p: GamePlayer, u: Ent): void {
  const cls = CLASSES.get(p.classId)
  if (!cls) return
  const rng = g.world.rng
  const extra: string[] = [...cls.abilities]
  const passives: string[] = [...cls.passives]
  if (p.classId === 'researcher') {
    p.phd = p.phd || rng.pick(PHDS)
    passives.push('cls.phd.' + p.phd)
  }
  if (p.role === 'xeno') extra.push('xeno.form')
  if (p.role === 'mutant') extra.push('mut.devour')
  u.data.extraAbilities = extra.filter((a) => a)
  u.data.passives = passives
  morph(g, u, u.def.id)
  for (const id of cls.items) if (itemDef(id)) giveItem(g, u, makeItem(id))
  if (p.classId === 'security' || p.classId === 'ace') {
    const s = rng.pick(SECURITY_SUITS)
    if (itemDef(s)) giveItem(g, u, makeItem(s))
  }
  if (p.classId === 'ceo') spawnButler(g, p, u)
}

function spawnButler(g: Game, p: GamePlayer, u: Ent): void {
  const b = g.world.spawn(unitDef('butler'), u.zone, u.x + 0.8, u.y, p.slot)
  b.master = u.id
  b.name = p.baseName + ' 的管家'
  b.color = p.color
  b.data.butlerOf = p.slot
  b.acquire = false
}

/** 管家跟隨主人（主人隱形時一起隱形；主人死亡就消失）*/
function stepButlers(g: Game): void {
  for (const b of g.world.ents.values()) {
    if (!b.tags.has('butler')) continue
    const p = g.players[b.data.butlerOf as number]
    if (!p || !p.alive) {
      g.world.remove(b)
      continue
    }
    const m = g.mainOf(p)
    if (!m) continue
    if (m.zone !== b.zone) {
      if (m.zone !== 0) g.world.relocate(b, m.zone, m.x + 0.6, m.y)
      continue
    }
    b.data.passives = m.stats.stealth || m.anon ? ['bf.butlerHide'] : []
    b.statsDirty = true
    const d = Math.hypot(m.x - b.x, m.y - b.y)
    if (d > 6) g.world.relocate(b, m.zone, m.x + 0.6, m.y)
    else if (d > 1.6 && (!b.order || b.order.k !== 'follow')) b.order = { k: 'follow', e: m.id, s: 0.8 }
  }
}

// ───────── 死亡 ─────────

function announceDeath(g: Game, p: GamePlayer): void {
  if (p.role === 'mutant' && !p.spawnOf) {
    g.systemAll('death.mutant', { name: p.name })
    g.log(`${p.name}（變種人）死亡`)
  } else if (p.role === 'xeno' && !p.spawnOf) {
    g.systemAll('death.xeno')
    g.log(`${p.name}（異形）死亡`)
  } else if (p.spawnOf === 'xeno') {
    g.systemAll('death.xenoSpawn')
    g.log(`${p.name}（異形 spawn）死亡`)
  } else if (p.spawnOf === 'mutant') {
    g.systemAll('death.mutantSpawn')
    g.log(`${p.name}（變種人 spawn）死亡`)
  } else if (p.role === 'android') {
    g.systemAll('death.android')
    g.log(`${p.name}（仿生人）損毀`)
  } else {
    g.systemAll('death.innocent')
    g.log(`${p.name} 遇害`)
  }
}

function isInnocent(g: Game, p: GamePlayer): boolean {
  return g.faction(p) === 'crew' && p.role !== 'android'
}

// ───────── 安裝 ─────────

export function installRoles(g: Game): void {
  const tk = new Map<string, { v: number; t: number }>()
  let androidPenalty = 0

  g.rolesApi = {
    revive(slot, at, defId, hpPct) {
      const p = g.players[slot]
      if (!p || p.alive || p.left || p.stayDead) return null
      const u = g.world.spawn(unitDef(defId), at.zone, at.x, at.y, slot)
      u.hp = Math.max(1, u.maxHp * hpPct)
      setMain(g, p, u, false)
      p.alive = true
      p.deadAt = -1
      if (u.tags.has('personnel')) {
        u.data.extraAbilities = [...(CLASSES.get(p.classId)?.abilities ?? []), ...(p.role === 'xeno' && !p.spawnOf ? ['xeno.form'] : []), ...(p.role === 'mutant' && !p.spawnOf ? ['mut.devour'] : [])]
        morph(g, u, defId)
      }
      g.privateLine(slot, 'role.revived')
      g.emitFx({ k: 'summon', z: at.zone, x: at.x, y: at.y, e: u.id })
      return u
    },
    convert(slot, f, at, hpPct) {
      const p = g.players[slot]
      if (!p) return null
      const old = g.mainOf(p)
      const pos = at ?? (old ? { zone: old.zone, x: old.x, y: old.y } : null)
      if (!pos) return null
      const def = unitDef(spawnDefFor(g, f))
      const u = g.world.spawn(def, pos.zone, pos.x, pos.y, slot)
      u.hp = Math.max(1, u.maxHp * hpPct)
      if (old) {
        moveInventory(old, u)
        u.facing = old.facing
        if (old.alive) {
          old.data.converted = true
          old.data.noDrops = true
          old.alive = false
          g.world.remove(old)
        }
      }
      p.spawnOf = f
      p.alive = true
      p.deadAt = -1
      setMain(g, p, u, false)
      u.data.extraAbilities = []
      g.privateLine(slot, f === 'xeno' ? 'role.becameXenoSpawn' : 'role.becameMutantSpawn')
      for (const q of g.allPlayers()) {
        if (q.slot !== slot && q.alive && g.faction(q) === f) g.privateLine(q.slot, 'role.gotSpawn', { name: p.name })
      }
      g.log(`${p.name} 被轉化為${f === 'xeno' ? '異形' : '變種人'} spawn`)
      g.emitFx({ k: 'infect', z: pos.zone, x: pos.x, y: pos.y, e: u.id })
      g.checkVictory()
      return u
    },
    petrify(u, on) {
      u.data.petrified = on
      u.data.frozen = on
      u.statsDirty = true
      if (on && u.isMain) g.checkVictory()
    },
  }

  // 主單位死亡：先處理轉化（必須排在掉落與屍體之前）
  DEATH_HOOKS.unshift((g2, u, killer, killerSlot) => {
    if (g2 !== g || !u.isMain || u.owner < 0) return
    const p = g.players[u.owner]
    if (!p || p.main !== u.id) return
    // 繭被打爆＝異形死亡；肉團無敵
    const inf = infectionOf(u)
    const f = g.faction(p)
    if (inf && p.role !== 'android' && !p.stayDead) {
      const mutantSide = f === 'mutant'
      if (inf === 'prion' && !mutantSide && (f !== 'xeno' || hasBrood(u))) {
        if (p.role === 'xeno' && !p.spawnOf) p.data.lostMaster = true
        g.rolesApi!.convert(p.slot, 'mutant', { zone: u.zone, x: u.x, y: u.y }, 0.33)
        u.data.converted = true
        u.data.noDrops = true
        return
      }
      if (inf === 'parasite' && f === 'crew') {
        g.rolesApi!.convert(p.slot, 'xeno', { zone: u.zone, x: u.x, y: u.y }, 0.33)
        u.data.converted = true
        u.data.noDrops = true
        return
      }
    }
    void killer
  })

  g.onMainDeath = (p, u, killer, killerSlot) => {
    if (u.data.converted) return
    p.alive = false
    p.deadAt = g.time
    p.specZone = u.zone
    p.control = 0
    const ks = killer?.owner ?? killerSlot
    const kp = ks >= 0 ? g.players[ks] : undefined
    if (kp && kp.slot !== p.slot) kp.stats.kills++
    announceDeath(g, p)
    // 異形方殺死無辜者 +175 EP
    if (isInnocent(g, p) && kp && g.faction(kp) === 'xeno') {
      const m = master(g, 'xeno')
      if (m) g.addEp(m.slot, 175)
    }
    // 仿生人：掉記憶核心
    if (p.role === 'android') {
      const core = dropOnGround(g, u.zone, u.x, u.y, makeItem('memoryCore'))
      ;(core.data.item as { data?: Record<string, unknown> }).data = { android: p.slot }
      p.data.core = core.id
      p.data.coreOnly = true
    }
    // 仿生人誤殺懲罰
    const andr = g.allPlayers().find((q) => q.role === 'android' && q.alive)
    if (andr && andr.slot !== p.slot) {
      const fwd = tk.get(`${andr.slot}>${p.slot}`)
      const back = tk.get(`${p.slot}>${andr.slot}`)
      const fp = g.faction(p)
      if (fp === 'crew' && !p.spawnOf && fwd && g.time - fwd.t <= 300) {
        androidPenalty += fwd.v - (back?.v ?? 0)
        if (androidPenalty > 2.7) {
          androidPenalty = 0
          const am = g.mainOf(andr)
          if (am) {
            g.privateLine(andr.slot, 'role.androidShutdown')
            am.data.god = false
            g.killEnt(am, null, -1)
          }
        }
      }
    }
    g.after(LAST_WORDS, () => {
      if (p.alive) return
      g.privateLine(p.slot, p.role === 'android' ? 'death.youAndroid' : 'death.you')
      if (g.settings.bootOnDeath) p.data.booted = true
      g.checkVictory()
    })
  }

  // 傷害：變種人傷害 EP、仿生人誤殺點數
  DAMAGE_HOOKS.push((_g, src, t, amount, o) => {
    if (!t.isMain || t.owner < 0) return
    const victim = g.players[t.owner]
    if (!victim) return
    const atkSlot = src?.owner ?? o.srcSlot ?? -1
    const atk = atkSlot >= 0 ? g.players[atkSlot] : undefined
    if (!atk || atk.slot === victim.slot) return
    // 變種人：攻擊非變種人陣營主單位（不在太空）
    if (g.faction(atk) === 'mutant' && g.faction(victim) !== 'mutant' && t.zone !== 0 && !o.buff) {
      const used = (victim.data.mutantDmgFrac as number) ?? 0
      if (used < 1) {
        const frac = Math.min(amount, t.hp + amount) / t.maxHp
        victim.data.mutantDmgFrac = used + frac
        const m = master(g, 'mutant')
        const perfect = atk.role === 'mutant' && !atk.spawnOf && m?.data.perfect
        if (m) g.addEp(m.slot, frac * (perfect ? 200 : 50))
      }
    }
    // 仿生人
    if (atk.role === 'android' || victim.role === 'android') {
      const k = `${atk.slot}>${victim.slot}`
      const cur = tk.get(k) ?? { v: 0, t: 0 }
      cur.v += amount / t.maxHp
      cur.t = g.time
      tk.set(k, cur)
    }
  })

  // 蛋被打破
  DEATH_HOOKS.push((_g, u) => {
    if (!u.tags.has('egg') || u.owner < 0) return
    const p = g.players[u.owner]
    if (!p) return
    g.addEp(p.slot, -75)
    const m = g.mainOf(p)
    if (m) {
      applyBuff(g, m, 'bf.eggStun', 1.5)
      g.emitFx({ k: 'egg', z: u.zone, x: u.x, y: u.y }, [p.slot])
    }
    g.privateLine(p.slot, 'role.eggLost')
  })

  // EP 每秒結算
  g.systems.push({
    name: 'ep',
    fn: () => {
      if (g.world.tick % 20 !== 0) return
      const players = g.allPlayers()
      for (const p of players) {
        if (p.spawnOf) continue
        if (p.role === 'android') g.addEp(p.slot, 1.5)
        else if (p.role === 'xeno' && !p.data.lostMaster) {
          const spawns = players.filter((q) => q.spawnOf === 'xeno' && q.alive && q.role !== 'android').length
          let eggs = 0
          for (const e of g.world.ents.values()) if (e.tags.has('egg') && e.owner === p.slot && e.alive) eggs++
          g.addEp(p.slot, 0.4 + 0.28 * spawns + 0.12 * eggs)
        } else if (p.role === 'mutant') {
          if (p.form === 'mut.hiveship') continue
          const spawns = players.filter((q) => q.spawnOf === 'mutant' && q.alive).length
          g.addEp(p.slot, 0.4 + 0.28 * spawns)
        }
        // 達到門檻提示一次
        const opts = g.evolveOptions(p)
        const key = opts.join(',')
        if (opts.length && p.data.evoHint !== key) {
          p.data.evoHint = key
          g.privateLine(p.slot, 'role.canEvolve')
        }
      }
    },
  })

  // 進化完成
  g.systems.push({
    name: 'evolve',
    fn: () => {
      for (const p of g.allPlayers()) {
        if (!p.evolvingUntil || g.time < p.evolvingUntil) continue
        const target = p.data.evolveTo as string
        p.evolvingUntil = 0
        const cur = g.mainOf(p)
        if (!cur || !cur.alive || !target) continue
        finishEvolution(g, p, cur, target)
      }
    },
  })

  g.systems.push({ name: 'butler', fn: stepButlers })

  // 勝負判定
  let pendingAt = -1
  g.systems.push({
    name: 'victory',
    fn: () => {
      if (g.victoryPending && pendingAt < 0) {
        pendingAt = g.time + 0.25
        g.victoryPending = false
      }
      if (pendingAt >= 0 && g.time >= pendingAt) {
        pendingAt = -1
        checkVictoryNow(g)
      }
    },
  })

  g.epNext = (p) => {
    const opts = nextThreshold(g, p)
    return opts
  }
  g.evolveOptions = (p) => {
    if (!p.alive || p.evolvingUntil) return []
    if (p.role === 'xeno' && !p.spawnOf && !p.data.lostMaster) return evolveChoices('xeno', p.form || 'xeno.protoform', p.ep).filter((id) => UNITS.has(FORMS.get(id)!.unit))
    if (p.role === 'mutant' && !p.spawnOf) return evolveChoices('mutant', p.form || null, p.ep).filter((id) => UNITS.has(FORMS.get(id)!.unit))
    if (p.role === 'android' && !p.spawnOf && g.mainOf(p)?.data.atFabricator)
      return evolveChoices('android', p.form || null, p.ep, { hasPenguin: !!g.mainOf(p)?.inv?.some((i) => i?.id === 'penguinPlush') })
    return []
  }

  EXTRA_COMMANDS.set('evolve', evolveCmd)
}

function nextThreshold(_g: Game, p: GamePlayer): number {
  if (p.spawnOf) return 0
  if (p.role === 'xeno') return p.tier >= 2 ? 0 : p.tier === 1 ? 1370 : 660
  if (p.role === 'mutant') return p.tier >= 3 ? 0 : [300, 900, 1800][p.tier]
  if (p.role === 'android') return p.form ? 0 : 2000
  return 0
}

// ───────── 進化 ─────────

function evolveCmd(g: Game, p: GamePlayer, _u: Ent, c: Command): void {
  if (!c.a) return
  const opts = g.evolveOptions(p)
  if (!opts.includes(c.a)) return
  const cur = g.mainOf(p)
  if (!cur || !cur.alive || cur.zone === 0 && p.role !== 'mutant') return
  const form = FORMS.get(c.a)!
  const quick = g.allPlayers().length === 1
  const dur = quick ? 2 : 60
  p.data.evolveTo = c.a
  p.evolvingUntil = g.time + dur
  if (form.faction === 'xeno') {
    // 原地結繭（匿名、6000 HP，繭被打爆＝異形死亡）
    const cocoon = replaceMain(g, p, cur, 'xeno.cocoon', { anon: true, hpPct: 1 })
    cocoon.data.noRegen = true
    g.emitFx({ k: 'cocoon', z: cocoon.zone, x: cocoon.x, y: cocoon.y, e: cocoon.id })
  } else if (form.faction === 'mutant') {
    p.data.massHp = cur.hp / cur.maxHp
    const mass = replaceMain(g, p, cur, 'mut.mass', { anon: false, hpPct: 1 })
    mass.name = ''
    mass.color = -1
    mass.classId = ''
    mass.anon = true
    applyBuff(g, mass, 'bf.evolving', dur + 1)
    g.emitFx({ k: 'cocoon', z: mass.zone, x: mass.x, y: mass.y, e: mass.id, s: 'mutant' })
  } else {
    // 仿生人：鑄造台建造 30 秒
    p.evolvingUntil = g.time + (quick ? 2 : 30)
    cur.data.frozen = true
    applyBuff(g, cur, 'bf.evolving', 31)
  }
  g.privateLine(p.slot, 'role.evolving')
  issue(cur, null)
}

function finishEvolution(g: Game, p: GamePlayer, cur: Ent, formId: string): void {
  const form = FORMS.get(formId)!
  const anon = form.faction === 'xeno'
  const hpK = form.faction === 'mutant' ? ((p.data.massHp as number) ?? 1) : form.faction === 'xeno' ? cur.hp / cur.maxHp : cur.hp / cur.maxHp
  const u = replaceMain(g, p, cur, form.unit, { anon, hpPct: hpK })
  u.data.frozen = false
  p.form = formId
  p.tier = form.tier
  if (form.branch === 'perfect') p.data.perfect = true
  if (formId === 'mut.broodmother') p.data.brood = true
  g.emitFx({ k: 'evolved', z: u.zone, x: u.x, y: u.y, e: u.id, s: formId })
  if (form.faction === 'xeno') g.systemAll('role.xenoEvolved')
  else if (form.faction === 'mutant') g.systemAll('role.mutantEvolved')
  g.log(`${p.name} 進化為 ${form.id}`)
  // spawn 跟著換型（異形：正在異形形態的 spawn；變種人：全部）
  const f = form.faction === 'android' ? null : form.faction
  if (f && form.spawnUnit && UNITS.has(form.spawnUnit)) {
    for (const q of g.allPlayers()) {
      if (q.spawnOf !== f || !q.alive || q.role === 'android') continue
      const su = g.mainOf(q)
      if (!su) continue
      if (f === 'xeno' && !su.tags.has('xenoForm')) continue
      replaceMain(g, q, su, form.spawnUnit, { anon: false, keepHpPct: true })
    }
  }
  if (form.faction === 'mutant' && formId === 'mut.hiveship') g.onHiveship?.(p, u)
}

// ───────── 勝負 ─────────

export function checkVictoryNow(g: Game): void {
  if (g.ended || g.time < 10) return
  const ps = g.allPlayers().filter((p) => !p.spectator)
  const alive = ps.filter((p) => aliveMain(g, p))
  const xm = ps.find((p) => p.role === 'xeno' && !p.spawnOf && !p.data.lostMaster)
  const mm = ps.find((p) => p.role === 'mutant' && !p.spawnOf)
  const xenoDead = !xm || !aliveMain(g, xm)
  const mutDead = !mm || !aliveMain(g, mm)
  const anyXenoSpawn = alive.some((p) => p.spawnOf === 'xeno')
  const anyMutSpawn = alive.some((p) => p.spawnOf === 'mutant')
  let winner: EndResult['winner'] | null = null
  if (alive.length === 0) winner = 'draw'
  else if (xenoDead && mutDead && !anyXenoSpawn && !anyMutSpawn) winner = 'crew'
  else if (xenoDead && alive.every((p) => g.faction(p) === 'mutant')) winner = 'mutant'
  else if (mutDead && alive.every((p) => g.faction(p) === 'xeno')) winner = 'xeno'
  if (winner) g.endGame(winner)
}

export { NEUTRAL }
