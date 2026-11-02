// 音訊：背景音樂依畫面切換情境、真的有輸出、靜音有效、沒有執行期錯誤
import { expect, test, type Page } from '@playwright/test'

test.use({ launchOptions: { args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist', '--autoplay-policy=no-user-gesture-required'] } })

type A = { __xcAudio: { mood: () => string; state: () => string; level: () => number } }
const audio = (p: Page) => p.evaluate(() => ({ mood: (window as unknown as A).__xcAudio.mood(), state: (window as unknown as A).__xcAudio.state(), level: (window as unknown as A).__xcAudio.level() }))

/** 幾秒內的最大輸出音量（音樂有起伏，取峰值）*/
async function peak(p: Page, ms: number): Promise<number> {
  let m = 0
  for (let t = 0; t < ms; t += 200) {
    m = Math.max(m, (await audio(p)).level)
    await p.waitForTimeout(200)
  }
  return m
}

test('背景音樂：主選單 → 大廳 → 對局；有聲音輸出；靜音後歸零', async ({ page }) => {
  test.setTimeout(240000)
  const errors: string[] = []
  page.on('pageerror', (e) => errors.push(e.message))
  await page.addInitScript(() => {
    try {
      localStorage.setItem('xc.quality', 'low')
    } catch {
      /* ignore */
    }
  })
  await page.goto('./?net=bc', { waitUntil: 'domcontentloaded' })
  await page.getByTestId('name').click()
  await page.getByTestId('name').fill('Alice')
  await expect.poll(async () => (await audio(page)).state, { timeout: 20000 }).toBe('running')
  await expect.poll(async () => (await audio(page)).mood).toBe('menu')
  expect(await peak(page, 4000)).toBeGreaterThan(0.002)

  await page.getByTestId('create').click()
  await expect(page.getByTestId('lobby')).toBeVisible({ timeout: 30000 })
  await expect.poll(async () => (await audio(page)).mood).toBe('lobby')

  await page.getByTestId('start').click()
  await expect(page.getByTestId('game')).toBeVisible({ timeout: 60000 })
  await expect.poll(async () => (await audio(page)).mood, { timeout: 20000 }).toMatch(/explore|tense|combat|alarm/)
  expect(await peak(page, 4000)).toBeGreaterThan(0.002)

  // 靜音
  await page.getByTestId('mute').click()
  await page.waitForTimeout(1200)
  expect(await peak(page, 1500)).toBeLessThan(0.0005)
  expect(errors).toEqual([])
})
