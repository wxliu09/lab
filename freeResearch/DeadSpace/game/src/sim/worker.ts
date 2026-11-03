// Sim Worker 進入點：權威模擬以 20 Hz 自我校正計時器推進，不受背景分頁 rAF 節流影響
import { GameServer } from './server'
import { TICK_DT } from '../shared/constants'

type In =
  | { t: 'init'; code: string; seed: number }
  | { t: 'join'; peer: string }
  | { t: 'leave'; peer: string }
  | { t: 'msg'; peer: string; data: Uint8Array }
  | { t: 'bg'; hidden: boolean }
  | { t: 'hook'; id: number; op: string; args: unknown[] }

const ctx = self as unknown as DedicatedWorkerGlobalScope
let server: GameServer | null = null
let out: [string, Uint8Array][] = []
let tickMsAvg = 0
/** 例外計數：tick（server.tick 丟出來的）與訊息處理；連續出錯的 tick 數用來判斷不可恢復 */
let errs = 0
let tickStreak = 0
let fatalSent = false
/** 連續 5 秒每個 tick 都丟例外（快照送不出去），或核心步驟連續 10 秒每 tick 出錯：視為不可恢復，通知主執行緒 */
const FATAL_TICK_STREAK = 100
const FATAL_STEP_STREAK = 200

function fatal(why: string): void {
  if (fatalSent) return
  fatalSent = true
  ctx.postMessage({ t: 'fatal', msg: why })
}

function report(where: string, e: unknown): void {
  errs++
  if (__DEV__) console.error('[sim]', where, e)
}

function flush(): void {
  if (!out.length) return
  const batch = out
  out = []
  ctx.postMessage({ t: 'out', batch }, batch.map(([, d]) => d.buffer as ArrayBuffer))
}

ctx.onmessage = (ev: MessageEvent<In>) => {
  const m = ev.data
  if (m.t === 'init') {
    try {
      // msgpackr 會重用內部 buffer：每則訊息複製成獨立 buffer 才能安全轉移所有權
      server = new GameServer(m.code, { send: (peer, data) => out.push([peer, data.slice()]) }, m.seed)
    } catch (e) {
      report('init', e)
      fatal('init: ' + String(e))
      return
    }
    start()
    return
  }
  if (!server) return
  try {
    handle(server, m)
  } catch (e) {
    // 單一訊息（加入、離開、轉送）的例外不能讓 worker 停擺
    report(m.t, e)
  }
  flush()
}

function handle(server: GameServer, m: Exclude<In, { t: 'init' }>): void {
  switch (m.t) {
    case 'join':
      server.onJoin(m.peer)
      break
    case 'leave':
      server.onLeave(m.peer)
      break
    case 'msg':
      server.onMessage(m.peer, m.data)
      break
    case 'bg':
      server.hostHidden = m.hidden
      break
    case 'hook':
      // 測試掛勾：只在非正式 build 啟用
      if (__TEST_HOOKS__) {
        const g = server.game
        const r = g ? g.tuning.hook(m.op, m.args) : server.lobbyHook(m.op, m.args)
        ctx.postMessage({ t: 'hookResult', id: m.id, result: r })
      }
      break
  }
}

function start(): void {
  const stepMs = TICK_DT * 1000
  let next = performance.now()
  let n = 0
  // try／finally：任何例外都不能讓計時器鏈斷掉（以前一個未捕捉的例外就會讓整局靜止，畫面上沒有任何提示）
  const loop = () => {
    try {
      const now = performance.now()
      let steps = 0
      while (now >= next && steps < 5) {
        const t0 = performance.now()
        try {
          server!.tick()
          tickStreak = 0
        } catch (e) {
          report('tick', e)
          if (++tickStreak >= FATAL_TICK_STREAK) fatal('tick: ' + String(e))
        }
        if ((server!.game?.errStreak ?? 0) >= FATAL_STEP_STREAK) fatal('step errors')
        tickMsAvg = tickMsAvg * 0.95 + (performance.now() - t0) * 0.05
        next += stepMs
        steps++
      }
      if (now - next > 1000) next = now
      flush()
      if (++n % 100 === 0) ctx.postMessage({ t: 'stat', tickMs: tickMsAvg, errs: errs + (server!.game?.stepErrors ?? 0) })
    } catch (e) {
      report('loop', e)
    } finally {
      setTimeout(loop, Math.max(0, next - performance.now()))
    }
  }
  loop()
}
