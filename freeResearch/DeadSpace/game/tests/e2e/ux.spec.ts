// 介面體驗：tooltip 在畫面內、離開就收起；邊緣捲動（HUD 上、滑出視窗）；公告橫幅；販賣機面板標題；預設繁中
import { expect, test, type Page } from '@playwright/test'

test.use({ viewport: { width: 1600, height: 900 }, launchOptions: { args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'] } })

type W = {
  __xcScene: { rts: { tx: number; ty: number; jump: (x: number, y: number) => void }; myUnit: () => { x: number; y: number } | null }
  __xcState: { chatLog: { value: unknown[] }; receiveChat: (l: unknown[]) => void; world: { me: { unit?: number; control?: number }; ents: Map<number, { x: number; y: number; s: { i: number; z?: number; x2?: { s?: unknown } } }> } }
  __xcTest: { hook: (op: string, a: unknown[]) => unknown; sendCmd: (c: unknown) => void }
}

async function startGame(page: Page): Promise<void> {
  await page.addInitScript(() => {
    try {
      localStorage.setItem('xc.quality', 'low')
      // 情境提示會蓋住左上角，測試時關掉
      localStorage.setItem('xc.hints', '0')
    } catch {
      /* ignore */
    }
  })
  await page.goto('./?net=bc', { waitUntil: 'domcontentloaded' })
  await page.getByTestId('name').fill('Alice')
  await page.getByTestId('create').click()
  await expect(page.getByTestId('lobby')).toBeVisible({ timeout: 30000 })
  await page.getByTestId('start').click()
  await expect(page.getByTestId('game')).toBeVisible({ timeout: 90000 })
  await page.waitForTimeout(3000)
  // 揭露畫面可能剛好自己關掉：點不到就算了
  if (await page.getByTestId('reveal').isVisible()) await page.getByTestId('reveal').click({ timeout: 5000 }).catch(() => {})
}

const cam = (page: Page) => page.evaluate(() => ({ x: (window as unknown as W).__xcScene.rts.tx, y: (window as unknown as W).__xcScene.rts.ty }))

test('介面：預設繁中、tooltip、邊緣捲動、公告、販賣機面板', async ({ page }) => {
  test.setTimeout(300000)
  const errors: string[] = []
  page.on('pageerror', (e) => errors.push(e.message))
  await startGame(page)

  // 預設繁體中文
  await expect(page.getByTestId('game')).toContainText('星區穩定度')

  // tooltip：在畫面內，移開就收起
  await page.getByTestId('inv-0').hover()
  const tip = page.getByTestId('tooltip')
  await expect(tip).toBeVisible()
  const box = (await tip.boundingBox())!
  expect(box.x).toBeGreaterThanOrEqual(0)
  expect(box.y).toBeGreaterThanOrEqual(0)
  expect(box.x + box.width).toBeLessThanOrEqual(1600)
  expect(box.y + box.height).toBeLessThanOrEqual(900)
  await page.mouse.move(800, 300)
  await page.waitForTimeout(400)
  await expect(tip).toHaveCount(0)

  // 右鍵在 HUD 上（背包格、小地圖、聊天）不跳瀏覽器選單；文字輸入框保留原生選單
  const prevented = await page.evaluate(() => {
    const fire = (el: Element | null) => {
      if (!el) return null
      const ev = new MouseEvent('contextmenu', { bubbles: true, cancelable: true, button: 2 })
      el.dispatchEvent(ev)
      return ev.defaultPrevented
    }
    const input = document.createElement('input')
    document.body.appendChild(input)
    const r = { inv: fire(document.querySelector('[data-testid="inv-0"]')), minimap: fire(document.querySelector('.minimap')), body: fire(document.body), input: fire(input) }
    input.remove()
    return r
  })
  expect(prevented).toEqual({ inv: true, minimap: true, body: true, input: false })

  // 邊緣捲動：滑鼠停在底部（HUD 上）也會往下捲
  await page.evaluate(() => {
    const s = (window as unknown as W).__xcScene
    const u = s.myUnit()
    if (u) s.rts.jump(u.x, u.y + 6)
  })
  let a = await cam(page)
  await page.mouse.move(800, 897)
  await page.waitForTimeout(900)
  let b = await cam(page)
  expect(b.y).toBeLessThan(a.y - 0.5)

  // 從右邊緣滑出視窗：繼續往右捲，直到視窗失焦（先把鏡頭放到地圖中央，免得卡在邊界）
  await page.mouse.move(800, 450)
  await page.evaluate(() => {
    const r = (window as unknown as { __xcScene: { rts: { bounds: { minX: number; maxX: number; minY: number; maxY: number }; jump: (x: number, y: number) => void } } }).__xcScene.rts
    r.jump((r.bounds.minX + r.bounds.maxX) / 2 - 8, (r.bounds.minY + r.bounds.maxY) / 2)
  })
  await page.mouse.move(1590, 450)
  a = await cam(page)
  await page.evaluate(() => window.dispatchEvent(new MouseEvent('mouseout', { relatedTarget: null, bubbles: true })))
  await page.waitForTimeout(900)
  b = await cam(page)
  expect(b.x).toBeGreaterThan(a.x + 0.5)
  await page.evaluate(() => window.dispatchEvent(new Event('blur')))
  await page.waitForTimeout(200)
  a = await cam(page)
  await page.waitForTimeout(600)
  b = await cam(page)
  expect(Math.abs(b.x - a.x)).toBeLessThan(0.05)
  await page.mouse.move(800, 300)

  // Esc：遊戲選單（不再直接打開進化選單）；再按 Esc 關閉
  await page.keyboard.press('Escape')
  await expect(page.getByTestId('game-menu')).toBeVisible()
  await expect(page.getByTestId('leave-game')).toBeVisible()
  await page.keyboard.press('Escape')
  await expect(page.getByTestId('game-menu')).toHaveCount(0)
  await expect(page.locator('.modal-back')).toHaveCount(0)
  // 設定視窗整個在畫面內，Esc 關得掉
  await page.getByTestId('settings-open').click()
  const mb = (await page.locator('.modal').boundingBox())!
  expect(mb.y).toBeGreaterThanOrEqual(0)
  expect(mb.y + mb.height).toBeLessThanOrEqual(900)
  await page.keyboard.press('Escape')
  await expect(page.locator('.modal')).toHaveCount(0)
  // V：進化選單
  await page.keyboard.press('KeyV')
  await expect(page.locator('.modal-back')).toHaveCount(1)
  await page.keyboard.press('KeyV')
  await expect(page.locator('.modal-back')).toHaveCount(0)
  // 小地圖懸停：顯示房間名稱
  const mm = (await page.locator('.minimap canvas').boundingBox())!
  let roomTip = false
  for (const [fx, fy] of [[0.3, 0.4], [0.5, 0.5], [0.7, 0.3], [0.2, 0.7], [0.6, 0.7]]) {
    await page.mouse.move(mm.x + mm.width * fx, mm.y + mm.height * fy)
    await page.waitForTimeout(250)
    if (await page.getByTestId('tooltip').count()) {
      roomTip = true
      break
    }
  }
  expect(roomTip).toBe(true)
  await page.mouse.move(800, 300)

  // 冷卻：用掉一個不需要目標的技能，圖示變灰、出現秒數，而且秒數會往下數
  const abId = await page.evaluate(() => {
    const w = (window as unknown as { __xcState: { world: { me: { abilities?: { id: string; cd: number; maxCd: number }[] } } } }).__xcState.world
    const ok = (w.me.abilities ?? []).find((a) => a.cd <= 0 && a.maxCd >= 3 && document.querySelector(`[data-testid="ab-${a.id}"]`))
    return ok?.id ?? null
  })
  if (abId) {
    await page.evaluate((id) => (window as unknown as W).__xcTest.sendCmd({ k: 'cast', a: id }), abId)
    const slot = page.getByTestId('ab-' + abId)
    const cooling = await slot.locator('.cd-num').waitFor({ timeout: 8000 }).then(() => true, () => false)
    if (cooling) {
      await expect(slot).toHaveClass(/cooling/)
      const a1 = Number(await slot.locator('.cd-num').innerText())
      await page.waitForTimeout(1200)
      const a2 = await slot.locator('.cd-num').count() ? Number(await slot.locator('.cd-num').innerText()) : 0
      expect(a2).toBeLessThan(a1)
    }
  }

  // 公告：全場事件放大顯示在上方中央
  await page.evaluate(() => {
    const s = (window as unknown as W).__xcState
    // 先塞滿 200 行（聊天紀錄的上限），確認之後的公告照樣出現
    s.receiveChat(Array.from({ length: 210 }, (_, i) => ({ from: 'Bob', color: 1, ch: 'all', text: 'x' + i, time: 0 })))
    s.receiveChat([{ from: '', color: -1, ch: 'sys', text: '@event.pirate', time: 0 }])
  })
  await expect(page.getByTestId('announce')).toBeVisible()
  await expect(page.getByTestId('announce')).toContainText('事件')

  // 販賣機面板：有標題
  await page.evaluate(() => (window as unknown as W).__xcTest.hook('vision', [0, true]))
  await page.evaluate(() => (window as unknown as W).__xcTest.hook('run', [0, 'we', ['nyx']]))
  await page.waitForTimeout(2500)
  const vid = await page.evaluate(() => {
    const w = (window as unknown as W).__xcState.world
    const me = w.ents.get((w.me.control ?? w.me.unit)!)
    let best = 0
    let bd = 1e9
    for (const e of w.ents.values()) {
      if (!me || e.s.z !== me.s.z || typeof e.s.x2?.s !== 'string') continue
      const d = Math.hypot(e.x - me.x, e.y - me.y)
      if (d < bd) {
        bd = d
        best = e.s.i
      }
    }
    return best
  })
  expect(vid).toBeTruthy()
  await page.evaluate((id) => (window as unknown as W).__xcTest.sendCmd({ k: 'interact', e: id }), vid)
  await expect(page.getByTestId('vendor')).toBeVisible({ timeout: 60000 })
  const title = await page.getByTestId('vendor').locator('h3').innerText()
  expect(title.trim().length).toBeGreaterThan(0)
  expect(title).not.toContain('vendor.')
  expect(errors).toEqual([])
})
