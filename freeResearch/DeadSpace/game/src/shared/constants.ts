export const PROTOCOL_VERSION = 1
export const APP_ID = 'xenocyte-v1'
export const TICK_HZ = 20
export const TICK_DT = 1 / TICK_HZ
export const MAX_PLAYERS = 12
export const RECONNECT_GRACE_S = 90
/** 房號字元：排除易混淆的 0/O/1/I/L */
export const ROOM_ALPHABET = 'ABCDEFGHJKMNPQRSTUVWXYZ23456789'
export const ROOM_CODE_LEN = 5

/**
 * 12 色玩家色：紅色盲、綠色盲、藍色盲模擬（Machado 2009，嚴重度 1.0）下兩兩 CIEDE2000 ≥ 10.8、一般視覺 ≥ 19.9，
 * 深色背景上亮度都夠（L* ≥ 48），並以名稱輔助（-add 群組 顏色 等指令用 id）。
 * 原本的 gray／darkgreen／brown 在色盲下和 teal／red 幾乎分不出來，換成 white／magenta／tan。
 */
export const PLAYER_COLORS: readonly { id: string; hex: string }[] = [
  { id: 'red', hex: '#e33d38' },
  { id: 'blue', hex: '#5d8ada' },
  { id: 'teal', hex: '#19c3b5' },
  { id: 'purple', hex: '#824aff' },
  { id: 'yellow', hex: '#f7d83b' },
  { id: 'orange', hex: '#f37600' },
  { id: 'green', hex: '#85ca6e' },
  { id: 'pink', hex: '#ff8db6' },
  { id: 'white', hex: '#eff0f3' },
  { id: 'lightblue', hex: '#8fd4ff' },
  { id: 'magenta', hex: '#d63caa' },
  { id: 'tan', hex: '#ab906f' },
]
