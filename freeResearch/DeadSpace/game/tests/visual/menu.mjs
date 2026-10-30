// 主選單背景構圖檢查：node tests/visual/menu.mjs <out.png>（XC_URL 指定 preview）
import { chromium } from 'playwright'
const out = process.argv[2]
const base = process.env.XC_URL ?? 'http://localhost:4173/'
const browser = await chromium.launch({ args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'] })
const page = await browser.newPage({ viewport: { width: 1600, height: 900 }, locale: 'zh-TW' })
await page.addInitScript(() => localStorage.setItem('xc.quality', 'medium'))
await page.goto(base + '?net=bc')
await page.waitForTimeout(4000)
await page.screenshot({ path: out, timeout: 120000 })
await browser.close()
