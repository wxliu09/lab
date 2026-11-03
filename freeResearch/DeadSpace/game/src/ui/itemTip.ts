// 道具 tooltip 的內容（背包與販賣機共用）：防護服另外列出生命、攻擊、射程、移速與技能
import { UNITS, abilityDef, itemDef } from '../shared/content/registry'
import { listJoin, loc, t } from './i18n'
import { suitColor } from './names'
import type { TipData } from './tooltip'

export function itemTip(id: string, extra: { rows?: [string, string][]; hint?: string; tag?: string } = {}): TipData | null {
  const def = itemDef(id)
  if (!def) return null
  const rows: [string, string][] = []
  if (def.suit) {
    const u = UNITS.get(def.suit)
    if (u) {
      rows.push([t('tip.hp'), String(u.hp)])
      if (u.attack) rows.push([t('tip.atk'), `${u.attack.dmg[0]}–${u.attack.dmg[1]} · ${u.attack.range}m`])
      rows.push([t('tip.speed'), String(u.speed)])
      const abs = u.abilities.map((a) => loc(abilityDef(a)?.name)).filter(Boolean)
      if (abs.length) rows.push([t('tip.skills'), listJoin(abs)])
    }
  }
  rows.push(...(extra.rows ?? []))
  return {
    title: loc(def.name),
    tag: extra.tag,
    sub: t('tip.cat.' + def.cat),
    body: loc(def.desc),
    rows,
    hint: extra.hint,
    color: def.suit ? suitColor(def.id) : '#9fe7ff',
  }
}
