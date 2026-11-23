import { addStrings } from '../i18n'

// 第 8 輪：AI 的閒話與喊話（src/sim/ai/bots.ts chatter）。人類方與偽裝中的異類說一樣的話，內容不透露身分。
// 句數要和 bots.ts 的 HI_N／HIT_N／ALIBI_N／MONSTER_N 一致（tests/unit/r8a-ai.test.ts 檢查）

export const AI8_ZH: Record<string, string> = {
  'ai8.bot.hi.1': '大家好，我先去看看補給。',
  'ai8.bot.hi.2': '有人要一起走嗎？落單最危險。',
  'ai8.bot.hi.3': '保持警覺，看到怪事就喊。',
  'ai8.bot.hi.4': '基因檢測器一上架，我就去驗血。',
  'ai8.bot.hi.5': '嗨。這次大家都是乾淨的吧？',
  'ai8.bot.hit.1': '{name}，你在打我？住手！',
  'ai8.bot.hit.2': '別開槍，{name}，是我！',
  'ai8.bot.hit.3': '{name} 一直在打我，誰來幫個忙！',
  'ai8.bot.hit.4': '{name} 冷靜點，我不是怪物！',
  'ai8.bot.alibi.1': '不是我！我是乾淨的。',
  'ai8.bot.alibi.2': '別亂說，拿檢測器來驗我啊。',
  'ai8.bot.alibi.3': '我一直跟大家在一起，怎麼會是我？',
  'ai8.bot.alibi.4': '冤枉啊，你的樣本裡一定是別人有問題。',
  'ai8.bot.monster.1': '這裡有怪物！小心！',
  'ai8.bot.monster.2': '有東西在這附近，不是人！',
  'ai8.bot.monster.3': '怪物！快來幫忙！',
  'ai8.bot.siege': '無人機群快把這個站打爛了，我先撤！',
  'ai8.bot.parasite': '我好像被寄生了，去拿抗體包！',
}

export const AI8_EN: Record<string, string> = {
  'ai8.bot.hi.1': 'Hi all. Checking the supplies first.',
  'ai8.bot.hi.2': 'Anyone want to stick together? Going solo is how you die.',
  'ai8.bot.hi.3': 'Stay sharp. Shout if you see anything weird.',
  'ai8.bot.hi.4': 'I’ll start testing as soon as the gene samplers are in.',
  'ai8.bot.hi.5': 'Hey. We’re all clean this time, right?',
  'ai8.bot.hit.1': '{name}, you’re shooting me? Stop!',
  'ai8.bot.hit.2': 'Hold your fire, {name}, it’s me!',
  'ai8.bot.hit.3': '{name} keeps shooting me. Help!',
  'ai8.bot.hit.4': 'Calm down, {name}, I’m not a monster!',
  'ai8.bot.alibi.1': 'It’s not me! I’m clean.',
  'ai8.bot.alibi.2': 'Wrong person. Bring a sampler and test me.',
  'ai8.bot.alibi.3': 'I’ve been with people the whole time. How could it be me?',
  'ai8.bot.alibi.4': 'You’ve got it wrong. Someone else in your sample is the problem.',
  'ai8.bot.monster.1': 'Monster here! Watch out!',
  'ai8.bot.monster.2': 'Something’s here, and it’s not human!',
  'ai8.bot.monster.3': 'Monster! I need backup!',
  'ai8.bot.siege': 'The drones are tearing this station apart. I’m getting out!',
  'ai8.bot.parasite': 'I think something got inside me. Getting an antibody kit!',
}

addStrings(AI8_ZH, AI8_EN)
