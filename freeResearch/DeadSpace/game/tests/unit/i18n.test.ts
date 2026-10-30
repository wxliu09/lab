// i18n 完整性：sim 端送出的每個系統訊息 key 在 zh-TW 與 en 都要有翻譯
import { describe, expect, it } from 'vitest'
import { readFileSync, readdirSync, statSync } from 'node:fs'
import { join } from 'node:path'
import { hasString } from '../../src/ui/i18n'

function files(dir: string): string[] {
  const out: string[] = []
  for (const f of readdirSync(dir)) {
    const p = join(dir, f)
    if (statSync(p).isDirectory()) out.push(...files(p))
    else if (p.endsWith('.ts')) out.push(p)
  }
  return out
}

/** 從原始碼抓出固定字串的訊息 key */
function messageKeys(): Map<string, string> {
  const keys = new Map<string, string>()
  const pats = [
    /privateLine\([^,()]+(?:\([^()]*\))?[^,()]*,\s*'([a-zA-Z0-9_.]+)'/g,
    /systemAll\('([a-zA-Z0-9_.]+)'/g,
    /\bsay\([^,()]+,\s*(?:[^,()]+,\s*)?'([a-zA-Z0-9_.]+)'/g,
    /\bsay\('([a-zA-Z0-9_.]+)'/g,
    /\btell\([^,()]+,\s*[^,()]+,\s*'([a-zA-Z0-9_.]+)'/g,
  ]
  for (const f of files('src/sim')) {
    const src = readFileSync(f, 'utf8')
    // 結尾是 '.' 的是動態組出來的 key（'cast.' + why），另外由各自的測試涵蓋
    for (const re of pats) for (const m of src.matchAll(re)) if (m[1].includes('.') && !m[1].endsWith('.')) keys.set(m[1], f)
  }
  return keys
}

describe('i18n 完整性', () => {
  it('sim 的系統訊息 key 在兩種語言都有', () => {
    const keys = messageKeys()
    expect(keys.size).toBeGreaterThan(50)
    const missing: string[] = []
    for (const [k, f] of keys) {
      if (!hasString('zh', k)) missing.push(`zh ${k} (${f})`)
      if (!hasString('en', k)) missing.push(`en ${k} (${f})`)
    }
    expect(missing).toEqual([])
  })
})

describe('原始碼字串', () => {
  it('src 裡沒有特定字眼（以 base64 存放，避免測試本身被搜到）', () => {
    const words = ['Y2hlYXQ=', '5L2c5byK', 'd3hsaXUwOQ=='].map((b) => Buffer.from(b, 'base64').toString('utf8').toLowerCase())
    const hits: string[] = []
    const all = (dir: string): string[] => readdirSync(dir).flatMap((f) => (statSync(join(dir, f)).isDirectory() ? all(join(dir, f)) : [join(dir, f)]))
    for (const f of all('src')) {
      const src = readFileSync(f, 'utf8').toLowerCase()
      for (const w of words) if (src.includes(w)) hits.push(`${f}: ${w.length}`)
    }
    expect(hits).toEqual([])
  })
})
