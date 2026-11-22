// 第 7 輪 C（視聽與手感）：按鍵設定。預設鍵和以前寫死在 input.ts 的完全相同、存檔只存差異、衝突交換、
// 保留鍵不能指定、恢復預設、壞掉的存檔回到預設；鍵帽依鍵盤配置顯示（AZERTY）；指令卡／背包／對自己放的提示跟著改鍵。
import { afterEach, beforeAll, describe, expect, it, vi } from 'vitest'
import '../../src/shared/content/index'

/** 記憶體裡的 localStorage（node 環境沒有）*/
class MemStorage {
  m = new Map<string, string>()
  getItem(k: string) {
    return this.m.has(k) ? this.m.get(k)! : null
  }
  setItem(k: string, v: string) {
    this.m.set(k, String(v))
  }
  removeItem(k: string) {
    this.m.delete(k)
  }
  clear() {
    this.m.clear()
  }
}
const store = new MemStorage()
vi.stubGlobal('localStorage', store)

vi.mock('../../src/client/session', async () => {
  const { signal } = await import('@preact/signals')
  const { ClientWorld } = await import('../../src/client/world')
  return { world: new ClientWorld(), snapTick: signal(0), sendCmd: () => {}, cmdTaps: [], hostGone: signal(false) }
})

const K = await import('../../src/client/keymap')
const { world } = await import('../../src/client/session')
const { aimSelfKey } = await import('../../src/client/input')
const { abilityKey, itemKey, slotKey, actionKey } = await import('../../src/ui/hud/abilityKeys')
const { actionName, bindMessage } = await import('../../src/ui/screens/KeybindPanel')
const { lang, t, hasString } = await import('../../src/ui/i18n')

beforeAll(() => {
  K.resetKeymap()
})

afterEach(() => {
  K.resetKeymap()
  K.layoutMap.value = null
  store.clear()
  world.me = {}
  lang.value = 'zh'
})

describe('預設鍵＝第 7 輪以前 input.ts 寫死的鍵', () => {
  it('技能 QWERDF、背包 1–6、A／S／H、B 離開控制台、V 進化、空白鍵、方向鍵、Enter、M、Esc', () => {
    const km = K.defaultKeymap()
    expect(K.ABILITY_ACTIONS.map((a) => km[a])).toEqual(['KeyQ', 'KeyW', 'KeyE', 'KeyR', 'KeyD', 'KeyF'])
    expect(K.ITEM_ACTIONS.map((a) => km[a])).toEqual(['Digit1', 'Digit2', 'Digit3', 'Digit4', 'Digit5', 'Digit6'])
    expect([km.attack, km.stop, km.hold, km.unpilot, km.evolve]).toEqual(['KeyA', 'KeyS', 'KeyH', 'KeyB', 'KeyV'])
    expect([km.camSelf, km.camLeft, km.camRight, km.camUp, km.camDown]).toEqual(['Space', 'ArrowLeft', 'ArrowRight', 'ArrowUp', 'ArrowDown'])
    expect([km.chat, km.mute, km.menu]).toEqual(['Enter', 'KeyM', 'Escape'])
    // 新動作：F9 隱藏介面；選取自己預設沒有鍵（F1 是圖鑑）
    expect(km.hideHud).toBe('F9')
    expect(km.selectSelf).toBe('')
    // 別的模組處理的固定鍵：G 說明、Tab 筆記、F1 圖鑑
    expect([km.guide, km.notes, km.codex]).toEqual(['KeyG', 'Tab', 'F1'])
  })

  it('預設沒有重複的鍵；反查得回動作；鏡頭動作對應到鏡頭認得的方向鍵', () => {
    const codes = Object.values(K.defaultKeymap()).filter(Boolean)
    expect(new Set(codes).size).toBe(codes.length)
    expect(K.actionFor('KeyQ')).toBe('ability1')
    expect(K.actionFor('Digit6')).toBe('item6')
    expect(K.actionFor('Space')).toBe('camSelf')
    expect(K.actionFor('KeyZ')).toBeNull()
    expect(K.actionFor('')).toBeNull()
    expect(K.CAM_KEYS).toEqual({ camLeft: 'ArrowLeft', camRight: 'ArrowRight', camUp: 'ArrowUp', camDown: 'ArrowDown' })
    // 每個動作都有中英文名稱
    for (const a of K.ACTIONS) {
      const key = /^(ability|item)\d$/.test(a.id) ? 'feel7.kb.a.' + a.id.replace(/\d$/, '') : 'feel7.kb.a.' + a.id
      expect(hasString('zh', key) && hasString('en', key), key).toBe(true)
    }
  })
})

describe('改鍵：衝突交換、保留鍵、存檔', () => {
  it('改成別的動作在用的鍵：兩者交換，存檔只存差異，重新讀回一樣', () => {
    const r = K.bindKey('ability1', 'KeyW')
    expect(r).toMatchObject({ ok: true, swapped: 'ability2', swappedTo: 'KeyQ' })
    expect(K.codeFor('ability1')).toBe('KeyW')
    expect(K.codeFor('ability2')).toBe('KeyQ')
    expect(K.actionFor('KeyW')).toBe('ability1')
    expect(JSON.parse(store.getItem('xc.keymap')!)).toEqual({ ability1: 'KeyW', ability2: 'KeyQ' })
    expect(K.loadKeymap()).toEqual(K.keymap.value)
  })

  it('改成沒人用的鍵；換到原本沒有鍵的動作：被換掉的那個變成沒有鍵', () => {
    expect(K.bindKey('stop', 'KeyX')).toMatchObject({ ok: true })
    expect(K.actionFor('KeyS')).toBeNull()
    const r = K.bindKey('selectSelf', 'KeyQ')
    expect(r).toMatchObject({ ok: true, swapped: 'ability1', swappedTo: '' })
    expect(K.codeFor('ability1')).toBe('')
    expect(slotKey(0)).toBe('')
  })

  it('固定動作不能改；固定動作的鍵、修飾鍵、瀏覽器保留鍵不能指定；指定成同一個鍵什麼都不變', () => {
    expect(K.bindKey('menu', 'KeyZ')).toMatchObject({ ok: false, reason: 'fixed' })
    expect(K.bindKey('ability1', 'KeyG')).toMatchObject({ ok: false, reason: 'reserved', owner: 'guide' })
    expect(K.bindKey('ability1', 'Escape')).toMatchObject({ ok: false, reason: 'reserved', owner: 'menu' })
    expect(K.bindKey('ability1', 'Tab')).toMatchObject({ ok: false, reason: 'reserved', owner: 'notes' })
    for (const c of ['ShiftLeft', 'AltLeft', 'ControlRight', 'MetaLeft', 'F5', 'F12', '']) expect(K.bindKey('ability1', c)).toMatchObject({ ok: false, reason: 'system' })
    expect(K.bindKey('ability1', 'KeyQ')).toMatchObject({ ok: false, reason: 'same' })
    expect(K.keymap.value).toEqual(K.defaultKeymap())
    expect(store.getItem('xc.keymap')).toBeNull()
  })

  it('恢復預設：全部回來，存檔清掉', () => {
    K.bindKey('attack', 'KeyZ')
    K.bindKey('camSelf', 'KeyC')
    expect(store.getItem('xc.keymap')).not.toBeNull()
    K.resetKeymap()
    expect(K.keymap.value).toEqual(K.defaultKeymap())
    expect(store.getItem('xc.keymap')).toBeNull()
  })

  it('讀檔：不認得的動作、固定動作、保留鍵忽略；有重複（存檔壞了）就整個用預設；不是 JSON 也用預設', () => {
    store.setItem('xc.keymap', JSON.stringify({ attack: 'KeyZ', nope: 'KeyY', menu: 'KeyP', stop: 'ShiftLeft', hold: 'KeyG' }))
    const m = K.loadKeymap()
    expect(m.attack).toBe('KeyZ')
    expect(m.menu).toBe('Escape')
    expect(m.stop).toBe('KeyS')
    expect(m.hold).toBe('KeyH')
    store.setItem('xc.keymap', JSON.stringify({ attack: 'KeyQ' }))
    expect(K.loadKeymap()).toEqual(K.defaultKeymap())
    store.setItem('xc.keymap', '{bad')
    expect(K.loadKeymap()).toEqual(K.defaultKeymap())
    store.setItem('xc.keymap', JSON.stringify(['KeyQ']))
    expect(K.loadKeymap()).toEqual(K.defaultKeymap())
  })
})

describe('鍵帽依鍵盤配置顯示', () => {
  const AZERTY = new Map([
    ['KeyQ', 'a'],
    ['KeyW', 'z'],
    ['KeyA', 'q'],
    ['KeyZ', 'w'],
    ['KeyM', ','],
    ['Semicolon', 'm'],
    ['Digit1', '&'],
    ['Digit2', 'é'],
  ])

  it('沒有配置資訊：從 code 推；功能鍵、方向鍵、數字列有固定名稱；沒有鍵是空字串', () => {
    expect(K.keyLabel('KeyQ', null)).toBe('Q')
    expect(K.keyLabel('Digit3', null)).toBe('3')
    expect(K.keyLabel('Space', null)).toBe('Space')
    expect(K.keyLabel('ArrowLeft', null)).toBe('←')
    expect(K.keyLabel('F9', null)).toBe('F9')
    expect(K.keyLabel('Numpad4', null)).toBe('Num4')
    expect(K.keyLabel('Semicolon', null)).toBe(';')
    expect(K.keyLabel('', null)).toBe('')
  })

  it('AZERTY：KeyQ 顯示 A、KeyA 顯示 Q、Semicolon 顯示 M；數字列仍顯示數字（不是 & é）', () => {
    expect(K.keyLabel('KeyQ', AZERTY)).toBe('A')
    expect(K.keyLabel('KeyA', AZERTY)).toBe('Q')
    expect(K.keyLabel('Semicolon', AZERTY)).toBe('M')
    expect(K.keyLabel('Digit1', AZERTY)).toBe('1')
    expect(K.keyLabel('Digit2', AZERTY)).toBe('2')
    expect(K.keyLabel('Space', AZERTY)).toBe('Space')
  })

  it('指令卡、背包、基本指令、對自己放的提示都跟著改鍵與鍵盤配置', () => {
    world.me = { abilities: [{ id: 'ab.item.solace', cd: 0, maxCd: 20, mana: 0 }] }
    expect(abilityKey(world.me, 'ab.item.solace')).toBe('Q')
    expect(aimSelfKey({ kind: 'ability', id: 'ab.item.solace', target: 'unit' })).toBe('Q')
    expect(aimSelfKey({ kind: 'item', slot: 2, ability: 'ab.item.geneSampler', target: 'unit' })).toBe('3')
    K.layoutMap.value = AZERTY
    expect(abilityKey(world.me, 'ab.item.solace')).toBe('A')
    expect(aimSelfKey({ kind: 'ability', id: 'ab.item.solace', target: 'unit' })).toBe('A')
    expect(actionKey('attack')).toBe('Q')
    expect(slotKey(1)).toBe('Z')
    K.layoutMap.value = null
    K.bindKey('ability1', 'KeyT')
    K.bindKey('item3', 'KeyC')
    expect(abilityKey(world.me, 'ab.item.solace')).toBe('T')
    expect(aimSelfKey({ kind: 'ability', id: 'ab.item.solace', target: 'unit' })).toBe('T')
    expect(itemKey(2)).toBe('C')
    expect(aimSelfKey({ kind: 'item', slot: 2, ability: 'ab.item.geneSampler', target: 'unit' })).toBe('C')
    // 第 7 格以後沒有快捷鍵；技能沒有鍵時沒有「再按一次」可言
    expect(slotKey(6)).toBe('')
    K.bindKey('selectSelf', 'KeyT')
    expect(aimSelfKey({ kind: 'ability', id: 'ab.item.solace', target: 'unit' })).toBeNull()
  })
})

describe('設定頁的說明', () => {
  it('交換、保留、系統鍵的說明；中英文都有', () => {
    const r = K.bindKey('ability1', 'KeyW')
    expect(bindMessage(r).text).toBe(t('feel7.kb.swapped', { a: actionName('ability1'), k: 'W', b: actionName('ability2'), old: 'Q' }))
    expect(bindMessage(r).text).toContain('技能 2')
    expect(bindMessage(K.bindKey('ability1', 'KeyG')).text).toContain('說明')
    expect(bindMessage(K.bindKey('ability1', 'ShiftLeft'), 'Shift').text).toContain('Shift')
    lang.value = 'en'
    expect(actionName('item4')).toBe('Use inventory slot 4')
    expect(bindMessage(K.bindKey('hold', 'KeyJ')).text).toBe('“Hold position” is now J')
  })

  it('feel7 的字串兩種語言 key 一樣、英文沒有中文字、單引號用 ’', async () => {
    const { FEEL7_ZH, FEEL7_EN } = await import('../../src/ui/strings/feel7')
    expect(Object.keys(FEEL7_EN).sort()).toEqual(Object.keys(FEEL7_ZH).sort())
    for (const [k, v] of Object.entries(FEEL7_EN)) {
      expect(v, k).not.toMatch(/[一-鿿]/)
      expect(v, k).not.toMatch(/'/)
      expect(v.trim(), k).not.toBe('')
    }
  })
})
