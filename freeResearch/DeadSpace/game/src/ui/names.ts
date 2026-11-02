// 實體外觀 id → 顯示名稱。販賣機與站點的 UnitDef 只在 sim 端動態註冊，client 要從原始定義查。
import type { Loc } from '../shared/content/types'
import { UNITS, VENDORS, itemDef } from '../shared/content/registry'
import { STATION_BY_ID } from '../shared/content/stations/index'

export function entDefName(d: string | undefined): Loc | undefined {
  if (!d) return undefined
  if (d.startsWith('item:')) return itemDef(d.slice(5))?.name
  const u = UNITS.get(d)
  if (u) return u.name
  if (d.startsWith('vendor.')) return VENDORS.get(d.slice(7))?.name
  if (d.startsWith('station.')) return STATION_BY_ID.get(d.slice(8))?.name
  return undefined
}
