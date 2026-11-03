// 音訊導演用的純函式（不碰 DOM、AudioContext、client 狀態）：地點 → 環境音、倒數提示音、載具速度。
// 拆出來是為了讓 Vitest 能直接測（director.ts 會載入 UI 與 session）。
import { STATION_BY_ID } from '../shared/content/stations/index'
import type { AmbientKind } from './ambient'

/** 鏡頭所在 zone 的環境音：[底噪種類, 特色層（站點 id）] */
export function zoneAmbient(sid: string | undefined, space = false): [AmbientKind, string] {
  if (space) return ['space', '']
  const id = sid ?? ''
  // 玩家的船艇（ship:*）與黑鷗號海盜船都是船艙底噪；黑鷗號另有自己的特色層
  if (id.startsWith('ship:')) return ['ship', '']
  if (id === 'pirate') return ['ship', 'pirate']
  if (id === 'hulk7') return ['derelict', 'hulk7']
  if (id === 'uo') return ['organic', 'uo']
  const def = STATION_BY_ID.get(id)
  // 地表：有天氣（翠原星下雨）= 有大氣的風雨；沒有天氣的岩石衛星（餘燼衛星）= 無大氣的地鳴
  if (def?.outdoor) return def.weather ? ['outdoor', id] : ['moon', id]
  return ['station', id]
}

/** 倒數最後 5 秒：每過一個整數秒響一聲，最後一秒換高音。left = 剩餘秒數（0 = 沒在倒數）；回傳新的「上一次響過的秒數」*/
export function countdownTick(left: number, lastBeep: number, play: (name: 'countdown' | 'countdownLast') => void): number {
  if (!(left > 0)) return 0
  const s = Math.ceil(left - 1e-6)
  if (s > 5 || s === lastBeep) return s > 5 ? 0 : lastBeep
  play(s === 1 ? 'countdownLast' : 'countdown')
  return s
}

/** 引擎聲的「全速」（單位／秒）：船艇約 0.9–1.8、可駕駛的站點約 0.4–0.7 */
export const ENGINE_FULL_SPEED = 1.3

/**
 * 由最近兩個快照樣本估計速度（單位／秒）。快照只在位置改變時才帶座標，
 * 停下來之後就不會有新樣本：最後一個樣本比最新快照舊超過 0.35 秒就當成靜止。
 */
export function vehicleSpeed(samples: readonly { t: number; x: number; y: number }[], serverTime: number): number {
  const n = samples.length
  if (n < 2) return 0
  const a = samples[n - 2]
  const b = samples[n - 1]
  const dt = b.t - a.t
  if (!(dt > 1e-3) || serverTime - b.t > 0.35) return 0
  return Math.hypot(b.x - a.x, b.y - a.y) / dt
}
