// 遊戲 HUD（致敬 WC3 版面）：上方資訊列、左下小地圖、中下頭像與數值、右下指令卡＋背包、左側聊天
import { useEffect, useRef, useState, useLayoutEffect } from 'preact/hooks'
import { Stability } from './Events'
import { audioPrefs, setAudioPref } from '../../audio/sfx'
import { PLAYER_COLORS } from '../../shared/constants'
import { ABILITIES, ITEMS, UNITS, VENDORS, abilityDef, buffDef, itemDef } from '../../shared/content/registry'
import { entDefName, suitColor } from '../names'
import { itemTip } from '../itemTip'
import { Cell } from '../../shared/layout'
import type { ChatChannel } from '../../shared/protocol/messages'
import { chatLog, isHost, send, sendCmd, snapTick, world, connLost } from '../../client/session'
import { chatOpen, evolveOpen, isPiloting, selected, targetMode, type Input } from '../../client/input'
import type { GameScene } from '../../render/gameScene'
import { loc, sysText, t } from '../i18n'
import { Icon } from '../icons'
import { showCursorTip, tipProps, type TipData } from '../tooltip'
import { roomAt } from '../../shared/layout'
import { settingsOpen } from '../screens/Settings'

function fmtTime(s: number): string {
  const m = Math.floor(s / 60)
  return `${m}:${String(Math.floor(s % 60)).padStart(2, '0')}`
}

const ROLE_COLOR: Record<string, string> = {
  human: '#9fe7ff',
  xeno: '#7a3cff',
  mutant: '#c8323c',
  android: '#ffb000',
  spectator: '#a7b0ba',
}

export function TopBar() {
  void snapTick.value
  const me = world.me
  const w = world.w
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
        style={{ color: ROLE_COLOR[me.role ?? 'human'], fontFamily: 'var(--title)', letterSpacing: '0.1em' }}
        {...tipProps(() => (me.role ? { title: t('tip.role.title'), body: t('tip.role.body'), color: ROLE_COLOR[me.role] } : null))}
      >
        {me.role ? t('role.' + me.role) + (me.spawn ? ' spawn' : '') : ''}
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
  if (connLost.value) return <div class="panel banner">{t('net.hostLost')}</div>
  if (world.w.bg && !isHost.value) return <div class="panel banner">{t('net.hostBg')}</div>
  if (me.alive === false && me.role !== 'spectator') return <div class="panel banner">{t('hud.dead')}</div>
  return null
}

export function Minimap({ scene }: { scene: GameScene }) {
  const ref = useRef<HTMLCanvasElement>(null)
  const base = useRef<{ zone: number; img: HTMLCanvasElement } | null>(null)
  useEffect(() => {
    let raf = 0
    const draw = () => {
      raf = requestAnimationFrame(draw)
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
        const px = ox + e.x * k
        const py = oy + (l.h - e.y) * k
        x.fillStyle = (e.s.c ?? -1) >= 0 ? PLAYER_COLORS[e.s.c!].hex : (e.s.fl ?? 0) & 64 ? '#ff3b3b' : '#cfd8df'
        x.beginPath()
        x.arc(px, py, e.s.i === world.me.unit ? 4 : 3, 0, Math.PI * 2)
        x.fill()
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
  }, [scene])
  const toWorld = (ev: MouseEvent) => {
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
          if (scene.zone === 0) return showCursorTip(null, 0, 0)
          const p = toWorld(e)
          const info = scene.zones.get(scene.zone)
          if (!p || !info) return showCursorTip(null, 0, 0)
          const room = roomAt(info.layout, p.x, p.y)
          if (!room) return showCursorTip(null, 0, 0)
          const things = info.layout.pois
            .filter((q) => info.layout.roomOf[q.row * info.layout.w + q.col] === room.index)
            .map((q) => poiName(q.def.kind, q.def.ref))
            .filter(Boolean)
          showCursorTip({ title: loc(room.spec.name), body: [...new Set(things)].join('、') || undefined, hint: t('minimap.hint') }, e.clientX, e.clientY)
        }}
        onMouseLeave={() => showCursorTip(null, 0, 0)}
        onMouseDown={(e) => {
          const p = toWorld(e)
          if (!p) return
          if (e.button === 2) sendCmd({ k: 'move', x: p.x, y: p.y, q: e.shiftKey })
          else scene.rts.focus(p.x, p.y)
        }}
      />
    </div>
  )
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
    x.fillStyle = def?.id === 'space.sun' ? '#fff1d6' : (e.s.c ?? -1) >= 0 ? PLAYER_COLORS[e.s.c!].hex : big ? '#9fe7ff' : '#cfd8df'
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
  const id = selected.value || world.me.control || world.me.unit || 0
  const e = world.ents.get(id)
  if (!e) return <div class="panel portrait" />
  const s = e.s
  const def = UNITS.get(s.d ?? '')
  const defName = entDefName(s.d)
  const hp = s.hp ?? 0
  const mhp = s.mhp ?? 1
  const color = (s.c ?? -1) >= 0 ? PLAYER_COLORS[s.c!].hex : '#cfd8df'
  return (
    <div class="panel portrait" data-testid="portrait">
      <div style={{ width: '96px', height: '128px', border: '1px solid var(--line)', display: 'flex', alignItems: 'center', justifyContent: 'center', background: `radial-gradient(circle at 50% 40%, ${color}33, transparent 70%)` }}>
        <Icon name={def?.tags.includes('personnel') ? 'human' : def?.tags.includes('structure') ? 'gear' : 'claw'} color={color} size={56} />
      </div>
      <div class="bars">
        <div style={{ fontWeight: 700, fontSize: '18px', color }}>{s.n || loc(defName)}</div>
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

function abilityTip(id: string, key: string, st?: { cd: number; disabled?: boolean }): TipData | null {
  const ab = abilityDef(id)
  if (!ab) return null
  const rows: [string, string][] = []
  if (ab.cd) rows.push([t('tip.cd'), `${ab.cd}s`])
  if (ab.mana) rows.push([t('tip.mana'), String(ab.mana)])
  if (ab.range) rows.push([t('tip.range'), `${ab.range}m`])
  const passive = ab.target === 'passive'
  const hints = [t(TARGET_HINT[ab.target] ?? 'tip.target.none')]
  if (!passive) hints.push(t('tip.ability.use', { k: key }))
  if (ab.autocast) hints.push(t('tip.ability.auto'))
  if (st?.disabled) hints.unshift(t('tip.ability.disabled'))
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
            <div class="cmd" key={p.id} style={{ opacity: 0.6 }} {...tipProps(() => abilityTip(p.id, ''))}>
              <Icon name={ab.icon} size={28} color="#8b9aa8" />
            </div>
          )
        })}
        {passives.length === 0 && <div class="cmd" style={{ opacity: 0.2 }} />}
        {Array.from({ length: 8 }, (_, i) => {
          const st = abs[i]
          if (!st) return <div class="cmd" key={'e' + i} style={{ opacity: 0.25 }} />
          const ab = abilityDef(st.id)!
          const tm = targetMode.value
          const active = tm?.kind === 'ability' && tm.id === st.id
          return (
            <div
              class="cmd"
              key={st.id}
              data-testid={'ab-' + st.id}
              style={{ borderColor: active ? 'var(--xeno2)' : st.auto ? 'var(--warn)' : undefined, opacity: st.disabled ? 0.35 : 1 }}
              onClick={() => input?.useAbility(i)}
              onContextMenu={(e) => {
                e.preventDefault()
                if (ab.autocast) sendCmd({ k: 'autocast', a: ab.id })
              }}
              {...tipProps(() => abilityTip(st.id, keys[i] ?? '', st))}
            >
              <span class="key">{keys[i] ?? ''}</span>
              <Icon name={ab.icon} size={30} color={st.disabled ? '#666' : '#9fe7ff'} />
              {st.cd > 0 && (
                <>
                  <div class="cdmask" style={{ transform: `scaleY(${Math.min(1, st.cd / Math.max(0.1, st.maxCd))})` }} />
                  <span class="cdtxt">{st.cd >= 10 ? Math.ceil(st.cd) : st.cd.toFixed(1)}</span>
                </>
              )}
            </div>
          )
        })}
      </div>
    </div>
  )
}

export function Inventory({ input }: { input: Input | null }) {
  void snapTick.value
  if (spectating()) return null
  const inv = world.me.inv ?? []
  return (
    <div class="panel inv" data-testid="inventory">
      {Array.from({ length: 6 }, (_, i) => {
        const it = inv[i]
        const def = it ? itemDef(it.item) : undefined
        return (
          <div
            class="cmd"
            key={i}
            data-testid={'inv-' + i}
            onClick={() => input?.useItem(i)}
            onContextMenu={(e) => {
              e.preventDefault()
              if (it) sendCmd({ k: 'drop', s: i })
            }}
            {...tipProps(() => {
              if (!def || !it) return { title: t('hud.inventory') + ` ${i + 1}`, body: t('tip.empty') }
              const rows: [string, string][] = []
              if (it.charges) rows.push([t('tip.charges'), String(it.charges)])
              if (it.item === 'geneSampler' || it.item === 'gitResolver') rows.push([t('tip.samples'), `${it.samples?.length ?? 0}/3` + (it.samples?.length ? ' · ' + it.samples.join('、') : '')])
              const hints = [def.suit ? t('tip.item.suit') : '', t('tip.item.use', { n: i + 1 }), it.cd > 0 ? t('tip.item.cd') : ''].filter(Boolean)
              return itemTip(it.item, { rows, hint: hints.join('\n'), tag: String(i + 1) })
            })}
          >
            <span class="key">{i + 1}</span>
            {def && <Icon name={def.icon} size={30} color={def.suit ? suitColor(def.id) : '#9fe7ff'} />}
            {it && it.charges > 0 && <span class="cdtxt charges">{it.charges}</span>}
            {it?.item === 'geneSampler' && <span class="cdtxt charges">{it.samples?.length ?? 0}/3</span>}
            {it && it.cd > 0 && <div class="cdmask" style={{ transform: 'scaleY(1)', opacity: 0.6 }} />}
          </div>
        )
      })}
    </div>
  )
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
    if (!raw) return
    let ch: ChatChannel = 'all'
    let body = raw
    if (raw.startsWith('[')) {
      ch = 'team'
      body = raw.slice(1).trim()
    } else if (raw.startsWith(';')) {
      ch = 'group'
      body = raw.slice(1).trim()
    }
    if (world.me.alive === false) ch = 'dead'
    if (body) send({ t: 'chat', ch, text: body })
  }
  return (
    <>
      <div class={'chat' + (chatOpen.value ? ' typing' : '')} data-testid="chatlog">
        {lines.map((l, i) => (
          <div key={i} class={'line ' + (l.ch === 'sys' || l.ch === 'private' ? 'sys' : l.ch)}>
            {l.ch === 'dead' && <span class="dim">[{t('chat.dead')}] </span>}
            {l.ch === 'team' && <span>[{t('chat.team')}] </span>}
            {l.group && <span>[{l.group}] </span>}
            {l.from && <b style={{ color: l.color >= 0 ? PLAYER_COLORS[l.color]?.hex : '#cfd8df' }}>{l.from}: </b>}
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
            placeholder={world.me.alive === false ? t('chat.placeholderDead') : t('chat.placeholder')}
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
  if (!tm) return null
  let name: string
  if (tm.kind === 'attack') name = t('target.attack')
  else if (tm.kind === 'ability') name = loc(ABILITIES.get(tm.id)?.name) + t('target.pick')
  else name = loc(ITEMS.get(world.me.inv?.[tm.slot]?.item ?? '')?.name) + t('target.pick')
  return <div class="panel banner" style={{ top: '96px', color: 'var(--xeno2)' }}>{name}</div>
}
