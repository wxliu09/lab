// 第 6 輪（付費玩家第一晚審查）介面：頂列避開左上的目標面板（hud/topLayout.ts 的 fitTopBar）
import { describe, expect, it } from 'vitest'
import { TOP_GAP, fitTopBar, type TopFitIn } from '../../src/ui/hud/topLayout'

/** 目標面板：左 10、寬 320（CSS px）乘上縮放 */
const guideRight = (z: number) => 330 * z

function fit(o: Partial<TopFitIn> & Pick<TopFitIn, 'vw' | 'z' | 'barW'>) {
  return fitTopBar({ compact: false, fullW: 0, guideRight: guideRight(o.z), ...o })
}

describe('頂列避開目標面板', () => {
  it('寬螢幕：照常置中，不碰到目標面板', () => {
    // 1600×900（縮放約 1.18）、完整頂列約 600 CSS px
    const z = 1.184
    const f = fit({ vw: 1600, z, barW: 600 * z })
    expect(f).toMatchObject({ compact: false, stack: false })
    expect(f.left).toBeCloseTo((1600 - 600 * z) / 2)
    expect(f.left).toBeGreaterThanOrEqual(guideRight(z) + TOP_GAP * z)
  })

  it('1024×600（縮放 0.85）：置中會壓到目標面板 → 往右推，右緣仍在畫面內', () => {
    const z = 0.85
    const barW = 713 * z // 變種人（有 EP）的中文頂列
    const f = fit({ vw: 1024, z, barW })
    expect(f).toMatchObject({ compact: false, stack: false })
    expect(f.left).toBeCloseTo(guideRight(z) + TOP_GAP * z)
    expect(f.left + barW).toBeLessThanOrEqual(1024 - TOP_GAP * z)
  })

  it('放不下完整版就改精簡版；精簡版量到的寬度放得下就靠在面板右側', () => {
    // 853×480（縮放 0.85）：英文變種人頂列約 740 CSS px，面板右側只剩約 650
    const z = 0.85
    const first = fit({ vw: 853, z, barW: 740 * z })
    expect(first.compact).toBe(true)
    const second = fit({ vw: 853, z, barW: 580 * z, compact: true, fullW: 740 * z })
    expect(second).toMatchObject({ compact: true, stack: false })
    expect(second.left).toBeGreaterThanOrEqual(guideRight(z) + TOP_GAP * z - 0.01)
    expect(second.left + 580 * z).toBeLessThanOrEqual(853)
  })

  it('精簡版在視窗變大後回到完整版（要多留一點餘裕，避免來回切換）', () => {
    const z = 0.947
    expect(fit({ vw: 1280, z, barW: 560 * z, compact: true, fullW: 740 * z }).compact).toBe(false)
    // 剛好放得下（沒有餘裕）時維持精簡版
    const room = 1280 - TOP_GAP * z - (guideRight(z) + TOP_GAP * z)
    expect(fit({ vw: 1280, z, barW: 560 * z, compact: true, fullW: room - 1 }).compact).toBe(true)
    expect(fit({ vw: 1280, z, barW: room - 1, compact: false }).compact).toBe(false)
  })

  it('精簡版也放不下（極窄視窗）：目標面板移到頂列下方，頂列置中；沒有目標面板時不必移', () => {
    const z = 0.85
    const f = fit({ vw: 700, z, barW: 600 * z, compact: true, fullW: 760 * z })
    expect(f).toMatchObject({ compact: true, stack: true })
    expect(f.left).toBeCloseTo((700 - 600 * z) / 2)
    const none = fitTopBar({ vw: 700, z, barW: 600 * z, compact: true, fullW: 760 * z, guideRight: null })
    expect(none.stack).toBe(false)
  })

  it('沒有目標面板（看筆記時）：置中；連置中都放不下才精簡', () => {
    const z = 1.143
    const f = fitTopBar({ vw: 1280, z, barW: 740 * z, compact: false, fullW: 0, guideRight: null })
    expect(f).toMatchObject({ compact: false, stack: false })
    expect(f.left).toBeCloseTo((1280 - 740 * z) / 2)
  })

  it('支援的解析度與介面大小：最寬的完整頂列（英文、有 EP）精簡後一定放得下、不需要移動目標面板', () => {
    // [視窗寬, 縮放]：1024×600、1280×720（×1.0、×1.3）、853×480、1600×900、1920×1080（×1.6 被限制在 vw/1120）
    const cases: [number, number][] = [
      [1024, 0.85],
      [1280, 0.947],
      [1280, 1.143],
      [853, 0.85],
      [1600, 1.184],
      [1920, 1.714],
    ]
    for (const [vw, z] of cases) {
      const full = fit({ vw, z, barW: 780 * z })
      const w = full.compact ? 600 * z : 780 * z
      const f = full.compact ? fit({ vw, z, barW: w, compact: true, fullW: 780 * z }) : full
      expect([vw, z, f.stack]).toEqual([vw, z, false])
      expect(f.left).toBeGreaterThanOrEqual(guideRight(z) + TOP_GAP * z - 0.01)
      expect(f.left + w).toBeLessThanOrEqual(vw)
    }
  })
})
