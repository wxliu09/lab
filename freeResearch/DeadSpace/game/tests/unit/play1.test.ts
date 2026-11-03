// 第 1 輪「新手體驗與玩法」修正：停泊的船（明確指令才登船、路過不會被吸進去、AI 不會卡在船艙）、
// 有人駕駛的站點自動迎擊敵對單位（不打中立與其他玩家）、練習 AI 的防護服習慣、AI 公布驗血結果、
// 研究員的博士專長只送給本人、進化選單的原因
import { describe, expect, it } from 'vitest'
import { Harness } from './helpers/harness'
import { checkMessages } from './helpers/leak'
import { decode } from '../../src/shared/protocol/codec'
import type { HostMsg } from '../../src/shared/protocol/messages'
import { spaceOf } from '../../src/sim/systems/space'
import { spawnCreature } from '../../src/sim/ai/creatures'
import { unitDef } from '../../src/shared/content/registry'
import { NEUTRAL } from '../../src/sim/ent'
import { SPACE_ZONE } from '../../src/sim/world'
import type { Game } from '../../src/sim/game'
import { evolveBlock } from '../../src/ui/hud/evolveWhy'

function zone(g: Game, key: string) {
  return g.world.zones.find((z) => z.key === key)!
}

/** 不保留訊息（長時間模擬時省記憶體）*/
function run(h: Harness, n: number, each?: () => boolean | void): void {
  for (let i = 0; i < n; i++) {
    h.ticks(1)
    for (const r of h.raw.values()) r.length = 0
    for (const c of h.clients.values()) c.inbox.length = 0
    if (each?.()) return
  }
}

describe('停泊的船', () => {
  it('右鍵（互動）停泊的船：從各個方向走過去都會登船', () => {
    for (const [dx, dy] of [
      [-4, -5],
      [0, -6],
      [5, -4],
      [-6, 0],
    ]) {
      const { h, cs } = Harness.started(2, 11, { eventMult: 0 })
      const g = h.server.game!
      const p = g.players[cs[0].slot]
      const u = g.mainOf(p)!
      const nyx = zone(g, 'nyx')
      const inst = [...spaceOf(g).ships.values()].find((s) => s.def.id === 'kestrel' && s.docked?.zone === nyx.id)!
      const de = g.world.get(inst.dockedEnt)!
      const n = nyx.nav!.nearestOpen(de.x + dx, de.y + dy)!
      g.world.relocate(u, nyx.id, n.x, n.y)
      h.ticks(2)
      g.handleCommand(p.slot, { k: 'interact', e: de.id })
      run(h, 20 * 15, () => u.zone !== nyx.id)
      expect([dx, dy, g.world.zones[u.zone].key]).toEqual([dx, dy, g.world.zones[inst.zone].key])
    }
  })

  it('只是路過不會登船：從王牌出生點附近走去防護服販賣機、前哨補給、醫療補給', () => {
    const targets: [number, number][] = [
      [72.5, 62.5],
      [57.5, 62.5],
      [30.5, 29.5],
      [76.5, 29.5],
      [50.5, 6.5],
      [38.5, 4.5],
    ]
    const starts: [number, number][] = [
      [88.5, 16.5],
      [84, 12],
      [92, 20],
      [88.5, 24],
    ]
    const boarded: string[] = []
    for (const [sx, sy] of starts) {
      for (const [tx, ty] of targets) {
        const { h, cs } = Harness.started(2, 4242, { eventMult: 0 })
        const g = h.server.game!
        const p = g.players[cs[0].slot]
        const u = g.mainOf(p)!
        const nyx = zone(g, 'nyx')
        const n = nyx.nav!.nearestOpen(sx, sy)!
        g.world.relocate(u, nyx.id, n.x, n.y)
        h.ticks(1)
        g.handleCommand(p.slot, { k: 'move', x: tx, y: ty })
        run(h, 20 * 60, () => u.zone !== nyx.id || Math.hypot(u.x - tx, u.y - ty) < 2.5)
        if (u.zone !== nyx.id) boarded.push(`(${sx},${sy})→(${tx},${ty}) ${g.world.zones[u.zone].key}`)
      }
    }
    expect(boarded).toEqual([])
  })

  it('登船後走到艙門就會下船，回到停機坪旁', () => {
    const { h, cs } = Harness.started(2, 12, { eventMult: 0 })
    const g = h.server.game!
    const p = g.players[cs[0].slot]
    const u = g.mainOf(p)!
    const nyx = zone(g, 'nyx')
    const inst = [...spaceOf(g).ships.values()].find((s) => s.def.id === 'mule' && s.docked?.zone === nyx.id)!
    const de = g.world.get(inst.dockedEnt)!
    g.world.relocate(u, nyx.id, de.x, de.y - de.radius - 1.2)
    h.ticks(2)
    g.handleCommand(p.slot, { k: 'interact', e: de.id })
    run(h, 20 * 5, () => u.zone === inst.zone)
    expect(u.zone).toBe(inst.zone)
    const exit = g.world.zones[inst.zone].layout!.exits[0]
    g.handleCommand(p.slot, { k: 'move', x: exit.x, y: exit.y })
    run(h, 20 * 12, () => u.zone === nyx.id)
    expect(u.zone).toBe(nyx.id)
    expect(Math.hypot(u.x - de.x, u.y - de.y)).toBeLessThan(de.radius + 2)
  })

  it('AI 不會進船艙；被放進船艙的 AI 會自己走回艙門下船', () => {
    const { h } = Harness.started(1, 300, { bots: 5, eventMult: 0, npcCrew: 0 })
    const g = h.server.game!
    const nyx = zone(g, 'nyx')
    const bot = g.allPlayers().find((q) => q.bot && g.mainOf(q)?.zone === nyx.id)!
    const u = g.mainOf(bot)!
    const inst = [...spaceOf(g).ships.values()].find((s) => s.docked?.zone === nyx.id)!
    const cz = g.world.zones[inst.zone]
    const spot = cz.nav!.nearestOpen(cz.layout!.w / 2, cz.layout!.h / 2)!
    g.world.relocate(u, inst.zone, spot.x, spot.y)
    u.data.boardCd = g.time + 8
    run(h, 20 * 30, () => u.zone !== inst.zone)
    expect(u.zone).toBe(nyx.id)
    // 開局 6 分鐘內沒有 AI 留在船艙裡
    let inCabin = 0
    run(h, 20 * 60 * 6, () => {
      if (g.world.tick % 100) return
      for (const q of g.allPlayers()) {
        const m = q.bot && q.alive ? g.mainOf(q) : undefined
        if (m && g.world.zones[m.zone].data.ship) inCabin++
      }
    })
    expect(inCabin).toBe(0)
  }, 120000)
})

describe('有人駕駛的站點自動迎擊', () => {
  /** 找一個沒有王牌飛行員的種子（王牌的戰機停在女帝號旁、中立也會自動開火，會干擾比較）*/
  function startNoAce(): { h: Harness; slots: number[] } {
    for (let seed = 1; seed < 60; seed++) {
      const { h, cs } = Harness.started(2, seed, { eventMult: 0 })
      if (h.server.game!.allPlayers().some((q) => q.classId === 'ace')) continue
      return { h, slots: cs.map((c) => c.slot) }
    }
    throw new Error('找不到沒有王牌的種子')
  }

  function pilotNyx(h: Harness, slot: number) {
    const g = h.server.game!
    const p = g.players[slot]
    const u = g.mainOf(p)!
    const nz = zone(g, 'nyx')
    const con = [...g.world.inZone(nz.id)].find((e) => e.data.poi === 'console')!
    g.world.relocate(u, con.zone, con.x, con.y - 0.6)
    h.ticks(3)
    const st = g.world.get(nz.spaceEnt)!
    expect(p.control).toBe(st.id)
    return st
  }

  it('站上主控台不下指令：女帝號會自動擊落靠近的無人戰機', () => {
    const { h, slots } = startNoAce()
    const g = h.server.game!
    const st = pilotNyx(h, slots[0])
    expect(st.acquire).toBe(true)
    const wasp = spawnCreature(g, 'ship.wasp', SPACE_ZONE, st.x + st.radius + 8, st.y)!
    run(h, 20 * 45, () => !wasp.alive)
    expect(wasp.alive).toBe(false)
  })

  it('沒人駕駛的站不會自動開火；交還控制台後恢復', () => {
    const { h, slots } = startNoAce()
    const g = h.server.game!
    const st = g.world.get(zone(g, 'nyx').spaceEnt)!
    expect(st.acquire).toBe(false)
    const wasp = spawnCreature(g, 'ship.wasp', SPACE_ZONE, st.x + st.radius + 8, st.y)!
    run(h, 20 * 30)
    expect(wasp.alive).toBe(true)
    expect(wasp.hp).toBe(wasp.maxHp)
    // 駕駛後交還：恢復成不自動開火
    pilotNyx(h, slots[0])
    g.handleCommand(slots[0], { k: 'unpilot' })
    h.ticks(2)
    expect(st.owner).toBe(NEUTRAL)
    expect(st.acquire).toBe(false)
  })

  it('有人駕駛也不會自動攻擊中立的船、其他玩家的船', () => {
    const { h, slots } = startNoAce()
    const g = h.server.game!
    const st = pilotNyx(h, slots[0])
    const neutral = g.world.spawn(unitDef('ship.kestrel'), SPACE_ZONE, st.x + st.radius + 5, st.y + 2, NEUTRAL)
    neutral.global = true
    const other = g.world.spawn(unitDef('ship.kestrel'), SPACE_ZONE, st.x + st.radius + 5, st.y - 2, slots[1])
    other.global = true
    other.acquire = false
    run(h, 20 * 20)
    expect(neutral.hp).toBe(neutral.maxHp)
    expect(other.hp).toBe(other.maxHp)
    expect(st.order).toBe(null)
  })
})

describe('練習 AI', () => {
  it('固定種子：開局 3 分鐘時至少有一名人類 AI 沒穿防護服（寄生與朊毒練得到），也有人已經穿上', () => {
    const { h } = Harness.started(1, 2024, { bots: 7, eventMult: 0, npcCrew: 0 })
    const g = h.server.game!
    run(h, 20 * 180)
    const crew = g.allPlayers().filter((q) => q.bot && q.alive && g.faction(q) === 'crew' && !q.spawnOf)
    const suited = crew.filter((q) => !!g.mainOf(q)?.suit)
    const bare = crew.filter((q) => {
      const m = g.mainOf(q)
      return !!m && !m.suit && m.tags.has('personnel')
    })
    expect(bare.length).toBeGreaterThan(0)
    expect(suited.length).toBeGreaterThan(0)
  }, 120000)

  it('驗血有感染：AI 在全體頻道公布名單（i18n 系統 key），只剩一名嫌疑人時公開指認', () => {
    const { h, cs } = Harness.started(1, 77, { bots: 4, eventMult: 0, npcCrew: 0 })
    const g = h.server.game!
    const host = g.players[cs[0].slot]
    const bot = g.allPlayers().find((q) => q.bot && g.faction(q) === 'crew')!
    h.ticks(2)
    cs[0].inbox.length = 0
    bot.gitReports.push({ time: Math.round(g.time), names: [bot.name, host.name], result: 'infected' })
    let lines: { from: string; text: string; ch: string }[] = []
    for (let i = 0; i < 40 && lines.length < 2; i++) {
      h.ticks(1)
      for (const m of cs[0].inbox) if (m.t === 'chat') lines.push(...m.lines.filter((l) => l.from === bot.name))
      cs[0].inbox.length = 0
    }
    lines = lines.filter((l) => l.ch === 'all')
    expect(lines.map((l) => l.text.split('|')[0])).toEqual(['@play1.bot.gitInfected', '@play1.bot.accuse'])
    expect(lines[1].text).toContain('name=' + host.name)
    // 再來一份乾淨的報告：照樣公布
    bot.gitReports.push({ time: Math.round(g.time), names: ['甲', '乙'], result: 'clean' })
    const more: string[] = []
    for (let i = 0; i < 40 && !more.length; i++) {
      h.ticks(1)
      for (const m of cs[0].inbox) if (m.t === 'chat') more.push(...m.lines.filter((l) => l.from === bot.name).map((l) => l.text))
      cs[0].inbox.length = 0
    }
    // 名單兩種語言都送（分隔符號依語言）
    expect(more[0]).toBe('@play1.bot.gitClean|lz=甲、乙|le=甲, 乙')
  })
})

describe('研究員的博士專長', () => {
  it('只在本人的私有狀態送出 phd；其他人的訊息裡沒有', () => {
    for (let seed = 1; seed < 40; seed++) {
      const { h, cs } = Harness.started(8, seed)
      const g = h.server.game!
      const r = g.allPlayers().find((q) => q.classId === 'researcher')
      if (!r) continue
      expect(r.phd).not.toBe('')
      h.ticks(2)
      const rc = cs.find((c) => c.slot === r.slot)!
      expect(rc.me.phd).toBe(r.phd)
      for (const c of cs) {
        if (c.slot === r.slot) continue
        const p = g.players[c.slot]
        if (p.classId !== 'researcher') expect(c.me.phd).toBeUndefined()
        // 其他人收到的訊息：私有狀態只會有自己的 phd，其他地方完全不出現 phd 欄位
        for (const raw of h.raw.get(c.peer) ?? []) {
          const m = decode(raw) as HostMsg
          if (m.t === 'snap' && m.s.me && 'phd' in m.s.me) expect(m.s.me.phd).toBe(p.phd)
          const rest = m.t === 'snap' ? { ...m.s, me: undefined } : m
          expect(JSON.stringify(rest)).not.toContain('"phd"')
        }
        expect(checkMessages(g, c.slot, h.raw.get(c.peer) ?? [])).toEqual([])
      }
      return
    }
    throw new Error('找不到有研究員的種子')
  })
})

describe('進化選單的原因', () => {
  it('死亡、駕駛中、太空中、EP 不足、最終形態、仿生人不在鑄造平台，各自分開說明', () => {
    expect(evolveBlock({ role: 'xeno', alive: false })?.key).toBe('play1.evo.dead')
    expect(evolveBlock({ role: 'xeno', alive: true, unit: 5, control: 9, zone: 0, canEvolve: ['x'] })?.key).toBe('play1.evo.notMain')
    expect(evolveBlock({ role: 'xeno', alive: true, unit: 5, control: 5, zone: 0, canEvolve: ['x'] })?.key).toBe('play1.evo.space')
    expect(evolveBlock({ role: 'mutant', alive: true, unit: 5, control: 5, zone: 0, canEvolve: ['m'] })).toBe(null)
    expect(evolveBlock({ role: 'xeno', alive: true, unit: 5, control: 5, zone: 2, ep: 100, epNext: 660, canEvolve: [] })).toEqual({ key: 'play1.evo.need', args: { n: 560 } })
    expect(evolveBlock({ role: 'xeno', alive: true, unit: 5, control: 5, zone: 2, ep: 2000, epNext: 0, canEvolve: [] })?.key).toBe('play1.evo.max')
    expect(evolveBlock({ role: 'android', alive: true, unit: 5, control: 5, zone: 2, ep: 2000, epNext: 2000, canEvolve: [] })?.key).toBe('play1.evo.forge')
    expect(evolveBlock({ role: 'android', alive: true, unit: 5, control: 5, zone: 2, ep: 2000, epNext: 2000, canEvolve: ['a'] })).toBe(null)
    expect(evolveBlock({ role: 'mutant', alive: true, evolving: 30 })).toBe(null)
  })
})
