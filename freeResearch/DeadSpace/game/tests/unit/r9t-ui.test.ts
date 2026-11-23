// 第 9 輪上架前總評（修改者 T，介面）：
// - 攻擊的寫法：販賣機 tooltip、圖鑑、頭像統一成「每發傷害 / 攻擊間隔 · 射程」＋每秒傷害（機槍「2–2」、脈衝「1–1」看起來像壞掉）
// - 頭像能力值算進看得到的加成（下士的老兵 +15%、自己背包的強化護腿），看不到的不算
// - 頂列 EP：死了不顯示；達到門檻不寫「/2000」
// - 戰績：1 場不算連勝、連敗
// - 大廳踢人要再按一次確認
// - 同名的互動面板分頁（兩台 GIT 解析器）分得出來
// - 練習對話框的 AI 難度卡片只寫一兩句
import { beforeAll, describe, expect, it } from 'vitest'
import '../../src/shared/content/index'
import { CLASSES, ITEMS, UNITS, buffDef } from '../../src/shared/content/registry'
import type { SnapEntity } from '../../src/shared/protocol/messages'
import { FIX9T_EN, FIX9T_ZH } from '../../src/ui/strings/fix9t'
import { UI4_EN, UI4_ZH } from '../../src/ui/strings/ui4'

type HudMod = typeof import('../../src/ui/hud/Hud')
type LobbyMod = typeof import('../../src/ui/screens/Lobby')
type VendorMod = typeof import('../../src/ui/hud/VendorPanel')
type TipMod = typeof import('../../src/ui/itemTip')
type SeasonMod = typeof import('../../src/client/seasonStats')
type SeasonUiMod = typeof import('../../src/ui/hud/SeasonStats')
type I18n = typeof import('../../src/ui/i18n')
let hud: HudMod
let lobbyUi: LobbyMod
let vendor: VendorMod
let tip: TipMod
let season: SeasonMod
let seasonUi: SeasonUiMod
let i18n: I18n

beforeAll(async () => {
  // HUD、大廳模組在測試 build 會碰 window：在 node 裡給個空的 window（同 r3b-client）
  const w = globalThis as unknown as Record<string, unknown>
  w.window ??= globalThis
  w.addEventListener ??= () => {}
  w.removeEventListener ??= () => {}
  i18n = await import('../../src/ui/i18n')
  hud = await import('../../src/ui/hud/Hud')
  lobbyUi = await import('../../src/ui/screens/Lobby')
  vendor = await import('../../src/ui/hud/VendorPanel')
  tip = await import('../../src/ui/itemTip')
  season = await import('../../src/client/seasonStats')
  seasonUi = await import('../../src/ui/hud/SeasonStats')
  i18n.lang.value = 'zh'
})

const row = (rows: [string, string][] | undefined, k: string) => rows?.find((r) => r[0] === i18n.t(k))?.[1]

describe('攻擊的寫法：每發傷害 / 攻擊間隔 · 射程，另列每秒傷害', () => {
  it('赤手的船員、機槍裝、脈衝裝、電漿裝', () => {
    const atk = (id: string) => tip.atkText(UNITS.get(id)!.attack!)
    const dps = (id: string) => tip.dpsText(UNITS.get(id)!.attack!)
    expect(atk('personnel')).toBe('17–21 / 1.2s · 5m')
    expect(dps('personnel')).toBe('16')
    // 同一個數字不寫成「2–2」「1–1」
    expect(atk('suit.gatling')).toBe('2 / 0.1s · 6m')
    expect(dps('suit.gatling')).toBe('20')
    expect(atk('suit.pulse')).toBe('1 / 0.05s · 5m')
    expect(dps('suit.pulse')).toBe('20')
    expect(atk('suit.plasma')).toBe('9–11 / 0.5s · 6m')
    expect(dps('suit.plasma')).toBe('20')
  })

  it('販賣機 tooltip 用同一種寫法，並多一列每秒傷害', () => {
    const d = tip.itemTip('suit.gatling')!
    expect(row(d.rows, 'tip.atk')).toBe('2 / 0.1s · 6m')
    expect(row(d.rows, 'fix9t.tip.dps')).toBe('20')
    expect(row(tip.itemTip('suit.pulse')!.rows, 'tip.atk')).toBe('1 / 0.05s · 5m')
  })

  it('加成照 sim：傷害乘 dmgMult、間隔除以攻速、射程加 rangeAdd', () => {
    const a = UNITS.get('personnel')!.attack!
    expect(tip.atkText(a, { dmgMult: 1.15 })).toBe('20–24 / 1.2s · 5m')
    expect(tip.atkText(a, { atkSpeed: 1.2, rangeAdd: 1.25 })).toBe('17–21 / 1s · 6.25m')
    expect(tip.dpsText(a, { atkSpeed: 2 })).toBe('32')
  })
})

describe('頭像能力值：算進看得到的加成', () => {
  const personnel = UNITS.get('personnel')!
  const snap = (s: Partial<SnapEntity>): SnapEntity => ({ i: 7, d: 'personnel', z: 1, x: 0, y: 0, ...s }) as SnapEntity

  it('別人的下士（公開的職業）：老兵 +15%；政委沒有加成；匿名（看不到職業）照基礎值', () => {
    expect(CLASSES.get('corporal')!.passives).toContain('cls.veteran')
    const corp = hud.portraitNums(snap({ cl: 'corporal' }), personnel)
    expect(corp.atk).toBe('20–24 / 1.2s · 5m')
    expect(corp.speed).toBe('3.19')
    expect(corp.mods).toEqual(['老兵'])
    const com = hud.portraitNums(snap({ cl: 'commissar' }), personnel)
    expect(com.atk).toBe('17–21 / 1.2s · 5m')
    expect(com.mods).toEqual([])
    expect(hud.portraitNums(snap({ cl: '' }), personnel).atk).toBe('17–21 / 1.2s · 5m')
    // 保全：射程 +1.25
    expect(hud.portraitNums(snap({ cl: 'security' }), personnel).atk).toBe('17–21 / 1.2s · 6.25m')
  })

  it('別人背包裡的強化護腿看不到（不算）；自己的主單位算進背包道具的被動與自己的職業', () => {
    const greaves = ITEMS.get('servoGreaves')!
    const stride = buffDef(greaves.passive!)!
    expect(stride.moveAdd).toBeGreaterThan(0)
    const other = hud.portraitNums(snap({ cl: 'corporal' }), personnel)
    expect(other.speed).toBe('3.19')
    const mine = hud.portraitNums(snap({ cl: 'corporal' }), personnel, {
      classId: 'corporal',
      spawn: false,
      inv: [{ item: 'servoGreaves', charges: 0, cd: 0 }, null, null, null, null, null],
    })
    expect(mine.speed).toBe(String(Math.round((personnel.speed + stride.moveAdd!) * 100) / 100))
    expect(mine.atk).toBe('20–24 / 1.2s · 5m')
    expect(mine.mods).toContain(i18n.loc(stride.name))
    // 自己是眷屬（轉化後的單位沒有職業被動）：不算職業
    expect(hud.portraitNums(snap({ cl: 'corporal' }), personnel, { classId: 'corporal', spawn: true }).atk).toBe('17–21 / 1.2s · 5m')
  })

  it('怪物外形（不是人形）即使快照帶著職業也不算職業被動；快照裡看得到的狀態效果算進去', () => {
    const monster = [...UNITS.values()].find((u) => u.attack && !u.tags.includes('personnel') && u.tags.includes('creature'))!
    const base = tip.atkText(monster.attack!)
    expect(hud.portraitNums(snap({ d: monster.id, cl: 'corporal' }), monster).atk).toBe(base)
    // 一個公開、不疊層、會改移速的狀態
    const slow = [...['bf.cryo.chill', 'bf.itemStun']].map((id) => buffDef(id)).find((b) => b && b.move !== undefined && !((b.stacks ?? 1) > 1))
    if (slow) {
      const n = hud.portraitNums(snap({ b: [slow.id] }), personnel)
      expect(n.speed).toBe(String(Math.round(personnel.speed * slow.move! * 100) / 100))
    }
  })
})

describe('頂列 EP', () => {
  it('死了不顯示（仿生人等記憶核心復活時照常）；達到門檻寫「可進化／可升級」，不寫「/門檻」', () => {
    expect(hud.epShown({ role: 'human' })).toBeNull()
    expect(hud.epShown({ role: 'xeno', alive: true, ep: 442, epNext: 660 })).toEqual({ ep: 442, next: 660, ready: '' })
    expect(hud.epShown({ role: 'xeno', alive: false, ep: 442, epNext: 660 })).toBeNull()
    expect(hud.epShown({ role: 'android', alive: false, coreWait: true, ep: 900, epNext: 2000 })).not.toBeNull()
    expect(hud.epShown({ role: 'android', alive: true, ep: 2585, epNext: 2000 })!.ready).toBe('fix9t.ep.readyAndroid')
    expect(hud.epShown({ role: 'mutant', alive: true, ep: 950, epNext: 900 })!.ready).toBe('fix9t.ep.ready')
    // 最終形態（沒有下一階）：只寫數字
    expect(hud.epShown({ role: 'android', alive: true, ep: 6869, epNext: 0 })).toEqual({ ep: 6869, next: 0, ready: '' })
  })
})

describe('戰績：2 場以上才算連勝／連敗', () => {
  it('±1 不顯示；存檔照常記 ±1', () => {
    expect(season.STREAK_SHOW_MIN).toBe(2)
    expect(season.shownStreak(1)).toBe(0)
    expect(season.shownStreak(-1)).toBe(0)
    expect(season.shownStreak(2)).toBe(2)
    expect(season.shownStreak(-3)).toBe(-3)
    expect(seasonUi.streakText(1)).toBe('')
    expect(seasonUi.streakText(-1)).toBe('')
    expect(seasonUi.streakText(2)).toBe('2 連勝')
    expect(seasonUi.streakText(-2)).toBe('2 連敗')
  })
})

describe('大廳踢人：再按一次才生效', () => {
  it('第一下上膛；3 秒內再按才踢；過了時間再按就重新上膛', () => {
    const T = lobbyUi.KICK_CONFIRM_MS
    expect(T).toBe(3000)
    const a = lobbyUi.kickClick(0, 1000)
    expect(a).toEqual({ kick: false, armedAt: 1000 })
    expect(lobbyUi.kickClick(a.armedAt, 1000 + T - 1)).toEqual({ kick: true, armedAt: 0 })
    expect(lobbyUi.kickClick(a.armedAt, 1000 + T + 1)).toEqual({ kick: false, armedAt: 1000 + T + 1 })
  })
})

describe('同名的互動面板分頁', () => {
  const E = (id: number, d = 'dev.gitResolver') => ({ kind: 'vendor' as const, id, d, dist: id })
  const base = (p: { d: string }) => (p.d === 'dev.gitResolver' ? 'GIT 解析器' : '販賣機')

  it('自己的那台寫「（你的）」；其他同名的照 id 編號；名字不重複的不動', () => {
    const owner = new Map([
      [5, 2],
      [9, 4],
      [3, 1],
    ])
    const of = (id: number) => owner.get(id) ?? -1
    const two = vendor.tabLabels([E(9), E(5), E(20, 'vendor.med')], base, of, 2)
    expect(two.get(5)).toBe('GIT 解析器（你的）')
    expect(two.get(9)).toBe('GIT 解析器')
    expect(two.get(20)).toBe('販賣機')
    // 都不是自己的：#1、#2 照 id（不隨距離跳動）
    const others = vendor.tabLabels([E(9), E(3)], base, of, 2)
    expect(others.get(3)).toBe('GIT 解析器 #1')
    expect(others.get(9)).toBe('GIT 解析器 #2')
    const flipped = vendor.tabLabels([E(3), E(9)], base, of, 2)
    expect(flipped.get(3)).toBe('GIT 解析器 #1')
    // 自己一台、別人兩台
    const three = vendor.tabLabels([E(9), E(5), E(3)], base, of, 2)
    expect([three.get(5), three.get(3), three.get(9)]).toEqual(['GIT 解析器（你的）', 'GIT 解析器 #1', 'GIT 解析器 #2'])
  })
})

describe('練習對話框：AI 難度卡片精簡', () => {
  it('卡片上的說明比完整說明短得多，不提毀站事件與驗血開放時間；完整說明保留給 tooltip', () => {
    for (const a of ['easy', 'normal']) {
      const zh = FIX9T_ZH[`fix9t.practice.ai.${a}.d`]
      const en = FIX9T_EN[`fix9t.practice.ai.${a}.d`]
      expect(zh.length).toBeLessThan(UI4_ZH[`ui4.practice.ai.${a}.d`].length * 0.6)
      expect(en.length).toBeLessThan(UI4_EN[`ui4.practice.ai.${a}.d`].length * 0.6)
      expect(zh).not.toMatch(/毀站|基因檢測/)
      expect(en).not.toMatch(/station-killing|gene testing/)
    }
    // 簡單：仍然交代「不會主動打你、不會點名你」（和 AI 實際行為一致，r3c-screens 檢查完整說明）
    expect(FIX9T_ZH['fix9t.practice.ai.easy.d']).toContain('不會主動打你')
    expect(FIX9T_ZH['fix9t.practice.ai.easy.d']).toContain('不會點名指認你')
  })

  it('新字串中英都有，英文撇號用 ’', () => {
    expect(Object.keys(FIX9T_EN).sort()).toEqual(Object.keys(FIX9T_ZH).sort())
    for (const [k, v] of Object.entries(FIX9T_EN)) expect(v, k).not.toContain("'")
  })
})
