// 第 2 輪（人類玩家視角審查，sim 端）：豪勇號開局被困
// - 練習 AI 不開走豪勇號飛行甲板上的最後一艘停泊船
// - 站內監控掃描只掃到施放者自己：私訊怎麼去女帝號（救生艙、停泊的船），每人每站一次
// - 救生艙抵達時私訊乘客「救生艙已抵達 {站名}」
import { describe, expect, it } from 'vitest'
import { Harness, type FakeClient } from './helpers/harness'
import { giveItem, makeItem } from '../../src/sim/systems/items'
import { spaceOf } from '../../src/sim/systems/space'
import { SCRIPTS } from '../../src/sim/systems/effects'
import { INSTANT_ITEMS } from '../../src/sim/systems/vendors'
import { SPACE_ZONE, type Zone } from '../../src/sim/world'
import { STATION_BY_ID } from '../../src/shared/content/stations/index'
import { lang, sysText } from '../../src/ui/i18n'
import '../../src/ui/strings/sim6'
import type { Ent } from '../../src/sim/ent'
import type { Game, GamePlayer } from '../../src/sim/game'

/** 不保留訊息（長時間模擬時省記憶體）；each 回傳 true 就提早結束 */
function run(h: Harness, n: number, each?: () => boolean | void): void {
  for (let i = 0; i < n; i++) {
    h.ticks(1)
    for (const r of h.raw.values()) r.length = 0
    for (const c of h.clients.values()) {
      c.snaps.length = 0
      c.inbox.length = 0
    }
    if (each?.()) return
  }
}

const zone = (g: Game, key: string): Zone => g.world.zones.find((z) => z.key === key)!

function place(g: Game, u: Ent, zid: number, x: number, y: number): void {
  const z = g.world.zones[zid]
  const n = z.nav!.nearestOpen(x, y) ?? { x, y }
  g.world.relocate(u, zid, n.x, n.y)
  u.order = null
  u.queue.length = 0
  u.path = null
}

function chatOf(c: FakeClient): string[] {
  const out: string[] = []
  for (const m of c.inbox) if (m.t === 'chat') for (const l of m.lines) out.push(l.text)
  return out
}

const clientOf = (h: Harness, p: GamePlayer): FakeClient =>
  [...h.clients.values()].find((c) => c.slot === p.slot)!

const argsOf = (line: string): Record<string, string> =>
  Object.fromEntries(
    line
      .split('|')
      .slice(1)
      .map((kv) => kv.split('=')),
  )

const brain = (p: GamePlayer) => p.data.brain as { trip: { ship: string } | null; trips: number }

/** 主機（不動）在女帝號；一個拿著檢測器的人類 AI 在豪勇號的飛行甲板上，豪勇號沒有別人 */
function bravadoSetup(seed: number) {
  const { h } = Harness.started(1, seed, { bots: 1, eventMult: 0, npcCrew: 0 })
  const g = h.server.game!
  const ps = g.allPlayers()
  for (const p of ps) g.setRole(p, 'human')
  const bot = ps.find((p) => p.bot)!
  const host = ps.find((p) => !p.bot)!
  const nyx = zone(g, 'nyx')
  const bravado = zone(g, 'bravado')
  const hm = g.mainOf(host)!
  place(g, hm, nyx.id, nyx.layout!.spawns[0].x, nyx.layout!.spawns[0].y)
  hm.data.frozen = true
  const ships = [...spaceOf(g).ships.values()].filter((s) => s.docked?.zone === bravado.id && !s.hidden)
  expect(ships.length).toBe(2)
  const u = g.mainOf(bot)!
  const de = g.world.get(ships[0].dockedEnt)!
  place(g, u, bravado.id, de.x, de.y - de.radius - 3)
  u.inv!.fill(null)
  u.suit = null
  giveItem(g, u, makeItem('geneSampler'))
  return { h, g, bot, host, bravado, ships }
}

describe('練習 AI 不開走豪勇號的最後一艘停泊船', () => {
  it('豪勇號只剩一艘船：AI 找不到人也不開它換站，船一直停在飛行甲板', () => {
    const { h, g, bot, bravado, ships } = bravadoSetup(61)
    // 只留一艘（另一艘當作已經被開走）
    ships[1].hidden = true
    let tripped = false
    run(h, 20 * 200, () => {
      if (brain(bot).trip) tripped = true
      return tripped
    })
    expect(tripped).toBe(false)
    expect(brain(bot).trips).toBe(0)
    expect(ships[0].docked?.zone).toBe(bravado.id)
    expect(ships[0].launching).toBe(false)
    // AI 還在豪勇號（沒有搭別的東西離開）
    expect(g.mainOf(bot)!.zone).toBe(bravado.id)
  }, 120000)

  it('對照：豪勇號有兩艘船時照常開一艘去換站，飛行甲板上留下另一艘', () => {
    const { h, g, bot, bravado, ships } = bravadoSetup(61)
    let taken = ''
    run(h, 20 * 240, () => {
      const t = brain(bot).trip
      if (t && !taken) taken = t.ship
      return !!taken
    })
    expect(taken).not.toBe('')
    // 等它發射離開
    run(h, 20 * 40)
    expect(spaceOf(g).ships.get(taken)!.docked?.zone).not.toBe(bravado.id)
    const left = ships.filter((s) => s.key !== taken)
    expect(left.length).toBe(1)
    expect(left[0].docked?.zone).toBe(bravado.id)
  }, 120000)
})

/** 主機一個人在某站（其他人都搬去別的站），以他的名義施放該站的監控掃描 */
function sweepAlone(seed: number, key: string, n = 3) {
  const { h } = Harness.started(n, seed, { eventMult: 0 })
  const g = h.server.game!
  const ps = g.allPlayers()
  const z = zone(g, key)
  const away = zone(g, key === 'nyx' ? 'bravado' : 'nyx')
  place(g, g.mainOf(ps[0])!, z.id, z.layout!.spawns[0].x, z.layout!.spawns[0].y)
  for (const p of ps.slice(1))
    place(g, g.mainOf(p)!, away.id, away.layout!.spawns[0].x, away.layout!.spawns[0].y)
  h.ticks(2)
  for (const c of h.clients.values()) c.inbox.length = 0
  const st = g.world.get(z.spaceEnt)!
  const sweep = () => {
    st.owner = ps[0].slot
    SCRIPTS.get('space.sweep')!(g, { caster: st, x: st.x, y: st.y, zone: SPACE_ZONE } as never, {})
    h.ticks(1)
    const out = chatOf(clientOf(h, ps[0]))
    for (const c of h.clients.values()) c.inbox.length = 0
    return out
  }
  return { h, g, ps, z, away, sweep }
}

describe('監控掃描只掃到自己：私訊怎麼去女帝號', () => {
  it('獨自在豪勇號：說明女帝號（出生點最多、驗血區有 GIT 檢測儀）與兩條路線（救生艙室的救生艙、飛行甲板的船）；只說一次', () => {
    const { g, ps, sweep } = sweepAlone(71, 'bravado')
    const lines = sweep()
    const alone = lines.filter((l) => l.startsWith('@space.alone'))
    expect(alone.length).toBe(2)
    expect(alone[0].startsWith('@space.alone|')).toBe(true)
    expect(alone[1].startsWith('@space.aloneRoute.both|')).toBe(true)
    const a = argsOf(alone[1])
    const nyx = STATION_BY_ID.get('nyx')!.name
    const brv = STATION_BY_ID.get('bravado')!.name
    expect([a.nz, a.ne]).toEqual([nyx.zh, nyx.en])
    expect([a.sz, a.se]).toEqual([brv.zh, brv.en])
    expect([a.pz, a.pe]).toEqual(['救生艙室', 'Escape Pods'])
    expect([a.hz, a.he]).toEqual(['飛行甲板', 'Flight Deck'])
    // 原本的掃描結果照舊（只有自己一人）
    expect(lines.some((l) => l.startsWith('@space.sweepResult|'))).toBe(true)
    lang.value = 'zh'
    const zh = alone.map(sysText).join('')
    for (const w of ['女帝號', 'GIT 檢測儀', '救生艙室', '救生艙憑證', '設定航線', '飛行甲板', '停靠'])
      expect(zh).toContain(w)
    expect(zh).not.toContain('{')
    lang.value = 'en'
    const en = alone.map(sysText).join('')
    for (const w of ['Empress Nyx', 'Escape Pods', 'Set Trajectory', 'Flight Deck', 'Dock'])
      expect(en).toContain(w)
    expect(en).not.toContain('{')
    lang.value = 'zh'
    // 第二次掃描：不再重複說明
    expect(sweep().filter((l) => l.startsWith('@space.alone'))).toEqual([])
    void g
    void ps
  })

  it('飛行甲板上沒有船時只說救生艙；GIT 檢測儀被毀時不提驗血', () => {
    const { g, z, sweep } = sweepAlone(72, 'bravado')
    for (const s of spaceOf(g).ships.values()) if (s.docked?.zone === z.id) s.hidden = true
    g.data.gitDead = true
    const alone = sweep().filter((l) => l.startsWith('@space.alone'))
    expect(alone.map((l) => l.split('|')[0])).toEqual(['@space.aloneNoGit', '@space.aloneRoute.pod'])
  })

  it('站上還有別人、或人就在女帝號：不說', () => {
    const a = sweepAlone(73, 'bravado')
    const u1 = a.g.mainOf(a.ps[1])!
    place(a.g, u1, a.z.id, a.z.layout!.spawns[1].x, a.z.layout!.spawns[1].y)
    expect(a.sweep().filter((l) => l.startsWith('@space.alone'))).toEqual([])
    const b = sweepAlone(74, 'nyx')
    const lines = b.sweep()
    expect(lines.some((l) => l.startsWith('@space.sweepResult|'))).toBe(true)
    expect(lines.filter((l) => l.startsWith('@space.alone'))).toEqual([])
  })

  it('其他人收不到這段說明（只給施放者）', () => {
    const { h, g, ps, z } = sweepAlone(75, 'bravado')
    const st = g.world.get(z.spaceEnt)!
    st.owner = ps[0].slot
    SCRIPTS.get('space.sweep')!(g, { caster: st, x: st.x, y: st.y, zone: SPACE_ZONE } as never, {})
    h.ticks(1)
    for (const p of ps.slice(1))
      expect(chatOf(clientOf(h, p)).filter((l) => l.startsWith('@space.alone'))).toEqual([])
  })
})

describe('救生艙抵達', () => {
  it('落地時私訊乘客「救生艙已抵達 {站名}」（兩種語言的站名）', () => {
    const { h, g, ps } = sweepAlone(81, 'bravado', 2)
    const p = ps[0]
    const u = g.mainOf(p)!
    expect(INSTANT_ITEMS.get('escapePass')!(g, u, u as never)).toBe(true)
    h.ticks(20 * 5)
    expect(u.zone).toBe(SPACE_ZONE)
    const pod = [...spaceOf(g).pods.entries()].find(([, v]) => v.slot === p.slot)!
    const nyx = zone(g, 'nyx')
    pod[1].target = nyx.id
    const got: string[] = []
    for (let i = 0; i < 20 * 120 && u.zone === SPACE_ZONE; i++) {
      h.ticks(1)
      got.push(...chatOf(clientOf(h, p)))
      for (const c of h.clients.values()) c.inbox.length = 0
    }
    h.ticks(1)
    got.push(...chatOf(clientOf(h, p)))
    expect(u.zone).toBe(nyx.id)
    const line = got.find((l) => l.startsWith('@space.podArrived'))!
    expect(line).toBeTruthy()
    const nm = STATION_BY_ID.get('nyx')!.name
    expect(argsOf(line)).toEqual({ nz: nm.zh, ne: nm.en })
    lang.value = 'zh'
    expect(sysText(line)).toBe('救生艙已抵達女帝號。')
    lang.value = 'en'
    expect(sysText(line)).toBe('Your escape pod has arrived at Empress Nyx.')
    lang.value = 'zh'
  }, 60000)
})
