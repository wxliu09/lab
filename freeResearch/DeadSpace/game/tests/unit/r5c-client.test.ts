// 第 5 輪審查（client）：小地圖設施不只靠顏色區分（P3-8）、主機中止的判斷（P2-6）、
// 對局中的 HUD 橫幅（冒充主機的警告 P1-1、主機中止後的說明）
import { afterEach, beforeAll, describe, expect, it } from 'vitest'
import '../../src/shared/content/index'
import type { EndResult } from '../../src/shared/protocol/messages'
import { MINIMAP, MINIMAP_LEGEND_POIS, legendShape, legendSwatch, poiColor, poiKey, poiShape } from '../../src/ui/minimapColors'
import { ABORT_MSG, HOST_ABORT_WAIT_MS, isHostAbort, shouldAbortOnLeave } from '../../src/client/hostAbort'
import { validateClientMsg } from '../../src/shared/protocol/validate'
import { hasString, t } from '../../src/ui/i18n'
import '../../src/ui/strings/ux'

type Session = typeof import('../../src/client/session')
type HudMod = typeof import('../../src/ui/hud/Hud')
type GuideMod = typeof import('../../src/ui/hud/Guide')
let session: Session
let hud: HudMod
let guide: GuideMod

beforeAll(async () => {
  // session、HUD 模組在測試 build 會碰 window：在 node 裡給個空的 window
  const w = globalThis as unknown as Record<string, unknown>
  w.window ??= globalThis
  w.addEventListener ??= () => {}
  w.removeEventListener ??= () => {}
  session = await import('../../src/client/session')
  hud = await import('../../src/ui/hud/Hud')
  guide = await import('../../src/ui/hud/Guide')
})

// ───────── 色盲模擬（Machado 2009，severity 1.0）＋ CIEDE2000 ─────────
const CVD: Record<string, number[][]> = {
  protan: [
    [0.152286, 1.052583, -0.204868],
    [0.114503, 0.786281, 0.099216],
    [-0.003882, -0.048116, 1.051998],
  ],
  deutan: [
    [0.367322, 0.860646, -0.227968],
    [0.280085, 0.672501, 0.047413],
    [-0.01182, 0.04294, 0.968881],
  ],
  tritan: [
    [1.255528, -0.076749, -0.178779],
    [-0.078411, 0.930809, 0.147602],
    [0.004733, 0.691367, 0.3039],
  ],
}
const toLin = (c: number) => (c <= 0.04045 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4)
const toSrgb = (c: number) => {
  const v = Math.min(1, Math.max(0, c))
  return v <= 0.0031308 ? 12.92 * v : 1.055 * v ** (1 / 2.4) - 0.055
}
function rgb(hex: string): number[] {
  return [1, 3, 5].map((i) => parseInt(hex.slice(i, i + 2), 16) / 255)
}
function simulate(hex: string, kind: string): number[] {
  const c = rgb(hex)
  if (kind === 'normal') return c
  const l = c.map(toLin)
  return CVD[kind].map((row) => toSrgb(row[0] * l[0] + row[1] * l[1] + row[2] * l[2]))
}
function lab(c: number[]): [number, number, number] {
  const [r, g, b] = c.map(toLin)
  const X = (0.4124 * r + 0.3576 * g + 0.1805 * b) / 0.95047
  const Y = 0.2126 * r + 0.7152 * g + 0.0722 * b
  const Z = (0.0193 * r + 0.1192 * g + 0.9505 * b) / 1.08883
  const f = (t: number) => (t > 0.008856 ? Math.cbrt(t) : 7.787 * t + 16 / 116)
  return [116 * f(Y) - 16, 500 * (f(X) - f(Y)), 200 * (f(Y) - f(Z))]
}
const rad = (d: number) => (d * Math.PI) / 180
function de2000(p: [number, number, number], q: [number, number, number]): number {
  const [L1, a1, b1] = p
  const [L2, a2, b2] = q
  const Cb = (Math.hypot(a1, b1) + Math.hypot(a2, b2)) / 2
  const G = 0.5 * (1 - Math.sqrt(Cb ** 7 / (Cb ** 7 + 25 ** 7)))
  const a1p = (1 + G) * a1
  const a2p = (1 + G) * a2
  const C1p = Math.hypot(a1p, b1)
  const C2p = Math.hypot(a2p, b2)
  const h1p = ((Math.atan2(b1, a1p) * 180) / Math.PI + 360) % 360
  const h2p = ((Math.atan2(b2, a2p) * 180) / Math.PI + 360) % 360
  const dLp = L2 - L1
  const dCp = C2p - C1p
  let dh = h2p - h1p
  if (C1p * C2p === 0) dh = 0
  else if (dh > 180) dh -= 360
  else if (dh < -180) dh += 360
  const dHp = 2 * Math.sqrt(C1p * C2p) * Math.sin(rad(dh / 2))
  const Lbp = (L1 + L2) / 2
  const Cbp = (C1p + C2p) / 2
  let hbp = h1p + h2p
  if (C1p * C2p !== 0) hbp = Math.abs(h1p - h2p) <= 180 ? (h1p + h2p) / 2 : h1p + h2p < 360 ? (h1p + h2p + 360) / 2 : (h1p + h2p - 360) / 2
  const T = 1 - 0.17 * Math.cos(rad(hbp - 30)) + 0.24 * Math.cos(rad(2 * hbp)) + 0.32 * Math.cos(rad(3 * hbp + 6)) - 0.2 * Math.cos(rad(4 * hbp - 63))
  const dth = 30 * Math.exp(-(((hbp - 275) / 25) ** 2))
  const RC = 2 * Math.sqrt(Cbp ** 7 / (Cbp ** 7 + 25 ** 7))
  const SL = 1 + (0.015 * (Lbp - 50) ** 2) / Math.sqrt(20 + (Lbp - 50) ** 2)
  const SC = 1 + 0.045 * Cbp
  const SH = 1 + 0.015 * Cbp * T
  const RT = -Math.sin(rad(2 * dth)) * RC
  return Math.sqrt((dLp / SL) ** 2 + (dCp / SC) ** 2 + (dHp / SH) ** 2 + RT * (dCp / SC) * (dHp / SH))
}
const minDe = (a: string, b: string) => Math.min(...['normal', 'protan', 'deutan', 'tritan'].map((k) => de2000(lab(simulate(a, k)), lab(simulate(b, k)))))

describe('小地圖設施不只靠顏色區分（P3-8）', () => {
  it('審查點名的兩組：紅色盲下醫療／其他設施、藍色盲下販賣機／GIT 顏色幾乎一樣，形狀要不同', () => {
    expect(minDe(MINIMAP.medical, MINIMAP.fac)).toBeLessThan(5)
    expect(minDe(MINIMAP.vendor, MINIMAP.git)).toBeLessThan(5)
    expect(legendShape('medical')).not.toBe(legendShape('fac'))
    expect(legendShape('vendor')).not.toBe(legendShape('git'))
  })

  it('圖例上任兩種設施：正常色覺或任一種色盲模擬下 ΔE2000 < 10 的，形狀一定不同（門、窗戶是底圖格子，不比）', () => {
    const keys = MINIMAP_LEGEND_POIS.filter((k) => k !== 'door')
    const close: string[] = []
    for (let i = 0; i < keys.length; i++)
      for (let j = i + 1; j < keys.length; j++) {
        const a = keys[i]
        const b = keys[j]
        if (minDe(MINIMAP[a], MINIMAP[b]) >= 10) continue
        close.push(a + '/' + b)
        expect(legendShape(a), a + '/' + b).not.toBe(legendShape(b))
      }
    // 真的有比到東西（調色後這組清單可能會變，但不會是空的）
    expect(close.length).toBeGreaterThan(0)
  })

  it('小地圖畫的形狀與圖例同一份：醫療（含醫療販賣機）＝十字、GIT（含 GIT 相關販賣機）＝三角形、控制台＝空心方框', () => {
    expect(poiShape('vendor', 'medical')).toBe('cross')
    expect(poiShape('git')).toBe('triangle')
    expect(poiShape('vendor', 'gitTester')).toBe('triangle')
    expect(poiShape('vendor', 'gitResolver')).toBe('triangle')
    expect(poiShape('console')).toBe('hollowSquare')
    expect(poiShape('shipConsole')).toBe('hollowSquare')
    expect(poiShape('powerConsole')).toBe('square')
    expect(poiShape('vendor', 'weapons')).toBe('square')
    expect(poiShape('vendor', 'suitBasic')).toBe('square')
    expect(poiShape('regenerator')).toBe('square')
    // 每個會畫的設施：形狀就是它那一列圖例的形狀（動力分配台除外：控制台色、但不能駕駛，畫成小方塊）
    for (const [kind, ref] of [['vendor', 'medical'], ['vendor', 'suitBasic'], ['vendor', 'x'], ['git'], ['vendor', 'gitTester'], ['console'], ['shipConsole'], ['regenerator'], ['moduleFactory'], ['rummageBox']] as [string, string?][]) {
      const k = poiKey(kind, ref)!
      expect(poiColor(kind, ref)).toBe(MINIMAP[k])
      expect(poiShape(kind, ref), kind + ' ' + ref).toBe(legendShape(k))
    }
  })

  it('圖例色塊的 class：hollow／cross／tri／square；小地圖「?」圖例與 G 說明的圖例照同一份', () => {
    expect(legendSwatch('console')).toBe('hollow')
    expect(legendSwatch('medical')).toBe('cross')
    expect(legendSwatch('git')).toBe('tri')
    expect(legendSwatch('vendor')).toBe('square')
    const tip = hud.minimapLegendTip(false)
    for (const k of guide.legendPois()) {
      const row = tip.legend!.find((r) => r.color === MINIMAP[k] && r.label === t(guide.legendLabelKey(k)))
      expect(row, k).toBeTruthy()
      expect(row!.shape as string, k).toBe(legendSwatch(k))
    }
    const shapes = tip.legend!.map((r) => r.shape as string)
    expect(shapes).toContain('cross')
    expect(shapes).toContain('tri')
    expect(shapes).toContain('hollow')
    // 文字也寫出形狀（色盲時靠形狀認）
    for (const k of ['medical', 'git']) {
      expect(guide.legendLabelKey(k)).toBe('r5c.map.' + k)
      expect(hasString('zh', 'r5c.map.' + k) && hasString('en', 'r5c.map.' + k)).toBe(true)
    }
    expect(guide.legendLabelKey('vendor')).toBe('guide.map.vendor')
  })

  it('十字與三角形的路徑：都在 (px±r, py±r) 附近、封閉', () => {
    const pts: [number, number][] = []
    let closed = 0
    const ctx = {
      beginPath: () => (pts.length = 0),
      moveTo: (x: number, y: number) => pts.push([x, y]),
      lineTo: (x: number, y: number) => pts.push([x, y]),
      closePath: () => closed++,
    } as unknown as CanvasRenderingContext2D
    hud.minimapPoiPath(ctx, 'cross', 50, 50, 10)
    expect(pts.length).toBe(12)
    expect(Math.max(...pts.map((p) => p[0]))).toBe(60)
    expect(Math.min(...pts.map((p) => p[1]))).toBe(40)
    hud.minimapPoiPath(ctx, 'triangle', 50, 50, 10)
    expect(pts.length).toBe(3)
    for (const [x, y] of pts) {
      expect(Math.abs(x - 50)).toBeLessThanOrEqual(11)
      expect(Math.abs(y - 50)).toBeLessThanOrEqual(11)
    }
    expect(closed).toBe(2)
  })
})

describe('主機中止（P2-6，client 端）', () => {
  const base = { isHost: true, practice: false, inGame: true, ended: false, simFailed: false }
  it('只有主機、多人局、對局中、還沒結算、模擬還活著時，離開前先送中止', () => {
    expect(shouldAbortOnLeave(base)).toBe(true)
    expect(shouldAbortOnLeave({ ...base, isHost: false })).toBe(false)
    expect(shouldAbortOnLeave({ ...base, practice: true })).toBe(false)
    expect(shouldAbortOnLeave({ ...base, inGame: false })).toBe(false)
    expect(shouldAbortOnLeave({ ...base, ended: true })).toBe(false)
    expect(shouldAbortOnLeave({ ...base, simFailed: true })).toBe(false)
    // 送出去的就是 sim 認得的 abort 訊息
    expect(validateClientMsg(ABORT_MSG)).toEqual({ t: 'abort' })
    expect(HOST_ABORT_WAIT_MS).toBeGreaterThanOrEqual(200)
    expect(HOST_ABORT_WAIT_MS).toBeLessThanOrEqual(500)
  })

  it('認得「主機中止」的結算（winner = aborted、abortWhy = host；沒帶 abortWhy 的 aborted 也算）；一般結算不算', () => {
    const r = (o: Partial<EndResult> & Record<string, unknown>) => ({ winner: 'crew', players: [], timeline: [], duration: 1, ...o }) as EndResult
    expect(isHostAbort(r({ winner: 'aborted', abortWhy: 'host' }))).toBe(true)
    expect(isHostAbort(r({ winner: 'aborted' }))).toBe(true)
    expect(isHostAbort(r({ winner: 'aborted', abortWhy: 'other' as 'host' }))).toBe(false)
    expect(isHostAbort(r({ winner: 'draw', drawWhy: 'doom' }))).toBe(false)
    expect(isHostAbort(r({}))).toBe(false)
    expect(isHostAbort(null)).toBe(false)
  })

  it('客人、不是對局中：離開就直接離開（不用等）', async () => {
    const t0 = performance.now()
    await session.leaveGame()
    expect(performance.now() - t0).toBeLessThan(HOST_ABORT_WAIT_MS)
    expect(session.screen.value).toBe('menu')
  })
})

describe('對局中的 HUD 橫幅', () => {
  type VNode = { props: Record<string, unknown> & { children?: unknown } }
  const testids = (v: unknown): string[] => {
    if (!v || typeof v !== 'object') return []
    if (Array.isArray(v)) return v.flatMap(testids)
    const n = v as VNode
    const id = n.props?.['data-testid']
    return [...(typeof id === 'string' ? [id] : []), ...testids(n.props?.children)]
  }
  afterEach(() => {
    session.hostConflictLive.value = false
    session.connLost.value = false
    session.hostAbortEnd.value = false
    session.hostGone.value = false
    session.endResult.value = null
    session.isHost.value = false
  })

  it('入座後有別的連線自稱主機：顯示「有其他連線自稱主機，已忽略」；斷線橫幅裡也多一行', () => {
    session.hostConflictLive.value = true
    expect(testids(hud.Banner())[0]).toBe('host-conflict')
    session.connLost.value = true
    const ids = testids(hud.Banner())
    expect(ids[0]).toBe('host-lost')
    expect(ids).toContain('host-conflict')
    expect(hasString('zh', 'r5c.hostConflict') && hasString('en', 'r5c.hostConflict')).toBe(true)
  })

  it('主機中止：結算畫面開著時不跳「主機已離開」對話框、不顯示「連線中斷」；關掉結算後改顯示主機中止的說明', () => {
    session.hostAbortEnd.value = true
    session.endResult.value = { winner: 'aborted', abortWhy: 'host', players: [], timeline: [], duration: 3 }
    session.connLost.value = true
    session.hostGone.value = true
    expect(hud.Banner()).toBeNull()
    session.endResult.value = null
    expect(testids(hud.Banner())[0]).toBe('host-aborted')
    // 沒有中止的一般情況照舊：主機確定離開就跳對話框
    session.hostAbortEnd.value = false
    const v = hud.Banner() as unknown as { type: unknown }
    expect(typeof v.type).toBe('function')
  })
})

describe('等核心復活的仿生人發言只出現在泡泡', () => {
  it('公開頻道、沒有名字、帶泡泡實體的行不進聊天紀錄；被消音的公開發言與遺言照常', async () => {
    const { bubbleOnly } = await import('../../src/client/chatFilter')
    expect(bubbleOnly({ ch: 'all', from: '', e: 12 })).toBe(true)
    expect(bubbleOnly({ ch: 'all', from: '' })).toBe(false)
    expect(bubbleOnly({ ch: 'all', from: 'Bob', e: 12 })).toBe(false)
    expect(bubbleOnly({ ch: 'dead', from: '', e: 12 })).toBe(false)
  })
})
