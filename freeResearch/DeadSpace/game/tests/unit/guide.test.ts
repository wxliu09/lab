// 遊戲內指引：目標面板內容、情境提示的觸發條件與佇列、提示紀錄、文字完整性
import { describe, expect, it, vi } from 'vitest'
import type { PrivateState } from '../../src/shared/protocol/messages'

// node 沒有 localStorage：放一個記憶體版本（Guide 模組載入時就會讀寫）
const mem = vi.hoisted(() => {
  const m = new Map<string, string>()
  ;(globalThis as unknown as { localStorage: Storage }).localStorage = {
    getItem: (k: string) => (m.has(k) ? m.get(k)! : null),
    setItem: (k: string, v: string) => void m.set(k, String(v)),
    removeItem: (k: string) => void m.delete(k),
    clear: () => m.clear(),
    key: (i: number) => [...m.keys()][i] ?? null,
    get length() {
      return m.size
    },
  } as Storage
  return m
})

// client 端模組會碰 window；指引的純函式只需要它們的 signal
vi.mock('../../src/client/session', async () => {
  const { signal } = await import('@preact/signals')
  const { ClientWorld } = await import('../../src/client/world')
  return { world: new ClientWorld(), snapTick: signal(0), startInfo: signal(null), send: () => {}, sendCmd: () => {} }
})
vi.mock('../../src/client/input', async () => {
  const { signal } = await import('@preact/signals')
  return { typingInField: () => false, chatOpen: signal(false), evolveOpen: signal(false), targetMode: signal(null), selected: signal(0) }
})

const G = await import('../../src/ui/hud/Guide')
const { GUIDE_EN, GUIDE_ZH, HELP_CONTROLS, HELP_THINGS } = await import('../../src/ui/strings/guide')
const { hasString } = await import('../../src/ui/i18n')
type View = Parameters<typeof G.objectiveFor>[0]

function ab(...ids: string[]): PrivateState['abilities'] {
  return ids.map((id) => ({ id, cd: 0, maxCd: 0, mana: 0 }))
}
function inv(...items: (string | null)[]): PrivateState['inv'] {
  return items.map((i) => (i ? { item: i, charges: 0, cd: 0 } : null))
}
function view(me: Partial<PrivateState>, extra: Partial<View> = {}): View {
  return { me: { alive: true, zone: 1, abilities: [], inv: [], ...me }, w: { t: 100, stab: 1 }, near: [], self: { d: 'personnel', hp: 400, mhp: 400 }, ...extra }
}
const keysOf = (v: View) => G.objectiveFor(v)!.steps.map((s) => s.key)
const hintIds = (v: View) => G.detectHints(v).map((h) => h.id)

describe('身分判定', () => {
  it('依自己的私有狀態分成 9 種', () => {
    expect(G.identityOf({})).toBe(null)
    expect(G.identityOf({ role: 'human', alive: true })).toBe('human')
    expect(G.identityOf({ role: 'xeno', alive: true })).toBe('xeno')
    expect(G.identityOf({ role: 'mutant', alive: true })).toBe('mutant')
    expect(G.identityOf({ role: 'android', alive: true })).toBe('android')
    expect(G.identityOf({ role: 'human', alive: true, spawn: true, faction: 'xeno' })).toBe('spawnXeno')
    expect(G.identityOf({ role: 'human', alive: true, spawn: true, faction: 'mutant' })).toBe('spawnMutant')
    expect(G.identityOf({ role: 'android', alive: true, spawn: true, faction: 'mutant' })).toBe('spawnMutant')
    expect(G.identityOf({ role: 'human', alive: false })).toBe('dead')
    expect(G.identityOf({ role: 'android', alive: false })).toBe('deadAndroid')
    expect(G.identityOf({ role: 'spectator', alive: false })).toBe('spectator')
  })
})

describe('目標面板', () => {
  it('人類：沒穿防護服、檢測器還沒上架時顯示倒數與職業', () => {
    const o = G.objectiveFor(view({ role: 'human', classId: 'janitor' }))!
    expect(o.goal).toBe('guide.goal.human')
    expect(o.steps.map((s) => s.key)).toEqual(['guide.s.suitGet', 'guide.s.samplerWait', 'guide.s.attack', 'guide.s.class'])
    expect(o.steps[1].args).toEqual({ t: '5:20' })
    expect(o.steps[3].dim).toBe(true)
    expect(o.ep).toBeUndefined()
  })

  it('人類：背包裡的防護服、檢測器、解析器會換成「按幾號」', () => {
    const me = { role: 'human' as const, classId: 'medic', inv: inv('traumaKit', 'suit.plasma', 'geneSampler') }
    const o = G.objectiveFor(view(me))!
    expect(o.steps[0]).toEqual({ key: 'guide.s.suitWear', args: { k: 2 } })
    expect(o.steps[1]).toEqual({ key: 'guide.s.samplerUse', args: { k: 3 } })
    const r = G.objectiveFor(view({ ...me, inv: inv('gitResolver') }, { self: { d: 'suit.plasma', hp: 1, mhp: 1 } }))!
    // 已經穿著防護服：不再提防護服
    expect(r.steps[0]).toEqual({ key: 'guide.s.resolverUse', args: { k: 1 } })
    expect(r.steps.map((s) => s.key)).not.toContain('guide.s.suitGet')
    // 420 秒後改成去領
    expect(keysOf({ ...view({ role: 'human', classId: 'ceo' }), w: { t: 500 } })).toContain('guide.s.samplerGet')
  })

  it('異形：人形時教褪去人皮，異形形態時列出寄生、產卵、披回人皮的快捷鍵', () => {
    const human = G.objectiveFor(view({ role: 'xeno', tier: 1, ep: 120, epNext: 660, abilities: ab('cls.mend', 'xeno.form') }))!
    expect(human.steps[0]).toEqual({ key: 'guide.s.shed', args: { k: 'W' } })
    expect(human.ep).toEqual({ ep: 120, next: 660, ready: false })
    expect(human.sub).toBe('T1')
    const alien = G.objectiveFor(view({ role: 'xeno', tier: 1, ep: 700, epNext: 660, canEvolve: ['xeno.brute'], abilities: ab('xeno.parasite', 'xeno.egg', 'xeno.human') }))!
    expect(alien.steps.map((s) => [s.key, s.args?.k])).toEqual([
      ['guide.s.evolveXeno', undefined],
      ['guide.s.parasite', 'Q'],
      ['guide.s.egg', 'W'],
      ['guide.s.wear', 'E'],
    ])
    expect(alien.ep?.ready).toBe(true)
    const cocoon = G.objectiveFor(view({ role: 'xeno', evolving: 42, abilities: [] }))!
    expect(cocoon.steps[0]).toEqual({ key: 'guide.s.cocoon', args: { s: 42 } })
  })

  it('變種人：進化前提醒偽裝與吞噬，夠 EP 時提示選路線', () => {
    const o = G.objectiveFor(view({ role: 'mutant', tier: 0, ep: 310, epNext: 300, canEvolve: ['mut.apex', 'mut.sporemother'], abilities: ab('mut.devour') }))!
    expect(o.steps.map((s) => s.key)).toEqual(['guide.s.evolvePath', 'guide.s.hide', 'guide.s.devour', 'guide.s.dmgEp'])
    expect(o.steps[2].args).toEqual({ k: 'Q' })
    const t1 = G.objectiveFor(view({ role: 'mutant', tier: 1, ep: 10, epNext: 900, abilities: ab('ab.mut.sludge', 'mut.devour', 'mut.cannibalize') }))!
    expect(t1.steps.map((s) => s.key)).toEqual(['guide.s.cannibal', 'guide.s.devour', 'guide.s.hunt'])
    expect(t1.steps[0].args).toEqual({ k: 'E' })
  })

  it('仿生人：EP 進度與鑄造台', () => {
    expect(keysOf(view({ role: 'android', classId: 'ace', ep: 100, epNext: 2000 }))).toEqual(['guide.s.helpCrew', 'guide.s.ff', 'guide.s.androidEp', 'guide.s.core'])
    expect(keysOf(view({ role: 'android', ep: 2000, epNext: 2000 }))).toContain('guide.s.androidReady')
    expect(keysOf(view({ role: 'android', ep: 2000, epNext: 2000, canEvolve: ['android.gale'] }))).toContain('guide.s.androidPick')
  })

  it('spawn、死亡、觀戰', () => {
    expect(keysOf(view({ role: 'human', spawn: true, faction: 'xeno', abilities: ab('xeno.parasite', 'xeno.spawnHuman') }))).toEqual(['guide.s.parasite', 'guide.s.dormant', 'guide.s.team', 'guide.s.spawnWin'])
    expect(keysOf(view({ role: 'human', spawn: true, faction: 'mutant', abilities: [] }))).toEqual(['guide.s.team', 'guide.s.spawnWin'])
    expect(keysOf(view({ role: 'human', alive: false }))).toEqual(['guide.s.specPick', 'guide.s.deadChat', 'guide.s.slug', 'guide.s.endReveal'])
    expect(keysOf(view({ role: 'android', alive: false }))).toContain('guide.s.shutdown')
    expect(keysOf(view({ role: 'spectator', alive: false }))).toContain('guide.s.specPick')
    // 死掉的異類不再顯示 EP
    expect(G.objectiveFor(view({ role: 'xeno', alive: false, ep: 10, epNext: 660 }))!.ep).toBeUndefined()
  })

  it('最多 4 條，超過 6 個技能時改說「指令卡按鈕」', () => {
    const many = ab('a1', 'a2', 'a3', 'a4', 'a5', 'a6', 'xeno.form')
    const o = G.objectiveFor(view({ role: 'xeno', abilities: many }))!
    expect(o.steps.length).toBeLessThanOrEqual(4)
    expect(G.abilityKey({ abilities: many }, 'xeno.form')).toBe('')
    expect(G.abilityKey({ abilities: many }, 'nope')).toBe(null)
  })
})

describe('情境提示的觸發條件', () => {
  it('活人開局：基本操作、常用按鍵；死人只看到死亡提示', () => {
    expect(hintIds(view({ role: 'human' }))).toEqual(expect.arrayContaining(['start', 'keys']))
    const dead = hintIds(view({ role: 'human', alive: false }))
    expect(dead).toEqual(['death'])
    expect(hintIds(view({ role: 'android', alive: false }))).toEqual(['deathAndroid'])
    expect(hintIds(view({ role: 'spectator', alive: false }))).toEqual(['spectate'])
  })

  it('背包：第一次拿到道具、防護服、檢測器、解析器、記憶核心', () => {
    const ids = hintIds(view({ role: 'human', inv: inv('suit.cryo', 'geneSampler', 'memoryCore') }))
    expect(ids).toEqual(expect.arrayContaining(['item', 'suit', 'sampler', 'core']))
    const h = G.detectHints(view({ role: 'human', inv: inv(null, 'suit.cryo') })).find((x) => x.id === 'suit')!
    expect(h.args).toEqual({ k: 2 })
    // 已經穿著就不提示穿上
    expect(hintIds(view({ role: 'human', inv: inv('suit.cryo') }, { self: { d: 'suit.plasma', hp: 1, mhp: 1 } }))).not.toContain('suit')
    expect(hintIds(view({ role: 'human', inv: inv('gitResolver') }))).toContain('resolver')
    expect(hintIds(view({ role: 'human', gitReports: [{ time: 1, names: ['a'], result: 'clean' }] }))).toContain('report')
  })

  it('身旁設施：距離內才觸發，救生艙裝置不算一般販賣機', () => {
    const at = (d: string, dist: number) => hintIds(view({ role: 'human' }, { near: [{ d, dist }] }))
    expect(at('vendor.medical', 2)).toContain('vendor')
    expect(at('vendor.medical', 3.5)).not.toContain('vendor')
    expect(at('vendor.escapePod', 2)).toContain('pod')
    expect(at('vendor.escapePod', 2)).not.toContain('vendor')
    expect(at('struct.git', 3)).toContain('git')
    expect(at('struct.console', 2)).toContain('console')
    expect(at('docked.kestrel', 4)).toContain('ship')
    expect(at('struct.droneControl', 1)).toContain('drone')
    expect(at('fac.fabricator', 3)).toContain('fab')
    expect(hintIds(view({ role: 'android' }, { near: [{ d: 'fac.fabricator', dist: 3 }] }))).toContain('fabAndroid')
    // 雜物箱只對會翻找的人提示
    expect(at('struct.rummage', 1)).not.toContain('rummage')
    expect(hintIds(view({ role: 'human', abilities: ab('cls.rummage') }, { near: [{ d: 'struct.rummage', dist: 1 }] }))).toContain('rummage')
  })

  it('身旁的其他單位（玩家、異形形態、spawn）不會觸發任何東西', () => {
    const base = hintIds(view({ role: 'human' }))
    const crowd = ['personnel', 'xeno.protoform', 'xeno.protoform.spawn', 'mut.drone', 'android.gale', 'suit.plasma', 'corpse', 'groundItem']
    expect(hintIds(view({ role: 'human' }, { near: crowd.map((d) => ({ d, dist: 1 })) }))).toEqual(base)
    expect(G.objectiveFor(view({ role: 'human', classId: 'ceo' }, { near: crowd.map((d) => ({ d, dist: 1 })) }))).toEqual(G.objectiveFor(view({ role: 'human', classId: 'ceo' })))
  })

  it('狀態：低血量（暫時性）、太空層、船艙、設施面板、進化、穩定度', () => {
    const low = G.detectHints(view({ role: 'human' }, { self: { d: 'personnel', hp: 100, mhp: 400 } })).find((h) => h.id === 'lowHp')
    expect(low?.transient).toBe(true)
    expect(hintIds(view({ role: 'human', zone: 0 }))).toContain('space')
    expect(hintIds(view({ role: 'human', zone: 5 }, { zoneStation: 'ship:kestrel' }))).toContain('shipInside')
    expect(hintIds(view({ role: 'human', fac: { k: 'power', e: 1, mode: 0, cd: [], off: 0 } }))).toContain('facility')
    expect(hintIds(view({ role: 'xeno', canEvolve: ['xeno.brute'] }))).toContain('evolveXeno')
    expect(hintIds(view({ role: 'mutant', canEvolve: ['mut.apex'] }))).toContain('evolveMutant')
    expect(hintIds(view({ role: 'android', ep: 2000, epNext: 2000 }))).toContain('androidFull')
    expect(hintIds({ ...view({ role: 'human' }), w: { t: 200, stab: 0.4 } })).toEqual(expect.arrayContaining(['stab', 'ally', 'notes']))
  })

  it('身分技能：異形、變種人、仿生人、spawn', () => {
    const shed = G.detectHints(view({ role: 'xeno', abilities: ab('xeno.form') })).find((h) => h.id === 'xenoShed')
    expect(shed?.args).toEqual({ k: 'Q' })
    expect(hintIds(view({ role: 'xeno', abilities: ab('xeno.parasite', 'xeno.egg', 'xeno.human') }))).toContain('xenoAlien')
    expect(hintIds(view({ role: 'mutant', abilities: ab('mut.devour') }))).toContain('mutantDevour')
    expect(hintIds(view({ role: 'android' }))).toContain('androidFf')
    expect(hintIds(view({ role: 'human', spawn: true, faction: 'xeno', abilities: ab('xeno.parasite', 'xeno.spawnHuman') }))).toEqual(expect.arrayContaining(['spawnXeno', 'xenoSpawnForm']))
    expect(hintIds(view({ role: 'human', spawn: true, faction: 'mutant' }))).toContain('spawnMutant')
    // 人類看不到任何異類的提示
    const human = hintIds(view({ role: 'human', abilities: ab('xeno.form', 'mut.devour') }))
    for (const id of ['xenoShed', 'mutantDevour', 'androidFf', 'spawnXeno']) expect(human).not.toContain(id)
  })
})

function memStore(): ReturnType<typeof G.localHintStore> {
  const s = new Set<string>()
  return { has: (id) => s.has(id), add: (id) => void s.add(id), clear: () => s.clear() }
}

describe('提示佇列', () => {
  it('同時最多 2 則、12 秒後消失，接著補下一則；看過的不再出現', () => {
    const st = memStore()
    const q = new G.HintQueue(st)
    for (const [id, pri] of [['c', 3], ['a', 1], ['b', 2]] as const) q.offer({ id, pri })
    q.tick(0.1, false)
    expect(q.active.map((a) => a.id)).toEqual(['a', 'b'])
    q.tick(11, false)
    expect(q.active.length).toBe(2)
    q.tick(1, false)
    expect(q.active.map((a) => a.id)).toEqual(['c'])
    q.tick(12, false)
    expect(q.active).toEqual([])
    // 同一份紀錄的新佇列（重整後）：不會再出現
    const q2 = new G.HintQueue(st)
    expect(q2.offer({ id: 'a', pri: 0 })).toBe(false)
    q2.tick(0.1, false)
    expect(q2.active).toEqual([])
  })

  it('被擋住時暫停；滑鼠停著的不倒數；可以點掉', () => {
    const q = new G.HintQueue(memStore())
    q.offer({ id: 'a', pri: 0 })
    q.tick(5, true)
    expect(q.active).toEqual([])
    q.tick(0.1, false)
    q.tick(30, true)
    expect(q.active.map((a) => a.id)).toEqual(['a'])
    q.tick(30, false, 2, 'a')
    expect(q.active.map((a) => a.id)).toEqual(['a'])
    q.dismiss('a')
    expect(q.active).toEqual([])
    expect(q.offer({ id: 'a', pri: 0 })).toBe(false)
  })

  it('暫時性的提示條件消失就移出佇列；退回佇列的提示之後仍會顯示', () => {
    const q = new G.HintQueue(memStore())
    q.offer({ id: 'x', pri: 0 })
    q.offer({ id: 'y', pri: 1 })
    q.offer({ id: 'low', pri: 2, transient: true })
    q.tick(0.1, false, 2, null, new Set(['x', 'y', 'low']))
    expect(q.active.map((a) => a.id)).toEqual(['x', 'y'])
    q.deferLast()
    expect(q.active.map((a) => a.id)).toEqual(['x'])
    q.tick(0.1, false, 1, null, new Set(['x', 'y']))
    expect(q.queue.map((h) => h.id)).toEqual(['y'])
    q.tick(12, false, 2, null, new Set())
    expect(q.active.map((a) => a.id)).toEqual(['y'])
  })

  it('關閉／重設：clear(true) 之後、紀錄清空時可以再顯示', () => {
    const st = memStore()
    const q = new G.HintQueue(st)
    q.offer({ id: 'a', pri: 0 })
    q.tick(0.1, false)
    q.clear()
    expect(q.offer({ id: 'a', pri: 0 })).toBe(false)
    st.clear()
    q.clear(true)
    expect(q.offer({ id: 'a', pri: 0 })).toBe(true)
  })
})

describe('提示紀錄與開關', () => {
  it('存在 localStorage，resetHints() 清空', () => {
    const s = G.localHintStore('xc.test.seen')
    s.add('start')
    expect(JSON.parse(mem.get('xc.test.seen')!)).toEqual(['start'])
    expect(G.localHintStore('xc.test.seen').has('start')).toBe(true)
    mem.set('xc.test.seen', 'not json')
    expect(s.has('start')).toBe(false)
    G.resetHints()
    expect(mem.get('xc.hints.seen')).toBe('[]')
  })

  it('hintsEnabled 預設開，改變時寫回 localStorage', () => {
    expect(G.hintsEnabled.value).toBe(true)
    G.hintsEnabled.value = false
    expect(mem.get('xc.hints')).toBe('0')
    G.hintsEnabled.value = true
    expect(mem.get('xc.hints')).toBe('1')
  })
})

describe('指引文字', () => {
  const ph = (s: string) => [...s.matchAll(/\{(\w+)\}/g)].map((m) => m[1]).sort()

  it('zh 與 en 的 key、佔位符一致', () => {
    expect(Object.keys(GUIDE_EN).sort()).toEqual(Object.keys(GUIDE_ZH).sort())
    for (const k of Object.keys(GUIDE_ZH)) expect([k, ph(GUIDE_EN[k])]).toEqual([k, ph(GUIDE_ZH[k])])
  })

  it('面板、提示、說明用到的 key 都有翻譯', () => {
    const need = new Set<string>()
    const states: View[] = [
      view({ role: 'human', classId: 'researcher', inv: inv('suit.cryo', 'geneSampler', 'gitResolver', 'memoryCore'), gitReports: [{ time: 1, names: [], result: 'clean' }], fac: { k: 'cells', e: 1, open: [], off: 0 }, abilities: ab('cls.rummage') }, { near: ['vendor.medical', 'vendor.escapePod', 'struct.git', 'struct.console', 'docked.mule', 'struct.droneControl', 'fac.fabricator', 'struct.rummage'].map((d) => ({ d, dist: 0.5 })), self: { d: 'personnel', hp: 10, mhp: 400 } }),
      { ...view({ role: 'human', zone: 0 }), w: { t: 999, stab: 0.1 } },
      view({ role: 'human', zone: 3 }, { zoneStation: 'ship:kestrel' }),
      view({ role: 'xeno', canEvolve: ['x'], ep: 1, epNext: 660, abilities: ab('xeno.form') }),
      view({ role: 'xeno', evolving: 3, abilities: ab('xeno.parasite', 'xeno.egg', 'xeno.human') }),
      view({ role: 'mutant', tier: 0, canEvolve: ['m'], abilities: ab('mut.devour') }),
      view({ role: 'mutant', tier: 2, evolving: 2, abilities: ab('mut.devour', 'mut.cannibalize', 'mut.prion') }),
      view({ role: 'mutant', tier: 2, canEvolve: ['m'] }),
      view({ role: 'android', ep: 2000, epNext: 2000 }, { near: [{ d: 'fac.fabricator', dist: 1 }] }),
      view({ role: 'android', ep: 2000, epNext: 2000, canEvolve: ['a'] }),
      view({ role: 'android', ep: 2, epNext: 2000 }),
      view({ role: 'human', spawn: true, faction: 'xeno', abilities: ab('xeno.parasite', 'xeno.spawnHuman', 'xeno.spawnForm') }),
      view({ role: 'human', spawn: true, faction: 'mutant', abilities: ab('mut.prion') }),
      view({ role: 'human', alive: false }),
      view({ role: 'android', alive: false }),
      view({ role: 'spectator', alive: false }),
    ]
    for (const v of states) {
      const o = G.objectiveFor(v)!
      need.add(o.goal)
      need.add('guide.id.' + o.id)
      for (const s of o.steps) need.add(s.key)
      for (const h of G.detectHints(v)) {
        need.add('guide.h.' + h.id)
        need.add('guide.h.' + h.id + '.t')
      }
    }
    for (const k of HELP_CONTROLS) need.add('guide.ctl.' + k).add('guide.ctl.' + k + '.k')
    for (const k of HELP_THINGS) need.add('guide.th.' + k).add('guide.th.' + k + '.t')
    for (const list of Object.values(G.ROLE_TIPS)) for (const k of list) need.add('guide.r.' + k)
    for (const k of ['self', 'players', 'hostile', 'other', 'door', 'console', 'vendor', 'git', 'fac', 'view', 'space']) need.add('guide.map.' + k)
    const missing = [...need].filter((k) => !hasString('zh', k) || !hasString('en', k))
    expect(missing).toEqual([])
    expect(need.size).toBeGreaterThan(100)
  })

  it('內文不提及開發用功能', () => {
    const all = [...Object.values(GUIDE_ZH), ...Object.values(GUIDE_EN)].join('\n').toLowerCase()
    for (const w of ['debug', 'hook', '除錯', 'devtool', 'console.log', '測試']) expect(all).not.toContain(w)
  })
})
