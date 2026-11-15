// 遊戲 HUD（致敬 WC3 版面）：上方資訊列、左下小地圖、中下頭像與數值、右下指令卡＋背包、左側聊天
import { useEffect, useRef, useState, useLayoutEffect } from 'preact/hooks'
import { Stability } from './Events'
import { audioPrefs, setAudioPref } from '../../audio/sfx'
import { PLAYER_COLORS } from '../../shared/constants'
import { ABILITIES, ITEMS, UNITS, VENDORS, abilityDef, buffDef, itemDef } from '../../shared/content/registry'
import { entDefName, localizeName, suitColor, textColorOf } from '../names'
import { itemTip } from '../itemTip'
import { CdFace, fmtSecs } from './CdFace'
import { Cell } from '../../shared/layout'
import type { ChatChannel, ChatLine } from '../../shared/protocol/messages'
import { chatLog, isHost, send, sendCmd, snapTick, startInfo, world, connLost, hostStall, leave, notice, noticeKey, selfInLoadWait, hostGone, endResult, hostAbortEnd, hostConflictLive, hostLeaving } from '../../client/session'
import { SIM_ERROR_KEY } from '../../net/hostRelay'
import { gpuLost } from '../../render/engine'
import { quality, setQuality } from '../../render/quality'
import { aimAbility, chatOpen, evolveOpen, isPiloting, localNotice, mapAim, mapPick, menuOpen, selected, targetMode, type AimMode, type Input } from '../../client/input'
import { stationDefOf, type GameScene } from '../../render/gameScene'
import { lang, listJoin, loc, sysText, t } from '../i18n'
import { sampleName } from '../../shared/sysArgs'
import { Icon } from '../icons'
import { TopSlot } from './Announce'
import { hideTip, showCursorTip, tipProps, titleTips, type LegendRow, type TipData } from '../tooltip'
import { uiZoom } from '../uiScale'
import { createPortal } from 'preact/compat'
import { invDrag } from '../../client/give'
import { roomAt } from '../../shared/layout'
import { settingsOpen } from '../screens/Settings'
import { MINIMAP, MINIMAP_PLAYERS_SWATCH, legendSwatch, poiColor, poiShape } from '../minimapColors'
import { guideOpen, helpTab, legendLabelKey, legendPois } from './Guide'
import { codexOpen } from './Codex'
import { soloPracticeNow, watchPracticePause } from '../../client/practicePause'
import { deathLines, deathScreenOnly } from '../../client/deathNote'
import { EXPOSING_ABILITIES, watcherCount } from '../../client/exposure'
import { DEFAULT_BODY_R, minimapMoveTarget } from '../../render/moveTargets'
import { chatFade } from '../../client/chatFade'
import { bubbleOnly, hiddenByMute } from '../../client/chatFilter'
import { isMuted, mutedNames } from '../../client/mute'
import { pingBoard, pingColor, pingLines, pingTaps, sendMapPing } from '../../client/mapPing'
import { pingLook, type MapPing } from '../../client/pingBoard'
import { pingFx } from '../../render/pingFx'
import { notesOpen } from './Investigation'
import '../strings/art3'
import '../ui4.css'

function fmtTime(s: number): string {
  const m = Math.floor(s / 60)
  return `${m}:${String(Math.floor(s % 60)).padStart(2, '0')}`
}

// 文字用的陣營色（主色 #7a3cff／#c8323c 在深色底上對比不到 4.5:1）
const ROLE_COLOR: Record<string, string> = {
  human: '#9fe7ff',
  xeno: '#b28cff',
  mutant: '#ff6b72',
  android: '#ffb000',
  spectator: '#a7b0ba',
}

/** 頂列的身分：被轉化的人（spawn）role 仍是 human，改看私有狀態的陣營，寫「異形 spawn」／「變種人 spawn」（同目標面板）*/
function roleLabel(me: typeof world.me): { text: string; color: string } {
  if (me.spawn && (me.faction === 'xeno' || me.faction === 'mutant'))
    return { text: t(me.faction === 'xeno' ? 'guide.id.spawnXeno' : 'guide.id.spawnMutant'), color: ROLE_COLOR[me.faction] }
  return { text: me.role ? t('role.' + me.role) : '', color: ROLE_COLOR[me.role ?? 'human'] }
}

/** 門禁紀錄的剪影（Investigation.tsx 的 DoorLog 用原生 title 標示）：改成遊戲 tooltip 時補一句說明這是什麼 */
const DOOR_SILS = ['crew', 'rig', 'creature', 'machine', 'unknown']
titleTips.push((title) => (DOOR_SILS.some((k) => t('door.sil.' + k) === title) ? { sub: t('door.log'), body: t('r3b.doorLog.body') } : null))

/**
 * 單機練習暫停中的標示：掛在 body 上、蓋在所有對話框之上（遊戲選單、說明、圖鑑都是全畫面遮罩）。
 * 看主機回報的 w.pz（主機真的停了才顯示）。pz 不是 signal，要由頂列當成 prop 傳進來：讀了 signal 的元件在 props 沒變時
 * 不會跟著父元件重繪（@preact/signals 的最佳化），直接讀 world.w.pz 會卡在舊的狀態
 */
function PauseBadge({ on }: { on: boolean }) {
  if (!on || !soloPracticeNow()) return null
  const z = uiZoom.value
  return createPortal(
    <div class="pause-badge" data-testid="practice-paused" role="status" style={{ fontSize: `${Math.round(17 * z)}px`, top: `${Math.round(8 * z)}px` }}>
      <span class="pause-ico" aria-hidden="true">
        ❚❚
      </span>
      <span>
        <b>{t('r3b.pause.title')}</b>
        <span class="pause-sub" style={{ fontSize: `${Math.round(13 * z)}px` }}>
          {t('r3b.pause.sub')}
        </span>
      </span>
    </div>,
    document.body,
  )
}

/** 會讓單機練習暫停的介面開著：遊戲選單（Esc）、說明（G）、圖鑑（F1）、設定（四個都讀，訂閱它們的 signal）*/
function pauseUiOpen(): boolean {
  const open = [menuOpen.value, guideOpen.value, codexOpen.value, settingsOpen.value]
  return open.some(Boolean)
}

export function TopBar() {
  void snapTick.value
  // 單機練習：打開遊戲選單、說明、圖鑑、設定時請主機暫停，全部關掉時繼續（practicePause.ts）
  useEffect(() => watchPracticePause(pauseUiOpen), [])
  const me = world.me
  const w = world.w
  const rl = roleLabel(me)
  const fs = !!document.fullscreenElement
  return (
    <div class="panel hud-top" data-testid="game">
      <span {...tipProps(() => ({ title: t('tip.time.title'), body: t('tip.time.body') }))}>
        {t('game.time')} <b>{fmtTime(w.t ?? 0)}</b>
      </span>
      <span {...tipProps(() => ({ title: t('tip.stab.title'), body: t('tip.stab.body') }))}>
        <Stability />
      </span>
      {w.al && (
        <span data-testid="alive" {...tipProps(() => ({ title: t('ui4.alive.title'), body: t('r3b.alive.body') }))}>
          <span class="alive-ico" aria-label={t('ui4.alive')}>
            <Icon name="crew" size={15} color="#9fb3c2" />
          </span>{' '}
          <b>{w.al[0]}</b>
          <span class="dim">/{w.al[1]}</span>
        </span>
      )}
      <span
        data-testid="role"
        style={{ color: rl.color, fontFamily: 'var(--title)', letterSpacing: '0.1em' }}
        {...tipProps(() => (me.role ? { title: t('tip.role.title'), body: t('tip.role.body'), color: roleLabel(me).color } : null))}
      >
        {rl.text}
      </span>
      {(me.role === 'xeno' || me.role === 'mutant' || me.role === 'android' || me.spawn) && (
        <span style={{ cursor: 'pointer' }} data-testid="ep" onClick={() => (evolveOpen.value = !evolveOpen.value)} {...tipProps(() => ({ title: t('tip.ep.title'), body: t('tip.ep.body'), tag: 'V' }))}>
          {t('hud.ep')} <b>{me.ep ?? 0}</b>
          {me.epNext ? <span class="dim">/{me.epNext}</span> : null}
        </span>
      )}
      {w.pz && <span style={{ color: 'var(--warn)' }}>{t('hud.paused')}</span>}
      <PauseBadge on={!!w.pz} />
      {/* 調查筆記：原本只能按 Tab 開，只用滑鼠的人找不到 */}
      <button
        class={'small ghost icon-btn notes-btn' + (notesOpen.value ? ' on' : '')}
        data-testid="notes-open"
        aria-label={t('notes.title')}
        aria-pressed={notesOpen.value}
        onClick={(e) => {
          notesOpen.value = !notesOpen.value
          // 不留焦點：之後按空白鍵（回鏡頭）不會又按到這顆按鈕
          ;(e.currentTarget as HTMLElement).blur()
        }}
        {...tipProps(() => ({ title: t('notes.title'), body: t('r4c.notes.body') }))}
      >
        <NotesGlyph on={notesOpen.value} />
      </button>
      <button class="small ghost icon-btn" data-testid="mute" onClick={() => setAudioPref('muted', !audioPrefs.value.muted)} {...tipProps(() => ({ title: t('hud.mute') }))}>
        <Icon name={audioPrefs.value.muted ? 'muted' : 'sound'} size={18} color={audioPrefs.value.muted ? '#8b9aa8' : '#9fe7ff'} />
      </button>
      <button
        class="small ghost icon-btn"
        data-testid="fullscreen"
        onClick={() => (fs ? document.exitFullscreen() : document.documentElement.requestFullscreen?.())?.catch?.(() => {})}
        {...tipProps(() => ({ title: fs ? t('hud.exitFullscreen') : t('hud.fullscreen') }))}
      >
        <Icon name={fs ? 'shrink' : 'expand'} size={18} color="#9fe7ff" />
      </button>
      <button class="small ghost icon-btn" data-testid="settings-open" onClick={() => (settingsOpen.value = true)} {...tipProps(() => ({ title: t('menu.settings') }))}>
        <Icon name="gear" size={18} color="#9fe7ff" />
      </button>
    </div>
  )
}

/** 調查筆記按鈕的圖示（同 Icon 的線條＋發光風格）：夾板上的清單，開著時填色 */
function NotesGlyph({ on }: { on: boolean }) {
  const c = on ? '#5cf2a5' : '#9fe7ff'
  return (
    <svg width={18} height={18} viewBox="0 0 24 24" aria-hidden="true" style={{ filter: `drop-shadow(0 0 3px ${c})` }}>
      <path
        d="M9 4H6.5A1.5 1.5 0 005 5.5v14A1.5 1.5 0 006.5 21h11a1.5 1.5 0 001.5-1.5v-14A1.5 1.5 0 0017.5 4H15M9 3h6v3H9zM8.5 10.5l1.2 1.2 2-2.2M13.5 10.8H16M8.5 15.5l1.2 1.2 2-2.2M13.5 15.8H16"
        fill={on ? 'rgba(92,242,165,0.14)' : 'none'}
        stroke={c}
        stroke-width="1.6"
        stroke-linecap="round"
        stroke-linejoin="round"
      />
    </svg>
  )
}

/**
 * 主機確定離開了（client/hostGone.ts）：這局沒辦法再繼續，畫面會一直停著。說明原因、給「回主選單」。
 * 蓋在所有對話框之上（z 60）；主機其實只是卡住、之後又連回來時自動消失。
 */
function HostGoneDialog() {
  const btn = useRef<HTMLButtonElement>(null)
  useLayoutEffect(() => btn.current?.focus(), [])
  const ended = !!endResult.value
  return (
    <div class="modal-back host-gone-back" data-testid="host-gone" style={{ zIndex: 60 }}>
      <div class="panel modal host-gone" role="alertdialog" aria-modal="true" aria-labelledby="host-gone-title" aria-describedby="host-gone-body">
        <h2 id="host-gone-title">{t('r4c.hostGone.title')}</h2>
        <p id="host-gone-body" class="host-gone-body">
          {t(ended ? 'r4c.hostGone.bodyEnded' : 'r4c.hostGone.body')}
        </p>
        <p class="dim host-gone-why">{t('r4c.hostGone.why')}</p>
        <div class="row">
          <button ref={btn} class="primary grow" data-testid="host-gone-leave" onClick={() => leave()}>
            {t('r4c.hostGone.leave')}
          </button>
        </div>
      </div>
    </div>
  )
}

export function Banner() {
  void snapTick.value
  const me = world.me
  // 主機模擬不可恢復的錯誤：主機以 notice 通知所有人（含自己）。這兩種提示放在對話框（z-index 50）之上，按鈕隨時按得到
  if (notice.value && noticeKey.value === SIM_ERROR_KEY)
    return (
      <div class="panel banner banner-critical" data-testid="sim-error" style={{ zIndex: 60 }}>
        {t(SIM_ERROR_KEY)}{' '}
        <button class="small" onClick={() => leave(false)}>
          {t('net.simErrorBack')}
        </button>
      </div>
    )
  // 主機中止了這局（第 5 輪）：客人收到的結算已經揭曉所有人的身分。結算畫面開著時不跳「主機已離開」對話框蓋住它
  // （主機接著就會斷線）；關掉結算畫面後改用這裡的橫幅說明，並給「回主選單」
  const aborted = hostAbortEnd.value && !isHost.value
  if (aborted && !endResult.value)
    return (
      <div class="panel banner banner-critical host-aborted" data-testid="host-aborted" role="status" style={{ zIndex: 60 }}>
        {t('r5c.end.hostAborted')}{' '}
        <button class="small" onClick={() => leave()}>
          {t('r4c.hostGone.leave')}
        </button>
        <div class="banner-sub">{t('r5c.end.hostAbortedSub')}</div>
      </div>
    )
  // 主機確定離開了（失聯超過寬限時間）：對話框取代「連線中斷」橫幅；短暫失聯照樣只顯示橫幅、自動重連
  if (hostGone.value && !isHost.value && !aborted) return <HostGoneDialog />
  if (gpuLost.value)
    return (
      <div class="panel banner banner-critical" data-testid="gpu-lost" style={{ zIndex: 60 }}>
        {t('gpu.lost')}{' '}
        <button class="small" onClick={() => location.reload()}>
          {t('gpu.reload')}
        </button>{' '}
        {quality.value !== 'low' && (
          <button class="small ghost" onClick={() => setQuality('low')}>
            {t('gpu.lower')}
          </button>
        )}
      </div>
    )
  // 主機在多人對局中離開：先中止這局、讓客人收到結算，約 0.3 秒後回主選單（session.ts leaveGame）
  if (hostLeaving.value && isHost.value)
    return (
      <div class="panel banner" data-testid="host-leaving" style={{ zIndex: 60 }}>
        {t('r5c.leaving')}
      </div>
    )
  // 結算畫面開著（主機中止）：主機斷線是預期的，不顯示「連線中斷、重連中」
  if (aborted) return null
  // 短暫失聯：自動重連中。客人多一行說明：主機真的走了的話，稍後會跳出對話框讓你回主選單（不用一直盯著凍結的畫面）。
  // 失聯期間有別的連線自稱主機（net/client.ts 已經忽略它）：多一行警告
  if (connLost.value)
    return (
      <div class="panel banner" data-testid="host-lost">
        {t('net.hostLost')}
        {!isHost.value && <div class="banner-sub">{t('r4c.hostLost.wait')}</div>}
        {hostConflictLive.value && (
          <div class="banner-sub banner-warn" data-testid="host-conflict">
            {t('r5c.hostConflict')}
          </div>
        )}
      </div>
    )
  // 入座後有別的連線自稱主機：已經忽略它的所有訊息（net/client.ts），這裡只提醒一陣子
  if (hostConflictLive.value && !isHost.value)
    return (
      <div class="panel banner" data-testid="host-conflict" role="status">
        {t('r5c.hostConflict')}
      </div>
    )
  // 開局等所有人載入完才開始：畫面靜止不是當機。主機的人數裡可能算著自己（還沒回報、或剛回報主機還沒收到）：
  // 扣掉自己才是「其他玩家」；單機練習只有自己一個真人，不會有「等待其他玩家」
  const others = othersLoading(Number(world.w.ld ?? 0))
  if (others > 0)
    return (
      <div class="panel banner" data-testid="load-wait">
        {t('net.waitLoad', { n: others })}
      </div>
    )
  if (world.w.bg && !isHost.value) return <div class="panel banner">{t('net.hostBg')}</div>
  if (hostStall.value && !isHost.value)
    return (
      <div class="panel banner" data-testid="host-loading">
        {t('net.hostLoading')}
      </div>
    )
  // 死亡畫面：觀戰說明＋死因（死因只在這裡顯示；公告、提示、聊天紀錄都不重複，見 client/deathNote.ts）。
  // 出局者（死亡即退出）不能觀戰、也不能和死者聊天：出局對話框已經說明，這裡只留死因（浮在對話框遮罩之上）
  if (me.alive === false && me.role !== 'spectator') {
    const head = me.booted ? '' : me.coreWait ? t('hud.coreWait') : t('hud.dead')
    const causes = deathLines.value
    if (!head && !causes.length) return null
    return (
      <div class="panel banner death-banner" data-testid="death-banner" style={me.booted ? { zIndex: 51 } : undefined}>
        {head && <div>{head}</div>}
        {causes.map((c, i) => (
          <div key={i} class={'death-cause' + (i === 0 ? ' first' : '')} data-testid={i === 0 ? 'death-cause' : undefined}>
            {sysText(c)}
          </div>
        ))}
      </div>
    )
  }
  return null
}

/** 開局等載入：主機回報的人數（ld）扣掉自己之後，還在等幾位其他玩家（單機練習恆為 0）*/
export function othersLoading(ld: number, humans = (startInfo.value?.players ?? []).filter((p) => !p.bot).length, selfCounted = selfInLoadWait()): number {
  if (ld <= 0 || humans <= 1) return 0
  return Math.max(0, ld - (selfCounted ? 1 : 0))
}

export function Minimap(props: { scene: GameScene }) {
  const ref = useRef<HTMLCanvasElement>(null)
  const base = useRef<{ zone: number; img: HTMLCanvasElement } | null>(null)
  // 繪圖與事件處理都經由 ref 取場景，卸載時清掉：離開對局後殘留在（已脫離文件的）DOM 上的 listener 不會再留住舊局的整個場景
  const sceneRef = useRef<GameScene | null>(props.scene)
  sceneRef.current = props.scene
  useEffect(
    () => () => {
      sceneRef.current = null
    },
    [],
  )
  // 小地圖信號（client/mapPing.ts）：場景地面上也畫一個圈（只在那個 zone 正在顯示時看得到）
  useEffect(() => {
    const tap = (p: MapPing) => {
      const sc = sceneRef.current
      if (sc) pingFx(sc.fx, p.z, p.x, p.y, pingColor(p.color))
    }
    pingTaps.push(tap)
    return () => {
      const i = pingTaps.indexOf(tap)
      if (i >= 0) pingTaps.splice(i, 1)
    }
  }, [])
  useEffect(() => {
    let raf = 0
    const draw = () => {
      raf = requestAnimationFrame(draw)
      const scene = sceneRef.current
      if (!scene) return
      const c = ref.current
      if (c && scene.zone === 0) {
        drawSpace(c, scene)
        return
      }
      const info = scene.zones.get(scene.zone)
      if (!c || !info) return
      const l = info.layout
      const W = c.clientWidth
      const H = c.clientHeight
      if (c.width !== W * 2) {
        c.width = W * 2
        c.height = H * 2
      }
      const x = c.getContext('2d')!
      const k = Math.min((c.width - 8) / l.w, (c.height - 8) / l.h)
      const ox = (c.width - l.w * k) / 2
      const oy = (c.height - l.h * k) / 2
      if (!base.current || base.current.zone !== scene.zone) {
        const b = document.createElement('canvas')
        b.width = c.width
        b.height = c.height
        const bx = b.getContext('2d')!
        for (let row = 0; row < l.h; row++)
          for (let col = 0; col < l.w; col++) {
            const cell = l.cells[row * l.w + col] as Cell
            if (cell === Cell.Void) continue
            bx.fillStyle = cell === Cell.Wall ? MINIMAP.wall : cell === Cell.Door ? MINIMAP.door : cell === Cell.Window ? MINIMAP.window : MINIMAP.floor
            bx.fillRect(ox + col * k, oy + row * k, Math.ceil(k), Math.ceil(k))
          }
        for (const p of l.pois) {
          const c = poiColor(p.def.kind, p.def.ref)
          if (!c) continue
          const px = ox + (p.col + 0.5) * k
          const py = oy + (p.row + 0.5) * k
          const shape = poiShape(p.def.kind, p.def.ref)
          if (shape === 'hollowSquare') {
            // 控制台：空心方框（minimapColors.ts poiShape）。實心圓點是玩家，不要讓人把控制台看成另一個船員
            const lw = Math.max(2.5, k * 0.3)
            const r = k * 0.95 + 2.5
            bx.lineWidth = lw + 2
            bx.strokeStyle = 'rgba(0,0,0,0.75)'
            bx.strokeRect(px - r, py - r, r * 2, r * 2)
            bx.lineWidth = lw
            bx.strokeStyle = c
            bx.strokeRect(px - r, py - r, r * 2, r * 2)
            continue
          }
          bx.fillStyle = c
          const big = p.def.kind === 'vendor' || p.def.kind === 'git'
          const r = big ? k * 0.9 + 1.5 : k * 0.5 + 1
          if (shape === 'cross' || shape === 'triangle') {
            // 醫療＝十字、GIT＝三角形（minimapColors.ts poiShape）：色盲時和灰色設施、綠色販賣機分得開。深色描邊讓形狀在牆邊也清楚
            minimapPoiPath(bx, shape, px, py, r * 1.15)
            bx.lineWidth = 2
            bx.strokeStyle = 'rgba(0,0,0,0.8)'
            bx.stroke()
            bx.fill()
            continue
          }
          bx.fillRect(px - r, py - r, r * 2, r * 2)
        }
        base.current = { zone: scene.zone, img: b }
      }
      x.clearRect(0, 0, c.width, c.height)
      x.drawImage(base.current.img, 0, 0)
      for (const e of world.ents.values()) {
        if (e.s.z !== scene.zone) continue
        const def = UNITS.get(e.s.d ?? '')
        if (def?.tags.includes('structure')) continue
        drawMinimapUnit(x, e.s, ox + e.x * k, oy + (l.h - e.y) * k)
      }
      // 視野框
      const tx = scene.rts.tx
      const ty = scene.rts.ty
      x.strokeStyle = MINIMAP.view
      x.lineWidth = 2
      const vw = scene.rts.distance() * 1.1
      x.strokeRect(ox + (tx - vw) * k, oy + (l.h - ty - vw * 0.55) * k, vw * 2 * k, vw * 1.1 * k)
      drawPings(x, scene.zone, (wx, wy) => [ox + wx * k, oy + (l.h - wy) * k])
    }
    draw()
    return () => cancelAnimationFrame(raf)
  }, [props.scene])
  const toWorld = (ev: { clientX: number; clientY: number }) => {
    const scene = sceneRef.current
    if (!scene) return null
    const c = ref.current!
    const r = c.getBoundingClientRect()
    if (scene.zone === 0) {
      const k = Math.min(c.width, c.height) / 100
      const px = ((ev.clientX - r.left) / r.width) * c.width
      const py = ((ev.clientY - r.top) / r.height) * c.height
      return { x: (px - c.width / 2) / k, y: -(py - c.height / 2) / k }
    }
    const info = scene.zones.get(scene.zone)
    if (!info) return null
    const l = info.layout
    const k = Math.min((c.width - 8) / l.w, (c.height - 8) / l.h)
    const ox = (c.width - l.w * k) / 2
    const oy = (c.height - l.h * k) / 2
    const px = ((ev.clientX - r.left) / r.width) * c.width
    const py = ((ev.clientY - r.top) / r.height) * c.height
    return { x: (px - ox) / k, y: l.h - (py - oy) / k }
  }
  /** 小地圖上的點擊容差（約 10 px）換算成公尺 */
  const mapTol = (ev: { clientX: number; clientY: number }, p: { x: number; y: number }) => {
    const q = toWorld({ clientX: ev.clientX + 10, clientY: ev.clientY })
    return q ? Math.abs(q.x - p.x) : 2
  }
  /** 瞄準單位時的小地圖懸停：左鍵會選到的目標名稱（沒有可選的就不顯示，照常顯示房間）*/
  const minimapAimTip = (scene: GameScene, tm: AimMode, p: { x: number; y: number } | null, ev: { clientX: number; clientY: number }): TipData | null => {
    if (!p || (tm.target !== 'unit' && tm.target !== 'unitOrPoint')) return null
    const id = mapPick(scene, p, mapTol(ev, p), aimAbility(tm)?.filter)
    const s = id ? world.ents.get(id)?.s : undefined
    if (!s) return null
    return { title: localizeName(s.n) || loc(entDefName(s.d)), hint: t('art3.minimap.aimPick') }
  }
  return (
    <div class="panel minimap">
      <canvas
        ref={ref}
        onContextMenu={(e) => e.preventDefault()}
        onMouseMove={(e) => {
          // 懸停：顯示房間名稱與裡面的設施；瞄準單位時改說明左鍵會選到誰
          const scene = sceneRef.current
          const tm = targetMode.value
          const aimTip = scene && tm && tm.kind !== 'attack' ? minimapAimTip(scene, tm, toWorld(e), e) : null
          if (aimTip) return showCursorTip(aimTip, e.clientX, e.clientY)
          if (!scene || scene.zone === 0) return showCursorTip(null, 0, 0)
          const p = toWorld(e)
          const info = scene.zones.get(scene.zone)
          if (!p || !info) return showCursorTip(null, 0, 0)
          const room = roomAt(info.layout, p.x, p.y)
          if (!room) return showCursorTip(null, 0, 0)
          const things = info.layout.pois
            .filter((q) => info.layout.roomOf[q.row * info.layout.w + q.col] === room.index)
            .map((q) => poiName(q.def.kind, q.def.ref))
            .filter(Boolean)
          showCursorTip({ title: loc(room.spec.name), body: listJoin([...new Set(things)]) || undefined, hint: t(tm ? 'art3.minimap.aim' : 'r4c.minimap.hint') }, e.clientX, e.clientY)
        }}
        onMouseLeave={() => showCursorTip(null, 0, 0)}
        onMouseDown={(e) => {
          const p = toWorld(e)
          const scene = sceneRef.current
          if (!p || !scene) return
          // Alt＋左鍵：在那裡發信號（全員的小地圖與地面都會閃一下）。瞄準中也可以，瞄準照樣保留
          if (e.button === 0 && e.altKey) {
            e.preventDefault()
            sendMapPing(scene.zone, p.x, p.y, scene.zone !== 0 ? scene.zones.get(scene.zone)?.layout : null)
            return
          }
          const tm = targetMode.value
          if (tm) {
            // 瞄準中：右鍵取消（同場景）；左鍵＝在小地圖上選目標（救生艙設定航線、天守主砲…），A 攻擊＝攻擊移動到那裡
            if (e.button === 2) targetMode.value = null
            else if (e.button === 0) {
              const done = tm.kind === 'attack' ? minimapMove(scene, p, e.shiftKey, 'amove') : mapAim(scene, tm, p, mapTol(e, p), e.shiftKey)
              if (done && !e.shiftKey) targetMode.value = null
            }
            return
          }
          if (e.button === 2) minimapMove(scene, p, e.shiftKey)
          else scene.rts.focus(p.x, p.y)
        }}
      />
      {/* 圖例：滑鼠移上去看顏色與形狀的意思（完整的在 G 說明第 3 頁，點一下直接打開）*/}
      <button
        class="minimap-help"
        data-testid="minimap-help"
        aria-label={t('r3b.minimap.legend')}
        onClick={() => {
          helpTab.value = 'things'
          guideOpen.value = true
        }}
        {...tipProps(() => minimapLegendTip(sceneRef.current?.zone === 0))}
      >
        ?
      </button>
    </div>
  )
}

/** 十字（醫療）與三角形（GIT）的路徑：中心 (px, py)、半寬 r（畫布是 2 倍解析度）*/
export function minimapPoiPath(x: CanvasRenderingContext2D, shape: 'cross' | 'triangle', px: number, py: number, r: number): void {
  x.beginPath()
  if (shape === 'cross') {
    const a = r * 0.36
    x.moveTo(px - a, py - r)
    x.lineTo(px + a, py - r)
    x.lineTo(px + a, py - a)
    x.lineTo(px + r, py - a)
    x.lineTo(px + r, py + a)
    x.lineTo(px + a, py + a)
    x.lineTo(px + a, py + r)
    x.lineTo(px - a, py + r)
    x.lineTo(px - a, py + a)
    x.lineTo(px - r, py + a)
    x.lineTo(px - r, py - a)
    x.lineTo(px - a, py - a)
  } else {
    x.moveTo(px, py - r * 1.05)
    x.lineTo(px + r * 1.1, py + r * 0.85)
    x.lineTo(px - r * 1.1, py + r * 0.85)
  }
  x.closePath()
}

/** 小地圖圖例的 tooltip：顏色與形狀全部照 minimapColors.ts（和小地圖、G 說明的圖例同一份）*/
export function minimapLegendTip(space: boolean): TipData {
  const mine = startInfo.value?.players.find((p) => p.slot === world.me.slot)?.color
  const myColor = mine !== undefined ? (PLAYER_COLORS[mine]?.hex ?? MINIMAP.selfNoColor) : MINIMAP.selfNoColor
  const legend: LegendRow[] = [
    { shape: 'self', color: myColor, ring: MINIMAP.selfRing, label: t('guide3.map.selfRing') },
    { shape: 'player', color: MINIMAP_PLAYERS_SWATCH, ring: MINIMAP.playerRing, label: t('guide3.map.playersDot') },
    { shape: 'hostile', color: MINIMAP.hostile, ring: MINIMAP.hostileRing, label: t('guide3.map.hostileDiamond') },
    { shape: 'other', color: MINIMAP.neutral, label: t('guide3.map.otherDot') },
    // 十字、三角形：tooltip.tsx 的 LegendRow 還沒列這兩種（class 名稱照樣套上，樣式在 styles.css 的 .tip-sw.cross／.tip-sw.tri）
    ...legendPois().map((k): LegendRow => ({ shape: legendSwatch(k), color: MINIMAP[k], label: t(legendLabelKey(k)) })),
    { shape: 'frame', color: MINIMAP.view, label: t('guide.map.view') },
  ]
  return { title: t('r3b.minimap.legend'), body: space ? t('guide.map.space') : undefined, legend, hint: t('r3b.minimap.legendHint'), color: '#9fe7ff' }
}

/**
 * 小地圖上的單位（畫布是 2 倍解析度）。不只靠顏色區分（色盲時紅色系玩家色與敵對紅點不好分）：
 * 玩家＝玩家色圓點＋深色外框；自己＝較大的圓點＋白框；敵對（沒有玩家色）＝紅色菱形＋白框；其他＝小灰點。
 * 顏色在 minimapColors.ts（圖例共用）；改形狀時同步 Guide.tsx 的 MapLegend 與 guide.css 的 .guide-sw。
 */
export function drawMinimapUnit(x: CanvasRenderingContext2D, s: { i: number; c?: number; fl?: number }, px: number, py: number): void {
  const me = s.i === world.me.unit || (!!world.me.control && s.i === world.me.control)
  const col = (s.c ?? -1) >= 0 ? PLAYER_COLORS[s.c!]?.hex : undefined
  x.beginPath()
  if (col || me) {
    // 自己沒有玩家色時（異形的匿名形態）照樣畫白框圓點
    x.arc(px, py, me ? 5 : 3.6, 0, Math.PI * 2)
    x.fillStyle = col ?? MINIMAP.selfNoColor
    x.fill()
    x.lineWidth = me ? 2.4 : 1.4
    x.strokeStyle = me ? MINIMAP.selfRing : MINIMAP.playerRing
    x.stroke()
  } else if ((s.fl ?? 0) & 64) {
    const r = 4.4
    x.moveTo(px, py - r)
    x.lineTo(px + r, py)
    x.lineTo(px, py + r)
    x.lineTo(px - r, py)
    x.closePath()
    x.fillStyle = MINIMAP.hostile
    x.fill()
    x.lineWidth = 1.4
    x.strokeStyle = MINIMAP.hostileRing
    x.stroke()
  } else {
    x.arc(px, py, 2.4, 0, Math.PI * 2)
    // 中立：灰藍（和白色玩家 #eff0f3 分得開）
    x.fillStyle = MINIMAP.neutral
    x.fill()
  }
}

/**
 * 小地圖右鍵移動（站內）：點到牆、實心設施改成同房間最近走得到的格子；落在控制台的控制圈裡就推到圈外
 * （小地圖上點不出「去駕駛」，要駕駛請在場景裡右鍵控制台）；整個走不到就提示「無法到達」。太空層照原點。
 */
function minimapMove(scene: GameScene | null, p: { x: number; y: number }, q: boolean, k: 'move' | 'amove' = 'move'): boolean {
  const info = scene && scene.zone !== 0 ? scene.zones.get(scene.zone) : undefined
  if (!scene || !info) {
    sendCmd({ k, x: p.x, y: p.y, q })
    return true
  }
  const meId = world.me.control || world.me.unit
  const me = meId ? world.ents.get(meId) : undefined
  const here = !!me && me.s.z === scene.zone
  const to = minimapMoveTarget(info.layout, p, here ? { x: me.x, y: me.y } : null, UNITS.get(me?.s.d ?? '')?.radius ?? DEFAULT_BODY_R)
  if (!to) {
    localNotice.value = { text: 'art3.unreachable', at: performance.now() }
    return false
  }
  sendCmd({ k, x: to.x, y: to.y, q })
  scene.fx.clickMarker(scene.zone, to.x, to.y, k === 'amove' ? '#ff5a4a' : undefined)
  return true
}

function poiName(kind: string, ref?: string): string {
  if (kind === 'vendor') return loc(VENDORS.get(ref ?? '')?.name)
  if (kind === 'console' || kind === 'shipConsole') return t('minimap.console')
  if (kind === 'powerConsole') return t('minimap.power')
  if (kind === 'git') return t('minimap.git')
  return ''
}

/** 太空層小地圖：所有太空物件 */
function drawSpace(c: HTMLCanvasElement, scene: GameScene): void {
  const W = c.clientWidth
  const H = c.clientHeight
  if (c.width !== W * 2) {
    c.width = W * 2
    c.height = H * 2
  }
  const x = c.getContext('2d')!
  x.fillStyle = MINIMAP.spaceBg
  x.fillRect(0, 0, c.width, c.height)
  const k = Math.min(c.width, c.height) / 100
  const ox = c.width / 2
  const oy = c.height / 2
  x.strokeStyle = MINIMAP.spaceRing
  for (let r = 10; r < 50; r += 10) {
    x.beginPath()
    x.arc(ox, oy, r * k, 0, Math.PI * 2)
    x.stroke()
  }
  const placed: { l: number; r: number; t: number; b: number }[] = []
  for (const e of world.ents.values()) {
    if (e.s.z !== 0) continue
    const def = UNITS.get(e.s.d ?? '')
    const px = ox + e.x * k
    const py = oy - e.y * k
    // 站點的 UnitDef 只在 sim 端註冊，client 用外觀 id 判斷
    const big = def?.tags.includes('station') || (e.s.d ?? '').startsWith('station.')
    // 沒有玩家色的單位用和腳下中立光圈同一個灰藍（跟白色玩家分得開）
    x.fillStyle = def?.id === 'space.sun' ? MINIMAP.spaceSun : (e.s.c ?? -1) >= 0 ? PLAYER_COLORS[e.s.c!].hex : big ? MINIMAP.spaceStation : MINIMAP.neutral
    x.beginPath()
    x.arc(px, py, big ? 5 : def?.id === 'space.sun' ? 7 : 3, 0, Math.PI * 2)
    x.fill()
    if (big) {
      const nm = loc(entDefName(e.s.d))
      if (nm) {
        x.font = '600 18px "Noto Sans TC", sans-serif'
        x.textAlign = 'center'
        const hw = x.measureText(nm).width / 2 + 2
        // 名字避讓：上方擠就放下方，兩邊都擠就不畫（滑鼠懸停到場景上的站還是看得到）
        const spot = [py - 9, py + 22].find((yy) => !placed.some((r) => px - hw < r.r && px + hw > r.l && yy - 17 < r.b && yy + 2 > r.t))
        if (spot !== undefined) {
          placed.push({ l: px - hw, r: px + hw, t: spot - 17, b: spot + 2 })
          x.lineWidth = 3
          x.strokeStyle = 'rgba(0,0,0,0.85)'
          x.strokeText(nm, px, spot)
          x.fillStyle = '#dff6ff'
          x.fillText(nm, px, spot)
        }
      }
    }
  }
  const tx = scene.rts.tx
  const ty = scene.rts.ty
  const vw = scene.rts.distance() * 0.8
  x.strokeStyle = MINIMAP.view
  x.lineWidth = 2
  x.strokeRect(ox + (tx - vw) * k, oy - (ty + vw * 0.55) * k, vw * 2 * k, vw * 1.1 * k)
  drawPings(x, 0, (wx, wy) => [ox + wx * k, oy - wy * k])
}

/**
 * 小地圖上的信號（client/mapPing.ts，畫布是 2 倍解析度）：發送者顏色的圈＋四個準星刻度＋往外擴散的波紋，約 4 秒。
 * 圈有深色外框與白色內圈：暗的玩家色、色盲時也看得出來，而且是空心圈＋刻度，不會和實心的玩家圓點搞混。
 */
function drawPings(x: CanvasRenderingContext2D, zone: number, at: (wx: number, wy: number) => [number, number]): void {
  const now = performance.now()
  for (const p of pingBoard.active(now)) {
    if (p.z !== zone) continue
    const look = pingLook(now - p.at)
    if (!look) continue
    const [px, py] = at(p.x, p.y)
    const col = pingColor(p.color)
    const ring = (r: number, w: number, c: string) => {
      x.lineWidth = w
      x.strokeStyle = c
      x.beginPath()
      x.arc(px, py, r, 0, Math.PI * 2)
      x.stroke()
    }
    x.save()
    for (const wv of look.waves) {
      x.globalAlpha = wv.a
      ring(10 + wv.r * 30, 5, 'rgba(0,0,0,0.45)')
      ring(10 + wv.r * 30, 2.6, col)
    }
    x.globalAlpha = look.core
    ring(10, 6.5, 'rgba(0,0,0,0.75)')
    ring(10, 3.4, col)
    ring(6, 1.3, 'rgba(255,255,255,0.92)')
    // 準星刻度（上下左右）
    x.lineCap = 'round'
    for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
      x.beginPath()
      x.moveTo(px + dx * 13, py + dy * 13)
      x.lineTo(px + dx * 19, py + dy * 19)
      x.lineWidth = 5.5
      x.strokeStyle = 'rgba(0,0,0,0.75)'
      x.stroke()
      x.lineWidth = 2.6
      x.strokeStyle = col
      x.stroke()
    }
    x.restore()
  }
}

export function Portrait() {
  void snapTick.value
  // 出局者（死亡即退出）不能觀戰也不能點選單位：只寫「已出局」
  if (world.me.booted)
    return (
      <div class="panel portrait portrait-empty" data-testid="portrait-booted">
        <div class="dim">
          <b>{t('f7.portraitBooted')}</b>
        </div>
      </div>
    )
  // 選取的單位不在了（變身、進化換了主單位，或離開視野）：改顯示自己操控的單位，不要留一塊空白
  const sel = selected.value && world.ents.has(selected.value) ? selected.value : 0
  const id = sel || world.me.control || world.me.unit || 0
  const e = world.ents.get(id)
  if (!e) {
    // 觀戰中沒有選取任何單位：說明可以點選，而不是留一塊空白
    const dead = world.me.alive === false || world.me.role === 'spectator'
    return (
      <div class="panel portrait portrait-empty">
        {dead && (
          <div class="dim">
            <b>{t('spec3.portraitDead')}</b>
            <div>{t('spec3.portraitHint')}</div>
          </div>
        )}
      </div>
    )
  }
  const s = e.s
  const def = UNITS.get(s.d ?? '')
  const defName = entDefName(s.d)
  const hp = s.hp ?? 0
  const mhp = s.mhp ?? 1
  const color = (s.c ?? -1) >= 0 ? PLAYER_COLORS[s.c!].hex : '#9fb3c2'
  const name = localizeName(s.n) || loc(defName)
  return (
    <div class="panel portrait" data-testid="portrait">
      <div style={{ width: '96px', height: '128px', border: '1px solid var(--line)', display: 'flex', alignItems: 'center', justifyContent: 'center', background: `radial-gradient(circle at 50% 40%, ${color}33, transparent 70%)` }}>
        <Icon name={def?.tags.includes('personnel') ? 'human' : def?.tags.includes('structure') ? 'gear' : 'claw'} color={color} size={56} />
      </div>
      <div class="bars">
        {/* 第一列只放名字（e2e ux.spec 讀 .bars > div 的第一個）*/}
        <div class="pname" style={{ color: textColorOf(color) }}>
          {name}
        </div>
        <div class="psub dim">
          {name !== loc(defName) && <span class="psub-def">{loc(defName)}</span>}
          {def && (
            <span class="mono psub-stat">
              {def.attack ? `ATK ${def.attack.dmg[0]}–${def.attack.dmg[1]} · ${def.attack.range}m · ` : ''}SPD {def.speed}
            </span>
          )}
        </div>
        <div class="bar">
          <i style={{ transform: `scaleX(${Math.max(0, hp / mhp)})` }} />
          <span>
            {Math.ceil(hp)} / {mhp}
          </span>
        </div>
        {s.mmp ? (
          <div class="bar mp">
            <i style={{ transform: `scaleX(${(s.mp ?? 0) / s.mmp})` }} />
            <span>
              {s.mp} / {s.mmp}
            </span>
          </div>
        ) : null}
        <BuffRow ids={s.b ?? []} />
      </div>
    </div>
  )
}

/** 頭像一列最多放幾個狀態標籤（多的收成「+N」，滑鼠移上去列出其餘的）*/
const BUFF_MAX = 4

/**
 * 頭像的狀態效果列：固定一行高（不會被生命條、能量條擠成一條線）。負面狀態（寄生、中毒…）排前面、紅底醒目；
 * 增益綠框。放不下的收成「+N」。
 */
function BuffRow({ ids }: { ids: string[] }) {
  const list = ids.map((id) => ({ id, def: buffDef(id) })).sort((a, b) => Number(!!a.def?.good) - Number(!!b.def?.good))
  const shown = list.length > BUFF_MAX ? list.slice(0, BUFF_MAX - 1) : list
  const rest = list.slice(shown.length)
  return (
    <div class="pbuffs" data-testid="portrait-buffs">
      {shown.map(({ id, def: bd }) => (
        <span
          key={id}
          class={'tag ' + (bd?.good ? 'buff-good' : 'buff-bad')}
          data-testid={'buff-' + id}
          {...tipProps(() => (bd ? { title: loc(bd.name), sub: bd.good ? t('tip.buff.good') : t('tip.buff.bad'), body: loc(bd.desc), color: bd.good ? '#5cf2a5' : '#ff5a4a' } : null))}
        >
          {!bd?.good && <i class="buff-dot" />}
          {loc(bd?.name) || id}
        </span>
      ))}
      {rest.length > 0 && (
        <span class={'tag ' + (rest.some((r) => !r.def?.good) ? 'buff-bad' : 'buff-good')} {...tipProps(() => ({ title: listJoin(rest.map((r) => loc(r.def?.name) || r.id)) }))}>
          +{rest.length}
        </span>
      )}
    </div>
  )
}

const TARGET_HINT: Record<string, string> = {
  none: 'tip.target.none',
  self: 'tip.target.self',
  unit: 'tip.target.unit',
  point: 'tip.target.point',
  unitOrPoint: 'tip.target.unitOrPoint',
  toggle: 'tip.target.toggle',
  passive: 'tip.target.passive',
}

function abilityTip(id: string, key: string, st?: { cd: number; disabled?: boolean; mana?: number }): TipData | null {
  const ab = abilityDef(id)
  if (!ab) return null
  const rows: [string, string][] = []
  if (ab.cd) rows.push([t('tip.cd'), `${ab.cd}s`])
  if (ab.mana) rows.push([t('tip.mana'), String(ab.mana)])
  if (ab.range) rows.push([t('tip.range'), `${ab.range}m`])
  if (ab.cast) rows.push([t('tip3.castTime'), `${ab.cast}s`])
  if (ab.channel) rows.push([t('tip3.channel'), `${ab.channel}s`])
  const passive = ab.target === 'passive'
  // 有施法／引導時間的「立即」技能不是立即生效
  const instant = ab.target === 'none' || ab.target === 'self'
  const hints = [
    instant && ab.cast ? t('tip3.target.cast', { s: ab.cast }) : instant && ab.channel ? t('tip3.target.channel', { s: ab.channel }) : t(TARGET_HINT[ab.target] ?? 'tip.target.none'),
  ]
  if (!passive) hints.push(t('tip.ability.use', { k: key }))
  if (ab.autocast) hints.push(t('tip.ability.auto'))
  if (st?.disabled) hints.unshift(t('tip.ability.disabled'))
  // 變身被看到就曝光：視野裡有其他人形單位時，按下去之前就先警告（exposure.ts）
  const watchers = EXPOSING_ABILITIES.has(id) ? watcherCount(world) : 0
  // 冷卻中、能量不足：直接寫在最上面，不然玩家不知道為什麼按不下去
  if (st && st.cd > 0) hints.unshift(t('tip.ability.cooling', { s: fmtSecs(st.cd) }))
  const mp = world.ents.get(world.me.control || world.me.unit || 0)?.s.mp
  if (st && !st.cd && ab.mana > 0 && mp !== undefined && mp < ab.mana) hints.unshift(t('tip.ability.noMana', { need: ab.mana, have: Math.floor(mp) }))
  if (watchers > 0) hints.unshift(t('r3b.expose.tip', { n: watchers }))
  return { title: loc(ab.name), tag: key || undefined, body: loc(ab.desc), rows, hint: hints.join('\n'), hintColor: watchers > 0 ? '#ffb4a8' : undefined, color: '#9fe7ff' }
}

/** 觀戰中、沒有操控任何東西（死者附身蛞蝓仔時例外）：指令卡、背包沒有作用，不顯示 */
function spectating(): boolean {
  const me = world.me
  return me.alive === false && (!me.control || me.control === me.unit)
}

export function CommandCard({ input }: { input: Input | null }) {
  void snapTick.value
  if (spectating()) return null
  const abs = (world.me.abilities ?? []).filter((a) => abilityDef(a.id)?.target !== 'passive')
  const passives = (world.me.abilities ?? []).filter((a) => abilityDef(a.id)?.target === 'passive')
  const keys = ['Q', 'W', 'E', 'R', 'D', 'F']
  const basic = [
    { key: 'A', icon: 'attack', name: t('cmd.attack'), desc: t('cmd.attack.desc'), run: () => (targetMode.value = { kind: 'attack' }) },
    { key: 'S', icon: 'stop', name: t('cmd.stop'), desc: t('cmd.stop.desc'), run: () => sendCmd({ k: 'stop' }) },
    { key: 'H', icon: 'hold', name: t('cmd.hold'), desc: t('cmd.hold.desc'), run: () => sendCmd({ k: 'hold' }) },
  ]
  return (
    <div class="panel cmdcard">
      {isPiloting() && (
        <button class="unpilot" data-testid="unpilot" onClick={() => sendCmd({ k: 'unpilot' })} {...tipProps(() => ({ title: t('cmd.unpilot'), tag: 'B', body: t('cmd.unpilot.desc') }))}>
          {t('cmd.unpilot')} <span class="mono dim">B</span>
        </button>
      )}
      <div class="cmdgrid">
        {basic.map((b) => (
          <div class="cmd" key={b.key} onClick={b.run} {...tipProps(() => ({ title: b.name, tag: b.key, body: b.desc }))}>
            <span class="key">{b.key}</span>
            <Icon name={b.icon} size={28} />
          </div>
        ))}
        {passives.slice(0, 1).map((p) => {
          const ab = abilityDef(p.id)!
          return (
            <div class="cmd passive" key={p.id} {...tipProps(() => abilityTip(p.id, ''))}>
              <Icon name={ab.icon} size={28} color="#8b9aa8" />
            </div>
          )
        })}
        {passives.length === 0 && <div class="cmd empty" />}
        {Array.from({ length: 8 }, (_, i) => {
          const st = abs[i]
          if (!st) return <div class="cmd empty" key={'e' + i} />
          const ab = abilityDef(st.id)!
          const tm = targetMode.value
          const active = tm?.kind === 'ability' && tm.id === st.id
          // 能量不足（只在不是冷卻中時提示，免得兩種狀態疊在一起）
          const mp = world.ents.get(world.me.control || world.me.unit || 0)?.s.mp
          const noMana = !st.cd && st.mana > 0 && mp !== undefined && mp < st.mana
          const cls = 'cmd' + (st.cd > 0 ? ' cooling' : '') + (noMana ? ' nomana' : '') + (st.disabled ? ' locked' : '')
          return (
            <div
              class={cls}
              key={st.id}
              data-testid={'ab-' + st.id}
              style={{ borderColor: active ? 'var(--xeno2)' : st.auto ? 'var(--warn)' : undefined }}
              onClick={() => input?.useAbility(i)}
              onContextMenu={(e) => {
                e.preventDefault()
                if (ab.autocast) sendCmd({ k: 'autocast', a: ab.id })
              }}
              {...tipProps(() => abilityTip(st.id, keys[i] ?? '', st))}
            >
              <span class="key">{keys[i] ?? ''}</span>
              <Icon name={ab.icon} size={30} color={st.disabled ? '#666' : '#9fe7ff'} />
              <CdFace cd={st.cd} total={st.maxCd} />
              {noMana && <span class="cd-mana">{st.mana}</span>}
              {st.charges !== undefined && <span class="cdtxt charges">{st.charges}</span>}
              {st.disabled && <span class="cd-lock">✕</span>}
            </div>
          )
        })}
      </div>
    </div>
  )
}

/** 拖曳放開後的那一下 click 不算「使用道具」 */
let dragEndedAt = -1e9
/** 按下後移動超過這個距離（px）才算拖曳，小抖動仍是點擊 */
const DRAG_START = 6

function slotAt(x: number, y: number): number {
  const el = document.elementFromPoint(x, y)?.closest('[data-inv-slot]')
  return el ? Number(el.getAttribute('data-inv-slot')) : -1
}

/** 放開：另一格＝交換位置；場景上的單位＝給予；其他地方＝取消 */
function finishDrag(input: Input | null, from: number, x: number, y: number, queue: boolean): void {
  const to = slotAt(x, y)
  if (to >= 0) {
    if (to !== from) sendCmd({ k: 'swapItem', s: from, x: to })
    return
  }
  const el = document.elementFromPoint(x, y)
  if (el instanceof HTMLCanvasElement && el.classList.contains('view')) input?.dropItemOn(from, x, y, queue)
}

/** 背包格按下：超過門檻才開始拖；放開時決定交換或給予；Esc、視窗失焦取消 */
function startInvDrag(e: PointerEvent, slot: number, input: Input | null): void {
  if (e.button !== 0 || !world.me.inv?.[slot]) return
  const x0 = e.clientX
  const y0 = e.clientY
  let dragging = false
  const cleanup = () => {
    window.removeEventListener('pointermove', move)
    window.removeEventListener('pointerup', up)
    window.removeEventListener('pointercancel', cancel)
    window.removeEventListener('keydown', key, true)
    window.removeEventListener('blur', cancel)
    if (dragging) dragEndedAt = performance.now()
    invDrag.value = null
  }
  const move = (ev: PointerEvent) => {
    if (!dragging && Math.hypot(ev.clientX - x0, ev.clientY - y0) < DRAG_START) return
    if (!dragging) hideTip()
    dragging = true
    invDrag.value = { slot, x: ev.clientX, y: ev.clientY, over: slotAt(ev.clientX, ev.clientY) }
  }
  const up = (ev: PointerEvent) => {
    const was = dragging
    cleanup()
    if (was) finishDrag(input, slot, ev.clientX, ev.clientY, ev.shiftKey)
  }
  const cancel = () => cleanup()
  const key = (ev: KeyboardEvent) => {
    if (ev.key !== 'Escape' || !dragging) return
    // 只取消拖曳，不要同時打開遊戲選單
    ev.stopPropagation()
    ev.preventDefault()
    cleanup()
  }
  window.addEventListener('pointermove', move)
  window.addEventListener('pointerup', up)
  window.addEventListener('pointercancel', cancel)
  window.addEventListener('keydown', key, true)
  window.addEventListener('blur', cancel)
}

/** 拖曳中的道具圖示：跟著游標（掛在 body 上，不受介面 zoom 影響）*/
export function InvDragGhost() {
  const d = invDrag.value
  if (!d) return null
  const it = world.me.inv?.[d.slot]
  const def = it ? itemDef(it.item) : undefined
  if (!def) return null
  const z = uiZoom.value
  return createPortal(
    <div class="inv-ghost" data-testid="inv-ghost" style={{ left: `${d.x}px`, top: `${d.y}px`, width: `${44 * z}px`, height: `${44 * z}px` }}>
      <Icon name={def.icon} size={Math.round(30 * z)} color={def.suit ? suitColor(def.id) : '#9fe7ff'} />
    </div>,
    document.body,
  )
}

export function Inventory({ input }: { input: Input | null }) {
  void snapTick.value
  if (spectating()) return null
  const inv = world.me.inv ?? []
  const drag = invDrag.value
  return (
    <div class="panel inv" data-testid="inventory">
      {Array.from({ length: 6 }, (_, i) => {
        const it = inv[i]
        const def = it ? itemDef(it.item) : undefined
        const cls = 'cmd' + (it && it.cd > 0 ? ' cooling' : '') + (drag?.slot === i ? ' drag-src' : '') + (drag && drag.over === i && drag.slot !== i ? ' drag-over' : '')
        return (
          <div
            class={cls}
            key={i}
            data-testid={'inv-' + i}
            data-inv-slot={i}
            onPointerDown={(e) => startInvDrag(e, i, input)}
            onClick={() => {
              if (performance.now() - dragEndedAt < 250) return
              input?.useItem(i)
            }}
            onContextMenu={(e) => {
              e.preventDefault()
              if (it) sendCmd({ k: 'drop', s: i })
            }}
            {...tipProps(() => {
              // 拖曳中經過其他格子不跳說明（擋視線）
              if (invDrag.peek()) return null
              if (!def || !it) return { title: t('hud.inventory') + ` ${i + 1}`, body: t('tip.empty') }
              const rows: [string, string][] = []
              if (it.charges) rows.push([t('tip.charges'), String(it.charges)])
              if (it.item === 'geneSampler' || it.item === 'gitResolver') rows.push([t('tip.samples'), `${it.samples?.length ?? 0}/3` + (it.samples?.length ? ' · ' + listJoin(it.samples.map((n) => localizeName(sampleName(n, lang.value)))) : '')])
              const hints = [it.cd > 0 ? t('tip.item.cooling', { s: fmtSecs(it.cd) }) : '', def.suit ? t('tip.item.suit') : '', t('tip.item.use', { n: i + 1 }), t('ui4.tip.drag')].filter(Boolean)
              return itemTip(it.item, { rows, hint: hints.join('\n'), tag: String(i + 1) })
            })}
          >
            <span class="key">{i + 1}</span>
            {def && <Icon name={def.icon} size={30} color={def.suit ? suitColor(def.id) : '#9fe7ff'} />}
            {it && it.charges > 0 && <span class="cdtxt charges">{it.charges}</span>}
            {it?.item === 'geneSampler' && <span class="cdtxt charges">{it.samples?.length ?? 0}/3</span>}
            {it && <CdFace cd={it.cd} total={abilityDef(def?.use ?? '')?.cd ?? 0} />}
          </div>
        )
      })}
    </div>
  )
}

/**
 * 聊天輸入 → 要送出的訊息：「[」開頭＝陣營私頻；「;群組 訊息」＝群組頻道（第一個詞是群組名稱，放進 to）。
 * 頻道不在這裡依死活改成死者頻道：遺言時間內活人還聽得到，過了之後 server 會自己轉到死者頻道。
 */
export function parseChatInput(input: string): { ch: ChatChannel; text: string; to?: string } | null {
  const raw = input.trim()
  if (!raw) return null
  if (raw.startsWith('[')) {
    const text = raw.slice(1).trim()
    return text ? { ch: 'team', text } : null
  }
  if (raw.startsWith(';')) {
    const m = /^(\S+)\s*([\s\S]*)$/.exec(raw.slice(1).trim())
    if (!m || !m[2].trim()) return null
    return { ch: 'group', text: m[2].trim(), to: m[1].slice(0, 16) }
  }
  return { ch: 'all', text: raw }
}

/** 每一行聊天第一次出現在畫面上的時間與穩定的 key（行物件本身當索引；chatLog 重建陣列時同一行還是同一個物件）*/
const chatSeen = new WeakMap<ChatLine, { at: number; key: number }>()
let chatKey = 0
function chatStamp(l: ChatLine, now: number): { at: number; key: number } {
  let v = chatSeen.get(l)
  if (!v) {
    v = { at: now, key: ++chatKey }
    chatSeen.set(l, v)
  }
  return v
}

export function Chat() {
  const [text, setText] = useState('')
  const inputRef = useRef<HTMLInputElement>(null)
  const logRef = useRef<HTMLDivElement>(null)
  // 滑鼠停在聊天區（聊天紀錄不接滑鼠事件、點擊會穿透到場景，所以用整個視窗的游標位置判斷）
  const [hover, setHover] = useState(false)
  const [, setTick] = useState(0)
  useLayoutEffect(() => {
    if (!chatOpen.value) return
    inputRef.current?.focus()
    // 保險：某些瀏覽器第一幀還不能 focus
    const id = setTimeout(() => inputRef.current?.focus(), 0)
    return () => clearTimeout(id)
  }, [chatOpen.value])
  useEffect(() => {
    let raf = 0
    let x = -1
    let y = -1
    let was = false
    let dwell: ReturnType<typeof setTimeout> | null = null
    const check = () => {
      raf = 0
      const el = logRef.current
      const r = el?.getBoundingClientRect()
      const on = !!r && r.height > 0 && x >= r.left - 8 && x <= r.right + 8 && y >= r.top - 8 && y <= r.bottom + 8
      if (on === was) return
      was = on
      if (dwell) clearTimeout(dwell)
      dwell = null
      // 移進去停一下（0.25 秒）才顯示：只是滑過去點場景時不要整片聊天閃出來；移出去立刻收
      if (on) dwell = setTimeout(() => setHover(true), 250)
      else setHover(false)
    }
    const move = (e: PointerEvent) => {
      x = e.clientX
      y = e.clientY
      if (!raf) raf = requestAnimationFrame(check)
    }
    const out = (e: MouseEvent) => {
      if (e.relatedTarget) return
      x = y = -1
      if (!raf) raf = requestAnimationFrame(check)
    }
    window.addEventListener('pointermove', move)
    window.addEventListener('mouseout', out)
    return () => {
      window.removeEventListener('pointermove', move)
      window.removeEventListener('mouseout', out)
      if (raf) cancelAnimationFrame(raf)
      if (dwell) clearTimeout(dwell)
    }
  }, [])
  // 死因與「你死了…」只在死亡橫幅顯示（deathNote.ts），聊天紀錄不重複列出；本機封鎖的人說的話不顯示（chatFilter.ts）
  void mutedNames.value
  const lines = chatLog.value.filter((l) => !deathScreenOnly(l) && !bubbleOnly(l) && !hiddenByMute(l) && !isMuted(pingLines.get(l)?.name ?? '')).slice(-12)
  const now = performance.now()
  const stamps = lines.map((l) => chatStamp(l, now))
  const reveal = chatOpen.value || hover
  const { faded, next } = chatFade(stamps.map((v) => v.at), now, reveal)
  // 下一行到淡出時間時重繪一次（不用每秒輪詢）
  useEffect(() => {
    if (!Number.isFinite(next)) return
    const id = setTimeout(() => setTick((n) => n + 1), Math.max(50, next - performance.now() + 20))
    return () => clearTimeout(id)
  }, [next])
  const submit = () => {
    const raw = text.trim()
    setText('')
    chatOpen.value = false
    const msg = parseChatInput(raw)
    if (msg) send({ t: 'chat', ...msg })
  }
  // 死後打字時跟著快照更新遺言倒數（只在輸入框開著時訂閱，平常不多重繪）
  if (chatOpen.value && world.me.alive === false) void snapTick.value
  const lastWords = world.me.lastWords ?? 0
  const placeholder = world.me.alive === false ? (lastWords > 0 ? t('chat2.placeholderLastWords', { n: lastWords }) : t('chat.placeholderDead')) : t('chat.placeholder')
  return (
    <>
      <div ref={logRef} class={'chat' + (chatOpen.value ? ' typing' : '') + (reveal ? ' reveal' : '')} data-testid="chatlog">
        {lines.map((l, i) => {
          const pg = pingLines.get(l)
          if (pg) return <PingChatLine key={stamps[i].key} name={pg.name} color={pg.color} z={pg.z} faded={faded[i]} />
          return (
            <div key={stamps[i].key} class={'line ' + (l.ch === 'sys' || l.ch === 'private' ? 'sys' : l.ch) + (faded[i] ? ' faded' : '')}>
              {l.ch === 'dead' && <span class="dim">[{t('chat.dead')}] </span>}
              {l.ch === 'team' && <span>[{t('chat.team')}] </span>}
              {l.group && <span>[{l.group}] </span>}
              {l.from && <b style={{ color: textColorOf(l.color >= 0 ? PLAYER_COLORS[l.color]?.hex : undefined) }}>{localizeName(l.from)}: </b>}
              {!l.from && l.ch === 'all' && <b class="dim">???: </b>}
              {sysText(l.text)}
            </div>
          )
        })}
      </div>
      {chatOpen.value && (
        <div class="chatinput">
          <input
            ref={inputRef}
            data-testid="chatinput"
            value={text}
            maxLength={200}
            placeholder={placeholder}
            onInput={(e) => setText((e.target as HTMLInputElement).value)}
            onKeyDown={(e) => {
              e.stopPropagation()
              if (e.key === 'Enter') submit()
              if (e.key === 'Escape') {
                setText('')
                chatOpen.value = false
              }
            }}
            onBlur={() => !text && (chatOpen.value = false)}
          />
        </div>
      )}
    </>
  )
}

/** 信號所在的地點名稱（太空層、站點或船艙；同型的船不加編號）*/
function pingPlace(z: number): string {
  if (z === 0) return t('spec.space')
  const st = startInfo.value?.zones.find(([id]) => id === z)?.[2]
  return st ? loc(stationDefOf(st)?.name) : ''
}

/** 聊天紀錄裡的信號行（client/mapPing.ts 加的本機訊息）：「◎ 名字 標記了小地圖（地點）」，名字用發送者的顏色 */
function PingChatLine({ name, color, z, faded }: { name: string; color: number; z: number; faded: boolean }) {
  const col = pingColor(color)
  // 名字放在字串裡的位置依語言不同：用記號切開，中間換成上色的名字
  const [pre, post = ''] = t('r4c.ping.chat', { name: '\u0001' }).split('\u0001')
  const place = pingPlace(z)
  return (
    <div class={'line ping' + (faded ? ' faded' : '')} data-testid="ping-line" style={{ borderLeftColor: col }}>
      <span class="ping-ico" aria-hidden="true" style={{ color: col }}>
        ◎
      </span>{' '}
      {pre}
      <b style={{ color: textColorOf(color >= 0 ? PLAYER_COLORS[color]?.hex : undefined) }}>{localizeName(name) || '???'}</b>
      {post}
      {place && <span class="dim">{t('r4c.ping.at', { place })}</span>}
    </div>
  )
}

export function TargetHint() {
  const tm = targetMode.value
  const drag = invDrag.value
  if (!tm && !drag) return null
  let name: string
  if (!tm) name = loc(ITEMS.get(world.me.inv?.[drag!.slot]?.item ?? '')?.name) + t('sep.colon') + t('ui4.drag.hint')
  else if (tm.kind === 'attack') name = t('target.attack')
  else if (tm.kind === 'ability') name = loc(ABILITIES.get(tm.id)?.name) + t('target.pick')
  else name = loc(ITEMS.get(world.me.inv?.[tm.slot]?.item ?? '')?.name) + t('target.pick')
  // 在太空中瞄準（設定航線、主砲、停靠…）：目標常常在畫面外，提醒可以直接點小地圖
  if (tm && tm.kind !== 'attack' && world.ents.get(world.me.control || world.me.unit || 0)?.s.z === 0) name += t('art3.aim.mapHint')
  return (
    <TopSlot order={1}>
      <div class="panel top-hint" data-testid="target-hint">
        {name}
      </div>
    </TopSlot>
  )
}
