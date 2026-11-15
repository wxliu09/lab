// 練習難度（LobbySettings.aiLevel：'easy' | 'normal'，預設 'normal' = 原本的行為）：
// 設定驗證與開局套用；easy 的 AI 船員驗血較慢、不公開指認、看到玩家的怪物形態不主動開火；AI 異類偽裝更久才動手
import { describe, expect, it } from 'vitest'
import { Harness } from './helpers/harness'
import { GameServer, LOCAL_PEER } from '../../src/sim/server'
import { encode } from '../../src/shared/protocol/codec'
import { DEFAULT_SETTINGS, PRACTICE_ROOM } from '../../src/shared/protocol/messages'
import { validateClientMsg } from '../../src/shared/protocol/validate'
import { giveItem, makeItem, morph } from '../../src/sim/systems/items'
import { installXenoSystems } from '../../src/sim/scripts/xeno'
import type { Ent } from '../../src/sim/ent'
import type { Game } from '../../src/sim/game'
import { NORMAL_EVIL_START } from '../../src/sim/ai/bots'

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

function place(g: Game, u: Ent, zone: number, x: number, y: number): void {
  const z = g.world.zones[zone]
  const n = z.nav!.nearestOpen(x, y) ?? { x, y }
  g.world.relocate(u, zone, n.x, n.y)
  u.order = null
  u.queue.length = 0
  u.path = null
}

function openSpot(g: Game, zone: number): { x: number; y: number } {
  const z = g.world.zones[zone]
  const L = z.layout!
  for (let y = 6; y < L.h - 6; y++)
    for (let x = 6; x < L.w - 6; x++) {
      const cx = x + 0.5
      const cy = y + 0.5
      let ok = true
      for (let dy = -5; dy <= 5 && ok; dy++) for (let dx = -5; dx <= 5 && ok; dx++) if (z.nav!.blockedAt(cx + dx, cy + dy)) ok = false
      if (ok) return { x: cx, y: cy }
    }
  throw new Error('找不到空地')
}

/**
 * 不動的真人 humans 位＋一個人類 AI，全部是人類；AI 站在女帝號的一塊空地上，大家背包清空。
 * stations：固定站點組合（不傳＝auto 規則）。時間差對亂數序列敏感的情境傳 []（只放核心站），站點規則改了也不會跟著變
 */
function setup(aiLevel: 'easy' | 'normal', seed = 77, humans = 3, stations?: string[]) {
  const { h, cs } = Harness.started(humans, seed, { bots: 1, eventMult: 0, npcCrew: 0, aiLevel, ...(stations ? { stations } : {}) })
  const g = h.server.game!
  const ps = g.allPlayers()
  for (const p of ps) g.setRole(p, 'human')
  const bot = ps.find((p) => p.bot)!
  const people = ps.filter((p) => !p.bot)
  const u = g.mainOf(bot)!
  const z = g.world.zones.find((q) => q.key === 'nyx')!
  const spot = openSpot(g, z.id)
  place(g, u, z.id, spot.x, spot.y)
  u.inv!.fill(null)
  for (const p of people) {
    const m = g.mainOf(p)!
    m.inv!.fill(null)
    m.data.frozen = true
  }
  return { h, cs, g, bot, people, u, zone: z.id, spot }
}

describe('練習難度：設定', () => {
  it('預設 normal；validate 只接受 easy／normal；開局後 sim 讀得到', () => {
    expect(DEFAULT_SETTINGS.aiLevel).toBe('normal')
    expect(validateClientMsg({ t: 'settings', s: { aiLevel: 'easy' } })).toEqual({ t: 'settings', s: { aiLevel: 'easy' } })
    expect(validateClientMsg({ t: 'settings', s: { aiLevel: 'normal' } })).toEqual({ t: 'settings', s: { aiLevel: 'normal' } })
    expect(validateClientMsg({ t: 'settings', s: { aiLevel: 'hard' } })).toBeNull()
    expect(validateClientMsg({ t: 'settings', s: { aiLevel: 1 } })).toBeNull()
    for (const lv of [undefined, 'easy'] as const) {
      const srv = new GameServer(PRACTICE_ROOM, { send: () => {} }, 5, 5 ^ 0x5bd1e995)
      srv.onJoin(LOCAL_PEER)
      srv.onMessage(LOCAL_PEER, encode({ t: 'hello', name: 'Me', color: 0, ver: 1, token: 'tokMexxxxxxx' }))
      srv.onMessage(LOCAL_PEER, encode({ t: 'settings', s: { bots: 3, ...(lv ? { aiLevel: lv } : {}) } }))
      srv.onMessage(LOCAL_PEER, encode({ t: 'start', role: 'xeno' }))
      expect(srv.game!.settings.aiLevel).toBe(lv ?? 'normal')
    }
  })
})

describe('練習難度：easy 的 AI 船員', () => {
  it('抽血比較慢：兩次抽血之間停比較久（normal 三份很快抽完）', () => {
    const times: Record<string, number> = {}
    for (const lv of ['normal', 'easy'] as const) {
      const { h, g, people, u, zone, spot } = setup(lv, 91, 3, [])
      place(g, g.mainOf(people[0])!, zone, spot.x + 3, spot.y)
      place(g, g.mainOf(people[1])!, zone, spot.x - 3, spot.y)
      giveItem(g, u, makeItem('geneSampler'))
      let at = -1
      run(h, 20 * 90, () => {
        const it = u.inv!.find((x) => x?.id === 'geneSampler')
        const n = ((it?.data as { sample?: { names: string[] } } | undefined)?.sample?.names ?? []).length
        if (n >= 3 || (!it && at < 0)) at = g.time
        return at >= 0
      })
      times[lv] = at
    }
    expect(times.normal).toBeGreaterThan(0)
    expect(times.easy).toBeGreaterThan(times.normal + 15)
  })

  it('有感染報告、只剩一個嫌疑人：normal 公開指認，easy 只公布結果、不指認', () => {
    for (const lv of ['normal', 'easy'] as const) {
      const { h, g, bot, people } = setup(lv)
      const said: string[] = []
      bot.gitReports.push({ time: Math.round(g.time), names: [bot.name, people[0].name], result: 'infected' })
      for (let i = 0; i < 20 * 3; i++) {
        h.ticks(1)
        for (const m of h.clients.get(LOCAL_PEER)!.inbox) if (m.t === 'chat') for (const l of m.lines) if (l.from === bot.name) said.push(l.text.split('|')[0])
        h.clients.get(LOCAL_PEER)!.inbox.length = 0
      }
      expect(said).toEqual(lv === 'normal' ? ['@play1.bot.gitInfected', '@play1.bot.accuse'] : ['@play1.bot.gitInfected'])
    }
  })

  it('看到玩家的怪物形態：normal 主動開火，easy 不主動開火（躲開），被打才還手', () => {
    for (const lv of ['normal', 'easy'] as const) {
      const { h, g, bot, people, u, zone, spot } = setup(lv, 4242)
      installXenoSystems(g)
      const xp = people[1]
      g.setRole(xp, 'xeno')
      const x = g.mainOf(xp)!
      morph(g, x, 'xeno.protoform')
      x.anon = true
      x.maxHp = x.hp = 1e6
      x.data.noRegen = true
      x.acquire = false
      place(g, x, zone, spot.x + 4, spot.y)
      let attacked = false
      run(h, 20 * 10, () => {
        if (u.order?.k === 'attack' && u.order.e === x.id) attacked = true
        return attacked
      })
      expect([lv, attacked]).toEqual([lv, lv === 'normal'])
      if (lv === 'easy') {
        // 被那隻怪物打了：還手
        g.world.relocate(x, zone, u.x + 1.5, u.y)
        x.data.frozen = true
        u.lastHitBy = x.id
        u.lastDamageTime = g.time
        run(h, 20 * 3, () => {
          if (u.order?.k === 'attack' && u.order.e === x.id) attacked = true
          return attacked
        })
        expect(attacked).toBe(true)
      }
      void bot
    }
  })
})

describe('練習難度：AI 異類的開局寬限期', () => {
  it('落單的人就在眼前：normal 開局 120 秒後才動手，easy 要過 420 秒才動手', () => {
    const first: Record<string, number> = {}
    for (const lv of ['normal', 'easy'] as const) {
      const { h, g, bot, people, u, zone, spot } = setup(lv, 3030, 2, [])
      installXenoSystems(g)
      // 改成異形（和調整工具一樣補上變身技能）
      g.setRole(bot, 'xeno')
      u.data.extraAbilities = [...((u.data.extraAbilities as string[]) ?? []), 'xeno.form']
      morph(g, u, u.def.id)
      const m = g.mainOf(people[0])!
      place(g, m, zone, spot.x + 3, spot.y)
      // 另一位真人移到別的站（眼前只有一個落單的人）
      const other = g.world.zones.find((z) => z.alive && z.station && z.id !== zone && !z.data.ship && z.layout?.spawns.length)!
      place(g, g.mainOf(people[1])!, other.id, other.layout!.spawns[0].x, other.layout!.spawns[0].y)
      let at = -1
      const struck = () => {
        const c = u.cast?.ability ?? (u.order?.k === 'cast' ? u.order.a : '')
        const self = g.mainOf(bot)!
        if (at < 0 && (c?.startsWith('xeno.') || !self.tags.has('personnel'))) at = g.time
        return at >= 0
      }
      // normal：寬限期內都不動手；寬限期一過，把落單的人再放到牠身邊（AI 可能已經閒晃走了），很快就動手
      if (lv === 'normal') {
        run(h, 20 * (NORMAL_EVIL_START - 1), struck)
        if (at < 0) place(g, m, zone, u.x + 3, u.y)
        run(h, 20 * 60, struck)
      } else run(h, 20 * 60 * 7.5, struck)
      first[lv] = at
    }
    // normal：寬限期 120 秒（NORMAL_EVIL_START）一過就動手
    expect(NORMAL_EVIL_START).toBe(120)
    expect(first.normal).toBeGreaterThanOrEqual(120)
    expect(first.normal).toBeLessThan(180)
    // easy：開局 7 分鐘內都不動手（之後走開了沒遇到也算）
    expect(first.easy < 0 || first.easy >= 420).toBe(true)
  }, 120000)

  it('normal 寬限期內被打照樣還手：人形異形被打就變身', () => {
    const { h, g, bot, people, u, zone, spot } = setup('normal', 3131, 2)
    installXenoSystems(g)
    g.setRole(bot, 'xeno')
    u.data.extraAbilities = [...((u.data.extraAbilities as string[]) ?? []), 'xeno.form']
    morph(g, u, u.def.id)
    const m = g.mainOf(people[0])!
    place(g, m, zone, spot.x + 2, spot.y)
    // 先確定沒被打時不動手
    let shifted = false
    run(h, 20 * 20, () => {
      shifted = !g.mainOf(bot)!.tags.has('personnel') || (u.cast?.ability ?? '').startsWith('xeno.')
      return shifted
    })
    expect(g.time).toBeLessThan(NORMAL_EVIL_START)
    expect(shifted).toBe(false)
    // 被打：變身還手
    u.lastHitBy = m.id
    u.lastDamageTime = g.time
    run(h, 20 * 4, () => {
      shifted = !g.mainOf(bot)!.tags.has('personnel') || (u.cast?.ability ?? '').startsWith('xeno.form')
      return shifted
    })
    expect(g.time).toBeLessThan(NORMAL_EVIL_START)
    expect(shifted).toBe(true)
  })
})
