// 飛船（內容總表「飛船」）：太空層的單位、可停泊的模型、小型內艙版面
import { regAbilities, regBuffs, regUnits } from './registry'
import type { AbilityDef, Loc, UnitDef } from './types'
import type { LayoutSpec } from '../layout'

const L = (zh: string, en: string): Loc => ({ zh, en })

export interface ShipDef {
  id: string
  name: Loc
  space: Omit<UnitDef, 'id' | 'name' | 'model' | 'tags' | 'radius' | 'sight' | 'hpRegen' | 'mp' | 'mpRegen'> & { radius: number }
  layout: LayoutSpec
  /** 停泊模型半徑（站內）*/
  dockRadius: number
}

const shipPois: LayoutSpec['pois'] = {
  c: { kind: 'shipConsole' },
  m: { kind: 'vendor', ref: 'medical' },
  n: { kind: 'vendor', ref: 'maintenance' },
}

const cockpit = (id: string, zh: string, en: string, rows: string[]): LayoutSpec => ({
  rows,
  pois: shipPois,
  rooms: [{ id: 'cabin', name: L(zh, en), type: 'cabin', seed: [4, 3], light: '#9fe7ff', accent: '#ffb46b' }],
})

export const SHIPS: ShipDef[] = [
  {
    id: 'kestrel',
    name: L('紅隼級探索艇', 'Kestrel'),
    space: { hp: 60000, speed: 0.9, radius: 0.9, attack: { dmg: [1299, 1299], cd: 1.6, range: 13, kind: 'projectile', projSpeed: 14, fx: 'shipGun' }, abilities: ['ship.payload', 'ship.overload', 'ship.scan', 'ship.board', 'ship.dock'] },
    layout: cockpit('kestrel', '紅隼駕駛艙', 'Kestrel Cockpit', [
      '  ############',
      '  #...x..x...#',
      '  #..........#',
      '  #E.......c.#',
      '  #..........#',
      '  #...x......#',
      '  ############',
    ]),
    dockRadius: 1.9,
  },
  {
    id: 'mule',
    name: L('騾級運輸艇', 'Mule'),
    space: { hp: 60000, speed: 1.6, radius: 1.0, attack: { dmg: [900, 900], cd: 1.6, range: 13, kind: 'projectile', projSpeed: 14, fx: 'shipGun' }, abilities: ['ship.antiBoard', 'ship.scan', 'ship.board', 'ship.dock'] },
    layout: cockpit('mule', '騾級貨艙', 'Mule Hold', [
      '  ################',
      '  #...x.x.x......#',
      '  #..............#',
      '  #..............#',
      '  #E...........c.#',
      '  #..............#',
      '  #..............#',
      '  #...x.x.x......#',
      '  ################',
    ]),
    dockRadius: 2.1,
  },
  {
    id: 'lancer',
    name: L('槍騎級戰機', 'Lancer'),
    space: { hp: 95000, speed: 1.05, radius: 0.9, attack: { dmg: [2000, 2000], cd: 1.6, range: 11, kind: 'projectile', projSpeed: 16, fx: 'shipGun' }, abilities: ['ship.barrage', 'ship.cloak', 'ship.scan', 'ship.board', 'ship.dock'] },
    layout: cockpit('lancer', '槍騎座艙', 'Lancer Cockpit', [
      '  ##################',
      '  #.....m...n......#',
      '  #................#',
      '  #................#',
      '  #E.............c.#',
      '  #................#',
      '  #................#',
      '  #.....x..........#',
      '  ##################',
    ]),
    dockRadius: 2.0,
  },
  {
    id: 'harrier',
    name: L('獵鷹級獵艦', 'Harrier'),
    space: { hp: 80000, speed: 1.0, radius: 1.1, attack: { dmg: [3000, 3000], cd: 2, range: 16, kind: 'projectile', projSpeed: 14, fx: 'shipGun' }, abilities: ['ship.waveCannon', 'ship.gravBeam', 'ship.scan', 'ship.board', 'ship.dock'] },
    layout: cockpit('harrier', '獵鷹艦橋', 'Harrier Bridge', [
      '  ##################',
      '  #.....m...n......#',
      '  #................#',
      '  #................#',
      '  #................#',
      '  #E.............c.#',
      '  #................#',
      '  #................#',
      '  #................#',
      '  #.....x...x......#',
      '  ##################',
    ]),
    dockRadius: 2.2,
  },
  {
    id: 'woolly',
    name: L('綿羊號', 'Woolly'),
    space: { hp: 60000, speed: 1.4, radius: 0.9, attack: { dmg: [450, 450], cd: 1.6, range: 11, kind: 'projectile', projSpeed: 14, fx: 'shipGun' }, abilities: ['ship.scan', 'ship.board', 'ship.dock'] },
    layout: cockpit('woolly', '綿羊號艙房', 'Woolly Cabin', [
      '  #############',
      '  #....x......#',
      '  #...........#',
      '  #...........#',
      '  #E........c.#',
      '  #...........#',
      '  #...........#',
      '  #...........#',
      '  #############',
    ]),
    dockRadius: 1.9,
  },
]

export const SHIP_BY_ID = new Map(SHIPS.map((s) => [s.id, s]))

const shipUnits: UnitDef[] = []
for (const s of SHIPS) {
  shipUnits.push({
    id: 'ship.' + s.id,
    name: s.name,
    model: 'ship.' + s.id,
    hpRegen: 0,
    mp: 100,
    mpRegen: 0.5,
    sight: 16,
    tags: ['ship', 'space', 'mechanical', 'pilotable'],
    layer: 'space',
    ...s.space,
  })
  shipUnits.push({
    id: 'docked.' + s.id,
    name: s.name,
    model: 'ship.' + s.id,
    hp: s.space.hp,
    hpRegen: 0,
    mp: 0,
    mpRegen: 0,
    speed: 0,
    radius: s.dockRadius,
    sight: 4,
    abilities: [],
    tags: ['structure', 'mechanical', 'ship'],
    scale: 2.4,
  })
}
shipUnits.push(
  { id: 'ship.pod', name: L('救生艙', 'Escape Pod'), model: 'ship.pod', hp: 18000, hpRegen: 0, mp: 0, mpRegen: 0, speed: 1.8, radius: 0.5, sight: 10, abilities: ['pod.trajectory'], tags: ['ship', 'space', 'mechanical'], layer: 'space' },
  { id: 'ship.wasp', name: L('胡蜂無人戰機', 'Wasp Drone'), model: 'ship.wasp', hp: 7500, hpRegen: 0, mp: 0, mpRegen: 0, speed: 1.2, radius: 0.5, sight: 14, abilities: [], tags: ['ship', 'space', 'mechanical', 'drone'], layer: 'space', attack: { dmg: [199, 199], cd: 1.2, range: 7, kind: 'projectile', projSpeed: 14, fx: 'shipGun' }, ai: 'spaceHunter' },
  { id: 'space.asteroid', name: L('小行星', 'Asteroid'), model: 'space.asteroid', hp: 20000, hpRegen: 0, mp: 0, mpRegen: 0, speed: 1.0, radius: 0.9, sight: 0, abilities: [], tags: ['space', 'mechanical'], layer: 'space' },
  { id: 'space.sun', name: L('恆星 阿斯特', 'Aster'), model: 'space.sun', hp: 800000, hpRegen: 0, mp: 0, mpRegen: 0, speed: 0, radius: 3.2, sight: 0, abilities: [], tags: ['space', 'invuln', 'noTarget'], layer: 'space' },
)
regUnits(shipUnits)

regBuffs([
  { id: 'bf.overload', name: L('超載', 'Overload'), icon: 'bolt', vis: 'all', good: true, dur: 8, atkSpeed: 2 },
  { id: 'bf.shipCloak', name: L('隱蔽', 'Cloaked'), icon: 'cloak', vis: 'all', good: true, dur: 20, stealth: true, breakOnAttack: true },
  { id: 'bf.tractor', name: L('牽引', 'Tractored'), icon: 'beam', vis: 'all', good: false, dur: 8, rooted: true },
  { id: 'bf.boarding', name: L('登艦連結', 'Boarding Link'), icon: 'door', vis: 'all', good: false, dur: 20, rooted: true },
  { id: 'bf.acePilot', name: L('王牌駕駛', 'Ace Pilot'), icon: 'ship', vis: 'all', good: true, atkSpeed: 1.15 },
  { id: 'bf.gravPilot', name: L('重力學駕駛', 'Gravitic Pilot'), icon: 'ship', vis: 'self', good: true, move: 1.15 },
  { id: 'bf.podArrive', name: L('著陸保護', 'Landing Shield'), icon: 'shield', vis: 'all', good: true, dur: 4, invuln: true },
])

const A = (a: AbilityDef) => a
regAbilities([
  A({ id: 'ship.dock', name: L('停靠', 'Dock'), desc: L('停靠到附近的站點，船艇會落在對方的停機坪上。', 'Dock with a nearby station; the craft lands on one of its pads.'), icon: 'ship', target: 'unit', range: 2, cd: 30, mana: 0, filter: { station: true }, effects: [{ k: 'script', fn: 'space.dock' }] }),
  A({ id: 'ship.board', name: L('強行登艦', 'Board'), desc: L('鎖住另一艘船 20 秒，期間兩艘船的出入口互通。', 'Latch onto another craft for 20 s; both airlocks connect.'), icon: 'door', target: 'unit', range: 2.5, cd: 0, mana: 0, cast: 3, filter: { ship: true }, effects: [{ k: 'script', fn: 'space.board' }] }),
  A({ id: 'ship.scan', name: L('生命掃描', 'Lifeform Scan'), desc: L('掃描目標站點或船艦，回報裡面有多少人。', 'Scan a station or craft and report how many people are aboard.'), icon: 'scan', target: 'unit', range: 15, cd: 27, mana: 0, cast: 2, effects: [{ k: 'script', fn: 'space.scan' }] }),
  A({ id: 'ship.payload', name: L('末日酬載', 'Doomsday Payload'), desc: L('投下一枚 3 秒後引爆的重型炸彈，對站點特別有效。', 'Drop a heavy charge that detonates after 3 s; devastating to stations.'), icon: 'bomb', target: 'point', range: 6, cd: 120, mana: 50, aoe: 4, effects: [{ k: 'fx', fx: 'castStart', at: 'point' }, { k: 'delay', t: 3, then: [{ k: 'damage', amount: 30000, to: 'point', aoe: 4 }, { k: 'fx', fx: 'boom', at: 'point' }] }] }),
  A({ id: 'ship.overload', name: L('武器超載', 'Weapon Overload'), desc: L('8 秒內攻擊速度加倍。', 'Double fire rate for 8 s.'), icon: 'bolt', target: 'none', cd: 45, mana: 30, effects: [{ k: 'buff', buff: 'bf.overload', to: 'self' }] }),
  A({ id: 'ship.antiBoard', name: L('反登艦脈衝', 'Repulse Pulse'), desc: L('釋放脈衝推開周圍船艦並切斷登艦連結。', 'Pulse that shoves nearby craft away and severs boarding links.'), icon: 'force', target: 'none', cd: 30, mana: 30, effects: [{ k: 'knockback', dist: 4, aoe: 5, from: 'self' }, { k: 'script', fn: 'space.unboard' }] }),
  A({ id: 'ship.barrage', name: L('飛彈齊射', 'Missile Barrage'), desc: L('向目標區域連射 8 枚飛彈。', 'Fire eight missiles at an area.'), icon: 'rocket', target: 'point', range: 12, cd: 40, mana: 40, aoe: 3, effects: [{ k: 'projectile', speed: 12, fx: 'rocket', to: 'point', count: 8, spread: 0.6, onHit: [{ k: 'damage', amount: 900, to: 'point', aoe: 1.5 }] }] }),
  A({ id: 'ship.cloak', name: L('隱蔽力場', 'Cloaking Field'), desc: L('隱形 20 秒，開火即解除。', 'Turn invisible for 20 s; firing breaks it.'), icon: 'cloak', target: 'none', cd: 60, mana: 50, effects: [{ k: 'buff', buff: 'bf.shipCloak', to: 'self' }] }),
  A({ id: 'ship.waveCannon', name: L('聚焦波砲', 'Focused Wave Cannon'), desc: L('沿直線發射貫穿一切的能量波。', 'Fire a piercing energy wave in a straight line.'), icon: 'beam', target: 'point', range: 16, cd: 50, mana: 60, effects: [{ k: 'projectile', speed: 20, fx: 'photon', to: 'point', pierce: true, range: 18, onHit: [{ k: 'damage', amount: 20000, to: 'target' }] }] }),
  A({ id: 'ship.gravBeam', name: L('重力光束', 'Gravity Beam'), desc: L('鎖住一艘船或站點，讓它 8 秒動彈不得。', 'Pin a craft or station in place for 8 s.'), icon: 'beam', target: 'unit', range: 12, cd: 45, mana: 50, effects: [{ k: 'buff', buff: 'bf.tractor', to: 'target' }] }),
  A({ id: 'pod.trajectory', name: L('設定航線', 'Set Trajectory'), desc: L('選擇要飛往的站點。', 'Pick the station to fly to.'), icon: 'pod', target: 'unit', range: 200, cd: 2, mana: 0, filter: { station: true }, effects: [{ k: 'script', fn: 'space.podTarget' }] }),
  A({ id: 'st.sweep', name: L('站內監控掃描', 'Surveillance Sweep'), desc: L('標出這座站裡每個人的位置（只有你看得到，7 秒）。全站都會收到掃描廣播。', 'Mark everyone aboard this station for 7 s (only you see it). The whole station hears the announcement.'), icon: 'radar', target: 'none', cd: 45, mana: 0, effects: [{ k: 'script', fn: 'space.sweep' }] }),
  A({ id: 'st.forceDock', name: L('強制停靠', 'Tractor Dock'), desc: L('把遠方的一艘小船強制拖回女帝號停機坪。', 'Haul a distant small craft back to the Empress Nyx hangar.'), icon: 'beam', target: 'unit', range: 100, cd: 10, mana: 0, filter: { ship: true }, effects: [{ k: 'script', fn: 'space.forceDock' }] }),
])
