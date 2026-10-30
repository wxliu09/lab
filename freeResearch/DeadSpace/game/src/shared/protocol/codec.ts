import { Packr, Unpackr } from 'msgpackr'
import type { ClientMsg, HostMsg } from './messages'

// 不使用 record 結構（records 需要雙方共享狀態，斷線重連時容易錯亂）
const packr = new Packr({ useRecords: false, moreTypes: false, bundleStrings: false })
const unpackr = new Unpackr({ useRecords: false, moreTypes: false, int64AsType: 'number', mapsAsObjects: true })

/** peer 送來的單一訊息最大位元組數；超過直接丟棄 */
export const MAX_CLIENT_MSG_BYTES = 4096

export function encode(msg: ClientMsg | HostMsg): Uint8Array {
  return packr.pack(msg)
}

/** 解碼失敗回傳 undefined，永不丟例外 */
export function decode(data: Uint8Array): unknown {
  try {
    return unpackr.unpack(data)
  } catch {
    return undefined
  }
}
