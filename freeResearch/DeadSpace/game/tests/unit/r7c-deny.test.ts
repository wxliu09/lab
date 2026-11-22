// 第 7 輪 C（視聽與手感）：本機拒絕的判定。按技能鍵時冷卻中／能量一定不夠／被沉默就當下擋下（castGate，留餘裕：
// 冷卻快好了、能量差一點照樣送）；瞄準時點到 sim 一定會拒絕的目標（certainReject，只看不受偽裝影響的欄位）就當下說明；
// A 攻擊點到屍體、noTarget 的東西改成攻擊移動。最後拿真的 sim 交叉比對：本機說「一定會拒絕」的，sim 真的都拒絕。
import { describe, expect, it } from 'vitest'
import '../../src/shared/content/index'
import { ABILITIES, abilityDef, unitDef } from '../../src/shared/content/registry'
import { EntFlag, type SnapEntity } from '../../src/shared/protocol/messages'
import { CD_SLACK, MANA_SLACK, attackable, castGate, castGateOpts } from '../../src/client/interactKind'
import { certainReject, targetOk } from '../../src/client/targetSnap'
import { Harness } from './helpers/harness'
import { passesFilter } from '../../src/sim/systems/effects'
import { entView } from '../../src/sim/systems/snapshot'
import { makeCorpse } from '../../src/sim/systems/death'
import { dropOnGround, makeItem } from '../../src/sim/systems/items'
import type { Ent } from '../../src/sim/ent'
import type { TargetFilter } from '../../src/shared/content/types'

const S = (i: number, d: string, extra: Partial<SnapEntity> = {}): SnapEntity => ({ i, d, fl: 0, o: -1, ...extra })
const filterOf = (id: string) => abilityDef(id)?.filter

describe('castGate：按技能鍵時能不能放', () => {
  const st = (extra: Partial<{ cd: number; mana: number; disabled: boolean }> = {}) => ({ cd: 0, mana: 30, ...extra })

  it('冷卻中：擋下並說明還要幾秒；只剩一點點（快照四捨五入＋送達時間）照樣送', () => {
    expect(castGate(st({ cd: 3 }), 100)).toEqual({ kind: 'cooldown', key: 'tip.ability.cooling', args: { s: '3.0' } })
    expect(castGate(st({ cd: 12.3 }), 100)?.args).toEqual({ s: '13' })
    expect(castGate(st({ cd: CD_SLACK }), 100)).toBeNull()
    expect(castGate(st({ cd: 0.1 }), 100)).toBeNull()
  })

  it('被沉默：技能擋下；道具不受沉默影響', () => {
    expect(castGate(st({ disabled: true }), 100)).toMatchObject({ kind: 'disabled', key: 'cast.silenced' })
    expect(castGate(st({ disabled: true }), 100, true)).toBeNull()
  })

  it('能量一定不夠才擋（差 1 以內、不知道能量、不用能量：照樣送）；冷卻優先說明', () => {
    expect(castGate(st(), 10)).toEqual({ kind: 'noMana', key: 'tip.ability.noMana', args: { need: 30, have: 10 } })
    expect(castGate(st(), 30 - MANA_SLACK)).toBeNull()
    expect(castGate(st(), 29.4)).toBeNull()
    expect(castGate(st(), undefined)).toBeNull()
    expect(castGate(st({ mana: 0 }), 0)).toBeNull()
    expect(castGate(st({ cd: 5 }), 0)?.kind).toBe('cooldown')
  })

  it('開發工具的「無冷卻」（sim 不檢查能量）可以關掉本機的能量檢查', () => {
    castGateOpts.mana = false
    try {
      expect(castGate(st(), 0)).toBeNull()
    } finally {
      castGateOpts.mana = true
    }
  })
})

describe('certainReject：sim 一定會拒絕的目標', () => {
  const self = 1
  it('點自己：有篩選而沒有 self 的一定失敗；沒有篩選（sim 視為可以對自己）、可以對自己的照送', () => {
    expect(certainReject(S(1, 'personnel'), filterOf('xeno.parasite'), self)).toBe('feel7.deny.self')
    expect(certainReject(S(1, 'personnel'), { noStructure: true }, self)).toBe('feel7.deny.self')
    expect(certainReject(S(1, 'personnel'), filterOf('ab.item.geneSampler'), self)).toBeNull()
    expect(certainReject(S(1, 'personnel'), undefined, self)).toBeNull()
  })

  it('屍體：不是對屍體的技能一定失敗；對屍體的技能點活人一定失敗', () => {
    expect(certainReject(S(5, 'personnel', { fl: EntFlag.Corpse }), { noStructure: true }, self)).toBe('feel7.deny.corpse')
    expect(certainReject(S(5, 'personnel', { fl: EntFlag.Corpse }), undefined, self)).toBe('feel7.deny.corpse')
    expect(certainReject(S(5, 'personnel'), { corpse: true }, self)).toBe('feel7.deny.needCorpse')
    expect(certainReject(S(5, 'personnel', { fl: EntFlag.Corpse }), { corpse: true }, self)).toBeNull()
  })

  it('設施（Interactable 旗標＝sim 的 structure 標籤）：noStructure 點設施、structure 點人一定失敗；地上的物品不算設施', () => {
    const vendor = S(6, 'vendor.medical', { fl: EntFlag.Interactable })
    expect(certainReject(vendor, { noStructure: true }, self)).toBe('feel7.deny.structure')
    expect(certainReject(S(7, 'item:medkit', { fl: EntFlag.Interactable }), { noStructure: true }, self)).toBeNull()
    expect(certainReject(S(8, 'personnel'), { structure: true }, self)).toBe('feel7.deny.needStructure')
    expect(certainReject(vendor, { structure: true }, self)).toBeNull()
  })

  it('外觀推出來的條件（有機、主單位、指定外觀）可能被偽裝、幻象改掉：本機不擋，照樣送給 sim 判斷', () => {
    // 仿生人偽裝成人：外觀是有機的人員，sim 看的是真正的身體
    expect(targetOk(S(8, 'personnel'), { nonOrganic: true }, self)).toBe(false)
    expect(certainReject(S(8, 'personnel'), { nonOrganic: true }, self)).toBeNull()
    expect(certainReject(S(8, 'xeno.eggUnit'), { mainUnit: true }, self)).toBeNull()
    expect(certainReject(S(8, 'personnel'), { tag: 'vendor' }, self)).toBeNull()
  })
})

describe('A 攻擊點到的東西', () => {
  it('屍體、noTarget（生命再生器、降落墊、恆星）不當成攻擊目標（改成攻擊移動）；人、生物、設施照常攻擊', () => {
    expect(attackable(S(1, 'personnel', { fl: EntFlag.Corpse }))).toBe(false)
    expect(attackable(S(1, 'struct.regen', { fl: EntFlag.Interactable }))).toBe(false)
    expect(attackable(S(1, 'space.sun'))).toBe(false)
    expect(attackable(S(1, 'personnel'))).toBe(true)
    expect(attackable(S(1, 'xeno.brute'))).toBe(true)
    expect(attackable(S(1, 'vendor.medical', { fl: EntFlag.Interactable }))).toBe(true)
    expect(attackable(S(1, 'rubble', { fl: EntFlag.Interactable }))).toBe(true)
  })
})

describe('和真的 sim 交叉比對：本機說「一定會拒絕」的，sim 都拒絕', () => {
  it('每個點單位的技能 × 場上每種實體（含自己、屍體、地上的物品、設施、販賣機）', () => {
    const { h } = Harness.started(4, 4242)
    const g = h.server.game!
    const p = g.allPlayers()[0]
    const u = g.controlOf(p)!
    // 補幾種平常開局附近沒有的：屍體、地上的物品、怪物、瓦礫
    const victim = g.world.spawn(unitDef('personnel'), u.zone, u.x + 1, u.y, -1)
    const corpse = makeCorpse(g, victim)!
    g.world.remove(victim)
    dropOnGround(g, u.zone, u.x, u.y + 1, makeItem('medkit'))
    g.world.spawn(unitDef('xeno.brute'), u.zone, u.x - 1, u.y, -1)
    g.world.spawn(unitDef('rubble'), u.zone, u.x, u.y - 1, -1)
    expect(corpse).toBeTruthy()
    const ents: Ent[] = [...g.world.ents.values()]
    let rejected = 0
    let sent = 0
    const kinds = new Set<string>()
    for (const ab of ABILITIES.values()) {
      if (ab.target !== 'unit' && ab.target !== 'unitOrPoint') continue
      const f: TargetFilter | undefined = ab.filter
      for (const e of ents) {
        const s = entView(g, p, e)
        const why = certainReject(s, f, u.id)
        // sim 的判定（abilities.ts canCast＋stepCasting：沒有篩選時對自己視為 { self: true }；死掉的目標非屍體技能直接丟掉）
        const simRejects = (!e.alive && !f?.corpse) || !passesFilter(g, u, e, f ?? (e === u ? { self: true } : undefined))
        if (why) {
          rejected++
          kinds.add(why)
          expect(simRejects, `${ab.id} → ${e.def.id}#${e.id}（${why}）`).toBe(true)
        } else sent++
      }
    }
    // 不是空轉：每一種原因都真的出現過，也有很多照樣送出的
    expect(rejected).toBeGreaterThan(50)
    expect(sent).toBeGreaterThan(50)
    expect(kinds.has('feel7.deny.self') && kinds.has('feel7.deny.corpse') && kinds.has('feel7.deny.structure')).toBe(true)
  })
})
