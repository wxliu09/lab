// 對局畫面的按鈕用滑鼠點完就放掉鍵盤焦點（第 6 輪審查 P3：點過頂列的齒輪後，開著說明按 Enter 又打開了設定；
// 空白鍵（鏡頭回到自己）、Enter（聊天）也會再按到上一顆點過的按鈕）。
// 只處理滑鼠／觸控點擊（click 的 detail ≥ 1）：用 Tab 移到按鈕、按 Enter／空白鍵觸發的（detail 0）照樣保留焦點，鍵盤操作不受影響。
// 在 capture 階段放掉焦點：按鈕自己的 onClick 之後才打開的對話框若要把焦點移到裡面，不會被這裡蓋掉。

/** 要處理的範圍：對局畫面（.layer）與圖鑑（掛在對局畫面外）*/
const SCOPE = '.layer, .codex-wrap'
const CLICKABLE = 'button, [role="button"], summary'

/** 這次點擊之後要不要放掉焦點（純判斷，單元測試直接驗證）*/
export function shouldBlurAfterClick(detail: number, el: Element | null): el is HTMLElement {
  if (detail < 1 || !el) return false
  const b = el.closest(CLICKABLE)
  return !!b && !!b.closest(SCOPE) && typeof (b as HTMLElement).blur === 'function'
}

let installed = 0

function onClick(e: MouseEvent): void {
  const el = e.target instanceof Element ? e.target.closest(CLICKABLE) : null
  if (shouldBlurAfterClick(e.detail, el) && document.activeElement === el) el.blur()
}

/** 對局畫面掛上時呼叫（Hud.tsx 的 TopBar）；回傳卸載函式。重複掛只算一次 */
export function installClickBlur(): () => void {
  if (installed++ === 0) document.addEventListener('click', onClick, true)
  return () => {
    if (--installed === 0) document.removeEventListener('click', onClick, true)
  }
}
