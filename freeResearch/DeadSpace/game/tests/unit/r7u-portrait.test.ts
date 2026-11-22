// 第 7 輪 U1：3D 頭像（render/portrait.ts）的外觀規則與快取。不需要 WebGL：換掉畫圖的 backend 直接驗證佇列與快取
import { afterEach, beforeAll, describe, expect, it } from 'vitest'
import type { SnapEntity } from '../../src/shared/protocol/messages'

type P = typeof import('../../src/render/portrait')
let P: P
let COLORS: typeof import('../../src/shared/constants').PLAYER_COLORS

beforeAll(async () => {
  await import('../../src/shared/content')
  P = await import('../../src/render/portrait')
  COLORS = (await import('../../src/shared/constants')).PLAYER_COLORS
})

afterEach(() => P.__setPortraitBackend(null))

/** 記下 portraitSpecOf 讀了快照的哪些欄位 */
function spy(s: SnapEntity): { s: SnapEntity; read: Set<string> } {
  const read = new Set<string>()
  const px = new Proxy(s, {
    get(o, k) {
      if (typeof k === 'string') read.add(k)
      return (o as unknown as Record<string, unknown>)[k as string]
    },
  })
  return { s: px, read }
}

describe('portraitSpecOf：外觀只來自快照（和 units.ts 同一套規則）', () => {
  it('偽裝中的異形（快照是人員外觀）畫成人類，只讀 d／cl／c／i／fl', () => {
    const { s, read } = spy({
      i: 7,
      d: 'personnel',
      cl: 'medic',
      c: 3,
      hp: 90,
      mhp: 100,
      n: 'Bob',
      b: ['regen'],
      x: 1,
      y: 2,
    })
    const spec = P.portraitSpecOf(s)
    expect(spec).toEqual({
      model: 'human',
      cls: 'medic',
      color: COLORS[3].hex,
      def: 'personnel',
      seed: 2,
      framing: 'bust',
    })
    for (const k of read) expect(['i', 'd', 'cl', 'c', 'fl']).toContain(k)
  })

  it('沒有職業時用研究員、沒有玩家色時白色（同 units.ts）', () => {
    expect(P.portraitSpecOf({ i: 10, d: 'personnel' })).toMatchObject({
      model: 'human',
      cls: 'researcher',
      color: '#ffffff',
      seed: 0,
    })
  })

  it('防護服：人類模型＋防護服 id', () => {
    const spec = P.portraitSpecOf({ i: 4, d: 'suit.tesla', cl: 'engineer', c: 0 }, 'full')
    expect(spec).toMatchObject({
      model: 'human',
      def: 'suit.tesla',
      cls: 'engineer',
      framing: 'full',
      seed: 4,
    })
  })

  it('異形形態：用 UnitDef.model、種子＝實體 id、敵對旗標', () => {
    const spec = P.portraitSpecOf({ i: 31, d: 'xeno.protoform', fl: 64 })
    expect(spec).toMatchObject({ model: 'xeno.protoform', def: 'xeno.protoform', seed: 31, hostile: true })
  })

  it('地上的道具用 groundItem 模型；站點用外觀 id；查不到的是 unknown', () => {
    expect(P.portraitSpecOf({ i: 2, d: 'item:traumaKit' }).model).toBe('groundItem')
    expect(P.portraitSpecOf({ i: 2, d: 'station.empress' }).model).toBe('station.empress')
    expect(P.portraitSpecOf({ i: 2, d: 'no.such.thing' }).model).toBe('unknown')
  })
})

describe('portraitKey／portraitDims：正規化', () => {
  it('非人類模型不看玩家色；人類種子只取 % 5；預設半身', () => {
    expect(P.portraitKey({ model: 'xeno.lumen', color: '#ff0000' })).toBe(
      P.portraitKey({ model: 'xeno.lumen', color: '#00ff00' }),
    )
    expect(P.portraitKey({ model: 'human', cls: 'medic', seed: 7 })).toBe(
      P.portraitKey({ model: 'human', cls: 'medic', seed: 2, framing: 'bust' }),
    )
    expect(P.portraitKey({ model: 'human', cls: 'medic', color: '#ff0000' })).not.toBe(
      P.portraitKey({ model: 'human', cls: 'medic', color: '#00ff00' }),
    )
    expect(P.portraitKey({ model: 'human' }, 128)).not.toBe(P.portraitKey({ model: 'human' }, 256))
    expect(P.portraitKey({ model: 'human' })).not.toBe(P.portraitKey({ model: 'human', framing: 'full' }))
  })

  it('尺寸：size 是高度，寬度依 aspect（半身 3:4、全身 1:1）', () => {
    expect(P.portraitDims({ model: 'human' }, 256)).toEqual({ w: 192, h: 256 })
    expect(P.portraitDims({ model: 'human', framing: 'full' }, 200)).toEqual({ w: 200, h: 200 })
    expect(P.portraitDims({ model: 'human', aspect: 2 }, 100)).toEqual({ w: 200, h: 100 })
  })
})

describe('快取與佇列', () => {
  it('第一次回 null、畫好後回 data URL；同一個外觀只畫一次；畫好會通知', () => {
    const calls: string[] = []
    P.__setPortraitBackend((spec, w, h) => {
      calls.push(`${spec.model}:${w}x${h}`)
      return `data:image/png;base64,${calls.length}`
    })
    let ready = 0
    const off = P.onPortraitReady(() => ready++)
    const spec = { model: 'human', cls: 'medic', color: '#ff0000', seed: 1 }
    expect(P.portraitUrl(spec, 256)).toBeNull()
    // 還沒畫完再問一次：不重複排隊
    expect(P.portraitUrl({ ...spec }, 256)).toBeNull()
    expect(P.__portraitStats().queued).toBe(1)
    const ver = P.portraitReady.value
    expect(P.__flushPortraits()).toBe(1)
    expect(calls).toEqual(['human:192x256'])
    expect(ready).toBe(1)
    // 元件讀 portraitReady.value 就會在小圖好了時重繪
    expect(P.portraitReady.value).toBe(ver + 1)
    const url = P.portraitUrl({ ...spec, seed: 6 }, 256)
    expect(url).toBe('data:image/png;base64,1')
    expect(P.__flushPortraits()).toBe(0)
    expect(calls.length).toBe(1)
    off()
    P.portraitUrl({ model: 'xeno.lumen' }, 128)
    P.__flushPortraits()
    expect(ready).toBe(1)
  })

  it('畫不出來的外觀回 null，不會一直重試', () => {
    let n = 0
    P.__setPortraitBackend(() => {
      n++
      return null
    })
    P.portraitUrl({ model: 'unknown' })
    P.__flushPortraits()
    expect(P.portraitUrl({ model: 'unknown' })).toBeNull()
    P.__flushPortraits()
    expect(n).toBe(1)
  })

  it('環境不支援 WebGL：之後一律回 null、不再排隊', () => {
    P.__setPortraitBackend(() => {
      throw 'unsupported'
    })
    P.portraitUrl({ model: 'human', cls: 'a' })
    P.portraitUrl({ model: 'human', cls: 'b' })
    P.__flushPortraits()
    expect(P.portraitSupported()).toBe(false)
    expect(P.portraitUrl({ model: 'human', cls: 'c' })).toBeNull()
    expect(P.__portraitStats().queued).toBe(0)
  })

  it('LRU：超過上限時擠掉最久沒用的，最近問過的留著', () => {
    let n = 0
    P.__setPortraitBackend(() => `data:image/png;base64,${++n}`)
    P.portraitUrl({ model: 'human', cls: 'keep' })
    for (let i = 0; i < P.PORTRAIT_CACHE_MAX - 1; i++) P.portraitUrl({ model: 'human', cls: 'c' + i })
    P.__flushPortraits()
    // 問一次 keep：變成最近用過的
    expect(P.portraitUrl({ model: 'human', cls: 'keep' })).not.toBeNull()
    P.portraitUrl({ model: 'human', cls: 'new' })
    P.__flushPortraits()
    expect(P.__portraitStats().cached).toBe(P.PORTRAIT_CACHE_MAX)
    expect(P.portraitUrl({ model: 'human', cls: 'keep' })).not.toBeNull()
    // c0 是最久沒用的：被擠掉，再問就重新排隊
    expect(P.portraitUrl({ model: 'human', cls: 'c0' })).toBeNull()
  })

  it('排隊中被擠出快取的不畫', () => {
    let n = 0
    P.__setPortraitBackend(() => `data:image/png;base64,${++n}`)
    for (let i = 0; i < P.PORTRAIT_CACHE_MAX + 5; i++) P.portraitUrl({ model: 'human', cls: 'q' + i })
    P.__flushPortraits()
    expect(n).toBe(P.PORTRAIT_CACHE_MAX)
  })

  it('node 環境（沒有 document）：WebGL backend 視為不支援，不會丟例外', () => {
    P.__setPortraitBackend(null)
    expect(P.portraitUrl({ model: 'human' })).toBeNull()
    P.__flushPortraits()
    expect(P.portraitSupported()).toBe(false)
    expect(P.mountSpin({} as HTMLElement, { model: 'human' })).toBeTypeOf('function')
  })
})
