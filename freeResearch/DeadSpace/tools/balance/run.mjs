// 平行跑一批對局：node run.mjs <jobs.txt> <並行數>
// jobs.txt 每行一個 harness 參數字串（例：--n 8 --level normal --host bot --room mp --seed0 0 --count 5 --out data/A_8_normal.jsonl）
import { spawn } from 'node:child_process'
import { readFileSync, appendFileSync } from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const here = path.dirname(fileURLToPath(import.meta.url))
const jobs = readFileSync(process.argv[2], 'utf8').split('\n').map((l) => l.trim()).filter((l) => l && !l.startsWith('#'))
const K = Number(process.argv[3] ?? 2)
const log = path.join(here, 'logs', path.basename(process.argv[2]) + '.log')
let next = 0
let running = 0
let done = 0
const t0 = Date.now()
function launch() {
  while (running < K && next < jobs.length) {
    const j = jobs[next++]
    running++
    // 行首 @檔名 = 用 dist/ 底下別的打包（實驗變體）
    const toks = j.split(/\s+/)
    const bundle = toks[0].startsWith('@') ? toks.shift().slice(1) : 'harness.mjs'
    const c = spawn('node', [path.join(here, 'dist', bundle), ...toks], { cwd: here })
    c.stdout.on('data', (d) => appendFileSync(log, d))
    c.stderr.on('data', (d) => appendFileSync(log, 'ERR ' + d))
    c.on('exit', (code) => {
      running--
      done++
      appendFileSync(log, `# job ${done}/${jobs.length} exit=${code} (${((Date.now() - t0) / 60000).toFixed(1)} min) ${j}\n`)
      if (done === jobs.length) appendFileSync(log, '# ALL DONE\n')
      launch()
    })
  }
}
launch()
