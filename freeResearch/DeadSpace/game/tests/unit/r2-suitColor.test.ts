import { describe, expect, it } from 'vitest'
import { SUIT_IDS } from '../../src/render/models/suits'
import { suitColor } from '../../src/ui/names'

describe('防護服圖示色調', () => {
  it('每套都有固定色、彼此不重複', () => {
    const cs = SUIT_IDS.map(suitColor)
    expect(cs.every((c) => c.startsWith('#'))).toBe(true)
    expect(new Set(cs).size).toBe(cs.length)
  })
  it('顏色和名字對得上：冷凍偏藍、火焰偏紅', () => {
    const rgb = (h: string) => [1, 3, 5].map((i) => parseInt(h.slice(i, i + 2), 16))
    const [cr, , cb] = rgb(suitColor('suit.cryo'))
    const [pr, , pb] = rgb(suitColor('suit.pyro'))
    expect(cb).toBeGreaterThan(cr)
    expect(pr).toBeGreaterThan(pb)
  })
})
