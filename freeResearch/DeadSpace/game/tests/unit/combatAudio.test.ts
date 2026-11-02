// 戰鬥音效分類：叫聲種類、命中材質、音色只由外觀決定（不洩漏偽裝）
import { describe, expect, it } from 'vitest'
import { familyOf, hitKind, materialOf, voicePitch } from '../../src/audio/combat'
import { EntFlag } from '../../src/shared/protocol/messages'

describe('戰鬥音效分類', () => {
  it('依外觀 def 判斷叫聲種類', () => {
    expect(familyOf('personnel')).toBe('human')
    expect(familyOf('suit.pyro')).toBe('human')
    expect(familyOf('npc.crew')).toBe('human')
    expect(familyOf('pirate.captain')).toBe('human')
    expect(familyOf('pirate.sentry')).toBe('machine')
    expect(familyOf('npc.pacifier')).toBe('machine')
    expect(familyOf('android.bulwark')).toBe('machine')
    expect(familyOf('xeno.brute')).toBe('xeno')
    expect(familyOf('xeno.weaver')).toBe('bug')
    expect(familyOf('xeno.egg')).toBe('goo')
    expect(familyOf('mut.colossus')).toBe('mutant')
    expect(familyOf('mut.carcinid')).toBe('bug')
    expect(familyOf('mut.slime')).toBe('goo')
    expect(familyOf('creature.chicken')).toBe('critter')
    expect(familyOf('creature.stag')).toBe('beast')
    expect(familyOf('item:medkit')).toBeNull()
    expect(familyOf(undefined)).toBeNull()
  })

  it('命中材質：護盾、石化、機械、甲殼', () => {
    expect(materialOf({ d: 'personnel' })).toBe('flesh')
    expect(materialOf({ d: 'personnel', fl: EntFlag.Shielded })).toBe('shield')
    expect(materialOf({ d: 'personnel', fl: EntFlag.Petrified })).toBe('stone')
    expect(materialOf({ d: 'suit.guard' })).toBe('metal')
    expect(materialOf({ d: 'npc.defenseDrone' })).toBe('metal')
    expect(materialOf({ d: 'xeno.brute' })).toBe('carapace')
    expect(materialOf({ d: 'mut.prion' })).toBe('goo')
    expect(materialOf(undefined)).toBe('flesh')
  })

  it('武器樣式 → 打擊類型', () => {
    expect(hitKind('tracer')).toBe('bullet')
    expect(hitKind(undefined)).toBe('bullet')
    expect(hitKind('claw')).toBe('slash')
    expect(hitKind('orb')).toBe('energy')
    expect(hitKind('fireball')).toBe('fire')
    expect(hitKind('lob', 'rock')).toBe('blunt')
    expect(hitKind('lob', 'flask')).toBe('energy')
  })

  it('音色只由外觀＋顯示顏色決定：偽裝成某人時聲音和本人一樣', () => {
    // 同外觀同顏色 → 同音高（偽裝者換了 id，但 d 與 c 一樣）
    expect(voicePitch('personnel', 3)).toBe(voicePitch('personnel', 3))
    // 不同顏色的玩家多半聽得出不同
    const ks = new Set(Array.from({ length: 12 }, (_, i) => voicePitch('personnel', i).toFixed(3)))
    expect(ks.size).toBeGreaterThan(6)
    for (let i = 0; i < 12; i++) {
      const k = voicePitch('personnel', i)
      expect(k).toBeGreaterThanOrEqual(0.84)
      expect(k).toBeLessThanOrEqual(1.2)
    }
    // 函式簽名不接受 id：只有 (外觀, 顏色)
    expect(voicePitch.length).toBe(2)
  })
})
