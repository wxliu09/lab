// 第 9 輪 K（S 交接）：對局結束後，Esc 遊戲選單多出「查看結算」，練習局「再來一局」、多人局主機「回到大廳」；
// 規則和結算後上方小列（Panels.tsx afterEndActions）同一套，目標面板（Guide.endActionsOf）也一致
import { beforeAll, describe, expect, it, vi } from 'vitest'
import type { EndResult } from '../../src/shared/protocol/messages'

// 結算畫面的模組會載入 3D 場景（旁觀列的站名）；這裡只測規則
vi.mock('../../src/render/gameScene', () => ({ stationDefOf: () => undefined }))

type PanelsMod = typeof import('../../src/ui/hud/Panels')
type MenuMod = typeof import('../../src/ui/hud/GameMenu')
type GuideMod = typeof import('../../src/ui/hud/Guide')
let P: PanelsMod
let M: MenuMod
let G: GuideMod

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
  M = await import('../../src/ui/hud/GameMenu')
  G = await import('../../src/ui/hud/Guide')
})

const r = (winner: string, extra: Record<string, unknown> = {}) => ({ winner, duration: 60, players: [], timeline: [], ...extra }) as unknown as EndResult
const CASES: [EndResult | null, boolean, boolean][] = [
  [null, true, true],
  [null, false, false],
  [r('crew'), true, true],
  [r('xeno'), true, true],
  [r('crew'), false, true],
  [r('mutant'), false, false],
  [r('draw'), false, true],
  [r('aborted', { abortWhy: 'host' }), false, true],
  [r('aborted', { abortWhy: 'host' }), false, false],
]

describe('對局結束後的遊戲選單', () => {
  it('一律有「查看結算」；練習局加「再來一局」；多人局主機加「回到大廳」；還沒結束沒有', () => {
    expect(M.endMenuItems(null, true, true)).toEqual([])
    expect(M.endMenuItems(r('crew'), true, true)).toEqual(['results', 'again'])
    expect(M.endMenuItems(r('crew'), false, true)).toEqual(['results', 'lobby'])
    expect(M.endMenuItems(r('crew'), false, false)).toEqual(['results'])
    expect(M.endMenuItems(r('aborted', { abortWhy: 'host' }), false, true)).toEqual(['results'])
  })

  it('選單、目標面板和上方小列用同一套規則', () => {
    for (const [res, practice, host] of CASES) {
      const a = P.afterEndActions(res, practice, host)
      expect(G.endActionsOf(res, practice, host), JSON.stringify([res?.winner, practice, host])).toEqual(a)
      const items = M.endMenuItems(res, practice, host)
      expect(items.includes('results')).toBe(!!a)
      expect(items.includes('again')).toBe(!!a?.again)
      expect(items.includes('lobby')).toBe(!!a?.lobby)
    }
  })
})
