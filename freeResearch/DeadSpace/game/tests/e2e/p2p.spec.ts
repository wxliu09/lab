import { expect, test, chromium } from '@playwright/test'

// 真實 Trystero（Nostr）＋ WebRTC：兩個獨立的瀏覽器 context。需要外網，預設略過：XC_P2P=1 npx playwright test p2p
test.skip(!process.env.XC_P2P, '需要外網連到公共 relay（設定 XC_P2P=1 才跑）')

test('兩個獨立 context 透過 Trystero 進同一房間並開始遊戲', async () => {
  test.setTimeout(300000)
  const proxy = process.env.HTTPS_PROXY ? { server: process.env.HTTPS_PROXY, bypass: 'localhost,127.0.0.1' } : undefined
  const b1 = await chromium.launch({ proxy })
  const b2 = await chromium.launch({ proxy })
  const host = await (await b1.newContext({ ignoreHTTPSErrors: true })).newPage()
  const guest = await (await b2.newContext({ ignoreHTTPSErrors: true })).newPage()
  const base = `http://localhost:${process.env.PW_PORT ?? 4173}/?net=p2p`
  await host.goto(base)
  await host.getByTestId('name').fill('Host')
  await host.getByTestId('create').click()
  await expect(host.getByTestId('lobby')).toBeVisible({ timeout: 30000 })
  const code = (await host.getByTestId('roomcode').textContent())!.trim()
  await guest.goto(base)
  await guest.getByTestId('name').fill('Guest')
  await guest.getByTestId('code').fill(code)
  await guest.getByTestId('join').click()
  await expect(guest.getByTestId('lobby')).toBeVisible({ timeout: 60000 })
  await expect(host.locator('.pcard:not(.empty)')).toHaveCount(2, { timeout: 20000 })
  // 開始遊戲：雙方都要進到遊戲畫面，而且持續收到主機的快照
  await host.getByTestId('start').click()
  for (const p of [host, guest]) await expect(p.getByTestId('game')).toBeVisible({ timeout: 60000 })
  const snaps = () => guest.evaluate(() => (window as unknown as { __xcState: { recvLog: string[] } }).__xcState.recvLog.filter((t) => t === 'snap').length)
  const n0 = await snaps()
  await guest.waitForTimeout(3000)
  expect(await snaps()).toBeGreaterThan(n0 + 10)
  await b1.close()
  await b2.close()
})
