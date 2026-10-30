import { expect, test, type Page } from '@playwright/test'

async function open(page: Page, name: string) {
  await page.goto('./?net=bc')
  await page.getByTestId('name').fill(name)
}

test('4 個分頁：建房、加入、改名、選色、準備、開始', async ({ browser }) => {
  const ctx = await browser.newContext()
  const host = await ctx.newPage()
  await open(host, 'Alice')
  await host.getByTestId('create').click()
  await expect(host.getByTestId('lobby')).toBeVisible({ timeout: 15000 })
  const code = (await host.getByTestId('roomcode').textContent())!.trim()
  expect(code).toMatch(/^[A-Z0-9]{5}$/)

  const others: Page[] = []
  for (const n of ['Bob', 'Cara', 'Dan']) {
    const p = await ctx.newPage()
    await open(p, n)
    await p.getByTestId('code').fill(code)
    await p.getByTestId('join').click()
    await expect(p.getByTestId('lobby')).toBeVisible({ timeout: 15000 })
    others.push(p)
  }
  // 每個人都看得到 4 張玩家卡
  for (const p of [host, ...others]) await expect(p.locator('.pcard:not(.empty)')).toHaveCount(4, { timeout: 10000 })
  // 準備
  for (const p of others) await p.getByTestId('ready').click()
  await expect(host.locator('.tag.ready')).toHaveCount(3, { timeout: 10000 })
  // 開始
  await host.getByTestId('start').click()
  for (const p of [host, ...others]) {
    await expect(p.getByTestId('game')).toBeVisible({ timeout: 15000 })
    await expect(p.getByTestId('role')).not.toHaveText('', { timeout: 15000 })
  }
  await ctx.close()
})
