// 主選單、連線中、大廳的背景彩蛋：「布丁cat」（使用者手繪）像在太空中漂浮的彈力球，碰到畫面邊緣就彈開、慢慢翻滾。
// 只在還沒開始遊戲時出現（App 只在 screen !== 'game' 時掛上），不攔截滑鼠、不影響任何操作。
import { useEffect, useRef } from 'preact/hooks'
import catUrl from './assets/pudding-cat.png'

/** 圖檔的長寬比（300×305）*/
const ASPECT = 305 / 300

/** 彈跳物理：純函式，方便測試。回傳新的狀態（位置是左上角，單位 px）*/
export interface Bounce {
  x: number
  y: number
  vx: number
  vy: number
  rot: number
  spin: number
  /** 碰撞後的壓扁量（0 = 原狀），隨時間回彈 */
  squash: number
  /** 最後一次撞到的是水平邊（x）還是垂直邊（y），決定壓扁方向 */
  axis: 'x' | 'y'
}

export function stepBounce(s: Bounce, dt: number, w: number, h: number, size: number, rand: () => number = Math.random): Bounce {
  const n = { ...s }
  n.x += n.vx * dt
  n.y += n.vy * dt
  n.rot += n.spin * dt
  n.squash = Math.max(0, n.squash - dt * 2.4)
  const maxX = Math.max(0, w - size)
  const maxY = Math.max(0, h - size * ASPECT)
  const kick = () => {
    // 每次反彈稍微改變角度與翻滾，看起來不像機械式的螢幕保護程式
    n.spin = Math.max(-40, Math.min(40, n.spin + (rand() - 0.5) * 30))
    n.squash = 1
  }
  if (n.x < 0 || n.x > maxX) {
    n.x = Math.max(0, Math.min(maxX, n.x))
    n.vx = -n.vx * (0.96 + rand() * 0.08)
    n.vy += (rand() - 0.5) * 30
    n.axis = 'x'
    kick()
  }
  if (n.y < 0 || n.y > maxY) {
    n.y = Math.max(0, Math.min(maxY, n.y))
    n.vy = -n.vy * (0.96 + rand() * 0.08)
    n.vx += (rand() - 0.5) * 30
    n.axis = 'y'
    kick()
  }
  // 速度維持在一定範圍（不會越彈越快或停下來）
  const sp = Math.hypot(n.vx, n.vy)
  const target = 95
  if (sp > 0) {
    const k = Math.max(0.6, Math.min(1.4, target / sp))
    const f = 1 + (k - 1) * Math.min(1, dt * 0.8)
    n.vx *= f
    n.vy *= f
  }
  return n
}

export function SpaceMascot() {
  const ref = useRef<HTMLImageElement>(null)
  useEffect(() => {
    const el = ref.current
    if (!el) return
    const size = () => Math.round(Math.max(90, Math.min(170, window.innerWidth * 0.1)))
    const a = Math.random() * Math.PI * 2
    let s: Bounce = {
      x: Math.random() * Math.max(1, window.innerWidth - size()),
      y: Math.random() * Math.max(1, window.innerHeight - size() * ASPECT),
      vx: Math.cos(a) * 95,
      vy: Math.sin(a) * 95,
      rot: Math.random() * 360,
      spin: (Math.random() < 0.5 ? -1 : 1) * (10 + Math.random() * 15),
      squash: 0,
      axis: 'x',
    }
    let last = performance.now()
    let raf = 0
    const frame = (now: number) => {
      raf = requestAnimationFrame(frame)
      // 分頁切回來時不要一口氣跳一大段
      const dt = Math.min(0.05, (now - last) / 1000)
      last = now
      const sz = size()
      s = stepBounce(s, dt, window.innerWidth, window.innerHeight, sz)
      // 撞到邊時沿撞擊方向壓扁一下（彈力球）
      const q = Math.sin(Math.min(1, s.squash) * Math.PI) * 0.18
      const sx = s.axis === 'x' ? 1 - q : 1 + q * 0.6
      const sy = s.axis === 'y' ? 1 - q : 1 + q * 0.6
      el.style.width = `${sz}px`
      el.style.transform = `translate(${s.x.toFixed(1)}px, ${s.y.toFixed(1)}px) rotate(${s.rot.toFixed(1)}deg) scale(${sx.toFixed(3)}, ${sy.toFixed(3)})`
    }
    raf = requestAnimationFrame(frame)
    return () => cancelAnimationFrame(raf)
  }, [])
  return (
    // 不套介面縮放（位置以視窗像素計算）
    <div class="space-mascot" aria-hidden="true" style={{ zoom: 1 }}>
      <img ref={ref} src={catUrl} alt="" draggable={false} data-testid="space-mascot" />
    </div>
  )
}
