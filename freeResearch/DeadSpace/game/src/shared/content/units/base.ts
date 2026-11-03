// 基礎單位：未著裝人員與站內設施
import { regUnits } from '../registry'
import type { UnitDef } from '../types'

const S = (id: string, zh: string, en: string, hp: number, model: string, extra: Partial<UnitDef> = {}): UnitDef => ({
  id,
  name: { zh, en },
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

export const PERSONNEL: UnitDef = {
  id: 'personnel',
  name: { zh: '船員', en: 'Personnel' },
  model: 'human',
  hp: 400,
  hpRegen: 1.5,
  mp: 100,
  mpRegen: 0.5,
  speed: 3.19,
  radius: 0.4,
  sight: 13,
  attack: { dmg: [17, 21], cd: 1.2, range: 5, kind: 'hitscan', fx: 'pistol' },
  abilities: [],
  tags: ['personnel', 'organic'],
  inv: 6,
  corpse: true,
}

regUnits([
  PERSONNEL,
  // 站點主控台：HP 依站覆寫（StationDef.console；女帝／豪勇／火口 11000、裁決者 6000＋每秒回 100、天守 3000、擺渡號無敵）
  S('struct.console', '控制台', 'Control Console', 11000, 'console', { tags: ['structure', 'mechanical', 'console'] }),
  // 被打爆的主控台留下的殘骸（灰色、1 HP、無敵）：保留原本的 POI 資料，用站點介面裝置修好就換回正常控制台（space.ts）
  S('struct.consoleBroken', '損毀的控制台', 'Destroyed Console', 1, 'consoleBroken', {
    tags: ['structure', 'mechanical', 'console', 'invuln'],
  }),
  // 海盜船主控台：屬敵方、2000 HP、不可駕駛；打爆後 40 秒自爆（原作 h02A；研究 03 §6.2 事件 #4）
  S('struct.consolePirate', '海盜船主控台', 'Pirate Main Console', 2000, 'console', { tags: ['structure', 'mechanical', 'console'] }),
  // 動力分配台：原作 h048 無敵（研究 03 §4.4）
  S('struct.power', '動力分配台', 'Power Distributor', 8000, 'powerConsole', { tags: ['structure', 'mechanical', 'console', 'invuln'] }),
  S('struct.git', '基因完整性檢測儀', 'Genetic Integrity Tester', 6000, 'git', { radius: 0.9 }),
  // 生命再生器：原作 h010 帶 Aloc（不可選取、不可攻擊），只有被動光環
  S('struct.regen', '生命再生器', 'Life Regenerator', 3000, 'regenerator', { radius: 0.5, tags: ['structure', 'mechanical', 'invuln', 'noTarget'] }),
  S('struct.rummage', '雜物箱', 'Supply Crate', 150, 'crate', { radius: 0.5 }),
  S('struct.droneControl', '無人機控制圈', 'Drone Control Ring', 1, 'droneRing', {
    tags: ['structure', 'invuln', 'noTarget'],
    radius: 0.8,
  }),
  S('struct.enhancer', '強化劑注射站', 'Enhancement Station', 1, 'enhancer', { tags: ['structure', 'invuln'] }),
  S('groundItem', '物品', 'Item', 1, 'groundItem', { tags: ['invuln'], radius: 0.3, sight: 0 }),
  S('corpse', '屍體', 'Corpse', 1, 'corpse', { tags: ['corpse', 'invuln', 'noTarget'], radius: 0.4, sight: 0 }),
  S('rubble', '瓦礫', 'Rubble', 400, 'rubble', { tags: ['rubble', 'structure', 'mechanical'], radius: 0.5, sight: 0 }),
])
