// 仿生人 2000 EP 升級機體（研究 02 §5.5；內容總表「異類與仿生人型態」）
// 機體是 mechanical＋chassis：不能穿防護服、不會被寄生／朊毒感染、免疫神經毒素。
// 需要 script 的技能在 src/sim/scripts/android.ts。
import { regAbilities, regBuffs, regUnits } from '../registry'
import type { AbilityDef, AttackDef, BuffDef, Effect, Loc, UnitDef } from '../types'

const L = (zh: string, en: string): Loc => ({ zh, en })
const S = (fn: string, p?: Record<string, number | string | boolean>): Effect => ({ k: 'script', fn, p })

function chassis(id: string, name: Loc, hp: number, hpRegen: number, speed: number, attack: AttackDef, abilities: string[], extra: Partial<UnitDef> = {}): UnitDef {
  return {
    id,
    name,
    model: id,
    hp,
    hpRegen,
    mp: 100,
    mpRegen: 0.8,
    armor: 0,
    speed,
    radius: 0.55,
    sight: 14,
    attack,
    abilities,
    tags: ['mechanical', 'chassis', 'immuneToxin'],
    inv: 6,
    corpse: true,
    ...extra,
  }
}

export const ANDROID_UNITS: UnitDef[] = [
  // 109+1d1
  chassis(
    'android.bulwark',
    L('壁壘型', 'Bulwark Chassis'),
    2200,
    0,
    2.0,
    { dmg: [110, 110], cd: 3.0, range: 14, kind: 'projectile', fx: 'rocket', projSpeed: 22, dmgKind: 'blast' },
    ['ab.chassis.prismRockets', 'ab.chassis.restore', 'ab.chassis.nuke'],
    { radius: 0.65 },
  ),
  // 27+1d1
  chassis('android.gale', L('疾風型', 'Gale Chassis'), 1100, 0.5, 3.2, { dmg: [28, 28], cd: 0.65, range: 1.2, kind: 'melee', fx: 'saw' }, [
    'ab.chassis.rotaryDodge',
    'ab.chassis.pulseWave',
    'ab.chassis.restore',
  ]),
  // 原作 5 傷害、0.02 秒冷卻（實際受動畫限制）；本作取 0.15 秒、無前搖的連射
  chassis(
    'android.pengu',
    L('企鵝型', 'Pengu Chassis'),
    1200,
    5,
    3.6,
    { dmg: [5, 5], cd: 0.15, range: 19, kind: 'hitscan', fx: 'gatling', windup: 0 },
    ['ab.chassis.restore', 'ab.chassis.nuke'],
    { radius: 0.4 },
  ),
]

export const ANDROID_ABILITIES: AbilityDef[] = [
  {
    id: 'ab.chassis.prismRockets',
    name: L('稜鏡火箭', 'Prism Rockets'),
    desc: L('四聯稜鏡發射器一口氣朝目標區域傾瀉十五枚火箭，落點散布在三公尺內。', 'The quad prism pods empty fifteen rockets into the target area, scattered within three metres.'),
    icon: 'rocket',
    target: 'point',
    range: 30,
    cd: 70,
    mana: 0,
    aoe: 3,
    effects: [S('chassis.prismRockets', { n: 15, spread: 3, dmg: 60, aoe: 1.4, interval: 0.08 })],
  },
  {
    id: 'ab.chassis.restore',
    name: L('自動修復', 'Automatic Restoration'),
    desc: L('原地停下，讓體內的維修單元工作：每秒修復 12 點生命，移動或下其他指令就會中斷。', 'Stand still and let the internal repair units work: restores 12 health per second until you move or take another order.'),
    icon: 'wrench',
    target: 'none',
    cd: 20,
    mana: 0,
    channel: 600,
    channelTick: 0.5,
    tickEffects: [{ k: 'heal', amount: 6, to: 'self' }],
    effects: [{ k: 'fx', fx: 'repair', at: 'self' }],
  },
  {
    id: 'ab.chassis.nuke',
    name: L('戰術核爆', 'Tactical Nuclear Explosion'),
    desc: L('升起防爆罩，三秒後引爆機身內的小型核裝置，半徑七公尺內不分敵我嚴重受創，門也會被炸壞。', 'Raises blast shielding, then three seconds later sets off the small nuclear device in its chassis. Everything within seven metres — friend or foe — is devastated, doors included.'),
    icon: 'bomb',
    target: 'none',
    cd: 180,
    mana: 0,
    aoe: 7,
    effects: [
      { k: 'buff', buff: 'bf.chassis.blastShield', to: 'self' },
      { k: 'fx', fx: 'nukeArm', at: 'self' },
      { k: 'delay', t: 3, then: [S('chassis.nukeBlast', { dmg: 1200, r: 7, door: 2500 })] },
    ],
  },
  {
    id: 'ab.chassis.rotaryDodge',
    name: L('迴旋閃避', 'Rotary Dodge'),
    desc: L('高速自旋並點燃推進器浮起五秒：大部分攻擊都會落空、移動稍快；起飛與落地時震傷身邊的人。', 'Spins up and lifts off on its thrusters for five seconds: most attacks miss and it moves a little faster. Takeoff and landing batter anyone close by.'),
    icon: 'speed',
    target: 'none',
    cd: 25,
    mana: 0,
    aoe: 2.5,
    effects: [
      { k: 'damage', amount: 60, to: 'self', aoe: 2.5 },
      { k: 'buff', buff: 'bf.chassis.rotary', to: 'self' },
      { k: 'fx', fx: 'rotary', at: 'self' },
      { k: 'delay', t: 5, then: [S('chassis.rotaryLand', { dmg: 60, r: 2.5 })] },
    ],
  },
  {
    id: 'ab.chassis.pulseWave',
    name: L('脈衝震波', 'Pulse Wave'),
    desc: L('重擊地面送出一道直線衝擊波，沿途的人受傷、被擊飛並倒地片刻。', 'Slams the deck and drives a shockwave forward; everything in its path is hurt, flung back and knocked off its feet.'),
    icon: 'bolt',
    target: 'point',
    range: 12,
    cd: 30,
    mana: 0,
    effects: [
      {
        k: 'projectile',
        speed: 16,
        fx: 'pulseWave',
        to: 'point',
        pierce: true,
        range: 12,
        onHit: [{ k: 'damage', amount: 90, to: 'target', kind: 'blast' }, { k: 'buff', buff: 'bf.chassis.knocked', to: 'target' }, S('chassis.knockAway', { dist: 3 })],
      },
    ],
  },
]

export const ANDROID_BUFFS: BuffDef[] = [
  { id: 'bf.chassis.blastShield', name: L('防爆罩', 'Blast Shielding'), icon: 'shield', vis: 'all', good: true, dur: 4, invuln: true, fx: 'shield' },
  { id: 'bf.chassis.rotary', name: L('迴旋', 'Spinning'), icon: 'speed', vis: 'all', good: true, dur: 5, evade: 0.9, move: 1.15, fx: 'rotary' },
  { id: 'bf.chassis.knocked', name: L('倒地', 'Knocked Down'), icon: 'bolt', vis: 'all', good: false, dur: 1.2, stun: true },
]

regUnits(ANDROID_UNITS)
regAbilities(ANDROID_ABILITIES)
regBuffs(ANDROID_BUFFS)
