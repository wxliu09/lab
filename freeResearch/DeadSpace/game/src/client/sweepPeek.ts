// 駕駛控制台時用「站內監控掃描」（st.sweep）：畫面在太空層，站內的掃描標記看不到（第 6 輪審查 A-P3）。
// 掃描結果（sim 私下送給施放者的 ping 特效，zone = 站內）到達時，暫時把畫面切到站內（sim 同時給施放者 7 秒的全站視野），
// 鏡頭拉遠、對準所有標記的中心；時間到、點一下畫面、按空白鍵或 Esc 就回到駕駛畫面。
// 只用施放者自己收到的特效與指令（cmdTaps），不多給任何資訊。純邏輯（不碰 DOM、three.js），單元測試直接驗證。

/** 站內監控掃描的技能 id */
export const SWEEP_ID = 'st.sweep'
/** 站內畫面顯示多久（秒；同 sim 的掃描視野 7 秒）*/
export const PEEK_S = 7
/** 按下掃描後多久內收到的站內 ping 算是掃描結果（秒）*/
export const ARM_S = 3

/** 暫時要看的位置（GameScene.viewOverride 的回傳值：同一份掃描回傳同一個物件，鏡頭只跳一次）*/
export interface PeekView {
  zone: number
  /** 所有標記的包圍盒中心與大小（公尺；鏡頭依大小拉遠到看得到全部）*/
  x: number
  y: number
  w: number
  h: number
  /** 結束時間（呼叫端的時鐘，秒）*/
  until: number
}

export class SweepPeek {
  private armedUntil = -1
  private view: PeekView | null = null
  private box: { x0: number; y0: number; x1: number; y1: number } | null = null

  /** 自己送出了掃描（駕駛中）：接下來 ARM_S 秒內收到的站內 ping 就是結果 */
  arm(now: number): void {
    this.armedUntil = now + ARM_S
  }

  /**
   * 收到一個 ping 特效（呼叫端只轉沒有 s 的一般 ping：掃描標記）。viewZone = 目前畫面的 zone。
   * 是掃描結果就開始（或擴充）站內畫面：第一個標記回傳 'start'，同一份掃描的後續標記回傳 'more'；不是回傳 null。
   */
  onPing(z: number, x: number, y: number, viewZone: number, now: number): 'start' | 'more' | null {
    if (now > this.armedUntil || z === 0) return null
    const cur = this.view
    if (cur && cur.zone === z && now <= cur.until) {
      const b = this.box!
      b.x0 = Math.min(b.x0, x)
      b.y0 = Math.min(b.y0, y)
      b.x1 = Math.max(b.x1, x)
      b.y1 = Math.max(b.y1, y)
      // 換一個新物件：GameScene 依物件是否換了決定要不要重新對準（同一個快照裡的標記都在第一幀之前到齊）
      this.view = { zone: z, x: (b.x0 + b.x1) / 2, y: (b.y0 + b.y1) / 2, w: b.x1 - b.x0, h: b.y1 - b.y0, until: cur.until }
      return 'more'
    }
    // 已經在看那一站（例如駕駛的站剛好就是畫面上的 zone）：不用切
    if (z === viewZone) return null
    this.box = { x0: x, y0: y, x1: x, y1: y }
    this.view = { zone: z, x, y, w: 0, h: 0, until: now + PEEK_S }
    return 'start'
  }

  /** 目前要看的位置（過期就結束）*/
  current(now: number): PeekView | null {
    if (this.view && now > this.view.until) this.end()
    return this.view
  }

  /** 結束站內畫面（時間到、點一下畫面、空白鍵、Esc、離開駕駛）*/
  end(): void {
    this.view = null
    this.box = null
    this.armedUntil = -1
  }

  get active(): boolean {
    return this.view !== null
  }
}

/**
 * 要看到整個包圍盒（四周各留 margin 公尺）時鏡頭要多遠（RtsCamera.distance）：tanHalfV = tan(垂直視角 / 2)、aspect = 寬／高、
 * sinPitch = 俯角的 sin（地面的南北方向在畫面上被壓扁）。再乘 1.25：底部的頭像面板、左上的目標面板會擋住一部分畫面。
 */
export function fitDistance(w: number, h: number, tanHalfV: number, aspect: number, sinPitch = 0.9, margin = 5): number {
  const byW = (w / 2 + margin) / (tanHalfV * aspect)
  const byH = ((h / 2 + margin) * sinPitch) / tanHalfV
  return Math.max(byW, byH) * 1.25
}

/** 全域實例：GameScreen 接上畫面與指令／特效，input.ts 在點畫面、空白鍵、Esc 時結束 */
export const sweepPeek = new SweepPeek()
