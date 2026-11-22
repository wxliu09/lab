// 第 7 輪 C（視聽與手感）：遊戲畫面的游標。依模式與懸停對象選狀態（和右鍵會做的事一致，只看快照看得到的欄位）、
// 六種 SVG 游標（32 px＋2x、熱點在圖內）、只有狀態變了才寫 style。
import { describe, expect, it } from 'vitest'
import '../../src/shared/content/index'
import { EntFlag, type SnapEntity } from '../../src/shared/protocol/messages'
import { CURSOR_STATES, CursorSetter, cursorCss, cursorCssHiDpi, cursorHotspot, cursorState, cursorSvg, hoverCursor } from '../../src/client/cursors'
import { RUMMAGE } from '../../src/client/interactKind'

const S = (d: string, extra: Partial<SnapEntity> = {}): SnapEntity => ({ i: 7, d, fl: 0, o: -1, ...extra })

describe('沒在瞄準：游標和右鍵會做的事一致', () => {
  it('販賣機、設施、控制台、地上的物品＝互動；船艙控制台、艙門（沒有實體）也是互動', () => {
    expect(hoverCursor(S('vendor.medical', { fl: EntFlag.Interactable }), undefined)).toBe('interact')
    expect(hoverCursor(S('struct.console', { fl: EntFlag.Interactable }), undefined)).toBe('interact')
    expect(hoverCursor(S('struct.power', { fl: EntFlag.Interactable }), undefined)).toBe('interact')
    expect(hoverCursor(S('item:medkit', { fl: EntFlag.Interactable }), undefined)).toBe('interact')
    expect(cursorState({ mode: 'none', spot: true })).toBe('interact')
  })

  it('別的玩家（右鍵＝跟隨）＝友方；已現形的怪物、敵對單位＝攻擊', () => {
    expect(hoverCursor(S('personnel', { o: 2 }), undefined)).toBe('ally')
    expect(hoverCursor(S('xeno.brute'), undefined)).toBe('attack')
    expect(hoverCursor(S('personnel', { fl: EntFlag.Hostile }), undefined)).toBe('attack')
    // 自己知道的隊友怪物：不是攻擊
    expect(hoverCursor(S('xeno.brute', { fl: EntFlag.Ally }), undefined)).toBe('ally')
  })

  it('屍體、自己、只能打破的瓦礫、玩家放的裝置、降落場＝一般', () => {
    expect(hoverCursor(S('personnel', { fl: EntFlag.Corpse }), undefined)).toBe('normal')
    expect(hoverCursor(S('personnel', { o: 0 }), undefined, true)).toBe('normal')
    expect(hoverCursor(S('rubble', { fl: EntFlag.Interactable }), undefined)).toBe('normal')
    expect(hoverCursor(S('fac.landingSite', { fl: EntFlag.Interactable }), undefined)).toBe('normal')
    expect(cursorState({ mode: 'none' })).toBe('normal')
  })

  it('雜物箱：有翻找技能＝互動；沒有（右鍵只是走過去）＝一般', () => {
    const crate = S('struct.rummage', { fl: EntFlag.Interactable })
    expect(hoverCursor(crate, { abilities: [{ id: RUMMAGE, cd: 0, maxCd: 10, mana: 0 }] })).toBe('interact')
    expect(hoverCursor(crate, { abilities: [] })).toBe('normal')
  })
})

describe('瞄準中', () => {
  it('A 攻擊：一律紅色準星（點地面＝攻擊移動）', () => {
    expect(cursorState({ mode: 'attack' })).toBe('attack')
    expect(cursorState({ mode: 'attack', hover: S('personnel', { o: 2 }) })).toBe('attack')
  })

  it('技能、道具：對著符合篩選的對象或空地＝瞄準；對著不符合的＝無效', () => {
    expect(cursorState({ mode: 'aim' })).toBe('aim')
    expect(cursorState({ mode: 'aim', hover: S('personnel'), aimOk: true })).toBe('aim')
    expect(cursorState({ mode: 'aim', hover: S('personnel'), aimOk: false })).toBe('invalid')
    // 點地面的技能不看單位
    expect(cursorState({ mode: 'aim', hover: S('personnel') })).toBe('aim')
  })
})

describe('游標圖', () => {
  it('六種狀態都有 32 px 與 2x 的 SVG，熱點在圖內：箭頭在尖端、準星在正中央', () => {
    expect(CURSOR_STATES).toHaveLength(6)
    for (const s of CURSOR_STATES) {
      const svg = cursorSvg(s)
      expect(svg).toMatch(/^<svg xmlns="http:\/\/www\.w3\.org\/2000\/svg" width="32" height="32" viewBox="0 0 32 32">/)
      expect(svg.endsWith('</svg>')).toBe(true)
      expect(cursorSvg(s, 64)).toContain('width="64" height="64" viewBox="0 0 32 32"')
      // 深色外框：淺色地板上也看得到
      expect(svg).toContain('#061018')
      const [x, y] = cursorHotspot(s)
      expect(x >= 0 && x < 32 && y >= 0 && y < 32).toBe(true)
    }
    for (const s of ['normal', 'interact', 'ally'] as const) expect(cursorHotspot(s)[0]).toBeLessThan(5)
    for (const s of ['attack', 'aim', 'invalid'] as const) expect(cursorHotspot(s)).toEqual([16, 16])
    // 顏色：攻擊紅、瞄準紫、互動黃、友方綠
    expect(cursorSvg('attack')).toContain('#ff4f42')
    expect(cursorSvg('aim')).toContain('#c6a2ff')
    expect(cursorSvg('interact')).toContain('#ffd24a')
    expect(cursorSvg('ally')).toContain('#6ff5b0')
  })

  it('CSS 值：data URL＋熱點＋系統游標備援；高 DPI 版用 image-set 給 1x／2x', () => {
    const c = cursorCss('attack')
    expect(c).toMatch(/^url\("data:image\/svg\+xml,%3Csvg[^"]*"\) 16 16, crosshair$/)
    expect(cursorCss('normal')).toMatch(/\) 3 2, default$/)
    expect(cursorCss('invalid')).toMatch(/, not-allowed$/)
    const h = cursorCssHiDpi('interact')
    expect(h).toMatch(/^image-set\(url\("data:image\/svg\+xml,[^"]*"\) 1x, url\("data:image\/svg\+xml,[^"]*"\) 2x\) 3 2, pointer$/)
    expect(decodeURIComponent(h)).toContain('width="64"')
  })

  it('只有狀態變了才寫 style（mousemove 每次都會呼叫）', () => {
    let writes = 0
    const style = {
      get cursor() {
        return ''
      },
      set cursor(_v: string) {
        writes++
      },
    }
    const el = { style, dataset: {} as Record<string, string> } as unknown as HTMLElement
    const c = new CursorSetter()
    c.apply(el, 'normal')
    c.apply(el, 'normal')
    c.apply(el, 'normal')
    expect(writes).toBe(1)
    c.apply(el, 'attack')
    c.apply(el, 'attack')
    expect(writes).toBe(2)
    expect(el.dataset.cursor).toBe('attack')
    c.clear(el)
    expect(writes).toBe(3)
    expect(c.state).toBeNull()
  })
})
