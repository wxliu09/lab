// 介面文字（修正輪 A：sim 端，新手試玩回饋）。sim 端以 `@key|k=v` 送出；用 addStrings 在載入時註冊，App.tsx 有 `import './strings/sim6'`。
// - 死因裡的名字改用 {name}：client 依介面語言換掉職業前綴、晉升頭銜、管家後綴、預設名字（ui/names.ts），
//   原本 ux2.ts 的 {n} 版本會原樣顯示「Captain BOT-B」。這裡覆寫同一組 key（本檔在 ux2 之後註冊）。
// - 救生艙被擊毀的死因寫出攻擊者（death.cause.pod.*；沒有攻擊者時照舊用 death.cause.vacuum）。
// - 監控掃描的文字結果、王牌飛行員的戰機位置。
// 雙語參數（shared/sysArgs.ts）：zh 字串取 {nz}／{sz}／{rz}，en 字串取 {ne}／{se}／{re}；{uz}／{ue} 是單位名稱。
import { addStrings } from '../i18n'

export const SIM6_ZH: Record<string, string> = {
  // 死因（覆寫 ux2.ts：{n} → {name}）
  'death.cause.named': '死因：被 {name} 擊殺',
  'death.cause.namedAs': '死因：被 {name}（{uz}）擊殺',
  'death.cause.owned': '死因：被 {name} 的{uz}擊殺',
  'death.hit.named': '先前受傷：{name}（{dmg} 點）',
  'death.hit.namedAs': '先前受傷：{name}（{uz}，{dmg} 點）',
  'death.hit.owned': '先前受傷：{name} 的{uz}（{dmg} 點）',
  // 救生艙被某個東西擊毀（用死者當下看到的樣子描述）
  'death.cause.pod.named': '死因：救生艙被 {name} 擊毀',
  'death.cause.pod.namedAs': '死因：救生艙被 {name}（{uz}）擊毀',
  'death.cause.pod.owned': '死因：救生艙被 {name} 的{uz}擊毀',
  'death.cause.pod.anon': '死因：救生艙被一隻匿名的{uz}擊毀',
  'death.cause.pod.unit': '死因：救生艙被{uz}擊毀',
  'death.cause.pod.unseen': '死因：救生艙被看不見的攻擊者擊毀',
  // 監控掃描（駕駛站點時看的是太空畫面，另外給文字結果；內容和小地圖上的掃描標記相同）
  'space.sweepResult': '監控掃描（{sz}）：{rz}',
  'space.sweepNone': '監控掃描（{sz}）：沒有偵測到任何人。',
  // 王牌飛行員：專屬戰機不在機庫
  'space.aceFighter': '你的專屬戰機「槍騎級」停在{nz}外的太空中（不在機庫裡）。開一艘停泊的船出去，靠近後對它施放「強行登艦」，再走過艙門就能進入它的座艙駕駛。',
}

export const SIM6_EN: Record<string, string> = {
  'death.cause.named': 'Cause of death: killed by {name}',
  'death.cause.namedAs': 'Cause of death: killed by {name} ({ue})',
  'death.cause.owned': "Cause of death: killed by {name}'s {ue}",
  'death.hit.named': 'Earlier damage: {name} ({dmg})',
  'death.hit.namedAs': 'Earlier damage: {name} ({ue}, {dmg})',
  'death.hit.owned': "Earlier damage: {name}'s {ue} ({dmg})",
  'death.cause.pod.named': 'Cause of death: your escape pod was destroyed by {name}',
  'death.cause.pod.namedAs': 'Cause of death: your escape pod was destroyed by {name} ({ue})',
  'death.cause.pod.owned': "Cause of death: your escape pod was destroyed by {name}'s {ue}",
  'death.cause.pod.anon': 'Cause of death: your escape pod was destroyed by an anonymous {ue}',
  'death.cause.pod.unit': 'Cause of death: your escape pod was destroyed by {ue}',
  'death.cause.pod.unseen': 'Cause of death: your escape pod was destroyed by an attacker you could not see',
  'space.sweepResult': 'Surveillance sweep ({se}): {re}',
  'space.sweepNone': 'Surveillance sweep ({se}): nobody detected.',
  'space.aceFighter':
    'Your personal fighter, the Lancer, is parked in space just outside {ne} (not in the hangar). Fly a docked craft out to it, cast Board on it, then walk through the airlock to reach its cockpit.',
}

addStrings(SIM6_ZH, SIM6_EN)
