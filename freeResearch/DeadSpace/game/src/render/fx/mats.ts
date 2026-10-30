// 特效與裝置共用的少量實體材質（石材、濕潤肉質）：以程序化雜訊做底色與凹凸，不依賴外部素材
import * as THREE from 'three'
import { withFog } from '../materials'
import { fxTex } from './tex'

let stoneM: THREE.MeshStandardMaterial | null = null
let fleshM: THREE.MeshPhysicalMaterial | null = null
let rockM: THREE.MeshStandardMaterial | null = null

/** 石像材質（石化）：灰褐雜訊底色＋凹凸＋高粗糙度 */
export function stoneMat(): THREE.MeshStandardMaterial {
  if (!stoneM) {
    const n = fxTex('noise', true)
    stoneM = withFog(new THREE.MeshStandardMaterial({ color: '#9a958a', map: n, bumpMap: n, bumpScale: 2.2, roughness: 0.95, metalness: 0 }))
    stoneM.userData.keep = true
  }
  return stoneM
}

/** 投擲用岩塊 */
export function rockMat(): THREE.MeshStandardMaterial {
  if (!rockM) {
    const n = fxTex('noise', true)
    rockM = withFog(new THREE.MeshStandardMaterial({ color: '#7a7064', map: n, bumpMap: n, bumpScale: 3, roughness: 0.92, metalness: 0, flatShading: true }))
    rockM.userData.keep = true
  }
  return rockM
}

/** 濕潤的肉塊（蟲餌、肉瘤）*/
export function fleshMat(): THREE.MeshPhysicalMaterial {
  if (!fleshM) {
    const n = fxTex('noise', true)
    fleshM = withFog(new THREE.MeshPhysicalMaterial({ color: '#9a3a4a', map: n, bumpMap: n, bumpScale: 1.5, roughness: 0.38, metalness: 0, clearcoat: 0.85, clearcoatRoughness: 0.25, emissive: '#4a0a1a', emissiveIntensity: 0.5 }))
    fleshM.userData.keep = true
  }
  return fleshM
}
