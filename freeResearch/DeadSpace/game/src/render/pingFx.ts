// 小地圖信號在場景地面上的標記（client/mapPing.ts）：發送者顏色的呼吸圈、柔光底盤、三道往外擴散的波紋、
// 一道很淡的光柱（遠景、被牆擋住一半時也找得到），約 4 秒。只在那個 zone 正在顯示時看得到（Fx 的 zone 過濾）。
import * as THREE from 'three'
import { GEO, type Fx } from './fx'
import { fxTex } from './fx/tex'
import { W } from './stationBuilder'

/** 波紋間隔（秒）：和小地圖的波紋同一個節奏（pingBoard.ts pingLook）*/
const WAVE_S = 1.2

export function pingFx(fx: Fx, zone: number, x: number, y: number, color: string, life = 4): void {
  // 太空層鏡頭高很多、物件也大：整組放大
  const s = zone === 0 ? 2.6 : 1
  // 外圈：呼吸的亮環（最後 15% 淡出）
  fx.ring(zone, x, y, 1.15 * s, 1.15 * s, color, life, {
    env: 'pulse',
    pulseHz: 1 / WAVE_S,
    k: 2.4,
    fadeIn: 0.04,
    h: 0.07,
  })
  // 底盤：柔光，讓圈裡面不是空的（暗處也看得出位置）
  fx.ring(zone, x, y, 0.95 * s, 0.95 * s, color, life, {
    tex: 'soft',
    k: 0.8,
    opacity: 0.4,
    env: 'hold',
    fadeIn: 0.05,
    h: 0.065,
  })
  // 中心：白熱的小點，帶一點發送者的顏色
  fx.ring(
    zone,
    x,
    y,
    0.22 * s,
    0.22 * s,
    new THREE.Color(color).lerp(new THREE.Color('#ffffff'), 0.55),
    life,
    { tex: 'soft', k: 1.6, env: 'hold', h: 0.075 },
  )
  // 擴散波紋
  for (let i = 0; i * WAVE_S < life - 0.3; i++) {
    const wave = () => fx.ring(zone, x, y, 0.35 * s, 3.4 * s, color, WAVE_S * 0.92, { k: 2.6, h: 0.06 })
    if (i === 0) wave()
    else fx.after(i * WAVE_S, wave)
  }
  // 淡淡的光柱：開頭較亮、之後維持一點點，最後淡出
  const m = fx.mesh(GEO.cyl, color, 1.6, { map: fxTex('grad'), side: THREE.DoubleSide, opacity: 0 })
  m.position.copy(W(x, y, 0))
  const r = 0.16 * s
  const hgt = 2.6 * s
  m.scale.set(r, hgt, r)
  const mm = m.material as THREE.MeshBasicMaterial
  fx.addTransient(m, life, zone, (k) => {
    const rise = Math.min(1, k / 0.06)
    m.scale.set(r, hgt * rise, r)
    const base = k < 0.15 ? 1 - (k / 0.15) * 0.55 : 0.45
    mm.opacity = 0.7 * base * (k > 0.85 ? 1 - (k - 0.85) / 0.15 : 1)
    m.rotation.y += 0.02
  })
  // 出現時借一盞點光閃一下（光源池滿了就算了）
  fx.light(zone, x, y, 0.8, color, 6, 5 * s, 0.9, { attack: 0.08 })
}
