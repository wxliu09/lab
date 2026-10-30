// 18 套防護服（content-catalog「防護服（18 套）」、研究 02 §9.1）。
// 穿上防護服＝人員單位原地變形成著裝單位（items.ts 的 wearSuit／morph，HP% 保留）；脫下用通用技能 suit.drop。
// 原作的 IsSuit Tag、zDrop Suit、各種 * Attachment 不是技能：Attachment 只描述普攻特性，寫進 attack。
// 效果原語表達不了的部分在 src/sim/scripts/suits.ts 以 regScript 實作（下面以 S('名稱') 呼叫）。
// 所有名稱與描述為本作原創撰寫。
import { regAbilities, regBuffs, regItems, regUnits } from './registry'
import type { AbilityDef, AttackDef, BuffDef, Effect, ItemDef, Loc, TargetKind, UnitDef } from './types'

const L = (zh: string, en: string): Loc => ({ zh, en })

/** 呼叫 script */
const S = (fn: string, p?: Record<string, number | string | boolean>): Effect => (p ? { k: 'script', fn, p } : { k: 'script', fn })

/** 內容總表只列基礎攻擊值；給 ±8% 的浮動（小數值不浮動），平均值等於總表 */
const atk = (n: number): [number, number] => (n >= 10 ? [Math.round(n * 0.92), Math.round(n * 1.08)] : [n, n])

function ab(id: string, name: Loc, desc: Loc, icon: string, target: TargetKind, cd: number, mana: number, effects: Effect[], extra: Partial<AbilityDef> = {}): AbilityDef {
  return { id, name, desc, icon, target, cd, mana, effects, ...extra }
}

function bf(id: string, name: Loc, icon: string, good: boolean, extra: Partial<BuffDef> = {}): BuffDef {
  return { id, name, icon, vis: 'all', good, ...extra }
}

interface SuitSpec {
  id: string
  name: Loc
  hp: number
  speed: number
  attack: AttackDef
  /** 主動技能在前（最多 5 個）、被動在後；suit.drop 自動補在最後 */
  abilities: string[]
  item: Loc
}

const SUIT_SPECS: SuitSpec[] = []

function suit(s: SuitSpec): void {
  SUIT_SPECS.push(s)
}

/** 著裝單位共用數值（研究 02 §9.1：穿衣後回血 0.75）*/
function suitUnit(s: SuitSpec): UnitDef {
  return {
    id: s.id,
    name: s.name,
    model: 'human',
    hp: s.hp,
    hpRegen: 0.75,
    mp: 100,
    mpRegen: 0.6,
    speed: s.speed,
    radius: 0.42,
    sight: 13,
    attack: s.attack,
    abilities: [...s.abilities, 'suit.drop'],
    tags: ['personnel', 'suit'],
    inv: 6,
    corpse: true,
  }
}

/** 技能召喚出的地面物件（雷暴、火海、酸池、毒雲、輻射區、電漿球）：不能被選取、不會被打 */
function fieldUnit(id: string, zh: string, en: string, model: string, radius: number): UnitDef {
  return { id, name: L(zh, en), model, hp: 1, hpRegen: 0, mp: 0, mpRegen: 0, speed: 0, radius, sight: 0, abilities: [], tags: ['noTarget', 'invuln'], corpse: false }
}

/** 技能放置的小型裝置（可以被打爆）*/
function deviceUnit(id: string, zh: string, en: string, model: string, hp: number, radius: number, extra: Partial<UnitDef> = {}): UnitDef {
  return { id, name: L(zh, en), model, hp, hpRegen: 0, mp: 0, mpRegen: 0, speed: 0, radius, sight: 0, abilities: [], tags: ['device', 'mechanical'], corpse: false, ...extra }
}

const ABILITIES: AbilityDef[] = []
const BUFFS: BuffDef[] = []
const HELPERS: UnitDef[] = []

// ───────── 通用 ─────────

ABILITIES.push(
  ab(
    'suit.drop',
    L('脫下防護服', 'Shed Rig'),
    L('解開扣環、退出外骨骼，變回一般船員；防護服會放回背包（背包滿了就放在腳邊）。', 'Unlatch and step out of the exoskeleton. You return to a regular crew body and the rig goes back into your pack (or at your feet if the pack is full).'),
    'suit',
    'none',
    1,
    0,
    [S('suit.drop')],
  ),
  // 光子裝、特務裝共用
  ab(
    'ab.rig.firefly',
    L('螢火蟲偵察機', 'Firefly Drone'),
    L('放出一架黃色燈號的小型偵察機，它會飛往指定地點並停在那裡提供 10 公尺視野，60 秒後電力耗盡。同時只能有一架。', 'Launch a small amber-lit scout drone. It flies to the chosen spot and hovers there, granting 10 m of vision until its battery dies after 60 s. Only one at a time.'),
    'drone',
    'point',
    30,
    20,
    [S('rig.firefly', { life: 60 })],
    { range: 30 },
  ),
  // 服務裝、特務裝共用
  ab(
    'ab.rig.weld',
    L('焊槍', 'Welding Torch'),
    L('近距離修補機械：控制台、販賣機、無人機、機體等每次恢復 40 點耐久。對生物無效。', 'Patch up machinery at arm\'s length: consoles, vendors, drones and chassis regain 40 integrity per pass. Useless on living things.'),
    'wrench',
    'unit',
    0.5,
    0,
    [S('rig.weld', { amount: 40 })],
    { range: 1.5, filter: { tag: 'mechanical' } },
  ),
  // 特務裝、機槍裝共用
  ab(
    'ab.rig.rdgToss',
    L('投擲遙控雷', 'Toss Remote Charge'),
    L('拋出一枚遙控炸藥，落地後待命，直到你下令引爆或它被打壞。最多同時佈置 4 枚。', 'Lob a remote-detonated charge. It sits armed where it lands until you trigger it or someone shoots it. Up to 4 may be deployed at once.'),
    'grenade',
    'point',
    0.3,
    10,
    [S('rig.rdgToss', { max: 4 })],
    { range: 9, cast: 0.15, aoe: 1.75 },
  ),
  ab(
    'ab.rig.rdgDetonate',
    L('引爆遙控雷', 'Detonate Charges'),
    L('同時引爆你佈置的所有遙控雷：每枚對 1.25 公尺內造成 75 傷害、1.75 公尺內造成 50 傷害，爆炸不分敵我，連你自己也會受傷。', 'Trigger every charge you have planted. Each deals 75 damage within 1.25 m and 50 within 1.75 m. The blasts hurt anyone caught in them, you included.'),
    'bomb',
    'none',
    0.5,
    0,
    [S('rig.rdgDetonate')],
    { cast: 0.5 },
  ),
  // 特務裝、力場裝共用
  ab(
    'ab.rig.rush',
    L('動能衝刺', 'Kinetic Rush'),
    L('把推進場反向對準自己，朝指定方向衝出最多 12 公尺；路上撞到的單位受到 30 傷害並被推開。', 'Turn the push emitters on yourself and surge up to 12 m toward the target point. Anyone in the way takes 30 damage and is shoved aside.'),
    'speed',
    'point',
    20,
    40,
    [{ k: 'dash', speed: 20, maxDist: 12, to: 'point', hitAlong: [{ k: 'damage', amount: 30, to: 'target', kind: 'blast' }, S('rig.shove', { dist: 2.5 })] }],
    { range: 40 },
  ),
)

HELPERS.push(
  {
    id: 'rig.firefly',
    name: L('螢火蟲偵察機', 'Firefly Drone'),
    model: 'firefly',
    hp: 75,
    hpRegen: 2,
    mp: 0,
    mpRegen: 0,
    speed: 4.3,
    radius: 0.25,
    sight: 10,
    abilities: [],
    tags: ['drone', 'mechanical', 'summon', 'flying'],
    corpse: false,
  },
  deviceUnit('rig.rdg', '遙控雷', 'Remote Charge', 'rdg', 20, 0.2),
)

// ───────── 1. 特斯拉裝 ─────────

suit({
  id: 'suit.tesla',
  name: L('特斯拉裝', 'Tesla Rig'),
  hp: 600,
  speed: 2.8,
  attack: { dmg: atk(44), cd: 1, range: 6, kind: 'hitscan', fx: 'tesla', dmgKind: 'energy', onHit: [S('tesla.discharge', { bonus: 200 })] },
  abilities: ['ab.tesla.charge', 'ab.tesla.storm'],
  item: L('背負線圈電容的基本戰鬥裝。可以蓄電強化下一擊，或丟出持續電擊的雷暴。', 'A baseline combat rig with coil capacitors on the back. It can bank a charge into its next shot or toss out a lingering lightning storm.'),
})
ABILITIES.push(
  ab(
    'ab.tesla.charge',
    L('蓄電', 'Charge Up'),
    L('站定 5 秒把全部電容灌進主武器。充飽時釋放一圈電弧，對身旁 2.5 公尺內所有單位造成 150 傷害；接下來 8 秒內的下一發攻擊額外造成 200 傷害。', 'Stand still for 5 s while every capacitor dumps into the main emitter. When full, an arc ring deals 150 damage to everything within 2.5 m, and your next shot within 8 s deals an extra 200.'),
    'bolt',
    'none',
    20,
    40,
    [{ k: 'damage', amount: 150, to: 'self', aoe: 2.5, kind: 'energy' }, { k: 'buff', buff: 'bf.tesla.charged', to: 'self' }, { k: 'fx', fx: 'teslaNova', at: 'self' }],
    { cast: 5, aoe: 2.5 },
  ),
  ab(
    'ab.tesla.storm',
    L('雷暴', 'Lightning Storm'),
    L('拋出一顆線圈榴彈，落地後形成 8 秒的雷暴，每 0.75 秒電擊離它最近的一個單位（3.5 公尺內）造成 30 傷害。雷暴不認人，只有同為特斯拉裝的絕緣層擋得住。', 'Lob a coil grenade that crackles into an 8-second storm, zapping whichever unit is closest (within 3.5 m) for 30 damage every 0.75 s. It plays no favourites; only another Tesla rig\'s insulation is safe.'),
    'storm',
    'point',
    8,
    30,
    [{ k: 'projectile', speed: 12, fx: 'grenade', to: 'point', onHit: [S('rig.field', { obj: 'rig.teslaStorm', life: 8, buff: 'bf.tesla.storm' })] }],
    { range: 9, aoe: 3.5 },
  ),
)
BUFFS.push(
  bf('bf.tesla.charged', L('電容飽和', 'Capacitors Full'), 'bolt', true, { dur: 8, fx: 'tesla' }),
  bf('bf.tesla.storm', L('雷暴', 'Lightning Storm'), 'storm', false, { every: 0.75, tickEffects: [S('tesla.stormZap', { r: 3.5, dmg: 30 })] }),
)
HELPERS.push(fieldUnit('rig.teslaStorm', '雷暴', 'Lightning Storm', 'teslaStorm', 3.5))

// ───────── 2. 火箭裝 ─────────

suit({
  id: 'suit.rocket',
  name: L('火箭裝', 'Rocketeer Rig'),
  hp: 600,
  speed: 2.55,
  attack: { dmg: atk(50), cd: 1, range: 6, kind: 'artillery', projSpeed: 14, fx: 'rocket', aoe: 1.25, dmgKind: 'blast' },
  abilities: ['ab.rocket.halberd', 'ab.rocket.missile'],
  item: L('肩扛發射架的重火力裝，普攻就會炸開一小片範圍，連旁邊的人都會遭殃。', 'A heavy-support rig with a shoulder launcher. Even its basic shots burst over a small area, so mind who is standing nearby.'),
})
ABILITIES.push(
  ab(
    'ab.rocket.halberd',
    L('「戟」遙導火箭', '"Halberd" Guided Rocket'),
    L('發射一枚遙導火箭：指定單位時會一路追蹤，指定地點則直飛過去。撞擊時爆炸，對 2 公尺內造成最高 260 傷害，越靠近中心越痛。', 'Fire a guided rocket. Target a unit and it will chase them down; target the ground and it flies straight there. The impact deals up to 260 damage within 2 m, more toward the centre.'),
    'rocket',
    'unitOrPoint',
    15,
    50,
    [{ k: 'projectile', speed: 13, fx: 'rocket', to: 'target', range: 18, onHit: [{ k: 'damage', amount: 260, to: 'point', aoe: 2, falloff: true, kind: 'blast' }, { k: 'fx', fx: 'boom', at: 'point' }] }],
    { range: 18, aoe: 2 },
  ),
  ab(
    'ab.rocket.missile',
    L('手持飛彈', 'Hand Missile'),
    L('射出一枚輕型拋棄式飛彈，在落點 1.25 公尺內造成 90 爆炸傷害。只要能量夠就能連發。', 'Loose a light disposable missile that deals 90 blast damage within 1.25 m of where it lands. Fire as often as your energy allows.'),
    'grenade',
    'point',
    1,
    30,
    [{ k: 'projectile', speed: 20, fx: 'rocket', to: 'point', onHit: [{ k: 'damage', amount: 90, to: 'point', aoe: 1.25, kind: 'blast' }, { k: 'fx', fx: 'boom', at: 'point' }] }],
    { range: 8, cast: 0.4, aoe: 1.25 },
  ),
)

// ───────── 3. 冷凍裝 ─────────

suit({
  id: 'suit.cryo',
  name: L('冷凍裝', 'Cryo Rig'),
  hp: 600,
  speed: 2.75,
  attack: { dmg: atk(11), cd: 0.5, range: 6, kind: 'projectile', projSpeed: 28, fx: 'cryo', dmgKind: 'cold', onHit: [{ k: 'buff', buff: 'bf.cryo.chill', to: 'target' }] },
  abilities: ['ab.cryo.lance', 'ab.cryo.shock'],
  item: L('以冷媒為武器的支援裝。每一發都會讓目標變慢，還能讓整圈敵人暫時開不了火。', 'A support rig that weaponises coolant. Every hit slows the target, and it can briefly lock up the weapons of everyone around it.'),
})
ABILITIES.push(
  ab(
    'ab.cryo.lance',
    L('冷凝彈', 'Cryo Lance'),
    L('射出一枚廉價的冷凝彈，命中點 0.8 公尺內的單位受到 30 冰凍傷害，並在 3 秒內移動速度降低 70%。', 'Fire a cheap condensate shell. Units within 0.8 m of the impact take 30 cold damage and move 70% slower for 3 s.'),
    'frost',
    'unitOrPoint',
    5,
    15,
    [
      {
        k: 'projectile',
        speed: 18,
        fx: 'cryo',
        to: 'target',
        range: 18,
        onHit: [{ k: 'damage', amount: 30, to: 'point', aoe: 0.8, kind: 'cold' }, { k: 'buff', buff: 'bf.cryo.deep', to: 'point', aoe: 0.8, filter: { noStructure: true } }],
      },
    ],
    { range: 18, aoe: 0.8 },
  ),
  ab(
    'ab.cryo.shock',
    L('急凍衝擊', 'Cryo Shock'),
    L('從裝甲噴出一圈液態冷媒，4.5 公尺內所有其他單位的武器結霜，5 秒內無法攻擊（仍可移動與施放技能）。', 'Vent a ring of liquid coolant. Every other unit within 4.5 m has its weapons frosted over and cannot attack for 5 s (they can still move and use abilities).'),
    'star',
    'none',
    22,
    75,
    [{ k: 'buff', buff: 'bf.cryo.shock', to: 'self', aoe: 4.5, filter: { noStructure: true } }, { k: 'fx', fx: 'cryoNova', at: 'self' }],
    { aoe: 4.5 },
  ),
)
BUFFS.push(
  bf('bf.cryo.chill', L('冷媒附著', 'Chilled'), 'frost', false, { dur: 4, move: 0.8, fx: 'cryo' }),
  bf('bf.cryo.deep', L('深度凍結', 'Deep Freeze'), 'frost', false, { dur: 3, move: 0.3, fx: 'cryo' }),
  bf('bf.cryo.shock', L('武器結霜', 'Frosted Weapons'), 'star', false, { dur: 5, disarm: true, fx: 'cryo' }),
)

// ───────── 4. 電漿裝 ─────────

suit({
  id: 'suit.plasma',
  name: L('電漿裝', 'Plasma Rig'),
  hp: 600,
  speed: 2.75,
  attack: { dmg: atk(10), cd: 0.5, range: 6, kind: 'projectile', projSpeed: 20, fx: 'plasma', dmgKind: 'energy', onHit: [S('plasma.sear', { bonus: 6 })] },
  abilities: ['ab.plasma.ball', 'ab.plasma.drain'],
  item: L('擅長處理行動遲緩或被困在窄處的目標：電漿彈對減速中的目標更痛，還能在腳邊留下會爆炸的電漿球。', 'Built to punish the slow and the cornered: its bolts burn hotter on slowed targets, and it can drop volatile plasma orbs at its feet.'),
})
ABILITIES.push(
  ab(
    'ab.plasma.ball',
    L('電漿球', 'Plasma Orb'),
    L('在腳邊放下一顆不穩定的電漿球，1.5 秒後爆開：1 公尺內 100 傷害、1.5 公尺內 65 傷害。施放者本人不受影響。', 'Drop an unstable plasma orb at your feet. After 1.5 s it bursts for 100 damage within 1 m and 65 within 1.5 m. The caster is unaffected.'),
    'plasma',
    'none',
    3,
    10,
    [
      S('rig.field', { obj: 'rig.plasmaBall', life: 1.6 }),
      {
        k: 'delay',
        t: 1.5,
        at: 'self',
        then: [
          { k: 'damage', amount: 65, to: 'point', aoe: 1.5, kind: 'energy' },
          { k: 'damage', amount: 35, to: 'point', aoe: 1, kind: 'energy' },
          { k: 'fx', fx: 'plasmaBurst', at: 'point' },
        ],
      },
    ],
    { aoe: 1.5 },
  ),
  ab(
    'ab.plasma.drain',
    L('物質汲取器', 'Matter Siphon'),
    L('在身旁架起一具汲取器並鎖定目標，每秒抽走 20 點生命，最長 30 秒。目標離汲取器超過 6 公尺、離開視線，或汲取器被打壞，連結就會中斷。', 'Plant a siphon unit beside you and lock it onto a target, pulling 20 health per second for up to 30 s. The link breaks if the target gets more than 6 m from the device, leaves its line of sight, or the device is destroyed.'),
    'sensor',
    'unit',
    30,
    45,
    [S('plasma.drainer', { life: 30, r: 6 })],
    { range: 5, filter: { noStructure: true } },
  ),
)
BUFFS.push(bf('bf.plasma.drain', L('物質流失', 'Being Siphoned'), 'sensor', false, { dur: 30, every: 0.5, tickEffects: [S('plasma.drainTick', { dmg: 10, r: 6 })], fx: 'plasma' }))
HELPERS.push(fieldUnit('rig.plasmaBall', '電漿球', 'Plasma Orb', 'plasmaBall', 0.3), deviceUnit('rig.drainer', '物質汲取器', 'Matter Siphon', 'drainer', 100, 0.3))

// ───────── 5. 火焰裝 ─────────

suit({
  id: 'suit.pyro',
  name: L('火焰裝', 'Pyro Rig'),
  hp: 600,
  speed: 2.6,
  attack: { dmg: atk(5), cd: 0.24, range: 3, kind: 'hitscan', fx: 'flame', dmgKind: 'fire', windup: 0 },
  abilities: ['ab.pyro.kidot', 'ab.pyro.overheat'],
  item: L('射程短、腳步重，但火焰噴射器的持續輸出相當可觀。可以讓整片地板燒上兩分鐘。', 'Short-ranged and heavy on its feet, but the flamethrower puts out steady damage. It can set a patch of deck burning for two minutes.'),
})
ABILITIES.push(
  ab(
    'ab.pyro.kidot',
    L('熾焰投射', 'Kidot Projection'),
    L('射出一枚裝滿過熱燃液的小飛彈，落點 2 公尺內受到 80 火焰傷害，並讓地板燃燒 120 秒；站在火裡的人每秒受到 15 火焰傷害（火焰裝耐得住）。', 'Fire a small shell of superheated accelerant. Everything within 2 m takes 80 fire damage and the deck keeps burning for 120 s, scorching anyone standing in it for 15 per second (Pyro rigs shrug it off).'),
    'fire',
    'point',
    20,
    40,
    [
      {
        k: 'projectile',
        speed: 14,
        fx: 'flame',
        to: 'point',
        onHit: [{ k: 'damage', amount: 80, to: 'point', aoe: 2, kind: 'fire' }, { k: 'fx', fx: 'boom', at: 'point' }, S('rig.field', { obj: 'rig.fireField', life: 120, buff: 'bf.pyro.fireField' })],
      },
    ],
    { range: 11, cast: 1, aoe: 2 },
  ),
  ab(
    'ab.pyro.overheat',
    L('過熱', 'Overheat'),
    L('拆掉安全限制器：6 秒內攻擊速度大幅提升、移動稍快。時間一到必須緊急排出蒸汽，接下來 4 秒攻擊與移動都會變得極慢。', 'Rip out the safety limiter. For 6 s you fire far faster and move a little quicker. Then the rig must vent steam, crippling your attack and movement speed for 4 s.'),
    'speed',
    'none',
    10,
    60,
    [{ k: 'buff', buff: 'bf.pyro.overheat', to: 'self' }, { k: 'fx', fx: 'overheat', at: 'self' }],
  ),
)
BUFFS.push(
  bf('bf.pyro.overheat', L('過熱', 'Overheated'), 'fire', true, { dur: 6, atkSpeed: 3.5, move: 1.15, fx: 'flame', onExpire: [{ k: 'buff', buff: 'bf.pyro.vent', to: 'target' }, { k: 'fx', fx: 'steamVent', at: 'target' }] }),
  bf('bf.pyro.vent', L('排汽', 'Venting'), 'clock', false, { dur: 4, atkSpeed: 0.35, move: 0.45 }),
  bf('bf.pyro.fireField', L('燃燒中的地板', 'Burning Deck'), 'fire', false, { every: 0.5, tickEffects: [S('rig.hazard', { buff: 'bf.pyro.burn', r: 2, spare: 'suit.pyro', self: true })] }),
  bf('bf.pyro.burn', L('著火', 'Burning'), 'fire', false, { dur: 0.7, dot: 15, dotKind: 'fire', fx: 'flame' }),
)
HELPERS.push(fieldUnit('rig.fireField', '火海', 'Burning Deck', 'fireField', 2))

// ───────── 6. 光子裝 ─────────

suit({
  id: 'suit.photon',
  name: L('光子裝', 'Photon Rig'),
  hp: 600,
  speed: 2.85,
  attack: { dmg: atk(22), cd: 1, range: 6, kind: 'beam', fx: 'photon', dmgKind: 'energy' },
  abilities: ['ab.photon.blind', 'ab.rig.firefly'],
  item: L('仰賴技能撐場的支援裝：能用強光讓目標失準，也能放出偵察機替隊伍看路。', 'A support rig that lives on its tricks: it can dazzle a target into missing and send out a scout drone to watch the corridors.'),
})
ABILITIES.push(
  ab(
    'ab.photon.blind',
    L('強光致盲', 'Dazzle'),
    L('以高強度光束照射目標，7 秒內它的攻擊與技能傷害減半。', 'Hit the target with a blinding burst of light. For 7 s it deals only half damage with attacks and abilities.'),
    'eye',
    'unit',
    15,
    45,
    [{ k: 'buff', buff: 'bf.photon.blind', to: 'target' }, { k: 'fx', fx: 'photonFlash', at: 'target' }],
    { range: 7, filter: { noStructure: true } },
  ),
)
BUFFS.push(bf('bf.photon.blind', L('眼前一片白', 'Dazzled'), 'eye', false, { dur: 7, dmgMult: 0.5, fx: 'photon' }))

// ───────── 7. 服務裝 ─────────

suit({
  id: 'suit.service',
  name: L('服務裝', 'Service Rig'),
  hp: 600,
  speed: 2.95,
  attack: { dmg: atk(7), cd: 0.25, range: 1.4, kind: 'melee', fx: 'saw', windup: 0 },
  abilities: ['ab.service.saw', 'ab.rig.weld'],
  item: L('維修人員的工作服，手上是鏈鋸。貼身輸出很高，也能修理機械。', 'Maintenance coveralls with a chainsaw attached. Brutal up close, and handy for repairing machinery.'),
})
ABILITIES.push(
  ab(
    'ab.service.saw',
    L('磁力鋸', 'Magnetic Saw'),
    L('甩出一片磁導鋸片，它會追著目標飛過去並造成 150 傷害。', 'Fling a magnetically guided saw blade that homes in on the target and deals 150 damage.'),
    'saw',
    'unit',
    20,
    40,
    [{ k: 'projectile', speed: 10, fx: 'saw', to: 'target', onHit: [{ k: 'damage', amount: 150, to: 'target' }] }],
    { range: 6 },
  ),
)

// ───────── 8. 暗物質裝 ─────────

suit({
  id: 'suit.void',
  name: L('暗物質裝', 'Void Rig'),
  hp: 600,
  speed: 2.75,
  attack: { dmg: atk(21), cd: 1, range: 6, kind: 'projectile', projSpeed: 16, fx: 'void', dmgKind: 'energy', onHit: [{ k: 'mana', amount: -5, to: 'target' }] },
  abilities: ['ab.void.vortex', 'ab.void.phase'],
  item: L('擅長閃避與消耗對手能量的支援裝。每一發都會打散目標的能量，危急時會自動相位化。', 'A support rig built to dodge and to starve opponents of energy. Each hit bleeds the target\'s energy, and it phases out on its own when struck.'),
})
ABILITIES.push(
  ab(
    'ab.void.vortex',
    L('相位漩渦', 'Phase Vortex'),
    L('拋出一顆相位榴彈，爆開時從 2.5 公尺內每個單位身上燒掉最多 50 點能量，並造成等量傷害。', 'Lob a phase grenade. When it pops, every unit within 2.5 m loses up to 50 energy and takes that much damage.'),
    'void',
    'point',
    8,
    30,
    [{ k: 'projectile', speed: 12, fx: 'grenade', to: 'point', onHit: [S('void.burn', { r: 2.5, burn: 50 })] }],
    { range: 9, aoe: 2.5 },
  ),
  ab(
    'ab.void.phase',
    L('相位轉移', 'Phase Shift'),
    L('被動：受到攻擊時，防護服會自動把自己轉為暗能量 1 秒，期間不受任何傷害。每次消耗 15 能量，冷卻 8 秒。', 'Passive: when struck, the rig automatically shifts into dark energy for 1 s and ignores all damage. Costs 15 energy each time, 8 s cooldown.'),
    'cloak',
    'passive',
    8,
    0,
    [],
  ),
)
BUFFS.push(bf('bf.void.phase', L('相位化', 'Phased'), 'cloak', true, { dur: 1, invuln: true, fx: 'void' }))

// ───────── 9. 幻影裝 ─────────

suit({
  id: 'suit.mirage',
  name: L('幻影裝', 'Mirage Rig'),
  hp: 600,
  speed: 2.75,
  attack: { dmg: atk(39), cd: 1, range: 6, kind: 'hitscan', fx: 'mirage' },
  abilities: ['ab.mirage.double', 'ab.mirage.swap'],
  item: L('能投射出與自己一模一樣的光學分身。分身看起來是真的、也會被打傷，但它的子彈只是光影。', 'Projects an optical double that looks exactly like you. It can be hurt like the real thing, but its bullets are only light.'),
})
ABILITIES.push(
  ab(
    'ab.mirage.double',
    L('幻影分身', 'Mirror Double'),
    L('在身旁投射出一個和你外觀、名字完全相同的分身，它會走向指定地點並攻擊沿路的敵對生物，持續 30 秒。分身受傷與本體相同，但不會造成傷害、不能使用道具或技能。同時只能有一個。', 'Project a double beside you with your exact look and name. It walks to the chosen spot, attacking hostile creatures on the way, for 30 s. It takes damage normally but deals none, and cannot use items or abilities. Only one at a time.'),
    'mask',
    'point',
    5,
    100,
    [S('mirage.double', { life: 30 })],
    { range: 30 },
  ),
  ab(
    'ab.mirage.swap',
    L('換位', 'Swap Places'),
    L('專注 4 秒後與你的分身瞬間交換位置。沒有分身時不會消耗能量與冷卻。', 'Concentrate for 4 s, then trade places with your double in an instant. If you have no double, no energy or cooldown is spent.'),
    'teleport',
    'none',
    40,
    20,
    [S('mirage.swap')],
    { cast: 4 },
  ),
)
// 分身標記（只有擁有者看得到）；分身的攻擊傷害在 mirage.double 腳本裡歸零
BUFFS.push({ id: 'bf.mirage.illusion', name: L('光學分身', 'Optical Double'), icon: 'mask', vis: 'self', good: true })

// ───────── 10. 輻射裝 ─────────

suit({
  id: 'suit.rad',
  name: L('輻射裝', 'Rad Rig'),
  hp: 600,
  speed: 2.75,
  attack: { dmg: atk(29), cd: 1.1, range: 6, kind: 'projectile', projSpeed: 14, fx: 'rad', dmgKind: 'energy' },
  abilities: ['ab.rad.overload', 'ab.rad.leak'],
  item: L('以小型反應爐供電的強力戰鬥裝，代價是它會不停輻射周圍所有人——包括隊友。', 'A powerful combat rig driven by a compact reactor. The price: it constantly irradiates everyone nearby, teammates included.'),
})
ABILITIES.push(
  ab(
    'ab.rad.overload',
    L('核心過載', 'Core Overload'),
    L('花 4 秒讓反應爐失控：自己承受 150 傷害，並讓周圍 4 公尺化為重度污染區 60 秒，區內每秒 24 傷害（輻射裝不受影響）。', 'Spend 4 s pushing the reactor past its limits. You take 150 damage and the surrounding 4 m becomes a heavy fallout zone for 60 s, dealing 24 damage per second to anyone inside (Rad rigs are shielded).'),
    'core',
    'none',
    20,
    80,
    [S('rad.overload', { self: 150, life: 60 })],
    { cast: 4, aoe: 4 },
  ),
  ab(
    'ab.rad.leak',
    L('輻射外洩', 'Radiation Leak'),
    L('被動：穿著時，5 公尺內的所有其他單位每秒受到 2.5 輻射傷害，不分敵我（輻射裝彼此免疫）。', 'Passive: while worn, every other unit within 5 m takes 2.5 radiation damage per second, friend or foe (Rad rigs are immune to each other).'),
    'skull',
    'passive',
    0,
    0,
    [],
  ),
)
BUFFS.push(
  bf('bf.rad.sick', L('輻射灼傷', 'Irradiated'), 'skull', false, { dur: 1.2, dot: 2.5, dotKind: 'energy', fx: 'rad' }),
  bf('bf.rad.fallout', L('重度污染區', 'Fallout Zone'), 'skull', false, { every: 0.5, tickEffects: [S('rig.hazard', { buff: 'bf.rad.heavy', r: 4, spare: 'suit.rad', self: true })] }),
  bf('bf.rad.heavy', L('重度輻射', 'Heavy Radiation'), 'skull', false, { dur: 0.7, dot: 24, dotKind: 'energy', fx: 'rad' }),
)
HELPERS.push(fieldUnit('rig.radZone', '污染區', 'Fallout Zone', 'radZone', 4))

// ───────── 11. 特務裝 ─────────

suit({
  id: 'suit.operative',
  name: L('特務裝', 'Operative Rig'),
  hp: 650,
  speed: 2.85,
  attack: { dmg: atk(64), cd: 1, range: 14, kind: 'hitscan', fx: 'operative' },
  abilities: ['ab.rig.rdgToss', 'ab.rig.rdgDetonate', 'ab.rig.rush', 'ab.rig.firefly', 'ab.rig.weld'],
  item: L('配發給外勤人員的特製裝備：長程精準步槍、遙控炸藥、衝刺推進器、偵察機與焊槍一應俱全。', 'Field-issue kit for special operatives: a long-range marksman rifle, remote charges, a rush thruster, a scout drone and a welding torch.'),
})

// ───────── 12. 研究白袍 ─────────

suit({
  id: 'suit.labcoat',
  name: L('研究白袍', 'Lab Coat'),
  hp: 600,
  speed: 2.95,
  attack: { dmg: atk(50), cd: 1, range: 3.5, kind: 'projectile', projSpeed: 9, fx: 'flask', dmgKind: 'poison' },
  abilities: ['ab.labcoat.chemistry', 'ab.labcoat.physics', 'ab.labcoat.biology'],
  item: L('口袋塞滿試管與燒瓶的白袍——沒錯，它也算防護服。三門學科各有一招。', 'A white coat with every pocket full of vials and flasks. Yes, it counts as a rig. One trick per field of science.'),
})
ABILITIES.push(
  ab(
    'ab.labcoat.chemistry',
    L('化學', 'Chemistry'),
    L('丟出一瓶腐蝕液，15 秒內目標受到的所有傷害提高 17%。', 'Hurl a vial of corrosive solution. For 15 s the target takes 17% more damage from everything.'),
    'syringe',
    'unit',
    8,
    25,
    [{ k: 'projectile', speed: 9, fx: 'flask', to: 'target', onHit: [{ k: 'buff', buff: 'bf.labcoat.corrode', to: 'target' }] }],
    { range: 4, filter: { noStructure: true } },
  ),
  ab(
    'ab.labcoat.physics',
    L('物理學', 'Physics'),
    L('瞬間與目標單位交換位置，目標在接下來 3 秒內無敵。', 'Instantly trade places with the target unit. The target is invulnerable for the next 3 s.'),
    'teleport',
    'unit',
    15,
    10,
    [S('labcoat.physics', { dur: 3 })],
    { range: 6, filter: { noStructure: true } },
  ),
  ab(
    'ab.labcoat.biology',
    L('生物學', 'Biology'),
    L('喚出一隻來路不明的實驗生物，牠會守在原地攻擊靠近的敵對生物，120 秒後崩解。同時只能有一隻。', 'Call forth a lab-grown monstrosity of dubious origin. It guards the spot and mauls hostile creatures that come close, then falls apart after 120 s. Only one at a time.'),
    'dna',
    'none',
    20,
    35,
    [S('labcoat.biology', { life: 120 })],
  ),
)
BUFFS.push(
  bf('bf.labcoat.corrode', L('腐蝕', 'Corroded'), 'syringe', false, { dur: 15, dmgTaken: 1.17, fx: 'acid' }),
  bf('bf.labcoat.stasis', L('位移護盾', 'Displacement Shield'), 'shield', true, { dur: 3, invuln: true }),
)
HELPERS.push({
  id: 'rig.monstrosity',
  name: L('實驗生物', 'Lab Monstrosity'),
  model: 'monstrosity',
  hp: 250,
  hpRegen: 0.75,
  mp: 0,
  mpRegen: 0,
  speed: 2.8,
  radius: 0.45,
  sight: 9,
  attack: { dmg: [12, 14], cd: 1, range: 0.8, kind: 'melee', fx: 'claw' },
  abilities: [],
  tags: ['creature', 'summon'],
  corpse: false,
})

// ───────── 13. 警衛裝 ─────────

suit({
  id: 'suit.guard',
  name: L('警衛裝', 'Guard Rig'),
  hp: 600,
  speed: 2.75,
  attack: { dmg: atk(23), cd: 1, range: 6, kind: 'hitscan', fx: 'rifle' },
  abilities: ['ab.guard.restore', 'ab.guard.transfer', 'ab.guard.absorb'],
  item: L('以保護他人為設計目標的標準戰鬥裝：能就地治療、用自己的生命替人補血，或張開力場讓身邊的人無敵。', 'A standard combat rig designed to protect others. It can heal in place, trade its own health to patch someone up, or raise a field that makes those beside it invulnerable.'),
})
ABILITIES.push(
  ab(
    'ab.guard.restore',
    L('自動修復', 'Auto-Restoration'),
    L('站定不動時，醫療組件每秒為自己與 2.5 公尺內的單位恢復 10 點生命，最長 30 秒；一移動就停止。', 'While you hold still, the medical array restores 10 health per second to you and every unit within 2.5 m for up to 30 s. Moving ends it.'),
    'heal',
    'none',
    20,
    25,
    [{ k: 'fx', fx: 'heal', at: 'self' }],
    { channel: 30, channelTick: 1, tickEffects: [{ k: 'heal', amount: 10, to: 'self', aoe: 2.5 }], aoe: 2.5 },
  ),
  ab(
    'ab.guard.transfer',
    L('能量輸送', 'Life Transfer'),
    L('把自己的生命導給目標：目標恢復 150 點生命，你失去 50 點（不會因此死亡）。', 'Channel your own vitality into the target: they recover 150 health and you lose 50 (this can never kill you).'),
    'syringe',
    'unit',
    20,
    35,
    [S('guard.transfer', { heal: 150, cost: 50 })],
    { range: 6, filter: { noStructure: true } },
  ),
  ab(
    'ab.guard.absorb',
    L('吸收力場', 'Absorption Field'),
    L('展開吸收力場：只要你維持引導（不能移動），貼在你身邊 1.5 公尺內的其他單位都處於無敵狀態，最長 120 秒。', 'Raise the absorption banks. As long as you keep channelling (and stay put), every other unit within 1.5 m of you is invulnerable, for up to 120 s.'),
    'shield',
    'none',
    45,
    70,
    [{ k: 'buff', buff: 'bf.guard.absorbed', to: 'self', aoe: 1.5, filter: { noStructure: true } }],
    { channel: 120, channelTick: 0.25, tickEffects: [{ k: 'buff', buff: 'bf.guard.absorbed', to: 'self', aoe: 1.5, filter: { noStructure: true } }], aoe: 1.5 },
  ),
)
BUFFS.push(bf('bf.guard.absorbed', L('受力場保護', 'Absorbed'), 'shield', true, { dur: 0.4, invuln: true, fx: 'force' }))

// ───────── 14. 酸蝕裝 ─────────

suit({
  id: 'suit.acid',
  name: L('酸蝕裝', 'Acid Rig'),
  hp: 600,
  speed: 2.75,
  attack: { dmg: atk(24), cd: 1, range: 8.5, kind: 'projectile', projSpeed: 28, fx: 'acid', dmgKind: 'poison', onHit: [{ k: 'buff', buff: 'bf.acid.corrode', to: 'target' }] },
  abilities: ['ab.acid.spray', 'ab.acid.cloud'],
  item: L('射程比多數防護服更遠的游擊裝。酸液會黏在目標身上慢慢腐蝕，還能噴出酸池與致盲毒雲。', 'A hit-and-run rig that outranges most others. Its acid clings and eats away over time, and it can lay acid pools and blinding vapour.'),
})
ABILITIES.push(
  ab(
    'ab.acid.spray',
    L('酸液噴灑', 'Acid Spray'),
    L('朝地點噴出一大片酸液，形成持續 20 秒、半徑 2.5 公尺的酸池；踏進去的人每秒受到 15 腐蝕傷害（酸蝕裝不受影響）。', 'Hose down an area with acid, leaving a 2.5 m pool for 20 s. Anyone who steps in takes 15 corrosive damage per second (Acid rigs are unaffected).'),
    'infect',
    'point',
    0.5,
    30,
    [{ k: 'projectile', speed: 16, fx: 'acidSpit', to: 'point', onHit: [S('rig.field', { obj: 'rig.acidPool', life: 20, buff: 'bf.acid.poolField' })] }],
    { range: 12, cast: 1, aoe: 2.5 },
  ),
  ab(
    'ab.acid.cloud',
    L('致盲毒雲', 'Blinding Vapour'),
    L('在地點升起一團濃密毒雲，持續 8 秒；雲裡的單位既不能攻擊也不能施放技能（施放者本人除外）。', 'Raise a thick, choking cloud at the target spot for 8 s. Units inside can neither attack nor use abilities (except the caster).'),
    'storm',
    'point',
    9,
    25,
    [S('rig.field', { obj: 'rig.blindCloud', life: 8, buff: 'bf.acid.cloudField' })],
    { range: 7, aoe: 2.3 },
  ),
)
BUFFS.push(
  bf('bf.acid.corrode', L('酸蝕', 'Acid Burn'), 'infect', false, { dur: 16, dot: 4.4, dotKind: 'poison', fx: 'acid' }),
  bf('bf.acid.poolField', L('酸池', 'Acid Pool'), 'infect', false, { every: 0.5, tickEffects: [S('rig.hazard', { buff: 'bf.acid.pool', r: 2.5, spare: 'suit.acid', self: true })] }),
  bf('bf.acid.pool', L('浸泡酸液', 'Standing in Acid'), 'infect', false, { dur: 0.7, dot: 15, dotKind: 'poison', fx: 'acid' }),
  bf('bf.acid.cloudField', L('毒雲', 'Vapour Cloud'), 'storm', false, { every: 0.25, tickEffects: [S('rig.hazard', { buff: 'bf.acid.blinded', r: 2.3 })] }),
  bf('bf.acid.blinded', L('毒雲籠罩', 'Choking'), 'eye', false, { dur: 0.4, disarm: true, silence: true }),
)
HELPERS.push(fieldUnit('rig.acidPool', '酸池', 'Acid Pool', 'acidPool', 2.5), fieldUnit('rig.blindCloud', '毒雲', 'Vapour Cloud', 'cloud', 2.3))

// ───────── 15. 機槍裝 ─────────

suit({
  id: 'suit.gatling',
  name: L('機槍裝', 'Gatling Rig'),
  hp: 600,
  speed: 2.55,
  attack: { dmg: atk(2), cd: 0.1, range: 6, kind: 'hitscan', fx: 'gatling', windup: 0, onHit: [S('gatling.round', { bonus: 3 })] },
  abilities: ['ab.gatling.setup', 'ab.rig.rdgToss', 'ab.rig.rdgDetonate'],
  item: L('維護成本高得離譜的舊式機槍裝，但彈雨依然好用；架設後火力更猛，還附遙控炸藥。', 'An outdated machine-gun rig with absurd upkeep, but a hail of bullets still works. Brace it for extra punch; it also carries remote charges.'),
})
ABILITIES.push(
  ab(
    'ab.gatling.setup',
    L('架設', 'Brace'),
    L('花 1 秒架穩槍座並換上電漿彈：之後每發子彈額外造成 3 傷害。只要移動或轉身超出約 80° 的射界，架設就會解除。', 'Spend 1 s bracing the mount and switching to plasma rounds: every bullet then deals 3 extra damage. Moving, or turning outside a roughly 80° firing arc, breaks the brace.'),
    'gun',
    'none',
    15,
    10,
    [S('gatling.setup')],
    { cast: 1 },
  ),
)
BUFFS.push(bf('bf.gatling.setup', L('已架設', 'Braced'), 'gun', true, { every: 0.1, tickEffects: [S('gatling.check', { move: 0.25, arc: 0.7 })], fx: 'gatling' }))

// ───────── 16. 力場裝 ─────────

suit({
  id: 'suit.force',
  name: L('力場裝', 'Force Rig'),
  hp: 600,
  speed: 2.55,
  attack: { dmg: atk(29), cd: 1.5, range: 18, kind: 'projectile', projSpeed: 20, fx: 'force', pierce: true, dmgKind: 'pierce', onHit: [S('rig.shove', { dist: 1.5, polarity: true })] },
  abilities: ['ab.rig.rush', 'ab.force.vortex', 'ab.force.polarity', 'ab.force.fireAt'],
  item: L('擅長走位與控場的力場裝。射出的衝擊波會貫穿整條直線並把人推開（或拉近）。', 'A rig for outmanoeuvring and controlling foes. Its shockwave tears through everything in a line and shoves them away, or drags them in.'),
})
ABILITIES.push(
  ab(
    'ab.force.vortex',
    L('力場漩渦', 'Force Vortex'),
    L('拋出一顆斥力榴彈，爆開時把 3 公尺內的所有單位向外推開。', 'Lob a repulsor grenade that throws every unit within 3 m outward when it bursts.'),
    'void',
    'point',
    8,
    30,
    [{ k: 'projectile', speed: 12, fx: 'grenade', to: 'point', onHit: [{ k: 'knockback', dist: 3, aoe: 3, from: 'point' }, { k: 'fx', fx: 'forceBurst', at: 'point' }] }],
    { range: 9, aoe: 3 },
  ),
  ab(
    'ab.force.polarity',
    L('反轉極性', 'Reverse Polarity'),
    L('切換：讓衝擊波從推開目標改成把目標拉向你，再按一次切回來。', 'Toggle: your shockwave drags targets toward you instead of pushing them away. Press again to switch back.'),
    'gear',
    'toggle',
    0.5,
    0,
    [S('force.polarity')],
  ),
  ab(
    'ab.force.fireAt',
    L('定向射擊', 'Fire at Will'),
    L('朝指定方向打出一道衝擊波，不需要目標；貫穿直線上的所有單位。', 'Send a shockwave in the chosen direction, no target required. It passes through everything along the line.'),
    'beam',
    'point',
    1.5,
    0,
    [{ k: 'projectile', speed: 20, fx: 'force', to: 'point', pierce: true, range: 18, onHit: [{ k: 'damage', amount: atk(29), to: 'target', kind: 'pierce' }, S('rig.shove', { dist: 1.5, polarity: true })] }],
    { range: 18 },
  ),
)
BUFFS.push(bf('bf.force.pull', L('極性反轉', 'Polarity Reversed'), 'gear', true, { fx: 'force' }))

// ───────── 17. 磁力裝 ─────────

suit({
  id: 'suit.mag',
  name: L('磁力裝', 'Mag Rig'),
  hp: 600,
  speed: 2.75,
  attack: { dmg: atk(25), cd: 1.1, range: 6, kind: 'projectile', projSpeed: 34, fx: 'mag', dmgKind: 'pierce', onHit: [{ k: 'buff', buff: 'bf.mag.sliv', to: 'target' }] },
  abilities: ['ab.mag.metal', 'ab.mag.thrust', 'ab.mag.detonate'],
  item: L('正面火力不強，但很會控場：每一發都在目標體內留下金屬碎片，還能召喚大塊金屬當砲彈甩出去。', 'Light on raw firepower but strong on control: every shot leaves a metal sliver in the target, and it can summon chunks of metal to hurl around.'),
})
ABILITIES.push(
  ab(
    'ab.mag.metal',
    L('召喚金屬', 'Summon Metal'),
    L('用磁場把附近的廢料聚成一大塊金屬放在指定地點，可以拿來擋路或用磁力推擲甩出去。最多同時 3 塊，120 秒後散落。', 'Pull nearby scrap together into a hefty lump of metal at the chosen spot. Use it as cover or hurl it with Magnetic Thrust. Up to 3 at a time; each falls apart after 120 s.'),
    'rock',
    'point',
    3,
    35,
    [S('mag.metal', { max: 3, life: 120 })],
    { range: 4 },
  ),
  ab(
    'ab.mag.thrust',
    L('磁力推擲', 'Magnetic Thrust'),
    L('把你身邊 6 公尺內的所有金屬塊朝指定方向猛力甩出 12 公尺，撞到的單位受到 100 傷害並被撞開。', 'Violently fling every lump of metal within 6 m of you up to 12 m in the chosen direction. Anyone struck takes 100 damage and is knocked aside.'),
    'speed',
    'point',
    12,
    13,
    [S('mag.thrust', { pick: 6, dist: 12, speed: 16, dmg: 100 })],
    { range: 12, cast: 0.2 },
  ),
  ab(
    'ab.mag.detonate',
    L('引爆碎片', 'Detonate Slivers'),
    L('引爆你射進任何人體內的所有金屬碎片，每片造成 30 傷害（每個目標最多 8 片）。', 'Detonate every metal sliver you have lodged in anyone, dealing 30 damage per sliver (up to 8 per target).'),
    'bomb',
    'none',
    1,
    0,
    [S('mag.detonate', { per: 30 })],
  ),
)
BUFFS.push(bf('bf.mag.sliv', L('金屬碎片', 'Embedded Slivers'), 'star', false, { dur: 20, stacks: 8, fx: 'mag' }))
HELPERS.push(deviceUnit('rig.metal', '金屬塊', 'Lump of Metal', 'metal', 150, 0.6, { tags: ['mechanical', 'summon'] }))

// ───────── 18. 脈衝裝 ─────────

suit({
  id: 'suit.pulse',
  name: L('脈衝裝', 'Pulse Rig'),
  hp: 600,
  speed: 2.75,
  attack: { dmg: atk(1), cd: 0.05, range: 5, kind: 'beam', fx: 'pulse', dmgKind: 'pierce', windup: 0, onHit: [S('pulse.beam', { bonus: 2, heat: 3, cool: 1.5, cost: 0.2 })] },
  abilities: ['ab.pulse.bank', 'ab.pulse.siphon'],
  item: L('射出駭人的連續雷射。剛開火時最痛，持續射擊會過熱而變弱；雷射的增幅要吃能量，所以得自己找電。', 'Fires a fearsome continuous laser. It hits hardest when you first open up and weakens as it overheats; the boost runs on energy, so you will need to find power.'),
})
ABILITIES.push(
  ab(
    'ab.pulse.bank',
    L('能量庫', 'Energy Bank'),
    L('花 1.5 秒展開一座蓄能庫，它會每秒自行產生 3 點能量（上限 100），存在 60 秒。蓄能庫被打爆時會像電磁手榴彈一樣，燒掉 3 公尺內單位的能量並短暫沉默他們。同時只能有一座。', 'Spend 1.5 s deploying an energy bank that generates 3 energy per second (up to 100) for 60 s. If it is destroyed it goes off like an EMP grenade, burning the energy of units within 3 m and briefly silencing them. Only one at a time.'),
    'battery',
    'none',
    15,
    0,
    [S('pulse.bank', { life: 60 })],
    { cast: 1.5 },
  ),
  ab(
    'ab.pulse.siphon',
    L('能量汲取', 'Energy Siphon'),
    L('引導：從 3 公尺內的目標身上每秒抽取 12 點能量給自己（例如你的能量庫），最長 10 秒；距離拉開到 3.5 公尺以上就會中斷。', 'Channel: drain 12 energy per second from a target within 3 m into your own reserves (your Energy Bank works nicely) for up to 10 s. The link snaps if it stretches past 3.5 m.'),
    'core',
    'unit',
    4,
    0,
    [],
    { range: 3, channel: 10, channelTick: 0.25, tickEffects: [S('pulse.siphonTick', { rate: 12, r: 3.5 })], filter: { noStructure: true } },
  ),
)
BUFFS.push(bf('bf.pulse.emp', L('電磁干擾', 'EMP Scrambled'), 'battery', false, { dur: 3, silence: true, fx: 'emp' }))
HELPERS.push(deviceUnit('rig.energyBank', '能量庫', 'Energy Bank', 'energyBank', 100, 0.35, { mp: 100, mpRegen: 3, life: 60 }))

// ───────── 註冊 ─────────

const SUIT_UNITS = SUIT_SPECS.map(suitUnit)

/** 防護服道具（id 與著裝單位相同）*/
const SUIT_ITEMS: ItemDef[] = SUIT_SPECS.map((s) => ({ id: s.id, name: s.name, desc: s.item, icon: 'suit', charges: 0, suit: s.id, cat: 'suit' }))

/** 18 套防護服的 id（依原作等級 2–19 排序）*/
export const SUIT_IDS: readonly string[] = SUIT_SPECS.map((s) => s.id)

regUnits([...SUIT_UNITS, ...HELPERS])
regAbilities(ABILITIES)
regBuffs(BUFFS)
regItems(SUIT_ITEMS)
