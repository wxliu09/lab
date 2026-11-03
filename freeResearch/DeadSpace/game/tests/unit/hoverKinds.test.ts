// 場景物件依類別的懸停提示與右鍵行為（建物盤點 A1 P2-7、P1-6）：瓦礫／雕像＝攻擊、降落場只是場景、裝置沒有「使用」、
// 熱融炸彈警告、太空站點＝飛過去、標本籠不是 NPC、無敵設施不顯示血量、敵方建物右鍵攻擊、降落傳送門右鍵走到中心
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
const { isStructureId, promptKey, rightClickAction, rummageClick, showHp, structKind } = await import('../../src/client/interactKind')
const { EntFlag } = await import('../../src/shared/protocol/messages')
const { lang, t } = await import('../../src/ui/i18n')
type SnapEntity = import('../../src/shared/protocol/messages').SnapEntity
type AbilityState = import('../../src/shared/protocol/messages').AbilityState

let nextId = 100
/** 在 client 世界放一個快照實體（建物一律帶 Interactable，和 sim 的快照一樣）*/
function put(d: string, extra: Partial<SnapEntity> = {}): number {
  const i = nextId++
  const s: SnapEntity = { i, d, z: 1, x: 500, y: 500, hp: 100, mhp: 100, o: -1, fl: EntFlag.Interactable, ...extra }
  world.ents.set(i, { s, samples: [], x: 5, y: 5, f: 0, firstSeen: 0, lastUpdate: 0 })
  return i
}

afterEach(() => {
  world.ents.clear()
  world.me = {}
  lang.value = 'zh'
})

describe('懸停提示依類別', () => {
  it('瓦礫、企鵝雕像：提示按 A 攻擊，不是右鍵使用', () => {
    for (const d of ['rubble', 'fac.penguinStatue']) {
      const tip = hoverTip(put(d))!
      expect(tip.hint, d).toBe(t('hover.hint.breakable'))
      expect(tip.hint).not.toBe(t('hover.hint.interact'))
      expect(tip.rows?.length, d).toBe(1)
    }
  })

  it('降落場只是場景（沒有使用、沒有血量）；降落傳送門依啟用狀態說明豪勇號降落時才能傳送', () => {
    const site = hoverTip(put('fac.landingSite', { fl: EntFlag.Interactable | EntFlag.Invuln }))!
    expect(site.hint).toBeUndefined()
    expect(site.sub).toBe(t('hover.cat.scenery'))
    expect(site.rows).toEqual([])
    const off = hoverTip(put('fac.landingPortal', { fl: EntFlag.Interactable | EntFlag.Invuln, x2: { on: 0 } }))!
    expect(off.hint).toBe(t('hover.hint.portalOff'))
    expect(off.hint).toContain('豪勇號降落時')
    const on = hoverTip(put('fac.landingPortal', { fl: EntFlag.Interactable | EntFlag.Invuln, x2: { on: 1 } }))!
    expect(on.hint).toBe(t('hover.hint.portalOn'))
    expect(on.body).toBe(t('hover.desc.fac.landingPortal'))
  })

  it('玩家放置的裝置不寫右鍵使用；熱融炸彈是警告色＋快離開', () => {
    for (const d of ['dev.camera', 'dev.sentry', 'dev.motionSensor', 'dev.forceBarrier']) {
      const tip = hoverTip(put(d, { o: 2, c: 2 }))!
      expect(tip.hint, d).toBeUndefined()
      expect(tip.sub).toBe(t('hover.cat.device'))
    }
    const bomb = hoverTip(put('dev.fusionCharge', { o: 2, c: 2 }))!
    expect(bomb.hint).toBe(t('hover.hint.bomb'))
    expect(bomb.hint).toContain('快離開')
    expect(bomb.color).toBe('#ff3b3b')
    expect(bomb.hintColor).toBe('#ff5a4a')
    expect(bomb.sub).toBe(t('hover.cat.bomb'))
  })

  it('太空中的站點：自己在太空駕駛時寫右鍵飛過去；敵方的海盜船寫右鍵攻擊', () => {
    const ship = put('ship.kestrel', { z: 0, o: 0, fl: EntFlag.Mine })
    world.me = { control: ship, unit: 1 }
    const st = hoverTip(put('station.nyx', { z: 0, mhp: 30000, hp: 30000 }))!
    expect(st.hint).toBe(t('hover.hint.flyTo'))
    expect(st.hint).toContain('右鍵：飛過去')
    const pirate = hoverTip(put('station.pirate', { z: 0, fl: EntFlag.Interactable | EntFlag.Hostile }))!
    expect(pirate.hint).toBe(t('hover.hint.attack'))
    expect(pirate.color).toBe('#ff5a4a')
    // 沒有在太空駕駛（站內看太空、旁觀）：維持停靠說明
    world.me = { unit: 1 }
    expect(hoverTip(put('station.nyx', { z: 0 }))!.hint).toBe(t('hover.hint.station'))
  })

  it('標本籠：不是 NPC／跟隨，說明裝了幾隻與怎麼帶走', () => {
    const tip = hoverTip(put('fac.cage', { fl: 0, x2: { n: 2 } }))!
    expect(tip.sub).toBe(t('hover.cat.cage'))
    expect(tip.sub).not.toBe(t('hover.cat.npc'))
    expect(tip.hint).toBe(t('hover.hint.cage'))
    expect(tip.hint).not.toBe(t('hover.hint.follow'))
    expect(tip.body).toContain('2')
  })

  it('無敵的設施不顯示血量（安裝座、擺渡號控制台、生命再生器）；會被打爆的照常顯示', () => {
    for (const d of ['fac.moduleSocket', 'struct.console', 'struct.regen', 'fac.cageConsole']) {
      const tip = hoverTip(put(d, { fl: EntFlag.Interactable | EntFlag.Invuln }))!
      expect(tip.rows, d).toEqual([])
    }
    expect(hoverTip(put('struct.console', { hp: 9000, mhp: 11000 }))!.rows).toEqual([[t('tip.hp'), '9000 / 11000']])
    expect(hoverTip(put('fac.moduleSocket', { hp: 600, mhp: 600 }))!.rows?.length).toBe(1)
    // 無敵的玩家單位（例如時滯中）照常顯示血量
    expect(showHp({ i: 1, d: 'personnel', mhp: 400, hp: 300, fl: EntFlag.Invuln })).toBe(true)
  })

  it('販賣機（定義只在 sim 端註冊）也算建物：無敵的不顯示血量，會被打爆的顯示', () => {
    expect(isStructureId('vendor.medical')).toBe(true)
    expect(isStructureId('personnel')).toBe(false)
    const shop = { x2: { s: 'medkit:3:0' } }
    expect(hoverTip(put('vendor.medical', { ...shop, hp: 800, mhp: 800 }))!.rows?.length).toBe(1)
    expect(hoverTip(put('vendor.medical', { ...shop, fl: EntFlag.Interactable | EntFlag.Invuln }))!.rows).toEqual([])
    expect(hoverTip(put('vendor.medical', shop))!.hint).toBe(t('hover.hint.vendor'))
  })

  it('損毀的控制台：說明用站點介面裝置修（天守 LQ 倉儲）', () => {
    const tip = hoverTip(put('struct.consoleBroken', { fl: EntFlag.Interactable | EntFlag.Invuln }))!
    expect(tip.body).toContain('站點介面裝置')
    expect(tip.body).toContain('LQ 倉儲')
    expect(tip.hint).toBe(t('hover.hint.repair'))
    expect(tip.rows).toEqual([])
  })

  it('敵方建物（海盜船主控台）：敵對、右鍵攻擊、紅色', () => {
    const tip = hoverTip(put('struct.consolePirate', { fl: EntFlag.Interactable | EntFlag.Hostile, hp: 2000, mhp: 2000 }))!
    expect(tip.sub).toBe(t('hover.cat.hostile'))
    expect(tip.hint).toBe(t('hover.hint.attack'))
    expect(tip.rows?.length).toBe(1)
  })

  it('一般設施照舊：控制台走上去駕駛、面板設施、販賣機', () => {
    expect(hoverTip(put('struct.console'))!.hint).toBe(t('hover.hint.console'))
    expect(hoverTip(put('struct.power', { fl: EntFlag.Interactable | EntFlag.Invuln }))!.hint).toBe(t('hover.hint.panel'))
    expect(hoverTip(put('struct.git'))!.hint).toBe(t('hover.hint.interact'))
  })

  it('英文也有每個新提示', () => {
    lang.value = 'en'
    for (const k of ['hover.cat.scenery', 'hover.cat.cage', 'hover.cat.bomb', 'hover.hint.flyTo', 'hover.hint.breakable', 'hover.hint.portalOn', 'hover.hint.portalOff', 'hover.hint.repair', 'hover.hint.cage', 'hover.hint.bomb', 'prompt.portal', 'prompt.portalOff'])
      expect(t(k), k).not.toMatch(/[一-鿿]/)
  })
})

describe('右鍵行為', () => {
  const S = (d: string, fl: number = EntFlag.Interactable, extra: Partial<SnapEntity> = {}): SnapEntity => ({ i: 1, d, fl, ...extra })

  it('敵方建物右鍵＝攻擊（建物判斷排在敵對之前也一樣）：海盜船主控台、太空中的海盜船', () => {
    expect(rightClickAction(S('struct.consolePirate', EntFlag.Interactable | EntFlag.Hostile))).toBe('attack')
    expect(rightClickAction(S('station.pirate', EntFlag.Interactable | EntFlag.Hostile, { z: 0 }))).toBe('attack')
    // 無敵的敵方建物打不動：照常互動
    expect(rightClickAction(S('struct.consolePirate', EntFlag.Interactable | EntFlag.Hostile | EntFlag.Invuln))).toBe('interact')
  })

  it('控制台、無人機控制圈、降落傳送門：走到正中央；降落場：當成點地面', () => {
    for (const d of ['struct.console', 'struct.droneControl', 'fac.landingPortal']) expect(rightClickAction(S(d)), d).toBe('center')
    expect(rightClickAction(S('fac.landingSite'))).toBe('ground')
  })

  it('其他：物品撿起、設施互動、屍體走過去、敵對生物攻擊、其他人跟隨', () => {
    expect(rightClickAction(S('item:medkit'))).toBe('pickup')
    expect(rightClickAction(S('struct.git'))).toBe('interact')
    expect(rightClickAction(S('rubble'))).toBe('interact')
    expect(rightClickAction(S('docked.kestrel'))).toBe('interact')
    expect(rightClickAction(S('station.nyx', EntFlag.Interactable, { z: 0 }))).toBe('interact')
    expect(rightClickAction(S('corpse', EntFlag.Corpse))).toBe('corpse')
    expect(rightClickAction(S('creature.murmaw', EntFlag.Hostile))).toBe('attack')
    expect(rightClickAction(S('personnel', 0, { o: 3 }))).toBe('follow')
    expect(rightClickAction(S('fac.cage', 0))).toBe('follow')
  })

  it('分類：裝置、炸彈、瓦礫、雕像、損毀的控制台', () => {
    expect(structKind(S('dev.camera'))).toBe('device')
    expect(structKind(S('dev.fusionCharge'))).toBe('bomb')
    expect(structKind(S('rubble'))).toBe('breakable')
    expect(structKind(S('fac.penguinStatue'))).toBe('breakable')
    expect(structKind(S('struct.consoleBroken'))).toBe('broken')
    expect(structKind(S('personnel', 0))).toBeNull()
  })
})

describe('身旁的互動提示', () => {
  const S = (d: string, extra: Partial<SnapEntity> = {}): SnapEntity => ({ i: 1, d, fl: EntFlag.Interactable, ...extra })
  it('沒有「使用」可言的東西不標；能用的照舊', () => {
    for (const d of ['rubble', 'fac.penguinStatue', 'fac.landingSite', 'dev.camera', 'dev.fusionCharge', 'struct.consoleBroken', 'struct.regen']) expect(promptKey(S(d), false), d).toBeNull()
    expect(promptKey(S('struct.console'), false)).toBe('prompt.pilot')
    expect(promptKey(S('fac.landingPortal'), false)).toBe('prompt.portalOff')
    expect(promptKey(S('fac.landingPortal', { x2: { on: 1 } }), false)).toBe('prompt.portal')
    expect(promptKey(S('struct.power'), true)).toBe('prompt.panelOpen')
    expect(promptKey(S('struct.git'), false)).toBe('prompt.use')
    expect(promptKey(S('item:medkit'), false)).toBe('prompt.pickup')
    expect(promptKey(S('vendor.medical', { x2: { s: 'medkit:3:0' } }), true)).toBe('prompt.panelOpen')
  })
})

describe('雜物箱（R6：右鍵只會走過去、提示卻寫「右鍵 使用」）', () => {
  /** 自己是清潔工：有翻找技能（cd = 剩餘冷卻秒數）*/
  const rummager = (cd = 0, extra: Partial<AbilityState> = {}) => {
    const me = put('personnel', { o: 0, fl: EntFlag.Mine, mp: 100, mmp: 100 })
    world.me = { unit: me, control: me, abilities: [{ id: 'cls.rummage', cd, maxCd: 10, mana: 50, ...extra }] }
    return me
  }
  const crew = () => {
    const me = put('personnel', { o: 0, fl: EntFlag.Mine, mp: 100, mmp: 100 })
    world.me = { unit: me, control: me, abilities: [] }
    return me
  }
  const meOf = () => ({ abilities: world.me.abilities, mp: world.ents.get(world.me.unit!)?.s.mp })

  it('分類成雜物箱（不是一般的「右鍵使用」設施）', () => {
    expect(structKind({ i: 1, d: 'struct.rummage', fl: EntFlag.Interactable })).toBe('crate')
  })

  it('有翻找技能：懸停寫右鍵走過去翻找；冷卻中接著寫還要幾秒；身旁提示「右鍵 翻找」', () => {
    rummager()
    const id = put('struct.rummage', { hp: 150, mhp: 150 })
    const tip = hoverTip(id)!
    expect(tip.hint).toBe(t('ui4.hover.rummage'))
    expect(tip.hint).toContain('翻找')
    expect(tip.hint).not.toBe(t('hover.hint.interact'))
    expect(tip.body).toBe(t('hover.desc.struct.rummage'))
    expect(tip.rows).toEqual([[t('tip.hp'), '150 / 150']])
    expect(promptKey(world.ents.get(id)!.s, false, meOf())).toBe('ui4.prompt.rummage')
    expect(t('ui4.prompt.rummage')).toBe('右鍵 翻找')
    // 冷卻中
    world.me.abilities = [{ id: 'cls.rummage', cd: 6.4, maxCd: 10, mana: 50 }]
    const cool = hoverTip(id)!
    expect(cool.hint).toContain(t('ui4.hover.rummage'))
    expect(cool.hint).toContain(t('tip.ability.cooling', { s: '6.4' }))
    expect(promptKey(world.ents.get(id)!.s, false, meOf())).toBe('ui4.prompt.rummage')
  })

  it('沒有翻找技能：懸停說明誰能翻、自己可以打破（按 A）；身旁不顯示「右鍵 使用」', () => {
    crew()
    const id = put('struct.rummage', { hp: 150, mhp: 150 })
    const tip = hoverTip(id)!
    expect(tip.hint).toBe(t('ui4.hover.crate'))
    expect(tip.hint).toBe('有翻找技能的職業可以翻找；其他人可以打破（按 A 攻擊）')
    expect(tip.hint).not.toContain('右鍵')
    expect(tip.rows?.length).toBe(1)
    expect(promptKey(world.ents.get(id)!.s, false, meOf())).toBeNull()
    expect(promptKey(world.ents.get(id)!.s, true, meOf())).toBeNull()
    // 不知道自己的狀態（例如還沒收到私有狀態）也當作沒有技能
    expect(promptKey(world.ents.get(id)!.s, false)).toBeNull()
  })

  it('右鍵：有技能＝對箱子施放翻找；冷卻中／能量不足／被沉默＝走過去並說明；沒技能＝只走過去', () => {
    rummager()
    const id = put('struct.rummage')
    const s = world.ents.get(id)!.s
    expect(rightClickAction(s, meOf())).toBe('rummage')
    expect(rummageClick(id, s, meOf(), true)).toEqual({ cmd: { k: 'cast', a: 'cls.rummage', e: id, q: true } })
    world.me.abilities = [{ id: 'cls.rummage', cd: 12.3, maxCd: 10, mana: 50 }]
    expect(rightClickAction(s, meOf())).toBe('rummage')
    const cool = rummageClick(id, s, meOf())
    expect(cool.cmd).toEqual({ k: 'interact', e: id, q: false })
    expect(cool.notice).toEqual({ key: 'tip.ability.cooling', args: { s: '13' } })
    world.me.abilities = [{ id: 'cls.rummage', cd: 0, maxCd: 10, mana: 50 }]
    world.ents.get(world.me.unit!)!.s.mp = 20
    expect(rummageClick(id, s, meOf()).notice?.key).toBe('cast.mana')
    world.me.abilities = [{ id: 'cls.rummage', cd: 0, maxCd: 10, mana: 50, disabled: true }]
    expect(rummageClick(id, s, meOf()).notice?.key).toBe('cast.silenced')
    // 沒技能
    crew()
    expect(rightClickAction(s, meOf())).toBe('interact')
    expect(rightClickAction(s)).toBe('interact')
  })

  it('英文也有雜物箱的提示', () => {
    lang.value = 'en'
    for (const k of ['ui4.hover.rummage', 'ui4.hover.crate', 'ui4.prompt.rummage']) {
      expect(t(k), k).not.toBe(k)
      expect(t(k), k).not.toMatch(/[一-鿿]/)
    }
  })
})
