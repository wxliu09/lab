// 地上道具、瓦礫等雜項模型
import * as THREE from 'three'
import { regModel } from './index'
import { rbox, sphere } from '../batch'
import { Mat } from '../materials'
import { ITEMS } from '../../shared/content/registry'

const CAT_COLOR: Record<string, string> = {
  medical: '#5cf2a5',
  combat: '#ff7a2a',
  utility: '#9fe7ff',
  suit: '#ffc23d',
  key: '#ffe08a',
  module: '#b28cff',
  quest: '#ff7eb6',
  fun: '#ff7eb6',
  detect: '#33ffd1',
}

/** 地上的道具：小型補給箱＋分類色光暈，慢慢浮動 */
regModel('groundItem', (_def, s) => {
  const id = (s.d ?? '').replace(/^item:/, '') || String(s.x2?.item ?? '')
  const it = ITEMS.get(id)
  const col = CAT_COLOR[it?.cat ?? 'utility'] ?? '#9fe7ff'
  const root = new THREE.Group()
  const g = new THREE.Group()
  root.add(g)
  const isSuit = it?.cat === 'suit'
  const body = new THREE.Mesh(isSuit ? rbox(0.5, 0.18, 0.4, 0.05) : rbox(0.26, 0.2, 0.26, 0.04), Mat.metal(isSuit ? '#5a6068' : '#7a838c', 0.6))
  body.castShadow = true
  g.add(body)
  const band = new THREE.Mesh(rbox(isSuit ? 0.52 : 0.28, 0.04, isSuit ? 0.42 : 0.28, 0.02), Mat.emissive(col, 2.2))
  g.add(band)
  const halo = new THREE.Mesh(new THREE.RingGeometry(0.28, 0.36, 24), new THREE.MeshBasicMaterial({ color: col, transparent: true, opacity: 0.5, depthWrite: false, blending: THREE.AdditiveBlending }))
  halo.rotation.x = -Math.PI / 2
  halo.position.y = 0.02
  root.add(halo)
  return {
    root,
    height: 0.5,
    update(t) {
      g.position.y = 0.2 + Math.sin(t * 2.2 + s.i) * 0.04
      g.rotation.y = t * 0.8
      ;(halo.material as THREE.MeshBasicMaterial).opacity = 0.3 + Math.sin(t * 3) * 0.15
    },
  }
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
