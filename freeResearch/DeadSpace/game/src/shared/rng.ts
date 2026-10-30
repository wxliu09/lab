// 可設定種子的亂數（sfc32）。sim 內所有隨機都必須走這裡，測試才能重現。
export class Rng {
  private a: number
  private b: number
  private c: number
  private d: number

  constructor(seed: number) {
    this.a = 0x9e3779b9
    this.b = 0x243f6a88
    this.c = 0xb7e15162
    this.d = seed >>> 0
    for (let i = 0; i < 15; i++) this.next()
  }

  /** [0, 1) */
  next(): number {
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
