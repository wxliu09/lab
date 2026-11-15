// 結算與離開對局的文字規則（純函式；Panels.tsx、GameMenu.tsx 用，單元測試直接測，不必載入 3D 場景）

/** 平手的原因（sim 的 EndResult.drawWhy）：同歸於盡、末日收尾；其他或沒有這個欄位時 null（只顯示原本的標題）*/
export function drawReasonKey(r: { winner: string; drawWhy?: unknown }): string | null {
  if (r.winner !== 'draw') return null
  return r.drawWhy === 'wipe' || r.drawWhy === 'doom' ? 'end.drawWhy.' + r.drawWhy : null
}

/** 離開對局確認的說明與按鈕：練習局（單機，沒有別人）、主機、一般玩家 */
export function leaveText(practice: boolean, host: boolean): { body: string; ok: string } {
  if (practice) return { body: 'ui5.leave.practice', ok: 'ui5.leave.okPractice' }
  return { body: host ? 'ui5.leave.host' : 'ui5.leave.guest', ok: 'ui5.leave.ok' }
}
