// 線上版驗證：兩個獨立瀏覽器經真實 Trystero／Nostr 建房、加入、開局（需要外網）。node tests/visual/live.mjs [網址]
import { chromium } from 'playwright'
const base = process.argv[2] ?? 'https://wxliu09.github.io/lab/freeResearch/DeadSpace/play/index.html'
const proxy = process.env.HTTPS_PROXY ? { server: process.env.HTTPS_PROXY, bypass: 'localhost,127.0.0.1' } : undefined
const args = ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist']
const b1 = await chromium.launch({ proxy, args })
const b2 = await chromium.launch({ proxy, args })
const mk = async (b) => { const c = await b.newContext({ ignoreHTTPSErrors: true, viewport: { width: 1280, height: 720 } }); await c.addInitScript(() => { try { localStorage.setItem('xc.quality', 'low') } catch { /* */ } }); c.setDefaultTimeout(240000); return c.newPage() }
const host = await mk(b1)
const guest = await mk(b2)
const wsFail = { host: 0, guest: 0 }
host.on('console', (m) => { if (/WebSocket connection .* failed/.test(m.text())) wsFail.host++ })
guest.on('console', (m) => { if (/WebSocket connection .* failed/.test(m.text())) wsFail.guest++ })
await host.goto(base, { waitUntil: 'domcontentloaded' })
await host.getByTestId('name').fill('Host')
await host.getByTestId('create').click()
await host.getByTestId('lobby').waitFor()
const code = (await host.getByTestId('roomcode').textContent()).trim()
console.log('room', code)
await guest.goto(base, { waitUntil: 'domcontentloaded' })
await guest.getByTestId('name').fill('Guest')
await guest.getByTestId('code').fill(code)
await guest.getByTestId('join').click()
await guest.getByTestId('lobby').waitFor()
console.log('guest in lobby')
await host.getByTestId('start').click()
for (const p of [host, guest]) await p.getByTestId('game').waitFor()
console.log('both in game')
const t1 = await guest.evaluate(() => document.querySelector('[data-testid=game]')?.textContent?.slice(0, 40))
await guest.waitForTimeout(6000)
const t2 = await guest.evaluate(() => document.querySelector('[data-testid=game]')?.textContent?.slice(0, 40))
const lost = await guest.evaluate(() => document.body.innerText.includes('Lost connection') || document.body.innerText.includes('失去連線'))
console.log('guest topbar', JSON.stringify(t1), '→', JSON.stringify(t2), 'lost', lost)
await guest.screenshot({ path: (process.env.XC_OUT ?? '.') + '/live-guest.png', timeout: 120000 })
console.log('ws failures', JSON.stringify(wsFail))
await b1.close()
await b2.close()
