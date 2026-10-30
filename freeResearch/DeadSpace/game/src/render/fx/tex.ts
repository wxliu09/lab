// 特效用程序化貼圖（canvas 生成、全域快取、不 dispose）：光暈、星芒、衝擊環、焦痕、裂紋、霜、蛛網、黏液、六角網格、鐘面、危險標誌…
import * as THREE from 'three'

export type FxTexName =
  | 'soft'
  | 'star'
  | 'ring'
  | 'scorch'
  | 'crack'
  | 'frost'
  | 'web'
  | 'splat'
  | 'hex'
  | 'clock'
  | 'trefoil'
  | 'cross'
  | 'lock'
  | 'unlock'
  | 'swirl'
  | 'streak'
  | 'noise'
  | 'arrows'
  | 'smoke'
  | 'bolt'
  | 'muted'
  | 'grid'
  | 'flare'
  | 'grad'
  | 'embers'

const cache = new Map<string, THREE.Texture>()

/** 可重現的亂數（同一張貼圖每次長得一樣）*/
function rng(seed: number): () => number {
  let s = seed >>> 0 || 1
  return () => {
    s ^= s << 13
    s ^= s >>> 17
    s ^= s << 5
    return ((s >>> 0) % 100000) / 100000
  }
}

function canvas(w: number, h = w): [HTMLCanvasElement, CanvasRenderingContext2D] {
  const c = document.createElement('canvas')
  c.width = w
  c.height = h
  return [c, c.getContext('2d')!]
}

function radial(x: CanvasRenderingContext2D, cx: number, cy: number, r: number, stops: [number, string][]): void {
  const g = x.createRadialGradient(cx, cy, 0, cx, cy, r)
  for (const [k, c] of stops) g.addColorStop(k, c)
  x.fillStyle = g
  x.fillRect(cx - r, cy - r, r * 2, r * 2)
}

const BUILDERS: Record<FxTexName, () => HTMLCanvasElement> = {
  embers: () => {
    // 圓形遮罩的斑駁雜訊（餘燼、液面反光、污染地面）：邊緣淡出，不會露出方形邊
    const src = BUILDERS.noise()
    const [c, x] = canvas(128)
    x.drawImage(src, 0, 0)
    const img = x.getImageData(0, 0, 128, 128)
    for (let j = 0; j < 128; j++)
      for (let i = 0; i < 128; i++) {
        const k = (j * 128 + i) * 4
        const d = Math.hypot(i - 63.5, j - 63.5) / 64
        const n = img.data[k] / 255
        const m = Math.max(0, 1 - d) ** 0.8
        const v = Math.max(0, Math.min(1, (n - 0.35) * 2.2)) * m
        img.data[k] = img.data[k + 1] = img.data[k + 2] = 255
        img.data[k + 3] = Math.round(v * 255)
      }
    x.putImageData(img, 0, 0)
    return c
  },
  grad: () => {
    // 光柱：底部亮、往上淡出，帶細直紋
    const [c, x] = canvas(64, 128)
    const r = rng(41)
    for (let i = 0; i < 64; i++) {
      const g = x.createLinearGradient(0, 128, 0, 0)
      const s = 0.55 + r() * 0.45
      g.addColorStop(0, `rgba(255,255,255,${s})`)
      g.addColorStop(0.35, `rgba(255,255,255,${s * 0.45})`)
      g.addColorStop(1, 'rgba(255,255,255,0)')
      x.fillStyle = g
      x.fillRect(i, 0, 1, 128)
    }
    return c
  },
  soft: () => {
    const [c, x] = canvas(64)
    radial(x, 32, 32, 32, [
      [0, 'rgba(255,255,255,1)'],
      [0.25, 'rgba(255,255,255,0.55)'],
      [0.6, 'rgba(255,255,255,0.12)'],
      [1, 'rgba(255,255,255,0)'],
    ])
    return c
  },
  star: () => {
    const [c, x] = canvas(128)
    radial(x, 64, 64, 64, [
      [0, 'rgba(255,255,255,1)'],
      [0.12, 'rgba(255,255,255,0.7)'],
      [0.4, 'rgba(255,255,255,0.08)'],
      [1, 'rgba(255,255,255,0)'],
    ])
    x.globalCompositeOperation = 'lighter'
    for (const [a, len, w] of [
      [0, 64, 3],
      [Math.PI / 2, 64, 3],
      [Math.PI / 4, 36, 1.5],
      [-Math.PI / 4, 36, 1.5],
    ] as const) {
      x.save()
      x.translate(64, 64)
      x.rotate(a)
      const g = x.createLinearGradient(-len, 0, len, 0)
      g.addColorStop(0, 'rgba(255,255,255,0)')
      g.addColorStop(0.5, 'rgba(255,255,255,0.95)')
      g.addColorStop(1, 'rgba(255,255,255,0)')
      x.fillStyle = g
      x.fillRect(-len, -w, len * 2, w * 2)
      x.restore()
    }
    return c
  },
  flare: () => {
    // 橫向鏡頭光條（強光、雷射）
    const [c, x] = canvas(256, 64)
    const g = x.createLinearGradient(0, 0, 256, 0)
    g.addColorStop(0, 'rgba(255,255,255,0)')
    g.addColorStop(0.5, 'rgba(255,255,255,1)')
    g.addColorStop(1, 'rgba(255,255,255,0)')
    x.fillStyle = g
    for (let i = 0; i < 64; i++) {
      const k = 1 - Math.abs(i - 32) / 32
      x.globalAlpha = k ** 4
      x.fillRect(0, i, 256, 1)
    }
    return c
  },
  ring: () => {
    const [c, x] = canvas(128)
    const g = x.createRadialGradient(64, 64, 0, 64, 64, 64)
    g.addColorStop(0, 'rgba(255,255,255,0)')
    g.addColorStop(0.62, 'rgba(255,255,255,0.03)')
    g.addColorStop(0.86, 'rgba(255,255,255,0.9)')
    g.addColorStop(0.92, 'rgba(255,255,255,0.5)')
    g.addColorStop(1, 'rgba(255,255,255,0)')
    x.fillStyle = g
    x.fillRect(0, 0, 128, 128)
    return c
  },
  scorch: () => {
    const [c, x] = canvas(256)
    const r = rng(7)
    radial(x, 128, 128, 128, [
      [0, 'rgba(8,6,5,0.95)'],
      [0.35, 'rgba(14,11,9,0.85)'],
      [0.7, 'rgba(20,16,12,0.35)'],
      [1, 'rgba(20,16,12,0)'],
    ])
    // 放射狀燒痕
    x.strokeStyle = 'rgba(5,4,3,0.55)'
    for (let i = 0; i < 46; i++) {
      const a = r() * Math.PI * 2
      const l0 = 20 + r() * 30
      const l1 = 70 + r() * 55
      x.lineWidth = 1 + r() * 5
      x.beginPath()
      x.moveTo(128 + Math.cos(a) * l0, 128 + Math.sin(a) * l0)
      x.lineTo(128 + Math.cos(a + (r() - 0.5) * 0.2) * l1, 128 + Math.sin(a + (r() - 0.5) * 0.2) * l1)
      x.stroke()
    }
    // 碎屑斑點
    for (let i = 0; i < 160; i++) {
      const a = r() * Math.PI * 2
      const d = 30 + r() * 95
      x.fillStyle = `rgba(${10 + r() * 20},${8 + r() * 12},6,${0.2 + r() * 0.5})`
      x.beginPath()
      x.arc(128 + Math.cos(a) * d, 128 + Math.sin(a) * d, 0.5 + r() * 3, 0, Math.PI * 2)
      x.fill()
    }
    return c
  },
  crack: () => {
    const [c, x] = canvas(256)
    const r = rng(11)
    x.lineCap = 'round'
    const branch = (px: number, py: number, a: number, len: number, w: number, depth: number) => {
      let cx = px
      let cy = py
      const steps = 6
      for (let i = 0; i < steps; i++) {
        const nx = cx + Math.cos(a) * (len / steps)
        const ny = cy + Math.sin(a) * (len / steps)
        x.lineWidth = w * (1 - i / steps) + 0.6
        x.strokeStyle = 'rgba(255,255,255,0.95)'
        x.beginPath()
        x.moveTo(cx, cy)
        x.lineTo(nx, ny)
        x.stroke()
        cx = nx
        cy = ny
        a += (r() - 0.5) * 0.7
        if (depth > 0 && r() < 0.3) branch(cx, cy, a + (r() - 0.5) * 1.6, len * 0.45, w * 0.6, depth - 1)
      }
    }
    for (let i = 0; i < 9; i++) branch(128, 128, (i / 9) * Math.PI * 2 + r() * 0.4, 70 + r() * 50, 4, 2)
    return c
  },
  frost: () => {
    const [c, x] = canvas(256)
    const r = rng(23)
    radial(x, 128, 128, 128, [
      [0, 'rgba(230,248,255,0.55)'],
      [0.6, 'rgba(200,236,255,0.25)'],
      [1, 'rgba(200,236,255,0)'],
    ])
    x.strokeStyle = 'rgba(255,255,255,0.85)'
    const crystal = (px: number, py: number, a: number, len: number, depth: number) => {
      const ex = px + Math.cos(a) * len
      const ey = py + Math.sin(a) * len
      x.lineWidth = Math.max(0.6, depth * 0.9)
      x.beginPath()
      x.moveTo(px, py)
      x.lineTo(ex, ey)
      x.stroke()
      if (depth <= 0) return
      for (let k = 1; k <= 3; k++) {
        const t = k / 4
        const bx = px + (ex - px) * t
        const by = py + (ey - py) * t
        crystal(bx, by, a + 0.9, len * 0.35, depth - 1)
        crystal(bx, by, a - 0.9, len * 0.35, depth - 1)
      }
    }
    for (let i = 0; i < 7; i++) crystal(128, 128, (i / 7) * Math.PI * 2 + r() * 0.3, 80 + r() * 40, 2)
    return c
  },
  web: () => {
    const [c, x] = canvas(256)
    const r = rng(5)
    x.strokeStyle = 'rgba(255,255,255,0.9)'
    const spokes = 11
    const ang: number[] = []
    for (let i = 0; i < spokes; i++) ang.push((i / spokes) * Math.PI * 2 + (r() - 0.5) * 0.25)
    x.lineWidth = 1.6
    for (const a of ang) {
      x.beginPath()
      x.moveTo(128, 128)
      x.lineTo(128 + Math.cos(a) * 124, 128 + Math.sin(a) * 124)
      x.stroke()
    }
    x.lineWidth = 1
    for (let ringR = 14; ringR < 122; ringR += 9 + r() * 5) {
      x.beginPath()
      for (let i = 0; i <= spokes; i++) {
        const a = ang[i % spokes]
        const rr = ringR * (0.92 + r() * 0.12)
        const px = 128 + Math.cos(a) * rr
        const py = 128 + Math.sin(a) * rr
        if (i === 0) x.moveTo(px, py)
        else x.quadraticCurveTo(128 + Math.cos(a - 0.3) * rr * 0.93, 128 + Math.sin(a - 0.3) * rr * 0.93, px, py)
      }
      x.stroke()
    }
    // 中心黏團
    radial(x, 128, 128, 18, [
      [0, 'rgba(255,255,255,0.9)'],
      [1, 'rgba(255,255,255,0)'],
    ])
    return c
  },
  splat: () => {
    const [c, x] = canvas(128)
    const r = rng(19)
    x.fillStyle = 'rgba(255,255,255,1)'
    x.beginPath()
    for (let i = 0; i <= 24; i++) {
      const a = (i / 24) * Math.PI * 2
      const rr = 34 + r() * 14 + (i % 3 === 0 ? r() * 14 : 0)
      const px = 64 + Math.cos(a) * rr
      const py = 64 + Math.sin(a) * rr
      if (i === 0) x.moveTo(px, py)
      else x.lineTo(px, py)
    }
    x.fill()
    for (let i = 0; i < 18; i++) {
      const a = r() * Math.PI * 2
      const d = 44 + r() * 18
      x.beginPath()
      x.arc(64 + Math.cos(a) * d, 64 + Math.sin(a) * d, 1.5 + r() * 4, 0, Math.PI * 2)
      x.fill()
    }
    // 內部高光（濕潤感）
    x.globalCompositeOperation = 'destination-out'
    radial(x, 58, 56, 30, [
      [0, 'rgba(0,0,0,0.35)'],
      [1, 'rgba(0,0,0,0)'],
    ])
    return c
  },
  hex: () => {
    const [c, x] = canvas(256)
    const s = 16
    const h = Math.sqrt(3) * s
    x.strokeStyle = 'rgba(255,255,255,0.95)'
    x.lineWidth = 2
    for (let row = -1; row < 256 / h + 1; row++) {
      for (let col = -1; col < 256 / (s * 1.5) + 1; col++) {
        const cx = col * s * 1.5
        const cy = row * h + (col % 2 ? h / 2 : 0)
        x.beginPath()
        for (let i = 0; i <= 6; i++) {
          const a = (i / 6) * Math.PI * 2
          const px = cx + Math.cos(a) * s * 0.92
          const py = cy + Math.sin(a) * s * 0.92
          if (i === 0) x.moveTo(px, py)
          else x.lineTo(px, py)
        }
        x.stroke()
      }
    }
    return c
  },
  clock: () => {
    const [c, x] = canvas(256)
    x.translate(128, 128)
    x.strokeStyle = 'rgba(255,255,255,0.95)'
    x.lineWidth = 3
    x.beginPath()
    x.arc(0, 0, 122, 0, Math.PI * 2)
    x.stroke()
    x.lineWidth = 1.2
    x.beginPath()
    x.arc(0, 0, 100, 0, Math.PI * 2)
    x.stroke()
    for (let i = 0; i < 60; i++) {
      const a = (i / 60) * Math.PI * 2
      const big = i % 5 === 0
      x.lineWidth = big ? 4 : 1.5
      x.beginPath()
      x.moveTo(Math.cos(a) * (big ? 104 : 110), Math.sin(a) * (big ? 104 : 110))
      x.lineTo(Math.cos(a) * 119, Math.sin(a) * 119)
      x.stroke()
    }
    // 內圈刻度符文（抽象符號，不是文字）
    const r = rng(3)
    for (let i = 0; i < 12; i++) {
      const a = (i / 12) * Math.PI * 2
      x.save()
      x.rotate(a)
      x.translate(0, -84)
      x.lineWidth = 2
      x.beginPath()
      const n = 2 + Math.floor(r() * 3)
      for (let k = 0; k < n; k++) {
        x.moveTo(-6 + k * 4, -6)
        x.lineTo(-6 + k * 4 + (r() - 0.5) * 6, 6)
      }
      x.stroke()
      x.restore()
    }
    // 指針
    x.lineWidth = 5
    x.beginPath()
    x.moveTo(0, 0)
    x.lineTo(0, -70)
    x.stroke()
    x.lineWidth = 3
    x.beginPath()
    x.moveTo(0, 0)
    x.lineTo(48, 18)
    x.stroke()
    return c
  },
  trefoil: () => {
    const [c, x] = canvas(256)
    x.translate(128, 128)
    x.fillStyle = 'rgba(255,255,255,1)'
    x.beginPath()
    x.arc(0, 0, 16, 0, Math.PI * 2)
    x.fill()
    for (let i = 0; i < 3; i++) {
      const a0 = -Math.PI / 2 + (i / 3) * Math.PI * 2 - Math.PI / 6
      x.beginPath()
      x.arc(0, 0, 96, a0, a0 + Math.PI / 3)
      x.arc(0, 0, 28, a0 + Math.PI / 3, a0, true)
      x.closePath()
      x.fill()
    }
    x.lineWidth = 6
    x.strokeStyle = 'rgba(255,255,255,1)'
    x.beginPath()
    x.arc(0, 0, 118, 0, Math.PI * 2)
    x.stroke()
    return c
  },
  cross: () => {
    const [c, x] = canvas(128)
    x.fillStyle = 'rgba(255,255,255,1)'
    x.fillRect(48, 16, 32, 96)
    x.fillRect(16, 48, 96, 32)
    return c
  },
  lock: () => {
    const [c, x] = canvas(128)
    x.fillStyle = 'rgba(255,255,255,1)'
    x.strokeStyle = 'rgba(255,255,255,1)'
    x.lineWidth = 12
    x.beginPath()
    x.arc(64, 54, 24, Math.PI, 0)
    x.lineTo(88, 62)
    x.moveTo(40, 62)
    x.lineTo(40, 54)
    x.stroke()
    x.fillRect(28, 60, 72, 54)
    x.globalCompositeOperation = 'destination-out'
    x.beginPath()
    x.arc(64, 82, 7, 0, Math.PI * 2)
    x.fill()
    x.fillRect(61, 84, 6, 16)
    return c
  },
  unlock: () => {
    const [c, x] = canvas(128)
    x.fillStyle = 'rgba(255,255,255,1)'
    x.strokeStyle = 'rgba(255,255,255,1)'
    x.lineWidth = 12
    x.beginPath()
    x.arc(64, 40, 24, Math.PI, 0)
    x.moveTo(40, 40)
    x.lineTo(40, 30)
    x.stroke()
    x.fillRect(28, 60, 72, 54)
    x.globalCompositeOperation = 'destination-out'
    x.beginPath()
    x.arc(64, 82, 7, 0, Math.PI * 2)
    x.fill()
    x.fillRect(61, 84, 6, 16)
    return c
  },
  swirl: () => {
    const [c, x] = canvas(256)
    x.translate(128, 128)
    const r = rng(13)
    for (let arm = 0; arm < 5; arm++) {
      const off = (arm / 5) * Math.PI * 2
      for (let i = 0; i < 140; i++) {
        const t = i / 140
        const a = off + t * 5.2
        const rr = 18 + t * 104
        x.fillStyle = `rgba(255,255,255,${(1 - t) * 0.5 * (0.5 + r() * 0.5)})`
        x.beginPath()
        x.arc(Math.cos(a) * rr, Math.sin(a) * rr, 2 + (1 - t) * 7, 0, Math.PI * 2)
        x.fill()
      }
    }
    x.globalCompositeOperation = 'destination-out'
    radial(x, 0, 0, 30, [
      [0, 'rgba(0,0,0,1)'],
      [1, 'rgba(0,0,0,0)'],
    ])
    return c
  },
  streak: () => {
    const [c, x] = canvas(128, 32)
    const g = x.createLinearGradient(0, 0, 128, 0)
    g.addColorStop(0, 'rgba(255,255,255,0)')
    g.addColorStop(0.7, 'rgba(255,255,255,0.9)')
    g.addColorStop(1, 'rgba(255,255,255,0)')
    for (let i = 0; i < 32; i++) {
      const k = 1 - Math.abs(i - 16) / 16
      x.globalAlpha = k ** 1.5
      x.fillStyle = g
      x.fillRect(0, i, 128, 1)
    }
    return c
  },
  noise: () => {
    const [c, x] = canvas(128)
    const img = x.createImageData(128, 128)
    const r = rng(29)
    // 平滑雜訊：3 層 value noise 疊加
    const grid = (n: number) => {
      const g: number[] = []
      for (let i = 0; i < n * n; i++) g.push(r())
      return (u: number, v: number) => {
        const fx = u * n
        const fy = v * n
        const x0 = Math.floor(fx) % n
        const y0 = Math.floor(fy) % n
        const x1 = (x0 + 1) % n
        const y1 = (y0 + 1) % n
        const tx = fx - Math.floor(fx)
        const ty = fy - Math.floor(fy)
        const sx = tx * tx * (3 - 2 * tx)
        const sy = ty * ty * (3 - 2 * ty)
        const a = g[y0 * n + x0] + (g[y0 * n + x1] - g[y0 * n + x0]) * sx
        const b = g[y1 * n + x0] + (g[y1 * n + x1] - g[y1 * n + x0]) * sx
        return a + (b - a) * sy
      }
    }
    const o1 = grid(4)
    const o2 = grid(8)
    const o3 = grid(16)
    for (let j = 0; j < 128; j++)
      for (let i = 0; i < 128; i++) {
        const u = i / 128
        const v = j / 128
        const n = o1(u, v) * 0.55 + o2(u, v) * 0.3 + o3(u, v) * 0.15
        const k = (j * 128 + i) * 4
        img.data[k] = img.data[k + 1] = img.data[k + 2] = n * 255
        img.data[k + 3] = 255
      }
    x.putImageData(img, 0, 0)
    return c
  },
  arrows: () => {
    // 環狀箭頭（極性、吸引／推開）
    const [c, x] = canvas(256)
    x.translate(128, 128)
    x.fillStyle = 'rgba(255,255,255,1)'
    for (let i = 0; i < 8; i++) {
      x.save()
      x.rotate((i / 8) * Math.PI * 2)
      x.beginPath()
      x.moveTo(-14, -112)
      x.lineTo(14, -112)
      x.lineTo(0, -88)
      x.closePath()
      x.fill()
      x.restore()
    }
    x.strokeStyle = 'rgba(255,255,255,0.7)'
    x.lineWidth = 3
    x.beginPath()
    x.arc(0, 0, 120, 0, Math.PI * 2)
    x.stroke()
    return c
  },
  smoke: () => {
    const [c, x] = canvas(128)
    const r = rng(31)
    for (let i = 0; i < 26; i++) {
      const a = r() * Math.PI * 2
      const d = r() * 34
      const rr = 18 + r() * 26
      radial(x, 64 + Math.cos(a) * d, 64 + Math.sin(a) * d, rr, [
        [0, `rgba(255,255,255,${0.16 + r() * 0.14})`],
        [1, 'rgba(255,255,255,0)'],
      ])
    }
    return c
  },
  bolt: () => {
    // 被電擊的蜿蜒電紋（貼在地上或殼上）
    const [c, x] = canvas(128)
    const r = rng(37)
    x.strokeStyle = 'rgba(255,255,255,1)'
    x.lineWidth = 2
    for (let k = 0; k < 6; k++) {
      let px = 64
      let py = 64
      let a = r() * Math.PI * 2
      x.beginPath()
      x.moveTo(px, py)
      for (let i = 0; i < 9; i++) {
        a += (r() - 0.5) * 1.4
        px += Math.cos(a) * 7
        py += Math.sin(a) * 7
        x.lineTo(px, py)
      }
      x.stroke()
    }
    return c
  },
  muted: () => {
    // 被消音：聲波被一道斜線切斷
    const [c, x] = canvas(128)
    x.strokeStyle = 'rgba(255,255,255,1)'
    x.fillStyle = 'rgba(255,255,255,1)'
    x.lineWidth = 7
    x.beginPath()
    x.moveTo(26, 50)
    x.lineTo(44, 50)
    x.lineTo(66, 30)
    x.lineTo(66, 98)
    x.lineTo(44, 78)
    x.lineTo(26, 78)
    x.closePath()
    x.fill()
    x.beginPath()
    x.arc(70, 64, 22, -0.8, 0.8)
    x.stroke()
    x.beginPath()
    x.arc(70, 64, 38, -0.8, 0.8)
    x.stroke()
    x.lineWidth = 10
    x.beginPath()
    x.moveTo(18, 112)
    x.lineTo(112, 16)
    x.stroke()
    return c
  },
  grid: () => {
    // 全像掃描格線
    const [c, x] = canvas(128)
    x.strokeStyle = 'rgba(255,255,255,0.8)'
    x.lineWidth = 1
    for (let i = 0; i <= 128; i += 16) {
      x.beginPath()
      x.moveTo(i, 0)
      x.lineTo(i, 128)
      x.moveTo(0, i)
      x.lineTo(128, i)
      x.stroke()
    }
    x.fillStyle = 'rgba(255,255,255,0.25)'
    for (let j = 0; j < 128; j += 4) x.fillRect(0, j, 128, 1)
    return c
  },
}

/** 取得特效貼圖（第一次呼叫時生成）*/
export function fxTex(name: FxTexName, repeat = false): THREE.Texture {
  const key = name + (repeat ? ':r' : '')
  let t = cache.get(key)
  if (!t) {
    const tex = new THREE.CanvasTexture(BUILDERS[name]())
    tex.colorSpace = name === 'noise' ? THREE.NoColorSpace : THREE.SRGBColorSpace
    if (repeat) tex.wrapS = tex.wrapT = THREE.RepeatWrapping
    tex.anisotropy = 4
    t = tex
    cache.set(key, t)
  }
  return t
}
