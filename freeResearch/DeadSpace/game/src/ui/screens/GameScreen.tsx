import { useEffect, useRef, useState } from 'preact/hooks'
import { startInfo, world } from '../../client/session'
import { Input } from '../../client/input'
import { getEngine } from '../../render/engine'
import { GameScene } from '../../render/gameScene'
import { Overlay } from '../../render/overlay'
import { Banner, Chat, CommandCard, InvDragGhost, Inventory, Minimap, Portrait, TargetHint, TopBar } from '../hud/Hud'
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
import { InGameSettings } from './Settings'
import { GameMenu } from '../hud/GameMenu'
import { t } from '../i18n'

/** 開局建場景的時機：先等兩個 rAF（「載入中」覆蓋層畫出來），frames = 已經過的 rAF 數、run = 掛載後要執行的建場景 */
interface Boot {
  frames: number
  run: (() => void) | null
}

export function GameScreen() {
  const ref = useRef<HTMLCanvasElement>(null)
  const wrap = useRef<HTMLDivElement>(null)
  const [scene, setScene] = useState<GameScene | null>(null)
  const [input, setInput] = useState<Input | null>(null)
  const [loading, setLoading] = useState(true)
  // 建場景（WebGL context、站體、shader）會佔住主執行緒好幾秒（軟體繪圖要半分鐘以上）：先讓純 DOM 的「載入中」覆蓋層畫出來，
  // 兩個 rAF 之後才開始建。第一次 render 就排 rAF（比第一份快照排的 loaded 回報早），建場景與第一幀才會在 loaded 送出前做完。
  const boot = useRef<Boot | null>(null)
  if (!boot.current) {
    const b: Boot = { frames: 0, run: null }
    boot.current = b
    requestAnimationFrame(() =>
      requestAnimationFrame(() => {
        b.frames = 2
        b.run?.()
      }),
    )
  }
  useEffect(() => {
    let cleanup: (() => void) | null = null
    let dead = false
    const run = () => {
      if (!dead && !cleanup) cleanup = setup()
    }
    const b = boot.current!
    if (b.frames >= 2) run()
    else b.run = run
    return () => {
      dead = true
      b.run = null
      cleanup?.()
    }
  }, [])
  /** 建場景、開始渲染；回傳卸載時的清理 */
  function setup(): (() => void) | null {
    const c = ref.current
    if (!c || !wrap.current) return null
    const engine = getEngine(c)
    const gs = new GameScene(world)
    gs.viewOverride = () => feedView.value
    gs.setZones(startInfo.value?.zones ?? [])
    const overlay = new Overlay(wrap.current)
    const unbind = bindFx(gs, world)
    const origUpdate = gs.update.bind(gs)
    bindAudioScene(gs)
    let shown = false
    gs.update = (dt, t) => {
      origUpdate(dt, t)
      // 第一次顯示出 zone（站體已建好）：這一幀畫完後拿掉載入覆蓋層
      if (!shown && gs.zone >= 0) {
        shown = true
        setLoading(false)
      }
      setListener(gs.rts.tx, gs.rts.ty)
      engine.damagePulse = Math.max(engine.damagePulse, gs.damage)
      gs.damage = 0
      overlay.draw(gs, world)
    }
    // 換 zone：引擎只換色彩分級，不重建後處理
    gs.onZoneChange = () => engine.setScene(gs)
    engine.setScene(gs)
    // 立刻同步畫第一幀（建站體、編 shader），不等下一個 rAF
    engine.start(true)
    // 開局後利用空閒時間預建本局其他站點（貼圖上傳、shader 預編譯），第一次進站不卡主執行緒
    gs.startPrebuild(engine)
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
      gs.onZoneChange = null
      gs.viewOverride = null
      // 舊 canvas 的 WebGL context 會被模組層級共用資源（貼圖、幾何）的 dispose listener 留住；
      // 先把 canvas 從 HUD 的 DOM 樹拿掉，那串已脫離文件的 HUD（以及它的 listener 閉包）才不會跟著被留住
      c.remove()
      if (__TEST_HOOKS__ && (window as unknown as Record<string, unknown>).__xcScene === gs) delete (window as unknown as Record<string, unknown>).__xcScene
    }
  }
  // 對局中出現新的地點（事件站）
  const zones = startInfo.value?.zones
  useEffect(() => {
    if (scene && zones) scene.setZones(zones)
  }, [scene, zones])
  return (
    <div class="layer" ref={wrap}>
      <canvas class="view" ref={ref} data-testid="view" />
      {loading && (
        <div
          data-testid="scene-loading"
          style={{ position: 'absolute', inset: 0, zIndex: 80, display: 'flex', alignItems: 'center', justifyContent: 'center', background: 'var(--bg)', color: 'var(--dim)', fontFamily: 'var(--title)', letterSpacing: '0.08em', fontSize: '18px', pointerEvents: 'none' }}
        >
          {t('load.scene')}
        </div>
      )}
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
      <GameMenu />
      <InGameSettings />
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
      <InvDragGhost />
    </div>
  )
}
