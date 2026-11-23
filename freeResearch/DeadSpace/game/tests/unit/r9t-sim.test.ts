// 第 9 輪上架前總評（修改者 T，sim 與內容資料）：
// - 通訊病毒的私訊只給活著、名字真的換掉的人（恢復時同理）
// - 仿生人誤傷門檻：sim 是 2.7 份（原作 uo > 2.7），文字寫成「將近 3 名船員」
// - 死亡公告的文字：不再讀成「凶手是異形」
// - 用詞：救生艙（不是逃生艙）、GIT 報告是「領取」
// - tooltip 的數字對照實際資料：脈衝裝、處決手槍、救生艙憑證
import { describe, expect, it } from 'vitest'
import { Harness, type FakeClient } from './helpers/harness'
import { VIRUS_SWAP_S } from '../../src/sim/systems/events'
import { ANDROID_FF_LIMIT } from '../../src/sim/systems/roleSystem'
import { fmtKey, shownBase, type GamePlayer } from '../../src/sim/game'
import { ABILITIES, ITEMS, UNITS } from '../../src/shared/content/registry'
import '../../src/shared/content/index'
import { GAME_EN, GAME_ZH } from '../../src/ui/strings/game'
import { RULE8_ZH } from '../../src/ui/strings/rule8'
import { GHOST8_ZH } from '../../src/ui/strings/ghost8'
import { CODEX_EN, CODEX_ZH } from '../../src/ui/strings/codex'
import { OBJECTIVES } from '../../src/ui/strings/bios'
import { lang, sysText } from '../../src/ui/i18n'

const sec = (h: Harness, s: number) => h.ticks(Math.round(s * 20))

function chatOf(c: FakeClient): string[] {
  const out: string[] = []
  for (const m of c.inbox) if (m.t === 'chat') for (const l of m.lines) out.push(l.text)
  return out
}
const clientOf = (h: Harness, p: GamePlayer): FakeClient => [...h.clients.values()].find((c) => c.slot === p.slot)!

describe('通訊病毒：私訊只給活著、名字真的換掉的人', () => {
  it('死者收不到「你現在顯示為…」；抽回自己本名的人也收不到；恢復時同理', () => {
    let sawSame = false
    let sawChanged = false
    for (const seed of [9101, 9102, 9103, 9104, 9105, 9106, 9107, 9108]) {
      const { h } = Harness.started(6, seed, { eventMult: 0 })
      const g = h.server.game!
      const ps = g.allPlayers().filter((p) => !p.spectator)
      // 開局先死一個人（死者的名字照樣參與洗牌，但不該收到私訊）
      const dead = ps[1]
      g.killEnt(g.mainOf(dead)!, null, -1)
      expect(dead.alive).toBe(false)
      sec(h, 1)
      for (const c of h.clients.values()) c.inbox.length = 0
      g.triggerEvent!('virus', true)
      sec(h, 10.2)
      for (const p of ps) {
        if (p.bot) continue
        const mine = chatOf(clientOf(h, p)).filter((l) => l.startsWith('@event.virusYou'))
        const changed = shownBase(p) !== p.baseName
        if (p.alive && !changed) sawSame = true
        if (p.alive && changed) sawChanged = true
        expect(mine, `${seed} ${p.baseName}`).toEqual(p.alive && changed ? [fmtKey('event.virusYou', { name: p.name, s: VIRUS_SWAP_S })] : [])
      }
      const changedAtSwap = new Set(ps.filter((p) => shownBase(p) !== p.baseName).map((p) => p.slot))
      for (const c of h.clients.values()) c.inbox.length = 0
      sec(h, VIRUS_SWAP_S + 1)
      for (const p of ps) {
        if (p.bot) continue
        const back = chatOf(clientOf(h, p)).filter((l) => l.startsWith('@event.virusRestored'))
        expect(back.length, `${seed} restored ${p.baseName}`).toBe(p.alive && changedAtSwap.has(p.slot) ? 1 : 0)
        // 全場公告照常
        expect(chatOf(clientOf(h, p)).some((l) => l.startsWith('@event.virusEnd'))).toBe(true)
      }
    }
    // 這幾個種子裡兩種情況都要出現過，測試才有意義
    expect(sawChanged).toBe(true)
    expect(sawSame).toBe(true)
  })
})

describe('仿生人誤傷門檻：對玩家說「將近 3 名船員」', () => {
  it('sim 門檻 2.7（原作 uo > 2.7）；關機私訊與背景都寫成「將近 3 名船員的一整條血」，不再寫小數', () => {
    expect(ANDROID_FF_LIMIT).toBe(2.7)
    expect(Math.ceil(ANDROID_FF_LIMIT)).toBe(3)
    const bioZh = OBJECTIVES.android.zh.join('\n')
    const bioEn = OBJECTIVES.android.en.join('\n')
    for (const s of [GAME_ZH['role.androidShutdown'], bioZh]) {
      expect(s).toContain('將近 3 名船員的一整條血')
      expect(s).toContain('5 分鐘')
      expect(s).not.toMatch(/2\.7|約 2/)
    }
    for (const s of [GAME_EN['role.androidShutdown'], bioEn]) {
      expect(s).toMatch(/nearly three crew members’/)
      expect(s).not.toContain('2.7')
    }
  })
})

describe('死亡公告：說的是死者的真實身分，不是凶手', () => {
  const keys = ['death.mutant', 'death.xeno', 'death.xenoSpawn', 'death.mutantSpawn', 'death.android', 'death.innocent']
  it('中文不再寫「遇害了——那是異形」；每一種都點名、寫出真實身分；英文同理', () => {
    for (const k of keys) {
      const zh = GAME_ZH[k]
      const en = GAME_EN[k]
      expect(zh, k).toContain('{name}')
      expect(en, k).toContain('{name}')
      expect(zh, k).not.toMatch(/遇害|那是/)
      expect(zh, k).toMatch(/真實身分是|是一名無辜的船員/)
      expect(en, k).toMatch(/They were/)
    }
    lang.value = 'zh'
    expect(sysText('@death.xeno|name=Bob')).toBe('Bob 身亡——真實身分是異形！')
    expect(sysText('@death.innocent|name=Bob')).toBe('Bob 身亡——是一名無辜的船員')
    lang.value = 'en'
    expect(sysText('@death.xeno|name=Bob')).toBe('Bob has died. They were the xeno!')
    lang.value = 'zh'
  })
})

describe('用詞一致', () => {
  it('子艦隊、無人機圍攻、觀戰清單都寫「救生艙」', () => {
    for (const k of ['rule8.fleet.planet', 'rule8.siege.evac']) {
      expect(RULE8_ZH[k], k).toContain('救生艙')
      expect(RULE8_ZH[k], k).not.toContain('逃生艙')
    }
    expect(GHOST8_ZH['ghost8.list.livingTip']).toContain('救生艙')
    for (const t of [RULE8_ZH, GHOST8_ZH]) for (const [k, v] of Object.entries(t)) expect(v, k).not.toContain('逃生艙')
  })

  it('圖鑑的驗血規則：報告是免費「領取」，不是「買到」', () => {
    expect(CODEX_ZH['codex.rule.git.body']).toContain('領取檢測報告')
    expect(CODEX_ZH['codex.rule.git.body']).not.toContain('買')
    expect(CODEX_EN['codex.rule.git.body']).toContain('collect the test report')
    expect(CODEX_EN['codex.rule.git.body']).not.toMatch(/\bbuy\b/)
  })
})

describe('tooltip 的數字對照實際資料', () => {
  it('脈衝裝：每秒 20 發、每發 1、剛開火另加 2、3 秒過熱、每發耗 0.2 能量', () => {
    const a = UNITS.get('suit.pulse')!.attack!
    const beam = a.onHit!.find((e) => e.k === 'script' && e.fn === 'pulse.beam') as { p?: Record<string, number> } | undefined
    const args = beam?.p ?? {}
    expect(a.dmg).toEqual([1, 1])
    const d = ITEMS.get('suit.pulse')!.desc
    expect(d.zh).toContain(`每秒 ${Math.round(1 / a.cd)} 發、每發 ${a.dmg[0]} 傷害`)
    expect(d.zh).toContain(`另加 ${args.bonus} 傷害`)
    expect(d.zh).toContain(`${args.heat} 秒`)
    expect(d.zh).toContain(`${args.cost} 能量`)
    expect(d.en).toContain(`${Math.round(1 / a.cd)} shots a second at ${a.dmg[0]} damage`)
    expect(d.en).toContain(`${args.bonus} extra damage`)
  })

  it('處決手槍：瞄準 1.5 秒、125 傷害（照 ab.item.verdict）', () => {
    const ab = ABILITIES.get('ab.item.verdict')!
    const dmg = ab.effects.find((e) => e.k === 'damage') as { amount: number }
    const d = ITEMS.get('verdictPistol')!.desc
    expect(d.zh).toContain(`瞄準 ${ab.cast} 秒，造成 ${dmg.amount} 傷害`)
    expect(d.en).toContain(`${ab.cast} s aim, ${dmg.amount} damage`)
  })

  it('救生艙憑證：提到升空後要「設定航線」（技能名照 pod.trajectory，不寫鍵名）', () => {
    const ab = ABILITIES.get('pod.trajectory')!
    const d = ITEMS.get('escapePass')!.desc
    expect(d.zh).toContain(`「${ab.name.zh}」`)
    expect(d.en).toContain(ab.name.en)
    expect(d.zh).toContain('4 秒')
  })
})
