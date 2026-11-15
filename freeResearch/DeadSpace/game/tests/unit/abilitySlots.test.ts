// 技能快捷鍵的位置：client 依「非被動技能」的 index 對應 Q／W／E／R／D／F（ui/hud/Hud.tsx、client/input.ts）。
// 同一個技能在不同形態要落在同一個鍵上，進化、變身、穿脫防護服之後才不用重新找（content/forms 的排列規則）。
import { describe, expect, it } from 'vitest'
import '../../src/sim/game'
import { Harness } from './helpers/harness'
import { UNITS, abilityDef } from '../../src/shared/content/registry'
import { FORM_LIST } from '../../src/shared/content/forms'
import { giveItem, makeItem, morph, slotOrder, wearSuit } from '../../src/sim/systems/items'
import { replaceMain } from '../../src/sim/systems/roleSystem'
import { SCRIPTS } from '../../src/sim/systems/effects'

/** 會佔快捷鍵的技能（依清單順序）*/
const keyed = (list: string[]): string[] => list.filter((a) => abilityDef(a)?.target !== 'passive')
const keysOf = (unit: string): string[] => keyed(UNITS.get(unit)!.abilities)

/** 同一組技能之間要對齊（不同等級的同一招：朊毒 1／2／3、同類相食算同一格）*/
const FAMILY: Record<string, string> = {
  'mut.prion': 'line',
  'mut.prion2': 'line',
  'mut.prion3': 'line',
  'mut.cannibalize': 'line',
  'xeno.human': 'human',
  'xeno.spawnHuman': 'human',
}
const fam = (a: string): string => FAMILY[a] ?? a

/** 出現在兩個以上的單位、而且每次都在同一個 index：回傳不一致的技能 */
function misaligned(units: string[]): string[] {
  const at = new Map<string, Set<number>>()
  const count = new Map<string, number>()
  for (const u of units) {
    keysOf(u).forEach((a, i) => {
      const k = fam(a)
      ;(at.get(k) ?? at.set(k, new Set()).get(k)!).add(i)
      count.set(k, (count.get(k) ?? 0) + 1)
    })
  }
  return [...at].filter(([k, s]) => (count.get(k) ?? 0) >= 2 && s.size > 1).map(([k, s]) => `${k}@${[...s].join('/')}`)
}

const mains = (f: 'xeno' | 'mutant') => FORM_LIST.filter((x) => x.faction === f).map((x) => x.unit)
const spawns = (f: 'xeno' | 'mutant') => FORM_LIST.filter((x) => x.faction === f && x.spawnUnit).map((x) => x.spawnUnit!)

describe('技能快捷鍵：異形', () => {
  it('主形態：寄生 Q、變回人形 W、下蛋 E；其他共用的技能也在同一格', () => {
    for (const u of mains('xeno')) {
      const k = keysOf(u)
      expect([u, k[0], k[1]]).toEqual([u, 'xeno.parasite', 'xeno.human'])
      if (k.includes('xeno.egg')) expect([u, k.indexOf('xeno.egg')]).toEqual([u, 2])
    }
    expect(misaligned(mains('xeno'))).toEqual([])
  })

  it('眷屬：寄生 Q、變回人形 W', () => {
    for (const u of spawns('xeno')) expect([u, ...keysOf(u).slice(0, 2)]).toEqual([u, 'xeno.parasite', 'xeno.spawnHuman'])
    expect(misaligned(spawns('xeno'))).toEqual([])
  })
})

describe('技能快捷鍵：變種人', () => {
  it('主形態：吞食 Q、路線招牌技能（同類相食／朊毒）W、嘶吼 E；其他共用的技能也在同一格', () => {
    for (const u of mains('mutant')) {
      const k = keysOf(u)
      if (u === 'mut.hiveship') {
        // 太空中的巢艦是一座站：沒有吞食
        expect(k).not.toContain('mut.devour')
        continue
      }
      expect([u, k[0]]).toEqual([u, 'mut.devour'])
      const line = k.findIndex((a) => fam(a) === 'line')
      if (line >= 0) expect([u, line]).toEqual([u, 1])
      if (k.includes('ab.mut.roar')) expect([u, k.indexOf('ab.mut.roar')]).toEqual([u, 2])
    }
    expect(misaligned(mains('mutant').filter((u) => u !== 'mut.hiveship'))).toEqual([])
  })

  it('眷屬：朊毒或第一個形態技能 Q、嘶吼 W（只有嘶吼一招的眷屬沒辦法留空格，落在 Q）', () => {
    const multi = spawns('mutant').filter((u) => keysOf(u).length >= 2)
    for (const u of multi) if (keysOf(u).includes('ab.mut.roar')) expect([u, keysOf(u).indexOf('ab.mut.roar')]).toEqual([u, 1])
    expect(misaligned(multi)).toEqual([])
  })

  it('每條進化路線上，前一個形態的技能留到下一個形態時鍵位不變（只有新學的、失去的技能會變）', () => {
    const problems: string[] = []
    for (const f of FORM_LIST) {
      if (!f.from || f.faction === 'android') continue
      const prev = FORM_LIST.find((x) => x.id === f.from)!
      const pairs: [string, string][] = [[prev.unit, f.unit]]
      if (prev.spawnUnit && f.spawnUnit) pairs.push([prev.spawnUnit, f.spawnUnit])
      for (const [a, b] of pairs) {
        const ka = keysOf(a).map(fam)
        const kb = keysOf(b).map(fam)
        for (const s of ka) if (kb.includes(s) && kb.indexOf(s) !== ka.indexOf(s)) problems.push(`${a}→${b} ${s} ${ka.indexOf(s)}→${kb.indexOf(s)}`)
      }
    }
    // 唯一的例外：只有嘶吼一招的眷屬（巢艦地面、腐沼）
    expect(problems.filter((x) => !/\.spawn→mut\.(hiveground|blightcrawler)\.spawn ab\.mut\.roar/.test(x))).toEqual([])
  })
})

describe('技能快捷鍵：人形', () => {
  it('slotOrder：變身／吞食排到最前面，其餘順序不變', () => {
    expect(slotOrder(['cls.mend', 'mut.devour', 'suit.drop'])).toEqual(['mut.devour', 'cls.mend', 'suit.drop'])
    expect(slotOrder(['ab.cryo.lance', 'ab.cryo.shock', 'suit.drop', 'cls.rummage', 'xeno.form'])).toEqual(['xeno.form', 'ab.cryo.lance', 'ab.cryo.shock', 'suit.drop', 'cls.rummage'])
    expect(slotOrder(['a', 'b'])).toEqual(['a', 'b'])
  })

  it('變種人：人形（有職業技能、穿著防護服也一樣）吞食在 Q，進化成掠食者後還是 Q', () => {
    const { h } = Harness.started(3, 2024, { eventMult: 0 })
    const g = h.server.game!
    const p = g.allPlayers()[0]
    g.setRole(p, 'mutant')
    let u = g.mainOf(p)!
    // 醫護兵：職業技能＋吞食
    u.data.extraAbilities = ['cls.mend', 'mut.devour']
    morph(g, u, 'personnel')
    expect(keyed(u.abilities)[0]).toBe('mut.devour')
    u.inv!.fill(null)
    giveItem(g, u, makeItem('suit.cryo'))
    expect(wearSuit(g, u, u.inv!.findIndex((x) => x?.id === 'suit.cryo'))).toBe(true)
    expect(keyed(u.abilities)[0]).toBe('mut.devour')
    expect(u.abilities).toContain('suit.drop')
    u = replaceMain(g, p, u, 'mut.apex', { anon: false })
    expect(keyed(u.abilities)[0]).toBe('mut.devour')
  })

  it('異形：人形時變身在 Q（職業技能之前）；變回人形之後還是 Q', () => {
    const { h } = Harness.started(3, 2025, { eventMult: 0 })
    const g = h.server.game!
    const p = g.allPlayers()[0]
    g.setRole(p, 'xeno')
    const u = g.mainOf(p)!
    u.data.extraAbilities = ['cls.doorHack', 'xeno.form']
    morph(g, u, 'personnel')
    expect(keyed(u.abilities)[0]).toBe('xeno.form')
    const x = replaceMain(g, p, u, 'xeno.protoform', { anon: true })
    expect(keyed(x.abilities).slice(0, 2)).toEqual(['xeno.parasite', 'xeno.human'])
    SCRIPTS.get('xeno.toHuman')!(g, { caster: x, x: x.x, y: x.y, zone: x.zone } as never, {})
    const back = g.mainOf(p)!
    expect(back.def.id).toBe('personnel')
    expect(keyed(back.abilities)[0]).toBe('xeno.form')
    expect(back.abilities).toContain('cls.doorHack')
  })
})
