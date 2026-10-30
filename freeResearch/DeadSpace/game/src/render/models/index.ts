// 非人形模型的登錄表：每種 model id 一個建構函式
import * as THREE from 'three'
import type { UnitDef } from '../../shared/content/types'
import type { SnapEntity } from '../../shared/protocol/messages'
import { capsule, sphere } from '../batch'
import { Mat } from '../materials'

export interface ModelView {
  root: THREE.Group
  height: number
  update(t: number, dt: number, speed: number, state: number): void
}

export type ModelBuilder = (def: UnitDef | undefined, s: SnapEntity) => ModelView

export const MODELS = new Map<string, ModelBuilder>()

export function regModel(id: string, b: ModelBuilder): void {
  MODELS.set(id, b)
}

/** 未知模型：有機膠囊＋脈動核心（至少有材質層次，不是灰盒子）*/
function fallback(def: UnitDef | undefined): ModelView {
  const root = new THREE.Group()
  const r = def?.radius ?? 0.4
  const body = new THREE.Mesh(capsule(r * 0.8, r * 1.2, 6, 14), Mat.metal('#4a535c', 0.5))
  body.position.y = r * 1.4
  body.castShadow = true
  const core = new THREE.Mesh(sphere(r * 0.35, 12, 10), Mat.emissive('#9fe7ff', 2))
  core.position.set(0, r * 1.6, r * 0.6)
  root.add(body, core)
  return {
    root,
    height: r * 3,
    update(t) {
      core.scale.setScalar(1 + Math.sin(t * 4) * 0.1)
    },
  }
}

export function buildModel(id: string, def: UnitDef | undefined, s: SnapEntity): ModelView {
  const b = MODELS.get(id)
  return b ? b(def, s) : fallback(def)
}
