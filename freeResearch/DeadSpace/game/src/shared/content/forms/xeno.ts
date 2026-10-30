// 異形全部形態、spawn 型與形態專屬技能（研究 02 §3.6；內容總表「異類與仿生人型態」）
// - 數值：HP、攻擊、CD、射程、移速照 §3.6（射程、移速 ÷100）；spawn 的 CD／射程／回血取原圖物件資料。
// - 身分機制技能（xeno.parasite／xeno.egg／xeno.human／xeno.spawnHuman）由 roleAbilities.ts 註冊，這裡只引用。
// - 需要腳本的行為寫在 src/sim/scripts/xeno.ts；技能名稱與描述為本作原創。
import { regAbilities, regBuffs, regUnits } from '../registry'
import type { AbilityDef, AttackDef, BuffDef, DamageKind, Effect, Loc, UnitDef } from '../types'

const L = (zh: string, en: string): Loc => ({ zh, en })

// ───────── 技能與 buff id（腳本端共用）─────────

export const XAB = {
  entropy: 'ab.lumen.entropy',
  deflect: 'ab.lumen.deflect',
  tentacles: 'ab.brute.tentacles',
  neurotoxin: 'ab.xeno.neurotoxin',
  flux: 'ab.pup.flux',
  mute: 'ab.xeno.mute',
  explosion: 'ab.pyre.explosion',
  explosionSpawn: 'ab.pyre.explosionSpawn',
  lordOfFlames: 'ab.pyre.lordOfFlames',
  strike: 'ab.arc.strike',
  disrupt: 'ab.arc.disrupt',
  blackness: 'ab.phantasm.blackness',
  manifold: 'ab.phantasm.manifold',
  manifoldSpawn: 'ab.phantasm.manifoldSpawn',
  petrify: 'ab.gorgon.petrify',
  swarmbolt: 'ab.hydra.swarmbolt',
  coreForm: 'ab.hydra.coreForm',
  coreFormSpawn: 'ab.hydra.coreFormSpawn',
  regen: 'ab.hydra.regen',
  webwire: 'ab.weaver.webwire',
  fountain: 'ab.weaver.fountain',
  relocate: 'ab.void.relocate',
  swap: 'ab.void.swap',
  revive: 'ab.chrono.revive',
  loop: 'ab.chrono.loop',
  masks: 'ab.mimic.masks',
  unmask: 'xeno.unmask',
  frenzy: 'ab.zombie.frenzy',
} as const

export const XBF = {
  entropy: 'bf.xeno.entropy',
  neurotoxin: 'bf.xeno.neurotoxin',
  fluxSlow: 'bf.xeno.fluxSlow',
  fluxStasis: 'bf.xeno.fluxStasis',
  echo: 'bf.xeno.echo',
  mirage30: 'bf.xeno.mirage30',
  mirage20: 'bf.xeno.mirage20',
  muted: 'bf.xeno.muted',
  blackness: 'bf.xeno.blackness',
  petrified: 'bf.xeno.petrified',
  tripped: 'bf.xeno.tripped',
  webbed: 'bf.xeno.webbed',
  frenzy: 'bf.xeno.frenzy',
} as const

/** 輔助單位 def id */
export const XUNIT = {
  timeZombie: 'xeno.timeZombie',
  eldritch: 'xeno.eldritch',
  core: 'xeno.hydra.core',
  spawnCore: 'xeno.hydra.spawnCore',
  entropyField: 'xeno.entropyField',
  webAnchor: 'xeno.webAnchor',
} as const

// 身分機制技能（roleAbilities.ts）
const PARASITE = 'xeno.parasite'
const EGG = 'xeno.egg'
const HUMAN = 'xeno.human'
const SPAWN_HUMAN = 'xeno.spawnHuman'

// ───────── 單位建構 ─────────

interface AtkSpec {
  dmg: number
  cd: number
  /** 公尺 */
  range: number
  kind: AttackDef['kind']
  fx: string
  projSpeed?: number
  dmgKind?: DamageKind
  /** 普攻附帶神經毒涎 */
  neuro?: boolean
}

const NEURO_HIT: Effect = { k: 'script', fn: 'xeno.neurotoxin' }

function atk(a: AtkSpec): AttackDef {
  const out: AttackDef = { dmg: [a.dmg, a.dmg], cd: a.cd, range: a.range, kind: a.kind, fx: a.fx }
  if (a.projSpeed) out.projSpeed = a.projSpeed
  if (a.dmgKind) out.dmgKind = a.dmgKind
  if (a.neuro) out.onHit = [NEURO_HIT]
  return out
}

interface FormSpec {
  hp: number
  /** 原表「—」＝ 0.5 */
  regen: number
  speed: number
  radius: number
  attack?: AtkSpec
  abilities: string[]
  flags?: UnitDef['flags']
}

function xenoUnit(id: string, name: Loc, model: string, s: FormSpec): UnitDef {
  const def: UnitDef = {
    id,
    name,
    model,
    hp: s.hp,
    hpRegen: s.regen,
    mp: 100,
    mpRegen: 0.8,
    speed: s.speed,
    radius: s.radius,
    sight: 14,
    abilities: s.abilities,
    // 異形形態不能穿防護服、不能被寄生：不給 organic／personnel
    tags: ['mechanical', 'xenoForm'],
    inv: 6,
    corpse: true,
  }
  if (s.attack) def.attack = atk(s.attack)
  if (s.flags) def.flags = s.flags
  return def
}

/** 主形態＋spawn 型（spawn 用同一個 model，render 端縮小並換色）*/
function pair(key: string, name: Loc, main: FormSpec, spawn: FormSpec): UnitDef[] {
  const model = 'xeno.' + key
  return [
    xenoUnit('xeno.' + key, name, model, main),
    xenoUnit('xeno.' + key + '.spawn', L(name.zh + '子嗣', name.en + ' Spawn'), model, spawn),
  ]
}

const LORD_FLAGS = { fireImmune: true, blastImmune: true }

export const XENO_UNITS: UnitDef[] = [
  // ── T1 ──
  ...pair(
    'protoform',
    L('原型體', 'Protoform'),
    { hp: 650, regen: 0.75, speed: 2.85, radius: 0.5, attack: { dmg: 45, cd: 1.5, range: 4, kind: 'melee', fx: 'claw' }, abilities: [PARASITE, EGG, HUMAN] },
    { hp: 600, regen: 0.75, speed: 2.85, radius: 0.45, attack: { dmg: 41, cd: 1.5, range: 4, kind: 'melee', fx: 'claw' }, abilities: [PARASITE, SPAWN_HUMAN] },
  ),
  // ── T2 ──
  ...pair(
    'lumen',
    L('熵光體', 'Lumen'),
    {
      hp: 700,
      regen: 0.5,
      speed: 2.85,
      radius: 0.5,
      attack: { dmg: 16, cd: 0.5, range: 6, kind: 'projectile', fx: 'xeno', projSpeed: 18 },
      abilities: [XAB.entropy, PARASITE, EGG, HUMAN, XAB.deflect],
    },
    {
      hp: 650,
      regen: 0.5,
      speed: 2.85,
      radius: 0.45,
      attack: { dmg: 16, cd: 0.6, range: 6, kind: 'projectile', fx: 'xeno', projSpeed: 18 },
      abilities: [PARASITE, SPAWN_HUMAN, XAB.deflect],
    },
  ),
  ...pair(
    'brute',
    L('蠻甲獸', 'Brute'),
    {
      hp: 875,
      regen: 2,
      speed: 3.3,
      radius: 0.6,
      attack: { dmg: 49, cd: 1.4, range: 1.4, kind: 'melee', fx: 'claw', neuro: true },
      abilities: [XAB.tentacles, PARASITE, EGG, HUMAN, XAB.neurotoxin],
    },
    { hp: 650, regen: 0.5, speed: 3.2, radius: 0.55, attack: { dmg: 32, cd: 1, range: 1.4, kind: 'melee', fx: 'claw' }, abilities: [XAB.tentacles, PARASITE, SPAWN_HUMAN] },
  ),
  ...pair(
    'puppeteer',
    L('牽絲者', 'Puppeteer'),
    {
      hp: 700,
      regen: 0.75,
      speed: 2.75,
      radius: 0.5,
      attack: { dmg: 44, cd: 1.5, range: 6, kind: 'projectile', fx: 'xeno', projSpeed: 16 },
      abilities: [XAB.flux, XAB.mute, PARASITE, EGG, HUMAN],
    },
    { hp: 650, regen: 0.75, speed: 2.75, radius: 0.45, attack: { dmg: 39, cd: 1.5, range: 6, kind: 'projectile', fx: 'xeno', projSpeed: 16 }, abilities: [PARASITE, SPAWN_HUMAN] },
  ),
  // ── T3：能量 ──
  ...pair(
    'pyreheart',
    L('爆燃者', 'Pyreheart'),
    {
      hp: 900,
      regen: 0.75,
      speed: 2.75,
      radius: 0.6,
      attack: { dmg: 24, cd: 0.75, range: 6.5, kind: 'projectile', fx: 'fire', projSpeed: 16, dmgKind: 'fire' },
      abilities: [XAB.explosion, PARASITE, HUMAN, XAB.lordOfFlames],
      flags: LORD_FLAGS,
    },
    {
      hp: 700,
      regen: 0.75,
      speed: 2.75,
      radius: 0.55,
      attack: { dmg: 19, cd: 0.75, range: 6.5, kind: 'projectile', fx: 'fire', projSpeed: 16, dmgKind: 'fire' },
      abilities: [XAB.explosionSpawn, PARASITE, SPAWN_HUMAN, XAB.lordOfFlames],
      flags: LORD_FLAGS,
    },
  ),
  ...pair(
    'arcflayer',
    L('雷殛者', 'Arcflayer'),
    {
      hp: 1050,
      regen: 0.75,
      speed: 2.8,
      radius: 0.65,
      attack: { dmg: 65, cd: 1.5, range: 1.4, kind: 'melee', fx: 'xenoArc', dmgKind: 'energy' },
      abilities: [XAB.strike, XAB.disrupt, PARASITE, HUMAN],
      // 磁暴封鎖鎖住的門擋不住雷殛者本身
      flags: { passLocked: true },
    },
    { hp: 800, regen: 0.75, speed: 2.8, radius: 0.6, attack: { dmg: 64, cd: 1.5, range: 1.4, kind: 'melee', fx: 'xenoArc', dmgKind: 'energy' }, abilities: [XAB.strike, PARASITE, SPAWN_HUMAN] },
  ),
  ...pair(
    'phantasm',
    L('幻影者', 'Phantasm'),
    {
      hp: 700,
      regen: 0.75,
      speed: 2.75,
      radius: 0.55,
      attack: { dmg: 38, cd: 1, range: 6.5, kind: 'projectile', fx: 'skyfire', projSpeed: 15 },
      abilities: [XAB.blackness, XAB.manifold, PARASITE, HUMAN],
    },
    {
      hp: 625,
      regen: 0.75,
      speed: 2.75,
      radius: 0.5,
      attack: { dmg: 34, cd: 1, range: 6.5, kind: 'projectile', fx: 'skyfire', projSpeed: 15 },
      abilities: [XAB.manifoldSpawn, PARASITE, SPAWN_HUMAN],
    },
  ),
  // ── T3：力量 ──
  ...pair(
    'gorgon',
    L('石瞳蛇', 'Gorgon Serpent'),
    {
      hp: 1700,
      regen: 1,
      speed: 2.95,
      radius: 0.75,
      attack: { dmg: 42, cd: 1, range: 1.4, kind: 'melee', fx: 'claw', neuro: true },
      abilities: [XAB.petrify, PARASITE, HUMAN, XAB.neurotoxin],
    },
    {
      hp: 1300,
      regen: 0.5,
      speed: 2.95,
      radius: 0.7,
      attack: { dmg: 39, cd: 1, range: 1.4, kind: 'melee', fx: 'claw', neuro: true },
      abilities: [PARASITE, SPAWN_HUMAN, XAB.neurotoxin],
    },
  ),
  ...pair(
    'hydra',
    L('再生核', 'Hydra Core'),
    {
      hp: 450,
      regen: 16,
      speed: 2.65,
      radius: 0.5,
      attack: { dmg: 70, cd: 1.25, range: 1.4, kind: 'melee', fx: 'claw' },
      abilities: [XAB.swarmbolt, PARASITE, HUMAN, XAB.coreForm, XAB.regen],
    },
    {
      hp: 350,
      regen: 15,
      speed: 2.3,
      radius: 0.45,
      attack: { dmg: 60, cd: 1.25, range: 1.4, kind: 'melee', fx: 'claw' },
      abilities: [PARASITE, SPAWN_HUMAN, XAB.coreFormSpawn, XAB.regen],
    },
  ),
  ...pair(
    'weaver',
    L('織網者', 'Weaver'),
    {
      hp: 1600,
      regen: 0.5,
      speed: 2.65,
      radius: 0.8,
      attack: { dmg: 85, cd: 1.5, range: 2.5, kind: 'projectile', fx: 'silk', projSpeed: 20 },
      abilities: [XAB.webwire, XAB.fountain, PARASITE, HUMAN],
    },
    {
      hp: 1300,
      regen: 0.5,
      speed: 2.5,
      radius: 0.7,
      attack: { dmg: 85, cd: 1.5, range: 2.5, kind: 'projectile', fx: 'silk', projSpeed: 20 },
      abilities: [XAB.webwire, PARASITE, SPAWN_HUMAN],
    },
  ),
  // ── T3：操控 ──
  ...pair(
    'voidwalker',
    L('虛空行者', 'Voidwalker'),
    {
      hp: 850,
      regen: 0.5,
      speed: 2.8,
      radius: 0.55,
      attack: { dmg: 65, cd: 1.5, range: 6, kind: 'projectile', fx: 'xenoOrb', projSpeed: 14 },
      abilities: [XAB.relocate, XAB.swap, PARASITE, HUMAN],
    },
    {
      hp: 850,
      regen: 0.75,
      speed: 2.6,
      radius: 0.5,
      attack: { dmg: 56, cd: 1.5, range: 6, kind: 'projectile', fx: 'xenoOrb', projSpeed: 14 },
      abilities: [XAB.relocate, PARASITE, SPAWN_HUMAN],
    },
  ),
  ...pair(
    'chronarch',
    L('時序者', 'Chronarch'),
    // 原作攻擊間隔為底層單位預設（2 秒）
    { hp: 850, regen: 0.5, speed: 2.75, radius: 0.55, attack: { dmg: 69, cd: 2, range: 6, kind: 'hitscan', fx: 'chrono' }, abilities: [XAB.revive, XAB.loop, PARASITE, HUMAN] },
    { hp: 750, regen: 0.5, speed: 2.6, radius: 0.5, attack: { dmg: 59, cd: 2, range: 6, kind: 'hitscan', fx: 'chrono' }, abilities: [PARASITE, SPAWN_HUMAN] },
  ),
  ...pair(
    'mimic',
    L('假面者', 'Mimic'),
    { hp: 700, regen: 0.75, speed: 2.85, radius: 0.45, attack: { dmg: 38, cd: 1, range: 1.4, kind: 'melee', fx: 'claw' }, abilities: [XAB.masks, XAB.mute, PARASITE, HUMAN] },
    { hp: 600, regen: 0.75, speed: 2.85, radius: 0.45, attack: { dmg: 24, cd: 1, range: 1.4, kind: 'melee', fx: 'claw' }, abilities: [XAB.masks, PARASITE, SPAWN_HUMAN] },
  ),
  // ── 輔助單位 ──
  {
    // 逆時招魂喚回的死者（之後由 convertToSpawn 換成目前的 spawn 型）
    id: XUNIT.timeZombie,
    name: L('時滯殭屍', 'Time-Lost Revenant'),
    model: 'xeno.timeZombie',
    hp: 400,
    hpRegen: 0,
    mp: 100,
    mpRegen: 0.8,
    speed: 2.1,
    radius: 0.45,
    sight: 12,
    attack: atk({ dmg: 79, cd: 2, range: 1.2, kind: 'melee', fx: 'claw' }),
    abilities: [XAB.frenzy],
    tags: ['mechanical', 'xenoForm'],
    inv: 6,
    corpse: true,
  },
  {
    // 沒有可喚回的死者時出現
    id: XUNIT.eldritch,
    name: L('遠古獸', 'Elder Beast'),
    model: 'xeno.eldritch',
    hp: 350,
    hpRegen: 2,
    mp: 0,
    mpRegen: 0,
    speed: 3.2,
    radius: 0.6,
    sight: 12,
    attack: atk({ dmg: 25, cd: 1, range: 1.6, kind: 'melee', fx: 'claw' }),
    abilities: [],
    tags: ['mechanical', 'creature', 'summon'],
    corpse: true,
  },
  {
    // 再生核死亡時脫出的核心：跑得快、不能攻擊，45 秒後長回原形
    id: XUNIT.core,
    name: L('裸核', 'Bare Kernel'),
    model: 'xeno.hydraCore',
    hp: 350,
    hpRegen: 2,
    mp: 100,
    mpRegen: 0.8,
    speed: 3.1,
    radius: 0.4,
    sight: 14,
    abilities: [XAB.regen],
    tags: ['mechanical', 'xenoForm'],
    inv: 6,
    corpse: true,
  },
  {
    id: XUNIT.spawnCore,
    name: L('子嗣裸核', 'Spawn Kernel'),
    model: 'xeno.hydraCore',
    hp: 300,
    hpRegen: 2,
    mp: 100,
    mpRegen: 0.8,
    speed: 3.1,
    radius: 0.4,
    sight: 14,
    abilities: [XAB.regen],
    tags: ['mechanical', 'xenoForm'],
    inv: 6,
    corpse: true,
  },
  {
    // 熵渦：區域物件，週期效果由 scripts/xeno.ts 驅動
    id: XUNIT.entropyField,
    name: L('熵渦', 'Entropic Maw'),
    model: 'xeno.entropyField',
    hp: 1,
    hpRegen: 0,
    mp: 0,
    mpRegen: 0,
    speed: 0,
    radius: 0.3,
    sight: 3,
    abilities: [],
    tags: ['noTarget', 'invuln'],
    corpse: false,
  },
  {
    // 絆絲的錨點：可以被打掉，兩個錨點之間拉線
    id: XUNIT.webAnchor,
    name: L('絲錨', 'Silk Anchor'),
    model: 'xeno.webAnchor',
    hp: 120,
    hpRegen: 0,
    mp: 0,
    mpRegen: 0,
    speed: 0,
    radius: 0.3,
    sight: 3,
    abilities: [],
    tags: ['mechanical', 'summon'],
    corpse: false,
  },
]

// ───────── Buff ─────────

export const XENO_BUFFS: BuffDef[] = [
  { id: XBF.entropy, name: L('熵渦拖曳', 'Entropic Drag'), icon: 'void', vis: 'all', good: false, dur: 0.8, move: 0.6, fx: 'entropy' },
  // flags.shake：client 對本人做畫面搖晃
  { id: XBF.neurotoxin, name: L('神經毒素', 'Neurovenom'), icon: 'syringe', vis: 'all', good: false, dur: 45, move: 0.8, fx: 'neurotoxin', flags: { shake: true } },
  { id: XBF.fluxSlow, name: L('時滯', 'Time-Slowed'), icon: 'frost', vis: 'all', good: false, dur: 30, move: 0.05, fx: 'flux' },
  { id: XBF.fluxStasis, name: L('時滯護罩', 'Stasis'), icon: 'clock', vis: 'all', good: true, dur: 35, invuln: true, fx: 'stasis' },
  // 以下三個只當幻象的 data.passives（不進快照）
  { id: XBF.echo, name: L('過去的殘影', 'Echo of the Past'), icon: 'clock', vis: 'casterFaction', good: false, dmgMult: 0.5, dmgTaken: 5 },
  { id: XBF.mirage30, name: L('疊影', 'Afterimage'), icon: 'cloak', vis: 'casterFaction', good: false, dmgMult: 0.3, dmgTaken: 2 },
  { id: XBF.mirage20, name: L('疊影', 'Afterimage'), icon: 'cloak', vis: 'casterFaction', good: false, dmgMult: 0.2, dmgTaken: 2 },
  // 只給本人看：避免變身時跟著帶過去、讓別人把人形與異形對起來
  { id: XBF.muted, name: L('噤聲', 'Hushed'), icon: 'roar', vis: 'self', good: false, dur: 60 },
  { id: XBF.blackness, name: L('墨瞳', 'Inkblind'), icon: 'eye', vis: 'all', good: false, dur: 6, sightMult: 0.08, fx: 'blackness' },
  { id: XBF.petrified, name: L('石化', 'Petrified'), icon: 'rock', vis: 'all', good: false, stun: true, invuln: true, fx: 'petrify' },
  { id: XBF.tripped, name: L('絆倒', 'Tripped'), icon: 'web', vis: 'all', good: false, dur: 1.5, stun: true, fx: 'tripped' },
  { id: XBF.webbed, name: L('黏絲', 'Webbed'), icon: 'web', vis: 'all', good: false, dur: 2.5, rooted: true, fx: 'web' },
  { id: XBF.frenzy, name: L('嗜血', 'Bloodlust'), icon: 'speed', vis: 'all', good: true, dur: 2, move: 2.2 },
]

// ───────── 技能 ─────────

const explosion = (id: string, cd: number, mana: number, note: Loc): AbilityDef => ({
  id,
  name: L('遠爆種', 'Seeded Blast'),
  desc: L(
    `在遠處埋下一顆熾熱的種子，3 秒後爆開，威力等同熱融炸彈：核心 2.5 公尺內幾乎必死，5.5 公尺內也會被灼傷，但不會炸出瓦礫。${note.zh}`,
    `Plant a white-hot seed at range; 3 s later it bursts with the force of a fusion charge — near-certain death within 2.5 m, burns out to 5.5 m — but leaves no rubble.${note.en}`,
  ),
  icon: 'bomb',
  target: 'point',
  range: 12,
  aoe: 5.5,
  cd,
  mana,
  effects: [
    { k: 'fx', fx: 'xenoBombMark', at: 'point' },
    {
      k: 'delay',
      t: 3,
      then: [
        // 與熱融炸彈相同：2.5 m 內 5000＋5.5 m 內 200（傷害種類也與炸彈一致）
        { k: 'damage', amount: 5000, to: 'point', aoe: 2.5, kind: 'fire' },
        { k: 'damage', amount: 200, to: 'point', aoe: 5.5, kind: 'fire' },
        { k: 'fx', fx: 'fusion', at: 'point' },
      ],
    },
  ],
})

const manifold = (id: string, n: number, pct: number, cd: number, mana: number): AbilityDef => ({
  id,
  name: L('疊影', 'Afterimage'),
  desc: L(
    `分裂出 ${n} 個與你一模一樣的殘影，存在 10 分鐘並跟著你出手。殘影只有 ${pct}% 傷害、受到的傷害加倍；分裂的瞬間你可能和殘影對調位置。`,
    `Split off ${n} afterimage${n > 1 ? 's' : ''} identical to you for 10 min; they follow your lead. Each deals ${pct}% damage and takes double; at the moment of splitting you may trade places with one.`,
  ),
  icon: 'cloak',
  target: 'none',
  cd,
  mana,
  effects: [{ k: 'script', fn: 'xeno.manifold', p: { n, pct, life: 600 } }],
})

const coreForm = (id: string, hp: number): AbilityDef => ({
  id,
  name: L('核心蛻生', 'Core Molt'),
  desc: L(
    `被動：致命一擊會讓血肉整片剝落，只剩一顆 ${hp} 生命、跑得飛快卻不能攻擊的核心。撐過 45 秒，核心會重新長回原本的身體；核心再被打碎才是真正的死亡。`,
    `Passive: a killing blow sloughs off your flesh, leaving a swift ${hp}-health core that cannot attack. Survive 45 s and it regrows your body; only shattering the core truly kills you.`,
  ),
  icon: 'core',
  target: 'passive',
  cd: 0,
  mana: 0,
  effects: [],
})

export const XENO_ABILITIES: AbilityDef[] = [
  // ── 熵光體 ──
  {
    id: XAB.entropy,
    name: L('熵渦', 'Entropic Maw'),
    desc: L(
      '花 2 秒在目標處撕開一道 3 公尺的熵渦，持續 30 秒。待在裡面的人會被慢慢灼傷、減速、吸走能量（一半回流給你），還會被一點一點拖向中心——被拖得越久，牽引越弱。異形形態不受影響。',
      'After 2 s, tear open a 3 m entropic maw that lasts 30 s. Anyone inside is slowly seared, slowed and drained of energy (half flows back to you), and dragged toward the center — the longer they are held, the weaker the pull. Alien forms are unaffected.',
    ),
    icon: 'void',
    target: 'point',
    range: 8,
    aoe: 3,
    cast: 2,
    cd: 20,
    mana: 100,
    effects: [{ k: 'script', fn: 'xeno.entropy', p: { r: 3, life: 30 } }],
  },
  {
    id: XAB.deflect,
    name: L('能量偏折', 'Flux Veil'),
    desc: L(
      '被動：受到的傷害先由能量承受，每 1 點能量抵銷 2 點傷害。能量見底時，這層光膜也就散了。',
      'Passive: incoming damage is paid from your energy first, 2 damage per point. When the energy runs dry, so does the veil.',
    ),
    icon: 'shield',
    target: 'passive',
    cd: 0,
    mana: 0,
    effects: [],
  },
  // ── 蠻甲獸 ──
  {
    id: XAB.tentacles,
    name: L('竊觸', 'Pilfering Tendrils'),
    desc: L(
      '把觸鬚探進目標的背包，隨機摸一格：那格有東西就歸你，摸到空格就什麼也沒拿到。',
      'Slip a tendril into the target’s pack and grab one random slot. If something is there, it is yours; an empty slot yields nothing.',
    ),
    icon: 'tentacle',
    target: 'unit',
    range: 1.4,
    cast: 0.5,
    cd: 10,
    mana: 50,
    filter: { noStructure: true },
    effects: [{ k: 'script', fn: 'xeno.steal' }],
  },
  {
    id: XAB.neurotoxin,
    name: L('神經毒涎', 'Neurovenom'),
    desc: L(
      '被動：普攻帶毒，目標 45 秒內移動慢 20%，眼前天旋地轉。仿生人機體與抗毒者不受影響。',
      'Passive: your strikes carry venom — the target moves 20% slower and their world reels for 45 s. Android chassis and toxin-immune units shrug it off.',
    ),
    icon: 'syringe',
    target: 'passive',
    cd: 0,
    mana: 0,
    effects: [],
  },
  // ── 牽絲者 ──
  {
    id: XAB.flux,
    name: L('時滯牢籠', 'Stasis Eddy'),
    desc: L(
      '把一名人類封進時間的漩渦：身上的狀態全被沖掉，30 秒內幾乎寸步難行，但 35 秒內刀槍不入。漩渦還會吐出他過去的殘影替你作戰（傷害減半、一碰就碎）。',
      'Seal a human in an eddy of time: their effects are washed away, they can barely move for 30 s, but nothing can hurt them for 35 s. The eddy also spits out an echo of their past that fights for you (half damage, shatters at a touch).',
    ),
    icon: 'frost',
    target: 'unit',
    range: 1.5,
    cast: 1,
    cd: 180,
    mana: 50,
    sharedCd: 'cd.xeno.flux',
    filter: { tag: 'personnel' },
    effects: [{ k: 'script', fn: 'xeno.flux' }],
  },
  {
    id: XAB.mute,
    name: L('噤聲', 'Hush'),
    desc: L(
      '扯斷一名玩家的聲音 60 秒：這段時間他說的每句話都不具名，沒有人知道是誰在講。',
      'Tear away a player’s voice for 60 s: everything they say arrives nameless, and no one can tell who is speaking.',
    ),
    icon: 'roar',
    target: 'unit',
    range: 6,
    cd: 60,
    mana: 25,
    filter: { mainUnit: true },
    effects: [{ k: 'script', fn: 'xeno.mute', p: { dur: 60 } }],
  },
  // ── 爆燃者 ──
  explosion(XAB.explosion, 4, 45, L('', '')),
  explosion(XAB.explosionSpawn, 5, 65, L('（子嗣的種子較耗能。）', ' (A spawn’s seed costs more energy.)')),
  {
    id: XAB.lordOfFlames,
    name: L('焰主', 'Furnace Heart'),
    desc: L(
      '被動：你本身就是火焰的一部分。火焰與爆炸傷不了你——熱融炸彈與遠爆種都一樣。',
      'Passive: you are part of the fire. Flames and blasts — fusion charges and seeded blasts alike — cannot hurt you.',
    ),
    icon: 'fire',
    target: 'passive',
    cd: 0,
    mana: 0,
    effects: [],
  },
  // ── 雷殛者 ──
  {
    id: XAB.strike,
    name: L('天殛', 'Skyfall Arc'),
    desc: L(
      '標記一點，1.2 秒後一道重雷劈下，半徑 3 公尺內每個非異形陣營的單位受到 500 點傷害。',
      'Mark a spot; 1.2 s later a heavy bolt crashes down, dealing 500 damage to every non-alien unit within 3 m.',
    ),
    icon: 'bolt',
    target: 'point',
    range: 12,
    aoe: 3,
    cd: 15,
    mana: 30,
    effects: [
      { k: 'fx', fx: 'lightningMark', at: 'point' },
      {
        k: 'delay',
        t: 1.2,
        then: [
          { k: 'fx', fx: 'lightning', at: 'point' },
          { k: 'script', fn: 'xeno.lightning', p: { r: 3, dmg: 500 } },
        ],
      },
    ],
  },
  {
    id: XAB.disrupt,
    name: L('磁暴封鎖', 'Lockstorm'),
    desc: L(
      '花 4 秒釋放電磁脈衝，鎖死你所在這座站的每一扇門 15–30 秒。鎖擋不住你——你可以直接穿過去。',
      'Spend 4 s releasing a pulse that jams every door in your station for 15–30 s. The locks do not stop you — you walk straight through.',
    ),
    icon: 'door',
    target: 'none',
    cast: 4,
    cd: 60,
    mana: 100,
    effects: [
      { k: 'fx', fx: 'emp', at: 'self' },
      { k: 'script', fn: 'xeno.lockdown', p: { min: 15, max: 30 } },
    ],
  },
  // ── 幻影者 ──
  {
    id: XAB.blackness,
    name: L('墨瞳', 'Inkblind'),
    desc: L(
      '用 2 秒把墨色灌進目標眼裡，接下來 6 秒他幾乎看不到伸手以外的東西。',
      'Over 2 s, pour ink into the target’s eyes; for the next 6 s they can barely see past arm’s reach.',
    ),
    icon: 'eye',
    target: 'unit',
    range: 3,
    cast: 2,
    cd: 10,
    mana: 30,
    filter: { noStructure: true },
    effects: [
      { k: 'buff', buff: XBF.blackness, to: 'target' },
      { k: 'fx', fx: 'blackness', at: 'target' },
    ],
  },
  manifold(XAB.manifold, 1, 30, 50, 40),
  manifold(XAB.manifoldSpawn, 3, 20, 25, 100),
  // ── 石瞳蛇 ──
  {
    id: XAB.petrify,
    name: L('石瞳', 'Stonegaze'),
    desc: L(
      '凝視目標 3 秒，把他變成石像：不能動、也不會受傷。被石化的玩家視同倒下，直到有人類走到他身邊 1 公尺內把他喚醒。',
      'Stare at a target for 3 s to turn them to stone — frozen and untouchable. A petrified player counts as fallen until a human walks within 1 m to wake them.',
    ),
    icon: 'rock',
    target: 'unit',
    range: 1.4,
    cast: 3,
    cd: 20,
    mana: 70,
    sharedCd: 'cd.xeno.petrify',
    filter: { noStructure: true },
    effects: [{ k: 'script', fn: 'xeno.petrify' }],
  },
  // ── 再生核 ──
  {
    id: XAB.swarmbolt,
    name: L('群蜂電', 'Hive Volt'),
    desc: L(
      '對目標放出一團生化電流，再分岔到他周圍 3.5 公尺內的單位，最多 16 個，每個 80 點傷害。電流不在乎誰是誰的同伴。',
      'Loose a biochemical current at a target that forks into units within 3.5 m — up to 16 of them, 80 damage each. The current does not care whose side anyone is on.',
    ),
    icon: 'beam',
    target: 'unit',
    range: 6,
    aoe: 3.5,
    cd: 8,
    mana: 30,
    filter: { noStructure: true },
    effects: [{ k: 'script', fn: 'xeno.swarmbolt', p: { dmg: 80, n: 16, r: 3.5 } }],
  },
  coreForm(XAB.coreForm, 350),
  coreForm(XAB.coreFormSpawn, 300),
  {
    id: XAB.regen,
    name: L('血肉重組', 'Fleshweave'),
    desc: L(
      '被動：你的組織無時無刻都在重新編織，生命回復速度遠超其他形態。',
      'Passive: your tissue reweaves itself constantly; you regenerate far faster than any other form.',
    ),
    icon: 'heal',
    target: 'passive',
    cd: 0,
    mana: 0,
    effects: [],
  },
  // ── 織網者 ──
  {
    id: XAB.webwire,
    name: L('絆絲', 'Tripline'),
    desc: L(
      '在身邊放下一個絲錨；9 公尺內再放第二個，兩者之間就會拉起絆線。非異形形態的單位跨過時會被絆倒 1.5 秒並受到 40 點傷害。絲錨可以被打掉，3 分鐘後自行崩解。',
      'Set a silk anchor beside you; set a second within 9 m and a tripline stretches between them. Any non-alien unit crossing it is knocked down for 1.5 s and takes 40 damage. Anchors can be destroyed and unravel after 3 min.',
    ),
    icon: 'web',
    target: 'point',
    range: 1.2,
    cd: 1,
    mana: 25,
    effects: [{ k: 'script', fn: 'xeno.webwire', p: { max: 9, life: 180 } }],
  },
  {
    id: XAB.fountain,
    name: L('亂絲噴泉', 'Silk Geyser'),
    desc: L(
      '讓目標區域的地面噴出四波黏絲，每團落點周圍的單位受到 75 點傷害並被黏住 2.5 秒。不分敵我！',
      'Make the ground at a spot erupt in four waves of sticky silk; each glob deals 75 damage and pins nearby units for 2.5 s. Friend or foe!',
    ),
    icon: 'storm',
    target: 'point',
    range: 9,
    aoe: 3,
    cast: 1,
    cd: 20,
    mana: 35,
    effects: [{ k: 'script', fn: 'xeno.fountain', p: { waves: 4, per: 2, r: 3, dmg: 75 } }],
  },
  // ── 虛空行者 ──
  {
    id: XAB.relocate,
    name: L('虛空放逐', 'Void Drift'),
    desc: L(
      '花 4 秒把自己拋進虛空，出現在太空中某座站附近的隨機位置；在太空時再用一次，會隨機落進某座站裡。太空中若沒有站可去，就只在本站內隨機跳躍。',
      'Spend 4 s casting yourself into the void, emerging at a random spot near a station in space; use it again out there to drop into a random station. With no station to drift to, you merely leap to a random spot in your own.',
    ),
    icon: 'star',
    target: 'none',
    cast: 4,
    cd: 60,
    mana: 0,
    effects: [{ k: 'script', fn: 'xeno.relocate' }],
  },
  {
    id: XAB.swap,
    name: L('位相置換', 'Phase Exchange'),
    desc: L(
      '花 3 秒與任何看得見的單位互換位置，不論距離、不論在哪座站。（太空與站內之間只能單向跳到對方身邊。）',
      'Spend 3 s trading places with any unit you can see, at any distance, in any station. (Between space and an interior you can only leap to their side.)',
    ),
    icon: 'teleport',
    target: 'unit',
    range: 999,
    cast: 3,
    cd: 20,
    mana: 50,
    filter: { anyZone: true, noStructure: true },
    effects: [{ k: 'script', fn: 'xeno.swap' }],
  },
  // ── 時序者 ──
  {
    id: XAB.revive,
    name: L('逆時招魂', 'Undo Death'),
    desc: L(
      '花 4 秒把一名死去的玩家從他斷氣前的那一刻拉回來，成為你的 spawn；屍體就在身旁 3.5 公尺內的優先。變種人一方與仿生人喚不回來。若沒有可喚回的死者，回應你的會是一頭遠古獸。',
      'Spend 4 s dragging a dead player back from the instant before their last breath to serve as your spawn; those whose corpse lies within 3.5 m come first. Mutants and androids cannot be recalled. With no one to recall, an elder beast answers instead.',
    ),
    icon: 'skull',
    target: 'none',
    cast: 4,
    cd: 120,
    mana: 70,
    effects: [{ k: 'script', fn: 'xeno.backFromHell' }],
  },
  {
    id: XAB.loop,
    name: L('十秒迴圈', 'Ten-Second Loop'),
    desc: L(
      '把自己的時間倒帶 10 秒：位置、生命、能量與背包都回到當時（能量再扣 25）。那時帶著、現在卻不在身上的道具會被複製回來——但有些東西拒絕被複製。',
      'Rewind your own timeline 10 s: position, health, energy and pack return to that moment (minus 25 energy). Items you held then but not now are copied back — though some things refuse to be copied.',
    ),
    icon: 'clock',
    target: 'none',
    cd: 40,
    mana: 0,
    effects: [{ k: 'script', fn: 'xeno.loop', p: { back: 10, cost: 25 } }],
  },
  // ── 假面者 ──
  {
    id: XAB.masks,
    name: L('千面', 'Thousand Faces'),
    desc: L(
      '花 0.5 秒化身成另一名玩家：外貌、名字、顏色、職業都一模一樣，連生命比例也跟著他。用「卸面」恢復原形時，生命比例取兩種樣子的平均。化身成非人類的樣子最多只能維持 30 秒。',
      'In 0.5 s, become another player — look, name, color, profession, even their health ratio. Drop the Face to return; your health ratio becomes the average of both shapes. A non-human shape can be held for 30 s at most.',
    ),
    icon: 'mask',
    target: 'unit',
    range: 8,
    cast: 0.5,
    cd: 60,
    mana: 0,
    sharedCd: 'cd.xeno.masks',
    filter: { mainUnit: true },
    effects: [{ k: 'script', fn: 'xeno.masks', p: { limit: 30 } }],
  },
  {
    id: XAB.unmask,
    name: L('卸面', 'Drop the Face'),
    desc: L('結束千面，恢復原本的樣子。', 'End Thousand Faces and return to your own shape.'),
    icon: 'human',
    target: 'none',
    cd: 0,
    mana: 0,
    effects: [{ k: 'script', fn: 'xeno.unmask' }],
  },
  // ── 時滯殭屍 ──
  {
    id: XAB.frenzy,
    name: L('嗜血狂奔', 'Blood Sprint'),
    desc: L('對鮮血的渴望讓你在 2 秒內速度暴增。', 'Bloodlust more than doubles your speed for 2 s.'),
    icon: 'speed',
    target: 'self',
    cd: 21,
    mana: 10,
    effects: [{ k: 'buff', buff: XBF.frenzy, to: 'self' }],
  },
]

regUnits(XENO_UNITS)
regBuffs(XENO_BUFFS)
regAbilities(XENO_ABILITIES)
