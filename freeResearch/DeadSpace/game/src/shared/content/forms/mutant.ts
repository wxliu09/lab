// 變種人：全部形態、spawn、召喚物、技能與 buff（研究 02 §4、§8；內容總表「異類與仿生人型態」）
// 數值照研究 02 §4.3 表（射程、移速 ÷100），「預設」攻擊 CD 用 1.0。
// 機制技能 mut.devour／mut.cannibalize／mut.prion／mut.prion2／mut.prion3 與 bf.prion* 由 roleAbilities.ts 註冊，
// 這裡只在形態的 abilities 引用；進化肉團 mut.mass 與巢艦的太空層行為也由主程式處理。
// 需要 script 的技能在 src/sim/scripts/mutant.ts。
import { regAbilities, regBuffs, regUnits } from '../registry'
import type { AbilityDef, AttackDef, BuffDef, Effect, Loc, UnitDef } from '../types'

const L = (zh: string, en: string): Loc => ({ zh, en })
const S = (fn: string, p?: Record<string, number | string | boolean>): Effect => ({ k: 'script', fn, p })

/** 原作單一傷害值 → 平均值不變的小幅浮動區間 */
function dmg(x: number): [number, number] {
  if (x < 10) return [x, x + 1]
  return [Math.round(x * 0.92), Math.round(x * 1.08)]
}

function melee(x: number, cd: number, range: number, fx = 'claw'): AttackDef {
  return { dmg: dmg(x), cd, range, kind: 'melee', fx }
}

function ranged(x: number, cd: number, range: number, fx: string, projSpeed: number, extra: Partial<AttackDef> = {}): AttackDef {
  return { dmg: dmg(x), cd, range, kind: 'projectile', fx, projSpeed, ...extra }
}

const FORM_TAGS: UnitDef['tags'] = ['mechanical', 'mutantForm']
const MINION_TAGS: UnitDef['tags'] = ['mechanical', 'summon']

/** 變種人形態／spawn（玩家主單位）*/
function form(
  id: string,
  name: Loc,
  hp: number,
  hpRegen: number,
  speed: number,
  radius: number,
  attack: AttackDef,
  abilities: string[],
  extra: Partial<UnitDef> = {},
): UnitDef {
  return {
    id,
    name,
    model: id.replace(/\.spawn$/, ''),
    hp,
    hpRegen,
    mp: 100,
    mpRegen: 0.8,
    speed,
    radius,
    sight: 14,
    attack,
    abilities,
    tags: FORM_TAGS,
    inv: 6,
    corpse: true,
    ...(id.endsWith('.spawn') ? { scale: 0.88 } : {}),
    ...extra,
  }
}

/** 召喚物（不能帶道具、不留屍體以免被吞食刷 EP）*/
function minion(id: string, name: Loc, hp: number, hpRegen: number, speed: number, radius: number, attack: AttackDef | undefined, extra: Partial<UnitDef> = {}): UnitDef {
  return {
    id,
    name,
    model: id,
    hp,
    hpRegen,
    mp: 0,
    mpRegen: 0,
    speed,
    radius,
    sight: 10,
    attack,
    abilities: [],
    tags: MINION_TAGS,
    inv: 0,
    corpse: false,
    ...extra,
  }
}

// ───────── 單位 ─────────

export const MUTANT_UNITS: UnitDef[] = [
  // ── T1 ──
  form('mut.apex', L('掠食者', 'Apex'), 900, 1.0, 3.05, 0.5, melee(37, 1.0, 1.4), ['ab.mut.sludge', 'mut.devour', 'mut.cannibalize']),
  form('mut.sporemother', L('孢母', 'Sporemother'), 725, 1.5, 3.05, 0.5, melee(38, 1.0, 1.4), ['mut.devour', 'mut.prion']),
  form('mut.sporemother.spawn', L('孢囊工蟲', 'Spore Thrall'), 650, 1.0, 2.95, 0.45, melee(32, 1.0, 1.4), ['mut.prion']),
  // 主人還在人形（T0）時被轉化者使用的工蟲型
  form('mut.drone', L('工蟲', 'Drone'), 650, 1.0, 2.95, 0.45, melee(32, 1.0, 1.4), []),

  // ── T2 完美 ──
  form(
    'mut.blitz',
    L('迅影', 'Blitz'),
    900,
    1.0,
    3.2,
    0.5,
    melee(32, 1.0, 1.4),
    ['ab.mut.dontBlink', 'ab.mut.spatialBurst', 'ab.mut.roar', 'mut.devour', 'mut.cannibalize'],
    // 原作此形態動畫播放 160%
    { flags: { animSpeed: 1.6 } },
  ),
  form('mut.brawn', L('蠻力', 'Brawn'), 1800, 2.0, 2.25, 0.75, melee(100, 1.0, 1.4), ['ab.mut.fleshies', 'ab.mut.smash', 'ab.mut.roar', 'mut.devour', 'mut.cannibalize']),

  // ── T2 感染 ──
  form('mut.mimetic', L('擬人株', 'Mimetic Strain'), 1000, 0.75, 2.95, 0.45, ranged(32, 1.0, 5.0, 'acid', 14), ['ab.mut.taintVendor', 'ab.mut.roar', 'mut.devour', 'mut.prion2']),
  form('mut.mimetic.spawn', L('擬態眷屬', 'Mimic Thrall'), 800, 0.75, 2.8, 0.45, ranged(37, 1.0, 4.0, 'acid', 14), ['ab.mut.taintVendor', 'ab.mut.roar', 'mut.prion2']),
  form('mut.spinner', L('蛛母', 'Spinner'), 900, 0.75, 3.2, 0.6, melee(19, 0.5, 1.6), ['ab.mut.spiderlings', 'ab.mut.reabsorb', 'ab.mut.roar', 'mut.devour']),
  form('mut.spinner.spawn', L('絲蛛眷屬', 'Silk Thrall'), 750, 0.75, 3.2, 0.55, melee(15, 0.5, 1.6), ['ab.mut.spiderlings', 'ab.mut.reabsorb', 'ab.mut.roar']),

  // ── T3 迅影系 ──
  form('mut.lurker', L('潛伏者', 'Lurker'), 1250, 2.0, 3.2, 0.55, ranged(124, 2.7, 24, 'mutSpine', 36), [
    'ab.mut.stalk',
    'ab.mut.snipe',
    'ab.mut.omniscience',
    'ab.mut.roar',
    'mut.devour',
  ]),
  // 原作基礎 700 HP，另有被動「甲殼」+700（A07H）；驚慌時失去這份加成，所以 def 直接寫合計 1400
  form(
    'mut.carcinid',
    L('甲蟹', 'Carcinid'),
    1400,
    2.5,
    0.2,
    0.8,
    ranged(150, 6.0, 9.0, 'crabSpit', 12, { onHit: [S('mutant.crabSpores')] }),
    ['ab.mut.panic', 'ab.mut.roar', 'mut.devour', 'ab.mut.crabosity', 'ab.mut.carapace'],
    { mp: 400, flags: { crabosity: true, baseHp: 700 } },
  ),

  // ── T3 蠻力系 ──
  form(
    'mut.colossus',
    L('血肉巨像', 'Flesh Colossus'),
    6000,
    0.75,
    2.05,
    0.95,
    melee(120, 1.0, 1.6),
    ['ab.mut.rainingRocks', 'ab.mut.rocksFall', 'ab.mut.smash', 'ab.mut.roar', 'mut.devour', 'ab.mut.crush'],
    { flags: { crushRubble: true } },
  ),
  form('mut.taurus', L('牛頭蠻', 'Taurus'), 2400, 0.75, 2.4, 0.85, melee(85, 1.0, 1.6), ['ab.mut.charge', 'ab.mut.rollingThunder', 'ab.mut.roar', 'mut.devour']),

  // ── T3 擬人株系 ──
  form('mut.plagueQueen', L('瘟后', 'Plague Queen'), 1600, 0.75, 2.9, 0.6, melee(48, 1.0, 1.4), [
    'ab.mut.totalInfection',
    'ab.mut.vector',
    'ab.mut.blastShield',
    'ab.mut.roar',
    'mut.devour',
  ]),
  form('mut.plagueQueen.spawn', L('瘟疫使徒', 'Plague Herald'), 900, 0.75, 2.8, 0.55, melee(39, 1.0, 1.4), ['ab.mut.totalInfection', 'ab.mut.blastShield', 'ab.mut.roar']),
  form('mut.broodmother', L('繁巢', 'Broodmother'), 1050, 0.75, 2.9, 0.65, ranged(34, 1.1, 9.0, 'acid', 14), [
    'ab.mut.carrier',
    'ab.mut.blastShield',
    'ab.mut.roar',
    'mut.devour',
    'mut.prion3',
  ]),
  form('mut.broodmother.spawn', L('繁巢使徒', 'Brood Herald'), 850, 0.75, 2.9, 0.6, ranged(26, 1.1, 9.0, 'acid', 14), ['ab.mut.blastShield', 'ab.mut.roar', 'mut.prion3']),

  // ── T3 蛛母系 ──
  // 巢艦（太空）：太空層行為由主程式實作，這裡只提供單位數值與技能
  form(
    'mut.hiveship',
    L('巢艦（太空）', 'Hiveship'),
    300000,
    300,
    0.6,
    4,
    { dmg: dmg(9000), cd: 3.0, range: 16, kind: 'projectile', fx: 'hiveSpore', projSpeed: 20, only: 'space' },
    ['ab.mut.guardian', 'ab.mut.viewIntestines'],
    { tags: ['mechanical', 'mutantForm', 'space', 'station'], layer: 'space', sight: 30, corpse: false },
  ),
  // 巢艦的 spawn ＝ 先驅（能駕駛、能用道具）
  form('mut.hiveship.spawn', L('先驅', 'Harbinger'), 1100, 1.0, 2.65, 0.6, melee(90, 3.0, 1.2), ['ab.mut.fervor', 'ab.mut.embrace', 'ab.mut.roar'], {
    model: 'mut.harbinger',
    scale: 1,
    mp: 150,
  }),
  form(
    'mut.hiveground',
    L('巢艦（地面）', 'Hiveship (ground)'),
    16000,
    4.0,
    0,
    1.2,
    melee(20, 0.5, 1.6),
    ['ab.mut.breedTentacle', 'ab.mut.breedSwarm', 'ab.mut.breedSack', 'ab.mut.breedHarbinger', 'ab.mut.roar', 'mut.devour'],
  ),
  form('mut.hiveground.spawn', L('巢觸眷屬', 'Hive Tendril'), 2000, 0.75, 2.5, 0.7, melee(65, 1.5, 1.8), ['ab.mut.roar']),
  form(
    'mut.blightcrawler',
    L('腐沼', 'Blightcrawler'),
    1500,
    0.75,
    3.1,
    0.7,
    ranged(75, 1.5, 4.2, 'sludge', 12),
    ['ab.mut.metamorphosis', 'ab.mut.roar', 'mut.devour', 'ab.mut.slimeTrail'],
    { flags: { slimeTrail: true } },
  ),
  form('mut.blightcrawler.spawn', L('腐沼爬行者', 'Blight Thrall'), 950, 0.75, 3.1, 0.65, ranged(55, 1.5, 4.2, 'sludge', 12), ['ab.mut.roar']),

  // ───── 召喚物 ─────
  minion('mut.fleshy', L('肉芽', 'Fleshy'), 50, 0, 2.8, 0.25, melee(16, 1.0, 0.8, 'bite'), { life: 20, sight: 8 }),
  minion('mut.spiderling', L('小蛛', 'Spiderling'), 300, 0.5, 3.2, 0.35, melee(13, 0.5, 1.4, 'bite')),
  // 甲蟹攻擊時吐出的小孢子：無敵、十來秒就枯萎
  minion('mut.sporeling', L('孢子', 'Sporeling'), 300, 0, 3.1, 0.25, melee(11, 0.8, 0.75, 'bite'), { tags: ['mechanical', 'summon', 'invuln'], life: 12 }),
  minion('mut.worm', L('蠕蟲', 'Worm'), 125, 0.5, 3.1, 0.25, melee(15, 1.0, 0.8, 'bite')),
  minion('mut.swarm', L('蟲群', 'Swarm'), 300, 0.5, 3.5, 0.3, melee(5, 0.5, 1.4, 'bite')),
  // 原作用來堵路：生成時設為 solidBody，別人會被它完整推開
  minion('mut.tentacle', L('觸手', 'Tentacle'), 700, 5.0, 0.5, 0.6, melee(29, 1.0, 2.5, 'claw')),
  minion('mut.carrierSack', L('帶原囊', 'Carrier Sack'), 400, 0, 2.2, 0.55, undefined, { tags: ['mechanical', 'summon', 'flying'] }),
  minion('mut.harbinger', L('先驅', 'Harbinger'), 1100, 1.0, 2.65, 0.6, melee(90, 3.0, 1.2, 'claw'), { mp: 150, mpRegen: 0.8 }),
  // 巢艦（太空）召喚的守衛（太空層）
  minion('mut.guardian', L('巢艦守衛', 'Hive Guardian'), 5000, 50, 1.0, 0.8, { dmg: dmg(399), cd: 1.5, range: 4.5, kind: 'projectile', fx: 'hiveSpore', projSpeed: 16, only: 'space' }, {
    tags: ['mechanical', 'summon', 'space'],
    layer: 'space',
    sight: 16,
  }),
  // 瘟后的病媒蟲：追著目標飛，可以被打下來
  minion('mut.vectorBug', L('病媒蟲', 'Vector Locust'), 80, 0, 5.22, 0.2, undefined, { tags: ['mechanical', 'summon', 'flying'], life: 25, sight: 5 }),
  // 腐沼的黏液足跡（區域物件；傷害由 scripts/mutant.ts 的系統處理）
  {
    id: 'mut.slime',
    name: L('黏液', 'Slime'),
    model: 'mut.slime',
    hp: 1,
    hpRegen: 0,
    mp: 0,
    mpRegen: 0,
    speed: 0,
    radius: 0.6,
    sight: 0,
    abilities: [],
    tags: ['noTarget', 'invuln', 'hazard'],
    corpse: false,
    flags: { slime: true },
  },
]

// ───────── 技能 ─────────

const A = (a: Omit<AbilityDef, 'mana' | 'cd'> & { cd?: number; mana?: number }): AbilityDef => ({ cd: 0, mana: 0, ...a })

export const MUTANT_ABILITIES: AbilityDef[] = [
  // ── 共通 ──
  A({
    id: 'ab.mut.roar',
    name: L('嘶吼', 'Roar'),
    desc: L('仰天長嘯，短時間內出手更快、腳步更急。', 'Lets loose a bellow that briefly quickens both strikes and stride.'),
    icon: 'roar',
    target: 'none',
    cd: 18,
    effects: [
      { k: 'buff', buff: 'bf.mut.roar', to: 'self' },
      { k: 'fx', fx: 'roar', at: 'self' },
    ],
  }),

  // ── 掠食者 ──
  A({
    id: 'ab.mut.sludge',
    name: L('腐泥噴吐', 'Sludge Hurl'),
    desc: L('吐出一道直線飛行的腐泥，沿途每個被濺到的單位都會受傷並短暫黏滯。', 'Spews a line of rotten sludge; everything it splashes is hurt and briefly mired.'),
    icon: 'plasma',
    target: 'point',
    range: 8,
    cd: 15,
    mana: 10,
    effects: [
      {
        k: 'projectile',
        speed: 9,
        fx: 'sludge',
        to: 'point',
        pierce: true,
        range: 8,
        onHit: [
          { k: 'damage', amount: 75, to: 'target', kind: 'poison' },
          { k: 'buff', buff: 'bf.mut.sludged', to: 'target' },
        ],
      },
    ],
  }),

  // ── 迅影 ──
  A({
    id: 'ab.mut.dontBlink',
    name: L('別眨眼', "Don't Blink"),
    desc: L('肌肉瞬間繃到極限，三秒內跑得比任何人都快。', 'Every muscle snaps taut; for three seconds nothing on two legs can keep up.'),
    icon: 'speed',
    target: 'none',
    cd: 9,
    mana: 10,
    effects: [{ k: 'buff', buff: 'bf.mut.dontBlink', to: 'self' }],
  }),
  A({
    id: 'ab.mut.spatialBurst',
    name: L('空間迸躍', 'Spatial Burst'),
    desc: L('折進空間的縫隙，下一瞬已經出現在目標背後並劃上一爪；能繞過屏障。', 'Slips through a fold in space and reappears behind the target with a raking slash. Ignores barriers.'),
    icon: 'teleport',
    target: 'unit',
    range: 7,
    cd: 20,
    mana: 25,
    filter: { noStructure: true },
    effects: [
      { k: 'blink', to: 'target', behind: true },
      { k: 'damage', amount: 50, to: 'target' },
    ],
  }),

  // ── 蠻力 ──
  A({
    id: 'ab.mut.fleshies',
    name: L('肉芽', 'Fleshies'),
    desc: L('從身上剝落六團會走路的肉塊，牠們會自己四處遊蕩、撲咬遇到的人，二十秒後腐爛。', 'Sloughs off six ambling lumps of flesh that wander and bite whoever they meet, rotting away after twenty seconds.'),
    icon: 'dna',
    target: 'none',
    cd: 25,
    mana: 60,
    effects: [S('mutant.summon', { unit: 'mut.fleshy', count: 6, ai: 'wander', life: 20, spread: 1.2 })],
  }),
  A({
    id: 'ab.mut.smash',
    name: L('粉碎', 'Smash'),
    desc: L('高舉雙臂蓄力良久，再全力砸下：門板、設施與站在落點的東西幾乎都會被砸爛。動作很慢，別指望打中會跑的人。', 'Raises both arms, gathers itself for a long moment, then brings everything down. Doors, fixtures and anything standing there are crushed — but anyone moving will simply step aside.'),
    icon: 'door',
    target: 'unitOrPoint',
    range: 1.5,
    cd: 4,
    mana: 35,
    cast: 1.6,
    aoe: 1.2,
    effects: [S('mutant.smash', { dmg: 2500, door: 6000, r: 1.2 })],
  }),

  // ── 擬人株 ──
  A({
    id: 'ab.mut.taintVendor',
    name: L('污染販賣機', 'Taint Vendor'),
    desc: L('把孢子塞進販賣機的出貨口。之後從這台機器拿東西的非我族類都會染上朊毒；它也不再提供抗體。', 'Packs spores into a vendor’s dispenser. Anyone not of your kind who takes from it afterwards catches prions, and it stops handing out antibodies.'),
    icon: 'infect',
    target: 'unit',
    range: 2.5,
    cd: 20,
    mana: 30,
    filter: { tag: 'vendor' },
    effects: [S('mutant.taintVendor')],
  }),

  // ── 蛛母 ──
  A({
    id: 'ab.mut.spiderlings',
    name: L('產蛛', 'Spiderlings'),
    desc: L('產下一隻小蛛，牠會跟在身邊、替你撲咬敵人。', 'Births a spiderling that stays at your side and pounces on your foes.'),
    icon: 'web',
    target: 'none',
    cd: 4,
    mana: 60,
    effects: [S('mutant.summon', { unit: 'mut.spiderling', count: 1, ai: 'guard', spread: 0.8 })],
  }),
  A({
    id: 'ab.mut.reabsorb',
    name: L('回收', 'Reabsorption'),
    desc: L('把自己的一隻眷屬吞回體內，以牠剩下的生命修補自己。', 'Swallows one of your own minions back into your body, healing by whatever life it had left.'),
    icon: 'devour',
    target: 'unit',
    range: 1.6,
    cd: 1,
    filter: { tag: 'summon' },
    effects: [S('mutant.reabsorb')],
  }),

  // ── 潛伏者 ──
  A({
    id: 'ab.mut.stalk',
    name: L('潛獵', 'Stalk'),
    desc: L('融進陰影最多三十秒，移動稍慢。一般攻擊會現形，冷射不會。', 'Melts into the shadows for up to thirty seconds, moving a little slower. A normal attack reveals you; Cold Shot does not.'),
    icon: 'cloak',
    target: 'none',
    cd: 60,
    mana: 30,
    effects: [{ k: 'buff', buff: 'bf.mut.stealth', to: 'self' }],
  }),
  A({
    id: 'ab.mut.snipe',
    name: L('冷射', 'Cold Shot'),
    desc: L('朝地面上的一點射出骨刺，命中處的東西都會被貫穿。不會解除潛獵。', 'Fires a bone spine at a spot on the ground, skewering whatever stands there. Does not break Stalk.'),
    icon: 'gun',
    target: 'point',
    range: 24,
    cd: 2.7,
    aoe: 0.8,
    effects: [{ k: 'projectile', speed: 36, fx: 'mutSpine', to: 'point', onHit: [{ k: 'damage', amount: [114, 134], to: 'point', aoe: 0.8 }] }],
  }),
  A({
    id: 'ab.mut.omniscience',
    name: L('全知之眼', 'Omniscience'),
    desc: L('在目標身上留下氣味標記，你和同類從此看得到牠走到哪裡，直到牠用抗體洗掉為止。', 'Leaves a scent mark on the target; you and your kind can see wherever it goes until it scrubs the mark off with antibodies.'),
    icon: 'eye',
    target: 'unit',
    range: 5,
    cd: 1,
    mana: 20,
    filter: { noStructure: true },
    effects: [{ k: 'buff', buff: 'bf.mut.omniscience', to: 'target' }],
  }),

  // ── 甲蟹 ──
  A({
    id: 'ab.mut.panic',
    name: L('驚慌', 'Panic'),
    desc: L('甲蟹嚇壞了：能量瞬間灌滿，但永久失去一半生命與三分之一攻擊力，每次攻擊吐出的孢子也少一隻。一局只能用一次。', 'The crab panics: energy floods back to full, but it permanently loses half its health and a third of its bite, and spits one fewer sporeling per attack. Once per game.'),
    icon: 'skull',
    target: 'none',
    once: true,
    effects: [S('mutant.panic'), { k: 'fx', fx: 'roar', at: 'self' }],
  }),
  A({
    id: 'ab.mut.crabosity',
    name: L('甲蟹跳躍', 'Crabosity'),
    desc: L('甲蟹幾乎爬不動，但每次下達移動指令時，牠會燒掉能量直接跳到目的地（越遠越貴，一次最多 16 公尺）。能量不夠就只能慢慢爬。', 'The crab can barely crawl, but whenever it is ordered to move it burns energy to jump straight there (costlier with distance, up to 16 m per jump). Out of energy, it crawls.'),
    icon: 'teleport',
    target: 'passive',
    effects: [],
  }),
  A({
    id: 'ab.mut.carapace',
    name: L('厚殼', 'Carapace'),
    desc: L('額外 700 生命的厚重甲殼；保有甲殼時每次攻擊吐出三隻孢子，否則兩隻。孢子無敵，十二秒後枯萎。', 'A heavy shell worth 700 extra health. While intact, each attack spits three sporelings instead of two. Sporelings are invulnerable and wither after twelve seconds.'),
    icon: 'shield',
    target: 'passive',
    effects: [],
  }),

  // ── 血肉巨像 ──
  A({
    id: 'ab.mut.rainingRocks',
    name: L('碎石雨', "It's Raining Rocks"),
    desc: L('扯下一大塊殘骸朝目標處甩過去，砸傷底下的東西，碎塊留在原地擋路。', 'Rips loose a slab of debris and flings it at the spot, crushing whatever is beneath and leaving rubble in the way.'),
    icon: 'rock',
    target: 'point',
    range: 12,
    cd: 20,
    mana: 20,
    cast: 0.5,
    aoe: 1.5,
    effects: [
      {
        k: 'projectile',
        speed: 12,
        fx: 'rock',
        to: 'point',
        onHit: [
          { k: 'damage', amount: 150, to: 'point', aoe: 1.5, kind: 'blast' },
          { k: 'rubble', count: 3, radius: 1.2, at: 'point' },
          S('mutant.boom', { r: 1.5 }),
        ],
      },
    ],
  }),
  A({
    id: 'ab.mut.rocksFall',
    name: L('落石封路', 'Rocks Fall, Everyone Dies'),
    desc: L('一拳砸穿地板，天花板應聲崩落，在身邊五公尺外圍出一整圈瓦礫牆，把附近的人困在裡面。', 'Punches through the deck; the ceiling caves in and drops a full ring of rubble five metres out, penning in anyone nearby.'),
    icon: 'rock',
    target: 'none',
    cd: 30,
    mana: 25,
    aoe: 5.12,
    effects: [S('mutant.rocksFall', { count: 36, r: 5.12 }), { k: 'fx', fx: 'quake', at: 'self' }],
  }),
  A({
    id: 'ab.mut.crush',
    name: L('碾壓', 'Crushing Bulk'),
    desc: L('身軀大到荒謬，腳下的瓦礫會直接被踩碎。想穿過瓦礫時請直接下令走向它。', 'So absurdly large that rubble underfoot is simply ground to dust. Order it straight into rubble to clear a path.'),
    icon: 'rock',
    target: 'passive',
    effects: [],
  }),

  // ── 牛頭蠻 ──
  A({
    id: 'ab.mut.charge',
    name: L('蠻牛衝鋒', 'Charge'),
    desc: L('低頭朝目標點狂奔，撞上的人會受傷並被一路拖著走，擋路的瓦礫也一併撞開。', 'Lowers its horns and stampedes to the target point, goring and dragging everyone in the way and bulldozing any rubble.'),
    icon: 'speed',
    target: 'point',
    range: 20,
    cd: 15,
    mana: 20,
    effects: [
      S('mutant.chargePrep', { max: 20 }),
      { k: 'dash', speed: 14, maxDist: 20, to: 'point', hitAlong: [{ k: 'damage', amount: 85, to: 'target' }, S('mutant.chargeHit')] },
    ],
  }),
  A({
    id: 'ab.mut.rollingThunder',
    name: L('滾雷', 'Rolling Thunder'),
    desc: L('怒火沸騰十五秒，這段時間這個技能換成「震波」，可以接連踏出擊退敵人的地震波。', 'Rage boils over for fifteen seconds; during that time this ability becomes Shockwave, letting you stomp out quake after quake.'),
    icon: 'storm',
    target: 'none',
    cd: 35,
    mana: 50,
    cast: 1.2,
    effects: [{ k: 'buff', buff: 'bf.mut.rollingThunder', to: 'self' }, S('mutant.rollingThunder', { dur: 15 }), { k: 'fx', fx: 'roar', at: 'self' }],
  }),
  A({
    id: 'ab.mut.shockwave',
    name: L('震波', 'Shockwave'),
    desc: L('重踏地面，送出一道直線前進的地震波，沿途的人都會受傷並被震退。', 'Stamps the deck and sends a quake rolling forward; everyone along its path is hurt and thrown back.'),
    icon: 'bolt',
    target: 'point',
    range: 9,
    cd: 1.2,
    effects: [
      {
        k: 'projectile',
        speed: 14,
        fx: 'quake',
        to: 'point',
        pierce: true,
        range: 9,
        onHit: [{ k: 'damage', amount: 70, to: 'target', kind: 'blast' }, { k: 'buff', buff: 'bf.mut.staggered', to: 'target' }, S('mutant.knockAway', { dist: 3 })],
      },
    ],
  }),

  // ── 瘟后 ──
  A({
    id: 'ab.mut.totalInfection',
    name: L('全域感染', 'Total Infection'),
    desc: L('釋放隨空調擴散的孢子雲：星區裡每一個不屬於你族類的人，不論躲在哪座站，都會同時染上強效朊毒。', 'Releases a spore bloom that rides the air ducts: every person in the sector who is not of your kind, on any station, catches potent prions at once.'),
    icon: 'infect',
    target: 'none',
    cd: 60,
    mana: 25,
    effects: [S('mutant.totalInfection'), { k: 'fx', fx: 'roar', at: 'self' }],
  }),
  A({
    id: 'ab.mut.vector',
    name: L('病媒蟲', 'Vector'),
    desc: L('放出一隻嗜血的飛蝗追著目標飛。被咬中的人會在接下來一分多鐘裡反覆抽搐、動彈不得；飛蝗本身可以被打下來。', 'Looses a bloodthirsty locust that homes in on the target. Whoever it bites suffers recurring seizures for over a minute. The locust itself can be shot down.'),
    icon: 'drone',
    target: 'unit',
    range: 9,
    cd: 20,
    mana: 50,
    filter: { noStructure: true },
    effects: [S('mutant.vector', { life: 25 })],
  }),
  A({
    id: 'ab.mut.blastShield',
    name: L('爆盾', 'Blast Shield'),
    desc: L('甲殼瞬間硬化，四秒內不受任何傷害。', 'The hide hardens in an instant; nothing can hurt you for four seconds.'),
    icon: 'shield',
    target: 'none',
    cd: 35,
    mana: 25,
    effects: [{ k: 'buff', buff: 'bf.mut.blastShield', to: 'self' }],
  }),

  // ── 繁巢 ──
  A({
    id: 'ab.mut.carrier',
    name: L('帶原者', 'Carrier'),
    desc: L('在一個人身上掛一團看不見的病雲。他本人不會發病，但靠近他的其他人都會染上最猛烈的朊毒；抗體能清掉。', 'Hangs an invisible disease cloud on a person. They stay healthy themselves, but anyone else who comes close catches the fiercest prions. Antibodies wash it off.'),
    icon: 'infect',
    target: 'unit',
    range: 6,
    cd: 45,
    mana: 30,
    filter: { tag: 'personnel' },
    effects: [{ k: 'buff', buff: 'bf.mut.carrier', to: 'target' }],
  }),

  // ── 腐沼 ──
  A({
    id: 'ab.mut.metamorphosis',
    name: L('化蟲', 'Metamorphosis'),
    desc: L('身體崩解成一圈十六條蠕蟲，你操控其中一條。六十秒後只要還有蟲活著，就在牠身上重新聚合（生命依蟲群剩餘比例）；全滅就是死。', 'Your body bursts into a ring of sixteen worms, one of which you steer. After sixty seconds you reassemble on a survivor, with health scaled to what the swarm kept. If every worm dies, so do you.'),
    icon: 'evolve',
    target: 'none',
    cd: 240,
    mana: 50,
    effects: [S('mutant.metamorphosis', { count: 16, dur: 60, r: 1.25 })],
  }),
  A({
    id: 'ab.mut.slimeTrail',
    name: L('黏液足跡', 'Slime Trail'),
    desc: L('走過的地方都會留下腐蝕黏液，踩上去的人會受傷並被黏住腳步，持續十秒。', 'Leaves corrosive slime wherever it crawls; anyone who steps in it is burned and slowed. Each patch lasts ten seconds.'),
    icon: 'web',
    target: 'passive',
    effects: [],
  }),

  // ── 巢艦（太空）──
  A({
    id: 'ab.mut.guardian',
    name: L('守衛', 'Guardian'),
    desc: L('從艦體裡擠出一艘活體守衛艇，在太空中替巢艦抵擋來犯者。', 'Squeezes a living guard craft out of the hull to fend off attackers in space.'),
    icon: 'ship',
    target: 'none',
    cd: 1,
    mana: 40,
    spaceOnly: true,
    effects: [S('mutant.summon', { unit: 'mut.guardian', count: 1, ai: 'guard', spread: 5 })],
  }),
  A({
    id: 'ab.mut.viewIntestines',
    name: L('內視', 'View Intestines'),
    desc: L('感受體內三座巢心的狀況：回報牠們剩下多少生命，並短暫看見牠們周圍。', 'Feels for the three hive hearts inside you: reports how much life they have left and briefly shows their surroundings.'),
    icon: 'eye',
    target: 'none',
    cd: 3,
    effects: [S('mutant.viewIntestines', { dur: 5 })],
  }),

  // ── 先驅（巢艦 spawn）──
  A({
    id: 'ab.mut.fervor',
    name: L('蟲群狂熱', 'Swarm Fervor'),
    desc: L('發出刺耳的嘶鳴，附近的同類在三秒內速度暴增。', 'A grating shriek drives your kind nearby into a three-second frenzy of speed.'),
    icon: 'speed',
    target: 'none',
    cd: 30,
    mana: 25,
    aoe: 8,
    effects: [S('mutant.factionBuff', { buff: 'bf.mut.fervor', r: 8 })],
  }),
  A({
    id: 'ab.mut.embrace',
    name: L('主宰之擁', 'Embrace of the Overlord'),
    desc: L('以巢艦的養分包覆附近的同類，十秒內持續回復生命。', 'Wraps your kind nearby in the hive’s nourishment, mending them over ten seconds.'),
    icon: 'heal',
    target: 'none',
    cd: 60,
    mana: 75,
    aoe: 8,
    effects: [S('mutant.factionBuff', { buff: 'bf.mut.embrace', r: 8 })],
  }),

  // ── 巢艦（地面）孕育 ──（原作以 EP 當門檻、不實際扣除）
  A({
    id: 'ab.mut.breedTentacle',
    name: L('孕育觸手', 'Breed Tentacle'),
    desc: L('在巢旁長出一條粗壯的觸手，堵住通道並抽打靠近的人。需要 80 EP（不消耗）。', 'Grows a thick tentacle beside the hive that plugs corridors and lashes anyone close. Requires 80 EP (not spent).'),
    icon: 'tentacle',
    target: 'none',
    cd: 25,
    effects: [S('mutant.breed', { unit: 'mut.tentacle', count: 1, need: 80, ai: 'static' })],
  }),
  A({
    id: 'ab.mut.breedSwarm',
    name: L('孕育蟲群', 'Breed Swarm'),
    desc: L('一次孵出兩隻廉價的蟲群，數量沒有上限。需要 20 EP（不消耗）。', 'Hatches two cheap swarmers at a time, with no limit on how many. Requires 20 EP (not spent).'),
    icon: 'egg',
    target: 'none',
    cd: 10,
    effects: [S('mutant.breed', { unit: 'mut.swarm', count: 2, need: 20, ai: 'wander' })],
  }),
  A({
    id: 'ab.mut.breedSack',
    name: L('孕育帶原囊', 'Breed Carrier Sack'),
    desc: L('孕育一顆會飄的肉囊，發現敵人就撲上去爆開，灑出蟲群。最多 10 顆，需要 40 EP（不消耗）。', 'Grows a floating flesh sac that hurls itself at enemies and bursts into swarmers. Up to 10; requires 40 EP (not spent).'),
    icon: 'pod',
    target: 'none',
    cd: 30,
    effects: [S('mutant.breed', { unit: 'mut.carrierSack', count: 1, need: 40, cap: 10, ai: 'sack' })],
  }),
  A({
    id: 'ab.mut.breedHarbinger',
    name: L('孕育先驅', 'Breed Harbinger'),
    desc: L('孕育你最珍貴的子嗣：強壯、聰明的先驅。同時只能有一隻，需要 140 EP（不消耗）。', 'Raises your most prized progeny, the strong and clever Harbinger. Only one at a time; requires 140 EP (not spent).'),
    icon: 'evolve',
    target: 'none',
    cd: 40,
    effects: [S('mutant.breed', { unit: 'mut.harbinger', count: 1, need: 140, cap: 1, ai: 'guard' })],
  }),
]

// ───────── Buff ─────────
// 變種人形態本身是公開的（原作進化會全服廣播），所以形態身上的 buff 可以 vis:'all'；
// 掛在別人身上、會洩漏「被變種人盯上／感染」的 buff 一律 casterFaction。

export const MUTANT_BUFFS: BuffDef[] = [
  { id: 'bf.mut.roar', name: L('嘶吼', 'Roaring'), icon: 'roar', vis: 'all', good: true, dur: 5, atkSpeed: 1.25, move: 1.15, fx: 'roar' },
  { id: 'bf.mut.sludged', name: L('腐泥', 'Sludged'), icon: 'plasma', vis: 'all', good: false, dur: 3, move: 0.7, fx: 'sludge' },
  { id: 'bf.mut.dontBlink', name: L('疾影', 'Blur'), icon: 'speed', vis: 'all', good: true, dur: 3, move: 1.7 },
  // 名稱以 stealth 結尾：施放 breaksStealth 的技能會解除它
  { id: 'bf.mut.stealth', name: L('潛獵', 'Stalking'), icon: 'cloak', vis: 'casterFaction', good: true, dur: 30, stealth: true, move: 0.8, breakOnAttack: true },
  {
    id: 'bf.mut.omniscience',
    name: L('氣味標記', 'Scent Mark'),
    icon: 'eye',
    vis: 'casterFaction',
    good: false,
    every: 0.5,
    tickEffects: [S('mutant.omniTick', { r: 2.5 })],
    // prion：讓抗體（cleanse tags ['prion']）可以洗掉
    flags: { prion: true, omniscience: true },
  },
  { id: 'bf.mut.panicked', name: L('驚慌', 'Panicked'), icon: 'skull', vis: 'all', good: false, dmgMult: 0.67 },
  { id: 'bf.mut.blastShield', name: L('爆盾', 'Blast Shield'), icon: 'shield', vis: 'all', good: true, dur: 4, invuln: true, fx: 'shield' },
  { id: 'bf.mut.rollingThunder', name: L('滾雷', 'Rolling Thunder'), icon: 'storm', vis: 'all', good: true, dur: 15, fx: 'rage' },
  { id: 'bf.mut.dragged', name: L('被拖行', 'Dragged'), icon: 'claw', vis: 'all', good: false, dur: 0.8, stun: true },
  { id: 'bf.mut.staggered', name: L('踉蹌', 'Staggered'), icon: 'bolt', vis: 'all', good: false, dur: 0.5, stun: true },
  {
    id: 'bf.mut.carrier',
    name: L('帶原', 'Carrier'),
    icon: 'infect',
    vis: 'casterFaction',
    good: false,
    dur: 120,
    every: 0.5,
    tickEffects: [S('mutant.carrierTick', { r: 3.5 })],
    flags: { prion: true, carrier: true },
  },
  { id: 'bf.mut.vector', name: L('抽搐病', 'Seizure Fever'), icon: 'infect', vis: 'casterFaction', good: false, dur: 85, flags: { prion: true, vector: true } },
  { id: 'bf.mut.seizure', name: L('抽搐', 'Seizure'), icon: 'skull', vis: 'casterFaction', good: false, dur: 0.3, stun: true },
  // 化蟲期間本體藏起來（無敵、隱形、不能行動）
  { id: 'bf.mut.metamorph', name: L('化蟲', 'Dispersed'), icon: 'evolve', vis: 'self', good: true, invuln: true, stealth: true, stun: true },
  { id: 'bf.mut.slimed', name: L('黏滯', 'Slimed'), icon: 'web', vis: 'all', good: false, dur: 1, move: 0.7 },
  { id: 'bf.mut.fervor', name: L('蟲群狂熱', 'Swarm Fervor'), icon: 'speed', vis: 'all', good: true, dur: 3, move: 1.5 },
  { id: 'bf.mut.embrace', name: L('主宰之擁', 'Overlord’s Embrace'), icon: 'heal', vis: 'all', good: true, dur: 10, hot: 20 },
  // 召喚物 AI（每 0.5 秒想一次要打誰）
  { id: 'bf.mut.minion', name: L('眷屬本能', 'Minion Instinct'), icon: 'dna', vis: 'self', good: true, every: 0.5, tickEffects: [S('mutant.minionAi')] },
  { id: 'bf.mut.bug', name: L('追獵', 'Homing'), icon: 'drone', vis: 'self', good: true, every: 0.2, tickEffects: [S('mutant.bugAi')] },
]

regUnits(MUTANT_UNITS)
regAbilities(MUTANT_ABILITIES)
regBuffs(MUTANT_BUFFS)
