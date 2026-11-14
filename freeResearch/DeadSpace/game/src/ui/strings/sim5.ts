// 介面文字（修正輪 S2：sim 端）：門禁紀錄的「未識別」剪影（隱形中的單位經過）、反物質打擊的死因、
// 化身中替人寄放道具的提示、停靠後鎖住控制台的提示。道具名稱兩種寫法都送（shared/sysArgs.ts）：zh 取 {nz}、en 取 {ne}。
// sim 端以 `@key|k=v` 送出；用 addStrings 在載入時註冊，App.tsx 有 `import './strings/sim5'`。
import { addStrings } from '../i18n'

export const SIM5_ZH: Record<string, string> = {
  // 門禁紀錄：隱形中的單位照樣會讓門打開，但看不出是什麼
  'door.sil.unknown': '未識別',
  // 死因：天守的反物質打擊（施放的站在命中前被毀也一樣）
  'death.cause.atm': '死因：所在的站被反物質打擊摧毀',
  'death.hit.atm': '先前受傷：反物質打擊（{dmg} 點）',
  // 化身中收到別人交來的東西、自己的背包卻滿了：先寄放，有空位時自動放入（只有偽裝者本人收到）
  'item.heldForYou': '背包已滿：{nz}先替你收著，有空位時自動放入',
  // 停靠時鎖住駕駛者所站的控制台（只有駕駛本人收到）
  'space.dockedLocked': '已停靠。要再發射，請先離開控制台再站上去。',
}

export const SIM5_EN: Record<string, string> = {
  'door.sil.unknown': 'unidentified',
  'death.cause.atm': 'Cause of death: your station was destroyed by an antimatter strike',
  'death.hit.atm': 'Earlier damage: antimatter strike ({dmg})',
  'item.heldForYou': 'Inventory full: holding {ne} for you; it goes in once a slot frees up',
  'space.dockedLocked': 'Docked. To launch again, step off the console and back on.',
}

addStrings(SIM5_ZH, SIM5_EN)
