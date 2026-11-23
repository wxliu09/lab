// 介面文字（第 9 輪上架前總評的修正：觀戰、附身、鏡頭與結算）
// sim 不知道玩家的語言，地名兩種寫法都送（shared/sysArgs.ts）：zh 字串取 {sz}／{rz}，en 字串取 {se}／{re}
import { addStrings } from '../i18n'

export const FIX9S_ZH: Record<string, string> = {
  // -slug 附身成功（creatures.ts possessSlugling；{rz} 是「的＋房間名」，不在房間裡時是空字串）
  'fix9s.slug.ok': '附身成功：你的蛞蝓仔在{sz}{rz}。畫面已經切過去；右鍵移動牠，按空白鍵把鏡頭帶回牠身上。',
}

export const FIX9S_EN: Record<string, string> = {
  // {re} 是「, 房間名」，不在房間裡時是空字串
  'fix9s.slug.ok': 'Possessed: your slugling is in {se}{re}. The view has moved there; right-click to move it, and Space brings the camera back to it.',
}

addStrings(FIX9S_ZH, FIX9S_EN)
