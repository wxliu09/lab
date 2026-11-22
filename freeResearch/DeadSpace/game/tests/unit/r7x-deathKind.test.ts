// 第 7 輪：死亡噴濺只看「看起來的樣子」（快照裡的外觀 def 與可見旗標），不看身分。
// 偽裝成人的異形死在人形時，client 手上只有人的外觀 → 人的血；石化、盟友才看得到的幻象旗標各有自己的樣子。
import { describe, expect, it } from 'vitest'
import '../../src/shared/content/index'
import { EntFlag } from '../../src/shared/protocol/messages'
import { deathKind } from '../../src/render/fx/death'

describe('deathKind', () => {
  it('依外觀分類', () => {
    expect(deathKind({ d: 'personnel', fl: 0 })).toBe('human')
    expect(deathKind({ d: 'suit.pyro', fl: 0 })).toBe('suit')
    expect(deathKind({ d: 'xeno.protoform', fl: 0 })).toBe('xeno')
    expect(deathKind({ d: 'xeno.cocoon', fl: 0 })).toBe('xenoGoo')
    expect(deathKind({ d: 'mut.brawn', fl: 0 })).toBe('mutant')
    expect(deathKind({ d: 'mut.slime', fl: 0 })).toBe('none')
    expect(deathKind({ d: 'creature.slugling', fl: 0 })).toBe('goo')
    expect(deathKind({ d: 'android.gale', fl: 0 })).toBe('android')
    expect(deathKind({ d: 'pirate.sentry', fl: 0 })).toBe('machine')
    expect(deathKind({ d: 'creature.chicken', fl: 0 })).toBe('beast')
  })
  it('偽裝：外觀是人就是人的血（函式拿不到身分）', () => {
    // 異形偽裝成某位船員時，快照的 d 就是人員外觀
    expect(deathKind({ d: 'personnel', fl: EntFlag.Hostile })).toBe('human')
  })
  it('可見旗標：石化碎裂、盟友看得到的幻象消散', () => {
    expect(deathKind({ d: 'personnel', fl: EntFlag.Petrified })).toBe('stone')
    expect(deathKind({ d: 'xeno.brute', fl: EntFlag.Hallucination })).toBe('mirage')
  })
  it('道具、區域物件、站點不噴', () => {
    expect(deathKind({ d: 'item:medkit', fl: 0 })).toBe('none')
    expect(deathKind({ d: 'rig.fireField', fl: 0 })).toBe('none')
    expect(deathKind({ d: 'station.nyx', fl: 0 })).toBe('none')
    expect(deathKind({ d: '', fl: 0 })).toBe('none')
  })
})
