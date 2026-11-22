// 第 7 輪（視聽與手感）：人形模型重做（human.ts／humanKit.ts／humanTex.ts／suits.ts）
// - 公開介面不變（buildHuman → Rig、animateRig、attachSuit、SUIT_IDS），每個職業與防護服都建得出來
// - 三角形與 draw call 在預算內（高畫質約 ≤ 3.5k、低畫質更少；draw call 比舊版的 27–46 少一半以上）
// - 外觀只取決於 (職業, 玩家色, seed, 防護服)：同樣輸入 → 同一份快取幾何；玩家色只換肩甲材質、幾何不變（偽裝的異形走同一條路）
// - 動畫：各狀態都不產生 NaN；倒地的最終姿勢只取決於 deadT（烘焙屍體用 deadT = 10），和倒下前在做什麼無關
import { beforeAll, describe, expect, it } from 'vitest'
import * as THREE from 'three'

// Node 沒有 canvas：最小的假 2D context（同 stationBatch.test.ts）
type FakeCanvas = { width: number; height: number; _x?: unknown; getContext(): unknown }
beforeAll(() => {
  const ctx = (c: FakeCanvas) =>
    new Proxy({ canvas: c } as Record<string | symbol, unknown>, {
      get(t, k) {
        if (k in t) return t[k]
        if (k === 'createImageData')
          return (w: number, h: number) => ({ width: w, height: h, data: new Uint8ClampedArray(w * h * 4) })
        return typeof k === 'string' ? (t[k] ??= () => {}) : undefined
      },
      set(t, k, v) {
        t[k] = v
        return true
      },
    })
  const g = globalThis as Record<string, unknown>
  g.document = {
    createElement: () => {
      const c: FakeCanvas = { width: 0, height: 0, getContext: () => (c._x ??= ctx(c)) }
      return c
    },
  }
})

const CLASSES = [
  'researcher',
  'security',
  'medic',
  'captain',
  'janitor',
  'ceo',
  'commissar',
  'engineer',
  'corporal',
  'ace',
]

async function mods() {
  const human = await import('../../src/render/models/human')
  const suits = await import('../../src/render/models/suits')
  const kit = await import('../../src/render/models/humanKit')
  const q = await import('../../src/render/quality')
  const batch = await import('../../src/render/batch')
  return { ...human, ...suits, mergedCount: kit.mergedCount, quality: q.quality, bakeTree: batch.bakeTree }
}

function meshes(o: THREE.Object3D): THREE.Mesh[] {
  const out: THREE.Mesh[] = []
  o.traverse((c) => {
    if ((c as THREE.Mesh).isMesh) out.push(c as THREE.Mesh)
  })
  return out
}

function stats(o: THREE.Object3D): { tris: number; draws: number } {
  let tris = 0
  const ms = meshes(o)
  for (const m of ms)
    tris += (m.geometry.index ? m.geometry.index.count : m.geometry.attributes.position.count) / 3
  return { tris, draws: ms.length }
}

function finite(o: THREE.Object3D): boolean {
  let ok = true
  o.traverse((c) => {
    for (const v of [...c.position.toArray(), c.rotation.x, c.rotation.y, c.rotation.z, ...c.scale.toArray()])
      if (!Number.isFinite(v)) ok = false
  })
  return ok
}

describe('人形模型（r7）', () => {
  it('公開介面：Rig 的骨架節點都在、槍口與手電筒掛在骨架上', async () => {
    const { buildHuman } = await mods()
    const r = buildHuman('researcher', '#e33d38', 0)
    for (const k of [
      'root',
      'body',
      'torso',
      'head',
      'armL',
      'armR',
      'foreL',
      'foreR',
      'legL',
      'legR',
      'shinL',
      'shinR',
      'muzzle',
      'lamp',
    ] as const) {
      expect(r[k]).toBeInstanceOf(THREE.Object3D)
      let p: THREE.Object3D | null = r[k]
      while (p && p !== r.root) p = p.parent
      expect(p, k).toBe(r.root)
    }
    expect(r.height).toBeCloseTo(1.85)
    expect(r.extra).toEqual([])
    // 不認得的職業（快照 cl 空字串時呼叫端給 researcher）退回研究員外觀
    expect(stats(buildHuman('nope', '#e33d38', 0).root)).toEqual(stats(r.root))
  })

  it('每個職業、每套防護服：三角形與 draw call 在預算內，低畫質更少', async () => {
    const { buildHuman, attachSuit, SUIT_IDS, quality } = await mods()
    expect(SUIT_IDS.length).toBe(18)
    const measure = () => {
      const out = new Map<string, { tris: number; draws: number }>()
      for (const cl of CLASSES) out.set(cl, stats(buildHuman(cl, '#e33d38', 1).root))
      SUIT_IDS.forEach((id, i) => {
        const r = buildHuman(CLASSES[i % CLASSES.length], '#5d8ada', i % 5)
        attachSuit(r, id, '#5d8ada')
        out.set(id, stats(r.root))
      })
      return out
    }
    quality.value = 'high'
    const hi = measure()
    quality.value = 'low'
    const lo = measure()
    quality.value = 'medium'
    for (const [id, s] of hi) {
      // 舊版：職業約 6.5k 三角形／29 draw call、防護服約 9.5k／43
      expect(s.tris, id).toBeLessThanOrEqual(3700)
      expect(s.draws, id).toBeLessThanOrEqual(18)
      expect(lo.get(id)!.tris, id).toBeLessThan(s.tris * 0.85)
    }
    const avg = [...hi.values()].reduce((a, s) => a + s.tris, 0) / hi.size
    expect(avg).toBeLessThanOrEqual(3500)
  })

  it('外觀只看 (職業, 玩家色, seed)：同輸入共用快取幾何，玩家色只換肩甲材質', async () => {
    const { buildHuman, mergedCount } = await mods()
    const a = meshes(buildHuman('medic', '#e33d38', 2).root)
    const n0 = mergedCount()
    const b = meshes(buildHuman('medic', '#19c3b5', 2).root)
    for (let i = 0; i < 20; i++) buildHuman('medic', '#19c3b5', 2)
    expect(mergedCount()).toBe(n0)
    expect(b.map((m) => m.geometry)).toEqual(a.map((m) => m.geometry))
    const pcA = a.filter((m) => (m.material as THREE.MeshStandardMaterial).color?.getHexString() === 'e33d38')
    const pcB = b.filter((m) => (m.material as THREE.MeshStandardMaterial).color?.getHexString() === '19c3b5')
    expect(pcA.length).toBeGreaterThan(0)
    expect(pcB.length).toBe(pcA.length)
  })

  it('seed 讓同職業的船員看起來不一樣（膚色、髮型、小配件）', async () => {
    const { buildHuman } = await mods()
    const sig = (seed: number) =>
      meshes(buildHuman('researcher', '#eff0f3', seed).root)
        .map((m) => m.geometry.uuid)
        .join(',')
    expect(new Set([0, 1, 2, 3, 4].map(sig)).size).toBe(5)
  })

  it('防護服：收起職業道具、換上頭盔與專屬零件；槍口仍在骨架上', async () => {
    const { buildHuman, attachSuit, rigBuild, SUIT_IDS, animateRig } = await mods()
    for (const id of SUIT_IDS) {
      const r = buildHuman('medic', '#f7d83b', 3)
      const before = stats(r.root)
      attachSuit(r, id, '#f7d83b')
      const kit = rigBuild(r)!.kit
      expect(kit.has('prop'), id).toBe(false)
      expect(kit.has('coat'), id).toBe(false)
      expect(stats(r.root), id).not.toEqual(before)
      let p: THREE.Object3D | null = r.muzzle
      while (p && p !== r.root) p = p.parent
      expect(p, id).toBe(r.root)
      for (let i = 0; i < 30; i++) animateRig(r, 1 / 30, i / 30, 0, 2, 0)
      r.root.updateMatrixWorld(true)
      const mz = r.muzzle.getWorldPosition(new THREE.Vector3())
      // 瞄準時槍口在身體前方、離地 0.7–2.0 m
      expect(mz.z, id).toBeGreaterThan(0.25)
      expect(mz.y, id).toBeGreaterThan(0.7)
      expect(mz.y, id).toBeLessThan(2.0)
    }
  })

  it('動畫：各狀態都不產生 NaN；倒地最終姿勢只取決於 deadT', async () => {
    const { buildHuman, animateRig } = await mods()
    const pose = (r: ReturnType<typeof buildHuman>) => {
      const out: number[] = []
      r.root.traverse((c) => {
        if (!(c as THREE.Mesh).isMesh)
          out.push(...c.position.toArray(), c.rotation.x, c.rotation.y, c.rotation.z)
      })
      return out.map((v) => v.toFixed(4)).join(',')
    }
    for (const cl of CLASSES) {
      const r = buildHuman(cl, '#85ca6e', 4)
      for (const st of [0, 1, 2, 3, 5, 2, 0])
        for (let i = 0; i < 20; i++) animateRig(r, 1 / 30, i / 30, st === 1 ? 3 : 0, st, 0)
      expect(finite(r.root), cl).toBe(true)
    }
    // 走路中倒下 vs 待機中倒下：deadT = 10 的姿勢一樣
    const a = buildHuman('corporal', '#85ca6e', 1)
    const b = buildHuman('corporal', '#85ca6e', 1)
    for (let i = 0; i < 17; i++) animateRig(a, 1 / 30, i / 30, 3, 1, 0)
    for (let i = 0; i < 5; i++) animateRig(b, 1 / 30, i / 30, 0, 2, 0)
    for (const r of [a, b]) {
      for (let i = 0; i < 10; i++) animateRig(r, 1 / 30, 1 + i / 30, 0, 4, i / 30)
      animateRig(r, 0, 5, 0, 4, 10)
    }
    expect(pose(a)).toBe(pose(b))
    expect(a.body.rotation.x).toBeLessThan(-1.3)
  })

  it('倒地後可以烘焙成少數幾個靜態 mesh（units.ts 的 bakeTree）', async () => {
    const { buildHuman, attachSuit, animateRig, bakeTree } = await mods()
    const r = buildHuman('engineer', '#d63caa', 0)
    attachSuit(r, 'suit.pyro', '#d63caa')
    animateRig(r, 0, 1, 0, 4, 10)
    const before = stats(r.root)
    const out = bakeTree(r.root, () => true)
    const after = stats(r.root)
    expect(out.length).toBeGreaterThan(0)
    expect(after.draws).toBeLessThanOrEqual(4)
    expect(after.tris).toBe(before.tris)
  })
})
