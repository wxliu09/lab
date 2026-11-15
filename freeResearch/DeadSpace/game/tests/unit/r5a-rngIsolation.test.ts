// 第 5 輪審查 P0：身分不能從公開資訊暴力還原。
// 以前身分（Game.secret）與實體 id（World.idRng）共用一個 31 bit 種子：快照裡第一個 id（女帝號的太空實體）加上
// 公開的席位與設定，掃完 2³¹ 就算出全部身分；事件、末日時間、通訊病毒洗牌又全在地圖種子的亂數流上。
// 現在：正式路徑（不帶 secret）的身分流、遊戲流各自用 128 bit 密碼學種子，id 流每個 id 直接取密碼學亂數；
// 地圖種子只驅動公開的版面流 World.mapRng。
import { afterEach, describe, expect, it, vi } from 'vitest'
import { Rng, cryptoSeed } from '../../src/shared/rng'
import { DEFAULT_SETTINGS, PRACTICE_ROOM, type HostMsg, type LobbySettings } from '../../src/shared/protocol/messages'
import { decode, encode } from '../../src/shared/protocol/codec'
import { Game, secretSeeds, type SecretSeeds } from '../../src/sim/game'
import { GameServer, LOCAL_PEER } from '../../src/sim/server'
import { eventsOf } from '../../src/sim/systems/events'

const SEATS = Array.from({ length: 8 }, (_, i) => ({ slot: i, name: 'P' + i, color: i, bot: false, connected: true, spectator: false }))
const SETTINGS: LobbySettings = { ...DEFAULT_SETTINGS, aliens: 1, mutants: 1, androids: 1, npcCrew: 0 }
/** 公開的地圖種子（主機在大廳指定時 lobbyState 會廣播給所有人）*/
const MAP_SEED = 777

function mk(secret?: number | SecretSeeds, seed = MAP_SEED): Game {
  return new Game({ seed, secret, settings: { ...SETTINGS }, players: SEATS.map((s) => ({ ...s })), send: () => {} })
}

/**
 * 秘密：每個人的身分、職業、博士專長（withPos：再加上出生點）。
 * 火口號在不在由遊戲流的 qr 決定（≥7 人、有工程師才出現，工程師改生在那裡），所以只換遊戲流時要比不含出生點的版本
 */
const roleSig = (g: Game, withPos = true) =>
  g
    .allPlayers()
    .map((p) => {
      const u = g.mainOf(p)!
      return `${p.slot}:${p.role}:${p.classId}:${p.phd}` + (withPos ? `:${u.zone}:${u.x.toFixed(2)},${u.y.toFixed(2)}` : '')
    })
    .join('|')

/** 火口號：開局後依秘密的 qr 與職業補建（不在公開的版面裡）*/
const CONDITIONAL = new Set(['caldera'])

/** 公開的版面：開局的站與雜物箱位置、朝向（進視野就看得到）*/
const layoutSig = (g: Game) =>
  g.stations.filter((id) => !CONDITIONAL.has(id)).join(',') +
  '#' +
  [...g.world.ents.values()]
    .filter((e) => e.def.id === 'struct.rummage' && !CONDITIONAL.has(g.world.zones[e.zone].key))
    .map((e) => `${g.world.zones[e.zone].key}:${e.x.toFixed(2)},${e.y.toFixed(2)}:${e.facing.toFixed(3)}`)
    .sort()
    .join('|')

/** 開局最先建立的實體 id（第一個是女帝號的太空實體；都是送給每個 client 的公開資料）*/
const firstIds = (g: Game) => [...g.world.ents.keys()].slice(0, 20)

/** 正式路徑：GameServer 不帶 secret（worker 就是這樣建的），主機在大廳指定公開的地圖種子 */
function prodServer(code: string, humans = 8) {
  const inbox = new Map<string, HostMsg[]>()
  const srv = new GameServer(code, { send: (peer, d) => (inbox.get(peer) ?? inbox.set(peer, []).get(peer)!).push(decode(d) as HostMsg) }, 4242)
  const peers = [LOCAL_PEER, ...Array.from({ length: humans - 1 }, (_, i) => 'peer-p' + (i + 1))]
  peers.forEach((peer, i) => {
    srv.onJoin(peer)
    srv.onMessage(peer, encode({ t: 'hello', name: 'P' + i, color: i, ver: 1, token: ('tok' + i).padEnd(8, 'x') }))
  })
  srv.onMessage(LOCAL_PEER, encode({ t: 'settings', s: { seed: MAP_SEED, aliens: 1, mutants: 1, androids: 1, npcCrew: 0 } }))
  srv.onMessage(LOCAL_PEER, encode({ t: 'start' }))
  srv.tick()
  srv.tick()
  return { srv, g: srv.game!, inbox }
}

afterEach(() => {
  vi.restoreAllMocks()
})

describe('Rng 種子', () => {
  it('四個 32 bit 字的種子：每個字都影響序列；數字種子的序列和改版前相同（= 前三個字是固定常數）', () => {
    const base: [number, number, number, number] = [0x01234567, 0x89abcdef, 0xdeadbeef, 0x0badf00d]
    const seq = (r: Rng) => Array.from({ length: 8 }, () => r.next())
    const a = seq(new Rng(base))
    expect(seq(new Rng(base))).toEqual(a)
    for (let i = 0; i < 4; i++) {
      const s = [...base] as [number, number, number, number]
      s[i] ^= 1
      expect(seq(new Rng(s))).not.toEqual(a)
    }
    expect(seq(new Rng(5))).toEqual(seq(new Rng([0x9e3779b9, 0x243f6a88, 0xb7e15162, 5])))
  })

  it('cryptoSeed 用 crypto.getRandomValues 填滿四個字（128 bit）', () => {
    const spy = vi.spyOn(globalThis.crypto, 'getRandomValues')
    const s = cryptoSeed()
    expect(s).toHaveLength(4)
    expect(spy).toHaveBeenCalledTimes(1)
    expect((spy.mock.calls[0][0] as Uint32Array).length).toBe(4)
    expect(new Set([cryptoSeed().join(), cryptoSeed().join(), s.join()]).size).toBe(3)
  })

  it("'crypto' 來源：每次都取 crypto.getRandomValues（緩衝 64 個字），不可重現", () => {
    const spy = vi.spyOn(globalThis.crypto, 'getRandomValues')
    const a = new Rng('crypto')
    const b = new Rng('crypto')
    const xs = Array.from({ length: 100 }, () => a.next())
    const ys = Array.from({ length: 100 }, () => b.next())
    expect(xs).not.toEqual(ys)
    for (const x of xs) expect(x >= 0 && x < 1).toBe(true)
    // 每個 Rng 100 個數 = 2 次 64 字的緩衝
    expect(spy.mock.calls.filter((c) => (c[0] as Uint32Array).length === 64)).toHaveLength(4)
    expect(a.id31()).toBeGreaterThan(0)
  })

  it('正式路徑（不帶 secret）：身分流、遊戲流各抽一組 128 bit 的密碼學種子，id 流用 crypto 來源', () => {
    const spy = vi.spyOn(globalThis.crypto, 'getRandomValues')
    const seeds = secretSeeds()
    expect(spy.mock.calls.filter((c) => (c[0] as Uint32Array).length === 4)).toHaveLength(2)
    for (const w of [seeds.roles, seeds.world]) expect(Array.isArray(w) && w.length === 4).toBe(true)
    expect(String(seeds.roles)).not.toBe(String(seeds.world))
    expect(seeds.ids).toBe('crypto')
    spy.mockClear()
    mk()
    // 身分流、遊戲流各 4 個字；實體 id 從 64 字的密碼學緩衝取（gid 另外抽 1 個字）
    expect(spy.mock.calls.filter((c) => (c[0] as Uint32Array).length === 4)).toHaveLength(2)
    expect(spy.mock.calls.filter((c) => (c[0] as Uint32Array).length === 64).length).toBeGreaterThan(0)
  })
})

describe('公開的地圖種子推不出任何秘密（正式路徑）', () => {
  it('同一個地圖種子、同樣的席位與設定開 5 局：版面相同；身分、職業、出生點、實體 id、末日時間、穩定度偏移每局都不同', () => {
    const games = Array.from({ length: 5 }, () => mk())
    // 公開流可重現（地圖種子相同 → 版面相同）
    expect(new Set(games.map((g) => layoutSig(g))).size).toBe(1)
    // 秘密流和地圖種子無關
    expect(new Set(games.map((g) => roleSig(g))).size).toBe(5)
    expect(new Set(games.map((g) => firstIds(g)[0])).size).toBe(5)
    expect(new Set(games.map((g) => eventsOf(g).apocAt)).size).toBe(5)
    const jitter = (g: Game) => {
      g.stability()
      return g.data.stabJitter as number
    }
    expect(new Set(games.map(jitter)).size).toBe(5)
    expect(new Set(games.map((g) => g.gid)).size).toBe(5)
  })

  it('GameServer（worker 的建法）：主機公開指定地圖種子，客人看得到種子與自己的快照（含 id），每局身分仍然不同', () => {
    const runs = Array.from({ length: 4 }, (_, i) => prodServer('PROD' + i))
    for (const { inbox } of runs) {
      // 這個情境下地圖種子是公開的：大廳設定廣播給每位客人
      const lobby = inbox.get('peer-p1')!.filter((m) => m.t === 'lobbyState')
      expect(lobby.some((m) => m.t === 'lobbyState' && m.settings.seed === MAP_SEED)).toBe(true)
    }
    // 客人第一份快照裡的實體 id（含女帝號的太空實體）
    const snapIds = runs.map(({ inbox }) => {
      const snap = inbox.get('peer-p1')!.find((m) => m.t === 'snap')
      expect(snap).toBeTruthy()
      return snap!.t === 'snap' ? snap!.s.e.map((e) => e.i) : []
    })
    expect(snapIds[0].length).toBeGreaterThan(0)
    expect(snapIds[0]).toContain(runs[0].g.world.zones[1].spaceEnt)
    expect(new Set(snapIds.map((ids) => ids.join())).size).toBe(4)
    expect(new Set(runs.map(({ g }) => layoutSig(g))).size).toBe(1)
    expect(new Set(runs.map(({ g }) => roleSig(g))).size).toBe(4)
    expect(new Set(runs.map(({ g }) => eventsOf(g).apocAt)).size).toBe(4)
  })

  it('單機練習在正式環境走同一條路徑：同一個地圖種子，身分每局不同（練習局不需要可重現；測試另外用固定 secret）', () => {
    const sigs = Array.from({ length: 4 }, () => {
      const srv = new GameServer(PRACTICE_ROOM, { send: () => {} }, 99)
      srv.onJoin(LOCAL_PEER)
      srv.onMessage(LOCAL_PEER, encode({ t: 'hello', name: 'Me', color: 0, ver: 1, token: 'tokMexxxxxxx' }))
      srv.onMessage(LOCAL_PEER, encode({ t: 'settings', s: { seed: MAP_SEED, bots: 7, npcCrew: 0 } }))
      srv.onMessage(LOCAL_PEER, encode({ t: 'start', role: 'random' }))
      expect(srv.game!.practice).toBe(true)
      return roleSig(srv.game!)
    })
    expect(new Set(sigs).size).toBe(4)
  })
})

describe('秘密流彼此獨立：快照裡的 id 加上公開的席位與設定推不出身分', () => {
  it('id 流相同、地圖種子與設定相同 → 開局的實體 id 完全一樣，但身分不同（id 不帶任何身分資訊）', () => {
    const ids = cryptoSeed()
    const a = mk({ roles: cryptoSeed(), world: cryptoSeed(), ids })
    const b = mk({ roles: cryptoSeed(), world: cryptoSeed(), ids })
    expect(firstIds(a)).toEqual(firstIds(b))
    expect(a.world.zones[1].spaceEnt).toBe(b.world.zones[1].spaceEnt)
    expect(roleSig(a)).not.toBe(roleSig(b))
  })

  it('身分流相同 → 身分分配一樣，但實體 id 不同（id 不是身分流的函數，也不是地圖種子的函數）', () => {
    const roles = cryptoSeed()
    const world = cryptoSeed()
    const c = mk({ roles, world, ids: cryptoSeed() })
    const d = mk({ roles, world, ids: cryptoSeed() })
    expect(roleSig(c)).toBe(roleSig(d))
    expect(firstIds(c)[0]).not.toBe(firstIds(d)[0])
    expect(new Set([...firstIds(c), ...firstIds(d)]).size).toBe(40)
  })

  it('遊戲流（事件、末日）和身分流、地圖種子無關：只換遊戲流，身分不變、末日時間改變', () => {
    const roles = cryptoSeed()
    const ids = cryptoSeed()
    const e = mk({ roles, world: cryptoSeed(), ids })
    const f = mk({ roles, world: cryptoSeed(), ids })
    expect(roleSig(e, false)).toBe(roleSig(f, false))
    expect(eventsOf(e).apocAt).not.toBe(eventsOf(f).apocAt)
    expect(layoutSig(e)).toBe(layoutSig(f))
  })

  it('改版前的攻擊：用 31 bit secret 的舊推法從第一個 id 對回身分種子——正式路徑抽樣 2 萬個候選都對不上', () => {
    // 舊版：idSeed = (secret × 2654435761) >>> 1，第一個 id = new Rng(idSeed).id31()，掃完 2³¹ 個 secret 就找得到；
    // 正式路徑的 id 流是獨立的 128 bit 種子，和任何 31 bit secret 都沒有這個關係
    const legacyFirstId = (secret: number) => new Rng((secret * 2654435761) >>> 1 || 7).id31()
    const g = mk()
    const first = firstIds(g)[0]
    let hits = 0
    for (let s = 1; s <= 20000; s++) if (legacyFirstId(s) === first) hits++
    expect(hits).toBe(0)
    // 對照：測試用的數字 secret 沿用舊推法（可重現），所以對得上——正式路徑不帶 secret
    const t = mk(12345)
    expect(firstIds(t)[0]).toBe(legacyFirstId(12345))
  })
})
