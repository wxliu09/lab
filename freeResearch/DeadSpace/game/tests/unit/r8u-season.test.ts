// 第 8 輪 U8：跨局戰績（client/seasonStats.ts）的存檔邏輯：正規化名字、記一局、今晚／本季、連勝、去重、AI 與練習局不算、
// 版本與大小上限、壞資料、重設；接上 session 的結算訊號
import { beforeEach, describe, expect, it, vi } from 'vitest'

const room = vi.hoisted(() => ({ code: 'ABCDE' }))
vi.mock('../../src/client/session', async () => {
  const { signal } = await import('@preact/signals')
  return {
    endResult: signal(null),
    startInfo: signal(null),
    lobby: signal(null),
    currentRoom: () => room.code,
  }
})

const S = await import('../../src/client/seasonStats')
const session = await import('../../src/client/session')
type EndResult = import('../../src/shared/protocol/messages').EndResult
type Player = EndResult['players'][number]

const H = 3600 * 1000
const T0 = Date.UTC(2026, 10, 20, 12)

function pl(slot: number, name: string, role: string, extra: Partial<Player> = {}): Player {
  return {
    slot,
    name,
    color: slot,
    role,
    classId: 'researcher',
    spawn: false,
    alive: true,
    kills: 0,
    infections: 0,
    tests: 0,
    ...extra,
  }
}
function result(winner: EndResult['winner'], players: Player[], extra: Partial<EndResult> = {}): EndResult {
  return { winner, players, timeline: [], duration: 1500, ...extra }
}
function game(key: string, r: EndResult, now: number, bots: number[] = [], practice = false): import('../../src/client/seasonStats').GameInput {
  return { key, result: r, bots: new Set(bots), practice, now }
}
/** 記憶體版的 localStorage */
function memStore(init?: Record<string, string>) {
  const m = new Map<string, string>(Object.entries(init ?? {}))
  return {
    m,
    getItem: (k: string) => (m.has(k) ? m.get(k)! : null),
    setItem: (k: string, v: string) => void m.set(k, v),
    removeItem: (k: string) => void m.delete(k),
  }
}

const lineup = () => [pl(0, 'Alice', 'xeno'), pl(1, 'Bob', 'human'), pl(2, 'Cara', 'android'), pl(3, 'Dan', 'mutant')]

beforeEach(() => {
  room.code = 'ABCDE'
  S.season.value = S.emptySeason(T0)
})

describe('名字正規化', () => {
  it('NFKC、去空白、零寬字元；key 不分大小寫；空名字不算', () => {
    expect(S.normName('  Ａｌｉｃｅ  ')).toEqual({ key: 'alice', name: 'Alice' })
    expect(S.normName('Bo​b')).toEqual({ key: 'bob', name: 'Bob' })
    expect(S.normName('Mr   Big\t')).toEqual({ key: 'mr big', name: 'Mr Big' })
    expect(S.normName('ALICE')!.key).toBe(S.normName('alice')!.key)
    expect(S.normName('阿明')).toEqual({ key: '阿明', name: '阿明' })
    expect(S.normName('   ')).toBeNull()
    expect(S.normName('​')).toBeNull()
    expect(S.normName('x'.repeat(100))!.name).toHaveLength(S.NAME_MAX)
  })
})

describe('記一局', () => {
  it('各陣營的勝負：異形勝只有異形贏；人類勝時仿生人也贏；局數、勝場、陣營、上一局', () => {
    const { data, skipped } = S.applyGame(S.emptySeason(T0), game('g1', result('xeno', lineup()), T0))
    expect(skipped).toBeUndefined()
    expect(data.games).toBe(1)
    expect(data.night).toBe(1)
    expect(data.nightGames).toBe(1)
    expect(data.players.alice.season).toMatchObject({ g: 1, w: 1 })
    expect(data.players.alice.season.by.xeno).toEqual([1, 1])
    expect(data.players.bob.season).toMatchObject({ g: 1, w: 0 })
    expect(data.players.bob.season.by.human).toEqual([1, 0])
    expect(data.last).toMatchObject({ n: 1, winner: 'xeno', duration: 1500 })
    expect(data.last!.lineup.filter((p) => p.won).map((p) => p.name)).toEqual(['Alice'])
    const crew = S.applyGame(data, game('g2', result('crew', lineup()), T0 + 1000)).data
    expect(crew.players.cara.season.by.android).toEqual([2, 1])
    expect(crew.players.bob.season.w).toBe(1)
    expect(crew.players.dan.season.w).toBe(0)
    expect(S.wonWith('android', 'crew')).toBe(true)
    expect(S.wonWith('android', 'xeno')).toBe(false)
    expect(S.wonWith('mutant', 'mutant')).toBe(true)
  })

  it('被轉化的人照結算的陣營算（結算把眷屬寫成轉化者的陣營），上一局回顧標出眷屬', () => {
    const r = result('xeno', [pl(0, 'Alice', 'xeno'), pl(1, 'Bob', 'xeno', { spawn: true }), pl(2, 'Cara', 'human')])
    const d = S.applyGame(S.emptySeason(T0), game('g', r, T0)).data
    expect(d.players.bob.season.by.xeno).toEqual([1, 1])
    expect(d.last!.lineup.find((p) => p.name === 'Bob')).toMatchObject({ spawn: true, won: true })
  })

  it('連勝為正、連敗為負，平手歸零', () => {
    let d = S.emptySeason(T0)
    const play = (k: string, w: EndResult['winner']) => (d = S.applyGame(d, game(k, result(w, lineup()), T0)).data)
    play('a', 'xeno')
    play('b', 'xeno')
    expect(d.players.alice.streak).toBe(2)
    expect(d.players.bob.streak).toBe(-2)
    play('c', 'crew')
    expect(d.players.alice.streak).toBe(-1)
    expect(d.players.bob.streak).toBe(1)
    play('d', 'draw')
    expect(d.players.alice.streak).toBe(0)
    expect(d.players.bob.streak).toBe(0)
    expect(d.players.alice.season).toMatchObject({ g: 4, w: 2 })
  })

  it('AI 玩家、只主持不參戰的主機不算；回顧裡 AI 照樣列出（標 AI），統計不算', () => {
    const r = result('xeno', [pl(0, 'Host', 'human', { spectator: true, alive: false }), pl(1, 'Dr. Bot', 'xeno'), pl(2, 'Bob', 'human')])
    const d = S.applyGame(S.emptySeason(T0), game('g', r, T0, [1])).data
    expect(Object.keys(d.players)).toEqual(['bob'])
    expect(d.last!.lineup).toEqual([
      { name: 'Dr. Bot', role: 'xeno', spawn: false, won: true, bot: true },
      { name: 'Bob', role: 'human', spawn: false, won: false, bot: false },
    ])
  })

  it('不記：練習局、主機中止、同一局第二次、沒有真人參戰', () => {
    const base = S.emptySeason(T0)
    expect(S.applyGame(base, game('p', result('xeno', lineup()), T0, [], true)).skipped).toBe('practice')
    expect(S.applyGame(base, game('a', result('aborted', lineup()), T0)).skipped).toBe('aborted')
    const once = S.applyGame(base, game('g7', result('xeno', lineup()), T0)).data
    const twice = S.applyGame(once, game('g7', result('xeno', lineup()), T0 + 5000))
    expect(twice.skipped).toBe('dup')
    expect(twice.data.games).toBe(1)
    const bots = S.applyGame(base, game('b', result('xeno', [pl(0, 'Bot A', 'xeno'), pl(1, 'Bot B', 'human')]), T0, [0, 1]))
    expect(bots.skipped).toBe('empty')
    expect(bots.data.games).toBe(0)
    // 不改傳入的物件
    expect(base.games).toBe(0)
    expect(base.seen).toEqual([])
  })

  it('同一局裡正規化後同名的人只算一次；顯示名字用最後一次的寫法', () => {
    const d1 = S.applyGame(S.emptySeason(T0), game('x', result('xeno', [pl(0, 'alice', 'xeno'), pl(1, ' ALICE ', 'human')]), T0)).data
    expect(Object.keys(d1.players)).toEqual(['alice'])
    expect(d1.players.alice.season.g).toBe(1)
    const d2 = S.applyGame(d1, game('y', result('xeno', [pl(0, 'Alice', 'human')]), T0 + 1)).data
    expect(d2.players.alice.name).toBe('Alice')
    expect(d2.players.alice.season.g).toBe(2)
  })
})

describe('今晚與本季', () => {
  it('兩局相隔超過 6 小時算新的一晚：今晚的數字重新算，本季累計；排行只在今晚還沒過完時列今晚', () => {
    let d = S.applyGame(S.emptySeason(T0), game('n1a', result('xeno', lineup()), T0)).data
    d = S.applyGame(d, game('n1b', result('xeno', lineup()), T0 + 2 * H)).data
    expect(d.night).toBe(1)
    expect(d.nightGames).toBe(2)
    // 過了午夜也還是同一晚（只看間隔）
    d = S.applyGame(d, game('n1c', result('crew', lineup()), T0 + 7.5 * H)).data
    expect(d.night).toBe(1)
    expect(d.nightGames).toBe(3)
    const r1 = S.standings(d, T0 + 8 * H).find((r) => r.key === 'alice')!
    expect(r1).toMatchObject({ nightGames: 3, nightWins: 2, games: 3, wins: 2 })
    // 隔天：還沒打之前今晚是空的
    const tomorrow = T0 + 7.5 * H + 7 * H
    expect(S.nightActive(d, tomorrow)).toBe(false)
    expect(S.standings(d, tomorrow).find((r) => r.key === 'alice')).toMatchObject({
      nightGames: 0,
      nightWins: 0,
      games: 3,
    })
    // 隔天的第一局：第 2 晚，只有這一局
    d = S.applyGame(d, game('n2a', result('crew', [pl(0, 'Alice', 'human'), pl(1, 'Eve', 'xeno')]), tomorrow)).data
    expect(d.night).toBe(2)
    expect(d.nightGames).toBe(1)
    expect(d.players.alice.night).toMatchObject({ id: 2, g: 1, w: 1 })
    // 今晚沒來的人：今晚是 0，本季照舊
    const bob = S.standings(d, tomorrow + 1).find((r) => r.key === 'bob')!
    expect(bob).toMatchObject({ nightGames: 0, games: 3 })
  })

  it('排行：在房間裡的人在前，再依本季勝場、勝率；only 只列指定的人', () => {
    let d = S.emptySeason(T0)
    d = S.applyGame(d, game('1', result('xeno', lineup()), T0)).data
    d = S.applyGame(d, game('2', result('xeno', lineup()), T0 + 1)).data
    d = S.applyGame(d, game('3', result('mutant', lineup()), T0 + 2)).data
    expect(S.standings(d, T0 + 3).map((r) => r.name)).toEqual(['Alice', 'Dan', 'Bob', 'Cara'])
    expect(S.standings(d, T0 + 3, { present: ['bob', 'CARA'] }).map((r) => [r.name, r.present])).toEqual([
      ['Bob', true],
      ['Cara', true],
      ['Alice', false],
      ['Dan', false],
    ])
    expect(S.standings(d, T0 + 3, { only: ['Dan', 'Nobody'] }).map((r) => r.name)).toEqual(['Dan'])
  })
})

describe('存檔：版本、大小、壞資料', () => {
  it('壞掉的 JSON、不是物件、版本不對：當作空的一季', () => {
    for (const raw of [null, '', '{', '[]', '"x"', JSON.stringify({ v: 0, games: 3 }), JSON.stringify({ v: 2, games: 3 })]) {
      const d = S.parseSeason(raw, T0)
      expect(d.games, String(raw)).toBe(0)
      expect(d.players).toEqual({})
    }
  })

  it('欄位壞掉：負數、小數、勝場比局數多、名字空白、陣營不明的回顧都修正或丟掉', () => {
    const raw = JSON.stringify({
      v: 1,
      since: T0,
      games: 5.7,
      night: -2,
      nightGames: 'x',
      lastAt: T0,
      players: {
        whatever: {
          name: ' Alice ',
          at: T0,
          season: { g: 3, w: 9, by: { xeno: [2, 5], human: 'bad' } },
          night: { id: 1, g: 1, w: 1, by: {} },
          streak: 2.9,
        },
        blank: { name: '  ', season: { g: 1, w: 1 } },
        junk: 42,
      },
      seen: ['g1', 7, 'g2'],
      last: {
        at: T0,
        n: 5,
        winner: 'xeno',
        duration: 1200,
        lineup: [{ name: 'Alice', role: 'xeno', won: true }, { name: 'Bob', role: 'alien' }, 'x'],
      },
    })
    const d = S.parseSeason(raw, T0)
    expect(d.games).toBe(5)
    expect(d.night).toBe(0)
    expect(d.nightGames).toBe(0)
    expect(Object.keys(d.players)).toEqual(['alice'])
    expect(d.players.alice.season).toEqual({
      g: 3,
      w: 3,
      by: { human: [0, 0], xeno: [2, 2], mutant: [0, 0], android: [0, 0] },
    })
    expect(d.players.alice.streak).toBe(2)
    expect(d.seen).toEqual(['g1', 'g2'])
    expect(d.last!.lineup).toEqual([{ name: 'Alice', role: 'xeno', spawn: false, won: true, bot: false }])
    expect(S.parseSeason(JSON.stringify({ v: 1, last: { winner: 'aborted' } }), T0).last).toBeNull()
  })

  it('存回去再讀出來一模一樣', () => {
    let d = S.applyGame(S.emptySeason(T0), game('a', result('xeno', lineup()), T0)).data
    d = S.applyGame(d, game('b', result('draw', lineup(), { drawWhy: 'doom' }), T0 + H)).data
    expect(S.parseSeason(JSON.stringify(d), T0 + 2 * H)).toEqual(d)
    expect(d.last).toMatchObject({ winner: 'draw', drawWhy: 'doom' })
  })

  it('名單上限：超過就丟掉最久沒出現的人；去重的局號最多留 MAX_SEEN 個', () => {
    let d = S.emptySeason(T0)
    for (let i = 0; i < S.MAX_TRACKED + 10; i++) d = S.applyGame(d, game('k' + i, result('xeno', [pl(0, 'P' + i, 'xeno')]), T0 + i * 1000)).data
    const names = Object.values(d.players).map((p) => p.name)
    expect(names).toHaveLength(S.MAX_TRACKED)
    expect(names).not.toContain('P0')
    expect(names).toContain('P' + (S.MAX_TRACKED + 9))
    expect(d.seen).toHaveLength(S.MAX_SEEN)
    expect(d.seen.at(-1)).toBe('k' + (S.MAX_TRACKED + 9))
    expect(d.games).toBe(S.MAX_TRACKED + 10)
  })

  it('大小上限：存檔太大就再砍名單（長名字也放得下）', () => {
    let d = S.emptySeason(T0)
    for (let i = 0; i < S.MAX_TRACKED; i++) d = S.applyGame(d, game('k' + i, result('xeno', [pl(0, '名'.repeat(30) + i, 'xeno')]), T0 + i)).data
    const small = S.prune(structuredClone(d), 4000)
    expect(JSON.stringify(small).length).toBeLessThanOrEqual(4000)
    expect(Object.keys(small.players).length).toBeGreaterThan(0)
    expect(JSON.stringify(d).length).toBeLessThanOrEqual(S.MAX_BYTES)
  })

  it('存檔是比較新的版本：不覆寫（重設也不刪）', () => {
    const newer = JSON.stringify({ v: S.SEASON_VERSION + 1, games: 99 })
    const st = memStore({ [S.SEASON_KEY]: newer })
    expect(S.storeWritable(newer)).toBe(false)
    expect(S.saveSeason(S.emptySeason(T0), st)).toBe(false)
    S.resetSeason(st)
    expect(st.m.get(S.SEASON_KEY)).toBe(newer)
    expect(S.loadSeason(st, T0).games).toBe(0)
  })

  it('寫不進去（私密模式、空間滿）不會丟例外', () => {
    const broken = {
      getItem: () => null,
      setItem: () => {
        throw new Error('quota')
      },
      removeItem: () => {
        throw new Error('nope')
      },
    }
    expect(S.saveSeason(S.emptySeason(T0), broken)).toBe(false)
    expect(() => S.resetSeason(broken)).not.toThrow()
    expect(S.recordGame(game('q', result('xeno', lineup()), T0), broken)).toBe(true)
  })
})

describe('記錄與重設（存到 localStorage）', () => {
  it('同一局記兩次只算一次（重連重送結算、同一台電腦兩個分頁）；season 跟著更新；重設清空', () => {
    const st = memStore()
    expect(S.recordGame(game('g42', result('xeno', lineup()), T0), st)).toBe(true)
    expect(S.recordGame(game('g42', result('xeno', lineup()), T0 + 10), st)).toBe(false)
    expect(S.loadSeason(st).games).toBe(1)
    expect(S.season.value.games).toBe(1)
    expect(JSON.parse(st.m.get(S.SEASON_KEY)!).v).toBe(S.SEASON_VERSION)
    // 另一個分頁在這之間又記了一局：重讀存檔再加，不會蓋掉
    const other = S.applyGame(S.loadSeason(st), game('g43', result('crew', lineup()), T0 + 20)).data
    st.setItem(S.SEASON_KEY, JSON.stringify(other))
    S.recordGame(game('g44', result('mutant', lineup()), T0 + 30), st)
    expect(S.loadSeason(st).games).toBe(3)
    S.resetSeason(st, T0 + 40)
    expect(st.m.has(S.SEASON_KEY)).toBe(false)
    expect(S.season.value.games).toBe(0)
    expect(S.season.value.since).toBe(T0 + 40)
  })

  it('局號：有 gid 就用 gid；沒有的話用種子＋時長＋結局＋名單（名單順序不影響）', () => {
    const r = result('xeno', lineup())
    expect(S.gameKey(r, { gid: 123, seed: 9 })).toBe('g123')
    const a = S.gameKey(r, { seed: 9 })
    const b = S.gameKey({ ...r, players: [...r.players].reverse() }, { seed: 9 })
    expect(a).toBe(b)
    expect(S.gameKey(r, { seed: 10 })).not.toBe(a)
    expect(S.gameKey({ ...r, duration: 1501 }, { seed: 9 })).not.toBe(a)
  })
})

describe('接上結算訊號', () => {
  it('收到結算就記：AI 看開局資料的 bot 旗標；練習房不記；中止不記；同一局重送不重記', () => {
    const mem = new Map<string, string>()
    ;(globalThis as unknown as { localStorage: unknown }).localStorage = {
      getItem: (k: string) => mem.get(k) ?? null,
      setItem: (k: string, v: string) => void mem.set(k, v),
      removeItem: (k: string) => void mem.delete(k),
    }
    try {
      S.watchSeasonStats()
      S.watchSeasonStats()
      session.startInfo.value = {
        slot: 0,
        seed: 1,
        stations: [],
        zones: [],
        players: [
          { slot: 0, name: 'Alice', color: 0, bot: false },
          { slot: 1, name: 'Dr. Bot', color: 1, bot: true },
        ],
        spectator: false,
        gid: 77,
      }
      const r = result('xeno', [pl(0, 'Alice', 'xeno'), pl(1, 'Dr. Bot', 'human')])
      session.endResult.value = r
      expect(S.season.value.games).toBe(1)
      expect(Object.keys(S.season.value.players)).toEqual(['alice'])
      // 按「繼續觀看」再打開、重連重送：同一局
      session.endResult.value = null
      session.endResult.value = { ...r }
      expect(S.loadSeason().games).toBe(1)
      // 練習房
      room.code = 'SOLO0'
      session.startInfo.value = { ...session.startInfo.value, gid: 78 }
      session.endResult.value = result('xeno', [pl(0, 'Alice', 'xeno')])
      expect(S.loadSeason().games).toBe(1)
      // 主機中止
      room.code = 'ABCDE'
      session.startInfo.value = { ...session.startInfo.value, gid: 79 }
      session.endResult.value = result('aborted', [pl(0, 'Alice', 'xeno')], { abortWhy: 'host' })
      expect(S.loadSeason().games).toBe(1)
      session.startInfo.value = { ...session.startInfo.value, gid: 80 }
      session.endResult.value = result('crew', [pl(0, 'Alice', 'xeno')])
      expect(S.loadSeason().games).toBe(2)
      expect(S.season.value.players.alice.streak).toBe(-1)
      // 結算畫面的精簡版：這局記了才顯示；主機中止的局沒記（不能拿上一局冒充）；沒有結算 = null
      expect(S.currentGameRecorded(S.season.value)).toBe(true)
      session.startInfo.value = { ...session.startInfo.value, gid: 81 }
      session.endResult.value = result('aborted', [pl(0, 'Alice', 'xeno')], { abortWhy: 'host' })
      expect(S.currentGameRecorded(S.season.value)).toBe(false)
      session.endResult.value = null
      expect(S.currentGameRecorded(S.season.value)).toBeNull()
      expect(S.inPracticeRoom()).toBe(false)
      room.code = 'SOLO0'
      expect(S.inPracticeRoom()).toBe(true)
    } finally {
      delete (globalThis as unknown as { localStorage?: unknown }).localStorage
    }
  })
})
