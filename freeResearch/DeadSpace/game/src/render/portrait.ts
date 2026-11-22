// 介面用 3D 小圖：用遊戲內的同一套模型，離屏算成頭像／圖鑑縮圖（快取的 data URL），或在元素裡掛一個慢慢轉的即時預覽
// （頭像、圖鑑、身分揭露、結算畫面共用）

/** 要畫哪個模型：人類用職業 id（model = 'human'、cls = 職業），其他用 UnitDef.model */
export interface PortraitSpec {
  model: string
  /** 人類職業（model === 'human' 時）*/
  cls?: string
  /** 玩家色（人類衣服、外框）*/
  color?: string
  /** 半身（頭像）或全身（圖鑑、揭露）*/
  framing?: 'bust' | 'full'
}

/** 取得一張快取的小圖（data URL）；還沒算好或環境不支援 WebGL 時回 null，呼叫端顯示原本的線條圖示 */
export function portraitUrl(_spec: PortraitSpec, _size = 128): string | null {
  return null
}

/** 在 el 裡掛一個慢慢轉的即時預覽；回傳卸載函式。環境不支援時什麼都不做 */
export function mountSpin(_el: HTMLElement, _spec: PortraitSpec): () => void {
  return () => {}
}

/** 小圖算好時通知（介面據此重繪）；回傳取消訂閱 */
export function onPortraitReady(_cb: () => void): () => void {
  return () => {}
}
