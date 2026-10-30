export const PROTOCOL_VERSION = 1
export const APP_ID = 'xenocyte-v1'
export const TICK_HZ = 20
export const TICK_DT = 1 / TICK_HZ
export const MAX_PLAYERS = 12
export const RECONNECT_GRACE_S = 90
/** 房號字元：排除易混淆的 0/O/1/I/L */
export const ROOM_ALPHABET = 'ABCDEFGHJKMNPQRSTUVWXYZ23456789'
export const ROOM_CODE_LEN = 5

/** 12 色玩家色（已避開紅綠色盲最難分辨的組合，並以名稱輔助） */
export const PLAYER_COLORS: readonly { id: string; hex: string }[] = [
  { id: 'red', hex: '#e8453c' },
  { id: 'blue', hex: '#3d7cf2' },
  { id: 'teal', hex: '#2ec4b6' },
  { id: 'purple', hex: '#9b5de5' },
  { id: 'yellow', hex: '#f6d743' },
  { id: 'orange', hex: '#ff8c1a' },
  { id: 'green', hex: '#5cc95c' },
  { id: 'pink', hex: '#ff7eb6' },
  { id: 'gray', hex: '#a7b0ba' },
  { id: 'lightblue', hex: '#8fd3ff' },
  { id: 'darkgreen', hex: '#1f7a4d' },
  { id: 'brown', hex: '#9c6b3f' },
]
