// 道具 tooltip 的內容（背包與販賣機共用）：防護服另外列出生命、攻擊、射程、移速與技能
import { UNITS, abilityDef, itemDef } from '../shared/content/registry'
import type { AttackDef } from '../shared/content/types'
import { listJoin, loc, t } from './i18n'
import { suitColor } from './names'
import type { TipData } from './tooltip'
import { hitsBystanders } from './aoe'
import './strings/ui6'
import './strings/fix9t'

/** 普攻的加成（頭像用：看得到的職業被動、狀態效果；販賣機與圖鑑一律用基礎值）*/
export interface AtkMods {
  dmgMult?: number
  atkSpeed?: number
  rangeAdd?: number
}

/** 數字去掉多餘的小數（1.20 → 1.2、0.05 → 0.05、6.25 → 6.25）*/
export function fmtNum(n: number, digits = 2): string {
  return String(Math.round(n * 10 ** digits) / 10 ** digits)
}

/**
 * 普攻的實際數字（照 sim：傷害乘 dmgMult、攻擊間隔除以攻速 atkSpeed（下限 0.1，combat.ts）、射程加 rangeAdd）。
 * dps = 平均每發傷害 ÷ 攻擊間隔；不含命中時的額外效果（脈衝裝剛開火的追加、架設機槍的電漿彈等，道具說明另外寫）
 */
export function atkNumbers(a: AttackDef, m: AtkMods = {}): { lo: number; hi: number; cd: number; range: number; dps: number } {
  const k = m.dmgMult ?? 1
  const cd = a.cd / Math.max(0.1, m.atkSpeed ?? 1)
  return {
    lo: Math.round(a.dmg[0] * k),
    hi: Math.round(a.dmg[1] * k),
    cd,
    range: a.range + (m.rangeAdd ?? 0),
    dps: (((a.dmg[0] + a.dmg[1]) / 2) * k) / cd,
  }
}

/**
 * 普攻的寫法（第 9 輪：販賣機 tooltip、圖鑑、頭像三處統一）：「每發傷害 / 攻擊間隔 · 射程」，例如「17–21 / 1.2s · 5m」「2 / 0.1s · 6m」。
 * 以前只寫每發傷害（機槍裝「2–2」、脈衝裝「1–1」），看起來比赤手還弱，其實一秒打 10、20 發
 */
export function atkText(a: AttackDef, m: AtkMods = {}): string {
  const n = atkNumbers(a, m)
  const dmg = n.lo === n.hi ? String(n.lo) : `${n.lo}–${n.hi}`
  return `${dmg} / ${fmtNum(n.cd)}s · ${fmtNum(n.range)}m`
}

/** 每秒傷害（十以上取整數，以下留一位小數）*/
export function dpsText(a: AttackDef, m: AtkMods = {}): string {
  const d = atkNumbers(a, m).dps
  return d >= 10 ? String(Math.round(d)) : fmtNum(d, 1)
}

export function itemTip(id: string, extra: { rows?: [string, string][]; hint?: string; tag?: string } = {}): TipData | null {
  const def = itemDef(id)
  if (!def) return null
  const rows: [string, string][] = []
  if (def.suit) {
    const u = UNITS.get(def.suit)
    if (u) {
      rows.push([t('tip.hp'), String(u.hp)])
      if (u.attack) {
        rows.push([t('tip.atk'), atkText(u.attack)])
        rows.push([t('fix9t.tip.dps'), dpsText(u.attack)])
      }
      rows.push([t('tip.speed'), String(u.speed)])
      const abs = u.abilities.map((a) => loc(abilityDef(a)?.name)).filter(Boolean)
      if (abs.length) rows.push([t('tip.skills'), listJoin(abs)])
    }
  }
  rows.push(...(extra.rows ?? []))
  // 範圍傷害的道具（手榴彈、相位砲、熱融炸彈）與普攻會爆炸的防護服（火箭裝）：會波及 NPC 船員
  const u = def.suit ? UNITS.get(def.suit) : undefined
  const splash = (def.use && hitsBystanders(def.use)) || (u?.attack?.aoe ?? 0) > 0
  const hint = [extra.hint, splash ? t('ui6.tip.aoeCrew') : ''].filter(Boolean).join('\n')
  return {
    title: loc(def.name),
    tag: extra.tag,
    sub: t('tip.cat.' + def.cat),
    body: loc(def.desc),
    rows,
    hint: hint || undefined,
    color: def.suit ? suitColor(def.id) : '#9fe7ff',
  }
}
