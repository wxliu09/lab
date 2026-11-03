// 內容登錄表。各內容檔用 reg*() 註冊，index.ts 匯入全部內容檔。
import type { AbilityDef, BuffDef, ClassDef, FormDef, ItemDef, UnitDef, VendorDef } from './types'

export const UNITS = new Map<string, UnitDef>()
export const ABILITIES = new Map<string, AbilityDef>()
export const BUFFS = new Map<string, BuffDef>()
export const ITEMS = new Map<string, ItemDef>()
export const VENDORS = new Map<string, VendorDef>()
export const CLASSES = new Map<string, ClassDef>()
export const FORMS = new Map<string, FormDef>()

function reg<T extends { id: string }>(map: Map<string, T>, kind: string, defs: T[]): void {
  for (const d of defs) {
    if (map.has(d.id)) throw new Error(`重複的 ${kind} id：${d.id}`)
    map.set(d.id, d)
  }
}

export const regUnits = (d: UnitDef[]) => reg(UNITS, 'unit', d)
export const regAbilities = (d: AbilityDef[]) => reg(ABILITIES, 'ability', d)
export const regBuffs = (d: BuffDef[]) => reg(BUFFS, 'buff', d)
export const regItems = (d: ItemDef[]) => reg(ITEMS, 'item', d)
export const regVendors = (d: VendorDef[]) => reg(VENDORS, 'vendor', d)
export const regClasses = (d: ClassDef[]) => reg(CLASSES, 'class', d)
export const regForms = (d: FormDef[]) => reg(FORMS, 'form', d)

export function unitDef(id: string): UnitDef {
  const d = UNITS.get(id)
  if (!d) throw new Error(`未知單位 ${id}`)
  return d
}
export function abilityDef(id: string): AbilityDef | undefined {
  return ABILITIES.get(id)
}
export function buffDef(id: string): BuffDef | undefined {
  return BUFFS.get(id)
}
export function itemDef(id: string): ItemDef | undefined {
  return ITEMS.get(id)
}

/**
 * 區域物件：技能放出的雷暴、火海、酸池、毒雲、污染區、電漿球、熵渦、奇點、腐沼黏液…
 * 不能被選取、不會移動（noTarget＋不動，或標成 hazard）。
 * 與 render/units.ts 的 isZoneObject 同一條規則（那邊用來決定腳下不畫選取圈）；audio 用它排除叫聲。
 * 「未知存在」這類 noTarget 但會移動的生物不算。
 */
export function isZoneObject(def: UnitDef | undefined): boolean {
  if (!def) return false
  return def.tags.includes('hazard') || (def.tags.includes('noTarget') && def.speed <= 0)
}
