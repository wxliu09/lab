// 第 9 輪 S（上架前總評 P2-2）：按「繼續觀看」關掉結算之後，上方小列的按鈕——活著看到結束的人、練習局也有
//「查看結算」與「再來一局」（練習）／「回到大廳」（多人主機）；主機中止的局只有「查看結算」
import { beforeAll, describe, expect, it, vi } from 'vitest'
import type { EndResult } from '../../src/shared/protocol/messages'

// 結算畫面的模組會載入 3D 場景（旁觀列的站名）；這裡只測規則
vi.mock('../../src/render/gameScene', () => ({ stationDefOf: () => undefined }))

type PanelsMod = typeof import('../../src/ui/hud/Panels')
let P: PanelsMod

beforeAll(async () => {
  const g = globalThis as unknown as Record<string, unknown>
  g.window ??= globalThis
  g.addEventListener ??= () => {}
  g.removeEventListener ??= () => {}
  const store = new Map<string, string>()
  g.localStorage ??= { getItem: (k: string) => store.get(k) ?? null, setItem: (k: string, v: string) => store.set(k, v), removeItem: (k: string) => store.delete(k) }
  g.sessionStorage ??= g.localStorage
  g.location ??= { search: '', hash: '', origin: 'http://x', pathname: '/' }
  P = await import('../../src/ui/hud/Panels')
})

const r = (winner: string, extra: Record<string, unknown> = {}) => ({ winner, duration: 60, players: [], timeline: [], ...extra }) as unknown as EndResult

describe('結算後的小列', () => {
  it('練習局（活著或死了都一樣）：查看結算＋再來一局', () => {
    expect(P.afterEndActions(null, true, true)).toBeNull()
    expect(P.afterEndActions(r('crew'), true, true)).toEqual({ again: true, lobby: false, guestHint: false })
    expect(P.afterEndActions(r('xeno'), true, true)).toEqual({ again: true, lobby: false, guestHint: false })
  })

  it('多人局：主機回到大廳、客人看到提示；主機中止只有查看結算', () => {
    expect(P.afterEndActions(r('crew'), false, true)).toEqual({ again: false, lobby: true, guestHint: false })
    expect(P.afterEndActions(r('draw'), false, false)).toEqual({ again: false, lobby: false, guestHint: true })
    expect(P.afterEndActions(r('aborted', { abortWhy: 'host' }), false, true)).toEqual({ again: false, lobby: false, guestHint: false })
  })
})
