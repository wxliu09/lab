// 聊天指令照畫面上看到的全名（依語言轉換過的）也找得到人
import { describe, expect, it } from 'vitest'
import { normalizeNameQuery } from '../../src/sim/systems/chat'

describe('名字查詢正規化', () => {
  it('中文職業前綴、英文晉升頭銜、en 預設名都轉回 sim 的寫法', () => {
    expect(normalizeNameQuery('博士·Bob')).toBe('bob')
    expect(normalizeNameQuery('醫護兵·Alice')).toBe('alice')
    expect(normalizeNameQuery('Agent Bob')).toBe('bob')
    expect(normalizeNameQuery('Crew 3')).toBe('船員 3')
    expect(normalizeNameQuery('  Dr. Bob ')).toBe('dr. bob')
    expect(normalizeNameQuery('red')).toBe('red')
  })
})
