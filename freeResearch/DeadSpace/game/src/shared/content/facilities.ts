// 各站特殊設施（研究 03 §1.2、§3.2、§4；內容總表「模組」「地點」）：站內設施單位、可移動的牢籠、
// 太空層的特效單位（天守主砲能量球、重力校正指揮點）與它們的數值。站點技能（st.*）在 ships.ts。
// 行為在 src/sim/systems/facilities.ts 與 src/sim/systems/stations.ts。
import { regAbilities, regBuffs, regUnits } from './registry'
import type { AbilityDef, Loc, UnitDef } from './types'

const L = (zh: string, en: string): Loc => ({ zh, en })

const F = (id: string, zh: string, en: string, hp: number, model: string, extra: Partial<UnitDef> = {}): UnitDef => ({
  id,
  name: L(zh, en),
  model,
  hp,
  hpRegen: 0,
  mp: 0,
  mpRegen: 0,
  speed: 0,
  radius: 0.6,
  sight: 6,
  abilities: [],
  tags: ['structure', 'mechanical'],
  corpse: false,
  ...extra,
})

/** 不佔格、不能被選取的地面設施（踏板、傳送門、降落場）*/
const PAD_TAGS: UnitDef['tags'] = ['structure', 'invuln', 'noTarget']

regUnits([
  // 裁決者號：仿生人鑄造台（研究 02 §5.3、§5.5）。HP 為自訂值
  F('fac.fabricator', '金屬鑄造台', 'Metallic Fabricator', 6000, 'fabricator', { radius: 0.9, tags: ['structure', 'mechanical'] }),
  // 模組安裝座：空著時無敵；裝上模組後變成 600 HP 的介面（研究 03 §3.2 ASAD Interface）
  F('fac.moduleSocket', '模組安裝座', 'Module Socket', 600, 'moduleSocket', { radius: 0.55 }),
  // 餘燼衛星模組工廠控制台（HP 自訂）
  F('fac.moduleFactory', '模組工廠', 'Module Works', 8000, 'moduleFactory', { radius: 0.9, tags: ['structure', 'mechanical', 'console'] }),
  // 活體庫號：隔間門控制台、籠子控制台（HP 自訂）
  F('fac.cellConsole', '隔間門控制台', 'Pen Control Console', 3000, 'cellConsole', { tags: ['structure', 'mechanical', 'console'] }),
  F('fac.cageConsole', '籠子控制台', 'Cage Control Console', 3000, 'cageConsole', { tags: ['structure', 'mechanical', 'console'] }),
  // 未識別物體：啟用碼面板
  F('fac.codePanel', '符文面板', 'Glyph Panel', 1, 'codePanel', { tags: ['structure', 'invuln'] }),
  // 翠原星：企鵝雕像（原作 B005 可破壞物；HP 自訂）
  F('fac.penguinStatue', '企鵝雕像', 'Penguin Statue', 500, 'penguinStatue', { radius: 0.6, tags: ['structure'], drops: [{ item: 'penguinPlush', p: 1 }] }),
  // 豪勇號降落場（翠原星）與兩端的降落傳送門：x2.on / x2.landed 表示啟用中
  F('fac.landingSite', '豪勇號降落場', 'Bravado Landing Field', 1, 'landingSite', { radius: 0.5, tags: PAD_TAGS, sight: 0 }),
  F('fac.landingPortal', '降落傳送門', 'Landing Portal', 1, 'landingPortal', { radius: 0.5, tags: PAD_TAGS, sight: 0 }),
  // 牢籠：可以被重力推斥器／吸引器推動、可以搭船；被打破就放出裡面的標本（研究 03 §4.5 h04Q）
  {
    id: 'fac.cage',
    name: L('標本籠', 'Specimen Cage'),
    model: 'fac.cage',
    hp: 300,
    hpRegen: 0,
    mp: 0,
    mpRegen: 0,
    speed: 0.01,
    radius: 0.6,
    sight: 0,
    abilities: [],
    tags: ['cage', 'mechanical'],
    corpse: false,
  },
  // 天守主砲的能量球（太空層；不可被選取，由 sim 直接推進）
  {
    id: 'space.cannonOrb',
    name: L('主砲能量球', 'Cannon Charge'),
    model: 'space.cannonOrb',
    hp: 1,
    hpRegen: 0,
    mp: 0,
    mpRegen: 0,
    speed: 0,
    radius: 0.5,
    sight: 0,
    abilities: [],
    tags: ['space', 'noTarget', 'invuln'],
    layer: 'space',
    corpse: false,
  },
  // 重力校正指揮點：購買重力校正場的人暫時操控它來選目標與方向（只有操控者看得到）
  {
    id: 'space.gravTargeter',
    name: L('重力校正指揮點', 'Correction Uplink'),
    model: 'space.gravTargeter',
    hp: 1,
    hpRegen: 0,
    mp: 0,
    mpRegen: 0,
    speed: 0,
    radius: 0.3,
    sight: 0,
    abilities: ['grav.target', 'grav.angle'],
    tags: ['space', 'noTarget', 'invuln'],
    layer: 'space',
    corpse: false,
  },
])

regBuffs([
  // 動力分配台（研究 03 §4.4）
  { id: 'bf.power.ambient', name: L('環境供能', 'Ambient Power'), icon: 'battery', vis: 'self', good: true, dur: 1.5, mpRegen: 0.75 },
  { id: 'bf.power.explorer', name: L('探索艇供能', 'Explorer Power'), icon: 'ship', vis: 'all', good: true, dur: 1.5, regen: 20, moveAdd: 0.3, atkSpeed: 1.3 },
  { id: 'bf.power.station', name: L('站體供能', 'Station Power'), icon: 'bolt', vis: 'all', good: true, dur: 1.5, regen: 100, atkSpeed: 1.4 },
  // 擺渡號傳送抵達、鑄造台出廠：短暫無敵
  { id: 'bf.portArrive', name: L('傳送保護', 'Transit Shield'), icon: 'shield', vis: 'all', good: true, dur: 5, invuln: true },
  { id: 'bf.fabArrive', name: L('出廠保護', 'Fresh Chassis'), icon: 'shield', vis: 'all', good: true, dur: 6, invuln: true },
  // 鑄造台接管綏靖機器人時的開機停頓
  { id: 'bf.booting', name: L('開機中', 'Booting'), icon: 'clock', vis: 'all', good: false, dur: 4, stun: true },
])

const A = (a: AbilityDef) => a
regAbilities([
  A({
    id: 'grav.target',
    name: L('鎖定校正目標', 'Lock Correction Target'),
    desc: L('選擇要推動的船或站（行星與衛星推不動）。', 'Pick the craft or station to push (planets and moons will not budge).'),
    icon: 'void',
    target: 'unit',
    range: 200,
    cd: 0.5,
    mana: 0,
    effects: [{ k: 'script', fn: 'grav.pickTarget' }],
  }),
  A({
    id: 'grav.angle',
    name: L('設定校正方向', 'Set Correction Vector'),
    desc: L('點選方向：目標會被一路加速推往那邊。越輕的東西推得越久、越遠。', 'Click a direction: the target is pushed that way, accelerating. Lighter things are pushed longer and farther.'),
    icon: 'speed',
    target: 'point',
    range: 200,
    cd: 0.5,
    mana: 0,
    effects: [{ k: 'script', fn: 'grav.push' }],
  }),
])

// ───────── 數值 ─────────

/** 動力分配台模式（研究 03 §4.4；normal = 一般，不加成）。索引就是 facility 指令的 s 與面板的 mode */
export const POWER_MODES = ['normal', 'ambient', 'explorer', 'station', 'lab'] as const
export type PowerMode = (typeof POWER_MODES)[number]
/** 各模式冷卻（秒；研究 03 §4.4）*/
export const POWER_CD: Record<PowerMode, number> = { normal: 0, ambient: 0, explorer: 40, station: 50, lab: 45 }

/** 模組工廠生產時間（秒；研究 03 §3.2）*/
export const MODULE_BUILD: Record<string, number> = {
  modScanAmp: 300,
  modAntimatter: 700,
  modKestrel: 240,
  modThruster: 600,
  refinedOre: 120,
  modNeurotoxin: 300,
}

/** 站體能量（原作 mana）：[開局, 上限, 每秒回復]。火口號 250/1000（研究 03 §1.1）*/
export const STATION_MANA: Record<string, [number, number, number]> = {
  caldera: [250, 1000, 0],
}

/**
 * 重力校正推動時間（秒）＝ 4 × 原作 point value ／ 100（研究 03 §4.3）。
 * 原作值：女帝號 50、天守 80、站 110、紅隼 200、騾 240、槍騎／獵鷹 180、綿羊號 900、逃生艙 150。
 * 原作沒有對應的（裁決者號、豪勇號、七號廢站、海盜船、未識別物體、小行星）為自訂。
 */
export const GRAV_PV: Record<string, number> = {
  'station.nyx': 50,
  'station.adjudicatrix': 60,
  'station.tenshu': 80,
  'station.bravado': 60,
  'station.hulk7': 110,
  'station.caldera': 110,
  'station.vivarium': 110,
  'station.portage': 110,
  'station.pirate': 110,
  'station.uo': 110,
  'ship.kestrel': 200,
  'ship.mule': 240,
  'ship.lancer': 180,
  'ship.harrier': 180,
  'ship.woolly': 900,
  'ship.pod': 150,
  'space.asteroid': 110,
}

/** 推動加速度：原作每 0.04 秒位移量 +0.25 units → 1.5625 m/s²（2 秒約 3 m、8 秒約 50 m）*/
export const GRAV_ACCEL = 1.5625
