// 本機除錯工具：解鎖流程、只影響本分頁、其他分頁收不到任何東西
import { expect, test, type Page } from '@playwright/test'

const K = Buffer.from('d3hsaXUwOQ==', 'base64').toString()

type W = Window & Record<string, unknown>

function watch(page: Page): string[] {
  const out: string[] = []
  page.on('console', (m) => out.push(m.text()))
  return out
}

async function open(page: Page, name: string) {
  await page.goto('./?net=bc', { waitUntil: 'domcontentloaded' })
  await page.getByTestId('name').fill(name)
}

async function globals(page: Page) {
  return page.evaluate(() => [typeof (window as unknown as W).help, typeof (window as unknown as W).xc])
}

/** 焦點不在輸入框時鍵入 */
async function typeOnPage(page: Page, text: string) {
  await page.evaluate(() => (document.activeElement as HTMLElement | null)?.blur())
  await page.keyboard.type(text, { delay: 15 })
}

async function recv(page: Page): Promise<string[]> {
  return page.evaluate(() => [...((window as unknown as { __xcState: { recvLog: string[] } }).__xcState.recvLog)])
}

test('解鎖只對本機分頁生效；其他分頁沒有收到任何訊息、畫面沒有變化', async ({ browser }) => {
  // SwiftShader 下三個分頁同時渲染很慢
  test.setTimeout(600000)
  const ctx = await browser.newContext()
  // 三個分頁同時渲染：用最低畫質
  await ctx.addInitScript(() => {
    try {
      localStorage.setItem('xc.quality', 'low')
    } catch {
      /* ignore */
    }
  })
  const host = await ctx.newPage()
  const hostLog = watch(host)
  await open(host, 'Alice')
  await host.getByTestId('create').click()
  await expect(host.getByTestId('lobby')).toBeVisible({ timeout: 15000 })
  const code = (await host.getByTestId('roomcode').textContent())!.trim()

  const bob = await ctx.newPage()
  const bobLog = watch(bob)
  await open(bob, 'Bob')
  const cara = await ctx.newPage()
  const caraLog = watch(cara)
  await open(cara, 'Cara')

  // 未解鎖：沒有任何全域、沒有輸出
  for (const p of [host, bob, cara]) expect(await globals(p)).toEqual(['undefined', 'undefined'])
  expect(await bob.evaluate(() => { try { return eval('help()') } catch (e) { return (e as Error).name } })).toBe('ReferenceError')

  // 主選單：在輸入框裡打暗號不會解鎖
  await bob.getByTestId('name').click()
  await bob.keyboard.type(K, { delay: 15 })
  expect(await globals(bob)).toEqual(['undefined', 'undefined'])
  await bob.getByTestId('name').fill('Bob')
  // 主選單：焦點不在輸入框時解鎖
  await typeOnPage(bob, K.toUpperCase())
  await expect.poll(() => globals(bob)).toEqual(['function', 'object'])
  expect(bobLog).toContain('ok')
  await bob.evaluate(() => (window as unknown as { xc: { lock(): Promise<unknown> } }).xc.lock())
  expect(await globals(bob)).toEqual(['undefined', 'undefined'])

  // 大廳
  for (const p of [bob, cara]) {
    await p.getByTestId('code').fill(code)
    await p.getByTestId('join').click()
    await expect(p.getByTestId('lobby')).toBeVisible({ timeout: 15000 })
  }
  await typeOnPage(bob, K)
  await expect.poll(() => globals(bob)).toEqual(['function', 'object'])
  await bob.evaluate(() => (window as unknown as { xc: { lock(): Promise<unknown> } }).xc.lock())

  // 開局
  for (const p of [bob, cara]) await p.getByTestId('ready').click()
  await host.getByTestId('start').click()
  for (const p of [host, bob, cara]) await expect(p.getByTestId('game')).toBeVisible({ timeout: 20000 })
  await bob.waitForTimeout(1500)

  // 對局中：在聊天框打暗號不會解鎖、也不會送出任何東西
  const hostRecv0 = (await recv(host)).filter((t) => t === 'chat').length
  await bob.keyboard.press('Enter')
  await expect(bob.getByTestId('chatinput')).toBeVisible()
  await bob.keyboard.type(K, { delay: 15 })
  await bob.keyboard.press('Escape')
  expect(await globals(bob)).toEqual(['undefined', 'undefined'])
  await bob.waitForTimeout(600)
  expect((await recv(host)).filter((t) => t === 'chat').length).toBe(hostRecv0)

  // 對局中解鎖（字母照常觸發快捷鍵）
  await typeOnPage(bob, K)
  await expect.poll(() => globals(bob)).toEqual(['function', 'object'])

  // 從這裡開始記錄其他分頁收到的東西
  const hostLogN = hostLog.length
  const caraLogN = caraLog.length
  const caraRecvN = (await recv(cara)).length
  const hostChat = await host.getByTestId('chatlog').innerText()
  const caraChat = await cara.getByTestId('chatlog').innerText()

  // help() 與 --help
  const bobN = bobLog.length
  await bob.evaluate(() => (window as unknown as { help: () => void }).help())
  await bob.evaluate('--help')
  await bob.evaluate(() => {
    ;(window as unknown as W).help = 1
  })
  expect(await globals(bob)).toEqual(['function', 'object'])
  expect(bobLog.length).toBeGreaterThan(bobN + 4)

  // 一般玩家的指令經網路，結果只回給自己
  const res = await bob.evaluate(async () => {
    const xc = (window as unknown as { xc: Record<string, (...a: unknown[]) => Promise<unknown>> }).xc
    const s = await xc.status()
    const p = await xc.players()
    const m = await xc.mapHack(true)
    const bad = await xc.give('no-such-item', 'me', 1)
    return { s, p, m, bad }
  })
  expect(Array.isArray(res.p)).toBe(true)
  expect((res.p as unknown[]).length).toBe(3)
  expect(bobLog.some((l) => l.includes('…'))).toBe(true)
  await bob.waitForTimeout(800)

  // 主機與其他玩家：Console 沒有輸出、沒有收到回應、聊天與畫面沒有變化
  expect(hostLog.slice(hostLogN)).toEqual([])
  expect(caraLog.slice(caraLogN)).toEqual([])
  const caraNew = (await recv(cara)).slice(caraRecvN)
  expect(caraNew.filter((t) => t !== 'snap' && t !== 'pong')).toEqual([])
  expect(await host.getByTestId('chatlog').innerText()).toBe(hostChat)
  expect(await cara.getByTestId('chatlog').innerText()).toBe(caraChat)
  for (const p of [host, cara]) expect(await globals(p)).toEqual(['undefined', 'undefined'])

  // 鎖回去
  await bob.evaluate(() => (window as unknown as { xc: { lock(): Promise<unknown> } }).xc.lock())
  expect(await globals(bob)).toEqual(['undefined', 'undefined'])
  await ctx.close()
})
