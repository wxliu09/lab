// 第 2 輪人類玩家視角審查（目標面板）：豪勇號開局指路、被寄生的紅色待辦、點一下走到設施、末日指引、仿生人 EP 來源。
// 目標面板的文字要和 sim／內容表的實際規則一致：這裡同時用真的 sim 驗證那些說法。
import { describe, expect, it, vi } from 'vitest'
import type { PrivateState, StartInfo, WorldPublic } from '../../src/shared/protocol/messages'
import { androidEpPerSec } from '../../src/shared/pacing'

// node 沒有 localStorage：Guide 模組載入時會讀寫
vi.hoisted(() => {
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
})

// client 端模組會碰 window；目標面板的純函式只需要它們的 signal
vi.mock('../../src/client/session', async () => {
  const { signal } = await import('@preact/signals')
  const { ClientWorld } = await import('../../src/client/world')
  return { world: new ClientWorld(), snapTick: signal(0), startInfo: signal(null), lobby: signal(null), send: () => {}, sendCmd: () => {} }
})
vi.mock('../../src/client/input', async () => {
  const { signal } = await import('@preact/signals')
  return { typingInField: () => false, chatOpen: signal(false), evolveOpen: signal(false), targetMode: signal(null), selected: signal(0), modalChecks: [], panelChecks: [], dialogOpen: () => false, localNotice: signal(null) }
})

const G = await import('../../src/ui/hud/Guide')
const N = await import('../../src/ui/hud/facilityNav')
const { GUIDE_EN, GUIDE_ZH } = await import('../../src/ui/strings/guide')
// sim 的隕擊預警、輻射區懸停說明（App.tsx 載入時註冊）
await import('../../src/ui/strings/sim3')
const { hasString, lang, t } = await import('../../src/ui/i18n')
const { parseLayout, walkableCell, cellAt } = await import('../../src/shared/layout')
const { STATION_BY_ID } = await import('../../src/shared/content/stations/index')
const { BUFFS, ITEMS, VENDORS, abilityDef } = await import('../../src/shared/content/registry')
const { CONSOLE_R, DEFAULT_BODY_R } = await import('../../src/render/moveTargets')
const { Harness } = await import('./helpers/harness')
const { INSTANT_ITEMS } = await import('../../src/sim/systems/vendors')
const { applyBuff } = await import('../../src/sim/systems/buffs')
const { giveItem, makeItem } = await import('../../src/sim/systems/items')
const { SPACE_ZONE } = await import('../../src/sim/world')

type View = Parameters<typeof G.objectiveFor>[0]

function inv(...items: (string | null)[]): PrivateState['inv'] {
  return items.map((i) => (i ? { item: i, charges: 0, cd: 0 } : null))
}
function view(me: Partial<PrivateState>, extra: Partial<View> = {}): View {
  return { me: { alive: true, zone: 1, abilities: [], inv: [], ...me }, w: { t: 100, stab: 1 }, near: [], self: { d: 'personnel', hp: 400, mhp: 400 }, ...extra }
}
const keysOf = (v: View) => G.objectiveFor(v)!.steps.map((s) => s.key)
const suited = { d: 'suit.plasma', hp: 600, mhp: 600 }

const bravado = parseLayout(STATION_BY_ID.get('bravado')!.layout)
const nyx = parseLayout(STATION_BY_ID.get('nyx')!.layout)

/** 真的 sim 跑出來的 client 狀態 → 目標面板的輸入（和 Guide.tsx viewFromWorld 同樣的欄位）*/
function clientView(c: { me: Record<string, unknown>; ents: Map<number, { d?: string; hp?: number; mhp?: number; b?: string[] }>; snaps: { w?: Partial<WorldPublic> }[]; inbox: { t: string }[] }): View {
  const me = c.me as Partial<PrivateState>
  const self = c.ents.get(me.unit ?? 0)
  const start = c.inbox.find((m) => m.t === 'start') as unknown as { info: StartInfo }
  const w = Object.assign({}, ...c.snaps.map((s) => s.w ?? {})) as Partial<WorldPublic>
  return { me, w, self: self ? { d: self.d, hp: self.hp, mhp: self.mhp, b: self.b } : undefined, near: [], zoneStation: start.info.zones.find((z) => z[0] === me.zone)?.[2] }
}

describe('豪勇號開局：指路去救生艙室、搭救生艙到女帝號', () => {
  it('在豪勇號上還沒湊滿樣本：空窗任務換成指路（不再叫他在豪勇號用站內監控掃描找人）', () => {
    const at = (t: number, me: Partial<PrivateState> = {}, station = 'bravado') =>
      keysOf({ ...view({ role: 'human', classId: 'ceo', ...me }, { self: suited, zoneStation: station }), w: { t } })
    for (const t of [0, 20, 40, 60, 100, 300]) {
      const k = at(t)
      expect(k, String(t)).toContain('guide.s.bravadoPod')
      expect(k.some((x) => x.startsWith('guide.s.alt')), String(t)).toBe(false)
    }
    // 倒數之後緊接著指路
    expect(at(100).slice(0, 2)).toEqual(['guide.s.samplerWait', 'guide.s.bravadoPod'])
    // 抽血中、檢測器已開放：先做手上的，再指路
    expect(at(100, { inv: inv('geneSampler') }).slice(0, 2)).toEqual(['guide.s.samplerUse', 'guide.s.bravadoPod'])
    expect(at(500).slice(0, 2)).toEqual(['guide.s.samplerGet', 'guide.s.bravadoPod'])
    // 已經湊滿（拿到解析器）就不用去了；在女帝號上也不用
    expect(at(500, { inv: inv('gitResolver') })).not.toContain('guide.s.bravadoPod')
    expect(at(100, {}, 'nyx')).not.toContain('guide.s.bravadoPod')
    expect(at(100, {}, 'nyx').some((x) => x.startsWith('guide.s.alt'))).toBe(true)
    // 只給人類；末日時改看撤離對策
    expect(keysOf(view({ role: 'android', ep: 1, epNext: 2000 }, { zoneStation: 'bravado' }))).not.toContain('guide.s.bravadoPod')
    expect(keysOf(view({ role: 'xeno', abilities: [] }, { zoneStation: 'bravado' }))).not.toContain('guide.s.bravadoPod')
    expect(keysOf({ ...view({ role: 'human' }, { zoneStation: 'bravado' }), w: { t: 100, ev: ['doom'], apo: 'orbit' } as never })).not.toContain('guide.s.bravadoPod')
  })

  it('指路的說法和版面一致：救生艙室在豪勇號左側、有救生艙裝置；豪勇號沒有 GIT、出生點少，也不能停靠別站', () => {
    const pods = bravado.rooms.find((r) => r.spec.id === 'pods')!
    expect(pods.spec.name).toEqual({ zh: '救生艙室', en: 'Escape Pods' })
    expect(GUIDE_ZH['guide.s.bravadoPod']).toContain(pods.spec.name.zh)
    expect(GUIDE_EN['guide.s.bravadoPod']).toContain(pods.spec.name.en)
    // 小地圖照版面畫（第 0 列在上、x 向右）：房間中心在版面左邊四分之一
    expect(pods.cx / bravado.w).toBeLessThan(0.25)
    const pod = bravado.pois.find((p) => p.def.kind === 'vendor' && p.def.ref === 'escapePod')!
    expect(bravado.roomOf[pod.row * bravado.w + pod.col]).toBe(pods.index)
    // 人和 GIT 在女帝號
    expect(bravado.pois.some((p) => p.def.kind === 'git')).toBe(false)
    expect(nyx.pois.some((p) => p.def.kind === 'git')).toBe(true)
    expect(nyx.spawns.length).toBeGreaterThan(bravado.spawns.length * 2)
    // 豪勇號站點本身沒有停靠技能（只能靠救生艙或船艇離開）
    for (const a of STATION_BY_ID.get('bravado')!.space.abilities) expect(abilityDef(a)?.effects?.some((e) => e.k === 'script' && /dock/i.test(e.fn))).toBeFalsy()
    // 從每個出生點都走得到救生艙裝置
    for (const s of bravado.spawns) expect(N.navTarget(bravado, 'escapePod', s), `${s.x},${s.y}`).not.toBeNull()
  })

  it('真的 sim：豪勇號上領救生艙憑證 → 太空中目標面板教他設定航線 → 照做就降落在女帝號', () => {
    const { h, cs } = Harness.started(4, 777, { eventMult: 0 })
    const g = h.server.game!
    const p = g.allPlayers()[1]
    const c = cs.find((x) => x.slot === p.slot)!
    g.setRole(p, 'human')
    const u = g.mainOf(p)!
    const bz = g.world.zones.find((z) => z.key === 'bravado')!
    const spot = bz.layout!.spawns[0]
    g.world.relocate(u, bz.id, spot.x, spot.y)
    h.ticks(3)
    expect(clientView(c).zoneStation).toBe('bravado')
    expect(keysOf(clientView(c))).toContain('guide.s.bravadoPod')
    expect(INSTANT_ITEMS.get('escapePass')!(g, u, u as never)).toBe(true)
    h.ticks(20 * 5)
    expect(u.zone).toBe(SPACE_ZONE)
    const v = clientView(c)
    const o = G.objectiveFor(v)!
    expect(o.steps[0].key).toBe('guide.s.podAim')
    expect(o.steps[0].args).toEqual({ k: 'Q', name: '設定航線' })
    expect(keysOf(v)).not.toContain('guide.s.bravadoPod')
    // 照目標面板做：按 Q 再點女帝號
    const nz = g.world.zones.find((z) => z.key === 'nyx')!
    g.handleCommand(p.slot, { k: 'cast', a: 'pod.trajectory', e: nz.spaceEnt })
    for (let i = 0; i < 90 && u.zone !== nz.id; i++) h.ticks(20)
    expect(u.zone).toBe(nz.id)
  })
})

describe('被寄生、感染朊毒：目標面板最前面的紅色「!」待辦', () => {
  it('依背包有沒有抗體包給不同說法；被抗體壓住後提醒還不能死；只給人類', () => {
    const o = (b: string[], items: PrivateState['inv'] = [], role: PrivateState['role'] = 'human', w: Partial<WorldPublic> = { t: 100 }) =>
      G.objectiveFor({ ...view({ role, inv: items, abilities: [] }, { self: { d: 'personnel', hp: 300, mhp: 400, b } }), w })!
    expect(o(['bf.parasite']).steps[0]).toEqual({ key: 'guide.s.infectParasiteGet', danger: true })
    expect(o(['bf.parasite'], inv('traumaKit', null, 'antibodyKit')).steps[0]).toEqual({ key: 'guide.s.infectParasite', args: { k: '3' }, danger: true })
    for (const b of ['bf.prion', 'bf.prionStrong', 'bf.prionCarrier']) expect(o([b]).steps[0].key, b).toBe('guide.s.infectPrionGet')
    expect(o(['bf.prion'], inv('antibodyKit')).steps[0]).toEqual({ key: 'guide.s.infectPrion', args: { k: '1' }, danger: true })
    expect(o(['bf.containedParasite', 'bf.antibody']).steps[0]).toEqual({ key: 'guide.s.infectHeldParasite', danger: true })
    expect(o(['bf.containedPrion']).steps[0].key).toBe('guide.s.infectHeldPrion')
    // 沒有感染：沒有紅色待辦
    expect(o(['bf.antibody']).steps.some((s) => s.danger)).toBe(false)
    // 排在重大事件對策前面，事件仍在
    const both = o(['bf.parasite'], [], 'human', { t: 100, ev: ['drones'] } as never)
    expect(both.steps.slice(0, 2).map((s) => s.key)).toEqual(['guide.s.infectParasiteGet', 'guide.ev.drones'])
    expect(both.steps.filter((s) => !s.dim).length).toBeLessThanOrEqual(4)
    // 仿生人不會被感染、異形主腦不會因寄生被轉化：不顯示
    expect(o(['bf.parasite'], [], 'android').steps.some((s) => s.danger)).toBe(false)
    expect(o(['bf.parasite'], [], 'xeno').steps.some((s) => s.danger)).toBe(false)
  })

  it('說法和內容表一致：每秒中毒、死時轉化、醫療補給有抗體包、抗體包壓成休眠 46 秒', () => {
    for (const id of ['bf.parasite', 'bf.prion']) expect(BUFFS.get(id)!.dot, id).toBeGreaterThan(0)
    expect(VENDORS.get('medical')!.stock.some((s) => s.item === 'antibodyKit')).toBe(true)
    expect(ITEMS.get('antibodyKit')!.use).toBe('ab.item.antibody')
    expect(BUFFS.get('bf.containedParasite')!.dur).toBe(46)
    expect(BUFFS.get('bf.containedPrion')!.dur).toBe(46)
    for (const k of ['guide.s.infectHeldParasite', 'guide.s.infectHeldPrion']) expect(GUIDE_ZH[k]).toContain('46')
  })

  it('真的 sim：自己看得到身上的寄生 → 紅色待辦；注射抗體包後換成「已休眠」；人類死掉被轉成異形眷屬', () => {
    const { h, cs } = Harness.started(4, 4242, { eventMult: 0 })
    const g = h.server.game!
    const ps = g.allPlayers()
    for (const q of ps) g.setRole(q, 'human')
    g.setRole(ps[3], 'xeno')
    const p = ps[1]
    const c = cs.find((x) => x.slot === p.slot)!
    const u = g.mainOf(p)!
    u.inv?.fill(null)
    applyBuff(g, u, 'bf.parasite', undefined, g.mainOf(ps[3])!)
    h.ticks(3)
    expect(G.objectiveFor(clientView(c))!.steps[0]).toEqual({ key: 'guide.s.infectParasiteGet', danger: true })
    const hp0 = u.hp
    h.ticks(40)
    expect(u.hp).toBeLessThan(hp0)
    const slot = giveItem(g, u, makeItem('antibodyKit'))
    h.ticks(2)
    expect(G.objectiveFor(clientView(c))!.steps[0]).toEqual({ key: 'guide.s.infectParasite', args: { k: String(slot + 1) }, danger: true })
    g.handleCommand(p.slot, { k: 'use', s: slot })
    h.ticks(5)
    expect(G.objectiveFor(clientView(c))!.steps[0]).toEqual({ key: 'guide.s.infectHeldParasite', danger: true })
  })
})

describe('點一下走到設施（facilityNav.ts）', () => {
  it('叫玩家去某設施的步驟才能點；天守砲台只在天守號上', () => {
    expect(N.navKindOf('guide.s.suitGet', 'nyx')).toBe('suit')
    expect(N.navKindOf('guide.s.altGear', 'nyx')).toBe('medical')
    expect(N.navKindOf('guide.s.samplerGet', 'nyx')).toBe('sampler')
    expect(N.navKindOf('guide.s.bravadoPod', 'bravado')).toBe('escapePod')
    expect(N.navKindOf('guide.s.infectParasiteGet', 'nyx')).toBe('medical')
    expect(N.navKindOf('guide.s.attack', 'nyx')).toBeNull()
    expect(N.navKindOf('guide.ev.tenshu', 'tenshu')).toBe('console')
    expect(N.navKindOf('guide.ev.tenshu', 'nyx')).toBeNull()
    // 每個對應到的步驟都是真的字串
    for (const k of Object.keys(N.STEP_NAV)) expect(hasString('zh', k) && hasString('en', k), k).toBe(true)
    for (const k of N.NAV_KINDS) expect(hasString('zh', 'guide.nav.' + k) && hasString('en', 'guide.nav.' + k), k).toBe(true)
  })

  it('本區有沒有那種設施：照版面判斷（翠原星地表沒有救生艙裝置、船艙不算）', () => {
    expect(N.stationHas('bravado', 'escapePod')).toBe(true)
    expect(N.stationHas('bravado', 'sampler')).toBe(true)
    expect(N.stationHas('bravado', 'suit')).toBe(true)
    expect(N.stationHas('nyx', 'sampler')).toBe(true)
    expect(N.stationHas('verdance', 'escapePod')).toBe(false)
    expect(N.stationHas('adjudicatrix', 'fabPad')).toBe(true)
    expect(N.stationHas('nyx', 'fabPad')).toBe(false)
    expect(N.stationHas('ship:kestrel', 'console')).toBe(false)
    expect(N.stationHas(undefined, 'suit')).toBe(false)
  })

  it('目標點站得到、走得到，而且到了就在設施的作用範圍內', () => {
    const vendorReach = 2.9 // VendorPanel／情境提示的販賣機距離
    for (const [st, l] of [
      ['nyx', nyx],
      ['bravado', bravado],
    ] as const) {
      for (const s of l.spawns) {
        for (const kind of ['suit', 'medical', 'sampler', 'escapePod'] as const) {
          const to = N.navTarget(l, kind, s)
          expect(to, `${st} ${kind} ${s.x},${s.y}`).not.toBeNull()
          const { col, row } = cellAt(l, to!.x, to!.y)
          expect(walkableCell(l, col, row)).toBe(true)
          expect(Math.hypot(to!.x - to!.poi.x, to!.y - to!.poi.y)).toBeLessThanOrEqual(N.NAV_REACH)
          expect(N.NAV_REACH).toBeLessThan(vendorReach)
          expect(to!.steps).toBeGreaterThan(0)
        }
        // 控制台：走到控制圈裡（同場景右鍵控制台：到了就開始駕駛）
        const c = N.navTarget(l, 'console', s)!
        expect(Math.hypot(c.x - c.poi.x, c.y - c.poi.y)).toBeLessThanOrEqual(CONSOLE_R + DEFAULT_BODY_R)
      }
    }
    // 仿生人的鑄造平台：站在平台格上
    const adj = parseLayout(STATION_BY_ID.get('adjudicatrix')!.layout)
    const pad = N.navTarget(adj, 'fabPad', adj.spawns[0])!
    expect(pad.poi.def.kind).toBe('fabricatorPad')
    expect(cellAt(adj, pad.x, pad.y)).toEqual({ col: pad.poi.col, row: pad.poi.row })
  })

  it('挑「走路最近」的那一台，不是直線最近（隔著牆的不算近）；完全走不到回傳 null', () => {
    const l = parseLayout({
      rows: [
        '###############',
        '#a.#.........b#',
        '#..#..........#',
        '#..#..........#',
        '#..#..........#',
        '#..#..........#',
        '#..#..........#',
        '#.............#',
        '###############',
      ],
      pois: { a: { kind: 'vendor', ref: 'medical' }, b: { kind: 'vendor', ref: 'medical' } },
      rooms: [],
    })
    const from = { x: 4.5, y: l.h - 1 - 0.5 }
    const to = N.navTarget(l, 'medical', from)!
    expect(to.poi.key).toBe('b')
    // a 直線比較近
    const a = l.pois.find((p) => p.key === 'a')!
    expect(Math.hypot(a.x - from.x, a.y - from.y)).toBeLessThan(Math.hypot(to.poi.x - from.x, to.poi.y - from.y))
    // 從 a 那一側出發就選 a
    expect(N.navTarget(l, 'medical', { x: 1.5, y: l.h - 1 - 2.5 })!.poi.key).toBe('a')
    // 封死的房間：走不到
    const sealed = parseLayout({ rows: ['#######', '#..#.a#', '#..####', '#######'], pois: { a: { kind: 'vendor', ref: 'suitA' } }, rooms: [] })
    expect(N.navTarget(sealed, 'suit', { x: 1.5, y: 2.5 })).toBeNull()
    expect(N.navTarget(sealed, 'medical', { x: 1.5, y: 2.5 })).toBeNull()
  })
})

describe('末日、小行星的短版指引：撤到翠原星地表，但地表會落隕石', () => {
  it('不再說地表「最安全」；都提醒紅色警戒圈（sim 的隕擊預警）與輻射區', () => {
    const keys = ['guide.ev.asteroids', 'guide.ev.doom', 'guide.ev.doom.orbit', 'guide.ev.doom.fleet']
    for (const k of keys) {
      expect(GUIDE_ZH[k], k).toContain('翠原星地表')
      expect(GUIDE_ZH[k], k).not.toContain('最安全')
      expect(GUIDE_ZH[k], k).toContain('紅色警戒圈')
      expect(GUIDE_EN[k], k).not.toMatch(/safest/i)
      expect(GUIDE_EN[k], k).toMatch(/red warning circle/)
    }
    for (const k of keys.slice(1)) {
      expect(GUIDE_ZH[k], k).toContain('輻射區')
      expect(GUIDE_EN[k], k).toMatch(/fallout zone/)
    }
    // 穩定度的長版說明也一樣
    for (const k of ['guide.h.stab', 'guide.th.stab']) {
      expect(GUIDE_ZH[k], k).toContain('紅色警戒圈')
      expect(GUIDE_ZH[k], k).not.toContain('最後的避難所')
    }
    // 名稱和 sim 的預警訊息、懸停說明一致（輻射區 = hz.radField）
    lang.value = 'zh'
    expect(t('st.impactWarn')).toContain('紅色警戒圈')
    expect(t('hover.desc.hz.radField')).toContain('輻射區')
  })
})

describe('仿生人：目標面板說明 EP 怎麼來', () => {
  it('每秒自動 +1.5（乘上大廳的 EP 倍率），並估還要幾分鐘', () => {
    expect(G.androidEpRate(0, 2000)).toEqual({ r: '1.5', m: 23 })
    expect(G.androidEpRate(500, 2000, 2)).toEqual({ r: '3', m: 9 })
    expect(G.androidEpRate(1999, 2000)).toEqual({ r: '1.5', m: 1 })
    expect(G.androidEpRate(0, 2000, 0.25).r).toBe('0.38')
    const o = G.objectiveFor(view({ role: 'android', ep: 500, epNext: 2000 }))!
    const s = o.steps.find((x) => x.key === 'guide.s.androidEp')!
    expect(s.args).toEqual({ r: '1.5', m: 17 })
    lang.value = 'zh'
    expect(t(s.key, s.args)).toContain('每秒自動 +1.5')
    expect(G.objectiveFor({ ...view({ role: 'android', ep: 500, epNext: 2000 }), epMult: 2 })!.steps.find((x) => x.key === 'guide.s.androidEp')!.args).toEqual({ r: '3', m: 9 })
    // EP 那一條排第一（第 3 輪：「協助人類」讓位給「先做：」混進船員的做法）
    expect(o.steps.map((x) => x.key)).toEqual(['guide.s.androidEp', 'guide.s.ff', 'guide.s.androidSampleWait', 'guide.s.core'])
    // 兩個重大事件同時進行時仍看得到 EP 從哪裡來
    const busy = G.objectiveFor({ ...view({ role: 'android', ep: 500, epNext: 2000 }), w: { t: 100, ev: ['doom', 'asteroids'], apo: 'orbit' } as never })!
    expect(busy.steps.map((x) => x.key)).toContain('guide.s.androidEp')
  })

  // 第 8 輪 S8：仿生人每秒 EP 依末日時間換算（shared/pacing.ts androidEpPerSec）；原作末日 55–70 分照原作 1.5（10 秒 15 EP）
  it('真的 sim：仿生人 10 秒得到 15 EP（原作末日時間；EP 倍率 2 時 30）；本作預設末日照 androidEpPerSec', () => {
    for (const apocalypse of [[55, 70], [30, 40]] as [number, number][]) {
      for (const mult of [1, 2]) {
        const { h } = Harness.started(4, 99, { eventMult: 0, epMult: mult, apocalypse })
        const g = h.server.game!
        const p = g.allPlayers()[1]
        g.setRole(p, 'android')
        h.ticks(20)
        const e0 = p.ep
        h.ticks(20 * 10)
        const rate = apocalypse[0] === 55 ? G.ANDROID_EP_PER_SEC : androidEpPerSec(apocalypse)
        expect(p.ep - e0, `${apocalypse} ×${mult}`).toBeCloseTo(rate * 10 * mult, 5)
      }
    }
  })
})
