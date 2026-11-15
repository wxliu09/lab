// 門控制器故障期間 AI 的死亡數（headless 練習局）：開局 60 秒強制觸發門故障，跑到故障結束，統計 AI 主單位被門夾的次數與死亡數。
// 很慢（多個 seed、每局約 10 分鐘），預設略過：XC_DOORBENCH=1 npx vitest run tests/unit/r3a-doorBench.test.ts
import { describe, it } from 'vitest'
import { GameServer, LOCAL_PEER } from '../../src/sim/server'
import { encode } from '../../src/shared/protocol/codec'
import { PRACTICE_ROOM, type AiLevel } from '../../src/shared/protocol/messages'
import { DAMAGE_HOOKS, DEATH_HOOKS } from '../../src/sim/systems/damage'
import { eventsOf } from '../../src/sim/systems/events'
import type { Game } from '../../src/sim/game'

const SEEDS = Number(process.env.XC_DOORBENCH_SEEDS ?? 6)

interface Row {
  seed: number
  doorHits: number
  doorDeaths: number
  otherDeaths: number
  causes: string[]
}

let cur: { g: Game; row: Row } | null = null
DAMAGE_HOOKS.push((g, _src, t, _amt, o) => {
  if (!cur || cur.g !== g || !t.isMain || t.owner < 0 || !g.players[t.owner]?.bot) return
  if (o.env === 'door') cur.row.doorHits++
})
DEATH_HOOKS.push((g, u) => {
  if (!cur || cur.g !== g || !u.isMain || u.owner < 0 || !g.players[u.owner]?.bot || u.data.converted) return
  const door = g.time - (u.data.doorHitAt as number | undefined ?? -9) < 0.01
  if (door) cur.row.doorDeaths++
  else cur.row.otherDeaths++
  cur.row.causes.push(`${Math.round(g.time)}s ${door ? 'door' : 'other'}`)
})
DAMAGE_HOOKS.push((g, _src, t, _amt, o) => {
  if (o.env === 'door') t.data.doorHitAt = g.time
})

function run(seed: number, aiLevel: AiLevel): Row {
  const srv = new GameServer(PRACTICE_ROOM, { send: () => {} }, seed, seed ^ 0x5bd1e995)
  srv.onJoin(LOCAL_PEER)
  srv.onMessage(LOCAL_PEER, encode({ t: 'hello', name: 'Me', color: 0, ver: 1, token: 'tokMexxxxxxx' }))
  srv.onMessage(LOCAL_PEER, encode({ t: 'settings', s: { bots: 7, aiLevel, eventMult: 0 } }))
  srv.onMessage(LOCAL_PEER, encode({ t: 'start', role: 'human' }))
  const g = srv.game!
  const row: Row = { seed, doorHits: 0, doorDeaths: 0, otherDeaths: 0, causes: [] }
  cur = { g, row }
  for (let i = 0; i < 60 * 20; i++) srv.tick()
  g.triggerEvent!('doors', true)
  const until = eventsOf(g).doorsUntil
  while (g.time < until && !g.ended) srv.tick()
  cur = null
  return row
}

describe.skipIf(!process.env.XC_DOORBENCH)('門故障期間 AI 的死亡數', () => {
  it('統計', () => {
    const level = (process.env.XC_DOORBENCH_LEVEL ?? 'easy') as AiLevel
    const rows: Row[] = []
    for (let s = 0; s < SEEDS; s++) rows.push(run(5100 + s * 211, level))
    const sum = (k: 'doorHits' | 'doorDeaths' | 'otherDeaths') => rows.reduce((n, r) => n + r[k], 0)
    console.log(
      rows.map((r) => `seed ${r.seed}: 夾到 ${r.doorHits} 次、門夾死 ${r.doorDeaths}、其他死亡 ${r.otherDeaths}  [${r.causes.join(', ')}]`).join('\n') +
        `\n合計（${level}）：夾到 ${sum('doorHits')} 次、門夾死 ${sum('doorDeaths')}、其他死亡 ${sum('otherDeaths')}`,
    )
  }, 3600000)
})
