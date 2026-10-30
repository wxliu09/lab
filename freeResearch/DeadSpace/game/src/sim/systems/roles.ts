// 身分與職業分配（GDD §4.1、研究 02 §1.2、§2.1）
import { CLASS_LIST, PHDS, SECURITY_SUITS } from '../../shared/content/classes'
import { CLASSES, unitDef } from '../../shared/content/registry'
import type { Game, GamePlayer } from '../game'
import { spawnPoints } from '../setup'
import type { Ent } from '../ent'

/** 依人數決定陣營數量（原作程式門檻：≤4、<7）*/
export function roleCounts(g: Game, n: number): { xeno: number; mutant: number; android: number } {
  const s = g.settings
  const rng = g.world.rng
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
  const rng = g.world.rng
  const active = g.allPlayers().filter((p) => !p.spectator)
  const c = roleCounts(g, active.length)
  const pool = rng.shuffle([...active])
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
    spawnPlayer(g, p, pts.pop() ?? pts[0])
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
  return u
}
