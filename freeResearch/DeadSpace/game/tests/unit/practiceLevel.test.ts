// 練習難度的整體效果：同樣的 seed 各打一次 normal 與 easy 的練習局（主機不動、當異形或變種人＋5 個 AI），
// easy 的人類方（船員）勝率要明顯低於 normal——練習當異形不會太難。
// 很慢（40 局、每局最多 45 分鐘），預設略過：XC_PRACTICE=1 npx vitest run tests/unit/practiceLevel.test.ts
// XC_PRACTICE_SEEDS = 每種身分幾個 seed（預設 10：異形、變種人各 10 局 = 20 局）
import { describe, expect, it } from 'vitest'
import { GameServer, LOCAL_PEER } from '../../src/sim/server'
import { encode } from '../../src/shared/protocol/codec'
import { PRACTICE_ROOM, type AiLevel, type PracticeRole } from '../../src/shared/protocol/messages'

const SEEDS = Number(process.env.XC_PRACTICE_SEEDS ?? 10)
const ROLES: PracticeRole[] = ['xeno', 'mutant']

/** 一局練習：回傳勝方（'crew' = 人類方）*/
function practice(role: PracticeRole, seed: number, aiLevel: AiLevel): string {
  const srv = new GameServer(PRACTICE_ROOM, { send: () => {} }, seed, seed ^ 0x5bd1e995)
  srv.onJoin(LOCAL_PEER)
  srv.onMessage(LOCAL_PEER, encode({ t: 'hello', name: 'Me', color: 0, ver: 1, token: 'tokMexxxxxxx' }))
  srv.onMessage(LOCAL_PEER, encode({ t: 'settings', s: { bots: 5, aiLevel } }))
  srv.onMessage(LOCAL_PEER, encode({ t: 'start', role }))
  const g = srv.game!
  expect(g.settings.aiLevel).toBe(aiLevel)
  for (let i = 0; i < 45 * 60 * 20 && !g.ended; i++) srv.tick()
  return g.ended?.winner ?? 'none'
}

describe.skipIf(!process.env.XC_PRACTICE)('練習難度：整體勝率', () => {
  it(`異形、變種人各 ${SEEDS} 局：easy 的人類方勝率明顯低於 normal（同 seed 對照）`, () => {
    const wins: Record<AiLevel, number> = { normal: 0, easy: 0 }
    const rows: string[] = []
    for (const role of ROLES)
      for (let s = 0; s < SEEDS; s++) {
        const seed = 4100 + s * 389 + role.length * 31
        const n = practice(role, seed, 'normal')
        const e = practice(role, seed, 'easy')
        if (n === 'crew') wins.normal++
        if (e === 'crew') wins.easy++
        rows.push(`${role} ${seed}: normal=${n} easy=${e}`)
      }
    console.log(rows.join('\n') + `\n人類方勝場 normal=${wins.normal} easy=${wins.easy}／${ROLES.length * SEEDS}`)
    // 明顯：easy 至少少一半、而且少 3 場以上
    expect(wins.easy).toBeLessThanOrEqual(wins.normal / 2)
    expect(wins.normal - wins.easy).toBeGreaterThanOrEqual(3)
  }, 7200000)
})
