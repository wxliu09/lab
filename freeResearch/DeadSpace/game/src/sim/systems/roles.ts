// 身分與職業分配（GDD §4.1、研究 02 §1.2、§2.1）
import { CLASS_LIST, PHDS, SECURITY_SUITS } from '../../shared/content/classes'
import { CLASSES, unitDef } from '../../shared/content/registry'
import type { Game, GamePlayer, Role } from '../game'
import { spawnPoints } from '../setup'
import type { Ent } from '../ent'
import { setupClass } from './roleSystem'
import { classSpawn } from './facilities'

/** 依人數決定陣營數量（原作程式門檻：≤4、<7）*/
export function roleCounts(g: Game, n: number): { xeno: number; mutant: number; android: number } {
  const s = g.settings
  const rng = g.secret
  let xeno = 0
  let mutant = 0
  let android = 0
  if (n <= 4) {
    if (rng.int(1, 2) === 1) xeno = 1
    else mutant = 1
  } else {
    xeno = 1
    mutant = 1
    android = n >= 7 ? 1 : 0
  }
  if (s.aliens !== 'auto') xeno = s.aliens
  if (s.mutants !== 'auto') mutant = s.mutants
  if (s.androids !== 'auto') android = s.androids
  // 不能多於參與人數
  while (xeno + mutant + android > n) {
    if (android) android--
    else if (mutant) mutant--
    else xeno--
  }
  return { xeno, mutant, android }
}

export function assignRoles(g: Game): void {
  const rng = g.secret
  const active = g.allPlayers().filter((p) => !p.spectator)
  const c = roleCounts(g, active.length)
  const pool = rng.shuffle([...active])
  const forced = g.forceRole && active.find((p) => p.slot === g.forceRole!.slot)
  if (forced) placeForced(g, forced, g.forceRole!.role, c, pool, active.length)
  // 抽選順序：仿生人 → 異形 → 變種人（原作）
  for (let i = 0; i < c.android; i++) pool.pop()!.role = 'android'
  for (let i = 0; i < c.xeno; i++) pool.pop()!.role = 'xeno'
  for (let i = 0; i < c.mutant; i++) pool.pop()!.role = 'mutant'
  // 職業：12 張卡不放回抽（身分與職業互相獨立）
  const deck: string[] = []
  for (const cl of CLASS_LIST) for (let i = 0; i < cl.cards; i++) deck.push(cl.id)
  rng.shuffle(deck)
  const pts = rng.shuffle(spawnPoints(g))
  for (const p of rng.shuffle([...active])) {
    p.classId = deck.pop() ?? 'researcher'
    if (p.classId === 'researcher') p.phd = rng.pick(PHDS)
    // 艦長、工程師、王牌飛行員有固定出生點（站沒啟用就照一般規則）
    spawnPlayer(g, p, classSpawn(g, p.classId) ?? pts.pop() ?? pts[0])
  }
}

/**
 * 單機練習指定身分：先把這位玩家放進指定身分、移出抽選池，其餘身分照一般規則從剩下的人抽。
 * 3–4 人時原規則只有一名異類，所以指定異形／變種人時就不再另抽另一種異類。
 */
function placeForced(g: Game, p: GamePlayer, role: Role, c: { xeno: number; mutant: number; android: number }, pool: GamePlayer[], n: number): void {
  const s = g.settings
  pool.splice(pool.indexOf(p), 1)
  p.role = role
  if (role === 'xeno') {
    c.xeno = 1
    if (n <= 4 && s.mutants === 'auto') c.mutant = 0
  } else if (role === 'mutant') {
    c.mutant = 1
    if (n <= 4 && s.aliens === 'auto') c.xeno = 0
  } else if (role === 'android') c.android = 1
  if (role !== 'human') c[role]--
  while (c.xeno + c.mutant + c.android > pool.length) {
    if (c.android) c.android--
    else if (c.mutant) c.mutant--
    else c.xeno--
  }
}

export function spawnPlayer(g: Game, p: GamePlayer, at: { zone: number; x: number; y: number } | undefined): Ent {
  const w = g.world
  const spot = at ?? { zone: 1, x: 10, y: 10 }
  const u = w.spawn(unitDef('personnel'), spot.zone, spot.x, spot.y, p.slot)
  const cls = CLASSES.get(p.classId)
  u.isMain = true
  u.color = p.color
  u.classId = p.classId
  p.name = (cls ? cls.prefix.en : '') + p.baseName
  u.name = p.name
  p.main = u.id
  p.control = u.id
  p.alive = true
  p.bio = `bio.${p.classId}.${p.role}`
  void SECURITY_SUITS
  setupClass(g, p, u)
  return u
}
