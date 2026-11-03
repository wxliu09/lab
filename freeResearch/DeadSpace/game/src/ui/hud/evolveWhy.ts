// 進化選單：現在為什麼不能進化（純函式，只讀自己的私有狀態）。
// 條件對照 sim/systems/roleSystem.ts 的 evolveOptions／mayEvolveNow／evolveCmd：
// 死亡、進化中、不是親自操控主單位（駕駛、附身、救生艙）、太空中（變種人除外）、已達最終形態、EP 不足、
// 仿生人另外要站在裁決者號鑄造平台上。
import type { PrivateState } from '../../shared/protocol/messages'

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
