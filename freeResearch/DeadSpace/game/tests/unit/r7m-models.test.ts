// 第 7 輪（視聽與手感）：內容表裡的每個 UnitDef.model 都要有自己的模型，不能默默掉回 index.ts 的灰色膠囊（fallback）。
// 另外把這一輪新做的模型實際建一次、跑過每種動作狀態：不丟例外、三角形數在預算內、同種生物共用合併幾何（boneKit）。
import { beforeAll, describe, expect, it } from 'vitest'
import type * as THREE from 'three'

// Node 沒有 canvas／DOM：最小的假 2D context（同 spaceLoad.test.ts），模型的程序化貼圖才建得起來
type FakeCanvas = { width: number; height: number; _img?: { data: Uint8ClampedArray }; _x?: unknown; getContext(): unknown }
beforeAll(() => {
  const ctx = (c: FakeCanvas) =>
    new Proxy({ canvas: c } as Record<string | symbol, unknown>, {
      get(t, k) {
        if (k in t) return t[k]
        if (k === 'createImageData') return (w: number, h: number) => ({ width: w, height: h, data: new Uint8ClampedArray(w * h * 4) })
        if (k === 'putImageData') return (img: { data: Uint8ClampedArray }) => (c._img = { data: new Uint8ClampedArray(img.data) })
        if (k === 'getImageData') return (_x: number, _y: number, w: number, h: number) => ({ width: w, height: h, data: c._img ? new Uint8ClampedArray(c._img.data) : new Uint8ClampedArray(w * h * 4) })
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
  g.ImageData ??= class {
    data: Uint8ClampedArray
    constructor(
      public width: number,
      public height: number,
    ) {
      this.data = new Uint8ClampedArray(width * height * 4)
    }
  }
  g.document ??= {
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
  const store = new Map<string, string>()
  g.localStorage ??= { getItem: (k: string) => store.get(k) ?? null, setItem: (k: string, v: string) => store.set(k, v), removeItem: (k: string) => store.delete(k) }
})

/**
 * 不經過 MODELS 的 model id（各有別的地方畫），每個都要寫明理由。新內容不能把 id 加到這裡了事：
 * 要嘛登錄模型（regModel），要嘛真的由別的系統畫、在這裡寫清楚是哪個。
 */
const RENDERED_ELSEWHERE: Record<string, string> = {
  human: 'units.ts 走人形骨架（buildHuman＋attachSuit），不經過 MODELS',
  corpse: '屍體的快照 d 換成死者的 viewDef（sim/systems/death.ts makeCorpse），畫的是死者自己的模型（倒地狀態）',
  // 以下是固定設施：站在版面 POI 格上的結構實體由站體烘焙的 POI 模型代表（props.ts；gameScene.isStaticStructure 略過單位層）
  console: '站體 POI（props.ts console）',
  consoleBroken: '站體 POI（props.ts consoleBroken）',
  powerConsole: '站體 POI（props.ts powerConsole）',
  git: '站體 POI（props.ts git）',
  regenerator: '站體 POI（props.ts regenerator）',
  droneRing: '站體 POI（無人機控制環，props.ts）',
  enhancer: '站體 POI（props.ts enhancer）',
  fabricator: '站體 POI（props.ts fabricator）',
  moduleSocket: '站體 POI（props.ts moduleSocket）',
  moduleFactory: '站體 POI（props.ts moduleFactory）',
  cellConsole: '站體 POI（props.ts cellConsole）',
  cageConsole: '站體 POI（props.ts cageConsole）',
  codePanel: '站體 POI（props.ts codePanel）',
  penguinStatue: '站體 POI（props.ts penguinStatue）',
  landingSite: '站體 POI（props.ts landingSite）',
  landingPortal: '站體 POI（props.ts landingPortal）',
}

/** 這一輪新做的模型與三角形預算（小型生物 ≤1.5k、大型 ≤4k；海盜是人形骨架＋行頭、艦隊是太空層的大船，另計）*/
const BUDGET: Record<string, number> = {
  'creature.skitter': 1500,
  'creature.skitterOverseer': 4000,
  'creature.slugling': 1500,
  'creature.elderSlug': 4000,
  'creature.murmaw': 4000,
  'creature.failed': 4000,
  'creature.failedSheep': 4000,
  'creature.failedHostile': 4000,
  'creature.failedBrute': 4000,
  'creature.failedSwift': 1500,
  'creature.anomaly': 1500,
  'creature.anomalyCaged': 1500,
  'creature.anomalyRich': 1500,
  'creature.entity': 1500,
  'creature.chicken': 1500,
  'creature.frog': 1500,
  'creature.rabbit': 1500,
  'creature.sheep': 1500,
  'creature.stag': 4000,
  'creature.greyFox': 1500,
  'creature.snowgle': 4000,
  'creature.snowgleWarden': 4000,
  'creature.freakman': 4000,
  'rig.monstrosity': 4000,
  'npc.slugOperative': 1500,
  'npc.pacifier': 4000,
  'npc.defenseDrone': 4000,
  'pirate.captain': 12000,
  'pirate.crew': 12000,
  'fleet.censure': 8000,
  'fleet.erstfall': 8000,
  'fleet.hydra': 12000,
}

async function load() {
  await import('../../src/shared/content')
  const reg = await import('../../src/shared/content/registry')
  const models = await import('../../src/render/models/index')
  // 遊戲裡由 units.ts／gameScene.ts import 的模型檔（副作用註冊）
  await import('../../src/render/models/misc')
  await import('../../src/render/models/xeno')
  await import('../../src/render/models/mutant')
  await import('../../src/render/models/android')
  await import('../../src/render/models/ships')
  await import('../../src/render/models/devices')
  return { UNITS: reg.UNITS, MODELS: models.MODELS, buildModel: models.buildModel }
}

function tris(o: THREE.Object3D): { tris: number; meshes: number } {
  let t = 0
  let m = 0
  o.traverse((c) => {
    const mesh = c as THREE.Mesh
    if (!mesh.isMesh || !c.visible) return
    const g = mesh.geometry
    t += (g.index ? g.index.count : g.attributes.position.count) / 3
    m++
  })
  return { tris: Math.round(t), meshes: m }
}

describe('模型登錄：沒有單位會掉回灰色膠囊', () => {
  it('每個 UnitDef.model 都有 regModel，或在 RENDERED_ELSEWHERE 寫明由誰畫', async () => {
    const { UNITS, MODELS } = await load()
    const missing: string[] = []
    const used = new Set<string>()
    for (const [id, d] of UNITS) {
      used.add(d.model)
      if (!MODELS.has(d.model) && !(d.model in RENDERED_ELSEWHERE)) missing.push(`${id} → ${d.model}`)
    }
    expect(missing).toEqual([])
    // 白名單不能有過期的 id（已經登錄了、或內容表已經沒人用）
    for (const k of Object.keys(RENDERED_ELSEWHERE)) {
      expect(MODELS.has(k), `${k} 已經有 regModel，從白名單拿掉`).toBe(false)
      expect(used.has(k), `${k} 已經沒有單位使用，從白名單拿掉`).toBe(true)
    }
  })

  it('白名單裡的設施 id 只用在 structure 單位上（POI 才會畫它們）', async () => {
    const { UNITS } = await load()
    for (const d of UNITS.values()) {
      if (!(d.model in RENDERED_ELSEWHERE) || d.model === 'human' || d.model === 'corpse') continue
      expect(d.tags, `${d.id}（${d.model}）`).toContain('structure')
    }
  })
})

describe('第 7 輪新模型：建得起來、每種狀態都能更新、三角形在預算內', () => {
  it('每個模型跑過 idle／移動／攻擊／施法／死亡', async () => {
    const { UNITS, MODELS, buildModel } = await load()
    const report: string[] = []
    const over: string[] = []
    for (const [id, budget] of Object.entries(BUDGET)) {
      const def = UNITS.get(id)
      expect(def, id).toBeDefined()
      expect(MODELS.has(def!.model), `${id} → ${def!.model}`).toBe(true)
      const v = buildModel(def!.model, def, { i: 7, d: id, st: 0 })
      const { tris: n, meshes } = tris(v.root)
      report.push(`${id}\t${n}\t${meshes}\t${v.height.toFixed(2)}`)
      if (n > budget) over.push(`${id} ${n} > ${budget}`)
      expect(n, `${id} 是空的`).toBeGreaterThan(50)
      expect(v.height).toBeGreaterThan(0.15)
      let t = 0
      for (const st of [0, 1, 2, 3, 5, 0, 4]) {
        for (let f = 0; f < 20; f++) {
          t += 1 / 30
          v.update(t, 1 / 30, st === 1 ? 3 : 0, st)
        }
      }
      // 動畫沒有把任何骨頭／零件弄成 NaN
      v.root.updateMatrixWorld(true)
      v.root.traverse((o) => expect(Number.isFinite(o.matrixWorld.elements[13]), `${id} ${o.name}`).toBe(true))
    }
    console.log('[r7m]\n' + report.join('\n'))
    expect(over).toEqual([])
  })

  it('同種生物共用合併幾何（每隻只有自己的骨架），draw call 少', async () => {
    const { UNITS, buildModel } = await load()
    for (const id of ['creature.skitter', 'creature.slugling', 'creature.sheep', 'creature.failedBrute']) {
      const def = UNITS.get(id)!
      const a = buildModel(def.model, def, { i: 1, d: id })
      const b = buildModel(def.model, def, { i: 2, d: id })
      const ga: THREE.BufferGeometry[] = []
      const gb: THREE.BufferGeometry[] = []
      a.root.traverse((o) => (o as THREE.Mesh).isMesh && ga.push((o as THREE.Mesh).geometry))
      b.root.traverse((o) => (o as THREE.Mesh).isMesh && gb.push((o as THREE.Mesh).geometry))
      expect(ga.length, id).toBeLessThanOrEqual(12)
      expect(ga).toEqual(gb)
      for (let i = 0; i < ga.length; i++) expect(ga[i]).toBe(gb[i])
      const sk = (v: typeof a) => {
        let s: THREE.Skeleton | null = null
        v.root.traverse((o) => (s ??= (o as THREE.SkinnedMesh).skeleton ?? null))
        return s
      }
      expect(sk(a)).not.toBe(sk(b))
    }
  })

  it('外觀只看公開的 model id／def id：船長與船員、竄蟲與監工不同；同一種模型的兩隻一樣', async () => {
    const { UNITS, buildModel } = await load()
    const sig = (id: string, i: number) => {
      const def = UNITS.get(id)!
      const v = buildModel(def.model, def, { i, d: id })
      return tris(v.root).tris
    }
    expect(sig('pirate.captain', 1)).not.toBe(sig('pirate.crew', 1))
    expect(sig('creature.anomaly', 1)).toBe(sig('creature.anomalyCaged', 2))
    expect(sig('creature.skitter', 1)).not.toBe(sig('creature.skitterOverseer', 1))
    expect(sig('creature.slugling', 3)).toBe(sig('npc.slugOperative', 4))
  })
})
