// 遊戲內指引：目標面板、G 開關說明、情境提示可點掉且每台瀏覽器只出現一次、收合狀態記住
import { expect, test, type Page } from '@playwright/test'

async function startSolo(page: Page): Promise<void> {
  await page.goto('./?net=bc', { waitUntil: 'domcontentloaded' })
  await page.getByTestId('name').fill('Alice')
  await page.getByTestId('create').click()
  await expect(page.getByTestId('lobby')).toBeVisible({ timeout: 30000 })
  await page.getByTestId('start').click()
  await expect(page.getByTestId('game')).toBeVisible({ timeout: 60000 })
  await expect(page.getByTestId('role')).not.toHaveText('', { timeout: 30000 })
}

/** 關掉角色揭露（點背景；不要按 Esc，Esc 會打開進化選單）。SwiftShader 下開局很慢，揭露畫面可能已經自動關了 */
async function closeReveal(page: Page): Promise<void> {
  const r = page.getByTestId('reveal')
  if (await r.isVisible()) await r.click({ timeout: 5000 }).catch(() => {})
  await expect(r).toHaveCount(0, { timeout: 35000 })
}

test('目標面板、說明面板、情境提示', async ({ page }) => {
  test.setTimeout(300000)
  const errors: string[] = []
  page.on('pageerror', (e) => errors.push(e.message))
  await page.addInitScript(() => {
    try {
      localStorage.setItem('xc.quality', 'low')
    } catch {
      /* ignore */
    }
  })
  await startSolo(page)

  // 目標面板常駐左上，顯示身分與目標
  const obj = page.getByTestId('guide-objectives')
  await expect(obj).toBeVisible({ timeout: 20000 })
  await expect(page.getByTestId('guide-role')).not.toHaveText('')
  await expect(obj.locator('.guide-goal')).toBeVisible()
  // 「現在該做什麼」至少一條（提示放不下時會暫時隱藏，所以只看 DOM）
  await expect(obj.locator('.guide-steps li')).not.toHaveCount(0)
  const box = (await obj.boundingBox())!
  expect(box.x).toBeLessThan(20)
  expect(box.y).toBeLessThan(20)

  // 角色揭露蓋著時不出提示（同一瞬間檢查兩者）；關掉後才出現
  for (let i = 0; i < 6; i++) {
    const st = await page.evaluate(() => ({ reveal: !!document.querySelector('[data-testid="reveal"]'), toast: !!document.querySelector('.guide-toast') }))
    if (!st.reveal) break
    expect(st.toast).toBe(false)
    await page.waitForTimeout(300)
  }
  await closeReveal(page)
  // 開局會排一串提示（基本操作、常用按鍵…）：取第一則。滑鼠停在上面時不倒數，避免剛好到期
  const first = page.locator('.guide-toast').first()
  await expect(first).toBeVisible({ timeout: 20000 })
  await first.hover()
  const tid = (await first.getAttribute('data-testid'))!
  const hid = tid.replace('guide-toast-', '')
  // 同時最多 2 則（版面放不下時先顯示 1 則）
  expect(await page.locator('.guide-toast').count()).toBeLessThanOrEqual(2)
  // 點一下就關掉，不會再回來
  const toast = page.getByTestId(tid)
  await toast.click()
  await expect(toast).toHaveCount(0)
  await page.mouse.move(800, 400)
  await page.waitForTimeout(1000)
  await expect(toast).toHaveCount(0)
  expect(await page.evaluate(() => JSON.parse(localStorage.getItem('xc.hints.seen') ?? '[]'))).toContain(hid)

  // G 開關說明面板
  const help = page.getByTestId('guide-help')
  await page.keyboard.press('KeyG')
  await expect(help).toBeVisible()
  await expect(page.getByTestId('guide-help-role')).toBeVisible()
  await page.keyboard.press('KeyG')
  await expect(help).toHaveCount(0)
  // Esc 只關說明，不會順便打開進化選單
  await page.keyboard.press('KeyG')
  await expect(help).toBeVisible()
  await page.keyboard.press('Escape')
  await expect(help).toHaveCount(0)
  await page.waitForTimeout(300)
  await expect(page.locator('.modal-back')).toHaveCount(0)
  // 面板上的「說明」按鈕也能開，關閉鈕可以關
  await page.getByTestId('guide-help-btn').click()
  await expect(help).toBeVisible()
  await page.getByTestId('guide-help-close').click()
  await expect(help).toHaveCount(0)
  // 聊天輸入時按 G 不會開說明
  await page.keyboard.press('Enter')
  await expect(page.getByTestId('chatinput')).toBeFocused()
  await page.keyboard.press('KeyG')
  await expect(help).toHaveCount(0)
  await page.keyboard.press('Escape')

  // 收合
  await page.getByTestId('guide-fold').click()
  await expect(obj).toHaveClass(/folded/)
  await expect(obj.locator('.guide-steps')).toHaveCount(0)

  // 重整後再開一局：同一則提示不會再出現，收合狀態保留
  await page.reload({ waitUntil: 'domcontentloaded' })
  await startSolo(page)
  await closeReveal(page)
  await expect(page.getByTestId('guide-objectives')).toHaveClass(/folded/)
  for (let i = 0; i < 8; i++) {
    await expect(page.getByTestId(tid)).toHaveCount(0)
    await page.waitForTimeout(500)
  }
  // 展開回來
  await page.getByTestId('guide-fold').click()
  await expect(page.getByTestId('guide-objectives')).not.toHaveClass(/folded/)
  expect(errors).toEqual([])
})
