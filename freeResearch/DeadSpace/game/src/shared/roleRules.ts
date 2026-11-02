// 身分數量規則（GDD §4.1、研究 02 §1.2）：sim 開局分配與大廳／練習對話框的預覽共用，避免兩邊規則不同步。
// 純函式，不碰 DOM 與 sim 狀態。
import type { LobbySettings, PracticeRole } from './protocol/messages'

export interface RoleMix {
  xeno: number
  mutant: number
  android: number
}

export type RoleRules = Pick<LobbySettings, 'aliens' | 'mutants' | 'androids'>

/** 依人數的基本組合（原作程式門檻：≤4、<7）；≤4 人時異形與變種人二選一，由 pickXeno 決定 */
export function baseRoleMix(n: number, pickXeno: boolean): RoleMix {
  if (n <= 4) return pickXeno ? { xeno: 1, mutant: 0, android: 0 } : { xeno: 0, mutant: 1, android: 0 }
  return { xeno: 1, mutant: 1, android: n >= 7 ? 1 : 0 }
}

/** 異類總數不能多於人數：依序先減仿生人、變種人、異形 */
export function fitRoles(c: RoleMix, n: number): RoleMix {
  const o = { ...c }
  while (o.xeno + o.mutant + o.android > n) {
    if (o.android) o.android--
    else if (o.mutant) o.mutant--
    else o.xeno--
  }
  return o
}

/** 套用大廳的手動數量設定 */
export function applyRoleOverrides(n: number, s: RoleRules, base: RoleMix): RoleMix {
  const c = { ...base }
  if (s.aliens !== 'auto') c.xeno = s.aliens
  if (s.mutants !== 'auto') c.mutant = s.mutants
  if (s.androids !== 'auto') c.android = s.androids
  return fitRoles(c, n)
}

/**
 * 依人數與大廳設定列出可能的異類組合（3–4 人時異形與變種人各半機率，所以可能有兩種）。
 * forced = 單機練習指定的自己的身分；此時回傳的是「其他人」之中的組合。
 */
export function roleOutcomes(n: number, s: RoleRules, forced?: Exclude<PracticeRole, 'random'>): RoleMix[] {
  if (n <= 0) return []
  const bases = n <= 4 ? [baseRoleMix(n, true), baseRoleMix(n, false)] : [baseRoleMix(n, true)]
  const out: RoleMix[] = []
  for (const b of bases) {
    let c = applyRoleOverrides(n, s, b)
    if (forced) {
      c = { ...c }
      if (forced === 'xeno') {
        c.xeno = 1
        if (n <= 4 && s.mutants === 'auto') c.mutant = 0
      } else if (forced === 'mutant') {
        c.mutant = 1
        if (n <= 4 && s.aliens === 'auto') c.xeno = 0
      } else if (forced === 'android') c.android = 1
      if (forced !== 'human') c[forced]--
      c = fitRoles(c, n - 1)
    }
    if (!out.some((o) => o.xeno === c.xeno && o.mutant === c.mutant && o.android === c.android)) out.push(c)
  }
  return out
}
