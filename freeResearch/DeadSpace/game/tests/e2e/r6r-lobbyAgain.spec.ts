// 第 6 輪（付費玩家第一晚）多人「再來一局」：主機＋客人（BroadcastChannelTransport，同一瀏覽器多分頁）
// 開局 → 結算 → 主機按「回到大廳（同一房號）」→ 兩人一起回到同一個房間的大廳 → 再開一局。
// 一局要真的結算：三人全是人類（異形／變種人／仿生人都關掉），第三個人開局後關掉分頁，斷線寬限（90 秒）到了判定離開、死亡，
// 勝負判定照規則判人類獲勝。順便驗證：離開的人回到大廳後從名單移除、AI 不留在名單上、設定與 AI 難度保留、聊天清空。
import { expect, test, type Page } from '@playwright/test'

// 三個分頁同時跑軟體繪圖很吃 CPU：視窗小一點（大廳、結算畫面在這個大小照樣完整）
test.use({ viewport: { width: 1024, height: 640 } })

type W = {
  __xcState: {
    chatLog: { value: { text: string }[] }
    startInfo: { value: { gid?: number } | null }
    connLost: { value: boolean }
    screen: { value: string }
    recvLog: string[]
    world: { snapCount: number; me: { role?: string }; w: { t?: number; ld?: number } }
    lobby: { value: { players: { connected: boolean }[] } | null }
  }
  __xcTest: { send: (m: unknown) => void }
}

async function open(page: Page, name: string): Promise<void> {
  await page.addInitScript(() => {
    try {
      localStorage.setItem('xc.quality', 'low')
      localStorage.setItem('xc.hints', '0')
    } catch {
      /* ignore */
    }
  })
  await page.goto('./?net=bc', { waitUntil: 'domcontentloaded' })
  await page.getByTestId('name').fill(name)
}

async function join(page: Page, code: string): Promise<void> {
  await page.getByTestId('code').fill(code)
  await page.getByTestId('join').click()
  await expect(page.getByTestId('lobby')).toBeVisible({ timeout: 30000 })
}

/** 開局的身分揭露畫面會蓋住畫面（也蓋住結算後的小列）：確實關掉（同 ux.spec.ts）*/
async function closeReveal(page: Page): Promise<void> {
  const reveal = page.getByTestId('reveal')
  await reveal.waitFor({ timeout: 10000 }).catch(() => {})
  if (await reveal.isVisible()) await reveal.click({ timeout: 5000 }).catch(() => {})
  if (await reveal.isVisible()) await page.keyboard.press('Space')
  await expect(reveal).toHaveCount(0, { timeout: 35000 })
}

/** 進度記錄（機器很忙時用來看時間花在哪裡）*/
const t0 = Date.now()
const mark = (what: string) => console.log(`[r6r ${((Date.now() - t0) / 1000).toFixed(0)}s] ${what}`)

/**
 * 兩邊都連著：客人沒有判定主機失聯，主機的大廳名單上所有人都在線。機器很忙時分頁可能卡超過傳輸層的心跳逾時（10 秒），
 * 單方面判定對方離開；NetClient 會自己重新打招呼（r6r-net.test.ts），這裡等它恢復再操作（失聯期間送的東西會被丟掉）
 */
async function bothConnected(host: Page, guest: Page): Promise<void> {
  await expect.poll(() => guest.evaluate(() => (window as unknown as W).__xcState.connLost.value), { timeout: 60000 }).toBe(false)
  await expect.poll(() => host.evaluate(() => (window as unknown as W).__xcState.lobby.value?.players.every((p) => p.connected) ?? false), { timeout: 60000 }).toBe(true)
}

/** 失敗時看狀態用：畫面、連線、收到幾份快照、最近收到的訊息 */
const diag = (p: Page) =>
  p
    .evaluate(() => {
      const s = (window as unknown as W).__xcState
      return { screen: s.screen.value, connLost: s.connLost.value, snaps: s.world.snapCount, role: s.world.me.role, t: s.world.w.t, ld: s.world.w.ld, gid: s.startInfo.value?.gid, recv: s.recvLog.slice(-30).join(',') }
    })
    .catch((e) => String(e))

const gid = (p: Page) => p.evaluate(() => (window as unknown as W).__xcState.startInfo.value?.gid ?? null)

test('多人再來一局：結算 → 回到大廳（同一房號）→ 再開一局', async ({ browser }) => {
  // 機器很忙時（軟體繪圖、三個分頁）光是開好大廳就可能要好幾分鐘；一局要等斷線寬限 90 秒
  test.setTimeout(1500000)
  const ctx = await browser.newContext()
  const errors: string[] = []
  const host = await ctx.newPage()
  const bob = await ctx.newPage()
  const cara = await ctx.newPage()
  for (const [p, who] of [[host, 'host'], [bob, 'bob'], [cara, 'cara']] as const)
    p.on('pageerror', (e) => {
      errors.push(e.message)
      mark(`pageerror ${who}: ${e.message}`)
    })

  await open(host, 'Alice')
  await host.getByTestId('create').click()
  await expect(host.getByTestId('lobby')).toBeVisible({ timeout: 30000 })
  const code = (await host.getByTestId('roomcode').textContent())!.trim()
  // 新開的多人房：AI 難度預設簡單，主機可以改
  await expect(host.getByTestId('set-ai')).toHaveValue('easy', { timeout: 10000 })
  await expect(host.getByTestId('set-ai')).toBeEnabled()

  await open(bob, 'Bob')
  await join(bob, code)
  await open(cara, 'Cara')
  await join(cara, code)
  // 客人：AI 難度唯讀
  await expect(bob.getByTestId('set-ai')).toHaveValue('easy')
  await expect(bob.getByTestId('set-ai')).toBeDisabled()

  // 全員人類（沒有異類就只能由人類獲勝）、不放 NPC 船員（減輕軟體繪圖的負擔）、1 個 AI 玩家（回到大廳後要重新補位）
  const settings = host.getByTestId('lobby-settings')
  for (let i = 0; i < 3; i++) await settings.locator('select').nth(i).selectOption('0')
  await host.getByTestId('set-npc').selectOption('0')
  await host.evaluate(() => (window as unknown as W).__xcTest.send({ t: 'settings', s: { bots: 1 } }))
  await expect(bob.getByTestId('lobby-settings').locator('input[type=number]').first()).toHaveValue('1', { timeout: 10000 })

  // 開局前在大廳聊一句、準備
  await bothConnected(host, bob)
  await bob.getByTestId('lobby-chat-input').fill('等等見')
  await bob.getByTestId('lobby-chat-input').press('Enter')
  await expect(host.getByTestId('lobby-chat')).toContainText('等等見', { timeout: 10000 })
  await bob.getByTestId('ready').click()
  await expect(host.locator('.tag.ready')).toHaveCount(1, { timeout: 10000 })
  await expect(host.locator('.pcard:not(.empty)')).toHaveCount(3)

  // 第一局。第三個人一開局就離開（關掉分頁，不用等他載入）：寬限 90 秒後判定離開、主單位死亡 → 只剩人類 → 人類獲勝
  mark('lobby ready')
  await host.getByTestId('start').click()
  await expect(cara.getByTestId('game')).toBeVisible({ timeout: 120000 })
  await cara.close()
  mark('start; Cara left')
  for (const p of [host, bob]) await expect(p.getByTestId('game')).toBeVisible({ timeout: 120000 })
  await closeReveal(host)
  const gid1 = await gid(bob)
  expect(gid1).not.toBeNull()
  for (const p of [host, bob]) await expect(p.getByTestId('end')).toBeVisible({ timeout: 420000 })
  mark('game 1 ended')
  await expect(host.getByTestId('end')).toContainText('人類')

  // 客人：說明主機回到大廳時會一起回去，自己沒有「回到大廳」按鈕
  await expect(bob.getByTestId('end-lobby-hint')).toBeVisible()
  await expect(bob.getByTestId('back-to-lobby')).toHaveCount(0)
  // 主機：有「回到大廳（同一房號）」；先按「繼續觀看」關掉結算，上方的小列照樣可以回到大廳
  await expect(host.getByTestId('back-to-lobby')).toBeVisible()
  await expect(host.getByTestId('end-lobby-hint')).toHaveCount(0)
  await host.getByTestId('end').getByText('繼續觀看').click()
  await expect(host.getByTestId('end')).toHaveCount(0)
  // 開局的身分揭露畫面在結算前還沒關掉的話（自動關閉以畫面實際顯示的時間計 30 秒，軟體繪圖一秒才一兩幀時要好幾分鐘），
  // 關掉結算之後它會再出現、蓋住畫面（RoleReveal.tsx 只在 endResult 有值時隱藏；已回報給介面組）：先關掉
  await closeReveal(host)
  await expect(host.getByTestId('end-after')).toBeVisible({ timeout: 10000 })
  await host.getByTestId('end-after').getByTestId('back-to-lobby').click()

  // 兩人一起回到同一個房間的大廳
  mark('back to lobby')
  for (const p of [host, bob]) {
    await expect(p.getByTestId('lobby')).toBeVisible({ timeout: 30000 })
    await expect(p.getByTestId('roomcode')).toHaveText(code)
    // Alice、Bob；離開的 Cara 拿掉，AI 不在名單上（開局時重新補位）
    await expect(p.locator('.pcard:not(.empty)')).toHaveCount(2, { timeout: 10000 })
    await expect(p.locator('.pcard:not(.empty)')).toContainText(['Alice', 'Bob'])
    // 準備清掉、聊天清空（上一局的系統訊息、開局前的對話都不留）
    await expect(p.locator('.tag.ready')).toHaveCount(0)
    await expect(p.getByTestId('lobby-chat')).not.toContainText('等等見')
    await expect(p.getByTestId('lobby-chat')).toContainText('還沒有人說話')
    // 設定保留
    await expect(p.getByTestId('set-ai')).toHaveValue('easy')
    await expect(p.getByTestId('lobby-settings').locator('select').first()).toHaveValue('0')
    await expect(p.getByTestId('lobby-settings').locator('input[type=number]').first()).toHaveValue('1')
    expect(await gid(p)).toBeNull()
  }
  await expect(host.getByTestId('back-to-lobby')).toHaveCount(0)

  // 回到大廳後的聊天照常
  await bothConnected(host, bob)
  await bob.getByTestId('lobby-chat-input').fill('再一局')
  await bob.getByTestId('lobby-chat-input').press('Enter')
  await expect(host.getByTestId('lobby-chat')).toContainText('再一局', { timeout: 10000 })

  // 第二局：新的一局（新的 gid）、聊天從空的開始
  await host.getByTestId('start').click()
  for (const p of [host, bob]) {
    await expect(p.getByTestId('game')).toBeVisible({ timeout: 120000 })
    try {
      await expect(p.getByTestId('role')).not.toHaveText('', { timeout: 180000 })
    } catch (e) {
      mark('diag host ' + JSON.stringify(await diag(host)))
      mark('diag bob ' + JSON.stringify(await diag(bob)))
      throw e
    }
    await expect(p.getByTestId('end')).toHaveCount(0)
    const g2 = await gid(p)
    expect(g2).not.toBeNull()
    expect(g2).not.toBe(gid1)
    const texts = await p.evaluate(() => (window as unknown as W).__xcState.chatLog.value.map((l) => l.text))
    expect(texts.some((x) => x.includes('end.') || x.includes('再一局') || x.includes('等等見'))).toBe(false)
  }
  mark('game 2 started')
  expect(errors).toEqual([])
  await ctx.close()
})
