// 截圖自評用：node tests/visual/shots.mjs <outDir> [quality]
import { chromium } from 'playwright'
const out = process.argv[2] ?? '.'
const q = process.argv[3] ?? 'high'
const base = process.env.XC_URL ?? 'http://localhost:4173/'
const browser = await chromium.launch({ args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'] })
const page = await browser.newPage({ viewport: { width: 1600, height: 900 } })
page.on('console', (m) => { if (m.type() === 'error' || m.type() === 'warning') console.log('[console]', m.type(), m.text().slice(0, 300)) })
page.on('pageerror', (e) => console.log('[pageerror]', e.message))
await page.addInitScript((q) => localStorage.setItem('xc.quality', q), q)
await page.goto(base + '?net=bc')
await page.waitForTimeout(2500)
await page.screenshot({ path: `${out}/menu.png` })
await page.getByTestId('name').fill('Alice')
await page.getByTestId('create').click()
await page.getByTestId('lobby').waitFor({ timeout: 20000 })
await page.waitForTimeout(500)
await page.screenshot({ path: `${out}/lobby.png` })
await page.getByTestId('start').click()
await page.waitForTimeout(9000)
await page.screenshot({ path: `${out}/game.png`, timeout: 120000 })
// 視角點位（開全圖視野，方便檢查美術）
if (process.env.XC_REVEAL) await page.evaluate(() => window.__xcTest.hook('vision', [0, true]))
const spots = process.env.XC_SPOTS ? JSON.parse(process.env.XC_SPOTS) : []
for (const [name, x, y, zoom] of spots) {
  await page.evaluate(([x, y, zoom]) => { const s = window.__xcScene; s.rts.jump(x, y); s.rts.zoom = zoom; }, [x, y, zoom])
  await page.waitForTimeout(3000)
  await page.screenshot({ path: `${out}/spot-${name}.png`, timeout: 120000 })
}
await browser.close()
