// 審查 R2：單位目標瞄準的吸附（用基因檢測器抽血時點不中移動中的 AI）。chooseUnitTarget 選誰、targetOk 怎麼近似 sim 的目標篩選、
// 小地圖上選站（救生艙設定航線）
import { describe, expect, it } from 'vitest'
import '../../src/shared/content/index'
import { abilityDef } from '../../src/shared/content/registry'
import { EntFlag, type SnapEntity } from '../../src/shared/protocol/messages'
import { chooseUnitTarget, isStructureLike, mapPickTarget, segDist, targetOk, wantsStructure, type SnapCand } from '../../src/client/targetSnap'

const C = (id: number, dist: number, extra: Partial<SnapCand> = {}): SnapCand => ({ id, dist, tol: 40, ok: true, low: false, ...extra })
const S = (i: number, d: string, extra: Partial<SnapEntity> = {}): SnapEntity => ({ i, d, fl: 0, ...extra })
const filterOf = (id: string) => abilityDef(id)?.filter

describe('chooseUnitTarget：左鍵要對誰施放', () => {
  it('直接點中、符合篩選：就是它', () => {
    expect(chooseUnitTarget(5, [C(5, 0), C(6, 3)], false)).toBe(5)
  })

  it('沒點中：吸附到範圍內最近的符合者；範圍外的不算', () => {
    expect(chooseUnitTarget(0, [C(5, 30), C(6, 12), C(7, 39.9)], false)).toBe(6)
    expect(chooseUnitTarget(0, [C(5, 41), C(6, 80)], false)).toBe(0)
    // 吸附範圍是每個目標自己的（遠處的單位在畫面上小，範圍也小）
    expect(chooseUnitTarget(0, [C(5, 20, { tol: 18 }), C(6, 30, { tol: 60 })], false)).toBe(6)
  })

  it('不符合篩選的不會被吸附', () => {
    expect(chooseUnitTarget(0, [C(5, 2, { ok: false }), C(6, 25)], false)).toBe(6)
    expect(chooseUnitTarget(0, [C(5, 2, { ok: false })], false)).toBe(0)
  })

  it('點中建物（販賣機），旁邊有符合的人：人優先；技能本來就要點建物時不讓', () => {
    expect(chooseUnitTarget(9, [C(9, 0, { low: true }), C(6, 20)], false)).toBe(6)
    expect(chooseUnitTarget(9, [C(9, 0, { low: true }), C(6, 20)], true)).toBe(9)
    // 旁邊沒有人：照樣是點中的建物
    expect(chooseUnitTarget(9, [C(9, 0, { low: true })], false)).toBe(9)
  })

  it('自己排在別人後面：點空在自己和 AI 中間，選 AI；附近只有自己才選自己', () => {
    expect(chooseUnitTarget(0, [C(1, 5, { low: true }), C(6, 25)], false)).toBe(6)
    expect(chooseUnitTarget(0, [C(1, 5, { low: true })], false)).toBe(1)
  })

  it('直接點中但不符合篩選（例如對自己放只能對別人的技能）：附近有符合的就換；沒有就照送，讓 sim 說明', () => {
    expect(chooseUnitTarget(1, [C(1, 0, { ok: false, low: true }), C(6, 25)], false)).toBe(6)
    expect(chooseUnitTarget(1, [C(1, 0, { ok: false, low: true })], false)).toBe(1)
  })

  it('距離一樣時取 id 小的（結果穩定）', () => {
    expect(chooseUnitTarget(0, [C(8, 10), C(3, 10)], false)).toBe(3)
  })
})

describe('targetOk：只看快照看得到的欄位', () => {
  const self = 1
  it('抽血（可以對自己）：人、生物、自己都行；地上的物品、屍體、noTarget（生命再生器）不行', () => {
    const f = filterOf('ab.item.geneSampler')
    expect(targetOk(S(2, 'personnel', { o: 3 }), f, self)).toBe(true)
    expect(targetOk(S(1, 'personnel', { o: 0 }), f, self)).toBe(true)
    expect(targetOk(S(3, 'item:medkit'), f, self)).toBe(false)
    expect(targetOk(S(4, 'personnel', { fl: EntFlag.Corpse }), f, self)).toBe(false)
    expect(targetOk(S(5, 'struct.regen'), f, self)).toBe(false)
  })

  it('寄生（只對人類形態）：人、穿防護服的人行（第 4 輪照原作：著裝者也是 organic）；建物、自己不行', () => {
    const f = filterOf('xeno.parasite')
    expect(targetOk(S(2, 'personnel'), f, self)).toBe(true)
    expect(targetOk(S(1, 'personnel'), f, self)).toBe(false)
    expect(targetOk(S(3, 'suit.cryo'), f, self)).toBe(true)
    expect(targetOk(S(4, 'vendor.medical', { x2: { s: '' } }), f, self)).toBe(false)
  })

  it('noStructure：販賣機（定義只在 sim 端）也算建物', () => {
    const f = filterOf('ab.item.wrench')
    expect(targetOk(S(4, 'vendor.medical'), f, self)).toBe(false)
    expect(targetOk(S(5, 'struct.console'), f, self)).toBe(false)
    expect(targetOk(S(6, 'personnel'), f, self)).toBe(true)
  })

  it('停靠、設定航線（只對站點）：站點的定義只在 sim 端，看外觀 id；船、恆星不行', () => {
    for (const id of ['ship.dock', 'pod.trajectory']) {
      const f = filterOf(id)
      expect(wantsStructure(f), id).toBe(true)
      expect(targetOk(S(10, 'station.nyx'), f, self), id).toBe(true)
      expect(targetOk(S(11, 'ship.kestrel'), f, self), id).toBe(false)
      expect(targetOk(S(12, 'space.sun'), f, self), id).toBe(false)
    }
  })

  it('翻找（只對雜物箱）、強行登艦（船與兩座可登艦的站）', () => {
    expect(targetOk(S(2, 'struct.rummage'), filterOf('cls.rummage'), self)).toBe(true)
    expect(targetOk(S(3, 'personnel'), filterOf('cls.rummage'), self)).toBe(false)
    expect(wantsStructure(filterOf('cls.rummage'))).toBe(true)
    const board = filterOf('ship.board')
    expect(wantsStructure(board)).toBe(true)
    expect(targetOk(S(4, 'ship.kestrel'), board, self)).toBe(true)
    expect(targetOk(S(5, 'station.portage'), board, self)).toBe(true)
    expect(targetOk(S(6, 'station.nyx'), board, self)).toBe(false)
  })

  it('站內的設施、販賣機是建物（吸附時往後排）；太空中的站點不是（太空技能本來就對站點放）', () => {
    expect(isStructureLike(S(1, 'vendor.medical'))).toBe(true)
    expect(isStructureLike(S(2, 'struct.console'))).toBe(true)
    expect(isStructureLike(S(3, 'station.nyx'))).toBe(false)
    expect(isStructureLike(S(4, 'ship.kestrel'))).toBe(false)
    expect(isStructureLike(S(5, 'personnel'))).toBe(false)
  })

  it('人優先的技能：吸附時把建物往後排', () => {
    for (const id of ['ab.item.geneSampler', 'xeno.parasite', 'ab.item.wrench', 'cls.mend', 'ship.scan']) expect(wantsStructure(filterOf(id)), id).toBe(false)
  })
})

describe('小地圖上選目標（救生艙設定航線）', () => {
  const st = (id: number, x: number, y: number, ok = true) => ({ id, x, y, r: 3, ok, low: true })
  it('點在站附近（站的半徑＋點擊容差內）就選它；選最近的那座', () => {
    expect(mapPickTarget({ x: 10, y: 0 }, [st(1, 14, 0), st(2, 40, 0)], 4, true)).toBe(1)
    expect(mapPickTarget({ x: 34, y: 0 }, [st(1, 14, 0), st(2, 40, 0)], 4, true)).toBe(2)
  })
  it('離每座站都太遠、或附近只有不符合的：沒有目標', () => {
    expect(mapPickTarget({ x: 25, y: 20 }, [st(1, 14, 0), st(2, 40, 0)], 4, true)).toBe(0)
    expect(mapPickTarget({ x: 14, y: 0 }, [st(1, 14, 0, false)], 4, true)).toBe(0)
  })
})

describe('segDist', () => {
  it('點到身體中軸（腳 → 頭）的距離', () => {
    expect(segDist(0, 5, 0, 10, 0, 0)).toBe(0)
    expect(segDist(3, 5, 0, 10, 0, 0)).toBe(3)
    expect(segDist(0, 14, 0, 10, 0, 0)).toBe(4)
  })
})
