// 可設定種子的亂數（sfc32）。sim 內所有隨機都必須走這裡，測試才能重現。
//
// 種子有兩種寫法：
// - 數字（32 bit）：測試、除錯用的明確種子，結果可重現。只有 32 bit，能被窮舉，**不得**用在正式對局的秘密亂數。
// - 四個 32 bit 字（[a, b, c, d]）：sfc32 的 128 bit 狀態全部由種子決定。正式對局的秘密亂數一律用 cryptoSeed()
//   產生（crypto.getRandomValues），2¹²⁸ 種可能，無法由送出去的資料窮舉回推。
//   第 5 輪審查 P0：以前身分與實體 id 共用一個 31 bit 的種子，從快照裡的實體 id 掃完 2³¹ 約 7 分鐘就算出全部身分。
//
// 另外有 'crypto' 來源：不跑 sfc32，每次都直接取 crypto.getRandomValues（沒有內部狀態可回推）。給「輸出原樣公開」的流用：
// 實體 id 每個都送給 client，sfc32 的輸出幾乎整個 32 bit 公開，理論上可以回推內部狀態、預測之後的 id，
// 進而把偽裝、分身換 id 前後的單位對起來（id 隨機化本來就是要藏建立順序）；直接取密碼學亂數就沒有這個問題。
//
// sim 裡每一條亂數流、公開或秘密、種子來源的盤點表在 src/sim/game.ts（SecretSeeds 上方）。
export type RngSeed = number | readonly [number, number, number, number]
/** Rng 的來源：種子（sfc32，可重現），或 'crypto'（每次直接取密碼學亂數，不可重現）*/
export type RngSource = RngSeed | 'crypto'

/** 128 bit 的密碼學亂數種子（四個字都由 crypto.getRandomValues 填滿）：正式對局的秘密亂數流用 */
export function cryptoSeed(): [number, number, number, number] {
  const a = new Uint32Array(4)
  globalThis.crypto.getRandomValues(a)
  return [a[0], a[1], a[2], a[3]]
}

/** 一個獨立的密碼學亂數（非零 31 bit）：公開的識別碼用（例如一局的 gid），不是亂數流、推不出任何東西 */
export function cryptoId31(): number {
  const a = new Uint32Array(1)
  globalThis.crypto.getRandomValues(a)
  return (a[0] & 0x7fffffff) || 1
}

export class Rng {
  private a = 0
  private b = 0
  private c = 0
  private d = 0
  /** 'crypto' 來源的緩衝（一次取 64 個字）；null = sfc32 */
  private pool: Uint32Array<ArrayBuffer> | null = null
  private pi = 0

  constructor(seed: RngSource) {
    if (seed === 'crypto') {
      this.pool = new Uint32Array(64)
      this.pi = this.pool.length
      return
    }
    if (typeof seed === 'number') {
      // 舊的數字種子：前三個字是固定常數，只有 d 由種子決定（測試的既有結果照舊）
      this.a = 0x9e3779b9
      this.b = 0x243f6a88
      this.c = 0xb7e15162
      this.d = seed >>> 0
    } else {
      this.a = seed[0] >>> 0
      this.b = seed[1] >>> 0
      this.c = seed[2] >>> 0
      this.d = seed[3] >>> 0
    }
    for (let i = 0; i < 15; i++) this.next()
  }

  /** [0, 1) */
  next(): number {
    if (this.pool) {
      if (this.pi >= this.pool.length) {
        globalThis.crypto.getRandomValues(this.pool)
        this.pi = 0
      }
      return this.pool[this.pi++] / 4294967296
    }
    let { a, b, c, d } = this
    a >>>= 0
    b >>>= 0
    c >>>= 0
    d >>>= 0
    let t = (a + b) | 0
    a = b ^ (b >>> 9)
    b = (c + (c << 3)) | 0
    c = (c << 21) | (c >>> 11)
    d = (d + 1) | 0
    t = (t + d) | 0
    c = (c + t) | 0
    this.a = a
    this.b = b
    this.c = c
    this.d = d
    return (t >>> 0) / 4294967296
  }

  /** 含 min 與 max 的整數 */
  int(min: number, max: number): number {
    return min + Math.floor(this.next() * (max - min + 1))
  }

  range(min: number, max: number): number {
    return min + this.next() * (max - min)
  }

  chance(p: number): boolean {
    return this.next() < p
  }

  pick<T>(arr: readonly T[]): T {
    return arr[Math.floor(this.next() * arr.length)]
  }

  shuffle<T>(arr: T[]): T[] {
    for (let i = arr.length - 1; i > 0; i--) {
      const j = Math.floor(this.next() * (i + 1))
      const tmp = arr[i]
      arr[i] = arr[j]
      arr[j] = tmp
    }
    return arr
  }

  /** 不重複、非零的 31-bit id（實體 id 不可用流水號，否則會洩漏建立順序） */
  id31(): number {
    return 1 + Math.floor(this.next() * 0x7ffffffe)
  }
}
