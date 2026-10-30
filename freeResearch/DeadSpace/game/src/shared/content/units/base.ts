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
  S('struct.console', '控制台', 'Control Console', 11000, 'console', { tags: ['structure', 'mechanical', 'console'] }),
  S('struct.consoleBroken', '損毀的控制台', 'Destroyed Console', 1, 'consoleBroken', {
    tags: ['structure', 'mechanical', 'console', 'invuln'],
  }),
  S('struct.power', '動力分配台', 'Power Distributor', 8000, 'powerConsole', { tags: ['structure', 'mechanical', 'console'] }),
  S('struct.git', '基因完整性檢測儀', 'Genetic Integrity Tester', 6000, 'git', { radius: 0.9 }),
  S('struct.regen', '生命再生器', 'Life Regenerator', 3000, 'regenerator', { radius: 0.5 }),
  S('struct.rummage', '雜物箱', 'Supply Crate', 150, 'crate', { radius: 0.5 }),
  S('struct.droneControl', '無人機控制圈', 'Drone Control Ring', 1, 'droneRing', {
    tags: ['structure', 'invuln', 'noTarget'],
    radius: 0.8,
  }),
  S('struct.pad', '停機坪', 'Landing Pad', 1, 'pad', { tags: ['structure', 'invuln', 'noTarget'], radius: 3 }),
  S('struct.enhancer', '強化劑注射站', 'Enhancement Station', 1, 'enhancer', { tags: ['structure', 'invuln'] }),
])
