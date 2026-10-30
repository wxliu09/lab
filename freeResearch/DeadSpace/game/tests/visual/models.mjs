// 異形／變種人／仿生人模型截圖自評：node tests/visual/models.mjs <outDir> [篩選字串]
// 篩選字串以 ! 開頭表示排除（例：!close）。單張自訂：node tests/visual/models.mjs <outDir> "?ids=mut.brawn,human&dist=12&pitch=20" [名稱] [狀態] [速度]
// 預設會用 vite（--mode e2e）把 models.html 另外 build 到 <outDir>/../models-dist 再 preview（不進正式 build、不受 HMR 干擾）；
// 已經有 server 時用 XC_URL=http://localhost:5199/ 指定，XC_NOBUILD=1 則沿用上次的 build。
import { chromium } from 'playwright'
import { mkdirSync } from 'node:fs'
import { resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

const out = resolve(process.argv[2] ?? '.')
const filter = process.argv[3] ?? ''
mkdirSync(out, { recursive: true })
let base = process.env.XC_URL
let server = null
if (!base) {
  const { build, preview } = await import('vite')
  const root = fileURLToPath(new URL('../../', import.meta.url))
  const configFile = resolve(root, 'vite.config.ts')
  const dist = resolve(out, '../models-dist')
  if (!process.env.XC_NOBUILD) {
    await build({ root, configFile, mode: 'e2e', logLevel: 'warn', build: { outDir: dist, emptyOutDir: true, rollupOptions: { input: { models: resolve(root, 'models.html') } } } })
  }
  server = await preview({ root, configFile, mode: 'e2e', logLevel: 'warn', build: { outDir: dist }, preview: { port: 5198, strictPort: false } })
  base = server.resolvedUrls?.local[0] ?? 'http://localhost:5198/'
}

const XENO12 = 'human,xeno.protoform,xeno.protoform.spawn,xeno.lumen,xeno.brute,xeno.puppeteer,xeno.egg,xeno.cocoon'
const XENO3 = 'human,xeno.pyreheart,xeno.arcflayer,xeno.phantasm,xeno.gorgon,xeno.hydra,xeno.weaver,xeno.voidwalker,xeno.chronarch,xeno.mimic'
const MUT1 = 'human,mut.apex,mut.sporemother,mut.drone,mut.blitz,mut.brawn,mut.mimetic,mut.spinner,mut.lurker'
const MUT3 = 'human,mut.carcinid,mut.colossus,mut.taurus,mut.plagueQueen,mut.broodmother,mut.blightcrawler,mut.hiveground,mut.mass'
const MINI = 'human,mut.fleshy,mut.spiderling,mut.sporeling,mut.worm,mut.swarm,mut.tentacle,mut.carrierSack,mut.harbinger,mut.vectorBug,mut.slime,mut.hiveground.spawn'
const DROID = 'human,android.bulwark,android.gale,android.pengu,butler'
const EXTRA = 'human,xeno.timeZombie,xeno.eldritch,xeno.hydraCore,xeno.entropyField,xeno.webAnchor,mut.hiveground.spawn,mut.guardian,mut.hiveship'

// [名稱, 查詢字串, 狀態, 速度]
const SHOTS = [
  ['xeno-t12', `ids=${XENO12}&cols=4&sp=4.6&dist=30`, 0, 0],
  ['xeno-t3', `ids=${XENO3}&cols=5&sp=5.2&dist=36`, 0, 0],
  ['mut-t12', `ids=${MUT1}&cols=5&sp=4.6&dist=32`, 0, 0],
  ['mut-t3', `ids=${MUT3}&cols=5&sp=5.6&dist=38`, 0, 0],
  ['mut-minion', `ids=${MINI}&cols=6&sp=3.6&dist=30`, 0, 0],
  ['droid', `ids=${DROID}&cols=5&sp=4&dist=24`, 0, 0],
  ['xeno-t12-close', `ids=${XENO12}&cols=4&sp=3.8&dist=16`, 0, 0],
  ['xeno-t3-close', `ids=${XENO3}&cols=5&sp=4.6&dist=22`, 0, 0],
  ['mut-t12-close', `ids=${MUT1}&cols=5&sp=3.8&dist=18`, 0, 0],
  ['mut-t3-close', `ids=${MUT3}&cols=5&sp=5&dist=24`, 0, 0],
  ['mut-minion-close', `ids=${MINI}&cols=6&sp=2.8&dist=16`, 0, 0],
  ['droid-close', `ids=${DROID}&cols=5&sp=3.2&dist=13`, 0, 0],
  ['extra-close', `ids=${EXTRA}&cols=5&sp=4.4&dist=20`, 0, 0],
  ['extra-dead', `ids=${EXTRA}&cols=5&sp=4.4&dist=20`, 4, 0],
  ['xeno-move', `ids=${XENO12}&cols=4&sp=4.6&dist=30`, 1, 3],
  ['xeno-attack', `ids=${XENO3}&cols=5&sp=5.2&dist=36`, 2, 0],
  ['mut-move', `ids=${MUT1}&cols=5&sp=4.6&dist=32`, 1, 3],
  ['mut-attack', `ids=${MUT3}&cols=5&sp=5.6&dist=38`, 2, 0],
  ['droid-move', `ids=${DROID}&cols=5&sp=4&dist=24`, 1, 3],
  ['xeno-dead', `ids=${XENO12}&cols=4&sp=4.6&dist=30`, 4, 0],
  ['xeno3-dead', `ids=${XENO3}&cols=5&sp=5.2&dist=36`, 4, 0],
  ['mut-dead', `ids=${MUT1}&cols=5&sp=4.6&dist=32`, 4, 0],
  ['mut3-dead', `ids=${MUT3}&cols=5&sp=5.6&dist=38`, 4, 0],
  ['droid-dead', `ids=${DROID}&cols=5&sp=4&dist=24`, 4, 0],
]

const browser = await chromium.launch({ args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'] })
const page = await browser.newPage({ viewport: { width: 1600, height: 900 } })
page.on('console', (m) => {
  const t = m.text()
  if (m.type() === 'error' || m.type() === 'warning' || t.startsWith('[gallery]')) console.log('[console]', m.type(), t.slice(0, 1500))
})
page.on('pageerror', (e) => console.log('[pageerror]', e.message))
const custom = filter.startsWith('?') ? [[process.argv[4] ?? 'custom', filter.slice(1), +(process.argv[5] ?? 0), +(process.argv[6] ?? 0)]] : null
for (const [name, query, st, speed] of custom ?? SHOTS) {
  if (!custom && filter && (filter.startsWith('!') ? name.includes(filter.slice(1)) : !name.includes(filter))) continue
  try {
    await page.goto(`${base}models.html?${query}&q=low`, { timeout: 120000 })
    await page.waitForFunction(() => window.__gallery && window.__gallery.frames > 6, null, { timeout: 120000 })
    if (st) {
      await page.evaluate(([a, b]) => window.__gallery.set(a, b), [st, speed])
      await page.waitForFunction((f) => window.__gallery.frames > f, await page.evaluate(() => window.__gallery.frames + 12), { timeout: 120000 })
      await page.waitForTimeout(st === 4 ? 2500 : 600)
    } else await page.waitForTimeout(800)
    await page.screenshot({ path: `${out}/${name}.png`, timeout: 300000 })
    console.log('shot', name)
  } catch (e) {
    console.log('fail', name, String(e).split('\n')[0])
  }
}
await browser.close()
await server?.close()
