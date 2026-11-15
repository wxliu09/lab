// 介面文字（修正輪 A：sim 端，新手試玩回饋）。sim 端以 `@key|k=v` 送出；用 addStrings 在載入時註冊，App.tsx 有 `import './strings/sim6'`。
// - 死因裡的名字改用 {name}：client 依介面語言換掉職業前綴、晉升頭銜、管家後綴、預設名字（ui/names.ts），
//   原本 ux2.ts 的 {n} 版本會原樣顯示「Captain BOT-B」。這裡覆寫同一組 key（本檔在 ux2 之後註冊）。
// - 救生艙被擊毀的死因寫出攻擊者（death.cause.pod.*；沒有攻擊者時照舊用 death.cause.vacuum）。
// - 監控掃描的文字結果、王牌飛行員的戰機位置。
// 雙語參數（shared/sysArgs.ts）：zh 字串取 {nz}／{sz}／{rz}，en 字串取 {ne}／{se}／{re}；{uz}／{ue} 是單位名稱。
// 第 2 輪（人類玩家視角審查，sim 端）：
// - 監控掃描只掃到自己時怎麼去女帝號（space.alone*：{sz} 這座站、{nz} 女帝號、{pz} 救生艙裝置所在的房間、{hz} 停泊船所在的房間）
// - 救生艙抵達、被寄生的說明（只給本人）、抽血抽不到的兩種原因、通訊病毒換好後的新名字、末日期間豪勇號挨隕擊
import { addStrings } from '../i18n'

export const SIM6_ZH: Record<string, string> = {
  'move.noPath': '找不到路：被關著的門或障礙擋住了。',
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
  // ───── 第 2 輪 ─────
  // 監控掃描只掃到自己（每人每站一次）
  'space.alone': '監控掃描只找到你自己：{sz}上沒有別人。想找人就去{nz}：那裡的出生點最多，驗血用的 GIT 檢測儀也在{nz}的驗血區。',
  'space.aloneNoGit': '監控掃描只找到你自己：{sz}上沒有別人。想找人就去{nz}：那裡的出生點最多。',
  'space.aloneRoute.pod': '去{nz}的方法：到{pz}的救生艙裝置領「救生艙憑證」，原地站著別動、別受傷 4 秒就會搭救生艙離站；接著對{nz}施放「設定航線」，救生艙會自己飛過去（每人 100 秒只能搭一次）。',
  'space.aloneRoute.ship': '去{nz}的方法：右鍵點{hz}上停泊的船登船，站上船艙裡的控制台，10 秒後發射；開到{nz}旁邊施放「停靠」，停好後走到船艙的艙門下船。',
  'space.aloneRoute.both':
    '去{nz}的方法：到{pz}的救生艙裝置領「救生艙憑證」，原地站著別動、別受傷 4 秒就會搭救生艙離站；接著對{nz}施放「設定航線」，救生艙會自己飛過去（每人 100 秒只能搭一次）。或者右鍵點{hz}上停泊的船登船，站上船艙裡的控制台，10 秒後發射；開到{nz}旁邊施放「停靠」，停好後走到船艙的艙門下船。',
  'space.aloneRoute.none': '{sz}現在沒有救生艙裝置，也沒有停泊的船可以搭。',
  'space.podArrived': '救生艙已抵達{nz}。',
  // 被寄生（只給受害者本人，每次感染一次）：會不會轉化依本人的身分
  'infect.parasite':
    '你被異形寄生了：幼體在你體內，每秒讓你失血約 4.4 點（比自然回血快），不會自己消失；帶著它死掉的話，不管是誰下的手，你都會變成異形的眷屬。對策：盡快使用抗體包（醫療補給販賣機有賣）把它壓成休眠，46 秒後清除；休眠期間死掉仍會轉化。',
  'infect.parasiteNoTurn':
    '你被異形寄生了：幼體在你體內，每秒讓你失血約 4.4 點（比自然回血快），不會自己消失。以你的身分，死時不會變成異形的眷屬，但放著不管會一直失血。用抗體包（醫療補給販賣機有賣）可以把它壓成休眠，46 秒後清除。',
  // 抽血抽不到（「已經抽過某人」在 events.ts 的 git.msg.already）
  'git.msg.alreadySelf': '你已經抽過自己的血了：同一個人只能抽一次，換一個人抽。',
  'git.msg.notPerson': '抽不到血：只能對玩家角色抽血（NPC 船員、生物、無人機、設施、地上的東西都不行）。',
  // 通訊病毒換好名字後私訊本人（name 由 client 依語言換掉職業前綴）
  'event.virusYou': '通訊病毒改寫了識別資料：你現在顯示的名字是「{name}」，顏色也可能換了。',
  // 上方大公告的標題句（全文較長的公告：大公告只顯示標題，全文在聊天紀錄）
  'st.bravadoImpact.title': '隕擊正在撕裂降落中的豪勇號',
  'st.bravadoImpactDoom.title': '隕擊正在撕裂豪勇號：別升空，撤到地表',
  // 末日期間降落中的豪勇號挨隕擊（平常的版本在 sim3.ts 的 st.bravadoImpact）
  'st.bravadoImpactDoom':
    '每次隕擊的大氣擾動都在撕裂降落中的豪勇號船體：估計再撞擊 {n} 次就會解體，艦內的人會全部陪葬。末日期間別升空（太空只會更危險），艦內的人請從降落艙的傳送門撤到地表，避開紅色警戒圈與輻射區。',
}

export const SIM6_EN: Record<string, string> = {
  'move.noPath': 'No path there: a closed door or an obstacle is in the way.',
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
  // ───── Round 2 ─────
  'space.alone': 'The sweep found only you: nobody else is aboard {se}. To find people, head to {ne}: it has the most spawn points, and the GIT tester for blood tests is in its Gene Lab.',
  'space.aloneNoGit': 'The sweep found only you: nobody else is aboard {se}. To find people, head to {ne}: it has the most spawn points.',
  'space.aloneRoute.pod':
    'Getting to {ne}: take an Escape Pod Pass from the Escape Pod Device in {pe}, then hold still without getting hurt for 4 s and a pod launches you off the station. Cast Set Trajectory on {ne} and the pod flies there on its own (once per 100 s per person).',
  'space.aloneRoute.ship':
    'Getting to {ne}: right-click a craft docked in {he} to board it, then stand on the cabin console and it launches after 10 s. Fly next to {ne}, cast Dock, and once docked walk to the cabin hatch to get off.',
  'space.aloneRoute.both':
    'Getting to {ne}: take an Escape Pod Pass from the Escape Pod Device in {pe}, then hold still without getting hurt for 4 s and a pod launches you off the station. Cast Set Trajectory on {ne} and the pod flies there on its own (once per 100 s per person). Or right-click a craft docked in {he} to board it, stand on the cabin console and it launches after 10 s; fly next to {ne}, cast Dock, and once docked walk to the cabin hatch to get off.',
  'space.aloneRoute.none': '{se} has no escape pod device and no docked craft right now.',
  'space.podArrived': 'Your escape pod has arrived at {ne}.',
  'infect.parasite':
    'A xeno has implanted a parasite in you: it drains about 4.4 health per second (faster than you regenerate) and will not go away on its own. If you die with it inside, no matter who kills you, you rise as a xeno spawn. Counter: use an Antibody Kit (sold at Medical Supplies) as soon as you can to force it dormant; it clears after 46 s, but dying before then still turns you.',
  'infect.parasiteNoTurn':
    'A xeno has implanted a parasite in you: it drains about 4.4 health per second (faster than you regenerate) and will not go away on its own. Given who you are, dying will not turn you into a xeno spawn, but left alone it keeps draining you. An Antibody Kit (sold at Medical Supplies) forces it dormant; it clears after 46 s.',
  'git.msg.alreadySelf': 'You have already drawn your own blood: each person can only be sampled once. Try someone else.',
  'git.msg.notPerson': "Can't draw blood from that: only player characters can be sampled (not NPC crew, creatures, drones, facilities or items on the floor).",
  'event.virusYou': 'The comm virus rewrote the identity records: you now appear as "{name}", and your color may have changed too.',
  'st.bravadoImpact.title': 'Impacts are tearing the landed Bravado apart',
  'st.bravadoImpactDoom.title': 'Bravado breaking up: take the portal to the surface',
  'st.bravadoImpactDoom':
    "The turbulence from every impact is tearing at the landed Bravado's hull: about {n} more impacts and it breaks apart, killing everyone aboard. Do not lift off during the apocalypse (space is only getting worse); anyone aboard should take the landing portal in the Drop Bay down to the surface, away from red warning circles and fallout zones.",
  'st.bravadoImpactDoom.one':
    "The turbulence from every impact is tearing at the landed Bravado's hull: one more impact and it breaks apart, killing everyone aboard. Do not lift off during the apocalypse (space is only getting worse); anyone aboard should take the landing portal in the Drop Bay down to the surface, away from red warning circles and fallout zones.",
}

addStrings(SIM6_ZH, SIM6_EN)
