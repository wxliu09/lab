// 監視器回放：把主機送來的 15 秒低頻畫面畫成俯視戰術圖（牆、門、單位點與名字），可播放與拖曳
import { useEffect, useMemo, useRef, useState } from 'preact/hooks'
import { PLAYER_COLORS } from '../../shared/constants'
import { parseLayout, type ParsedLayout } from '../../shared/layout'
import { UNITS } from '../../shared/content/registry'
import { replay, startInfo } from '../../client/session'
import { stationDefOf } from '../../render/gameScene'
import { loc, t } from '../i18n'

const layouts = new Map<string, ParsedLayout>()
function layoutFor(stationId: string): ParsedLayout | null {
  let l = layouts.get(stationId)
  if (!l) {
    const st = stationDefOf(stationId)
    if (!st) return null
    l = parseLayout(st.layout)
    layouts.set(stationId, l)
  }
  return l
}

const W = 300
const H = 300

export function ReplayPanel() {
  const r = replay.value
  const ref = useRef<HTMLCanvasElement>(null)
  const [frame, setFrame] = useState(0)
  const [playing, setPlaying] = useState(true)
  const zoneInfo = startInfo.value?.zones.find((z) => z[0] === r?.zone)
  const layout = useMemo(() => (zoneInfo ? layoutFor(zoneInfo[2]) : null), [zoneInfo?.[2]])
  useEffect(() => {
    setFrame(0)
    setPlaying(true)
  }, [r])
  useEffect(() => {
    if (!r || !playing) return
    const id = setInterval(() => setFrame((f) => (f + 1 >= r.frames.length ? (setPlaying(false), f) : f + 1)), 500)
    return () => clearInterval(id)
  }, [r, playing])
  useEffect(() => {
    const c = ref.current
    if (!c || !r) return
    const ctx = c.getContext('2d')!
    const span = r.r * 2 + 2
    const k = W / span
    const cx = r.x / 10
    const cy = r.y / 10
    const toPx = (x: number, y: number): [number, number] => [(x - cx) * k + W / 2, H / 2 - (y - cy) * k]
    ctx.fillStyle = '#05080c'
    ctx.fillRect(0, 0, W, H)
    if (layout) {
      for (let row = 0; row < layout.h; row++) {
        for (let col = 0; col < layout.w; col++) {
          const x = col + 0.5
          const y = layout.h - row - 0.5
          if (Math.abs(x - cx) > span / 2 + 1 || Math.abs(y - cy) > span / 2 + 1) continue
          const cell = layout.cells[row * layout.w + col]
          const [px, py] = toPx(x - 0.5, y + 0.5)
          if (cell === 2) ctx.fillStyle = '#2a3a48'
          else if (cell === 3) ctx.fillStyle = '#3c6a86'
          else if (cell === 5) ctx.fillStyle = '#ffb46b'
          else if (cell === 0) continue
          else ctx.fillStyle = '#0d151d'
          ctx.fillRect(px, py, k + 0.5, k + 0.5)
        }
      }
    }
    // 視野圈與鏡頭
    ctx.strokeStyle = 'rgba(159,231,255,0.25)'
    ctx.beginPath()
    ctx.arc(W / 2, H / 2, r.r * k, 0, Math.PI * 2)
    ctx.stroke()
    ctx.fillStyle = '#9fe7ff'
    ctx.fillRect(W / 2 - 3, H / 2 - 3, 6, 6)
    const f = r.frames[Math.min(frame, r.frames.length - 1)]
    if (f) {
      ctx.font = '11px "Noto Sans TC", sans-serif'
      ctx.textAlign = 'center'
      for (const [d, x, y, color, name, st] of f.u) {
        const [px, py] = toPx(x / 10, y / 10)
        const def = UNITS.get(d)
        const dead = st === 4
        const rad = Math.max(3, (def?.radius ?? 0.4) * k)
        ctx.globalAlpha = dead ? 0.45 : 1
        ctx.fillStyle = color >= 0 ? (PLAYER_COLORS[color]?.hex ?? '#ccc') : def?.tags.includes('creature') ? '#ff7a6a' : '#b8c4cf'
        ctx.beginPath()
        ctx.arc(px, py, rad, 0, Math.PI * 2)
        ctx.fill()
        ctx.globalAlpha = 1
        const label = name || loc(def?.name)
        if (label) {
          ctx.fillStyle = '#dfe9f1'
          ctx.fillText(label, px, py - rad - 3)
        }
      }
    }
  }, [r, frame, layout])
  if (!r) return null
  const n = r.frames.length
  const cur = r.frames[Math.min(frame, n - 1)]?.t ?? 0
  return (
    <div class="panel" data-testid="replay" style={{ position: 'absolute', right: '190px', top: '54px', padding: '8px' }}>
      <div class="row" style={{ gap: '6px', marginBottom: '6px' }}>
        <b class="grow">{t('feed.replay')}</b>
        <span class="dim mono">-{Math.max(0, Math.round((r.frames[n - 1]?.t ?? 0) - cur) / 10).toFixed(1)}s</span>
        <button class="small ghost" onClick={() => (replay.value = null)}>
          ✕
        </button>
      </div>
      <canvas ref={ref} width={W} height={H} style={{ width: W + 'px', height: H + 'px', display: 'block', borderRadius: '2px' }} />
      <div class="row" style={{ gap: '6px', marginTop: '6px' }}>
        <button class="small" onClick={() => (frame >= n - 1 ? (setFrame(0), setPlaying(true)) : setPlaying(!playing))}>
          {playing ? '❚❚' : '▶'}
        </button>
        <input type="range" class="grow" min={0} max={Math.max(0, n - 1)} value={frame} onInput={(e) => (setPlaying(false), setFrame(Number((e.target as HTMLInputElement).value)))} />
      </div>
      {n === 0 && <div class="dim">{t('feed.noReplay')}</div>}
    </div>
  )
}
