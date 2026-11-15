// EP 回饋：吞噬、啃食、殺死無辜者、對人造成重傷等「一次加不少 EP」的時候，在自己頭上浮出「+N EP」，
// 往上飄 1.6 秒後淡出。被動累積（每秒零點幾到幾點）不顯示，免得頭上一直冒字。
// 只讀自己的私有狀態（world.me.ep）與自己單位的畫面位置，不洩漏任何資訊。
import { effect } from '@preact/signals'
import { useEffect, useRef, useState } from 'preact/hooks'
import type { PrivateState } from '../../shared/protocol/messages'
import { snapTick, world } from '../../client/session'
import type { GameScene } from '../../render/gameScene'
import { uiZoom } from '../uiScale'
import { t } from '../i18n'

/**
 * 兩份快照之間至少加這麼多才顯示。被動累積每秒結算一次：仿生人 1.5、異形 0.4＋眷屬與卵的加成，
 * 再乘大廳的 EP 倍率（最高 4 倍）＝最多約 9；吞噬最少 25、啃食 140、殺人 175。
 */
export const EP_GAIN_MIN = 12
/** 浮字存在的秒數 */
export const EP_GAIN_LIFE = 1.6

/** 追蹤自己的 EP：update() 回傳這份快照該顯示的增量（不該顯示時 0）。身分、座位換了就重新起算 */
export class EpWatch {
  private last: number | null = null
  private key = ''

  update(me: Partial<PrivateState>): number {
    const key = `${me.slot ?? -1}|${me.role ?? ''}|${me.spawn ? 1 : 0}`
    const ok = me.alive !== false && !me.spawn && (me.role === 'xeno' || me.role === 'mutant' || me.role === 'android') && typeof me.ep === 'number'
    if (!ok || key !== this.key) {
      this.key = key
      this.last = ok ? me.ep! : null
      return 0
    }
    const prev = this.last
    this.last = me.ep!
    if (prev === null) return 0
    const d = me.ep! - prev
    return d >= EP_GAIN_MIN ? Math.round(d) : 0
  }
}

/** 身分的文字色（同目標面板與進化選單）*/
const COLOR: Record<string, string> = { xeno: '#b28cff', mutant: '#ff6b72', android: '#ffc23d' }

interface Pop {
  id: number
  n: number
  born: number
  color: string
}

let seq = 0

export function EpGain({ scene }: { scene: GameScene }) {
  const [pops, setPops] = useState<Pop[]>([])
  const live = useRef<Pop[]>([])
  live.current = pops
  const els = useRef(new Map<number, HTMLDivElement>())
  const root = useRef<HTMLDivElement>(null)

  // 每份快照比較一次自己的 EP
  useEffect(() => {
    const watch = new EpWatch()
    return effect(() => {
      void snapTick.value
      const n = watch.update(world.me)
      if (n > 0) {
        const pop = { id: ++seq, n, born: performance.now(), color: COLOR[world.me.role ?? ''] ?? '#9fe7ff' }
        // 同時最多 3 個（連續吞噬時舊的往上飄、新的從頭上冒出來）
        setPops((p) => [...p.slice(-2), pop])
      }
    })
  }, [])

  // 有浮字時每幀跟著自己的單位定位（鏡頭會動）；全部飄完就停
  useEffect(() => {
    if (!pops.length) return
    let raf = 0
    const step = () => {
      const now = performance.now()
      const layer = root.current?.parentElement
      const id = world.me.control ?? world.me.unit ?? 0
      const uv = scene.units.views.get(id)
      const e = world.ents.get(id)
      let sx = NaN
      let sy = NaN
      if (layer && uv && e && (e.s.z ?? scene.zone) === scene.zone) {
        // 名字標籤畫在單位頭頂上方 0.35 m：浮字從再高一點的地方開始
        const v = uv.root.position.clone()
        v.y += uv.height + 0.8
        v.project(scene.camera)
        if (v.z <= 1 && Math.abs(v.x) <= 1.05 && Math.abs(v.y) <= 1.05) {
          sx = (v.x * 0.5 + 0.5) * layer.clientWidth
          sy = (-v.y * 0.5 + 0.5) * layer.clientHeight
        }
      }
      // 介面套了 CSS zoom：螢幕座標要除回去
      const z = uiZoom.value || 1
      let alive = 0
      for (const p of live.current) {
        const el = els.current.get(p.id)
        const k = (now - p.born) / 1000 / EP_GAIN_LIFE
        if (k < 1) alive++
        if (!el) continue
        if (k >= 1 || !Number.isFinite(sx)) {
          el.style.opacity = '0'
          continue
        }
        const rise = 46 * (1 - (1 - k) * (1 - k))
        el.style.transform = `translate(${sx / z}px, ${(sy - rise) / z}px) translate(-50%, -100%) scale(${k < 0.12 ? 0.8 + k * 1.6 : 1})`
        el.style.opacity = String(k < 0.12 ? k / 0.12 : k > 0.65 ? Math.max(0, 1 - (k - 0.65) / 0.35) : 1)
      }
      if (!alive) {
        setPops([])
        return
      }
      raf = requestAnimationFrame(step)
    }
    raf = requestAnimationFrame(step)
    return () => cancelAnimationFrame(raf)
  }, [pops, scene])

  return (
    <div class="ep-pops" ref={root} aria-hidden="true">
      {pops.map((p) => (
        <div
          key={p.id}
          class="ep-pop"
          data-testid="ep-pop"
          style={{ color: p.color, opacity: 0 }}
          ref={(el) => {
            if (el) els.current.set(p.id, el)
            else els.current.delete(p.id)
          }}
        >
          {t('ui5.ep.gain', { n: p.n })}
        </div>
      ))}
    </div>
  )
}
