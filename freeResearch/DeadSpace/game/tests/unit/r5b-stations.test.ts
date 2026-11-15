// 第 5 輪：開局啟用哪些站照原作 eKv（war3map.j 18691–18713）。
// - 活體庫號（Syllus）、擺渡號（Pown）：ekv（bj_FORCE_ALL_PLAYERS ≥ 11）恆成立 → 每一局都在；
// - 火口號（Calipea）：參與人數 ≥7（qr = 1–3）、qr==1、而且有人抽到工程師才出現；工程師這時出生在火口號；
// - 大廳手動指定照舊
import { describe, expect, it } from 'vitest'
import { Harness } from './helpers/harness'
import { QR_MIN_PLAYERS } from '../../src/sim/setup'
import type { Game } from '../../src/sim/game'

const has = (g: Game, id: string) => g.world.zones.some((z) => z.alive && z.key === id)

function start(n: number, seed: number, settings: Record<string, unknown> = {}) {
  const { h } = Harness.started(n, seed, { eventMult: 0, ...settings })
  return h.server.game!
}

describe('auto：依原作規則啟用額外站', () => {
  it('3–6 人：核心站＋活體庫號＋擺渡號，沒有火口號（qr = 0，就算有人抽到工程師）', () => {
    for (const n of [3, 4, 5, 6]) {
      for (const seed of [11, 12, 13]) {
        const g = start(n, seed)
        expect(g.data.qr, `n=${n}`).toBe(0)
        expect(has(g, 'vivarium'), `n=${n}`).toBe(true)
        expect(has(g, 'portage'), `n=${n}`).toBe(true)
        expect(has(g, 'caldera'), `n=${n} seed=${seed}`).toBe(false)
        for (const id of ['nyx', 'adjudicatrix', 'tenshu', 'hulk7', 'bravado', 'verdance', 'cinder']) expect(has(g, id), id).toBe(true)
        // 事件站不會在開局出現
        expect(has(g, 'pirate') || has(g, 'uo')).toBe(false)
        // 開局訊息的站點清單和實際的站一致
        expect(g.stations).not.toContain('caldera')
      }
    }
  })

  it(`≥${QR_MIN_PLAYERS} 人：qr 在 1–3；火口號只在 qr==1 而且有工程師時出現，工程師出生在火口號`, () => {
    const seen = new Set<number>()
    let withCaldera = 0
    let engineerButNoQr = 0
    for (let seed = 1; seed <= 14; seed++) {
      for (const n of [7, 12]) {
        const g = start(n, seed)
        const qr = g.data.qr as number
        expect(qr).toBeGreaterThanOrEqual(1)
        expect(qr).toBeLessThanOrEqual(3)
        seen.add(qr)
        const eng = g.allPlayers().find((p) => p.classId === 'engineer')
        // 12 人局 12 張職業卡全發完，一定有工程師
        if (n === 12) expect(eng).toBeTruthy()
        const want = qr === 1 && !!eng
        expect(has(g, 'caldera'), `seed=${seed} n=${n} qr=${qr} eng=${!!eng}`).toBe(want)
        expect(g.stations.includes('caldera')).toBe(want)
        expect(has(g, 'vivarium') && has(g, 'portage')).toBe(true)
        if (want) {
          withCaldera++
          const cz = g.world.zones.find((z) => z.key === 'caldera')!
          expect(g.mainOf(eng!)!.zone).toBe(cz.id)
          // 站內設施與停機坪登錄都和開局的站一樣
          expect(g.world.inZone(cz.id).some((e) => e.data.poi === 'console')).toBe(true)
          expect(g.zoneList().some(([id]) => id === cz.id)).toBe(true)
        } else if (eng) {
          engineerButNoQr++
          expect(g.world.zones[g.mainOf(eng)!.zone]?.key).not.toBe('caldera')
        }
      }
    }
    expect(seen.size).toBe(3)
    expect(withCaldera).toBeGreaterThan(0)
    expect(engineerButNoQr).toBeGreaterThan(0)
  })

  it('大廳手動指定：照指定的站，不擲 qr、不補建火口號', () => {
    const g = start(12, 5, { stations: ['caldera'] })
    expect(has(g, 'caldera')).toBe(true)
    expect(has(g, 'vivarium')).toBe(false)
    expect(has(g, 'portage')).toBe(false)
    const g2 = start(12, 5, { stations: ['vivarium'] })
    expect(has(g2, 'caldera')).toBe(false)
    expect(has(g2, 'vivarium')).toBe(true)
  })
})
