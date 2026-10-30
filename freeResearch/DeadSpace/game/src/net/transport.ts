export type PeerId = string
export type Channel = 'reliable' | 'fast'

/** 網路傳輸抽象（architecture §7.1）*/
export interface Transport {
  readonly selfId: string
  send(to: PeerId, data: Uint8Array, channel?: Channel): void
  broadcast(data: Uint8Array, channel?: Channel): void
  onMessage(cb: (from: PeerId, data: Uint8Array) => void): void
  onPeerJoin(cb: (id: PeerId) => void): void
  onPeerLeave(cb: (id: PeerId) => void): void
  close(): void
}

export function randomId(len = 16): string {
  const a = 'abcdefghijkmnopqrstuvwxyzABCDEFGHJKLMNPQRSTUVWXYZ23456789'
  const buf = new Uint8Array(len)
  crypto.getRandomValues(buf)
  let s = ''
  for (const b of buf) s += a[b % a.length]
  return s
}

/** 小型事件分派器 */
export class Emitter<A extends unknown[]> {
  private cbs: ((...a: A) => void)[] = []
  on(cb: (...a: A) => void): void {
    this.cbs.push(cb)
  }
  emit(...a: A): void {
    for (const cb of this.cbs) {
      try {
        cb(...a)
      } catch (e) {
        if (__DEV__) console.error(e)
      }
    }
  }
}
