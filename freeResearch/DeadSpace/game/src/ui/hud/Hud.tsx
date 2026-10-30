// 遊戲 HUD（致敬 WC3 版面）：上方資訊列、左下小地圖、中下頭像與數值、右下指令卡＋背包、左側聊天
import { useEffect, useRef, useState } from 'preact/hooks'
import { PLAYER_COLORS } from '../../shared/constants'
import { ABILITIES, ITEMS, UNITS, abilityDef, buffDef, itemDef } from '../../shared/content/registry'
import { Cell } from '../../shared/layout'
import type { ChatChannel } from '../../shared/protocol/messages'
import { chatLog, isHost, send, sendCmd, snapTick, world, connLost } from '../../client/session'
import { chatOpen, selected, targetMode, type Input } from '../../client/input'
import type { GameScene } from '../../render/gameScene'
import { loc, sysText, t } from '../i18n'
import { Icon } from '../icons'

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
  return (
    <div class="panel hud-top" data-testid="game">
      <span>
        {t('game.time')} <b>{fmtTime(w.t ?? 0)}</b>
      </span>
      {w.stab !== undefined && (
        <span>
          {t('game.stability')} <b>{Math.round((w.stab ?? 1) * 100)}%</b>
        </span>
      )}
      <span data-testid="role" style={{ color: ROLE_COLOR[me.role ?? 'human'], fontFamily: 'var(--title)', letterSpacing: '0.1em' }}>
        {me.role ? t('role.' + me.role) + (me.spawn ? ' spawn' : '') : ''}
      </span>
      {(me.role === 'xeno' || me.role === 'mutant' || me.role === 'android' || me.spawn) && (
        <span>
          {t('hud.ep')} <b>{me.ep ?? 0}</b>
          {me.epNext ? <span class="dim">/{me.epNext}</span> : null}
        </span>
      )}
      {w.pz && <span style={{ color: 'var(--warn)' }}>{t('hud.paused')}</span>}
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
          bx.fillStyle = p.def.kind === 'vendor' ? '#5cf2a5' : p.def.kind === 'git' ? '#33ffd1' : p.def.kind === 'console' ? '#7fd8ff' : '#8a9aa8'
          bx.fillRect(ox + p.col * k - 1, oy + p.row * k - 1, k + 2, k + 2)
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
    const info = scene.zones.get(scene.zone)
    if (!info) return null
    const r = c.getBoundingClientRect()
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

export function Portrait() {
  void snapTick.value
  const id = selected.value || world.me.control || world.me.unit || 0
  const e = world.ents.get(id)
  if (!e) return <div class="panel portrait" />
  const s = e.s
  const def = UNITS.get(s.d ?? '')
  const hp = s.hp ?? 0
  const mhp = s.mhp ?? 1
  const color = (s.c ?? -1) >= 0 ? PLAYER_COLORS[s.c!].hex : '#cfd8df'
  return (
    <div class="panel portrait" data-testid="portrait">
      <div style={{ width: '96px', height: '128px', border: '1px solid var(--line)', display: 'flex', alignItems: 'center', justifyContent: 'center', background: `radial-gradient(circle at 50% 40%, ${color}33, transparent 70%)` }}>
        <Icon name={def?.tags.includes('personnel') ? 'human' : def?.tags.includes('structure') ? 'gear' : 'claw'} color={color} size={56} />
      </div>
      <div class="bars">
        <div style={{ fontWeight: 700, fontSize: '15px', color }}>{s.n || loc(def?.name)}</div>
        <div class="dim" style={{ fontSize: '12px', marginTop: '-4px' }}>
          {loc(def?.name)}
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
              <span key={b} class="tag" title={loc(bd?.name)} style={{ color: bd?.good ? 'var(--good)' : 'var(--alarm)' }}>
                {loc(bd?.name) || b}
              </span>
            )
          })}
        </div>
        {def && (
          <div class="dim mono" style={{ fontSize: '11px' }}>
            {def.attack ? `ATK ${def.attack.dmg[0]}–${def.attack.dmg[1]} · ${def.attack.range}m · ` : ''}SPD {def.speed}
          </div>
        )}
      </div>
    </div>
  )
}

function Tip({ title, body, x, y }: { title: string; body: string; x: number; y: number }) {
  return (
    <div class="panel tooltip" style={{ left: `${Math.min(x, window.innerWidth - 320)}px`, top: `${y - 110}px` }}>
      <b>{title}</b>
      <div class="dim" style={{ marginTop: '4px', whiteSpace: 'pre-line' }}>
        {body}
      </div>
    </div>
  )
}

export function CommandCard({ input }: { input: Input | null }) {
  void snapTick.value
  const [tip, setTip] = useState<{ title: string; body: string; x: number; y: number } | null>(null)
  const abs = (world.me.abilities ?? []).filter((a) => abilityDef(a.id)?.target !== 'passive')
  const passives = (world.me.abilities ?? []).filter((a) => abilityDef(a.id)?.target === 'passive')
  const keys = ['Q', 'W', 'E', 'R', 'D', 'F']
  const basic = [
    { key: 'A', icon: 'attack', name: '攻擊', run: () => (targetMode.value = { kind: 'attack' }) },
    { key: 'S', icon: 'stop', name: '停止', run: () => sendCmd({ k: 'stop' }) },
    { key: 'H', icon: 'hold', name: '原地', run: () => sendCmd({ k: 'hold' }) },
  ]
  return (
    <div class="panel cmdcard">
      <div class="cmdgrid">
        {basic.map((b) => (
          <div class="cmd" key={b.key} onClick={b.run} title={b.name}>
            <span class="key">{b.key}</span>
            <Icon name={b.icon} size={24} />
          </div>
        ))}
        {passives.slice(0, 1).map((p) => {
          const ab = abilityDef(p.id)!
          return (
            <div class="cmd" key={p.id} style={{ opacity: 0.6 }} onMouseEnter={(e) => setTip({ title: loc(ab.name), body: loc(ab.desc), x: e.clientX, y: e.clientY })} onMouseLeave={() => setTip(null)}>
              <Icon name={ab.icon} size={24} color="#8b9aa8" />
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
              onMouseEnter={(e) =>
                setTip({
                  title: `${loc(ab.name)} (${keys[i] ?? ''})`,
                  body: `${loc(ab.desc)}\n${ab.cd ? `冷卻 ${ab.cd}s　` : ''}${ab.mana ? `能量 ${ab.mana}　` : ''}${ab.range ? `射程 ${ab.range}m` : ''}`,
                  x: e.clientX,
                  y: e.clientY,
                })
              }
              onMouseLeave={() => setTip(null)}
            >
              <span class="key">{keys[i] ?? ''}</span>
              <Icon name={ab.icon} size={26} color={st.disabled ? '#666' : '#9fe7ff'} />
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
      {tip && <Tip {...tip} />}
    </div>
  )
}

export function Inventory({ input }: { input: Input | null }) {
  void snapTick.value
  const [tip, setTip] = useState<{ title: string; body: string; x: number; y: number } | null>(null)
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
            onMouseEnter={(e) => def && setTip({ title: loc(def.name), body: loc(def.desc) + (it && it.charges ? `\n充能 ${it.charges}` : ''), x: e.clientX, y: e.clientY })}
            onMouseLeave={() => setTip(null)}
          >
            <span class="key">{i + 1}</span>
            {def && <Icon name={def.icon} size={24} color={def.suit ? '#ffc23d' : '#9fe7ff'} />}
            {it && it.charges > 0 && <span class="cdtxt" style={{ right: '3px', bottom: '1px', fontSize: '10px', position: 'absolute' }}>{it.charges}</span>}
            {it && it.cd > 0 && <div class="cdmask" style={{ transform: 'scaleY(1)', opacity: 0.6 }} />}
          </div>
        )
      })}
      {tip && <Tip {...tip} />}
    </div>
  )
}

export function Chat() {
  const [text, setText] = useState('')
  const inputRef = useRef<HTMLInputElement>(null)
  useEffect(() => {
    if (chatOpen.value) setTimeout(() => inputRef.current?.focus(), 0)
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
      <div class="chat" data-testid="chatlog">
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
            placeholder={t('chat.placeholder')}
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
  let name = ''
  if (tm.kind === 'attack') name = '攻擊：點選目標或地面'
  else if (tm.kind === 'ability') name = loc(ABILITIES.get(tm.id)?.name) + '：選擇目標（右鍵取消）'
  else name = loc(ITEMS.get(world.me.inv?.[tm.slot]?.item ?? '')?.name) + '：選擇目標（右鍵取消）'
  return <div class="panel banner" style={{ top: '96px', color: 'var(--xeno2)' }}>{name}</div>
}
