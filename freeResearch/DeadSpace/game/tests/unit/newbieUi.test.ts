// 新手試玩審查（修正員 B2）：平手原因、離開確認的說法、進化確認依身分、EP 不足時預覽分支、
// 變種人看生物的吞噬提示、EP 回饋的觸發門檻
import { afterEach, describe, expect, it, vi } from 'vitest'
import '../../src/shared/content/index'
import type { PrivateState } from '../../src/shared/protocol/messages'

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
const { hoverTip, devourLine } = await import('../../src/ui/hud/WorldHover')
const { drawReasonKey, leaveText } = await import('../../src/ui/hud/textRules')
const { canPreview, evolveBlock, nextForms } = await import('../../src/ui/hud/evolveWhy')
const { EpWatch, EP_GAIN_MIN } = await import('../../src/ui/hud/EpGain')
const { EntFlag } = await import('../../src/shared/protocol/messages')
const { hasString, lang, t } = await import('../../src/ui/i18n')
type SnapEntity = import('../../src/shared/protocol/messages').SnapEntity

const ab = (...ids: string[]): PrivateState['abilities'] => ids.map((id) => ({ id, cd: 0, maxCd: 0, mana: 0 }))

let nextId = 500
function put(d: string, extra: Partial<SnapEntity> = {}): number {
  const i = nextId++
  const s: SnapEntity = { i, d, z: 1, x: 500, y: 500, hp: 60, mhp: 60, o: -1, fl: 0, ...extra }
  world.ents.set(i, { s, samples: [], x: 5, y: 5, f: 0, firstSeen: 0, lastUpdate: 0 })
  return i
}

afterEach(() => {
  world.ents.clear()
  world.me = {}
  lang.value = 'zh'
})

describe('結算：平手的原因', () => {
  it('wipe／doom 顯示原因；其他或缺少時維持原本的標題', () => {
    expect(drawReasonKey({ winner: 'draw', drawWhy: 'wipe' })).toBe('end.drawWhy.wipe')
    expect(drawReasonKey({ winner: 'draw', drawWhy: 'doom' })).toBe('end.drawWhy.doom')
    expect(drawReasonKey({ winner: 'draw', drawWhy: 'other' })).toBeNull()
    expect(drawReasonKey({ winner: 'draw' })).toBeNull()
    expect(drawReasonKey({ winner: 'crew', drawWhy: 'wipe' })).toBeNull()
    for (const l of ['zh', 'en'] as const) for (const k of ['end.drawWhy.wipe', 'end.drawWhy.doom']) expect(hasString(l, k), `${l} ${k}`).toBe(true)
    expect(t('end.drawWhy.wipe')).toContain('同歸於盡')
    expect(t('end.drawWhy.doom')).toContain('末日')
  })
})

describe('離開對局：遊戲內確認', () => {
  it('練習局用單機的說法（不提主機、不提其他人）；多人局的主機才說會結束所有人的對局', () => {
    const p = leaveText(true, true)
    expect(t(p.body)).not.toMatch(/主機|所有人/)
    expect(t(p.ok)).toBe('結束練習')
    expect(t(leaveText(false, true).body)).toContain('主機')
    expect(t(leaveText(false, false).body)).not.toContain('主機')
    for (const l of ['zh', 'en'] as const)
      for (const k of ['ui5.leave.title', 'ui5.leave.practice', 'ui5.leave.host', 'ui5.leave.guest', 'ui5.leave.ok', 'ui5.leave.okPractice', 'ui5.leave.cancel']) expect(hasString(l, k), `${l} ${k}`).toBe(true)
    lang.value = 'en'
    expect(t(leaveText(true, true).body)).not.toMatch(/host|everyone/i)
  })
})

describe('進化選單', () => {
  it('確認文字依身分分開：異形結繭不能動、變種人肉團能慢慢動', () => {
    expect(t('evo.confirmHint.xeno')).toContain('原地不動')
    expect(t('evo.confirmHint.xeno')).not.toContain('緩慢移動')
    expect(t('evo.confirmHint.mutant')).toContain('緩慢移動')
    expect(t('evo.confirmHint.mutant')).not.toContain('原地不動')
    lang.value = 'en'
    expect(t('evo.confirmHint.mutant')).toMatch(/crawl/)
    expect(t('evo.confirmHint.xeno')).toMatch(/stay put/)
    for (const l of ['zh', 'en'] as const) for (const r of ['xeno', 'mutant', 'android']) expect(hasString(l, 'evo.confirmHint.' + r)).toBe(true)
  })

  it('EP 不足時預覽下一階的分支：異形 T1 → 三條 T2（660 EP）、T2 → 同分支的 T3', () => {
    const me: Partial<PrivateState> = { role: 'xeno', alive: true, tier: 0, ep: 213, epNext: 660, canEvolve: [] }
    const why = evolveBlock(me)
    expect(why?.key).toBe('play1.evo.need')
    expect(canPreview(why)).toBe(true)
    const t2 = nextForms(me, 'personnel')
    expect(t2.map((f) => f.id).sort()).toEqual(['xeno.brute', 'xeno.lumen', 'xeno.puppeteer'])
    expect(t2.every((f) => f.ep === 660)).toBe(true)
    // 異形形態的原型體也一樣
    expect(nextForms({ ...me, tier: 1 }, 'xeno.protoform').length).toBe(3)
    const t3 = nextForms({ role: 'xeno', tier: 2 }, 'xeno.lumen')
    expect(t3.map((f) => f.id).sort()).toEqual(['xeno.arcflayer', 'xeno.phantasm', 'xeno.pyreheart'])
    expect(t3.every((f) => f.ep === 1370)).toBe(true)
  })

  it('變種人：人形先預覽兩條路線、之後沿著路線；仿生人不預覽隱藏機體；人類、眷屬、死者、最終形態不預覽', () => {
    expect(nextForms({ role: 'mutant', tier: 0 }, 'personnel').map((f) => f.id).sort()).toEqual(['mut.apex', 'mut.sporemother'])
    expect(nextForms({ role: 'mutant', tier: 1 }, 'mut.apex').map((f) => f.id).sort()).toEqual(['mut.blitz', 'mut.brawn'])
    expect(nextForms({ role: 'android', tier: 0 }, 'personnel').map((f) => f.id).sort()).toEqual(['android.bulwark', 'android.gale'])
    expect(nextForms({ role: 'android', tier: 2 }, 'android.gale')).toEqual([])
    expect(nextForms({ role: 'human' }, 'personnel')).toEqual([])
    expect(nextForms({ role: 'xeno', spawn: true, tier: 0 }, 'personnel')).toEqual([])
    expect(canPreview(evolveBlock({ role: 'xeno', alive: false }))).toBe(false)
    expect(canPreview(evolveBlock({ role: 'xeno', alive: true, ep: 5, epNext: 0 }))).toBe(false)
    expect(canPreview(null)).toBe(false)
  })
})

describe('變種人看生物：吞噬提示', () => {
  it('有吞噬技能時，小生物、失敗實驗體、異常體的說明加上「鍵位 吞噬：+EP」（數值照內容表）', () => {
    world.me = { role: 'mutant', alive: true, abilities: ab('ab.mut.sludge', 'mut.devour') }
    const slug = hoverTip(put('creature.slugling'))!
    expect(slug.hint).toContain('W 吞噬：+25 EP')
    expect(hoverTip(put('creature.failed'))!.hint).toContain('+25 EP')
    expect(hoverTip(put('creature.anomaly'))!.hint).toContain('+125 EP')
    // 敵對的暴走實驗體也吃得下：吞噬提示在前、攻擊提示保留
    const hostile = hoverTip(put('creature.failedHostile', { fl: EntFlag.Hostile }))!
    expect(hostile.hint).toContain('吞噬')
    expect(hostile.hint).toContain(t('hover.hint.attack'))
    // 屍體、吃不了的東西不提
    expect(hoverTip(put('creature.slugling', { fl: EntFlag.Corpse }))!.hint ?? '').not.toContain('吞噬')
    expect(hoverTip(put('creature.snowgle', { fl: EntFlag.Hostile }))!.hint ?? '').not.toContain('吞噬')
    lang.value = 'en'
    expect(devourLine('creature.slugling')).toBe('W Devour: +25 EP')
  })

  it('沒有吞噬技能（人類、異形）或已經死了：不提', () => {
    world.me = { role: 'human', alive: true, abilities: [] }
    expect(hoverTip(put('creature.slugling'))!.hint ?? '').not.toContain('吞噬')
    world.me = { role: 'mutant', alive: false, abilities: ab('mut.devour') }
    expect(devourLine('creature.slugling')).toBeNull()
  })
})

describe('EP 回饋', () => {
  it('一次加不少（吞噬 25、啃食 140）才浮出；被動累積的零頭不顯示；換身分、死亡重新起算', () => {
    const w = new EpWatch()
    const me = (ep: number, extra: Partial<PrivateState> = {}): Partial<PrivateState> => ({ slot: 0, role: 'mutant', alive: true, ep, ...extra })
    expect(w.update(me(100))).toBe(0)
    // 被動累積：每秒最多約 9
    expect(w.update(me(109))).toBe(0)
    expect(w.update(me(134))).toBe(25)
    expect(w.update(me(274))).toBe(140)
    // EP 減少（卵被打破）不顯示
    expect(w.update(me(199))).toBe(0)
    expect(EP_GAIN_MIN).toBeGreaterThan(9)
    expect(EP_GAIN_MIN).toBeLessThanOrEqual(25)
    // 死了不顯示；活過來（仿生人重建）從新的數值起算
    expect(w.update(me(400, { alive: false }))).toBe(0)
    expect(w.update(me(400))).toBe(0)
    // 人類、眷屬沒有 EP 回饋
    const h = new EpWatch()
    h.update({ slot: 0, role: 'human', alive: true, ep: 0 })
    expect(h.update({ slot: 0, role: 'human', alive: true, ep: 100 })).toBe(0)
    const s = new EpWatch()
    s.update({ slot: 0, role: 'xeno', spawn: true, alive: true, ep: 0 })
    expect(s.update({ slot: 0, role: 'xeno', spawn: true, alive: true, ep: 100 })).toBe(0)
    for (const l of ['zh', 'en'] as const) expect(hasString(l, 'ui5.ep.gain')).toBe(true)
  })
})
