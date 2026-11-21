// 單機練習暫停（client 端）：只有自己一個真人的練習局，打開遊戲選單（Esc）、說明（G）、圖鑑（F1）、設定時
// 送 { t: 'pause', on: true } 給主機；全部關掉時送 on: false。主機只在練習局、而且只有 1 名真人時接受，暫停時 sim 不前進。
// 畫面上的「已暫停」標示看主機回報的 world.w.pz（主機真的暫停了才顯示），不看自己送出了什麼。
// 第 6 輪審查（B-P2）：切到背景分頁（visibilitychange → hidden）、局中載入場景（「載入中：建立場景…」覆蓋層）時也自動暫停，
// 回來／載入完自動繼續。這些和玩家自己打開的選單是「或」的關係：玩家按 Esc 暫停後切走再回來，仍然停在選單裡，不會被這裡蓋掉。
// 多人局不受影響（isSoloPractice 只認單機練習；主機也只在練習局、只有一名真人時接受暫停）。
import { effect, signal } from '@preact/signals'
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

/** 分頁在背景（document.hidden；watchPracticePause 掛上時開始追蹤）*/
export const pageHidden = signal(typeof document !== 'undefined' && document.hidden)
/** 局中分段建站的「載入中」覆蓋層顯示中（GameScreen 設定）：畫面還停在上一站，玩家看不到、也操作不了 */
export const sceneBusy = signal(false)

/** 單機練習要不要暫停：玩家打開的介面、分頁在背景、場景載入中，任一個成立就暫停 */
export function wantPause(solo: boolean, uiOpen: boolean, hidden: boolean, busy: boolean): boolean {
  return solo && (uiOpen || hidden || busy)
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
  // 分頁切到背景：背景分頁的計時器會被節流（setTimeout 0 可能延到 1 秒以上），直接送出，不等去抖
  const vis = () => {
    pageHidden.value = document.hidden
    req.flush()
  }
  const hasDoc = typeof document !== 'undefined' && typeof document.addEventListener === 'function'
  if (hasDoc) {
    pageHidden.value = document.hidden
    document.addEventListener('visibilitychange', vis)
  }
  const stop = effect(() => {
    const info = startInfo.value
    // 換了一局：主機是新的模擬，不沿用上一局送過的狀態
    if (info?.gid !== gid) {
      gid = info?.gid
      req.reset()
    }
    const solo = screen.value === 'game' && !!info && isSoloPractice(currentRoom(), isHost.value, info.players)
    // open() 與兩個自動暫停的 signal 一定要讀到（訂閱），不能被 && 短路掉
    const o = open()
    const hidden = pageHidden.value
    const busy = sceneBusy.value
    req.set(wantPause(solo, o, hidden, busy))
  })
  return () => {
    stop()
    if (hasDoc) document.removeEventListener('visibilitychange', vis)
    req.dispose()
  }
}
