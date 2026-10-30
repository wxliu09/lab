// 職業技能與被動（GDD §4.2；研究 02 §2.2）。實際效果中需要 script 的部分在 src/sim/scripts/items.ts。
// 博士專長的 buff（cls.phd.*）由身分系統在 roleAbilities.ts 註冊，這裡不重複。
import { regAbilities, regBuffs } from './registry'
import type { AbilityDef, BuffDef, Loc } from './types'

const L = (zh: string, en: string): Loc => ({ zh, en })

/** 駭門：鎖門秒數與作用半徑 */
export const DOOR_HACK_SECONDS = 15
export const DOOR_REACH = 2.56

export const CLASS_ABILITIES: AbilityDef[] = [
  {
    id: 'cls.mend',
    name: L('治療術', 'Mend'),
    desc: L(
      '接骨、止血、縫合，每次替目標回復 6 生命。右鍵切換自動施放：閒著時會自己找附近最需要的人治療。',
      'Set bones, stop bleeding, stitch wounds — restores 6 health per use. Right-click to toggle autocast and you will tend the most hurt person nearby whenever idle.',
    ),
    icon: 'heal',
    target: 'unit',
    range: 4.5,
    cd: 0.2,
    mana: 2,
    autocast: true,
    filter: { tag: 'personnel' },
    effects: [{ k: 'heal', amount: 6, to: 'target' }],
  },
  {
    id: 'cls.rummage',
    name: L('翻找', 'Rummage'),
    desc: L(
      '把一個雜物箱翻個底朝天（箱子會報銷）。運氣好的話，能挖出你以前藏起來的好東西。',
      'Turn a supply crate inside out (the crate does not survive). With luck you will dig up something you stashed there long ago.',
    ),
    icon: 'gear',
    target: 'unit',
    range: 1,
    cd: 10,
    mana: 50,
    filter: { defs: ['struct.rummage'] },
    effects: [{ k: 'script', fn: 'cls.rummage' }],
  },
  {
    id: 'cls.doorHack',
    name: L('駭門', 'Door Hack'),
    desc: L(
      '花 1.3 秒接上門的維修埠，把身邊 2.5 m 內沒上鎖的門全部鎖死 15 秒。站上的系統會在時間到時自動解鎖。',
      'Spend 1.3 s on the maintenance port and lock every unlocked door within 2.5 m for 15 s. The station resets them automatically afterward.',
    ),
    icon: 'door',
    target: 'none',
    cast: 1.3,
    cd: 12,
    mana: 50,
    effects: [{ k: 'script', fn: 'cls.doorHack' }],
  },
]
regAbilities(CLASS_ABILITIES)

/** 職業被動（ClassDef.passives 引用的 buff）*/
export const CLASS_PASSIVES: BuffDef[] = [
  { id: 'cls.researcherAura', name: L('研究員', 'Researcher'), icon: 'star', vis: 'self', good: true, mpRegen: 0.75 },
  { id: 'cls.securityRange', name: L('射擊專家', 'Marksman'), icon: 'gun', vis: 'self', good: true, rangeAdd: 1.25 },
  { id: 'cls.veteran', name: L('老兵', 'Veteran'), icon: 'star', vis: 'self', good: true, dmgMult: 1.15 },
  // 駕駛的船艦／太空站攻速 +15%：由太空系統讀 flags.shipAtkSpeed
  { id: 'cls.ace', name: L('王牌', 'Ace'), icon: 'ship', vis: 'self', good: true, flags: { shipAtkSpeed: 1.15 } },
]
regBuffs(CLASS_PASSIVES)
