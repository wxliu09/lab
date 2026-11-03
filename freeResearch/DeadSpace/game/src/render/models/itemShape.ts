// 地上道具的外型分類：依道具分類（cat）與圖示（icon）決定掉在地上時長什麼樣子（render/models/groundItems.ts 畫）。
// 純資料、不碰 three.js（單元測試直接用）。

export type ItemShape =
  /** 長槍盒：手槍、相位砲、哨戟 */
  | 'weapon'
  /** 開口彈藥箱＋幾顆手榴彈：手榴彈、熱融炸彈、電磁、黑洞裝置 */
  | 'ordnance'
  /** 綠底白十字醫療包：急救包、重症維生、再生器、奈米機群 */
  | 'medkit'
  /** 藥罐（一高一矮，中間一圈看得到藥液）：針劑、藥丸、興奮劑 */
  | 'pharma'
  /** 工具箱：多數裝置與工具（重力裝置、相位斗篷、扳手、護盾產生器…）*/
  | 'toolbox'
  /** 手持掃描器（發光螢幕＋天線）：偵測類、遙控器 */
  | 'scanner'
  /** 摺疊衣袋＋頭盔：防護服 */
  | 'suit'
  /** 卡片：ID 卡、現金卡、救生艙憑證、檢測報告 */
  | 'card'
  /** 能量芯（發光的圓柱）：能量核心、電池、電容、各種模組、記憶核心 */
  | 'core'
  /** 其他：補給箱（帽子、玩偶、蟲餌、薰香…）*/
  | 'crate'

export const ITEM_SHAPES: readonly ItemShape[] = ['weapon', 'ordnance', 'medkit', 'pharma', 'toolbox', 'scanner', 'suit', 'card', 'core', 'crate']

/** 圖示優先（同一分類裡外型不同的，例如戰鬥類的槍與手榴彈、醫療類的急救包與藥）*/
const BY_ICON: Record<string, ItemShape> = {
  gun: 'weapon',
  plasma: 'weapon',
  grenade: 'ordnance',
  bomb: 'ordnance',
  bolt: 'ordnance',
  heal: 'medkit',
  syringe: 'pharma',
  pill: 'pharma',
  infect: 'pharma',
  key: 'card',
  card: 'card',
  pod: 'card',
  core: 'core',
  battery: 'core',
  module: 'core',
  hat: 'crate',
  plush: 'crate',
  egg: 'crate',
}

/** 分類的預設外型 */
const BY_CAT: Record<string, ItemShape> = {
  combat: 'toolbox',
  medical: 'pharma',
  utility: 'toolbox',
  detect: 'scanner',
  suit: 'suit',
  key: 'scanner',
  module: 'core',
  quest: 'core',
  fun: 'crate',
}

export function itemShape(it: { id?: string; cat?: string; icon?: string } | undefined): ItemShape {
  if (!it) return 'crate'
  if (it.cat === 'suit') return 'suit'
  // 檢測報告（偵測類、圖示是掃描）是一張紙本報告
  if (it.id === 'testResults') return 'card'
  // 黑洞裝置是拋擲型爆裂物（戰鬥類的 void）；重力裝置（工具類的 void）是工具
  if (it.icon === 'void' && it.cat === 'combat') return 'ordnance'
  // 興奮劑的圖示是速度，但它是醫療用的針劑；強化護腿（工具類的速度）是工具
  if (it.icon === 'speed' && it.cat === 'medical') return 'pharma'
  return BY_ICON[it.icon ?? ''] ?? BY_CAT[it.cat ?? ''] ?? 'crate'
}
