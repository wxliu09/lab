// 受擊反應的純邏輯（不碰 three，可單元測試）：
// - hpHit：兩份快照之間 HP 掉了多少才算「被打到」（快照裡本來就有 HP；穿脫防護服、變身改了最大生命不算）
// - HitState：閃光、後座、壓扁、近戰頓幀的時間包絡。觸發來源有兩條：特效事件（atk／proj 命中，知道攻擊方向）
//   與 HP 下降（DoT、爆炸、看不到來源的傷害）；兩條路徑會合併，同一下不會閃兩次
// 只是 client 的視覺：頓幀只放慢這個單位自己的動畫時鐘，不碰 sim 時間

export const HIT = {
  /** 閃光秒數（60–80 ms）*/
  flash: 0.075,
  /** 後座＋壓扁的回彈秒數 */
  recoil: 0.17,
  /** 後座位移（公尺）*/
  push: 0.1,
  /** 壓扁：y 縮放的最低點 */
  squash: 0.97,
  /** 後仰角度（弧度，往受擊方向的反方向倒一點）*/
  lean: 0.07,
  /** 近戰頓幀秒數（40–60 ms）*/
  stop: 0.05,
  /** 頓幀期間的動畫時間倍率 */
  stopScale: 0.04,
  /** 這段時間內的第二次觸發併入前一次（不重新閃、不重新後座）*/
  merge: 0.12,
  /** 特效預告會命中（近戰揮擊 0.07 秒後才打到）：這段時間內偵測到的 HP 下降交給特效處理 */
  expect: 0.3,
} as const

/**
 * 兩份快照之間的 HP 變化 → 這次受到的傷害佔最大生命的比例（0 = 不算受擊）。
 * 最大生命改變（穿脫防護服、變身）、回血、小於千分之四的跳動都不算
 */
export function hpHit(prevHp: number | undefined, prevMhp: number | undefined, hp: number | undefined, mhp: number | undefined): number {
  if (prevHp === undefined || hp === undefined || prevMhp === undefined || mhp === undefined) return 0
  if (prevMhp !== mhp) return 0
  const m = Math.max(1, mhp)
  const d = prevHp - hp
  if (!(d >= Math.max(1, m * 0.004))) return 0
  return Math.min(1, d / m)
}

/** HP 下降 → 閃光強度與是否偏紅（重擊）*/
export function hpFlash(frac: number): { k: number; red: boolean } {
  return { k: Math.min(1, 0.35 + frac * 5), red: frac >= 0.12 }
}

export interface HitState {
  /** 上一次開始閃光的時間（-∞ = 從沒被打過）*/
  t: number
  flashT: number
  flashK: number
  red: boolean
  recT: number
  /** 後座方向（sim 座標的單位向量；0,0 = 不知道方向，只壓扁不位移）*/
  dx: number
  dy: number
  recK: number
  stopT: number
  /** 這個時間以前的 HP 下降交給特效處理 */
  expectUntil: number
  /** 特效還沒到、HP 下降先到時記下的強度（下一次特效觸發時併入）*/
  pendK: number
  pendRed: boolean
  /** 剛觸發、還沒畫過：下一幀最多只扣 1/60 秒（低幀率時一幀就超過 75 ms，閃光會整個看不到）*/
  fresh: boolean
}

export function newHit(): HitState {
  return { t: -Infinity, flashT: 0, flashK: 0, red: false, recT: 0, dx: 0, dy: 0, recK: 0, stopT: 0, expectUntil: -Infinity, pendK: 0, pendRed: false, fresh: false }
}

export interface HitOpts {
  /** 受擊方向（從攻擊者指向目標；sim 座標，不必正規化）*/
  dx?: number
  dy?: number
  /** 強度 0–1 */
  k?: number
  red?: boolean
  /** 近戰：頓幀 */
  stop?: boolean
  /** 來自 HP 下降偵測（不是特效事件）*/
  fromHp?: boolean
}

/**
 * 觸發一次受擊（now = 渲染時鐘秒）。回傳 true = 開始了一次新的閃光；false = 併入前一次或交給即將到來的特效
 */
export function hitTrigger(h: HitState, now: number, o: HitOpts = {}): boolean {
  const k = Math.max(0.15, Math.min(1, o.k ?? 0.6))
  const red = !!o.red
  if (o.fromHp && now < h.expectUntil) {
    // 揮擊的命中點還沒到：先記下強度，命中時一起閃；已經在閃就直接加強
    if (h.flashT > 0) {
      h.flashK = Math.max(h.flashK, k)
      h.red ||= red
    } else {
      h.pendK = Math.max(h.pendK, k)
      h.pendRed ||= red
    }
    return false
  }
  let dx = o.dx ?? 0
  let dy = o.dy ?? 0
  const l = Math.hypot(dx, dy)
  if (l > 1e-4) {
    dx /= l
    dy /= l
  } else dx = dy = 0
  const fresh = now - h.t >= HIT.merge
  if (fresh) {
    h.t = now
    h.fresh = true
    h.flashT = HIT.flash
    h.flashK = Math.max(k, h.pendK)
    h.red = red || h.pendRed
    h.recT = HIT.recoil
    h.recK = h.flashK
    h.dx = dx
    h.dy = dy
  } else {
    h.flashK = Math.max(h.flashK, k, h.pendK)
    h.red ||= red || h.pendRed
    // 先到的是沒有方向的 HP 下降、後到的特效才知道方向：補上後座
    if ((dx || dy) && !h.dx && !h.dy) {
      h.dx = dx
      h.dy = dy
      h.recT = HIT.recoil
      h.recK = Math.max(h.recK, k)
    }
  }
  h.pendK = 0
  h.pendRed = false
  if (o.stop) {
    h.stopT = Math.max(h.stopT, HIT.stop)
    h.fresh = true
  }
  return fresh
}

/** 預告 dur 秒內會有特效觸發的命中（近戰揮擊）*/
export function hitExpect(h: HitState, now: number, dur: number = HIT.expect): void {
  h.expectUntil = Math.max(h.expectUntil, now + dur)
}

/** 只頓幀（近戰的攻擊者）*/
export function hitStop(h: HitState, dur: number = HIT.stop): void {
  h.stopT = Math.max(h.stopT, dur)
  h.fresh = true
}

export interface HitPose {
  /** 閃光強度 0–1（0 = 不閃）*/
  flash: number
  red: boolean
  /** 後座位移（公尺）與方向 */
  push: number
  dx: number
  dy: number
  /** y 縮放（1 = 不壓扁）*/
  squash: number
  /** 後仰角度 */
  lean: number
  /** 這一幀的動畫時間倍率（頓幀時接近 0）*/
  timeScale: number
  /** 有任何受擊姿勢（呼叫端可以略過套用）*/
  active: boolean
}

export function newPose(): HitPose {
  return { flash: 0, red: false, push: 0, dx: 0, dy: 0, squash: 1, lean: 0, timeScale: 1, active: false }
}

/** 推進 dt 秒（真實時間，不受頓幀影響），寫出這一幀的姿勢 */
export function hitStep(h: HitState, dt: number, out: HitPose): HitPose {
  // 觸發後的第一幀一定畫得到（幀率很低時也看得到閃光、後座與頓幀）
  if (h.fresh) {
    h.fresh = false
    out.timeScale = h.stopT > 0 ? HIT.stopScale : 1
    dt = Math.min(dt, 1 / 60)
  } else {
    // 頓幀只佔這一幀的一部分時，按比例放慢
    const over = Math.min(h.stopT, dt)
    out.timeScale = dt > 0 ? 1 - (over / dt) * (1 - HIT.stopScale) : 1
  }
  h.stopT = Math.max(0, h.stopT - dt)
  // 閃光：一開始最亮，60–80 ms 內快速收掉
  h.flashT = Math.max(0, h.flashT - dt)
  out.flash = h.flashT > 0 ? h.flashK * Math.sqrt(h.flashT / HIT.flash) : 0
  out.red = h.red
  // 後座：前 25% 快速推出去，之後彈回
  h.recT = Math.max(0, h.recT - dt)
  let e = 0
  if (h.recT > 0) {
    const p = 1 - h.recT / HIT.recoil
    e = p < 0.25 ? p / 0.25 : (1 - (p - 0.25) / 0.75) ** 2
    e *= 0.5 + 0.5 * h.recK
  }
  out.push = HIT.push * e
  out.dx = h.dx
  out.dy = h.dy
  out.squash = 1 - (1 - HIT.squash) * e
  out.lean = h.dx || h.dy ? HIT.lean * e : 0
  out.active = out.flash > 0 || e > 0 || out.timeScale < 1
  return out
}

/** 變身彈出的縮放曲線（u = 0–1 的進度）：0.7 → 1.05（前 45%）→ 1 */
export function popScale(u: number): number {
  if (u <= 0) return 0.7
  if (u >= 1) return 1
  if (u < 0.45) {
    const k = u / 0.45
    return 0.7 + 0.35 * (1 - (1 - k) ** 3)
  }
  const k = (u - 0.45) / 0.55
  return 1.05 - 0.05 * (k * k * (3 - 2 * k))
}
