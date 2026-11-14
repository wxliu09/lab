// 小地圖的顏色：Hud.tsx 的 Minimap（畫布）與 Guide.tsx 的小地圖圖例共用這一份。
// 改色只改這裡，圖例會跟著變；新增會畫在小地圖上的東西時，記得在 MINIMAP_LEGEND_POIS 補一列（字串 guide.map.<key>）。
import { PLAYER_COLORS } from '../shared/constants'

/** 窗戶與控制台同色（圖例合成一列「窗戶、控制台」）；要分開時記得圖例也拆成兩列 */
const CYAN = '#7fd8ff'

export const MINIMAP = {
  // ───── 地形（底圖）─────
  wall: '#3c4a57',
  floor: '#16202a',
  door: '#ffc23d',
  window: CYAN,
  // ───── 設施（poiColor）─────
  console: CYAN,
  medical: '#ff7fa0',
  suit: '#ff9a3d',
  vendor: '#5cf2a5',
  git: '#33ffd1',
  fac: '#8a9aa8',
  // ───── 單位（Hud.tsx 的 drawMinimapUnit）─────
  /** 自己沒有玩家色時（異形的匿名形態）的圓點 */
  selfNoColor: '#cfd8df',
  selfRing: '#ffffff',
  playerRing: 'rgba(0,0,0,0.85)',
  hostile: '#ff3b3b',
  hostileRing: '#ffffff',
  /** 中立單位、物品：灰藍（和白色玩家 #eff0f3 分得開）*/
  neutral: '#9fb3c2',
  // ───── 視野框 ─────
  view: 'rgba(255,255,255,0.6)',
  // ───── 太空層 ─────
  spaceBg: '#04060c',
  spaceRing: 'rgba(159,231,255,0.15)',
  spaceStation: '#9fe7ff',
  spaceSun: '#fff1d6',
} as const

/** 圖例裡「其他玩家」的色塊：取四個玩家色拼成一個圓（紅、藍、黃、綠）*/
export const MINIMAP_PLAYERS_SWATCH = `conic-gradient(${PLAYER_COLORS[0].hex} 0 25%, ${PLAYER_COLORS[1].hex} 0 50%, ${PLAYER_COLORS[4].hex} 0 75%, ${PLAYER_COLORS[6].hex} 0)`

/** 圖例的設施列（顏色 MINIMAP[key]、文字 guide.map.<key>）；單位四項與視野框另外畫，見 Guide.tsx 的 MapLegend */
export const MINIMAP_LEGEND_POIS = ['door', 'console', 'medical', 'suit', 'vendor', 'git', 'fac'] as const

/** 小地圖上設施的顏色：醫療粉紅、防護服橘、GIT 青、控制台藍（圓點）、其他販賣機綠；不重要的不畫（null）*/
export function poiColor(kind: string, ref?: string): string | null {
  if (kind === 'vendor') {
    if (ref === 'medical') return MINIMAP.medical
    if (ref?.startsWith('suit')) return MINIMAP.suit
    if (ref === 'gitTester' || ref === 'gitResolver') return MINIMAP.git
    return MINIMAP.vendor
  }
  if (kind === 'git') return MINIMAP.git
  if (kind === 'console' || kind === 'powerConsole') return MINIMAP.console
  if (kind === 'regenerator' || kind === 'moduleFactory' || kind === 'moduleSocket' || kind === 'rummageBox') return MINIMAP.fac
  return null
}
