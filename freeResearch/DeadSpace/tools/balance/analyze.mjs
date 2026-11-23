// 讀 data/*.jsonl，輸出各項統計（Markdown 表格）到 stdout。
// 用法：node analyze.mjs [檔名前綴過濾，例如 A_] > report.md
import { readFileSync, readdirSync } from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const here = path.dirname(fileURLToPath(import.meta.url))
const dir = path.join(here, 'data')
const filt = process.argv[2] ?? ''
const games = []
const perfGames = []
const SETS_ALL = ['A', 'B', 'C']
for (const f of readdirSync(dir)) {
  if (!f.endsWith('.jsonl') || !f.startsWith(filt)) continue
  const set = f.split('_')[0]
  for (const l of readFileSync(path.join(dir, f), 'utf8').split('\n')) {
    if (!l.trim()) continue
    const g = JSON.parse(l)
    if (g.error) {
      console.error('ERROR', f, g.seed, g.error.slice(0, 300))
      continue
    }
    g.set = set
    if (set === 'P') perfGames.push(g)
    else if (SETS_ALL.includes(set)) games.push(g)
  }
}
const out = (s = '') => process.stdout.write(s + '\n')
const pct = (x) => (100 * x).toFixed(0) + '%'
function wilson(k, n, z = 1.96) {
  if (!n) return [0, 0]
  const p = k / n
  const d = 1 + (z * z) / n
  const c = p + (z * z) / (2 * n)
  const w = z * Math.sqrt((p * (1 - p)) / n + (z * z) / (4 * n * n))
  return [Math.max(0, (c - w) / d), Math.min(1, (c + w) / d)]
}
const ci = (k, n) => {
  const [a, b] = wilson(k, n)
  return `${pct(k / n)} [${(100 * a).toFixed(0)}–${(100 * b).toFixed(0)}]`
}
function q(arr, p) {
  if (!arr.length) return NaN
  const s = [...arr].sort((a, b) => a - b)
  const i = (s.length - 1) * p
  const lo = Math.floor(i)
  return s[lo] + (s[Math.min(s.length - 1, lo + 1)] - s[lo]) * (i - lo)
}
const mean = (a) => (a.length ? a.reduce((x, y) => x + y, 0) / a.length : NaN)
const sd = (a) => {
  const m = mean(a)
  return Math.sqrt(a.reduce((x, y) => x + (y - m) ** 2, 0) / Math.max(1, a.length - 1))
}
const meanCi = (a) => (a.length ? `${mean(a).toFixed(2)} ±${((1.96 * sd(a)) / Math.sqrt(a.length)).toFixed(2)}` : '—')
const m1 = (s) => (s / 60).toFixed(1)
const isEvil = (rb) => rb === 'xeno' || rb === 'mutant' || rb === 'xenoSpawn' || rb === 'mutantSpawn' || rb === 'androidTurned'
const SETS = { A: 'A 多人規則・全 AI', B: 'B 單機練習・主機真人不動', C: 'C 多人規則・主機真人不動' }
const NS = [4, 6, 8, 10, 12]
const LV = ['easy', 'normal']
const by = (pred) => games.filter(pred)

out(`# 第 8 輪 B：headless 統計（${games.length} 局）`)
out()
// ───────── 1. 勝率 ─────────
out('## 1. 勝方（Wilson 95% CI）')
for (const set of Object.keys(SETS)) {
  const gs = by((g) => g.set === set)
  if (!gs.length) continue
  out(`\n### ${SETS[set]}（${gs.length} 局）`)
  out('| 人數 | 難度 | n | 人類方 crew | 異形 xeno | 變種人 mutant | 平手 draw | 平手原因 |')
  out('|---|---|---|---|---|---|---|---|')
  for (const n of NS)
    for (const l of LV) {
      const c = gs.filter((g) => g.n === n && g.level === l)
      if (!c.length) continue
      const k = (w) => c.filter((g) => g.winner === w).length
      const dw = {}
      for (const g of c) if (g.winner === 'draw') dw[g.drawWhy] = (dw[g.drawWhy] ?? 0) + 1
      out(`| ${n} | ${l} | ${c.length} | ${ci(k('crew'), c.length)} | ${ci(k('xeno'), c.length)} | ${ci(k('mutant'), c.length)} | ${ci(k('draw'), c.length)} | ${JSON.stringify(dw)} |`)
    }
  for (const l of LV) {
    const c = gs.filter((g) => g.level === l)
    const k = (w) => c.filter((g) => g.winner === w).length
    out(`| 全部 | ${l} | ${c.length} | ${ci(k('crew'), c.length)} | ${ci(k('xeno'), c.length)} | ${ci(k('mutant'), c.length)} | ${ci(k('draw'), c.length)} | |`)
  }
}
// 有異形／變種人在場時各自的勝率（≤4 人只有一個）
out('\n### 陣營在場時的勝率（只算該陣營有人的局；仿生人併入人類方）')
out('| 組 | 難度 | 異形在場局數 | 異形勝 | 變種人在場局數 | 變種人勝 | 仿生人在場 | 仿生人所屬方勝（人類方） |')
out('|---|---|---|---|---|---|---|---|')
for (const set of Object.keys(SETS))
  for (const l of LV) {
    const c = by((g) => g.set === set && g.level === l)
    if (!c.length) continue
    const hx = c.filter((g) => g.roles.some((r) => r.role === 'xeno'))
    const hm = c.filter((g) => g.roles.some((r) => r.role === 'mutant'))
    const ha = c.filter((g) => g.roles.some((r) => r.role === 'android'))
    out(`| ${set} | ${l} | ${hx.length} | ${ci(hx.filter((g) => g.winner === 'xeno').length, hx.length)} | ${hm.length} | ${ci(hm.filter((g) => g.winner === 'mutant').length, hm.length)} | ${ha.length} | ${ci(ha.filter((g) => g.winner === 'crew').length, ha.length)} |`)
  }
// 主機身分（B/C：主機不動）
out('\n### 主機不動時：依主機身分（B、C）')
out('| 組 | 難度 | 主機＝人類 n | 人類方勝 | 主機＝異類 n | 主機那方勝 | 人類方勝 |')
out('|---|---|---|---|---|---|---|')
for (const set of ['B', 'C'])
  for (const l of LV) {
    const c = by((g) => g.set === set && g.level === l)
    if (!c.length) continue
    const hc = c.filter((g) => g.hostRole === 'human' || g.hostRole === 'android')
    const he = c.filter((g) => g.hostRole === 'xeno' || g.hostRole === 'mutant')
    out(`| ${set} | ${l} | ${hc.length} | ${ci(hc.filter((g) => g.winner === 'crew').length, hc.length)} | ${he.length} | ${ci(he.filter((g) => g.winner === g.hostRole).length, he.length)} | ${ci(he.filter((g) => g.winner === 'crew').length, he.length)} |`)
  }

// ───────── 2. 長度 ─────────
out('\n## 2. 對局長度（分鐘）與首殺')
out('| 組 | 人數 | 難度 | n | 長度 p10 / 中位 / p90 | 末日前結束 | 末日後平手收尾 | 首位玩家死亡 中位 [IQR] | 異類首殺 中位 [IQR]（有的局） | 首次感染 中位 | 整局無異類擊殺／感染 |')
out('|---|---|---|---|---|---|---|---|---|---|---|')
for (const set of Object.keys(SETS))
  for (const n of NS)
    for (const l of LV) {
      const c = by((g) => g.set === set && g.n === n && g.level === l)
      if (!c.length) continue
      const d = c.map((g) => g.dur)
      const pre = c.filter((g) => g.apocAt < 0).length
      const doomDraw = c.filter((g) => g.winner === 'draw' && g.drawWhy === 'doom').length
      const fk = c.map((g) => (g.deaths.length ? g.deaths[0].t : NaN)).filter((x) => !isNaN(x))
      const fe = c.map((g) => g.deaths.find((x) => isEvil(x.kr) && !isEvil(x.vr))?.t).filter((x) => x !== undefined)
      const fi = c.map((g) => g.firstInf).filter((x) => x >= 0)
      const quiet = c.filter((g) => g.firstInf < 0 && !g.deaths.some((x) => isEvil(x.kr) && !isEvil(x.vr))).length
      out(`| ${set} | ${n} | ${l} | ${c.length} | ${m1(q(d, 0.1))} / ${m1(q(d, 0.5))} / ${m1(q(d, 0.9))} | ${ci(pre, c.length)} | ${ci(doomDraw, c.length)} | ${m1(q(fk, 0.5))} [${m1(q(fk, 0.25))}–${m1(q(fk, 0.75))}] | ${fe.length ? `${m1(q(fe, 0.5))} [${m1(q(fe, 0.25))}–${m1(q(fe, 0.75))}] (${fe.length})` : '—'} | ${fi.length ? m1(q(fi, 0.5)) : '—'} (${fi.length}) | ${quiet} |`)
    }

// ───────── 3. 死因 ─────────
function causeCat(d) {
  if (d.conv) return 'converted→' + d.conv + 'Spawn'
  return causeCat0(d)
}
function causeCat0(d) {
  const kd = d.killerDef || ''
  if (d.k === 'self') return 'self'
  if (d.buff === 'bf.planetRad' || d.buff === 'bf.planetRadField') return 'env:radiation'
  if (d.k === 'sun' || kd === 'space.sun') return d.k === 'boom' ? 'env:station→sun' : 'env:sun'
  if (d.k === 'rock') return 'env:asteroid'
  if (d.k === 'door') return 'env:door'
  if (d.k === 'gas') return 'env:neurotoxin'
  if (d.k === 'atm') return 'env:antimatter'
  if (d.k === 'vacuum') return 'env:vacuum'
  if (d.k === 'boom' || d.env === 'lethal') {
    const by = kd.startsWith('station:') ? kd.slice(8) : kd
    if (by === 'lethalZone') return 'boom:enteredWreck'
    if (by.startsWith('ship.wasp')) return 'boom:drones'
    if (by.startsWith('fleet.')) return 'boom:fleet'
    if (by === 'space.asteroid') return 'boom:asteroid'
    if (by === 'space.sun' || by === 'sun') return 'boom:sun'
    if (by.startsWith('pirate') || by.includes('pirate')) return 'boom:pirate'
    if (by && by !== 'none' && by !== '?') return 'boom:' + by
    if (kd.startsWith('ship.wasp')) return 'boom:drones'
    if (kd.startsWith('fleet.')) return 'boom:fleet'
    if (kd.startsWith('rock') || kd.includes('asteroid')) return 'boom:asteroid'
    if (d.kr === 'hostile') return 'boom:hostile'
    if (isEvil(d.kr)) return 'boom:evil'
    if (d.kr === 'human' || d.kr === 'android') return 'boom:crew'
    return 'boom:other(' + kd + ')'
  }
  if (isEvil(d.kr)) return 'evil'
  if (d.kr === 'human' || d.kr === 'android') return isEvil(d.vr) ? 'crew→evil' : 'crew→crew'
  if (d.kr === 'neutral') return 'npc:' + kd
  if (d.kr === 'hostile') return kd.startsWith('fleet.') ? 'hostile:fleet' : kd.startsWith('ship.wasp') ? 'hostile:drones' : 'hostile:' + kd
  if (d.k === 'fire' || d.k === 'blast') return 'env:' + d.k
  return 'other:' + d.k + (d.buff ? '/' + d.buff : '')
}
out('\n## 3. 死因（所有玩家主單位死亡；無辜者＝人類／仿生人）')
for (const set of Object.keys(SETS)) {
  const gs = by((g) => g.set === set)
  if (!gs.length) continue
  for (const l of LV) {
    const c = gs.filter((g) => g.level === l)
    const all = c.flatMap((g) => g.deaths.map((d) => ({ ...d, n: g.n })))
    const inn = all.filter((d) => !isEvil(d.vr))
    const evl = all.filter((d) => isEvil(d.vr))
    const tab = (list) => {
      const m = {}
      for (const d of list) {
        const k = causeCat(d)
        m[k] = (m[k] ?? 0) + 1
      }
      return Object.entries(m)
        .sort((a, b) => b[1] - a[1])
        .map(([k, v]) => `${k} ${v} (${pct(v / list.length)})`)
        .join('；')
    }
    out(`\n**${SETS[set]}・${l}**（${c.length} 局）`)
    out(`- 無辜者死亡 ${inn.length}（末日前 ${inn.filter((d) => !d.doom).length}、末日中 ${inn.filter((d) => d.doom).length}）：${tab(inn)}`)
    out(`  - 其中末日中：${tab(inn.filter((d) => d.doom))}`)
    out(`  - 其中末日前：${tab(inn.filter((d) => !d.doom))}`)
    out(`- 異類（主腦＋眷屬）死亡 ${evl.length}：${tab(evl)}`)
    const envShare = inn.filter((d) => /^env|^boom|^hostile|^npc/.test(causeCat(d))).length
    out(`- 無辜者死於環境／事件／NPC（不是任何玩家下的手）：${ci(envShare, inn.length)}`)
  }
}

// ───────── 4. 末日 ─────────
out('\n## 4. 末日種類與結果')
out('| 組 | 難度 | 末日 | 局數 | 人類方勝 | 異形勝 | 變種人勝 | 平手 | 開始時存活（平均） | 末日中無辜者死亡／局 | 其中輻射 | 結束時平均存活 | 地表最高輻射（中位，每秒） |')
out('|---|---|---|---|---|---|---|---|---|---|---|---|---|')
for (const set of Object.keys(SETS))
  for (const l of LV)
    for (const a of ['fleet', 'orbit']) {
      const c = by((g) => g.set === set && g.level === l && g.apoc === a)
      if (!c.length) continue
      const k = (w) => c.filter((g) => g.winner === w).length
      const dd = c.flatMap((g) => g.deaths.filter((d) => d.doom && !isEvil(d.vr)))
      const rad = dd.filter((d) => causeCat(d) === 'env:radiation').length
      out(`| ${set} | ${l} | ${a} | ${c.length} | ${ci(k('crew'), c.length)} | ${pct(k('xeno') / c.length)} | ${pct(k('mutant') / c.length)} | ${ci(k('draw'), c.length)} | ${mean(c.map((g) => g.apocAlive)).toFixed(1)} | ${(dd.length / c.length).toFixed(2)} | ${pct(rad / Math.max(1, dd.length))} | ${mean(c.map((g) => g.endRoles.filter((r) => r.alive).length)).toFixed(1)} | ${q(c.map((g) => g.radMax), 0.5).toFixed(1)} |`)
    }
{
  const c = games.filter((g) => g.apoc)
  out(`\n末日發生率：${ci(c.length, games.length)}；fleet ${c.filter((g) => g.apoc === 'fleet').length}、orbit ${c.filter((g) => g.apoc === 'orbit').length}`)
}

// ───────── 5. 事件 ─────────
out('\n## 5. 隨機事件出現率（每局是否出現）與「出現時」無辜者死亡數')
{
  const ev = {}
  for (const g of games) for (const e of g.events) ev[e] = (ev[e] ?? 0) + 1
  out('| 事件 | 出現局數 | 比例 |')
  out('|---|---|---|')
  for (const [k, v] of Object.entries(ev).sort((a, b) => b[1] - a[1])) out(`| ${k} | ${v} | ${pct(v / games.length)} |`)
  // 無人機群：出現的局 vs 沒出現的局，無辜者被 boom:drones 殺死
  for (const set of Object.keys(SETS)) {
    const gs = by((g) => g.set === set)
    if (!gs.length) continue
    const w = gs.filter((g) => g.events.includes('wasps'))
    const dr = w.flatMap((g) => g.deaths.filter((d) => !isEvil(d.vr) && /drones/.test(causeCat(d))))
    const wins = (l) => {
      const m = {}
      for (const g of l) m[g.winner] = (m[g.winner] ?? 0) + 1
      return JSON.stringify(m)
    }
    out(`- ${set}：無人機群出現 ${w.length}/${gs.length} 局；這些局無辜者被無人機（含站被打爆）殺死 ${dr.length} 人（${(dr.length / Math.max(1, w.length)).toFixed(2)}／局）；出現時勝方 ${wins(w)}，沒出現時 ${wins(gs.filter((g) => !g.events.includes('wasps')))}`)
  }
}

// ───────── 6. 站點 ─────────
out('\n## 6. 站點停留比例（活著的玩家・秒；船艙併為 ship）')
{
  const tot = {}
  const role = {}
  let all = 0
  for (const g of games) {
    for (const [z, v] of Object.entries(g.zoneTime)) {
      const k = z.startsWith('ship:') ? 'ship(cabin)' : z
      tot[k] = (tot[k] ?? 0) + v
      all += v
    }
    for (const [rb, m] of Object.entries(g.zoneTimeRole)) {
      const r = (role[rb] ??= {})
      for (const [z, v] of Object.entries(m)) {
        const k = z.startsWith('ship:') ? 'ship(cabin)' : z
        r[k] = (r[k] ?? 0) + v
      }
    }
  }
  const keys = Object.entries(tot).sort((a, b) => b[1] - a[1]).map(([k]) => k)
  out('| 站 | 全部 | ' + ['human', 'android', 'xeno', 'mutant', 'xenoSpawn', 'mutantSpawn'].join(' | ') + ' |')
  out('|---|---|' + '---|'.repeat(6))
  for (const k of keys) {
    const cells = ['human', 'android', 'xeno', 'mutant', 'xenoSpawn', 'mutantSpawn'].map((rb) => {
      const r = role[rb] ?? {}
      const s = Object.values(r).reduce((a, b) => a + b, 0)
      return s ? pct((r[k] ?? 0) / s) : '—'
    })
    out(`| ${k} | ${pct(tot[k] / all)} | ${cells.join(' | ')} |`)
  }
}

// ───────── 7. 驗血 ─────────
out('\n## 7. 驗血（基因檢測）')
out('| 組 | 人數 | 難度 | 局數 | 報告／局 | 首份報告 中位（分） | 乾淨 | 有感染 | 錯誤 | 離線 | 有「有感染」報告的局 | 異類主腦曾出現在有感染報告的局（異類主腦在場局） |')
out('|---|---|---|---|---|---|---|---|---|---|---|---|')
for (const set of Object.keys(SETS))
  for (const n of NS)
    for (const l of LV) {
      const c = by((g) => g.set === set && g.n === n && g.level === l)
      if (!c.length) continue
      const r = c.flatMap((g) => g.reports)
      const k = (x) => r.filter((y) => y.result === x).length
      const fr = c.map((g) => Math.min(...g.reports.map((x) => x.t))).filter((x) => isFinite(x))
      const inf = c.filter((g) => g.reports.some((x) => x.result === 'infected')).length
      const det = c.filter((g) => g.reports.some((x) => x.result === 'infected' && x.truth.some((t) => t === 'xeno' || t === 'mutant'))).length
      out(`| ${set} | ${n} | ${l} | ${c.length} | ${(r.length / c.length).toFixed(2)} | ${fr.length ? m1(q(fr, 0.5)) : '—'} | ${k('clean')} | ${k('infected')} | ${k('error')} | ${k('offline')} | ${ci(inf, c.length)} | ${ci(det, c.length)} |`)
    }
{
  // 正確性：乾淨報告裡有沒有異類（匿名形態、被寄生的人類算正常）
  const r = games.flatMap((g) => g.reports)
  const cleanBad = r.filter((x) => x.result === 'clean' && x.truth.some((t) => isEvil(t))).length
  const infNoEvil = r.filter((x) => x.result === 'infected' && !x.truth.some((t) => isEvil(t))).length
  out(`\n- 乾淨報告裡其實有異類（現在的身分；抽血後才被轉化的也算進來）：${cleanBad}/${r.filter((x) => x.result === 'clean').length}`)
  out(`- 有感染報告裡沒有異類（抽血後異類死亡改名等）：${infNoEvil}/${r.filter((x) => x.result === 'infected').length}`)
  const byRb = {}
  for (const x of r) byRb[x.rb] = (byRb[x.rb] ?? 0) + 1
  out(`- 誰在驗血（報告數，依驗血者身分）：${JSON.stringify(byRb)}`)
}

// ───────── 8. 指認 ─────────
out('\n## 8. 指認與誤殺（AI 人類方）')
out('| 組 | 難度 | 局數 | 指認 accuse | 指認對象是異類 | 提醒 suspect | 提醒對象是異類 | 人類方 AI 對看起來是人的玩家下攻擊命令 | 其中對象是無辜者 | 人類方殺死無辜者（crew→crew）| 人類方殺死異類（crew→evil）|')
out('|---|---|---|---|---|---|---|---|---|---|---|')
for (const set of Object.keys(SETS))
  for (const l of LV) {
    const c = by((g) => g.set === set && g.level === l)
    if (!c.length) continue
    const ch = c.flatMap((g) => g.chat)
    const acc = ch.filter((x) => x.key === 'play1.bot.accuse' && !isEvil(x.rb))
    const sus = ch.filter((x) => x.key === 'play1.bot.suspect' && !isEvil(x.rb))
    const at = c.flatMap((g) => g.attacks.filter((a) => !isEvil(a.ar) && a.tHuman))
    const cc = c.flatMap((g) => g.deaths.filter((d) => (d.kr === 'human' || d.kr === 'android') && !isEvil(d.vr) && d.killerOwner !== d.slot && causeCat(d) === 'crew→crew'))
    const ce = c.flatMap((g) => g.deaths.filter((d) => (d.kr === 'human' || d.kr === 'android') && isEvil(d.vr)))
    out(`| ${set} | ${l} | ${c.length} | ${acc.length} | ${acc.length ? ci(acc.filter((x) => isEvil(x.tr)).length, acc.length) : '—'} | ${sus.length} | ${sus.length ? ci(sus.filter((x) => isEvil(x.tr)).length, sus.length) : '—'} | ${at.length} | ${at.length ? ci(at.filter((a) => !isEvil(a.tr)).length, at.length) : '—'} | ${cc.length} | ${ce.length} |`)
  }
{
  const ch = games.flatMap((g) => g.chat.map((x) => ({ ...x, set: g.set })))
  const byKey = {}
  for (const x of ch) {
    const k = x.key.replace('play1.bot.', '')
    const m = (byKey[k] ??= {})
    m[x.rb] = (m[x.rb] ?? 0) + 1
  }
  out('\n**AI 發言（全部局，依發言者身分）**')
  out('| key | ' + ['human', 'android', 'xeno', 'mutant', 'xenoSpawn', 'mutantSpawn'].join(' | ') + ' |')
  out('|---|' + '---|'.repeat(6))
  for (const [k, m] of Object.entries(byKey)) out(`| ${k} | ${['human', 'android', 'xeno', 'mutant', 'xenoSpawn', 'mutantSpawn'].map((r) => m[r] ?? 0).join(' | ')} |`)
  const acc = ch.filter((x) => x.key === 'play1.bot.accuse')
  const tr = {}
  for (const x of acc) tr[x.tr] = (tr[x.tr] ?? 0) + 1
  out(`\n- 指認對象身分分布：${JSON.stringify(tr)}；指認真人（主機）次數：${acc.filter((x) => x.tBot === false).length}`)
  const sus = ch.filter((x) => x.key === 'play1.bot.suspect')
  const ts = {}
  for (const x of sus) ts[x.tr] = (ts[x.tr] ?? 0) + 1
  out(`- 提醒對象身分分布：${JSON.stringify(ts)}`)
  const fa = games.map((g) => g.chat.find((x) => x.key === 'play1.bot.accuse' && isEvil(x.tr))?.t).filter((x) => x !== undefined)
  out(`- 第一次正確指認的時間：中位 ${m1(q(fa, 0.5))} 分（${fa.length}/${games.length} 局有）`)
}

// ───────── 9. 道具／技能／防護服 ─────────
out('\n## 9. 道具、技能、防護服使用與勝負')
{
  const cmdTot = {}
  for (const g of games)
    for (const [rb, m] of Object.entries(g.cmds)) {
      const r = (cmdTot[rb] ??= {})
      for (const [k, v] of Object.entries(m)) r[k] = (r[k] ?? 0) + v
    }
  for (const rb of ['human', 'android', 'xeno', 'mutant', 'xenoSpawn', 'mutantSpawn']) {
    const m = cmdTot[rb]
    if (!m) continue
    const items = Object.entries(m)
      .filter(([k]) => /^(use|buy|cast|evolve):/.test(k))
      .sort((a, b) => b[1] - a[1])
      .slice(0, 18)
      .map(([k, v]) => `${k} ${v}`)
    out(`- **${rb}**：${items.join('、')}`)
  }
  // 防護服種類 vs 人類方勝（每位人類 AI）
  const suit = {}
  for (const g of games)
    for (const b of Object.values(g.perBot)) {
      if (b.role0 !== 'human') continue
      const ks = b.suitTypes.length ? b.suitTypes : ['(none)']
      for (const s of ks) {
        const r = (suit[s] ??= { n: 0, w: 0, alive: 0 })
        r.n++
        if (g.winner === 'crew') r.w++
        if (g.endRoles.find((x) => x.slot === b.slot)?.alive) r.alive++
      }
    }
  out('\n| 防護服（人類 AI 穿過的）| 人次 | 該局人類方勝 | 本人活到結束 |')
  out('|---|---|---|---|')
  for (const [k, v] of Object.entries(suit).sort((a, b) => b[1].n - a[1].n)) out(`| ${k} | ${v.n} | ${ci(v.w, v.n)} | ${ci(v.alive, v.n)} |`)
  // 進化階段 vs 勝
  out('\n| 異類主腦 | 局數 | 最高階 0 | 1 | 2 | 3 | 達到 T2+ 時該陣營勝率 | 未達 T2 時勝率 |')
  out('|---|---|---|---|---|---|---|---|')
  for (const role of ['xeno', 'mutant'])
    for (const l of LV) {
      const rows = []
      for (const g of games.filter((g) => g.level === l)) {
        const r = g.roles.find((x) => x.role === role)
        if (!r) continue
        const e = g.endRoles.find((x) => x.slot === r.slot)
        rows.push({ tier: e?.tier ?? 0, win: g.winner === role })
      }
      const t = (k) => rows.filter((x) => x.tier === k).length
      const hi = rows.filter((x) => x.tier >= 2)
      const lo = rows.filter((x) => x.tier < 2)
      out(`| ${role} ${l} | ${rows.length} | ${t(0)} | ${t(1)} | ${t(2)} | ${t(3)} | ${hi.length ? ci(hi.filter((x) => x.win).length, hi.length) : '—'} | ${lo.length ? ci(lo.filter((x) => x.win).length, lo.length) : '—'} |`)
    }
  const evo = {}
  for (const g of games) for (const e of g.evolve) evo[e.form] = (evo[e.form] ?? 0) + 1
  out(`\n- 進化選擇（指令次數）：${JSON.stringify(evo)}`)
  const eggs = games.map((g) => g.cmds.xeno?.['cast:xeno.egg'] ?? 0)
  out(`- 異形下蛋指令／局（有異形的局）：${meanCi(games.filter((g) => g.roles.some((r) => r.role === 'xeno')).map((g) => g.cmds.xeno?.['cast:xeno.egg'] ?? 0))}`)
}

// ───────── 10. tick ─────────
out('\n## 10. sim tick 成本（ms／tick；機器同時有其他 agent 在跑，數字偏高）')
out('| 組 | 人數 | 局數 | ticks | 牆鐘平均 | p50 | p99 | p99.9 | 最大 | CPU 時間 |')
out('|---|---|---|---|---|---|---|---|---|---|')
const binMs = (i) => 0.01 * Math.pow(10, (i + 0.5) / 66.7)
function hq(h, p) {
  const n = h.reduce((a, b) => a + b, 0)
  let acc = 0
  for (let i = 0; i < h.length; i++) {
    acc += h[i]
    if (acc >= p * n) return binMs(i)
  }
  return binMs(h.length - 1)
}
for (const set of Object.keys(SETS))
  for (const n of NS) {
    const c = by((g) => g.set === set && g.n === n)
    if (!c.length) continue
    const h = new Array(c[0].tick.hist.length).fill(0)
    let ticks = 0
    let sum = 0
    let mx = 0
    for (const g of c) {
      g.tick.hist.forEach((v, i) => (h[i] += v))
      ticks += g.tick.n
      sum += g.tick.sum
      mx = Math.max(mx, g.tick.max)
    }
    // CPU 時間（process.cpuUsage；不含等 CPU 的時間，機器忙的時候比牆鐘時間可信）
    const cc = c.filter((g) => g.tick.cpuHist)
    let cpu = '—'
    if (cc.length) {
      const hc = new Array(h.length).fill(0)
      let ct = 0
      let cs = 0
      let cm = 0
      for (const g of cc) {
        g.tick.cpuHist.forEach((v, i) => (hc[i] += v))
        ct += g.tick.n
        cs += g.tick.cpuSum
        cm = Math.max(cm, g.tick.cpuMax)
      }
      cpu = `CPU：平均 ${(cs / ct).toFixed(2)}、p50 ${hq(hc, 0.5).toFixed(2)}、p99 ${hq(hc, 0.99).toFixed(2)}、p99.9 ${hq(hc, 0.999).toFixed(1)}、最大 ${cm.toFixed(0)}（${cc.length} 局）`
    }
    out(`| ${set} | ${n} | ${c.length} | ${ticks} | ${(sum / ticks).toFixed(2)} | ${hq(h, 0.5).toFixed(2)} | ${hq(h, 0.99).toFixed(2)} | ${hq(h, 0.999).toFixed(1)} | ${mx.toFixed(0)} | ${cpu} |`)
  }
{
  const c = perfGames.filter((g) => g.tick.extraHist)
  if (c.length) {
    const h = new Array(c[0].tick.hist.length).fill(0)
    const h0 = new Array(c[0].tick.hist.length).fill(0)
    for (const g of c) {
      g.tick.extraHist.forEach((v, i) => (h[i] += v))
      g.tick.hist.forEach((v, i) => (h0[i] += v))
    }
    out(`\nPERF（${c.length} 局 ${c[0].n} 人，模擬全員真人 client：每位多建一份快照＋encode）：牆鐘 sim+1 client p50 ${hq(h0, 0.5).toFixed(2)} p99 ${hq(h0, 0.99).toFixed(2)}；全員 client p50 ${hq(h, 0.5).toFixed(2)} p99 ${hq(h, 0.99).toFixed(2)} p99.9 ${hq(h, 0.999).toFixed(1)}`)
    const cc = c.filter((g) => g.tick.extraCpuHist)
    if (cc.length) {
      const hc = new Array(h.length).fill(0)
      const hc0 = new Array(h.length).fill(0)
      let ticks = 0
      let ex = 0
      let mx = 0
      for (const g of cc) {
        g.tick.extraCpuHist.forEach((v, i) => (hc[i] += v))
        g.tick.cpuHist.forEach((v, i) => (hc0[i] += v))
        ticks += g.tick.n
        ex += g.tick.extraCpuSum
        mx = Math.max(mx, g.tick.extraCpuMax)
      }
      out(`PERF CPU 時間：sim＋1 client p50 ${hq(hc0, 0.5).toFixed(2)}、p99 ${hq(hc0, 0.99).toFixed(2)}、p99.9 ${hq(hc0, 0.999).toFixed(1)}；12 個 client 全部 p50 ${hq(hc, 0.5).toFixed(2)}、p99 ${hq(hc, 0.99).toFixed(2)}、p99.9 ${hq(hc, 0.999).toFixed(1)}、最大 ${mx.toFixed(0)}；每 tick 額外快照平均 ${(ex / ticks).toFixed(2)} ms`)
    }
  }
}

// ───────── 11. 身分破綻 ─────────
out('\n## 11. AI 身分破綻（同樣「看起來是人」的條件下，依真實身分比較）')
out('每位 AI 在該時段的比例先算成一個值，再對所有 AI 取平均（±95% CI）。只取「活著、人形、沒在末日」的秒數。w0 = 0–2 分、w1 = 2–7 分、w2 = 7–15 分、w3 = 15 分到末日。')
const RB = ['human', 'android', 'xeno', 'mutant', 'xenoSpawn']
for (const w of ['w0', 'w1', 'w2', 'w3']) {
  out(`\n**${w}**`)
  out('| 指標 | ' + RB.join(' | ') + ' |')
  out('|---|' + '---|'.repeat(RB.length))
  const metrics = {
    '穿著防護服': (W) => W.suit / W.n,
    '8 m 內沒有別人': (W) => W.alone8 / W.n,
    '12 m 內沒有別人': (W) => W.alone12 / W.n,
    '離最近的人（m，上限 40）': (W) => W.nearSum / W.n,
    '12 m 內 ≥3 人': (W) => W.crowd / W.n,
    '原地不動': (W) => W.idle / W.n,
    '在休息區': (W) => W.rest / W.n,
    '貼著別人走（<5 m 且移動）': (W) => W.follow / W.n,
    '帶著基因檢測器': (W) => W.sampler / W.n,
    '在女帝號': (W) => W.nyx / W.n,
    '每秒移動距離': (W) => W.distMoved / W.n,
  }
  for (const [name, f] of Object.entries(metrics)) {
    const cells = RB.map((rb) => {
      const vals = []
      for (const g of games)
        for (const b of Object.values(g.perBot)) {
          let W = b.w[rb + ':' + w]
          if (!W && b.w[w]) {
            // 舊格式（時段不分身分）：只用整局身分沒變的
            const now = g.endRoles.find((x) => x.slot === b.slot)?.rb
            if (b.role0 === rb && now === rb) W = b.w[w]
          }
          if (!W || W.n < 20) continue
          vals.push(f(W))
        }
      return vals.length ? `${meanCi(vals)} (${vals.length})` : '—'
    })
    out(`| ${name} | ${cells.join(' | ')} |`)
  }
}
// 一次性指標
out('\n**一次性指標（每位 AI）**')
out('| 指標 | ' + RB.slice(0, 4).join(' | ') + ' |')
out('|---|' + '---|'.repeat(4))
{
  const rows = {
    '開局 10 分鐘內買過東西': (b) => b.firstBuy >= 0 && b.firstBuy < 600,
    '開局 10 分鐘內穿上防護服': (b) => b.firstSuit >= 0 && b.firstSuit < 600,
    '整局穿過防護服': (b) => b.firstSuit >= 0,
    '整局在全體頻道說過話': (b) => Object.keys(b.chats).length > 0,
    '整局用過基因檢測器': (b) => (b.uses.geneSampler ?? 0) > 0,
    '整局交還控制台（誤站上控制台）≥1': (b) => (b.unp ?? 0) > 0,
  }
  for (const [name, f] of Object.entries(rows)) {
    const cells = RB.slice(0, 4).map((rb) => {
      let k = 0
      let n = 0
      for (const g of games)
        for (const b of Object.values(g.perBot)) {
          if (b.role0 !== rb) continue
          // 只算活過 10 分鐘的
          if (b.deathT >= 0 && b.deathT < 600) continue
          const now = g.endRoles.find((x) => x.slot === b.slot)?.rb
          if (rb === 'human' && now !== 'human') continue
          n++
          if (f(b)) k++
        }
      return n ? `${ci(k, n)} (${n})` : '—'
    })
    out(`| ${name} | ${cells.join(' | ')} |`)
  }
}
// 簡單觀察者規則的命中率：活過 10 分鐘、10 分鐘時還沒買過任何東西的 AI 有多少是異類
out('\n**觀察者規則（活過 10 分鐘的 AI；一般人看得到的行為）**')
{
  const rules = {
    '10 分鐘內沒買過任何東西（沒去過販賣機）': (b) => !(b.firstBuy >= 0 && b.firstBuy < 600),
    '15 分鐘內沒穿過防護服': (b) => !(b.firstSuit >= 0 && b.firstSuit < 900),
    '整局從沒在全體頻道說話（存活 ≥15 分）': (b) => Object.keys(b.chats).length === 0,
  }
  out('| 規則 | 符合的 AI | 其中是異類主腦（precision）| 異類主腦被這條規則抓到（recall）| 基準：異類主腦占比 |')
  out('|---|---|---|---|---|')
  for (const [name, f] of Object.entries(rules)) {
    let tp = 0
    let fp = 0
    let fn = 0
    let base = 0
    let all = 0
    for (const g of games)
      for (const b of Object.values(g.perBot)) {
        const need = name.includes('15') ? 900 : 600
        if (b.deathT >= 0 && b.deathT < need) continue
        const ev = b.role0 === 'xeno' || b.role0 === 'mutant'
        all++
        if (ev) base++
        const hit = f(b)
        if (hit && ev) tp++
        else if (hit) fp++
        else if (ev) fn++
      }
    out(`| ${name} | ${tp + fp} | ${ci(tp, tp + fp)} | ${ci(tp, tp + fn)} | ${pct(base / all)} |`)
  }
}
