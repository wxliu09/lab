// 除錯工具核心：資料表解碼、說明輸出、在目標物件上定義 help／xc。不依賴 DOM，方便單元測試。
export const H = 'c7d3cf05ef873c4b645a87211c6be86014c73a3923fa6fe3ceb04b47f591eb6f'
const D = 'eyJjbWRzIjogW1sic3RhdHVzIiwgInphIiwgIiIsICLos4foqIoiLCAi5pys5bGA5qaC5rOB77ya5pmC6ZaT44CB5pqr5YGc44CB5pmC6ZaT5YCN546H44CB56uZ6bue44CB5a2Y5rS75Lq65pW4IiwgInhjLnN0YXR1cygpIl0sIFsicGxheWVycyIsICJ6YiIsICIiLCAi6LOH6KiKIiwgIuaJgOacieeOqeWutu+8muecn+Wvpui6q+WIhuOAgeiBt+alreOAgeebruWJjeWei+aFi+OAgUhQ44CBRVDjgIHmiYDlnKjlnLDpu54iLCAieGMucGxheWVycygpIl0sIFsicm9sZXMiLCAiemMiLCAiIiwgIuizh+ioiiIsICLmr4/kvY3njqnlrrbnmoTnnJ/lr6bouqvliIYiLCAieGMucm9sZXMoKSJdLCBbImxpc3QiLCAiemQiLCAia2luZCIsICLos4foqIoiLCAi5YiX5Ye6IGlk77yaaXRlbXMgLyB1bml0cyAvIGZvcm1zIC8gcGxhY2VzIC8gZXZlbnRzIC8gc3RhdGlvbnMgLyB2ZW5kb3JzIiwgInhjLmxpc3QoXCJpdGVtc1wiKSJdLCBbIm1hcEhhY2siLCAieWEiLCAib24iLCAi6KaW6YeO77yI5Y+q5b2x6Z+/6Ieq5bex77yJIiwgIueci+imi+aJgOWcqOWNgOWfn+eahOWFqOmDqOWWruS9je+8iOS4jeWPl+imlue3mumZkOWItu+8iSIsICJ4Yy5tYXBIYWNrKHRydWUpIl0sIFsiaGVhciIsICJ5YiIsICJvbiIsICLoppbph47vvIjlj6rlvbHpn7/oh6rlt7HvvIkiLCAi5pS25Yiw5q276ICF44CB576k57WE44CB55Ww6aGe6Zmj54ef56eB6aC755qE6KiK5oGvIiwgInhjLmhlYXIodHJ1ZSkiXSwgWyJ4cmF5IiwgInljIiwgIm9uIiwgIuimlumHju+8iOWPquW9semfv+iHquW3se+8iSIsICLnnIvnqb/nlbDlvaLlvaLmhYvjgIHljbXjgIHnua3nmoTmk4HmnInogIUiLCAieGMueHJheSh0cnVlKSJdLCBbImVwIiwgInhhIiwgIm4sIHdobyIsICLos4fmupAiLCAi5aKe5ribIEVQIiwgInhjLmVwKDUwMCwgXCJtZVwiKSJdLCBbImdpdmUiLCAieGIiLCAiaXRlbUlkLCB3aG8sIGNvdW50IiwgIuizh+a6kCIsICLntabpgZPlhbfvvIhpZCDoposgeGMubGlzdChcIml0ZW1zXCIp77yJIiwgInhjLmdpdmUoXCJmdXNpb25DaGFyZ2VcIiwgXCJtZVwiLCAyKSJdLCBbInJlc3RvY2siLCAieGMiLCAidmVuZG9yIiwgIuizh+a6kCIsICLosqnos6PmqZ/nq4vljbPoo5zmu7/vvIjnnIHnlaUgPSDlhajpg6jvvIkiLCAieGMucmVzdG9jaygpIl0sIFsiZ29kIiwgIndhIiwgIndobywgb24iLCAi5Zau5L2NIiwgIueEoeaVtSIsICJ4Yy5nb2QoXCJtZVwiLCB0cnVlKSJdLCBbImhlYWwiLCAid2IiLCAid2hvIiwgIuWWruS9jSIsICLoo5zmu7/nlJ/lkb3oiIfog73ph48iLCAieGMuaGVhbChcImFsbFwiKSJdLCBbImtpbGwiLCAid2MiLCAid2hvIiwgIuWWruS9jSIsICLmrrrmrbsiLCAieGMua2lsbChcImJsdWVcIikiXSwgWyJyZXZpdmUiLCAid2QiLCAid2hvIiwgIuWWruS9jSIsICLorpPmrbvogIXlnKjljp/nq5nlvqnmtLsiLCAieGMucmV2aXZlKFwiYWxsXCIpIl0sIFsidHAiLCAid2UiLCAicGxhY2UsIHdobyIsICLllq7kvY0iLCAi5YKz6YCB77ya56uZIGlk44CB56uZOuaIv+mWk+OAgVwieCx5XCLjgIHnjqnlrrblkI3nqLEiLCAieGMudHAoXCJueXg6Z2l0bGFiXCIpIl0sIFsic3BlZWQiLCAid2YiLCAibXVsdCwgd2hvIiwgIuWWruS9jSIsICLnp7vli5XpgJ/luqblgI3njofvvIgwLjHigJMxMO+8iSIsICJ4Yy5zcGVlZCgzKSJdLCBbImV2b2x2ZSIsICJ3ZyIsICJmb3JtSWQsIHdobyIsICLllq7kvY0iLCAi56uL5Y2z6K6K5oiQ5oyH5a6a5Z6L5oWL77yIaWQg6KaLIHhjLmxpc3QoXCJmb3Jtc1wiKe+8iSIsICJ4Yy5ldm9sdmUoXCJ4ZW5vLmx1bWVuXCIpIl0sIFsic3VpdCIsICJ3aCIsICJzdWl0SWQsIHdobyIsICLllq7kvY0iLCAi56m/5LiK6Ziy6K235pyNIiwgInhjLnN1aXQoXCJzdWl0LnRlc2xhXCIpIl0sIFsibm9Db29sZG93biIsICJ3aSIsICJvbiwgd2hvIiwgIuWWruS9jSIsICLmioDog73nhKHlhrfljbvjgIHkuI3ogJfog73ph48iLCAieGMubm9Db29sZG93bih0cnVlKSJdLCBbInNwYXduIiwgIndqIiwgInVuaXRJZCwgY291bnQsIGF0IiwgIuWWruS9jSIsICLlnKjouqvpgormiJbmjIflrprlnLDpu57nlJ/miJDllq7kvY0iLCAieGMuc3Bhd24oXCJwZXJzb25uZWxcIiwgMykiXSwgWyJzZXRSb2xlIiwgInZhIiwgInJvbGUsIHdobywgXCJmb3JjZVwiIiwgIuimj+WJhyIsICLmlLnororouqvliIbvvIhodW1hbiAvIHhlbm8gLyBtdXRhbnQgLyBhbmRyb2lk77yJ77yM56ys5LiJ5YCL5Y+D5pW45b+F6aCI5pivIFwiZm9yY2VcIiIsICJ4Yy5zZXRSb2xlKFwieGVub1wiLCBcIm1lXCIsIFwiZm9yY2VcIikiXSwgWyJ0aW1lU2NhbGUiLCAidmIiLCAieCIsICLopo/liYciLCAi6YGK5oiy6YCf5bqm5YCN546H77yIMC4yNeKAkzTvvIkiLCAieGMudGltZVNjYWxlKDIpIl0sIFsicGF1c2UiLCAidmMiLCAiIiwgIuimj+WJhyIsICLmmqvlgZwiLCAieGMucGF1c2UoKSJdLCBbInJlc3VtZSIsICJ2ZCIsICIiLCAi6KaP5YmHIiwgIue5vOe6jCIsICJ4Yy5yZXN1bWUoKSJdLCBbImV2ZW50IiwgInVhIiwgImV2ZW50SWQiLCAi5LqL5Lu2IiwgIuinuOeZvOmaqOapn+S6i+S7tu+8iOeci+i1t+S+huWSjOmaqOapn+aKveWIsOeahOS4gOaoo++8iSIsICJ4Yy5ldmVudChcIndvcm1ob2xlXCIpIl0sIFsiYXBvY2FseXBzZSIsICJ1YiIsICJcImZsZWV0XCIgfCBcIm9yYml0XCIiLCAi5LqL5Lu2IiwgIuinuOeZvOacq+aXpSIsICJ4Yy5hcG9jYWx5cHNlKFwiZmxlZXRcIikiXSwgWyJkZXN0cm95IiwgInVjIiwgInN0YXRpb25JZCIsICLkuovku7YiLCAi5pGn5q+A56uZ6bueIiwgInhjLmRlc3Ryb3koXCJodWxrN1wiKSJdLCBbIndpbiIsICJ1ZCIsICJmYWN0aW9uIiwgIuS6i+S7tiIsICLnm7TmjqXntZDmnZ/mnKzlsYDvvIhjcmV3IC8geGVubyAvIG11dGFudCAvIGRyYXfvvIkiLCAieGMud2luKFwiY3Jld1wiKSJdLCBbIm5ldHN0YXRzIiwgIiIsICIiLCAi6Zmk6YyvIiwgIumAo+e3muW7tumBsuOAgeW/q+eFp+mgu+eOh+OAgeS4u+apnyB0aWNrIOaZgumWkyIsICJ4Yy5uZXRzdGF0cygpIl0sIFsiZnBzIiwgIiIsICIiLCAi6Zmk6YyvIiwgIueVq+mdoiBGUFMiLCAieGMuZnBzKCkiXSwgWyJsb2ciLCAiIiwgIiIsICLpmaTpjK8iLCAi5L2g6Ieq5bex6YCZ5YCL5YiG6aCB55So6YGO55qE5oyH5Luk57SA6YyEIiwgInhjLmxvZygpIl0sIFsibG9jayIsICIiLCAiIiwgIumZpOmMryIsICLpl5zplonkuKbnp7vpmaTpgJnntYTlt6XlhbfvvIjpnIDph43mlrDovLjlhaXmmpfomZ/vvIkiLCAieGMubG9jaygpIl1dLCAid2hvIjogIndob++8muanveS9jSAx4oCTMTLjgIHpoY/oibLlkI3jgIHlkI3nqLHpg6jliIbmr5TlsI3jgIFcIm1lXCLvvIjpoJDoqK3vvInjgIFcImFsbFwi44CBXCJodW1hbnNcIuOAgVwieGVub1wi44CBXCJtdXRhbnRcIuOAgVwiYW5kcm9pZFwiIiwgInRpdGxlIjogIumZpOmMr+W3peWFtyIsICJzZW5kaW5nIjogIuWCs+mAgeS4reKApiIsICJ1c2FnZSI6ICLnlKjms5UiLCAibWFueSI6ICLmr5TlsI3liLDlpJrkurrvvIzoq4vmjIflrpoiLCAib2siOiAib2siLCAiZyI6IFsiaGVscCIsICJ4YyJdfQ=='

export interface Meta {
  cmds: [string, string, string, string, string, string][]
  who: string
  title: string
  sending: string
  usage: string
  many: string
  ok: string
  /** 定義在 window 上的兩個名稱 */
  g: [string, string]
}

export interface Deps {
  /** 送出遠端指令，回傳結果 */
  remote: (code: string, args: unknown[]) => Promise<{ ok: boolean; msg: string; data?: unknown }>
  /** 非主機要先顯示「傳送中」*/
  isHost: () => boolean
  /** 本機指令 */
  local: (name: string) => unknown
  onLock: () => void
  console: Pick<Console, 'log' | 'table' | 'group' | 'groupEnd'>
}

let meta: Meta | null = null

export function decodeMeta(): Meta {
  if (!meta) {
    const bin = atob(D)
    const bytes = Uint8Array.from(bin, (c) => c.charCodeAt(0))
    meta = JSON.parse(new TextDecoder().decode(bytes)) as Meta
  }
  return meta
}

export async function sha256hex(s: string): Promise<string> {
  const b = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(s))
  return [...new Uint8Array(b)].map((x) => x.toString(16).padStart(2, '0')).join('')
}

const G = '#5cf2a5'
const R = '#ff5a4a'
const DIM = '#8b9aa8'

export interface Tool {
  history: { t: string; cmd: string; args: unknown[]; ok: boolean }[]
  printHelp(name?: unknown): void
  define(target: Record<string, unknown>): void
  remove(target: Record<string, unknown>): void
}

export function makeTool(deps: Deps): Tool {
  const m = decodeMeta()
  const c = deps.console
  const history: Tool['history'] = []
  const out = (ok: boolean, name: string, msg: string, data?: unknown) => {
    const cmd = m.cmds.find((x) => x[0] === name)
    c.log(`%c${name}: ${msg}`, `color:${ok ? G : R};font-weight:600`)
    if (!ok && cmd) c.log(`%c${m.usage}: ${m.g[1]}.${cmd[0]}(${cmd[2]})  ${cmd[5]}`, `color:${R}`)
    if (data !== undefined && data !== null) {
      if (typeof data === 'object') c.table(data)
      else c.log(data)
    }
  }
  const printHelp = (name?: unknown) => {
    if (typeof name === 'string' && name) {
      const key = name.toLowerCase().replace(new RegExp('^' + m.g[1] + '\\.'), '').replace(/\(.*$/, '')
      const cmd = m.cmds.find((x) => x[0].toLowerCase() === key)
      if (!cmd) {
        out(false, String(name), '?')
        return
      }
      c.log(`%c${m.g[1]}.${cmd[0]}(${cmd[2]})`, `color:${G};font-weight:700`)
      c.log(cmd[4])
      c.log(`%c${cmd[5]}`, `color:${DIM}`)
      if (cmd[2].includes('who')) c.log(`%c${m.who}`, `color:${DIM}`)
      return
    }
    c.group(`%c${m.title}`, `color:${G};font-weight:700`)
    for (const cat of [...new Set(m.cmds.map((x) => x[3]))]) {
      c.group(cat)
      c.table(Object.fromEntries(m.cmds.filter((x) => x[3] === cat).map((x) => [`${m.g[1]}.${x[0]}(${x[2]})`, { '': x[4] }])))
      c.groupEnd()
    }
    c.log(`%c${m.who}`, `color:${DIM}`)
    c.groupEnd()
  }
  const call = async (name: string, code: string, args: unknown[]) => {
    const clean = args.map((a) => (a === undefined ? null : a)).slice(0, 4)
    while (clean.length && clean[clean.length - 1] === null) clean.pop()
    if (!deps.isHost()) c.log(`%c${m.sending}`, `color:${DIM}`)
    const r = await deps.remote(code, clean)
    history.push({ t: new Date().toLocaleTimeString(), cmd: name, args: clean, ok: r.ok })
    out(r.ok, name, r.msg, r.data)
    return r.data ?? r
  }
  const callLocal = async (name: string) => {
    if (name === 'log') {
      out(true, name, m.ok, history.slice())
      return history.slice()
    }
    if (name === 'lock') {
      deps.onLock()
      c.log(m.ok)
      return true
    }
    const data = deps.local(name)
    out(true, name, m.ok, data)
    return data
  }
  const tool: Tool = {
    history,
    printHelp,
    define(target) {
      const api: Record<string, unknown> = {}
      for (const [name, code] of m.cmds) api[name] = code ? (...args: unknown[]) => call(name, code, args) : () => callLocal(name)
      const helpFn = (name?: unknown) => printHelp(name)
      ;(helpFn as unknown as Record<symbol, unknown>)[Symbol.toPrimitive] = () => {
        printHelp()
        return NaN
      }
      Object.defineProperty(target, m.g[0], { configurable: true, enumerable: false, get: () => helpFn, set: () => {} })
      Object.defineProperty(target, m.g[1], { configurable: true, enumerable: false, value: Object.freeze(api), writable: false })
    },
    remove(target) {
      delete target[m.g[0]]
      delete target[m.g[1]]
    },
  }
  return tool
}
