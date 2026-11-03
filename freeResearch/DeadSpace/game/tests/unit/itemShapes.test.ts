// 地上道具依分類有不同外型（render/models/itemShape.ts、groundItems.ts）
import { describe, expect, it } from 'vitest'
import '../../src/shared/content/index'
import { ITEMS } from '../../src/shared/content/registry'
import { ITEM_SHAPES, itemShape, type ItemShape } from '../../src/render/models/itemShape'
import { ITEM_CAT_COLOR, groundItemStats } from '../../src/render/models/groundItems'

describe('地上道具外型', () => {
  it('每個道具都有外型、每種外型都用得到；每個分類都有強調色', () => {
    const used = new Map<ItemShape, string[]>()
    for (const it of ITEMS.values()) {
      const s = itemShape(it)
      expect(ITEM_SHAPES, it.id).toContain(s)
      used.set(s, [...(used.get(s) ?? []), it.id])
      expect(ITEM_CAT_COLOR[it.cat], it.cat).toMatch(/^#[0-9a-f]{6}$/i)
    }
    expect([...used.keys()].sort()).toEqual([...ITEM_SHAPES].sort())
    // 沒有一種外型包辦大半道具（以前 60 多種全是同一個補給箱）
    for (const [s, ids] of used) if (s !== 'suit') expect(ids.length, s).toBeLessThan(ITEMS.size / 4)
  })

  it('代表性道具的外型', () => {
    const want: Record<string, ItemShape> = {
      verdictPistol: 'weapon',
      phaseCannon: 'weapon',
      fragGrenade: 'ordnance',
      fusionCharge: 'ordnance',
      singularity: 'ordnance',
      traumaKit: 'medkit',
      criticalCare: 'medkit',
      stim: 'pharma',
      tetracyne: 'pharma',
      antibodyKit: 'pharma',
      wrench: 'toolbox',
      gravPuller: 'toolbox',
      servoGreaves: 'toolbox',
      tracker: 'scanner',
      securityCamera: 'scanner',
      overrideRemote: 'scanner',
      'suit.tesla': 'suit',
      'suit.labcoat': 'suit',
      captainCard: 'card',
      cashChit: 'card',
      escapePass: 'card',
      testResults: 'card',
      powerCore: 'core',
      energyCell: 'core',
      modKestrel: 'core',
      memoryCore: 'core',
      penguinPlush: 'crate',
      pirateHat: 'crate',
      wormBait: 'crate',
    }
    for (const [id, s] of Object.entries(want)) {
      expect(ITEMS.has(id), id).toBe(true)
      expect(itemShape(ITEMS.get(id)), id).toBe(s)
    }
    expect(itemShape(undefined)).toBe('crate')
  })

  it('低面數：每種外型的本體 ≤ 2500 三角形、發光 ≤ 600 三角形', () => {
    const st = groundItemStats()
    for (const s of ITEM_SHAPES) {
      const [body, glow] = st[s]
      expect(body, s).toBeGreaterThan(20)
      expect(body, s).toBeLessThanOrEqual(2500)
      expect(glow, s).toBeGreaterThan(0)
      expect(glow, s).toBeLessThanOrEqual(600)
    }
  })
})
