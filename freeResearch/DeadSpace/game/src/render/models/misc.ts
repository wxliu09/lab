// 地上道具、瓦礫等雜項模型
import * as THREE from 'three'
import { regModel } from './index'
import { sphere } from '../batch'
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
