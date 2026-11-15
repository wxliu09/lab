// 設定頁「介面大小」的兩個數字各是什麼（第 3 輪審查：原本「100%」與「95%」同時出現、看不出差別）：
// 滑桿是玩家自己加的倍率（uiScalePref，寫成 ×1.00），說明列是實際套用的大小
// （uiZoom = 依視窗自動縮放 × 倍率，再限制在畫面放得下的範圍；見 ui/uiScale.ts）。

export function uiScaleTexts(pref: number, zoom: number): { mult: string; actual: number } {
  return { mult: '×' + (Math.round(pref * 100) / 100).toFixed(2), actual: Math.round(zoom * 100) }
}
