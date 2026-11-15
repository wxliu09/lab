// 單機練習暫停（client 端）：只有自己一個真人的練習局，打開遊戲選單（Esc）、說明（G）、圖鑑（F1）、設定時
// 送 { t: 'pause', on: true } 給主機；全部關掉時送 on: false。主機只在練習局、而且只有 1 名真人時接受，暫停時 sim 不前進。
// 畫面上的「已暫停」標示看主機回報的 world.w.pz（主機真的暫停了才顯示），不看自己送出了什麼。
import { effect } from '@preact/signals'
import { PRACTICE_ROOM, type ClientMsg } from '../shared/protocol/messages'
import { currentRoom, isHost, screen, send, startInfo } from './session'

/** client → host 的暫停訊息（protocol/messages.ts 的 ClientMsg）*/
export type PauseMsg = Extract<ClientMsg, { t: 'pause' }>

/** 單機練習：練習房、自己是主機、名單上只有一名真人（其餘都是 AI）*/
export function isSoloPractice(room: string, host: boolean, players: readonly { bot: boolean }[] | undefined): boolean {
  if (room !== PRACTICE_ROOM || !host || !players) return false
  return players.filter((p) => !p.bot).length === 1
}

/** 目前這一局是不是單機練習（讀 session 的狀態）*/
export function soloPracticeNow(): boolean {
  return isSoloPractice(currentRoom(), isHost.value, startInfo.value?.players)
}

/** 送出暫停／繼續 */
export function sendPause(on: boolean): void {
  const m: PauseMsg = { t: 'pause', on }
  send(m)
}

/**
 * 暫停要求的去抖：同一個同步流程裡關掉一個、打開另一個（例如遊戲選單 → 說明）不要送出「繼續、暫停」兩則，
 * 只在這一輪結束時送出最後的狀態；狀態沒變就不送。
 */
export class PauseRequester {
  private sent = false
  private want = false
  private timer: ReturnType<typeof setTimeout> | null = null

  constructor(
    private out: (on: boolean) => void,
    private defer: (f: () => void) => ReturnType<typeof setTimeout> = (f) => setTimeout(f, 0),
  ) {}

  /** 想要的狀態（每次條件變動就呼叫）*/
  set(on: boolean): void {
    this.want = on
    if (this.timer !== null) return
    this.timer = this.defer(() => {
      this.timer = null
      this.flush()
    })
  }

  /** 立刻送出目前想要的狀態（沒變就不送）*/
  flush(): void {
    if (this.want === this.sent) return
    this.sent = this.want
    this.out(this.sent)
  }

  /** 新的一局：主機那邊是全新的模擬（沒有暫停），從頭算 */
  reset(): void {
    this.sent = false
    this.want = false
  }

  /** 結束監看：還在暫停就送出繼續 */
  dispose(): void {
    if (this.timer !== null) clearTimeout(this.timer)
    this.timer = null
    this.want = false
    this.flush()
  }

  get pausedSent(): boolean {
    return this.sent
  }
}

/**
 * 開始監看（對局畫面掛上時呼叫，回傳卸載用的函式）。open = 「有會暫停的介面開著」，在 effect 裡讀 signal，
 * 由呼叫端組合（遊戲選單、說明、圖鑑、設定的開關狀態分散在各自的元件模組裡）。
 */
export function watchPracticePause(open: () => boolean): () => void {
  const req = new PauseRequester(sendPause)
  let gid: number | undefined
  const stop = effect(() => {
    const info = startInfo.value
    // 換了一局：主機是新的模擬，不沿用上一局送過的狀態
    if (info?.gid !== gid) {
      gid = info?.gid
      req.reset()
    }
    const solo = screen.value === 'game' && !!info && isSoloPractice(currentRoom(), isHost.value, info.players)
    // open() 一定要讀到（訂閱各介面的 signal），不能被 && 短路掉
    const o = open()
    req.set(solo && o)
  })
  return () => {
    stop()
    req.dispose()
  }
}
