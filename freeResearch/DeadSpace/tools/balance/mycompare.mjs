// 第 8 輪 AI8：同 seed 配對比較（data/<a>/ vs data/<b>/），指標定義照審查 B 的 analyze.mjs
// 用法：node mycompare.mjs pre post1 [更多資料夾…]
import { readFileSync, readdirSync, existsSync } from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const here = path.dirname(fileURLToPath(import.meta.url))
const sets = process.argv.slice(2)
const out = (s = '') => process.stdout.write(s + '\n')
const pct = (x) => (Number.isFinite(x) ? (100 * x).toFixed(0) + '%' : '—')
const isEvil = (rb) => ['xeno', 'mutant', 'xenoSpawn', 'mutantSpawn', 'androidTurned'].includes(rb)
function wilson(k, n, z = 1.96) {
  if (!n) return [0, 0]
  const p = k / n
  const d = 1 + (z * z) / n
  const c = p + (z * z) / (2 * n)
  const w = z * Math.sqrt((p * (1 - p)) / n + (z * z) / (4 * n * n))
  return [Math.max(0, (c - w) / d), Math.min(1, (c + w) / d)]
}
const ci = (k, n) => {
  if (!n) return '—'
  const [a, b] = wilson(k, n)
  return `${pct(k / n)} [${(100 * a).toFixed(0)}–${(100 * b).toFixed(0)}]`
}
const median = (a) => {
  if (!a.length) return NaN
  const s = [...a].sort((x, y) => x - y)
  return s[s.length >> 1]
}

function load(dir) {
  const d = path.join(here, 'data', dir)
  const games = []
  if (!existsSync(d)) return games
  for (const f of readdirSync(d)) {
    if (!f.endsWith('.jsonl')) continue
    for (const l of readFileSync(path.join(d, f), 'utf8').split('\n')) {
      if (!l.trim()) continue
      const g = JSON.parse(l)
      if (g.error) {
        console.error('ERROR', dir, f, g.seed, g.error.slice(0, 200))
        continue
      }
      g.set = f.split('_')[0]
      g.file = f
      games.push(g)
    }
  }
  return games
}
const data = Object.fromEntries(sets.map((s) => [s, load(s)]))
// 配對：同檔名、同 seed 都有的局
const key = (g) => g.file + '#' + g.seed
const common = new Set(data[sets[0]].map(key).filter((k) => sets.every((s) => data[s].some((g) => key(g) === k))))
for (const s of sets) data[s] = data[s].filter((g) => common.has(key(g)))
out(`配對局數：${common.size}（${sets.join(' vs ')}）`)

function winRow(gs) {
  const n = gs.length
  const w = (x) => gs.filter((g) => g.winner === x).length
  return `${n} | ${pct(w('crew') / n)} | ${pct(w('xeno') / n)} | ${pct(w('mutant') / n)} | ${pct(w('draw') / n)}`
}

out('\n## 勝方（A：多人規則、全 AI）')
out('| 人數 | 難度 | ' + sets.map((s) => `${s}: n | 人類方 | 異形 | 變種人 | 平手`).join(' | ') + ' |')
out('|---|---|' + sets.map(() => '---|---|---|---|---|').join(''))
for (const lv of ['normal', 'easy']) {
  for (const n of [4, 6, 8, 10, 12, 'all']) {
    const row = sets.map((s) => winRow(data[s].filter((g) => g.set === 'A' && g.level === lv && (n === 'all' || g.n === n))))
    out(`| ${n} | ${lv} | ${row.join(' | ')} |`)
  }
}
out('\n平手原因（A）：')
for (const s of sets) {
  for (const lv of ['normal', 'easy']) {
    const d = data[s].filter((g) => g.set === 'A' && g.level === lv && g.winner === 'draw')
    const by = {}
    for (const g of d) by[g.drawWhy] = (by[g.drawWhy] ?? 0) + 1
    const doom = data[s].filter((g) => g.set === 'A' && g.level === lv && g.apoc === 'fleet')
    out(`- ${s} ${lv}：${JSON.stringify(by)}；艦隊末日 ${doom.length} 局中平手 ${ci(doom.filter((g) => g.winner === 'draw').length, doom.length)}`)
  }
}

out('\n## E：單機練習、簡單、主機真人不動且身分是異類（主機那方勝）')
out('| 人數 | ' + sets.map((s) => `${s}: n | 主機那方勝 | 人類方勝 | 平手`).join(' | ') + ' |')
out('|---|' + sets.map(() => '---|---|---|---|').join(''))
for (const n of [4, 6, 8, 10, 12, 'all']) {
  const row = sets.map((s) => {
    const gs = data[s].filter((g) => g.set === 'E' && (n === 'all' || g.n === n))
    const hw = gs.filter((g) => g.winner === g.hostRole).length
    return `${gs.length} | ${ci(hw, gs.length)} | ${pct(gs.filter((g) => g.winner === 'crew').length / gs.length)} | ${pct(gs.filter((g) => g.winner === 'draw').length / gs.length)}`
  })
  out(`| ${n} | ${row.join(' | ')} |`)
}

// ───────── 身分破綻 ─────────
const A = (s) => data[s].filter((g) => g.set === 'A')
out('\n## 觀察者規則（A 組、活過 10／15 分鐘的 AI；審查 B 定義）')
const rules = {
  '10 分鐘內沒去過販賣機': [(b) => !(b.firstBuy >= 0 && b.firstBuy < 600), 600],
  '15 分鐘內沒穿過防護服': [(b) => !(b.firstSuit >= 0 && b.firstSuit < 900), 900],
  '整局沒在全體頻道說話（存活 ≥15 分）': [(b) => Object.keys(b.chats).length === 0, 900],
}
out('| 規則 | ' + sets.map((s) => `${s}: 符合 | precision | recall | 基準`).join(' | ') + ' |')
out('|---|' + sets.map(() => '---|---|---|---|').join(''))
for (const [name, [f, need]] of Object.entries(rules)) {
  const cells = sets.map((s) => {
    let tp = 0
    let fp = 0
    let fn = 0
    let base = 0
    let all = 0
    for (const g of A(s))
      for (const b of Object.values(g.perBot)) {
        if (b.deathT >= 0 && b.deathT < need) continue
        const ev = b.role0 === 'xeno' || b.role0 === 'mutant'
        all++
        if (ev) base++
        const hit = f(b)
        if (hit && ev) tp++
        else if (hit) fp++
        else if (ev) fn++
      }
    return `${tp + fp} | ${ci(tp, tp + fp)} | ${ci(tp, tp + fn)} | ${pct(base / all)}`
  })
  out(`| ${name} | ${cells.join(' | ')} |`)
}

out('\n## 一次性指標（A 組、活過 10 分鐘）')
const once = {
  '10 分鐘內去過販賣機': (b) => b.firstBuy >= 0 && b.firstBuy < 600,
  '15 分鐘內穿過防護服': (b) => b.firstSuit >= 0 && b.firstSuit < 900,
  '整局說過話': (b) => Object.keys(b.chats).length > 0,
  '整局用過基因檢測器': (b) => (b.uses.geneSampler ?? 0) > 0,
}
const RB1 = ['human', 'android', 'xeno', 'mutant']
for (const s of sets) {
  out(`\n**${s}**`)
  out('| 指標 | ' + RB1.join(' | ') + ' |')
  out('|---|' + '---|'.repeat(RB1.length))
  for (const [name, f] of Object.entries(once)) {
    const cells = RB1.map((rb) => {
      let k = 0
      let n = 0
      for (const g of A(s))
        for (const b of Object.values(g.perBot)) {
          if (b.role0 !== rb || (b.deathT >= 0 && b.deathT < 600)) continue
          const now = g.endRoles.find((x) => x.slot === b.slot)?.rb
          if (rb === 'human' && now !== 'human') continue
          n++
          if (f(b)) k++
        }
      return n ? `${pct(k / n)} (${n})` : '—'
    })
    out(`| ${name} | ${cells.join(' | ')} |`)
  }
}

out('\n## 時段行為差（A 組，人形、活著、末日前；每位 AI 先取比例再平均；最大差 = 異類主腦對 human 的最大百分點差）')
const metrics = {
  穿著防護服: (W) => W.suit / W.n,
  '8 m 內沒有別人': (W) => W.alone8 / W.n,
  原地不動: (W) => W.idle / W.n,
  在休息區: (W) => W.rest / W.n,
  '貼著別人走（<5 m 且移動）': (W) => W.follow / W.n,
  帶著基因檢測器: (W) => W.sampler / W.n,
}
const RB = ['human', 'xeno', 'mutant', 'xenoSpawn']
for (const s of sets) {
  out(`\n**${s}**`)
  out('| 時段 | 指標 | ' + RB.join(' | ') + ' | 最大差 |')
  out('|---|---|' + '---|'.repeat(RB.length + 1))
  for (const w of ['w1', 'w2', 'w3']) {
    for (const [name, f] of Object.entries(metrics)) {
      const m = {}
      for (const rb of RB) {
        const vals = []
        for (const g of A(s))
          for (const b of Object.values(g.perBot)) {
            const W = b.w[rb + ':' + w]
            if (!W || W.n < 20) continue
            vals.push(f(W))
          }
        m[rb] = vals.length ? vals.reduce((a, x) => a + x, 0) / vals.length : NaN
      }
      const gap = Math.max(...['xeno', 'mutant'].map((r) => (Number.isFinite(m[r]) ? Math.abs(m[r] - m.human) : 0)))
      out(`| ${w} | ${name} | ${RB.map((r) => (Number.isFinite(m[r]) ? (100 * m[r]).toFixed(0) : '—')).join(' | ')} | ${(100 * gap).toFixed(0)} |`)
    }
  }
}

out('\n## 轉化、死亡、驗血、指認（A 組）')
out('| 指標 | ' + sets.join(' | ') + ' |')
out('|---|' + '---|'.repeat(sets.length))
const rowsA = {
  '無辜者死亡／局': (gs) => (gs.flatMap((g) => g.deaths.filter((d) => !isEvil(d.vr))).length / gs.length).toFixed(2),
  '其中轉化／局': (gs) => (gs.flatMap((g) => g.deaths.filter((d) => !isEvil(d.vr) && d.conv)).length / gs.length).toFixed(2),
  '轉化占無辜者死亡': (gs) => {
    const inn = gs.flatMap((g) => g.deaths.filter((d) => !isEvil(d.vr)))
    return pct(inn.filter((d) => d.conv).length / inn.length)
  },
  '首位無辜者死亡（分，中位）': (gs) => median(gs.map((g) => g.deaths.filter((d) => !isEvil(d.vr)).map((d) => d.t)).filter((a) => a.length).map((a) => Math.min(...a) / 60)).toFixed(1),
  '抗體包使用／局': (gs) => (gs.reduce((a, g) => a + Object.values(g.perBot).reduce((x, b) => x + (b.uses.antibodyKit ?? 0), 0), 0) / gs.length).toFixed(2),
  '報告是「錯誤」的比例': (gs) => {
    const r = gs.flatMap((g) => g.reports)
    return pct(r.filter((x) => x.result === 'error').length / r.length)
  },
  '仿生人的報告是「錯誤」': (gs) => {
    const r = gs.flatMap((g) => g.reports.filter((x) => x.rb === 'android'))
    return `${pct(r.filter((x) => x.result === 'error').length / r.length)} (${r.length})`
  },
  '人類方 AI 指認（次）': (gs) => gs.flatMap((g) => g.chat.filter((c) => c.key === 'play1.bot.accuse' && !isEvil(c.rb))).length,
  '指認正確（對象是異類）': (gs) => {
    const a = gs.flatMap((g) => g.chat.filter((c) => c.key === 'play1.bot.accuse' && !isEvil(c.rb)))
    return ci(a.filter((c) => isEvil(c.tr)).length, a.length)
  },
  '有正確指認的局': (gs) => ci(gs.filter((g) => g.chat.some((c) => c.key === 'play1.bot.accuse' && !isEvil(c.rb) && isEvil(c.tr))).length, gs.length),
  '人類方 AI 對看起來是人的無辜者下攻擊命令': (gs) => gs.flatMap((g) => g.attacks.filter((a) => !isEvil(a.ar) && a.tHuman && !isEvil(a.tr))).length,
  '人類方殺死無辜者（crew→crew）': (gs) => gs.flatMap((g) => g.deaths.filter((d) => !isEvil(d.vr) && d.killerOwner >= 0 && ['human', 'android'].includes(d.kr) && d.killerOwner !== d.slot && !d.conv)).length,
  '「可疑」：人類方說／異類說（次）': (gs) => {
    const a = gs.flatMap((g) => g.chat.filter((c) => c.key === 'play1.bot.suspect'))
    return `${a.filter((c) => !isEvil(c.rb)).length} / ${a.filter((c) => isEvil(c.rb)).length}`
  },
  '異類說過話的局（主腦）': (gs) => ci(gs.filter((g) => g.chat.some((c) => c.rb === 'xeno' || c.rb === 'mutant')).length, gs.length),
  '仿生人升級（局）': (gs) => gs.filter((g) => g.evolve.some((e) => e.rb === 'android')).length,
  '仿生人活到 2000 EP（局）': (gs) => gs.filter((g) => g.endRoles.some((r) => r.rb === 'android' && (r.ep >= 2000 || r.tier >= 2))).length,
}
for (const [name, f] of Object.entries(rowsA)) out(`| ${name} | ${sets.map((s) => f(A(s))).join(' | ')} |`)

out('\n## 簡單難度的異形最高階（A 組 easy，異形主腦）')
for (const s of sets) {
  const t = {}
  for (const g of A(s).filter((g) => g.level === 'easy')) {
    const r = g.endRoles.find((x) => x.rb === 'xeno')
    if (r) t[r.tier] = (t[r.tier] ?? 0) + 1
  }
  out(`- ${s}：${JSON.stringify(t)}`)
}

out('\n## 每位 AI 的發言種類（A 組，活過 15 分鐘的主腦與人類：說過該類的比例）')
const kinds = { 驗血結果: /^play1\.bot\.git/, 指認提醒: /accuse|suspect/, 撤離: /evac|siege/, 招呼: /\.hi\./, 怪物: /monster/, 被打: /\.hit\./, 辯解: /alibi/, 寄生: /parasite/ }
for (const s of sets) {
  out(`\n**${s}**`)
  out('| 種類 | human | xeno | mutant |')
  out('|---|---|---|---|')
  for (const [name, re] of Object.entries(kinds)) {
    const cells = ['human', 'xeno', 'mutant'].map((rb) => {
      let k = 0
      let n = 0
      for (const g of A(s))
        for (const b of Object.values(g.perBot)) {
          if (b.role0 !== rb || (b.deathT >= 0 && b.deathT < 900)) continue
          n++
          if (Object.keys(b.chats).some((c) => re.test(c))) k++
        }
      return n ? `${pct(k / n)} (${n})` : '—'
    })
    out(`| ${name} | ${cells.join(' | ')} |`)
  }
}
