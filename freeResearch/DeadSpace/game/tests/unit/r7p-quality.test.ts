// 第 7 輪（視聽與手感）進階畫質：在所選的畫質預設之上個別覆寫陰影、環境光遮蔽、泛光、粒子密度、解析度，存檔；
// 有覆寫時顯示「自訂」、再選一次預設就清掉；preset() 的欄位是即時 getter，effect 只訂閱實際讀到的欄位
// （engine.ts 的後處理重建不會因為改粒子密度而重跑）
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest'
import { effect } from '@preact/signals'

class Mem {
  m = new Map<string, string>()
  getItem(k: string) {
    return this.m.get(k) ?? null
  }
  setItem(k: string, v: string) {
    this.m.set(k, String(v))
  }
  removeItem(k: string) {
    this.m.delete(k)
  }
}

const g = globalThis as unknown as Record<string, unknown>
const saved: Record<string, unknown> = {}
const ls = new Mem()
type Q = typeof import('../../src/render/quality')
let Q: Q

beforeAll(async () => {
  for (const k of ['localStorage', 'window']) saved[k] = g[k]
  g.localStorage = ls
  // 預先存一份覆寫（含格式不對的欄位）：載入時驗證
  ls.setItem('xc.quality', 'medium')
  ls.setItem('xc.qualityDetail', JSON.stringify({ shadows: 0, ssao: 7, bloom: 0.33, particles: 6000, res: 0.75, junk: 1 }))
  Q = await import('../../src/render/quality')
})
afterAll(() => {
  for (const [k, v] of Object.entries(saved)) g[k] = v
})
beforeEach(() => {
  g.window = { devicePixelRatio: 1 }
})

describe('進階畫質', () => {
  it('載入存檔：只留合法的欄位；實際畫質＝預設＋覆寫', () => {
    expect(Q.quality.value).toBe('medium')
    expect(Q.qualityDetail.value).toEqual({ shadows: 0, particles: 6000, res: 0.75 })
    const p = Q.preset()
    expect(p.shadows).toBe(0)
    expect(p.ssao).toBe(Q.PRESETS.medium.ssao)
    expect(p.bloom).toBe(Q.PRESETS.medium.bloom)
    expect(p.particles).toBe(6000)
    expect(p.maxLights).toBe(Q.PRESETS.medium.maxLights)
    // 解析度是螢幕原生解析度的比例：1x 螢幕 0.75、2x 螢幕 1.5
    expect(p.dpr).toBeCloseTo(0.75)
    g.window = { devicePixelRatio: 2 }
    expect(p.dpr).toBeCloseTo(1.5)
    expect(Q.isCustom()).toBe(true)
  })

  it('sanitizeDetail：超出選項、型別不對的丟掉', () => {
    expect(Q.sanitizeDetail(null)).toEqual({})
    expect(Q.sanitizeDetail('x')).toEqual({})
    expect(Q.sanitizeDetail({ shadows: 3, ssao: -1, bloom: 2, particles: 99, res: 0.2 })).toEqual({})
    expect(Q.sanitizeDetail({ shadows: 2, ssao: 1, bloom: 0, particles: 500, res: 1 })).toEqual({ shadows: 2, ssao: 1, bloom: 0, particles: 500, res: 1 })
  })

  it('applyDetail（純函式）', () => {
    const base = Q.PRESETS.high
    expect(Q.applyDetail(base, {}, 2)).toEqual(base)
    expect(Q.applyDetail(base, { res: 0.5, bloom: 0 }, 2)).toEqual({ ...base, dpr: 1, bloom: 0 })
  })

  it('baseRes：預設的 dpr 上限 ÷ 螢幕 dpr（1x 螢幕都是 100%）', () => {
    for (const q of ['low', 'medium', 'high', 'ultra'] as const) expect(Q.baseRes(q, 1)).toBe(1)
    expect(Q.baseRes('low', 2)).toBe(0.5)
    expect(Q.baseRes('medium', 2)).toBe(0.625)
    expect(Q.baseRes('ultra', 2)).toBe(1)
  })

  it('選一個預設：清掉所有覆寫、不再是自訂；存檔也清掉', () => {
    Q.setQuality('high')
    expect(Q.qualityDetail.value).toEqual({})
    expect(Q.isCustom()).toBe(false)
    expect(ls.getItem('xc.qualityDetail')).toBeNull()
    expect(ls.getItem('xc.quality')).toBe('high')
    expect(Q.qualityChosen()).toBe(true)
    expect({ ...Q.preset() }).toEqual(Q.PRESETS.high)
  })

  it('setDetail：存檔、顯示自訂；設回和預設一樣的值就不留覆寫；null = 回到預設', () => {
    Q.setQuality('medium')
    Q.setDetail('bloom', 0)
    expect(Q.qualityDetail.value).toEqual({ bloom: 0 })
    expect(JSON.parse(ls.getItem('xc.qualityDetail')!)).toEqual({ bloom: 0 })
    expect(Q.isCustom()).toBe(true)
    expect(Q.detailValue('bloom')).toBe(0)
    Q.setDetail('bloom', Q.PRESETS.medium.bloom)
    expect(Q.qualityDetail.value).toEqual({})
    expect(Q.isCustom()).toBe(false)
    Q.setDetail('ssao', 0)
    Q.setDetail('res', 0.6)
    expect(Q.detailValue('res')).toBeCloseTo(0.6)
    Q.setDetail('ssao', null)
    expect(Q.qualityDetail.value).toEqual({ res: 0.6 })
    Q.setDetail('res', 1)
    expect(Q.isCustom()).toBe(false)
    // 不在選項裡的值不收
    Q.setDetail('particles', 1234)
    expect(Q.qualityDetail.value).toEqual({})
    Q.resetDetail()
  })

  it('effect 只訂閱讀到的欄位：改粒子密度不會讓只讀陰影／AO／泛光／dpr 的 effect 重跑（engine.ts 的後處理重建）', () => {
    Q.setQuality('medium')
    let rebuilds = 0
    let seenAo = -1
    const stop = effect(() => {
      void Q.quality.value
      const q = Q.preset()
      seenAo = q.ssao
      void q.bloom
      void q.shadows
      void q.dpr
      rebuilds++
    })
    expect(rebuilds).toBe(1)
    Q.setDetail('particles', 6000)
    expect(rebuilds).toBe(1)
    expect(Q.preset().particles).toBe(6000)
    Q.setDetail('ssao', 0)
    expect(rebuilds).toBe(2)
    expect(seenAo).toBe(0)
    Q.setDetail('res', 0.5)
    expect(rebuilds).toBe(3)
    Q.setQuality('low')
    expect(rebuilds).toBe(4)
    stop()
  })
})
