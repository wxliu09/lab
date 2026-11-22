import { addStrings } from '../i18n'

// 第 7 輪（視聽與手感）HUD：觀戰列、隱藏介面、頭像、拒絕閃爍、拖曳丟棄
export const VIS7_ZH: Record<string, string> = {
  // 觀戰細列（取代原本整片的「觀戰中」頭像面板）
  'vis7.spec.live': '觀戰中',
  'vis7.spec.hint': '左鍵點選單位查看狀態',
  'vis7.follow': '自動跟隨戰鬥',
  'vis7.follow.tip': '鏡頭自動移到最近發生戰鬥的地方。點或拖曳小地圖就停止跟隨、恢復自由鏡頭。',
  'vis7.hide': '隱藏介面',
  'vis7.hide.tip': '只留下遊戲畫面（截圖、實況用）；名字與地上的標記照常顯示。再按一次 {k} 恢復。',
  'vis7.hudHint': '按 {k} 顯示介面',
  // 右上的站點清單（可收成小標籤）
  'vis7.list.tab': '觀戰：{place}',
  'vis7.list.fold': '收起站點清單',
  'vis7.list.unfold': '展開站點清單（切換要觀看的站或太空）',
  // 背包拖曳：放開時會發生什麼
  'vis7.drag.swap': '放開：交換位置',
  'vis7.drag.give': '放開：交給 {name}',
  'vis7.drag.drop': '放開：丟在地上（腳邊）',
  'vis7.drag.cancel': '放開：取消',
  'vis7.drag.no': '放開：不能給 — {why}',
  'vis7.drag.idle': '放到另一格＝交換位置；放到人身上＝交給他；放到地上＝丟掉；放回原處取消',
  'vis7.tip.drag': '拖到另一格交換位置；拖到人身上交給他；拖到地上丟掉',
}

export const VIS7_EN: Record<string, string> = {
  'vis7.spec.live': 'Spectating',
  'vis7.spec.hint': 'Left-click a unit to see its status',
  'vis7.follow': 'Follow the action',
  'vis7.follow.tip':
    'The camera moves to the latest fight. Clicking or dragging the minimap stops following and frees the camera.',
  'vis7.hide': 'Hide HUD',
  'vis7.hide.tip':
    'Leaves only the game view, for screenshots and streams. Names and ground markers stay. Press {k} again to bring the HUD back.',
  'vis7.hudHint': 'Press {k} to show the HUD',
  'vis7.list.tab': 'Watching: {place}',
  'vis7.list.fold': 'Collapse the station list',
  'vis7.list.unfold': 'Expand the station list (switch stations or space)',
  'vis7.drag.swap': 'Release: swap slots',
  'vis7.drag.give': 'Release: hand it to {name}',
  'vis7.drag.drop': 'Release: drop it at your feet',
  'vis7.drag.cancel': 'Release: cancel',
  'vis7.drag.no': 'Release: can’t give — {why}',
  'vis7.drag.idle':
    'Drop on another slot to swap, on someone to hand it over, or on the ground to drop it. Drop it back to cancel.',
  'vis7.tip.drag':
    'Drag to another slot to swap, onto someone to hand it over, or onto the ground to drop it',
}

addStrings(VIS7_ZH, VIS7_EN)
