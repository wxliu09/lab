// 第 5 輪審查（client）P2-5：重新整理後回到對局。token 依房號存在 localStorage（記時間、2 小時過期），
// 網址 hash 有房號或 2 分鐘內還在房間裡就自動連回原席位；同一個 token 同時只讓一個分頁用（租約）。
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import {
  JOIN_STALL_MS,
  LEASE_STALE_MS,
  REJOIN_WINDOW_MS,
  TOKEN_TTL_MS,
  beatLease,
  clearActive,
  hashRoom,
  joinWaited,
  leaveRoom,
  markActive,
  markDone,
  pickToken,
  purgeTokens,
  readLast,
  readToken,
  rejoinTarget,
  releaseLease,
  validRoom,
  type KV,
} from '../../src/client/rejoin'
import { UX_EN, UX_ZH } from '../../src/ui/strings/ux'

/** Web Storage 的假貨 */
class Mem implements KV {
  m = new Map<string, string>()
  getItem(k: string) {
    return this.m.get(k) ?? null
  }
  setItem(k: string, v: string) {
    this.m.set(k, String(v))
  }
  removeItem(k: string) {
    this.m.delete(k)
  }
  get length() {
    return this.m.size
  }
  key(i: number) {
    return [...this.m.keys()][i] ?? null
  }
}

const ROOM = 'ABCDE'
const T0 = 1_800_000_000_000
let n = 0
const gen = () => 'tok' + ++n

describe('房號', () => {
  it('只認正式房號（5 碼、房號字母表）；練習房、格式不對的不算', () => {
    expect(validRoom('ABCDE')).toBe(true)
    expect(validRoom('SOLO0')).toBe(false)
    expect(validRoom('ABCD')).toBe(false)
    expect(validRoom('abcde')).toBe(false)
    expect(hashRoom('#room=abcde')).toBe('ABCDE')
    expect(hashRoom('#room=SOLO0')).toBe('')
    expect(hashRoom('')).toBe('')
  })
})

describe('token 依房號存取', () => {
  it('第一次加入：產生新 token、存進 localStorage（記下時間）並拿租約；同一個分頁重新整理後拿到同一個', () => {
    const ls = new Mem()
    const tab = new Mem()
    const a = pickToken(ls, tab, ROOM, { now: T0, inst: 'p1', share: true, gen })
    expect(a.shared).toBe(true)
    const rec = readToken(ls, ROOM, T0)!
    expect(rec.tok).toBe(a.tok)
    expect(rec.at).toBe(T0)
    expect(rec.inst).toBe('p1')
    // 重新整理：舊頁面放掉租約、新頁面（同一個分頁的 sessionStorage）拿回同一個 token
    releaseLease(ls, ROOM, 'p1', T0 + 500)
    const b = pickToken(ls, tab, ROOM, { now: T0 + 1000, inst: 'p2', share: true, gen })
    expect(b).toEqual({ tok: a.tok, shared: true })
    // 不同房號各自一個
    const c = pickToken(ls, tab, 'FGHJK', { now: T0 + 1000, inst: 'p2', share: true, gen })
    expect(c.tok).not.toBe(a.tok)
  })

  it('重新整理時舊頁面沒放掉租約（當掉）：同一個分頁照樣拿回自己的 token', () => {
    const ls = new Mem()
    const tab = new Mem()
    const a = pickToken(ls, tab, ROOM, { now: T0, inst: 'p1', share: true, gen })
    const b = pickToken(ls, tab, ROOM, { now: T0 + 1000, inst: 'p2', share: true, gen })
    expect(b).toEqual({ tok: a.tok, shared: true })
  })

  it('新分頁（正式連線）：用同一個 token 回到原席位；原分頁還開著的話，它下一次心跳就知道被接手了', () => {
    const ls = new Mem()
    const tabA = new Mem()
    const tabB = new Mem()
    const a = pickToken(ls, tabA, ROOM, { now: T0, inst: 'pA', share: true, gen })
    expect(beatLease(ls, ROOM, 'pA', T0 + 1000)).toBe('ok')
    const b = pickToken(ls, tabB, ROOM, { now: T0 + 1500, inst: 'pB', share: true, gen })
    expect(b).toEqual({ tok: a.tok, shared: true })
    expect(beatLease(ls, ROOM, 'pA', T0 + 2000)).toBe('lost')
    expect(beatLease(ls, ROOM, 'pB', T0 + 2000)).toBe('ok')
    // 被接手的分頁離開時不動新分頁的記錄
    markActive(ls, tabB, ROOM, T0 + 2000, true)
    leaveRoom(ls, tabA, ROOM, 'pA', T0 + 2100, { holder: false, share: true })
    expect(readToken(ls, ROOM, T0 + 2100)!.inst).toBe('pB')
    expect(readToken(ls, ROOM, T0 + 2100)!.done).toBeUndefined()
    expect(readLast(ls)?.code).toBe(ROOM)
  })

  it('同一瀏覽器多分頁的開發模式（?net=bc）：新分頁是另一位玩家，不拿別的分頁的 token、也不動它的租約', () => {
    const ls = new Mem()
    const tabA = new Mem()
    const tabB = new Mem()
    const a = pickToken(ls, tabA, ROOM, { now: T0, inst: 'pA', share: false, gen })
    const b = pickToken(ls, tabB, ROOM, { now: T0 + 100, inst: 'pB', share: false, gen })
    expect(b.tok).not.toBe(a.tok)
    expect(b.shared).toBe(false)
    expect(beatLease(ls, ROOM, 'pA', T0 + 1000)).toBe('ok')
    // B 重新整理：拿回 B 自己的 token
    const b2 = pickToken(ls, tabB, ROOM, { now: T0 + 2000, inst: 'pB2', share: false, gen })
    expect(b2).toEqual({ tok: b.tok, shared: false })
    // 就算 A 已經關掉（租約過期），新分頁也不會拿 A 的 token（開發模式每個分頁是不同的人）
    const c = pickToken(ls, new Mem(), ROOM, { now: T0 + 60_000, inst: 'pC', share: false, gen })
    expect(c.tok).not.toBe(a.tok)
  })

  it('超過 2 小時沒用就丟掉；有在用（心跳）就一直更新時間', () => {
    const ls = new Mem()
    const tab = new Mem()
    const a = pickToken(ls, tab, ROOM, { now: T0, inst: 'p1', share: true, gen })
    expect(readToken(ls, ROOM, T0 + TOKEN_TTL_MS - 1)?.tok).toBe(a.tok)
    expect(beatLease(ls, ROOM, 'p1', T0 + TOKEN_TTL_MS - 1)).toBe('ok')
    expect(readToken(ls, ROOM, T0 + TOKEN_TTL_MS + 10)?.tok).toBe(a.tok)
    releaseLease(ls, ROOM, 'p1', T0 + TOKEN_TTL_MS)
    const later = T0 + 2 * TOKEN_TTL_MS + 1
    expect(readToken(ls, ROOM, later)).toBeNull()
    expect(ls.getItem('xc.rt.' + ROOM)).toBeNull()
    // 新分頁、過期之後：拿新的 token
    const b = pickToken(ls, new Mem(), ROOM, { now: later, inst: 'p9', share: true, gen })
    expect(b.tok).not.toBe(a.tok)
  })

  it('purgeTokens 丟掉所有過期的記錄與壞掉的資料，其他 key 不動', () => {
    const ls = new Mem()
    ls.setItem('xc.rt.AAAAA', JSON.stringify({ tok: 'x', at: T0 }))
    ls.setItem('xc.rt.BBBBB', JSON.stringify({ tok: 'y', at: T0 + TOKEN_TTL_MS }))
    ls.setItem('xc.rt.CCCCC', '{bad json')
    ls.setItem('xc.profile', '{"name":"A","color":1}')
    purgeTokens(ls, T0 + TOKEN_TTL_MS + 5)
    expect(ls.getItem('xc.rt.AAAAA')).toBeNull()
    expect(ls.getItem('xc.rt.BBBBB')).not.toBeNull()
    expect(ls.getItem('xc.rt.CCCCC')).toBeNull()
    expect(ls.getItem('xc.profile')).not.toBeNull()
  })

  it('儲存區不能用（無痕模式、被封鎖）也不會丟例外', () => {
    const bad: KV = {
      getItem: () => {
        throw new Error('no')
      },
      setItem: () => {
        throw new Error('no')
      },
      removeItem: () => {
        throw new Error('no')
      },
      length: 0,
      key: () => null,
    }
    expect(pickToken(bad, bad, ROOM, { now: T0, inst: 'p', share: true, gen }).tok).toMatch(/^tok/)
    expect(rejoinTarget(bad, bad, '#room=ABCDE', T0, { share: true })).toBe('')
    expect(() => leaveRoom(bad, bad, ROOM, 'p', T0, { holder: true, share: true })).not.toThrow()
  })
})

describe('自動重連的條件', () => {
  /** 一位客人加入 ROOM、入座、每秒心跳；回傳儲存區 */
  function playing(share = true) {
    const ls = new Mem()
    const tab = new Mem()
    pickToken(ls, tab, ROOM, { now: T0, inst: 'p1', share, gen })
    markActive(ls, tab, ROOM, T0, share)
    expect(beatLease(ls, ROOM, 'p1', T0 + 1000)).toBe('ok')
    markActive(ls, tab, ROOM, T0 + 1000, share)
    return { ls, tab }
  }
  /** 這個分頁重新整理（pagehide 放掉租約）*/
  const reload = (ls: KV, at = T0 + 1200) => releaseLease(ls, ROOM, 'p1', at)

  it('重新整理（同一個分頁）：2 分鐘內自動連回；超過 2 分鐘就不連（席位早就被判定離開）', () => {
    const { ls, tab } = playing()
    reload(ls)
    expect(rejoinTarget(ls, tab, '', T0 + 3000, { share: true })).toBe(ROOM)
    expect(rejoinTarget(ls, tab, '', T0 + 1000 + REJOIN_WINDOW_MS, { share: true })).toBe(ROOM)
    expect(rejoinTarget(ls, tab, '', T0 + 1001 + REJOIN_WINDOW_MS, { share: true })).toBe('')
  })

  it('網址 hash 有房號：有 token 就自動連回（不限 2 分鐘，token 過期為止）；第一次點邀請連結（沒有 token）不自動加入', () => {
    const { ls, tab } = playing()
    reload(ls)
    expect(rejoinTarget(ls, tab, '#room=ABCDE', T0 + 30 * 60_000, { share: true })).toBe(ROOM)
    expect(rejoinTarget(ls, new Mem(), '#room=ABCDE', T0 + 30 * 60_000, { share: true })).toBe(ROOM)
    expect(rejoinTarget(new Mem(), new Mem(), '#room=ABCDE', T0, { share: true })).toBe('')
    expect(rejoinTarget(ls, tab, '#room=ABCDE', T0 + 1201 + TOKEN_TTL_MS, { share: true })).toBe('')
  })

  it('關掉分頁再開（新分頁、沒有 hash）：2 分鐘內還在房間裡就自動連回同一個 token', () => {
    const { ls } = playing()
    reload(ls)
    const fresh = new Mem()
    expect(rejoinTarget(ls, fresh, '', T0 + 5000, { share: true })).toBe(ROOM)
    const r = pickToken(ls, fresh, ROOM, { now: T0 + 5000, inst: 'p2', share: true, gen })
    expect(r.tok).toBe(readToken(ls, ROOM, T0 + 5000)!.tok)
  })

  it('原分頁還開著（租約有心跳）：新分頁不自動接手（要接手自己按加入）；租約過期後才會', () => {
    const { ls } = playing()
    const fresh = new Mem()
    expect(rejoinTarget(ls, fresh, '', T0 + 2000, { share: true })).toBe('')
    expect(rejoinTarget(ls, fresh, '#room=ABCDE', T0 + 2000, { share: true })).toBe('')
    expect(rejoinTarget(ls, fresh, '', T0 + 1000 + LEASE_STALE_MS, { share: true })).toBe(ROOM)
  })

  it('按了離開（或被拒絕、逾時、取消重連）：之後不再自動連回；token 留著，手動加入照樣回原席位', () => {
    const { ls, tab } = playing()
    const tok = readToken(ls, ROOM, T0)!.tok
    leaveRoom(ls, tab, ROOM, 'p1', T0 + 2000, { holder: true, share: true })
    expect(readToken(ls, ROOM, T0 + 2000)?.done).toBe(true)
    expect(rejoinTarget(ls, tab, '', T0 + 3000, { share: true })).toBe('')
    expect(rejoinTarget(ls, tab, '#room=ABCDE', T0 + 3000, { share: true })).toBe('')
    expect(rejoinTarget(ls, new Mem(), '', T0 + 3000, { share: true })).toBe('')
    const again = pickToken(ls, tab, ROOM, { now: T0 + 4000, inst: 'p3', share: true, gen })
    expect(again.tok).toBe(tok)
    // 手動加入之後就不算離開了
    expect(readToken(ls, ROOM, T0 + 4000)?.done).toBeUndefined()
  })

  it('自動重連還沒拿到租約就取消：共用記錄沒有別的分頁在用，照樣標記離開', () => {
    const { ls } = playing()
    reload(ls)
    const fresh = new Mem()
    expect(rejoinTarget(ls, fresh, '', T0 + 3000, { share: true })).toBe(ROOM)
    leaveRoom(ls, fresh, ROOM, 'p2', T0 + 3500, { holder: false, share: true })
    expect(rejoinTarget(ls, fresh, '', T0 + 4000, { share: true })).toBe('')
    expect(readLast(ls)).toBeNull()
  })

  it('對局結束（收到結算）：之後重新整理不再自動連回', () => {
    const { ls, tab } = playing()
    markDone(ls, ROOM, T0 + 2000)
    clearActive(ls, tab, ROOM)
    reload(ls, T0 + 2100)
    expect(rejoinTarget(ls, tab, '', T0 + 3000, { share: true })).toBe('')
    expect(rejoinTarget(ls, tab, '#room=ABCDE', T0 + 3000, { share: true })).toBe('')
  })

  it('開發模式（?net=bc）：只有同一個分頁重新整理會自動連回；新分頁不會（那是另一位玩家）', () => {
    const { ls, tab } = playing(false)
    reload(ls)
    expect(readLast(ls)).toBeNull()
    expect(rejoinTarget(ls, tab, '', T0 + 3000, { share: false })).toBe(ROOM)
    expect(rejoinTarget(ls, new Mem(), '', T0 + 3000, { share: false })).toBe('')
    expect(rejoinTarget(ls, new Mem(), '#room=ABCDE', T0 + 3000, { share: false })).toBe('')
  })

  it('練習房不記也不自動連', () => {
    const ls = new Mem()
    const tab = new Mem()
    markActive(ls, tab, 'SOLO0', T0, true)
    pickToken(ls, tab, 'SOLO0', { now: T0, inst: 'p', share: true, gen })
    expect(rejoinTarget(ls, tab, '', T0 + 1000, { share: true })).toBe('')
  })
})

describe('加入房間的逾時不算主執行緒卡住的時間', () => {
  it('計時器準時（間隔小於 JOIN_STALL_MS）照常累計；遲到很久的那一段不算（重新整理後頁面還在載入、編譯 shader）', () => {
    let w = 0
    for (let i = 0; i < 10; i++) w = joinWaited(w, 500)
    expect(w).toBe(5000)
    // 主執行緒卡了 40 秒：這段不算，主機的回應可能還排在佇列裡
    w = joinWaited(w, 40_000)
    expect(w).toBe(5000)
    w = joinWaited(w, JOIN_STALL_MS - 1)
    expect(w).toBe(5000 + JOIN_STALL_MS - 1)
    expect(joinWaited(0, -5)).toBe(0)
  })
})

describe('session：主選單載入時自動重連', () => {
  type Session = typeof import('../../src/client/session')
  let session: Session
  const g = globalThis as unknown as Record<string, unknown>
  const saved: Record<string, unknown> = {}
  const ls = new Mem()
  const tab = new Mem()
  beforeAll(async () => {
    for (const k of ['window', 'localStorage', 'sessionStorage', 'location']) saved[k] = g[k]
    g.window ??= globalThis
    g.addEventListener ??= () => {}
    g.removeEventListener ??= () => {}
    g.localStorage = ls
    g.sessionStorage = tab
    // 開發模式（BroadcastChannel，Node 內建）：不用連外
    g.location = { search: '?net=bc', hash: '', origin: 'http://x', pathname: '/' }
    session = await import('../../src/client/session')
  })
  afterAll(() => {
    session.leave()
    for (const [k, v] of Object.entries(saved)) g[k] = v
  })

  it('這個分頁 2 分鐘內還在房間裡：主選單一出現就自動連回（顯示房號、可以取消）；取消後不再自動連', () => {
    const now = Date.now()
    pickToken(ls, tab, ROOM, { now: now - 2000, inst: 'old', share: false, gen })
    markActive(ls, tab, ROOM, now - 1500, false)
    releaseLease(ls, ROOM, 'old', now - 1000)
    expect(session.autoRejoinOnce('')).toBe(ROOM)
    expect(session.rejoining.value).toBe(ROOM)
    expect(session.screen.value).toBe('connecting')
    expect(session.currentRoom()).toBe(ROOM)
    // 只試一次
    expect(session.autoRejoinOnce('')).toBe('')
    session.cancelJoin()
    expect(session.rejoining.value).toBe('')
    expect(session.screen.value).toBe('menu')
    expect(rejoinTarget(ls, tab, '', Date.now(), { share: false })).toBe('')
  })

  it('新字串中英都有', () => {
    const keys = Object.keys(UX_ZH).filter((k) => k.startsWith('r5c.'))
    expect(keys.length).toBeGreaterThanOrEqual(9)
    for (const k of keys) {
      expect(UX_EN[k], k).toBeTruthy()
      expect(UX_ZH[k], k).toBeTruthy()
    }
    expect(Object.keys(UX_EN).filter((k) => k.startsWith('r5c.')).sort()).toEqual(keys.sort())
    expect(UX_ZH['r5c.rejoin.connecting']).toContain('{code}')
    expect(UX_EN['r5c.rejoin.connecting']).toContain('{code}')
  })
})
