// 練習局 headless 統計（第 6 輪 sim／AI 修正的前後對比用）：練習房、主機＋5 個 AI（和練習對話框的預設一樣）× 多個 seed × 簡單／一般。
// 很慢，預設略過（console 要開 --silent=false 才看得到）：
//   R6S_STATS=1 R6S_SEEDS=20 R6S_LEVEL=easy R6S_HOST=bot npx vitest run tests/unit/r6s-stats.test.ts --silent=false
// R6S_HOST=bot（預設）主機也交給 AI；idle = 主機留給一個不動的真人。R6S_SEED0 = 從第幾個 seed 開始（平行跑多份用）。
// 統計：勝方分布、平手率、前 7 分鐘無辜者（人類方）被不是異類的東西殺死、誤傷（人類方打到人類方玩家、打到 NPC 船員／無人機；
// 含輻射裝外洩這類被動傷害）、AI 異類整場沒有任何可見行動（感染 0、擊殺 0）、結束時在翠原星上活著的人數。
import { describe, expect, it } from 'vitest'
import { GameServer, LOCAL_PEER } from '../../src/sim/server'
import { encode } from '../../src/shared/protocol/codec'
import { PRACTICE_ROOM, type ClientMsg } from '../../src/shared/protocol/messages'
import { DAMAGE_HOOKS, DEATH_HOOKS } from '../../src/sim/systems/damage'
import { eventsOf } from '../../src/sim/systems/events'
import type { Ent } from '../../src/sim/ent'
import type { Game } from '../../src/sim/game'

const SEEDS = Number(process.env.R6S_SEEDS ?? 20)
const LEVELS = (process.env.R6S_LEVEL ?? 'easy,normal').split(',') as ('easy' | 'normal')[]
const SEED0 = Number(process.env.R6S_SEED0 ?? 0)
/** idle = 主機留給真人（不動）；預設 bot = 主機也交給 AI */
const HOST = process.env.R6S_HOST ?? 'bot'

function join(s: GameServer, peer: string, name: string): (m: ClientMsg) => void {
  s.onJoin(peer)
  const send = (m: ClientMsg) => s.onMessage(peer, encode(m))
  send({ t: 'hello', name, color: 0, ver: 1, token: 'tok' + name.padEnd(8, 'x') })
  return send
}

interface Death {
  t: number
  victim: string
  vf: string
  killer: string
}

interface Stat {
  seed: number
  /** 主機開局時的陣營（主機不動時，主機是異類就等於少一個會出手的異類）*/
  host: string
  winner: string
  dur: number
  deaths: Death[]
  /** 前 7 分鐘不是異類（異形／變種人／其眷屬）造成的無辜者（人類方）死亡 */
  early: Death[]
  /** 人類方玩家單位打到另一個人類方玩家單位（次數、最早時間）*/
  ffPlayer: number
  ffPlayerT: number
  /** 玩家單位打到 NPC 船員／無人機 */
  ffNpc: number
  ffNpcT: number
  /** 誤傷細節（前幾筆）*/
  ffLog: string[]
  /** 異類 AI 的可見行動：感染數、異類擊殺數 */
  infections: number
  evilKills: number
  /** 末日公告（前 60 秒預警）之後才發生的感染數 */
  infDoom: number
  /** 末日開始時活著的人數、結束時在翠原星的人數 */
  apocAlive: number
  onVerdance: number
}

function faction(g: Game, e: Ent | null): string {
  if (!e) return 'env'
  if (e.owner >= 0) return g.players[e.owner] ? g.faction(g.players[e.owner]) : 'p?'
  return (e.owner === -2 ? 'hostile:' : 'npc:') + e.def.id
}

function runOne(seed: number, level: 'easy' | 'normal'): Stat {
  const s = new GameServer(PRACTICE_ROOM, { send: () => {} }, seed, seed ^ 0x5bd1e995)
  const host = join(s, LOCAL_PEER, 'Host')
  host({ t: 'settings', s: { bots: 5, aiLevel: level } })
  host({ t: 'start' })
  const g = s.game!
  // 主機也交給 AI（全 AI 練習局）
  if (HOST === 'bot') g.players[0].bot = true
  const st: Stat = { seed, host: g.faction(g.players[0]), winner: '', dur: 0, deaths: [], early: [], ffPlayer: 0, ffPlayerT: -1, ffNpc: 0, ffNpcT: -1, ffLog: [], infections: 0, evilKills: 0, infDoom: 0, apocAlive: -1, onVerdance: 0 }
  const dh = (g2: Game, src: Ent | null, t: Ent, amount: number) => {
    if (g2 !== g || !src || amount <= 0 || src.owner < 0) return
    const sp = g.players[src.owner]
    if (!sp || g.faction(sp) !== 'crew') return
    if (t.owner >= 0 && t.owner !== src.owner && g.players[t.owner] && g.faction(g.players[t.owner]) === 'crew' && t.isMain) {
      st.ffPlayer++
      if (st.ffLog.length < 6) st.ffLog.push(`${Math.round(g.time)}s P ${src.def.id}->${t.def.id} ${Math.round(amount)}`)
      if (st.ffPlayerT < 0) st.ffPlayerT = Math.round(g.time)
    }
    if (t.owner === -1 && (t.def.ai === 'crew' || t.def.ai === 'drone')) {
      st.ffNpc++
      if (st.ffLog.length < 6) st.ffLog.push(`${Math.round(g.time)}s N ${src.def.id}->${t.def.id} ${Math.round(amount)}`)
      if (st.ffNpcT < 0) st.ffNpcT = Math.round(g.time)
    }
  }
  const kh = (g2: Game, u: Ent, killer: Ent | null) => {
    if (g2 !== g || !u.isMain || u.owner < 0) return
    const p = g.players[u.owner]
    if (!p || p.main !== u.id) return
    const kf = faction(g, killer)
    // 沒有擊殺者：寫出最後一次受傷的種類（站點爆炸、恆星、隕擊、輻射…）與死在哪裡
    const ld = u.data.lastDmg as { env?: string; buff?: string; lethal?: boolean; kind?: string } | undefined
    const where = g.world.zones[u.zone]?.key ?? '?'
    const envWhy = killer ? '' : ':' + (ld?.lethal ? 'boom' : (ld?.env ?? ld?.buff ?? ld?.kind ?? '?')) + '@' + where
    const d: Death = { t: Math.round(g.time), victim: p.name, vf: g.faction(p), killer: kf + (killer ? '/' + killer.def.id : '') + envWhy }
    st.deaths.push(d)
    const evil = kf === 'xeno' || kf === 'mutant'
    if (evil && killer!.owner !== u.owner) st.evilKills++
    // 前 7 分鐘、人類方（無辜者）被不是異類的東西殺死（誤傷、NPC、無人機…）
    if (!evil && g.time < 420 && d.vf === 'crew') st.early.push(d)
  }
  DAMAGE_HOOKS.push(dh)
  DEATH_HOOKS.push(kh)
  let infAtWarn = -1
  try {
    const max = 50 * 60 * 20
    for (let i = 0; i < max && !g.ended; i++) {
      s.tick()
      const ev = eventsOf(g)
      if (ev.apoc && st.apocAlive < 0) st.apocAlive = g.allPlayers().filter((p) => p.alive).length
      if (ev.apocWarned && infAtWarn < 0) infAtWarn = g.allPlayers().reduce((a, p) => a + p.stats.infections, 0)
    }
  } finally {
    DAMAGE_HOOKS.splice(DAMAGE_HOOKS.indexOf(dh), 1)
    DEATH_HOOKS.splice(DEATH_HOOKS.indexOf(kh), 1)
  }
  st.winner = g.ended ? g.ended.winner + (g.ended.drawWhy ? ':' + g.ended.drawWhy : '') : 'none'
  st.dur = Math.round(g.time / 60)
  st.infections = g.allPlayers().reduce((a, p) => a + p.stats.infections, 0)
  st.infDoom = infAtWarn < 0 ? 0 : st.infections - infAtWarn
  const vz = g.world.zones.find((z) => z.key === 'verdance')
  st.onVerdance = g.allPlayers().filter((p) => p.alive && g.mainOf(p)?.zone === vz?.id).length
  return st
}

describe.skipIf(!process.env.R6S_STATS)('練習局 headless 統計', () => {
  for (const level of LEVELS) {
    it(`${level}：${SEEDS} 局`, () => {
      const out: Stat[] = []
      for (let i = 0; i < SEEDS; i++) {
        const st = runOne(5000 + (SEED0 + i) * 7919, level)
        out.push(st)
        console.log(
          `[${level}] seed ${st.seed} host=${st.host} ${st.winner}@${st.dur}m inf=${st.infections}(doom ${st.infDoom}) evilKills=${st.evilKills} ffP=${st.ffPlayer}@${st.ffPlayerT} ffN=${st.ffNpc}@${st.ffNpcT} apocAlive=${st.apocAlive} verd=${st.onVerdance} early=${JSON.stringify(st.early)} ff=${JSON.stringify(st.ffLog)} deaths=${st.deaths.map((d) => `${d.t}:${d.vf}<-${d.killer}`).join(',')}`,
        )
      }
      const n = out.length
      const win: Record<string, number> = {}
      for (const s of out) win[s.winner] = (win[s.winner] ?? 0) + 1
      const earlyGames = out.filter((s) => s.early.length > 0).length
      const ffPGames = out.filter((s) => s.ffPlayer > 0).length
      const ffNGames = out.filter((s) => s.ffNpc > 0).length
      const quiet = out.filter((s) => s.infections === 0 && s.evilKills === 0).length
      const hc = out.filter((s) => s.host === 'crew')
      const he = out.filter((s) => s.host !== 'crew')
      const won = (l: Stat[], f: (w: string) => boolean) => l.filter((s) => f(s.winner)).length
      console.log(
        `SPLIT [${level}] host=crew ${hc.length} games: crew won ${won(hc, (w) => w === 'crew')} | host=evil ${he.length} games: host side won ${he.filter((s) => s.winner === s.host).length}, crew won ${won(he, (w) => w === 'crew')}`,
      )
      console.log(
        `SUMMARY [${level}] n=${n} winners=${JSON.stringify(win)} early-nonevil-death-games=${earlyGames} ffPlayer-games=${ffPGames} ffNpc-games=${ffNGames} no-evil-action-games=${quiet} avgVerdance=${(out.reduce((a, s) => a + s.onVerdance, 0) / n).toFixed(2)}`,
      )
      expect(n).toBe(SEEDS)
    }, 7_200_000)
  }
})
