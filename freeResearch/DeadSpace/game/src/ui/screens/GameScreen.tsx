import { useEffect, useRef, useState } from 'preact/hooks'
import { startInfo, world } from '../../client/session'
import { Input } from '../../client/input'
import { getEngine } from '../../render/engine'
import { GameScene } from '../../render/gameScene'
import { Overlay } from '../../render/overlay'
import { Banner, Chat, CommandCard, Inventory, Minimap, Portrait, TargetHint, TopBar } from '../hud/Hud'
import { bindFx } from '../../render/fxBinding'
import '../../render/fxHandlers'
import { setListener, startAmbient, stopAmbient } from '../../audio/sfx'
import { VendorPanel } from '../hud/VendorPanel'
import { DeathVote, EndScreen, EvolveMenu, SpectatorBar } from '../hud/Panels'

export function GameScreen() {
  const ref = useRef<HTMLCanvasElement>(null)
  const wrap = useRef<HTMLDivElement>(null)
  const [scene, setScene] = useState<GameScene | null>(null)
  const [input, setInput] = useState<Input | null>(null)
  useEffect(() => {
    const c = ref.current
    if (!c || !wrap.current) return
    const engine = getEngine(c)
    const gs = new GameScene(world)
    gs.setZones(startInfo.value?.zones ?? [])
    const overlay = new Overlay(wrap.current)
    const unbind = bindFx(gs, world)
    const origUpdate = gs.update.bind(gs)
    startAmbient('station')
    gs.update = (dt, t) => {
      origUpdate(dt, t)
      setListener(gs.rts.tx, gs.rts.ty)
      engine.damagePulse = Math.max(engine.damagePulse, gs.damage)
      gs.damage = 0
      overlay.draw(gs, world)
    }
    gs.onZoneChange = () => engine.setScene(gs)
    engine.setScene(gs)
    engine.start()
    const inp = new Input(c, gs)
    setScene(gs)
    setInput(inp)
    if (__TEST_HOOKS__) (window as unknown as Record<string, unknown>).__xcScene = gs
    return () => {
      inp.dispose()
      overlay.dispose()
      unbind()
      stopAmbient()
      engine.setScene(null)
    }
  }, [])
  return (
    <div class="layer" ref={wrap}>
      <canvas class="view" ref={ref} data-testid="view" />
      <TopBar />
      <Banner />
      <TargetHint />
      <VendorPanel />
      <SpectatorBar />
      <DeathVote />
      <EvolveMenu />
      <EndScreen />
      <Chat />
      <div class="hud-bottom">
        {scene && <Minimap scene={scene} />}
        <Portrait />
        <div style={{ display: 'flex', gap: '8px', alignItems: 'flex-end' }}>
          <Inventory input={input} />
          <CommandCard input={input} />
        </div>
      </div>
    </div>
  )
}
