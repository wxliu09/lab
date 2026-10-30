// 人類職業（GDD §4.2；12 張職業卡不放回抽）
import { regClasses } from './registry'
import type { ClassDef, Loc } from './types'

const L = (zh: string, en: string): Loc => ({ zh, en })
const bio = (id: string) => ({
  human: L(`bio.${id}.human`, `bio.${id}.human`),
  xeno: L(`bio.${id}.xeno`, `bio.${id}.xeno`),
  mutant: L(`bio.${id}.mutant`, `bio.${id}.mutant`),
  android: L(`bio.${id}.android`, `bio.${id}.android`),
})

export const CLASS_LIST: ClassDef[] = [
  {
    id: 'researcher',
    name: L('研究員', 'Researcher'),
    prefix: L('Dr. ', 'Dr. '),
    cards: 2,
    items: ['phaseCloak', 'traumaKit'],
    abilities: [],
    passives: ['cls.researcherAura'],
    desc: L('帶著相位斗篷與急救包；隨機獲得一項博士專長。', 'Carries a phase cloak and trauma kit; gains a random doctorate specialty.'),
    bios: bio('researcher'),
  },
  {
    id: 'security',
    name: L('保全', 'Security'),
    prefix: L('Private ', 'Private '),
    cards: 2,
    items: [],
    abilities: [],
    passives: ['cls.securityRange'],
    desc: L('開局配發一套戰鬥裝（電漿／火箭／特斯拉／冷凍隨機），攻擊射程增加。', 'Issued a random combat rig; extended weapon range.'),
    bios: bio('security'),
  },
  {
    id: 'medic',
    name: L('醫護兵', 'Medic'),
    prefix: L('Medic ', 'Medic '),
    cards: 1,
    items: ['criticalCare', 'traumaKit', 'geneSampler'],
    abilities: ['cls.mend'],
    passives: [],
    desc: L('能自動治療附近傷患，開局就持有基因檢測器。', 'Auto-heals nearby wounded and starts with a gene sampler.'),
    bios: bio('medic'),
  },
  {
    id: 'captain',
    name: L('艦長', 'Captain'),
    prefix: L('Captain ', 'Captain '),
    cards: 1,
    items: ['captainCard'],
    abilities: [],
    passives: [],
    spawnAt: 'bravado',
    desc: L('持有艦長 ID 卡，能鎖上或打開豪勇號的保全門。', 'Holds the captain keycard that locks and unlocks Bravado security doors.'),
    bios: bio('captain'),
  },
  {
    id: 'janitor',
    name: L('清潔工', 'Janitor'),
    prefix: L('Janitor ', 'Janitor '),
    cards: 1,
    items: ['janitorCard'],
    abilities: ['cls.rummage'],
    passives: [],
    desc: L('能翻找雜物箱，持有通往清潔間的 ID 卡。', 'Rummages supply crates and holds the closet keycard.'),
    bios: bio('janitor'),
  },
  {
    id: 'ceo',
    name: L('執行長', 'CEO'),
    prefix: L('CEO ', 'CEO '),
    cards: 1,
    items: [],
    abilities: [],
    passives: [],
    desc: L('由一台無敵的機器管家隨侍在側，管家有 3 格背包。', 'Attended by an invulnerable robo-butler with three item slots.'),
    bios: bio('ceo'),
  },
  {
    id: 'commissar',
    name: L('政委', 'Commissar'),
    prefix: L('Commissar ', 'Commissar '),
    cards: 1,
    items: ['verdictPistol'],
    abilities: [],
    passives: [],
    desc: L('配有處決手槍：瞄準 1.5 秒，造成 125 傷害。', 'Carries the verdict pistol: 1.5 s aim, 125 damage.'),
    bios: bio('commissar'),
  },
  {
    id: 'engineer',
    name: L('工程師', 'Engineer'),
    prefix: L('Engineer ', 'Engineer '),
    cards: 1,
    items: ['suit.service', 'wrench'],
    abilities: ['cls.doorHack'],
    passives: [],
    spawnAt: 'caldera',
    desc: L('穿著服務裝，能駭入附近的門將其鎖住 15 秒。', 'Wears a service rig and can hack nearby doors shut for 15 s.'),
    bios: bio('engineer'),
  },
  {
    id: 'corporal',
    name: L('下士', 'Corporal'),
    prefix: L('Corporal ', 'Corporal '),
    cards: 1,
    items: ['servoGreaves'],
    abilities: [],
    passives: ['cls.veteran'],
    desc: L('老兵：攻擊力 +15%，開局穿著強化護腿。', 'Veteran: +15% damage, starts with servo greaves.'),
    bios: bio('corporal'),
  },
  {
    id: 'ace',
    name: L('王牌飛行員', 'Ace'),
    prefix: L('Ace ', 'Ace '),
    cards: 1,
    items: [],
    abilities: [],
    passives: ['cls.ace'],
    spawnAt: 'hangar',
    desc: L('駕駛的船艦攻速 +15%，擁有專屬的槍騎級戰機。', 'Piloted vessels fire 15% faster; owns the Lancer fighter.'),
    bios: bio('ace'),
  },
]

regClasses(CLASS_LIST)

/** 研究員博士專長（本作四項均等）*/
export const PHDS = ['optics', 'gravitics', 'biology', 'electronics'] as const
export const SECURITY_SUITS = ['suit.plasma', 'suit.rocket', 'suit.tesla', 'suit.cryo'] as const
