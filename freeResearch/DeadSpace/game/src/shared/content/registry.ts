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
