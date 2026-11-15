// 審查 R2（HUD）：聊天紀錄 12 秒淡出、打字或滑鼠移上去恢復；「停靠」提示只對有停靠技能的載具說；
// 長得一樣的設施（販賣機、生命再生器）的短名稱標籤；新字串中英都有
import { afterEach, describe, expect, it, vi } from 'vitest'
import '../../src/shared/content/index'

vi.mock('../../src/client/session', async () => {
  const { signal } = await import('@preact/signals')
  const { ClientWorld } = await import('../../src/client/world')
  return { world: new ClientWorld(), snapTick: signal(0), sendCmd: () => {} }
})
vi.mock('../../src/client/input', async () => {
  const { signal } = await import('@preact/signals')
  return { cursorScreen: { x: 0, y: 0, overView: false }, giveRefusalHere: () => null, modalOpen: () => false, targetMode: signal(null) }
})

const { world } = await import('../../src/client/session')
const { hoverTip } = await import('../../src/ui/hud/WorldHover')
const { CHAT_FADE_MS, chatFade } = await import('../../src/client/chatFade')
const { facLabelKey } = await import('../../src/render/overlay')
const { EntFlag } = await import('../../src/shared/protocol/messages')
const { VENDOR_LIST } = await import('../../src/shared/content/vendors')
const { ART3_EN, ART3_ZH } = await import('../../src/ui/strings/art3')
const { lang, t } = await import('../../src/ui/i18n')
type SnapEntity = import('../../src/shared/protocol/messages').SnapEntity

let nextId = 100
function put(d: string, extra: Partial<SnapEntity> = {}): number {
  const i = nextId++
  const s: SnapEntity = { i, d, z: 0, x: 500, y: 500, hp: 100, mhp: 100, o: -1, fl: EntFlag.Interactable, ...extra }
  world.ents.set(i, { s, samples: [], x: 5, y: 5, f: 0, firstSeen: 0, lastUpdate: 0 })
  return i
}

afterEach(() => {
  world.ents.clear()
  world.me = {}
  lang.value = 'zh'
})

describe('聊天紀錄淡出', () => {
  it('出現 12 秒後淡出；還沒到的不淡出', () => {
    const r = chatFade([0, 5000, 11000], 12500, false)
    expect(r.faded).toEqual([true, false, false])
    // 下一次重繪：第二行到期的時間
    expect(r.next).toBe(5000 + CHAT_FADE_MS)
    expect(CHAT_FADE_MS).toBe(12000)
  })
  it('打字中、滑鼠在聊天區上：全部恢復顯示', () => {
    expect(chatFade([0, 1000, 2000], 60000, true).faded).toEqual([false, false, false])
  })
  it('都淡出了：不用再排重繪', () => {
    expect(chatFade([0, 1000], 60000, false).next).toBe(Infinity)
  })
})

describe('「停靠」提示只對有停靠技能的載具說', () => {
  it('救生艙（只有設定航線）：只寫右鍵飛過去', () => {
    const pod = put('ship.pod', { o: 0, fl: EntFlag.Mine })
    world.me = { control: pod, unit: 1, abilities: [{ id: 'pod.trajectory', cd: 0, maxCd: 2, mana: 0 }] }
    const tip = hoverTip(put('station.nyx', { mhp: 30000, hp: 30000 }))!
    expect(tip.hint).toBe(t('hover.hint.flyToOnly'))
    expect(tip.hint).toBe('右鍵：飛過去')
    expect(tip.hint).not.toContain('停靠')
  })
  it('駕駛豪勇號（站點，沒有停靠技能）：一樣不提停靠', () => {
    const bravado = put('station.bravado', { o: 0, fl: EntFlag.Mine })
    world.me = { control: bravado, unit: 1, abilities: [{ id: 'st.land', cd: 0, maxCd: 240, mana: 0 }] }
    expect(hoverTip(put('station.verdance'))!.hint).toBe(t('hover.hint.flyToOnly'))
  })
  it('有停靠技能的船艇：照舊說明要用停靠降落', () => {
    const ship = put('ship.kestrel', { o: 0, fl: EntFlag.Mine })
    world.me = { control: ship, unit: 1, abilities: [{ id: 'ship.dock', cd: 0, maxCd: 30, mana: 0 }] }
    const tip = hoverTip(put('station.nyx'))!
    expect(tip.hint).toBe(t('hover.hint.flyTo'))
    expect(tip.hint).toContain('停靠')
  })
  it('英文也有', () => {
    lang.value = 'en'
    expect(t('hover.hint.flyToOnly')).toBe('Right-click: fly there')
  })
})

describe('身旁設施的短名稱標籤', () => {
  it('外觀是販賣機的每一種都有短名稱（中英）；生命再生器也有', () => {
    const vendors = VENDOR_LIST.filter((v) => v.model === 'vendor')
    expect(vendors.length).toBeGreaterThan(8)
    for (const v of vendors) {
      const k = facLabelKey('vendor.' + v.id)
      expect(k, v.id).toBe('art3.fac.' + v.id)
      expect(ART3_ZH[k!], v.id).toBeTruthy()
      expect(ART3_EN[k!], v.id).toBeTruthy()
      expect(ART3_EN[k!], v.id).not.toMatch(/[一-鿿]/)
      // 短：標在頭上不能太長
      expect([...ART3_ZH[k!]].length, v.id).toBeLessThanOrEqual(6)
    }
    expect(facLabelKey('struct.regen')).toBe('art3.fac.regen')
    expect(t('art3.fac.regen')).toBe('再生器')
    expect(t('art3.fac.maintenance')).toBe('維修站')
    expect(t('art3.fac.medical')).toBe('醫療補給')
  })
  it('外觀本來就不一樣的（GIT 檢測儀、GIT 解析器）、其他東西不標', () => {
    expect(facLabelKey('vendor.gitTester')).toBeNull()
    expect(facLabelKey('vendor.gitResolver')).toBeNull()
    expect(facLabelKey('struct.console')).toBeNull()
    expect(facLabelKey('personnel')).toBeNull()
  })
})

describe('新字串中英都有', () => {
  it('art3 的每個 key 兩種語言都有，英文不含中文', () => {
    expect(Object.keys(ART3_EN).sort()).toEqual(Object.keys(ART3_ZH).sort())
    for (const [k, v] of Object.entries(ART3_EN)) expect(v, k).not.toMatch(/[一-鿿]/)
  })
  it('瞄準點空了的提示：說明怎麼取消（右鍵或 Esc）', () => {
    expect(t('art3.aim.miss')).toContain('右鍵或 Esc')
    lang.value = 'en'
    expect(t('art3.aim.miss')).toContain('right-click or Esc')
  })
})
