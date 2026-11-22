import { useEffect, useRef, useState } from 'preact/hooks'
import { cmdTaps, startInfo, world } from '../../client/session'
import { Input, isPiloting, localNotice } from '../../client/input'
import { sceneBusy } from '../../client/practicePause'
import { PEEK_S, SWEEP_ID, fitDistance, sweepPeek } from '../../client/sweepPeek'
import type { FxEvent } from '../../shared/protocol/messages'
import { getEngine } from '../../render/engine'
import { GameScene } from '../../render/gameScene'
import { Overlay } from '../../render/overlay'
import { Banner, Chat, CommandCard, HudHiddenHint, InvDragGhost, Inventory, Minimap, Portrait, SpecDock, TargetHint, TopBar } from '../hud/Hud'
import { hudHidden } from '../../client/viewPrefs'
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
import { EpGain } from '../hud/EpGain'
import { InGameSettings } from './Settings'
import { GameMenu } from '../hud/GameMenu'
import { t } from '../i18n'
import '../strings/ux6'

/** 開局建場景的時機：先等兩個 rAF（「載入中」覆蓋層畫出來），frames = 已經過的 rAF 數、run = 掛載後要執行的建場景 */
interface Boot {
  frames: number
  run: (() => void) | null
}

/**
 * 「載入中：建立場景…」覆蓋層（純 DOM，建場景佔住主執行緒時也畫得出來）。
 * block = 局中分段建站：擋住滑鼠（畫面還停在上一站，點下去的位置是錯的 zone）；開局時不擋（身分揭露等對話框在上層）。
 */
function SceneLoading({ block }: { block: boolean }) {
  return (
    <div
      data-testid="scene-loading"
      style={{ position: 'absolute', inset: 0, zIndex: 80, display: 'flex', alignItems: 'center', justifyContent: 'center', background: 'var(--bg)', color: 'var(--dim)', fontFamily: 'var(--title)', letterSpacing: '0.08em', fontSize: '18px', pointerEvents: block ? 'auto' : 'none' }}
    >
      {t('load.scene')}
    </div>
  )
}

/** 監控掃描的站內畫面最多拉到多遠（公尺；站內平常的上限是 60）*/
const PEEK_MAX_DIST = 110

/**
 * 駕駛中用「站內監控掃描」（第 6 輪審查 A-P3：畫面在太空層，站內的掃描標記看不到）：送出掃描時記下來，
 * 收到站內的掃描標記（ping 特效）就暫時把畫面切到站內（sweepPeek.ts），鏡頭拉遠到看得到所有標記，結束後恢復原本的縮放。
 * frame() 每幀在 GameScene.update 之前呼叫（換 zone 時 GameScene 會重設鏡頭距離上限，要在切過去之後才套用）；dispose() 解除綁定。
 */
function bindSweepPeek(gs: GameScene): { frame: () => void; dispose: () => void } {
  let zoom: number | null = null
  const tapCmd = (c: { k: string; a?: string }) => {
    if (c.k === 'cast' && c.a === SWEEP_ID && isPiloting()) sweepPeek.arm(performance.now() / 1000)
  }
  const tapFx = (f: FxEvent) => {
    if (f.k !== 'ping' || f.s || !isPiloting()) return
    if (sweepPeek.onPing(f.z, f.x, f.y, gs.zone, performance.now() / 1000) !== 'start') return
    if (zoom === null) zoom = gs.rts.zoom
    gs.rts.zoom = 1
    localNotice.value = { text: 'ux6.sweep.peek', args: { s: PEEK_S }, at: performance.now(), life: PEEK_S * 1000 }
  }
  const frame = () => {
    const v = sweepPeek.current(performance.now() / 1000)
    if (v) {
      // 已經切到站內（GameScene 換 zone 時把上限設回站內的 60 公尺）：拉遠到看得到所有標記
      if (gs.zone === v.zone) gs.rts.maxDist = Math.min(PEEK_MAX_DIST, Math.max(gs.rts.maxDist, fitDistance(v.w, v.h, Math.tan((gs.rts.fov * Math.PI) / 360), gs.camera.aspect || 16 / 9)))
    } else if (zoom !== null) {
      // 結束（時間到、點畫面、空白鍵、Esc）：恢復縮放；距離上限在換回太空層時由 GameScene 設回
      gs.rts.zoom = zoom
      zoom = null
    }
  }
  cmdTaps.push(tapCmd)
  world.fxTaps.push(tapFx)
  return {
    frame,
    dispose: () => {
      sweepPeek.end()
      if (zoom !== null) gs.rts.zoom = zoom
      const i = cmdTaps.indexOf(tapCmd)
      if (i >= 0) cmdTaps.splice(i, 1)
      const j = world.fxTaps.indexOf(tapFx)
      if (j >= 0) world.fxTaps.splice(j, 1)
    },
  }
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
    // 暫時看別的地方：監視器畫面（調查面板）優先，其次是駕駛中監控掃描的站內畫面（sweepPeek.ts）
    gs.viewOverride = () => feedView.value ?? sweepPeek.current(performance.now() / 1000)
    const peek = bindSweepPeek(gs)
    gs.setZones(startInfo.value?.zones ?? [])
    const overlay = new Overlay(wrap.current)
    const unbind = bindFx(gs, world)
    const origUpdate = gs.update.bind(gs)
    bindAudioScene(gs)
    let shown = false
    gs.update = (dt, t) => {
      peek.frame()
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
      peek.dispose()
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
  // 局中分段建站的「載入中」：單機練習自動暫停（practicePause.ts；開局的載入由主機等所有人載入完才開始，不必另外暫停）
  const busy = !!scene?.loading.value
  useEffect(() => {
    sceneBusy.value = busy
  }, [busy])
  useEffect(() => () => void (sceneBusy.value = false), [])
  // 對局中出現新的地點（事件站）
  const zones = startInfo.value?.zones
  useEffect(() => {
    if (scene && zones) scene.setZones(zones)
  }, [scene, zones])
  // 隱藏介面（F9，截圖／實況用）：整層 HUD 藏起來，3D 畫面與名稱疊加層照常（hud7.css）。
  // 掛在 body 上的東西（tooltip、拖曳中的道具）看 <html> 上的 class
  const hidden = hudHidden.value
  useEffect(() => {
    document.documentElement.classList.toggle('xc-hud-hidden', hidden)
  }, [hidden])
  useEffect(
    () => () => {
      document.documentElement.classList.remove('xc-hud-hidden')
      hudHidden.value = false
    },
    [],
  )
  return (
    <div class={'layer' + (hidden ? ' hud-hidden' : '')} ref={wrap}>
      <canvas class="view" ref={ref} data-testid="view" />
      {/* 開局建場景、以及局中第一次進某站時的分段建站（GameScene.loading）：同一個「載入中」覆蓋層 */}
      {(loading || scene?.loading.value) && <SceneLoading block={!loading} />}
      <TopBar />
      <Banner />
      <TargetHint />
      <VendorPanel />
      {/* 觀戰站點清單：外面包一層可收成右上角小標籤（Hud.tsx SpecDock）*/}
      <SpecDock>
        <SpectatorBar />
      </SpecDock>
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
      {scene && <EpGain scene={scene} />}
      <FakeEnd />
      <EndScreen />
      <Guide />
      <RoleReveal />
      <Chat />
      <div class="hud-bottom">
        {scene && <Minimap scene={scene} />}
        <Portrait />
        <div style={{ display: 'flex', gap: '8px', alignItems: 'flex-end' }}>
          <Inventory input={input} scene={scene} />
          <CommandCard input={input} />
        </div>
      </div>
      <InvDragGhost />
      <HudHiddenHint />
    </div>
  )
}
