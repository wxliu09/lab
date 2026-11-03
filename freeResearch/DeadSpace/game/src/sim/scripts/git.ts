// GIT 驗血（研究 02 §7）：基因檢測器抽三人份血 → 轉成 GIT 解析器 → 放下開機後購買檢測報告。
// 判定依據是「身分」而不是身上的感染 buff：被感染但還沒轉化的人類測起來是乾淨的；仿生人讓結果變成錯誤並鎖定。
import { regScript } from '../systems/effects'
import { DEATH_HOOKS } from '../systems/damage'
import { makeItem } from '../systems/items'
import { UNITS } from '../../shared/content/registry'
import type { Ent, ItemInst } from '../ent'
import type { Game } from '../game'

/** 一份樣本：真正提供血液的玩家槽位、抽血者眼中的身分 key（判定「已抽過」用）、顯示名稱、結果（1 乾淨、2 感染、3 錯誤）*/
export interface Sample {
  slots: number[]
  keys?: string[]
  names: string[]
  r: 1 | 2 | 3
}

const SAMPLES_PER_DEVICE = 3

function sampleOf(it: ItemInst): Sample {
  const d = (it.data ??= {}) as Record<string, unknown>
  return (d.sample ??= { slots: [], names: [], r: 1 }) as Sample
}

/** 外觀的形態名（匿名形態只寫形態名；外觀與實際 def 不同時用外觀）*/
function lookName(defId: string): string {
  return UNITS.get(defId)?.name.zh ?? '???'
}

/** 樣本名單上的名字：用抽血者「看到的」樣子（偽裝就是偽裝對象，匿名形態只寫形態名）；偽裝與真人寫法必須一模一樣 */
function shownName(g: Game, t: Ent): string {
  const fake = t.data.fake as { owner: number; name: string; def: string } | undefined
  if (fake) {
    if (fake.owner >= 0) return g.players[fake.owner]?.name || fake.name || '???'
    return lookName(fake.def)
  }
  if (t.anon) return lookName((t.data.viewDef as string | undefined) ?? t.def.id)
  return g.players[t.owner]?.name || t.name || '???'
}

/**
 * 抽血者眼中「這是誰」：判定「已經抽過」只能用看得到的樣子，否則就成了身分探測。
 * - 偽裝（千面化身、全像分身）：當成偽裝對象本人；同一個名字不會出現兩次
 * - 匿名形態、繭、蛋：只認這個實體本身（不能因為抽過他的人形就說「已抽過」）
 * - 其他：玩家本人
 */
function identityKey(t: Ent): string {
  const fake = t.data.fake as { owner: number } | undefined
  if (fake) return fake.owner >= 0 ? 'p' + fake.owner : 'e' + t.id
  if (t.anon) return 'e' + t.id
  return 'p' + t.owner
}

/** 看起來像一名玩家本人：主單位，或複製主單位外觀的分身（全像投影、幻象）*/
function looksLikePerson(t: Ent): boolean {
  if (t.def.id === 'npc.defenseDrone') return false
  if (t.isMain) return t.owner >= 0
  return t.illusion && !!t.data.looksMain
}

/** 中央檢測儀（女帝號）還在嗎 */
export function testerOnline(g: Game): boolean {
  if (g.data.gitDead) return false
  const nyx = g.world.zones.find((z) => z.key === 'nyx')
  if (!nyx || !nyx.alive) return false
  return g.world.inZone(nyx.id).some((e) => e.def.id === 'struct.git' && e.alive)
}

regScript('git.draw', (g, ctx) => {
  const u = ctx.caster
  const t = ctx.target
  const slot = ctx.itemSlot ?? -1
  const it = slot >= 0 ? u.inv?.[slot] : null
  if (!it || it.id !== 'geneSampler' || !t) return
  const say = (key: string, args?: Record<string, string | number>) => u.owner >= 0 && g.privateLine(u.owner, key, args)
  const s = sampleOf(it)
  // 舊樣本（沒有 keys）：以真正的擁有者補上
  const keys = (s.keys ??= s.slots.map((x) => 'p' + x))
  const key = identityKey(t)
  if (!looksLikePerson(t) || keys.includes(key)) {
    say('git.msg.already')
    return
  }
  keys.push(key)
  s.names.push(shownName(g, t))
  // 分身沒有血：抽血者看到的和真人一樣（成功、名字照記），只是這份樣本不提供任何 DNA
  const p = t.illusion ? undefined : g.players[t.owner]
  if (p) {
    s.slots.push(p.slot)
    if (s.r !== 3) {
      if (p.role === 'android') s.r = 3
      else if (!t.anon && g.faction(p) !== 'crew') s.r = 2
    }
  }
  say('git.msg.extracted', { n: keys.length, max: SAMPLES_PER_DEVICE })
  g.emitFx({ k: 'gitDraw', z: u.zone, x: t.x, y: t.y, e: t.id }, u.owner >= 0 ? [u.owner] : undefined)
  if (u.owner >= 0) g.players[u.owner]!.stats.tests++
  // 抽滿三份：裝置轉成解析器（帶著同一份樣本）
  if (keys.length >= SAMPLES_PER_DEVICE) {
    const r = makeItem('gitResolver')
    r.data = { sample: { ...s, slots: [...s.slots], keys: [...keys], names: [...s.names] } }
    u.inv![slot] = r
    u.statsDirty = true
    say('git.msg.full')
  }
})

regScript('git.results', (g, ctx) => {
  const buyer = ctx.caster
  const vendor = ctx.target
  const p = buyer.owner >= 0 ? g.players[buyer.owner] : undefined
  if (!p || !vendor) return false
  const raw = (vendor.data.sample as { sample?: Sample } | Sample | undefined) ?? undefined
  const s: Sample | undefined = raw && 'sample' in raw ? raw.sample : (raw as Sample | undefined)
  if (!testerOnline(g)) {
    g.privateLine(p.slot, 'git.msg.offline')
    p.gitReports.push({ time: Math.round(g.time), names: s?.names ?? [], result: 'offline' })
    return true
  }
  if (!s || !s.names?.length) {
    g.privateLine(p.slot, 'git.msg.empty')
    return true
  }
  const result = s.r === 1 ? 'clean' : s.r === 2 ? 'infected' : 'error'
  g.privateLine(p.slot, 'git.report.' + result, { names: s.names.join('、') })
  p.gitReports.push({ time: Math.round(g.time), names: [...s.names], result })
  return true
})

// 中央檢測儀被摧毀：全場廣播，之後的報告一律聯絡不上
DEATH_HOOKS.push((g, u) => {
  if (u.def.id !== 'struct.git' || g.data.gitDead) return
  g.data.gitDead = true
  g.systemAll('git.destroyed')
})
