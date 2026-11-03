// 上方大公告（UI 審查第 2 輪）：長的事件／末日訊息只顯示標題句、顯示時間依字數、玩家文字色只提亮深色
import { afterEach, describe, expect, it, vi } from 'vitest'
import fs from 'node:fs'
import path from 'node:path'

vi.mock('../../src/client/session', async () => {
  const { signal } = await import('@preact/signals')
  const { ClientWorld } = await import('../../src/client/world')
  return { world: new ClientWorld(), snapTick: signal(0), screen: signal('game'), chatTaps: [] }
})
vi.mock('../../src/client/input', async () => {
  const { signal } = await import('@preact/signals')
  return { localNotice: signal(null) }
})

const A = await import('../../src/ui/hud/Announce')
const { hasString, lang, stringKeys, sysText, t } = await import('../../src/ui/i18n')
const { contrastRatio, textColorOf } = await import('../../src/ui/names')
const { PLAYER_COLORS } = await import('../../src/shared/constants')
// 自動降畫質的提示字串（addStrings 註冊）
await import('../../src/ui/strings/art2')

afterEach(() => {
  lang.value = 'zh'
})

/** 會上大公告的系統訊息 key：sim 原始碼裡所有 systemAll('key')（新聞不上公告），加上結局與投票結果 */
function announcedKeys(): string[] {
  const out = new Set(['end.crew', 'end.xeno', 'end.mutant', 'end.draw', 'end.aborted', 'vote.bootOn', 'vote.spectateOn'])
  const walk = (dir: string) => {
    for (const f of fs.readdirSync(dir, { withFileTypes: true })) {
      const p = path.join(dir, f.name)
      if (f.isDirectory()) walk(p)
      else if (p.endsWith('.ts')) for (const m of fs.readFileSync(p, 'utf8').matchAll(/systemAll\(\s*'([\w.]+)'/g)) if (!m[1].startsWith('news.')) out.add(m[1])
    }
  }
  walk(path.resolve(__dirname, '../../src/sim'))
  return [...out]
}
const ANNOUNCED = new Set(announcedKeys())

describe('上方大公告', () => {
  it('長的事件／末日訊息都有標題句（兩種語言）；大公告只顯示標題，聊天紀錄是全文', () => {
    const long: string[] = []
    expect(ANNOUNCED.size).toBeGreaterThan(40)
    for (const k of ANNOUNCED) {
      lang.value = 'zh'
      const zh = t(k)
      lang.value = 'en'
      const en = t(k)
      // 1280 寬時兩行放得下的長度（中文 40 字、英文 80 字）；更長的要有標題句
      if (zh.length <= 40 && en.length <= 80) continue
      long.push(k)
      expect([k, hasString('zh', k + '.title'), hasString('en', k + '.title')]).toEqual([k, true, true])
    }
    expect(long).toEqual(expect.arrayContaining(['event.wasps', 'event.asteroids', 'apoc.orbit', 'event.tenshu']))
    for (const l of ['zh', 'en'] as const) {
      lang.value = l
      for (const k of stringKeys(l).filter((x) => x.endsWith('.title') && ANNOUNCED.has(x.slice(0, -6)))) {
        // 標題要短：1280 寬時大多一行放得下（中文 ≤ 22 字、英文 ≤ 56 字）
        expect([k, t(k, { s: 180, m: 1, name: 'Bob' }).length <= (l === 'zh' ? 22 : 56)]).toEqual([k, true])
      }
    }
    lang.value = 'zh'
    const [head, more] = A.announceText('@event.tenshu|s=180')
    expect(more).toBe(true)
    expect(head).toContain('180')
    expect(head.length).toBeLessThan(sysText('@event.tenshu|s=180').length)
    // 短訊息照原文
    expect(A.announceText('@event.doorsFixed')).toEqual([sysText('@event.doorsFixed'), false])
    lang.value = 'en'
    expect(A.announceText('@apoc.orbit')[0]).toBe(t('apoc.orbit.title'))
  })

  it('顯示時間：5 秒＋每字 40 ms（全形字 100 ms），上限 14 秒；末日至少 8 秒', () => {
    expect(A.announceLife('', 'event')).toBe(5000)
    expect(A.announceLife('abcde', 'event')).toBe(5200)
    expect(A.announceLife('一二三', 'event')).toBe(5300)
    expect(A.announceLife('x'.repeat(1000), 'sys')).toBe(14000)
    expect(A.announceLife('短', 'apoc')).toBe(8000)
  })

  it('本機提示：短句至少 1.8 秒，長句依字數延長（全形字 130 ms、其他 50 ms），上限 8 秒', () => {
    expect(A.noticeLife('')).toBe(1800)
    expect(A.noticeLife('一二')).toBe(1800)
    lang.value = 'zh'
    // 自動降畫質的長句：讀得完（舊版固定 1.8 秒）
    const zh = t('art2.autoLow')
    expect(A.noticeLife(zh)).toBe(1500 + [...zh].length * 130)
    expect(A.noticeLife(zh)).toBeGreaterThan(3500)
    lang.value = 'en'
    expect(A.noticeLife(t('art2.autoLow'))).toBeGreaterThan(5000)
    expect(A.noticeLife('x'.repeat(1000))).toBe(8000)
  })
})

describe('玩家色當文字色', () => {
  it('對比不到 4.5:1 的深色才提亮（剛好過門檻），其他維持原色', () => {
    const hex = (s: string) => [1, 3, 5].map((i) => parseInt(s.slice(i, i + 2), 16))
    const bg = [0x1a, 0x20, 0x28]
    for (const c of PLAYER_COLORS) {
      const out = textColorOf(c.hex)
      expect(contrastRatio(hex(out), bg)).toBeGreaterThanOrEqual(4.5)
      if (contrastRatio(hex(c.hex), bg) >= 4.5) expect(out).toBe(c.hex)
      else expect(contrastRatio(hex(out), bg)).toBeLessThan(4.8)
    }
    expect(textColorOf(undefined)).toBe('#cfd8df')
  })
})
