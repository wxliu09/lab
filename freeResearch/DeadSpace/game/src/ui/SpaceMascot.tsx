// 主選單、連線中、大廳的背景彩蛋：「布丁cat」（使用者手繪）像在太空中漂浮的彈力球，碰到畫面邊緣就彈開、慢慢翻滾。
// 只在還沒開始遊戲時出現（App 只在 screen !== 'game' 時掛上），不攔截滑鼠、不影響任何操作。
// 大廳（第 7 輪）：玩家清單、設定面板幾乎佔滿畫面，大貓會從半透明的面板後面透出來；改成縮小、只在大廳左右的空白邊上下漂，
// 永遠不跑到面板後面（空白邊太窄就不出現）。主選單照舊（刻意的彩蛋）。
import { useEffect, useRef } from 'preact/hooks'
import catUrl from './assets/pudding-cat.webp'
import './screens7.css'

/** 圖檔的長寬比（640×652）*/
export const ASPECT = 652 / 640

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

export function stepBounce(s: Bounce, dt: number, w: number, h: number, size: number, rand: () => number = Math.random, target = 95): Bounce {
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
  if (sp > 0) {
    const k = Math.max(0.6, Math.min(1.4, target / sp))
    const f = 1 + (k - 1) * Math.min(1, dt * 0.8)
    n.vx *= f
    n.vy *= f
  }
  return n
}

/** 大廳的走道：大廳面板左右兩側比較寬的那一條空白邊（px）；null = 太窄放不下 */
export interface LaneBox {
  x: number
  w: number
  h: number
  /** 貓的寬度 */
  size: number
}

/** 大廳裡貓最小、最大的寬度（px）：小於最小值就不出現 */
export const LANE_MIN = 32
export const LANE_MAX = 120

export function lobbyLane(rect: { left: number; right: number }, w: number, h: number): LaneBox | null {
  const left = Math.max(0, rect.left)
  const right = Math.max(0, w - rect.right)
  const wide = Math.max(left, right)
  // 留兩成邊距：貓翻滾時的對角線也不會碰到面板
  const size = Math.min(LANE_MAX, Math.floor(wide * 0.72))
  if (size < LANE_MIN) return null
  return { x: left >= right ? 0 : w - right, w: wide, h, size }
}

/** 走道裡的漂浮：上下來回、慢慢翻滾（左右的擺動由呼叫端用 t 算）*/
export interface Drift {
  y: number
  vy: number
  rot: number
  spin: number
  squash: number
  t: number
}

export function stepDrift(s: Drift, dt: number, h: number, size: number, rand: () => number = Math.random): Drift {
  const n = { ...s, t: s.t + dt }
  n.y += n.vy * dt
  n.rot += n.spin * dt
  n.squash = Math.max(0, n.squash - dt * 2.4)
  // 翻滾時的外接圓：對角線的一半（不會轉出走道的上下緣）
  const pad = size * 0.2
  const maxY = Math.max(pad, h - size * ASPECT - pad)
  if (n.y < pad || n.y > maxY) {
    n.y = Math.max(pad, Math.min(maxY, n.y))
    n.vy = -n.vy
    n.spin = Math.max(-30, Math.min(30, n.spin + (rand() - 0.5) * 24))
    n.squash = 1
  }
  return n
}

/** 走道裡貓左上角的 x：走道中央，左右緩慢擺動（擺幅 = 走道剩下的空間）*/
export function driftX(lane: LaneBox, t: number): number {
  // 翻滾時的外接寬度約 1.42 倍（對角線）：走道只夠放下時就不擺
  const slack = Math.max(0, lane.w - lane.size * 1.42)
  return lane.x + (lane.w - lane.size) / 2 + Math.sin(t * 0.7) * slack * 0.5
}

export function SpaceMascot({ lobby = false }: { lobby?: boolean }) {
  const ref = useRef<HTMLImageElement>(null)
  useEffect(() => {
    const el = ref.current
    if (!el || !lobby) return
    // 大廳：量大廳面板的位置（每半秒量一次、視窗改大小也量），貓只在左右的空白邊上
    let lane: LaneBox | null = null
    let measuredAt = -1
    const measure = (now: number) => {
      measuredAt = now
      const box = document.querySelector('[data-testid="lobby"]')?.getBoundingClientRect()
      lane = box ? lobbyLane(box, window.innerWidth, window.innerHeight) : null
    }
    let d: Drift = { y: Math.random() * window.innerHeight * 0.6, vy: (Math.random() < 0.5 ? -1 : 1) * 30, rot: Math.random() * 360, spin: (Math.random() < 0.5 ? -1 : 1) * (8 + Math.random() * 10), squash: 0, t: Math.random() * 10 }
    let last = performance.now()
    let raf = 0
    const frame = (now: number) => {
      raf = requestAnimationFrame(frame)
      const dt = Math.min(0.05, (now - last) / 1000)
      last = now
      if (now - measuredAt > 500) measure(now)
      if (!lane) {
        el.style.visibility = 'hidden'
        return
      }
      el.style.visibility = ''
      const sz = lane.size
      // 速度跟著大小（每秒約自身寬度的 0.4 倍）
      d.vy = Math.sign(d.vy || 1) * sz * 0.4
      d = stepDrift(d, dt, lane.h, sz)
      const q = Math.sin(Math.min(1, d.squash) * Math.PI) * 0.16
      el.style.width = `${sz}px`
      el.style.transform = `translate(${driftX(lane, d.t).toFixed(1)}px, ${d.y.toFixed(1)}px) rotate(${d.rot.toFixed(1)}deg) scale(${(1 + q * 0.6).toFixed(3)}, ${(1 - q).toFixed(3)})`
    }
    const onResize = () => measure(performance.now())
    window.addEventListener('resize', onResize)
    raf = requestAnimationFrame(frame)
    return () => {
      cancelAnimationFrame(raf)
      window.removeEventListener('resize', onResize)
      el.style.visibility = ''
    }
  }, [lobby])
  useEffect(() => {
    const el = ref.current
    if (!el || lobby) return
    // 大小跟著畫面：較短邊的 30%（1280×720 約 216 px、1920×1080 約 324 px），太小看不清楚
    const size = () => Math.round(Math.max(150, Math.min(380, Math.min(window.innerWidth, window.innerHeight) * 0.3)))
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
      // 速度跟著大小（每秒約自身寬度的 0.45 倍），不同解析度看起來一樣快
      s = stepBounce(s, dt, window.innerWidth, window.innerHeight, sz, Math.random, sz * 0.45)
      // 撞到邊時沿撞擊方向壓扁一下（彈力球）
      const q = Math.sin(Math.min(1, s.squash) * Math.PI) * 0.18
      const sx = s.axis === 'x' ? 1 - q : 1 + q * 0.6
      const sy = s.axis === 'y' ? 1 - q : 1 + q * 0.6
      el.style.width = `${sz}px`
      el.style.transform = `translate(${s.x.toFixed(1)}px, ${s.y.toFixed(1)}px) rotate(${s.rot.toFixed(1)}deg) scale(${sx.toFixed(3)}, ${sy.toFixed(3)})`
    }
    raf = requestAnimationFrame(frame)
    return () => cancelAnimationFrame(raf)
  }, [lobby])
  return (
    // 不套介面縮放（位置以視窗像素計算）
    <div class={'space-mascot' + (lobby ? ' in-lobby' : '')} aria-hidden="true" style={{ zoom: 1 }}>
      <img ref={ref} src={catUrl} alt="" draggable={false} data-testid="space-mascot" />
    </div>
  )
}
