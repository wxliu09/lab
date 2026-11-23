// 實驗變體 vs 同 seed 的基準（A 組）：node compare.mjs
import { readFileSync, readdirSync } from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
const here = path.dirname(fileURLToPath(import.meta.url))
const dir = path.join(here, 'data')
const load = (f) => readFileSync(path.join(dir, f), 'utf8').split('\n').filter((l) => l.trim()).map((l) => JSON.parse(l)).filter((g) => !g.error)
const isEvil = (rb) => ['xeno', 'mutant', 'xenoSpawn', 'mutantSpawn', 'androidTurned'].includes(rb)
const out = (s = '') => process.stdout.write(s + '\n')
function summ(gs) {
  const n = gs.length
  const w = (x) => gs.filter((g) => g.winner === x).length
  const inn = gs.flatMap((g) => g.deaths.filter((d) => !isEvil(d.vr)))
  const conv = inn.filter((d) => d.conv).length
  const rad = gs.flatMap((g) => g.deaths.filter((d) => d.doom && (d.buff === 'bf.planetRad' || d.buff === 'bf.planetRadField'))).length
  const doom = gs.filter((g) => g.apoc)
  const ab = gs.reduce((a, g) => a + (g.cmds.human?.['use:antibodyKit'] ?? 0) + (g.cmds.android?.['use:antibodyKit'] ?? 0), 0)
  const dur = gs.map((g) => g.dur / 60).sort((a, b) => a - b)
  const aliveEnd = gs.reduce((a, g) => a + g.endRoles.filter((r) => r.alive).length, 0)
  return `n=${n} crew ${w('crew')} xeno ${w('xeno')} mutant ${w('mutant')} draw ${w('draw')} | 無辜者死亡/局 ${(inn.length / n).toFixed(2)}（其中轉化 ${(conv / n).toFixed(2)}）| 末日 ${doom.length} 局、末日輻射死亡 ${rad}（${(rad / Math.max(1, doom.length)).toFixed(2)}／末日局）| 平手中 doom ${gs.filter((g) => g.drawWhy === 'doom').length}、wipe ${gs.filter((g) => g.drawWhy === 'wipe').length} | 結束時存活/局 ${(aliveEnd / n).toFixed(2)} | 中位長度 ${dur[dur.length >> 1]?.toFixed(1)} 分 | 抗體包使用 ${ab}`
}
for (const f of readdirSync(dir).filter((f) => f.startsWith('V_')).sort()) {
  const v = load(f)
  const m = f.match(/^V_([a-z+]+)_(.*)$/)
  const base = load('A_' + m[2]).filter((g) => v.some((x) => x.seed === g.seed))
  const vv = v.filter((g) => base.some((x) => x.seed === g.seed))
  out(`### ${m[1]} — ${m[2].replace('.jsonl', '')}（同 seed 配對 ${vv.length} 局）`)
  out(`- 基準：${summ(base)}`)
  out(`- 變體：${summ(vv)}`)
}
