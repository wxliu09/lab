// 音訊導演的純函式：地點 → 環境音、倒數提示音、載具速度（引擎聲）
import { describe, expect, it } from 'vitest'
import { countdownTick, vehicleSpeed, zoneAmbient } from '../../src/audio/cues'
import { ALL_STATIONS } from '../../src/shared/content/stations/index'

describe('環境音的地點分類', () => {
  it('黑鷗號（id 不是 ship: 開頭）也拿到船艙底噪，並有自己的特色層', () => {
    expect(zoneAmbient('pirate')).toEqual(['ship', 'pirate'])
    expect(zoneAmbient('ship:mule')).toEqual(['ship', ''])
  })

  it('翠原星（下雨）是有大氣的風雨；餘燼衛星是無大氣的地鳴（沒有雨聲、鳥叫）', () => {
    expect(zoneAmbient('verdance')).toEqual(['outdoor', 'verdance'])
    expect(zoneAmbient('cinder')).toEqual(['moon', 'cinder'])
  })

  it('太空層、廢站、未識別物體', () => {
    expect(zoneAmbient('nyx', true)).toEqual(['space', ''])
    expect(zoneAmbient('hulk7')).toEqual(['derelict', 'hulk7'])
    expect(zoneAmbient('uo')).toEqual(['organic', 'uo'])
  })

  it('每座站的底噪＋特色層組合都不一樣（聽得出差別）', () => {
    const keys = ALL_STATIONS.map((s) => zoneAmbient(s.id).join('|'))
    expect(new Set(keys).size).toBe(ALL_STATIONS.length)
    for (const s of ALL_STATIONS) expect(zoneAmbient(s.id)[1], s.id).toBe(s.id)
  })
})

describe('倒數提示音', () => {
  /** 模擬 10 秒倒數、每 0.1 秒一個快照，記下每次響的音 */
  function run(from: number, step = 0.1): [number, string][] {
    const out: [number, string][] = []
    let last = 0
    for (let left = from; left > -0.5; left = Math.round((left - step) * 10) / 10) {
      last = countdownTick(Math.max(0, left), last, (n) => out.push([left, n]))
    }
    return out
  }

  it('只有最後 5 秒、每秒一聲，最後一秒換高音', () => {
    const beeps = run(10)
    expect(beeps.map((b) => b[1])).toEqual(['countdown', 'countdown', 'countdown', 'countdown', 'countdownLast'])
    // 響在 5、4、3、2、1 秒的整數邊界之後
    expect(beeps.map((b) => Math.ceil(b[0]))).toEqual([5, 4, 3, 2, 1])
  })

  it('快照變稀疏也不會重複響或漏掉最後一聲', () => {
    const beeps = run(10, 0.7)
    expect(beeps.at(-1)?.[1]).toBe('countdownLast')
    const secs = beeps.map((b) => Math.ceil(b[0]))
    expect(new Set(secs).size).toBe(secs.length)
  })

  it('倒數取消（回到 0）或重新開始會重置', () => {
    let last = countdownTick(3.2, 0, () => {})
    expect(last).toBe(4)
    last = countdownTick(0, last, () => {})
    expect(last).toBe(0)
    let n = 0
    last = countdownTick(9.5, last, () => n++)
    expect(n).toBe(0)
    expect(last).toBe(0)
  })
})

describe('引擎聲的速度估計', () => {
  it('由最近兩個樣本算出速度', () => {
    const s = [
      { t: 1, x: 0, y: 0 },
      { t: 1.1, x: 0.12, y: 0 },
    ]
    expect(vehicleSpeed(s, 1.1)).toBeCloseTo(1.2, 5)
  })

  it('停下來之後沒有新樣本 → 視為靜止（不會一直響）', () => {
    const s = [
      { t: 1, x: 0, y: 0 },
      { t: 1.1, x: 0.12, y: 0 },
    ]
    expect(vehicleSpeed(s, 2)).toBe(0)
  })

  it('樣本不足或時間相同 → 0', () => {
    expect(vehicleSpeed([], 0)).toBe(0)
    expect(vehicleSpeed([{ t: 1, x: 0, y: 0 }], 1)).toBe(0)
    expect(
      vehicleSpeed(
        [
          { t: 1, x: 0, y: 0 },
          { t: 1, x: 1, y: 0 },
        ],
        1,
      ),
    ).toBe(0)
  })
})
