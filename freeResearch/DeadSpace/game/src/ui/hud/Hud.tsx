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
import type { ChatChannel } from '../../shared/protocol/messages'
import { chatLog, isHost, send, sendCmd, snapTick, world, connLost, hostStall, leave, notice, noticeKey } from '../../client/session'
import { SIM_ERROR_KEY } from '../../net/hostRelay'
import { gpuLost } from '../../render/engine'
import { quality, setQuality } from '../../render/quality'
import { chatOpen, evolveOpen, isPiloting, selected, targetMode, type Input } from '../../client/input'
import type { GameScene } from '../../render/gameScene'
import { lang, listJoin, loc, sysText, t } from '../i18n'
import { sampleName } from '../../shared/sysArgs'
import { Icon } from '../icons'
import { TopSlot } from './Announce'
import { hideTip, showCursorTip, tipProps, type TipData } from '../tooltip'
import { uiZoom } from '../uiScale'
import { createPortal } from 'preact/compat'
import { invDrag } from '../../client/give'
import { roomAt } from '../../shared/layout'
import { settingsOpen } from '../screens/Settings'
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

export function TopBar() {
  void snapTick.value
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
  if (connLost.value) return <div class="panel banner">{t('net.hostLost')}</div>
  // 開局等所有人載入完才開始：畫面靜止不是當機
  const waiting = Number(world.w.ld ?? 0)
  if (waiting > 0)
    return (
      <div class="panel banner" data-testid="load-wait">
        {t('net.waitLoad', { n: waiting })}
      </div>
    )
  if (world.w.bg && !isHost.value) return <div class="panel banner">{t('net.hostBg')}</div>
  if (hostStall.value && !isHost.value)
    return (
      <div class="panel banner" data-testid="host-loading">
        {t('net.hostLoading')}
      </div>
    )
  // 出局者（死亡即退出）不能觀戰、也不能和死者聊天：目標面板已說明「等待結算」，這裡不再顯示觀戰橫幅
  if (me.alive === false && me.coreWait) return <div class="panel banner">{t('hud.coreWait')}</div>
  if (me.alive === false && me.role !== 'spectator' && !me.booted) return <div class="panel banner">{t('hud.dead')}</div>
  return null
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
            bx.fillStyle = cell === Cell.Wall ? '#3c4a57' : cell === Cell.Door ? '#ffc23d' : cell === Cell.Window ? '#7fd8ff' : '#16202a'
            bx.fillRect(ox + col * k, oy + row * k, Math.ceil(k), Math.ceil(k))
          }
        for (const p of l.pois) {
          const c = poiColor(p.def.kind, p.def.ref)
          if (!c) continue
          bx.fillStyle = c
          const big = p.def.kind === 'vendor' || p.def.kind === 'git' || p.def.kind === 'console'
          const r = big ? k * 0.9 + 1.5 : k * 0.5 + 1
          bx.beginPath()
          if (p.def.kind === 'console') bx.arc(ox + (p.col + 0.5) * k, oy + (p.row + 0.5) * k, r, 0, Math.PI * 2)
          else bx.rect(ox + (p.col + 0.5) * k - r, oy + (p.row + 0.5) * k - r, r * 2, r * 2)
          bx.fill()
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
      x.strokeStyle = 'rgba(255,255,255,0.6)'
      x.lineWidth = 2
      const vw = scene.rts.distance() * 1.1
      x.strokeRect(ox + (tx - vw) * k, oy + (l.h - ty - vw * 0.55) * k, vw * 2 * k, vw * 1.1 * k)
    }
    draw()
    return () => cancelAnimationFrame(raf)
  }, [props.scene])
  const toWorld = (ev: MouseEvent) => {
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
  return (
    <div class="panel minimap">
      <canvas
        ref={ref}
        onContextMenu={(e) => e.preventDefault()}
        onMouseMove={(e) => {
          // 懸停：顯示房間名稱與裡面的設施
          const scene = sceneRef.current
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
          showCursorTip({ title: loc(room.spec.name), body: listJoin([...new Set(things)]) || undefined, hint: t('minimap.hint') }, e.clientX, e.clientY)
        }}
        onMouseLeave={() => showCursorTip(null, 0, 0)}
        onMouseDown={(e) => {
          const p = toWorld(e)
          if (!p) return
          if (e.button === 2) sendCmd({ k: 'move', x: p.x, y: p.y, q: e.shiftKey })
          else sceneRef.current?.rts.focus(p.x, p.y)
        }}
      />
    </div>
  )
}

/**
 * 小地圖上的單位（畫布是 2 倍解析度）。不只靠顏色區分（色盲時紅色系玩家色與敵對紅點不好分）：
 * 玩家＝玩家色圓點＋深色外框；自己＝較大的圓點＋白框；敵對（沒有玩家色）＝紅色菱形＋白框；其他＝小灰點。
 * 改樣式時同步 Guide.tsx 的小地圖圖例。
 */
export function drawMinimapUnit(x: CanvasRenderingContext2D, s: { i: number; c?: number; fl?: number }, px: number, py: number): void {
  const me = s.i === world.me.unit || (!!world.me.control && s.i === world.me.control)
  const col = (s.c ?? -1) >= 0 ? PLAYER_COLORS[s.c!]?.hex : undefined
  x.beginPath()
  if (col || me) {
    // 自己沒有玩家色時（異形的匿名形態）照樣畫白框圓點
    x.arc(px, py, me ? 5 : 3.6, 0, Math.PI * 2)
    x.fillStyle = col ?? '#cfd8df'
    x.fill()
    x.lineWidth = me ? 2.4 : 1.4
    x.strokeStyle = me ? '#ffffff' : 'rgba(0,0,0,0.85)'
    x.stroke()
  } else if ((s.fl ?? 0) & 64) {
    const r = 4.4
    x.moveTo(px, py - r)
    x.lineTo(px + r, py)
    x.lineTo(px, py + r)
    x.lineTo(px - r, py)
    x.closePath()
    x.fillStyle = '#ff3b3b'
    x.fill()
    x.lineWidth = 1.4
    x.strokeStyle = '#ffffff'
    x.stroke()
  } else {
    x.arc(px, py, 2.4, 0, Math.PI * 2)
    // 中立：灰藍（和白色玩家 #eff0f3 分得開）
    x.fillStyle = '#9fb3c2'
    x.fill()
  }
}

/** 小地圖上設施的顏色：醫療粉紅、防護服橘、GIT 青、控制台藍（圓點）、其他販賣機綠；不重要的不畫。改色時同步 Guide.tsx 的 MAP_LEGEND */
export function poiColor(kind: string, ref?: string): string | null {
  if (kind === 'vendor') {
    if (ref === 'medical') return '#ff7fa0'
    if (ref?.startsWith('suit')) return '#ff9a3d'
    if (ref === 'gitTester' || ref === 'gitResolver') return '#33ffd1'
    return '#5cf2a5'
  }
  if (kind === 'git') return '#33ffd1'
  if (kind === 'console' || kind === 'powerConsole') return '#7fd8ff'
  if (kind === 'regenerator' || kind === 'moduleFactory' || kind === 'moduleSocket' || kind === 'rummageBox') return '#8a9aa8'
  return null
}

function poiName(kind: string, ref?: string): string {
  if (kind === 'vendor') return loc(VENDORS.get(ref ?? '')?.name)
  if (kind === 'console') return t('minimap.console')
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
  x.fillStyle = '#04060c'
  x.fillRect(0, 0, c.width, c.height)
  const k = Math.min(c.width, c.height) / 100
  const ox = c.width / 2
  const oy = c.height / 2
  x.strokeStyle = 'rgba(159,231,255,0.15)'
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
    x.fillStyle = def?.id === 'space.sun' ? '#fff1d6' : (e.s.c ?? -1) >= 0 ? PLAYER_COLORS[e.s.c!].hex : big ? '#9fe7ff' : '#9fb3c2'
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
  x.strokeStyle = 'rgba(255,255,255,0.6)'
  x.lineWidth = 2
  x.strokeRect(ox + (tx - vw) * k, oy - (ty + vw * 0.55) * k, vw * 2 * k, vw * 1.1 * k)
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
  const id = selected.value || world.me.control || world.me.unit || 0
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
  return (
    <div class="panel portrait" data-testid="portrait">
      <div style={{ width: '96px', height: '128px', border: '1px solid var(--line)', display: 'flex', alignItems: 'center', justifyContent: 'center', background: `radial-gradient(circle at 50% 40%, ${color}33, transparent 70%)` }}>
        <Icon name={def?.tags.includes('personnel') ? 'human' : def?.tags.includes('structure') ? 'gear' : 'claw'} color={color} size={56} />
      </div>
      <div class="bars">
        <div style={{ fontWeight: 700, fontSize: '18px', color: textColorOf(color) }}>{localizeName(s.n) || loc(defName)}</div>
        <div class="dim" style={{ fontSize: '14px', marginTop: '-4px' }}>
          {loc(defName)}
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
        <div class="row" style={{ gap: '4px', flexWrap: 'wrap' }}>
          {(s.b ?? []).map((b) => {
            const bd = buffDef(b)
            return (
              <span key={b} class="tag" style={{ color: bd?.good ? 'var(--good)' : 'var(--alarm)' }} {...tipProps(() => (bd ? { title: loc(bd.name), sub: bd.good ? t('tip.buff.good') : t('tip.buff.bad'), body: loc((bd as { desc?: { zh: string; en: string } }).desc), color: bd.good ? '#5cf2a5' : '#ff5a4a' } : null))}>
                {loc(bd?.name) || b}
              </span>
            )
          })}
        </div>
        {def && (
          <div class="dim mono" style={{ fontSize: '13px' }}>
            {def.attack ? `ATK ${def.attack.dmg[0]}–${def.attack.dmg[1]} · ${def.attack.range}m · ` : ''}SPD {def.speed}
          </div>
        )}
      </div>
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
  // 冷卻中、能量不足：直接寫在最上面，不然玩家不知道為什麼按不下去
  if (st && st.cd > 0) hints.unshift(t('tip.ability.cooling', { s: fmtSecs(st.cd) }))
  const mp = world.ents.get(world.me.control || world.me.unit || 0)?.s.mp
  if (st && !st.cd && ab.mana > 0 && mp !== undefined && mp < ab.mana) hints.unshift(t('tip.ability.noMana', { need: ab.mana, have: Math.floor(mp) }))
  return { title: loc(ab.name), tag: key || undefined, body: loc(ab.desc), rows, hint: hints.join('\n'), color: '#9fe7ff' }
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

export function Chat() {
  const [text, setText] = useState('')
  const inputRef = useRef<HTMLInputElement>(null)
  useLayoutEffect(() => {
    if (!chatOpen.value) return
    inputRef.current?.focus()
    // 保險：某些瀏覽器第一幀還不能 focus
    const id = setTimeout(() => inputRef.current?.focus(), 0)
    return () => clearTimeout(id)
  }, [chatOpen.value])
  const lines = chatLog.value.slice(-12)
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
      <div class={'chat' + (chatOpen.value ? ' typing' : '')} data-testid="chatlog">
        {lines.map((l, i) => (
          <div key={i} class={'line ' + (l.ch === 'sys' || l.ch === 'private' ? 'sys' : l.ch)}>
            {l.ch === 'dead' && <span class="dim">[{t('chat.dead')}] </span>}
            {l.ch === 'team' && <span>[{t('chat.team')}] </span>}
            {l.group && <span>[{l.group}] </span>}
            {l.from && <b style={{ color: textColorOf(l.color >= 0 ? PLAYER_COLORS[l.color]?.hex : undefined) }}>{localizeName(l.from)}: </b>}
            {!l.from && l.ch === 'all' && <b class="dim">???: </b>}
            {sysText(l.text)}
          </div>
        ))}
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

export function TargetHint() {
  const tm = targetMode.value
  const drag = invDrag.value
  if (!tm && !drag) return null
  let name: string
  if (!tm) name = loc(ITEMS.get(world.me.inv?.[drag!.slot]?.item ?? '')?.name) + t('sep.colon') + t('ui4.drag.hint')
  else if (tm.kind === 'attack') name = t('target.attack')
  else if (tm.kind === 'ability') name = loc(ABILITIES.get(tm.id)?.name) + t('target.pick')
  else name = loc(ITEMS.get(world.me.inv?.[tm.slot]?.item ?? '')?.name) + t('target.pick')
  return (
    <TopSlot order={1}>
      <div class="panel top-hint" data-testid="target-hint">
        {name}
      </div>
    </TopSlot>
  )
}
