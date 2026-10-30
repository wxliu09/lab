// client 端世界：把快照 delta 累積成實體表，並做位置插值（延遲約 100 ms）
import type { ChatLine, FxEvent, PrivateState, SnapEntity, Snapshot, WorldPublic } from '../shared/protocol/messages'

export interface Sample {
  t: number
  x: number
  y: number
  f: number
}

export interface CEnt {
  s: SnapEntity
  samples: Sample[]
  /** 插值後的位置（每幀更新）*/
  x: number
  y: number
  f: number
  firstSeen: number
  lastUpdate: number
}

export const INTERP_DELAY = 0.1

export class ClientWorld {
  ents = new Map<number, CEnt>()
  me: Partial<PrivateState> = {}
  doors = new Map<number, number>()
  vs: [number, number, number, number][] = []
  w: Partial<WorldPublic> = {}
  serverTime = 0
  /** server 時間 - 本地時間（秒），平滑後 */
  offset = 0
  private hasOffset = false
  fxQueue: FxEvent[] = []
  /** 消失的實體（給 render 淡出／死亡動畫）*/
  goneQueue: number[] = []
  bubbles: { e: number; text: string; until: number; color: number }[] = []
  tick = 0
  snapCount = 0
  onFx: ((f: FxEvent) => void) | null = null

  reset(): void {
    this.ents.clear()
    this.me = {}
    this.doors.clear()
    this.vs = []
    this.w = {}
    this.hasOffset = false
  }

  now(): number {
    return performance.now() / 1000
  }

  /** 目前要顯示的 server 時間 */
  renderTime(): number {
    return this.now() + this.offset - INTERP_DELAY
  }

  apply(s: Snapshot): void {
    const local = this.now()
    const off = s.time - local
    if (!this.hasOffset || Math.abs(off - this.offset) > 1) {
      this.offset = off
      this.hasOffset = true
    } else this.offset += (off - this.offset) * 0.05
    this.serverTime = s.time
    this.tick = s.tick
    this.snapCount++
    for (const id of s.g) {
      if (this.ents.delete(id)) this.goneQueue.push(id)
    }
    for (const d of s.e) {
      let c = this.ents.get(d.i)
      if (!c) {
        c = { s: { i: d.i }, samples: [], x: 0, y: 0, f: 0, firstSeen: s.time, lastUpdate: s.time }
        this.ents.set(d.i, c)
      }
      for (const [k, v] of Object.entries(d)) {
        if (v === null) delete (c.s as unknown as Record<string, unknown>)[k]
        else (c.s as unknown as Record<string, unknown>)[k] = v
      }
      c.lastUpdate = s.time
      if (d.x !== undefined || d.y !== undefined || d.f !== undefined || d.z !== undefined || c.samples.length === 0) {
        const smp = { t: s.time, x: (c.s.x ?? 0) / 100, y: (c.s.y ?? 0) / 100, f: (c.s.f ?? 0) / 100 }
        // 換 zone 或瞬移：清掉舊樣本避免拖影
        const last = c.samples[c.samples.length - 1]
        if (d.z !== undefined || (last && (last.x - smp.x) ** 2 + (last.y - smp.y) ** 2 > 36)) c.samples.length = 0
        c.samples.push(smp)
        if (c.samples.length > 12) c.samples.shift()
        if (c.samples.length === 1) {
          c.x = smp.x
          c.y = smp.y
          c.f = smp.f
        }
      }
    }
    if (s.me) Object.assign(this.me, s.me)
    if (s.doors) for (const [k, v] of Object.entries(s.doors)) this.doors.set(Number(k), v)
    if (s.vs) this.vs = s.vs
    if (s.w) Object.assign(this.w, s.w)
    if (s.fx) {
      for (const f of s.fx) {
        if (this.onFx) this.onFx(f)
        else this.fxQueue.push(f)
      }
    }
  }

  /** 每幀呼叫：更新插值位置 */
  interpolate(): void {
    const rt = this.renderTime()
    for (const c of this.ents.values()) {
      const sm = c.samples
      if (sm.length === 0) continue
      // 找 rt 所在的區間
      let a = sm[0]
      let b = sm[sm.length - 1]
      if (rt >= b.t) {
        c.x = b.x
        c.y = b.y
        c.f = b.f
        continue
      }
      for (let i = sm.length - 1; i > 0; i--) {
        if (sm[i - 1].t <= rt) {
          a = sm[i - 1]
          b = sm[i]
          break
        }
      }
      const span = b.t - a.t
      const k = span > 0 ? Math.max(0, Math.min(1, (rt - a.t) / span)) : 1
      c.x = a.x + (b.x - a.x) * k
      c.y = a.y + (b.y - a.y) * k
      let df = b.f - a.f
      while (df > Math.PI) df -= 2 * Math.PI
      while (df < -Math.PI) df += 2 * Math.PI
      c.f = a.f + df * k
    }
  }

  addChat(lines: ChatLine[]): void {
    for (const l of lines) {
      if (l.e && l.ch === 'all') this.bubbles.push({ e: l.e, text: l.text, until: this.now() + 5, color: l.color })
    }
  }
}
