// 異形／變種人／仿生人的形態與進化樹（研究 02 §3.5–3.6、§4.1–4.3、§5.5；內容總表「異類進化樹」）
// 單位 def 與技能由 forms/xeno.ts、forms/mutant.ts、forms/android.ts 註冊。
import { regForms } from './registry'
import type { FormDef, Loc } from './types'

const L = (zh: string, en: string): Loc => ({ zh, en })

export const XENO_T2_EP = 660
export const XENO_T3_EP = 1370
export const MUTANT_EP = [300, 900, 1800] as const
export const ANDROID_EP = 2000

export const FORM_LIST: FormDef[] = [
  // ───── 異形 ─────
  { id: 'xeno.protoform', faction: 'xeno', tier: 1, unit: 'xeno.protoform', spawnUnit: 'xeno.protoform.spawn', ep: 0, desc: L('精瘦的四足掠食者，能下蛋、寄生。', 'A lean quadruped predator that lays eggs and implants parasites.') },
  { id: 'xeno.lumen', faction: 'xeno', tier: 2, unit: 'xeno.lumen', spawnUnit: 'xeno.lumen.spawn', from: 'xeno.protoform', ep: XENO_T2_EP, branch: 'energy', desc: L('能量型：半透明的發光體，偏轉攻擊並抽乾周圍能量。', 'Energy: a translucent glow that deflects shots and drains energy.') },
  { id: 'xeno.brute', faction: 'xeno', tier: 2, unit: 'xeno.brute', spawnUnit: 'xeno.brute.spawn', from: 'xeno.protoform', ep: XENO_T2_EP, branch: 'power', desc: L('力量型：厚甲衝撞者，偷取道具、神經毒素。', 'Power: an armored rammer that steals items and injects neurotoxin.') },
  { id: 'xeno.puppeteer', faction: 'xeno', tier: 2, unit: 'xeno.puppeteer', spawnUnit: 'xeno.puppeteer.spawn', from: 'xeno.protoform', ep: XENO_T2_EP, branch: 'manip', desc: L('操控型：優雅的漂浮者，扭曲時間、讓人失聲。', 'Manipulation: a drifting puppeteer that warps time and silences voices.') },
  { id: 'xeno.pyreheart', faction: 'xeno', tier: 3, unit: 'xeno.pyreheart', spawnUnit: 'xeno.pyreheart.spawn', from: 'xeno.lumen', ep: XENO_T3_EP, branch: 'energy', desc: L('背負熔爐的爆燃者，投射爆炸、免疫火焰。', 'Carries a furnace on its back; projects blasts and ignores fire.') },
  { id: 'xeno.arcflayer', faction: 'xeno', tier: 3, unit: 'xeno.arcflayer', spawnUnit: 'xeno.arcflayer.spawn', from: 'xeno.lumen', ep: XENO_T3_EP, branch: 'energy', desc: L('電弧尖刺的雷殛者，落雷與封鎖全站門禁。', 'An arc-spined flayer; calls lightning and seals every door.') },
  { id: 'xeno.phantasm', faction: 'xeno', tier: 3, unit: 'xeno.phantasm', spawnUnit: 'xeno.phantasm.spawn', from: 'xeno.lumen', ep: XENO_T3_EP, branch: 'energy', desc: L('殘影纏身的幻影者，致盲與分身。', 'Trailed by afterimages; blinds foes and splits into copies.') },
  { id: 'xeno.gorgon', faction: 'xeno', tier: 3, unit: 'xeno.gorgon', spawnUnit: 'xeno.gorgon.spawn', from: 'xeno.brute', ep: XENO_T3_EP, branch: 'power', desc: L('長蛇身的石瞳蛇，目光讓人石化。', 'A long serpent whose gaze turns flesh to stone.') },
  { id: 'xeno.hydra', faction: 'xeno', tier: 3, unit: 'xeno.hydra', spawnUnit: 'xeno.hydra.spawn', from: 'xeno.brute', ep: XENO_T3_EP, branch: 'power', desc: L('外露核心的再生核，被擊倒後會從核心重生。', 'An exposed core that regrows its body when struck down.') },
  { id: 'xeno.weaver', faction: 'xeno', tier: 3, unit: 'xeno.weaver', spawnUnit: 'xeno.weaver.spawn', from: 'xeno.brute', ep: XENO_T3_EP, branch: 'power', desc: L('多肢的織網者，在走廊拉起絆網。', 'A many-limbed weaver that strings tripwires across corridors.') },
  { id: 'xeno.chronarch', faction: 'xeno', tier: 3, unit: 'xeno.chronarch', spawnUnit: 'xeno.chronarch.spawn', from: 'xeno.puppeteer', ep: XENO_T3_EP, branch: 'manip', desc: L('時鐘骨環的時序者，回溯十秒、喚醒死者。', 'Ringed with clockwork bone; rewinds ten seconds and wakes the dead.') },
  { id: 'xeno.voidwalker', faction: 'xeno', tier: 3, unit: 'xeno.voidwalker', spawnUnit: 'xeno.voidwalker.spawn', from: 'xeno.puppeteer', ep: XENO_T3_EP, branch: 'manip', desc: L('扭曲空間的虛空行者，與任何目標互換位置。', 'Bends space; swaps places with any target.') },
  { id: 'xeno.mimic', faction: 'xeno', tier: 3, unit: 'xeno.mimic', spawnUnit: 'xeno.mimic.spawn', from: 'xeno.puppeteer', ep: XENO_T3_EP, branch: 'manip', desc: L('不定形的假面者，完全化身為他人。', 'A shapeless mimic that becomes someone else entirely.') },
  // ───── 變種人 ─────
  { id: 'mut.apex', faction: 'mutant', tier: 1, unit: 'mut.apex', ep: MUTANT_EP[0], branch: 'perfect', desc: L('完美路線：純粹的人形掠食者，吞食屍體成長。', 'Perfection: a pure humanoid predator that feeds on the dead.') },
  { id: 'mut.sporemother', faction: 'mutant', tier: 1, unit: 'mut.sporemother', spawnUnit: 'mut.sporemother.spawn', ep: MUTANT_EP[0], branch: 'infect', desc: L('感染路線：散播朊毒，把人變成無心的工蟲。', 'Infection: spreads prions that turn people into mindless drones.') },
  { id: 'mut.blitz', faction: 'mutant', tier: 2, unit: 'mut.blitz', from: 'mut.apex', ep: MUTANT_EP[1], branch: 'perfect', desc: L('迅影：極速獵殺者，眨眼間貼到你身邊。', 'Blitz: a sprinting killer that closes distance in a blink.') },
  { id: 'mut.brawn', faction: 'mutant', tier: 2, unit: 'mut.brawn', from: 'mut.apex', ep: MUTANT_EP[1], branch: 'perfect', desc: L('蠻力：拆門砸牆的肉塊，召喚肉芽。', 'Brawn: a door-smashing hulk that sheds fleshy minions.') },
  { id: 'mut.mimetic', faction: 'mutant', tier: 2, unit: 'mut.mimetic', spawnUnit: 'mut.mimetic.spawn', from: 'mut.sporemother', ep: MUTANT_EP[1], branch: 'infect', desc: L('擬人株：污染販賣機，讓補給變成毒藥。', 'Mimetic Strain: taints vendors so supplies become poison.') },
  { id: 'mut.spinner', faction: 'mutant', tier: 2, unit: 'mut.spinner', spawnUnit: 'mut.spinner.spawn', from: 'mut.sporemother', ep: MUTANT_EP[1], branch: 'infect', desc: L('蛛母：產下小蛛群，吸收牠們回復生命。', 'Spinner: births spiderlings and reabsorbs them to heal.') },
  { id: 'mut.lurker', faction: 'mutant', tier: 3, unit: 'mut.lurker', from: 'mut.blitz', ep: MUTANT_EP[2], branch: 'perfect', desc: L('潛伏者：隱形潛行，超遠距離狙殺。', 'Lurker: stalks unseen and kills from extreme range.') },
  { id: 'mut.carcinid', faction: 'mutant', tier: 3, unit: 'mut.carcinid', from: 'mut.blitz', ep: MUTANT_EP[2], branch: 'perfect', desc: L('甲蟹：以能量瞬移的重砲甲殼，攻擊會孵出孢子。', 'Carcinid: an armored siege crab that teleports on energy and spits sporelings.') },
  { id: 'mut.colossus', faction: 'mutant', tier: 3, unit: 'mut.colossus', from: 'mut.brawn', ep: MUTANT_EP[2], branch: 'perfect', desc: L('血肉巨像：六千生命的巨物，落石封路。', 'Flesh Colossus: a six-thousand-health titan that drops rocks to seal halls.') },
  { id: 'mut.taurus', faction: 'mutant', tier: 3, unit: 'mut.taurus', from: 'mut.brawn', ep: MUTANT_EP[2], branch: 'perfect', desc: L('牛頭蠻：衝鋒撞飛一切，震波連綿。', 'Taurus: charges through everything and leaves rolling quakes.') },
  { id: 'mut.plagueQueen', faction: 'mutant', tier: 3, unit: 'mut.plagueQueen', spawnUnit: 'mut.plagueQueen.spawn', from: 'mut.mimetic', ep: MUTANT_EP[2], branch: 'infect', desc: L('瘟后：一次感染全星區的人類。', 'Plague Queen: infects every human in the sector at once.') },
  { id: 'mut.broodmother', faction: 'mutant', tier: 3, unit: 'mut.broodmother', spawnUnit: 'mut.broodmother.spawn', from: 'mut.mimetic', ep: MUTANT_EP[2], branch: 'infect', desc: L('繁巢：帶原體四處散播，連異形都能轉化。', 'Broodmother: plants carriers everywhere and can convert even aliens.') },
  { id: 'mut.hiveship', faction: 'mutant', tier: 3, unit: 'mut.hiveship', spawnUnit: 'mut.hiveship.spawn', from: 'mut.spinner', ep: MUTANT_EP[2], branch: 'infect', desc: L('巢艦（太空）：化身為一座活的太空站。', 'Hiveship (space): becomes a living space station.') },
  { id: 'mut.hiveground', faction: 'mutant', tier: 3, unit: 'mut.hiveground', spawnUnit: 'mut.hiveground.spawn', from: 'mut.spinner', ep: MUTANT_EP[2], branch: 'infect', desc: L('巢艦（地面）：生根的巢母，孕育軍團。', 'Hiveship (ground): a rooted hive that breeds an army.') },
  { id: 'mut.blightcrawler', faction: 'mutant', tier: 3, unit: 'mut.blightcrawler', spawnUnit: 'mut.blightcrawler.spawn', from: 'mut.spinner', ep: MUTANT_EP[2], branch: 'infect', desc: L('腐沼：留下黏液足跡，可以散成蟲群。', 'Blightcrawler: leaves a slime trail and can burst into a swarm.') },
  // ───── 仿生人 ─────
  { id: 'android.bulwark', faction: 'android', tier: 2, unit: 'android.bulwark', ep: ANDROID_EP, desc: L('壁壘型：重裝砲台底盤，生命與火力換速度。', 'Bulwark: a siege chassis trading speed for armor and firepower.') },
  { id: 'android.gale', faction: 'android', tier: 2, unit: 'android.gale', ep: ANDROID_EP, desc: L('疾風型：輕量高速底盤，閃避與衝擊波。', 'Gale: a light fast chassis with dodges and shockwaves.') },
  { id: 'android.pengu', faction: 'android', tier: 2, unit: 'android.pengu', ep: ANDROID_EP, requires: 'penguinPlush', desc: L('企鵝型：……它就是一隻企鵝。', 'Pengu: …it is a penguin.') },
]

regForms(FORM_LIST)

/** 變種人第一階從人形選擇 */
export function evolveChoices(faction: 'xeno' | 'mutant' | 'android', current: string | null, ep: number, extra: { hasPenguin?: boolean } = {}): string[] {
  return FORM_LIST.filter((f) => {
    if (f.faction !== faction) return false
    if (f.requires === 'penguinPlush' && !extra.hasPenguin) return false
    if (faction === 'android') return !current?.startsWith('android.') && ep >= f.ep
    if (faction === 'mutant' && f.tier === 1) return !current && ep >= f.ep
    return f.from === current && ep >= f.ep
  }).map((f) => f.id)
}
