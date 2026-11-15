// 進化選單：現在為什麼不能進化（純函式，只讀自己的私有狀態）。
// 條件對照 sim/systems/roleSystem.ts 的 evolveOptions／mayEvolveNow／evolveCmd：
// 死亡、進化中、不是親自操控主單位（駕駛、附身、救生艙）、太空中（變種人除外）、已達最終形態、EP 不足、
// 仿生人另外要站在裁決者號鑄造平台上。
import type { PrivateState } from '../../shared/protocol/messages'
import type { FormDef } from '../../shared/content/types'
import { FORMS } from '../../shared/content/registry'

export interface EvolveBlock {
  key: string
  args?: Record<string, string | number>
}

/** null = 可以進化（或正在進化，由選單另外顯示進度）*/
export function evolveBlock(me: Partial<PrivateState>): EvolveBlock | null {
  if (me.alive === false) return { key: 'play1.evo.dead' }
  if (me.evolving) return null
  if (me.control && me.unit && me.control !== me.unit) return { key: 'play1.evo.notMain' }
  if (me.zone === 0 && me.role !== 'mutant') return { key: 'play1.evo.space' }
  if ((me.canEvolve?.length ?? 0) > 0) return null
  const ep = me.ep ?? 0
  const next = me.epNext ?? 0
  if (next <= 0) return { key: 'play1.evo.max' }
  if (ep < next) return { key: 'play1.evo.need', args: { n: Math.ceil(next - ep) } }
  if (me.role === 'android') return { key: 'play1.evo.forge' }
  return { key: 'evo.notYet' }
}

/** 不能進化時可以預覽下一階分支的原因（EP 不足、在太空中、在駕駛、仿生人不在鑄造平台）；死亡、最終形態不預覽 */
const PREVIEW_BLOCKS = new Set(['play1.evo.need', 'play1.evo.space', 'play1.evo.notMain', 'play1.evo.forge', 'evo.notYet'])

export function canPreview(block: EvolveBlock | null): boolean {
  return !!block && PREVIEW_BLOCKS.has(block.key)
}

/** 這個單位 def 對應的形態（主腦或眷屬的單位都認得）；不是形態單位（人形、防護服…）回傳 undefined */
function formOfUnit(unitId: string | undefined, faction: FormDef['faction']): FormDef | undefined {
  if (!unitId) return undefined
  for (const f of FORMS.values()) if (f.faction === faction && (f.unit === unitId || f.spawnUnit === unitId)) return f
  return undefined
}

/**
 * 下一階可以選的分支（進化選單在 EP 不足時用灰色預覽；只讀自己的私有狀態與自己主單位的外觀）。
 * 條件對照 content/forms.ts 的 evolveChoices：異形從原型體（T1）往 T2、T2 往同一分支的 T3；
 * 變種人從人形選 T1 路線，之後沿著 from 往下；仿生人換一次機體（需要特殊道具的隱藏機體不預覽）
 */
export function nextForms(me: Partial<PrivateState>, unitId?: string): FormDef[] {
  const role = me.role
  if (me.spawn || (role !== 'xeno' && role !== 'mutant' && role !== 'android')) return []
  const all = [...FORMS.values()].filter((f) => f.faction === role && !f.requires)
  const tier = me.tier ?? 0
  if (role === 'android') return tier >= 2 || formOfUnit(unitId, 'android') ? [] : all
  if (role === 'mutant' && tier === 0) return all.filter((f) => f.tier === 1)
  // 異形 T1（tier 0 或 1）一律從原型體算；其他依目前的形態單位
  const cur = role === 'xeno' && tier <= 1 ? 'xeno.protoform' : formOfUnit(unitId, role)?.id
  return cur ? all.filter((f) => f.from === cur) : []
}
