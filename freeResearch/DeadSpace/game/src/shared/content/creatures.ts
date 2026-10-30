// 生物與 NPC（內容總表 §8、研究 03 §7）
import { regAbilities, regBuffs, regUnits } from './registry'
import type { Loc, Tag, UnitDef } from './types'

const L = (zh: string, en: string): Loc => ({ zh, en })

function C(id: string, zh: string, en: string, hp: number, extra: Partial<UnitDef> & { tags?: Tag[] }): UnitDef {
  return {
    id,
    name: L(zh, en),
    model: id,
    hp,
    hpRegen: 0.3,
    mp: 0,
    mpRegen: 0,
    speed: 2.4,
    radius: 0.35,
    sight: 10,
    abilities: [],
    corpse: true,
    ...extra,
    tags: ['creature', ...(extra.tags ?? [])],
  }
}

const melee = (dmg: number, cd = 1.2, range = 1.2, fx = 'bite') => ({ dmg: [Math.round(dmg * 0.9), Math.round(dmg * 1.1)] as [number, number], cd, range, kind: 'melee' as const, fx })
const ranged = (dmg: number, cd: number, range: number, fx = 'rifle') => ({ dmg: [Math.round(dmg * 0.9), Math.round(dmg * 1.1)] as [number, number], cd, range, kind: 'hitscan' as const, fx })

export const CREATURE_LIST: UnitDef[] = [
  // ───── 翠原星與活體庫號的小生物（可吞食）─────
  C('creature.slugling', '蛞蝓仔', 'Slugling', 60, { speed: 1.6, radius: 0.3, devourEp: 25, ai: 'critter', tags: ['animal'] }),
  C('creature.elderSlug', '蛞蝓長老', 'Elder Slugling', 120, { speed: 1.2, radius: 0.4, devourEp: 25, ai: 'elder', inv: 3, tags: ['animal'] }),
  C('creature.chicken', '雞', 'Chicken', 30, { speed: 2.4, radius: 0.25, devourEp: 25, ai: 'critter', tags: ['animal'] }),
  C('creature.frog', '蛙', 'Frog', 20, { speed: 1.8, radius: 0.2, devourEp: 25, ai: 'critter', tags: ['animal'] }),
  C('creature.rabbit', '兔', 'Rabbit', 30, { speed: 3.2, radius: 0.25, devourEp: 25, ai: 'critter', tags: ['animal'] }),
  C('creature.sheep', '羊', 'Sheep', 60, { speed: 1.8, radius: 0.4, devourEp: 25, ai: 'critter', tags: ['animal'] }),
  C('creature.stag', '鹿', 'Stag', 120, { speed: 3.0, radius: 0.5, devourEp: 25, ai: 'critter', tags: ['animal'] }),
  // ───── 實驗體 ─────
  C('creature.failed', '失敗實驗體', 'Failed Experiment', 200, { speed: 1.3, radius: 0.45, devourEp: 25, ai: 'critter' }),
  C('creature.failedSheep', '失敗實驗體', 'Failed Experiment', 200, { speed: 1.3, radius: 0.45, devourEp: 25, ai: 'critter', drops: [{ item: 'sheepPlush', p: 1 }] }),
  C('creature.failedHostile', '暴走實驗體', 'Rampant Experiment', 200, { speed: 2.2, radius: 0.45, devourEp: 25, ai: 'hostile', attack: melee(18), flags: { explode: 60 } }),
  C('creature.failedBrute', '暴走實驗體（巨型）', 'Rampant Hulk', 800, { speed: 1.8, radius: 0.7, devourEp: 25, ai: 'hostile', attack: melee(40, 1.5), flags: { explode: 150 } }),
  C('creature.failedSwift', '暴走實驗體（迅捷）', 'Rampant Runner', 300, { speed: 3.2, radius: 0.4, devourEp: 25, ai: 'hostile', attack: melee(16, 0.9) }),
  C('creature.anomaly', '異常體', 'Anomaly', 5, { speed: 4.5, radius: 0.3, devourEp: 125, ai: 'skittish', tags: ['animal'] }),
  C('creature.anomalyCaged', '異常體', 'Anomaly', 5, {
    speed: 4.5,
    radius: 0.3,
    devourEp: 25,
    ai: 'skittish',
    tags: ['animal'],
    drops: [
      { item: 'singularity', p: 0.01 },
      { item: 'captainCard', p: 0.02 },
      { item: 'suit.mirage', p: 0.02 },
      { item: 'suit.operative', p: 0.02 },
      { item: 'modScanAmp', p: 0.02 },
      { item: 'modAntimatter', p: 0.02 },
      { item: 'modKestrel', p: 0.02 },
      { item: 'modThruster', p: 0.02 },
      { item: 'refinedOre', p: 0.02 },
      { item: 'modNeurotoxin', p: 0.02 },
      { item: 'fusionCharge', p: 0.04 },
      { item: 'protoPortal', p: 0.03 },
      { item: 'tetracyne', p: 0.04 },
      { item: 'mediSwarm', p: 0.05 },
      { item: 'traumaKit', p: 0.2 },
      { item: 'stim', p: 0.3 },
    ],
  }),
  C('creature.anomalyRich', '異常體', 'Anomaly', 5, { speed: 4.5, radius: 0.3, devourEp: 125, ai: 'skittish', tags: ['animal'], drops: [{ item: 'criticalCare', p: 1 }] }),
  // ───── 敵對生物 ─────
  C('creature.snowgle', '雪團獸', 'Snowgle', 900, { speed: 2.6, radius: 0.55, hpRegen: 0.75, ai: 'hostile', attack: melee(14), drops: [{ item: 'hormoneBooster', p: 1 }] }),
  C('creature.snowgleWarden', '雪團守衛', 'Snowgle Warden', 700, { speed: 2.8, radius: 0.6, ai: 'hostile', attack: melee(19) }),
  C('creature.skitter', '竄蟲', 'Skitter', 300, { speed: 3.2, radius: 0.4, ai: 'hostile', attack: melee(24, 1) }),
  C('creature.skitterOverseer', '竄蟲監工', 'Skitter Overseer', 700, { speed: 3.4, radius: 0.55, ai: 'hostile', attack: melee(24, 1) }),
  C('creature.murmaw', '吼顎獸', 'Murmaw', 1500, { speed: 2.0, radius: 0.8, ai: 'hostile', attack: melee(90, 1.6, 1.6) }),
  C('creature.freakman', '畸人', 'Freakman', 600, { speed: 2.6, radius: 0.45, ai: 'hostile', attack: melee(32), drops: [{ item: 'protoPortal', p: 1 }] }),
  C('creature.greyFox', '灰狐', 'Grey Fox', 800, { speed: 3.4, radius: 0.4, hpRegen: 25, ai: 'fox', attack: melee(29, 1), drops: [{ item: 'penguinPlush', p: 1 }], flags: { stealth: true, fireImmune: true } }),
  C('creature.entity', '未知存在', 'Unknown Entity', 1, { speed: 1, radius: 0.4, ai: 'entity', tags: ['invuln', 'noTarget'], corpse: false, flags: { auraDps: 5 } }),
  C('npc.deadScientist', '殉職研究員', 'Fallen Researcher', 1, { speed: 0, radius: 0.4, model: 'human', tags: ['invuln'], corpse: false, ai: 'decor' }),
  // ───── 海盜 ─────
  C('pirate.captain', '黑鷗船長', 'Black Gull Captain', 800, { speed: 2.8, radius: 0.45, model: 'pirate', ai: 'hostile', attack: ranged(28, 1.2, 6), drops: [{ item: 'pirateHat', p: 1 }], tags: ['npc'] }),
  C('pirate.crew', '黑鷗海盜', 'Black Gull Pirate', 250, { speed: 2.8, radius: 0.42, model: 'pirate', ai: 'hostile', attack: ranged(16, 1.2, 6), tags: ['npc'] }),
  C('pirate.sentry', '海盜哨戟', 'Pirate Sentry', 200, { speed: 0, radius: 0.4, model: 'sentry', ai: 'turret', attack: ranged(2, 0.15, 6.5, 'gatling'), corpse: false, tags: ['mechanical', 'device'] }),
  // ───── 站方 NPC ─────
  C('npc.pacifier', '綏靖機器人', 'Pacification Bot', 2000, { speed: 2.8, radius: 0.6, model: 'pacifier', ai: 'pacifier', attack: ranged(34, 1.5, 7, 'heavyRifle'), corpse: false, inv: 6, tags: ['mechanical', 'npc', 'chassis'] }),
  C('npc.defenseDrone', '防禦無人機', 'Defense Drone', 350, { speed: 3.6, radius: 0.5, model: 'defenseDrone', ai: 'drone', attack: ranged(39, 1.2, 5, 'rifle'), abilities: ['drone.rockets'], corpse: false, sight: 18, tags: ['mechanical', 'drone', 'flying', 'pilotable'] }),
  C('npc.slugOperative', '蛞蝓特工', 'Slugling Operative', 300, { speed: 3.4, radius: 0.35, model: 'creature.slugling', ai: 'operative', attack: melee(20), tags: ['npc'] }),
  C('npc.crew', '船員', 'Crewman', 400, { speed: 2.9, radius: 0.4, model: 'human', ai: 'crew', devourEp: 25, attack: ranged(17, 1.4, 5, 'pistol'), inv: 6, tags: ['npc', 'organic', 'personnel'] }),
  // ───── 太空 ─────
  C('fleet.censure', '譴責號', 'Censure', 150000, { speed: 0.65, radius: 2.0, model: 'fleet.cruiser', layer: 'space', ai: 'fleet', attack: { dmg: [400, 400], cd: 0.6, range: 16, kind: 'projectile', projSpeed: 18, fx: 'stationGun' }, corpse: false, sight: 30, tags: ['space', 'mechanical', 'ship'] }),
  C('fleet.erstfall', '舊往號', 'Erstfall', 150000, { speed: 0.65, radius: 2.0, model: 'fleet.cruiser', layer: 'space', ai: 'fleet', attack: { dmg: [400, 400], cd: 0.6, range: 16, kind: 'projectile', projSpeed: 18, fx: 'stationGun' }, corpse: false, sight: 30, tags: ['space', 'mechanical', 'ship'] }),
  C('fleet.hydra', '九頭蛇號', 'Hydra', 300000, { speed: 0.6, radius: 3.0, model: 'fleet.capital', layer: 'space', ai: 'fleet', attack: { dmg: [200, 200], cd: 0.15, range: 18, kind: 'projectile', projSpeed: 20, fx: 'stationGun' }, corpse: false, sight: 30, tags: ['space', 'mechanical', 'ship'] }),
  C('fleet.kestrel', '紅隼級探索艇（艦隊）', 'Kestrel Mk II', 60000, { speed: 0.8, radius: 0.9, model: 'ship.kestrel', layer: 'space', ai: 'fleet', attack: { dmg: [1100, 1100], cd: 1.6, range: 13, kind: 'projectile', projSpeed: 14, fx: 'shipGun' }, corpse: false, sight: 20, tags: ['space', 'mechanical', 'ship'] }),
]

regUnits(CREATURE_LIST)

regBuffs([
  { id: 'bf.innateStealth', name: L('隱匿', 'Unseen'), icon: 'cloak', vis: 'self', good: true, stealth: true },
  { id: 'bf.slugPossess', name: L('附身', 'Possessed'), icon: 'ghost', vis: 'self', good: true, moveAdd: 1.7 },
])

regAbilities([
  {
    id: 'drone.rockets',
    name: L('火箭儲備', 'Rocket Reserves'),
    desc: L('對目標區域齊射一輪火箭。', 'Salvo a round of rockets at an area.'),
    icon: 'rocket',
    target: 'point',
    range: 8,
    cd: 24,
    mana: 0,
    aoe: 2,
    effects: [{ k: 'projectile', speed: 14, fx: 'rocket', to: 'point', count: 4, spread: 0.4, onHit: [{ k: 'damage', amount: 35, to: 'point', aoe: 1.5 }] }],
  },
])
