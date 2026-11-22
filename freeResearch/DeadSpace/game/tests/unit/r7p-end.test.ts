// 第 7 輪（視聽與手感）結算畫面：只主持不參戰的主機標成 spectator（原本被列成「人類 死亡」）、翻牌順序（人類先、異類最後）、
// 勝方模型、第 7 輪設定頁字串（中英文成對、英文不用直引號）
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest'
import { Harness, type FakeClient } from './helpers/harness'
import type { EndResult } from '../../src/shared/protocol/messages'
import { SET7_EN, SET7_ZH } from '../../src/ui/strings/set7'

// 結算畫面的模組會載入 3D 場景（旁觀列的站名）；這裡只測規則
vi.mock('../../src/render/gameScene', () => ({ stationDefOf: () => undefined }))

const endOf = (c: FakeClient): EndResult[] => c.inbox.flatMap((m) => (m.t === 'end' ? [m.result] : []))

// 介面模組（session.ts）會碰 window、localStorage：測試期間借一個假的
const g = globalThis as unknown as Record<string, unknown>
const saved: Record<string, unknown> = {}
const mem = () => {
  const m = new Map<string, string>()
  return { getItem: (k: string) => m.get(k) ?? null, setItem: (k: string, v: string) => void m.set(k, String(v)), removeItem: (k: string) => void m.delete(k), key: (i: number) => [...m.keys()][i] ?? null, get length() { return m.size } }
}
beforeAll(() => {
  for (const k of ['window', 'localStorage', 'sessionStorage', 'location', 'addEventListener', 'removeEventListener']) saved[k] = g[k]
  g.window ??= globalThis
  g.addEventListener ??= () => {}
  g.removeEventListener ??= () => {}
  g.localStorage = mem()
  g.sessionStorage = mem()
  g.location = { search: '', hash: '', origin: 'http://x', pathname: '/' }
})
afterAll(() => {
  for (const [k, v] of Object.entries(saved)) g[k] = v
})

describe('結算：只主持不參戰的主機', () => {
  it('主機勾「只主持不參戰」：結算裡主機標 spectator，其他人沒有這個欄位', () => {
    const { h, cs } = Harness.started(4, 7070, { hostSpectate: true })
    const g = h.server.game!
    const host = g.allPlayers().find((p) => p.spectator)
    expect(host).toBeTruthy()
    h.ticks(10)
    cs[0].send({ t: 'abort' })
    const r = endOf(cs[0])[0] ?? g.ended!
    expect(r).toBeTruthy()
    const mine = r.players.find((p) => p.slot === host!.slot)!
    expect(mine.spectator).toBe(true)
    for (const p of r.players) if (p.slot !== host!.slot) expect(p.spectator).toBeUndefined()
  })

  it('一般局：沒有人標 spectator', () => {
    const { h, cs } = Harness.started(3, 7171)
    h.ticks(10)
    cs[0].send({ t: 'abort' })
    const r = h.server.game!.ended!
    expect(r.players.every((p) => p.spectator === undefined)).toBe(true)
  })
})

describe('結算：翻牌順序與勝方模型', () => {
  it('flipOrder：版面不動，人類先翻、異類（含眷屬）留到最後', async () => {
    const P = await import('../../src/ui/hud/Panels')
    const order = P.flipOrder([{ role: 'xeno' }, { role: 'human' }, { role: 'mutant' }, { role: 'human' }, { role: 'android' }])
    expect(order).toEqual([2, 0, 3, 1, 4])
    expect(P.flipOrder([])).toEqual([])
  })

  it('factionSpec：人類、異形、變種人各用第一階的通用模型', async () => {
    const C = await import('../../src/ui/hud/Codex')
    expect(C.factionSpec('crew')).toEqual({ model: 'human', framing: 'full' })
    const x = C.factionSpec('xeno')
    expect(x.def).toBe('xeno.protoform')
    expect(x.framing).toBe('full')
    expect(C.factionSpec('mutant').def).toMatch(/^mut\./)
    expect(C.factionSpec('android').def).toMatch(/^android\./)
  })

  it('stationColors：每個地點都有識別色（室外站的岩壁色碼去掉前綴）', async () => {
    const C = await import('../../src/ui/hud/Codex')
    const { ALL_STATIONS } = await import('../../src/shared/content/stations/index')
    for (const s of ALL_STATIONS) {
      const c = C.stationColors(s.id)
      for (const v of Object.values(c)) expect(v, s.id).toMatch(/^#[0-9a-f]{6}$/i)
    }
  })
})

describe('第 7 輪設定頁字串', () => {
  it('中英文 key 成對、沒有空字串；英文單引號字串用 ’ 不用 \'', () => {
    expect(Object.keys(SET7_EN).sort()).toEqual(Object.keys(SET7_ZH).sort())
    for (const [k, v] of Object.entries(SET7_ZH)) expect(v.trim(), k).not.toBe('')
    for (const [k, v] of Object.entries(SET7_EN)) {
      expect(v.trim(), k).not.toBe('')
      expect(v.includes("'"), k).toBe(false)
    }
  })
})
