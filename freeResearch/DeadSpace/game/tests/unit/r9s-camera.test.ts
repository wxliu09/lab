// 第 9 輪 S（上架前總評）鏡頭：
// - P2-5：搭船停靠、走艙門下船到新站（sim＋client 實際流程，分段建站的路徑）：畫面切到新站那一幀鏡頭就對準自己；
//   游標停在畫面邊緣時，滑鼠沒動之前不邊緣捲動（不然一進站就被捲到角落）；
// - 觀戰時不誤跳：附身的蛞蝓仔換了站、觀戰視角還在原站時不跳；觀戰視角切過去才對準牠。
// 不經算繪（同 r7o-scene.test.ts 的假 DOM）。
import { beforeAll, describe, expect, it, vi } from 'vitest'

type FakeCanvas = { width: number; height: number; _x?: unknown; getContext(): unknown }
beforeAll(() => {
  const ctx = (c: FakeCanvas) =>
    new Proxy({ canvas: c } as Record<string | symbol, unknown>, {
      get(t, k) {
        if (k in t) return t[k]
        if (k === 'createImageData' || k === 'getImageData') return (_a: number, _b: number, w = _a, h = _b) => ({ width: w, height: h, data: new Uint8ClampedArray(w * h * 4) })
        if (k === 'measureText') return () => ({ width: 10 })
        if (k === 'createLinearGradient' || k === 'createRadialGradient' || k === 'createPattern') return () => ({ addColorStop() {} })
        return typeof k === 'string' ? (t[k] ??= () => {}) : undefined
      },
      set(t, k, v) {
        t[k] = v
        return true
      },
    })
  const g = globalThis as Record<string, unknown>
  g.ImageData = class {
    data: Uint8ClampedArray
    constructor(
      public width: number,
      public height: number,
    ) {
      this.data = new Uint8ClampedArray(width * height * 4)
    }
  }
  g.document = {
    hidden: false,
    addEventListener() {},
    removeEventListener() {},
    createElement: () => {
      const c: FakeCanvas = { width: 0, height: 0, getContext: () => (c._x ??= ctx(c)) }
      return c
    },
  }
  g.window ??= g
  g.addEventListener ??= () => {}
  g.removeEventListener ??= () => {}
  g.innerWidth ??= 1280
  g.innerHeight ??= 760
  const store = new Map<string, string>([['xc.prebuild', '0'], ['xc.quality', 'low']])
  g.localStorage = { getItem: (k: string) => store.get(k) ?? null, setItem: (k: string, v: string) => store.set(k, v), removeItem: (k: string) => store.delete(k) }
})


/** 假的引擎（同 stepLoad.test.ts）：有引擎才會走分段建站（瀏覽器裡第一次進站的路徑）*/
const fakeHost = () => ({
  renderer: { getContext: () => ({ isContextLost: () => false }), domElement: { addEventListener() {}, removeEventListener() {} }, initTexture() {}, info: { programs: [] } },
  compile() {},
})

describe('P2-5：換 zone 時鏡頭對準自己', () => {
  it('女帝號登艦 → 發射 → 停靠裁決者號 → 走艙門下船：每次換 zone 鏡頭都對準自己（分段建站）', async () => {
    vi.resetModules()
    await import('../../src/shared/content/index')
    const { Harness } = await import('./helpers/harness')
    const { spaceOf } = await import('../../src/sim/systems/space')
    const gsm = await import('../../src/render/gameScene')
    const { world: w } = await import('../../src/client/session')
    const { h, cs } = Harness.started(2, 12, { eventMult: 0 })
    const g = h.server.game!
    const hc = cs[0]
    const p = g.players[hc.slot]
    const u = g.mainOf(p)!
    const zone = (k: string) => g.world.zones.find((z) => z.key === k)!
    const nyx = zone('nyx')
    const adj = zone('adjudicatrix')
    const inst = [...spaceOf(g).ships.values()].find((s) => s.docked?.zone === nyx.id)!
    const de = g.world.get(inst.dockedEnt)!
    const start = hc.inbox.find((m) => m.t === 'start') as unknown as { info: { zones: [number, string, string][] } }
    const gs = new gsm.GameScene(w)
    gs.setZones(start.info.zones)
    gs.startPrebuild(fakeHost() as never)
    let seen = 0
    let t = 1
    const switches: { zone: number; cam: [number, number]; unit: [number, number] }[] = []
    const step = async (n: number) => {
      for (let i = 0; i < n; i++) {
        h.ticks(1)
        // 讓分段建站在幀與幀之間接著做（MessageChannel）
        await new Promise((r) => setTimeout(r, 8))
        for (; seen < hc.snaps.length; seen++) w.apply(hc.snaps[seen])
        const z0 = gs.zone
        gs.update(1 / 20, (t += 1 / 20))
        if (gs.zone !== z0) {
          const c = p.control === u.id ? u : g.world.get(p.control)!
          switches.push({ zone: gs.zone, cam: [gs.rts.tx, gs.rts.ty], unit: [c.x, c.y] })
        }
      }
    }
    g.world.relocate(u, nyx.id, de.x, de.y - de.radius - 1.2)
    await step(3)
    // 登艦
    g.handleCommand(p.slot, { k: 'interact', e: de.id })
    for (let i = 0; i < 100 && u.zone !== inst.zone; i++) await step(1)
    await step(3)
    expect(gs.zone).toBe(inst.zone)
    // 站上控制台發射，駕駛到裁決者號旁停靠
    const con = g.world.zones[inst.zone].data.console as { x: number; y: number }
    g.handleCommand(p.slot, { k: 'move', x: con.x, y: con.y })
    for (let i = 0; i < 400 && !inst.spaceEnt; i++) await step(1)
    await step(3)
    const ship = g.world.get(inst.spaceEnt)!
    expect(p.control).toBe(ship.id)
    const adjEnt = g.world.get(adj.spaceEnt)!
    g.world.relocate(ship, 0, adjEnt.x + 3, adjEnt.y)
    await step(3)
    g.script('space.dock')!(g, { caster: ship, target: adjEnt, x: adjEnt.x, y: adjEnt.y, zone: 0 } as never, {} as never)
    await step(5)
    expect(inst.docked?.zone).toBe(adj.id)
    // 游標停在右下角（指令卡）：之後走艙門下船
    gs.rts.mouseAt(window.innerWidth as number - 1, window.innerHeight as number - 1, true)
    const exit = g.world.zones[inst.zone].layout!.exits[0]
    g.handleCommand(p.slot, { k: 'move', x: exit.x, y: exit.y })
    for (let i = 0; i < 400 && (u.zone !== adj.id || gs.zone !== adj.id); i++) await step(1)
    await step(20)
    expect(u.zone).toBe(adj.id)
    expect(gs.zone).toBe(adj.id)
    // 每次換 zone（開局的女帝號、船艙、太空、船艙、裁決者號）切過去那一幀鏡頭就在自己身上
    expect(switches.map((s) => s.zone)).toEqual([nyx.id, inst.zone, 0, inst.zone, adj.id])
    for (const s of switches) expect(Math.hypot(s.cam[0] - s.unit[0], s.cam[1] - s.unit[1])).toBeLessThan(0.5)
    // 下船一秒後：游標一直停在畫面角落，鏡頭沒有被邊緣捲動帶走
    expect(Math.hypot(gs.rts.tx - u.x, gs.rts.ty - u.y)).toBeLessThan(1.5)
    // 滑鼠真的動了：恢復邊緣捲動
    gs.rts.mouseAt(window.innerWidth as number - 2, window.innerHeight as number - 1, true)
    for (let i = 0; i < 10; i++) gs.rts.update(1 / 20, 1280, 720)
    expect(gs.rts.tx).toBeGreaterThan(u.x + 2)
    gs.dispose()
  }, 120000)
})

describe('觀戰時不誤跳', () => {
  it('附身的蛞蝓仔換了站、觀戰視角還在原站：鏡頭不動；觀戰視角切過去：對準牠', async () => {
    vi.resetModules()
    await import('../../src/shared/content/index')
    const gsm = await import('../../src/render/gameScene')
    const { world: w } = await import('../../src/client/session')
    const vp = await import('../../src/client/viewPrefs')
    vp.followMode.value = 'off'
    const gs = new gsm.GameScene(w)
    gs.setZones([
      [1, 'nyx', 'nyx'],
      [2, 'tenshu', 'tenshu'],
    ])
    const snap = (time: number, e: unknown[], me?: unknown) => w.apply({ tick: time * 20, time, e, g: [], me } as never)
    snap(1, [{ i: 77, d: 'creature.slugling', z: 1, x: 3000, y: 2000, f: 0, o: 3 }], { alive: false, role: 'human', unit: 10, control: 77, zone: 1, specZone: 1 })
    let t = 1
    const frames = (n: number) => {
      for (let i = 0; i < n; i++) gs.update(1 / 60, (t += 1 / 60))
    }
    frames(3)
    expect(gs.zone).toBe(1)
    expect([gs.rts.tx, gs.rts.ty]).toEqual([30, 20])
    // 使用者把鏡頭移開；蛞蝓仔換到別站（觀戰視角還在原站）
    gs.rts.jump(50, 40)
    snap(2, [{ i: 77, z: 2, x: 1000, y: 1000 }])
    frames(3)
    expect(gs.zone).toBe(1)
    expect([gs.rts.tx, gs.rts.ty]).toEqual([50, 40])
    // 觀戰視角切過去：對準牠
    snap(3, [], { specZone: 2, zone: 2 })
    frames(3)
    expect(gs.zone).toBe(2)
    expect([gs.rts.tx, gs.rts.ty]).toEqual([10, 10])
    gs.dispose()
  }, 120000)
})
