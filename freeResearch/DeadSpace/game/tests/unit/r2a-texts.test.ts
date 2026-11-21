// 第 2 輪（人類玩家視角審查，sim 端）：末日指引與用詞
// - 指引要和實際機制一致：翠原星地表是避難處，但翠原星挨打（無人機群、小行星、子艦隊、末日被拉近恆星）時地表會落隕石
//   （紅色警戒圈、留下輻射區），降落的豪勇號每次隕擊都會受重創；不再說「行星打不垮」「建議立刻升空」
// - 末日期間豪勇號挨隕擊的公告改成「別升空、從降落傳送門撤到地表」
// - zh 玩家看得到的字串一律叫「救生艙」
import { describe, expect, it } from 'vitest'
import { Harness, type FakeClient } from './helpers/harness'
import { damage } from '../../src/sim/systems/damage'
import { SCRIPTS } from '../../src/sim/systems/effects'
import { eventsOf } from '../../src/sim/systems/events'
import { stationsOf } from '../../src/sim/systems/stations'
import { EVENT_EN, EVENT_ZH } from '../../src/ui/strings/events'
import { UX3_EN, UX3_ZH } from '../../src/ui/strings/ux3'
import { SIM3_EN, SIM3_ZH } from '../../src/ui/strings/sim3'
import { SIM6_EN, SIM6_ZH } from '../../src/ui/strings/sim6'
import * as gameStr from '../../src/ui/strings/game'
import * as codexStr from '../../src/ui/strings/codex'
import type { Game } from '../../src/sim/game'

function chatOf(c: FakeClient): string[] {
  const out: string[] = []
  for (const m of c.inbox) if (m.t === 'chat') for (const l of m.lines) out.push(l.text)
  return out
}

/** 字串表模組裡所有 Record<string,string> 的值 */
function tables(mod: Record<string, unknown>): Record<string, string>[] {
  return Object.values(mod).filter(
    (v): v is Record<string, string> => !!v && typeof v === 'object' && !Array.isArray(v),
  )
}

describe('末日與翠原星的指引一致', () => {
  it('無人機群、小行星、子艦隊、軌道失效：都提到地表會落隕石（紅色警戒圈、輻射區），不再說「行星打不垮」', () => {
    for (const k of ['event.wasps', 'event.asteroids', 'apoc.fleet', 'apoc.orbit']) {
      expect(EVENT_ZH[k]).toContain('翠原星地表')
      expect(EVENT_ZH[k]).toContain('隕石')
      expect(EVENT_ZH[k]).toContain('紅色警戒圈')
      expect(EVENT_ZH[k]).toContain('輻射區')
      expect(EVENT_EN[k]).toContain('red warning circle')
      expect(EVENT_EN[k]).toContain('fallout zone')
      expect(EVENT_ZH[k]).not.toContain('打不垮')
      expect(EVENT_EN[k]).not.toContain('cannot bring it down')
    }
    // 第 6 輪：全場公告改成精簡版（發生什麼、怎麼做、剩多少時間），豪勇號挨隕擊的細節交給挨隕擊時的公告（st.bravadoImpact*，下一個測試）
    for (const k of ['event.wasps', 'event.asteroids', 'apoc.fleet', 'apoc.orbit']) {
      expect([k, EVENT_ZH[k].length <= 100]).toEqual([k, true])
      expect([k, EVENT_EN[k].length <= 280]).toEqual([k, true])
    }
    // 大公告只顯示標題句：標題本身很短，對策在全文（聊天紀錄）
    expect(UX3_ZH['apoc.orbit.title']).toContain('翠原星地表')
    expect(UX3_EN['apoc.orbit.title']).toContain('Verdance')
  })

  it('豪勇號挨隕擊的公告：平常是「升空或撤到地表」，末日期間是「別升空、撤到地表」；不再說「建議立刻升空」', () => {
    expect(SIM3_ZH['st.bravadoImpact']).not.toContain('建議立刻升空')
    expect(SIM3_ZH['st.bravadoImpact']).toContain('傳送門')
    expect(SIM6_ZH['st.bravadoImpactDoom']).toContain('別升空')
    expect(SIM6_ZH['st.bravadoImpactDoom']).toContain('傳送門')
    expect(SIM6_EN['st.bravadoImpactDoom.one']).toContain('one more impact')
    expect(SIM3_EN['st.bravadoImpact']).not.toContain('Lift off now')
  })

  it('變長的全場公告都有短標題句（大公告只顯示標題；中文 ≤ 22 字、英文 ≤ 56 字）', () => {
    const titles: [Record<string, string>, Record<string, string>, string][] = [
      [SIM6_ZH, SIM6_EN, 'st.bravadoImpact.title'],
      [SIM6_ZH, SIM6_EN, 'st.bravadoImpactDoom.title'],
      [UX3_ZH, UX3_EN, 'apoc.fleetArrive.title'],
    ]
    for (const [zh, en, k] of titles) {
      expect([k, zh[k]?.length > 0 && zh[k].length <= 22]).toEqual([k, true])
      expect([k, en[k]?.length > 0 && en[k].length <= 56]).toEqual([k, true])
    }
  })

  it('實際發生：降落中的豪勇號挨隕擊時，平常發 st.bravadoImpact、末日期間發 st.bravadoImpactDoom', () => {
    const { h } = Harness.started(2, 4321, { eventMult: 0 })
    const g: Game = h.server.game!
    const bz = g.world.zones.find((z) => z.key === 'bravado')!
    const vz = g.world.zones.find((z) => z.key === 'verdance')!
    const b = g.world.get(bz.spaceEnt)!
    const v = g.world.get(vz.spaceEnt)!
    SCRIPTS.get('st.land')!(g, { caster: b, target: v, x: v.x, y: v.y, zone: v.zone } as never, {})
    expect(stationsOf(g).landed).toBeTruthy()
    const host = h.clients.get('local')!
    const hit = (): string[] => {
      host.inbox.length = 0
      damage(g, null, v, 30000, { kind: 'normal', pure: true })
      h.ticks(20 * 11)
      return chatOf(host).filter((l) => l.startsWith('@st.bravadoImpact'))
    }
    expect(hit()).toEqual([expect.stringMatching(/^@st\.bravadoImpact\|n=\d+$/)])
    eventsOf(g).apoc = 'orbit'
    expect(hit()).toEqual([expect.stringMatching(/^@st\.bravadoImpactDoom\|n=\d+$/)])
  })
})

describe('用詞：救生艙', () => {
  it('zh 玩家看得到的字串（game.ts、codex.ts、events.ts、ux3.ts、sim3／sim6）不再出現「逃生艙」', () => {
    const zh: Record<string, string>[] = [
      EVENT_ZH,
      UX3_ZH,
      SIM3_ZH,
      SIM6_ZH,
      ...tables(gameStr),
      ...tables(codexStr),
    ]
    const hits: string[] = []
    for (const t of zh) for (const [k, v] of Object.entries(t)) if (v.includes('逃生艙')) hits.push(k)
    expect(hits).toEqual([])
  })
})
