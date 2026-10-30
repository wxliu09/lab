// sim 一次性特效事件 → 視覺特效
import type { FxEvent } from '../shared/protocol/messages'
import type { ClientWorld } from '../client/world'
import type { GameScene } from './gameScene'

export type FxHandler = (gs: GameScene, w: ClientWorld, f: FxEvent) => void
export const FX_HANDLERS = new Map<string, FxHandler>()

export function regFx(kind: string, h: FxHandler): void {
  FX_HANDLERS.set(kind, h)
}

export function bindFx(gs: GameScene, w: ClientWorld): () => void {
  const run = (f: FxEvent) => {
    const h = FX_HANDLERS.get(f.k)
    if (h) {
      try {
        h(gs, w, f)
      } catch (e) {
        if (__DEV__) console.error(e)
      }
    }
  }
  for (const f of w.fxQueue.splice(0)) run(f)
  w.onFx = run
  return () => {
    w.onFx = null
  }
}
