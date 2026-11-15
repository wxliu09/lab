// 客人端判斷「主機確定離開了」：傳輸層回報主機失聯後，等一段寬限時間仍沒有重新連上才算。
// 傳輸層只有一個「peer 離開」事件，分不出主機關了分頁還是只是卡住；用失聯前最後一次收到主機訊息的時間來分：
// - 失聯前不久還收得到（關分頁時送了 bye、WebRTC 連線被關掉）：主機多半真的走了，寬限短一點；
// - 失聯前已經安靜好幾秒（心跳逾時）：主機分頁可能只是卡住（建場景、軟體繪圖編譯 shader 可達半分鐘），寬限長一點。
// 寬限內 NetClient 會照常自動重連（收到主機的任何訊息就重新打招呼），重連成功就不跳對話框。

/** 立刻回報的失聯：再等多久（ms）才判定主機已離開 */
export const HOST_GONE_QUICK_MS = 12000
/** 心跳逾時的失聯：再等多久（ms）才判定主機已離開（傳輸層本身已經等了 10 秒）*/
export const HOST_GONE_SLOW_MS = 30000
/** 失聯前多久內還收到主機訊息算「立刻回報」（ms）：對局中快照每秒十幾份，大廳每 2 秒一次 pong */
export const HOST_RECENT_MS = 4000

/** 這次失聯的寬限時間（ms）。lostAt = 傳輸層回報失聯的時間，lastMsgAt = 失聯前最後一次收到主機訊息的時間（0 = 從沒收過）*/
export function hostGoneGrace(lostAt: number, lastMsgAt: number): number {
  return lastMsgAt > 0 && lostAt - lastMsgAt < HOST_RECENT_MS ? HOST_GONE_QUICK_MS : HOST_GONE_SLOW_MS
}

/**
 * now 時是否判定主機已離開：失聯滿寬限時間、而且這段時間裡沒有再收到主機的任何訊息。
 * lastMsgAt 要傳「現在為止最後一次收到」的時間（失聯後收到的也算：那是正在重連）。
 * lostMsgAt = 失聯當下的最後一次收到時間（決定寬限長短）。
 */
export function hostGoneNow(now: number, lostAt: number, lostMsgAt: number, lastMsgAt: number): boolean {
  if (lostAt <= 0) return false
  const grace = hostGoneGrace(lostAt, lostMsgAt)
  return now - lostAt >= grace && now - lastMsgAt >= grace
}
