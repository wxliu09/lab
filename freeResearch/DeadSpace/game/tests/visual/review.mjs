// 視覺審查截圖（美術聖經 §15）：node tests/visual/review.mjs <outDir> [quality] [stations…]
// 需要先 build e2e 版並開 preview（XC_URL 預設 http://localhost:4173/）
import { chromium } from 'playwright'
const out = process.argv[2] ?? '.'
const q = process.argv[3] ?? 'medium'
const only = process.argv.slice(4)
const base = process.env.XC_URL ?? 'http://localhost:4173/'
const STATIONS = only.length ? only : ['nyx', 'adjudicatrix', 'tenshu', 'hulk7', 'bravado', 'caldera', 'vivarium', 'portage', 'verdance', 'cinder']
const browser = await chromium.launch({ args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'] })
const page = await browser.newPage({ viewport: { width: 1600, height: 900 } })
page.on('pageerror', (e) => console.log('[pageerror]', e.message))
page.on('console', (m) => {
  if (m.type() === 'error') console.log('[console]', m.text().slice(0, 200))
})
await page.addInitScript((q) => localStorage.setItem('xc.quality', q), q)
await page.goto(base + '?net=bc')
await page.waitForTimeout(3000)
await page.screenshot({ path: `${out}/01-menu.png`, timeout: 120000 })
await page.getByTestId('codex-open').click()
await page.waitForTimeout(800)
await page.screenshot({ path: `${out}/02-codex.png`, timeout: 120000 })
await page.keyboard.press('Escape')
await page.getByTestId('name').fill('Alice')
await page.getByTestId('create').click()
await page.getByTestId('lobby').waitFor({ timeout: 30000 })
await page.waitForTimeout(800)
await page.screenshot({ path: `${out}/03-lobby.png`, timeout: 120000 })
await page.getByTestId('start').click()
// SwiftShader＋高負載時開局可能很慢：輪詢畫面狀態，必要時再按一次開始
for (let i = 0; i < 3; i++) {
  try {
    await page.waitForFunction(() => window.__xcState?.screen?.value === 'game', null, { timeout: 60000 })
    break
  } catch {
    if (await page.getByTestId('start').isVisible()) await page.getByTestId('start').click()
  }
}
await page.waitForTimeout(9000)
await page.screenshot({ path: `${out}/04-start.png`, timeout: 120000 })
// 關掉角色揭露（點一下背景；不要按 Esc，Esc 會打開進化選單）
if (await page.getByTestId('reveal').isVisible()) await page.getByTestId('reveal').click()
await page.evaluate(() => window.__xcTest.hook('vision', [0, true]))
for (const st of STATIONS) {
  await page.evaluate((st) => window.__xcTest.hook('run', [0, 'we', [st]]), st)
  await page.waitForTimeout(2500)
  // 鏡頭對準自己（傳送後畫面才會跟上）
  await page.evaluate(() => {
    const s = window.__xcScene
    const u = s.myUnit()
    if (u) s.rts.jump(u.x, u.y)
  })
  await page.waitForTimeout(3000)
  await page.screenshot({ path: `${out}/10-${st}.png`, timeout: 180000 })
}
// 太空
await page.evaluate(() => {
  const s = window.__xcScene
  s.viewOverride = () => ({ id: 0, zone: 0, x: 0, y: 0 })
})
await page.waitForTimeout(5000)
await page.screenshot({ path: `${out}/20-space.png`, timeout: 180000 })
await browser.close()
