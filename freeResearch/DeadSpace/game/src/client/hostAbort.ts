// 主機中止（第 5 輪審查 P2-6）：主機在多人對局中按「離開」或關分頁時，先叫自己的 Sim Worker 結束這局
// （產生「主機中止」的結算：所有人的身分揭曉、送給每位客人），等一下讓訊息送出去，再終止 worker。
// 練習局不用送（沒有客人）；已經結算過的也不用（客人已經看過結算）。
import type { ClientMsg, EndResult } from '../shared/protocol/messages'

/**
 * 送出中止之後至少等多久（ms）才終止 worker 與連線：worker 收到就結算、回報 { t: 'aborted' }，
 * 主執行緒把結算轉給傳輸層之後，WebRTC 的 DataChannel 還要一點時間把資料真的送出去
 */
export const HOST_ABORT_WAIT_MS = 300
/** worker 一直沒回報（例如模擬卡住）時最多等多久（ms）*/
export const HOST_ABORT_MAX_MS = 1200

/** client → worker（server 只接受本機 client 送的）：主機中止這局 */
export const ABORT_MSG = { t: 'abort' } as const satisfies ClientMsg

export interface LeaveState {
  isHost: boolean
  practice: boolean
  /** 正在對局畫面 */
  inGame: boolean
  /** 已經收到結算 */
  ended: boolean
  /** 主機模擬已經掛了（worker 不會再處理任何訊息）*/
  simFailed: boolean
}

/** 離開時要不要先送中止：主機、多人局、對局中、還沒結算、模擬還活著 */
export function shouldAbortOnLeave(s: LeaveState): boolean {
  return s.isHost && !s.practice && s.inGame && !s.ended && !s.simFailed
}

/**
 * 這份結算是不是主機中止的：sim 用 winner = 'aborted'、abortWhy = 'host' 表示（沒帶 abortWhy 的 'aborted' 也當主機中止：
 * 目前沒有別的中止原因）。只看結算本身（結算時公開給所有人的資料）。
 */
export function isHostAbort(r: EndResult | null | undefined): boolean {
  return !!r && r.winner === 'aborted' && (r.abortWhy ?? 'host') === 'host'
}
