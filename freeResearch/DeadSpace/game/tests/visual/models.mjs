// 異類／仿生人模型截圖自評：node tests/visual/models.mjs <outDir> [篩選字串]
// 需要先在背景跑 dev server：npx vite --port 5199 --strictPort（models.html 只存在於 dev server，不進正式 build）
import { chromium } from 'playwright'
import { mkdirSync } from 'node:fs'

const out = process.argv[2] ?? '.'
const filter = process.argv[3] ?? ''
const base = process.env.XC_URL ?? 'http://localhost:5199/'
mkdirSync(out, { recursive: true })

const XENO12 = 'human,xeno.protoform,xeno.protoform.spawn,xeno.lumen,xeno.brute,xeno.puppeteer,xeno.egg,xeno.cocoon'
const XENO3 = 'human,xeno.pyreheart,xeno.arcflayer,xeno.phantasm,xeno.gorgon,xeno.hydra,xeno.weaver,xeno.voidwalker,xeno.chronarch,xeno.mimic'
const MUT1 = 'human,mut.apex,mut.sporemother,mut.drone,mut.blitz,mut.brawn,mut.mimetic,mut.spinner,mut.lurker'
const MUT3 = 'human,mut.carcinid,mut.colossus,mut.taurus,mut.plagueQueen,mut.broodmother,mut.blightcrawler,mut.hiveground,mut.mass'
const MINI = 'human,mut.fleshy,mut.spiderling,mut.sporeling,mut.worm,mut.swarm,mut.tentacle,mut.carrierSack,mut.harbinger,mut.vectorBug,mut.slime,mut.hiveground.spawn'
const DROID = 'human,android.bulwark,android.gale,android.pengu,butler'

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
for (const [name, query, st, speed] of SHOTS) {
  if (filter && !name.includes(filter)) continue
  await page.goto(`${base}models.html?${query}&q=low`)
  await page.waitForFunction(() => window.__gallery && window.__gallery.frames > 6, null, { timeout: 120000 })
  if (st) {
    await page.evaluate(([a, b]) => window.__gallery.set(a, b), [st, speed])
    await page.waitForFunction((f) => window.__gallery.frames > f, await page.evaluate(() => window.__gallery.frames + 12), { timeout: 120000 })
    await page.waitForTimeout(st === 4 ? 2500 : 600)
  } else await page.waitForTimeout(800)
  await page.screenshot({ path: `${out}/${name}.png`, timeout: 120000 })
  console.log('shot', name)
}
await browser.close()
