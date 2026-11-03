// 系統訊息的雙語參數：sim 不知道每位玩家用哪種語言，地名、形態名、清單都把兩種寫法一起送，
// zh 字串取 {nz}／{lz}…、en 字串取 {ne}／{le}…（和死因的 uz／ue、時間軸的 nz／ne 同一套作法）。
// 只換語言、不加資訊：送出的內容和原本的中文寫法一一對應。
import type { Loc } from './content/types'
import { UNITS } from './content/registry'

export type TextLang = 'zh' | 'en'

/** 一個地名／形態名的兩種寫法：{ [z]: 中文, [e]: 英文 } */
export function locArgs(l: Loc | undefined, z = 'nz', e = 'ne', fallback = ''): Record<string, string> {
  return { [z]: l?.zh ?? fallback, [e]: l?.en ?? fallback }
}

/** 清單的兩種寫法：中文用「、」、英文用「, 」連接 */
export function listArgs(zh: string[], en: string[] = zh, z = 'lz', e = 'le'): Record<string, string> {
  return { [z]: zh.join('、'), [e]: en.join(', ') }
}

/**
 * GIT 樣本名單上的匿名形態：控制字元開頭的標記＋形態 id（玩家名稱會濾掉控制字元，不會撞名），
 * 顯示時依語言換成形態名。同名的形態一律換成同一個代表 id，名單透露的資訊和原本的中文名稱完全相同。
 */
const SAMPLE_UNIT = '\u0001'

export function sampleUnitToken(defId: string): string {
  const u = UNITS.get(defId)
  if (!u) return '???'
  for (const d of UNITS.values()) if (d.name.zh === u.name.zh) return SAMPLE_UNIT + d.id
  return SAMPLE_UNIT + defId
}

/** 樣本名單上的一個名字：玩家名稱照原樣，匿名形態換成該語言的形態名 */
export function sampleName(s: string, l: TextLang): string {
  if (!s.startsWith(SAMPLE_UNIT)) return s
  return UNITS.get(s.slice(1))?.name[l] ?? '???'
}

/** 樣本名單的兩種寫法（{lz}／{le}）*/
export function sampleListArgs(names: string[], z = 'lz', e = 'le'): Record<string, string> {
  return listArgs(
    names.map((n) => sampleName(n, 'zh')),
    names.map((n) => sampleName(n, 'en')),
    z,
    e,
  )
}
