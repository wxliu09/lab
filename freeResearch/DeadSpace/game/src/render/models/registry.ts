// 模型登錄表本體（index.ts 轉出）：新的模型檔從這裡 import regModel，
// 才能讓 index.ts 反過來 import 它們做註冊，而不會在循環 import 時碰到 MODELS 還在 TDZ。
import type * as THREE from 'three'
import type { UnitDef } from '../../shared/content/types'
import type { SnapEntity } from '../../shared/protocol/messages'

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
