// 聊天紀錄淡出（純函式，Hud.tsx 的 Chat 用，單元測試直接驗證）：每一行出現 CHAT_FADE_MS 之後淡出，
// 按 Enter 打字中、或滑鼠停在聊天區上時，最近的 12 行全部恢復顯示（審查 R2：聊天紀錄一直蓋著畫面左下）。

/** 聊天紀錄每一行顯示多久之後淡出（毫秒）*/
export const CHAT_FADE_MS = 12000

/**
 * ats = 每一行第一次出現的時間；reveal = 正在看聊天（打字中、滑鼠在聊天區上）。
 * 回傳每一行要不要淡出，以及下一次需要重繪的時間（還沒到淡出時間的行裡最早的那個；都淡出了就是 Infinity）。
 */
export function chatFade(ats: readonly number[], now: number, reveal: boolean): { faded: boolean[]; next: number } {
  let next = Infinity
  const faded = ats.map((at) => {
    const until = at + CHAT_FADE_MS
    if (until > now) next = Math.min(next, until)
    return !reveal && until <= now
  })
  return { faded, next }
}
