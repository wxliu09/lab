// 死因說明：死者本人收到「被誰／被什麼打死」，而且只能用死者當時看得到的樣子描述（偽裝、匿名、看不見）
import { describe, expect, it } from 'vitest'
import { Harness, type FakeClient } from './helpers/harness'
import { checkMessages } from './helpers/leak'
import { morph } from '../../src/sim/systems/items'
import { damage } from '../../src/sim/systems/damage'
import { applyBuff } from '../../src/sim/systems/buffs'
import { describeView, type HitView } from '../../src/sim/systems/death'
import { entView } from '../../src/sim/systems/snapshot'
import { BUFFS, UNITS } from '../../src/shared/content/registry'
import { hasString, lang, sysText } from '../../src/ui/i18n'
import type { Game, GamePlayer } from '../../src/sim/game'
import type { Ent } from '../../src/sim/ent'

function standAt(g: Game, u: Ent, zid: number, x: number, y: number): void {
  const z = g.world.zones[zid]
  const n = z.nav ? (z.nav.nearestOpen(x, y) ?? { x, y }) : { x, y }
  g.world.relocate(u, zid, n.x, n.y)
  u.order = null
  u.queue.length = 0
  u.path = null
  u.acquire = false
}

/** 三人局：ps[0] 異形、ps[1] 人類 Bob、ps[2] 人類（受害者）；異形與受害者站在一起 */
function setup(seed = 31337) {
  const { h, cs } = Harness.started(3, seed, { eventMult: 0 })
  const g = h.server.game!
  const ps = g.allPlayers()
  g.setRole(ps[0], 'xeno')
  g.setRole(ps[1], 'human')
  g.setRole(ps[2], 'human')
  const victim = g.mainOf(ps[2])!
  const bob = g.mainOf(ps[1])!
  const x = g.mainOf(ps[0])!
  for (const u of [victim, bob, x]) u.acquire = false
  // 拿掉開局道具（重症維生系統會擋下致命傷）
  victim.inv?.fill(null)
  victim.suit = null
  victim.statsDirty = true
  standAt(g, x, victim.zone, victim.x + 1.2, victim.y)
  h.ticks(2)
  // 搬位置之前送出的快照不算（洩漏比對用的是目前位置）
  for (const r of h.raw.values()) r.length = 0
  return { h, cs, g, ps, victim, bob, x }
}

/** 把異形主單位變成匿名的異形形態（沒有偽裝）*/
function toXenoForm(g: Game, x: Ent): void {
  morph(g, x, 'xeno.protoform')
  x.anon = true
  x.name = ''
  x.color = -1
  x.classId = ''
  x.acquire = false
  // 與真正的變身一樣換新 id，client 端看起來是另一個單位
  g.reassignId(x)
}

/** 偽裝成某人（與千面化身相同的 fake 欄位，也一樣換新 id）*/
function disguiseAs(g: Game, x: Ent, of: Ent): void {
  x.anon = true
  x.data.fake = { def: of.def.id, owner: of.owner, name: of.name, color: of.color, cls: of.classId }
  g.reassignId(x)
}

function clientOf(cs: FakeClient[], p: GamePlayer): FakeClient {
  return cs.find((c) => c.slot === p.slot)!
}

/** 某位 client 收到的死因相關私人訊息（原始 @key|k=v）*/
function deathLines(c: FakeClient): string[] {
  const out: string[] = []
  for (const m of c.inbox) if (m.t === 'chat') for (const l of m.lines) if (/^@death\.(cause|hit)\./.test(l.text)) out.push(l.text)
  return out
}

function scanLeaks(h: Harness): string[] {
  const g = h.server.game!
  const out: string[] = []
  for (const [peer, raws] of h.raw) {
    const slot = h.server.slotOfPeer(peer)
    if (slot === null) continue
    out.push(...checkMessages(g, slot, raws))
    raws.length = 0
  }
  return out
}

describe('死因說明', () => {
  it('偽裝成 Bob 的異形殺了人：死者看到的是 Bob 的名字，不是異形', () => {
    const { h, cs, g, ps, victim, bob, x } = setup()
    toXenoForm(g, x)
    disguiseAs(g, x, bob)
    h.ticks(2)
    expect(ps[2].view.visible.has(x.id)).toBe(true)
    damage(g, x, victim, 1e6, { pure: true })
    h.ticks(2)
    expect(ps[2].alive).toBe(false)
    const lines = deathLines(clientOf(cs, ps[2]))
    expect(lines[0]).toBe(`@death.cause.named|n=${bob.name}`)
    const all = lines.join('\n')
    // 不能出現異形的真名、玩家名，也不能出現異形形態的外觀
    expect(all).not.toContain(ps[0].name)
    expect(all).not.toContain(ps[0].baseName)
    expect(all).not.toContain(UNITS.get('xeno.protoform')!.name.zh)
    expect(all).not.toContain('anon')
    // 其他人收不到死者的死因
    expect(deathLines(clientOf(cs, ps[0]))).toEqual([])
    expect(deathLines(clientOf(cs, ps[1]))).toEqual([])
    expect(scanLeaks(h)).toEqual([])
  })

  it('匿名的異形形態殺了人：只說是匿名的哪種形態，不帶名字或擁有者', () => {
    const { h, cs, g, ps, victim, x } = setup(424242)
    toXenoForm(g, x)
    h.ticks(2)
    damage(g, x, victim, 1e6, { pure: true })
    h.ticks(2)
    const lines = deathLines(clientOf(cs, ps[2]))
    const nm = UNITS.get('xeno.protoform')!.name
    expect(lines[0]).toBe(`@death.cause.anon|uz=${nm.zh}|ue=${nm.en}`)
    expect(lines.join('\n')).not.toContain(ps[0].baseName)
    expect(scanLeaks(h)).toEqual([])
  })

  it('同一隻異形先以匿名形態、再以偽裝的樣子出手：兩種外觀分開列，不會被併在一起', () => {
    const { h, cs, g, ps, victim, bob, x } = setup(777)
    toXenoForm(g, x)
    h.ticks(2)
    damage(g, x, victim, 40, { pure: true })
    h.ticks(2)
    disguiseAs(g, x, bob)
    h.ticks(2)
    damage(g, x, victim, 1e6, { pure: true })
    h.ticks(2)
    const lines = deathLines(clientOf(cs, ps[2]))
    const nm = UNITS.get('xeno.protoform')!.name
    expect(lines).toEqual([`@death.cause.named|n=${bob.name}`, `@death.hit.anon|uz=${nm.zh}|ue=${nm.en}|dmg=40`])
    expect(scanLeaks(h)).toEqual([])
  })

  it('死者當時看不見的攻擊者：只說「看不見的攻擊者」', () => {
    const { h, cs, g, ps, victim, x } = setup(9001)
    // 隱形的攻擊者：就站在旁邊，但死者看不見
    applyBuff(g, x, 'bf.butlerHide', 30, null)
    h.ticks(2)
    expect(x.stats.stealth).toBe(true)
    expect(ps[2].view.visible.has(x.id)).toBe(false)
    damage(g, x, victim, 1e6, { pure: true })
    h.ticks(2)
    expect(deathLines(clientOf(cs, ps[2]))[0]).toBe('@death.cause.unseen')
    expect(scanLeaks(h)).toEqual([])
  })

  it('持續傷害致死：說明是哪一種狀態', () => {
    const { h, cs, g, ps, victim } = setup(5150)
    victim.hp = 3
    applyBuff(g, victim, 'bf.acid.corrode', 16, null)
    h.ticks(40)
    expect(ps[2].alive).toBe(false)
    const nm = BUFFS.get('bf.acid.corrode')!.name
    expect(deathLines(clientOf(cs, ps[2]))[0]).toBe(`@death.cause.dot|uz=${nm.zh}|ue=${nm.en}`)
  })

  it('所在的站被摧毀：被站點爆炸波及', () => {
    const { h, cs, g, ps, victim } = setup(2024)
    const key = g.world.zones[victim.zone].key
    expect(g.destroyStation!(key)).toBe(true)
    h.ticks(2)
    expect(ps[2].alive).toBe(false)
    expect(deathLines(clientOf(cs, ps[2]))[0]).toBe('@death.cause.boom')
  })

  it('描述只依觀看者看到的外觀：對同陣營（認得匿名者）與對人類，描述不同', () => {
    const { g, ps, x } = setup(606)
    toXenoForm(g, x)
    // 人類看到的是匿名形態
    expect(describeView(g, entView(g, ps[2], x)).k).toBe('anon')
    // 異形自己的陣營認得它：知道是誰的形態
    g.setRole(ps[1], 'xeno')
    ps[1].spawnOf = 'xeno'
    expect(describeView(g, entView(g, ps[1], x))).toEqual({ k: 'owned', n: ps[0].baseName, d: 'xeno.protoform' })
  })

  it('每一種死因與先前傷害的訊息都有 zh-TW 與 en，翻譯後不留未代入的參數', () => {
    const kinds: HitView['k'][] = ['named', 'namedAs', 'owned', 'anon', 'unit', 'unseen', 'dot', 'boom', 'fire', 'blast', 'env', 'self', 'shutdown', 'purged', 'unknown']
    const hitKinds = kinds.filter((k) => k !== 'shutdown' && k !== 'purged')
    for (const l of ['zh', 'en'] as const) {
      lang.value = l
      for (const k of kinds) {
        expect(hasString(l, 'death.cause.' + k)).toBe(true)
        expect(sysText(`@death.cause.${k}|n=Bob|uz=形態|ue=Form`)).not.toMatch(/\{\w+\}/)
      }
      for (const k of hitKinds) {
        expect(hasString(l, 'death.hit.' + k)).toBe(true)
        expect(sysText(`@death.hit.${k}|n=Bob|uz=形態|ue=Form|dmg=12`)).not.toMatch(/\{\w+\}/)
      }
    }
    lang.value = 'zh'
  })
})
