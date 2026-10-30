// 長時間 headless 對局（M11）：12 人（1 主機＋11 AI）× 20 個 seed × 最多 15 分鐘（＋末日收尾）。
// 很慢，預設略過：XC_SOAK=1 npx vitest run tests/unit/soak.test.ts
import { describe, expect, it } from 'vitest'
import { Harness } from './helpers/harness'
import { checkMessages } from './helpers/leak'

const SEEDS = Number(process.env.XC_SOAK_SEEDS ?? 20)

describe.skipIf(!process.env.XC_SOAK)('12 人 headless 對局', () => {
  it(`${SEEDS} 個 seed：不崩潰、分出勝負或平手、抽樣無洩漏`, () => {
    const results: string[] = []
    const problems: string[] = []
    let worstTick = 0
    for (let s = 0; s < SEEDS; s++) {
      const seed = 1000 + s * 7919
      const { h } = Harness.started(1, seed, { bots: 11, eventMult: 1.5, apocalypse: [12, 15], npcCrew: -1 })
      const g = h.server.game!
      const max = 30 * 60 * 20
      let i = 0
      for (; i < max && !g.ended; i++) {
        const t0 = performance.now()
        h.ticks(1)
        worstTick = Math.max(worstTick, performance.now() - t0)
        if (i % 600 === 0) {
          for (const [peer, raws] of h.raw) {
            const slot = h.server.slotOfPeer(peer)
            if (slot !== null) problems.push(...checkMessages(g, slot, raws.slice(-2)).map((p) => `seed ${seed}: ${p}`))
          }
        }
        for (const r of h.raw.values()) r.length = 0
      }
      results.push(`${seed}:${g.ended?.winner ?? 'none'}@${(i / 1200).toFixed(1)}m`)
      expect(g.ended, `seed ${seed} 沒有結束`).not.toBeNull()
    }
    console.log('soak', results.join(' '), `worst tick ${worstTick.toFixed(1)} ms`)
    expect([...new Set(problems)]).toEqual([])
  }, 3_600_000)
})
