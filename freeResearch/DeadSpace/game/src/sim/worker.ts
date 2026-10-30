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

function flush(): void {
  if (!out.length) return
  const batch = out
  out = []
  ctx.postMessage({ t: 'out', batch }, batch.map(([, d]) => d.buffer as ArrayBuffer))
}

ctx.onmessage = (ev: MessageEvent<In>) => {
  const m = ev.data
  if (m.t === 'init') {
    // msgpackr 會重用內部 buffer：每則訊息複製成獨立 buffer 才能安全轉移所有權
    server = new GameServer(m.code, { send: (peer, data) => out.push([peer, data.slice()]) }, m.seed)
    start()
    return
  }
  if (!server) return
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
  flush()
}

function start(): void {
  const stepMs = TICK_DT * 1000
  let next = performance.now()
  let n = 0
  const loop = () => {
    const now = performance.now()
    let steps = 0
    while (now >= next && steps < 5) {
      const t0 = performance.now()
      server!.tick()
      tickMsAvg = tickMsAvg * 0.95 + (performance.now() - t0) * 0.05
      next += stepMs
      steps++
    }
    if (now - next > 1000) next = now
    flush()
    if (++n % 100 === 0) ctx.postMessage({ t: 'stat', tickMs: tickMsAvg })
    setTimeout(loop, Math.max(0, next - performance.now()))
  }
  loop()
}
