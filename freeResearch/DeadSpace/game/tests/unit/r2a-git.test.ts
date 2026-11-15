// 第 2 輪（人類玩家視角審查，sim 端）：抽血回饋
// - 「已經抽過這個人」和「不是可以抽血的對象」分開說，但只依抽血者看得到的樣子：
//   看起來就是已經抽過的那個人（分身、偽裝）照真人回答「已抽過 X」；其他抽不到的回「只能對玩家抽血」
// - 練習「簡單」：真人拿著還沒抽滿的檢測器走到 3 公尺內，看起來是人的 AI 原地停下約 3 秒（每個 AI 至少隔 20 秒）；
//   一般難度、多人房不停
import { describe, expect, it } from 'vitest'
import { Harness, type FakeClient } from './helpers/harness'
import { giveItem, makeItem, dropOnGround } from '../../src/sim/systems/items'
import { SCRIPTS } from '../../src/sim/systems/effects'
import { spawnCreature } from '../../src/sim/ai/creatures'
import { sampleListArgs } from '../../src/shared/sysArgs'
import { unitDef } from '../../src/shared/content/registry'
import { GameServer, LOCAL_PEER } from '../../src/sim/server'
import { encode } from '../../src/shared/protocol/codec'
import { PRACTICE_ROOM, type LobbySettings } from '../../src/shared/protocol/messages'
import { EASY_PAUSE_GAP, EASY_PAUSE_R, EASY_PAUSE_S } from '../../src/sim/ai/bots'
import { lang, sysText } from '../../src/ui/i18n'
import { fmtKey, type Game, type GamePlayer } from '../../src/sim/game'
import '../../src/ui/strings/sim6'
import type { Ent } from '../../src/sim/ent'

const draw = (g: Game, u: Ent, t: Ent) => {
  const slot = u.inv!.findIndex((x) => x?.id === 'geneSampler')
  SCRIPTS.get('git.draw')!(
    g,
    { caster: u, target: t, x: t.x, y: t.y, zone: t.zone, itemSlot: slot } as never,
    {},
  )
}

function chatOf(c: FakeClient): string[] {
  const out: string[] = []
  for (const m of c.inbox) if (m.t === 'chat') for (const l of m.lines) out.push(l.text)
  return out
}

function gitSetup(seed = 3131) {
  const { h } = Harness.started(4, seed, { eventMult: 0 })
  const g = h.server.game!
  const ps = g.allPlayers()
  for (const p of ps) g.setRole(p, 'human')
  const u = g.mainOf(ps[0])!
  u.inv!.fill(null)
  giveItem(g, u, makeItem('geneSampler'))
  const c0 = [...h.clients.values()].find((c) => c.slot === ps[0].slot)!
  /** 抽一次，回傳抽血者收到的 git 訊息 */
  const tryDraw = (t: Ent): string[] => {
    h.ticks(1)
    c0.inbox.length = 0
    draw(g, u, t)
    h.ticks(1)
    return chatOf(c0).filter((l) => l.startsWith('@git.'))
  }
  const names = () =>
    (
      (u.inv!.find((x) => x?.id === 'geneSampler')?.data as { sample?: { names: string[] } } | undefined)
        ?.sample?.names ?? []
    ).slice()
  return { h, g, ps, u, tryDraw, names }
}

const already = (name: string) => fmtKey('git.msg.already', sampleListArgs([name]))

describe('抽血抽不到：已抽過 vs 不是可以抽血的對象', () => {
  it('抽過的人再抽：說「你已經抽過 X 的血」（X 是抽血時看到的名字）；抽過自己再點自己：說抽過自己', () => {
    const { g, ps, u, tryDraw, names } = gitSetup()
    const b = g.mainOf(ps[1])!
    expect(tryDraw(b)).toEqual(['@git.msg.extracted|n=1|max=3'])
    expect(tryDraw(b)).toEqual([already(ps[1].name)])
    expect(tryDraw(u)).toEqual(['@git.msg.extracted|n=2|max=3'])
    expect(tryDraw(u)).toEqual(['@git.msg.alreadySelf'])
    expect(names()).toEqual([ps[1].name, ps[0].name])
    lang.value = 'zh'
    expect(sysText(already(ps[1].name))).toContain('已經抽過')
    expect(sysText(already(ps[1].name))).toContain(ps[1].name.replace(/^\w+\. /, ''))
    lang.value = 'en'
    expect(sysText('@git.msg.alreadySelf')).toContain('your own blood')
    lang.value = 'zh'
  })

  it('明顯不是人的對象（防禦無人機、生物、販賣機、地上的東西、別人的裝置）與 NPC 船員：只能對玩家抽血，不算樣本', () => {
    const { g, ps, u, tryDraw, names } = gitSetup()
    const z = u.zone
    const near = (dx: number) => g.world.zones[z].nav!.nearestOpen(u.x + dx, u.y) ?? { x: u.x + dx, y: u.y }
    const p1 = near(1.5)
    const drone = g.world.spawn(unitDef('npc.defenseDrone'), z, p1.x, p1.y, -1)
    const crew = spawnCreature(g, 'npc.crew', z, p1.x, p1.y, 0)!
    const critter = spawnCreature(g, 'creature.slugling', z, p1.x, p1.y, 0)!
    const item = dropOnGround(g, z, p1.x, p1.y, makeItem('traumaKit'))
    const vendor = [...g.world.ents.values()].find((e) => e.alive && !!e.data.vendor)!
    // 已經抽過 ps[1]，再點 ps[1] 放的東西（擁有者是他，但看起來就不是人）
    expect(tryDraw(g.mainOf(ps[1])!)).toEqual(['@git.msg.extracted|n=1|max=3'])
    const dev = g.world.spawn(unitDef('dev.regenBeacon'), z, p1.x, p1.y, ps[1].slot)
    for (const t of [drone, crew, critter, item, vendor, dev])
      expect(tryDraw(t)).toEqual(['@git.msg.notPerson'])
    expect(names()).toEqual([ps[1].name])
    lang.value = 'zh'
    expect(sysText('@git.msg.notPerson')).toContain('只能對玩家')
    lang.value = 'zh'
  })

  it('看起來就是已經抽過的那個人（偽裝成他的分身，即使分身不算「複製本人」）：照真人回答「已抽過 X」，不會露餡', () => {
    const { g, ps, u, tryDraw } = gitSetup()
    const b = g.mainOf(ps[1])!
    expect(tryDraw(b)).toEqual(['@git.msg.extracted|n=1|max=3'])
    // 一個看起來是 ps[1] 的東西，但不是「複製主單位」的分身（looksLikePerson = false）
    const fake = g.world.spawn(b.def, u.zone, u.x + 1, u.y, ps[2].slot)
    fake.illusion = true
    fake.anon = true
    fake.data.fake = {
      def: b.def.id,
      owner: ps[1].slot,
      name: ps[1].name,
      color: ps[1].color,
      cls: ps[1].classId,
    }
    expect(tryDraw(fake)).toEqual(tryDraw(b))
    expect(tryDraw(fake)).toEqual([already(ps[1].name)])
    // 還沒抽過的人的樣子：真人抽得到，所以這個「抽不到」本來就代表它不是人；改說「只能對玩家抽血」不多透露什麼
    const fake2 = g.world.spawn(b.def, u.zone, u.x + 1, u.y, ps[2].slot)
    fake2.illusion = true
    fake2.anon = true
    fake2.data.fake = {
      def: b.def.id,
      owner: ps[3].slot,
      name: ps[3].name,
      color: ps[3].color,
      cls: ps[3].classId,
    }
    expect(tryDraw(fake2)).toEqual(['@git.msg.notPerson'])
    expect(tryDraw(g.mainOf(ps[3])!)).toEqual(['@git.msg.extracted|n=2|max=3'])
  })
})

// ───────── 簡單練習：AI 停下讓人抽血 ─────────

function join(s: GameServer, peer: string, name: string) {
  s.onJoin(peer)
  const send = (m: Parameters<typeof encode>[0]) => s.onMessage(peer, encode(m))
  send({ t: 'hello', name, color: 0, ver: 1, token: 'tok' + name.padEnd(8, 'x') })
  return send
}

function practice(seed: number, settings: Partial<LobbySettings>, code = PRACTICE_ROOM) {
  const s = new GameServer(code, { send: () => {} }, seed, seed ^ 0x5bd1e995)
  const host = join(s, LOCAL_PEER, 'host')
  host({ t: 'settings', s: { bots: 1, npcCrew: 0, eventMult: 0, ...settings } })
  host({ t: 'start' })
  s.tick()
  const g = s.game!
  const ps = g.allPlayers()
  for (const p of ps) g.setRole(p, 'human')
  const me = ps.find((p) => !p.bot)!
  const bot = ps.find((p) => p.bot)!
  const hu = g.mainOf(me)!
  const bu = g.mainOf(bot)!
  hu.inv!.fill(null)
  giveItem(g, hu, makeItem('geneSampler'))
  hu.data.frozen = true
  // 兩人都放到女帝號的一塊大房間，AI 在主機旁邊 2 公尺
  const nyx = g.world.zones.find((z) => z.key === 'nyx')!
  const room = nyx.layout!.rooms.filter((r) => r.cells >= 60).sort((a, b) => b.cells - a.cells)[0]
  const a = nyx.nav!.nearestOpen(room.cx, room.cy)!
  g.world.relocate(hu, nyx.id, a.x, a.y)
  const b = nyx.nav!.nearestOpen(a.x + 2, a.y)!
  g.world.relocate(bu, nyx.id, b.x, b.y)
  for (const u of [hu, bu]) {
    u.order = null
    u.queue.length = 0
    u.path = null
  }
  const brain = () => bot.data.brain as { pauseUntil: number; pauseNext: number } | undefined
  return { s, g, me, bot, hu, bu, brain }
}

/** 數 AI 在接下來 n 秒內停下幾次（每次停下都會把 pauseUntil 設成新的值）*/
function countPauses(s: GameServer, g: Game, bot: GamePlayer, secs: number, each?: () => void): number {
  let last = (bot.data.brain as { pauseUntil: number } | undefined)?.pauseUntil ?? 0
  let n = 0
  for (let i = 0; i < secs * 20; i++) {
    s.tick()
    const b = bot.data.brain as { pauseUntil: number } | undefined
    if (b && b.pauseUntil > 0 && b.pauseUntil !== last) {
      last = b.pauseUntil
      n++
    }
    each?.()
  }
  void g
  return n
}

describe('練習「簡單」：拿著檢測器的真人走近時 AI 停下讓他抽血', () => {
  it('常數照規格：3 公尺內、停 3 秒、每個 AI 至少隔 20 秒', () => {
    expect([EASY_PAUSE_R, EASY_PAUSE_S, EASY_PAUSE_GAP]).toEqual([3, 3, 20])
  })

  it('簡單：AI 停下約 3 秒（沒有移動命令、位置不變），之後 20 秒內不再停', () => {
    const { s, g, bot, bu, brain } = practice(5101, { aiLevel: 'easy' })
    expect(g.practice).toBe(true)
    // 等 AI 第一次思考（開局 1–3 秒內）
    let started = -1
    for (let i = 0; i < 20 * 5 && started < 0; i++) {
      s.tick()
      if ((brain()?.pauseUntil ?? 0) > g.time) started = g.time
    }
    expect(started).toBeGreaterThan(0)
    const until = brain()!.pauseUntil
    expect(until - started).toBeCloseTo(EASY_PAUSE_S, 1)
    const x0 = bu.x
    const y0 = bu.y
    while (g.time < until - 0.1) {
      s.tick()
      expect(bu.order).toBe(null)
      expect(Math.hypot(bu.x - x0, bu.y - y0)).toBeLessThan(0.05)
    }
    // AI 一直待在主機旁邊（走開就拉回來）：停下的時間點起算 20 秒內不會再停，過了就會再停
    const keepNear = () => {
      if (Math.hypot(bu.x - x0, bu.y - y0) > 0.5) g.world.relocate(bu, bu.zone, x0, y0)
    }
    const gap = EASY_PAUSE_GAP - (g.time - started) - 0.5
    expect(countPauses(s, g, bot, gap, keepNear)).toBe(0)
    expect(countPauses(s, g, bot, 3, keepNear)).toBe(1)
  })

  it('已經被這支檢測器抽過的 AI 不停；主機沒有檢測器也不停', () => {
    const a = practice(5102, { aiLevel: 'easy' })
    const it = a.hu.inv!.find((x) => x?.id === 'geneSampler')!
    it.data = { sample: { slots: [a.bot.slot], keys: ['p' + a.bot.slot], names: [a.bot.name], r: 1 } }
    expect(countPauses(a.s, a.g, a.bot, 8)).toBe(0)
    const b = practice(5103, { aiLevel: 'easy' })
    b.hu.inv!.fill(null)
    expect(countPauses(b.s, b.g, b.bot, 8)).toBe(0)
  })

  it('一般難度、多人房（設定成 easy 也一樣）：不停', () => {
    const n = practice(5104, { aiLevel: 'normal' })
    expect(countPauses(n.s, n.g, n.bot, 8)).toBe(0)
    const m = practice(5105, { aiLevel: 'easy' }, 'TEST9')
    expect(m.g.practice).toBe(false)
    expect(countPauses(m.s, m.g, m.bot, 8)).toBe(0)
  })
})
