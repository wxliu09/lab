// 地上道具、瓦礫等雜項模型
import * as THREE from 'three'
import { regModel } from './index'
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js'
import { box, rbox, sphere } from '../batch'
import { Mat } from '../materials'
import { ITEMS } from '../../shared/content/registry'
import { ITEM_CAT_COLOR, buildGroundItem } from './groundItems'
import { itemShape } from './itemShape'

/** 地上的道具：依外型分類（itemShape.ts）有 10 種外型、分類色當強調色，慢慢浮動旋轉（groundItems.ts）*/
regModel('groundItem', (_def, s) => {
  const id = (s.d ?? '').replace(/^item:/, '') || String(s.x2?.item ?? '')
  const it = ITEMS.get(id)
  const v = buildGroundItem(itemShape(it), ITEM_CAT_COLOR[it?.cat ?? 'utility'] ?? ITEM_CAT_COLOR.utility, s.i)
  return { root: v.root, height: v.height, update: (t) => v.update(t) }
})

/** 瓦礫：幾塊不規則岩塊／金屬殘骸 */
regModel('rubble', (_def, s) => {
  const root = new THREE.Group()
  const mat = Mat.metal('#4a4642', 0.3)
  const rnd = (k: number) => {
    const x = Math.sin(s.i * 12.9898 + k * 78.233) * 43758.5453
    return x - Math.floor(x)
  }
  for (let i = 0; i < 4; i++) {
    const r = 0.18 + rnd(i) * 0.22
    const rock = new THREE.Mesh(new THREE.DodecahedronGeometry(r, 0), mat)
    rock.position.set((rnd(i + 5) - 0.5) * 0.6, r * 0.6, (rnd(i + 9) - 0.5) * 0.6)
    rock.rotation.set(rnd(i + 1) * 3, rnd(i + 2) * 3, rnd(i + 3) * 3)
    rock.castShadow = true
    rock.receiveShadow = true
    root.add(rock)
  }
  const ember = new THREE.Mesh(sphere(0.05, 6, 4), Mat.emissive('#ff7a2a', 2))
  ember.position.set(0.1, 0.1, 0.05)
  root.add(ember)
  return { root, height: 0.6, update: () => {} }
})

// ───────── 雜物箱（程式放置的 struct.rummage；版面上固定的那幾個由站體的 rummageBox POI 畫）─────────

/** 箱身的漆色（同一站裡混著幾種，和 POI 的軍綠色箱子同一家族）*/
const CRATE_PAINT = ['#5d6a3a', '#5d6a3a', '#6a5236', '#3e5466']
let crateStrap: THREE.BufferGeometry | null = null

/** 蓋緣框＋兩條束帶＋底座護條合成一份幾何（深色金屬，一個 draw call）*/
function crateStrapGeo(): THREE.BufferGeometry {
  if (crateStrap) return crateStrap
  const parts: THREE.BufferGeometry[] = []
  const put = (g: THREE.BufferGeometry, x: number, y: number, z: number) => {
    const c = (g.index ? g.toNonIndexed() : g.clone()).translate(x, y, z)
    for (const k of Object.keys(c.attributes)) if (k !== 'position' && k !== 'normal' && k !== 'uv') c.deleteAttribute(k)
    parts.push(c)
  }
  // 蓋緣：一圈框（俯視時看得到箱蓋的烤漆，不是一整片深色）
  put(box(0.92, 0.05, 0.08), 0, 0.705, 0.32)
  put(box(0.92, 0.05, 0.08), 0, 0.705, -0.32)
  put(box(0.08, 0.05, 0.58), 0.42, 0.705, 0)
  put(box(0.08, 0.05, 0.58), -0.42, 0.705, 0)
  put(box(0.94, 0.05, 0.74), 0, 0.03, 0)
  // 兩條束帶繞過箱蓋
  for (const x of [-0.22, 0.22]) put(box(0.07, 0.69, 0.725), x, 0.36, 0)
  crateStrap = mergeGeometries(parts, false)!
  crateStrap.userData.shared = true
  for (const g of parts) g.dispose()
  return crateStrap
}

/** 雜物箱：比照站體的 rummageBox（軍綠烤漆箱＋深色蓋緣＋琥珀色扣鎖），多兩條束帶；共用幾何與材質，3 個 draw call */
regModel('crate', (_def, s) => {
  const root = new THREE.Group()
  const body = new THREE.Mesh(rbox(0.9, 0.7, 0.7, 0.05), Mat.paint(CRATE_PAINT[s.i % CRATE_PAINT.length], 0.6))
  body.position.y = 0.35
  const strap = new THREE.Mesh(crateStrapGeo(), Mat.metal('#2e343b', 0.75))
  const latch = new THREE.Mesh(box(0.25, 0.1, 0.02), Mat.emissive('#ffc23d', 1.5))
  latch.position.set(0, 0.5, 0.36)
  for (const m of [body, strap]) {
    m.castShadow = true
    m.receiveShadow = true
  }
  root.add(body, strap, latch)
  return { root, height: 0.75, update: () => {} }
})
