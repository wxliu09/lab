import { describe, expect, it } from 'vitest'
import { Rng } from '../../src/shared/rng'

describe('Rng', () => {
  it('同種子可重現', () => {
    const a = new Rng(42)
    const b = new Rng(42)
    for (let i = 0; i < 100; i++) expect(a.next()).toBe(b.next())
  })
  it('int 範圍含兩端', () => {
    const r = new Rng(1)
    const seen = new Set<number>()
    for (let i = 0; i < 1000; i++) seen.add(r.int(1, 3))
    expect([...seen].sort()).toEqual([1, 2, 3])
  })
})
