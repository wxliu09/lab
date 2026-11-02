// 正式 build 冒煙測試：兩個分頁（BroadcastChannel）建房、加入、開局，雙方都要進到遊戲並看到畫面
// 用法：npx vite preview --outDir ../play --port 4179，然後 node tests/visual/smoke.mjs（XC_URL 可改網址）
import { chromium } from 'playwright'
const URL = (process.env.XC_URL ?? 'http://localhost:4179/') + '?net=bc'
const S = '/tmp/claude-0/-home-user-lab/4aa10dde-7709-503b-a621-f6f68d84088a/scratchpad'
const browser = await chromium.launch({ args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'] })
const ctx = await browser.newContext({ viewport: { width: 1280, height: 720 } })
await ctx.addInitScript(() => {
  try {
    localStorage.setItem('xc.quality', 'low')
  } catch {
    /* ignore */
  }
})
ctx.setDefaultTimeout(90000)
const errs = []
const open = async (name) => {
  const p = await ctx.newPage()
  p.on('pageerror', (e) => errs.push(name + ' ' + e.message + ' @ ' + (e.stack ?? '').split('\n').slice(0, 2).join(' ')))
  p.on('console', (m) => { if (m.type() === 'error') errs.push(name + ' console ' + m.text().slice(0, 200)) })
  p.on('worker', (w) => w.on('console', (m) => errs.push(name + ' worker ' + m.text().slice(0, 200))))
  await p.goto(URL)
  await p.getByTestId('name').fill(name)
  console.log('opened', name)
  return p
}
const host = await open('Host')
await host.getByTestId('create').click()
await host.getByTestId('lobby').waitFor()
const code = (await host.getByTestId('roomcode').textContent()).trim()
const guest = await open('Guest')
await guest.getByTestId('code').fill(code)
await guest.getByTestId('join').click()
await guest.getByTestId('lobby').waitFor()
console.log('both in lobby')
await host.getByTestId('start').click()
await host.waitForTimeout(15000)
for (const [n, p] of [['host', host], ['guest', guest]]) console.log('STATE', n, JSON.stringify((await p.evaluate(() => document.body.innerText)).slice(0, 160)))
console.log('errors so far', JSON.stringify(errs))
for (const p of [host, guest]) await p.getByTestId('game').waitFor()
console.log('both in game')
await host.waitForTimeout(8000)
for (const [n, p] of [['host', host], ['guest', guest]]) {
  const r = p.getByTestId('reveal')
  if (await r.isVisible().catch(() => false)) await r.click()
  await p.waitForTimeout(2500)
  await p.screenshot({ path: `${S}/smoke-${n}.png`, timeout: 120000 })
  console.log(n, 'screenshot saved')
}
console.log('errors', JSON.stringify(errs))
await browser.close()
