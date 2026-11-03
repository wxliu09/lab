// 介面第四批：名字依介面語言顯示、背包拖曳（交換位置／給予）、用語（zh 眷屬、en suit）
import { afterEach, describe, expect, it } from 'vitest'
import '../../src/shared/content/index'
import { Harness } from './helpers/harness'
import { ABILITIES, BUFFS, CLASSES, FORMS, ITEMS, UNITS } from '../../src/shared/content/registry'
import { hasString, lang, stringKeys, sysText, t } from '../../src/ui/i18n'
import { SIM_AGENT_TITLE, SIM_BUTLER_SUFFIX, localizeName, localizeNameList } from '../../src/ui/names'
import { giveRefusal } from '../../src/client/give'
import { EntFlag, type SnapEntity } from '../../src/shared/protocol/messages'
import { makeItem } from '../../src/sim/systems/items'
import type { Loc } from '../../src/shared/content/types'

afterEach(() => {
  lang.value = 'zh'
})

describe('名字依介面語言顯示', () => {
  it('每個職業前綴、晉升頭銜、管家、預設名在兩種語言都有字串；中文前綴不夾英文', () => {
    expect(CLASSES.size).toBeGreaterThan(5)
    for (const c of CLASSES.values()) {
      for (const l of ['zh', 'en'] as const) expect(hasString(l, 'name.prefix.' + c.id), `${l} ${c.id}`).toBe(true)
      lang.value = 'zh'
      expect(t('name.prefix.' + c.id)).not.toMatch(/[A-Za-z]/)
      lang.value = 'en'
      // 英文照 sim 原本的寫法
      expect(t('name.prefix.' + c.id)).toBe(c.prefix.en)
    }
    for (const k of ['name.prefix.agent', 'name.butler', 'name.default']) expect(hasString('zh', k) && hasString('en', k), k).toBe(true)
  })

  it('中文：職業前綴換成中文，晉升頭銜、管家、預設名照舊', () => {
    lang.value = 'zh'
    expect(localizeName('Dr. Alice')).toBe('博士·Alice')
    expect(localizeName('Private 船員 3')).toBe('列兵·船員 3')
    expect(localizeName('Captain Kirk')).toBe('艦長·Kirk')
    expect(localizeName(SIM_AGENT_TITLE + 'Bob')).toBe('特務·Bob')
    expect(localizeName('Bob' + SIM_BUTLER_SUFFIX)).toBe('Bob 的管家')
    expect(localizeName('船員 7')).toBe('船員 7')
    expect(localizeName('Alice')).toBe('Alice')
    expect(localizeName('BOT-C')).toBe('BOT-C')
    expect(localizeName('')).toBe('')
    expect(localizeName(undefined)).toBe('')
    // 只有前綴、沒有名字：不是前綴
    expect(localizeName('Dr. ')).toBe('Dr. ')
  })

  it('英文：晉升頭銜、管家後綴、預設名換成英文；職業前綴照舊', () => {
    lang.value = 'en'
    expect(localizeName('Dr. Alice')).toBe('Dr. Alice')
    expect(localizeName('特務·Bob')).toBe('Agent Bob')
    expect(localizeName('Bob 的管家')).toBe("Bob's Butler")
    expect(localizeName('船員 3 的管家')).toBe("Crew 3's Butler")
    expect(localizeName('船員 3')).toBe('Crew 3')
    // 同名時 uniqueName 直接在後面接數字
    expect(localizeName('船員 32')).toBe('Crew 32')
    expect(localizeName('Medic 船員 4')).toBe('Medic Crew 4')
    expect(localizeName('特務·船員 5')).toBe('Agent Crew 5')
    // 玩家自己取的名字不動
    expect(localizeName('船員小明')).toBe('船員小明')
    expect(localizeName('老船員 3')).toBe('老船員 3')
  })

  it('切換語言後快取不會留著舊語言的結果', () => {
    lang.value = 'zh'
    expect(localizeName('Engineer 船員 2')).toBe('工程師·船員 2')
    lang.value = 'en'
    expect(localizeName('Engineer 船員 2')).toBe('Engineer Crew 2')
    lang.value = 'zh'
    expect(localizeName('Engineer 船員 2')).toBe('工程師·船員 2')
  })

  it('名單逐一換、保留死亡標記；系統訊息的 name 參數與 {lz}／{le} 名單都會換', () => {
    lang.value = 'en'
    expect(localizeNameList('Dr. Alice, 船員 2 (dead), 特務·Bob', ', ')).toBe('Dr. Alice, Crew 2 (dead), Agent Bob')
    expect(sysText('@sys.left|name=船員 2')).toBe(t('sys.left', { name: 'Crew 2' }))
    const names = sysText('@chat.names|lz=Dr. Alice、船員 2（死亡）|le=Dr. Alice, 船員 2 (dead)')
    expect(names).toContain('Crew 2 (dead)')
    expect(names).not.toMatch(/[㐀-鿿]/)
    lang.value = 'zh'
    const zh = sysText('@chat.names|lz=Dr. Alice、船員 2（死亡）|le=Dr. Alice, 船員 2 (dead)')
    expect(zh).toContain('博士·Alice')
    expect(zh).toContain('船員 2（死亡）')
    expect(sysText('@tl.promotion|name=Commissar Bob')).toContain('政委·Bob')
  })

  it('sim 實際組出來的名字（職業前綴＋預設名、管家）在英文介面不夾中文、中文介面不夾英文前綴', () => {
    const { h } = Harness.started(6, 777, { eventMult: 0 })
    const g = h.server.game!
    const ps = g.allPlayers()
    const names = ps.map((p) => p.name)
    // 管家：讓第一位玩家當執行長（只看名字的組法，不需要真的生成）
    names.push(ps[0].baseName + SIM_BUTLER_SUFFIX, SIM_AGENT_TITLE + ps[1].baseName)
    const prefixes = [...CLASSES.values()].map((c) => c.prefix.en).filter(Boolean)
    lang.value = 'zh'
    for (const n of names) {
      const out = localizeName(n)
      expect(prefixes.some((p) => out.startsWith(p)), out).toBe(false)
    }
    lang.value = 'en'
    for (const n of names) {
      // 測試裡玩家本名是 host／p1…（英文），只有 sim 加上去的部分可能是中文
      expect(localizeName(n), n).not.toMatch(/[㐀-鿿]/)
    }
  })
})

describe('背包拖曳：給予對象的判斷（client 端先擋，給現有的錯誤訊息）', () => {
  const me = { unit: 10, control: 10, zone: 2 }
  const ent = (o: Partial<SnapEntity>): SnapEntity => ({ i: 20, z: 2, d: 'personnel', o: -1, ...o })

  it('自己、空地：安靜取消', () => {
    expect(giveRefusal(undefined, me)).toBe('')
    expect(giveRefusal(ent({ i: 10 }), me)).toBe('')
  })

  it('人員、防護服、NPC 船員、管家、蛞蝓長老、玩家擁有的單位：可以給', () => {
    expect(giveRefusal(ent({}), me)).toBeNull()
    const suit = [...UNITS.values()].find((u) => u.tags.includes('suit') && u.inv)
    expect(suit).toBeTruthy()
    expect(giveRefusal(ent({ d: suit!.id }), me)).toBeNull()
    expect(giveRefusal(ent({ d: 'npc.crew' }), me)).toBeNull()
    expect(giveRefusal(ent({ d: 'butler' }), me)).toBeNull()
    expect(giveRefusal(ent({ d: 'creature.elderSlug' }), me)).toBeNull()
    // 變形後的玩家（外觀沒有背包，但主單位的背包還在）
    expect(giveRefusal(ent({ d: 'xeno.protoform', o: 3 }), me)).toBeNull()
  })

  it('地上的物品、屍體、設施、販賣機、別的區域：給現有的錯誤訊息', () => {
    expect(giveRefusal(ent({ d: 'item:traumaKit' }), me)).toBe('cast.target')
    expect(giveRefusal(ent({ d: 'groundItem' }), me)).toBe('cast.target')
    expect(giveRefusal(ent({ fl: EntFlag.Corpse }), me)).toBe('cast.target')
    expect(giveRefusal(ent({ st: 4 }), me)).toBe('cast.target')
    expect(giveRefusal(ent({ d: 'struct.console' }), me)).toBe('cast.target')
    expect(giveRefusal(ent({ d: 'vendor.medical' }), me)).toBe('cast.target')
    expect(giveRefusal(ent({ z: 3 }), me)).toBe('cast.zone')
    // 沒有背包的生物、玩家的召喚物
    const beast = [...UNITS.values()].find((u) => u.tags.includes('animal') && !u.inv && !u.tags.includes('personnel'))
    expect(beast).toBeTruthy()
    expect(giveRefusal(ent({ d: beast!.id }), me)).toBe('cast.target')
    expect(giveRefusal(ent({ d: 'mut.sporeling', o: 2 }), me)).toBe('cast.target')
    for (const k of ['cast.target', 'cast.zone', 'item.giveFull']) expect(hasString('zh', k) && hasString('en', k), k).toBe(true)
  })

  it('介面送出的指令格式在 sim 端有效：swapItem 交換兩格、give 走過去交給對方（對方背包滿就不給）', () => {
    const { h, cs } = Harness.started(2, 4321, { eventMult: 0 })
    const g = h.server.game!
    const [a, b] = g.allPlayers()
    const ua = g.mainOf(a)!
    const ub = g.mainOf(b)!
    ua.inv!.fill(null)
    ub.inv!.fill(null)
    ua.inv![0] = makeItem('traumaKit')
    ua.inv![2] = makeItem('phaseCloak')
    ub.x = ua.x + 3
    ub.y = ua.y
    ub.zone = ua.zone
    const ca = cs.find((c) => c.slot === a.slot)!
    let seq = 1
    ca.send({ t: 'cmd', seq: seq++, c: { k: 'swapItem', s: 0, x: 2 } })
    h.ticks(2)
    expect(ua.inv![0]?.id).toBe('phaseCloak')
    expect(ua.inv![2]?.id).toBe('traumaKit')
    // 拖到空格：等於搬過去
    ca.send({ t: 'cmd', seq: seq++, c: { k: 'swapItem', s: 2, x: 5 } })
    h.ticks(2)
    expect(ua.inv![2]).toBeNull()
    expect(ua.inv![5]?.id).toBe('traumaKit')
    // 給予：走過去交出去
    h.ticks(10)
    ca.send({ t: 'cmd', seq: seq++, c: { k: 'give', e: ub.id, s: 5 } })
    h.ticks(80)
    expect(ua.inv![5]).toBeNull()
    expect(ub.inv!.some((it) => it?.id === 'traumaKit')).toBe(true)
    // 對方背包滿：不會給出去
    for (let i = 0; i < ub.inv!.length; i++) ub.inv![i] ??= makeItem('phaseCloak')
    ca.send({ t: 'cmd', seq, c: { k: 'give', e: ub.id, s: 0 } })
    h.ticks(80)
    expect(ua.inv![0]?.id).toBe('phaseCloak')
  })
})

describe('用語：中文介面用「眷屬」、英文介面防護服用 suit', () => {
  const locs = (): Loc[] => {
    const out: Loc[] = []
    for (const m of [UNITS, ITEMS, ABILITIES, BUFFS, FORMS, CLASSES] as Map<string, { name?: Loc; desc?: Loc }>[])
      for (const d of m.values()) {
        if (d.name) out.push(d.name)
        if (d.desc) out.push(d.desc)
      }
    return out
  }

  it('中文字串不出現 spawn', () => {
    lang.value = 'zh'
    const bad = stringKeys('zh').filter((k) => /spawn/i.test(t(k)))
    expect(bad).toEqual([])
    const badLoc = locs()
      .map((l) => l.zh)
      .filter((s) => /spawn/i.test(s))
    expect(badLoc).toEqual([])
  })

  it('英文字串不出現 rig（統一用 suit）', () => {
    lang.value = 'en'
    const bad = stringKeys('en').filter((k) => /\brig(s|ged)?\b/i.test(t(k)))
    expect(bad).toEqual([])
    const badLoc = locs()
      .map((l) => l.en)
      .filter((s) => /\brig(s|ged)?\b/i.test(s))
    expect(badLoc).toEqual([])
  })

  it('大廳主機提示兩種語言都有', () => {
    for (const l of ['zh', 'en'] as const) expect(hasString(l, 'ui4.lobby.hostHint')).toBe(true)
    lang.value = 'zh'
    expect(t('ui4.lobby.hostHint')).toContain('主機')
  })
})
