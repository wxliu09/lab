// 第 8 輪 U8：大廳在 1280×720 放得下（主機一個人、主機＋客人；客人的唯讀標示取代一鍵設定按鈕與說明行），
// 主機的加選（小隊地圖、老手節奏）與「死者看見真實身分」同步到客人；本季戰績（這台電腦的紀錄）與重設
import { expect, test, type Page } from '@playwright/test'

/** 一季戰績的存檔（client/seasonStats.ts 的格式；名字和這個測試的玩家一樣）*/
function seed(now: number): string {
  const by = (h: number[], x: number[], m: number[], a: number[]) => ({
    human: h,
    xeno: x,
    mutant: m,
    android: a,
  })
  const p = (name: string, g: number, w: number, streak: number) => ({
    name,
    at: now,
    season: { g, w, by: by([g - 2, w - 1], [1, 1], [1, 0], [0, 0]) },
    night: { id: 2, g: 2, w: 1, by: by([1, 0], [1, 1], [0, 0], [0, 0]) },
    streak,
  })
  return JSON.stringify({
    v: 1,
    since: now - 7 * 86400e3,
    games: 9,
    night: 2,
    nightGames: 2,
    lastAt: now - 60e3,
    players: { alice: p('Alice', 9, 5, 2), bob: p('Bob', 8, 3, -2) },
    seen: ['g1'],
    last: {
      at: now - 60e3,
      n: 9,
      winner: 'xeno',
      duration: 1600,
      lineup: [
        { name: 'Alice', role: 'xeno', spawn: false, won: true, bot: false },
        { name: 'Bob', role: 'human', spawn: false, won: false, bot: false },
      ],
    },
  })
}

async function open(page: Page, name: string, season?: string): Promise<void> {
  await page.addInitScript((s) => {
    try {
      localStorage.setItem('xc.quality', 'low')
      localStorage.setItem('xc.hints', '0')
      if (s && !sessionStorage.getItem('r8u.seeded')) {
        localStorage.setItem('xc.season', s)
        sessionStorage.setItem('r8u.seeded', '1')
      }
    } catch {
      /* ignore */
    }
  }, season ?? '')
  await page.goto('./?net=bc', { waitUntil: 'domcontentloaded' })
  await page.getByTestId('name').fill(name)
}

/**
 * 房間設定欄放不放得下：over = scrollHeight − clientHeight（要 ≤ 0）；slack = 最後一列的底到內容區底部還剩幾 CSS px（要 ≥ 1）。
 * 介面有 CSS zoom：getBoundingClientRect 是縮放後的，除回去
 */
const settingsFit = (page: Page) =>
  page.evaluate(() => {
    const el = document.querySelector('[data-testid=lobby-settings]') as HTMLElement
    const cs = getComputedStyle(el)
    const r = el.getBoundingClientRect()
    const z = r.height / el.offsetHeight
    const last = el.lastElementChild!.getBoundingClientRect()
    const inner = r.bottom - (parseFloat(cs.borderBottomWidth) + parseFloat(cs.paddingBottom)) * z
    return {
      over: el.scrollHeight - el.clientHeight,
      slack: Math.round(((inner - last.bottom) / z) * 10) / 10,
    }
  })

async function expectFits(page: Page, who: string): Promise<void> {
  await expect.poll(async () => (await settingsFit(page)).over, { message: who }).toBeLessThanOrEqual(0)
  const f = await settingsFit(page)
  expect(f.slack, `${who} ${JSON.stringify(f)}`).toBeGreaterThanOrEqual(1)
  // 整頁不捲動
  expect(await page.evaluate(() => document.documentElement.scrollHeight <= innerHeight && document.documentElement.scrollWidth <= innerWidth)).toBe(true)
}

test('大廳 1280×720：設定欄放得下、加選同步、本季戰績與重設', async ({ browser }) => {
  test.setTimeout(400000)
  const ctx = await browser.newContext({ viewport: { width: 1280, height: 720 } })
  const errors: string[] = []
  const host = await ctx.newPage()
  const guest = await ctx.newPage()
  for (const p of [host, guest]) p.on('pageerror', (e) => errors.push(e.message))

  await open(host, 'Alice', seed(Date.now()))
  await host.getByTestId('create').click()
  await expect(host.getByTestId('lobby')).toBeVisible({ timeout: 60000 })
  const code = (await host.getByTestId('roomcode').textContent())!.trim()
  // 主機一個人：頂欄的「人數不足」說明會換行，中間這列比較矮
  await expectFits(host, 'host alone')

  await open(guest, 'Bob')
  await guest.getByTestId('code').fill(code)
  await guest.getByTestId('join').click({ timeout: 60000 })
  await expect(guest.getByTestId('lobby')).toBeVisible({ timeout: 60000 })
  await expect(host.locator('.pcard:not(.empty)')).toHaveCount(2, { timeout: 30000 })
  await expectFits(host, 'host')
  await expectFits(guest, 'guest')

  // 客人：沒有一鍵設定按鈕，改成唯讀標示（寫出主機選的模式）；不再另佔一行說明
  await expect(guest.getByTestId('mode-presets')).toHaveCount(0)
  await expect(guest.getByTestId('extra-presets')).toHaveCount(0)
  await expect(guest.getByTestId('settings-readonly')).toContainText('本作預設')
  await expect(host.getByTestId('settings-readonly')).toHaveCount(0)

  // 主機按小隊地圖、老手節奏、勾死者看見真實身分 → 客人看得到
  await host.getByTestId('preset-small').click()
  await expect(guest.getByTestId('settings-readonly')).toContainText('小隊地圖', { timeout: 15000 })
  await expect(host.getByTestId('preset-small')).toHaveAttribute('aria-pressed', 'true')
  await expect(host.getByTestId('preset-modern')).toHaveAttribute('aria-pressed', 'false')
  await host.getByTestId('preset-veteran').click()
  await expect(guest.getByTestId('set-apo')).toHaveValue('veteran', { timeout: 15000 })
  await host.getByTestId('set-ghost-sight').check()
  await expect(guest.getByTestId('set-ghost-sight')).toBeChecked({ timeout: 15000 })
  await expect(guest.getByTestId('set-ghost-sight')).toBeDisabled()
  await expectFits(host, 'host after presets')
  await expectFits(guest, 'guest after presets')
  // 本作預設：全部還原（小隊地圖、老手節奏一起關掉）
  await host.getByTestId('preset-modern').click()
  await expect(guest.getByTestId('set-apo')).toHaveValue('fast', { timeout: 15000 })
  await expect(host.getByTestId('preset-small')).toHaveAttribute('aria-pressed', 'false')
  await expect(guest.getByTestId('settings-readonly')).toHaveText(/本作預設$/)

  // 本季戰績（這台電腦的紀錄；同一個瀏覽器的兩個分頁共用）：表、上一局回顧；在房間裡的人排前面
  for (const p of [host, guest]) {
    const s = p.getByTestId('season-stats')
    await expect(s).toBeVisible()
    await expect(s.getByTestId('season-last')).toContainText('異形勝')
    await expect(s.getByTestId('season-last')).toContainText('Alice')
    await expect(s.getByTestId('season-row')).toHaveCount(2)
    await expect(s.getByTestId('season-row').first()).toContainText('Alice')
    await expect(s.getByTestId('season-row').first()).toContainText('2 連勝')
    // 聊天照樣能用、不被擠掉
    await expect(p.getByTestId('lobby-chat-input')).toBeVisible()
    expect(
      await p.evaluate(() => {
        const l = document.querySelector('.lobby-left') as HTMLElement
        return l.scrollHeight - l.clientHeight
      }),
    ).toBeLessThanOrEqual(1)
  }
  // 重設要先確認；取消不清；確定才清（面板跟著消失）
  await host.getByTestId('season-reset').click()
  await expect(host.getByTestId('season-reset-confirm')).toBeVisible()
  await host.getByTestId('season-reset-no').click()
  await expect(host.getByTestId('season-row')).toHaveCount(2)
  await host.getByTestId('season-reset').click()
  await host.getByTestId('season-reset-yes').click()
  await expect(host.getByTestId('season-stats')).toHaveCount(0)
  expect(await host.evaluate(() => localStorage.getItem('xc.season'))).toBeNull()

  expect(errors).toEqual([])
  await ctx.close()
})
