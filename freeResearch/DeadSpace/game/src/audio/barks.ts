// 受傷／死亡叫聲的判定（純邏輯：不碰 AudioContext 與 client 狀態，讓 Vitest 能直接測；director.ts 負責實際播放）。
// 只用 client 本來就拿得到的資料：
// - 痛叫：快照裡同一個單位的血量明顯下降；
// - 死亡：只聽 sim 的死亡特效（k: 'die'）。sim 只把它送給「上一份快照就看得到這個單位、也看得到死亡地點」的人，
//   而且不帶外觀：叫聲用這裡最後一次看到的樣子（偽裝就是偽裝對象的聲音、匿名形態就是那個形態的聲音）。
//   單位走出視野、隱形、傳送、變身換 id 都不會有這個特效，所以不會再誤播（以前用「低血量的機械在近處消失」推斷）。
import { EntFlag, type FxEvent } from '../shared/protocol/messages'
import { familyOf, voicePitch, type Family } from './combat'

/** 叫聲的最大距離（與鏡頭的距離）*/
export const BARK_RANGE = 22
/** 每份快照最多幾聲痛叫、幾聲死亡叫聲（大混戰時不要糊成一片）*/
const MAX_PAINS = 3
const MAX_DEATHS = 2

export interface BarkCall {
  fam: Family
  kind: 'pain' | 'death'
  x: number
  y: number
  pitch: number
  big: boolean
}

/** 快照裡看得到的單位（client 的 CEnt：s = 快照欄位、x／y = 位置）*/
export interface BarkEnt {
  s: { i: number; z?: number; d?: string; c?: number; hp?: number; mhp?: number; fl?: number }
  x: number
  y: number
}

interface Seen {
  hp: number
  mhp: number
  d: string
  c?: number
}

export class BarkTracker {
  /** 上一份快照看到的樣子（只記鏡頭所在 zone、會叫的單位）*/
  private ents = new Map<number, Seen>()
  private deaths = 0

  clear(): void {
    this.ents.clear()
    this.deaths = 0
  }

  /**
   * 套用一份快照之後呼叫：記下每個看得到的單位，回傳這份快照的痛叫。
   * 同一份快照的死亡特效會在這之前到達（ClientWorld.apply 先送特效，snapTick 才加一），所以 die() 查得到死前的樣子。
   */
  snap(ents: Iterable<BarkEnt>, zid: number, l: { x: number; y: number }): BarkCall[] {
    const out: BarkCall[] = []
    const seen = new Set<number>()
    let pains = 0
    for (const e of ents) {
      const s = e.s
      if (s.z !== zid || (s.fl ?? 0) & EntFlag.Corpse) continue
      const fam = familyOf(s.d)
      if (!fam) continue
      seen.add(s.i)
      const hp = s.hp ?? 0
      const mhp = Math.max(1, s.mhp ?? 1)
      const prev = this.ents.get(s.i)
      this.ents.set(s.i, { hp, mhp, d: s.d!, c: s.c })
      if (!prev || hp <= 0 || Math.hypot(e.x - l.x, e.y - l.y) > BARK_RANGE) continue
      // 最大生命改變（穿脫防護服、變身）不算受傷
      if (prev.mhp === mhp && hp < prev.hp - Math.max(2, mhp * 0.03) && pains++ < MAX_PAINS)
        out.push({ fam, kind: 'pain', x: e.x, y: e.y, pitch: voicePitch(s.d, s.c), big: prev.hp - hp > mhp * 0.12 })
    }
    for (const id of this.ents.keys()) if (!seen.has(id)) this.ents.delete(id)
    this.deaths = 0
    return out
  }

  /** 死亡特效：用死者最後被看到的樣子叫；看不到（沒記錄、別的 zone、太遠）就不叫 */
  die(f: FxEvent, zid: number, l: { x: number; y: number }): BarkCall | null {
    if (f.k !== 'die' || f.z !== zid || f.e === undefined) return null
    const p = this.ents.get(f.e)
    if (!p) return null
    this.ents.delete(f.e)
    const fam = familyOf(p.d)
    if (!fam || Math.hypot(f.x - l.x, f.y - l.y) > BARK_RANGE || this.deaths >= MAX_DEATHS) return null
    this.deaths++
    return { fam, kind: 'death', x: f.x, y: f.y, pitch: voicePitch(p.d, p.c), big: false }
  }
}
