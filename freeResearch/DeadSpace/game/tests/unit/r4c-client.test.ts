// 第 4 輪審查（client）：小地圖信號（節流、回音去重、本機封鎖、外觀節奏、聊天紀錄的本機行）、
// 本機封鎖的聊天過濾（聊天紀錄、頭頂泡泡、音效旁聽）、主機確定離開的判斷、新字串中英都有
import { afterEach, beforeAll, describe, expect, it } from 'vitest'
import '../../src/shared/content/index'
import type { ChatLine } from '../../src/shared/protocol/messages'
import { PING_BURST, PING_BURST_MS, PING_ECHO_MS, PING_GAP_MS, PING_LIFE_MS, PingBoard, pingLook } from '../../src/client/pingBoard'
import { HOST_GONE_QUICK_MS, HOST_GONE_SLOW_MS, hostGoneGrace, hostGoneNow } from '../../src/client/hostGone'
import { hiddenByMute } from '../../src/client/chatFilter'
import { clearMuted, isMuted, setMuted } from '../../src/client/mute'
import { ClientWorld } from '../../src/client/world'
import { UX_EN, UX_ZH } from '../../src/ui/strings/ux'

type Session = typeof import('../../src/client/session')
type MapPingMod = typeof import('../../src/client/mapPing')
let session: Session
let mp: MapPingMod
let receiveChat: (l: ChatLine[]) => void

beforeAll(async () => {
  // session、HUD 模組在測試 build 會碰 window：在 node 裡給個空的 window
  const w = globalThis as unknown as Record<string, unknown>
  w.window ??= globalThis
  w.addEventListener ??= () => {}
  w.removeEventListener ??= () => {}
  session = await import('../../src/client/session')
  mp = await import('../../src/client/mapPing')
  receiveChat = (w.__xcState as { receiveChat: (l: ChatLine[]) => void }).receiveChat
})

afterEach(() => {
  clearMuted()
  session.chatLog.value = []
  mp.pingBoard.clear()
})

const line = (from: string, ch: ChatLine['ch'], text = 'hi'): ChatLine => ({ from, color: 1, ch, text, time: 0 })

describe('小地圖信號：送出節流', () => {
  it('兩次之間至少隔 PING_GAP_MS；PING_BURST_MS 內最多 PING_BURST 個', () => {
    const b = new PingBoard()
    expect(b.local(1, 5, 5, 0, 1000)).not.toBeNull()
    // 太快
    expect(b.local(1, 6, 6, 0, 1000 + PING_GAP_MS - 1)).toBeNull()
    let t = 1000
    for (let i = 1; i < PING_BURST; i++) {
      t += PING_GAP_MS
      expect(b.local(1, 6 + i, 6, 0, t)).not.toBeNull()
    }
    // 已經送滿：再隔夠久也不行，要等最早那一個滑出窗口
    expect(b.local(1, 9, 9, 0, t + PING_GAP_MS)).toBeNull()
    expect(b.local(1, 9, 9, 0, 1000 + PING_BURST_MS)).not.toBeNull()
  })

  it('被擋下的那一下不算進節流（不會越按越久）', () => {
    const b = new PingBoard()
    b.local(1, 0, 0, 0, 0)
    for (let i = 1; i < 10; i++) expect(b.local(1, 0, 0, 0, i * 50)).toBeNull()
    expect(b.local(1, 0, 0, 0, PING_GAP_MS)).not.toBeNull()
  })
})

describe('小地圖信號：收到', () => {
  it('自己送出的本機先顯示；主機轉回來的回音不重複顯示（座標四捨五入也認得）；別人的照常顯示', () => {
    const b = new PingBoard()
    const mine = b.local(3, 10.004, 20.004, 2, 0)!
    expect(mine.self).toBe(true)
    expect(b.receive({ z: 3, x: 10, y: 20, name: 'Me', color: 2 }, 300)).toBeNull()
    // 同一點第二次（回音已經用掉）：當成另一個人的信號
    expect(b.receive({ z: 3, x: 10, y: 20, name: 'Bob', color: 4 }, 400)?.name).toBe('Bob')
    // 不同 zone 不是回音
    b.local(3, 1, 1, 2, 5000)
    expect(b.receive({ z: 4, x: 1, y: 1, name: 'Ann', color: 5 }, 5100)).not.toBeNull()
    expect(b.active(5100).map((p) => p.name)).toEqual(['', 'Ann'])
  })

  it('主機沒有轉回來：回音紀錄過一陣子就丟掉，之後同一點的信號照常顯示', () => {
    const b = new PingBoard()
    b.local(1, 4, 4, 0, 0)
    expect(b.receive({ z: 1, x: 4, y: 4, name: 'Bob', color: 1 }, PING_ECHO_MS + 1)).not.toBeNull()
  })

  it('被本機封鎖的人發的信號不顯示；封鎖之前已經在顯示的也立刻拿掉', () => {
    const b = new PingBoard()
    setMuted('Troll', true)
    expect(b.receive({ z: 1, x: 1, y: 1, name: 'Troll', color: 3 }, 0)).toBeNull()
    expect(b.receive({ z: 1, x: 1, y: 1, name: 'Bob', color: 1 }, 0)).not.toBeNull()
    expect(b.active(10)).toHaveLength(1)
    setMuted('Bob', true)
    expect(b.active(20)).toHaveLength(0)
  })

  it('顯示約 4 秒後消失', () => {
    const b = new PingBoard()
    b.receive({ z: 1, x: 1, y: 1, name: 'Bob', color: 1 }, 0)
    expect(b.active(PING_LIFE_MS - 1)).toHaveLength(1)
    expect(b.active(PING_LIFE_MS)).toHaveLength(0)
    expect(PING_LIFE_MS).toBe(4000)
  })

  it('外觀：開頭淡入、最後淡出；4 秒內有好幾道波紋，過期回傳 null', () => {
    expect(pingLook(0)!.core).toBe(0)
    expect(pingLook(500)!.core).toBe(1)
    expect(pingLook(PING_LIFE_MS - 100)!.core).toBeLessThan(0.3)
    expect(pingLook(PING_LIFE_MS)).toBeNull()
    expect(pingLook(-1)).toBeNull()
    const starts = new Set<number>()
    for (let t = 0; t < PING_LIFE_MS; t += 50) for (const w of pingLook(t)!.waves) if (w.r < 0.05) starts.add(Math.round(t / 600))
    expect(starts.size).toBeGreaterThanOrEqual(3)
    for (let t = 0; t < PING_LIFE_MS; t += 37)
      for (const w of pingLook(t)!.waves) {
        expect(w.r).toBeGreaterThanOrEqual(0)
        expect(w.r).toBeLessThanOrEqual(1)
        expect(w.a).toBeGreaterThanOrEqual(0)
        expect(w.a).toBeLessThanOrEqual(1)
      }
  })

  it('收到主機的信號：聊天紀錄加一行本機訊息（帶發送者與地點），被封鎖的人不加', () => {
    mp.receivePing({ z: 0, x: 3, y: 4, name: 'Bob', color: 1 })
    const l = session.chatLog.value.at(-1)!
    expect(mp.pingLines.get(l)).toEqual({ name: 'Bob', color: 1, z: 0 })
    // 沒有特別處理的地方（大廳聊天）照樣讀得懂
    expect(l.ch).toBe('sys')
    expect(l.text).toBe('@r4c.ping.chat|name=Bob')
    setMuted('Troll', true)
    mp.receivePing({ z: 0, x: 3, y: 4, name: 'Troll', color: 2 })
    expect(session.chatLog.value).toHaveLength(1)
  })

  it('名字裡的 | 不會弄壞系統訊息格式', () => {
    mp.receivePing({ z: 1, x: 3, y: 4, name: 'a|b=c', color: 1 })
    expect(session.chatLog.value.at(-1)!.text).toBe('@r4c.ping.chat|name=a b=c')
  })

  it('被禁言的人發的信號主機不給名字：聊天紀錄寫 ???', () => {
    mp.receivePing({ z: 1, x: 3, y: 4, name: '', color: -1 })
    expect(session.chatLog.value.at(-1)!.text).toBe('@r4c.ping.chat|name=???')
  })

  it('送出前把座標夾進主機接受的範圍（太空 ±49、站內版面範圍），不然主機丟掉、只有自己看得到', () => {
    expect(mp.clampPing(0, 80, -70, null)).toEqual({ x: 49, y: -49 })
    expect(mp.clampPing(3, -2, 99, { w: 40, h: 30 })).toEqual({ x: 0, y: 30 })
    expect(mp.clampPing(3, 12, 7, { w: 40, h: 30 })).toEqual({ x: 12, y: 7 })
    expect(mp.clampPing(3, -2, 99, null)).toEqual({ x: -2, y: 99 })
  })

  it('信號顏色：玩家色；沒有玩家色用介面青', () => {
    expect(mp.pingColor(0)).toBe('#e33d38')
    expect(mp.pingColor(-1)).toBe('#9fe7ff')
    expect(mp.pingColor(99)).toBe('#9fe7ff')
  })
})

describe('本機封鎖：聊天過濾', () => {
  it('公開、陣營、群組、死者頻道的話略過；系統訊息與私訊不受影響', () => {
    setMuted('Troll', true)
    for (const ch of ['all', 'team', 'group', 'dead'] as const) expect(hiddenByMute(line('Troll', ch))).toBe(true)
    expect(hiddenByMute(line('Troll', 'sys'))).toBe(false)
    expect(hiddenByMute(line('Troll', 'private'))).toBe(false)
    expect(hiddenByMute(line('Bob', 'all'))).toBe(false)
    // 匿名（沒有名字）的話不受影響
    expect(hiddenByMute(line('', 'all'))).toBe(false)
  })

  it('被封鎖的人說的話照樣收進 chatLog（解除封鎖看得到），但不交給公告與聊天音效', () => {
    setMuted('Troll', true)
    const heard: ChatLine[][] = []
    const tap = (ls: ChatLine[]) => heard.push(ls)
    session.chatTaps.push(tap)
    try {
      receiveChat([line('Troll', 'all', 'spam'), line('Bob', 'all', 'hello'), line('', 'sys', '@event.pirate')])
      receiveChat([line('Troll', 'team', 'spam2')])
    } finally {
      session.chatTaps.splice(session.chatTaps.indexOf(tap), 1)
    }
    expect(session.chatLog.value.map((l) => l.text)).toEqual(['spam', 'hello', '@event.pirate', 'spam2'])
    // 整批都是被封鎖的人：不呼叫旁聽
    expect(heard.map((b) => b.map((l) => l.text))).toEqual([['hello', '@event.pirate']])
  })

  it('頭頂泡泡記下發言者（overlay 畫的時候略過被封鎖的人）', () => {
    const w = new ClientWorld()
    w.addChat([{ from: 'Troll', color: 1, ch: 'all', text: '遺言', time: 0, e: 42 }])
    expect(w.bubbles[0]).toMatchObject({ e: 42, from: 'Troll' })
  })

  it('離開房間時清空封鎖名單（換局）', () => {
    setMuted('Troll', true)
    session.leave()
    expect(isMuted('Troll')).toBe(false)
  })
})

describe('主機確定離開', () => {
  it('失聯前不久還收得到主機的訊息（關分頁）：寬限短；心跳逾時（主機可能只是卡住）：寬限長', () => {
    expect(hostGoneGrace(10000, 9800)).toBe(HOST_GONE_QUICK_MS)
    expect(hostGoneGrace(20000, 9800)).toBe(HOST_GONE_SLOW_MS)
    // 從沒收過主機的訊息：當成卡住
    expect(hostGoneGrace(20000, 0)).toBe(HOST_GONE_SLOW_MS)
    expect(HOST_GONE_SLOW_MS).toBeGreaterThanOrEqual(25000)
  })

  it('滿寬限時間才判定；寬限中又收到主機的訊息（正在重連）就不算', () => {
    const lost = 10000
    const lastBefore = 9900
    expect(hostGoneNow(lost + HOST_GONE_QUICK_MS - 1, lost, lastBefore, lastBefore)).toBe(false)
    expect(hostGoneNow(lost + HOST_GONE_QUICK_MS, lost, lastBefore, lastBefore)).toBe(true)
    expect(hostGoneNow(lost + HOST_GONE_QUICK_MS, lost, lastBefore, lost + 5000)).toBe(false)
    // 心跳逾時的失聯：短暫失聯不跳出
    expect(hostGoneNow(30000 + HOST_GONE_QUICK_MS, 30000, 20000, 20000)).toBe(false)
    expect(hostGoneNow(30000 + HOST_GONE_SLOW_MS, 30000, 20000, 20000)).toBe(true)
    // 沒有失聯
    expect(hostGoneNow(99999, 0, 0, 0)).toBe(false)
  })

  it('session：一開始沒有判定主機離開；離開房間會重設', () => {
    expect(session.hostGone.value).toBe(false)
    session.hostGone.value = true
    session.leave()
    expect(session.hostGone.value).toBe(false)
    expect(session.connLost.value).toBe(false)
  })
})

describe('新字串', () => {
  it('第 4 輪 client 的字串中英都有', () => {
    const keys = Object.keys(UX_ZH).filter((k) => k.startsWith('r4c.'))
    expect(keys.length).toBeGreaterThanOrEqual(10)
    for (const k of keys) {
      expect(UX_EN[k], k).toBeTruthy()
      expect(UX_ZH[k], k).toBeTruthy()
    }
    expect(Object.keys(UX_EN).filter((k) => k.startsWith('r4c.')).sort()).toEqual(keys.sort())
    // 名字的位置用 {name} 標，Chat 依它切開插入上色的名字
    expect(UX_ZH['r4c.ping.chat']).toContain('{name}')
    expect(UX_EN['r4c.ping.chat']).toContain('{name}')
  })
})
