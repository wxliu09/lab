// 範圍傷害的判斷（介面說明用）：技能、道具的 tooltip 補一句「會波及 NPC 船員」（第 6 輪審查），
// 仿生人目標面板的「手上是範圍傷害武器」提醒（Guide.tsx 的 splashGear）也用同一套判斷。
// 只讀技能資料，不改數值或行為；sim 的範圍傷害（effects.ts 的 aoeTargets）不分敵我，NPC 船員也會被打到，被打傷的會反擊。
import { abilityDef } from '../shared/content/registry'
import type { Effect } from '../shared/content/types'

/** 效果裡有沒有範圍傷害（直接的 damage＋aoe、投射物命中、延遲爆炸、衝刺沿途，以及帶 aoe 與 dmg 參數的腳本，例如稜鏡火箭）*/
export function aoeDamage(effects: readonly Effect[] | undefined): boolean {
  for (const ef of effects ?? []) {
    if (ef.k === 'damage' && (ef.aoe ?? 0) > 0) return true
    if (ef.k === 'projectile' && aoeDamage(ef.onHit)) return true
    if (ef.k === 'delay' && aoeDamage(ef.then)) return true
    if (ef.k === 'dash' && (aoeDamage(ef.onArrive) || aoeDamage(ef.hitAlong))) return true
    if (ef.k === 'script' && Number(ef.p?.aoe ?? 0) > 0 && Number(ef.p?.dmg ?? 0) > 0) return true
  }
  return false
}

/**
 * 效果資料看不出來、由 sim 腳本做範圍傷害的技能（對照 src/sim/scripts）：熱融炸彈（items.ts fusionBlast）、
 * 遙控雷（suits.ts rdgBlast，投擲與引爆）、磁力裝的金屬塊衝刺（沿途撞到的都會受傷）、輻射裝的過載（污染區不分敵我）
 */
const SCRIPT_AOE: ReadonlySet<string> = new Set([
  'ab.item.fusion',
  'ab.rig.rdgToss',
  'ab.rig.rdgDetonate',
  'ab.mag.thrust',
  'ab.rad.overload',
])

/** 太空層的技能（船艇、防禦無人機）：打的是太空裡的東西，NPC 船員都在站內，不會被波及 */
const SPACE_ONLY = /^(ship|drone)\./

/** 這個技能的範圍傷害會不會波及站內的 NPC 船員（被動技能不算）*/
export function hitsBystanders(abilityId: string): boolean {
  const ab = abilityDef(abilityId)
  if (!ab || ab.passiveBuff || ab.target === 'passive' || SPACE_ONLY.test(ab.id)) return false
  return SCRIPT_AOE.has(ab.id) || aoeDamage(ab.effects) || aoeDamage(ab.tickEffects)
}
