// 把 harness.ts 連同 game/src 的 sim 打包成單一 node ESM 檔（不改遊戲原始碼；只在打包時注入兩個觀察用掛鉤）
// 用法：node tools/balance/build.mjs（用 game/ 的 node_modules 裡的 rolldown；XC_NAME=名稱 指定輸出檔名）
import { createRequire } from 'node:module'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const here = path.dirname(fileURLToPath(import.meta.url))
const GAME = path.resolve(here, '../../game')
const { build } = createRequire(path.join(GAME, 'package.json'))('rolldown')

const hooks = {
  name: 'xc-observe',
  transform(code, id) {
    if (id.endsWith('/src/sim/ai/bots.ts')) {
      const a = 'function cmd(g: Game, p: GamePlayer, c: Command): void {\n  handleCommand(g, p, c)\n}'
      if (!code.includes(a)) throw new Error('bots.ts cmd() 樣式變了，更新 build.mjs')
      const out = code.replace(a, 'function cmd(g: Game, p: GamePlayer, c: Command): void {\n  ;(globalThis as any).__xcCmd?.(g, p, c)\n  handleCommand(g, p, c)\n}')
      // 實驗變體（XC_VARIANT=a,b）：照下面 stations.ts 的 radcap 寫法，用 code.replace 換掉一段程式，量「建議改動」的效果；
      // 第 8 輪用過的 antibody／doomallout／raddodge 已正式寫進 bots.ts，所以拿掉了
      return out
    }
    if (id.endsWith('/src/sim/systems/stations.ts') && (process.env.XC_VARIANT ?? '').split(',').includes('radcap')) {
      // 實驗（規則）：翠原星地表殘留輻射封頂每秒 4（原作每次隕擊 +3、每秒 ×0.99，沒有上限）
      const a = '    S.rad += RAD_PER_IMPACT\n'
      if (!code.includes(a)) throw new Error('variant radcap anchor')
      return code.replace(a, '    S.rad = Math.min(4, S.rad + RAD_PER_IMPACT)\n')
    }
    if (id.endsWith('/src/sim/game.ts')) {
      const a = 'const vis = computeVision(this)'
      if (!code.includes(a)) throw new Error('game.ts flush 樣式變了，更新 build.mjs')
      return code.replace(a, 'const vis = computeVision(this); (this as any).__lastVis = vis')
    }
    return null
  },
}

await build({
  input: path.join(here, 'src/harness.ts'),
  cwd: GAME,
  platform: 'node',
  resolve: { alias: { '@game': path.join(GAME, 'src') } },
  transform: { define: { __DEV__: 'false', __TEST_HOOKS__: 'false' } },
  plugins: [hooks],
  output: { file: path.join(here, 'dist', process.env.XC_NAME ? process.env.XC_NAME + '.mjs' : process.env.XC_VARIANT ? 'harness-' + process.env.XC_VARIANT.replace(/,/g, '+') + '.mjs' : 'harness.mjs'), format: 'esm' },
  logLevel: 'warn',
})
console.log('built', process.env.XC_VARIANT ?? '(base)')
