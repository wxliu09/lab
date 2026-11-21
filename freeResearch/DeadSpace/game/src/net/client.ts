// NetClient：連到主機、送 Hello、收快照與事件。主機自己的 client 用 LocalTransport，其他人用 WebRTC／BroadcastChannel。
import { decode, encode } from '../shared/protocol/codec'
import type { ClientMsg, HostMsg } from '../shared/protocol/messages'
import { PROTOCOL_VERSION } from '../shared/constants'
import type { Transport } from './transport'

export interface ClientIdentity {
  name: string
  color: number
  token: string
}

/** 重連用的 token：sha256(本機 token + 主機 peer id)，取前 40 個十六進位字元 */
export async function bindToken(base: string, hostPeer: string): Promise<string> {
  const subtle = globalThis.crypto?.subtle
  if (!subtle) return base
  const b = await subtle.digest('SHA-256', new TextEncoder().encode(base + ':' + hostPeer))
  return [...new Uint8Array(b)].map((x) => x.toString(16).padStart(2, '0')).join('').slice(0, 40)
}

export class NetClient {
  hostPeer: string | null = null
  /** 有第二個 peer 也宣稱自己是主機（可能是冒充）*/
  hostConflict = false
  /** 最近一次發現冒充者的時間（performance.now，ms；0 = 沒有）：對局中的 HUD 橫幅據此顯示一陣子 */
  hostConflictAt = 0
  rtt = 0
  private pingTimer: ReturnType<typeof setInterval>
  private handlers: ((m: HostMsg) => void)[] = []
  private lostHandlers: (() => void)[] = []
  welcomed = false
  /**
   * 給過自己 welcome（已經入座）的主機 peer id。入座之後只認這一個：主機短暫失聯（hostPeer 清掉）期間
   * 有別的 peer 送 { t: 'host' } 也不會被當成主機，只會記成衝突；原主機回來（送任何訊息）就照常恢復。
   */
  seatedHost: string | null = null
  /** 自稱主機、但不是我們入座的那個主機的 peer：它之後送的任何訊息一律忽略 */
  private impostors = new Set<string>()
  /** 還沒入座（沒收過 welcome）就失聯的主機：它又出現時照樣重新打招呼 */
  private lostHost: string | null = null

  constructor(
    readonly transport: Transport,
    private id: ClientIdentity,
  ) {
    transport.onMessage((from, data) => this.onData(from, data))
    transport.onPeerLeave((peer) => {
      if (peer === this.hostPeer) {
        // 主機失聯：主機分頁卡住幾秒（開局建場景、編譯 shader）時心跳會中斷。已經入座的話 seatedHost 記著它，
        // 之後只要再收到它的任何訊息就重新打招呼，伺服器會重送 welcome 與完整的開局資料；別的 peer 不能趁機頂替
        if (!this.seatedHost) this.lostHost = peer
        this.hostPeer = null
        this.welcomed = false
        for (const h of this.lostHandlers) h()
      }
    })
    this.pingTimer = setInterval(() => {
      if (this.hostPeer) this.send({ t: 'ping', n: performance.now() })
      // 已經入座、但傳輸層說主機失聯了（多半是自己或主機的分頁卡了幾秒，心跳逾時）：照樣對原主機送 ping。
      // 主機其實還在的話會回 pong，下面的 onData 收到原主機的訊息就重新打招呼。以前要等主機自己送東西來才會恢復，
      // 大廳裡主機沒事不送東西，客人就一直斷著（送出的聊天、準備都被丟掉，第 6 輪多人「再來一局」的 e2e 抓到）
      else if (this.seatedHost) this.transport.send(this.seatedHost, encode({ t: 'ping', n: performance.now() } satisfies ClientMsg), 'reliable')
    }, 2000)
  }

  onMsg(h: (m: HostMsg) => void): void {
    this.handlers.push(h)
  }
  onHostLost(h: () => void): void {
    this.lostHandlers.push(h)
  }

  private onData(from: string, data: Uint8Array): void {
    const m = decode(data) as HostMsg | undefined
    if (!m || typeof m !== 'object' || typeof (m as { t?: unknown }).t !== 'string') return
    // 已知的冒充者：不管送什麼都不理（還在送就繼續亮警告）
    if (this.impostors.has(from)) {
      this.flagConflict(from)
      return
    }
    if (m.t === 'host') {
      // 入座之後只認原主機：其他 peer 自稱主機一律算衝突（就算原主機正好失聯、hostPeer 是空的）
      const want = this.seatedHost ?? this.hostPeer
      if (want && want !== from) {
        this.flagConflict(from)
        return
      }
      // 原主機又對我們送 { t: 'host' }：主機那一端把我們當成新連進來的 peer（主機的傳輸層曾經判定我們離開，
      // server 已經放掉這個連線的座位綁定），要重新打招呼，不然之後送的東西主機都不認
      if (!this.hostPeer || this.hostPeer === from) this.greet(from)
      return
    }
    // 失聯的原主機又出現了（送了 host 以外的訊息）：重新連上
    const back = this.seatedHost ?? this.lostHost
    if (!this.hostPeer && back && from === back) {
      this.lostHost = null
      this.greet(from)
      return
    }
    // 只接受主機的訊息
    if (from !== this.hostPeer) return
    if (m.t === 'welcome') {
      this.welcomed = true
      this.seatedHost = from
      this.lostHost = null
    }
    if (m.t === 'pong') this.rtt = performance.now() - m.n
    for (const h of this.handlers) h(m)
  }

  /** 認定 from 是主機並打招呼（token 與主機的 peer id 綁定：就算先回應的是冒充者，它拿到的 token 對真正的主機也沒有用）*/
  private greet(from: string): void {
    this.hostPeer = from
    void bindToken(this.id.token, from).then((token) => {
      if (this.hostPeer === from) this.send({ t: 'hello', name: this.id.name, color: this.id.color, ver: PROTOCOL_VERSION, token })
    })
  }

  private flagConflict(from: string): void {
    this.impostors.add(from)
    this.hostConflict = true
    this.hostConflictAt = performance.now()
  }

  send(m: ClientMsg): void {
    if (!this.hostPeer) return
    this.transport.send(this.hostPeer, encode(m), m.t === 'cmd' ? 'reliable' : 'reliable')
  }

  close(): void {
    clearInterval(this.pingTimer)
    this.transport.close()
  }
}
