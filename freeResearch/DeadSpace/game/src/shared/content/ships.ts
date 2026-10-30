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
  // ───── 站點技能（M7）─────
  // 天守主砲擊中：5 秒內共 200000（研究 03 §4.2：每 0.04 秒 1600）
  { id: 'bf.cannonBurn', name: L('主砲灼蝕', 'Main Gun Burn'), icon: 'fire', vis: 'all', good: false, dur: 5, dot: 40000, dotKind: 'chaos' },
  // 豪勇號降落在翠原星上：藏在地表，不能動、不能開火、不會被打
  { id: 'bf.landed', name: L('已降落', 'Landed'), icon: 'ship', vis: 'all', good: true, rooted: true, disarm: true, invuln: true },
  // 擺渡號傳送台充能、女帝號跳躍充能：不能移動也不能再下令
  { id: 'bf.portCharge', name: L('傳送充能', 'Transit Charging'), icon: 'teleport', vis: 'all', good: true, dur: 19.5, silence: true },
  { id: 'bf.jumpCharge', name: L('跳躍充能', 'Jump Charging'), icon: 'teleport', vis: 'all', good: true, dur: 20, rooted: true, silence: true, disarm: true },
  // 紅隼升級模組（研究 03 §3.2 RUM：+30 移速、+400 傷害；+30000 HP 由 sim 直接加在最大生命）
  { id: 'bf.kestrelMk2', name: L('紅隼升級', 'Kestrel Refit'), icon: 'module', vis: 'all', good: true, moveAdd: 0.3, dmgMult: 1699 / 1299 },
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
  // ───── 站點技能（M7；研究 03 §2.3、§4.2、§4.7）─────
  A({
    id: 'st.cannon',
    name: L('天守主砲', 'Tenshu Main Gun'),
    desc: L('對星區裡任何一座站發射追蹤能量球（小船打不到）。能量球碰到的第一座站會在 5 秒內承受 200000 傷害；目標消失就改追翠原星。全星區都會聽到開砲廣播。', 'Fire a homing charge at any station in the sector (small craft cannot be targeted). The first station it touches takes 200000 damage over 5 s; if the target is gone it veers toward Verdance. The whole sector hears it fire.'),
    icon: 'beam',
    target: 'unit',
    range: 150,
    cd: 220,
    mana: 0,
    filter: { station: true },
    effects: [{ k: 'script', fn: 'st.cannon' }],
  }),
  A({
    id: 'st.antimatter',
    name: L('反物質傳送', 'Antimatter Transit'),
    desc: L('一次性：鎖定一座站，60 秒後直接把一發反物質傳送到它身上（900000 傷害）。鎖定會向全星區廣播。', 'One shot: lock onto a station and, 60 s later, warp an antimatter charge straight into it (900000 damage). The lock is broadcast sector-wide.'),
    icon: 'bomb',
    target: 'unit',
    range: 150,
    cd: 40,
    mana: 0,
    once: true,
    filter: { station: true },
    effects: [{ k: 'script', fn: 'st.antimatter' }],
  }),
  A({
    id: 'st.land',
    name: L('降落程序', 'Landing Procedure'),
    desc: L('靠近翠原星後施放（10 秒）：豪勇號降落在地表，艦內的降落傳送門與地表傳送門雙向連通。', 'Cast near Verdance (10 s): the Bravado sets down on the surface and its landing portal links both ways with the one on the ground.'),
    icon: 'ship',
    target: 'unit',
    range: 1.4,
    cast: 10,
    cd: 240,
    mana: 0,
    filter: { defs: ['station.verdance'] },
    effects: [{ k: 'script', fn: 'st.land' }],
  }),
  A({
    id: 'st.launch',
    name: L('升空', 'Lift Off'),
    desc: L('45 秒後豪勇號從翠原星升空，傳送門關閉。', 'In 45 s the Bravado lifts off from Verdance and the portals shut.'),
    icon: 'rocket',
    target: 'none',
    cd: 40,
    mana: 0,
    effects: [{ k: 'script', fn: 'st.launch' }],
  }),
  A({
    id: 'st.autopilot',
    name: L('自動駕駛', 'Autopilot'),
    desc: L('交出控制台，讓豪勇號沿目前航向自行前進 50 公尺。', 'Hand over the helm; the Bravado cruises 50 m along its current heading on its own.'),
    icon: 'speed',
    target: 'none',
    cd: 10,
    mana: 0,
    effects: [{ k: 'script', fn: 'st.autopilot' }],
  }),
  A({
    id: 'st.portTarget',
    name: L('選擇傳送目標', 'Select Transit Target'),
    desc: L('選一座站或一艘船作為傳送目的地。', 'Pick the station or craft to send people to.'),
    icon: 'scan',
    target: 'unit',
    range: 200,
    cd: 1,
    mana: 0,
    effects: [{ k: 'script', fn: 'st.portTarget' }],
  }),
  A({
    id: 'st.portActivate',
    name: L('啟動傳送台', 'Activate Transit Pads'),
    desc: L('充能 19.5 秒，然後把站在傳送台上的所有人送到目標站（抵達後 5 秒無敵）。', 'Charge for 19.5 s, then send everyone standing on the transit pads to the target (5 s invulnerable on arrival).'),
    icon: 'teleport',
    target: 'none',
    cd: 3,
    mana: 0,
    effects: [{ k: 'script', fn: 'st.portActivate' }],
  }),
  A({
    id: 'st.repair',
    name: L('外部維修光束', 'External Repair Beam'),
    desc: L('修復目標站 1200 點（耗 1 能量）。可自動施放：自動修附近受損的站。', 'Repair a station for 1200 (1 energy). Autocast: keeps fixing damaged stations nearby.'),
    icon: 'wrench',
    target: 'unit',
    range: 9,
    cd: 0.5,
    mana: 1,
    autocast: true,
    filter: { station: true },
    effects: [{ k: 'heal', amount: 1200, to: 'target' }, { k: 'fx', fx: 'repairBeam', at: 'line' }],
  }),
  A({
    id: 'st.cordon',
    name: L('封鎖信標', 'Cordoning Beacon'),
    desc: L('對一座站或一艘船發射封鎖信標：裡面所有的門鎖死 20 秒。', 'Fire a cordoning beacon at a station or craft: every door inside locks for 20 s.'),
    icon: 'door',
    target: 'unit',
    range: 6,
    cd: 30,
    mana: 40,
    effects: [{ k: 'script', fn: 'st.cordon' }],
  }),
  A({
    id: 'st.neurotox',
    name: L('神經毒素灌注', 'Neurotoxin Flood'),
    desc: L('引導最多 180 秒：目標站或船內（含停在裡面的船）每個人每秒受到 5 點起、逐秒增加的毒傷。仿生人免疫。', 'Channel up to 180 s: everyone inside the target (and craft docked there) takes poison each second, starting at 5 and climbing. Androids are immune.'),
    icon: 'infect',
    target: 'unit',
    range: 9,
    cd: 60,
    mana: 0,
    channel: 180,
    channelTick: 1,
    tickEffects: [{ k: 'script', fn: 'st.neurotoxTick' }],
    effects: [{ k: 'script', fn: 'st.neurotoxStart' }],
  }),
  A({
    id: 'st.jump',
    name: L('輔助推進跳躍', 'Auxiliary Jump'),
    desc: L('充能 20 秒（不能移動），然後女帝號瞬間移到目標點。', 'Charge for 20 s (immobile), then the Empress Nyx jumps to the target point.'),
    icon: 'teleport',
    target: 'point',
    range: 200,
    cd: 240,
    mana: 0,
    effects: [{ k: 'script', fn: 'st.jump' }],
  }),
  // 紅隼升級模組：酬載與超載升級（研究 03 §3.2 RUM；數值以本作 L1 等比放大，自訂）
  A({ id: 'ship.payload2', name: L('末日酬載 II', 'Doomsday Payload II'), desc: L('投下一枚 3 秒後引爆的重型炸彈，威力與射程比原型更大。', 'Drop a heavier charge that detonates after 3 s, with more punch and reach.'), icon: 'bomb', target: 'point', range: 9, cd: 100, mana: 50, aoe: 4.5, effects: [{ k: 'fx', fx: 'castStart', at: 'point' }, { k: 'delay', t: 3, then: [{ k: 'damage', amount: 50000, to: 'point', aoe: 4.5 }, { k: 'fx', fx: 'boom', at: 'point' }] }] }),
  A({ id: 'ship.overload2', name: L('武器超載 II', 'Weapon Overload II'), desc: L('8 秒內攻擊速度加倍，冷卻更短。', 'Double fire rate for 8 s on a shorter cooldown.'), icon: 'bolt', target: 'none', cd: 34, mana: 30, effects: [{ k: 'buff', buff: 'bf.overload', to: 'self' }] }),
])
