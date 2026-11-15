// 小地圖信號的本機狀態（純邏輯，不碰 DOM、網路、音效，方便單元測試）：
// 送出節流、顯示中的信號清單、自己送出後主機轉回來的回音去重、本機封鎖的人發的信號不顯示。
import { isMuted } from './mute'

export interface MapPing {
  z: number
  x: number
  y: number
  /** 發送者目前的顯示名字（主機給的；自己送出、本機先顯示的那一筆 = ''）*/
  name: string
  /** 玩家色索引（PLAYER_COLORS；-1 = 沒有玩家色）*/
  color: number
  /** 收到（或送出）的本地時間（performance.now，ms）*/
  at: number
  /** 自己送出的（本機先顯示，不加聊天紀錄）*/
  self: boolean
}

/** 一個信號顯示多久（ms）：小地圖的閃爍圈、場景地面的圈 */
export const PING_LIFE_MS = 4000
/** 送出節流：兩次之間至少隔多久（ms）*/
export const PING_GAP_MS = 700
/**
 * 送出節流：PING_BURST_MS 內最多幾個（按住 Alt 連點也不會洗版）。主機另有自己的限流（server.ts：最多 3 個、每 2 秒回補 1 個）：
 * 這裡稍微嚴一點，本機先顯示的信號不會被主機丟掉、變成只有自己看得到
 */
export const PING_BURST = 3
export const PING_BURST_MS = 6500
/** 自己送出後多久內，主機轉回來的同一個信號視為回音（ms）*/
export const PING_ECHO_MS = 3000
/** 回音比對座標的容差（公尺；主機轉送時可能四捨五入）*/
const ECHO_TOL = 0.6
/** 同時顯示的上限（太多就丟最舊的）*/
const MAX_SHOWN = 24

export class PingBoard {
  readonly list: MapPing[] = []
  /** 最近送出的時間（舊 → 新）*/
  private sent: number[] = []
  /** 自己送出、還在等主機轉回來的信號 */
  private echoes: { z: number; x: number; y: number; at: number }[] = []

  /** 現在能不能再送一個（節流）*/
  canSend(now: number): boolean {
    this.sent = this.sent.filter((t) => now - t < PING_BURST_MS)
    const last = this.sent[this.sent.length - 1]
    if (last !== undefined && now - last < PING_GAP_MS) return false
    return this.sent.length < PING_BURST
  }

  /**
   * 自己發的信號：通過節流就記下來並回傳那一筆（呼叫端送出、本機立刻顯示）；太頻繁回傳 null。
   * color = 自己目前的顯示顏色（別人看到的那個）。
   */
  local(z: number, x: number, y: number, color: number, now: number): MapPing | null {
    if (!this.canSend(now)) return null
    this.sent.push(now)
    this.echoes.push({ z, x, y, at: now })
    return this.add({ z, x, y, name: '', color, at: now, self: true })
  }

  /** 收到主機轉來的信號：被本機封鎖的人發的、自己剛送出的回音（已經先顯示了）不顯示；回傳要顯示的那一筆 */
  receive(m: { z: number; x: number; y: number; name: string; color: number }, now: number): MapPing | null {
    if (isMuted(m.name)) return null
    this.echoes = this.echoes.filter((e) => now - e.at < PING_ECHO_MS)
    const echo = this.echoes.findIndex(
      (e) => e.z === m.z && Math.abs(e.x - m.x) < ECHO_TOL && Math.abs(e.y - m.y) < ECHO_TOL,
    )
    if (echo >= 0) {
      this.echoes.splice(echo, 1)
      return null
    }
    return this.add({ z: m.z, x: m.x, y: m.y, name: m.name, color: m.color, at: now, self: false })
  }

  /** 還在顯示中的信號（順便丟掉過期的）。封鎖是事後才按的也一併隱藏 */
  active(now: number): MapPing[] {
    for (let i = this.list.length - 1; i >= 0; i--) {
      const p = this.list[i]
      if (now - p.at >= PING_LIFE_MS || (!p.self && isMuted(p.name))) this.list.splice(i, 1)
    }
    return this.list
  }

  clear(): void {
    this.list.length = 0
    this.sent = []
    this.echoes = []
  }

  private add(p: MapPing): MapPing {
    this.list.push(p)
    if (this.list.length > MAX_SHOWN) this.list.splice(0, this.list.length - MAX_SHOWN)
    return p
  }
}

/** 信號在小地圖上的樣子（age = 經過毫秒）：中心標記的不透明度、往外擴散的波紋（r = 0..1 的半徑比例、a = 不透明度）；過期回傳 null */
export function pingLook(age: number): { core: number; waves: { r: number; a: number }[] } | null {
  if (age < 0 || age >= PING_LIFE_MS) return null
  // 最後 0.6 秒淡出；一開始 0.12 秒淡入（看得出是「剛出現」）
  const fadeOut = Math.min(1, (PING_LIFE_MS - age) / 600)
  const core = Math.min(1, age / 120) * fadeOut
  // 每 1.2 秒一道波紋（4 秒內 3～4 道），從中心擴散到外圈、越外越淡
  const waves: { r: number; a: number }[] = []
  const PERIOD = 1200
  const SPAN = 1100
  for (let start = 0; start < PING_LIFE_MS - 300; start += PERIOD) {
    const k = (age - start) / SPAN
    if (k < 0 || k >= 1) continue
    waves.push({ r: 1 - (1 - k) ** 2, a: (1 - k) * fadeOut })
  }
  return { core, waves }
}
