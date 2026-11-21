// 第 6 輪（付費玩家第一晚）多人，client 端：主機帶大家回到大廳時清掉上一局（session.backToLobby）、
// 離開房間／換房間清空聊天（主機大廳聊天殘留上一局的訊息）、大廳聊天不顯示沒有發話者的系統訊息、
// 回到大廳後重新整理照樣自動回座（rejoin.reopenRoom）、結算畫面什麼時候給「回到大廳」、新字串與 AI 難度預設。
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest'
import { clearActive, markActive, markDone, pickToken, readToken, rejoinTarget, reopenRoom, type KV } from '../../src/client/rejoin'
import type { ChatLine, EndResult, StartInfo } from '../../src/shared/protocol/messages'

// 結算畫面的模組會載入 3D 場景（旁觀列的站名）；這裡只測結算的規則
vi.mock('../../src/render/gameScene', () => ({ stationDefOf: () => undefined }))

class Mem implements KV {
  m = new Map<string, string>()
  getItem(k: string) {
    return this.m.get(k) ?? null
  }
  setItem(k: string, v: string) {
    this.m.set(k, String(v))
  }
  removeItem(k: string) {
    this.m.delete(k)
  }
  get length() {
    return this.m.size
  }
  key(i: number) {
    return [...this.m.keys()][i] ?? null
  }
}

type Session = typeof import('../../src/client/session')
type LobbyMod = typeof import('../../src/ui/screens/Lobby')
type PanelsMod = typeof import('../../src/ui/hud/Panels')
type I18n = typeof import('../../src/ui/i18n')
type Room6 = typeof import('../../src/ui/strings/room6')
type Msgs = typeof import('../../src/shared/protocol/messages')
let S: Session
let L: LobbyMod
let P: PanelsMod
let I: I18n
let R6: Room6
let M: Msgs
let setMuted: (name: string, on: boolean) => void
let mutedNames: { value: ReadonlySet<string> }
let deathLines: { value: string[] }

const g = globalThis as unknown as Record<string, unknown>
const saved: Record<string, unknown> = {}
const ls = new Mem()
const tab = new Mem()

beforeAll(async () => {
  for (const k of ['window', 'localStorage', 'sessionStorage', 'location']) saved[k] = g[k]
  g.window ??= globalThis
  g.addEventListener ??= () => {}
  g.removeEventListener ??= () => {}
  g.localStorage = ls
  g.sessionStorage = tab
  g.location = { search: '?net=bc', hash: '', origin: 'http://x', pathname: '/' }
  S = await import('../../src/client/session')
  L = await import('../../src/ui/screens/Lobby')
  P = await import('../../src/ui/hud/Panels')
  I = await import('../../src/ui/i18n')
  R6 = await import('../../src/ui/strings/room6')
  M = await import('../../src/shared/protocol/messages')
  ;({ setMuted, mutedNames } = await import('../../src/client/mute'))
  ;({ deathLines } = await import('../../src/client/deathNote'))
})
afterAll(() => {
  S.leave()
  for (const [k, v] of Object.entries(saved)) g[k] = v
})
beforeEach(() => {
  I.lang.value = 'zh'
})

const line = (from: string, text: string, ch: ChatLine['ch'] = 'all'): ChatLine => ({ from, color: from ? 2 : -1, ch, text, time: 0 })
const info = (gid: number, slot = 1): StartInfo => ({ slot, seed: 0, stations: [], zones: [], players: [], spectator: false, gid })
const result = (winner: EndResult['winner'] = 'crew'): EndResult => ({ winner, players: [], timeline: [], duration: 300, ...(winner === 'aborted' ? { abortWhy: 'host' as const } : {}) })

/** 模擬「一局剛結算」的 client 狀態 */
function finishedGame(): void {
  S.screen.value = 'game'
  S.startInfo.value = info(4242)
  S.endResult.value = result()
  S.lastEnd.value = S.endResult.value
  S.chatLog.value = [line('', '@sys.left|name=Cy', 'sys'), line('Bob', 'gg'), line('', '@end.crew', 'sys')]
  deathLines.value = ['@death.cause.vacuum']
  S.world.ents.set(7, { s: { i: 7 } } as never)
  setMuted('Bob', true)
}

describe('session：主機帶大家回到大廳（HostMsg backToLobby）', () => {
  it('清掉上一局的一切（世界、開局資料、結算、聊天、死因、本機封鎖），回到大廳畫面', () => {
    finishedGame()
    expect(S.backToLobby()).toBe(true)
    expect(S.screen.value).toBe('lobby')
    expect(S.startInfo.value).toBeNull()
    expect(S.endResult.value).toBeNull()
    expect(S.lastEnd.value).toBeNull()
    expect(S.chatLog.value).toEqual([])
    expect(deathLines.value).toEqual([])
    expect(S.world.ents.size).toBe(0)
    expect(mutedNames.value.size).toBe(0)
    // 下一則 start 一定被當成新的一局（就算 gid 剛好一樣也不保留聊天）
    expect(S.isRestartOfSameGame(S.startInfo.value, info(4242))).toBe(false)
  })

  it('按了「繼續觀看」（endResult 清掉、lastEnd 還在）也一樣回到大廳', () => {
    finishedGame()
    S.endResult.value = null
    expect(S.backToLobby()).toBe(true)
    expect(S.screen.value).toBe('lobby')
    expect(S.lastEnd.value).toBeNull()
  })

  it('已經在大廳（回到大廳之後才重新連上，主機也會送一次）：不做事，大廳聊天照樣留著', () => {
    S.screen.value = 'lobby'
    S.startInfo.value = null
    S.endResult.value = null
    S.lastEnd.value = null
    S.chatLog.value = [line('Bob', '再一局')]
    expect(S.backToLobby()).toBe(false)
    expect(S.chatLog.value).toHaveLength(1)
    expect(S.screen.value).toBe('lobby')
  })
})

describe('session：離開房間清空聊天（第 6 輪 P2：主機大廳聊天殘留上一局的全部訊息）', () => {
  it('leave：聊天紀錄、死因、結算、開局資料都清掉（之後建立／加入新房間，大廳聊天是空的）', () => {
    finishedGame()
    S.leave()
    expect(S.screen.value).toBe('menu')
    expect(S.chatLog.value).toEqual([])
    expect(deathLines.value).toEqual([])
    expect(S.endResult.value).toBeNull()
    expect(S.lastEnd.value).toBeNull()
    expect(S.startInfo.value).toBeNull()
    expect(mutedNames.value.size).toBe(0)
  })

  it('加入新房間也從空的聊天開始（就算之前沒有經過 leave）', async () => {
    finishedGame()
    S.screen.value = 'menu'
    const p = S.joinRoom('ABCDE', { name: 'Zed', color: 1 })
    expect(S.chatLog.value).toEqual([])
    expect(deathLines.value).toEqual([])
    expect(S.endResult.value).toBeNull()
    S.cancelJoin()
    await p
  })
})

describe('大廳聊天：只顯示大廳的對話', () => {
  it('沒有發話者的系統訊息（上一局的死亡、事件、結算公告）不顯示；給自己的私訊提示（送太快、重複）照常；封鎖的人不顯示', () => {
    const lines = [
      line('', '@sys.left|name=Cy', 'sys'),
      line('', '@end.draw', 'sys'),
      line('Bob', '大家好'),
      line('', '@chat.tooFast', 'private'),
      line('Eve', '洗版'),
    ]
    setMuted('Eve', true)
    expect(L.lobbyChatLines(lines).map((l) => l.text)).toEqual(['大家好', '@chat.tooFast'])
    setMuted('Eve', false)
  })

  it('聊天框的高度上限是固定的（不隨聊天內容長高）', () => {
    expect(L.LOBBY_CHAT_MAX_PX).toBeGreaterThanOrEqual(150)
    expect(L.LOBBY_CHAT_MAX_PX).toBeLessThanOrEqual(420)
  })
})

describe('rejoin：回到大廳後重新整理照樣回座', () => {
  it('結算時標記離開（不自動連回）；回到大廳 reopenRoom 之後又會自動連回', () => {
    const ROOM = 'QWERT'
    const store = new Mem()
    const t = new Mem()
    const now = Date.now()
    const { tok } = pickToken(store, t, ROOM, { now, inst: 'me', share: true, gen: () => 'tokAAAAAAAAAAAA' })
    markActive(store, t, ROOM, now, true)
    expect(rejoinTarget(store, t, '', now + 10, { share: true })).toBe(ROOM)
    // 結算（session.ts 的 end）
    markDone(store, ROOM, now + 20)
    clearActive(store, t, ROOM, true)
    expect(rejoinTarget(store, t, '', now + 30, { share: true })).toBe('')
    // 主機帶大家回到大廳
    reopenRoom(store, ROOM, 'me', now + 40)
    markActive(store, t, ROOM, now + 40, true)
    expect(readToken(store, ROOM, now + 40)).toMatchObject({ tok, inst: 'me' })
    expect(readToken(store, ROOM, now + 40)!.done).toBeUndefined()
    expect(rejoinTarget(store, t, '', now + 50, { share: true })).toBe(ROOM)
  })

  it('別的頁面正拿著租約（還有心跳）：不動它；沒有標記離開的也不動', () => {
    const ROOM = 'ZXCVB'
    const store = new Mem()
    const t = new Mem()
    const now = Date.now()
    pickToken(store, t, ROOM, { now, inst: 'other', share: true, gen: () => 'tokBBBBBBBBBBBB' })
    markDone(store, ROOM, now)
    reopenRoom(store, ROOM, 'me', now + 100)
    expect(readToken(store, ROOM, now + 100)!.done).toBe(true)
    const fresh = new Mem()
    pickToken(fresh, new Mem(), ROOM, { now, inst: 'me', share: true, gen: () => 'tokCCCCCCCCCCCC' })
    const before = readToken(fresh, ROOM, now)
    reopenRoom(fresh, ROOM, 'me', now)
    expect(readToken(fresh, ROOM, now)).toEqual(before)
  })
})

describe('結算畫面：多人局的「回到大廳」', () => {
  it('只有多人局、而且不是主機中止的才有（練習局用「再來一局」）', () => {
    expect(P.lobbyAgain(result('crew'), false)).toBe(true)
    expect(P.lobbyAgain(result('draw'), false)).toBe(true)
    expect(P.lobbyAgain(result('xeno'), true)).toBe(false)
    expect(P.lobbyAgain(result('aborted'), false)).toBe(false)
    expect(P.lobbyAgain(null, false)).toBe(false)
  })
})

describe('新字串與 AI 難度預設', () => {
  it('room6 的字串中英都有；英文不混用 Alien', () => {
    const keys = Object.keys(R6.ROOM6_ZH)
    expect(keys.length).toBeGreaterThanOrEqual(8)
    expect(Object.keys(R6.ROOM6_EN).sort()).toEqual([...keys].sort())
    for (const k of keys) {
      expect(I.hasString('zh', k), k).toBe(true)
      expect(I.hasString('en', k), k).toBe(true)
      expect(R6.ROOM6_EN[k]).not.toMatch(/\baliens?\b/i)
    }
    expect(I.t('room6.end.toLobbyTip', { code: 'R2TCS' })).toContain('R2TCS')
    I.lang.value = 'en'
    expect(I.t('room6.end.toLobbyTip', { code: 'R2TCS' })).toContain('R2TCS')
  })

  it('大廳的 AI 難度沿用練習的用語（簡單／一般），兩種語言都有', () => {
    for (const a of M.AI_LEVELS) for (const l of ['zh', 'en'] as const) expect(I.hasString(l, 'ui4.practice.ai.' + a)).toBe(true)
    expect(I.t('ui4.practice.ai.easy')).toBe('簡單')
    expect(I.t('ui4.practice.ai')).toBe('AI 難度')
  })

  it('新開的多人房預設簡單；server 與練習的預設不變（練習局自己送練習對話框的難度）', () => {
    expect(S.ROOM_AI_DEFAULT).toBe('easy')
    expect(M.AI_LEVELS).toContain(S.ROOM_AI_DEFAULT)
    expect(M.DEFAULT_SETTINGS.aiLevel).toBe('normal')
  })
})
