// 站點截圖自評：node tests/visual/stations.mjs <outDir> <spots.json> [quality]
// spots.json：{ "<stationId>": [[name, x, y, zoom], ...], ... }（x, y 為站內公尺座標，y 向上）
// 主機玩家用測試掛勾傳送到該站（we），再開全區視野（vision）。需先 build --mode e2e 並開 preview。
import { chromium } from 'playwright'
import { readFileSync } from 'node:fs'

const out = process.argv[2] ?? '.'
const spots = JSON.parse(readFileSync(process.argv[3], 'utf8'))
const q = process.argv[4] ?? 'medium'
const base = process.env.XC_URL ?? 'http://localhost:4173/'
const browser = await chromium.launch({ args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'] })
const page = await browser.newPage({ viewport: { width: 1600, height: 900 } })
page.on('console', (m) => {
  if (m.type() === 'error') console.log('[console]', m.type(), m.text().slice(0, 300))
})
page.on('pageerror', (e) => console.log('[pageerror]', e.message))
await page.addInitScript((q) => localStorage.setItem('xc.quality', q), q)
await page.goto(base + '?net=bc')
await page.waitForTimeout(2000)
await page.getByTestId('name').fill('Alice')
await page.getByTestId('create').click()
await page.getByTestId('lobby').waitFor({ timeout: 20000 })
await page.waitForTimeout(300)
// 依人數啟用的站（火口號、活體庫號、擺渡號）在大廳指定開啟；事件站（未識別物體、海盜船）開局後用事件掛勾叫出來
await page.evaluate(() => window.__xcTest.hook('settings', [{ stations: ['caldera', 'vivarium', 'portage'] }]))
await page.waitForTimeout(300)
await page.getByTestId('start').click()
await page.waitForTimeout(6000)
// 截圖只看場景：藏起 HUD、迷霧改成全亮（vision 掛勾只影響伺服器端可見性，client 迷霧照樣算）
await page.addStyleTag({ content: '* { visibility: hidden !important } canvas { visibility: visible !important }' })
await page.evaluate(() => {
  const s = window.__xcScene
  const f = [...s.fogs.values()][0]
  if (!f) return
  const proto = Object.getPrototypeOf(f)
  const orig = proto.update
  proto.update = function (a, b) {
    return orig.call(this, a, b, true)
  }
})
const EVENT = { uo: 'wormhole', pirate: 'pirate' }
for (const [id, list] of Object.entries(spots)) {
  if (EVENT[id]) {
    const e = await page.evaluate((ev) => window.__xcTest.hook('run', [0, 'ua', [ev]]), EVENT[id])
    console.log('event', EVENT[id], JSON.stringify(e).slice(0, 120))
    await page.waitForTimeout(1500)
  }
  const r = await page.evaluate((id) => window.__xcTest.hook('run', [0, 'we', [id]]), id)
  console.log('teleport', id, JSON.stringify(r).slice(0, 120))
  await page.evaluate(() => window.__xcTest.hook('vision', [0, true]))
  await page.waitForTimeout(2500)
  for (const [name, x, y, zoom] of list) {
    // SwiftShader 一幀要好幾秒：直接設好鏡頭與縮放、強制下一幀重排燈光池，再等幾幀
    await page.evaluate(
      ([x, y, zoom]) => {
        const s = window.__xcScene
        s.rts.jump(x, y)
        s.rts.zoom = zoom
        s.rts.zs = zoom
        s.lightT = 0
      },
      [x, y, zoom],
    )
    for (let i = 0; i < 3; i++) await page.evaluate(() => new Promise((r) => requestAnimationFrame(() => r(null))))
    await page.waitForTimeout(500)
    const t0 = Date.now()
    await page.screenshot({ path: `${out}/${id}-${name}.png`, timeout: 180000 })
    console.log('shot', id, name, Date.now() - t0, 'ms')
  }
}
await browser.close()
