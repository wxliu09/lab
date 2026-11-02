import { useEffect, useRef, useState } from 'preact/hooks'
import { startInfo, world } from '../../client/session'
import { Input } from '../../client/input'
import { getEngine } from '../../render/engine'
import { GameScene } from '../../render/gameScene'
import { Overlay } from '../../render/overlay'
import { Banner, Chat, CommandCard, Inventory, Minimap, Portrait, TargetHint, TopBar } from '../hud/Hud'
import { bindFx } from '../../render/fxBinding'
import '../../render/fxHandlers'
import { setListener } from '../../audio/sfx'
import { bindAudioScene } from '../../audio/director'
import { VendorPanel } from '../hud/VendorPanel'
import { DeathVote, EndScreen, EvolveMenu, SpectatorBar } from '../hud/Panels'
import { RoleReveal } from '../hud/RoleReveal'
import { Guide } from '../hud/Guide'
import { DoorLog, FeedsPanel, NotesPanel, feedView } from '../hud/Investigation'
import { EnhancerPanel, FakeEnd } from '../hud/Events'
import { ReplayPanel } from '../hud/Replay'
import { FacilityPanel } from '../hud/Facilities'
import { Announcements, CastBar } from '../hud/Announce'
import { WorldHover } from '../hud/WorldHover'

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
    gs.viewOverride = () => feedView.value
    gs.setZones(startInfo.value?.zones ?? [])
    const overlay = new Overlay(wrap.current)
    const unbind = bindFx(gs, world)
    const origUpdate = gs.update.bind(gs)
    bindAudioScene(gs)
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
      bindAudioScene(null)
      engine.setScene(null)
    }
  }, [])
  // 對局中出現新的地點（事件站）
  const zones = startInfo.value?.zones
  useEffect(() => {
    if (scene && zones) scene.setZones(zones)
  }, [scene, zones])
  return (
    <div class="layer" ref={wrap}>
      <canvas class="view" ref={ref} data-testid="view" />
      <TopBar />
      <Banner />
      <TargetHint />
      <VendorPanel />
      <SpectatorBar />
      <NotesPanel />
      <FeedsPanel />
      <ReplayPanel />
      <DoorLog />
      <DeathVote />
      <EvolveMenu />
      <EnhancerPanel />
      <FacilityPanel />
      <Announcements />
      <CastBar />
      {scene && <WorldHover scene={scene} />}
      <FakeEnd />
      <EndScreen />
      <Guide />
      <RoleReveal />
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
