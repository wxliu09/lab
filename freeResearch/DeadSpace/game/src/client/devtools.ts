// 除錯工具的入口：在主選單、大廳、對局中依序鍵入暗號即啟用（只對本機分頁）。啟用前不定義任何全域、不輸出任何訊息。
import { isHost, onHost, rtt, hostTickMs, send, world } from './session'
import { typingInField } from './input'
import { currentFps } from '../render/engine'
import { H, makeTool, sha256hex, type Tool } from './devtoolsCore'

const KEY = 'xc.ui.d'
let seq = 1
const waiters = new Map<number, (r: { ok: boolean; msg: string; data?: unknown }) => void>()
let buf = ''
let tool: Tool | null = null

function target(): Record<string, unknown> {
  return window as unknown as Record<string, unknown>
}

function enable(): void {
  if (tool) return
  tool = makeTool({
    isHost: () => isHost.value,
    remote: (code, args) =>
      new Promise((resolve) => {
        const id = seq++
        const timer = setTimeout(() => {
          waiters.delete(id)
          resolve({ ok: false, msg: 'timeout' })
        }, 8000)
        waiters.set(id, (r) => {
          clearTimeout(timer)
          resolve(r)
        })
        send({ t: 'Tune', id, op: code, args })
      }),
    local: (name) => {
      if (name === 'netstats') return { rtt: Math.round(rtt()), snapshots: world.snapCount, tick: world.tick, hostTickMs: Math.round(hostTickMs() * 100) / 100 }
      if (name === 'fps') return Math.round(currentFps())
      return null
    },
    onLock: () => {
      tool?.remove(target())
      tool = null
      try {
        localStorage.removeItem(KEY)
      } catch {
        /* ignore */
      }
    },
    console,
  })
  tool.define(target())
}

async function check(): Promise<void> {
  if (tool || buf.length < 7 || !globalThis.crypto?.subtle) return
  if ((await sha256hex(buf.slice(-7))) !== H) return
  buf = ''
  try {
    localStorage.setItem(KEY, (await sha256hex(H)).slice(0, 12))
  } catch {
    /* ignore */
  }
  enable()
  console.log('ok')
}

export function installDevtools(): void {
  onHost((msg) => {
    if (msg.t !== 'TuneResult') return
    const w = waiters.get(msg.id)
    if (w) {
      waiters.delete(msg.id)
      w(msg)
    }
  })
  window.addEventListener(
    'keydown',
    (e) => {
      if (typingInField() || e.ctrlKey || e.metaKey || e.altKey) return
      const k = e.key.length === 1 ? e.key.toLowerCase() : ''
      if (!/^[a-z0-9]$/.test(k)) return
      buf = (buf + k).slice(-16)
      void check()
    },
    true,
  )
  try {
    const saved = localStorage.getItem(KEY)
    if (saved && globalThis.crypto?.subtle)
      void sha256hex(H).then((v) => {
        if (v.slice(0, 12) === saved) enable()
      })
  } catch {
    /* ignore */
  }
}
